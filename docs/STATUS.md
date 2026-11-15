# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-15 — #264 đường ống gợi ý cảnh (thuần TS, model tiêm, luôn có fallback) — 99/99
- **Trạng thái:** Thêm `src/services/ai/scene-suggest.ts`: prompt dựng **từ catalog**, trích `{…}` cân bằng (hiểu chuỗi/escape/fence), chạy `normalizeSceneBlueprint`, và **luôn trả cảnh vẽ được** — gọi lỗi / JSON hỏng / id lạ / quá dài ⇒ rơi về `sceneBlueprintFromCategory` kèm `issues`.
- **Files:** `src/services/ai/scene-suggest.ts` (mới), `tests/unit/scene-suggest.test.ts` (mới, 12 check), `docs/DECISIONS.md` #264, `docs/ROADMAP.md`, `docs/STATUS.md`.
- **Quyết định:** model **tiêm** từ ngoài (kiểm được không cần khoá/mạng) · chặn phản hồi >8000 ký tự **trước** khi parse · phân biệt `source:'fallback'` với `source:'model'` + `issues` khi `compare` bị hạ cấp (gộp lại sẽ giấu đúng lỗi #262 dựng luật để tránh).
- **Lệnh đã chạy:** `node tests/run-unit.js scene-suggest` **12/12** · `run-unit` **99/99** (44,6 s) · `npm run check` sạch (52 tệp UI) · `renderer-globals` 0 undefined · `check:embedded` khớp 6163,8 KiB.
- **Đối chứng âm (đỏ đúng chỗ):** bỏ trần 8000 ký tự ⇒ check 11 · bỏ hiểu chuỗi JSON ⇒ check 6 · bỏ nhánh fallback ⇒ check 9.
- **Học được:** ca thử ngoặc **cân nhau** trong chuỗi không phân biệt được scanner với phép đếm ký tự — phải dùng ca **lệch** thì đối chứng mới đỏ. Và sửa file bằng `python` trong heredoc tiếp tục ăn mất escape `
` hai lần; phải dùng `edit` cho các chuỗi có dấu `\`.
- **Chưa xác minh (quan trọng):** module **chưa nối vào đâu** — chưa có kênh Rust `scene:suggest`, chưa có nút "✨ Gợi ý cảnh từ nội dung", chưa ghi `ai_tasks`, **chưa chạy lần nào với model thật**. Giáo viên vẫn chỉ có "Cảnh thử".
- **Việc kế tiếp:** kênh Rust `scene:suggest` (khoá ở backend, gọi `ai_http`, ghi `ai_tasks`) + nút trong editor gọi `suggestSceneBlueprint`, rồi đo trên binary thật.

### 2026-11-15 — #263 P3 bước prompt: `compare` vào §5 + ví dụ mẫu chạy qua cổng dữ liệu thật
- **Trạng thái:** §5.2 có `layout (single, compare)`, `compareIcon`, `compareSign`; quy tắc mới (4/6/7/9/10); §5.3 thêm lớp `sign`. Cổng `scene-prompt-doc` **13 → 15** check. §3.3 hết ghi "UI CHƯA CÓ" (giờ: dữ liệu · hình · UI · prompt **đều CÓ**).
- **Files:** `docs/AI_SCENE_DIRECTOR_DESIGN.md` (§5.2, §5.3, §3.3), `tests/unit/scene-prompt-doc.test.ts`, `docs/DECISIONS.md` #263, `docs/ROADMAP.md`.
- **Quyết định đáng nhớ:** ví dụ đầu ra đổi từ `"mainIcon": "..."` sang **JSON thật**, và cổng **chạy chính hai ví dụ** qua `normalizeSceneBlueprint` đòi `issues` **rỗng** — vì blueprint bị hạ `single` vẫn vẽ ra ảnh, nên chỉ kiểm "khác null" là bỏ lọt.
- **Lệnh đã chạy:** `node tests/run-unit.js scene-prompt-doc` **15/15** · **4 đối chứng âm đỏ đúng chỗ** (bỏ `compare` khỏi layout · dấu bịa `gte` · bỏ luật góc compare · `compareIcon` trùng `mainIcon`) · `run-unit` **98/98** (75,2 s) · `npm run check` sạch (52 tệp UI) · `renderer-globals` **0 undefined** (1055 hàm / 8438 lời gọi).
- **Học được:** `idsFor()` tách mục theo dấu phẩy ⇒ chú thích sau danh sách bị cắt thành id (`'= giữa hai hình).'`); chú thích chứa tên khoá cũng bị nhận là mục mới. Luật: dòng id sạch, chú thích ở trên, không dấu phẩy. Và: sửa bằng `python` ở chỗ có escape đã **không khớp** một lần (lookahead `idsFor` còn nguyên) — phải kiểm lại nội dung file sau mỗi lần thay bằng script.
- **Chưa xác minh:** chưa có kênh gọi model (`scene:suggest`), chưa dựng prompt bằng mã từ catalog, chưa có bằng chứng model thật trả JSON hợp lệ. Prompt là **hợp đồng đã kiểm**, chưa phải **lời gọi đã chạy**.
- **Việc kế tiếp:** `scene:suggest` (backend giữ khoá, prompt từ §5, `normalizeSceneBlueprint` làm cổng, hỏng thì rơi về cảnh theo `contentCategory`).

### 2026-11-15 — P1 `compare` chốt sổ: ROADMAP cập nhật + smoke-install bản 0.5.2 vào thư mục tạm
- **Trạng thái:** `docs/ROADMAP.md` ghi P1 **XONG cả 3 bước** (dữ liệu/hình/UI) kèm số đo, và mục "Còn mở" thêm hai nợ thật: `compare` chưa vào prompt §5, chưa thử trên câu `scenario`.
- **Smoke-install:** bộ cài NSIS `0.5.2` chạy `/S /D=D:\smoke262` → **exit 0**, có `edugame-studio-tauri.exe` + `uninstall.exe` + `vc-runtime`. Bản **đã cài** mở được CDP 9362 và render đúng mã mới: `layout=compare`, `Hình phải=fish`, `Dấu=greater-than`, `corners=2`, preview **2 chủ thể**. Gỡ bằng `uninstall.exe /S` → **exit 0**, thư mục sạch.
- **Học được:** lần chạy đầu `/S /D=` qua bash **treo 400 s** (không có output, `cmd //c` còn lỗi cú pháp vì tên tệp có ngoặc + khoảng trắng) — phải dùng `powershell Start-Process -Wait` thì mới thấy exit code.
- **Việc kế tiếp:** P3 bước prompt (`compare` vào §5 + `scene:suggest`).

### 2026-11-15 — #262 P1 `compare` bước 3: UI editor (Kiểu / Hình phải / Dấu), cổng thật 63 → 89/89 — bản đầy đủ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — #262 P1 `compare` bước 2: VẼ hai chủ thể + dấu (10 nền), test toạ độ hai hộp — bản đầy đủ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — #262 P1 `compare` bước 1: dữ liệu + chuẩn hoá (chưa vẽ) — bản đầy đủ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — #260 UI 2 ô props + cổng 63/63 — Bản lưu trữ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — #258 cổng chống backtick + #259 `props[]` — Bản lưu trữ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — #257 UI chọn 4 góc cho giáo viên (trước đó chỉ JSON/AI đặt được) — Bản lưu trữ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — #252–#256, phát hành 0.5.2, `tauri:check` xanh lần đầu, giao diện dày — Bản lưu trữ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-06 — #209 task 1+2, task 3, task 4, task 5, task 6 và task 7 đã lưu ở [docs/handoff/status/2026-11-06.md](handoff/status/2026-11-06.md)

### 2026-11-02 — #171–#173 đã lưu ở [docs/handoff/status/2026-11-02.md](handoff/status/2026-11-02.md)

### 2026-11-12 — Commit nối writer ai_tasks vào 4 đường gọi AI (f106cc0): lesson:analyze, lesson:generate, lesson:regener… — Bản lưu trữ: [docs/handoff/status/2026-11-12.md](handoff/status/2026-11-12.md).

### 2026-11-10 — Giai đoạn 3 hoàn tất: import tài liệu/câu hỏi/ảnh + chẩn đoán, rồi chơi game đã lưu khi offline trong vỏ… — Bản lưu trữ: [docs/handoff/status/2026-11-10.md](handoff/status/2026-11-10.md).

### 2026-11-09 — Kế hoạch khảo sát và chuyển EduGame Studio từ Electron sang Tauri; giai đoạn 0 kiểm kê API + baseline El… — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### 2026-11-08 — Bộ xử lý AI local: lựa chọn GPU tới được tiến trình đang chạy (#227), Phát hành 0.5.0 (#226), khối thảo … — Bản lưu trữ: [docs/handoff/status/2026-11-08.md](handoff/status/2026-11-08.md).

### 2026-11-07 — Phát hành v0.4.2, #216 và #215 — Bản lưu trữ: [docs/handoff/status/2026-11-07.md](handoff/status/2026-11-07.md).

### 2026-11-05 — Bản lưu trữ: [docs/handoff/status/2026-11-05.md](handoff/status/2026-11-05.md).

### 2026-11-04 — Bản lưu trữ: [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md).

### 2026-11-03 — Bản lưu trữ: [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md).

### 2026-11-01 — [docs/handoff/status/2026-11-01.md](handoff/status/2026-11-01.md) — Bản lưu trữ: [docs/handoff/status/2026-11-01.md](handoff/status/2026-11-01.md).

### 2026-10-31 — [docs/handoff/status/2026-10-31.md](handoff/status/2026-10-31.md) — Bản lưu trữ: [docs/handoff/status/2026-10-31.md](handoff/status/2026-10-31.md).

### 2026-10-30 — [docs/handoff/status/2026-10-30.md](handoff/status/2026-10-30.md) — Bản lưu trữ: [docs/handoff/status/2026-10-30.md](handoff/status/2026-10-30.md).

### 2026-10-29 — [docs/handoff/status/2026-10-29.md](handoff/status/2026-10-29.md) — Bản lưu trữ: [docs/handoff/status/2026-10-29.md](handoff/status/2026-10-29.md).

### 2026-10-28 — [docs/handoff/status/2026-10-28.md](handoff/status/2026-10-28.md) — Bản lưu trữ: [docs/handoff/status/2026-10-28.md](handoff/status/2026-10-28.md).

### 2026-10-27 — [docs/handoff/status/2026-10-27.md](handoff/status/2026-10-27.md) — Bản lưu trữ: [docs/handoff/status/2026-10-27.md](handoff/status/2026-10-27.md).

### 2026-10-26 — [docs/handoff/status/2026-10-26.md](handoff/status/2026-10-26.md) — Bản lưu trữ: [docs/handoff/status/2026-10-26.md](handoff/status/2026-10-26.md).

### 2026-10-25 — [docs/handoff/status/2026-10-25.md](handoff/status/2026-10-25.md) — Bản lưu trữ: [docs/handoff/status/2026-10-25.md](handoff/status/2026-10-25.md).

### Không ghi ngày (mục cũ #70–#79, khoảng 2026-10-22/23) — [docs/handoff/status/undated-070-079.md](handoff/status/undat… — Bản lưu trữ: [docs/handoff/status/undated-070-079.md](handoff/status/undated-070-079.md).

### 2026-10-23 — [docs/handoff/status/2026-10-23.md](handoff/status/2026-10-23.md) — Bản lưu trữ: [docs/handoff/status/2026-10-23.md](handoff/status/2026-10-23.md).

### 2026-10-22 — [docs/handoff/status/2026-10-22.md](handoff/status/2026-10-22.md) — Bản lưu trữ: [docs/handoff/status/2026-10-22.md](handoff/status/2026-10-22.md).

### 2026-10-21 — [docs/handoff/status/2026-10-21.md](handoff/status/2026-10-21.md) — Bản lưu trữ: [docs/handoff/status/2026-10-21.md](handoff/status/2026-10-21.md).

### 2026-10-20 — [docs/handoff/status/2026-10-20.md](handoff/status/2026-10-20.md) — Bản lưu trữ: [docs/handoff/status/2026-10-20.md](handoff/status/2026-10-20.md).

### 2026-10-19 — [docs/handoff/status/2026-10-19.md](handoff/status/2026-10-19.md) — Bản lưu trữ: [docs/handoff/status/2026-10-19.md](handoff/status/2026-10-19.md).

### Giai đoạn 3 bước 1/6 — Chốt backend SQLite của vỏ Tauri: `rusqlite` bundled, cùng tệp, cùng DDL, đã mở được dữ liệu 0… — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### Giai đoạn 2 — Tách API desktop khỏi renderer: một façade, hai adapter, Tauri không còn `window.eduGame` (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### #251 — Chốt bảy quyết định phạm vi/tiêu chí của kế hoạch Tauri (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### Giai đoạn 0 của kế hoạch Tauri: kiểm kê API desktop và đo baseline Electron 0.5.1 (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### Kế hoạch khảo sát/chuyển Electron sang Tauri (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### npm start chạy bản mới: build sạch 0.5.1 và xác minh #250 trên chính dist vừa build (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### #250 — Khung chat Giáo án: xoá cuộc trò chuyện xong vẫn gõ được, gửi xong ô nhập tự trống (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### #229 — Hỏi đáp AI local đọc nhiều hơn hẳn: ngân sách theo cửa sổ ngữ cảnh thật, lược phần giữa giáo án, và câu trả lờ… — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### #228 — CPU → Vulkan: lần thay bản không bị khóa thư mục nữa, và bỏ trạng thái "cài GPU vẫn chạy CPU" (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### #224 — Dòng "Thảo luận" của Tình huống mang mực câu hỏi; khối phản hồi dưới ảnh hết chữ trắng (2026-11-08) — Bản lưu trữ: [docs/handoff/status/2026-11-08.md](handoff/status/2026-11-08.md).

### #223 — Bỏ "Giữ hành vi hiện tại": game cũ mở ra là Thi đấu, lưu bằng token (2026-11-08) — Bản lưu trữ: [docs/handoff/status/2026-11-08.md](handoff/status/2026-11-08.md).

### #219 — Chòm sao tri thức: chữ to hơn, phản hồi đúng/sai rõ ràng (2026-11-08) — Bản lưu trữ: [docs/handoff/status/2026-11-08.md](handoff/status/2026-11-08.md).

### Đóng nợ #212 — lỗi checksum có kind riêng, đo 62/62 trên binary đóng gói (2026-11-08) — Bản lưu trữ: [docs/handoff/status/2026-11-08.md](handoff/status/2026-11-08.md).

### Chế độ dev `npm run dev` — sửa renderer thấy ngay, không cần mở lại app (2026-11-07) — Bản lưu trữ: [docs/handoff/status/2026-11-07.md](handoff/status/2026-11-07.md).
