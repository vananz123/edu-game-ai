// repro-fullscreen-density.js — đo cỡ chữ và chỗ trống của màn chơi Ở CHẾ ĐỘ
// TOÀN MÀN HÌNH trên renderer thật. Công cụ chẩn đoán đã tìm ra hai lỗi bố cục
// (DECISIONS #59); bản chấm PASS/FAIL là tests/ui/ui-fullscreen-density-check.js.
//
//   npm run build
//   npx electron . --remote-debugging-port=9357
//   node tests/manual/repro-fullscreen-density.js 9357
const { connect } = require('./lib/ui-check-lib');

// Trò chơi mẫu dùng dữ liệu TỔNG HỢP (không có dữ liệu học sinh thật).
const GAME = JSON.stringify({
  id: 'density-repro', title: 'Ôn tập kiến thức lớp 6', subject: 'Kỹ năng sống', grade: '6',
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

// Mở màn chơi ở toàn màn hình, hoàn tất animation, đo, rồi đóng lại.
const OPEN = `
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.getElementById('modalRoot').innerHTML = '';
  await sleep(300);
  playGame(GAME_JSON, { fullscreen: true });
  await sleep(900);
  return true;
`.replace('GAME_JSON', GAME);

// Đo màn chơi đang mở. Dùng vị trí CHOÁN CHỖ (offsetTop/offsetHeight) thay vì
// getBoundingClientRect để số đo không bị scale 0.92 của animation pop-in.
const MEASURE = `
  const cs = el => getComputedStyle(el);
  const px = v => parseFloat(v) || 0;
  const box = el => ({ w: el.offsetWidth, h: el.offsetHeight, top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight });
  const q = document.querySelector('.stage-question');
  const grid = document.querySelector('.answer-grid');
  const opt = document.querySelector('.answer-option');
  const stage = document.querySelector('.game-stage');
  const tip = document.querySelector('.stage-tip');
  const body = document.querySelector('.modal-body');
  const modal = document.querySelector('#modalRoot .modal');
  const backdrop = document.querySelector('#modalRoot .modal-backdrop');
  if (!q || !grid || !opt) {
    return { missing: { question: !q, grid: !grid, option: !opt },
      markup: (document.getElementById('playBody') || {}).innerHTML?.slice(0, 600) || '' };
  }
  // Hình học phía trên/ngoài stage (không phụ thuộc scale) để quy đổi
  // offsetTop của stage sang toạ độ viewport.
  const rStage = stage.getBoundingClientRect();
  const stageTop = rStage.top - parseFloat(cs(stage).borderTopWidth) - stage.scrollTop;
  const qBox = box(q), gridBox = box(grid), stageBox = box(stage);
  const blockHeight = gridBox.bottom - qBox.top;
  const blockWidth = Math.max(qBox.w, gridBox.w);
  const lineCount = el => Math.round(el.offsetHeight / (px(cs(el).lineHeight) || px(cs(el).fontSize) * 1.2));
  const diag = {
    viewport: { w: innerWidth, h: innerHeight },
    modal: { w: modal.offsetWidth, h: modal.offsetHeight,
      maxWidth: cs(modal).maxWidth, width: cs(modal).width,
      transform: cs(modal).transform, rectW: Math.round(modal.getBoundingClientRect().width) },
    backdrop: backdrop ? { h: backdrop.offsetHeight, rectH: Math.round(backdrop.getBoundingClientRect().height),
      display: cs(backdrop).display, opacity: cs(backdrop).opacity, transform: cs(backdrop).transform } : null,
    modalBody: { h: body.offsetHeight, scrollH: body.scrollHeight, padding: cs(body).padding },
    stage: { ...stageBox, gap: cs(stage).rowGap, gridRows: cs(stage).gridTemplateRows,
      height: cs(stage).height, minHeight: cs(stage).minHeight },
    stageCenter: { h: stage.querySelector('.stage-center')?.offsetHeight,
      gap: cs(stage.querySelector('.stage-center')).gap,
      alignContent: cs(stage.querySelector('.stage-center')).alignContent },
    question: { ...qBox, font: px(cs(q).fontSize), lineHeight: cs(q).lineHeight, maxWidth: cs(q).maxWidth },
    grid: { ...gridBox, gap: cs(grid).rowGap, columns: cs(grid).gridTemplateColumns },
    option: { ...box(opt), font: px(cs(opt).fontSize), lineHeight: cs(opt).lineHeight, minHeight: cs(opt).minHeight, padding: cs(opt).padding },
    nextSibling: opt.nextElementSibling ? { h: box(opt.nextElementSibling).h } : null,
    stageBottom: { h: stage.querySelector('.stage-bottom')?.offsetHeight },
    stageTopComputed: Math.round(stageTop)
  };
  return {
    diag,
    viewport: { w: innerWidth, h: innerHeight },
    questionFont: px(cs(q).fontSize),
    questionLines: lineCount(q),
    questionWidth: qBox.w,
    answerFont: px(cs(opt).fontSize),
    answerLines: lineCount(opt),
    answerHeight: box(opt).h,
    gridWidth: gridBox.w,
    gridColumns: cs(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
    stage: stageBox,
    emptyRatio: Math.max(0, 1 - (blockHeight * blockWidth) / (stageBox.w * stageBox.h)),
    contentBottomGap: Math.round(stageBox.bottom - gridBox.bottom),
    tipFont: tip ? px(cs(tip).fontSize) : 0,
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

function report(m) {
  const vp = m.viewport;
  const rows = [
    'viewport        ' + vp.w + 'x' + vp.h,
    'question        ' + m.questionFont.toFixed(1) + 'px, ' + m.questionLines + ' line(s), '
      + Math.round(m.questionWidth) + 'px wide (' + Math.round(m.questionWidth / vp.w * 100) + '% of width)',
    'answer          ' + m.answerFont.toFixed(1) + 'px, ' + m.answerLines + ' line(s), '
      + Math.round(m.answerHeight) + 'px tall',
    'answer grid     ' + Math.round(m.gridWidth) + 'px wide ('
      + Math.round(m.gridWidth / vp.w * 100) + '% of width), ' + m.gridColumns + ' cols',
    'stage           ' + Math.round(m.stage.w) + 'x' + Math.round(m.stage.h),
    'empty space     ' + (m.emptyRatio * 100).toFixed(1) + '% of the stage',
    'gap under grid  ' + m.contentBottomGap + 'px',
    'tip             ' + m.tipFont + 'px',
    'body            ' + (m.bodyScrolls ? 'SCROLLS' : 'no scroll') + ', doc ' + m.docHeight + '/' + vp.h
  ];
  rows.forEach(row => console.log(row));
}

(async () => {
  if (process.env.KEEP_OPEN === '1') {
    const { ws, evaluate } = await connect();
    await evaluate('(async () => {' + OPEN + '})()');
    console.log('opened');
    ws.close();
    process.exit(0);
  }
  const { ws, evaluate, settle } = await connect();
  await evaluate('(async () => {' + OPEN + '})()');
  // Hoàn tất animation rồi mới đo: khi app không phải cửa sổ đang chọn,
  // Chromium tạm dừng timeline và .modal còn ở khung đầu (scale 0.92) => px nhỏ.
  await settle();
  const m = await evaluate('(() => {' + MEASURE + '})()');
  if (m.missing) console.log('MISSING ' + JSON.stringify(m));
  else {
    report(m);
    const geo = await evaluate(`(() => {
      const stage = document.querySelector('.game-stage');
      const center = document.querySelector('.stage-center');
      const grid = document.querySelector('.answer-grid');
      const pick = el => el ? { cls: el.className, tag: el.tagName, h: el.getBoundingClientRect().height,
        top: Math.round(el.getBoundingClientRect().top), bottom: Math.round(el.getBoundingClientRect().bottom) } : null;
      const stageR = stage.getBoundingClientRect();
      const parts = Array.from(stage.children).map(pick).filter(Boolean);
      const inner = Array.from(center.children).map(el => {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return { cls: el.className || el.id, h: Math.round(r.height), mb: cs.marginBottom, mt: cs.marginTop,
          minH: cs.minHeight, pad: cs.padding, fb: el.children.length ? Array.from(el.children).map(c => Math.round(c.getBoundingClientRect().height)) : null };
      });

      return { stageBottom: Math.round(stageR.bottom), gridBottom: Math.round(grid.getBoundingClientRect().bottom), parts, inner,
        centerCs: (() => { const c = getComputedStyle(center); return { h: c.height, alignSelf: c.alignSelf, alignContent: c.alignContent, rows: c.gridTemplateRows, flex: c.flex }; })() };
    })()`);
    console.log(JSON.stringify(geo, null, 1));
  }
  await evaluate('(async () => {' + CLOSE + '})()');
  ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
