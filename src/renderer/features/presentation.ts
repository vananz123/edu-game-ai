// @ts-nocheck -- classic renderer script; types live in src/shared/presentation-types.ts.
/* Presentation Mode renderer: read-only mirror of the game session for classroom projection. */
(() => {
let currentState = null;
let lastRenderedRevision = -1;

/** Detect whether this window is running in presentation mode. */
function isPresentationMode() {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).has('presentation');
}

/** Escape HTML to prevent XSS when rendering user-provided text. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function optionClass(option, view) {
  if (!view.revealed) return view.selectedOptionId === option.id ? 'is-selected' : '';
  if (option.id === view.correctOptionId) return 'is-correct';
  if (option.id === view.selectedOptionId) return 'is-wrong';
  return 'is-dim';
}

function optionsHtml(view) {
  if (!Array.isArray(view.options) || view.options.length === 0) return '';
  return `<div class="options">${view.options.map((option, index) => `
    <div class="option ${optionClass(option, view)}">
      <span class="option-letter">${String.fromCharCode(65 + index)}</span>
      <span>${esc(option.text)}</span>
    </div>`).join('')}</div>`;
}

function renderQuizView(view) {
  return `<section class="panel question-panel">
    <div class="meta-row">
      <span class="badge">${esc(view.progressLabel || '')}</span>
      ${view.teamTurn ? `<span class="badge badge-team">👥 ${esc(view.teamTurn)}</span>` : ''}
    </div>
    ${view.context ? `<p class="context">${esc(view.context)}</p>` : ''}
    <h2 class="prompt">${esc(view.prompt)}</h2>
    ${optionsHtml(view)}
    ${view.answerText ? `<p class="answer-text">Câu trả lời: <strong>${esc(view.answerText)}</strong></p>` : ''}
    ${view.revealed && view.correctAnswer ? `<p class="answer-text">Đáp án đúng: <strong>${esc(view.correctAnswer)}</strong></p>` : ''}
    ${view.explanation ? `<p class="explanation">${esc(view.explanation)}</p>` : ''}
  </section>`;
}

function renderMatchingView(view) {
  const matched = new Set(view.matchedIds || []);
  const stats = `<div class="meta-row">
    <span class="badge">Đã ghép ${view.matched}/${view.total}</span>
    <span class="badge badge-warn">Sai ${view.wrong} lần</span>
  </div>`;

  if (view.mode === 'memory') {
    const cards = (view.memoryCards || []).map(card => {
      const shown = card.matched || card.flipped;
      return `<div class="memory-card ${card.matched ? 'is-matched' : ''} ${card.flipped ? 'is-flipped' : ''}">${shown ? esc(card.text) : '?'}</div>`;
    }).join('');
    return `<section class="panel">${stats}
      <h2 class="section-title">Lật thẻ ghi nhớ</h2>
      <div class="memory-grid">${cards}</div>
    </section>`;
  }

  if (view.mode === 'categorize') {
    const groups = (view.categoryGroups || []).map(group => `<div class="category-group">
      <h3>${esc(group.name)}</h3>
      <div class="category-items">${group.items.map(item => `<span class="chip">${esc(item)}</span>`).join('') || '<span class="muted">Chưa có mục nào</span>'}</div>
    </div>`).join('');
    const pool = view.pairs.filter(pair => !matched.has(pair.id)).map(pair => `<span class="chip">${esc(pair.right)}</span>`).join('');
    return `<section class="panel">${stats}
      <h2 class="section-title">Phân loại kiến thức</h2>
      <div class="category-pool">${pool || '<span class="muted">Đã xếp hết các mục</span>'}</div>
      <div class="category-grid">${groups}</div>
    </section>`;
  }

  const left = view.pairs.map(pair => `<div class="match-card ${matched.has(pair.id) ? 'is-matched' : ''} ${view.selectedPairId === pair.id ? 'is-selected' : ''}">${esc(pair.left)}</div>`).join('');
  const right = view.pairs.map(pair => `<div class="match-card ${matched.has(pair.id) ? 'is-matched' : ''} ${view.selectedPairId === pair.id ? 'is-selected' : ''}">${esc(pair.right)}</div>`).join('');
  return `<section class="panel">${stats}
    <h2 class="section-title">Ghép hai cột</h2>
    <div class="match-grid"><div class="match-col">${left}</div><div class="match-col">${right}</div></div>
  </section>`;
}

function renderTreasureMission(view) {
  const mission = view.mission;
  if (!mission) return '';
  if (mission.type === 'question') return optionsHtml(view);
  if (mission.type === 'matching') {
    const matched = new Set(mission.matchedIds || []);
    const left = (mission.pairs || []).map(pair => `<div class="match-card ${matched.has(pair.id) ? 'is-matched' : ''}">${esc(pair.left)}</div>`).join('');
    const right = (mission.pairs || []).map(pair => `<div class="match-card ${matched.has(pair.id) ? 'is-matched' : ''}">${esc(pair.right)}</div>`).join('');
    return `<div class="mission-instruction">${esc(mission.instruction || 'Ghép các cặp tương ứng.')}</div>
      <div class="match-grid"><div class="match-col">${left}</div><div class="match-col">${right}</div></div>`;
  }
  if (mission.type === 'classification') {
    const assigned = new Map((mission.items || []).filter(item => item.groupId).map(item => [item.id, item]));
    const groups = (mission.groups || []).map(group => {
      const items = (mission.items || []).filter(item => item.groupId === group.id);
      return `<div class="category-group"><h3>${esc(group.name)}</h3><div class="category-items">${items.map(item => `<span class="chip">${esc(item.text)}</span>`).join('') || '<span class="muted">Chưa có mục nào</span>'}</div></div>`;
    }).join('');
    const pool = (mission.items || []).filter(item => !assigned.has(item.id)).map(item => `<span class="chip">${esc(item.text)}</span>`).join('');
    return `<div class="mission-instruction">${esc(mission.instruction || 'Phân loại các mục vào nhóm phù hợp.')}</div>
      <div class="category-pool">${pool || '<span class="muted">Đã xếp hết các mục</span>'}</div>
      <div class="category-grid">${groups}</div>`;
  }
  if (mission.type === 'decode') {
    return `<div class="mission-instruction">${esc(mission.instruction || 'Giải mã mật mã sau.')}</div>
      <div class="decode-box">${esc(mission.cipher || '')}</div>`;
  }
  return '';
}

function renderTreasureView(view) {
  const stages = (view.stages || []).map(stage => `<span class="stage-chip is-${esc(stage.status)}">${stage.status === 'done' ? '✓' : stage.status === 'failed' ? '✕' : ''} ${esc(stage.name)}</span>`).join('');
  const mission = renderTreasureMission(view);
  return `<section class="panel">
    <div class="meta-row">
      <span class="badge">${esc(view.character || 'Nhà thám hiểm')}</span>
      <span class="badge">Chặng ${(view.stages || []).findIndex(s => s.id === view.currentStageId) + 1}/${view.totalStages || 0}</span>
      <span class="badge badge-warn">🏆 ${view.earned || 0} điểm</span>
      ${view.itemsFound ? `<span class="badge">🎁 ${view.itemsFound} vật phẩm</span>` : ''}
    </div>
    <div class="stage-track">${stages}</div>
    <h2 class="section-title">${esc(view.stageName || 'Hành trình')}</h2>
    ${view.story ? `<p class="context">${esc(view.story)}</p>` : ''}
    ${view.taskDescription ? `<p class="context">${esc(view.taskDescription)}</p>` : ''}
    <h3 class="prompt prompt-small">${esc(view.prompt || '')}</h3>
    ${mission}
    ${view.explanation ? `<p class="explanation">${esc(view.explanation)}</p>` : ''}
  </section>`;
}

function renderRaceView(view) {
  const sorted = view.teams.slice().sort((a, b) => b.progress - a.progress || b.points - a.points);
  const track = Array.from({ length: view.trackLength }, (_, index) => {
    const cell = index + 1;
    const tokens = view.teams.filter(team => team.progress === cell).map(team => team.icon || '●').join(' ');
    return `<div class="race-cell ${tokens ? 'is-occupied' : ''}"><span>${cell}</span><strong>${tokens}</strong></div>`;
  }).join('');
  const scoreboard = sorted.map(team => `<div class="score-row ${team.active ? 'is-active' : ''}">
    <span>${esc(team.icon)} <strong>${esc(team.name)}</strong></span>
    <span>Ô ${team.progress}/${view.trackLength}</span>
    <span>🏆 ${team.points}</span>
  </div>`).join('');
  return `<section class="panel">
    <div class="meta-row">
      <span class="badge">Vòng ${view.round}/${view.maxRounds}</span>
      <span class="badge badge-team">${esc(view.currentTeamIcon)} ${esc(view.currentTeamName)}</span>
    </div>
    <div class="race-track">${track}</div>
    <div class="scoreboard">${scoreboard}</div>
    ${view.prompt ? `<h2 class="prompt prompt-small">${esc(view.prompt)}</h2>${optionsHtml(view)}` : ''}
    ${view.lastEvent ? `<p class="explanation">${esc(view.lastEvent)}</p>` : ''}
  </section>`;
}

function renderResultsView(view) {
  const rows = (view.rows || []).map(row => `<div class="result-row ${row.highlight ? 'is-highlight' : ''}"><span>${esc(row.label)}</span><strong>${esc(row.value)}</strong></div>`).join('');
  return `<section class="panel results-panel">
    <div class="result-medal">${view.medal || '🏆'}</div>
    <h2 class="result-title">${esc(view.title)}</h2>
    <p class="context">${esc(view.subtitle || '')}</p>
    <div class="result-score">${esc(view.scoreText || '')}</div>
    <div class="result-rows">${rows}</div>
    <p class="explanation">${esc(view.message || '')}</p>
  </section>`;
}

function renderFallback(state) {
  const answers = (state.gameAnswers || []).slice(-5);
  return `<section class="panel">
    <h2 class="section-title">Đang chờ trạng thái trò chơi…</h2>
    <p class="context">${answers.length ? answers.map((answer, index) => `Câu ${index + 1}: ${esc(answer)}`).join('<br>') : 'Màn hình chính đang chuẩn bị nội dung.'}</p>
  </section>`;
}

/** Render the game question/answer view for presentation. */
function renderPresentation(state) {
  const view = state.view;
  let body = '';
  if (view && view.kind === 'quiz') body = renderQuizView(view);
  else if (view && view.kind === 'matching') body = renderMatchingView(view);
  else if (view && view.kind === 'treasure') body = renderTreasureView(view);
  else if (view && view.kind === 'race') body = renderRaceView(view);
  else if (view && view.kind === 'results') body = renderResultsView(view);
  else body = renderFallback(state);

  const timer = state.timer !== undefined ? `<span class="badge">⏱ ${state.timer}s</span>` : '';
  document.body.innerHTML = `
    <div class="presentation-root" data-player-theme="teen">
      <header class="presentation-header">
        <h1>${esc(state.gameTitle || 'EduGame Studio')}</h1>
        <div class="header-meta">${timer}<span class="badge badge-template">${esc(state.template || 'quiz')}</span></div>
      </header>
      <main class="presentation-body">${body}</main>
      <footer class="presentation-footer">
        <span class="footer-note">Màn hình chính điều khiển trò chơi</span>
        <button id="presentationExitBtn" class="presentation-exit-btn">Thoát trình chiếu (Esc)</button>
      </footer>
    </div>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; background: #0b1120; }
      .presentation-root {
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        /* Sàn kế thừa: mọi phần tử chưa khai báo cỡ chữ nhận 20px, không phải
           14px của body app.css (đo được 18.4px ở .explanation trước khi có
           dòng này). */
        font-size: 20px;
        line-height: 1.4;
        background: radial-gradient(circle at 50% 0%, #1e293b 0%, #0b1120 55%);
        color: #e2e8f0;
        min-height: 100vh;
        height: 100vh;
        overflow: hidden;
        padding: clamp(20px, 3vw, 44px) clamp(24px, 4vw, 64px);
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .presentation-header { display: flex; justify-content: space-between; align-items: center; gap: 18px; border-bottom: 2px solid #263247; padding-bottom: 16px; }
      .presentation-header h1 { margin: 0; font-size: clamp(28px, 2.6vw, 40px); color: #f8fafc; line-height: 1.3; flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
      .header-meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: flex-end; flex: 0 1 auto; min-width: 0; }
      .badge { display: inline-flex; align-items: center; gap: 5px; background: #1e293b; border: 1px solid #334155; color: #cbd5e1; padding: 7px 14px; border-radius: 999px; font-size: 20px; font-weight: 600; white-space: nowrap; }
      .badge-template { background: #1d4ed8; border-color: #3b82f6; color: #fff; }
      .badge-team { background: #4338ca; border-color: #6366f1; color: #e0e7ff; }
      .badge-warn { color: #fde68a; }
      .presentation-body { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; overflow: auto; }
      /* margin:auto căn giữa theo cả hai chiều mà vẫn cho phép cuộn khi nội
         dung cao hơn khung — align-items:center một mình cắt mất phần đầu. */
      .panel { width: 100%; max-width: 1400px; margin: auto;
        background: rgba(23, 32, 51, 0.92); border: 1px solid #2b3950; border-radius: 22px;
        padding: clamp(20px, 2.4vw, 36px); box-shadow: 0 30px 90px rgba(0, 0, 0, 0.35); }
      .meta-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
      .context { font-size: clamp(22px, 1.5vw, 28px); line-height: 1.45; color: #cbd5e1; margin: 0 0 16px; }
      .prompt { font-size: clamp(28px, 3.4vw, 52px); line-height: 1.35; color: #f8fafc; margin: 8px 0 24px; font-weight: 750; }
      .prompt-small { font-size: clamp(24px, 2.2vw, 34px); margin-bottom: 16px; }
      .section-title { font-size: clamp(24px, 2.4vw, 38px); line-height: 1.3; margin: 0 0 16px; color: #f8fafc; }
      .options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .option { display: flex; align-items: center; gap: 14px; background: #1e293b; border: 2px solid #334155; border-radius: 14px; padding: clamp(13px, 1.4vw, 20px); font-size: clamp(22px, 2vw, 29px); line-height: 1.35; color: #e2e8f0; }
      .option-letter { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; min-width: 44px; border-radius: 50%; background: #0f172a; border: 1px solid #475569; font-size: 20px; font-weight: 800; color: #93c5fd; }
      .option.is-selected { border-color: #3b82f6; background: #172554; }
      .option.is-correct { border-color: #22c55e; background: #052e1b; }
      .option.is-correct .option-letter { background: #166534; color: #dcfce7; }
      .option.is-wrong { border-color: #ef4444; background: #3b0d15; }
      .option.is-dim { opacity: 0.55; }
      .answer-text, .explanation { font-size: clamp(15px, 1.35vw, 20px); line-height: 1.45; color: #cbd5e1; margin: 14px 0 0; max-width: 1100px; }
      .explanation { border-left: 4px solid #3b82f6; padding-left: 14px; font-size: 20px; line-height: 1.4; }
      .match-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
      .match-col { display: flex; flex-direction: column; gap: 10px; }
      .match-card { background: #1e293b; border: 2px solid #334155; border-radius: 12px; padding: 14px 18px; font-size: clamp(20px, 1.7vw, 25px); line-height: 1.35; }
      .match-card.is-selected { border-color: #3b82f6; background: #172554; }
      .match-card.is-matched { border-color: #22c55e; background: #052e1b; color: #bbf7d0; }
      .memory-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
      .memory-card { display: flex; align-items: center; justify-content: center; min-height: 96px; border-radius: 12px; border: 2px solid #334155; background: #1e293b; font-size: clamp(20px, 1.4vw, 24px); text-align: center; padding: 10px; color: #cbd5e1; }
      .memory-card.is-flipped, .memory-card.is-matched { border-color: #3b82f6; background: #172554; }
      .memory-card.is-matched { border-color: #22c55e; background: #052e1b; }
      .category-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
      .category-group { background: #111c2f; border: 1px solid #2b3950; border-radius: 12px; padding: 14px; min-height: 100px; }
      .category-group h3 { margin: 0 0 10px; color: #93c5fd; font-size: clamp(20px, 1.4vw, 24px); }
      .category-items { display: flex; flex-direction: column; gap: 8px; }
      .category-pool { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; min-height: 42px; }
      .chip { display: inline-block; background: #1e293b; border: 1px solid #334155; border-radius: 9px; padding: 8px 12px; font-size: clamp(20px, 1.2vw, 22px); }
      .stage-track { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
      .stage-chip { border: 1px solid #334155; background: #111c2f; border-radius: 999px; padding: 7px 13px; font-size: clamp(20px, 1.1vw, 22px); color: #94a3b8; }
      .stage-chip.is-done { border-color: #22c55e; color: #bbf7d0; background: #052e1b; }
      .stage-chip.is-current { border-color: #3b82f6; color: #dbeafe; background: #172554; }
      .stage-chip.is-failed { border-color: #f59e0b; color: #fde68a; background: #3b2607; }
      .mission-instruction { font-size: clamp(20px, 1.3vw, 24px); color: #cbd5e1; margin-bottom: 12px; }
      .decode-box { font-family: "Cascadia Code", Consolas, monospace; font-size: clamp(24px, 3vw, 46px); letter-spacing: 0.18em; text-align: center; padding: 24px; border-radius: 14px; border: 1px dashed #64748b; background: #0f172a; color: #fbbf24; }
      .race-track { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
      /* Ô đường đua: 12px cũ là cỡ chữ nhỏ nhất trên màn hình trình chiếu và
         không đọc được từ cuối lớp. Ô to hơn để chứa được chữ 20px. */
      .race-cell { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 0 1 auto; width: clamp(48px, 4.2vw, 72px); min-height: clamp(48px, 6vh, 72px); border-radius: 9px; border: 1px solid #334155; background: #111c2f; font-size: 20px; color: #94a3b8; }
      .race-cell.is-occupied { border-color: #3b82f6; background: #172554; color: #dbeafe; }
      .race-cell strong { font-size: 22px; line-height: 1.2; }
      .scoreboard { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
      .score-row { display: grid; grid-template-columns: 1fr auto auto; gap: 16px; padding: 11px 14px; border-radius: 10px; background: #111c2f; border: 1px solid #263247; font-size: clamp(20px, 1.3vw, 24px); }
      .score-row.is-active { border-color: #6366f1; background: #1e1b4b; }
      .results-panel { text-align: center; }
      .result-medal { font-size: clamp(52px, 7vw, 96px); line-height: 1.25; overflow: visible; padding: 0.1em 0; }
      .result-title { font-size: clamp(30px, 3.2vw, 50px); line-height: 1.3; margin: 12px 0 8px; color: #f8fafc; }
      .result-score { font-size: clamp(26px, 3vw, 44px); font-weight: 800; color: #22c55e; margin: 12px 0 20px; }
      .result-rows { display: flex; flex-direction: column; gap: 8px; max-width: 800px; margin: 0 auto 18px; text-align: left; }
      .result-row { display: flex; justify-content: space-between; gap: 18px; padding: 11px 14px; border-radius: 10px; background: #111c2f; border: 1px solid #263247; font-size: clamp(20px, 1.3vw, 24px); }
      .result-row.is-highlight { border-color: #22c55e; color: #bbf7d0; }
      .muted { color: #94a3b8; font-size: 20px; }
      .presentation-footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-top: 2px solid #263247; padding-top: 14px; }
      .footer-note { color: #94a3b8; font-size: 20px; }
      .presentation-exit-btn { background: #ef4444; color: #fff; border: none; padding: 11px 20px; border-radius: 9px; font-size: 20px; font-weight: 700; cursor: pointer; }
      .presentation-exit-btn:hover { background: #dc2626; }
      /* Thanh bên: 2 cột đáp án ở mọi cỡ đủ rộng. Trước đây 1366px bị đẩy về
         1 cột, làm 4 đáp án cao gấp đôi và tràn khỏi màn hình 768px. Chỉ xếp
         1 cột khi thật hẹp (<1000px) — máy chiếu/laptop đều không thuộc nhóm đó. */
      @media (max-width: 1000px) {
        .options, .match-grid { grid-template-columns: 1fr; }
        .presentation-header { align-items: flex-start; flex-direction: column; }
      }
      /* Cửa sổ thấp (laptop 1366x768): đo được 871px nội dung trong 768px khung
         → trang cuộn và 4 phần tử trượt khỏi khung. Giảm đệm + khoảng cách
         trước, KHÔNG hạ cỡ chữ (sàn 20px ở trên là bất biến). */
      @media (max-height: 800px) {
        .presentation-root { padding: clamp(10px, 1.6vh, 20px) clamp(16px, 3vw, 40px); gap: 8px; }
        .presentation-header { padding-bottom: 8px; }
        .panel { padding: clamp(12px, 2vw, 22px); border-radius: 14px; }
        .prompt { margin: 4px 0 10px; line-height: 1.3; }
        .meta-row, .category-pool { margin-bottom: 8px; }
        .option { padding: 8px 14px; }
        .option-letter { width: 34px; height: 34px; min-width: 34px; font-size: 20px; }
        .race-cell { width: 52px; min-height: 52px; }
        .result-medal { font-size: clamp(40px, 5vh, 64px); }
        .result-title { margin: 6px 0 4px; }
        .result-score { margin: 6px 0 10px; }
        .result-rows, .scoreboard, .race-track, .stage-track { margin-bottom: 10px; }
        .result-row, .score-row { padding: 8px 12px; }
        .explanation { margin: 6px 0 0; }
        /* Đường đua 12 ô + 3 dòng điểm + câu hỏi 4 đáp án không vừa 768px.
           Ô thu nhỏ và bỏ số dòng điểm thừa để phần nội dung chính (câu hỏi +
           đáp án) vẫn hiện đủ; cỡ chữ giữ nguyên sàn 20px. */
        .race-track { gap: 3px; }
        .scoreboard { gap: 4px; }
        .panel { padding: 16px 20px; }
        /* 3 dòng điểm ở 1366x768 chiếm ~190px, đẩy hàng đáp án C/D ra ngoài
           khung. Dòng điểm thu lại một hàng (tên + ô + điểm cùng dòng) để phần
           câu hỏi + đáp án — thứ học sinh phải đọc — luôn hiện đủ. */
        .score-row { grid-template-columns: minmax(0, 1fr) auto auto; padding: 4px 12px; gap: 12px; }
      }
    </style>
  `;

  const exitBtn = document.getElementById('presentationExitBtn');
  if (exitBtn) {
    exitBtn.onclick = () => {
      const eduGame = window.eduGame;
      if (eduGame && typeof eduGame.sendPresentationExit === 'function') {
        eduGame.sendPresentationExit({ sessionId: state.sessionId });
      }
    };
  }
}

/** Sync state from IPC and re-render if newer. */
function syncState(state) {
  if (!state || state.revision <= lastRenderedRevision) return;
  currentState = state;
  lastRenderedRevision = state.revision;
  renderPresentation(state);
}

/** Close presentation and notify main process. */
function closePresentation() {
  const eduGame = window.eduGame;
  if (eduGame && typeof eduGame.sendPresentationExit === 'function') {
    eduGame.sendPresentationExit({ sessionId: currentState?.sessionId ?? '' });
  }
  window.close();
}

/** Initialize presentation mode. */
function initPresentation() {
  if (!isPresentationMode()) return;

  const eduGame = window.eduGame;
  if (!eduGame) {
    console.error('eduGame API not available in presentation window.');
    return;
  }

  eduGame.onPresentationState?.((state) => {
    syncState(state);
  });

  eduGame.onPresentationExit?.(() => {
    closePresentation();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePresentation();
    }
  });

  if (typeof eduGame.requestPresentationState === 'function') {
    eduGame.requestPresentationState();
  }
}

initPresentation();
})();
