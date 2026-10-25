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

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const target = list.find(x => x.type === 'page' && /index\.html/.test(x.url));
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
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
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
