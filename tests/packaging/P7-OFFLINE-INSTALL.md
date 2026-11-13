# P7 — máy sạch cài bộ cài THẬT, rồi chơi một trò đã lưu khi rút mạng

Trạng thái: **VẪN MỞ**. Bao đo này sinh ra để đóng nó bằng số liệu thật, không bằng suy
luận. Chủ dự án chốt (2026-11-06): "dựng gói đo + để ngỏ P7" — P7 chỉ được gạch khi bảng
kết quả dưới đây có số của một máy thật.

## Vì sao cổng trong repo không thay được

Cổng repo của vỏ Tauri (`tests/ui/tauri-webview-check.js`, chạy qua `npm run tauri:check`)
đo trên **binary release + profile tạm trong TEMP**: cài mới/cài đè/gỡ NSIS trong thư mục
tạm, và chơi offline một trò đã lưu với bộ đếm request
mạng. Nó chứng minh bộ cài thật spawn đúng, ứng dụng đúng quit, và không có kết nối ra
ngoài LAN trong lượt chơi. Nó KHÔNG chứng minh: bộ cài Tauri có chạy được trên một **máy
sạch chưa từng cài** không, SmartScreen có chặn không, antivirus có báo động không, và trò
chơi đã lưu có chơi được offline trên máy của giáo viên không. Bốn câu hỏi đó chỉ trả lời
được bằng cách ngồi trước một máy sạch. (Các cổng `packaged-install-check.js` /
`packaged-feed-check.js` cũ đo `electron-updater.quitAndInstall()` trên installer giả đã
được gỡ cùng Electron — xem `docs/archive/specs/electron-removal-plan.md`.)

## Chuẩn bị (một buổi, ~20 phút)

1. Một máy Windows 10/11 **chưa từng cài** EduGame Studio (máy của đồng nghiệp là đủ; không
   cần quyền admin — ứng dụng cài cho từng người dùng, `installMode: currentUser`).
2. Tải `EduGame-Studio-Tauri_0.5.1_x64-setup.exe` từ trang Releases về thư mục Downloads
   (đây là tên asset trên GitHub; bộ dựng cục bộ sinh tệp cùng byte với tên
   `EduGame Studio (Tauri)_0.5.1_x64-setup.exe`).
   Byte phải là **16.371.819** và SHA-256 phải là
   `205DCC14D668B36749DF16E298DE319F1929A9F4755C9A4012CB1AD439BF5D88`.
   Sai một trong hai ⇒ đang đo nhầm tệp, dừng lại.
3. Copy **hai tệp** này sang máy đó (không cần repo, không cần Node):
   `tests/packaging/p7-offline-install.ps1` và tài liệu này.
4. Ở lần chạy đầu (còn mạng), tạo và **lưu một trò chơi** có ảnh minh hoạ, rồi thoát app.

## Chạy

```powershell
# buoc 1 — chi do may, khong cai gi (2 giay)
powershell -ExecutionPolicy Bypass -File p7-offline-install.ps1

# buoc 2 — cai bo cai that; wizard hien ra, lam dung nhu giao vien lam
powershell -ExecutionPolicy Bypass -File p7-offline-install.ps1 `
  -Installer "$env:USERPROFILE\Downloads\EduGame-Studio-Tauri_0.5.1_x64-setup.exe"

# buoc 3 — RÚT MẠNG (rút LAN / tắt Wi-Fi), rồi mở app và chơi trò đã lưu trong 120 giay
powershell -ExecutionPolicy Bypass -File p7-offline-install.ps1 `
  -AppExe "$env:LOCALAPPDATA\Programs\EduGame Studio (Tauri)\edugame-studio-tauri.exe" -PlaySeconds 120
```

Đầu ra: `%TEMP%\eg-p7\p7-log.txt` (dòng có mốc giờ) và `p7-results.md` (bảng số). Dán các
dòng `M*` vào mục A dưới đây. Mục B là những thứ **chỉ mắt nhìn thấy**, script không đo.

## A. Số do máy đo (M1…M12)

| # | Đo | Số đo được |
|---|-----|-----------|
| M1 | Windows + build | ______________________ |
| M2 | Đĩa còn trống + RAM | ______________________ |
| M3 | Người dùng / PowerShell / elevated | ______________________ |
| M4 | Antivirus đang bật | ______________________ |
| M5 | Bộ cài: byte / SHA-256 / chữ ký | ______________________ |
| M6 | Zone.Identifier (dấu vết tải từ web) | ______________________ |
| M7 | Thời gian cài + số hộp UAC script trông thấy | ______________________ |
| M8 | Thư mục cài: số tệp / MB / ProductVersion | ______________________ |
| M9 | Thời gian từ lệnh mở tới cửa sổ đầu tiên | ______________________ |
| M10 | Kết nối TCP **ra ngoài LAN** trong lúc chơi | ______________________ (phải = 0) |
| M11 | Thời gian đóng app | ______________________ |
| M12 | Tổng thời gian + đường dẫn log | ______________________ |

## B. Câu trả lời bằng mắt (điền tay)

1. SmartScreen có hiện "Windows protected your PC" không? □ Không □ Có, vẫn chạy được □ Có, phải bấm Thêm thông tin
2. Wizard cài đặt có mấy màn hình? ____. Màn hình nào giáo viên hay bấm nhầm? ____________
3. Số hộp UAC **mà mắt thấy** (so với M7): ____. Nếu M7 = 0 mà mắt thấy ≥ 1 ⇒ script mù, ghi lại.
4. Sau khi cài, app có tự mở không? □ Có □ Không. Shortcut nằm ở đâu? □ Start menu □ Desktop □ Không có
5. Trò đã lưu mở được khi **rút mạng** không? □ Có □ Không. Trò nào: ____________
6. Ảnh minh hoạ có vẽ ra không? □ Đủ □ Vẽ một phần □ Không. Ảnh nào thiếu: ____________
7. Điểm số / kết quả cuối trò có đúng khi offline không? □ Đúng □ Sai: ____________
8. Có dòng chữ lỗi nào hiện trên màn hình không? Chụp lại và ghi nguyên văn: ____________
9. Mất bao lâu để giáo viên **tự làm xong** một trò chơi mà không cần hỏi ai? ____ phút

## Tiêu chí đóng P7

- M5 khớp đúng byte + SHA-256 của bản đã phát hành; M8 khớp `ProductVersion` 0.5.1.
- M10 = 0 kết nối ra ngoài LAN **và** B5 = Có **và** B6 = Đủ. Đây là trái của P7: trò chơi
  đã lưu phải chơi được khi không có mạng.
- B1 ≠ "phải bấm Thêm thông tin" — nếu SmartScreen chặn đường thì bản 0.5.1 chưa đủ điều
  kiện phát rộng (nợ chữ ký Authenticode, ghi riêng trong ROADMAP).
- Mọi ô trống còn lại ⇒ P7 chưa đóng.

## Ghi chú cho người chạy script

- Script chỉ ASCII vì PowerShell 5.1 đọc `.ps1` không BOM theo bảng mã ANSI; chuỗi có dấu sẽ
  thành chữ rác trong log.
- Script vẫn tự xoá `ELECTRON_RUN_AS_NODE` trước khi mở app cho chắc — biến đó là di sản
  Electron và không còn ảnh hưởng tới binary Tauri, nhưng trên máy dev nó thường = 1.
- Bước 3 **phải rút mạng thật**. Bộ đếm M10 chỉ chứng minh "không kết nối nào ra ngoài LAN";
  nó không chứng minh app *không biết* cách nối — nên mới cần B5/B6.
