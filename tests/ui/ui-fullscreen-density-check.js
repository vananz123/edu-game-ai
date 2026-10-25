// ui-fullscreen-density-check.js — chấm PASS/FAIL cho mật độ màn chơi Ở CHẾ ĐỘ
// TOÀN MÀN HÌNH. Giáo viên báo: "cỡ chữ câu hỏi và đáp án vẫn quá nhỏ, vẫn còn
// nhiều chỗ trống chưa được tối ưu" (xem DECISIONS #59).
//
// Chạy trên app đã build (hoặc bản đóng gói) có --remote-debugging-port:
//   npm run build
//   npx electron . --remote-debugging-port=9357
//   node tests/ui/ui-fullscreen-density-check.js 9357
//
// Mỗi phép đo là số học trên offsetWidth/offsetHeight (vị trí CHOÁN CHỖ) của
// renderer thật, không đọc CSS: CSS đúng vẫn có thể cho ra chỗ trống nếu cột
// nội dung bị chặn bởi max-width của bố cục thường, hoặc nếu cỡ chữ bị quy tắc
// `@media (max-height:800px)` khai báo sau đè mất. Dùng offset* thay vì
// getBoundingClientRect để scale 0.92 của animation pop-in không làm px nhỏ đi.
const { check, connect, results } = require('../manual/lib/ui-check-lib');

// Trò chơi mẫu dùng dữ liệu TỔNG HỢP (không có dữ liệu học sinh thật).
const GAME = JSON.stringify({
  id: 'density-check', title: 'Ôn tập kiến thức lớp 6', subject: 'Kỹ năng sống', grade: '6',
  template: 'quiz', description: '', tags: [], sourceName: '', createdAt: '2026-01-01T00:00:00.000Z',
  gameSetup: { scoringMode: 'cơ bản' },
  questions: [
    {
      id: 'q1', type: 'multiple-choice',
      prompt: 'Khi gặp một bạn mới trong lớp, cách nào sau đây thể hiện sự tôn trọng và giúp em kết bạn tốt hơn?',
      options: [
        { id: 'a', text: 'Chủ động chào hỏi và hỏi thăm bạn một cách tự nhiên' },
        { id: 'b', text: 'Đứng quan sát từ xa cho đến khi bạn ấy nói trước' },
        { id: 'c', text: 'Kể ngay một câu chuyện cười thật dài để gây chú ý' },
        { id: 'd', text: 'Chờ giáo viên giới thiệu rồi mới dám lên tiếng' }
      ],
      correctOptionId: 'a', correctAnswer: '', explanation: 'Chào hỏi chủ động là bước đầu tiên của một tình bạn mới.', points: 100
    }
  ]
});


// Mở màn chơi ở toàn màn hình. Bấm ⛶ TRƯỚC khi màn chơi mở sẽ chạy hai lần trên
// dataset (bật rồi tắt ngay), nên mở bằng playGame(..., { fullscreen: true }) —
// đúng đường đi của nút "Trình chiếu".
const OPEN = `
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.getElementById('modalRoot').innerHTML = '';
  await sleep(300);
  playGame(GAME_JSON, { fullscreen: true });
  await sleep(900);
  return true;
`.replace('GAME_JSON', GAME);

const MEASURE = `
  const cs = el => getComputedStyle(el);
  const px = v => parseFloat(v) || 0;
  const box = el => ({ w: el.offsetWidth, h: el.offsetHeight, top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight });
  const q = document.querySelector('.stage-question');
  const grid = document.querySelector('.answer-grid');
  const opt = document.querySelector('.answer-option');
  const stage = document.querySelector('.game-stage');
  const body = document.querySelector('.modal-body');
  if (!q || !grid || !opt) return { missing: true };
  const qBox = box(q), gridBox = box(grid), stageBox = box(stage);
  const blockHeight = gridBox.bottom - qBox.top;
  const blockWidth = Math.max(qBox.w, gridBox.w);
  // Đáy nội dung thật của stage: phần tử con hiển thị cuối cùng của khối
  // .stage-center (thanh dưới có nút "Tiếp tục" luôn hiện, nên đo tới đáy lưới
  // đáp án sẽ báo một dải trống không có thật). Toạ độ đổi sang hệ của stage.
  const center = stage.querySelector('.stage-center');
  const centerTop = center ? center.offsetTop : 0;
  const visibleKids = center ? [...center.children].filter(el => el.offsetHeight > 0 || el.offsetWidth > 0) : [];
  const contentBottom = visibleKids.length
    ? centerTop + visibleKids[visibleKids.length - 1].offsetTop + visibleKids[visibleKids.length - 1].offsetHeight
    : gridBox.bottom;
  return {
    viewport: { w: innerWidth, h: innerHeight },
    questionFont: px(cs(q).fontSize),
    questionWidth: qBox.w,
    answerFont: px(cs(opt).fontSize),
    answerHeight: box(opt).h,
    answerLines: Math.round(box(opt).h / (px(cs(opt).lineHeight) || px(cs(opt).fontSize) * 1.2)),
    gridWidth: gridBox.w,
    gridColumns: cs(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
    stage: stageBox,
    emptyRatio: Math.max(0, 1 - (blockHeight * blockWidth) / (stageBox.w * stageBox.h)),
    contentBottomGap: Math.round(stageBox.bottom - contentBottom),
    gapUnderAnswers: Math.round(contentBottom - gridBox.bottom),
    docHeight: document.documentElement.scrollHeight,
    bodyScrolls: body.scrollHeight > body.clientHeight + 2
  };
`;

const CLOSE = `
  const was = document.documentElement.dataset.fullscreen === '1';
  document.querySelector('[data-play-close]')?.click();
  await new Promise(r => setTimeout(r, 300));
  if (was) { try { await window.eduGame.setFullscreen(false); } catch {} }
  return true;
`;

(async () => {
  const { ws, evaluate, settle } = await connect();
  await evaluate('(async () => {' + OPEN + '})()');
  // Hoàn tất animation trước khi đo (cửa sổ nền làm timeline tạm dừng).
  await settle();

  const m = await evaluate('(() => {' + MEASURE + '})()');
  if (m.missing) {
    console.log('FAIL  không tìm thấy .stage-question / .answer-grid / .answer-option');
    await evaluate('(async () => {' + CLOSE + '})()');
    ws.close();
    process.exit(1);
  }

  const vp = m.viewport;
  console.log('\n' + [
    `viewport ${vp.w}x${vp.h}`,
    `question ${m.questionFont.toFixed(1)}px / ${Math.round(m.questionWidth)}px wide`,
    `answer ${m.answerFont.toFixed(1)}px / ${m.answerLines} line(s) / ${Math.round(m.answerHeight)}px tall`,
    `grid ${Math.round(m.gridWidth)}px, ${m.gridColumns} cols`,
    `stage ${Math.round(m.stage.w)}x${Math.round(m.stage.h)}`,
    `empty ${(m.emptyRatio * 100).toFixed(1)}% of the stage`,
    `bottom gap ${m.contentBottomGap}px (${m.gapUnderAnswers}px right under the answers)`,
    `body ${m.bodyScrolls ? 'SCROLLS' : 'no scroll'}, doc ${m.docHeight}/${vp.h}`
  ].join('\n') + '\n');

  // Cỡ chữ: câu hỏi phải đọc được từ cuối lớp, kể cả trên cửa sổ laptop
  // (1366x768, chừa taskbar) nơi câu hỏi dài + 4 đáp án vẫn phải vừa một màn.
  check('câu hỏi >= 34px ở toàn màn hình', m.questionFont >= 34, `${m.questionFont.toFixed(1)}px`);
  check('đáp án >= 20px ở toàn màn hình', m.answerFont >= 20, `${m.answerFont.toFixed(1)}px`);
  check('đáp án cao >= 64px (bấm từ xa)', m.answerHeight >= 64, `${Math.round(m.answerHeight)}px`);
  // Bề rộng: dải trống hai bên là thứ giáo viên nhìn thấy rõ nhất trên máy chiếu.
  check('câu hỏi chiếm >= 86% bề rộng cửa sổ',
    m.questionWidth >= vp.w * 0.86, `${Math.round(m.questionWidth)}px / ${vp.w}px`);
  check('lưới đáp án chiếm >= 86% bề rộng cửa sổ',
    m.gridWidth >= vp.w * 0.86, `${Math.round(m.gridWidth)}px / ${vp.w}px`);
  // Chỗ trống theo chiều cao: vùng câu hỏi + đáp án phải phủ phần lớn stage, và
  // không còn dải trống lớn ngay dưới đáp án.
  check('câu hỏi + đáp án phủ >= 62% diện tích stage',
    m.emptyRatio <= 0.38, `empty ${(m.emptyRatio * 100).toFixed(1)}%`);
  check('đáp án không còn dải trống > 90px phía dưới',
    m.contentBottomGap <= 90, `${m.contentBottomGap}px below the answers`);
  check('đáp án vẫn 2 cột', m.gridColumns === 2, `${m.gridColumns} cols`);
  check('không có thanh cuộn trang trong toàn màn hình',
    m.docHeight <= vp.h + 2, `${m.docHeight} vs ${vp.h}`);

  await evaluate('(async () => {' + CLOSE + '})()');
  const failed = results.filter(r => !r.ok);
  console.log(`\nui-fullscreen-density-check: ${results.length - failed.length}/${results.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });

