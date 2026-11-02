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
/**
 * The pair that lands on a star.
 *
 * The board is driven by STAR ids (a stage's `nodeIds[0]`) while a teacher's
 * pairs carry their own ids; for a game generated for the constellation board the
 * two are the same id, but a board whose pairs use their own ids (a custom
 * editor import, a game converted from another style) still has to play. Order is
 * the contract: the n-th pair belongs to the n-th star, the same order the pair
 * panel and the gallery preview show.
 */
function constellationPairForStar(game, template, starId) {
    const g = game || state.currentGame;
    const pairs = g && g.matchingGame && Array.isArray(g.matchingGame.pairs) ? g.matchingGame.pairs : [];
    const direct = pairs.find(pair => pair.id === starId);
    if (direct) return direct;
    const stages = template && Array.isArray(template.stages) ? template.stages : [];
    const index = stages.findIndex(stage => stage.nodeIds.indexOf(starId) !== -1);
    return index >= 0 ? (pairs[index] || null) : null;
}

/** The star a pair belongs to (identity when the ids line up). */
function constellationStarForPair(game, template, pairId) {
    const stages = template && Array.isArray(template.stages) ? template.stages : [];
    const direct = stages.find(stage => stage.nodeIds.indexOf(pairId) !== -1);
    if (direct) return pairId;
    const pairs = game && game.matchingGame && Array.isArray(game.matchingGame.pairs) ? game.matchingGame.pairs : [];
    const index = pairs.findIndex(pair => pair.id === pairId);
    const stage = index >= 0 ? stages[index] : null;
    return stage && stage.nodeIds.length ? stage.nodeIds[0] : pairId;
}

/**
 * Resolved template for the game on screen (never null; unknown ids fall back).
 *
 * #171: the board is a constellation, so the id is resolved through
 * `constellationResolve` — which also maps an OLD picture id (`solar-system`) to
 * the figure it resembles. The returned object is the `{ id, nodes, edges,
 * stages }` SHAPE the untouched progression understands, built for exactly as
 * many stars as the game has pairs.
 */
let constellationTemplateCache = null;

function connectionTemplateFor(game) {
    const g = game || state.currentGame;
    const pairs = g && g.matchingGame && Array.isArray(g.matchingGame.pairs) ? g.matchingGame.pairs.length : CONSTELLATION_STAR_MIN;
    const templateId = g && g.matchingGame ? g.matchingGame.connectionTemplate : null;
    const key = `${templateId || ''}|${pairs}`;
    if (constellationTemplateCache && constellationTemplateCache.key === key) return constellationTemplateCache.template;
    // Frozen: the planner writes the plan INTO the template it is given, so a
    // template that could be mutated would carry one playing's plan into the
    // next one (measured: one match claimed an edge that did not exist).
    const template = constellationTemplateShape(templateId, pairs);
    const freeze = (value) => {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        if (Array.isArray(value)) value.forEach(freeze);
        Object.freeze(value);
        return value;
    };
    freeze(template);
    constellationTemplateCache = { key, template };
    return template;
}

/** The drag direction of the game on screen (default `left-to-right`). */
function constellationDirectionFor(game) {
    const g = game || state.currentGame;
    return constellationResolveDragDirection(g && g.matchingGame ? g.matchingGame.dragDirection : null);
}

/**
 * Which half of a pair a student DROPS, and which half the star shows.
 *
 * `left-to-right`: the star keeps `pair.left`, the card carries `pair.right`.
 * `right-to-left`: the reverse. The producer of the pairs is not touched; this
 * is the only place that decides the sides, so the board, the chips, the
 * fallback and the projector cannot disagree.
 */
function constellationPairSides(pair, direction) {
    const reversed = constellationResolveDragDirection(direction) === 'right-to-left';
    return {
        starText: reversed ? pair.right : pair.left,
        cardText: reversed ? pair.left : pair.right
    };
}

/** True when a destination side is short enough to be drawn on the star itself. */
function constellationIsShortLabel(text) {
    return String(text === undefined || text === null ? '' : text).trim().length <= CONSTELLATION_SHORT_LABEL_MAX;
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
 * Can the 3D surface carry this board right now?
 *
 * The one condition that matters is a real WebGL context: the constellation is
 * the INPUT surface (chips sit on stars, drops land on stars), so there is no
 * "narrow window" case where a static picture would be better — it would not be
 * playable. The SVG is only for machines without WebGL at all.
 */
function connection3dActive() {
    if (!window.threeGame || typeof window.threeGame.isAvailable !== 'function') return false;
    if (!window.threeGame.isAvailable()) return false;
    return true;
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
    // #171: the play surface is the constellation board, and it owns its own
    // repaint (`paintConstellationSurface` in `games/constellation.ts`). The one
    // rule that must survive is the #169 one: the static SVG never paints under a
    // live canvas. It is re-rendered ONLY as the fallback, and only for the stars
    // the class has earned.
    const host = scope.querySelector('[data-constellation-stage]');
    const template = connectionTemplateFor(state.currentGame);
    const progress = state.connectionProgress || resetConnectionProgress(template);
    if (host && host.dataset.connection3d !== 'on') {
        // The fallback IS the whole board: every star carries the lesson text of
        // the pair it stands for, because without the scene there is no HTML chip.
        const svg = constellationSvg(template, template.nodes.length, progress, {
            animate: true,
            pairText: starId => {
                const pair = constellationPairForStar(state.currentGame, template, starId);
                return pair ? constellationPairSides(pair, constellationDirectionFor(state.currentGame)).starText : '';
            }
        });
        const holder = host.querySelector('.constellation-svg');
        if (holder) holder.outerHTML = svg;
        else host.insertAdjacentHTML('afterbegin', svg);
    }
    paintConstellationSurface(scope);
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

/*
 * ---------------------------------------------------------------------------
 * Constellation gallery + static picture (DECISIONS #171)
 * ---------------------------------------------------------------------------
 * The setup gallery, the thumbnail, the projector view and the "no WebGL"
 * fallback all draw the SAME constellation, so they share one drawer here.
 * `constellationSvg(template, progress)` renders the small preview and the
 * fallback: `progress === null` is the finished figure (a thumbnail), otherwise
 * only the stars the class has lit are bright and the rest are faint.
 */
function readConstellationGallery(root, field) {
    const scope = root || document;
    const host = scope.querySelector(`[data-connection-gallery="${field || 'connectionTemplate'}"]`);
    if (!host) return '';
    const checked = host.querySelector('input[type="radio"]:checked');
    return constellationResolve(checked ? checked.value : '').id;
}

/**
 * The static constellation picture.
 *
 * `pairCount` decides how many stars are on the board (the same selection the
 * play surface uses), so a 3-star game previews as three stars instead of ten.
 * `progress` lights the earned ones; hidden stars are always drawn faint, never
 * removed — a class must see how much of the figure is still to come.
 */
function constellationSvg(template, pairCount, progress, options = {}) {
    // `options.pairText(starId)` supplies the caption drawn under a star (the
    // lesson word of the pair that star stands for); without it the star keeps its
    // own short name — a thumbnail or the gallery do not need lesson text.
    const resolved = constellationResolve(template);
    const picked = selectConstellation(resolved, pairCount);
    const lit = {};
    const stages = progress && Array.isArray(progress.connectedStageIds) ? progress.connectedStageIds : null;
    if (stages) {
        picked.stars.forEach(star => {
            lit[star.id] = false;
        });
        stages.forEach(stageId => {
            picked.stars.forEach(star => {
                if (stageId.indexOf('-' + star.id) !== -1) lit[star.id] = true;
            });
        });
    }
    const on = id => !stages || Boolean(lit[id]);
    const linkOn = link => on(link.from) && on(link.to);
    const edgeSvg = picked.links.map(link => {
        const a = picked.stars.find(star => star.id === link.from);
        const b = picked.stars.find(star => star.id === link.to);
        if (!a || !b) return '';
        const d = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
        return linkOn(link)
            ? `<path class="constellation-link${options.animate ? ' is-new' : ''}" d="${d}" data-link="${connectionEsc(link.id)}" />`
            : `<path class="constellation-link-slot" d="${d}" data-link-slot="${connectionEsc(link.id)}" />`;
    }).join('');
    const starSvg = picked.stars.map((star, index) => {
        const bright = on(star.id);
        const r = 6 + 6 * (Number(star.brightness) || 0.5);
        const lessonText = typeof options.pairText === 'function' ? options.pairText(star.id) : '';
        const label = options.labels === false ? '' : `<text x="${star.x}" y="${star.y + r + 16}">${connectionEsc(lessonText || constellationStarCaption(star, index))}</text>`;
        return `<g class="constellation-star${bright ? ' is-lit' : ''}" data-star="${connectionEsc(star.id)}">
          <circle class="constellation-halo" cx="${star.x}" cy="${star.y}" r="${r + 8}" />
          <circle class="constellation-core" cx="${star.x}" cy="${star.y}" r="${r}" />
          ${label}
        </g>`;
    }).join('');
    return `<svg class="constellation-svg" viewBox="0 0 ${CONSTELLATION_VIEWBOX.width} ${CONSTELLATION_VIEWBOX.height}" role="img" aria-label="${connectionEsc(resolved.name)}" preserveAspectRatio="xMidYMid meet">
      <g class="constellation-links">${edgeSvg}</g>
      <g class="constellation-stars">${starSvg}</g>
    </svg>`;
}

/** Small picture for a gallery card: the whole figure in its fullest useful form. */
function constellationThumbnail(template) {
    return `<div class="connection-thumb" aria-hidden="true">${constellationSvg(template, CONSTELLATION_STAR_MAX, null, { labels: false })}</div>`;
}

/** Constellation gallery for wizard step 4 and the editor (a radio group). */
function constellationGalleryHtml(selectedId, name) {
    const selected = constellationResolve(selectedId).id;
    const field = name || 'connectionTemplate';
    return `<div class="connection-gallery" data-connection-gallery="${connectionEsc(field)}">${CONSTELLATION_TEMPLATES.map(template => `<label class="connection-card constellation-card${template.id === selected ? ' is-selected' : ''}" data-connection-template="${connectionEsc(template.id)}">
        <input type="radio" name="${connectionEsc(field)}" value="${connectionEsc(template.id)}" ${template.id === selected ? 'checked' : ''}>
        ${constellationThumbnail(template)}
        <span class="connection-card-body">
          <strong>${connectionEsc(template.name)}</strong>
          <span class="connection-card-desc">${connectionEsc(template.description)}</span>
          <span class="connection-card-meta">${template.stars.length} sao${template.sky ? ` · ${connectionEsc(template.sky)}` : ''}</span>
        </span>
      </label>`).join('')}</div>`;
}

/** Larger preview above the gallery so a teacher sees the figure, not a stamp. */
function constellationPreviewHtml(selectedId) {
    const template = constellationResolve(selectedId);
    return `<div class="connection-preview constellation-preview" data-connection-preview>
      <div class="connection-preview-art">${constellationSvg(template, CONSTELLATION_STAR_MAX, null)}</div>
      <div class="connection-preview-copy">
        <strong>${connectionEsc(template.name)}</strong>
        <span>${connectionEsc(template.description)}</span>
        <span class="connection-preview-steps">${connectionEsc(template.sky || '')}</span>
        <span class="connection-preview-steps">${template.stars.length} sao · ${connectionEsc(template.subjectHint || '')}</span>
      </div>
    </div>`;
}
