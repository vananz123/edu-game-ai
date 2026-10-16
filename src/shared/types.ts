/** Shared, versioned domain contracts for EduGame Studio. */
export type GameTemplate = 'quiz' | 'scenario' | 'matching';
export type QuestionType = 'multiple-choice' | 'scenario' | 'matching';

export interface GameOption {
  id: string;
  text: string;
}

export interface GameQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  options: GameOption[];
  correctOptionId: string;
  explanation: string;
  points: number;
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

export type AiMode = 'offline' | 'online';
export interface AiSettings {
  mode: AiMode;
  baseUrl: string;
  model: string;
  apiKey?: string;
  apiKeyEncrypted?: string;
}

export interface AppSettings {
  ai: AiSettings;
  preferences: { sound: boolean; largeText: boolean };
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
  importDocument(): Promise<{ name: string; text: string } | null>;
  exportGame(game: EducationalGame): Promise<{ ok: boolean }>;
  importGame(): Promise<EducationalGame | null>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<{ ok: boolean }>;
  generateGame(payload: GenerateGameRequest): Promise<GenerateGameResponse>;
}

declare global {
  interface Window { eduGame: EduGameBridge; }
}
