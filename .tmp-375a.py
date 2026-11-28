import io

def patch(path, pairs):
    s = io.open(path, encoding='utf-8', newline='').read().replace('\r\n', '\n')
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:70], s.count(old))
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n'))
    print('patched', path)

patch('src/renderer/features/lesson-chat.ts', [
# 1. Hàng gắn giáo án chỉ còn CHIP; hai nút chữ rời khỏi đó.
(r"""  const ungrounded = docs.length ? '' : ' title="Chưa gắn giáo án nào — AI trả lời bằng kiến thức chung. Chọn giáo án để có trích dẫn."';
  return `<div class="lesson-chat-attach" data-lesson-chat-sources>${chips}
    <button type="button" class="lesson-chat-mode" data-action="lesson-chat-picker" aria-pressed="${lessonChatUi.showPicker ? 'true' : 'false'}"${ungrounded}><span data-icon="circle-plus" data-icon-size="13"></span> Chọn giáo án</button>
    <button type="button" class="lesson-chat-mode" data-action="lesson-chat-import"><span data-icon="upload" data-icon-size="13"></span> Tải giáo án mới</button>
  </div>`;""",
r"""  // #375: hai nút chữ "Chọn giáo án" + "Tải giáo án mới" đã gộp thành MỘT nút "+" nằm trong
  // khung gõ (xem `lessonChatAttachButtonHtml`). Hàng này giờ chỉ còn chip của những giáo án
  // đang đọc — đúng một việc: cho biết AI đang đọc gì. Không có chip thì hàng này rỗng và biến mất.
  if (!chips) return '';
  return `<div class="lesson-chat-attach" data-lesson-chat-sources>${chips}</div>`;"""),
# 2. Nút "+" trong khung gõ (góc dưới-trái, đối xứng với mũi tên gửi ở góc dưới-phải).
(r"""    <div class="lesson-chat-field">
      <textarea id="lessonChatInput\"""",
r"""    <div class="lesson-chat-field">
      ${lessonChatAttachButtonHtml()}
      <textarea id="lessonChatInput\""""),
# 3. Hàm dựng nút "+", đặt ngay trên `lessonChatComposerHtml`.
(r"""function lessonChatComposerHtml() {""",
r"""/**
 * #375 — MỘT nút "+" thay cho hai nút chữ, và nó nằm TRONG khung gõ.
 *
 * Trước: "Chọn giáo án" và "Tải giáo án mới" là hai nút chữ chiếm trọn một hàng phía trên khung
 * gõ, trong khi cả hai đều dẫn tới cùng một chỗ: bảng chọn giáo án (bảng đó đã có mục tải tệp
 * mới). Hai nút cho một việc, và cả hai đều cách xa nơi con trỏ đang đứng.
 *
 * Giờ: một nút tròn 30×30 ở góc dưới-TRÁI của khung gõ (đối xứng với mũi tên gửi ở góc dưới-phải),
 * mở đúng bảng chọn đó. Nó là icon-only nên tên đọc được nằm ở `aria-label`/`title`, và
 * `aria-expanded` nói bảng đang mở hay đóng.
 */
function lessonChatAttachButtonHtml() {
  const grounded = lessonChatDocuments().length > 0;
  return `<button type="button" class="lesson-chat-attach-btn${lessonChatUi.showPicker ? ' is-open' : ''}"`
    + ` data-action="lesson-chat-picker" aria-expanded="${lessonChatUi.showPicker ? 'true' : 'false'}"`
    + ` aria-label="Chọn hoặc tải giáo án" title="${grounded ? 'Chọn hoặc tải giáo án khác' : 'Chưa gắn giáo án nào — chọn hoặc tải một tệp để AI trích dẫn'}">`
    + `<span data-icon="circle-plus" data-icon-size="16"></span></button>`;
}

function lessonChatComposerHtml() {"""),
# 4. Bảng chọn giáo án có sẵn lối "tải tệp mới" (để nút "+" thật sự thay được hai nút cũ).
(r"""  if (!library.length) {
    return `<div class="lesson-chat-pop"><h4>Chọn giáo án</h4><div class="lesson-chat-empty-sources">Kho chưa có giáo án nào. Bấm "Tải giáo án mới" để nhập một tệp.</div></div>`;
  }""",
r"""  // #375: dòng "Tải giáo án mới" nằm trong bảng này, nên nút "+" một mình vẫn làm được cả hai
  // việc cũ (chọn tệp đã có, hoặc nhập tệp mới).
  const importRow = `<div class="lesson-chat-set-actions"><button type="button" class="lesson-chat-mode" data-action="lesson-chat-import"><span data-icon="upload" data-icon-size="13"></span> Tải giáo án mới</button></div>`;
  if (!library.length) {
    return `<div class="lesson-chat-pop" data-lesson-chat-picker><h4>Chọn giáo án</h4><div class="lesson-chat-empty-sources">Kho chưa có giáo án nào. Tải một tệp để bắt đầu.</div>${importRow}</div>`;
  }"""),
(r"""    <div class="lesson-chat-set-actions">
      <button type="button" class="lesson-chat-mode" data-action="lesson-chat-pick-all" data-id="all">Chọn tất cả</button>
      <button type="button" class="lesson-chat-mode" data-action="lesson-chat-pick-all" data-id="none">Bỏ chọn</button>
      <button type="button" class="btn btn-primary btn-small" data-action="lesson-chat-picker-close">Xong</button>
    </div>""",
r"""    <div class="lesson-chat-set-actions">
      <button type="button" class="lesson-chat-mode" data-action="lesson-chat-pick-all" data-id="all">Chọn tất cả</button>
      <button type="button" class="lesson-chat-mode" data-action="lesson-chat-pick-all" data-id="none">Bỏ chọn</button>
      <button type="button" class="lesson-chat-mode" data-action="lesson-chat-import"><span data-icon="upload" data-icon-size="13"></span> Tải giáo án mới</button>
      <button type="button" class="btn btn-primary btn-small" data-action="lesson-chat-picker-close">Xong</button>
    </div>"""),
])
