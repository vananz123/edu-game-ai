/** Shared, versioned domain contracts for EduGame Studio. */
import type { GameProject } from './lesson-types';
import type { ContentCategory } from './content-categories';

/**
 * Optional per-item content metadata (docs/DECISIONS.md #60, #61, #62).
 *
 * All three fields are optional on purpose: every `.egame` file saved before
 * these existed must keep loading, and a missing value means "derive it"
 * (`contentCategory` -> `general`, `iconName` -> the category icon, no
 * illustration). Readers must normalise through `asset-validation.ts`, which
 * never throws.
 */
export interface ItemAssetFields {
  /** What the item is about. Unknown ids degrade to `general`. */
  contentCategory?: ContentCategory;
  /** Registry icon id (subset of Lucide). Unknown ids degrade to "no icon". */
  iconName?: string;
  /** App-owned illustration id; behaviour depends on the teacher's mode. */
  illustrationAssetId?: string | null;
}

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

export interface GameQuestion extends ItemAssetFields {
  id: string;
  type: QuestionType;
  prompt: string;
  options: GameOption[];
  correctOptionId: string;
  correctAnswer?: string;
  alternateAnswers?: string[];
  /** Hint shown on demand for text answers (fill-in-blank / short-answer). Never the answer itself. */
  hint?: string;
  explanation: string;
  points: number;
  difficulty?: QuestionDifficulty;
  discussionPrompt?: string;
  context?: string;
}

export type MatchingMode = 'columns' | 'memory' | 'categorize';

export interface MatchingPair extends ItemAssetFields {
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
export interface TreasureStageQuestion extends ItemAssetFields {
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

export interface RaceQuestion extends ItemAssetFields {
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
  /** Teacher's illustration choice (docs/DECISIONS.md #62, #65): 'auto' | 'manual' | 'off'. */
  illustrationMode?: string;
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

/**
 * Which llama.cpp build the local runtime runs on.
 *
 * `auto` keeps the measured default (CPU). `vulkan` asks for GPU offload —
 * useful on an integrated GPU because it shares system RAM and moves prefill
 * work off the CPU — and is always backed by a CPU retry, so a GPU that cannot
 * start never costs the teacher the app. `openvino` is declarable but no
 * verified build ships for it, so it falls back to CPU with a stated reason.
 */
export type RuntimeBackendPreference = 'auto' | 'cpu' | 'vulkan';

export interface AiSettings {
  mode: AiMode;
  cloudProvider?: 'openai' | 'gemini' | 'custom';
  baseUrl: string;
  model: string;
  localModelId?: string;
  /**
   * Teacher's explicit choice of runtime backend. Absent means `auto`, which
   * keeps the existing CPU default — an older settings file therefore keeps
   * behaving exactly as before.
   */
  runtimeBackend?: RuntimeBackendPreference;
  /** @deprecated #132: keys are per provider (`providers[id].apiKeyEncrypted`). */
  apiKey?: string;
  /** @deprecated #132: migrated into `providers` on first read. */
  apiKeyEncrypted?: string;
  /** #132: the provider Step 2 / Step 5 use by default (`local` on a new profile). */
  provider?: import('../services/ai-providers').AiProviderId;
  /** #132: `auto` = local → gemini → openai, first usable provider. */
  providerPolicy?: 'auto';
  /**
   * #132: per-provider configuration and the result of its last real request.
   * The renderer receives this as the key-free view (`AiProviderPublicView[]`).
   */
  providers?: Record<string, import('../services/ai-providers').StoredProviderConfig | undefined> | import('../services/ai-providers').AiProviderPublicView[];
  /** #132: true when the active provider has a stored key (the key itself never leaves main). */
  hasKey?: boolean;
  /** #132: `••••` + last four characters of the active provider's key. */
  keyMasked?: string;
  /** #132 §D7: the wizard picker, shown only when more than one provider is usable. */
  picker?: { show: boolean; options: Array<{ id: string; label: string; model: string }>; activeId: string };
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
  /** #123: deletes finished-play results by id; games are not affected. */
  deleteSessions(sessionIds: string[]): Promise<{ ok: boolean; deleted: number; missing: number }>;
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
  /** #132: key-free view — `ai.providers[].hasKey`/`keyMasked`, never `apiKey`. */
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<{ ok: boolean; settings?: AppSettings }>;
  /** #132: registry + provider state (same key-free view as `getSettings`). */
  getAiProviders(): Promise<AppSettings>;
  /** #132 §D6: one minimal real request to the named provider (never a generation). */
  testAiProvider(payload: { providerId: string }): Promise<{ ok: boolean; providerId: string; model: string; durationMs: number; detail: string; settings: AppSettings }>;
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
   *
   * #121: `limit`/`offset` page the history (newest first); `total` is the full count
   * so a caller can draw page numbers. History is capped at 30 rows (pruned on every
   * write), so there is at most one page beyond the current one.
   */
  listAiTasks(payload?: { limit?: number; offset?: number; history?: boolean }): Promise<{
    live: import('../services/ai-tasks').AiTaskSnapshot[];
    history: import('../services/ai-tasks').AiTaskSnapshot[];
    /** Rows in `ai_tasks` (history limit included). */
    total?: number;
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
  /**
   * O10: writes a single diagnostics .txt (machine facts + recent log lines) to
   * the Desktop (fallback: the log folder) and returns its absolute path.
   * Never uploads anything; no lesson/AI content.
   */
  exportDiagnostics(): Promise<{ path: string; lines: number; bytes: number; folder: string }>;
  /** O10: log folder + how many files/bytes are stored there. */
  diagnosticsInfo(): Promise<{ folder: string; files: number; bytes: number; retentionDays: number }>;
  /** O10: deletes the app's own log and bundle files (not files on the Desktop). */
  clearDiagnostics(): Promise<{ removed: number; bytes: number; folder: string }>;
  /** Opens the folder that holds the diagnostic log files. */
  openDiagnosticsFolder(): Promise<{ ok: boolean; path: string; error?: string }>;
  /** Rules-only input classification + question parsing (update_quy_trinh §2). No AI. */
  classifyLessonInput(payload: { text: string }): Promise<{
    classification: import('../services/input-classifier').InputClassification;
    kind: import('../services/input-classifier').InputKind;
    import: import('../services/question-import').QuestionImportResult | null;
    /**
     * How the verdict was reached (update_quy_trinh_2 §2): `'confirm'` / `'flipped'`
     * when MiniLM ran, `'unavailable'` when it was needed but not installed,
     * `'skipped'` when the text is empty or too long to embed.
     */
    semantic: 'confirm' | 'flipped' | 'unavailable' | 'skipped';
    /** Vietnamese note for the step-1 verdict line; empty when nothing to say. */
    semanticNote: string;
    /**
     * Which game can play this bank (DECISIONS #115). Pure scoring over the parsed
     * questions; computed in main so the renderer needs no module import, and empty
     * when the input is not a question bank.
     */
    compatibility: import('../services/question-compatibility').GameCompatibility[];
  }>;
  /** Convert an existing draft to another genre locally (update_quy_trinh §4). No AI. */
  convertLessonDraft(payload: {
    draft: import('./lesson-types').GameDraft;
    target: import('./lesson-types').WorkflowGameType;
    config: import('./lesson-types').GameConfig;
  }): Promise<import('../services/draft-convert').ConversionResult>;
  analyzeLesson(payload: {
    documentId: string;
    projectId?: string;
    analysisId?: string;
    mode?: 'fast' | 'deep';
    requestId: string;
    /** #132: a provider the teacher picked; absent = the automatic policy. */
    providerId?: string;
  }): Promise<{ analysis: import('./lesson-types').LessonAnalysis; project: GameProject }>;
  recommendGames(payload: {
    analysisId: string;
    projectId?: string;
    requestId: string;
  }): Promise<{ recommendations: import('./lesson-types').GameRecommendation[]; project: GameProject | null }>;
  /** Predicts a sensible item count from document length + analysis + model (no AI call). */
  estimateLessonCapacity(payload: {
    projectId: string;
    gameType: import('./lesson-types').WorkflowGameType;
    mode?: 'fast' | 'deep';
  }): Promise<import('../services/item-capacity').ItemCapacityEstimate>;
  getLessonAnalysis(analysisId: string): Promise<import('./lesson-types').LessonAnalysis | null>;
  /** Persists teacher edits to an analysis without calling the model again. */
  saveLessonAnalysis(analysis: import('./lesson-types').LessonAnalysis): Promise<import('./lesson-types').LessonAnalysis>;
  getLessonRecommendations(analysisId: string): Promise<import('./lesson-types').GameRecommendation[]>;
  /** Generates the configured game (fast/deep) and returns the validated snapshot. */
  generateLessonDraft(payload: {
    projectId: string;
    requestId: string;
    mode?: 'fast' | 'deep';
    /** #132: a provider the teacher picked; absent = the automatic policy. */
    providerId?: string;
    /**
     * #117: build the game from the draft only and never call the model. Used when a
     * recognised question bank already is the finished content.
     */
    localOnly?: boolean;
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
  /**
   * Phase B: changes only the artwork of one item (DECISIONS #72). Never calls the
   * model and never rewrites question text; the main process whitelists the three
   * asset fields. Positions are 1-based, like `regenerateLessonItem`.
   */
  /**
   * #124: picks one picture from disk. Main copies it into the app folder and answers
   * with an opaque id (`ci-…`) to store on the item, or `null` when cancelled.
   */
  importIllustration(sourcePath?: string): Promise<{ id: string; bytes: number; format?: string } | null>;
  /** #124: removes one uploaded picture by id (only ids this app produced). */
  deleteIllustration(imageId: string): Promise<{ ok: boolean }>;
  patchLessonItemAssets(payload: {
    projectId: string;
    itemIndex: number;
    patch: {
      contentCategory?: string;
      iconName?: string;
      illustrationAssetId?: string;
    };
  }): Promise<{
    project: GameProject;
    game: import('./types').EducationalGame;
    itemIndex: number;
    /** Normalised values that were actually applied. */
    applied: import('./asset-validation').ItemAssetFieldsForSave;
  }>;
  onLocalAiProgress(callback: (progress: import('../ai-core/contracts').LocalAiDownloadProgress) => void): () => void;
  generateGame(payload: GenerateGameRequest): Promise<GenerateGameResponse>;

  /**
   * LAN Classroom Mode. The teacher PC hosts the room; phones answer on the LAN.
   * Points are computed on the host, so the renderer only receives snapshots.
   * Returns `null` from `onLanState` when the room closes.
   */
  lanStart(payload: { game: EducationalGame }): Promise<import('./lan-types').LanStartResult>;
  lanStop(): Promise<{ ok: boolean }>;
  lanAssignTeam(payload: import('./lan-types').LanAssignTeamPayload): Promise<import('./lan-types').LanIpcResult>;
  /** Teacher opened the first question (the lobby stops waiting). */
  lanBegin(): Promise<import('./lan-types').LanIpcResult>;
  /** Teacher advanced the play screen: closes the open round for late answers. */
  lanNext(): Promise<import('./lan-types').LanIpcResult>;
  /** The desktop game reached its results: end the room and show the honour roll. */
  lanFinish(): Promise<import('./lan-types').LanIpcResult>;
  onLanState(callback: (snapshot: import('./lan-types').LanSnapshot | null) => void): () => void;
}

declare global {
  interface Window { eduGame: EduGameBridge; }
}
