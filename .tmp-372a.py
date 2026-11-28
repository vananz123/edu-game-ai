import io

def patch(path, pairs):
    s = io.open(path, encoding='utf-8', newline='').read().replace('\r\n', '\n')
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:70], s.count(old))
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n'))
    print('patched', path)

patch('src/renderer/pages/settings.ts', [
# 1. Thẻ nhà cung cấp: bỏ dòng "lý do" khi nó chỉ nói lại chip trạng thái.
("""  const note = provider.note ? '<div class=\'mt-1 text-[12px] text-[#5a6478]\'>' + escapeHtml(provider.note) + '</div>' : '';""",
 """  // #372 — nhãn nào chỉ NÓI LẠI điều đã có ở chỗ khác thì bỏ.
  // (a) `reason` của một nhà cung cấp chưa cấu hình luôn là "Chưa có API key." — đúng câu mà
  //     chip "○ Chưa cấu hình" ngay bên cạnh đã nói. Chỉ giữ lý do khi trạng thái KHÁC thường
  //     (đang lỗi, đã cấu hình nhưng chưa kiểm tra), vì lúc đó nó thêm một dữ kiện.
  const reason = provider.reason && provider.status !== 'not-configured'
    ? '<div class="' + hintCls + ' mt-1" data-ai-provider-reason>' + escapeHtml(provider.reason) + '</div>'
    : '';
  // (b) Ghi chú của OpenCode nhắc lại đúng câu của badge "Chưa dùng cho luồng tạo trò chơi"
  //     ngay trên nó; cắt câu đó khỏi ghi chú, giữ phần còn lại.
  const noteText = String(provider.note || '').replace(/^Chưa dùng cho luồng tạo trò chơi\.\s*/u, '');
  const note = noteText ? '<div class=\'mt-1 text-[12px] text-[#5a6478]\'>' + escapeHtml(noteText) + '</div>' : '';"""),
("""    '<div class="' + hintCls + ' mt-1">Kiểm tra gửi một yêu cầu thật rất nhỏ (tối đa 8 token) tới nhà cung cấp — không phải tạo trò chơi.</div>'
  ].join('');""",
 """    // #372: dòng "Kiểm tra gửi một yêu cầu thật rất nhỏ (tối đa 8 token)…" đã bị bỏ. Nó giống
    // nhau ở CẢ BỐN thẻ, nên nó là bốn dòng chữ nói cùng một điều; nhãn nút "Kiểm tra kết nối"
    // đã nói việc nút làm.
  ].join('');"""),
("""  const localActions = provider.id === 'local' ? [
    '<div class="flex items-center gap-2 flex-wrap mt-2">',
    '<button class="' + btnSecondaryCls + '" data-ai-test="local"><span data-icon="link" data-icon-size="13"></span> Kiểm tra kết nối</button>',
    '<div class="' + hintCls + '">Kiểm tra chạy một câu hỏi ngắn trên model local đang chạy.</div>',
    '</div>'
  ].join('') : '';""",
 """  // #372: bỏ dòng hint cạnh nút của thẻ local — cùng lý do (nút đã tự nói).
  const localActions = provider.id === 'local' ? [
    '<div class="flex items-center gap-2 flex-wrap mt-2">',
    '<button class="' + btnSecondaryCls + '" data-ai-test="local"><span data-icon="link" data-icon-size="13"></span> Kiểm tra kết nối</button>',
    '</div>'
  ].join('') : '';"""),
("""    + '<div class="' + hintCls + ' mt-1" data-ai-provider-reason>' + escapeHtml(provider.reason || '') + '</div>'
    + note + fields + localActions + '</div>';""",
 """    + reason
    + note + fields + localActions + '</div>';"""),
# 2. Tab AI: bỏ hai chip nhỏ trên nhãn tab ("○" và "0/4") — chúng nói lại đúng hai chip đầy đủ
#    trong header panel, và một con số "0/4" không có nhãn là câu đố.
("""    ai: tabChip(localReady ? '✓' : '○', localReady, `AI local: ${localReady ? 'sẵn sàng' : 'chưa cài đủ model và runtime'}`, 'monitor')
      + tabChip(`${readyCloud}/${cloudProviders.length}`, readyCloud > 0, `${readyCloud}/${cloudProviders.length} nhà cung cấp cloud đã có khoá và sẵn sàng`, 'cloud'),""",
 """    // #372: tab "Nhà cung cấp AI" KHÔNG còn chip riêng. Hai chip nhỏ "○" và "0/4" ở đây nói lại
    // đúng hai chip đầy đủ nằm trong header của chính panel (cách nhau ~40 px), và "0/4" là một
    // con số không có nhãn — người soát ảnh gọi nó là "unexplained". Trạng thái vẫn còn nguyên
    // trong panel, bằng chữ.
    ai: '',"""),
# 3. Thẻ model local: RAM đã được nói ở "Đánh giá máy" + dòng số liệu; bỏ dòng thứ ba.
("""                  <span class="${selectedLocalModel.memoryStatus==='insufficient' ? 'text-[#dc2626]' : selectedLocalModel.memoryStatus==='below-recommended' ? 'text-[#9c4808]' : 'text-[#0f7b5c]'}">${selectedLocalModel.memoryStatus==='insufficient'?'<span data-icon="triangle-alert" data-icon-size="11"></span> RAM thấp hơn mức tối thiểu; model có thể không chạy ổn định.':selectedLocalModel.memoryStatus==='below-recommended'?'<span data-icon="triangle-alert" data-icon-size="11"></span> RAM thấp hơn mức khuyến nghị.':'✓ RAM đạt mức khuyến nghị.'}</span>""",
 """                  ${selectedLocalModel.memoryStatus==='insufficient'
                    ? '<span class="text-[#dc2626]" data-local-ram-warning><span data-icon="triangle-alert" data-icon-size="11"></span> RAM thấp hơn mức tối thiểu; model có thể không chạy ổn định.</span>'
                    : ''}"""),
])
