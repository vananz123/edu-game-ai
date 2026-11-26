// @ts-nocheck -- renderer chrome; `escapeHtml` là global của sibling classic script.
//
// #369 — đường dẫn trang cha → trang con ("Thư viện trò chơi › Chỉnh sửa trò chơi").
//
// Một bảng duy nhất nói trang nào là CON của trang nào. Hiện chỉ `editor` là trang con thật:
// nó không có mục riêng trên sidebar và luôn được mở TỪ một trang khác, nên "tôi đang ở đâu"
// chỉ trả lời được nếu trang cha được mang theo. Sáu trang còn lại là mục cấp 1 của sidebar —
// chúng không có cha, và vì thế không được bịa ra một đường dẫn.
//
// Bảng để ở đây (không rải trong 8 tệp page) để lần sau thêm một trang con chỉ là thêm một
// dòng, và để `tests/unit/page-trail.test.ts` đọc được đúng bảng mà app dùng.
const PAGE_TRAIL_TITLES = {
  library: 'Thư viện trò chơi',
  'create-wizard': 'Tạo trò chơi từ giáo án',
  create: 'Tạo trò chơi',
  'lesson-plans': 'Giáo án',
  'my-projects': 'Dự án của tôi',
  sessions: 'Lịch sử kết quả',
  settings: 'Cài đặt',
  editor: 'Chỉnh sửa trò chơi',
  'editor-new': 'Duyệt và hoàn thiện trò chơi',
};

/** Trang con → trang cha mặc định, dùng khi không biết đã mở từ đâu. */
const PAGE_TRAIL_PARENTS = { editor: 'library' };

/** Tên của một trang, cho breadcrumb và cho nhãn nút quay lại. */
function pageTrailTitle(page, childTitle) {
  if (childTitle) return String(childTitle);
  return PAGE_TRAIL_TITLES[page] || '';
}

/** Trang cha đã biết: ưu tiên nơi thực sự mở trang này, rồi mới tới mặc định. */
function pageTrailParent(page, parent) {
  if (!PAGE_TRAIL_PARENTS[page]) return '';
  const declared = String(parent || '');
  // Trang cha phải là một trang cấp 1 có thật: một `parent` rác (ví dụ chính `editor`) sẽ
  // tạo ra "Chỉnh sửa trò chơi › Chỉnh sửa trò chơi".
  if (declared && declared !== page && !PAGE_TRAIL_PARENTS[declared] && PAGE_TRAIL_TITLES[declared]) return declared;
  return PAGE_TRAIL_PARENTS[page];
}

/**
 * Mục sidebar phải sáng khi đang ở trang này: trang con sáng mục của CHA nó, để người dùng
 * không bị mất chỗ đứng khi mở trình soạn thảo.
 */
function pageTrailRoot(page, parent) {
  return pageTrailParent(page, parent) || page;
}

/**
 * Các mắt của đường dẫn. Trang cấp 1 ⇒ [] (không có gì để chỉ). Phần tử cuối KHÔNG có
 * `page` vì nó là trang đang mở — một liên kết tới chính mình là một cái bẫy focus.
 */
function pageTrailCrumbs(page, parent, options = {}) {
  const parentPage = pageTrailParent(page, parent);
  if (!parentPage) return [];
  const current = pageTrailTitle(page, options.childTitle);
  return [
    { page: parentPage, label: pageTrailTitle(parentPage) },
    { page: '', label: current },
  ];
}

/** Markup đường dẫn. Rỗng khi trang là cấp 1 — không có `<nav>` rỗng trên màn hình. */
function pageTrailHtml(page, parent, options = {}) {
  const crumbs = pageTrailCrumbs(page, parent, options);
  if (!crumbs.length) return '';
  const parts = [];
  for (let index = 0; index < crumbs.length; index += 1) {
    const crumb = crumbs[index];
    const last = index === crumbs.length - 1;
    // Nút cha dùng lại đúng hook `data-page` mà sidebar và mọi nút điều hướng khác dùng,
    // nên nó không cần một đường nối mới nào (controller.ts đã lo `[data-page]`).
    parts.push(
      last
        ? `<span class="page-trail-current" aria-current="page">${escapeHtml(crumb.label)}</span>`
        : `<button type="button" class="page-trail-link" data-page="${escapeHtml(crumb.page)}">${escapeHtml(crumb.label)}</button>`
    );
  }
  return `<nav class="page-trail" aria-label="Đường dẫn trang">${parts.join('<span class="page-trail-sep" aria-hidden="true">›</span>')}</nav>`;
}
