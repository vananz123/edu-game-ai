// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const SCORING_MODES = ['cơ bản', 'tốc độ', 'theo độ khó', 'thi đấu đội', 'luyện tập'];
function resolveScoring(gameSetup) {
  const setup = gameSetup && typeof gameSetup === 'object' ? gameSetup : {};
  const mode = SCORING_MODES.includes(String(setup.scoringMode)) ? String(setup.scoringMode) : 'tốc độ';
  const bonusRaw = Number(setup.timeBonus);
  const timeBonus = Number.isFinite(bonusRaw) ? Math.min(50, Math.max(0, bonusRaw)) : 20;
  const table = {
    'dễ': Math.max(0, Number(setup.pointsEasy) || 100),
    'trung bình': Math.max(0, Number(setup.pointsMedium) || 200),
    'khó': Math.max(0, Number(setup.pointsHard) || 300)
  };
  return { mode, timeBonus, table };
}
function questionPoints(question, scoring) {
  const difficulty = question && question.difficulty;
  if (scoring && scoring.mode === 'theo độ khó' && difficulty && scoring.table[difficulty] != null) return scoring.table[difficulty];
  return Math.max(0, Number(question && question.points) || 100);
}
function scoreAnswer(question, selectedOptionId, elapsedSeconds = 0, gameSetup) {
  const correct = question.correctOptionId === selectedOptionId;
  const scoring = resolveScoring(gameSetup);
  const base = questionPoints(question, scoring);
  const speedBonus = correct && scoring.mode === 'tốc độ' && elapsedSeconds <= 8 ? scoring.timeBonus : 0;
  return { correct, points: correct ? base + speedBonus : 0, speedBonus };
}
function normalizeTextAnswer(value) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}
function isTextQuestion(question) {
  const type = question && question.type;
  return type === 'fill-in-blank' || type === 'short-answer';
}
function scoreTextAnswer(question, answerText, elapsedSeconds = 0, gameSetup) {
  const expected = Array.isArray(question.alternateAnswers) && question.alternateAnswers.length
    ? [question.correctAnswer, ...question.alternateAnswers]
    : [question.correctAnswer];
  const normalized = normalizeTextAnswer(answerText);
  const correct = normalized.length > 0 && expected.some(value => normalizeTextAnswer(value) === normalized);
  const scoring = resolveScoring(gameSetup);
  const base = questionPoints(question, scoring);
  const speedBonus = correct && scoring.mode === 'tốc độ' && elapsedSeconds <= 8 ? scoring.timeBonus : 0;
  return { correct, points: correct ? base + speedBonus : 0, speedBonus };
}
function calculateSummary(answers, questions, gameSetup) {
  const scoring = resolveScoring(gameSetup);
  const points = answers.reduce((sum, a) => sum + (Number(a.points) || 0), 0);
  const max = questions.reduce((sum, q) => sum + questionPoints(q, scoring) + (scoring.mode === 'tốc độ' ? scoring.timeBonus : 0), 0);
  return { points, max, percent: max ? Math.round(points / max * 100) : 0, correct: answers.filter(a => a.correct).length, total: questions.length };
}
function scoreScenarioDecision(option) {
  const score = option && option.scenarioScore || {};
  const safety = clampScore(score.safety, 60);
  const reasoning = clampScore(score.reasoning, 25);
  const harmReduction = clampScore(score.harmReduction, 15);
  return {
    points: safety + reasoning + harmReduction,
    max: 100,
    breakdown: { safety, reasoning, harmReduction }
  };
}
function calculateScenarioSummary(answers) {
  const points = answers.reduce((sum, answer) => sum + (Number(answer.points) || 0), 0);
  const max = answers.length * 100;
  return {
    points,
    max,
    percent: max ? Math.round(points / max * 100) : 0,
    correct: answers.filter(answer => answer.correct).length,
    total: answers.length
  };
}
function resolveScenarioTransition(option, currentIndex, questions) {
  if (option?.endsScenario === true) return undefined;
  if (typeof option?.nextQuestionId === 'string' && option.nextQuestionId.trim()) {
    const targetIndex = questions.findIndex(question => question.id === option.nextQuestionId);
    if (targetIndex < 0) throw new Error(`Không tìm thấy tình huống tiếp theo: ${option.nextQuestionId}`);
    return targetIndex;
  }
  // `null`/omitted is "no explicit branch", not "stop here". Generated scenarios
  // often set null on every option; treating that as terminal ended the game
  // after situation 1. Only running past the last situation ends the scenario.
  return currentIndex + 1 < questions.length ? currentIndex + 1 : undefined;
}
function calculateMatchingSummary(pairCount, matchedCount, wrongAttempts, elapsedSeconds, config) {
  const pairs = Math.max(0, Number(pairCount) || 0);
  const matched = Math.min(pairs, Math.max(0, Number(matchedCount) || 0));
  const wrong = Math.max(0, Number(wrongAttempts) || 0);
  const pointsPerPair = clampScore(config && config.pointsPerPair, 1000) || 100;
  const completionBonus = clampScore(config && config.completionBonus, 10_000);
  const timeBonus = clampScore(config && config.timeBonus, 10_000);
  const bonusUnderSeconds = clampScore(config && config.bonusUnderSeconds, 86_400);
  const practiceMode = Boolean(config && config.practiceMode);
  const completed = pairs > 0 && matched === pairs;
  const earnedTimeBonus = completed && elapsedSeconds <= bonusUnderSeconds ? timeBonus : 0;
  const maximum = pairs * pointsPerPair + completionBonus + timeBonus;
  const points = Math.max(0,
    matched * pointsPerPair +
    (completed ? completionBonus + earnedTimeBonus : 0) -
    (practiceMode ? 0 : wrong * clampScore(config && config.wrongPenalty, 1000))
  );
  return {
    points,
    max: maximum,
    percent: maximum ? Math.round(points / maximum * 100) : 0,
    correct: matched,
    total: pairs,
    wrongAttempts: wrong,
    elapsedSeconds: Math.max(0, Math.round(Number(elapsedSeconds) || 0))
  };
}
function clampScore(value, max) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(0, numeric)) : 0;
}
function questionFingerprint(question) {
  const type = (question && question.type) || 'multiple-choice';
  const answerKey = isTextQuestion(question)
    ? normalizeTextAnswer(question.correctAnswer)
    : String((question && question.correctOptionId) || '');
  const optionsKey = isTextQuestion(question)
    ? ''
    : (Array.isArray(question && question.options) ? question.options : [])
        .map(option => normalizeTextAnswer(option.text)).join('~');
  return `${normalizeTextAnswer(question && question.prompt)}|${type}|${answerKey}|${optionsKey}`;
}
function dedupeImportedQuestions(importedQuestions, existingQuestions) {
  const seen = new Set((existingQuestions || []).map(questionFingerprint));
  const unique = [];
  let skipped = 0;
  (importedQuestions || []).forEach(question => {
    const key = questionFingerprint(question);
    if (seen.has(key)) { skipped += 1; return; }
    seen.add(key);
    unique.push(question);
  });
  return { unique, skipped };
}
if (typeof module !== 'undefined') module.exports = {
  scoreAnswer,
  scoreTextAnswer,
  normalizeTextAnswer,
  isTextQuestion,
  questionFingerprint,
  dedupeImportedQuestions,
  calculateSummary,
  resolveScoring,
  questionPoints,
  SCORING_MODES,
  scoreScenarioDecision,
  calculateScenarioSummary,
  resolveScenarioTransition,
  calculateMatchingSummary
};
