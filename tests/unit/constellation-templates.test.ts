// @ts-nocheck -- pure constellation data tests (DECISIONS #171).
const assert = require('node:assert/strict');
const {
  CONSTELLATION_TEMPLATES,
  CONSTELLATION_TEMPLATE_IDS,
  CONSTELLATION_STAR_MAX,
  CONSTELLATION_STAR_MIN,
  CONSTELLATION_VIEWBOX,
  CONSTELLATION_SHORT_LABEL_MAX,
  CONSTELLATION_LABEL_MIN_PX,
  DEFAULT_CONSTELLATION,
  AUTO_CONSTELLATION,
  LEGACY_CONNECTION_TEMPLATE_IDS,
  constellationTemplate,
  isConstellationId,
  isConstellationTemplateId,
  mapLegacyTemplate,
  resolveDragDirection,
  selectConstellation,
  selectConstellationStars,
  selectConstellationLinks,
  constellationTemplateShape,
  validateConstellation
} = require('../../src/shared/constellation-templates');
const { CONNECTION_TEMPLATE_IDS } = require('../../src/shared/connection-templates');
const { planConnectionStages, applyConnectionAnswer, resetConnectionProgress, connectionSummary } = require('../../src/shared/connection-progress');

// The seven real constellations chosen with the user.
const EXPECTED = ['ursa-major', 'orion', 'cygnus', 'lyra', 'taurus', 'scorpius', 'andromeda'];
assert.deepEqual(CONSTELLATION_TEMPLATE_IDS, EXPECTED, 'the seven constellations ship in order');
assert.equal(CONSTELLATION_TEMPLATES.length, EXPECTED.length);
assert.equal(DEFAULT_CONSTELLATION, 'ursa-major');
assert.equal(CONSTELLATION_STAR_MIN, 2);
assert.equal(CONSTELLATION_STAR_MAX, 10);
// The two constants the play surface measures against; changing either changes
// what a projector shows, so they are asserted rather than trusted.
assert.equal(CONSTELLATION_SHORT_LABEL_MAX, 24, 'a label of 24 characters or fewer can be drawn in 3D');
assert.equal(CONSTELLATION_LABEL_MIN_PX, 22, 'the legibility floor for a 3D label');

// Every constellation passes its own structural validator.
for (const template of CONSTELLATION_TEMPLATES) {
  assert.deepEqual(validateConstellation(template), [], `${template.id} is structurally valid`);
}

// Ids are unique; every figure can fill every board length.
const ids = new Set();
for (const template of CONSTELLATION_TEMPLATES) {
  assert.equal(ids.has(template.id), false, `${template.id} is unique`);
  ids.add(template.id);
  for (let n = CONSTELLATION_STAR_MIN; n <= CONSTELLATION_STAR_MAX; n += 1) {
    const result = selectConstellation(template.id, n);
    assert.equal(result.stars.length, n, `${template.id}: ${n} pairs select ${n} stars`);
    assert.equal(new Set(result.stars.map(star => star.id)).size, n, `${template.id}: chosen stars are unique (${n})`);
    for (const star of result.stars) {
      assert.ok(star.x >= 0 && star.x <= CONSTELLATION_VIEWBOX.width, `${template.id}: ${star.id} x is on the board`);
      assert.ok(star.y >= 0 && star.y <= CONSTELLATION_VIEWBOX.height, `${template.id}: ${star.id} y is on the board`);
    }
    for (const link of result.links) {
      assert.ok(result.stars.some(star => star.id === link.from), `${template.id}: ${link.id} starts on the board`);
      assert.ok(result.stars.some(star => star.id === link.to), `${template.id}: ${link.id} ends on the board`);
    }
    // Links only appear between two stars that are both on the board, so a short
    // board can be "rungs on a chain" rather than one continuous line. What must
    // hold is that the fragment never floats: every chosen star either joins a
    // drawn link or reaches a star outside the board through a pending one.
    const drawn = new Set(result.links.flatMap(link => [link.from, link.to]));
    const reaching = new Set(result.pendingLinks.flatMap(link => [link.from, link.to]));
    for (const star of result.stars) {
      assert.ok(drawn.has(star.id) || reaching.has(star.id), `${template.id}: ${n}-star fragment leaves ${star.id} floating`);
    }
  }
}

// Small boards keep a recognisable fragment: the selection always starts at the
// top of the priority list, so a 2-pair board and a 10-pair board describe the
// same figure.
const orion2 = selectConstellationStars('orion', 2);
assert.deepEqual(orion2.map(star => star.id), ['alnilam', 'alnitak'], 'a 2-star Orion is its belt');
const orionAll = selectConstellationStars('orion', 99);
assert.equal(orionAll.length, CONSTELLATION_STAR_MAX, 'the selection is capped at the longest board');
assert.deepEqual(orionAll.map(star => star.id), CONSTELLATION_TEMPLATES.find(t => t.id === 'orion').priority, 'a full board is the priority order');
assert.equal(selectConstellationStars('orion', 0).length, 1, 'a zero/one-pair board still gets one star');
assert.equal(selectConstellationStars('orion', null).length, CONSTELLATION_STAR_MIN, 'a missing count falls back to the minimum');

// Links are the edges between the chosen stars only.
const links = selectConstellationLinks('ursa-major', ['dubhe', 'merak', 'phecda']);
assert.deepEqual(links.map(link => link.id).sort(), ['bowl-1', 'bowl-2'], 'only links whose both ends are chosen are drawn');

// Old connection ids map onto the seven (DECISIONS #171) — and nothing is left
// without a constellation.
assert.equal(LEGACY_CONNECTION_TEMPLATE_IDS.length, CONNECTION_TEMPLATE_IDS.length, 'every old template has a mapping');
for (const oldId of CONNECTION_TEMPLATE_IDS) {
  const mapped = mapLegacyTemplate(oldId);
  assert.ok(EXPECTED.indexOf(mapped) !== -1, `${oldId} maps to a shipped constellation (${mapped})`);
}
assert.equal(new Set(CONNECTION_TEMPLATE_IDS.map(mapLegacyTemplate)).size, 7, 'no two old templates collapse onto one figure');
assert.equal(mapLegacyTemplate('orion'), '', 'a constellation id is not a legacy id');
assert.equal(mapLegacyTemplate(''), '');
assert.equal(mapLegacyTemplate(null), '');

// Resolution: constellation id → itself, old id → mapped figure, junk → default.
assert.equal(constellationTemplate('orion').id, 'orion');
assert.equal(constellationTemplate('solar-system').id, 'orion');
assert.equal(constellationTemplate('knowledge-network').id, 'ursa-major');
assert.equal(constellationTemplate('not-a-template').id, DEFAULT_CONSTELLATION);
// Absent is different from unknown: a game that never chose a figure plays the
// "để tự động" constellation, not the first one in the list.
assert.equal(constellationTemplate('').id, AUTO_CONSTELLATION);
assert.equal(constellationTemplate(null).id, AUTO_CONSTELLATION);
assert.equal(constellationTemplate(undefined).id, AUTO_CONSTELLATION);
assert.notEqual(AUTO_CONSTELLATION, DEFAULT_CONSTELLATION, 'the two fallbacks are deliberately different figures');
// A non-string id is absent, not a name: it also plays the auto figure.
assert.equal(constellationTemplate(42).id, AUTO_CONSTELLATION);
assert.equal(constellationTemplate({ id: 'orion' }).id, AUTO_CONSTELLATION, 'an object is not an id');
assert.equal(isConstellationId('orion'), true);
assert.equal(isConstellationId('solar-system'), false, 'a legacy id is not a constellation id');
assert.equal(isConstellationTemplateId('solar-system'), true, 'a legacy id is still playable (mapped)');
assert.equal(isConstellationTemplateId('nope'), false);
assert.equal(isConstellationTemplateId(undefined), false);

// Drag direction: only the two documented values survive.
assert.equal(resolveDragDirection('right-to-left'), 'right-to-left');
assert.equal(resolveDragDirection('left-to-right'), 'left-to-right');
assert.equal(resolveDragDirection(undefined), 'left-to-right');
assert.equal(resolveDragDirection('sideways'), 'left-to-right');

// The bridge into the EXISTING progression (DECISIONS #171: no third copy).
// A resolved constellation is exactly the `{ id, stages[] }` shape the two
// progression modules already understand.
const shape = constellationTemplateShape('orion', 4);
assert.equal(shape.nodes.length, 4);
assert.equal(shape.stages.length, 4);
assert.equal(new Set(shape.stages.map(stage => stage.id)).size, 4, 'stage ids are unique');
const claimed = shape.stages.flatMap(stage => stage.edgeIds);
assert.equal(new Set(claimed).size, claimed.length, 'no link is claimed by two stages');
for (const edgeId of shape.edges.map(edge => edge.id)) {
  assert.ok(claimed.includes(edgeId), `link ${edgeId} appears when its two stars exist`);
}
for (const stage of shape.stages) {
  assert.ok(stage.nodeIds.length === 1, `${stage.id} lights one star`);
  assert.ok(stage.label && stage.label.length > 0, 'every stage has a caption');
}

// The existing planner works unchanged on that shape, including a board longer
// than the constellation and a board shorter than it.
assert.deepEqual(planConnectionStages(shape, 4), shape.stages.map(stage => stage.id));
const longShape = constellationTemplateShape('lyra', 3);
assert.deepEqual(planConnectionStages(longShape, 3), longShape.stages.map(stage => stage.id));
assert.equal(planConnectionStages(longShape, 1).length, 1, 'a one-pair board is still planned');

// A full correct run finishes the picture; a wrong pair never removes a star
// (the rules the parity suite guards — reused here, not re-implemented).
let progress = resetConnectionProgress(shape);
const plan = planConnectionStages(shape, 4);
for (let i = 0; i < 4; i += 1) {
  progress = applyConnectionAnswer(progress, shape, plan, i, `p${i + 1}`, true).progress;
}
assert.equal(connectionSummary(progress, shape).connected, 4, 'four correct pairs light four stars');
const wrongThenRight = applyConnectionAnswer(resetConnectionProgress(shape), shape, plan, 0, 'p1', false);
assert.equal(connectionSummary(wrongThenRight.progress, shape).connected, 0, 'a wrong pair lights nothing');

// The validator reports real problems instead of throwing.
assert.deepEqual(validateConstellation(null), ['template is not an object']);
assert.ok(validateConstellation({ id: 'x' }).length > 0, 'an empty constellation is rejected');
const broken = JSON.parse(JSON.stringify(CONSTELLATION_TEMPLATES[0]));
broken.stars[0].x = 5000;
assert.ok(validateConstellation(broken).some(p => /outside the viewBox/.test(p)), 'an out-of-box star is reported');
const dangling = JSON.parse(JSON.stringify(CONSTELLATION_TEMPLATES[0]));
dangling.edges[0].to = 'no-such-star';
assert.ok(validateConstellation(dangling).some(p => /unknown star/.test(p)), 'a dangling link is reported');
const unordered = JSON.parse(JSON.stringify(CONSTELLATION_TEMPLATES[0]));
unordered.priority = unordered.priority.slice(1);
assert.ok(validateConstellation(unordered).some(p => /missing from the priority order/.test(p)), 'a forgotten star is reported');

console.log(`constellation-templates: ${CONSTELLATION_TEMPLATES.length} figures, ${CONSTELLATION_STAR_MIN}..${CONSTELLATION_STAR_MAX} stars verified`);
