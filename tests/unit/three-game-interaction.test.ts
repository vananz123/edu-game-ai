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
  'makeDestructible', 'makeUnlockable', 'makeConstruction', 'makeReactive', 'celebrate',
  'on', 'emit'
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
    return 'ok';
  })()`),
  'ok',
  'null/undefined handles must be ignored, never throw'
);

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

console.log('three-game-interaction: API surface + WebGL-off fallback + patterns verified');
