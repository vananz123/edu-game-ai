// @ts-nocheck -- the renderer copy and the shared module must behave identically (DECISIONS #171).
/*
 * Constellation selection exists twice: `src/shared/constellation-templates.ts`
 * (typed, used by tests, the adapter and anything in main) and
 * `src/renderer/{shared/constellation-data.ts, shared/constellation-constants.ts,
 * constellation-core.ts}` (globals, used by the play surface). This suite runs
 * BOTH against the same inputs and fails on any divergence — including a data
 * drift between the two copies of the seven figures.
 *
 * It also checks the one bridge that matters: a resolved constellation, fed to
 * the EXISTING progression, behaves exactly like that progression does on any
 * other template (DECISIONS #171: the rules are not re-implemented).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIST = path.join(__dirname, '..', '..', '..', 'dist', 'src');
const SHARED = require('../../src/shared/constellation-templates');
const PROGRESS = require('../../src/shared/connection-progress');

const RENDERER_FILES = [
  'renderer/shared/connection-constants.js',
  'renderer/shared/connection-data.js',
  'renderer/shared/constellation-constants.js',
  'renderer/shared/constellation-data.js',
  'renderer/connection-core.js',
  'renderer/constellation-core.js'
];

function loadRenderer(sandbox) {
  for (const file of RENDERER_FILES) {
    const full = path.join(DIST, file);
    assert.ok(fs.existsSync(full), `${file} must exist — run npm run build`);
    vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: file });
  }
  return sandbox;
}

const sandbox = { console };
sandbox.window = sandbox;
const context = loadRenderer(vm.createContext(sandbox));
const read = code => vm.runInContext(code, context);
const json = code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context));

// 1. Constants and the data mirror agree with the typed module.
assert.deepEqual(json('CONSTELLATION_TEMPLATE_IDS'), SHARED.CONSTELLATION_TEMPLATE_IDS, 'constellation ids match, in order');
assert.deepEqual(json('CONSTELLATION_TEMPLATES'), JSON.parse(JSON.stringify(SHARED.CONSTELLATION_TEMPLATES)), 'constellation data matches byte for byte');
assert.deepEqual(json('LEGACY_CONNECTION_MAP'), SHARED.LEGACY_CONNECTION_MAP, 'legacy mapping matches');
assert.equal(read('DEFAULT_CONSTELLATION'), SHARED.DEFAULT_CONSTELLATION, 'default constellation matches');
assert.equal(read('AUTO_CONSTELLATION'), SHARED.AUTO_CONSTELLATION, 'the auto figure matches');
assert.deepEqual(json('CONSTELLATION_VIEWBOX'), { width: SHARED.CONSTELLATION_VIEWBOX.width, height: SHARED.CONSTELLATION_VIEWBOX.height }, 'viewBox matches');
assert.equal(read('CONSTELLATION_STAR_MIN'), SHARED.CONSTELLATION_STAR_MIN);
assert.equal(read('CONSTELLATION_STAR_MAX'), SHARED.CONSTELLATION_STAR_MAX);
assert.equal(read('CONSTELLATION_SHORT_LABEL_MAX'), SHARED.CONSTELLATION_SHORT_LABEL_MAX);
assert.equal(read('CONSTELLATION_LABEL_MIN_PX'), SHARED.CONSTELLATION_LABEL_MIN_PX);
assert.deepEqual(json('CONSTELLATION_DRAG_DIRECTIONS'), SHARED.CONSTELLATION_DRAG_DIRECTIONS);
assert.equal(read('DEFAULT_DRAG_DIRECTION'), SHARED.DEFAULT_DRAG_DIRECTION);
// Obvious, but each one has silently broken a build before: the label must not
// carry the word BETA any more (#171).
assert.equal(read('CONNECTION_BETA'), false, 'the beta label is retired');
assert.equal(read('CONNECTION_BETA_LABEL'), '', 'no BETA badge is rendered');
assert.equal(read('CONNECTION_BETA_NOTE'), '', 'no BETA note is rendered');
assert.equal(read('CONSTELLATION_GAME_NAME'), 'Chòm sao tri thức');

// 2. Selection agrees for every constellation and every board length, including
//    the odd ones a saved file can carry.
let runs = 0;
const COUNTS = [null, undefined, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 2.6, -3];
for (const template of SHARED.CONSTELLATION_TEMPLATES) {
  for (const count of COUNTS) {
    const sharedStars = SHARED.selectConstellationStars(template.id, count);
    const rendererStars = json(`selectConstellationStars(${JSON.stringify(template.id)}, ${JSON.stringify(count)})`);
    assert.deepEqual(rendererStars, JSON.parse(JSON.stringify(sharedStars)), `${template.id}/${count}: selected stars match`);

    const sharedSelection = SHARED.selectConstellation(template.id, count);
    const rendererSelection = json(`selectConstellation(${JSON.stringify(template.id)}, ${JSON.stringify(count)})`);
    assert.deepEqual(rendererSelection, JSON.parse(JSON.stringify(sharedSelection)), `${template.id}/${count}: stars + links match`);

    const sharedShape = SHARED.constellationTemplateShape(template.id, count);
    const rendererShape = json(`constellationTemplateShape(${JSON.stringify(template.id)}, ${JSON.stringify(count)})`);
    assert.deepEqual(rendererShape, JSON.parse(JSON.stringify(sharedShape)), `${template.id}/${count}: template shape matches`);
    runs += 1;
  }
}
assert.ok(runs >= 7 * COUNTS.length);

// 3. Resolution and the legacy map agree on every id a saved game can hold.
const IDS = SHARED.CONSTELLATION_TEMPLATE_IDS.concat(['solar-system', 'bridge', 'knowledge-network', 'circuit', 'ecosystem', 'timeline', 'geometry', '', 'nope', null, undefined, 42]);
for (const id of IDS) {
  assert.equal(read(`constellationResolve(${JSON.stringify(id)}).id`), SHARED.constellationTemplate(id).id, `resolve ${id}`);
  assert.equal(read(`isConstellationTemplateId(${JSON.stringify(id)})`), SHARED.isConstellationTemplateId(id), `isConstellationTemplateId ${id}`);
}
for (const value of ['left-to-right', 'right-to-left', '', null, 'sideways', 7]) {
  assert.equal(read(`constellationResolveDragDirection(${JSON.stringify(value)})`), SHARED.resolveDragDirection(value), `direction ${value}`);
}

// 4. The existing progression accepts a constellation shape and drives it
//    correctly — on BOTH copies, through the same bridge.
for (const template of SHARED.CONSTELLATION_TEMPLATES) {
  for (let pairs = 1; pairs <= 12; pairs += 1) {
    const sharedShape = SHARED.constellationTemplateShape(template.id, pairs);
    const rendererShape = json(`constellationTemplateShape(${JSON.stringify(template.id)}, ${pairs})`);
    const sharedPlan = PROGRESS.planConnectionStages(sharedShape, pairs);
    const rendererPlan = json(`planConnectionStages(constellationTemplateShape(${JSON.stringify(template.id)}, ${pairs}), ${pairs})`);
    assert.deepEqual(rendererPlan, sharedPlan, `${template.id}/${pairs}: the planner reads the star stages`);
    assert.equal(sharedPlan.length, pairs, `${template.id}/${pairs}: one stage per pair`);

    // All correct: every star of the board is lit.
    let progress = PROGRESS.resetConnectionProgress(sharedShape);
    let rendererProgress = read(`resetConnectionProgress(constellationTemplateShape(${JSON.stringify(template.id)}, ${pairs}))`);
    for (let i = 0; i < pairs; i += 1) {
      progress = PROGRESS.applyConnectionAnswer(progress, sharedShape, sharedPlan, i, `p${i + 1}`, true).progress;
      rendererProgress = json(`applyConnectionAnswer(${JSON.stringify(rendererProgress)}, constellationTemplateShape(${JSON.stringify(template.id)}, ${pairs}), ${JSON.stringify(sharedPlan)}, ${i}, ${JSON.stringify(`p${i + 1}`)}, true).progress`);
    }
    // A board longer than the figure lights every star and keeps scoring the
    // extra pairs (the picture is finished before the board is).
    const starsOnBoard = Math.min(pairs, SHARED.CONSTELLATION_STAR_MAX);
    assert.equal(PROGRESS.connectionSummary(progress, sharedShape).connected, starsOnBoard, `${template.id}/${pairs}: a full run lights every star`);
    assert.deepEqual(rendererProgress, JSON.parse(JSON.stringify(progress)), `${template.id}/${pairs}: renderer progress matches`);
  }
}

// 5. A legacy id plays the constellation it maps to, with the same stages.
assert.equal(read("constellationResolve('solar-system').id"), 'orion');
assert.deepEqual(
  json("constellationTemplateShape('solar-system', 3)"),
  json("constellationTemplateShape('orion', 3)"),
  'an old solar-system game plays the same figure as Orion'
);

console.log(`constellation-parity: ${runs} selections matched; ${SHARED.CONSTELLATION_TEMPLATES.length} figures play through the existing progression`);
