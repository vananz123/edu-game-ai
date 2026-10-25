# Tests

Everything here uses **synthetic data only** — never real student names, real
lesson documents or a real machine profile.

## Layout

| Folder | What lives there | How it runs |
| --- | --- | --- |
| `unit/` | `*.test.ts` — plain `node:assert` tests for pure logic and IPC wiring. | `npm test` (compiled to `dist/tests/unit/`) |
| `helpers/` | Shared fakes imported by `unit/` (e.g. `setup-fake.ts`). | Compiled alongside `unit/` |
| `ui/` | CDP checks that measure the **real renderer** (geometry, visibility, DOM churn). | Manual — need a running app, see below |
| `smoke/` | End-to-end flows driven through CDP against the running app. | Manual — need a running app |
| `manual/` | One-off scripts: benchmarks, A/B geometry dumps, real-model probes, the Electron-Node runner, CSS verifier. | Manual, one at a time |
| `manual/lib/` | Shared CDP client (`ui-check-lib.js`) required by `ui/ui-play-surface-check.js` and `ui/ui-race-treasure-check.js`. | — |
| `fixtures/` | Synthetic lesson / AI-output fixtures used by `smoke/`. | — |
| `legacy/` | Superseded smokes kept for reference only. Not maintained. | Do not run |

### `tests/tailieu/` was deleted on purpose (2026-10-25)

It held four **real teacher lesson PDFs** (11–29 pages, ~1.2 MB) that were used for
the real-document measurements in `docs/BENCHMARKS.md` §O6e and decisions #57/#58.
The product owner confirmed they are not needed any more, and the repository rule is
**synthetic data only**, so the folder is gone and must not be re-added.

Consequence — these six scripts under `manual/` read that directory and now **fail
with ENOENT** if you run them:

```
node tests/manual/bench-preprocess-real.js
node tests/manual/inspect-preprocess-real.js
node tests/manual/inspect-preprocess-middle.js
node tests/manual/measure-retention.js
node tests/manual/measure-query-ranking.js
node tests/manual/diagnose-query-ranking.js
```

They are diagnostics for the *preprocessor*, not pass/fail tests, so nothing in
`npm test` breaks. To run one again, put the PDFs back into `tests/tailieu/`
(or point `DOC_DIR` in the script at any folder of Vietnamese lesson plans) and the
script picks every `*.pdf` in it up automatically. **Do not commit real student or
teacher documents** to fix them — if a regression has to be reproduced, build a
synthetic fixture in `fixtures/` instead and record in `docs/BENCHMARKS.md` that the
number came from a fixture rather than a real document.

## Running the automated suite

```powershell
npm test          # build + all unit tests (39 suites)
npx tsc --noEmit  # typecheck only
npm run verify:css  # asserts the compiled Tailwind output kept UI rules
```

## Running the CDP checks

They talk to a live app over the DevTools protocol, so start the app first:

```powershell
npm run build
npx electron . --remote-debugging-port=9333
# then, in another terminal:
node tests/ui/ui-setup-fullscreen-check.js
node tests/ui/ui-setup-progress-check.js
node tests/smoke/smoke81.js
```

### Layout / play-surface / grading checks

These three are the regression net for the 2026-10-22 UI and grading work. They
also run unchanged against the **packaged** app — start the built executable
instead of `npx electron .` to verify what actually ships:

```powershell
& "release\win-unpacked\EduGame Studio.exe" --remote-debugging-port=9352
node tests/ui/nav-hint-check.js 9352             # 15/15 — sidebar rows + "Gợi ý" button
node tests/ui/ui-play-surface-check.js 9352      # 27/27 — question width, fonts, tools
node tests/ui/grading-packaged-check.js 9352     # 7/7   — text-answer grading end-to-end
```

`ui-play-surface-check.js` measures geometry of a **real** game (it clicks *Chơi* and
forces `data-fullscreen`); an empty library makes it silently measure stale elements,
which is how it used to false-pass. Close the app before running `npm run dist:win`,
otherwise electron-builder fails with `Access is denied` on `d3dcompiler_47.dll`.

Ports differ per script — read the header comment of each file; the port is the
first argument or comes from `CDP_PORT`.

### Offline / packaged check (Phase 5 acceptance)

`ui/offline-packaged-check.js` is the acceptance step that proves the offline
promise on the **packaged** app: it plays one synthetic game per template, asserts
the stage illustration renders from inline SVG, and counts every outbound request
(fetch / XHR / WebSocket / beacon / subresource) made while doing so.

```powershell
$env:EDUGAME_USER_DATA = "$env:TEMP\eg-pkg-check-$PID"   # fresh data dir
& "release\win-unpacked\EduGame Studio.exe" --remote-debugging-port=9380
node tests/ui/offline-packaged-check.js 9380   # 11/11
```

Two traps, both measured the hard way on 2026-10-24:

1. **`EDUGAME_USER_DATA` must be a fresh directory.** `src/main.ts` pins the
   userData path from that variable, so `--user-data-dir` is ignored. Reusing the
   directory reuses the same renderer document, and any prototypes a previous run
   patched survive — which produced hours of bogus "the wrapper is blind" results.
2. **The positive control must call `window.fetch`, never the saved original.**
   Calling `origFetch.call(...)` bypasses the wrapper and always looks blind.

The run fails loudly if the control does not fire, so a `0 attempts` result can
never be trusted on its own.

## Adding a test

1. Pure logic → `unit/<name>.test.ts`, and add `node dist/tests/unit/<name>.test.js`
   to the `test` script in `package.json`. A test that is not in that script never
   runs in CI-free development either — it silently rots.
2. Anything that needs a real window → `ui/` or `smoke/`, with a header comment
   stating the exact port and the command to run it.
3. `unit/` files sit one level deeper than before, so imports to application code
   are `../../src/...`. Code paths resolved at runtime use
   `path.join(__dirname, '..', '..', 'src', ...)` because `__dirname` points into
   `dist/tests/unit/`.
