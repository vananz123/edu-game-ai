# PROMPT: THIẾT KẾ TÍCH HỢP LAN CHO EDUGAME STUDIO

## 1. Vai trò

Bạn là Senior Software Architect, chuyên về Electron, TypeScript, Express.js, Socket.IO và ứng dụng giáo dục offline.

Nhiệm vụ của bạn là khảo sát mã nguồn EduGame Studio hiện tại, sau đó thiết kế phương án tích hợp chơi LAN giữa máy tính giáo viên và điện thoại học sinh với mức thay đổi tối thiểu.

**Giai đoạn hiện tại chỉ được khảo sát, phân tích và lập kế hoạch. Không triển khai code, không sửa file, không cài package và không thay đổi cấu trúc dự án cho đến khi được phê duyệt.**

## 2. Bối cảnh dự án

EduGame Studio là ứng dụng desktop Windows được xây dựng bằng Electron + TypeScript.

Hệ thống hiện tại đã có:
- Hệ thống tạo và chơi game giáo dục trên máy tính, trình chiếu bằng máy chiếu.
- Năm loại trò chơi hiện có, mỗi game có thể có luật chơi, giao diện, cách tính điểm và cơ chế tổ chức khác nhau.
- Một số game chơi cá nhân, một số game chơi theo đội.
- Cơ chế thiết lập trò chơi, dữ liệu câu hỏi, nội dung do giáo viên tạo và các tài nguyên hình ảnh hiện có.
- Hệ thống AI local và xử lý tài liệu giáo án.

Không xây dựng lại các chức năng này. Không giả định cấu trúc file, database, tên game hoặc API trước khi khảo sát repository.

## 3. Mục tiêu

Bổ sung chế độ chơi LAN để học sinh sử dụng điện thoại truy cập trò chơi bằng trình duyệt, trong khi máy tính giáo viên tiếp tục điều khiển và hiển thị trò chơi trên máy chiếu.

Hệ thống hoạt động trong mạng LAN/Wi-Fi nội bộ, không phụ thuộc máy chủ cloud hoặc dịch vụ Internet bên ngoài.

Ưu tiên:
1. Giữ nguyên chế độ chơi truyền thống.
2. Tái sử dụng tối đa logic game, dữ liệu, luật chơi, đội và tính điểm hiện có.
3. Hạn chế thay đổi mã nguồn hiện tại.
4. Có kiến trúc dùng chung cho năm game nhưng vẫn cho phép từng game có cách tương tác riêng.
5. Không yêu cầu học sinh cài ứng dụng lên điện thoại.

## 4. Kiến trúc LAN đã chốt

### 4.1. Công nghệ định hướng

- Electron: ứng dụng desktop của giáo viên.
- TypeScript: ngôn ngữ chính.
- Express.js: phục vụ giao diện web dành cho điện thoại trong mạng LAN.
- Socket.IO: giao tiếp thời gian thực giữa máy giáo viên và điện thoại.
- QR code: tạo mã QR dẫn đến địa chỉ truy cập LAN kèm thông tin tham gia phòng.
- SQLite hoặc hệ thống lưu trữ hiện tại: chỉ bổ sung dữ liệu nếu thực sự cần thiết.

Trước khi đề xuất thêm dependency, phải kiểm tra package và công nghệ hiện có.

### 4.2. Luồng sử dụng

1. Giáo viên chọn một trong năm game hiện có.
2. Giáo viên thiết lập nội dung, luật chơi, đội và các tùy chọn như hiện tại.
3. Giáo viên chọn cách tổ chức:
   - Trình chiếu truyền thống.
   - Tương tác qua điện thoại (LAN).
4. Nếu chọn LAN, ứng dụng khởi động máy chủ nội bộ và tạo phòng.
5. Máy tính hiển thị mã QR, địa chỉ LAN và cổng truy cập, mã phòng, cùng danh sách học sinh đã tham gia.
6. Học sinh quét QR hoặc truy cập địa chỉ LAN trên trình duyệt điện thoại.
7. Học sinh nhập tên và tham gia phòng.
8. Hệ thống liên kết học sinh với đội đã thiết lập trong game nếu game chơi theo đội.
9. Giáo viên kiểm tra danh sách và bắt đầu trò chơi.
10. Máy chiếu hiển thị giao diện game hiện tại; điện thoại hiển thị giao diện tương tác phù hợp với từng game.
11. Trạng thái, câu trả lời và điểm số được đồng bộ.
12. Giáo viên kết thúc game và xem kết quả theo cơ chế hiện có.

### 4.3. QR và mã phòng

Hỗ trợ cả hai phương thức tham gia:

- QR là phương thức mặc định, ưu tiên sử dụng.
- Mã phòng dùng làm phương thức dự phòng.
- QR chứa địa chỉ truy cập LAN và mã phòng cần thiết.
- Mã phòng không thay thế địa chỉ IP/cổng của máy chủ.
- Phải kiểm tra địa chỉ IP, cổng đang sử dụng, lỗi khởi động máy chủ và khả năng truy cập từ điện thoại.
- Không sử dụng dịch vụ QR hoặc máy chủ bên ngoài.
- Không giả định mọi thiết bị đều cùng subnet hoặc router cho phép giao tiếp giữa các thiết bị; cần phát hiện hoặc hướng dẫn xử lý khi kết nối thất bại.

## 5. Quy tắc giao diện điện thoại

Cấu hình mặc định đã chốt:

- Chế độ hiển thị: tự động theo từng trò chơi.
- Hiển thị hình ảnh câu hỏi: bật.
- Hiển thị giải thích đáp án trên điện thoại: tắt.
- Máy chiếu: giữ nguyên giao diện hiện tại.
- Điện thoại: giao diện web riêng, tối ưu màn hình nhỏ.

Không sao chép toàn bộ giao diện desktop sang điện thoại. Chỉ xây dựng giao diện tương tác cần thiết.

### 5.1. Hồ sơ tương tác LAN của từng game

Trước tiên hãy xác định năm game thực tế trong repository.

Với mỗi game, phân tích:
- Kiểu tương tác: chọn đáp án, nhập dữ liệu, ghép cặp, thao tác nhiều bước hoặc loại khác.
- Dữ liệu nào cần hiển thị trên điện thoại.
- Có cần hiển thị ảnh, bảng hoặc dữ liệu minh họa không.
- Hành động nào điện thoại được phép gửi.
- Khi nào khóa thao tác.
- Cách đồng bộ trạng thái và kết quả lên máy chiếu.
- Game hỗ trợ chơi cá nhân, chơi theo đội hay cả hai.

Không tự động gán một game vào kiểu tương tác nếu chưa xác minh luật chơi thực tế.

Nếu game chưa có adapter hoặc hồ sơ tương tác LAN phù hợp, đánh dấu là chưa hỗ trợ LAN và giữ nguyên chế độ chơi truyền thống. Không tự động tạo luật chơi mới.

### 5.2. Quy tắc hiển thị

- Dùng chung dữ liệu câu hỏi hiện có.
- Hiển thị văn bản và các lựa chọn cần thiết.
- Hiển thị hình ảnh nếu nội dung có ảnh và game hỗ trợ.
- Nếu ảnh không tải được, vẫn cho phép trả lời khi ảnh không phải dữ liệu bắt buộc để hiểu câu hỏi.
- Nội dung dài phải có khả năng cuộn.
- Không gửi toàn bộ giáo án hoặc thư viện tài nguyên sang điện thoại.
- Không hiển thị giải thích đáp án trên điện thoại theo mặc định.
- Giữ nguyên hành vi công bố đáp án và giải thích trên máy chiếu nếu game hiện tại đã hỗ trợ.
- Không để điện thoại tự tính hoặc quyết định điểm số cuối cùng.

## 6. Quy tắc đội và người chơi

Cấu hình đội hiện tại phụ thuộc từng game:
- Có game cá nhân.
- Có game theo đội.
- Mong muốn là tái sử dụng đội đã thiết lập trong game.

Thiết kế theo nguyên tắc:

1. Không xây dựng hệ thống đội thứ hai nếu hệ thống hiện tại đã đáp ứng nhu cầu.
2. Không yêu cầu học sinh tự chọn đội trên điện thoại trong phiên bản đầu.
3. Nếu game đã có đội và danh sách thành viên, tái sử dụng dữ liệu đó.
4. Nếu game chỉ lưu tên đội mà chưa có thành viên, phải xác định một bước ghép người chơi LAN vào đội và đề xuất phương án ít thay đổi nhất.
5. Nếu chưa có cấu hình đội hợp lệ, thông báo cho giáo viên trước khi bắt đầu.
6. Game cá nhân không được yêu cầu thiết lập đội.
7. Khóa việc thay đổi đội khi game bắt đầu, trừ khi luật hiện tại có hỗ trợ rõ ràng.
8. Không tự động tạo đội mới hoặc tự thay đổi thành viên khi người chơi mất kết nối và kết nối lại.

Phải khảo sát chính xác dữ liệu đội và thành viên trong repository trước khi đề xuất cách ánh xạ.

## 7. Kiến trúc logic đề xuất để khảo sát

Xác minh xem có thể tích hợp các trách nhiệm sau vào kiến trúc hiện có hay không.

### A. LAN Session Manager
- Tạo và đóng phòng.
- Sinh mã phòng.
- Quản lý người tham gia và trạng thái kết nối.
- Xác thực việc tham gia.
- Đồng bộ trạng thái phiên chơi.
- Xử lý kết nối lại và kết thúc phiên.

### B. LAN Game Profile / Adapter
- Mô tả khả năng tương tác LAN của từng game.
- Chuyển hành động điện thoại thành hành động tương ứng trong game hiện tại.
- Dùng lại luật chơi và cơ chế tính điểm hiện có.
- Không nhân đôi toàn bộ logic game.

### C. Mobile Web UI
- Trang tham gia phòng.
- Nhập tên.
- Màn hình chờ.
- Giao diện câu hỏi/thao tác theo từng game.
- Trạng thái đã gửi câu trả lời.
- Trạng thái chờ câu tiếp theo và kết quả.

### D. LAN Transport
- Express phục vụ web UI.
- Socket.IO đồng bộ thời gian thực.
- Quản lý tiến trình máy chủ theo vòng đời ứng dụng Electron.
- Đóng máy chủ khi cần thiết và giải phóng cổng.
- Xử lý lỗi khởi động, cổng bị chiếm và kết nối bị gián đoạn.

Đây là các trách nhiệm logic cần đánh giá, không bắt buộc phải tạo đúng từng file hoặc class như tên trên. Hãy ưu tiên tận dụng module hiện có.

## 8. Bảo mật và độ tin cậy

Đề xuất phương án phù hợp cho mạng LAN lớp học:

- Chỉ mở máy chủ khi giáo viên chọn chế độ LAN.
- Giới hạn truy cập vào dịch vụ cần thiết.
- Không để điện thoại gửi điểm số hoặc tự xác định đáp án đúng.
- Xác thực trạng thái game, câu hỏi hiện tại và hành động hợp lệ phía máy chủ.
- Chống gửi trùng câu trả lời và thao tác ngoài lượt.
- Xử lý người chơi ngắt kết nối, kết nối lại và gửi dữ liệu trễ.
- Không làm lộ file nội bộ, đường dẫn hệ thống hoặc API quản trị Electron.
- Phân biệt rõ dữ liệu công khai cần gửi cho điện thoại và dữ liệu nội bộ.
- Xem xét cách truy cập hình ảnh an toàn qua web server nội bộ.
- Đề xuất hướng dẫn cấu hình Windows Firewall khi cần thiết.
- Không yêu cầu tài khoản cloud, API key hoặc kết nối Internet.

## 9. Yêu cầu khảo sát repository

Trước khi đề xuất triển khai, hãy xác định:

1. Cấu trúc thư mục và entry point của Electron main, preload và renderer.
2. Công nghệ frontend hiện tại và cách quản lý route/view.
3. Nơi lưu cấu hình game và nội dung câu hỏi.
4. Cách bắt đầu, chuyển câu hỏi, nhận đáp án, tính điểm và kết thúc game.
5. Cách quản lý đội và thành viên.
6. Cách hiển thị asset/hình ảnh hiện tại.
7. Hệ thống lưu trữ và dữ liệu cần duy trì.
8. Các package Express, Socket.IO hoặc QR đã có hay chưa.
9. Ranh giới IPC và quyền hạn giữa renderer, preload và main process.
10. Những module có thể tái sử dụng trực tiếp.

Khi nêu phát hiện, cung cấp đường dẫn file và tên hàm/class thực tế nếu tìm thấy. Phân biệt rõ:
- Đã xác minh từ mã nguồn.
- Suy luận cần kiểm chứng.
- Chưa tìm thấy.

Không bịa tên file, API, bảng database hoặc cấu trúc dữ liệu.

## 10. Kết quả cần trả về ở giai đoạn hiện tại

Chỉ trả về một tài liệu thiết kế gồm:

### Phần A — Đánh giá hiện trạng
- Kiến trúc liên quan đến game.
- Cách lưu đội, thành viên và điểm số.
- Cách hiển thị câu hỏi và hình ảnh.
- Những module có thể tái sử dụng.

### Phần B — Kiến trúc tích hợp LAN tối thiểu
- Sơ đồ luồng dữ liệu.
- Trách nhiệm từng thành phần.
- Cách quản lý tiến trình server.
- Cách tạo QR, mã phòng và địa chỉ truy cập.

### Phần C — Ma trận năm game
Với từng game thực tế:
- Tên chính xác.
- Kiểu chơi cá nhân/đội.
- Kiểu tương tác trên điện thoại.
- Dữ liệu cần đồng bộ.
- Khả năng tái sử dụng logic hiện tại.
- Các thay đổi tối thiểu cần thiết.
- Rủi ro hoặc phần chưa xác minh.

### Phần D — Phương án dữ liệu
- Dữ liệu hiện tại có thể dùng lại.
- Dữ liệu LAN mới thực sự cần thiết.
- Có cần migration database không.
- Cách ánh xạ người chơi vào đội hiện có.

### Phần E — Kế hoạch triển khai theo giai đoạn
- Thứ tự triển khai.
- Phạm vi từng giai đoạn.
- Tiêu chí nghiệm thu.
- Kịch bản kiểm thử máy tính và nhiều điện thoại.
- Rủi ro tương thích với chế độ chơi truyền thống.

### Phần F — Danh sách thay đổi dự kiến
Liệt kê file/module dự kiến cần thêm hoặc sửa, lý do và mức độ rủi ro. Chỉ đề xuất dựa trên repository đã khảo sát.

## 11. Các giới hạn bắt buộc

- Không triển khai code trong giai đoạn này.
- Không sửa file.
- Không cài package.
- Không thay đổi schema database.
- Không tái cấu trúc toàn bộ dự án.
- Không viết lại năm game.
- Không thay đổi pipeline AI local hoặc pipeline tạo nội dung.
- Không thay đổi giao diện trình chiếu hiện tại.
- Không giả định rằng các game có cùng cấu trúc.
- Không đưa ra ước tính hiệu năng thiếu cơ sở.

Sau khi hoàn thành tài liệu, hãy dừng lại và chờ phê duyệt trước khi thực hiện bất kỳ thay đổi nào.

**Mục tiêu cuối cùng:** thêm khả năng chơi LAN vào EduGame Studio bằng lớp tích hợp mỏng, giữ nguyên tối đa hệ thống game hiện tại, sử dụng QR/mã phòng để tham gia, giao diện điện thoại tự động theo từng game, hiển thị hình ảnh và tái sử dụng đội đã thiết lập.
