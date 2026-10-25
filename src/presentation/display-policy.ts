/* Pure display-selection policy (no Electron imports, so it can be unit tested). */

import type { DisplayInfo } from '../shared/presentation-types';

/** Prefer a secondary display (projector); fall back to the primary display. */
export function selectPreferredDisplay(displays: DisplayInfo[]): DisplayInfo | null {
  if (!Array.isArray(displays) || displays.length === 0) return null;
  return displays.find((d) => !d.primary) || displays[0];
}

/** True when at least one non-primary display is available. */
export function hasSecondaryDisplay(displays: DisplayInfo[]): boolean {
  return Array.isArray(displays) && displays.some((d) => !d.primary);
}

/** A rectangle in screen coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * True when the rectangle is fully inside at least one display.
 * A presentation window is only reachable by the teacher while this holds.
 */
export function isBoundsWithinDisplays(bounds: Rect, displays: DisplayInfo[]): boolean {
  if (!Array.isArray(displays) || displays.length === 0) return false;
  return displays.some((d) => {
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    return (
      bounds.x >= d.bounds.x &&
      bounds.y >= d.bounds.y &&
      right <= d.bounds.x + d.bounds.width &&
      bottom <= d.bounds.y + d.bounds.height
    );
  });
}

/** What the window manager should do after a display change. */
export interface DisplayRemovalDecision {
  action: 'keep' | 'move' | 'close';
  display?: DisplayInfo;
}

/**
 * Decide what to do with the presentation window after a display was
 * unplugged or a resolution changed.
 *
 * Never returns 'keep' for a window no remaining display contains: that would
 * leave the projector window stranded off-screen and unreachable, which the
 * Presentation Mode spec explicitly forbids.
 */
export function selectDisplayForRemoval(
  bounds: Rect,
  remainingDisplays: DisplayInfo[]
): DisplayRemovalDecision {
  const displays = Array.isArray(remainingDisplays) ? remainingDisplays : [];
  if (isBoundsWithinDisplays(bounds, displays)) {
    return { action: 'keep' };
  }
  const target = selectPreferredDisplay(displays);
  if (!target) {
    return { action: 'close' };
  }
  return { action: 'move', display: target };
}
