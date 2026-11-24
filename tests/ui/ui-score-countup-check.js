#!/usr/bin/env node
/**
 * DECISIONS #320 — the stage total must CLIMB, and it must land on the exact number.
 *
 * The score chip used to teleport from 0 to 300 the instant a question was settled:
 * the child who earned the points never saw them arrive, and the teacher at the back
 * of the room only ever saw a number that was already there. The chip now ticks up
 * over 380 ms.
 *
 * Two things this gate exists to protect, because an animated number is a number
 * that can be WRONG:
 *   1. it lands exactly on the total (a mid-value left behind is a false score),
 *   2. it never climbs at all when the machine asks for reduced motion.
 *
 * The climb is measured by sampling the real chip while the real click is settling —
 * a static read cannot tell "animated" from "teleported".
 *
 * Usage: `node tests/ui/ui-score-countup-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9341';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const SCENARIO = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  for (let i = 0; i < 40; i++) {
    if (document.querySelector('#modalRoot .setup-fullscreen')) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);
  document.querySelectorAll('.modal, .modal-backdrop').forEach(el =>
    el.getAnimations().forEach(a => { try { a.finish(); } catch (e) { void e; } }));

  const chipText = () => {
    const chip = document.querySelector('.stage-chip-score b');
    return chip ? String(chip.textContent).trim() : null;
  };
  const fixture = (id, title) => ({
    id, title, template: 'quiz', subject: 'Tự nhiên', grade: '4', description: '',
    gameSetup: { answerMode: 'instant' },
    questions: [{
      id: 'q1', type: 'multiple-choice', difficulty: 'dễ', prompt: 'Vì sao cây cần ánh sáng?',
      explanation: 'Nhờ quang hợp.', points: 100,
      options: [{ id: 'a', text: 'Để quang hợp' }, { id: 'b', text: 'Để bay' }],
      correctOptionId: 'a'
    }]
  });

  // ── 1. The climb, with motion allowed ────────────────────────────────────────
  playGame(fixture('score320a', 'Điểm đếm lên'), { fullscreen: false });
  await sleep(800);
  out.start = chipText();
  const option = document.querySelector('.answer-option[data-answer="a"]') || document.querySelector('.answer-option');
  out.optionFound = Boolean(option);
  const samples = [];
  option.click();
  const t0 = performance.now();
  for (let i = 0; i < 14; i += 1) {
    samples.push({ t: Math.round(performance.now() - t0), v: chipText() });
    await sleep(35);
  }
  await sleep(300);
  out.samples = samples;
  out.settled = chipText();
  // The chip must land on the number the game actually recorded — a fast correct
  // answer also earns the speed bonus, so the fixture's point value is not that number.
  // (No backticks in here: this whole block is a template literal.)
  out.expected = String(state.gameAnswers.reduce((sum, answer) => sum + answer.points, 0));

  // ── 2. Reduced motion: the number is simply there ────────────────────────────
  playGame(fixture('score320b', 'Điểm không nhảy'), { fullscreen: false });
  await sleep(700);
  out.reduceStart = chipText();
  const option2 = document.querySelector('.answer-option[data-answer="a"]') || document.querySelector('.answer-option');
  option2.click();
  out.reduceImmediate = chipText();
  out.reduceExpected = String(state.gameAnswers.reduce((sum, answer) => sum + answer.points, 0));

  if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
  await sleep(400);
  for (const id of ['score320a', 'score320b']) {
    try { await desktop.call('deleteGame', id); } catch (e) { void e; }
  }
  return out;
})()`;

(async () => {
  const cdp = await connect();

  const normal = await cdp.evaluate(SCENARIO);
  const r = normal.result ? normal.result.value : normal;
  const samples = r.samples || [];
  const values = samples.map(s => Number(s.v));
  const target = Number(r.expected);
  const mid = samples.filter(s => Number(s.v) > 0 && Number(s.v) < target);

  check('the stage total starts at 0 before any answer', r.start === '0', r.start);
  check('the answer option was really clicked', r.optionFound === true);
  check('the total shows intermediate values instead of teleporting',
    mid.length >= 2, mid.map(s => `${s.t}ms:${s.v}`).join(' ') || '(no mid values)');
  check('the climb is monotonic — the score never goes backwards',
    values.every((v, i) => i === 0 || v >= values[i - 1]), values.join(','));
  check('it lands on the exact total the game recorded, not near it',
    r.settled === r.expected, `${r.settled} vs ${r.expected}`);
  check('every sample is a whole number (no "33.6" on a scoreboard)',
    samples.every(s => s.v === null || /^-?\d+$/.test(String(s.v))),
    samples.map(s => s.v).join(','));

  // Reduced motion is a real media feature and WebView2 does emulate it
  // (unlike `hover:none`, lesson #309), so this branch is measured, not assumed.
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  try {
    const reduced = await cdp.evaluate(SCENARIO);
    const d = reduced.result ? reduced.result.value : reduced;
    check('with reduced motion the total starts at 0', d.reduceStart === '0', d.reduceStart);
    check('with reduced motion the total is there immediately — no climb',
      d.reduceImmediate === d.reduceExpected, `${d.reduceImmediate} vs ${d.reduceExpected}`);
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  }

  const failed = results.filter(entry => !entry.ok).length;
  console.log('');
  console.log(failed === 0
    ? `ui-score-countup-check: ${results.length}/${results.length} passed`
    : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
