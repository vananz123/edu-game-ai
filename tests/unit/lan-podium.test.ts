// @ts-nocheck -- unit tests share one global script scope (moduleDetection: legacy), as the other suites do.
// LAN Classroom Mode — the honour roll shown when a LAN game ends (DECISIONS #107).
//
// `lanPodiumHtml()` lives in `src/renderer/features/lan.ts`, a classic renderer
// script, so it is evaluated here the same way the browser would: the built file is
// run in a jsdom window. The ranking *rules* are also asserted against
// `lanRankPlayers()` in lan-adapters.test.ts; this file proves the two agree and
// that the podium is rendered with medals, a shared rank and no medal for 0 points.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const BUILD_ROOT = path.basename(ROOT) === 'dist' ? ROOT : path.join(ROOT, 'dist');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (error) {
  console.log('lan-podium: SKIPPED (jsdom is not installed; run npm install)');
  process.exit(0);
}

const lanScript = fs.readFileSync(path.join(BUILD_ROOT, 'src', 'renderer', 'features', 'lan.js'), 'utf8');
const { lanRankPlayers } = require('../../src/lan/lan-adapters');

// Minimal globals `features/lan.ts` touches. In the real page `shared.js` loads first
// and provides `escapeHtml` as a top-level `const`; evaluating that whole file here
// would drag in the renderer, so the same one-liner is installed on the window (a
// bare identifier resolves to the same value either way).
const dom = new JSDOM('<!doctype html><html><body><div id="modalRoot"></div><span id="playBody"></span></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
dom.window.escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
dom.window.eval(lanScript);
const lanPodiumHtml = dom.window.lanPodiumHtml;

let passed = 0;
function it(name, fn) {
  fn();
  passed += 1;
  console.log(`ok   ${name}`);
}

function player(id, name, points, correct, answered, teamId) {
  return { id, name, points, correct, answered: answered == null ? 3 : answered, connected: false, teamId: teamId || '' };
}

const TEAMS = [{ id: 't1', name: 'Đội Đỏ', icon: '🔴' }, { id: 't2', name: 'Đội Xanh', icon: '🔵' }];

/** Parse the rendered podium into { rank, medal, name, points, team } entries. */
function parse(html) {
  const wrap = dom.window.document.createElement('div');
  wrap.innerHTML = html;
  return [...wrap.querySelectorAll('[data-lan-podium]')].map(step => ({
    rank: Number(step.dataset.lanPodium),
    medal: step.querySelector('.lan-podium-medal').textContent.trim(),
    name: step.querySelector('.lan-podium-name').textContent.trim(),
    points: step.querySelector('.lan-podium-points').textContent.trim(),
    meta: step.querySelector('.lan-podium-meta').textContent.trim(),
    earned: step.classList.contains('is-earned'),
    order: dom.window.getComputedStyle(step).order || step.className
  }));
}

it('three pupils get gold, silver and bronze', () => {
  const html = lanPodiumHtml({
    teams: TEAMS,
    players: [player('p1', 'An', 300, 3, 3, 't1'), player('p2', 'Bình', 200, 2, 3, 't2'), player('p3', 'Chi', 100, 1, 3, 't1')]
  });
  const steps = parse(html);
  assert.deepEqual(steps.map(step => step.rank), [2, 1, 3], 'visual order: 2nd, 1st, 3rd so the winner is centred');
  const byRank = Object.fromEntries(steps.map(step => [step.rank, step]));
  assert.equal(byRank[1].medal, '🥇');
  assert.equal(byRank[2].medal, '🥈');
  assert.equal(byRank[3].medal, '🥉');
  assert.equal(byRank[1].name, 'An');
  assert.equal(byRank[1].points, '300 điểm');
  assert.match(byRank[1].meta, /Đội Đỏ/);
});

it('a class of two fills only two steps', () => {
  const steps = parse(lanPodiumHtml({
    teams: [],
    players: [player('p1', 'An', 100, 1), player('p2', 'Bình', 50, 0)]
  }));
  assert.equal(steps.length, 2);
  assert.deepEqual(steps.map(step => step.rank).sort(), [1, 2]);
});

it('a class of one still gets the podium, not an empty box', () => {
  const steps = parse(lanPodiumHtml({ teams: [], players: [player('p1', 'An', 100, 1)] }));
  assert.equal(steps.length, 1);
  assert.equal(steps[0].medal, '🥇');
});

it('nobody scoring means no medals are handed out', () => {
  const steps = parse(lanPodiumHtml({
    teams: [],
    players: [player('p1', 'An', 0, 0, 2), player('p2', 'Bình', 0, 0, 2)]
  }));
  assert.deepEqual(steps.map(step => step.medal), ['', ''], 'a 0-point class must not be crowned');
  assert.deepEqual(steps.map(step => step.earned), [false, false]);
});

it('a shared rank says "đồng hạng" and both get the medal', () => {
  const steps = parse(lanPodiumHtml({
    teams: [],
    players: [player('p1', 'An', 200, 2), player('p2', 'Bình', 200, 2), player('p3', 'Chi', 100, 1)]
  }));
  const firsts = steps.filter(step => step.rank === 1);
  assert.equal(firsts.length, 2);
  firsts.forEach(step => {
    assert.equal(step.medal, '🥇');
    assert.match(step.name, /đồng hạng/);
  });
  // 4th pupil would be rank 2; with three pupils the third is the next distinct rank.
  const third = steps.find(step => step.name.startsWith('Chi'));
  assert.equal(third.rank, 2, 'two firsts then second — never a skipped rank');
  assert.equal(third.medal, '🥈');
});

it('ranks four and beyond go to the list under the podium', () => {
  const html = lanPodiumHtml({
    teams: [],
    players: [
      player('p1', 'An', 400, 4), player('p2', 'Bình', 300, 3), player('p3', 'Chi', 200, 2), player('p4', 'Dũng', 100, 1)
    ]
  });
  const wrap = dom.window.document.createElement('div');
  wrap.innerHTML = html;
  assert.equal(wrap.querySelectorAll('[data-lan-podium]').length, 3, 'the podium holds three');
  const rest = [...wrap.querySelectorAll('.lan-ranking-rest li')].map(li => li.textContent.trim());
  assert.equal(rest.length, 1);
  assert.match(rest[0], /4\.\s*Dũng/);
});

it('names are escaped (a pupil name is untrusted input)', () => {
  const html = lanPodiumHtml({ teams: [], players: [player('p1', '<img src=x onerror=alert(1)>', 100, 1)] });
  const wrap = dom.window.document.createElement('div');
  wrap.innerHTML = html;
  assert.equal(wrap.querySelectorAll('img').length, 0, 'markup in a name must not create elements');
  assert.match(wrap.textContent, /<img src=x/);
});

it('an empty room renders nothing rather than an empty heading', () => {
  assert.equal(lanPodiumHtml({ teams: [], players: [] }), '');
  assert.equal(lanPodiumHtml(null), '');
});

it('the renderer agrees with lanRankPlayers() on order and ranks', () => {
  const players = [
    player('p1', 'An', 200, 2), player('p2', 'Bình', 200, 2), player('p3', 'Chi', 100, 1), player('p4', 'Dũng', 50, 0)
  ];
  const fromAdapter = lanRankPlayers(players, [], 3).map(entry => `${entry.rank}:${entry.name}`);
  // The podium renders in visual order (2, 1, 3); sort back to rank order to compare.
  const fromRenderer = parse(lanPodiumHtml({ teams: [], players }))
    .slice()
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'vi'))
    .map(step => `${step.rank}:${step.name.replace(/\s*đồng hạng$/, '')}`);
  assert.deepEqual(fromRenderer, fromAdapter.sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0])));
});

console.log(`lan-podium: ${passed} checks passed`);
