/* LAN Classroom Mode shared types and IPC contracts. */

/**
 * IPC channel names for LAN Classroom Mode.
 *
 * `START` / `STOP` / `TEAM` / `BEGIN` / `NEXT` are renderer -> main. `STATE` is
 * main -> renderer and carries a `LanSnapshot`, the only thing the renderer is
 * allowed to draw from.
 *
 * `BEGIN` (lobby -> first question) and `NEXT` (close the open round) exist because
 * the teacher drives the lesson from the play screen, not from the LAN panel: the
 * desktop's own "Câu tiếp theo" / "Tiếp tục" buttons call them, so the projector
 * and the phones can never disagree about which question is open.
 *
 * `FINISH` ends the room when the desktop game reaches its results screen. Without it
 * a LAN game that ends by any other route (treasure "Kết thúc hành trình", the last
 * stage, a branch) kept the room open and never showed the honour roll.
 *
 * The LAN server is the source of truth for points; the renderer never sends a
 * score, only intents.
 */
export const LAN_CHANNELS = {
  START: 'lan:start',
  STOP: 'lan:stop',
  TEAM: 'lan:assign-team',
  BEGIN: 'lan:begin',
  NEXT: 'lan:next',
  FINISH: 'lan:finish',
  STATE: 'lan:state',
} as const;

/** Game engines LAN v1 can run. Everything else reports `supported: false`. */
export type LanEngine = 'quiz' | 'treasure';

/** What the teacher has to do on the projector before phones can answer. */
export type LanPhoneInput =
  | { kind: 'options'; options: { id: string; text: string }[] }
  | { kind: 'text'; placeholder: string }
  | { kind: 'unsupported'; reason: string };

export interface LanTeam {
  id: string;
  name: string;
  icon: string;
}

/** A pupil as the projector and the teacher screen see them (never a token). */
export interface LanPlayerSummary {
  id: string;
  name: string;
  teamId: string;
  connected: boolean;
  points: number;
  correct: number;
  answered: number;
}

/** Result of a finished question or journey stage, used on the projector. */
export interface LanRoundResult {
  label: string;
  prompt: string;
  correctOptionId?: string;
  correctAnswer?: string;
  maxPoints: number;
  answered: number;
  correctCount: number;
  perPlayer: { id: string; name: string; teamId: string; score: number; correct: boolean }[];
}

/** Teacher-facing snapshot pushed to the renderer on every change. */
export interface LanSnapshot {
  state: 'lobby' | 'question' | 'reveal' | 'finished';
  roomCode: string;
  urls: string[];
  engine: LanEngine;
  gameId: string;
  gameTitle: string;
  /** Locked at `lan:start()`; `lan:assign-team` is refused afterwards. */
  teams: LanTeam[];
  teamLocked: boolean;
  /** 1-based position of the current question / journey stage (0 in the lobby). */
  roundIndex: number;
  roundCount: number;
  /** 0-based index of the open round; `-1` in the lobby. */
  currentRoundIndex: number;
  /** 0-based index into `results` for `lastResult`; `-1` before the first close. */
  lastRound: number;
  /** Scoring mode actually used, and a note when LAN differs from the desktop. */
  scoringMode: string;
  scoringNote: string;
  /** What phones may send right now; `null` while the lobby is open. */
  input: LanPhoneInput | null;
  prompt: string;
  kicker: string;
  players: LanPlayerSummary[];
  answeredCount: number;
  lastResult: LanRoundResult | null;
  score: { points: number; max: number; percent: number };
  error?: string;
}

/**
 * How long a round stays open. When it elapses the desktop closes the round as
 * if the teacher pressed "Chốt câu", so one pupil's stalled phone cannot block
 * the class. It is generous because classroom Wi-Fi is not fast.
 */
export const LAN_ANSWER_WINDOW_MS = 60_000;

export const LAN_START_CHANNEL_RESULT = {
  OK: 'ok',
  UNSUPPORTED: 'unsupported',
  ALREADY_RUNNING: 'already-running',
  BIND_FAILED: 'bind-failed',
  NO_GAME: 'no-game',
} as const;

export type LanStartStatus = (typeof LAN_START_CHANNEL_RESULT)[keyof typeof LAN_START_CHANNEL_RESULT];

export interface LanStartPayload {
  /** The exact game the teacher is playing; LAN must score the same questions. */
  game: unknown;
}

export type LanStartResult =
  | { ok: true; snapshot: LanSnapshot }
  | { ok: false; status: LanStartStatus; message: string };

export interface LanAssignTeamPayload {
  playerId: string;
  teamId: string;
}

export type LanIpcResult =
  | { ok: true; snapshot: LanSnapshot | null }
  | { ok: false; status: string; message: string };
