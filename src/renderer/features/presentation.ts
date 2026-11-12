// @ts-nocheck -- classic renderer script; types live in src/shared/presentation-types.ts.
/* Presentation Mode renderer: read-only mirror of the game session for classroom projection. */
(() => {
let currentState = null;
let lastRenderedRevision = -1;

/** Detect whether this window is running in presentation mode. */
function isPresentationMode() {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).has('presentation') || location.pathname.includes('presentation.html');
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

/**
 * Constellation board (DECISIONS #168, renamed in #171): the static sky, drawn
 * as SVG from the view's own star/link data.
 *
 * The presentation window loads no Three.js and no renderer scripts, so this
 * function must not call `constellationSvg` — it is a small, self-contained
 * drawer over at most ten stars. It shows the SAME two facts the teacher window
 * shows: which stars are lit, and which destination side each star carries (the
 * second screen is what the class reads, so it never prints a stage caption
 * instead of the lesson text).
 */
function renderConnectionView(view) {
    const nodes = {};
    // Declared before the nodes are drawn: a caption needs to know where the
    // bottom of the picture is, or the second line of a pair is cropped.
    const box = view.viewBox || { width: 1000, height: 620 };
    (view.nodes || []).forEach(node => { nodes[node.id] = node; });
    const edgeSvg = (view.edges || []).map(edge => {
        const from = nodes[edge.from];
        const to = nodes[edge.to];
        if (!from || !to) return '';
        const bend = Number(edge.bend) || 0;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.sqrt(dx * dx + dy * dy) || 1;
        const cx = (from.x + to.x) / 2 + (-dy / length) * bend;
        const cy = (from.y + to.y) / 2 + (dx / length) * bend;
        const d = bend ? `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}` : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
        return edge.connected
            ? `<path class="conn-edge" d="${d}" />`
            : `<path class="conn-slot" d="${d}" />`;
    }).join('');
    const nodeSvg = (view.nodes || []).map(node => {
        // Every star of the board is drawn: a light sky is not an empty sky. A
        // lit star is bright and captioned; a star still to come is faint, which
        // is the same cue the 3D board gives.
        const lit = node.visible;
        const group = lit ? 'conn-node is-lit' : 'conn-node is-dim';
        const label = String(node.label || '');
        // Long lesson text is clamped here so it can never push the picture off
        // the shared screen; the teacher window carries the full text.
        const caption = label.length > 60 ? `${label.slice(0, 57)}…` : label;
        // #178: the half the class dropped, on its own line — the projector has no
        // HTML card either. Two lines need two lanes, so a star close to the edge
        // of the picture puts them ABOVE itself instead of losing one to the crop.
        // The lanes sit 32 px apart because the caption is 26 px tall; anything
        // tighter and the two halves overlap into unreadable ink.
        const answer = lit ? String(node.answerText || '') : '';
        const answerCaption = answer.length > 60 ? `${answer.slice(0, 57)}…` : answer;
        const laneGap = 32;
        const reach = 34 + (answerCaption ? laneGap + 12 : 0);
        const below = node.y + reach < box.height - 10;
        const lineOne = below ? node.y + 34 : node.y - 30;
        const lineTwo = below ? node.y + 34 + laneGap : node.y - 30 - laneGap;
        return `<g class="${group}">
          <circle class="conn-star-halo" cx="${node.x}" cy="${node.y}" r="${lit ? 26 : 18}" />
          <circle class="conn-star" cx="${node.x}" cy="${node.y}" r="${lit ? 13 : 9}" />
          ${caption ? `<text x="${node.x}" y="${lineOne}">${esc(caption)}</text>` : ''}
          ${answerCaption ? `<text class="conn-answer" x="${node.x}" y="${lineTwo}">${esc(answerCaption)}</text>` : ''}
        </g>`;
    }).join('');
    return `<section class="panel connection-panel-presentation">
    <div class="meta-row">
      <span class="badge badge-template">🌌 ${view.connected}/${view.total} sao sáng</span>
      <span class="badge">${esc(view.templateName || '')}</span>
      ${view.completed ? '<span class="badge badge-success">Đã hoàn thiện</span>' : ''}
    </div>
    <svg class="conn-svg" viewBox="0 0 ${box.width} ${box.height}" role="img" aria-label="${esc(view.templateName || '')}" preserveAspectRatio="xMidYMid meet">${edgeSvg}${nodeSvg}</svg>
    ${(view.doneLabels || []).length ? `<p class="context conn-done">Đã ghép: ${esc(view.doneLabels.join(' · '))}</p>` : ''}
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
  else if (view && (view.kind === 'constellation' || view.kind === 'connection')) body = renderConnectionView(view);
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
  `;

  const exitBtn = document.getElementById('presentationExitBtn');
  if (exitBtn) {
    exitBtn.onclick = () => {
      sendPresentationExit({ sessionId: state.sessionId });
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

/**
 * `sendPresentationExit` là kênh GỬI (không chờ kết quả). Cửa sổ trình chiếu chỉ
 * dùng được khi vỏ có kênh đó; `not-supported` (Tauri giai đoạn 2 chưa có
 * `send_channel`) chỉ có nghĩa là không ai nhận tin — cửa sổ vẫn đóng bình thường.
 */
function sendPresentationExit(payload) {
  desktop.call('sendPresentationExit', payload).catch((error) => {
    if (error && error.code === 'not-supported') return;
    console.error('Không gửi được yêu cầu thoát trình chiếu', error);
  });
}

/** Close presentation and notify main process. */
function closePresentation() {
  sendPresentationExit({ sessionId: currentState?.sessionId ?? '' });
  window.close();
}

/** Initialize presentation mode. */
function initPresentation() {
  if (!isPresentationMode()) return;

  const chosen = desktopCoreChooseAdapter(window);
  if (!chosen) {
    console.error('Không có cầu desktop trong cửa sổ trình chiếu.');
    return;
  }
  desktop.attach(chosen.adapter);

  desktop.listen('onPresentationState', (state) => {
    syncState(state);
  });

  // Vỏ chưa nối kênh `presentation:exit` (ví dụ Tauri giai đoạn 2): tin "thoát"
  // sẽ không bao giờ tới, nhưng Esc trong chính cửa sổ này vẫn phải chạy.
  try {
    desktop.listen('onPresentationExit', () => {
      closePresentation();
    });
  } catch (error) {
    console.error('Cửa sổ trình chiếu chưa nhận được sự kiện thoát', error);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePresentation();
    }
  });

  desktop.call('requestPresentationState').catch((error) => {
    if (error && error.code === 'not-supported') return;
    console.error('Không xin được trạng thái trình chiếu', error);
  });
}

initPresentation();
})();
