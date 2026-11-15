# Thiết kế kỹ thuật — AI Scene Director (EduGame Studio)

> **Trạng thái tài liệu.** Bản này thay cho bản "Tài liệu Thiết kế Kỹ thuật" cũ, vốn dùng
> tên asset **không tồn tại** trong mã. Mọi tên trong tài liệu này lấy trực tiếp từ
> `src/shared/scene-asset-catalog.ts` và đã được đốt bằng test.
>
> **Đã có trong mã:** P0 (quyết định #252) — blueprint `v:1`, `layout: 'single'`, cổng
> chuẩn hoá, lưu `.egame`, nút "Cảnh thử" **không gọi mạng**.
> **Chưa có:** `compare`/`process`/`surround` (P1/P2), `props`, `subIcons` có vị trí,
> và **toàn bộ kênh AI** (P3). Các mục đó ghi rõ "CHƯA CÓ" bên dưới.

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

**P3 — CHƯA CÓ.** Bước 2 đổi thành "✨ Gợi ý cảnh từ nội dung": gửi nội dung câu hỏi +
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
  mainIcon: string;        // một trong 38 tên ở §4.2. Sai -> null (không có chủ thể thì không có cảnh)
  subIcons?: string[];     // tối đa 2, phải ∈ 38 icon, không trùng mainIcon, không trùng nhau
}
```

Điểm phải nhớ: **`v` là bắt buộc.** Bản tài liệu cũ bỏ trường này, nên mọi blueprint
do model sinh ra sẽ bị chặn ở cổng `version`.

### 3.2 Hình dạng DỰ KIẾN — CHƯA CÓ trong mã

Chỉ ghi để P1/P2 không phải thiết kế lại. **Không** dùng để viết prompt ở P3 trước khi
các bố cục này được cài và đo.

```ts
// CHƯA CÓ — P1/P2
layout?: 'compare' | 'process' | 'surround';
subIcons?: { icon: string; position: 'left' | 'right' | 'center' | 'floating' }[];
props?: string[];   // CHƯA CÓ, và chưa có primitive vẽ nào cho nó
```

Khi P1/P2 mở các khoá này, phải **thêm vào danh mục** và **giữ nguyên** 24 hash vàng
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

### 4.2 Icon — 38 tên

**24 icon đại diện category:** `paw-print`, `leaf`, `rocket`, `heart-pulse`, `car`,
`shield-check`, `recycle`, `landmark`, `map`, `briefcase`, `trophy`, `file-music`,
`palette`, `calculator`, `languages`, `flask-conical`, `cpu`, `stethoscope`, `users`,
`house`, `cloud-sun`, `apple`, `box`, `waves-horizontal`

**14 chủ thể cụ thể:** `book-open`, `lightbulb`, `star`, `clock`, `target`, `brain`,
`zap`, `sparkles`, `gift`, `pencil`, `mountain`, `fish`, `bird`, `bug`

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

## 5. System prompt cho AI (P3 — CHƯA CÓ kênh gọi)

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
4. Bắt buộc có "v": 1 và "layout": "single".
5. Không tham chiếu tài nguyên ngoài: không URL, không ảnh, không font, không script.
6. Tối đa 2 subIcons; chúng phải KHÁC mainIcon và không trùng nhau.
7. Toàn bộ JSON dưới 600 byte.

QUY TRÌNH SUY NGHĨ (làm trong đầu, KHÔNG viết ra)
1. Xác định môn học và ý chính của câu hỏi.
2. Chọn backdrop theo KHÔNG GIAN của câu hỏi (trong lớp → classroom, phòng thí
   nghiệm → lab, ngoài trời → meadow/forest/mountain, ban đêm → stars, biển → sea).
3. Chọn paletteKey theo CHỦ ĐỀ (khớp `contentCategory` của câu hỏi khi có).
4. Chọn mainIcon là vật thể TRUNG TÂM mà câu hỏi nói tới.
5. Chỉ thêm subIcons khi chúng làm rõ nghĩa (dụng cụ, đối tượng so sánh).
6. Nếu câu hỏi cần bố cục so sánh/quy trình mà "layout" chỉ có "single": giữ
   "single" và dùng tối đa 2 subIcons để gợi ý. KHÔNG tự bịa layout mới.

SCENE-PROMPT-VOCAB:START
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
                   pencil, mountain, fish, bird, bug
subIcons (0-2, tuỳ chọn): cùng danh sách trên, khác mainIcon, không lặp.
SCENE-PROMPT-VOCAB:END

ĐỊNH DẠNG ĐẦU RA
{"v":1,"layout":"single","backdrop":"...","paletteKey":"...","mainIcon":"...","subIcons":["..."]}
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
| `subject` | **mainIcon**, 120px, đúng giữa khung | `mainIcon` |
| `props` | 2 subIcons 52px ở hai góc dưới | `subIcons` |
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
| `mainIcon` không có trong 38 icon | `null` | `icon` |
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
