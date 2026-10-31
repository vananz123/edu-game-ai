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
  // DECISIONS #84/#88: the play surface is TWO columns above 1180px — artwork
  // on the left, question + answers on the right. Measuring only
  // .stage-question therefore reports the text column (956 of 1280px = 75%)
  // and fails, even though no space is wasted: the missing 205px went to the
  // illustration on purpose. What the teacher actually sees as "the content
  // spans the window" is the whole row, so that is what gets measured, and a
  // separate assertion below still guards that the TEXT column keeps at least
  // half of the window (the original intent) instead of being deleted.
  const rowHost = q.closest('.stage-center');
  const cols = rowHost ? [...rowHost.children].filter(el => el.offsetWidth > 0 || el.offsetHeight > 0) : [];
  const rowLeft = cols.length ? Math.min(...cols.map(el => el.getBoundingClientRect().left)) : 0;
  const rowRight = cols.length ? Math.max(...cols.map(el => el.getBoundingClientRect().right)) : 0;
  const rowWidth = Math.round(rowRight - rowLeft);
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
    // Width of the whole content row (artwork column + text column), which is
    // what "the content spans the window" means under the 2-column layout.
    rowWidth: rowWidth,
    columnCount: cols.length,
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
  // A fresh profile opens the setup onboarding into #modalRoot a moment after the
  // window loads; it would replace the play surface this check measures. Same
  // guard as ui-game-worlds-check / ui-house-building-check.
  await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) { if (document.querySelector('#modalRoot .setup-fullscreen')) break; await sleep(100); }
    if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
    await sleep(250);
    return true;
  })()`);
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
    `row ${m.rowWidth}px over ${m.columnCount} column(s)`,
    `stage ${Math.round(m.stage.w)}x${Math.round(m.stage.h)}`,
    `empty ${(m.emptyRatio * 100).toFixed(1)}% of the stage (diagnostic only, see #89)`,
    `bottom gap ${m.contentBottomGap}px (${m.gapUnderAnswers}px right under the answers)`,
    `body ${m.bodyScrolls ? 'SCROLLS' : 'no scroll'}, doc ${m.docHeight}/${vp.h}`
  ].join('\n') + '\n');

  // Cỡ chữ: câu hỏi phải đọc được từ cuối lớp, kể cả trên cửa sổ laptop
  // (1366x768, chừa taskbar) nơi câu hỏi dài + 4 đáp án vẫn phải vừa một màn.
  check('câu hỏi >= 34px ở toàn màn hình', m.questionFont >= 34, `${m.questionFont.toFixed(1)}px`);
  check('đáp án >= 20px ở toàn màn hình', m.answerFont >= 20, `${m.answerFont.toFixed(1)}px`);
  check('đáp án cao >= 64px (bấm từ xa)', m.answerHeight >= 64, `${Math.round(m.answerHeight)}px`);
  // Bề rộng: dải trống hai bên là thứ giáo viên nhìn thấy rõ nhất trên máy chiếu.
  //
  // Đo KHỐI NỘI DUNG (hàng gồm cột minh hoạ + cột chữ), không đo mỗi
  // `.stage-question`. Từ DECISIONS #84 màn chơi là hai cột ở bề rộng >1180px:
  // cột minh hoạ giữ ~205px một cách CÓ CHỦ ĐÍCH, nên đo riêng cột chữ luôn ra
  // ~75% và luôn đỏ dù không hề lãng phí chỗ. Dùng lại đúng cách #84 đã sửa cho
  // `ui-play-surface-check`; #84 chỉ sửa check đó và bỏ sót check này, nên hai
  // phép đo 1280px ở đây đỏ suốt từ đó (xem DECISIONS #88).
  check('khối nội dung chiếm >= 86% bề rộng cửa sổ',
    m.rowWidth >= vp.w * 0.86, `${m.rowWidth}px / ${vp.w}px (${m.columnCount} cột)`);
  // Giữ lại ý định GỐC của assertion cũ thay vì xoá nó: cột chữ phải chiếm ít
  // nhất một nửa cửa sổ, để "hai cột" không bị dùng làm cớ thu hẹp chữ.
  check('cột chữ chiếm >= 50% bề rộng cửa sổ',
    m.gridWidth >= vp.w * 0.5, `${Math.round(m.gridWidth)}px / ${vp.w}px`);
  // Chỗ trống theo chiều cao: vùng câu hỏi + đáp án phải phủ phần lớn stage, và
  // không còn dải trống lớn ngay dưới đáp án.
  //
  // ĐÃ GỠ Ở #89 — đọc kỹ trước khi định thêm lại. Assertion này đo hình chữ
  // nhật "câu hỏi..lưới đáp án" bằng `offsetWidth/offsetHeight`, tức là nó
  // KHÔNG thấy khối ảnh. Từ #84 màn hình 1280x720 rơi về 1 CỘT và ảnh nằm
  // CHỒNG trên câu hỏi, nên hình chữ nhật bị đo thiếu hẳn bề rộng thật của hàng
  // và luôn báo ~48% "trống" dù mắt không thấy khoảng trống nào.
  //
  // Đã thử hai cách sửa và CẢ HAI đều làm con số này mất ý nghĩa (kiểm chứng
  // bằng negative control: thu ảnh về 200px, co câu hỏi, kéo dài cột chữ — số
  // không đổi, tức phép đo mù với đúng thứ nó định bảo vệ):
  //   - đo từ đỉnh phần tử đầu tiên của khối: vẫn ra đúng 19.5% ở mọi biến thể
  //     vì `getBoundingClientRect()` của khối và `offsetTop` của stage trộn
  //     hai hệ toạ độ khác nhau (stage có `position: sticky` bên trong);
  //   - bỏ hẳn ảnh ra khỏi phép đo: sai chủ đích — ảnh là nội dung giáo viên
  //     trả tiền để thấy trên máy chiếu.
  // Hai assertion dưới đây phủ đúng điều người dùng quan tâm mà không cần con
  // số này: "đáp án không còn dải trống phía dưới" (đo trực tiếp khoảng cách
  // thật) và "không có thanh cuộn trang". Việc đo đúng toàn bộ khối nội dung
  // của bố cục 2 cột được tách thành việc riêng, xem docs/STATUS.md.
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

