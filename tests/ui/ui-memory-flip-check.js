#!/usr/bin/env node
/**
 * DECISIONS #322 — a memory card must FLIP, not slide in from the edge.
 *
 * The card was animated with `rotateY(90deg -> 0deg)` and no perspective, so on a
 * flat element the browser projects the rotation away: the card looks like it grows
 * from a thin line at the edge. The plan called this "thẻ trượt ra từ cạnh chứ không
 * lật" and it is right — but the fix has to be MEASURED, because a 2D `matrix(...)`
 * and a 3D `matrix3d(...)` look identical in the stylesheet and only one of them is
 * a flip.
 *
 * What this gate reads is the computed transform DURING the animation:
 *   - mid-flip it must be `matrix3d` (the perspective term), i.e. a real 3D flip,
 *   - it must land with no residual transform (a card left skewed is unreadable),
 *   - with reduced motion there is no animation at all.
 *
 * Usage: `node tests/ui/ui-memory-flip-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9343';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const PAIRS = [
  { id: 'p1', left: 'Nhóm A', right: 'Mục A1' },
  { id: 'p2', left: 'Nhóm A', right: 'Mục A2' },
  { id: 'p3', left: 'Nhóm B', right: 'Mục B1' }
];

const GAME = {
  id: 'flip322',
  title: 'Thẻ bộ nhớ lật',
  template: 'matching',
  subject: 'Tự nhiên',
  grade: '4',
  description: '',
  matchingGame: { mode: 'memory', pairs: PAIRS, wrongPenalty: 10, completionBonus: 50, timeBonus: 20, bonusUnderSeconds: 60, practiceMode: false }
};

const SCENARIO = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  for (let i = 0; i < 40; i++) {
    if (document.querySelector('#modalRoot .setup-fullscreen')) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);
  if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
  await sleep(300);

  playGame(${JSON.stringify(GAME)}, { fullscreen: false });
  await sleep(900);
  document.querySelectorAll('.modal, .modal-backdrop').forEach(el =>
    el.getAnimations().forEach(a => { try { a.finish(); } catch (e) { void e; } }));

  const cards = [...document.querySelectorAll('.memory-card')];
  out.cardCount = cards.length;
  const card = cards[0];
  if (!card) return out;
  out.faceBefore = card.textContent.trim().slice(0, 24);

  // Park the pointer away from the board: a hovered card applies its own
  // transform and would be measured instead of the animation (#271).
  const empty = document.querySelector('.stage-meta') || document.body;
  const e = empty.getBoundingClientRect();
  card.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));

  const style = () => {
    const cs = getComputedStyle(card);
    return {
      t: Math.round(performance.now() - t0),
      transform: cs.transform,
      animation: cs.animationName,
      opacity: cs.opacity
    };
  };
  card.click();
  const t0 = performance.now();
  const samples = [];
  for (let i = 0; i < 20; i += 1) {
    samples.push(style());
    await sleep(25);
  }
  await sleep(200);
  out.samples = samples;
  out.landed = { transform: getComputedStyle(card).transform, animation: getComputedStyle(card).animationName };
  out.flipped = card.classList.contains('flipped');
  out.faceAfter = card.textContent.trim().slice(0, 24);

  if (typeof closeGame === 'function') { try { closeGame(); } catch (e2) { void e2; } }
  await sleep(300);
  return out;
})()`;

const REDUCED = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
  await sleep(300);
  playGame(${JSON.stringify(GAME)}, { fullscreen: false });
  await sleep(900);
  document.querySelectorAll('.modal, .modal-backdrop').forEach(el =>
    el.getAnimations().forEach(a => { try { a.finish(); } catch (e) { void e; } }));
  const card = document.querySelector('.memory-card');
  if (!card) return { found: false };
  const before = getComputedStyle(card);
  const startTransform = before.transform;
  card.click();
  const after = getComputedStyle(card);
  const out = {
    found: true,
    animation: after.animationName,
    transform: after.transform,
    startTransform
  };
  if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
  await sleep(200);
  return out;
})()`;

(async () => {
  const cdp = await connect();

  const raw = await cdp.evaluate(SCENARIO);
  const r = raw.result ? raw.result.value : raw;
  const samples = r.samples || [];
  const is3d = transform => /^matrix3d\(/i.test(String(transform || ''));
  const isFlat = transform => !transform || transform === 'none' || /^matrix\(1, 0, 0, 1, 0, 0\)$/i.test(transform);
  const threeD = samples.filter(sample => is3d(sample.transform));
  const animated = samples.filter(sample => sample.animation === 'memory-flip');

  check('the memory board drew its cards', r.cardCount >= 6, `${r.cardCount} thẻ`);
  check('clicking a card starts the memory-flip animation', animated.length > 0, animated[0] ? animated[0].animation : '(none)');
  // A rotateY() alone is ALREADY a matrix3d, so "matrix3d present" proves nothing —
  // the first version of this gate passed 8/8 on the broken card. What a perspective
  // adds is the depth term m34 (= -1/d) in the computed matrix; without it the card
  // is a flat squeeze (width -> 0), which is exactly what the plan complained about.
  const depthTerm = sample => {
    const match = /^matrix3d\(([^)]+)\)$/i.exec(String(sample.transform || ''));
    if (!match) return 0;
    const nums = match[1].split(',').map(Number);
    return Number.isFinite(nums[11]) ? Math.abs(nums[11]) : 0;
  };
  const withDepth = samples.filter(sample => depthTerm(sample) > 0.0002);
  check('the flip is really 3D mid-animation — a perspective depth term, not a flat squeeze',
    withDepth.length > 0,
    withDepth.length ? `${withDepth.length} mẫu có m34=${depthTerm(withDepth[0]).toFixed(5)}` : 'không mẫu nào có m34 (không perspective)');
  check('the card is not zero-width at any point of the flip (a flat squeeze loses the face)',
    threeD.every(sample => {
      const match = /^matrix3d\(([^)]+)\)$/i.exec(String(sample.transform || ''));
      if (!match) return true;
      const nums = match[1].split(',').map(Number);
      return Math.abs(nums[0]) > 0.05 || Math.abs(nums[1]) > 0.05;
    }), 'chiều rộng hiệu dụng luôn > 0');
  check('the card moves through several intermediate transforms instead of snapping',
    new Set(samples.map(sample => sample.transform)).size >= 3,
    `${new Set(samples.map(sample => sample.transform)).size} giá trị khác nhau`);
  check('the card lands flat — no residual rotation left on the face',
    isFlat(r.landed && r.landed.transform), r.landed && r.landed.transform);
  check('the card keeps the flipped state and its face is readable after the flip',
    r.flipped === true && String(r.faceAfter || '').length > 0, `${r.faceAfter || ''}`.slice(0, 30));

  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  try {
    const reducedRaw = await cdp.evaluate(REDUCED);
    const d = reducedRaw.result ? reducedRaw.result.value : reducedRaw;
    check('reduced motion: the card has no animation at all', d.found === true && d.animation === 'none', d.animation);
    check('reduced motion: the card is flat the moment it is clicked', isFlat(d.transform), d.transform);
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  }

  const failed = results.filter(entry => !entry.ok).length;
  console.log('');
  console.log(failed === 0
    ? `ui-memory-flip-check: ${results.length}/${results.length} passed`
    : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
