## Handoff - DaisyUI: cai dat an toan + don chien tranh do uu tien + sua check do sai (2026-10-26)

**TL;DR:** daisyUI 5.7.50 da duoc cai **an toan** (prefix `d-`, theme rieng map vao 10 token cua app, chi 12 component, khong base style toan cuc) va da chung minh **khong doi mot pixel nao**: 103.272 ky tu dau cua CSS build giong het ban khong co plugin. Nhung thu that su sua loi "chat tren may chieu" la viec **don CSS**, khong phai thu vien: `.answer-option` tung duoc khai **6 lan**, `.stage-center` **8 lan**, moi ban sau chi de de ban truoc. Da don ve **mot dinh nghia moi selector**. Them vao do, 2 loi **1280px** cua `ui-fullscreen-density-check` tu truoc khong phai loi san pham ma la **check do sai tu #84** (do cot chu thay vi do ca hang 2 cot) - da sua va dua check ve **9/9**. Chi tiet: **#87** va **#88** trong `docs/DECISIONS.md`.

1. **Files changed.**
   - `package.json` / `package-lock.json` - them devDependency `daisyui@5.7.50` (plugin CSS thuan, khong nap JS nao).
   - `src/renderer/styles/app.css` - (a) 2 khoi `@plugin "daisyui"` + `@plugin "daisyui/theme"`; (b) 6 dong `@source inline(...)`; (c) don 6 ban de `.answer-option` va 2 ban de `.answer-grid` ve mot cho; (d) nang san chu dap an o cua so thuong tu **15px len 18px** (`@media max-height:800px`); (e) moi khoi bi xoa de lai comment ghi so dong cu.
   - `src/renderer/features/gameplay.ts` - them `data-game="quiz|scenario|matching|treasure|race|team-setup"` cho **11/11** `.game-stage`.
   - `tests/ui/ui-fullscreen-density-check.js` - do **ca hang noi dung** (cot minh hoa + cot chu) thay vi do moi `.stage-question`, va them assertion **moi** "cot chu chiem >= 50% be rong cua so".
   - `docs/DECISIONS.md` - them **#87**, **#88**; `docs/STATUS.md` - muc nay.

2. **Behavior implemented.**
   - **Khong doi gi** ve giao dien: chung minh bang diff CSS (103.272 ky tu dau giong het; khac biet duy nhat la 1 `@keyframes progress` thua, 53 ky tu).
   - **Chu dap an o cua so laptop thap (1366x768 khong toan man hinh) tu 15px len 18px** - dung con so giao vien phan nan. Day la thay doi giao dien **duy nhat** va la **co chu dich**.
   - Selector nao cung chi con **mot** dinh nghia -> sua CSS khong con phai them ban de moi lan.
   - daisyUI component **da san sang dung that** (truoc day class `d-*` khong he duoc sinh ra: do duoc `d-card` radius `0px`).

3. **Commands run.**
   - `npm i -D daisyui@5.7.50` -> exit 0. `npm audit` xac nhan cac lo hong deu thuoc `electron` / `electron-builder` / `tar` (**co tu truoc**), khong co muc nao cua daisyui.
   - `npm run build:css` -> **exit 0** sau moi buoc.
   - `npm run check` -> **exit 0**. `npm test` -> **exit 0** (`34 scripts, 502 declared functions, 4221 call sites - no undefined globals`).
   - App that, 1 port, chay **tuan tu** (moi lan chay lai app tu dau): `ui-play-surface-check` **156/156**, `ui-stage-illustration-check` **94/94**, `ui-race-treasure-check` **19/19**, `ui-fullscreen-density-check` **9/9** (truoc la 7/9).
   - Kiem nguoc cho assertion moi (do trong DOM that): bop `.stage-center` + `.answer-grid` ve `1040px` -> hang noi dung tut **1189 -> 1040px** so voi nguong 1101px, tuc assertion **do dung loi no cam ket bat**; guard cot chu van xanh (807px > 640px).

4. **Ba loi toi tu gay ra va da sua (ghi lai vi chung la bai hoc).**
   - Gop ban de nhung lay gia tri cua ban **dau tien** thay vi ban **dang thang** -> treasure tran 88px / 362-373px, `ui-play-surface-check` **152/156**.
   - Lay `padding` tu ban 939 thay vi ban 1368 -> o dap an cao them 10px, `.stage-bottom` bi day **14px** ra ngoai, `ui-stage-illustration-check` **93/94**.
   - Doi `:has(...)` sang `[data-game="treasure"]` -> **Tailwind v4 xoa han rule** vi gia tri thuoc tinh la **dong**, khong xuat hien nguyen van trong file nao. Da tra ve `:has()`.

5. **Unverified.**
   - Chua chay tren may chieu that (toan bo do qua `Emulation.setDeviceMetricsOverride`).
   - **Chua co man nao dung daisyUI that** - component da duoc sinh CSS va tinh dung style, nhung chua dua vao markup, nen "nhin co dep khong" **chua tra loi duoc**. E6 chi lam phan ha tang.
   - `ui-race-treasure-check` ra **16/19** khi cua so OS la **1920x1080** thay vi may chieu 1366x768 (track 40 o vua 121px nen khong "engage the cap"; treasure khong con gi de cuon). Da A/B bang `git stash`: **giong het tren HEAD chua sua**, nen day la **fixture phu thuoc cua so OS**, khong phai hoi quy. Cach sua dung: cho check do tu goi `Emulation.setDeviceMetricsOverride` nhu 3 check kia.

6. **Next recommended task.**
   - **E6 that su:** ap `d-card` / `d-badge` / `d-progress` / `d-steps` vao **mot** man (de xuat: the chang cua `treasure-hunt`) roi chup anh o 1366x768 va 1920x1080, doi chieu voi `ui-play-surface-check` + `ui-race-treasure-check`. Chi mo rong sang 4 man con lai khi man dau tien da xanh va da duoc nhin bang mat.
   - Cho `ui-race-treasure-check` tu dat viewport -> het phu thuoc kich thuoc cua so OS.

---


## Handoff - Pha B (tiep): kho bau la man CUON theo hop dong, race da do lai (2026-10-25)

**TL;DR:** Da retract con so **"treasure 0/0"** cua #85 - no sai. Do lai bang fixture that cua check: tran **~237-355px** o 1366x768 va **~56px** o 1920x1080, va **khong the** dua ve 0 ma khong xoa chu cua giao vien. Nhung ben duoi co **1 loi that** da sua: `.stage-center` bi bop con **415px** trong khi cot con can **656px**, nen phan tran **241px** nam NGOAI vung cuon -> khong bao gio cuon toi duoc, va nhan tren ban do bi cat. `race` cung da do lai: **tran 0px** o ca 2 do phan giai. Chi tiet: **#86** trong `docs/DECISIONS.md`.

1. **Files changed.**
   - `src/renderer/styles/app.css` - `html[data-fullscreen="1"] .modal[data-player-theme] .stage-center:has(> .stage-col.is-main > #treasureMission) { flex-shrink: 0 }`. Chi bo kha nang CO, khong khoa chieu cao (bai hoc #85 muc 3).
   - `tests/ui/ui-play-surface-check.js` - (a) khoi treasure viet lai theo hop dong "cuon duoc" thay cho "khong tran"; (b) them assertion `no column spills past its scroll container`; (c) them fixture + 4 luot do `race` o 2 do phan giai.
   - `docs/DECISIONS.md` - them **#86**; sua lai #85 muc Verification (retract `0/0`).
   - `docs/STATUS.md` - muc nay.
   - Da xoa `tests/ui/tmp-boot-probe.js`, `tmp-tr-budget.js`, `tmp-tr-budget12.js`.

2. **Behavior implemented.**
   - Man kho bau o 1366x768 **cuon duoc** (stage la vung cuon), moi dap an + nut cuoi + toan bo hanh trinh deu toi duoc, trang **khong** cuon kep (`docHeight == viewport`), ban do **khong** bi bop (`flex-shrink: 0`), **khong** cot nao tran ra ngoai vung cuon cua no.
   - `race`: 40 o + 4 dap an dai **van vua** man o ca 2 do phan giai; gio da duoc assert.

3. **Commands run.**
   - `npm run check` -> **exit 0**; `npm test` -> **exit 0**.
   - App that, 1 port, chay lien tiep: `ui-play-surface-check` **156/156**, `ui-race-treasure-check` **19/19**, `ui-stage-illustration-check` **94/94**, `ui-fullscreen-density-check` **7/9** (2 fail 1280px la co tu truoc, khong doi), `ui-item-assets-editor-check` **21/27** (dung baseline).
   - Kiem nguoc (A/B): doi `flex-shrink: 0 -> 1`, build lai, chay lai -> **126/130, exit 1**, bao `stage-col is-main` tran **359px** khoi hop **415px**.

4. **Unverified.**
   - Chua chay tren may chieu that (toan bo do qua `Emulation.setDeviceMetricsOverride`).
   - Cam giac **cuon** man kho bau trong gio hoc: check chi chung minh "toi duoc", khong chung minh giao vien thay chap nhan duoc - can hoi trong pilot.
   - #85 tung ghi `treasure 0/0`; con so **0px** trong muc STATUS cua #85 phai doc kem **#86**.

5. **Next recommended task.**
   - Thay "tran bang 0" bang mot **ngan sach chieu cao** cho kho bau (vi du: canh bao trong editor khi story + taskDescription + dap an vuot muc ma mot man 768px cuon 1 lan), de giao vien biet truoc thay vi gap man phai cuon.
   - Sau do: commit toan bo Pha A + B + #84 + #85 + #86 (hien **tat ca con chua commit**).

---


## Handoff - Pha B: dong het phan tran cua man cho (treasure 0px, quiz 0px) (2026-10-25)

**TL;DR:** Da dong **ca hai** loi may chieu con lai cua Pha B. `treasure-hunt` tran **311px** (luc phat hien) / **124px** (sau #84) va bay gio **0px**; quiz la **0px** o ca 2 do phan giai, ca luc chua va luc da tra loi. `ui-stage-illustration-check` tu **90/94** len **94/94** (lan dau tien xanh hoan toan). Chi tiet quyet dinh: **#85** trong `docs/DECISIONS.md`.

Nguyen nhan khong phai "qua nhieu noi dung" ma la **3 dai trong rieng biet**, do truoc khi sua:

| | 1366x768 | 1920x1080 |
|---|---|---|
| `.stage-center` co | 594px | 887px |
| noi dung dung toi | 611 (khung 737) => **149px chet** | 663 => **224px chet** |
| khoang cau hoi -> dap an | **0px** (cung bat dau y=337) | **0px** |
| chieu cao o dap an | 123px | **150px, bi chan boi `16vh`** |
| hop `.treasure-map` | 190px cho **124px noi dung** | nhu tren |

1. **Files changed.**
   - `src/renderer/styles/app.css` - (a) `.stage-col.is-main > .answer-grid` tro thanh noi NHAN chieu cao thua (`flex: 1 1 auto` + `grid-auto-rows: minmax(min-content, 1fr)`); (b) cot chu `height: 100%` (co guard) de that su co phan du; (c) trang thai da-tra-loi tra lai chieu cao (`:has(> #answerFeedback:not(:empty))`); (d) `.treasure-map` `min-height: auto` + `flex-shrink: 0` (truoc do bi bop 120px cho 143px noi dung va `overflow: hidden` **cat mat nhan "Trac nghiem"**); (e) storyline dung het be rong cot thay vi 221px giua khoang trong; (f) `#treasureExtra` dat canh nhau thay vi chong 2 hang.
   - `src/renderer/features/treasure-art.ts` - 6 hinh nen doi `preserveAspectRatio` tu `slice` sang `meet`. Voi `slice` trong hop 1800x149, tranh 1200x420 bi ve thanh 1800x**630** va `<rect>` nen nam o **y = -74** - dung phan tu ma check bao "outside the viewport".
   - `docs/DECISIONS.md` - them **#85** (Chosen / Rejected / Trap / Verification). #84 cap nhat lai ghi chu "con fail co y".
   - `docs/STATUS.md` - muc nay.

2. **Behavior implemented.**
   - O dap an cao theo cho trong thuc te (1920: hang 150 -> **301px**), khong con chan cung `16vh`; sau khi tra loi thi nhuong lai cho phan hoi + nut "Tiep tuc" (o ve 78px, **khong cat chu**: `scrollHeight 74 = clientHeight 74`).
   - Cau hoi va dap an khong con dinh nhau: co khoang 16px (truoc la 0px).
   - `treasure-hunt`: ban do cao dung bang noi dung, khong cat nhan; **khong bo chu nao** tren man.

3. **Commands run.**
   - `npm run check` -> **exit 0**.
   - `npm test` -> **exit 0** (`check-renderer-undefined-globals: 34 scripts, 502 declared functions, 4221 call sites`).
   - `node tests/ui/ui-play-surface-check.js 9377` -> **82/82** (`outside 0`, `scrolls false`, `clipped 0` o ca 4 luot do, ke ca 2 luot DA TRA LOI).
   - `node tests/ui/ui-stage-illustration-check.js 9377` -> **94/94** (truoc: 90/94).
   - `node tests/ui/ui-item-assets-editor-check.js 9377` -> **21/27**, **giong het baseline** (6 fail la `brand-sub` 8px + tran viewport cua trang editor, khong lien quan man cho).

4. **Unverified.**
   - Chua chay tren may chieu that; toan bo do qua `Emulation.setDeviceMetricsOverride`.
   - Ban do kho bau voi **hanh trinh dai** (10+ chang) o 1366x768: fixture chi co 1 chang, nen `flex-shrink: 0` cho ban do cao la **suy luan**, chua do.
   - `race` dung chung khoi 2 cot nhung **chua do lai** sau thay doi nay.
   - `ui-item-assets-editor-check` **21/27**: con so **27/27** o handoff Pha B khong tai lap duoc; coi la ghi sai, khong phai muc tieu.

5. **Next recommended task.**
   - Do lai `race` o ca 2 do phan giai (dung chung khoi 2 cot; guard `height: 100%` chi loai tru treasure).
   - Them fixture "hanh trinh dai" (10+ chang) cho `treasure-hunt` de chot hanh vi `flex-shrink: 0`.
   - Con treo tu truoc: commit toan bo (Pha A + Pha B + #84 + #85).


# Current Project Status — v0.3
## Handoff — Bo cuc 2 cot cho stage: sua 5/6 loi may chieu (2026-10-25)

**TL;DR:** Da sua **goc** cua 5 trong 6 loi may chieu ma Pha B phat hien. Cach sua: dua anh minh hoa sang **canh** cau hoi thay vi **tren** cau hoi. Anh SVG 320x200 dang tieu 200px cua TRUC KHAN HIEM (chieu cao ~683px) trong khi TRUC DU THUA (chieu rong 1255px) gan nhu bo trong. Do truoc khi sua, bang cach mo phong bo cuc 2 cot trong DOM that:

| Viewport | 1 cot (truoc) | 2 cot (sau) |
|---|---|---|
| 1366x768 | tran **67px** | **0px** (cot chu 1023px) |
| 1440x900 | tran **15px** | **0px** (cot chu 1080px) |
| 1920x1080 | 0 | 0 (cot chu 1467px) |

Ket qua check sau khi sua:

| Check | Truoc | Sau |
|---|---|---|
| `ui-play-surface-check` | 78/80 | **82/82** |
| `ui-stage-illustration-check` | 90/94 | **92/94** |
| `ui-item-assets-editor-check` | 27/27 (do luc do) | 21/27 — **gio da xac nhan baseline cung 21/27**, xem muc 5 |

Loi con lai (2 fail cua illustration check) la **treasure-hunt**: tran giam tu **311px xuong 124px** nhung chua het, vi ban do kho bau (`min-height:190px`) + storyline van chiem chieu doc phia tren. Day la loi that, **co y de fail**, khong noi nguong.

1. **Files changed.**
   - `src/renderer/styles/app.css` — (a) khoi `/* === Bo cuc 2 cot ... */`: `.stage-center > .stage-col { display: contents }` mac dinh (1 cot, khong doi 1 pixel), roi `@media (min-width: 1180px)` bat 2 cot khi `data-fullscreen`; (b) `html[data-fullscreen="1"] #modalRoot { position: fixed; inset: 0 }` — sua loi **co san** khien `#modalRoot` bi day xuong `top: 1436` tren viewport 768.
   - `src/renderer/features/gameplay.ts` — boc DOM o **5 call site** thanh `<div class="stage-col">` (anh) + `<div class="stage-col is-main">` (chu). Day la thay doi **bat buoc**: CSS thuan khong gop duoc 5-11 flex-item thanh mot cot. Da thu `flex: 1 1 0` tran -> cau hoi bi bop con 174px, cao 1294px, tran **684px** (te hon truoc khi sua); da revert.
   - `tests/ui/ui-play-surface-check.js` — assertion "content uses most of the width" do khoi **anh + chu** thay vi rieng cau hoi (voi 2 cot, cau hoi hep di la co y), them assertion moi "text column still readable (>=50% viewport)".
   - `tests/ui/ui-stage-illustration-check.js` — `isSiblingOfQuestion` so voi khoi chua cau hoi thay vi doi hoi cung parent; `probe` mo game voi `{ fullscreen: true }` (truoc do mo khong fullscreen nen `.app-shell` cao 1436px lam moi assertion viewport fail vinh vien).
   - `docs/DECISIONS.md` — them #84. `docs/STATUS.md` — muc nay.

2. **Behavior implemented.**
   - Tu 1180px chieu rong va chi khi trinh chieu: anh minh hoa thanh cot trai (200-300px, treasure 170-240px), chu thanh cot phai. Duoi nguong do: bo cuc **1 cot y nhu cu** (kiem chung: 1179x768 va 1024x700 van `flex-direction: column`).
   - Anh dung `px` tuyet doi, **khong** dung `%`: `width: min(320px, 46%)` cua rule goc la 46% cua container, trong cot hep se lam canh bi letterbox (dung loi #70: canh ve o ~150x94).
   - `#modalRoot` o che do trinh chieu chuyen sang `position: fixed` — no chi chua `.modal-backdrop` (da `fixed`), nen khong gi nhin thay phu thuoc vao viec no nam trong luong.

3. **Commands run.**
   - `npm run check` (tsc --noEmit) -> **exit 0**.
   - `npm test` -> **exit 0** (gom `check-renderer-globals: 34 scripts, 502 declared functions, 4221 call sites — no undefined globals`; quan trong vi da sua DOM trong `gameplay.ts`).
   - `node tests/ui/ui-play-surface-check.js 9380` -> **82/82**, exit 0, `outside 0` o ca 4 luot do.
   - `node tests/ui/ui-stage-illustration-check.js 9380` -> **92/94**, exit 1 (2 fail = treasure-hunt, loi that).
   - `node tests/ui/ui-item-assets-editor-check.js 9380` -> **21/27**, exit 1.
   - Anh chup xac nhan: `tests/ui/shots/stage-2col-quiz-1366x768.png` (2 cot, khong tran).

4. **Unverified.**
   - `treasure-hunt` van tran **124px** o 1366x768 va **55px** o 1920x1080 (mot `<rect>` cua SVG bi day len tren). Chua sua.
   - `ui-item-assets-editor-check` **21/27**: 6 fail la `brand-sub` 8px + tran viewport cua trang editor. Da chay **stash A/B** tren code goc: baseline cung **21/27, cung 6 fail**. Vay day la trang thai co san, khong phai hoi quy — nhung con so **27/27** ghi o handoff Pha B **khong tai lap duoc** o trang thai hien tai; can xac dinh lai truoc khi tin con so do.
   - Chua chay tren may chieu that; toan bo do qua `Emulation.setDeviceMetricsOverride`.
   - Nut "Trinh chieu" xuong 2 dong o 1366x768: **van khong co assertion** (da co dong nay tu Pha B).

5. **Next recommended task.**
   - Sua `treasure-hunt` (124px): `min-height:190px` cua `.treasure-map` va khoi `.treasure-storyline` la hai thu chi phi chieu doc lon nhat con lai; hoac thu nho ban do khi `max-height` thap, hoac dua storyline vao cot phai.
   - Xac dinh lai trang thai dung cua `ui-item-assets-editor-check` (27/27 hay 21/27) va ghi lai so dung.

## Handoff — Pha B: pho cap luoi do UI o 2 do phan giai that (2026-10-25)

**TL;DR:** Da dua "do o dung do phan giai + chup anh" thanh mot ham dung chung (`measureAt()` trong `tests/ui/lib/screenshot-capture.js`), roi retrofit **3 check** len **1920x1080 + 1366x768**. Ket qua khong chi la ha tang: no **bat duoc 6 loi that** ma truoc day khong the thay, vi check cu do o kich thuoc cua so bat ky.

Nhung loi moi bat duoc — tat ca deu la loi THAT cua san pham, khong phai loi test:

| Man hinh | Do phan giai | Loi |
|---|---|---|
| `treasure-hunt` | 1366x768 | `.game-stage` tran **311px** xuong duoi, **24 element** bi che; anh chup cho thay **toan bo dap an nam ngoai man hinh** |
| `treasure-hunt` | 1920x1080 | `.game-stage` tran **93px** |
| `race` | 1366x768 | `.game-stage` tran **116px**, 13 element |
| `scenario` | 1366x768 | `.game-stage` tran **25px** |
| play surface (quiz) | 1366x768 | hang dap an C/D tran **52px** xuong duoi (bottom 820 > viewport 768) |
| nut "Trinh chieu" | 1366x768 | nhan bi xuong **2 dong** (chi thay trong anh chup) |

Tong ket: `ui-play-surface-check` **78/80**, `ui-stage-illustration-check` **90/94**, `ui-item-assets-editor-check` **27/27**. Toan bo assertion cu (27 cua play-surface, 13 cua editor, 60 assertion ve mode minh hoa) van giu nguyen va van xanh.

1. **Files changed.**
   - `tests/ui/lib/screenshot-capture.js` — them `measureAt()` (khoa viewport, cho viewport *that su* doi, settle animation, do, chup PNG, roi tu ap 5 assertion projector), `assertLayout()`, `setViewportAndWait()`. Sua probe `MEASURE_LAYOUT` de chi dem phan tu **that su duoc ve**.
   - `tests/ui/ui-play-surface-check.js` — retrofit: chay o ca 2 do phan giai, chup 4 PNG, giu 27 assertion cu.
   - `tests/ui/ui-stage-illustration-check.js` — them luot do layout o ca 2 do phan giai cho ca 5 template.
   - `tests/ui/ui-item-assets-editor-check.js` — them luot do layout o ca 2 do phan giai.
   - `package.json` — them script `check:play-surface-ui` (truoc day **khong co** script nao cho file nay).
   - `docs/STATUS.md` — muc handoff nay. `docs/DECISIONS.md` — them #83.

2. **Behavior implemented.** Chi test; **khong doi hanh vi san pham**.
   - Mot call `measureAt()` = khoa viewport, cho viewport that su doi, settle animation, do, chup PNG, va ap 5 assertion: san font, khong clipping, khong tran viewport, khong scroll trang, khong vung scroll noi bo (tuy chon: khong chong lan question/answer).
   - Assertion bao **ten phan tu + so px tran**, vi du `{"tag":"div","cls":"game-stage","pastBy":311}` — nen loi "chu 12px" lan sau tu chi ra nguyen nhan.

3. **Commands run.**
   - `npm test` → **exit 0** (gom `unload-guard`, `renderer-load-order`, `check-renderer-undefined-globals: 34 scripts / 4221 call sites`).
   - `node tests/ui/ui-play-surface-check.js 9371` → **78/80**, exit 1 (2 fail = loi that o 1366x768).
   - `node tests/ui/ui-stage-illustration-check.js 9372` → **90/94**, exit 1 (4 fail = loi that).
   - `node tests/ui/ui-item-assets-editor-check.js 9372` → **27/27 passed**, exit 0.
   - 16 file PNG sinh ra trong `tests/ui/shots/` (da nam trong `.gitignore`).

4. **Unverified.**
   - Chua sua loi layout nao — Pha B chi *do* chu khong *chua*. Cac con so tren la ket qua do, chua ai quyet dinh sua the nao.
   - Nut "Trinh chieu" bi xuong 2 dong: chi thay bang mat tren anh chup, **khong co assertion** nao bat; neu muon chan tai phat thi phai them.
   - Gia dinh (co chu y): chat luong "dep" van can mat nguoi xem PNG; assertion chi bat duoc clipping/tran/scroll.

5. **Next recommended task.**
   - **Sua loi `treasure-hunt` + `race` tran stage o 1366x768** — nang nhat (311px, mat toan bo dap an). Day la loi projector that, dung uu tien.
   - Sau do: hang dap an C/D o play surface 1366x768 (52px).
   - Tuy chon re: sua **mojibake** (`Ã`/`Â`) dang lan rong trong `app.css` va `docs/`.

---
## Handoff — Pha A: chan mat ban nhap khi dong cua so (2026-10-25)

**TL;DR:** Truoc phien nay, dong cua so khi dang co game vua tao ma chua luu = **mat sach, khong canh bao** (0 lan `beforeunload`/`will-prevent-unload` trong repo). Da them guard 2 tang va kiem chung that:
- **Renderer** (`bootstrap.ts`): huy `beforeunload` khi `wizardHasUnsavedDraft()` dung.
- **Main** (`main.ts`): `will-prevent-unload` hien hop thoai hoi, chi dong khi giao vien chon "Đóng và bỏ nội dung".
- Do lai tren cua so that: post `WM_CLOSE` → **app song, hop thoai chan dung** (khong phai suy dien).
- `tests/ui/ui-draft-guard-check.js`: **10/10 pass** (da thay no fail truoc khi them code).
- **Bat duoc mot loi that cua chinh minh:** polarity cua `will-prevent-unload` **nguoc** voi `beforeunload` — viet sai lan dau, sua, roi viet unit test de chan tai phat.

1. **Files changed.**
   - Moi: `src/ai-core/unload-guard.ts` — ham thuan `unloadMayProceed()`, tach khoi `main.ts` de test duoc khong can Electron.
   - Moi: `tests/unit/unload-guard.test.ts` — khoa chieu cua truth table.
   - Moi: `tests/ui/ui-draft-guard-check.js` — 10 check tren app that (CDP).
   - `src/renderer/features/wizard/state.ts` — them `wizardHasUnsavedDraft()`.
   - `src/renderer/core/bootstrap.ts` — listener `beforeunload`.
   - `src/main.ts` — listener `will-prevent-unload` + `require('./ai-core/unload-guard')`.
   - `package.json` — dang ky `unload-guard.test.js` vao `npm test`, them script `check:draft-guard-ui`.
   - `docs/STATUS.md` — muc handoff nay.

2. **Behavior implemented.**
   - Dong cua so khi co ban nhap chua luu → hop thoai: "Ở lại" (mac dinh, Escape cung la o lai) / "Đóng và bỏ nội dung". Chon o lai thi cua so giu nguyen.
   - Khong co draft, hoac game **da nam trong Thu vien** → dong binh thuong, **khong hoi**. Dieu nay bat buoc: neu khong, giao vien lam dung quy trinh se khong dong duoc app.
   - Quyet dinh pham vi: **chi chan luc dong cua so**, khong chan khi stepper quay lai buoc 2. Duong stepper da co `wizardConfirmGenreChange` hoi rieng, chan o day se hoi hai lan.

3. **Commands run.**
   - `node tests/ui/ui-draft-guard-check.js 9362` (truoc khi sua code) → `FAIL ... hasPredicate:false`, exit 1. Chay tren app cu.
   - `npm run check` → 0 loi. `npm test` → **tat ca xanh**, gom `unload-guard: polarity verified`, `renderer-load-order: 33 scripts`, `check-renderer-undefined-globals: 34 scripts / 4221 call sites`.
   - `node tests/ui/ui-draft-guard-check.js 9365` → **10/10 passed**; chay lai sau khi refactor tren cong 9366 → **10/10 passed**.
   - Kiem tra unit test co bat duoc loi that: tam dao `unloadMayProceed` sang `=== 'stay'` → test **fail** (`actual: true, expected: false`), da khoi phuc va xac nhan.
   - Kiem chung cua so that: dat draft chua luu, post `WM_CLOSE`, sau 4s van **4 process electron** ⇒ app song, hop thoai dang chan.

4. **Unverified.**
   - Chua ai **bam nut** trong hop thoai that: kiem chung tren la "cua so khong dong" (dung ky vong), nhung chua quay video viec bam "Đóng và bỏ nội dung" roi app thoat that.
   - Chua thu nhanh thoat bang `Alt+F4` khi app dang fullscreen (F11).
   - Van nguyen: giam dinh may chieu that (do sang/tuong phan) ngoai tam.

5. **Next recommended task.**
   - **Pha B** — pho cap luoi do: dua `ui-play-surface-check.js` (27 assertion, hien **khong khoa viewport, khong chup anh**) len 1920x1080 + 1366x768, them screenshot va assertion san chu/ clipping/ overflow. Lam tuong tu cho `ui-stage-illustration-check.js`, `ui-item-assets-editor-check.js`.
   - Tuy chon re: sua **mojibake** (`Ã`/`Â`) dang lan rong — dong 1 cua chinh file nay hien thi thanh `Current Project Status â€”` trong PowerShell; da co trong comment `app.css`.

---
## Handoff — Ke hoach UI v2 va bang do kiem tra moi truong UI hien tai (2026-10-25)

**TL;DR:** Viet `docs/UI-PLAN-V2.md`. **Khong sua code, khong commit** — day la buoc lap ke hoach.
Ba so lieu do lai hom nay, khong phai nho lai:
(1) Luoi chup anh + khoa viewport chi duoc dung o **1/13** file `tests/ui` — va la be mat *it dung nhat* (cua so trinh chieu rieng). Be mat giao vien thao tac (`ui-play-surface-check.js`, 27 assertion) **khong khoa viewport, khong chup anh**.
(2) **749** ma mau hex inline trong renderer TS, tren 10 token `--color-*` — trong khi spec Phase 2 coi day la "design system".
(3) `beforeunload` / `will-prevent-unload`: **0 lan xuat hien** trong toan repo ⇒ mat ban nhap khong canh bao.

1. **Files changed.**
   - Moi: `docs/UI-PLAN-V2.md` (133 dong, 10 muc).
   - `docs/STATUS.md` — muc handoff nay.

2. **Behavior implemented.**
   - Khong co thay doi hanh vi. Ke hoach dat lai thu tu 5 pha: **A** (chan mat ban nhap) → **B** (pho cap luoi do: viewport + screenshot) → **C** (hoan tat Phase 5 tren be mat gameplay cua cua so chinh, tung game mot commit) → **D** (749 hex → token) → **E** (workflow giao vien, chua len lich).
   - Ly do doi thu tu so voi spec: Phase 5 da xong o be mat it dung nhat; Phase 2 (token) neu lam truoc se phai cham lai dung nhung file sap doi layout; loi mat du lieu khong nam trong pha nao cua spec.

3. **Commands run.**
   - `git log --oneline -1` → `1b5f63b`, `git status --porcelain` → sach.
   - Dem hex inline / token / `beforeunload` bang regex tren `src/renderer` va toan repo.
   - Dem assertion va `setDeviceMetricsOverride`/`captureScreenshot` tren 13 file `tests/ui`.
   - Kiem tra cau truc `docs/UI-PLAN-V2.md` bang `Select-String '^#{1,3} '` → dung thu tu A→E, 0 heading trung.

4. **Unverified.**
   - Toan bo la ke hoach: **chua co dong code nao duoc viet hay kiem chung**. Khong co test nao chay trong phien nay.
   - Gia dinh chua kiem: `will-prevent-unload` trong Electron co chan duoc dong cua so theo y renderer hay khong — phai thu tren cua so that.
   - Giam dinh may chieu that (do sang/tuong phan/phong hoc) van ngoai tam: emulate chi tai hien dung kich thuoc.

5. **Next recommended task.**
   - **Pha A** — viet check `tests/ui/ui-draft-guard-check.js` truoc (de thay no fail), roi moi them `beforeunload` + `will-prevent-unload`.
   - Can quyet dinh: guard chi o luc **dong cua so**, hay ca khi bam stepper quay lai buoc 2 (phan tich lai se xoa noi dung)?

---
## Handoff — UI/UX projector pass: Presentation Mode khong ve duoc trong ban build, va co chu trinh chieu 12-16px (2026-10-25)

**TL;DR:** Hai loi that, ca hai deu nam tren **duong may chieu** — duong ma truoc gio chua ai do.
(1) `presentation.html` va `presentation-preload.js` **khong duoc copy vao `dist/`** ⇒ che do Trinh chieu hong hoan toan trong moi ban build/packaged (`net::ERR_FILE_NOT_FOUND`), trong khi toan bo test suite van xanh.
(2) Cua so trinh chieu la **renderer rieng** (khong nap `app.css`, goc DOM `document.body > .presentation-root`) nen moi rule `clamp()` da do danh cho may chieu **khong toi duoc**; co chu nho nhat do duoc la **12px** (o duong dua) va **15-16px** (chuoi chung). Da nang san len **20px** va do lai: **60/60**.
Them luoi chan `tests/ui/ui-presentation-check.js` (+ chup anh that o 1920x1080 va 1366x768) va test build `tests/unit/build-assets.test.ts`.

1. **Files changed.**
   - `package.json` — `build` copy them `src/presentation/presentation.html` + `presentation-preload.js`; `test` them `build-assets.test.js`; them script `check:presentation-ui`, `launch:ui`.
   - `src/renderer/features/presentation.ts` — co chu san 20px tro len, `--line-height` cho tieng Viet, chong tran khung o 1366x768, sua cat chu (`h1`, `.explanation`, `.result-medal`), o duong dua to hon.
   - `src/renderer/styles/app.css` — token `--projector-font-min/body/large`, `--line-height-vi`; `.stage-question` `line-height` 1.22 → `var(--line-height-vi, 1.35)`.
   - `.gitignore` — `tests/ui/shots/`, `tests/.ui-check-profile/`.
   - Moi: `tests/ui/lib/screenshot-capture.js`, `tests/ui/ui-presentation-check.js`, `tests/ui/launch-app.ps1`, `tests/unit/build-assets.test.ts`.
   - `tests/ui/ui-race-treasure-check.js` — sua **assertion sai** (xem muc 4).

2. **Behavior implemented.**
   - **Build:** `npm run build` nay sinh `dist/src/presentation/presentation.html` va `presentation-preload.js`. Truoc do khong co ⇒ Trinh chieu 404 trong ban that.
   - **Co chu may chieu:** san 20px cho **moi** phan tu chu, o ca 1920x1080 va 1366x768, cho ca 5 kieu game (quiz/matching/treasure/race/results). Truoc do: 12px / 15px / 16px.
   - **Khong tran khung:** o 1366x768 trang trinh chieu truoc day cao 871px trong khung 768px (cuon + 4 phan tu ngoai khung, dap an D bi cat); nay khong cuon, khong tran.
   - **Tieng Viet:** `line-height` cau hoi 1.22 → 1.35 (dau chong ế/ộ/ữ bi cat khi xuong dong).

3. **Commands run (ket qua that).**
   - `npm run build` — exit 0; `dist/src/presentation/presentation.html` + `presentation-preload.js` co mat.
   - `node dist/tests/unit/build-assets.test.js` — `build-assets: 4 copied assets present, all HTML references resolve`, exit 0. **Chung minh test bat duoc loi:** rename `presentation.html` ra khoi `dist/` ⇒ exit 1 (`build did not emit src/presentation/presentation.html into dist/`); phuc hoi ⇒ exit 0.
   - `npm run check` (tsc) — exit 0.
   - `npm test` — exit 0 (chuoi 56 lenh, gom `build-assets.test.js`).
   - `npm run verify:css` — 12/12.
   - `npm run check:renderer-globals` — 34 scripts, 4216 call sites, khong co globals undefined.
   - `node tests/ui/ui-presentation-check.js 9361` — truoc khi sua **40/50**, sau khi sua **60/60**. 10 anh PNG o `tests/ui/shots/`.
   - `node tests/ui/ui-fullscreen-density-check.js 9361` — 9/9. `ui-fullscreen-check.js` — 16/16. `ui-race-treasure-check.js` — 19/19.

4. **Mot assertion cu bi sai (da sua).** `ui-race-treasure-check.js` do `#treasureActions` de kiem tra "dieu khien cuoi cung co toi duoc khong". Nhung `#treasureActions` la **placeholder rong, nam TRUOC `.stage-bottom`** trong markup (`gameplay.ts:1260` so voi `:1262`) va chi duoc dien sau khi tra loi (`showTreasureChoices`). Vi vay no do *day noi dung*, khong do *dieu khien* — va truot ra ngoai khung ngay khi panel chat lai. Do truc tiep: sau khi cuon het, `.stage-bottom` **nam trong khung** (`visibleInStage: true`) trong khi `#treasureActions` o `top 729` / khung ket thuc `707`. Da doi sang `.stage-bottom` (dieu khien that su cuoi cung) ⇒ 19/19.

5. **Cach do (de nguoi sau dung lai).** `tests/ui/launch-app.ps1` khoi dong app co `--remote-debugging-port`; `lib/screenshot-capture.js` dung `Emulation.setDeviceMetricsOverride` de ep dung 1920x1080 / 1366x768 (**khong** doi kich thuoc cua so he dieu hanh) va `Page.captureScreenshot` de luu PNG. Khong them dependency nao.

6. **Gioi han / chua kiem chung.**
   - Do tren **viewport mo phong**, khong phai may chieu that: **do sang phong hoc, tuong phan khi bi chieu sang, va khoang cach nhin vat ly KHONG do duoc**. Chi tieu "doc duoc tu cuoi lop" o day la co chu (>=20px) + khong bi cat/tran, khong phai phep do quang hoc.
   - Phien ban hien thi dung mot **iframe cung origin** de chay `presentation.js` voi API gia lap: `window.eduGame` la doi tuong `contextBridge` **khong the ghi de** (`isFrozen`, non-configurable), va `Page.addScriptToEvaluateOnNewDocument` **khong ap dung** khi electron chuyen sang target moi. DOM root, script va `<style>` la that; chi lop IPC la gia lap.
   - Z-order/overlay cua cua so trinh chieu that (BrowserWindow fullscreen, alwaysOnTop) khong duoc kiem.
   - Cac loi **con lai tu phien truoc**, khong lien quan: benchmark lai model 2B, va loi ma hoa mojibake (`Ã`/`Â`) trong `doc_*.txt` / `settings.json`. `app.css` va `STATUS.md` **da** co mojibake tu truoc; lan nay khong sua va khong lam nang them.

7. **Task tiep theo de xuat.** Migrate 668 mau hex hardcode trong renderer TS sang token (bat dau `treasure-art.ts` 131 cho → `game-illustration.ts` → … → `presentation.ts` 49 cho), moi buoc doi chieu bang anh chup `check:presentation-ui` de chung minh khong doi ngoai y muon.

## Handoff — CPU-vs-Vulkan: quyết định CPU-mặc-định được **xác nhận lại** bằng phép đo sạch; một bảng benchmark cũ trong docs là số sai (2026-10-25)

**TL;DR:** nghi ngờ về chính phép đo trước đó là **đúng**. Con số "CPU ~7 tok/s" không phải CPU: thư mục runtime lúc đo chứa bản **Vulkan**, nên cả hai lượt đều chạy trên GPU. Đo lại bằng **hai gói binary riêng** (đều tải từ GitHub, SHA-256 khớp manifest): **CPU prefill 10,7–13,0 / decode 4,91–5,42 tok/s** so với **Vulkan 0,40–0,75 / 2,76** ⇒ Vulkan chậm hơn **~2× decode, ~20× prefill**. `DEFAULT_RUNTIME_BACKEND = 'cpu'` **đúng và giữ nguyên**; các test bảo vệ quyết định này **giữ nguyên**. §O6b **không sai**; script cũ của tôi sai. **Không đổi product code.**

1. **Files changed.** Chỉ `docs/BENCHMARKS.md` (viết lại mục đầu "Backend CPU so với Vulkan…") và block này. **No product code changed.**

2. **Cách đo sai ở lần trước (3 lỗi chồng lên nhau).**
   - `--n-gpu-layers 0` **không** biến bản Vulkan thành CPU: iGPU dùng chung RAM (`uma: 1`), phép tính vẫn đi qua backend Vulkan. Phải dùng **binary CPU x64 riêng** để có mốc CPU thật.
   - Script chạy `--no-warmup` và **không** truyền `--threads`.
   - Không lặp lại nhiều lần ⇒ một lượt nhiễu đã bị đọc thành kết luận.
   ⇒ Hai cột ~7 tok/s ở bảng cũ **không dùng được**; đã đánh dấu cảnh báo ngay trong `BENCHMARKS.md` thay vì xoá (để người sau không lặp lại).

3. **Số đo sạch (Qwen3.5-4B Q4_K_M, prompt 11 token, `--ctx-size 8192 --parallel 1 --threads 8`, greedy, `cache_prompt:false`, bỏ lượt warm-up).**

   | Backend | prefill tok/s | decode tok/s |
   |---|---|---|
   | CPU (gói CPU x64, `-ngl 0`) | **10,7–13,0** | **4,91–5,42** |
   | Vulkan (gói Vulkan x64, 33/33 layer trên `Vulkan0`) | 0,40–0,75 | 2,76 |

   Khớp với block ngày 2026-10-25 phía dưới (`Vulkan 1.0 / 1.9–2.1` so với `CPU 11.8–13.1 / 4.5–4.9`) ⇒ **cùng một kết luận, hai bản đo độc lập**.

4. **Hai phát hiện phụ đáng giữ.**
   - `llama-bench.exe` **không** dùng được để đo Vulkan trên máy này: `--list-devices` trả `(none)` và `-ngl 99` **âm thầm rơi về CPU** (bảng ghi `backend CPU`). Muốn đo GPU phải dùng `llama-server` — cũng là đường app chạy. `llama-bench` vẫn tốt để đo CPU và **xác nhận §O6b** (`pp866`: 19,00 ± 1,16 ở `-t 8`, 16,60 ± 1,28 ở `-t 4`).
   - App **có** truyền `--threads` (`src/ai-core/ai-manager.ts`) = `resolveCpuThreads(8, 8)` = **8** trên máy này, tức mức nhanh nhất ⇒ **không** cần sửa số luồng. (Tôi đã suýt ghi ngược lại vào docs; đã kiểm code trước khi giữ câu đó.)

5. **Bằng chứng ở mức app.** `logs/ai-2026-10-25.jsonl`: `13:55` → `runtimeBackend: vulkan, installedBackend: vulkan`; `15:02` → `runtimeBackend: auto, installedBackend: cpu` ⇒ đổi mặc định có hiệu lực thật. Cùng ngày trên Vulkan có **3 `AI_TIMEOUT` 305–312 s**; lượt xong trên CPU là **136 s** — nhưng lượt đó chạy **2B** còn lượt timeout chạy **4B**, nên **không** quy chênh lệch này cho backend. Kết luận chỉ dựa vào phép đo cùng-model ở mục 3.

6. **Commands run.** `llama-bench` CPU `-t 8`/`-t 4` (warm-up + `-r 3`); `llama-server` CPU và Vulkan + `POST /completion` ×4 (bỏ warm-up); `--list-devices` cho cả hai gói; `Get-FileHash` (khớp manifest `07006066…` và `059a9956…`). Không sửa code ⇒ `npm run check` / `npm test` không cần chạy lại (lần gần nhất: cả hai exit 0).

7. **Not verified.** Vẫn **chưa** đo trên **GPU rời** (NVIDIA/AMD), chưa đo driver khác, chưa đo **2B** trên Vulkan. Số Vulkan chỉ từ **một** iGPU Intel UHD + driver 27.20.100.8729 ⇒ **không** được suy ra cho máy có GPU rời.

8. **Next recommended task.** (a) Đo lại **2B** (model mặc định) bằng đúng quy trình sạch ở mục 3 và cập nhật `docs/BENCHMARKS.md` nếu lệch; (b) xử lý mojibake `Ã`/`Â` trong `doc_*.txt` (tìm lỗi encoding lúc lưu/import — đây là lỗi thật, thấy rõ trong `settings.json` và log). **Lưu ý:** việc `wizardStructureScopeError` undefined **đã xong rồi**, không cần làm lại — hàm đã có ở `src/renderer/features/wizard/step-structure.ts:312` và `tests/unit/renderer-load-order.test.ts` đã kiểm nó (dòng 185–302).

## Housekeeping — dọn build output và xoá `tests/tailieu/` (2026-10-25)

**TL;DR:** theo yêu cầu "clean project", đã xoá **547,2 MB** thứ tái tạo được (`dist/` 3,7 MB, `release/` 543,5 MB từ 2026-10-20 — cũ hơn toàn bộ thay đổi catalog/runtime, `.qodo/` rỗng) và **1,2 MB** PDF thật trong `tests/tailieu/`. Sau khi dọn: `npm run check` **exit 0**, `npm test` **exit 0**, 0 dòng `FAIL`/`AssertionError`; `dist/` được build lại nên app vẫn `npm start` được.

1. **Files changed.** Xoá `dist/`, `release/`, `.qodo/`, `tests/tailieu/`. Sửa `tests/README.md` (mục mới "`tests/tailieu/` was deleted on purpose") và `docs/BENCHMARKS.md` §O6e (1 dòng cảnh báo số liệu là số lịch sử). **No product code changed.**

2. **Why `tests/tailieu/` removal needed a doc note.** 6 script trong `tests/manual/` đọc thẳng thư mục này và giờ **hỏng ENOENT** nếu chạy tay: `bench-preprocess-real`, `inspect-preprocess-real`, `inspect-preprocess-middle`, `measure-retention`, `measure-query-ranking`, `diagnose-query-ranking`. Đã đối chiếu: **không script nào nằm trong `npm test`** (0 khớp) và chúng là diagnostic chứ không phải test pass/fail ⇒ suite tự động không bị ảnh hưởng. Số liệu §O6e và #57/#58 là số đã đo khi còn tệp, giữ nguyên giá trị lịch sử và **không tái lập được** nếu không đưa PDF vào lại.

3. **Giữ nguyên có chủ đích.** `node_modules/` (641 MB, cần để chạy; muốn dọn thì `npm ci` chứ đừng xoá tay), `vendor/vc-runtime/*.dll` (724 KB, **được đóng vào bộ cài** qua `extraResources`), `build/installer.nsh`, `src/renderer/features/icon-data.ts` (file generated, sẽ sinh lại khi build). `release/` sẽ được tạo lại bằng `npm run dist:win` — cần chạy lại trước khi bàn giao bộ cài.

4. **Commands run.** `npm run clean` (exit 0), `npm run check` (exit 0), `npm test` (exit 0).

5. **Unverified.** Chưa chạy lại `npm run dist:win` sau khi dọn ⇒ **bộ cài hiện chưa có**, phải build lại. Không có kiểm thử nào cho việc xoá `tests/tailieu/` (chỉ là tài nguyên test tay).

6. **Next.** Quyết định sản phẩm về Gemma vẫn **mở** ((a)/(b)/(c) ở block dưới), sau đó `npm run dist:win` để có lại bộ cài.

## Handoff — Gemma 4 E2B đã được đo: chậm hơn 2B thật, và **không** phải vì CPU "chỉ chạy 33%" (2026-10-25)

**TL;DR:** nghi vấn "Gemma dùng CPU ít nên chậm" **đã được kiểm tra và bác bỏ bằng số đo**: trong lúc sinh token, tiến trình ăn **~80% của 8 luồng** — y như Qwen 2B. Gemma chậm hơn vì **4,65 B tham số MoE** (chứ không phải 2 B), prefill tệ hơn hẳn (pp1024 không xong sau 200 s), và Vulkan còn chậm hơn CPU (tg 5,02 vs 11,52). Số luồng 8 là tối ưu (thử 2/3/4/5/6/8). Không đổi code; Gemma vẫn manual-only.

1. **Files changed.** Only `docs/BENCHMARKS.md` (mục mới "Gemma 4 E2B trên CPU…") and this block. **No product code changed** in this round.

2. **What was measured (i5-10210U, 4C/8T, 15,8 GB, `b11681`, `-ngl 0`).**
   - `tg64 -t 8`: **Gemma 8,40 tok/s** vs **2B 11,12 tok/s**; CPU 12,81 vs 12,78 cpu-second trong 2 s wall ⇒ **~80% của 8 luồng cho cả hai**.
   - `-t` 2/3/4/5/6/8 trên Gemma: pp256 **16,0–16,5 tok/s ở mọi mức** (prefill không phụ thuộc luồng), tg16 tốt nhất ở **8 luồng = 11,52**.
   - `llama-bench` báo Gemma **4,65 B tham số** cho file 2,88 GiB → MoE, giải thích vì sao "E2B" không nhanh hơn 2B dense 1,88 B.
   - `llama-cli` 16 token: chỉ ra `[Start thinking] Thinking Process: …` ⇒ cửa sổ sinh ngắn **không có câu trả lời thật**; đúng rủi ro đã ghi ở DECISIONS #80.
   - Vulkan (`-ngl 99`): pp256 16,74, tg16 **5,02** ⇒ xác nhận lại CPU-mặc-định.

3. **Method trap worth remembering.** `Get-Process … .TotalProcessorTime` trên máy này **không cập nhật giữa hai lần đọc sát nhau** (kiểm chứng bằng tiến trình rỗng: 0,047 s đứng yên). Lấy mẫu một lần rồi chia ⇒ 0%; đó chính là kiểu số liệu "33%" gây hiểu nhầm. Phải lấy hiệu giữa hai lần đọc **cách nhau ≥ 2 s**. Ngoài ra `llama-bench` đôi khi **không thoát** sau khi xong (2 tiến trình treo ở 767 s và 324 s CPU đã bị kill) ⇒ luôn chạy qua `Start-Process` + `WaitForExit(timeout)` và `Stop-Process` dọn dẹp.

4. **Commands run and results.** Bench qua `Start-Process`/`WaitForExit` + log file (xem khối lệnh trong `docs/BENCHMARKS.md`); toàn bộ tiến trình treo đã được kill, `Get-Process llama-bench/llama-cli` còn 0. `npm run check` và `npm test` **không cần chạy lại** vì chỉ sửa markdown (lần chạy gần nhất: cả hai exit 0).

5. **Not verified.** Chất lượng nội dung Gemma so với 2B/4B (chưa có đánh giá nào); prefill trên giáo án thật qua `llama-server` (chưa chạy); máy ≥ 6 nhân hoặc có GPU rời (chưa đo).

6. **Next recommended task.** Quyết định sản phẩm cho Gemma: (a) giữ manual-only và thêm ghi chú "chậm hơn bản Nhanh" vào `tagline` (đã gần đúng), (b) tắt thinking + nới token tối thiểu để Gemma không trả về rỗng, hoặc (c) gỡ Gemma khỏi catalog. Số đo hiện tại không ủng hộ việc gỡ — nó vẫn *chạy được*, chỉ chậm — nhưng nếu mục tiêu là "không có lựa chọn nào tệ hơn mặc định" thì (c) là lựa chọn sạch nhất.

## Handoff — CPU is now visibly the default; catalog swapped to 2B/4B/Gemma 4; a bad runtime can no longer kill AI local (2026-10-25)

**TL;DR:** the launch path no longer `throw`s when the installed runtime backend is not the one requested — it logs `runtime.backend-swap-failed`, continues on CPU and only fails when there is no `llama-server.exe` at all. Settings presents **CPU** as the default and moves the Vulkan build under a collapsed *"Tùy chọn nâng cao"* group. Qwen2.5 7B is gone from the catalog and **Gemma 4 E2B** is added as a manual-only option. No auto-selection changed for real machines: 2B on ≤8 GB, 4B on ≥12 GB.

1. **Files changed.**
   - `src/ai-core/model-catalog.ts` — removed `qwen2.5-7b-q4_k_m`; added `gemma-4-e2b-it-q4_k_m` (rev `0314792d7f1f…`, 3 106 738 272 B, sha256 `740185b2…ec34b8`, Apache-2.0, 8 GB min / 12 GB rec / 8 threads, `gpu.supported: false`); `recommendLocalModelId()` last resort is now `QWEN_LOCAL_MODELS[0]` (2B) instead of the *strongest* model; new exported pure function `resolveBackendAttempts()`.
   - `src/main.ts` — the post-install backend mismatch no longer throws: it warns (`runtime.backend-swap-failed`) and continues with the fallback list, throwing only when there is no executable; `recommendedSetupModelId()` logs `runtime.model-recommendation-failed` instead of silently returning 2B; verify-panel string no longer claims Vulkan "tăng tốc".
   - `src/services/item-capacity.ts` — 7B tier deleted (`tier: 0 | 2 | 4`); new Gemma profile *before* the `2b` rule, because `gemma-4-e2b` would otherwise be scored as a Qwen 2B.
   - `src/renderer/pages/settings.ts` — backend selector moved into `<details>` "Tùy chọn nâng cao: dùng GPU tích hợp" (open only when Vulkan is already selected); options relabelled (CPU = mặc định/khuyến nghị); `gpuDescription` no longer says "chỉ CPU" while Vulkan is selected.
   - `src/renderer/setup-wizard-model.ts` — `SETUP_DEFAULT_MODEL_ID` 4B → **2B** (it is only used if preflight fails).
   - `src/renderer/features/local-ai.ts`, `src/renderer/styles/app.css` — copy "Nhanh / Linh hoạt / Gemma 4"; `.runtime-advanced` styling.
   - Tests: `model-catalog` (3 entries, order, Gemma metadata, 7B rejected, Gemma never auto-installed, `resolveBackendAttempts`), `item-capacity` (7B cases → 4B/Gemma, tier 7 gone), `setup-ipc` (7B refused, Gemma accepted), `setup-wizard-ui` (no pinned model without a plan), `runtime-backend-install` (mismatch falls back instead of throwing).
   - Docs: this block, `docs/ARCHITECTURE.md`, `docs/BENCHMARKS.md`.

2. **Behaviour implemented.**
   - *Default backend:* unchanged (`DEFAULT_RUNTIME_BACKEND = 'cpu'`); what changed is presentation — the GPU build is no longer an equal-looking option.
   - *Post-install failure:* a wrong/unknown runtime layout now degrades to CPU. Fatal only when `llama-server.exe` is missing (nothing can start), because `install()` already verifies size + SHA-256 before extracting.
   - *Catalog:* 2B (<8 GB, 5 items), Gemma 4 E2B (manual only, 5 items), 4B (≥12 GB, 6 items; 7 with Thinking). Stale settings naming `qwen2.5-7b-q4_k_m` are refused by `getLocalModel`/`resolveSetupModel` rather than silently mapped.

3. **Accepted consequences (not bugs).**
   - A teacher who previously used 7B keeps the 4.7 GB file on disk but can no longer select it; the id is rejected on purpose, so nothing silently substitutes another model. Re-selecting a model is required once.
   - Gemma 4's chat template enables thinking by default and `buildGenerationOptions()` still sends `chat_template_kwargs.enable_thinking=false` (a Qwen-style key). If Gemma ignores it, the first-run 8-token smoke may return empty output. Not measured — never auto-selected, so no teacher hits this without choosing it.

4. **Commands run and results.**
   - `npm run check` (`tsc --noEmit`) — **exit 0** (run after the catalog, main, settings, capacity and test edits).
   - `npm test` — **exit 0**; `model-catalog tests passed`, `item-capacity.test.ts: OK`, `setup-ipc tests passed`, `setup wizard UI tests passed`, `runtime-backend-install.test.ts: all assertions passed` (16 cases), `Lesson store tests passed`, `renderer-undefined-globals: all assertions passed`.
   - Iterations needed (all fixed): duplicate 4B catalog entry from a bad insert (count 4 ≠ 3); `item-capacity` ceiling expectations (4B+Thinking legitimately reaches 7, unchanged rule); two wizard-UI assumptions that did not match the renderer (no `start` call on the requirements screen, no model row without a plan).

5. **Not verified.**
   - Gemma 4 E2B **đã** tải và chạy được với `b11681` (file 3 106 738 272 B khớp catalog) — xem block mới nhất ở đầu file và `docs/BENCHMARKS.md` §"Gemma 4 E2B trên CPU". Chất lượng nội dung vẫn chưa được đánh giá.
   - No click-through of the new Settings layout in a real window (CSS/`<details>` rendering unchecked visually).
   - `resolveBackendAttempts()` is unit-tested, but the real "Vulkan installed, detected as CPU" path was not re-run end-to-end on the pilot machine.
   - 2B Vulkan-vs-CPU generation speed still unmeasured (the 2.3× figure is 4B only).

6. **Next recommended task.** Run the hand-off probes below on the pilot machine and paste the numbers into `docs/BENCHMARKS.md` §2: (a) does `b11681` load Gemma 4 E2B; (b) does a 8-token smoke return non-empty output with thinking disabled; (c) 2B CPU prefill/generation baseline.
   ```powershell
   $rt="$env:APPDATA\edugame-studio\edugame-data\ai-local\runtime\llama.cpp-b11681"
   $md="$env:APPDATA\edugame-studio\edugame-data\ai-local\models"
   & "$rt\llama-cli.exe" -m "$md\gemma-4-e2b-it-q4_k_m-0314792d7f1f.gguf" -p "Xin chào" -n 16 -c 2048 -ngl 0 -t 8 --no-warmup
   & "$rt\llama-bench.exe" -m "$md\qwen3.5-2b-q4_k_m-31e04817b38d.gguf" -p 512 -n 64 -ngl 0 -t 8 -r 1
   ```

## Handoff — Vulkan now really runs on the iGPU; measured **slower than CPU** on the pilot machine (2026-10-25)

**TL;DR:** the settings→files fix works and is now proven end-to-end (33/33 layers offloaded to `Vulkan0` = Intel UHD). But on this hardware the GPU path is **~2.3× slower** than CPU (1.9–2.1 vs 4.5–4.9 token/s), so `vulkan` must **not** stay the default and the Settings hint must not promise speed. Recommend keeping the option but labelling it as a trade-off, and gating it on a quick self-measurement.

1. **Files changed (this round).**
   - `src/main.ts` — `startLocalRuntimeUnlocked()` now (a) passes `onProgress`/`setupProgressSink` into `install()` so the 32 MB swap is visible instead of a frozen window, (b) **re-reads** `getInstalledBackend()` after installing and throws a Vietnamese error if the folder still is not the wanted build (previously a silent no-op would be reported as success), (c) logs both `runtimeBackend` (the choice) and `installedBackend` (what is on disk) at `app.start`, (d) writes the GPU→CPU fallback to the diagnostic log as `runtime.gpu-fallback` (it was only a `console.warn`, invisible in the packaged app).
   - `tests/unit/runtime-backend-install.test.ts` — two new cases: "the real Vulkan archive is not mistaken for CPU" (the real b11681 Vulkan zip *also* ships `ggml-cpu-*.dll`, so the detector only works because it checks `ggml-vulkan*` first) and "the swap reports progress so the window does not look frozen".
   - `docs/STATUS.md` — this block.

2. **What was actually wrong (root cause, second layer).** The previous round's fix was correct but **unverifiable from the outside**: the swap downloaded 32 MB with no progress and returned success even if the directory still held the other build, and nothing recorded *which* build was on disk. On the pilot machine the runtime directory had an mtime of **2026-10-22** while `settings.json` already said `vulkan` — the app had never touched the files. Running the app's own `LlamaRuntimeInstaller.install()` against the real directory then replaced it correctly in one shot, which proves the logic was fine and the *reporting* was the trap.

3. **Proven on the real machine (evidence, not inference).**
   - Old build: `llama-server.exe --list-devices` → `Available devices: (none)` (no GPU code in a CPU build).
   - New build: `Available devices: Vulkan0: Intel(R) UHD Graphics (8231 MiB, 7442 MiB free)`.
   - Load line: `load_tensors: offloaded 33/33 layers to GPU`, `Vulkan0 model buffer size = 2603.50 MiB`, `Vulkan_Host model buffer size = 497.31 MiB`.
   - App log after restart: `"runtimeBackend":"vulkan","installedBackend":"vulkan"`.

4. **Measured performance — the GPU is slower here.** Qwen3.5-4B Q4_K_M, ctx 8192, `--threads 4`, `--parallel 1`, same prompt, i5-10210U + Intel UHD (no discrete GPU):

   | Backend | prefill tok/s | generation tok/s |
   |---|---|---|
   | Vulkan (`--n-gpu-layers 99 --device Vulkan0`) | **1.0** | **1.9–2.1** |
   | CPU (`--n-gpu-layers 0`) | **11.8–13.1** | **4.5–4.9** |

   This matches the existing `docs/BENCHMARKS.md` note that Vulkan prefill was already slower on this class of machine. A U-series iGPU sharing system RAM is not a win for a 2.6 GB model; the offload itself is real, it is just not faster.

5. **Commands run and results.**
   - `npm run check` (`tsc --noEmit`) — **exit 0**.
   - `npm test` — **exit 0**, every suite passes, `runtime-backend-install.test.ts: all assertions passed` (13 cases).
   - `node dist/tests/unit/runtime-backend-install.test.js` after each mutation, **2/2 caught**, both restored: (a) check `ggml-cpu*` before `ggml-vulkan*` → "a Vulkan runtime directory is detected as vulkan" fails; (b) drop the `onProgress` call → "the swap reports progress…" fails.
   - Real-machine probes (all temporary scripts deleted): manifest/resolver replay → `vulkan`/`ok`; `matchesBackend('vulkan')` on the CPU install → `false`; `install()` on a clone → `cpu`→`vulkan`, CPU dlls removed; `install()` on the real directory → `vulkan`; app launched with `electron.exe .` → log shows `installedBackend: vulkan`.

6. **Not verified.**
   - No click-through in a visible Electron window (the app was started headless-ish via `electron.exe .`; only the log was inspected).
   - GPU utilisation was **not** sampled reliably: `\GPU Engine(*engtype_Compute*)` returned nothing and `Processor(_Total)` returned 0 even during generation, so the "GPU is doing the work" claim rests on llama.cpp's own `offloaded 33/33 layers` line plus the throughput numbers, not on a Task Manager reading.
   - Small models (2B) and the embedding server (`embedding-manager.ts`, `gpuLayers: 0`) were not re-measured; the embedding server is intentionally left on CPU.
   - No clean-machine test; the Vulkan runtime needs a working Vulkan driver, and this was only exercised on one Intel UHD + driver 27.20.100.8729.

7. **Next recommended task (decision needed).** Vulkan is currently *selectable* and, on this hardware, makes lessons slower. Options: (a) keep the option but change the Settings hint to state the measured trade-off and drop any "tăng tốc" wording; (b) hide it behind "nâng cao"; (c) add a one-time 30-token A/B measurement at first switch and keep whichever is faster. Option (c) is the only one that is correct on unknown hardware, but it costs a minute on first setup — decide before `docs/BENCHMARKS.md` is updated.

## Handoff — Backend choice now reaches the files on disk (fixes "chose Vulkan, CPU still at 100%")

1. **Files changed.**
   - `src/ai-core/runtime-manifest.ts` — new `detectInstalledBackend(fileNames)`. Decides which build an extracted runtime directory *is*, from `ggml-vulkan.dll` vs `ggml-cpu-*.dll`. Unknown layouts return `undefined` so callers reinstall instead of guessing.
   - `src/ai-core/runtime-installer.ts` — new `getInstalledBackend()` and `matchesBackend(backend)`; `install()` now reuses an existing install **only when it is the same build** (defaults to `'cpu'` when the artifact carries no `backend`, preserving old behaviour); `RuntimeArtifact.backend?` added.
   - `src/main.ts` — `startLocalRuntimeUnlocked()` and the `ai:install-local-model` handler compare the *build* instead of the presence of `llama-server.exe`, and reinstall when it differs; verify panel now reports `installedBackend`/`backendMismatch` and says in Vietnamese when the folder holds the wrong build.
   - `src/ai-core/setup-orchestrator.ts` — `RuntimeInstallPort.getInstalledBackend?()` (optional, so existing fakes compile); `installing-runtime` no longer returns early when a *different* backend's build is present.
   - `tests/unit/runtime-backend-install.test.ts` — new, registered in `npm test` after `runtime-backend-choice`.
   - `docs/STATUS.md` — this block. No temp files remain.

2. **What was broken (root cause).** Every backend extracts to the *same* directory — `RUNTIME_DIR()` is `runtime/llama.cpp-<version>` with no backend in the path. Every call site decided "the runtime is installed" by asking whether `llama-server.exe` existed, and that question cannot distinguish a CPU install from a Vulkan one. Consequence on a machine that had previously installed the CPU build: choosing Vulkan persisted `runtimeBackend: 'vulkan'`, the resolver selected `VULKAN_X64_RUNTIME`, `startLocalRuntimeUnlocked()` found the old `llama-server.exe` and **never downloaded the Vulkan build**, then passed `--n-gpu-layers 99 --device Vulkan0` to the CPU binary. Nothing offloaded, so the CPU stayed saturated while Settings and the verify panel both reported Vulkan. Confirmed on the pilot machine: `settings.json` held `"runtimeBackend": "vulkan"` while the runtime folder contained `ggml-cpu-alderlake.dll`, `ggml-cpu-zen4.dll`, … and **no** `ggml-vulkan.dll`.

3. **Behaviour now.** A backend change replaces the runtime files. `install()` reuses an install only when `getInstalledBackend()` equals the artifact's backend, so switching CPU→Vulkan downloads the Vulkan archive (~32 MB) and removes the CPU-only dlls; switching back to CPU does the reverse. The CPU retry (`attempts = ['vulkan','cpu']`) is unchanged. `DEFAULT_RUNTIME_BACKEND` is still `'cpu'`, so "Tự động" behaves exactly as before.

4. **Commands run and results.**
   - `npm run check` (`tsc --noEmit`) — **exit 0**.
   - `npm test` — **exit 0**, all suites pass, including the new `runtime-backend-install.test.ts: all assertions passed`.
   - Read-only probe against the real installation (deleted after) — saved preference `vulkan`, resolver picks `vulkan`, backend on disk `cpu`, `ggml-vulkan.dll` absent, `installed matches wanted: false` → the app would now download the correct build.
   - Mutation testing, **2/2 caught**, each restored:
     - restore the old `if (await getExecutablePath()) return existing` shortcut → fails "the Vulkan archive must be downloaded even though llama-server.exe existed";
     - make `detectInstalledBackend` report `cpu` for a Vulkan layout → fails "a Vulkan runtime directory is detected as vulkan".

5. **Not verified.**
   - **No real Vulkan offload observed.** The 32 MB download, the file replacement and the `--device Vulkan0` spawn were not executed in an Electron window; correctness of the *decision* is tested, not the resulting tok/s or GPU utilisation.
   - Whether the Vulkan build starts on this machine's driver is still untested end-to-end. If it fails, the existing CPU retry logs `GPU (Vulkan) không khởi động được; đã tự chuyển sang CPU.` and the app keeps working.
   - The embedding server (`embedding-manager.ts`) shares the same executable but has its own `gpuLayers` option and was not changed.

6. **Next recommended task.** `npm start` → Settings → confirm the selector shows Vulkan → run AI local once. Expect a one-time ~32 MB runtime download, then `ggml-vulkan.dll` present in `…\ai-local\runtime\llama.cpp-b11681\`. Check Task Manager GPU usage during a long document analysis; if the process still shows CPU-only and the log shows the Vulkan fallback, re-measure per `docs/BENCHMARKS.md` before keeping Vulkan selectable.


## Handoff — Runtime backend is now a teacher choice (Vulkan/iGPU reachable from Settings, CPU stays the default)

1. **Files changed.**
   - `src/shared/types.ts` — new `RuntimeBackendPreference = 'auto' | 'cpu' | 'vulkan'`; `AiSettings.runtimeBackend?: RuntimeBackendPreference`.
   - `src/ai-core/setup-orchestrator.ts` — `SetupOptions.backend` widened from `'cpu' | 'openvino' | 'auto'` to also accept `'vulkan'`. It literally could not express the GPU choice before, so setup could never install the build a teacher asked for.
   - `src/ai-core/setup-ipc.ts` — new optional `RegisterSetupIpcOptions.defaultBackend` (value or function, awaited per request like `defaultModelId`); `buildOptions` now passes it into `SetupOptions`. The renderer payload is still stripped of any `backend` key.
   - `src/main.ts` — new `readRuntimeBackendPreference()` (reads `settings.ai.runtimeBackend`, any unknown value reads as `auto`, never throws); `resolveRuntimeForThisMachine()` now forwards it to `resolveRuntime`; `registerSetupIpc` gets `defaultBackend: readRuntimeBackendPreference`.
   - `src/renderer/pages/settings.ts` — new `#localRuntimeBackendSelect` (Tự động / Chỉ CPU / GPU tích hợp (Vulkan)) with a hint that states the measured trade-off and the automatic CPU fallback; machine panel shows the effective choice.
   - `src/renderer/features/settings.ts` — new `readRuntimeBackendSelection()`; `saveSettings()` persists it; the verify panel now reads "Bộ xử lý đang dùng" and lists detected GPU names; button renamed to "Xác minh runtime AI local".
   - `tests/unit/runtime-backend-choice.test.ts` — new. `npm test` runs it right after `runtime-resolver.test.js`.
   - `tests/unit/setup-ipc.test.ts` — the existing payload-hardening fixture now also tries to smuggle `runtimeBackend: 'vulkan'` (it only covered `openvino` before, which was harmless; `vulkan` is now a real, selectable value).
   - `docs/STATUS.md` — this block. No temp files remain.

2. **What changed and what did not.** The Vulkan build already existed, was verified, and was already plumbed through install/verify/start including a CPU retry; what was missing was any way for a teacher to *choose* it — `SetupOptions.backend` did not even have the value, and `resolveRuntimeForThisMachine()` never passed a preference. Now the saved setting is the request and the resolver is still the decision. **`DEFAULT_RUNTIME_BACKEND` stays `'cpu'` and `preferredBackendFor` still ignores the GPU for `'auto'`** — the measured prefill result (Vulkan slower than CPU on the pilot Intel UHD, `docs/BENCHMARKS.md` O6b) is unchanged, so no default moved.

3. **Commands run and results.**
   - `npm run check` (`tsc --noEmit`) — **exit 0**.
   - `npm test` — **exit 0**, all suites pass, including the new `runtime-backend-choice.test.ts: all assertions passed` and `check:renderer-undefined-globals: 34 scripts, 501 declared functions, 4216 call sites — no undefined globals`.
   - Mutation testing to prove the new test is not vacuous — 3 mutations, **all caught**, each restored afterwards:
     - drop `backend` from `buildOptions` → fails "preflight must plan the Vulkan artifact the teacher chose" (got `llama.cpp-b11681-cpu-win32-x64`, expected `-vulkan-`);
     - `preferredBackendFor` returns `'cpu'` for any request → fails "an explicit vulkan request must select the GPU build";
     - `readSetupRequest` forwards `record.backend` → fails "a renderer-supplied backend must be ignored".
   - Headless render probe (throwaway VM sandbox over `dist/src/renderer`, deleted after) — selector renders, `vulkan` selected from a saved `'vulkan'`, hint text present.
   - Headless save probe (same, deleted after) — `vulkan` and `cpu` persist; **`auto` clears the key**; unrelated settings still save.

4. **Not verified.**
   - **No Electron window was opened** (`npm start` not run this session), so the selector was never clicked by a human and the visual layout in the real Settings page is unconfirmed.
   - **No real Vulkan run.** No `llama-server` was started with `--device Vulkan0 --n-gpu-layers 99` here, so "choosing Vulkan actually offloads to the iGPU" is inferred from the already-existing start path (`attempts = ['vulkan','cpu']`) and not observed now.
   - The `settings:save` round-trip that drops `undefined` (`JSON.parse(JSON.stringify(...))`) was verified by reading the handler and by the save probe, not by writing a real `settings.json` through Electron.
   - Speed on this machine was **not** re-measured; the hint repeats the old measurement.

5. **Next recommended task.** Run `npm start`, open Settings, switch to "GPU tích hợp (Vulkan)", click "Xác minh runtime AI local", and confirm the panel reports `Vulkan0` and that a generation still completes (it auto-falls back to CPU if the GPU cannot start). If that works, decide whether the O6b prefill numbers should be re-measured on the GPU path before anything else references them.


## Handoff — Renderer guard: build now fails on a call to an undeclared function (`@ts-nocheck` blind spot closed)

1. **Files changed.**
   - `scripts/check-renderer-undefined-globals.js` — new (388 lines). Scans the compiled renderer scripts listed in `dist/src/index.html` and fails when a call targets a function no renderer script declares.
   - `tests/unit/renderer-undefined-globals.test.ts` — new. Regression suite over the scanner's lexing rules, including both false-negative and false-positive modes.
   - `package.json` — new script `check:renderer-globals`; `npm test` now runs the new test file and the check.
   - `docs/STATUS.md` — this block.
   No temp files remain.

2. **Why.** 28 of the 33 renderer files begin with `@ts-nocheck`, which suppresses `tsc`'s "Cannot find name" — the only check that would have caught `wizardStructureScopeError()` being called from `step-input.ts` (twice) and `create-wizard.ts` while defined nowhere. That shipped: the page threw `ReferenceError` and stopped repainting. `tsc` cannot be made to report this while the directive is present (confirmed by running a separate `tsconfig` over `src/renderer` — it exits clean), so the guard is a static scan rather than a compiler flag. No linter dependency was added: the project has no ESLint and the workspace rules say to use only libraries already in use.

3. **How it works.** Declarations are matched line-anchored on the **raw** source, because a missed declaration becomes a false report and every function declaration in this renderer starts a line. Call sites are matched on **stripped** source (strings, template literals, and comments removed), so Vietnamese prose and markup such as `Lịch sử (mục …)` and `<h3>Chẩn đoán AI (log)</h3>` are not read as code. Template literals are stripped recursively with brace-matched `${…}` handling so a nested template cannot end the outer one early; calls inside `${…}` are still analysed. `async (`, `function (`, keyword-prefixed and dotted calls, and parameters used as callbacks are excluded, as are mid-word matches (`String(` must not also yield `ng()`).

4. **Commands run and results.**
   - `node scripts/check-renderer-undefined-globals.js` → exit 0, `34 scripts, 500 declared functions, 4210 call sites — no undefined globals`.
   - Non-vacuity proven twice. (a) Injecting `wizardStructureScopeError()` back into `dist/.../step-input.js` → exit 1, reporting `step-input.js:7` and `create-wizard.js:34`; file restored, clean. (b) Mutation-tested the scanner itself: dropping `${…}` handling, ending templates at the first backtick, and removing the string terminator each made `renderer-undefined-globals.test.js` fail. All three mutations restored; suite green.
   - An earlier mutation survived, which was **a real test gap, not a passing grade**: removing the string terminator swallows the rest of a line and produces a *false negative*, not a false positive, so the prose assertion could not see it. Added the complementary assertion (`const label = 'Đã lưu'; renderWizardInput();` must still report `renderWizardInput`); the mutation is now caught.
   - `npx tsc -p tsconfig.json` → clean. `npm test` → **exit 0**, including `renderer-undefined-globals: all assertions passed` and the check.
   - `npm run check:renderer-globals` re-run after a full rebuild → exit 0 (not dependent on leftover state).

5. **What remains unverified / limits.**
   - The scanner is a heuristic lexer, not a parser. It recognises calls to *function declarations*; a call to a `const`/`let`-defined helper is treated as satisfied (non-hoisting helpers are a load-order problem already covered by `renderer-load-order.test.ts`). `PLATFORM_ALLOWLIST` is hand-maintained; a browser API not listed will be reported as a false positive and should be added there.
   - Deliberately not enforced: undeclared *variables* (only call targets), and `window.foo()`-style access.
   - Not run on the teacher's machine; a packaged `.exe` still needs a rebuild.

6. **Next recommended task.** `npm start` and hand-click Step 1 → Step 2 to confirm the tree looks right on screen (still outstanding from the previous block: tristate `indeterminate`, caret styling). Then re-run `check:item-assets-ui` and `check:offline-packaged` with a live dev server. Resume spec-7 (`update_AI_plan_7.txt`) — **plan-only; confirm scope with the owner before coding.**

---

## Handoff — Step 1 structure tree: TWO INTERACTION BUGS FOUND AND FIXED (checkboxes painted unticked; root row toggled everything)

1. **Files changed.**
   - `src/renderer/features/wizard/step-structure.ts` — two fixes (below).
   - `tests/unit/renderer-load-order.test.ts` — added tree interaction guards (~100 lines).
   - `docs/STATUS.md` — this block.
   Temporary diagnostics (`tmp-tree-drive.js`, `tmp-tree-roundtrip.js`, `tmp-*.log`) were created, used, and deleted; none remain.

2. **Symptom.** The document imported and the tree rendered, but the tree's **interaction** was broken.

3. **Root causes — both found by driving the real app over CDP, not by reading code.**
   - **Bug A (`wizardStructureNodeStates`, step-structure.ts:82).** The checkbox state was derived from `wizardStructureState().selected` only. But rule §4.1 at the top of the file says "no ticks yet **means the whole document**", and `wizardStructureToggle` (line 122) starts from `wizardStructureAllIds(tree)` in exactly that state. The two disagreed, so: (a) every checkbox painted **unticked** on first paint (`before: false`), and (b) one click on a section **selected the whole document** (`selected: 45` of 45 nodes) because the toggle saw `checked: false` and added the entire subtree. Fixed by deriving from `wizardStructureAllIds(tree)` whenever `!s.customized`, so the render path and the toggle path agree.
   - **Bug B (`wizardStructureTreeRow`, step-structure.ts:357).** The root row is the document itself and is explicitly **not selectable** (`selectable` is forced off for `tree.root.id`), yet it rendered a real checkbox whose `checked` was permanently forced to `false`. Clicking the document row therefore silently toggled **every** section. Fixed by omitting the checkbox for the root row (`isRoot` is now threaded through the recursion).
   - Evidence that both were live at once: the CDP driver's first checkbox click reported `clickedId: "sec_0"` (the root) with `derivedBefore: { checked: false }` and `selected: 45` — it hit bug B *and* bug A in the same click.

4. **Commands run and results.**
   - `npm run build` → exit 0.
   - `node dist/tests/unit/renderer-load-order.test.js` → **pass** (`33 scripts loaded, step 5 renders (24 scene categories)`).
   - **Guards proven non-vacuous** by deliberate breakage, one at a time: removing the `isRoot` guard → fails with *"the root document row is not selectable and must not render a checkbox"*; reverting `wizardStructureNodeStates` to `new Set(s.selected)` → fails with *"the untouched default (no explicit ticks) means every section is in scope, so every box must render ticked"*. Both restored → pass.
   - `npm test` → **exit 0**.
   - Live CDP round-trip against the running app on the real 34k-char PDF: `totalBoxes: 34` / `totalRows: 35` (root has no box), `rootHasCheckbox: false`, `domCheckedBefore: true`, one click `34 → 33`, re-click `33 → 34`, "Chọn tất cả" → `customized: false` + 34 boxes ticked, "Bỏ chọn tất cả" → `0` selected + `nextDisabledAfterClear: true` + the Vietnamese scope message, and back to default → `finalScopeError: ""`. Collapse round-trip: `rows 35 → 1 collapsed → 35 expanded`, `collapsed 1 → 0`. **No renderer exceptions at any point.**
   - `npx tsc -p tsconfig.json` → clean.

5. **A process note worth keeping.** The test file was damaged mid-round by a PowerShell `Get-Content -Raw` / `Set-Content` round-trip, which double-encoded every Vietnamese character (`'Tổng thời gian…'` → `'TÃ¡Â»â€¢ng…'`) and turned a passing suite red for a reason unrelated to the fix. Recovered by decoding the text back through cp1252 → UTF-8. **Do not rewrite source files through PowerShell text cmdlets; use the editor tool.**

6. **What remains unverified.**
   - Not yet run on the teacher's machine; a packaged `.exe` needs a rebuild.
   - Tree **visuals** (tristate `indeterminate`, caret styling) are still only asserted at unit/DOM-property level, not confirmed by a human looking at the screen.
   - `check:item-assets-ui` and `check:offline-packaged` not re-run.

7. **Next recommended task.** `npm start` and click Step 1 → Step 2 by hand once to confirm the tree looks right on screen. Then the standing item: a lint/test rule that fails when a renderer file *calls* an undeclared identifier (the `wizardStructureScopeError` class of bug, invisible to `tsc` under `@ts-nocheck`). Resume spec-7 (`update_AI_plan_7.txt`) — **plan-only; confirm scope with the owner before coding.**

---

## Handoff — Step 1 "Chọn tệp giáo án": ROOT CAUSE FOUND AND FIXED (`ReferenceError` killed `render()`)

1. **Files changed.**
   - `src/renderer/features/wizard/step-structure.ts` — added the missing `wizardStructureScopeError()` (24 lines).
   - `tests/unit/renderer-load-order.test.ts` — added a step-1 render guard (~27 lines).
   - `docs/STATUS.md` — this block.
   Temporary diagnostics (`tmp-dialog-probe.js`, `tmp-cdp-drive.js`, `tmp-cdp-read.js`, `tmp-diag-structure.js`, `tmp-diag-stage.js`, `tmp-*.log`) were created, used, and deleted; `git status` confirms none remain.

2. **Root cause — reproduced in the real app, not inferred from reading code.** With the app running under `--remote-debugging-port` and driven over CDP, clicking the import button produced:
   `ReferenceError: wizardStructureScopeError is not defined at renderWizardInput (step-input.js:26)`.
   `step-input.ts` **calls** `wizardStructureScopeError()` at line 29 (button disabled-condition) and line 88, but the function **was never defined anywhere in the renderer** — `step-structure.ts` has no such function. Because the renderer is compiled with `@ts-nocheck`, this compiled and shipped happily. The import IPC itself worked (33,978 chars extracted, notice rendered); the `ReferenceError` was thrown when `render()` was called *after* the import, so the create page never repainted — which is exactly the "nothing happens, and no error shown" symptom the teacher reported. The previous round's probe missed it because it stubbed `render()` out of the picture.

3. **Behaviour implemented.** `wizardStructureScopeError()` returns a non-empty Vietnamese message when the teacher has customized the tree scope and ticked nothing (`s.customized && !s.selected.length`), and `''` otherwise (including before the tree exists). That matches the warning `wizardStructurePreviewPanel()` already renders for the same state, and keeps "Tiếp tục" disabled instead of sending `selectedIds: []` to the analyzer.

4. **Commands run and results.**
   - `node tmp-dialog-probe.js` (bare Electron, no app) → dialog opened and returned a real file: **Electron/Windows dialogs are healthy**, ruling out OS-level causes.
   - CDP driver against the running app → captured the `ReferenceError`, and confirmed the button was previously **not rendered at all** (`buttonFound: false`).
   - `npm run build` → exit 0.
   - `node dist/tests/unit/renderer-load-order.test.js` → **pass** (`33 scripts loaded, step 5 renders`), after the fix.
   - Same test with the new function renamed away → **fails** with `ReferenceError: wizardStructureScopeError is not defined`, proving the new guard actually catches this class of bug rather than passing vacuously.
   - `npm test` → **exit 0**, all suites green.
   - Live end-to-end in the running app after the fix: `textLength: 33971`, `treeChildCount: 31`, `firstSectionTitles: ["I. MỤC TIÊU", "1. Kiến thức", ...]`, `notice: "Đã lưu giáo án và tạo dự án…"`, `error: null` — import, structure tree, and save all work.

5. **What remains unverified.**
   - Not yet re-tested on the teacher's own machine/build (the fix is in source; a packaged installer would need a rebuild).
   - The reader can still only inspect the tree it is given; the Step-1 tree **visual** render (checkbox tristate, collapse) is still only covered by unit-level assertions, not by a human looking at it.
   - `check:item-assets-ui` and `check:offline-packaged` were not re-run this round.

6. **Next recommended task.** Run `npm start` and click through Step 1 → Step 2 by hand once to confirm the tree looks right on screen, then resume spec-7 (`update_AI_plan_7.txt`) — **plan-only; confirm scope with the owner before coding.** A cheap follow-up worth considering: a lint/test rule that fails when a renderer file *calls* an undeclared identifier, since `@ts-nocheck` hides this whole class of bug.

## Handoff — Step 1 "Chọn tệp giáo án" does nothing: investigated, not reproduced in code (open)

1. **Files changed.** Only `docs/STATUS.md` (this block). **No product code was modified this round** — the investigation found no defect to fix, so nothing was changed speculatively. A temporary headless probe (`tests/unit/tmp-probe-step1-import.test.ts`) was written, run, and deleted in the same session; `git status` confirms it is gone and no `tmp-*` files remain.

2. **Reported symptom.** The teacher clicks **"⇧ Chọn tệp giáo án"** on wizard step 1 and **no file dialog appears** — and no error message is shown either.

3. **What was checked, and what each check ruled out.**
   - **Renderer wiring is intact.** `step-input.ts` renders the button with `data-wizard-action="import-file"`; `create-wizard.ts:259` dispatches it to `wizardInputImportFile()`; the delegated `click` listener is attached at `create-wizard.ts:130`. `wizardHandleClick` (line 223) has no early return that could swallow it (`!actionBtn || actionBtn.disabled` is the only guard, and the button is only disabled while `wizardState.busy`).
   - **The click really does reach IPC.** A headless `vm` harness in the same style as `renderer-load-order.test.ts` loaded all 33 renderer scripts in `index.html` order with a stubbed `window.eduGame`, then called `wizardInputImportFile()`. It **did** invoke `importDocument()` — the call chain renderer → preload → IPC initiates correctly. (The probe then threw inside the *stub* DOM at `render('#pageCrumb')`; that is a harness limitation, not a product bug.)
   - **Main process handler is present and unmodified.** `ipcMain.handle('files:import-document')` is registered at `src/main.ts:1973` and is identical in the working tree and in `HEAD` (`git diff` on that region is empty), so no recent edit broke it.
   - **All parse dependencies load.** `mammoth 1.13.0`, `pdf-parse 1.1.1`, `jszip`, `better-sqlite3`, `zod` all `require` successfully under this project's CommonJS output (`tsconfig` uses `module: Node16`, `package.json` has no `"type"`). The known `pdf-parse` `module.parent` debug-mode trap does **not** fire here.
   - **The app itself is healthy.** After a clean `npm run build`, `electron .` launched with **empty stderr and empty stdout**, and the `EduGame Studio` window was present and `Responding: True`. So the main process is not crashing at startup and the renderer is not dying on a `ReferenceError`.
   - **The environment is healthy.** An interactive session (Session 1) with `explorer.exe` running, so the native shell that hosts `dialog.showOpenDialog` is available.
   - **Importing has worked on this machine before.** `edugame-data/lessons/doc_0018c4f9-…txt` (25,512 bytes → 19,660 chars, a Vietnamese "TƯ DUY PHẢN BIỆN" lesson) was successfully imported and saved yesterday, so the whole path is not fundamentally broken.
   - **All tests pass.** `npm test` → **exit 0**, no failures; the renderer load-order guard reports 33 scripts loading.

4. **Most likely remaining causes (ranked, none confirmed).** The evidence says the code path is sound at every layer inspectable statically and headlessly, which points at something environment- or interaction-specific rather than a logic bug:
   1. **A stale running instance shadows the new build.** `dist/src/main.js` was written at 00:28 while the session log shows `app.start` at 00:19 — the app being clicked in was started from a build that **predated the last rebuild**. There is no `requestSingleInstanceLock`, so several copies can run and an older one can be the visible one.
   2. **The dialog opens off-screen or behind the window.** `dialog.showOpenDialog(mainWindow, …)` is modal to `mainWindow`; after a display change, or while maximised/fullscreen, it can appear where nobody notices.
   3. **The teacher's copy is a packaged `.exe`, not `dist/`.** The handler needs `mammoth`/`pdf-parse` inside the packaged `app.asar`; an older installer can fail differently there than under `electron .`.
   4. **Window-focus / desktop-session quirk** (PC locked, or launched into a different session) — no evidence, listed only for completeness.

5. **Commands run and results.** `npm run build` → **exit 0** (icons in sync 60, `tsc`, CSS minify; Tailwind's `v4.3.3` banner goes to stderr and is noise). `electron .` → **no output on either stream**, 4 processes, `EduGame Studio` window responding. `npm test` → **exit 0**, all suites green. Dependency `require` probe → all 5 OK. `git diff -- src/main.ts` around the import handler → **empty**. Headless renderer probe → `importDocument()` invoked. Electron stopped; all temporary log files removed; `git status` shows no stray files from this round.

6. **Unverified.** The dialog has **not** been observed opening or failing on the teacher's screen; I cannot see their display, and I do not know whether their running build is current. Nothing here reproduces the fault, so **there is currently no code fix to ship** — the next step needs information only a human at the machine can supply. Writing a speculative fix without a reproduction would repeat the mistake recorded in #79, where the first "obvious" fix was wrong.

7. **Next recommended task.** Get the two facts that discriminate between the causes above, then act: (a) **which build** is being clicked — `npm start` from source, or an installed `.exe` (version from the diagnostics screen); (b) whether the dialog appears **after pressing `Alt+Tab`** (confirms cause 2), or whether **"Nhập trò chơi" / "Nhập câu hỏi"** — which use the same `dialog.showOpenDialog` pattern — also fail (confirms an OS/Electron dialog problem rather than anything specific to step 1). If it is a stale instance, quit every copy and relaunch; if the packaged build is old, rebuild the installer. Only change code once a *specific* failure is reproduced.

---


## Handoff — A parent section now really contains its subtree; analyzer hardened (#79)

1. **Files changed.** `src/services/lesson-structure.ts` (new exported `headingRanges()` — one pass that closes same-or-deeper headings *and* extends every still-open ancestor; `attachHeadings()` now takes its end from it instead of "next heading in document order"; corrected docstring); `tests/unit/lesson-structure.test.ts` (overlap assertions moved from the flattened node list to `root.children`, i.e. only non-ancestor sections; new assertions that a parent starts before its first child and that every child sits strictly inside its parent's range); `tests/unit/lesson-selection.test.ts` (the `LESSON` fixture is now extractor-shaped — one `\n` per line, no blank lines — which is what `pdf-parse`/`mammoth` actually produce; a stale `LESSON_BLANK_LINES` reference at the `buildLessonStructure` call was corrected to `LESSON`). `docs/DECISIONS.md` (#79), `docs/STATUS.md` (this block). No temp files were left behind this round; `tmp-*` and all `DEBUG_*`/`DIAG-*` instrumentation are confirmed absent from the repo.

2. **Behaviour implemented.**
   - **The parent-section range bug is fixed, and it was a real product bug.** The previous code set each section's end to *the next heading in document order*. That is right for a sibling but wrong for a parent: "III. TIẾN TRÌNH DẠY HỌC" ended at its first child, so its own body (and its whole subtree) was **not** sent when the teacher ticked it — the exact opposite of what §5.1 requires. Ranges for the standard fixture are now `Giáo án Khoa học 6 [0,20)`, `I. MỤC TIÊU [20,128)`, `II. THIẾT BỊ DẠY HỌC [128,261)`, `III. TIẾN TRÌNH DẠY HỌC [261,455)` containing `Hoạt động 1 [285,348)` and `Hoạt động 2 [348,455)`, `IV. TỔNG KẾT [455,507)` — contiguous, non-overlapping at the top level, and the last one reaching the end (507 = `LESSON.length`).
   - **Same fix verified on the extractor shape** (no blank lines): `III. TIẾN TRÌNH DẠY HỌC` went from `[183,210)` — title only — to `[183,374)`, containing both activities and reaching the end of the 374-character source. This is the shape a real PDF/DOCX upload takes, so the earlier "sections are selectable" claim did not hold for real input until now.
   - **A first attempt at the fix was wrong and the tests caught it.** Extending only the *innermost* open heading kept siblings from overlapping but left the parent ending at its first child's start (261 vs 285) — a parent that still swallows nothing. The two failing assertions that exposed it were "sections overlap" and "a sibling section leaked in"; both were misleading names for the same defect, so the assertions were rewritten to state what actually matters: non-ancestor sections must not overlap, and a parent must strictly contain its children.
   - **Carried over from this session, unchanged in intent:** `MIN_MARKER_OCCURRENCES` is 3 (a title used twice was being erased as a page header); `isPageRepeat` needs `source` + an adjacent `neighbour` plus `MAX_PAGE_REPEAT_LINES = 1` / `MAX_PAGE_REPEAT_CHARS = 400`; `isNumberedListBlock` (`MIN_LIST_RUN = 3`) stops a `1,2,3…` block from becoming headings; node caps are now `MAX_STRUCTURE_NODES = 500` **per level** plus `MAX_STRUCTURE_TOTAL_NODES = 2000`, with the root always kept and `reason = 'too_many_nodes'`.

3. **Commands run and results.**
   - `npx tsc --noEmit -p tsconfig.json` → **exit 0**.
   - `npm run build` → **exit 0** (icons in sync at 60, `tsc`, CSS minify).
   - `node dist/tests/unit/lesson-structure.test.js` → **`lesson-structure: part 1 ok` / `lesson-structure: ok`**, exit 0.
   - `node dist/tests/unit/lesson-selection.test.js` → **`lesson-selection: ok`**, exit 0.
   - `npm test` (full build + all suites) → **exit 0**, both new suites reported green inside it.
   - `npm run verify:css` → **12/12 compiled-CSS checks passed**, exit 0.
   - Range probe (`node -e` against the emitted JS, both fixtures) produced the offsets quoted in §2 above; probe files were written to `tmp-*` and deleted in the same command.
   - Encoding: the three edited files have **no BOM and no U+FFFD**. They are **CRLF**, which is the repo standard (`git config core.autocrlf` = `true`, no `.gitattributes`) — an earlier "CRLF is a violation" check in this session was a false alarm, not a real defect.

4. **Unverified.** Still nothing seen in a running Electron window: the tree, the CSS from #78 and the Step 2/5 progress UI from #75 have only ever been asserted at string/render level, and `prefers-reduced-motion` remains unchecked by eye. The analyzer is exercised on synthetic fixtures shaped like `pdf-parse`/`mammoth` output plus one real Vietnamese lesson plan during development — **not** through the real import path in the app. `npm run check:item-assets-ui` and `npm run check:offline-packaged` **fail in this environment** with `ECONNREFUSED 127.0.0.1:9341` / `fetch failed`: they need a live Electron dev server and network, and neither touches the files changed here — so they are environment failures, but they were not run green either, and should be re-run somewhere they can connect.

5. **Next recommended task.** (a) **Look at it**: `npm start`, open the wizard's structure step, and confirm the tree renders with indentation, badges and preview, and that ticking "III. TIẾN TRÌNH DẠY HỌC" previews its activities — the range fix is precisely the thing a screen would confirm and a unit test cannot. Then (b) push real `pdf-parse`/`mammoth` output through `buildLessonStructure` on a handful of the teacher's own documents to see whether the heading heuristics hold on genuine extractor noise. Code-side spec-7 work (structure-aware cache keys, `lesson_structures` persistence, oversized-input policy) is deliberately **not** started; confirm scope with the owner first.

---


## Handoff — Structure tree gets its missing CSS; scope-to-prompt proven by test (#76, #77)

1. **Files changed.** `src/renderer/styles/app.css` (new `wizard-tree-*` block: indent by `data-depth`, caret, checkbox, badges incl. `.is-uncertain`, omission warning, preview with `white-space: pre-wrap`, and a `@media (prefers-reduced-motion: reduce)` rule); `tests/unit/lesson-selection.test.ts` (`run()` made async with `.catch` like `lesson-store.test.ts`, new zero-model-call + no-leak section, imports `AiRequestRegistry` / `analyzeLesson` / `LessonChatRequest`); `docs/ROADMAP.md` (Phases 0c/2/3/4 marked done with what was actually verified, Phase 1 narrowed to what is really missing, new Phase 4b); `docs/DECISIONS.md` (#78); `docs/STATUS.md` (this block). Temporary probe: `dist/src/services/lesson-workflow.js` was patched once and restored from `.bak` to prove the new test can fail. Deleted three stale leftovers from the previous session that its own handoff had claimed were gone: `tmp-dbg.txt`, `tmp-out.txt`, `tmp-out-2.txt`.

2. **Behaviour implemented.**
   - **The wizard structure step had no styles at all.** `step-structure.ts` emits `wizard-tree-node/-caret/-title/-size/-badge/-preview/-text/-warning/-figures`, and `app.css` contained **none** of them — the teacher-facing tree would have rendered as an unstyled `<ul>` (flat, no indent per level, no expand/collapse affordance, character counts touching titles, preview collapsing all whitespace). A block at the end of `app.css` now styles it using the existing design tokens (`var(--line)`, `var(--purple)`, `var(--panel)`). Indentation comes from `data-depth`, not nested margins, so a deep tree stays readable. `indeterminate` is set by JS and cannot be tinted by CSS, so the "partly selected" hint rides on `.is-partial` on the title and the "cần xem lại" badge carries a border as well as a colour — no meaning is colour-only.
   - **`prefers-reduced-motion` now covers this step**, matching the policy already used for `.setup-progress` and `.wizard-gen-progress`.
   - **Zero-model-call guard.** Structure building and scope previewing are asserted to make **no** model call (counted, not assumed), and one scoped `analyzeLesson` is asserted to make **exactly one** call whose prompt contains the prepared selection and **none** of the unselected lesson lines. This is the acceptance test Phase 0c was missing.
   - **Correction to the previous handoff block.** Its "unverified" list was wrong on four counts: the import path already routes through `preprocessLessonSource` (`lesson:analyze` → `analyzeLesson` → `preprocessLessonContext`); `selectionFingerprint` is already in the cache key, only when a selection exists; the sliced single call and the full wizard `structure` step already exist; and `getLocalDocumentAnalysisExcerpt` is a leftover helper, not a live bypass. Lesson: **read the call chain before trusting a handoff note about it.**

3. **Commands run and results.**
   - `npx tsc --noEmit -p tsconfig.json` → **exit 0**.
   - `npm run build` → clean (icons + `tsc` + CSS minify).
   - `node dist/tests/unit/lesson-selection.test.js` → **`lesson-selection: ok`**, exit 0.
   - `node dist/tests/unit/lesson-structure.test.js` → **`lesson-structure: part 1 ok` / `lesson-structure: ok`**, exit 0.
   - **Fault injection (the test is not a tautology):** replaced `options.preparedSelection` with `null` in the emitted JS → test **failed** with `unselected lesson text leaked into the prompt: "| Thời gian | Nhiệt độ | Ghi chú |…"`; restored from `.bak` → exit 0 again.
   - `npm test` (full build + all 50 suites) → **exit 0**, last line `Lesson store tests passed`.
   - `npm run verify:css` → **12/12 compiled-CSS checks passed**, exit 0.
   - Minified `dist/src/renderer/styles/app.css` contains `.wizard-tree{`, `.wizard-tree-node[data-depth="2"]`, `.wizard-tree-preview`, `.wizard-tree-badge.is-uncertain`, `.wizard-tree-text{` — confirmed by search, so the rules are not dropped by Tailwind.

4. **Unverified.** No Electron window has ever rendered the structure step: the CSS is checked to exist in the minified stylesheet, **not** visually, and no CDP smoke opens step 1's tree. The analyzer and selection are still exercised only against synthetic `pdf-parse`/`mammoth`-shaped fixtures, not real extractor output. Scope is **not persisted** (no `lesson_structures`, no `lesson:structure-save`), so a reopened project starts with everything selected. The renderer's duplicated selection maths has **no drift test** yet (#71/#75). `getLocalDocumentAnalysisExcerpt` is dead product code kept only for its old test. `smoke66` / `bench` / `real-ai-e2e` were not re-run — their baselines should be unaffected because a no-selection request carries no fingerprint, but that is reasoning, not a measurement.

5. **Next recommended task.** Either (a) **verify visually**: launch the app and screenshot step 1's tree (`tests/ui/ui-*.js` pattern) — the CSS is new and unchecked by eye, and this is the cheapest way to catch a real layout fault; or (b) **the renderer drift test**: extract the tri-state/count maths into one function and assert the renderer's ids and counts match `lesson-selection.ts` for the same fixture. Do (a) first: it validates work already written instead of adding more.

---

## Handoff — Lesson structure analyzer + section selection: both suites green (#76, #77)

1. **Files changed.** `src/services/lesson-structure.ts` (per-line heading collection instead of "first line of a block only", `sec_0h` for a heading at offset 0, page-repeat de-dup, `isBlankLine` regex for the retained `\n`), `src/services/lesson-selection.ts` (`contextSnippet` rewritten to heading + one real sentence, root id refused, partly-sent section reported as both partial and omitted), `tests/unit/lesson-structure.test.ts` (new), `tests/unit/lesson-selection.test.ts` (new), `package.json` (both suites registered in `npm test`), `docs/DECISIONS.md` (#76, #77), `docs/ROADMAP.md` (`update_AI_plan_7` Phases 0a–4), `docs/STATUS.md` (this block). Temporary probes written and deleted: `tmp-cmp2.js`, `tmp-chk*.js`, `tmp-sel*.js`, `tmp-huge*.js`, `tmp-repair.js`, `tmp-strip-bom.js`, `tmp-fix-encoding.js`.

2. **Behaviour implemented.** The analyzer now returns a correct tree for the extractor-shaped text (`pdf-parse`/`mammoth` emit one `\n` per line, no blank lines) that used to lose subsections: a real Vietnamese lesson plan yields `Giáo án Khoa học 6 | I. MỤC TIÊU | II. THIẾT BỊ DẠY HỌC | III. TIẾN TRÌNH DẠY HỌC ▸ Hoạt động 1: Khởi động, Hoạt động 2: Khám phá | IV. TỔNG KẾT`. A parent's range covers its subtree, siblings never overlap, and the last section reaches the end of the document.
   - **`Hoạt động 1` turned out not to be a heuristic bug.** The A/B/C matrix showed heading-alone, heading-plus-sibling and heading-at-EOF all classifying identically; the earlier "vanishes" reports came from a **stale `dist`** while `tsc` invocations were failing. Lesson recorded in #77: when a compiled test contradicts the source, verify the emitted artifact first.
   - **Two real bugs were found by the new selection suite.** (a) A lesson whose first line is already its heading got the node id `sec_0`, colliding with the document root, so `prepareSelectedLessonText` returned **empty text**; such a heading is now `sec_0h` and `resolveSelection` refuses the root id. (b) Ancestor context used to fall back to "the rest of the section", so ticking "Hoạt động 1" also sent **"Hoạt động 2"**: `contextSnippet` now takes the heading plus one real sentence and stops at any heading or table line.
   - **A cut section is now reported twice** — `partialIds` *and* `omitted` — because §5.4/§6 forbid discarding content to meet a size target silently.

3. **Commands run and results.**
   - `npx tsc -p tsconfig.json` → **exit 0**.
   - `node dist/tests/unit/lesson-structure.test.js` → **`lesson-structure: part 1 ok` / `lesson-structure: ok`**, exit 0.
   - `node dist/tests/unit/lesson-selection.test.js` → **`lesson-selection: ok`**, exit 0. Both packages have never been green before this run.
   - `npm test` (full build + every suite, now including the two new ones) → **exit 0**, last line `Lesson store tests passed`.

4. **Unverified.** The analyzer is tested on synthetic fixtures shaped like `pdf-parse`/`mammoth` output, **not** on real extractor output inside the app; no Electron window has shown the tree, and the wizard `structure` step does not exist yet, so nothing teacher-facing is wired. **The import pipeline still bypasses the analyzer**: `getLocalDocumentAnalysisExcerpt` (`src/ai-core/document-assist.ts`) keeps the old first-8 000 + tail + "cắt phần giữa" cut, which `lesson-prompts.ts` still calls. No persistence (no `lesson_structures` table, no IPC) and no `selectionFingerprint` in the cache key yet, so `smoke66`/`bench`/`real-ai-e2e` have not been re-run. `prefers-reduced-motion` remains unverified since #71.

5. **Next recommended task.** Phase 0c: make `getLocalDocumentAnalysisExcerpt` delegate to `preprocessLessonSource`, update `tests/unit/ai-manager.test.ts:114` (its single-run `'A'.repeat(15_000)` fixture pins the old split and disagrees with line-boundary cutting), and add a regression test that importing a document makes **zero** model calls. Then Phase 1 (`lesson_structures` sidecar table + `lesson:structure` IPC).

---

## Handoff — Step 2 now shows the same progress as step 5: a bar, a spinner and the elapsed clock (#75)

1. **Files changed.** `src/shared/generation-eta.ts` (`ANALYSIS_STAGE_ORDER`, `analysisProgressFraction`, `formatStopwatch`), `src/renderer/features/wizard/state.ts` (`WIZARD_ANALYSIS_STAGES_ORDER`, `wizardAnalysisProgressFraction`, `wizardFormatStopwatch`, `analysisFinishedMs` / `generationFinishedMs` + reset, `wizardAnalysisTotalText`, `wizardGenerationTotalText`, `wizardStopActivityClock({ finished })` + `wizardStopGenerationClock`), `src/renderer/features/wizard/step-analysis.ts` (progressbar, spinner, stage counter, cache branch, frozen total), `src/renderer/features/wizard/step-generate.ts` (`wizardStopGenerationClock({ finished })`, step-5 total line), `src/renderer/styles/app.css` (comment only — the `wizard-gen-*` block is now shared), `tests/unit/generation-eta.test.ts`, `tests/unit/renderer-load-order.test.ts`, `docs/DECISIONS.md` (#75), `docs/STATUS.md` (this block).

2. **Behaviour implemented.** Step 2 (Analysis) previously showed a still `⏳` glyph, no bar and no percentage, while step 5 showed all three. It now uses the **same panel vocabulary**: `role="progressbar"` with `aria-label="Tiến trình phân tích"`, a `<strong>N%</strong> · n/4 bước` line, the **same** `WIZARD_GENERATION_SPINNER` beside the running stage (one declaration, `step-generate.ts`), and `⏱ Đã chạy m:ss` ticking from `state.wizardNow`'s 1 s interval — so switching pages and coming back keeps the clock honest.
   - The percentage is a **stage counter** (25 / 50 / 75 / 100 %), never a timer, for exactly the reason #71 gives. A cache hit (`lessonStage === 'cached'`) now says "dùng lại kết quả phân tích trước đó, không gọi AI" instead of pretending four stages ran.
   - **No invented ETA for step 2.** The measured baseline in `ai_tasks` is filtered to `kind === 'generate-lesson'`, so analysis has no samples; the line reads "Đang chạy…" rather than a number. The old constant "thường mất 1–2 phút" is gone.
   - **The total elapsed time is kept after the run ends.** `wizardStopActivityClock({ finished: true })` freezes the real span into `analysisFinishedMs` / `generationFinishedMs`, and the finished panel prints `⏱ Tổng thời gian phân tích: m:ss` (step 2) / `Tổng thời gian tạo nội dung: m:ss` (step 5). Cancelled runs, failures and cache hits freeze nothing — a total is only ever shown for work that really ran. `formatStopwatch` returns `''` for a non-positive span so the line is omitted rather than printing `0:00`.

3. **Commands run and results.**
   - `npx tsc --noEmit -p tsconfig.json` → **exit 0**.
   - `npm run build` → **exit 0** (icons in sync, 60 icons; tailwind emits its usual version banner to stderr, no error).
   - `node dist/tests/unit/generation-eta.test.js` → **`generation-eta: ok`**, exit 0. New checks: the four-step analysis order in the renderer matches `ANALYSIS_STAGE_ORDER`, the step-2 checklist scrapes the same four ids, `analysisProgressFraction` gives 25/50/75/100 and 0 for `cached`, step 2 markup carries the progressbar/aria-label/spinner/elapsed/total-hook, the total is only frozen on a real finished run, and `formatStopwatch` returns `''`, `1:05`, `12:03`, `1:02:03`.
   - `node dist/tests/unit/renderer-load-order.test.js` → **`renderer-load-order: 32 scripts loaded, step 5 renders (24 scene categories)`**, exit 0. It now also calls the real `renderWizardAnalysisProgress()` in the `vm` context (the cross-script dependency on `step-generate.js` and `state.js`), exercises the cache branch, and asserts `Tổng thời gian phân tích: 1:05` after a finished clock.
   - **Both guards were proven to fail.** (a) Pointing step 2 at a non-existent `WIZARD_GENERATION_SPINNER_MISSING` in `dist/` produced `ReferenceError … is not defined`, exit 1 — the "classic script reaches another script's binding" trap from #74. (b) The first draft of the constants guard matched a **comment** containing the old "thường mất 1–2 phút" text, so it failed for the wrong reason and was rewritten to assert on the renderer's *code* (`/Đã chờ/`) — after which it passes on real behaviour.
   - `npm test` → **exit 0**, whole suite, 30 `… : ok` lines + the `lesson-store` runner, no FAIL.
   - Two test bugs the first run caught and that were fixed rather than papered over: a stale `analysisFinishedMs` leaking into the "no `finished`" check, and a cache-branch probe taken while `busy` was still `''`.

4. **Unverified.** **Nobody has seen this on screen.** No Electron run, no screenshot: the bar width, the spinner animation and the two total lines are covered only by unit/render-level assertions. Specifically still owed: (a) does the step-2 panel actually tick every second while the model runs, and does the frozen total appear after it finishes; (b) does a real cache hit on step 2 render the reuse line; (c) `prefers-reduced-motion` has never been checked since #71. Also still owed from earlier: `npm run dist:win` + `Setup-0.3.0.exe`, `.egame` round-trip, the 3/10 generation rate (#69), 5 `ui-play-surface-check` FAILs (#67), the 7-layer scene sign-off (#72), and the step-5 artwork grid review (#73).

5. **Next recommended task.** `npm start`, open the wizard, run step 2 and watch it: a moving spinner, a bar stepping 25 → 50 → 75 → 100 %, `⏱ Đã chạy` increasing every second, and after it finishes `⏱ Tổng thời gian phân tích: …` above the review form. If that holds, continue with `npm run dist:win`.

---
## Handoff — Step 5 crashed on load: a top-level read of a later script's binding (hotfix, #74)

1. **Files changed.** `src/renderer/features/wizard/step-generate.ts` (`WIZARD_ART_SCENE_CATEGORIES` removed as a top-level `const`, replaced by the lazily-built `wizardArtSceneCategories()` + `wizardArtSceneCategoriesCache`; both call sites updated), `tests/unit/renderer-load-order.test.ts` (new), `package.json` (test registered after `generation-eta`), `docs/DECISIONS.md` (#74), `docs/STATUS.md` (this block).

2. **Behaviour implemented.** Opening step 5 threw **"Cannot access '…' before initialization"** and the whole page died before it painted. Cause: `step-generate.ts` built `WIZARD_ART_SCENE_CATEGORIES` **at top level** from `STAGE_ILLUSTRATION_CATEGORY_ICONS`, which is declared by `renderer/features/game-illustration.js` — a script that `index.html` loads at line **94**, fourteen tags *after* `step-generate.js` at line **80**. The `const` was therefore still in its temporal dead zone when the earlier script ran. Fixed by making the list lazy: it is now built on first call (page fully loaded), with a `typeof` guard so a missing registry degrades to "no scene-backed categories" instead of throwing.
   - No behaviour change to the feature itself: the grid, the pickers and the step-5 progress panel are identical once the page is up.
   - **A new guard makes this class of bug impossible to ship again.** `tests/unit/renderer-load-order.test.ts` reads `index.html`, evaluates all 32 renderer scripts *in order* in one shared `vm` context with a minimal DOM stub, then calls `wizardGenerationProgressFraction`, `renderWizardGenerationProgress` and `wizardIllustrationGrid` and asserts they return real output. `tsc` cannot catch this — `strict: false` plus no knowledge of script order makes a cross-file dead-zone read perfectly type-correct.

3. **Commands run and results.**
   - `npx tsc -p tsconfig.json` → **exit 0**.
   - `node dist/tests/unit/renderer-load-order.test.js` → **`renderer-load-order: 32 scripts loaded, step 5 renders (24 scene categories)`, exit 0**.
   - **The guard was proven to fail, not merely green.** Re-injecting the old top-level `const WIZARD_ART_SCENE_CATEGORIES = … STAGE_ILLUSTRATION_CATEGORY_ICONS …` into `dist/` produced `AssertionError: renderer/features/wizard/step-generate.js threw while loading: STAGE_ILLUSTRATION_CATEGORY_ICONS is not defined`, exit 1; `dist` restored and re-run green.
   - `npm test` → **exit 0**, whole suite, including the new test and the unaffected `generation-eta`, `item-assets-*` and `illustration-registry` runs.
   - Temporary probes (`scripts/tmp-tdz.js`, `scripts/tmp-load-order.js`, `scripts/tmp-prove-tdz.js`) were deleted; `scripts/` again holds only the two icon build scripts.

4. **Unverified.** The fix is proven at the script-loader level, **not yet in a running Electron window** — nobody has clicked through step 5 since the hotfix. Visual confirmation of the grid, the "Đổi" popover and the one-at-a-time behaviour is still owed, as are the pre-existing debts (`npm run dist:win` + `Setup-0.3.0.exe`, `.egame` round-trip, 3/10 generation rate #69, 5 `ui-play-surface-check` FAILs #67, `prefers-reduced-motion` since #71, 7-layer scene sign-off).

5. **Next recommended task.** Run `npm start`, open the wizard, reach step 5 and confirm it paints: the five stages, the progress bar, and one artwork card per item with a working "🖼 Đổi" popover. Then continue with `npm run dist:win`.

---
## Handoff — Phase B: per-item artwork you can change, and the matching-pair hole closed (#73)

1. **Files changed.** `src/shared/asset-validation.ts` (`ITEM_ASSET_PATCH_KEYS`, `applyItemAssetPatch`), `src/services/lesson-item-repair.ts` (`patchDraftItemAssets`), `src/services/lesson-contracts.ts` (`itemAssetFieldsSchema` spread into `matchingPairSchema`, `padDraftAssetKeys` covers `matching`), `src/shared/lesson-types.ts` + `src/shared/types.ts` (`ItemAssetFields` on `MatchingPairDraft`/`MatchingPair`), `src/services/game-project-adapter.ts` (pair mapping both ways), `src/main.ts` (`lesson:patch-item-assets`), `src/preload.ts`, `src/renderer/features/wizard/step-generate.ts` (`wizardIllustrationGrid`/`wizardArtCard`/`wizardArtThumb`/`wizardPatchItemAssets`/`wizardToggleArtItem`/`WIZARD_ART_CATEGORY_LABELS`), `src/renderer/features/wizard/state.ts` (`openArtItem`, `artBusy`), `src/renderer/pages/create-wizard.ts` (`change` listener → `wizardHandleChange`, `toggle-art`/`reset-art`), `src/renderer/styles/app.css` (`.wizard-art-*` only), `tests/unit/item-assets-patch.test.ts` (new), `package.json` (test registered), `docs/DECISIONS.md` (#73), `docs/STATUS.md` (this block).

2. **Behaviour implemented.**
   - **Matching pairs keep their artwork.** `matchingPairSchema` never declared `contentCategory`/`iconName`/`illustrationAssetId`, so zod stripped them after the editor wrote them and the adapter read nothing — a pair simply had no picture, with no error anywhere. The schema now spreads `itemAssetFieldsSchema`, both types extend `ItemAssetFields`, the adapter maps in both directions and `padDraftAssetKeys` handles `matching`.
   - **`lesson:patch-item-assets`** changes one item's artwork and nothing else. `applyItemAssetPatch()` is the entire security surface: a **whitelist** over three keys, so a renderer that sends `prompt`, `id`, `correctOptionId`, `points` or `options` writes none of them — the test sends exactly those and asserts they do not land. Absent key = leave, `''` = clear. No model call, so it works with the runtime stopped and costs nothing.
   - **Treasure stores the artwork on the nested `question`**, which is where `EducationalGame` reads it; every write is re-parsed by `parseGameDraft`.
   - **Step 5 shows a per-item artwork grid** built from the same `stageIllustrationHtml()` the play surface uses, with a one-at-a-time "Đổi" popover (asset + content category) and a "Tự động" reset. The header states the active `illustrationMode`, so `manual` mode reads as "mục chưa chọn sẽ không có hình khi chơi" instead of looking broken.
   - **Clearing is stored as absence, not `''`:** `tolerantText` maps `''` → key dropped on re-parse, and both the adapter and the UI treat absence as "no pick". The tests assert that measured behaviour; `contentCategory: ''` is the exception, since `general` is a real category and survives as itself.
   - **A latent test-scraping trap was found and defused.** `generation-eta.test.ts` scrapes `step-generate.ts` for `['stage', 'label']` lines and asserts they are exactly the five MỤC 5 stages; the artwork picker's first version listed its 25 categories in that exact shape and silently joined the match. Labels are now a plain object (`WIZARD_ART_CATEGORY_LABELS`), with a comment recording why.

3. **Commands run and results.**
   - `npx tsc -p tsconfig.json` → **exit 0**, no diagnostics.
   - `node dist/tests/unit/item-assets-patch.test.js` → **`item-assets-patch tests passed`**.
   - `node dist/tests/unit/generation-eta.test.js` → **`generation-eta: ok`** (was failing until the category-literal collision above was removed; re-verified by comparing the scrape of `git show HEAD:…step-generate.ts` = 5 ids against the working tree = 5 ids).
   - `npm test` → **exit 0**, whole suite from `runtime` through the final `lesson-store` run, no FAIL. Includes `item-assets-adapter`, `item-assets-fallback`, `8 item-asset editor round-trip checks`, `31 illustration-registry checks`.
   - `scripts/tmp-probe-assets.js` and the two throwaway shape/HEAD probes were **deleted**; `scripts/` holds only `build-icon-data.js` and `build-icon-registry.js`.

4. **Unverified.** **The grid and the popover have never been seen on screen.** No Electron run, no screenshot, no click — the IPC path, the whitelist, the treasure-nested write, the matching round-trip and the scrape collision are all covered by unit tests, but the CSS (`.wizard-art-grid` auto-fill at 150px) and the one-picker-open-at-a-time behaviour are only reviewed by reading the code. Also unverified by these changes and still owed: `npm run dist:win` + installing `Setup-0.3.0.exe`, the `.egame` export → import → play round-trip, the 3/10 generation rate (#69), the 5 pre-existing `ui-play-surface-check` FAILs (#67), `prefers-reduced-motion` since #71, and the visual sign-off on the 7-layer scene PNGs.

5. **Next recommended task.** Open the app, generate an arena game and a matching game, and look at step 5: confirm the grid renders real scenes, that "Đổi" opens exactly one popover, that a pick survives a step navigation, that "Tự động" clears it, and that a matching pair keeps a picture it did not have before this change. Only then move on to `npm run dist:win` and the `.egame` round-trip.

---
## Handoff — All 24 depth-stack scenes reviewed; three more visual defects fixed and gated (#72 follow-up)

1. **Files changed.** `src/shared/illustration-scene.ts` (`graph` primitive moved far→mid, two new foreground primitives `roots`/`boards`, `stones`/`bushes` geometry corrected), `src/renderer/features/game-illustration.ts` (mirrored 1:1), `tests/unit/illustration-registry.test.ts` (2 new guards: props×fg collision, table-vs-renderer primitive agreement), `tests/manual/scene-preview.js` (`all` keyword + correct default categories, replacing the non-existent `geometry`), `docs/STATUS.md` (this block).

2. **Behaviour implemented.** The remaining 18 scenes were rendered and read by eye (all 24 now reviewed). Five defects that every string test passed were found and fixed:
   - **`stones` clipped at the bottom edge** (visible in `art`, `language`, `history`): the far pair sat at `foot + 10/12`, i.e. 2–4px off the 200px canvas, so it read as a grey bar. All pebbles now sit at or above `foot`.
   - **`props` painted over `foreground` at the frame edges** (`art` showed easel boards on top of its book stack — one unreadable tangle of bars). `stones`/`roots`/`boards` moved inward to x 84..244, leaving the edges to `books`.
   - **`graph` was unreachable on the far layer**: it had been moved to the mid layer, but `math` still asked for it as `horizon`, so `renderFar()` silently returned `''` and the scene lost its entire backdrop while still producing valid SVG. `math` now uses `horizon: 'line'` + `standing: 'graph'`, matching `science`/`technology`.
   - **`plants`/`food` read as a garden gone wrong**: the first `roots` shape curled back on itself (a caterpillar) and `bushes` straddled the horizon (a floating cloud). Reduction to three simple blades per side, and bushes nudged onto the ground band.
   - **`art` had no second depth cue**: `fg: 'stones'` → `fg: 'boards'` (two angled easel canvases).

   Two guards now lock these in: one proves the horizontal spans of `props` and `fg` never overlap for any of the 24 scenes, the other proves every primitive named in a scene table is one the layer that receives it can actually draw.

3. **Commands run and results.**
   - `npx tsc --noEmit` → **exit 0**.
   - `npm run build` → **exit 0**.
   - `npm test` → **exit 0**, whole suite, no FAIL.
   - `node dist/tests/unit/illustration-registry.test.js` → **31/31 pass** (was 29; +2 guards).
   - `node tests/manual/scene-preview.js 9341 all` → **24/24 scenes written and reviewed**, then a second pass on the six changed scenes after the fixes. Artefacts in `tests/manual/out/` (`git check-ignore` confirms `out` at `.gitignore:79`; not fixtures).
   - **Both new guards proven to fail, not merely green.** (a) `props`×`fg`: first version reported `history-scene: props 'books' [242,278] collides with fg 'stones' [228,244]`. (b) Table-vs-renderer: injecting `horizon: 'graph'` into both copies produced `AssertionError: math-scene: horizon uses 'graph', which that layer cannot draw`; both files restored and re-run green. A single-file injection trips the pre-existing renderer-drift guard first, which is why the second probe had to patch both copies.
   - `scripts/tmp-prims.js` used to dump primitives was deleted; no `tmp-*` files remain in `scripts/`.

4. **Unverified.** The play surface itself was **not** screenshotted with the new stack (the preview renders the same compiled renderer, but outside `.stage-illustration`'s real CSS box). `prefers-reduced-motion` remains unobserved since #71. Whether a teacher finds these scenes *recognisable* is a judgement no test makes — this pass proves they are not broken, not that they are good.

5. **Next recommended task.** Phase B: `lesson:patch-item-assets` IPC (three whitelisted fields, no AI), `wizardIllustrationGrid()` with a per-item "Đổi" popover in the step-5 preview, and the `manual` mode that currently produces no illustration. Still owed: `npm run dist:win` + installing `Setup-0.3.0.exe`, the `.egame` export → import → play round-trip, the 3/10 generation rate (#69), the 5 pre-existing `ui-play-surface-check` FAILs (#67), and the live visual review of the Phase C spinner/bar/ETA.

---
## Handoff — Illustrations became depth stacks, and the preview caught three defects (#72)

1. **Files changed.** `src/shared/illustration-scene.ts` (rewritten composition), `src/renderer/features/game-illustration.ts` (mirrored), `tests/unit/illustration-registry.test.ts` (guards rewritten + 4 new), `tests/manual/scene-preview.js` (new), `tests/manual/lib/ui-check-lib.js` (exports `send`), `docs/DECISIONS.md` (#72), `docs/STATUS.md` (this block). `tests/manual/out/scene-*.png` are review artefacts, not fixtures.

2. **Behaviour implemented.** `SceneSpec {motif, subjectY}` → `{sky, horizon, standing, fg, subjectY}`, painted as **`sky → far → mid → halo → subject → props → fg`** (each layer tagged `data-scene-layer`). 20 deterministic primitives across four layers (`sun/moon/rays/stars/clouds`, `hills/mountains/skyline/sea/line`, `trees/bushes/towers/bubbles/graph`, `books/flasks/tools`, `grass/stones/waves`). `SCENE_SUBJECT_SIZE` 168 → **120**, `SCENE_HORIZON` = 150; every `subjectY` ≤ 92 so the subject finishes above the horizon and only the foreground overlaps its feet. All 24 categories re-authored.

   **The preview earned its place.** `tests/manual/scene-preview.js` renders the compiled renderer into a 320×200 node and screenshots it through CDP. Six scenes (math, science, history, animals, space, water-world) were looked at, and three defects that every string test passed were fixed: the ground band **cut the subject in half** (horizon raised, `subjectY` lowered, now a geometry test), `stones` were flat ellipses that read as **smudges** (redrawn as pebbles), `books` were two bars that read as a **slider** (redrawn as a three-spine stack). Also caught: `geometry` is not a real category (the plan's sample list named one that does not exist — the 24 registered ids are the only valid inputs).

3. **Commands run and results.**
   - `npx tsc --noEmit -p tsconfig.json` → **exit 0**.
   - `npm run build` → **exit 0**.
   - `npm test` → **exit 0**, whole suite.
   - `node dist/tests/unit/illustration-registry.test.js` → **29/29 pass** (was 25 before; 5 guards replaced/extended, the "motif repeats the subject" guard became "no sky layer repeats the subject" plus depth/order/horizon guards).
   - `node tests/manual/scene-preview.js 9341 <category…>` → **6/6 scenes written**, each confirmed non-empty *and* read by eye. Screenshots at `tests/manual/out/scene-{math,science,history,animals,space,water-world}.png`.
   - **Drift guard proven to fail, not merely green:** renderer `STAGE_ILLUSTRATION_HORIZON` 150 → 160 produced `AssertionError: horizon in the renderer drifted`, exit 1; restored and re-run to 29/29.
   - Scene table, subject size and horizon equality between the two copies all pass; so do the primitive-coverage checks in both directions used by the renderer.

4. **Unverified.** **18 of the 24 scenes were never looked at** — only the six above were. The play surface itself was not screenshotted with the new stack; the preview renders the same renderer code, but not inside `.stage-illustration`'s real CSS box. `prefers-reduced-motion` is unchanged from #71 and still unobserved. The plan's sample categories (`geometry`, `science`, `history`) partially do not exist — `science` and `history` do, `geometry` maps to `math`.

5. **Next recommended task.** Review the remaining 18 scenes with `node tests/manual/scene-preview.js 9341 <id…>` (run `npm run build`, start the app with `--remote-debugging-port=9341` first) and fix what the eye catches **before** Phase B. Then Phase B: `lesson:patch-item-assets` IPC (three whitelisted fields, no AI), `wizardIllustrationGrid()` with a per-item "Đổi" popover in the step-5 preview, and the `manual` mode that currently produces no illustration. Still owed from before: `npm run dist:win` + installing `Setup-0.3.0.exe`, the `.egame` export → import → play round-trip, the 3/10 generation rate (#69), the 5 pre-existing `ui-play-surface-check` FAILs (#67), and the live visual review of the Phase C spinner/bar/ETA.

---
## Handoff — Step 5 shows a real stage percentage, a spinner and a measured ETA (#71)

1. **Files changed.** `src/shared/generation-eta.ts` (new), `src/renderer/features/wizard/state.ts`, `src/renderer/features/wizard/step-generate.ts`, `src/renderer/styles/app.css` (`@keyframes spin-slow` + `.wizard-gen-*` only), `tests/unit/generation-eta.test.ts` (new), `package.json` (test registration), `docs/DECISIONS.md` (#71), `docs/STATUS.md` (this block).

2. **Behaviour implemented.** Step 5 previously showed five stage labels, a `⏳` glyph and an elapsed clock — on a slow machine the long "Tạo nội dung trò chơi" stage looked frozen. Now:
   - the running stage carries an 11px stroke-only **SVG spinner** (`aria-hidden`, no image asset);
   - a **progress bar + percentage** driven *only* by the stage centres the main process reports (`20/40/60/80/100%`), never by a timer — `ready` is pinned to 100% so a skipped repair stage cannot leave the bar at 80%;
   - an **ETA measured from this machine's own finished generations** (`ai_tasks.started_at`/`finished_at`, median of the last 50, 1 s–3 h window, in-flight row excluded). **With no history it prints "Đang chạy…" instead of inventing a number**, and past the learned total it prints "Đã lâu hơn lần tạo trước" rather than a countdown that never ends;
   - the maths is a pure module (`src/shared/generation-eta.ts`) mirrored in `wizard/state.ts`, because the renderer is flat classic scripts with no bundler and cannot import `src/shared`. A drift test pins the constants, the median index and the fraction formula; the shortfall is documented in #71 rather than hidden.

3. **Commands run and results.**
   - `npx tsc --noEmit -p tsconfig.json` → **exit 0**, clean.
   - `npm run build` → **exit 0** (Tailwind printed its banner to stderr; `Done in 389ms`).
   - `node dist/tests/unit/generation-eta.test.js` → **`generation-eta: ok`**, exit 0.
   - `npm test` → **exit 0**, whole suite (31 test files, `generation-eta` included).
   - **Drift guard proven to fail, not merely green:** changing `WZ_ETA_MIN_SAMPLE_MS` 1000 → 2000 in the renderer copy produced `AssertionError: ngưỡng mẫu tối thiểu trong renderer bị lệch`, exit 1; file restored and re-run green. No `.bak` left behind.
   - Byte-level encoding scan of all 93 `src` files: **only `app.css` is corrupted** (11 comment lines, pre-existing); every `.ts` file is valid UTF-8. PowerShell's rendering was the false alarm, not the repository.

4. **Unverified.** **The spinner, bar and ETA have never been seen on a live run** — a real generation needs the local model, so no screenshot was taken. The ETA path with an actual baseline is untested end-to-end (only the pure functions and the source wiring are). `prefers-reduced-motion` was asserted from the CSS source, not observed. The pre-existing `app.css` comment mojibake was **not** repaired — it is cosmetic and out of scope, but it will keep confusing grep results until someone fixes it deliberately.

5. **Next recommended task.** Phase A of the approved plan: the layered-scene rework of the illustrations (`SceneSpec {motif, subjectY}` → `sky → far → mid → halo → subject → props → fg`, ~8 deterministic primitives, `SCENE_SUBJECT_SIZE` 168 → 120), mirrored into `game-illustration.ts` with a drift test. Render **3 sample scenes** (`geometry`, `science`, `history`) through `capturePage` and get approval **before** scaling to 24 — string tests cannot see an ugly picture (#70 proved this). Phase B (`lesson:patch-item-assets` + per-item "Đổi" in the step-5 preview) and Phase D (notification bell on a `notifications` table) follow. Still owed from before: `npm run dist:win` + installing `Setup-0.3.0.exe`, the `.egame` export → import → play round-trip, and the 3/10 generation rate (#69).

---

## Handoff — Illustrations are scenes now, and the frame finally fits them (#70)

1. **Files changed.** `src/shared/illustration-scene.ts` (new), `src/shared/illustration-registry.ts`, `src/renderer/features/game-illustration.ts`, `src/renderer/styles/app.css` (`.stage-illustration` rules only), `tests/unit/illustration-registry.test.ts`, `docs/DECISIONS.md` (#70), `docs/STATUS.md` (this block).

2. **Behaviour implemented.** The 24 illustrations were one 72px Lucide icon inside a 320×200 frame (~5% coverage). They are now composed scenes — **sky → ground → motif → halo → subject** — with the subject at **168px**, a per-category sky/ground palette and 11 motifs covering the 24 categories. **The eye review is no longer outstanding:** all 24 were rendered and read, and motif mismatches were corrected (environment trees → hills, language clouds → none, weather clouds → sparkles, water-world waves → hills, tree motif redrawn). Three CSS traps were found and fixed; the third explains the earlier bad reading — a `@media (max-height: 760px)` block **hid the illustration entirely** on 1366×768 laptops, so the first measurement (150×94 frame, 79px subject) was measuring a hidden element, not a squashed one. The scene now renders at its authored **320×200** on the real play surface with all four answers on screen.

3. **Commands run and results.**
   - `npm test` → **exit 0**, illustration checks **25/25**.
   - `npx tsc --noEmit` → clean.
   - `npm run build` → exit 0.
   - `node tests/ui/ui-stage-illustration-check.js 9362` → **44/44**.
   - `node tests/ui/ui-fullscreen-density-check.js 9362` → **9/9** (no `pageOverflow`, no `stageOverflow`).
   - Play surface measured through CDP on the live app: frame **320×200**, SVG **320×200**, `unit=1.000` (1 SVG unit = 1 CSS px, so the scene is never downscaled).
   - **Both new guards proven to fail on the reverted rule** (exit 1): a height-without-width rule, and a `display: none` in the short-window block. They are not merely green.
   - `node tests/ui/ui-play-surface-check.js 9362` → **5 FAIL**, all about the *present button* (`30px wide`, `null` label). **Pre-existing, not caused by this work:** re-running the same check with this change's CSS stashed reproduces the same five failures (plus six more from the unstyled page). Tracked with #67.

4. **Unverified.** The 24 scenes were reviewed on one display at one zoom; no teacher has seen them. The short-window (`≤760px`) path was exercised only through the 720px-tall dev window, not on a real 1366×768 projector laptop. The `is-treasure` and `is-race` variants were sized by the same rules but **not screenshotted** this round.

5. **Next recommended task.** Still owed from before, and now the largest gaps: `npm run dist:win` and actually **install** `Setup-0.3.0.exe` (the NSIS installer has never been run — close the app first, otherwise `Access is denied` on `d3dcompiler_47.dll`); then a `.egame` export → disconnect → import → play round-trip. After that, the **3/10 local generation rate** (#69) is the most damaging number in the product. Bundle the two pre-existing play-surface failures (#67 present-button) with whichever of these comes next — do not let them keep being reported as new.

---
## Handoff — Offline proven under a REAL network block (not just "0 requests")

1. **Files changed.** `docs/STATUS.md` (this block) and `docs/DECISIONS.md` (#69). **No product code and no test files changed** — this round was measurement only. Scratch probes were created and deleted; working tree is clean of strays.

2. **Behaviour implemented.** None. What changed is **the strength of the evidence** for the existing offline promise. The previous round proved "0 outbound requests while playing"; a zero count is only as good as the counter. This round **blocked the network at the process level** and re-ran the same checks, so the promise is now demonstrated against a genuinely unreachable internet, not just an unobserved one.

3. **Commands run and results.** Packaged exe launched with `--proxy-server=127.0.0.1:9` (dead port) and a fresh `EDUGAME_USER_DATA`:
   - **Block effectiveness proven first** — `fetch('https://huggingface.co/')` from inside the packaged app → `Failed to fetch` in **2,025 ms**. The block is real; without this the run below would be worthless.
   - `offline-packaged-check` **11/11** with `attempts=0` and a **live positive control** under the block. All five templates drew inline SVG; `illustrationMode: 'off'` drew nothing.
   - App **boot with a clean profile**: `bootRequests: 0`.
   - **Installed model needs no download**: `installLocalAiModel('qwen3.5-2b-q4_k_m')` → `installOk: true` in **~100 s** (SHA-256 verify of the 1,2 GB file, no network), then `startLocalRuntime` → `READY` at `http://127.0.0.1:57952`. `qwen3.5-4b-q4_k_m` correctly reports `installed: false`.
   - **AI generation while the internet is blocked**: 10 attempts of a 3-question `quiz`. **3/10 succeeded** (3 questions, 4 options each, correct Vietnamese: "Cây cần những yếu tố gì để sinh trưởng?"), **7/10 were rejected by the app's own schema validator** with `AI trả về game sai cấu trúc (thiếu đáp án correctAnswer … hoặc thiếu correctOptionId …)`. Every attempt took 34–42 s on this i5-10210U.

4. **A real quality finding, not a bug in the app.** The 3/10 pass rate is the honest number for **Qwen3.5 2B Q4_K_M** generating a strict game schema in one shot. The validator doing its job is *correct behaviour* — it refused to hand a teacher a malformed game. But **3/10 is far too low for a teacher-facing flow**: seven attempts in ten cost ~40 s each and end in an error message. Do **not** describe local generation as reliable on the 2B model. This stands outside the offline question (which passed) and inside the quality question (`docs/BENCHMARKS.md` §O6 measured 6/6 for the *analysis* prompt, which is a different, easier task).

5. **Still unverified.** The **NSIS installer has never been run** (`dist:win` / `Setup-0.3.0.exe`) — only `win-unpacked`, so shortcuts, `installer.nsh` uninstall macro and `ai-local` cleanup remain unproven. No `.egame` import/export round-trip. Nobody has viewed the 24 illustrations by eye. The network block was a **dead proxy**, not an unplugged cable — good enough to make the internet unreachable, but a `netsh`/firewall block needs admin rights this session did not have. Pre-existing baseline unchanged (see #67).

6. **Next recommended task.** The 3/10 generation rate is now the most damaging number in the product; raising it is worth more than another acceptance check. Ranked options: (a) one automatic repair retry on schema failure (the app already has `lesson-item-repair` machinery to reuse), (b) switch fast-tier users to `qwen3.5-4b-q4_k_m` where RAM allows and re-measure the pass rate, (c) tighten the prompt/schema to remove the ambiguity that produces missing `correctOptionId`. Measure the pass rate the same way as above (10 attempts, packaged build) so the improvement is comparable. After that, run `dist:win` and install to close the installer gap.

1. **Files changed.** New: `tests/ui/offline-packaged-check.js` (the Phase 4–5 acceptance step). Modified: `package.json` (`check:offline-packaged`), `tests/README.md` (how to run it + the two traps below), `docs/STATUS.md`, `docs/DECISIONS.md` (#68). No product code changed this round — this was verification work.

2. **Behaviour implemented.** None (no product change). What is now **proven** rather than assumed: the **packaged** build renders the stage illustration on all five templates, `illustrationMode: 'off'` still suppresses it, every illustration is inline SVG with nothing to fetch, and **zero outbound requests** are made while playing. The `.egame`-independent path (games handed straight to `playGame`) plays fine with the packaged `app.asar`.

3. **Commands run and results.** `npm run dist:dir` exit 0 (`release/win-unpacked`, asar contains `dist/src/renderer/features/icon-data.js`, `game-illustration.js`, `dist/src/shared/illustration-registry.js`, `dist/src/preload.js`, `dist/src/main.js`). Against that packaged exe over CDP: `ui-stage-illustration-check` **44/44**; `grading-packaged-check` **7/7**; new `offline-packaged-check` **11/11**, reproduced twice on two fresh ports. The offline counter carries a **positive control** that must fire, because an earlier version of the check silently recorded nothing while every other assertion passed.

4. **Unverified.** Still **not** installed via the **NSIS installer** (`dist:win` / `Setup-0.3.0.exe`) — only `win-unpacked` was run, so the installer itself (shortcuts, `installer.nsh` uninstall macro, `ai-local` cleanup) remains unproven for these phases. No `.egame` file was imported and re-played; the offline check drives `playGame` directly, so the import/export round-trip is **not** covered by it. Nobody has viewed the 24 illustrations by eye. Phase 3's real-model benchmark is still blocked (no `llama-server` / `.gguf` here). Pre-existing, unrelated baseline unchanged: `ui-race-treasure-check` (1 FAIL), `ui-fullscreen-check` (14/16), `ui-play-surface-check` (26/27) — see #67, do not re-triage as Phase 4–5 regressions.

5. **Next recommended task.** Run `npm run dist:win` (close the app first, or electron-builder fails with `Access is denied` on `d3dcompiler_47.dll`), install `release/EduGame-Studio-Setup-0.3.0.exe`, then export a game to `.egame`, disconnect the network, import it and play — that closes the last gap in the offline promise. Then eyeball the 24 illustrations and start Phase 6 on the three pre-existing UI failures.



**Status:** Prototype / handoff build. Do not describe as production-ready.
**Verified 2026-10-23 (newest) — `update_plan_6` Phase 5: chế độ minh hoạ nay THỰC SỰ được đọc, và hình minh hoạ hiện ngay trên màn chơi của cả 5 thể loại.** Trước bước này `gameSetup.illustrationMode` được lưu nhưng **không ai đọc**, nên giáo viên chọn "Tắt" vẫn thấy hình — đây là khoảng trống Phase 4 để lại. Nay có **`src/shared/illustration-registry.ts`** — bộ minh hoạ **cố định, ngoại tuyến** (24 hình, mỗi hình là SVG nội tuyến dựng từ `icon-registry` + bảng màu theo category; **không** ảnh nhị phân, **không** mạng, **không** nội dung do model sinh) — và **`resolveIllustration()`** là **nơi DUY NHẤT** đọc công tắc: `off` → không bao giờ vẽ; `manual` → **chỉ** vẽ hình giáo viên đã chọn, không tự bịa; `auto` → hình đã chọn, nếu không có thì lấy theo category; mode lạ/thiếu → `auto` nên **mọi game đang lưu hiển thị y như cũ**. Hàm **total**: rác vào → `null`, không throw. Phía renderer (`src/renderer/features/game-illustration.ts`) chèn `.stage-illustration` làm **anh em đứng ngay trước `.stage-question`** ở arena/scenario, treasure-hunt, race, và trong `.stage-center` của cả 3 bảng matching (matching vốn **không có** `.stage-question`). **Cạm bẫy nghiêm trọng đã vấp và đã sửa:** bản đầu tôi cho preload `require('../shared/icon-registry')` để renderer lấy dữ liệu icon — preload chạy `sandbox: true`, nên `require` module cục bộ làm **preload chết và `window.eduGame` biến mất hoàn toàn**, tức là **hỏng toàn bộ IPC** của app (phát hiện khi `hasEduGame` = `undefined`; build vẫn xanh nên rất dễ lọt). Nay icon được **sinh vào `src/renderer/features/icon-data.ts`** bằng `scripts/build-icon-data.js`, và `npm run build` có bước **`build:icons:check`** để **fail** nếu bản sao lệch registry (đã thử cố tình sửa file → exit 1). Test mới `tests/unit/illustration-registry.test.ts` (**17 tình huống**: 3 mode, kế thừa mode cũ, `general`, đầu vào rác, SVG tự chứa, và **2 chốt chống lệch** giữa bảng màu/bảng icon của renderer với registry — đã thử sửa palette → exit 1) nối vào `npm test`; `tests/ui/ui-stage-illustration-check.js` chạy trên **app Electron thật** qua CDP, **44/44 PASS** (5 thể loại × 8 kiểm tra + 4), và `ui-fullscreen-density-check` **vẫn 9/9**. **Chưa kiểm chứng:** chỉ bản dev, **chưa chạy installer NSIS**; `ui-race-treasure-check` có 1 FAIL **"treasure: mission controls are reachable after scrolling"** nhưng đó là **lỗi có từ trước, không do Phase 5** (đã chứng minh: khi ẩn hẳn minh hoạ bằng CSS thì vẫn FAIL y hệt); `ui-fullscreen-check` 14/16 và `ui-play-surface-check` 26/27 cũng là **nền có sẵn** (không liên quan minh hoạ).
**Verified 2026-10-23 (newest) — `update_plan_6` Phase 4: trình soạn thảo không còn xoá metadata từng mục, và giáo viên chọn được chế độ minh hoạ.** Lỗi thật được bịt: `saveEditedGame` dựng lại từng mục **theo từng trường** từ DOM, nên trường nào không có trong DOM thì **bị xoá âm thầm** ngay lần lưu đầu tiên — Phase 2 giữ được khoá khi load/export nhưng không cứu được đường qua editor. Nay mỗi mục có 3 input ẩn (`data-field="contentCategory"`/`iconName`/`illustrationAssetId`) ở **cả 5 thể loại** (arena/scenario, cặp ghép, chặng kho báu, câu hỏi đường đua), đọc qua **một** hàm `readEditorItemAssets`, và **sao chép/nhân bản** cũng mang theo khoá. Quy tắc ghi nằm ở `itemAssetFieldsForSave` (`src/shared/asset-validation.ts`), **cố ý trùng** `itemAssetsFromDraft` của adapter: chỉ ghi giá trị đã qua chuẩn hoá, **bỏ `general`** vì thiếu category vốn đã nghĩa là general. Thêm điều khiển **"MINH HỌA"** (Tự động / Chọn thủ công / Tắt) lưu ở `gameSetup.illustrationMode`, áp **một lần** ở đầu `saveEditedGame` thay vì lặp ở 4 nhánh; giá trị lạ/thiếu đọc thành `auto` nên **mọi game đang lưu vẫn chạy nguyên**. **Cạm bẫy đã vấp:** renderer nạp bằng **`<script>` cổ điển**, không import được `src/shared/*` (biên dịch CommonJS) — bản nháp đầu tiên của tôi chép tay danh sách và **bịa 20 category không tồn tại + 47 icon id không có trong registry**; đã thay bằng giá trị sinh trực tiếp từ `CONTENT_CATEGORY_IDS`/`ICON_NAMES` và kiểm lại **25/25 category, 60/60 icon khớp**. Test mới `tests/unit/item-assets-editor.test.ts` (8 tình huống: quy tắc ghi, đầu vào rác không throw, không alias, và **round-trip qua adapter thật**: mục đầy đủ giữ nguyên 3 khoá + `illustrationMode`, mục cũ **không tự mọc thêm khoá**), đã nối vào `npm test`. **Nửa DOM nay ĐÃ được kiểm chứng trên app Electron thật:** `tests/ui/ui-item-assets-editor-check.js` (13/13 PASS, chạy qua `--remote-debugging-port` + CDP) — render→đọc đúng 3 khoá, `general` bị bỏ, icon lạ bị loại, quiz/matching đều render input, **lưu thật rồi đọc lại qua `window.eduGame.getLibrary()` (store trên đĩa) vẫn còn đủ 3 khoá + `illustrationMode`**, và game cũ không tự mọc khoá. Lệnh: `$env:CDP_PORT='9361'; npm run check:item-assets-ui`. `npm run check` exit 0, `npm test` exit 0, `npm run build` OK. **CÒN LẠI:** mới kiểm trên **bản build dev**, **chưa chạy trên bộ cài đóng gói** (NSIS); `treasure-hunt`/`race` được kiểm bằng đọc mã + unit test chứ chưa click trong check (check mới phủ quiz + matching). **Chưa có gì đọc `illustrationMode` khi hiển thị** — đó là Phase 5. Phase 3 **vẫn chưa đo** token/latency (máy này không có llama-server/`.gguf`).

**Verified 2026-10-23 — `update_plan_6` Phase 3: prompt AI đã hỏi 3 trường tuỳ chọn, và app tự điền `contentCategory` khi model bỏ qua.** `LESSON_PROMPT_VERSIONS.draft` **2→3** (khoá cache sinh mới, nội dung cũ không bị dùng lại âm thầm). Thêm hằng `ITEM_ASSET_KEYS_RULE` trong `src/services/lesson-prompts.ts`, chèn vào **cả** `buildDraftPrompt` và `buildItemRegenerationPrompt`: liệt kê **đủ 24 id** từ `CONTENT_CATEGORY_IDS` cho `contentCategory`, nhắc `iconName` ("một tên biểu tượng hợp lệ"), và **cho phép bỏ qua** ("Nếu không chắc, hãy BỎ QUA hai trường này"). **Cố ý không hỏi `illustrationAssetId`:** chọn minh hoạ là tất định trong app (`pickIllustrationForCategory`), để model chọn chỉ tốn token và có thể chọn ảnh lệch chủ đề. Bù lại, `src/services/lesson-workflow.ts` có `fillMissingContentCategories` gọi trong `validate` của `generateGameDraft` (một điểm chặn duy nhất, nên cả app lẫn `bench-ai.js` đều hưởng): điền `inferContentCategory(text mục…, analysis.topic)` **chỉ khi** trường trống/thiếu, **không bao giờ ghi đè** giá trị model trả (kể cả giá trị lạ — chuẩn hoá là việc của adapter theo #60), và **không bao giờ throw**. Test mới `tests/unit/item-assets-fallback.test.ts` (5 tình huống: model bỏ trường → điền `animals`; model trả `sports` khi heuristic đoán `animals` → **giữ `sports`**; giá trị lạ giữ nguyên; chuỗi trắng = thiếu; 1 lần gọi model, không retry). `npm run check` exit 0, `npm test` exit 0 (`item-assets-fallback tests passed`). **CHƯA ĐO ĐƯỢC token/latency:** máy này **không có llama-server và không có file `.gguf`** nào (đã kiểm `Get-Process llama-server` + tìm `*.gguf`), nên `bench-ai.js` chưa chạy được và **cũng chưa xác nhận model thật có tự điền 2 trường hay không** — con số trong `BENCHMARKS.md` cho Phase 3 **vẫn trống**, không được ghi số ước lượng. Vì vậy phần "fall back if cost is material" cũng chưa có số để quyết. **Còn lại:** Phase 4 (editor), Phase 5 (render + minh hoạ).

**Verified 2026-10-23 — `update_plan_6` Phase 2: metadata nội dung theo từng mục (`contentCategory`/`iconName`/`illustrationAssetId`) đã đi xuyên toàn bộ, **và một lỗi tiềm ẩn về `response_format` đã được bắt và sửa**.** Ba trường là **tuỳ chọn + khoan dung** (chuỗi, **không phải enum**): file `.egame` cũ không có trường nào vẫn mở được, và draft AI có giá trị sai kiểu/không tồn tại thì adapter **hạ cấp** (`general` / không icon) chứ không từ chối cả bài. Đã sửa: `src/shared/types.ts` (`ItemAssetFields`, `GameQuestion`/`RaceQuestion`/`TreasureStageQuestion` kế thừa), `src/shared/lesson-types.ts` (`ArenaChoiceQuestion`, `ArenaTextQuestion`, `ScenarioSituation`, `TreasureQuestionDraft`, `RaceQuestionDraft`), `src/services/game-project-adapter.ts` (2 helper + **6 điểm đọc / 5 điểm ghi**), `src/services/lesson-contracts.ts` (`tolerantText` + `itemAssetFieldsSchema` nhân vào **cả 5** schema mục; thêm `padDraftAssetKeys`/`padItemAssetKeys` gọi từ `parseGameDraft` để tập khoá không đổi so với trước). Test mới `tests/unit/item-assets-adapter.test.ts` (4 phần: byte-safety file cũ, dữ liệu độc hại, 5 template draft→game, game→draft + chu trình đầy đủ + round-trip JSON), đã nối vào `npm test`. **Lỗi thật bắt được:** `safeJsonSchema()` nuốt exception rồi trả `null`, nên khi có `.transform()`/`.trim()` thì **zod v4 ném "Transforms cannot be represented in JSON Schema"** và **schema constrained-decoding biến mất khỏi lời gọi model** — bài vẫn parse được nên rất khó thấy. Đã sửa bằng `z.toJSONSchema(schema, { io: 'input' })` (đúng phía: `response_format` mô tả thứ **model phải phát ra**). Kiểm lại: cả 5 `regenerateItemJsonSchemas` + `gameDraft` + phân tích đều **khác `null`** (trước đó arena/scenario/treasure/race là `null`), có `contentCategory`, và **không** có `"type":[…]` mà llama.cpp không nhận. Ghi lại ở `docs/DECISIONS.md` **#63** cùng hai cạm bẫy zod v4 (`.isOptional()` làm `discriminatedUnion` crash; `nullable()` sinh `"type":[…]`). `npm run check` exit 0, `npm run build` exit 0, **`npm test` exit 0** (66 dòng pass + `Lesson store tests passed` qua Electron). **Chưa làm:** prompt AI + `LESSON_PROMPT_VERSIONS.draft` 2→3 và `bench-ai.js` (Phase 3), editor (Phase 4), render + minh hoạ (Phase 5). **Chưa chạy bài thật qua AI để xem model có tự điền 3 trường này không.**
**Verified 2026-10-23 — `update_plan_6` Phase 0 + Phase 1: danh mục nội dung, registry icon, và **khôi phục #57–#59 đã bị xoá**.** Đã dựng lại ba mục quyết định #57–#59 trong `docs/DECISIONS.md` từ `STATUS.md` + `BENCHMARKS.md` (bản gốc chưa từng commit nên không cứu được từ git; mỗi mục ghi rõ **"Reconstructed… original wording lost"**), rồi thêm #60–#62 đúng thứ tự tăng dần. Phase 1: `src/shared/content-categories.ts` (**24 chủ đề + `general`**, `isContentCategory`/`normalizeContentCategory`/`inferContentCategory`), `scripts/build-icon-registry.js` (trích một lần từ `lucide@1.61.0`, ISC), `src/shared/icon-registry.ts` (**60 icon**, sinh tự động, có attribution), `src/shared/asset-validation.ts` (toàn phần, **không bao giờ throw**). **60 tên icon đã được generator xác nhận thật** — 4 tên trong danh sách đề xuất **KHÔNG tồn tại** ở 1.61.0 và đã thay bằng tên thật: `home`→`house`, `trash-2`→`trash`, `waves`→`waves-horizontal`, `music`→`file-music` (`Music`/`Music2`/`Music4` đều không có trong bản này). Test mới `tests/unit/asset-registry.test.ts` đã nối vào `npm test`. **Hai lỗi thật do test bắt được:** (a) generator nối các nhóm bằng `join(',\n')` trong khi mục cuối mỗi nhóm đã có dấu phẩy ⇒ sinh ra `],,` làm hỏng file; (b) `inferContentCategory` dùng `includes()` nên khớp **dưới chuỗi**, và từ khoá quá chung (`câu`, `nghề`, `con số`) gán nhãn sai câu trung tính — đã chuyển sang khớp **theo ranh giới từ Unicode** và bỏ 3 từ khoá quá chung. `npm run check` exit 0, `npm test` exit 0 (41 suite + `lesson-store` qua Electron), `npm run build` exit 0, **60/60 icon**, `DECISIONS.md` **0 mojibake**. **Chưa làm:** schema/adapter (Phase 2), prompt AI (Phase 3), editor (Phase 4), render + minh hoạ (Phase 5). **Chưa ai xem danh sách 24 chủ đề bằng mắt.**

**Verified 2026-10-23 (newest) — Mật độ màn chơi toàn màn hình (#59): 122px trống dưới lưới đáp án là **rule CSS chết**.** Rule toàn màn hình của `.stage-center` viết `html[data-fullscreen="1"] html …` — không có `<html>` lồng trong `<html>` nên **không bao giờ khớp**; `max-width:none`/`gap` lớn trong đó chưa từng chạy, còn trần **1120px** + `align-self:center` vẫn hiệu lực. Đã viết lại rule (một `html`, đặt sau rule thường), chuyển `.game-stage` sang `display:flex; flex-direction:column`, cho lưới đáp án nhận phần dư (`flex:1 1 auto` + `grid-auto-rows:minmax(min-content,1fr)` + `min-height:min-content` ở ô), tăng cỡ chữ đáp án `2.9vh→3.2vh`, và xoá ` .ZZPlaceholder{} ` chẻ đôi rule `.stage-question`. Kết quả cùng máy 1280×721: đáp án 25,7px/115px → **28,6px/174px**, bề rộng 1120 → **1189px**, stage trống 49% → **27,9%**, trống dưới nội dung 122px → **12px**, `ui-fullscreen-density-check` **7/9 → 9/9**; ca biên (câu hỏi 6 dòng) ở 4 cỡ viewport **0 ô cắt chữ**. `npm run build` exit 0, `npm run check` exit 0. **Chưa nhìn bằng mắt trên máy chiếu.** Chi tiết ở mục đầu tiên bên dưới.
**Verified 2026-10-23 — Đợt 2c: L3 xếp hạng trích đoạn bằng truy vấn thật, cộng sửa lỗi tiền xử lý hai lần (#58).** #57 để lại câu hỏi "làm gì với việc fast 12k chỉ giữ 37–66% giáo án thật". Đã loại việc nâng ngân sách: với prefill đo ở #54 (~22,6 tok/s, 771 token ≈ 36 s) thì 12k ký tự ≈ ~2,5 phút và ×1,5 là ~4 phút/lần — quá chậm cho máy pilot; đã hoãn "phân tích theo từng phần" (nhân 2–4 lượt của bước rẻ nhất). Đã làm: `preprocessLessonSource(..., { query })` + `rankBlocksForQuery()` — xếp hạng **có giám sát** bằng truy vấn giáo viên (`buildRetrievalQuery`), thứ tự chọn `fits` → `ranked-query` → `head-tail`; truy vấn không khớp gì thì **quay về head+tail** chứ không gửi trích đoạn tuỳ tiện. Bước `lesson:analyze` **không đổi hành vi** (không có truy vấn), `LESSON_PREPROCESS_VERSION` vẫn **2**, `LESSON_PREPROCESS_RANKING_ENABLED` vẫn `false` (L3 không giám sát vẫn chờ gate O6). Sửa thêm: `analyzeLesson` trước đây tiền xử lý **hai lần** (một lần để log metrics, một lần trong prompt) → nay dựng `prepared` một lần và truyền vào `buildLessonAnalysisPrompt({ prepared })`. Đo trên 4 PDF thật (`tests/manual/measure-query-ranking.js`): head+tail giữ **0/2** câu truy vấn ở **cả 4** tài liệu, xếp hạng giữ **2/2** ở **3/4**; bigram recall tổng thể gần như không đổi (⇒ chỉ được nói "đúng phần được hỏi", **không** được nói "giữ nhiều hơn"). `npm run check` exit 0, `npm test` exit 0 (41 Node suite + `lesson-store` qua Electron, `lesson-preprocess: ok`). **Chưa có caller sản phẩm nào truyền `query`**, chưa chạy model thật, chưa build lại bộ cài. Chi tiết ở mục đầu tiên bên dưới.
**Verified 2026-10-23 — ran the preprocessor on 4 real PDFs and fixed 2 real bugs (#57).** On `tests/tailieu/*.pdf` (11–29 pages) L1 was **deleting real content**: two-column PDFs repeat table cells, so `kiến thức`, `mới`, `Khám phá`, `Vận dụng` and lone `-` bullets were treated as repeated headers and removed. Fixed with `isHeaderLike()` (only lines that *look* like a page header/footer can be dropped) and with re-joining a split bullet instead of deleting it; `LESSON_PREPROCESS_VERSION` 1→**2**. Re-measured: fast (12k) keeps **42–73%** of lesson content (deep 18k: 60–98%), i.e. a real Vietnamese 11–29-page plan loses 27–58% — still better than the previous 8,000+3,900 cut, but **"fewer tokens and nothing lost" must not be claimed**. Also fixed an API trap: passing `{ mode: 'deep' }` (a field that does not exist) **silently** fell back to the fast budget. `npm run check` exit 0, `npm test` exit 0 (40 Node suites + `lesson-store` via Electron). Real-model numbers (prefill seconds, repair rounds) still unmeasured. Details below.
**Last verified:** 2026-10-23 (mới nhất) — **Đã thêm tiền xử lý offline 3 lớp trước bước phân tích giáo án (#56).** Bước `lesson:analyze` nay đi qua `src/services/lesson-preprocess.ts`: **L1** làm sạch (NFC, ký tự điều khiển, CRLF, NBSP, dòng trống, tiêu đề trang lặp), **L2** cắt theo **biên đoạn** với ngân sách 12.000 ký tự (fast) / 18.000 (deep), **L3** xếp hạng đoạn **đang tắt** (`LESSON_PREPROCESS_RANKING_ENABLED = false`) vì bước phân tích chưa có câu hỏi của giáo viên để xếp hạng. Đo trên **fixture tổng hợp**: văn bản dán bẩn **3.073 → 2.411 ký tự (−22%)**, lặp tiêu đề trang **7.301 → 6.238 (−15%)**, chi phí **3,90 ms/lần** trên văn bản 23k ký tự; L3 sẽ tiết kiệm thêm 10.964 ký tự trên giáo án 23k ký tự nếu bật. `npm run check` exit 0, `npm test` exit 0 (40 suite Node + `lesson-store` qua Electron, thêm `lesson-preprocess`). **Chưa chạy model thật** nên chưa biết số giây tiết kiệm và chưa chắc không tăng lượt sửa; cần thu `analyze.preprocess` + `promptTokens` từ log trên giáo án thật. Chi tiết ở mục đầu tiên bên dưới. Trước đó (2026-10-23) — **Đã thu hẹp trích đoạn theo từng mục khi "Tạo lại" (#54 tiếp).** Prompt tạo lại một mục đo được **1.723 token** (fast) / **2.196 token** (deep) — 2,2–2,8× prompt phân tích; nay mục mà **một đoạn tài liệu giải thích rõ ràng** chỉ nhận đoạn đó (bài test 3 đoạn: **658 → 255 ký tự, ~206 → ~80 token**), còn mục trộn nhiều đoạn **giữ nguyên** slice để không mất nguồn. `npm run check` exit 0, `npm test` exit 0. Chưa đo chất lượng câu hỏi với model thật (gate O6), chưa build lại bộ cài. Chi tiết ở mục đầu tiên bên dưới. Trước đó (2026-10-23) — **Đã đo xong mọi cờ khởi động llama.cpp khả thi và kết luận: không đổi code (#54).** Sau khi loại ONNX (#53), câu hỏi tiếp theo là có thể tăng tốc phần *đọc prompt* bằng cờ khởi động không. Đã đo trên đúng máy pilot (i5-10210U, 4C/8T, 16 GB, máy rảnh, prompt giáo án **771 token**, `cache_prompt:false`, thinking tắt, trung vị 3–5 lần sau warm-up), cả 4B Q4_K_M và 2B Q4_0:

| Cấu hình (4B) | Prefill tok/s | Decode tok/s |
| --- | --- | --- |
| `--threads 4` (đối chứng) | 19,92 | 5,23 |
| `--threads 8` (= cấu hình app đang dùng) | **22,59** | **5,80** |
| `--threads 4 --threads-batch 8` | 18,73 | 4,42 |
| `--threads 4 --threads-batch 6` | 18,89 | 4,82 |
| `--threads 4 --ubatch-size 256` | 22,12 | 4,98 |
| `--threads 4 --ubatch-size 1024` | 19,53 | 5,36 |
| `--threads 4 --flash-attn on` | 21,70 | 5,76 |
| `--threads 4 --spec-type ngram-simple` | 21,89 | 5,63 |

⇒ **Tách luồng cho prefill làm chậm cả hai mặt**, còn `ubatch`/flash-attn/ngram không khác `--threads 8` quá độ tản của máy. Lợi ích của 8 luồng là **song song thật**, không phải turbo: với prompt ~5 token thì 4 và 8 luồng **hòa nhau** (10,85 vs 10,76 tok/s) dù xung CPU từ 1508 lên 1609 MHz, trong khi prompt dài thì 8 luồng nhanh hơn. Trên 2B mọi cấu hình nằm trong 54–62 tok/s, độ tản giữa các lần lớn hơn chênh lệch nên không kết luận được gì. Con số `--threads-batch 8` "nhanh hơn" thấy ở lần chạy nhanh ban đầu **không tái lập được** khi chạy đủ 3 lần — đây chính là lý do phải chạy lại trước khi sửa code.

**Phát hiện quan trọng hơn về chi phí thật:** prompt của bước **"Tạo lại một mục"** (`buildItemRegenerationPrompt` + `sourceExcerpt`) là **1.723 token** (fast, 4500 ký tự) và **2.196 token** (deep, 6000 ký tự) — **2,2–2,8 lần** prompt phân tích (771 token). Trên 4B đó là ~**82 s** và ~**102 s** prefill **cho mỗi mục** tạo lại. Vậy đòn bẩy tối ưu tiếp theo là **độ dài prompt/ngân sách ký tự**, không phải cờ llama.cpp; muốn giảm thì phải đo chất lượng câu hỏi vì đó là đánh đổi độ phủ truy xuất.

**Không có thay đổi nào trong repo ứng dụng** (không sửa `src/ai-core/ai-manager.ts`, `resolveCpuThreads` giữ nguyên). Chi tiết số đo và cách chạy lại: `docs/BENCHMARKS.md` mục **O6b**; quyết định: `docs/DECISIONS.md` **#54**. Trước đó (2026-10-23) — **Đã đo và loại ONNX Runtime GenAI; llama.cpp tiếp tục là engine duy nhất (#53).** Câu hỏi đặt ra từ baseline chậm (analyze 266 s / generate 211 s) là *liệu Qwen3.5-4B chạy qua ONNX INT4 có nhanh hơn không*. Đã **xuất được** model ONNX INT4 hai cấu hình (`block_size=32` = 2.73 GB, `block_size=128` = 2.34 GB), `genai_config.json` hợp lệ với `model.type: "qwen3_5_text"`, và cả hai **chạy đúng** (trả lời chính xác, đọc được tiếng Việt/tiếng Anh, không lẫn thinking). Số đo trên đúng máy pilot (i5-10210U, 4C/8T, 16 GB, máy rảnh, thinking tắt, greedy, trung vị của 3 lần):

| | llama.cpp Q4_K_M | ONNX INT4 b=32 | ONNX INT4 b=128 |
|---|---|---|---|
| Dung lượng | 2.74 GB | 2.73 GB | **2.34 GB** |
| Load | **5.6 s** | 16.0 s | 8.5 s |
| Decode (prompt dài) | 5.81 tok/s | 6.40 tok/s | **6.44 tok/s** |
| Prompt processing (dài) | **20.55 tok/s** | 16.41 tok/s | 14.68 tok/s |
| Toàn tác vụ dài (120 token ra) | **31.6 s** | 33.5 s | 35.1 s |
| RAM đỉnh | 4.28 GB | **4.16 GB** | chưa đo |

⇒ **Decode nhanh hơn ~10% nhưng prompt processing chậm hơn 20–30%, nên tác vụ thật (giáo án dài vào, JSON ngắn ra) lại *chậm hơn* 2–4 s**, cộng thêm load lâu gấp 1.5–3×, RAM không giảm. Thêm engine thứ hai (thêm ~50 MB runtime + 2.3 GB model + đường cài đặt + chế độ lỗi mới + router có thể chọn sai trên máy không kiểm được) **không đáng** khi hai bên chỉ chênh vài phần trăm. Theo §120: **dừng, không thêm ONNX Runtime GenAI.**

**Nguyên nhân thật của baseline 211 s chỉ là thinking mode, không phải llama.cpp:** chat template của Qwen3.5 bật `Thinking Process:` trừ khi `enable_thinking` là false (#26, #50). Mọi số đo trên đều **tắt thinking ở cả hai engine**; so với một lần chạy thinking-on chính là chỗ tạo ra con số 211 s gây hiểu nhầm.

Trong quá trình chuyển đổi có 4 chốt chặn đáng ghi lại (chi tiết ở `D:\onnx-build\BENCHMARK.md`): (1) checkpoint FP16 8.9 GB cần **pagefile 32 GB** mới load nổi trên máy 16 GB (`WinError 1455`) — pagefile đã **khôi phục về system-managed** sau khi xong, và model vẫn chạy tốt sau khi khôi phục; (2) `--extra_options` là **list argv riêng**, không phải một chuỗi `key=value` ghép; (3) `exclude_mtp=true` + `prune_lm_head=true` đều bắt buộc; (4) ORT GenAI không biết `Qwen3_5Tokenizer` nên phải đổi `tokenizer_class` → `Qwen2Tokenizer` (tokenizer thuần BPE + ByteLevel). `kv_cache_variant` không dùng được vì chỉ hỗ trợ `PagedAttention`, còn Qwen3.5 dùng `GroupQueryAttention`.

**Không có thay đổi nào trong repo ứng dụng** do thí nghiệm này; `docs/DECISIONS.md` được thêm decision #53. Trước đó (2026-10-22) — **Đã đóng gói lại thành công và kiểm trên bản đóng gói.** `npm run dist:win` exit 0 ⇒ `release/EduGame-Studio-Setup-0.3.0.exe` **92.732.411 bytes** (22/10 22:34), sha256 `e6704a89da0c3277f7cef9fdaa43a5468014fcd209a765a6249007fb555c2b73`, `latest.yml` khớp **sha512 + size** (tự tính lại từ file). Gói nay **có** cả 3 thay đổi dưới đây **và** bản sửa chấm đáp án: giải nén `app.asar` (đóng lúc 22:33, sau mọi lần sửa) kiểm **8/8** dấu vết trong code, rồi chạy chính `release\win-unpacked\EduGame Studio.exe` và đo trên đó: `nav-hint-check` **15/15**, `ui-play-surface-check` **27/27** (câu hỏi **1100px/1280px**), `grading-packaged-check` **7/7** — trong đó *"Đặt câu hỏi."* và danh sách 4 ý gõ bằng dấu phẩy đều ra **✓ Chính xác**, còn đáp án sai/thiếu ý/đảo thứ tự vẫn **✕ Chưa chính xác**. Ba thay đổi:
1. **Nav:** nút *Cài đặt* nằm ngoài `<nav>` (trong `.sidebar-bottom`, một `div` thường) nên không được lưới kéo đầy cột — rộng **113px** trong khi 7 nút kia **213px**, lệch hàng rõ rệt. Thêm `.sidebar-bottom .nav-item{width:100%}` ⇒ cả 8 nút cùng `x=16, w=213`.
2. **Bề rộng nội dung màn chơi:** `.game-stage` là scroll container (`overflow-y:auto`) nên padding hai bên bị cắt; `.stage-center{flex:1}` chỉ co được tới padding box ⇒ cột nội dung **1030px**, câu hỏi **775px** dù khai báo `max-width:1120/1100px`. Đổi sang `align-self:center; width:100%; min-width:min(1120px,100%)` ⇒ cột **1120px**, câu hỏi **1100px**.
3. **Câu nhập đáp án (điền từ / trả lời ngắn):** đáp án chuẩn nay **tối đa 5 từ** (`TEXT_ANSWER_WORD_LIMIT`) — editor **chặn lưu** kèm thông báo nếu dài hơn, prompt AI (Zod + JSON schema + system + genericRules) yêu cầu "tối đa 5 từ, nhiều ý thì ngăn bằng `;`" — và có **gợi ý** (`GameQuestion.hint`, ≤ 200 ký tự) hiện **theo yêu cầu** bằng nút 💡 (không lộ đáp án, không ảnh hưởng điểm), lặp lại trong phản hồi khi trả lời sai.

Kiểm chứng: `npm run check` exit 0; `npm test` exit 0 (**39 suite**); `node tests/ui/nav-hint-check.js` **15/15** (8 check cho nav + 8 cho nút gợi ý); `node tests/ui/ui-play-surface-check.js` **27/27** (trước khi sửa: *"content uses most of the width"* FAIL 843px/1280px); `node tests/ui/grading-packaged-check.js` **7/7** (mới); `node tests/manual/verify-css.js` 12/12. Cả ba script UI nay **cũng đã chạy trên bản đóng gói** (`release\win-unpacked\EduGame Studio.exe`) với cùng kết quả. **Lưu ý:** `tests/ui/ui-play-surface-check.js` trước đây **pass giả** vì thư viện rỗng nên không mở được game nào mà vẫn đo phần tử cũ; nay nó mở game thật qua nút *Chơi* và đặt `data-fullscreen` để bố cục fullscreen áp dụng. Trước đó (cùng ngày) — **Chấm câu "điền từ/trả lời ngắn" đã sửa: dấu câu cuối và dấu phẩy trong đáp án nhiều ý.** Giáo viên nhập đúng *"đặt câu hỏi"* nhưng bài chấm sai; đọc thẳng `edugame.sqlite` trên máy rồi chạy chính `runtime.js` cho thấy đáp án lưu là đúng, lỗi ở bộ so khớp: `normalizeTextAnswer` giữ dấu câu (`"đặt câu hỏi."` ≠ `"đặt câu hỏi"`) và đáp án nhiều ý chỉ so chuỗi tuyệt đối nên `,` ≠ `;`. Nay dấu câu bị coi là khoảng trắng và đáp án nhiều phần so theo đúng thứ tự, chấp nhận cả `;` và `,`; game cũ tự chấm đúng, không cần tạo lại. `npm run check` exit 0; `npm test` exit 0 (**39 suite**), có test hồi quy mới. **Chưa đóng gói lại được**: `npm run dist:win` lỗi `Access is denied` vì `release\win-unpacked\EduGame Studio.exe` đang chạy — đóng app rồi chạy lại. Trước đó (cùng ngày) — **Smoke-test bước 12 của wizard cài AI lần đầu đã sửa: trước đây MỌI lần cài đều thất bại dù runtime và model chạy tốt.** Giáo viên báo lỗi *"AI local khởi động nhưng không trả về nội dung thử nghiệm. Thử lại. Nếu vẫn lỗi, hãy mở Cài đặt để chạy lại phần cài đặt AI."* (`setup-state.json` trên máy: `modelId: qwen3.5-4b-q4_k_m`, `step: smoke-test`, `error.code: startup`). Đã **tái hiện được** bằng cách chạy đúng tham số của app trên runtime + model thật: `GET /health` → 200, nhưng `POST /chat/completions` **không có** `chat_template_kwargs` → llama.cpp b11681 để **thinking bật theo mặc định** của chat template Qwen3.5, nên **cả 8 token đều vào `reasoning_content`**, `content: ""`, `finish_reason: "length"`. Thêm `chat_template_kwargs: { enable_thinking: false }` (đúng thứ app đã dùng ở mọi chỗ gọi AI khác nhưng smoke test bỏ sót) → `content: "OK"`, `finish_reason: stop`, **HTTP 200 trong 1,2 s**. Sửa: `runSetupSmokeTest` nay dùng `...buildGenerationOptions('local', 8)`; `toSetupError` **luôn** gán lỗi ở bước `smoke-test` cho mã `smoke-test` (trước đây câu *"AI local chưa khởi động nên…"* khớp regex `/khởi động/` nên bị gắn mã `startup` và wizard hiện *"AI không khởi động được"* — nhãn sai, dễ khiến giáo viên xoá model tốt). `npm run check` exit 0; `npm test` exit 0 (**39 suite**), 2 test hồi quy mới. Đã **build lại bộ cài**: `npm run dist:win` exit 0 ⇒ `release/EduGame-Studio-Setup-0.3.0.exe` **92.728.000 bytes** (22/10 20:56), SHA-256 `0FC17716240D5D769A4B1EDB43D0C7DAEA423A575D35C287AC7AA5E6CEB41B65`, `latest.yml` khớp size + sha512 **tự tính lại**; giải nén `app.asar` xác nhận có `...buildGenerationOptions('local', 8)` và nhánh `step === 'smoke-test'`. **Bonus đã kiểm được:** file `qwen3.5-4b-q4_k_m` mà app tự tải khớp **đúng** size **2.740.937.888** và SHA-256 `00fe7986…fb69ef11a4` trong danh mục — hash Q4_K_M của 4B là **thật**, không chỉ chép từ metadata. **Chưa** cài `.exe` mới trên máy sạch, **chưa** bấm tay qua wizard UI, **chưa** băm file 2B/7B. Chi tiết mục đầu tiên bên dưới + `docs/DECISIONS.md` #50. Trước đó (cùng ngày) — **Toàn bộ model chuyển sang Q4_K_M; setup lần đầu không tự cài 7B.** Ba mức model cũ `qwen3.5-2b-q4_0` / `qwen3.5-4b-q4_0` / `qwen2.5-7b-q4_0` nay là `qwen3.5-2b-q4_k_m` / `qwen3.5-4b-q4_k_m` / `qwen2.5-7b-q4_k_m`, với size + SHA-256 lấy từ `X-Linked-Size`/`X-Linked-ETag` của đúng revision đã pin trên Hugging Face (cả ba URL trả `HTTP/1.1 200 OK`). `recommendLocalModelId()` chỉ được chọn trong **2B và 4B**, nên máy 16 GB (và cả 64 GB) nhận **4B** thay vì 7B — 7B vẫn còn trong danh mục và vẫn chọn tay được ở Cài đặt → Model. `SETUP_DEFAULT_MODEL_ID` (fallback của renderer) chuyển từ 2B sang `qwen3.5-4b-q4_k_m`. `npm run check` exit 0; `npm test` exit 0, **39 suite**; quét lại `src/` + `tests/` **không còn** id/đường dẫn `q4_0`. Đã **build lại bộ cài**: `npm run dist:win` exit 0 ⇒ `release/EduGame-Studio-Setup-0.3.0.exe` **92.726.822 bytes** (22/10 20:13), SHA-256 `374EA8B5470179F0CDAC0ED301FB93CDD12B048E37E05398435284D4664C53AD`, `latest.yml` khớp size + sha512, `app.asar` **không còn** `q4_0`. **Chưa** tải thật file để tự băm hash, **chưa** đo A/B tốc độ/chất lượng, **chưa** chạy `real-ai-e2e` trên model mới, **chưa** cài `.exe` trên máy sạch. Chi tiết ở mục đầu tiên bên dưới + `docs/DECISIONS.md` #49. Trước đó (cùng ngày) — **Model AI mặc định khi cài lần đầu nay theo cấu hình máy, không còn cứng 2B.** Giáo viên phát hiện wizard luôn tải Qwen3.5 **2B** dù máy đủ mạnh. Nguyên nhân: ba chỗ đều trỏ về `QWEN_LOCAL_MODELS[0]` và **ghi đè** hàm gợi ý theo RAM/CPU — `renderer/setup-wizard-model.ts` (`SETUP_DEFAULT_MODEL_ID`), `features/setup-wizard.ts` (khởi tạo state) và `main.ts` (`DEFAULT_SETUP_MODEL_ID()`). Vì wizard **luôn** gửi `modelId`, nhánh `recommendLocalModelId()` trong `setup-ipc.ts` **không bao giờ chạy**, nên trang Cài đặt → Model (dùng đúng hàm đó) gợi ý 7B trên máy 16 GB trong khi wizard lại cài 2B — hai nơi trong cùng ứng dụng nói hai chuyện khác nhau. Nay: `main.ts` truyền `defaultModelId: recommendedSetupModelId` (một **hàm** async đọc `os.totalmem()`/`os.cpus()` + GPU, gọi `recommendLocalModelId`); `setup-ipc.ts` nhận `string | (() => string | Promise<string>)` và **giải mỗi lần gọi** (giữ `string` để không phá test cũ); wizard khởi tạo `modelId: null` → gửi `{}` cho `setup:preflight` để backend tự gợi ý, rồi **adopt** `status.plan.model.id` nên `start` xin đúng model đã hiển thị; dòng "Model AI" thêm hint "Bản phù hợp nhất với CPU và RAM của máy này" để lựa chọn có lý do. Kết quả theo `recommendLocalModelId`: máy 8 GB → 2B, 12 GB → **4B**, **≥ 16 GiB (17,18 GB) → 7B** (máy 16 GB thương mại vẫn ở 4B — xem mục Lưu ý bên dưới). Kiểm chứng: `npm run check` exit 0; `npm test` exit 0 (**39 suite**, baseline 39 giữ nguyên); 4 test mới **đã chứng minh đỏ khi gỡ bản sửa** — `setup-ipc.test.ts` (`||`→`??` ⇒ actual `qwen3.5-2b-q4_0` / expected `qwen3.5-4b-q4_0`), `setup-wizard-model.test.ts` (gỡ `hint` ⇒ "the model row must justify the choice"), `setup-wizard-ui.test.ts` (gỡ adopt ⇒ "the wizard must adopt the recommended 4B model instead of its 2B fallback"), `model-catalog.test.ts` (thêm ca 12 GB → 4B + chặn gợi ý 2B cho máy mạnh). Đã **dựng lại bộ cài** (bản cũ 19:27 **không có** thay đổi này): `npm run dist:win` exit 0 ⇒ `release/EduGame-Studio-Setup-0.3.0.exe` **92.725.399 bytes** (22/10 19:46), SHA-256 `CA85A17B5FB18CA5B7A5B9CB7112F65A3E2343F7A311C7E9FE500A76FCB31101`, `latest.yml` khớp **cả size lẫn sha512 tự tính lại**, `app.asar` 4.190 entry; kiểm trong asar: `main.js` **có** `recommendedSetupModelId` và **không còn** `DEFAULT_SETUP_MODEL_ID`, `setup-ipc.js` await hàm default, wizard khởi tạo `modelId: null` + gửi `{}` + adopt plan, dòng model có hint. **Đo trên app đóng gói** (`win-unpacked` + CDP): `preflightSetup({})` trên máy i5-10210U / 8 luồng / 16 GB trả `plan.model.id = qwen3.5-4b-q4_0` (**2,58 GB**), không còn 2B. **Lưu ý (cần quyết định):** máy này 16 GB RAM nhưng `recommendLocalModelId()` chọn **4B chứ không phải 7B**, vì nó nhận `os.totalmem()` = đúng 16 GB trong khi `hardware-detector` báo **16,9 GB** (17.101,6 MB ÷ 1024³ ≈ 16,7). Ngưỡng khuyến nghị của 7B là **≥ 16 GB**, tức `totalRamBytes < 16 GiB` — máy 16 GB thực tế rơi sát biên nên không đạt. Đây là chỗ dễ gây khó hiểu: wizard hiển thị "16,9 GB" ở dòng RAM nhưng lại chỉ cài 4B. Cần thống nhất một nguồn đo (hoặc hạ ngưỡng 7B xuống 15,5 GB) trước khi chốt mặc định cho máy 16 GB. **Chưa verify:** chưa **cài bằng `.exe` trên máy sạch**, bộ cài **chưa ký số**, chưa tải model thật (2,58 GB), chưa bấm tay. **Quyết định còn treo:** vẫn là **Q4_0**, không phải Q4_K_M như spec §5 (xem `DECISIONS.md`). Trước đó (cùng ngày) — **Bộ cài mới để test trên máy khác:** `npm run dist:win` exit 0 sau `npm run check` exit 0 và `npm test` exit 0 (**39 suite**), 63,5 s ⇒ `release/EduGame-Studio-Setup-0.3.0.exe` **92.722.660 bytes** (22/10 19:27), SHA-256 `6CF0A311113237112B76BA34522F5A7C9AE80323BCF126C22AC0692308D357E3`. **Không chỉ tin exit code** — đã kiểm nội dung gói: `latest.yml` sha512 **khớp giá trị tự tính lại** và size khớp; `app.asar` 4.190 entry, **31/31** `<script src>` + **1/1** CSS trong `index.html` của gói **đều tồn tại** trong asar; các module mới `setup-wizard`, `setup-wizard-model`, `presentation`, `presentation-types`, `setup-{orchestrator,ipc,state}`, `runtime-{resolver,manifest}`, `hardware-detector`, `item-capacity` **đều có**; **3/3** DLL VC++ trong `resources/vc-runtime`. Đã **chạy app đã đóng gói** (`release/win-unpacked/EduGame Studio.exe`) trên CDP: cửa sổ mở, `document.readyState=complete`, **31 script nạp đủ**, 200 CSS rule, **0 lỗi uncaught/console** trong 4 s, `window.eduGame.getSetupStatus()` trả `step: idle` + nhận diện đúng CPU/RAM thật, `data-setup-fullscreen="1"` (wizard tự mở vì máy chưa cài AI). Sau khi kiểm đã xoá `release/win-unpacked` ⇒ `release/` còn **88,53 MB**. **Chưa verify:** chưa **cài bằng `.exe` trên máy sạch** (mới chỉ chạy bản unpacked), bộ cài **chưa ký số** (SmartScreen sẽ cảnh báo), chưa tải model 1,1 GB thật, chưa bấm tay. Trước đó (cùng ngày) — **Dọn dự án trước khi commit:** `tests/` từ 76 file phẳng → 4 nhóm `unit/` (39 `*.test.ts`) · `ui/` (5 CDP) · `smoke/` (25) · `manual/` (11 script tay + `lib/`), kèm `tests/README.md` giải thích nhóm nào chạy bằng `npm test`; **37 file test + 94 import** được sửa `../src` → `../../src` (và 2 `require`, 3 `helpers`), 2 test trước đây **bị bỏ sót** (`display-policy`, `item-capacity`) đã vào `npm test` ⇒ **39 suite**; xoá 8 file `smoke*-report.json` (đã ignore, không track), `release/win-unpacked` (–330 MB), thư mục rỗng `.qodo`; `package.json` thêm `verify:css` + `test:ui`, `.gitignore` thêm `.qodo/`; đường dẫn test trong `docs/` + `README.md` (sơ đồ cấu trúc viết lại cho khớp `ai-core/`, `presentation/`, `services/`) đã cập nhật. Kiểm chứng sau khi dọn: `npm run build` exit 0, `npm test` **exit 0**, `node tests/manual/verify-css.js` **12/12**. **Chưa verify:** các script `ui/`, `smoke/`, `manual/` chưa chạy lại trên app thật sau khi đổi thư mục (chỉ kiểm `require`/đường dẫn tĩnh). Trước đó (cùng ngày) — **Setup chiếm toàn bộ cửa sổ:** wizard cài AI lần đầu không còn là hộp thoại nổi trên app mà là màn hình phủ kín viewport (`html[data-setup-fullscreen="1"]` ẩn `.app-shell`/`.topbar`/`.ai-status-bar`, markup `.setup-fullscreen` thay cho `modal-backdrop`); đã đo trên Electron thật + CDP **PASS 11/11** (`tests/ui/ui-setup-fullscreen-check.js`), `npx tsc --noEmit` exit 0, `npm test` exit 0 (**34 suite**), `npm run build` exit 0. **Chưa verify:** chưa cài máy sạch, chưa thử trên màn 1366×768 / scale 125%, chưa thử theme tối. Trước đó (cùng ngày) — **Sửa lỗi "modal giật khi đang tải AI local":** thanh tiến trình cài AI dựng lại **toàn bộ** `#modalRoot.innerHTML` cho **từng** sự kiện `setup:progress`, mà `ModelInstaller` phát một sự kiện cho **mỗi chunk mạng** (model 1,1 GB ⇒ hàng trăm lần/giây) ⇒ modal giật, animation sọc bị khởi động lại, focus bị mất. Nay sự kiện được **gộp theo `requestAnimationFrame`** (giữ sự kiện mới nhất) và chỉ **vá tại chỗ** số liệu (`aria-valuenow`, `style.width`, `textContent`), cấu trúc modal chỉ dựng lại khi thật sự đổi (`setupWizardStructureKey`). Đo bằng Electron thật + CDP (`tests/ui/ui-setup-progress-check.js`, `MutationObserver` trên `#modalRoot`): **400 sự kiện → 2 lần dựng DOM**; đối chứng bằng cách tạm vô hiệu bản sửa: **400 sự kiện → 401 lần dựng** (đúng 1:1, chính là nguyên nhân giật). Test hồi quy `tests/setup-wizard-ui.test.ts` khẳng định **không** render theo từng sự kiện và đã được kiểm là **đỏ** khi gỡ bản sửa. `npx tsc --noEmit` exit 0; `npm test` exit 0 (**34 suite**). **Chưa verify:** chưa tải model 1,1 GB thật sau khi sửa; chưa xác nhận triệu chứng thứ hai "AI không khởi chạy" với log của máy i3 — xem mục "Lỗi giáo viên báo 22/10" bên dưới. Trước đó (cùng ngày) — **Build lại bộ cài có wizard UI:** `npm run dist:win` exit 0 → `release/EduGame-Studio-Setup-0.3.0.exe` **92.717.764 bytes** (22/10 17:46); giải nén `app.asar` kiểm được wizard **có trong gói**, **31/31** script trong `index.html` tồn tại đúng thứ tự, model **không** còn CommonJS (`exports`/`require`), `latest.yml` khớp sha512 **tự tính lại**; **chưa cài máy sạch, chưa mở app đã gói, chưa bấm tay** — chi tiết ở mục đầu tiên bên dưới. Trước đó (cùng ngày) — **Wizard UI cài AI lần đầu (Đợt 4):** đã có giao diện thật theo §7 với **10 màn** (chào mừng, kiểm tra máy, yêu cầu máy, đang tải, đang xác minh, đang khởi động, xong, lỗi có thử lại, chặn không thể cứu, tiếp tục lần trước); tự mở sau khi app khởi động nếu AI chưa cài; có nút **"Cài đặt lại AI từ đầu"** trong Cài đặt. Logic quyết định tách ra `src/renderer/setup-wizard-model.ts` để **test được bằng `node`**, phần DOM `src/renderer/features/setup-wizard.ts` test chạy thật trong `vm`. `npx tsc` exit 0; `npm test` exit 0 (**36 suite**, 2 suite mới); `npm run build` exit 0, **31/31** script trong `index.html` đều tồn tại trong `dist`. **Chưa chạy app Electron thật, chưa cài máy sạch, chưa bấm thử bằng tay** — chi tiết ở mục đầu tiên bên dưới. Trước đó (cùng ngày) — **Đóng gói bộ cài:** `npm run dist:win` exit 0 → `release/EduGame-Studio-Setup-0.3.0.exe` **92.691.696 bytes** (22/10 16:44); bản cũ 21/10 **thiếu** `setup-*.js` trong `app.asar`, bản mới **có đủ** 3 module + 5 kênh `setup:*` khớp preload; `npm test` khi đó **35 suite** exit 0; **chưa cài thử trên máy sạch, bộ cài chưa ký số**. Trước đó (cùng ngày) — **Cài đặt AI lần đầu, Đợt 3: nối vào Electron** (`main.ts` dựng `SetupOrchestrator` + smoke-test thật + `setup-state.json`; `preload.ts` có `setup:*`; `tests/setup-wiring.test.ts` giữ cho đường nối không lệch). Trước đó (cùng ngày) — **Cài đặt AI lần đầu, Đợt 2** (orchestrator + IPC hẹp: `setup-orchestrator`, `setup-ipc`, `diskFreeBytes` nối `fs.statfs`; 2 suite mới).
 `npm run dist:win` exit 0 → `release/EduGame-Studio-Setup-0.3.0.exe` **92.717.764 bytes** (22/10 17:46); giải nén `app.asar` kiểm được wizard **có trong gói**, **31/31** script trong `index.html` tồn tại đúng thứ tự, model **không** còn CommonJS (`exports`/`require`), `latest.yml` khớp sha512 **tự tính lại**; **chưa cài máy sạch, chưa mở app đã gói, chưa bấm tay** — chi tiết ở mục đầu tiên bên dưới. Trước đó (cùng ngày) — **Wizard UI cài AI lần đầu (Đợt 4):** đã có giao diện thật theo §7 với **10 màn** (chào mừng, kiểm tra máy, yêu cầu máy, đang tải, đang xác minh, đang khởi động, xong, lỗi có thử lại, chặn không thể cứu, tiếp tục lần trước); tự mở sau khi app khởi động nếu AI chưa cài; có nút **"Cài đặt lại AI từ đầu"** trong Cài đặt. Logic quyết định tách ra `src/renderer/setup-wizard-model.ts` để **test được bằng `node`**, phần DOM `src/renderer/features/setup-wizard.ts` test chạy thật trong `vm`. `npx tsc` exit 0; `npm test` exit 0 (**36 suite**, 2 suite mới); `npm run build` exit 0, **31/31** script trong `index.html` đều tồn tại trong `dist`. **Chưa chạy app Electron thật, chưa cài máy sạch, chưa bấm thử bằng tay** — chi tiết ở mục đầu tiên bên dưới. Trước đó (cùng ngày) — **Đóng gói bộ cài:** `npm run dist:win` exit 0 → `release/EduGame-Studio-Setup-0.3.0.exe` **92.691.696 bytes** (22/10 16:44); bản cũ 21/10 **thiếu** `setup-*.js` trong `app.asar`, bản mới **có đủ** 3 module + 5 kênh `setup:*` khớp preload; `npm test` khi đó **35 suite** exit 0; **chưa cài thử trên máy sạch, bộ cài chưa ký số**. Trước đó (cùng ngày) — **Cài đặt AI lần đầu, Đợt 3: nối vào Electron** (`main.ts` dựng `SetupOrchestrator` + smoke-test thật + `setup-state.json`; `preload.ts` có `setup:*`; `tests/setup-wiring.test.ts` giữ cho đường nối không lệch). Trước đó (cùng ngày) — **Cài đặt AI lần đầu, Đợt 2** (orchestrator + IPC hẹp: `setup-orchestrator`, `setup-ipc`, `diskFreeBytes` nối `fs.statfs`; 2 suite mới).

## Mật độ chữ màn chơi toàn màn hình: 122px trống là **rule CSS chết** (#59, 2026-10-23, mới nhất)

**Giáo viên báo:** ở chế độ toàn màn hình (⛶) chữ câu hỏi/đáp án vẫn nhỏ và còn nhiều chỗ trống chưa dùng.

**Số đo trước khi sửa** (Electron 1280×721 = laptop 1366×768 trừ taskbar, `node tests/ui/ui-fullscreen-density-check.js 9357`): câu hỏi 45,3px nhưng khung chỉ **1120px** (88% bề rộng), đáp án 25,7px / cao 115px, **49% diện tích stage trống**, **122px trống dưới lưới đáp án** → **7/9**.

**Nguyên nhân — không phải như hai ghi chú trước:**
- `.game-stage` **đúng là** grid (`27,3px 154,2px 424,5px`) nhưng `.stage-center` đo được **đúng bằng chiều cao nội dung** (424px = các con 384px + 4 gap × 10px), `scrollHeight === clientHeight` — **không có tràn, không có hàng bị phình**.
- Lỗi thật: rule toàn màn hình của `.stage-center` viết là `html[data-fullscreen="1"] **html** .modal[…]` → **không có `<html>` lồng trong `<html>`**, `el.matches()` trả `false`, **cả khối là rule chết**. Vì vậy `max-width:none`, `align-content:start`, `gap` lớn… chưa từng chạy; rule thường (`flex:1`, `align-self:center`, trần **1120px**) vẫn giữ nguyên. Một lỗi này giải thích cả ba triệu chứng: trần 1120px, khối bị canh giữa (74px trống trên + 122px dưới lưới), và cỡ chữ nhỏ.

**Đã sửa** (chỉ `src/renderer/styles/app.css`, chi tiết ở DECISIONS #59): rule toàn màn hình viết lại với **một** `html` và đặt sau rule thường; `.game-stage` khai báo rõ `display:flex; flex-direction:column`; `.stage-center > .answer-grid` nhận `flex:1 1 auto` + `grid-auto-rows: minmax(min-content, 1fr)` (phần dư dồn vào nút đáp án, `min-content` bảo đảm không cắt dòng cuối); ô đáp án có `min-height: min-content`; cỡ chữ đáp án `2.9vh → 3.2vh` (+ sàn `max-height:800px`: `2.5vh → 2.9vh`); cả ba bản sao `gap` của `.stage-center` tăng lên `1.6vh`/`18px`. Đã xoá ` .ZZPlaceholder{} ` nằm giữa rule `.stage-question` (chẻ rule làm hai, nửa sau thành khối CSS không hợp lệ).

**Số đo sau khi sửa (cùng máy, cùng fixture):**

| Chỉ số | trước | sau |
| --- | --- | --- |
| Câu hỏi | 45,3px / 1120px | 45,3px / **1189px** (93% bề rộng) |
| Đáp án | 25,7px, cao 115px | **28,6px**, cao 174px |
| Lưới đáp án | 1120px, 2 cột | 1189px, 2 cột |
| Diện tích stage trống | 49,0% | **27,9%** |
| Trống dưới nội dung | 122px | **12px** (39px trong đó là thanh `Tiếp tục`) |
| `ui-fullscreen-density-check` | 7/9 | **9/9** |

**Ca biên** (câu hỏi 6 dòng + 4 đáp án dài, đổi viewport bằng CDP Device Metrics): 1280×720, 1024×600, 1366×705, 1920×1010 → **0 ô bị cắt chữ**, không cuộn trang ở cả 4 cỡ; stage tự cuộn khi nội dung thật sự không vừa (1024×600).

**Đã sửa luôn cách đo:** `ui-fullscreen-density-check` tính "trống dưới đáp án" từ **đáy lưới** nên đếm cả thanh `Tiếp tục` là chỗ trống (112px giả). Nay đo tới phần tử **hiển thị cuối** của `.stage-center`, và in riêng khoảng dưới lưới để tham khảo.

**Lệnh đã chạy:** `npm run build` exit 0 · `npm run check` exit 0 · `node tests/ui/ui-fullscreen-density-check.js 9357` **9/9** · script đo ca biên 4 cỡ viewport **4/4**.

**Chưa xác minh:** chưa ai nhìn bằng mắt trên máy chiếu thật; `tests/ui/ui-race-treasure-check.js` vẫn **18/19** nhưng lỗi còn lại là fixture treasure không lưu được (`questions: []`) — văng trước khi chạm vào thay đổi này; `tests/ui/ui-play-surface-check.js` báo lỗi ở khung đo đầu tiên **cả trên bản CSS gốc chưa sửa** nên không dùng làm bằng chứng.

## Đợt 2c: xếp hạng trích đoạn bằng truy vấn thật + sửa tiền xử lý hai lần (#58, 2026-10-23, mới nhất)

**Bối cảnh:** #57 để lại một câu hỏi mở: giáo án thật 11–29 trang chỉ giữ 37–66% nội dung ở ngân sách fast 12k. Ba hướng đã cân, và **hai hướng bị loại bằng số đo chứ không bằng cảm giác:**
- *(c) Nâng ngân sách fast* — bị **loại**. Prefill đo ở #54 là ~22,6 tok/s trên máy pilot, 771 token ≈ 36 s ⇒ 12k ký tự ≈ ~3.000 token ≈ **~2,5 phút**; ×1,5 là **~4 phút/lần**. Chậm thêm 1,5 phút mỗi lần phân tích là hồi quy, không phải tối ưu.
- *(b) Phân tích theo từng phần* — **hoãn**. Nhân 2–4 lần số lượt của **bước rẻ nhất** trong pipeline và cần thêm đường gộp/sửa. Cùng nội dung đó vừa một lượt nếu **chọn** đúng thay vì cắt.
- *(a) Xếp hạng có giám sát* — **đã làm**.

**Đã làm:**
1. `PreprocessOptions.query` + `rankBlocksForQuery()` trong `src/services/lesson-preprocess.ts`. Thứ tự chọn: tài liệu **vừa ngân sách** (`fits`) → **`ranked-query`** (chỉ khi một token của truy vấn **thật sự xuất hiện**) → `head-tail`. Truy vấn không khớp gì ⇒ **quay về head+tail**, không gửi trích đoạn tuỳ tiện. `ranking: false` luôn thắng. Khối `blockValue() === Infinity` (bảng, công thức, câu hỏi, đáp án, số đo) **luôn được giữ** như đường cũ.
2. Truy vấn dùng đúng `buildRetrievalQuery()` (chủ đề + mục tiêu trọng tâm + khái niệm chính) — **một định nghĩa** "giáo viên hỏi gì", không tạo bộ từ vựng thứ hai. Ghi rõ trong JSDoc của hàm đó.
3. **Sửa lỗi: `analyzeLesson` tiền xử lý hai lần.** Trước đây nó gọi `preprocessLessonContext()` để log metrics, rồi `buildLessonAnalysisPrompt()` lại gọi lần nữa. Kết quả trùng hôm nay, nhưng hai lần tính độc lập cho cùng một câu trả lời ⇒ chỉ cần một tuỳ chọn đổi giữa hai lần là log mô tả văn bản model **không hề đọc**. Nay `prepared` dựng **một lần**, log từ đó, và prompt nhận `buildLessonAnalysisPrompt({ prepared })`.
4. Test hồi quy mới trong `tests/unit/lesson-preprocess.test.ts`: truy vấn chạm được phần giữa mà head+tail bỏ; truy vấn không khớp ⇒ `head-tail`; truy vấn chỉ có dấu câu ⇒ `head-tail`; `ranking:false` thắng truy vấn; đáp án và bảng không bị xếp hạng ra; prompt dùng lại `prepared` và vẫn báo "đã được rút gọn".

**Không đổi:** bước `lesson:analyze` vẫn head+tail (ở đó **chưa có** câu hỏi của giáo viên) ⇒ hành vi phân tích và `LESSON_PREPROCESS_VERSION = 2` giữ nguyên; `LESSON_PREPROCESS_RANKING_ENABLED` vẫn `false` (xếp hạng **không** giám sát vẫn phải qua gate O6). `LESSON_PROMPT_VERSIONS.item` **không** bump: nội dung chỉ được tạo lại khi prompt đổi, và truy vấn nằm **trong** prompt nên hai truy vấn khác nhau đã là hai prompt khác nhau.

**Đo (4 PDF thật, `tests/manual/measure-query-ranking.js`, chi tiết §O6f):** truy vấn = 2 câu dài nhất của **đúng phần một phần ba giữa** (phần head+tail cắt). head+tail giữ **0/2** câu được hỏi ở **cả 4** tài liệu; xếp hạng có truy vấn giữ **2/2** ở **3/4**. Recall bigram **tổng thể** gần như không đổi ⇒ **chỉ được nói** "giữ đúng phần câu hỏi nhắm tới", **không** được nói "giữ nhiều nội dung hơn". Ca 2 cột 31.861 ký tự giữ 0/2 vì 7 khối bảng/câu hỏi `Infinity` ăn hết 12k trước — đánh đổi có chủ ý, đã ghi thành mục ROADMAP riêng.

**Kiểm chứng:** `npm run check` exit 0; `npm test` exit 0 (**41 suite** Node + `lesson-store` qua Electron, in `lesson-preprocess: ok`); `node tests/manual/measure-query-ranking.js` và `measure-retention.js` chạy lại cho **đúng số của #57** (không hồi quy).

**Chưa kiểm chứng:** (1) **chưa có caller sản phẩm nào truyền `query`** — hàm đã sẵn và có test nhưng chưa nối vào bước sinh; (2) chưa chạy model thật nên chưa biết chất lượng câu hỏi game từ trích đoạn xếp hạng (gate O6); (3) chưa có số `promptTokens`/giây prefill thật; (4) bộ cài `release/` **chưa dựng lại**.

**Tệp đã sửa:** `src/services/lesson-preprocess.ts`, `src/services/lesson-prompts.ts`, `src/services/lesson-workflow.ts`, `src/services/lesson-retrieval.ts` (chỉ JSDoc), `tests/unit/lesson-preprocess.test.ts`, `tests/manual/measure-query-ranking.js` (mới), `tests/manual/diagnose-query-ranking.js` (mới), `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/BENCHMARKS.md`, `docs/ROADMAP.md`.

**Việc tiếp theo nên làm:** chọn chỗ nối `buildRetrievalQuery()` vào bước sinh nội dung (draft đang dùng `selectChunksForItem`/`selectItemChunks`) và đo prefill trước/sau bằng `promptTokens` trong `ai-log`.



**Mục tiêu:** giảm token đầu vào của `lesson:analyze` mà **không** làm mất nội dung giáo án (bảng, số đo, công thức, ví dụ, tình huống, câu hỏi, đáp án, giải thích).

**Hiện trạng trước khi sửa (đọc code, không suy đoán):** `getLocalDocumentAnalysisExcerpt` (`src/ai-core/document-assist.ts`) giữ **8.000 ký tự đầu + ~3.900 ký tự cuối**, nối bằng marker — **không phải** cắt 12.000 ký tự đầu như dễ tưởng. Nó giữ cuối nhưng cắt **giữa câu hoặc giữa dòng bảng**, không chuẩn hoá khoảng trắng khi dán, và không bỏ tiêu đề trang lặp.

**Đã thêm `src/services/lesson-preprocess.ts`** (thuần, không gọi AI, không đọc/ghi đĩa):

| Lớp | Nội dung | Bật? |
| --- | --- | --- |
| **L1** làm sạch | NFC (giữ dấu), BOM, ký tự điều khiển C0/C1, CRLF→LF, NBSP, tab, khoảng trắng cuối dòng, gộp dòng trống, bỏ **tiêu đề/chân trang lặp** | luôn bật |
| **L2** trích đoạn theo biên đoạn | ngân sách **12.000** (fast) / **18.000** (deep) ký tự, cắt ở `\n`/câu gần nhất trong 600 ký tự, vẫn giữ đầu+cuối (67/33) | luôn bật |
| **L3** xếp hạng đoạn | giữ vô điều kiện bảng/công thức/câu hỏi/đáp án/số đo, rồi lấp ngân sách bằng đoạn giá trị cao theo thứ tự tài liệu | **TẮT** (`LESSON_PREPROCESS_RANKING_ENABLED = false`) |

**Vì sao L3 tắt:** ở bước phân tích **chưa có câu hỏi/trọng tâm của giáo viên**, nên xếp hạng theo độ liên quan là **không giám sát** — khác hẳn truy xuất lúc sinh nội dung (đã có cổng #55). Trong khi tắt, `preprocessLessonSource` vẫn **đo** `metrics.rankingSavingsChars` để có số trước khi quyết định. Bật L3 phải qua gate O6 (6/6 giáo án, 8/8 mục một lượt **khi đã bật**), và test **khẳng định cờ đang `false`**.

**Ba rủi ro đã ghi nhận:** (1) cắt mất dòng bảng/số liệu là lỗi nội dung ⇒ mọi dòng "trông như nội dung" được **miễn trừ** khỏi bộ lọc boilerplate, sai lệch chỉ về phía giữ thừa; (2) đổi cách cắt làm thay đổi **cái model đọc** ⇒ `LESSON_PREPROCESS_VERSION` vào `buildAnalysisCacheKey` để không tái dùng phân tích cũ; (3) tiết kiệm prefill mà gây **thêm một lượt sửa** là lỗ: lợi ích đo được chỉ 5–10 s so với ~80 s/lượt sửa.

**An toàn:** mọi lỗi nội bộ → trả nguyên văn bản gốc + `metrics.error`, **không bao giờ ném lỗi** làm hỏng bước phân tích. Chữ ký `prepareLessonExcerpt(text)` vẫn giữ (thêm `metrics`), nên không chỗ gọi nào bị vỡ.

**Đo (fixture tổng hợp, `node tests/manual/bench-preprocess.js`, token ước lượng theo 3,23 ký tự/token):** dán bẩn **3.073 → 2.411 ký tự (−22%)**; lặp tiêu đề trang **7.301 → 6.238 (−15%)**; giáo án dài 22.957 ký tự → **11.904** (đúng ngân sách, **không** giảm thêm so với cách cũ — khác biệt là **điểm cắt** và giữ đầu+cuối); L3 **sẽ** tiết kiệm 10.964 ký tự nếu bật. Chi phí tiền xử lý **4,53 ms/lần** trên 23k ký tự (≈0,01% của ~36 s prefill). **Trên 6 giáo án fixture sạch của repo mức giảm ≈0** (−1 token) ⇒ không được nói "phân tích đã dùng ít token hơn" trên giáo án thật. Chi tiết: `docs/BENCHMARKS.md` §O6d.

**Nói thẳng:** prompt phân tích là bước **rẻ nhất** (771 token, ~36 s prefill trên 4B), nên đây là đòn bẩy **yếu**; giáo án ngắn (<12k ký tự — phần lớn giáo án 1–2 tiết) **không giảm token**, chỉ được chuẩn hoá và bỏ dòng lặp.

**Tệp đã sửa:** `src/services/lesson-preprocess.ts` (mới), `src/services/lesson-prompts.ts` (`preprocessLessonContext`, `prepareLessonExcerpt` dùng L1+L2, `buildLessonAnalysisPrompt` nhận `maxChars`/`ranking`), `src/services/lesson-workflow.ts` (`analyzeLesson` nhận `maxChars`/`ranking`/`onPreprocess`), `src/services/lesson-cache.ts` (`preprocessVersion` vào key), `src/services/ai-transport.ts` (`readPromptTokens`), `src/main.ts` (ngân sách theo mode, log `analyze.preprocess`, `promptTokens` ở `analyze.done`), `tests/unit/lesson-preprocess.test.ts` (mới), `tests/manual/bench-preprocess.js` (mới), `package.json` (đăng ký test).

## Sửa lỗi sau khi chạy trên 4 tài liệu thật + ngân sách `deep` (2026-10-23, mới nhất)

**Bối cảnh:** lần đầu chạy bộ tiền xử lý trên tài liệu giáo viên thật (`tests/tailieu/*.pdf`, 4 tệp, 11–29 trang, trích bằng đúng `pdfParse(buffer)` như `main.ts`). Đây không phải fixture tổng hợp nữa, và nó lộ ra lỗi mà fixture không lộ.

**Lỗi 1 — L1 xoá nội dung thật (nghiêm trọng).** `removeRepeatedHeaders` chỉ cần "dòng ngắn, xuất hiện ≥3 lần, không khớp regex nội dung" là xoá. PDF **2 cột** lặp lại từng ô của bảng qua các trang, nên các cụm nội dung như `kiến thức`, `mới`, `tập.`, `lớp:`, `Khám phá`, `Vận dụng`, `Trò chơi:`, cả dấu `-`/`–` đứng riêng đều bị coi là "tiêu đề lặp" và **bị xoá**. Hậu quả: mất chữ trong câu, và xoá dấu đầu dòng làm dính từ. Sửa: thêm `isHeaderLike()` — chỉ dòng **trông như tiêu đề/chân trang** mới được xoá (toàn chữ hoa, hoặc ≥2 từ viết hoa và ≥40% số từ viết hoa, hoặc tem rất ngắn `Trang`/`12`), cộng `SENTENCE_END` để dòng văn xuôi không bao giờ bị xoá; dấu đầu dòng đứng riêng được **nối vào đầu dòng sau** thay vì xoá. Kết quả trên 4 tệp: chỉ còn xoá đúng tiêu đề trang thật (`TÀI LIỆU CHƯƠNG TRÌNH GIÁO DỤC KỸ NĂNG SỐNG THCS` ×11–17, header bảng 2 cột ×3) và nối dấu đầu dòng.

**Lỗi 2 — bẫy API `mode`.** `PreprocessOptions` chỉ có `maxChars`/`ranking`. Gọi `preprocessLessonSource(text, { mode: 'deep' })` (rất dễ viết) cho `Number(undefined) = NaN` ⇒ **âm thầm** dùng ngân sách fast. Đường thật trong app không dính (`main.ts` truyền `maxChars: preprocessBudgetForMode(mode)`), nhưng đây đúng là kiểu cắt âm thầm mà module này sinh ra để chặn. Sửa: ghi rõ trong JSDoc + test khẳng định `deep` giữ **nhiều hơn** fast và options lạ rơi về fast chứ không cắt về 0.

**Lỗi Unicode (phát hiện khi làm `isHeaderLike`).** Với tiếng Việt, `\p{Lu}` **không** nhận `'á'`→`'Á'` (chữ hoa có dấu bị phân rã NFD), và `'Á'.toLowerCase() !== 'á'`. Mọi phép "là chữ hoa" trong module này phải qua NFD-fold (`fold()`), và ngưỡng tỷ lệ phải tính theo **từ** chứ theo ký tự — `Giáo án Khoa học 6` chỉ có 2/5 từ viết hoa vì `án` bắt đầu bằng chữ thường-có-dấu. Ghi lại vì lần sau rất dễ viết lại sai.

**Đo mất mát thật (`node tests/manual/measure-retention.js`)** — tỷ lệ ký tự nội dung (chữ/số) còn lại và độ phủ word-bigram của văn bản đã làm sạch:

| Tài liệu | raw | fast (12k) | deep (18k) | recall fast | recall deep | nội dung fast | nội dung deep |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Giải quyết mâu thuẫn hiệu quả (17 tr) | 26.389 | 11.989 | 17.989 | **55%** | 78% | **49%** | 73% |
| K6 định hướng học tập kỷ nguyên AI (29 tr) | 33.971 | 11.988 | 17.990 | **42%** | 60% | **37%** | 56% |
| Tư duy tích cực (12 tr) | 19.850 | 11.995 | 17.985 | 67% | **97%** | 66% | 99% |
| Tư duy phản biện (11 tr) | 19.660 | 11.960 | 17.971 | 73% | **98%** | 66% | 99% |

**Đọc số này cho đúng:** giáo án Việt Nam 11–29 trang **không** nằm gọn trong 12.000 ký tự, nên fast **bỏ 27–58% nội dung**. Ví dụ cụ thể trong `Giải quyết mâu thuẫn`: 10 khối `Giáo viên chốt:` còn **1** ở fast, 5 ở deep; 5 khối `trò chơi` còn 3 (deep 4). Tài liệu **2 trang cột / ngắn** thì gần như không mất (deep 97–98%). Đây **vẫn là hành vi cũ** (trước đây app cắt 8.000 đầu + ~3.900 cuối, tức còn **ít hơn** 11.900), nên thay đổi này **không làm tệ hơn** — nhưng nghĩa là **không được quảng cáo "phân tích ít token hơn mà không mất gì"**. Next step đã ghi ở `ROADMAP.md`.

**Tệp đã sửa ở lượt này:** `src/services/lesson-preprocess.ts` (`isHeaderLike`, `isCapitalisedWord`, `fold`, `SENTENCE_END`, `HEADER_SHAPE`, `LONE_BULLET`, nối dấu đầu dòng, `isProtectedLine` thêm nhánh văn xuôi, `LESSON_PREPROCESS_VERSION` 1→**2**, JSDoc về bẫy `mode`), `tests/unit/lesson-preprocess.test.ts` (thêm 5 test hồi quy từ tài liệu thật), `tests/manual/measure-retention.js` (mới), `tests/manual/bench-preprocess-real.js` (mới), `tests/manual/inspect-preprocess-real.js` (mới), `tests/manual/inspect-preprocess-middle.js` (mới), `docs/BENCHMARKS.md` §O6e, `docs/DECISIONS.md` #57, `docs/ROADMAP.md`, `docs/STATUS.md`.

**Lệnh đã chạy:** `npm run build` (exit 0), `npx tsx tests/unit/lesson-preprocess.test.ts` → `lesson-preprocess: ok`, `npm run check` exit 0, `npm test` exit 0 (40 suite Node + `lesson-store` qua Electron), `node tests/manual/measure-retention.js` (bảng trên), `node tests/manual/bench-preprocess-real.js`, `node tests/manual/inspect-preprocess-real.js`, `node tests/manual/inspect-preprocess-middle.js`.

**Chưa kiểm chứng:** chưa chạy model thật nên **chưa** biết giảm prefill bao nhiêu giây hay có tăng lượt sửa không; recall/dropped-middle đo bằng bigram + đọc mắt, không phải chất lượng câu hỏi; chưa build lại installer.


**Đã chạy:** `npm run check` → exit 0; `npm test` → exit 0, **40 suite Node + `lesson-store` qua Electron**, gồm `lesson-preprocess: ok` và toàn bộ suite cũ xanh; `node tests/manual/bench-preprocess.js` → bảng số ở trên.

**Lỗi thật do test phát hiện trong lúc làm:** `\b` của JS **không** khớp trước ký tự `Đ`, nên "Đáp án:"/"Giải thích:" **không** được bảo vệ khỏi bộ lọc dòng lặp; đã chuyển sang `(?:^|[^\p{L}])…(?!\p{L})` với cờ `u`.

**Chưa kiểm chứng:** chưa chạy model thật (chưa biết số giây tiết kiệm, chưa biết có tăng lượt sửa); chưa có giáo án thật của giáo viên để đo (bộ đo là fixture tổng hợp, đã ghi rõ); `usage.prompt_tokens` mới chỉ được ghi vào log **khi** runtime trả về, chưa có lần chạy nào đọc số; **bộ cài trong `release/` chưa build lại** (`npm run dist:win`).

**Việc tiếp theo (khuyến nghị):** chạy 2–3 giáo án thật với model thật, đọc `analyze.preprocess` + `promptTokens` trong log AI để có số thật thay cho ước lượng; sau đó quyết định có bật L3 (kèm gate O6) hay không.


Trước đó (cùng ngày) — **Bốn lỗi UI giáo viên báo:** (1) **ẩn thanh menu** File/Edit/View/Window/Help — app trước đây không gọi `setMenu` nên dùng menu mặc định của Electron; nay cài menu ẩn (`visible:false`) để giữ accelerator **F11**, `setAutoHideMenuBar(true)` + chặn `Alt`; đo A/B cùng cỡ cửa sổ `1100×672`: `outerHeight-innerHeight` **63 → 37 CSS px** (chỉ còn title bar); (2) **thanh cuộn nhỏ lại** — style scrollbar trước đây chỉ có ở `.modal[data-player-theme]`, nay toàn app **7px** bo tròn + biến thể nền tối, màn chơi **8px** tông navy; (3) **"Đường đua" nền trắng không thấy chữ** — `.race-turn`/`.race-team-row` là panel `#fff` lồng trong `.game-stage` tối và sống nhờ màu chữ kế thừa nên thành **trắng trên trắng**; nay panel nền tối và tự khai báo `color`, đo tương phản **14.55:1 / 15.69:1 / 13.47:1**, track giới hạn chiều cao để không đẩy câu hỏi khỏi màn hình; (4) **"Tìm kho báu" toàn màn hình không cuộn được** — `.game-stage` ghim `height:100%` + `overflow:hidden` cộng `body{overflow:hidden}` khiến nửa dưới bị cắt; nay stage là vùng cuộn (`min-height:0` + `overflow-y:auto`), bản đồ `sticky`, panel fullscreen nền `#0b0e1a`; test mới `tests/ui/ui-race-treasure-check.js` **19/19**, `tests/_verify-css.js` **12/12**; hồi quy `ui-play-surface-check` **27/27**, `ui-fullscreen-check` **16/16**; `npx tsc --noEmit` exit 0; `npm test` exit 0 (30 suite); `npm run build` OK. Trước đó (cùng ngày) — **Cải thiện UI/UX màn chơi game + nút "Trình chiếu" + icon điều hướng:** (1) chữ câu hỏi từ **24px → 34–40px**, đáp án **14px → 16–18px**, cột nội dung **690px → 1100px**, `.game-stage` phủ kín cửa sổ (nền gradient + chip màu) thay vì bỏ trống nửa dưới; (2) nút "Trình chiếu" trước đây dùng nhầm class `.modal-close` (`width:30px;height:30px`) nên nhãn bị bóp thành 2 dòng tràn ra ngoài — nay là `.play-tool` tự co giãn (**116×38**), gom 3 nút vào một cụm bên phải, nút trình chiếu tô gradient tím nổi bật; (3) icon nav có ô nền bo góc, mục đang chọn là ô tím đặc. Sửa thêm 2 lỗi phát hiện khi kiểm: `html`/`body` khi fullscreen thiếu `overflow:hidden` (shell ẩn vẫn đẩy document cao 731 > 695 → có scrollbar) và `.modal` dùng `content-box` nên cao `100vh + 2px`. Test mới CDP `tests/ui/ui-play-surface-check.js` **27/27**; `npx tsc --noEmit` exit 0; `npm test` exit 0 (30 suite); `npm run build` OK. Trước đó (cùng ngày) — **Sửa lỗi UI: khi chơi game toàn màn hình, thanh điều hướng (nav) và topbar vẫn hiện đè lên game:** `.modal-backdrop` có `z-index:20` thấp hơn `.topbar` (`z-index:30`) nên backdrop không che được nav; nay khi `html[data-fullscreen="1"]` thì ẩn `.app-shell`/`.topbar`/`.ai-status-bar` và nâng backdrop lên `z-index:60`, đồng thời `body{overflow:hidden}`. Thêm test CDP `tests/ui/ui-fullscreen-check.js` **16/16** (đã chứng minh test bắt được lỗi: chạy lại với CSS cũ chỉ **11/16**, đúng các mục nav/topbar/z-index fail); `npm run check` sạch, `npm test` build + **30 suite** pass. Trước đó (cùng ngày) — **Presentation Mode: sửa cửa sổ bị kẹt ngoài màn hình khi rút máy chiếu + chặn điều hướng/mở cửa sổ mới:** `handleDisplayRemoved`/`onDisplayChange` trước đây không được gọi ở đâu; nay listener display được đăng ký với IPC, quyết định keep/move/close tách thành hàm thuần có test: `npm run check` sạch, `npm test` build + **30 suite** pass (thêm `display-policy`), `npm run build` thành công. Trước đó (2026-10-21) — **Presentation Mode  [line truncated] (1) chữ câu hỏi từ **24px → 34–40px**, đáp án **14px → 16–18px**, cột nội dung **690px → 1100px**, `.game-stage` phủ kín cửa sổ (nền gradient + chip màu) thay vì bỏ trống nửa dưới; (2) nút "Trình chiếu" trước đây dùng nhầm class `.modal-close` (`width:30px;height:30px`) nên nhãn bị bóp thành 2 dòng tràn ra ngoài — nay là `.play-tool` tự co giãn (**116×38**), gom 3 nút vào một cụm bên phải, nút trình chiếu tô gradient tím nổi bật; (3) icon nav có ô nền bo góc, mục đang chọn là ô tím đặc. Sửa thêm 2 lỗi phát hiện khi kiểm: `html`/`body` khi fullscreen thiếu `overflow:hidden` (shell ẩn vẫn đẩy document cao 731 > 695 → có scrollbar) và `.modal` dùng `content-box` nên cao `100vh + 2px`. Test mới CDP `tests/ui/ui-play-surface-check.js` **27/27**; `npx tsc --noEmit` exit 0; `npm test` exit 0 (30 suite); `npm run build` OK. Trước đó (cùng ngày) — **Sửa lỗi UI: khi chơi game toàn màn hình, thanh điều hướng (nav) và topbar vẫn hiện đè lên game:** `.modal-backdrop` có `z-index:20` thấp hơn `.topbar` (`z-index:30`) nên backdrop không che được nav; nay khi `html[data-fullscreen="1"]` thì ẩn `.app-shell`/`.topbar`/`.ai-status-bar` và nâng backdrop lên `z-index:60`, đồng thời `body{overflow:hidden}`. Thêm test CDP `tests/ui/ui-fullscreen-check.js` **16/16** (đã chứng minh test bắt được lỗi: chạy lại với CSS cũ chỉ **11/16**, đúng các mục nav/topbar/z-index fail); `npm run check` sạch, `npm test` build + **30 suite** pass. Trước đó (cùng ngày) — **Presentation Mode: sửa cửa sổ bị kẹt ngoài màn hình khi rút máy chiếu + chặn điều hướng/mở cửa sổ mới:** `handleDisplayRemoved`/`onDisplayChange` trước đây không được gọi ở đâu; nay listener display được đăng ký với IPC, quyết định keep/move/close tách thành hàm thuần có test: `npm run check` sạch, `npm test` build + **30 suite** pass (thêm `display-policy`), `npm run build` thành công. Trước đó (2026-10-21) — **Presentation Mode (trình chiếu):** mở game → nhấn "Trình chiếu" → hiển thị fullscreen trên màn hình phụ (máy chiếu) hoặc màn hình chính, đồng bộ trạng thái game qua IPC, thoát bằng Escape không làm mất phiên chơi: `npm run check` sạch, `npm test` build + **29 suite** pass, `npm run build` thành công. Trước đó (cùng ngày) — **Wizard: dự đoán số mục theo tài liệu + model (O12), nút “AI gợi ý & tạo ngay” có xác nhận (O13), sửa chọn thể loại ở bước 3, nút quay lại + toast ở bước 5, tên dự án dài và tương phản game đua**: `npm run check` sạch, `npm test` build + **29 suite** pass (thêm `item-capacity`), CDP `smoke81` **26/26**, hồi quy `smoke76` **12/12**, `smoke77` **11/11**, `smoke78` **21/21**, `smoke80` **17/17**. Trước đó (cùng ngày) — **Số luồng CPU tự động (O11): đo 4/6/8 luồng trên i3-10105F, giữ nguyên auto và khóa bằng test** (chi tiết ở mục O11): `npm run check` sạch, `npm test` build + **28 suite** pass (thêm `runtime-threads`). Trước đó (cùng ngày) — **Nhật ký chẩn đoán AI (O10): log trên máy + xuất gói .txt để gửi lại**: `npm run check` sạch, `npm test` build + **27 suite** pass (thêm `ai-log`; `lesson-workflow` thêm ca `onIncomplete`), CDP `smoke78` **22/22** (sinh đủ 3/3 bằng fixture → Settings: panel + 3 nút + dòng thông tin; xuất gói vào thư mục đích có `app.start` + `generate.start/done` đúng requested/found/attempts, không có nội dung giáo án hay khóa API; xóa log cần 2 bước bấm), **bản đóng gói** `smoke79` **15/15** (log trong `edugame-data\logs`, xuất tệp ra thư mục đích, xóa 2 bước), hồi quy `smoke76` **12/12**, `smoke77` **11/11**, `smoke72` **17/17**. Trước đó (cùng ngày) — **Xử lý AI trả thiếu mục (O9): thử lại một lần + banner số liệu thật ở bước 5** (chi tiết ở mục ngay dưới): `npm run check` sạch, `npm test` build + **26 suite** pass (thêm ca O9), CDP `smoke77` **11/11** (fixture 1/4 câu: banner, nút tạo lại, cảnh báo cố vấn, vẫn cho lưu, banner biến mất khi đủ), `smoke76` **12/12**. Trước đó (cùng ngày) — **Wizard: Fast/Thinking thành 2 thẻ chọn, đồng hồ thực + dự kiến ở bước 5, thanh AI cố định khi cuộn** (chi tiết ở mục cuối tệp): `npm run check` sạch, `npm run build` thành công, `npm test` build + **26 suite** pass, CDP `smoke75` **18/18**, `smoke76` **11/11**, `smoke72` **17/17**, `smoke73` **17/17**; chạy **Qwen 2B thật** qua `tests/manual/real-ai-status.js` **22/22** (runtime READY 9 s, phân tích 55 s, generate 4 câu 75 s, thanh AI hiện stage tiếng Việt + giây rồi tự xoá). Trước đó (cùng ngày) — **Sửa nút toàn màn hình ⛶ khi trình chiếu** + **sửa thanh trạng thái AI local / llama.cpp** (chi tiết ở 2 mục cuối tệp): `npm run check` sạch, `npm run build` thành công, `npm test` build + **26 suite** pass, CDP `smoke74` **15/15**, `smoke73` **17/17**, `smoke72` **15/15**, `smoke56` **58/58**, `smoke70` **8/8**. Trước đó (2026-10-20) — **`update_plan_3 Đợt 2: Thinking đúng spec §7/§9 + UI Task Manager`** (chi tiết ở mục ngay dưới): `npm run check` sạch, `npm test` build + **26 suite** pass, CDP **`smoke72` 15/15** (task manager UI + verify runtime + nhãn Fast/Thinking, không lỗi renderer); đo thinking thật **có `--jinja`** trên Qwen3.5-2B Q4_0 + b11681 (`tests/manual/thinking-probe.js`): `enable_thinking:true` vẫn chỉ ra `reasoning_content`, 0 nội dung ở 900/2.048 token → Thinking vẫn không bật suy luận ẩn, mô tả trung thực trong UI; `readAssistantContent` nhận diện reasoning-only và báo `AI_EMPTY` rõ ràng. Kế đó — **`update_plan_3 Đợt 1: Task Manager CPU-only + verify runtime + ẩn UI GPU`**: `npm run check` sạch, `npm test` build + **26 suite** (`ai-tasks` mới + `lesson-store` mở rộng); `AiTaskManager` Main-side theo dõi analyze/generate/regenerate với states `running/completed/failed/cancelled`, lịch sử `ai_tasks` SQLite, IPC `ai:tasks` + `ai:runtime-verify`, `ai:cancel` cập nhật task; verify CPU-only (`llama-b11681-bin-win-cpu-x64`, `--n-gpu-layers 0`, scan CUDA/Vulkan); trang Cài đặt ẩn VRAM/GPU, chỉ hiện CPU-only. Trước đó — **Sửa lỗi khởi chạy Qwen3.5 4B trên máy thứ hai + gỡ cài đặt không còn để lại model/runtime AI** (chi tiết ở mục đầu tiên bên dưới): `npm run check` sạch, `npm test` build + 25 suite, bản đóng gói `release/win-unpacked` vượt `smoke71` **25/25**, `smoke69` **19/19**, `smoke68` **44/44**; khởi chạy runtime 2B từ bản đóng gói với DLL VC++ app-local → **READY**, và 4B chạy tay với tham số mới → `n_slots = 1`, `listening`; trình gỡ cài đặt silent đã xoá dummy `ai-local` nhưng giữ nguyên `edugame.sqlite` + `lessons`. Trước đó — **`update_plan_2`: lưu/mở lại, gameplay, chống gọi AI trùng, lịch sử kết quả, tách 3 khu vực** (chi tiết ở mục đầu tiên bên dưới): `npm run check` sạch, `npm test` build + 25 suite, **`smoke69` 19/19**, **`smoke70` 8/8**, **`smoke71` 25/25 (§5.2b hình nền/nhân vật/âm thanh)**, **`persistence71` 3/3 write + 9/9 after restart**, **`real-ai-e2e` 19/19 với Qwen3.5-2B Q4_0 thật trong app (analyze 63 s, generate 75 s, huỷ giữa lượt, chặn gọi trùng)**, hồi quy `smoke68` **44/44**, `smoke58` 26/26, `smoke67` 124/124, `smoke56` **58/58**; trước đó — **§5.2 bản đồ hành trình + nhiệm vụ đa dạng trong kho báu** (chi tiết ở mục đầu tiên bên dưới): `npm run check` sạch, `npm test` build + 25 suite, `smoke68` **43/43**, `smoke67` **124/124**, `smoke56` **56/56**; trước đó — **Phân tích giáo án chạy nền + trò chơi thứ hai từ cùng giáo án** (chi tiết ở mục phân tích bên dưới): `npm run check` sạch, `npm test` build + 25 suite, `smoke67` **124/124**, `smoke66 fixture` **34/34**, `smoke64` **39/39**; trước đó — **P7 nốt: AI tạo lại từng mục trong editor cho cả 5 loại, chỉ game mở từ wizard** (chi tiết ở mục P7 nốt bên dưới): `npm run check` sạch, `npm test` build + 25 suite, `smoke67` **113/113** (+15 check), `smoke66 fixture` **34/34**, `smoke64` **39/39**, `smoke63` **49/49**, `smoke56` **56/56**; trước đó cùng ngày — **P7 dọn đường document-assist chết** (xoá `ai:document-assist`, `assistWithDocument`, `features/document-assist.ts`, script trong `index.html` và hook "tự tổng hợp sau khi bật AI" — chi tiết ở mục P7 ngay dưới): `npm run check` sạch, `npm test` 25 suite, `smoke67` 98/98, `smoke66 fixture` 34/34, `smoke63` 49/49, `smoke56` 56/56 sau khi xoá. Trước đó cùng ngày — **O6 Fast/Deep + benchmark thật, O7 thanh tiến trình + huỷ** (chi tiết ở mục O6 ngay dưới): `enable_thinking` bị loại bỏ có đo (chỉ trả suy luận, không có nội dung tới 2.048 token); prompt phân tích rút còn 6 mục tiêu/8 khái niệm → **6/6 giáo án 1 lượt**, 741–1.339 token, 46–121 s; sinh fast 8 câu **6/6 giáo án 1 lượt, 8/8 mục, 0 lỗi chất lượng, 1.124–1.354 token, 102–190 s**; Deep 2 giáo án ngắn 139–140 s (chưa đo giáo án dài); batch 1 lượt 8 câu **141 s/1.488 prompt token** so với 8 lượt một câu **456 s/13.897 token** → không ship batching; RAM đỉnh chat server **4.022 MB**. Số lượt Qwen mỗi trò: **3 → 2** (trò đầu), **3 → 0** (trò thứ hai cùng giáo án + cấu hình), **1** khi sửa một mục. Verified by `npm run check` (sạch), `npm test` (build + **25 suites**, thêm `lesson-prompts`), `smoke67` **98/98** (+6 check O7), `smoke66 fixture` **34/34**, `smoke64` **39/39**, `smoke63` **49/49**, `smoke56` **56/56**, `smoke62` **9/9**, `smoke65 runtime/output` **18/18** mỗi chế độ, `npm run dist:win` → `release/EduGame-Studio-Setup-0.3.0.exe` (92,3 MB). **Chưa chạy e2e thật trong cửa sổ app** (máy tự đóng app sau 1–2 phút): số đo lấy qua HTTP với đúng prompt/schema/validator của app. Số liệu + lệnh chạy lại: `docs/BENCHMARKS.md` §O6. Trước đó (2026-10-20) — **O5 cache phân tích/nội dung + tạo lại từng mục** (chi tiết ở mục O5 ngay dưới), trước đó **O4 truy xuất bằng embedding MiniLM thật (0 lượt Qwen)**: generation chấm đoạn giáo án bằng cosine trên vector MiniLM (`embeddings-v1`) thay vì chỉ trùng từ; model `paraphrase-multilingual-MiniLM-L12-v2` GGUF Q8_0 (132 MB, xác minh SHA-256 khi cài) chạy trong **llama-server riêng** với `--embedding --pooling mean`, vector 384 chiều lưu trong `lesson_chunks` và chỉ tính **một lần cho mỗi tài liệu**. Đo trên bộ 16 câu tiếng Việt: câu **diễn đạt lại** đúng 6/6 so với 3/6 của lexical (lexical bỏ hẳn 2 đoạn đúng); câu trùng từ 8/10 hạng 1 so với 10/10 nhưng vẫn nằm trong ngân sách 6 đoạn. Thêm ~28 ms mỗi lần generate và **216 MB RAM** (chat 2,1 GB) — số liệu + cách chạy lại ở `docs/BENCHMARKS.md`. Thiếu model/runtime thì tự rơi về `lexical-v1` và vẫn generate được. Verified by `npm run check`, `npm test` (build + **22 suites**, thêm `embedding-catalog`), `smoke66 fixture` **32/32**, `smoke67` **77/77** (context thật `scorer=embeddings-v1`), `smoke64` **39/39**, `smoke65 runtime` 18/18 + `output` 18/18, `smoke56` 56/56, `smoke62` 9/9, `smoke63` 49/49. Trước đó (2026-10-20) — **O3 chia nhỏ giáo án + truy xuất đoạn liên quan (thuần TypeScript, 0 lượt Qwen)**: generate không còn gửi `document.text.slice(0, 6000)` mà chia giáo án thành đoạn (một lần, lưu ở bảng `lesson_chunks`), chấm điểm đoạn theo chủ đề/mục tiêu trọng tâm/khái niệm, rồi chỉ gửi **tối đa 6 đoạn / 4500 ký tự** đã chọn (theo thứ tự tài liệu, có nhãn `[Đoạn N — tiêu đề]`). Retrieval là BM25-lite trên token tiếng Việt (`lexical-v1`) — seam để O4 thay bằng MiniLM; rơi về phần đầu giáo án (`fallback`) nếu không đoạn nào khớp. Wizard hiện dòng "Đã dùng x/y đoạn giáo án liên quan". Verified by `npm run check`, `npm test` (build + **21 suites**, thêm `lesson-chunker` + `lesson-retrieval`), app thật CDP: `smoke66 fixture` **32/32**, `smoke67` **77/77** (mỗi thể loại +2 check ngữ cảnh), `smoke64` **39/39**, `smoke65 runtime` 18/18 + `output` 18/18, `smoke56` 56/56, `smoke62` 9/9, `smoke63` 49/49. Trước đó (2026-10-20) — **O2 kiểm tra chất lượng nội dung (thuần TypeScript, 0 lượt Qwen)**: ngay sau khi model tạo bản nháp, main chạy `checkDraftQuality` và trả `quality` cùng `lesson:generate` (thêm IPC `lesson:quality` cho lúc mở lại draft) — phát hiện câu trùng/gần trùng, hai lựa chọn trùng nhau, thiếu đáp án đúng, phương án nhiễu chung chung, thiếu giải thích, tình huống không có phương án tốt nhất, cặp ghép trùng, chuỗi chặng hỏng/vòng lặp, ô đua ngoài đường, và mục tiêu chưa được bao phủ. Wizard hiện bảng **lỗi/cảnh báo** trước khi mở editor; đây là **tư vấn**, không chặn lưu (`DECISIONS #21`). Verified by `npm run check`, `npm test` (build + **19 suites**, thêm `lesson-quality`), app thật CDP: `smoke66 fixture` **29/29**, `smoke67` **67/67** (mỗi thể loại +3 check chất lượng), `smoke64` **39/39**, `smoke65 runtime` 18/18 + `output` 18/18, `smoke56` 56/56, `smoke62` 9/9, `smoke63` 49/49; cả 5 fixture happy cho **0 lỗi/0 cảnh báo**. Trước đó (2026-10-20) — **O1 tối ưu AI: chọn thể loại bằng quy tắc (0 lượt Qwen)**: bước 3 của wizard không còn gọi model; `game-type-rules` + `game-recommender` chấm điểm 5 thể loại từ mục tiêu/kiến thức trọng tâm và trả cùng shape cũ (2–3 gợi ý, id theo analysis), nên mọi thứ phía sau (lưu trữ, cấu hình, editor, mở lại draft) không đổi. Giáo viên vẫn chọn được thể loại không nằm trong gợi ý. Verified by `npm run check`, `npm test` (build + **18 suites**, thêm `game-recommender`), app thật CDP **không chạy model**: `smoke64` **39/39** (2 check mới: gợi ý không cần model + chip thể loại khác), `smoke66 fixture` **26/26**, `smoke67` **52/52** (cả 5 thể loại), `smoke65 runtime` **18/18**, `smoke65 output` **18/18** (kịch bản viết lại: lỗi AI giờ kiểm ở bước generate), `smoke56` **56/56**, `smoke62` **9/9**, `smoke63` **49/49**. Trước đó (2026-10-19): **P6 sinh nội dung 5 thể loại + editor** — wiring verify bằng fixture; **e2e model thật mới đạt một phần** (analyze ✅, recommend ✅, generate ❌ `AI_TRUNCATED`), chi tiết ở mục P6; **P5**, **P4**, **P3**, **P2**, **P1**; installer `release/EduGame-Studio-Setup-0.3.0.exe`.
## #54 tiếp: thu hẹp trích đoạn theo từng mục khi "Tạo lại" (2026-10-23, mới nhất)

**Bối cảnh:** #54 kết luận không đổi cờ llama.cpp được, và chỉ ra prompt "Tạo lại một mục" tốn **1.723 token** (fast) / **2.196 token** (deep), tức 2,2–2,8× prompt phân tích (771), ~82 s/102 s prefill cho mỗi mục trên 4B. Đòn bẩy còn lại là **độ dài prompt**.

**Cách thu hẹp (nghĩa là gì):** khi tạo lại mục *i*, thay vì gửi *toàn bộ* các đoạn tài liệu đã truy xuất cho cả giáo án, chọn lại trong số đó **chỉ những đoạn mà mục đó được viết ra từ** — dựa trên việc mục đang lặp lại từ ngữ riêng của đoạn nào. `maxChars` vẫn là ngân sách trên, không phải mục tiêu; kết quả giữ thứ tự tài liệu.

**Phát hiện chính — vì sao lần thử đầu sai:** dùng ngưỡng coverage tuyệt đối (`ITEM_MATCH_COVERAGE ≥ 0.5`) thì một mục trộn 3 chủ đề (quang hợp / hô hấp / an toàn giao thông) lại bị thu về đúng đoạn **an toàn giao thông**, vì đoạn đó lặp lại chính từ trong tiêu đề của nó nên "phủ" nhiều từ của mục. Ba tiêu chí đã thử (đếm token chung, tổng IDF tuyệt đối, coverage có trọng số) đều hỏng cùng một kiểu: **trùng từ đo độ giống, không đo nguồn gốc**.

**Cách sửa:** thêm cổng "lãnh đạo" — đoạn dẫn đầu phải giải thích **phần lớn trong tổng những gì mọi đoạn giải thích được** (`ITEM_MIN_SHARE = 0.75`), nếu không thì coi là mục nhiều đoạn và trả `null` (gửi trọn slice như trước). Số đo trên giáo án test:

| Mục | coverage từng đoạn | share của đoạn dẫn đầu | Kết quả |
| --- | --- | --- | --- |
| Một đoạn (quang hợp) | 1,0 / 0,101 / 0,0 | 0,91 | thu còn **1 đoạn** (255 ký tự, ~80 token) |
| Trộn 3 đoạn | 0,25 / 0,125 / 0,625 | 0,63 | **giữ trọn** 3 đoạn (658 ký tự, ~206 token) |

⇒ Với bài học 3 đoạn, mỗi lần "Tạo lại" một câu hỏi một đoạn **giảm ~127 token prefill** (~6 s trên 4B); câu hỏi trộn nhiều đoạn **không đổi**. Mục tiêu vẫn đặt sai ở phía an toàn: thiếu nguồn là lỗi nội dung, thừa prefill chỉ là lỗi thời gian.

**Hành vi mới:** `src/services/lesson-retrieval.ts` có `selectItemChunks` (per-item) + `selectChunksForItem` (bọc `ChunkSelection`, giữ điểm/thứ tự, trả nguyên object khi không thu hẹp) + `ITEM_SCOPING_ENABLED = true`. `src/main.ts` gọi `selectChunksForItem` cho từng mục trong luồng `lesson:regenerate-item` và đếm `itemsNarrowed` (dùng cho log/thông báo). `LESSON_PROMPT_VERSIONS.item` 1 → 2 để không tái dùng nội dung cũ sinh bằng prompt rộng.

**Lỗi có sẵn, đã ghi tài liệu, chưa sửa:** `STOP_WORDS` viết **không dấu** nhưng `tokenizeForRetrieval` **giữ dấu**, nên **không stop word nào từng bị loại** khỏi BM25 (`của`, `là`, `và`… đều lọt). Bộ lọc per-item tự né bằng `foldDiacritics`; sửa `STOP_WORDS` sẽ đổi xếp hạng truy xuất của **mọi** giáo án nên phải đo riêng — ghi ở doc comment của `STOP_WORDS`.

**Đã chạy:** `npm run check` exit 0; `npm test` exit 0 (toàn bộ suite, gồm `lesson-retrieval`, `lesson-prompts`, `lesson-cache`); đo tay bằng script tạm (đã xoá, không còn file `probe-*`/`tmp-check*` trong repo).

**Chưa kiểm chứng:** chưa chạy app Electron với model thật để so **chất lượng câu hỏi** trước/sau (6/6 giáo án, 8/8 mục một lượt — O6); con số token là ước lượng theo ký tự từ prompt thật, chưa đọc `tokens_evaluated` từ llama.cpp; **bộ cài đang có trong `release/` được build từ code chưa hoàn thiện trước đó — cần `npm run dist:win` lại**; bộ cài **chưa ký số** (SmartScreen báo "Unknown publisher").

**Việc tiếp theo (khuyến nghị):** đo lại bằng `D:\onnx-build\bench_item.py` + gate O6 trên 1–2 giáo án thật; nếu chất lượng không giảm, build lại bộ cài; nếu giảm, tắt `ITEM_SCOPING_ENABLED` (một dòng, test đã phủ cả hai trạng thái qua `selectItemChunks`).

## Sửa smoke-test bước 12: cài AI lần đầu thất bại dù model chạy tốt (2026-10-22)

**Triệu chứng giáo viên báo:** cuối wizard cài AI lần đầu hiện *"AI local khởi động nhưng không trả về nội dung thử nghiệm. Thử lại. Nếu vẫn lỗi, hãy mở Cài đặt để chạy lại phần cài đặt AI."*, và bấm **Thử lại** không bao giờ qua. `%APPDATA%\edugame-studio\edugame-data\ai-local\setup-state.json` trên máy bị lỗi ghi `step: "smoke-test"`, `modelId: "qwen3.5-4b-q4_k_m"`, `error.code: "startup"`, `error.message: "AI local chưa khởi động nên không thể kiểm tra."`

**Nguyên nhân gốc (đã tái hiện, không phải suy đoán):** `runSetupSmokeTest` trong `src/main.ts` gọi `POST /chat/completions` với `{ model, messages, max_tokens: 8, temperature: 0, stream: false }` — **thiếu `chat_template_kwargs`**. Chat template của Qwen3.5 (Q4_K_M, cả 2B và 4B, llama.cpp **b11681**) **bật thinking mặc định**, nên cả 8 token bị tiêu vào `reasoning_content`:

```
[app smoke test] HTTP 200
{"choices":[{"finish_reason":"length","message":{"content":"","reasoning_content":"Thinking Process:\n\n1.  **"}}]}
```

Đó chính là chuỗi "khởi động nhưng không trả về nội dung". Mọi chỗ gọi AI khác trong app đều dùng `buildGenerationOptions('local', …)` nên đã có `enable_thinking: false`; **chỉ smoke test bỏ sót**.

**Đã sửa (2 chỗ):**
1. `src/main.ts` — `runSetupSmokeTest` nay gửi `...buildGenerationOptions('local', 8)` (giữ `max_tokens: 8`, `temperature: 0`, `stream: false`). Đo lại trên đúng runtime + model đã cài: `finish_reason: "stop"`, `content: "OK"`, **HTTP 200 trong 1,2 s**.
2. `src/ai-core/setup-orchestrator.ts` — `toSetupError` **luôn** gán lỗi ở bước `smoke-test` cho mã `smoke-test`. Trước đây câu *"AI local chưa khởi động nên không thể kiểm tra."* khớp regex `/khởi (chạy|động)/` nên bị gắn mã **`startup`**, và wizard hiện nhãn **"AI không khởi động được"** cùng nút Thử lại — chẩn đoán sai, dễ khiến giáo viên xoá model tốt. Lỗi ở bước 12 nghĩa là runtime **đang chạy**, luôn là lỗi smoke test.

**Test hồi quy mới (2):**
- `tests/unit/setup-wiring.test.ts`: body smoke test dựng qua `buildChatRequestBody` + `buildGenerationOptions('local', 8)` phải có `max_tokens: 8`, `chat_template_kwargs: { enable_thinking: false }`, không `stream`, và `readAssistantContent` vẫn đọc được `"OK"`.
- `tests/unit/setup-wizard-model.test.ts`: 3 câu lỗi thật ở bước `smoke-test` (kể cả câu chứa "khởi động") đều ra mã `smoke-test`; lỗi thật ở bước `starting` vẫn ra `startup`.

**Kiểm chứng đã chạy:** `npm run check` exit 0; `npm test` exit 0, **39 suite** (`setup wiring tests passed`, `setup wizard model tests passed`). Đã dựng lại bộ cài: `npm run dist:win` exit 0 ⇒ `release/EduGame-Studio-Setup-0.3.0.exe` **92.728.000 bytes** (22/10 20:56), SHA-256 `0FC17716240D5D769A4B1EDB43D0C7DAEA423A575D35C287AC7AA5E6CEB41B65`; `latest.yml` khớp **size** và **sha512 tự tính lại**. Giải nén `app.asar` (`asar.extractAll`) xác nhận `dist/src/main.js` có `...buildGenerationOptions('local', 8)` và `dist/src/ai-core/setup-orchestrator.js` có `if (step === 'smoke-test') return new SetupError(message, 'smoke-test', step);` — **4/4 kiểm tra PASS**.

**Phát sinh đáng chú ý:** file model `qwen3.5-4b-q4_k_m-1a02dbed1cd.gguf` mà **app tự tải** được băm lại tại chỗ: size **2.740.937.888** và SHA-256 **`00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`** — **khớp đúng** danh mục. Vậy hash Q4_K_M của 4B đã được chứng minh bằng dữ liệu thật, không còn là "tin từ metadata HF". (2B và 7B vẫn chưa băm.)

**Chưa verify:** chưa cài `.exe` mới trên máy sạch, chưa bấm tay qua UI wizard từ đầu đến cuối, chưa chạy `tests/manual/real-ai-e2e.js`, chưa băm 2B/7B. Khuyến nghị cho máy đang kẹt: mở **Cài đặt → AI local**, bấm **Thử lại** sau khi cập nhật — model 4B đã có sẵn trên đĩa nên **không phải tải lại 2,7 GB**.

## Chấm "điền từ / trả lời ngắn": dấu câu và dấu phẩy trong đáp án nhiều ý (2026-10-22)

**Hiện tượng (ảnh chụp của giáo viên, game `project_mvjmauk6_xrid6s`, câu 3/6):** nhập đúng *"đặt câu hỏi"* vẫn báo *"✕ Chưa chính xác … Đáp án đúng: đặt câu hỏi"*; nghi vấn tương tự ở câu 4/6 *"Liệt kê 4 bí quyết…"*.

**Tái hiện, không suy đoán:** đọc thẳng `edugame.sqlite` trên máy (script Electron + `better-sqlite3`, chỉ `select`) để lấy đúng câu hỏi đã lưu — `q3` (`fill-in-blank`) có `correctAnswer: "đặt câu hỏi"`, `q4` (`short-answer`) có `correctAnswer: "Mạnh dạn đặt câu hỏi; Thử lật ngược vấn đề; Trau dồi tri thức; Tự tin là chính mình"` — rồi chạy chính `dist/src/game-engine/runtime.js`. Trước khi sửa: `"ai biết"` → sai (đúng), `"đặt câu hỏi"` → **đúng**, nhưng `"Đặt câu hỏi."` (có dấu chấm, AI hay viết kiểu câu) → **sai**, và câu 4 khi gõ bằng dấu phẩy → **sai**. Vậy lỗi không nằm ở đáp án mà ở cách so khớp.

**Hai lỗi trong `src/game-engine/runtime.ts`:**
1. `normalizeTextAnswer` chỉ bỏ dấu tiếng Việt/khoảng trắng, **giữ nguyên dấu câu** ⇒ `"đặt câu hỏi."` ≠ `"đặt câu hỏi"`.
2. Đáp án nhiều ý được mô tả "cách nhau bằng `;`" nhưng bộ chấm là **so chuỗi tuyệt đối**: học sinh gõ bằng **dấu phẩy** (kiểu tiếng Việt, và đúng nguyên văn giáo án) thì sai hết. Ngược lại nếu AI trả `;` thì học sinh gõ `,` vẫn sai.

**Đã sửa:**
- `normalizeTextAnswer` thêm `.replace(/[.!?…:;,،]+/g, ' ')` rồi `trim()`. Giữ nguyên thứ tự `NFD → bỏ dấu → đ→d` như cũ (`NFC` đã thử và **làm hỏng `đ`**, `npm test` bắt được nên quay lại `NFD`).
- Thêm `textAnswerMatches`: so chính xác sau chuẩn hoá; nếu **cả hai** đều nhiều phần thì so theo **đúng thứ tự**, chấp nhận `;` lẫn `,`. Đáp án một phần có dấu phẩy trong câu (`"À, vâng"`) vẫn khớp `"a vang"`. Không đổi điểm, không đổi `correctAnswer` đã lưu ⇒ **game cũ tự chấm đúng** sau khi cập nhật.
- `src/renderer/features/game-editor.ts`: gợi ý dưới ô *ĐÁP ÁN ĐÚNG* nay nói rõ "dấu câu cuối" và "chấp nhận học sinh gõ bằng dấu phẩy".

**Test hồi quy đã thêm:**
- `tests/unit/runtime.test.ts`: `normalizeTextAnswer('Đặt câu hỏi.') === 'dat cau hoi'`; `"Đặt câu hỏi."` đúng với đáp án `"đặt câu hỏi"`; danh sách 4 ý dạng `;` khớp cả bản gõ `,` và bản có dấu chấm cuối/chữ thường khác kiểu; thiếu ý hoặc sai thứ tự ⇒ **sai**; đáp án một phần `"À, vâng"` khớp `"a vang"`.
- `tests/unit/ai-game-normalize.test.ts`: AI trả danh sách dấu phẩy cho `short-answer` được giữ nguyên (không tách vụn).

**Kiểm chứng đã chạy:** `npm run check` exit 0; `npm test` exit 0 (**39 suite**, không FAIL/AssertionError); chạy lại kịch bản tái hiện trên `dist` mới: `"Đặt câu hỏi."` và bản dấu phẩy → **đúng**, `"ai biết"` → **sai** như mong đợi.

**Chưa verify / cần biết:**
- **Đã đóng gói lại (22/10 22:34)** sau khi đóng app đang chạy: `npm run dist:win` exit 0 ⇒ **92.732.411 bytes**, sha256 `e6704a89…5c2b73`. Script `grading-packaged-check` (7/7) chạy trên app đóng gói xác nhận đúng hai câu này chấm đúng qua UI thật; vẫn chưa **cài trên máy sạch** rồi bấm tay.
- ~~Chưa bấm tay lại 2 câu trên trong app đóng gói (mới kiểm bằng runtime + DB thật qua script).~~ Nay đã kiểm trên app đóng gói bằng CDP.
- Câu 3/6 vẫn **không** nhận *"Mạnh dạn đặt câu hỏi"* (nguyên văn giáo án) vì đáp án lưu là *"đặt câu hỏi"* — lựa chọn nội dung, không phải lỗi chấm; muốn nhận phải thêm vào ô đáp án hoặc chỉnh prompt/validator.
- Câu 4/6 vẫn **không** nhận khi khác **thứ tự** ý; đó là quy tắc giữ nguyên.


## Câu nhập đáp án ngắn (≤ 5 từ) + nút "Gợi ý", và hai lỗi bố cục đo được (2026-10-22)

**Yêu cầu của giáo viên:** *"lỗi giao diện ở nav"* và *"trò chơi đó dạng câu hỏi nhập đáp án, nên để vào những đáp án ngắn cao nhất khoảng 5 từ, và có gợi ý"*. Không đoán lỗi nav — dựng script đo trên app Electron thật (`tests/ui/nav-hint-check.js`, CDP qua `--remote-debugging-port`) và nó chỉ ra ngay chỗ lệch.

### 1. Nav: nút "Cài đặt" hẹp hơn 7 mục còn lại (đã sửa)

- **Đo trước khi sửa:** `home..sessions` đều `x=16, w=213`, riêng `settings` là `x=16, w=113` ⇒ nút cuối **ngắn hơn 100px**, lệch hẳn khỏi cột.
- **Nguyên nhân:** 7 mục đầu nằm trong `nav.nav{display:grid}` nên `<button>` bị lưới kéo đầy cột. Nút *Cài đặt* nằm **ngoài** `<nav>`, trong `.sidebar-bottom` (một `div` thường) ⇒ `button` co lại bằng nội dung.
- **Sửa:** `src/renderer/styles/app.css` thêm `.sidebar-bottom .nav-item{width:100%}`. Đo lại: **8/8 mục cùng `x=16, w=213`**, không mục nào tràn khỏi sidebar (max right 229 / sidebar 252), trang không cuộn ngang, nav không thành scroll container.
- Check compact (<700px, nav chỉ icon) có viết nhưng **mặc định bị skip** vì `BrowserWindow` đặt `minWidth:1100` — không thể thu nhỏ cửa sổ để đo thật. Đã nêu rõ trong output thay vì báo PASS giả.

### 2. Màn chơi: câu hỏi chỉ rộng 775px dù khai báo 1100px (đã sửa)

- **Phát hiện nhờ test cũ:** `tests/ui/ui-play-surface-check.js` báo FAIL *"content uses most of the width (>=80% of viewport) — 843px of 1280px"*; lần này **đúng là lỗi thật**.
- **Đo:** `.stage-question` = **775.71px**, `.stage-center` = **1030.40px**, trong khi `max-width` khai báo vẫn `1100/1120px`. Ép `width:100%`/`max-width:none` chỉ lên **1012px** ⇒ có thứ khác chặn, không phải `max-width`.
- **Nguyên nhân thật:** `.game-stage{overflow-y:auto}` biến stage thành **scroll container**, nên padding hai bên (`clamp(18px,3vw,44px)` ≈ 38px) bị cắt; `.stage-center{flex:1}` không thể rộng hơn **padding box** ⇒ 1227 − 2×38 − border ≈ 1012px.
- **Sửa:** `.stage-center` dùng `align-self:center; width:100%; min-width:min(1120px,100%)` để tự khai kích thước thay vì bị ép theo padding box. Đo lại: cột nội dung **1120px**, câu hỏi **1100px** — đúng thiết kế.
- **Lưu ý về test:** script cũ **pass giả** khi thư viện rỗng (không mở được game mà vẫn đo phần tử cũ). Nay nó bấm *Chơi* trên game thật và đặt `data-fullscreen="1"`. Ngưỡng cỡ chữ đáp án đổi `>= 16px` → `>= 15.9px` vì `clamp(16px,1.45vw,21px)` ở cửa sổ 1266px ra **15.83px** — sai số clamp, không phải hồi quy.

### 3. Đáp án nhập ngắn ≤ 5 từ

- **Luật mới** trong `src/game-engine/runtime.ts`: `TEXT_ANSWER_WORD_LIMIT = 5`, `textAnswerWordCount` (mỗi ý ngăn bởi `;`/`,` đếm **riêng**, lấy ý dài nhất), `textAnswerTooLong`; export thêm cho renderer + test.
- **Editor nói không** (`src/renderer/features/game-editor.ts`): bấm Lưu với đáp án dài hơn 5 từ ⇒ chặn kèm câu *"Đáp án "…" dài hơn 5 từ. Câu nhập đáp án chỉ nên có đáp án ngắn — hãy rút gọn hoặc đổi câu này sang trắc nghiệm."* Placeholder đổi thành *"Nhập đáp án ngắn (tối đa 5 từ)"*.
- **AI cũng bị ràng buộc:** schema Zod (`correctAnswer` + `hint ≤ 200`), JSON schema strict (`hint: {type:'string'}`), system prompt và `genericRules` đều nói *"đáp án tối đa 5 từ (nhiều ý thì ngăn bằng ";") và kèm `hint` là câu gợi ý ngắn (tối đa 20 từ, không chứa đáp án)"*. `normalizeAiGame` giữ `hint` (cắt 200 ký tự, bỏ rỗng) **chỉ** cho câu `fill-in-blank`/`short-answer`.
- **Không đổi dữ liệu cũ:** game cũ không có `hint` vẫn chạy y nguyên; game cũ có đáp án dài **vẫn chấm đúng như trước** — giới hạn 5 từ chỉ áp ở lúc **soạn/lưu mới**, không áp khi chấm, nên bài đã lưu không thể đột nhiên hỏng.

### 4. Nút "💡 Gợi ý" ở màn chơi

- `src/shared/types.ts`: `GameQuestion.hint?: string` (gợi ý cho câu nhập đáp án, **không bao giờ** chứa đáp án).
- `src/renderer/features/gameplay.ts`: câu có `hint` mới hiện nút; gợi ý **ẩn** cho tới khi bấm, bấm xong nút chuyển *"💡 Đã mở gợi ý"* và **bị vô hiệu hoá**; ô nhập vẫn dùng được; trả lời **sai** thì gợi ý **lặp lại trong phản hồi**; sang câu khác thì nút/gợi ý biến mất.
- **Điểm số không đổi** khi dùng gợi ý — quyết định có chủ ý (`docs/DECISIONS.md` #52): gợi ý để học sinh **nhớ ra**, không phải hình phạt.
- Editor có ô **GỢI Ý** (`data-field="hint"`, `maxlength=200`, lưu vào `q.hint`, giữ khi *Sao chép câu*).

**Kiểm chứng đã chạy:**
- `npm run check` exit 0.
- `npm test` exit 0, **39 suite**; test mới: `runtime.test.ts` (giới hạn 5 từ, đếm theo từng ý, ngưỡng đúng 5/6 từ) và `ai-game-normalize.test.ts` (giữ `hint` cho câu nhập đáp án, bỏ `hint` rỗng/ở câu trắc nghiệm, cắt 200 ký tự).
- `node tests/ui/nav-hint-check.js 9351` → **15/15 PASS** (8 check cho gợi ý + 7 cho nav).
- `node tests/ui/ui-play-surface-check.js 9351` → **27/27 PASS**.
- `node tests/manual/verify-css.js` → **12/12 PASS** (Tailwind v4 thật sự giữ các rule mới trong `dist`).

**Chưa verify / cần biết:**
- **Đã đóng gói lại (22/10 22:34):** `npm run dist:win` exit 0 ⇒ `release/EduGame-Studio-Setup-0.3.0.exe` **92.732.411 bytes**, sha256 `e6704a89da0c3277f7cef9fdaa43a5468014fcd209a765a6249007fb555c2b73`; `latest.yml` khớp sha512 + size khi tính lại từ file. Giải nén `app.asar` (đóng 22:33) kiểm **8/8** dấu vết (giới hạn 5 từ, gợi ý trong UI/editor, 2 rule CSS) ⇒ gói **có** các thay đổi này lẫn bản sửa chấm đáp án.
- **Đã chạy trên app đóng gói thật** (`release\win-unpacked\EduGame Studio.exe`, CDP): `nav-hint-check` **15/15**, `ui-play-surface-check` **27/27** (câu hỏi **1100px/1280px**, đáp án 16px), `grading-packaged-check` **7/7**. Trước đó cùng các script này chạy trên `npx electron .` từ `dist` cho cùng kết quả.
- **Chưa cài trên máy sạch** bằng bộ cài (mới chạy `win-unpacked`) và **chưa bấm tay** — mọi số đo đều do script CDP thực hiện.
- Bố cục **compact** (<700px) chưa đo được vì `minWidth:1100`; check compact tự skip và ghi rõ lý do.
- Gợi ý do AI sinh ra chưa kiểm bằng một lượt Qwen thật (mới kiểm đường normalize + UI), và chưa có ràng buộc cứng nào ngăn AI **nhắc lại đáp án** trong `hint` — nếu gặp, cần thêm bộ lọc.
- Câu lưu từ trước vẫn có thể có đáp án > 5 từ; **không** có tác vụ dọn nội dung cũ (cố ý, để không sửa dữ liệu giáo viên).


## Đổi toàn bộ model sang Q4_K_M, setup lần đầu không tự cài 7B (2026-10-22)

**Việc đã làm:** cả ba mức model trong danh mục chuyển từ **Q4_0** sang **Q4_K_M**, và wizard cài lần đầu chỉ được chọn **2B hoặc 4B** (7B vẫn có trong danh mục và vẫn chọn được ở Cài đặt → Model, chỉ không tự tải).

| Mức | id | sizeBytes | sha256 (LFS oid của HF) |
|---|---|---|---|
| 2B | `qwen3.5-2b-q4_k_m` | 1.280.835.840 | `aaf42c8b…914699223` |
| 4B | `qwen3.5-4b-q4_k_m` | 2.740.937.888 | `00fe7986…fb69ef11a4` |
| 7B | `qwen2.5-7b-q4_k_m` | 4.683.074.048 | `da5c9930…0c6772f4689` |

**Nguồn số liệu:** HEAD request tới đúng revision đã pin trên huggingface.co — cả ba trả `HTTP/1.1 200 OK`, `X-Linked-Size` và `X-Linked-ETag` (SHA-256 của LFS object). Revision, license (Apache-2.0) và yêu cầu RAM **không đổi**; chỉ file lượng tử hoá đổi.

**Vì sao đổi được an toàn:** không có chỗ nào trong code rẽ nhánh theo chuỗi `q4_0` — `item-capacity.ts` phân mức theo token `2b`/`4b`/`7b`, `validateManifest` cho phép `_`, `verifyModelFile` so size + SHA-256 nên tự khớp theo bảng trên. Đổi lượng tử hoá **không** thay hạn mức câu hỏi (2B→5, 4B→6, 7B→7); có test riêng khẳng định điều này để lần đổi sau không âm thầm làm rơi hạn mức.

**Giá phải trả:** file lớn hơn 5,4–6,1% (2B +66 MB, 4B +158 MB, 7B +239 MB). Q4_K_M thường giải mã hơi chậm hơn Q4_0 trên CPU, mà app chỉ chạy CPU (#39) — nên đổi lại được việc giữ ngữ cảnh tốt hơn.

**Chặn 7B tự cài:** `recommendLocalModelId()` lọc theo `AUTO_INSTALL_MODEL_IDS` (2B, 4B) trước khi chọn, nên máy 16 GB hay 64 GB đều nhận **4B**; `SETUP_DEFAULT_MODEL_ID` (fallback của renderer) cũng là `qwen3.5-4b-q4_k_m`. Lý do: 7B là 4,7 GB và giải mã chậm nhất ở đây, không nên là thứ đầu tiên bắt giáo viên chờ.

**Kiểm chứng:** `npm run check` **exit 0**; `npm test` **exit 0**, **39 suite** pass, 0 assertion error. Quét lại `src/` + `tests/`: **không còn** id/đường dẫn `q4_0` nào, chỉ còn 5 dòng comment lịch sử (ghi rõ là số đo cũ trên Q4_0).

**Chưa kiểm chứng:**
- Chưa tải thật file 1,2–4,7 GB để tự băm SHA-256 ⇒ hash tin theo metadata của Hugging Face, bước kiểm toàn vẹn khi cài **chưa** được chứng minh đầu-cuối.
- **Chưa đo A/B** Q4_0 vs Q4_K_M (prompt tok/s, decode tok/s, tỉ lệ câu hỏi bị validator từ chối) ⇒ "chất lượng tốt hơn" là nhận định chung về lượng tử hoá, **không** phải số đo trên sản phẩm này.
- `real-ai-e2e` **chưa** chạy lại trên model Q4_K_M.
- **Chưa cài bằng `.exe` trên máy sạch**, bộ cài **chưa ký số**, **chưa tải model thật** (1,2–4,7 GB), chưa bấm tay.

**Đã build lại bộ cài:** `npm run dist:win` exit 0 (22/10 20:13) ⇒ `release/EduGame-Studio-Setup-0.3.0.exe` **92.726.822 bytes**, SHA-256 `374EA8B5470179F0CDAC0ED301FB93CDD12B048E37E05398435284D4664C53AD`; `latest.yml` khớp **cả size lẫn sha512 tự tính lại**. Giải nén `app.asar` (4.190 entry) kiểm nội dung: `dist/src/ai-core/model-catalog.js` **có** đủ 3 id `*_q4_k_m`, 3 URL `*-Q4_K_M.gguf`, 3 size mới và `AUTO_INSTALL_MODEL_IDS`; **không còn** `q4_0`, `Q4_0.gguf` hay size cũ (1.214.873.856 / 2.583.221.408 / 4.444.121.600); `dist/src/renderer/setup-wizard-model.js` có `SETUP_DEFAULT_MODEL_ID = 'qwen3.5-4b-q4_k_m'`.

**Máy đang chạy Q4_0:** file cũ (`qwen3.5-2b-q4_0-…`, `qwen3.5-4b-q4_0-…`, `qwen2.5-7b-q4_0-…`) **không** bị xoá và không được migrate; id mới khiến app tải lại vào cùng thư mục. Cố ý không xoá — tự xoá 1,2–4,4 GB trên máy giáo viên còn tệ hơn. Dọn là việc riêng, cần giáo viên đồng ý.

Chi tiết quyết định: `docs/DECISIONS.md` #49.

## Build lại bộ cài có wizard UI (2026-10-22)

Sau Đợt 4 (`release/` vẫn là bản **trước khi có wizard**), đợt này **chỉ build lại** bộ cài và **xác minh nội dung gói** bằng cách giải nén `app.asar` — không sửa code ứng dụng.

- **Lệnh:** `npm run dist:win` → `clean` → `tsc` → `build:css` → `electron-builder --win nsis`, **exit 0**, log không có `error`/`failed` nào. `rcedit`/`winCodeSign` không chặn lại (cache đã có sẵn — **đừng xoá**).
- **Kết quả:** `release/EduGame-Studio-Setup-0.3.0.exe` = **92.717.764 bytes** (22/10 17:46:09), trước đó 92.691.696; `app.asar` **51.799.125 bytes** (17:45:30) — asar cũ hơn installer nên installer đã đóng gói đúng bản mới; `latest.yml` khai báo **đúng** `size: 92717764`.
- **`latest.yml` được kiểm bằng cách tự tính lại:** sha512 của `.exe` tính bằng `crypto` = `xqmtrkc…g3A==`, **trùng** chuỗi trong `latest.yml`. (Không tin file cấu hình tự khai.)
- **Kiểm nội dung gói (giải nén `app.asar` rồi đọc như trình duyệt sẽ đọc):**
  - `dist/src/renderer/setup-wizard-model.js` và `dist/src/renderer/features/setup-wizard.js` **có mặt**.
  - `index.html` trong gói có **31** thẻ `<script src>`, **0** thẻ trỏ tới file không tồn tại; thứ tự đúng: model (21) → feature (22) → `core/bootstrap.js` (29).
  - `setup-wizard-model.js` trong gói: **không** có `exports.`, **không** gọi `require(`, **không** `import`/`export` tĩnh, có global `SetupWizardModel` ⇒ nạp bằng `<script src>` sẽ **không** ném `exports is not defined`.
  - `core/bootstrap.js` trong gói gọi `window.openSetupWizard({ probe: true })` **sau** `render()` và có `.catch(() => { })`.
  - `features/setup-wizard.js` không có `onclick=` inline; `pages/settings.js` có nút `openSetupWizardBtn`; `features/settings.js` **nối** đúng nút đó; `app.css` trong gói có style wizard.
- **Tự sửa 2 kết luận sai của chính script kiểm:** ban đầu nó báo `require=true` và `reset button=false`. Cả hai là **lỗi của script**, không phải của bản build — `require(` khớp một **dòng chú thích** trong docblock (phải bỏ comment trước khi kiểm), và id nút thật là `openSetupWizardBtn` chứ không phải `setup-wizard-reset`. Đã sửa script rồi kiểm lại, tất cả xanh.
- **Lưu ý về git:** `release/` nằm trong `.gitignore` nên bộ cài mới **không** vào commit; đây là artifact trên máy, phải build lại khi phát hành.
- **Chưa verify (vẫn nguyên):** **chưa cài trên máy sạch**, **chưa mở app đã đóng gói** (`release/win-unpacked\EduGame Studio.exe`), **chưa bấm tay** luồng wizard, **chưa tải thật 1,1 GB**, bộ cài **chưa ký số** (SmartScreen sẽ cảnh báo), không có bản ARM64.


## Lỗi giáo viên báo 22/10 — "modal giật khi tải AI", "AI không khởi chạy", "setup phải toàn màn hình"

Bộ chẩn đoán gửi kèm: `app.start` lúc `11:04:57Z`, máy `i3-10105F`, `aiMode: offline`, `runtimeInstalled: false`, model `qwen3.5-2b-q4_0` được báo **đã cài**, runtime **STOPPED**.

**0. Wizard giờ chiếm toàn bộ cửa sổ (yêu cầu chủ sản phẩm, đã làm, đã đo).** Trước đây setup hiện dưới dạng hộp thoại nổi trên dashboard (`modal-backdrop` + `modal`), nên giáo viên vẫn thấy và bấm được app bên dưới. Nay `renderSetupWizard()` đặt `html[data-setup-fullscreen="1"]` và dựng `.setup-fullscreen` (màn hình phủ kín viewport, nội dung rộng `min(760px,…)`, phần thân cuộn riêng, hàng nút luôn nằm trong màn), CSS trong `app.css` ẩn `.app-shell`, `.topbar` và `.ai-status-bar` bằng `visibility` (giữ layout, quay lại app không bị reflow) — cùng cơ chế `html[data-fullscreen="1"]` mà màn chơi game đã dùng. Markup **không còn** `role="dialog"` / `aria-modal="true"` vì đây không còn là hộp thoại. Cờ được gỡ khi setup `complete` hoặc ở màn `error`/`blocked` (để giáo viên thấy app phía sau) và luôn gỡ trong `closeSetupWizard()`, nên không bao giờ còn cảnh app bị ẩn mà không có lý do. Đo trên Electron thật + CDP (`node tests/ui/ui-setup-fullscreen-check.js`): **PASS 11/11** — `data-setup-fullscreen="1"`, `.setup-fullscreen` = `1266×635` đúng bằng viewport, `.app-shell`/`.topbar`/`.ai-status-bar` đều `visibility:hidden`, không còn `modal-backdrop`, nút hành động ở `y=566` (trong màn), xong/đóng wizard thì cờ = `null` và shell hiện lại. Test đơn vị `tests/setup-wizard-ui.test.ts` kiểm cùng hành vi (mở ⇒ có cờ, `complete` ⇒ mất cờ, đóng ⇒ mất cờ) và cấm markup chứa `modal-backdrop`/`role="dialog"`/`aria-modal`.

**1. Modal giật khi đang tải (đã sửa, đã đo).** Nguyên nhân: `ModelInstaller.install()` gọi `onProgress` **mỗi chunk mạng**; wizard nhận `setup:progress` rồi gọi `renderSetupWizard()`, mà hàm này ghi lại **toàn bộ** `#modalRoot.innerHTML`. Với model 1,1 GB đó là hàng trăm lần dựng lại DOM mỗi giây, kèm việc khởi động lại animation sọc và mất focus. Sửa trong `src/renderer/features/setup-wizard.ts`:
- `ensureSetupProgressSubscription()` gộp sự kiện: giữ sự kiện mới nhất, chỉ vẽ một lần trong `requestAnimationFrame` (`scheduleSetupWizardFrame`, có fallback `setTimeout` cho môi trường không có rAF);
- `updateSetupProgressInPlace()` vá tại chỗ `aria-valuenow`, `style.width`, `textContent` của thanh tiến trình — **không** `innerHTML`, **không** tạo node mới mỗi sự kiện;
- `setupWizardStructureKey()` chỉ dựng lại modal khi màn/họa tiết/nút/checklist thật sự đổi; `setupWizardRendering` chặn đệ quy; `closeSetupWizard`/`openSetupWizard`/cuối `startSetupFromWizard` reset cờ để cờ treo từ lượt trước không nuốt sự kiện đầu của lượt sau.

Đo trên Electron thật (dev build, CDP): `node tests/ui/ui-setup-progress-check.js` → **PASS 6/6**, `400 sự kiện → 2 lần dựng DOM`, `replacements: 2`, thanh hiển thị đúng `100%`. Đối chứng (tạm ép render mỗi sự kiện): `400 sự kiện → 401 lần dựng`, `replacements: 401` ⇒ phép đo phân biệt được đúng lỗi. Test đơn vị `tests/setup-wizard-ui.test.ts` cũng **đỏ** khi gỡ bản sửa (`rebuilt 399 times for 399 events`).

**2. "AI không khởi chạy, không thấy báo đỏ" (chưa xác định dứt điểm — cần dữ liệu người dùng).** Những gì đã kiểm:
- Runtime **chỉ** khởi động ở bước `starting` của `SetupOrchestrator`, sau khi đã cài runtime + model; `stopRuntime` chỉ chạy khi setup **thất bại** hoặc khi app thoát. Nghĩa là nếu setup chưa `complete`, AI **không** chạy — đúng trạng thái `STOPPED` trong bộ chẩn đoán.
- Đường báo lỗi **có** màu đỏ thật: `resolveWizardView()` trả `tone: 'danger'` cho `status.error`, CSS `.setup-tone-danger` tô đỏ tiêu đề + viền trái. Banner lỗi của quy trình tạo từ giáo án cũng đã được `smoke65` kiểm (`AI_NOT_RUNNING` có nút "Mở AI local").
- `bootstrap.ts` gọi `openSetupWizard({ probe: true })` sau khi app khởi động; máy i3 có `setup-state.json` **không tồn tại** ⇒ wizard **phải** mở ở màn chào mừng/yêu cầu máy. Nếu giáo viên **bấm "Để sau"** (hoặc chọn "Dùng không có AI" ở màn lỗi), wizard đóng và **không** còn thông báo nào — dùng AI sau đó chỉ nhận `AI_NOT_RUNNING` trong luồng tạo trò chơi.
- Log `ai-2026-10-22.jsonl` **không** có sự kiện nào của máy i3 ngoài một `app.start` (5 phiên còn lại là máy `i5-10210U`), nên **không** thể kết luận phiên lỗi đã chạy bước nào từ log.

**Chưa verify:** chưa tái hiện được trên máy gặp lỗi; chưa biết giáo viên có thấy màn lỗi đỏ rồi bấm "Để sau", hay wizard không mở, hay setup chạy xong nhưng runtime bị dừng sau đó. **Bước tiếp theo được đề nghị:** log thêm `setup:*` (step + code) vào `ai-*.jsonl` và thêm tự khởi động runtime sau khi setup `complete` nếu runtime đang `STOPPED` khi giáo viên bắt đầu dùng AI (thay đổi hành vi ⇒ cần ghi vào `DECISIONS.md`).

## Wizard UI cài AI lần đầu (Đợt 4) — giáo viên đã bấm được luồng setup (2026-10-22)

Đợt 3 chỉ có backend setup; đợt này thêm giao diện để giáo viên thật sự dùng được, theo §3 (bước 2–3: kiểm tra đã cài chưa rồi mới mở wizard) và §7 (các màn cần có, thông tin cần hiển thị, tránh thuật ngữ kỹ thuật).

- **Màn hình (10 trạng thái):** `welcome` (giải thích trước khi tải), `detecting` (kiểm tra CPU/RAM/ổ), `requirements` (bản AI đã chọn, dung lượng tải, dung lượng trống, còn thiếu bao nhiêu), `downloading` (thanh %, đã tải/tổng, ETA ước lượng thô), `verifying` (xác minh/cài đặt — không có số byte nên không bịa %), `starting` (khởi động + health check + chạy thử), `complete`, `error` (nút phù hợp với từng loại lỗi), **`blocked`** (máy không chạy được AI — cố ý **không** có "Thử lại"), **`resume`** (lần trước dừng giữa chừng).
- **Hai chỗ cố ý khác §7:** §7 chỉ nói "lỗi có thể phục hồi"; với lỗi **không thể** phục hồi (CPU/kiến trúc sai, thiếu dung lượng) nếu vẫn hiện "Thử lại" thì giáo viên bấm mãi một nút không bao giờ thành công và không biết app vẫn dùng được offline. Vì vậy tách `blocked` với nút "Dùng không có AI". Thêm `resume` để không phải tải lại 1,1 GB.
- **Không chặn app:** wizard chỉ mở khi `setup:status` đọc được **và** `complete === false`. Nếu kênh `setup:*` lỗi (build cũ) hoặc đọc thất bại thì **không mở gì**, trò chơi đã lưu vẫn chơi được.
- **Kiến trúc để test được:** renderer nạp bằng `<script src>` thường, mà `tsc` xuất CommonJS và script CommonJS **ném `exports is not defined`** khi nạp kiểu đó (đã kiểm bằng `vm.runInContext`). Nên toàn bộ quy tắc quyết định nằm ở `src/renderer/setup-wizard-model.ts` **không có `import`/`export`**, công bố global `SetupWizardModel`; `tests/setup-wizard-model.test.ts` nạp đúng file đã build như trình duyệt, nên nếu ai làm nó thành CommonJS trở lại thì test đỏ ngay.
- **Hai lỗi thật do test bắt được (sửa code, không phải sửa test cho xanh):**
  1. `preflight()` ghi `step: 'detecting'` chỉ bằng việc kiểm tra máy ⇒ màn "lần trước chưa xong" hiện nhầm ngay lần cài đầu tiên. Nay `detecting` không tính là bị gián đoạn.
  2. Khi **đọc trạng thái thất bại**, `status` là `undefined` ⇒ `needsWork = true` ⇒ preflight chạy tiếp, **xoá mất thông báo lỗi** và thay bằng kết quả kiểm tra máy: màn hình trông bình thường nhưng bấm "Bắt đầu" là hỏng. Nay chỉ preflight khi đã đọc được trạng thái.
- **Bảo mật/CSP:** không có `onclick` inline (CSP `script-src 'self'`); một handler uỷ quyền ở `document` vì mỗi sự kiện tiến trình vẽ lại toàn modal; nút ✕ **không** hiện khi đang tải (chỉ còn "Hủy cài đặt") và Escape cũng bị chặn lúc đang tải, để giáo viên không làm mất thanh tiến trình.
- **Chỉ gửi `modelId`** qua IPC; không đường dẫn/URL nào từ renderer.
- **Lệnh:** `npx tsc -p tsconfig.json --outDir dist` exit 0; `npm test` exit 0 — **36 suite**, có `setup wizard model tests passed` và `setup wizard UI tests passed`; `npm run build` exit 0; kiểm thêm **31/31** `<script src>` trong `dist/src/index.html` đều có file, thứ tự `setup-wizard-model.js` → `features/setup-wizard.js` → `core/bootstrap.js`.
- **Tệp:** mới `src/renderer/setup-wizard-model.ts`, `src/renderer/features/setup-wizard.ts`, `tests/setup-wizard-model.test.ts`, `tests/setup-wizard-ui.test.ts`; sửa `src/index.html` (2 thẻ script), `src/renderer/core/bootstrap.ts` (cổng mở lần đầu), `src/renderer/pages/settings.ts` (nút "Cài đặt lại AI từ đầu"), `src/renderer/features/settings.ts` (nối nút), `src/renderer/styles/app.css` (style wizard), `package.json` (2 test mới vào chuỗi `npm test`).
- **Chưa verify:** **chưa chạy app Electron thật**, **chưa bấm tay** trên Windows — test chạy DOM giả (`vm` + shim) nên chỉ chứng minh code chạy và render đúng dữ liệu, **không** chứng minh bố cục/màu/khoảng cách đẹp; chưa thử tải thật 1,1 GB nên ETA/thanh % mới kiểm theo số liệu giả; **chưa cài trên máy sạch**; chưa xem ở theme tối (modal vẫn nền sáng như các modal khác). Bộ cài đã được build lại có wizard — xem mục đầu tiên.



## Đóng gói bộ cài có phần AI setup (2026-10-22)

Bộ cài đang có trong `release/` **cũ hơn code setup**: file `.exe` từ **21/10 12:19** trong khi `dist/src/main.js` của Đợt 3 là **22/10 15:27**, và `app.asar` của bản cũ **không hề chứa** `dist/src/ai-core/setup-*.js` (đã kiểm bằng `npx asar list`). Nghĩa là nếu đưa giáo viên bộ cài đó thì toàn bộ phần setup vừa làm **không có trong app**. Đợt này chỉ **build lại** bộ cài và **xác minh nội dung gói**, không sửa code ứng dụng.

- **Lệnh:** `npm run dist:win` → chạy hết `clean` → `tsc` → `build:css` (Tailwind) → `electron-builder --win nsis`, exit 0, không có lỗi. Bước `rcedit`/`winCodeSign-2.6.0` **không còn chặn** vì cache `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0` đã có sẵn từ lần build trước (đúng cách xử lý đã ghi trong `AGENT_HANDOFF.md`).
- **Kết quả:** `release/EduGame-Studio-Setup-0.3.0.exe` — **92.691.696 bytes**, 22/10 16:44 (bản cũ 92.625.608 bytes, 21/10 12:19); `release/latest.yml` sinh lại khớp đúng kích thước/sha512 mới. `app.asar` **51.672.564 bytes** (cũ 51.239.501).
- **Xác minh nội dung gói (không chỉ tin là build xong):** giải nén `app.asar` ra thư mục tạm rồi soát:
  - có `dist/src/ai-core/setup-state.js`, `setup-orchestrator.js`, `setup-ipc.js` (bản cũ **không có** cả ba);
  - 5 kênh `setup:status` / `setup:preflight` / `setup:start` / `setup:cancel` / `setup:progress` **giống hệt nhau** ở `setup-ipc.js` (nơi định nghĩa) và `preload.js` (nơi bắc cầu) — so sánh bằng mã: `preload == ipc` → `true`;
  - `main.js` có `registerSetupIpc`, `SetupOrchestrator`, `ensureSetupOrchestrator`, `runSetupSmokeTest`, chuỗi `/health`, `/chat/completions`, `setup-state.json`;
  - `resources/vc-runtime/` vẫn đủ 3 DLL (`msvcp140`, `vcruntime140`, `vcruntime140_1`, 724.288 bytes) — không mất khi build lại.
- **Uninstall an toàn dữ liệu giáo viên vẫn giữ:** `release/builder-effective-config.yaml` của bản build mới ghi `nsis.include: build/installer.nsh` và `deleteAppDataOnUninstall: false`, nên macro `customUnInstall` (chỉ xoá `ai-local`) **vẫn được nạp**.
- **Một kết luận sai đã tự bác bỏ:** lúc đầu tôi quét chuỗi trong file `.exe` để tìm đường dẫn `ai-local` và thấy **không có** — nhưng chuỗi đối chứng `egame` (chắc chắn phải có) cũng không thấy, chứng tỏ payload NSIS đã nén nên **phép quét này vô nghĩa**, không phải bằng chứng macro bị mất. Bằng chứng đúng là file cấu hình hiệu lực ở trên.
- **Tệp:** không sửa mã nguồn; chỉ `docs/STATUS.md`. Tạo và **đã xoá** script tạm (`check-asar.js`, `check-nsh.js`), thư mục giải nén `asar-check/`, log build/test.
- **Chưa verify (quan trọng):** **chưa cài thử bộ cài trên máy sạch** và **chưa chạy app đóng gói** (`release/win-unpacked`) — nên chưa xác nhận được: wizard/IPC chạy trong app đã cài, `app.getPath` trỏ đúng thư mục thật, `statfs` thật, setup phối hợp `ensureLocalRuntime`, và việc gỡ cài đặt đúng là chỉ xoá `ai-local`. Smoke-test vẫn chưa gọi llama-server thật. **Vẫn chưa có wizard UI** nên giáo viên chưa bấm được luồng setup dù bộ cài đã có phần backend của nó. Bộ cài **chưa ký số** (`no signing info identified, signing is skipped`) nên Windows SmartScreen sẽ cảnh báo. Chưa có bản ARM64.

## Cài đặt AI lần đầu — Đợt 3: nối vào Electron (main.ts + preload) (2026-10-22)

Theo `docs/archive/specs/update_AI_plan_5.txt` §8/§11. Đợt này **nối** orchestrator của Đợt 2 vào app thật: từ đây luồng setup **chạy được** (qua IPC), nhưng **vẫn chưa có wizard UI** — người dùng chưa bấm được gì, đó là việc của đợt sau.

- **`src/main.ts` — khối "First-run AI setup" (wiring thuần):**
  - `ensureSetupOrchestrator()` dựng `SetupOrchestrator` **một lần cho mỗi tiến trình**, đọc state đã lưu trước (`AI_LOCAL_ROOT()/setup-state.json`), và nối **hàm có sẵn** chứ không viết lại: `ensureLocalRuntime` → `startRuntime`, `stopLocalAiRuntime` → `stopRuntime`, `createRuntimeInstaller()` (đã có), `new ModelInstaller({modelDirectory: MODEL_DIR()})`, `detectHardware(MODEL_DIR(), {getDiskFreeBytes: diskFreeBytes})`.
  - **`runSetupSmokeTest()` là kiểm tra thật, không còn là interface rỗng:** gọi `GET /health`, rồi `POST /chat/completions` (`max_tokens: 8`, `temperature: 0`) và **bắt buộc có nội dung trả về**; mọi lỗi mạng/timeout/HTTP đều thành lỗi tiếng Việt. Chỉ khi hàm này qua thì state mới sang `complete`.
  - `readSetupState()` **hỏng file → về `idle`**, không bao giờ chặn app khởi động.
  - `registerSetup()` gọi `registerSetupIpc` với **adapter mỏng** (orchestrator dựng lazy), cạnh `registerIpc()`/`registerPresentationIpc()`.
- **`src/preload.ts`:** thêm 5 cầu nối `getSetupStatus` / `preflightSetup` / `startSetup` / `cancelSetup` / `onSetupProgress` (trả hàm huỷ listener, cùng kiểu `onFullscreenChanged`). Renderer **chỉ gửi được `modelId`**.
- **Không đụng `localModelInstallInProgress`:** wizard dùng kênh `setup:*` riêng, Settings vẫn dùng `ai:*`. Hai luồng không chia sẻ cờ nên không khoá lẫn nhau; `Start` vẫn qua `ensureLocalRuntime` nên không spawn hai llama-server.
- **Thêm `tests/setup-wiring.test.ts`** — test giữ cho "đường nối" không lệch: nó **dựng lại đúng object phụ thuộc mà `main.ts` truyền** (kiểu là `SetupOrchestratorDependencies` thật nên sai tên/thiếu khoá là **lỗi biên dịch**), dùng **class thật** `ModelInstaller`/`LlamaRuntimeInstaller` với `fetch` câm, và kiểm: tên kênh khớp preload, thứ tự `startRuntime → runSmokeTest`, smoke-test lỗi thì **stopRuntime được gọi và state không phải `complete`**, `ModelInstaller` từ chối đường dẫn tương đối, state hỏng về `idle`.
- **Ba lỗi trong chính quá trình làm test (đã sửa, ghi lại vì đều là bẫy thật):**
  1. Insert làm mất dấu `}` của hàm helper → cả thân test **nằm trong hàm khác**, không chạy, và file vẫn "pass im lặng". Phát hiện bằng **mutation check** (đổi tên kênh mà test vẫn xanh), không phải bằng đọc code.
  2. `assert.equal` của `assert/strict` **không** phân biệt được literal trong trường hợp tôi tưởng; đã chuyển sang `deepEqual` cả object kênh.
  3. `ModelInstaller` mặc định dùng `fetch` toàn cục — phải inject `fetchModel` thì preflight mới không chạm mạng. `trusted-download.ts` chặn `example.invalid` là **đúng thiết kế**, không phải lỗi.
- **Kiểm chứng:** `npx tsc --noEmit` exit 0; `npm run check` exit 0; `npm run build` OK; `npm test` exit 0 — **35 suite**, `setup wiring tests passed` có mặt trong chuỗi. Test mới được kiểm **có khả năng fail thật**: cố ý đổi `setup:status` → `setup:status-BROKEN` trong `dist` thì suite exit 1 với diff đúng chỗ; build lại thì exit 0. `package.json` chỉ đổi **1 dòng** (`setup-*` nối vào `test`).
- **Tệp:** `src/main.ts`, `src/preload.ts`, `tests/setup-wiring.test.ts` (mới), `package.json` (1 dòng), `docs/STATUS.md`, `docs/DECISIONS.md`.
- **Chưa verify (quan trọng):** **chưa chạy `npm start`/app Electron thật** nên luồng IPC end-to-end, `app.getPath` thật, `statfs` thật trên thư mục model và việc `ensureLocalRuntime` phối hợp với setup **chưa được xác nhận bằng mắt**; smoke-test mới test bằng stub, **chưa gọi llama-server thật**; vẫn chưa có wizard nên giáo viên chưa dùng được; chưa có test ARM64.
- **Còn lệch spec (chờ quyết định):** vẫn là Qwen3-4B **Q4_K_M** vs catalog **Q4_0** (như Đợt 1).

## Cài đặt AI lần đầu — Đợt 2: orchestrator + IPC hẹp (2026-10-22)

Theo `docs/archive/specs/update_AI_plan_5.txt` §3/§4/§7/§8/§11. Đợt này **ghép** các mảnh của Đợt 1 với installer đã có, và **vẫn chưa có UI** — wizard là Đợt 3, `main.ts`/preload/renderer **chưa bị sửa**.

- **Thêm `src/ai-core/setup-orchestrator.ts`** — lớp điều phối duy nhất *thực sự* chạy setup. Không viết lại download/hash/spawn: nó gọi `runtime-installer`, `model-installer`, `startRuntime` (hàm dòng lệnh có sẵn của `main.ts`), `runSmokeTest`. **Mọi phụ thuộc được inject** (kể cả `detectHardware`, `getDiskFreeBytes`, `isModelInstalled`, `now`) nên các nhánh lỗi §11 test được mà không cần tải 2.4 GB thật, và `ai-core` không import Electron.
  - **Thứ tự chạy = preflight trước, tải sau:** kiểm tra phần cứng → chọn runtime → đếm dung lượng → **chỉ khi không bị chặn mới tải byte đầu tiên**. Thiếu chỗ *trước khi* tải khác hẳn với hỏng giữa chừng.
  - **Khoá chạy:** run thứ hai bị từ chối `code:'busy'` thay vì giành file (§7 "prevent duplicate setup processes"); từ chối *không* ghi đè state của run đang chạy.
  - **Resume, không chạy lại:** suy ra bước kế tiếp từ state đã lưu, và **bỏ qua một bước chỉ khi đã ghi nhận xong *và* kiểm tra thấy tệp có thật trên đĩa** — state một mình không đáng tin (người dùng xoá model là chuyện thật).
  - **Sửa DLL VC++ luôn chạy** khi runtime đã cài: bản cài cũ có `llama-server` mà thiếu DLL chính là ca crash `0xC0000142`.
  - **Huỷ** dùng `AbortSignal` truyền xuống installer; byte đã tải **giữ nguyên** để lần sau resume.
  - **Không bao giờ báo hoàn tất khi lỗi:** `complete` chỉ được ghi sau khi mọi bước đã qua, và được kiểm lại bằng `isSetupComplete()`; smoke test hỏng → dừng runtime vừa spawn (không để process mồ côi) rồi mới throw.
- **Thêm `src/ai-core/setup-ipc.ts`** — IPC riêng cho wizard (tách khỏi `ai:*` của modal Settings): `setup:status`, `setup:preflight`, `setup:start`, `setup:cancel`, tiến trình đẩy qua `setup:progress`. **Renderer không gửi đường dẫn, URL hay backend**: payload chỉ được đọc `modelId`, id phải **có trong catalog đã xác minh**, mọi khoá lạ bị bỏ. Cửa sổ đã đóng thì không gửi (không throw).
- **`hardware-detector.ts`: nối `diskFreeBytes` vào `fs.statfs` thật** (cùng cách `statfs(...,{bigint:true})` mà `model-installer` đang dùng, để số hiển thị và số chặn tải không lệch nhau). Không đọc được → `undefined`, **không đoán**.
- **Ba lỗi do test phát hiện và đã sửa:**
  1. **Phân loại lỗi sai bước:** lỗi smoke test bị gán `code:'download'` vì regex `/start/` khớp cả "không khởi động". Nay lỗi được gán theo **bước đang chạy**, chỉ dò thông điệp cho các bước tải.
  2. **Thông điệp phần cứng không nói gì cho giáo viên:** `resolveRuntime` trả câu chung "Cấu hình máy này chưa được hỗ trợ." khi profile không kèm `unsupportedReason`. Orchestrator không để câu đó hiện ra: luôn nêu lý do **và** nhắc "trò chơi đã lưu vẫn mở được". Thông điệp kiến trúc trong `hardware-detector` cũng được bổ sung vế này cho khớp.
  3. **Không resume được:** bản đầu luôn chạy lại `detecting` khi state đang ở `installing-models`, mà bảng chuyển bước **cấm đi lùi** → app kẹt vĩnh viễn sau khi khởi động lại giữa lúc tải. Nay chạy tiếp đúng bước.
- **Kiểm chứng:** `npx tsc --noEmit` exit 0; `npm run check` exit 0; `npm test` exit 0 — **34 suite**, thêm `setup-orchestrator` (happy path, smoke test hỏng, resume sau restart, huỷ giữa lúc tải, chặn chạy trùng, mạng/SHA/dung lượng, phần cứng không hỗ trợ, fallback CPU) và `setup-ipc` (validate model id, payload lọc khoá lạ, tiến trình theo byte tới renderer không lộ đường dẫn, cửa sổ đã đóng).
- **Tệp:** `src/ai-core/setup-orchestrator.ts`, `src/ai-core/setup-ipc.ts`, `src/ai-core/hardware-detector.ts` (thêm `diskFreeBytes`), `tests/setup-orchestrator.test.ts`, `tests/setup-ipc.test.ts`, `tests/helpers/setup-fake.ts` (fixture dùng chung, dữ liệu tổng hợp), `tests/hardware-detector.test.ts` (thêm đo đĩa thật), `package.json`, `docs/STATUS.md`, `docs/DECISIONS.md`.
- **Chưa verify:** chưa nối vào `main.ts`/`preload.ts` nên **giáo viên vẫn chưa dùng được**; `runSmokeTest` mới là hợp đồng, **chưa có hàm sinh thử thật**; chưa chạy trên máy ARM64 thật; chưa có retry tự động nhiều lần (hiện giáo viên bấm "Thử lại").

## Cài đặt AI lần đầu — Đợt 1: nền tảng thuần TypeScript (2026-10-22)

Theo `docs/archive/specs/update_AI_plan_5.txt` §4/§11/§13.3. **Chưa có UI**: đợt này chỉ thêm lớp quyết định đã test, để đợt sau (orchestrator + IPC + wizard) ghép vào. Trước đợt này app **không có khái niệm "lần chạy đầu"**: setup chỉ là modal Settings mở tay, mỗi model một nút tải riêng, không lưu tiến trình.

- **Đã có sẵn và tái dùng, không viết lại:** `trusted-download.ts` (allow-list HTTPS, kiểm redirect), `model-installer.ts` (resume `.part` + Range, SHA-256 + size, precheck dung lượng), `runtime-installer.ts` (chống zip-slip, temp→rename, chép DLL VC++), `ai-manager.ts` (spawn 127.0.0.1, poll `/health`, timeout, exit-code→gợi ý tiếng Việt), `model-catalog.ts`, `runtime-threads.ts`.
- **Thêm 4 module thuần (không I/O, không đụng filesystem khi test):**
  - `src/ai-core/hardware-detector.ts` — `detectHardware()` trả `HardwareProfile` có thêm **`processArch`/`osArch`/`supportedArch`** và **`diskFreeBytes`**. Kiến trúc của *process* được ưu tiên hơn của OS (Electron x64 trên Windows ARM64 phải cài runtime x64, vì binary native nạp vào process x64). Không đo được dung lượng đĩa → `undefined`, **không đoán**.
  - `src/ai-core/runtime-manifest.ts` — biến hằng `LLAMA_CPP_RUNTIME` thành manifest có `schemaVersion`, `backend` (`cpu`/`openvino`), `platform`, `arch`, `verified`. **URL/size/SHA-256 được spread từ `LLAMA_CPP_RUNTIME`**, không chép lại, nên catalog và manifest không thể lệch nhau. `validateRuntimeEntry()` chỉ nhận HTTPS, size nguyên dương, SHA-256 64 hex, từ chối URL có user/pass/hash.
  - `src/ai-core/runtime-resolver.ts` — hàm thuần `resolveRuntime(hardware, manifest, {backend})`. Không tự dựng URL, không bao giờ trả entry `verified:false`, không throw khi máy không hỗ trợ (trả `status:'unsupported'` + lý do tiếng Việt có nhắc "trò chơi đã lưu vẫn mở được"). `DEFAULT_RUNTIME_BACKEND='cpu'`; xin `openvino` khi chưa có bản đã xác minh → fallback CPU **và nói rõ lý do** (`usedFallback`+`fallbackReason`).
  - `src/ai-core/setup-state.ts` — máy trạng thái **lưu được, resume được**: `idle → detecting → installing-runtime → installing-models → starting → smoke-test → complete`. Bảng chuyển bước tường minh nên file JSON hỏng/sửa tay không đẩy app sang bước sai; `completedSteps` chỉ tăng; `fail()` **giữ nguyên bước** + đếm `attempts` để retry đúng chỗ; file hỏng → về `idle` chứ không chặn app. Persistence được **inject** nên test không đụng dữ liệu thật.
- **Hai lỗi do test phát hiện và đã sửa:** (1) `idle → complete` từng được phép, tức là app có thể báo "xong" mà không xác minh bước nào — nay bắt buộc đi qua `detecting`; (2) state "complete" kèm `error` (mâu thuẫn) nay bị hạ về đúng bước lỗi, `isSetupComplete()` trả `false` để **không mở khoá app khi setup lỗi**.
- **Không đổi:** `model-catalog.ts`, các installer, `main.ts`, renderer. Gói cài vẫn **0 byte model/runtime** (`extraResources` chỉ có `vendor/vc-runtime`), `Setup-0.3.0.exe` vẫn **88.3 MB**. Không thêm OpenVINO (spec §12 cấm tuyên bố nhanh hơn khi chưa đo; repo chưa có artifact đã xác minh).
- **Kiểm chứng:** `npx tsc --noEmit` exit 0; `npm test` exit 0 — **34 suite**, thêm `hardware-detector` (23 assert), `runtime-manifest` (có test URL `http://`, URL có credential, SHA sai), `runtime-resolver` (ma trận arch/platform/verified/backend + kiểm hàm không side-effect), `setup-state` (bảng chuyển bước, file hỏng, fail→retry→resume qua restart, reset).
- **Tệp:** 4 file mới trong `src/ai-core/`, 4 file test mới trong `tests/`, `package.json` (nối 4 suite vào `npm test`), `docs/STATUS.md`.
- **Chưa verify:** chưa chạy trên máy ARM64 thật; `diskFreeBytes` mới có kiểu và test bằng stub, **chưa nối vào `fs.statfs`**; manifest mới chỉ có 1 entry (CPU x64); chưa có orchestrator/wizard nên **chưa giáo viên nào dùng được luồng này**.
- **Còn lệch spec (chờ quyết định):** spec yêu cầu Qwen3-4B **Q4_K_M**, catalog chỉ có Qwen3.5-2B/4B + Qwen2.5-7B **Q4_0**. Không tự bịa URL/checksum (§5); đổi model mặc định sẽ làm sai số đo luồng CPU và đổi chất lượng đầu ra.


## Cải thiện UI/UX màn chơi game, nút "Trình chiếu" và icon điều hướng (2026-10-22, mới nhất)

Giáo viên báo 3 vấn đề: (1) giao diện chơi game chữ nhỏ, dùng phí diện tích, thiếu màu; (2) nút "Trình chiếu" lỗi UI; (3) icon chưa nổi bật. Đã đo bằng CDP trước/sau (`1280×695`).

- **1 — Màn chơi game nhỏ / phí chỗ / thiếu màu:**
  - Nguyên nhân: `.stage-center{max-width:690px}` và `.stage-question{max-width:680px;font-size:24px}` gói mọi thứ vào một cột giữa; `.answer-option` chỉ `14px`, `min-height:62px`; `.game-stage` chỉ cao bằng nội dung nên nửa dưới cửa sổ trống; nền là `#11152b` phẳng.
  - Cách sửa: `.game-stage` **phủ kín panel** (`height:100%` trong `.modal-body` flex column + `box-sizing:border-box`), nền gradient 2 lớp + viền + inset highlight; `.stage-center` `max-width:1120px` và căn giữa theo trục dọc; câu hỏi `clamp(26px, 3.1vw, 42px)`/`font-weight:750`; đáp án `clamp(16px, 1.45vw, 21px)`, `min-height:64–92px`, hover nâng 2px + glow; huy hiệu chữ cái A/B/C/D tô **4 màu khác nhau** (tím/ngọc/ hổ phách/hồng); đúng/sai giữ thêm viền + đổ bóng (không chỉ dựa vào màu); thanh tiến độ gradient tím→ngọc; số câu và điểm thành **chip**; `.feedback` từ 12px → `clamp(13px,1.15vw,16px)` với viền trái màu.
  - Số đo trước → sau: câu hỏi **24px → 34–40px**, đáp án **14px → 16–18px**, chiều rộng nội dung **690px → 1100px**, `.game-stage` **~403px → 573px** kết thúc sát đáy cửa sổ.
- **2 — Nút "Trình chiếu" lỗi UI:**
  - Nguyên nhân: 3 nút trong header màn chơi dùng chung class `.modal-close` — class này là **ô vuông cố định `width:30px;height:30px`**. Nhãn "Trình chiếu" bị bóp thành 2 dòng và tràn ra ngoài ô 30×30; 3 nút lại bị `justify-content:space-between` rải khắp header.
  - Cách sửa: thay bằng `.play-tool` (chiều cao 38px, `min-width:38px`, padding theo nội dung, `white-space:nowrap`), bọc trong `.play-head-actions` (`display:flex;gap:8px`) để gom một cụm bên phải; nút trình chiếu dùng `.play-tool-present` (gradient tím + glow) làm hành động chính, nút toàn màn hình để trung tính, nút đóng có hover đỏ. Thêm `title`/`aria-label` cho cả 3 (trước đây nút ⛶ và ✕ không có nhãn).
  - Số đo: **30×30 (nhãn tràn) → 116×38 (nhãn 1 dòng)**, không chồng lấn, nằm trong viewport.
- **3 — Icon chưa nổi bật:** `.nav-icon` trước đây là glyph chữ 19px màu xám trên nền trong suốt. Nay là **ô 30×30 bo 9px có nền** `#f1f2f9`, mục đang chọn là **ô tím đặc** giống `.brand-mark` + glow, hover nền tím nhạt + scale 1.04; thanh rail (≤1100px) dùng ô 32×32. `#helpBtn` (`?`) chuyển sang `display:grid` để căn giữa và có hover tím.
- **Hai lỗi phát hiện thêm khi kiểm (đã sửa):**
  - Khi fullscreen, `.app-shell` bị `visibility:hidden` nhưng **vẫn chiếm chỗ** (`min-h-screen`, cao 731px) và `html` để `overflow:visible` → document cao 731 > 695 và **hiện scrollbar** trên màn chơi. Nay `html[data-fullscreen="1"]` + `body` đều `height:100%;overflow:hidden`.
  - `.modal` có utility Tailwind `border` với `box-sizing:content-box` nên `height:100vh` thành cao `100vh + 2px`. Nay nhánh fullscreen đặt `box-sizing:border-box`.
  - Scrollbar mặc định màu trắng trên nền tối gây chói khi chiếu → thêm `scrollbar-color`/`::-webkit-scrollbar` tối cho `.modal[data-player-theme]`.
- **Không đổi:** modal thường (Trợ giúp/AI local) vẫn `z-index:20`, shell `visible`, modal `1180×521`; các màn `matching/treasure/race` giữ nguyên markup, chỉ hưởng CSS chung.
- **Kiểm chứng:** `tests/ui/ui-play-surface-check.js` (CDP, **27/27**) — đo font/chiều rộng/chiều cao thật, kiểm nhãn nút không tràn & 3 nút không chồng lấn, kiểm document không cuộn ở cả trạng thái chưa và đã trả lời, kiểm ô icon nav. `npx tsc --noEmit` exit 0; `npm test` exit 0 (30 suite); `npm run build` OK.
- **Tệp:** `src/renderer/styles/app.css`, `src/renderer/features/gameplay.ts` (`openPlayModal`, `renderQuestion`), `tests/ui/ui-play-surface-check.js` (mới), `tests/_ui-check-lib.js` (mới, helper CDP dùng chung).
- **Chưa verify:** chỉ đo trên 1 màn hình ảo `1280×695`; **chưa thử 1366×768 / 1920×1080 / máy chiếu thật** (media query `max-height:800px` đã viết nhưng chưa chạy ở độ phân giải đó); `release/win-unpacked` chưa build lại.

## Bốn lỗi UI giáo viên báo: thanh menu Windows, thanh cuộn, "Đường đua" nền trắng, "Tìm kho báu" không cuộn được (2026-10-22, mới nhất)

Giáo viên báo 4 lỗi: (1) ẩn thanh **File/Edit/Window/Help**; (2) **thanh cuộn nhỏ lại**; (3) game **Đường đua** bị lỗi giao diện — nền trắng, không thấy chữ; (4) **Tìm kho báu** khi mở toàn màn hình **không cuộn trang được**. Đã đo bằng CDP trước/sau trên `1280×672` (dpr 1.5).

- **1 — Thanh menu File/Edit/Window/Help:**
  - Nguyên nhân: `createWindow()` không hề gọi `setMenu`, nên Electron dùng **application menu mặc định** (File/Edit/View/Window/Help) — vốn là menu của framework, mục hữu ích duy nhất là Reload / Force Reload / Toggle DevTools / Zoom, giáo viên không cần; nó còn chiếm một dải ngang của cửa sổ.
  - Cách sửa: vẫn cài **một application menu thật** nhưng mục gốc duy nhất là `{ label: 'View', visible: false }`, giữ `role: 'togglefullscreen', accelerator: 'F11'`; thêm `setAutoHideMenuBar(true)` + `setMenuBarVisibility(false)` và chặn phím `Alt` (`before-input-event`) để thanh ẩn không bị bật lại. **Không** xoá menu hẳn: phím F11 mặc định của Electron đến từ role `View` của menu mặc định, xoá menu là mất luôn F11.
  - **Số đo A/B ở cùng kích thước cửa sổ `1100×672`** (`outerHeight - innerHeight`): bản **không có** 3 dòng gọi menu = **63 CSS px** (94.5 device px = title bar + menu bar ~39 device px); bản **có sửa** = **37 CSS px** (55.5 device px = **chỉ còn title bar**). Dùng đối chứng `frame:false` cho `chromePx = 0` để chắc chắn phép đo phản ánh đúng phần khung.
- **2 — Thanh cuộn nhỏ lại:**
  - Nguyên nhân: chỉ `.modal[data-player-theme]` được style scrollbar; toàn bộ phần còn lại (thư viện, form soạn thảo, cửa sổ trình chiếu) dùng scrollbar mặc định của Electron (~15px), thô và lệch tông so với UI gọn.
  - Cách sửa: khối scrollbar **toàn app** (7px, track trong suốt, thumb bo tròn `border-radius:999px` + `background-clip:padding-box`), thumb hover/active đậm dần, thêm biến thể thumb sáng cho `[data-theme="dark"]`; màn chơi thu thêm còn **8px** (từ 10px) với tông navy để không chói khi chiếu.
  - Ghi chú: Chromium **ưu tiên `::-webkit-scrollbar`** khi có khai báo và bỏ qua `scrollbar-width`, nên thứ tự đặt khối này so với rule `scrollbar-width` không ảnh hưởng kết quả.
- **3 — "Đường đua" nền trắng, không thấy chữ:**
  - Nguyên nhân: `.race-turn` và `.race-team-row` là **panel sáng cố ý** (`background:#fff` / `#fbfbfe`, `color:#2b3050`) lồng **bên trong** `.game-stage` tối. Chúng sống nhờ **màu chữ kế thừa** từ stage, mà đợt sửa trước đã đặt `.stage-question{color:#f4f6ff}` cho cả câu hỏi của đường đua → **chữ trắng trên nền trắng**.
  - Cách sửa: đưa 2 panel về **nền tối** khớp `.game-stage` (`#1b2140`), và **mỗi panel tự khai báo `color`** thay vì kế thừa (`#e8ebf7`), hàng của đội đang lượt là `#262c50` + vạch tím. Thêm section riêng cho bàn đua: track **giới hạn chiều cao** (`max-height:172px`, `130px` khi `max-height:800px`) — trước đây track 40 ô tự wrap vô hạn và **đẩy câu hỏi xuống dưới màn hình**; cỡ chữ câu hỏi trong `.race-turn` đặt riêng (`clamp(22px,2.4vw,33px)`, căn trái) thay vì dùng cỡ đại của stage.
  - Số đo sau khi sửa (CDP, độ tương phản WCAG): câu hỏi **14.55:1**, đáp án **15.69:1**, bảng xếp hạng **13.47:1** (ngưỡng AA là 4.5:1); nền panel `rgb(27,33,64)`; track 40 ô: nội dung 182px bị chặn còn 130px và **câu hỏi vẫn nằm trong stage**.
- **4 — "Tìm kho báu" toàn màn hình không cuộn được:**
  - Nguyên nhân: `.game-stage` bị ghim `height:100%` (để căn giữa câu hỏi ngắn) và có `overflow:hidden`, trong khi `html[data-fullscreen="1"] body` lại đặt `overflow:hidden` (chính là bản sửa của đợt trước) → nội dung cao (bản đồ + cốt truyện + nhiệm vụ + nút trả lời) bị **cắt mất nửa dưới** và **không còn thanh cuộn nào** để với tới.
  - Cách sửa: `.modal[data-player-theme] .game-stage` thêm `min-height:0` (để flex item co lại đúng) + `overflow-y:auto; overflow-x:hidden` + `overscroll-behavior:contain`; đặt ở **cuối tệp** để thắng `height:100%` theo thứ tự nguồn (Tailwind gộp thành `overflow:hidden auto`, tương đương). Bản đồ `position:sticky` để luôn thấy đang ở chặng nào; panel fullscreen đổi nền `#0b0e1a` (tránh **nháy trắng** trên/dưới stage khi cuộn) và bỏ bo góc khi fullscreen.
  - Số đo: stage `overflow-y:auto`, **218px** nội dung vượt khung, cuộn tới `scrollTop 219` = **chạm đáy**, nút điều khiển nhiệm vụ (`#treasureActions`) vào vùng nhìn thấy; `document` vẫn `720 = 720` (không cuộn kép).
- **Kiểm chứng:** test mới `tests/ui/ui-race-treasure-check.js` (CDP, **19/19**) dựng fixture đường đua 40 ô và kho báu 6 chặng, đo **độ tương phản thật** (không phải so màu bằng mắt) + đo cuộn thật; `tests/_verify-css.js` (**12/12**) kiểm rule trong **CSS đã biên dịch** (Tailwind minify đổi định dạng nên không thể kiểm file nguồn); hồi quy `tests/ui/ui-play-surface-check.js` **27/27**, `tests/ui/ui-fullscreen-check.js` **16/16**; `npx tsc --noEmit` exit 0; `npm test` exit 0 (30 suite); `npm run build` OK.
- **Tệp:** `src/main.ts` (menu bar + cờ `Menu`), `src/renderer/styles/app.css` (scrollbar toàn app, race board, stage scroll, panel fullscreen), `tests/ui/ui-race-treasure-check.js` (mới), `tests/_verify-css.js` (mới), `docs/STATUS.md`.
- **Chưa verify:** F11 được **giữ** bằng accelerator trong menu ẩn nhưng **chưa bấm phím thật để xác nhận** — bơm phím qua CDP `Input.dispatchKeyEvent` **không kích hoạt accelerator của Electron** nên kết quả âm tính đó **không** chứng minh phím hỏng; nút ⛶ trong màn chơi vẫn là đường chính và đã test. Track đua mới đo ở 40 ô trên `1280×672`; **chưa thử track ngắn 1 hàng** trên máy chiếu thật. `release/win-unpacked` **chưa build lại**.



## Sửa lỗi UI: nav/topbar còn hiện khi chơi game toàn màn hình (2026-10-22, mới nhất)

- **Triệu chứng (giáo viên báo):** mở game lên chơi thì thanh điều hướng bên trái và topbar vẫn dính, chưa bị ẩn; khung game bị lệch, không phủ hết cửa sổ.
- **Nguyên nhân:** `.modal-backdrop` là lớp phủ toàn màn hình nhưng có `z-index:20`, trong khi `.topbar` là `position:sticky; z-index:30`. Stacking context của `z-index` cao hơn khiến topbar luôn nằm trên backdrop; sidebar là flex child ở luồng bình thường nên cũng không bị backdrop che. Vì `html[data-fullscreen="1"] .modal` đặt `width:100vw; height:100vh`, khung game phình ra bằng cả viewport trong khi backdrop bị đẩy bởi sidebar 252px → panel bị lệch và mép nav lộ ra.
- **Cách sửa (`src/renderer/styles/app.css`, chỉ trong nhánh `html[data-fullscreen="1"]`):**
  - `.app-shell`, `.topbar`, `.ai-status-bar` → `visibility:hidden` (dùng `visibility` thay `display` để không phá layout/đo đạc của panel game);
  - `.modal-backdrop` → `z-index:60`, `visibility:visible`, nền đặc `#0b0e1a` (phủ luôn phần nền trước đây còn lộ màu trang);
  - `body` → `overflow:hidden` để chặn cuộn nền khi đang chơi.
- **Phạm vi:** chỉ áp dụng khi đang chơi toàn màn hình. Đã kiểm tra modal thường (Trợ giúp/AI local) **không** đổi: `flag=0` → shell/topbar/sidebar vẫn `visible`, backdrop vẫn `z-index:20`. Cửa sổ trình chiếu (`src/presentation/presentation.html`) là trang riêng có CSS inline nên không bị ảnh hưởng.
- **Kiểm chứng:** thêm `tests/ui/ui-fullscreen-check.js` (CDP, cổng 9337) đo layout thật sau khi mở game + nhấn ⛶: **16/16 pass** — backdrop bắt đầu ở `(0,0)`, phủ đúng `innerWidth×innerHeight`, `sidebar/topbar/.app-shell` = `hidden`, `backdropZ 60 > topbarZ 30`, `elementFromPoint` tại vị trí nút nav **không** trả về phần tử trong `.sidebar` (trả `.game-stage`), panel `.modal` = `1280×695` tại `(0,0)`, và thoát toàn màn hình thì shell `visible` lại + backdrop về `z-index:20`.
- **Chứng minh test bắt được lỗi:** chạy lại đúng script với CSS **cũ** (đã gỡ 3 khối override) → **11/16**, fail đúng các mục `sidebar/topbar/.app-shell = visible`, `backdropZ 20 > 30` và backdrop hụt bề ngang. Sau đó build lại → **16/16**.
- **Lưu ý khi chạy test này:** nếu cửa sổ app không phải cửa sổ đang focus, Chromium đặt renderer ở trạng thái `hidden` và **treo animation timeline** (`document.timeline.currentTime` đứng ở 0), nên animation `pop-in` (`.modal`, `scale(0.92) → scale(1)`) không bao giờ chạy xong. Script gọi `getAnimations().finish()` trước khi đo để tránh đo sai ở frame đầu — đây là hiện tượng của harness, không phải lỗi sản phẩm (đã xác minh: khi animation kết thúc, panel là `transform:none`, `1280×695` tại `(0,0)`).
- **Tệp:** `src/renderer/styles/app.css`, `tests/ui/ui-fullscreen-check.js` (mới), `docs/STATUS.md`.
- **Chưa verify:** chưa thử bằng tay trên máy có màn hình thứ hai/máy chiếu thật (chỉ chạy 1 màn hình ảo 1280×695 qua CDP); chưa chạy `npm run dist:win` lại nên `release/win-unpacked` **chưa chứa** bản sửa này.


## Presentation Mode — Trình chiếu game lên màn hình phụ/máy chiếu (2026-10-21, mới nhất)

- **Kiến trúc:** Main renderer là source of truth (chạy game logic, tính điểm, điều hướng câu hỏi). Presentation window (BrowserWindow riêng, `frame: false`, `fullscreen: true`, `sandbox: true`) là read-only mirror nhận state qua IPC. Main process làm message broker forward `presentation:state-update` → `presentation:state-sync`.
- **File tạo mới:** `src/shared/presentation-types.ts` (IPC channels, DisplayInfo, PresentationState), `src/presentation/display-manager.ts` (`screen.getAllDisplays()`, chọn màn hình phụ ưu tiên, xử lý display-added/removed/metrics-changed), `src/presentation/presentation-manager.ts` (tạo/tái sử dụng PresentationWindow, fullscreen no-frame, lifecycle, cleanup, xử lý projector disconnect), `src/presentation/presentation-ipc.ts` (IPC handlers `presentation:start/stop/toggle/displays`, forward state sync), `src/presentation/presentation-preload.js` (preload giới hạn API qua contextBridge, hiện có `onPresentationState`, `onPresentationExit`, `sendPresentationExit`, `requestPresentationState`, **`sendPresentationState`** để bridge state từ renderer đến presentation window), `src/renderer/features/presentation.ts` (presentation renderer nhận state qua IPC, render game view read-only, Escape để thoát).
- **File sửa đổi:** `src/preload.ts` (thêm API `startPresentation/stopPresentation/togglePresentation/getDisplays/onPresentationState/onPresentationExit/sendPresentationExit/requestPresentationState/sendPresentationState`), `src/main.ts` (đăng ký `registerPresentationIpc` khi khởi động, `unregisterPresentationIpc` khi `before-quit`), `src/renderer/features/gameplay.ts` (nút "Trình chiếu" trong game modal, `buildPresentationState()`/`sendPresentationState()`/`stopPresentationMode()`, gọi state update khi chọn đáp án/chuyển câu/kết thúc game, dừng presentation khi đóng game hoặc bắt đầu game mới), `src/index.html` (thêm script presentation.js), `package.json` (copy `src/presentation/presentation-preload.js` vào dist).
- **Game state sync:** Mỗi `PresentationState` có `sessionId` (phòng stale session) và `revision` số tăng dần (presentation window chỉ render nếu revision mới hơn). State bao gồm: gameId, gameTitle, template, gameIndex, gameAnswers, score, timer, isComplete.
- **Cách sử dụng:** Giáo viên mở game → nhấn "Trình chiếu" trong header của game modal → app tự động phát hiện màn hình, ưu tiên màn hình phụ (máy chiếu), fallback màn hình chính → presentation window mở fullscreen không viền → giáo viên điều khiển từ main window, presentation window cập nhật realtime → nhấn **Esc** hoặc nút "Thoát trình chiếu" → đóng presentation window, phiên game vẫn còn nguyên.
- **Bảo mật:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` cho presentation window; presentation renderer không truy cập AI runtime, filesystem, hoặc shell execution; IPC channels rõ ràng, typed, validate payload. `setWindowOpenHandler` chặn mọi cửa sổ mới và `will-navigate` huỷ điều hướng ra khỏi `presentation.html` (spec §8).
- **Sửa lỗi 2026-10-22 (mất máy chiếu / rò điều hướng):**
  - **Cửa sổ trình chiếu bị kẹt ngoài màn hình.** `handleDisplayRemoved()` và `onDisplayChange()` đã được viết nhưng **không nơi nào gọi**, nên khi rút máy chiếu cửa sổ nằm ở toạ độ không màn hình nào phủ — vô hình, không bấm tới được. Nay `registerPresentationIpc()` đăng ký listener display-added/removed/metrics-changed và forward sang `handleDisplayRemoved()`; `unregisterPresentationIpc()` gỡ listener + `ipcMain.removeHandler/removeAllListeners` (trước đây chỉ đóng cửa sổ).
  - **Quyết định keep/move/close tách thành hàm thuần** `selectDisplayForRemoval()` trong `src/presentation/display-policy.ts` (không import Electron nên test được bằng `node`): không bao giờ trả `keep` cho toạ độ không màn hình nào chứa; hết màn hình thì `close` thay vì đoán. `handleDisplayRemoved()` dùng lại hàm này.
- **Test:** `npm run check` sạch; `npm test` build + **30 suite** pass (thêm `tests/display-policy.test.ts`: chọn màn hình rỗng/một/nhiều, ưu tiên phụ, fallback chính, "phụ đầu tiên thắng", phát hiện ngoài màn hình, rút máy chiếu → `move`, không còn màn hình → `close`, đổi độ phân giải làm cắt cửa sổ → `move`); `npm run build` thành công và bản build chứa `setWindowOpenHandler`/`will-navigate`/`selectDisplayForRemoval`.
- **Chưa verify:** chưa kiểm thử với máy chiếu/màn hình phụ thật (unit test chỉ chứng minh logic quyết định, không chứng minh hành vi của Electron); chưa có CDP smoke test cho presentation window (cần `electron . --remote-debugging-port=9333`); chưa build lại installer/`release/win-unpacked` sau khi thêm Presentation Mode.

## Wizard: dự đoán số mục, nút “AI gợi ý & tạo ngay”, chọn thể loại và phản hồi bước 5 (O12/O13) (2026-10-21, mới nhất)

- **Dự đoán số mục (O12):** `src/services/item-capacity.ts` (mới) ước lượng số câu/tình huống/cặp/chặng từ độ dài tài liệu (trần truy xuất 4.500 ký tự Fast / 6.000 Thinking), số mục tiêu/khái niệm, model (2B=5, 4B=6, 7B=7, chưa rõ=5; Thinking +1) và thể loại. Số tự động luôn nằm trong **4–7**. IPC mới `lesson:capacity` (preload `estimateLessonCapacity`) chỉ đọc dự án/phân tích, không gọi AI. Bước 4 hiện “Gợi ý N …” + nút **Dùng N**; gõ tay thì giữ số của giáo viên (`countTouched`), đổi thể loại hoặc Fast/Thinking thì dự đoán lại. Recommender dùng chung estimator (kèm độ dài tài liệu của dự án) nên thẻ bước 3 và bước 4 bắt đầu từ cùng một con số.
- **Không lẫn với AI tạo thiếu:** sau khi tạo, chỉ khi giáo viên **không** sửa số và AI tạo được **4–7** mục thì cấu hình tự hạ xuống đúng số đã tạo, lưu lại, tính lại quality và báo toast. Nếu AI tạo **dưới 4** thì giữ số yêu cầu và banner thiếu mục (O9) vẫn hiện; mở lại dự án đã có nháp coi như giáo viên đã chốt số. Đây là dự đoán, không phải lời hứa: giáo viên vẫn nhập tay được bất kỳ số nào và việc thiếu mục không chặn lưu (DECISIONS #21).
- **“AI gợi ý & tạo ngay” (O13):** ở bước 2 có nút một bấm: lưu chỉnh sửa phân tích → gọi recommender rule-based → chọn thể loại đầu → dựng cấu hình + dự đoán số mục → lưu dự án ở bước cấu hình → hiện thẻ xác nhận (thể loại, số mục, Fast/Thinking, lý do, cảnh báo thay nháp). **Chưa gọi AI tạo nội dung** cho tới khi giáo viên bấm “Bắt đầu tạo”; “Huỷ” đóng thẻ và giữ nguyên trạng thái cũ. Khi xác nhận mới lưu bước `generate` và chạy `wizardGenerateRun()`.
- **Bước 3:** trạng thái chọn lấy từ `wizardState.selectedGameType` thay vì id gợi ý, nên chip “thể loại khác” đổi màu/nền, có `✓`, `aria-pressed="true"` và dòng “Đang chọn: …”; thẻ gợi ý cũng đổi viền/nhãn.
- **Bước 5:** thêm **← Cấu hình** ngay trong trạng thái đã có nội dung (trước đây chỉ có ở trạng thái rỗng); “Lưu tiến trình”, “Lưu vào Thư viện”, “Trò chơi khác” đều báo toast và không bấm lặp khi đang bận; câu thiếu mục phân biệt do giáo viên tự đặt số hay do dự đoán tự động.
- **Bố cục và tương phản:** danh sách “Dự án đang làm” dùng `minmax(0,1fr)` + `.quick-copy`, tên dài bị cắt ellipsis thay vì đẩy rộng cột; game **Đường đua tri thức** đặt lại màu chữ tối trên thẻ sáng `.race-turn` / `.race-team-row` (nguyên nhân: `.game-stage{color:#fff}` rò vào các thẻ nền sáng) và hint xám `#5b6478`.
- **Tệp:** `src/services/item-capacity.ts` (mới), `src/services/game-recommender.ts`, `src/main.ts`, `src/preload.ts`, `src/shared/types.ts`, `src/renderer/features/wizard/{state,step-analysis,step-configure,step-generate,step-recommend}.ts`, `src/renderer/pages/create-wizard.ts`, `src/renderer/styles/app.css`, `src/renderer/features/gameplay.ts`, `tests/item-capacity.test.ts` (mới), `tests/smoke/smoke81.js` (mới), `tests/smoke/smoke76.js`, `tests/smoke/smoke78.js`, `package.json`, `docs/DECISIONS.md` #41.
- **Kiểm chứng:** `npm run check` sạch; `npm test` build + **29 suite** pass (thêm `item-capacity`: biên 4–7, trần 2B/4B/7B + Thinking, 14B không bị nhận nhầm là 4B, tài liệu ngắn/dài, không có tài liệu, bất biến theo 5 thể loại × 4 model × 2 chế độ); CDP `smoke81` **26/26** (dự đoán + áp vào ô số + “Dùng N”, chip bước 3 đổi trạng thái, tạo thật bằng fixture rồi quay lại cấu hình + toast lưu tiến trình, tự điều chỉnh số khi bản nháp có 4 mục, thẻ xác nhận không gọi AI và huỷ được, “Tiếp tục” xoá thẻ chờ, xác nhận “Bắt đầu tạo” sinh xong nội dung và sang bước 5, tên dự án dài không tràn, màu game đua đúng `rgb(43,48,80)` trên nền sáng); hồi quy `smoke76` **12/12**, `smoke77` **11/11**, `smoke78` **21/21**, `smoke80` **17/17**.
- **Smoke76/78:** hai test này cố ý đặt `config.questionCount = 3` sau `wizardDefaultConfig` vì fixture chỉ trả 3 câu; chúng kiểm tra đồng hồ/chẩn đoán, không phải ngưỡng tự động 4–7 (đã ghi chú trong test).
- **Chưa verify:** chưa chạy lại trên **Qwen thật** để xem dự đoán có khớp thời gian/token thực tế; chưa chạy trên bản đóng gói `release/win-unpacked`; chưa thử màn hình rất hẹp (<1024 px) cho tên dự án dài; chưa đo tỉ lệ AI tạo đúng số mục khi được giao 4–7.
- **Tiếp theo đề xuất:** chạy một lượt Qwen thật với tài liệu ngắn/trung bình để so số mục dự đoán với số mục tạo được, rồi đóng gói lại installer.

## Nhật ký chẩn đoán AI (O10) (2026-10-21)

- **Vì sao:** giáo viên chạy app trên máy khác (máy thứ hai, bản 4B, máy chỉ CPU) nên lỗi AI chỉ có thể chẩn đoán qua tệp gửi lại. Cách này không cần CDP, console hay Internet.
- **Ghi gì:** JSONL theo ngày ở `<userData>/edugame-data/logs/ai-YYYY-MM-DD.jsonl`: `app.start` (phiên bản, nền tảng, Electron, CPU/RAM, id model trong danh mục, runtime đã cài, chế độ AI), `analyze.done` (số mục tiêu/khái niệm, giây, cache), `generate.start` (gameType, mode, model, requested/unit, regenerate), `generate.attempt`, `generate.incomplete` (lý do thật, ví dụ `Mới có 1/4 câu hỏi`, và có thử lại hay không), `generate.done` (requested/found, attempts, lỗi/cảnh báo, giây, `canPublish`), `generate.cached`, `*.error` (mã + thông điệp ≤240 ký tự), `runtime.start/ready/stop/error`, `diagnostics.export`.
- **Không ghi:** nội dung giáo án, prompt, câu trả lời của model hay khóa API. Bộ lọc theo tên khóa (`apiKey`, `authorization`, `token`, `secret`, `password`, `cookie`, `credential`) thay bằng `[redacted]` phòng khi caller truyền cả object settings.
- **Giới hạn trên đĩa:** xoay vòng khi tệp ngày vượt 2 MB (đổi tên `ai-YYYY-MM-DD-HHmmssSSS.jsonl`) và xóa tệp cũ hơn **14 ngày** lúc khởi động. Thông điệp lỗi được làm phẳng, cắt còn 240 ký tự và thay phần trong ngoặc kép bằng `"…"` (vì lỗi kiểm tra có thể trích nội dung model tạo). Mọi thao tác là best-effort: log hỏng không được làm hỏng tính năng đang chẩn đoán.
- **Xuất gói:** Settings → “Chẩn đoán AI (log)” có 3 nút và dòng thông tin (số tệp, dung lượng, thư mục, hạn 14 ngày). “Xuất gói chẩn đoán” ghi `EduGame-Studio-chan-doan-YYYYMMDD-HHmmssSSS.txt` (header người đọc được: phiên bản, hệ điều hành, CPU, RAM, model/runtime + 200 dòng log gần nhất) **lên Desktop** để dễ tìm/gửi/xóa; nếu Desktop không ghi được thì rơi về thư mục log. “Mở thư mục log” mở Explorer; “Xóa log trên máy” hỏi xác nhận bằng **cú bấm thứ hai trong 4 giây** rồi xóa `ai-*.jsonl` + `diagnostics-*.txt` trong dữ liệu ứng dụng (không đụng tệp đã xuất trên Desktop). Tên tệp có mili giây nên hai lần xuất liền nhau không ghi đè. Không upload, không đồng bộ, không telemetry.
- **Vị trí trên máy đã cài:** `%APPDATA%\edugame-studio\edugame-data\logs` (đường dẫn đầy đủ hiện ngay trong Settings). Bản đóng gói dùng cùng `app.getPath('userData')` nên không phụ thuộc thư mục cài hay quyền admin; biến `EDUGAME_DIAGNOSTICS_DIR` chỉ là hook cho test, giáo viên không đặt.
- **Tệp:** `src/services/ai-log.ts` (mới), `src/main.ts` (khởi tạo, điểm log analyze/generate/runtime, IPC `diagnostics:export` / `info` / `clear` / `open-folder`), `src/services/lesson-workflow.ts` (`onIncomplete`), `src/preload.ts`, `src/shared/types.ts`, `src/renderer/pages/settings.ts`, `src/renderer/features/settings.ts`, `tests/ai-log.test.ts`, `tests/smoke/smoke78.js`, `tests/smoke/smoke79.js`, `package.json` (chuỗi `npm test`), `docs/DECISIONS.md` #38.
- **Kiểm chứng:** `npm run check` sạch; `npm test` build + **27 suite** pass (thêm `ai-log`: redaction, ghi JSONL, rotate, prune 14 ngày, `readRecent`, `sanitizeLogMessage`, bundle + tên tệp không trùng + `clearAiLogs`; `lesson-workflow` kiểm tra `onIncomplete` trả đúng reason/attempt/retrying và `retrying:false` ở lượt ngắn thứ hai); CDP `smoke78` **22/22** (fixture sinh 3/3 → panel + 3 nút + dòng thông tin → xuất gói vào thư mục đích: tệp tồn tại, header đủ, có `app.start` + `generate.start` + `generate.done` của đúng dự án với `requested:3`/`found:3`/`attempts:1`, không chứa câu giáo án hay khóa API, mở thư mục trả đúng path, xóa log cần 2 lần bấm và chỉ còn dòng `diagnostics.clear`, 0 lỗi renderer); **bản đóng gói** `release/win-unpacked` với `smoke79` **15/15** (panel + bridge, log nằm trong `edugame-data\logs`, có `app.start` với `fixtureMode:false`, xuất tệp ra thư mục đích, xóa log 2 bước đúng); hồi quy `smoke76` **12/12**, `smoke77` **11/11**, `smoke72` **17/17**. Bộ cài: `npm run dist:win` → `release/EduGame-Studio-Setup-0.3.0.exe` (88,3 MB, SHA-256 `DC195B7E…AEF5DA0`, **chưa ký số**); đã cài im lặng (`/S /D=<temp>`) rồi chạy đúng bản đã cài và vượt `smoke79` **15/15**, sau đó gỡ im lặng (`/S`): thư mục cài, shortcut Start Menu và khoá Uninstall đều sạch, model 3,71 GB trong `%APPDATA%\edugame-studio\edugame-data\ai-local` còn nguyên (phải tạm đổi tên trước khi gỡ vì `customUnInstall` xoá `ai-local`).
- **Chưa verify:** chưa chạy trên **máy Windows thứ hai thật** với model/runtime thật (đã cài + chạy bản cài trên chính máy này, nhưng chưa qua máy khác); bộ cài chưa ký số nên SmartScreen sẽ hiện "Windows protected your PC" trên máy lạ (phải bấm More info → Run anyway); chưa thử nhánh Desktop bị chặn ghi (fallback về thư mục log); chưa đo kích thước log sau nhiều ngày dùng thực tế (ước tính dưới 2 MB/ngày với vài lượt AI).

## Số luồng CPU tự động (O11) (2026-10-21)

- **Câu hỏi:** có nên cho chỉnh 4 vs 8 luồng trong Settings vì "laptop chỉ có 4 nhân"? Trả lời bằng đo trước, không đoán.
- **Cách đo:** `llama-server` b11681 + Qwen3.5 4B Q4_0 đã cài, prompt 2.386 token + trả lời 160 token, chạy `--threads` 4/6/8, mỗi mức một lần rồi lặp lượt hai theo thứ tự **8 → 4** để loại ảnh hưởng nhiệt:
  - 4 luồng: **14,4–15,7** prompt tok/s · 4,9–5,6 decode tok/s · nạp 4–6 s
  - 6 luồng: 17,0 · 5,9 · 4 s
  - 8 luồng: **18,2–18,4** · 5,4–5,6 · 3–4 s
- **Kết luận:** 8 luồng nhanh hơn **15–20%** ở phần đọc prompt (phần chiếm phần lớn 198 s phân tích), decode gần như bằng nhau → **không thêm nút 4 vs 8**, giữ tự động. Nút đó chủ yếu giúp giáo viên làm app chậm đi.
- **Máy 4 nhân/4 luồng vốn đã an toàn:** `resolveCpuThreads(logical, recommended) = max(1, min(logical, recommended))` → 4C/4T nhận 4, không bao giờ vượt số luồng logic; 4C/8T nhận 8 (đúng mức đo nhanh nhất). Hàm mới dùng chung cho `AIManager`, embedding runtime và phần summary của `ModelInstaller`.
- **Khớp với log thật:** 12 câu ≈ 1.200 token ÷ 5,5 tok/s ≈ 218 s (log ghi 241 s); phân tích ≈ 2.400–3.000 token prompt ÷ 18 tok/s + trả lời ≈ 198 s → đúng là giới hạn CPU, không phải lỗi.
- **Tệp:** `src/ai-core/runtime-threads.ts` (mới), `src/main.ts`, `src/ai-core/model-installer.ts`, `tests/runtime-threads.test.ts` (mới), `package.json` (chuỗi `npm test`), `docs/DECISIONS.md` #39.
- **Kiểm chứng:** `npm run check` sạch; `npm test` build + **28 suite** pass (`runtime-threads`: 8/8→8, 4/8→4, 16/6→6, 2/8→2, 0/NaN→1, làm tròn xuống, luôn nằm trong `1..logical`). Hành vi app không đổi — chỉ tách hàm và khóa bằng test.
- **Chưa verify:** mới đo trên một CPU (i3-10105F); máy 4C/4T thật chưa đo trực tiếp (suy ra từ clamp, không phải từ benchmark); nếu sau này giáo viên phàn nàn máy giật *trong lúc* tạo, hướng đúng là tuỳ chọn "Giảm tải CPU" (4 luồng, ghi rõ chậm 15–20%), không phải nút tốc độ.

## Xử lý AI trả thiếu mục (O9) (2026-10-21)

- **Hiện tượng:** Qwen 2B có lượt trả **1/4 câu hỏi** dù cấu hình 4; bản nháp vẫn hợp lệ (`0 lỗi`) nên trước đây chỉ có một cảnh báo cố vấn trong danh sách, rất dễ bỏ qua và giáo viên có thể lưu một game ngắn hơn ý muốn.
- **Thử lại một lần (main):** `runStructuredStep` nhận thêm `incompleteReason` / `completenessScore` / `incompleteMessages`. `generateGameDraft` so `found` với `requestedItemCount(config)`; nếu thiếu, nó giữ câu trả lời trước làm lượt `assistant` và hỏi lại **một lần** cho đủ số mục (`buildDraftShortfallMessages`, nêu rõ `mới có 1/4 câu hỏi`). Nếu vẫn thiếu, trả bản **đầy đủ nhất** — không bịa thêm mục, không thử lần thứ ba.
- **Banner ở bước 5 (renderer):** khi `counts.found < counts.requested`, hiện hộp `role="alert"` với `data-wizard-shortfall="1/4"`, câu "AI mới tạo 1/4 câu hỏi — còn thiếu 3.", nút **🔄 Tạo lại cho đủ 4 câu hỏi** (một bấm) và lời nhắc có thể mở trình chỉnh sửa để tự thêm. Danh sách cảnh báo cố vấn bên dưới giữ nguyên; **vẫn cho lưu** (DECISIONS #21) vì bản nháp hợp lệ.
- **Không đệm dữ liệu giả:** không sinh mục rỗng/placeholder, không sửa `counts`, không chặn lưu — chỉ thử lại và nói đúng số liệu.
- **Tệp:** `src/services/lesson-quality.ts` (`requestedItemCount` export), `src/services/lesson-prompts.ts` (`buildDraftShortfallMessages`), `src/services/lesson-workflow.ts` (vòng lặp + `generateGameDraft`), `src/renderer/features/wizard/step-generate.ts` (`wizardShortfallNotice`), `tests/lesson-workflow.test.ts`, `tests/smoke/smoke76.js`, `tests/smoke/smoke77.js`, `tests/fixtures/wizard/short/`.
- **Kiểm chứng:** `npm run check` sạch; `npm test` build + **26 suite** pass (thêm ca O9 trong `lesson-workflow`: thiếu → gọi lại đúng 1 lần với lượt `assistant` + lý do `1/2 câu hỏi`; thiếu cả hai → trả bản đầy nhất sau 2 lần; đủ → 1 lần); CDP `smoke77` **11/11** (fixture `tests/fixtures/wizard/short` trả 1/4: banner đúng số, nút tạo lại bật, cảnh báo cố vấn vẫn hiện, nút lưu vẫn bật, banner biến mất khi `found = requested`), `smoke76` **12/12** (+1 check: bản nháp đủ 3/3 không có banner).
- **Chưa verify:** chưa đo lại thời gian Qwen thật khi phải thử lại (worst case +1 lượt model; khoảng "dự kiến" hiện vẫn bao phủ trên máy này); chưa bấm chuột thật trên bản đóng gói.
- **Tiếp theo đề xuất:** chạy một lượt Qwen thật có chủ đích trả thiếu (nếu tái hiện) để xác nhận thời gian và tỉ lệ thành công của lần thử lại; sau đó build lại installer.

## update_plan_3 Đợt 3 (đợt này) — Theme, kéo thả file, toàn màn hình, đổi tên dự án (2026-10-21)

- **Theme Light/Dark/System:** thêm `preferences.theme` vào `AppSettings`, select `#settingTheme` trong Cài đặt, `applyTheme()` áp dụng `data-theme` lên `<html>` (system theo `prefers-color-scheme`), lưu/khôi phục khi mở app; thêm CSS override tối thiểu cho biến màu.
- **Kéo thả file giáo án:** thêm dropzone trong trang Giáo án và IPC `files:import-document-from-path` (xác thực định dạng trong main), xử lý kéo thả qua `handleLessonDrop`.
- **Toàn màn hình khi chơi:** thêm nút ⛶ trong modal chơi, IPC `window:set-fullscreen`, thoát bằng Esc, tắt fullscreen khi đóng modal.
- **Đổi tên dự án:** nút ✏️ trong Dự án của tôi, prompt tên mới, lưu qua `project:save-draft` (giữ ID, quan hệ dữ liệu).
- **Hỏi đáp chuyên sâu (Q&A):** thay placeholder bằng panel chọn giáo án + câu hỏi; IPC `lesson:answer-question` dùng `selectRelevantEvidence` để trích dẫn; ưu tiên AI Local để trả lời, fallback trích dẫn nếu AI chưa chạy.
- **Chưa làm trong đợt này:** chưa chạy smoke CDP/installer máy sạch. Theme dark đã phủ các utility phổ biến và biến màu.

- **Kiểm chứng:** `npm run check` sạch; `npm run build` thành công; `npm test` build + 26 suite pass.

## update_plan_3 Đợt 2 — Thinking đúng spec §7/§9 + UI Task Manager (2026-10-20)

- **Thinking đo lại với `--jinja` (spec §7):** tool mới `tests/manual/thinking-probe.js` (HTTP thẳng tới llama.cpp b11681 + Qwen3.5-2B Q4_0, prompt một câu trả lời ngắn không schema). `enable_thinking:true` + `--jinja`: 900 token → 3.204 ký tự `reasoning_content`, **0 `content`**, 67 s; 2.048 token → 8.341 ký tự suy luận, **0 nội dung**, 158 s; đối chứng `false` → 23 ký tự nội dung, 1,7 s. Kết luận O6/`DECISIONS #26` **vẫn đúng với Jinja template**: Thinking không bật `enable_thinking`.
- **Nhãn UI Fast/Thinking (spec §9, trung thực):** bước 4 wizard đổi options thành `Fast — Nhanh (mặc định)` / `Thinking — Kỹ, nhiều ngữ cảnh hơn` (giá trị `fast`/`deep` giữ nguyên → cache/project/contract không đổi) + hint nói thẳng thinking chưa dùng được trên model/runtime này; khác biệt thật là ngữ cảnh (8 đoạn/6.000 ký tự vs 6/4.500) và trần output (2.560/4.096 vs 2.048/2.048). Bước 5 + summary đổi nhãn tương ứng. Không có lựa chọn "Phân tích chuyên sâu" trên trang tạo game (§9).
- **Fallback chặn output rỗng:** `readAssistantContent` (ai-transport) phát hiện phản hồi chỉ có `reasoning_content` → `AI_EMPTY` với thông điệp nêu đích danh `reasoning_content` và khuyên chọn Fast (thay cho thông điệp chung chung).
- **UI Task Manager (§8) trong trang Cài đặt:** section "Tác vụ AI" mới — danh sách live + history từ `listAiTasks()` (gộp theo taskId, live thắng history, sort mới nhất trước), badge 5 trạng thái tiếng Việt, loại task, tiến độ, kết quả, lỗi, dấu "lịch sử" cho hàng khôi phục; nút **Làm mới**; nút **Xác minh runtime CPU** hiện số đo thật (`ai:runtime-verify`: backend, phiên bản pinned, số tệp, marker GPU, args `--n-gpu-layers 0 …`). Controller tự wire khi vào trang Cài đặt.
- **Types:** `EduGameBridge` thêm `listAiTasks` + `verifyCpuRuntime`.
- **Test:** `tests/ai-transport.test.ts` thêm ca reasoning-only + ca rỗng không reasoning; CDP smoke mới **`tests/smoke/smoke72.js` 15/15** (task panel render + list loaded, IPC `{live,history}` + history luôn `restored`, verify panel đủ backend/args/GPU markers, refresh, options Fast/Thinking + hint + không có "Phân tích chuyên sâu", 0 exception/console error). `npm run check` sạch; `npm test` 26 suite pass.
- **Chưa verify:** Thinking mode trên model GGUF lớn hơn (4B/8B) hoặc runtime có `--jinja` + grammar combo khác; task list khi có task thật đang chạy (smoke chạy trên profile trống). Đã verify runtime trên máy thật đã cài model (panel: “Đã cài: có”, 54 tệp, 0 marker GPU) và smoke72 trên bản đóng gói `release/win-unpacked` (15/15) + smoke71 (25/25).

## update_plan_3 Đợt 1 — Task Manager CPU-only + verify runtime + ẩn UI GPU (2026-10-20)

- **Task Manager tập trung (`src/services/ai-tasks.ts` mới):** `AiTaskManager` Main-side theo dõi analyze/generate/regenerate-item với states `running/completed/failed/cancelled`, ID ổn định, loại task, project/document liên quan, progress stage, lỗi typed, tóm tắt kết quả. Tách khỏi `AiSingleFlight` (chặn trùng) và `AiRequestRegistry` (abort) — module này chỉ ghi nhận, không thực thi.
- **Lịch sử SQLite (`ai_tasks` mới, additive):** `LessonStore.saveAiTask/getAiTask/listAiTasks/pruneAiTasks`, upsert theo `task_id`, chỉ lưu tóm tắt, không copy payload. Hàng sau restart luôn là history, không bao giờ báo “đang chạy” giả.
- **IPC mới:** `ai:tasks` trả `{ live, history }`, `ai:runtime-verify` trả verify CPU-only, `ai:cancel` giờ cập nhật cả task tracked. Preload thêm `listAiTasks/verifyCpuRuntime`.
- **Verify CPU-only (`verifyCpuRuntime` trong main):** xác nhận artifact `llama-b11681-bin-win-cpu-x64.zip` pinned, quét thư mục runtime tìm marker CUDA/Vulkan, khẳng định args `--n-gpu-layers 0 --parallel 1 --ctx-checkpoints 0`. Không Toolkit/VRAM/chuyển CPU-GPU.
- **Ẩn UI GPU:** trang Cài đặt không còn hiện tên GPU/VRAM, chỉ hiện “Bản CPU-only: AI local chạy hoàn toàn trên CPU”. Abstraction `gpuLayers/hardware.gpu` giữ nguyên nội bộ để mở rộng sau.
- **Test:** `tests/ai-tasks.test.ts` mới (states, terminal bất biến, trùng requestId, cancel/fail), `tests/lesson-store.test.ts` thêm upsert/list/prune `ai_tasks`, pipeline `npm test` lên **26 suite**.
- **Verified:** `npm run check` sạch; `npm test` build + 26 suite pass.
- **Chưa verify:** CDP smoke cho IPC task mới, verify runtime trên máy có GPU rời, Thinking thật trên GGUF (vẫn `enable_thinking:false`).

## Sửa lỗi khởi chạy Qwen3.5 4B + dọn model AI khi gỡ cài đặt (2026-10-20)

- **Lỗi ghi nhận trên máy thứ hai:** `ai:start-local-runtime` báo `không khởi chạy được model Qwen3.5 4B Q4_0: AI runtime đã thoát trước khi sẵn sàng (code 3221225477)`. `3221225477` = `0xC0000005` (`STATUS_ACCESS_VIOLATION`). Lỗi không tái hiện trên máy phát triển (i5-10210U / 16 GB) nên **nguyên nhân chính xác trên máy thứ hai chưa được xác nhận**; bản sửa tập trung vào các nguyên nhân phổ biến và vào việc không để giáo viên chỉ thấy một mã lỗi khó hiểu.
- **VC++ runtime đi kèm ứng dụng:** gói `llama-b*-bin-win-cpu-x64.zip` của llama.cpp import `MSVCP140.dll`, `VCRUNTIME140.dll`, `VCRUNTIME140_1.dll` nhưng không đóng gói các DLL này. `vendor/vc-runtime/` chứa bản Microsoft Visual C++ 2015–2022 (x64) **14.50.35719.0**; electron-builder đưa chúng vào `resources/vc-runtime`, và `LlamaRuntimeInstaller.ensureSupportFiles()` sao chép cạnh `llama-server.exe` khi cài hoặc trước khi chạy. Cơ chế này cũng sửa các bản runtime đã tải trước đó mà không cần tải lại gói llama.cpp.
- **Giảm bộ nhớ và tránh crash:** `llama-server` của chat dùng `--parallel 1` (ứng dụng đã single-flight, không cần 4 slot) và `--ctx-checkpoints 0`; server embedding cũng dùng `--parallel 1`. Trước khi spawn, app từ chối model nếu tổng RAM thấp hơn mức tối thiểu trong catalog hoặc RAM trống thấp hơn `kích thước model + 768 MB`, kèm thông báo tiếng Việt gợi ý đóng ứng dụng hoặc chọn **Bản Nhanh 2B**. Đây là guard thô, không phải tuyên bố tham số “tối ưu”.
- **Chẩn đoán tốt hơn:** `AIManager` đọc cả `stdout` và `stderr` (trước đây chỉ đọc `stderr`, nên nhiều crash không có log), và map các mã Windows thường gặp (`0xC0000005`, `0xC000001D`, `0xC0000135`, `0xC0000139`, `0xC00000FD`, `0xC0000409`) sang giải thích + hướng xử lý. Cửa sổ AI local giữ nguyên thông báo đầy đủ trong `#localModalProgress` thay vì chỉ hiện toast ngắn.
- **Gỡ cài đặt dọn model/runtime:** `build/installer.nsh` thêm macro NSIS `customUnInstall`, chỉ xoá `%APPDATA%\edugame-studio\edugame-data\ai-local` (và đường dẫn tên sản phẩm cũ nếu có). `nsis.deleteAppDataOnUninstall` vẫn **false**, nên `edugame.sqlite`, `lessons/`, lịch sử kết quả và cài đặt của giáo viên được giữ nguyên; model/runtime có thể tải lại nên không cần giữ vài GB trong profile.
- **Kiểm chứng đã chạy:** `npm run check` sạch; `npm test` build + **25 suite**; bản `release/win-unpacked` vượt `smoke71` **25/25**, `smoke69` **19/19**, `smoke68` **44/44**. Đã xoá 3 DLL VC++ khỏi runtime thật, chạy app đóng gói với profile tạm và `ai:start-local-runtime('qwen3.5-2b-q4_0')` → **READY**, sau đó xác nhận 3 DLL được sao chép lại từ `resources/vc-runtime`. Chạy tay 4B với tham số mới → `n_slots = 1`, `n_ctx_slot = 8192`, `listening on http://127.0.0.1:9341`, health 200. Kiểm tra gỡ cài đặt bằng bộ cài silent: tạo `ai-local` giả, cài vào thư mục tạm, chạy uninstaller silent → dummy `ai-local` bị xoá, `edugame.sqlite` giữ nguyên kích thước **753.664 byte**, `lessons/` vẫn còn.
- **Installer hiện hành:** `release/EduGame-Studio-Setup-0.3.0.exe` — **92.591.130 byte**, 20/10/2026 20:32, SHA-256 `24DEF7FC9327FE901D67E2ED59729BF42045332391859A465C15B869907DE8E0` (rebuild sau commit `b371b66`; `win-unpacked/resources/vc-runtime` đủ 3 DLL, `app.asar` chứa `treasure-art`/`game-audio`/`AiSingleFlight`).
- **Chưa verify:** chưa chạy lại trên chính máy thứ hai; nguyên nhân gốc (`0xC0000005`) chưa được xác nhận ở đó. Nếu vẫn lỗi, cần Windows version, CPU/RAM, việc 2B có chạy được không, model id đã chọn và toàn bộ nội dung lỗi trong cửa sổ AI local. Chưa bấm chuột thật toàn bộ game/5 kiểu nhiệm vụ kho báu và chưa cài trên một máy Windows sạch khác.

## §5.2b — Hình nền, nhân vật minh họa và âm thanh cho kho báu (2026-10-20)

- **6 hình nền dựng sẵn:** đền cổ, rừng nhiệt đới, hang băng, sa mạc, đại dương, không gian. Mỗi cảnh là SVG nội tuyến + CSS, không cần tệp ảnh, không tải mạng và không làm phình `.egame`.
- **5 nhân vật dựng sẵn:** nhà thám hiểm, nhà khoa học, nhà sinh vật học, phi hành gia, thám hiểm biển. Avatar xuất hiện ở đầu bản đồ và cạnh lời dẫn/cốt truyện; tên nhân vật vẫn do giáo viên nhập.
- **Tương thích ngược:** `treasureHunt.backgroundId` và `characterId` là **tùy chọn**; game cũ thiếu trường sẽ tự dùng `temple`/`explorer`, `schemaVersion` vẫn **1**. Editor có hai select + preview cập nhật ngay; adapter, draft và zod giữ nguyên lựa chọn khi lưu/mở lại.
- **Âm thanh offline:** hiệu ứng mở màn, đúng, sai, ghép cặp, gợi ý, vật phẩm, chuyển chặng và nhận kho báu được tổng hợp bằng Web Audio (không có tệp âm thanh, không gọi mạng). Nút loa trong bản đồ bật/tắt và ghi nhớ lựa chọn trong `localStorage`; mọi lỗi audio đều bị nuốt để không làm hỏng gameplay.
- **Kiểm chứng:** `npm run check` sạch; `npm test` build + **25 suite**; `smoke71` **25/25** (lưu/đọc trường art, fallback game cũ, SVG nền/nhân vật, mute + localStorage, âm thanh đúng/chuyển chặng, preview và lưu từ editor); hồi quy `smoke68` **44/44**, `smoke69` **19/19**, `smoke70` **8/8**, `smoke56` **58/58**, `smoke58` **26/26**. Bản đóng gói `release/win-unpacked` cũng vượt `smoke71` **25/25** + `smoke69` **19/19**; installer mới 92.383.816 byte lúc 19:26, SHA-256 `B6FA3410…85BA1A1F`. Đã xem screenshot thật của cảnh rừng để kiểm tra bố cục; chưa bấm chuột thật trên Windows và chưa cài trên máy sạch.

## `update_plan_2` — Lưu/mở lại, gameplay, chống gọi AI trùng, lịch sử kết quả, tách 3 khu vực (2026-10-20)

- **Lưu dự án và lưu game đã tách:** bước 5 có **"Lưu tiến trình"** (`project:save-draft`) và **"Lưu vào Thư viện trò chơi"** (`library:save-game`); lưu game đưa project sang `done/ready`. Ghi game/project theo từng dòng (`upsert`) thay vì ghi lại cả DB; bấm lặp không tạo bản ghi trùng và không xoá dữ liệu của thao tác trước.
- **Giáo án mở lại được:** `LessonStore.listDocumentLibrary()` + IPC `lesson:library` trả tài liệu, analyses đã lưu (mới nhất trước) và `sourceAvailable`. Trang **Giáo án** có "Tài liệu của tôi", trạng thái **Sẵn sàng/Thiếu tệp nguồn**, nút mở lại cả tài liệu chưa phân tích, và **"Tạo trò chơi"** dùng lại analysis (**0 lượt Qwen**). Kết quả phân tích có thể mở rộng để xem **mục tiêu & kiến thức trọng tâm** đã lưu; không sinh nội dung khi chưa phân tích. Tệp nguồn bị mất được báo rõ, không xoá draft/snapshot của project.
- **Dự án của tôi:** danh sách `GameProject` thật với bước/trạng thái/giáo án nguồn/cấu hình, mở lại vào wizard, xoá project **không** xoá game đã lưu. Chỉ bước `done` mới hiện "Đã lưu trò chơi"; bản nháp đã tạo nhưng chưa lưu thư viện không bị gắn nhãn hoàn thành.
- **Chống gọi AI trùng:** `AiSingleFlight` ở main trả `AI_BUSY` trước khi gọi model; analyze/generate/regenerate/legacy generation dùng chung cổng, cache hit generate không chiếm cổng. Start/stop runtime dùng chung một promise, được tuần tự hoá khi đổi model và bị từ chối khi AI đang bận; khóa luôn nhả trong `finally` (thành công, lỗi, timeout, huỷ). Renderer map `AI_BUSY` sang tiếng Việt ở wizard, editor và cửa sổ AI local, không kẹt "đang xử lý".
- **Tình huống:** `nextSituationId: null`/thiếu = đi tuần tự; kết thúc có chủ đích dùng `GameOption.endsScenario` mới (tùy chọn). Unit test 1/2/10 câu; `smoke70` chạy UI 1/2/10 câu, có đáp án sai, tổng kết đúng.
- **Đấu trường:** ô nhập có màu chữ/nền/caret/focus đọc được; đúng/sai canonicalize **chỉ theo `type`** thành đúng 2 lựa chọn `Đúng`/`Sai`, giữ đáp án đúng, dấu ✓/✗; câu nhiều lựa chọn chứa chữ "đúng/sai" không bị phân loại lại; 3 lựa chọn là lỗi contract (sửa/tạo lại), không âm thầm bỏ. Prompt sinh câu đúng/sai yêu cầu **không viết sẵn đáp án/lời giải trong prompt**; `draft` prompt version tăng lên **2** để không tái dùng cache theo wording cũ.
- **Ghép cặp:** prompt siết quan hệ một-một rõ ràng; quality thêm cảnh báo cặp trùng/generic; đúng cặp hiện giải thích. Vẫn **cố vấn**, không chặn lưu.
- **Lịch sử kết quả:** bốn màn kết quả tự lưu **một** session khi hoàn thành, upsert theo id, đổi tên cập nhật đúng dòng, không lưu phiên bỏ dở, giữ 1.000 dòng và không cắt mất dòng vừa ghi khi đổi tên session cũ; trang Lịch sử hiện trò chơi/người chơi/thời lượng/thời điểm/điểm. Đã kiểm tra tự lưu cho đấu trường, tình huống, ghép cặp, kho báu và trắc nghiệm/điền từ.
- **Ba khu vực:** Giáo án = tài liệu + phân tích; Dự án của tôi = tiến trình; Thư viện = game đã lưu. "Hỏi đáp chuyên sâu" chỉ là placeholder **"SẮP CÓ" / "Chưa khả dụng"**, nêu định hướng AI Local trước/AI Cloud sau, không gọi AI. Nhập `.egame` bên ngoài bị ẩn khỏi Home/Thư viện/Cài đặt nhưng mã IPC/import/export vẫn giữ.
- **Kiểm chứng:** `npm run check` sạch; `npm test` build + **25 suite**; `smoke69` **19/19**; `smoke70` **8/8**; `persistence71` **3/3** khi ghi + **9/9** sau khi đóng/mở lại app (giáo án, analysis, project, game, session, cả ba trang); hồi quy `smoke68` **44/44**, `smoke58` **26/26**, `smoke67` 124/124, `smoke56` **58/58**. Smoke dùng hook `EDUGAME_USER_DATA` để tách hồ sơ, không ghi vào dữ liệu giáo viên; `smoke69` xác nhận lưu game lặp vẫn 1 dòng.
- **Qwen thật trong app:** `tests/manual/real-ai-e2e.js` **19/19** trên CPU i5-10210U / 16 GB, model `qwen3.5-2b-q4_0`, runtime READY sau **14 s**. Phân tích thật 63 s (3 mục tiêu, 3 khái niệm), sinh 4 câu arena 75 s, 0 lỗi chất lượng, lưu game và mở màn chơi được. Test cũng xác nhận **huỷ giữa lượt phân tích** trả `AI_CANCELLED` và runtime vẫn READY, đồng thời lượt phân tích thứ hai bị `AiSingleFlight` chặn. Đây là đo trên một bài ngắn; không phải tuyên bố tham số “tối ưu”.
- **Installer:** `npm run dist:win` đã đóng gói lại sau §5.2b: `release/EduGame-Studio-Setup-0.3.0.exe` — **92.383.816 byte**, 20/10/2026 19:26, SHA-256 `B6FA34108A7B256799D3A75A8A9691695D6DC5A2F0C923211C44C2D885BA1A1F`. `app.asar` có `treasure-art.js`/`game-audio.js` cùng `EDUGAME_USER_DATA`, `aiSingleFlight`, `id <> @id`, `sourceAvailable`, mục tiêu/kiến thức trọng tâm, placeholder “Hỏi đáp chuyên sâu”, thông báo AI bận ở cửa sổ AI local, `endsScenario` và `draft: 2`. Bản `release/win-unpacked` vượt `smoke71` **25/25** (art/audio) và `smoke69` **19/19**. `deleteAppDataOnUninstall` đã đổi sang **false** để gỡ app không xoá dữ liệu giáo viên.
- **Chưa verify:** chưa bấm chuột thật trên Windows; chưa cài installer trên máy sạch (đã chạy `win-unpacked`, chưa chạy bộ cài); chưa có tài sản hình ảnh/âm thanh tùy chỉnh do giáo viên tải lên (§5.2b hiện dùng bộ dựng sẵn).

## §5.2 — Bản đồ hành trình + nhiệm vụ đa dạng trong kho báu (2026-10-20)

- **Hợp đồng dữ liệu tương thích ngược:** `TreasureStage.mission` là **tùy chọn**; thiếu `mission` = đúng câu trắc nghiệm cũ trong `question.options`/`correctOptionId`, nên `schemaVersion` giữ **1** và `.egame`/draft/sidecar cũ vẫn mở được. Năm kiểu: `multiple-choice`, `scenario` (dùng lại options), `matching` (2–10 cặp), `decode` (đáp án 1–120 ký tự, cipher tùy chọn ≤200), `classification` (2–4 nhóm, 2–12 mục, `groupId` phải tồn tại). ID trong từng payload phải riêng; AI vẫn chỉ tạo nội dung, scoring/flow vẫn ở TypeScript.
- **Chơi:** bản đồ ngang `.treasure-map` với node `.treasure-map-node[data-stage-id][data-state]` (`done`/`current`/`locked`/`failed`), dấu nhánh phụ và vật phẩm ẩn. Ghép cặp chọn trái→phải; giải mã so khớp chuẩn hóa NFC/không phân biệt hoa thường/dấu câu, tự xáo cipher nếu để trống; phân loại chọn mục rồi chọn nhóm (hỗ trợ Enter/Space). Sai trừ lượt thử; hết lượt mở đáp án và 0 điểm; `attempts: 0` = không giới hạn. Đúng cộng điểm chặng + thưởng hoàn thành, sau đó mới hiện lựa chọn đi tiếp/nhánh/kết thúc.
- **Soạn thảo:** mỗi chặng có chọn kiểu nhiệm vụ và panel riêng (options/cặp/nhóm–mục/đáp án–cipher), nhân bản chặng giữ payload, kiểm tra ID trùng/thiếu vế/thiếu nhóm trước khi lưu. Nút "Tạo lại" của AI **ẩn và bị chặn** ở chặng ghép cặp/giải mã/phân loại; chỉ trắc nghiệm/tình huống được tạo lại từng mục.
- **Lưu/import:** adapter và `fromEducationalGame` copy nguyên `mission`; `normalizeGame` giữ `treasureHunt`; validator cũ và zod đều hiểu kiểu mới; kiểm tra chất lượng là **cố vấn**, không chặn lưu. Unit test phủ contracts, validator, adapter round-trip, `.egame` variant và quality; `tests/smoke/smoke68.js` phủ lưu 3 kiểu biến thể, map state, chơi ghép cặp/giải mã/phân loại, editor sửa và chặn lưu dữ liệu sai.
- **Kiểm chứng:** `npm run check` sạch; `npm test` build + **25 suite**; `smoke68` **43/43** (nay **44/44** sau khi thêm kiểm tra tự lưu kết quả kho báu); hồi quy `smoke67` **124/124**, `smoke56` **56/56** (nay **58/58**). Bản §5.2 lúc đó đóng gói `release/EduGame-Studio-Setup-0.3.0.exe` — 92.364.048 byte, 12:54, SHA-256 `22CFDC7E…65641A5`; installer hiện hành là bản ở mục `update_plan_2` phía trên.
- **Chưa verify (bản §5.2 lúc đó):** chưa bấm chuột thật trên Windows; bản đồ khi đó chỉ dùng CSS. §5.2b đã bổ sung hình nền/nhân vật/âm thanh dựng sẵn ở mục đầu tiên; Qwen thật trong app cũng đã verify sau đó.

## Phân tích giáo án chạy nền + trò chơi thứ hai từ cùng giáo án (2026-10-20)

- **Tiến trình thật:** `lesson:analyze` phát `lesson:progress` tại các mốc thật `prepare → generate → repair → ready`; wizard hiển thị 4 bước, đánh dấu "không cần" nếu không phải repair, và đồng hồ "Đã chờ m:tt · thường mất 1–2 phút". Không bịa phần trăm vì model không stream token.
- **Làm việc khác trong lúc chờ:** người dùng chuyển trang được trong khi phân tích; chip "AI đang phân tích + thời gian" ở topbar vẫn hiển thị và bấm vào sẽ quay lại đúng bước 2. Khi xong ở trang khác, app toast kết quả; mở lại wizard thấy analysis đã cập nhật. Mở một dự án khác bị chặn trong lúc chạy để kết quả muộn không ghi đè dự án vừa mở.
- **Trò chơi thứ hai:** nút "＋ Trò chơi khác từ giáo án này" ở bước 5 (khi đã có nội dung) tạo project mới nhưng giữ `documentId`, `analysisId`, analysis + recommendations; xoá config/draft/snapshot/game id và đưa về bước chọn thể loại. Không gọi Qwen phân tích lại; generation vẫn theo cache/key hiện có. Nếu analysis chưa có recommendations, app dựng lại bằng rule-based (0 lượt Qwen).
- **Test:** `npm run check` sạch; `npm test` build + **25 suite**; `smoke67` **124/124** (+11 check: 4 stage, elapsed, chip show/hide/return sau khi chuyển trang, repair skip/done, project clone giữ analysis + document, xoá dữ liệu game cũ, recommendations, nút + hint). Hồi quy: `smoke66 fixture` **34/34**, `smoke64` **39/39**.
- **Installer:** đã đóng gói lại `release/EduGame-Studio-Setup-0.3.0.exe` — **92.348.901 byte**, 20/10/2026 12:13; đã trích `app.asar` và xác nhận có `globalAiActivity`, `wizardStartAnotherGame`, `wizardStartAnalysisClock`, `data-wizard-analysis-progress`, `another-game` cùng thông báo chặn mở draft khi đang phân tích.
- **Chưa verify:** chưa đo chip/timer với Qwen thật trong cửa sổ app (máy vẫn tự đóng sau ~1–2 phút); hành vi "làm việc khác" mới kiểm bằng fixture + CDP, chưa bấm chuột thật.

## P7 nốt — AI tạo lại từng mục trong editor, chỉ game mở từ wizard (2026-10-20)

Mục "AI regenerate một mục trong editor" của P7 đã làm cho **cả 5 loại** (`arena`, `scenario`, `matching`, `treasure`, `race`) khi editor được mở ngay từ wizard. Game thủ công và game mở lại từ thư viện **không** có nút này vì không có draft/analysis/config đã lưu; các loại vẫn tạo lại từng mục ở danh sách bước 5 của wizard.

- **Nút và phạm vi:** mỗi mục trong editor có "🔄 Tạo lại" khi `openEditor` nhận `aiContext = { projectId, gameType, itemIds }` từ `wizardGenerateOpenEditor`: câu/tình huống ở `#editorQuestions`, cặp ở `#matchingPairs`, chặng ở `#treasureStages`, câu hỏi đua ở `#raceQuestions`. Vị trí 1-based lấy bằng **id do app sở hữu** (`itemIds.indexOf(id)`), nên đổi thứ tự/xoá mục khác không làm tạo lại nhầm; mục sao chép/mới có id mới nên không có nút. Đổi thể loại trong editor sẽ chặn gọi AI.
- **Đường gọi:** vẫn là IPC `lesson:regenerate-item` (một lượt Qwen cho đúng mục, draft có kiểu + analysis + config, merge giữ id/liên kết như O5); editor chỉ thay **một hàng DOM** bằng item đã qua adapter, không gửi lại toàn bộ game và không tự sinh `EducationalGame`. Dự án được IPC lưu; `wizardState` đang mount phía sau được cập nhật từ kết quả để đóng editor rồi mở lại không thấy snapshot cũ.
- **An toàn khi chờ:** nút đang chạy đổi thành "✕ Huỷ" và gọi `ai:cancel`; hai nút lưu bị vô hiệu hoá; đóng modal sẽ huỷ request; lỗi được map sang tiếng Việt (`AI_NOT_RUNNING`, `AI_TIMEOUT`, `GENERATION_INVALID`, …). Không đụng `EducationalGame`, `.egame`, gameplay hay validator.
- **Test:** `smoke67` **113/113** (+15 check): cả 5 loại có đúng số nút theo số mục draft, bấm tạo lại một mục ở từng loại thì draft đổi đúng một mục, số hàng giữ nguyên, DOM nhận nội dung mới, nút trở lại "Tạo lại", và bấm "Lưu vào thư viện" ghi đúng nội dung vừa tạo lại vào game đã lưu. Với matching, smoke tạm đổi nội dung một cặp khác trước khi bấm để tránh cặp fixture trùng (contract chặn cặp trùng đúng như thiết kế). Hồi quy: `smoke66 fixture` **34/34**, `smoke64` **39/39**, `smoke63` **49/49**, `smoke56` **56/56**. `npm run check` sạch; `npm test` build + **25 suite**. Fixture-only (`EDUGAME_AI_TEST_DIR`), không có model thật.
- **Đóng gói (2026-10-20):** `npm run dist:win` → `release/EduGame-Studio-Setup-0.3.0.exe` (92.346.155 byte, 11:45) + `release/win-unpacked`; đã kiểm `app.asar` chứa `editorAiContainer`/`editorAiResultItem`/`data-ai-cancel` trong `dist/src/renderer/features/game-editor.js` và `wizardDraftItemIds` trong `step-generate.js`.
- **Chưa verify:** chưa bấm thử bằng chuột thật trên Windows; chưa chạy với Qwen thật trong cửa sổ app (máy vẫn tự đóng sau ~1–2 phút); chưa test huỷ giữa lượt gọi thật (chỉ có wiring + fixture).

## P7 — Dọn đường document-assist chết (2026-10-20)

Trang "Tạo trò chơi" đã chuyển sang thủ công từ P4, nên toàn bộ đường phân tích/hỏi đáp tài liệu phía sau nó không còn UI nào gọi. Chủ dự án duyệt xoá (2026-10-20):

- **Xoá:** IPC `ai:document-assist` + 4 schema + `buildDocumentAnalysisPrompt` + `requestJsonFromCompatibleApi` trong `main.ts`; `assistWithDocument` khỏi `preload.ts` và `EduGameBridge`; `DocumentAssistRequest` khỏi `shared/types.ts`; `src/renderer/features/document-assist.ts`; thẻ `<script>` tương ứng trong `index.html`; đoạn "tự tổng hợp tài liệu sau khi bật llama.cpp" trong `features/local-ai.ts` (toast còn "llama.cpp đã chạy.").
- **Giữ:** `ai:generate` (đường offline-template vẫn được smoke kiểm) và `src/ai-core/document-assist.ts` (`getLocalDocumentAnalysisExcerpt` được `lesson-prompts.ts` dùng; các helper còn lại có test riêng). `DocumentAnalysis`/`DocumentAnswer` vẫn nằm trong `DraftPayload` của đường `ai:generate`.
- **Kiểm chứng:** `npm run check` sạch; `npm test` build + **25 suite**; `smoke67` **98/98**, `smoke66 fixture` **34/34**, `smoke63` **49/49**, `smoke56` **56/56** — không có lỗi renderer nào sau khi bỏ script.
- **Chưa verify:** `ai:generate` (đường cũ) không có UI gọi; nếu chủ dự án muốn bỏ luôn thì cần quyết định riêng vì smoke hiện vẫn dùng. `tests/legacy/smoke60.js` vẫn nhắc `assistWithDocument` nhưng đã RETIRED, không chạy.

## Tối ưu quy trình AI — O6: Fast/Deep thật + benchmark trước/sau (2026-10-20)

Phase O6 của `docs/implementation-plan.md` §13.5, theo `docs/archive/specs/update-AI-local.txt` §5.3, §5.4, §7, §10, §12. O5 đã cắt lượt gọi; O6 trả lời câu hỏi còn lại bằng **số đo trên Qwen3.5-2B Q4_0 thật**: thinking có dùng được không, prompt phân tích có bị cắt không, một lượt sinh được bao nhiêu câu, và batching có nhanh hơn không.

- **Thinking bị loại bỏ có đo:** `chat_template_kwargs.enable_thinking=false` được tôn trọng ngay cả khi không có `--jinja` (0 ký tự suy luận, JSON bình thường); `true` chỉ trả `reasoning_content` và **không có `content`** trong 300/900/1.024/2.048 token — kể cả prompt trả lời ngắn không schema. Trên CPU dòng U, một lượt "suy nghĩ" không kết thúc trong ngân sách dùng được. Vì vậy **Deep không bật thinking**; Deep = **8 đoạn / 6.000 ký tự** (fast: 6 / 4.500) + trần **2.560** (phân tích) / **4.096** (sinh) (fast: 2.048 / 2.048). Nhãn UI đổi thành "Kỹ (nhiều ngữ cảnh hơn)".
- **Prompt phân tích:** 6 mục tiêu / 8 khái niệm, mô tả ≤ 25 từ, `sourceExcerpt` ≤ 20 từ; `LESSON_PROMPT_VERSIONS.analysis = 2` (analysis cache cũ bị bỏ, có chủ ý). Lượt sửa sau khi bị cắt có chỉ dẫn **viết ngắn hơn** — không có nó, lượt sửa lặp lại đúng chỗ bị cắt.
- **Kết quả fast (6 giáo án tổng hợp 1.300–1.800 ký tự):** phân tích **6/6 một lượt**, 741–1.339 token, 46–121 s (KHTN ở trần 1.024 cần 2 lượt/260 s; trần mới 2.048 tránh được). Sinh 8 câu arena: **6/6 một lượt, 1.124–1.354 token, 102–190 s, 8/8 mục, 0 lỗi chất lượng** (chỉ 1–3 cảnh báo; câu đúng/sai không còn bị cảnh báo 2 lựa chọn). Trước O6, prompt 10/12 mục cần 2.041 token và 1.024 bị cắt 2 lần; một bộ 4 câu từng bị `AI_TRUNCATED` ở 2.048.
- **Deep:** 2 giáo án ngắn 139–140 s, 8/8 — không chậm hơn fast nhưng **chưa chứng minh tốt hơn**; giáo án dài (>12.000 ký tự) chưa đo.
- **Batch (§5.4):** một lượt 8 câu **141 s / 1.488 prompt token** so với 8 lượt một câu **456 s / 13.897 token** (3,2× thời gian, 9,3× prompt) → **không ship batching**; "tạo lại từng mục" chỉ để sửa mục hỏng.
- **RAM:** chat server 2,1–3,2 GB cho một lượt, **4.022 MB** khi chạy 8 prompt dài liên tiếp; vẫn trong 16 GB, không cần GPU rời.
- **O7 (làm trong cùng đợt):** thanh tiến trình 5 giai đoạn **thật** ở bước 5 (`retrieve → generate → validate → repair → ready`), cập nhật tại chỗ theo `lesson:progress`, đánh dấu "không cần" khi không phải sửa; nút **Huỷ** khi đang tạo; huỷ trả `AI_CANCELLED` thành **thông báo** ("Đã huỷ…, chưa có thay đổi nào được lưu") thay vì lỗi; trạng thái được đặt lại khi bắt đầu/kết thúc cả tạo mới và tạo lại từng mục; khi **cache hit** thanh tiến trình thay bằng một dòng "dùng lại nội dung đã tạo" thay vì hiện 5 giai đoạn không hề chạy.
- **Sửa nhỏ:** `ONLY_TWO_OPTIONS` không còn áp cho câu **đúng/sai** (2 lựa chọn là đúng bản chất), có test.
- **Test:** `npm run check` sạch; `npm test` build + **25 suites** (thêm `lesson-prompts`: giới hạn 6/8, version 2, có/không chỉ dẫn ngắn hơn); `smoke67` **98/98** (+6 check O7), `smoke66 fixture` **34/34**, `smoke64` **39/39**, `smoke63` **49/49**, `smoke56` **56/56**, `smoke62` **9/9**, `smoke65 runtime/output` **18/18** mỗi chế độ; `npm run dist:win` → `release/EduGame-Studio-Setup-0.3.0.exe` (92,3 MB).
- **Chưa verify:** chưa chạy e2e thật **trong cửa sổ app** (máy tự đóng app sau 1–2 phút); số đo lấy qua HTTP với đúng prompt/schema/validator của app. 30 câu/giáo án > 12.000 ký tự và Deep trên giáo án dài chưa đo. Chất lượng sư phạm chưa đánh giá — "bám từ vựng" chỉ là proxy. Một lần chạy gặp hai llama-server cùng cổng (app Electron sót lại) làm server thoát không log; chạy lại với một server thì bình thường.

## Tối ưu quy trình AI — O5: cache phân tích/nội dung + tạo lại từng mục (2026-10-20)

Phase O5 của `docs/implementation-plan.md` §13.5, theo `docs/archive/specs/update-AI-local.txt` §4, §5.4–5.5 và §9. O4 đã giảm prompt; O5 cắt **số lượt Qwen**: không phân tích lại giáo án không đổi, không sinh lại nội dung giống hệt, và sửa một câu hỏng thì chỉ gọi model cho đúng câu đó.

- **`src/services/lesson-cache.ts` (mới):** khoá cache tất định = SHA-256 trên danh sách đầu vào có thứ tự, `stableJson` sắp khoá object.
  - phân tích: `prompt analysis v1` + SHA-256 văn bản giáo án + model chat + fast/deep + tên tài liệu;
  - nội dung: `prompt draft v1` + documentId + fingerprint nội dung phân tích (chủ đề, mục tiêu, khái niệm) + thể loại + fingerprint **toàn bộ** config + model + fast/deep.
  - `LESSON_PROMPT_VERSIONS` nằm trong `lesson-prompts.ts`; đổi prompt/schema phải tăng số, nếu không nội dung cũ sẽ bị dùng lại âm thầm. `uncertainties` **không** vào fingerprint vì không được gửi cho prompt generate — sửa nó không nên xoá nội dung đã sinh.
- **`lesson-store.ts`:** cột `lesson_analyses.cache_key` (migration `PRAGMA table_info` + `ALTER TABLE` idempotent, index tạo sau), `findAnalysisByCacheKey`; bảng `ai_generation_cache` (`put/get/delete/prune(50)/clear`). Payload JSON hỏng = cache miss + xoá dòng. `saveAnalysis(analysis, { cacheKey })` dùng `COALESCE` để bản giáo viên sửa **giữ nguyên khoá** — lần phân tích tự động sau đó trả lại đúng bản đã sửa. `main.ts` giờ vào schema qua `LessonStore.ensureSchema()` (trước đây chỉ `exec(LESSON_STORE_SCHEMA_SQL)` nên DB cũ không được migrate).
- **`lesson:analyze`:** khoá trùng thì trả analysis đã lưu (`cached: true`), **không gọi model**; chỉ nút "Phân tích lại" gửi `force: true`. Giáo án đổi → hash đổi → tự động phân tích mới.
- **`lesson:generate`:** khoá trùng thì dùng lại bản nháp; khi hit vẫn chạy lại `parseGameDraft` → adapter duy nhất → 4 validator cũ từ **draft đã lưu** (không tin snapshot cũ), rồi mới trả `cached: true`. "Tạo lại" gửi `regenerate: true` → bỏ cache. Ghi cache là best-effort, lỗi ghi không làm hỏng lần generate; giữ 50 dòng mới nhất.
- **Tạo lại từng mục (`lesson:regenerate-item`, §5.5):** `src/services/lesson-item-repair.ts` + `regenerateGameItem` + prompt riêng (chỉ mục lỗi + lý do từ báo cáo chất lượng + trích giáo án đã truy xuất). Vị trí **1-based** thống nhất với `QualityIssue.itemIndex`. Model viết nội dung, **app giữ danh tính/cấu trúc**: arena/race/matching giữ `id`; treasure giữ `nextStageId`/`branchStageId`/`branchLabel`/`attempts`; scenario giữ id tình huống, option id gán lại **theo vị trí** (đáp án đúng đi theo phương án) và nhánh chỉ nhận đích tồn tại — nên không thể mồ côi mục khác hay tạo vòng lặp dù model bịa id. Draft ghép xong được `parseGameDraft` + adapter + 4 validator cũ kiểm trên **toàn bộ** draft; lỗi thì không ghi đè dự án (`GENERATION_INVALID`).
- **UI:** danh sách "Từng mục" + nút "Tạo lại" dưới bảng chất lượng ở bước 5, mỗi lần một mục, cập nhật `wizardState.draft`. Đặt ở wizard chứ không trong editor (`DECISIONS #25`): editor sửa `EducationalGame` snapshot, còn tạo lại cần draft có kiểu + analysis + config.
- **Cấu hình:** `ai.embeddingBatchSize` (1–32, mặc định 8) thay hằng số `EMBEDDING_BATCH_SIZE`. **Không** thêm batching generation (§5.4) trong O5 — spec yêu cầu chọn bằng benchmark, để O6 đo thay vì mặc định "theo lô luôn nhanh hơn".
- **Test:** `tests/lesson-cache.test.ts` (khoá/fingerprint: đổi giáo án/model/mode/thể loại/config/mục tiêu đều đổi khoá; `uncertainties` không đổi khoá), `tests/lesson-item-repair.test.ts` (5 thể loại: giữ id, chuỗi treasure, nhánh + đáp án scenario, chặn cặp ghép trùng, chọn vị trí theo báo cáo chất lượng), mở rộng `lesson-workflow` (wrapper 1 phần tử, item trần, repair đúng 1 lần, sai cấu trúc → `AI_OUTPUT_INVALID`), `lesson-store` (cache key, upsert, payload hỏng, prune, migration ALTER); fixture mới `game_item_<type>.json`; `smoke66` +2 check, `smoke67` +3 check/thể loại (tất định + tạo lại từng mục).
- **Kết quả (máy này, fixture):** `npm run check` sạch; `npm test` build + **24 suites**; `smoke66 fixture` **34/34**; `smoke67` **92/92**; `smoke64` 39/39; `smoke63` 49/49; `smoke56` 56/56.
- **Chưa verify:** chưa đo thời gian tiết kiệm với model thật (O6; đường generate thật vẫn chưa qua `AI_TRUNCATED`); chưa có UI đổi `embeddingBatchSize` (đọc từ `settings.json`); cache khoá theo `documentId` nên hai tài liệu trùng nội dung vẫn phân tích riêng; batching generation chờ benchmark O6.

## Tối ưu quy trình AI — O4: truy xuất bằng embedding MiniLM thật (2026-10-20)

Phase O4 của `docs/implementation-plan.md` §13.5. O3 đã có seam `ChunkSelection.scorer` nhưng vẫn xếp hạng bằng trùng từ (`lexical-v1`) — giáo viên đặt mục tiêu bằng từ khác giáo án thì đoạn đúng có thể không được chọn. O4 thay bộ chấm điểm bằng **vector ngữ nghĩa thật**, vẫn **0 lượt Qwen** (embedding không sinh chữ).

- **`src/ai-core/embedding-catalog.ts`:** manifest duy nhất `minilm-multilingual-l12-v2-q8_0` — URL pinned theo commit, 132.438.304 byte, SHA-256 `1bcc1fd3…`, Apache-2.0, 384 chiều, ctx 512, pooling `mean`. Manifest giữ đúng shape `ModelManifestEntry` để **dùng lại `ModelInstaller`** (tải tiếp khi đứt, xác minh SHA-256) thay vì viết trình tải thứ hai.
- **`src/ai-core/embedding-manager.ts`:** `buildEmbeddingServerArguments` (thêm `--embedding --pooling mean --embd-normalize 2`, **không** có flag sampling) và `createEmbeddingRuntime` — một process llama-server **riêng**, dùng lại binary llama.cpp đã cài, gọi `POST /v1/embeddings`; vector trả về được kiểm đúng số chiều và giá trị hữu hạn. Process chat không bị đổi cờ/context.
- **`lesson-store.ts`:** `listChunkEmbeddings` / `saveChunkEmbeddings` / `clearChunkEmbeddings` trên các cột `embedding`/`embedding_model`/`embedding_dim` đã có từ O3. Vector lưu dạng `BLOB` Float32; đọc lên kiểm độ dài theo `embedding_dim`; vector của model khác bị bỏ qua (không trộn model). `replaceChunks` (chia lại đoạn) tự làm vector cũ mất hiệu lực vì dòng bị thay.
- **`lesson-retrieval.ts`:** tách phần chọn đoạn dùng chung (`buildSelection`) để hai bộ chấm điểm không lệch ngân sách/thứ tự/fallback; thêm `cosineSimilarity` và `selectChunksByVectors`. Vẫn trả đoạn **theo thứ tự tài liệu**, ngân sách 6 đoạn/4500 ký tự, `fallback` khi không so được.
- **`main.ts` `lesson:generate`:** embed đoạn giáo án **lười + cache** (chỉ embed đoạn còn thiếu, batch 8), embed câu truy vấn (~28 ms), chọn bằng cosine; **mọi lỗi** (chưa cài model, runtime lỗi, server chết) đều rơi về `lexical-v1` và generate tiếp — retrieval không được phép chặn giáo viên. `context.scorer` cho biết đã dùng bộ nào. `stopLocalAiRuntime` dừng cả process embedding khi thoát.
- **Cài đặt:** nút "Cài model" hiện có cài luôn bộ đọc hiểu (131 MB) sau model chat, cùng thanh tiến trình; nếu bước này lỗi thì chỉ mất chất lượng truy xuất, không làm hỏng cài model chat.
- **Đo (máy này, model thật):** bộ 16 câu tiếng Việt (10 câu trùng từ + 6 câu diễn đạt lại), cùng ngân sách: câu diễn đạt lại **embeddings 6/6 hạng 1 vs lexical 3/6** (lexical bỏ hẳn 2 đoạn đúng); câu trùng từ embeddings 8/10 vs lexical 10/10 nhưng cả 10 đoạn đích vẫn nằm trong ngân sách. ~41 ms/đoạn (batch 8, có lần đầu làm nóng), ~28 ms/câu truy vấn, server embedding **216 MB** đỉnh (chat 2.114 MB). Bảng đầy đủ + lệnh chạy lại: `docs/BENCHMARKS.md`.
- **Test:** `tests/embedding-catalog.test.ts` (manifest qua `validateManifest`, URL pinned, tên file khớp installer, cờ server, không có flag sampling, batch), mở rộng `lesson-retrieval.test.ts` (cosine, xếp hạng theo vector, hoà điểm giữ thứ tự tài liệu, đoạn thiếu vector, fallback, ngân sách) và `lesson-store.test.ts` (round-trip BLOB, scope theo model, validate-before-write, xoá, chia lại đoạn làm mất vector); `smoke66`/`smoke67` chấp nhận cả hai scorer và chạy thật qua IPC.
- **Kết quả (máy này):** `npm run check` sạch; `npm test` build + **22 suites**; `smoke66 fixture` **32/32**, `smoke67` **77/77**, `smoke64` **39/39**, `smoke65 runtime` 18/18 + `output` 18/18, `smoke56` 56/56, `smoke62` 9/9, `smoke63` 49/49. Trong smoke, `context` thật = `{"chunkCount":1,"selectedChunkCount":1,"characters":293,"scorer":"embeddings-v1","fallback":false}` → đường embedding chạy trong app, không chỉ trong test.
- **Chưa verify:** bộ thử 16 câu là tổng hợp, **không đủ kết luận trên giáo án thật** (O6 mới có bộ 6–8 giáo án dài); chưa đo mức giảm `AI_TRUNCATED`; chưa so với model embedding khác; chưa thử tải 132 MB từ đầu trên máy **chưa từng cài** model — mới kiểm được rằng `ModelInstaller` xác minh và bỏ qua file đã có đúng SHA-256 (chạy tay trên máy này), chưa chạy trọn đường tải kèm thanh tiến trình.

## Tối ưu quy trình AI — O3: chia nhỏ giáo án + truy xuất đoạn liên quan (2026-10-20)

Phase O3 của `docs/implementation-plan.md` §13.5. Trước O3, bước generate gửi cho Qwen `document.text.slice(0, 6000)` — 6000 ký tự **đầu tiên** của giáo án, bất kể giáo viên chọn thể loại nào hay mục tiêu nào. Giáo án dài thì phần liên quan có thể nằm ngoài 6000 ký tự đó; còn prompt vẫn dài, góp phần vào `AI_TRUNCATED` khi model sinh JSON.

- **`src/services/lesson-chunker.ts`:** `chunkLessonText(text, { maxChars = 900, minChars = 240 })` — chia theo đoạn (dòng trống) → câu → cắt cứng ở ranh giới từ nếu một câu quá dài. Không mất chữ, không chồng lấn, `charStart/charEnd` trỏ vào bản đã chuẩn hoá `\r\n → \n`. Dòng ngắn (≤80 ký tự, không kết thúc bằng dấu câu) được coi là **tiêu đề** và gắn vào các đoạn bên dưới. Hàm thuần, cùng input → cùng output.
- **`src/services/lesson-retrieval.ts`:** BM25-lite (`lexical-v1`) trên token tiếng Việt giữ dấu, bỏ hư từ; tiêu đề đoạn cũng được đánh chỉ mục. `buildRetrievalQuery` chỉ dùng **chủ đề (nhân 3) + mục tiêu trọng tâm + khái niệm** — mục tiêu giáo viên không chọn không được kéo đoạn lạ vào. `selectChunks` chọn theo điểm nhưng **trả về theo thứ tự tài liệu**, tôn trọng `maxChunks`/`maxChars`, và rơi về đầu tài liệu với cờ `fallback: true` nếu không đoạn nào khớp.
- **`lesson-store.ts`:** bảng thứ năm `lesson_chunks` (`document_id, chunk_index, text, heading, char_start, char_end, token_count` + cột `embedding`/`embedding_model`/`embedding_dim` để O4 điền sau, không phải đổi schema). `replaceChunks` idempotent (xoá rồi ghi trong transaction, validate trước khi ghi), `listChunks`/`countChunks`, xoá tài liệu thì xoá luôn đoạn.
- **`main.ts` `lesson:generate`:** chia đoạn **lười** (chỉ khi cần generate, cache lại), rồi `selectChunks` với ngân sách 6 đoạn / 4500 ký tự; `formatRetrievedChunks` gắn nhãn `[Đoạn N — tiêu đề]`. Trả thêm `context: { chunkCount, selectedChunkCount, characters, scorer, fallback }` (không đổi shape cũ). Nếu thiếu đoạn vì lý do nào đó thì vẫn dùng `slice(0, 6000)` như trước.
- **Renderer:** dòng "Đã dùng x/y đoạn giáo án liên quan" dưới bảng chất lượng — giáo viên biết model đã đọc phần nào.
- **Test:** `tests/lesson-chunker.test.ts` (rỗng, ngắn, nhiều đoạn, tiêu đề, ngân sách, câu khổng lồ, CRLF, tính lặp lại, không mất đoạn, offset khớp), `tests/lesson-retrieval.test.ts` (xếp hạng đúng chủ đề, thứ tự tài liệu, ngân sách, fallback, query theo mục tiêu trọng tâm, tính lặp lại), mở rộng `lesson-store.test.ts` (round-trip, idempotent, validate-before-write, xoá theo tài liệu); `smoke66` + `smoke67` kiểm `context` thật qua IPC.
- **Kết quả (máy này, không chạy model):** `npm run check` sạch; `npm test` build + **21 suites**; `smoke66 fixture` **32/32**, `smoke67` **77/77**, `smoke64` 39/39, `smoke65 runtime` 18/18 + `output` 18/18, `smoke56` 56/56, `smoke62` 9/9, `smoke63` 49/49. Với fixture hiện tại (giáo án ngắn) `context` = 1/1 đoạn, ~293 ký tự — tức prompt ngắn hơn hẳn mức 6000 ký tự cũ.
- **Chưa verify:** chưa đo trên **giáo án dài thật** rằng đoạn được chọn đúng phần giáo viên cần (bộ 6–8 giáo án + benchmark thuộc O6); chưa đo mức giảm `AI_TRUNCATED` (cần model thật); ngưỡng 900/4500/6 là kinh nghiệm, chưa hiệu chỉnh.

## Tối ưu quy trình AI — O2: kiểm tra chất lượng nội dung bằng TypeScript (2026-10-20)

Phase O2 của `docs/implementation-plan.md` §13.5. Bản nháp do model sinh ra trước đây chỉ được kiểm **cấu trúc** (zod + adapter + 4 validator cũ). Những lỗi làm trò chơi chấm sai mà cấu trúc không bắt được — hai câu hỏi trùng nhau, hai lựa chọn trùng nhau, tình huống không có phương án tốt nhất, chuỗi chặng trỏ vào chặng không tồn tại — vẫn tới tay giáo viên. O2 thêm một lớp kiểm tra **thuần TypeScript**, không gọi model.

- **`src/services/lesson-quality.ts`:** `checkDraftQuality({ draft, config, analysis })` chạy theo từng thể loại rồi kiểm tra chung:
  - chung: `NO_ITEMS`, `COUNT_BELOW_REQUEST` (ít hơn cấu hình), `DUPLICATE_PROMPT` (trùng khít sau chuẩn hoá), `NEAR_DUPLICATE_PROMPT` (Jaccard ≥ 0.85), `OBJECTIVE_UNCOVERED` (mục tiêu trọng tâm không xuất hiện trong nội dung);
  - arena: lựa chọn trùng, `<2` lựa chọn, chỉ 2 lựa chọn, phương án chung chung ("Tất cả đều đúng"…), thiếu/không khớp đáp án đúng, đáp án tự luận trống, thiếu giải thích, 0 điểm;
  - scenario: `<2` phương án, không xác định được phương án tốt nhất (thiếu điểm hoặc hoà điểm), mọi phương án cùng điểm, thiếu phản hồi/hậu quả, `nextSituationId` trỏ sai;
  - matching: bên trống, trùng vế trái/phải;
  - treasure: trùng mã chặng, chặng không có câu hỏi, `nextStageId`/`branchStageId` trỏ sai, vòng lặp chuỗi, chặng không tới được, 0 lượt thử;
  - race: `<2` đội, lệch số đội so với cấu hình, ô đặc biệt ngoài đường đua, ô trùng số.
  - Trả `{ gameType, issues, errors, warnings, canPublish, counts, uncoveredObjectiveIds }`, hàm **đồng bộ**, cùng input → cùng output.
- **`main.ts`:** `lesson:generate` trả thêm `quality` (tính ngay sau khi lưu draft, không tốn thêm lượt Qwen); thêm IPC `lesson:quality` để tính lại khi **mở lại draft** mà không cần model.
- **Renderer:** `step-generate` hiện bảng "Kiểm tra chất lượng nội dung" (số lỗi/cảnh báo + tối đa 6 dòng mỗi loại) trước khi giáo viên mở editor; `state.ts` giữ `quality` và nạp lại khi `wizardOpenProject`.
- **Quyết định:** đây là **tư vấn**, không chặn mở editor hay lưu (`DECISIONS #21`) — cấu trúc hỏng đã bị adapter + validator cũ chặn, còn giáo viên phải luôn sửa tay được.
- **Test:** `tests/lesson-quality.test.ts` (5 thể loại sạch, từng mã lỗi/cảnh báo, ngưỡng trùng, bao phủ mục tiêu, tính lặp lại, JSON-serialisable); `smoke66 fixture` + `smoke67` kiểm báo cáo thật qua IPC; `smoke67` thêm 3 check/thể loại.
- **Kết quả (máy này, không chạy model):** `npm run check` sạch; `npm test` build + **19 suites**; `smoke66 fixture` **29/29**, `smoke67` **67/67**, `smoke64` **39/39**, `smoke65 runtime` 18/18 + `output` 18/18, `smoke56` 56/56, `smoke62` 9/9, `smoke63` 49/49. Cả 5 fixture happy cho **0 lỗi / 0 cảnh báo**.
- **Chưa verify:** bảng chất lượng chưa được thử với bản nháp model thật (generate thật vẫn chưa qua được `AI_TRUNCATED` trên Qwen3.5-2B); ngưỡng 0.85 và cách dò mục tiêu theo từ khoá là kinh nghiệm, chưa hiệu chỉnh trên giáo án thật.

## Tối ưu quy trình AI — O1: chọn thể loại bằng TypeScript, bỏ 1 lượt Qwen (2026-10-20)

Phase O1 của `docs/implementation-plan.md` §13.5. Bước "Gợi ý trò chơi" trước đây tốn **một lượt Qwen (~67 s đo trên Qwen3.5-2B)** chỉ để chọn 1 trong 5 thể loại mà app đã biết — việc này xác định được, nên chuyển hẳn sang TypeScript.

- **`src/services/game-type-rules.ts`:** bảng năng lực 5 thể loại (dạng nội dung hợp, mức nhận thức, thời lượng/số mục mặc định, câu giải thích tiếng Việt). Là nguồn duy nhất mà recommender dùng để chấm điểm.
- **`src/services/game-recommender.ts`:** `analyzeLessonSignals` (đếm mục tiêu theo mức nhận thức + dò từ khoá tiếng Việt: tình huống/quyết định, quy trình/các bước, định nghĩa/thuật ngữ, thi đua/đội) → `scoreGameTypes` (điểm cố định, sắp xếp có tie-break) → `recommendGamesForAnalysis` trả **2–3** `GameRecommendation` đúng `gameRecommendationSchema` (title ≤160, description ≤500, reason ≤800, số mục 3–30, thời lượng 3–60). Hàm **đồng bộ**, không Promise, không client → không thể gọi model.
- **`main.ts` `lesson:recommend`:** bỏ `createLessonChatClient()`/`recommendGames`/`requestId`; chỉ đọc analysis từ store rồi gọi recommender. Response `{ recommendations, project }` giữ nguyên nên preload/renderer/store không phải sửa.
- **Renderer:** bỏ `wizardAiReadinessHint()` khỏi bước 3 và toàn bộ chữ "AI local đang gợi ý…" (bước này không cần model, không được bắt giáo viên bật AI); thêm hàng **"Hoặc chọn thể loại khác"** cho các thể loại không được gợi ý (`data-wizard-action="select-type"`, dùng `wizardDefaultConfig` sẵn có) — đúng yêu cầu "giáo viên vẫn được tự chọn thể loại khác"; nút Tiếp tục giờ dựa trên `selectedGameType` thay vì `selectedRecommendationId`.
- **Test:** `tests/game-recommender.test.ts` (định tuyến 5 thể loại theo nội dung, hợp đồng zod, id duy nhất/theo analysis, tính lặp lại, không trả Promise, analysis rỗng không ném lỗi). `smoke64` chuyển sang chọn thẻ đầu tiên và suy ra field số lượng theo thể loại (arena/matching/scenario/treasure/race) thay vì hard-code arena; `smoke65 output` viết lại để kiểm lỗi AI ở **bước generate** (`AI_OUTPUT_INVALID`, không lộ mã, không lưu game dở, giữ chỉnh sửa khi quay lại) vì bước chọn thể loại không còn gọi model.
- **Fixture:** xoá `happy/game_recommendations.json` và `fail-output/game_recommendations.json` (không còn ai đọc); thêm 5 `fail-output/game_draft_<type>.json` + `NOTES.md` cho cả hai bộ, và sửa `fail-runtime/NOTES.md`.
- **Kết quả (đo trên máy này, không chạy model):** `smoke64` 39/39, `smoke66 fixture` 26/26, `smoke67` 52/52, `smoke65 runtime` 18/18 + `output` 18/18, `smoke56` 56/56, `smoke62` 9/9, `smoke63` 49/49; `npm run check` sạch; `npm test` build + 18 suites. **Số lượt Qwen cho một trò chơi: 3 → 2** (còn analyze + generate).
- **Chưa verify:** chưa đo lại thời gian click→preview trên model thật (benchmark thuộc O6); "phù hợp sư phạm" của gợi ý do quy tắc sinh ra mới được kiểm bằng ví dụ trong unit test, chưa có khảo sát giáo viên.

## Tối ưu quy trình AI — O0: kế hoạch chờ duyệt (2026-10-20)

Chủ dự án bổ sung spec `docs/archive/specs/update-AI-local.txt`: giảm số lượt gọi Qwen, **không** gọi AI khi chọn thể loại/cấu hình, phân tích một lần + cache, dùng MiniLM lập chỉ mục/truy xuất thay vì gửi toàn bộ giáo án, chuyển việc xác định sang TypeScript, tạo lại từng câu, và benchmark trước/sau trên máy 16 GB / CPU dòng U. Đã làm **O0**: audit hiện trạng + luồng đích + module/bảng/phase O1–O7 + rủi ro + kế hoạch đo, ghi ở `docs/implementation-plan.md` §13 và `docs/ROADMAP.md`. **Chưa sửa một dòng code nào** cho workstream này — chờ chủ dự án duyệt (4 câu hỏi ở §13.8). Trong lúc đó, P6 được chốt theo `DECISIONS #19` (wiring verify bằng fixture; **sinh nội dung với model thật chưa verify**).

## AI-assisted Lesson-to-Game — P6: sinh nội dung 5 thể loại + editor (2026-10-19)

Bước P6 của `docs/implementation-plan.md`: nối bước 5 `generate` với model local thật, kiểm tra dữ liệu 2 lớp, chuyển đổi bằng adapter duy nhất, mở editor để giáo viên duyệt/sửa rồi lưu thư viện. **Không đổi** `EducationalGame`, `.egame`, gameplay, `game-editor.ts`.

- **`lesson:generate` (`src/main.ts`):** nhận `{ projectId, gameType, config, generationMode, requestId }`, đọc project + analysis đã lưu, gọi `generateGameDraft` qua client **chỉ local** (từ chối `AI_NOT_RUNNING` nếu runtime chưa READY, không rơi về cloud), rồi `toEducationalGame` (adapter duy nhất) và chạy lại 4 validator cũ trước khi trả `{ project, game }`. Dùng `createLessonChatClient` (timeout 300 s) và `buildGenerationOptions('local', maxTokens)` (`enable_thinking: false` cho Fast).
- **`applyDraft` (`src/services/lesson-projects.ts`):** gắn `draft` + `gameSnapshot` vào project, đưa `step` → `edit` và `status` → `ready` (dùng `advanceStep` nên không bao giờ lùi bước). `gameSnapshot` chính là thứ mở lại editor **không cần AI**.
- **Renderer (`src/renderer/features/wizard/step-generate.ts`):** nút tạo nội dung (đã bật), chọn Fast/Deep, hiển thị tiến trình, mở `openEditor` để giáo viên xem/sửa từng thể loại, lưu vào thư viện → chơi offline. Thêm hành động dispatch `generate`/`regenerate`/`open-editor`/`go-library`; `wizardStepIndex` coi `edit|done` là bước cuối nên mở lại draft hiện đúng bước; `GENERATION_INVALID` có câu tiếng Việt thân thiện (thử lại / giảm số lượng).
- **Lỗi và mã:** lỗi transport giữ nguyên (`AI_NOT_RUNNING`, `AI_TIMEOUT`, `AI_CANCELLED`, `AI_INVALID_JSON`, `AI_TRUNCATED`…); lỗi lớp 2 (game sau adapter không qua validator cũ) trả `GENERATION_INVALID`. Không bao giờ lưu game sai một phần.
- **Test:** `tests/smoke/smoke66.js` (real + fixture, polling theo pha, nhận dạng theo thể loại do model đề xuất), `tests/smoke/smoke67.js` (cả 5 thể loại: generate → adapt → editor panel → lưu thư viện → mở lại → dọn dẹp), `tests/manual/install-local-model.js` (chạy chính trình cài của app qua CDP), fixture `tests/fixtures/wizard/happy/game_draft_{arena,scenario,matching,treasure,race}.json`, và ca `applyDraft` trong `tests/lesson-projects.test.ts`. `smoke64` T8 đổi từ "nút generate là placeholder P6" thành "nút generate đã bật".
- **Verified (fixture/thật, trên build P6):** `npm run check` sạch; `npm test` build + **17 suites** pass; `smoke67` **52/52**; `smoke66 fixture` **26/26**; `smoke64` **37/37**; `smoke65 runtime` **18/18** + `smoke65 output` **14/14**. Offline kiểm tra riêng: cả 5 fixture qua zod + adapter + validator cũ (`quiz/scenario/matching/treasure-hunt/race`). Model thật trên máy: runtime `llama.cpp b11681` + **Qwen3.5-2B Q4_0** cài dưới `userData/ai-local/`, SHA-256 khớp; `ai:start-local-runtime` → `READY`; đo trực tiếp 179 token / 16 s (~11,1 tok/s), và request analyze y hệt trong app = HTTP 200, 56 s, 413 token, JSON hợp lệ.
- **Chưa verify / còn lại (quan trọng):**
  1. **E2E model thật chưa đạt đủ.** Trong app thật đã chạy được **analyze** (lưu analysis, chủ đề "Quang hợp") và **recommend** (2 gợi ý: `matching`, `scenario`), project lưu ở bước `generate`. Bước **generate** dừng ở `[AI_TRUNCATED]` ("AI hết giới hạn token trước khi hoàn tất") với Qwen3.5-2B ở `maxTokens` Fast = 2048 — lỗi có mã rõ ràng và được xử lý đúng (giáo viên thấy thông báo thử lại/giảm số lượng), nhưng **chuỗi real đầy đủ chưa hoàn tất**.
  2. **Hạn chế môi trường:** cửa sổ Electron trên máy này bị **đóng từ bên ngoài sau ~1–2 phút kể cả khi rảnh** (đo được: 4 tiến trình lúc 20 s → 0 lúc 120 s; log `main window closed` → `window-all-closed` → `before-quit` trong khi **không có** dòng mã nào của app gọi `window.close()`/`app.quit()` ngoài 2 handler chuẩn). Vì một lượt analyze thật mất ~7,5 phút, e2e thật cần app sống lâu hơn mức môi trường cho phép.
  3. Chưa chạy lại `smoke56`/`smoke62`/`smoke63` trên đúng build P6 (đã pass ở P5, không đụng trang tạo trò chơi/editor/gameplay).
  4. Còn rác dev-userData từ các lượt chạy lỗi (`lesson_documents`/`lesson_analyses`/`game_recommendations`/`game_projects` cho `smoke66-quang-hop.txt`, `smoke67.txt`) — **chưa có IPC xoá tài liệu** nên chưa dọn được (giới hạn đã biết).
  5. Bước này **không** giải quyết số lần gọi Qwen (hiện analyze rồi recommend rồi generate là 3 lượt); việc đó thuộc spec tối ưu mới trong `docs/archive/specs/update-AI-local.txt` (kế hoạch ở mục "Tối ưu" của `docs/implementation-plan.md`).

## AI-assisted Lesson-to-Game — P5: wizard bước 1–4 + trang "Tạo trò chơi" chỉ thủ công (2026-10-19)

Bước P5 của `docs/implementation-plan.md`: dựng khung wizard cho 4 bước đầu (nhập → phân tích → chọn thể loại → cấu hình) và **tách hẳn AI khỏi trang "Tạo trò chơi"** theo yêu cầu chủ dự án ("chỉ tạo trò chơi thủ công; dùng AI nằm bên Tạo từ giáo án"). Không đổi `EducationalGame`, `.egame`, gameplay.

- **Trang wizard mới (lối vào mặc định cho luồng AI):** `src/renderer/pages/create-wizard.ts` (khung + router bước + stepper + vùng trạng thái/lỗi + sidebar "Dự án đang làm") và `src/renderer/features/wizard/{state,step-input,step-analysis,step-recommend,step-configure,step-generate}.ts`. State riêng trong `features/wizard/state.ts` (`wizardState`), **không** thêm vào `state` toàn cục (chỉ đăng ký `state.page`). Bước 5 `generate` hiện là **placeholder trung thực** ("Sắp có · P6"), nút tạo nội dung bị `disabled` — không giả vờ AI đã chạy.
- **Nối vào shell:** `pageNames`/`renderers` thêm `create-wizard`; `wirePage()` gọi `wireCreateWizard()`; `index.html` thêm mục nav "Tạo từ giáo án" (đứng trước "Tạo trò chơi") + các `<script>` wizard. CTA ở Trang chủ và Giáo án nay trỏ về wizard; "Tạo trò chơi" giữ làm lối vào phụ (`title="Tôi đã biết muốn tạo trò chơi nào"`).
- **Trang "Tạo trò chơi" chỉ thủ công:** `src/renderer/pages/create.ts` viết lại — bỏ 4 chip nguồn nội dung (thủ công/AI/nhập giáo án/kết hợp), vùng dán tài liệu, 2 nút tổng hợp AI, select "chế độ tạo trò chơi" và 2 panel AI (local/cloud) + panel chat `renderDocumentAssistResults`. Còn: B (chọn 5 thể loại) · C (hướng dẫn soạn thủ công + nút sang wizard) · D (thiết lập luật chơi) · E (mở trình chỉnh sửa). `features/game-generation.ts` nay chỉ gọi `createBlankGame()` (mở editor trống theo thể loại). Bỏ các handler chết trong `controller.ts` (`[data-source]`, `#generationMode`, `#analyzeLocal/CloudDocumentBtn`, `#sourceText`, `#documentQuestion`, `#documentAssistResults`, `#useSuggestedQuestionsBtn`, `#regenerateSuggestedQuestionsBtn`, `[data-recommended-template]`). `ai:generate-game` đã không còn; `ai:document-assist` **đã xoá ở P7 (2026-10-20)**.
- **Xoá/lưu ý test:** `tests/smoke60.js` (AI/cloud trên trang tạo trò chơi) chuyển sang `tests/legacy/smoke60.js` kèm ghi chú **RETIRED** (không chạy với build hiện tại).
- **Bền hoá chỉnh sửa của giáo viên (không cần AI):** thêm IPC `lesson:save-analysis` → `store.saveAnalysis` (validate bằng `parseLessonAnalysis`) + bridge `saveLessonAnalysis`, để sửa analysis ở bước 2 rồi mở lại draft vẫn còn chỉnh sửa.
- **Sửa lỗi phát hiện khi chạy thật:** (1) `game_recommendations.id` là **khoá chính toàn cục** nhưng `normalizeRecommendations` sinh `rec1/rec2…` theo chỉ số → chạy `lesson:recommend` cho giáo án thứ hai bị `UNIQUE constraint failed`; nay `lesson:recommend` truyền `idPrefix: rec_<analysisId>_` (duy nhất theo analysis, chạy lại cùng analysis thì thay thế). (2) `wizardClamp` coi `min="0"` là falsy → `NaN` cho các trường min 0 (`timeBonus`, `wrongPenalty`, `journeyBonus`…); nay chuẩn hoá min/max. (3) Nút "Dự án mới" ở header nằm ngoài `#wizardRoot` nên không nhận uỷ nhiệm sự kiện; nay `#wizardRoot` bọc cả trang. (4) Ô nhập giáo án không đồng bộ state nên nút "Tiếp tục" kẹt `disabled`; nay có listener `input` cập nhật nhẹ (không re-render, giữ con trỏ).
- **Mã lỗi qua IPC:** `LessonWorkflowError` nay nhúng `[CODE]` vào `message` (Electron chỉ serialize `message`), renderer tách lại để chỉ hiện câu tiếng Việt thân thiện và chỉ gợi ý "Mở AI local" với các mã do runtime (`AI_NOT_RUNNING/AI_CONFIG/AI_CONNECTION/AI_TIMEOUT`), còn lỗi nội dung (vd `AI_OUTPUT_INVALID`) chỉ gợi ý thử lại.
- **Seam kiểm thử AI (chỉ khi dev, không thể dùng trong bản đóng gói):** `main.ts` thêm `loadLessonTestFixture` đọc `EDUGAME_AI_TEST_DIR` khi `!app.isPackaged`; fixture đặt tên theo `responseSchema.name` (`lesson_analysis.json`, `game_recommendations.json`), có thể là `{ "__testDouble": { code, message } }` để buộc lỗi. Bản `dist:win` (`app.isPackaged === true`) **luôn bỏ qua**, nên không thể "giả AI chạy" khi chưa có model thật. Fixture ở `tests/fixtures/wizard/{happy,fail-output,fail-runtime}`.
- **Verification:** `npm run check` pass; `npm test` pass (build + **17 suites**); app thật CDP: `smoke64` **37/37** (nav + 5 bước, tài liệu ngắn chặn nút, lưu giáo án + project, phân tích từ fixture → 3 mục tiêu, sửa topic lưu được không cần AI, 3 gợi ý id duy nhất, chọn arena → config hợp lệ qua zod của main, lưu ở bước `generate`/`review`, mở lại draft đủ dữ liệu, sidebar, dọn dẹp, 0 lỗi renderer); `smoke65 runtime` **18/18** (không model → `AI_NOT_RUNNING`, có "Mở AI local", retry, quay lại giữ nội dung, huỷ banner, draft vẫn ở bước analyze, mở lại không hiện lỗi cũ); `smoke65 output` **14/14** (`AI_OUTPUT_INVALID`, không lộ mã thô, không gợi ý mở AI local, giữ chỉnh sửa khi back + retry, draft vẫn ở `recommend`); regression `smoke56` **56/56** (thủ công → editor treasure/race trống), `smoke62` **9/9**, `smoke63` **49/49**.
- **Chưa verify / còn lại:** happy path với **model thật** vẫn chưa chạy (máy chưa cài llama.cpp/Qwen — P6), nên `smoke64`/`smoke65 output` dùng fixture và ghi rõ ở đầu tệp; bước 5 `generate` mới là placeholder; `smoke57/58/59/61` chưa chạy lại trong phiên này (không đụng tới trang tạo trò chơi — smoke61 trước đó chỉ fail vì app đã bị dừng, không phải lỗi sản phẩm); `document-assist`/`ai:generate-game` phía main còn là code chết chờ dọn; `smoke60` legacy không còn chạy.

## AI-assisted Lesson-to-Game — P4: analyze + recommend (2026-10-19)

Bước P4: nối `lesson-workflow` vào app thật bằng IPC, **chỉ dùng AI local** (không rơi về cloud), và lưu tiến độ draft. Không đổi `EducationalGame`, `.egame`, gameplay hay các kênh `ai:*` cũ.

- **`src/services/lesson-projects.ts` (mới):** helper thuần dựng `GameProject` từ kết quả từng bước — `WORKFLOW_STEP_ORDER` + `advanceStep` (không bao giờ lùi bước khi giáo viên chạy lại bước trước), `createProjectFromAnalysis` (project mới ở bước `recommend`, tiêu đề lấy từ `analysis.topic` hoặc tên tệp), `applyAnalysis` (gắn tài liệu + `analysisId` vào project đang có, giữ tiêu đề giáo viên đặt), `advanceAfterRecommendations` (status `draft`→`review`, bước → `configure`, không hạ cấp project đã `ready`/đi xa hơn). Tách khỏi `main.ts` để test được và để P5 sửa máy trạng thái ở một chỗ.
- **`src/main.ts`:** `createLessonChatClient()` — client `LessonChatClient` **chỉ local**: từ chối ngay bằng `AiTransportError('AI_NOT_RUNNING')` khi runtime chưa `READY`, tái dùng `ensureLocalRuntime` + `fetchAiEndpoint` (cùng runtime llama.cpp), chuyển tiếp `signal` để `ai:cancel` dừng được request, thời gian chờ 300s. Thêm IPC `lesson:analyze` (`{ documentId, projectId?, analysisId?, mode?, requestId }` → `{ analysis, project }`), `lesson:recommend` (`{ analysisId, projectId?, requestId }` → `{ recommendations, project }`), `lesson:get-analysis`, `lesson:recommendations` (để mở lại draft không cần gọi AI). Giữ nguyên mọi kênh cũ.
- **`src/services/lesson-workflow.ts`:** `recommendGames` kiểm tra chéo — mọi `learningObjectiveIds` của đề xuất phải tồn tại trong `analysis.objectives`; id lạ bị coi là output sai (kích hoạt sửa lỗi 1 lần rồi báo `AI_OUTPUT_INVALID`) thay vì liên kết mục tiêu hỏng âm thầm. Thêm `validateRecommendationsAgainstAnalysis` xuất ra để test.
- **`src/preload.ts` + `src/shared/types.ts`:** thêm `analyzeLesson`, `recommendGames`, `getLessonAnalysis`, `getLessonRecommendations` vào `window.eduGame`/`EduGameBridge` (dùng type-only `LessonAnalysis`/`GameRecommendation`).
- **Test mới/sửa:** `tests/lesson-projects.test.ts` (thứ tự bước, không lùi bước, dựng/áp analysis/lên `configure`, giữ tiêu đề, không hạ cấp `ready`); `tests/lesson-workflow.test.ts` thêm ca đề xuất trỏ mục tiêu không tồn tại (+ sửa lỗi 1 lần), helper kiểm tra chéo, và `cognitiveLevel` sai bị sửa rồi pass; `tests/lesson-store.test.ts` thêm ca project do helper P4 dựng phải qua được kiểm tra khi lưu, và `.egame` round-trip nay dùng snapshot **trước khi xoá** (sửa một test yếu của P2).
- **Verification:** `npm run check` pass; `npm test` pass (build + **17 suites**); app thật (CDP 9333): có đủ 4 hàm mới, thiếu tài liệu → "Không tìm thấy giáo án đã lưu", chưa bật model → `AI local chưa chạy` (mã `AI_NOT_RUNNING`), gọi lại **cùng `requestId`** vẫn ra lỗi model (chứng tỏ registry đã giải phóng, không rò rỉ), thiếu analysis → "Không tìm thấy kết quả phân tích", `getLessonAnalysis('lạ')` → `null`, `getLessonRecommendations('lạ')` → `[]`, `cancelAi` sau khi xong → `{ok:false}` — **8/8**; regression `smoke62` **9/9**, `smoke63` **49/49**.
- **Chưa verify / còn lại:** happy-path `lesson:analyze`/`lesson:recommend` **với model thật chưa chạy** (máy chưa cài llama.cpp/Qwen — để P6); chưa có UI dùng các IPC này (P5); `lesson:analyze` trả `{ analysis, project }` và `lesson:recommend` trả `{ recommendations, project }` — khác bảng §6 của plan (ghi `GameRecommendation[]`) để tiện lưu tiến độ; `lesson:generate` (P6) chưa có IPC; `ai:cancel` vẫn chưa huỷ nhánh OpenCode Zen.

## AI-assisted Lesson-to-Game — P1: contracts + adapter (2026-10-19)

Bước P1 của `docs/implementation-plan.md`: dựng contract dữ liệu và một adapter duy nhất giữa "draft giáo án" và `EducationalGame`, **chưa nối UI/AI** (P3–P5 sẽ làm). Không đổi `EducationalGame`, `.egame`, gameplay hay IPC hiện có.

- **`src/shared/lesson-types.ts` (mới):** union `arena | scenario | matching | treasure | race`; `LessonDocument`/`LessonAnalysis`/`GameRecommendation` (kèm biến thể "content" do model trả về, chưa có id); config riêng theo thể loại (`ArenaConfig`…`RaceConfig`, chỉ chứa thiết lập có nghĩa cho thể loại đó); draft theo thể loại (`ArenaDraft`…`RaceDraft`); `GameProject` (status/step, `config`, `draft`, `gameSnapshot`, `gameId`, `gameSetup` để giữ nguyên setup game cũ). `LESSON_SCHEMA_VERSION = 1`.
- **`src/services/lesson-contracts.ts` (mới):** zod cho `lessonAnalysisContent`, `recommendationsContent` (1–3 đề xuất, không trùng thể loại), 5 draft (kiểm tra ID trùng, đáp án đúng nằm trong options, nhánh tình huống/chặng tồn tại + có ít nhất một chặng kết thúc, ô đường đua trong khoảng và không trùng), và `gameConfig` theo thể loại. `parse*` ném `LessonContractError(code, message, issues)` với thông báo tiếng Việt kèm đường dẫn lỗi. JSON schema cho `response_format` của llama.cpp lấy bằng `z.toJSONSchema` (trả `null` nếu môi trường không hỗ trợ, không làm sập import).
- **`src/services/game-project-adapter.ts` (mới):** bề mặt duy nhất đổi draft ⇄ game. `toEducationalGame(project)` kiểm tra `schemaVersion`/loại, validate draft+config rồi mới dựng game (`arena→quiz`, `treasure→treasure-hunt`), tự nối chuỗi chặng treasure khi `nextStageId` bị bỏ trống, và **chạy lại 4 validator cũ** (`validateScenarioGame`/`Matching`/`TreasureHunt`/`Race`) trước khi trả. `fromEducationalGame(game)` mở game đã lưu thành draft (giữ `gameSetup`, tags, mô tả), lỗi rõ ràng (`ADAPTER_LEGACY_DATA_UNSUPPORTED` khi dữ liệu cũ không biểu diễn được, `PROJECT_VERSION_UNSUPPORTED` khi version lạ).
- **Không đổi:** `EducationalGame`, `GameQuestion`, `.egame`, `gameplay.ts`, `game-editor.ts` và mọi IPC hiện có; adapter chỉ là module mới.
- **Verification:** `npm run check` pass; `npm test` pass (build + **13 suites**, thêm 2 suite mới). `tests/lesson-contracts.test.ts`: parse 5 draft/config hợp lệ + các ca sai (ID trùng, đáp án ngoài options, nhánh treo, chặng không kết thúc, ô ngoài đường đua, sai `schemaVersion`, sai thể loại, đề xuất trùng thể loại/rỗng). `tests/game-project-adapter.test.ts`: 5 thể loại draft→game (đúng template, giữ dữ liệu, validator cũ pass), lỗi adapter theo mã, vòng lặp game cũ→project→game (giữ `matchingGame`/`race`/câu trả lời), và `.egame` JSON round-trip không đổi.
- **Chưa verify / còn lại:** chưa có UI, chưa gọi AI, chưa lưu DB — P2 (storage) và P3–P6 mới nối; JSON schema cho `response_format` chưa thử với llama.cpp thật (P6).

## AI-assisted Lesson-to-Game — P3: AI transport + workflow (2026-10-19)

Bước P3: tách tầng gọi AI thành module thuần, có thể test bằng mock, và dựng sẵn luồng analyze/recommend/generate. **Không đổi hành vi các kênh `ai:*` cũ.**

- **`src/services/ai-transport.ts` (mới):** rút logic dùng chung khỏi `main.ts` — `buildChatRequestBody`, `readAssistantContent`, `parseModelJson`, `cleanModelJson`, `createRequestSignal` (timeout + `AbortSignal.any`), `AiRequestRegistry` (map `requestId` → `AbortController`), `requestChatJson` (một vòng HTTP qua `send` được inject). Thêm `AiTransportError` với mã rõ ràng: `AI_CONFIG`, `AI_NOT_RUNNING`, `AI_CONNECTION`, `AI_TIMEOUT`, `AI_CANCELLED`, `AI_HTTP`, `AI_EMPTY`, `AI_TRUNCATED`, `AI_INVALID_JSON`.
- **`src/services/lesson-prompts.ts` (mới):** prompt cho analyze/recommend/generate theo 5 thể loại + prompt sửa lỗi (repair). Cắt tài liệu theo `getLocalDocumentAnalysisExcerpt` và ghi chú khi bị rút gọn.
- **`src/services/lesson-normalize.ts` (mới):** điền `schemaVersion` + id còn thiếu (câu, phương án a/b/c, cặp ghép, chặng, đội) rồi validate bằng zod. Không tự bịa đáp án/điểm.
- **`src/services/lesson-workflow.ts` (mới):** `runStructuredStep` là chính sách chung (đăng ký `requestId`, gọi model, validate, **sửa lỗi 1 lần** khi JSON hỏng/sai cấu trúc, dịch lỗi thành `LessonWorkflowError`). Trên đó là `analyzeLesson`, `recommendGames`, `generateGameDraft`.
- **`src/main.ts`:** `requestJsonFromCompatibleApi` giờ gọi `requestChatJson` (giữ nguyên prompt, body, timeout 300s/90s và **mọi thông báo lỗi tiếng Việt**); `fetchAiEndpoint` trả `AiTransportError` và **không khởi động lại runtime khi bị giáo viên huỷ**; thêm IPC `ai:cancel`; `aiRequests.cancelAll()` khi thoát app.
- **`src/preload.ts` + `src/shared/types.ts`:** thêm `cancelAi(requestId)` vào `window.eduGame`.
- **Test mới:** `tests/ai-transport.test.ts` (parse/fence, body local/online, registry, timeout, cancel, HTTP, JSON hỏng, mất kết nối) và `tests/lesson-workflow.test.ts` (analyze/recommend/generate happy path, sửa lỗi 1 lần rồi bỏ cuộc, timeout không retry, cancel, model chưa chạy, `requestId` trùng).
- **Verification:** `npm run check` pass; `npm test` pass (build + **16 suites**); app thật (CDP 9333): `ai:generate` offline vẫn tạo game, `ai:document-assist` trả đúng lỗi cấu hình, `ai:cancel` có mặt và trả `{ok:false}` cho id lạ — **5/5**; regression `smoke62` **9/9**, `smoke63` **49/49**.
- **Chưa verify / còn lại:** chưa có IPC `lesson:analyze`/`lesson:recommend`/`lesson:generate` (P4) nên `lesson-workflow` mới chỉ được test bằng mock, **chưa chạy với model thật**; `ai:cancel` chưa huỷ được nhánh OpenCode Zen (chỉ local); retry/repair chưa đo với model thật nhỏ.

## AI-assisted Lesson-to-Game — P2: storage + draft (2026-10-19)

Bước P2: kho lưu trữ **additive** cho workflow giáo án → trò chơi. Không đụng `games`/`sessions`/`saveDb`/`.egame`/gameplay.

- **`src/services/lesson-store.ts` (mới):** 4 bảng sidecar + index (`LESSON_STORE_SCHEMA_SQL`), CRUD prepared statements, mỗi lần ghi là upsert trong transaction (không xoá toàn bảng như `saveDb`). Tài liệu giáo án ghi ra `userData/lessons/<id>.txt` (DB chỉ giữ `text_rel_path` + metadata + sha256); đọc lại có kiểm tra tệp. `deleteDocument` xoá cascade analysis/recommendation (bằng transaction thủ công, không phụ thuộc FK), project giữ snapshot độc lập.
- **Kiểm tra trước khi lưu:** draft/config chạy lại `lesson-contracts` (zod), snapshot chạy lại 4 validator cũ. Lỗi rõ mã: `PROJECT_VERSION_UNSUPPORTED` (version > 1), `PROJECT_MIGRATION_MISSING` (version < 1), `PROJECT_SNAPSHOT_INVALID`, `STORE_INVALID_PROJECT`, `STORE_CORRUPT_JSON`… Không tự sửa dữ liệu.
- **`src/main.ts`:** tạo schema 4 bảng trong `ensureData` sau bảng cũ, khởi tạo `lessonStore`; thêm IPC `lesson:save-document`, `lesson:get-document`, `project:save-draft`, `project:get`, `project:list`, `project:delete` (giữ nguyên mọi kênh cũ).
- **`src/preload.ts` + `src/shared/types.ts`:** expose 6 hàm mới trên `window.eduGame` và khai báo trong `EduGameBridge` (type-only `GameProject`).
- **Test mới `tests/lesson-store.test.ts`:** SQLite temp + thư mục temp: lưu/đọc/ghi đè tài liệu (giữ `createdAt`, sha256, file thật), analysis/recommendation (replace theo analysis), project upsert/list/delete, kiểm tra version trên cả ghi lẫn đọc, snapshot sai bị chặn, cascade xoá tài liệu, và **bảng `games`/`sessions` cũ không đổi**.
- **Chạy test SQLite:** `better-sqlite3` build cho ABI của Electron nên test store chạy qua `tests/manual/run-electron-node.js` (`ELECTRON_RUN_AS_NODE=1`); các suite còn lại vẫn chạy Node thường.
- **Verification:** `npm run check` pass; `npm test` pass (build + **14 suites**); app thật (CDP 9333): `saveLessonDocument` → `getLessonDocument` khớp text, `saveProjectDraft` → `listProjects`/`getProject` → `deleteProject` → `null`, `getLibrary()` vẫn đọc được (8/8); regression `smoke62` **9/9**.
- **Chưa verify / còn lại:** chưa có UI dùng các IPC này (P5), chưa có `lesson:analyze`/`recommend`/`generate` (P3–P4); chưa test resume draft sau khi tắt app ở UI (mới test ở tầng store); chưa dọn tệp giáo án mồ côi khi project bị xoá.

## Editor kéo-thả (matching + race) + xem trước đường đua (2026-10-19)

Đóng hai mục còn lại của tasknight về thao tác trực quan trong trình soạn thảo (§4 "Kéo thả để sắp xếp", §6 "Giao diện kéo thả ô đặc biệt + xem trước đường đi trực quan"). Chỉ dùng trong editor — gameplay, `RaceData`/`MatchingGameData`, validator và `.egame` không đổi.

- **`src/renderer/features/game-editor.ts` (helpers mới):** `beginDrag`/`endDrag`/`clearDropHighlights`/`reorderByDrop`/`bindDragList` + `EDITOR_CELL_ICON`/`EDITOR_CELL_NAME` + biến `racePreviewTheme`, `dragState`. DOM (`#matchingPairs`, `#raceTeams`, `#raceCells`, `#raceQuestions`) vẫn là nguồn dữ liệu duy nhất (`readMatchingEditor`/`readRaceEditor` không đổi), kéo-thả chỉ đổi thứ tự/tham chiếu trong DOM rồi vẽ lại preview.
- **Matching:** mỗi row có handle `⠿` (`data-pair-drag`, `draggable="true"` **trên handle**, không trên row — row chứa `<input>` nên draggable cả row sẽ chặn chọn/sửa chữ); thả lên nửa trên/dưới một row khác để chèn trước/sau (`reorderByDrop`, dùng `clientY` vs tâm row). ↑/↓ và ✕ giữ nguyên làm đường dự phòng; `matchingPairRow` thêm 1 cột grid.
- **Race — xem trước (`renderRaceTrackPreview`):** render 1..trackLength thành `.race-track.is-preview` (tái dùng `.race-cell` + `race-cell-{boost,penalty,lucky,challenge}` của gameplay); ô 1 = 🚩 + icon các đội, ô cuối = 🏁; hiệu ứng ngoài khoảng 2–trackLength được nêu tên trong cảnh báo (`danger-text`); ô may mắn mờ + hint khi chưa bật "Bật ô may mắn". Re-render khi gõ số/loại ô, đổi `#raceTrackLength`, đổi đội, thêm/xóa ô, kéo-thả — chỉ thay `innerHTML` của `#raceTrackPreview` nên không mất focus ở các input khác.
- **Race — nút đổi tông `#racePreviewTheme`:** mặc định `data-preview-theme="editor"` (tông sáng hợp modal soạn thảo, ô `#fff` + tint nhạt theo loại), bấm → `"play"` (nền `#11152b`, ô giữ đúng màu gameplay) và nhãn đổi thành "📝 Xem kiểu soạn thảo"; trạng thái nằm trên attribute của container nên sống qua mọi lần re-render, và reset về `editor` mỗi lần mở editor (không persist vào settings/`RaceData`).
- **Race — kéo-thả:** chip palette (4 loại) thả vào `[data-track-cell]` → `placeRaceEffect` tạo row mới trong `#raceCells`; drop vào ô **đã có hiệu ứng → toast `Ô N đã có hiệu ứng…` và giữ nguyên** (khớp luật `validateRaceData`: không 2 hiệu ứng cùng ô); drop vào ô 1 (vạch xuất phát) → toast từ chối. Kéo handle `⠿` của row ô đặc biệt lên một ô → `moveRaceCellRow` đổi `[data-cell-number]` (trùng ô → toast, huỷ). Kéo handle câu hỏi → đổi thứ tự + `renumberRaceQuestions`. Team rows cũng kéo-thả được (thứ tự lượt).
- **CSS (`app.css`, `@layer components`, khối "G6"):** `.drag-handle`, `.dragging`, `.drag-over`, `.editor-race-preview[data-preview-theme=editor|play]` (+ tint 4 loại ô), `.race-track.is-preview` (ô 42px, `max-height:260px;overflow:auto`), `.race-palette`, `.race-effect-chip`; 3 rule grid cũ thêm cột `auto` cho handle.
- **Sửa test cũ (không liên quan G6 nhưng làm suite đỏ):** `tests/smoke/smoke58.js` còn 2 assertion thời tiền-Tailwind (`style.display`), trong khi Phase 2c đã chuyển sang class `hidden` — đổi sang `classList.contains('hidden')` (cùng cách đã áp cho `smoke56`).
- **Verification:** `npm run check` pass; `npm test` pass (build + **11 suite**); `tests/smoke/smoke63.js` (mới, CDP port 9333, 49 check) — matching reorder + ↑/↓ + persist thứ tự; preview 12 ô/markers/palette; tông editor ⇄ play (nền `rgb(17,21,43)`, ô boost `rgb(23,50,42)` vs `rgb(234,250,241)`); giảm trackLength còn 5 → cảnh báo ngoài khoảng; drop palette (thêm/thừa ô/xuất phát), kéo đổi vị trí ô, kéo đổi thứ tự câu hỏi, persist `race.cells=[2:boost,4:lucky]` + thứ tự câu; 0 uncaught. Regression: `smoke56` 56/56, `smoke57` 37/37, `smoke58` 25/25, `smoke59` 21/21, `smoke61` 18/18, `smoke62` 9/9; `geom-ab` 7/7 pages **0 diff/1261 elements**; `modal-ab` 8 screens **0 diff/245 elements** (cùng build, dump 2 lần).
- **Đóng gói (2026-10-19):** `npm run dist:win` thành công → `release/EduGame-Studio-Setup-0.3.0.exe` (92.2 MB, 17:25) + `release/win-unpacked`; xác nhận `app.asar` chứa `dist/src/renderer/styles/app.css` mới (có `.drag-handle`, `data-preview-theme`, `race-preview`, `#11152b`); chạy app đóng gói với `--remote-debugging-port=9333` và `node tests/smoke/smoke63.js` → **49/49**, 0 uncaught. Lưu ý môi trường: bước `rcedit` của electron-builder tải `winCodeSign-2.6.0` và 7-Zip không tạo được symlink macOS nếu thiếu quyền admin/Developer Mode — đã xử lý bằng cách giải nén sẵn cache `winCodeSign\winCodeSign-2.6.0` (bỏ thư mục `darwin`); chi tiết trong `AGENT_HANDOFF.md`.
- **Chưa verify / còn lại:** thao tác kéo-thả bằng **chuột thật** (smoke dùng `DragEvent` tổng hợp; chưa thử kéo tay trên Windows, chưa thử khi cửa sổ bị scale/zoom); kéo-thả **trong lúc chơi** (matching columns) vẫn chưa làm; ảnh minh họa cho cặp ghép vẫn chưa có (treasure đã có §5.2b); chưa cài thử installer trên máy sạch (chỉ chạy `win-unpacked`).

## Lịch sử trước 2026-10-19

Các mục từ 2026-10-16 đến 2026-10-18 (Tailwind G0–G5, tasknight, Windows/offline AI cũ) đã chuyển sang [`docs/archive/STATUS-history-2026-10-16-to-18.md`](archive/STATUS-history-2026-10-16-to-18.md). Tệp này chỉ giữ lịch sử đang dùng để bàn giao.

## Status bar AI local (2026-10-21)

- **Sửa thanh trạng thái dưới topbar:** `src/renderer/features/ai-status.ts` (viết lại) + markup trong `src/index.html`; tách **trạng thái runtime llama.cpp** (đang chạy / đang khởi động / chưa chạy) khỏi **tác vụ AI đang chạy**. Poll 2 giây, bỏ qua khi tab bị ẩn; `initAiStatusBar()` idempotent và được gọi cả từ `bootstrap.ts` lẫn `DOMContentLoaded`.
- **Nút mới trên thanh trạng thái:** `#aiStatusStart` ("▶ Khởi động") mở `openLocalAiModal()` để giáo viên chọn model và bật llama.cpp mà không phải đi qua wizard; `#aiStatusStop` chỉ bật khi runtime READY và không có tác vụ AI (tránh dừng model giữa lúc generate); `#aiStatusCancel` huỷ tác vụ đang chạy; `#aiStatusToggle` ẩn/hiện chấm đỏ "chưa chạy", lưu trong **một** khoá `edugame.aiStatus.idleVisible` (mặc định ẩn).
- **Bớt đọc đĩa:** `getLocalAiModels()` chỉ gọi khi trạng thái runtime đổi (hoặc lần đầu); `ai:tasks` nhận thêm `history: false` để poll của thanh trạng thái **không đọc bảng lịch sử SQLite**; trang Cài đặt vẫn nhận `{ live, history }` như cũ.
- **Sửa lỗi hiển thị:** `src/index.html` không còn chuỗi escape literal (`` `r`n ``) hay id trùng `aiStatusNotRunning`; `bootstrap.ts` khôi phục từ HEAD rồi chỉ thêm lại `applyTheme(...)` và `initAiStatusBar()` (xoá 126 chuỗi mojibake do phiên trước ghi hỏng).
- **Test:** `tests/smoke/smoke73.js` viết lại (17 check: không còn escape literal, không id trùng, nút Khởi động, mở/đóng modal AI local, ẩn/hiện chấm đỏ + khoá localStorage duy nhất, không exception/console error).
- **Verification:** `npm run check` sạch; `npm run build` thành công; `npm test` build + **26 suite** pass; CDP (dist, `EDUGAME_USER_DATA` mới): `smoke73` **17/17**, `smoke72` **15/15** (task manager + verify runtime CPU + nhãn Fast/Thinking), `smoke56` **58/58** (tạo thủ công treasure/race).
- **Chưa verify / còn lại:** chưa bấm thử bằng chuột thật trên bản đóng gói (`release/win-unpacked` chưa build lại sau thay đổi này); trạng thái READY/STARTING của thanh mới chỉ được kiểm ở trạng thái STOPPED (smoke không chạy model thật); `npm test` không phủ DOM của thanh trạng thái — chỉ `smoke73` phủ và smoke này cần cổng CDP 9333.
- **Lỗi đã biết (đã sửa sau đó):** handler `window:set-fullscreen` từng nằm lồng trong `files:import-game`; xem mục "Nút toàn màn hình (⛶) khi trình chiếu" ngay dưới.

## Nút toàn màn hình (⛶) khi trình chiếu (2026-10-21)

- **Nguyên nhân:** `ipcMain.handle('window:set-fullscreen', ...)` bị lồng trong handler `files:import-game` (`src/main.ts`), nên chỉ được đăng ký sau lần nhập game đầu tiên. Trước đó `setFullscreen()` từ renderer bị từ chối (không có handler), và lần nhập game thứ hai gọi `ipcMain.handle` trùng kênh nên lỗi "Attempted to register a second handler".
- **Sửa:** tách handler ra cấp cao nhất trong `registerIpc()` (`src/main.ts`) + guard `isDestroyed()`; main phát `window:fullscreen-changed` từ sự kiện `enter-full-screen` / `leave-full-screen`; preload thêm `onFullscreenChanged()` (`src/preload.ts`, `src/shared/types.ts`); `gameplay.ts` chỉ đặt `data-fullscreen` theo trạng thái main báo về, nên cờ không lệch nếu cửa sổ tự thoát toàn màn hình.
- **Đóng màn chơi = thoát toàn màn hình:** thêm `closePlaySurface()` dùng cho nút ✕, nút "Đóng" ở màn thiết lập đội và cả 4 màn kết quả (trước đây các nút này chỉ xoá modal nên cửa sổ bị kẹt ở toàn màn hình); nút ⛶ giờ bật/tắt (bấm lần nữa để thoát); Escape vẫn thoát.
- **Test mới `tests/smoke/smoke74.js`** (15 check, CDP 9333): gọi IPC trên profile mới **chưa nhập game** → `{ok:true}`, main báo trạng thái về, cửa sổ tăng 1266 → 1280 px rồi trở lại 1266; bấm ⛶ qua listener uỷ nhiệm vào toàn màn hình; Escape thoát; `closePlaySurface()` đóng modal + trả cửa sổ về; 0 exception/console error.
- **Verification:** `npm run check` sạch; `npm run build` thành công; `npm test` build + **26 suite** pass; CDP: `smoke74` **15/15**, `smoke73` **17/17**, `smoke72` **15/15**, `smoke56` **58/58**, `smoke70` **8/8** (smoke70 dùng cổng 9334).
- **Chưa verify:** chưa nhập `.egame` hai lần bằng hộp thoại thật để xác nhận lỗi "second handler" đã hết (hộp thoại native không tự động hoá được); chưa bấm ⛶ bằng chuột thật trên bản đóng gói (`release/win-unpacked` chưa build lại). Trên máy này chiều cao vùng nội dung khi toàn màn hình báo 695 px (cửa sổ vẫn 1280×720; có lẽ do taskbar/frame), nên smoke kiểm tra bằng chiều rộng — cần xem lại trên máy khác.

## Wizard bước 4/5 + thanh AI cố định khi cuộn (2026-10-21)

- **Bước 4 — Fast/Thinking thành hai thẻ chọn (bỏ dropdown):** `src/renderer/features/wizard/step-configure.ts` thêm `wizardModeChoice()` (`role="radiogroup"` + hai `[data-wizard-mode]` card: ⚡ Fast / 🧠 Thinking, mỗi thẻ có mô tả thật) và `wizardSetGenerationMode()`; `generationMode` không còn là `[data-wizard-config]` select. Đổi mode xử lý tại chỗ (`set-mode` trong `src/renderer/pages/create-wizard.ts`): chỉ đổi `aria-checked`, badge và `wizardState.config.generationMode`, **không render lại**, nên chữ giáo viên đang gõ và con trỏ không mất. Giá trị lưu vẫn `fast`/`deep` → cache/project/contract không đổi (#34, #36).
- **Bước 5 — đồng hồ thực + dự kiến:** `src/renderer/features/wizard/state.ts` thêm `generationStartedAt`, `wizardGenerationEstimateText()` (khoảng theo mode + số mục) và `wizardGenerationElapsedText()` ("Đã chạy m:ss · dự kiến a–b phút"). Một đồng hồ dùng chung cho `analyze` và `generate` (`wizardStartActivityClock`); chip topbar đổi nhãn "AI đang phân tích" / "AI đang tạo nội dung". `wizardGenerateRun()` và `wizardRegenerateItem()` khởi động/dừng đồng hồ; `wizardReset()` dừng và xoá mốc thời gian. Không có phần trăm hay đếm ngược giả.
- **Thanh AI đồng bộ với bước 5:** `src/renderer/pages/create-wizard.ts` gọi `window.refreshAiStatusBar()` mỗi khi có `lesson:progress` (không đợi poll 2 giây); `src/renderer/features/ai-status.ts` map stage thô (`prepare/retrieve/generate/repair/validate/ready/cached`) sang tiếng Việt và thêm thời gian đã chạy từ `task.startedAt`; chip topbar có `data-global-ai-label`, bấm vào nhảy đúng bước analyze/generate (`src/renderer/core/bootstrap.ts`).
- **Header + thanh trạng thái cố định khi cuộn:** `src/renderer/styles/app.css` — `.topbar{position:sticky;top:0;z-index:30}`, `.ai-status-bar{position:sticky;top:72px;z-index:20}` (topbar cao 72 px), sidebar `.app-shell>.sidebar{position:sticky;top:0;height:100vh;overflow-y:auto}`. Nội dung dài cuộn bên dưới; header, thanh AI và điều hướng đứng yên.
- **Test:** `tests/smoke/smoke72.js` cập nhật T6 theo radiogroup (không còn select) — **17/17**; `tests/smoke/smoke75.js` mới **18/18** (hai thẻ, đúng một `aria-checked`, đổi mode tại chỗ giữ chữ đang gõ, không có đồng hồ khi rảnh, "Đã chạy 1:05 · dự kiến 2–5 phút", chip đúng nhãn + giây, đồng hồ chạy sau ~1,3 s, dừng thì xoá đồng hồ + ẩn chip, cuộn 700 px mà topbar top 0 / thanh AI top 72 / sidebar top 0, 0 exception); `tests/smoke/smoke76.js` mới **11/11** — chạy **đường sinh nội dung thật** `wizardGenerateRun()` với fixture `EDUGAME_AI_TEST_DIR=tests/fixtures/wizard/happy`: vào generate có "0:00 · dự kiến 1–3 phút", chip "AI đang tạo nội dung", sinh xong busy rỗng + đồng hồ/chip biến mất, có `gameSnapshot`.
- **Kiểm chứng:** `npm run check` sạch; `npm run build` thành công; `npm test` build + **26 suite** pass; CDP trên `dist`, mỗi smoke dùng `EDUGAME_USER_DATA` mới: `smoke75` **18/18**, `smoke76` **11/11** (kèm fixture), `smoke72` **17/17**, `smoke73` **17/17**. Đã xem ảnh chụp thật: bước 4 Fast, bước 4 Thinking, bước 5 "Đã chạy 0:42 · dự kiến 2–5 phút" + chip 0:42, trang cuộn 900 px vẫn cố định header/thanh AI.
- **Đo thật với Qwen 2B (`tests/manual/real-ai-status.js`, mới, **22/22**):** profile tạm (`EDUGAME_USER_DATA` + junction `ai-local/models` nên không đụng dữ liệu thật), Qwen3.5-2B Q4_0, CPU i5-10210U. Runtime READY sau **9–10 s**; phân tích 520 ký tự **44–63 s**; generate 4 câu **fast 75–82 s**, **deep 39–153 s** (deep không luôn chậm hơn fast). Thanh AI thật sự hiện `tạo nội dung arena · đang tìm ngữ cảnh · 0:00` rồi `… · đang tạo nội dung · 0:03`; đồng hồ bước 5 chạy `0:00 → 1:11` với "dự kiến 1–3 phút" (fast) / "2–5 phút" (deep); chip đọc "AI đang tạo nội dung"; xong thì busy rỗng, đồng hồ và chip biến mất, thanh về "Không có tác vụ AI đang chạy". Khoảng dự kiến bao phủ số đo; deep có lần nhanh hơn cận dưới (75 s so với "2 phút") nên là cận thận trọng, không phải cam kết.
- **Quan sát ngoài phạm vi:** cùng cấu hình 4 câu, có lượt Qwen 2B chỉ trả **1/4 câu**; báo cáo chất lượng ghi `requested 4 / found 1`, 0 lỗi, có `warnings` (chỉ cố vấn, không chặn lưu). Cần xem lại UX/ngưỡng nếu hiện tượng này lặp lại.
- **Chưa verify:** chưa bấm bằng chuột thật trên bản đóng gói (`release/win-unpacked` chưa build lại); chưa đo lại khoảng dự kiến trên máy khác hoặc model 4B; khi cửa sổ bị che hoàn toàn (occlusion) thanh AI ngừng poll — đúng thiết kế (bỏ qua khi tab ẩn) và tự cập nhật khi cửa sổ hiện lại (đã kiểm bằng `Page.bringToFront` trong smoke).
- **Tiếp theo đề xuất:** xem lại hiện tượng 1/4 câu (có nên chặn "Lưu" hay tạo lại tự động khi `found < requested`), rồi build lại installer và kiểm tra bằng chuột thật trên `win-unpacked`.

## Đổi thể loại sau bước 5 không còn bị chặn (2026-10-21)

- **Triệu chứng:** hoàn thành bước 5 với một thể loại, quay lại bước 3 chọn thể loại khác thì mọi lần lưu đều báo `Cấu hình là “X” nhưng nội dung là “Y”.` (`STORE_INVALID_PROJECT`) và không thể tạo trò chơi mới.
- **Nguyên nhân:** `wizardRecommendSelect`/`wizardRecommendSelectType` (`src/renderer/features/wizard/step-recommend.ts`) chỉ đổi `config` mà giữ `draft/gameSnapshot/gameId/quality` của thể loại cũ; `wizardBuildProject` (`src/renderer/features/wizard/state.ts`) luôn gửi kèm nội dung đó, còn `validateProjectForWrite` (`src/services/lesson-store.ts:1158-1163`) từ chối đúng theo invariant `config.gameType === draft.gameType`. Vì lần lưu thất bại, DB vẫn giữ config cũ nên `lesson:generate` (đọc project từ DB) sẽ tạo lại thể loại cũ nếu có đường vòng.
- **Sửa (chỉ renderer, không nới store):** thêm `wizardGameSavedToLibrary()`, `wizardDiscardGeneratedContent()` và `wizardConfirmGenreChange()` trong `state.ts`; hai handler chọn thể loại gọi chúng khi thể loại được chọn khác `draft.gameType`. Nội dung đã lưu vào Thư viện trò chơi thì bỏ im lặng (game vẫn chơi được trong thư viện); bản nháp **chưa** lưu thì hỏi một lần bằng `window.confirm`, huỷ thì giữ nguyên thể loại + nội dung. Nếu `draft` đã đúng thể loại (ví dụ `selectedGameType` bị reset sau khi phân tích lại) thì chỉ đổi lựa chọn, không xoá gì. `wizardBuildProject()` thêm lớp phòng thủ: cặp config/draft lệch thể loại thì gửi `draft/gameSnapshot/gameId = null` và không ghi `status: ready` — để đường nào bị bỏ sót cũng không chặn lưu. `wizardSaveCurrentProject()` dùng lại `wizardGameSavedToLibrary()` thay vì tự kiểm tra.
- **Test mới `tests/smoke/smoke80.js` (17/17, CDP 9333 + fixture):** tạo dự án ở bước 3 từ analysis giả lập → chọn thể loại gợi ý (scenario) → cấu hình → tạo nội dung → quay lại bước 3 bằng stepper (`[data-wizard-goto="recommend"]`; bước 5 khi đã có nội dung không có nút "← Cấu hình"): huỷ ở confirm thì giữ scenario + draft; đồng ý thì xoá draft/snapshot/gameId và `3→4` lưu được (`config=matching`, `draft=null`, bước 5 hiện trạng thái trống thay vì nội dung cũ); tạo matching thành công và lưu vào thư viện; sau đó chuyển sang treasure **không** hỏi lại (đã có trong thư viện), rồi cấu hình + tạo treasure thành công; không xuất hiện lỗi "nhưng nội dung là", 0 exception/console error.
- **Kiểm chứng:** `npm run check` sạch; `npm test` pass (build + **26 suite** + `lesson-store`); `tests/smoke/smoke80.js` **17/17**; hồi quy `smoke76` **12/12**, `smoke77` **11/11**.
- **Chưa verify:** mới chạy với fixture, chưa chạy với model thật; chưa build lại installer/`release/win-unpacked`; hộp thoại confirm chưa bấm tay (smoke ghi đè `window.confirm`).
- **Quan sát:** ở bước 5 khi đã có nội dung, UI chỉ có "← Cấu hình" ở trạng thái trống; muốn quay lại phải dùng thanh stepper. Giữ nguyên trong lần sửa này, có thể thêm nút quay lại nếu giáo viên phản hồi khó tìm.
- **Tiếp theo đề xuất:** build lại installer và kiểm tra luồng đổi thể loại bằng chuột thật trên `win-unpacked`; nếu cần, thêm nút "← Cấu hình" cho trạng thái đã có nội dung ở bước 5.
