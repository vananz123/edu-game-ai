/* Presentation Mode window lifecycle management. */

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DisplayInfo } from '../shared/presentation-types';
import { selectDisplayForRemoval } from './display-policy';

let presentationWindow: BrowserWindow | null = null;
let listenersRegistered = false;

/** Path to the preload script used by the presentation window. */
const PRELOAD_PATH = path.join(__dirname, 'presentation-preload.js');

/** Only the bundled presentation page itself may ever load. */
const PRESENTATION_PAGE_URL = pathToFileURL(
  path.join(__dirname, 'presentation.html')
).toString();

/** True when a URL points at our own presentation page (query string allowed). */
function isPresentationPageUrl(target: string): boolean {
  try {
    const parsed = new URL(target);
    return parsed.protocol === 'file:' && `${parsed.protocol}//${parsed.host}${parsed.pathname}` === PRESENTATION_PAGE_URL;
  } catch {
    return false;
  }
}

/** Create (or reuse) the presentation window on the given display. */
export function createPresentationWindow(display: DisplayInfo): BrowserWindow {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    // Reuse existing window: move to the requested display and focus.
    presentationWindow.setBounds(display.bounds);
    presentationWindow.focus();
    return presentationWindow;
  }

  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    fullscreen: true,
    fullscreenable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: PRELOAD_PATH,
    },
  });

  presentationWindow = win;

  // Prevent untrusted navigation and unexpected new windows (spec §8).
  // The presentation window only ever shows the bundled local page.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!isPresentationPageUrl(url)) {
      event.preventDefault();
    }
  });

  win.on('closed', () => {
    if (presentationWindow === win) {
      presentationWindow = null;
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.on('did-fail-load', () => {
    // Load failure: keep window hidden, let caller decide retry/close.
  });

  return win;
}

/** Show the presentation window (create if needed). */
export function showPresentationWindow(display: DisplayInfo): BrowserWindow {
  const win = createPresentationWindow(display);
  if (!win.isVisible()) {
    win.show();
  }
  return win;
}

/** Hide (but do not destroy) the presentation window. */
export function hidePresentationWindow(): void {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.hide();
  }
}

/** Close the presentation window and release the reference. */
export function closePresentationWindow(): void {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.close();
    presentationWindow = null;
  }
}

/** Check whether a presentation window is currently open. */
export function isPresentationOpen(): boolean {
  return presentationWindow !== null && !presentationWindow.isDestroyed();
}

/** Get the current presentation window reference. */
export function getPresentationWindow(): BrowserWindow | null {
  return presentationWindow && !presentationWindow.isDestroyed()
    ? presentationWindow
    : null;
}

/** Handle projector disconnection: move window to a valid display or close safely. */
export function handleDisplayRemoved(
  remainingDisplays: DisplayInfo[]
): void {
  const win = getPresentationWindow();
  if (!win) return;

  const { x, y, width, height } = win.getBounds();
  const decision = selectDisplayForRemoval({ x, y, width, height }, remainingDisplays);

  if (decision.action === 'move' && decision.display) {
    // Never leave the projector window outside every available display.
    win.setBounds(decision.display.bounds);
    win.focus();
  } else if (decision.action === 'close') {
    closePresentationWindow();
  }
}

/** Clean up on application quit: close presentation window and clear references. */
export function cleanupPresentation(): void {
  closePresentationWindow();
  listenersRegistered = false;
}