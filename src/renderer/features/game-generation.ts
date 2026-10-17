// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
async function generateGame() {
  const payload = collectDraft();
  const hasText = payload.text.trim().length >= 40;
  const button = $('#generateBtn'); button.disabled = true; button.textContent = 'Đang tạo bản nháp…';
  try {
    // Chưa có nội dung: chỉ cho phép tạo game trống (thủ công) ở chế độ ngoại tuyến
    if (!hasText) {
      if (payload.mode !== 'offline') {
        return toast('Hãy nạp tài liệu hoặc dán ít nhất 40 ký tự vào Nội dung bài học trước khi dùng AI.');
      }
      createBlankGame();
      toast('Đã mở trò chơi trống. Hãy nhập câu hỏi, phương án và đáp án đúng rồi nhấn Lưu vào thư viện.');
      return;
    }

    if (payload.mode !== 'offline' && !payload.analysis) {
      return toast('Hãy phân tích và xem lại tài liệu trước khi tạo game bằng AI.');
    }
    if (payload.mode !== 'offline' && !payload.analysis?.summary?.trim()) {
      return toast('Bản tổng hợp chưa có nội dung. Hãy tổng hợp lại tài liệu trước khi tạo game.');
    }

    const mode = $('#generationMode').value;
    const settings = { ...state.settings.ai, mode };
    const result = await window.eduGame.generateGame({ ...payload, ...settings, localModelId: payload.localModelId, analysis: payload.analysis, qaEntries: payload.qaEntries, mode });
    if (payload.gameSetup) result.game.gameSetup = payload.gameSetup;
    state.draft = { ...payload, game: result.game };

    toast(result.provider === 'offline-template'
      ? 'Đã tạo bản nháp ngoại tuyến. Hãy kiểm tra kỹ câu hỏi và đáp án trước khi lưu.'
      : `AI (${result.provider}) đã tạo bản nháp. Hãy kiểm tra đáp án và nội dung trước khi lưu.`);

    openEditor(result.game, true, result.warning || (result.provider === 'offline-template' ? 'Bản nháp ngoại tuyến cần giáo viên kiểm tra kỹ trước khi sử dụng.' : 'AI đã tạo bản nháp. Hãy kiểm tra đáp án và nội dung trước khi lưu.'));
  } catch (e) { toast(e.message || 'Không tạo được game.'); }
  finally { if ($('#generateBtn')) { $('#generateBtn').disabled = false; $('#generateBtn').textContent = '✦ Tạo bản nháp trò chơi'; } }
}
