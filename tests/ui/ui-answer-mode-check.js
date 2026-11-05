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

  check('the fixtures are removed from the library again', report.cleanup?.left === 0, JSON.stringify(report.cleanup));

  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
  // Đóng socket thay vì process.exit(): exit cắt mất phần đuôi đã buffer khi log được
  // redirect, còn socket mở thì tiến trình treo sau khi in xong (rc=124 đã đo).
  try { ctx.ws.close(); } catch (error) { /* đã đóng */ }
  process.exitCode = failed ? 1 : 0;
})();
