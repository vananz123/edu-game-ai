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
