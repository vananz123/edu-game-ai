/**
 * Pins the `will-prevent-unload` polarity, which is inverted from the renderer's
 * `beforeunload` and was written backwards on the first attempt in this feature.
 *
 * Renderer: cancelling `beforeunload` means "keep my work".
 * Main:     calling `event.preventDefault()` on `will-prevent-unload` means
 *           "ignore that and close anyway"; ignoring the event means "stay".
 *
 * Both mistakes are severe and silent: the wrong polarity either traps the
 * teacher in a window that never closes, or destroys the generated game the
 * guard exists to protect. `main.ts` needs Electron, so the decision lives in
 * `unload-guard.ts` and is asserted here without a window.
 */
import assert from 'node:assert/strict';
import { unloadMayProceed } from '../../src/ai-core/unload-guard';

// "Ở lại" is index 0 and also `cancelId`, so a dismissed dialog must stay.
assert.equal(
  unloadMayProceed('stay'),
  false,
  'staying must NOT let the window unload — calling preventDefault would discard the draft'
);

// "Đóng và bỏ nội dung" is index 1: the teacher explicitly agreed to lose it.
assert.equal(
  unloadMayProceed('discard'),
  true,
  'discarding must let the window unload — otherwise the window can never be closed'
);

// The mapping `main.ts` applies to the dialog result. Kept here so a button
// reorder in `main.ts` that is not mirrored here shows up as a diff.
const choiceToUnload = (choice: number) => unloadMayProceed(choice === 1 ? 'discard' : 'stay');
assert.equal(choiceToUnload(0), false, 'button 0 is the default "stay" action');
assert.equal(choiceToUnload(1), true, 'button 1 is the explicit "discard" action');
// Escape / window close hits `cancelId` (0), which must behave like "stay".
assert.equal(choiceToUnload(0), choiceToUnload(-1), 'an unexpected or cancelled result must land on "stay", never "discard"');

console.log('unload-guard: polarity verified (stay keeps the window, discard closes it)');
