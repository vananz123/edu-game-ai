/**
 * Smoke-runs the *DOM* layer of the first-run wizard.
 *
 * `renderer/features/setup-wizard.ts` is `@ts-nocheck` global-script code, so a
 * typo such as calling a global defined in a later `<script>`, or referencing
 * `SetupWizardModel` after it was renamed, is invisible to `tsc`. It would
 * surface as a blank modal the first time a teacher installs the app.
 *
 * This test executes the real built files against a tiny DOM shim and drives the
 * public functions the way `bootstrap.ts` and `settings.ts` do:
 *   - `openSetupWizard({ probe: true })` on a finished install must stay closed;
 *   - on a fresh install it must open, run preflight and render the screen;
 *   - "Để sau" must close it and keep the gate closed for the session;
 *   - a progress event must update the bar without throwing;
 *   - every button must carry `data-setup-action` and no inline handler may be
 *     emitted (the app's CSP is `script-src 'self'`).
 *
 * The shim is deliberately minimal (no layout, no real event dispatch); it
 * proves the code runs and renders, not that it looks right.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const RENDERER = path.join(__dirname, '..', '..', 'src', 'renderer');

function createElement() {
  return {
    innerHTML: '',
    textContent: '',
    dataset: {},
    disabled: false,
    isConnected: true,
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; }
  };
}

/** Records what the wizard rendered so assertions can inspect it. */
const pageContent = createElement();
const toastEl = createElement();

/**
 * A tiny stand-in for the live progress subtree.
 *
 * `updateSetupProgressInPlace()` is a no-op unless the modal already contains a
 * matching `[data-setup-screen]` and `[data-setup-live="progress"]`, so the shim
 * says "the previous render produced this" while `liveScreen`/`liveProgress`
 * are set, and the writes it performs are recorded below.
 */
let renderedHtml = '';
let liveScreen: string | null = null;

let liveProgress = false;
const liveWrites = { ariaValueNow: [] as string[], width: [] as string[], label: [] as string[], percent: [] as string[], detail: [] as string[] };
let fillElement: { style: Record<string, string> } | null = null;

function fakeNode(onSet: (value: string) => void, extra: Record<string, unknown> = {}) {
  let text = '';
  return {
    ...extra,
    get textContent() { return text; },
    set textContent(value: string) { text = value; onSet(value); }
  };
}

const modalRoot: Record<string, any> = createElement();
modalRoot.querySelector = (selector: string) => {
  if (selector === '[data-setup-screen]') {
    return liveScreen ? { getAttribute: () => liveScreen } : null;
  }
  if (selector === '[data-setup-live="progress"]') {
    if (!liveProgress) return null;
    fillElement = { style: {} };
    return {
      querySelector: (inner: string) => {
        if (inner === '[role="progressbar"]') return { setAttribute: (_n: string, v: string) => liveWrites.ariaValueNow.push(v) };
        if (inner === '.setup-progress-fill') return fillElement;
        if (inner === '[data-setup-live="label"]') return fakeNode(v => liveWrites.label.push(v));
        if (inner === '[data-setup-live="percent"]') return fakeNode(v => liveWrites.percent.push(v));
        if (inner === '[data-setup-live="detail"]') return fakeNode(v => liveWrites.detail.push(v));
        return null;
      }
    };
  }
  return null;
};

// Whatever `renderSetupWizard()` writes becomes the "current" DOM state.
Object.defineProperty(modalRoot, 'innerHTML', {
  get() { return renderedHtml; },
  set(value: string) {
    renderedHtml = value;
    const screen = /data-setup-screen="([^"]*)"/.exec(value);
    liveScreen = screen ? screen[1] : null;
    liveProgress = value.includes('data-setup-live="progress"');
  }
});

const document = {
  readyState: 'complete',
  // `renderSetupWizard()` toggles `html[data-setup-fullscreen]` to take the
  // window from the app shell while a run is pending.
  documentElement: {
    attributes: {} as Record<string, string>,
    setAttribute(name: string, value: string) { (this as any).attributes[name] = value; },
    removeAttribute(name: string) { delete (this as any).attributes[name]; },
    getAttribute(name: string) { return (this as any).attributes[name] ?? null; }
  },
  addEventListener() {},
  querySelector(selector: string) {
    if (selector === '#modalRoot') return modalRoot;
    if (selector === '#pageContent') return pageContent;
    if (selector === '#toast') return toastEl;
    return null;
  },
  querySelectorAll() { return []; }
};

/** Scripted IPC surface; each call is recorded so the flow can be asserted. */
const calls: string[] = [];
let setupStatus: Record<string, unknown> = { step: 'idle', complete: false, running: false };
let progressHandler: ((progress: unknown) => void) | null = null;

const eduGame = {
  getSetupStatus: async () => { calls.push('status'); return setupStatus; },
  preflightSetup: async (payload: unknown) => {
    calls.push(`preflight:${JSON.stringify(payload)}`);
    return {
      step: 'detecting',
      complete: false,
      running: false,
      plan: {
        runtime: { id: 'r', displayName: 'llama.cpp · CPU x64', downloadBytes: 1, installed: false, usedFallback: false },
        model: { id: 'qwen3.5-2b-q4_k_m', displayName: 'Qwen3.5 2B · Q4_K_M', downloadBytes: 1_280_835_840, installed: false },
        remainingBytes: 1_214_873_857,
        diskFreeBytes: 40 * 1024 ** 3,
        enoughDiskSpace: true
      }
    };
  },
  startSetup: async (payload: unknown) => {
    calls.push(`start:${JSON.stringify(payload)}`);
    return { step: 'complete', complete: true, running: false };
  },
  cancelSetup: async () => { calls.push('cancel'); return setupStatus; },
  onSetupProgress: (handler: (progress: unknown) => void) => {
    progressHandler = handler;
    return () => { progressHandler = null; };
  },
  getLocalAiModels: async () => {
    calls.push('local-models');
    return { models: [], machine: {} };
  }
};

const windowObject: Record<string, any> = { eduGame };
const sandbox: Record<string, any> = {
  console,
  document,
  window: windowObject,
  // Timers and frame scheduling, as the Electron renderer provides them. The
  // wizard coalesces progress onto `requestAnimationFrame` when it exists.
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
  // Globals shared between script tags in `index.html` (see `shared.ts`).
  state: { page: 'settings', localAiModels: [], localAiMachine: {}, db: { games: [], sessions: [] } },
  escapeHtml: (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]),
  render: () => { calls.push('render'); },
  navigate: (page: string) => { calls.push(`navigate:${page}`); },
  openLocalAiModal: () => { calls.push('openLocalAiModal'); },
  toast: () => {}
};
sandbox.globalThis = sandbox;
const context = vm.createContext(sandbox);

// `$` comes from `renderer/shared.js`, which `index.html` loads before the
// wizard. It is declared with `const`, so it only works in this realm if it is
// defined here rather than injected as a sandbox property.
vm.runInContext('const $ = selector => document.querySelector(selector);', context, { filename: 'shared-shim.js' });

function runFile(name: string) {
  const file = path.join(RENDERER, name);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

// Load order must match `index.html`: the model first, then the DOM layer.
runFile('setup-wizard-model.js');
runFile('features/setup-wizard.js');

const wizard = windowObject;
assert.equal(typeof wizard.openSetupWizard, 'function', 'the wizard must be reachable from window');
assert.equal(typeof wizard.setupWizardState, 'object', 'state must be exposed for the gate');

const flush = () => new Promise(resolve => setImmediate(resolve));

async function main() {
  // --- A finished install must not interrupt the teacher ------------------
  setupStatus = { step: 'complete', complete: true, running: false };
  assert.equal(await wizard.openSetupWizard({ probe: true }), false,
    'a completed setup must not open the wizard at launch');
  assert.equal(modalRoot.innerHTML, '', 'nothing is rendered for a finished install');

  // --- A fresh install opens, runs preflight, shows requirements ----------
  setupStatus = { step: 'idle', complete: false, running: false };
  assert.equal(await wizard.openSetupWizard({ probe: true }), true);
  await flush();
  assert.ok(calls.includes('preflight:{}'),
    'preflight must not pin a model: the backend picks one from the hardware');
  assert.match(modalRoot.innerHTML, /data-setup-screen="requirements"/,
    'the requirements screen is shown once preflight returns numbers');
  assert.match(modalRoot.innerHTML, /Qwen3\.5 2B/, 'the model name is displayed');
  assert.match(modalRoot.innerHTML, /Dung lượng còn trống/, 'free disk space is displayed');

  // The wizard must adopt the model the backend planned instead of keeping its
  // own pin: `start` has to ask for exactly what `preflight` showed the teacher.
  assert.equal(wizard.setupWizardState.modelId, 'qwen3.5-2b-q4_k_m',
    'the planned model id is adopted from the preflight response');

  // No inline handlers: the CSP is `script-src 'self'`.
  assert.ok(!/\son[a-z]+="/.test(modalRoot.innerHTML), 'no inline event handlers may be emitted');
  const actions = [...modalRoot.innerHTML.matchAll(/data-setup-action="([^"]+)"/g)].map(match => match[1]);
  assert.ok(actions.includes('start'), 'the start button is offered');
  assert.ok(actions.includes('skip-ai'), 'the teacher can always leave');
  assert.ok(!modalRoot.innerHTML.includes('<script'), 'escaped output only');

  // --- Setup takes the whole window, it is not a dialog over the app ------
  // A teacher who sees the dashboard behind the wizard tries to use it; setup
  // must own the screen until it is done.
  const html = document.documentElement;
  assert.equal(html.getAttribute('data-setup-fullscreen'), '1',
    'the app shell must be hidden while setup is pending');
  assert.match(modalRoot.innerHTML, /class="setup-fullscreen"/,
    'the wizard renders as a screen-sized page');
  assert.ok(!/class="modal-backdrop"/.test(modalRoot.innerHTML),
    'no modal backdrop may be drawn behind it');
  assert.ok(!/role="dialog"/.test(modalRoot.innerHTML),
    'a full-screen flow is not a dialog, so it must not claim to be one');
  assert.ok(!/aria-modal="true"/.test(modalRoot.innerHTML),
    'aria-modal would make screen readers ignore the rest of the window');
  assert.ok(modalRoot.innerHTML.includes('id="setupWizardTitle"'),
    'the heading stays addressable');

  // --- Progress events update the bar without throwing --------------------
  setupStatus = { step: 'installing-models', complete: false, running: true };
  wizard.setupWizardState.status = setupStatus;
  assert.ok(progressHandler, 'the wizard must subscribe to setup:progress');
  progressHandler!({
    step: 'installing-models',
    stage: 'model',
    itemId: 'm',
    receivedBytes: 25,
    totalBytes: 100,
    bytesPerSecond: 10,
    message: 'Đang tải model AI…'
  });
  // Progress is coalesced to the next frame, not drawn per event.
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.match(modalRoot.innerHTML, /data-setup-screen="downloading"/);
  assert.match(modalRoot.innerHTML, /aria-valuenow="25"/, 'the bar reflects the byte event');
  assert.match(modalRoot.innerHTML, /Đang tải model AI/, 'the step label is shown');
  // While downloading there is no safe "close", only "cancel".
  assert.equal(
    [...modalRoot.innerHTML.matchAll(/data-setup-action="([^"]+)"/g)].map(match => match[1]).join(','),
    'cancel'
  );

  // --- A byte flood must not rebuild the modal ----------------------------
  // Regression: `onProgress` fires once per network chunk (hundreds per second
  // for 1.1 GB) and every event used to re-render the whole modal, which made
  // it judder during download. Only the numbers may change per event.
  wizard.setupWizardState.status = { step: 'installing-models', complete: false, running: true };
  wizard.setupWizardState.progress = undefined;
  await wizard.openSetupWizard({ probe: false });
  await new Promise(resolve => setTimeout(resolve, 5));
  // Put the wizard on the downloading screen with one event.
  progressHandler!({ step: 'installing-models', stage: 'model', itemId: 'm', receivedBytes: 1, totalBytes: 1000, message: 'Đang tải model AI…' });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.match(modalRoot.innerHTML, /data-setup-screen="downloading"/, 'downloading screen is up');
  assert.ok(modalRoot.innerHTML.includes('data-setup-live="progress"'), 'the live area is marked in the DOM');

  const rendersBefore = wizard.setupWizardRenderCount();
  liveWrites.ariaValueNow.length = 0;
  liveWrites.percent.length = 0;
  let lastFillWidth: string | undefined;
  for (let received = 2; received <= 400; received += 1) {
    progressHandler!({ step: 'installing-models', stage: 'model', itemId: 'm', receivedBytes: received, totalBytes: 1000, message: 'Đang tải model AI…' });
    await new Promise(resolve => setTimeout(resolve, 1));
    if (fillElement) lastFillWidth = fillElement.style.width;
  }
  const rendersAfter = wizard.setupWizardRenderCount();
  const renderedTimes = rendersAfter - rendersBefore;
  // 399 events over ~400 ms: a per-event render would be ~399 rebuilds.
  assert.ok(renderedTimes < 60,
    `a chunk flood must not rebuild the modal per event (rebuilt ${renderedTimes} times for 399 events)`);
  assert.equal(liveWrites.ariaValueNow.at(-1), '40', 'the real DOM receives the latest percentage');
  assert.equal(liveWrites.percent.at(-1), '40%', 'the visible percentage text is updated in place');
  assert.equal(lastFillWidth, '40%', 'the bar width is patched, not re-parsed');
  assert.match(modalRoot.innerHTML, /Đang tải model AI/, 'the modal itself was not disturbed');

  // --- "Để sau" closes and keeps the gate closed --------------------------
  wizard.setupWizardState.status = { step: 'idle', complete: false, running: false };
  wizard.setupWizardState.dismissed = false;
  // A finished run hands the window back: the "xong" screen explains the result
  // and the teacher must recognise the app behind it.
  wizard.setupWizardState.status = { step: 'complete', complete: true, running: false };
  wizard.renderSetupWizard();
  assert.match(modalRoot.innerHTML, /data-setup-screen="complete"/);
  assert.equal(html.getAttribute('data-setup-fullscreen'), null,
    'a finished setup must give the app shell back');
  wizard.setupWizardState.status = { step: 'idle', complete: false, running: false };
  wizard.renderSetupWizard();
  assert.equal(html.getAttribute('data-setup-fullscreen'), '1',
    'a pending setup must take the window again');

  wizard.closeSetupWizard('skip-ai');
  assert.equal(modalRoot.innerHTML, '', 'closing clears the modal');
  assert.equal(html.getAttribute('data-setup-fullscreen'), null,
    'closing the wizard must never leave the app shell hidden');
  assert.equal(progressHandler, null, 'the progress listener is released on close');
  assert.equal(await wizard.openSetupWizard({ probe: true }), false,
    'after "Để sau" the gate must not reopen in the same session');

  // --- An explicit open (Settings button) still works after dismissing ----
  assert.equal(await wizard.openSetupWizard({ probe: false }), true,
    'Settings must be able to reopen the wizard after "Để sau"');

  // --- A first-run probe never reacts to prior in-memory state ------------
  // `bootstrap.ts` calls `probe: true` once per launch. It must depend only on
  // what is on disk, so a stale in-memory error from an earlier attempt cannot
  // make the app open at startup with a failure the teacher never caused.
  wizard.setupWizardState.error = { message: 'lỗi cũ' };
  wizard.setupWizardState.status = { step: 'idle', complete: false, running: false };
  // A new launch: "Để sau" from the previous session no longer applies.
  wizard.setupWizardState.dismissed = false;
  assert.equal(await wizard.openSetupWizard({ probe: true }), true);
  await flush();
  assert.ok(!modalRoot.innerHTML.includes('lỗi cũ'),
    'a probe must not replay an error left in memory by a previous attempt');
  assert.match(modalRoot.innerHTML, /data-setup-screen="requirements"/);

  // --- The wizard installs what the backend recommended, not a fixed model --
  // preflight decides from CPU/RAM (2B on 8 GB, 4B on 12 GB and above). The
  // wizard must show and then request that same model; pinning 2B here is the
  // regression that made setup install a weaker model than Settings recommended.
  {
    wizard.setupWizardState.dismissed = false;
    delete windowObject.eduGame.getSetupStatus;
    windowObject.eduGame.getSetupStatus = async () => ({ step: 'idle', complete: false, running: false });
    windowObject.eduGame.preflightSetup = async (payload: unknown) => {
      calls.push(`preflight:${JSON.stringify(payload)}`);
      return {
        step: 'detecting',
        complete: false,
        running: false,
        plan: {
          runtime: { id: 'r', displayName: 'llama.cpp · CPU x64', downloadBytes: 1, installed: false, usedFallback: false },
          model: {
            id: 'qwen3.5-4b-q4_k_m',
            displayName: 'Qwen3.5 4B · Q4_K_M',
            downloadBytes: 2_740_937_888,
            installed: false
          },
          remainingBytes: 2_583_221_409,
          diskFreeBytes: 40 * 1024 ** 3,
          enoughDiskSpace: true
        }
      };
    };

    const opened = await wizard.openSetupWizard({ probe: false });
    assert.equal(opened, true, 'the wizard still opens');
    await flush();
    // The model the *backend* recommended is what gets shown and requested. The
    // renderer-side fallback (`SETUP_DEFAULT_MODEL_ID`) is 2B, and it must not
    // leak into the screen or the request when preflight answered successfully.
    assert.equal(wizard.setupWizardState.modelId, 'qwen3.5-4b-q4_k_m',
      'the wizard must adopt the recommended 4B model instead of its 2B fallback');
    assert.match(modalRoot.innerHTML, /Qwen3\.5 4B/, 'the recommended model is what the teacher sees');
    assert.ok(!/Qwen3\.5 2B/.test(modalRoot.innerHTML),
      'a 4B recommendation must not be rendered alongside the 2B fallback');
  }

  // --- Without a preflight answer nothing is pinned ------------------------
  // With no plan the wizard keeps no model id at all: `setup-ipc` then applies
  // `recommendLocalModelId()` on the backend, and a failed recommendation there
  // ends at `QWEN_LOCAL_MODELS[0]` (2B). The renderer must not invent a heavier
  // pin, and must never name Gemma 4 E2B, which first-run setup may not choose.
  {
    wizard.setupWizardState.dismissed = false;
    // A fresh launch: nothing pinned from a previous preflight answer.
    wizard.setupWizardState.modelId = null;
    delete windowObject.eduGame.getSetupStatus;
    windowObject.eduGame.getSetupStatus = async () => ({ step: 'idle', complete: false, running: false });
    windowObject.eduGame.preflightSetup = async () => ({ step: 'detecting', complete: false, running: false });
    const degradedOpen = await wizard.openSetupWizard({ probe: false });
    assert.equal(degradedOpen, true, 'the wizard still opens without a plan');
    await flush();
    assert.equal(wizard.setupWizardState.modelId, null,
      'no plan means no pinned model: the backend recommendation decides');
    assert.ok(!/Gemma/.test(modalRoot.innerHTML),
      'first-run setup must never present Gemma 4 E2B as the model it will install');
    assert.ok(!/Qwen3\.5 4B/.test(modalRoot.innerHTML),
      'and must not show a 4B model it was never told about');
  }

  // --- A broken setup channel degrades to "stay closed" -------------------
  // An older build without `setup:*` handlers rejects every call. The gate must
  // then do nothing at all: the app still opens, saved games still play.
  windowObject.eduGame.getSetupStatus = async () => { throw new Error('No handler registered for setup:status'); };
  const probeOpened = await wizard.openSetupWizard({ probe: true });
  assert.equal(probeOpened, false, 'a missing setup channel must not open the wizard');
  assert.equal(modalRoot.innerHTML, '', 'and must not leave a half-rendered modal');

  // An explicit open from Settings still reports the reason to the teacher.
  // (The gate returned `false` and left the wizard closed, so this is opened the
  // same way the Settings button does.)
  await wizard.openSetupWizard({ probe: false });
  await flush();
  assert.match(modalRoot.innerHTML, /No handler registered/,
    'a failing IPC call must surface the reason instead of an empty modal');
  assert.match(modalRoot.innerHTML, /data-setup-screen="error"/);

  console.log('setup wizard UI tests passed');
}

void main().then(
  () => process.exit(0),
  error => {
    console.error(error);
    process.exit(1);
  }
);
