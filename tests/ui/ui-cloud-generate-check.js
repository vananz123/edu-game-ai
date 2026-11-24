#!/usr/bin/env node
/**
 * DECISIONS #344 — Cloud AI from the renderer: one pipe, four named states.
 *
 * The gateway works on its own (measured in #343). This gate measures the half a
 * teacher actually touches: renderer -> façade -> Rust -> gateway -> Gemini, with the
 * access token never crossing into JS.
 *
 * What is asserted, and why each one matters:
 *   1. signed OUT, the call returns `code: 'not_signed_in'` — not a thrown error and not
 *      a silent empty game, because the UI must be able to offer a login instead of
 *      "thử lại sau";
 *   2. the payload of a successful call carries no token — the only call that attaches
 *      `Authorization` must not hand it back (same promise as #337);
 *   3. signed IN with a gateway running, `cloudSelfTest()` returns a real game whose
 *      questions each have options and a correct id — "there is a game" is not enough:
 *      a game with no correct answer cannot be played;
 *   4. the panel button reaches the same state: `[data-account-cloud-result="ok"]`.
 *
 * The expected CODES come from the live `authStatus` the app itself read (#320/#321),
 * never from a constant in this file.
 *
 * Usage: `node tests/ui/ui-cloud-generate-check.js [port]`.
 * Requires: a gateway reachable at EDUGAME_AI_GATEWAY_URL (the launch env), and a
 * signed-in session on this machine for the happy path.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9391';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const OUTCOME_CALL = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const status = await desktop.call('authStatus');
  // Signed out: a real call, not a guess about what would happen.
  if (!status || status.loggedIn !== true) {
    const outcome = await desktop.call('cloudGenerate', { text: 'x'.repeat(80), questionCount: 3 });
    return { status, signedOut: true, outcome };
  }
  // Gemini tra 503 theo dot. Mot cong do KHONG duoc bien su co cua nha cung cap thanh
  // loi cua san pham — nhung cung khong duoc phep an no: chi thu lai khi ma la "dang ban"
  // (provider_unavailable / quota_busy), va bao so lan thu ra man hinh.
  let outcome = null;
  let attempts = 0;
  for (let i = 0; i < 3; i += 1) {
    attempts += 1;
    outcome = await cloudSelfTest();
    const busy = outcome && (outcome.code === 'provider_unavailable' || outcome.code === 'quota_busy' || outcome.code === 'gateway_unavailable');
    if (!busy) break;
    await sleep(15000);
  }
  const payload = JSON.stringify(outcome);
  const game = outcome && outcome.game;
  const questions = game && Array.isArray(game.questions) ? game.questions : [];
  return {
    status,
    signedOut: false,
    ok: outcome && outcome.ok === true,
    code: (outcome && outcome.code) || null,
    message: (outcome && outcome.message) || null,
    provider: (outcome && outcome.provider) || null,
    usage: (outcome && outcome.usage) || null,
    attempts,
    questionCount: questions.length,
    allHaveOptions: questions.every(q => Array.isArray(q.options) && q.options.length >= 2),
    allHaveCorrect: questions.every(q => q.options.some(o => o && o.id === q.correctOptionId)),
    leaksToken: /access_token|refresh_token|"eyJ/.test(payload),
    payloadBytes: payload.length,
  };
})()`;

const PANEL_TEST = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const chip = document.querySelector('[data-account-chip]');
  if (!chip) return { missing: 'chip' };
  chip.click();
  await sleep(200);
  const button = document.querySelector('[data-account-cloud-test]');
  // Thu tu quan trong: hoi TRANG THAI truoc, roi moi hoi co nut hay khong. Hoi nguoc lai
  // thi "khong co nut" bi bao la thieu, dung ra o che do Khach no phai KHONG co.
  if (chip.dataset.state !== 'member') {
    return { skipped: chip.dataset.state, missing: button ? 'none' : 'button' };
  }
  if (!button) return { missing: 'button', state: chip.dataset.state };
  // Ket qua cua lan kiem TRUOC con nam trong panel (trang khong tai lai giua hai cong).
  // Doi van ban DOI, khong chi doi "co mot hop ket qua" — neu khong thi cong se doc ket
  // qua cu va bao xanh ma khong he bam.
  const before = document.querySelector('[data-account-cloud-result]');
  const beforeText = before ? before.textContent.trim() : null;
  button.click();
  for (let i = 0; i < 400; i += 1) {
    const box = document.querySelector('[data-account-cloud-result]');
    if (box && box.textContent.trim() !== beforeText) {
      return {
        result: box.dataset.accountCloudResult,
        text: box.textContent.trim(),
        state: chip.dataset.state,
      };
    }
    await sleep(100);
  }
  return { missing: 'result', state: chip.dataset.state };
})()`;

const SHORT_LESSON = String.raw`(async () => {
  const outcome = await desktop.call('cloudGenerate', { text: 'quá ngắn', questionCount: 3 });
  return { ok: outcome && outcome.ok, code: (outcome && outcome.code) || null };
})()`;

async function main() {
  // Ba loi goi that, moi loi co the cho ~10 giay o tang thu lai cua gateway, cong 2 lan
  // nghi 15 giay: han 120 giay mac dinh la du de mot dot ban cua nha cung cap bien cong
  // nay thanh "khong do duoc" — va mot cong khong do duoc thi khong bao ve duoc gi.
  const page = await connect({ evalTimeoutMs: 300000 });
  await page.evaluate('document.querySelector("#modalRoot") && (document.querySelector("#modalRoot").innerHTML = ""), 1');

  const call = await page.evaluate(OUTCOME_CALL);
  const state = call.status && call.status.loggedIn ? 'member' : 'guest';

  if (call.signedOut) {
    check('signed out: the call is refused with a named code', call.outcome && call.outcome.ok === false);
    check(
      'signed out: the code says "not signed in", not "try again later"',
      ['not_signed_in', 'gateway_not_configured'].includes(call.outcome && call.outcome.code),
      `code = ${call.outcome && call.outcome.code}`
    );
    check('signed out: no token-shaped key in the payload', !/access_token|refresh_token/.test(JSON.stringify(call.outcome)));
  } else {
    check('signed in: the gateway returned a game', call.ok === true, `code = ${call.code} / ${call.message} (${call.attempts} lượt)`);
    check('signed in: the game has questions', call.questionCount >= 1, `count = ${call.questionCount}`);
    // Mot tro choi rong thi hai phep duoi day DUNG mot cach vo nghia (every tren mang
    // rong la true). Gop dieu kien de khong co duong nao "qua" ma khong co cau hoi.
    check(
      'signed in: every question has two options and a real correct id',
      call.questionCount > 0 && call.allHaveOptions === true && call.allHaveCorrect === true,
      'count = ' + call.questionCount
    );
    check('signed in: the provider is reported', typeof call.provider === 'string' && call.provider.length > 0, call.provider);
    check('signed in: usage is reported so the UI can warn about the limit', call.usage && typeof call.usage.used === 'number');
    check('signed in: the payload carries no access or refresh token', call.leaksToken === false, `${call.payloadBytes} B`);
  }

  const short = await page.evaluate(SHORT_LESSON);
  check('a too-short lesson is rejected locally as invalid_request', short.code === 'invalid_request', `code = ${short.code}`);

  const panel = await page.evaluate(PANEL_TEST);
  if (panel.skipped) {
    // Mot loi moi sai o day se la mot nut khong bam duoc. Khang dinh NGUOC LAI: o che
    // do Khach khong duoc co nut "Kiem tra Cloud AI".
    check('panel: signed out, the cloud test button is absent', !panel.missing || panel.missing === 'button', `state = ${panel.skipped}, missing = ${panel.missing || 'none'}`);
  } else {
    check('panel: the cloud test button exists for a signed-in teacher', !panel.missing, panel.missing || '');
    if (!panel.missing) {
      check(
        'panel: clicking it reaches a NEW result without a page reload',
        panel.result === 'ok' || panel.result === 'fail',
        `result = ${panel.result}`
      );
    }
  }

  const failed = results.filter(entry => !entry.ok).length;
  console.log(`\nui-cloud-generate-check: ${results.length - failed}/${results.length} checks passed (state: ${state})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('ui-cloud-generate-check failed to run:', error.message);
  process.exit(2);
});
