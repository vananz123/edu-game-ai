#!/usr/bin/env node
/**
 * DECISIONS #349 — the wizard can build a game from Cloud AI, and only a signed-in teacher
 * is offered it.
 *
 * The gateway (#343), the app→gateway channel (#344), the editor block (#345) and the
 * per-question conversion (#349) are measured elsewhere. This gate covers the seam the
 * wizard adds:
 *
 *   1. a guest is NOT offered Cloud AI, and that is checked as STATE first — asking
 *      "does the button exist" before asking "who is signed in" reports a correct absence
 *      as a defect (#344);
 *   2. hiding the button is not the permission: calling the action directly still refuses
 *      with a sentence that names đăng nhập;
 *   3. a lesson shorter than 40 characters is refused BEFORE the network, so a teacher
 *      never loses a turn to a typo;
 *   4. signed in, Cloud AI's questions actually become a draft (`draftSource ===
 *      'cloud-questions'`) and a playable game — the claim the whole change exists for.
 *      That path costs a real turn, so it runs only with `EDUGAME_CLOUD_LIVE=1`.
 *
 * Usage: `[EDUGAME_CLOUD_LIVE=1] CDP_PORT=<port> node tests/ui/ui-wizard-cloud-check.js`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9491';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const LESSON = 'Bài học: An toàn giao thông đường bộ. Khi đi bộ trên đường không có vỉa hè, em đi sát mép '
  + 'đường bên phải. Trước khi sang đường, em dừng lại, nhìn trái, nhìn phải rồi mới đi. Không chơi đùa '
  + 'dưới lòng đường, không bám vào xe đang chạy, và luôn đội mũ bảo hiểm khi ngồi trên xe máy.';

const OPEN_STEP = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (typeof closeSetupWizard === 'function' && document.querySelector('[data-setup-fullscreen="1"]')) {
    closeSetupWizard('close');
    await sleep(150);
  }
  navigate('create-wizard');
  await sleep(150);
  const status = await desktop.call('authStatus');
  // A config the generate step can draw from: writing it directly keeps this gate about
  // Cloud AI, not about walking the four earlier steps.
  wizardState.step = 'generate';
  wizardState.config = { gameType: 'arena', title: 'An toàn giao thông', generationMode: 'fast', itemCount: 5, grade: '3', subject: 'An toàn giao thông' };
  wizardState.draft = null;
  wizardState.gameSnapshot = null;
  wizardState.gameId = null;
  wizardState.lessonPrefix = 'Bài học: An toàn giao thông';
  wizardState.text = ${JSON.stringify(LESSON)};
  wizardState.documentName = 'an-toan-giao-thong.txt';
  render();
  await sleep(250);
  return {
    state: accountUiState(),
    loggedIn: Boolean(status && status.loggedIn),
    card: Boolean(document.querySelector('[data-wizard-cloud]')),
    button: Boolean(document.querySelector('[data-wizard-action="cloud-generate"]')),
    status: (document.querySelector('[data-wizard-cloud-status]') || {}).textContent || ''
  };
})()`;

const GUEST_DIRECT_CALL = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (accountUiState() === 'member') return { skipped: true };
  // The banner text lives in wizardState.error and is worded by wizardErrorText, so read
  // STATE rather than a class name that may move.
  const before = typeof wizardErrorText === 'function' ? wizardErrorText() : '';
  wizardDispatch('cloud-generate');
  for (let i = 0; i < 40; i += 1) {
    const now = typeof wizardErrorText === 'function' ? wizardErrorText() : '';
    if (now && now !== before) break;
    await sleep(50);
  }
  const banner = typeof wizardErrorText === 'function' ? wizardErrorText() : '';
  return { banner, game: Boolean(wizardState.gameSnapshot) };
})()`;

const SHORT_LESSON = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (accountUiState() !== 'member') return { skipped: true };
  wizardState.text = 'quá ngắn';
  wizardSetCloudStatus('');
  wizardDispatch('cloud-generate');
  let banner = '';
  for (let i = 0; i < 40; i += 1) {
    banner = typeof wizardErrorText === 'function' ? wizardErrorText() : '';
    if (/40 ký tự/u.test(banner)) break;
    await sleep(50);
  }
  return { banner, status: (document.querySelector('[data-wizard-cloud-status]') || {}).textContent || '', game: Boolean(wizardState.gameSnapshot) };
})()`;

const LIVE_RUN = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (accountUiState() !== 'member') return { skipped: true };
  wizardState.text = ${JSON.stringify(LESSON)};
  wizardSetCloudStatus('');
  const button = document.querySelector('[data-wizard-action="cloud-generate"]');
  const readStatus = () => (document.querySelector('[data-wizard-cloud-status]') || {}).textContent || '';
  let text = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = readStatus();
    if (button) button.click(); else wizardDispatch('cloud-generate');
    for (let i = 0; i < 600; i += 1) {
      text = readStatus();
      if (text && text !== before && !/Đang nhờ/u.test(text)) break;
      await sleep(100);
    }
    const game = wizardState.gameSnapshot;
    if (game && Array.isArray(game.questions) && game.questions.length) {
      // Once the game exists the cloud card is gone (step 5 shows its finished state), so
      // the durable sentence is the NOTICE — a status node that no longer exists would make
      // this check report a correct transition as a defect.
      return {
        questions: game.questions.length,
        source: wizardState.draftSource,
        gameId: game.id || '',
        usage: cloudUsageText(wizardState.cloudUsage),
        text: String(wizardState.notice || text).trim(),
        attempts: attempt + 1
      };
    }
    if (!/bận|thử lại/iu.test(text)) break;
    await sleep(15000);
  }
  return { questions: 0, source: wizardState.draftSource, text: String(wizardState.notice || text).trim(), attempts: 3 };
})()`;

// #350: the meter is pure rendering, so it is measured WITHOUT a network call by seeding the
// usage the gateway reports. Three states, including the paid unit (credits), because a
// correct number with the wrong unit is still the wrong sentence for the teacher.
const USAGE_STATES = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (accountUiState() !== 'member') return { skipped: true };
  const read = async usage => {
    wizardState.cloudUsage = usage;
    wizardState.cloudStatus = '';
    render();
    await sleep(120);
    const meter = document.querySelector('[data-wizard-cloud-usage]');
    const button = document.querySelector('[data-wizard-action="cloud-generate"]');
    return {
      text: (meter ? meter.textContent : '').trim(),
      disabled: Boolean(button && button.disabled)
    };
  };
  const near = await read({ allowed: true, used: 4, quotaLimit: 5, unit: 'generations', plan: 'free' });
  const done = await read({ allowed: false, used: 5, quotaLimit: 5, unit: 'generations', plan: 'free' });
  const credits = await read({ allowed: true, used: 498, quotaLimit: 500, unit: 'credits', plan: 'plus' });
  const junk = await read({ used: 'x', quotaLimit: null });
  wizardState.cloudUsage = null;
  render();
  await sleep(80);
  return { near, done, credits, junk };
})()`;

// #350: the card's meter is pure rendering. It needs the card to exist, and the card needs
// "member" — so this stubs ONLY that predicate, inside the eval, and restores it. What is
// measured is "the card draws the number the gateway reported", not "sign-in works" (that is
// ui-account-check and ui-cloud-generate-check, which talk to the real provider).
const CARD_USAGE = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const original = accountUiState;
  accountUiState = () => 'member';
  const read = async usage => {
    wizardState.cloudUsage = usage;
    wizardState.cloudStatus = '';
    render();
    await sleep(110);
    const meter = document.querySelector('[data-wizard-cloud-usage]');
    const button = document.querySelector('[data-wizard-action="cloud-generate"]');
    return {
      hasCard: Boolean(document.querySelector('[data-wizard-cloud]')),
      text: (meter ? meter.textContent : '').trim(),
      disabled: Boolean(button && button.disabled)
    };
  };
  const near = await read({ allowed: true, used: 4, quotaLimit: 5, unit: 'generations' });
  const done = await read({ allowed: false, used: 5, quotaLimit: 5, unit: 'generations' });
  const credits = await read({ allowed: true, used: 498, quotaLimit: 500, unit: 'credits' });
  const junk = await read({ used: 'x', quotaLimit: null });
  wizardState.cloudUsage = null;
  accountUiState = original;
  render();
  await sleep(80);
  return { near, done, credits, junk };
})()`;

async function main() {
  const page = await connect({ evalTimeoutMs: 300000 });

  // 1. STATE first: who is signed in decides what this gate expects.
  const step = await page.evaluate(OPEN_STEP);
  const member = step.state === 'member';
  console.log(`wizard-cloud-check: account state = ${step.state} (loggedIn=${step.loggedIn})`);

  // #350: the meter on the card, measured with a stubbed identity (see CARD_USAGE).
  const card = await page.evaluate(CARD_USAGE);
  check('the card exists once the identity says member', card.near.hasCard === true);
  check('the card says how many turns are left', /Còn 1\/5 lượt/u.test(String(card.near.text)), String(card.near.text));
  check('a teacher with turns left can press the card button', card.near.disabled === false, String(card.near.disabled));
  check('the card says an exhausted month plainly', /Đã hết lượt/u.test(String(card.done.text)), String(card.done.text));
  check('the card disables its button when the month is spent', card.done.disabled === true, String(card.done.disabled));
  check('the card counts a paid plan in credits', /Còn 2\/500 credits/u.test(String(card.credits.text)), String(card.credits.text));
  check('unreadable usage leaves the card silent and pressable', card.junk.text === '' && card.junk.disabled === false, `${card.junk.text}|${card.junk.disabled}`);

  // 2. The guest case: no card, no button — and the absence is explained by the state.
  if (!member) {
    check('a guest is not shown the Cloud AI card', step.card === false, `card=${step.card}`);
    check('a guest has no Cloud AI button', step.button === false, `button=${step.button}`);

    const direct = await page.evaluate(GUEST_DIRECT_CALL);
    check(
      'hiding the button is not the permission: the action still refuses',
      /đăng nhập/iu.test(String(direct.banner)),
      String(direct.banner).slice(0, 120)
    );
    check('a refused cloud run builds no game', direct.game === false, String(direct.game));
  } else {
    check('a signed-in teacher is offered Cloud AI', step.card === true, `card=${step.card}`);
    check('the card has a button to run it', step.button === true, `button=${step.button}`);

    const short = await page.evaluate(SHORT_LESSON);
    check(
      'a short lesson is refused before the network, naming the 40-character rule',
      /40 ký tự/u.test(String(short.banner)),
      `banner=${String(short.banner).slice(0, 100)}`
    );
    check('a refused short lesson builds no game', short.game === false, String(short.game));

    // #350: what the teacher reads BEFORE pressing the button.
    const usage = await page.evaluate(USAGE_STATES);
    check('the card says how many turns are left', /Còn 1\/5 lượt/u.test(String(usage.near.text)), String(usage.near.text));
    check('a teacher with turns left can press the button', usage.near.disabled === false, String(usage.near.disabled));
    check('an exhausted month is said plainly', /Đã hết lượt/u.test(String(usage.done.text)), String(usage.done.text));
    check('an exhausted month disables the button instead of inviting a refusal', usage.done.disabled === true, String(usage.done.disabled));
    check('a paid plan is counted in credits, not turns', /Còn 2\/500 credits/u.test(String(usage.credits.text)), String(usage.credits.text));
    check('an unreadable usage prints nothing rather than NaN', String(usage.junk.text) === '', String(usage.junk.text));

    if (process.env.EDUGAME_CLOUD_LIVE === '1') {
      const live = await page.evaluate(LIVE_RUN);
      check('Cloud AI builds a game with questions in the wizard', live.questions > 0, `${live.questions} câu trong ${live.attempts} lượt`);
      check('the draft records Cloud AI as its source', live.source === 'cloud-questions', String(live.source));
      check('the status says Cloud AI wrote the questions', /Cloud AI/u.test(String(live.text)), String(live.text).slice(0, 120));
      // #350: a real run must leave a real meter behind, in the account's own unit.
      check('a real run reports the remaining allowance', /Còn \d+\/\d+ (lượt|credits)/u.test(String(live.usage)), String(live.usage));
    } else {
      check('the live branch is left to EDUGAME_CLOUD_LIVE=1', true, 'set the variable to spend a turn');
    }
  }

  const failed = results.filter(entry => !entry.ok).length;
  console.log(`\nui-wizard-cloud-check: ${results.length - failed}/${results.length} checks passed (state: ${step.state})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('ui-wizard-cloud-check failed to run:', error.message);
  process.exit(2);
});
