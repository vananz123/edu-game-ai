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
  await sleep(500);

  // ── 3. TEAM play: the chips on the bar must climb, and the first draw must not ──
  const teamFixture = {
    id: 'score321', title: 'Diem doi', template: 'quiz', subject: 'Tu nhien', grade: '4', description: '',
    gameSetup: { answerMode: 'instant' },
    questions: [
      { id: 'q1', type: 'multiple-choice', difficulty: 'de', prompt: 'Cau mot?', explanation: 'Mot.', points: 100,
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a' },
      { id: 'q2', type: 'multiple-choice', difficulty: 'de', prompt: 'Cau hai?', explanation: 'Hai.', points: 100,
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a' }
    ]
  };
  playGame(teamFixture, { fullscreen: false });
  await sleep(500);
  openTeamSetup();
  await sleep(350);
  const startBtn = document.querySelector('#startTeamGameBtn');
  out.teamSetupFound = Boolean(startBtn);
  if (startBtn) startBtn.click();
  await sleep(800);
  const teamChipValues = () => [...document.querySelectorAll('.team-score-chip b')]
    .map(node => String(node.textContent).trim());
  out.teamFirstDraw = teamChipValues();
  out.teamChipCount = out.teamFirstDraw.length;
  const answer1 = document.querySelector('.answer-option[data-answer="a"]');
  if (answer1) answer1.click();
  await sleep(600);
  const nextBtn = document.querySelector('#nextQuestionBtn');
  out.teamNextFound = Boolean(nextBtn);
  if (nextBtn) nextBtn.click();
  // The bar is re-drawn whole with the new total; sample the climb as it happens.
  const teamSamples = [];
  const teamT0 = performance.now();
  for (let i = 0; i < 10; i += 1) {
    teamSamples.push({ t: Math.round(performance.now() - teamT0), v: teamChipValues() });
    await sleep(40);
  }
  await sleep(300);
  out.teamSamples = teamSamples;
  out.teamSettled = teamChipValues();
  out.teamPointsRecorded = state.teamPlay ? state.teamPlay.teams.map(t => String(t.points)) : null;

  // ── 4. The leaderboard is a reveal: it counts up from zero ────────────────────
  const answer2 = document.querySelector('.answer-option[data-answer="a"]');
  if (answer2) answer2.click();
  await sleep(500);
  const next2 = document.querySelector('#nextQuestionBtn');
  if (next2) next2.click();
  const boardSamples = [];
  const boardT0 = performance.now();
  for (let i = 0; i < 10; i += 1) {
    boardSamples.push({ t: Math.round(performance.now() - boardT0),
      v: [...document.querySelectorAll('.leaderboard-row [data-team-score]')].map(n => String(n.textContent).trim()) });
    await sleep(40);
  }
  await sleep(350);
  out.boardSamples = boardSamples;
  out.boardSettled = [...document.querySelectorAll('.leaderboard-row [data-team-score]')]
    .map(n => String(n.textContent).trim());
  out.boardCount = out.boardSettled.length;
  // The rows are SORTED, so the expected order is the team points sorted descending —
  // read them after the last answer, because the second team earns points too.
  out.boardExpected = state.teamPlay
    ? state.teamPlay.teams.map(t => t.points).sort((a, b) => b - a).map(String)
    : null;

  if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
  await sleep(400);
  for (const id of ['score320a', 'score320b', 'score321']) {
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

  // 3. Team chips.
  check('the team setup screen starts a real team game', r.teamSetupFound === true);
  check('two team chips are drawn on the bar', r.teamChipCount === 2, String(r.teamChipCount));
  check('the first draw shows 0 and does not climb — nobody just earned those points',
    (r.teamFirstDraw || []).join(',') === '0,0', (r.teamFirstDraw || []).join(','));
  const teamSeries = (r.teamSamples || []).map(sample => Number((sample.v || [])[0]));
  const teamMid = (r.teamSamples || []).filter(sample => {
    const value = Number((sample.v || [])[0]);
    return value > 0 && value < Number((r.teamPointsRecorded || [0])[0]);
  });
  check('a team total climbs instead of teleporting', teamMid.length >= 1,
    teamMid.map(sample => `${sample.t}:${(sample.v || [])[0]}`).join(' ') || '(no mid values)');
  check('the team total lands on the points the game recorded',
    (r.teamSettled || [])[0] === (r.teamPointsRecorded || [])[0],
    `${(r.teamSettled || [])[0]} vs ${(r.teamPointsRecorded || [])[0]}`);
  check('the team climb never goes backwards',
    teamSeries.every((value, i) => i === 0 || value >= teamSeries[i - 1]), teamSeries.join(','));

  // 4. Leaderboard reveal.
  const boardSeries = (r.boardSamples || []).map(sample => Number((sample.v || [])[0]));
  check('the leaderboard counts up from zero on the result screen',
    (r.boardSamples || []).some(sample => Number((sample.v || [])[0]) > 0
      && Number((sample.v || [])[0]) < Number((r.boardSettled || [0])[0])),
    (r.boardSamples || []).map(sample => `${sample.t}:${(sample.v || [])[0]}`).join(' ') || '(no samples)');
  check('every leaderboard row lands on its real total',
    (r.boardSettled || []).length === 2 && (r.boardSettled || []).join(',') === (r.boardExpected || []).join(','),
    `${(r.boardSettled || []).join(',')} vs ${(r.boardExpected || []).join(',')}`);
  check('the leaderboard climb never goes backwards and never shows a negative score',
    boardSeries.every((value, i) => i === 0 || value >= boardSeries[i - 1]),
    boardSeries.join(','));
  check('no sample on the leaderboard is outside the range the game could have',
    (r.boardSamples || []).every(sample => (sample.v || []).every(value => Number(value) >= 0)),
    (r.boardSamples || []).map(sample => (sample.v || []).join('/')).join(' '));

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
