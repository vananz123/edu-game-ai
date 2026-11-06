// @ts-nocheck -- classic renderer script: "Giải thích" là MỘT NÚT, không phải một dòng chữ tự in (DECISIONS #209 task 7).
/* Vì sao phải có một tệp dùng chung: lời giải của một câu từng được in ở bốn chỗ khác
   nhau — `quiz.ts` nối `<br>` vào bảng feedback, `race.ts` tự div cho hai nhánh đúng/sai,
   Kho báu đi qua MỘT cửa `treasureExplanationLine` cho cả bốn bề mặt, và máy chiếu là
   ĐƯỜNG THỨ HAI tới chân lý qua `buildQuizView`/`buildTreasureView`. Sửa từng chỗ thì
   "giải thích không tự hiện" chỉ đúng ở màn vừa sửa, còn máy chiếu vẫn in chữ đó lên
   trước cả lớp.
   Game CŨ (`mode === 'legacy'`) vẫn in inline NGUYÊN VĂN: #209 chốt "trò chơi đã lưu vẫn
   chơi theo luật cũ cho tới khi giáo viên chủ động đổi", mà luật cũ của lời giải là "hiện
   luôn cùng đáp án". Đổi một hàng chữ thành một cú nhấp là đổi hành vi của bản đã lưu.
   `answerExplanationMarkup` nhận sẵn phần inline của từng bề mặt (`info.inline`) nên
   không có một khuôn mới nào áp lên chữ cũ. */

/* Lời giải đang chờ trên màn: MỘT chỗ duy nhất, vì màn chơi chỉ có một câu một lượt.
   `key` mang theo câu nào + chế độ nào để một cú nhấp vào nút cũ (DOM đã vẽ lại nhưng
   sự kiện vẫn bắn tới) không mở được lời giải của câu khác. */
let answerExplanationPending = null;
let answerExplanationWired = false;
let answerExplanationGuard = null;

/** Ba cách trả lời mới dùng nút; 'legacy' in inline như trò chơi đó vẫn làm. */
function answerExplanationUsesButton(turn) {
    return Boolean(turn) && String(turn.mode || 'legacy') !== 'legacy';
}
/** Khoá của một lời giải: câu nào đang được giải thích, theo chế độ nào. */
function answerExplanationKey(turn) {
    if (!turn)
        return '';
    return `${String(turn.questionId || '')}|${String(turn.mode || '')}`;
}
/**
 * NỘP chữ mà nút sẽ mở, đồng thời đóng modal của câu trước.
 * `title`/`prompt` chỉ là ngữ cảnh trong modal; `law` lấy thẳng bảng chữ của
 * `answer-mode.js` để modal tự nói cách trả lời ĐANG chạy, không tái diễn giải.
 */
function answerExplanationRemember(turn, info, text) {
    const options = info || {};
    const payload = {
        key: answerExplanationKey(turn),
        title: String(options.title || 'Giải thích'),
        prompt: String(options.prompt || ''),
        text: String(text || ''),
        mode: String(turn.mode || ''),
        law: answerModeHint(turn.mode)
    };
    if (answerExplanationPending && answerExplanationPending.key !== payload.key)
        answerExplanationCloseModal();
    answerExplanationPending = payload;
    return payload;
}
function answerExplanationButtonHtml(key) {
    return `<button type="button" class="btn btn-secondary btn-small answer-explain-btn" data-answer-explain="${escapeHtml(key)}">💡 <span>Giải thích</span></button>`;
}
/**
 * Cửa duy nhất cho mọi bề mặt. Bốn giá trị có thể xảy ra:
 *  - chưa có vòng trả lời nào: '' (cả bốn trò đều mở vòng trước khi vẽ feedback);
 *  - hàng luật không cho (`explanationAllowed` false — sai ở Thử thách, hoặc Luyện tập
 *    đang thử lại): '', tức KHÔNG có nút và KHÔNG có chữ;
 *  - game cũ: `info.inline` trả lại NGUYÊN VĂN chữ của hôm qua;
 *  - ba chế độ mới: một cái nút, và chữ chỉ tồn tại sau một cú nhấp.
 */
function answerExplanationMarkup(turn, info) {
    const options = info || {};
    const text = String(options.text || '');
    if (!turn || !text || !turn.explanationAvailable)
        return '';
    if (!answerExplanationUsesButton(turn))
        return String(options.inline || '');
    const payload = answerExplanationRemember(turn, options, text);
    return answerExplanationButtonHtml(payload.key);
}
function answerExplanationModalHtml(payload) {
    return `<div class="answer-explain-dialog" role="dialog" aria-modal="true" aria-labelledby="answerExplainTitle">
      <div class="answer-explain-head">
        <div class="answer-explain-heading">
          <h3 id="answerExplainTitle" class="answer-explain-title">💡 ${escapeHtml(payload.title)}</h3>
          <div class="answer-explain-law">${escapeHtml(answerModeLabel(payload.mode))} · ${escapeHtml(payload.law)}</div>
        </div>
        <button type="button" class="answer-explain-close" id="closeAnswerExplainBtn" aria-label="Đóng">✕</button>
      </div>
      <div class="answer-explain-body">
        ${payload.prompt ? `<p class="answer-explain-prompt">${escapeHtml(payload.prompt)}</p>` : ''}
        <p class="answer-explain-text">${escapeHtml(payload.text)}</p>
      </div>
      <div class="answer-explain-foot">
        <button type="button" class="btn btn-primary" id="answerExplainOkBtn">Đã hiểu</button>
      </div>
    </div>`;
}
/**
 * Mở modal. Nối vào `#modalRoot` chứ KHÔNG vào `#playBody`: `#playBody` bị vẽ lại bằng
 * innerHTML ở mỗi câu, còn `#modalRoot` là host của cả màn chơi — cùng khuôn với pop-up
 * "Bối cảnh & Nhiệm vụ" của Kho báu. `state.answerExplanationShown` là thứ duy nhất máy
 * chiếu được phép nhìn thấy, nên một cú nhấp ở màn giáo viên mới hiện chữ lên màn chiếu.
 */
function openAnswerExplanationModal(key) {
    const payload = answerExplanationPending;
    if (!payload || (key !== undefined && String(key) !== payload.key))
        return null;
    answerExplanationRemoveDialog();
    const host = $('#modalRoot') || document.body;
    const backdrop = document.createElement('div');
    backdrop.id = 'answerExplanationModal';
    backdrop.className = 'answer-explain-backdrop';
    backdrop.innerHTML = answerExplanationModalHtml(payload);
    host.appendChild(backdrop);
    state.answerExplanationShown = { key: payload.key, text: payload.text };
    $('#closeAnswerExplainBtn', backdrop).onclick = () => answerExplanationCloseModal();
    $('#answerExplainOkBtn', backdrop).onclick = () => answerExplanationCloseModal();
    backdrop.addEventListener('click', event => {
        if (event.target === backdrop)
            answerExplanationCloseModal();
    });
    // Esc ở màn chơi là thứ TẮT CẢ VÁN (shell.ts:167), nên phải chặn từ capture: modal
    // đóng, ván chơi còn nguyên. capture chạy trước listener bubble của shell.
    backdrop.addEventListener('keydown', event => {
        if (event.key !== 'Escape')
            return;
        event.preventDefault();
        event.stopPropagation();
        answerExplanationCloseModal();
    }, true);
    const ok = $('#answerExplainOkBtn', backdrop);
    if (ok)
        ok.focus();
    answerExplanationStartGuard();
    sendPresentationState();
    return backdrop;
}
function answerExplanationRemoveDialog() {
    answerExplanationStopGuard();
    const open = $('#answerExplanationModal');
    if (open)
        open.remove();
    return Boolean(open);
}
/* Hộp lời giải sống ở `#modalRoot`, tức NẰM NGOÀI phần vẽ lại của `#playBody`. Nếu không
   canh chừng thì một cú "câu tiếp theo" (hoặc một lần vẽ lại nào đó của trò chơi) để lại
   lời giải của câu cũ phủ lên câu mới trước cả lớp. Chủ của hộp là cái nút đã mở nó, nên
   mất nút là mất hộp — một rule duy nhất cho cả bốn bề mặt, không trò nào phải tự dọn. */
function answerExplanationStopGuard() {
    if (!answerExplanationGuard)
        return;
    try {
        answerExplanationGuard.disconnect();
    }
    catch (ignored) {
    }
    answerExplanationGuard = null;
}
function answerExplanationStartGuard() {
    const body = document.getElementById('playBody');
    if (!body || typeof MutationObserver !== 'function')
        return;
    answerExplanationStopGuard();
    answerExplanationGuard = new MutationObserver(() => {
        if (!$('#answerExplanationModal')) {
            answerExplanationStopGuard();
            return;
        }
        if ($('[data-answer-explain]'))
            return;
        answerExplanationCloseModal();
    });
    answerExplanationGuard.observe(body, { childList: true, subtree: true });
}
/** Đóng modal và báo lại máy chiếu: `shown` còn đó là chữ còn hiện lên cả lớp. */
function answerExplanationCloseModal() {
    const removed = answerExplanationRemoveDialog();
    if (removed || state.answerExplanationShown) {
        state.answerExplanationShown = null;
        sendPresentationState();
    }
}
/**
 * Chữ máy chiếu được quyền in. `allowed` là cổng LUẬT mà caller vẫn dùng
 * (`answered && (!turn || turn.explanationAvailable)`), nên một ván chưa có vòng nào —
 * đường của LAN, nơi #209 đứng ngoài phạm vi — vẫn in như hôm qua.
 */
function answerExplanationProjectorText(turn, allowed, text) {
    const value = String(text || '');
    if (!allowed || !value)
        return '';
    if (!answerExplanationUsesButton(turn))
        return value;
    const shown = state.answerExplanationShown;
    return shown && shown.key === answerExplanationKey(turn) ? String(shown.text || '') : '';
}
/** Một listener cho bốn trò: bề mặt nào cũng chỉ cần vẽ đúng cái nút. */
function answerExplanationWire() {
    if (answerExplanationWired)
        return;
    answerExplanationWired = true;
    document.addEventListener('click', event => {
        const btn = event.target && event.target.closest ? event.target.closest('[data-answer-explain]') : null;
        if (btn)
            openAnswerExplanationModal(btn.dataset.answerExplain);
    });
}
answerExplanationWire();

if (typeof module !== 'undefined')
    module.exports = {
        answerExplanationUsesButton,
        answerExplanationKey,
        answerExplanationMarkup,
        answerExplanationProjectorText,
        answerExplanationModalHtml
    };
