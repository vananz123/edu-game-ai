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
    const saved = await window.eduGame.saveGame(Object.assign({}, arena, { title: 'UE asset roundtrip' }));
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
    const lib = await window.eduGame.getLibrary();
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
    const lib2 = await window.eduGame.getLibrary();
    const lg = (lib2?.games || []).find(g => g.title === 'UE legacy game')?.questions?.[0];
    out.legacyStayedClean = !!lg && !('contentCategory' in lg) && !('iconName' in lg) && !('illustrationAssetId' in lg);

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
      const inputs = document.querySelectorAll('#modalRoot [data-field="contentCategory"]');
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

  // ---- Phase B (docs/UI-PLAN-V2.md): the editor is where a teacher spends the
  // longest single stretch, so it is measured at both real resolutions too.
  //
  // Contract, measured rather than invented:
  //  - fontFloor 9px: `.tag { font-size: 9px }` is the app's own smallest text,
  //    used for the step badges. Asserting 12px failed on correct design; 9px
  //    still catches a real shrink.
  //  - innerScrollAreas 1: `.modal { max-height: 90vh; overflow: auto }` means a
  //    long form legitimately scrolls. Skipping the assertion would let a second,
  //    unintended scroller appear unnoticed, so exactly 1 is expected.
  for (const size of PROJECTOR_SIZES) {
    const tag = size.label;
    await setViewportAndWait(ctx, size);
    const opened = await evaluate(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      document.getElementById('modalRoot').innerHTML = '';
      openEditor(${JSON.stringify({ id: 'ue-layout', title: 'Kiểm tra bố cục', subject: 'Tự nhiên', grade: '3', template: 'quiz', description: '', tags: [], sourceName: 'ui-check', createdAt: '2026-01-01T00:00:00.000Z', gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'manual' }, questions: [{ id: 'q1', type: 'multiple-choice', prompt: 'Con vật nào kêu meo?', options: [{ id: 'a', text: 'Con mèo' }, { id: 'b', text: 'Con chó' }], correctOptionId: 'a', correctAnswer: '', explanation: 'Mèo kêu meo.', points: 100, contentCategory: 'animals', iconName: 'paw-print', illustrationAssetId: 'animals-meadow' }] })}, false, 'test');
      await sleep(600);
      return { modal: Boolean(document.querySelector('.modal')), row: Boolean(document.querySelector('#editorQuestions .editor-question')) };
    })()`);
    check(`[${tag}] editor renders its item row`, Boolean(opened && opened.modal && opened.row), JSON.stringify(opened));
    await measureAt(ctx, size, `item-assets-editor-${tag}`, { check, fontFloor: 9, innerScrollAreas: 1 });
    await evaluate(`document.getElementById('modalRoot').innerHTML = ''; true`);
  }
  await setViewport(ctx.send, null);

  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
