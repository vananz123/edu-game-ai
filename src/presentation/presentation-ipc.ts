/* Presentation Mode IPC integration for Electron main process. */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ipcMain, BrowserWindow } from 'electron';
import {
  PRESENTATION_CHANNELS,
  type StartPresentationPayload,
  type StopPresentationPayload,
  type PresentationState,
} from '../shared/presentation-types';
import {
  createPresentationWindow,
  closePresentationWindow,
  isPresentationOpen,
  getPresentationWindow,
  cleanupPresentation,
  handleDisplayRemoved,
} from './presentation-manager';
import { getAvailableDisplays, onDisplayChange } from './display-manager';

let lastSessionId: string | null = null;
let lastRevision = 0;
let lastState: PresentationState | null = null;

/** Unsubscribe handle for the display-added/removed/metrics-changed listeners. */
let detachDisplayListeners: (() => void) | null = null;

/** Tear down shared presentation state. */
function resetPresentationState(): void {
  lastSessionId = null;
  lastRevision = 0;
  lastState = null;
}

/** Windows whose close handler has already been wired (reused windows are reloaded). */
const wiredWindows = new WeakSet<BrowserWindow>();

/** Build the file URL for the dedicated presentation page. */
function presentationUrl(sessionId: string): string {
  const fileUrl = pathToFileURL(path.join(__dirname, 'presentation.html')).toString();
  return `${fileUrl}?presentation=1&session=${encodeURIComponent(sessionId)}`;
}

/** Tell the main renderer that the presentation window closed. */
function notifyMainWindowOfExit(sessionId: string, source: BrowserWindow): void {
  const main = BrowserWindow.getAllWindows().find(
    (win) => win !== source && !win.isDestroyed() && !win.webContents.isDestroyed()
  );
  if (main) {
    main.webContents.send(PRESENTATION_CHANNELS.EXIT, { sessionId });
  }
}

/** Reset shared state and notify the main window when a presentation window closes. */
function wirePresentationLifecycle(win: BrowserWindow, sessionId: string): void {
  if (wiredWindows.has(win)) return;
  wiredWindows.add(win);
  win.once('closed', () => {
    if (lastSessionId === sessionId) {
      resetPresentationState();
    }
    notifyMainWindowOfExit(sessionId, win);
  });
}

/** Create/reuse the window on the preferred display and send the initial snapshot. */
async function openPresentation(payload: StartPresentationPayload): Promise<{
  ok: boolean;
  data?: { display: unknown; sessionId: string };
  error?: string;
}> {
  const { displays, preferred } = await getAvailableDisplays();
  const targetDisplay = preferred || displays[0];
  if (!targetDisplay) {
    return { ok: false, error: 'Không tìm thấy màn hình nào để trình chiếu.' };
  }

  lastSessionId = payload.sessionId;
  lastRevision = payload.revision || 0;
  lastState = payload;

  const win = createPresentationWindow(targetDisplay);
  wirePresentationLifecycle(win, payload.sessionId);

  try {
    await win.loadURL(presentationUrl(payload.sessionId));
  } catch (error) {
    closePresentationWindow();
    throw error;
  }

  if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(PRESENTATION_CHANNELS.STATE_SYNC, payload);
  }

  return { ok: true, data: { display: targetDisplay, sessionId: payload.sessionId } };
}

/** Register all Presentation Mode IPC handlers. Call once from main.ts. */
export function registerPresentationIpc(): void {
  // React to projector unplug / resolution changes while presenting (spec §5).
  // Without this the presentation window can be left on coordinates no
  // remaining display covers, i.e. invisible and unreachable for the teacher.
  if (!detachDisplayListeners) {
    detachDisplayListeners = onDisplayChange(({ displays }) => {
      if (!isPresentationOpen()) return;
      handleDisplayRemoved(displays);
    });
  }

  // Start presentation: create or reuse window on selected display.
  ipcMain.handle(
    PRESENTATION_CHANNELS.START,
    async (_event, payload: StartPresentationPayload) => {
      try {
        return await openPresentation(payload);
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Lỗi không xác định khi khởi động trình chiếu.',
        };
      }
    }
  );

  // Stop presentation: close the presentation window.
  ipcMain.handle(
    PRESENTATION_CHANNELS.STOP,
    async (_event, payload: StopPresentationPayload) => {
      closePresentationWindow();
      if (!payload?.sessionId || payload.sessionId === lastSessionId) {
        resetPresentationState();
      }
      return { ok: true };
    }
  );

  // Toggle presentation: start or stop depending on current state.
  ipcMain.handle(
    PRESENTATION_CHANNELS.TOGGLE,
    async (_event, payload: StartPresentationPayload) => {
      if (isPresentationOpen()) {
        closePresentationWindow();
        resetPresentationState();
        return { ok: true, presenting: false };
      }
      try {
        const result = await openPresentation(payload);
        return result.ok ? { ...result, presenting: true } : result;
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Lỗi không xác định khi khởi động trình chiếu.',
        };
      }
    }
  );

  // Get available displays.
  ipcMain.handle(PRESENTATION_CHANNELS.DISPLAYS, async () => {
    const result = await getAvailableDisplays();
    return { ok: true, data: result };
  });

  // The presentation window asks for the latest snapshot after it finishes loading.
  ipcMain.on(PRESENTATION_CHANNELS.REQUEST_STATE, (event) => {
    const win = getPresentationWindow();
    if (!win || win.webContents.isDestroyed() || event.sender !== win.webContents) return;
    if (lastState) {
      win.webContents.send(PRESENTATION_CHANNELS.STATE_SYNC, lastState);
    }
  });

  // Receive state update from main renderer, forward to presentation window.
  ipcMain.on(
    PRESENTATION_CHANNELS.STATE_UPDATE,
    (_event, state: PresentationState) => {
      if (!state || !state.sessionId) return;
      // Ignore stale sessions.
      if (lastSessionId && state.sessionId !== lastSessionId) return;
      // Ignore outdated revisions.
      if (state.revision <= lastRevision) return;
      lastRevision = state.revision;
      lastState = state;

      const win = getPresentationWindow();
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(PRESENTATION_CHANNELS.STATE_SYNC, state);
      }
    }
  );

  // Handle exit request from presentation window (Escape / nút thoát).
  ipcMain.on(PRESENTATION_CHANNELS.EXIT, (_event, payload: { sessionId?: string }) => {
    if (!payload?.sessionId || payload.sessionId === lastSessionId) {
      closePresentationWindow();
      resetPresentationState();
    }
  });
}

/** Clean up presentation resources on app quit. */
export function unregisterPresentationIpc(): void {
  if (detachDisplayListeners) {
    detachDisplayListeners();
    detachDisplayListeners = null;
  }
  for (const channel of Object.values(PRESENTATION_CHANNELS)) {
    ipcMain.removeHandler(channel);
    ipcMain.removeAllListeners(channel);
  }
  resetPresentationState();
  cleanupPresentation();
}
