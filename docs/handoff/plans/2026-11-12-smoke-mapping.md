# Bản đồ smoke Electron → gate Tauri (2026-11-12)

## Bối cảnh

`tests/smoke/` còn 20 tệp `smoke*.js`. Tất cả là CDP-era của Electron:

- gọi payload `window.eduGame.*` (preload đã bị xoá), và/hoặc
- dựa vào hook `EDUGAME_AI_TEST_DIR` (đã bị gỡ cùng Electron), và/hoặc
- mở `release/win-unpacked` hoặc giả định URL `file://.../index.html`.

Không tệp nào chạy được trên Tauri, không `package.json` script hay CI path nào gọi
`tests/smoke/`, và `tests/ui/` đã được port hết sang façade `desktop.*`. Vì vậy mục tiêu
của lượt này là **map hành vi rồi nghỉ hưu cả bộ**, không giữ một bộ không chạy được.

Quy tắc đã áp dụng: chỉ xoá sau khi ghi lại hành vi, gate thay thế và khoảng trống còn lại;
không đổi mã sản phẩm; không tuyên bố parity cho phần chưa đo lại.

## Nhóm 1 — 15 smoke CDP-era (56, 57, 58, 59, 61, 62, 63, 68–75)

| Smoke | Hành vi chính | Gate Tauri thay thế | Quyết định |
|---|---|---|---|
| `smoke56` | Kho báu + đường đua: editor, chơi, validate, lưu/mở lại | `ui-race-treasure` (18/18), `ui-race-editor`, `ui-game-worlds` (52/52), `ui-answer-mode` (219/219), `unit/game-validation`, `unit/game-project-adapter`, `unit/ai-game-design` | Nghỉ hưu — hành vi cốt lõi đã có gate. |
| `smoke57` | Thi đấu đồng đội + bảng xếp hạng sau trận | `ui-answer-mode` (roster, điểm đồng đội, đáp án sai bị trừ), `unit/answer-flow`, `unit/lan-reducer`, `unit/lan-podium` | Nghỉ hưu. Bảng xếp hạng **cục bộ** sau trận chưa được đo lại trực tiếp; bảng vinh danh LAN đã có `ui-lan-treasure-finish`. |
| `smoke58` | Câu trả lời chữ: đúng/sai, điền từ, trả lời ngắn | `ui-answer-mode` (đủ 5 engine + text), `unit/runtime`, `unit/answer-flow`, `unit/question-text`, `unit/answer-mode` | Nghỉ hưu. |
| `smoke59` | Import câu hỏi: chống trùng + toast tổng kết | `ui-input-routing`, `unit/question-import`, `unit/runtime` (dedupe), `unit/lesson-selection` | Nghỉ hưu. |
| `smoke61` | Play modal Tailwind, `data-player-theme`, `paintProgress`, CSS vars | `ui-dark-theme`, `ui-play-surface`, `ui-typography-readability`, `ui-play-mode-card`, `ui-settings-sections` | Nghỉ hưu. |
| `smoke62` | Xoá game ở Thư viện: nút, huỷ, xác nhận, DB | `ui-library-paging`, `unit/game-package-ops` | Nghỉ hưu. |
| `smoke63` | Editor kéo-thả: matching, đường đua, palette, hiệu ứng, lưu | `ui-race-editor`, `ui-item-assets-editor` (29/29), `ui-game-worlds` (52/52), `ui-card-menu` | Nghỉ hưu. |
| `smoke68` | Bản đồ hành trình + nhiệm vụ từng chặng (matching/decode/classification) | `ui-game-worlds` (52/52), `ui-race-treasure` (18/18), `unit/game-validation`, `unit/ai-game-design`, `unit/game-project-adapter` | Nghỉ hưu. |
| `smoke69` | Ba khu vực: giáo án, dự án, thư viện, kết quả, đúng/sai, autosave | `ui-lessons-paging`, `ui-library-paging`, `ui-results-paging`, `ui-project-selection`, `unit/lesson-projects`, `unit/game-package-ops` | Nghỉ hưu. |
| `smoke70` | Kịch bản tuần tự: 1/2/10 câu, sai một câu, tiến liên tục, tổng kết | `ui-answer-mode`, `unit/answer-flow`, `unit/game-validation` | Nghỉ hưu. |
| `smoke71` | Kho báu: nền, avatar, âm thanh, dữ liệu cũ | `ui-item-art`, `ui-editor-art`, `ui-art-upload-flow`, `ui-game-worlds`, `ui-game-background`, `unit/asset-registry`, `unit/illustration-registry`, `unit/game-project-adapter` | Nghỉ hưu. **Âm thanh/tắt tiếng chưa được đo lại trực tiếp** — không có UI check âm thanh hiện tại. |
| `smoke72` | Quản lý tác vụ AI, xác minh CPU-only, nhãn Fast/Thinking | `ui-ai-tasks-paging` (8/8), `ui-settings-sections`, `ui-ai-status-bar`, `unit/ai-tasks`, `unit/settings-runtime-backend` | Nghỉ hưu. Trên Tauri `ai_tasks` **chưa có writer**, nên lịch sử/live task rỗng có chủ đích; pager được đo bằng stub 30 dòng. |
| `smoke73` | Thanh trạng thái AI local / llama.cpp | `ui-ai-status-bar` | Nghỉ hưu. |
| `smoke74` | Nút toàn màn hình khi chơi | `ui-fullscreen-check`, `ui-fullscreen-density` (8/8), `ui-play-mode-card`, `ui-play-surface` | Nghỉ hưu. |
| `smoke75` | Thẻ chế độ bước 4, đồng hồ/ETA bước 5, thanh AI dính | `ui-settings-sections`, `ui-ai-status-bar`, `ui-play-mode-card`, `ui-answer-mode`, `unit/generation-eta` | Nghỉ hưu. |

## Nhóm 2 — 5 smoke đã rà riêng (66, 78, 79, 80, 81)

| Smoke | Hành vi chính | Gate hiện có | Quyết định / khoảng trống |
|---|---|---|---|
| `smoke66` | P6: phân tích → gợi ý → sinh nội dung → adapter → lưu project → editor → thư viện → mở lại không gọi AI | `tauri:check` (bridge + sinh nội dung giả lập), `unit/tauri-lesson-generation`, `unit/lesson-workflow`, `unit/lesson-projects` | **Nghỉ hưu.** E2E model thật trên Tauri **chưa có**: `tests/manual/real-ai-e2e.js` vẫn gọi `window.eduGame`. Cần port script đó sang `desktop.call` rồi chạy với model thật mới được tuyên bố parity. |
| `smoke78` | Chẩn đoán: mở panel, tải info, xuất gói, xoá log hai bước | Rust `diagnostics.rs` tests; `ui-settings-sections` chỉ đo panel + info khi ẩn | **Nghỉ hưu.** Luồng UI **xuất gói / xoá log** chưa được đo lại. Nếu cần parity, thêm `ui-diagnostics-check.js` (bấm nút, đọc đường dẫn/header, xác nhận marker còn sau lần xoá đầu). |
| `smoke79` | Chẩn đoán trên bản packaged Electron (`release/win-unpacked`) | `npm run tauri:check`; P7 vẫn mở | **Nghỉ hưu** — đường đóng gói Electron đã bị gỡ. Không thay thế bằng một check UI; P7 là cổng máy sạch riêng. |
| `smoke80` | Đổi thể loại sau khi đã sinh xong: xác nhận, sinh lại 3 thể loại, lưu, thư viện | `ui-wizard-cancel-genre` (huỷ + OK đổi), `unit/lesson-store` (invariant nội dung không khớp), `unit/lesson-projects`, `unit/game-project-adapter` | **Nghỉ hưu.** Luồng **sinh đủ 3 thể loại rồi lưu** chưa được đo lại end-to-end; invariant và đường picker đã có test. |
| `smoke81` | Dung lượng tài liệu → số câu, chip thể loại bước 3, toast/quay lại bước 5, xác nhận tạo nhanh, tiêu đề dài, tương phản đường đua | `unit/item-capacity`, `ui-input-routing` (tạo nhanh không cần model), `ui-answer-mode`, `ui-race-treasure`, `ui-dark-theme`, `ui-typography-readability` | **Nghỉ hưu.** Các phần **UI** sau chưa được đo lại: số câu ước tính theo tài liệu, chọn chip ở bước 3, toast "đã lưu tiến trình"/quay lại cấu hình, xác nhận luồng nhanh, cuộn tiêu đề dài. Toán dung lượng đã có unit test. |

## Khoảng trống phải port trước khi tuyên bố parity đầy đủ

1. **AI local thật trên Tauri:** port `tests/manual/real-ai-e2e.js`, `real-ai-status.js`,
   `install-local-model.js`, `persistence71.js` từ `window.eduGame` sang `desktop.call`/`desktop.listen`;
   chạy với model + runtime thật. Đây là khoảng trống lớn nhất của `smoke66`.
2. **Chẩn đoán UI:** xuất gói, nội dung header, xoá log hai bước (`smoke78`).
3. **Wizard nâng cao:** dung lượng UI, chip bước 3, toast/quay lại bước 5, xác nhận luồng nhanh,
   tiêu đề dài (`smoke81`); sinh đủ 3 thể loại rồi lưu (`smoke80`).
4. **Bảng xếp hạng đội cục bộ** sau trận (`smoke57`); bảng LAN đã có.
5. **Âm thanh/tắt tiếng** của kho báu (`smoke71`).
6. **Writer `ai_tasks`:** `ai_tasks::start_task/progress_task/complete_task/fail_task` chưa có caller,
   nên lịch sử/live task trên Tauri luôn rỗng. Không phải lỗi pager.
7. **Close guard native:** xem nhóm D bên dưới.

## Nhóm D — quyết định dead-code

| Mục | Quyết định | Lý do / điều kiện xoá |
|---|---|---|
| `src/ai-core/setup-ipc.ts` | **Giữ** | `SETUP_CHANNELS` vẫn là hợp đồng được đối chiếu với `src-tauri/src/api.rs` và `desktop-facade-schema.ts`; `resolveSetupModel` là logic thuần có test. Chưa có consumer sản phẩm, nhưng xoá sẽ làm mất một hợp đồng đang được kiểm. |
| `src/ai-core/unload-guard.ts` | **Giữ tạm** | Đây là nửa main-process của Electron (`will-prevent-unload`). `ui-draft-guard-check` chỉ đo nửa renderer (`beforeunload`) và tự ghi rõ "không thể đo close thật". Tauri chưa có `CloseRequested` guard tương đương. Xoá chỉ sau khi có Rust close guard + test. |
| `src/lan/lan-server.ts`, `tests/manual/lan-smoke.js`, `express`, `socket.io` | **Giữ tạm** | `lan-smoke` là consumer duy nhất của server Node; server Rust `lan.rs` mới chỉ có unit test room-code/profile/WS-frame, chưa thay được các bullet health, trùng tên, reconnect, cách ly chưa xác thực, tính điểm, nhả cổng. Xoá sau khi có gate LAN Tauri phủ các bullet đó. |
| `tests/fixtures/wizard/*` | **Xoá cùng smoke** | Chỉ smoke66/78/80/81 đọc; hook `EDUGAME_AI_TEST_DIR` đã bị gỡ. `tests/fixtures/bench` và `tests/fixtures/tauri-import` vẫn còn consumer. |

## Việc đã làm trong lượt này

- Thêm tài liệu bản đồ này.
- Xoá 20 tệp `tests/smoke/*.js`, thư mục `tests/smoke/`, và `tests/fixtures/wizard/`.
- Cập nhật `tests/README.md`, `docs/AGENT_HANDOFF.md`, `docs/archive/specs/electron-removal-plan.md`,
  `docs/STATUS.md`, `docs/ROADMAP.md`.
- Chạy lại gate build/test; kết quả ghi trong `docs/STATUS.md`.

## Không làm trong lượt này

- Không đổi mã sản phẩm.
- Không xoá `lan-server.ts`/`express`/`socket.io`/`unload-guard.ts` (xem nhóm D).
- Không tuyên bố các khoảng trống ở trên đã được phủ.
