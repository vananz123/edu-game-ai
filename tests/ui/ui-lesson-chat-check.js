#!/usr/bin/env node
/**
 * DECISIONS #182 + #183 — the lesson-plans chat, cloud flow, end to end.
 *
 * What this proves, with a real HTTP round trip and no paid key:
 *   Settings form → `custom` provider (loopback endpoint) → connection test →
 *   two synthetic lessons combined in one conversation → an answer with quotes
 *   from BOTH lessons → a question set in the arena format → "Tạo trò chơi" hands
 *   that set to the wizard WITHOUT a second model call → the transcript survives a
 *   reload because it lives in SQLite → and (#183) a question with NO lesson
 *   attached still gets an answer, labelled as a general suggestion and stored with
 *   an empty `document_ids`.
 *
 * #183 also measures the frame: the chat column has to be the wide one, and the
 * lesson list must keep enough room beside it for "bigger" not to mean "the other
 * column lost".
 *
 * The endpoint is `http://127.0.0.1:<port>/v1`, which main accepts for HTTP only
 * because it is loopback ("trong môi trường thử nghiệm"), so the whole cloud path
 * — provider choice, `response_format`, the JSON contract, `normalizeDraft`, the
 * store — runs unchanged. `EDUGAME_AI_TEST_DIR` must stay UNSET: the fixture seam
 * would answer before the transport and this check would measure nothing.
 *
 * The key is synthetic (AGENTS.md). Nothing here runs a local model; the local
 * provider is only proven not to fall back to the cloud endpoint silently (#132 D13).
 *
 * Usage: start the app on a fresh profile (the check deletes what it creates, but a
 * used profile carries other providers and lessons into the measurements), then
 *   rm -rf "$TEMP/qoder-lessonchat" && mkdir -p "$TEMP/qoder-lessonchat"
 *   EDUGAME_USER_DATA=$TEMP/qoder-lessonchat env -u ELECTRON_RUN_AS_NODE \
 *     -u EDUGAME_AI_TEST_DIR npx electron . \
 *     --remote-debugging-port=9347 --disable-backgrounding-occluded-windows \
 *     --disable-renderer-backgrounding --disable-background-timer-throttling
 *   node tests/ui/ui-lesson-chat-check.js 9347
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9347';

const http = require('node:http');
const { connect, check } = require('../manual/lib/ui-check-lib');

const MODEL = 'mock-lesson-chat';
// Synthetic on purpose — never a real provider key (AGENTS.md).
const SYNTH_KEY = 'sk-synthetic-0123456789-lessonchat';

const DOC_A_NAME = 'Giáo án 18A — Quang hợp ở thực vật.txt';
const DOC_B_NAME = 'Giáo án 18B — Hô hấp ở thực vật.txt';
// Synthetic lesson content (no student data, no real school documents).
const DOC_A_TEXT = [
  'Bài 12: Quang hợp ở thực vật.',
  'Mục tiêu: học sinh trình bày được khái niệm quang hợp và vai trò của ánh sáng đối với thực vật.',
  'Quang hợp là quá trình thực vật sử dụng năng lượng ánh sáng để tổng hợp chất hữu cơ từ nước và khí cacbonic.',
  'Diệp lục trong lá hấp thụ ánh sáng, chuyển hóa năng lượng ánh sáng thành năng lượng hóa học.',
  'Ý nghĩa của quang hợp: tạo nguồn thức ăn cho mọi sinh vật và điều hòa không khí.'
].join('\n');
const DOC_B_TEXT = [
  'Bài 13: Hô hấp ở thực vật.',
  'Mục tiêu: học sinh giải thích được quá trình hô hấp và vai trò của ánh sáng với nguyên liệu hô hấp ở thực vật.',
  'Hô hấp là quá trình phân giải chất hữu cơ thành nước và khí cacbonic, đồng thời giải phóng năng lượng.',
  'Ánh sáng không trực tiếp tham gia hô hấp, nhưng cây cần ánh sáng để quang hợp tạo ra chất hữu cơ cho hô hấp.',
  'Nhiệt độ và độ ẩm ảnh hưởng đến cường độ hô hấp ở thực vật.'
].join('\n');

const QUESTION_TEXT = 'Hai giáo án nói gì về vai trò của ánh sáng đối với thực vật?';
const ANSWER_TEXT = 'Cả hai giáo án đều nêu ánh sáng là điều kiện để thực vật quang hợp; giáo án hô hấp nói rõ ánh sáng không trực tiếp tham gia hô hấp mà tạo nguyên liệu cho quá trình đó.';
const SET_QUESTION = 'Hãy soạn bộ câu hỏi về hai bài này để học sinh ôn tập.';
// #183: a turn with no lesson attached must not be answered with lesson words.
const UNGROUNDED_QUESTION = 'Gợi ý cách kiểm tra bài cũ trong 3 phút ở lớp 10?';
const UNGROUNDED_ANSWER_TEXT = 'Gợi ý chung: giáo viên nêu 2 câu hỏi nhanh về bài trước, cho học sinh trả lời theo cặp trong 3 phút rồi chữa chung. Đây là gợi ý từ kiến thức sư phạm chung, không trích từ giáo án nào.';

const QUESTION_TEMPLATES = [
  {
    type: 'multiple-choice',
    prompt: 'Quang hợp ở thực vật xảy ra chủ yếu ở bộ phận nào của cây?',
    options: [{ text: 'Lá' }, { text: 'Rễ' }, { text: 'Hoa' }],
    correctOptionId: 'a',
    explanation: 'Diệp lục trong lá hấp thụ ánh sáng nên lá là bộ phận quang hợp chính.',
    difficulty: 'dễ',
    points: 100
  },
  {
    type: 'multiple-choice',
    prompt: 'Hô hấp ở thực vật giải phóng ra năng lượng dưới dạng nào?',
    options: [{ text: 'Chất hữu cơ' }, { text: 'Năng lượng dễ sử dụng' }, { text: 'Ánh sáng' }],
    correctOptionId: 'b',
    explanation: 'Hô hấp phân giải chất hữu cơ để giải phóng năng lượng cho cây.',
    difficulty: 'trung bình',
    points: 100
  },
  {
    type: 'multiple-choice',
    prompt: 'Khí nào thực vật hấp thụ trong quá trình quang hợp?',
    options: [{ text: 'Oxygen' }, { text: 'Nitơ' }, { text: 'Cacbonic' }],
    correctOptionId: 'c',
    explanation: 'Quang hợp dùng nước và khí cacbonic để tổng hợp chất hữu cơ.',
    difficulty: 'trung bình',
    points: 100
  }
];

// ---------------------------------------------------------------------------
// The mock OpenAI-compatible endpoint
// ---------------------------------------------------------------------------

const mockRequests = [];

function mockContentFor(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages.filter(message => message.role === 'system').map(message => message.content).join(' ');
  const lastUser = String((messages.filter(message => message.role === 'user').pop() || {}).content || '');
  if (/Trả lời đúng một từ/.test(lastUser)) {
    mockRequests.push({ kind: 'probe', model: body.model, authorization: '', userText: lastUser, systemText: '', maxTokens: body.max_tokens });
    return 'OK';
  }
  const isSet = /soạn câu hỏi/.test(system);
  // #183: an ungrounded turn asks a different question of the model, so it gets a
  // different canned answer. Reusing ANSWER_TEXT would let the check pass while the
  // reply still talked about "hai giáo án" that the teacher never attached.
  const ungrounded = /Không có giáo án nào được gắn kèm lượt này|Không có đoạn trích giáo án nào kèm theo/.test(lastUser);
  const requestedCount = Number((/Hãy soạn đúng (\d+) câu hỏi/.exec(lastUser) || [])[1] || 0);
  const questions = [];
  for (let index = 0; index < (isSet ? Math.max(1, requestedCount || 1) : 0); index += 1) {
    questions.push(QUESTION_TEMPLATES[index % QUESTION_TEMPLATES.length]);
  }
  const payload = isSet ? { gameType: 'arena', questions } : { answer: ungrounded ? UNGROUNDED_ANSWER_TEXT : ANSWER_TEXT };
  mockRequests.push({
    kind: isSet ? 'question_set' : 'answer',
    model: body.model,
    responseFormat: (body.response_format || {}).type || '',
    authorization: 'sent',
    userText: lastUser,
    systemText: system,
    maxTokens: body.max_tokens,
    ungrounded,
    requestedCount: isSet ? requestedCount : 0
  });
  return JSON.stringify(payload);
}

function startMockServer() {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const send = (status, object) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(object));
      };
      if (req.method !== 'POST' || !/\/chat\/completions$/.test(req.url || '')) {
        send(404, { error: { message: 'not found' } });
        return;
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        send(400, { error: { message: 'bad json' } });
        return;
      }
      send(200, {
        id: 'chatcmpl-mock-' + mockRequests.length,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: body.model || MODEL,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: mockContentFor(body) } }],
        usage: { prompt_tokens: 400, completion_tokens: 60, total_tokens: 460 }
      });
      // The Authorization header is read here rather than in `mockContentFor` so a
      // missing key is recorded without ever storing the key itself.
      const record = mockRequests[mockRequests.length - 1];
      if (record) record.authorization = /^Bearer .+/.test(String(req.headers.authorization || '')) ? 'sent' : 'missing';
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Scenario pieces (page-side; no backticks inside these template literals)
// ---------------------------------------------------------------------------

/** Canonical guard: a fresh profile opens the setup overlay over the first page. */
const SETUP_GUARD = `(async () => {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline && !document.querySelector('#modalRoot .setup-fullscreen')) {
    await new Promise(r => setTimeout(r, 100));
  }
  const opened = Boolean(document.querySelector('#modalRoot .setup-fullscreen'));
  if (opened && typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await new Promise(r => setTimeout(r, 300));
  return { opened, stillOpen: Boolean(document.querySelector('#modalRoot .setup-fullscreen')) };
})()`;

const CONFIGURE_PROVIDER = `(async () => {
  navigate('settings');
  await new Promise(r => setTimeout(r, 500));
  const base = document.querySelector('[data-ai-provider-baseurl="custom"]');
  const model = document.querySelector('[data-ai-provider-model="custom"]');
  const key = document.querySelector('[data-ai-key-input="custom"]');
  if (!base || !model || !key) return { missing: true };
  base.value = __BASE_URL__;
  model.value = __MODEL__;
  key.value = __KEY__;
  document.querySelector('[data-ai-key-save="custom"]').click();
  await new Promise(r => setTimeout(r, 900));
  document.querySelector('[data-ai-test="custom"]').click();
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const card = document.querySelector('[data-ai-provider="custom"]');
    const status = card ? card.dataset.aiProviderStatus : '';
    if (status === 'ready' || status === 'failing') break;
    await new Promise(r => setTimeout(r, 200));
  }
  const card = document.querySelector('[data-ai-provider="custom"]');
  const ai = (await window.eduGame.getSettings()).ai || {};
  const provider = (ai.providers || []).find(item => item.id === 'custom') || {};
  return {
    missing: false,
    status: card ? card.dataset.aiProviderStatus : '',
    reason: card ? ((card.querySelector('[data-ai-provider-reason]') || {}).textContent || '') : '',
    hasKey: provider.hasKey === true,
    keyMasked: provider.keyMasked || '',
    usable: provider.usable === true,
    storedBaseUrl: provider.baseUrl || '',
    storedModel: provider.model || '',
    plaintextInPayload: JSON.stringify(ai).indexOf(__KEY__) >= 0
  };
})()`;

const SEED_AND_LAYOUT = `(async () => {
  const a = await window.eduGame.saveLessonDocument({ name: __A_NAME__, ext: 'txt', text: __A_TEXT__ });
  const b = await window.eduGame.saveLessonDocument({ name: __B_NAME__, ext: 'txt', text: __B_TEXT__ });
  await refreshLessonLibraryPage();
  navigate('lesson-plans');
  await new Promise(r => setTimeout(r, 600));
  const twoCol = document.querySelector('.lesson-two-col');
  const chatCol = document.querySelector('.lesson-chat-col');
  const listCol = document.querySelector('.lesson-list-col');
  const frame = document.querySelector('.lesson-chat-frame');
  const scroll = document.getElementById('lessonChatScroll');
  const select = document.getElementById('lessonChatProvider');
  const composer = document.getElementById('lessonChatInput');
  const pageText = (document.getElementById('pageContent') || {}).textContent || '';
  const chatRect = chatCol ? chatCol.getBoundingClientRect() : null;
  const listRect = listCol ? listCol.getBoundingClientRect() : null;
  const frameRect = frame ? frame.getBoundingClientRect() : null;
  // Widening the chat takes room away from the list, so the list is measured for real
  // spill instead of being assumed fine: anything whose right edge passes the column.
  const spill = listCol && listRect
    ? [...listCol.querySelectorAll('*')]
      .filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.right > listRect.right + 1;
      })
      .slice(0, 3)
      .map(node => String(node.className || node.tagName))
    : [];
  return {
    docIds: [a.id, b.id],
    spill,
    twoCol: Boolean(twoCol),
    chatFirst: Boolean(twoCol && twoCol.firstElementChild === chatCol),
    chatLeft: chatRect ? Math.round(chatRect.left) : -1,
    chatRight: chatRect ? Math.round(chatRect.right) : -1,
    chatWidth: chatRect ? Math.round(chatRect.width) : -1,
    listLeft: listRect ? Math.round(listRect.left) : -1,
    listWidth: listRect ? Math.round(listRect.width) : -1,
    frameHeight: frameRect ? Math.round(frameRect.height) : -1,
    frameBottom: frameRect ? Math.round(frameRect.bottom) : -1,
    sticky: chatCol ? getComputedStyle(chatCol).position : '',
    scrollOverflow: scroll ? getComputedStyle(scroll).overflowY : '',
    composerFont: composer ? Number(getComputedStyle(composer).fontSize.replace('px', '')) : -1,
    providerOptions: select ? [...select.options].map(option => option.value) : [],
    hasImport: Boolean(document.querySelector('[data-action="lesson-chat-import"]')),
    chips: document.querySelectorAll('.lesson-chat-chip').length,
    beta: /BETA/.test(pageText),
    oldPanel: Boolean(document.getElementById('qaDocSelect')),
    w: window.innerWidth,
    h: window.innerHeight
  };
})()`;

const COMBINE_LESSONS = `(async () => {
  document.querySelector('[data-action="lesson-chat-picker"]').click();
  await new Promise(r => setTimeout(r, 250));
  const rows = [...document.querySelectorAll('[data-lesson-chat-pick]')].map(box => box.dataset.id);
  document.querySelector('[data-action="lesson-chat-pick-all"][data-id="all"]').click();
  await new Promise(r => setTimeout(r, 250));
  const bothChips = document.querySelectorAll('.lesson-chat-chip').length;
  const bothSubtitle = (document.querySelector('[data-lesson-chat-subtitle]') || {}).textContent || '';
  const removed = document.querySelector('[data-action="lesson-chat-remove-doc"]');
  if (removed) removed.click();
  await new Promise(r => setTimeout(r, 250));
  const afterRemove = lessonChatUi.docIds.slice();
  // Re-query every pass: each change dispatches a render() that replaces the popover.
  for (let pass = 0; pass < 6; pass += 1) {
    const box = [...document.querySelectorAll('[data-lesson-chat-pick]')].find(item => !item.checked);
    if (!box) break;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
  }
  document.querySelector('[data-action="lesson-chat-picker-close"]').click();
  await new Promise(r => setTimeout(r, 250));
  return {
    rows,
    bothChips,
    bothSubtitle,
    afterRemove,
    docIds: lessonChatUi.docIds.slice(),
    chips: document.querySelectorAll('.lesson-chat-chip').length,
    popoverGone: !document.querySelector('[data-lesson-chat-picker]')
  };
})()`;

const sendTurn = (mode, question, waitSelector) => `(async () => {
  const modeButton = document.querySelector('[data-action="lesson-chat-mode"][data-id="${mode}"]');
  if (modeButton) modeButton.click();
  await new Promise(r => setTimeout(r, 250));
  const count = document.getElementById('lessonChatCount');
  const hadCountField = Boolean(count);
  if (count) {
    count.value = '3';
    count.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
  }
  const input = document.getElementById('lessonChatInput');
  input.value = ${JSON.stringify(question)};
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  const send = document.querySelector('[data-lesson-chat-send]');
  const sendDisabled = send.disabled;
  send.click();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (document.querySelector('${waitSelector}')) break;
    if (document.querySelector('[data-lesson-chat-error="1"]')) break;
    await new Promise(r => setTimeout(r, 200));
  }
  await new Promise(r => setTimeout(r, 400));
  const bubbles = [...document.querySelectorAll('.lesson-chat-bubble')];
  const last = bubbles[bubbles.length - 1] || null;
  const evidence = [...document.querySelectorAll('.lesson-chat-evidence li')];
  const items = [...document.querySelectorAll('.lesson-chat-set-item .lesson-chat-set-q')];
  const game = document.querySelector('[data-lesson-chat-game]');
  return {
    hadCountField,
    sendDisabled,
    working: Boolean(document.querySelector('[data-lesson-chat-working]')),
    error: (document.querySelector('[data-lesson-chat-error="1"]') || {}).textContent || '',
    chatId: lessonChatUi.chatId,
    lastBubble: last ? (last.textContent || '') : '',
    assistantRows: document.querySelectorAll('.lesson-chat-row:not(.is-user)').length,
    evidenceRows: evidence.map(row => (row.textContent || '')),
    setItems: items.map(row => (row.textContent || '').trim()),
    correctMarks: document.querySelectorAll('.lesson-chat-set-opt.is-correct').length,
    gameLabel: game ? (game.textContent || '').trim() : '',
    gameCount: game ? (game.dataset.lessonChatGame || '') : ''
  };
})()`;

const PERSISTENCE = `(async () => {
  const chatId = lessonChatUi.chatId;
  const stored = await window.eduGame.getLessonChat(chatId);
  const chats = (await window.eduGame.listLessonChats()) || [];
  return {
    chatId,
    found: Boolean(stored),
    title: (stored || {}).title || '',
    documentIds: (stored || {}).documentIds || [],
    roles: ((stored || {}).messages || []).map(message => message.role + (message.questionSet ? '+set' : '')),
    citations: ((stored || {}).messages || []).filter(message => message.role === 'assistant').map(message => (message.citations || []).length),
    listed: chats.filter(chat => chat.id === chatId).length,
    providerOfTurn: (((stored || {}).messages || []).filter(message => message.role === 'assistant').pop() || {}).providerId || ''
  };
})()`;

const REOPEN_AFTER_RELOAD = `(async () => {
  navigate('lesson-plans');
  await new Promise(r => setTimeout(r, 600));
  document.querySelector('[data-action="lesson-chat-history"]').click();
  await new Promise(r => setTimeout(r, 400));
  const open = document.querySelector('[data-action="lesson-chat-open"]');
  if (!open) return { historyRows: 0 };
  const title = (open.textContent || '').trim();
  open.click();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !document.querySelector('.lesson-chat-evidence')) {
    await new Promise(r => setTimeout(r, 200));
  }
  const bubbles = [...document.querySelectorAll('.lesson-chat-bubble')];
  return {
    historyRows: document.querySelectorAll('[data-action="lesson-chat-open"]').length || 1,
    title,
    reopened: lessonChatUi.chatId,
    docChips: document.querySelectorAll('.lesson-chat-chip').length,
    bubbleText: bubbles.length ? (bubbles[bubbles.length - 1].textContent || '') : '',
    evidenceRows: [...document.querySelectorAll('.lesson-chat-evidence li')].map(row => row.textContent || ''),
    restoredSet: Boolean(document.querySelector('[data-lesson-chat-set]'))
  };
})()`;

const HANDOFF = `(async () => {
  const game = document.querySelector('[data-lesson-chat-game]');
  if (!game) return { clicked: false };
  game.click();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !document.querySelector('[data-wizard-bank-finish="1"]')) {
    if (document.getElementById('wizardError')) break;
    await new Promise(r => setTimeout(r, 200));
  }
  const panel = document.querySelector('[data-wizard-bank-finish="1"]');
  const project = wizardState.projectId ? await window.eduGame.getProject(wizardState.projectId) : null;
  return {
    clicked: true,
    page: state.page,
    step: wizardState.step,
    finish: Boolean(panel),
    runSource: panel ? (panel.dataset.wizardRunSource || '') : '',
    tag: panel ? ((panel.querySelector('.tag') || {}).textContent || '').trim() : '',
    sub: panel ? ((panel.querySelector('.panel-sub') || {}).textContent || '') : '',
    cards: document.querySelectorAll('[data-wizard-item-card]').length,
    draftSource: wizardState.draftSource,
    documentName: wizardState.documentName,
    projectId: wizardState.projectId,
    error: (document.getElementById('wizardError') || {}).textContent || '',
    projectSource: project ? (project.draftSource || '') : '',
    projectQuestions: project && project.draft && project.draft.questions ? project.draft.questions.length : 0
  };
})()`;

const SAVE_TO_LIBRARY = `(async () => {
  const button = document.querySelector('[data-wizard-action="save-game"]');
  if (!button) return { found: false };
  button.click();
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline && wizardState.busy) await new Promise(r => setTimeout(r, 200));
  const game = wizardState.gameSnapshot;
  const library = await window.eduGame.getLibrary();
  const row = ((library || {}).games || []).find(item => item.id === (game || {}).id) || null;
  return {
    found: true,
    gameId: game ? game.id : '',
    gameQuestions: game && game.questions ? game.questions.length : 0,
    inLibrary: Boolean(row),
    libraryTitle: row ? (row.title || '') : '',
    notice: (document.getElementById('wizardNotice') || {}).textContent || ''
  };
})()`;

const LOCAL_PICK = `(async () => {
  navigate('lesson-plans');
  await new Promise(r => setTimeout(r, 500));
  const select = document.getElementById('lessonChatProvider');
  if (!select) return { hasSelect: false };
  const options = [...select.options].map(option => option.value);
  select.value = 'local';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  const subtitle = (document.querySelector('[data-lesson-chat-subtitle]') || {}).textContent || '';
  const input = document.getElementById('lessonChatInput');
  input.value = 'Nhà cung cấp local trả lời thế nào?';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  document.querySelector('[data-lesson-chat-send]').click();
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (document.querySelector('[data-lesson-chat-error="1"]')) break;
    if (document.querySelectorAll('.lesson-chat-row:not(.is-user)').length >= 3) break;
    await new Promise(r => setTimeout(r, 250));
  }
  await new Promise(r => setTimeout(r, 400));
  const bubble = document.querySelector('[data-lesson-chat-error="1"]');
  return {
    hasSelect: true,
    options,
    subtitle,
    picked: lessonChatUi.providerId,
    error: bubble ? (bubble.textContent || '') : '',
    answered: !bubble && document.querySelectorAll('.lesson-chat-row:not(.is-user)').length >= 3
  };
})()`;

const UNGROUNDED_TURN = `(async () => {
  navigate('lesson-plans');
  await new Promise(r => setTimeout(r, 600));
  const provider = document.getElementById('lessonChatProvider');
  provider.value = 'custom';
  provider.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 250));
  document.querySelector('[data-action="lesson-chat-mode"][data-id="answer"]').click();
  await new Promise(r => setTimeout(r, 200));
  document.querySelector('[data-action="lesson-chat-new"]').click();
  await new Promise(r => setTimeout(r, 250));
  // Detach every lesson through the real picker, the way a teacher would.
  document.querySelector('[data-action="lesson-chat-picker"]').click();
  await new Promise(r => setTimeout(r, 250));
  document.querySelector('[data-action="lesson-chat-pick-all"][data-id="none"]').click();
  await new Promise(r => setTimeout(r, 250));
  document.querySelector('[data-action="lesson-chat-picker-close"]').click();
  await new Promise(r => setTimeout(r, 250));
  const chips = document.querySelectorAll('.lesson-chat-chip').length;
  const subtitle = (document.querySelector('[data-lesson-chat-subtitle]') || {}).textContent || '';
  const sourcesNote = (document.querySelector('.lesson-chat-empty-sources') || {}).textContent || '';
  const hint = (document.querySelector('[data-lesson-chat-hint]') || {}).textContent || '';
  const emptyState = Boolean(document.querySelector('[data-lesson-chat-empty]'));
  const input = document.getElementById('lessonChatInput');
  input.value = __UNGROUNDED_QUESTION__;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  const send = document.querySelector('[data-lesson-chat-send]');
  const sendDisabled = send.disabled;
  send.click();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (document.querySelector('[data-lesson-chat-error="1"]')) break;
    const settled = !document.querySelector('[data-lesson-chat-working]')
      && document.querySelectorAll('.lesson-chat-row:not(.is-user)').length >= 1;
    if (settled) break;
    await new Promise(r => setTimeout(r, 200));
  }
  await new Promise(r => setTimeout(r, 400));
  const bubbles = [...document.querySelectorAll('.lesson-chat-bubble')];
  const last = bubbles[bubbles.length - 1] || null;
  const chatId = lessonChatUi.chatId;
  const stored = await window.eduGame.getLessonChat(chatId);
  return {
    chips, subtitle, sourcesNote, hint, emptyState, sendDisabled, chatId,
    error: (document.querySelector('[data-lesson-chat-error="1"]') || {}).textContent || '',
    lastBubble: last ? (last.textContent || '') : '',
    evidenceBlocks: document.querySelectorAll('.lesson-chat-evidence').length,
    storedDocumentIds: (stored || {}).documentIds || [],
    storedCitations: ((stored || {}).messages || []).filter(m => m.role === 'assistant').map(m => (m.citations || []).length)
  };
})()`;

const CLEANUP = `(async () => {
  const removed = { chats: 0, documents: 0, games: 0, projects: 0 };
  const chatIds = __CHAT_IDS__.filter(Boolean);
  if (chatIds.length) {
    const result = await window.eduGame.deleteLessonChats(chatIds);
    removed.chats = Number(result && result.deleted) || 0;
  }
  if (wizardState.gameId) { await window.eduGame.deleteGame(wizardState.gameId); removed.games = 1; }
  if (wizardState.projectId) { await window.eduGame.deleteProject(wizardState.projectId); removed.projects = 1; }
  const ids = __DOC_IDS__;
  if (ids.length) { await window.eduGame.deleteLessonDocuments(ids); removed.documents = ids.length; }
  navigate('settings');
  await new Promise(r => setTimeout(r, 500));
  const base = document.querySelector('[data-ai-provider-baseurl="custom"]');
  const model = document.querySelector('[data-ai-provider-model="custom"]');
  const clear = document.querySelector('[data-ai-key-clear="custom"]');
  if (base) base.value = '';
  if (model) model.value = '';
  if (clear && !clear.disabled) clear.click();
  await new Promise(r => setTimeout(r, 200));
  document.querySelector('#saveSettingsBtn').click();
  await new Promise(r => setTimeout(r, 1200));
  const ai = (await window.eduGame.getSettings()).ai || {};
  const provider = (ai.providers || []).find(item => item.id === 'custom') || {};
  navigate('home');
  return {
    removed,
    statusAfter: provider.status,
    hasKeyAfter: provider.hasKey === true,
    baseUrlAfter: provider.baseUrl || ''
  };
})()`;

function fill(script, values) {
  return script.replace(/__([A-Z_]+)__/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      throw new Error(`missing value for placeholder ${match}`);
    }
    return values[name];
  });
}

(async () => {
  const { server, port: mockPort } = await startMockServer();
  const baseUrl = 'http://127.0.0.1:' + mockPort + '/v1';
  let cdp = null;
  let cleanupRan = false;
  const values = {
    BASE_URL: JSON.stringify(baseUrl),
    MODEL: JSON.stringify(MODEL),
    KEY: JSON.stringify(SYNTH_KEY),
    A_NAME: JSON.stringify(DOC_A_NAME),
    B_NAME: JSON.stringify(DOC_B_NAME),
    A_TEXT: JSON.stringify(DOC_A_TEXT),
    B_TEXT: JSON.stringify(DOC_B_TEXT)
  };

  try {
    cdp = await connect();
    // The chat is measured at a known window size, and the number is carried in every
    // geometry snapshot — a layout assert that cannot say what it measured is not a check.
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(1200);

    const guard = await cdp.evaluate(SETUP_GUARD);
    check('the setup onboarding does not cover the page', guard.opened === false || guard.stillOpen === false, JSON.stringify(guard));

    // 1. The cloud provider, configured through the real Settings form.
    const provider = await cdp.evaluate(fill(CONFIGURE_PROVIDER, values));
    check('the custom provider form exists', provider.missing === false, JSON.stringify(provider).slice(0, 80));
    check('a loopback endpoint passed the real connection test', provider.status === 'ready' && provider.usable === true, `${provider.status}/${provider.usable} ${provider.reason}`);
    check('the synthetic key is stored and only masked back', provider.hasKey === true && /••••/.test(provider.keyMasked), provider.keyMasked);
    check('the decrypted key never reaches the renderer', provider.plaintextInPayload === false);
    check('the provider keeps the endpoint and model typed', provider.storedBaseUrl === baseUrl && provider.storedModel === MODEL, `${provider.storedBaseUrl}/${provider.storedModel}`);
    check('the probe hit the mock endpoint', mockRequests.filter(request => request.kind === 'probe').length === 1, JSON.stringify(mockRequests.map(request => request.kind)));
    check('the probe carried the bearer key', mockRequests.every(request => request.authorization === 'sent'));

    // 2. Two lessons, one conversation, two columns.
    const layout = await cdp.evaluate(fill(SEED_AND_LAYOUT, values));
    const docIds = layout.docIds;
    check('two synthetic lessons are stored', docIds.length === 2 && layout.twoCol === true);
    check('the page is two columns with the chat first', layout.chatFirst === true && layout.listLeft > layout.chatRight - 1, `chat ${layout.chatLeft}-${layout.chatRight}, list ${layout.listLeft} (w=${layout.w})`);
    // #183: the frame is the wider column now (clamp floor 520px, ceiling 640px), so
    // the band is where the clamp lands at this window size — and the list keeps a
    // floor of its own, which is the other half of "bigger" (it must not be the price).
    check('the chat column is a wide, sticky column', layout.sticky === 'sticky' && layout.chatWidth >= 500 && layout.chatWidth <= 660, `${layout.sticky} ${layout.chatWidth}px`);
    check('the lesson list still has room beside it', layout.listWidth >= 400, `list ${layout.listWidth}px at w=${layout.w}`);
    check('widening the chat spills nothing out of the list', layout.spill.length === 0, layout.spill.join(' | ') || 'clean');
    check('the chat frame fits the visible height', layout.frameHeight >= 560 && layout.frameBottom <= layout.h + 2, `h=${layout.frameHeight} bottom=${layout.frameBottom} viewport=${layout.h}`);
    check('the composer types at a readable size', layout.composerFont >= 13, `${layout.composerFont}px`);
    check('the transcript scrolls inside the frame', layout.scrollOverflow === 'auto', layout.scrollOverflow);
    check('the BETA panel is gone, not renamed', layout.beta === false && layout.oldPanel === false);
    check('the chat offers both providers to choose from', layout.providerOptions.includes('local') && layout.providerOptions.includes('custom'), layout.providerOptions.join(','));
    check('the chat offers uploading a new lesson', layout.hasImport === true);
    check('the first lesson attaches automatically', layout.chips >= 1, String(layout.chips));

    // 3. Combining lessons.
    const combine = await cdp.evaluate(COMBINE_LESSONS);
    check('the picker lists both stored lessons', combine.rows.length === 2, combine.rows.join(','));
    check('two lessons can be attached at once', combine.bothChips === 2 && /Hỏi 2 giáo án/.test(combine.bothSubtitle), `${combine.bothChips} · ${combine.bothSubtitle}`);
    check('a lesson can be dropped again', combine.afterRemove.length === 1);
    check('a checkbox re-attaches the lesson', combine.docIds.length === 2 && combine.chips === 2 && combine.popoverGone === true, JSON.stringify(combine).slice(0, 120));

    // 4. An answer built from BOTH lessons (real HTTP round trip).
    const answer = await cdp.evaluate(sendTurn('answer', QUESTION_TEXT, '.lesson-chat-evidence'));
    const answerCall = mockRequests.filter(request => request.kind === 'answer').pop() || {};
    check('the answer turn asked the endpoint for JSON', answerCall.responseFormat === 'json_object' && answerCall.model === MODEL, `${answerCall.responseFormat}/${answerCall.model}`);
    check('the cloud budget is the chat answer budget', Number(answerCall.maxTokens) >= 512, String(answerCall.maxTokens));
    const quotedA = String(answerCall.userText || '').includes(`(${DOC_A_NAME})`);
    const quotedB = String(answerCall.userText || '').includes(`(${DOC_B_NAME})`);
    check('one request carries quotes from both lessons', quotedA && quotedB, `A=${quotedA} B=${quotedB}`);
    check('the merged quotes are numbered for the model', /\[1\] \(/.test(String(answerCall.userText || '')) && /\[2\] \(/.test(String(answerCall.userText || '')));
    check('the question travels with the evidence', String(answerCall.userText || '').includes(QUESTION_TEXT));
    check('the answer shows in the chat', answer.error === '' && answer.working === false && answer.lastBubble.includes('ánh sáng'), `${answer.error || answer.lastBubble.slice(0, 60)}`);
    check('the answer names its sources', answer.evidenceRows.length >= 2 && answer.evidenceRows.some(row => row.includes(DOC_A_NAME)) && answer.evidenceRows.some(row => row.includes(DOC_B_NAME)), String(answer.evidenceRows.length));
    check('the composer was enabled by the typed question', answer.sendDisabled === false);

    // 5. A question set in the predefined (arena) format.
    const setTurn = await cdp.evaluate(sendTurn('question_set', SET_QUESTION, '[data-lesson-chat-set]'));
    const setCall = mockRequests.filter(request => request.kind === 'question_set').pop() || {};
    check('question_set mode exposes the count field', setTurn.hadCountField === true);
    check('the composer count reaches the prompt', setCall.requestedCount === 3 && /Hãy soạn đúng 3 câu hỏi/.test(String(setCall.userText || '')), String(setCall.requestedCount));
    check('the set was accepted on the first attempt', mockRequests.filter(request => request.kind === 'question_set').length === 1, JSON.stringify(mockRequests.map(request => request.kind)));
    check('the set renders in the predefined format', setTurn.setItems.length === 3 && setTurn.error === '', `${setTurn.setItems.length} · ${setTurn.error.slice(0, 60)}`);
    check('every item is numbered and has one correct option', setTurn.setItems.every((text, index) => text.startsWith(`${index + 1}. `)) && setTurn.correctMarks === 3, setTurn.setItems.map(text => text.slice(0, 14)).join(' | '));
    check('the set offers the game handoff', /Tạo trò chơi \(3 câu\)/.test(setTurn.gameLabel) && setTurn.gameCount === '3', setTurn.gameLabel);

    // 6. Transcript in SQLite: survives a reload and reopens from history.
    const stored = await cdp.evaluate(PERSISTENCE);
    // Chats created here, so cleanup can delete exactly what the check made.
    const chatIds = [stored.chatId];
    check('the conversation is stored with both lessons', stored.found === true && stored.documentIds.length === 2, JSON.stringify(stored.documentIds));
    check('both turns are stored', stored.roles.length === 4 && stored.roles.includes('assistant+set'), stored.roles.join(','));
    check('the stored turn keeps its provider and quotes', stored.providerOfTurn === 'custom' && stored.citations.every(count => count >= 2), `${stored.providerOfTurn}/${JSON.stringify(stored.citations)}`);
    check('the conversation is listed in history', stored.listed === 1 && Boolean(stored.title), stored.title);

    await cdp.evaluate(`location.reload()`);
    await sleep(2600);
    const guardAgain = await cdp.evaluate(SETUP_GUARD);
    check('the reload did not reopen the setup overlay', guardAgain.opened === false || guardAgain.stillOpen === false, JSON.stringify(guardAgain));
    const reopened = await cdp.evaluate(REOPEN_AFTER_RELOAD);
    check('the history reopens the stored conversation', reopened.docChips === 2 && Boolean(reopened.reopened), `${reopened.docChips} chips / ${reopened.reopened}`);
    check('the restored transcript still shows the quotes', reopened.evidenceRows.length >= 2 && /ánh sáng/.test(reopened.bubbleText), `${reopened.evidenceRows.length}`);
    check('the restored transcript still shows the question set', reopened.restoredSet === true);

    // 7. The handoff: the set becomes a game with no second model call.
    const requestsBeforeAdopt = mockRequests.length;
    const handoff = await cdp.evaluate(HANDOFF);
    check('the chat button opens the wizard at the finish step', handoff.clicked === true && handoff.finish === true && handoff.page === 'create-wizard', `${handoff.page}/${handoff.step}/${handoff.error.slice(0, 50)}`);
    check('the run is labelled by its real origin', handoff.runSource === 'chat-questions' && handoff.draftSource === 'chat-questions' && handoff.tag === 'Bộ câu hỏi từ chat', `${handoff.runSource}/${handoff.tag}`);
    check('the finish screen says the AI wrote the questions', /khung chat/.test(handoff.sub) && /không gọi AI/.test(handoff.sub), handoff.sub.slice(0, 70));
    check('all three questions carry into the game', handoff.cards === 3 && handoff.projectQuestions === 3, `${handoff.cards} cards / ${handoff.projectQuestions} in the project`);
    check('the project keeps the chat provenance', handoff.projectSource === 'chat-questions', handoff.projectSource);
    check('the game title names the lessons', /\+ 1 giáo án/.test(handoff.documentName), handoff.documentName);
    check('handing off calls no model', mockRequests.length === requestsBeforeAdopt, `${requestsBeforeAdopt} -> ${mockRequests.length}`);

    const saved = await cdp.evaluate(SAVE_TO_LIBRARY);
    check('the game saves to the library', saved.found === true && saved.inLibrary === true && saved.gameQuestions === 3, JSON.stringify(saved).slice(0, 120));

    // 8. The local pick must not silently use the cloud endpoint (D13).
    const requestsBeforeLocal = mockRequests.length;
    const local = await cdp.evaluate(LOCAL_PICK);
    check('the composer keeps the local provider', local.hasSelect === true && local.options.includes('local') && local.picked === 'local', local.options.join(','));
    check('the header states which provider will run', /AI local/.test(local.subtitle), local.subtitle.slice(0, 60));
    check('an unavailable local provider never reaches the cloud endpoint', mockRequests.length === requestsBeforeLocal, `${requestsBeforeLocal} -> ${mockRequests.length}`);
    check('the local failure is reported, not swallowed', /AI local/.test(local.error) || local.answered === true, local.error.slice(0, 70) || 'answered');
    // Cùng bóng thoại đó phải là chữ giáo viên đọc được, không phải vỏ IPC của Electron.
    check('the failure bubble hides the IPC wrapper and the error class',
      local.error === '' || (!/Error invoking remote method|AiTransportError|Error:/.test(local.error) && /AI local/.test(local.error)),
      local.error.slice(0, 70));

    // 9. Chatting with no lesson attached (#183) — the request was "có thể chat mà
    // không cần tải hoặc chọn tài liệu", so this has to prove the whole turn, not
    // just that a button stopped being disabled.
    const requestsBeforeFree = mockRequests.length;
    const free = await cdp.evaluate(fill(UNGROUNDED_TURN, { ...values, UNGROUNDED_QUESTION: JSON.stringify(UNGROUNDED_QUESTION) }));
    const freeCall = mockRequests.filter(request => request.kind === 'answer').pop() || {};
    chatIds.push(free.chatId);
    check('dropping every lesson leaves no chip', free.chips === 0 && free.emptyState === true, `${free.chips} chips · empty=${free.emptyState}`);
    check('the header says the turn is not grounded', /Không gắn giáo án/.test(free.subtitle) && /kiến thức chung/.test(free.subtitle), free.subtitle.slice(0, 80));
    check('the composer invites a question with no lesson', /không cần chọn hay tải giáo án/.test(free.hint), free.hint.slice(0, 70));
    check('a question with no lesson can be sent', free.sendDisabled === false && free.error === '', free.error.slice(0, 80) || 'enabled');
    check('the turn really reached the endpoint', mockRequests.length === requestsBeforeFree + 1, `${requestsBeforeFree} -> ${mockRequests.length}`);
    check('the ungrounded prompt drops the quote requirement', /không gắn giáo án nào/.test(String(freeCall.systemText || '')) && !/Chỉ được trả lời dựa trên các đoạn trích dẫn/.test(String(freeCall.systemText || '')), String(freeCall.systemText || '').slice(0, 70));
    check('the ungrounded prompt carries no lesson quotes', freeCall.ungrounded === true && !/\[\d\] \(/.test(String(freeCall.userText || '')), String(freeCall.userText || '').slice(0, 60));
    check('the answer appears in the chat', /gợi ý từ kiến thức sư phạm chung/i.test(free.lastBubble), free.lastBubble.slice(0, 70));
    check('no source strip is faked for a lesson-free turn', free.evidenceBlocks === 0, String(free.evidenceBlocks));
    check('the lesson-free turn is stored with no documents',
      Boolean(free.chatId) && free.storedDocumentIds.length === 0 && free.storedCitations.every(count => count === 0),
      `${JSON.stringify(free.storedDocumentIds)}/${JSON.stringify(free.storedCitations)}`);
    const groundedAgain = await cdp.evaluate(`(async () => ((await window.eduGame.getLessonChat(${JSON.stringify(stored.chatId)})) || {}).documentIds || [])()`);
    check('the earlier grounded conversation kept its two lessons', groundedAgain.length === 2, JSON.stringify(groundedAgain));

    // 10. Leave the profile as it was found.
    const cleanup = await cdp.evaluate(fill(CLEANUP, { ...values, DOC_IDS: JSON.stringify(docIds), CHAT_IDS: JSON.stringify(chatIds.filter(Boolean)) }));
    cleanupRan = true;
    check('the conversations, lessons and game created here are gone',
      cleanup.removed.chats === chatIds.filter(Boolean).length && cleanup.removed.documents === 2 && cleanup.removed.games === 1 && cleanup.removed.projects === 1,
      JSON.stringify(cleanup.removed));
    check('the custom provider is back to not configured', cleanup.hasKeyAfter === false && cleanup.baseUrlAfter === '' && cleanup.statusAfter === 'not-configured', `${cleanup.statusAfter}/${cleanup.baseUrlAfter}`);
  } catch (error) {
    check('the check completed', false, (error && error.message ? error.message : String(error)).slice(0, 200));
    if (!cleanupRan) console.log('SKIP  cleanup did not run — the profile may still hold the synthetic provider key and the mock endpoint.');
  } finally {
    server.close();
    if (cdp && cdp.ws && cdp.ws.readyState === 1) cdp.ws.close();
  }

  const failures = require('../manual/lib/ui-check-lib').results.filter(result => !result.ok).length;
  console.log(`\n${failures ? failures + ' check(s) failed' : 'all checks passed'}  (mock requests: ${mockRequests.map(request => request.kind).join(', ') || 'none'})`);
  process.exitCode = failures ? 1 : 0;
})();
