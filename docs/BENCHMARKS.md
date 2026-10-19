# Benchmarks — AI local (O4/O6)

Số liệu dưới đây đo trên **máy phát triển thật** (Windows, 15.8 GB RAM, CPU 4 luồng dùng cho llama.cpp, không GPU rời), không phải ước lượng. Mỗi bảng ghi rõ lệnh chạy để lặp lại. Chỉ những gì đã đo mới được ghi ở đây; tham số chưa đo thì ghi "chưa đo".

Cách chạy lại benchmark truy xuất:

```powershell
# 1. Bật llama-server riêng cho embedding (cùng binary llama.cpp đã cài)
llama-server.exe --model <minilm.gguf> --alias minilm --host 127.0.0.1 --port 9341 `
  --ctx-size 512 --threads 4 --n-gpu-layers 0 --embedding --pooling mean --embd-normalize 2

# 2. Chấm điểm truy xuất (bộ 16 câu tiếng Việt, 5 giáo án tổng hợp)
node tests/bench-embedding.js --url http://127.0.0.1:9341 --budget 2
```

---

## O4 — Chất lượng truy xuất: `lexical-v1` so với `embeddings-v1` (2026-10-20)

**Model:** `minilm-multilingual-l12-v2-q8_0` (`paraphrase-multilingual-MiniLM-L12-v2`, GGUF Q8_0, 132,438,304 byte, SHA-256 `1bcc1fd3…54662`, Apache-2.0), chạy trong **process llama-server riêng** với `--embedding --pooling mean`. 384 chiều, vector đã chuẩn hoá L2 (norm = 1) nên cosine = tích vô hướng.

**Bộ thử:** 5 giáo án tổng hợp (Sinh học, GDCD, KHTN, Toán), chia đoạn 450/150 ký tự → 16 đoạn. 10 câu hỏi **dùng đúng từ ngữ của giáo án** và 6 câu **diễn đạt lại** (giáo viên/mục tiêu dùng từ khác). Mỗi câu có đúng một đoạn đích. Ngân sách chọn 2 đoạn (app dùng 6 đoạn; đo ở 2 để phép đo nói về **thứ hạng**, không phải về độ vừa prompt).

### Câu dùng đúng từ ngữ (10)

| Câu | lexical-v1 | embeddings-v1 |
| --- | --- | --- |
| Vai trò của ánh sáng trong quang hợp | 1 | 1 |
| Sản phẩm của quang hợp là gì | 1 | 2 |
| Hô hấp diễn ra ở đâu, có cần ánh sáng không | 1 | 1 |
| Bảo quản nông sản bằng kho lạnh | 1 | 1 |
| Học sinh đi xe đạp phải đội mũ bảo hiểm | 1 | 1 |
| Nguyên nhân gây tai nạn giao thông | 1 | 2 |
| Hơi nước ngưng tụ thành mây và mưa | 1 | 1 |
| Làm thế nào để tiết kiệm nước sạch | 1 | 1 |
| Cách rút gọn phân số | 1 | 1 |
| Quy đồng mẫu số để so sánh phân số | 1 | 1 |

- Đoạn đích nằm trong ngân sách: **lexical 10/10 · embeddings 10/10**.
- Đoạn đích đứng **hạng 1**: **lexical 10/10 · embeddings 8/10**.

### Câu diễn đạt lại (6)

| Câu | lexical-v1 | embeddings-v1 |
| --- | --- | --- |
| Lá cây hấp thụ năng lượng mặt trời để tạo ra chất dinh dưỡng | miss | 1 |
| Bộ phận nào giúp cây bắt được ánh nắng | miss | 1 |
| Tế bào lấy năng lượng từ thức ăn mà không cần ánh sáng | 1 | 1 |
| Ba bạn cùng đi hàng ngang trên đường rất nguy hiểm | 1 | 1 |
| Nước bốc lên trời rồi rơi xuống thành mưa | 1 | 1 |
| Chia cả trên và dưới cho cùng một số để được phân số đơn giản hơn | 2 | 1 |

- Đoạn đích nằm trong ngân sách: **lexical 4/6 · embeddings 6/6**.
- Đoạn đích đứng **hạng 1**: **lexical 3/6 · embeddings 6/6**.

**Kết luận đo được:** embeddings **thắng rõ khi giáo viên/mục tiêu dùng từ khác giáo án** (6/6 so với 3/6 hạng 1; 2 câu lexical bỏ hẳn đoạn đúng), và **kém hơn nhẹ khi câu hỏi trùng từ** (2/10 câu đoạn đích bị xếp hạng 2 thay vì 1). Vì app chọn 6 đoạn chứ không phải 1, hai trường hợp hạng 2 vẫn được gửi cho model — không mất nội dung. Tổng: hạng 1 **lexical 13/16 · embeddings 14/16**.

**Chưa đo / không được suy diễn:** bộ thử chỉ 16 câu tổng hợp, **không đủ để nói "tốt hơn trên giáo án thật"**. Chưa đo trên giáo án dài thật (hàng chục đoạn), chưa đo ảnh hưởng tới `AI_TRUNCATED`, chưa so với model embedding khác. Đây là lý do O4 ghi "retrieval quality measured on a synthetic Vietnamese set", không ghi "tối ưu".

### Độ trễ (cùng máy, batch 8)

| Việc | Số đo |
| --- | --- |
| Embed 16 đoạn (5 request batch 8) | **651 ms** → ~41 ms/đoạn (gồm cả lần gọi đầu làm nóng) |
| Embed 1 câu truy vấn | **~28 ms** (16 câu: 447 ms) |
| Khởi động server embedding (load model 132 MB) | ~2 s (đo qua `/health`) |

Vector được cache trong `lesson_chunks`, nên chi phí embed đoạn chỉ trả **một lần cho mỗi tài liệu + model**; mỗi lần generate chỉ thêm ~28 ms embed câu truy vấn.

### RAM (đo `PeakWorkingSet64`)

| Process | Đỉnh |
| --- | --- |
| llama-server embedding (MiniLM Q8_0, ctx 512) | **216 MB** |
| llama-server chat (Qwen3.5-2B Q4_0, ctx 8192, chỉ load) | **2 114 MB** |
| Tổng khi cả hai chạy | **~2,3 GB** / 15,8 GB |

Kết luận: thêm bộ đọc hiểu giáo án tốn **~216 MB**, nằm gọn trong ngân sách 16 GB; không cần GPU rời.

---

## O6 — Trước/sau cho toàn quy trình (chưa đo)

`tests/bench-ai.js` + bảng trước/sau (số lượt Qwen, thời gian tới preview, `AI_TRUNCATED`, chất lượng truy xuất trên 6–8 giáo án dài) sẽ được điền ở O6. Hiện chưa có số nào cho phần này.
