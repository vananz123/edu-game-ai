#!/usr/bin/env node
/**
 * DECISIONS #329 — a found pair must FLASH, and the flash must not touch readability.
 *
 * Plan item S3-6 ("match flash"). What this gate proves is not that a colour exists
 * but that the celebration is a RING (a spread that expands and dies) and that it
 * leaves the card's opacity alone — opacity and ink colour are what the readability
 * contract of a matched card depends on.
 *
 * Two traps this gate had to fix in itself, both worth remembering:
 *   - computed box-shadow is "rgb(...) x y blur SPREAD": reading the third length
 *     measures the card's own static glow, not the ring;
 *   - `animation-name` stays `match-flash` AFTER the animation finished, so "did it
 *     end" can never be read from the name (the #325 lesson).
 *
 * Usage: `node tests/ui/ui-match-flash-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9348';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const PAIRS = [
  { id: 'p1', left: 'Nhóm A', right: 'Mục A1' },
  { id: 'p2', left: 'Nhóm A', right: 'Mục A2' },
  { id: 'p3', left: 'Nhóm B', right: 'Mục B1' }
];

const game = mode => ({
  id: `flash329-${mode}`,
  title: `Nhấp nháy ${mode}`,
  template: 'matching',
  subject: 'Tự nhiên',
  grade: '4',
  description: '',
  matchingGame: { mode, pairs: PAIRS, wrongPenalty: 10, completionBonus: 50, timeBonus: 20, bonusUnderSeconds: 60, practiceMode: false }
});

const SCENARIO = mode => String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = { mode: ${JSON.stringify(mode)} };
  for (let i = 0; i < 40; i++) {
    if (document.querySelector('#modalRoot .setup-fullscreen')) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);
  if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
  await sleep(300);
  playGame(${JSON.stringify(game(mode))}, { fullscreen: false });
  await sleep(900);
  if (${JSON.stringify(mode)} === 'memory') {
    const cards = [...document.querySelectorAll('.memory-card[data-pair="p1"]')];
    if (cards.length < 2) { out.error = 'không đủ thẻ bộ nhớ'; return out; }
    cards[0].click();
    await sleep(480);
    cards[1].click();
  } else {
    const left = document.querySelector('[data-match-side="left"][data-pair="p1"]');
    const right = document.querySelector('[data-match-side="right"][data-pair="p1"]');
    if (!left || !right) { out.error = 'không thấy hai thẻ của cặp p1'; return out; }
    left.click();
    await sleep(150);
    right.click();
  }
  const matched = [...document.querySelectorAll('.match-card.matched, .memory-card.matched')];
  out.matchedCount = matched.length;
  const card = matched[0];
  if (!card) return out;
  const t0 = performance.now();
  const sample = () => {
    const cs = getComputedStyle(card);
    return { t: Math.round(performance.now() - t0), animation: cs.animationName, shadow: cs.boxShadow, opacity: cs.opacity };
  };
  // Read the keyframes NOW: a finished animation leaves getAnimations(), so asking
  // 800ms later returns nothing and the check "cannot read keyframes" fails.
  // getAnimations() also lists CSS TRANSITIONS (the card transitions border-colour and
  // box-shadow), and the first one is not necessarily the keyframe animation — pick it
  // by name or this check reads a transition and reports "borderBottomColor".
  const running = card.getAnimations().find(anim => anim.animationName === 'match-flash');
  out.animatedProps = running ? [...new Set(running.effect.getKeyframes()
    .flatMap(frame => Object.keys(frame))
    .filter(key => !['offset', 'computedOffset', 'easing', 'composite'].includes(key)))] : [];
  const samples = [];
  for (let i = 0; i < 22; i += 1) { samples.push(sample()); await sleep(28); }
  await sleep(400);
  out.samples = samples;
  out.settled = sample();
  if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
  await sleep(300);
  return out;
})()`;

const REDUCED = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
  await sleep(300);
  playGame(${JSON.stringify(game('columns'))}, { fullscreen: false });
  await sleep(900);
  const left = document.querySelector('[data-match-side="left"][data-pair="p1"]');
  const right = document.querySelector('[data-match-side="right"][data-pair="p1"]');
  if (!left || !right) return { error: 'no cards' };
  left.click();
  await sleep(120);
  right.click();
  const card = document.querySelector('.match-card.matched');
  const out = { found: Boolean(card), animation: card ? getComputedStyle(card).animationName : null };
  if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
  await sleep(200);
  return out;
})()`;

// Computed box-shadow is "rgb(...) x y BLUR SPREAD". The ring is a SPREAD, so the
// fourth length is the one to read — the third is the card's own static glow.
const spread = shadow => {
  const lengths = String(shadow || '').replace(/rgba?\([^)]*\)/g, '').match(/-?[\d.]+px/g);
  if (!lengths || lengths.length < 4) return 0;
  return Math.abs(parseFloat(lengths[3]));
};

(async () => {
  const cdp = await connect();

  // Memory cards are NOT measured here: their celebration is the flip (#322), and one
  // element cannot carry two animations. This gate owns the card pair only.
  for (const mode of ['columns']) {
    const raw = await cdp.evaluate(SCENARIO(mode));
    const r = raw.result ? raw.result.value : raw;
    const samples = r.samples || [];
    const label = 'ghép cột';

    check(`[${label}] a pair was really matched`,
      r.matchedCount === 2, `mode=${r.mode}, ${r.matchedCount} thẻ${r.error ? ` | ${r.error}` : ''}`);
    check(`[${label}] the matched cards carry the flash animation`,
      samples.length > 0 && samples.every(sample => sample.animation === 'match-flash'),
      samples.length ? samples[0].animation : '(không có mẫu)');
    const widest = Math.max(...samples.map(sample => spread(sample.shadow)));
    check(`[${label}] the ring really expands — measured spread, not a colour`,
      widest > 2, `lan rộng nhất ${widest}px`);
    check(`[${label}] the ring dies out — the settled card keeps only its own glow`,
      spread(r.settled && r.settled.shadow) === 0, String(r.settled && r.settled.shadow));
    // "The ring does not touch readability" is read from the animation's OWN keyframes
    // rather than from opacity samples: the card also has a plain CSS transition on
    // opacity (0.72 -> 0.95 when it becomes matched), which has nothing to do with the
    // flash and made the first version of this check fail on a correct build.
    check(`[${label}] the flash animates nothing but box-shadow — ink and opacity are untouched`,
      // getKeyframes() reports camelCase (boxShadow), CSS writes box-shadow.
      (r.animatedProps || []).length > 0
        && r.animatedProps.every(prop => String(prop).replace(/-/g, '').toLowerCase() === 'boxshadow'),
      (r.animatedProps || []).join(', ') || '(không đọc được keyframes)');
  }

  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  try {
    const reducedRaw = await cdp.evaluate(REDUCED);
    const d = reducedRaw.result ? reducedRaw.result.value : reducedRaw;
    check('reduced motion: a matched pair does not flash', d.found === true && d.animation === 'none', d.animation);
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  }

  const failed = results.filter(entry => !entry.ok).length;
  console.log('');
  console.log(failed === 0
    ? `ui-match-flash-check: ${results.length}/${results.length} passed`
    : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
