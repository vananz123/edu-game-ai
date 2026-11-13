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
//  2. game cũ KHÔNG còn mục "Giữ hành vi hiện tại": mở ra là "Thi đấu" — đúng luật nó đã
//     chơi — và lần lưu đầu tiên ghi token Thi đấu, không cất giá trị chấm điểm cũ (#223);
//  3. chọn một chế độ rồi mở lại thì lựa chọn còn nguyên, và mọi lần lưu chỉ ghi token.
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
  const ctx = await connect({ evalTimeoutMs: 300000 });
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
    const TOKEN_COMPETITIVE = 'tra-loi:thi-dau';
    const TOKEN_PRACTICE = 'tra-loi:luyen-tap';
    const TOKEN_CHALLENGE = 'tra-loi:thu-thach';
    const out = { editor: {}, saved: {}, create: {}, playSeq: 0 };
    // Mỗi lần chạy một bộ tiêu đề riêng để không đọc phải bản ghi của lần trước.
    const RUN = 'AM209 ' + Date.now();
    const PREFIX = 'AM209 ';
    const title = key => PREFIX + key;

    // Onboarding của profile mới chiếm cửa sổ; đóng nó TRƯỚC khi đụng tới
    // #modalRoot, rồi chờ yên một nhịp để lần vẽ cuối không rơi vào giữa bài đo.
    const guardUntil = Date.now() + 4000;
    let quietSince = 0;
    while (Date.now() < guardUntil) {
      if (document.querySelector('#modalRoot .setup-fullscreen') && typeof closeSetupWizard === 'function') closeSetupWizard('close');
      const busy = document.querySelector('#modalRoot .setup-fullscreen');
      if (!busy) {
        if (!quietSince) quietSince = Date.now();
        if (Date.now() - quietSince > 700) break;
      } else {
        quietSince = 0;
      }
      await sleep(100);
    }
    await sleep(200);

    // Một lần chạy bị ném lại để lại fixture trong kho; dọn trước để kho luôn sạch.
    try {
      const before = await desktop.call('getLibrary');
      const stale = (before.games || []).filter(g => String(g.title || '').indexOf(PREFIX) === 0).map(g => g.id);
      out.staleFixtures = stale.length;
      if (stale.length) await desktop.call('deleteGames', stale);
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
      const lib = await desktop.call('getLibrary');
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

      // ---- C. game cũ: mở ra là "Thi đấu", lưu đi ghi token, không cất gì -------
      out.saved.legacyUntouched = await save('quiz-legacy', null, { fixture: FIX.quiz() });

      // ---- D. chọn Luyện tập: token xuống đĩa, không cất giá trị cũ, đọc lại ----
      out.saved.practicePick = await save('quiz-practice', TOKEN_PRACTICE, { fixture: FIX.quiz() });
      out.editor.reopenedPractice = await reopen('quiz-practice');

      // ---- E. một game cũ khác (tốc độ) lưu lại: token Thi đấu, thưởng nhanh còn ----
      out.saved.speedKept = await save('quiz-speed-kept', TOKEN_COMPETITIVE, { fixture: FIX.quiz() });

      // ---- F. game chưa từng cất chế độ nào (kiểu Kho báu): vẫn ghi token ---------
      out.saved.blankPick = await save('quiz-blank-parked', TOKEN_CHALLENGE, { fixture: FIX.blank() });
      out.editor.blankPickField = await reopen('quiz-blank-parked');

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
            /* Câu thảo luận của Tình huống nằm trong khối riêng (.feedback-discussion)
               và phải mang ĐÚNG mực của câu hỏi --world-ink, không bị luật
               .feedback strong / .feedback.bad strong nhuộm xanh hay đỏ. */
            discussion: (function () {
              const box = document.querySelector('#answerFeedback .feedback-discussion');
              if (!box) return null;
              const stage = document.querySelector('.game-stage');
              const probe = document.createElement('span');
              probe.style.color = 'var(--world-ink, #1b2438)';
              stage.appendChild(probe);
              const worldInk = getComputedStyle(probe).color;
              probe.remove();
              const strong = box.querySelector('strong');
              const question = document.querySelector('.stage-question');
              return {
                text: String(box.textContent).trim(),
                color: getComputedStyle(box).color,
                strongColor: strong ? getComputedStyle(strong).color : '',
                questionColor: question ? getComputedStyle(question).color : '',
                worldInk,
                block: getComputedStyle(box).display
              };
            })(),
            /* #225: màn KHÔNG ảnh minh hoạ chỉ có MỘT #answerFeedback và nó mang
               .quiz-answer-live (bị cắt còn 1px để máy đọc). Luật
               :has(.feedback-discussion) mở nó ra thành khối thật — phải đo hình
               học của khung, vì "display: block" một mình vẫn đúng với ô 1px. Đo ở
               cấp ngoài chứ không nằm trong danh sách thảo luận: màn KHÔNG có câu thảo
               vẫn phải chứng minh khung đã thu về 1×1. */
            fbFrame: fb ? (function () {
              const rect = fb.getBoundingClientRect();
              const style = getComputedStyle(fb);
              return {
                w: Math.round(rect.width),
                h: Math.round(rect.height),
                position: style.position,
                clipPath: style.clipPath,
                scrolls: fb.scrollHeight > fb.clientHeight + 2
              };
            })() : null,
            /* #213: từ phương án C, nút "Giải thích" của Đấu trường KHÔNG còn nằm
               trong bảng phản hồi — nó đứng ở khe trái của dock. Vì vậy bằng chứng
               "được quyền mở lời giải" phải đo trên CHÍNH cái nút, không đo trên chữ
               của bảng phản hồi nữa (đọc text banner mà nút đã dời đi thì luôn
               ra false, tức là một lỗi giả). */
            explainBtn: Boolean(document.querySelector('#playBody [data-answer-explain]')),
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
          if (key.indexOf('no-art') !== -1 || key.indexOf('quiet') !== -1)
            g.gameSetup.illustrationMode = 'off';
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
        /* 6b (#225): cùng câu Tình huống nhưng TẮT ảnh minh hoạ. Ở chế độ auto, mọi
           câu Tình huống đều mọc một cảnh mặc định nên hasIllus luôn đúng và khối
           phản hồi nằm ở cột phụ; chỉ khi illustrationMode = 'off' thì
           #answerFeedback là bản .quiz-answer-live DUY NHẤT — đúng màn mà dòng thảo
           luận từng bị cắt mất. */
        out.play.scenarioNoArt = await play(scenarioWith('legacy-scenario-no-art'));
        out.play.scenarioNoArtMiss = await click('risk');
        const noArtBase = JSON.parse(JSON.stringify(scenarioWith('legacy-scenario-quiet')));
        delete noArtBase.questions[0].discussionPrompt;
        out.play.scenarioQuiet = await play(noArtBase);
        out.play.scenarioQuietMiss = await click('risk');
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

      /* ---- L. NÚT "GIẢI THÍCH" + hộp lời giải (nhiệm vụ 7) -----------------------
         Task 7 đổi CHỖ chữ xuất hiện chứ không đổi chữ, nên chỉ DOM thật trả lời được
         năm câu:
          • sau cú trả lời, lời giải có còn tự in ra màn chơi không (phải KHÔNG);
          • một cú nhấp có dựng được hộp lời giải, và hộp có nằm trong #modalRoot — host
            sống độc lập với #playBody, nơi mỗi câu vẽ lại bằng innerHTML;
          • Escape có đóng RIÊNG hộp không: shell.js buộc phím này vào "thoát màn chơi",
            nên một modal quên capture sẽ tắt luôn ván của giáo viên;
          • máy chiếu — đường thứ hai tới đáp án — có in lời giải TRƯỚC cú nhấp không;
          • câu kế tiếp có để hộp cũ phủ lên câu mới không (chủ của hộp là cái nút đã mở
            nó, mất nút là mất hộp).
         Game legacy của Đấu trường cũng phải mở lời giải bằng nút; game legacy khác giữ
         hành vi cũ và được kiểm tra riêng ở các bề mặt tương ứng. */
      try {
        const TOKEN_COMPETITIVE = 'tra-loi:thi-dau';
        const WHY = 'Bằng hai.';
        const explainBtn = () => document.querySelector('[data-answer-explain]');
        const dlg = () => document.querySelector('#answerExplanationModal');
        const lsnap = () => {
          const d = dlg();
          const b = explainBtn();
          const body = document.querySelector('#playBody');
          return {
            btn: b ? text(b) : '',
            btnKey: b ? String(b.getAttribute('data-answer-explain') || '') : '',
            banner: text(document.querySelector('#answerFeedback')),
            boardWhy: text(body).indexOf(WHY) !== -1,
            open: Boolean(d),
            inRoot: Boolean(d && d.parentNode && d.parentNode.id === 'modalRoot'),
            dTitle: d ? text(d.querySelector('.answer-explain-title')) : '',
            dText: d ? text(d.querySelector('.answer-explain-text')) : '',
            dPrompt: d ? text(d.querySelector('.answer-explain-prompt')) : '',
            dLaw: d ? text(d.querySelector('.answer-explain-law')) : '',
            dOk: d ? text(d.querySelector('#answerExplainOkBtn')) : '',
            shown: state.answerExplanationShown ? String(state.answerExplanationShown.text) : null,
            playing: Boolean(body),
            quizWhy: typeof buildQuizView === 'function'
              ? String((buildQuizView() || {}).explanation || '') : 'no buildQuizView',
            treasureWhy: typeof buildTreasureView === 'function'
              ? String((buildTreasureView() || {}).explanation || '') : 'no buildTreasureView'
          };
        };
        const lplay = async game => {
          await closePlay();
          const copy = JSON.parse(JSON.stringify(game));
          copy.id = 'am-' + RUN + '-play-' + (++out.playSeq);
          playGame(copy);
          await sleep(700);
          return lsnap();
        };
        // quiz + scenario dùng data-answer, Đường đua dùng data-race-answer, Kho báu
        // trắc nghiệm dùng data-answer: một helper phải bấm được cả bốn bề mặt.
        const lopt = async optionId => {
          const btn = Array.prototype.slice.call(document.querySelectorAll('.answer-option'))
            .find(item => (item.dataset.answer || item.dataset.raceAnswer) === optionId);
          if (!btn) return { error: 'no option button ' + optionId };
          btn.click();
          await sleep(300);
          return lsnap();
        };
        const lnext = async () => {
          const btn = document.querySelector('#nextQuestionBtn');
          if (!btn || btn.classList.contains('hidden')) return { error: 'no next button on screen' };
          btn.click();
          await sleep(560);
          return lsnap();
        };
        const ldraw = async () => {
          const btn = document.querySelector('#drawQuestionBtn');
          if (!btn) return { error: 'no draw button on screen' };
          btn.click();
          await sleep(320);
          return lsnap();
        };
        const openExplain = async () => {
          const b = explainBtn();
          if (!b) return { error: 'no answer-explain button on screen' };
          b.click();
          await sleep(300);
          return lsnap();
        };
        const pressEscape = async () => {
          const d = dlg();
          if (!d) return { error: 'no explanation dialog is open' };
          d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
          await sleep(260);
          return lsnap();
        };
        const tapDialog = async id => {
          const btn = document.getElementById(id);
          if (!btn) return { error: 'no ' + id + ' in the dialog' };
          btn.click();
          await sleep(260);
          return lsnap();
        };
        const quizL = (key, mode) => makeGame(key, 'quiz', {
          scoringMode: mode === null ? 'cơ bản' : mode, pointsPerCorrect: '100', duration: '20'
        });
        const stageL = () => ({
          id: 't1', name: 'Chặng 1', story: 'Chuyện tổng hợp.', taskDescription: 'Nhiệm vụ tổng hợp.',
          question: question('tq1'), attempts: 2, points: 100, completionBonus: 50, hasHiddenItem: false
        });
        const treasureL = (key, mode) => ({
          id: 'am-' + RUN + '-' + key, title: title(key), subject: 'Tự nhiên', grade: '3',
          template: 'treasure-hunt', description: '', tags: [], sourceName: 'ui-check',
          createdAt: '2026-01-01T00:00:00.000Z',
          gameSetup: mode === null ? {} : { scoringMode: mode },
          questions: [],
          treasureHunt: {
            character: 'Nhà thám hiểm An', intro: 'Hành trình tổng hợp.',
            journeyBonus: 100, hiddenItemBonus: 20, backgroundId: 'temple',
            characterId: 'explorer', stages: [stageL()]
          }
        });
        const raceL = (key, mode) => ({
          id: 'am-' + RUN + '-' + key, title: title(key), subject: 'Tự nhiên', grade: '3',
          template: 'race', description: '', tags: [], sourceName: 'ui-check',
          createdAt: '2026-01-01T00:00:00.000Z', gameSetup: { scoringMode: mode },
          questions: [],
          race: {
            trackLength: 12, maxRounds: 2, stepByDifficulty: false, luckEnabled: false,
            teams: [{ id: 't1', name: 'Đội đỏ', icon: 'A' }, { id: 't2', name: 'Đội xanh', icon: 'B' }],
            cells: [], questions: [Object.assign(question('rq1'), { difficulty: 'trung bình' })]
          }
        });
        const scenarioL = (key, mode) => {
          const g = makeGame(key, 'scenario', { scoringMode: mode });
          g.questions = [{
            id: 'sc1', type: 'scenario', points: 100, correctOptionId: 'safe',
            prompt: 'Dây phích cắm sạc hở điện ngay giữa lớp. Em làm gì?',
            context: 'Giờ ra chơi, cả lớp đang ở lại.', correctAnswer: '',
            explanation: 'Báo thầy cô rồi mới rút phích.',
            options: [
              { id: 'safe', text: 'Báo thầy cô trước khi động vào', feedback: 'An toàn nhất.', scenarioScore: { safety: 60, reasoning: 25, harmReduction: 15 } },
              { id: 'risk', text: 'Tự rút phích cắm cho nhanh', feedback: 'Còn rủi ro.', scenarioScore: { safety: 30, reasoning: 10, harmReduction: 5 } }
            ]
          }];
          return g;
        };
        out.explain = {};

        // 1. Luyện tập, đúng ngay: chữ rời khỏi màn chơi, cái nút thế chỗ. Một cú nhấp
        //    mới dựng hộp; máy chiếu chỉ in khi hộp đã mở.
        await lplay(quizL('explain-practice-hit', TOKEN_PRACTICE));
        out.explain.practiceHit = await lopt('a');
        out.explain.practiceOpen = await openExplain();
        out.explain.practiceOk = await tapDialog('answerExplainOkBtn');
        // 2. Luyện tập đang thử lại: vòng còn mở thì KHÔNG có cửa nào tới lời giải.
        await lplay(quizL('explain-practice-retry', TOKEN_PRACTICE));
        out.explain.practiceMiss = await lopt('b');
        out.explain.practiceMissOpen = await openExplain();
        // 3. Thử thách: câu sai không có nút và không có chữ; câu đúng thì có nút.
        await lplay(quizL('explain-challenge-miss', TOKEN_CHALLENGE));
        out.explain.challengeMiss = await lopt('b');
        await lplay(quizL('explain-challenge-hit', TOKEN_CHALLENGE));
        out.explain.challengeHit = await lopt('a');
        // 3b. Escape: hộp đóng, VÁN CÒN NGUYÊN.
        out.explain.escapeOpen = await openExplain();
        out.explain.escape = await pressEscape();
        // 3c. Dấu ✕ là lối ra thứ hai và cũng phải trả máy chiếu về trạng thái mù.
        out.explain.crossOpen = await openExplain();
        out.explain.cross = await tapDialog('closeAnswerExplainBtn');
        // 4. Thi đấu trên câu SAI: luật của nó mở đáp án nên cũng mở lời giải — nhưng
        //    qua cái nút, không qua banner.
        await lplay(quizL('explain-competitive-miss', TOKEN_COMPETITIVE));
        out.explain.competitiveMiss = await lopt('b');
        // 5. Đấu trường dùng nút Giải thích cả khi game được lưu theo luật legacy.
        await lplay(quizL('explain-legacy', null));
        out.explain.legacyHit = await lopt('a');
        // 6. Câu kế tiếp không được để hộp cũ phủ lên câu mới.
        await lplay(quizL('explain-stale', TOKEN_COMPETITIVE));
        out.explain.staleAnswer = await lopt('a');
        out.explain.staleOpen = await openExplain();
        out.explain.staleNext = await lnext();
        // 7. Kho báu và Đường đua đi qua CÙNG một cửa.
        await lplay(treasureL('explain-treasure', TOKEN_COMPETITIVE));
        out.explain.treasureHit = await lopt('a');
        out.explain.treasureOpen = await openExplain();
        out.explain.treasureOk = await tapDialog('answerExplainOkBtn');
        await lplay(raceL('explain-race', TOKEN_COMPETITIVE));
        out.explain.raceDraw = await ldraw();
        out.explain.raceHit = await lopt('a');
        out.explain.raceOpen = await openExplain();
        // 8. Tình huống: lời giải là feedback CỦA QUYẾT ĐỊNH, và tiêu đề hộp đổi tên.
        await lplay(scenarioL('explain-scenario', TOKEN_COMPETITIVE));
        out.explain.scenarioHit = await lopt('safe');
        out.explain.scenarioOpen = await openExplain();
        // 9. Đóng màn chơi: cờ mà máy chiếu đọc phải chết theo ván.
        await closePlay();
        out.explain.afterClose = lsnap();
      } catch (error) {
        out.explain = { error: String(error && error.message || error) };
        try {
          await closePlay();
        } catch (ignored) {
          out.explain.cleanupFailed = true;
        }
      }

      /* ---- M. MA TRẬN 4 TRÒ × 3 CHẾ ĐỘ (nhiệm vụ 8) --------------------------
         Bảy mục trước chứng minh TỪNG trò đúng luật. Mục này chứng minh CHÍNH LUẬT
         điều khiển chứ không phải thói quen của từng trò: năm bề mặt (Đấu trường Cổ
         điển, Đấu trường Xây nhà, Tình huống, Kho báu, Đường đua) nhân ba chế độ,
         cùng MỘT phép đo và MỘT nhịp bấm. Mỗi ô hai nhịp:
          • S1: ván MỚI → bấm SAI → snapshot → bấm ĐÚNG ngay tại màn hình đó. Ô đã
            khoá thì cú thứ hai KHÔNG được đổi gì (điểm, đáp án hiện, số dòng); ô
            Luyện tập thì cú thứ hai phải được nhận và trừ 10%.
          • S2: ván MỚI → bấm ĐÚNG → snapshot → bấm nút Giải thích NẾU CÓ → snapshot.
         Đơn vị điểm khác nhau giữa năm trò (Ô trên đường đua, PHẦN của ngôi nhà,
         ĐIỂM rubric của quyết định, thưởng chặng của Kho báu), nên msnap() trả về
         TẤT CẢ các trường và phần Node chọn đúng trường cho bề mặt nó đang xét —
         một helper riêng cho từng trò sẽ âm thầm bỏ sót cột của trò khác. */
      try {
        let mwhy = '';
        const turnOf = () => state.answerTurn
          || (state.treasurePlay && state.treasurePlay.answerTurn)
          || (state.racePlay && state.racePlay.answerTurn);
        const optId = b => b.dataset.answer || b.dataset.raceAnswer || '';
        // Máy chiếu của ba trò đều là hàm toàn cục; vòng lặp gọi CẢ BA để một cột
        // không bao giờ được phép im lặng khi bề mặt thật của nó tồn tại. try/catch vì
        // buildRaceView() đọc state.racePlay: gọi nó trên màn Kho báu là ném lỗi, và
        // một lỗi như thế không được phép xoá cả ô của ma trận.
        const projText = () => {
          const names = ['buildQuizView', 'buildTreasureView', 'buildRaceView'];
          const parts = [];
          for (let i = 0; i < names.length; i++) {
            const fn = window[names[i]];
            if (typeof fn !== 'function') continue;
            let v = null;
            try {
              v = fn();
            } catch (error) {
              parts.push(names[i].slice(5, 9) + ' threw');
              continue;
            }
            if (!v) continue;
            parts.push(names[i].slice(5, 9)
              + ' why=' + String(v.explanation === undefined ? 'undef' : v.explanation).slice(0, 22)
              + ' rev=' + String(v.revealed) + ' right=' + String(v.correctOptionId));
          }
          return parts.join(' | ');
        };
        const msnap = () => {
          const grid = Array.prototype.slice.call(document.querySelectorAll('.answer-option'));
          const turn = turnOf();
          const btn = document.querySelector('[data-answer-explain]');
          const dlg = document.querySelector('#answerExplanationModal');
          const body = document.querySelector('#playBody');
          const tp = state.treasurePlay;
          const rp = state.racePlay;
          const rows = tp ? (tp.results || []) : (state.gameAnswers || []);
          const last = rows.length ? rows[rows.length - 1] : null;
          return {
            mode: turn ? turn.mode : null,
            open: turn ? !turn.finished : null,
            retry: turn ? turn.retryAllowed : null,
            wrongs: turn ? Number(turn.wrongAttempts) : null,
            turnPts: turn ? Number(turn.points) : null,
            ceiling: turn ? Number(turn.maxPoints) : null,
            revealLaw: turn ? Boolean(turn.revealCorrect) : null,
            whyLaw: turn ? Boolean(turn.explanationAvailable) : null,
            clickable: grid.filter(b => !b.disabled).length,
            revealed: grid.filter(b => b.classList.contains('correct')).map(optId).join(''),
            marked: grid.filter(b => b.classList.contains('wrong')).map(optId).join(''),
            explain: btn ? text(btn) : '',
            dialog: dlg ? text(dlg.querySelector('.answer-explain-text')) : '',
            dialogTitle: dlg ? text(dlg.querySelector('.answer-explain-title')) : '',
            inlineWhy: body ? text(body).indexOf(mwhy) !== -1 : null,
            banner: text(document.querySelector('#answerFeedback')).slice(0, 96),
            law: [document.querySelector('.race-rule-pill'), document.querySelector('.stage-tip'),
              document.querySelector('.scoring-tip'), document.querySelector('.spec-chip'),
              document.querySelector('#treasureAttemptsHint')]
              .filter(Boolean).map(text).join(' | ').slice(0, 104),
            next: text(document.querySelector('#nextQuestionBtn')) + '/'
              + text(document.querySelector('#raceContinueBtn')) + '/'
              + text(document.querySelector('#raceNoAnswerBtn')),
            rows: rows.length,
            lastPts: last ? Number(last.points) : null,
            boardPts: (state.gameAnswers || []).reduce((s, r) => s + (Number(r.points) || 0), 0),
            house: state.houseBuild ? state.houseBuild.parts + '/' + state.houseBuild.correct + '/' + state.houseBuild.wrong : null,
            steps: state.scenarioSteps === undefined ? null : state.scenarioSteps,
            earned: tp ? Number(tp.earned) : null,
            tries: tp ? Number(tp.attemptsLeft) : null,
            progress: rp ? rp.teams.map(t => Number(t.progress)).join(',') : null,
            racePts: rp ? rp.teams.map(t => Number(t.points)).join(',') : null,
            over: rp ? Boolean(rp.over) : null,
            proj: projText()
          };
        };
        const mplay = async game => {
          await closePlay();
          const copy = JSON.parse(JSON.stringify(game));
          copy.id = 'am-' + RUN + '-play-' + (++out.playSeq);
          /* Một ô chỉ được đọc VÒNG và BẢNG ĐIỂM của CHÍNH ván nó vừa mở. Ba bề mặt cất
             vòng ở ba chỗ khác nhau (state.answerTurn / treasurePlay / racePlay) và
             không cái nào bị playGame của trò khác xoá đi, nên nếu để lại thì ô Kho báu
             đọc phải vòng Thử thách của ô Tình huống ngay trước — mode sai, "câu còn
             mở" sai, và điểm của trò khác lẫn vào cột điểm của trò này. Lần chạy đầu
             của chính mục M đã cho ra đúng kiểu đỏ đó. */
          state.answerTurn = null;
          state.treasurePlay = null;
          state.racePlay = null;
          state.answerExplanationShown = null;
          playGame(copy);
          await sleep(700);
          return msnap();
        };
        const mtap = async selector => {
          const btn = document.querySelector(selector);
          if (!btn) return { error: 'no element ' + selector };
          btn.click();
          await sleep(300);
          return msnap();
        };
        // Bốn bề mặt dùng data-answer, riêng Đường đua dùng data-race-answer.
        const mopt = id => mtap('.answer-option[data-answer="' + id + '"], .answer-option[data-race-answer="' + id + '"]');
        const mopen = async () => {
          const b = document.querySelector('[data-answer-explain]');
          if (!b) {
            const s = msnap();
            s.didClick = false;
            return s;
          }
          b.click();
          await sleep(300);
          const s2 = msnap();
          s2.didClick = true;
          return s2;
        };
        const mclose = async () => {
          const b = document.getElementById('answerExplainOkBtn');
          if (!b) return null;
          b.click();
          await sleep(240);
          return msnap();
        };
        const MODES = [['competitive', 'tra-loi:thi-dau'], ['practice', TOKEN_PRACTICE], ['challenge', TOKEN_CHALLENGE]];
        const quizM = (key, mode) => makeGame(key, 'quiz', { scoringMode: mode, pointsPerCorrect: '100', duration: '20' });
        const houseM = (key, mode) => {
          const g = quizM(key, mode);
          g.gameSetup.gameplayMode = 'house';
          return g;
        };
        const scenarioM = (key, mode) => {
          const g = makeGame(key, 'scenario', { scoringMode: mode });
          g.questions = [{
            id: 'sc1', type: 'scenario', points: 100, correctOptionId: 'safe',
            prompt: 'Dây phích cắm sạc hở điện ngay giữa lớp. Em làm gì?',
            context: 'Giờ ra chơi, cả lớp đang ở lại.', correctAnswer: '',
            explanation: 'Báo thầy cô rồi mới rút phích.',
            options: [
              { id: 'safe', text: 'Báo thầy cô trước khi động vào', feedback: 'An toàn nhất.', scenarioScore: { safety: 60, reasoning: 25, harmReduction: 15 } },
              { id: 'risk', text: 'Tự rút phích cắm cho nhanh', feedback: 'Còn rủi ro.', scenarioScore: { safety: 30, reasoning: 10, harmReduction: 5 } }
            ]
          }];
          return g;
        };
        const stageM = () => ({
          id: 't1', name: 'Chặng 1', story: 'Chuyện tổng hợp.', taskDescription: 'Nhiệm vụ tổng hợp.',
          question: question('tq1'), attempts: 2, points: 100, completionBonus: 50, hasHiddenItem: false
        });
        const treasureM = (key, mode) => ({
          id: 'am-' + RUN + '-' + key, title: title(key), subject: 'Tự nhiên', grade: '3',
          template: 'treasure-hunt', description: '', tags: [], sourceName: 'ui-check',
          createdAt: '2026-01-01T00:00:00.000Z',
          gameSetup: { scoringMode: mode }, questions: [],
          treasureHunt: {
            character: 'Nhà thám hiểm An', intro: 'Hành trình tổng hợp.',
            journeyBonus: 100, hiddenItemBonus: 20, backgroundId: 'temple',
            characterId: 'explorer', stages: [stageM()]
          }
        });
        const raceM = (key, mode) => ({
          id: 'am-' + RUN + '-' + key, title: title(key), subject: 'Tự nhiên', grade: '3',
          template: 'race', description: '', tags: [], sourceName: 'ui-check',
          createdAt: '2026-01-01T00:00:00.000Z', gameSetup: { scoringMode: mode },
          questions: [],
          race: {
            trackLength: 12, maxRounds: 2, stepByDifficulty: true, luckEnabled: false,
            teams: [{ id: 't1', name: 'Đội đỏ', icon: 'A' }, { id: 't2', name: 'Đội xanh', icon: 'B' }],
            cells: [], questions: [Object.assign(question('rq1'), { difficulty: 'khó' })]
          }
        });
        const SURFACES = [
          { key: 'classic', right: 'a', wrong: 'b', why: 'Bằng hai.', game: quizM },
          { key: 'house', right: 'a', wrong: 'b', why: 'Bằng hai.', game: houseM },
          { key: 'scenario', right: 'safe', wrong: 'risk', why: 'An toàn nhất.', game: scenarioM },
          { key: 'treasure', right: 'a', wrong: 'b', why: 'Bằng hai.', game: treasureM },
          // Đường đua phải BỐC câu hỏi trước; dữ liệu cố tình vẫn bật "Tiến theo độ
          // khó" và câu là loại KHÓ — ba ô là con số của game cũ, một ô là luật mới.
          { key: 'race', right: 'a', wrong: 'b', why: 'Bằng hai.', game: raceM, draw: true }
        ];
        out.matrix = [];
        for (let s = 0; s < SURFACES.length; s++) {
          const surface = SURFACES[s];
          mwhy = surface.why;
          for (let m = 0; m < MODES.length; m++) {
            const cell = { surface: surface.key, mode: MODES[m][0] };
            cell.right = surface.right;
            cell.wrong = surface.wrong;
            // S1 — câu SAI rồi bấm ĐÚNG ngay trên cùng màn hình.
            cell.open = await mplay(surface.game(surface.key + '-' + MODES[m][0] + '-miss', MODES[m][1]));
            if (surface.draw) cell.draw = await mtap('#drawQuestionBtn');
            cell.miss = await mopt(surface.wrong);
            cell.retryTap = await mopt(surface.right);
            cell.missDoor = await mopen();
            cell.missClosed = await mclose();
            // S2 — ván MỚI, câu ĐÚNG, rồi cửa lời giải.
            cell.fresh = await mplay(surface.game(surface.key + '-' + MODES[m][0] + '-hit', MODES[m][1]));
            if (surface.draw) cell.freshDraw = await mtap('#drawQuestionBtn');
            cell.hit = await mopt(surface.right);
            cell.hitDoor = await mopen();
            cell.hitClosed = await mclose();
            out.matrix.push(cell);
          }
        }
        /* ===== O. CÂU HỎI DẠNG CHỮ nhân bốn cách trả lời =====
           Nợ ghi ở cuối bàn giao task 4: mã nguồn đã khoá ô gõ, nút gửi và nút gợi ý theo
           điều kiện NOT turn.retryAllowed (quiz.ts:242-253), nhưng MỌI mục trước chỉ đi
           qua LƯỚI ĐÁP ÁN, nên "Luyện tập cho gõ lại" mới có bằng chứng code chứ chưa có
           bằng chứng DOM. Mỗi ô ở đây là một câu chữ THẬT trên màn Đấu trường thật: gõ vào
           #textAnswerInput, bấm #textAnswerBtn, rồi đo đúng những thứ mục M đã đo —
           vòng còn mở không, ba control còn bật không, bao nhiêu dòng điểm, chữ nào xuống
           bảng, đáp án có bị lộ không, máy chiếu nói gì. Hai loại câu (Điền từ / Trả lời
           ngắn) vì chúng đi qua cùng một nhánh textQ nhưng khác nhãn và khác placeholder.
           Nhịp một ô:
            • S1: ván MỚI, gõ SAI rồi bấm nút, snapshot; gõ ĐÚNG rồi bấm nút, snapshot; cửa
              lời giải; đóng. Với ô đã khoá, txask KHÔNG ghi đè chữ — một học sinh thật
              không gõ nổi vào input đã tắt — nên cú thứ hai phải là một vòng lặp KHÔNG có
              hậu quả, và typed vẫn là chữ sai ban đầu.
            • S2: ván MỚI, gõ ĐÚNG rồi bấm ENTER (quiz.ts:132 là đường thứ hai tới cùng một
              hàm submit, chưa từng được đo trên DOM), cửa lời giải, đóng. */
        out.text = [];
        const TXKINDS = ['fill-in-blank', 'short-answer'];
        const TXRIGHT = { 'fill-in-blank': 'Hai', 'short-answer': 'Cá' };
        const TXWRONG = { 'fill-in-blank': 'Ba', 'short-answer': 'Chó' };
        const TXWHY = { 'fill-in-blank': 'Bằng hai.', 'short-answer': 'Cá thở bằng mang nên sống dưới nước.' };
        const TXHINT = { 'fill-in-blank': 'Số đứng ngay sau 1.', 'short-answer': 'Loài có vây.' };
        const TXPROMPT = {
          'fill-in-blank': 'Một cộng một bằng ___?',
          'short-answer': 'Loài vật nào dưới đây thở bằng mang?'
        };
        const txquestion = kind => ({
          id: 'tx1', type: kind, prompt: TXPROMPT[kind], options: [], correctOptionId: '',
          correctAnswer: TXRIGHT[kind], alternateAnswers: [], explanation: TXWHY[kind],
          hint: TXHINT[kind], points: 100
        });
        const TXMODES = [['legacy', 'tốc độ'], ['competitive', 'tra-loi:thi-dau'],
          ['practice', TOKEN_PRACTICE], ['challenge', TOKEN_CHALLENGE]];
        const txgame = (key, kind, name, token) => Object.assign(
          makeGame(key, 'quiz', name === 'legacy'
            ? { scoringMode: token, timeBonus: '5', pointsPerCorrect: '100', duration: '20' }
            : { scoringMode: token, pointsPerCorrect: '100', duration: '20' }),
          { questions: [txquestion(kind)] });
        const txsnap = () => {
          const s = msnap();
          const input = document.getElementById('textAnswerInput');
          const btn = document.getElementById('textAnswerBtn');
          const hint = document.querySelector('[data-answer-hint]');
          const hintBox = document.getElementById('textAnswerHint');
          const rows = state.gameAnswers || [];
          const last = rows.length ? rows[rows.length - 1] : null;
          let view = null;
          try {
            view = typeof buildQuizView === 'function' ? buildQuizView() : null;
          } catch (ignored) {
            view = null;
          }
          const bannerText = text(document.getElementById('answerFeedback'));
          // Máy chiếu của một câu chữ KHÔNG có phương án để sơn: đúng hai trường
          // correctAnswer và answerText mới là chỗ đáp án có thể rò.
          s.hasBox = Boolean(input);
          s.inputOff = input ? Boolean(input.disabled) : null;
          s.btnOff = btn ? Boolean(btn.disabled) : null;
          s.hintOff = hint ? Boolean(hint.disabled) : null;
          s.hintShown = hintBox ? !hintBox.classList.contains('hidden') : null;
          s.typed = input ? String(input.value) : null;
          s.rowText = last ? String(last.answerText === undefined ? 'undef' : last.answerText) : null;
          s.rowSel = last ? String(last.selectedOptionId === undefined ? 'undef' : last.selectedOptionId) : null;
          s.rowElapsed = last ? Number(last.elapsedSeconds) : null;
          s.rowWrong = last ? Number(last.wrongAttempts) : null;
          s.rowMode = last ? String(last.mode) : null;
          s.rowCeil = last ? Number(last.maxPoints) : null;
          s.namesRight = bannerText.indexOf('Đáp án đúng:') !== -1;
          s.youSaid = bannerText.indexOf('Câu trả lời của bạn:') !== -1;
          s.notOpen = bannerText.indexOf('không mở đáp án') !== -1;
          s.retryWords = bannerText.indexOf('thử lại') !== -1;
          s.award90 = bannerText.indexOf('còn 90 điểm') !== -1;
          s.caught = bannerText.indexOf('điểm nhanh') !== -1;
          s.projCa = view ? String(view.correctAnswer === undefined ? 'undef' : view.correctAnswer) : 'noview';
          s.projAt = view ? String(view.answerText === undefined ? 'undef' : view.answerText) : 'noview';
          s.projRev = view ? String(view.revealed) : 'noview';
          s.projType = view ? String(view.type) : 'noview';
          s.projWhy = view ? String(view.explanation === undefined ? 'undef' : view.explanation) : 'noview';
          return s;
        };
        const txask = async (value, via) => {
          const input = document.getElementById('textAnswerInput');
          const btn = document.getElementById('textAnswerBtn');
          if (!input || !btn) return { error: 'no text answer box' };
          if (!input.disabled) input.value = value;
          if (via === 'enter') {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          } else {
            btn.click();
          }
          await sleep(300);
          const s = txsnap();
          s.via = via || 'button';
          return s;
        };
        /* Ba helper cuối chỉ là bản txsnap của mplay/mopen/mclose: msnap không biết gì về
           ô gõ, nên snapshot mở màn và snapshot cửa lấy từ msnap thiếu TẤT CẢ field chữ
           (hasBox, inputOff, projWhy...). Lần chạy đầu của mục này đỏ đúng bốn ô vì lý do
           đó — và đỏ kiểu này nguy hiểm hơn bình thường, vì field thiếu là undefined chứ
           không phải giá trị sai, nên một check viết ẩu sẽ "xanh" trên hư không. */
        const txplay = async game => {
          await mplay(game);
          return txsnap();
        };
        const txdoor = async () => {
          const b = document.querySelector('[data-answer-explain]');
          if (!b) {
            const s = txsnap();
            s.didClick = false;
            return s;
          }
          b.click();
          await sleep(300);
          const s = txsnap();
          s.didClick = true;
          return s;
        };
        const txclosed = async () => {
          const b = document.getElementById('answerExplainOkBtn');
          if (!b) return null;
          b.click();
          await sleep(240);
          return txsnap();
        };
        for (let k = 0; k < TXKINDS.length; k++) {
          const kind = TXKINDS[k];
          mwhy = TXWHY[kind];
          for (let m = 0; m < TXMODES.length; m++) {
            const cell = { type: kind, mode: TXMODES[m][0] };
            cell.right = TXRIGHT[kind];
            cell.wrong = TXWRONG[kind];
            cell.open = await txplay(txgame(kind + '-' + cell.mode + '-miss', kind, cell.mode, TXMODES[m][1]));
            cell.miss = await txask(cell.wrong);
            cell.retryTap = await txask(cell.right);
            cell.missDoor = await txdoor();
            cell.missClosed = await txclosed();
            cell.fresh = await txplay(txgame(kind + '-' + cell.mode + '-hit', kind, cell.mode, TXMODES[m][1]));
            cell.hit = await txask(cell.right, 'enter');
            cell.hitDoor = await txdoor();
            cell.hitClosed = await txclosed();
            out.text.push(cell);
          }
        }
        /* Ô ÂM TÍNH — Ghép cặp. Nó KHÔNG nằm trong ANSWER_MODE_TEMPLATES, nên một token
           nhét vào gameSetup.scoringMode của một game ghép cặp phải bị CHÍNH TẦNG LUẬT
           từ chối: không vòng trả lời, không nút Giải thích, cách chấm theo cặp còn
           nguyên. Unit test đã chốt danh sách template; đây là bằng chứng trên màn hình
           thật, nơi một renderer quên hỏi danh sách mới là lỗi thật. */
        out.matching = {};
        const matchToken = {
          id: 'am-' + RUN + '-matching-token', title: title('matching-token'), subject: 'Tự nhiên',
          grade: '3', template: 'matching', description: '', tags: [], sourceName: 'ui-check',
          createdAt: '2026-01-01T00:00:00.000Z',
          gameSetup: { scoringMode: TOKEN_CHALLENGE, pointsPerCorrect: '100' },
          questions: [],
          matchingGame: typeof defaultMatchingGame === 'function' ? defaultMatchingGame() : null
        };
        // Xoá sạch vòng của bề mặt TRƯỚC: playGame của Ghép cặp không mở vòng nào cả,
        // nên nếu state.answerTurn còn hiện ra sau khi chơi là nó của trò khác — và một
        // ô âm tính đọc phải vòng của ô trước thì ô đó không chứng minh được gì.
        state.answerTurn = null;
        state.treasurePlay = null;
        state.racePlay = null;
        mwhy = 'Định nghĩa A';
        out.matching.open = await mplay(matchToken);
        out.matching.cards = Array.prototype.slice.call(document.querySelectorAll('.match-card'))
          .map(c => c.getAttribute('data-match-side') + ':' + c.getAttribute('data-pair')).join(' ');
        out.matching.afterPair = await mtap('[data-match-side="left"][data-pair="p1"], [data-pair="p1"]');
        out.matching.afterPair2 = await mtap('[data-match-side="right"][data-pair="p1"]');
        out.matching.explainButtons = document.querySelectorAll('[data-answer-explain]').length;
        out.matching.rows = (state.gameAnswers || []).length;
        out.matching.matched = document.querySelectorAll('.match-card.matched, [data-match-side].matched').length;
        out.matching.footer = text(document.querySelector('#matchFeedback')).slice(0, 90);
        await closePlay();
      } catch (error) {
        out.matrix = { error: String(error && error.message || error) };
        try {
          await closePlay();
        } catch (ignored) {
          out.matrix.cleanupFailed = true;
        }
      }

      document.getElementById('modalRoot').innerHTML = '';
      if (typeof closeEditorPage === 'function') closeEditorPage();

      // Không để fixture lại trong kho của giáo viên.
      const all = await desktop.call('getLibrary');
      const mine = (all.games || []).filter(g => String(g.title || '').indexOf(PREFIX) === 0).map(g => g.id);
      out.cleanup = { deleted: mine.length, left: mine.length };
      if (mine.length) {
        await desktop.call('deleteGames', mine);
        const after = await desktop.call('getLibrary');
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
    // #223: ba mục, không còn hàng "Giữ hành vi hiện tại".
    check(template + ' editor lists exactly the three answer modes',
      JSON.stringify(field?.values) === JSON.stringify(MODE_TOKENS), JSON.stringify(field?.values));
    check(template + ' editor selects Thi đấu on a legacy game',
      field?.selected === MODE_TOKENS[0], JSON.stringify(field?.selected));
    check(template + ' editor hint names the points source',
      Boolean(field?.hint && field.hint.indexOf('Điểm mỗi câu') !== -1), String(field?.hint).slice(0, 90));
  }
  const matchField = report.editor?.matching;
  check('matching editor page really opened',
    Boolean(matchField?.editorOpen && matchField?.hasSaveBtn && matchField?.hasField), JSON.stringify(matchField));
  check('matching keeps the field hidden (its own pairing law)',
    Boolean(matchField?.hasField) && matchField.shown === false, JSON.stringify(matchField));
  check('the hidden matching field still lists the three modes',
    JSON.stringify(matchField?.values) === JSON.stringify(MODE_TOKENS), JSON.stringify(matchField?.values));

  // C. game cũ mở ra là "Thi đấu" và lần lưu đầu tiên ghi đúng token đó
  const legacy = saved(report.saved?.legacyUntouched);
  check('legacy game is found after saving', Boolean(legacy), brief(report.saved?.legacyUntouched));
  check('legacy game is saved as Thi đấu', legacy?.scoringMode === MODE_TOKENS[0], String(legacy?.scoringMode));
  check('legacy save keeps the speed bonus it pays', Boolean(legacy?.game?.gameSetup) && legacy.game.gameSetup.timeBonus === '5',
    String(legacy?.game?.gameSetup?.timeBonus));
  check('legacy save parks nothing', legacy?.hasPark === false, JSON.stringify(legacy?.park));

  // D. chọn một chế độ: token xuống đĩa, không cất gì
  const practice = saved(report.saved?.practicePick);
  check('picking Luyện tập stores the token', practice?.scoringMode === MODE_TOKENS[1], brief(report.saved?.practicePick));
  check('picking Luyện tập parks nothing', practice?.hasPark === false, JSON.stringify(practice?.park));
  check('the reopened editor reads the pick back', report.editor?.reopenedPractice?.selected === MODE_TOKENS[1],
    JSON.stringify(report.editor?.reopenedPractice?.selected));
  check('the reopened editor still lists exactly the three modes',
    JSON.stringify(report.editor?.reopenedPractice?.values) === JSON.stringify(MODE_TOKENS),
    JSON.stringify(report.editor?.reopenedPractice?.values));

  // E. một game cũ khác lưu lại: token Thi đấu, thưởng nhanh không bị xoá
  const speedKept = saved(report.saved?.speedKept);
  check('re-saving an old speed game writes the Thi đấu token', speedKept?.scoringMode === MODE_TOKENS[0],
    brief(report.saved?.speedKept));
  check('the speed bonus survives that save', Boolean(speedKept?.game?.gameSetup) && speedKept.game.gameSetup.timeBonus === '5',
    String(speedKept?.game?.gameSetup?.timeBonus));

  // F. game chưa từng cất chế độ nào (đường của Kho báu)
  const blankPick = saved(report.saved?.blankPick);
  check('a game with no stored mode accepts a pick', blankPick?.scoringMode === MODE_TOKENS[2], brief(report.saved?.blankPick));
  check('that pick parks nothing', blankPick?.hasPark === false, JSON.stringify(blankPick?.park));
  check('the reopened editor shows the pick it just saved',
    report.editor?.blankPickField?.selected === MODE_TOKENS[2], JSON.stringify(report.editor?.blankPickField?.selected));

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
    idx: s.index, house: s.house, dupes: s.dupes, exp: s.explainBtn
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
    /* Task 7 (#209): "earn" nghĩa là ĐƯỢC QUYỀN MỞ, không phải được đọc. Chữ vẫn cấm
       trên banner; cái nút thế chỗ nó — mục L đo tiếp rằng một cú nhấp mới dựng hộp.
       #213 đổi CHỖ của nút (banner → khe trái của dock), nên bằng chứng chuyển từ
       đọc chữ `#answerFeedback` sang đếm chính phần tử `[data-answer-explain]`:
       luật không đổi, chỉ vị trí đo đổi. */
    && !has(play.challengeCorrect, 'Bằng hai') && play.challengeCorrect?.explainBtn === true,
    view(play.challengeCorrect) + ' | ' + said(play.challengeCorrect));

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
  /* Dòng "Thảo luận" phải là một khối RIÊNG, chạy hết câu thảo luận, và mang đúng
     mực --world-ink của thế giới — kể cả nhãn in đậm, thứ mà `.feedback strong`
     và `.feedback.bad strong` trước đây nhuộm xanh/đỏ. */
  const disc = play.scenarioLegacyMiss?.discussion;
  check('the discussion prompt stands as its own block with the whole sentence',
    Boolean(disc) && disc.block === 'block' && disc.text === 'Thảo luận: Vì sao không tự rút khi dây còn ướt?',
    JSON.stringify(disc));
  /* Yêu cầu của chủ dự án: "chữ màu đen đồng bộ màu với câu hỏi". Nên phép đo
     đối chiếu với CHÍNH câu hỏi (.stage-question), không với nhãn kết luận — nhãn
     đó nằm trong banner và cũng có thể đã là mực thế giới. */
  check('the discussion prompt is painted in the world ink, not the red of a wrong decision',
    Boolean(disc) && disc.color === disc.worldInk && disc.strongColor === disc.worldInk
    && disc.color === disc.questionColor && disc.color !== 'rgb(124, 26, 48)',
    JSON.stringify(disc));
  /* #225: màn KHÔNG ảnh minh hoạ. Khối thảo luận phải MỞ RA thật (khung rộng, cao,
     không còn clip) — nếu luật :has(...) mất thì khối quay về ô 1×1 và câu thảo luận
     biến mất khỏi màn của cả lớp. Còn màn không có câu thảo luận thì #answerFeedback
     phải giữ nguyên dạng 1×1 ẩn, tức màn chơi không mọc thêm banner. */
  const noArtDisc = play.scenarioNoArtMiss?.discussion;
  const noArtFrame = play.scenarioNoArtMiss?.fbFrame;
  check('with the illustration off, the discussion block opens as a real, readable box',
    Boolean(noArtDisc) && noArtDisc.block === 'block' && Boolean(noArtFrame)
    && noArtFrame.position === 'static' && noArtFrame.clipPath === 'none'
    && noArtFrame.w > 400 && noArtFrame.h > 40
    && noArtDisc.color === noArtDisc.worldInk && noArtDisc.text === 'Thảo luận: Vì sao không tự rút khi dây còn ướt?',
    JSON.stringify({ discussion: noArtDisc, frame: noArtFrame }));
  /* Màn không có câu thảo luận: #answerFeedback phải quay lại dạng 1×1 ẩn. Không có
     phép đo này thì một luật quá tay (mở mọi #answerFeedback) vẫn xanh. */
  const quiet = play.scenarioQuietMiss;
  check('a decision without a discussion prompt keeps the hidden live region at 1x1',
    Boolean(quiet) && quiet.discussion === null && Boolean(quiet.fbFrame)
    && quiet.fbFrame.w <= 2 && quiet.fbFrame.h <= 2 && quiet.fbFrame.position === 'absolute'
    && quiet.fbFrame.clipPath !== 'none',
    JSON.stringify(quiet ? quiet.fbFrame : quiet));
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
    /* Task 7 (#209): `explain === true` là QUYỀN MỞ, không phải chữ đã in. Cả màn chơi
       lẫn bảng chiếu phải im cho tới một cú nhấp — mục L đo cú nhấp đó. */
    && !hasT(treasure.challengeHit, 'Bằng hai') && hasT(treasure.challengeHit, 'Giải thích')
    && treasure.challengeHit?.projection?.why === '',
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

  /* L. NÚT "GIẢI THÍCH" (nhiệm vụ 7). Lời giải không còn là thứ ĐƯỢC IN mà là thứ
     ĐƯỢC MỞ, nên mỗi điều phải đo là sự VẮNG mặt của nó trên màn chơi trước một cú
     nhấp và sự hiện diện của nó TRONG hộp sau cú nhấp đó. Máy chiếu được đo riêng vì
     nó là đường thứ hai tới đáp án: màn chính im mà bảng chiếu nói thì cả lớp vẫn nghe.
     Game legacy của Đấu trường cũng mở lời giải bằng nút; các game legacy khác giữ luật cũ. */
  const ex = report.explain || {};
  const exv = s => !s ? String(s) : s.error ? JSON.stringify(s) : JSON.stringify({
    btn: s.btn, open: s.open, dText: s.dText, dTitle: s.dTitle, dLaw: s.dLaw,
    boardWhy: s.boardWhy, quizWhy: s.quizWhy, treasureWhy: s.treasureWhy, playing: s.playing
  });
  const btnOn = s => String(s && s.btn || '').indexOf('Giải thích') !== -1;
  const btnOff = s => String(s && s.btn || '') === '';

  check('the explanation probes ran to completion', Boolean(ex.afterClose) && !ex.error,
    String(ex.error || 'ok'));

  // 1. Không tự hiện: banner chỉ còn cái nút.
  check('a correct answer in a token mode offers a button instead of printing the explanation',
    btnOn(ex.practiceHit) && ex.practiceHit?.boardWhy === false
    && ex.practiceHit?.open === false && ex.practiceHit?.quizWhy === '', exv(ex.practiceHit));
  check('one click really builds the dialog, inside #modalRoot where the board cannot wipe it',
    ex.practiceOpen?.open === true && ex.practiceOpen?.inRoot === true
    && ex.practiceOpen?.dText === 'Bằng hai.' && ex.practiceOpen?.boardWhy === false, exv(ex.practiceOpen));
  check('the dialog names the answer law it is running under and the question it answers',
    String(ex.practiceOpen?.dLaw || '').indexOf('Luyện tập') !== -1
    && String(ex.practiceOpen?.dLaw || '').indexOf('thử lại') !== -1
    && ex.practiceOpen?.dPrompt === 'Một cộng một bằng mấy?'
    && ex.practiceOpen?.dOk === 'Đã hiểu', exv(ex.practiceOpen));
  // 2. Máy chiếu: chỉ in sau cú nhấp của giáo viên, và ngừng in khi hộp đóng.
  check('the projector prints the explanation only after the teacher opened it',
    ex.practiceHit?.quizWhy === '' && ex.practiceOpen?.quizWhy === 'Bằng hai.'
    && ex.practiceOk?.quizWhy === '' && ex.practiceOk?.shown === null,
    exv(ex.practiceOpen) + ' | ' + exv(ex.practiceOk));
  check('the Đã hiểu button closes the dialog and leaves the game running',
    ex.practiceOk?.open === false && ex.practiceOk?.playing === true
    && btnOn(ex.practiceOk), exv(ex.practiceOk));

  // 3. Luyện tập đang thử lại: vòng còn mở thì không có cửa nào tới lời giải.
  check('a miss that leaves the question open offers no explanation door at all',
    btnOff(ex.practiceMiss) && ex.practiceMiss?.boardWhy === false
    && ex.practiceMiss?.open === false && ex.practiceMissOpen?.error !== undefined,
    exv(ex.practiceMiss) + ' | ' + JSON.stringify(ex.practiceMissOpen));

  // 4. Thử thách: câu sai thì lời giải cũng bị giữ kín; câu đúng thì được mở.
  check('a wrong Thử thách answer earns neither the text nor the button',
    btnOff(ex.challengeMiss) && ex.challengeMiss?.boardWhy === false
    && ex.challengeMiss?.quizWhy === '', exv(ex.challengeMiss));
  check('a correct Thử thách answer earns the button',
    btnOn(ex.challengeHit) && ex.challengeHit?.boardWhy === false
    && ex.challengeHit?.quizWhy === '', exv(ex.challengeHit));

  // 5. Escape là chỗ nguy hiểm nhất: shell.js buộc nó vào "thoát màn chơi".
  check('Escape closes the dialog but keeps the game open',
    ex.escapeOpen?.open === true && ex.escape?.open === false
    && ex.escape?.playing === true && btnOn(ex.escape)
    && ex.escape?.quizWhy === '' && ex.escape?.shown === null, exv(ex.escape));
  check('the cross closes the dialog just as quietly',
    ex.cross?.open === false && ex.cross?.playing === true
    && ex.cross?.quizWhy === '', exv(ex.cross));

  // 6. Thi đấu trên câu sai: luật mở đáp án thì cũng mở lời giải — qua cái nút.
  check('Thi đấu on a wrong answer reveals the explanation through the button',
    btnOn(ex.competitiveMiss) && ex.competitiveMiss?.boardWhy === false
    && ex.competitiveMiss?.open === false, exv(ex.competitiveMiss));

  // 7. Đấu trường legacy chỉ đổi cách mở lời giải; vẫn giữ nguyên luật trả lời.
  check('a legacy Arena game puts its explanation behind a button',
    btnOn(ex.legacyHit) && ex.legacyHit?.boardWhy === false
    && String(ex.legacyHit?.banner || '').indexOf('Bằng hai.') === -1
    && ex.legacyHit?.quizWhy === '', exv(ex.legacyHit));

  // 8. Hộp mở mà câu đã đổi là lỗi thật: nó phủ lên câu mới trước cả lớp.
  check('the next question retires an open dialog together with its button',
    ex.staleOpen?.open === true && ex.staleNext?.open === false
    && ex.staleNext?.playing === true && btnOff(ex.staleNext)
    && ex.staleNext?.shown === null, exv(ex.staleNext));

  // 9. Kho báu và Đường đua dùng CÙNG một cửa — không trò nào tự in lời giải nữa.
  check('Kho báu routes its stage explanation through the same button',
    btnOn(ex.treasureHit) && ex.treasureHit?.boardWhy === false
    && ex.treasureHit?.treasureWhy === '' && ex.treasureOpen?.open === true
    && ex.treasureOpen?.dText === 'Bằng hai.'
    && ex.treasureOpen?.treasureWhy === 'Bằng hai.'
    && ex.treasureOk?.open === false && ex.treasureOk?.treasureWhy === '',
    exv(ex.treasureHit) + ' | ' + exv(ex.treasureOpen) + ' | ' + exv(ex.treasureOk));
  check('Đường đua puts its explanation behind the same button too',
    btnOn(ex.raceHit) && ex.raceHit?.boardWhy === false
    && ex.raceOpen?.open === true && ex.raceOpen?.dText === 'Bằng hai.'
    && String(ex.raceOpen?.dLaw || '').indexOf('Thi đấu') !== -1, exv(ex.raceOpen));

  // 10. Tình huống: lời giải là feedback CỦA QUYẾT ĐỊNH, nên hộp phải đổi tên.
  check('a decision explains itself through the button, titled for the decision',
    btnOn(ex.scenarioHit) && String(ex.scenarioHit?.banner || '').indexOf('An toàn nhất.') === -1
    && ex.scenarioOpen?.open === true
    && String(ex.scenarioOpen?.dTitle || '').indexOf('Giải thích quyết định') !== -1
    && ex.scenarioOpen?.dText === 'An toàn nhất.', exv(ex.scenarioOpen));

  // 11. Ván đóng thì cờ máy chiếu đóng theo (shell.closePlaySurface).
  check('closing the play surface clears the projector flag with the game',
    ex.afterClose?.playing === false && ex.afterClose?.shown === null
    && ex.afterClose?.quizWhy === '', exv(ex.afterClose));

  /* M. MA TRẬN 4 TRÒ × 3 CHẾ ĐỘ (nhiệm vụ 8). Bảy mục trước đo TỪNG trò; mục này đo
     MỘT LUẬT trên năm bề mặt, nên mọi điều kiện đều chạy trên CẢ NHÓM ô và failure
     in ra ô nào sai. Kì vọng ở đây do KẾ HOẠCH #209 viết tay (một lần trả lời / trừ
     10% trên điểm nội dung / một ô cho Đường đua / không lộ khi Thử thách), KHÔNG
     đọc lại bảng answerRules của ứng dụng — nếu không, hai bên cùng sai một lỗi thì
     cổng vẫn xanh. Các con số tuyệt đối đã có mục I/J/K chốt hộ. */
  const mx = Array.isArray(report.matrix) ? report.matrix : null;
  const mcell = (surface, mode) => (mx || []).find(c => c.surface === surface && c.mode === mode) || null;
  const MMV = s => !s ? String(s) : s.error ? 'ERR:' + s.error : JSON.stringify({
    m: s.mode, open: s.open, retry: s.retry, click: s.clickable, rev: s.revealed, mark: s.marked,
    rows: s.rows, last: s.lastPts, pts: s.boardPts, house: s.house, earned: s.earned,
    prog: s.progress, rpts: s.racePts, exp: s.explain, dlg: s.dialog, why: s.whyLaw,
    law: s.law, proj: s.proj
  });
  /* `bad()` là CHI TIẾT in ra (một chuỗi), còn ĐIỀU KIỆN của mục là "danh sách ô lệch
     rỗng". Viết `bad(X).length === 0` thì điều kiện sai với MỌI ô, kể cả khi không có
     ô nào lệch — chính xác 11 mục đỏ của lần chạy đầu tiên. Hai việc tách làm hai helper. */
  const none = list => list.length === 0;
  const bad = list => (list || []).filter(Boolean).map(c => c.surface + '/' + c.mode).join(' ') || 'none';
  const MCELLS = mx || [];
  const MLOCKED = MCELLS.filter(c => c.mode !== 'practice');
  const MSILENT = MCELLS.filter(c => c.surface === 'race');
  const MEXPLAIN = MCELLS.filter(c => c.surface !== 'race');
  const mfirst = s => Number(String(s && s.progress || '0').split(',')[0]);
  // "Điểm" của một ô là đơn vị của CHÍNH bề mặt đó: Ô trên đường đua, điểm chặng đã
  // nhận ở Kho báu, tổng trên bảng điểm của ba trò còn lại.
  const mscoreOf = (c, s) => !s ? null : c.surface === 'race' ? mfirst(s)
    : c.surface === 'treasure' ? Number(s.earned) : Number(s.boardPts);
  const projHas = (s, why) => String(s && s.proj || '').indexOf('why=' + why) !== -1;
  // Bảng chiếu "sơn" một phương án: đúng cái trường mà màn chiếu dùng để tô đáp án.
  const projPaints = (s, id) => String(s && s.proj || '').indexOf('right=' + id) !== -1;
  // Mọi snapshot của một ô, kể cả các bước trung gian — một luật viết trên màn hình
  // thì phải giữ ở TẤT CẢ các bước, không chỉ bước vừa bấm.
  const msnaps = c => ['open', 'draw', 'fresh', 'freshDraw', 'miss', 'retryTap', 'missDoor',
    'missClosed', 'hit', 'hitDoor', 'hitClosed'].map(k => c[k]).filter(Boolean);
  // "Trước" = snapshot cuối cùng TRƯỚC cú bấm sai: Đường đua phải qua bốc câu hỏi,
  // bốn bề mặt kia là màn vừa mở.
  const mbefore = c => c.surface === 'race' ? c.draw : c.open;
  const MWHY = c => c.surface === 'scenario' ? 'An toàn nhất.' : 'Bằng hai.';
  const MWRONGWHY = c => c.surface === 'scenario' ? 'Còn rủi ro.' : 'Bằng hai.';
  const MHINT = { competitive: 'Trả lời một lần', practice: 'Sai được thử lại', challenge: 'KHÔNG mở đáp án' };

  check('the matrix ran all fifteen surface x mode cells', Boolean(mx) && mx.length === 15,
    mx ? mx.length + ' cells' : JSON.stringify(report.matrix));
  check('every surface opens a turn that reports the mode its token claims',
    none(MCELLS.filter(c => {
      const b = mbefore(c);
      return !b || b.error || b.mode !== c.mode;
    })), MCELLS.length + ' cells | bad: ' + bad(MCELLS.filter(c => {
      const b = mbefore(c);
      return !b || b.error || b.mode !== c.mode;
    })));

  // 1. Khoá: sau một cú đã khép vòng, cú bấm thứ hai KHÔNG được đổi gì — điểm, số
  //    dòng, đáp án hiện hay lưới. Bốn bề mặt, hai chế độ, tám ô.
  check('a locked cell changes nothing between the wrong tap and the right tap',
    none(MLOCKED.filter(c => {
      const a = c.miss, b = c.retryTap;
      if (!a || !b || a.error || b.error) return true;
      return a.rows !== b.rows || a.lastPts !== b.lastPts || a.boardPts !== b.boardPts
        || a.earned !== b.earned || a.progress !== b.progress || a.racePts !== b.racePts
        || a.revealed !== b.revealed || a.clickable !== b.clickable;
    })), 'bad: ' + bad(MLOCKED.filter(c => {
      const a = c.miss, b = c.retryTap;
      if (!a || !b || a.error || b.error) return true;
      return a.rows !== b.rows || a.lastPts !== b.lastPts || a.boardPts !== b.boardPts
        || a.earned !== b.earned || a.progress !== b.progress || a.racePts !== b.racePts
        || a.revealed !== b.revealed || a.clickable !== b.clickable;
    })));
  check('a second tap on a locked cell still writes no extra score row',
    none(MLOCKED.filter(c => !c.retryTap || c.retryTap.rows !== c.miss.rows)),
    'bad: ' + bad(MLOCKED.filter(c => !c.retryTap || c.retryTap.rows !== c.miss.rows)));

  // 2. Lộ / giữ kín đáp án — khác biệt thật giữa Thi đấu và Thử thách. Hai bề mặt của
  //    cùng một câu phải cùng một luật, nên Thi đấu còn phải được TÔ trên máy chiếu,
  //    và không bước nào của Tình huống được tô "quyết định đúng" (quyết định #6).
  check('Thi đấu paints the right option on the board and on the projector',
    none(MCELLS.filter(c => {
      if (c.mode !== 'competitive' || c.surface === 'scenario') return false;
      const grid = String((c.miss || {}).revealed || '').indexOf(c.right) !== -1;
      // Đường đua không có trường "correctOptionId" trên bảng chiếu: màn chiếu của nó
      // chỉ vẽ đội, ô và câu hỏi — nên ở đó chỉ lưới của màn chính chứng minh được.
      const proj = c.surface === 'race' ? true : projPaints(c.miss, c.right);
      return !(grid && proj);
    })), 'bad: ' + bad(MCELLS.filter(c => {
      if (c.mode !== 'competitive' || c.surface === 'scenario') return false;
      const grid = String((c.miss || {}).revealed || '').indexOf(c.right) !== -1;
      const proj = c.surface === 'race' ? true : projPaints(c.miss, c.right);
      return !(grid && proj);
    })));
  check('Thử thách paints nothing and only marks the choice that was made',
    none(MCELLS.filter(c => c.mode === 'challenge' && c.surface !== 'scenario'
      && (String(c.miss.revealed || '') !== '' || String(c.miss.marked || '').indexOf(c.wrong) === -1))),
    'bad: ' + bad(MCELLS.filter(c => c.mode === 'challenge' && c.surface !== 'scenario'
      && (String(c.miss.revealed || '') !== '' || String(c.miss.marked || '').indexOf(c.wrong) === -1))));
  check('no mode ever paints a situation decision as "the correct one"',
    none(MCELLS.filter(c => c.surface === 'scenario' && msnaps(c).some(s =>
      String(s.revealed || '').indexOf(c.right) !== -1 || projPaints(s, c.right)))),
    'bad: ' + bad(MCELLS.filter(c => c.surface === 'scenario' && msnaps(c).some(s =>
      String(s.revealed || '').indexOf(c.right) !== -1 || projPaints(s, c.right)))));
  check('the projector is as silent as the board in Thử thách',
    none(MCELLS.filter(c => c.mode === 'challenge'
      && (projHas(c.miss, MWHY(c)) || projHas(c.retryTap, MWHY(c))))),
    'bad: ' + bad(MCELLS.filter(c => c.mode === 'challenge'
      && (projHas(c.miss, MWHY(c)) || projHas(c.retryTap, MWHY(c))))));

  // 3. Luyện tập: câu còn mở, chưa có dòng điểm nào, lưới còn bấm.
  check('Luyện tập leaves every surface open after a miss',
    none(MCELLS.filter(c => c.mode === 'practice'
      && (!c.miss.open || c.miss.retry !== true || !(c.miss.clickable > 0)))),
    'bad: ' + bad(MCELLS.filter(c => c.mode === 'practice'
      && (!c.miss.open || c.miss.retry !== true || !(c.miss.clickable > 0)))));
  /* Một cú sai ở Luyện tập KHÔNG được để lại điểm. Đơn vị là Ô (Đường đua), điểm chặng
     (Kho báu) hay tổng bảng điểm (ba trò còn lại), và phải so với snapshot NGAY TRƯỚC
     của chính ô đó chứ không so với 0: playGame chỉ dựng lại bảng trả lời cho dòng
     Đấu trường (shell.ts:59), còn Đường đua và Kho báu chấm vào trạng thái riêng nên
     mảng dùng chung của chúng có thể còn dòng của ván đi trước — chữ đó không màn hình
     nào đọc lại (result-screen.ts:312 chọn bảng chiếu theo template), nên bắt nó bằng 0
     chỉ là đỏ vì harness. */
  const mpracticeSilent = c => {
    if (c.mode !== 'practice') return false;
    const before = mbefore(c);
    if (mscoreOf(c, c.miss) !== mscoreOf(c, before)) return true;
    if (c.surface === 'race') return String(c.miss.racePts) !== String(before.racePts);
    return c.miss.rows !== before.rows || c.retryTap.rows !== before.rows + 1;
  };
  check('a Luyện tập miss scores nothing yet on all five surfaces',
    none(MCELLS.filter(mpracticeSilent)), 'bad: ' + bad(MCELLS.filter(mpracticeSilent)));

  // 4. Phạt 10% trên ĐIỂM NỘI DUNG của chính câu — cơ số mà kế hoạch #209 chốt.
  check('the answer after a Luyện tập miss pays 90 of 100 on the three point surfaces',
    none(['classic', 'house', 'scenario'].map(k => mcell(k, 'practice')).filter(c => !c
      || c.retryTap.lastPts !== 90 || c.retryTap.boardPts !== 90)),
    'bad: ' + bad(['classic', 'house', 'scenario'].map(k => mcell(k, 'practice')).filter(c => !c
      || c.retryTap.lastPts !== 90 || c.retryTap.boardPts !== 90)));
  check('Kho báu taxes only the stage content: 100 minus 10 plus the whole 50 bonus',
    (() => {
      const c = mcell('treasure', 'practice');
      return Boolean(c) && c.retryTap.lastPts === 140 && c.retryTap.earned === 140;
    })(), MMV(mcell('treasure', 'practice') && mcell('treasure', 'practice').retryTap));
  check('Đường đua taxes its own content points but never the step it earned',
    (() => {
      const c = mcell('race', 'practice');
      return Boolean(c) && Number(String(c.retryTap.racePts || '0').split(',')[0]) === 90
        && mfirst(c.retryTap) - mfirst(c.draw) === 1;
    })(), MMV(mcell('race', 'practice') && mcell('race', 'practice').retryTap));

  // 5. Đúng ngay thì không có gì để trừ: trần điểm đầy đủ trên cả năm bề mặt.
  check('a first-time correct answer pays the whole ceiling on every surface',
    none(MCELLS.filter(c => {
      if (c.surface === 'race') return Number(String(c.hit.racePts || '0').split(',')[0]) !== 100;
      if (c.surface === 'treasure') return c.hit.earned !== 150 || c.hit.lastPts !== 150;
      return c.hit.lastPts !== 100;
    })),
    'bad: ' + bad(MCELLS.filter(c => {
      if (c.surface === 'race') return Number(String(c.hit.racePts || '0').split(',')[0]) !== 100;
      if (c.surface === 'treasure') return c.hit.earned !== 150 || c.hit.lastPts !== 150;
      return c.hit.lastPts !== 100;
    })));

  // 6. Đường đua: dữ liệu vẫn bật "Tiến theo độ khó" và câu là loại KHÓ — ba ô vẫn
  //    phải đi ĐÚNG MỘT ô. Đây là quyết định "bỏ hẳn phần thưởng tốc độ" của chủ dự án.
  check('Đường đua advances one cell per correct answer whatever the data says',
    none(MCELLS.filter(c => c.surface === 'race' && mfirst(c.hit) - mfirst(c.draw) !== 1)),
    'bad: ' + bad(MCELLS.filter(c => c.surface === 'race' && mfirst(c.hit) - mfirst(c.draw) !== 1)));
  check('the race strip promises one cell, not the difficulty table it ignored',
    ['competitive', 'practice', 'challenge'].every(k => {
      const c = mcell('race', k);
      return Boolean(c) && String(c.draw.law || '').indexOf('Tiến 1 ô/câu đúng') !== -1;
    }), ['competitive', 'practice', 'challenge'].map(k => {
      const c = mcell('race', k);
      return k + ': ' + String(c && c.draw && c.draw.law);
    }).join(' | '));

  // 7. Chữ của luật trên màn: mỗi bề mặt phải TỰ nói luật nào đang chạy.
  check('every surface prints the hint of the mode it is running',
    none(MCELLS.filter(c => !String((mbefore(c) || {}).law || '').includes(MHINT[c.mode]))),
    'bad: ' + bad(MCELLS.filter(c => !String((mbefore(c) || {}).law || '').includes(MHINT[c.mode]))));

  /* 8. Cửa lời giải (nhiệm vụ 7) đo trên CẢ NĂM bề mặt, không chỉ Đấu trường.
     `inlineWhy` là TÊN THẬT của field trong msnap; mục này từng đọc `c.hit.inline`, một
     field không tồn tại, nên vế "thay vì in chữ" xanh suốt mà không đo gì. Đổi lại tên
     thật ở cả hai mục để vế đó có răng. */
  check('a correct answer offers the button instead of the text, on all fifteen cells',
    none(MCELLS.filter(c => !String(c.hit.explain || '').includes('Giải thích')
      || c.hit.inlineWhy === true || !c.hitDoor.didClick || c.hitDoor.dialog !== MWHY(c))),
    'bad: ' + bad(MCELLS.filter(c => !String(c.hit.explain || '').includes('Giải thích')
      || c.hit.inlineWhy === true || !c.hitDoor.didClick || c.hitDoor.dialog !== MWHY(c))));
  /* Bốn bề mặt CÓ ngăn lời giải trên máy chiếu (Đấu trường, Xây nhà, Tình huống, Kho
     báu): một cú nhấp là đủ đưa chữ sang. Đường đua thì khác — buildRaceView() chỉ trả
     về đội, ô, câu hỏi và lastEvent, KHÔNG có explanation/revealed/correctOptionId, nên
     nó không có cửa nào để mở và cũng không có chữ nào để lộ. Mục dưới đứng ở đó để
     một lần thêm ngăn lời giải cho Đường đua mà quên luật sẽ bị đỏ ngay. */
  check('one click per surface is enough to put the text on the projector too',
    none(MEXPLAIN.filter(c => projHas(c.hit, MWHY(c)) || !projHas(c.hitDoor, MWHY(c)))),
    'bad: ' + bad(MEXPLAIN.filter(c => projHas(c.hit, MWHY(c)) || !projHas(c.hitDoor, MWHY(c)))));
  check('Đường đua has no projector explanation slot, so nothing can leak onto it',
    MSILENT.length === 3 && MSILENT.every(c => msnaps(c).length >= 8
      && msnaps(c).every(s => String(s.proj || '').indexOf('why=') !== -1
        && !projHas(s, MWHY(c)))), MSILENT.map(c => c.mode + ': ' + String(c.hitDoor.proj)).join(' | '));
  check('closing the dialog puts the projector back to silence on every surface',
    none(MCELLS.filter(c => !c.hitClosed || c.hitClosed.dialog !== '' || projHas(c.hitClosed, MWHY(c)))),
    'bad: ' + bad(MCELLS.filter(c => !c.hitClosed || c.hitClosed.dialog !== '' || projHas(c.hitClosed, MWHY(c)))));
  /* Cửa lời giải của MỘT CÚ SAI, đo trên nút của snapshot NGAY SAU cú sai đó: chỉ Thi
     đấu được mở (kế hoạch #209 — sai ở Thử thách thì kín; sai ở Luyện tập thì câu còn
     mở, học sinh còn được thử lại nên chưa có gì để giải thích). Không được dùng cú
     nhấp sau đó: ở Luyện tập cú thứ hai là một câu trả lời ĐÚNG hợp lệ và nút của nó
     xuất hiện là đúng luật, nên ô nào cũng phải lấy `miss`, không lấy `missDoor`. */
  const mmissDoor = c => String(c.miss.explain || '').includes('Giải thích') !== (c.mode === 'competitive');
  check('a miss offers the Giải thích button only in Thi đấu',
    none(MCELLS.filter(mmissDoor)),
    'bad: ' + bad(MCELLS.filter(mmissDoor)) + ' | ' + MCELLS.filter(c => c.mode !== 'competitive')
      .map(c => c.surface + '/' + c.mode + '="' + String(c.miss.explain) + '"').join(' '));
  /* Và khi Thi đấu mở cửa bằng một cú nhấp thật, chữ sau cửa là chữ CỦA LỰA CHỌN SAI.
     Chỉ năm ô Thi đấu có cửa này — vì thế vị từ phải LÀM NGAY với 10 ô còn lại, chứ
     không trả về "đạt" cho chúng: `c.mode !== 'competitive' || ...` đánh dấu đúng 10 ô
     đó là lỗi, tức cả ma trận đỏ dù năm cửa thật đều in đúng chữ. */
  const mcompetitiveDoor = c => c.mode === 'competitive'
    && (!c.missDoor || !c.missDoor.didClick || c.missDoor.dialog !== MWRONGWHY(c));
  check('the Thi đấu door of a miss names the choice the class just made',
    none(MCELLS.filter(mcompetitiveDoor)),
    'bad: ' + bad(MCELLS.filter(mcompetitiveDoor)) + ' | ' + MCELLS.filter(c => c.mode === 'competitive')
      .map(c => c.surface + '="' + String(c.missDoor.dialog) + '"').join(' '));
  check('no cell of the matrix prints its explanation unasked',
    none(MCELLS.filter(c => c.miss.inlineWhy === true || c.hit.inlineWhy === true
      || c.retryTap.inlineWhy === true || (c.missClosed && c.missClosed.dialog !== ''))),
    'bad: ' + bad(MCELLS.filter(c => c.miss.inlineWhy === true || c.hit.inlineWhy === true
      || c.retryTap.inlineWhy === true || (c.missClosed && c.missClosed.dialog !== '')))
    + ' | ' + MCELLS.map(c => c.surface + '/' + c.mode + '=[' + [c.miss && c.miss.inlineWhy,
      c.hit && c.hit.inlineWhy, c.retryTap && c.retryTap.inlineWhy].join(',') + ']').join(' '));

  // 9. Ô ÂM TÍNH: Ghép cặp mang token phải bị tầng luật từ chối. Cách chấm theo cặp
  //    là việc của ui-matching-finish-check; ở đây chỉ hỏi #209 đã lọt vào chưa.
  const mt = report.matching || {};
  check('a matching game carrying a token opens no answer turn at all',
    Boolean(mx) && mt.open && !mt.open.error && mt.open.mode === null
    && mt.open.retry !== true && mt.open.rows === 0, MMV(mt.open));
  check('the matching board still renders its own pairs and never grows a Giải thích button',
    String(mt.cards || '').indexOf('left:p1') !== -1 && mt.explainButtons === 0
    && mt.matched >= 1, JSON.stringify({ cards: mt.cards, btns: mt.explainButtons, matched: mt.matched, footer: mt.footer }));

  // Không có ô nào của ma trận được phép chết giữa đường: một lỗi DOM ở ô 7 sẽ cắt
  // mất 8 ô sau đó mà báo cáo vẫn "xanh" nếu chỉ đếm số ô.
  check('no cell of the matrix lost a snapshot on the way',
    MCELLS.every(c => ['open', 'miss', 'retryTap', 'missDoor', 'fresh', 'hit', 'hitDoor', 'hitClosed']
      .every(k => c[k] && !c[k].error)),
    bad(MCELLS.filter(c => ['open', 'miss', 'retryTap', 'missDoor', 'fresh', 'hit', 'hitDoor', 'hitClosed']
      .some(k => !c[k] || c[k].error))));

  /* O. CÂU HỎI DẠNG CHỮ nhân BỐN CÁCH TRẢ LỜI — chỗ trống thật duy nhất còn lại của #209.
     Nợ ghi ở bàn giao task 4: quiz.ts:242-253 khoá ô gõ + nút gửi + chip gợi ý theo
     NOT turn.retryAllowed, nhưng mọi mục trước chỉ bấm LƯỚI ĐÁP ÁN nên hành vi đó mới có
     bằng chứng code. Kì vọng dưới đây viết tay theo kế hoạch (MỘT lượt ở legacy/Thi đấu/
     Thử thách, nhiều lượt ở Luyện tập; trần phạt 100 = points của câu; không phương án nào
     được sơn vì lưới không tồn tại; máy chiếu phải kín đúng như màn chính), KHÔNG đọc lại
     bảng answerRules của ứng dụng — hai bên cùng sai một lỗi thì cổng vẫn xanh. */
  const tx = Array.isArray(report.text) ? report.text : null;
  const TXCELLS = tx || [];
  const TXLOCKED = TXCELLS.filter(c => c.mode !== 'practice');
  const TXNEW = TXCELLS.filter(c => c.mode !== 'legacy');
  const TXKEYS = ['open', 'miss', 'retryTap', 'missDoor', 'fresh', 'hit', 'hitDoor'];
  const TXV = s => !s ? String(s) : s.error ? 'ERR:' + s.error : JSON.stringify({
    m: s.mode, open: s.open, retry: s.retry, wrongs: s.wrongs, ceil: s.ceiling,
    off: [s.inputOff, s.btnOff, s.hintOff], typed: s.typed, rows: s.rows, last: s.lastPts,
    pts: s.boardPts, txt: s.rowText, sel: s.rowSel, el: s.rowElapsed, reveal: s.namesRight,
    notOpen: s.notOpen, award: s.award90, caught: s.caught, exp: s.explain, dlg: s.dialog,
    inline: s.inlineWhy, why: s.whyLaw, you: s.youSaid, law: s.law, click: s.clickable,
    hint: s.hintShown,
    proj: [s.projRev, 'ca=' + s.projCa, 'at=' + s.projAt, 'why=' + String(s.projWhy).slice(0, 24)]
  });
  const badtx = list => list.map(c => c.type + '/' + c.mode).join(' ') || 'none';
  const txwhy = c => c.type === 'fill-in-blank' ? 'Bằng hai.' : 'Cá thở bằng mang nên sống dưới nước.';

  check('the text matrix ran all eight kind x mode cells', Boolean(tx) && TXCELLS.length === 8,
    tx ? TXCELLS.length + ' cells | bad: ' + badtx(TXCELLS.filter(c => !c.right || !c.wrong)) : JSON.stringify(report.text));
  // Ô chữ phải là Ô CHỮ: có input, có nút gửi, KHÔNG có lưới phương án nào để sơn, và
  // máy chiếu vẫn mang ĐÚNG loại câu (một màn chiếu mất `type` là mất cả nhãn).
  check('every text cell really draws a typed-answer box and no option grid',
    none(TXCELLS.filter(c => !c.open || c.open.error || c.open.hasBox !== true
      || c.open.clickable !== 0 || c.open.rows !== 0 || c.open.projType !== c.type)),
    badtx(TXCELLS.filter(c => !c.open || c.open.error || c.open.hasBox !== true
      || c.open.clickable !== 0 || c.open.rows !== 0 || c.open.projType !== c.type))
    + ' | ' + TXCELLS.map(c => JSON.stringify([c.type, c.open && c.open.projType,
      c.open && c.open.clickable, c.open && c.open.hasBox])).join(' ~~ '));
  check('a text cell opens a turn reporting the mode its token claims and a ceiling of 100',
    none(TXCELLS.filter(c => !c.open || c.open.error || c.open.mode !== c.mode
      || c.open.ceiling !== 100 || c.open.open !== true)),
    TXCELLS.map(c => TXV(c.open)).join(' ~~ '));
  // Trước cú trả lời đầu tiên, cả ba control còn bật — kể cả chip gợi ý (đỏ giả đã đo:
  // một helper đọc nhầm phần tử sẽ làm cả mục này vô nghĩa nên hintShown được đòi ở đây).
  check('before the first answer the box, the send button and the hint chip are all live',
    none(TXCELLS.filter(c => !c.open || c.open.inputOff !== false || c.open.btnOff !== false
      || c.open.hintOff !== false || c.open.hintShown !== false)),
    badtx(TXCELLS.filter(c => !c.open || c.open.inputOff !== false || c.open.btnOff !== false
      || c.open.hintOff !== false || c.open.hintShown !== false)));

  // Một câu SAI. Ba luật khoá ghi ĐÚNG MỘT dòng 0 điểm rồi tắt sạch ba control;
  // Luyện tập thì KHÔNG ghi dòng nào và để nguyên mọi control cho lần gõ sau.
  check('a wrong typing closes the turn with exactly one zero row on the three locking laws',
    none(TXLOCKED.filter(c => !c.miss || c.miss.rows !== 1 || c.miss.lastPts !== 0
      || c.miss.wrongs !== 1 || c.miss.open !== false || c.miss.retry !== false)),
    badtx(TXLOCKED.filter(c => !c.miss || c.miss.rows !== 1 || c.miss.lastPts !== 0
      || c.miss.wrongs !== 1 || c.miss.open !== false || c.miss.retry !== false))
    + ' | ' + TXLOCKED.map(c => TXV(c.miss)).join(' ~~ '));
  check('a locked law switches the box, the send button and the hint chip off together',
    none(TXLOCKED.filter(c => !c.miss || c.miss.inputOff !== true || c.miss.btnOff !== true
      || c.miss.hintOff !== true || c.miss.hintShown !== false)),
    badtx(TXLOCKED.filter(c => !c.miss || c.miss.inputOff !== true || c.miss.btnOff !== true
      || c.miss.hintOff !== true || c.miss.hintShown !== false))
    + ' | ' + TXLOCKED.map(c => JSON.stringify([c.mode, [c.miss && c.miss.inputOff,
      c.miss && c.miss.btnOff, c.miss && c.miss.hintOff], c.miss && c.miss.hintShown])).join(' ~~ '));
  check('practice writes NO row for a wrong typing and keeps every control live for the next one',
    none(TXCELLS.filter(c => c.mode === 'practice' && (!c.miss || c.miss.rows !== 0
      || c.miss.wrongs !== 1 || c.miss.open !== true || c.miss.retry !== true
      || c.miss.inputOff !== false || c.miss.btnOff !== false || c.miss.hintOff !== false))),
    TXCELLS.filter(c => c.mode === 'practice').map(c => TXV(c.miss)).join(' ~~ '));
  // Chữ "còn 90 điểm" là answerTurnAward nói TRƯỚC điểm sẽ nhận, không phải một lời hứa.
  check('practice names the 90 points the question is still worth after one wrong typing',
    none(TXCELLS.filter(c => c.mode === 'practice' && (!c.miss || c.miss.award90 !== true
      || c.miss.retryWords !== true))),
    TXCELLS.filter(c => c.mode === 'practice').map(c => TXV(c.miss) + ' banner=' + String(c.miss && c.miss.banner)).join(' ~~ '));
  check('practice pays 90 of 100 in ONE row when the second typing is right',
    none(TXCELLS.filter(c => c.mode === 'practice' && (!c.retryTap || c.retryTap.rows !== 1
      || c.retryTap.lastPts !== 90 || c.retryTap.boardPts !== 90 || c.retryTap.wrongs !== 1
      || c.retryTap.open !== false || c.retryTap.rowText !== c.right
      || c.retryTap.rowSel !== 'null' || c.retryTap.inputOff !== true))),
    TXCELLS.filter(c => c.mode === 'practice').map(c => TXV(c.retryTap)).join(' ~~ '));
  // Cú bấm thứ hai trên một ô đã khoá phải là KHÔNG CÓ HẬU QUẢ (nút tắt nên txask cũng
  // không ghi đè chữ): không dòng mới, không điểm mới, không lộ thêm, ô vẫn mang chữ sai.
  check('the second tap on a locked law changes nothing at all, not even the typed words',
    none(TXLOCKED.filter(c => !c.retryTap || c.retryTap.rows !== c.miss.rows
      || c.retryTap.lastPts !== c.miss.lastPts || c.retryTap.boardPts !== c.miss.boardPts
      || c.retryTap.wrongs !== c.miss.wrongs || c.retryTap.namesRight !== c.miss.namesRight
      || c.retryTap.typed !== c.miss.typed || c.retryTap.projCa !== c.miss.projCa)),
    badtx(TXLOCKED.filter(c => !c.retryTap || c.retryTap.rows !== c.miss.rows
      || c.retryTap.lastPts !== c.miss.lastPts || c.retryTap.boardPts !== c.miss.boardPts
      || c.retryTap.wrongs !== c.miss.wrongs || c.retryTap.namesRight !== c.miss.namesRight
      || c.retryTap.typed !== c.miss.typed || c.retryTap.projCa !== c.miss.projCa))
    + ' | ' + TXLOCKED.map(c => TXV(c.retryTap)).join(' ~~ '));

  // LỘ ĐÁP ÁN SAU CÂU SAI: game cũ + Thi đấu nói ra; Thử thách im lặng ở CẢ hai bề mặt.
  check('a wrong typing names the written key on legacy and competitive only',
    none(TXCELLS.filter(c => !c.miss || c.miss.namesRight
      !== (c.mode === 'legacy' || c.mode === 'competitive'))),
    badtx(TXCELLS.filter(c => !c.miss || c.miss.namesRight
      !== (c.mode === 'legacy' || c.mode === 'competitive')))
    + ' | ' + TXCELLS.map(c => TXV(c.miss)).join(' ~~ '));
  check('the projector carries the key exactly where the board carried it, and nowhere else',
    none(TXCELLS.filter(c => !c.miss || c.miss.projCa
      !== ((c.mode === 'legacy' || c.mode === 'competitive') ? c.right : ''))),
    badtx(TXCELLS.filter(c => !c.miss || c.miss.projCa
      !== ((c.mode === 'legacy' || c.mode === 'competitive') ? c.right : '')))
    + ' | ' + TXCELLS.map(c => JSON.stringify([c.mode, c.miss && c.miss.proj])).join(' ~~ '));
  /* Câu SAI ở Thử thách: không chữ nào của đáp án xuất hiện trên HAI bề mặt và không có
     lời giải. Ghi chú trung thực: với một câu chữ, banner lặp lại CHỮ CỦA HỌC SINH chứ
     không nói câu 'Cách trả lời này không mở đáp án.' (quiz.ts:344 để nhánh textQ thắng
     nhánh đó) — lời của chế độ vẫn còn ở dải tip, nên đây là chữ khác nhau giữa hai loại
     câu, không phải đáp án bị lộ. Check này đo đúng điều app thật hứa. */
  /* Ba mục dưới đây chỉ đo MỘT chế độ, nên bộ lọc phải là `mode === x && hỏng`, không
     phải `mode !== x || hỏng` — dạng thứ hai khai mọi ô khác chế độ đó là vi phạm, và
     một ô chữ thật thì luôn có ít nhất một điều chưa hứa, nên check đỏ trên hư không.
     (Đỏ giả lần 1 chính là ba predicate này.) */
  check('challenge reveals neither the key nor the words of the law it hides',
    none(TXCELLS.filter(c => c.mode === 'challenge' && (!c.miss || c.miss.namesRight !== false
      || c.miss.whyLaw !== false || c.miss.youSaid !== true || c.miss.explain !== ''
      || c.miss.inlineWhy === true))),
    TXCELLS.filter(c => c.mode === 'challenge').map(c => TXV(c.miss)).join(' ~~ '));

  // S2: ĐÚNG + ENTER. Enter là đường thứ hai tới cùng một submit (quiz.ts:132) và chưa
  // từng được đo trên DOM; từ đây mọi luật phải trả đủ điểm và lộ chữ đúng trên CẢ hai
  // bề mặt, vì không có gì để giấu khi học sinh đã làm đúng.
  check('every correct typing was submitted with the ENTER key, not with the button',
    none(TXCELLS.filter(c => !c.hit || c.hit.via !== 'enter' || c.hit.rows !== 1
      || c.hit.inputOff !== true)),
    badtx(TXCELLS.filter(c => !c.hit || c.hit.via !== 'enter' || c.hit.rows !== 1
      || c.hit.inputOff !== true)));
  check('the record carries the typed words and NO option id, in every law and both kinds',
    none(TXCELLS.filter(c => !c.hit || c.hit.rowText !== c.right || c.hit.rowSel !== 'null'
      || c.hit.rowMode !== c.mode || c.hit.rows !== 1)),
    badtx(TXCELLS.filter(c => !c.hit || c.hit.rowText !== c.right || c.hit.rowSel !== 'null'
      || c.hit.rowMode !== c.mode || c.hit.rows !== 1))
    + ' | ' + TXCELLS.map(c => JSON.stringify([c.mode, c.hit && c.hit.rowText,
      c.hit && c.hit.rowSel, c.hit && c.hit.rowMode, c.hit && c.hit.rowCeil])).join(' ~~ '));
  // Legacy vẫn mang thưởng nhanh (đúng hành vi cũ), ba chế độ mới thì không: token bị
  // runtime.ts:11 map về 'cơ bản'. elapsed do CHÍNH dòng điểm trả về nên không đua đồng hồ.
  check('the old game keeps its speed bonus for a typed answer and the three new laws pay flat',
    none(TXCELLS.filter(c => {
      if (!c.hit) return true;
      if (c.mode === 'legacy') {
        const due = Number(c.hit.rowElapsed) <= 8 ? 105 : 100;
        return c.hit.lastPts !== due || c.hit.caught !== (due > 100);
      }
      return c.hit.lastPts !== 100 || c.hit.caught !== false;
    })),
    TXCELLS.map(c => JSON.stringify([c.mode, c.hit && c.hit.lastPts, c.hit && c.hit.rowElapsed,
      c.hit && c.hit.caught, c.hit && c.hit.boardPts])).join(' ~~ '));
  check('a correct typing reveals the key on both surfaces, even in challenge',
    none(TXCELLS.filter(c => !c.hit || c.hit.namesRight !== true
      || c.hit.projCa !== c.right || c.hit.projAt !== c.right || c.hit.projRev !== 'true')),
    badtx(TXCELLS.filter(c => !c.hit || c.hit.namesRight !== true
      || c.hit.projCa !== c.right || c.hit.projAt !== c.right || c.hit.projRev !== 'true'))
    + ' | ' + TXCELLS.map(c => TXV(c.hit)).join(' ~~ '));

  // LỜI GIẢI: Đấu trường dùng nút cả trong game legacy; chữ chỉ hiện sau cú nhấp.
  // Luyện tập đang mở vòng thì CHƯA có cánh cửa: lời giải của một câu chưa khép là một
  // lời đáp án đi sớm.
  check('a legacy Arena quiz keeps its explanation behind a button',
    none(TXCELLS.filter(c => c.mode === 'legacy' && (!c.hit || c.hit.inlineWhy === true
      || String(c.hit.explain || '').indexOf('Giải thích') === -1
      || c.hit.whyLaw !== true || String(c.hit.projWhy || '') !== ''))),
    TXCELLS.filter(c => c.mode === 'legacy').map(c => TXV(c.hit)).join(' ~~ '));
  check('the three new laws keep the words behind a door on a text screen too',
    none(TXNEW.filter(c => !c.hit || c.hit.inlineWhy === true
      || String(c.hit.explain || '').indexOf('Giải thích') === -1
      || String(c.hit.projWhy || '') !== '')),
    badtx(TXNEW.filter(c => !c.hit || c.hit.inlineWhy === true
      || String(c.hit.explain || '').indexOf('Giải thích') === -1
      || String(c.hit.projWhy || '') !== ''))
    + ' | ' + TXNEW.map(c => TXV(c.hit)).join(' ~~ '));
  check('practice offers no door while the question is still open for another try',
    none(TXCELLS.filter(c => c.mode === 'practice' && (!c.miss
      || String(c.miss.explain || '').indexOf('Giải thích') !== -1 || c.miss.whyLaw !== false))),
    TXCELLS.filter(c => c.mode === 'practice').map(c => TXV(c.miss)).join(' ~~ '));
  check('opening the door shows the words, closing it hides them again on both surfaces',
    none(TXNEW.filter(c => {
      const d = c.hitDoor;
      const z = c.hitClosed;
      if (!d || d.didClick !== true) return true;
      if (String(d.dialog || '').indexOf(txwhy(c)) === -1) return true;
      if (String(d.projWhy || '').indexOf(txwhy(c)) === -1) return true;
      return !z || String(z.dialog || '').indexOf(txwhy(c)) !== -1
        || String(z.projWhy || '').indexOf(txwhy(c)) !== -1;
    })),
    TXNEW.map(c => JSON.stringify([c.mode, c.hitDoor && c.hitDoor.didClick,
      c.hitDoor && c.hitDoor.dialog, c.hitDoor && c.hitDoor.projWhy,
      c.hitClosed && c.hitClosed.dialog, c.hitClosed && c.hitClosed.projWhy,
      c.hitDoor && c.hitDoor.dialogTitle])).join(' ~~ '));
  // Dải chữ nói LUẬT. Với ô chữ đây là chỗ duy nhất học sinh biết mình còn được gõ lại
  // hay không, nên nó không được rơi về chữ 'cơ bản' mà runtime.ts:11 map ngầm.
  check('the law strip above a text screen speaks the law of the mode, not the runtime fallback',
    none(TXCELLS.filter(c => !c.open || !String(c.open.law || '').includes(MHINT[c.mode]
      || '8 giây'))),
    badtx(TXCELLS.filter(c => !c.open || !String(c.open.law || '').includes(MHINT[c.mode]
      || '8 giây'))) + ' | ' + TXCELLS.map(c => JSON.stringify([c.mode, c.open && c.open.law])).join(' ~~ '));
  // Một lỗi DOM ở ô 3 không được phép cắt mất 5 ô sau mà báo cáo vẫn xanh.
  check('no text cell lost a snapshot on the way',
    TXCELLS.every(c => TXKEYS.every(k => c[k] && !c[k].error)),
    badtx(TXCELLS.filter(c => TXKEYS.some(k => !c[k] || c[k].error))));

  /* N. TỆP .egame THẬT → SQLite THẬT → MÀN CHƠI THẬT (nhiệm vụ 8).
     Kế hoạch #209 bắt chế độ phải sống sót qua "lưu · đóng/mở lại · xuất/nhập .egame".
     Tầng JSON đã có unit test (tests/unit/game-package.test.ts); tầng ĐĨA thì không,
     vì files:import-game mở hộp thoại Windows thật — không cổng nào bấm hộ được.
     Chuỗi dưới đây đi qua TẤT CẢ code sản xuất còn lại, và chỉ bỏ đúng một bước:
       writeGamePackage()  = chính chữ mà files:export-game ghi ra tệp
       fs viết/đọc một tệp .egame THẬT ở thư mục tạm
       readGamePackage()   = chính hàm mà files:import-game gọi (src/main.ts:3130)
       desktop.call('saveGame') = IPC library:save-game, xuống SQLite
       editor + màn chơi THẬT đọc lại bản ghi đó.
     Chưa đo: hộp thoại chọn tệp thật (native dialog) — nó chỉ chọn đường dẫn, mọi
     xử lý sau đó đã ở đây rồi. */
  const { readGamePackage, writeGamePackage } = require('../../dist/src/services/game/game-package');
  const nfile = require('path').join(require('os').tmpdir(), 'am209-' + Date.now() + '.egame');
  const NTITLE = 'AM209 ' + Date.now() + ' egame';
  const NFIXTURE = {
    id: 'am209-source-' + Date.now(), title: NTITLE, subject: 'Tự nhiên', grade: '3',
    topic: 'Toán', template: 'quiz', description: 'Một cộng một.', sourceName: 'ui-check',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    gameSetup: { scoringMode: 'tra-loi:luyen-tap', legacyScoringMode: 'tốc độ', timeBonus: '5', pointsPerCorrect: '100', duration: '20' },
    questions: [
      {
        id: 'nq1', type: 'multiple-choice', prompt: 'Một cộng một bằng mấy?',
        explanation: 'Bằng hai.', points: 100, correctAnswer: '',
        options: [{ id: 'a', text: 'Hai' }, { id: 'b', text: 'Ba' }], correctOptionId: 'a'
      },
      {
        id: 'nq2', type: 'multiple-choice', prompt: 'Hai cộng hai bằng mấy?',
        explanation: 'Bằng bốn.', points: 100, correctAnswer: '',
        options: [{ id: 'a', text: 'Bốn' }, { id: 'b', text: 'Năm' }], correctOptionId: 'a'
      }
    ]
  };
  let ndisk = null;
  let nimported = null;
  try {
    require('fs').writeFileSync(nfile, writeGamePackage(NFIXTURE), 'utf8');
    ndisk = require('fs').readFileSync(nfile, 'utf8');
    nimported = readGamePackage(ndisk, () => 'am209-imported-' + Date.now());
  } catch (error) {
    nimported = null;
    check('the real .egame file was written and read back', false, String(error && error.message || error));
  }
  check('the package on disk is the envelope the app writes',
    Boolean(ndisk) && ndisk.indexOf('"packageFormat"') !== -1
    && ndisk.indexOf('tra-loi:luyen-tap') !== -1 && ndisk.indexOf('tốc độ') !== -1,
    ndisk ? 'bytes ' + ndisk.length : 'no file');
  check('readGamePackage kept the token and the value it parked',
    Boolean(nimported) && nimported.gameSetup.scoringMode === 'tra-loi:luyen-tap'
    && nimported.gameSetup.legacyScoringMode === 'tốc độ'
    && nimported.id !== NFIXTURE.id, JSON.stringify(nimported && nimported.gameSetup));

  const NBODY = nimported ? `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const wsRun = new RegExp('[' + String.fromCharCode(9, 10, 11, 12, 13, 32, 160) + ']+', 'g');
    const text = el => el ? String(el.textContent).replace(wsRun, ' ').trim() : '';
    const out = {};
    const GAME = ${JSON.stringify(nimported)};
    const closePlay = async () => {
      const closer = document.querySelector('[data-play-close]');
      if (closer) closer.click();
      await sleep(220);
      document.getElementById('modalRoot').innerHTML = '';
    };
    const tap = async sel => {
      const btn = document.querySelector(sel);
      if (!btn) return { error: 'no element ' + sel };
      btn.click();
      await sleep(320);
      const turn = state.answerTurn;
      return {
        mode: turn ? turn.mode : null, open: turn ? !turn.finished : null,
        retry: turn ? turn.retryAllowed : null, rows: (state.gameAnswers || []).length,
        last: (state.gameAnswers || []).length ? Number(state.gameAnswers[state.gameAnswers.length - 1].points) : null,
        board: text(document.querySelector('#playBody')).indexOf('Bằng hai.') !== -1,
        explain: document.querySelector('[data-answer-explain]') ? text(document.querySelector('[data-answer-explain]')) : '',
        dialog: document.querySelector('#answerExplanationModal') ? text(document.querySelector('.answer-explain-text')) : '',
        tip: text(document.querySelector('.stage-tip'))
      };
    };
    try {
      await closePlay();
      if (typeof closeEditorPage === 'function') closeEditorPage();
      // 1. Lưu THẬT: cùng IPC mà files:import-game gọi sau khi đọc tệp xong.
      out.saved = await desktop.call('saveGame', JSON.parse(JSON.stringify(GAME)));
      const lib = await desktop.call('getLibrary');
      const row = (lib.games || []).find(g => g.title === GAME.title);
      out.row = row && row.gameSetup ? {
        mode: row.gameSetup.scoringMode, park: row.gameSetup.legacyScoringMode,
        timeBonus: row.gameSetup.timeBonus, id: row.id
      } : null;
      // 2. Editor của bản vừa nhập: select phải chỉ đúng ô Luyện tập, không phải ô
      //    'tốc độ' mà token đã cất đi.
      if (row) {
        openEditor(JSON.parse(JSON.stringify(row)), false, 'test');
        await sleep(360);
        const select = document.getElementById('editAnswerMode');
        out.editor = { value: select ? select.value : null, found: Boolean(select) };
        document.getElementById('modalRoot').innerHTML = '';
        if (typeof closeEditorPage === 'function') closeEditorPage();
      }
      // 3. Chơi THẬT bản vừa nhập: sai trước, đúng sau. 90 điểm là phép đo duy nhất
      //    vừa chứng minh luật Luyện tập chạy theo TỆP, vừa chứng minh 'tốc độ'
      //    (+5 nhanh) đã bị token che mất — 105 mới là số của luật cũ.
      playGame(JSON.parse(JSON.stringify(row || GAME)));
      await sleep(700);
      out.miss = await tap('.answer-option[data-answer="b"]');
      out.hit = await tap('.answer-option[data-answer="a"]');
      out.doorOpen = await (async () => {
        const b = document.querySelector('[data-answer-explain]');
        if (!b) return { error: 'no explanation button after the imported file' };
        b.click();
        await sleep(300);
        const d = document.querySelector('#answerExplanationModal');
        return {
          open: Boolean(d), text: d ? text(d.querySelector('.answer-explain-text')) : '',
          law: d ? text(d.querySelector('.answer-explain-law')) : ''
        };
      })();
      out.door = await tap('#answerExplainOkBtn');
      await closePlay();
      // 4. Dọn kho của giáo viên.
      if (row) await desktop.call('deleteGames', [row.id]);
      const after = await desktop.call('getLibrary');
      out.left = (after.games || []).filter(g => String(g.title || '').indexOf('AM209 ') === 0).length;
    } catch (error) {
      out.error = String(error && error.message || error);
      out.stack = String(error && error.stack || '').slice(0, 200);
    }
    return out;
  })()` : null;

  if (NBODY) {
    check('the imported-game payload still ships without a backslash', NBODY.indexOf(BS) === -1,
      NBODY.indexOf(BS));
    const nrep = await evaluate(NBODY);
    const nv = s => JSON.stringify(s);
    check('the imported package reached SQLite with its token intact',
      Boolean(nrep) && !nrep.error && nrep.row && nrep.row.mode === 'tra-loi:luyen-tap'
      && nrep.row.park === 'tốc độ', nv(nrep && nrep.row) + ' ' + nv(nrep && nrep.error));
    check('the editor of an imported game selects the mode from the file, not the parked value',
      nrep && nrep.editor && nrep.editor.found === true
      && nrep.editor.value === 'tra-loi:luyen-tap', nv(nrep && nrep.editor));
    check('an imported game plays by the law in its file: retry, then 90 of 100',
      nrep && nrep.miss && nrep.miss.mode === 'practice' && nrep.miss.open === true
      && nrep.miss.rows === 0 && nrep.hit.rows === 1 && nrep.hit.last === 90,
      nv(nrep && nrep.miss) + ' | ' + nv(nrep && nrep.hit));
    check('the imported game keeps its explanation behind the same button',
      nrep && String(nrep.hit.explain || '').indexOf('Giải thích') !== -1
      && nrep.hit.board === false && nrep.doorOpen && nrep.doorOpen.open === true
      && nrep.doorOpen.text === 'Bằng hai.'
      && String(nrep.doorOpen.law || '').indexOf('Luyện tập') !== -1,
      nv(nrep && nrep.hit) + ' | ' + nv(nrep && nrep.doorOpen));
    check('Đã hiểu closes the dialog of the imported game without touching the board',
      nrep && nrep.door && nrep.door.error === undefined && nrep.door.dialog === ''
      && nrep.door.rows === 1, nv(nrep && nrep.door));
    check('the imported fixture left the library again', nrep && nrep.left === 0, nv(nrep && nrep.left));
    try {
      require('fs').rmSync(nfile, { force: true });
    } catch (error) { /* tệp tạm còn thì không phải lỗi của người dùng */ }
  }

  check('the fixtures are removed from the library again', report.cleanup?.left === 0, JSON.stringify(report.cleanup));

  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
  // Đóng socket thay vì process.exit(): exit cắt mất phần đuôi đã buffer khi log được
  // redirect, còn socket mở thì tiến trình treo sau khi in xong (rc=124 đã đo).
  try { ctx.ws.close(); } catch (error) { /* đã đóng */ }
  process.exitCode = failed ? 1 : 0;
})();
