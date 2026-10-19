/**
 * The single conversion boundary between workflow drafts and `EducationalGame`.
 *
 * UI and AI services must never build `EducationalGame` themselves. They work
 * with `GameProject`/`GameDraft`, then call `toEducationalGame` at the save or
 * play boundary. Opening an existing game in the wizard uses
 * `fromEducationalGame`.
 */
import type {
  EducationalGame,
  GameOption,
  GameQuestion,
  GameSetup,
  MatchingGameData,
  QuestionDifficulty,
  RaceCellType,
  RaceData,
  RaceQuestion,
  RaceSpecialCell,
  RaceTeam,
  TreasureHuntData,
  TreasureStage,
  TreasureStageQuestion
} from '../shared/types';
import type {
  ArenaDraft,
  ArenaQuestion,
  ArenaScoringMode,
  GameConfig,
  GameDraft,
  GameProject,
  MatchingDraft,
  RaceDraft,
  ScenarioDraft,
  ScenarioOption,
  ScenarioSituation,
  TreasureDraft,
  TreasureStageDraft
} from '../shared/lesson-types';
import { LESSON_SCHEMA_VERSION } from '../shared/lesson-types';
import {
  LessonContractError,
  parseGameConfig,
  parseGameDraft
} from './lesson-contracts';
import {
  validateMatchingGame,
  validateRaceGame,
  validateScenarioGame,
  validateTreasureHuntGame
} from './game-validation';

export class GameAdapterError extends Error {
  readonly code: string;
  readonly details: string[];

  constructor(code: string, message: string, details: string[] = []) {
    super(message);
    this.name = 'GameAdapterError';
    this.code = code;
    this.details = details;
  }
}

const TEMPLATE_BY_TYPE: Record<GameDraft['gameType'], EducationalGame['template']> = {
  arena: 'quiz',
  scenario: 'scenario',
  matching: 'matching',
  treasure: 'treasure-hunt',
  race: 'race'
};

const TYPE_BY_TEMPLATE: Record<EducationalGame['template'], GameDraft['gameType']> = {
  quiz: 'arena',
  scenario: 'scenario',
  matching: 'matching',
  'treasure-hunt': 'treasure',
  race: 'race'
};

/**
 * Convert a validated workflow project into the saved/playable game shape.
 * The output is validated with the same validators used by import/editor save.
 */
export function toEducationalGame(project: GameProject): EducationalGame {
  if (!project || typeof project !== 'object') {
    throw new GameAdapterError('ADAPTER_PROJECT_MISSING', 'Không tìm thấy dự án trò chơi.');
  }
  if (project.schemaVersion !== LESSON_SCHEMA_VERSION) {
    throw new GameAdapterError(
      'PROJECT_VERSION_UNSUPPORTED',
      `Dự án dùng phiên bản dữ liệu ${String(project.schemaVersion)}; ứng dụng chỉ hỗ trợ phiên bản ${LESSON_SCHEMA_VERSION}.`
    );
  }
  if (!project.draft) {
    throw new GameAdapterError('ADAPTER_MISSING_DRAFT', 'Dự án chưa có nội dung trò chơi để chuyển đổi.');
  }
  if (project.draft.schemaVersion !== LESSON_SCHEMA_VERSION) {
    throw new GameAdapterError(
      'PROJECT_VERSION_UNSUPPORTED',
      `Nội dung trò chơi dùng phiên bản ${String(project.draft.schemaVersion)}; ứng dụng chỉ hỗ trợ phiên bản ${LESSON_SCHEMA_VERSION}.`
    );
  }
  if (!project.config) {
    throw new GameAdapterError('ADAPTER_MISSING_CONFIG', 'Dự án chưa có cấu hình trò chơi.');
  }

  const draft = parseDraftOrThrow(project.draft);
  const config = parseConfigOrThrow(project.config);

  if (draft.gameType !== config.gameType) {
    throw new GameAdapterError(
      'ADAPTER_TYPE_MISMATCH',
      `Cấu hình là “${config.gameType}” nhưng nội dung là “${draft.gameType}”.`
    );
  }

  const common = buildCommonFields(project, config);
  let game: EducationalGame;

  switch (draft.gameType) {
    case 'arena':
      game = { ...common, template: 'quiz', questions: arenaQuestions(draft) };
      break;
    case 'scenario':
      game = { ...common, template: 'scenario', questions: scenarioQuestions(draft) };
      break;
    case 'matching':
      game = {
        ...common,
        template: 'matching',
        questions: [],
        matchingGame: matchingData(draft)
      };
      break;
    case 'treasure':
      game = {
        ...common,
        template: 'treasure-hunt',
        questions: treasureQuestions(draft),
        treasureHunt: treasureData(draft)
      };
      break;
    case 'race':
      game = {
        ...common,
        template: 'race',
        questions: raceQuestions(draft),
        race: raceData(draft)
      };
      break;
    default:
      throw new GameAdapterError('ADAPTER_UNKNOWN_TYPE', 'Loại trò chơi không được hỗ trợ.');
  }

  validateAdaptedGame(game);
  return game;
}

/** Build a wizard project from an existing saved game (legacy compatibility). */
export function fromEducationalGame(game: EducationalGame): GameProject {
  if (!game || typeof game !== 'object') {
    throw new GameAdapterError('ADAPTER_GAME_MISSING', 'Không tìm thấy trò chơi để mở.');
  }
  const gameType = TYPE_BY_TEMPLATE[game.template];
  if (!gameType) {
    throw new GameAdapterError('ADAPTER_UNKNOWN_TYPE', `Không hỗ trợ mở mẫu trò chơi “${String(game.template)}”.`);
  }

  validateOriginalGame(game);
  const now = game.updatedAt || game.createdAt || new Date().toISOString();
  const config = configFromGame(game, gameType);
  let draft: GameDraft;

  switch (gameType) {
    case 'arena':
      draft = arenaDraftFromGame(game);
      break;
    case 'scenario':
      draft = scenarioDraftFromGame(game);
      break;
    case 'matching':
      draft = matchingDraftFromGame(game);
      break;
    case 'treasure':
      draft = treasureDraftFromGame(game);
      break;
    case 'race':
      draft = raceDraftFromGame(game);
      break;
    default:
      throw new GameAdapterError('ADAPTER_UNKNOWN_TYPE', 'Loại trò chơi không được hỗ trợ.');
  }

  return {
    id: `project-${game.id}`,
    schemaVersion: LESSON_SCHEMA_VERSION,
    status: 'ready',
    step: 'done',
    title: game.title,
    description: game.description || '',
    tags: Array.isArray(game.tags) ? [...game.tags] : [],
    sourceName: game.sourceName || '',
    lesson: null,
    analysisId: null,
    recommendationId: null,
    config,
    draft,
    gameSnapshot: game,
    ...(game.gameSetup ? { gameSetup: { ...game.gameSetup } } : {}),
    gameId: game.id,
    createdAt: game.createdAt || now,
    updatedAt: now
  };
}

// ---------------------------------------------------------------------------
// Draft -> game
// ---------------------------------------------------------------------------

function parseDraftOrThrow(value: unknown): GameDraft {
  try {
    return parseGameDraft(value);
  } catch (error) {
    if (error instanceof LessonContractError) {
      throw new GameAdapterError('ADAPTER_INVALID_DRAFT', error.message, error.issues);
    }
    throw error;
  }
}

function parseConfigOrThrow(value: unknown): GameConfig {
  try {
    return parseGameConfig(value);
  } catch (error) {
    if (error instanceof LessonContractError) {
      throw new GameAdapterError('ADAPTER_INVALID_CONFIG', error.message, error.issues);
    }
    throw error;
  }
}

function buildCommonFields(project: GameProject, config: GameConfig): Omit<EducationalGame, 'template'> {
  const setup = gameSetupFor(config, project.gameSetup);
  return {
    id: project.gameId || `game-${project.id}`,
    title: config.title,
    subject: config.subject,
    grade: config.grade,
    topic: config.topic,
    description: project.description || '',
    questions: [],
    tags: Array.isArray(project.tags) ? [...project.tags] : [],
    sourceName: project.sourceName || project.lesson?.name || '',
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: project.updatedAt || undefined,
    gameSetup: setup
  };
}

function arenaQuestions(draft: ArenaDraft): GameQuestion[] {
  return draft.questions.map(question => {
    if (question.type === 'fill-in-blank' || question.type === 'short-answer') {
      return {
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        options: [],
        correctOptionId: '',
        correctAnswer: question.correctAnswer,
        ...(question.alternateAnswers ? { alternateAnswers: [...question.alternateAnswers] } : {}),
        explanation: question.explanation,
        points: question.points,
        difficulty: question.difficulty
      };
    }
    if (question.type !== 'multiple-choice' && question.type !== 'true-false') {
      throw new GameAdapterError('ADAPTER_INVALID_DRAFT', `Loại câu hỏi “${String(question.type)}” không hợp lệ.`);
    }
    return {
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      options: question.options.map(option => ({ id: option.id, text: option.text })),
      correctOptionId: question.correctOptionId,
      explanation: question.explanation,
      points: question.points,
      difficulty: question.difficulty
    };
  });
}

function scenarioQuestions(draft: ScenarioDraft): GameQuestion[] {
  return draft.situations.map(situation => {
    const best = bestScenarioOption(situation);
    const bestId = situation.correctOptionId || best?.id || situation.options[0]?.id || '';
    return {
      id: situation.id,
      type: 'scenario',
      prompt: situation.prompt,
      ...(situation.context ? { context: situation.context } : {}),
      options: situation.options.map(option => scenarioGameOption(option)),
      correctOptionId: bestId,
      explanation: best?.feedback || best?.consequence || '',
      points: 100,
      ...(situation.discussionPrompt ? { discussionPrompt: situation.discussionPrompt } : {})
    };
  });
}

function scenarioGameOption(option: ScenarioOption): GameOption {
  const feedback = option.feedback || option.consequence;
  return {
    id: option.id,
    text: option.text,
    ...(feedback ? { feedback } : {}),
    nextQuestionId: option.nextSituationId ?? null,
    ...(option.score ? { scenarioScore: { ...option.score } } : {})
  };
}

function bestScenarioOption(situation: ScenarioSituation): ScenarioOption | undefined {
  if (!situation.options.length) return undefined;
  return [...situation.options].sort((a, b) => scenarioScoreValue(b) - scenarioScoreValue(a))[0];
}

function scenarioScoreValue(option: ScenarioOption): number {
  if (!option.score) return 0;
  return option.score.safety + option.score.reasoning + option.score.harmReduction;
}

function matchingData(draft: MatchingDraft): MatchingGameData {
  return {
    mode: draft.mode,
    pairs: draft.pairs.map(pair => ({ id: pair.id, left: pair.left, right: pair.right })),
    pointsPerPair: draft.pointsPerPair,
    completionBonus: draft.completionBonus,
    wrongPenalty: draft.wrongPenalty,
    timeBonus: draft.timeBonus,
    bonusUnderSeconds: draft.bonusUnderSeconds,
    practiceMode: draft.practiceMode
  };
}

function treasureStages(draft: TreasureDraft): TreasureStage[] {
  return draft.stages.map((stage, index) => {
    const nextStageId = stage.nextStageId === undefined
      ? (index < draft.stages.length - 1 ? draft.stages[index + 1].id : null)
      : stage.nextStageId;
    return {
      id: stage.id,
      name: stage.name,
      story: stage.story,
      taskDescription: stage.taskDescription,
      question: treasureStageQuestion(stage),
      attempts: stage.attempts,
      points: stage.points,
      completionBonus: stage.completionBonus,
      nextStageId,
      ...(stage.branchStageId ? {
        branchLabel: stage.branchLabel || 'Đi theo nhánh phụ',
        branchStageId: stage.branchStageId
      } : {}),
      ...(stage.hasHiddenItem !== undefined ? { hasHiddenItem: stage.hasHiddenItem } : {})
    };
  });
}

function treasureStageQuestion(stage: TreasureStageDraft): TreasureStageQuestion {
  return {
    prompt: stage.question.prompt,
    options: stage.question.options.map(option => ({ id: option.id, text: option.text })),
    correctOptionId: stage.question.correctOptionId,
    explanation: stage.question.explanation,
    hint: stage.question.hint || ''
  };
}

function treasureData(draft: TreasureDraft): TreasureHuntData {
  return {
    character: draft.character,
    intro: draft.intro,
    journeyBonus: draft.journeyBonus,
    hiddenItemBonus: draft.hiddenItemBonus,
    stages: treasureStages(draft)
  };
}

function treasureQuestions(draft: TreasureDraft): GameQuestion[] {
  return treasureStages(draft).map(stage => ({
    id: `q-${stage.id}`,
    type: 'multiple-choice',
    prompt: stage.question.prompt,
    options: stage.question.options.map(option => ({ id: option.id, text: option.text })),
    correctOptionId: stage.question.correctOptionId,
    explanation: stage.question.explanation,
    points: stage.points
  }));
}

function raceQuestions(draft: RaceDraft): GameQuestion[] {
  return draft.questions.map(question => ({ ...raceQuestion(question), type: 'multiple-choice' as const, points: 100 }));
}

function raceQuestion(question: RaceDraft['questions'][number]): RaceQuestion {
  return {
    id: question.id,
    prompt: question.prompt,
    options: question.options.map(option => ({ id: option.id, text: option.text })),
    correctOptionId: question.correctOptionId,
    explanation: question.explanation,
    difficulty: question.difficulty
  };
}

function raceData(draft: RaceDraft): RaceData {
  const teams: RaceTeam[] = draft.teams.map(team => ({
    id: team.id,
    name: team.name,
    icon: team.icon || '🏁'
  }));
  const cells: RaceSpecialCell[] = draft.cells.map(cell => ({
    cell: cell.cell,
    type: cell.type as RaceCellType,
    label: cell.label
  }));
  return {
    trackLength: draft.trackLength,
    maxRounds: draft.maxRounds,
    stepByDifficulty: draft.stepByDifficulty,
    luckEnabled: draft.luckEnabled,
    teams,
    cells,
    questions: draft.questions.map(raceQuestion)
  };
}

// ---------------------------------------------------------------------------
// Game -> draft (legacy support)
// ---------------------------------------------------------------------------

function arenaDraftFromGame(game: EducationalGame): ArenaDraft {
  const supported = new Set(['multiple-choice', 'true-false', 'fill-in-blank', 'short-answer']);
  const questions = game.questions
    .filter(question => supported.has(question.type))
    .map((question): ArenaQuestion => {
      const difficulty = normalizeDifficulty(question.difficulty);
      if (question.type === 'fill-in-blank' || question.type === 'short-answer') {
        if (!question.correctAnswer || !question.correctAnswer.trim()) {
          throw new GameAdapterError(
            'ADAPTER_LEGACY_DATA_UNSUPPORTED',
            `Câu hỏi “${question.id}” thiếu đáp án tự luận để mở trong trình tạo mới.`
          );
        }
        return {
          id: question.id,
          type: question.type,
          prompt: question.prompt,
          correctAnswer: question.correctAnswer,
          ...(question.alternateAnswers ? { alternateAnswers: [...question.alternateAnswers] } : {}),
          explanation: question.explanation || '',
          difficulty,
          points: safeInt(question.points, 100)
        };
      }
      if (question.type !== 'multiple-choice' && question.type !== 'true-false') {
        throw new GameAdapterError(
          'ADAPTER_LEGACY_DATA_UNSUPPORTED',
          `Câu hỏi “${question.id}” có loại không hỗ trợ trong trình tạo mới.`
        );
      }
      return {
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        options: question.options.map(option => ({ id: option.id, text: option.text })),
        correctOptionId: question.correctOptionId,
        explanation: question.explanation || '',
        difficulty,
        points: safeInt(question.points, 100)
      };
    });

  if (!questions.length) {
    throw new GameAdapterError('ADAPTER_LEGACY_DATA_UNSUPPORTED', 'Trò chơi chưa có câu hỏi nào để mở trong trình tạo mới.');
  }

  return { gameType: 'arena', schemaVersion: LESSON_SCHEMA_VERSION, questions };
}

function scenarioDraftFromGame(game: EducationalGame): ScenarioDraft {
  const situations: ScenarioSituation[] = game.questions
    .filter(question => question.type === 'scenario')
    .map(question => ({
      id: question.id,
      ...(question.context ? { context: question.context } : {}),
      prompt: question.prompt,
      options: question.options.map(option => ({
        id: option.id,
        text: option.text,
        ...(option.feedback ? { feedback: option.feedback } : {}),
        ...(option.nextQuestionId !== undefined ? { nextSituationId: option.nextQuestionId } : {}),
        ...(option.scenarioScore ? { score: { ...option.scenarioScore } } : {})
      })),
      ...(question.correctOptionId ? { correctOptionId: question.correctOptionId } : {}),
      ...(question.discussionPrompt ? { discussionPrompt: question.discussionPrompt } : {})
    }));

  if (!situations.length) {
    throw new GameAdapterError('ADAPTER_LEGACY_DATA_UNSUPPORTED', 'Trò chơi tình huống chưa có tình huống nào.');
  }

  return { gameType: 'scenario', schemaVersion: LESSON_SCHEMA_VERSION, situations };
}

function matchingDraftFromGame(game: EducationalGame): MatchingDraft {
  const matching = game.matchingGame;
  if (!matching) {
    throw new GameAdapterError('ADAPTER_LEGACY_DATA_UNSUPPORTED', 'Trò chơi ghép cặp thiếu dữ liệu ghép cặp.');
  }
  return {
    gameType: 'matching',
    schemaVersion: LESSON_SCHEMA_VERSION,
    mode: matching.mode,
    pairs: matching.pairs.map(pair => ({ id: pair.id, left: pair.left, right: pair.right })),
    pointsPerPair: safeInt(matching.pointsPerPair, 100),
    completionBonus: safeInt(matching.completionBonus, 0),
    wrongPenalty: safeInt(matching.wrongPenalty, 0),
    timeBonus: safeInt(matching.timeBonus, 0),
    bonusUnderSeconds: safeInt(matching.bonusUnderSeconds, 0),
    practiceMode: Boolean(matching.practiceMode)
  };
}

function treasureDraftFromGame(game: EducationalGame): TreasureDraft {
  const treasure = game.treasureHunt;
  if (!treasure) {
    throw new GameAdapterError('ADAPTER_LEGACY_DATA_UNSUPPORTED', 'Trò chơi hành trình thiếu dữ liệu hành trình.');
  }
  return {
    gameType: 'treasure',
    schemaVersion: LESSON_SCHEMA_VERSION,
    character: treasure.character || 'Nhà thám hiểm',
    intro: treasure.intro || '',
    journeyBonus: safeInt(treasure.journeyBonus, 0),
    hiddenItemBonus: safeInt(treasure.hiddenItemBonus, 0),
    stages: treasure.stages.map(stage => ({
      id: stage.id,
      name: stage.name,
      story: stage.story,
      taskDescription: stage.taskDescription,
      question: {
        prompt: stage.question.prompt,
        options: stage.question.options.map(option => ({ id: option.id, text: option.text })),
        correctOptionId: stage.question.correctOptionId,
        explanation: stage.question.explanation || '',
        ...(stage.question.hint ? { hint: stage.question.hint } : {})
      },
      attempts: safeInt(stage.attempts, 0),
      points: safeInt(stage.points, 100),
      completionBonus: safeInt(stage.completionBonus, 0),
      nextStageId: stage.nextStageId ?? null,
      ...(stage.branchStageId ? {
        branchLabel: stage.branchLabel || 'Đi theo nhánh phụ',
        branchStageId: stage.branchStageId
      } : {}),
      ...(stage.hasHiddenItem !== undefined ? { hasHiddenItem: stage.hasHiddenItem } : {})
    }))
  };
}

function raceDraftFromGame(game: EducationalGame): RaceDraft {
  const race = game.race;
  if (!race) {
    throw new GameAdapterError('ADAPTER_LEGACY_DATA_UNSUPPORTED', 'Trò chơi đường đua thiếu dữ liệu đường đua.');
  }
  return {
    gameType: 'race',
    schemaVersion: LESSON_SCHEMA_VERSION,
    trackLength: safeInt(race.trackLength, 20),
    maxRounds: safeInt(race.maxRounds, 10),
    stepByDifficulty: Boolean(race.stepByDifficulty),
    luckEnabled: Boolean(race.luckEnabled),
    teams: race.teams.map(team => ({
      id: team.id,
      name: team.name,
      ...(team.icon ? { icon: team.icon } : {})
    })),
    cells: race.cells
      .filter(cell => cell.type === 'boost' || cell.type === 'penalty' || cell.type === 'lucky' || cell.type === 'challenge')
      .map(cell => ({ cell: cell.cell, type: cell.type as RaceDraft['cells'][number]['type'], label: cell.label })),
    questions: race.questions.map(question => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options.map(option => ({ id: option.id, text: option.text })),
      correctOptionId: question.correctOptionId,
      explanation: question.explanation || '',
      difficulty: normalizeDifficulty(question.difficulty)
    }))
  };
}

// ---------------------------------------------------------------------------
// Config / setup
// ---------------------------------------------------------------------------

function gameSetupFor(config: GameConfig, legacy?: GameSetup): GameSetup {
  const derived: GameSetup = {
    difficulty: config.difficulty,
    duration: String(config.durationMinutes),
    style: styleLabel(config.style),
    players: config.playMode === 'team' ? 'đội nhóm' : 'cá nhân'
  };

  switch (config.gameType) {
    case 'arena':
      derived.scoringMode = arenaScoringLabel(config.scoringMode);
      derived.pointsPerCorrect = String(config.pointsPerCorrect);
      derived.timeBonus = String(config.timeBonus);
      if (config.pointsEasy !== undefined) derived.pointsEasy = String(config.pointsEasy);
      if (config.pointsMedium !== undefined) derived.pointsMedium = String(config.pointsMedium);
      if (config.pointsHard !== undefined) derived.pointsHard = String(config.pointsHard);
      break;
    case 'scenario':
      derived.scoringMode = 'cơ bản';
      break;
    case 'matching':
      derived.scoringMode = 'cơ bản';
      break;
    case 'treasure':
      break;
    case 'race':
      derived.scoringMode = 'thi đấu đội';
      derived.competition = 'đội';
      break;
    default:
      break;
  }

  return { ...(legacy || {}), ...derived };
}

function configFromGame(game: EducationalGame, gameType: GameDraft['gameType']): GameConfig {
  const setup = game.gameSetup || {};
  const base = {
    title: game.title || 'Trò chơi mới',
    subject: game.subject || '',
    grade: game.grade || '',
    topic: game.topic || '',
    audience: audienceFromGrade(game.grade),
    durationMinutes: clamp(safeInt(setup.duration, 15), 1, 120),
    difficulty: normalizeDifficulty(setup.difficulty),
    playMode: String(setup.players || '').toLowerCase().includes('đội') ? 'team' as const : 'individual' as const,
    style: styleFromLabel(setup.style),
    focusObjectiveIds: [] as string[],
    generationMode: 'fast' as const
  };

  switch (gameType) {
    case 'arena':
      return {
        ...base,
        gameType: 'arena',
        questionCount: clamp(game.questions.length, 1, 30),
        scoringMode: arenaScoringFromLabel(setup.scoringMode),
        pointsPerCorrect: clamp(safeInt(setup.pointsPerCorrect, 100), 0, 1000),
        timeBonus: clamp(safeInt(setup.timeBonus, 0), 0, 50),
        ...(setup.pointsEasy !== undefined ? { pointsEasy: clamp(safeInt(setup.pointsEasy, 100), 0, 1000) } : {}),
        ...(setup.pointsMedium !== undefined ? { pointsMedium: clamp(safeInt(setup.pointsMedium, 200), 0, 1000) } : {}),
        ...(setup.pointsHard !== undefined ? { pointsHard: clamp(safeInt(setup.pointsHard, 300), 0, 1000) } : {})
      };
    case 'scenario':
      return {
        ...base,
        gameType: 'scenario',
        situationCount: clamp(game.questions.filter(question => question.type === 'scenario').length, 1, 30),
        scoringMode: 'quality'
      };
    case 'matching': {
      const matching = game.matchingGame;
      return {
        ...base,
        gameType: 'matching',
        pairCount: clamp(matching?.pairs.length || 2, 2, 30),
        matchingMode: matching?.mode || 'columns',
        wrongPenalty: clamp(safeInt(matching?.wrongPenalty, 0), 0, 1000)
      };
    }
    case 'treasure': {
      const treasure = game.treasureHunt;
      return {
        ...base,
        gameType: 'treasure',
        stageCount: clamp(treasure?.stages.length || 2, 2, 30),
        attemptsPerStage: clamp(safeInt(treasure?.stages[0]?.attempts, 0), 0, 99),
        journeyBonus: clamp(safeInt(treasure?.journeyBonus, 0), 0, 10000),
        hiddenItemBonus: clamp(safeInt(treasure?.hiddenItemBonus, 0), 0, 1000)
      };
    }
    case 'race': {
      const race = game.race;
      return {
        ...base,
        gameType: 'race',
        trackLength: clamp(safeInt(race?.trackLength, 20), 3, 100),
        maxRounds: clamp(safeInt(race?.maxRounds, 10), 1, 50),
        teamCount: clamp(race?.teams.length || 2, 2, 6),
        stepByDifficulty: Boolean(race?.stepByDifficulty),
        luckEnabled: Boolean(race?.luckEnabled)
      };
    }
    default:
      throw new GameAdapterError('ADAPTER_UNKNOWN_TYPE', 'Loại trò chơi không được hỗ trợ.');
  }
}

function styleLabel(style: GameConfig['style']): string {
  switch (style) {
    case 'fun': return 'trò chơi';
    case 'exploration': return 'khám phá';
    case 'competition': return 'thi đua';
    case 'realistic': return 'thực tế';
    case 'minimal': return 'tối giản';
    default: return 'trò chơi';
  }
}

function styleFromLabel(value: string | undefined): GameConfig['style'] {
  const label = String(value || '').toLowerCase();
  if (label.includes('khám phá')) return 'exploration';
  if (label.includes('thi')) return 'competition';
  if (label.includes('thực')) return 'realistic';
  if (label.includes('tối giản')) return 'minimal';
  return 'fun';
}

function arenaScoringLabel(mode: ArenaScoringMode): string {
  switch (mode) {
    case 'speed': return 'tốc độ';
    case 'difficulty': return 'theo độ khó';
    case 'team': return 'thi đấu đội';
    case 'practice': return 'luyện tập';
    case 'basic': return 'cơ bản';
    default: return 'cơ bản';
  }
}

function arenaScoringFromLabel(value: string | undefined): ArenaScoringMode {
  const label = String(value || '').toLowerCase();
  if (label.includes('tốc')) return 'speed';
  if (label.includes('khó')) return 'difficulty';
  if (label.includes('đội')) return 'team';
  if (label.includes('luyện')) return 'practice';
  return 'basic';
}

function audienceFromGrade(grade: string | undefined): GameConfig['audience'] {
  const number = Number(String(grade || '').match(/\d+/)?.[0]);
  if (!Number.isFinite(number)) return 'teen';
  if (number <= 5) return 'child';
  if (number <= 9) return 'teen';
  return 'adult';
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateAdaptedGame(game: EducationalGame): void {
  try {
    switch (game.template) {
      case 'scenario':
        validateScenarioGame(game);
        break;
      case 'matching':
        validateMatchingGame(game);
        break;
      case 'treasure-hunt':
        validateTreasureHuntGame(game);
        break;
      case 'race':
        validateRaceGame(game);
        break;
      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new GameAdapterError(
      'ADAPTER_VALIDATION_FAILED',
      `Trò chơi sau khi chuyển đổi không vượt qua kiểm tra: ${message}`,
      [message]
    );
  }
}

function validateOriginalGame(game: EducationalGame): void {
  try {
    switch (game.template) {
      case 'scenario':
        validateScenarioGame(game);
        break;
      case 'matching':
        validateMatchingGame(game);
        break;
      case 'treasure-hunt':
        validateTreasureHuntGame(game);
        break;
      case 'race':
        validateRaceGame(game);
        break;
      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new GameAdapterError(
      'ADAPTER_LEGACY_DATA_UNSUPPORTED',
      `Trò chơi đã lưu chưa vượt qua kiểm tra dữ liệu: ${message}`,
      [message]
    );
  }
}

function normalizeDifficulty(value: unknown): QuestionDifficulty {
  return value === 'dễ' || value === 'khó' || value === 'trung bình' ? value : 'trung bình';
}

function safeInt(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
