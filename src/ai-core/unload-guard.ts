/**
 * Decides whether a `will-prevent-unload` event should let the window close.
 *
 * The renderer cancels `beforeunload` when a generated game exists only in
 * memory. Chromium relays that to main as `will-prevent-unload`, where the
 * polarity is inverted from the renderer's and is easy to get backwards:
 * calling `event.preventDefault()` *ignores* the renderer's handler and lets
 * the window unload; leaving the event alone keeps it open (Electron 33
 * `electron.d.ts`). Getting this wrong either traps the teacher in a window
 * that will not close, or silently discards their work.
 *
 * Extracted from `main.ts` so the truth table can be asserted without Electron.
 */
export type UnloadChoice = 'stay' | 'discard';

export function unloadMayProceed(choice: UnloadChoice): boolean {
  return choice === 'discard';
}
