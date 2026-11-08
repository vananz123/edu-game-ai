// @ts-nocheck -- "Chòm sao tri thức" play surface (DECISIONS #171, recomposed in #172).
//
// THE THREE SURFACES, AND WHAT EACH ONE IS ALLOWED TO SHOW
//
//   1. THE SCENE (Three.js, `three-stage.ts` builds it). Stars, glow, the
//      constellation's own edges. An edge appears ONLY when a pair is matched:
//      `setEarned` reveals it with a draw-on. Nothing else is ever drawn in 3D,
//      and no geometry carries lesson text.
//
//   2. THE QUESTION LAYER (HTML on top of the scene). One label per star, the
//      side of the pair the star stands for. A term-sized side hangs on its own
//      star: centred on it, clear of the star's body, joined to it by a 15 px stem
//      that ends in a gold dot ON the star (DECISIONS #174 — the label used to be
//      dropped over the star, which hid it). Anything longer moves into the
//      question row UNDER the scene, where it fits at readable size, into the grid
//      column of its own star, with ONE short pointer line to it. That pointer is
//      the only line this layer draws, it is drawn only for a moved card, and it
//      is styled as a pointer (thin, dashed, muted) — never like a constellation
//      edge.
//
//   3. THE TRAY (HTML below the play area). ONE horizontal row of draggable answer
//      cards, each showing its real text. There is no second answer list anywhere:
//      the two-column board's pick rows do not exist on this board.
//
// One function resolves an attempt for every input path (drop, tap, keyboard):
// `placeOnStar`. Scoring stays in the matching board (`matching.ts`), so the
// constellation board and the two-column board keep the same scoring, practice
// mode and completion flow.

const CONSTELLATION_DRAG_TYPE = 'application/x-edugame-constellation';


/**
 * Can this star's label be hung on the star itself?
 *
 * DECISIONS #174 changed the geometry: a label is centred ON its star and hangs
 * just clear of it (a 15 px stem and a gold dot do the connecting), so the room
 * it needs is HALF its own width on each side of the star, plus one label-height
 * of free lane on the side it hangs. Before that, the test asked for 30 % of the
 * width on ONE side and a card no wider than 150 px — which capped a scene label
 * at ~16 characters and exiled every normal two-word term to the row under the
 * picture, where the class could not tell which star it belonged to.
 *
 * Still a layout estimate, not a measurement: `constellationRefitCards` measures
 * after paint and moves a card out of the scene if it truly does not fit.
 */
const CONSTELLATION_LABEL_LANE = 12;
const CONSTELLATION_LABEL_MAX_PX = 210;
const CONSTELLATION_FRAME_FALLBACK_PX = 1000;
const CONSTELLATION_FRAME_FALLBACK_H_PX = 620;
/** Approximate advance of one character at the label's 15 px font (#219). */
const CONSTELLATION_LABEL_CHAR_PX = 8.3;
/** One wrapped line of a label: 15 px at `line-height: 1.3`. */
const CONSTELLATION_LABEL_LINE_PX = 20;
/** Vertical padding of `.constellation-card--star` (6 px + 6 px). */
const CONSTELLATION_LABEL_PAD_PX = 12;
/** The stem that ties a hanging label to its star. */
const CONSTELLATION_LABEL_STEM_PX = 15;
/** The card's own `max-width: min(44%, 210px)`, as a fraction of the frame. */
const CONSTELLATION_LABEL_MAX_W_FRACTION = 0.44;

/** The label's own width, in px, from the same estimate the old fit test used. */
function constellationLabelWidthPx(text) {
    return Math.min(CONSTELLATION_LABEL_MAX_PX, String(text || '').trim().length * CONSTELLATION_LABEL_CHAR_PX + 22);
}

/**
 * How many wrapped lines this text needs inside the card's own max width.
 *
 * The card wraps (`white-space: normal`), so long text costs HEIGHT. That is what
 * decides whether there is still a lane for it between its star and the edge of
 * the frame.
 */
function constellationLabelLines(text, capPx) {
    const raw = String(text === undefined || text === null ? '' : text).trim().length * CONSTELLATION_LABEL_CHAR_PX + 22;
    return Math.max(1, Math.ceil(raw / Math.max(48, capPx)));
}

/** Which side of its star a scene label hangs on. */
function constellationLabelSide(anchor) {
    if (!anchor) return 'above';
    // Above by default: the question row and its pointer threads already live at
    // the bottom edge, so labels hanging below too would crowd one band. A star
    // with no lane above it (close to the top of the frame) gets the label below.
    return anchor.top >= CONSTELLATION_LABEL_LANE ? 'above' : 'below';
}

/**
 * Can this card hang on its star?
 *
 * #178 asks the question of the WHOLE PAIR. A lit star also shows the half the
 * student dropped, so a card measured on the term alone would fit before the drop
 * and overflow after it — and the sky would restructure itself at the one moment
 * the whole class is looking at that star. The height is the pair's wrapped line
 * count plus padding and the stem; the width is the wider of the two halves.
 */
function constellationCardFits(anchor, text, answerText) {
    if (!anchor) return false;
    const scene = document.querySelector('[data-constellation-scene]');
    const rect = scene ? scene.getBoundingClientRect() : null;
    const frameW = rect && rect.width > 200 ? rect.width : CONSTELLATION_FRAME_FALLBACK_PX;
    const frameH = rect && rect.height > 120 ? rect.height : CONSTELLATION_FRAME_FALLBACK_H_PX;
    const cap = Math.min(CONSTELLATION_LABEL_MAX_PX, frameW * CONSTELLATION_LABEL_MAX_W_FRACTION);
    const lines = constellationLabelLines(text, cap)
        + (answerText ? constellationLabelLines(answerText, cap) : 0);
    const reachPx = CONSTELLATION_LABEL_PAD_PX + CONSTELLATION_LABEL_LINE_PX * lines + CONSTELLATION_LABEL_STEM_PX;
    const side = constellationLabelSide(anchor);
    const lane = side === 'below' ? 100 - anchor.top : anchor.top;
    if (lane < Math.max(CONSTELLATION_LABEL_LANE, reachPx / frameH * 100)) return false;
    const widest = Math.max(constellationLabelWidthPx(text), constellationLabelWidthPx(answerText));
    return Math.min(anchor.left, 100 - anchor.left) >= widest / 2 / frameW * 100;
}

/**
 * The answer half of a joined pair, drawn as its own line inside the card.
 *
 * DECISIONS #178 answers the teacher's "khi kéo phần A và phần B thì chữ phần B
 * bị mất thay vào đó là chữ phần A": the card that left the tray was the only
 * place its half of the pair was written, so a lit star said "Quang hợp" and the
 * class could not see WHAT it had been joined to.
 */
function constellationAnswerLine(text) {
    return text ? `<span class="constellation-card-answer">${connectionEsc(text)}</span>` : '';
}

/** One label for both halves, so a screen reader reads the pair, not a term. */
function constellationCardAria(card, number) {
    const head = number ? `Sao đích ${number}: ` : 'Sao đích: ';
    return `${head}${connectionEsc(card.text)}${card.answer ? ` — đã ghép: ${connectionEsc(card.answer)}` : ''}`;
}

/**
 * The board's HTML: scene, question row, tray, HUD.
 *
 * Every block carries its own data attribute so a repaint can update one block
 * without touching the others (and without stealing the drag the hand is doing).
 */
function constellationPanelHtml(game) {
    const template = connectionTemplateFor(game);
    const direction = constellationDirectionFor(game);
    const progress = state.connectionProgress || resetConnectionProgress(template);
    const summary = connectionSummary(progress, template);
    const live3d = connection3dActive();
    return `<div class="constellation-panel${live3d ? ' is-3d' : ' is-svg'}" data-constellation-panel data-template="${connectionEsc(template.id)}" data-direction="${direction}">
      <section class="constellation-scene" data-constellation-scene data-connection-stage data-constellation-stage data-connection3d="${live3d ? 'on' : 'off'}" aria-label="Chòm sao ${escapeHtml(template.name)}">
        ${constellationSvg(template, template.nodes.length, progress)}
        <!-- ONE pointer layer, inside the picture's own box: it is the only line
             this board draws besides its edges, and a moved card reaches its star
             through it. -->
        <svg class="constellation-pointers" data-constellation-pointers aria-hidden="true"></svg>
        <div class="constellation-cards" data-constellation-cards></div>
        <div class="constellation-no3d" data-constellation-no3d hidden></div>
      </section>
      <div class="constellation-question-row" data-constellation-question-row hidden></div>
      <section class="constellation-tray" data-constellation-tray aria-label="Thẻ đáp án">
        <span class="constellation-tray-label" aria-hidden="true">KÉO VÀO SAO</span>
        <div class="constellation-tray-cards" data-constellation-tray-cards></div>
    </section>
    </div>`;
}

/** The compact HUD line above the scene. */
function constellationHudHtml(game) {
    const template = connectionTemplateFor(game);
    const progress = state.connectionProgress || resetConnectionProgress(template);
    const summary = connectionSummary(progress, template);
    const direction = constellationDirectionFor(game);
    const sides = direction === 'right-to-left' ? 'sao: nghĩa nối · thẻ: nghĩa gốc' : 'sao: nghĩa gốc · thẻ: nghĩa nối';
    const stars = [];
    for (let i = 0; i < summary.total; i += 1) {
        stars.push(`<span class="${i < summary.connected ? 'constellation-lit' : 'constellation-unlit'}" aria-hidden="true">${i < summary.connected ? '★' : '☆'}</span>`);
    }
    return `<span class="constellation-hud-name">🌌 ${connectionEsc(template.name)}</span>
      <span class="constellation-hud-stars">${stars.join('')}</span>
      <span class="constellation-hud-count" data-constellation-count><b>${summary.connected}</b>/${summary.total} sao</span>
      <span class="constellation-hud-sides" data-constellation-sides>${sides}</span>`;
}

/** The one-line status under the tray: the only running instruction. */
function constellationStatusHtml(game) {
    const template = connectionTemplateFor(game);
    const progress = state.connectionProgress || resetConnectionProgress(template);
    const summary = connectionSummary(progress, template);
    if (summary.completed) return 'Đã sáng đủ chòm sao — cả lớp cùng nhìn lại và giải thích từng mối liên hệ.';
    if (!constellation3dLive()) return 'Máy này không chạy được cảnh 3D. Bài vẫn chơi được ở chế độ <b>Ghép hai cột</b> cho buổi học; bài đã lưu không bị thay đổi.';
    return `Kéo thẻ lên một ngôi sao (hoặc bấm thẻ rồi bấm sao; Tab và Enter cũng được) — còn <b>${summary.remaining}</b> sao chưa sáng.`;
}

/**
 * Is this star's side a TERM, i.e. short enough to hang on the star itself?
 *
 * The floor is the shared readability constant (`CONSTELLATION_SHORT_LABEL_MAX`,
 * 24 characters, unit-guarded) — not a second number this file keeps by itself.
 * A label that hangs on a star is read from the back row, so it stays small: two
 * or three words, wrapped into at most two lines of the card's own width.
 * Anything longer is a sentence, and a sentence belongs in the question row,
 * where it has the width to be read.
 */
function constellationIsShortLabel(text) {
    return String(text === undefined || text === null ? '' : text).trim().length <= CONSTELLATION_SHORT_LABEL_MAX;
}

const constellationCARDS = '[data-constellation-cards]';
const constellationQuestionRow = '[data-constellation-question-row]';
const constellationTrayCards = '[data-constellation-tray-cards]';

/** The answer cards still in the tray: every pair whose star is not lit. */
function constellationRemainingPairs(game) {
    const template = connectionTemplateFor(game);
    const progress = state.connectionProgress || resetConnectionProgress(template);
    return template.stages
        .map(stage => stage.nodeIds[0])
        .filter(starId => !constellationStarIsLit(progress, template, starId))
        .map(starId => constellationPairForStar(game, template, starId))
        .filter(Boolean);
}

function constellationStarIsLit(progress, template, starId) {
    if (!progress) return false;
    return template.stages.some(stage => progress.connectedStageIds.indexOf(stage.id) !== -1 && stage.nodeIds.indexOf(starId) !== -1);
}

/** True when the live board is the 3D one (not the static fallback). */
function constellation3dLive() {
    const host = document.querySelector('[data-constellation-scene]');
    return Boolean(host && host.dataset.connection3d === 'on' && document.querySelector('.game-stage canvas'));
}

/**
 * Paint the board.
 *
 * Blocks are updated separately so a resolved answer never rebuilds the tray
 * (which would steal a drag in progress) or the scene (which would restart the
 * 3D world on every answer). `restructure` is the one call that lays out the
 * question cards from scratch: mount, replay, and a resize.
 */
function paintConstellationSurface(root, options = {}) {
    const scope = root || document;
    const game = state.currentGame;
    if (!isConnectionBoard(game) || !scope.querySelector('[data-constellation-panel]')) return;
    const template = connectionTemplateFor(game);
    const direction = constellationDirectionFor(game);
    const progress = state.connectionProgress || resetConnectionProgress(template);
    const live3d = constellation3dLive();
    // The anchors are MEASURED here, not read from the last layout pass. `updateStarAnchors()`
    // is cheap (one projection per star) and it is the only way this paint can lay a label on
    // the star the class is looking at NOW: the answer line is written before this call
    // (`matchingFeedback` → `paintConstellationSurface`), so a pass that trusts the cached
    // numbers places every label against a sky that has already been re-fitted under it
    // (measured: dx −43…−55 px after the first correct answer, #178).
    const anchors = live3d ? (updateStarAnchors() || {}) : {};
    // The height the anchors are percentages OF. `updateStarAnchors()` ran just
    // before this paint, and this paint can change that box (a question row that
    // appears or wraps takes its height out of the scene), so the value is
    // captured first and compared at the end.
    const sceneBox = scope.querySelector('[data-constellation-scene]');
    const heightBefore = sceneBox ? sceneBox.getBoundingClientRect().height : 0;

    // ---- question cards: one per star, on the star or in the row ----
    const host = scope.querySelector(constellationCARDS);
    const row = scope.querySelector(constellationQuestionRow);
    if (host && row) {
        const sceneCards = [];
        const rowCards = [];
        template.stages.forEach((stage) => {
            const starId = stage.nodeIds[0];
            const pair = constellationPairForStar(game, template, starId);
            if (!pair) return;
            const lit = constellationStarIsLit(progress, template, starId);
            const sides = constellationPairSides(pair, direction);
            const text = sides.starText;
            // #178: the answer half is only REVEALED once the pair is joined — until
            // then it is the thing the student has to find — but the fit below is
            // asked of the WHOLE PAIR, so the card does not move at the moment it
            // lights up.
            const anchor = anchors[starId];
            if (live3d && constellationIsShortLabel(text) && constellationCardFits(anchor, text, sides.cardText) && !stage.constellationMoved) {
                sceneCards.push({ starId, text, answer: lit ? sides.cardText : '', lit, anchor, side: constellationLabelSide(anchor) });
            } else {
                rowCards.push({ starId, text, answer: lit ? sides.cardText : '', lit, left: anchor ? anchor.left : NaN });
            }
        });
        // A row card belongs to the star above it, so it is read in the star's
        // order — left to right across the sky, not in the order the pairs were
        // generated. Without a projection there is nothing to align to, and the
        // band keeps the lesson order.
        const place = live3d && rowCards.some(card => Number.isFinite(card.left));
        const ordered = place ? rowCards.slice().sort((a, b) => (Number.isFinite(a.left) ? a.left : 50) - (Number.isFinite(b.left) ? b.left : 50)) : rowCards;
        const slots = place ? constellationRowSlots(ordered) : [];
        // A long card can be pushed a column or two away from its star (two 370 px
        // sentences cannot both centre on stars 4 % apart), so the pairing is
        // numbered as well as positioned: the star wears the same number the card
        // starts with. Measured on the real board: dx 0–42 px for a spread belt,
        // up to 279 px for two crowded stars — the number is what survives that.
        const markHtml = place ? ordered.map((card, index) => {
            const anchor = anchors[card.starId];
            if (!anchor) return '';
            return `<div class="constellation-card constellation-card--hang constellation-card--mark"
                data-star-mark="${connectionEsc(card.starId)}" data-question-mark="${connectionEsc(card.starId)}"
                data-side="${constellationLabelSide(anchor)}" aria-hidden="true"
                style="left:${anchor.left}%;top:${anchor.top}%">${index + 1}</div>`;
        }).join('') : '';
        host.innerHTML = sceneCards.map(card => `<div class="constellation-card constellation-card--hang constellation-card--star${card.lit ? ' is-lit' : ''}"
            data-star-card="${connectionEsc(card.starId)}"
            data-side="${card.side}"
            tabindex="0" role="button"
            aria-label="${constellationCardAria(card)}"
            style="left:${card.anchor.left}%;top:${card.anchor.top}%">${connectionEsc(card.text)}${constellationAnswerLine(card.answer)}</div>`).join('') + markHtml;
        row.hidden = rowCards.length === 0;
        row.classList.toggle('is-flow', !place);
        row.innerHTML = ordered.length
            ? `<span class="constellation-row-label" aria-hidden="true">SAO ĐÍCH</span>` + ordered.map((card, index) => `<button type="button"
                class="constellation-question-card${card.lit ? ' is-lit' : ''}"
                data-question-card="${connectionEsc(card.starId)}"
                data-question-row="1"
                aria-label="${constellationCardAria(card, index + 1)}"
                ${slotStyle(slots[index])}${card.lit ? ' disabled' : ''}>${place
                    ? `<span class="constellation-card-index" aria-hidden="true">${index + 1}</span>` : ''}${connectionEsc(card.text)}${constellationAnswerLine(card.answer)}</button>`).join('')
            : '';
    }

    // ---- the tray: exactly one answer area ----
    const tray = scope.querySelector(constellationTrayCards);
    if (tray) {
        const remaining = constellationRemainingPairs(game);
        tray.innerHTML = remaining.map(pair => {
            const text = constellationPairSides(pair, direction).cardText;
            return `<button type="button" class="constellation-tray-card${state.constellationSelected === pair.id ? ' is-selected' : ''}"
                draggable="true"
                data-answer-card="${escapeHtml(pair.id)}"
                aria-label="Kéo thẻ ${escapeHtml(text)} vào ngôi sao đúng">${escapeHtml(text)}</button>`;
        }).join('');
        if (!remaining.length) tray.innerHTML = '<span class="constellation-tray-done">Đã xếp hết thẻ.</span>';
    }

    // ---- the HUD and the one status line ----
    const hud = scope.querySelector('[data-constellation-hud]');
    if (hud) hud.innerHTML = constellationHudHtml(game);
    const status = scope.querySelector('[data-constellation-status]');
    if (status) status.innerHTML = constellationStatusHtml(game);

    // ---- the no-WebGL notice ----
    const noHost = scope.querySelector('[data-constellation-no3d]');
    if (noHost) {
        noHost.hidden = live3d;
        noHost.innerHTML = live3d ? '' : constellationNoWebglHtml();
        const switchBtn = noHost.querySelector('.constellation-switch-columns');
        if (switchBtn) switchBtn.onclick = () => switchConstellationToColumns(switchBtn);
    }

    // The static SVG is the picture only when 3D cannot run, and its earned stars
    // follow the progression (never a second copy of it).
    if (!live3d) {
        const holder = scope.querySelector('.constellation-svg');
        if (holder) holder.outerHTML = constellationSvg(template, template.nodes.length, progress, {
            pairText: starId => constellationStarCaptions(game, template, starId, progress).label,
            pairAnswerText: starId => constellationStarCaptions(game, template, starId, progress).answer
        });
    }

    constellationDrawPointers(scope);
    if (options.restructure) constellationRefitCards(scope);
    constellationReframeIfNeeded(scope, heightBefore, options);
    sendPresentationState();
}

/**
 * The 12-column band each row card is dropped into.
 *
 * A card spans 4 columns, so its block is a third of the row wide and its centre
 * is 2 columns in. The wanted start is therefore the column that puts the card's
 * centre on the star's horizontal percentage — and a card only ever moves RIGHT
 * to clear the one before it, in star order, so two cards can never overlap and
 * the row still reads the way the sky reads. A card with no room left in the band
 * starts a second grid row.
 */
const CONSTELLATION_ROW_COLUMNS = 12;
const CONSTELLATION_ROW_SPAN = 4;

function constellationRowSlots(rowCards) {
    const last = CONSTELLATION_ROW_COLUMNS - CONSTELLATION_ROW_SPAN;
    let gridRow = 1;
    let cursor = 0;
    return rowCards.map((card) => {
        const wanted = Number.isFinite(card.left)
            ? Math.round((card.left / 100) * CONSTELLATION_ROW_COLUMNS - CONSTELLATION_ROW_SPAN / 2)
            : cursor;
        let start = Math.max(0, Math.min(last, wanted));
        // A card that would land on its neighbour slides right instead: never
        // left, never overlapping, so the row keeps the sky's order.
        if (start < cursor) start = cursor;
        if (start > last) {
            gridRow += 1;
            cursor = 0;
            start = Math.max(0, Math.min(last, wanted));
        }
        cursor = start + CONSTELLATION_ROW_SPAN;
        return { start, span: CONSTELLATION_ROW_SPAN, gridRow };
    });
}

/** One slot, as the attribute the card needs. */
function slotStyle(slot) {
    if (!slot) return '';
    return `style="grid-column:${slot.start + 1} / span ${slot.span};grid-row:${slot.gridRow}"`;
}

/**
 * Re-frame once when this paint changed the scene's own height.
 *
 * The question row takes its height out of the scene's box, and the labels are
 * placed with percentages OF that box (measured on the real board: 485 px with no
 * row, 433 px once a three-card row appeared). So the first paint that adds or
 * wraps a row is laying labels with stale numbers — the star has moved under
 * them, which is exactly the "which star is this?" complaint. One pass with the
 * final height, and the two agree.
 *
 * Only one pass, and only on the 3D board: `afterReframe` stops the recursion,
 * and the no-WebGL board has no projection to keep in step.
 */
function constellationReframeIfNeeded(scope, heightBefore, options) {
    if (options.afterReframe || !constellation3dLive()) return;
    const scene = scope.querySelector('[data-constellation-scene]');
    if (!scene || !heightBefore) return;
    const after = scene.getBoundingClientRect().height;
    if (Math.abs(after - heightBefore) <= 2) return;
    refreshConstellationBoard({ restructure: true, afterReframe: true });
}

/**
 * Move a card out of the scene when the real layout says it does not fit.
 *
 * The estimate above decides the first choice; this pass measures. A card that
 * overlaps another card, leaves the frame, or covers a star that is NOT its own
 * is moved once to the question row — and stays there until the board is
 * rebuilt, so a resize cannot flip it back and forth. The last case is the one
 * that matters for reading the board: a label that hides somebody else's star
 * teaches the class a wrong pairing.
 */
function constellationRefitCards(scope) {
    const game = state.currentGame;
    if (!isConnectionBoard(game) || !constellation3dLive()) return;
    const host = scope.querySelector(constellationCARDS);
    const scene = scope.querySelector('[data-constellation-scene]');
    if (!host || !scene) return;
    const sceneRect = scene.getBoundingClientRect();
    if (!sceneRect.width) return;
    const cards = [...host.querySelectorAll('[data-star-card]')];
    if (!cards.length) return;
    const template = connectionTemplateFor(game);
    const points = updateConnectionStarPoints();
    const keep = [];
    let moved = false;
    cards.forEach(card => {
        const r = card.getBoundingClientRect();
        const inside = r.left >= sceneRect.left - 2 && r.right <= sceneRect.right + 2
            && r.top >= sceneRect.top - 2 && r.bottom <= sceneRect.bottom + 2;
        const clear = keep.every(other => r.right <= other.left - 4 || r.left >= other.right + 4
            || r.bottom <= other.top - 4 || r.top >= other.bottom + 4);
        const ownStar = card.dataset.starCard;
        const coversOther = Object.keys(points).some(starId => {
            if (starId === ownStar) return false;
            const p = points[starId];
            return p.x >= r.left - 2 && p.x <= r.right + 2 && p.y >= r.top - 2 && p.y <= r.bottom + 2;
        });
        if (inside && clear && !coversOther) {
            keep.push(r);
            return;
        }
        const stage = template.stages.find(entry => entry.nodeIds[0] === ownStar);
        if (stage) stage.constellationMoved = true;
        moved = true;
    });
    if (moved) paintConstellationSurface(scope);
}

/**
 * ONE pointer line per card that sits outside the scene.
 *
 * A moved card is a sentence under the picture; the pointer is what ties it to
 * its star. It is drawn in its own SVG, dashed and muted, so it can never be
 * mistaken for a constellation edge (which is solid, warm and only appears after
 * a match). The path leaves the top edge of the card and lands just under the
 * star, so it does not cross the card's own text or the labels around the star.
 */
function constellationDrawPointers(root) {
    const scope = root || document;
    const svg = scope.querySelector('[data-constellation-pointers]');
    const scene = scope.querySelector('[data-constellation-scene]');
    if (!svg || !scene) return;
    svg.innerHTML = '';
    const points = constellation3dLive() ? updateConnectionStarPoints() : {};
    const sceneRect = scene.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const paths = [];
    scope.querySelectorAll('[data-question-card]').forEach(card => {
        const starId = card.dataset.questionCard;
        const star = points[starId];
        const cardRect = card.getBoundingClientRect();
        if (!star) {
            // The 2D fallback has no 3D projection: point at the star the SVG
            // draws, which is the same selection the fallback paints.
            const fallback = scope.querySelector(`[data-constellation-stage] [data-star="${cssEscapeAttr(starId)}"] circle`);
            const circle = fallback ? fallback.getBoundingClientRect() : null;
            if (!circle) return;
            paths.push(constellationPointerPath(circle.left + circle.width / 2, circle.top + circle.height / 2, cardRect, svgRect, card.classList.contains('is-lit')));
            return;
        }
        paths.push(constellationPointerPath(star.x, star.y + 10, cardRect, svgRect, card.classList.contains('is-lit')));
    });
    svg.innerHTML = paths.join('');
    void sceneRect;
}

/**
 * One pointer path, in the picture's own pixel space.
 *
 * The layer covers the scene exactly, so the star's client point becomes its
 * frame point and the card's centre is clamped to the scene's bottom edge (the
 * card lives just under it). The line leaves the card and ENDS at the star: a
 * short, readable thread, not a line across the picture.
 */
function constellationPointerPath(starX, starY, cardRect, svgRect, lit) {
    const x1 = starX - svgRect.left;
    const y1 = starY - svgRect.top;
    const bottom = svgRect.height - 2;
    const x2 = Math.min(Math.max(cardRect.left + cardRect.width / 2 - svgRect.left, 8), svgRect.width - 8);
    const y2 = Math.min(bottom, Math.max(cardRect.top - svgRect.top, y1 + 6));
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || y2 - y1 < 4) return '';
    // The touch point is a dot on the star; the thread curves down to the card,
    // so it never runs through the scene's centre where the stars are read.
    return `<path class="constellation-pointer${lit ? ' is-lit' : ''}" d="M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${((y1 + y2) / 2).toFixed(1)}, ${x2.toFixed(1)} ${((y1 + y2) / 2).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}" />`
        + `<circle class="constellation-pointer-tip${lit ? ' is-lit' : ''}" cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="2.4" />`;
}

/** Smallest CSS.escape substitute: ids come from the game, never interpolate raw. */
function cssEscapeAttr(value) {
    return String(value === undefined || value === null ? '' : value).replace(/["\\]/g, '\\$&');
}

/**
 * One attempt: the card named by `answerId` is placed on the star `starId`.
 *
 * This is the ONLY place an attempt is resolved, whatever the input was (mouse
 * drop, tap-to-place, keyboard Enter, a test call). It hands the matching board
 * two stand-ins, so scoring, the picture and the reactions are the same as the
 * two-column board's.
 *
 * Returns `'correct'`, `'wrong'` or `''` (nothing happened — a locked board or a
 * star that is not part of this board).
 */
function placeOnStar(answerId, starId) {
    const game = state.currentGame;
    if (!isConnectionBoard(game) || !answerId || !starId) return '';
    const m = game.matchingGame;
    const template = connectionTemplateFor(game);
    // A card is named by its PAIR, a star by its star id. For a board generated
    // for this mode they are the same value; otherwise the pair names the star
    // (the same order contract the cards are drawn from).
    const star = constellationStarForPair(game, template, starId);
    if (!m.pairs.some(pair => pair.id === answerId)) return '';
    if (!template.nodes.some(node => node.id === star)) return '';
    // A wrong attempt is locked by the matching board for a moment (feedback).
    // Dropping while it is locked is simply refused, and nothing is scored.
    if (state.matchingPlay && state.matchingPlay.lock) return '';
    const starPair = constellationPairForStar(game, template, star);
    const starPairId = starPair ? starPair.id : star;
    const correct = answerId === starPairId;
    const left = constellationProxyElement('left', answerId, m.pairs.findIndex(pair => pair.id === answerId));
    const right = constellationProxyElement('right', starPairId, -1);
    right.dataset.star = star;
    right.dataset.starPair = starPairId;
    evaluateColumnMatchWith(left, right, { answerId, starId: star, correct });
    return { outcome: correct ? 'correct' : 'wrong', answerId, starId: star, starPairId };
}

/**
 * Run `fn` after the matching board's feedback lock, then repaint the board.
 *
 * A wrong attempt locks the board for 550 ms (`evaluateColumnMatchWith`) and the
 * board repaints when it releases. Anything this file wants the class to SEE
 * before that repaint has to be drawn now and removed by that repaint — a repaint
 * issued immediately would erase it in the same frame it appeared (#219: measured
 * `visibleWrongMarks: 0` on the old board).
 */
function constellationAfterLock(fn) {
    const release = () => {
        fn();
        paintConstellationSurface(document);
    };
    if (!(state.matchingPlay && state.matchingPlay.lock)) {
        release();
        return;
    }
    window.setTimeout(() => {
        if (state.matchingPlay && state.matchingPlay.lock) {
            constellationAfterLock(fn);
            return;
        }
        release();
    }, 560);
}

/**
 * Paint the wrong attempt on the real nodes: the card in the tray and the star's
 * own label (or its row card) turn red until the board repaints at the end of the
 * lock. The 3D star itself is shaken by `reactConnectionBoard`.
 */
function constellationStampWrong(answerId, starId) {
    const answer = document.querySelector(`[data-answer-card="${cssEscapeAttr(answerId)}"]`);
    if (answer) answer.classList.add('is-wrong');
    const star = document.querySelector(`[data-star-card="${cssEscapeAttr(starId)}"]`)
        || document.querySelector(`[data-question-card="${cssEscapeAttr(starId)}"]`);
    if (star) star.classList.add('is-wrong');
    const mark = document.querySelector(`[data-question-mark="${cssEscapeAttr(starId)}"]`);
    if (mark) mark.classList.add('is-wrong');
}

/**
 * Show ONE attempt's result on the board, for every input path.
 *
 * The feedback line is the matching board's (one scoring path), but it says only
 * "✕ Chưa đúng — thử lại." — it never names the pair, so the class cannot tell
 * what was wrong from the back row. Here the line is rewritten with the two texts
 * the student just put together, and a wrong drop paints the STAMPED card and the
 * star it missed red for the 550 ms the board is locked (#219).
 */
function constellationAnnounceAttempt(answerId, starId, attempt) {
    const { outcome } = attempt;
    const game = state.currentGame;
    if (!game || !isConnectionBoard(game)) return;
    const template = connectionTemplateFor(game);
    const direction = constellationDirectionFor(game);
    const pair = game.matchingGame.pairs.find(item => item.id === answerId);
    const sides = pair ? constellationPairSides(pair, direction) : { starText: '', cardText: '' };
    const starPair = constellationPairForStar(game, template, starId);
    const starSides = starPair ? constellationPairSides(starPair, direction) : { starText: '', cardText: '' };
    if (outcome === 'correct') {
        matchingFeedback('good', `✓ Ghép chính xác! “${connectionEsc(starSides.starText)}” → “${connectionEsc(sides.cardText)}”`);
        return;
    }
    if (outcome !== 'wrong') return;
    const m = game.matchingGame;
    const penalty = m.practiceMode ? ' · luyện tập: không trừ điểm'
        : (Number(m.wrongPenalty) > 0 ? ` · −${Number(m.wrongPenalty)} điểm` : ' · không trừ điểm');
    matchingFeedback('bad', `✕ Chưa đúng: “${connectionEsc(sides.cardText)}” không thuộc sao “${connectionEsc(starSides.starText)}”${penalty}`);
    constellationStampWrong(answerId, starId);
    // Tap and keyboard have no flight to wait for; the stamp still has to live
    // through the lock before the board repaints it away.
    constellationAfterLock(() => {});
}

/**
 * A stand-in element that carries ONE attempt to the matching board.
 *
 * `evaluateColumnMatchWith` flags `.wrong`/`.matched` on the elements it is
 * given and reads `data-pair` from both — and only these stand-ins may carry the
 * DROPPED star's id, never the real card. Stamping the card would change which
 * pair it answers for on the next attempt. Being off-DOM, the flags are a no-op.
 */
function constellationProxyElement(side, pairId, pairIndex) {
    const el = document.createElement('button');
    el.className = 'constellation-proxy';
    el.dataset.pair = pairId;
    el.dataset.matchSide = side;
    if (pairIndex >= 0) el.dataset.pairIndex = String(pairIndex);
    return el;
}

// ---------- input ----------
//
// Three ways to answer, all ending in `placeOnStar`:
//   • drag the card: HTML5 drag from the tray, a floating copy follows the
//     pointer, the star under it lights up, the drop resolves;
//   • tap: a card selects, a star places it (the card stays selected between);
//   • keyboard: every card and every star is a button, Enter/Space works.
// No path depends on drag succeeding, and no path is a second scoring route.

function bindConstellationSurface(root) {
    const scope = root || document;
    const panel = scope.querySelector('[data-constellation-panel]');
    if (!panel) return;
    const scene = scope.querySelector('[data-constellation-scene]');
    if (!scene) return;

    const selectCard = (card) => {
        document.querySelectorAll('[data-answer-card].is-selected').forEach(el => el.classList.remove('is-selected'));
        if (card) card.classList.add('is-selected');
        state.constellationSelected = card ? card.dataset.answerCard : null;
        scene.classList.toggle('is-armed', Boolean(state.constellationSelected));
        scope.querySelectorAll('[data-star-card],[data-question-card]').forEach(el => el.classList.toggle('is-target', Boolean(state.constellationSelected)));
    };
    // A selection belongs to one board, not to the tray element that was in it.
    state.constellationSelected = null;
    state.constellationDragging = null;

    const starOf = (target) => {
        const el = target && target.closest ? target.closest('[data-star-card],[data-question-card]') : null;
        if (!el) return '';
        return el.dataset.starCard || el.dataset.questionCard || '';
    };

    // --- click (tap-to-place) ---
    panel.addEventListener('click', (event) => {
        const target = event.target;
        if (!target || !target.closest) return;
        const card = target.closest('[data-answer-card]');
        if (card) {
            event.stopPropagation();
            if (state.matchingPlay && state.matchingPlay.lock) return;
            selectCard(card.classList.contains('is-selected') ? null : card);
            return;
        }
        const star = starOf(target);
        if (star && state.constellationSelected) {
            const answerId = state.constellationSelected;
            selectCard(null);
            constellationAnnounceAttempt(answerId, star, placeOnStar(answerId, star));
        }
    });

    // --- keyboard: Enter/Space on a star places the selected card ---
    panel.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        const star = starOf(event.target);
        if (!star || !state.constellationSelected) return;
        event.preventDefault();
        const answerId = state.constellationSelected;
        selectCard(null);
        constellationAnnounceAttempt(answerId, star, placeOnStar(answerId, star));
    });

    // --- drag: only the tray cards are draggable ---
    const tray = scope.querySelector(constellationTrayCards);
    if (tray) {
        tray.addEventListener('dragstart', (event) => {
            const card = event.target && event.target.closest ? event.target.closest('[data-answer-card]') : null;
            if (!card) return;
            const answerId = card.dataset.answerCard;
            event.dataTransfer.effectAllowed = 'move';
            try {
                event.dataTransfer.setData('text/plain', answerId);
                event.dataTransfer.setData(CONSTELLATION_DRAG_TYPE, answerId);
                // A drag image of the card itself, so the hand carries the text.
                event.dataTransfer.setDragImage(card, card.offsetWidth / 2, card.offsetHeight / 2);
            } catch (err) { /* older engines refuse a custom type; text/plain is enough */ }
            state.constellationDragging = answerId;
            state.drag = {
                answerId,
                card,
                startRect: card.getBoundingClientRect(),
                over: '',
                arrived: false
            };
            card.classList.add('is-dragging');
            scene.classList.add('is-armed');
            if (threeStageHandle && window.threeGame && window.threeGame.dragStart) window.threeGame.dragStart(threeStageHandle);
        });
        tray.addEventListener('dragend', () => endConstellationDrag());
    }
    document.addEventListener('dragend', endConstellationDrag);

function endConstellationDrag() {
        const drag = state.drag;
        if (threeStageHandle && window.threeGame && window.threeGame.dragEnd) window.threeGame.dragEnd(threeStageHandle);
        if (drag) {
            if (drag.arrived) {
                // The card is in flight to its star: leave the element to the
                // flight (it resolves when it lands), so nothing is reset mid-air.
                scene.classList.remove('is-armed');
                return;
            }
            if (!drag.arrived) {
                // A cancelled drag returns the card to its slot; the wrong-answer
                // shake is the matching board's job, not a second animation here.
                drag.card.classList.remove('is-dragging', 'is-flying');
                drag.card.style.removeProperty('transform');
                drag.card.style.removeProperty('opacity');
            }
            drag.card.classList.remove('is-dragging');
        }
        scene.classList.remove('is-armed');
        scope.querySelectorAll('[data-star-card].is-target, [data-question-card].is-target').forEach(el => el.classList.remove('is-target'));
        state.drag = null;
        state.constellationDragging = null;
        window.requestAnimationFrame(() => constellationClearHotspot());
    }

    // The PICTURE FRAME is the drop surface: it is the box the stars live in, and
    // the canvas behind it also spans the parts of the stage this board hides.
    scene.addEventListener('dragover', (event) => {
        if (!state.drag) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        const star = starAtPoint(event.clientX, event.clientY);
        if (star === state.drag.over) return;
        state.drag.over = star;
        constellationMarkHotspot(star);
    });
    scene.addEventListener('drop', (event) => {
        if (!state.drag) return;
        event.preventDefault();
        const star = starAtPoint(event.clientX, event.clientY) || state.drag.over;
        if (!star) {
            // Dropped on empty sky: no score, no shake, the card goes home.
            endConstellationDrag();
            return;
        }
        // `dragend` follows the drop immediately and clears `state.drag`, so the
        // flight owns its own record of the attempt and resolves against that.
        const attempt = state.drag;
        attempt.arrived = true;
        constellationFlyAndResolve(attempt, star);
    });
    // Leaving the frame clears the highlight; the whole frame is the drop area,
    // so there is nothing else to reset.
    scene.addEventListener('dragleave', () => {
        if (!state.drag) return;
        state.drag.over = '';
        constellationMarkHotspot('');
    });
}

/** The star currently under a dragged card, marked on the scene and in 3D. */
function constellationMarkHotspot(starId) {
    document.querySelectorAll('[data-star-card].is-hot, [data-question-card].is-hot, [data-question-mark].is-hot')
        .forEach(el => el.classList.remove('is-hot'));
    const world = threeWorld;
    if (world && world.kind === 'connection' && world.graph && window.threeGame && threeStageHandle) {
        if (typeof world.graph.setHot === 'function') world.graph.setHot(threeStageHandle, starId);
    }
    if (!starId) return;
    const escaped = cssEscapeAttr(starId);
    // Either half of the question layer: a long side is a ROW card, and the class
    // needs to see which one the hand is aiming at, not only which star lit up.
    // The star's own number lights with it, so the eye can travel from the sky to
    // the band and back.
    const card = document.querySelector(`[data-star-card="${escaped}"]`)
        || document.querySelector(`[data-question-card="${escaped}"]`);
    if (card) card.classList.add('is-hot');
    const mark = document.querySelector(`[data-question-mark="${escaped}"]`);
    if (mark) mark.classList.add('is-hot');
}
function constellationClearHotspot() {
    constellationMarkHotspot('');
}

/**
 * Fly the card to its star, then resolve.
 *
 * The card itself leaves the tray and travels (a clone would leave a hole behind
 * it in a row whose layout matters), and the answer is scored when it lands. The
 * trip is short on purpose (~0.3 s): long enough to read as "this went there",
 * short enough that a projector lesson does not wait for it.
 */
function constellationFlyAndResolve(drag, starId) {
    const card = drag.card;
    const points = updateConnectionStarPoints();
    const target = points[starId];
    const start = drag.startRect;
    const answerId = drag.answerId;
    const finish = () => {
        if (card.isConnected) {
            card.classList.remove('is-flying', 'is-dragging');
            card.style.removeProperty('transform');
            card.style.removeProperty('opacity');
        }
        const outcome = placeOnStar(answerId, starId);
        if (state.drag === drag) state.drag = null;
        // `constellationAnnounceAttempt` ends a wrong attempt with the repaint
        // that returns the card to its slot, once the lock is over.
        constellationAnnounceAttempt(answerId, starId, outcome);
        if (outcome.outcome === 'correct') sendPresentationState();
    };
    if (!target || !start || !card.isConnected || typeof card.animate !== 'function') {
        finish();
        return;
    }
    card.classList.add('is-flying');
    const cx = start.left + start.width / 2;
    const cy = start.top + start.height / 2;
    const dx = target.x - cx;
    const dy = target.y - cy - 24;
    const animation = card.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 18}px) scale(0.82)`, opacity: 0.95, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.5)`, opacity: 0.6 }
    ], { duration: 300, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
    state.drag.animation = animation;
    let done = false;
    const settle = () => {
        if (done) return;
        done = true;
        finish();
    };
    animation.onfinish = settle;
    // A hidden window freezes animations; the answer must not wait for a frame
    // that never comes, so the flight also has a wall-clock deadline.
    window.setTimeout(settle, 380);
}

/** Tell the teacher the machine cannot run the scene, and what still works. */
function constellationNoWebglHtml() {
    return `<div class="constellation-no3d-inner">
      <strong>Máy này không chạy được cảnh chòm sao 3D</strong>
      <span>Cảnh đang dùng hình chòm sao tĩnh. Bài vẫn chơi được như bình thường.</span>
      <button type="button" class="btn btn-secondary constellation-switch-columns">Chuyển sang Ghép hai cột cho buổi này</button>
    </div>`;
}

/**
 * The "no WebGL" choice. It switches THIS PLAYING to the two-column board and
 * never touches the saved game: the teacher can finish the lesson, and tomorrow
 * the same game is a constellation again on a machine that can draw it.
 */
function switchConstellationToColumns(btn) {
    const game = state.currentGame;
    if (!game || !game.matchingGame) return;
    game.matchingGame.__savedMode = game.matchingGame.__savedMode || game.matchingGame.mode;
    game.matchingGame.mode = 'columns';
    resetMatchingPlay();
    if (btn) btn.blur();
}

/**
 * Reframe and re-anchor after mount, resize or a replay.
 *
 * Synchronous, plus a short timer for the layout pass that happens one frame
 * after the modal reaches its final height — both on `connectionLater`, so
 * `unmountThreeStage()` cancels them and a closed game cannot repaint.
 */
function refreshConstellationBoard(options = {}) {
    if (!isConnectionBoard(state.currentGame)) return;
    frameConnectionBoard();
    updateStarAnchors();
    if (threeStageHandle && window.threeGame && typeof window.threeGame.refreshAnchors === 'function') {
        window.threeGame.refreshAnchors(threeStageHandle);
    }
    paintConstellationSurface(document, options);
}

/** Re-frame on resize; the listener dies with `unmountThreeStage()`. */
function watchConstellationResize() {
    if (!threeWorld || threeWorld.kind !== 'connection') return;
    if (threeWorld.constellationResize) return;
    threeWorld.constellationResize = () => {
        if (!threeWorld || threeWorld.kind !== 'connection') return;
        frameConnectionBoard();
        updateStarAnchors();
        // A resize can change which cards fit beside their stars; the moved ones
        // are remembered on the template, so this settles in one pass.
        paintConstellationSurface(document, { restructure: true });
    };
    window.addEventListener('resize', threeWorld.constellationResize);
}
