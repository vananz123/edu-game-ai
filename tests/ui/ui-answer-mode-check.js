// ui-answer-mode-check.js — #209: trường "Cách trả lời" trong trang Tạo nhanh và
// trong trình soạn thảo, tính trên APP THẬT đã build.
//
// Lý do phải chạy thật: nửa DOM của #209 không có harness trong Node. `saveEditedGame`
// dựng lại game TỪNG TRƯỜNG một từ DOM, nên một select thiếu trong trang là một giá trị
// bị xoá âm thầm ở lần lưu đầu tiên — đúng loại lỗi unit test không nhìn thấy
// (xem docs/DECISIONS.md #65 cho cùng cơ chế ở ảnh minh hoạ).
//
// Bốn điều bài này chốt:
//  1. trang Tạo và trình soạn thảo hiện ĐÚNG ba cách trả lời (Thi đấu/Luyện tập/Thử thách);
//  2. game cũ vẫn mang luật cũ: mở ra là "Giữ hành vi hiện tại", lưu đi không đổi gì;
//  3. chọn một chế độ rồi mở lại thì lựa chọn còn nguyên, giá trị cũ được cất trong
//     `legacyScoringMode` và "Giữ hành vi hiện tại" hoàn nguyên ĐÚNG giá trị đó.
//  4. (task 3) máy trạng thái trả lời dùng chung `game-engine/answer-flow.js` được TRANG
//     thật nạp — unit test chỉ chứng minh tệp chạy được bằng `require` ở Node.
//  5. (task 4) MÀN CHƠI THẬT HÀNH ĐỘNG theo vòng trả lời: mục I bấm nút thật trên trang
//     chơi và đo DOM — lưới có tắt không, đáp án có hiện không, điểm nào xuống bảng,
//     máy chiếu có giữ kín như màn chính không, và rubric Tình huống còn nguyên không.
//  6. (task 5) mục J làm đúng việc đó cho KHO BÁU: bốn loại tương tác thật của chặng
//     (trắc nghiệm, ghép cặp, phân loại, giải mã) nhân ba chế độ CỘNG một game cũ, đo cả
//     ngân sách lượt của chặng, điểm thực nhận sau phạt, và ba khoản thưởng không bị phạt.
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

  const PAGE = `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // KHÔNG được viết dấu CHÉO nào trong payload này: nó đi qua một template literal của
    // Node nên escape bị nấu mất trước khi tới trang, và một lớp khoảng trắng thành
    // chữ 's' — helper dưới sẽ ăn chữ 's' của mọi chuỗi đọc từ DOM. Dựng lớp khoảng
    // trắng bằng mã ký tự nên nó đứng nguyên sau khi nấu.
    const wsRun = new RegExp('[' + String.fromCharCode(9, 10, 11, 12, 13, 32, 160) + ']+', 'g');
    const text = el => el ? String(el.textContent).replace(wsRun, ' ').trim() : '';
    // Đóng màn chơi đang mở. Hai mục chơi thật (I và J) đều cần, và mỗi mục phải tự
    // đóng trước khi mở bản kế tiếp — playGame đè state.currentGame chứ không dọn.
    const closePlay = async () => {
      const closer = document.querySelector('[data-play-close]');
      if (closer) closer.click();
      await sleep(220);
      document.getElementById('modalRoot').innerHTML = '';
    };
    const TOKEN_PRACTICE = 'tra-loi:luyen-tap';
    const TOKEN_CHALLENGE = 'tra-loi:thu-thach';
    const out = { editor: {}, saved: {}, create: {}, playSeq: 0 };
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

      // ---- H. máy trạng thái dùng chung (task 3) phải sống NGAY TRONG TRANG -----
      // Unit test nạp dist bằng require, nên nó KHÔNG chứng minh được điều task 4-6
      // cần: index.html có thật sự nạp tệp đó trước mọi trò chơi hay không. Một global
      // thiếu ở đây là ReferenceError khi học sinh bấm câu đầu tiên.
      // (Không được viết dấu back-tick trong các comment nằm trong chuỗi evaluate.)
      try {
        const rows = [];
        const practice = beginAnswerTurn({ id: 'h1', points: 100 }, { scoringMode: TOKEN_PRACTICE }, { template: 'quiz' });
        registerAnswer(practice, { correct: false, points: 0 });
        registerAnswer(practice, { correct: true, points: 100 });
        const challenge = beginAnswerTurn({ id: 'h2', points: 100 }, { scoringMode: TOKEN_CHALLENGE }, { template: 'quiz' });
        registerAnswer(challenge, { correct: false, points: 0 });
        const legacy = beginAnswerTurn({ id: 'h3', points: 100 }, { scoringMode: 'tốc độ' }, { template: 'quiz' });
        registerAnswer(legacy, { correct: true, points: 120 });
        commitAnswerRecord(rows, practice);
        out.flow = {
          missing: ['beginAnswerTurn', 'registerAnswer', 'endAnswerTurn', 'answerTurnRecord',
            'commitAnswerRecord', 'answerTurnAward'].filter(name => typeof window[name] !== 'function'),
          practice: { mode: practice.mode, points: practice.points, attempts: practice.attempts, done: practice.finished, reveal: practice.revealCorrect },
          challenge: { reveal: challenge.revealCorrect, explanation: challenge.explanationAvailable, locked: challenge.locked },
          legacy: { mode: legacy.mode, points: legacy.points },
          once: { rows: rows.length, again: commitAnswerRecord(rows, practice).committed, points: rows[0] && rows[0].points }
        };
      } catch (error) {
        // Một trang thiếu global phải hiện ra trong báo cáo chứ không cắt mất phần sau.
        out.flow = { error: String(error && error.message || error), missing: ['threw'] };
      }

      /* ---- I. CHƠI THẬT: màn chơi có hành động ĐÚNG theo vòng hay không (task 4) ----
         Mục H gọi máy trạng thái trực tiếp, nên nó không trả lời được điều task 4
         thực sự đổi: DOM của trang chơi. Bốn thứ chỉ nhìn thấy ở đây — nút có tắt
         sau câu cuối, đáp án có hiện hay KHÔNG hiện, điểm nào xuống bảng, và một câu
         có đúng MỘT dòng. Một global thiếu cũng hiện ra ngay thành ReferenceError. */
      try {
        const TOKEN_COMPETITIVE = 'tra-loi:thi-dau';
        const snap = () => {
          const grid = Array.prototype.slice.call(document.querySelectorAll('.answer-option'));
          const fb = document.querySelector('#answerFeedback');
          const next = document.querySelector('#nextQuestionBtn');
          const turn = state.answerTurn;
          return {
            mode: turn ? turn.mode : null,
            open: turn ? !turn.finished : null,
            retry: turn ? turn.retryAllowed : null,
            locked: Boolean(state.answerLocked),
            rows: state.gameAnswers.length,
            points: state.gameAnswers.reduce((sum, row) => sum + (Number(row.points) || 0), 0),
            last: state.gameAnswers.length ? state.gameAnswers[state.gameAnswers.length - 1] : null,
            lastPts: state.gameAnswers.length ? Number(state.gameAnswers[state.gameAnswers.length - 1].points) : null,
            // Một dòng cho MỘT câu: bao nhiêu dòng đã TRÙNG questionId. Set đo bằng
            // size chứ không phải length — viết sai thì ra NaN, JSON hoá thành null.
            dupes: state.gameAnswers.length
              - new Set(state.gameAnswers.map(row => String(row.questionId))).size,
            reveal: grid.filter(btn => btn.classList.contains('correct')).map(btn => btn.dataset.answer),
            marked: grid.filter(btn => btn.classList.contains('wrong')).map(btn => btn.dataset.answer),
            clickable: grid.filter(btn => !btn.disabled).length,
            feedback: fb ? String(fb.textContent).trim() : '',
            nextShown: Boolean(next) && !next.classList.contains('hidden'),
            nextLabel: next ? String(next.textContent).trim() : '',
            tip: document.querySelector('.stage-tip') ? String(document.querySelector('.stage-tip').textContent).trim() : '',
            index: state.gameIndex,
            house: state.houseBuild ? state.houseBuild.parts + '/' + state.houseBuild.correct + '/' + state.houseBuild.wrong : null,
            steps: state.scenarioSteps,
            /* Máy chiếu đọc buildQuizView() (result-screen.js) — cùng nguồn dữ liệu
               mà cửa sổ trình chiếu render. Nếu bảng chiếu tô đáp án khi Thử thách
               đòi giữ kín thì giáo viên lộ đáp án trước cả lớp, nên đo thẳng cái
               mà màn chiếu sẽ hiển thị chứ không suy từ DOM màn chính. */
            projection: typeof buildQuizView === 'function' ? (function () {
              const view = buildQuizView();
              return view ? {
                revealed: view.revealed,
                right: view.correctOptionId === undefined ? 'none' : view.correctOptionId,
                why: String(view.explanation || '')
              } : null;
            })() : 'no buildQuizView'
          };
        };
        const stopPlay = async () => {
          const closeBtn = document.querySelector('[data-play-close]');
          if (closeBtn) closeBtn.click();
          await sleep(220);
          document.getElementById('modalRoot').innerHTML = '';
        };
        // Mỗi lần chơi một bản sao MỚI: playGame đọc trực tiếp object nên không được
        // để hai màn chơi cùng chia một mảng questions (state.currentGame giữ nguyên nó).
        const play = async game => {
          await stopPlay();
          const copy = JSON.parse(JSON.stringify(game));
          copy.id = 'am-' + RUN + '-play-' + (++out.playSeq);
          playGame(copy);
          await sleep(700);
          return snap();
        };
        const click = async optionId => {
          const btn = Array.prototype.slice.call(document.querySelectorAll('.answer-option'))
            .find(item => item.dataset.answer === optionId);
          if (!btn) return { error: 'no option button ' + optionId };
          btn.click();
          await sleep(260);
          return snap();
        };
        const pressNext = async () => {
          const next = document.querySelector('#nextQuestionBtn');
          if (!next || next.classList.contains('hidden')) return { error: 'the next button is not on screen' };
          next.click();
          await sleep(560);
          return snap();
        };
        out.play = {};
        // Đấu trường: một quiz 'tốc độ' (game cũ) và ba bản chỉ khác nhau ở token.
        const quizBase = FIX.quiz();
        const quizWith = key => {
          const g = JSON.parse(JSON.stringify(quizBase));
          g.title = title(key);
          if (key.indexOf('legacy') === -1) {
            g.gameSetup.scoringMode = key.indexOf('competitive') === 0 ? TOKEN_COMPETITIVE
              : key.indexOf('practice') === 0 ? TOKEN_PRACTICE : TOKEN_CHALLENGE;
          }
          return g;
        };
        const houseWith = key => {
          const g = quizWith(key);
          g.gameSetup.gameplayMode = 'house';
          return g;
        };

        // 1. game CŨ: +5 điểm nhanh còn NGUYÊN, sai vẫn mở đáp án, một dòng.
        await play(quizWith('legacy-a'));
        out.play.legacyCorrect = await click('a');
        await play(quizWith('legacy-b'));
        out.play.legacyWrong = await click('b');

        // 2. Thi đấu: phần thưởng nhanh biến mất (luật mới không kèm bonus), còn lại
        //    giống hệt game cũ — đúng điều chủ dự án chốt cho chế độ mặc định.
        await play(quizWith('competitive-wrong'));
        out.play.competitiveWrong = await click('b');

        // 3. Luyện tập: sai KHÔNG mở đáp án, được bấm tiếp, chưa có dòng điểm; đúng
        //    thì nhận 90 = 100 trừ 10% trần của CHÍNH câu đó, và chỉ MỘT dòng.
        await play(quizWith('practice-retry'));
        out.play.practiceMiss = await click('b');
        out.play.practiceHit = await click('a');
        // 3b. Lối thoát cho cả lớp: đang thử lại mà bấm "Bỏ qua" thì câu khép lại,
        //     0 điểm, và màn chơi đi tiếp thay vì kẹt mãi ở một câu quá khó.
        await play(quizWith('practice-skip'));
        out.play.practiceSkipMiss = await click('b');
        out.play.practiceSkip = await pressNext();

        // 4. Thử thách: sai thì GIỮ KÍN đáp án và lời giải; đúng thì cả hai mở.
        await play(quizWith('challenge-wrong'));
        out.play.challengeWrong = await click('b');
        await play(quizWith('challenge-correct'));
        out.play.challengeCorrect = await click('a');

        // 5. Xây nhà: một câu chỉ ĐỔI MỘT phần nhà. Cú sai của Luyện tập chưa khép
        //    vòng nên chưa được xây (hay trừ) gì; Thử thách thì câu sai trừ 1 như cũ.
        await play(houseWith('practice-house'));
        out.play.houseMiss = await click('b');
        out.play.houseHit = await click('a');
        await play(houseWith('challenge-house'));
        out.play.houseChallenge = await click('b');

        // 6. Tình huống: rubric KHÔNG đổi (quyết định chưa tối ưu vẫn 45/100), không
        //    bao giờ tô "quyết định đúng", và lời giải là thứ duy nhất ba mode sai khác.
        const scenarioBase = {
          id: 'am-scenario-base', title: title('scenario-play'), subject: 'Tự nhiên', grade: '3',
          template: 'scenario', description: '', tags: [], sourceName: 'ui-check',
          createdAt: '2026-01-01T00:00:00.000Z', gameSetup: { scoringMode: 'cơ bản' },
          questions: [
            {
              id: 'sc1', type: 'scenario', points: 100, correctOptionId: 'safe',
              prompt: 'Dây phích cắm sạc hở điện ngay giữa lớp. Em làm gì?',
              context: 'Giờ ra chơi, cả lớp đang ở lại.',
              correctAnswer: '', explanation: 'Báo thầy cô rồi mới rút phích.',
              discussionPrompt: 'Vì sao không tự rút khi dây còn ướt?',
              options: [
                { id: 'safe', text: 'Báo thầy cô trước khi động vào', feedback: 'An toàn nhất.', scenarioScore: { safety: 60, reasoning: 25, harmReduction: 15 } },
                { id: 'risk', text: 'Tự rút phích cắm cho nhanh', feedback: 'Còn rủi ro.', scenarioScore: { safety: 30, reasoning: 10, harmReduction: 5 } }
              ]
            },
            { id: 'sc2', type: 'scenario', points: 100, correctOptionId: 'safe', prompt: 'Bạn em chạm vào quạt đang chạy. Em làm gì?',
              context: '', correctAnswer: '', explanation: 'Tắt cầu giao trước.',
              options: [
                { id: 'safe', text: 'Nhắc bạn tránh ra và báo cô', feedback: 'Đúng.', scenarioScore: { safety: 60, reasoning: 25, harmReduction: 15 } },
                { id: 'risk', text: 'Kéo quạt ra khỏi bàn', feedback: 'Chưa hẳn an toàn.', scenarioScore: { safety: 40, reasoning: 10, harmReduction: 5 } }
              ] }
          ]
        };
        const scenarioWith = key => {
          const g = JSON.parse(JSON.stringify(scenarioBase));
          g.title = title(key);
          if (key.indexOf('legacy') !== 0) {
            g.gameSetup.scoringMode = key.indexOf('competitive') === 0 ? TOKEN_COMPETITIVE
              : key.indexOf('practice') === 0 ? TOKEN_PRACTICE : TOKEN_CHALLENGE;
          }
          return g;
        };
        await play(scenarioWith('legacy-scenario'));
        out.play.scenarioLegacyMiss = await click('risk');
        await play(scenarioWith('challenge-scenario'));
        out.play.scenarioChallengeMiss = await click('risk');
        await play(scenarioWith('practice-scenario'));
        out.play.scenarioPracticeMiss = await click('risk');
        out.play.scenarioPracticeHit = await click('safe');
        // Sang câu bằng nút phải đi qua đúng một lần: một dòng cho một tình huống.
        await play(scenarioWith('legacy-scenario-next'));
        out.play.scenarioBefore = await click('risk');
        out.play.scenarioAdvance = await pressNext();
        await stopPlay();
      } catch (error) {
        // Màn chơi lỗi giữa chừng cũng phải hiện ra trong báo cáo, không cắt phần sau.
        out.play = { error: String(error && error.message || error) };
        try {
          await stopPlay();
        } catch (ignored) {
          out.play.cleanupFailed = true;
        }
      }

      /* ---- J. KHO BÁU chơi thật (nhiệm vụ 5) ----------------------------------
         Bốn thứ chỉ nhìn thấy ở đây, không thấy ở unit test:
          • thẻ ghép / mục phân loại có bị sơn "đúng" khi Thử thách đòi giữ kín không;
          • ô Giải mã có IN đáp án đúng ra bảng khi chế độ không mở đáp án hay không;
          • dòng điểm xuống bảng là số THỰC NHẬN (sau phạt) hay số trong dữ liệu chặng;
          • thưởng hoàn thành chặng và vật phẩm ẩn có bị Luyện tập trừ oan hay không.
         Một chặng = MỘT dòng: rows/dupes đo trực tiếp trên state.treasurePlay.results,
         tức đúng mảng mà bản đồ hành trình và màn kết quả đọc. */
      try {
        const TOKEN_COMPETITIVE = 'tra-loi:thi-dau';
        const stage = (index, overrides) => Object.assign({
          id: 't' + index, name: 'Chặng ' + index,
          story: 'Chuyện tổng hợp.', taskDescription: 'Nhiệm vụ tổng hợp.',
          question: {
            prompt: 'Một cộng một bằng mấy?',
            options: [{ id: 'a', text: 'Hai' }, { id: 'b', text: 'Ba' }],
            correctOptionId: 'a', explanation: 'Bằng hai.', hint: 'Đếm trên ngón tay.'
          },
          attempts: 2, points: 100, completionBonus: 50, hasHiddenItem: false
        }, overrides || {});
        const treasureGame = (key, mode, stages) => ({
          id: 'am-treasure-base', title: title(key), subject: 'Tự nhiên', grade: '3',
          template: 'treasure-hunt', description: '', tags: [], sourceName: 'ui-check',
          createdAt: '2026-01-01T00:00:00.000Z',
          gameSetup: mode === null ? {} : { scoringMode: mode },
          questions: [],
          treasureHunt: {
            character: 'Nhà thám hiểm An', intro: 'Hành trình tổng hợp.',
            journeyBonus: 100, hiddenItemBonus: 20, backgroundId: 'temple',
            characterId: 'explorer', stages
          }
        });
        const tsnap = () => {
          const tp = state.treasurePlay;
          const turn = tp ? tp.answerTurn : null;
          const rows = tp && tp.results ? tp.results : [];
          const options = Array.prototype.slice.call(document.querySelectorAll('.answer-option'));
          const left = Array.prototype.slice.call(document.querySelectorAll('[data-match-left]'));
          const right = Array.prototype.slice.call(document.querySelectorAll('[data-match-right]'));
          const items = Array.prototype.slice.call(document.querySelectorAll('[data-class-item]'));
          const input = document.querySelector('#treasureDecodeInput');
          return {
            mode: turn ? turn.mode : null,
            retry: turn ? turn.retryAllowed : null,
            reveal: turn ? Boolean(turn.revealCorrect) : null,
            explain: turn ? Boolean(turn.explanationAvailable) : null,
            stageId: tp ? tp.stageId : null,
            answered: tp ? Boolean(tp.answered) : null,
            earned: tp ? Number(tp.earned) : null,
            tries: tp ? Number(tp.attemptsLeft) : null,
            rows: rows.length,
            lastPts: rows.length ? Number(rows[rows.length - 1].points) : null,
            lastCorrect: rows.length ? Boolean(rows[rows.length - 1].correct) : null,
            dupes: rows.length - new Set(rows.map(row => String(row.stageId))).size,
            optClick: options.filter(b => !b.disabled).length,
            optMarked: options.filter(b => b.classList.contains('wrong')).map(b => b.dataset.answer),
            optRevealed: options.filter(b => b.classList.contains('correct')).map(b => b.dataset.answer),
            matchDone: left.filter(b => b.classList.contains('matched')).length,
            matchShown: left.filter(b => b.classList.contains('revealed')).length,
            matchClick: left.concat(right).filter(b => !b.disabled).length,
            classPlaced: items.filter(b => b.classList.contains('placed')).length,
            classShown: items.filter(b => b.classList.contains('revealed')).length,
            classClick: items.filter(b => !b.disabled).length,
            decodeOpen: input ? !input.disabled : null,
            strip: text(document.querySelector('#treasureAttemptsHint')),
            status: text(document.querySelector('#missionStatus')),
            feedback: text(document.querySelector('#answerFeedback')),
            /* Máy chiếu đọc buildTreasureView() — nguồn dữ liệu của cửa sổ trình chiếu.
               Một màn chiếu vẽ đáp án khi Thử thách đòi giữ kín thì cả lớp thấy đáp án,
               nên đo thẳng cái màn chiếu SẼ hiện chứ không suy từ DOM màn chính. */
            projection: typeof buildTreasureView === 'function' ? (function () {
              const view = buildTreasureView();
              return view ? {
                revealed: view.revealed,
                right: view.correctOptionId === undefined ? 'none' : view.correctOptionId,
                why: String(view.explanation || ''),
                missionType: view.missionType,
                earned: view.earned
              } : null;
            })() : 'no buildTreasureView'
          };
        };
        const playTreasure = async game => {
          await closePlay();
          const copy = JSON.parse(JSON.stringify(game));
          copy.id = 'am-' + RUN + '-play-' + (++out.playSeq);
          playGame(copy);
          await sleep(700);
          return tsnap();
        };
        const wait = async ms => { await sleep(ms); return tsnap(); };
        const tap = async selector => {
          const btn = document.querySelector(selector);
          if (!btn) return { error: 'no element ' + selector };
          btn.click();
          return wait(280);
        };
        const pick = optionId => tap('.answer-option[data-answer="' + optionId + '"]');
        const pair = async (leftId, rightId) => {
          await tap('[data-match-left="' + leftId + '"]');
          return tap('[data-match-right="' + rightId + '"]');
        };
        const place = async (itemId, groupId) => {
          await tap('[data-class-item="' + itemId + '"]');
          return tap('[data-class-group="' + groupId + '"]');
        };
        const decode = async value => {
          const input = document.querySelector('#treasureDecodeInput');
          if (!input) return { error: 'no decode input' };
          input.value = value;
          return tap('#treasureDecodeSubmit');
        };
        const mc = (key, mode, overrides) => treasureGame(key, mode, [stage(1, overrides)]);
        out.treasure = {};

        // 1. KHO BÁU GAME CŨ (không token): thử tới hết attempts, cạn lượt thì MỞ đáp án.
        out.treasure.legacyOpen = await playTreasure(mc('legacy-open', null, { hasHiddenItem: true }));
        out.treasure.legacyMiss = await pick('b');
        out.treasure.legacyOut = await pick('b');
        // 2. attempts = 1: ngân sách MỘT lượt thì game cũ vẫn một lượt như Đấu trường.
        await playTreasure(mc('legacy-one', null, { attempts: 1 }));
        out.treasure.legacyOneTry = await pick('b');
        // 3. CÚ NHẤP ĐÚP sau khi chặng đã khép: không thêm dòng, không thêm điểm.
        out.treasure.legacyDouble = await pick('b');
        // 4. Thi đấu: chặng đặt 3 lượt nhưng chế độ chỉ cho MỘT lượt, và vẫn mở đáp án.
        await playTreasure(mc('competitive', TOKEN_COMPETITIVE, { attempts: 3 }));
        out.treasure.competitiveMiss = await pick('b');
        // 5. Luyện tập: sai không lộ, được thử lại, số điểm còn lại nói trước ĐÚNG số thực nhận.
        await playTreasure(mc('practice', TOKEN_PRACTICE, { attempts: 2, hasHiddenItem: true }));
        out.treasure.practiceOpen = await tsnap();
        out.treasure.practiceMiss = await pick('b');
        out.treasure.practiceHit = await pick('a');
        // 5b. vật phẩm ẩn KHÔNG nằm trong cơ số phạt: +20 đi nguyên vào tổng.
        out.treasure.practiceItem = await tap('#findItemBtn');
        // 5c. chặng 0 ĐIỂM NỘI DUNG: cơ số 0 hợp lệ nên thưởng không bị trừ gì.
        await playTreasure(mc('practice-zero', TOKEN_PRACTICE, { attempts: 2, points: 0 }));
        out.treasure.zeroMiss = await pick('b');
        out.treasure.zeroHit = await pick('a');
        // 6. Thử thách: MỘT lượt, sai thì giữ kín cả đáp án lẫn lời giải.
        await playTreasure(mc('challenge', TOKEN_CHALLENGE, { attempts: 3 }));
        out.treasure.challengeMiss = await pick('b');
        await playTreasure(mc('challenge-right', TOKEN_CHALLENGE, { attempts: 3 }));
        out.treasure.challengeHit = await pick('a');

        // 7. NHIỆM VỤ GHÉP CẶP đi qua cùng một máy.
        const MATCH = overrides => stage(1, Object.assign({
          mission: {
            type: 'matching', pairs: [
              { id: 'p1', left: 'Mặt Trời', right: 'Ban ngày' },
              { id: 'p2', left: 'Mặt Trăng', right: 'Ban đêm' }
            ]
          }
        }, overrides || {}));
        await playTreasure(treasureGame('match-practice', TOKEN_PRACTICE, [MATCH({ attempts: 3 })]));
        out.treasure.matchPracticeMiss = await pair('p1', 'p2');
        await pair('p1', 'p1');
        out.treasure.matchPracticeHit = await pair('p2', 'p2');
        await playTreasure(treasureGame('match-challenge', TOKEN_CHALLENGE, [MATCH({ attempts: 3 })]));
        out.treasure.matchChallengeMiss = await pair('p1', 'p2');
        await playTreasure(treasureGame('match-legacy', null, [MATCH({ attempts: 1 })]));
        out.treasure.matchLegacyOut = await pair('p1', 'p2');

        // 8. NHIỆM VỤ PHÂN LOẠI.
        const CLASS = overrides => stage(1, Object.assign({
          mission: {
            type: 'classification',
            groups: [{ id: 'g1', name: 'Biết bơi' }, { id: 'g2', name: 'Biết bay' }],
            items: [{ id: 'i1', text: 'Cá', groupId: 'g1' }, { id: 'i2', text: 'Gà', groupId: 'g2' }]
          }
        }, overrides || {}));
        await playTreasure(treasureGame('class-legacy', null, [CLASS({ attempts: 1 })]));
        out.treasure.classLegacyOut = await place('i1', 'g2');
        await playTreasure(treasureGame('class-practice', TOKEN_PRACTICE, [CLASS({ attempts: 2 })]));
        out.treasure.classPracticeMiss = await place('i1', 'g2');
        await place('i1', 'g1');
        out.treasure.classPracticeHit = await place('i2', 'g2');
        await playTreasure(treasureGame('class-challenge', TOKEN_CHALLENGE, [CLASS({ attempts: 2 })]));
        out.treasure.classChallengeMiss = await place('i1', 'g2');

        // 9. NHIỆM VỤ GIẢI MÃ: ô trả lời bằng text, dễ lộ đáp án nhất.
        const DECODE = overrides => stage(1, Object.assign({
          mission: { type: 'decode', cipher: 'BEN DEN', answer: 'Den Bien' }
        }, overrides || {}));
        await playTreasure(treasureGame('decode-legacy', null, [DECODE({ attempts: 2 })]));
        out.treasure.decodeLegacyMiss = await decode('abc');
        out.treasure.decodeLegacyHit = await decode('Den Bien');
        await playTreasure(treasureGame('decode-challenge', TOKEN_CHALLENGE, [DECODE({ attempts: 2 })]));
        out.treasure.decodeChallengeMiss = await decode('abc');
        await playTreasure(treasureGame('decode-competitive', TOKEN_COMPETITIVE, [DECODE({ attempts: 3 })]));
        out.treasure.decodeCompetitiveMiss = await decode('abc');
        await closePlay();
      } catch (error) {
        out.treasure = { error: String(error && error.message || error) };
        try {
          await closePlay();
        } catch (ignored) {
          out.treasure.cleanupFailed = true;
        }
      }

      /* K. ĐƯỜNG ĐUA + HỘP CHIA ĐỘI. Task 6 bỏ hẳn phần thưởng tốc độ: khi trò chạy một
         trong ba "Cách trả lời", MỘT câu đúng luôn tiến một số ô CỐ ĐỊNH — kể cả khi dữ
         liệu còn bật "Tiến theo độ khó". Game chưa từng đổi cách trả lời vẫn đi theo độ
         khó y như hôm qua, và ô đặc biệt trên bàn cờ là DỮ LIỆU chặng nên đứng ngoài quy
         tắc này. K2 bấm THẬT vào hộp chia đội của một game mang token: con đường đó đi
         qua trường 'players', không qua 'scoringMode', nên sau #209 nó phải còn sống —
         bằng chứng trước đây chỉ là đọc code. */
      try {
        const TOKEN_COMPETITIVE = 'tra-loi:thi-dau';
        const rq = (id, difficulty) => Object.assign(question(id), { difficulty });
        // mode === null nghĩa là game CŨ: scoringMode Việt, không token nào.
        const raceGame = (key, mode, overrides) => ({
          id: 'am-' + RUN + '-' + key, title: title(key), subject: 'Tự nhiên', grade: '3',
          template: 'race', description: '', tags: [], sourceName: 'ui-check',
          createdAt: '2026-01-01T00:00:00.000Z',
          gameSetup: mode === null ? { scoringMode: 'thi đấu đội' } : { scoringMode: mode },
          questions: [],
          race: Object.assign({
            trackLength: 12, maxRounds: 4, stepByDifficulty: false, luckEnabled: false,
            teams: [{ id: 't1', name: 'Đội đỏ', icon: 'A' }, { id: 't2', name: 'Đội xanh', icon: 'B' }],
            cells: [], questions: [rq('rq1', 'trung bình')]
          }, overrides || {})
        });
        const rsnap = () => {
          const rp = state.racePlay;
          const turn = rp ? rp.answerTurn : null;
          const options = Array.prototype.slice.call(document.querySelectorAll('.answer-option'));
          const strip = s => Array.prototype.slice.call(s).map(text).join(' | ');
          return {
            mode: turn ? turn.mode : null,
            retry: turn ? turn.retryAllowed : null,
            reveal: turn ? Boolean(turn.revealCorrect) : null,
            explain: turn ? Boolean(turn.explanationAvailable) : null,
            wrongs: turn ? Number(turn.wrongAttempts) : null,
            turns: turn ? Number(turn.attempts) : null,
            turnPts: turn ? Number(turn.points) : null,
            ceiling: turn ? Number(turn.maxPoints) : null,
            qid: turn ? String(turn.questionId) : null,
            answered: rp ? Boolean(rp.answered) : null,
            over: rp ? Boolean(rp.over) : null,
            round: rp ? Number(rp.round) : null,
            turnIndex: rp ? Number(rp.turn) : null,
            used: rp ? rp.usedQ.length : null,
            correctCount: rp ? Number(rp.correctCount) : null,
            progress: rp ? rp.teams.map(t => Number(t.progress)) : null,
            points: rp ? rp.teams.map(t => Number(t.points)) : null,
            optClick: options.filter(b => !b.disabled).length,
            optMarked: options.filter(b => b.classList.contains('wrong')).map(b => b.dataset.raceAnswer),
            optRevealed: options.filter(b => b.classList.contains('correct')).map(b => b.dataset.raceAnswer),
            pill: text(document.querySelector('.race-rule-pill')),
            kicker: text(document.querySelector('.race-turn .stage-kicker')),
            /* #answerFeedback của Đường đua in rp.lastEvent — câu chữ mà cả lớp nghe
               MC đọc to, nên nó là nơi "tiến mấy ô" phải ĐÚNG, không chỉ là số trong state. */
            feedback: text(document.querySelector('#answerFeedback')),
            drawn: strip(document.querySelectorAll('#raceSideFeedback .feedback')),
            drawShown: Boolean(document.querySelector('#drawQuestionBtn')),
            giveUpShown: Boolean(document.querySelector('#raceNoAnswerBtn')),
            continueShown: Boolean(document.querySelector('#raceContinueBtn')),
            continueLabel: text(document.querySelector('#raceContinueBtn')),
            result: text(document.querySelector('[data-game="race"] .result-screen')),
            /* Máy chiếu của Đường đua chỉ có thể lộ đáp án nếu buildRaceView() THÊM CỜ
               đánh dấu đáp án nào đúng. Danh sách khoá + hình dạng một option là bằng
               chứng trực tiếp, không suy từ DOM màn chính. */
            projection: typeof buildRaceView === 'function' ? (function () {
              const view = buildRaceView();
              if (!view) return null;
              const keys = Object.keys(view);
              return {
                flags: keys.filter(k => k.indexOf('correct') !== -1 || k.indexOf('reveal') !== -1
                  || k.indexOf('explanation') !== -1),
                optionShape: (keys.indexOf('options') !== -1 && view.options.length)
                  ? Object.keys(view.options[0]).sort().join('+') : 'none',
                event: String(view.lastEvent || '')
              };
            })() : 'no buildRaceView'
          };
        };
        const playRace = async game => {
          await closePlay();
          const copy = JSON.parse(JSON.stringify(game));
          copy.id = 'am-' + RUN + '-play-' + (++out.playSeq);
          playGame(copy);
          await sleep(650);
          return rsnap();
        };
        const tapRace = async selector => {
          const btn = document.querySelector(selector);
          if (!btn) return { error: 'no element ' + selector };
          btn.click();
          await sleep(300);
          return rsnap();
        };
        const drawQ = () => tapRace('#drawQuestionBtn');
        const tapOpt = optionId => tapRace('.answer-option[data-race-answer="' + optionId + '"]');
        const giveUp = () => tapRace('#raceNoAnswerBtn');
        const nextTurn = () => tapRace('#raceContinueBtn');
        out.race = {};

        // 1. GAME CŨ + "Tiến theo độ khó": dễ +1, trung bình +2, khó +3 — không đổi gì.
        out.race.legacyEasyOpen = await playRace(
          raceGame('legacy-easy', null, { stepByDifficulty: true, questions: [rq('rq1', 'dễ')] }));
        out.race.legacyEasyDraw = await drawQ();
        out.race.legacyEasy = await tapOpt('a');
        await playRace(raceGame('legacy-mid', null, { stepByDifficulty: true, questions: [rq('rq1', 'trung bình')] }));
        await drawQ();
        out.race.legacyMid = await tapOpt('a');
        await playRace(raceGame('legacy-hard', null, { stepByDifficulty: true, questions: [rq('rq1', 'khó')] }));
        await drawQ();
        out.race.legacyHard = await tapOpt('a');
        // 1b. một cú nhấp thừa sau khi vòng đã khép không được cộng thêm ô nào.
        out.race.legacyDouble = await tapOpt('a');

        // 2. THI ĐẤU trên dữ liệu còn bật "Tiến theo độ khó": luật mới thắng, MỘT ô.
        await playRace(raceGame('competitive-hard', TOKEN_COMPETITIVE,
          { stepByDifficulty: true, questions: [rq('rq1', 'khó')] }));
        out.race.competitiveDraw = await drawQ();
        out.race.competitiveHard = await tapOpt('a');
        // 3. Sai ở Thi đấu: khép câu, MỞ đáp án như hôm qua, không tiến ô.
        await playRace(raceGame('competitive-miss', TOKEN_COMPETITIVE,
          { stepByDifficulty: true, questions: [rq('rq1', 'khó')] }));
        await drawQ();
        out.race.competitiveMiss = await tapOpt('b');
        out.race.competitiveDouble = await tapOpt('b');
        // 4. THỬ THÁCH: sai thì giữ kín cả đáp án lẫn lời giải, nhưng vẫn cho sang lượt.
        await playRace(raceGame('challenge-miss', TOKEN_CHALLENGE, { questions: [rq('rq1', 'trung bình')] }));
        await drawQ();
        out.race.challengeMiss = await tapOpt('b');

        // 5. LUYỆN TẬP: cú sai không tiến, không điểm, chưa rút câu khỏi ngân hàng; câu
        //    đúng sau đó chỉ còn 90 và vẫn đi MỘT ô dù độ khó là "khó".
        await playRace(raceGame('practice-hard', TOKEN_PRACTICE,
          { stepByDifficulty: true, questions: [rq('rq1', 'khó')] }));
        out.race.practiceDraw = await drawQ();
        out.race.practiceMiss = await tapOpt('b');
        out.race.practiceHit = await tapOpt('a');

        // 6. "Đội không trả lời được" = lối thoát của Luyện tập, không phải một cú sai.
        await playRace(raceGame('practice-giveup', TOKEN_PRACTICE, { questions: [rq('rq1', 'trung bình')] }));
        await drawQ();
        out.race.practiceGiveUp = await giveUp();
        // 7. Cùng nút đó trên game CŨ: trước #209 nó đã mở đáp án — phải còn nguyên.
        await playRace(raceGame('legacy-giveup', null, { questions: [rq('rq1', 'trung bình')] }));
        await drawQ();
        out.race.legacyGiveUp = await giveUp();

        // 8. Ô TĂNG TỐC là dữ liệu bàn cờ: vẫn +1 ngoài quy tắc số bước cố định. Dữ liệu
        //    VẪN bật "Tiến theo độ khó" để dải luật giữa hai lượt (chưa có vòng nào để
        //    hỏi) phải chứng minh nó nói theo LUẬT ĐANG CHẠY, không in lại cái toggle.
        await playRace(raceGame('boost', TOKEN_COMPETITIVE, {
          stepByDifficulty: true,
          cells: [{ cell: 2, type: 'boost', label: 'Tăng tốc' }], questions: [rq('rq1', 'trung bình')]
        }));
        await drawQ();
        out.race.boost = await tapOpt('a');
        // 8b. Nhịp giữa hai lượt: chưa có vòng nào nhưng dải luật đã in ra rồi.
        out.race.betweenTurns = await nextTurn();
        out.race.team2Draw = await drawQ();
        out.race.team2 = await tapOpt('a');

        // 9. Về đích: một câu đúng trên đường đua 2 ô là đủ kết thúc, màn kết quả hiện.
        await playRace(raceGame('finish', TOKEN_COMPETITIVE, {
          trackLength: 2, questions: [rq('rq1', 'trung bình')]
        }));
        await drawQ();
        out.race.finishAnswer = await tapOpt('a');
        out.race.finishResult = await nextTurn();

        // 10. MÁY CHIẾU ở lượt đang giữ kín (Thử thách) — phải mù như màn chính.
        await playRace(raceGame('challenge-projector', TOKEN_CHALLENGE, { questions: [rq('rq1', 'trung bình')] }));
        await drawQ();
        out.race.challengeProjector = await tapOpt('b');

        // ===== K2. HỘP CHIA ĐỘI của một game mang token (quiz, Luyện tập) =====
        const teamSnap = () => {
          const names = Array.prototype.slice.call(document.querySelectorAll('[data-team-name]'));
          const tp = state.teamPlay;
          const turn = state.answerTurn;
          return {
            setupShown: names.length,
            pending: state.pendingTeams ? state.pendingTeams.map(t => String(t.name)) : null,
            teams: tp ? tp.teams.map(t => String(t.name)) : null,
            points: tp ? tp.teams.map(t => Number(t.points)) : null,
            turnIndex: tp ? Number(tp.turn) : null,
            mode: turn ? turn.mode : null,
            rows: state.gameAnswers.length,
            lastPts: state.gameAnswers.length ? Number(state.gameAnswers[state.gameAnswers.length - 1].points) : null,
            token: String((state.currentGame && state.currentGame.gameSetup ? state.currentGame.gameSetup.scoringMode : '') || ''),
            chip: text(document.querySelector('.team-score-list')),
            feedback: text(document.querySelector('#answerFeedback'))
          };
        };
        const openRoster = async game => {
          await closePlay();
          const copy = JSON.parse(JSON.stringify(game));
          copy.id = 'am-' + RUN + '-play-' + (++out.playSeq);
          playGame(copy);
          await sleep(650);
          return teamSnap();
        };
        const tapById = async id => {
          const btn = document.getElementById(id);
          if (!btn) return { error: 'no element ' + id };
          btn.click();
          await sleep(320);
          return teamSnap();
        };
        const typeTeam = async (index, value) => {
          const box = document.querySelectorAll('[data-team-name]')[index];
          if (!box) return { error: 'no team name input ' + index };
          box.value = value;
          box.dispatchEvent(new Event('input', { bubbles: true }));
          await sleep(120);
          return teamSnap();
        };
        const tapQuizOption = async optionId => {
          const btn = Array.prototype.slice.call(document.querySelectorAll('.answer-option'))
            .find(item => item.dataset.answer === optionId);
          if (!btn) return { error: 'no option button ' + optionId };
          btn.click();
          await sleep(320);
          return teamSnap();
        };
        out.roster = {};
        const rosterGame = makeGame('roster-practice', 'quiz', {
          scoringMode: TOKEN_PRACTICE, players: 'đội nhóm', pointsPerCorrect: '100', duration: '20'
        });
        out.roster.setupOpen = await openRoster(rosterGame);
        out.roster.afterAdd = await tapById('addTeamBtn');
        out.roster.afterRename = await typeTeam(0, 'Đội Sao Hoả');
        out.roster.afterStart = await tapById('startTeamGameBtn');
        out.roster.afterMiss = await tapQuizOption('b');
        out.roster.afterHit = await tapQuizOption('a');
        /* Bảng điểm trên đầu màn CHỈ vẽ lại khi câu kế tiếp được dựng (teamTurnBarHtml
           nằm trong renderQuestion), nên cú nhấp này là lúc cả lớp thực sự nhìn thấy
           điểm — đo nó thay vì đo DOM ngay sau cú trả lời. */
        out.roster.afterNext = await tapById('nextQuestionBtn');
        await closePlay();
      } catch (error) {
        out.race = { error: String(error && error.message || error) };
        try {
          await closePlay();
        } catch (ignored) {
          out.race.cleanupFailed = true;
        }
      }

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
  })()`;

  // Chốt thêm: payload là một template literal, nên MỌI dấu CHÉO trong nó bị nấu mất trước
  // tới trang ("\s" chỉ còn "s"). Hậu quả thật đã xảy ra ở task 5: helper gấp khoảng trắng
  // ăn chữ 's' của mọi chuỗi đọc từ DOM, và một check đỏ mà không nói vì sao.
  const BS = String.fromCharCode(92);
  check('the in-page payload ships without a single backslash', PAGE.indexOf(BS) === -1,
    PAGE.split(BS).length - 1 + ' escape(s) cooked away before the page saw them');

  const report = await evaluate(PAGE);
  /* Chẩn đoán: AM209_DUMP=<đường dẫn> ghi toàn bộ báo cáo thô ra tệp. Một check đỏ chỉ
     in những trường mà helper rv() chọn ra, nên khi chính helper chọn sai tên trường thì
     log KHÔNG bao giờ giải thích được vì sao điều kiện đỏ — đã xảy ra ở task 6 với 15
     check Đường đua có bằng chứng in ra trông đều đúng. */
  if (process.env.AM209_DUMP)
    require('fs').writeFileSync(process.env.AM209_DUMP, JSON.stringify(report, null, 1));
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

  // H. máy trạng thái trả lời dùng chung — tồn tại và đúng NGAY TRONG TRANG chơi
  check('the answer-turn machine is loaded as page globals',
    JSON.stringify(report.flow?.missing) === '[]', JSON.stringify(report.flow || null));
  check('Luyện tập in the page charges 10% of the question, once',
    report.flow?.practice?.mode === 'practice' && report.flow?.practice?.points === 90
    && report.flow?.practice?.attempts === 2, JSON.stringify(report.flow?.practice));
  check('a retry closes the question as soon as it is right',
    report.flow?.practice?.done === true && report.flow?.practice?.reveal === true,
    JSON.stringify(report.flow?.practice));
  check('Thử thách in the page reveals nothing and earns no explanation',
    report.flow?.challenge?.reveal === false && report.flow?.challenge?.explanation === false
    && report.flow?.challenge?.locked === true, JSON.stringify(report.flow?.challenge));
  check('a legacy game pays its own score untouched by the machine',
    report.flow?.legacy?.mode === 'legacy' && report.flow?.legacy?.points === 120,
    JSON.stringify(report.flow?.legacy));
  check('one question writes one score row in the page too',
    report.flow?.once?.rows === 1 && report.flow?.once?.again === false
    && report.flow?.once?.points === 90, JSON.stringify(report.flow?.once));

  /* I. MÀN CHƠI THẬT. Từ đây về sau là những gì task 4 đổi: màn chơi phải HÀNH ĐỘNG
     theo vòng trả lời, không chỉ tính đúng. Mỗi snapshot là DOM + state sau một cú
     nhấp thật, nên một lớp sai (nút không tắt, đáp án hiện sai chỗ, điểm nhân đôi)
     hiện ra ở đây chứ không ở mục H. */
  const play = report.play || {};
  const view = s => !s ? String(s) : s.error ? JSON.stringify(s) : JSON.stringify({
    mode: s.mode, open: s.open, rows: s.rows, pts: s.points, lastPts: s.lastPts,
    reveal: s.reveal, marked: s.marked, click: s.clickable, next: s.nextLabel,
    idx: s.index, house: s.house, dupes: s.dupes
  });
  const said = s => String(s && s.feedback || '').replace(/\s+/g, ' ').slice(0, 170);
  const has = (s, text) => String(s && s.feedback || '').indexOf(text) !== -1;

  check('the play screen probes ran to completion', Boolean(play.scenarioAdvance) && !play.error,
    String(play.error || 'ok'));

  // 1+2. game CŨ đi qua máy mà không đổi hành vi: +5 nhanh, sai vẫn mở, một dòng.
  check('a legacy quiz still pays its speed bonus through the machine',
    play.legacyCorrect?.mode === 'legacy' && play.legacyCorrect?.points === 105
    && play.legacyCorrect?.lastPts === 105 && play.legacyCorrect?.rows === 1, view(play.legacyCorrect));
  check('a legacy wrong answer still reveals the right option',
    JSON.stringify(play.legacyWrong?.reveal) === JSON.stringify(['a'])
    && JSON.stringify(play.legacyWrong?.marked) === JSON.stringify(['b'])
    && play.legacyWrong?.clickable === 0 && play.legacyWrong?.rows === 1, view(play.legacyWrong));
  check('the legacy strip still promises the bonus it actually pays',
    String(play.legacyCorrect?.tip || '').indexOf('điểm thưởng') !== -1, String(play.legacyCorrect?.tip || ''));

  // 3. Thi đấu = hành vi cũ, bỏ phần thưởng nhanh (chủ dự án: "gần với hành vi hiện tại").
  check('Thi đấu locks the grid and reveals on a wrong answer, like the old law',
    play.competitiveWrong?.mode === 'competitive' && play.competitiveWrong?.rows === 1
    && play.competitiveWrong?.points === 0 && JSON.stringify(play.competitiveWrong?.reveal) === JSON.stringify(['a'])
    && play.competitiveWrong?.clickable === 0, view(play.competitiveWrong));
  check('the strip of a token game names the answer mode instead of the old scoring law',
    String(play.competitiveWrong?.tip || '').indexOf('Trả lời một lần') === 0,
    String(play.competitiveWrong?.tip || ''));

  // 4. Luyện tập: sai không lộ, được bấm lại, CHƯA có dòng điểm, còn nút bỏ qua.
  check('Luyện tập keeps the question open and writes no row on a miss',
    play.practiceMiss?.rows === 0 && play.practiceMiss?.open === true
    && play.practiceMiss?.retry === true && play.practiceMiss?.clickable === 2
    && play.practiceMiss?.locked === false, view(play.practiceMiss));
  check('a miss in Luyện tập exposes nothing — not even on the projector',
    JSON.stringify(play.practiceMiss?.reveal) === '[]' && play.practiceMiss?.projection?.revealed === false
    && play.practiceMiss?.projection?.right === 'none', JSON.stringify(play.practiceMiss?.projection));
  check('the retry banner promises a retry and the score that is left',
    has(play.practiceMiss, 'thử lại') && has(play.practiceMiss, '90'), said(play.practiceMiss));
  check('a retrying student still gets a way out of the question',
    play.practiceMiss?.nextShown === true && play.practiceMiss?.nextLabel === 'Bỏ qua câu này →',
    String(play.practiceMiss?.nextLabel));
  check('the answer that lands after a miss pays 90 and closes the question',
    play.practiceHit?.rows === 1 && play.practiceHit?.points === 90 && play.practiceHit?.lastPts === 90
    && play.practiceHit?.open === false && play.practiceHit?.clickable === 0
    && play.practiceHit?.dupes === 0, view(play.practiceHit));
  check('the penalty is explained to the class, not just charged',
    has(play.practiceHit, '10%'), said(play.practiceHit));
  check('skipping a retrying question writes one zero row and moves on',
    play.practiceSkip?.rows === 1 && play.practiceSkip?.points === 0 && play.practiceSkip?.index === 1
    && play.practiceSkip?.dupes === 0 && play.practiceSkipMiss?.rows === 0, view(play.practiceSkip));

  // 5. Thử thách: sai thì giữ kín cả đáp án lẫn lời giải; đúng thì cả hai mở.
  check('Thử thách pays nothing and shows nothing on a wrong answer',
    play.challengeWrong?.mode === 'challenge' && play.challengeWrong?.rows === 1
    && play.challengeWrong?.points === 0 && JSON.stringify(play.challengeWrong?.reveal) === '[]'
    && JSON.stringify(play.challengeWrong?.marked) === JSON.stringify(['b']), view(play.challengeWrong));
  check('the projector is just as blind as the main screen in Thử thách',
    play.challengeWrong?.projection?.revealed === false
    && play.challengeWrong?.projection?.right === 'none'
    && play.challengeWrong?.projection?.why === '', JSON.stringify(play.challengeWrong?.projection));
  check('a wrong Thử thách answer keeps the explanation off the banner',
    !has(play.challengeWrong, 'Bằng hai') && has(play.challengeWrong, 'không mở đáp án'), said(play.challengeWrong));
  check('a correct Thử thách answer reveals the option and earns the explanation',
    play.challengeCorrect?.points === 100 && JSON.stringify(play.challengeCorrect?.reveal) === JSON.stringify(['a'])
    && has(play.challengeCorrect, 'Bằng hai'), view(play.challengeCorrect));

  // 6. Xây nhà: một câu đổi ĐÚNG MỘT phần nhà; cú sai còn mở vòng thì chưa đổi gì.
  check('a Luyện tập miss does not build (or undo) a house part',
    play.houseMiss?.house === '0/0/0' && play.houseMiss?.rows === 0, String(play.houseMiss?.house));
  check('the right answer after that miss builds exactly one part and pays 90',
    play.houseHit?.house === '1/1/0' && play.houseHit?.rows === 1 && play.houseHit?.points === 90,
    String(play.houseHit?.house));
  check('Thử thách charges the house once for the wrong answer it locked',
    play.houseChallenge?.house === '0/0/1' && play.houseChallenge?.rows === 1,
    String(play.houseChallenge?.house));

  // 7. Tình huống: rubric đứng nguyên, không bao giờ tô "quyết định đúng".
  check('a suboptimal decision still earns its rubric score through the machine',
    play.scenarioLegacyMiss?.rows === 1 && play.scenarioLegacyMiss?.points === 45
    && play.scenarioLegacyMiss?.lastPts === 45 && has(play.scenarioLegacyMiss, 'Điểm quyết định: 45/100'),
    view(play.scenarioLegacyMiss));
  check('the rubric breakdown reaches the score row unchanged',
    play.scenarioLegacyMiss?.last?.scoringBreakdown?.safety === 30
    && play.scenarioLegacyMiss?.last?.scoringBreakdown?.reasoning === 10
    && play.scenarioLegacyMiss?.last?.scoringBreakdown?.harmReduction === 5,
    JSON.stringify(play.scenarioLegacyMiss?.last?.scoringBreakdown || null));
  check('a decision is never painted as "the correct one"',
    JSON.stringify(play.scenarioLegacyMiss?.reveal) === '[]'
    && JSON.stringify(play.scenarioLegacyMiss?.marked) === '[]', view(play.scenarioLegacyMiss));
  check('a legacy decision still reads its own feedback',
    has(play.scenarioLegacyMiss, 'Còn rủi ro'), said(play.scenarioLegacyMiss));
  check('Thử thách keeps a decision feedback to itself but pays the same rubric',
    play.scenarioChallengeMiss?.points === 45 && !has(play.scenarioChallengeMiss, 'Còn rủi ro'),
    said(play.scenarioChallengeMiss));
  check('Luyện tập lets a decision be re-made and taxes the rubric once',
    play.scenarioPracticeMiss?.rows === 0 && play.scenarioPracticeMiss?.retry === true
    && play.scenarioPracticeHit?.rows === 1 && play.scenarioPracticeHit?.points === 90
    && play.scenarioPracticeHit?.dupes === 0, view(play.scenarioPracticeHit));
  check('the next button walks one situation at a time, one row per situation',
    play.scenarioAdvance?.index === 1 && play.scenarioAdvance?.rows === 1
    && play.scenarioAdvance?.dupes === 0 && play.scenarioAdvance?.steps === 1
    && play.scenarioBefore?.nextLabel === 'Tình huống tiếp theo →', view(play.scenarioAdvance));

  /* J. KHO BÁU. Một chặng đi qua máy trạng thái trả lời thì DOM của màn chặng phải
     đổi theo, không chỉ con số trong Node. tview in đúng những gì một lần đỏ cần nói:
     luật nào đang chạy, bao nhiêu dòng điểm, bao nhiêu điểm, và bàn/ ô trả lời còn
     bấm được hay đã sơn gì. */
  const treasure = report.treasure || {};
  const tview = s => !s ? String(s) : s.error ? JSON.stringify(s) : JSON.stringify({
    mode: s.mode, rows: s.rows, pts: s.earned, lastPts: s.lastPts, dupes: s.dupes,
    retry: s.retry, reveal: s.reveal, why: s.explain, tries: s.tries,
    opt: s.optClick, shown: s.optRevealed, marked: s.optMarked,
    done: s.matchDone, shown2: s.matchShown, click2: s.matchClick,
    placed: s.classPlaced, shown3: s.classShown, open: s.decodeOpen
  });
  const saidT = s => String(s && s.feedback || '').slice(0, 190);
  const hasT = (s, text) => String(s && s.feedback || '').indexOf(text) !== -1;

  check('the treasure play probes ran to completion', Boolean(treasure.decodeCompetitiveMiss) && !treasure.error,
    String(treasure.error || 'ok'));

  // 1+2+3. GAME CŨ: còn nguyên "thử tới hết lượt, cạn lượt thì mở đáp án", và một
  //        cú nhấp thừa không tạo thêm dòng điểm nào.
  check('a legacy stage opens with its own attempt budget and the old promise',
    treasure.legacyOpen?.mode === 'legacy' && treasure.legacyOpen?.rows === 0
    && treasure.legacyOpen?.tries === 2 && treasure.legacyOpen?.retry === true
    && treasure.legacyOpen?.strip.indexOf('Còn 2 lượt thử') === 0
    && treasure.legacyOpen?.strip.indexOf('sai không bị trừ điểm') !== -1,
    tview(treasure.legacyOpen) + ' | ' + treasure.legacyOpen?.strip);
  check('a legacy miss spends one try, writes no row and reveals nothing yet',
    treasure.legacyMiss?.rows === 0 && treasure.legacyMiss?.tries === 1
    && treasure.legacyMiss?.retry === true && JSON.stringify(treasure.legacyMiss?.optRevealed) === '[]'
    && treasure.legacyMiss?.optClick === 2 && hasT(treasure.legacyMiss, 'Còn 1 lượt thử'),
    tview(treasure.legacyMiss) + ' | ' + saidT(treasure.legacyMiss));
  check('running out of the old budget closes the stage AND shows the key, like today',
    treasure.legacyOut?.rows === 1 && treasure.legacyOut?.lastPts === 0
    && treasure.legacyOut?.reveal === true && treasure.legacyOut?.explain === true
    && JSON.stringify(treasure.legacyOut?.optRevealed) === JSON.stringify(['a'])
    && JSON.stringify(treasure.legacyOut?.optMarked) === JSON.stringify(['b'])
    && treasure.legacyOut?.optClick === 0 && hasT(treasure.legacyOut, 'Hết lượt thử'),
    tview(treasure.legacyOut) + ' | ' + saidT(treasure.legacyOut));
  check('one click too many on a closed stage adds neither a row nor a point',
    treasure.legacyDouble?.rows === 1 && treasure.legacyDouble?.dupes === 0
    && treasure.legacyDouble?.earned === 0, tview(treasure.legacyDouble));
  check('a legacy stage with attempts 1 still gets exactly one try',
    treasure.legacyOneTry?.rows === 1 && treasure.legacyOneTry?.reveal === true
    && JSON.stringify(treasure.legacyOneTry?.optRevealed) === JSON.stringify(['a'])
    && treasure.legacyOneTry?.strip.indexOf('Hết lượt thử') === 0,
    tview(treasure.legacyOneTry) + ' | ' + treasure.legacyOneTry?.strip);

  // 4. Thi đấu: ngân sách 3 lượt của chặng KHÔNG được mở rộng thành 3 lần trả lời.
  check('Thi đấu keeps its single answer even when the stage data allows 3 tries',
    treasure.competitiveMiss?.mode === 'competitive' && treasure.competitiveMiss?.rows === 1
    && treasure.competitiveMiss?.retry === false && treasure.competitiveMiss?.earned === 0
    && treasure.competitiveMiss?.optClick === 0
    && JSON.stringify(treasure.competitiveMiss?.optRevealed) === JSON.stringify(['a']),
    tview(treasure.competitiveMiss));
  check('the stage strip of a token game states the answer law, not the old promise',
    treasure.competitiveMiss?.strip.indexOf('Trả lời một lần') === 0
    && treasure.competitiveMiss?.strip.indexOf('sai không bị trừ điểm') === -1,
    String(treasure.competitiveMiss?.strip));

  // 5. Luyện tập: phạt trên ĐIỂM NỘI DUNG, thưởng đi nguyên, và một chặng vẫn một dòng.
  check('Luyện tập opens with the practice law and the stage budget',
    treasure.practiceOpen?.mode === 'practice' && treasure.practiceOpen?.retry === true
    && treasure.practiceOpen?.strip.indexOf('Sai được thử lại') === 0
    && treasure.practiceOpen?.strip.indexOf('còn 2 lượt thử') !== -1,
    tview(treasure.practiceOpen) + ' | ' + treasure.practiceOpen?.strip);
  check('a miss in Luyện tập writes no row, reveals no option and names the score left',
    treasure.practiceMiss?.rows === 0 && treasure.practiceMiss?.optClick === 2
    && JSON.stringify(treasure.practiceMiss?.optRevealed) === '[]'
    && treasure.practiceMiss?.explain === false && hasT(treasure.practiceMiss, 'còn 140 điểm'),
    tview(treasure.practiceMiss) + ' | ' + saidT(treasure.practiceMiss));
  check('the answer after the miss pays 140: 150 minus 10% of the CONTENT points only',
    treasure.practiceHit?.rows === 1 && treasure.practiceHit?.dupes === 0
    && treasure.practiceHit?.lastPts === 140 && treasure.practiceHit?.earned === 140
    && treasure.practiceHit?.reveal === true && treasure.practiceHit?.explain === true
    && hasT(treasure.practiceHit, 'bị bớt 10') && hasT(treasure.practiceHit, 'thưởng hoàn thành +50 giữ nguyên'),
    tview(treasure.practiceHit) + ' | ' + saidT(treasure.practiceHit));
  check('the hidden item bonus is added whole, never taxed by the practice penalty',
    treasure.practiceItem?.earned === 160 && treasure.practiceItem?.lastPts === 140,
    tview(treasure.practiceItem));

  // 5c. 0 điểm nội dung là một cơ số HỢP LỆ: không có gì để phạt.
  check('a stage with 0 content points keeps its completion bonus untouched',
    treasure.zeroHit?.rows === 1 && treasure.zeroHit?.lastPts === 50
    && treasure.zeroMiss?.rows === 0 && hasT(treasure.zeroMiss, 'còn 50 điểm')
    && !hasT(treasure.zeroHit, 'bị bớt'), tview(treasure.zeroHit) + ' | ' + saidT(treasure.zeroHit));

  // 6. Thử thách: sai thì giữ kín trên CẢ hai màn.
  check('Thử thách closes the stage on one miss and paints nothing',
    treasure.challengeMiss?.mode === 'challenge' && treasure.challengeMiss?.rows === 1
    && treasure.challengeMiss?.earned === 0 && treasure.challengeMiss?.reveal === false
    && treasure.challengeMiss?.explain === false
    && JSON.stringify(treasure.challengeMiss?.optRevealed) === '[]'
    && JSON.stringify(treasure.challengeMiss?.optMarked) === JSON.stringify(['b'])
    && treasure.challengeMiss?.optClick === 0 && hasT(treasure.challengeMiss, 'không mở đáp án'),
    tview(treasure.challengeMiss) + ' | ' + saidT(treasure.challengeMiss));
  check('the projector is as blind as the main screen in Kho báu Thử thách',
    treasure.challengeMiss?.projection?.revealed === false
    && treasure.challengeMiss?.projection?.right === 'none'
    && treasure.challengeMiss?.projection?.why === '', JSON.stringify(treasure.challengeMiss?.projection));
  check('a correct Thử thách answer pays the full content plus bonus and earns the explanation',
    treasure.challengeHit?.rows === 1 && treasure.challengeHit?.lastPts === 150
    && treasure.challengeHit?.reveal === true && treasure.challengeHit?.explain === true
    && hasT(treasure.challengeHit, 'Bằng hai') && treasure.challengeHit?.projection?.why === 'Bằng hai.',
    tview(treasure.challengeHit) + ' | ' + saidT(treasure.challengeHit));

  // 7. GHÉP CẶP: cùng một luật, trên bàn ghép thật.
  check('a wrong pair in Luyện tập costs a try, not the stage',
    treasure.matchPracticeMiss?.rows === 0 && treasure.matchPracticeMiss?.retry === true
    && treasure.matchPracticeMiss?.matchDone === 0 && treasure.matchPracticeMiss?.matchShown === 0
    && treasure.matchPracticeMiss?.matchClick === 4 && hasT(treasure.matchPracticeMiss, 'còn 140 điểm'),
    tview(treasure.matchPracticeMiss) + ' | ' + saidT(treasure.matchPracticeMiss));
  check('finishing the board after a miss pays 140 and closes the stage once',
    treasure.matchPracticeHit?.rows === 1 && treasure.matchPracticeHit?.dupes === 0
    && treasure.matchPracticeHit?.lastPts === 140 && treasure.matchPracticeHit?.matchDone === 2
    && treasure.matchPracticeHit?.matchClick === 0, tview(treasure.matchPracticeHit));
  check('Thử thách never paints a pair as matched when it must stay silent',
    treasure.matchChallengeMiss?.rows === 1 && treasure.matchChallengeMiss?.lastPts === 0
    && treasure.matchChallengeMiss?.matchShown === 0 && treasure.matchChallengeMiss?.matchDone === 0
    && treasure.matchChallengeMiss?.matchClick === 0
    && treasure.matchChallengeMiss?.status === 'Chặng đã khép — đáp án không được mở.'
    && treasure.matchChallengeMiss?.projection?.revealed === false,
    tview(treasure.matchChallengeMiss) + ' | ' + treasure.matchChallengeMiss?.status);
  check('a legacy board out of tries still opens every pair, as it does today',
    treasure.matchLegacyOut?.rows === 1 && treasure.matchLegacyOut?.reveal === true
    && treasure.matchLegacyOut?.matchShown === 2 && treasure.matchLegacyOut?.matchDone === 2
    && treasure.matchLegacyOut?.status === 'Đáp án đúng đã được mở.',
    tview(treasure.matchLegacyOut) + ' | ' + treasure.matchLegacyOut?.status);

  // 8. PHÂN LOẠI.
  check('a legacy classification opens the whole board when the tries run out',
    treasure.classLegacyOut?.rows === 1 && treasure.classLegacyOut?.lastPts === 0
    && treasure.classLegacyOut?.classShown === 2 && treasure.classLegacyOut?.classPlaced === 2
    && treasure.classLegacyOut?.classClick === 0
    && treasure.classLegacyOut?.status === 'Đáp án đúng đã được mở.',
    tview(treasure.classLegacyOut) + ' | ' + treasure.classLegacyOut?.status);
  check('a wrong group in Luyện tập keeps the board playable and names the score left',
    treasure.classPracticeMiss?.rows === 0 && treasure.classPracticeMiss?.retry === true
    && treasure.classPracticeMiss?.classPlaced === 0 && hasT(treasure.classPracticeMiss, 'còn 140 điểm'),
    tview(treasure.classPracticeMiss) + ' | ' + saidT(treasure.classPracticeMiss));
  check('sorting the rest after a miss pays 140 in one row',
    treasure.classPracticeHit?.rows === 1 && treasure.classPracticeHit?.dupes === 0
    && treasure.classPracticeHit?.lastPts === 140 && treasure.classPracticeHit?.classPlaced === 2
    && treasure.classPracticeHit?.classShown === 0, tview(treasure.classPracticeHit));
  check('Thử thách leaves unsorted items unplaced instead of moving them to the right group',
    treasure.classChallengeMiss?.rows === 1 && treasure.classChallengeMiss?.classShown === 0
    && treasure.classChallengeMiss?.classPlaced === 0
    && treasure.classChallengeMiss?.status === 'Chặng đã khép — đáp án không được mở.',
    tview(treasure.classChallengeMiss) + ' | ' + treasure.classChallengeMiss?.status);

  // 9. GIẢI MÃ: ô text là nơi dễ lộ đáp án nhất, nên phải đo chuỗi IN RA.
  check('a legacy decode keeps its retry budget and prints nothing on a miss',
    treasure.decodeLegacyMiss?.rows === 0 && treasure.decodeLegacyMiss?.retry === true
    && treasure.decodeLegacyMiss?.decodeOpen === true && hasT(treasure.decodeLegacyMiss, 'Còn 1 lượt thử'),
    tview(treasure.decodeLegacyMiss) + ' | ' + saidT(treasure.decodeLegacyMiss));
  check('the right decoded word pays content plus bonus in full for a legacy game',
    treasure.decodeLegacyHit?.rows === 1 && treasure.decodeLegacyHit?.lastPts === 150
    && treasure.decodeLegacyHit?.decodeOpen === false
    && hasT(treasure.decodeLegacyHit, 'Đã giải mã chính xác'),
    tview(treasure.decodeLegacyHit) + ' | ' + saidT(treasure.decodeLegacyHit));
  check('Thử thách never prints the plain answer into the decode feedback',
    treasure.decodeChallengeMiss?.rows === 1 && treasure.decodeChallengeMiss?.lastPts === 0
    && treasure.decodeChallengeMiss?.decodeOpen === false
    && !hasT(treasure.decodeChallengeMiss, 'Den Bien')
    && treasure.decodeChallengeMiss?.status === 'Chặng đã khép — đáp án không được mở.',
    tview(treasure.decodeChallengeMiss) + ' | ' + saidT(treasure.decodeChallengeMiss));
  check('Thi đấu does print the answer it just locked',
    treasure.decodeCompetitiveMiss?.rows === 1 && treasure.decodeCompetitiveMiss?.reveal === true
    && hasT(treasure.decodeCompetitiveMiss, 'Den Bien'),
    tview(treasure.decodeCompetitiveMiss) + ' | ' + saidT(treasure.decodeCompetitiveMiss));

  /* K. ĐƯỜNG ĐUA. rv in toàn bộ.snapshot THÔ, đúng tên khoá mà các điều kiện đọc: một
     helper đổi tên trường để log ngắn hơn đã làm 15 check đỏ mà không tự giải thích được
     vì sao — điều kiện đọc 'correctCount' trong khi log in 'cc'. */
  const race = report.race || {};
  const rv = s => !s ? String(s) : s.error ? JSON.stringify(s) : JSON.stringify(
    Object.assign({}, s, { result: String(s.result || '').slice(0, 60) }));
  const saidR = s => String(s && s.feedback || '').slice(0, 190);
  const hasR = (s, word) => String(s && s.feedback || '').indexOf(word) !== -1;
  const onCard = (s, word) => String(s && s.drawn || '').indexOf(word) !== -1;
  const step = s => String(s && s.kicker || '').indexOf('+1 Ô') !== -1;

  check('the race play probes ran to completion', Boolean(race.challengeProjector) && !race.error,
    String(race.error || 'ok'));

  // 1. GAME CŨ: độ khó vẫn đổi số ô, không có gì bị #209 chạm tới.
  check('a legacy race with the difficulty toggle on starts with no turn open',
    race.legacyEasyOpen?.mode === null && race.legacyEasyOpen?.drawShown === true
    && race.legacyEasyOpen?.answered === false && race.legacyEasyOpen?.optClick === 0
    && race.legacyEasyOpen?.continueShown === false
    && race.legacyEasyOpen?.pill.indexOf('⚡ Tiến theo độ khó') === 0, rv(race.legacyEasyOpen));
  check('the drawn legacy card opens its one turn and promises the difficulty steps',
    race.legacyEasyDraw?.mode === 'legacy' && race.legacyEasyDraw?.retry === false
    && race.legacyEasyDraw?.ceiling === 100 && race.legacyEasyDraw?.optClick === 2
    && race.legacyEasyDraw?.giveUpShown === true && race.legacyEasyDraw?.continueShown === false,
    rv(race.legacyEasyDraw));
  check('a legacy easy question still moves 1 square',
    race.legacyEasy?.progress?.[0] === 2 && race.legacyEasy?.points?.[0] === 100
    && race.legacyEasy?.correctCount === 1 && hasR(race.legacyEasy, 'trả lời đúng → +1 ô')
    && step(race.legacyEasy), rv(race.legacyEasy) + ' | ' + saidR(race.legacyEasy));
  check('a legacy medium question still moves 2 squares',
    race.legacyMid?.progress?.[0] === 3 && hasR(race.legacyMid, '→ +2 ô')
    && String(race.legacyMid?.kicker || '').indexOf('+2 Ô') !== -1, rv(race.legacyMid));
  check('a legacy hard question still moves 3 squares',
    race.legacyHard?.progress?.[0] === 4 && hasR(race.legacyHard, '→ +3 ô')
    && String(race.legacyHard?.kicker || '').indexOf('+3 Ô') !== -1, rv(race.legacyHard));
  check('a second click on a closed race turn moves nobody and pays nothing more',
    race.legacyDouble?.progress?.[0] === 4 && race.legacyDouble?.points?.[0] === 100
    && race.legacyDouble?.correctCount === 1, rv(race.legacyDouble));

  // 2+3. THI ĐẤU: MỘT số ô cố định, kể cả khi dữ liệu vẫn còn bật "Tiến theo độ khó".
  check('Thi đấu opens the drawn question with its own law on the strip',
    race.competitiveDraw?.mode === 'competitive' && race.competitiveDraw?.retry === false
    && race.competitiveDraw?.ceiling === 100 && race.competitiveDraw?.optClick === 2
    && race.competitiveDraw?.giveUpShown === true && race.competitiveDraw?.continueShown === false
    // Dải luật mở đầu bằng một biểu tượng, nên tìm chuỗi luật chứ không so vị trí 0.
    && race.competitiveDraw?.pill.indexOf('Tiến 1 ô/câu đúng · Trả lời một lần') !== -1,
    rv(race.competitiveDraw));
  check('Thi đấu ignores the stored difficulty toggle and advances one square',
    race.competitiveHard?.mode === 'competitive' && race.competitiveHard?.progress?.[0] === 2
    && race.competitiveHard?.points?.[0] === 100 && step(race.competitiveHard)
    && String(race.competitiveHard?.kicker || '').indexOf('+3') === -1
    && hasR(race.competitiveHard, 'trả lời đúng → +1 ô'), rv(race.competitiveHard));
  check('a Thi đấu miss closes the turn, reveals the key and moves nobody',
    race.competitiveMiss?.reveal === true && race.competitiveMiss?.explain === true
    && JSON.stringify(race.competitiveMiss?.optRevealed) === JSON.stringify(['a'])
    && JSON.stringify(race.competitiveMiss?.optMarked) === JSON.stringify(['b'])
    && race.competitiveMiss?.optClick === 0 && race.competitiveMiss?.turnPts === 0
    && race.competitiveMiss?.used === 1 && race.competitiveMiss?.progress?.[0] === 1
    && race.competitiveMiss?.points?.[0] === 0 && race.competitiveMiss?.continueShown === true
    && onCard(race.competitiveMiss, 'Đáp án đúng'), rv(race.competitiveMiss));
  check('a stale second click cannot pay a closed Thi đấu turn twice',
    race.competitiveDouble?.progress?.[0] === 1 && race.competitiveDouble?.points?.[0] === 0
    && race.competitiveDouble?.turns === 1 && race.competitiveDouble?.correctCount === 0,
    rv(race.competitiveDouble));

  // 4. THỬ THÁCH: sai thì im lặng tuyệt đối, nhưng vẫn phải cho sang lượt.
  check('Thử thách closes the turn without showing the key or the explanation',
    race.challengeMiss?.mode === 'challenge' && race.challengeMiss?.reveal === false
    && race.challengeMiss?.explain === false && race.challengeMiss?.turnPts === 0
    && JSON.stringify(race.challengeMiss?.optRevealed) === '[]'
    && JSON.stringify(race.challengeMiss?.optMarked) === JSON.stringify(['b'])
    && race.challengeMiss?.optClick === 0 && race.challengeMiss?.progress?.[0] === 1
    && race.challengeMiss?.continueShown === true && !onCard(race.challengeMiss, 'Đáp án đúng')
    && !onCard(race.challengeMiss, 'Bằng hai'), rv(race.challengeMiss) + ' | ' + race.challengeMiss?.drawn);

  // 5. LUYỆN TẬP: cú sai không tiến, không rút câu, không điểm — và trần phạt là 100.
  check('Luyện tập declares its law and its ceiling the moment the card is drawn',
    race.practiceDraw?.mode === 'practice' && race.practiceDraw?.retry === true
    && race.practiceDraw?.ceiling === 100 && race.practiceDraw?.turnPts === 0
    && race.practiceDraw?.pill.indexOf('Tiến 1 ô') !== -1
    && race.practiceDraw?.pill.indexOf('10%') !== -1, rv(race.practiceDraw));
  check('a Luyện tập miss pays nothing, moves nothing and keeps the card in play',
    race.practiceMiss?.retry === true && race.practiceMiss?.reveal === false
    && race.practiceMiss?.answered === false
    && race.practiceMiss?.wrongs === 1 && race.practiceMiss?.turnPts === 0
    && race.practiceMiss?.progress?.[0] === 1 && race.practiceMiss?.points?.[0] === 0
    && race.practiceMiss?.used === 0 && race.practiceMiss?.optClick === 2
    && race.practiceMiss?.continueShown === false && race.practiceMiss?.giveUpShown === true
    && onCard(race.practiceMiss, 'CÒN ĐƯỢC THỬ LẠI') && !onCard(race.practiceMiss, 'Đáp án đúng'),
    rv(race.practiceMiss));
  check('the retry banner names the score that is actually left',
    hasR(race.practiceMiss, 'còn được thử lại') && hasR(race.practiceMiss, '90'),
    saidR(race.practiceMiss));
  check('the answer after a miss pays 90 and still advances ONE square',
    race.practiceHit?.mode === 'practice' && race.practiceHit?.turnPts === 90
    && race.practiceHit?.points?.[0] === 90 && race.practiceHit?.progress?.[0] === 2
    && race.practiceHit?.used === 1 && race.practiceHit?.wrongs === 1
    && race.practiceHit?.reveal === true && step(race.practiceHit)
    && hasR(race.practiceHit, 'nhận 90/100 điểm') && hasR(race.practiceHit, 'bớt 10'),
    rv(race.practiceHit) + ' | ' + saidR(race.practiceHit));

  // 6+7. "Đội không trả lời được": khép vòng TỪ PHÍA TRÒ — không phạt, không tính lượt,
  //      và có lộ đáp án hay không là DO HÀNG LUẬT trả lời (fix của task 6).
  check('giving up in Luyện tập writes no attempt and still keeps the answer hidden',
    race.practiceGiveUp?.reveal === false && race.practiceGiveUp?.turns === 0
    && race.practiceGiveUp?.wrongs === 0 && race.practiceGiveUp?.turnPts === 0
    && race.practiceGiveUp?.answered === true && race.practiceGiveUp?.progress?.[0] === 1
    && race.practiceGiveUp?.points?.[0] === 0 && race.practiceGiveUp?.giveUpShown === false
    && race.practiceGiveUp?.continueShown === true && JSON.stringify(race.practiceGiveUp?.optRevealed) === '[]'
    && !onCard(race.practiceGiveUp, 'Đáp án đúng') && hasR(race.practiceGiveUp, 'không trả lời được'),
    rv(race.practiceGiveUp));
  check('giving up on a legacy race still opens the key, exactly as before #209',
    race.legacyGiveUp?.mode === 'legacy' && race.legacyGiveUp?.reveal === true
    && race.legacyGiveUp?.turns === 0 && race.legacyGiveUp?.turnPts === 0
    && race.legacyGiveUp?.progress?.[0] === 1 && race.legacyGiveUp?.points?.[0] === 0
    && JSON.stringify(race.legacyGiveUp?.optRevealed) === JSON.stringify(['a'])
    && JSON.stringify(race.legacyGiveUp?.optMarked) === '[]'
    && onCard(race.legacyGiveUp, 'Đáp án đúng') && hasR(race.legacyGiveUp, 'không trả lời được'),
    rv(race.legacyGiveUp) + ' | ' + race.legacyGiveUp?.drawn);

  // 8. Ô đặc biệt là DỮ LIỆU bàn cờ, đứng ngoài quy tắc số bước cố định.
  check('a boost square still adds its own step on top of the fixed answer step',
    race.boost?.progress?.[0] === 3 && race.boost?.points?.[0] === 100
    && hasR(race.boost, 'ô 2 +1') && hasR(race.boost, '→ +1 ô'), rv(race.boost));
  check('the rule strip between two turns states the running law, not the stored toggle',
    race.betweenTurns?.mode === null && race.betweenTurns?.drawShown === true
    && race.betweenTurns?.continueShown === false && race.betweenTurns?.turnIndex === 1
    && race.betweenTurns?.pill.indexOf('Tiến 1 ô/câu đúng') !== -1
    && race.betweenTurns?.pill.indexOf('Tiến theo độ khó') === -1,
    rv(race.betweenTurns));
  // Đội 2 cũng đáp đúng MỘT câu nên cũng đi MỘT ô — và ô 2 của bàn cờ này là ô TĂNG
  // TỐC: luật của nó gắn với Ô chứ không gắn với lượt, nên đội thứ hai cũng bị nó đẩy
  // thêm 1 ô (1 → 2 → 3). Đó chính là điều mục 8 chốt: ô đặc biệt đứng ngoài luật bước cố định.
  check('the next team draws its own turn and its own square, boost cell included',
    race.team2Draw?.mode === 'competitive' && race.team2Draw?.turnIndex === 1
    && race.team2Draw?.progress?.[1] === 1 && race.team2?.progress?.[1] === 3
    && race.team2?.points?.[1] === 100 && race.team2?.correctCount === 2,
    rv(race.team2Draw) + ' | ' + rv(race.team2));

  // 9. Về đích sau MỘT câu đúng trên đường đua 2 ô — màn kết quả phải hiện.
  check('one correct answer on a two-square track wins the race',
    race.finishAnswer?.progress?.[0] === 2 && race.finishAnswer?.points?.[0] === 100
    && race.finishAnswer?.continueShown === true && String(race.finishAnswer?.continueLabel || '').indexOf('Xem kết quả') !== -1,
    rv(race.finishAnswer));
  check('the finish button opens the race result screen',
    race.finishResult?.over === true
    && String(race.finishResult?.result || '').indexOf('KẾT QUẢ ĐƯỜNG ĐUA') !== -1
    && String(race.finishResult?.result || '').indexOf('Đội đỏ chiến thắng') !== -1,
    String(race.finishResult?.result || '').slice(0, 120));

  // 10. MÁY CHIẾU: bảng chiếu của Đường đua không có trường nào chỉ ra đáp án đúng.
  check('the race projector view carries no answer key at all',
    JSON.stringify(race.challengeProjector?.projection?.flags) === '[]'
    && race.challengeProjector?.projection?.optionShape === 'id+text',
    JSON.stringify(race.challengeProjector?.projection));

  /* K2. HỘP CHIA ĐỘI của một game mang token (#209 đổi chỗ cất chế độ, nên con đường
     đội nhóm phải được ĐO lại bằng cú nhấp thật, không suy từ code). */
  const roster = report.roster || {};
  // In snapshot thô, đúng tên khoá mà điều kiện đọc (xem ghi chú ở rv phía trên).
  const rviewR = s => !s ? String(s) : s.error ? JSON.stringify(s) : JSON.stringify(s);

  check('the team roster opens for a token game that says "đội nhóm"',
    roster.setupOpen?.token === MODE_TOKENS[1] && roster.setupOpen?.setupShown === 2
    && JSON.stringify(roster.setupOpen?.pending) === JSON.stringify(['Đội A', 'Đội B'])
    && roster.setupOpen?.teams === null, rviewR(roster.setupOpen));
  check('the add-team button really adds a third row',
    roster.afterAdd?.setupShown === 3
    && JSON.stringify(roster.afterAdd?.pending) === JSON.stringify(['Đội A', 'Đội B', 'Đội C']),
    rviewR(roster.afterAdd));
  check('typing a team name reaches the pending roster',
    roster.afterRename?.pending?.[0] === 'Đội Sao Hoả', rviewR(roster.afterRename));
  check('starting the game carries the edited roster into the team play',
    JSON.stringify(roster.afterStart?.teams) === JSON.stringify(['Đội Sao Hoả', 'Đội B', 'Đội C'])
    && roster.afterStart?.setupShown === 0 && roster.afterStart?.mode === 'practice'
    && JSON.stringify(roster.afterStart?.points) === JSON.stringify([0, 0, 0]), rviewR(roster.afterStart));
  check('a Luyện tập miss leaves the team scoreboard at zero and writes no row',
    roster.afterMiss?.rows === 0 && JSON.stringify(roster.afterMiss?.points) === JSON.stringify([0, 0, 0])
    && roster.afterMiss?.turnIndex === 0, rviewR(roster.afterMiss));
  // Điều điều kiện này phải nói là ĐIỂM XUỐNG BẢNG, không phải chữ trên chip: thanh bảng
  // điểm chỉ dựng lại ở câu kế tiếp (check ngay bên dưới), còn chỗ MC đọc là dòng phản hồi.
  check('the penalised score is what the team at the wheel actually receives',
    roster.afterHit?.rows === 1 && roster.afterHit?.lastPts === 90
    && roster.afterHit?.points?.[0] === 90 && roster.afterHit?.turnIndex === 1
    && String(roster.afterHit?.feedback || '').indexOf('Đội Sao Hoả') !== -1
    && String(roster.afterHit?.feedback || '').indexOf('90') !== -1, rviewR(roster.afterHit));
  check('the scoreboard the class sees carries the penalised 90 to the next question',
    String(roster.afterNext?.chip || '').indexOf('Đội Sao Hoả 90') !== -1
    && roster.afterNext?.turnIndex === 1
    && String(roster.afterNext?.chip || '').indexOf('Đội B') !== -1, rviewR(roster.afterNext));

  check('the fixtures are removed from the library again', report.cleanup?.left === 0, JSON.stringify(report.cleanup));

  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
  // Đóng socket thay vì process.exit(): exit cắt mất phần đuôi đã buffer khi log được
  // redirect, còn socket mở thì tiến trình treo sau khi in xong (rc=124 đã đo).
  try { ctx.ws.close(); } catch (error) { /* đã đóng */ }
  process.exitCode = failed ? 1 : 0;
})();
