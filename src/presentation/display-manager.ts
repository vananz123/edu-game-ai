/* Presentation Mode display detection and selection using Electron screen API. */

import { app, screen } from 'electron';
import type { DisplayInfo, GetDisplaysResult } from '../shared/presentation-types';
import { selectPreferredDisplay } from './display-policy';

export { selectPreferredDisplay } from './display-policy';

let displaysReady = false;

/** Wait until Electron is ready before accessing screen APIs. */
async function ensureReady(): Promise<void> {
  if (!app.isReady()) {
    await app.whenReady();
  }
  displaysReady = true;
}

/** Get all available displays with bounds and work area info. */
export async function getAvailableDisplays(): Promise<GetDisplaysResult> {
  await ensureReady();
  const allDisplays = screen.getAllDisplays();
  const displays: DisplayInfo[] = allDisplays.map((d) => ({
    id: d.id.toString(),
    bounds: {
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
    },
    workArea: {
      x: d.workArea.x,
      y: d.workArea.y,
      width: d.workArea.width,
      height: d.workArea.height,
    },
    scaleFactor: d.scaleFactor,
    primary: d.id === screen.getPrimaryDisplay().id,
  }));

  const preferred = selectPreferredDisplay(displays);
  return withTestDisplay({ displays, preferred });
}

/** Test-only hook: simulate a second display without a physical projector. */
function withTestDisplay(result: GetDisplaysResult): GetDisplaysResult {
  if (process.env.EDUGAME_PRESENTATION_TEST_DISPLAYS !== '2' || result.displays.length !== 1) {
    return result;
  }
  const primary = result.displays[0];
  const secondary: DisplayInfo = {
    ...primary,
    id: 'test-secondary',
    primary: false,
    bounds: { ...primary.bounds, x: primary.bounds.x + primary.bounds.width },
    workArea: { ...primary.workArea, x: primary.workArea.x + primary.workArea.width },
  };
  return { displays: [primary, secondary], preferred: secondary };
}

/** Check whether a window's bounds fall within any available display. */
export function isWindowWithinDisplays(
  x: number,
  y: number,
  width: number,
  height: number,
  displays: DisplayInfo[]
): boolean {
  return displays.some((d) => {
    const right = x + width;
    const bottom = y + height;
    return (
      x >= d.bounds.x &&
      y >= d.bounds.y &&
      right <= d.bounds.x + d.bounds.width &&
      bottom <= d.bounds.y + d.bounds.height
    );
  });
}

/** Register display change listeners. Returns an unsubscribe function. */
export function onDisplayChange(
  onChange: (displays: GetDisplaysResult) => void
): () => void {
  ensureReady();

  const handlers: (() => void)[] = [];

  const refresh = async () => {
    try {
      const result = await getAvailableDisplays();
      onChange(result);
    } catch (err) {
      // Display refresh failures are non-fatal; keep previous state.
    }
  };

  const scr = screen as unknown as { on: (event: string, listener: () => void) => void; off: (event: string, listener: () => void) => void };
  const onAdded = () => { refresh(); };
  const onRemoved = () => { refresh(); };
  const onMetrics = () => { refresh(); };
  scr.on('display-added', onAdded);
  scr.on('display-removed', onRemoved);
  scr.on('display-metrics-changed', onMetrics);
  handlers.push(
    () => scr.off('display-added', onAdded),
    () => scr.off('display-removed', onRemoved),
    () => scr.off('display-metrics-changed', onMetrics)
  );

  return () => {
    handlers.forEach((h) => h());
  };
}