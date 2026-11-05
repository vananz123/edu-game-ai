// ui-play-surface-check.js — regression guard for the play screen UI.
//
// Covers three defects teachers reported:
//   1. game screen text too small / wasted space / no colour
//   2. "Trình chiếu" button broken (label clipped inside a 30x30 box)
//   3. nav icons not prominent
//
// Retrofit (docs/UI-PLAN-V2.md Phase B): the play screen is now measured at the
// two real classroom resolutions with a PNG per size, instead of at whatever
// size the OS window happened to be. Before this the check could not see a
// 1366x768-only defect at all — and 1366x768 is the commonest projector.
//
// Run against a built app started with --remote-debugging-port:
//   npm run build
//   npx electron . --remote-debugging-port=9341
//   node tests/ui/ui-play-surface-check.js 9341
// Argument 3 filters sections while iterating (`... 9341 quiz`, `... 9341 quiz,race`);
// default runs every section.
const { check, connect, results } = require('../manual/lib/ui-check-lib');
const { PROJECTOR_SIZES, measureAt, setViewport, setViewportAndWait, capture } = require('./lib/screenshot-capture');

/** `node tests/ui/ui-play-surface-check.js 9341 quiz` → chỉ chạy phần đó. */
const ONLY = (process.argv[3] || '').trim().split(',').map(s => s.trim()).filter(Boolean);
const want = name => ONLY.length === 0 || ONLY.includes(name);
const sizesFor = name => (want(name) ? PROJECTOR_SIZES : []);

// Synthetic content only — no real student data (AGENTS.md). Long Vietnamese
// with stacked diacritics on purpose: "ế/ộ/ữ" are what clip when line-height is
// too tight for the font.
const LONG = 'Khi gặp một bạn mới trong lớp, cách nào sau đây thể hiện sự tôn trọng, giúp em kết bạn tốt hơn và giữ được thiện chí của cả hai bên?';

// Built with JSON.stringify rather than as a quoted literal: the fixture then
// contains no hand-written quoting to get wrong.
const GAME = JSON.stringify({
  id: 'ui-play-surface', title: 'Làm quen bạn mới', subject: 'Đạo đức', grade: '4',
  template: 'quiz', description: '', tags: [], sourceName: 'ui-check',
  createdAt: '2026-01-01T00:00:00.000Z',
  gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'auto' },
  questions: [{
    id: 'q1', type: 'multiple-choice', prompt: LONG,
    contentCategory: 'animals', iconName: 'paw-print',
    options: [
      { id: 'a', text: 'Chủ động chào hỏi, hỏi thăm bạn một cách tự nhiên và lắng nghe' },
      { id: 'b', text: 'Đứng quan sát từ xa cho đến khi bạn ấy nói trước' },
      { id: 'c', text: 'Kể ngay một câu chuyện cười thật dài để gây chú ý' },
      { id: 'd', text: 'Chờ giáo viên giới thiệu rồi mới dám lên tiếng' }
    ],
    correctOptionId: 'a', correctAnswer: '',
    explanation: 'Chào hỏi chủ động là bước đầu tiên của một tình bạn mới.', points: 100
  }]
});

/**
 * Open the play surface at fullscreen layout.
 *
 * Uses the same entry point as the "Trình chiếu" button — `playGame(game,
 * { fullscreen: true })`. Clicking that button toggles `data-fullscreen` twice
 * (on, then off), so a click-driven open measured the NON-fullscreen layout.
 */
const OPEN = game => `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('[data-play-close]')?.click();
  document.getElementById('modalRoot').innerHTML = '';
  await sleep(300);
  playGame(${game}, { fullscreen: true });
  await sleep(900);
  // The OS window may be smaller than the emulated viewport; the layout flag is
  // what the fullscreen rules key on, so pin it as well.
  document.documentElement.dataset.fullscreen = '1';
  await sleep(250);
  return {
    stage: Boolean(document.querySelector('.game-stage')),
    question: Boolean(document.querySelector('.stage-question')),
    option: Boolean(document.querySelector('.answer-option'))
  };
})()`;

/**
 * "Tìm kho báu" fixture — the template DECISIONS #85 fixed, and the only one of
 * the four play templates the play-surface check used to leave unmeasured.
 *
 * `stageCount` is a parameter on purpose. Treasure renders its journey as a
 * horizontal map whose height is driven by the node labels, and #85 made the map
 * `flex-shrink: 0` so a tall map can never be squeezed into clipping its own
 * node text — a change whose proof needs a map that is actually tall. The 6-stage
 * case is the regression guard; the 12-stage case is what tests the shrink rule
 * (12 nodes wrap the track into several rows at both projector widths).
 *
 * Mission is `multiple-choice` for every stage: that is the mechanic whose
 * options go through `#treasureMission > .answer-grid`, the grandchild selector
 * #85 documents as a trap.
 */
function treasureGame(stageCount, id, illustrationMode) {
  const stages = Array.from({ length: stageCount }, (_, i) => {
    const n = i + 1;
    return {
      id: 's' + n,
      name: 'Chặng ' + n,
      // Long enough to wrap on a projector, with stacked diacritics.
      story: ('Bối cảnh dài cho chặng ' + n + ': nhà thám hiểm phải vượt qua cánh rừng rậm và dòng sông đục ngầu. ').repeat(3),
      taskDescription: 'Nhiệm vụ của chặng ' + n + ': tìm đáp án đúng để mở khóa bản đồ.',
      question: {
        id: 'q' + n,
        prompt: LONG + ' (chặng ' + n + ')',
        options: [
          { id: 'a', text: 'Chủ động chào hỏi, hỏi thăm bạn một cách tự nhiên và lắng nghe' },
          { id: 'b', text: 'Đứng quan sát từ xa cho đến khi bạn ấy nói trước' },
          { id: 'c', text: 'Kể ngay một câu chuyện cười thật dài để gây chú ý' },
          { id: 'd', text: 'Chờ giáo viên giới thiệu rồi mới dám lên tiếng' }
        ],
        correctOptionId: 'a',
        explanation: 'Chào hỏi chủ động là bước đầu tiên của một tình bạn mới.',
        hint: 'Gợi ý cho chặng ' + n
      },
      attempts: 2,
      points: 100,
      completionBonus: 10,
      nextStageId: n < stageCount ? 's' + (n + 1) : null,
      hasHiddenItem: n === 2,
      mission: { type: 'multiple-choice' }
    };
  });
  return JSON.stringify({
    id, title: 'Tìm kho báu tri thức', subject: 'Đạo đức', grade: '4',
    template: 'treasure-hunt', description: '', tags: [], sourceName: 'ui-check',
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [],
    gameSetup: { scoringMode: 'cơ bản', illustrationMode: illustrationMode || 'auto' },
    treasureHunt: {
      character: 'Nhà thám hiểm An',
      intro: 'Hành trình dài bắt đầu từ ngôi đền cổ. ',
      journeyBonus: 200,
      hiddenItemBonus: 50,
      backgroundId: 'temple',
      characterId: 'explorer',
      stages
    }
  });
}

const TREASURE_6 = treasureGame(6, 'ui-play-surface-treasure-6');
const TREASURE_12 = treasureGame(12, 'ui-play-surface-treasure-12');

/**
 * Bề rộng ảnh minh hoạ KHÔNG được tụt dưới mức này (px), đo trên bố cục trước
 * khi tối ưu: 301px @1366x768, 360px @1920x1080.
 *
 * Vì sao cần một sàn: con đường dễ nhất để "khoảng cách ≤64px" là thu nhỏ ảnh
 * cho tới khi hai khối sát nhau, và số đo thì đẹp mà bức tranh thì mất. Ảnh phải
 * giữ nguyên hoặc lớn lên.
 */
const ART_FLOOR = { 1366: 300, 1920: 360 };

/**
 * "Đường đua ôn tập" fixture — the fourth play template, and the only one #84/#85
 * never re-measured at both projector sizes (both entries record it as "not
 * verified"). Race shares the two-column block with quiz, but its left column is
 * a 40-cell track with two team rows, so its height budget is different.
 *
 * 40 cells and 6 rounds are the template's realistic classroom size; the answers
 * are the same long text the quiz fixture uses, because short options would hide
 * the very overflow this is guarding.
 */
const RACE = JSON.stringify({
  id: 'ui-play-surface-race', title: 'Đường đua ôn tập', subject: 'Đạo đức', grade: '4',
  template: 'race', description: '', tags: [], sourceName: 'ui-check',
  createdAt: '2026-01-01T00:00:00.000Z',
  questions: [],
  gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'auto' },
  race: {
    trackLength: 40,
    maxRounds: 6,
    stepByDifficulty: false,
    luckEnabled: false,
    teams: [
      { id: 't1', name: 'Đội Một', icon: '🔴' },
      { id: 't2', name: 'Đội Hai', icon: '🔵' }
    ],
    cells: [
      { cell: 6, type: 'boost', label: 'Tăng tốc' },
      { cell: 11, type: 'penalty', label: 'Chướng ngại' }
    ],
    questions: [1, 2, 3].map(n => ({
      id: 'rq' + n,
      prompt: LONG,
      options: [
        { id: 'a', text: 'Chủ động chào hỏi, hỏi thăm bạn một cách tự nhiên và lắng nghe' },
        { id: 'b', text: 'Đứng quan sát từ xa cho đến khi bạn ấy nói trước' },
        { id: 'c', text: 'Kể ngay một câu chuyện cười thật dài để gây chú ý' },
        { id: 'd', text: 'Chờ giáo viên giới thiệu rồi mới dám lên tiếng' }
      ],
      correctOptionId: 'a',
      explanation: 'Chào hỏi chủ động là bước đầu tiên của một tình bạn mới.',
      difficulty: 'trung bình'
    }))
  }
});



/**
 * Ngưỡng hình học của "Đấu trường tri thức" (nhiệm vụ 1, phạm vi bố cục đã chốt).
 *
 * Toàn bộ lấy nguyên văn từ yêu cầu, không tự đặt thêm số:
 *   · cỡ chữ tối thiểu: câu hỏi 32px, đáp án 20px — và KHÔNG được giảm chữ
 *     dưới ngưỡng chỉ để lọt màn (vì vậy cỡ chữ đo riêng, song song với điều
 *     kiện "không cuộn ngang / không khuất đáp án");
 *   · Xây nhà CÓ ảnh: ảnh <= 28% và lưới >= 60% chiều ngang vùng nội dung,
 *     khe ảnh <-> đáp án <= 24 CSS px;
 *   · "lưới đáp án dùng toàn bộ vùng nội dung được bố trí cho nó, không cột
 *     rỗng" -> các màn trải ngang phải đạt >= 95% bề rộng .stage-center và bám
 *     tới mép phải của nó.
 */
const QUIZ = {
  questionPx: 32,
  optionPx: 20,
  houseArtMaxPct: 0.28,
  houseGridMinPct: 0.60,
  houseArtGridGapPx: 24,
  fullGridMinPct: 0.95,
  edgePx: 4
};

const SHORT_PROMPT = 'Khi gặp bạn mới trong lớp, em nên làm gì đầu tiên?';
const SHORT_OPTIONS = [
  { id: 'a', text: 'Chào hỏi bạn' },
  { id: 'b', text: 'Đi chỗ khác' },
  { id: 'c', text: 'Chờ bạn nói' },
  { id: 'd', text: 'Nhờ cô giáo' }
];
const LONG_OPTIONS = [
  { id: 'a', text: 'Chủ động chào hỏi, hỏi thăm bạn một cách tự nhiên và lắng nghe' },
  { id: 'b', text: 'Đứng quan sát từ xa cho đến khi bạn ấy nói trước' },
  { id: 'c', text: 'Kể ngay một câu chuyện cười thật dài để gây chú ý' },
  { id: 'd', text: 'Chờ giáo viên giới thiệu rồi mới dám lên tiếng' }
];

/**
 * Fixture "Đấu trường tri thức" cho bốn tổ hợp bố cục đã chốt.
 *
 * · `play`  -> `gameSetup.gameplayMode` ('classic' | 'house'); chỉ template
 *   'quiz' mới có chế độ Xây nhà (isHouseMode() trong games/house.ts).
 * · `art`   -> 'auto' + `illustrationAssetId: 'animals-scene'`. Bắt buộc phải là
 *   ảnh CHỈ ĐỊNH: ở chế độ Xây nhà, quiz.ts chỉ vẽ ảnh khi `houseArt.explicit`
 *   (#153), tranh "tự động" không được tính là "câu hỏi có ảnh".
 * · `len`   -> nội dung ngắn/dài, cả hai đều fixture tiếng Việt tổng hợp
 *   (AGENTS.md: không dùng dữ liệu học sinh thật).
 *
 * Ba câu hỏi: `houseTargetParts()` lấy số câu (chặn ở 8) nên HUD "Đã xây n/3
 * phần" có ý nghĩa thật, và màn chơi không kết thúc ngay câu đầu.
 */
function quizGame(opts) {
  const play = opts.play === 'house' ? 'house' : 'classic';
  const long = opts.len !== 'short';
  const id = `ui-play-surface-quiz-${play}-${opts.art ? 'art' : 'noart'}-${long ? 'long' : 'short'}`;
  const questions = [1, 2, 3].map(n => ({
    id: 'q' + n,
    type: 'multiple-choice',
    prompt: long ? LONG + ' (câu ' + n + ')' : SHORT_PROMPT,
    contentCategory: 'animals',
    iconName: 'paw-print',
    illustrationAssetId: opts.art ? 'animals-scene' : '',
    options: long ? LONG_OPTIONS : SHORT_OPTIONS,
    correctOptionId: 'a',
    correctAnswer: '',
    explanation: 'Chào hỏi chủ động là bước đầu tiên của một tình bạn mới.',
    hint: 'Gợi ý cho câu ' + n,
    points: 100
  }));
  return JSON.stringify({
    id, title: 'Đấu trường tri thức', subject: 'Đạo đức', grade: '4',
    template: 'quiz', description: '', tags: [], sourceName: 'ui-check',
    createdAt: '2026-01-01T00:00:00.000Z',
    gameSetup: {
      scoringMode: 'cơ bản',
      gameplayMode: play,
      illustrationMode: opts.art ? 'auto' : 'off',
      houseStyle: 'auto'
    },
    questions
  });
}

/**
 * Hình học màn đọc câu hỏi của "Đấu trường tri thức" (nhiệm vụ 1).
 *
 * Probe phải đo HAI MÉP và trạng thái nhìn thấy được, không đo "bề rộng hàng":
 * bài học #207 là một track 751px chứa ảnh 360px báo cùng một bề rộng hàng với
 * track ôm sát ảnh, còn chỗ chết 391px thì vô hình. Ở đây mỗi khối (câu hỏi,
 * ảnh, lưới, từng đáp án, HUD) trả về hộp px thật của nó.
 *
 * "Bốn đáp án thấy được ngay khi câu hỏi mở" là điều kiện về HÌNH HỌC chứ không
 * phải về DOM: một đáp án tồn tại trong DOM nhưng nằm dưới đáy viewport, hoặc bị
 * một lớp khác che, đều coi như khuất. Vì vậy mỗi ô được hit-test bằng
 * elementFromPoint tại tâm của nó.
 */
const QUIZ_GEOM = `(() => {
  const px = v => parseFloat(v) || 0;
  const boxOf = el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top),
      bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height),
      display: cs.display, font: px(cs.fontSize),
      clipY: Math.round(el.scrollHeight - el.clientHeight),
      clipX: Math.round(el.scrollWidth - el.clientWidth) };
  };
  const box = sel => { const el = document.querySelector(sel); return el ? boxOf(el) : null; };
  const find = sel => document.querySelector(sel);
  const stageEl = find('.game-stage');
  const centerEl = find('.stage-center');
  const qEl = find('.stage-question');
  const gridEl = find('.answer-grid');
  const optEls = [...document.querySelectorAll('.answer-grid .answer-option')];
  if (!stageEl || !centerEl || !qEl || !gridEl || optEls.length !== 4) return { missing: true };
  const vOverlap = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  const sameRow = (a, b) => a && b && vOverlap(a, b) > 0.5 * Math.min(a.h, b.h);
  const stage = boxOf(stageEl);
  const center = boxOf(centerEl);
  const question = boxOf(qEl);
  const grid = boxOf(gridEl);
  const artEl = find('.stage-illustration');
  const art = artEl ? boxOf(artEl) : null;
  const hudEl = find('.house-progress');
  const hud = hudEl ? boxOf(hudEl) : null;
  // Met that an answer is painted where the class can see it and nothing is on
  // top of it: viewport box + elementFromPoint at the option centre.
  const options = optEls.map((el, i) => {
    const b = boxOf(el);
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    const hittable = Boolean(top) && (top === el || el.contains(top) || top.contains(el));
    return { i, ...b, hittable,
      coveredBy: hittable ? null : (top ? (top.className || top.tagName).toString().slice(0, 34) : 'nothing'),
      inside: b.left >= -2 && b.top >= -2 && b.right <= innerWidth + 2 && b.bottom <= innerHeight + 2 };
  });
  return {
    viewport: { w: innerWidth, h: innerHeight },
    houseMode: stageEl.classList.contains('is-house-mode'),
    showcase: stageEl.classList.contains('is-house-showcase'),
    stage, center, question, grid, art, hud, options,
    // Chu vi của hàng nội dung: cột ảnh (Cổ điển), hàng ảnh + ô nhà + dải HUD
    // (Xây nhà #208). Đọc cả display để phân biệt "bị ẩn" với "còn node mà 0px".
    sideCol: box('.stage-side-col'),
    hudStrip: box('.house-hud-strip'),
    houseAnswerRow: box('.house-answer-row'),
    houseArtCol: box('.house-question-art'),
    houseSlot: box('.house-stage-slot'),
    mainCol: box('.stage-col.is-main'),
    stageScroll: {
      overflowX: Math.round(stageEl.scrollWidth - stageEl.clientWidth),
      overflowY: Math.round(stageEl.scrollHeight - stageEl.clientHeight)
    },
    centerScroll: {
      overflowX: Math.round(centerEl.scrollWidth - centerEl.clientWidth),
      overflowY: Math.round(centerEl.scrollHeight - centerEl.clientHeight)
    },
    gridTracks: getComputedStyle(gridEl).gridTemplateColumns,
    centerGap: Math.round(px(getComputedStyle(centerEl).columnGap) || px(getComputedStyle(centerEl).gap) || 0),
    questionWeight: getComputedStyle(qEl).fontWeight,
    sameRowArtGrid: sameRow(art, grid),
    sameRowQuestionArt: sameRow(question, art),
    artGridGap: art && sameRow(art, grid) ? grid.left - art.right : null,
    questionArtGap: question && sameRow(question, art) ? art.left - question.right : null,
    artPct: art ? art.w / center.w : null,
    gridPct: grid.w / center.w,
    hudAboveQuestion: hud ? hud.bottom <= question.top + 2 : null,
    docHeight: document.documentElement.scrollHeight
  };
})()`;

/**
 * Bảng chữ nhật cần cho nhiệm vụ 1: "ghi nhận cỡ chữ, tràn và phần nội dung
 * nhìn thấy" của TỪNG tổ hợp, in ra stdout để bàn giao kèm số.
 */
function quizRow(g, tag) {
  if (!g || g.missing) return `  ${tag}  MISSING GEOMETRY`;
  const pct = v => v === null || v === undefined ? 'n/a' : Math.round(v * 100) + '%';
  const pxv = v => v === null || v === undefined ? 'n/a' : v + 'px';
  const hidden = g.options.filter(o => !o.inside).length;
  const covered = g.options.filter(o => o.inside && !o.hittable).length;
  return `  ${tag.padEnd(34)} q ${pxv(g.question.font)} w${g.questionWeight} ${g.question.w}x${g.question.h}  `
    + `art ${g.art ? g.art.w + 'x' + g.art.h + ' @' + g.art.left : 'none'} (${pct(g.artPct)})  `
    + `grid ${g.grid.w}/${g.center.w} (${pct(g.gridPct)}) gap ${pxv(g.artGridGap)}  `
    + `hud ${g.hud ? '@' + g.hud.top + ' w' + g.hud.w : 'none'} above=${g.hudAboveQuestion === null ? 'n/a' : g.hudAboveQuestion}  `
    + `hidden ${hidden}/4 covered ${covered}  ovX ${g.stageScroll.overflowX}/${g.centerScroll.overflowX} `
    + `ovY ${g.stageScroll.overflowY}  doc ${g.docHeight}/${g.viewport.h}`;
}

/**
 * Các điều kiện đã chốt, áp cho một tổ hợp.
 *
 * `spec = { play, art }`. Mọi check đều là assertion hình học hoặc nhìn thấy
 * được; không có check dạng "phần tử có tồn tại" hay "cuộn tới được" — đó chính
 * là điều nhiệm vụ 1 cấm.
 */
function assertQuizLayout(g, tag, spec) {
  if (!g || g.missing) {
    check(`[${tag}] quiz geometry measurable`, false, 'stage/question/grid/answers missing');
    return;
  }
  const vw = g.viewport.w, vh = g.viewport.h;
  // Điều kiện tiên quyết của TỔ CHỨC: fixture phải vẽ đúng thứ bố cục nói tới.
  // Không có nó, một fixture hỏng (không vẽ ảnh) sẽ biến check "ảnh <= 28%" thành
  // xanh rỗng, và ngược lại một ảnh còn sót ở tổ hợp "không ảnh" sẽ không bị ai
  // nhìn thấy.
  if (spec.art) {
    check(`[${tag}] the fixture really drew an illustration`, Boolean(g.art),
      JSON.stringify({ art: g.art, artCol: g.houseArtCol, sideCol: g.sideCol, gridTracks: g.gridTracks }));
    if (!g.art) return;
  } else {
    check(`[${tag}] the fixture really drew no illustration`, !g.art,
      g.art ? `art ${g.art.w}x${g.art.h}px at ${g.art.left},${g.art.top}` : 'no .stage-illustration');
  }
  // ---- Bốn đáp án thấy được ngay khi câu hỏi mở (mọi tổ hợp) ----
  const hidden = g.options.filter(o => !o.inside)
    .map(o => `#${o.i + 1} ${o.top}..${o.bottom}` + (o.bottom > vh + 2 ? ` (+${o.bottom - vh}px dưới đáy)` : '')
      + (o.right > vw + 2 ? ` (+${o.right - vw}px phải)` : ''));
  check(`[${tag}] all four answers visible the moment the question opens`, hidden.length === 0,
    hidden.join(' | ') || `last answer bottom ${g.options[3].bottom} of ${vh}`);
  const covered = g.options.filter(o => o.inside && !o.hittable)
    .map(o => `#${o.i + 1} covered by ${o.coveredBy}`);
  check(`[${tag}] no answer is covered by another layer`, covered.length === 0,
    covered.join(' | ') || 'every answer hit-tests to itself');
  const clipped = g.options.filter(o => o.clipY > 2 || o.clipX > 2)
    .map(o => `#${o.i + 1} ${o.clipY}/${o.clipX}`);
  check(`[${tag}] no answer is clipped inside its own box`, clipped.length === 0,
    clipped.join(' | '));
  check(`[${tag}] answers do not overlap each other`, (() => {
    const o = g.options;
    for (let i = 0; i < o.length; i++) {
      for (let j = i + 1; j < o.length; j++) {
        if (o[i].left < o[j].right - 2 && o[j].left < o[i].right - 2
          && o[i].top < o[j].bottom - 2 && o[j].top < o[i].bottom - 2) return false;
      }
    }
    return true;
  })(), JSON.stringify(g.options.map(o => [o.left, o.top, o.right, o.bottom])));
  // ---- Ngưỡng cỡ chữ (đo riêng, không đánh đổi lấy việc lọt màn) ----
  check(`[${tag}] question font >= ${QUIZ.questionPx}px`, g.question.font >= QUIZ.questionPx,
    `${g.question.font}px`);
  const smallOpts = g.options.filter(o => o.font < QUIZ.optionPx).map(o => `#${o.i + 1} ${o.font}px`);
  check(`[${tag}] answer font >= ${QUIZ.optionPx}px`, smallOpts.length === 0, smallOpts.join(' | ') || `${g.options[0].font}px`);
  // ---- Không cuộn ngang, không "biến mất" khi nội dung dài ----
  check(`[${tag}] nothing scrolls horizontally`, g.stageScroll.overflowX <= 2 && g.centerScroll.overflowX <= 2,
    `stage ${g.stageScroll.overflowX}px, center ${g.centerScroll.overflowX}px`);
  check(`[${tag}] page never double-scrolls`, g.docHeight <= vh + 2, `${g.docHeight} vs ${vh}`);
  check(`[${tag}] question text is never cut`, g.question.clipY <= 2 && g.question.clipX <= 2,
    `clip ${g.question.clipY}/${g.question.clipX}`);
  // ---- Lưới đáp án dùng trọn vùng nội dung được bố trí cho nó ----
  const fullWidth = g.gridPct >= QUIZ.fullGridMinPct;
  if (spec.play === 'house' && spec.art) {
    // Tổ hợp này KHÔNG đòi lưới trọn vùng: ảnh chiếm bên trái. Nó đòi đúng bộ ba
    // đã chốt: ảnh <= 28%, lưới >= 60%, khe <= 24px, và lưới bám mép phải nên
    // cột HUD không được ăn ngang.
    check(`[${tag}] illustration <= ${Math.round(QUIZ.houseArtMaxPct * 100)}% of the content area`,
      g.artPct !== null && g.artPct <= QUIZ.houseArtMaxPct,
      g.art ? `${g.art.w}px of ${g.center.w}px (${Math.round(g.artPct * 100)}%)` : 'no illustration drawn');
    check(`[${tag}] answer grid >= ${Math.round(QUIZ.houseGridMinPct * 100)}% of the content area`,
      g.gridPct >= QUIZ.houseGridMinPct, `${g.grid.w}px of ${g.center.w}px (${Math.round(g.gridPct * 100)}%)`);
    check(`[${tag}] illustration and answers share one row`, g.sameRowArtGrid === true,
      g.art ? `art ${g.art.top}..${g.art.bottom}, grid ${g.grid.top}..${g.grid.bottom}` : 'no illustration');
    check(`[${tag}] illustration sits LEFT of the answer grid`,
      Boolean(g.art) && g.art.left <= g.grid.left + QUIZ.edgePx,
      g.art ? `art.left ${g.art.left}, grid.left ${g.grid.left}` : 'no illustration');
    check(`[${tag}] art -> answer gap <= ${QUIZ.houseArtGridGapPx}px`,
      g.artGridGap !== null && g.artGridGap >= 0 && g.artGridGap <= QUIZ.houseArtGridGapPx,
      g.artGridGap === null ? 'not on the same row' : `${g.artGridGap}px`);
    check(`[${tag}] question is ABOVE the illustration/answer row`,
      g.question.bottom <= Math.min(g.art ? g.art.top : Infinity, g.grid.top) + QUIZ.edgePx,
      `question.bottom ${g.question.bottom}, row.top ${Math.min(g.art ? g.art.top : Infinity, g.grid.top)}`);
    check(`[${tag}] answer grid reaches the right edge of the content area`,
      g.grid.right >= g.center.right - QUIZ.edgePx,
      `grid.right ${g.grid.right} vs center.right ${g.center.right} (HUD strip ${g.hudStrip ? g.hudStrip.w + 'px/' + g.hudStrip.display : 'none'})`);
  } else if (spec.play === 'classic' && spec.art) {
    check(`[${tag}] question is LEFT of the illustration`,
      g.question.right <= g.art.left + QUIZ.edgePx,
      `question ${g.question.left}..${g.question.right}, art ${g.art ? g.art.left : 'none'}`);
    check(`[${tag}] question and illustration share one row`, g.sameRowQuestionArt === true,
      `question ${g.question.top}..${g.question.bottom}, art ${g.art ? g.art.top + '..' + g.art.bottom : 'none'}`);
    check(`[${tag}] question -> illustration seam has no dead column`,
      g.questionArtGap !== null && g.questionArtGap >= 0 && g.questionArtGap <= QUIZ.houseArtGridGapPx,
      g.questionArtGap === null ? 'not on the same row' : `${g.questionArtGap}px`);
    check(`[${tag}] illustration reaches the right edge of the content area`,
      g.art.right >= g.center.right - QUIZ.edgePx,
      `art.right ${g.art ? g.art.right : 'none'} vs center.right ${g.center.right}`);
    check(`[${tag}] all four answers sit BELOW the question/illustration row`,
      g.grid.top >= Math.max(g.question.bottom, g.art ? g.art.bottom : 0) - QUIZ.edgePx,
      `grid.top ${g.grid.top}, row.bottom ${Math.max(g.question.bottom, g.art ? g.art.bottom : 0)}`);
    check(`[${tag}] answers span the whole content width`, fullWidth,
      `${g.grid.w}px of ${g.center.w}px (${Math.round(g.gridPct * 100)}%)`);
    check(`[${tag}] answer row starts at the left edge of the content area`,
      g.grid.left <= g.center.left + QUIZ.edgePx, `grid.left ${g.grid.left} vs center.left ${g.center.left}`);
  } else {
    // Hai tổ hợp KHÔNG có ảnh: nội dung phải trải ngang, không cột rỗng.
    check(`[${tag}] answers span the whole content width`, fullWidth,
      `${g.grid.w}px of ${g.center.w}px (${Math.round(g.gridPct * 100)}%) `
      + `(main col ${g.mainCol ? g.mainCol.w : 'n/a'}px, HUD strip ${g.hudStrip ? g.hudStrip.w + 'px/' + g.hudStrip.display : 'none'})`);
    check(`[${tag}] answer row starts at the left edge of the content area`,
      g.grid.left <= g.center.left + QUIZ.edgePx, `grid.left ${g.grid.left} vs center.left ${g.center.left}`);
    check(`[${tag}] answer row reaches the right edge of the content area`,
      g.grid.right >= g.center.right - QUIZ.edgePx, `grid.right ${g.grid.right} vs center.right ${g.center.right}`);
    check(`[${tag}] no empty illustration column is kept`,
      !g.sideCol || (g.sideCol.w === 0 || g.sideCol.display === 'none'),
      g.sideCol ? `side col ${g.sideCol.w}px, display ${g.sideCol.display}` : 'no side column');
    if (spec.play === 'house') {
      check(`[${tag}] no empty art placeholder is kept`,
        !g.houseArtCol || g.houseArtCol.w === 0 || g.houseArtCol.display === 'none',
        g.houseArtCol ? `art col ${g.houseArtCol.w}px` : 'no art column');
    }
  }
  // ---- HUD của chế độ Xây nhà nằm ở dải trên câu hỏi, không chiếm cột ----
  if (spec.play === 'house') {
    check(`[${tag}] HUD renders`, Boolean(g.hud), g.hud ? `${g.hud.w}x${g.hud.h}px at ${g.hud.left},${g.hud.top}` : 'no .house-progress');
    if (g.hud) {
      // MỘT assertion cho cả ba tính chất của "dải phía trên câu hỏi": nằm trên,
      // bám mép trái, và rộng gần trọn vùng nội dung. Tách "nằm trên" thành check
      // riêng từng xanh nhầm ở bố cục cũ: HUD cột phải cao 90px nên ĐÚNG là kết
      // thúc trước câu hỏi, dù nó không phải một dải.
      const strip = g.hudAboveQuestion === true
        && g.hud.left <= g.center.left + QUIZ.edgePx
        && g.hud.w >= QUIZ.fullGridMinPct * g.center.w
        && Boolean(g.hudStrip) && g.hudStrip.w >= QUIZ.fullGridMinPct * g.center.w;
      check(`[${tag}] HUD is a full-width strip above the question`, strip,
        `hud ${g.hud.left}..${g.hud.right} x ${g.hud.top}..${g.hud.bottom} (${g.hud.w}px of ${g.center.w}px) vs question.top ${g.question.top}, center.left ${g.center.left}`
        + (g.hudStrip ? ` [strip ${g.hudStrip.w}x${g.hudStrip.h}px/${g.hudStrip.display}]` : ' [no .house-hud-strip node]'));
      check(`[${tag}] HUD does not narrow the question`,
        g.question.w >= QUIZ.fullGridMinPct * g.center.w,
        `question ${g.question.w}px of ${g.center.w}px`);
    }
    // Ngôi nhà 3D vẫn phải còn chỗ: ô giữ chỗ là hình chữ nhật mà houseTarget()
    // đo (#179), mất nó là mất nhà chứ không phải chỉ mất ô trang trí.
    check(`[${tag}] the house keeps a real slot`, Boolean(g.houseSlot) && g.houseSlot.w > 60 && g.houseSlot.h > 60,
      g.houseSlot ? `slot ${g.houseSlot.w}x${g.houseSlot.h}px at ${g.houseSlot.left},${g.houseSlot.top}` : 'no .house-stage-slot');
  } else {
    check(`[${tag}] classic draws no house HUD`, !g.hud, g.hud ? `unexpected .house-progress ${g.hud.w}x${g.hud.h}` : 'no HUD');
  }
  // Ảnh thật phải là ảnh, không phải khung rỗng: #207 từng "đo" một hộp 1x1px.
  if (g.art) {
    check(`[${tag}] the illustration is a real picture (>= 150x90)`,
      g.art.w >= 150 && g.art.h >= 90, `${g.art.w}x${g.art.h}px`);
  }
}

/** Read the play-surface geometry that the teacher-facing assertions need. */
const READ = `(() => {
  const px = v => parseFloat(v) || 0;
  const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const q = document.querySelector('.stage-question');
  const opt = document.querySelector('.answer-option');
  const grid = document.querySelector('.answer-grid');
  const present = document.querySelector('[data-play-present]');
  const label = present?.querySelector('.play-tool-label');
  const fsBtn = document.querySelector('[data-play-fullscreen]');
  const closeBtn = document.querySelector('[data-play-close]');
  const stage = document.querySelector('.game-stage');
  if (!q || !opt || !grid || !stage || !present) return { missing: true };
  return {
    viewport: { w: innerWidth, h: innerHeight },
    questionFont: px(getComputedStyle(q).fontSize),
    questionWeight: getComputedStyle(q).fontWeight,
    optionFont: px(getComputedStyle(opt).fontSize),
    optionHeight: rect(opt).h,
    optionCols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    contentWidth: rect(q).w,
    // Bố cục 2 cột (docs/UI-PLAN-V2.md, DECISIONS #84): ảnh nằm CẠNH câu hỏi,
    // nên bề rộng câu hỏi một mình không còn đo "không gian bị bỏ phí" — ảnh
    // chiếm 200-300px bên trái là cố ý. Đo cả khối ảnh + chữ để giữ nguyên ý
    // nghĩa gốc của assertion (màn hình máy chiếu không được để trống hai bên).
    stageCenterWidth: (() => {
      const sc = document.querySelector('.stage-center') || document.querySelector('.race-turn-row');
      return sc ? rect(sc).w : 0;
    })(),
    illustrationWidth: (() => {
      const ill = document.querySelector('.stage-illustration');
      return ill ? rect(ill).w : 0;
    })(),
    present: Object.assign({ text: present.textContent.trim(),
      overflowX: present.scrollWidth > present.clientWidth + 1 }, rect(present)),
    labelLines: label ? Math.round(rect(label).h / px(getComputedStyle(label).lineHeight || getComputedStyle(label).fontSize)) : null,
    fsBtn: fsBtn ? rect(fsBtn) : null,
    closeBtn: closeBtn ? rect(closeBtn) : null,
    stageBottom: rect(stage).bottom,
    questionColor: getComputedStyle(q).color,
    stageBackground: getComputedStyle(stage).backgroundImage !== 'none',
    docHeight: document.documentElement.scrollHeight
  };
})()`;

/**
 * Treasure two-column geometry (docs/ROADMAP.md #207, Task 1).
 *
 * The number a teacher actually sees is the void between the right edge of the
 * illustration and the left edge of the question. Measuring the *row* (the old
 * `stageCenterWidth`) cannot see it: a grid track 751px wide holding a 360px art
 * box reports the same row width as a track that hugs the art, while the first
 * one wastes 390px of projector real estate. So this probe reads the two edges
 * directly.
 *
 * `mapOpen` is part of the contract, not incidental context: the drawer is a
 * sibling of the grid, and opening it re-ran the track sizing (527.5px ->
 * 522.7px at 1366x768), so the gap has to be recorded per state.
 */
const TREASURE_GEOM = `(() => {
  const box = sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), left: Math.round(r.left), right: Math.round(r.right),
      y: Math.round(r.y), top: Math.round(r.top), bottom: Math.round(r.bottom),
      w: Math.round(r.width), h: Math.round(r.height) };
  };
  const stage = document.querySelector('.game-stage');
  const grid = document.querySelector('.treasure-stage-grid');
  const drawer = document.querySelector('#treasureMapDrawer');
  const map = document.querySelector('.treasure-map');
  const ill = box('.stage-illustration.is-treasure');
  const q = box('.stage-question');
  const opts = [...document.querySelectorAll('#treasureMission .answer-option')]
    .map(el => { const r = el.getBoundingClientRect(); return {
      left: Math.round(r.left), right: Math.round(r.right),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      w: Math.round(r.width), h: Math.round(r.height) }; });
  return {
    viewport: { w: innerWidth, h: innerHeight },
    ill, question: q, badge: box('.treasure-chapter-now'), mainCol: box('.treasure-stage-grid > .stage-col.is-main'),
    // Cột trái, kể cả khi KHÔNG có ảnh: "gap" ở trên vô dụng lúc đó (ill = null),
    // nên phép đo phải đọc cả display để thấy cột có thật sự bị bỏ khỏi lưới hay
    // chỉ co về 0px.
    sideCol: (() => {
      const el = document.querySelector('.treasure-illustration-col');
      if (!el) return null;
      const b = box('.treasure-illustration-col');
      b.display = getComputedStyle(el).display;
      return b;
    })(),
    hasArt: Boolean(ill),
    artTrack: grid ? Math.round(parseFloat(getComputedStyle(grid).gridTemplateColumns.split(' ')[0]) || 0) : null,
    tracks: grid ? getComputedStyle(grid).gridTemplateColumns : null,
    columnGap: grid ? Math.round(parseFloat(getComputedStyle(grid).columnGap) || 0) : null,
    gap: ill && q ? q.left - ill.right : null,
    optionCount: opts.length, options: opts,
    firstOption: opts[0] || null, lastOption: opts[opts.length - 1] || null,
    attemptsHint: box('#treasureAttemptsHint'), hintBtn: box('.treasure-hint-fab'), storyBtn: box('#treasureStoryBtn'),
    // A block the class can see is useless if the click lands on something else:
    // hit-test the three controls the teacher uses on this surface.
    controls: [['#treasureMapToggleBtn', 'map toggle'], ['.treasure-hint-fab', 'hint'], ['#treasureStoryBtn', 'story']]
      .map(([sel, name]) => {
        const el = document.querySelector(sel);
        if (!el) return { name, present: false };
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
        return { name, present: true, w: Math.round(r.width), h: Math.round(r.height),
          insideViewport: r.left >= -2 && r.right <= innerWidth + 2 && r.top >= -2 && r.bottom <= innerHeight + 2,
          hittable: Boolean(top) && (top === el || el.contains(top) || top.contains(el)) };
      }),
    mapOpen: drawer ? getComputedStyle(drawer).display !== 'none' : null,
    map: map ? (() => { const r = map.getBoundingClientRect(); return {
      w: Math.round(r.width), right: Math.round(r.right), h: Math.round(r.height),
      scrollW: Math.round(map.scrollWidth), clientW: Math.round(map.clientWidth) }; })() : null,
    stageScroll: stage ? {
      overflowY: Math.round(stage.scrollHeight - stage.clientHeight),
      overflowX: Math.round(stage.scrollWidth - stage.clientWidth)
    } : null,
    docHeight: document.documentElement.scrollHeight
  };
})()`;

/**
 * The gap contract. `artFloor` is the illustration width the layout may not drop
 * below: closing the void by shrinking the picture would be cheating the number,
 * which is exactly what the acceptance criteria forbid.
 */
function assertTreasureGap(g, tag, artFloor) {
  if (!g || g.gap === null) {
    check(`[${tag}] treasure geometry measurable`, false, 'illustration or question missing');
    return;
  }
  check(`[${tag}] illustration -> question gap <= 64px`, g.gap <= 64,
    `${g.gap}px at ${g.viewport.w}x${g.viewport.h} (art ${g.ill.w}px in a ${g.artTrack}px track, column-gap ${g.columnGap}px)`);
  check(`[${tag}] gap is real separation, not overlap`, g.gap >= 0, `${g.gap}px`);
  check(`[${tag}] illustration not shrunk to win the number (>= ${artFloor}px)`,
    g.ill.w >= artFloor, `${g.ill.w}px wide, ${g.ill.h}px tall`);
  check(`[${tag}] answers still all rendered`, g.optionCount === 4, `${g.optionCount} options`);
  // Everything that must be readable from the back of the room sits in one
  // horizontal band: no sideways escape and no overlap between the two columns.
  const vw = g.viewport.w;
  const edges = [['illustration', g.ill], ['chapter badge', g.badge], ['question', g.question],
    ['first answer', g.firstOption], ['last answer', g.lastOption]];
  const outside = edges.filter(([, b]) => b && (b.left < -2 || b.right > vw + 2)).map(([n, b]) => `${n} ${b.left}..${b.right}`);
  check(`[${tag}] no key block escapes the viewport sideways`, outside.length === 0, outside.join(' | '));
  const collides = g.ill && g.mainCol && g.mainCol.left < g.ill.right - 0.5;
  check(`[${tag}] text column starts right of the picture`, !collides,
    collides ? `main.col.left=${g.mainCol.left} < ill.right=${g.ill.right}` : `ill.right=${g.ill.right} main.col.left=${g.mainCol.left}`);
  check(`[${tag}] page never double-scrolls`, g.docHeight <= g.viewport.h + 2,
    `${g.docHeight} vs ${g.viewport.h}`);
  // The map may scroll inside itself, but must not drag the whole stage sideways.
  check(`[${tag}] stage never scrolls horizontally`, g.stageScroll.overflowX <= 2,
    `stage overflowX ${g.stageScroll.overflowX}px, map ${g.map ? g.map.scrollW + '/' + g.map.clientW : 'n/a'}`);
  const blocked = (g.controls || []).filter(c => c.present && (!c.insideViewport || !c.hittable));
  check(`[${tag}] map/hint/story controls stay visible and clickable`, blocked.length === 0,
    blocked.map(c => `${c.name}: ${c.insideViewport ? 'covered' : 'off-screen'}`).join(' | ')
      || (g.controls || []).filter(c => c.present).map(c => c.name).join(', '));
}

/**
 * Opening/closing the drawer may not move the blocks the class is looking at.
 *
 * `axes: 'x'` is for the OPEN comparison: the drawer sits above the grid, so
 * opening it legitimately pushes the whole block DOWN — that is not a jump. What
 * must not change is the horizontal seam between the picture and the question.
 * The re-closed comparison uses 'xy' and demands the original position back.
 */
function assertTreasureStability(before, after, tag, axes = 'xy') {
  if (!before || !after || !before.ill || !after.ill) return;
  const moved = [];
  for (const key of ['ill', 'question', 'badge', 'mainCol']) {
    const a = before[key], b = after[key];
    if (!a || !b) { moved.push(`${key} disappeared`); continue; }
    const dx = Math.abs(a.left - b.left);
    const dy = axes === 'xy' ? Math.abs(a.top - b.top) : 0;
    if (dx > 2 || dy > 2) moved.push(`${key} ${a.left},${a.top} -> ${b.left},${b.top}`);
  }
  const what = axes === 'xy'
    ? 'closed -> open -> closed leaves the blocks in place'
    : 'opening the map does not shift the columns sideways';
  check(`[${tag}] ${what}`, moved.length === 0,
    moved.join(' | ') || `gap ${before.gap}px -> ${after.gap}px`);
  check(`[${tag}] gap survives the map toggle`, Math.abs(before.gap - after.gap) <= 4,
    `${before.gap}px vs ${after.gap}px`);
}

/** Open or close the journey drawer the way a teacher does: the header button. */
const TOGGLE_MAP = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('#treasureMapToggleBtn')?.click();
  await sleep(400);
  const btn = document.querySelector('#treasureMapToggleBtn');
  return { label: btn ? btn.textContent.trim() : null,
    expanded: btn ? btn.getAttribute('aria-expanded') : null };
})()`;

/** Answer the first question and read the feedback state. */
const ANSWER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('.answer-option').click();
  await sleep(900);
  document.querySelectorAll('.modal, .modal-backdrop').forEach(el =>
    el.getAnimations().forEach(a => { try { a.finish(); } catch {} }));
  await sleep(150);
  const px = v => parseFloat(v) || 0;
  const fb = document.querySelector('#answerFeedback');
  const next = document.querySelector('#nextQuestionBtn');
  const body = document.querySelector('.modal-body');
  if (!fb || !next || !body) return { missing: true };
  const r = next.getBoundingClientRect();
  return {
    feedbackFont: px(getComputedStyle(fb).fontSize),
    feedbackText: fb.textContent.trim().length,
    feedbackBorder: getComputedStyle(fb).borderTopWidth,
    nextVisible: !next.classList.contains('hidden'),
    nextHeight: r.height,
    marked: document.querySelectorAll('.answer-option.selected, .answer-option.correct, .answer-option.wrong').length,
    bodyScrolls: body.scrollHeight > body.clientHeight + 1,
    docHeight: document.documentElement.scrollHeight,
    viewportH: innerHeight
  };
})()`;

/** Close the modal and read the nav rail. */
const NAV = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('[data-play-close]')?.click();
  document.documentElement.dataset.fullscreen = '0';
  await sleep(500);
  const px = v => parseFloat(v) || 0;
  const icons = Array.from(document.querySelectorAll('.nav-item .nav-icon'));
  const active = document.querySelector('.nav-item.active .nav-icon');
  const inactive = document.querySelector('.nav-item:not(.active) .nav-icon');
  if (!icons.length) return { missing: true };
  const cs = el => el ? getComputedStyle(el) : null;
  const solid = c => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
  return {
    count: icons.length,
    w: px(cs(icons[0]).width),
    h: px(cs(icons[0]).height),
    activeSolid: solid(cs(active)?.backgroundColor) || cs(active)?.backgroundImage !== 'none',
    inactiveSolid: solid(cs(inactive)?.backgroundColor),
    activeDistinct: cs(active)?.backgroundImage !== cs(inactive)?.backgroundImage,
    helpDisplay: cs(document.querySelector('#helpBtn'))?.display
  };
})()`;

/** The teacher-facing assertions, unchanged from the pre-retrofit check. */
function assertPlaySurface(m, tag) {
  const vw = m.viewport.w;
  check(`[${tag}] question font >= 30px (classroom readable)`, m.questionFont >= 30, `${m.questionFont}px`);
  check(`[${tag}] question weight bold (>=700)`, Number(m.questionWeight) >= 700, m.questionWeight);
  check(`[${tag}] answer font >= 16px`, m.optionFont >= 15.9, `${m.optionFont}px @ ${vw}px`);
  check(`[${tag}] answer option height >= 56px`, m.optionHeight >= 56, `${Math.round(m.optionHeight)}px`);
  check(`[${tag}] answers stay 2 columns`, m.optionCols === 2, `${m.optionCols} cols`);
  // Đo khối nội dung TỔNG (ảnh + chữ), không chỉ riêng câu hỏi: với bố cục
  // 2 cột, câu hỏi hẹp hơn một cách cố ý vì ảnh đã chiếm cột trái.
  const usedWidth = m.stageCenterWidth || m.contentWidth;
  check(`[${tag}] content uses most of the width (>=80% of viewport)`,
    usedWidth >= vw * 0.8 && usedWidth <= vw, `${Math.round(usedWidth)}px of ${vw}px`);
  // Nhưng cột chữ vẫn phải đủ rộng để không xuống dòng từng chữ trên máy chiếu.
  check(`[${tag}] text column still readable (>=50% of viewport)`,
    m.contentWidth >= vw * 0.5, `${Math.round(m.contentWidth)}px of ${vw}px`);
  check(`[${tag}] stage reaches near the bottom of the window`, m.stageBottom >= m.viewport.h * 0.85,
    `bottom ${Math.round(m.stageBottom)} of ${m.viewport.h}`);
  check(`[${tag}] page does not scroll in fullscreen`, m.docHeight <= m.viewport.h + 2, `${m.docHeight} vs ${m.viewport.h}`);
  check(`[${tag}] stage has a gradient background (not flat)`, m.stageBackground === true);

  check(`[${tag}] present button is content-sized, not a 30px square`, m.present.w > 70, `${Math.round(m.present.w)}px wide`);
  check(`[${tag}] present label on one line`, m.labelLines === 1, `${m.labelLines} line(s)`);
  check(`[${tag}] present label not overflowing its button`, m.present.overflowX === false);
  check(`[${tag}] present button >= 34px tall (clickable)`, m.present.h >= 34, `${Math.round(m.present.h)}px`);
  check(`[${tag}] fullscreen + close buttons >= 34px tall`,
    !!m.fsBtn && !!m.closeBtn && m.fsBtn.h >= 34 && m.closeBtn.h >= 34,
    `fs ${Math.round(m.fsBtn ? m.fsBtn.h : 0)}px, close ${Math.round(m.closeBtn ? m.closeBtn.h : 0)}px`);
  check(`[${tag}] header tools do not collide with each other`,
    !!m.fsBtn && !!m.closeBtn && m.fsBtn.right <= m.present.x + 0.5 && m.present.right <= m.closeBtn.x + 0.5,
    `fs.right=${Math.round(m.fsBtn ? m.fsBtn.right : -1)} present.x=${Math.round(m.present.x)} present.right=${Math.round(m.present.right)} close.x=${Math.round(m.closeBtn ? m.closeBtn.x : -1)}`);
  check(`[${tag}] tools sit inside the viewport`, m.present.right <= vw, `right ${Math.round(m.present.right)} of ${vw}`);
}

function assertAnswered(a, tag, viewportH) {
  check(`[${tag}] answer produces feedback text`, a.feedbackText > 20, `${a.feedbackText} chars`);
  check(`[${tag}] feedback font >= 13px`, a.feedbackFont >= 13, `${a.feedbackFont}px`);
  check(`[${tag}] feedback panel has a colour border`, a.feedbackBorder !== '0px', a.feedbackBorder);
  check(`[${tag}] chosen answer is visibly marked`, a.marked >= 1, `${a.marked} marked`);
  check(`[${tag}] next button is shown and clickable`, a.nextVisible === true && a.nextHeight >= 34,
    `${Math.round(a.nextHeight)}px tall`);
  check(`[${tag}] document still does not scroll after answering`,
    a.docHeight <= viewportH + 2, `${a.docHeight} vs ${viewportH}`);
}

function assertNav(nav, tag) {
  check(`[${tag}] every nav item has an icon tile`, nav.count >= 6 && nav.w > 0, `${nav.count} icons, ${nav.w}x${nav.h}`);
  check(`[${tag}] nav icon tile >= 28px`, nav.w >= 28 && nav.h >= 28, `${nav.w}x${nav.h}`);
  check(`[${tag}] inactive nav icons have a visible tile`, nav.inactiveSolid === true);
  check(`[${tag}] active nav icon is a filled brand tile`, nav.activeSolid === true && nav.activeDistinct === true);
  check(`[${tag}] help button is a centred icon button`, nav.helpDisplay === 'grid', nav.helpDisplay);
}

(async () => {
  const ctx = await connect();
  const { evaluate } = ctx;

  for (const size of sizesFor('play')) {
    const tag = size.label;
    console.log(`\n=== play surface @ ${tag} ===`);

    // Drive the UI at the size being measured: opening the modal *before*
    // resizing would measure a layout the teacher never sees.
    await setViewportAndWait(ctx, size);
    const opened = await evaluate(OPEN(GAME));

    check(`[${tag}] play surface opened`, Boolean(opened && opened.stage && opened.question && opened.option),
      opened ? JSON.stringify(opened) : 'no result');

    // Question state, measured and photographed.
    // fontFloor 10: the smallest text painted on the play surface is the
    // `small text-[#aeb5ce]` status line (10px) plus 11px stage chips -- deliberate
    // secondary metadata, the same role as .tag (9px) and .treasure-map-meta (8px).
    // 10px is the measured contract; the ANSWER text, which is what a projector
    // audience actually reads, is guarded at 16px by assertPlaySurface below.
    const { m } = await measureAt(ctx, size, `play-surface-question-${tag}`, {
      check, fontFloor: 10, questionAnswerOverlap: 'assert', innerScrollAreas: 0
    });
    if (m && !m.missing) {
      const read = await evaluate(READ);
      if (read && !read.missing) assertPlaySurface(read, tag);
      else check(`[${tag}] play surface is readable`, false, 'selectors missing');
    } else {
      check(`[${tag}] play surface is readable`, false, 'no play surface to measure');
    }

    // Answered state, measured and photographed too: the feedback panel is the
    // block that pushed the stage off-screen in earlier bugs.
    const a = await evaluate(ANSWER);
    if (a && !a.missing) {
      assertAnswered(a, tag, m && m.viewport ? m.viewport.h : size.height);
      await measureAt(ctx, size, `play-surface-answered-${tag}`, {
        check, fontFloor: 10, questionAnswerOverlap: 'assert', innerScrollAreas: 0
      });
    } else {
      check(`[${tag}] answer feedback renders`, false, 'feedback, next button or body missing');
    }

    // Nav rail, back at normal (non-fullscreen) chrome.
    const nav = await evaluate(NAV);
    if (nav && !nav.missing) assertNav(nav, tag);
    else check(`[${tag}] nav rail renders`, false, 'no .nav-icon elements');
  }

  // ------------------------------------------------------------ treasure ----
  // "Tìm kho báu" is the one template that legitimately SCROLLS on a short
  // projector board, so it is asserted differently from quiz/race/scenario.
  //
  // Measured at 1366x768 with a realistic 6-stage fixture (story 273 chars — the
  // schema allows 1600 — plus taskDescription, 4 long answers and a hint button):
  // the text column alone needs ~656px inside a 662px stage that also carries the
  // map (133px). No amount of trimming fits that without deleting content the
  // teacher wrote, so the contract is NOT "zero overflow" but:
  //
  //   1. everything is reachable by scrolling the stage (no clipped content);
  //   2. the page itself never double-scrolls (docHeight == viewport height);
  //   3. the map is never squashed below its content (DECISIONS #85's
  //      `flex-shrink: 0`), which is what used to clip the node label.
  //
  // An earlier hand-written probe reported "treasure 0/0" here. That was wrong:
  // it used a minimal fixture (one short story, no taskDescription, no hint) and
  // therefore never exercised the height the real content costs. The numbers
  // below come from this check's fixture, which is why it lives in the check.
  for (const size of sizesFor('treasure')) {
    for (const [label, fixture] of [['6-stage', TREASURE_6], ['12-stage', TREASURE_12]]) {
      const tag = `${size.label} ${label}`;
      console.log(`\n=== treasure-hunt ${label} @ ${size.label} ===`);
      await setViewportAndWait(ctx, size);
      const opened = await evaluate(OPEN(fixture));
      check(`[${tag}] treasure stage opened`,
        Boolean(opened && opened.stage && opened.question && opened.option),
        opened ? JSON.stringify(opened) : 'no result');
      if (!opened || !opened.option) continue;

      // Ba trạng thái đo RIÊNG (nhiệm vụ 1 + 3): bản đồ ĐÓNG — trạng thái giáo
      // viên đang trả lời (#91/#104) — rồi MỞ, rồi ĐÓNG LẠI. Khoảng cách
      // ảnh–câu hỏi phải đạt ở cả ba, vì mở drawer từng đổi cả việc tính track
      // (527.5px -> 522.7px ở 1366x768).
      const mapClosed = await evaluate(TREASURE_GEOM);
      assertTreasureGap(mapClosed, `${tag} map closed`, ART_FLOOR[size.width]);
      const shotClosed = await capture(ctx.send, `play-surface-treasure-${label}-${size.label}-map-closed`);
      check(`[${tag}] map-closed screenshot captured`, Boolean(shotClosed.file),
        shotClosed.file || shotClosed.error);

      // DECISIONS #91/#104: the journey map is a collapsed drawer while the
      // teacher is answering, so this fixture opens it through the stage control
      // before its height is measured (the same step a teacher takes).
      const toggleOn = await evaluate(TOGGLE_MAP);
      check(`[${tag}] the stage button reports the map open`, toggleOn.expanded === 'true',
        JSON.stringify(toggleOn));
      const mapOpen = await evaluate(TREASURE_GEOM);
      assertTreasureGap(mapOpen, `${tag} map open`, ART_FLOOR[size.width]);
      // 12 chặng được phép cuộn TRONG bản đồ, không được dồn sân khấu cuộn.
      check(`[${tag}] journey map fits its own box or owns its scroll`,
        !mapOpen.map || mapOpen.map.scrollW <= mapOpen.map.clientW + 2
          || mapOpen.stageScroll.overflowX <= 2,
        mapOpen.map ? `map ${mapOpen.map.scrollW}/${mapOpen.map.clientW}, stage X ${mapOpen.stageScroll.overflowX}px` : 'no map');

      // Photograph it for humans. `assertLayout: false` because the universal
      // "nothing outside the viewport" rule is the wrong contract for a template
      // whose stage is a scroll container (see the comment block above).
      const { m, shot } = await measureAt(ctx, size, `play-surface-treasure-${label}-${size.label}`, {
        check, fontFloor: 8, assertLayout: false
      });
      check(`[${tag}] nothing is clipped inside its own box`,
        (m.clippedCount || 0) === 0, `${m.clippedCount} clipped`);

      // `m.outsideCount` is NOT usable here. The stage is a scroll container, so
      // the answers below the fold are legitimately "outside" it at scrollTop 0.
      // The real defect is a COLUMN that grew taller than its own scrollable
      // container (`.stage-center`): the column's overflow spills past the
      // center's edge and the stage's scrollHeight only counts the center, so the
      // spilled rows can never be scrolled to. Comparing a child against the
      // stage would miss it entirely — the inflated column is what grows the
      // stage. Compare each child against its own scroll container.
      // Verified by re-introducing the bug (flex-shrink: 0 -> 1): 0 -> 65 stranded.
      const stranded = await evaluate(`(async () => {
        await new Promise(r => setTimeout(r, 150));
        const containers = [...document.querySelectorAll('.stage-center, .stage-col')];
        if (!containers.length) return { missing: true };
        const bad = [];
        for (const box of containers) {
          const b = box.getBoundingClientRect();
          const cs = getComputedStyle(box);
          const scrollable = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
          for (const el of box.children) {
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            // overflow:visible cannot clip, so spill is real and unreachable.
            const spilled = r.bottom > b.bottom + 2 || r.top < b.top - 2;
            if (spilled && !scrollable) {
              bad.push({ cls: (el.className || el.id || el.tagName).toString().slice(0, 36),
                spill: Math.round(r.bottom - b.bottom), box: Math.round(b.height) });
            }
          }
        }
        return { count: bad.length, worst: bad.slice(0, 3) };
      })()`);
      check(`[${tag}] no column spills past its scroll container`,
        !stranded.missing && stranded.count === 0,
        stranded.missing ? 'no .stage-center' : `${stranded.count} stranded, worst: ${JSON.stringify(stranded.worst)}`);


      const t = await evaluate(`(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const stage = document.querySelector('.game-stage');
        if (!stage) return { missing: true };
        const cs = getComputedStyle(stage);
        const overflow = stage.scrollHeight - stage.clientHeight;
        const sr = () => stage.getBoundingClientRect();
        // Scroll to the very end and check the last control is really there.
        stage.scrollTop = stage.scrollHeight;
        await sleep(250);
        const r = sr();
        const inside = el => {
          if (!el) return false;
          const b = el.getBoundingClientRect();
          return b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
        };
        const opts = document.querySelectorAll('#treasureMission .answer-option');
        const map = document.querySelector('.treasure-map');
        const mapCs = map ? getComputedStyle(map) : null;
        return {
          viewport: { w: innerWidth, h: innerHeight },
          overflowY: cs.overflowY,
          overflow: Math.round(overflow),
          reachedEnd: Math.abs(stage.scrollTop - overflow) <= 4,
          bottomControlInside: inside(document.querySelector('.stage-bottom')),
          lastAnswerInside: inside(opts[opts.length - 1]),
          answers: opts.length,
          nodes: document.querySelectorAll('.treasure-map-node').length,
          mapClipped: map ? (map.scrollHeight > map.clientHeight + 2 && mapCs.overflowY !== 'visible') : null,
          mapShrink: mapCs ? mapCs.flexShrink : null,
          docHeight: document.documentElement.scrollHeight
        };
      })()`);

      if (!t || t.missing) {
        check(`[${tag}] treasure stage measured`, false, 'no .game-stage');
        continue;
      }
      check(`[${tag}] stage is the scroll container (not the page)`,
        t.overflowY === 'auto' || t.overflowY === 'scroll', t.overflowY);
      check(`[${tag}] page never double-scrolls`, t.docHeight <= t.viewport.h + 2,
        `${t.docHeight} vs ${t.viewport.h}`);
      check(`[${tag}] can scroll to the end of the stage`, t.reachedEnd === true,
        `overflow ${t.overflow}px`);
      check(`[${tag}] bottom control is reachable after scrolling`,
        t.bottomControlInside === true, `overflow ${t.overflow}px`);
      check(`[${tag}] every answer is reachable (none stranded outside)`,
        t.lastAnswerInside === true && t.answers === 4, `${t.answers} answers`);
      check(`[${tag}] map is as tall as its content (node label not clipped)`,
        t.mapClipped === false, `flex-shrink ${t.mapShrink}`);
      check(`[${tag}] map is not allowed to shrink below its content`,
        t.mapShrink === '0', `flex-shrink ${t.mapShrink}`);
      check(`[${tag}] whole journey is rendered`,
        t.nodes === (label === '6-stage' ? 6 : 12), `${t.nodes} nodes`);

      // Trạng thái thứ ba: đóng lại. Scroll về đầu trước để so với bản đo lúc
      // chưa mở (cùng scrollTop thì toạ độ mới so sánh được).
      await evaluate(`(async () => {
        const stage = document.querySelector('.game-stage');
        if (stage) stage.scrollTop = 0;
        await new Promise(r => setTimeout(r, 200));
      })()`);
      const toggleOff = await evaluate(TOGGLE_MAP);
      check(`[${tag}] the stage button reports the map closed again`, toggleOff.expanded === 'false',
        JSON.stringify(toggleOff));
      const reClosed = await evaluate(TREASURE_GEOM);
      assertTreasureGap(reClosed, `${tag} map re-closed`, ART_FLOOR[size.width]);
      assertTreasureStability(mapClosed, reClosed, `${tag} map toggle`);
      // Mở drawer có làm khối nội dung dịch không? (nhiệm vụ 3: bản đồ không được
      // đổi khoảng cách ảnh–câu hỏi.)
      assertTreasureStability(mapClosed, mapOpen, `${tag} map open`, 'x');

      // Nhiệm vụ 2, điều kiện "bố cục vẫn hợp lý khi KHÔNG có ảnh": mở lại
      // đúng màn hình đó (illustrationMode 'off') rồi đo. Không được chỉ ẩn node
      // — `:has(.stage-illustration)` vẫn khớp khi node còn trong DOM.
      const noArtOpen = await evaluate(OPEN(treasureGame(
        label === '6-stage' ? 6 : 12, 'ui-play-surface-treasure-noart-' + label, 'off')));
      check(`[${tag}] no-illustration stage opened`,
        Boolean(noArtOpen && noArtOpen.stage && noArtOpen.question && noArtOpen.option),
        noArtOpen ? JSON.stringify(noArtOpen) : 'no result');
      const na = await evaluate(TREASURE_GEOM);
      check(`[${tag}] the fixture really drew no illustration`,
        Boolean(na) && na.hasArt === false, JSON.stringify(na && { hasArt: na.hasArt, art: na.ill }));
      // wizard.css:414 ẩn cột ảnh khi không có ảnh; lưới PHẢI bỏ luôn track của
      // nó, nếu không cột chữ tự động rơi vào track thứ nhất và bị bóp đúng bề
      // rộng cột ảnh (đo được 220px trước khi sửa).
      check(`[${tag}] no-illustration leaves the empty art column no track`,
        Boolean(na) && na.sideCol && na.sideCol.w === 0,
        na && na.sideCol ? `col ${na.sideCol.w}px wide, display ${na.sideCol.display}` : JSON.stringify(na));
      check(`[${tag}] no-illustration gives the text column the full stage width`,
        Boolean(na) && na.mainCol && na.mainCol.w >= 0.85 * na.viewport.w,
        na ? `main ${na.mainCol && na.mainCol.w}px of ${na.viewport.w}px viewport ` +
          `(tracks ${na.tracks})` : 'no result');
      check(`[${tag}] no-illustration still renders all four answers`,
        Boolean(na) && na.optionCount === 4, JSON.stringify(na && { options: na.optionCount }));
      const naShot = await capture(ctx.send, `play-surface-treasure-${label}-${size.label}-no-art`);
      check(`[${tag}] no-illustration screenshot captured`, Boolean(naShot && naShot.file),
        JSON.stringify(naShot || {}));

      console.log(`  ${label.padEnd(9)} gap closed ${mapClosed.gap}px / open ${mapOpen.gap}px / re-closed ${reClosed.gap}px  `
        + `art ${mapClosed.ill.w}px in ${mapClosed.artTrack}px track  `
        + `no-art main ${na?.mainCol?.w}/${na?.viewport?.w}px  `
        + `overflow ${String(t.overflow).padStart(4)}px  nodes ${t.nodes}  answers ${t.answers}  `
        + `docH ${t.docHeight}/${t.viewport.h}  -> ${shot.file || '(no image)'}`);
    }
  }
  // ---------------------------------------------------------------- race ----
  // Race is measured under the SAME contract as quiz: nothing may be pushed out
  // of the viewport. Unlike treasure, its left column is a track and its right
  // column is the question, so a 40-cell track + 4 long answers must still fit a
  // 768px board (#84 and #85 both left this unmeasured).
  for (const size of sizesFor('race')) {
    const tag = `${size.label} race`;
    console.log(`\n=== race @ ${size.label} ===`);
    await setViewportAndWait(ctx, size);
    const opened = await evaluate(OPEN(RACE));
    check(`[${tag}] race stage opened`,
      Boolean(opened && opened.stage),
      opened ? JSON.stringify(opened) : 'no result');
    if (!opened || !opened.stage) continue;

    // Race opens on a "draw a question" panel; the question column only exists
    // after a draw. Measure the state the class actually reads from.
    const drawn = await evaluate(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const btn = document.getElementById('drawQuestionBtn');
      if (btn) btn.click();
      await sleep(600);
      return {
        question: Boolean(document.querySelector('.stage-question')),
        option: Boolean(document.querySelector('.answer-option')),
        cells: document.querySelectorAll('.race-track .race-cell').length
      };
    })()`);
    check(`[${tag}] race question can be drawn`,
      Boolean(drawn && drawn.question && drawn.option),
      drawn ? JSON.stringify(drawn) : 'no result');
    if (!drawn || !drawn.option) continue;

    const { m, shot } = await measureAt(ctx, size, `play-surface-race-${size.label}`, {
      check, fontFloor: 8, questionAnswerOverlap: 'assert', innerScrollAreas: 0
    });
    check(`[${tag}] nothing is painted outside the viewport`,
      (m.outsideCount || 0) === 0,
      m.outsideCount ? `${m.outsideCount} element(s), worst: ${JSON.stringify(m.outside[0])}` : '');

    const r = await evaluate(`(async () => {
      const stage = document.querySelector('.game-stage');
      if (!stage) return { missing: true };
      const cells = document.querySelectorAll('.race-track .race-cell');
      const opts = document.querySelectorAll('.race-stage .answer-option, .game-stage .answer-option');
      const track = document.querySelector('.race-track');
      return {
        cells: cells.length,
        answers: opts.length,
        trackRows: track ? Math.round(track.scrollHeight / Math.max(1, track.clientHeight)) : null,
        stageFits: stage.scrollHeight <= stage.clientHeight + 2,
        overflow: Math.round(stage.scrollHeight - stage.clientHeight),
        docHeight: document.documentElement.scrollHeight,
        viewportH: innerHeight
      };
    })()`);
    if (r && !r.missing) {
      check(`[${tag}] whole 40-cell track is rendered`, r.cells === 40, `${r.cells} cells`);
      check(`[${tag}] all four answers are rendered`, r.answers === 4, `${r.answers} answers`);
      check(`[${tag}] stage does not overflow (race must fit, unlike treasure)`,
        r.stageFits === true, `overflow ${r.overflow}px`);
      check(`[${tag}] page never double-scrolls`, r.docHeight <= r.viewportH + 2,
        `${r.docHeight} vs ${r.viewportH}`);
      console.log(`  race      cells ${r.cells}  answers ${r.answers}  `
        + `overflow ${r.overflow}px  docH ${r.docHeight}/${r.viewportH}  -> ${shot.file || '(no image)'}`);
    } else {
      check(`[${tag}] race stage measured`, false, 'no .game-stage');
    }
  }





  // ------------------------------------------------- đấu trường tri thức ----
  // Bước đo của "Đấu trường tri thức": bốn tổ hợp bố cục đã chốt (Cổ điển /
  // Xây nhà × có ảnh / không ảnh) ở hai kích thước máy chiếu, mỗi tổ hợp chạy
  // cả fixture NGẮN lẫn DÀI ⇒ 16 lượt đo và 8 ảnh bắt buộc cho tổ hợp ngắn.
  //
  // Vì sao phải đo từng tổ hợp chứ không đo một lần: yêu cầu đã chốt rằng chính
  // CÁCH CHIA BỐ CỤC đổi theo (a) chế độ chơi và (b) việc câu hỏi có ảnh. Một
  // gate chỉ đo "câu hỏi + lưới đáp án" sẽ xanh dù Xây nhà vẫn bị cột HUD ăn
  // mất 240–320px, và sẽ xanh dù Cổ điển đặt ảnh bên TRÁI trong khi giáo viên
  // chốt ảnh bên PHẢI.
  const QUIZ_COMBOS = [];
  for (const play of ['classic', 'house'])
    for (const art of [true, false])
      for (const len of ['short', 'long'])
        QUIZ_COMBOS.push({ play, art, len });

  /** Một dòng mỗi tổ hợp để bàn giao kèm bảng số đo hiện trạng. */
  const quizTable = [];
  for (const size of sizesFor('quiz')) {
    for (const spec of QUIZ_COMBOS) {
      const combo = `${spec.play}-${spec.art ? 'art' : 'noart'}-${spec.len}`;
      const tag = `${size.label} ${combo}`;
      console.log(`\n=== quiz ${combo} @ ${size.label} ===`);
      await setViewportAndWait(ctx, size);
      const opened = await evaluate(OPEN(quizGame(spec)));
      check(`[${tag}] quiz stage opened`,
        Boolean(opened && opened.stage && opened.question && opened.option),
        opened ? JSON.stringify(opened) : 'no result');
      if (!opened || !opened.option) continue;

      // Chế độ chơi phải đúng như giáo viên mở: `is-house-mode` là do
      // renderQuestion gắn theo isHouseMode(game), không phải do probe đặt.
      const g = await evaluate(QUIZ_GEOM);
      check(`[${tag}] the stage is in the requested gameplay mode`,
        g && !g.missing && g.houseMode === (spec.play === 'house'),
        g && !g.missing ? `is-house-mode=${g.houseMode}, expected ${spec.play === 'house'}` : 'no geometry');

      const { m } = await measureAt(ctx, size, `play-surface-quiz-${combo}-${size.label}`, {
        check, fontFloor: 10, questionAnswerOverlap: 'assert', innerScrollAreas: 0,
        // `requireScreenshot` chỉ bắt buộc ở tám tổ hợp ngắn: ảnh của nội dung
        // dài vẫn được ghi nếu compositor trả lời, nhưng một lần chụp thất bại
        // vì môi trường (lỗi đã ghi ở docs/STATUS) không được phép làm đỏ một
        // bố cục đúng.
        requireScreenshot: spec.len === 'short'
      });
      assertQuizLayout(g, tag, spec);
      console.log(quizRow(g, tag));
      if (g && !g.missing) {
        quizTable.push({
          tag,
          qFont: g.question.font, optFont: g.options[0].font,
          artW: g.art ? g.art.w : 0, artPct: g.artPct, gridPct: g.gridPct,
          gap: g.artGridGap, hudAbove: g.hudAboveQuestion,
          hidden: g.options.filter(o => !o.inside).length,
          covered: g.options.filter(o => o.inside && !o.hittable).length,
          ovX: g.stageScroll.overflowX, ovY: g.stageScroll.overflowY,
          doc: g.docHeight, vh: g.viewport.h
        });
      }
      if (spec.len === 'long') {
        const ls = await capture(ctx.send, `play-surface-quiz-${combo}-${size.label}`);
        console.log(`  long fixture image: ${ls.file || '(no image: ' + ls.error + ')'}`);
      }
      if (m && m.outsideCount) {
        console.log(`  painted outside viewport: ${m.outsideCount} -> ${JSON.stringify(m.outside[0])}`);
      }
    }
  }

  console.log('\n=== bảng số đo hiện trạng "Đấu trường tri thức" ===');
  console.log('  tổ hợp                                qPX    oPX  artPX art%  grid%  khe  HUDtrên  ẩn che  ovX ovY  doc/viewport');
  for (const r of quizTable) {
    console.log('  ' + r.tag.padEnd(34)
      + String(r.qFont).padStart(7) + String(r.optFont).padStart(6)
      + String(r.artW).padStart(7)
      + (r.artPct === null ? ' n/a' : ' ' + Math.round(r.artPct * 100) + '%').padStart(6)
      + (Math.round(r.gridPct * 100) + '%').padStart(7)
      + String(r.gap === null ? 'n/a' : r.gap).padStart(5)
      + String(r.hudAbove === null ? 'n/a' : (r.hudAbove ? 'có' : 'KHÔNG')).padStart(9)
      + String(r.hidden).padStart(4) + String(r.covered).padStart(4)
      + String(r.ovX).padStart(5) + String(r.ovY).padStart(5)
      + `  ${r.doc}/${r.vh}`);
  }




  await evaluate(`(async () => {
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    document.documentElement.dataset.fullscreen = '0';
    return true;
  })()`);
  await setViewport(ctx.send, null);

  const failed = results.filter(r => !r.ok);
  console.log(`\nui-play-surface-check: ${results.length - failed.length}/${results.length} checks passed`);
  ctx.ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });

