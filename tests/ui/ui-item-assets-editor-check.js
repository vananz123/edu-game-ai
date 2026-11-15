// ui-item-assets-editor-check.js — Phase 4 của update_plan_6: trình soạn thảo có
// làm mất metadata từng mục (`contentCategory` / `iconName` / `illustrationAssetId`)
// và lựa chọn "Minh họa" của giáo viên hay không.
//
// Lý do phải chạy trên app THẬT: `saveEditedGame` dựng lại từng mục THEO TỪNG
// TRƯỜNG từ DOM, nên trường nào không có mặt trong DOM sẽ bị xoá âm thầm ngay lần
// lưu đầu tiên. Lỗi đó chỉ lộ ra khi render → đọc lại → lưu thật, không lộ ra ở
// unit test (xem docs/DECISIONS.md #65). Phần DOM không có harness trong Node nên
// tệp này LÀ bài test cho nửa còn lại.
//
// Chạy trên app đã build có --remote-debugging-port. LƯU Ý: ui-check-lib đọc cổng
// từ argv[2] hoặc env CDP_PORT, nên khi chạy qua npm phải đặt CDP_PORT:
//   npm run build
//   npx electron . --remote-debugging-port=9361
//   $env:CDP_PORT='9361'; npm run check:item-assets-ui
// (Tham số dòng lệnh `... 9361` chỉ hoạt động khi gọi thẳng `node <file> 9361`.)
//
// Dữ liệu trong bài là TỔNG HỢP, không có dữ liệu học sinh thật.
const { check, connect, results } = require('../manual/lib/ui-check-lib');
const { PROJECTOR_SIZES, measureAt, setViewport, setViewportAndWait } = require('./lib/screenshot-capture');

(async () => {
  const ctx = await connect();
  const { evaluate } = ctx;

  const out = await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const ASSET = { contentCategory: 'animals', iconName: 'paw-print', illustrationAssetId: 'animals-meadow' };
    const out = {};

    // ---- 1. render → đọc: đủ 3 khoá đi qua DOM của trình soạn thảo ----
    // \`openEditor\` dựng lại toàn bộ modal từ dữ liệu game; nếu input ẩn không
    // được render thì readEditorItemAssets trả {} và khoá biến mất.
    const arena = {
      id: 'ue-arena', title: 'Kiểm tra metadata', subject: 'Tự nhiên', grade: '3',
      template: 'quiz', description: '', tags: [], sourceName: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'manual' },
      questions: [{
        id: 'q1', type: 'multiple-choice', prompt: 'Con vật nào kêu "meo"?',
        options: [{ id: 'a', text: 'Con mèo' }, { id: 'b', text: 'Con chó' }],
        correctOptionId: 'a', correctAnswer: '', explanation: 'Mèo kêu meo.', points: 100, ...ASSET
      }]
    };
    document.getElementById('modalRoot').innerHTML = '';
    openEditor(JSON.parse(JSON.stringify(arena)), false, 'test');
    await sleep(200);

    let row = document.querySelector('#editorQuestions .editor-question');
    out.rowFound = !!row;
    out.inputsPresent = ['contentCategory', 'iconName', 'illustrationAssetId']
      .every(f => !!row?.querySelector('[data-field="' + f + '"]'));
    const read = readEditorItemAssets(row);
    out.readMatches = read.contentCategory === ASSET.contentCategory &&
      read.iconName === ASSET.iconName && read.illustrationAssetId === ASSET.illustrationAssetId;

    // 'general' phải bị bỏ (thiếu category vốn đã nghĩa là general) — cùng quy
    // tắc với itemAssetsFromDraft của adapter.
    row.querySelector('[data-field="contentCategory"]').value = 'general';
    out.generalDropped = !('contentCategory' in readEditorItemAssets(row));
    row.querySelector('[data-field="contentCategory"]').value = ASSET.contentCategory;

    out.modeSelected = document.getElementById('editIllustrationMode')?.value === 'manual';
    out.modeOptions = document.querySelectorAll('#editIllustrationMode option').length;

    // Một icon KHÔNG có trong registry bị loại khi RENDER (editorAssetFieldsHtml
    // kiểm tra EDITOR_ICON_NAMES), nên nó không bao giờ được ghi lại. readEditorItemAssets
    // chỉ bỏ giá trị rỗng — đó là đúng: nó không phải lớp kiểm tra registry.
    const dirtyArena = JSON.parse(JSON.stringify(arena));
    dirtyArena.questions[0].iconName = 'khong-co-icon-nay';
    document.getElementById('modalRoot').innerHTML = '';
    openEditor(dirtyArena, false, 'test');
    await sleep(200);
    const dirtyRow = document.querySelector('#editorQuestions .editor-question');
    out.unknownIconDropped = !('iconName' in readEditorItemAssets(dirtyRow));

    document.getElementById('modalRoot').innerHTML = '';
    openEditor(JSON.parse(JSON.stringify(arena)), false, 'test');
    await sleep(200);
    row = document.querySelector('#editorQuestions .editor-question');
    out.knownIconKept = row.querySelector('[data-field="iconName"]').value === 'paw-print';


    // ---- 2. LƯU THẬT rồi mở lại từ kho: khoá + chế độ minh hoạ còn nguyên ----
    // Đây là bước bắt được lỗi "xoá âm thầm": saveEditedGame dựng lại object game
    // theo từng trường, nên giá trị phải đi qua DOM chứ không phải biến JS.
    const saved = await desktop.call('saveGame', Object.assign({}, arena, { title: 'UE asset roundtrip' }));
    out.savedOk = !!saved && !!saved.id;

    document.getElementById('modalRoot').innerHTML = '';
    document.querySelector('.nav-item[data-page="library"]')?.click();
    await refreshDb();
    await sleep(300);
    const reopen = state.db.games.find(g => g.title === 'UE asset roundtrip');
    out.reopenFound = !!reopen;
    if (reopen) {
      editGame(JSON.parse(JSON.stringify(reopen)));
      await sleep(250);
      document.getElementById('saveGameBtn')?.click();
      await sleep(900);
    }

    // Read back through IPC (the store on disk), not just in-memory state: that is
    // what proves the value really persisted instead of surviving in a JS object.
    const lib = await desktop.call('getLibrary');
    const stored = (lib?.games || []).find(g => g.title === 'UE asset roundtrip');
    const q = stored?.questions?.[0];
    out.afterSave = { contentCategory: q?.contentCategory, iconName: q?.iconName, illustrationAssetId: q?.illustrationAssetId };
    out.assetsSurvivedSave = q?.contentCategory === ASSET.contentCategory &&
      q?.iconName === ASSET.iconName && q?.illustrationAssetId === ASSET.illustrationAssetId;
    out.modeSurvivedSave = stored?.gameSetup?.illustrationMode === 'manual';

    // ---- 3. Game CŨ (không có trường nào) không được tự mọc thêm khoá ----
    const legacy = {
      id: 'ue-legacy', title: 'UE legacy game', subject: 'Tự nhiên', grade: '3',
      template: 'quiz', description: '', tags: [], sourceName: '',
      createdAt: '2026-01-01T00:00:00.000Z', gameSetup: { scoringMode: 'cơ bản' },
      questions: [{
        id: 'q1', type: 'multiple-choice', prompt: 'Một cộng một bằng mấy?',
        options: [{ id: 'a', text: 'Hai' }, { id: 'b', text: 'Ba' }],
        correctOptionId: 'a', correctAnswer: '', explanation: 'Bằng hai.', points: 100
      }]
    };
    document.getElementById('modalRoot').innerHTML = '';
    openEditor(JSON.parse(JSON.stringify(legacy)), false, 'test');
    await sleep(200);
    document.getElementById('saveGameBtn')?.click();
    await sleep(900);
    const lib2 = await desktop.call('getLibrary');
    const lg = (lib2?.games || []).find(g => g.title === 'UE legacy game')?.questions?.[0];
    out.legacyStayedClean = !!lg && !('contentCategory' in lg) && !('iconName' in lg) && !('illustrationAssetId' in lg) && !('sceneBlueprint' in lg);

    // ---- 4. #252 "Cảnh thử": dựng cảnh từ chủ đề, không gọi mạng ----
    // Nút này là affordance tạm của P0 (P3 thay bằng AI). Nó phải: ghi blueprint
    // đã chuẩn hoá vào input ẩn, xoá lựa chọn thủ công để cảnh thử NHÌN THẤY được,
    // và sống sót qua một lần lưu thật.
    const holder = Object.assign({}, JSON.parse(JSON.stringify(arena)), { title: 'UE blueprint roundtrip' });
    document.getElementById('modalRoot').innerHTML = '';
    openEditor(holder, false, 'test');
    await sleep(250);
    row = document.querySelector('#editorQuestions .editor-question');
    const bpButton = row.querySelector('[data-editor-art-blueprint]');
    out.blueprintButton = !!bpButton && /Cảnh thử/u.test(bpButton.textContent || '');
    out.blueprintInputPresent = !!row.querySelector('[data-field="sceneBlueprint"]');
    const artInput = () => row.querySelector('[data-field="illustrationAssetId"]');
    const bpInput = () => row.querySelector('[data-field="sceneBlueprint"]');
    out.blueprintClearedPickBeforeClick = artInput().value === 'animals-meadow';

    bpButton.click();
    await sleep(200);
    let generated = null;
    try { generated = JSON.parse(bpInput().value || 'null'); } catch (error) {}
    out.blueprintWritten = !!generated && generated.v === 1 && generated.layout === 'single' &&
      generated.backdrop === 'forest' && generated.paletteKey === 'animals' && generated.mainIcon === 'paw-print';
    out.blueprintClearedPick = artInput().value === '';
    out.blueprintBadge = /Cảnh thử/u.test(row.querySelector('[data-editor-art-badge]')?.textContent || '');
    out.blueprintPreview = !!row.querySelector('[data-editor-art-thumb] [data-scene-layer="subject"]');
    out.blueprintRead = readEditorItemAssets(row)?.sceneBlueprint?.mainIcon === 'paw-print';

    // Chọn lại hình có sẵn: hình chọn thắng, nhưng blueprint vẫn được giữ trong input
    // (đúng thứ tự ưu tiên đã ghi trong docs/DECISIONS.md #252).
    const pick = row.querySelector('[data-editor-art-pick]');
    pick.value = 'space-scene';
    pick.dispatchEvent(new Event('art-change'));
    await sleep(200);
    out.pickWins = artInput().value === 'space-scene';
    out.pickKeepsBlueprint = !!bpInput().value;

    // "Tự động" bỏ hình chọn -> cảnh thử hiện lại; "Bỏ ảnh" vẫn thắng blueprint.
    row.querySelector('[data-editor-art-reset]').click();
    await sleep(200);
    out.resetRevivesBlueprint = artInput().value === '' && !!bpInput().value;
    row.querySelector('[data-editor-art-remove]').click();
    await sleep(200);
    out.removeWinsOverBlueprint = artInput().value === 'none' && !!bpInput().value;
    row.querySelector('[data-editor-art-reset]').click();
    await sleep(200);

    // ---- 5. #257: bốn góc vật thể phụ ----
    // Sau "Cảnh thử" phải có 4 ô chọn góc; chọn một vật thể thì ghi vào blueprint
    // đúng dạng {icon, position}, vẽ lại ngay vào preview, và "— trống —" thì bỏ.
    // Lưu ý: mỗi lần đổi góc là một lần vẽ lại control, nên mọi truy vấn phải chạy
    // lại từ row (input ẩn nằm ngoài control nên không bị thay).
    const slotSel = pos => row.querySelector('[data-editor-art-slot="' + pos + '"]');
    out.slotCount = row.querySelectorAll('[data-editor-art-slot]').length;
    out.slotPositions = Array.from(row.querySelectorAll('[data-editor-art-slot]'))
      .map(node => node.getAttribute('data-editor-art-slot')).join(',');
    out.slotHasIcons = !!slotSel('left') && slotSel('left').options.length > 30;

    slotSel('left').value = 'leaf';
    slotSel('left').dispatchEvent(new Event('change'));
    await sleep(250);
    let withSub = null;
    try { withSub = JSON.parse(bpInput().value || 'null'); } catch (error) {}
    out.slotLeftWritten = !!withSub && Array.isArray(withSub.subIcons) && withSub.subIcons.length === 1 &&
      withSub.subIcons[0].icon === 'leaf' && withSub.subIcons[0].position === 'left';
    out.slotLeftKept = !!slotSel('left') && slotSel('left').value === 'leaf';
    out.slotLeftInPreview = !!row.querySelector('[data-editor-art-thumb] [data-scene-position="left"]');

    slotSel('top-left').value = 'lightbulb';
    slotSel('top-left').dispatchEvent(new Event('change'));
    await sleep(250);
    let withTwo = null;
    try { withTwo = JSON.parse(bpInput().value || 'null'); } catch (error) {}
    out.slotTwoWritten = !!withTwo && (withTwo.subIcons || []).length === 2 &&
      withTwo.subIcons.some(sub => sub.icon === 'lightbulb' && sub.position === 'top-left');
    out.slotTopLeftInPreview = !!row.querySelector('[data-editor-art-thumb] [data-scene-position="top-left"]');
    out.slotSavedSubIcons = (withTwo && withTwo.subIcons || []).length;

    slotSel('left').value = '';
    slotSel('left').dispatchEvent(new Event('change'));
    await sleep(250);
    let withOne = null;
    try { withOne = JSON.parse(bpInput().value || 'null'); } catch (error) {}
    out.slotEmptyDrops = !!withOne && (withOne.subIcons || []).length === 1 && withOne.subIcons[0].icon === 'lightbulb';
    out.slotMainIconKept = !!withOne && withOne.mainIcon === 'paw-print';

    // ---- 6. #260: hai vật thể đứng ở mặt đất ----
    // Cùng cơ chế ghi, nhưng là mảng chuỗi; và danh sách phải LOẠI chủ thể cùng
    // các icon đã dùng ở góc, nếu không normaliser sẽ bỏ chúng một cách âm thầm.
    const propSel = index => row.querySelector('[data-editor-art-prop="' + index + '"]');
    out.propCount = row.querySelectorAll('[data-editor-art-prop]').length;
    out.propExcludesSubject = !!propSel(0) && Array.from(propSel(0).options).every(op => op.value !== 'paw-print');
    out.propExcludesCorner = !!propSel(0) && Array.from(propSel(0).options).every(op => op.value !== 'lightbulb');

    propSel(0).value = 'apple';
    propSel(0).dispatchEvent(new Event('change'));
    await sleep(250);
    let withProp = null;
    try { withProp = JSON.parse(bpInput().value || 'null'); } catch (error) {}
    out.propWritten = !!withProp && Array.isArray(withProp.props) && withProp.props.length === 1 && withProp.props[0] === 'apple';
    out.propKept = !!propSel(0) && propSel(0).value === 'apple';
    out.propInPreview = !!row.querySelector('[data-editor-art-thumb] [data-scene-prop="apple"]');
    out.propKeptCorners = !!withProp && (withProp.subIcons || []).length === 1;

    propSel(1).value = 'fish';
    propSel(1).dispatchEvent(new Event('change'));
    await sleep(250);
    let twoProps = null;
    try { twoProps = JSON.parse(bpInput().value || 'null'); } catch (error) {}
    out.propTwoWritten = !!twoProps && (twoProps.props || []).length === 2;

    // ---- 7. #262: bố cục so sánh hai hình ----
    // Đổi Kiểu sang "So sánh" phải ra ngay một blueprint HỢP LỆ (có hình phải),
    // nếu không control sẽ tự nhảy về "Một hình" và giáo viên tưởng nút hỏng.
    const layoutSel = () => row.querySelector('[data-editor-art-layout]');
    out.layoutSelectCount = row.querySelectorAll('[data-editor-art-layout]').length;
    out.layoutDefaultSingle = !!layoutSel() && layoutSel().value === 'single';
    out.noCompareSelectInSingle = row.querySelectorAll('[data-editor-art-compare-icon]').length === 0;

    layoutSel().value = 'compare';
    layoutSel().dispatchEvent(new Event('change'));
    await sleep(250);
    let cmp = null;
    try { cmp = JSON.parse(bpInput().value || 'null'); } catch (error) {}
    out.compareWritten = !!cmp && cmp.layout === 'compare';
    out.compareSecondDifferent = !!cmp && !!cmp.compareIcon && cmp.compareIcon !== cmp.mainIcon;
    out.compareSecondNotCorner = !!cmp && (cmp.subIcons || []).every(sub => sub.icon !== cmp.compareIcon);
    out.compareSecondNotProp = !!cmp && (cmp.props || []).every(prop => prop !== cmp.compareIcon);
    out.compareSelectAppears = row.querySelectorAll('[data-editor-art-compare-icon]').length === 1;
    out.compareSignOffered = (row.querySelector('[data-editor-art-sign]')?.options.length || 0) === 4;
    out.compareSignDefaultNone = row.querySelector('[data-editor-art-sign]')?.value === '';
    out.compareSlotCount = row.querySelectorAll('[data-editor-art-slot]').length;
    out.compareSlotsAreTop = Array.from(row.querySelectorAll('[data-editor-art-slot]'))
      .map(node => node.getAttribute('data-editor-art-slot')).join(',') === 'top-left,top-right';

    const cmpSel = () => row.querySelector('[data-editor-art-compare-icon]');
    out.compareExcludesSubject = Array.from(cmpSel().options).every(op => op.value !== 'paw-print');
    out.compareExcludesProps = Array.from(cmpSel().options).every(op => op.value !== 'apple' && op.value !== 'fish');
    cmpSel().value = 'bird';
    cmpSel().dispatchEvent(new Event('change'));
    await sleep(250);
    let cmpBird = null;
    try { cmpBird = JSON.parse(bpInput().value || 'null'); } catch (error) {}
    out.compareSecondWritten = !!cmpBird && cmpBird.compareIcon === 'bird';
    out.compareSecondKept = !!cmpSel() && cmpSel().value === 'bird';

    row.querySelector('[data-editor-art-sign]').value = 'greater-than';
    row.querySelector('[data-editor-art-sign]').dispatchEvent(new Event('change'));
    await sleep(250);
    let cmpSign = null;
    try { cmpSign = JSON.parse(bpInput().value || 'null'); } catch (error) {}
    out.compareSignWritten = !!cmpSign && cmpSign.compareSign === 'greater-than';
    out.compareSignKept = row.querySelector('[data-editor-art-sign]')?.value === 'greater-than';
    out.comparePreviewTwoSubjects = row.querySelectorAll('[data-editor-art-thumb] [data-scene-subject]').length === 2;
    out.comparePreviewSign = !!row.querySelector('[data-editor-art-thumb] [data-scene-sign="greater-than"]');
    out.comparePreviewKeepsCorners = !!row.querySelector('[data-editor-art-thumb] [data-scene-position="top-left"]');
    out.comparePreviewSubjectCount = row.querySelectorAll('[data-editor-art-thumb] [data-scene-subject]').length;

    // Đổi về "Một hình": hai trường so sánh phải BIẾN MẤT, và 4 góc trở lại.
    layoutSel().value = 'single';
    layoutSel().dispatchEvent(new Event('change'));
    await sleep(250);
    let cmpBack = null;
    try { cmpBack = JSON.parse(bpInput().value || 'null'); } catch (error) {}
    out.compareClearedBack = !!cmpBack && cmpBack.layout === 'single' &&
      cmpBack.compareIcon === undefined && cmpBack.compareSign === undefined;
    out.compareSlotsRestored = row.querySelectorAll('[data-editor-art-slot]').length === 4;
    out.comparePreviewOneSubject = row.querySelectorAll('[data-editor-art-thumb] [data-scene-subject]').length === 0;

    // Rồi bật lại so sánh để lưu thật và kiểm vòng round-trip.
    layoutSel().value = 'compare';
    layoutSel().dispatchEvent(new Event('change'));
    await sleep(250);
    row.querySelector('[data-editor-art-compare-icon]').value = 'bird';
    row.querySelector('[data-editor-art-compare-icon]').dispatchEvent(new Event('change'));
    await sleep(250);
    row.querySelector('[data-editor-art-sign]').value = 'greater-than';
    row.querySelector('[data-editor-art-sign]').dispatchEvent(new Event('change'));
    await sleep(250);

    document.getElementById('saveGameBtn')?.click();
    await sleep(900);
    const lib3 = await desktop.call('getLibrary');
    const bq = (lib3?.games || []).find(g => g.title === 'UE blueprint roundtrip')?.questions?.[0];
    out.blueprintAfterSave = bq?.sceneBlueprint || null;
    out.blueprintSurvivedSave = !!bq?.sceneBlueprint && bq.sceneBlueprint.mainIcon === 'paw-print' &&
      bq.sceneBlueprint.backdrop === 'forest' && bq.sceneBlueprint.paletteKey === 'animals';
    out.blueprintDidNotAddPick = !bq || bq.illustrationAssetId === undefined;
    out.slotSurvivedSave = !!bq?.sceneBlueprint && (bq.sceneBlueprint.subIcons || []).length === 1 &&
      bq.sceneBlueprint.subIcons[0].icon === 'lightbulb' && bq.sceneBlueprint.subIcons[0].position === 'top-left';
    out.propsSurvivedSave = !!bq?.sceneBlueprint && (bq.sceneBlueprint.props || []).join(',') === 'apple,fish';
    out.compareSurvivedSave = !!bq?.sceneBlueprint && bq.sceneBlueprint.layout === 'compare' &&
      bq.sceneBlueprint.compareIcon === 'bird' && bq.sceneBlueprint.compareSign === 'greater-than';
    out.compareSaveKeptCorner = !!bq?.sceneBlueprint && (bq.sceneBlueprint.subIcons || []).length === 1 &&
      bq.sceneBlueprint.subIcons[0].icon === 'lightbulb';

    document.getElementById('modalRoot').innerHTML = '';
    return out;
  })()`);

  // All five item templates must render the hidden inputs; a template that
  // forgets them silently deletes the keys for that game type on save.
  const other = await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const base = {
      id: 'ue-tpl', title: 'UE templates', subject: 'Tự nhiên', grade: '3',
      description: '', tags: [], sourceName: '', createdAt: '2026-01-01T00:00:00.000Z',
      gameSetup: { scoringMode: 'cơ bản' }
    };
    const A = { contentCategory: 'animals', iconName: 'paw-print', illustrationAssetId: 'animals-meadow' };
    const results = {};
    const probe = async (template, patch) => {
      document.getElementById('modalRoot').innerHTML = '';
      openEditor(Object.assign({}, base, { template }, patch), false, 'test');
      await sleep(250);
      const inputs = document.querySelectorAll('#pageContent [data-field="contentCategory"]');
      results[template] = { count: inputs.length, first: inputs[0]?.value || '' };
    };
    await probe('quiz', { questions: [{ id: 'q1', type: 'multiple-choice', prompt: 'P',
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a',
      correctAnswer: '', explanation: 'E', points: 100, ...A }] });
    // Dùng chính hàm dựng mặc định của app để có cấu trúc hợp lệ, rồi gắn metadata
    // vào mục đầu tiên — giống dữ liệu AI/adapter đưa vào, không phải dữ liệu tay.
    const mg = defaultMatchingGame();
    (mg.pairs || mg.items || [])[0] && Object.assign((mg.pairs || mg.items)[0], A);
    await probe('matching', { questions: [], matchingGame: mg });
    document.getElementById('modalRoot').innerHTML = '';
    return results;
  })()`);

  check('quiz template renders asset inputs', other.quiz?.count >= 1, `count=${other.quiz?.count}`);
  check('matching template renders asset inputs', other.matching?.count >= 1, `count=${other.matching?.count}`);

  check('editor renders the item row', out.rowFound === true);
  check('saved game can be reopened from the library', out.reopenFound === true);
  check('all three hidden asset inputs are rendered', out.inputsPresent === true);
  check('render to read returns the same 3 keys', out.readMatches === true);
  check("'general' is dropped on read", out.generalDropped === true);
  check('a known icon id is kept', out.knownIconKept === true);
  check('an unknown icon id is dropped, not persisted', out.unknownIconDropped === true);
  check('"Minh hoa" select shows the saved mode', out.modeSelected === true, `${out.modeOptions} options`);
  check('item asset keys survive a real editor save', out.assetsSurvivedSave === true, JSON.stringify(out.afterSave));
  check('illustrationMode survives a real editor save', out.modeSurvivedSave === true);
  check('a game with no asset fields gains none on save', out.legacyStayedClean === true);

  // #252: the editor's "Cảnh thử" affordance (P0, no AI yet).
  check('the editor shows a "Cảnh thử" button', out.blueprintButton === true);
  check('the editor renders the hidden sceneBlueprint input', out.blueprintInputPresent === true);
  check('the fixture starts with an explicit pick (button must clear it)', out.blueprintClearedPickBeforeClick === true);
  check('"Cảnh thử" writes a normalised blueprint from the category', out.blueprintWritten === true, JSON.stringify(out.blueprintAfterSave));
  check('"Cảnh thử" clears the explicit pick so the scene is visible', out.blueprintClearedPick === true);
  check('the badge says "Cảnh thử"', out.blueprintBadge === true);
  check('the editor preview draws the blueprint scene', out.blueprintPreview === true);
  check('readEditorItemAssets returns the normalised blueprint', out.blueprintRead === true);
  check('picking a built-in scene wins over the blueprint', out.pickWins === true);
  check('picking a built-in scene keeps the stored blueprint', out.pickKeepsBlueprint === true);
  check('"Tự động" revives the blueprint', out.resetRevivesBlueprint === true);
  check('"Bỏ ảnh" wins over the blueprint', out.removeWinsOverBlueprint === true);
  check('the blueprint survives a real editor save', out.blueprintSurvivedSave === true, JSON.stringify(out.blueprintAfterSave));
  check('a blueprint-only item stores no illustrationAssetId', out.blueprintDidNotAddPick === true);

  // #257: four corner pickers, and a choice that really reaches the scene.
  check('the scene editor offers four corner pickers', out.slotCount === 4, String(out.slotCount));
  check('the corners are the ones the renderer knows', out.slotPositions === 'left,right,top-left,top-right', out.slotPositions);
  check('each corner lists the drawable icons', out.slotHasIcons === true);
  check('picking an icon writes {icon, position} into the blueprint', out.slotLeftWritten === true, JSON.stringify(out.slotLeftWritten));
  check('the picker keeps the chosen icon after the redraw', out.slotLeftKept === true);
  check('the chosen corner appears in the editor preview', out.slotLeftInPreview === true);
  check('a second corner keeps the first one', out.slotTwoWritten === true);
  check('the upper corner is drawn in the preview too', out.slotTopLeftInPreview === true);
  check('clearing a corner drops that icon only', out.slotEmptyDrops === true);
  check('clearing a corner keeps the subject icon', out.slotMainIconKept === true);
  check('a corner choice survives a real editor save', out.slotSurvivedSave === true, JSON.stringify(out.blueprintAfterSave));
  // #262: so sánh hai hình — control, dữ liệu, preview, và vòng lưu thật.
  check('the scene editor offers a layout picker', out.layoutSelectCount === 1);
  check('a scene starts as "Một hình"', out.layoutDefaultSingle === true);
  check('no second-subject picker exists in single layout', out.noCompareSelectInSingle === true);
  check('switching to compare writes a valid compare blueprint', out.compareWritten === true, JSON.stringify(out.blueprintAfterSave));
  check('the second subject is picked automatically and differs from the subject', out.compareSecondDifferent === true);
  check('the automatic second subject is not a corner icon', out.compareSecondNotCorner === true);
  check('the automatic second subject is not a ground prop', out.compareSecondNotProp === true);
  check('the second-subject picker appears in compare', out.compareSelectAppears === true);
  check('compare offers exactly 4 sign choices', out.compareSignOffered === true);
  check('compare starts with no sign', out.compareSignDefaultNone === true);
  check('compare keeps only the two upper corners', out.compareSlotCount === 2, String(out.compareSlotCount));
  check('the two corners offered are the ones compare can draw', out.compareSlotsAreTop === true, out.compareSlotsAreTop);
  check('the second-subject list excludes the subject icon', out.compareExcludesSubject === true);
  check('the second-subject list excludes ground props', out.compareExcludesProps === true);
  check('picking the second subject writes compareIcon', out.compareSecondWritten === true);
  check('the second-subject picker keeps its choice after the redraw', out.compareSecondKept === true);
  check('picking a sign writes compareSign', out.compareSignWritten === true);
  check('the sign picker keeps its choice after the redraw', out.compareSignKept === true);
  check('the preview draws two subjects in compare', out.comparePreviewTwoSubjects === true, String(out.comparePreviewSubjectCount));
  check('the preview draws the chosen sign', out.comparePreviewSign === true);
  check('the preview still draws the corner icon in compare', out.comparePreviewKeepsCorners === true);
  check('switching back to single removes both compare fields', out.compareClearedBack === true);
  check('switching back to single restores four corners', out.compareSlotsRestored === true);
  check('switching back to single draws one subject again', out.comparePreviewOneSubject === true);
  check('a compare scene survives a real editor save', out.compareSurvivedSave === true, JSON.stringify(out.blueprintAfterSave));
  check('saving a compare scene keeps the corner icon', out.compareSaveKeptCorner === true);

  // ---- #265 "Gợi ý cảnh": the editor button, driven through `desktop.stub` ----
  // No network in a gate: the button's contract is "whatever the channel returns,
  // the row ends up with a drawable blueprint, or with nothing changed at all".
  // The AI call itself is proven separately on a real model (DECISIONS #265).
  const suggest = await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('modalRoot').innerHTML = '';
    const fixture = {
      id: 'ue-suggest', title: 'Kiểm tra gợi ý cảnh', subject: 'Tự nhiên', grade: '3',
      template: 'quiz', description: '', tags: [], sourceName: 'ui-check',
      createdAt: '2026-01-01T00:00:00.000Z', gameSetup: { scoringMode: 'cơ bản' },
      questions: [{
        id: 'q1', type: 'multiple-choice', prompt: 'Con vật nào lớn hơn: kiến hay voi?',
        options: [{ id: 'a', text: 'Con kiến' }, { id: 'b', text: 'Con voi' }],
        correctOptionId: 'a', correctAnswer: '', explanation: 'Voi lớn hơn kiến.',
        points: 100, contentCategory: 'animals', iconName: 'paw-print'
      }]
    };
    openEditor(fixture, false, 'test');
    await sleep(500);
    const out = {};
    const artRow = () => document.querySelector('[data-editor-art]');
    const bpInput = () => document.querySelector('[data-field="sceneBlueprint"]');
    const button = () => artRow() && artRow().querySelector('[data-editor-art-suggest]');
    const toastText = () => (document.getElementById('toast') || {}).textContent || '';

    out.suggestButton = Boolean(button());
    out.suggestLabel = button() ? button().textContent.trim() : '';
    out.startsWithoutBlueprint = !bpInput().value;

    // 1. A failing channel must leave the row untouched and SAY why.
    document.getElementById('toast').textContent = '';
    desktop.stub('suggestScene', () => { throw new Error('mất mạng'); });
    button().click();
    await sleep(400);
    out.failKeptRow = bpInput().value === '';
    out.failToast = toastText();
    out.failEnabledAfter = button() ? button().disabled === false : false;

    // 2. A compare blueprint from the channel is stored and drawn, and the compare
    //    controls appear without a second click.
    desktop.stub('suggestScene', () => ({
      source: 'model', issues: [], json: JSON.stringify({
        v: 1, layout: 'compare', backdrop: 'meadow', paletteKey: 'animals',
        mainIcon: 'bug', compareIcon: 'paw-print', compareSign: 'less-than'
      })
    }));
    button().click();
    await sleep(400);
    const stored = JSON.parse(bpInput().value || 'null');
    out.appliedLayout = stored && stored.layout;
    out.appliedSecond = stored && stored.compareIcon;
    out.appliedSign = stored && stored.compareSign;
    out.compareControlsAppeared = Boolean(artRow().querySelector('[data-editor-art-layout]'));
    out.signSelectValue = artRow().querySelector('[data-editor-art-sign]')
      ? artRow().querySelector('[data-editor-art-sign]').value : null;
    out.previewSubjects = artRow().querySelectorAll('[data-scene-subject]').length;

    // 3. A degraded reply (the channel fell back) is still a drawable scene: the
    //    teacher gets a category picture, not an empty frame.
    desktop.stub('suggestScene', () => ({
      source: 'fallback', issues: ['no-json'], json: JSON.stringify({
        v: 1, layout: 'single', backdrop: 'plain', paletteKey: 'animals', mainIcon: 'paw-print'
      })
    }));
    button().click();
    await sleep(400);
    const fallbackStored = JSON.parse(bpInput().value || 'null');
    out.fallbackApplied = Boolean(fallbackStored) && fallbackStored.layout === 'single';
    out.fallbackToast = toastText();

    // 4. A channel that returns junk must not wipe the scene the teacher already has.
    const beforeJunk = bpInput().value;
    desktop.stub('suggestScene', () => ({ source: 'model', issues: [], json: '{"v":1,"mainIcon":"dragon"}' }));
    button().click();
    await sleep(400);
    out.junkKeptPrevious = bpInput().value === beforeJunk;
    out.junkToast = toastText();

    // 5. An empty question is refused before any call is made.
    const promptField = document.querySelector('[data-field="prompt"]');
    const savedPrompt = promptField.value;
    promptField.value = '   ';
    let calledWithEmpty = false;
    desktop.stub('suggestScene', () => { calledWithEmpty = true; return { source: 'model', json: '{"v":1,"layout":"single","backdrop":"plain","paletteKey":"math","mainIcon":"box"}' }; });
    document.getElementById('toast').textContent = '';
    button().click();
    await sleep(300);
    out.emptyPromptRefused = calledWithEmpty === false;
    out.emptyPromptToast = toastText();
    promptField.value = savedPrompt;

    desktop.stub('suggestScene', null);
    return out;
  })()`);
  check('the illustration block offers an AI scene button', suggest && suggest.suggestButton === true);
  check('the AI button is labelled as a suggestion, not a test', Boolean(suggest && /Gợi ý cảnh/.test(suggest.suggestLabel)), suggest && suggest.suggestLabel);
  check('a question starts with no scene before asking AI', Boolean(suggest && suggest.startsWithoutBlueprint));
  check('a failed AI call leaves the scene unchanged', Boolean(suggest && suggest.failKeptRow));
  check('a failed AI call says why', Boolean(suggest && /Không gợi ý được cảnh/.test(suggest.failToast)), suggest && suggest.failToast);
  check('the AI button is usable again after a failure', Boolean(suggest && suggest.failEnabledAfter));
  check('an AI compare scene is stored with its layout', Boolean(suggest && suggest.appliedLayout === 'compare'), suggest && suggest.appliedLayout);
  check('an AI compare scene keeps the second subject', Boolean(suggest && suggest.appliedSecond === 'paw-print'), suggest && suggest.appliedSecond);
  check('an AI compare scene keeps the sign', Boolean(suggest && suggest.appliedSign === 'less-than'), suggest && suggest.appliedSign);
  check('an AI reply redraws the compare controls', Boolean(suggest && suggest.compareControlsAppeared));
  check('the sign picker shows what the AI chose', Boolean(suggest && suggest.signSelectValue === 'less-than'), suggest && suggest.signSelectValue);
  check('the preview draws both AI subjects', Boolean(suggest && suggest.previewSubjects === 2), suggest && String(suggest.previewSubjects));
  check('a degraded AI reply still yields a drawable scene', Boolean(suggest && suggest.fallbackApplied));
  check('a degraded AI reply tells the teacher it fell back', Boolean(suggest && /cảnh theo chủ đề/.test(suggest.fallbackToast)), suggest && suggest.fallbackToast);
  check('an unusable AI reply does not wipe the existing scene', Boolean(suggest && suggest.junkKeptPrevious));
  check('an unusable AI reply says the scene was not replaced', Boolean(suggest && /không dùng được/.test(suggest.junkToast)), suggest && suggest.junkToast);
  check('an empty question is refused without calling AI', Boolean(suggest && suggest.emptyPromptRefused));
  check('an empty question explains what to do first', Boolean(suggest && /Hãy viết nội dung/.test(suggest.emptyPromptToast)), suggest && suggest.emptyPromptToast);


  // #260: two ground props, offered without the ids the normaliser would drop.
  check('the scene editor offers two ground-prop pickers', out.propCount === 2, String(out.propCount));
  check('a prop cannot repeat the subject icon', out.propExcludesSubject === true);
  check('a prop cannot repeat a corner icon', out.propExcludesCorner === true);
  check('picking a prop writes it to the blueprint', out.propWritten === true);
  check('the prop picker keeps its value after the redraw', out.propKept === true);
  check('the prop is drawn in the editor preview', out.propInPreview === true);
  check('adding a prop keeps the corner choices', out.propKeptCorners === true);
  check('a second prop is stored too', out.propTwoWritten === true);
  check('props survive a real editor save', out.propsSurvivedSave === true, JSON.stringify(out.blueprintAfterSave));

  // ---- Phase B (docs/UI-PLAN-V2.md): the editor is where a teacher spends the
  // longest single stretch, so it is measured at both real resolutions too.
  //
  // The editor is a *page* since DECISIONS #129: it renders into `#pageContent`
  // and the document scrolls vertically like any other page, so this uses the
  // rig's page mode rather than the modal-surface assertions.
  //  - fontFloor 9px: `.tag { font-size: 9px }` is the editor's own smallest
  //    text. The sidebar brand (8px) is shared chrome, excluded via textScope.
  //  - nothing may escape sideways, and no nested scroll box may hide content.
  //  - a page taller than the viewport is fine only if it really scrolls.
  //
  // A fresh profile opens the setup onboarding, which owns the window
  // (`html[data-setup-fullscreen]`) and would otherwise be measured instead of
  // the editor. Dismiss it before opening the editor.
  for (const size of PROJECTOR_SIZES) {
    const tag = size.label;
    await setViewportAndWait(ctx, size);
    const opened = await evaluate(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 40; i++) {
        if (document.querySelector('#modalRoot .setup-fullscreen')) break;
        await sleep(100);
      }
      if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
      await sleep(200);
      openEditor(${JSON.stringify({ id: 'ue-layout', title: 'Kiểm tra bố cục', subject: 'Tự nhiên', grade: '3', template: 'quiz', description: '', tags: [], sourceName: 'ui-check', createdAt: '2026-01-01T00:00:00.000Z', gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'manual' }, questions: [{ id: 'q1', type: 'multiple-choice', prompt: 'Con vật nào kêu meo?', options: [{ id: 'a', text: 'Con mèo' }, { id: 'b', text: 'Con chó' }], correctOptionId: 'a', correctAnswer: '', explanation: 'Mèo kêu meo.', points: 100, contentCategory: 'animals', iconName: 'paw-print', illustrationAssetId: 'animals-meadow' }] })}, false, 'test');
      await sleep(600);
      return {
        page: Boolean(document.querySelector('.editor-page')),
        row: Boolean(document.querySelector('#editorQuestions .editor-question')),
        setup: document.documentElement.getAttribute('data-setup-fullscreen')
      };
    })()`);
    check(`[${tag}] editor page renders its item row`, Boolean(opened && opened.page && opened.row), JSON.stringify(opened));
    check(`[${tag}] setup onboarding no longer owns the window`, Boolean(opened && !opened.setup), JSON.stringify(opened));
    await measureAt(ctx, size, `item-assets-editor-${tag}`, {
      check, fontFloor: 9, pageMode: true, textScopeSelector: '#pageContent'
    });
  }
  await evaluate(`(async () => {
    if (typeof closeEditorPage === 'function') closeEditorPage();
    return true;
  })()`);
  await setViewport(ctx.send, null);

  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
