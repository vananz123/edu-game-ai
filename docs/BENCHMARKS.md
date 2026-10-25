# Benchmarks — AI local (O4/O6)

Số liệu dưới đây đo trên **máy phát triển thật** (Windows, 16 GB RAM, i5-10210U 4 nhân / 8 luồng, iGPU Intel UHD, không GPU rời), không phải ước lượng. Mỗi bảng ghi rõ lệnh chạy để lặp lại. Chỉ những gì đã đo mới được ghi ở đây; tham số chưa đo thì ghi "chưa đo".

---

## Backend CPU so với Vulkan (GPU tích hợp): prefill + sinh token (2026-10-25)

**Câu hỏi:** có nên mặc định chạy llama.cpp bằng bản **Vulkan** để dùng iGPU thay cho CPU không? Kỳ vọng ban đầu là GPU nhanh hơn đáng kể (tham chiếu cảm tính từ LM Studio ~3 phút cho 33k ký tự).

**Trả lời đo được: KHÔNG.** Trên iGPU của máy này, bản Vulkan **chậm hơn** bản CPU, và vì vậy `auto` **ở lại CPU** (xem `DEFAULT_RUNTIME_BACKEND` trong `src/ai-core/runtime-resolver.ts`).

**Máy đo:** Windows, 16 GB RAM (i5-10210U, 4 nhân / 8 luồng), **Intel(R) UHD Graphics** (iGPU, driver 27.20.100.8729, `Vulkan0` báo 8231 MiB / 7442 MiB trống). Model `qwen3.5-4b-q4_k_m`. Runtime llama.cpp cùng một bản phát hành, hai gói: CPU x64 và Vulkan x64.

**Cách đo:** `llama-server` + `POST /completion`. Thời gian lấy từ `timings` của `/completion` (`prompt_per_second`, `predicted_per_second`), **không** bấm giờ tiến trình — `llama-server` không tự thoát sau khi trả lời. Cả hai lượt dùng **cùng một prompt**, cùng `--ctx-size 8192`, `--parallel 1`, `--threads 8`, `n_predict 64`, greedy (`temperature 0`), `cache_prompt: false`, bỏ lượt đầu (warm-up) rồi mới lấy số. Lượt Vulkan thêm `--device Vulkan0 --n-gpu-layers 99`.

### Kết quả

Qwen3.5-4B Q4_K_M, prompt ngắn (11 token), 3 lượt đo sau warm-up:

| Backend | Prompt eval (prefill) tok/s | Sinh token (decode) tok/s |
| --- | --- | --- |
| **CPU** (bản CPU x64, `--n-gpu-layers 0`) | **10,7–13,0** | **4,91–5,42** |
| Vulkan (bản Vulkan x64, 33/33 layer trên `Vulkan0`) | 0,40–0,75 | 2,76 |

⇒ Vulkan **chậm hơn CPU khoảng 2× khi sinh token và ~20× khi đọc prompt** trên máy này.

Trước đó, `tests/manual/bench-backend-prefill.js` đo trên prompt giáo án dài thật:

| Prompt | Số token | CPU | Vulkan |
| --- | --- | --- | --- |
| Giáo án dài | 11.086 | 7,03 tok/s | 6,96 tok/s |
| Prompt ngắn | 866 | 7,28 tok/s | 6,48 tok/s |

> ⚠️ **Bảng này KHÔNG dùng để kết luận.** Cả hai cột ~7 tok/s là **lỗi phương pháp**: script chạy `--no-warmup`, **không truyền `--threads`** (llama.cpp tự chọn số luồng, không phải 8), và **bản CPU được đo sai** — lúc đó thư mục runtime đang chứa bản **Vulkan**, và với `--n-gpu-layers 0` trên iGPU dùng chung RAM (`uma: 1`) phép tính **vẫn đi qua backend Vulkan**, nên cột "CPU" không phải CPU. Con số đúng phải lấy từ bảng phía trên, đo bằng **hai gói binary khác nhau**. Hai bảng cùng chỉ về một hướng (Vulkan không nhanh hơn) nhưng chỉ bảng đầu có độ lớn đáng tin.

**Đã xác nhận GPU thật sự được dùng**, không phải "Vulkan" trên giấy: log `llama-server -v` cho thấy toàn bộ layer được gán `assigned to device Vulkan0` (33/33), `Vulkan0 model buffer size = 2603.50 MiB`; và `--list-devices` chỉ báo `Vulkan0: Intel(R) UHD Graphics (8231 MiB, 7442 MiB free)`. Vậy kết quả chậm là do phần cứng/driver, **không** do cấu hình sai hay do không offload.

**Số luồng không phải vấn đề của app.** App **có** truyền `--threads` (`buildLlamaServerArguments` trong `src/ai-core/ai-manager.ts`) từ `resolveCpuThreads(logicalCpu, recommendedCpuThreads)`; trên máy này `min(8, 8)` = **8**, đúng mức nhanh nhất đo được. Không cần thêm cờ — chỉ script đo cũ bỏ sót `--threads`, và đó là lỗi của script, không phải của app.

**Không dùng `llama-bench.exe` để so Vulkan.** Trên máy này `llama-bench --list-devices` trả `(none)` và `-ngl 99` **âm thầm rơi về CPU** (bảng kết quả ghi `backend CPU`), nên nó chỉ đo được phía CPU. Đo Vulkan phải dùng `llama-server` — cũng chính là đường app chạy. (Số CPU từ `llama-bench`, có warm-up + `-r 3`: `pp866` **19,00 ± 1,16 tok/s** ở `-t 8`, **16,60 ± 1,28** ở `-t 4` — khớp §O6b, nên §O6b **không sai**; chỉ script cũ của tôi sai.)

### Vì sao iGPU không thắng ở đây

iGPU **dùng chung RAM với CPU** nên không có băng thông riêng để đổi lấy tốc độ, trong khi prefill là phép tính nặng trên ma trận mà CPU 8 luồng làm đã đủ tốt. Lợi thế của GPU rời (VRAM riêng, nhiều nhân tính toán) không có ở đây.

### Hệ quả cho sản phẩm

1. `auto` chọn **CPU**. Đây là mặc định đã được đo, **không** phải giả định. Giao diện Cài đặt (2026-10-25) hiển thị CPU là lựa chọn khuyến nghị và đưa bản Vulkan vào mục "Tùy chọn nâng cao".
2. Gói Vulkan **vẫn giữ** trong manifest (`verified: true`) vì nó tải được, kiểm SHA-256 đúng và **chạy được** trên máy này; chỉ là **không nhanh hơn**. `verified: true` nghĩa là "tải được / checksum đúng / chạy được", **không** có nghĩa "nhanh hơn". Ai muốn thử thì gọi `backend: 'vulkan'` tường minh.
3. Nếu máy có **GPU rời** (NVIDIA/AMD) thì chưa có số liệu — không được suy ra kết quả trên cho GPU rời. Bản CUDA hiện **chưa phát hành**.

**Bằng chứng ở mức app (không chỉ script).** Log `ai-2026-10-25.jsonl` cho thấy đổi mặc định đã có hiệu lực thật và đúng hướng:

| Thời điểm | `runtimeBackend` (lựa chọn) | `installedBackend` (trên đĩa) |
| --- | --- | --- |
| 13:55 | `vulkan` | `vulkan` |
| 15:02 | `auto` | **`cpu`** |

Cùng ngày, khi còn chạy Vulkan, bước phân tích có **3 lần `AI_TIMEOUT` ở 305–312 s**; khi chuyển sang CPU một lượt phân tích cùng tài liệu xong sau **136 s**. *Lưu ý:* lượt 136 s đó chạy model **2B**, còn lượt timeout chạy **4B** — model khác nhau nên **không** được quy thẳng chênh lệch này cho backend; chi tiết giải thích nằm ở bảng binary-vs-binary phía trên.

**Chưa đo / không được suy diễn:**
- ~~Chưa đo tốc độ **sinh token** (`predicted_per_second`)~~ — **đã đo ngày 2026-10-25** trên Qwen3.5-4B: **CPU 4.5–4.9** so với **Vulkan 1.9–2.1 tok/s** (prefill 11.8–13.1 so với 1.0). Số liệu thô và cách chạy ở `docs/STATUS.md`. Chưa đo **2B** trên Vulkan; **Gemma 4 E2B đã đo** ngày 2026-10-25 (mục riêng bên dưới): 8,40 tok/s sinh token trên CPU, chậm hơn 2B (11,12) và Vulkan còn chậm hơn (5,02).
- Chưa đo trên GPU rời, chưa đo trên AMD, chưa đo driver khác.
- ~~Con số ~22 tok/s không tái lập được~~ — **đã tìm ra nguyên nhân**: script đo cũ sai (xem cảnh báo ở trên). §O6b **đúng**; `llama-bench` đo lại cho 19,00 tok/s ở `-t 8`.
- Không so với LM Studio: khác runtime, khác model, khác tham số — con số đó không dùng được để kết luận cho llama.cpp.


---

## Gemma 4 E2B trên CPU: chậm hơn 2B, **không** phải vì "CPU chỉ chạy 33%" (2026-10-25)

**Câu hỏi đặt ra:** người dùng quan sát thấy Gemma 4 E2B dùng CPU "khá ít, chỉ 33%", và cho rằng đó là lý do nó chậm. Kết quả đo **bác bỏ nguyên nhân đó**: CPU gần như bị dùng hết, nút thắt nằm ở kích thước tham số và kiến trúc MoE.

**Máy đo:** Intel Core i5-10210U (**4 nhân / 8 luồng**), 15,8 GB RAM, không GPU rời. Runtime `b11681` (gói CPU, đo bằng `llama-bench` bên trong thư mục runtime; chính thư mục đó hiện có cả `ggml-vulkan.dll` nên cột **backend ghi `Vulkan` là nhãn của bản build, KHÔNG phải offload** — mọi lượt đều `-ngl 0`).

### 1. CPU có thực sự bận không?

| Model | params (llama-bench) | tg64 (`-t 8`) | CPU-seconds trong 2 s wall | Quy ra 8 luồng |
| --- | --- | --- | --- | --- |
| gemma-4-e2b-it-q4_k_m | 4,65 B | **8,40 tok/s** | 12,81 s | **~80%** |
| qwen3.5-2b-q4_k_m | 1,88 B | **11,12 tok/s** | 12,78 s | **~80%** |

Hai model dùng CPU **bằng nhau** trong lúc sinh token. Gemma không "lười" hơn 2B.

> **Cảnh báo về cách đo %:** trên máy này `Get-Process … .CPU` / `.TotalProcessorTime` **không cập nhật** giữa hai lần đọc sát nhau (kiểm chứng bằng một tiến trình rỗng: CPU 0,047 s đứng yên qua nhiều lần đọc). Nếu lấy mẫu một lần rồi chia, kết quả sẽ là 0% — đúng loại số liệu "33%" gây hiểu nhầm. Muốn đo đúng phải lấy **hiệu giữa hai lần đọc cách nhau ≥ 2 s** như bảng trên. Một lần đọc đơn lẻ trong Task Manager, nhất là khi đang tải model hoặc chờ đợi, cũng không đại diện cho lúc sinh token.

### 2. Số luồng có phải nguyên nhân không?

`gemma-4-e2b`, pp256 + tg16, `-ngl 0`, lặp 2 lần:

| `-t` | pp256 | tg16 |
| --- | --- | --- |
| 2 | 16,50 | 6,76 |
| 3 | 16,08 | 9,40 |
| 4 | 16,51 | 7,91 |
| 5 | 16,22 | 9,69 |
| 6 | 16,01 | 6,70 |
| **8** | **16,37** | **11,52** |

- **Prefill không đổi theo số luồng** (~16 tok/s ở mọi mức): phần đọc tài liệu — chi phối gần như toàn bộ thời gian phân tích giáo án — **không** mất tốc độ vì luồng.
- Sinh token **nhanh nhất ở 8 luồng**, tức là app đang làm đúng: `resolveCpuThreads(min(logicalCpu, recommendedCpuThreads))` cho ra 8 với Gemma, và log llama.cpp xác nhận `set_n_threads: n_threads = 8`.
- **Không có mức nào trong 2–8 luồng nhanh hơn 8.** Không có "ít luồng nên chậm" để sửa.

### 3. Vì sao Gemma chậm hơn thật

1. **"E2B" không phải 2 tỉ tham số.** `llama-bench` báo **4,65 B** tham số cho file 2,88 GiB: đây là **MoE** — mỗi token chỉ kích hoạt ~2 B, nhưng đường đi vẫn phải qua ma trận của 4,65 B tham số trong bộ nhớ. So với 2B **dense 1,88 B**, nó không thể nhanh hơn trên CPU. Tỉ lệ đo được (11,12 / 8,40 = **1,32×**) khớp với tỉ lệ tham số (4,65 / 1,88 = 2,47; nhưng chỉ phần được kích hoạt mới tính vào phép nhân).
2. **Prefill của Gemma tệ hơn hẳn:** pp1024 **không xong sau 200 s** (đã kill), còn 2B làm pp512 trong ~24 s. pp256 của Gemma 16,4 tok/s so với pp512 của 2B 21,2 tok/s. Đây mới là chỗ ảnh hưởng giáo viên: phân tích giáo án là **prefill**, không phải sinh token.
3. **Thinking bật mặc định.** `llama-cli` với 16 token chỉ in ra `[Start thinking] Thinking Process: 1. Analyze the input: The` — nghĩa là một cửa sổ sinh ngắn sẽ **không có câu trả lời thật**. Prompt tiếng Việt có dấu trong PowerShell bị tách thành nhiều đối số (`-p "Xin chào"` → `invalid argument: chao`), nên các lần đo trên dùng `"Xin chao"` không dấu cho chắc.
4. **Vulkan còn tệ hơn cho Gemma:** `-ngl 99` ⇒ pp256 16,74 (không hơn CPU) và tg16 **5,02** (CPU 11,52). MoE phải đẩy expert qua bus, đúng lý do CPU vẫn là mặc định.

### Hệ quả cho sản phẩm

- Gemma 4 E2B **giữ nguyên trạng thái manual-only, không tự cài**: trên máy phổ thông nó chậm hơn bản Nhanh 2B ở cả prefill lẫn sinh token.
- **Không** sửa `--threads`: số liệu cho thấy 8 luồng là tối ưu trên máy 4C/8T này.
- **Chưa** tắt thinking trong code. Nếu giáo viên chọn Gemma và nhận câu trả lời rỗng, đó là hành vi đã biết (`docs/DECISIONS.md` #80) chứ không phải lỗi mới.

**Chưa đo:** chất lượng nội dung Gemma so với 2B/4B, prefill trên prompt giáo án thật qua `llama-server`, và mọi thứ trên máy ≥ 6 nhân hoặc có GPU rời.

Cách chạy lại (PowerShell — dùng `Start-Process` để có timeout và ghi log ra file, vì `llama-bench` đôi khi không thoát):

```powershell
$rt="$env:APPDATA\edugame-studio\edugame-data\ai-local\runtime\llama.cpp-b11681"
$md="$env:APPDATA\edugame-studio\edugame-data\ai-local\models"
$p = Start-Process "$rt\llama-bench.exe" -ArgumentList @('-m',"$md\gemma-4-e2b-it-q4_k_m-0314792d7f1f.gguf",'-p','256','-n','16','-ngl','0','-t','8','-r','2') -NoNewWindow -PassThru -RedirectStandardOutput "$env:TEMP\bg.txt"
$p.WaitForExit(240000); Get-Process llama-bench -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Content "$env:TEMP\bg.txt" | Select-String 'pp256|tg16'
```



```powershell
# 1. Bật llama-server riêng cho embedding (cùng binary llama.cpp đã cài)
llama-server.exe --model <minilm.gguf> --alias minilm --host 127.0.0.1 --port 9341 `
  --ctx-size 512 --threads 4 --n-gpu-layers 0 --embedding --pooling mean --embd-normalize 2

# 2. Chấm điểm truy xuất (bộ 16 câu tiếng Việt, 5 giáo án tổng hợp)
node tests/manual/bench-embedding.js --url http://127.0.0.1:9341 --budget 2
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
- **Re-probe 2026-10-20 với `--jinja`** (spec §7 yêu cầu xác minh chat template/Jinja; tool: `tests/manual/thinking-probe.js`, cùng runtime/model, prompt một câu trả lời ngắn, không schema): `enable_thinking: true` + 900 token → 3.204 ký tự suy luận / **0 nội dung** / 67 s (`finish: length`); 2.048 token → 8.341 ký tự suy luận / **0 nội dung** / 158 s (`finish: length`). Đối chứng `enable_thinking: false` + 300 token → 0 suy luận / 23 ký tự nội dung / 1,7 s (`finish: stop`). Kết luận cũ **vẫn đúng với `--jinja`**: template không sửa được triệu chứng "suy luận không kết thúc".
- Kết luận: **Deep không bật thinking** (xem `DECISIONS #26`). Nhãn UI là "Fast"/"Thinking" theo spec §9 nhưng phần mô tả nói thẳng giới hạn đã đo (thinking chưa dùng được trên model/runtime này); khác biệt thật sự là ngữ cảnh và trần output.

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

`tests/manual/bench-ai.js --phase batch` so sánh **một lượt 8 câu** với **8 lượt, mỗi lượt 1 câu** (đúng cơ chế "Tạo lại từng mục" của O5) trên cùng giáo án Sinh 7, cùng ngữ cảnh:

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

- **Đã chạy e2e thật trong cửa sổ app (2026-10-20)**: `tests/manual/real-ai-e2e.js` **19/19** trên i5-10210U / 16 GB, model `qwen3.5-2b-q4_0`, runtime READY sau **14 s**. Bài ngắn 520 ký tự: phân tích thật **63 s** (3 mục tiêu, 3 khái niệm), sinh **4 câu arena trong 75 s**, 0 lỗi chất lượng, lưu game và mở màn chơi được. Trong cùng lượt chạy: huỷ giữa phân tích trả `AI_CANCELLED` và runtime vẫn READY; lượt phân tích thứ hai bị `AiSingleFlight` chặn; progress đi tới `ready`; cache không được dùng (`regenerate: true`). Đây chỉ là một bài ngắn, không phải tuyên bố tham số “tối ưu”. Các số benchmark ở trên vẫn là đo qua HTTP với prompt/schema của app; luồng IPC → store → adapter → player giờ đã được xác minh thêm bằng bài thật này.
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
node tests/manual/bench-ai.js --url http://127.0.0.1:9342 --phase analyze,generate --modes fast `
  --analysis-cache "$env:TEMP\bench-analyses.json" --out "$env:TEMP\bench-fast.json"

# 3. Batch: 1 lượt 8 câu so với 8 lượt 1 câu
node tests/manual/bench-ai.js --url http://127.0.0.1:9342 --phase batch --limit 1 `
  --analysis-cache "$env:TEMP\bench-analyses.json" --out "$env:TEMP\bench-batch.json"

# 4. Deep trên 2 giáo án
node tests/manual/bench-ai.js --url http://127.0.0.1:9342 --phase analyze,generate --modes deep `
  --limit 2 --analysis-cache "$env:TEMP\bench-analyses.json" --out "$env:TEMP\bench-deep.json"

# 5. Thăm dò thinking (không dùng trong sản phẩm)
node tests/manual/bench-ai.js --url http://127.0.0.1:9342 --phase thinking --limit 1
```

`--analyze-tokens`, `--generate-tokens`, `--questions`, `--from`, `--limit`, `--force-analyze` cho phép tái lập từng biến thể. Báo cáo in bảng markdown + JSON, kèm RAM đỉnh của server.

---

## O6b — Cờ khởi động llama.cpp: `--threads` / `--threads-batch` / `ubatch` / flash-attn / ngram (2026-10-23)

**Mục tiêu:** sau khi ONNX bị loại (#53), kiểm tra xem có thể tăng tốc bước *đọc prompt* bằng cờ khởi động không — tách luồng cho tiền xử lý prompt (`--threads-batch`), giảm `--ubatch-size`, bật flash attention, hoặc giải mã suy đoán n-gram.

**Máy:** i5-10210U (4 nhân / 8 luồng, 1.6 GHz base), 16 GB RAM, máy rảnh (không app nền, power plan Balanced), Windows x64.
**Runtime/model:** `llama.cpp b11681`, Qwen3.5 **4B Q4_K_M** và **2B Q4_0** (2B là model mặc định của app).
**Prompt:** giáo án mẫu hình dạng bài toán phân tích → **771 token** (2636 ký tự). `cache_prompt: false` để cache không che mất chi phí prefill; thinking tắt; greedy; 1 lần warm-up rồi lấy **trung vị** của 3–5 lần. `n_predict = 256` (Qwen không tôn trọng "chỉ JSON" nên chạy tới trần; đổi từ 2048 → 256 để mỗi lần đo ~30–90 s thay vì 7 phút).

### 4B — trung vị 5 lần (`baseline`, `t8`, `ub256`)

| Cấu hình | Prefill tok/s (5 lần) | Decode tok/s | Xác nhận lại ở 3 lần |
| --- | --- | --- | --- |
| `--threads 4` (đối chứng) | 19,92 (20,89 · 19,92 · 17,95 · 19,60 · 22,12) | 5,23 | 19,51 · 20,21 |
| `--threads 8` | **22,59** (25,24 · 24,03 · 21,28 · 22,40 · 22,59) | **5,80** | 24,23 · 26,79 |
| `--threads 4 --ubatch-size 256` | 22,12 (22,93 · 20,94 · 22,53 · 19,88 · 22,12) | 4,98 | 19,88 · 22,71 |

### 4B — 3 lần, các biến thể còn lại

| Cấu hình | Prefill tok/s | Decode tok/s | Kết luận |
| --- | --- | --- | --- |
| `--threads 4 --threads-batch 8` | 18,73 | 4,42 | **kém hơn cả hai mặt** |
| `--threads 4 --threads-batch 6` | 18,89 | 4,82 | kém hơn cả hai mặt |
| `--threads 4 --ubatch-size 1024` | 19,53 | 5,36 | không hơn đối chứng |
| `--threads 4 --flash-attn on` | 21,70 | 5,76 | không hơn `t8` (nhiễu) |
| `--threads 4 --spec-type ngram-simple` | 21,89 | 5,63 | không hơn `t8` (nhiễu) |

### Kiểm tra nhiễu bằng "đồng hồ CPU" (cùng prompt ngắn, 5 lần)

Để phân biệt *song song thật* với *turbo tăng xung*, cả hai cấu hình được đo xen kẽ một prompt ~5 token và prompt bài học trong cùng một phiên server:

| Cấu hình | Xung CPU ghi nhận | Prompt ngắn tok/s | Prompt bài học tok/s |
| --- | --- | --- | --- |
| `--threads 4` | 1508 MHz | 10,85 (13,05 · 12,26 · 10,85 · 6,45 · 10,21) | 20,21 |
| `--threads 8` | 1609 MHz | 10,76 (12,02 · 10,76 · 11,12 · 10,01 · 8,84) | 19,13 |

⇒ Prompt ngắn **hòa nhau**, prompt dài thì 8 luồng nhanh hơn ⇒ lợi ích là **song song thật**, không phải turbo. Vì vậy không còn chỗ cho một số luồng riêng cho prefill.

### 2B — 3 lần (model mặc định)

| Cấu hình | Prefill tok/s | Decode tok/s |
| --- | --- | --- |
| `--threads 4` | 55,04 | 11,23 |
| `--threads 8` | 58,19 (16,44 · 58,19 · 65,96) | 12,43 |
| `--threads 4 --threads-batch 8` | 60,02 (60,02 · 54,21 · 64,79) | 12,53 |
| `--threads 4 --threads-batch 6` | 61,76 (61,76 · 63,19 · 48,07) | 11,45 |
| `--threads 4 --ubatch-size 1024` | 56,40 | 12,57 |
| `--threads 4 --ubatch-size 256` | 56,84 | 12,78 |
| `--threads 4 --flash-attn on` | 54,76 | 12,59 |
| `--threads 4 --spec-type ngram-simple` | 54,53 | 11,83 |

Trên 2B mọi cấu hình nằm trong khoảng **54–62 tok/s** và độ tản giữa các lần (một lần `t8` chỉ 16,44 tok/s) lớn hơn chênh lệch giữa các cấu hình ⇒ **không kết luận được gì**, không có cấu hình nào vượt trội.

### Prompt của bước "Tạo lại một mục" (phát hiện quan trọng hơn)

Đo prompt thật mà `buildItemRegenerationPrompt` gửi đi (phân tích + mục hiện tại + lý do + `Trích tài liệu:` với ngân sách của app):

| Biến thể | Ký tự | Token | Prefill 4B | Decode 4B | Prefill 2B | Decode 2B |
| --- | --- | --- | --- | --- | --- | --- |
| fast (6 đoạn / 4500 ký tự) | 5.740 | **1.723** | 21,39 | 4,24 | 56,77 | 13,11 |
| deep (8 đoạn / 6000 ký tự) | 7.342 | **2.196** | 21,62 | 5,69 | 59,92 | 13,27 |
| (tham chiếu) phân tích giáo án | 2.636 | 771 | 22,59 | 5,80 | 58,19 | 12,43 |

⇒ Một lần bấm "Tạo lại" gửi **2,2–2,8 lần** số token của cả bước phân tích: ~**82 s** (fast) và ~**102 s** (deep) chỉ riêng phần prefill trên 4B. Mỗi mục tạo lại trả lại chi phí này, dù chỉ sai một câu.

**Kết luận đo được:** không cờ nào trong `--threads-batch`, `--ubatch-size`, `--flash-attn`, `--spec-type ngram-simple` cải thiện được ở kích thước prompt này; cấu hình app đang dùng (`--threads` = `resolveCpuThreads` = 8 trên máy 4C/8T) đã là cấu hình nhanh nhất đo được. Ghi thành **decision #54**, **không đổi code**. Đòn bẩy thật là **độ dài prompt** (ngân sách `DEFAULT_MAX_SELECTED_CHARS` / `DEEP_MAX_SELECTED_CHARS`), nhưng đổi nó là đánh đổi độ phủ truy xuất nên phải đo chất lượng câu hỏi trước khi sửa.

**Chưa đo / không được suy diễn:** một máy, một prompt phân tích và một prompt tạo lại tổng hợp; không đo trên GPU/NPU, không đo 7B; chưa đo chất lượng câu hỏi khi giảm ngân sách ký tự; chênh lệch vài phần trăm giữa `ub256`/`fa-on`/`ngram` và `t8` vẫn nằm trong độ tản của máy.

Cách chạy lại (script nằm ngoài repo, `D:\onnx-build`):

```powershell
cd D:\onnx-build
python bench_llama.py --model 4b --reps 5 --only baseline t8 ub256   # bảng chính
python bench_llama.py --model 2b                                     # toàn bộ biến thể trên 2B
python bench_clock.py --model 4b                                     # tách song song thật vs turbo
python bench_item.py 4b; python bench_item.py 2b                     # prompt "Tạo lại"
python report_llama.py; python report_item.py                        # in độ tản từng lần
```


## O6d — Chi phí và hiệu quả của tiền xử lý offline trước bước phân tích (2026-10-23)

**Đo cái gì:** không phải tốc độ model (không gọi model), mà **đầu vào** của bước `lesson:analyze` thay đổi bao nhiêu khi đi qua `src/services/lesson-preprocess.ts`, và **chi phí CPU** của việc tiền xử lý đó.

```powershell
npm run build
node tests/manual/bench-preprocess.js
```

**Bộ dữ liệu: TỔNG HỢP** (`tests/manual/bench-preprocess.js`, không có giáo án hay dữ liệu học sinh thật). Đây là **cận trên của chi phí tiền xử lý và minh hoạ từng lớp**, **không** phải tốc độ end-to-end trên giáo án của giáo viên. Token là **ước lượng** theo tỉ lệ 3,23 ký tự/token dùng xuyên suốt tài liệu này, không phải `token_processed` của llama.cpp.

| Fixture tổng hợp | Ký tự gốc | Sau L1+L2 | L3 sẽ tiết kiệm | Token trước → sau |
| --- | --- | --- | --- | --- |
| Lặp tiêu đề trang, 60 mục | 7.301 | 6.238 | 0 | 2.260 → 1.931 (−15%) |
| Giáo án dài trộn nội dung + ghi chú lớp | 22.957 | **11.904** | 10.964 | xem ghi chú |
| Dán bẩn (ký tự điều khiển, NBSP, xuống dòng trùng) | 3.073 | 2.411 | 0 | 951 → 746 (−22%) |
| Giáo án ngắn (dưới ngân sách) | 78 | 78 | 0 | không đổi |

**Trên chính 6 giáo án fixture của repo** (`tests/fixtures/bench/lessons.json`, bộ dùng cho benchmark O4 — vẫn là tổng hợp, đã được review sẵn trong repo):

| Giáo án | Ký tự | Sau L1+L2 | Dòng lặp bỏ | Token trước → sau |
| --- | --- | --- | --- | --- |
| `sinh7-quang-hop` | 2.412 | 2.412 | 0 | 747 → 747 |
| `toan2-cong-co-nho` | 1.392 | 1.390 | 0 | 431 → 430 |
| `gdcd6-an-toan-giao-thong` | 2.043 | 2.043 | 0 | 633 → 633 |
| `khtn6-vong-tuan-hoan-nuoc` | 1.773 | 1.773 | 0 | 549 → 549 |
| `anh6-hien-tai-don` | 1.773 | 1.773 | 0 | 549 → 549 |
| `su8-bach-dang` | 1.939 | 1.939 | 0 | 600 → 600 |

⇒ **Trên bộ fixture này, tiền xử lý gần như KHÔNG giảm token** (chỉ −1 token ở `toan2`, do khoảng trắng cuối tệp). Đây là bộ giáo án sạch, ngắn, không có tiêu đề trang lặp — đúng loại tài liệu mà bước này **không có gì để cắt**. Số đo vì vậy nói rõ: lợi ích của L1/L2 chỉ xuất hiện với **tài liệu dán bẩn / dài có boilerplate**, không với giáo án ngắn sạch.

**Chi phí tiền xử lý:** trung bình **4,53 ms/lần** cho văn bản 22.957 ký tự (20 lần chạy, `process.hrtime.bigint`). So với ~36 s prefill của prompt phân tích trên 4B, chi phí này không đáng kể ⇒ bước tiền xử lý **không thể** tự nó làm chậm một lượt chạy.

**Ghi chú về dòng "22.957 → 11.904":** dòng này cho thấy L2 cắt đúng ngân sách 12.000 ký tự, **không** phải L2 tiết kiệm 11.000 ký tự. Cột "token trước" dùng ngưỡng cũ 12.000 nên cột token gần như không đổi; điều thay đổi thật là **vị trí cắt** (biên đoạn thay vì giữa câu/bảng) và việc giữ **đầu + cuối** thay vì chỉ đầu. Trước khi có O6d, một văn bản 22.957 ký tự đã bị cắt xuống ~11.900 ký tự theo cách cũ.

**Kết luận đo được:** L1 tiết kiệm **10–22%** ký tự trên văn bản dán bẩn hoặc có tiêu đề trang lặp; L2 **không** giảm thêm ký tự (cùng ngân sách) mà sửa **chất lượng điểm cắt**; L3 có thể tiết kiệm thêm lớn trên giáo án dài nhưng **đang tắt** vì chưa có câu hỏi của giáo viên để xếp hạng (decision #56). Trên **6 giáo án fixture sạch, ngắn của repo thì mức giảm gần như bằng 0** (−1 token) — tức là với giáo án ngắn thông thường (dưới ~12.000 ký tự), bước này **không giảm token**, chỉ chuẩn hoá và bỏ dòng lặp. **Không được báo cáo đây là "giảm token phân tích"** trên giáo án thật cho tới khi có số từ log của app.

**Chưa đo / không được suy diễn:** chưa chạy model thật nên **chưa biết** số giây prefill tiết kiệm được, chưa biết có làm tăng lượt sửa (`repair`) hay không, và **chưa** có số trên giáo án thật của giáo viên (bộ đo hiện chỉ có fixture tổng hợp). Khi chạy app thật, log `analyze.preprocess` ghi `originalChars`/`cleanedChars`/`excerptChars`/`truncated`/`excerptReason`/`rankingSavingsChars`/`ms`, và `analyze.done` ghi thêm `promptTokens` **nếu** runtime trả `usage.prompt_tokens` — đó là số đo thật cần thu trước khi tin vào bất kỳ mức tiết kiệm nào ở trên.

Cách đọc lại số đo thật (sau một lượt phân tích trong app):

```powershell
# %APPDATA%\edugame-studio\edugame-data\ai-local\ai-log\*.log
Select-String -Path "$env:APPDATA\edugame-studio\edugame-data\ai-local\ai-log\*.log" -Pattern 'analyze.preprocess|analyze.done'
```

### O6e — Tiền xử lý trên **tài liệu giáo viên thật** (`tests/tailieu/*.pdf`, 2026-10-23)

Bộ O6d chỉ có fixture tổng hợp. Lượt này chạy trên **4 PDF thật** (11–29 trang), trích bằng đúng `pdfParse(buffer)` mà `src/main.ts` dùng (`files:import-document-from-path`), rồi áp L1+L2.

> **Thư mục `tests/tailieu/` đã bị xoá ngày 2026-10-25** (4 PDF thật, ~1,2 MB). Số liệu trong mục này là số đã đo **khi còn tệp** và giữ nguyên giá trị lịch sử; không chạy lại được nếu không đưa PDF vào lại (xem `tests/README.md`).

**Phát hiện 1 — L1 xoá nội dung thật (đã sửa).** Bộ lọc "tiêu đề lặp" cũ chỉ cần: dài ≤80 ký tự, xuất hiện ≥3 lần, không khớp mẫu nội dung. PDF **2 cột** lặp từng ô của bảng qua từng trang, nên những cụm sau bị xoá:

| Tệp | Từng bị xoá (không phải tiêu đề) |
| --- | --- |
| Giải quyết mâu thuẫn hiệu quả | `-` (×3), `–` (×3), `mâu thuẫn.` (×3), `chọi với nhau, không hòa thuận.` (×3) |
| K6 định hướng học tập… (2 cột) | `Trò chơi:` (×5), `Khám phá`, `kiến thức`, `mới`, `tập.`, `lớp:` |
| Tư duy tích cực | `-`, `–`, `Vận dụng` (×4) |
| Tư duy phản biện | `-`, `–` |

Xoá dấu đầu dòng đứng riêng còn làm **dính từ**. Đã sửa: `isHeaderLike()` + `SENTENCE_END` (chỉ dòng trông như header mới bị xoá) và nối dấu vào **đầu dòng sau**. Sau khi sửa, chỉ còn xoá đúng `TÀI LIỆU CHƯƠNG TRÌNH GIÁO DỤC KỸ NĂNG SỐNG THCS` (×11–17/trang) và header bảng 2 cột (×3).

**Phát hiện 2 — mất mát do L2 là lớn, và phải nói ra.** `node tests/manual/measure-retention.js`:

| Tài liệu | raw | fast 12k | deep 18k | recall bigram fast | recall deep | ký tự nội dung fast | deep |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Giải quyết mâu thuẫn (17 tr) | 26.389 | 11.989 | 17.989 | 55% | 78% | 49% | 73% |
| K6 định hướng… (29 tr, 2 cột) | 33.971 | 11.988 | 17.990 | 42% | 60% | 37% | 56% |
| Tư duy tích cực (12 tr) | 19.850 | 11.995 | 17.985 | 67% | 97% | 66% | 99% |
| Tư duy phản biện (11 tr) | 19.660 | 11.960 | 17.971 | 73% | 98% | 66% | 99% |

Mất cụ thể trong tệp 1 (fast): `Giáo viên chốt:` **10 → 1** (deep 5), `trò chơi` **5 → 3** (deep 4). Ngân sách 12.000 ký tự **không đủ** cho giáo án Việt 11–29 trang.

**Đối chứng:** hành vi **trước** O6d cũng cắt (~8.000 + ~3.900 ≈ 11.900 ký tự), và cắt giữa câu/bảng. Vậy thay đổi này **không làm mất nhiều hơn**, nhưng **cũng không giảm token** trên tài liệu thật — nó đổi **chỗ cắt** và **độ sạch**.

**Cách chạy lại:**
```powershell
npm run build
node tests/manual/measure-retention.js        # bảng trên: recall bigram + ký tự nội dung
node tests/manual/bench-preprocess-real.js    # dataset: raw/clean/fast/deep/ms
node tests/manual/inspect-preprocess-real.js  # dòng nào bị bỏ, cắt ở đâu (ghi docs/_preprocess-real-report.txt)
node tests/manual/inspect-preprocess-middle.js# in phần GIỮA bị bỏ (để đọc bằng mắt)
node tests/manual/measure-query-ranking.js     # #58: head+tail vs ranked vs ranked-query (§O6f)
node tests/manual/diagnose-query-ranking.js "<file.pdf>"  # #58: vì sao một câu truy vấn bị bỏ
```
Lưu ý: console Windows làm hỏng dấu tiếng Việt; các script ghi báo cáo ra tệp UTF-8 để đọc.

**Chưa đo:** chất lượng câu hỏi model sinh ra từ excerpt bị cắt (cần chạy model thật — gate O6), và số giây prefill thật (log `analyze.preprocess` + `promptTokens`).

### O6f — Xếp hạng trích đoạn **có giám sát** bằng truy vấn (#58, 2026-10-23)

**Câu hỏi:** #57 cho thấy head+tail 12k bỏ mất phần giữa — nơi chứa `Câu hỏi:` / `Giáo viên chốt:` — nên xếp hạng có giúp gì không? L3 **không giám sát** (không có truy vấn) vẫn tắt (#56, chờ gate O6). Nhưng khi đã có truy vấn của giáo viên thì xếp hạng **có** tín hiệu đúng.

**Thiết lập:** `node tests/manual/measure-query-ranking.js` (cần `npm run build` trước). Ngân sách **fast 12.000 ký tự**. Truy vấn là **tổng hợp và lạc quan**: 2 câu dài nhất của **một phần ba giữa** mỗi tài liệu sau khi làm sạch — tức đúng phần head+tail cắt bỏ. Một câu được tính là "giữ" chỉ khi **còn nguyên văn** trong trích đoạn; trùng một từ không được tính.

| Tài liệu (ký tự sau L1) | recall bigram head+tail / ranked / ranked-query | câu truy vấn giữ được (trên 2): head+tail / ranked / query |
| --- | --- | --- |
| Kỹ năng sống, 17 trang (24.663) | 55% / 53% / 53% | 0/2 / 2/2 / **2/2** |
| Định hướng AI, 29 trang, 2 cột (31.861) | 42% / 48% / 48% | 0/2 / 0/2 / **0/2** |
| Tư duy tích cực, 12 trang (18.238) | 67% / 72% / 67% | 0/2 / 2/2 / **2/2** |
| Tư duy phản biện, 11 trang (18.184) | 73% / 73% / 74% | 0/2 / 2/2 / **2/2** |

**Đọc đúng:** head+tail giữ **0/2** câu được hỏi ở **cả 4** tài liệu; xếp hạng giữ **2/2** ở **3/4**. Recall bigram **tổng thể** gần như không đổi (có lúc giảm 2 điểm) — điều này là đương nhiên: xếp hạng chọn theo *câu hỏi*, nên phần không được hỏi bị bỏ nhiều hơn. Vì vậy **không** được mô tả L3 là "giữ nhiều nội dung hơn"; chỉ được mô tả là "giữ đúng phần câu hỏi nhắm tới".

**Ca thất bại được chẩn đoán, không phải lỗi chấm điểm:** `node tests/manual/diagnose-query-ranking.js "<file.pdf>"` cho thấy câu truy vấn nằm trong một khối **1.186 ký tự**, nhưng tài liệu 2 cột có **7 khối** `blockValue() === Infinity` (bảng / danh sách câu hỏi) ăn hết 12k **trước khi** xếp tới khối không được bảo vệ nào. Đó là đánh đổi có chủ ý (không bao giờ bỏ danh sách câu hỏi), nên đòn bẩy ở đây là **ngân sách** hoặc thứ tự ưu tiên của khối `Infinity`, không phải sửa công thức điểm.

**Chưa đo:** chất lượng câu hỏi game sinh ra (gate O6); lợi ích prefill (chưa có caller sản phẩm nào truyền `query`); truy vấn thật của giáo viên khó hơn truy vấn tổng hợp ở trên.

## U1 — Mật độ màn chơi ở chế độ toàn màn hình (#59, 2026-10-23)

**Câu hỏi:** ở chế độ trình chiếu (⛶), câu hỏi và đáp án có thật sự to và có dùng hết chỗ không? Đo trên renderer thật, không đọc CSS.

**Thiết lập:** `npm run build`, `node_modules\electron\dist\electron.exe . --remote-debugging-port=9357`, rồi `node tests/ui/ui-fullscreen-density-check.js 9357`. Dữ liệu game **tổng hợp** (1 câu hỏi, 4 đáp án). Cửa sổ **1280×721** (laptop 1366×768 bị Windows trừ taskbar). Đo bằng `offsetWidth/offsetHeight` (không dùng `getBoundingClientRect` vì animation pop-in scale 0,92), sau khi ép animation xong.

| Chỉ số | trước #59 | sau #59 |
| --- | --- | --- |
| Cỡ chữ câu hỏi / bề rộng khung | 45,3px / 1120px (88% bề rộng) | 45,3px / **1189px** (93%) |
| Cỡ chữ đáp án / chiều cao ô | 25,7px / 115px | **28,6px** / 174px |
| Lưới đáp án | 1120px, 2 cột | 1189px, 2 cột |
| Diện tích stage trống | 49,0% | **27,9%** |
| Khoảng trống dưới nội dung cuối | 122px | **12px** |
| Kết quả chấm | 7/9 | **9/9** |

**Ca biên — câu hỏi dài 6 dòng + 4 đáp án 3 dòng** (đổi viewport bằng CDP `Emulation.setDeviceMetricsOverride`, cùng build):

| Viewport | câu hỏi | đáp án | số ô bị cắt chữ | cuộn trang |
| --- | --- | --- | --- | --- |
| 1280×720 | 45,2px / 331px cao | 28,6px / 146px | 0 | không |
| 1024×600 | 37,2px / 273px | 23,5px / 123px | 0 | không (stage tự cuộn) |
| 1366×705 | 45,4px / 277px | 28,7px / 145px | 0 | không |
| 1920×1010 | 60,0px / 366px | 30,0px / 145px | 0 | không |

**Đọc đúng:** con số "122px trống" của báo cáo cũ một phần là **lỗi phép đo**: script cũ tính từ **đáy lưới đáp án**, nên đếm cả thanh `Tiếp tục` (nằm trong `.stage-center`, cao 16px + gap) là chỗ trống. Số trống **thật** dưới lưới sau khi sửa là 112px, và nó **không phải** chỗ chết: đó là khoảng trống còn lại của hàng lưới đáp án chia cho 2 hàng ô (ô cao 174px cho 3 dòng chữ). Nếu muốn chữ to hơn nữa ở cửa sổ cao 721px thì phải tăng `vh` trong `font-size` — đã thử `3,4vh` và dòng chữ bắt đầu chạm biên ô.

**Chưa đo:** máy chiếu thật, tỉ lệ 16:9 thật sau khi Electron vào fullscreen phần cứng (các số trên là cửa sổ 1280×721, không phải màn hình thật), và game "Đường đua"/"Tìm kho báu" ở chế độ toàn màn hình (chúng có bố cục riêng, không dùng lưới đáp án 2 cột).



