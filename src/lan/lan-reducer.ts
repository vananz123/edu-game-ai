/* LAN Classroom Mode state machine.
 *
 * Pure: no Electron, no sockets, no timers, no Date. Every input is in the action
 * and every output is a new state object, so tests can drive a whole lesson
 * synchronously. The server (src/lan/lan-server.ts) only calls `lanReduce`:
 *
 *     lanReduce(state, { type: 'join', roomCode, name, now })
 *
 * Points are computed by `src/lan/lan-adapters.ts` from the same
 * `src/game-engine/runtime.ts` helpers the desktop renderer uses; this file only
 * decides *whether* an answer counts (one answer per player per round, reveal
 * closes the round).
 */

import type { LanPhoneInput, LanRoundResult, LanTeam } from '../shared/lan-types';

export type LanStateName = 'lobby' | 'question' | 'reveal' | 'finished';

export interface LanPlayer {
  id: string;
  /** Server-only; returned once by `join` and never part of a snapshot. */
  token: string;
  name: string;
  teamId: string;
  connected: boolean;
  points: number;
  correct: number;
  answered: number;
  joinedAt: number;
}

export interface LanPlayerAnswer {
  optionId: string | null;
  answerText: string;
  correct: boolean;
  points: number;
  answeredAt: number;
}

/** One question, or one journey stage: everything needed to score it. */
export interface LanRound {
  label: string;
  prompt: string;
  context?: string;
  story?: string;
  task?: string;
  input: LanPhoneInput;
  /** Already-resolved max points for a correct answer in this round. */
  maxPoints: number;
  /** Produces the scored result for one player's intent. Never rendered here. */
  score: (optionId: string | null, answerText: string) => { correct: boolean; points: number };
  /** Read back the answer key once the round is revealed. */
  answerKey: () => Pick<LanRoundResult, 'correctOptionId' | 'correctAnswer'>;
}

export interface LanGamePlan {
  gameId: string;
  gameTitle: string;
  engine: 'quiz' | 'treasure';
  teams: LanTeam[];
  /** Effective LAN scoring mode and a teacher-facing note when it changed. */
  scoringMode: LanScoringMode;
  scoringNote: string;
  rounds: LanRound[];
}

export interface LanState {
  phase: LanStateName;
  roomCode: string;
  gameId: string;
  gameTitle: string;
  engine: 'quiz' | 'treasure';
  scoringMode: LanScoringMode;
  scoringNote: string;
  teams: LanTeam[];
  teamLocked: boolean;
  rounds: LanRound[];
  roundIndex: number;
  players: LanPlayer[];
  answers: Record<string, Record<string, LanPlayerAnswer>>;
  results: LanRoundResult[];
  /** Sum of every awarded point so far, for the projector's running score. */
  earned: number;
  startedAt: number;
  finishedAt: number | null;
}

export type LanAction =
  | { type: 'join'; roomCode: string; name: string; now: number; token: string; id: string }
  | { type: 'reconnect'; roomCode: string; token: string; now: number }
  | { type: 'disconnect'; token: string; now: number }
  | { type: 'assign-team'; playerId: string; teamId: string }
  | { type: 'answer'; token: string; optionId: string | null; answerText?: string; now: number }
  | { type: 'next-round'; now: number }
  | { type: 'finish'; now: number };

/**
 * `outcome` is a string discriminant, not the boolean `ok`. With this project's
 * `strict: false` a boolean literal widens to `boolean`, which stops TypeScript
 * narrowing `if (result.outcome === 'refused')`; the string does not widen.
 * `ok` is kept as a convenience mirror for callers that only branch on success.
 */
export type LanReduceSuccess = { outcome: 'done'; ok: true; state: LanState; playerId?: string };
export type LanReduceFailure = { outcome: 'refused'; ok: false; status: LanErrorStatus; message: string };
export type LanReduceResult = LanReduceSuccess | LanReduceFailure;

export type LanErrorStatus =
  | 'not-open'
  | 'wrong-room'
  | 'bad-name'
  | 'room-full'
  | 'name-taken'
  | 'not-in-room'
  | 'wrong-phase'
  | 'already-answered'
  | 'bad-answer'
  | 'unknown-team'
  | 'teams-locked';

/** Documents the room codes teachers read aloud; 30 pupils covers a small class. */
export const LAN_PLAYER_LIMIT = 40;
export const LAN_NAME_LIMIT = 24;

/**
 * Scoring mode LAN actually uses. A pupil's phone cannot know how long the
 * *teacher* took, so `tốc độ` becomes `cơ bản` (same base points, no time bonus).
 * Every other mode passes through to the shared runtime helpers unchanged.
 */
export type LanScoringMode = 'cơ bản' | 'theo độ khó' | 'thi đấu đội' | 'luyện tập';

/** Scoring mode for a game, and why it differs from the desktop when it does. */
export function lanScoringMode(rawMode: unknown): { mode: LanScoringMode; note: string } {
  const mode = String(rawMode ?? '');
  if (mode === 'tốc độ') return { mode: 'cơ bản', note: 'LAN không tính thưởng tốc độ: mỗi câu đúng nhận điểm cơ bản.' };
  if (mode === 'theo độ khó' || mode === 'thi đấu đội' || mode === 'luyện tập' || mode === 'cơ bản') return { mode, note: '' };
  return { mode: 'cơ bản', note: '' };
}

/** Collapse spacing/NFC so "  Lan " and "Lan" are the same pupil, not two. */
export function lanNormalizeName(name: string): string {
  return String(name ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** Case/diacritic-insensitive comparison of two pupil names. */
export function lanNameKey(name: string): string {
  return lanNormalizeName(name).toLocaleLowerCase('vi');
}

/**
 * Pupil tokens are minted by the caller (server) so the reducer stays deterministic.
 * Anything shorter than this is rejected to keep the token unguessable on a LAN.
 */
export function lanValidToken(token: unknown): token is string {
  return typeof token === 'string' && /^[a-z0-9]{24,64}$/i.test(token);
}

/**
 * Annotated with the error arm (not the union): returning the union would widen the
 * whole `lanReduce` return type and break `if (!result.ok)` narrowing for callers.
 */
function fail(status: LanErrorStatus, message: string): LanReduceFailure {
  return { outcome: 'refused', ok: false, status, message };
}

/** Single construction point for the success arm, so `outcome` is never forgotten. */
function done(state: LanState, playerId?: string): LanReduceSuccess {
  return playerId ? { outcome: 'done', ok: true, state, playerId } : { outcome: 'done', ok: true, state };
}

function cloneState(state: LanState): LanState {
  return {
    ...state,
    teams: state.teams.map(team => ({ ...team })),
    rounds: state.rounds.slice(),
    players: state.players.map(player => ({ ...player })),
    answers: Object.fromEntries(
      Object.entries(state.answers).map(([round, byPlayer]) => [
        round,
        Object.fromEntries(Object.entries(byPlayer).map(([playerId, answer]) => [playerId, { ...answer }]))
      ])
    ),
    results: state.results.slice()
  };
}

export function lanCreateState(plan: LanGamePlan, roomCode: string, now: number): LanState {
  return {
    phase: plan.rounds.length ? 'lobby' : 'finished',
    roomCode,
    gameId: plan.gameId,
    gameTitle: plan.gameTitle,
    engine: plan.engine,
    scoringMode: plan.scoringMode,
    scoringNote: plan.scoringNote,
    teams: plan.teams.map(team => ({ ...team })),
    teamLocked: false,
    rounds: plan.rounds.slice(),
    roundIndex: 0,
    players: [],
    answers: {},
    results: [],
    earned: 0,
    startedAt: now,
    finishedAt: plan.rounds.length ? null : now
  };
}

/** Sum of one player's recorded answers plus the number answered in total. */
function playerByToken(state: LanState, token: string): LanPlayer | undefined {
  return state.players.find(player => player.token === token);
}

function currentRound(state: LanState): LanRound | undefined {
  return state.rounds[state.roundIndex];
}

function inputAcceptsAnswer(input: LanPhoneInput, optionId: string | null, answerText: string): boolean {
  if (input.kind === 'options') return typeof optionId === 'string' && input.options.some(option => option.id === optionId);
  if (input.kind === 'text') {
    if (typeof optionId === 'string' && optionId) return false;
    const text = String(answerText ?? '').trim();
    return text.length > 0 && text.length <= 80;
  }
  return false;
}

/** Freeze a round into the projector-facing result. */
function buildResult(state: LanState, round: LanRound, index: number): LanRoundResult {
  const byPlayer = state.answers[index] || {};
  const entries = state.players.map(player => ({
    id: player.id,
    name: player.name,
    teamId: player.teamId,
    score: byPlayer[player.id] ? byPlayer[player.id].points : 0,
    correct: Boolean(byPlayer[player.id] && byPlayer[player.id].correct)
  }));
  return {
    label: round.label,
    prompt: round.prompt,
    maxPoints: round.maxPoints,
    answered: entries.filter(entry => Boolean(byPlayer[entry.id])).length,
    correctCount: entries.filter(entry => entry.correct).length,
    perPlayer: entries,
    ...round.answerKey()
  };
}

/**
 * Apply one intent. Returns a new state, or a refusal with a stable status plus a
 * Vietnamese message safe to show on a phone (it never names another pupil's answer).
 */
export function lanReduce(state: LanState, action: LanAction): LanReduceResult {
  const next = cloneState(state);

  switch (action.type) {
    case 'join': {
      if (action.roomCode !== next.roomCode) return fail('wrong-room', 'Mã phòng không đúng.');
      if (next.phase === 'finished') return fail('not-open', 'Phiên chơi đã kết thúc.');
      const name = lanNormalizeName(action.name);
      if (!name || name.length > LAN_NAME_LIMIT) return fail('bad-name', `Tên cần từ 1 đến ${LAN_NAME_LIMIT} ký tự.`);
      if (next.players.length >= LAN_PLAYER_LIMIT) return fail('room-full', 'Phòng đã đủ người.');
      // Same name, case- and accent-insensitive: refused rather than suffixed, so a
      // teacher can tell two pupils apart on the projector. A pupil who lost the
      // connection reconnects with their token instead of joining again.
      const key = lanNameKey(name);
      if (next.players.some(player => lanNameKey(player.name) === key)) {
        return fail('name-taken', 'Tên này đã có bạn khác dùng. Nếu đúng là em, hãy mở lại tab cũ hoặc chọn tên kèm số lớp.');
      }
      if (!lanValidToken(action.token) || next.players.some(player => player.token === action.token)) {
        return fail('bad-name', 'Không tạo được mã người chơi. Hãy tải lại trang.');
      }
      const player: LanPlayer = {
        id: action.id,
        token: action.token,
        name,
        teamId: next.teams.length ? next.teams[next.players.length % next.teams.length].id : '',
        connected: true,
        points: 0,
        correct: 0,
        answered: 0,
        joinedAt: action.now
      };
      next.players.push(player);
      return done(next, player.id);
    }

    case 'reconnect': {
      const player = playerByToken(next, action.token);
      if (action.roomCode !== next.roomCode || !player) return fail('not-in-room', 'Không tìm thấy người chơi trong phòng này.');
      if (next.phase === 'finished') return fail('not-open', 'Phiên chơi đã kết thúc.');
      player.connected = true;
      return done(next, player.id);
    }

    case 'disconnect': {
      const player = playerByToken(next, action.token);
      if (!player) return done(next);
      // Points and answers stay: a dropped Wi-Fi must not erase a pupil's work.
      player.connected = false;
      return done(next);
    }

    case 'assign-team': {
      if (next.teamLocked) return fail('teams-locked', 'Đội đã khoá sau khi bắt đầu.');
      const team = next.teams.find(entry => entry.id === action.teamId);
      if (!team) return fail('unknown-team', 'Đội không tồn tại.');
      const player = next.players.find(entry => entry.id === action.playerId);
      if (!player) return fail('not-in-room', 'Học sinh không có trong phòng.');
      player.teamId = team.id;
      return done(next);
    }

    case 'answer': {
      const player = playerByToken(next, action.token);
      if (!player) return fail('not-in-room', 'Không tìm thấy người chơi. Hãy vào lại phòng.');
      // Checked before the phase so a pupil offline when the teacher advanced is
      // told the round closed, not that they were never in the room.
      if (next.phase !== 'question') {
        return fail('wrong-phase', next.phase === 'reveal' || next.phase === 'finished' ? 'Câu này đã chốt đáp án.' : 'Giáo viên chưa mở câu hỏi.');
      }
      const round = currentRound(next);
      if (!round) return fail('wrong-phase', 'Chưa có câu hỏi.');
      if (!inputAcceptsAnswer(round.input, action.optionId, String(action.answerText ?? ''))) {
        return fail('bad-answer', 'Câu trả lời không hợp lệ.');
      }
      const index = String(next.roundIndex);
      const byPlayer = next.answers[index] || (next.answers[index] = {});
      // LAN v1: exactly one answer per pupil per question, no retries. A second
      // press is ignored rather than scored, so a double-tap cannot add points.
      if (byPlayer[player.id]) return fail('already-answered', 'Em đã trả lời câu này rồi.');

      const scored = round.score(action.optionId, String(action.answerText ?? ''));
      byPlayer[player.id] = {
        optionId: action.optionId,
        answerText: String(action.answerText ?? ''),
        correct: Boolean(scored.correct),
        points: Number(scored.points) || 0,
        answeredAt: action.now
      };
      player.points += Number(scored.points) || 0;
      player.answered += 1;
      if (scored.correct) player.correct += 1;
      next.earned += Number(scored.points) || 0;
      return done(next, player.id);
    }

    case 'next-round': {
      // Legal from `question` (closing the round for latecomers) and from `reveal`.
      if (next.phase !== 'question' && next.phase !== 'reveal') return fail('wrong-phase', 'Không có câu nào đang mở.');
      const round = currentRound(next);
      if (!round) return fail('wrong-phase', 'Chưa có câu hỏi.');
      // Record the closed round once, then step forward and open the next one.
      if (next.results.length === next.roundIndex) next.results.push(buildResult(next, round, next.roundIndex));
      next.roundIndex += 1;
      if (next.roundIndex >= next.rounds.length) {
        next.phase = 'finished';
        next.finishedAt = action.now;
        next.teamLocked = true;
      } else {
        next.phase = 'question';
      }
      return done(next);
    }

    case 'finish': {
      if (next.phase !== 'finished') {
        const round = currentRound(next);
        if (round && next.results.length === next.roundIndex) next.results.push(buildResult(next, round, next.roundIndex));
      }
      next.phase = 'finished';
      next.teamLocked = true;
      next.finishedAt = action.now;
      return done(next);
    }

    default:
      return fail('wrong-phase', 'Lệnh không hợp lệ.');
  }
}

/** Move the lobby into the first question once the teacher is ready. */
export function lanStartRounds(state: LanState): LanReduceResult {
  if (state.phase !== 'lobby') return fail('wrong-phase', 'Phòng đã bắt đầu.');
  if (!state.rounds.length) return fail('wrong-phase', 'Trò chơi không có câu hỏi để chơi LAN.');
  const next = cloneState(state);
  next.phase = 'question';
  next.teamLocked = true;
  return done(next);
}

/** True when every connected pupil already answered the open round. */
export function lanAllConnectedAnswered(state: LanState): boolean {
  const byPlayer = state.answers[String(state.roundIndex)] || {};
  const connected = state.players.filter(player => player.connected);
  return connected.length > 0 && connected.every(player => Boolean(byPlayer[player.id]));
}

export function lanPlayersInRound(state: LanState): { answered: number; total: number } {
  const byPlayer = state.answers[String(state.roundIndex)] || {};
  return {
    answered: state.players.filter(player => byPlayer[player.id]).length,
    total: state.players.length
  };
}
