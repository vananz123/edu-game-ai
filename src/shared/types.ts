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

export interface TreasureStage {
  id: string;
  name: string;
  story: string;
  taskDescription: string;
  question: TreasureStageQuestion;
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
  preferences: { sound: boolean; largeText: boolean; teachingStyle?: TeachingStyle; audience?: 'child' | 'teen' | 'adult' };
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

export interface DocumentAssistRequest {
  operation: 'summarize' | 'ask';
  text: string;
  question?: string;
  analysis?: DocumentAnalysis;
  previousQuestions?: string[];
  sourceName?: string;
  subject?: string;
  grade?: string;
  mode: 'online' | 'local';
  localModelId?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
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
  importQuestions(): Promise<{ name: string; questions: GameQuestion[] } | null>;
  exportGame(game: EducationalGame): Promise<{ ok: boolean }>;
  importGame(): Promise<EducationalGame | null>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<{ ok: boolean }>;
  assistWithDocument(request: DocumentAssistRequest): Promise<DocumentAnalysis | DocumentAnswer>;
  getLocalAiModels(): Promise<{
    models: import('../ai-core/contracts').LocalAiModelStatus[];
    machine: import('../ai-core/contracts').LocalAiMachineProfile;
  }>;
  getLocalRuntimeStatus(): Promise<{ state: string; modelId?: string; message?: string }>;
  installLocalAiModel(modelId: string): Promise<{ ok: boolean }>;
  startLocalRuntime(modelId: string): Promise<{ ok: boolean; baseUrl: string }>;
  stopLocalRuntime(): Promise<{ ok: boolean }>;
  onLocalAiProgress(callback: (progress: import('../ai-core/contracts').LocalAiDownloadProgress) => void): () => void;
  generateGame(payload: GenerateGameRequest): Promise<GenerateGameResponse>;
}

declare global {
  interface Window { eduGame: EduGameBridge; }
}
