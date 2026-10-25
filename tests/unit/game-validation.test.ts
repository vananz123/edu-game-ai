import assert from 'node:assert/strict';
import { validateScenarioGame, validateMatchingGame, validateTreasureHuntGame, validateRaceGame } from '../../src/services/game-validation';

const { normalizeGame } = require('../../src/services/game-service');

const game = {
  template: 'scenario',
  questions: [
    {
      id: 'start',
      type: 'scenario',
      options: [
        { id: 'safe', text: 'Chọn cách an toàn', nextQuestionId: 'follow-up', scenarioScore: { safety: 60, reasoning: 25, harmReduction: 15 } },
        { id: 'end', text: 'Kết thúc', nextQuestionId: null, scenarioScore: { safety: 5, reasoning: 0, harmReduction: 0 } }
      ]
    },
    { id: 'follow-up', type: 'scenario', options: [{ id: 'a', text: 'Hành động A' }, { id: 'b', text: 'Hành động B' }] }
  ]
};

validateScenarioGame(game);
validateScenarioGame({ template: 'quiz', questions: [] });
assert.throws(() => validateScenarioGame({
  ...game,
  questions: [{ ...game.questions[0], options: [{ id: 'a', text: 'A', nextQuestionId: 'missing' }, { id: 'b', text: 'B' }] }]
}), /không tồn tại/);
assert.throws(() => validateScenarioGame({
  ...game,
  questions: [{ ...game.questions[0], options: [{ id: 'a', text: 'A', scenarioScore: { safety: 61 } }, { id: 'b', text: 'B' }] }]
}), /vượt giới hạn/);

// §4 ghép cặp — validateMatchingGame
const matching = {
  template: 'matching',
  matchingGame: {
    mode: 'columns',
    pairs: [
      { id: 'p1', left: 'Quang hợp', right: 'Thực vật dùng ánh sáng tổng hợp chất hữu cơ' },
      { id: 'p2', left: 'Hô hấp tế bào', right: 'Giải phóng năng lượng từ chất hữu cơ' }
    ],
    pointsPerPair: 100, completionBonus: 200, wrongPenalty: 0, timeBonus: 50, bonusUnderSeconds: 60, practiceMode: false
  }
};
validateMatchingGame(matching);
validateMatchingGame({ template: 'quiz' });
validateMatchingGame({ ...matching, matchingGame: { ...matching.matchingGame, mode: 'categorize' } });
assert.throws(() => validateMatchingGame({ template: 'matching' }), /dữ liệu cặp ghép/);
assert.throws(() => validateMatchingGame({ ...matching, matchingGame: { ...matching.matchingGame, mode: 'drag' } }), /không hợp lệ/);
assert.throws(() => validateMatchingGame({ ...matching, matchingGame: { ...matching.matchingGame, pairs: [matching.matchingGame.pairs[0]] } }), /ít nhất 2 cặp/);
assert.throws(() => validateMatchingGame({ ...matching, matchingGame: { ...matching.matchingGame, pairs: [
  { id: 'p1', left: 'A', right: 'R' }, { id: 'p1', left: 'B', right: 'S' }
] } }), /ID riêng/);
assert.throws(() => validateMatchingGame({ ...matching, matchingGame: { ...matching.matchingGame, pairs: [
  { id: 'p1', left: 'A', right: 'R' }, { id: 'p2', left: 'B', right: '' }
] } }), /cột A và cột B/);
assert.throws(() => validateMatchingGame({ ...matching, matchingGame: { ...matching.matchingGame, pairs: [
  { id: 'p1', left: 'A', right: 'R' }, { id: 'p2', left: 'B', right: 'r' }
] } }), /trùng lặp/);
assert.throws(() => validateMatchingGame({ ...matching, matchingGame: { ...matching.matchingGame, pairs: [
  { id: 'p1', left: 'A', right: 'R' }, { id: 'p2', left: 'A', right: 'S' }
] } }), /trùng lặp/);
// categorize: nhiều thẻ cùng nhóm là hợp lệ
validateMatchingGame({ ...matching, matchingGame: { ...matching.matchingGame, mode: 'categorize', pairs: [
  { id: 'p1', left: 'Động vật', right: 'Chó' }, { id: 'p2', left: 'Động vật', right: 'Mèo' }
] } });
assert.throws(() => validateMatchingGame({ ...matching, matchingGame: { ...matching.matchingGame, wrongPenalty: -1 } }), /0 đến 1000/);
assert.throws(() => validateMatchingGame({ ...matching, matchingGame: { ...matching.matchingGame, pointsPerPair: 9999 } }), /0 đến 1000/);

// normalizeGame giữ matchingGame khi lưu/import
const normalizedMatching = normalizeGame({ title: 'Ghép cặp quang hợp', template: 'matching', questions: [], matchingGame: matching.matchingGame });
assert.equal(normalizedMatching.matchingGame.mode, 'columns');
assert.equal(normalizedMatching.matchingGame.pairs.length, 2);
assert.equal(normalizedMatching.matchingGame.pairs[0].left, 'Quang hợp');
assert.equal(normalizedMatching.matchingGame.practiceMode, false);
const normalizedQuiz = normalizeGame({ title: 'Quiz', template: 'quiz', questions: [{ prompt: 'Q?', options: ['a', 'b'], correctOptionId: 'a' }] });
assert.equal(normalizedQuiz.matchingGame, undefined);

// §5 hành trình kho báu — validateTreasureHuntGame
const stage = (id, name, nextStageId = null): any => ({
  id, name, story: 'Câu chuyện', taskDescription: 'Làm nhiệm vụ',
  question: { prompt: 'Câu đố?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a', explanation: 'Vì A đúng.', hint: 'Gợi ý' },
  attempts: 0, points: 100, completionBonus: 200, nextStageId, hasHiddenItem: false
});
const treasure = {
  template: 'treasure-hunt',
  treasureHunt: {
    character: 'Nhà thám hiểm', intro: 'Bắt đầu', journeyBonus: 300, hiddenItemBonus: 50,
    stages: [stage('s1', 'Chặng một', 's2'), stage('s2', 'Chặng hai')]
  }
};
validateTreasureHuntGame(treasure);
validateTreasureHuntGame({ template: 'quiz' });
assert.throws(() => validateTreasureHuntGame({ template: 'treasure-hunt' }), /danh sách chặng/);
assert.throws(() => validateTreasureHuntGame({ ...treasure, treasureHunt: { ...treasure.treasureHunt, stages: [stage('s1', 'Chặng một')] } }), /ít nhất 2 chặng/);
assert.throws(() => validateTreasureHuntGame({ ...treasure, treasureHunt: { ...treasure.treasureHunt, stages: [stage('s1', 'Chặng một', 's9'), stage('s2', 'Chặng hai')] } }), /không tồn tại/);
assert.throws(() => validateTreasureHuntGame({ ...treasure, treasureHunt: { ...treasure.treasureHunt, stages: [stage('s1', 'Chặng một', 's2'), stage('s1', 'Chặng hai')] } }), /ID riêng/);
// vòng kín không có chặng kết thúc
assert.throws(() => validateTreasureHuntGame({ ...treasure, treasureHunt: { ...treasure.treasureHunt, stages: [stage('s1', 'Chặng một', 's2'), stage('s2', 'Chặng hai', 's1')] } }), new RegExp('ít nhất một chặng kết thúc'));
// nhánh phụ bắt buộc có nhãn và trỏ đúng
const branchStages = [stage('s1', 'Chặng một', 's2'), stage('s2', 'Chặng hai')];
branchStages[0] = { ...branchStages[0], branchStageId: 's2', branchLabel: 'Đi đường hầm' };
validateTreasureHuntGame({ ...treasure, treasureHunt: { ...treasure.treasureHunt, stages: branchStages } });
assert.throws(() => validateTreasureHuntGame({ ...treasure, treasureHunt: { ...treasure.treasureHunt, stages: [
  { ...branchStages[0], branchStageId: 's9' }, branchStages[1]
] } }), /không hợp lệ/);
assert.throws(() => validateTreasureHuntGame({ ...treasure, treasureHunt: { ...treasure.treasureHunt, stages: [
  { ...branchStages[0], branchStageId: 's2', branchLabel: '' }, branchStages[1]
] } }), /nhãn/);
// đáp án đúng phải nằm trong danh sách
assert.throws(() => validateTreasureHuntGame({ ...treasure, treasureHunt: { ...treasure.treasureHunt, stages: [
  { ...stage('s1', 'Chặng một', 's2'), question: { ...stage('s1', 'Chặng một').question, correctOptionId: 'z' } },
  stage('s2', 'Chặng hai')
] } }), /không nằm trong danh sách/);
// số lượt thử trong khoảng 0..99
assert.throws(() => validateTreasureHuntGame({ ...treasure, treasureHunt: { ...treasure.treasureHunt, stages: [
  { ...stage('s1', 'Chặng một', 's2'), attempts: -1 }, stage('s2', 'Chặng hai')
] } }), /không giới hạn/);
assert.throws(() => validateTreasureHuntGame({ ...treasure, treasureHunt: { ...treasure.treasureHunt, journeyBonus: 20000 } }), /0 đến 10000/);

// §5.2 variant missions (matching / decode / classification) are additive.
const variantStage = (id: string, mission: any, nextStageId: string | null = null): any => ({
  ...stage(id, `Chặng ${id}`, nextStageId),
  mission,
  question: {
    prompt: 'Nhiệm vụ của chặng',
    options: [],
    correctOptionId: '',
    explanation: 'Giải thích đáp án.',
    hint: 'Gợi ý'
  }
});
const variantTreasure = {
  template: 'treasure-hunt',
  treasureHunt: {
    ...treasure.treasureHunt,
    stages: [
      variantStage('v1', {
        type: 'matching',
        pairs: [{ id: 'p1', left: 'Quang hợp', right: 'Tổng hợp chất hữu cơ' }, { id: 'p2', left: 'Hô hấp', right: 'Giải phóng năng lượng' }]
      }, 'v2'),
      variantStage('v2', { type: 'decode', answer: 'quang hợp', cipher: 'hợp quang' })
    ]
  }
};
validateTreasureHuntGame(variantTreasure);
validateTreasureHuntGame({
  ...variantTreasure,
  treasureHunt: {
    ...variantTreasure.treasureHunt,
    stages: [
      variantStage('v1', {
        type: 'classification',
        groups: [{ id: 'g1', name: 'Thực vật' }, { id: 'g2', name: 'Động vật' }],
        items: [{ id: 'i1', text: 'Có diệp lục', groupId: 'g1' }, { id: 'i2', text: 'Có hệ thần kinh', groupId: 'g2' }]
      }, 'v2'),
      variantStage('v2', { type: 'decode', answer: 'quang hợp' })
    ]
  }
});
validateTreasureHuntGame({
  ...variantTreasure,
  treasureHunt: {
    ...variantTreasure.treasureHunt,
    stages: [
      { ...variantStage('v1', { type: 'scenario' }, 'v2'), question: stage('v1', 'Tình huống', 'v2').question },
      variantStage('v2', { type: 'decode', answer: 'quang hợp' })
    ]
  }
});
assert.throws(() => validateTreasureHuntGame({
  ...variantTreasure,
  treasureHunt: {
    ...variantTreasure.treasureHunt,
    stages: [variantStage('v1', { type: 'matching', pairs: [{ id: 'p1', left: 'A', right: 'B' }] }, 'v2'), variantStage('v2', { type: 'decode', answer: 'x' })]
  }
}), /2 đến 10 cặp/);
assert.throws(() => validateTreasureHuntGame({
  ...variantTreasure,
  treasureHunt: {
    ...variantTreasure.treasureHunt,
    stages: [variantStage('v1', { type: 'matching', pairs: [{ id: 'p1', left: 'A', right: 'B' }, { id: 'p1', left: 'C', right: 'D' }] }, 'v2'), variantStage('v2', { type: 'decode', answer: 'x' })]
  }
}), /ID riêng/);
assert.throws(() => validateTreasureHuntGame({
  ...variantTreasure,
  treasureHunt: {
    ...variantTreasure.treasureHunt,
    stages: [variantStage('v1', { type: 'decode', answer: '' }, 'v2'), variantStage('v2', { type: 'decode', answer: 'x' })]
  }
}), /1 đến 120 ký tự/);
assert.throws(() => validateTreasureHuntGame({
  ...variantTreasure,
  treasureHunt: {
    ...variantTreasure.treasureHunt,
    stages: [
      variantStage('v1', {
        type: 'classification',
        groups: [{ id: 'g1', name: 'Nhóm 1' }, { id: 'g2', name: 'Nhóm 2' }],
        items: [{ id: 'i1', text: 'Mục 1', groupId: 'missing' }, { id: 'i2', text: 'Mục 2', groupId: 'g2' }]
      }, 'v2'),
      variantStage('v2', { type: 'decode', answer: 'x' })
    ]
  }
}), /nhóm hợp lệ/);
const normalizedVariant = normalizeGame({ title: 'Hành trình biến thể', template: 'treasure-hunt', questions: [], treasureHunt: variantTreasure.treasureHunt });
assert.equal(normalizedVariant.treasureHunt.stages[0].mission.type, 'matching');
assert.equal(normalizedVariant.treasureHunt.stages[1].mission.answer, 'quang hợp');

// §6 đường đua tri thức — validateRaceGame
const raceQuestion = (id, difficulty) => ({
  id, prompt: 'Câu hỏi đua?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a', difficulty
});
const race = {
  template: 'race',
  race: {
    trackLength: 12, maxRounds: 6, stepByDifficulty: true, luckEnabled: true,
    teams: [{ id: 't1', name: 'Đội đỏ', icon: '🔴' }, { id: 't2', name: 'Đội xanh', icon: '🔵' }],
    cells: [{ cell: 6, type: 'boost', label: 'Tăng tốc' }],
    questions: [raceQuestion('rq1', 'dễ'), raceQuestion('rq2', 'trung bình'), raceQuestion('rq3', 'khó')]
  }
};
validateRaceGame(race);
validateRaceGame({ template: 'quiz' });
assert.throws(() => validateRaceGame({ template: 'race' }), /cấu hình đội/);
assert.throws(() => validateRaceGame({ ...race, race: { ...race.race, trackLength: 2 } }), /3 đến 100/);
assert.throws(() => validateRaceGame({ ...race, race: { ...race.race, maxRounds: 0 } }), /1 đến 50/);
assert.throws(() => validateRaceGame({ ...race, race: { ...race.race, teams: [race.race.teams[0]] } }), /ít nhất 2 đội/);
assert.throws(() => validateRaceGame({ ...race, race: { ...race.race, teams: [{ id: 't1', name: 'Đội A' }, { id: 't2', name: 'đội a' }] } }), /trùng nhau/);
assert.throws(() => validateRaceGame({ ...race, race: { ...race.race, teams: [{ id: 't1', name: 'Đội A' }, { id: 't1', name: 'Đội B' }] } }), /ID và tên riêng/);
assert.throws(() => validateRaceGame({ ...race, race: { ...race.race, cells: [{ cell: 6, type: 'boost' }, { cell: 6, type: 'lucky' }] } }), /cùng một ô/);
assert.throws(() => validateRaceGame({ ...race, race: { ...race.race, cells: [{ cell: 1, type: 'boost' }] } }), /2 đến hết đường đua/);
assert.throws(() => validateRaceGame({ ...race, race: { ...race.race, cells: [{ cell: 5, type: 'teleport' }] } }), /không hợp lệ/);
assert.throws(() => validateRaceGame({ ...race, race: { ...race.race, questions: [] } }), /ít nhất 1 câu hỏi/);
assert.throws(() => validateRaceGame({ ...race, race: { ...race.race, questions: [raceQuestion('rq1', 'dễ'), raceQuestion('rq1', 'dễ')] } }), /ID riêng/);
assert.throws(() => validateRaceGame({ ...race, race: { ...race.race, questions: [{ ...raceQuestion('rq1', 'dễ'), correctOptionId: 'z' }] } }), /không nằm trong danh sách/);
assert.throws(() => validateRaceGame({ ...race, race: { ...race.race, questions: [{ ...raceQuestion('rq1', 'siêu khó'), correctOptionId: 'a' }] } }), /Độ khó/);
assert.throws(() => validateRaceGame({ ...race, race: { ...race.race, stepByDifficulty: 'yes' } }), /true hoặc false/);

// normalizeGame giữ treasureHunt và race khi lưu/import
const normalizedHunt = normalizeGame({ title: 'Hành trình', template: 'treasure-hunt', questions: [], treasureHunt: treasure.treasureHunt });
assert.equal(normalizedHunt.treasureHunt.stages.length, 2);
const normalizedRace = normalizeGame({ title: 'Đường đua', template: 'race', questions: [], race: race.race });
assert.equal(normalizedRace.race.trackLength, 12);
assert.equal(normalizedRace.race.teams.length, 2);

// .egame round-trip mirror of files:export-game → files:import-game for §5/§6
const runImportChecks = (game) => {
  if (!game || typeof game.title !== 'string' || !Array.isArray(game.questions)) throw new Error('Tệp không phải gói trò chơi hợp lệ.');
  validateScenarioGame(game);
  validateMatchingGame(game);
  validateTreasureHuntGame(game);
  validateRaceGame(game);
};
const huntPackage = JSON.parse(JSON.stringify({ packageFormat: 'edugame', packageVersion: 1, game: { title: 'Gói hành trình', template: 'treasure-hunt', questions: [], treasureHunt: treasure.treasureHunt } }));
assert.equal(huntPackage.packageFormat, 'edugame');
runImportChecks(huntPackage.game);
assert.deepEqual(huntPackage.game.treasureHunt, treasure.treasureHunt);
const variantPackage = JSON.parse(JSON.stringify({ packageFormat: 'edugame', packageVersion: 1, game: { title: 'Gói biến thể', template: 'treasure-hunt', questions: [], treasureHunt: variantTreasure.treasureHunt } }));
runImportChecks(variantPackage.game);
assert.deepEqual(variantPackage.game.treasureHunt, variantTreasure.treasureHunt);
const racePackage = JSON.parse(JSON.stringify({ packageFormat: 'edugame', packageVersion: 1, game: { title: 'Gói đường đua', template: 'race', questions: [], race: race.race } }));
runImportChecks(racePackage.game);
assert.deepEqual(racePackage.game.race, race.race);
// corrupted hunt package is rejected by the same import path
assert.throws(() => runImportChecks({ ...huntPackage.game, treasureHunt: { ...huntPackage.game.treasureHunt, stages: huntPackage.game.treasureHunt.stages.slice(0, 1) } }), /ít nhất 2 chặng/);
// corrupted race package is rejected by the same import path
assert.throws(() => runImportChecks({ ...racePackage.game, race: { ...racePackage.game.race, teams: racePackage.game.race.teams.slice(0, 1) } }), /ít nhất 2 đội/);

console.log('Game validation tests passed');
