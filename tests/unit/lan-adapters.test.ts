// @ts-nocheck -- unit tests share one global script scope (moduleDetection: legacy), as the other suites do.
// LAN Classroom Mode scoring must equal the desktop's, question for question.
//
// Two kinds of assertion here:
//   1. Behaviour — LAN rounds are scored by runtime.ts, so answers match the
//      desktop's `chooseAnswer()` branches (quiz, text, scenario, treasure).
//   2. Drift guard — the play surface (`renderer/features/games/*.ts`, split from
//      `gameplay.ts` in DECISIONS #147) cannot be imported (renderer scripts have
//      no exports), so the treasure constants are asserted against the raw text
//      of every file. If someone changes the desktop formula, this test fails
//      instead of the projector and the phones quietly reporting different scores.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  lanProfileFor, buildLanPlan, lanMaxPoints, lanDefaultTeams, scenarioIsLinear, lanRankPlayers, TREASURE_DEFAULTS
} = require('../../src/lan/lan-adapters');
const { scoreAnswer, scoreTextAnswer } = require('../../src/game-engine/runtime');

const ROOT = path.join(__dirname, '..', '..', '..');
const GAMEPLAY_DIR = path.join(ROOT, 'src', 'renderer', 'features', 'games');
const GAMEPLAY = fs.readdirSync(GAMEPLAY_DIR)
  .filter(name => name.endsWith('.ts'))
  .sort()
  .map(name => fs.readFileSync(path.join(GAMEPLAY_DIR, name), 'utf8'))
  .join('\n');

let passed = 0;
function it(name, fn) {
  fn();
  passed += 1;
}

function quiz(overrides) {
  return Object.assign({
    id: 'g-quiz',
    title: 'Synthetic quiz',
    template: 'quiz',
    questions: [
      {
        id: 'q1', type: 'multiple-choice', prompt: 'Synthetic 1?',
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
        correctOptionId: 'a', explanation: '', points: 100, difficulty: 'dễ'
      },
      {
        id: 'q2', type: 'fill-in-blank', prompt: 'Synthetic 2?',
        options: [],
        correctOptionId: '', correctAnswer: 'Paris', alternateAnswers: ['Pa ri'],
        explanation: '', points: 100, hint: ''
      }
    ],
    gameSetup: { scoringMode: 'cơ bản' }
  }, overrides || {});
}

function treasure(stages, huntOverrides) {
  return {
    id: 'g-treasure',
    title: 'Synthetic journey',
    template: 'treasure-hunt',
    questions: [],
    treasureHunt: Object.assign({
      character: 'explorer',
      intro: '',
      journeyBonus: 300,
      hiddenItemBonus: 50,
      stages
    }, huntOverrides || {})
  };
}

function stage(index, overrides) {
  return Object.assign({
    id: `s${index}`,
    name: `Chặng ${index}`,
    story: 'Synthetic story',
    taskDescription: 'Synthetic task',
    question: {
      prompt: `Synthetic stage ${index}?`,
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      correctOptionId: 'a',
      explanation: '',
      hint: ''
    },
    attempts: 1,
    points: 100,
    completionBonus: 50,
    nextStageId: null
  }, overrides || {});
}

it('quiz rounds are scored by the same runtime helpers as the desktop', () => {
  const game = quiz();
  const plan = buildLanPlan(game);
  assert.ok(plan, 'a quiz with questions must be LAN-supported');
  assert.equal(plan.engine, 'quiz');
  assert.equal(plan.rounds.length, 2);

  const expected = scoreAnswer(game.questions[0], 'a', 0, game.gameSetup);
  assert.deepEqual(plan.rounds[0].score('a', ''), expected);
  assert.deepEqual(plan.rounds[0].score('b', ''), scoreAnswer(game.questions[0], 'b', 0, game.gameSetup));
  assert.deepEqual(plan.rounds[1].score(null, ' paris '), scoreTextAnswer(game.questions[1], ' paris ', 0, game.gameSetup));
  assert.equal(plan.rounds[1].score(null, ' paris ').correct, true);
  assert.equal(plan.rounds[1].score(null, 'london').correct, false);
});

it('"tốc độ" becomes "cơ bản": no speed bonus, but the same base points', () => {
  const game = quiz({ gameSetup: { scoringMode: 'tốc độ', timeBonus: '30' } });
  const plan = buildLanPlan(game);
  assert.equal(plan.scoringMode, 'cơ bản');
  assert.match(plan.scoringNote, /không tính thưởng tốc độ/);
  // Desktop with a 0s elapsed would award 130; LAN deliberately awards 100 because
  // a pupil's phone cannot score the teacher's stopwatch.
  assert.equal(plan.rounds[0].score('a', '').points, 100);
  assert.equal(plan.rounds[0].score('a', '').speedBonus, 0);
  assert.equal(plan.rounds[0].maxPoints, 100, 'the projector bar must use the LAN value');
  assert.equal(scoreAnswer(game.questions[0], 'a', 0, game.gameSetup).points, 130, 'the desktop is unchanged');
});

it('other scoring modes pass through to the shared helpers untouched', () => {
  for (const mode of ['cơ bản', 'thi đấu đội', 'luyện tập']) {
    const game = quiz({ gameSetup: { scoringMode: mode } });
    assert.equal(buildLanPlan(game).scoringMode, mode, mode);
    assert.equal(buildLanPlan(game).rounds[0].score('a', '').points, 100, mode);
    assert.equal(buildLanPlan(game).scoringNote, '', mode);
  }
  // An absent mode keeps the desktop default ('tốc độ' -> LAN 'cơ bản').
  assert.equal(buildLanPlan(quiz({ gameSetup: {} })).scoringMode, 'cơ bản');
});

it('"theo độ khó" uses the configured table', () => {
  const game = quiz({ gameSetup: { scoringMode: 'theo độ khó', pointsEasy: '90', pointsMedium: '180', pointsHard: '270' } });
  assert.equal(buildLanPlan(game).rounds[0].score('a', '').points, 90);
});

it('treasure stages award points + completionBonus, like treasureRecordStage()', () => {
  const game = treasure([stage(1, { points: 120, completionBonus: 30 })]);
  const plan = buildLanPlan(game);
  assert.equal(plan.engine, 'treasure');
  assert.deepEqual(plan.rounds[0].score('a', ''), { correct: true, points: 150 });
  assert.deepEqual(plan.rounds[0].score('b', ''), { correct: false, points: 0 });
});

it('a stage with zero configured points keeps the desktop 100/200 denominator', () => {
  const game = treasure([stage(1, { points: 0, completionBonus: 0 })], { journeyBonus: 0, hiddenItemBonus: 0 });
  // Desktop: (100||100)+(200||200) = 300. Note `journeyBonus: 0` also falls
  // through `|| 300`, so the desktop denominator is 300 + 300 = 600.
  assert.equal(lanMaxPoints(game), 600, 'renderTreasureResults() uses || defaults for zero too');
  assert.equal(buildLanPlan(game).rounds[0].maxPoints, 0, 'but the award itself is points+completionBonus');
});

it('journey and hidden-item bonuses are in the LAN maximum', () => {
  const game = treasure([stage(1), stage(2, { hasHiddenItem: true })], { journeyBonus: 500, hiddenItemBonus: 70 });
  // (100+50) + (100+50) + 500 + 70
  assert.equal(lanMaxPoints(game), 870);
});

it('treasure max applies || fallbacks exactly like the desktop', () => {
  // `journeyBonus: 0` and `hiddenItemBonus: 0` are falsy, so the desktop still adds
  // 300/50 per hidden item. LAN must replicate that, not "fix" it.
  assert.equal(lanMaxPoints(treasure([stage(1)], { journeyBonus: 0, hiddenItemBonus: 0 })), 150 + 300);
  const unset = treasure([stage(1)], { journeyBonus: undefined, hiddenItemBonus: undefined });
  assert.equal(lanMaxPoints(unset), 150 + TREASURE_DEFAULTS.journeyBonus);
  const withItem = treasure([stage(1, { hasHiddenItem: true })], { journeyBonus: 0, hiddenItemBonus: 0 });
  assert.equal(lanMaxPoints(withItem), 150 + 300 + 50, 'a hidden item still earns the 50 fallback');
});

it('mission types LAN cannot run are reported, not silently dropped', () => {
  const game = treasure([
    stage(1),
    stage(2, { mission: { type: 'matching', pairs: [] } }),
    stage(3, { mission: { type: 'multiple-choice' } })
  ]);
  const profile = lanProfileFor(game);
  assert.equal(profile.supported, true);
  assert.equal(profile.roundCount, 2);
  assert.equal(profile.unsupportedRounds, 1);
  assert.match(profile.reason, /1 chặng/);
});

it('a journey made only of unsupported missions is not LAN-supported', () => {
  const game = treasure([stage(1, { mission: { type: 'decode', answer: 'X' } })]);
  const profile = lanProfileFor(game);
  assert.equal(profile.supported, false);
  assert.match(profile.reason, /ghép cặp \/ giải mã \/ phân loại/);
  assert.equal(buildLanPlan(game), null);
});

it('matching and race are refused with a readable reason', () => {
  assert.equal(lanProfileFor({ template: 'matching', matchingGame: { pairs: [] } }).supported, false);
  assert.match(lanProfileFor({ template: 'matching' }).reason, /Ghép cặp/);
  assert.match(lanProfileFor({ template: 'race', race: {} }).reason, /Đường đua/);
  assert.equal(buildLanPlan({ template: 'race', race: {} }), null);
  assert.equal(lanProfileFor(null).supported, false);
});

it('a branching scenario is refused because pupils would diverge', () => {
  const branching = {
    id: 'g-scn',
    title: 'Synthetic scenario',
    template: 'scenario',
    questions: [
      {
        id: 'q1', type: 'scenario', prompt: 'Synthetic?',
        // `nextQuestionId` is the real branch field (runtime.ts resolveScenarioTransition).
        options: [
          { id: 'a', text: 'A', nextQuestionId: 'q2' },
          { id: 'b', text: 'B', endsScenario: true }
        ],
        correctOptionId: 'a', explanation: '', points: 100
      },
      { id: 'q2', type: 'scenario', prompt: 'Synthetic 2?', options: [{ id: 'a', text: 'A' }], correctOptionId: 'a', explanation: '', points: 100 }
    ]
  };
  const profile = lanProfileFor(branching);
  assert.equal(profile.supported, false);
  assert.match(profile.reason, /nhiều nhánh/);
  assert.equal(scenarioIsLinear(branching.questions, true), false);
});

it('a dangling nextQuestionId refuses LAN instead of throwing mid-lesson', () => {
  const broken = [{
    id: 'q1', type: 'scenario', prompt: 'Synthetic?',
    options: [{ id: 'a', text: 'A', nextQuestionId: 'missing-id' }],
    correctOptionId: 'a', explanation: '', points: 100
  }];
  assert.equal(scenarioIsLinear(broken, true), false);
});

it('a scenario that moves straight on is LAN-supported', () => {
  const linear = {
    id: 'g-scn2',
    title: 'Synthetic scenario',
    template: 'scenario',
    questions: [
      { id: 'q1', type: 'scenario', prompt: 'Synthetic?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a', explanation: '', points: 100 },
      { id: 'q2', type: 'scenario', prompt: 'Synthetic 2?', options: [{ id: 'a', text: 'A' }], correctOptionId: 'a', explanation: '', points: 100 }
    ]
  };
  assert.equal(scenarioIsLinear(linear.questions, true), true);
  assert.equal(lanProfileFor(linear).supported, true);
});

it('scenario answers with scenarioScore are graded by scoreScenarioDecision', () => {
  const game = {
    id: 'g-scn3',
    title: 'Synthetic scenario',
    template: 'scenario',
    questions: [{
      id: 'q1', type: 'scenario', prompt: 'Synthetic?',
      options: [
        // Rubric scores are raw 0..60 / 0..25 / 0..15 and sum to the award.
        { id: 'a', text: 'A', scenarioScore: { safety: 55, reasoning: 20, harmReduction: 10 } },
        // A rubric-scored option that is NOT the answer key: desktop still shows
        // the rubric points but records `correct: false`.
        { id: 'b', text: 'B', scenarioScore: { safety: 40, reasoning: 10, harmReduction: 5 } },
        { id: 'c', text: 'C' }
      ],
      correctOptionId: 'a', explanation: '', points: 100
    }]
  };
  const plan = buildLanPlan(game);
  const scored = plan.rounds[0].score('a', '');
  assert.equal(scored.points, 85, '55 + 20 + 10, the rubric sum');
  assert.equal(scored.correct, true);
  const offKey = plan.rounds[0].score('b', '');
  assert.equal(offKey.points, 55, '40 + 10 + 5');
  assert.equal(offKey.correct, false, 'rubric points do not make an option the right answer');
  // No rubric at all: `points || 100` for the key, 0 otherwise.
  assert.deepEqual(plan.rounds[0].score('c', ''), { correct: false, points: 0, speedBonus: 0 });
});

it('the desktop "Thi đấu đội" setup yields teams LAN can pre-assign', () => {
  assert.deepEqual(lanDefaultTeams(quiz({ gameSetup: { scoringMode: 'thi đấu đội', competition: 'Sao Đỏ, Sao Xanh' } })), [
    { id: 't1', name: 'Sao Đỏ', icon: '🔴' },
    { id: 't2', name: 'Sao Xanh', icon: '🔵' }
  ]);
  const fallback = lanDefaultTeams(quiz({ gameSetup: { scoringMode: 'thi đấu đội' } }));
  assert.deepEqual(fallback.map(team => team.name), ['Đội A', 'Đội B']);
  assert.deepEqual(lanDefaultTeams(quiz()), [], 'individual play has no teams');
});

it('race teams are reused verbatim when the game has them', () => {
  const teams = [{ id: 'r1', name: 'Tia Chớp', icon: '⚡' }, { id: 'r2', name: 'Sóng Thần', icon: '🌊' }];
  assert.deepEqual(lanDefaultTeams({ template: 'race', race: { teams } }), teams);
});

it('question rounds skip questions with no options instead of showing a dead button', () => {
  const game = quiz({
    questions: [
      { id: 'q1', type: 'multiple-choice', prompt: 'Empty?', options: [], correctOptionId: 'a', explanation: '', points: 100 },
      { id: 'q2', type: 'multiple-choice', prompt: 'Fine?', options: [{ id: 'a', text: 'A' }], correctOptionId: 'a', explanation: '', points: 100 }
    ]
  });
  const profile = lanProfileFor(game);
  assert.equal(profile.roundCount, 1);
  assert.equal(profile.unsupportedRounds, 1);
  assert.equal(buildLanPlan(game).rounds[0].prompt, 'Fine?');
});

// --- drift guard: the copied constants must still exist in the play surface ----

it('the play surface still awards treasure points + completionBonus verbatim', () => {
  assert.match(
    GAMEPLAY,
    /const gained = correct \? \(Number\(stage\.points\) \|\| 0\) \+ \(Number\(stage\.completionBonus\) \|\| 0\) : 0;/,
    'treasureRecordStage() changed: update lan-adapters.ts treasure scoring to match'
  );
});

it('the play surface still uses the 100/200/300/50 defaults for the treasure maximum', () => {
  assert.match(GAMEPLAY, /\(Number\(stage\.points\) \|\| 100\) \+ \(Number\(stage\.completionBonus\) \|\| 200\)/);
  assert.match(GAMEPLAY, /hunt\.journeyBonus \|\| 300/);
  assert.match(GAMEPLAY, /hunt\.hiddenItemBonus \|\| 50/);
});

it('the LAN defaults table matches those literals', () => {
  assert.deepEqual(TREASURE_DEFAULTS, { stagePoints: 100, stageCompletionBonus: 200, journeyBonus: 300, hiddenItemBonus: 50 });
});

it('the play surface still falls back to question.points || 100 for scenario answers', () => {
  assert.match(GAMEPLAY, /Number\(question\.points\) \|\| 100 : 0/);
});

// --- final ranking (the podium shown when a LAN game ends) ---------------------

const teamList = [{ id: 't1', name: 'Đội Đỏ' }, { id: 't2', name: 'Đội Xanh' }];

it('the podium orders by points, then correct answers', () => {
  const ranked = lanRankPlayers([
    { id: 'p1', name: 'An', points: 200, correct: 2, answered: 3, teamId: 't1' },
    { id: 'p2', name: 'Bình', points: 300, correct: 3, answered: 3, teamId: 't2' },
    { id: 'p3', name: 'Chi', points: 200, correct: 3, answered: 3, teamId: 't1' }
  ], teamList, 3);
  assert.deepEqual(ranked.map(entry => [entry.rank, entry.name, entry.points]), [
    [1, 'Bình', 300],
    [2, 'Chi', 200],
    [3, 'An', 200]
  ]);
  assert.equal(ranked[0].teamName, 'Đội Xanh', 'the team name travels with the entry for the medal line');
});

it('equal points and equal correct answers share a rank instead of inventing a winner', () => {
  const ranked = lanRankPlayers([
    { id: 'p1', name: 'An', points: 200, correct: 2 },
    { id: 'p2', name: 'Bình', points: 200, correct: 2 },
    { id: 'p3', name: 'Chi', points: 100, correct: 1 }
  ], teamList, 3);
  assert.deepEqual(ranked.map(entry => entry.rank), [1, 1, 2], 'two firsts, then second');
  assert.deepEqual(ranked.map(entry => entry.tie), [true, true, false]);
});

it('equal points but different correct answers is not a tie', () => {
  const ranked = lanRankPlayers([
    { id: 'p1', name: 'An', points: 100, correct: 1 },
    { id: 'p2', name: 'Bình', points: 100, correct: 2 }
  ], [], 3);
  assert.deepEqual(ranked.map(entry => [entry.name, entry.rank, entry.tie]), [
    ['Bình', 1, false],
    ['An', 2, false]
  ]);
});

it('the podium is limited to three and never invents a fourth place', () => {
  const players = ['A', 'B', 'C', 'D', 'E'].map((name, index) => ({ id: `p${index}`, name, points: 500 - index * 10, correct: 5 - index }));
  const ranked = lanRankPlayers(players, [], 3);
  assert.equal(ranked.length, 3);
  assert.deepEqual(ranked.map(entry => entry.name), ['A', 'B', 'C']);
});

it('pupils who answered nothing are ranked last and never medal', () => {
  const ranked = lanRankPlayers([
    { id: 'p1', name: 'Vắng', points: 0, correct: 0, answered: 0 },
    { id: 'p2', name: 'An', points: 50, correct: 1, answered: 2 },
    { id: 'p3', name: 'Bình', points: 0, correct: 0, answered: 0 }
  ], [], 3);
  assert.equal(ranked[0].name, 'An');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].points, 0);
  assert.equal(ranked[1].rank, 2, 'two equal zeroes share one rank');
  assert.deepEqual(ranked.map(entry => entry.tie), [false, true, true]);
});

it('an empty room ranks nobody instead of throwing', () => {
  assert.deepEqual(lanRankPlayers([], [], 3), []);
  assert.deepEqual(lanRankPlayers(null, [], 3), []);
});

it('ranking is stable for equal names (no random order between renders)', () => {
  const once = lanRankPlayers([{ id: 'b', name: 'Lan', points: 10 }, { id: 'a', name: 'Hoa', points: 10 }], [], 3);
  const twice = lanRankPlayers([{ id: 'a', name: 'Hoa', points: 10 }, { id: 'b', name: 'Lan', points: 10 }], [], 3);
  assert.deepEqual(once.map(entry => entry.name), twice.map(entry => entry.name));
  assert.deepEqual(once.map(entry => entry.name), ['Hoa', 'Lan'], 'Vietnamese collation');
});

console.log(`lan-adapters: ${passed} checks passed`);
