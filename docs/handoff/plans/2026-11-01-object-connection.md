# Kế hoạch: chế độ "Kết nối vật thể" cho game ghép cặp

Nguồn yêu cầu: `update_game.txt`. Ngày: 2026-11-01. Quyết định: `docs/DECISIONS.md` #168.
Trạng thái: **đã triển khai** (xem `docs/STATUS.md`).

## 0. Đích đã chốt với người dùng

Yêu cầu viết *"Extend the existing Mảnh ghép (Puzzle) game"*. Trong sản phẩm không có
thể loại nào tên "Mảnh ghép"; game ghép cặp tên hiển thị là **"Ghép cặp kiến thức"**
(template `matching`, `src/renderer/pages/create.ts:15`). Người dùng xác nhận đó là
đích, và chốt ba điểm:

1. Object Connection là **cách chơi thứ tư của matching** — `matchingGame.mode` thêm
   `'connection'` cạnh `columns` / `memory` / `categorize`.
2. Nhánh đã làm nhầm cho Đấu trường kiến thức được **gỡ sạch**; chỉ giữ lại phần dữ
   liệu + logic + SVG + test.
3. **Hình kết nối thay bảng ghép hai cột** trên màn chơi; bộ chọn cặp giữ nguyên để
   học sinh nhập câu trả lời.

## 1. Vì sao đây vẫn là "mở rộng", không phải game mới

- `matchingGame.pairs` được dùng nguyên vẹn: giáo viên soạn cặp như cũ, chỉ đổi CÁCH CHƠI.
- Điểm, phạt sai, thưởng hoàn thành, thưởng thời gian, luyện tập vẫn đi qua
  `MatchingGameData` cũ và `calculateMatchingSummary`.
- Ba kiểu ghép còn lại không đổi một byte hành vi (được kiểm bằng
  `ui-matching-finish-check.js` **22/22**).

## 2. Kiến trúc

```
src/shared/
  connection-templates.ts   7 template (node / edge / stage) + validateConnectionTemplate()
  connection-progress.ts    planConnectionStages(template, pairCount | items),
                            applyConnectionAnswer(progress, template, plan, itemIndex, itemId, correct),
                            resetConnectionProgress(), connectionSummary(), isConnectionComplete()
src/renderer/                (script toàn cục — renderer không dùng ES module)
  connection-core.ts        cùng hợp đồng với connection-progress, bản global
  shared/connection-constants.ts  CONNECTION_VIEWBOX, CONNECTION_TEMPLATE_IDS, default
  shared/connection-data.ts       BẢN SAO dữ liệu 7 template cho renderer
  features/games/connection.ts    SVG renderer dùng chung, gallery, panel, preview
src/shared/types.ts         MatchingMode thêm 'connection'; MatchingGameData.connectionTemplate
src/shared/lesson-types.ts  MatchingConfig/MatchingDraft.connectionTemplate
src/services/lesson/lesson-contracts.ts   enum + template optional ở config và draft
src/services/game/game-validation.ts      MATCHING_MODES thêm 'connection'
src/services/game/game-project-adapter.ts matchingData()/matchingDraftFromGame()/configFromGame()
src/renderer/features/games/matching.ts   renderConnectionBoard() + nhánh trong evaluateColumnMatch()
src/renderer/features/games/three-stage.ts buildConnectionWorld() + reactConnectionBoard()
src/renderer/features/editor/matching.ts  option thứ tư + gallery + readMatchingEditor
src/renderer/features/wizard/step-configure.ts  KIỂU GHÉP thêm option + wizardConnectionFields()
src/renderer/features/games/result-screen.ts     buildConnectionView() cho máy chiếu
src/renderer/features/presentation.ts            renderConnectionView() (SVG thuần)
src/renderer/styles/game-connection.css          + @import cuối app.css
```

## 3. Tiến độ theo số cặp (yêu cầu §5)

`planConnectionStages(template, n)`:

- `n === k`: cặp i nối stage i.
- `n > k`: `k` cặp đầu nối stage của mình, cặp còn lại vẫn tính điểm nhưng không nối.
- `n < k`: rải đều `floor(i·k/n)`, các stage còn lại mở khi **mọi** cặp đã nối đúng.

Bất biến có test: `plan.length === n`; không stage nào nối hai lần; sai không lùi; nối
lại cùng một cặp không nối thêm chặng; chơi đúng hết luôn ra `k/k`; chơi sai hết ra `0/k`;
danh sách stage lưu theo **thứ tự template**, không theo thứ tự nối.

## 4. Hiển thị

- Cửa sổ giáo viên: SVG (đọc rõ ở 1366×768 và 1920×1080) + Three.js chỉ thêm một tia
  nối và một chấm sáng ở node vừa mở (như Xây nhà: 3D là phần thêm, DOM là nội dung).
- Máy chiếu: `presentation.html` không nạp `three.global.js` (chưa từng nạp, kể cả cho
  Xây nhà), nên view `connection` chỉ là markup SVG dựng từ dữ liệu trong snapshot.
- Màn kết quả: hero hình + `n/k chặng` + "Còn dang dở" nếu chưa đủ.

## 5. Kết quả kiểm chứng

| Cổng | Kết quả |
| --- | --- |
| `npm run check` | 0 lỗi |
| `npm run build` | 0 lỗi |
| `node tests/run-unit.js` | **71/71** (thêm `connection-templates`, `connection-progress`, `connection-parity`) |
| `connection-parity` | **16.275** bước trả lời khớp giữa bản shared và bản renderer |
| `npm run check:renderer-globals` | 0 undefined (802 hàm, 6.637 call site) |
| `npm run verify:css` | **32/32** |
| `node tests/ui/ui-connection-mode-check.js` | **37/37** trên app thật (CDP) |
| `node tests/ui/ui-matching-finish-check.js` | **22/22** (ba kiểu ghép cũ không đổi) |
| `node tests/ui/ui-play-mode-card-check.js` | tất cả xanh |
| `node tests/ui/ui-presentation-check.js` | **60/60** |
| `node tests/ui/ui-three-game-check-4games.js` | **41/41** |
| `node tests/ui/ui-three-game-reactions-check.js` | **11/11** |
