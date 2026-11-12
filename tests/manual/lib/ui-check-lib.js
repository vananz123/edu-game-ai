// ui-play-surface-check.js — regression guard for the play screen UI.
//
// Covers three defects teachers reported:
//   1. game screen text too small / wasted space / no colour
//   2. "Trình chiếu" button broken (label clipped inside a 30x30 box)
//   3. nav icons not prominent
//
// Run against a built app started with --remote-debugging-port:
//   npm run build
//   npx electron . --remote-debugging-port=9341
//   node tests/ui-play-surface-check.js 9341
const PORT = Number(process.argv[2] || process.env.CDP_PORT || 9341);

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function connect(options = {}) {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  // Tauri phục vụ trang qua giao thức riêng nên URL là `http://tauri.localhost/`
  // (không có `index.html`); vỏ Electron thì dùng `file:///…/index.html`.
  const target = list.find(
    x => x.type === 'page' && (/index\.html/.test(x.url) || /^https?:\/\/tauri\.localhost\/?$/.test(x.url)),
  );
  if (!target) throw new Error('no index.html page target on port ' + PORT);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  let id = 0;
  const pend = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise(r => {
    const i = ++id; pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  /**
   * A fresh launch can answer the very first evaluate with `x is not defined` for
   * renderer globals that *are* declared (the classic scripts register them on window
   * while the first evaluation is compiled). It is a race, not a bug in the page: every
   * later call finds them. Retrying only for that exact shape of error keeps a genuine
   * `ReferenceError` loud after the retries, instead of turning it into a silent pass.
   */
  // A cold launch answers the first evaluate of *every* new expression while the classic
  // scripts are still registering, and it does so for several seconds. `Runtime.evaluate`
  // throws the text of a page exception as a plain string, so both shapes are matched.
  const isColdGlobalMiss = error => /is not defined(\s*$|\n)/u.test(String(error && error.message || error));
  /** True once the page finished loading and its scripts are all in place. */
  const pageReady = async () => {
    try {
      const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      return r.result?.result?.value === 'complete';
    } catch {
      return false;
    }
  };
  void pageReady;
  // `awaitPromise` không có hạn: một promise không bao giờ settle để CDP im lặng
  // mãi và cả cổng treo không một dòng FAIL nào — đúng cách một lỗi thật đã từng
  // biến mất khỏi log. Hết hạn thì coi như hỏng, để phép đo báo đỏ.
  // Check dài (ma trận 5 bề mặt × 3 chế độ) có thể cần hơn 120 s; nó truyền
  // `evalTimeoutMs` riêng thay vì nới hạn cho mọi check.
  const EVAL_TIMEOUT_MS = Number(options && options.evalTimeoutMs) || 120000;
  const evaluateOnce = async expression => {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`biểu thức không trả lời sau ${EVAL_TIMEOUT_MS / 1000} s`)),
        EVAL_TIMEOUT_MS,
      );
    });
    try {
      const r = await Promise.race([
        send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
        timeout,
      ]);
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
      return r.result?.result?.value;
    } finally {
      clearTimeout(timer);
    }
  };
  const evaluate = async expression => {
    // The renderer declares its globals from classic scripts that may still be
    // registering on a cold launch; retries cover that without hiding a real
    // ReferenceError (it is re-thrown after the last try).
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await evaluateOnce(expression);
      } catch (error) {
        if (!isColdGlobalMiss(error) || attempt >= 8) throw error;
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }
  };
  // Wait for the page itself to report "complete" before the first expression: on a
  // cold start this alone removes most of the race, and the renders the checks trigger
  // later need the scripts anyway.
  for (let attempt = 0; attempt < 40 && !(await pageReady()); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  // Cổng gỡ lỗi mở trước khi trang ứng dụng dựng xong DOM, nhất là trên WebView2:
  // `readyState` có thể đã `complete` với một tài liệu trống. Chờ thêm shell để
  // mọi phép đo DOM không rơi vào một khung hình chưa có gì.
  const hasShell = async () => {
    try {
      const r = await send('Runtime.evaluate', { expression: 'Boolean(document.querySelector("body > *"))', returnByValue: true });
      return r.result?.result?.value === true;
    } catch {
      return false;
    }
  };
  for (let attempt = 0; attempt < 60 && !(await hasShell()); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  await send('Runtime.enable');
  await send('Page.setWebLifecycleState', { state: 'active' });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  // Đo trên cửa sổ đã hoàn tất animation ở MỌI lần chạy. Khi app không phải cửa
  // sổ đang được chọn, Chromium tạm dừng timeline nên `.modal` còn ở khung đầu
  // của animation pop-in (scale 0.92) và mọi px đo được nhỏ hơn thật ~8%.
  const settle = async () => {
    await evaluate(`(async () => {
      window.__settleAnimations = () => document.querySelectorAll('.modal, .modal-backdrop').forEach(el =>
        el.getAnimations().forEach(a => { try { a.finish(); } catch {} }));
      window.__settleAnimations();
      await new Promise(r => setTimeout(r, 250));
      return true;
    })()`);
  };
  return { ws, evaluate, send, settle };
}

module.exports = { check, connect, results, PORT };
