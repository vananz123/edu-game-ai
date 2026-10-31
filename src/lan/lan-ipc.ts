/* LAN Classroom Mode IPC integration for the Electron main process.
 *
 * Mirrors `src/presentation/presentation-ipc.ts`: one module owns the channels, the
 * lifecycle and the teardown, and `main.ts` only calls register/unregister.
 *
 * Renderer -> main: `lan:start`, `lan:stop`, `lan:assign-team`, `lan:begin`, `lan:next`
 * main -> renderer: `lan:state` (a full `LanSnapshot` on every change)
 *
 * The renderer never sends a score. It also never renders the mobile page itself:
 * phones talk to the LAN server directly, which is why a broken renderer cannot
 * corrupt a LAN game's points.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { LAN_CHANNELS, LAN_START_CHANNEL_RESULT, type LanStartResult, type LanSnapshot } from '../shared/lan-types';
import type { EducationalGame } from '../shared/types';
import { lanProfileFor } from './lan-adapters';
import { startLanServer, lanServerIsRunning, type LanServerHandle } from './lan-server';

let active: LanServerHandle | null = null;
let lastSnapshot: LanSnapshot | null = null;
let registered = false;

/** Every live app window: the teacher may have several (projector mirror). */
function appWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter(win => !win.isDestroyed() && !win.webContents.isDestroyed());
}

function broadcast(snapshot: LanSnapshot | null): void {
  lastSnapshot = snapshot;
  for (const win of appWindows()) win.webContents.send(LAN_CHANNELS.STATE, snapshot);
}

/**
 * Stop the room because the teacher closed it, the game ended, or the app quits.
 * `LanServerHandle.close()` calls `onClosed`, which is what clears `active` and
 * tells the renderer, so this function does not duplicate that bookkeeping.
 */
export async function stopLanSession(reason = 'stopped'): Promise<void> {
  const handle = active;
  if (handle) await handle.close(reason);
}

export function registerLanIpc(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle(LAN_CHANNELS.START, async (_event, payload: { game?: EducationalGame } | undefined): Promise<LanStartResult> => {
    const game = payload && payload.game;
    const profile = lanProfileFor(game);
    if (!profile.supported) {
      return { ok: false, status: LAN_START_CHANNEL_RESULT.UNSUPPORTED, message: profile.reason || 'Trò chơi này chưa hỗ trợ chơi LAN.' };
    }
    if (!game) return { ok: false, status: LAN_START_CHANNEL_RESULT.NO_GAME, message: 'Chưa có trò chơi để mở LAN.' };
    if (lanServerIsRunning()) {
      // A second room would need a second port and a second projector (plan §10.5).
      return { ok: false, status: LAN_START_CHANNEL_RESULT.ALREADY_RUNNING, message: 'Một phòng LAN đang chạy. Hãy đóng phòng cũ trước khi mở phòng mới.' };
    }
    try {
      active = await startLanServer(game, {
        // Port 0: let the OS pick a free port, so a previous room (or another app)
        // holding the old port never blocks the new lesson.
        port: 0,
        onSnapshot: snapshot => broadcast(snapshot),
        onClosed: () => {
          active = null;
          broadcast(null);
        }
      });
      const snapshot = active.snapshot();
      broadcast(snapshot);
      return { ok: true, snapshot };
    } catch (error) {
      active = null;
      const code = (error as NodeJS.ErrnoException).code;
      return {
        ok: false,
        status: LAN_START_CHANNEL_RESULT.BIND_FAILED,
        message: code
          ? `Không mở được cổng mạng (${code}). Kiểm tra kết nối Wi-Fi/LAN của máy giáo viên.`
          : ((error as Error)?.message || 'Không mở được phòng LAN.')
      };
    }
  });

  ipcMain.handle(LAN_CHANNELS.STOP, async (): Promise<{ ok: boolean }> => {
    await stopLanSession('stopped-by-teacher');
    return { ok: true };
  });

  ipcMain.handle(LAN_CHANNELS.TEAM, (_event, payload: { playerId?: string; teamId?: string } | undefined) => {
    if (!active) return { ok: false, status: 'not-open', message: 'Phòng LAN chưa mở.' };
    const result = active.assignTeam(String(payload?.playerId || ''), String(payload?.teamId || ''));
    if (result.ok) broadcast(result.snapshot);
    return { ok: result.ok, status: result.ok ? 'ok' : 'refused', message: result.message, snapshot: result.snapshot };
  });

  // Teacher opened the first question (lobby -> question). Without this the phones
  // would wait in the lobby forever; it is idempotent-by-refusal, not by hiding.
  ipcMain.handle(LAN_CHANNELS.BEGIN, () => {
    if (!active) return { ok: false, status: 'not-open', message: 'Phòng LAN chưa mở.' };
    const snapshot = active.begin();
    broadcast(snapshot);
    return { ok: snapshot.state === 'question', status: snapshot.state === 'question' ? 'ok' : 'refused', message: snapshot.error || '', snapshot };
  });

  // Teacher closed the open round and moved on. Called by the play screen's own
  // "Câu tiếp theo" / treasure "Tiếp tục" so the phones follow the projector.
  ipcMain.handle(LAN_CHANNELS.NEXT, () => {
    if (!active) return { ok: false, status: 'not-open', message: 'Phòng LAN chưa mở.' };
    return { ok: true, status: 'ok', message: '', snapshot: active.nextRound() };
  });

  // The desktop game reached its results screen. End the room so the projector and
  // the phones both see the honour roll; without this, ending by any route other
  // than the last "next round" left the room open forever.
  ipcMain.handle(LAN_CHANNELS.FINISH, () => {
    if (!active) return { ok: false, status: 'not-open', message: 'Phòng LAN chưa mở.' };
    const snapshot = active.finish();
    broadcast(snapshot);
    return { ok: true, status: 'ok', message: '', snapshot };
  });
}

export function unregisterLanIpc(): void {
  if (!registered) return;
  registered = false;
  ipcMain.removeHandler(LAN_CHANNELS.START);
  ipcMain.removeHandler(LAN_CHANNELS.STOP);
  ipcMain.removeHandler(LAN_CHANNELS.TEAM);
  ipcMain.removeHandler(LAN_CHANNELS.BEGIN);
  ipcMain.removeHandler(LAN_CHANNELS.NEXT);
  ipcMain.removeHandler(LAN_CHANNELS.FINISH);
  lastSnapshot = null;
  // NOTE: no `stopLanSession()` here. Quitting is handled by `shutdownLanForQuit()`,
  // which `before-quit` awaits and which checks `lanServerIsRunning()` *before*
  // tearing down. Firing an un-awaited close here raced that check and could make
  // quit skip the awaited teardown (or run two closes at once).
}

/**
 * Quit-time teardown. `before-quit` may call `preventDefault()` (the server needs
 * a moment to release the port); this returns that promise so `main.ts` can await
 * it the same way it awaits the AI runtime shutdown.
 */
export async function shutdownLanForQuit(): Promise<void> {
  await stopLanSession('quit');
}

/** Test/manual hooks: current snapshot or `null`. */
export function lanSnapshot(): LanSnapshot | null {
  return lastSnapshot;
}
