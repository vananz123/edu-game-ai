/**
 * #368 — ẩn/hiện thanh bên.
 *
 * Bốn câu không được phép sai:
 *   - mặc định là HIỆN: một app mở ra với thanh bên biến mất là một app trông như hỏng;
 *   - một giá trị rác trong localStorage cũng phải cho ra "hiện", không phải một cái vỏ rỗng;
 *   - ẩn rồi thì phải có ĐƯỜNG HIỆN LẠI (nút riêng + Ctrl+B), nếu không người dùng tự khoá mình;
 *   - lựa chọn phải được NHỚ, và nhớ được cả khi localStorage bị chặn.
 *
 * Đo trên tệp ĐÃ BIÊN DỊCH (classic script), với một DOM giả tối thiểu — cùng cách
 * tests/unit/account-billing.test.ts đo account.js.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIST = path.join(__dirname, '..', '..', '..', 'dist', 'src');
const KEY = 'edugame.sidebar';

function makeButton(attrs) {
  const node = {
    attrs: { ...attrs },
    hidden: false,
    getAttribute: (name) => (name in node.attrs ? node.attrs[name] : null),
    setAttribute: (name, value) => {
      node.attrs[name] = String(value);
    },
    closest(selector) {
      return selector.split(',').some((one) => one.trim().replace(/[[\]]/gu, '') in node.attrs) ? node : null;
    },
  };
  return node;
}

function makeDom(stored) {
  const store = new Map();
  if (stored !== undefined) store.set(KEY, stored);
  const localStorage = {
    getItem: (name) => (store.has(name) ? store.get(name) : null),
    setItem: (name, value) => store.set(name, String(value)),
  };
  const toggle = makeButton({ 'data-sidebar-toggle': '' });
  const reveal = makeButton({ 'data-sidebar-show': '', hidden: true });
  const handlers = {};
  const document = {
    documentElement: {
      attrs: {},
      getAttribute(name) {
        return name in this.attrs ? this.attrs[name] : null;
      },
      setAttribute(name, value) {
        this.attrs[name] = String(value);
      },
    },
    querySelectorAll(selector) {
      if (selector.includes('data-sidebar-toggle')) return [toggle];
      if (selector.includes('data-sidebar-show')) return [reveal];
      return [];
    },
    addEventListener(type, handler) {
      handlers[type] = handler;
    },
  };
  return { document, localStorage, store, toggle, reveal, handlers };
}

function load(stored, options: { brokenStorage?: boolean } = {}) {
  const file = path.join(DIST, 'renderer', 'features', 'sidebar-toggle.js');
  assert.ok(fs.existsSync(file), 'renderer/features/sidebar-toggle.js must exist — run npm run build');
  const dom = makeDom(stored);
  const context = vm.createContext({
    console,
    document: dom.document,
    localStorage: options.brokenStorage
      ? {
          getItem() {
            throw new Error('blocked');
          },
          setItem() {
            throw new Error('blocked');
          },
        }
      : dom.localStorage,
  });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  const run = (code) => vm.runInContext(code, context);
  return { dom, run, context };
}

function click(dom, node) {
  dom.handlers.click({ target: node, preventDefault() {} });
}

function key(dom, event) {
  dom.handlers.keydown({ preventDefault() {}, ...event });
}

const state = (dom) => dom.document.documentElement.getAttribute('data-sidebar');

// 1. Mặc định là HIỆN.
{
  const { dom, run } = load(undefined);
  run('initSidebarToggle()');
  assert.equal(state(dom), 'shown', 'chưa có lựa chọn nào thì thanh bên phải hiện');
  assert.equal(dom.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(dom.reveal.hidden, true, 'thanh bên đang hiện thì không được mời "hiện" nó');
}

// 2. Đã ẩn từ lần trước ⇒ mở app ra là ẩn, không nhá ra.
{
  const { dom, run } = load('hidden');
  run('initSidebarToggle()');
  assert.equal(state(dom), 'hidden');
  assert.equal(dom.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(dom.reveal.hidden, false, 'đang ẩn thì phải có đường hiện lại');
}

// 3. Giá trị rác ⇒ hiện (không bao giờ một cái vỏ rỗng).
for (const junk of ['yes', '0', '', 'null', 'undefined', 'HIDDEN']) {
  const { dom, run } = load(junk);
  run('initSidebarToggle()');
  assert.equal(state(dom), 'shown', `giá trị lạ ${JSON.stringify(junk)} phải cho ra "hiện"`);
}

// 4. Công tắc: đảo được hai chiều và NHỚ.
{
  const { dom, run } = load(undefined);
  run('initSidebarToggle()');
  run('toggleSidebar()');
  assert.equal(state(dom), 'hidden');
  assert.equal(dom.store.get(KEY), 'hidden', 'phải ghi lựa chọn xuống localStorage');
  assert.equal(dom.reveal.hidden, false);
  run('toggleSidebar()');
  assert.equal(state(dom), 'shown');
  assert.equal(dom.store.get(KEY), 'shown');
  assert.equal(dom.reveal.hidden, true);
}

// 5. Bấm nút THẬT (nút ẩn, rồi nút hiện) — không chỉ gọi hàm.
{
  const { dom, run } = load(undefined);
  run('initSidebarToggle()');
  click(dom, dom.toggle);
  assert.equal(state(dom), 'hidden', 'bấm nút ẩn phải ẩn');
  click(dom, dom.reveal);
  assert.equal(state(dom), 'shown', 'bấm nút hiện phải hiện lại');
  // Bấm vào chỗ khác không được đổi gì.
  click(dom, { closest: () => null });
  assert.equal(state(dom), 'shown', 'một cú bấm lạc không được ẩn thanh bên');
}

// 6. Bàn phím: Ctrl+B đảo, 'b' trần thì không.
{
  const { dom, run } = load(undefined);
  run('initSidebarToggle()');
  key(dom, { key: 'b' });
  assert.equal(state(dom), 'shown', 'gõ chữ b không được ẩn thanh bên');
  key(dom, { key: 'b', ctrlKey: true });
  assert.equal(state(dom), 'hidden', 'Ctrl+B phải ẩn được');
  key(dom, { key: 'B', ctrlKey: true });
  assert.equal(state(dom), 'shown', 'Ctrl+Shift+B (key là chữ hoa) cũng phải hiện lại');
}

// 7. localStorage bị chặn (chế độ riêng tư): vẫn đổi được trong phiên này.
{
  const { dom, run } = load(undefined, { brokenStorage: true });
  run('initSidebarToggle()');
  assert.equal(state(dom), 'shown', 'không đọc được thì mặc định hiện, không ném lỗi');
  run('toggleSidebar()');
  assert.equal(state(dom), 'hidden', 'vẫn phải ẩn được dù không ghi nhớ được');
}

console.log('sidebar-toggle: 7 nhóm khẳng định đã qua');

// Tệp này dùng `const` ở cấp module; `export {}` để TypeScript coi nó là một module
// (nếu không, nó trùng tên với các test khác trong cùng chương trình biên dịch).
export {};
