#!/usr/bin/env node
/**
 * DECISIONS #155 — the "Cách chơi" label on a game card.
 *
 * A quiz is played either the classic way or by building the 3D house. The library
 * card must say which one, so the teacher does not have to open the editor to find
 * out. Creates four synthetic games (house, classic by default, classic explicit,
 * matching), searches the library down to them, and reads the chip on each card.
 * Everything it created is deleted again at the end.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 * `node tests/ui/ui-play-mode-card-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9338';
const { connect } = require('../manual/lib/ui-check-lib');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const SCENARIO = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // A fresh profile opens the setup onboarding into #modalRoot a moment after the
  // window loads; it would cover the library this check measures. Canonical guard.
  for (let i = 0; i < 40; i++) { if (document.querySelector('#modalRoot .setup-fullscreen')) break; await sleep(100); }
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);

  // Leftovers from an interrupted run would leave cards that confuse the lookup.
  const existing = await window.eduGame.getLibrary();
  const leftovers = (existing.games || []).filter(g => String(g.title || '').startsWith('probe-mode-'));
  if (leftovers.length) await window.eduGame.deleteGames(leftovers.map(g => g.id));

  const tag = Date.now().toString(36);
  const question = {
    id: 'q1', type: 'multiple-choice', prompt: 'Câu hỏi thử?',
    options: [{ id: 'a', text: 'Đáp án A' }, { id: 'b', text: 'Đáp án B' }],
    correctOptionId: 'a', correctAnswer: '', explanation: 'Giải thích thử.', points: 100
  };
  const base = {
    description: 'Dữ liệu tổng hợp cho check nhãn cách chơi.', subject: 'Tin học', grade: '7',
    tags: [], sourceName: 'ui-check', createdAt: new Date(Date.UTC(2026, 0, 2)).toISOString(),
    questions: [question]
  };
  const created = [];
  const save = async (suffix, patch) => {
    const game = await window.eduGame.saveGame({ ...base, ...patch, title: 'probe-mode-' + tag + '-' + suffix });
    created.push(game);
    return game;
  };
  await save('house', { template: 'quiz', gameSetup: { scoringMode: 'cơ bản', gameplayMode: 'house' } });
  await save('classic-default', { template: 'quiz', gameSetup: { scoringMode: 'cơ bản' } });
  await save('classic-explicit', { template: 'quiz', gameSetup: { scoringMode: 'cơ bản', gameplayMode: 'classic' } });
  await save('matching', {
    template: 'matching',
    gameSetup: { scoringMode: 'cơ bản' },
    matchingGame: { mode: 'columns', pairs: [{ id: 'p1', left: 'Thuật ngữ A', right: 'Định nghĩa 1' }, { id: 'p2', left: 'Thuật ngữ B', right: 'Định nghĩa 2' }] }
  });

  state.db = await window.eduGame.getLibrary();
  state.libraryPage = 0;
  state.librarySelection = new Set();
  navigate('library');
  await sleep(400);
  // navigate() clears the search box, so narrow the list to this run's fixtures after
  // it: the lookup then never has to step around the sample game a fresh profile ships.
  state.search = 'probe-mode-' + tag;
  render();
  await sleep(300);

  const cardFor = suffix => [...document.querySelectorAll('[data-game-card]')]
    .find(card => card.textContent.includes('probe-mode-' + tag + '-' + suffix));
  const describe = suffix => {
    const card = cardFor(suffix);
    if (!card) return { found: false };
    const chip = card.querySelector('[data-play-mode]');
    return {
      found: true,
      mode: chip ? chip.dataset.playMode : '',
      text: chip ? chip.textContent.replace(/\s+/g, ' ').trim() : '',
      title: chip ? chip.getAttribute('title') : ''
    };
  };

  const out = {
    // Only the probe cards are counted: a fresh profile already ships one sample game
    // and the search box also matches the subject/grade, so the raw card count is not
    // a stable number.
    cards: [...document.querySelectorAll('[data-game-card]')]
      .filter(card => card.textContent.includes('probe-mode-' + tag)).length,
    titles: [...document.querySelectorAll('[data-game-card]')]
      .map(card => (card.querySelector('.font-semibold') || card).textContent.trim()).slice(0, 8),
    house: describe('house'),
    classicDefault: describe('classic-default'),
    classicExplicit: describe('classic-explicit'),
    matching: describe('matching')
  };

  // The chip is a passive label: the card keeps exactly its two direct actions.
  const houseCard = cardFor('house');
  out.houseActions = houseCard
    ? [...houseCard.querySelectorAll('[data-action]')].filter(node => !node.closest('[role="menu"]')).map(node => node.dataset.action)
    : [];

  for (const game of created) await window.eduGame.deleteGame(game.id);
  state.search = '';
  state.db = await window.eduGame.getLibrary();
  state.librarySelection = new Set();
  state.libraryPage = 0;
  navigate('library');
  return out;
})()`;

(async () => {
  const cdp = await connect();
  const result = await cdp.evaluate(SCENARIO);

  check('all four probe cards render in the library', result.cards === 4, `${result.cards} · ${result.titles.join(' | ')}`);
  check('a house quiz says "Cách chơi: Xây nhà"',
    result.house.found && result.house.mode === 'house' && /Cách chơi: Xây nhà/.test(result.house.text),
    `${result.house.mode} · ${result.house.text}`);
  check('the house chip explains the mode on hover',
    /Xây nhà — /.test(result.house.title), result.house.title);
  check('a quiz with no mode set reads as "Cách chơi: Cổ điển"',
    result.classicDefault.found && result.classicDefault.mode === 'classic' && /Cách chơi: Cổ điển/.test(result.classicDefault.text),
    `${result.classicDefault.mode} · ${result.classicDefault.text}`);
  check('a quiz that stores "classic" explicitly reads the same',
    result.classicExplicit.found && result.classicExplicit.mode === 'classic' && /Cách chơi: Cổ điển/.test(result.classicExplicit.text),
    `${result.classicExplicit.mode} · ${result.classicExplicit.text}`);
  check('the other templates carry no play-mode chip',
    result.matching.found && result.matching.mode === '', `${result.matching.found} · "${result.matching.mode}"`);
  check('the chip adds no button to the card',
    /^play,play-fullscreen$/.test(result.houseActions.join(',')), result.houseActions.join(','));

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All play-mode card checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
