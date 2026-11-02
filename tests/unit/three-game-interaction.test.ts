import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/**
 * The shared 3D layer must expose its API and degrade to a safe no-op when WebGL
 * is absent — the classroom machines that fall back to the plain 2D surface.
 * Loading three.global.js + three-game-interaction.js here (in index.html order)
 * also guards the layer's top level against touching the DOM or THREE at load
 * time; the WebGL-on path is exercised by tests/ui/ui-three-game-check.js.
 */

const ROOT = path.join(__dirname, '..', '..', '..');
const DIST = path.join(ROOT, 'dist', 'src');

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
    querySelector: () => null,
    querySelectorAll: () => [],
    focus: noop,
    blur: noop,
    remove: noop,
    parentNode: null,
    children: [],
    dataset: {},
    innerHTML: '',
    textContent: ''
  };
}

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
const context = vm.createContext(sandbox);

const threePath = path.join(DIST, 'renderer', 'vendor', 'three.global.js');
const layerPath = path.join(DIST, 'renderer', 'features', 'three-game-interaction.js');
assert.ok(fs.existsSync(threePath), 'three.global.js must exist — run npm run build');
assert.ok(fs.existsSync(layerPath), 'three-game-interaction.js must exist — run npm run build');

vm.runInContext(fs.readFileSync(threePath, 'utf8'), context, { filename: 'three.global.js' });
vm.runInContext(fs.readFileSync(layerPath, 'utf8'), context, { filename: 'three-game-interaction.js' });

const run = (code: string) => vm.runInContext(code, context);

assert.equal(run('typeof THREE.Scene'), 'function', 'THREE must be a global before the layer loads');
assert.equal(run('typeof threeGame'), 'object', 'threeGame must be exposed on the global object');
for (const method of [
  'isAvailable', 'mount', 'unmount', 'setPaused', 'burst', 'addHoverEffect', 'addClickableObject', 'addObject',
  'stagePoint', 'anchor', 'tween', 'effect',
  'makeDestructible', 'makeUnlockable', 'makeConstruction', 'makeReactive',
  'makeNodeGraph', 'makeGlow', 'makeCosmos', 'dolly', 'resetDolly',
  // #171: the constellation board's whole input contract.
  'enableDrag', 'onDropStar', 'pick', 'refreshAnchors',
  'celebrate', 'on', 'emit'
]) {
  assert.equal(run(`typeof threeGame.${method}`), 'function', `threeGame.${method} must exist`);
}

// The stub's canvas has no getContext, so the layer must report "not available"
// and every entry point must no-op rather than crash.
assert.equal(run('threeGame.isAvailable()'), false, 'no WebGL in this stub → isAvailable() false');
assert.equal(run('threeGame.mount(document.body)'), null, 'mount without WebGL returns null');
assert.equal(run('threeGame.mount(null)'), null, 'mount(null) is safe');
assert.equal(
  run(`(() => {
    threeGame.unmount(null);
    threeGame.unmount(undefined);
    threeGame.setPaused(null, true);
    threeGame.burst(null);
    threeGame.addHoverEffect(null, null);
    threeGame.addClickableObject(null, null, () => {});
    threeGame.addObject(null, null);
    threeGame.stagePoint(null, 0.5, 0.5);
    threeGame.anchor(null, null, 0.5, 0.5);
    // #171: the drop surface must no-op without a handle instead of throwing.
    threeGame.enableDrag(null);
    threeGame.onDropStar(null, () => {});
    threeGame.pick(null, 10, 10);
    threeGame.refreshAnchors(null);
    return 'ok';
  })()`),
  'ok',
  'null/undefined handles must be ignored, never throw'
);

// ---- Object Connection 3D board (DECISIONS #169) --------------------------
// makeNodeGraph turns a template into real geometry: one root per node, one
// group of segments per link, and a `setEarned` that only reveals what was
// earned. It runs with no WebGL because a mounted handle is not needed to build
// the graph — the caller adds it to a handle.
const graph = run(`(() => {
  const g = threeGame.makeNodeGraph({
    nodes: [
      { id: 'a', x: 0, y: 0, z: 0, kind: 'plate' },
      { id: 'b', x: 4, y: 2, z: 0, kind: 'ring' },
      { id: 'c', x: -3, y: -2, z: 0, kind: 'dot' }
    ],
    links: [
      { id: 'ab', from: 'a', to: 'b', bend: 0 },
      { id: 'bc', from: 'b', to: 'c', bend: 1.2 }
    ]
  });
  return {
    nodes: Object.keys(g.nodes).length,
    links: g.links.length,
    plateChildren: g.nodes.a.root.children.length,
    ringChildren: g.nodes.b.root.children.length,
    // #172: an edge is ONE mesh (a UV-clipped tube that draws itself on), not a
    // stitched row of boxes — cheaper to build and cheaper to animate.
    linkChildren: g.links.find(l => l.id === 'bc').group.children.length,
    hasReveal: Boolean(g.links.find(l => l.id === 'bc').tube),
    revealAtStart: g.links.find(l => l.id === 'bc').reveal,
    groupChildren: g.group.children.length,
    bPosition: { x: g.nodes.b.root.position.x, y: g.nodes.b.root.position.y },
    disposeType: typeof g.dispose
  };
})()`);
assert.equal(graph.nodes, 3, 'makeNodeGraph builds one root per node');
assert.equal(graph.links, 2, 'makeNodeGraph builds one group per link');
assert.equal(graph.plateChildren, 2, 'a plate is a body plus a ghost outline');
assert.equal(graph.ringChildren, 2, 'a ring is a body plus a ghost outline');
assert.equal(graph.linkChildren, 1, 'a link is ONE reveal line (DECISIONS #172)');
assert.equal(graph.hasReveal, true, 'the link owns the mesh that draws it on');
assert.equal(graph.revealAtStart, 0, 'nothing is drawn before a match');
assert.equal(graph.groupChildren, 5, 'the group holds every node and every link');
// The values come from the vm realm, so they are compared as JSON rather than
// through deepEqual's prototype check.
assert.equal(JSON.stringify(graph.bPosition), JSON.stringify({ x: 4, y: 2 }),
  'a node keeps the x/y it was given (y already flipped by the caller)');
assert.equal(graph.disposeType, 'function', 'the graph is disposable');

// Provisional visibility: nothing earned → every link segment is a ghost and
// every node keeps its ghost outline on. `setEarned(null, …)` must no-op (no
// handle), so this asserts the initial state only.
assert.equal(
  run(`(() => {
    const g = threeGame.makeNodeGraph({ nodes: [{ id: 'a', x: 0, y: 0, kind: 'dot' }, { id: 'b', x: 1, y: 1, kind: 'dot' }], links: [{ id: 'l', from: 'a', to: 'b' }] });
    g.setEarned(null, ['a'], ['l'], { animate: false });
    return 'safe';
  })()`),
  'safe',
  'setEarned without a handle must not throw'
);

// A star (DECISIONS #171) is a different shape from the old plate/dot: a
// generous drop-target body, a ghost for "not yet", and a halo that only shows
// when lit. Its body carries `starId`, which is what the hit-test returns.
const star = run(`(() => {
  const g = threeGame.makeNodeGraph({
    nodes: [
      { id: 's1', x: 0, y: 0, z: 0, kind: 'star', brightness: 1 },
      { id: 's2', x: 3, y: 0, z: 0, kind: 'star', brightness: 0.4 }
    ],
    links: [{ id: 'l', from: 's1', to: 's2' }]
  });
  const entry = g.nodes.s1;
  const dim = g.nodes.s2;
  return {
    children: entry.root.children.length,
    hasHalo: Boolean(entry.halo),
    starId: entry.mesh.userData.starId,
    haloId: entry.halo.userData.starId,
    brighter: Number(entry.mesh.geometry.parameters.radius),
    dimmer: Number(dim.mesh.geometry.parameters.radius),
    dimGhostScale: Number(dim.root.scale.x),
    hasBloom: Boolean(entry.bloom),
    sprites: g.sprites.length
  };
})()`);
assert.equal(star.children, 4, 'a star is body + ghost + halo + bloom');
assert.equal(star.hasHalo, true, 'a star owns its halo');
assert.equal(star.hasBloom, true, 'a star owns the outer bloom that twinkles');
assert.equal(star.starId, 's1', 'the hit-test body answers with its star id');
assert.equal(star.haloId, 's1', 'the halo answers for the same star (it is part of the target)');
assert.ok(star.brighter > star.dimmer, `a brighter star is bigger (${star.brighter} vs ${star.dimmer})`);

// makeGlow is a hidden halo until pulsed, and pulsing without a handle is inert.
const glow = run(`(() => {
  const g = threeGame.makeGlow({ color: '#f87171', size: 0.5 });
  const before = g.mesh.visible;
  g.pulse(null);
  return { before, after: g.mesh.visible, disposeType: typeof g.dispose };
})()`);
assert.equal(glow.before, false, 'a glow starts hidden');
assert.equal(glow.after, false, 'pulse() without a handle leaves it hidden');
assert.equal(glow.disposeType, 'function', 'the glow is disposable');

// dolly/resetDolly are safe without a handle and must not touch a camera.
assert.equal(run(`(() => { threeGame.dolly(null, 1); threeGame.resetDolly(undefined); return 'ok'; })()`), 'ok',
  'dolly helpers ignore a missing handle');

// The pattern factories build real procedural geometry (THREE is available in
// this sandbox even though WebGL is not) — construction stacks one block per
// step, destructible spawns fragments, unlockable a base + lid, reactive a mesh.
assert.equal(
  run('threeGame.makeConstruction({ steps: 5 }).group.children.length'),
  5,
  'makeConstruction builds one block per step'
);
assert.equal(
  run('threeGame.makeConstruction({ steps: 3 }).blocks.length'),
  3,
  'makeConstruction exposes its blocks'
);
// The `parts` form builds one stage-group per entry, each holding its primitives
// (a heterogeneous house build), while `blocks` stays a flat list of every mesh.
assert.equal(
  run(`(() => {
    const c = threeGame.makeConstruction({
      parts: [
        [{ kind: 'box', w: 1, h: 1, d: 1 }],
        [{ kind: 'roof', w: 1, h: 1, d: 1 }],
        [{ kind: 'box', w: 1, h: 1, d: 1 }, { kind: 'cylinder', r: 0.5, h: 1 }]
      ]
    });
    return [c.group.children.length, c.blocks.length, c.steps].join(',');
  })()`),
  '3,4,3',
  'makeConstruction(parts) builds one stage-group per entry and flattens blocks'
);
assert.equal(
  run(`(() => {
    const c = threeGame.makeConstruction({
      parts: [{ kind: 'roof', w: 1, h: 1, d: 1 }]
    });
    return c.blocks[0].rotation.z === Math.PI / 4 ? 'roof-rotated' : 'flat';
  })()`),
  'roof-rotated',
  'a roof part is tilted like a gable'
);
assert.equal(
  run('threeGame.makeDestructible({ fragments: 6 }).pieces.length'),
  6,
  'makeDestructible builds the requested fragments'
);
assert.equal(
  run('threeGame.makeUnlockable().group.children.length'),
  2,
  'makeUnlockable builds a base + lid'
);
assert.ok(
  run('threeGame.makeReactive().mesh instanceof THREE.Mesh'),
  'makeReactive builds a mesh'
);

// Every animated action must no-op (never throw) on a null/absent handle.
assert.equal(
  run(`(() => {
    threeGame.tween(null, { target: {}, path: 'x', to: 1 });
    threeGame.effect(null, () => {}, 0.5);
    const d = threeGame.makeDestructible();
    d.shatter(null);
    d.reset();
    const u = threeGame.makeUnlockable();
    u.open(null);
    u.reset();
    const c = threeGame.makeConstruction({ steps: 3 });
    c.setStage(null, 2);
    const r = threeGame.makeReactive();
    r.flash(null, 'correct');
    threeGame.celebrate(null);
    return 'ok';
  })()`),
  'ok',
  'pattern actions ignore null/absent handles'
);

// The named-event registry routes intents to handlers and swallows bad ones.
assert.equal(
  run(`(() => {
    let got = null;
    threeGame.on('answer:correct', (d) => { got = d; });
    threeGame.emit('answer:correct', { points: 10 });
    threeGame.on('boom', () => { throw new Error('x'); });
    threeGame.emit('boom', {});
    return got && got.points === 10 ? 'ok' : 'fail';
  })()`),
  'ok',
  'on/emit delivers detail and a throwing handler does not break emit'
);

// ---- cosmos (DECISIONS #173) ------------------------------------------------
// The room a constellation floats in: one gradient sky, ONE point cloud of
// distant stars, a few lobes of gas. It must build under the stub document (its
// canvas has no `getContext`), which is exactly why the stars and the clouds are
// shaders rather than textures — a projector laptop pays three extra draw calls
// and no per-frame geometry work.
const cosmos = run(`(() => {
  const c = threeGame.makeCosmos({ count: 40, pixelScale: 2, accent: '#6d7cf0' });
  return {
    group: c.group instanceof THREE.Group,
    fieldInside: c.group.children.indexOf(c.field) !== -1,
    skyInside: c.group.children.indexOf(c.sky) !== -1,
    starsInField: c.field.children.indexOf(c.stars) !== -1,
    stars: c.stars instanceof THREE.Points,
    starCount: c.stars.geometry.attributes.position.count,
    sized: Boolean(c.stars.geometry.attributes.aSize) && c.stars.geometry.attributes.aSize.count === 40,
    phased: Boolean(c.stars.geometry.attributes.aPhase) && c.stars.geometry.attributes.aPhase.count === 40,
    pointScale: c.uniforms.stars.uScale.value,
    clouds: c.clouds.length,
    cloudUniforms: c.clouds.every(x => x.mesh.material.uniforms.uTime !== undefined),
    skyBackSide: c.sky.material.side === THREE.BackSide,
    skyOpaque: c.sky.material.transparent === false,
    additiveStars: c.stars.material.blending === THREE.AdditiveBlending,
    starsNoDepthWrite: c.stars.material.depthWrite === false
  };
})()`);
// The object comes from the vm realm, so it is compared as JSON (same reason as
// `graph.bPosition` above): deepEqual would fail on the prototype, not the value.
assert.equal(
  JSON.stringify(cosmos),
  JSON.stringify({
    group: true,
    fieldInside: true,
    skyInside: true,
    starsInField: true,
    stars: true,
    starCount: 40,
    sized: true,
    phased: true,
    pointScale: 2,
    clouds: 3,
    cloudUniforms: true,
    skyBackSide: true,
    skyOpaque: true,
    additiveStars: true,
    starsNoDepthWrite: true
  }),
  'makeCosmos builds one sky + one star cloud + three gas lobes without touching the DOM'
);

// Time: the twinkle is a uniform, not a per-frame attribute rewrite. A caught-up
// dt (a tab that came back, a hidden window) must advance one frame's worth, and
// `prefers-reduced-motion` must freeze the field without switching it off.
const cosmosTime = run(`(() => {
  const c = threeGame.makeCosmos({ count: 8 });
  c.tick(0.016, false);
  const one = c.uniforms.stars.uTime.value;
  c.tick(5, false);
  const caught = c.uniforms.stars.uTime.value;
  const caughtSpin = c.field.rotation.y;
  c.tick(5, true);
  return { one, spun: c.field.rotation.y, caught, caughtSpin, afterReduced: c.uniforms.stars.uTime.value, spunAfterReduced: c.field.rotation.y };
})()`);
assert.ok(cosmosTime.one > 0, 'tick advances the star twinkle');
assert.ok(cosmosTime.spun > 0, 'tick turns the field');
assert.equal(cosmosTime.caught, cosmosTime.one + 0.1, 'a long dt is clamped, never replayed as a jump');
assert.equal(cosmosTime.afterReduced, cosmosTime.caught, 'reduced motion freezes the twinkle');
assert.equal(cosmosTime.spunAfterReduced, cosmosTime.caughtSpin, 'reduced motion freezes the drift');

// An empty field and a bare call must build, tick and dispose without throwing:
// the board creates the cosmos on every mount and only unmount disposes it.
assert.equal(
  run(`(() => {
    const empty = threeGame.makeCosmos({ count: 0 });
    empty.tick(0.016, false);
    empty.dispose();
    const bare = threeGame.makeCosmos();
    bare.tick(0.016, true);
    bare.dispose();
    return 'ok';
  })()`),
  'ok',
  'makeCosmos tolerates count 0, no options, and dispose'
);

console.log('three-game-interaction: API surface + WebGL-off fallback + patterns verified');
