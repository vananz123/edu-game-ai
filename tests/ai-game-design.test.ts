import assert from 'node:assert/strict';
import type { GameQuestion } from '../src/shared/types';
import { buildRaceData, buildTreasureHunt } from '../src/services/ai-game-design';
import { normalizeAiGame } from '../src/services/ai-game-normalize';
import { validateRaceGame, validateTreasureHuntGame } from '../src/services/game-validation';

const makeId = (prefix: string) => `${prefix}-test`;

function puzzle(id: string, difficulty?: 'dễ' | 'trung bình' | 'khó'): GameQuestion {
  return {
    id,
    type: 'multiple-choice',
    prompt: `${id}: chọn phát biểu đúng về bài học?`,
    options: [
      { id: 'a', text: 'Đáp án đúng của bài học' },
      { id: 'b', text: 'Phát biểu sai một' },
      { id: 'c', text: 'Phát biểu sai hai' }
    ],
    correctOptionId: 'a',
    explanation: 'Đối chiếu với tài liệu.',
    points: 100,
    ...(difficulty ? { difficulty } : {})
  };
}

function run(): void {
  const treasure = buildTreasureHunt(
    [puzzle('q1'), puzzle('q2'), puzzle('q3'), puzzle('q4')],
    {
      character: 'Nhà khoa học tí hon',
      intro: 'Khám phá tế bào!',
      journeyBonus: 500,
      hiddenItemBonus: 60,
      stages: [
        { name: 'Cổng tế bào', story: 'Đứng trước màng tế bào.', taskDescription: 'Tìm chìa khóa ion.', attempts: 3, points: 150, completionBonus: 300, hasHiddenItem: true, hint: 'Nhớ chức năng của màng.' },
        {},
        { name: 'Nhân tế bào' },
        { name: 'Kho tàng ADN', story: 'Chặng cuối.', completionBonus: 400 }
      ]
    }
  );
  assert.ok(treasure);
  assert.equal(treasure!.stages.length, 4);
  assert.equal(treasure!.character, 'Nhà khoa học tí hon');
  assert.equal(treasure!.journeyBonus, 500);
  assert.equal(treasure!.hiddenItemBonus, 60);

  const first = treasure!.stages[0];
  assert.equal(first.id, 'stage-1');
  assert.equal(first.name, 'Cổng tế bào');
  assert.equal(first.story, 'Đứng trước màng tế bào.');
  assert.equal(first.attempts, 3);
  assert.equal(first.points, 150);
  assert.equal(first.completionBonus, 300);
  assert.equal(first.hasHiddenItem, true);
  assert.equal(first.question.hint, 'Nhớ chức năng của màng.');
  assert.equal(first.question.correctOptionId, 'a');
  assert.equal(first.nextStageId, 'stage-2');

  const middle = treasure!.stages[1];
  assert.equal(middle.name, 'Chặng 2');
  assert.equal(middle.attempts, 0);
  assert.equal(middle.points, 100);
  assert.equal(middle.hasHiddenItem, undefined);

  const last = treasure!.stages[3];
  assert.equal(last.name, 'Kho tàng ADN');
  assert.equal(last.nextStageId, null);
  assert.equal(last.completionBonus, 400);
  validateTreasureHuntGame({ template: 'treasure-hunt', treasureHunt: treasure! });

  const defaults = buildTreasureHunt([puzzle('q1'), puzzle('q2'), puzzle('q3')], null);
  assert.ok(defaults);
  assert.equal(defaults!.stages.length, 3);
  assert.equal(defaults!.character, 'Nhà thám hiểm');
  assert.equal(defaults!.stages.every(stage => stage.nextStageId !== null || stage === defaults!.stages[2]), true);
  validateTreasureHuntGame({ template: 'treasure-hunt', treasureHunt: defaults! });

  const textOnly: GameQuestion[] = [
    { id: 'q1', type: 'fill-in-blank', prompt: 'Điền tên bội nhân của 6?', options: [], correctOptionId: '', correctAnswer: '12', explanation: '', points: 100 },
    { id: 'q2', type: 'short-answer', prompt: 'Hãy nêu một lợi ích của cây xanh?', options: [], correctOptionId: '', correctAnswer: 'Cung cấp oxy', explanation: '', points: 100 }
  ];
  assert.equal(buildTreasureHunt(textOnly, null), null);
  assert.equal(buildTreasureHunt([puzzle('q1')], null), null);

  const usableMixed = buildTreasureHunt(
    [textOnly[0], puzzle('q2'), puzzle('q3')],
    { stages: [{ name: 'Sai chỉ số' }, { name: 'Chặng hai' }, { name: 'Chặng ba' }] }
  );
  assert.ok(usableMixed);
  assert.equal(usableMixed!.stages.length, 2);
  assert.equal(usableMixed!.stages[0].name, 'Chặng hai', 'stage meta aligns to original question index');
  validateTreasureHuntGame({ template: 'treasure-hunt', treasureHunt: usableMixed! });

  const race = buildRaceData(
    [puzzle('q1', 'dễ'), puzzle('q2', 'khó'), textOnly[0], puzzle('q3')],
    {
      trackLength: 500,
      maxRounds: 0,
      stepByDifficulty: false,
      luckEnabled: true,
      teams: [
        { name: 'Đội Bốn', icon: '🚀' },
        { name: 'đội bốn' },
        { name: '' },
        { name: 'Đội Một' }
      ],
      specialCells: [
        { cell: 3, type: 'boost', label: 'Tăng tốc' },
        { cell: 3, type: 'penalty', label: 'Trùng ô' },
        { cell: 1, type: 'boost', label: 'Ngoài đường đua' },
        { cell: 9, type: 'hack', label: 'Loại sai' },
        { cell: 12, type: 'challenge', label: '' }
      ]
    }
  );
  assert.ok(race);
  assert.equal(race!.trackLength, 100, 'trackLength clamped to validator max');
  assert.equal(race!.maxRounds, 1, 'maxRounds clamped to validator min');
  assert.equal(race!.stepByDifficulty, false);
  assert.equal(race!.luckEnabled, true);
  assert.deepEqual(race!.teams.map(team => team.name), ['Đội Bốn', 'Đội Một'], 'duplicate/empty team names dropped');
  assert.equal(race!.teams.length, 2);
  assert.deepEqual(race!.cells, [
    { cell: 3, type: 'boost', label: 'Tăng tốc' },
    { cell: 12, type: 'challenge', label: '' }
  ]);
  assert.equal(race!.questions.length, 3, 'text questions excluded from race bank');
  assert.equal(race!.questions[0].difficulty, 'dễ');
  assert.equal(race!.questions[1].difficulty, 'khó');
  assert.equal(race!.questions[2].difficulty, 'trung bình', 'missing difficulty defaults to trung bình');
  validateRaceGame({ template: 'race', race: race! });

  const raceDefaults = buildRaceData([puzzle('q1')], null);
  assert.ok(raceDefaults);
  assert.equal(raceDefaults!.trackLength, 12);
  assert.equal(raceDefaults!.maxRounds, 6);
  assert.equal(raceDefaults!.teams.length, 2);
  assert.deepEqual(raceDefaults!.cells, []);
  assert.equal(raceDefaults!.stepByDifficulty, true);
  assert.equal(raceDefaults!.luckEnabled, false);
  validateRaceGame({ template: 'race', race: raceDefaults! });

  assert.equal(buildRaceData(textOnly, null), null);

  const generatedTreasure = normalizeAiGame({
    title: 'Hành trình tế bào',
    template: 'treasure-hunt',
    questions: [puzzle('q1'), puzzle('q2'), puzzle('q3')],
    treasureDesign: { character: 'Nhà sinh học', stages: [{ name: 'Màng', hasHiddenItem: true }, {}, {}] }
  }, { template: 'treasure-hunt' }, makeId);
  assert.equal(generatedTreasure.template, 'treasure-hunt');
  assert.ok(generatedTreasure.treasureHunt);
  assert.equal(generatedTreasure.treasureHunt.character, 'Nhà sinh học');
  assert.equal(generatedTreasure.treasureHunt.stages[0].hasHiddenItem, true);
  validateTreasureHuntGame(generatedTreasure);

  const generatedRace = normalizeAiGame({
    title: 'Đường đua toán',
    template: 'race',
    questions: [puzzle('q1'), puzzle('q2')],
    raceDesign: { trackLength: 10, specialCells: [{ cell: 5, type: 'lucky', label: 'May mắn' }] }
  }, { template: 'race' }, makeId);
  assert.equal(generatedRace.template, 'race');
  assert.ok(generatedRace.race);
  assert.equal(generatedRace.race.trackLength, 10);
  assert.deepEqual(generatedRace.race.cells, [{ cell: 5, type: 'lucky', label: 'May mắn' }]);
  validateRaceGame(generatedRace);

  const payloadFallback = normalizeAiGame({
    title: 'Trò chơi theo payload',
    questions: [puzzle('q1'), puzzle('q2'), puzzle('q3')]
  }, { template: 'treasure-hunt' }, makeId);
  assert.equal(payloadFallback.template, 'treasure-hunt');
  assert.ok(payloadFallback.treasureHunt);

  const unknownTemplate = normalizeAiGame({
    title: 'Template lạ',
    template: 'battle-royale',
    questions: [puzzle('q1'), puzzle('q2'), puzzle('q3')]
  }, {}, makeId);
  assert.equal(unknownTemplate.template, 'scenario');
  assert.equal(unknownTemplate.treasureHunt, undefined);
  assert.equal(unknownTemplate.race, undefined);

  console.log('ai-game-design: OK');
}

run();
