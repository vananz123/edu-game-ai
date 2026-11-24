#!/usr/bin/env node
/**
 * DECISIONS #323 — the result screen must REVEAL, not appear.
 *
 * Plan item S3-3 said the result screen appears all at once. It does not: the medal
 * pops (`result-medal-pop`) and the stat cards already cascade with per-child
 * `animation-delay` (this gate pins BOTH, so the claim stays false). What was missing
 * is the row that matters in team play — BẢNG XẾP HẠNG ĐỘI: every row appeared at
 * the same instant, so the class saw the ranking before the teacher could say a word.
 *
 * The cascade runs BACKWARDS on purpose: the last place appears first and the winner
 * lands last. That is the suspense the screen exists for, and it is expressed in pure
 * CSS (`:nth-last-child`) so it works for 2 or 6 teams without any JS.
 *
 * Usage: `node tests/ui/ui-result-cascade-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9344';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const PAIRS = null;
const GAME = {
  id: 'cascade323',
  title: 'Xếp hạng đội',
  template: 'quiz',
  subject: 'Tự nhiên',
  grade: '4',
  description: '',
  gameSetup: { answerMode: 'instant' },
  questions: [
    { id: 'q1', type: 'multiple-choice', difficulty: 'de', prompt: 'Câu một?', explanation: 'Một.', points: 100,
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a' }
  ]
};

const SCENARIO = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = { pairs: ${JSON.stringify(PAIRS)} };
  for (let i = 0; i < 40; i++) {
    if (document.querySelector('#modalRoot .setup-fullscreen')) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);
  if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
  await sleep(300);

  playGame(${JSON.stringify(GAME)}, { fullscreen: false });
  await sleep(600);
  openTeamSetup();
  await sleep(300);
  // A third team, so the cascade has three rows to reveal.
  const add = document.querySelector('#addTeamBtn');
  if (add) add.click();
  await sleep(200);
  const start = document.querySelector('#startTeamGameBtn');
  out.startFound = Boolean(start);
  if (start) start.click();
  await sleep(900);

  const option = document.querySelector('.answer-option[data-answer="a"]');
  out.answered = Boolean(option);
  if (option) option.click();
  await sleep(600);
  const next = document.querySelector('#nextQuestionBtn');
  out.nextFound = Boolean(next);
  if (!next) return out;
  next.click();

  // Sample the reveal as it happens: the rows are drawn once, so this loop must run
  // from the very next frame (the same trap as #320/#321).
  const styleOf = el => {
    const cs = getComputedStyle(el);
    return { animation: cs.animationName, delay: cs.animationDelay, opacity: cs.opacity, transform: cs.transform };
  };
  const rowsNow = () => [...document.querySelectorAll('.leaderboard-row')].map(styleOf);
  const samples = [];
  const t0 = performance.now();
  for (let i = 0; i < 18; i += 1) {
    samples.push({ t: Math.round(performance.now() - t0), rows: rowsNow() });
    await sleep(30);
  }
  await sleep(700);
  out.samples = samples;
  out.rows = rowsNow();
  out.rowCount = out.rows.length;
  out.medal = document.querySelector('.result-medal') ? styleOf(document.querySelector('.result-medal')) : null;
  out.stats = [...document.querySelectorAll('.result-stat')].map(styleOf);
  if (typeof closeGame === 'function') { try { closeGame(); } catch (e2) { void e2; } }
  await sleep(300);
  return out;
})()`;

const REDUCED = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
  await sleep(300);
  playGame(${JSON.stringify(GAME)}, { fullscreen: false });
  await sleep(600);
  openTeamSetup();
  await sleep(300);
  const start = document.querySelector('#startTeamGameBtn');
  if (start) start.click();
  await sleep(900);
  const option = document.querySelector('.answer-option[data-answer="a"]');
  if (option) option.click();
  await sleep(600);
  const next = document.querySelector('#nextQuestionBtn');
  if (next) next.click();
  await sleep(60);
  const rows = [...document.querySelectorAll('.leaderboard-row')].map(el => {
    const cs = getComputedStyle(el);
    return { animation: cs.animationName, opacity: cs.opacity };
  });
  const out = { rows };
  if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
  await sleep(200);
  return out;
})()`;

(async () => {
  const cdp = await connect();

  const raw = await cdp.evaluate(SCENARIO);
  const r = raw.result ? raw.result.value : raw;
  const rows = r.rows || [];
  const delays = rows.map(row => parseFloat(row.delay) || 0);
  const samples = r.samples || [];

  check('the result screen was reached with a leaderboard', r.nextFound === true && rows.length === 3,
    `${rows.length} hàng`);

  // The plan's claim, pinned so it stays false.
  check('the medal still pops — this was never missing',
    Boolean(r.medal) && r.medal.animation === 'result-medal-pop', r.medal && r.medal.animation);
  const statDelays = (r.stats || []).map(stat => parseFloat(stat.delay) || 0);
  check('the stat cards already cascade with increasing delays — also never missing',
    statDelays.length >= 3 && statDelays.every((value, i) => i === 0 || value > statDelays[i - 1]),
    statDelays.join(' '));

  // The new behaviour.
  check('every leaderboard row carries an entrance animation',
    rows.length > 0 && rows.every(row => row.animation === 'leaderboard-row-in'),
    rows.map(row => row.animation).join(' '));
  check('the cascade runs from LAST place to the WINNER — the winner lands last',
    delays.length === 3 && delays[0] > delays[1] && delays[1] > delays[2],
    `${delays.join(' ')} s (hàng đầu = hạng nhất)`);

  const firstRowOpacity = key => {
    const grid = samples.map(sample => (sample.rows || []).map(row => Number(row.opacity)));
    return grid.map(values => (values.length ? values[key] : null)).filter(value => value !== null);
  };
  const winner = firstRowOpacity(0);
  const last = firstRowOpacity(2);
  const mid = samples.findIndex(sample => {
    const values = (sample.rows || []).map(row => Number(row.opacity));
    return values.length === 3 && values[2] > values[0] + 0.05;
  });
  check('mid-reveal the bottom row is MORE visible than the winner — a real cascade, not just declared delays',
    mid >= 0, mid >= 0 ? `t=${samples[mid].t}ms` : `minh hoạ: ${winner.slice(0, 6).join('/')} vs ${last.slice(0, 6).join('/')}`);

  const animationNames = new Set(rows.map(row => row.animation));
  check('every row ends fully visible and flat',
    rows.every(row => Number(row.opacity) === 1 && (row.transform === 'none' || row.transform === 'matrix(1, 0, 0, 1, 0, 0)')),
    `${animationNames.size} animation, opacity ${rows.map(row => row.opacity).join(',')}`);

  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  try {
    const reducedRaw = await cdp.evaluate(REDUCED);
    const d = reducedRaw.result ? reducedRaw.result.value : reducedRaw;
    const reducedRows = d.rows || [];
    check('reduced motion: the leaderboard has no entrance animation',
      reducedRows.length > 0 && reducedRows.every(row => row.animation === 'none'),
      reducedRows.map(row => row.animation).join(' '));
    check('reduced motion: every row is fully visible immediately',
      reducedRows.length > 0 && reducedRows.every(row => Number(row.opacity) === 1),
      reducedRows.map(row => row.opacity).join(','));
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  }

  const failed = results.filter(entry => !entry.ok).length;
  console.log('');
  console.log(failed === 0
    ? `ui-result-cascade-check: ${results.length}/${results.length} passed`
    : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
