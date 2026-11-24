# P7 — Checklist cài trên máy Windows sạch

Mục tiêu: chứng minh một giáo viên **chưa từng cài EduGame Studio** cài được và chơi được
**không cần mạng** — và ghi lại đúng những gì đã thấy, để phần còn treo của P7 khép lại.

Mọi phép đo tự động đã xanh trên bản trinh nguyên giả lập (DECISIONS #327: 16 cổng, dữ liệu
rỗng + profile WebView2 rỗng). Checklist này chỉ đo phần mà **máy ảo không đo được**: bộ cài,
SmartScreen, shortcut, và hành vi sau khi gỡ.

> **Bản cài đang dùng để thử:** `EduGame Studio (Tauri)_0.5.2_x64-setup.exe`
> · 16 538 871 byte · 2026-11-24 11:52
> · SHA-256 `d39200114ed4b9f743332d439ff913b71ff5c08f79a7db90bed61a4db70c8a8f`
>
> Kiểm mã băm trước khi cài (PowerShell):
> `Get-FileHash '.\EduGame Studio (Tauri)_0.5.2_x64-setup.exe' -Algorithm SHA256`
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

## Mẫu báo cáo

| Mục | Kỳ vọng | Thực tế |
| --- | --- | --- |
| 1.2 SmartScreen | có cảnh báo “Unknown publisher” | |
| 2.2 Thời gian cài | < 60 s | |
| 2.3 Đường dẫn cài | `%LOCALAPPDATA%\…` | |
| 2.4 Shortcut | có, bấm mở được | |
| 3.1 Màn thiết lập | có | |
| 3.2 Số trò mẫu | 2 | |
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
