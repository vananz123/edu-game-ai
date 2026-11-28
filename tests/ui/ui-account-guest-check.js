#!/usr/bin/env node
/**
 * #371 — panel Tài khoản của người CHƯA đăng nhập.
 *
 * Hai câu chủ dự án nêu:
 *   1. "khi chưa đăng nhập thì chỉ cần hiển thị đăng nhập là đủ" ⇒ panel chỉ có lời mời + nút;
 *   2. "khi chưa đăng nhập mở lên nó bị nháy 2 lần" ⇒ mở panel phải vẽ ĐÚNG MỘT lần.
 *
 * Câu 2 không đo bằng mắt được (một cú nháy 60ms), nên đo bằng hai đại lượng khách quan:
 *   - số lần `#modalRoot` bị ghi (MutationObserver): trước #371 là 2 trong 58ms;
 *   - số lần animation nhập cảnh của `.modal` chạy: mỗi lần dựng lại `.modal` là một lần
 *     `pop-in` nữa, và đó chính là cái người dùng thấy là "nháy".
 *
 * PHẢI chạy trên một hồ sơ WebView2 SẠCH (chưa đăng nhập):
 *   WEBVIEW2_USER_DATA_FOLDER=$(mktemp -d) … --remote-debugging-port=9378
 * Nếu hồ sơ đã đăng nhập, cổng này báo "không đo được" thay vì cho qua rỗng.
 *
 * Usage: `node tests/ui/ui-account-guest-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9378';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const PANEL = String.raw`(() => {
  const panel = document.querySelector('[data-account-panel]');
  if (!panel) return null;
  const text = panel.innerText.replace(/\s+/g, ' ').trim();
  return {
    state: panel.dataset.accountPanelState || '',
    text,
    buttons: [...panel.querySelectorAll('button')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean),
    signIn: panel.querySelectorAll('[data-account-signin]').length,
    perks: panel.querySelectorAll('.account-perks').length,
    guestNote: panel.querySelectorAll('.account-guest-note').length,
    quota: panel.querySelectorAll('[data-account-quota], .account-quota').length,
    pro: panel.querySelectorAll('[data-account-pro], .account-pro').length,
    history: panel.querySelectorAll('[data-account-history], .account-history').length,
    signOut: panel.querySelectorAll('[data-account-signout]').length,
  };
})()`;

/** Cài đồng hồ đếm trước khi mở: số lần ghi `#modalRoot` và số animation nhập cảnh. */
const ARM = String.raw`(() => {
  window.__probe = { writes: 0, pops: 0, states: [] };
  if (window.__probeObserver) window.__probeObserver.disconnect();
  window.__probeObserver = new MutationObserver(() => {
    window.__probe.writes += 1;
    const panel = document.querySelector('[data-account-panel]');
    window.__probe.states.push(panel ? panel.dataset.accountPanelState : null);
  });
  window.__probeObserver.observe(document.querySelector('#modalRoot'), { childList: true, subtree: true });
  if (!window.__probeAnim) {
    window.__probeAnim = true;
    document.addEventListener('animationstart', (event) => {
      const el = event.target;
      if (el && el.classList && el.classList.contains('modal')) window.__probe.pops += 1;
    }, true);
  }
  return 1;
})()`;

(async () => {
  const c = await connect();
  await c.settle(1000);

  const who = await c.evaluate(String.raw`(typeof accountState !== 'undefined' && accountState.status)
    ? { loggedIn: accountState.status.loggedIn === true, ui: accountUiState() }
    : { loggedIn: null, ui: 'chưa đọc được' }`);
  if (who.loggedIn !== false) {
    console.log('ui-account-guest-check: KHÔNG ĐO ĐƯỢC — hồ sơ này ' + (who.loggedIn ? 'đã đăng nhập' : 'chưa đọc được trạng thái')
      + '. Chạy lại với WEBVIEW2_USER_DATA_FOLDER sạch (chưa đăng nhập).');
    process.exit(2);
  }
  check('chạy trên hồ sơ chưa đăng nhập (điều kiện của phép đo)', who.ui === 'guest', who.ui);

  // ---- Lần mở thứ nhất ------------------------------------------------------
  await c.evaluate(ARM);
  await c.evaluate(`openAccountPanel(); 1`);
  await c.settle(1200);
  const first = await c.evaluate(`window.__probe`);
  const panel = await c.evaluate(PANEL);
  check('panel ở trạng thái Khách', panel && panel.state === 'guest', panel ? panel.state : '(không mở)');
  check('panel vẽ ĐÚNG MỘT lần khi mở (không nháy lần hai)', first.writes === 1,
    first.writes + ' lần ghi, trạng thái: ' + JSON.stringify(first.states));
  check('animation nhập cảnh chạy đúng MỘT lần', first.pops === 1, first.pops + ' lần pop-in');
  check('chỉ có MỘT hành động: nút đăng nhập Google', panel.buttons.length === 1 && panel.signIn === 1, JSON.stringify(panel.buttons));
  check('không còn danh sách quyền lợi', panel.perks === 0, String(panel.perks));
  check('không còn ghi chú "chế độ Khách"', panel.guestNote === 0, String(panel.guestNote));
  check('không có hạn mức / gói Pro / lịch sử / nút đăng xuất',
    panel.quota === 0 && panel.pro === 0 && panel.history === 0 && panel.signOut === 0,
    JSON.stringify({ quota: panel.quota, pro: panel.pro, history: panel.history, signOut: panel.signOut }));
  check('câu mời vẫn nói đúng việc đăng nhập mang lại', /Đăng nhập/u.test(panel.text) && /Cloud AI/u.test(panel.text), panel.text.slice(0, 80));

  // ---- Đóng rồi mở lại: vẫn phải một lần vẽ ---------------------------------
  await c.evaluate(`closeAccountPanel(); 1`);
  await c.settle(400);
  await c.evaluate(ARM);
  await c.evaluate(`openAccountPanel(); 1`);
  await c.settle(1000);
  const second = await c.evaluate(`window.__probe`);
  check('mở lại: vẫn đúng MỘT lần vẽ', second.writes === 1, first.writes + ' → ' + second.writes + ' lần ghi');
  check('mở lại: vẫn đúng MỘT animation nhập cảnh', second.pops === 1, second.pops + ' lần pop-in');
  const again = await c.evaluate(PANEL);
  check('mở lại: vẫn là panel Khách tối giản', again && again.state === 'guest' && again.buttons.length === 1, again ? again.state : '(không mở)');

  // ---- Chip ở sidebar: vẫn phải nói "Chưa đăng nhập" ------------------------
  const chip = await c.evaluate(String.raw`(() => {
    const el = document.querySelector('[data-account-chip]');
    if (!el) return null;
    const role = el.querySelector('[data-account-role]');
    return { state: el.dataset.state || '', role: role ? role.textContent.trim() : '' };
  })()`);
  check('chip sidebar nói đúng "Chưa đăng nhập"', chip && chip.state === 'guest' && chip.role === 'Chưa đăng nhập', chip ? chip.state + ' / ' + chip.role : '(không có chip)');

  // ---- Vẽ lại khi trạng thái ĐỔI (đường của người đã đăng nhập) --------------
  // Không có phiên thật trong hồ sơ sạch, nên trạng thái ở đây là DỰNG: mục đích không phải
  // kiểm dữ liệu hạn mức (unit test `account-usage`/`account-billing` lo việc đó) mà kiểm
  // ĐÚNG cơ chế vừa sửa: vẽ lại thân panel KHÔNG được dựng lại `.modal` (không được nảy lần nữa)
  // và các nút phải còn sống sau lần vẽ lại.
  const rerender = await c.evaluate(String.raw`(() => {
    const modalBefore = document.querySelector('[data-account-panel]');
    if (!modalBefore) return { error: 'panel chưa mở' };
    modalBefore.dataset.probeMarker = 'same-element';
    window.__probe.pops = 0;
    window.__probe.writes = 0;
    const realStatus = accountState.status;
    const realQuota = accountState.quota;
    accountState.status = { loggedIn: true, configured: true, email: 'giao.vien@example.com' };
    accountState.quota = { ok: true, unit: 'credits', limit: 500, used: 5, plan: 'plus' };
    rerenderAccountPanel();
    const after = document.querySelector('[data-account-panel]');
    const out = {
      sameElement: !!after && after.dataset.probeMarker === 'same-element',
      state: after ? after.dataset.accountPanelState : '',
      text: after ? after.innerText.replace(/\s+/g, ' ').trim() : '',
      pops: window.__probe.pops,
    };
    accountState.status = realStatus;
    accountState.quota = realQuota;
    return out;
  })()`);
  check('vẽ lại KHÔNG dựng lại .modal (cùng một phần tử DOM)', rerender.sameElement === true, JSON.stringify({ same: rerender.sameElement }));
  check('vẽ lại không chạy lại animation nhập cảnh', rerender.pops === 0, String(rerender.pops));
  check('vẽ lại đổi đúng thân panel sang trạng thái thành viên', rerender.state === 'member' && /credits|Gói Plus|lượt/u.test(rerender.text), rerender.state + ' / ' + rerender.text.slice(0, 90));
  const closeWorks = await c.evaluate(String.raw`(() => {
    const btn = document.querySelector('[data-account-panel] .modal-close');
    if (!btn) return 'không có nút đóng';
    btn.click();
    return document.querySelector('[data-account-panel]') ? 'panel vẫn còn' : 'closed';
  })()`);
  check('sau lần vẽ lại, nút Đóng vẫn sống (handler được gắn lại)', closeWorks === 'closed', closeWorks);

  await c.evaluate(`Page.reload`).catch(() => {});
  await c.settle(1500);

  const failed = results.filter((row) => !row.ok).length;
  console.log('\nui-account-guest-check: ' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
