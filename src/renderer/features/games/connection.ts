// @ts-nocheck -- Object Connection play surface + template gallery (DECISIONS #168).
// One renderer for every template: the picture is template DATA
// (`renderer/shared/connection-data.ts`), the progress is pure logic
// (`renderer/connection-core.ts`), and this file only turns those two into DOM.
// Scoring stays in game-engine/runtime.ts; the 3D layer only decorates.
//
// The mode sits beside "Cổ điển" and "Xây nhà" on Đấu trường kiến thức, so
// classic and house play are untouched (DECISIONS #168).
/**
 * True when the matching game on screen plays Object Connection (DECISIONS #168).
 * The style lives on `matchingGame.mode`, beside columns / memory / categorize,
 * so every other template and every other matching style is untouched.
 */
function isConnectionBoard(game) {
    const g = game || state.currentGame;
    return Boolean(g && g.template === 'matching' && g.matchingGame && g.matchingGame.mode === 'connection');
}
/** Resolved template for the game on screen (never null; unknown ids fall back). */
function connectionTemplateFor(game) {
    const g = game || state.currentGame;
    return connectionResolveTemplate(g && g.matchingGame ? g.matchingGame.connectionTemplate : null);
}
/**
 * The pair → stage plan for this playing. The matching board knows its pair
 * count, so the plan is built from that — no placeholder ids and no dependency
 * on pair order (the right column is shuffled on every board).
 */
function connectionPlan(game) {
    const g = game || state.currentGame;
    const pairs = g && g.matchingGame && Array.isArray(g.matchingGame.pairs) ? g.matchingGame.pairs.length : 0;
    return planConnectionStages(connectionTemplateFor(g), pairs);
}
/** Escape for SVG text; template labels are constants, but never interpolate raw. */
function connectionEsc(value) {
    return escapeHtml(String(value === undefined || value === null ? '' : value));
}
/**
 * Draws a template as an SVG.
 *
 * `progress === null` renders the finished picture (gallery thumbnail); a
 * progress object renders only the earned stages, so the same function serves
 * the setup gallery, the play panel and the projector.
 */
function connectionSvg(template, progress, options = {}) {
    const viewBox = options.viewBox || CONNECTION_VIEWBOX;
    const connectedStageIds = progress && Array.isArray(progress.connectedStageIds) ? progress.connectedStageIds : null;
    const earned = connectedStageIds ? new Set(connectedStageIds) : null;
    const edgeOn = edgeId => !earned || template.stages.some(stage => earned.has(stage.id) && stage.edgeIds.indexOf(edgeId) !== -1);
    const nodeOn = nodeId => !earned || template.stages.some(stage => earned.has(stage.id) && stage.nodeIds.indexOf(nodeId) !== -1);
    const nodeById = {};
    template.nodes.forEach(node => { nodeById[node.id] = node; });
    const edgeSvg = template.edges.map(edge => {
        const from = nodeById[edge.from];
        const to = nodeById[edge.to];
        if (!from || !to) return '';
        const bend = Number(edge.bend) || 0;
        // A bent link bows perpendicular to the straight line, so links that
        // share an endpoint stay readable.
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.sqrt(dx * dx + dy * dy) || 1;
        const cx = mx + (-dy / length) * bend;
        const cy = my + (dx / length) * bend;
        const path = bend ? `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}` : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
        return edgeOn(edge.id)
            ? `<path class="connection-edge${options.animate ? ' is-new' : ''}" d="${path}" data-edge="${connectionEsc(edge.id)}" />`
            : `<path class="connection-edge-slot" d="${path}" data-edge-slot="${connectionEsc(edge.id)}" />`;
    }).join('');
    const nodeSvg = template.nodes.map(node => {
        const on = nodeOn(node.id);
        const shape = node.kind === 'plate'
            ? `<rect x="${node.x - 62}" y="${node.y - 22}" width="124" height="44" rx="12" />`
            : node.kind === 'ring'
                ? `<circle cx="${node.x}" cy="${node.y}" r="20" />`
                : `<circle cx="${node.x}" cy="${node.y}" r="12" />`;
        // A dot's caption would give away where the picture goes before the
        // player earns it, so hidden dots lose it; plates and rings keep theirs.
        const label = on || node.kind !== 'dot'
            ? `<text x="${node.x}" y="${node.y + (node.kind === 'plate' ? 5 : 34)}">${connectionEsc(node.label)}</text>`
            : '';
        return `<g class="connection-node${on ? '' : ' is-hidden'}" data-node="${connectionEsc(node.id)}">${shape}${label}</g>`;
    }).join('');
    return `<svg class="connection-svg" viewBox="0 0 ${viewBox.width} ${viewBox.height}" role="img" aria-label="${connectionEsc(template.name)}" preserveAspectRatio="xMidYMid meet">
      <g class="connection-links">${edgeSvg}</g>
      <g class="connection-nodes">${nodeSvg}</g>
    </svg>`;
}
function connectionThumbnail(template) {
    return `<div class="connection-thumb" aria-hidden="true">${connectionSvg(template, null)}</div>`;
}
/**
 * Template gallery for wizard step 4 and the editor. A radio group, so the value
 * is read by `readConnectionGallery` on save instead of being a form field.
 */
function connectionGalleryHtml(selectedId, name) {
    const selected = connectionResolveTemplate(selectedId).id;
    const field = name || 'connectionTemplate';
    return `<div class="connection-gallery" data-connection-gallery="${connectionEsc(field)}">${CONNECTION_TEMPLATES.map(template => `<label class="connection-card${template.id === selected ? ' is-selected' : ''}" data-connection-template="${connectionEsc(template.id)}">
        <input type="radio" name="${connectionEsc(field)}" value="${connectionEsc(template.id)}" ${template.id === selected ? 'checked' : ''}>
        ${connectionThumbnail(template)}
        <span class="connection-card-body">
          <strong>${connectionEsc(template.name)}</strong>
          <span class="connection-card-desc">${connectionEsc(template.description)}</span>
          <span class="connection-card-meta">${template.stages.length} chặng${template.subjectHint ? ` · ${connectionEsc(template.subjectHint)}` : ''}</span>
        </span>
      </label>`).join('')}</div>`;
}
/** Larger preview above the gallery so a teacher sees the picture, not a stamp. */
function connectionPreviewHtml(selectedId) {
    const template = connectionResolveTemplate(selectedId);
    return `<div class="connection-preview" data-connection-preview>
      <div class="connection-preview-art">${connectionSvg(template, null)}</div>
      <div class="connection-preview-copy">
        <strong>${connectionEsc(template.name)}</strong>
        <span>${connectionEsc(template.description)}</span>
        <span class="connection-preview-steps">${template.stages.map(stage => connectionEsc(stage.label)).join(' → ')}</span>
      </div>
    </div>`;
}
/**
 * The play-surface picture (DECISIONS #169).
 *
 * 3D is the main surface: `<div data-connection-stage>` is the mount point for
 * the shared Three.js layer, which draws the template as a shallow 3D board with
 * real nodes, beams and a camera that leans in on a landed link. The SVG is NOT
 * removed — it becomes the fallback that is only shown when Three.js cannot run
 * (WebGL off, a tiny window, `prefers-reduced-motion` with no budget).
 *
 * The rule from the skill: 3D renders and animates, the DOM carries the
 * information. So the counter, the template name, the remaining-stages hint and
 * the two pick rows stay DOM, and a class on the stage tells CSS which surface is
 * live.
 */
function connectionPanelHtml(game) {
    const template = connectionTemplateFor(game);
    const progress = state.connectionProgress || resetConnectionProgress(template);
    const summary = connectionSummary(progress, template);
    const live3d = connection3dActive();
    return `<div class="connection-panel${live3d ? ' is-3d' : ' is-svg'}" data-connection-panel data-template="${connectionEsc(template.id)}">
      <div class="connection-panel-head">
        <span class="connection-counter" data-connection-counter>🔗 <b>${summary.connected}</b><span class="connection-total">/${summary.total}</span> kết nối</span>
        <span class="connection-template-name">${connectionEsc(template.name)}</span>
      </div>
      <div class="connection-stage" data-connection-stage data-connection3d="${live3d ? 'on' : 'off'}">${connectionSvg(template, progress, { animate: true })}</div>
      <p class="connection-hint" data-connection-hint>${summary.completed ? 'Đã nối đủ hình — cả lớp cùng nhìn lại và giải thích từng mối liên hệ.' : `Mỗi cặp ghép đúng nối thêm một chặng; còn <b>${summary.remaining}</b> chặng.`}</p>
    </div>`;
}

/**
 * Can the 3D surface carry this board right now?
 *
 * Three checks, in the order they matter: the shared layer must report a real
 * WebGL context, the stage must be wide enough for a picture to read (below
 * ~960 px the 3D board is a stamp and the SVG is clearer), and the teacher must
 * not have asked for reduced motion together with a narrow window. `isAvailable()`
 * is cached by the layer, so this is free per render.
 */
function connection3dActive() {
    if (!window.threeGame || typeof window.threeGame.isAvailable !== 'function') return false;
    if (!window.threeGame.isAvailable()) return false;
    const narrow = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 979px)').matches;
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !(narrow && calm);
}

/** Which nodes and links the progress has earned, in template order. */
function connectionEarnedParts(game) {
    const template = connectionTemplateFor(game);
    const progress = state.connectionProgress || resetConnectionProgress(template);
    const earned = new Set(progress.connectedStageIds);
    const nodeIds = [];
    const linkIds = [];
    template.stages.forEach(stage => {
        if (!earned.has(stage.id)) return;
        stage.nodeIds.forEach(id => { if (nodeIds.indexOf(id) === -1) nodeIds.push(id); });
        stage.edgeIds.forEach(id => { if (linkIds.indexOf(id) === -1) linkIds.push(id); });
    });
    return { template, progress, nodeIds, linkIds };
}
/**
 * Bring the picture and the counters up to date after an answer.
 *
 * On the 3D surface nothing is re-created: the world of the stage already exists,
 * so the progress is handed to it (`three-stage.ts` owns the handle and applies
 * `setEarned`), which keeps the beams that are already drawn and animates only
 * the new ones. Without 3D the SVG is re-rendered, exactly as it was before.
 * Focus is never touched, so keyboard play is unaffected.
 */
function refreshConnectionPanel(root) {
    const scope = root || document;
    const host = scope.querySelector('[data-connection-stage]');
    const template = connectionTemplateFor(state.currentGame);
    const progress = state.connectionProgress || resetConnectionProgress(template);
    // Without 3D the SVG IS the picture, so it is redrawn. With 3D it is hidden
    // behind the canvas and the stage world applies the same progress itself
    // (`reactConnectionBoard`); rewriting it would only churn the DOM.
    // `dataset.connection3d` is the camelCase form of `data-connection3d`; the
    // hyphenated spelling is unreachable through the dataset API.
    if (host && host.dataset.connection3d !== 'on') {
        host.innerHTML = connectionSvg(template, progress, { animate: true });
    }
    const counter = scope.querySelector('[data-connection-counter]');
    const summary = connectionSummary(progress, template);
    if (counter) counter.innerHTML = `🔗 <b>${summary.connected}</b><span class="connection-total">/${summary.total}</span> kết nối`;
    const hint = scope.querySelector('[data-connection-hint]');
    if (hint) hint.innerHTML = summary.completed
        ? 'Đã nối đủ hình — cả lớp cùng nhìn lại và giải thích từng mối liên hệ.'
        : `Mỗi cặp ghép đúng nối thêm một chặng; còn <b>${summary.remaining}</b> chặng.`;
}
/** Fresh progress for one playing (the play shell calls this on entry). */
function connectionCreate(game) {
    return resetConnectionProgress(connectionTemplateFor(game));
}
/**
 * Applies one resolved matching attempt to the visual progress. Called AFTER
 * scoring and never touches points. `pairIndex` is the position of the pair in
 * `matchingGame.pairs` (the plan's order), and `pairId` is the idempotency key
 * so resolving the same pair twice cannot connect two stages.
 */
function connectionApplyAnswer(game, pairIndex, pairId, correct) {
    if (!isConnectionBoard(game)) return null;
    const template = connectionTemplateFor(game);
    const plan = connectionPlan(game);
    const result = applyConnectionAnswer(state.connectionProgress, template, plan, pairIndex, pairId, correct);
    state.connectionProgress = result.progress;
    return result;
}
/** Reads the picked template id from a gallery; falls back to the default. */
function readConnectionGallery(root, field) {
    const scope = root || document;
    const host = scope.querySelector(`[data-connection-gallery="${field || 'connectionTemplate'}"]`);
    if (!host) return '';
    const checked = host.querySelector('input[type="radio"]:checked');
    return connectionResolveTemplate(checked ? checked.value : '').id;
}
