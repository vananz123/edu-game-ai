// @ts-nocheck -- pure "cách trả lời" law (DECISIONS #209); the renderer reads these as globals, unit tests require them.
/* Ba chế độ trả lời dùng chung cho Đấu trường, Tình huống, Kho báu và Đường đua.
   Chế độ được lưu NGAY TRONG gameSetup.scoringMode với giá trị có tiền tố
   'tra-loi:' — chủ dự án chốt dùng MỘT trường duy nhất, không thêm field mới.
   Năm giá trị Việt cũ ('cơ bản' … 'luyện tập') vì thế nghĩa là "giữ hành vi
   hiện tại", nên game đã lưu không đổi luật chơi.
   Tiền tố ASCII không dấu là bắt buộc: arenaScoringFromLabel
   (src/services/game/game-project-adapter.ts) khớp chuỗi con theo 'tốc'/'khó'/
   'đội'/'luyện', nên một giá trị có dấu sẽ bị đọc nhầm thành chế độ tính điểm cũ. */
const ANSWER_MODE_PREFIX = 'tra-loi:';
const ANSWER_MODE_COMPETITIVE = 'tra-loi:thi-dau';
const ANSWER_MODE_PRACTICE = 'tra-loi:luyen-tap';
const ANSWER_MODE_CHALLENGE = 'tra-loi:thu-thach';
const ANSWER_MODE_KEYS = {
  'tra-loi:thi-dau': 'competitive',
  'tra-loi:luyen-tap': 'practice',
  'tra-loi:thu-thach': 'challenge'
};
const ANSWER_MODE_VALUES = {
  competitive: ANSWER_MODE_COMPETITIVE,
  practice: ANSWER_MODE_PRACTICE,
  challenge: ANSWER_MODE_CHALLENGE
};
const ANSWER_MODE_LABELS = {
  competitive: 'Thi đấu',
  practice: 'Luyện tập',
  challenge: 'Thử thách',
  legacy: 'Giữ hành vi hiện tại'
};
const ANSWER_MODE_HINTS = {
  competitive: 'Trả lời một lần. Sai thì mở đáp án đúng và kết thúc câu.',
  practice: 'Sai được thử lại. Mỗi lần sai bớt 10% điểm của câu đó, không dưới 0.',
  challenge: 'Trả lời một lần. Sai thì KHÔNG mở đáp án, phải tự sang câu.',
  legacy: 'Trò chơi tạo trước bản cập nhật này: giữ đúng cách chấm, cách lộ đáp án và giải thích như đang chơi.'
};
const PRACTICE_PENALTY_RATE = 0.1;

function isAnswerModeValue(value) {
  return Object.prototype.hasOwnProperty.call(ANSWER_MODE_KEYS, String(value || ''));
}

/** 'legacy' khi game chưa có chế độ mới — mọi caller phải đối xử như hành vi cũ. */
function answerModeKeyForValue(value) {
  return ANSWER_MODE_KEYS[String(value || '')] || 'legacy';
}

function answerModeKey(setup) {
  return answerModeKeyForValue(setup && typeof setup === 'object' ? setup.scoringMode : '');
}

/* Bốn trò dùng chung ba cách trả lời (DECISIONS #209). Ghép cặp ở lại với luật phạt
   theo số cặp sai của nó, nên danh sách này là giới hạn duy nhất: editor, wizard và
   adapter đều hỏi nó thay vì tự liệt kê template. */
const ANSWER_MODE_TEMPLATES = ['quiz', 'scenario', 'treasure-hunt', 'race'];

function answerModeSupportsTemplate(template) {
  return ANSWER_MODE_TEMPLATES.indexOf(String(template || '')) !== -1;
}

/** Ghép cặp giữ luật riêng (phạt theo tổng số cặp sai), nên không nhận chế độ mới. */
function answerModeForGame(game) {
  if (!answerModeSupportsTemplate(game && game.template)) return 'legacy';
  return answerModeKey(game && game.gameSetup);
}

/* Giá trị scoringMode "của luật cũ": chính nó khi chưa đổi sang cách trả lời, ngược lại
   là phần đã cất ở `legacyScoringMode`. Nhờ vậy "Giữ hành vi hiện tại" hoàn nguyên đúng
   (kể cả 'tốc độ' với điểm thưởng nhanh) thay vì âm thầm về 'cơ bản'. */
function legacyScoringModeOf(setup) {
  if (!setup || typeof setup !== 'object') return '';
  const value = String(setup.scoringMode || '');
  if (!isAnswerModeValue(value)) return value;
  return String(setup.legacyScoringMode || '');
}

/* Bảng hành vi. 'retryOnWrong' là điểm khác biệt duy nhất của Luyện tập ở tầng
   điều khiển; 'revealOnWrong' và 'lockOnWrong' là hai thứ Thi đấu/Thử thách
   thực sự khác nhau (cùng khoá sau lần trả lời đầu). */
function answerRules(mode) {
  const table = {
    legacy: { retryOnWrong: false, revealOnWrong: true, lockOnWrong: true, countWrongAsFinish: true },
    competitive: { retryOnWrong: false, revealOnWrong: true, lockOnWrong: true, countWrongAsFinish: true },
    practice: { retryOnWrong: true, revealOnWrong: false, lockOnWrong: false, countWrongAsFinish: false },
    challenge: { retryOnWrong: false, revealOnWrong: false, lockOnWrong: true, countWrongAsFinish: true }
  };
  return table[mode] || table.legacy;
}

/** Trần điểm của MỘT câu — cơ số duy nhất được phép trừ phạt Luyện tập. */
function questionMaxPoints(question, setup) {
  const own = Number(question && question.points);
  if (Number.isFinite(own) && own > 0) return own;
  const perCorrect = Number(setup && setup.pointsPerCorrect);
  if (Number.isFinite(perCorrect) && perCorrect > 0) return perCorrect;
  return 100;
}

/** Luyện tập: mỗi lần sai -10% trần điểm câu, sàn 0. Không trừ vào tổng đã cộng. */
function practiceAward(maxPoints, wrongAttempts) {
  const base = Math.max(0, Number(maxPoints) || 0);
  const hits = Math.max(0, Math.trunc(Number(wrongAttempts) || 0));
  return Math.max(0, Math.round(base * (1 - PRACTICE_PENALTY_RATE * hits)));
}

/* 'finished' = câu/lượt đã kết thúc theo luật riêng của trò (hết lượt ở Kho báu,
   hết một lượt trả lời ở Đường đua). Thử thách không bao giờ mở lời giải sau câu sai. */
function explanationAllowed(mode, situation) {
  const state = situation || {};
  if (mode === 'practice') return Boolean(state.correct || state.finished);
  if (mode === 'challenge') return Boolean(state.correct);
  return Boolean(state.finished);
}

/** value = token lưu trong gameSetup.scoringMode; '' = "giữ hành vi hiện tại". */
function answerModeOptions(includeLegacy) {
  const list = ['competitive', 'practice', 'challenge'].map(key => ({
    value: ANSWER_MODE_VALUES[key],
    label: ANSWER_MODE_LABELS[key],
    hint: ANSWER_MODE_HINTS[key]
  }));
  if (!includeLegacy) return list;
  return [{ value: '', label: ANSWER_MODE_LABELS.legacy, hint: ANSWER_MODE_HINTS.legacy }].concat(list);
}

function answerModeLabel(mode) {
  return ANSWER_MODE_LABELS[mode] || ANSWER_MODE_LABELS.legacy;
}

function answerModeHint(mode) {
  return ANSWER_MODE_HINTS[mode] || ANSWER_MODE_HINTS.legacy;
}

if (typeof module !== 'undefined') module.exports = {
  ANSWER_MODE_PREFIX,
  ANSWER_MODE_COMPETITIVE,
  ANSWER_MODE_PRACTICE,
  ANSWER_MODE_CHALLENGE,
  ANSWER_MODE_KEYS,
  ANSWER_MODE_VALUES,
  ANSWER_MODE_TEMPLATES,
  PRACTICE_PENALTY_RATE,
  isAnswerModeValue,
  answerModeKeyForValue,
  answerModeKey,
  answerModeForGame,
  answerModeSupportsTemplate,
  legacyScoringModeOf,
  answerRules,
  questionMaxPoints,
  practiceAward,
  explanationAllowed,
  answerModeOptions,
  answerModeLabel,
  answerModeHint
};
