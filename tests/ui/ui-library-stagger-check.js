#!/usr/bin/env node
/**
 * DECISIONS #325 — thư viện phải HIỆN RA, không dựng một khối.
 *
 * Plan item S2-1. Unlike most items in that document this one was true: the library
 * grid had no entrance animation at all, so nine cards appeared in the same frame.
 * The stagger is pure CSS (`:nth-child`) — no inline index, nothing to keep in sync
 * with paging — and it is capped at one page (LIBRARY_PAGE_SIZE = 9) so the last card
 * never waits longer than ~0.25 s.
 *
 * Usage: `node tests/ui/ui-library-stagger-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9346';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const makeGame = index => ({
  id: `stagger325-${index}`,
  title: `Bài so le ${index}`,
  template: 'quiz',
  subject: 'Tự nhiên',
  grade: '4',
  description: '',
  gameSetup: { answerMode: 'instant' },
  questions: [
    { id: 'q1', type: 'multiple-choice', difficulty: 'de', prompt: 'Câu?', explanation: 'Giải.', points: 100,
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a' }
  ]
});

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
  await sleep(250);
  const games = ${JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8].map(makeGame))};
  for (const game of games) await desktop.call('saveGame', game);
  await sleep(400);

  // Re-draw the library the way a TEACHER does it: leave the page and come back. Calling
  // renderLibrary() is not enough — it only RETURNS html, it paints nothing, so the first
  // version of this gate sampled the page-load DOM whose animations had long finished.
  const nav = name => document.querySelector('.nav-item[data-page="' + name + '"]');
  nav('my-projects').click();
  await sleep(350);
  nav('library').click();
  const read = () => [...document.querySelectorAll('.lib-grid > .lib-item')].map(el => {
    const cs = getComputedStyle(el);
    return { animation: cs.animationName, delay: cs.animationDelay, opacity: cs.opacity, transform: cs.transform };
  });
  const samples = [];
  const t0 = performance.now();
  for (let i = 0; i < 20; i += 1) {
    samples.push({ t: Math.round(performance.now() - t0), items: read() });
    await sleep(30);
  }
  await sleep(700);
  out.samples = samples;
  out.items = read();
  out.count = out.items.length;
  for (const game of games) { try { await desktop.call('deleteGame', game.id); } catch (e) { void e; } }
  return out;
})()`;

const REDUCED = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const games = ${JSON.stringify([0, 1, 2].map(makeGame))};
  for (const game of games) await desktop.call('saveGame', game);
  await sleep(400);
  const nav = name => document.querySelector('.nav-item[data-page="' + name + '"]');
  nav('my-projects').click();
  await sleep(300);
  nav('library').click();
  await sleep(40);
  const items = [...document.querySelectorAll('.lib-grid > .lib-item')].map(el => {
    const cs = getComputedStyle(el);
    return { animation: cs.animationName, opacity: cs.opacity };
  });
  for (const game of games) { try { await desktop.call('deleteGame', game.id); } catch (e) { void e; } }
  await sleep(200);
  return { items };
})()`;

(async () => {
  const cdp = await connect();

  const raw = await cdp.evaluate(SCENARIO);
  const r = raw.result ? raw.result.value : raw;
  const items = r.items || [];
  const delays = items.map(item => parseFloat(item.delay) || 0);

  check('the library drew a full page of cards', r.count === 9, `${r.count} thẻ`);
  check('every card carries the entrance animation',
    items.length > 0 && items.every(item => item.animation === 'lib-card-in'),
    items.map(item => item.animation).join(' ').slice(0, 80));
  check('the delays rise from the first card to the last — a cascade, not one frame',
    delays.length === 9 && delays.every((value, i) => i === 0 || value > delays[i - 1]),
    delays.join(' '));
  check('the last card waits less than a third of a second — a cascade is not a wait',
    delays[delays.length - 1] < 0.3, `${delays[delays.length - 1]} s`);

  const mid = (r.samples || []).find(sample => {
    const values = (sample.items || []).map(item => Number(item.opacity));
    return values.length >= 5 && values[0] > values[4] + 0.05;
  });
  check('mid-reveal the first card is more visible than the fifth — measured, not just declared',
    Boolean(mid), mid ? `t=${mid.t}ms` : '(không mẫu nào lệch)');

  check('every card ends fully visible and flat',
    items.every(item => Number(item.opacity) === 1 && (item.transform === 'none' || item.transform === 'matrix(1, 0, 0, 1, 0, 0)')),
    `opacity ${items.map(item => item.opacity).join(',')}`);

  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  try {
    const reducedRaw = await cdp.evaluate(REDUCED);
    const d = reducedRaw.result ? reducedRaw.result.value : reducedRaw;
    const reducedItems = d.items || [];
    check('reduced motion: the cards have no entrance animation',
      reducedItems.length > 0 && reducedItems.every(item => item.animation === 'none'),
      reducedItems.map(item => item.animation).join(' '));
    check('reduced motion: every card is visible immediately',
      reducedItems.length > 0 && reducedItems.every(item => Number(item.opacity) === 1),
      reducedItems.map(item => item.opacity).join(','));
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  }

  const failed = results.filter(entry => !entry.ok).length;
  console.log('');
  console.log(failed === 0
    ? `ui-library-stagger-check: ${results.length}/${results.length} passed`
    : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
