import assert from 'node:assert/strict';
import {
  convertDraft,
  type ConversionResult
} from '../../src/services/draft-convert';
import { parseGameDraft } from '../../src/services/lesson-contracts';
import {
  LESSON_SCHEMA_VERSION,
  type ArenaDraft,
  type GameConfig,
  type MatchingDraft,
  type RaceConfig,
  type RaceDraft,
  type ScenarioDraft,
  type TreasureConfig,
  type TreasureDraft
} from '../../src/shared/lesson-types';

// docs/archive/specs/update_quy_trinh.txt §4: changing the game type must not
// regenerate everything the teacher already has. These tests pin the conversion
// matrix, and in particular that an impossible conversion reports a gap instead of
// inventing content.
//
// Synthetic teaching content only (AGENTS.md).

let passed = 0;
function it(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok   ${name}`);
}

const baseConfig = {
  title: 'Quang hợp',
  subject: 'Sinh học',
  grade: 'Lớp 8',
  topic: 'Quang hợp',
  audience: 'teen' as const,
  durationMinutes: 15,
  difficulty: 'trung bình' as const,
  playMode: 'individual' as const,
  style: 'fun' as const,
  focusObjectiveIds: [],
  generationMode: 'fast' as const
};

const raceConfig: RaceConfig = { ...baseConfig, gameType: 'race', trackLength: 24, maxRounds: 12, teamCount: 2, stepByDifficulty: false, luckEnabled: true };
const treasureConfig: TreasureConfig = { ...baseConfig, gameType: 'treasure', stageCount: 3, attemptsPerStage: 2, journeyBonus: 400, hiddenItemBonus: 70 };
const arenaConfig: GameConfig = { ...baseConfig, gameType: 'arena', questionCount: 3, scoringMode: 'basic', pointsPerCorrect: 100, timeBonus: 0 };

function choice(id: string, prompt: string): ArenaDraft['questions'][number] {
  return {
    id,
    type: 'multiple-choice',
    prompt,
    options: [{ id: 'a', text: 'Một' }, { id: 'b', text: 'Hai' }, { id: 'c', text: 'Ba' }],
    correctOptionId: 'b',
    explanation: `${prompt} — vì lý do mẫu.`,
    difficulty: 'dễ',
    points: 120
  };
}

const arena: ArenaDraft = {
  gameType: 'arena',
  schemaVersion: LESSON_SCHEMA_VERSION,
  questions: [choice('q1', 'Câu một?'), choice('q2', 'Câu hai?'), choice('q3', 'Câu ba?')]
};

const race: RaceDraft = {
  gameType: 'race',
  schemaVersion: LESSON_SCHEMA_VERSION,
  trackLength: 20,
  maxRounds: 10,
  stepByDifficulty: true,
  luckEnabled: false,
  teams: [{ id: 't1', name: 'Tia chớp' }, { id: 't2', name: 'Sóng thần' }],
  cells: [],
  questions: ['Đua một?', 'Đua hai?'].map((prompt, index) => ({
    id: `q${index + 1}`,
    prompt,
    options: [{ id: 'a', text: 'Một' }, { id: 'b', text: 'Hai' }],
    correctOptionId: 'b',
    explanation: `${prompt} — giải thích.`,
    difficulty: 'trung bình'
  }))
};

const treasure: TreasureDraft = {
  gameType: 'treasure',
  schemaVersion: LESSON_SCHEMA_VERSION,
  character: 'explorer',
  intro: 'Mở đầu hành trình.',
  journeyBonus: 300,
  hiddenItemBonus: 50,
  stages: [
    {
      id: 's1', name: 'Rừng', story: 'Câu chuyện.', taskDescription: 'Nhiệm vụ.',
      question: { prompt: 'Chặng một?', options: [{ id: 'a', text: 'Một' }, { id: 'b', text: 'Hai' }], correctOptionId: 'a', explanation: 'Giải thích.' },
      attempts: 1, points: 150, completionBonus: 50, nextStageId: null
    },
    {
      id: 's2', name: 'Hang', story: 'Bối cảnh hang.', taskDescription: 'Nhiệm vụ hang.',
      question: { prompt: 'Chặng hai?', options: [{ id: 'a', text: 'Một' }, { id: 'b', text: 'Hai' }], correctOptionId: 'b', explanation: 'Vì là hai.' },
      attempts: 1, points: 100, completionBonus: 0, nextStageId: null
    },
    {
      id: 's3', name: 'Ghép', story: 'Bối cảnh ghép.', taskDescription: 'Nhiệm vụ ghép.',
      question: { prompt: 'Chặng ghép?', options: [{ id: 'a', text: 'Một' }, { id: 'b', text: 'Hai' }], correctOptionId: 'a', explanation: 'Vì là một.' },
      mission: { type: 'matching', pairs: [{ id: 'p1', left: 'A', right: 'B' }, { id: 'p2', left: 'C', right: 'D' }] } as never,
      attempts: 1, points: 100, completionBonus: 0, nextStageId: null
    }
  ]
};

const matching: MatchingDraft = {
  gameType: 'matching',
  schemaVersion: LESSON_SCHEMA_VERSION,
  mode: 'columns',
  pairs: [{ id: 'p1', left: 'A', right: 'B' }, { id: 'p2', left: 'C', right: 'D' }],
  pointsPerPair: 100,
  completionBonus: 50,
  wrongPenalty: 10,
  timeBonus: 20,
  bonusUnderSeconds: 60,
  practiceMode: false
};

const scenario: ScenarioDraft = {
  gameType: 'scenario',
  schemaVersion: LESSON_SCHEMA_VERSION,
  situations: [
    {
      id: 's1',
      prompt: 'Bạn sẽ làm gì?',
      options: [{ id: 'a', text: 'Gọi người lớn' }, { id: 'b', text: 'Tự xử lý' }],
      correctOptionId: 'a'
    }
  ]
};

function expectConversion(result: ConversionResult, expected: boolean): void {
  assert.equal(Boolean(result.draft), expected, `draft presence: got ${Boolean(result.draft)} (gaps: ${result.gaps.map(gap => gap.key).join(', ')})`);
}

/** Deep snapshot used to prove the source is never mutated. */
const snapshot = (value: unknown) => JSON.stringify(value);

it('arena → race keeps every question, option and answer', () => {
  const before = snapshot(arena);
  const result = convertDraft(arena, 'race', raceConfig);
  expectConversion(result, true);
  assert.equal(result.complete, true);
  assert.equal(result.converted, 3);
  const draft = result.draft as RaceDraft;
  assert.equal(draft.gameType, 'race');
  assert.equal(draft.questions.length, 3);
  assert.equal(draft.questions[0].prompt, 'Câu một?');
  assert.equal(draft.questions[0].correctOptionId, 'b');
  assert.deepEqual(draft.questions[0].explanation, 'Câu một? — vì lý do mẫu.');
  // Race settings come from the teacher's config, not invented defaults.
  assert.equal(draft.trackLength, 24);
  assert.equal(draft.maxRounds, 12);
  assert.equal(draft.stepByDifficulty, false);
  assert.equal(draft.luckEnabled, true);
  assert.equal(snapshot(arena), before, 'the source draft must not be mutated');
});

it('arena → treasure is refused: the target needs narrative the source has no way to supply', () => {
  // `treasureStageSchema` requires non-empty intro/story/taskDescription. Producing a
  // draft with them blank used to look complete and then fail inside saveProject
  // (measured: `parseGameDraft` throws STORE_INVALID_PROJECT).
  const result = convertDraft(arena, 'treasure', treasureConfig);
  assert.equal(result.draft, null, 'no invalid draft is produced');
  assert.equal(result.complete, false);
  assert.ok(result.gaps.some(gap => gap.key === 'needs-narrative'), result.gaps.map(gap => gap.key).join(','));
  // Every draft the converter returns for treasure must pass the real schema.
  const treasureSource: TreasureDraft = {
    ...treasure,
    intro: 'Mở đầu hành trình quang hợp.',
    stages: treasure.stages.map(stage => ({ ...stage, story: 'Bối cảnh chặng.', taskDescription: 'Nhiệm vụ chặng.' }))
  };
  const fromTreasure = convertDraft(treasureSource, 'race', raceConfig);
  assert.ok(fromTreasure.draft, 'a narrative treasure source still converts to race');
});

it('arena → treasure with narrative already present is allowed and parseable', () => {
  // Sanity: the refusal above is about missing content, not about treasure in general.
  const result = convertDraft(treasure, 'treasure', treasureConfig);
  assert.equal(result.draft, treasure, 'same-type stays a no-op');
});

it('race → arena keeps every question', () => {
  const result = convertDraft(race, 'arena', arenaConfig);
  expectConversion(result, true);
  assert.equal(result.complete, true);
  const draft = result.draft as ArenaDraft;
  assert.equal(draft.questions.length, 2);
  assert.equal(draft.questions[1].prompt, 'Đua hai?');
});

it('treasure → arena keeps the choice stages and reports the odd one', () => {
  const result = convertDraft(treasure, 'arena', arenaConfig);
  expectConversion(result, true);
  const draft = result.draft as ArenaDraft;
  assert.equal(draft.questions.length, 2, 'two choice stages convert, the matching mission does not');
  assert.equal(result.converted, 2);
  assert.equal(result.complete, false, 'one stage could not be carried over');
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].key, 'mission-unsupported');
});

it('treasure → race keeps the choice stages', () => {
  const result = convertDraft(treasure, 'race', raceConfig);
  expectConversion(result, true);
  assert.equal((result.draft as RaceDraft).questions.length, 2);
});

it('matching cannot become a question game, and says why', () => {
  for (const target of ['arena', 'race', 'treasure'] as const) {
    const result = convertDraft(matching, target, arenaConfig);
    expectConversion(result, false);
    assert.equal(result.converted, 0);
    assert.equal(result.complete, false);
    assert.ok(result.gaps.some(gap => gap.key === 'matching-pairs'), `${target}: ${result.gaps.map(gap => gap.key).join(', ')}`);
    assert.match(result.gaps.find(gap => gap.key === 'matching-pairs')!.reason, /cặp ghép/i);
  }
});

it('scenario cannot become a question game, and says why', () => {
  const result = convertDraft(scenario, 'arena', arenaConfig);
  expectConversion(result, false);
  assert.ok(result.gaps.some(gap => gap.key === 'scenario-branches'));
});

it('questions cannot become matching or scenario', () => {
  for (const target of ['matching', 'scenario'] as const) {
    const result = convertDraft(arena, target, arenaConfig);
    expectConversion(result, false);
    assert.ok(result.gaps.some(gap => gap.key === 'needs-relationships'), `${target}: ${result.gaps.map(gap => gap.key).join(', ')}`);
    assert.match(result.gaps.find(gap => gap.key === 'needs-relationships')!.reason, /không suy ra được/i);
  }
});

it('a fill-in-blank question is reported, never forced into options', () => {
  const withBlank: ArenaDraft = {
    gameType: 'arena',
    schemaVersion: LESSON_SCHEMA_VERSION,
    questions: [
      choice('q1', 'Trắc nghiệm?'),
      {
        id: 'q2',
        type: 'fill-in-blank',
        prompt: 'Điền từ: thủ đô Việt Nam là ___',
        correctAnswer: 'Hà Nội',
        explanation: '',
        difficulty: 'dễ',
        points: 100
      }
    ]
  };
  const result = convertDraft(withBlank, 'race', raceConfig);
  expectConversion(result, true);
  assert.equal((result.draft as RaceDraft).questions.length, 1);
  assert.equal(result.complete, false);
  assert.ok(result.gaps.some(gap => gap.key === 'no-options'));
});

it('a question whose answer matches no option is reported, never guessed', () => {
  const broken: ArenaDraft = {
    gameType: 'arena',
    schemaVersion: LESSON_SCHEMA_VERSION,
    questions: [{ ...choice('q1', 'Câu lỗi?'), correctOptionId: 'z' } as ArenaDraft['questions'][number]]
  };
  const result = convertDraft(broken, 'race', raceConfig);
  expectConversion(result, false);
  assert.ok(result.gaps.some(gap => gap.key === 'no-answer'));
});

it('same type is a no-op that needs no model call', () => {
  const result = convertDraft(arena, 'arena', arenaConfig);
  assert.equal(result.draft, arena, 'same draft object, nothing rebuilt');
  assert.equal(result.complete, true);
  assert.equal(result.converted, 0);
});

it('a missing source is reported instead of throwing', () => {
  const result = convertDraft(null, 'arena', arenaConfig);
  expectConversion(result, false);
  assert.equal(result.gaps[0].key, 'no-source');
});

it('conversion is deterministic', () => {
  const first = convertDraft(arena, 'treasure', treasureConfig);
  const second = convertDraft(arena, 'treasure', treasureConfig);
  assert.equal(snapshot(first), snapshot(second));
});

it('every pair of the 5 types has a defined outcome (no throw, no silent loss)', () => {
  const sources = [
    ['arena', arena],
    ['race', race],
    ['treasure', treasure],
    ['matching', matching],
    ['scenario', scenario]
  ] as const;
  for (const [sourceName, source] of sources) {
    for (const target of ['arena', 'scenario', 'matching', 'treasure', 'race'] as const) {
      const result = convertDraft(source, target, arenaConfig);
      if (sourceName === target) {
        assert.ok(result.draft, `${sourceName}→${target} should be a no-op`);
        continue;
      }
      // Either a draft was produced, or at least one gap explains why not.
      assert.ok(result.draft || result.gaps.length > 0, `${sourceName}→${target} produced neither draft nor gap`);
      if (!result.draft) assert.equal(result.complete, false, `${sourceName}→${target}`);
    }
  }
});

it('a single question cannot become treasure (schema needs two stages)', () => {
  const one: ArenaDraft = {
    gameType: 'arena',
    schemaVersion: LESSON_SCHEMA_VERSION,
    questions: [choice('q1', 'Chỉ một câu?')]
  };
  const result = convertDraft(one, 'treasure', treasureConfig);
  // Returning a one-stage draft used to look complete and then fail at generation.
  assert.equal(result.draft, null);
  assert.equal(result.complete, false);
  assert.ok(result.gaps.some(gap => gap.key === 'too-few-items'), result.gaps.map(gap => gap.key).join(','));
});

it('an unknown target is rejected instead of silently becoming treasure', () => {
  for (const target of ['constructor', '__proto__', 'arena2', '']) {
    const result = convertDraft(arena, target as never, arenaConfig);
    assert.equal(result.draft, null, `${target} must not produce a draft`);
    assert.ok(result.gaps.some(gap => gap.key === 'unknown-target'), `${target}: ${result.gaps.map(gap => gap.key).join(',')}`);
  }
});

it('every draft the converter returns passes the store schema', () => {
  // The real guard: `saveProject` validates with `parseGameDraft`, so a converter
  // draft that fails here can never be saved. This would have caught the empty
  // `intro`/`story`/`taskDescription` regression.
  const sources = [
    ['arena', arena],
    ['race', race],
    ['treasure', treasure],
    ['matching', matching],
    ['scenario', scenario]
  ] as const;
  for (const [sourceName, source] of sources) {
    for (const target of ['arena', 'scenario', 'matching', 'treasure', 'race'] as const) {
      const result = convertDraft(source, target, arenaConfig);
      if (!result.draft) continue;
      assert.doesNotThrow(
        () => parseGameDraft(result.draft),
        `${sourceName}→${target} produced a draft the store rejects`
      );
    }
  }
});

console.log(`draft-convert: ${passed} checks passed`);
