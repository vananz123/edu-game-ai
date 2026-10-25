/**
 * Workflow contracts for the AI-assisted lesson-to-game flow.
 *
 * These types are the canonical shape used by the new pipeline. They are
 * deliberately separate from `EducationalGame` (the saved/playable artifact):
 * `game-project-adapter.ts` is the only place that converts between the two.
 */
import type {
  EducationalGame,
  GameSetup,
  ItemAssetFields,
  MatchingMode,
  QuestionDifficulty,
  TreasureBackgroundId,
  TreasureCharacterId,
  TreasureStageMission
} from './types';

export type WorkflowGameType = 'arena' | 'scenario' | 'matching' | 'treasure' | 'race';
export type GenerationMode = 'fast' | 'deep';
export type CognitiveLevel = 'remember' | 'understand' | 'apply' | 'analyze';
export type WorkflowStep = 'input' | 'analyze' | 'recommend' | 'configure' | 'generate' | 'edit' | 'done';
export type GameProjectStatus = 'draft' | 'review' | 'ready';
export type Audience = 'child' | 'teen' | 'adult';
export type GameStyle = 'fun' | 'exploration' | 'competition' | 'realistic' | 'minimal';

export const LESSON_SCHEMA_VERSION = 1 as const;
export const WORKFLOW_GAME_TYPES: readonly WorkflowGameType[] = ['arena', 'scenario', 'matching', 'treasure', 'race'];

// ---------------------------------------------------------------------------
// Lesson document + analysis
// ---------------------------------------------------------------------------

export interface LessonDocument {
  id: string;
  schemaVersion: typeof LESSON_SCHEMA_VERSION;
  name: string;
  ext: string;
  sizeBytes: number;
  characters: number;
  createdAt: string;
}

export interface LessonObjective {
  id: string;
  description: string;
  cognitiveLevel: CognitiveLevel;
  sourceExcerpt?: string;
}

export interface KeyConcept {
  id: string;
  term: string;
  explanation: string;
  sourceExcerpt?: string;
}

export interface LessonAnalysis {
  id: string;
  schemaVersion: typeof LESSON_SCHEMA_VERSION;
  documentId: string;
  subject: string | null;
  grade: number | null;
  topic: string;
  objectives: LessonObjective[];
  keyConcepts: KeyConcept[];
  uncertainties: string[];
  sourceDocumentIds: string[];
  createdAt: string;
}

/** What the model is asked to return for `lesson:analyze` (ids/timestamps added by the app). */
export interface LessonAnalysisContent {
  subject: string | null;
  grade: number | null;
  topic: string;
  objectives: Array<Omit<LessonObjective, 'id'>>;
  keyConcepts: Array<Omit<KeyConcept, 'id'>>;
  uncertainties: string[];
}

export interface GameRecommendation {
  id: string;
  schemaVersion: typeof LESSON_SCHEMA_VERSION;
  analysisId: string;
  gameType: WorkflowGameType;
  title: string;
  description: string;
  reason: string;
  learningObjectiveIds: string[];
  suggestedDurationMinutes: number;
  suggestedQuestionCount?: number;
  createdAt: string;
}

/** What the model is asked to return for `lesson:recommend`. */
export interface GameRecommendationContent {
  gameType: WorkflowGameType;
  title: string;
  description: string;
  reason: string;
  learningObjectiveIds: string[];
  suggestedDurationMinutes: number;
  suggestedQuestionCount?: number;
}

// ---------------------------------------------------------------------------
// Per-type configuration (only settings that matter for that game type)
// ---------------------------------------------------------------------------

export interface GameConfigBase {
  title: string;
  subject: string;
  grade: string;
  topic: string;
  audience: Audience;
  durationMinutes: number;
  difficulty: QuestionDifficulty;
  playMode: 'individual' | 'team';
  style: GameStyle;
  focusObjectiveIds: string[];
  generationMode: GenerationMode;
}

export type ArenaScoringMode = 'basic' | 'speed' | 'difficulty' | 'team' | 'practice';

export interface ArenaConfig extends GameConfigBase {
  gameType: 'arena';
  questionCount: number;
  scoringMode: ArenaScoringMode;
  pointsPerCorrect: number;
  timeBonus: number;
  pointsEasy?: number;
  pointsMedium?: number;
  pointsHard?: number;
}

export interface ScenarioConfig extends GameConfigBase {
  gameType: 'scenario';
  situationCount: number;
  scoringMode: 'quality' | 'simple';
}

export interface MatchingConfig extends GameConfigBase {
  gameType: 'matching';
  pairCount: number;
  matchingMode: MatchingMode;
  wrongPenalty: number;
}

export interface TreasureConfig extends GameConfigBase {
  gameType: 'treasure';
  stageCount: number;
  attemptsPerStage: number;
  journeyBonus: number;
  hiddenItemBonus: number;
}

export interface RaceConfig extends GameConfigBase {
  gameType: 'race';
  trackLength: number;
  maxRounds: number;
  teamCount: number;
  stepByDifficulty: boolean;
  luckEnabled: boolean;
}

export type GameConfig = ArenaConfig | ScenarioConfig | MatchingConfig | TreasureConfig | RaceConfig;

// ---------------------------------------------------------------------------
// Draft content (discriminated union)
// ---------------------------------------------------------------------------

export interface ArenaOption {
  id: string;
  text: string;
}

export interface ArenaChoiceQuestion extends ItemAssetFields {
  id: string;
  type: 'multiple-choice' | 'true-false';
  prompt: string;
  options: ArenaOption[];
  correctOptionId: string;
  explanation: string;
  difficulty: QuestionDifficulty;
  points: number;
}

export interface ArenaTextQuestion extends ItemAssetFields {
  id: string;
  type: 'fill-in-blank' | 'short-answer';
  prompt: string;
  correctAnswer: string;
  alternateAnswers?: string[];
  explanation: string;
  difficulty: QuestionDifficulty;
  points: number;
}

export type ArenaQuestion = ArenaChoiceQuestion | ArenaTextQuestion;

export interface ArenaDraft {
  gameType: 'arena';
  schemaVersion: typeof LESSON_SCHEMA_VERSION;
  questions: ArenaQuestion[];
}

export interface ScenarioDecisionScore {
  safety: number;
  reasoning: number;
  harmReduction: number;
}

export interface ScenarioOption {
  id: string;
  text: string;
  feedback?: string;
  consequence?: string;
  nextSituationId?: string | null;
  score?: ScenarioDecisionScore;
}

export interface ScenarioSituation extends ItemAssetFields {
  id: string;
  context?: string;
  prompt: string;
  options: ScenarioOption[];
  /** Best decision; defaults to the highest-scoring option when omitted. */
  correctOptionId?: string;
  discussionPrompt?: string;
}

export interface ScenarioDraft {
  gameType: 'scenario';
  schemaVersion: typeof LESSON_SCHEMA_VERSION;
  situations: ScenarioSituation[];
}

export interface MatchingPairDraft extends ItemAssetFields {
  id: string;
  left: string;
  right: string;
}

export interface MatchingDraft {
  gameType: 'matching';
  schemaVersion: typeof LESSON_SCHEMA_VERSION;
  mode: MatchingMode;
  pairs: MatchingPairDraft[];
  pointsPerPair: number;
  completionBonus: number;
  wrongPenalty: number;
  timeBonus: number;
  bonusUnderSeconds: number;
  practiceMode: boolean;
}

export interface TreasureQuestionDraft extends ItemAssetFields {
  prompt: string;
  options: ArenaOption[];
  correctOptionId: string;
  explanation: string;
  hint?: string;
}

export interface TreasureStageDraft {
  id: string;
  name: string;
  story: string;
  taskDescription: string;
  question: TreasureQuestionDraft;
  /** Optional mission mechanic; absent = the legacy multiple-choice question. */
  mission?: TreasureStageMission;
  attempts: number;
  points: number;
  completionBonus: number;
  /** `null`/omitted on the last stage; when omitted elsewhere the adapter chains stages in order. */
  nextStageId?: string | null;
  branchLabel?: string;
  branchStageId?: string;
  hasHiddenItem?: boolean;
}

export interface TreasureDraft {
  gameType: 'treasure';
  schemaVersion: typeof LESSON_SCHEMA_VERSION;
  character: string;
  intro: string;
  journeyBonus: number;
  hiddenItemBonus: number;
  backgroundId?: TreasureBackgroundId;
  characterId?: TreasureCharacterId;
  stages: TreasureStageDraft[];
}

export interface RaceTeamDraft {
  id: string;
  name: string;
  icon?: string;
}

export interface RaceCellDraft {
  cell: number;
  type: 'boost' | 'penalty' | 'lucky' | 'challenge';
  label: string;
}

export interface RaceQuestionDraft extends ItemAssetFields {
  id: string;
  prompt: string;
  options: ArenaOption[];
  correctOptionId: string;
  explanation: string;
  difficulty: QuestionDifficulty;
}

export interface RaceDraft {
  gameType: 'race';
  schemaVersion: typeof LESSON_SCHEMA_VERSION;
  trackLength: number;
  maxRounds: number;
  stepByDifficulty: boolean;
  luckEnabled: boolean;
  teams: RaceTeamDraft[];
  cells: RaceCellDraft[];
  questions: RaceQuestionDraft[];
}

export type GameDraft = ArenaDraft | ScenarioDraft | MatchingDraft | TreasureDraft | RaceDraft;

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface GameProject {
  id: string;
  schemaVersion: typeof LESSON_SCHEMA_VERSION;
  status: GameProjectStatus;
  step: WorkflowStep;
  title: string;
  description: string;
  tags: string[];
  sourceName: string;
  lesson: { documentId: string; name: string; characters: number } | null;
  analysisId: string | null;
  recommendationId: string | null;
  config: GameConfig | null;
  draft: GameDraft | null;
  /** Adapter output used to open the existing editor without calling AI again. */
  gameSnapshot: EducationalGame | null;
  /** Preserves the exact legacy setup when a saved game is opened in the wizard. */
  gameSetup?: GameSetup;
  gameId: string | null;
  createdAt: string;
  updatedAt: string;
}
