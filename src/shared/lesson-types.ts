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

/** House model used by the quiz's House Building Mode (DECISIONS #144). */
export type HouseStyle = 'nha-mai-do' | 'nha-vuon' | 'thap-canh' | 'nha-go';

export interface ArenaConfig extends GameConfigBase {
  gameType: 'arena';
  questionCount: number;
  scoringMode: ArenaScoringMode;
  pointsPerCorrect: number;
  timeBonus: number;
  pointsEasy?: number;
  pointsMedium?: number;
  pointsHard?: number;
  /** Knowledge Arena mode (DECISIONS #140): 'classic' (default) | 'house'. */
  gameplayMode?: 'classic' | 'house';
  /** House model (DECISIONS #144): 'auto' (default) picks a stable model per game. */
  houseStyle?: 'auto' | HouseStyle;
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
  /** Constellation template (DECISIONS #168/#171); only read when `matchingMode` is 'connection'. */
  connectionTemplate?: string;
  /** Which pair half sits on a star (DECISIONS #171); absent = 'left-to-right'. */
  dragDirection?: 'left-to-right' | 'right-to-left';
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
  /** Constellation template (DECISIONS #168/#171); only carried by `mode: 'connection'`. */
  connectionTemplate?: string;
  /** Which pair half sits on a star (DECISIONS #171); absent = 'left-to-right'. */
  dragDirection?: 'left-to-right' | 'right-to-left';
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
  /**
   * Where `draft` came from (update_quy_trinh_2 review). `'imported-questions'` means
   * the teacher pasted a question bank and the analysis step was skipped on purpose,
   * so generating must not call the model. `'chat-questions'` is the same
   * no-model situation for a set the teacher accepted from the lesson chat.
   * Absent means "AI-produced", which still
   * requires an analysis — a draft is never treated as teacher-authored just because
   * `analysisId` happens to be null.
   */
  draftSource?: 'imported-questions' | 'chat-questions';
  /** Adapter output used to open the existing editor without calling AI again. */
  gameSnapshot: EducationalGame | null;
  /** Preserves the exact legacy setup when a saved game is opened in the wizard. */
  gameSetup?: GameSetup;
  gameId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Lesson chat (#182) — the two-column "Giáo án" page
// ---------------------------------------------------------------------------

export type LessonChatRole = 'user' | 'assistant';

/**
 * What the teacher asked for in a turn. Decided locally (never by a second model
 * call): `'answer'` quotes the lesson, `'question_set'` produces the predefined
 * arena shape so the set can hand straight over to the game wizard.
 */
export type LessonChatIntent = 'answer' | 'question_set';

/** One passage the answer is grounded in, tagged so merged documents stay readable. */
export interface LessonChatCitation {
  documentId: string;
  documentName: string;
  quote: string;
}

export interface LessonChatMessage {
  id: string;
  chatId: string;
  role: LessonChatRole;
  text: string;
  intent: LessonChatIntent;
  citations: LessonChatCitation[];
  /** Validated arena draft, present only on an assistant turn with `intent === 'question_set'`. */
  questionSet: ArenaDraft | null;
  /** Provider that produced this turn (`''` for a user turn or a failed run). */
  providerId: string;
  /** `LessonWorkflowError` code when the model failed; empty when it did not. */
  errorCode: string;
  createdAt: string;
}

/** A conversation without its messages — what the history list shows. */
export interface LessonChatSummary {
  id: string;
  schemaVersion: typeof LESSON_SCHEMA_VERSION;
  title: string;
  documentIds: string[];
  messageCount: number;
  lastIntent: LessonChatIntent | '';
  createdAt: string;
  updatedAt: string;
}

export interface LessonChat extends LessonChatSummary {
  messages: LessonChatMessage[];
}

/** One saved document plus the text the chat actually read (never sent back to the renderer). */
/**
 * The composer's mode switch. `'auto'` lets `classifyLessonChatIntent` decide;
 * the other two are the teacher overriding the heuristic, and they always win.
 */
export type LessonChatComposerMode = 'auto' | 'answer' | 'question_set';

export interface LessonChatSendInput {
  /** Absent or unknown id starts a new conversation. */
  chatId?: string;
  /** Every lesson the turn may read; the teacher may pick several (#182 "kết hợp nhiều giáo án"). */
  documentIds: string[];
  question: string;
  providerId?: string;
  requestId: string;
  mode?: LessonChatComposerMode;
  /** Overrides the count parsed from the question (the composer's number field). */
  questionCount?: number;
}

/** Result of one turn: the persisted conversation plus what the UI must paint. */
export interface LessonChatTurnResponse {
  chat: LessonChat;
  intent: LessonChatIntent;
  answer: string;
  citations: LessonChatCitation[];
  questionSet: ArenaDraft | null;
  providerId: string;
  /** Non-empty when the model failed; `answer` is then the honest fallback text. */
  errorCode: string;
  /** Characters of lesson text that went into the prompt (the "#180 tell-what-was-read" rule). */
  evidenceCharacters: number;
  /** True when nothing matched and the opening of each lesson was sent instead. */
  evidenceFallback: boolean;
  /** Attached lessons that contributed no quote at all. */
  namesWithoutEvidence: string[];
  /** How many questions the set was asked for (0 for an answer turn). */
  requestedCount: number;
}
