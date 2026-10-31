/* LAN Classroom Mode: HTTP + Socket.IO server hosted inside the Electron main process.
 *
 * Scope is deliberately tiny. The phones get exactly three things:
 *   - `GET /`            the mobile page (from `dist/src/lan/mobile`, copied by `build`)
 *   - `GET /health`      `{ ok: true }` and nothing else
 *   - Socket.IO events   `lan:join`, `lan:answer` (and nothing that reads the app)
 *
 * There is no file endpoint, no `appInfo()`, no renderer IPC and no store access on
 * this server. The teacher's desktop is connected through the *renderer* IPC, never
 * through the socket, so a phone cannot reach anything a pupil could not.
 *
 * Authority: the server owns a `LanState` from `lan-reducer.ts` and scores with
 * `lan-adapters.ts` (which delegates to `src/game-engine/runtime.ts`). Phones send
 * intents only; a phone that claims a score is simply ignored.
 */

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { Server as SocketServer } from 'socket.io';
import type { LanSnapshot } from '../shared/lan-types';
import { LAN_ANSWER_WINDOW_MS } from '../shared/lan-types';
import type { EducationalGame } from '../shared/types';
import { buildLanPlan, lanMaxPoints } from './lan-adapters';
import {
  lanCreateState,
  lanPlayersInRound,
  lanReduce,
  lanStartRounds,
  type LanState
} from './lan-reducer';

/** Letters/digits only, minus the characters pupils misread out loud. */
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

export interface LanServerOptions {
  /** Port to bind; 0 lets the OS pick. */
  port?: number;
  /** Receives every state change so the desktop can draw it. */
  onSnapshot: (snapshot: LanSnapshot) => void;
  /** Called after the server stopped listening (session end, quit or error). */
  onClosed: (reason: string) => void;
}

export interface LanServerHandle {
  snapshot: () => LanSnapshot;
  /** Teacher closed the round for latecomers and opened the next one. */
  nextRound: () => LanSnapshot;
  assignTeam: (playerId: string, teamId: string) => { ok: boolean; message: string; snapshot: LanSnapshot };
  /** Start the lobby's first question. */
  begin: () => LanSnapshot;
  /** Finish now, returning the final snapshot (points frozen). */
  finish: () => LanSnapshot;
  close: (reason?: string) => Promise<void>;
}

interface RunningServer {
  httpServer: http.Server;
  io: SocketServer;
  timer: NodeJS.Timeout | null;
  closed: boolean;
}

function randomCode(): string {
  const bytes = crypto.randomBytes(ROOM_CODE_LENGTH);
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) code += ROOM_ALPHABET[bytes[index] % ROOM_ALPHABET.length];
  return code;
}

function randomToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

function randomId(): string {
  return crypto.randomBytes(6).toString('hex');
}

/** Every non-loopback IPv4 the class can type into a phone. */
export function lanLanAddresses(): string[] {
  const found: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.internal) continue;
      // `family` is 'IPv4' on Node >= 18 (numeric on very old versions).
      const family = String(entry.family);
      if (family !== 'IPv4' && family !== '4') continue;
      found.push(entry.address);
    }
  }
  // Private ranges first: those are what a classroom Wi-Fi hands out.
  const isPrivate = (address: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
  return found.sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)) || a.localeCompare(b));
}

function roomUrls(port: number, roomCode: string): string[] {
  const addresses = lanLanAddresses();
  const hosts = addresses.length ? addresses : ['127.0.0.1'];
  return hosts.map(address => `http://${address}:${port}/?room=${roomCode}`);
}

function buildSnapshot(state: LanState, port: number, error?: string): LanSnapshot {
  const players = state.players.map(player => ({
    id: player.id,
    name: player.name,
    teamId: player.teamId,
    connected: player.connected,
    points: player.points,
    correct: player.correct,
    answered: player.answered
  }));
  const round = state.rounds[state.roundIndex];
  const max = state.rounds.reduce((sum, entry) => sum + entry.maxPoints, 0);
  const { answered } = lanPlayersInRound(state);
  const lastResult = state.results.length ? state.results[state.results.length - 1] : null;
  const topPoints = players.reduce((best, player) => Math.max(best, player.points), 0);
  return {
    state: state.phase,
    roomCode: state.roomCode,
    urls: roomUrls(port, state.roomCode),
    engine: state.engine,
    gameId: state.gameId,
    gameTitle: state.gameTitle,
    teams: state.teams.map(team => ({ ...team })),
    teamLocked: state.teamLocked,
    roundIndex: state.phase === 'lobby' ? 0 : Math.min(state.roundIndex + 1, state.rounds.length),
    roundCount: state.rounds.length,
    input: state.phase === 'question' && round ? round.input : null,
    prompt: round ? round.prompt : '',
    kicker: round ? round.label : '',
    players,
    answeredCount: answered,
    lastResult,
    lastRound: state.results.length ? state.results.length - 1 : -1,
    currentRoundIndex: state.roundIndex,
    scoringMode: state.scoringMode,
    scoringNote: state.scoringNote,
    score: { points: topPoints, max, percent: max ? Math.round(topPoints / max * 100) : 0 },
    ...(error ? { error } : {})
  };
}

/**
 * Start one room. Refuses to start a second: two rooms would need two ports, two
 * firewall prompts and two projector screens, and the plan scopes v1 to one class
 * at a time (plan §10.5).
 */
export async function startLanServer(game: EducationalGame, options: LanServerOptions): Promise<LanServerHandle> {
  const plan = buildLanPlan(game);
  if (!plan) throw new Error('Trò chơi này chưa hỗ trợ chơi LAN.');
  if (running) throw new Error('Một phòng LAN đang chạy. Hãy đóng phòng cũ trước.');

  const roomCode = randomCode();
  let state = lanCreateState(plan, roomCode, Date.now());
  const maxPoints = lanMaxPoints(game);

  const app = express();
  app.disable('x-powered-by');
  // The phone page keeps a rejoin token in localStorage, so it must not be framable
  // by another page on the school network. The meta CSP cannot express
  // `frame-ancestors`, so the header is sent here.
  app.use((_request, response, next) => {
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    next();
  });
  // JSON first: it must run before the static handler, or mount the static files
  // only under explicit paths (below) so `/join` is never shadowed by `index.html`.
  app.use(express.json({ limit: '4kb' }));
  const mobileDir = path.join(__dirname, 'mobile');
  app.use(express.static(mobileDir, {
    index: 'index.html',
    // The page is tiny and versioned with the app: no caching avoids a phone
    // holding an old mobile.js after an update.
    setHeaders: response => response.setHeader('Cache-Control', 'no-store')
  }));
  app.get('/health', (_request, response) => {
    // Deliberately minimal: a phone on the LAN must learn nothing but liveness.
    response.setHeader('Cache-Control', 'no-store');
    response.json({ ok: true });
  });
  // Socket.IO is same-origin with this page, so CORS stays off entirely.
  // Rate-limit joins per IP. The real join happens over the socket; this endpoint
  // exists so the limiter has a budget to spend and misbehaving clients get 429.
  const joinLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { ok: false, message: 'Quá nhiều lần thử vào phòng. Hãy đợi một phút.' }
  });
  app.post('/join', joinLimiter, (request, response) => {
    const code = String((request.body && request.body.room) || '').toUpperCase();
    response.json({ ok: code === roomCode });
  });
  // Everything else 404s without echoing the path back (no path reflection).
  app.use((_request, response) => response.status(404).type('text').send('Not found'));

  const httpServer = http.createServer(app);
  const io = new SocketServer(httpServer, {
    // The phone page is served by this very server, so every connection is
    // same-origin. Reflecting `Origin` (the old `origin: true`) let any page on the
    // network open a socket, pollute the roster and answer on a pupil's behalf —
    // measured: a handshake with `Origin: http://evil.example` was accepted.
    cors: { origin: false },
    maxHttpBufferSize: 8 * 1024,
    serveClient: true
  });

  const handle: RunningServer = { httpServer, io, timer: null, closed: false };

  /** socket id -> player id. Only these sockets get `lan:state`. */
  const joinedSockets = new Map<string, string>();

  function emit(error?: string): LanSnapshot {
    const snapshot = buildSnapshot(state, currentPort, error);
    try { options.onSnapshot(snapshot); } catch { /* the desktop window may be closing */ }
    // Only sockets that actually joined receive state. An unauthenticated client on
    // the LAN must not learn the room code or the current question: the room code is
    // the only join secret, and `io.emit` used to hand it to every connection.
    for (const [socketId, playerId] of joinedSockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) { joinedSockets.delete(socketId); continue; }
      socket.emit('lan:state', phoneSnapshot(snapshot, state, playerId));
    }
    return snapshot;
  }

  /**
   * What one phone may see: the shared question, and — only for the pupil it is
   * addressed to — their own row in the last result. Other pupils' points and the
   * answer key stay on the projector (plan §8.2). The room code is omitted because
   * the phone already has it from the URL.
   */
  function phoneSnapshot(snapshot: LanSnapshot, current: LanState, playerId: string) {
    const open = current.phase === 'question';
    const last = snapshot.lastResult;
    return {
      state: snapshot.state,
      engine: snapshot.engine,
      gameTitle: snapshot.gameTitle,
      roundIndex: snapshot.roundIndex,
      roundCount: snapshot.roundCount,
      currentRoundIndex: snapshot.currentRoundIndex,
      kicker: snapshot.kicker,
      prompt: snapshot.prompt,
      input: snapshot.input,
      teams: snapshot.teams,
      teamLocked: snapshot.teamLocked,
      // After the round is closed the pupil sees their own outcome; never anyone
      // else's score, and never the key while the question is still open.
      lastResult: open || !last
        ? null
        : {
            ...last,
            perPlayer: last.perPlayer.filter(entry => entry.id === playerId),
            correctOptionId: undefined,
            correctAnswer: undefined
          }
    };
  }

  function closeRound(): LanSnapshot {
    if (state.phase !== 'question') return emit();
    const result = lanReduce(state, { type: 'next-round', now: Date.now() });
    if (result.outcome === 'done') {
      state = result.state;
      clearTimer();
      if (state.phase === 'question') armTimer();
    }
    return emit();
  }

  function clearTimer(): void {
    if (handle.timer) {
      clearTimeout(handle.timer);
      handle.timer = null;
    }
  }

  function armTimer(): void {
    clearTimer();
    handle.timer = setTimeout(() => {
      // Auto-close so a stalled phone cannot freeze the class on one question.
      closeRound();
      io.emit('lan:round-closed', { roundIndex: state.roundIndex });
    }, LAN_ANSWER_WINDOW_MS);
  }

  /**
   * Per-socket token bucket. Socket.IO had no throttle at all, so a single client
   * could spam `lan:join` (each attempt costs a reducer run and a broadcast) or
   * hammer `lan:answer`. A classroom needs a handful of events per second per phone,
   * so this is generous for a pupil and useless for a flood.
   */
  function makeBucket(capacity: number, refillPerSecond: number) {
    let tokens = capacity;
    let last = Date.now();
    return function take(): boolean {
      const now = Date.now();
      tokens = Math.min(capacity, tokens + (now - last) / 1000 * refillPerSecond);
      last = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    };
  }

  io.on('connection', socket => {
    let token: string | null = null;
    // Joins are rarer than answers, so they get the tighter bucket.
    const joinBudget = makeBucket(6, 0.5);
    const answerBudget = makeBucket(20, 4);

    socket.on('lan:join', (payload: unknown) => {
      if (!joinBudget()) {
        socket.emit('lan:refused', { status: 'too-many', message: 'Quá nhiều lần thử. Hãy đợi vài giây rồi thử lại.' });
        return;
      }
      const message = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const result = lanReduce(state, {
        type: 'join',
        roomCode: String(message.room || message.roomCode || '').toUpperCase(),
        name: String(message.name || ''),
        now: Date.now(),
        token: randomToken(),
        id: randomId()
      });
      if (result.outcome === 'refused') {
        socket.emit('lan:refused', { status: result.status, message: result.message });
        return;
      }
      state = result.state;
      token = state.players[state.players.length - 1].token;
      const player = state.players.find(entry => entry.id === result.playerId);
      if (result.playerId) joinedSockets.set(socket.id, result.playerId);
      socket.emit('lan:joined', { playerId: result.playerId, token, name: player ? player.name : '' });
      // Send this phone the current state immediately; otherwise it would sit on
      // the lobby screen until somebody else's action produces an emit.
      socket.emit('lan:state', phoneSnapshot(buildSnapshot(state, currentPort), state, String(result.playerId)));
      emit();
    });

    socket.on('lan:rejoin', (payload: unknown) => {
      if (!joinBudget()) {
        socket.emit('lan:refused', { status: 'too-many', message: 'Quá nhiều lần thử. Hãy đợi vài giây rồi thử lại.' });
        return;
      }
      const message = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const candidate = String(message.token || '');
      const result = lanReduce(state, { type: 'reconnect', roomCode: String(message.room || '').toUpperCase(), token: candidate, now: Date.now() });
      if (result.outcome === 'refused') {
        socket.emit('lan:refused', { status: result.status, message: result.message });
        return;
      }
      state = result.state;
      token = candidate;
      if (result.playerId) joinedSockets.set(socket.id, result.playerId);
      socket.emit('lan:joined', { playerId: result.playerId, token, name: '' });
      emit();
    });

    socket.on('lan:answer', (payload: unknown) => {
      if (!answerBudget()) {
        socket.emit('lan:answer-refused', { status: 'too-many', message: 'Em bấm hơi nhanh — chờ một chút rồi thử lại.' });
        return;
      }
      const message = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      if (!token) {
        socket.emit('lan:answer-refused', { status: 'not-in-room', message: 'Hãy vào phòng trước.' });
        return;
      }
      const optionId = typeof message.optionId === 'string' ? message.optionId : null;
      const answerText = typeof message.answerText === 'string' ? message.answerText : '';
      const result = lanReduce(state, { type: 'answer', token, optionId, answerText, now: Date.now() });
      if (result.outcome === 'refused') {
        socket.emit('lan:answer-refused', { status: result.status, message: result.message });
        return;
      }
      state = result.state;
      // The phone is told "recorded", never whether it was right (plan §8.2).
      socket.emit('lan:answer-ack', { roundIndex: state.roundIndex });
      emit();
    });

    socket.on('disconnect', () => {
      // Free the per-socket entry first: the roster keeps the pupil, and a rejoin
      // registers the new socket id.
      joinedSockets.delete(socket.id);
      if (!token) return;
      const result = lanReduce(state, { type: 'disconnect', token, now: Date.now() });
      if (result.outcome === 'done') {
        state = result.state;
        emit();
      }
    });
  });

  let currentPort = 0;
  await new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      httpServer.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      httpServer.removeListener('error', onError);
      const address = httpServer.address();
      currentPort = address && typeof address === 'object' ? address.port : Number(options.port) || 0;
      resolve();
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(options.port ?? 0, '0.0.0.0');
  });

  running = handle;
  // Publish the lobby immediately: without this the teacher screen (and any test
  // driver) sees nothing until the first pupil joins, so the join URL is invisible.
  emit();

  async function close(reason = 'closed'): Promise<void> {
    if (handle.closed) return;
    handle.closed = true;
    clearTimer();
    joinedSockets.clear();
    if (running === handle) running = null;
    for (const socket of io.sockets.sockets.values()) socket.disconnect(true);
    await new Promise<void>(resolve => io.close(() => resolve()));
    // Phones hold HTTP keep-alive connections to the page and the client bundle, and
    // since Node 18 `server.close()` waits for those to end on their own (seconds).
    // Without this the teacher's "Đóng phòng" awaits for that long and `app.quit()`
    // can hang. Destroy them so the close callback fires immediately.
    if (typeof (httpServer as unknown as { closeAllConnections?: () => void }).closeAllConnections === 'function') {
      (httpServer as unknown as { closeAllConnections: () => void }).closeAllConnections();
    }
    // A close that never calls back must not wedge shutdown; the port is released
    // once the process (or the room's owner) lets go of the handle.
    await Promise.race([
      new Promise<void>(resolve => httpServer.close(() => resolve())),
      new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 2000);
        timer.unref();
      })
    ]);
    options.onClosed(reason);
  }

  httpServer.on('error', error => {
    // A late socket error after `close()` is expected; anything else kills the room
    // rather than leaving a half-dead server the teacher cannot see.
    if (!handle.closed) void close(`error:${(error as NodeJS.ErrnoException).code || 'unknown'}`);
  });

  return {
    snapshot: () => buildSnapshot(state, currentPort),
    nextRound: () => closeRound(),
    assignTeam: (playerId: string, teamId: string) => {
      const result = lanReduce(state, { type: 'assign-team', playerId, teamId });
      if (result.outcome === 'done') state = result.state;
      const message = result.outcome === 'refused' ? result.message : '';
      return { ok: result.outcome === 'done', message, snapshot: buildSnapshot(state, currentPort) };
    },
    begin: () => {
      const result = lanStartRounds(state);
      if (result.outcome === 'done') {
        state = result.state;
        emit();
        armTimer();
      }
      return buildSnapshot(state, currentPort, result.outcome === 'refused' ? result.message : undefined);
    },
    finish: () => {
      clearTimer();
      const result = lanReduce(state, { type: 'finish', now: Date.now() });
      if (result.outcome === 'done') state = result.state;
      return emit();
    },
    close
  };
}

/** The one running room, if any (v1: a single class at a time). */
let running: RunningServer | null = null;

export function lanServerIsRunning(): boolean {
  return Boolean(running);
}
