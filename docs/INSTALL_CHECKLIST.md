# P7 — Checklist cài trên máy Windows sạch

Mục tiêu: chứng minh một giáo viên **chưa từng cài EduGame Studio** cài được và chơi được
**không cần mạng** — và ghi lại đúng những gì đã thấy, để phần còn treo của P7 khép lại.

Mọi phép đo tự động đã xanh trên bản trinh nguyên giả lập (DECISIONS #327: 16 cổng, dữ liệu
rỗng + profile WebView2 rỗng). Checklist này chỉ đo phần mà **máy ảo không đo được**: bộ cài,
SmartScreen, shortcut, và hành vi sau khi gỡ.

> **Bản cài đang dùng để thử:** `EduGame Studio (Tauri)_0.5.5_x64-setup.exe`
> · 16 352 902 byte (15,60 MiB) · 2026-11-25 08:01
> · SHA-256 `f83d815f068f63de506a04d286584cffaec2d5200e1172a7ae94f84174e94534`
>
> Kiểm mã băm trước khi cài (PowerShell):
> `Get-FileHash '.\EduGame Studio (Tauri)_0.5.5_x64-setup.exe' -Algorithm SHA256`
>
> Bản **v0.5.5** phát hành ngày 25/11: `16 367 996 B` · SHA-256 bắt đầu bằng `45fd0f2ffb446e16`
> — **bản này trỏ `127.0.0.1` nên KHÔNG có Cloud AI; đừng đưa cho giáo viên.**
>
> Bản **v0.5.5 + Cloud AI thật** (dựng 26/11, trỏ `https://ai-gateway.dovanan-bth2017.workers.dev`):
> `16 369 669 B` · SHA-256 `82f4c652cb47023abb46386b2ca3998b8e0d7a5b9d9961c0ee921a6a905c4e76`
>
> Bản **#362** (26/11, hạn mức free **10 lượt / kỳ 2 tuần**, chip tài khoản cố định ở sidebar,
> panel Tài khoản mới): `16 381 012 B` · SHA-256 `870e1f5a71903da04aafef5b…`
> — bản mới nhất đã đo trên máy này; **vẫn chưa phát hành trên GitHub**.
> Kiểm bằng `npm run check:pilot` (đòi https + gateway tự khai đúng tên/bản + URL có trong byte của `.exe`).
> Nếu mã khác ⇒ tệp hỏng hoặc không phải bản đã kiểm — **dừng lại**, đừng cài.

## Điều đã biết trước (đừng ngạc nhiên)

- **Bộ cài KHÔNG có chữ ký số.** `Get-AuthenticodeSignature` trên cả bộ cài và `edugame-studio-tauri.exe`
  trả `NotSigned` (DECISIONS #324). Vì vậy SmartScreen **sẽ** cảnh báo trên máy lạ. Đây không
  phải lỗi cài đặt, và cách duy nhất để hết là mua chứng chỉ ký mã — một quyết định về sau.
- **Cài theo từng người dùng** (`installMode: currentUser`) ⇒ **không cần quyền quản trị**, không
  hỏi UAC. Thư mục cài mặc định nằm dưới `%LOCALAPPDATA%`; **ghi lại đường dẫn thật** ở bước 2.3.
- **Dữ liệu giáo viên** nằm ở `%APPDATA%\vn.edugame.studio.tauri\edugame-data`
  (SQLite `edugame.sqlite` + ảnh/asset). Đây là thứ phải còn nguyên sau khi gỡ cài.

## Bước 1 — Tải và mở bộ cài

1.1 Chép tệp `.exe` sang máy sạch (USB hoặc mạng nội bộ), **không** chạy trực tiếp từ USB nếu
    muốn giống giáo viên thật (giáo viên tải qua trình duyệt ⇒ tệp có Mark-of-the-Web).

1.2 Bấm đúp. **Ghi lại chính xác** hộp thoại hiện ra:
    - Có “Windows protected your PC” không? Có chữ **More info → Run anyway** không?
    - Tên nhà phát hành hiện là gì (thường là “Unknown publisher”)?

1.3 Nếu SmartScreen chặn: **More info → Run anyway**. Nếu trình duyệt chặn: chuột phải tệp →
    Properties → **Unblock** → OK → chạy lại. Ghi lại đã phải làm bước nào.

## Bước 2 — Cài

2.1 Chọn thư mục cài — để mặc định, trừ khi muốn thử `D:\`.

2.2 Bấm **Install** và **bấm đồng hồ**: mất bao nhiêu giây từ lúc bấm đến khi xong?

2.3 **Ghi lại đường dẫn cài** (cửa sổ cuối của bộ cài có link mở thư mục, hoặc xem shortcut →
    chuột phải → Properties → Target).

2.4 Kiểm **shortcut**: có biểu tượng ở Desktop / Start Menu không? Bấm thử **một lần** — app mở không?

## Bước 3 — Lần chạy đầu tiên

3.1 App mở lên có hiện **màn hướng dẫn thiết lập** (chọn tên, lớp, môn…) không?

3.2 Đóng màn đó đi tới Thư viện. Bạn thấy **mấy trò chơi mẫu**? (Bản sạch có 2.)

3.3 Mở một trò mẫu → bấm **Chơi ngay** → trả lời một câu. Điểm trên thanh sân khấu có
    **đếm lên** không (khoảng 0,4 giây), hay nhảy thẳng?

3.4 Vào **Thư viện ⇄ Dự án của tôi** vài lần: 9 thẻ có hiện **lần lượt** không?

## Bước 4 — Chơi OFFLINE (phần quan trọng nhất của P7)

4.1 **Rút mạng thật**: tắt Wi-Fi (hoặc rút dây). Xác nhận bằng cách mở trình duyệt thử một trang —
    phải **không** vào được.

4.2 Trong app: mở một trò đã lưu → **Chơi ngay** → trả lời hết → xem màn kết quả.
    Kỳ vọng: chơi trọn vẹn, **không** có thông báo mạng, không màn hình trắng.

4.3 Đóng app, mở lại **khi vẫn mất mạng**. Thư viện có hiện đủ trò không? Bài vừa chơi còn không?

4.4 Thử **Trình chiếu** (nút lớn) khi mất mạng. Kỳ vọng: vào toàn màn hình bình thường.

> Nếu bước 4 hỏng: đó là lỗi P0 — ghi lại thời điểm, màn hình đang ở đâu, và có thông báo gì.
> (Đo tự động đã chứng minh app **không gọi mạng** khi chơi — DECISIONS #324 — nên nếu hỏng,
> nguyên nhân nhiều khả năng là thứ khác, ví dụ WebView2 runtime.)

## Bước 5 — Gỡ cài và dữ liệu

5.1 Settings → Apps → **EduGame Studio (Tauri)** → Uninstall. Ghi lại: có hỏi xác nhận không,
    có đòi quyền quản trị không, mất bao lâu.

5.2 Kiểm thư mục dữ liệu **vẫn còn**: `%APPDATA%\vn.edugame.studio.tauri\edugame-data`
    (mở bằng `Win+R` → dán đường dẫn). Kỳ vọng: còn nguyên — gỡ app không được xoá bài của giáo viên.

5.3 Kiểm đã xoá sạch: thư mục cài không còn `edugame-studio-tauri.exe`; không còn shortcut.

5.4 (Tuỳ chọn) Cài lại và mở Thư viện: các trò cũ có hiện lại không? Kỳ vọng: có.

## Phần đã đo tự động trên máy này — 2026-11-24, bản v0.5.4

Những dòng dưới đây **không** cần máy sạch nữa: chúng đã chạy thật trên bộ cài v0.5.4, và
chép lại đúng kết quả đo để người đọc checklist biết phần nào còn phải làm.

| Mục | Cách đo | Kết quả |
| --- | --- | --- |
| 2.1 Cài im lặng | `setup.exe /S /D=D:\Temp\eg-install-check` (`installMode: currentUser`, không UAC) | mã thoát **0** |
| 2.2 Kích thước sau cài | đếm thư mục cài | **58 MB**, có `edugame-studio-tauri.exe` + `uninstall.exe` |
| 2.3 Đăng ký gỡ cài | `HKCU\...\Uninstall\*` | `EduGame Studio (Tauri)` · `DisplayVersion 0.5.5` · `InstallLocation` đúng thư mục |
| 2.4 Shortcut | `%APPDATA%\Microsoft\Windows\Start Menu\Programs` | có **một** tệp `.lnk` tên “EduGame Studio (Tauri)” |
| 3.1 Màn thiết lập | chạy bản **đã cài** với dữ liệu rỗng | **có** (`data-setup-fullscreen="1"`) |
| 3.2 Số trò mẫu | cùng lần chạy đó | **1** (`sample-traffic-001`) — đúng thiết kế, không phải thiếu |
| 3.5 Cloud AI đã cấu hình | chạy bản đã cài với **mọi** biến `SUPABASE*`/`GEMINI*` đã xoá | `authStatus.configured = true` |
| 4.1 Chưa đăng nhập vẫn dùng được | cùng lần chạy đó | chip `guest`, thư viện vẫn vẽ |
| 5.1 Gỡ im lặng | `uninstall.exe /S` | mã thoát **0** |
| 5.2 Dữ liệu còn sau gỡ | kiểm `%APPDATA%\vn.edugame.studio.tauri\edugame-data` | còn nguyên (`edugame.sqlite`, `auth-session.json`) |
| 5.3 Gỡ sạch | kiểm thư mục cài, shortcut, registry | **không còn** thư mục, **không còn** shortcut, **không còn** mục đăng ký |

**Vẫn cần một người ngồi trước máy sạch** (không đo được bằng script):

| Mục | Vì sao |
| --- | --- |
| 1.2 SmartScreen | hộp thoại “Unknown publisher” chỉ hiện với người dùng thật trên tệp chưa từng có trên máy; script không chụp được nó một cách trung thực |
| 2.2 Thời gian cài | đo bằng đồng hồ của người cài, trong điều kiện mạng thật |
| 3.3 Điểm đếm lên / 3.4 Thẻ so le | hiệu ứng phải **nhìn** — xem ghi chú “vision-model ≠ người duyệt” |
| 4.2–4.4 Chơi offline, mở lại, trình chiếu | cần một người chơi thật một lượt trên máy chưa từng có dữ liệu |
| WebView2 chưa cài | máy này đã có WebView2 runtime; máy sạch có thể chưa có (bộ cài không kèm runtime) |

Ghi chú kỹ thuật: `edugame-studio-tauri.exe` **trong bộ cài** khác mã băm với tệp trong
`src-tauri/target/release/` vì Tauri vá thêm thông tin loại gói (nsis) vào exe. Đó là bình
thường; đừng dùng phép so mã băm đó để kết luận bộ cài hỏng.

## Mẫu báo cáo

| Mục | Kỳ vọng | Thực tế |
| --- | --- | --- |
| 1.2 SmartScreen | có cảnh báo “Unknown publisher” | |
| 2.2 Thời gian cài | < 60 s | |
| 2.3 Đường dẫn cài | `%LOCALAPPDATA%\…` | |
| 2.4 Shortcut | có, bấm mở được | |
| 3.1 Màn thiết lập | có | |
| 3.2 Số trò mẫu | 1 (`sample-traffic-001`) | |
| 3.3 Điểm đếm lên | có | |
| 3.4 Thẻ so le | có | |
| 4.2 Chơi offline | trọn vẹn | |
| 4.3 Mở lại offline | thư viện đủ | |
| 4.4 Trình chiếu offline | bình thường | |
| 5.2 Dữ liệu còn sau gỡ | có | |
| 5.3 Gỡ sạch | có | |

Ghi chú thêm (ảnh chụp màn hình càng tốt): màn hình nào, kích thước nào, Windows bản nào
(`winver`), có WebView2 runtime sẵn không.

## Sau khi có kết quả

- Cả 13 dòng đúng kỳ vọng ⇒ P7 khép lại; cập nhật `docs/ROADMAP.md` và `docs/STATUS.md`.
- Dòng nào lệch ⇒ mở một mục riêng cho đúng dòng đó, kèm ảnh chụp và Windows bản nào; **đừng**
  sửa nhiều thứ cùng lúc.
