// tests/smoke/smoke63.js — G6 editor drag-drop: matching reorder, race track preview + theme toggle,
// drop palette onto a track cell, move an existing cell effect, race question reorder, persistence.
// Run with the app open: electron . --remote-debugging-port=9333   then   node tests/smoke/smoke63.js
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const target = (await res.json()).find(x => x.type === 'page' && /index\.html/.test(x.url));
  if (!target) throw new Error('no CDP target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  let seq = 0; const pending = new Map(); const uncaught = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') uncaught.push(m.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evalv = async expression => {
    const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  await send('Runtime.enable');
  // Chờ renderer load xong toàn bộ script (bootstrap.js định nghĩa refreshDb).
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    const probe = await evalv("typeof state !== 'undefined' && typeof render === 'function' && typeof refreshDb === 'function' && typeof editGame === 'function'");
    if (probe === true) { ready = true; break; }
    await sleep(500);
  }
  if (!ready) throw new Error('renderer globals not ready after 60s');
  const results = [];
  const push = (l, p, e = '') => { results.push([l, !!p, String(e)]); };

  const MATCHING = 'SMOKE63 MATCHING';
  const RACE = 'SMOKE63 RACE';

  // Drag helper injected onto window once: dispatches the same DragEvents a real mouse would.
  await evalv(`window.__smoke63 = {
    drag: function (handle, target, where) {
      const dt = new DataTransfer();
      const rect = target.getBoundingClientRect();
      const clientY = where === 'bottom' ? rect.bottom - 1 : rect.top + 1;
      handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: clientY }));
      const highlighted = target.classList.contains('drag-over');
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: clientY }));
      handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      return highlighted;
    },
    values: function (sel, attr) {
      return [].map.call(document.querySelectorAll(sel), function (el) {
        return attr === 'text' ? el.textContent.trim() : el.value;
      });
    }
  };`, true);

  await evalv('typeof window.__smoke63 === "object"', true);

  // ---------- T1: matching editor — kéo-thả đổi thứ tự cặp ----------
  const t1 = await evalv(`(async () => {
    const out = {};
    const g = await window.eduGame.saveGame({
      title: ${JSON.stringify(MATCHING)}, subject: 'Toán', grade: '5', topic: 'Kiểm thử',
      template: 'matching', description: 'Trò chơi tạm cho smoke63.', questions: [],
      matchingGame: { mode: 'columns',
        pairs: [{ id:'p1', left:'A1', right:'B1' }, { id:'p2', left:'A2', right:'B2' }, { id:'p3', left:'A3', right:'B3' }],
        pointsPerPair: 100, completionBonus: 0, wrongPenalty: 0, timeBonus: 0, bonusUnderSeconds: 0, practiceMode: false }
    });
    await refreshDb();
    editGame(JSON.parse(JSON.stringify(g)));
    await new Promise(r => setTimeout(r, 300));
    out.panelVisible = !!document.getElementById('matchingEditor') && !document.getElementById('matchingEditor').classList.contains('hidden');
    out.handleCount = document.querySelectorAll('#matchingPairs [data-pair-drag]').length;
    out.before = window.__smoke63.values('#matchingPairs [data-pair-left]');
    const rows = document.querySelectorAll('#matchingPairs .matching-pair-row');
    out.highlighted = window.__smoke63.drag(rows[0].querySelector('[data-pair-drag]'), rows[2], 'bottom');
    await new Promise(r => setTimeout(r, 60));
    out.after = window.__smoke63.values('#matchingPairs [data-pair-left]');
    out.highlightCleared = document.querySelectorAll('#matchingPairs .drag-over').length === 0;
    // fallback ↑/↓ vẫn chạy (nâng hàng A3 lên)
    document.querySelectorAll('#matchingPairs [data-pair-up]')[1].click();
    await new Promise(r => setTimeout(r, 40));
    out.afterUp = window.__smoke63.values('#matchingPairs [data-pair-left]');
    // lưu để kiểm tra thứ tự được persist
    document.getElementById('saveGameBtn').click();
    const t = Date.now();
    while (state.page !== 'library' && Date.now() - t < 6000) await new Promise(r => setTimeout(r, 100));
    const lib = await window.eduGame.getLibrary();
    const saved = (lib.games || []).find(item => item.title === ${JSON.stringify(MATCHING)});
    out.savedPairs = saved ? saved.matchingGame.pairs.map(p => p.left) : null;
    out.modalClosed = !document.querySelector('#modalRoot .modal');
    return out;
  })()`);
  push('T1 matching panel visible', t1.panelVisible);
  push('T1 drag handle on every pair row (3)', t1.handleCount === 3, t1.handleCount);
  push('T1 dragover highlights drop target', t1.highlighted === true);
  push('T1 drag row1 → bottom of row3 = [A2,A3,A1]', JSON.stringify(t1.after) === JSON.stringify(['A2', 'A3', 'A1']), JSON.stringify(t1.after));
  push('T1 highlight cleared after drop', t1.highlightCleared);
  push('T1 ↑ button still reorders = [A3,A2,A1]', JSON.stringify(t1.afterUp) === JSON.stringify(['A3', 'A2', 'A1']), JSON.stringify(t1.afterUp));
  push('T1 saved order persisted = [A3,A2,A1]', JSON.stringify(t1.savedPairs) === JSON.stringify(['A3', 'A2', 'A1']), JSON.stringify(t1.savedPairs));
  push('T1 modal closed after save', t1.modalClosed === true);

  // ---------- T2: race editor — preview, theme toggle, track length ----------
  const t2 = await evalv(`(async () => {
    const out = {};
    const g = await window.eduGame.saveGame({
      title: ${JSON.stringify(RACE)}, subject: 'Khoa học', grade: '5', topic: 'Kiểm thử',
      template: 'race', description: 'Đường đua tạm cho smoke63.', questions: [],
      race: { trackLength: 12, maxRounds: 6, stepByDifficulty: true, luckEnabled: false,
        teams: [{ id:'t1', name:'Đội A', icon:'🏎️' }, { id:'t2', name:'Đội B', icon:'🚀' }],
        cells: [{ cell: 6, type: 'boost', label: 'Tăng tốc' }],
        questions: [
          { id:'rq1', prompt:'Câu một', options:[{id:'a',text:'A'},{id:'b',text:'B'}], correctOptionId:'a', explanation:'', difficulty:'trung bình' },
          { id:'rq2', prompt:'Câu hai', options:[{id:'a',text:'A'},{id:'b',text:'B'}], correctOptionId:'a', explanation:'', difficulty:'dễ' }
        ] } });
    await refreshDb();
    editGame(JSON.parse(JSON.stringify(g)));
    await new Promise(r => setTimeout(r, 300));
    const host = document.getElementById('raceTrackPreview');
    out.panelVisible = !!document.getElementById('raceEditor') && !document.getElementById('raceEditor').classList.contains('hidden');
    out.previewExists = !!host;
    out.themeDefault = host && host.dataset.previewTheme;
    out.cellCount = document.querySelectorAll('#raceTrackPreview [data-track-cell]').length;
    out.startCell = (document.querySelector('#raceTrackPreview [data-track-num="1"]').textContent || '').indexOf('🚩') >= 0;
    out.startTokens = (document.querySelector('#raceTrackPreview [data-track-num="1"] .race-tokens')?.textContent || '').trim();
    out.finishCell = (document.querySelector('#raceTrackPreview [data-track-num="12"]').textContent || '').indexOf('🏁') >= 0;
    out.boostPreview = document.querySelector('#raceTrackPreview [data-track-num="6"]').classList.contains('race-cell-boost');
    out.paletteCount = document.querySelectorAll('#raceTrackPreview [data-effect-type]').length;
    // đổi tông sang "như lúc chơi"
    document.getElementById('racePreviewTheme').click();
    await new Promise(r => setTimeout(r, 40));
    out.themePlay = host.dataset.previewTheme;
    out.hostBgPlay = getComputedStyle(host).backgroundColor;
    out.cell6BgPlay = getComputedStyle(document.querySelector('#raceTrackPreview [data-track-num="6"]')).backgroundColor;
    out.themeBtnPlay = document.getElementById('racePreviewTheme').textContent.trim();
    // về tông soạn thảo
    document.getElementById('racePreviewTheme').click();
    await new Promise(r => setTimeout(r, 40));
    out.themeBack = host.dataset.previewTheme;
    out.cell6BgEditor = getComputedStyle(document.querySelector('#raceTrackPreview [data-track-num="6"]')).backgroundColor;
    // giảm chiều dài đường đua xuống 5 -> ô 6 thành ngoài khoảng
    const tl = document.getElementById('raceTrackLength');
    tl.value = '5'; tl.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 40));
    out.shortCount = document.querySelectorAll('#raceTrackPreview [data-track-cell]').length;
    out.warnShown = /ngoài đường đua/.test(host.textContent || '');
    return out;
  })()`);
  push('T2 race panel visible', t2.panelVisible);
  push('T2 preview exists with editor theme by default', t2.previewExists && t2.themeDefault === 'editor', t2.themeDefault);
  push('T2 preview renders 12 cells', t2.cellCount === 12, t2.cellCount);
  push('T2 ô 1 có cờ xuất phát + icon 2 đội', t2.startCell === true && t2.startTokens === '🏎️ 🚀', t2.startTokens);
  push('T2 ô cuối có cờ đích', t2.finishCell === true);
  push('T2 ô 6 hiện hiệu ứng tăng tốc', t2.boostPreview === true);
  push('T2 palette có 4 loại hiệu ứng', t2.paletteCount === 4, t2.paletteCount);
  push('T2 nút đổi tông → play', t2.themePlay === 'play', t2.themePlay);
  push('T2 tông play: nền #11152b', t2.hostBgPlay === 'rgb(17, 21, 43)', t2.hostBgPlay);
  push('T2 tông play: ô boost giữ màu tối', t2.cell6BgPlay === 'rgb(23, 50, 42)', t2.cell6BgPlay);
  push('T2 nhãn nút đổi khi ở tông play', /Xem kiểu soạn thảo/.test(t2.themeBtnPlay), t2.themeBtnPlay);
  push('T2 nút đổi lại về tông soạn thảo', t2.themeBack === 'editor', t2.themeBack);
  push('T2 tông editor: ô boost nền sáng', t2.cell6BgEditor === 'rgb(234, 250, 241)', t2.cell6BgEditor);
  push('T2 giảm chiều dài xuống 5 → preview 5 ô', t2.shortCount === 5, t2.shortCount);
  push('T2 cảnh báo hiệu ứng ngoài đường đua', t2.warnShown === true);

  // ---------- T3: drop palette + move cell + trùng ô + ô xuất phát ----------
  const t3 = await evalv(`(async () => {
    const out = {};
    const host = document.getElementById('raceTrackPreview');
    out.rowsBefore = document.querySelectorAll('#raceCells [data-cell-row]').length;
    // drop "May mắn" vào ô 3
    window.__smoke63.drag(host.querySelector('[data-effect-type="lucky"]'), host.querySelector('[data-track-num="3"]'), 'top');
    await new Promise(r => setTimeout(r, 80));
    const luckyRow = [].find.call(document.querySelectorAll('#raceCells [data-cell-row]'), r => r.querySelector('[data-cell-number]').value === '3');
    out.rowAdded = !!luckyRow && luckyRow.querySelector('[data-cell-type]').value === 'lucky';
    out.countAfterAdd = document.querySelectorAll('#raceCells [data-cell-row]').length;
    out.tagAfterAdd = document.getElementById('raceCellCount').textContent;
    out.previewLucky = document.querySelector('#raceTrackPreview [data-track-num="3"]').classList.contains('race-cell-lucky');
    out.luckyDimmed = document.querySelector('#raceTrackPreview [data-track-num="3"]').hasAttribute('data-dimmed');
    out.toastAdd = document.getElementById('toast').textContent;
    // drop tiếp vào ô 3 -> phải bị từ chối
    window.__smoke63.drag(host.querySelector('[data-effect-type="penalty"]'), host.querySelector('[data-track-num="3"]'), 'top');
    await new Promise(r => setTimeout(r, 80));
    out.countAfterDuplicate = document.querySelectorAll('#raceCells [data-cell-row]').length;
    out.toastDuplicate = document.getElementById('toast').textContent;
    // drop vào ô 1 (vạch xuất phát) -> từ chối
    window.__smoke63.drag(host.querySelector('[data-effect-type="penalty"]'), host.querySelector('[data-track-num="1"]'), 'top');
    await new Promise(r => setTimeout(r, 80));
    out.countAfterStart = document.querySelectorAll('#raceCells [data-cell-row]').length;
    out.toastStart = document.getElementById('toast').textContent;
    // kéo row ô 3 (may mắn) sang ô 4
    const row3 = [].find.call(document.querySelectorAll('#raceCells [data-cell-row]'), r => r.querySelector('[data-cell-number]').value === '3');
    window.__smoke63.drag(row3.querySelector('[data-cell-drag]'), host.querySelector('[data-track-num="4"]'), 'top');
    await new Promise(r => setTimeout(r, 80));
    out.movedNumber = row3.querySelector('[data-cell-number]').value;
    out.previewMoved = document.querySelector('#raceTrackPreview [data-track-num="4"]').classList.contains('race-cell-lucky');
    out.previewOldEmpty = !document.querySelector('#raceTrackPreview [data-track-num="3"]').classList.contains('race-cell-lucky');
    // kéo row boost (đang ở ô 6, ngoài khoảng vì trackLength=5) về ô 2
    const boostRow = [].find.call(document.querySelectorAll('#raceCells [data-cell-row]'), r => r.querySelector('[data-cell-number]').value === '6');
    window.__smoke63.drag(boostRow.querySelector('[data-cell-drag]'), host.querySelector('[data-track-num="2"]'), 'top');
    await new Promise(r => setTimeout(r, 80));
    out.boostMoved = boostRow.querySelector('[data-cell-number]').value;
    out.previewBoostAt2 = document.querySelector('#raceTrackPreview [data-track-num="2"]').classList.contains('race-cell-boost');
    out.warnCleared = !/ngoài đường đua/.test(host.textContent || '');
    // kéo câu hỏi: card 1 xuống dưới card 2
    const cards = document.querySelectorAll('#raceQuestions .race-question-card');
    window.__smoke63.drag(cards[0].querySelector('[data-rq-drag]'), cards[1], 'bottom');
    await new Promise(r => setTimeout(r, 80));
    out.questionOrder = window.__smoke63.values('#raceQuestions [data-rq-prompt]');
    out.questionHeads = [].map.call(document.querySelectorAll('#raceQuestions .editor-question-head strong'), el => el.textContent);
    // tông preview giữ nguyên sau các lần re-render
    out.themeAfterEdits = host.dataset.previewTheme;
    return out;
  })()`);
  push('T3 bảng ô đặc biệt bắt đầu với 1 row', t3.rowsBefore === 1, t3.rowsBefore);
  push('T3 drop palette thêm hiệu ứng vào ô 3', t3.rowAdded === true);
  push('T3 số ô tăng 1 (1 → 2)', t3.countAfterAdd === 2 && t3.tagAfterAdd === '2', t3.countAfterAdd + '/' + t3.tagAfterAdd);
  push('T3 preview ô 3 có hiệu ứng may mắn', t3.previewLucky === true);
  push('T3 ô may mắn mờ khi chưa bật may mắn', t3.luckyDimmed === true);
  push('T3 toast xác nhận thêm hiệu ứng', /Đã thêm hiệu ứng/.test(t3.toastAdd), t3.toastAdd);
  push('T3 drop trùng ô bị từ chối (không thêm row)', t3.countAfterDuplicate === 2 && /đã có hiệu ứng/.test(t3.toastDuplicate), t3.toastDuplicate);
  push('T3 drop vào ô xuất phát bị từ chối', t3.countAfterStart === 2 && /vạch xuất phát/.test(t3.toastStart), t3.toastStart);
  push('T3 kéo row ô 3 → ô 4 (đổi số ô)', t3.movedNumber === '4' && t3.previewMoved === true && t3.previewOldEmpty === true, t3.movedNumber);
  push('T3 kéo row boost ô 6 → ô 2', t3.boostMoved === '2' && t3.previewBoostAt2 === true, t3.boostMoved);
  push('T3 cảnh báo ngoài khoảng biến mất sau khi sửa', t3.warnCleared === true);
  push('T3 kéo câu hỏi đảo thứ tự', JSON.stringify(t3.questionOrder) === JSON.stringify(['Câu hai', 'Câu một']), JSON.stringify(t3.questionOrder));
  push('T3 đánh số lại CÂU 1 / CÂU 2', JSON.stringify(t3.questionHeads) === JSON.stringify(['CÂU 1', 'CÂU 2']), JSON.stringify(t3.questionHeads));
  push('T3 tông preview giữ nguyên sau re-render', t3.themeAfterEdits === 'editor', t3.themeAfterEdits);

  // ---------- T4: lưu + đọc lại thư viện ----------
  const t4 = await evalv(`(async () => {
    const out = {};
    document.getElementById('saveGameBtn').click();
    const t = Date.now();
    while (state.page !== 'library' && Date.now() - t < 6000) await new Promise(r => setTimeout(r, 100));
    const lib = await window.eduGame.getLibrary();
    const saved = (lib.games || []).find(item => item.title === ${JSON.stringify(RACE)});
    out.saved = !!saved;
    if (saved) {
      out.trackLength = saved.race.trackLength;
      out.cells = saved.race.cells.map(c => c.cell + ':' + c.type).sort();
      out.questions = saved.race.questions.map(q => q.prompt);
      out.teams = saved.race.teams.length;
    }
    out.modalClosed = !document.querySelector('#modalRoot .modal');
    out.page = state.page;
    return out;
  })()`);
  push('T4 race game saved to library', t4.saved === true);
  push('T4 trackLength = 5 persisted', t4.trackLength === 5, t4.trackLength);
  push('T4 hiệu ứng đã đổi vị trí persisted (2:boost, 4:lucky)', JSON.stringify(t4.cells) === JSON.stringify(['2:boost', '4:lucky']), JSON.stringify(t4.cells));
  push('T4 thứ tự câu hỏi persisted', JSON.stringify(t4.questions) === JSON.stringify(['Câu hai', 'Câu một']), JSON.stringify(t4.questions));
  push('T4 teams preserved (2)', t4.teams === 2, t4.teams);
  push('T4 modal closed + về thư viện', t4.modalClosed === true && t4.page === 'library', t4.page);

  // ---------- T5: regression — editor mở lại được, editor khác không bị ảnh hưởng ----------
  const t5 = await evalv(`(async () => {
    const out = {};
    const g = state.db.games.find(item => item.title === ${JSON.stringify(RACE)});
    editGame(JSON.parse(JSON.stringify(g)));
    await new Promise(r => setTimeout(r, 300));
    const host = document.getElementById('raceTrackPreview');
    out.reopened = !!host && document.querySelectorAll('#raceTrackPreview [data-track-cell]').length === 5;
    out.themeReset = host.dataset.previewTheme;
    out.themeLabel = document.getElementById('racePreviewTheme').textContent.trim();
    out.previewCells = window.__smoke63.values('#raceTrackPreview [data-track-num="5"]');
    out.matchingHidden = document.getElementById('matchingEditor').classList.contains('hidden');
    document.querySelector('#modalRoot [data-close]').click();
    await new Promise(r => setTimeout(r, 100));
    out.closed = !document.querySelector('#modalRoot .modal');
    // để lại tông mặc định cho các smoke khác
    out.uiOk = !!document.getElementById('pageContent');
    return out;
  })()`);
  push('T5 mở lại editor: preview 5 ô', t5.reopened === true);
  push('T5 tông preview mặc định lại = editor', t5.themeReset === 'editor' && /Xem như lúc chơi/.test(t5.themeLabel), t5.themeLabel);
  push('T5 matching panel vẫn ẩn trong editor race', t5.matchingHidden === true);
  push('T5 đóng modal sạch', t5.closed === true);

  // ---------- T6: cleanup ----------
  const t6 = await evalv(`(async () => {
    const lib = await window.eduGame.getLibrary();
    const mine = (lib.games || []).filter(g => /^SMOKE63 /.test(g.title));
    for (const g of mine) await window.eduGame.deleteGame(g.id);
    await refreshDb();
    const after = (await window.eduGame.getLibrary()).games.filter(g => /^SMOKE63 /.test(g.title));
    return { removed: mine.length, remaining: after.length };
  })()`);
  push('T6 cleanup removed both temp games', t6.removed >= 2 && t6.remaining === 0, JSON.stringify(t6));
  push('T6 no uncaught renderer exceptions', uncaught.length === 0, uncaught.join(' | '));

  const pass = results.filter(r => r[1]).length;
  for (const [label, ok, extra] of results) console.log(`${ok ? 'PASS' : 'FAIL'} | ${label}  ${extra || ''}`);
  console.log(`\nSmoke63 (editor drag-drop): ${pass}/${results.length} passed`);
  ws.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
