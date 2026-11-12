#!/usr/bin/env node
/**
 * DECISIONS #182 + #183 + #184 — the lesson-plans chat, cloud flow, end to end.
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
 * #184 moves things around inside that frame, so it is measured, not asserted:
 * the head line the user asked to delete is gone (node AND words), the row that
 * decides what a turn reads sits inside the composer, the picker that opens there
 * shrinks the transcript instead of the frame, and the compacted list card expands
 * into — and back out of — a "Xem chi tiết" block that never leaves its column.
 *
 * The endpoint is `http://127.0.0.1:<port>/v1`, which the Rust backend accepts for
 * HTTP only because it is loopback (settings.rs allows http for localhost/127.0.0.1/
 * [::1]), so the whole cloud path — provider choice, `response_format`, the JSON
 * contract, `normalizeDraft`, the store — runs unchanged. Unlike ui-draft-guard, this
 * check uses NO `desktop.stub`: it drives the real Rust cloud transport against the
 * loopback mock, so a stub would answer before the transport and measure nothing.
 *
 * The key is synthetic (AGENTS.md). Nothing here runs a local model; the local
 * provider is only proven not to fall back to the cloud endpoint silently (#132 D13).
 *
 * Usage: build the Tauri release, then start it on an ISOLATED data dir (the check
 * deletes what it creates, but a used profile carries other providers and lessons
 * into the measurements). EDUGAME_TAURI_GATE=1 + EDUGAME_TAURI_DATA_DIR redirect the
 * release binary's data dir (paths.rs) — the Tauri equivalent of EDUGAME_USER_DATA:
 *   npm run build:tauri && cargo tauri build
 *   rm -rf "$TEMP/eg-lessonchat-data" "$TEMP/eg-lessonchat-webview"
 *   EDUGAME_TAURI_GATE=1 EDUGAME_TAURI_DATA_DIR="$TEMP/eg-lessonchat-data" \
 *     powershell -ExecutionPolicy Bypass -File tests/ui/launch-app.ps1 -Port 9361 \
 *     -WebviewProfile "$TEMP/eg-lessonchat-webview"
 *   node tests/ui/ui-lesson-chat-check.js 9361
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9361';

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
// #184: a card only grows a "Xem chi tiết" once it has an analysis, so the card check
// stores one. Synthetic, and it goes with the document (`ON DELETE CASCADE`).
const ANALYSIS_ID = 'ui-lesson-chat-184-analysis';
// #187: the teacher reported that after deleting a conversation the box would not take
// a new question. The check types this sentence right after the delete.
const AFTER_DELETE_QUESTION = 'Sau khi xoá cuộc trò chuyện, câu hỏi này có gửi được không?';
// #187 also proves the box never locks while an answer is being written: a question is
// typed mid-turn and must still be there when the answer lands.
const FLIGHT_QUESTION = 'Khi AI đang viết trả lời thì khung gõ còn dùng được không?';
const QUEUED_TEXT = 'Câu hỏi giáo viên gõ trong lúc chờ câu trả lời trước.';
// #250: typed with real key events, never `input.focus()` — the reported bug was that
// the caret stayed on <body> after a composer button re-rendered the page, and an
// explicit focus() is exactly what hid it.
const TYPED_BEFORE_CONTROLS = 'Quang hop la gi';
const TYPED_MORE = ' them';
const TOO_SHORT_QUESTION = 'hi';
const AGAIN_QUESTION = 'Hỏi lại sau khi kiểm tra ô nhập.';

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

/** A human click at a measured point: mousedown/mouseup, which is where focus moves. */
async function realClick(cdp, point, label) {
  if (!point) throw new Error('no point to click for ' + label);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
  }
  await sleep(400);
}

/** One character at a time, as a keyboard does, so the box must really have the caret. */
async function realType(cdp, text) {
  for (const character of text) await cdp.send('Input.insertText', { text: character });
  await sleep(250);
}

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
  const ai = (await desktop.call('getSettings')).ai || {};
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
  const a = await desktop.call('saveLessonDocument', { name: __A_NAME__, ext: 'txt', text: __A_TEXT__ });
  const b = await desktop.call('saveLessonDocument', { name: __B_NAME__, ext: 'txt', text: __B_TEXT__ });
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
  const composerBox = document.querySelector('.lesson-chat-composer');
  const attach = document.querySelector('[data-lesson-chat-sources]');
  const head = document.querySelector('.lesson-chat-head');
  const pageText = (document.getElementById('pageContent') || {}).textContent || '';
  const chatRect = chatCol ? chatCol.getBoundingClientRect() : null;
  const listRect = listCol ? listCol.getBoundingClientRect() : null;
  const frameRect = frame ? frame.getBoundingClientRect() : null;
  const headRect = head ? head.getBoundingClientRect() : null;
  const composerRect = composerBox ? composerBox.getBoundingClientRect() : null;
  const inputRect = composer ? composer.getBoundingClientRect() : null;
  const scrollRect = scroll ? scroll.getBoundingClientRect() : null;
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
    headHeight: headRect ? Math.round(headRect.height) : -1,
    headText: (head || {}).textContent || '',
    cardCount: document.querySelectorAll('.lesson-list-col [data-lesson-id]').length,
    cardHeight: (() => {
      const card = document.querySelector('.lesson-list-col [data-lesson-id]');
      return card ? Math.round(card.getBoundingClientRect().height) : -1;
    })(),
    composerHeight: composerRect ? Math.round(composerRect.height) : -1,
    inputHeight: inputRect ? Math.round(inputRect.height) : -1,
    scrollHeight: scrollRect ? Math.round(scrollRect.height) : -1,
    sticky: chatCol ? getComputedStyle(chatCol).position : '',
    scrollOverflow: scroll ? getComputedStyle(scroll).overflowY : '',
    composerFont: composer ? Number(getComputedStyle(composer).fontSize.replace('px', '')) : -1,
    providerOptions: select ? [...select.options].map(option => option.value) : [],
    hasImport: Boolean(document.querySelector('[data-action="lesson-chat-import"]')),
    chips: document.querySelectorAll('.lesson-chat-chip').length,
    beta: /BETA/.test(pageText),
    oldPanel: Boolean(document.getElementById('qaDocSelect')),
    // #184 vế 1: the line the user asked to delete ("Hỏi 1 giáo án · bằng API tương
    // thích OpenAI (tự cấu hình)") has two ways to come back — the node itself, or the
    // same words living in a renamed node. Both are measured, so a rename fails too.
    subtitleGone: !document.querySelector('[data-lesson-chat-subtitle]')
      && !document.querySelector('.lesson-chat-title small'),
    subtitleWordsGone: !/Hỏi \d giáo án|tương thích OpenAI/.test((head || {}).textContent || ''),
    // #184 vế 3: one row decides what a turn reads, so it belongs beside the place the
    // question is typed. "contains" is the whole question, measured on the real nodes.
    attachInComposer: Boolean(attach && composerBox && composerBox.contains(attach)),
    // A frame that grew a popover in its footer must keep exactly these three blocks;
    // a fourth one here is where an overflow bug would hide.
    frameKids: frame ? [...frame.children].map(kid => kid.className) : [],
    w: window.innerWidth,
    h: window.innerHeight
  };
})()`;

const COMBINE_LESSONS = `(async () => {
  document.querySelector('[data-action="lesson-chat-picker"]').click();
  await new Promise(r => setTimeout(r, 250));
  // The picker used to be a strip under the title; #184 moved it into the composer,
  // so "does a full list of lessons fit without pushing the frame off screen" is now a
  // question about this popover. Measured while it is really open, at both ends.
  const frame = document.querySelector('.lesson-chat-frame');
  const scroll = document.getElementById('lessonChatScroll');
  const composerBox = document.querySelector('.lesson-chat-composer');
  const pop = document.querySelector('[data-lesson-chat-picker]');
  const frameRect = frame ? frame.getBoundingClientRect() : null;
  const popRect = pop ? pop.getBoundingClientRect() : null;
  const scrollRect = scroll ? scroll.getBoundingClientRect() : null;
  const composerRect = composerBox ? composerBox.getBoundingClientRect() : null;
  // Everything about the popover is flattened here, before the first click below:
  // each change dispatches a render() that replaces it, and a rect read off a node
  // that has left the document is a rect of nothing.
  const popOpen = {
    inComposer: Boolean(pop && composerBox && composerBox.contains(pop)),
    insideFrame: Boolean(popRect && frameRect
      && popRect.left >= frameRect.left - 1
      && popRect.right <= frameRect.right + 1
      && popRect.top >= frameRect.top - 1
      && popRect.bottom <= frameRect.bottom + 1),
    height: popRect ? Math.round(popRect.height) : -1,
    width: popRect ? Math.round(popRect.width) : -1,
    maxHeight: pop ? getComputedStyle(pop).maxHeight : '',
    frameHeight: frameRect ? Math.round(frameRect.height) : -1,
    frameBottom: frameRect ? Math.round(frameRect.bottom) : -1,
    scrollHeight: scrollRect ? Math.round(scrollRect.height) : -1,
    composerHeight: composerRect ? Math.round(composerRect.height) : -1
  };
  const rows = [...document.querySelectorAll('[data-lesson-chat-pick]')].map(box => box.dataset.id);
  document.querySelector('[data-action="lesson-chat-pick-all"][data-id="all"]').click();
  await new Promise(r => setTimeout(r, 250));
  const bothChips = document.querySelectorAll('.lesson-chat-chip').length;
  const chipsInComposer = document.querySelectorAll('.lesson-chat-composer .lesson-chat-attach .lesson-chat-chip').length;
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
    chipsInComposer,
    afterRemove,
    docIds: lessonChatUi.docIds.slice(),
    chips: document.querySelectorAll('.lesson-chat-chip').length,
    popoverGone: !document.querySelector('[data-lesson-chat-picker]'),
    popOpen
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
  // #186: the teacher sees how much of the lesson the model actually read.
  const reads = last ? last.querySelector('[data-lesson-chat-reads]') : null;
  return {
    hadCountField,
    sendDisabled,
    working: Boolean(document.querySelector('[data-lesson-chat-working]')),
    error: (document.querySelector('[data-lesson-chat-error="1"]') || {}).textContent || '',
    chatId: lessonChatUi.chatId,
    lastBubble: last ? (last.textContent || '') : '',
    assistantRows: document.querySelectorAll('.lesson-chat-row:not(.is-user)').length,
    readsText: reads ? (reads.textContent || '').trim() : '',
    readsPercent: reads ? String(reads.dataset.lessonChatReads || '') : '',
    readsTrimmed: reads ? String(reads.dataset.lessonChatTrimmed || '') : '',
    readsIcon: Boolean(reads && reads.querySelector('svg')),
    evidenceRows: evidence.map(row => (row.textContent || '')),
    setItems: items.map(row => (row.textContent || '').trim()),
    correctMarks: document.querySelectorAll('.lesson-chat-set-opt.is-correct').length,
    gameLabel: game ? (game.textContent || '').trim() : '',
    gameCount: game ? (game.dataset.lessonChatGame || '') : ''
  };
})()`;

const PERSISTENCE = `(async () => {
  const chatId = lessonChatUi.chatId;
  const stored = await desktop.call('getLessonChat', chatId);
  const chats = (await desktop.call('listLessonChats')) || [];
  return {
    chatId,
    found: Boolean(stored),
    title: (stored || {}).title || '',
    documentIds: (stored || {}).documentIds || [],
    roles: ((stored || {}).messages || []).map(message => message.role + (message.questionSet ? '+set' : '')),
    citations: ((stored || {}).messages || []).filter(message => message.role === 'assistant').map(message => (message.citations || []).length),
    reads: ((stored || {}).messages || []).filter(message => message.role === 'assistant').map(message => message.evidence || null),
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
    readsLines: [...document.querySelectorAll('[data-lesson-chat-reads]')].map(row => (row.textContent || '').trim()),
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
  const project = wizardState.projectId ? await desktop.call('getProject', wizardState.projectId) : null;
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
  const library = await desktop.call('getLibrary');
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
  // The head line is gone (#184), so "which provider will run this turn" is now said by
  // the select itself — read the option the re-rendered control resolved to, not a label.
  const selectAgain = document.getElementById('lessonChatProvider');
  const providerText = selectAgain && selectAgain.selectedOptions.length
    ? String(selectAgain.selectedOptions[0].textContent || '')
    : '';
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
    providerText,
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
  // With the subtitle gone, the ungrounded warning sits on the button that would fix it:
  // hover text a teacher reaches while pointing at "Chọn giáo án".
  const attach = document.querySelector('[data-lesson-chat-sources]');
  const pickerButton = document.querySelector('[data-action="lesson-chat-picker"]');
  const attachTitle = pickerButton ? String(pickerButton.getAttribute('title') || '') : '';
  const attachInComposer = Boolean(attach && (attach.closest('.lesson-chat-composer') !== null));
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
  const stored = await desktop.call('getLessonChat', chatId);
  // #186: a turn that read no lesson must not print a reading score.
  const readsNode = last ? last.querySelector('[data-lesson-chat-reads]') : null;
  return {
    chips, attachTitle, attachInComposer, hint, emptyState, sendDisabled, chatId,
    error: (document.querySelector('[data-lesson-chat-error="1"]') || {}).textContent || '',
    lastBubble: last ? (last.textContent || '') : '',
    readsText: readsNode ? (readsNode.textContent || '').trim() : '',
    storedReads: ((stored || {}).messages || []).filter(m => m.role === 'assistant').map(m => m.evidence || null),
    evidenceBlocks: document.querySelectorAll('.lesson-chat-evidence').length,
    storedDocumentIds: (stored || {}).documentIds || [],
    storedCitations: ((stored || {}).messages || []).filter(m => m.role === 'assistant').map(m => (m.citations || []).length)
  };
})()`;

// #184 vế 4: "làm gọn thông tin + thêm nút xem chi tiết" ở cột danh sách. A card with
// no analysis has nothing to expand, so one is stored for real first (the same shape
// step-structure saves) — otherwise every assert below would pass on an empty card.
const LESSON_CARD = `(async () => {
  await desktop.call('saveLessonAnalysis', {
    id: __ANALYSIS_ID__, schemaVersion: 1, documentId: __DOC_A__,
    subject: 'Sinh học', grade: 6, topic: 'Quang hợp và hô hấp',
    objectives: [
      { id: 'o1', description: 'Phân biệt quang hợp và hô hấp.' },
      { id: 'o2', description: 'Nêu được nguyên liệu và sản phẩm của quang hợp.' },
      { id: 'o3', description: 'Giải thích vì sao lá cây có màu xanh.' }
    ],
    keyConcepts: [
      { id: 'k1', term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ nhờ ánh sáng.' },
      { id: 'k2', term: 'Hô hấp', explanation: 'Phân giải chất hữu cơ, giải phóng năng lượng.' }
    ],
    uncertainties: [], sourceDocumentIds: [__DOC_A__], createdAt: new Date().toISOString()
  });
  await refreshLessonLibraryPage();
  navigate('lesson-plans');
  await new Promise(r => setTimeout(r, 700));
  // Re-queried on every pass: navigate()/render() replace #pageContent, and a rect read
  // off a node that has left the document is a rect of nothing.
  const cardOf = () => [...document.querySelectorAll('.lesson-list-col [data-lesson-id]')]
    .find(node => node.dataset.lessonId === __DOC_A__);
  const spillOf = () => {
    const col = document.querySelector('.lesson-list-col');
    if (!col) return ['no-list-col'];
    const colRect = col.getBoundingClientRect();
    return [...col.querySelectorAll('*')]
      .filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.right > colRect.right + 1;
      })
      .slice(0, 3)
      .map(node => String(node.className || node.tagName));
  };
  const closed = cardOf();
  const closedRect = closed ? closed.getBoundingClientRect() : null;
  const closedText = closed ? String(closed.innerText || '') : '';
  const summary = closed ? closed.querySelector('details.lesson-card-more > summary') : null;
  if (summary) summary.click();
  await new Promise(r => setTimeout(r, 250));
  const openCard = cardOf();
  const openDetails = openCard ? openCard.querySelector('details.lesson-card-more') : null;
  const openRect = openCard ? openCard.getBoundingClientRect() : null;
  const openText = openCard ? String(openCard.innerText || '') : '';
  const caret = openDetails ? openDetails.querySelector('.lesson-card-more-caret') : null;
  // The rotation is a .12s transition, and an animation tick does not advance while the
  // window is in the background — read plainly, this returns the frozen t=0 identity and
  // looks like a rule that never applied. Killing the transition asks the same question
  // the settled frame would answer: which transform does the open state resolve to.
  const caretRead = caret ? (() => {
    caret.style.transition = 'none';
    const value = getComputedStyle(caret).transform;
    caret.style.transition = '';
    return { value, matchesOpen: caret.matches('.lesson-card-more[open] .lesson-card-more-caret') };
  })() : { value: 'no-caret', matchesOpen: false };
  const summaryStyle = openDetails ? (() => {
    const node = openDetails.querySelector('summary');
    const style = getComputedStyle(node);
    return { display: style.display, listStyle: style.listStyleType };
  })() : { display: '', listStyle: '' };
  const measured = {
    cardId: closed ? __DOC_A__ : '',
    closedHeight: closedRect ? Math.round(closedRect.height) : -1,
    closedWidth: closedRect ? Math.round(closedRect.width) : -1,
    closedSpill: spillOf(),
    // A details element keeps its content out of the flow and out of innerText while it
    // is closed — that is what makes "gọn" measurable instead of eyeballed.
    compactWhenClosed: !/KẾT QUẢ PHÂN TÍCH|Quang hợp và hô hấp/.test(closedText),
    metaLine: /ký tự/.test(closedText) && /mục tiêu · .* khái niệm/.test(closedText),
    hasDetails: Boolean(summary),
    summaryLabel: /Xem chi tiết/.test(closedText)
  };
  // Everything live is snapshotted HERE, before the close click below: reading
  // openDetails.open or a computed transform after that click would measure the
  // closed card and call it the open one.
  const open = {
    isOpen: Boolean(openDetails && openDetails.open),
    openHeight: openRect ? Math.round(openRect.height) : -1,
    openSpill: spillOf(),
    detailTextShown: /KẾT QUẢ PHÂN TÍCH/.test(openText),
    // Three objectives + two concepts, and every older analysis stays reachable.
    detailItems: openCard ? openCard.querySelectorAll('.lesson-card-more li').length : 0,
    reopenButtons: openCard ? openCard.querySelectorAll('.lesson-card-more [data-action="open-lesson"]').length : 0,
    caretFlipped: caretRead.value,
    caretMatchesOpen: caretRead.matchesOpen,
    summaryDisplay: summaryStyle.display,
    summaryListStyle: summaryStyle.listStyle,
    // A hidden app shell reports an empty innerText for everything, which would let every
    // "these words are / are not there" assert pass by accident. Say how much was read.
    closedTextLen: closedText.length,
    openTextLen: openText.length
  };
  if (openDetails) openDetails.querySelector('summary').click();
  await new Promise(r => setTimeout(r, 200));
  return { ...measured, ...open };
})()`;

const CARD_CLOSED_AGAIN = `(async () => {
  const card = [...document.querySelectorAll('.lesson-list-col [data-lesson-id]')]
    .find(node => node.dataset.lessonId === __DOC_A__);
  const details = card ? card.querySelector('details.lesson-card-more') : null;
  const rect = card ? card.getBoundingClientRect() : null;
  const cardText = String((card || {}).innerText || '');
  return {
    found: Boolean(card),
    stillOpen: Boolean(details && details.open),
    height: rect ? Math.round(rect.height) : -1,
    // The summary label stays (it is the way back in); the analysis content goes.
    labelShown: /Xem chi tiết/.test(cardText),
    contentHidden: !/KẾT QUẢ PHÂN TÍCH/.test(cardText),
    textLen: cardText.length,
    spill: (() => {
      const col = document.querySelector('.lesson-list-col');
      const colRect = col.getBoundingClientRect();
      return [...col.querySelectorAll('*')]
        .filter(node => {
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.right > colRect.right + 1;
        })
        .map(node => String(node.className || node.tagName))
        .slice(0, 3);
    })()
  };
})()`;

const DELETE_AND_RETYPE = `(async () => {
  const openId = lessonChatUi.chatId;
  navigate('lesson-plans');
  await new Promise(r => setTimeout(r, 700));
  // render() swallows a throwing page wiring (core/render.ts) and only logs it once
  // per page, so the harness has to look at the log, not at the button alone.
  window.__lastPageWireError = '';
  window.__errs = [];
  const realError = console.error;
  console.error = (...args) => { window.__errs.push(args.map(String).join(' ')); realError(...args); };
  // The caret starts in the box, the way a teacher leaves it before clicking the list.
  document.getElementById('lessonChatInput').focus();
  document.querySelector('[data-action="lesson-chat-history"]').click();
  await new Promise(r => setTimeout(r, 400));
  const rowsBefore = document.querySelectorAll('[data-action="lesson-chat-open"]').length;
  const trash = [...document.querySelectorAll('[data-action="lesson-chat-delete"]')]
    .find(button => button.dataset.id === openId);
  const realConfirm = window.confirm;
  window.confirm = () => true;
  let clickThrew = '';
  try {
    if (trash) trash.click();
    else clickThrew = 'no delete button for the open conversation';
  } catch (error) {
    clickThrew = String((error && error.message) || error);
  }
  await new Promise(r => setTimeout(r, 1200));
  window.confirm = realConfirm;
  console.error = realError;
  const errs = window.__errs.slice(0, 4);
  const stored = openId ? await desktop.call('getLessonChat', openId) : null;
  const input = document.getElementById('lessonChatInput');
  // Where the page itself left the caret, before this check touches anything: the
  // delete redraws the composer and the trash button that held focus is gone with it.
  const caretAfterDelete = document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '';
  const popoverAfterDelete = Boolean(document.querySelector('[data-lesson-chat-history]'));
  let sendDisabled = null;
  // Nothing below focuses the box: the caret has to be back on its own, and the typing
  // the caller does right after this evaluate is the proof (a scripted focus() made the
  // old version of this check pass while a real teacher got a dead box — #250).
  if (input) {
    const send = document.querySelector('[data-lesson-chat-send]');
    sendDisabled = send ? send.disabled === true : null;
  }
  const frame = document.querySelector('[data-lesson-chat-frame]');
  const frameRect = frame ? frame.getBoundingClientRect() : null;
  const inputRect = input ? input.getBoundingClientRect() : null;
  return {
    openId,
    rowsBefore,
    clickThrew,
    errs,
    deletedOnDisk: !stored,
    chatIdAfter: lessonChatUi.chatId,
    chatsLeft: (lessonChatUi.chats || []).map(chat => chat.id),
    pageBroken: /Không hiển thị được trang này/.test((document.getElementById('pageContent') || {}).textContent || ''),
    hasComposer: Boolean(document.querySelector('.lesson-chat-composer')),
    hasInput: Boolean(input),
    inputDisabled: input ? input.disabled === true : null,
    sendDisabled,
    historyStillOpen: Boolean(document.querySelector('[data-lesson-chat-history]')),
    caretAfterDelete,
    popoverAfterDelete,
    wireErrorPage: window.__lastPageWireError || '',
    headTitle: ((document.querySelector('.lesson-chat-title strong') || {}).textContent || '').trim(),
    chatError: lessonChatUi.error || '',
    focused: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '',
    // The composer must still be where the teacher can see and reach it.
    composerInsideFrame: Boolean(inputRect && frameRect && inputRect.bottom <= frameRect.bottom + 1),
    frameBottom: frameRect ? Math.round(frameRect.bottom) : -1,
    inputTop: inputRect ? Math.round(inputRect.top) : -1,
    viewportH: window.innerHeight
  };
})()`;

// #187: an answer can take minutes on a CPU-only laptop, and the teacher who types
// during that time must find the question still there when the answer lands. The
// sample is taken synchronously after the click, while the turn is still in flight.
const INFLIGHT = `(async () => {
  navigate('lesson-plans');
  await new Promise(r => setTimeout(r, 500));
  const box = document.getElementById('lessonChatInput');
  box.focus();
  box.value = __FLIGHT_QUESTION__;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  document.querySelector('[data-lesson-chat-send]').click();
  const during = (() => {
    const b = document.getElementById('lessonChatInput');
    return {
      sending: lessonChatUi.sending === true,
      disabled: b.disabled === true,
      readOnly: b.readOnly === true,
      stopButton: Boolean(document.querySelector('[data-action="lesson-chat-stop"]')),
      sendButton: Boolean(document.querySelector('[data-lesson-chat-send]'))
    };
  })();
  // The next question, typed while the answer is still coming.
  box.value = __QUEUED_TEXT__;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  const typedDuring = String(lessonChatUi.draft || '');
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && lessonChatUi.sending) await new Promise(r => setTimeout(r, 150));
  await new Promise(r => setTimeout(r, 500));
  const after = document.getElementById('lessonChatInput');
  return {
    during,
    typedDuring,
    draftAfter: String(lessonChatUi.draft || ''),
    inputValueAfter: after ? String(after.value) : '',
    stillSending: lessonChatUi.sending === true,
    bubbles: document.querySelectorAll('.lesson-chat-bubble').length,
    error: lessonChatUi.error || ''
  };
})()`;

const CLEANUP = `(async () => {
  const removed = { chats: 0, documents: 0, games: 0, projects: 0 };
  const chatIds = __CHAT_IDS__.filter(Boolean);
  if (chatIds.length) {
    const result = await desktop.call('deleteLessonChats', chatIds);
    removed.chats = Number(result && result.deleted) || 0;
  }
  if (wizardState.gameId) { await desktop.call('deleteGame', wizardState.gameId); removed.games = 1; }
  if (wizardState.projectId) { await desktop.call('deleteProject', wizardState.projectId); removed.projects = 1; }
  const ids = __DOC_IDS__;
  if (ids.length) { await desktop.call('deleteLessonDocuments', ids); removed.documents = ids.length; }
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
  const ai = (await desktop.call('getSettings')).ai || {};
  const provider = (ai.providers || []).find(item => item.id === 'custom') || {};
  navigate('home');
  return {
    removed,
    statusAfter: provider.status,
    hasKeyAfter: provider.hasKey === true,
    baseUrlAfter: provider.baseUrl || ''
  };
})()`;

// #250: what the caret and the box do when a composer control re-renders the page, and
// when a send is refused. The harness drives real mouse and key events
// (`Input.dispatchMouseEvent` / `Input.insertText`), never .click(), .value or focus():
// the reported bug lived exactly in that gap, and a scripted focus() hid it.
const REAL_INPUT_STATE = "({ active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '', value: (document.getElementById('lessonChatInput') || {}).value || '', draft: String(lessonChatUi.draft || '') })";

/** Where the box and each composer control are, for a real pointer to aim at. */
const REAL_INPUT_LAYOUT = `(async () => {
  navigate('lesson-plans');
  await new Promise(r => setTimeout(r, 800));
  lessonChatUi.draft = '';
  lessonChatUi.mode = 'auto';
  lessonChatUi.showHistory = false;
  lessonChatUi.focusComposer = false;
  render();
  await new Promise(r => setTimeout(r, 400));
  const rectOf = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  };
  return {
    box: rectOf('#lessonChatInput'),
    modeAnswer: rectOf('[data-action="lesson-chat-mode"][data-id="answer"]'),
    modeQuestionSet: rectOf('[data-action="lesson-chat-mode"][data-id="question_set"]'),
    picker: rectOf('[data-action="lesson-chat-picker"]'),
    pickerClose: rectOf('[data-action="lesson-chat-picker-close"]'),
    provider: rectOf('#lessonChatProvider'),
    hasCount: Boolean(document.getElementById('lessonChatCount'))
  };
})()`;

const COUNT_TO_SEVEN = `(() => {
  const c = document.getElementById('lessonChatCount');
  if (!c) return { missing: true };
  c.value = '7';
  c.dispatchEvent(new Event('change', { bubbles: true }));
  return { missing: false };
})()`;

const PRESENT = selector => `Boolean(document.querySelector(${JSON.stringify(selector)}))`;

/** The whole box state after a real send (a refused one is the interesting case). */
const REAL_INPUT_SEND = `(async () => {
  const send = document.querySelector('[data-lesson-chat-send]');
  if (!send || send.disabled) return { clicked: false, disabled: true };
  send.click();
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && lessonChatUi.sending) await new Promise(r => setTimeout(r, 150));
  await new Promise(r => setTimeout(r, 600));
  return {
    clicked: true,
    active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '',
    value: (document.getElementById('lessonChatInput') || {}).value || '',
    draft: String(lessonChatUi.draft || ''),
    toast: (document.getElementById('toast') || {}).textContent || '',
    error: String(lessonChatUi.error || '')
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
    // #184: the clamp grew again — 400px (#182) → 520–640 (#183) → 600–900 here, i.e.
    // 63% of the content column. The band is where that clamp really lands at 1280×800
    // (measured 601px), not where the CSS says it should be.
    check('the chat column is a wide, sticky column', layout.sticky === 'sticky' && layout.chatWidth >= 595 && layout.chatWidth <= 640, `${layout.sticky} ${layout.chatWidth}px`);
    // The list column pays for the wider chat (335px against 400px in #183) and that is
    // the deliberate half of the trade: the card was compacted in the same change, so it
    // still fits — the two checks below are what make the price acceptable rather than
    // asserted away.
    check('the lesson list still has room beside it', layout.listWidth >= 330, `list ${layout.listWidth}px at w=${layout.w}`);
    check('the compacted list card still fits its narrower column', layout.cardCount >= 1 && layout.cardHeight >= 120 && layout.cardHeight <= 260, `${layout.cardCount} cards, ${layout.cardHeight}px tall in ${layout.listWidth}px`);
    check('widening the chat spills nothing out of the list', layout.spill.length === 0, layout.spill.join(' | ') || 'clean');
    check('the chat frame fits the visible height', layout.frameHeight >= 560 && layout.frameBottom <= layout.h + 2, `h=${layout.frameHeight} bottom=${layout.frameBottom} viewport=${layout.h}`);
    check('the composer types at a readable size', layout.composerFont >= 13, `${layout.composerFont}px`);
    check('the typing area is a real box, not one line', layout.inputHeight >= 90 && layout.inputHeight <= 320, `${layout.inputHeight}px`);
    check('the transcript scrolls inside the frame', layout.scrollOverflow === 'auto', layout.scrollOverflow);
    check('the BETA panel is gone, not renamed', layout.beta === false && layout.oldPanel === false);
    check('the chat offers both providers to choose from', layout.providerOptions.includes('local') && layout.providerOptions.includes('custom'), layout.providerOptions.join(','));
    check('the chat offers uploading a new lesson', layout.hasImport === true);
    check('the first lesson attaches automatically', layout.chips >= 1, String(layout.chips));
    // Four vế of #184, each proved by a measurement rather than by the string being
    // absent from a file: the deleted line, the row that moved, the frame that grew.
    check('the head no longer carries the subtitle the user asked to delete',
      layout.subtitleGone === true && layout.subtitleWordsGone === true && layout.headHeight <= 70,
      `head ${layout.headHeight}px · ${layout.headText.slice(0, 60)}`);
    check('what a turn reads is decided next to where the question is typed',
      layout.attachInComposer === true, `attach inside composer = ${layout.attachInComposer}`);
    check('the frame is still the three blocks it manages', layout.frameKids.join(',') === 'lesson-chat-head,lesson-chat-scroll,lesson-chat-composer', layout.frameKids.join(','));

    // 3. Combining lessons.
    const combine = await cdp.evaluate(COMBINE_LESSONS);
    check('the picker lists both stored lessons', combine.rows.length === 2, combine.rows.join(','));
    // What used to prove "two lessons at once" was the head line naming the count — the
    // line #184 deleted. The chips themselves are the proof now, in the row they moved to.
    check('two lessons can be attached at once', combine.bothChips === 2 && combine.chipsInComposer === 2, `${combine.bothChips} chips · ${combine.chipsInComposer} in the composer`);
    check('a lesson can be dropped again', combine.afterRemove.length === 1);
    check('a checkbox re-attaches the lesson', combine.docIds.length === 2 && combine.chips === 2 && combine.popoverGone === true, JSON.stringify(combine).slice(0, 120));
    // Moving the picker into the footer put a variable-height list inside a frame with
    // `overflow:hidden`. It is a flow block, so the transcript is what has to give.
    check('the picker opens inside the composer and stays inside the frame',
      combine.popOpen.inComposer === true && combine.popOpen.insideFrame === true,
      `${combine.popOpen.inComposer}/${combine.popOpen.insideFrame} · pop ${combine.popOpen.width}x${combine.popOpen.height} of frame`);
    check('an open picker shrinks the transcript, never the frame',
      combine.popOpen.frameHeight === layout.frameHeight && combine.popOpen.frameBottom <= layout.h + 2
        && combine.popOpen.scrollHeight < layout.scrollHeight
        && combine.popOpen.composerHeight > layout.composerHeight,
      `frame ${combine.popOpen.frameHeight} (was ${layout.frameHeight}) · scroll ${combine.popOpen.scrollHeight} (was ${layout.scrollHeight}) · composer ${combine.popOpen.composerHeight} (was ${layout.composerHeight})`);
    check('a long picker list scrolls instead of pushing the composer out',
      combine.popOpen.maxHeight === '230px', combine.popOpen.maxHeight);

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

    // 4b. #186 — on the cloud the whole lesson is sent, and the teacher is told.
    const lessonChars = DOC_A_TEXT.trim().length + DOC_B_TEXT.trim().length;
    const fullA = String(answerCall.userText || '').includes(DOC_A_TEXT.trim());
    const fullB = String(answerCall.userText || '').includes(DOC_B_TEXT.trim());
    check('#186 the cloud request carries both lessons in full', fullA && fullB, `A=${fullA} B=${fullB}`);
    check('#186 the prompt says the whole lesson travelled, not a quote slice',
      /Toàn bộ nội dung giáo án/.test(String(answerCall.userText || '')) && !/Đoạn trích dẫn từ giáo án/.test(String(answerCall.userText || '')));
    const readsNumbers = String(answer.readsText).match(/AI đã đọc ([\d.]+) \/ ([\d.]+) ký tự \((\d+) %\)/) || [];
    const viNumber = (value) => Number(String(value || '').replace(/\./g, ''));
    check('#186 the chat discloses exactly what was read',
      readsNumbers.length === 4 && viNumber(readsNumbers[1]) === lessonChars && viNumber(readsNumbers[2]) === lessonChars && readsNumbers[3] === '100',
      answer.readsText || '(no reading line)');
    check('#186 a full read is not flagged as a cut',
      answer.readsPercent === '100' && answer.readsTrimmed === '0' && /toàn bộ giáo án, không cắt bớt/.test(answer.readsText), answer.readsText);
    check('#186 the reading line carries its icon', answer.readsIcon === true);

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
    check('#186 the stored turns keep the disclosure',
      stored.reads.length === 2 && stored.reads.every(meta => meta && meta.mode === 'whole' && meta.trimmed === false && meta.characters === lessonChars && meta.totalCharacters === lessonChars),
      JSON.stringify(stored.reads).slice(0, 160));

    await cdp.evaluate(`location.reload()`);
    await sleep(2600);
    const guardAgain = await cdp.evaluate(SETUP_GUARD);
    check('the reload did not reopen the setup overlay', guardAgain.opened === false || guardAgain.stillOpen === false, JSON.stringify(guardAgain));
    const reopened = await cdp.evaluate(REOPEN_AFTER_RELOAD);
    check('the history reopens the stored conversation', reopened.docChips === 2 && Boolean(reopened.reopened), `${reopened.docChips} chips / ${reopened.reopened}`);
    check('the restored transcript still shows the quotes', reopened.evidenceRows.length >= 2 && /ánh sáng/.test(reopened.bubbleText), `${reopened.evidenceRows.length}`);
    check('the restored transcript still shows the question set', reopened.restoredSet === true);
    check('#186 the disclosure survives the reload',
      reopened.readsLines.length === 2 && reopened.readsLines.every(text => /\(100 %\) · toàn bộ giáo án, không cắt bớt/.test(text)),
      reopened.readsLines.join(' | ').slice(0, 160));

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
    check('the composer says which provider will run', /AI local/i.test(local.providerText), local.providerText.slice(0, 60));
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
    check('the attach row says the turn is not grounded',
      /Chưa gắn giáo án nào/.test(free.attachTitle) && /kiến thức chung/.test(free.attachTitle) && free.attachInComposer === true,
      `${free.attachTitle.slice(0, 70) || 'no title'} · in composer=${free.attachInComposer}`);
    check('the composer invites a question with no lesson', /không cần chọn hay tải giáo án/.test(free.hint), free.hint.slice(0, 70));
    check('a question with no lesson can be sent', free.sendDisabled === false && free.error === '', free.error.slice(0, 80) || 'enabled');
    check('the turn really reached the endpoint', mockRequests.length === requestsBeforeFree + 1, `${requestsBeforeFree} -> ${mockRequests.length}`);
    check('the ungrounded prompt drops the quote requirement', /không gắn giáo án nào/.test(String(freeCall.systemText || '')) && !/Chỉ được trả lời dựa trên các đoạn trích dẫn/.test(String(freeCall.systemText || '')), String(freeCall.systemText || '').slice(0, 70));
    check('the ungrounded prompt carries no lesson quotes', freeCall.ungrounded === true && !/\[\d\] \(/.test(String(freeCall.userText || '')), String(freeCall.userText || '').slice(0, 60));
    check('the answer appears in the chat', /gợi ý từ kiến thức sư phạm chung/i.test(free.lastBubble), free.lastBubble.slice(0, 70));
    check('no source strip is faked for a lesson-free turn', free.evidenceBlocks === 0, String(free.evidenceBlocks));
    check('#186 a lesson-free turn prints no reading score',
      free.readsText === '' && free.storedReads.every(meta => !meta || Number(meta.totalCharacters) === 0),
      `${free.readsText || '(none)'} · ${JSON.stringify(free.storedReads).slice(0, 90)}`);
    check('the lesson-free turn is stored with no documents',
      Boolean(free.chatId) && free.storedDocumentIds.length === 0 && free.storedCitations.every(count => count === 0),
      `${JSON.stringify(free.storedDocumentIds)}/${JSON.stringify(free.storedCitations)}`);
    const groundedAgain = await cdp.evaluate(`(async () => ((await desktop.call('getLessonChat', ${JSON.stringify(stored.chatId)})) || {}).documentIds || [])()`);
    check('the earlier grounded conversation kept its two lessons', groundedAgain.length === 2, JSON.stringify(groundedAgain));

    // 10. The compacted lesson card and its "Xem chi tiết" (#184 vế 4) — the other half
    // of the trade that paid for the wider chat column, so it is measured at the same
    // 1280×800 the layout checks use.
    const cardValues = { ...values, ANALYSIS_ID: JSON.stringify(ANALYSIS_ID), DOC_A: JSON.stringify(docIds[0]) };
    const card = await cdp.evaluate(fill(LESSON_CARD, cardValues));
    check('the analysed card was read, not skipped', card.closedTextLen > 20 && card.openTextLen > 20, `${card.closedTextLen}/${card.openTextLen} characters read`);
    check('an analysed card offers exactly one expandable block',
      card.hasDetails === true && card.summaryLabel === true && card.summaryDisplay === 'block' && card.summaryListStyle === 'none',
      `${card.hasDetails} · ${card.summaryLabel} · ${card.summaryDisplay}/${card.summaryListStyle}`);
    check('a closed card is the scanning row it is meant to be',
      card.compactWhenClosed === true && card.metaLine === true && card.closedHeight <= 260,
      `${card.closedWidth}x${card.closedHeight}px · ${card.metaLine}`);
    check('opening reads the analysis without leaving the column',
      card.isOpen === true && card.detailTextShown === true && card.detailItems === 5 && card.reopenButtons === 1,
      `${card.detailItems} dòng · ${card.reopenButtons} nút mở · ${card.closedHeight}→${card.openHeight}px`);
    check('the caret turns with the open state',
      card.caretMatchesOpen === true && /matrix\(-1/.test(card.caretFlipped),
      `${card.caretFlipped} · selector matches = ${card.caretMatchesOpen}`);
    check('neither state of the card overflows the narrower list',
      card.closedSpill.length === 0 && card.openSpill.length === 0,
      `${card.closedSpill.join(' | ') || 'clean'}/${card.openSpill.join(' | ') || 'clean'}`);
    const cardClosed = await cdp.evaluate(fill(CARD_CLOSED_AGAIN, cardValues));
    check('the block closes again and gives the room back',
      cardClosed.found === true && cardClosed.stillOpen === false
        && cardClosed.height === card.closedHeight && cardClosed.contentHidden === true
        && cardClosed.labelShown === true && cardClosed.textLen > 20 && cardClosed.spill.length === 0,
      `${cardClosed.height}px (was ${card.closedHeight}) · label=${cardClosed.labelShown} content=${cardClosed.contentHidden} · ${cardClosed.spill.join(' | ') || 'clean'}`);

    // 11. #187 — deleting the conversation that is open must not cost the teacher the
    // composer. Reported as "xoá 1 cuộc trò chuyện thì không nhập chat được nữa", so the
    // check types a new question right after the delete and then really sends it.
    const del = await cdp.evaluate(fill(DELETE_AND_RETYPE, { ...values, AFTER_DELETE_QUESTION: JSON.stringify(AFTER_DELETE_QUESTION) }));
    // Typed from here with real key events and no focus() call: the box has to already
    // hold the caret when the delete returns, or nothing lands (#250).
    await realType(cdp, AFTER_DELETE_QUESTION);
    const delTyped = await cdp.evaluate(REAL_INPUT_STATE);
    // Read after the typing: an empty box disables the button by design, so asking
    // before the question lands would only measure that rule, not the delete.
    const sendAfterType = await cdp.evaluate(`(() => {
      const send = document.querySelector('[data-lesson-chat-send]');
      return send ? send.disabled === true : null;
    })()`);
    check('#187 the page still draws the chat frame after a delete',
      del.pageBroken === false && del.hasComposer === true && del.hasInput === true,
      `composer=${del.hasComposer} input=${del.hasInput} disabled=${del.inputDisabled} ${del.clickThrew}`);
    check('#187 the delete reached the store and the list',
      del.deletedOnDisk === true && del.rowsBefore >= 2 && !del.chatsLeft.includes(del.openId),
      `${del.rowsBefore} rows · gone=${del.deletedOnDisk} · left ${del.chatsLeft.length}`);
    check('#187 the open conversation is released, not left dangling',
      del.chatIdAfter === '' && /Cuộc trò chuyện mới/.test(del.headTitle), `${del.chatIdAfter || '(empty)'} · ${del.headTitle}`);
    check('#187 no swallowed wiring error behind the dead box', del.errs.length === 0 && del.wireErrorPage === '', `${del.errs.join(' | ') || 'clean'} page=${del.wireErrorPage}`);
    check('#187 typing after the delete reaches the draft',
      delTyped.value === AFTER_DELETE_QUESTION && delTyped.draft === AFTER_DELETE_QUESTION,
      `${delTyped.draft.length}/${AFTER_DELETE_QUESTION.length} ký tự · active=${delTyped.active}`);
    check('#187 the send button wakes up again after a delete', sendAfterType === false, `disabled=${sendAfterType} error=${del.chatError.slice(0, 60)}`);
    // The two things a teacher actually feels: the caret is where they were typing, and
    // the list they clicked in has stepped back out of the way.
    check('#187 the delete hands the caret back to the box',
      del.caretAfterDelete === 'lessonChatInput' && delTyped.active === 'lessonChatInput',
      `after delete=${del.caretAfterDelete} after typing=${delTyped.active}`);
    check('#187 the history popover steps back after the delete', del.popoverAfterDelete === false, `open=${del.popoverAfterDelete}`);
    check('#187 the composer stays inside the frame after a delete',
      del.composerInsideFrame === true && del.frameBottom <= del.viewportH + 2,
      `input@${del.inputTop} frame bottom=${del.frameBottom} viewport=${del.viewportH}`);
    // The other conversation is still there, and the deleted one is gone from the list.
    check('#187 the other conversations survive', del.chatsLeft.length === del.rowsBefore - 1, `${del.rowsBefore} -> ${del.chatsLeft.length}`);

    const requestsBeforeReopen = mockRequests.length;
    const again = await cdp.evaluate(fill(sendTurn('answer', AFTER_DELETE_QUESTION, '[data-lesson-chat-reads]'), values));
    check('#187 a question typed after the delete really reaches the endpoint',
      mockRequests.length === requestsBeforeReopen + 1 && again.error === '',
      `${requestsBeforeReopen} -> ${mockRequests.length} ${again.error.slice(0, 60)}`);
    check('#187 the answer lands in a brand-new conversation',
      Boolean(again.chatId) && again.chatId !== del.openId && /giáo án/.test(again.lastBubble), `${again.chatId.slice(0, 12)} · ${again.lastBubble.slice(0, 40)}`);
    // The deleted id is gone, the new one has to be cleaned up.
    const dropped = chatIds.indexOf(del.openId);
    if (dropped >= 0) chatIds.splice(dropped, 1);
    chatIds.push(again.chatId);

    // 11b. #187: a turn in flight must not lock the box, and what the teacher types
    // while the AI is writing must survive the answer landing in the same chat.
    const flight = await cdp.evaluate(fill(INFLIGHT, {
      ...values,
      FLIGHT_QUESTION: JSON.stringify(FLIGHT_QUESTION),
      QUEUED_TEXT: JSON.stringify(QUEUED_TEXT)
    }));
    check('#187 the box is not locked while the AI is writing',
      flight.during.sending === true && flight.during.disabled === false
      && flight.during.readOnly === false && flight.during.stopButton === true,
      `sending=${flight.during.sending} disabled=${flight.during.disabled} readonly=${flight.during.readOnly} stop=${flight.during.stopButton}`);
    check('#187 typing during the turn reaches the draft', flight.typedDuring === QUEUED_TEXT, `${flight.typedDuring.length}/${QUEUED_TEXT.length} ký tự`);
    check('#187 the answer keeps the question typed after it was sent',
      flight.stillSending === false && flight.error === ''
      && flight.draftAfter === QUEUED_TEXT && flight.inputValueAfter === QUEUED_TEXT && flight.bubbles >= 2,
      `draft="${flight.draftAfter.slice(0, 24)}" value="${flight.inputValueAfter.slice(0, 24)}" bubbles=${flight.bubbles} ${flight.error.slice(0, 40)}`);

    // 11c. #250 — the two defects the teacher reported on this composer, driven with a
    // real pointer and a real keyboard: deleting a conversation left the box unable to
    // take typing, and a sent question stayed in the box. The check above could not see
    // either because it focused the box itself and then read the state object.
    // The Tauri shell offers to import old Electron data on first launch ("Nhập dữ
    // liệu từ bản cũ"). On a machine that still has %APPDATA%/edugame-studio that
    // modal covers the shell, and unlike the scripted steps above a REAL pointer
    // hit-tests the topmost element: the click lands on the modal, not the box, so
    // the caret never moves. "Để sau" only closes it (migration.ts). Clear any
    // first-launch overlay before driving the real pointer, and assert it is gone —
    // an overlay left open must fail here, not as four mysterious caret misses.
    const overlay = await cdp.evaluate(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const deadline = Date.now() + 6000;
      let dismissed = '';
      while (Date.now() < deadline) {
        const later = document.querySelector('[data-migration-action="later"]');
        if (later) { later.click(); dismissed = 'migration'; await sleep(250); continue; }
        if (document.querySelector('#modalRoot .setup-fullscreen')) {
          if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
          dismissed = dismissed || 'setup'; await sleep(250); continue;
        }
        const root = document.getElementById('modalRoot');
        if (!root || root.children.length === 0) break;
        await sleep(150);
      }
      const root = document.getElementById('modalRoot');
      return { dismissed, clear: !root || root.children.length === 0 };
    })()`);
    check('#250 no first-launch overlay covers the composer', overlay.clear === true, JSON.stringify(overlay));
    const real = await cdp.evaluate(REAL_INPUT_LAYOUT);
    check('#250 the composer is measurable in the frame', Boolean(real.box && real.modeAnswer && real.picker), JSON.stringify(real).slice(0, 120));
    await realClick(cdp, real.box, 'the typing box');
    const caretInBox = await cdp.evaluate(REAL_INPUT_STATE);
    check('#250 a click in the box puts the caret there', caretInBox.active === 'lessonChatInput', `active=${caretInBox.active}`);
    await realType(cdp, TYPED_BEFORE_CONTROLS);
    const typedStart = await cdp.evaluate(REAL_INPUT_STATE);
    check('#250 the box takes real typing', typedStart.value === TYPED_BEFORE_CONTROLS && typedStart.draft === TYPED_BEFORE_CONTROLS, `"${typedStart.value}"`);
    // The answer-mode button calls render(), which rebuilds the whole page.
    await realClick(cdp, real.modeAnswer, 'the answer-mode button');
    const afterMode = await cdp.evaluate(REAL_INPUT_STATE);
    check('#250 switching the answer mode keeps the caret in the box', afterMode.active === 'lessonChatInput' && afterMode.value === TYPED_BEFORE_CONTROLS, `active=${afterMode.active} value="${afterMode.value.slice(0, 24)}"`);
    await realType(cdp, TYPED_MORE);
    const typedAfterMode = await cdp.evaluate(REAL_INPUT_STATE);
    check('#250 typing keeps working after the mode switch', typedAfterMode.value === TYPED_BEFORE_CONTROLS + TYPED_MORE && typedAfterMode.active === 'lessonChatInput', `"${typedAfterMode.value}" · active=${typedAfterMode.active}`);
    // Opening and closing the lesson picker is the control next to the caret. The
    // popover's own buttons only exist while it is open, so they are measured after.
    await realClick(cdp, real.picker, 'the lesson picker');
    const pickerOpenExists = await cdp.evaluate(PRESENT('[data-lesson-chat-picker]'));
    const pickerClose = await cdp.evaluate(`(() => {
      const el = document.querySelector('[data-action="lesson-chat-picker-close"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    await realClick(cdp, pickerClose, 'the picker close button');
    const afterPicker = await cdp.evaluate(REAL_INPUT_STATE);
    check('#250 opening and closing the picker keeps the caret in the box', pickerOpenExists === true && afterPicker.active === 'lessonChatInput', `popover=${pickerOpenExists} active=${afterPicker.active}`);
    // The question count only exists in "Bộ câu hỏi" mode; entering that mode is itself
    // a render, so typing has to survive it first (the assert below is what proves it
    // cannot be done in "Trả lời" mode). Switching there with the count already showing:
    await realClick(cdp, real.modeQuestionSet, 'the question-set mode button');
    const afterSetMode = await cdp.evaluate(REAL_INPUT_STATE);
    check('#250 switching to question-set mode keeps the caret in the box', afterSetMode.active === 'lessonChatInput', `active=${afterSetMode.active}`);
    // The question count is a native control inside the composer; it renders too.
    const hasCount = await cdp.evaluate(PRESENT('#lessonChatCount'));
    if (hasCount) {
      await cdp.evaluate(COUNT_TO_SEVEN);
      await sleep(450);
      const afterCount = await cdp.evaluate(REAL_INPUT_STATE);
      check('#250 changing the question count keeps the caret in the box',
        afterCount.active === 'lessonChatInput' && Boolean(afterCount.value) && afterCount.draft === afterCount.value,
        `active=${afterCount.active} value="${afterCount.value.slice(0, 28)}" count=${await cdp.evaluate('lessonChatUi.questionCount')}`);
    } else {
      check('#250 changing the question count keeps the caret in the box', false, 'no #lessonChatCount in question_set mode');
    }
    // A question under 3 characters is refused before any AI call: Enter must empty the
    // box and say why, because a sentence left sitting there is exactly what "bấm Gửi
    // mà ô không tự xoá" describes.
    await realClick(cdp, real.box, 'the typing box (refused question)');
    await cdp.evaluate(`(() => { const box = document.getElementById('lessonChatInput'); box.select(); return true; })()`);
    await realType(cdp, TOO_SHORT_QUESTION);
    const shortBefore = await cdp.evaluate(REAL_INPUT_STATE);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await sleep(800);
    const shortAfter = await cdp.evaluate(REAL_INPUT_STATE);
    const shortToast = await cdp.evaluate("(document.getElementById('toast') || {}).textContent || ''");
    check('#250 a refused question leaves the box empty',
      shortBefore.value === TOO_SHORT_QUESTION && shortAfter.value === '' && shortAfter.draft === '',
      `"${shortBefore.value}" -> "${shortAfter.value}"`);
    check('#250 a refused question says why and keeps the caret',
      shortAfter.active === 'lessonChatInput' && /3 ký tự/.test(String(shortToast)),
      `active=${shortAfter.active} toast="${String(shortToast).slice(0, 40)}"`);

    // A real send with a provider that refuses (no AI ready is the teacher's case here):
    // the box empties either way, and the error says what happened. The question is
    // typed for real first, so an empty box afterwards is the send's doing.
    await realClick(cdp, real.box, 'the typing box (before the send)');
    await realType(cdp, AGAIN_QUESTION);
    const sendBefore = await cdp.evaluate(REAL_INPUT_STATE);
    const failing = await cdp.evaluate(REAL_INPUT_SEND);
    check('#250 a send that the AI refuses still empties the box',
      sendBefore.value === AGAIN_QUESTION && failing.clicked === true && failing.value === '' && failing.draft === '',
      `"${String(sendBefore.value).slice(0, 24)}" -> "${String(failing.value).slice(0, 24)}" · ${String(failing.error).slice(0, 50)}`);
    check('#250 the caret is back in the box after that send', failing.active === 'lessonChatInput', `active=${failing.active}`);
    // The conversation this check might have just created (a provider that answered) is
    // this check's to delete; a refused turn stores one too when a chat already existed.
    const realChatId = await cdp.evaluate('String(lessonChatUi.chatId || "")');
    if (realChatId && !chatIds.includes(realChatId)) chatIds.push(realChatId);

    // 12. Leave the profile as it was found.
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
