# Tests

Everything here uses **synthetic data only** — never real student names, real
lesson documents or a real machine profile.

## Layout

| Folder | What lives there | How it runs |
| --- | --- | --- |
| `unit/` | `*.test.ts` — plain `node:assert` tests for pure logic and IPC wiring. | `npm test` (compiled to `dist/tests/unit/`) |
| `helpers/` | Shared fakes imported by `unit/` (e.g. `setup-fake.ts`). | Compiled alongside `unit/` |
| `ui/` | CDP checks that measure the **real renderer** (geometry, visibility, DOM churn). | Manual — need a running app, see below |
| `smoke/` | End-to-end flows driven through CDP against the running app. **Electron-era:** most still assume the old preload API and the deleted `EDUGAME_AI_TEST_DIR` hook; being re-classified per `docs/archive/specs/electron-removal-plan.md` (group C) before deletion or porting. | Manual — need a running app |
| `manual/` | One-off scripts: benchmarks, A/B geometry dumps, real-model probes, CSS verifier. | Manual, one at a time |
| `manual/lib/` | Shared CDP client (`ui-check-lib.js`) required by **all** `ui/` and `smoke/` CDP checks and by `ui/tauri-webview-check.js`. Never delete it. | — |
| `packaging/` | The P7 clean-machine measurement pack: PowerShell script + one-page checklist for installing the real Tauri `.exe` on an offline machine. | `powershell -ExecutionPolicy Bypass -File tests/packaging/p7-offline-install.ps1` (PowerShell 5.1; copy the two files to the pilot machine — no repo, no Node needed) |
| `fixtures/` | Synthetic lesson / AI-output fixtures used by `smoke/`. | — |

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
npm test          # build + all unit tests
npm run check     # typecheck only (tsc --noEmit)
npm run verify:css  # asserts the compiled Tailwind output kept UI rules
npm run tauri:check # release build + three-phase WebView2 gate (51+10+12)
```

## Running the CDP checks

They talk to a live app over the DevTools protocol. The app is the **Tauri** shell now:

```powershell
npm run build:tauri            # embedded bundle + dist-tauri
cargo tauri build              # release binary (once per code change)
powershell -ExecutionPolicy Bypass -File tests/ui/launch-app.ps1 -Port 9361
# then, in another terminal:
node tests/ui/ui-chrome-icons-check.js 9361
```

`launch-app.ps1` sets `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`
and waits until `/json/list` actually contains the app page at `http://tauri.localhost/`
(port open alone is not enough — WebView2 serves `about:blank` first, same trap the
`tauri:check` gate documents). `npm run tauri:run` is the equivalent one-liner that also
pins a throwaway WebView2 profile in `%TEMP%`.

Individual `ui/` and `smoke/` checks were written against the Electron preload
(`window.eduGame`); those payloads need migrating to the `desktop.*` façade before their
assertions can be trusted under Tauri — see the group-C table in
`docs/archive/specs/electron-removal-plan.md`. Ports differ per script — read the header
comment of each file; the port is the first argument or comes from `CDP_PORT`.

### Offline play (Phase 5 acceptance)

The offline promise is now gated by `npm run tauri:check` itself: phase one plays a saved
game inside the packaged shell and asserts **zero outbound network requests** with a
positive control that must fire (a blind counter can't green-light the run), and phase two
re-opens the app and finds the session on disk. The Electron-era `offline-packaged-check.js`
and `grading-packaged-check.js` went out with the Electron removal; text-answer grading
regression coverage is on the port list.

### Update / install path (was: `quitAndInstall()` on the packaged binary, #212)

The `packaged-install-check.js` / `packaged-feed-check.js` gates drove `electron-updater`
against a dummy NSIS feed. They are deleted — the product has no `electron-updater` any
more, and the Tauri updater flow does not exist yet. When it is built (migration plan
giai đoạn 6, item 5), its acceptance criteria are the ones those gates encoded: feed trust,
signature/checksum verification (`sha512`/size), version comparison, install that cannot
brick the app or its data, and rollback on failure. What *is* measured today, per release:
clean install / overlay install / uninstall of the real NSIS bundle in a temp dir
(`scripts/build-tauri-release.js` protocol) and **P7** below for a real clean machine.

### P7: measuring a clean machine that installs the real `.exe` (#212)

The other half of P7 cannot be measured on a dev box, so it is measured by whoever sits at the
pilot machine: `packaging/P7-OFFLINE-INSTALL.md` is the one-page checklist and
`packaging/p7-offline-install.ps1` is the self-logging script (copy both files to the machine;
there is no npm script for it and none is needed).
It records M1…M12 — machine, disk/RAM, elevation state, antivirus, installer bytes +
SHA-256 + `Get-AuthenticodeSignature`, `Zone.Identifier`, install duration **plus distinct
`consent.exe` PIDs** (a count of UAC prompts, not an opinion), install dir contents,
time-to-first-window, **one TCP sample per second** counting only non-loopback/non-RFC1918
endpoints while a saved game is played, shutdown — and writes `%TEMP%\eg-p7\p7-log.txt` plus
`p7-results.md`. It never clicks inside the wizard, and it needs no repo, no Node, no admin.

The `.ps1` is **pure ASCII including comments**: Windows PowerShell 5.1 decodes BOM-less
`.ps1` files using the machine ANSI page, so Vietnamese diacritics become garbage inside the
log it is supposed to keep trustworthy. The Vietnamese version of the steps lives in the `.md`.
**P7 stays open** until real numbers from an air-gapped machine exist.

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
