// @ts-nocheck -- shared "cách trả lời" state machine (DECISIONS #209 task 3); renderer games read these as globals.
/* Một vòng trả lời = MỘT câu (hoặc MỘT lượt ở Đường đua). Bốn trò gọi cùng một máy
   trạng thái này thay vì tự viết lại "sai thì làm gì", vì ba chế độ Thi đấu / Luyện
   tập / Thử thách khác nhau đúng ba điều: có được thử lại không, có mở đáp án không,
   và điểm nội dung bị phạt bao nhiêu. Luật bảng nằm ở answer-mode.js (answerRules,
   practiceAward, explanationAllowed) — tệp này chỉ là tầng THỰC THI luật đó và giữ
   cho mỗi câu chỉ đóng góp MỘT lần vào bảng điểm.

   Vì sao không để từng trò tự làm: bốn trò chấm đáp án bằng bốn đường khác nhau
   (quiz gọi scoreAnswer/scoreTextAnswer/scoreScenarioDecision trong runtime.js,
   treasure và race tự so optionId với correctOptionId), nên chỉ trạng thái trả lời
   mới dùng chung được, còn điểm thì trò phải đưa vào. Vì thế `registerAnswer` nhận
   `{ correct, points }` do chính trò tính và chỉ THÊM phạt + khoá + kết thúc. */

/**
 * Mở một vòng trả lời.
 * @param question câu hỏi (dùng `points` làm trần phạt qua questionMaxPoints)
 * @param gameSetup thiết lập trò chơi — chứa token 'tra-loi:…' hoặc mode Việt cũ
 * @param context { maxPoints?, template? } — `maxPoints` là cơ số phạt trò muốn dùng
 *                 (Kho báu phải truyền ĐIỂM NỘI DUNG của chặng, không truyền thưởng
 *                 hoàn thành hành trình/vật phẩm ẩn); thiếu thì lấy trần của câu.
 */
function beginAnswerTurn(question, gameSetup, context) {
  const options = context || {};
  // Có `template` thì hỏi answerModeForGame (Ghép cặp luôn ra 'legacy' vì nó giữ luật
  // phạt theo số cặp sai); không có thì tin vào chính gameSetup của trò đang chơi.
  const mode = options.template
    ? answerModeForGame({ template: options.template, gameSetup })
    : answerModeKey(gameSetup);
  const rules = answerRules(mode);
  const given = Number(options.maxPoints);
  const maxPoints = Number.isFinite(given) && given > 0
    ? given
    : questionMaxPoints(question, gameSetup);
  return {
    mode,
    rules,
    questionId: String((question && question.id) || ''),
    maxPoints,
    attempts: 0,
    wrongAttempts: 0,
    answered: false,
    correct: false,
    finished: false,
    locked: false,
    points: 0,
    revealCorrect: false,
    explanationAvailable: false,
    retryAllowed: rules.retryOnWrong,
    committed: false
  };
}

/* Trần phạt của Luyện tập là điểm của CÂU đó, không phải tổng đã cộng. Phần trên trần
   là thưởng do trò gộp vào (Kho báu: hoàn thành hành trình / vật phẩm ẩn) nên KHÔNG bị
   trừ — đúng điều chủ dự án chốt: "phạt chỉ trên điểm nội dung". */
function practicePenalty(turn) {
  const ceiling = Math.max(0, Number(turn.maxPoints) || 0);
  return Math.max(0, ceiling - practiceAward(ceiling, turn.wrongAttempts));
}

function practicePointsFor(turn, award) {
  const paid = Math.max(0, Number(award) || 0);
  return Math.max(0, Math.round(paid - practicePenalty(turn)));
}

function refreshTurn(turn, attemptsLeft) {
  turn.retryAllowed = Boolean(turn.rules.retryOnWrong && !turn.finished
    && (attemptsLeft === undefined || attemptsLeft === null || attemptsLeft > 0));
  turn.explanationAvailable = explanationAllowed(turn.mode, {
    correct: turn.correct,
    finished: turn.finished
  });
  return turn;
}

/**
 * Ghi MỘT lần trả lời. Kết quả do trò tính sẵn: { correct, points }.
 * `context` nhận { attemptsLeft? } — số lượt còn lại SAU lần trả lời này (Kho báu),
 * bỏ trống với trò không giới hạn lượt.
 *
 * Hai bất biến chống đếm trùng: một vòng đã `finished` thì KHÔNG nhận thêm lần trả
 * lời nào nữa (nút đã tắt nhưng cú nhấp thứ hai vẫn có thể bắn tới đây), và một vòng
 * đã `committed` thì không ghi thêm dòng điểm nào (xem commitAnswerRecord).
 */
function registerAnswer(turn, result, context) {
  if (!turn || typeof turn !== 'object') return turn;
  if (turn.finished || turn.locked) {
    turn.rejected = true;
    return refreshTurn(turn, context && context.attemptsLeft);
  }
  const options = context || {};
  const answer = result || {};
  const correct = Boolean(answer.correct);
  turn.attempts += 1;
  turn.answered = true;
  turn.correct = correct;
  turn.rejected = false;
  if (correct) {
    turn.points = turn.mode === 'practice'
      ? practicePointsFor(turn, answer.points)
      : Math.max(0, Number(answer.points) || 0);
    turn.finished = true;
    turn.locked = true;
    turn.revealCorrect = true;
    turn.retryAllowed = false;
    return refreshTurn(turn, 0);
  }
  turn.wrongAttempts += 1;
  turn.points = 0;
  if (turn.rules.retryOnWrong) {
    const outOfAttempts = options.attemptsLeft !== undefined && options.attemptsLeft !== null
      && Number(options.attemptsLeft) <= 0;
    if (outOfAttempts) {
      // Hết lượt mà vẫn sai: vòng khép lại, điểm 0, và KHÔNG mở đáp án —
      // Luyện tập không lộ đáp án sau câu sai (answer-mode.js: revealOnWrong false).
      turn.finished = true;
      turn.locked = true;
    }
    return refreshTurn(turn, outOfAttempts ? 0 : options.attemptsLeft);
  }
  // Thi đấu / Thử thách / game cũ: một câu chỉ có một lượt trả lời.
  turn.finished = true;
  turn.locked = true;
  turn.revealCorrect = Boolean(turn.rules.revealOnWrong);
  return refreshTurn(turn, 0);
}

/**
 * Kết thúc vòng từ PHÍA TRÒ: hết giờ ở Đường đua, MC bấm sang câu, hoặc hết lượt ở
 * một trò không dùng giới hạn lượt. Không xoá điểm của một vòng đã trả lời đúng,
 * và không phạt thêm — phạt chỉ đến từ registerAnswer.
 */
function endAnswerTurn(turn, context) {
  if (!turn || typeof turn !== 'object') return turn;
  const options = context || {};
  if (!turn.correct) {
    turn.finished = true;
    turn.locked = true;
    if (turn.answered) turn.revealCorrect = Boolean(turn.rules.revealOnWrong);
  }
  if (options.skipped === true) turn.skipped = true;
  return refreshTurn(turn, 0);
}

/** Dòng điểm của một vòng — đủ để calculateSummary cộng mà không cần biết chế độ. */
function answerTurnRecord(turn, extra) {
  const record = {
    points: Number(turn && turn.points) || 0,
    correct: Boolean(turn && turn.correct),
    attempts: Number(turn && turn.attempts) || 0,
    wrongAttempts: Number(turn && turn.wrongAttempts) || 0,
    maxPoints: Number(turn && turn.maxPoints) || 0,
    mode: (turn && turn.mode) || 'legacy'
  };
  if (turn && turn.questionId) record.questionId = turn.questionId;
  return Object.assign(record, extra || {});
}

/**
 * Nạp một dòng điểm vào bảng điểm của ván chơi, MỘT lần cho một vòng.
 * Trả về `{ records, committed }` để trò ghi log chứ không im lặng: một câu đã trả
 * lời đúng rồi thì bấm lại không được cộng thêm điểm, và hai câu khác nhau (khác
 * `questionId`) vẫn là hai dòng.
 */
function commitAnswerRecord(records, turn, extra) {
  const list = Array.isArray(records) ? records : [];
  if (!turn || typeof turn !== 'object') return { records: list, committed: false };
  if (turn.committed) return { records: list, committed: false };
  if (turn.questionId && list.some(item => item && item.questionId === turn.questionId)) {
    return { records: list, committed: false };
  }
  list.push(answerTurnRecord(turn, extra));
  turn.committed = true;
  return { records: list, committed: true };
}

/** Điểm mà trò được quyền trả cho MỘT đáp án đúng, sau khi trừ phạt của Luyện tập. */
function answerTurnAward(turn, pointsForCorrect) {
  if (!turn || typeof turn !== 'object') return Math.max(0, Number(pointsForCorrect) || 0);
  if (turn.mode !== 'practice') return Math.max(0, Number(pointsForCorrect) || 0);
  return practicePointsFor(turn, pointsForCorrect);
}

if (typeof module !== 'undefined') module.exports = {
  beginAnswerTurn,
  registerAnswer,
  endAnswerTurn,
  answerTurnRecord,
  commitAnswerRecord,
  answerTurnAward
};
