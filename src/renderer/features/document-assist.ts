// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
async function selectDocumentAssistMode(mode) {
  const payload = collectDraft();
  if (!payload.text.trim()) return toast('Hãy nạp tài liệu hoặc dán nội dung trước.');
  state.draft = { ...payload, mode, assistMode: mode };
  state.settings.ai = { ...state.settings.ai, mode };
  render();

  if (mode === 'local') {
    const selectedModelId = payload.localModelId || state.settings.ai?.localModelId || state.localAiMachine?.recommendedModelId;
    const selectedModel = state.localAiModels.find(model => model.id === selectedModelId);
    if (!selectedModel?.installed || !state.localAiMachine?.runtimeInstalled) {
      state.pendingDocumentSummary = true;
      return toast('Hãy tải model và llama.cpp trong bảng AI local. Sau khi cài xong, ứng dụng sẽ tự tổng hợp tài liệu.', 5000);
    }
  } else if (mode === 'online' && !state.settings.ai?.apiKey) {
    return toast('Hãy chọn ChatGPT hoặc Gemini và lưu API key trong Cài đặt trước khi tổng hợp.', 5000);
  }
  return assistWithDocument('summarize', mode);
}

async function assistWithDocument(operation, requestedMode) {
  let payload = collectDraft();
  if (!payload.text.trim()) return toast('Hãy nạp tài liệu hoặc dán nội dung trước.');
  if (requestedMode) payload = { ...payload, mode: requestedMode, assistMode: requestedMode };
  if (payload.mode === 'offline') {
    return toast('Hãy chọn AI trên máy hoặc AI đám mây để phân tích tài liệu.');
  }
  const question = $('#documentQuestion')?.value.trim() || '';
  if (operation === 'ask' && !payload.analysis) return toast('Hãy tổng hợp tài liệu trước khi bắt đầu trò chuyện với AI.');
  if (operation === 'ask' && !question) return toast('Hãy nhập câu hỏi về tài liệu.');

  const button = operation === 'ask'
    ? $('#askDocumentBtn')
    : payload.mode === 'local' ? $('#analyzeLocalDocumentBtn') : $('#analyzeCloudDocumentBtn');
  const originalText = button.textContent;
  const requestId = state.documentAssistRequestId = (state.documentAssistRequestId || 0) + 1;
  const pendingChatNodes = [];
  const localRequest = payload.mode === 'local';
  const startedAt = Date.now();
  button.disabled = true;
  button.textContent = localRequest
    ? operation === 'ask' ? 'AI local đang tìm trong tài liệu…' : 'AI local đang phân tích…'
    : operation === 'ask' ? 'Đang tìm trong tài liệu…' : 'Đang phân tích tài liệu…';
  if ($('#sourceText')) $('#sourceText').disabled = true;
  if ($('#documentQuestion')) $('#documentQuestion').disabled = true;
  let pendingContent;
  if (operation === 'ask') {
    const messages = $('#documentChatMessages');
    const userMessage = document.createElement('article');
    userMessage.className = 'chat-message user';
    const userAvatar = document.createElement('div');
    userAvatar.className = 'chat-message-avatar';
    userAvatar.textContent = 'GV';
    const userContent = document.createElement('div');
    userContent.className = 'chat-message-content';
    userContent.textContent = question;
    userMessage.append(userAvatar, userContent);
    const pendingMessage = document.createElement('article');
    pendingMessage.className = 'chat-message assistant chat-pending';
    const assistantAvatar = document.createElement('div');
    assistantAvatar.className = 'chat-message-avatar';
    assistantAvatar.textContent = '✦';
    pendingContent = document.createElement('div');
    pendingContent.className = 'chat-message-content';
    pendingContent.textContent = localRequest
      ? 'AI local đang chạy trên CPU; tài liệu dài có thể mất vài phút.'
      : 'Đang đọc tài liệu và chuẩn bị câu trả lời…';
    pendingMessage.append(assistantAvatar, pendingContent);
    pendingChatNodes.push(userMessage, pendingMessage);
    messages?.append(userMessage, pendingMessage);
    if (messages) messages.scrollTop = messages.scrollHeight;
  }
  const progressInterval = setInterval(() => {
    if (!localRequest || requestId !== state.documentAssistRequestId) return;
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    button.textContent = `AI local đang xử lý (${elapsedSeconds}s)…`;
    if (pendingContent?.isConnected) {
      pendingContent.textContent = `AI local đang chạy trên CPU (${elapsedSeconds}s); tài liệu dài có thể mất vài phút.`;
    }
  }, 15_000);
  try {
    const result = await window.eduGame.assistWithDocument({
      operation,
      text: payload.text,
      question,
      analysis: payload.analysis,
      previousQuestions: [
        ...(payload.analysis?.suggestedQuestions || []),
        ...(payload.qaEntries || []).flatMap(entry => entry.answer?.suggestedQuestions || [])
      ],
      sourceName: payload.sourceName,
      subject: payload.subject,
      grade: payload.grade,
      mode: payload.mode,
      localModelId: payload.localModelId,
      baseUrl: payload.mode === 'online' ? state.settings.ai?.baseUrl : undefined,
      model: payload.mode === 'online' ? state.settings.ai?.model : undefined,
      apiKey: payload.mode === 'online' ? state.settings.ai?.apiKey : undefined
    });
    if (requestId !== state.documentAssistRequestId) return;
    if (operation === 'summarize') {
      state.draft = { ...payload, analysis: result, qaEntries: [], useSuggestedQuestions: false };
      if (result.recommendedGames?.length) state.selectedTemplate = result.recommendedGames[0].template;
      if (state.page === 'create') render();
      toast(result.sourceExcerpted
        ? 'Đã phân tích trích đoạn đầu/cuối (tối đa 12.000 ký tự) để AI local chạy ổn định. Hãy xem ý chính, câu hỏi và gợi ý trò chơi.'
        : 'Đã phân tích tài liệu. Hãy xem ý chính, câu hỏi và gợi ý trò chơi.');
    } else {
      const analysis = result.suggestedQuestions?.length
        ? { ...payload.analysis, suggestedQuestions: result.suggestedQuestions }
        : payload.analysis;
      state.draft = {
        ...payload,
        analysis,
        qaQuestion: '',
        qaEntries: [...(payload.qaEntries || []), { question, answer: result }].slice(-8)
      };
      if (state.page === 'create') render();
    }
  } catch (error) {
    pendingChatNodes.forEach(node => node.remove());
    if (requestId === state.documentAssistRequestId) toast(error.message || 'Không xử lý được tài liệu.');
  } finally {
    clearInterval(progressInterval);
    if (requestId === state.documentAssistRequestId) {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = originalText;
      }
      if ($('#sourceText')) $('#sourceText').disabled = false;
      if ($('#documentQuestion')) $('#documentQuestion').disabled = false;
    }
  }
}
