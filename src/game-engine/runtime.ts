// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function scoreAnswer(question, selectedOptionId, elapsedSeconds = 0) {
  const correct = question.correctOptionId === selectedOptionId;
  const base = Number(question.points) || 100;
  const speedBonus = correct && elapsedSeconds <= 8 ? 20 : 0;
  return { correct, points: correct ? base + speedBonus : 0, speedBonus };
}
function calculateSummary(answers, questions) {
  const points = answers.reduce((sum, a) => sum + (Number(a.points) || 0), 0);
  const max = questions.reduce((sum, q) => sum + (Number(q.points) || 100) + 20, 0);
  return { points, max, percent: max ? Math.round(points / max * 100) : 0, correct: answers.filter(a => a.correct).length, total: questions.length };
}
if (typeof module !== 'undefined') module.exports = { scoreAnswer, calculateSummary };
