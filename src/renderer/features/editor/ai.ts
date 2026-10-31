// @ts-nocheck -- editor/ai.ts — nút "Tạo lại câu này" cho từng mục khi mở từ wizard (P7), gọi lesson:regenerate-item rồi ghép lại đúng mục trả về (split từ features/game-editor.ts, DECISIONS #150).
/* P7 follow-up (2026-10-20): per-item AI regeneration inside the editor, but only
   for games opened from the wizard. The editor edits the EducationalGame snapshot;
   the model call still goes through lesson:regenerate-item on the stored project
   (typed draft + analysis + config), and only the returned item is merged back.
   Manual games and games reopened from the library have no project context and
   therefore no AI button (DECISIONS #15). */
let editorAiContext = null;
let editorAiBusy = false;
let editorAiRequestId = '';

const EDITOR_AI_TEMPLATES = { arena: 'quiz', scenario: 'scenario', matching: 'matching', treasure: 'treasure-hunt', race: 'race' };
const EDITOR_AI_KINDS = { arena: 'câu hỏi', scenario: 'tình huống', matching: 'cặp ghép', treasure: 'chặng', race: 'câu hỏi' };

function editorAiSupported(gameType) {
  return Object.prototype.hasOwnProperty.call(EDITOR_AI_TEMPLATES, String(gameType || ''));
}

function editorAiExpectedTemplate(gameType) {
  return EDITOR_AI_TEMPLATES[gameType] || '';
}

function editorAiKind(gameType) {
  return EDITOR_AI_KINDS[gameType] || 'mục';
}

function editorAiContainer(root, gameType) {
  const selector = {
    arena: '#editorQuestions', scenario: '#editorQuestions', matching: '#matchingPairs',
    treasure: '#treasureStages', race: '#raceQuestions'
  }[gameType];
  return selector ? $(selector, root) : null;
}

function editorAiItemSelector(gameType) {
  return {
    arena: '.editor-question', scenario: '.editor-question', matching: '.matching-pair-row',
    treasure: '.treasure-stage-card', race: '.race-question-card'
  }[gameType] || '';
}

function editorAiResultItem(game, gameType, position) {
  if (!game || !position) return null;
  if (gameType === 'arena' || gameType === 'scenario') return (game.questions || [])[position - 1] || null;
  if (gameType === 'matching') return ((game.matchingGame || {}).pairs || [])[position - 1] || null;
  if (gameType === 'treasure') return ((game.treasureHunt || {}).stages || [])[position - 1] || null;
  if (gameType === 'race') return ((game.race || {}).questions || [])[position - 1] || null;
  return null;
}

function editorAiRenderItem(item, index, root, gameType) {
  if (gameType === 'arena' || gameType === 'scenario') return questionEditor(item, index, currentEditorQuestions(root));
  if (gameType === 'matching') return matchingPairRow(item, index);
  if (gameType === 'treasure') return treasureStageHtml(item, index);
  if (gameType === 'race') return raceQuestionCard(item, index);
  return '';
}

function editorAiRefresh(root, gameType) {
  if (gameType === 'arena' || gameType === 'scenario') {
    renumberQuestions(root);
    refreshScenarioBranches(root);
    return;
  }
  if (gameType === 'matching') {
    const count = $('#matchingPairCount', root);
    if (count) count.textContent = String($$('#matchingPairs .matching-pair-row', root).length);
    return;
  }
  if (gameType === 'treasure') {
    refreshTreasureUi(root);
    return;
  }
  if (gameType === 'race') renumberRaceQuestions(root);
}

function editorAiButton(itemId, hidden = false) {
  if (!editorAiContext) return '';
  const position = editorAiContext.itemIds.indexOf(String(itemId || ''));
  if (position < 0) return '';
  return `<button class="text-link ${hidden ? 'hidden' : ''}" data-ai-regenerate="${position + 1}" title="AI viết lại riêng mục này từ giáo án; các mục khác và chỉnh sửa chưa lưu vẫn giữ nguyên.">🔄 Tạo lại</button>`;
}

function editorAiErrorText(error) {
  const raw = String((error && error.message) || '');
  const match = raw.match(/\[([A-Z0-9_]+)\]/);
  const code = match ? match[1] : '';
  const messages = {
    AI_NOT_RUNNING: 'AI local chưa chạy. Hãy mở cửa sổ AI local, chọn model đã tải xong rồi bấm “Bắt đầu chạy”.',
    AI_BUSY: 'AI local đang xử lý một yêu cầu khác. Hãy đợi yêu cầu hiện tại hoàn tất hoặc huỷ nó trước khi thử lại.',
    AI_CONFIG: 'Chưa cấu hình AI local đúng cách. Hãy kiểm tra trong Cài đặt.',
    AI_CONNECTION: 'Không kết nối được tới AI local. Hãy kiểm tra cửa sổ AI local còn mở không rồi thử lại.',
    AI_TIMEOUT: 'AI local phản hồi quá lâu. Hãy thử lại với giáo án ngắn hơn hoặc model nhỏ hơn.',
    AI_CANCELLED: 'Đã huỷ yêu cầu AI.',
    AI_HTTP: 'AI local báo lỗi khi xử lý. Hãy thử lại.',
  // #132: a cloud provider's own HTTP failure; keep it apart from AI_HTTP so the
  // message never blames the local model.
  AI_PROVIDER_HTTP: 'Nhà cung cấp AI trả lỗi khi xử lý. Hãy thử lại sau, hoặc kiểm tra model và endpoint trong Cài đặt AI.',
    AI_EMPTY: 'AI local không trả về nội dung. Hãy thử lại.',
    AI_TRUNCATED: 'Câu trả lời bị cắt do giới hạn độ dài. Hãy thử lại.',
    AI_INVALID_JSON: 'AI local trả về dữ liệu không đọc được. Hãy thử lại.',
    AI_OUTPUT_INVALID: 'Nội dung AI trả về chưa đúng cấu trúc. Hãy thử lại hoặc sửa thủ công.',
    GENERATION_INVALID: 'Nội dung AI trả về chưa hợp lệ. Hãy thử lại hoặc sửa thủ công.',
    ITEM_INDEX_INVALID: 'Mục cần tạo lại không còn khớp với bản nháp. Hãy tạo lại trong wizard.'
  };
  return messages[code] || raw.replace(/^\[[^\]]+\]\s*/, '') || 'Không tạo lại được mục này.';
}

function editorSetBusyUi(root, activeButton, busy) {
  $$('[data-ai-regenerate]', root).forEach(btn => {
    if (!busy) {
      btn.disabled = false;
      btn.removeAttribute('data-ai-cancel');
      btn.textContent = '🔄 Tạo lại';
      return;
    }
    if (btn === activeButton) {
      btn.disabled = false;
      btn.dataset.aiCancel = '1';
      btn.textContent = '✕ Huỷ';
    } else {
      btn.disabled = true;
    }
  });
  const save = $('#saveGameBtn', root);
  const saveExport = $('#saveExportBtn', root);
  if (save) save.disabled = busy;
  if (saveExport) saveExport.disabled = busy;
}

function editorCancelPending() {
  if (!editorAiRequestId) return;
  const id = editorAiRequestId;
  editorAiRequestId = '';
  editorAiBusy = false;
  window.eduGame.cancelAi(id).catch(() => {});
}

async function editorCancelAi() {
  if (!editorAiRequestId) return;
  toast('Đang huỷ yêu cầu AI…');
  try {
    await window.eduGame.cancelAi(editorAiRequestId);
  } catch (error) {
    /* the pending call reports the typed cancellation */
  }
}

async function editorRegenerateItem(button) {
  if (editorAiBusy || !editorAiContext) return;
  const context = editorAiContext;
  const root = editorPageRoot();
  const position = Number(button.dataset.aiRegenerate);
  const template = $('#editTemplate', root)?.value || '';
  const expected = editorAiExpectedTemplate(context.gameType);
  if (template !== expected) {
    toast('Không thể tạo lại bằng AI sau khi đổi thể loại. Hãy quay lại wizard để tạo lại toàn bộ nội dung.');
    return;
  }
  if (!Number.isInteger(position) || position < 1 || position > context.itemIds.length) {
    toast('Mục này không còn khớp với bản nháp đã lưu. Hãy tạo lại trong wizard.');
    return;
  }
  const kind = editorAiKind(context.gameType);
  if (!window.confirm(`Tạo lại ${kind} ${position} bằng AI? Nội dung hiện tại của mục này trong trình chỉnh sửa sẽ được thay bằng bản AI viết lại từ giáo án (dựa trên bản nháp đã lưu). Các mục khác giữ nguyên.`)) {
    return;
  }
  const selector = editorAiItemSelector(context.gameType);
  const container = editorAiContainer(root, context.gameType);
  const qEl = selector ? button.closest(selector) : null;
  if (!qEl || !container) return;
  if (context.gameType === 'treasure') {
    const mission = qEl.querySelector('[data-stage-mission]')?.value || 'multiple-choice';
    if (mission !== 'multiple-choice' && mission !== 'scenario') {
      toast('AI chỉ tạo lại chặng trắc nghiệm hoặc xử lý tình huống. Hãy đổi kiểu nhiệm vụ hoặc sửa thủ công.');
      return;
    }
  }
  const requestId = `editor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  editorAiBusy = true;
  editorAiRequestId = requestId;
  editorSetBusyUi(root, button, true);
  toast(`Đang nhờ AI viết lại ${kind} ${position}. Có thể mất 1–2 phút; bấm “Huỷ” trên nút để dừng.`);
  try {
    const result = await window.eduGame.regenerateLessonItem({
      projectId: context.projectId,
      requestId,
      itemIndex: position
    });
    if (editorAiContext !== context) return;
    const regenerated = editorAiResultItem(result && result.game, context.gameType, position);
    if (!regenerated) throw new Error('AI không trả về nội dung cho mục này.');
    // Keep the wizard (mounted behind the modal) in sync with the project the
    // regeneration just saved, so closing without saving and reopening the
    // editor does not show the pre-regeneration snapshot.
    if (typeof wizardState !== 'undefined' && wizardState && wizardState.projectId === context.projectId) {
      wizardState.draft = (result.project && result.project.draft) || wizardState.draft;
      wizardState.gameSnapshot = result.game || wizardState.gameSnapshot;
      wizardState.quality = result.quality || wizardState.quality;
      wizardState.context = result.context || wizardState.context;
      wizardState.gameId = result.game && result.game.id ? result.game.id : wizardState.gameId;
    }
    const cards = $$(selector, container);
    const index = cards.indexOf(qEl);
    if (index < 0) {
      toast(`Đã tạo lại ${kind} ${position} trong dự án, nhưng mục này đã bị xoá khỏi trình chỉnh sửa.`);
      return;
    }
    const replacement = editorAiRenderItem(regenerated, index, root, context.gameType);
    if (!replacement) throw new Error('Không dựng được nội dung mới cho mục này.');
    qEl.insertAdjacentHTML('afterend', replacement);
    qEl.remove();
    editorAiRefresh(root, context.gameType);
    const quality = result.quality || null;
    const advisory = quality && (quality.errors || quality.warnings)
      ? ` Còn ${quality.errors || 0} lỗi, ${quality.warnings || 0} cảnh báo chất lượng (tư vấn, không chặn lưu).`
      : '';
    toast(`Đã tạo lại ${kind} ${position}. Các mục khác giữ nguyên.${advisory}`);
  } catch (error) {
    if (editorAiContext !== context) return;
    const message = String((error && error.message) || '');
    if (message.includes('AI_CANCELLED')) toast(`Đã huỷ tạo lại ${kind}. Mục hiện tại được giữ nguyên.`);
    else toast(editorAiErrorText(error));
  } finally {
    if (editorAiContext === context) {
      editorAiBusy = false;
      editorAiRequestId = '';
      editorSetBusyUi(root, button, false);
    }
  }
}
