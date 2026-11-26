/**
 * #369 — đường dẫn trang cha → trang con ("Thư viện trò chơi › Chỉnh sửa trò chơi").
 *
 * Bốn câu không được phép sai:
 *   - trang cấp 1 KHÔNG có đường dẫn: một breadcrumb "Thư viện trò chơi › Thư viện trò chơi"
 *     là một dòng vô nghĩa chiếm chỗ trên mọi trang;
 *   - trang con phải mang theo trang ĐÃ MỞ nó (thư viện hay dự án của tôi), không phải một
 *     giá trị mặc định — người dùng vừa đi từ đó ra;
 *   - mắt cuối không phải liên kết (một link tới chính mình là cái bẫy focus), và mắt cha
 *     dùng đúng hook `data-page` mà controller đã hiểu;
 *   - ở trang con, mục sidebar của CHA phải sáng.
 *
 * Đo trên tệp ĐÃ BIÊN DỊCH (classic script), với `escapeHtml` do harness cấp — cùng cách
 * tests/unit/account-billing.test.ts đo account.js.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIST = path.join(__dirname, '..', '..', '..', 'dist', 'src');

function load() {
  const file = path.join(DIST, 'renderer', 'features', 'page-trail.js');
  assert.ok(fs.existsSync(file), 'renderer/features/page-trail.js must exist — run npm run build');
  const escapeHtml = (value) =>
    String(value == null ? '' : value)
      .replace(/&/gu, '&amp;')
      .replace(/</gu, '&lt;')
      .replace(/>/gu, '&gt;')
      .replace(/"/gu, '&quot;');
  const context = vm.createContext({ console, escapeHtml });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return (code) => vm.runInContext(code, context);
}

const run = load();

// 1. Trang cấp 1: không có đường dẫn, không có <nav> rỗng.
for (const page of ['library', 'create-wizard', 'create', 'lesson-plans', 'my-projects', 'sessions', 'settings']) {
  assert.equal(run(`pageTrailHtml(${JSON.stringify(page)})`), '', `${page} là trang cấp 1 nên phải không có breadcrumb`);
  assert.equal(run(`pageTrailParent(${JSON.stringify(page)}, '')`), '', `${page} không có cha`);
  assert.equal(run(`pageTrailRoot(${JSON.stringify(page)}, '')`), page, `${page} tự sáng mục của mình`);
}

// 2. Trang con mang theo trang ĐÃ MỞ nó.
{
  const crumbs = run("pageTrailCrumbs('editor', 'my-projects')");
  assert.equal(crumbs.length, 2);
  assert.equal(crumbs[0].page, 'my-projects');
  assert.equal(crumbs[0].label, 'Dự án của tôi');
  assert.equal(crumbs[1].page, '', 'mắt cuối là chính trang đang mở, không phải liên kết');
  assert.equal(crumbs[1].label, 'Chỉnh sửa trò chơi');
  const fromLibrary = run("pageTrailCrumbs('editor', 'library')");
  assert.equal(fromLibrary[0].label, 'Thư viện trò chơi');
  // Không biết mở từ đâu ⇒ mặc định của bảng, không phải một chuỗi rỗng.
  assert.equal(run("pageTrailCrumbs('editor', '')")[0].page, 'library');
}

// 3. Trang cha rác không được tạo ra đường dẫn tự trỏ vào mình.
for (const junk of ['editor', 'khong-co-trang-nay', '']) {
  const parent = run(`pageTrailParent('editor', ${JSON.stringify(junk)})`);
  assert.equal(parent, 'library', `parent rác ${JSON.stringify(junk)} phải lùi về mặc định`);
}

// 4. Markup: mắt cha là nút `data-page`, mắt cuối có aria-current, không có link tự trỏ.
{
  const html = run("pageTrailHtml('editor', 'library')");
  assert.match(html, /^<nav class="page-trail" aria-label="Đường dẫn trang">/u);
  assert.match(html, /data-page="library"/u, 'mắt cha phải dùng hook data-page của controller');
  assert.match(html, /aria-current="page">Chỉnh sửa trò chơi</u);
  assert.equal(/data-page="editor"/u.test(html), false, 'không được có liên kết tới chính trang đang mở');
  assert.match(html, /›/u);
  // Tiêu đề riêng của trang con được truyền vào (trình soạn thảo mới).
  const fresh = run("pageTrailHtml('editor', 'library', { childTitle: 'Duyệt và hoàn thiện trò chơi' })");
  assert.match(fresh, /aria-current="page">Duyệt và hoàn thiện trò chơi</u);
}

// 5. Mục sidebar sáng theo CHA.
assert.equal(run("pageTrailRoot('editor', 'library')"), 'library');
assert.equal(run("pageTrailRoot('editor', 'my-projects')"), 'my-projects');
assert.equal(run("pageTrailRoot('library', '')"), 'library');

// 6. Nhãn cho nút quay lại: cùng bảng, không hardcode "Thư viện".
assert.equal(run("pageTrailTitle('my-projects')"), 'Dự án của tôi');
assert.equal(run("pageTrailTitle('library')"), 'Thư viện trò chơi');
assert.equal(run("pageTrailTitle('khong-co')"), '', 'trang lạ không được bịa tên');

console.log('page-trail: 6 nhóm khẳng định đã qua');

export {};
