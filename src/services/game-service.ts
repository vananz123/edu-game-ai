// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const crypto = require('node:crypto');

function normalizeGame(game) {
  if (!game || typeof game.title !== 'string' || !Array.isArray(game.questions)) {
    throw new Error('Game không đúng cấu trúc.');
  }
  const questions = game.questions.map((q, i) => {
    const options = (q.options || []).map((o, j) => typeof o === 'string'
      ? { id: String.fromCharCode(97 + j), text: o }
      : { id: String(o.id || String.fromCharCode(97 + j)), text: String(o.text || '') });
    const correctOptionId = options.some(o => o.id === q.correctOptionId) ? q.correctOptionId : options[0]?.id;
    return {
      id: String(q.id || `q${i + 1}`),
      type: q.type === 'scenario' ? 'scenario' : 'multiple-choice',
      prompt: String(q.prompt || ''),
      options,
      correctOptionId,
      explanation: String(q.explanation || ''),
      points: Math.max(0, Number(q.points) || 100)
    };
  });
  return {
    id: game.id || `game_${crypto.randomUUID()}`,
    title: game.title.trim(),
    subject: String(game.subject || ''),
    grade: String(game.grade || ''),
    topic: String(game.topic || ''),
    template: ['quiz', 'scenario', 'matching'].includes(game.template) ? game.template : 'quiz',
    description: String(game.description || ''),
    questions,
    tags: Array.isArray(game.tags) ? game.tags : [],
    sourceName: String(game.sourceName || ''),
    createdAt: game.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

module.exports = { normalizeGame };
