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

## O6 — Trước/sau cho toàn quy trình (2026-10-20)

Máy đo: **Intel Core i5-10210U** (4 nhân / 8 luồng, dòng U), **16 GB RAM**, GPU tích hợp, Windows — đúng lớp máy mục tiêu. Runtime **llama.cpp b11681**, model chat **Qwen3.5-2B Q4_0** (`qwen3.5-2b`), chạy `llama-server --ctx-size 8192 --threads 4 --n-gpu-layers 0` (không `--jinja`). Bài đo gọi thẳng HTTP tới server thay vì qua cửa sổ app (máy này tự đóng app sau 1–2 phút, xem §6.7), nhưng **dùng đúng prompt, schema và validator của app** (`dist/`), nên số đo phản ánh công việc model thật sự phải làm. Chạy lại: lệnh ở §6.8.

### 6.1 `enable_thinking`: đo rồi loại bỏ

| Lượt | max_tokens | finish | Ký tự suy luận | Ký tự nội dung | Thời gian |
| --- | ---: | --- | ---: | ---: | ---: |
| Không đặt cờ | 160 | length | 524 | 0 | 12 s |
| `enable_thinking: false` | 160 | stop | 0 | 391 | 9,6 s |
| `enable_thinking: true` | 320 | length | 1.188 | 0 | 26,7 s |
| `enable_thinking: true` + `json_schema` | 300 | length | 1.162 | 0 | 31 s |
| `enable_thinking: true` + `json_schema` | 900 | length | 3.176 | 0 | 74 s |
| `enable_thinking: true`, không schema | 1.024 | length | 3.316 | 0 | 104 s |
| `enable_thinking: true`, không schema | 2.048 | length | 5.791 | 0 | 201 s |

- Cờ **được tôn trọng** ngay cả khi không bật `--jinja`: `false` cho 0 ký tự suy luận và JSON bình thường.
- Nhưng `true` **không bao giờ kết thúc** trong ngân sách dùng được: kể cả 2.048 token và một prompt trả lời ngắn không có grammar, model chỉ sinh `reasoning_content`, không có `content`.
- Kết luận: **Deep không bật thinking** (xem `DECISIONS #26`). Nhãn UI đổi thành "Kỹ (nhiều ngữ cảnh hơn)" cho đúng việc nó làm.

### 6.2 Phân tích giáo án: prompt cũ gây cắt, prompt mới vừa ngân sách

Giáo án Sinh 7 `sinh7-quang-hop` (2.400 ký tự, prompt 1.057–1.114 token):

| Biến thể | maxTokens | Lượt gọi | completion | Thời gian | Kết quả |
| --- | ---: | ---: | ---: | ---: | --- |
| 10 mục tiêu / 12 khái niệm, 1.024 | 1.024 | 2 | 2.048 | 233 s | `AI_TRUNCATED` cả 2 lượt, **hỏng** |
| 10 mục tiêu / 12 khái niệm, 2.048 | 2.048 | 1 | 2.041 | 189 s | OK |
| **6 mục tiêu / 8 khái niệm, câu ngắn**, 1.536 | 1.536 | 1 | 846–979 | 93–106 s | OK |

6 giáo án tổng hợp (1.300–1.800 ký tự) với prompt mới:

| Giáo án | Lượt | ms | prompt tok | completion tok |
| --- | ---: | ---: | ---: | ---: |
| Sinh 7 — Quang hợp | 1 | 92.936 | 1.114 | 979 |
| Toán 2 — Cộng có nhớ | 1 | 105.967 | 989 | 838 |
| GDCD 6 — An toàn giao thông | 1 | 90.867 | 1.020 | 741 |
| KHTN 6 — Vòng tuần hoàn nước (đo ở trần 1.024) | 2 | 260.016 | 2.033 | 1.719 |
| Anh 6 — Hiện tại đơn | 1 | 46.271 | 954 | 301 |
| Sử 8 — Bạch Đằng | 1 | 120.717 | 1.004 | 670 |

- Trần 1.024 vẫn cắt KHTN (1.773 ký tự): lượt đầu bị cắt, lượt sửa ngắn mới xong → 2 lượt, 260 s. Vì vậy trần hiện tại là **2.048 (fast) / 2.560 (deep)**; trần không phải mục tiêu, model tự dừng khi JSON xong, nên trần cao không tốn gì khi không dùng.
- `LESSON_PROMPT_VERSIONS.analysis = 2` để không tái dùng analysis cache của prompt cũ.
- Lượt sửa sau khi bị cắt giờ có chỉ dẫn "viết ngắn hơn"; không có nó, lượt sửa lặp lại đúng chỗ bị cắt.

### 6.3 Sinh nội dung — fast (8 câu arena, prompt thật)

| Giáo án | Lượt | ms | prompt tok | completion tok | Mục hợp lệ | Bám từ vựng giáo án | Lỗi chất lượng |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Sinh 7 (lượt đầu, prompt cache nguội) | 1 | 175.453 | 1.488 | 1.186 | 8/8 | 8/8 | 0 lỗi, 0 cảnh báo |
| Sinh 7 (lượt lặp, cache ấm) | 1 | 102.335 | 1.488 | 1.124 | 8/8 | 8/8 | 0 lỗi, 2 cảnh báo |
| Toán 2 | 1 | 146.458 | 1.317 | 1.192 | 8/8 | 8/8 | 0 lỗi, 3 cảnh báo |
| GDCD 6 | 1 | 187.575 | 1.296 | 1.339 | 8/8 | 8/8 | 0 lỗi, 1 cảnh báo |
| KHTN 6 | 1 | 150.049 | 1.192 | 1.314 | 8/8 | 8/8 | 0 lỗi, 1 cảnh báo |
| Anh 6 | 1 | 189.640 | 1.107 | 1.354 | 8/8 | 8/8 | 0 lỗi, 1 cảnh báo |
| Sử 8 | 1 | 161.717 | 1.305 | 1.348 | 8/8 | 8/8 | 0 lỗi, 1 cảnh báo |

- **6/6 giáo án: 1 lượt, 8/8 mục, 0 lỗi chất lượng, không lượt nào bị cắt** ở trần 2.048. So với trước O6, một bộ 4 câu đã từng bị `AI_TRUNCATED` ở 2.048.
- Cảnh báo còn lại là `ONLY_TWO_OPTIONS` trên câu **đúng/sai** — bộ kiểm tra đã được sửa để miễn cảnh báo này cho câu đúng/sai **sau** lần đo, nên số cảnh báo thực tế sẽ thấp hơn bảng (chưa đo lại). `NEAR_DUPLICATE_PROMPT` xuất hiện 1 lần (Toán 2).
- "Bám từ vựng" là proxy lexical (câu hỏi dùng ít nhất một từ trong đoạn giáo án được gửi); **không phải** đánh giá sư phạm. Chất lượng sư phạm vẫn cần giáo viên duyệt.
- Thời gian sinh 102–190 s cho 8 câu; phương sai chủ yếu do độ dài đầu ra và tải nền của máy, không do prompt.

### 6.4 Sinh nội dung — Deep (8 đoạn / 6.000 ký tự, trần 4.096)

| Giáo án | Lượt | ms | prompt tok | completion tok | Mục hợp lệ | Bám từ vựng giáo án |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sinh 7 | 1 | 140.274 | 1.446 | 1.146 | 8/8 | 8/8 |
| Toán 2 | 1 | 138.781 | 1.306 | 1.403 | 8/8 | 8/8 |

Phân tích ở chế độ Deep: 100,6 s / 671 token (Sinh 7), 101,4 s / 828 token (Toán 2) — cùng prompt phân tích, chỉ khác trần 2.560. RAM đỉnh server: **3.239 MB**.

Kết luận đo được: trên hai giáo án ngắn (~1.400–2.400 ký tự), Deep **không chậm hơn** fast (139–140 s so với 102–175 s) vì ngân sách 6.000 ký tự không bị dùng hết và trần 4.096 không bị chạm. Lợi ích của Deep chỉ có thể đến từ **giáo án dài**, mà hiện **chưa đo** — nên Deep là lựa chọn cho giáo án dài, không phải "chất lượng cao hơn đã chứng minh".

### 6.5 Batch sinh nội dung (§5.4)

`tests/bench-ai.js --phase batch` so sánh **một lượt 8 câu** với **8 lượt, mỗi lượt 1 câu** (đúng cơ chế "Tạo lại từng mục" của O5) trên cùng giáo án Sinh 7, cùng ngữ cảnh:

| Cách | Lượt gọi | Tổng ms | prompt tok | completion tok | Mục hợp lệ |
| --- | ---: | ---: | ---: | ---: | ---: |
| **1 lượt, 8 câu** | 1 | **141.289** | **1.488** | 1.124 | 8/8 |
| 8 lượt, mỗi lượt 1 câu | 8 | 456.299 | 13.897 | 1.101 | 8/8 |

- Một lượt 8 câu: **141 s, 1.488 prompt token**, không bị cắt ở trần 2.048.
- Tám lượt một câu: **456 s (3,2× thời gian), 13.897 prompt token (9,3×)** cho cùng 8 câu. Mỗi lượt 46–67 s; prompt bị lặp lại đầy đủ 8 lần.
- Kết luận: với 8 câu, **một lượt rõ ràng tốt hơn** cả về thời gian lẫn token; "tạo lại từng mục" chỉ dùng để **sửa mục hỏng**, không dùng để sinh cả trò. Batching (chia 8 câu thành 2 lượt 4) chưa đo và **không ship** — không có bằng chứng nào cho thấy nó nhanh hơn, còn rủi ro trùng câu giữa các lô là có thật.
- RAM đỉnh khi chạy batch: **4.022 MB** (cao hơn các lượt đơn vì 8 prompt dài liên tiếp trong cùng process).

### 6.6 Số lượt Qwen cho mỗi luồng

| Luồng | Trước O1–O6 | Sau |
| --- | ---: | ---: |
| Giáo án mới → trò đầu tiên | 3 (phân tích + gợi ý thể loại + sinh) | **2** |
| Trò thứ hai cùng giáo án, cùng cấu hình | 3 | **0** (analysis + generation cache) |
| Trò thứ hai cùng giáo án, khác thể loại/cấu hình | 3 | **1** (analysis cache, sinh lại) |
| Sửa một mục chưa đạt | 1 (sinh lại cả trò) | **1** (chỉ mục đó) |
| Chọn thể loại / đổi cấu hình | 1 | **0** (luật TypeScript) |

Ngoài ra, trước O6 một lượt phân tích ở trần 1.024 có thể cần 2 lượt mà vẫn hỏng; nay 1 lượt (trừ giáo án vượt trần, khi đó lượt sửa ngắn có chỉ dẫn rõ ràng).

### 6.7 RAM và tốc độ trên máy mục tiêu

- Chat server Qwen3.5-2B Q4_0, ctx 8.192: **2,1–3,2 GB** cho một lượt; **4.022 MB** khi chạy liên tiếp 8 prompt dài (batch per-item). Không dùng VRAM (GPU tích hợp, `--n-gpu-layers 0`).
- Sinh: **6,5–11,4 token/s** tuỳ tải nền; xử lý prompt **18–21 token/s** cho đoạn chưa có trong cache.
- Embedding server MiniLM (O4): **+216 MB**, ~28 ms cho mỗi lần sinh (đã đo ở §O4).
- Toàn bộ chạy trên CPU; không cần GPU rời, không cần mạng.

### 6.8 E2E trong app và các mục chưa đo

- **Đã chạy e2e thật trong cửa sổ app (2026-10-20)**: `tests/real-ai-e2e.js` **19/19** trên i5-10210U / 16 GB, model `qwen3.5-2b-q4_0`, runtime READY sau **14 s**. Bài ngắn 520 ký tự: phân tích thật **63 s** (3 mục tiêu, 3 khái niệm), sinh **4 câu arena trong 75 s**, 0 lỗi chất lượng, lưu game và mở màn chơi được. Trong cùng lượt chạy: huỷ giữa phân tích trả `AI_CANCELLED` và runtime vẫn READY; lượt phân tích thứ hai bị `AiSingleFlight` chặn; progress đi tới `ready`; cache không được dùng (`regenerate: true`). Đây chỉ là một bài ngắn, không phải tuyên bố tham số “tối ưu”. Các số benchmark ở trên vẫn là đo qua HTTP với prompt/schema của app; luồng IPC → store → adapter → player giờ đã được xác minh thêm bằng bài thật này.
- **Deep**: đã đo 2 giáo án ngắn (§6.4) — không chậm hơn fast nhưng cũng chưa chứng minh tốt hơn; chưa đo trên giáo án dài (>12.000 ký tự), nơi ngân sách 8 đoạn/6.000 ký tự mới thực sự khác fast.
- **Trò 30 câu / giáo án > 12.000 ký tự**: chưa đo. Một lượt 8 câu vừa 2.048 token; 30 câu nhiều khả năng vượt trần, nên giới hạn số câu hoặc batching vẫn là câu hỏi mở cho O7+.
- **Sự cố runtime**: trong một lần chạy có **hai** llama-server cùng cổng 9342 (một do app Electron còn sót lại từ smoke tự khởi động lại); server thoát không log. Sau khi chỉ còn một server, cùng giáo án KHTN chạy lại bình thường. Chưa tái hiện độc lập, nhưng đây là lý do app phải coi "AI local đã dừng" là lỗi có thể xảy ra và cho phép thử lại (O7).
- Chưa đo chất lượng sư phạm; "bám từ vựng" chỉ là proxy.

### 6.9 Cách chạy lại

```powershell
# 1. Chat server (dùng đúng runtime/model trong %APPDATA%\edugame-studio\edugame-data\ai-local)
llama-server.exe --model <qwen3.5-2b-q4_0.gguf> --alias qwen3.5-2b `
  --host 127.0.0.1 --port 9342 --ctx-size 8192 --threads 4 --n-gpu-layers 0

# 2. Phân tích + sinh fast cho cả 6 giáo án (cache analysis dùng lại giữa các lần)
node tests/bench-ai.js --url http://127.0.0.1:9342 --phase analyze,generate --modes fast `
  --analysis-cache "$env:TEMP\bench-analyses.json" --out "$env:TEMP\bench-fast.json"

# 3. Batch: 1 lượt 8 câu so với 8 lượt 1 câu
node tests/bench-ai.js --url http://127.0.0.1:9342 --phase batch --limit 1 `
  --analysis-cache "$env:TEMP\bench-analyses.json" --out "$env:TEMP\bench-batch.json"

# 4. Deep trên 2 giáo án
node tests/bench-ai.js --url http://127.0.0.1:9342 --phase analyze,generate --modes deep `
  --limit 2 --analysis-cache "$env:TEMP\bench-analyses.json" --out "$env:TEMP\bench-deep.json"

# 5. Thăm dò thinking (không dùng trong sản phẩm)
node tests/bench-ai.js --url http://127.0.0.1:9342 --phase thinking --limit 1
```

`--analyze-tokens`, `--generate-tokens`, `--questions`, `--from`, `--limit`, `--force-analyze` cho phép tái lập từng biến thể. Báo cáo in bảng markdown + JSON, kèm RAM đỉnh của server.
