// @ts-nocheck -- pure template data tests (DECISIONS #168).
const assert = require('node:assert/strict');
const {
  CONNECTION_TEMPLATES,
  CONNECTION_TEMPLATE_IDS,
  CONNECTION_VIEWBOX,
  CONNECTION_STAGE_MIN,
  CONNECTION_STAGE_MAX,
  DEFAULT_CONNECTION_TEMPLATE,
  connectionTemplate,
  isConnectionTemplateId,
  connectionNodeFraction,
  validateConnectionTemplate
} = require('../../src/shared/connection-templates');

// The seven templates required by update_game.txt §3 are all shipped.
const EXPECTED = [
  'knowledge-network',
  'bridge',
  'solar-system',
  'circuit',
  'ecosystem',
  'timeline',
  'geometry'
];
assert.deepEqual(CONNECTION_TEMPLATE_IDS, EXPECTED, 'the seven documented templates ship in order');
assert.equal(CONNECTION_TEMPLATES.length, EXPECTED.length);

// Every template passes its own structural validator — no warnings.
for (const template of CONNECTION_TEMPLATES) {
  assert.deepEqual(validateConnectionTemplate(template), [], `${template.id} must be structurally valid`);
}

// Ids are unique, named in Vietnamese and carry a stage count inside the range.
const ids = new Set();
for (const template of CONNECTION_TEMPLATES) {
  assert.equal(ids.has(template.id), false, `duplicate template id ${template.id}`);
  ids.add(template.id);
  assert.ok(template.name && template.name.length > 2, `${template.id} needs a display name`);
  assert.ok(template.description.length > 20, `${template.id} needs a usable description`);
  assert.ok(template.stages.length >= CONNECTION_STAGE_MIN && template.stages.length <= CONNECTION_STAGE_MAX,
    `${template.id} has ${template.stages.length} stages`);
}

// Templates are visually distinct: no two share the same node layout.
const layouts = new Set(CONNECTION_TEMPLATES.map(t => t.nodes.map(n => `${n.x},${n.y}`).join('|')));
assert.equal(layouts.size, CONNECTION_TEMPLATES.length, 'every template draws a different picture');

// Every edge is claimed by exactly one stage, so no connection is unreachable.
for (const template of CONNECTION_TEMPLATES) {
  const claimed = template.stages.flatMap(stage => stage.edgeIds);
  assert.equal(claimed.length, template.edges.length, `${template.id}: every edge is claimed exactly once`);
  assert.equal(new Set(claimed).size, claimed.length, `${template.id}: no edge claimed twice`);
  const edgeIds = new Set(template.edges.map(edge => edge.id));
  for (const id of claimed) assert.ok(edgeIds.has(id), `${template.id}: stage references real edge ${id}`);
}

// Nodes sit inside the viewBox (the 3D renderer places them by fraction).
for (const template of CONNECTION_TEMPLATES) {
  for (const node of template.nodes) {
    assert.ok(node.x >= 0 && node.x <= CONNECTION_VIEWBOX.width, `${template.id}/${node.id} x in viewBox`);
    assert.ok(node.y >= 0 && node.y <= CONNECTION_VIEWBOX.height, `${template.id}/${node.id} y in viewBox`);
    const fraction = connectionNodeFraction(node);
    assert.ok(fraction.fx >= 0 && fraction.fx <= 1 && fraction.fy >= 0 && fraction.fy <= 1);
  }
}

// Unknown / missing ids fall back to the default template — never an error.
assert.equal(connectionTemplate('knowledge-network').id, 'knowledge-network');
assert.equal(connectionTemplate('bridge').id, 'bridge');
assert.equal(connectionTemplate('not-a-template').id, DEFAULT_CONNECTION_TEMPLATE);
assert.equal(connectionTemplate('').id, DEFAULT_CONNECTION_TEMPLATE);
assert.equal(connectionTemplate(null).id, DEFAULT_CONNECTION_TEMPLATE);
assert.equal(connectionTemplate(undefined).id, DEFAULT_CONNECTION_TEMPLATE);
assert.equal(connectionTemplate(42).id, DEFAULT_CONNECTION_TEMPLATE);
assert.equal(connectionTemplate({ id: 'bridge' }).id, DEFAULT_CONNECTION_TEMPLATE);

assert.equal(isConnectionTemplateId('timeline'), true);
assert.equal(isConnectionTemplateId('not-a-template'), false);
assert.equal(isConnectionTemplateId(undefined), false);

// The validator reports real problems instead of throwing.
assert.deepEqual(validateConnectionTemplate(null), ['template is not an object']);
assert.ok(validateConnectionTemplate({ id: 'x' }).length > 0, 'an empty template is rejected');
const broken = JSON.parse(JSON.stringify(CONNECTION_TEMPLATES[1]));
broken.nodes[1].x = 5000;
assert.ok(validateConnectionTemplate(broken).some(p => /outside the viewBox/.test(p)), 'out-of-bounds node is reported');
const doubleClaim = JSON.parse(JSON.stringify(CONNECTION_TEMPLATES[1]));
doubleClaim.stages[1].edgeIds.push(doubleClaim.stages[0].edgeIds[0]);
assert.ok(validateConnectionTemplate(doubleClaim).some(p => /claimed by two stages/.test(p)), 'double-claimed edge is reported');
const danglingEdge = JSON.parse(JSON.stringify(CONNECTION_TEMPLATES[1]));
danglingEdge.edges[0].to = 'nope';
assert.ok(validateConnectionTemplate(danglingEdge).some(p => /unknown node/.test(p)), 'dangling edge is reported');

console.log('connection-templates: all checks passed');
