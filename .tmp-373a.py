import io

def patch(path, pairs):
    s = io.open(path, encoding='utf-8', newline='').read().replace('\r\n', '\n')
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:70], s.count(old))
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n'))
    print('patched', path)

# 1. Bỏ hẳn khối .page-head của trang Giáo án (chữ "Giáo án" + 2 nút) — hai nút chuyển vào
#    header của khung chat, nên không mất hành động nào và không còn hàng tiêu đề chiếm chỗ.
patch('src/renderer/pages/lesson-plans.ts', [
(r"""  return `<div class="page-head"><div class="page-head-title"><h1>Giáo án</h1></div><div class="page-head-actions"><button class="btn btn-secondary btn-small" data-action="import-document"><span data-icon="upload" data-icon-size="14"></span> Nhập giáo án từ tệp</button><button class="btn btn-primary btn-small" data-page="create-wizard"><span data-icon="circle-plus" data-icon-size="14"></span> Tạo dự án mới</button></div></div>
    <div class="lesson-two-col" data-lesson-two-col>""",
r"""  // #373: tiêu đề "Giáo án" đã bị bỏ (chủ dự án: "tôi cần xóa chữ giáo án đi"). Hàng tiêu đề đó
  // chỉ chiếm chỗ: tên trang đã có mục đang sáng trên sidebar, và hai nút của nó đã chuyển vào
  // header của khung chat (features/lesson-chat.ts) nên không mất một hành động nào.
  // `.lesson-page` là khung flex cao đúng phần còn lại của cửa sổ, để trang này KHÔNG cuộn.
  return `<div class="lesson-page" data-lesson-page>
    <div class="lesson-two-col" data-lesson-two-col>"""),
(r"""        </section>
      </div>
    </div>`;
}""",
r"""        </section>
      </div>
    </div>
  </div>`;
}"""),
])

# 2. Hai nút cũ nằm trong header khung chat.
patch('src/renderer/features/lesson-chat.ts', [
(r"""    <div class="lesson-chat-head-actions">
      <button type="button" class="lesson-chat-mode" data-action="lesson-chat-history\"""",
r"""    <div class="lesson-chat-head-actions">
      <!-- #373: hai nút của trang Giáo án chuyển vào đây khi hàng tiêu đề bị bỏ. -->
      <button type="button" class="lesson-chat-mode" data-action="import-document" title="Nhập giáo án từ tệp"><span data-icon="upload" data-icon-size="13"></span> Nhập tệp</button>
      <button type="button" class="lesson-chat-mode" data-page="create-wizard" title="Tạo dự án mới từ giáo án"><span data-icon="circle-plus" data-icon-size="13"></span> Dự án mới</button>
      <button type="button" class="lesson-chat-mode" data-action="lesson-chat-history\""""),
])
