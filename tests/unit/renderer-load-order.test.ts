import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/**
 * The wizard's classic scripts must actually *load*, in `index.html` order.
 *
 * `tsc` type-checks this renderer with `strict: false` and no knowledge of script
 * order, so reading a binding that a *later* `<script>` declares is not a compile
 * error — it is a `ReferenceError` / "Cannot access '…' before initialization"
 * that kills the page and surfaces only when a human opens the wizard. That exact
 * bug shipped once: `step-generate.ts` computed `WIZARD_ART_SCENE_CATEGORIES` at
 * top level from `STAGE_ILLUSTRATION_CATEGORY_ICONS`, which
 * `game-illustration.js` declares fourteen `<script>` tags later.
 *
 * This test evaluates every renderer script listed in `index.html`, in order,
 * inside one shared `vm` context with a minimal DOM stub, then calls the
 * functions step 5 renders with. A declaration-order mistake fails here, before
 * anybody has to click through the wizard.
 */

const ROOT = path.join(__dirname, '..', '..', '..');
const DIST = path.join(ROOT, 'dist', 'src');
const INDEX = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
// `<script src="x"></script>` và `<script defer src="x"></script>`: thuộc tính
// phụ (như `defer` của ba script vendor) không được làm cổng bỏ sót script.
const ORDER = [...INDEX.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"[^>]*><\/script>/g)].map(
  match => ({ src: match[2], defer: /\bdefer\b/.test(match[1]) }),
);
assert.ok(ORDER.length > 60, `chỉ đọc được ${ORDER.length} script từ index.html`);
assert.ok(ORDER.every(entry => typeof entry.src === 'string'));

function noop() {}

function stubElement() {
  return {
    style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop,
    removeEventListener: noop,
    appendChild: noop,
    removeChild: noop,
    setAttribute: noop,
    removeAttribute: noop,
    insertAdjacentHTML: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    focus: noop,
    blur: noop,
    remove: noop,
    children: [],
    dataset: {},
    innerHTML: '',
    textContent: ''
  };
}

function createContext() {
  const sandbox: Record<string, unknown> = {
    console,
    document: {
      getElementById: stubElement,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: stubElement,
      addEventListener: noop,
      body: stubElement(),
      documentElement: stubElement(),
      readyState: 'loading'
    },
    navigator: { userAgent: 'probe', language: 'vi' },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    requestAnimationFrame: noop,
    cancelAnimationFrame: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    location: { href: '', search: '', hash: '', pathname: '' },
    alert: noop,
    URLSearchParams
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return vm.createContext(sandbox);
}

// `index.html` lists the full renderer. `bootstrap.js` is the last script and
// attaches to real DOM nodes that the stub deliberately does not emulate; it is
// the only one excluded, and it declares nothing the other scripts read.
// `defer` không đổi thứ tự: script defer chạy sau khi tài liệu parse xong, theo
// đúng thứ tự xuất hiện, nên mọi script vẫn thấy `THREE`/`confetti` như trước.
const SCRIPTS = ORDER.map(entry => entry.src).filter(src => !src.includes('core/bootstrap'));
assert.deepEqual(
  ORDER.filter(entry => !entry.defer).map(entry => entry.src),
  ['edugame-bridge.js'].filter(src => ORDER.some(entry => entry.src === src)),
  'mọi script renderer phải `defer`; thẻ duy nhất nạp đồng bộ là cầu eduGame của vỏ Tauri',
);

assert.ok(SCRIPTS.length >= 30, `index.html should list the whole renderer, found ${SCRIPTS.length} scripts`);
assert.ok(
  SCRIPTS.indexOf('renderer/features/wizard/step-generate.js') < SCRIPTS.indexOf('renderer/features/game-illustration.js'),
  'this guard exists because step-generate.js loads before game-illustration.js; if that order changes, revisit it'
);

const context = createContext();
const loaded = [];
for (const src of SCRIPTS) {
  const file = path.join(DIST, src);
  assert.ok(fs.existsSync(file), `${src} is listed in index.html but missing from dist/ — run npm run build`);
  try {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: src });
  } catch (error) {
    assert.fail(`${src} threw while loading: ${(error && error.message) || error}`);
  }
  loaded.push(src);
}
assert.equal(loaded.length, SCRIPTS.length);

// Step 5 must render, not merely load. These are the functions
// `renderWizardGenerate` reaches on its first paint, plus the artwork grid added
// in DECISIONS #73.
function evalInContext(code) {
  return vm.runInContext(code, context);
}

const stageFraction = evalInContext("wizardGenerationProgressFraction('generate')");
assert.equal(typeof stageFraction, 'number');
assert.ok(stageFraction > 0 && stageFraction < 1, `expected a mid-run fraction, got ${stageFraction}`);

const progressHtml = evalInContext(
  "wizardState.busy = 'generate'; wizardState.lessonStage = 'generate'; renderWizardGenerationProgress()"
);
assert.equal(typeof progressHtml, 'string');
assert.ok(progressHtml.includes('data-wizard-progress='), 'step-5 progress should render its progressbar');
assert.ok(progressHtml.includes('data-stage="ready"'), 'step-5 progress should still list all five stages');

// DECISIONS #75: step 2 renders the same pieces and depends on two bindings that
// live in *other* scripts — `WIZARD_GENERATION_SPINNER` (step-generate.js, which
// is only guaranteed to have loaded while this order holds) and the clock helpers
// in wizard/state/core.js. Reaching one of them before its script ran would throw here.
const analysisProgressHtml = evalInContext(
  "wizardState.busy = 'analyze'; wizardState.lessonStage = 'generate'; renderWizardAnalysisProgress()"
);
assert.equal(typeof analysisProgressHtml, 'string');
assert.ok(analysisProgressHtml.includes('role="progressbar"'), 'step-2 progress should render its progressbar');
assert.ok(analysisProgressHtml.includes('wizard-gen-spinner'), 'step 2 should show the shared spinner');
assert.ok(analysisProgressHtml.includes('50%'), 'step 2 at the model stage should report half done');
assert.ok(analysisProgressHtml.includes('data-wizard-analysis-elapsed'), 'step 2 should show the elapsed clock');

// The frozen total is produced by `wizardStopActivityClock({ finished: true })`
// and only appears once a run really finished.
const totalProbe = evalInContext(`
  wizardState.analysisStartedAt = Date.now() - 65000;
  wizardStopActivityClock({ finished: true });
  wizardState.analysisStartedAt = 0;
  wizardAnalysisTotalText()
`);
assert.equal(totalProbe, 'Tổng thời gian phân tích: 1:05', `unexpected total: ${totalProbe}`);
assert.equal(
  evalInContext("wizardState.analysisFinishedMs = 0; wizardState.analysisStartedAt = Date.now(); wizardStopActivityClock(); wizardAnalysisTotalText()"),
  '',
  'a clock stopped without `finished` must not print a total'
);
assert.equal(
  evalInContext("wizardState.analysisFinishedMs = 0; wizardState.busy = ''; wizardReviewTotalProbe = renderWizardAnalysis().includes('data-wizard-analysis-total-line')"),
  false,
  'no frozen total means no total line'
);
assert.equal(
  evalInContext("wizardState.busy = 'analyze'; wizardState.lessonStage = 'cached'; renderWizardAnalysisProgress().includes('data-wizard-progress=\"cached\"')"),
  true,
  'a cache hit should say it reused the result instead of showing four stages'
);
evalInContext("wizardState.busy = ''; wizardState.lessonStage = '';");

// Step 1 must render too, not merely load. It reaches `wizardStructureScopeError()`
// at the end of `renderWizardInput`, and that function lived only in `step-input.ts`
// as a *call* with no definition anywhere in the renderer: `tsc` runs the renderer
// with `@ts-nocheck`, so it compiled, loaded, and threw `ReferenceError` on every
// `render()` — which silently killed the whole create page after an import. Step 5
// was guarded here and step 1 was not, which is exactly why this slipped through.
const step1Html = evalInContext(`
  wizardState.step = 'input';
  wizardState.text = 'M\\u1ee5c ti\\u00eau b\\u00e0i h\\u1ecdc. '.repeat(10);
  wizardState.busy = '';
  wizardResetStructure({ rebuild: false });
  renderWizardInput()
`);
assert.equal(typeof step1Html, 'string', 'step 1 should render');
assert.ok(step1Html.includes('data-wizard-step-body="input"'), 'step 1 should render its panel');
assert.ok(step1Html.includes('data-wizard-action="import-file"'), 'step 1 should offer the import button');
assert.ok(step1Html.includes('id="wizardNextBtn"'), 'step 1 should render the continue button');
assert.equal((step1Html.match(/role="tab"/g) || []).length, 2, 'step 1 should keep only the structure and lesson-content tabs');
assert.ok(step1Html.includes('data-wizard-ai-payload'), 'step 1 should render the AI payload below the tabs');
assert.equal(
  evalInContext("typeof wizardStructureScopeError"),
  'function',
  'wizardStructureScopeError is called by renderWizardInput and must be defined'
);
assert.equal(
  evalInContext("wizardResetStructure({ rebuild: false }); wizardStructureScopeError()"),
  '',
  'a fresh scope (no tree yet) must not block "Tiếp tục"'
);

// The tree's checkbox state must agree with what `wizardStructureToggle` does.
// Both bugs below were live at once and both were invisible to `tsc`:
//  1. `wizardStructureNodeStates` read `s.selected` only, so the "no ticks yet =
//     whole document" rule (§4.1) was ignored: every box painted unticked, and
//     one click selected *everything*, because `wizardStructureToggle` starts
//     from `wizardStructureAllIds()` in exactly that state.
//  2. the root row rendered a checkbox (`checked` forced false for
//     `tree.root.id`), so clicking the document row silently toggled every
//     section.
const tree = evalInContext(`(function () {
  const node = (id, title, characters, children) => ({
    id, title, characters, kind: 'section', children: children || [], empty: false, confidence: 'high'
  });
  const root = node('root', 'Tài liệu', 300, [
    node('s1', 'Mục 1', 100, [node('s1a', 'Mục 1.1', 60), node('s1b', 'Mục 1.2', 40)]),
    node('s2', 'Mục 2', 100)
  ]);
  const nodes = [root, root.children[0], root.children[0].children[0], root.children[0].children[1], root.children[1]];
  return { root, nodes, generatedAt: 0 };
})()`);
context.__wizardTree = tree;

const treeHtml = evalInContext(`
  wizardState.step = 'input';
  wizardState.text = 'Mục 1. '.repeat(20);
  wizardResetStructure({ rebuild: false });
  wizardState.structure = Object.assign(wizardStructureState(), { tree: __wizardTree, loading: false, preview: null });
  renderWizardStructureTree()
`);
assert.equal(typeof treeHtml, 'string', 'the structure tree should render');
assert.ok(treeHtml.includes('data-wizard-section="s1"'), 'every section gets a checkbox');

const rootRowHtml = evalInContext(`
  (function () {
    const html = renderWizardStructureTree();
    const start = html.indexOf('data-section-row="root"');
    if (start < 0) return 'NO ROOT ROW';
    const end = html.indexOf('</li>', start);
    return html.slice(start, end);
  })()
`);
assert.notEqual(rootRowHtml, 'NO ROOT ROW', 'the tree should render a root row');
assert.ok(
  !rootRowHtml.includes('type="checkbox"'),
  'the root document row is not selectable and must not render a checkbox — it used to toggle every section at once'
);

const separatedPreview = evalInContext(`
  (function () {
    wizardState.inputTab = 'structure';
    wizardState.structure = Object.assign(wizardStructureState(), {
      tree: __wizardTree,
      selected: [],
      customized: false,
      preview: {
        ranges: [{ selected: true }],
        preserved: { tables: 1, questions: 2, answers: 3, examples: 4, formulas: 5 },
        chars: 42,
        estimatedTokens: 12,
        warnings: [],
        truncated: false,
        text: 'Nội dung xem trước cho AI'
      }
    });
    const html = renderWizardInput();
    const structureStart = html.indexOf('data-tab-pane="structure"');
    const structureEnd = html.indexOf('<!-- Tab 2 Pane', structureStart);
    const contentStart = html.indexOf('data-tab-pane="content"');
    const contentEnd = html.indexOf('data-wizard-ai-payload', contentStart);
    const payloadStart = html.indexOf('data-wizard-ai-payload');
    const payloadEnd = html.indexOf('<!-- Loại đầu vào', payloadStart);
    const tabCount = (html.match(/role="tab"/g) || []).length;
    return {
      structureHasPreview: html.slice(structureStart, structureEnd).includes('data-structure-preview'),
      contentTabHasPreview: html.slice(contentStart, contentEnd).includes('data-structure-preview'),
      previewOutsideTabs: payloadStart === contentEnd && !html.slice(payloadStart, payloadEnd).includes('role="tabpanel"'),
      previewText: html.slice(payloadStart, payloadEnd).includes('Nội dung xem trước cho AI'),
      tabCount
    };
  })()
`);
assert.deepEqual(
  JSON.parse(JSON.stringify(separatedPreview)),
  { structureHasPreview: false, contentTabHasPreview: false, previewOutsideTabs: true, previewText: true, tabCount: 2 },
  'the AI payload preview must remain below both tabs, outside either tab panel'
);

// Nothing ticked yet means "the whole document", so every selectable box paints ticked.
assert.equal(
  evalInContext(`
    wizardState.structure = Object.assign(wizardStructureState(), { tree: __wizardTree, selected: [], customized: false });
    (function () {
      const states = wizardStructureNodeStates(__wizardTree).states;
      return ['s1', 's1a', 's1b', 's2'].every(id => states.get(id).checked);
    })()
  `),
  true,
  'the untouched default (no explicit ticks) means every section is in scope, so every box must render ticked'
);

// One click on a section must remove exactly that section's subtree, not select all.
// The actions end by calling `render()`, which the DOM stub cannot serve, so the
// pure state transitions are asserted with `render` swapped for a no-op.
evalInContext(`
  globalThis.__realRender = render;
  globalThis.render = function () {};
`);
assert.equal(
  JSON.stringify(
    evalInContext(`
    wizardState.structure = Object.assign(wizardStructureState(), { tree: __wizardTree, selected: [], customized: false });
    wizardStructureToggle('s1b');
    ({ customized: wizardState.structure.customized, selected: wizardState.structure.selected.slice().sort() })
  `)
  ),
  JSON.stringify({ customized: true, selected: ['s1', 's1a', 's2'] }),
  'unticking one leaf must keep every other section selected'
);

assert.equal(
  JSON.stringify(
    evalInContext(`
    wizardState.structure = Object.assign(wizardStructureState(), { tree: __wizardTree, selected: [], customized: false });
    wizardStructureToggle('s1');
    ({ customized: wizardState.structure.customized, selected: wizardState.structure.selected.slice().sort() })
  `)
  ),
  JSON.stringify({ customized: true, selected: ['s2'] }),
  'unticking a parent must clear its whole subtree'
);

assert.equal(
  JSON.stringify(
    evalInContext(`
    wizardState.structure = Object.assign(wizardStructureState(), { tree: __wizardTree, selected: ['s2'], customized: true });
    wizardStructureSelectAll();
    ({ customized: wizardState.structure.customized, selected: wizardState.structure.selected.length })
  `)
  ),
  JSON.stringify({ customized: false, selected: 0 }),
  'select-all must return to the whole-document default'
);

assert.equal(
  evalInContext(`
    wizardState.structure = Object.assign(wizardStructureState(), { tree: __wizardTree, selected: [], customized: true });
    wizardStructureScopeError()
  `).length > 0,
  true,
  'an explicitly empty selection must block "Tiếp tục" with a message'
);

evalInContext("wizardResetStructure({ rebuild: false }); wizardState.step = 'input';");
evalInContext("globalThis.render = globalThis.__realRender; delete globalThis.__realRender;");

const gridHtml = evalInContext(`
  wizardIllustrationGrid({
    draft: {
      gameType: 'arena',
      questions: [
        { prompt: 'Synthetic?', options: ['A', 'B'], correctOptionId: 'A', contentCategory: 'geography' }
      ]
    }
  })
`);
assert.equal(typeof gridHtml, 'string');
assert.ok(gridHtml.includes('data-wizard-art-grid'), 'the per-item artwork grid should render');
assert.ok(gridHtml.includes('data-wizard-action="toggle-art"'), 'each artwork card should offer the "Đổi" action');
// The category picker is built from `STAGE_ILLUSTRATION_CATEGORY_ICONS`, i.e. the
// very binding whose load order caused the outage. Assert it is populated.
assert.ok(gridHtml.includes('geography-scene'), 'the asset picker should list scene-backed categories');

const sceneCategories = evalInContext('wizardArtSceneCategories().length');
assert.ok(sceneCategories > 0, `expected scene-backed categories, got ${sceneCategories}`);
assert.ok(
  sceneCategories <= 25,
  `scene categories should be a subset of the 25 labelled categories, got ${sceneCategories}`
);

// DECISIONS #161: the chrome icon helper must be reachable from the shared vm
// context by the time the pages run, and must resolve ids against the generated
// icon data — an icon that silently renders nothing is worse than a missing file.
assert.equal(evalInContext('typeof uiIcon'), 'function', 'uiIcon is called by every page module');
assert.equal(evalInContext('typeof paintUiIcons'), 'function', 'render() calls paintUiIcons');
assert.ok(
  evalInContext("uiIcon('library', '', 18)").includes('<svg') &&
    evalInContext("uiIcon('wand-sparkles')").includes('lucide-wand-sparkles'),
  'uiIcon should emit a Lucide svg for a real chrome id'
);
assert.equal(evalInContext("uiIcon('no-such-icon')"), '', 'an unknown id must paint nothing, not a broken tag');

// DECISIONS #182: the lesson-plans page renders as two columns, and the chat column
// is built by `features/lesson-chat.js`. `renderLessonPlans()` calls
// `lessonChatPanelHtml()` on every paint, so a script-order mistake here would kill
// the whole page — the same failure mode step 1 had.
assert.equal(evalInContext('typeof lessonChatPanelHtml'), 'function', 'lessonChatPanelHtml is called by renderLessonPlans');
const lessonPageHtml = evalInContext(`
  state.settings = { ai: { provider: 'local', providers: [
    { id: 'local', label: 'AI local', wizardEligible: true, usable: true, model: '' },
    { id: 'gemini', label: 'AI đám mây', wizardEligible: true, usable: false, model: 'gemini-2.5-flash' }
  ] } };
  state.lessonLibrary = [
    { id: 'les_a', name: 'Toan 4 - Bai 1', ext: 'docx', characters: 900, createdAt: '2026-01-01T00:00:00.000Z', analyses: [] },
    { id: 'les_b', name: 'Toan 4 - Bai 2', ext: 'pdf', characters: 1200, createdAt: '2026-01-02T00:00:00.000Z', analyses: [] }
  ];
  state.search = '';
  renderLessonPlans()
`);
assert.equal(typeof lessonPageHtml, 'string', 'the lesson-plans page should render');
assert.ok(lessonPageHtml.includes('class="lesson-two-col"'), 'the page should be the two-column layout');
assert.ok(lessonPageHtml.includes('id="lessonChatCol"'), 'the fixed chat column should render first');
assert.ok(lessonPageHtml.indexOf('lesson-chat-frame') < lessonPageHtml.indexOf('lesson-list-col'), 'chat on the left, list on the right');
assert.ok(lessonPageHtml.includes('data-action="lesson-chat-import"'), 'the chat should offer uploading a new lesson');
assert.ok(lessonPageHtml.includes('id="lessonChatProvider"') || lessonPageHtml.includes('Nhà cung cấp:'), 'the chat should show the AI provider choice');
assert.ok(!lessonPageHtml.includes('BETA'), 'the BETA panel is gone, not renamed');
assert.ok(!lessonPageHtml.includes('qaDocSelect'), 'the old single-document question channel is deleted');

// DECISIONS #204: the About page is the sixth settings tab, so `pages/settings.js` now
// calls four helpers that live in `features/about-panel.js`. Same failure mode as #182:
// a script-order mistake here is a ReferenceError that kills the whole Settings page,
// and `tsc` cannot see it.
for (const name of ['aboutPanelHtml', 'wireAboutPanel', 'paintAboutPanel', 'aboutTabChipHtml', 'aboutPaintTabChip', 'aboutKickCheck']) {
  assert.equal(evalInContext(`typeof ${name}`), 'function', `${name} is called from the Settings page`);
}
const settingsPageHtml = evalInContext(`
  state.settings = {
    ai: { provider: 'local', providers: [
      { id: 'local', label: 'AI local', wizardEligible: true, usable: true, model: '' },
      { id: 'gemini', label: 'AI đám mây', wizardEligible: true, usable: false, model: 'gemini-2.5-flash' }
    ] },
    preferences: { theme: 'light', audience: 'teen', teachingStyle: { tone: 'thân thiện', humor: 'vừa phải', visualStyle: 'hiện đại sinh động' } }
  };
  state.localAiModels = [];
  state.localAiMachine = {};
  state.settingsSection = 'about';
  state.settingsAiTab = 'local';
  renderSettings()
`);
assert.equal(typeof settingsPageHtml, 'string', 'the settings page should render');
assert.ok(settingsPageHtml.includes('id="settingsPanel-about"'), 'the About panel is markup of this page');
assert.ok(settingsPageHtml.includes('aria-controls="settingsPanel-about"'), 'the sixth tab points at that panel');
assert.ok(settingsPageHtml.includes('data-about-tab-chip'), 'the tab label carries the chip slot the panel paints');
assert.ok(settingsPageHtml.includes('id="aboutCheckBtn"'), 'the update controls render with the page');
assert.ok(
  /data-icon="info"[^>]*><\/span>Giới thiệu và cập nhật/.test(settingsPageHtml),
  'the About heading goes through the icon hook instead of printing the Lucide id'
);
assert.ok(!settingsPageHtml.includes('aboutAPI'), 'no leftover of the retired second-window preload bridge');

console.log(`renderer-load-order: ${loaded.length} scripts loaded, step 5 renders (${sceneCategories} scene categories)`);
