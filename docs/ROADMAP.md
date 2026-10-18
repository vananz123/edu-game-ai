# Roadmap

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
- [ ] Kéo thả để sắp xếp; thêm ảnh cho từng cặp.

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
- [ ] Giao diện kéo thả ô đặc biệt + xem trước đường đi trực quan (hiện là bảng rows).
- [ ] 6.5 AI sinh đường đua/bộ câu hỏi theo thời lượng tiết học — chưa làm.

### §7 Cá nhân hóa phong cách theo từng giáo viên
- [x] Panel "Phong cách giảng dạy của tôi" (giọng điệu, hài hước, mỹ thuật, ví dụ yêu thích, ghi chú AI); lưu vào settings; AI dùng làm mặc định khi sinh game (`buildPrompt` trong `src/main.ts`). Verified qua CDP smoke `tests/legacy/smoke-ui.js` (2026-10-17).
- [ ] Nhiều hồ sơ giáo viên riêng (hiện mỗi máy 1 thiết lập chung).

### Cross-cutting / unverified
- [x] Library SQLite, chơi offline, `.egame` export/import (logic-level test), validation 4 template.
- [~] End-to-end AI với model thật (cloud Gemini + local Qwen) — tầng normalize/schema/unit test đã có; không có model/API trong harness. (offline path hoàn chỉnh; cần verify CDP với runtime local/online).
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
