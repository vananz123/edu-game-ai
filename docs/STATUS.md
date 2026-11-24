# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

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
