# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-24 — #334 Bản bump 0.5.3 thiếu ba chỗ đồng bộ, và một hiệu ứng bị chạy HAI lần
- Bản `02641b1` (bump 0.5.3) đổi `package.json` + `Cargo.toml` + `tauri.conf.json` nhưng **bỏ sót ba chỗ**, và mỗi chỗ đều có cổng bắt được:
  1. `package-lock.json` vẫn `0.5.2` ⇒ `brand-assets.test` đỏ (`lock.version` lệch);
  2. `server/index.ts` `/health` vẫn trả `version: '0.5.2'` ⇒ cùng test đỏ ở khẳng định thứ hai (test này đọc **ba** nguồn sự thật, không phải một);
  3. `tests/manual/verify-css.js` còn ghim `page-fade-in … opacity:.88` trong khi CSS mới bắt đầu từ `opacity:0` ⇒ `verify:css` **60/61**.
- Sửa: `npm install --package-lock-only` (lock = 0.5.3), `/health` = `0.5.3`, và cổng CSS ghim **giá trị MỚI** (`opacity:0;transform:translateY(10px)`) kèm ghi chú vì sao (0.88 ở 0.18s gần như không thấy). `verify:css` **61/61**, unit **104/104**.
- **Một lỗi thật do hai cơ chế chồng nhau:** `libraryCardHtml` được thêm `style="--i:${index % 9}"`, nhưng `--i` chỉ có tác dụng với `.game-card` (`animation-delay:calc(var(--i,0)*55ms)`) — mà `.game-card` nằm **bên trong** `.lib-item`, còn `.lib-item` đã có stagger riêng bằng `:nth-child` (#325). Kết quả: thẻ thứ 9 nhận **hai** độ trễ cộng lại (0,24s của khung + 0,44s của thẻ), phần khung (kèm ô chọn) hiện trước còn thẻ bên trong vẫn trong suốt. Bỏ `style="--i:…"`; `ui-library-stagger-check` vẫn **8/8** bằng `:nth-child` thuần CSS — đúng như #325 đã chốt.
- **Dựng lại từ target rỗng** (đã xoá 7,0 GB ở #330): `npm run build` + `build:tauri` + `build-embedded-js` + `cargo tauri build` chạy sạch — **không cần** mẹo xoá dòng 7 nữa, vì `tauri.conf.json` giờ đã dùng `devUrl` và **đã được commit** (`src-tauri/tauri.conf.json` sạch trong `git status`, hash `2d15e8e6…`).
- Installer v0.5.3 (dựng lạnh): **16 297 788 byte** / 24-11 **17:43** / SHA-256 `0ac9540000c42d77513a088d3b36c78c44dfe1f5701f31c1c8cf75f8f239afbc`.
- Cổng xanh trên binary 0.5.3: library-stagger **8/8** · match-flash **6/6** · wizard-motion **8/8** · page-head **6/6** · answer-mode **219/219** · play-surface **812/812** · result-cascade **9/9** · memory-flip **9/9** · stage **179/179** · item-assets **157/157** · question-template / editor-art / library-paging / project-selection pass · unit **104/104** · `verify:css` **61/61** · `check:renderer-globals` **1132 hàm / 9202 lời gọi, 0 undefined** · `check:embedded` khớp (6217.2 KiB).
- **Chưa phát hành 0.5.3**: release công khai vẫn là **v0.5.2**. Tag + release 0.5.3 chờ quyết định của người dùng.

### 2026-11-24 — #333 Phát hành v0.5.3 — UI polish hoàn chỉnh
- **Version bump:** `package.json`, `tauri.conf.json`, `Cargo.toml` → `0.5.2 → 0.5.3`.
- **Sửa breaking change tauri-build v2.7.4:** `tauri.conf.json` field `devPath` → `devUrl` (trường cũ bị loại khỏi schema v2, gây `failed to run tauri-build`).
- **Build:** `npm run build:tauri` (174 tệp, embedded 6217 KiB) → `node scripts/build-tauri-release.js` (Rust `4m53s`) → `cargo tauri build --bundles nsis` (NSIS `4m03s`).
- **Installer:** `EduGame.Studio-0.5.3-x64-setup.exe` — **16 305 958 byte** (15.55 MiB) / 24-11 **16:36** / SHA-256 `8cf145d278565056c65fc178425a839166f46ade6dec0902b5ef6c2c1ccdc212`.
- Lưu tại: `%TEMP%\edugame-release-v0.5.3\` (kèm `SHA256.txt`).
- **Nội dung v0.5.3** (từ #331–#332): page-fade rõ hơn, toast exit animation, treasurePulse mạnh hơn, game-card hover lift, library card stagger, question slide-in reset mỗi câu, search focus ring dark-mode.
- **Chưa xác minh bằng cổng UI** trên binary mới.
- **Việc tiếp theo:** tag git `v0.5.3`, đăng GitHub Release.

### 2026-11-24 — #332 S4-3: Search focus ring rõ hơn + dark-mode
- **File:** `src/renderer/styles/components.css` (1 chỗ, +4/−1 dòng).
- `.lib-search` thêm `transition` mượt; `:focus-within` border `#6258e8`, ring alpha `0x28`; dark-mode rule mới.
- Tests: **104/104** xanh.

### 2026-11-24 — #331 UI/UX: 6 cải tiến animation & readability còn lại
- Page fade `opacity 0→1`, toast exit gap 220ms, treasurePulse scale 1.12 + ring, game-card hover lift, library card stagger `--i × 55ms`, question slide-in reflow reset mỗi câu.
- Tests: **104/104** xanh.

*(#329–#330 đã archive → `docs/handoff/status/2026-11-24.md`)*
