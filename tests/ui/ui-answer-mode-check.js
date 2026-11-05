// ui-answer-mode-check.js — #209: trường "Cách trả lời" trong trang Tạo nhanh và
// trong trình soạn thảo, tính trên APP THẬT đã build.
//
// Lý do phải chạy thật: nửa DOM của #209 không có harness trong Node. `saveEditedGame`
// dựng lại game TỪNG TRƯỜNG một từ DOM, nên một select thiếu trong trang là một giá trị
// bị xoá âm thầm ở lần lưu đầu tiên — đúng loại lỗi unit test không nhìn thấy
// (xem docs/DECISIONS.md #65 cho cùng cơ chế ở ảnh minh hoạ).
//
// Ba điều bài này chốt:
//  1. trang Tạo và trình soạn thảo hiện ĐÚNG ba cách trả lời (Thi đấu/Luyện tập/Thử thách);
//  2. game cũ vẫn mang luật cũ: mở ra là "Giữ hành vi hiện tại", lưu đi không đổi gì;
//  3. chọn một chế độ rồi mở lại thì lựa chọn còn nguyên, giá trị cũ được cất trong
//     `legacyScoringMode` và "Giữ hành vi hiện tại" hoàn nguyên ĐÚNG giá trị đó.
//
// Hai cơ chế của TRANG THẬT quyết định cấu trúc bài này:
//  • `saveEditedGame` đóng trang soạn thảo khi lưu thành công (editorPageState = null +
//    navigate('library')), nên KHÔNG có giả định "trang còn mở" nào được phép: mỗi lần
//    lưu phải mở lại đúng thứ sẽ lưu.
//  • các fixture mở liên tiếp đè nhau, nên ai cũng chỉ thấy fixture mở CUỐI.
// Vì vậy `save(name, pick, source)` luôn tự mở (fixture hoặc bản ghi đã lưu) và trả về
// `{ error, field }` thay vì ném exception — một trang không mở được phải hiện ra trong
// báo cáo, không được cắt mất 20 kiểm tra phía sau.
//
// Chạy trên app đã build với --remote-debugging-port. LƯU Ý: ui-check-lib đọc cổng từ
// argv[2] hoặc env CDP_PORT, nên khi chạy qua npm phải đặt CDP_PORT:
//   npm run build
//   npx electron . --remote-debugging-port=9373
//   $env:CDP_PORT='9373'; npm run check:answer-mode-ui
// (Tham số dòng lệnh `... 9373` chỉ hoạt động khi gọi thẳng `node <file> 9373`.)
//
// Toàn bộ dữ liệu là TỔNG HỢP, không có dữ liệu học sinh thật.
const { check, connect, results } = require('../manual/lib/ui-check-lib');

(async () => {
  const ctx = await connect();
  const { evaluate } = ctx;

  const report = await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const TOKEN_PRACTICE = 'tra-loi:luyen-tap';
    const TOKEN_CHALLENGE = 'tra-loi:thu-thach';
    const out = { editor: {}, saved: {}, create: {} };
    // Mỗi lần chạy một bộ tiêu đề riêng để không đọc phải bản ghi của lần trước.
    const RUN = 'AM209 ' + Date.now();
    const PREFIX = 'AM209 ';
    const title = key => PREFIX + key;

    // Onboarding của profile mới chiếm cửa sổ; đóng TRƯỚC khi đụng tới #modalRoot,
    // vì xoá DOM của wizard mà không hoàn lại cờ thì .app-shell stays hidden forever.
    for (let i = 0; i < 40; i++) {
      if (document.querySelector('#modalRoot .setup-fullscreen')) break;
      await sleep(100);
    }
    if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
    await sleep(200);

    // Một lần chạy bị ném lại để lại fixture trong kho; dọn trước để kho luôn sạch.
    try {
      const before = await window.eduGame.getLibrary();
      const stale = (before.games || []).filter(g => String(g.title || '').indexOf(PREFIX) === 0).map(g => g.id);
      out.staleFixtures = stale.length;
      if (stale.length && typeof window.eduGame.deleteGames === 'function') await window.eduGame.deleteGames(stale);
    } catch (error) {
      out.staleFixtures = 'skip: ' + String(error && error.message || error);
    }

    const question = id => ({
      id, type: 'multiple-choice', prompt: 'Một cộng một bằng mấy?',
      options: [{ id: 'a', text: 'Hai' }, { id: 'b', text: 'Ba' }],
      correctOptionId: 'a', correctAnswer: '', explanation: 'Bằng hai.', points: 100
    });
    const makeGame = (key, template, gameSetup, extra) => Object.assign({
      id: 'am-' + RUN + '-' + key, title: title(key), subject: 'Tự nhiên', grade: '3',
      template, description: '', tags: [], sourceName: 'ui-check',
      createdAt: '2026-01-01T00:00:00.000Z', gameSetup: gameSetup || {},
      questions: [question('q1'), question('q2')]
    }, extra || {});

    // Bốn thể loại có cách trả lời + Ghép cặp (giữ luật chấm riêng) + một game chưa
    // từng cất chế độ nào (đường của Kho báu trước #209).
    const FIX = {
      quiz: () => makeGame('quiz-legacy', 'quiz',
        { scoringMode: 'tốc độ', timeBonus: '5', pointsPerCorrect: '100', duration: '20' }),
      matching: () => makeGame('match-legacy', 'matching', { scoringMode: 'cơ bản' }, {
        questions: [],
        matchingGame: typeof defaultMatchingGame === 'function' ? defaultMatchingGame() : null
      }),
      treasure: () => makeGame('treasure-legacy', 'treasure-hunt', {}),
      scenario: () => makeGame('scenario-legacy', 'scenario', { scoringMode: 'cơ bản' }),
      race: () => makeGame('race-legacy', 'race', { scoringMode: 'thi đấu đội' }, {
        questions: [],
        race: {
          trackLength: 10, maxRounds: 4, stepByDifficulty: false, luckEnabled: false,
          teams: [{ id: 't1', name: 'Đội đỏ', icon: 't1' }, { id: 't2', name: 'Đội xanh', icon: 't2' }],
          cells: [], questions: [question('rq1')]
        }
      }),
      blank: () => makeGame('quiz-blank', 'quiz', { pointsPerCorrect: '100', duration: '20' })
    };

    const readField = () => {
      const field = document.getElementById('answerModeField');
      const select = document.getElementById('editAnswerMode');
      const shown = !!field && !field.classList.contains('hidden') &&
        window.getComputedStyle(field).display !== 'none';
      return {
        hasField: !!field,
        shown,
        values: select ? Array.prototype.slice.call(select.options).map(o => o.value) : [],
        labels: select ? Array.prototype.slice.call(select.options).map(o => o.text) : [],
        selected: select ? select.value : null,
        hint: field && field.querySelector('.field-hint') ? field.querySelector('.field-hint').textContent : '',
        // Hai trường này là diagnostic: một lần đỏ phải nói được trang soạn thảo có mở
        // thật không, chứ không chỉ "select trống".
        editorOpen: !!document.querySelector('.editor-page'),
        hasSaveBtn: !!document.getElementById('saveGameBtn')
      };
    };

    const open = async game => {
      document.getElementById('modalRoot').innerHTML = '';
      if (typeof closeEditorPage === 'function') closeEditorPage();
      if (!game) return { error: 'no game to open' };
      openEditor(JSON.parse(JSON.stringify(game)), false, 'test');
      await sleep(320);
      return readField();
    };

    const stored = async key => {
      const lib = await window.eduGame.getLibrary();
      const game = (lib.games || []).find(g => g.title === title(key));
      return game ? {
        scoringMode: game.gameSetup ? game.gameSetup.scoringMode : null,
        hasPark: !!game.gameSetup && Object.prototype.hasOwnProperty.call(game.gameSetup, 'legacyScoringMode'),
        park: game.gameSetup ? game.gameSetup.legacyScoringMode : null,
        game: game
      } : null;
    };

    // Mở lại đúng bản ghi vừa lưu, với id MỚI để lần lưu kế tiếp không đè lên nó.
    const reopen = async key => {
      const record = await stored(key);
      if (!record || !record.game) return null;
      return open(Object.assign({}, record.game, { id: 'am-' + RUN + '-' + key + '-reopen' }));
    };

    // Lưu THẬT qua nút Lưu: giá trị phải đi qua DOM rồi xuống SQLite. Tham số source nói rõ
    // trang nào phải mở trước khi lưu, nên không lần nào phụ thuộc trạng thái trang cũ.
    const save = async (name, pick, source) => {
      const field = source && source.storedKey
        ? await reopen(source.storedKey)
        : await open(source && source.fixture);
      if (!field || !field.hasSaveBtn) return { error: 'the editor page did not open', field: field };
      const titleField = document.getElementById('editTitle');
      if (titleField) titleField.value = title(name);
      const select = document.getElementById('editAnswerMode');
      if (select && pick !== null) {
        select.value = pick;
        if (select.value !== pick) return { error: 'pick refused: no such option', field: readField() };
        select.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (pick !== null) {
        return { error: 'no select on this page', field: readField() };
      }
      await sleep(150);
      document.getElementById('saveGameBtn').click();
      await sleep(1200);
      const record = await stored(name);
      return record || { error: 'the save did not reach the library', field: readField() };
    };

    const run = async () => {
      // ---- A. trang Tạo nhanh: đúng ba cách trả lời, mặc định Thi đấu ----------
      document.querySelector('.nav-item[data-page="create"]')?.click();
      await sleep(400);
      const createSelect = document.getElementById('setupScoringMode');
      out.create.found = !!createSelect;
      out.create.values = createSelect ? Array.prototype.slice.call(createSelect.options).map(o => o.value) : [];
      out.create.labels = createSelect ? Array.prototype.slice.call(createSelect.options).map(o => o.text) : [];
      out.create.selected = createSelect ? createSelect.value : null;

      // ---- B. trình soạn thảo theo từng thể loại -------------------------------
      for (const key of ['quiz', 'matching', 'treasure', 'scenario', 'race']) {
        out.editor[key] = await open(FIX[key]());
      }

      // ---- C. game cũ: mở ra là "Giữ hành vi hiện tại", lưu đi không đổi gì ----
      out.saved.legacyUntouched = await save('quiz-legacy', null, { fixture: FIX.quiz() });

      // ---- D. chọn Luyện tập: token xuống đĩa, giá trị cũ được cất, đọc lại ----
      out.saved.practicePick = await save('quiz-practice', TOKEN_PRACTICE, { fixture: FIX.quiz() });
      out.editor.reopenedPractice = await reopen('quiz-practice');

      // ---- E. "Giữ hành vi hiện tại" hoàn nguyên ĐÚNG 'tốc độ' ------------------
      out.saved.keepRestored = await save('quiz-restored', '', { storedKey: 'quiz-practice' });

      // ---- F. game chưa từng cất chế độ nào (kiểu Kho báu): cất = dấu '' --------
      out.saved.blankPark = await save('quiz-blank-parked', TOKEN_CHALLENGE, { fixture: FIX.blank() });
      out.editor.blankParkField = await reopen('quiz-blank-parked');
      out.saved.blankKeep = await save('quiz-blank-kept', '', { storedKey: 'quiz-blank-parked' });

      // ---- G. Ghép cặp: không bao giờ nhận token, dù select bị set bằng JS ------
      out.saved.matching = await save('match-token', TOKEN_PRACTICE, { fixture: FIX.matching() });

      document.getElementById('modalRoot').innerHTML = '';
      if (typeof closeEditorPage === 'function') closeEditorPage();

      // Không để fixture lại trong kho của giáo viên.
      const all = await window.eduGame.getLibrary();
      const mine = (all.games || []).filter(g => String(g.title || '').indexOf(PREFIX) === 0).map(g => g.id);
      out.cleanup = { deleted: mine.length, left: mine.length };
      if (mine.length && typeof window.eduGame.deleteGames === 'function') {
        await window.eduGame.deleteGames(mine);
        const after = await window.eduGame.getLibrary();
        out.cleanup.left = (after.games || []).filter(g => String(g.title || '').indexOf(PREFIX) === 0).length;
      }
    };

    try {
      await run();
      out.done = true;
    } catch (error) {
      out.fatal = String(error && error.message || error);
      out.fatalStack = String(error && error.stack || '').slice(0, 400);
    }
    return out;
  })()`);

  const MODE_TOKENS = ['tra-loi:thi-dau', 'tra-loi:luyen-tap', 'tra-loi:thu-thach'];
  const isToken = value => typeof value === 'string' && value.indexOf('tra-loi:') === 0;
  // Một bản ghi lưu gồm cả object game; chỉ in phần chữ ký để log đọc được.
  const brief = record => record === null || record === undefined ? String(record)
    : JSON.stringify({ error: record.error, scoringMode: record.scoringMode, hasPark: record.hasPark, park: record.park });
  // CRITICAL: một lần lưu lỗi trả về `{ error, field }`, trong đó scoringMode/park ĐỀU
  // undefined — đúng giá trị mà kiểm tra "không còn mode nào" vẫn so sánh. Không chặn
  // lại thì lỗi harness thành một lần xanh thật (đã xảy ra ở mục F của bản trước).
  const saved = record => Boolean(record) && !record.error ? record : null;

  if (report.fatal) console.log('FATAL ' + report.fatal + '\n' + report.fatalStack);

  check('the page probe ran to completion', Boolean(report.done), report.fatal || 'ok');

  // A. trang Tạo
  check('create page renders the answer-mode select', Boolean(report.create?.found), JSON.stringify(report.create));
  check('create page offers exactly the three answer modes',
    JSON.stringify(report.create?.values) === JSON.stringify(MODE_TOKENS),
    JSON.stringify(report.create?.values));
  check('create page labels them in Vietnamese',
    JSON.stringify(report.create?.labels) === JSON.stringify(['Thi đấu', 'Luyện tập', 'Thử thách']),
    JSON.stringify(report.create?.labels));
  check('a new game defaults to Thi đấu', report.create?.selected === MODE_TOKENS[0], String(report.create?.selected));

  // B. trình soạn thảo theo thể loại
  for (const template of ['quiz', 'treasure', 'scenario', 'race']) {
    const field = report.editor?.[template];
    check(template + ' editor page really opened',
      Boolean(field?.editorOpen && field?.hasSaveBtn && field?.hasField), JSON.stringify(field));
    check(template + ' editor shows the "Cách trả lời" field', Boolean(field?.shown), JSON.stringify(field));
    check(template + ' editor lists a legacy entry first for an old game',
      Boolean(field?.values?.length === 4 && field.values[0] === ''), JSON.stringify(field?.values));
    check(template + ' editor selects "Giữ hành vi hiện tại" on a legacy game',
      field?.selected === '', JSON.stringify(field?.selected));
    check(template + ' editor hint names the points source',
      Boolean(field?.hint && field.hint.indexOf('Điểm mỗi câu') !== -1), String(field?.hint).slice(0, 90));
  }
  const matchField = report.editor?.matching;
  check('matching editor page really opened',
    Boolean(matchField?.editorOpen && matchField?.hasSaveBtn && matchField?.hasField), JSON.stringify(matchField));
  check('matching keeps the field hidden (its own pairing law)',
    Boolean(matchField?.hasField) && matchField.shown === false, JSON.stringify(matchField));
  // Một select ẩn vẫn phải liệt kê ĐỦ ba cách trả lời (không bắt buộc đúng ba: Ghép cặp
  // không có chế độ nào để hoàn nguyên nên hàng "Giữ hành vi" được phép đứng đó).
  check('the hidden matching field still lists the three modes',
    MODE_TOKENS.every(token => (matchField?.values || []).includes(token)), JSON.stringify(matchField?.values));

  // C. game cũ đi qua lần lưu đầu tiên mà không đổi gì
  const legacy = saved(report.saved?.legacyUntouched);
  check('legacy game is found after saving', Boolean(legacy), brief(report.saved?.legacyUntouched));
  check('legacy game keeps its ' + "'tốc độ'" + ' scoring mode', legacy?.scoringMode === 'tốc độ', String(legacy?.scoringMode));
  check('legacy game gains no answer-mode token', isToken(legacy?.scoringMode) === false, String(legacy?.scoringMode));
  check('legacy game gains no parked key', legacy?.hasPark === false, JSON.stringify(legacy?.park));

  // D. chọn một chế độ: token xuống đĩa, giá trị cũ được cất
  const practice = saved(report.saved?.practicePick);
  check('picking Luyện tập stores the token', practice?.scoringMode === MODE_TOKENS[1], brief(report.saved?.practicePick));
  check('picking Luyện tập parks the mode it replaced', practice?.park === 'tốc độ', String(practice?.park));
  check('the reopened editor reads the pick back', report.editor?.reopenedPractice?.selected === MODE_TOKENS[1],
    JSON.stringify(report.editor?.reopenedPractice?.selected));
  check('the reopened editor still offers "Giữ hành vi hiện tại"',
    report.editor?.reopenedPractice?.values?.[0] === '' && report.editor?.reopenedPractice?.values?.length === 4,
    JSON.stringify(report.editor?.reopenedPractice?.values));

  // E. hoàn nguyên
  const restored = saved(report.saved?.keepRestored);
  check('"Giữ hành vi hiện tại" gives ' + "'tốc độ'" + ' back exactly', restored?.scoringMode === 'tốc độ', brief(report.saved?.keepRestored));
  check('restoring drops the parked value instead of leaving it as noise', restored?.hasPark === false, brief(report.saved?.keepRestored));

  // F. game chưa từng cất chế độ nào (đường của Kho báu)
  const parked = saved(report.saved?.blankPark);
  check('a game with no stored mode still parks a marker', parked?.hasPark === true, brief(report.saved?.blankPark));
  check('the marker is the empty value, not an invented mode', parked?.park === '', JSON.stringify(parked?.park));
  check('the legacy entry stays selectable after that pick',
    report.editor?.blankParkField?.values?.[0] === '' && report.editor?.blankParkField?.values?.length === 4,
    JSON.stringify(report.editor?.blankParkField?.values));
  const blankKeep = saved(report.saved?.blankKeep);
  check('the save that switches back reaches the library', Boolean(blankKeep), brief(report.saved?.blankKeep));
  check('switching it back stores no mode at all', Boolean(blankKeep) && blankKeep.scoringMode === undefined,
    brief(report.saved?.blankKeep));
  check('switching it back drops the parked marker too', blankKeep?.hasPark === false, brief(report.saved?.blankKeep));

  // G. Ghép cặp không nhận token, bàn ghép vẫn còn
  const matching = saved(report.saved?.matching);
  check('matching game is found after saving', Boolean(matching), brief(report.saved?.matching));
  check('matching never keeps an answer-mode token', Boolean(matching) && isToken(matching.scoringMode) === false,
    String(matching?.scoringMode));
  check('matching keeps its board through the same save',
    (matching?.game?.matchingGame?.pairs || []).length >= 2,
    String((matching?.game?.matchingGame?.pairs || []).length));

  check('the fixtures are removed from the library again', report.cleanup?.left === 0, JSON.stringify(report.cleanup));

  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
  // Đóng socket代替 process.exit(): exit cắt mất phần đuôi đã buffer khi log được
  // redirect, còn socket mở thì tiến trình treo sau khi in xong (rc=124 đã đo).
  try { ctx.ws.close(); } catch (error) { /* đã đóng */ }
  process.exitCode = failed ? 1 : 0;
})();
