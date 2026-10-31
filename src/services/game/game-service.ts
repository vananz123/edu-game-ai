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
    const difficulty = ['dễ', 'trung bình', 'khó'].includes(q.difficulty) ? q.difficulty : undefined;
    return {
      id: String(q.id || `q${i + 1}`),
      type: q.type === 'scenario' ? 'scenario' : 'multiple-choice',
      prompt: String(q.prompt || ''),
      options,
      correctOptionId,
      explanation: String(q.explanation || ''),
      points: Math.max(0, Number(q.points) || 100),
      ...(difficulty ? { difficulty } : {})
    };
  });
  let gameSetup;
  if (game.gameSetup && typeof game.gameSetup === 'object' && !Array.isArray(game.gameSetup)) {
    const entries = Object.entries(game.gameSetup)
      .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
      .map(([k, v]) => [String(k).slice(0, 40), String(v).slice(0, 200)]);
    if (entries.length) gameSetup = Object.fromEntries(entries);
  }
  let matchingGame;
  if (game.matchingGame && typeof game.matchingGame === 'object' && !Array.isArray(game.matchingGame)) {
    const m = game.matchingGame;
    const pairs = Array.isArray(m.pairs)
      ? m.pairs.map((p, i) => ({ id: String(p?.id || `p${i + 1}`), left: String(p?.left || ''), right: String(p?.right || '') }))
      : [];
    matchingGame = {
      mode: ['columns', 'memory', 'categorize'].includes(String(m.mode)) ? String(m.mode) : 'columns',
      pairs,
      pointsPerPair: Math.max(0, Number(m.pointsPerPair) || 100),
      completionBonus: Math.max(0, Number(m.completionBonus) || 0),
      wrongPenalty: Math.max(0, Number(m.wrongPenalty) || 0),
      timeBonus: Math.max(0, Number(m.timeBonus) || 0),
      bonusUnderSeconds: Math.max(0, Number(m.bonusUnderSeconds) || 60),
      practiceMode: Boolean(m.practiceMode)
    };
  }
  let treasureHunt;
  if (game.treasureHunt && typeof game.treasureHunt === 'object' && !Array.isArray(game.treasureHunt)) {
    treasureHunt = game.treasureHunt;
  }
  let race;
  if (game.race && typeof game.race === 'object' && !Array.isArray(game.race)) {
    race = game.race;
  }
  return {
    id: game.id || `game_${crypto.randomUUID()}`,
    title: game.title.trim(),
    subject: String(game.subject || ''),
    grade: String(game.grade || ''),
    topic: String(game.topic || ''),
    template: ['quiz', 'scenario', 'matching', 'treasure-hunt', 'race'].includes(game.template) ? game.template : 'quiz',
    description: String(game.description || ''),
    questions,
    tags: Array.isArray(game.tags) ? game.tags : [],
    sourceName: String(game.sourceName || ''),
    createdAt: game.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(gameSetup ? { gameSetup } : {}),
    ...(matchingGame ? { matchingGame } : {}),
    ...(treasureHunt ? { treasureHunt } : {}),
    ...(race ? { race } : {})
  };
}

module.exports = { normalizeGame };
