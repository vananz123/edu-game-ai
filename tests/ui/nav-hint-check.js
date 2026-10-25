// nav-hint-check.js — đo sidebar (nav), nút gợi ý ở màn chơi câu hỏi nhập đáp án,
// và bố cục sidebar compact (cửa sổ hẹp, nav chỉ còn icon).
//
// Chạy trên app đã build, có --remote-debugging-port:
//   npm run build
//   npx electron . --remote-debugging-port=9351
//   node tests/ui/nav-hint-check.js 9351
const { check, connect, results } = require('../manual/lib/ui-check-lib');
const COMPACT = process.env.NAV_COMPACT === '1';

(async () => {
  const { ws, evaluate } = await connect();

  // ---- sidebar / nav ----
  const nav = await evaluate(`(async () => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
    document.querySelector('.nav-item[data-page="home"]')?.click();
    await new Promise(r => setTimeout(r, 400));
    const items = Array.from(document.querySelectorAll('.nav-item'));
    const sidebar = document.querySelector('.sidebar');
    const navEl = document.querySelector('nav.nav');
    const out = { items: items.length, rows: [], sidebar: rect(sidebar), viewport: { w: innerWidth, h: innerHeight } };
    for (const it of items) {
      const r = rect(it);
      const label = it.querySelector('span:not(.nav-icon):not(.nav-count)');
      const icon = it.querySelector('.nav-icon');
      out.rows.push({
        page: it.dataset.page,
        icon: icon ? rect(icon) : null,
        label: label ? { text: label.textContent.trim(), ...rect(label), overflow: label.scrollWidth > label.clientWidth + 1, clipped: label.getBoundingClientRect().right > r.right + 0.5 } : null,
        item: r
      });
    }
    out.navOverflow = navEl.scrollWidth > navEl.clientWidth + 1;
    out.sidebarOverflow = sidebar.scrollWidth > sidebar.clientWidth + 1;
    out.docOverflowX = document.documentElement.scrollWidth > innerWidth + 1;
    return out;
  })()`);

  const labels = nav.rows.filter(r => r.label);
  check('sidebar has every nav item', nav.items >= 7, `${nav.items} items`);
  if (COMPACT) {
    check('window is in compact mode (<700px)', nav.viewport.w < 700 && nav.viewport.w > 450, `${nav.viewport.w}px`);
    check('compact: text labels are hidden', labels.length === 0, `${labels.length} visible labels`);
    check('compact nav rows share one x/width',
      new Set(nav.rows.map(r => Math.round(r.item.x) + 'x' + Math.round(r.item.w))).size <= 1,
      nav.rows.map(r => `${r.page}:${Math.round(r.item.x)}+${Math.round(r.item.w)}`).join(' '));
    check('compact: sidebar is the 64px icon rail', Math.abs(nav.sidebar.w - 64) <= 1, `${Math.round(nav.sidebar.w)}px`);
    check('compact: icon tiles stay inside their row',
      nav.rows.every(r => r.icon && r.icon.x >= r.item.x - 0.5 && r.icon.right <= r.item.right + 0.5),
      nav.rows.map(r => `${r.page}:${r.icon ? Math.round(r.icon.x) : '-'}`).join(' '));
  } else {
    check('nav labels are not clipped by their row',
      labels.every(r => !r.label.clipped), labels.filter(r => r.label.clipped).map(r => r.page).join(',') || 'none');
    check('nav labels are not overflowing horizontally',
      labels.every(r => !r.label.overflow), labels.filter(r => r.label.overflow).map(r => r.page).join(',') || 'none');
    check('all nav items share one x/width (no ragged column)',
      new Set(nav.rows.map(r => Math.round(r.item.x) + 'x' + Math.round(r.item.w))).size <= 1,
      nav.rows.map(r => `${r.page}:${Math.round(r.item.x)}+${Math.round(r.item.w)}`).join(' '));
  }
  check('nav items do not overflow the sidebar',
    nav.rows.every(r => r.item.right <= nav.sidebar.right + 0.5),
    `max right ${Math.round(Math.max(...nav.rows.map(r => r.item.right)))} vs sidebar ${Math.round(nav.sidebar.right)}`);
  check('nav is not a horizontal scroll container', nav.navOverflow === false && nav.sidebarOverflow === false);
  check('page does not scroll horizontally', nav.docOverflowX === false);

  // ---- hint button on a text-answer question ----
  const hint = await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const game = {
      id: 'hint-check-game', title: 'Kiểm tra gợi ý', subject: 'Sinh học', grade: '6', template: 'quiz',
      description: '', tags: [], sourceName: '', createdAt: new Date().toISOString(),
      gameSetup: { scoringMode: 'cơ bản' },
      questions: [
        { id: 'q1', type: 'fill-in-blank', prompt: 'Quá trình cây xanh tạo chất hữu cơ nhờ ánh sáng gọi là ...', options: [], correctOptionId: '', correctAnswer: 'quang hợp', hint: 'Diễn ra ở lục lạp, cần ánh sáng và khí CO2.', explanation: 'Quang hợp.', points: 100 },
        { id: 'q2', type: 'short-answer', prompt: 'Khí nào cây nhả ra khi quang hợp?', options: [], correctOptionId: '', correctAnswer: 'oxy', explanation: 'Oxy.', points: 100 }
      ]
    };
    playGame(game, {});
    await sleep(400);
    const out = {};
    const btn = document.querySelector('[data-answer-hint]');
    out.hasHintBtn = !!btn;
    const box = document.querySelector('#textAnswerHint');
    out.hiddenAtStart = !!box && box.classList.contains('hidden');
    if (btn) btn.click();
    await sleep(150);
    out.shownAfterClick = !!box && !box.classList.contains('hidden') && /Diễn ra ở lục lạp/.test(box.textContent);
    out.disabledAfterClick = !!btn && btn.disabled;
    const input = document.querySelector('#textAnswerInput');
    out.inputStillUsable = !!input && !input.disabled;
    out.overflowX = document.documentElement.scrollWidth > innerWidth + 1;
    if (input) input.value = 'sai roi';
    document.querySelector('#textAnswerBtn').click();
    await sleep(300);
    const fb = document.querySelector('#answerFeedback');
    out.feedbackHint = !!fb && /Gợi ý/.test(fb.textContent) && /Diễn ra ở lục lạp/.test(fb.textContent);
    document.querySelector('#nextQuestionBtn').click();
    await sleep(300);
    out.noHintOnQuestionWithoutIt = !document.querySelector('[data-answer-hint]') && !document.querySelector('#textAnswerHint');
    document.querySelector('[data-play-close]')?.click();
    return out;
  })()`);

  check('text question with hint shows a "Gợi ý" button', hint.hasHintBtn === true);
  check('hint text is hidden until requested', hint.hiddenAtStart === true);
  check('clicking "Gợi ý" reveals the hint text', hint.shownAfterClick === true);
  check('hint button is disabled after use', hint.disabledAfterClick === true);
  check('answer input stays usable after the hint', hint.inputStillUsable === true);
  check('wrong answer feedback repeats the hint', hint.feedbackHint === true);
  check('question without a hint has no hint button', hint.noHintOnQuestionWithoutIt === true);
  check('hint does not make the page scroll horizontally', hint.overflowX === false);

  // ---- compact sidebar (chỉ áp dụng khi cửa sổ hẹp < 700px) ----
  const compact = await evaluate(`(async () => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, w: r.width, right: r.right }; };
    const items = Array.from(document.querySelectorAll('.nav-item'));
    const labelVisible = it => Array.from(it.querySelectorAll('span'))
      .some(s => !s.classList.contains('nav-icon') && !s.classList.contains('nav-count') && s.getClientRects().length > 0 && s.textContent.trim());
    const peak = () => ({ rows: items.map(it => ({ page: it.dataset.page, ...rect(it), icon: rect(it.querySelector('.nav-icon')), labeled: labelVisible(it) })), sidebar: rect(document.querySelector('.sidebar')) });
    // Cửa sổ không thể nhỏ hơn minWidth (1100px), nên bố cục compact được đo bằng cách
    // tạm ép body về đúng bề rộng ngưỡng. Chỉ đo hình học, không đổi CSS.
    const saved = document.body.style.width;
    document.body.style.width = '640px';
    await new Promise(r => setTimeout(r, 250));
    const measured = { viewportWidth: innerWidth, compactMin: matchMedia('(max-width: 699px)').matches, ...peak(), docOverflowX: document.documentElement.scrollWidth > innerWidth + 1 };
    document.body.style.width = saved;
    await new Promise(r => setTimeout(r, 100));
    return measured;
  })()`);

  if (compact.compactMin) {
    check('compact: text labels are hidden', compact.rows.every(r => !r.labeled),
      compact.rows.filter(r => r.labeled).map(r => r.page).join(',') || 'none');
    check('compact nav rows share one x/width',
      new Set(compact.rows.map(r => Math.round(r.x) + 'x' + Math.round(r.w))).size <= 1,
      compact.rows.map(r => `${r.page}:${Math.round(r.x)}+${Math.round(r.w)}`).join(' '));
    check('compact: sidebar is the 64px icon rail', Math.abs(compact.sidebar.w - 64) <= 1, `${Math.round(compact.sidebar.w)}px`);
    check('compact: icon tiles stay inside their row',
      compact.rows.every(r => r.icon.x >= r.x - 0.5 && r.icon.right <= r.right + 0.5));
    check('compact page does not scroll horizontally', compact.docOverflowX === false);
  } else {
    console.log(`\n(skipping compact checks — window is ${compact.viewportWidth}px wide, >= 700px)`);
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
