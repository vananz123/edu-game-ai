# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-24 — #323 Bảng xếp hạng đội hiện từ HẠNG CUỐI lên NHÀ VÔ ĐỊCH
- Mục **S3-3** (“màn kết quả hiện ra cùng lúc”) đúng **một nửa**: huy hiệu đã `result-medal-pop`, ba thẻ số đã so le `0 / .05 / .1 s` từ trước — **hai nửa đó đã có, không phải thiếu**. Thiếu đúng **hàng của bảng xếp hạng đội**: cả 3 hàng hiện cùng một nhịp, nên cả lớp thấy thứ hạng trước khi giáo viên kịp nói câu nào.
- **Sửa** `src/renderer/styles/components.css`: `@keyframes leaderboard-row-in` + `.leaderboard-row{animation:…both}`, delay theo **`:nth-last-child(2…6)`** ⇒ chạy **ngược từ hạng cuối lên nhất**, đúng cho 2–6 đội mà **không cần JS**; `both` giữ hàng **ẩn trong lúc chờ**; reduced-motion tắt hẳn.
- **Cổng mới `tests/ui/ui-result-cascade-check.js` (9/9)**, chạy 3 đội thật qua hộp chia đội: ghim luôn hai nửa ĐÃ CÓ (huy hiệu pop, ba thẻ số delay tăng dần) để tuyên bố của kế hoạch **mãi sai**; đo hàng mới: `leaderboard-row-in` trên cả 3 hàng, delay **`0.18 / 0.09 / 0`** (hàng đầu = hạng nhất ⇒ nhất đáp **sau cùng**), và **giữa lúc hiện hàng cuối sáng hơn hàng nhất** ở `t=114ms` — bằng chứng so le thật, không chỉ đọc delay đã khai.
- Trước khi sửa cổng **đỏ đúng 3 mục** (`none none none`, delay `0 0 0`, không mẫu nào lệch) — red-first, không phải cổng trang trí.
- Cổng trên binary mới: `ui-result-cascade-check` **9/9** · `ui-score-countup-check` **18/18** · `ui-answer-mode-check` **219/219** · `ui-memory-flip-check` **9/9** · `ui-matching-finish-check` **22/22** · `ui-play-surface-check` **812/812** · `ui-presentation-check` **93/93** · `ui-stage-illustration-check` **179/179** · unit **104/104** · `verify:css` **61/61**.
- Installer: **16 532 514 byte** / 24-11 **10:20** / SHA-256 `e0069f9fd565333cf8bda51e51fd15a0fee79ad49461875d084b1a12c80542ff`.

### 2026-11-24 — #322 Thẻ bộ nhớ LẬT THẬT (3D), và cổng đo bằng số hạng độ sâu
- Mục **S3-2** trong `docs/archive/specs/ui-improvement-plan.md`: `@keyframes memory-flip` chỉ có `rotateY(90deg) → 0` và **không có perspective**, nên trên phần tử phẳng phép quay bị chiếu bẹp — thẻ trông như **trượt ra từ cạnh** chứ không lật.
- **Sửa** `src/renderer/styles/game-animations.css`: `perspective(700px)` đặt **trong chính transform** (không cần perspective ở phần tử cha), `84deg` thay vì `90deg` (một khung hình ở đúng 90° là thẻ rộng bằng 0 — đọc ra như lỗi), overshoot `-7deg` ở 60% cho cú lật có trọng lượng, `0.3s → 0.42s`. `prefers-reduced-motion` vẫn tắt hoàn toàn.
- **Cổng mới `tests/ui/ui-memory-flip-check.js` (9/9)** — và nó tự bác phiên bản đầu của chính nó: bản đầu kiểm “có `matrix3d` không” và **pass 8/8 trên thẻ hỏng**, vì `rotateY()` một mình **đã** cho ra `matrix3d`. Thứ perspective thêm vào là **số hạng độ sâu `m34` (= −1/d)** trong ma trận; kiểm nó mới phân biệt được lật thật với bẹp phẳng. Trước khi sửa: **0 mẫu có m34** (đỏ đúng chỗ); sau khi sửa: **16 mẫu, m34 = 0.00074**.
- Đo trên binary mới: animation `memory-flip`, **18 giá trị transform khác nhau** (không nhảy cóc), thẻ **kết thúc phẳng** (`none`), vẫn giữ `.flipped` và mặt thẻ đọc được; reduced-motion: **không animation**, phẳng ngay khi bấm.
- **Cổng `ui-answer-mode-check` đỏ 218/219 vì #321, không phải vì #322:** nó chụp chữ trên chip đội ngay sau khi vẽ lại ⇒ đọc **89** trên đường tới **90**. Sửa cổng: `settleChips()` chờ số **ngừng đổi** (150 ms ổn định, trần 900 ms) trước khi chụp — **một cổng đọc số có animation phải chờ số dừng**, giống #320.
- Cổng trên binary mới: `ui-memory-flip-check` **9/9** · `ui-matching-finish-check` **22/22** · `ui-score-countup-check` **18/18** · `ui-answer-mode-check` **219/219** (chạy **2 lần liên tiếp**) · `ui-play-surface-check` **812/812** · `ui-stage-illustration-check` **179/179** · `ui-item-assets-editor-check` **157/157** · `ui-presentation-check` **93/93** · `ui-fullscreen-check` **20/20** · unit **104/104** · `verify:css` **61/61**.
- Installer: **16 533 945 byte** / 24-11 **09:43** / SHA-256 `5386a8d0e25e52d1a9b73b8835859676e91044ed772da78cdeaf679ef4c3230f`.

### 2026-11-24 — #321 Điểm của TỪNG ĐỘI cũng đếm lên (và không bao giờ hiện số âm)
- Tiếp #320 theo lựa chọn **(a)**: trong chế độ thi đấu đội, con số giáo viên thật sự nhìn là **hàng chip điểm của các đội** trên thanh sân khấu và **BẢNG XẾP HẠNG ĐỘI** ở màn kết quả — cả hai trước đây đổi số tức thì.
- **Sửa:** `teamTurnBarHtml()` và `leaderboardHtml()` gắn `data-team-score` + `data-team-key` + `data-team-target`; hàm mới `animateTeamScores(root, { reveal })` dùng lại `animateScoreChip` của #320. Thanh đội được vẽ lại **toàn bộ** mỗi câu nên “số cũ” **không đọc được từ DOM** — phải nhớ theo khoá (`chip-0..n`, `board-0..n`), và `teamPointsShown` được **xoá khi bắt đầu ván mới** (khoá theo vị trí, ván sau có thể khác đội).
- **Luật thứ ba, riêng cho đội:** lần vẽ ĐẦU TIÊN **không được leo**. Một đội đã có điểm khi thanh vừa hiện ra mà lại thấy số mình chạy lên thì đó là nói dối; màn kết quả là chỗ **duy nhất** cố ý đếm từ 0 (`reveal: true`) vì ở đó đó là màn “công bố”.
- **Cổng `ui-score-countup-check` mở rộng 8 → 18 mục, và bắt được một lỗi thật của #320:** mẫu đầu của bảng xếp hạng là **`-44`** — `requestAnimationFrame` trả *thời điểm khung hình*, có thể **sớm hơn** `performance.now()` lấy ngay trước vòng lặp, nên `t` âm ⇒ ease ra giá trị âm ⇒ bảng điểm hiện một con số game chưa từng có. Sửa: kẹp `t` cả hai đầu (`Math.min(1, Math.max(0, …))`). Thêm một mục kiểm **không mẫu nào ngoài khoảng 0..tổng**.
- **Số liệu đo được (binary mới):** chip đội `0 → 8 → 45 → 87 → 101 → 112 → 118 → 120`, đáp đúng **120** = số game ghi; bảng xếp hạng `0 → 56 → 77 → 94 → 103 → 113 → 118 → 120`, hai hàng đều đáp đúng tổng thật của đội mình, **không mẫu nào âm**; lần vẽ đầu của thanh đội là `0,0` và **không leo**.
- **Một bài học về kỳ vọng của cổng:** ván 2 câu, mỗi đội trả lời đúng một câu ⇒ **cả hai** đội cùng **120**; kỳ vọng phải đọc `state.teamPlay.teams` **sau câu cuối** rồi sắp giảm dần (bảng xếp hạng sắp theo điểm), không phải chụp trước câu cuối.
- Cổng trên binary mới: `ui-score-countup-check` **18/18** · `ui-answer-mode-check` **219/219** · `ui-stage-illustration-check` **179/179** · `ui-play-surface-check` **812/812** · `ui-fullscreen-check` **20/20** · `ui-presentation-check` **93/93** · `ui-item-assets-editor-check` **157/157** · `ui-editor-art-check` / `ui-question-template-check` / `ui-library-paging-check` / `ui-project-selection-check` pass · unit **104/104** · `check:renderer-globals` **1131 functions / 9193 call sites, 0 undefined**.
- Installer: **16 539 259 byte** / 24-11 **09:18** / SHA-256 `d3b66d12c9a222a01dadb097c3a24aa5dca5963e8d032dd84cc33ec8052eb42c`.
