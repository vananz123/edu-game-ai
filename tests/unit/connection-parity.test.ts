// @ts-nocheck -- the renderer copy and the shared module must behave identically (DECISIONS #168).
/*
 * The renderer is plain global scripts and cannot `import`, so Object Connection
 * exists twice: `src/shared/connection-progress.ts` (typed, used by tests and
 * anything in main) and `src/renderer/connection-core.ts` (globals, used by the
 * play surface). This suite runs BOTH against the same inputs and fails on any
 * divergence — including a data drift between `src/shared/connection-templates.ts`
 * and the renderer's `renderer/shared/connection-data.ts` mirror.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIST = path.join(__dirname, '..', '..', '..', 'dist', 'src');
const SHARED = require('../../src/shared/connection-templates');
const SHARED_PROGRESS = require('../../src/shared/connection-progress');

function loadRenderer() {
  const sandbox = { console };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const file of ['renderer/shared/connection-constants.js', 'renderer/shared/connection-data.js', 'renderer/connection-core.js']) {
    const full = path.join(DIST, file);
    assert.ok(fs.existsSync(full), `${file} must exist — run npm run build`);
    vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: file });
  }
  return {
    ids: vm.runInContext('JSON.stringify(CONNECTION_TEMPLATE_IDS)', context),
    templates: vm.runInContext('JSON.stringify(CONNECTION_TEMPLATES)', context),
    defaultId: vm.runInContext('DEFAULT_CONNECTION_TEMPLATE', context),
    viewBox: vm.runInContext('JSON.stringify(CONNECTION_VIEWBOX)', context)
  };
}

const renderer = loadRenderer();

// 1. Constants and the template DATA mirror agree with the typed module.
assert.deepEqual(JSON.parse(renderer.ids), SHARED.CONNECTION_TEMPLATE_IDS, 'template ids match, in order');
assert.deepEqual(JSON.parse(renderer.templates), JSON.parse(JSON.stringify(SHARED.CONNECTION_TEMPLATES)), 'template data matches byte for byte');
assert.equal(renderer.defaultId, SHARED.DEFAULT_CONNECTION_TEMPLATE, 'default template id matches');
assert.deepEqual(JSON.parse(renderer.viewBox), { width: SHARED.CONNECTION_VIEWBOX.width, height: SHARED.CONNECTION_VIEWBOX.height }, 'viewBox matches');

// 2. Progression behaves identically for every template, length and answer pattern.
const { planConnectionStages, resetConnectionProgress, applyConnectionAnswer, connectionSummary } = SHARED_PROGRESS;
const sandbox = { console };
sandbox.window = sandbox;
const context = vm.createContext(sandbox);
for (const file of ['renderer/shared/connection-constants.js', 'renderer/shared/connection-data.js', 'renderer/connection-core.js']) {
  vm.runInContext(fs.readFileSync(path.join(DIST, file), 'utf8'), context, { filename: file });
}
const R = name => args => vm.runInContext(`${name}.apply(null, __args)`, Object.assign(context, { __args: args }));

const rPlan = vm.runInContext('planConnectionStages', context);
const rReset = vm.runInContext('resetConnectionProgress', context);
const rApply = vm.runInContext('applyConnectionAnswer', context);
const rSummary = vm.runInContext('connectionSummary', context);

const PATTERNS = [
  { name: 'all-correct', correct: () => true },
  { name: 'all-wrong', correct: () => false },
  { name: 'alternating', correct: i => i % 2 === 0 },
  { name: 'first-half', correct: (i, n) => i < Math.ceil(n / 2) },
  { name: 'last-only', correct: (i, n) => i === n - 1 }
];

let runs = 0;
for (const template of SHARED.CONNECTION_TEMPLATES) {
  for (let n = 1; n <= 30; n += 1) {
    const questions = Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}` }));
    const sharedPlan = planConnectionStages(template.id, n);
    // Arrays created inside the vm context belong to another realm, so they are
    // compared as JSON rather than through deepEqual's prototype check.
    // Both implementations must accept the bare pair count, which is what the
    // matching board passes.
    const rendererPlan = JSON.parse(JSON.stringify(rPlan(template.id, n)));
    assert.deepEqual(rendererPlan, sharedPlan, `${template.id}/${n}: plan matches`);

    for (const pattern of PATTERNS) {
      let a = resetConnectionProgress(template.id);
      let b = rReset(template.id);
      for (let i = 0; i < n; i += 1) {
        const correct = pattern.correct(i, n);
        // Evaluate the same answer twice in one step: the duplicate must be
        // ignored by both implementations identically.
        const ra = applyConnectionAnswer(a, template.id, sharedPlan, i, `q${i + 1}`, correct);
        const rb = rApply(b, template.id, rendererPlan, i, `q${i + 1}`, correct);
        assert.equal(JSON.stringify(rb.progress), JSON.stringify(ra.progress), `${template.id}/${n}/${pattern.name}: state matches after q${i + 1}`);
        assert.equal(rb.stageId, ra.stageId, `${template.id}/${n}/${pattern.name}: stage matches`);
        assert.equal(rb.completedNow, ra.completedNow, `${template.id}/${n}/${pattern.name}: completion matches`);
        const dupA = applyConnectionAnswer(ra.progress, template.id, sharedPlan, i, `q${i + 1}`, correct);
        const dupB = rApply(rb.progress, template.id, rendererPlan, i, `q${i + 1}`, correct);
        assert.equal(JSON.stringify(dupB.progress), JSON.stringify(dupA.progress), `${template.id}/${n}/${pattern.name}: duplicate matches`);
        assert.equal(dupB.stageId, null, 'a duplicate earns nothing in either implementation');
        a = dupA.progress;
        b = dupB.progress;
        runs += 1;
      }
      assert.deepEqual(JSON.parse(JSON.stringify(rSummary(b, template.id))), connectionSummary(a, template.id), `${template.id}/${n}/${pattern.name}: summary matches`);
    }
  }
}
assert.ok(runs > 5000, `the parity sweep actually ran (${runs} answer steps)`);

// 3. Unknown ids fall back identically.
assert.equal(rApply(rReset('nope'), 'nope', [], 0, 'x', true).progress.templateId, resetConnectionProgress('nope').templateId);

console.log(`connection-parity: ${runs} answer steps matched between shared and renderer`);
