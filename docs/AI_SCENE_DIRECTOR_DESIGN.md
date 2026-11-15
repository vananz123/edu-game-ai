# Thiết kế kỹ thuật — AI Scene Director (EduGame Studio)

> **Trạng thái tài liệu.** Bản này thay cho bản "Tài liệu Thiết kế Kỹ thuật" cũ, vốn dùng
> tên asset **không tồn tại** trong mã. Mọi tên trong tài liệu này lấy trực tiếp từ
> `src/shared/scene-asset-catalog.ts` và đã được đốt bằng test.
>
> **Đã có trong mã:** P0 (quyết định #252) — blueprint `v:1`, `layout: 'single'`, cổng
> chuẩn hoá, lưu `.egame`, nút "Cảnh thử" **không gọi mạng**.
> **Đã có:** `compare` (dữ liệu + hình + UI + prompt, #262), kênh AI `scene:suggest`
> (#265), màu chủ thể + người trong cảnh (#266), `process` trọn bộ (#267 dữ liệu/hình/prompt,
> #268 UI), và `surround` trọn bộ (#270 — xem §3.5). **Cả bốn bố cục của P2 đều có trong mã.**

---

## 1. Tổng quan kiến trúc

Mục tiêu: nâng ảnh minh hoạ câu hỏi từ một icon đơn lên một cảnh ghép, mà vẫn giữ
ba ràng buộc cố định của sản phẩm.

| Ràng buộc | Cách giữ |
|---|---|
| Chơi được khi offline | Blueprint là JSON thuần trong SQLite/`.egame`; vẽ bằng SVG sinh tại máy |
| `.egame` nhẹ | Blueprint ~120–180 byte/câu, không ảnh, không markup |
| Không chạy output của model | Model chỉ trả **JSON dữ liệu**; SVG do engine sẵn có vẽ |

Các tệp thật sự tham gia:

| Tệp | Vai trò |
|---|---|
| `src/shared/scene-asset-catalog.ts` | Từ vựng: backdrop, icon, palette, hằng số giới hạn |
| `src/shared/scene-blueprint.ts` | Kiểu `SceneBlueprint` + `normalizeSceneBlueprint` (cổng kiểm duyệt) |
| `src/shared/illustration-scene.ts` | `composeSceneSvg` / `renderBlueprintSvg` — bộ vẽ SVG |
| `src/shared/illustration-registry.ts` | `resolveIllustration` — thứ tự ưu tiên nguồn ảnh |
| `src/shared/asset-validation.ts` | Gọi normalizer khi đọc asset của item |
| `src/services/game/game-package.ts` | Thu/gắn blueprint khi xuất/nhập `.egame` (chuẩn hoá lại khi nhập) |
| `src/renderer/features/game-illustration.ts` | Bản sao renderer, có parity test với bản shared |
| `src/renderer/features/editor/questions.ts` | Nút "Cảnh thử" + input ẩn + preview |

---

## 2. Luồng hoạt động

**P0 — hôm nay (không có AI).**

1. Giáo viên soạn câu hỏi và đáp án.
2. Bấm **"Cảnh thử"** trong khối ảnh của editor.
3. Ứng dụng suy ra blueprint từ `contentCategory` hiện tại
   (`sceneBlueprintFromCategory`) — **không gọi mạng**.
4. Blueprint ghi vào input ẩn, đi qua `normalizeSceneBlueprint`.
5. `stageIllustrationHtml` (đúng hàm của màn chơi) vẽ preview.
6. Lưu: blueprint nằm trong dữ liệu item; xuất `.egame` chỉ ghi JSON.

**P3 — CÓ (#265).** Bước 2 đổi thành "✨ Gợi ý cảnh từ nội dung": gửi nội dung câu hỏi +
danh mục asset tới model, model trả JSON, JSON đi qua **cùng**
`normalizeSceneBlueprint`, ghi qua `ai_tasks`. Không có đường nào cho model chạm vào
markup/SVG.

**Thứ tự ưu tiên nguồn ảnh (đã có, không đổi):**

1. Giáo viên chọn cảnh dựng sẵn → thắng blueprint.
2. Giáo viên tải ảnh riêng → thắng tất cả.
3. `'none'` / "Bỏ ảnh" → thắng tất cả.
4. Blueprint hợp lệ (chế độ `auto`) → dùng.
5. Cảnh mặc định theo category.

---

## 3. Cấu trúc dữ liệu

### 3.1 Hình dạng ĐÃ CÓ (P0)

```ts
interface SceneBlueprint {
  v: 1;                    // BẮT BUỘC. Thiếu hoặc ≠ 1 -> bị từ chối (null)
  layout: 'single';        // P0 chỉ vẽ được 'single'
  backdrop: string;        // một trong 10 tên ở §4.1
  paletteKey: string;      // một trong 24 khoá ở §4.3
  mainIcon: string;        // một trong 41 tên ở §4.2. Sai -> null (không có chủ thể thì không có cảnh)
  subIcons?: string[];     // tối đa 2, phải ∈ 41 icon, không trùng mainIcon, không trùng nhau
}
```

Điểm phải nhớ: **`v` là bắt buộc.** Bản tài liệu cũ bỏ trường này, nên mọi blueprint
do model sinh ra sẽ bị chặn ở cổng `version`.

### 3.2 Hình dạng chung

Không còn bố cục nào ở trạng thái "dự kiến": cả bốn giá trị của `layout` đều có dữ liệu,
hình, UI và prompt. Thêm bố cục mới về sau phải đi đủ bốn bước như #262/#267/#270 —
hằng số hình học, nhánh vẽ, luật chuẩn hoá, prompt + ví dụ — chứ không mở prompt trước.

### 3.5 `surround` — dữ liệu, hình, UI và prompt đều CÓ (#270)

```ts
layout: 'single' | 'compare' | 'process' | 'surround';
around?: string[];             // 1-4 thứ vây quanh chủ thể, khi layout = 'surround'
```

`mainIcon` là vật **ở giữa**; `around` là những thứ **quanh nó**, tối đa 4, xếp theo chiều
kim đồng hồ từ góc trên-trái. Dữ liệu **không** mang toạ độ: thứ tự là thứ tự vòng, còn bốn
chỗ đứng do engine sở hữu — nhờ vậy hai lần lưu cùng một cảnh không thể "cãi nhau" về chỗ
đứng của một vật.

| Thành phần | Toạ độ (đo bằng test) |
|---|---|
| chủ thể | 88px, giữa khung: x 116–204, y 52–140, màu `glow` |
| vòng 1–4 | 48px tại (28,10) → (244,10) → (244,96) → (28,96), màu `ink`, opacity 0.85 |
| props | giữ nguyên #259: 40px, y 146 |

**Vì sao chủ thể nhỏ còn 88px:** khung 320×200, props đứng từ y 146, nên hàng trên chỉ còn
y 10..58 và hai bên y 96..144. Chủ thể 120px như `single` sẽ đè cả bốn ô.

**Vì sao `surround` KHÔNG có subIcons:** bốn góc đã là vòng. Icon góc bị **từ chối kèm issue**
`subIcons` chứ không bị dời vào chân chủ thể, vì dời như vậy là bịa ra một chỗ đứng không có
trong thiết kế.

**Hạ cấp:** không còn vật nào dùng được ⇒ về `single` + issue `around` (vòng rỗng không phải
vòng). Vật sai/thừa bị bỏ, phần còn lại vẫn thành vòng. `single` mang `around` ⇒ bỏ + issue.

### 3.4 `process` — dữ liệu, hình, UI và prompt đều CÓ (#267, UI ở #268)

```ts
layout: 'single' | 'compare' | 'process';
steps?: string[];              // 1-2 bước SAU bước đầu, khi layout = 'process'
```

`mainIcon` là **bước 1**, `steps` là các bước sau theo đúng thứ tự thời gian — thứ tự
chính là nghĩa của bố cục này. Hình học (đo bằng test, không bằng mắt):

| Thành phần | Toạ độ |
|---|---|
| 2 bậc | x = 48, 196; y = 66; cạnh 76 |
| 3 bậc | x = 16, 122, 228; y = 66; cạnh 76 |
| mũi tên | giữa khe, rộng 14, tâm y = 104, màu `ink`, opacity 0.7 |
| subIcons | chỉ `top-left`/`top-right`, cạnh 40, y = 6 |
| props | giữ nguyên #259: cạnh 40, y = 146 |

Quy tắc hạ cấp giống `compare`: mất hết bước ⇒ về `single` và ghi issue `steps`, chứ
không vẽ dải cụt. Một bước sai bị **bỏ** và các bước còn lại vẫn thành dải; nhiều hơn 2
bước thì bỏ phần thừa. `single` không được mang `steps`; `process` không được mang
`compareIcon`/`compareSign` — trường thừa bị bỏ và ghi issue.

### 3.3 `compare` — dữ liệu CÓ, hình CÓ, UI CÓ, prompt CÓ (#262)

```ts
// CÓ trong mã
layout: 'single' | 'compare';
compareIcon?: string;          // chủ thể PHẢI, khi layout = 'compare'
compareSign?: 'greater-than' | 'less-than' | 'equal';   // tuỳ chọn
```

Luật chuẩn hoá (đã có test):
- `layout` lạ → **`null`** (không có nghĩa an toàn nào).
- `compare` mà `compareIcon` thiếu / lạ / **trùng `mainIcon`** → hạ xuống **`single`**,
  ghi issue `compareIcon`. Hạ xuống chứ không `null`: ảnh vẫn cho thấy đúng thứ câu hỏi
  nói tới, còn ảnh trống thì không cho thấy gì.
- `compareSign` lạ → **bỏ dấu**, vẫn `compare` (hai chủ thể không dấu là ảnh hợp lệ).
- `single` mà có `compareIcon`/`compareSign` → **xoá hai trường**, ghi issue, để hai lần
  lưu giống nhau thì so sánh được.
- `subIcons` và `props` **không được trùng cả hai chủ thể**.

**Thứ tự bắt buộc cho P1:** dữ liệu → **vẽ** (engine + test toạ độ cho **hai** chủ thể) →
**UI editor** → cuối cùng mới đưa `compare` vào prompt §5. Lý do: prompt là lời hứa với
model; hứa một bố cục mà engine chưa vẽ được thì giáo viên nhận ảnh sai. Cổng
`scene-prompt-doc.test.ts` đã giữ đúng vai đó — và khi cả ba bước kia xong, nó được **nới
có chủ ý** để §5 được phép hứa `compare`.

**Hình học của `compare` (đã cài, đã đo bằng test):**

| Vùng | Toạ độ | Ghi chú |
|---|---|---|
| 2 icon góc | `y 6…46`, x `12…52` và `268…308`, cỡ **40px** | chỉ `top-left`/`top-right` tồn tại ở `compare` |
| chủ thể trái / phải | cỡ **92px**, x `42…134` / `186…278`, `y = subjectY + 12` | hạ 12px để dải góc phía trên trống |
| dấu so sánh | cỡ **24px**, x `148…172`, giữa hai chủ thể | vẽ bằng `<path>`/`<rect>`, **không** dùng `<text>` (offline không có font chắc chắn) |
| props mặt đất | `y 146…186` | không đổi so với #259, vừa chạm đáy dải chủ thể |

Dấu `left`/`right` cũ bị **dời lên** `top-left`/`top-right` chứ không bị bỏ (cùng nguyên tắc #256).

**P1 đã xong cả bốn tầng** (dữ liệu · hình · UI · prompt). Prompt §5 nay có `layout` hai
giá trị, `compareIcon`, `compareSign`, giới hạn 2 icon góc `top-left`/`top-right`, và **hai
ví dụ JSON thật** — cổng chạy chính hai ví dụ đó qua `normalizeSceneBlueprint` và đòi
**không một issue nào**, nên ví dụ mẫu không thể lạc khỏi engine.

**Đã xong ở #256 (tách khỏi P1/P2 vì không cần `layout` mới):**

```ts
// CÓ trong mã — `v` vẫn là 1 vì hình dạng cũ vẫn hợp lệ
subIcons?: { icon: string; position: 'left' | 'right' | 'top-left' | 'top-right' }[];
const SCENE_MAX_SUB_ICONS = 4;   // 2 -> 4
```

Chuỗi trần của P0 (`subIcons: ["leaf"]`) vẫn được nhận và được nâng lên dạng có góc,
nên `.egame` cũ và game đã lưu không phải chuyển đổi.

Khi P1/P2 mở các khoá còn lại, phải **thêm vào danh mục** và **giữ nguyên** 24 hash vàng
của các cảnh cũ.

---

## 4. Từ vựng asset (nguồn sự thật duy nhất)

### 4.1 Backdrop — 10 tên

| Tên | Cảnh |
|---|---|
| `plain` | Chân trời trống, không vật thể (mặc định khi tên sai) |
| `meadow` | Đồng cỏ |
| `forest` | Rừng |
| `mountain` | Núi, đồi |
| `sea` | Biển, sóng |
| `stars` | Bầu trời đêm, sao |
| `city` | Phố, nhà |
| `classroom` | Lớp học, bảng |
| `lab` | Phòng thí nghiệm |
| `studio` | Phòng thu / xưởng sáng tạo |

### 4.2 Icon — 41 tên

**24 icon đại diện category:** `paw-print`, `leaf`, `rocket`, `heart-pulse`, `car`,
`shield-check`, `recycle`, `landmark`, `map`, `briefcase`, `trophy`, `file-music`,
`palette`, `calculator`, `languages`, `flask-conical`, `cpu`, `stethoscope`, `users`,
`house`, `cloud-sun`, `apple`, `box`, `waves-horizontal`

**17 chủ thể cụ thể:** `book-open`, `lightbulb`, `star`, `clock`, `target`, `brain`,
`zap`, `sparkles`, `gift`, `pencil`, `mountain`, `fish`, `bird`, `bug`

**3 dòng người (#266):** `user`, `graduation-cap`, `hard-hat` — cảnh về "ai" cần một người
đứng trong cảnh chứ không chỉ một biểu tượng nhóm; dùng được ở `mainIcon`, `compareIcon`,
4 góc và 2 ô đất.

### 4.3 `paletteKey` — 24 khoá (= category)

`animals`, `plants`, `space`, `human-body`, `transport`, `safety`, `environment`,
`history`, `geography`, `jobs`, `sports`, `music`, `art`, `math`, `language`, `science`,
`technology`, `health`, `family`, `community`, `weather`, `food`, `objects`,
`water-world`

Mặc định khi tên sai: **`language`** (không phải `default-pastel` — tên đó không tồn tại).

### 4.4 Category → backdrop mặc định

| Category | Backdrop | Category | Backdrop |
|---|---|---|---|
| general | `plain` | music | `studio` |
| animals / plants | `forest` | art | `studio` |
| space | `stars` | math / language | `classroom` |
| human-body | `classroom` | science / technology | `lab` |
| transport / safety | `city` | health | `classroom` |
| environment | `mountain` | family | `meadow` |
| history / geography | `mountain` | community / jobs | `city` |
| sports | `meadow` | weather / food | `meadow` |
| objects | `classroom` | water-world | `sea` |

---

## 5. System prompt cho AI (P3 — CÓ kênh gọi, #265)

Prompt dưới đây là **nguồn sự thật** cho P3. Hai điều khoá nó lại:

1. Khối từ vựng nằm giữa hai mốc `SCENE-PROMPT-VOCAB:START/END`. Test
   `tests/unit/scene-prompt-doc.test.ts` đọc đúng khối đó và so **từng tên** với
   hằng số trong `src/shared/scene-asset-catalog.ts`. Thêm/bớt asset mà không sửa
   prompt là **đỏ**, nên tài liệu không thể trôi khỏi mã.
2. Cùng test đó **cấm** các tên đã sai của bản tài liệu cũ (`garden-day`,
   `night-sky`, `cat`, `tree`, `atom`, `default-pastel`…) và **cấm** chỉ dẫn sinh
   raw SVG (`<svg`, `<image`, `<script`, `viewBox=`) xuất hiện trong prompt.

### 5.1 Vì sao KHÔNG có nhánh "model xuất raw SVG"

Bản spec ban đầu (§2–§3) cho model trả **mã SVG**. Điều đó bị loại có chủ ý:
`AGENTS.md` ghi *"Do not execute arbitrary JavaScript/HTML generated by a model"*.
SVG nội tuyến **là** markup thực thi được — `<script>`, `<foreignObject>`,
`onload`, `href` ra mạng — nên một model trả sai một lần là hoặc XSS, hoặc cảnh
vỡ mà không cổng nào bắt được (chuỗi vẫn "hợp lệ").

Thay vào đó: model chỉ trả **JSON blueprint**; `normalizeSceneBlueprint` kiểm nó;
engine đã test (`composeSceneSvg`) vẽ ra SVG. Model không bao giờ chạm vào markup.

### 5.2 Prompt

```
Bạn là AI Scene Director của EduGame Studio. Đọc câu hỏi và các đáp án, rồi chọn
và sắp xếp thành phần từ KHO ASSET dưới đây thành một cảnh minh hoạ.

QUY TẮC BẮT BUỘC
1. CHỈ dùng đúng tên asset trong danh sách. Không bịa tên mới.
2. KHÔNG viết mã SVG, HTML hay markup. Chỉ trả JSON dữ liệu.
3. Trả về DUY NHẤT một khối JSON, không lời chào, không giải thích, không markdown.
4. Bắt buộc có "v": 1 và "layout" là "single", "compare" hoặc "process" — không có bố cục nào khác.
5. Không tham chiếu tài nguyên ngoài: không URL, không ảnh, không font, không script.
6. Tối đa 4 subIcons (chỉ 2 khi layout = compare hoặc process; KHÔNG có khi layout =
   surround); chúng phải KHÁC mainIcon và không trùng nhau.
7. Tối đa 2 props, KHÁC mainIcon, KHÁC mọi subIcons, KHÁC compareIcon VÀ khác mọi bước
   của process.
8. Toàn bộ JSON dưới 600 byte.
9. Chọn "compare" CHỈ khi câu hỏi thật sự so sánh hai đối tượng ngang hàng (lớn hơn,
   nhỏ hơn, bằng, nhiều hơn, ít hơn). Câu một đối tượng thì để "single".
10. Khi layout = "compare": mainIcon là hình BÊN TRÁI, compareIcon là hình BÊN PHẢI
   (bắt buộc, KHÁC mainIcon), compareSign là dấu ở giữa; chỉ được dùng góc
   top-left và top-right cho subIcons, vì hai góc dưới đã có hai hình.
11. Khi layout = "process": mainIcon là BƯỚC 1, "steps" là 1-2 bước tiếp theo theo
   ĐÚNG THỨ TỰ thời gian (bắt buộc, không trùng nhau, không trùng mainIcon); chỉ
   được dùng góc top-left và top-right cho subIcons. Process KHÔNG có compareIcon
   và KHÔNG có compareSign.
12. Khi layout = "surround": mainIcon là vật thể Ở GIỮA, "around" là 1-4 thứ đứng
   quanh nó (bắt buộc, không trùng nhau, không trùng mainIcon), xếp theo chiều kim
   đồng hồ từ góc trên-trái. Surround KHÔNG có subIcons, KHÔNG có steps, KHÔNG có dấu.

QUY TRÌNH SUY NGHĨ (làm trong đầu, KHÔNG viết ra)
1. Xác định môn học và ý chính của câu hỏi.
2. Chọn backdrop theo KHÔNG GIAN của câu hỏi (trong lớp → classroom, phòng thí
   nghiệm → lab, ngoài trời → meadow/forest/mountain, ban đêm → stars, biển → sea).
3. Chọn paletteKey theo CHỦ ĐỀ (khớp `contentCategory` của câu hỏi khi có).
4. Chọn mainIcon là vật thể TRUNG TÂM mà câu hỏi nói tới.
5. Chỉ thêm subIcons khi chúng làm rõ nghĩa (dụng cụ, đối tượng so sánh).
6. Nếu câu hỏi so sánh hai đối tượng (con nào lớn hơn, cái nào nặng hơn, nhiều hơn
   hay ít hơn): dùng layout "compare", đặt hai đối tượng vào mainIcon/compareIcon
   và chọn dấu đúng chiều đọc.
7. Nếu câu hỏi là một QUY TRÌNH 2-3 bước theo thứ tự (gieo hạt → nảy mầm, trứng →
   sâu → bướm): dùng layout "process", mainIcon là bước đầu và "steps" là các bước
   sau, đúng thứ tự. Quy trình dài hơn 3 bước hoặc không có thứ tự: giữ "single".
8. Nếu câu hỏi hỏi về MỘT vật và những thứ quanh nó (các bộ phận của cây, đồ vật
   trong phòng, con gì sống quanh ao): dùng layout "surround", mainIcon là vật ở
   giữa và "around" là những thứ còn lại, tối đa 4. KHÔNG tự bịa layout mới.

SCENE-PROMPT-VOCAB:START
layout (chọn 1): single, compare, process, surround
backdrop (chọn 1): plain, meadow, forest, mountain, sea, stars, city,
                   classroom, lab, studio
paletteKey (chọn 1): animals, plants, space, human-body, transport, safety,
                     environment, history, geography, jobs, sports, music, art,
                     math, language, science, technology, health, family,
                     community, weather, food, objects, water-world
mainIcon (chọn 1): paw-print, leaf, rocket, heart-pulse, car, shield-check,
                   recycle, landmark, map, briefcase, trophy, file-music, palette,
                   calculator, languages, flask-conical, cpu, stethoscope, users,
                   house, cloud-sun, apple, box, waves-horizontal, book-open,
                   lightbulb, star, clock, target, brain, zap, sparkles, gift,
                   pencil, mountain, fish, bird, bug, user, graduation-cap,
                   hard-hat
compareIcon (chỉ khi layout = compare): cùng danh sách trên, khác mainIcon.
   Đây là hình BÊN PHẢI; mainIcon là hình BÊN TRÁI.
Dấu so sánh đọc là: greater-than = ">" · less-than = "<" · equal = "=".
compareSign (chỉ khi layout = compare): greater-than, less-than, equal
steps (chỉ khi layout = process): 1-2 tên, là các bước SAU bước đầu; mainIcon là bước 1,
   xếp theo đúng thứ tự thời gian, khác mainIcon và khác nhau.
   Process không có compareIcon và không có compareSign.
around (chỉ khi layout = surround): 1-4 tên, là các thứ VÂY QUANH chủ thể; thứ tự là
   vòng theo chiều kim đồng hồ từ góc trên-trái. Khác mainIcon và khác nhau.
   Surround KHÔNG có subIcons (bốn góc đã là vòng), không có steps, không có dấu.
subIcons (0-4, tuỳ chọn; 0-2 khi compare): cùng danh sách trên, khác mainIcon,
   khác compareIcon, không lặp.
   Mỗi mục là {"icon": "<tên>", "position": "left|right|top-left|top-right"}.
   Bốn góc là chỗ duy nhất được đặt: left/right ngang tầm chân chủ thể,
   top-left/top-right phía trên, không bao giờ đè chủ thể.
   Khi layout = compare chỉ dùng top-left và top-right (góc dưới đã có hai hình;
   đặt left/right ở đó sẽ bị engine tự dời lên).
props (0-2, tuỳ chọn): cùng danh sách trên, là vật thể ĐỨNG Ở MẶT ĐẤT hai bên;
   khác mainIcon, khác mọi subIcons, khác compareIcon.
SCENE-PROMPT-VOCAB:END

ĐỊNH DẠNG ĐẦU RA (bốn ví dụ dưới đây là JSON THẬT, chạy được ngay)
Một hình:
{"v":1,"layout":"single","backdrop":"classroom","paletteKey":"math",
 "mainIcon":"calculator","subIcons":[{"icon":"pencil","position":"left"}],
 "props":["box"]}
So sánh hai hình:
{"v":1,"layout":"compare","backdrop":"forest","paletteKey":"animals",
 "mainIcon":"paw-print","compareIcon":"fish","compareSign":"greater-than",
 "subIcons":[{"icon":"leaf","position":"top-right"}],"props":["apple"]}
Quy trình ba bước:
{"v":1,"layout":"process","backdrop":"meadow","paletteKey":"plants",
 "mainIcon":"leaf","steps":["apple","box"],
 "subIcons":[{"icon":"cloud-sun","position":"top-right"}]}
Vật thể vây quanh:
{"v":1,"layout":"surround","backdrop":"classroom","paletteKey":"math",
 "mainIcon":"box","around":["apple","pencil","fish"],"props":["leaf"]}
```

### 5.3 Cảnh được vẽ thế nào từ JSON đó

Prompt không mô tả toạ độ, vì model không được chọn toạ độ. Engine vẽ theo 7 lớp
cố định, đúng thứ tự chồng (mỗi lớp nhận **một hoặc nhiều primitive**):

| Lớp | Nội dung | Do cái gì quyết định |
|---|---|---|
| `sky` | bầu trời, mặt trời, mây, sao | `backdrop` |
| `far` | đồi, núi, đường chân trời ở `y = 150`, biển | `backdrop` |
| `mid` | cây, bụi, toà nhà, sách, dụng cụ | `backdrop` |
| `halo` | quầng sáng sau chủ thể | `paletteKey` |
| `subject` | **mainIcon** 120px đúng giữa khung; ở `compare` là hai hình **92px** ở hai bên, hạ 12px | `mainIcon`, `compareIcon` |
| `props` | tới 4 subIcons 52px + tới 2 props 40px; `left`/`right` ngang tầm chân, `top-left`/`top-right` phía trên; không đè chủ thể (ở `compare`: icon góc 40px, chỉ hai góc trên) | `subIcons[].position`, `props[]` |
| `sign` | **chỉ có ở `compare`**: dấu 24px ở giữa hai hình, vẽ bằng nét — không dùng chữ | `compareSign` |
| `fg` | cỏ, rễ, đá, sóng, bảng | `backdrop` |

Khung vẽ là `viewBox="0 0 320 200"` do engine đặt, **không** do model đặt — nên
quy tắc "bắt buộc viewBox 320×200" của spec ban đầu được thoả ở tầng engine chứ
không phải bằng lời dặn model. Màu cũng vậy: 24 palette trong mã, không phải hex
model tự chọn, nên không có nguy cơ màu neon hay màu chói.


---

## 6. Cổng kiểm duyệt

Hàm: `normalizeSceneBlueprint(input, issues?)` trong `src/shared/scene-blueprint.ts`.
Nó **tổng** (total) và **không bao giờ ném lỗi** — nhận object hoặc chuỗi JSON, luôn
trả `SceneBlueprint | null`.

| Đầu vào | Kết quả | Issue |
|---|---|---|
| object hoặc chuỗi JSON | nhận cả hai | — |
| chuỗi rỗng | `null` | `empty` |
| JSON không parse được | `null` | `json` |
| `null` / `undefined` / mảng / số | `null` | `shape` |
| thiếu `v` hoặc `v ≠ 1` | `null` | `version` |
| `layout` khác `'single'` | `null` | `layout` |
| `mainIcon` không có trong 41 icon | `null` | `icon` |
| `backdrop` lạ | lùi về `plain`, **giữ cảnh** | `backdrop` |
| `paletteKey` lạ | lùi về `language`, **giữ cảnh** | `palette` |
| `subIcons` sai / trùng / trùng mainIcon / quá 2 | bỏ từng id sai, cắt còn 2 | `subIcons` |
| JSON > 600 byte | `null` (kiểm cả chuỗi thô và object đã serialize) | `size` |
| khoá lạ, kể cả `__proto__` | bỏ qua, chỉ đọc 6 khoá đã khai | — |

Bất biến có test: `normalize(normalize(x))` bằng `normalize(x)`; cùng blueprint →
cùng chuỗi SVG.

---

## 7. Cổng kiểm thử

| Cổng | Nội dung |
|---|---|
| `tests/unit/scene-blueprint.test.ts` | Rác không ném lỗi, idempotent, mọi giới hạn, version gate, parity `vm` với renderer |
| `tests/unit/scene-catalog.test.ts` | Mọi icon ∈ `ICON_NODES`; palette = 24 khoá; mọi backdrop dùng primitive có thật |
| `tests/unit/illustration-registry.test.ts` | **24 hash vàng** — cảnh cũ phải ra **từng byte** như trước #252 |
| `tests/unit/game-package.test.ts` | Blueprint sống qua xuất→nhập; blueprint hỏng bị bỏ mà không hỏng gói |
| `tests/ui/ui-item-assets-editor-check.js` | 14 check #252 trên binary release thật |

**P1/P2 phải thêm:** mỗi bố cục mới có bài vẽ riêng + hash vàng riêng **trước** khi mở
cho model, và một phép đo dung lượng `.egame` thật trên bộ game lớn.

---

## 8. Những chỗ bản tài liệu cũ đã sai (đừng lặp lại)

| Bản cũ ghi | Thực tế trong mã |
|---|---|
| `backdrop: "garden-day" / "night-sky" / "lab-science" / "nature-hills" / "ocean-sea" / "default-scene"` | Không tồn tại. Dùng `forest`, `stars`, `lab`, `mountain`, `sea`, `plain` |
| Icon `cat`, `dog`, `tree`, `flower`, `water-drop`, `sun`, `cloud`, `atom`, `flask-triangle`, `ruler`, `gear`, `question-mark`, `arrow-right` | Không tồn tại. Dùng `paw-print`, `leaf`, `fish`, `bird`, `bug`, `cloud-sun`, `flask-conical`, `calculator`, `target`… |
| `paletteKey: "default-pastel"` | Không tồn tại. Mặc định là **`language`** |
| Schema **không có** `v` | `v: 1` là **bắt buộc** |
| `subIcons: {icon, position}[]` | P0 dùng **`string[]`**, tối đa 2 |
| `props: string[]` | **Không có** trường nào và không có primitive vẽ |
| Kiểm duyệt ở `asset-validation.ts` | Hàm thật ở **`scene-blueprint.ts`**; `asset-validation.ts` chỉ gọi |
| `layout` có 4 kiểu ngay | P0 **chỉ `'single'`** |
| Nút "✨ Gợi ý cảnh từ nội dung" | P0 là nút **"Cảnh thử"**, không gọi mạng. P3 mới đổi tên |
