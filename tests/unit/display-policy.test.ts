import assert from 'node:assert/strict';
import type { DisplayInfo } from '../../src/shared/presentation-types';
import { selectPreferredDisplay, hasSecondaryDisplay } from '../../src/presentation/display-policy';
import { isBoundsWithinDisplays, selectDisplayForRemoval } from '../../src/presentation/display-policy';

/** Build a synthetic display; never touches Electron. */
function display(id: string, x: number, width: number, primary = false, height = 768): DisplayInfo {
  return {
    id,
    bounds: { x, y: 0, width, height },
    workArea: { x, y: 0, width, height },
    scaleFactor: 1,
    primary
  };
}

const laptop = display('primary', 0, 1920, true);
const projector = display('secondary', 1920, 1366, false, 768);

// --- selectPreferredDisplay ------------------------------------------------

assert.equal(selectPreferredDisplay([]), null, 'no displays yields null, not a crash');
assert.equal(selectPreferredDisplay([laptop])?.id, 'primary', 'a single display falls back to primary');
assert.equal(selectPreferredDisplay([laptop, projector])?.id, 'secondary', 'a projector is preferred over primary');
assert.equal(
  selectPreferredDisplay([projector, laptop])?.id,
  'secondary',
  'preference follows the non-primary flag, not array order'
);
assert.equal(
  selectPreferredDisplay([laptop, display('a', 1920, 800), display('b', 2720, 800)])?.id,
  'a',
  'the first secondary display wins when several are attached'
);
assert.equal(
  selectPreferredDisplay([display('only', 0, 1920, false)])?.id,
  'only',
  'a lone non-primary display is still usable'
);
assert.equal(
  selectPreferredDisplay(null as unknown as DisplayInfo[]) ?? null,
  null,
  'malformed input is tolerated'
);

// --- hasSecondaryDisplay ---------------------------------------------------

assert.equal(hasSecondaryDisplay([]), false);
assert.equal(hasSecondaryDisplay([laptop]), false, 'laptop-only is not "has secondary"');
assert.equal(hasSecondaryDisplay([laptop, projector]), true);
assert.equal(hasSecondaryDisplay(null as unknown as DisplayInfo[]), false);

// --- isBoundsWithinDisplays (projector-unplug safety) ----------------------

assert.equal(
  isBoundsWithinDisplays({ x: 1920, y: 0, width: 1366, height: 768 }, [laptop]),
  false,
  'window sitting on the removed projector is outside the remaining laptop'
);
assert.equal(
  isBoundsWithinDisplays({ x: 1920, y: 0, width: 1366, height: 768 }, [laptop, projector]),
  true,
  'same bounds are valid while the projector is attached'
);
assert.equal(
  isBoundsWithinDisplays({ x: 100, y: 0, width: 800, height: 600 }, [laptop]),
  true,
  'a window fully inside the laptop is valid'
);
assert.equal(
  isBoundsWithinDisplays({ x: 1800, y: 0, width: 400, height: 600 }, [laptop]),
  false,
  'a window straddling the laptop edge is not fully visible'
);
assert.equal(
  isBoundsWithinDisplays({ x: 0, y: 0, width: 100, height: 100 }, []),
  false,
  'no displays means nowhere is valid'
);

// --- selectDisplayForRemoval (unplug / resolution change rescue) -----------

const rescue = selectDisplayForRemoval({ x: 1920, y: 0, width: 1366, height: 768 }, [laptop]);
assert.equal(rescue.action, 'move', 'a window left on an unplugged projector is moved');
assert.equal(rescue.display?.id, 'primary', 'and it lands on the remaining display');

const stays = selectDisplayForRemoval({ x: 0, y: 0, width: 1920, height: 768 }, [laptop]);
assert.equal(stays.action, 'keep', 'a fully visible window is left alone');
assert.equal(stays.display, undefined);

const gone = selectDisplayForRemoval({ x: 1920, y: 0, width: 1366, height: 768 }, []);
assert.equal(gone.action, 'close', 'with no display left the window must close safely');

const shrunk = selectDisplayForRemoval(
  { x: 0, y: 0, width: 1920, height: 1080 },
  [display('primary', 0, 1366, true, 768)]
);
assert.equal(shrunk.action, 'move', 'a resolution change that crops the window triggers a move');
assert.equal(shrunk.display?.bounds.width, 1366);

// Projector still attached but the window moved to the primary: keep it.
const twoKeep = selectDisplayForRemoval({ x: 0, y: 0, width: 1920, height: 768 }, [laptop, projector]);
assert.equal(twoKeep.action, 'keep', 'multi-display resolution changes do not steal focus');

console.log('display-policy.test.ts: all assertions passed');
