# Roadmap

## Tailwind CSS migration + UI/UX refresh (in progress, 2026-10-18)

Replace the 5 hand-written stylesheets (`global/layout/components/pages/responsive.css`, ~427 rules, ~250 classes) with Tailwind CSS v4 utilities/components, then use the freed-up budget for a creative UI/UX pass. Direction agreed with the owner: animations across the whole app; the in-game player UI adapts to the audience (child → teen → adult) **only while a game is being presented**; UI/UX may be redesigned creatively, pixel parity matters only while both CSS systems coexist.

- [x] **G0 — Zen online AI** (pre-requisite work, verified 43/43) — see STATUS.
- [x] **G1 — Infrastructure:** Tailwind v4 CLI standalone, `src/renderer/styles/app.css` entry (`@source`, `@theme` tokens/breakpoints/9 animations, `@layer components .motion-safe-off`, temporary `@layer base` UA reverts so preflight doesn't disturb the legacy look), `build:css` in the build chain, `app.css` as the only linked sheet. Verified: check + 11 test suites + `smoke60` 43/43; geometry diff CSS-on vs CSS-off reduced to 31/764 elements at 1–2 px.
- [x] **G2a — Cascade fix (prerequisite for G2):** the 5 legacy stylesheets are now imported into `@layer components` from `app.css` (single `<link>`) instead of separate sheets, because unlayered legacy always outranked `@layer utilities` — utilities would have been dead on arrival. Verified by a CDP geometry A/B (layered vs. old unlayered behaviour): **0 diffs** across all 7 pages (noise baseline 0), `npm run check`, `npm test` (11 suites), `smoke60` **43/43**, 0 uncaught.
- [x] **G2 — Shell + static pages (verified 2026-10-18, STATUS Phase 2b):** migrate `index.html` (sidebar/topbar/nav) + `core/render.ts` + `shared.ts` + `pages/*` to utilities. Legacy rules may stay as fallback (they are now overridable); delete the ones that become redundant as sections migrate, and the whole files in G5.
- [x] **G3 — Components + editor (verified 2026-10-19, STATUS Phase 2c):** migrate `components.css` and the inline styles in `game-editor.ts` (879 lines, 23 inline styles → 0 `style=` / 0 `style.display`; show/hide via `hidden`-class toggles; `tests/smoke56.js` assertions updated).
- [x] **G4 — Gameplay + audience theming (verified 2026-10-18, STATUS Phase 2d):** migrate `features/gameplay.ts` (dark play modal, 41 inline styles → 0 `style=`; dynamic progress bars → `data-progress` + `paintProgress()` runtime write); add `data-player-theme="child|teen|adult"` on the play-modal root with `--player-fs`/`--player-radius`/`--motion-scale` variables driven from `preferences.audience` (settings select `#settingAudience`). Live-verified by new CDP `tests/smoke61.js` **18/18**, 0 uncaught; `npm run check` + `npm test` (11 suites). Remaining `style=` elsewhere (create/local-ai/bootstrap/home — 16) is G5 follow-up.
- [x] **G5 — Motion + performance + cleanup (verified 2026-10-19, STATUS Phase 2e):** remaining 16 inline `style=` → 0 (`create.ts`/`local-ai.ts`/`bootstrap.ts`/`home.ts` → utilities + `hidden` toggles; `controller.ts` runtime `style.display` → `classList.toggle('hidden')`); deleted the 5 legacy stylesheets + their `@import … layer(components)` lines and their 81 dead classes (class-usage survey: 220 declared → 139 used incl. dynamic `race-cell-*`; 10 false-positive keeps dropped manually); the surviving 226 rules (modal/field/editor/play-mode/chat systems + state classes) were ported into `app.css` `@layer components` with a `:root` → `@theme` var alias block (`--purple`/`--line`/`--shadow`…); animation tokens applied app-wide (`.modal-backdrop` `var(--animate-fade-in)`, `.modal` `var(--animate-pop-in)` — all suppressed by `.motion-safe-off`). **Kept the `@layer base` UA-normalization block** (re-verified: deleting it = 3775 geometry diffs — the G2–G4 markup was written under it; it is no longer "temporary", comment updated). Verified: geometry A/B 7 pages 1336 elements **0 diffs** (`tests/geom-ab.js`, noise 0), new modal A/B `tests/modal-ab.js` 8 screens 245 elements **0 CSS diffs** (only the empty `#modalRoot`'s document-position `y` varies with pre-dump page state), `smoke61` 18/18, `npm run check`, `npm test` (11 suites), 0 uncaught.

## Editor drag-drop + race track preview (done, 2026-10-19)

Closes the two remaining tasknight visual-authoring items (§4 "Kéo thả để sắp xếp", §6 "Giao diện kéo thả ô đặc biệt + xem trước đường đi trực quan"). Editor-only: gameplay, data contracts, validators and `.egame` are untouched. See STATUS "Editor kéo-thả (matching + race) + xem trước đường đua".

- [x] **Matching pair reorder by drag** — handle `⠿` per row (`data-pair-drag`), drop above/below a target row; ↑/↓ and ✕ kept as fallback.
- [x] **Race track preview** — `#raceTrackPreview` renders 1..trackLength reusing `.race-cell`/`race-cell-*`; start 🚩 + team icons, finish 🏁, out-of-range effects warned, lucky cells dimmed when luck is off.
- [x] **Preview theme toggle** — `#racePreviewTheme` switches `data-preview-theme="editor"` (light, default) ⇄ `"play"` (dark, gameplay colours); survives re-render, resets on editor open.
- [x] **Drop effect palette onto a cell** — `placeRaceEffect`; occupied cell or cell 1 → toast, no change; **move** an existing cell effect by dragging its `⠿` handle onto another cell (`moveRaceCellRow`, conflict → toast).
- [x] **Race question reorder by drag** + renumber; team rows reorderable too.
- [x] **Guards** — no gamepad/API changes; DOM stays the single source of truth for `readMatchingEditor`/`readRaceEditor`.
- Verified: `tests/smoke63.js` **49/49**, regression `smoke56` 56/56, `smoke57` 37/37, `smoke58` 25/25 (2 stale assertions fixed), `smoke59` 21/21, `smoke61` 18/18, `smoke62` 9/9, `geom-ab` 0 diff, `modal-ab` 0 diff, `npm run check`, `npm test` (11 suites).
- Must-keep selectors (used by code/CDP smokes): `.stage-top`, `.answer-option`, `.race-cell`, `.feedback`, `[data-play-close]`, `[data-race-answer]`, `.match-card`, `.memory-card`, and the `#id`s (`#saveGameBtn`, `#treasureStageCount`, `#raceTeamCount`, `#drawQuestionBtn`, …); state classes toggled via `classList` stay as real classes, not utility soup.

## v0.3 tasknight (`docs/tasknight.txt`) — Trạng thái đã làm / chưa làm

### §2 Đấu trường kiến thức (quiz)
- [x] 2.1 Cách chơi: câu hỏi + phương án, phản hồi đúng/sai + giải thích, tổng điểm/số đúng/thời gian/bảng xếp hạng.
- [x] 2.2 Giao diện trong lúc chơi (thanh tiến độ, feedback, results).
- [x] 2.3 Năm chế độ tính điểm: cơ bản, tốc độ (thưởng ≤50, không khi luyện tập), theo độ khó (bảng 100/200/300), **thi đấu đội** (setup 2–6 đội, luân phiên, cộng điểm đội, leaderboard), luyện tập.
- [x] 2.4 Tạo thủ công: 4 dạng câu hỏi (trắc nghiệm, đúng/sai, điền từ, trả lời ngắn), thêm/xóa/sắp xếp phương án & câu, đánh dấu đáp án, lời giải thích, độ khó/điểm, copy câu, nhập từ CSV/TSV/XLSX (cột "Dạng câu hỏi", dedupe + toast tóm tắt).
- [x] 2.5 Tạo bằng AI: schema 6 type, validate (thiếu đáp án → chặn ở local mode), chuẩn hóa đầu ra.
- [ ] 2.5 AI tự phát hiện câu trùng lặp **trong chính bản nháp** và gợi ý duyệt/tạo lại từng câu (regenerate riêng).
- [ ] Yêu cầu phân bổ độ khó ("5 dễ, 7 trung bình, 3 khó") chưa được enforce khi sinh.

### §3 Thử thách tình huống (scenario)
- [x] 3.1 Chơi đa nhánh: lựa chọn có hậu quả, lựa chọn trước ảnh hưởng tình huống sau, tổng hợp quyết định cuối.
- [x] 3.3 Chấm điểm chất lượng quyết định (an toàn 0–60, giải thích 0–25, hậu quả 0–15) hoặc đúng/sai đơn giản.
- [x] 3.4 Tạo thủ công: bối cảnh, lựa chọn + phản hồi riêng, điểm & nhánh tiếp theo, câu thảo luận.
- [x] 3.5 AI sinh câu scenario (schema hỗ trợ).
- [ ] Sơ đồ nhánh đồ họa (hiện chỉ có select nhánh); hình ảnh/âm thanh minh họa; đọc tình huống bằng giọng nói.

### §4 Ghép cặp kiến thức (matching)
- [x] 4.1 Ba cách chơi: ghép hai cột, lật thẻ ghi nhớ, phân loại kiến thức.
- [x] 4.2 Điểm: thưởng theo cặp, penalty cấu hình (mặc định 0), thưởng thời gian/hoàn thành, chế độ luyện tập.
- [x] 4.3 Bảng chỉnh sửa cặp trực quan (thêm/sửa/xóa/dời vị trí) + chọn cách chơi.
- [x] 4.4 AI sinh matching (schema type `matching`) — chưa verify end-to-end với model thật.
- [x] Kéo-thả để sắp xếp cặp trong editor (2026-10-19, `tests/smoke63.js`; giữ ↑/↓ làm dự phòng).
- [ ] Thêm ảnh cho từng cặp.

### §5 Giải mã kho báu (treasure-hunt)
- [x] 5.1 Hành trình nhiều chặng: câu đố → nhiệm vụ → thử thách tổng hợp → kết, chọn nhánh, giới hạn lượt thử (sai → gợi ý, không chơi lại từ đầu), nhiều kết thúc.
- [x] 5.3 Điểm & phần thưởng: câu đố, hoàn thành chặng, vật phẩm ẩn, journey bonus (giá trị cấu hình được).
- [x] 5.4 Trình soạn thảo màn chơi riêng: tạo/nhân bản/dời chặng, cốt truyện & nhiệm vụ, options + đáp án, lượt thử/điểm/gợi ý, nhánh có nhãn, vật phẩm ẩn.
- [ ] 5.2 UI kiểu bản đồ/hình nền/nhân vật/âm thanh minh họa.
- [ ] Kiểu nhiệm vụ đa dạng mỗi chặng (ghép cặp/giải mã/phân loại trong treasure) — hiện câu chặng chỉ trắc nghiệm.
- [x] 5.5 AI sinh thiết kế hành trình (`treasureHunt`) — đã thực thi (design blocks + buildTreasureHunt + normalize/offline; test 10/10).

### §6 Đường đua chinh phục (race)
- [x] 6.1 Chơi chung màn hình: luân phiên đội, đọc hỏi/trả lời/xác nhận, đội về đích hoặc hết lượt thì thắng.
- [x] 6.3 Hai hệ thống: tiến độ đường đua (dễ +1 / TB +2 / khó +3, ô đặc biệt boost −1/may mắn +1/thử thách) + điểm kiến thức; cờ tắt may mắn, giới hạn step.
- [x] 6.4 Trình soạn: chiều dài track, số lượt, đội, ô đặc biệt (số ô/type/label), ngân hàng câu hỏi tái sử dụng (độ khó, options).
- [x] Giao diện kéo thả ô đặc biệt + xem trước đường đi trực quan (2026-10-19 — preview 1..trackLength dùng lại `.race-cell`, palette 4 loại thả vào ô, kéo ô đổi vị trí, nút đổi tông "soạn thảo ⇄ như lúc chơi"; `tests/smoke63.js`).
- [ ] 6.5 AI sinh đường đua/bộ câu hỏi theo thời lượng tiết học — chưa làm.

### §7 Cá nhân hóa phong cách theo từng giáo viên
- [x] Panel "Phong cách giảng dạy của tôi" (giọng điệu, hài hước, mỹ thuật, ví dụ yêu thích, ghi chú AI); lưu vào settings; AI dùng làm mặc định khi sinh game (`buildPrompt` trong `src/main.ts`). Verified qua CDP smoke `tests/legacy/smoke-ui.js` (2026-10-17).
- [ ] Nhiều hồ sơ giáo viên riêng (hiện mỗi máy 1 thiết lập chung).

### Cross-cutting / unverified
- [x] Library SQLite, chơi offline, `.egame` export/import (logic-level test), validation 4 template.
- [~] End-to-end AI với model thật: **online (OpenCode Zen free tier) đã verify qua CDP `tests/smoke60.js` 43/43 (2026-10-18)** — analyze + generate/save/play treasure-hunt & race với `mimo-v2.6-flash-free`. Local llama.cpp/Qwen chưa verify (cần runtime + model thật trên máy). Tổng normalize/schema/unit test đã có.
- [ ] Native dialog import/export click-through; XLSX với cột type (parser type-agnostic, chưa smoke).
- [~] `npm run dist:win` package Windows; nâng cấp/downgrade dữ liệu người dùng. (chưa chạy build installer trong phiên này).

## v0.3 — Existing prototype
- Migrate Electron source to TypeScript.
- Replace JSON library storage with SQLite and migrate existing v0.2 library on first run.
- Keep offline game play and `.egame` portability.
- A TypeScript AI Gateway scaffold with Supabase auth validation, server-only Gemini key, and monthly free/plus quotas exists, but is not part of the Offline AI V1 target.

## Offline AI V1

### Phase A — TypeScript structure and contracts
- [x] Preserve the existing npm/Electron/TypeScript project structure and add an isolated `src/ai-core` contract boundary.
- [x] Define lifecycle, model manifest, download progress, local runtime, and quiz-generation contracts without inventing a production model manifest.
- [x] Document current-vs-target behavior and the migration boundary.

### Phase B — AI process manager
- [x] Implement an AI manager with shared startup, health checks before `READY`, bounded startup/shutdown, loopback binding, and managed stop.
- [x] Add focused tests using Node as a safe fake local HTTP runtime; do not download or execute an AI runtime in this phase.
- [x] Integrate the manager with Electron Main (`localAiManager` in `src/main.ts`); Renderer must not choose executable paths or launch arguments.

### Phase C — Model installation and verification (foundation)
- [x] Implement disk-space checks, download progress/resume where supported, temporary files, size and SHA-256 verification, and atomic installation.
- [x] Require model-selection metadata for minimum/recommended RAM, CPU threads, GPU/VRAM/layers, supported languages, expected result, license, and optional sourced benchmark.
- [x] Add tests for fresh downloads, Range resume, no-Range restart, low disk space, checksum rejection, and hardware selection summaries.
- Do not offer a user-facing model until its real source, checksum, size, license, hardware profile, and any performance claims are independently verified.
- [x] Add a model-selection UI that presents this information and the current machine's detected capabilities before a download is started (settings page + `model-catalog`).

### Phase D — Local model runtime
- [x] Runtime installer + health-gated startup/shutdown wired into main (`runtime-installer`, `ai-manager`).
- [ ] Select and document a suitable GGUF model and llama.cpp runtime after verifying Windows compatibility, license, distribution terms, and hardware requirements on real hardware.
- [ ] Validate local generation quality with an installed model (document-assist + game generation).

### Phase E — Quiz vertical slice
- [x] Generate quiz drafts (structured output validated by zod in local mode + `normalizeAiGame`), teacher preview/editing in the game editor, save to SQLite, export through the trusted offline game engine.
- [x] Unit tests for schema/normalize/validation and offline exported play (logic-level round-trip).
- [ ] End-to-end verification with a real model.

### Phase F — Windows release
- [ ] Package the runtime but not the model; validate install/upgrade/uninstall, native dependencies, user data preservation, and offline behavior.
- [ ] Document code-signing and licensing requirements before public release.

## AI lesson-to-game optimization (O0–O7, spec 2026-10-20)

Owner spec: `docs/update-AI-local.txt`. Full audit, target flow, modules, storage and risks: `docs/implementation-plan.md` §13. Rule of the workstream: **only call Qwen for work that truly needs language/pedagogical ability**; reuse everything; never call AI to pick a genre or apply ordinary config; never regenerate parts that already pass.

- [ ] **O0** Audit + phased plan approved by owner (plan §13) — **no code before approval**.
- [x] **O1** Genre recommendation in TypeScript (`game-type-rules` + `game-recommender`); `lesson:recommend` keeps its shape but makes **0 Qwen calls**. Verified 2026-10-20: 18 test suites, `smoke64` 39/39, `smoke65 output` 18/18 (rewritten to test the AI error at generate), `smoke56/62/63/66/67` green, no model running.
- [ ] **O2** Quality validators (`lesson-quality`): duplicates, counts, distractors, objective coverage — hard errors vs teacher-facing warnings.
- [ ] **O3** Lesson chunking + retrieval plumbing (lexical pseudo-embedder first), generation prompt uses retrieved chunks instead of 6k raw text.
- [ ] **O4** Real MiniLM embeddings (separate llama-server with `--embedding`), verified on a Vietnamese lesson corpus; embedding cache.
- [ ] **O5** Cache keys (analysis/generation), configurable batching, per-item regeneration (`lesson:regenerate-item` + editor button).
- [ ] **O6** Fast/Deep (verify `enable_thinking` on the real GGUF) + `tests/bench-ai.js` → `docs/BENCHMARKS.md` (before/after numbers).
- [ ] **O7** Progress/cancel UI polish, full regression (`smoke56/62/63/64/65/66/67`), `dist:win`, docs.

Gates: O1 = **0 Qwen calls for genre choice**; O4 = retrieval quality + RAM measured, no guesses; O5 = second game from the same lesson skips analysis; O6 = before/after benchmark table. Never trade pedagogical correctness for speed.
