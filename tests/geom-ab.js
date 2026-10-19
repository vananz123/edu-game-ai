// geom-ab.js — CDP geometry A/B cho workstream Tailwind migration (G2+).
// Method của STATUS Phase 2a: đóng băng transitions/animations, dump rect + computed style
// từng phần tử trong `.app-shell *` của cả 7 trang, rồi so sánh 2 dump.
//
// Cách dùng (app đang mở với --remote-debugging-port=9333):
//   node tests/geom-ab.js dump <file-out.json> [viewport-width]
//   node tests/geom-ab.js compare <before.json> <after.json>
//
// Với [viewport-width]: set DeviceMetricsOverride (vd 1100 → nhánh max-wide,
// 650 → max-compact) rồi dump; bỏ trống thì dùng kích thước cửa sổ thật.
// Noise baseline: dump 2 lần liên tiếp rồi compare → kỳ vọng 0 diff.
const fs = require('node:fs');
const PORT = 9333;
const PAGES = ['home', 'library', 'create-wizard', 'create', 'lesson-plans', 'my-projects', 'sessions', 'settings'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const t = list.find(x => x.type === 'page' && /index\.html/.test(x.url));
      if (t) return t;
    } catch {}
    await sleep(1000);
  }
  throw new Error('No page target on CDP port ' + PORT);
}

async function connect() {
  const target = await findTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { send, close: () => ws.close() };
}

// Đóng băng transition/animation (giống Phase 2a) để giá trị computed không bị mid-transition.
const FREEZE_CSS = `*{transition:none!important;animation:none!important;scroll-behavior:auto!important}`;

const DUMP_EXPR = (freeze) => `
(() => {
  let st = document.getElementById('__geomFreeze');
  ${freeze ? `
  if (!st) { st = document.createElement('style'); st.id = '__geomFreeze'; document.head.appendChild(st); }
  st.textContent = ${JSON.stringify(FREEZE_CSS)};` : `
  if (st) st.remove();`}
  const root = document.querySelector('.app-shell');
  if (!root) return JSON.stringify({ error: 'no .app-shell' });
  const els = [...root.querySelectorAll('*')];
  const pick = (el, prop) => { const v = getComputedStyle(el).getPropertyValue(prop); return v; };
  const out = els.map((el, i) => {
    const r = el.getBoundingClientRect();
    return {
      i,
      tag: el.tagName.toLowerCase(),
      cls: el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || ''),
      id: el.id || '',
      x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100,
      w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100,
      d: pick(el, 'display'), pos: pick(el, 'position'),
      fs: pick(el, 'font-size'), lh: pick(el, 'line-height'), fw: pick(el, 'font-weight'),
      col: pick(el, 'color'), bg: pick(el, 'background-color'),
      m: pick(el, 'margin'), p: pick(el, 'padding'),
      bt: pick(el, 'border-top-width') + ' ' + pick(el, 'border-top-style') + ' ' + pick(el, 'border-top-color'),
      br: pick(el, 'border-radius'), sh: pick(el, 'box-shadow'),
      ff: pick(el, 'font-family'), ls: pick(el, 'letter-spacing'),
      ta: pick(el, 'text-align'), tt: pick(el, 'text-transform'), ov: pick(el, 'overflow'),
      g: pick(el, 'gap'), ai: pick(el, 'align-items'), jc: pick(el, 'justify-content'),
      fx: pick(el, 'flex-direction'), fg: pick(el, 'flex'), gm: pick(el, 'grid-template-columns')
    };
  });
  return JSON.stringify({ count: out.length, els: out });
})()`;

// Đóng băng vị trí trỏ chuột: dispatch mouseMoved về góc trên-trái (chỉ có sidebar
// padding/brand, không phần tử nào có :hover ở đó). Không có bước này thì vị trí
// con trỏ OS thật trên cửa sổ Electron làm lệch dump do :hover (translateY + border
// + shadow) — đã gặp: lệch 3px y ở game-card/template-card tùy lần dump.
async function parkPointer(send) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, buttons: 0, button: 'none' });
  const h = await send('Runtime.evaluate', {
    expression: `[...document.querySelectorAll(':hover')].slice(-1)[0]?.tagName + '.' + (([...document.querySelectorAll(':hover')].slice(-1)[0]?.className) || '').split(' ')[0]`,
    returnByValue: true,
  });
  return h.result.value;
}

async function dump(send, page) {
  await send('Runtime.evaluate', { expression: `state.page = ${JSON.stringify(page)}; render(); void 0;` });
  await sleep(250); // để reflow ổn định
  const hovered = await parkPointer(send);
  await sleep(60); // để :hover apply xong trước khi đọc computed style
  const res = await send('Runtime.evaluate', { expression: DUMP_EXPR(true), returnByValue: true });
  if (res.exceptionDetails) throw new Error('dump failed on ' + page + ': ' + JSON.stringify(res.exceptionDetails));
  console.log(`  hover@${page}: ${hovered}`);
  return JSON.parse(res.result.value);
}

const IGNORED_KEYS = new Set([]);

function compareDump(a, b) {
  const report = { pages: {}, totalDiffs: 0, totalElements: 0 };
  for (const page of PAGES) {
    const A = a[page], B = b[page];
    const p = { countA: A.count, countB: B.count, diffs: [] };
    report.totalElements += A.count;
    if (A.count !== B.count) p.countChanged = true;
    const n = Math.min(A.els.length, B.els.length);
    for (let i = 0; i < n; i++) {
      const ea = A.els[i], eb = B.els[i];
      if (ea.tag !== eb.tag || ea.id !== eb.id) { p.diffs.push({ i, note: `identity ${ea.tag}#${ea.id} vs ${eb.tag}#${eb.id}` }); continue; }
      const keys = new Set([...Object.keys(ea), ...Object.keys(eb)]);
      for (const k of keys) {
        if (k === 'i' || k === 'cls') continue;
        if (ea[k] !== eb[k]) p.diffs.push({ i, el: `${ea.tag}${ea.id ? '#' + ea.id : ''}.${String(ea.cls).split(/\s+/)[0] || ''}`, key: k, a: ea[k], b: eb[k] });
      }
    }
    report.totalDiffs += p.diffs.length;
    report.pages[page] = p;
  }
  return report;
}

(async () => {
  const [mode, arg1, arg2] = process.argv.slice(2);
  if (mode !== 'dump' && mode !== 'compare') {
    console.log('Usage: node tests/geom-ab.js dump <out.json> | compare <before.json> <after.json>');
    process.exit(1);
  }
  if (mode === 'compare') {
    const a = JSON.parse(fs.readFileSync(arg1, 'utf8'));
    const b = JSON.parse(fs.readFileSync(arg2, 'utf8'));
    const rep = compareDump(a, b);
    for (const [page, p] of Object.entries(rep.pages)) {
      const status = p.diffs.length === 0 && !p.countChanged ? 'OK  ' : 'DIFF';
      console.log(`${status} ${page}: elements ${p.countA}→${p.countB}, ${p.diffs.length} diff(s)`);
      for (const d of p.diffs.slice(0, 40)) console.log('     ' + JSON.stringify(d));
      if (p.diffs.length > 40) console.log(`     … ${p.diffs.length - 40} more`);
    }
    console.log(`TOTAL: ${rep.totalDiffs} diff(s) across ${rep.totalElements} elements`);
    process.exit(rep.totalDiffs === 0 ? 0 : 2);
  }
  const { send, close } = await connect();
  const width = Number(arg2) > 0 ? Number(arg2) : 0;
  if (width) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    console.log('viewport override: ' + width + 'px');
  } else {
    try { await send('Emulation.clearDeviceMetricsOverride'); } catch {}
  }
  const out = {};
  for (const page of PAGES) {
    out[page] = await dump(send, page);
    console.log(`dumped ${page}: ${out[page].count} elements`);
  }
  if (width) await send('Emulation.clearDeviceMetricsOverride');
  close();
  fs.writeFileSync(arg1, JSON.stringify(out));
  console.log('written ' + arg1);
})().catch(e => { console.error(e); process.exit(1); });
