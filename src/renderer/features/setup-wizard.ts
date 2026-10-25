// @ts-nocheck -- renderer UI logic; the decisions live in typed
// `renderer/setup-wizard-model.ts`, which is covered by
// `tests/setup-wizard-model.test.ts`. This file only draws them.
/**
 * First-run AI setup wizard, §7 (docs/archive/specs/update_AI_plan_5.txt).
 *
 * Shared by the first-run gate in `core/bootstrap.ts` and the "Cài đặt lại AI"
 * button in `pages/settings.ts`, so there is exactly one implementation of the
 * flow. Everything the teacher sees is decided by `resolveWizardView()`; this
 * file maps that view onto the app's existing `.modal` / `.btn` / `.info-box`
 * styling and talks to `window.eduGame`.
 *
 * Guarantees:
 *   - no inline event handlers (the app has a strict CSP: `script-src 'self'`);
 *   - never sends a path, URL or executable to the main process — only a model
 *     id, which `setup-ipc.ts` re-validates against the verified catalog;
 *   - subscribes to `setup:progress` exactly once and always unsubscribes, so a
 *     closed wizard leaves no listener behind;
 *   - never polls while the modal is closed, so an idle app stays idle.
 */
const setupWizardState = {
  open: false,
  /**
   * Model to install. `null` means "let the backend recommend one": the wizard
   * must not pin a model before it knows the machine, or every teacher gets the
   * same (weakest) download regardless of their hardware.
   */
  modelId: null,
  status: undefined,
  progress: undefined,
  preflightPending: false,
  starting: false,
  error: null,
  busy: false,
  /** Set once the teacher chose "Để sau"; the first-run gate must not reopen. */
  dismissed: false,
  unsubscribeProgress: null
};

/** Where the teacher wants to go after closing the wizard. */
function setupWizardView() {
  return SetupWizardModel.resolveWizardView({
    status: setupWizardState.status,
    preflightPending: setupWizardState.preflightPending,
    starting: setupWizardState.starting,
    progress: setupWizardState.progress,
    error: setupWizardState.error || undefined
  });
}

function setupWizardTone(tone) {
  return ({
    neutral: 'setup-tone-neutral',
    progress: 'setup-tone-progress',
    success: 'setup-tone-success',
    danger: 'setup-tone-danger',
    warning: 'setup-tone-warning'
  })[tone] || 'setup-tone-neutral';
}

/** The 5-row checklist, so a teacher always sees where they are. */
function setupWizardChecklistHtml(steps) {
  const mark = { done: '✓', current: '•', pending: '○', failed: '!' };
  return `<ol class="setup-checklist">${steps.map(step => `<li class="setup-checklist-item" data-state="${escapeHtml(step.state)}">`
    + `<span class="setup-checklist-mark" aria-hidden="true">${mark[step.state] || '○'}</span>`
    + `<span>${escapeHtml(step.label)}</span></li>`).join('')}</ol>`;
}

function setupWizardRequirementsHtml(rows, showHints) {
  if (!rows.length) return '';
  return `<div class="local-ai-model-summary">${rows.map(row => `<div class="setup-req-row" data-ok="${row.ok ? '1' : '0'}">`
    + `<span class="setup-req-label">${escapeHtml(row.label)}</span>`
    + `<strong>${escapeHtml(row.value)}</strong>`
    + `${showHints && row.hint ? `<span class="field-hint">${escapeHtml(row.hint)}</span>` : ''}</div>`).join('')}</div>`;
}

/**
 * The progress bar is the only part of the modal that changes while a download
 * runs. It is marked with `data-setup-live` so `updateSetupProgressInPlace()`
 * can refresh it without rebuilding the modal (see the progress subscription).
 */
function setupWizardProgressHtml(view) {
  if (view.percent !== undefined) {
    return `<div data-setup-live="progress">`
      + `<div class="setup-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${view.percent}">`
      + `<div class="setup-progress-fill" style="width:${view.percent}%"></div></div>`
      + `<div class="setup-progress-meta"><span data-setup-live="label">${escapeHtml(view.stepLabel || '')}</span>`
      + `<strong data-setup-live="percent">${view.percent}%</strong></div>`
      + `${view.progressDetail ? `<div class="field-hint mt-[6px]" data-setup-live="detail">${escapeHtml(view.progressDetail)}</div>` : ''}`
      + `</div>`;
  }
  // Indeterminate work (detection, health check) has no percentage; showing a
  // static 0% bar would look frozen, so an animated stripe is used instead.
  if (view.stepLabel) {
    return `<div data-setup-live="progress">`
      + `<div class="setup-progress setup-progress-indeterminate"><div class="setup-progress-fill"></div></div>`
      + `<div class="setup-progress-meta"><span data-setup-live="label">${escapeHtml(view.stepLabel)}</span></div>`
      + `</div>`;
  }
  return '';
}

/**
 * True when two views differ in something *other* than the byte counter: the
 * screen, the headline, the checklist or the buttons. A byte event changes only
 * the percentage and the detail line, so it must not pay for a full re-render.
 */
function setupWizardStructureKey(view) {
  return JSON.stringify([
    view.screen,
    view.tone,
    view.eyebrow,
    view.title,
    view.message,
    view.steps,
    view.requirements,
    view.buttons,
    view.canSkip
  ]);
}

/** Depth of the re-entrant `renderSetupWizard()` calls made by a progress event. */
let setupWizardRendering = 0;
/** How many times the full modal was rebuilt; asserted by the UI test. */
let setupWizardRenderCount = 0;
/** Serialised structural key of what is currently in `#modalRoot`. */
let setupWizardStructure = '';
/** True while a coalesced progress draw is queued for the next frame. */
let setupWizardFramePending = false;

/**
 * Patches the live progress area in place.
 *
 * `ModelInstaller.install()` calls `onProgress` once per network chunk, which
 * for a 1.1 GB model is hundreds of events per second. Rebuilding
 * `#modalRoot.innerHTML` on each one re-parsed the whole modal, restarted the
 * indeterminate stripe and reset focus — the modal visibly juddered while
 * downloading. Only the numbers are written here; the structure is rebuilt
 * exclusively when it actually changes.
 *
 * Returns `false` when the DOM has no live area, so the caller falls back to a
 * full render (first paint, or a screen without a progress bar).
 */
function updateSetupProgressInPlace(view) {
  const root = $('#modalRoot');
  if (!root) return false;
  const modal = root.querySelector('[data-setup-screen]');
  if (!modal || modal.getAttribute('data-setup-screen') !== String(view.screen)) return false;
  const live = root.querySelector('[data-setup-live="progress"]');
  if (!live) return false;
  const bar = live.querySelector('[role="progressbar"]');
  const fill = live.querySelector('.setup-progress-fill');
  const label = live.querySelector('[data-setup-live="label"]');
  const percent = live.querySelector('[data-setup-live="percent"]');
  const detail = live.querySelector('[data-setup-live="detail"]');
  if (bar && view.percent !== undefined) bar.setAttribute('aria-valuenow', String(view.percent));
  if (fill && view.percent !== undefined) fill.style.width = `${view.percent}%`;
  if (label && view.stepLabel !== undefined) label.textContent = view.stepLabel || '';
  if (percent && view.percent !== undefined) percent.textContent = `${view.percent}%`;
  if (detail && view.progressDetail !== undefined) detail.textContent = view.progressDetail || '';
  return true;
}

/** Draws the current screen into `#modalRoot`, if the wizard is open. */
function renderSetupWizard() {
  if (!setupWizardState.open) return;
  const root = $('#modalRoot');
  if (!root) return;
  const view = setupWizardView();
  // A byte-only change patches the live numbers instead of rebuilding the modal.
  // Skipping is safe for the structure *because* every byte event carries the
  // same step label and buttons: `resolveWizardView()` derives them from
  // `status.step`, which a byte event does not change.
  const key = setupWizardStructureKey(view);
  const replacing = setupWizardRendering > 0 || key !== setupWizardStructure;
  if (!replacing && updateSetupProgressInPlace(view)) return;
  setupWizardStructure = key;
  setupWizardRenderCount += 1;
  const working = SetupWizardModel.isWorkingScreen(view.screen);
  const showChecklist = working || view.screen === 'complete' || view.screen === 'error' || view.screen === 'blocked';
  const showRequirements = view.screen === 'requirements' || view.screen === 'welcome'
    || view.screen === 'resume' || view.screen === 'blocked' || view.screen === 'error';
  // The finished screen (and a run that ended in an error/blocked state) hands
  // the window back to the app; while work is still pending, setup owns it.
  const ownsWindow = view.screen !== 'complete' && view.screen !== 'error' && view.screen !== 'blocked';
  setSetupWizardFullscreen(ownsWindow);

  const progressHtml = setupWizardProgressHtml(view);

  const buttons = view.buttons.map(button => {
    const cls = `btn ${button.variant === 'primary' ? 'btn-primary' : 'btn-secondary'}`;
    const disabled = button.disabled || setupWizardState.busy ? ' disabled' : '';
    return `<button class="${cls}" data-setup-action="${escapeHtml(button.id)}"${disabled}>${escapeHtml(button.label)}</button>`;
  }).join('');

  // The close ✕ is only offered when leaving is safe. While a download runs, a
  // ✕ that hides the only progress indicator is a trap: the teacher loses the
  // window and finds a half-installed AI later. "Hủy cài đặt" is the exit there.
  const closeBtn = view.canSkip && !setupWizardState.busy
    ? '<button class="modal-close" data-setup-action="close" aria-label="Đóng">✕</button>'
    : '';

  // Rendered as a screen-sized page, not a floating dialog: the app shell is
  // hidden while `data-setup-fullscreen` is set (see `app.css`).
  setupWizardRendering += 1;
  try {
  root.innerHTML = `<div class="setup-fullscreen" data-setup-screen="${escapeHtml(view.screen)}">`
    + `<div class="setup-fullscreen-inner">`
    + `<div class="setup-fullscreen-head"><div><div class="setup-eyebrow">EduGame Studio</div>`
    + `<h2 id="setupWizardTitle">Cài đặt AI</h2>`
    + `<div class="small muted mt-[5px]">Bộ AI chạy trên máy này, không gửi bài học lên Internet.</div></div>${closeBtn}</div>`
    + `<div class="setup-headline ${setupWizardTone(view.tone)}"><div class="setup-eyebrow">${escapeHtml(view.eyebrow)}</div>`
    + `<h3 class="setup-title">${escapeHtml(view.title)}</h3><p class="setup-message">${escapeHtml(view.message)}</p></div>`
    + progressHtml
    + `${showRequirements ? setupWizardRequirementsHtml(view.requirements, view.screen !== 'requirements') : ''}`
    + `${showChecklist ? setupWizardChecklistHtml(view.steps) : ''}`
    + `<div class="info-box mt-[16px]">Cần Internet ở lần cài đặt này. Sau khi xong, bạn tạo và chơi trò chơi mà không cần mạng.</div>`
    + `<div class="setup-fullscreen-foot">${buttons || '<button class="btn btn-secondary" data-setup-action="close">Đóng</button>'}</div>`
    + `</div></div>`;
  } finally {
    setupWizardRendering -= 1;
  }
}

/**
 * First-run setup takes the whole window instead of floating over the app.
 *
 * Setup is not a side task: nothing else in the app works until the AI is
 * installed, and a teacher looking at a half-hidden dashboard behind a dialog
 * keeps trying to use the app underneath. So `<html data-setup-fullscreen="1">`
 * hides the shell (the same mechanism `html[data-fullscreen="1"]` already uses
 * for the game screen) and the wizard renders as a page, not a dialog.
 *
 * The flag is dropped as soon as the run finishes — the "xong" and error
 * screens offer the way back into the app, and the teacher must see it.
 */
function setSetupWizardFullscreen(on) {
  try {
    const html = document.documentElement;
    if (!html) return;
    if (on) html.setAttribute('data-setup-fullscreen', '1');
    else html.removeAttribute('data-setup-fullscreen');
  } catch { /* attribute write is not worth failing setup over */ }
}

/**
 * Host hook for coalescing. Electron's renderer has `requestAnimationFrame`;
 * the DOM test shim does not, so a macrotask is the fallback — still at most
 * one paint per tick instead of one per network chunk.
 */
function scheduleSetupWizardFrame(callback) {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => callback());
    return;
  }
  setTimeout(callback, 0);
}

/**
 * Subscribes to `setup:progress` once; a second wizard open reuses the listener.
 *
 * `onProgress` fires once per downloaded network chunk (`ModelInstaller`), i.e.
 * hundreds of times per second for a 1.1 GB model. The newest event is kept and
 * drawn on the next animation frame, so the UI updates at screen rate no matter
 * how fast bytes arrive.
 */
function ensureSetupProgressSubscription() {
  if (setupWizardState.unsubscribeProgress) return;
  if (typeof window.eduGame?.onSetupProgress !== 'function') return;
  setupWizardState.unsubscribeProgress = window.eduGame.onSetupProgress(progress => {
    if (!setupWizardState.open) return;
    setupWizardState.progress = progress;
    // The step in a byte event is authoritative while a run is going: the
    // status poll may still report the previous step for up to a second.
    if (setupWizardState.status && progress?.step) {
      setupWizardState.status = { ...setupWizardState.status, step: progress.step, running: true };
    }
    // Coalesce: a queued frame already draws the newest event.
    if (setupWizardFramePending) return;
    setupWizardFramePending = true;
    scheduleSetupWizardFrame(() => {
      setupWizardFramePending = false;
      // The wizard may have been closed while the frame was queued.
      if (!setupWizardState.open) return;
      renderSetupWizard();
    });
  });
}

function releaseSetupProgressSubscription() {
  try { setupWizardState.unsubscribeProgress?.(); } catch { /* already gone */ }
  setupWizardState.unsubscribeProgress = null;
}

/**
 * Re-reads the persisted status. Cheap (one IPC call, no detection), so it is
 * safe to call around every action.
 */
async function refreshSetupWizardStatus() {
  try {
    const status = await window.eduGame.getSetupStatus();
    setupWizardState.status = status;
    if (status?.modelId) setupWizardState.modelId = status.modelId;
  } catch (error) {
    // A build without the setup handlers must not brick the wizard: the
    // rejection becomes the error screen instead of an empty modal. The cached
    // status is dropped at the same time — keeping a stale "needs setup" value
    // would let the gate decide from data it can no longer verify.
    setupWizardState.status = undefined;
    setupWizardState.error = { message: String((error && error.message) || 'Không đọc được trạng thái cài đặt AI.') };
  }
}

/**
 * Runs `setup:preflight` so the requirements screen has real numbers (runtime
 * choice, download size, free disk) before the teacher commits to 1.1 GB.
 * Preflight never downloads, so this is safe on every open.
 */
async function runSetupWizardPreflight() {
  if (typeof window.eduGame?.preflightSetup !== 'function') return;
  setupWizardState.preflightPending = true;
  setupWizardState.error = null;
  renderSetupWizard();
  try {
    // An absent `modelId` lets `setup-ipc` apply the hardware recommendation;
    // sending a stale pin would override it.
    const payload = setupWizardState.modelId ? { modelId: setupWizardState.modelId } : {};
    setupWizardState.status = await window.eduGame.preflightSetup(payload);
  } catch (error) {
    setupWizardState.error = { message: String((error && error.message) || 'Không kiểm tra được máy.') };
  } finally {
    setupWizardState.preflightPending = false;
    // Adopt whatever the backend planned instead of keeping our own pin: the
    // model id in the response is the one that will actually be installed, and
    // `start` must ask for exactly that (see `startSetup` above).
    const planned = setupWizardState.status?.plan?.model?.id;
    if (planned) setupWizardState.modelId = planned;
    renderSetupWizard();
  }
}

/**
 * Opens the wizard. `{ probe: true }` is the first-run gate: it reads the
 * persisted state and only shows itself when setup is not finished, which is
 * what §3 step 2–3 asks for. It never blocks the app — a teacher whose AI is
 * installed sees nothing at all.
 */
async function openSetupWizard(options = {}) {
  const probe = options.probe === true;
  // A probe only ever asks the disk. The in-memory error belongs to an earlier
  // interaction in this session, so replaying it at launch would greet the
  // teacher with a failure they never caused this time.
  if (probe) setupWizardState.error = null;
  // A stale "frame queued" flag from a previous open would drop the first
  // progress event of this run.
  setupWizardFramePending = false;
  ensureSetupProgressSubscription();
  await refreshSetupWizardStatus();

  const status = setupWizardState.status;
  // An unreadable status (`undefined`) must never *auto*-open the wizard: a build
  // whose `setup:*` handlers are missing, or a failed read, would otherwise
  // greet every teacher — including one whose AI is installed — with a modal
  // they cannot finish. The app must stay usable, and Settings remains the
  // explicit path in, where the failure is reported instead of hidden.
  if (!status && probe) {
    closeSetupWizard('close');
    setupWizardState.dismissed = true;
    return false;
  }
  const needsWork = !status || !status.complete;
  if (probe && !needsWork) return false;
  // The gate asks once per launch; after "Để sau" it must stay closed so the
  // app stays usable, and Settings becomes the way back in.
  if (probe && setupWizardState.dismissed) return false;

  setupWizardState.open = true;
  setupWizardState.progress = undefined;
  // Take the window before the first paint: setup owns the screen until it is
  // done or the teacher leaves. Errors (including a failed status read) drop the
  // flag again in `renderSetupWizard()`, so the app is never left hidden.
  setSetupWizardFullscreen(true);
  // `error` is cleared by `refreshSetupWizardStatus()` above (only on a
  // successful read) and by `preflight`. Clearing it here unconditionally would
  // erase a read failure and reopen the wizard with an empty body.
  renderSetupWizard();
  // Only preflight when the state was actually read. With no status (a failed
  // read) there is nothing to preflight *for*, and running it would clear the
  // error with `error = null` and then overwrite it with whatever the machine
  // check returns — turning "the setup channel is broken" into a screen that
  // looks healthy and fails only when the teacher presses Bắt đầu.
  if (status && needsWork) void runSetupWizardPreflight();
  return true;
}

function closeSetupWizard(reason = 'close') {
  setupWizardState.open = false;
  setupWizardState.progress = undefined;
  setupWizardState.busy = false;
  if (reason === 'skip-ai') setupWizardState.dismissed = true;
  releaseSetupProgressSubscription();
  // The DOM is gone, so the next open must rebuild even for an identical view.
  setupWizardStructure = '';
  setupWizardFramePending = false;
  setSetupWizardFullscreen(false);
  const root = $('#modalRoot');
  if (root) root.innerHTML = '';
}

/** Starts (or resumes) setup. Never fires a second run while one is active. */
async function startSetupFromWizard() {
  if (setupWizardState.busy || setupWizardState.status?.running) return;
  setupWizardState.busy = true;
  setupWizardState.starting = true;
  setupWizardState.error = null;
  setupWizardState.progress = undefined;
  renderSetupWizard();
  try {
    // Only the model id travels to main; earlier steps may still be running
    // (`busy`), so a rejection is expected there and is handled below.
    // Omitted when unknown, so main applies the same recommendation `preflight` used.
    const payload = setupWizardState.modelId ? { modelId: setupWizardState.modelId } : {};
    const status = await window.eduGame.startSetup(payload);
    setupWizardState.status = status;
  } catch (error) {
    // The orchestrator records its own failure and `start` rejects with the
    // reason; prefer the persisted status because it carries the step/code the
    // retry logic needs.
    await refreshSetupWizardStatus();
    if (!setupWizardState.status?.error) {
      setupWizardState.error = { message: String((error && error.message) || 'Cài đặt AI thất bại.') };
    }
  } finally {
    setupWizardState.busy = false;
    setupWizardState.starting = false;
    setupWizardState.progress = undefined;
    // A frame queued from the last byte event must not swallow the first
    // progress event of the next run.
    setupWizardFramePending = false;
    renderSetupWizard();
    // A finished install changes what the rest of the app can do (offline AI
    // becomes available), so refresh the screens that show it.
    if (setupWizardState.status?.complete) {
      try {
        const localAi = await window.eduGame.getLocalAiModels();
        state.localAiModels = localAi.models;
        state.localAiMachine = localAi.machine;
        if (typeof window.refreshAiStatusBar === 'function') window.refreshAiStatusBar();
        render();
      } catch { /* the wizard result still stands */ }
    }
  }
}

/** Cancels a running setup and returns to the retry screen (bytes are kept). */
async function cancelSetupFromWizard() {
  if (setupWizardState.busy) return;
  setupWizardState.busy = true;
  renderSetupWizard();
  try {
    setupWizardState.status = await window.eduGame.cancelSetup();
    setupWizardState.progress = undefined;
  } catch (error) {
    setupWizardState.error = { message: String((error && error.message) || 'Không hủy được cài đặt.') };
  } finally {
    setupWizardState.busy = false;
    renderSetupWizard();
  }
}

/**
 * Single click handler for every button in the wizard.
 *
 * Delegated from `document` instead of per-button `addEventListener` because
 * `renderSetupWizard()` replaces the whole modal on every progress event — a
 * mid-download re-render would otherwise detach the listener of the button the
 * teacher is about to press, and "Hủy" would silently stop working.
 */
function handleSetupWizardAction(action) {
  switch (action) {
    case 'start':
    case 'retry':
      return startSetupFromWizard();
    case 'cancel':
      return cancelSetupFromWizard();
    case 'settings':
      // Leaving setup to configure a cloud provider or a lighter model is a
      // real recovery path; the first-run gate stays dismissed for this launch.
      closeSetupWizard('skip-ai');
      if (typeof openLocalAiModal === 'function') openLocalAiModal();
      else navigate('settings');
      return undefined;
    case 'skip-ai':
    case 'close':
    default:
      closeSetupWizard(action === 'skip-ai' ? 'skip-ai' : 'close');
      return undefined;
  }
}

// Delegated once, at load. `bootstrap.ts` and `settings.ts` call into the
// functions below through `window` so those files stay `@ts-nocheck` without
// relying on cross-file global hoisting.
document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-setup-action]');
  if (!button) return;
  if (button.disabled) return;
  event.preventDefault();
  void handleSetupWizardAction(button.dataset.setupAction);
});

// Escape closes the wizard only when leaving is safe, mirroring the ✕ button.
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !setupWizardState.open) return;
  if (setupWizardState.busy || SetupWizardModel.isWorkingScreen(setupWizardView().screen)) return;
  closeSetupWizard('close');
});

window.openSetupWizard = openSetupWizard;
window.closeSetupWizard = closeSetupWizard;
window.renderSetupWizard = renderSetupWizard;
window.setupWizardState = setupWizardState;
/** Lets other screens put the app shell back, e.g. after a forced close. */
window.setSetupWizardFullscreen = setSetupWizardFullscreen;
/** Test hook: how many times the modal was fully rebuilt (not patched). */
window.setupWizardRenderCount = () => setupWizardRenderCount;

