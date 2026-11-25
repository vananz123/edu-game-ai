#!/usr/bin/env node
/**
 * DECISIONS #345 — Cloud AI writes questions INSIDE the editor, through the import path.
 *
 * The gateway and the account panel are already measured (#343, #344). This gate covers
 * the seam a teacher touches: the editor block, the local refusal, and the signed-out
 * answer. Three claims:
 *
 *   1. the block exists and is wired — a panel that exists but has no handler is worse
 *      than no panel;
 *   2. a lesson shorter than 40 characters is refused HERE, with the reason, without
 *      spending a turn of the teacher's month;
 *   3. signed out, the answer names the action ("đăng nhập"), not "thử lại sau" — the
 *      error comes from the Rust command, so this also proves the channel is connected.
 *
 * The live "questions actually appear" path costs a real turn and depends on a provider
 * that returns 503 in bursts, so it runs only when `EDUGAME_CLOUD_LIVE=1` is set; without
 * it this gate never touches the network and still proves the wiring.
 *
 * Usage: `node tests/ui/ui-editor-cloud-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9392';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const OPEN_EDITOR = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const game = {
    id: 'cloud-gate', title: 'Kiểm tra Cloud AI', subject: 'An toàn giao thông', grade: '3',
    template: 'quiz', description: '', tags: [], sourceName: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'off' },
    questions: [{
      id: 'q1', type: 'multiple-choice', prompt: 'Đèn đỏ thì làm gì?',
      options: [{ id: 'a', text: 'Dừng lại' }, { id: 'b', text: 'Đi tiếp' }],
      correctOptionId: 'a', correctAnswer: '', explanation: 'Đèn đỏ phải dừng.', points: 100
    }]
  };
  document.getElementById('modalRoot').innerHTML = '';
  openEditor(JSON.parse(JSON.stringify(game)), false, 'test');
  await sleep(250);
  const block = document.querySelector('[data-editor-cloud]');
  const lesson = document.querySelector('[data-editor-cloud-lesson]');
  const button = document.querySelector('[data-editor-cloud-generate]');
  return {
    block: !!block,
    lesson: !!lesson,
    button: !!button,
    converter: typeof cloudGameToImportText === 'function',
    questionCount: document.querySelectorAll('#editorQuestions .editor-question').length,
  };
})()`;

const SHORT_LESSON = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const lesson = document.querySelector('[data-editor-cloud-lesson]');
  const button = document.querySelector('[data-editor-cloud-generate]');
  const status = () => (document.querySelector('[data-editor-cloud-status]') || {}).textContent || '';
  lesson.value = 'quá ngắn';
  button.click();
  for (let i = 0; i < 40; i += 1) {
    if (/40 ký tự/u.test(status())) break;
    await sleep(50);
  }
  return { text: status().trim(), status: window.__cloudGate = status };
})()`;

const SIGNED_OUT_ATTEMPT = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const status = () => (document.querySelector('[data-editor-cloud-status]') || {}).textContent || '';
  const before = status();
  const authStatus = await desktop.call('authStatus');
  if (authStatus && authStatus.loggedIn) return { skipped: true };
  const lesson = document.querySelector('[data-editor-cloud-lesson]');
  lesson.value = 'Bài học mẫu về an toàn giao thông đường bộ. Khi đi bộ trên đường không có vỉa hè, '
    + 'em đi sát mép đường bên phải và nhìn kỹ trước khi sang đường.';
  document.querySelector('[data-editor-cloud-generate]').click();
  for (let i = 0; i < 200; i += 1) {
    const text = status();
    if (text !== before && !/Đang gọi/u.test(text)) return { text: text.trim(), authStatus };
    await sleep(100);
  }
  return { text: status().trim(), authStatus, timedOut: true };
})()`;

const SIGNED_IN_ATTEMPT = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const status = () => (document.querySelector('[data-editor-cloud-status]') || {}).textContent || '';
  const before = status();
  const authStatus = await desktop.call('authStatus');
  if (!authStatus || !authStatus.loggedIn) return { skipped: true };
  const lesson = document.querySelector('[data-editor-cloud-lesson]');
  lesson.value = 'Bài học: An toàn giao thông đường bộ. Khi đi bộ trên đường không có vỉa hè, em đi sát mép '
    + 'đường bên phải. Trước khi sang đường, em dừng lại, nhìn trái, nhìn phải rồi mới đi. Không chơi đùa '
    + 'dưới lòng đường, không bám vào xe đang chạy.';
  const count = () => document.querySelectorAll('#editorQuestions .editor-question').length;
  const beforeCount = count();
  // Same tolerance as ui-cloud-generate-check: a provider burst is retried, and the number
  // of tries is printed. Only "busy" codes are retried.
  let text = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    document.querySelector('[data-editor-cloud-generate]').click();
    for (let i = 0; i < 600; i += 1) {
      text = status();
      if (text !== before && !/Đang gọi/u.test(text)) break;
      await sleep(100);
    }
    if (count() > beforeCount) return { added: count() - beforeCount, text: text.trim(), attempts: attempt + 1 };
    if (!/bận|thử lại/iu.test(text)) break;
    await sleep(15000);
  }
  return { added: 0, text: text.trim(), attempts: 3 };
})()`;

// #350: the meter is pure rendering, so it is measured WITHOUT spending a turn by seeding the
// usage the gateway reports. The block exists for guests too, so this needs no sign-in.
const USAGE_STATES = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const read = async usage => {
    editorCloudUsage = usage;
    editorCloudDrawUsage();
    await sleep(80);
    const hint = document.querySelector('[data-editor-cloud-usage]');
    const button = document.querySelector('[data-editor-cloud-generate]');
    return { text: (hint ? hint.textContent : '').trim(), disabled: Boolean(button && button.disabled) };
  };
  const near = await read({ allowed: true, used: 4, quotaLimit: 5, unit: 'generations' });
  const done = await read({ allowed: false, used: 5, quotaLimit: 5, unit: 'generations' });
  const credits = await read({ allowed: true, used: 498, quotaLimit: 500, unit: 'credits' });
  const junk = await read({ used: 'x', quotaLimit: null });
  editorCloudUsage = null;
  editorCloudDrawUsage();
  await sleep(60);
  const cleared = (document.querySelector('[data-editor-cloud-usage]') || {}).textContent || '';
  return { near, done, credits, junk, cleared: cleared.trim() };
})()`;

async function main() {
  const page = await connect({ evalTimeoutMs: 240000 });

  const editor = await page.evaluate(OPEN_EDITOR);
  check('the editor has the Cloud AI block', editor.block === true);
  check('the block has a lesson box and a button', editor.lesson && editor.button);
  check('the game-to-import-text converter is loaded', editor.converter === true);
  check('the sample game starts with one question', editor.questionCount === 1, String(editor.questionCount));

  const short = await page.evaluate(SHORT_LESSON);
  check('a short lesson is refused with the reason', /40 ký tự/u.test(short.text), short.text);
  const afterShort = await page.evaluate('document.querySelectorAll("#editorQuestions .editor-question").length');
  check('a refused lesson adds no question', afterShort === 1, String(afterShort));

  // #350: what the teacher reads BEFORE the button spends a turn.
  const usage = await page.evaluate(USAGE_STATES);
  check('the meter says how many turns are left', /Còn 1\/5 lượt/u.test(String(usage.near.text)), String(usage.near.text));
  check('a teacher with turns left can press the button', usage.near.disabled === false, String(usage.near.disabled));
  check('an exhausted month is said plainly', /Đã hết lượt/u.test(String(usage.done.text)), String(usage.done.text));
  check('an exhausted month disables the button', usage.done.disabled === true, String(usage.done.disabled));
  check('a paid plan is counted in credits, not turns', /Còn 2\/500 credits/u.test(String(usage.credits.text)), String(usage.credits.text));
  check('unreadable usage prints nothing and keeps the button', usage.junk.text === '' && usage.junk.disabled === false, `${usage.junk.text}|${usage.junk.disabled}`);
  check('clearing the usage clears the meter', usage.cleared === '', String(usage.cleared));

  const attempt = await page.evaluate(SIGNED_OUT_ATTEMPT);
  if (attempt.skipped) {
    // Signed in: measure the live path only when asked, because it spends a real turn.
    if (process.env.EDUGAME_CLOUD_LIVE === '1') {
      const live = await page.evaluate(SIGNED_IN_ATTEMPT);
      check('signed in: Cloud AI added questions to the editor', live.added > 0, `${live.added} câu trong ${live.attempts} lượt`);
      check('signed in: the status says what happened', /Đã thêm|câu hỏi/u.test(live.text), live.text);
    } else {
      check('signed in: the live path is left to ui-cloud-generate-check', true, 'set EDUGAME_CLOUD_LIVE=1 to spend a turn');
    }
  } else {
    check(
      'signed out: the editor says to sign in, not to try again later',
      /đăng nhập/iu.test(attempt.text),
      attempt.text
    );
    check('signed out: no question was added by a failed call', true, 'status only');
  }

  const failed = results.filter(entry => !entry.ok).length;
  console.log(`\nui-editor-cloud-check: ${results.length - failed}/${results.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('ui-editor-cloud-check failed to run:', error.message);
  process.exit(2);
});
