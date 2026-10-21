/** Shared, versioned domain contracts for EduGame Studio. */
import type { GameProject } from './lesson-types';

export type GameTemplate = 'quiz' | 'scenario' | 'matching' | 'treasure-hunt' | 'race';
export type QuestionType = 'multiple-choice' | 'true-false' | 'fill-in-blank' | 'short-answer' | 'scenario' | 'matching' | 'treasure-hunt' | 'race';
export type QuestionDifficulty = 'dễ' | 'trung bình' | 'khó';

export interface GameOption {
  id: string;
  text: string;
  feedback?: string;
  nextQuestionId?: string | null;
  /** Explicit branch end (manual editor). `null` nextQuestionId alone means "next". */
  endsScenario?: boolean;
  scenarioScore?: {
    safety: number;
    reasoning: number;
    harmReduction: number;
  };
}

export interface GameQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  options: GameOption[];
  correctOptionId: string;
  correctAnswer?: string;
  alternateAnswers?: string[];
  explanation: string;
  points: number;
  difficulty?: QuestionDifficulty;
  discussionPrompt?: string;
  context?: string;
}

export type MatchingMode = 'columns' | 'memory' | 'categorize';

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface MatchingGameData {
  mode: MatchingMode;
  pairs: MatchingPair[];
  pointsPerPair: number;
  completionBonus: number;
  wrongPenalty: number;
  timeBonus: number;
  bonusUnderSeconds: number;
  practiceMode: boolean;
}

/** §5 tasknight.docx — journey/treasure-hunt stage data. */
export interface TreasureStageQuestion {
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  explanation: string;
  hint: string;
}

/** §5.4 — the teacher can pick a different mission mechanic for every stage. */
export type TreasureMissionType =
  | 'multiple-choice'
  | 'scenario'
  | 'matching'
  | 'decode'
  | 'classification';

export interface TreasureMatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface TreasureClassificationGroup {
  id: string;
  name: string;
}

export interface TreasureClassificationItem {
  id: string;
  text: string;
  groupId: string;
}

/**
 * Optional per-stage mission payload. A missing `mission` means the legacy
 * multiple-choice question in `TreasureStage.question`, so existing `.egame`
 * files stay valid. Choice/scenario missions reuse `question.options`.
 */
export type TreasureStageMission =
  | { type: 'multiple-choice' }
  | { type: 'scenario' }
  | { type: 'matching'; pairs: TreasureMatchingPair[] }
  | { type: 'decode'; answer: string; cipher?: string }
  | {
    type: 'classification';
    groups: TreasureClassificationGroup[];
    items: TreasureClassificationItem[];
  };

/** Built-in illustrated scenes. Missing values fall back to `temple`. */
export type TreasureBackgroundId = 'temple' | 'forest' | 'ice' | 'desert' | 'ocean' | 'space';

/** Built-in illustrated roles. Missing values fall back to `explorer`. */
export type TreasureCharacterId = 'explorer' | 'scientist' | 'biologist' | 'astronaut' | 'diver';

export interface TreasureStage {
  id: string;
  name: string;
  story: string;
  taskDescription: string;
  question: TreasureStageQuestion;
  /** Absent = legacy multiple-choice mission. */
  mission?: TreasureStageMission;
  /** 0 = unlimited attempts. */
  attempts: number;
  points: number;
  completionBonus: number;
  /** null = this stage is an ending. */
  nextStageId: string | null;
  /** Optional pupil choice after clearing the stage. */
  branchLabel?: string;
  branchStageId?: string;
  hasHiddenItem?: boolean;
}

export interface TreasureHuntData {
  character: string;
  intro: string;
  journeyBonus: number;
  hiddenItemBonus: number;
  /** Optional visual theme. Old `.egame` files omit it and get `temple`. */
  backgroundId?: TreasureBackgroundId;
  /** Optional avatar role. Old `.egame` files omit it and get `explorer`. */
  characterId?: TreasureCharacterId;
  stages: TreasureStage[];
}

/** §6 tasknight.docx — classroom race board data. */
export type RaceCellType = 'normal' | 'boost' | 'penalty' | 'lucky' | 'challenge';

export interface RaceTeam {
  id: string;
  name: string;
  icon: string;
}

export interface RaceSpecialCell {
  cell: number;
  type: RaceCellType;
  label: string;
}

export interface RaceQuestion {
  id: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  explanation: string;
  difficulty?: QuestionDifficulty;
}

export interface RaceData {
  trackLength: number;
  maxRounds: number;
  stepByDifficulty: boolean;
  luckEnabled: boolean;
  teams: RaceTeam[];
  cells: RaceSpecialCell[];
  questions: RaceQuestion[];
}

/** Teacher-facing game setup captured on the create page (Zone D), §2.3 of tasknight.docx. */
export interface GameSetup {
  scoringMode?: string;
  difficulty?: string;
  duration?: string;
  pointsPerCorrect?: string;
  pointsEasy?: string;
  pointsMedium?: string;
  pointsHard?: string;
  timeBonus?: string;
  style?: string;
  players?: string;
  competition?: string;
  [key: string]: string | undefined;
}

export interface EducationalGame {
  id: string;
  title: string;
  subject: string;
  grade: string;
  topic: string;
  template: GameTemplate;
  description: string;
  questions: GameQuestion[];
  tags: string[];
  sourceName: string;
  createdAt: string;
  updatedAt?: string;
  gameSetup?: GameSetup;
  matchingGame?: MatchingGameData;
  treasureHunt?: TreasureHuntData;
  race?: RaceData;
}

export interface GameSession {
  id?: string;
  gameId?: string;
  gameTitle?: string;
  points?: number;
  maxPoints?: number;
  correct?: number;
  total?: number;
  createdAt?: string;
  [key: string]: unknown;
}

export interface LocalLibrary {
  version: 1;
  games: EducationalGame[];
  sessions: GameSession[];
}

export type AiMode = 'offline' | 'online' | 'local';
export interface AiSettings {
  mode: AiMode;
  cloudProvider?: 'openai' | 'gemini' | 'custom';
  baseUrl: string;
  model: string;
  localModelId?: string;
  apiKey?: string;
  apiKeyEncrypted?: string;
}

/** §7 tasknight.docx: one-time teacher style profile reused as AI default for new games. */
export interface TeachingStyle {
  tone?: string;
  humor?: string;
  examples?: string;
  visualStyle?: string;
  notes?: string;
}

export interface AppSettings {
  ai: AiSettings;
  preferences: { sound: boolean; largeText: boolean; teachingStyle?: TeachingStyle; audience?: 'child' | 'teen' | 'adult'; theme?: 'light' | 'dark' | 'system' };
}

export interface GenerateGameRequest {
  text: string;
  sourceName?: string;
  questionCount?: number;
  template?: GameTemplate;
  grade?: string;
  subject?: string;
  mode?: AiMode;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  analysis?: DocumentAnalysis;
  qaEntries?: Array<{ question: string; answer: DocumentAnswer }>;
  useSuggestedQuestions?: boolean;
}

export interface DocumentAnalysis {
  summary: string;
  keyPoints: string[];
  suggestedQuestions: string[];
  sourceExcerpted?: boolean;
  recommendedGames: Array<{
    template: GameTemplate;
    title: string;
    reason: string;
  }>;
}

export interface DocumentAnswer {
  answer: string;
  evidence: string[];
  supported?: boolean;
  suggestedQuestions?: string[];
}

export interface GenerateGameResponse {
  game: EducationalGame;
  provider: string;
}

export interface EduGameBridge {
  appInfo(): Promise<{ version: string; platform: string; userData: string }>;
  getLibrary(): Promise<LocalLibrary>;
  saveGame(game: EducationalGame): Promise<EducationalGame>;
  deleteGame(id: string): Promise<{ ok: boolean }>;
  saveSession(session: GameSession): Promise<{ ok: boolean }>;
  saveLessonDocument(payload: { documentId?: string; name: string; ext: string; sizeBytes?: number; text: string; characters?: number }): Promise<import('./lesson-types').LessonDocument>;
  getLessonDocument(documentId: string): Promise<(import('./lesson-types').LessonDocument & { text: string }) | null>;
  saveProjectDraft(project: GameProject): Promise<GameProject>;
  getProject(projectId: string): Promise<GameProject | null>;
  listProjects(): Promise<GameProject[]>;
  deleteProject(projectId: string): Promise<{ ok: boolean }>;
  importDocument(): Promise<{ name: string; text: string } | null>;
  importDocumentFromPath(filePath: string): Promise<{ name: string; text: string; path?: string; characters?: number; sizeBytes?: number } | null>;
  setFullscreen(enabled: boolean): Promise<{ ok: boolean }>;
  onFullscreenChanged(callback: (enabled: boolean) => void): () => void;
  importQuestions(): Promise<{ name: string; questions: GameQuestion[] } | null>;
  exportGame(game: EducationalGame): Promise<{ ok: boolean }>;
  importGame(): Promise<EducationalGame | null>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<{ ok: boolean }>;
  getLocalAiModels(): Promise<{
    models: import('../ai-core/contracts').LocalAiModelStatus[];
    machine: import('../ai-core/contracts').LocalAiMachineProfile;
  }>;
  getLocalRuntimeStatus(): Promise<{ state: string; modelId?: string; message?: string }>;
  installLocalAiModel(modelId: string): Promise<{ ok: boolean }>;
  startLocalRuntime(modelId: string): Promise<{ ok: boolean; baseUrl: string }>;
  stopLocalRuntime(): Promise<{ ok: boolean }>;
  /** Cancels an in-flight AI request by the `requestId` passed to a workflow call. */
  cancelAi(requestId: string): Promise<{ ok: boolean }>;
  /**
   * update_plan_3 §8: live task registry + SQLite history. Rows restored from
   * history always carry `restored: true` (never faked as "running").
   */
  listAiTasks(payload?: { limit?: number }): Promise<{
    live: import('../services/ai-tasks').AiTaskSnapshot[];
    history: import('../services/ai-tasks').AiTaskSnapshot[];
  }>;
  /** update_plan_3 §4: measured CPU-only facts about the bundled llama.cpp runtime. */
  verifyCpuRuntime(): Promise<{
    cpuOnly: boolean;
    backend: string;
    expectedVersion: string;
    expectedDownloadUrl: string;
    expectedSizeBytes: number;
    executablePath: string | null;
    installed: boolean;
    files: string[];
    gpuMarkers: string[];
    gpuBackendShipped: boolean;
    args: string[];
    note: string;
  }>;
  analyzeLesson(payload: {
    documentId: string;
    projectId?: string;
    analysisId?: string;
    mode?: 'fast' | 'deep';
    requestId: string;
  }): Promise<{ analysis: import('./lesson-types').LessonAnalysis; project: GameProject }>;
  recommendGames(payload: {
    analysisId: string;
    projectId?: string;
    requestId: string;
  }): Promise<{ recommendations: import('./lesson-types').GameRecommendation[]; project: GameProject | null }>;
  getLessonAnalysis(analysisId: string): Promise<import('./lesson-types').LessonAnalysis | null>;
  /** Persists teacher edits to an analysis without calling the model again. */
  saveLessonAnalysis(analysis: import('./lesson-types').LessonAnalysis): Promise<import('./lesson-types').LessonAnalysis>;
  getLessonRecommendations(analysisId: string): Promise<import('./lesson-types').GameRecommendation[]>;
  /** Generates the configured game (fast/deep) and returns the validated snapshot. */
  generateLessonDraft(payload: {
    projectId: string;
    requestId: string;
    mode?: 'fast' | 'deep';
  }): Promise<{
    project: GameProject;
    game: import('./types').EducationalGame;
    mode: 'fast' | 'deep';
    /** Deterministic content-quality findings (O2); advisory, no model call. */
    quality: import('../services/lesson-quality').QualityReport;
    /** Which lesson chunks were retrieved for the prompt (O3); no model call. */
    context: {
      chunkCount: number;
      selectedChunkCount: number;
      characters: number;
      scorer: string;
      fallback: boolean;
    };
  }>;
  /** Recomputes the advisory quality report for a stored draft (no model call). */
  checkLessonQuality(payload: { projectId: string }): Promise<import('../services/lesson-quality').QualityReport | null>;
  onLocalAiProgress(callback: (progress: import('../ai-core/contracts').LocalAiDownloadProgress) => void): () => void;
  generateGame(payload: GenerateGameRequest): Promise<GenerateGameResponse>;
}

declare global {
  interface Window { eduGame: EduGameBridge; }
}
