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
const ORDER = [...INDEX.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);

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
    location: { href: '', search: '', hash: '' },
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
const SCRIPTS = ORDER.filter(src => !src.includes('core/bootstrap'));

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

console.log(`renderer-load-order: ${loaded.length} scripts loaded, step 5 renders (${sceneCategories} scene categories)`);
