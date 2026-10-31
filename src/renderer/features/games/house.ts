// @ts-nocheck -- House Building Mode: economy UI, 4 models, placement and reactions (split from features/gameplay.ts, DECISIONS #147).
// ---------- House Building Mode (DECISIONS #140, revised #141) ----------
// Quiz-only alternate mode: the house starts with only its foundation. Each correct
// answer adds one cube-built part; each wrong answer removes one (never below the
// foundation). Scoring stays in game-engine/runtime.ts. Classic mode (the default,
// and the only mode for the other four games) is untouched.
function isHouseMode(game) {
    const g = game || state.currentGame;
    return Boolean(g && g.template === 'quiz' && g.gameSetup && g.gameSetup.gameplayMode === 'house');
}
function houseState() {
    return state.houseBuild || houseCreate();
}
function houseProgressHtml() {
    const max = houseTargetParts(state.currentGame);
    const sum = houseSummary(houseState(), max);
    const pct = max ? Math.round(sum.parts / max * 100) : 0;
    const hint = sum.completed ? 'Ngôi nhà đã hoàn thiện! 🎉' : `Còn ${sum.remaining} phần nữa để hoàn thiện`;
    return `<div class="house-progress"><div class="house-progress-head"><span class="house-progress-title">🏗️ CHẾ ĐỘ XÂY NHÀ</span><span class="house-count">Đã xây <b>${sum.parts}</b>/${max} phần</span></div><div class="house-bar"><div class="house-bar-fill" data-progress="${pct}"></div></div><div class="house-materials">${hint}</div></div>`;
}
// The answer changes the part count and the 3D house immediately; refresh the
// panel in place so the counter and the bar move on the same beat (the panel is
// otherwise only rebuilt by renderQuestion on the next question).
function paintHouseProgress() {
    const panel = $('.house-progress');
    if (!panel)
        return;
    const max = houseTargetParts(state.currentGame);
    const sum = houseSummary(houseState(), max);
    const pct = max ? Math.round(sum.parts / max * 100) : 0;
    const count = $('.house-count', panel);
    if (count)
        count.innerHTML = `Đã xây <b>${sum.parts}</b>/${max} phần`;
    const fill = $('.house-bar-fill', panel);
    if (fill)
        fill.dataset.progress = String(pct);
    const hint = $('.house-materials', panel);
    if (hint)
        hint.textContent = sum.completed ? 'Ngôi nhà đã hoàn thiện! 🎉' : `Còn ${sum.remaining} phần nữa để hoàn thiện`;
    paintProgress(panel);
}
// The house is built from cubes (blocky, "stacked blocks") plus a big front door,
// two windows and a little decoration (tree, bush, path). Stage 0 is the foundation
// and is always visible — the "partially built" starting point. The eight buildable
// stages are added one at a time on a correct answer and removed one at a time on a
// wrong answer. How many parts a game needs is `houseTargetParts()` (the question
// count, capped at these eight stages), and `houseVisualStages()` maps a part back
// to the stage index, so a short quiz still reaches the full model (DECISIONS #143).
//
// Every style in `houseParts(style)` keeps that same nine-stage layout so the
// economy and the target mapping are style-independent; only the block model
// changes (DECISIONS #144). `houseStyleFor()` picks the model.
function houseRing(y, color, cube = 0.7, spread = 1.05) {
    const specs = [];
    const xs = [-spread, -spread / 3, spread / 3, spread];
    xs.forEach(x => {
        specs.push({ kind: 'box', w: cube, h: cube, d: cube, color, x, y, z: -cube });
        specs.push({ kind: 'box', w: cube, h: cube, d: cube, color, x, y, z: cube });
    });
    [-spread, spread].forEach(x => {
        specs.push({ kind: 'box', w: cube, h: cube, d: cube, color, x, y, z: 0 });
    });
    return specs;
}
function houseStyleForCurrentGame() {
    const game = state.currentGame;
    return houseStyleFor(game && game.gameSetup ? game.gameSetup.houseStyle : '', game && game.id);
}
// Classic: warm plaster walls, red blocky roof, brick chimney, a tree and a path.
function houseClassicParts() {
    return [
        // 0 — foundation (always present)
        [
            { kind: 'box', w: 3.1, h: 0.2, d: 2.3, color: 0x8d99ae, x: 0, y: 0.1, z: 0 }
        ],
        // 1 — bottom cube ring
        houseRing(0.55, 0xd4a373),
        // 2 — big front door
        [
            { kind: 'box', w: 0.72, h: 1.2, d: 0.16, color: 0x6b4f3a, x: 0, y: 0.8, z: 1.08 },
            { kind: 'box', w: 0.16, h: 0.16, d: 0.08, color: 0xe0b070, x: 0.22, y: 0.68, z: 1.14 }
        ],
        // 3 — second cube ring
        houseRing(1.25, 0xd4a373),
        // 4 — two windows
        [
            { kind: 'box', w: 0.5, h: 0.5, d: 0.12, color: 0xa8dadc, x: -0.6, y: 1.25, z: 1.08 },
            { kind: 'box', w: 0.5, h: 0.5, d: 0.12, color: 0xa8dadc, x: 0.6, y: 1.25, z: 1.08 }
        ],
        // 5 — third cube ring
        houseRing(1.95, 0xe6b98a),
        // 6 — blocky roof
        [
            { kind: 'box', w: 3.05, h: 0.24, d: 2.35, color: 0xc05c48, x: 0, y: 2.42, z: 0 },
            { kind: 'box', w: 2.1, h: 0.24, d: 1.5, color: 0xc05c48, x: 0, y: 2.66, z: 0 }
        ],
        // 7 — chimney
        [
            { kind: 'box', w: 0.42, h: 0.7, d: 0.42, color: 0x8d5524, x: 0.8, y: 2.75, z: -0.4 }
        ],
        // 8 — decoration: tree, bush, path
        [
            { kind: 'box', w: 0.16, h: 0.6, d: 0.16, color: 0x7f5539, x: -1.95, y: 0.4, z: 0.5 },
            { kind: 'box', w: 0.7, h: 0.7, d: 0.7, color: 0x6a994e, x: -1.95, y: 1.0, z: 0.5 },
            { kind: 'box', w: 0.42, h: 0.42, d: 0.42, color: 0x8ab17d, x: 1.75, y: 0.35, z: 0.6 },
            { kind: 'box', w: 0.9, h: 0.06, d: 0.5, color: 0xb08968, x: 0, y: 0.23, z: 1.5 }
        ]
    ];
}
// Garden cottage: cream walls, green roof, veranda and a picket fence.
function houseGardenParts() {
    const wall = 0xf2e6cc, wallLight = 0xf7efd8, green = 0x4f8a5b;
    return [
        // 0 — mossy garden foundation
        [
            { kind: 'box', w: 3.5, h: 0.2, d: 2.6, color: 0x8fae9b, x: 0, y: 0.1, z: 0 }
        ],
        // 1 — ground floor
        houseRing(0.52, wall, 0.64, 0.95),
        // 2 — teal door with a step
        [
            { kind: 'box', w: 0.64, h: 1.1, d: 0.14, color: 0x2f7d6d, x: -0.18, y: 0.74, z: 1.02 },
            { kind: 'box', w: 0.14, h: 0.14, d: 0.08, color: 0xe0b070, x: 0.06, y: 0.62, z: 1.1 },
            { kind: 'box', w: 0.9, h: 0.08, d: 0.34, color: 0xc9b99a, x: -0.18, y: 0.16, z: 1.2 }
        ],
        // 3 — upper floor
        houseRing(1.16, wallLight, 0.64, 0.95),
        // 4 — windows with green shutters
        [
            { kind: 'box', w: 0.46, h: 0.46, d: 0.12, color: 0xa8dadc, x: -0.52, y: 1.18, z: 1.02 },
            { kind: 'box', w: 0.46, h: 0.46, d: 0.12, color: 0xa8dadc, x: 0.52, y: 1.18, z: 1.02 },
            { kind: 'box', w: 0.1, h: 0.5, d: 0.1, color: green, x: -0.83, y: 1.18, z: 1.02 },
            { kind: 'box', w: 0.1, h: 0.5, d: 0.1, color: green, x: 0.83, y: 1.18, z: 1.02 }
        ],
        // 5 — veranda canopy on two posts
        [
            { kind: 'box', w: 2.1, h: 0.14, d: 0.92, color: green, x: 0, y: 1.66, z: 1.1 },
            { kind: 'box', w: 0.12, h: 0.92, d: 0.12, color: 0xe6dcc3, x: -0.88, y: 1.08, z: 1.42 },
            { kind: 'box', w: 0.12, h: 0.92, d: 0.12, color: 0xe6dcc3, x: 0.88, y: 1.08, z: 1.42 }
        ],
        // 6 — green roof, two blocky layers
        [
            { kind: 'box', w: 3.0, h: 0.24, d: 2.15, color: green, x: 0, y: 1.78, z: 0 },
            { kind: 'box', w: 1.95, h: 0.24, d: 1.45, color: 0x3f6b4a, x: 0, y: 2.02, z: 0 }
        ],
        // 7 — dormer window on the roof
        [
            { kind: 'box', w: 0.72, h: 0.5, d: 0.55, color: wallLight, x: 0.32, y: 2.16, z: 0.1 },
            { kind: 'box', w: 0.95, h: 0.14, d: 0.8, color: 0x3f6b4a, x: 0.32, y: 2.47, z: 0.1 }
        ],
        // 8 — picket fence, flowers, bush and a stone path
        [
            { kind: 'box', w: 0.08, h: 0.5, d: 0.08, color: wall, x: -2.0, y: 0.33, z: 0.9 },
            { kind: 'box', w: 0.08, h: 0.5, d: 0.08, color: wall, x: -1.7, y: 0.33, z: 1.1 },
            { kind: 'box', w: 0.08, h: 0.5, d: 0.08, color: wall, x: 1.7, y: 0.33, z: 1.1 },
            { kind: 'box', w: 0.08, h: 0.5, d: 0.08, color: wall, x: 2.0, y: 0.33, z: 0.9 },
            { kind: 'box', w: 0.18, h: 0.18, d: 0.18, color: 0xe4572e, x: -1.55, y: 0.28, z: 0.6 },
            { kind: 'box', w: 0.18, h: 0.18, d: 0.18, color: 0xe8b23a, x: -1.25, y: 0.25, z: 0.55 },
            { kind: 'box', w: 0.5, h: 0.4, d: 0.5, color: 0x6a994e, x: 1.45, y: 0.35, z: 0.55 },
            { kind: 'box', w: 0.9, h: 0.06, d: 0.5, color: 0xb08968, x: -0.18, y: 0.21, z: 1.7 }
        ]
    ];
}
// Watchtower: a narrow stone shaft, widened lookout ring, slate spire and a flag.
function houseTowerParts() {
    const stone = 0xa8b0ba, stoneDark = 0x98a2ae;
    return [
        // 0 — stone base
        [
            { kind: 'box', w: 3.0, h: 0.24, d: 2.2, color: 0x7c8794, x: 0, y: 0.12, z: 0 }
        ],
        // 1 — lower shaft
        houseRing(0.5, stone, 0.58, 0.66),
        // 2 — heavy door with lintel
        [
            { kind: 'box', w: 0.6, h: 1.02, d: 0.14, color: 0x5a4630, x: 0, y: 0.66, z: 0.72 },
            { kind: 'box', w: 0.16, h: 0.16, d: 0.08, color: 0xc9a227, x: 0.18, y: 0.6, z: 0.79 },
            { kind: 'box', w: 0.84, h: 0.14, d: 0.2, color: 0x6f7b87, x: 0, y: 1.22, z: 0.72 }
        ],
        // 3 — middle shaft
        houseRing(1.02, stoneDark, 0.58, 0.66),
        // 4 — arrow slits
        [
            { kind: 'box', w: 0.14, h: 0.42, d: 0.1, color: 0x2c3440, x: -0.38, y: 1.02, z: 0.72 },
            { kind: 'box', w: 0.14, h: 0.42, d: 0.1, color: 0x2c3440, x: 0.38, y: 1.02, z: 0.72 }
        ],
        // 5 — lookout ring, wider than the shaft
        houseRing(1.58, 0x8d98a5, 0.58, 0.95),
        // 6 — slate spire, shrinking block layers
        [
            { kind: 'box', w: 2.7, h: 0.18, d: 2.0, color: 0x4a6fa5, x: 0, y: 1.94, z: 0 },
            { kind: 'box', w: 2.0, h: 0.18, d: 1.45, color: 0x4a6fa5, x: 0, y: 2.12, z: 0 },
            { kind: 'box', w: 1.25, h: 0.18, d: 0.9, color: 0x3f5f8c, x: 0, y: 2.3, z: 0 },
            { kind: 'box', w: 0.5, h: 0.2, d: 0.4, color: 0x3f5f8c, x: 0, y: 2.49, z: 0 }
        ],
        // 7 — flag pole and pennant
        [
            { kind: 'box', w: 0.07, h: 0.55, d: 0.07, color: 0x5b6472, x: 0, y: 2.85, z: 0 },
            { kind: 'box', w: 0.48, h: 0.28, d: 0.06, color: 0xe4572e, x: 0.27, y: 3.0, z: 0 }
        ],
        // 8 — rocks and a pine
        [
            { kind: 'box', w: 0.55, h: 0.3, d: 0.55, color: 0x8a8f98, x: -1.25, y: 0.27, z: 0.55 },
            { kind: 'box', w: 0.35, h: 0.3, d: 0.35, color: 0x9aa0a8, x: -1.62, y: 0.27, z: 0.85 },
            { kind: 'box', w: 0.14, h: 0.5, d: 0.14, color: 0x7f5539, x: 1.3, y: 0.37, z: 0.5 },
            { kind: 'box', w: 0.6, h: 0.5, d: 0.6, color: 0x3f6b4a, x: 1.3, y: 0.85, z: 0.5 },
            { kind: 'box', w: 0.4, h: 0.4, d: 0.4, color: 0x4f8a5b, x: 1.3, y: 1.3, z: 0.5 }
        ]
    ];
}
// Log cabin: stacked log rings, warm windows with bars, dark green roof, pines.
function houseCabinParts() {
    const log = 0x8b5a2b, logLight = 0x9c6b3a, logTop = 0xa4713f;
    return [
        // 0 — stone footing
        [
            { kind: 'box', w: 3.2, h: 0.2, d: 2.4, color: 0x8b8d8a, x: 0, y: 0.1, z: 0 }
        ],
        // 1 — lower logs
        houseRing(0.55, logLight, 0.72, 1.05),
        // 2 — plank door with a threshold
        [
            { kind: 'box', w: 0.78, h: 1.2, d: 0.16, color: 0x5a3a22, x: 0, y: 0.82, z: 1.1 },
            { kind: 'box', w: 0.12, h: 0.12, d: 0.08, color: 0xc9a227, x: 0.24, y: 0.7, z: 1.18 },
            { kind: 'box', w: 1.0, h: 0.08, d: 0.3, color: 0x6f6f6b, x: 0, y: 0.16, z: 1.25 }
        ],
        // 3 — middle logs
        houseRing(1.3, log, 0.72, 1.05),
        // 4 — warm windows with cross bars
        [
            { kind: 'box', w: 0.5, h: 0.5, d: 0.12, color: 0xffd27f, x: -0.62, y: 1.3, z: 1.1 },
            { kind: 'box', w: 0.5, h: 0.5, d: 0.12, color: 0xffd27f, x: 0.62, y: 1.3, z: 1.1 },
            { kind: 'box', w: 0.06, h: 0.52, d: 0.14, color: 0x5a3a22, x: -0.62, y: 1.3, z: 1.12 },
            { kind: 'box', w: 0.52, h: 0.06, d: 0.14, color: 0x5a3a22, x: -0.62, y: 1.3, z: 1.12 },
            { kind: 'box', w: 0.06, h: 0.52, d: 0.14, color: 0x5a3a22, x: 0.62, y: 1.3, z: 1.12 },
            { kind: 'box', w: 0.52, h: 0.06, d: 0.14, color: 0x5a3a22, x: 0.62, y: 1.3, z: 1.12 }
        ],
        // 5 — top logs
        houseRing(2.05, logTop, 0.72, 1.05),
        // 6 — deep green roof
        [
            { kind: 'box', w: 3.15, h: 0.24, d: 2.4, color: 0x3f6b4a, x: 0, y: 2.53, z: 0 },
            { kind: 'box', w: 2.15, h: 0.24, d: 1.55, color: 0x355a3e, x: 0, y: 2.77, z: 0 }
        ],
        // 7 — stone chimney
        [
            { kind: 'box', w: 0.5, h: 0.7, d: 0.5, color: 0x7d7d7d, x: 0.9, y: 2.8, z: -0.45 }
        ],
        // 8 — pines, firewood and a trail
        [
            { kind: 'box', w: 0.16, h: 0.55, d: 0.16, color: 0x7f5539, x: -1.95, y: 0.38, z: 0.4 },
            { kind: 'box', w: 0.66, h: 0.55, d: 0.66, color: 0x355a3e, x: -1.95, y: 0.93, z: 0.4 },
            { kind: 'box', w: 0.44, h: 0.44, d: 0.44, color: 0x4f8a5b, x: -1.95, y: 1.42, z: 0.4 },
            { kind: 'box', w: 0.7, h: 0.3, d: 0.4, color: 0x6b4a2b, x: 1.75, y: 0.3, z: 0.55 },
            { kind: 'box', w: 0.9, h: 0.06, d: 0.5, color: 0xb08968, x: 0, y: 0.21, z: 1.6 }
        ]
    ];
}
function houseParts(style) {
    const id = houseStyleFor(style, '');
    if (id === 'nha-vuon') return houseGardenParts();
    if (id === 'thap-canh') return houseTowerParts();
    if (id === 'nha-go') return houseCabinParts();
    return houseClassicParts();
}
function houseMaxParts() {
    return houseParts().length - 1;
}
// How many buildable parts this game must earn. One per question, so a quiz of
// five questions is a five-part house and all-correct still finishes it; longer
// quizzes stop at the visual maximum (eight) and complete once eight net parts
// are standing (DECISIONS #143).
function houseTargetParts(game) {
    const questions = game && Array.isArray(game.questions) ? game.questions.length : 0;
    return Math.max(1, Math.min(houseMaxParts(), questions || 1));
}
// A part can cover more than one visual stage on a short quiz (five questions over
// eight stages), so the full model still appears exactly when the last part lands.
// Ceil keeps the reveal monotonic and front-loaded: the first correct answer always
// changes the house.
function houseVisualStages(parts, target) {
    const max = houseMaxParts();
    const t = Math.max(1, Math.min(max, Math.round(Number(target) || 0)));
    const p = Math.max(0, Math.min(t, Math.round(Number(parts) || 0)));
    return Math.ceil(max * p / t);
}
// Measured envelope of each model (width × height in world units). Placement sizes
// the house from the pixel box it has to fill, so the envelope must follow the
// style: the tower is narrow and tall, the cottage is low and wide (#144).
const HOUSE_BOUNDS = {
    'nha-mai-do': { w: 4.3, h: 3.2 },
    'nha-vuon': { w: 4.1, h: 2.7 },
    'thap-canh': { w: 3.5, h: 3.2 },
    'nha-go': { w: 4.4, h: 3.2 }
};
const HOUSE_SLOT_FILL = 0.92;
function houseBounds(style) {
    return HOUSE_BOUNDS[style] || HOUSE_BOUNDS['nha-mai-do'];
}
// The house is ~2.3 units deep and the camera is close, so its near corners
// project well outside the plane the target is centred on. Filling the whole
// band made the roof reach the HUD and the base slide under the banner
// (measured 1600x1000); 0.78 keeps ~10px of air on both sides.
const HOUSE_SHOWCASE_FILL = 0.78;
// The result hero has a caption directly under its slot, and garden props make the
// measured box asymmetric, so the house needs more air there than the invisible
// answer-phase slot does (#144).
const HOUSE_RESULT_FILL = 0.8;
// Screen-space target for the 3D house. The WebGL canvas covers the whole
// stage, so the only reliable way to line the house up with the DOM is to
// project the reserved slot (answer phase) or the stage centre (showcase)
// through the camera. DECISIONS #142.
function houseTarget() {
    if (!threeStageHandle || !window.threeGame || !window.threeGame.stagePoint)
        return null;
    const stage = threeStageHandle.container.getBoundingClientRect();
    if (!stage.width || !stage.height)
        return null;
    const showcase = Boolean($('.game-stage.is-house-showcase'));
    let fx, fy, widthPx, heightPx, fill;
    if (showcase) {
        // Fit the house into the band the stage actually leaves free: below the
        // score/progress HUD and above the feedback card. A long explanation
        // raises the card, and the house shrinks instead of hiding under it.
        // Measured after `.is-house-showcase` lands, so the card is already
        // anchored to the bottom.
        const hud = $('.house-progress') || $('.stage-progress') || $('.stage-top');
        const hudBox = hud ? hud.getBoundingClientRect() : null;
        const feedback = $('#answerFeedback');
        const feedbackBox = feedback ? feedback.getBoundingClientRect() : null;
        const top = hudBox && hudBox.height ? hudBox.bottom + 4 : stage.top + stage.height * 0.16;
        const bottom = feedbackBox && feedbackBox.height ? feedbackBox.top - 4 : stage.top + stage.height * 0.9;
        const bandTop = (top - stage.top) / stage.height;
        const bandBottom = (bottom - stage.top) / stage.height;
        // Never trade the measured band for a prettier guess: on short windows
        // that put the house behind the HUD or the banner. A degenerate band
        // means the card has not laid out yet; leave the house in its slot.
        if (!(bandBottom - bandTop > 0.02))
            return null;
        fx = 0.5;
        fy = (bandTop + bandBottom) / 2;
        widthPx = stage.width * 0.9;
        heightPx = (bandBottom - bandTop) * stage.height;
        fill = HOUSE_SHOWCASE_FILL;
    }
    else {
        const slot = $('.game-stage .house-stage-slot');
        if (!slot)
            return null;
        const box = slot.getBoundingClientRect();
        if (!box.width || !box.height)
            return null;
        fx = (box.left + box.width / 2 - stage.left) / stage.width;
        fy = (box.top + box.height / 2 - stage.top) / stage.height;
        widthPx = box.width;
        heightPx = box.height;
        fill = $('.result-house-hero') ? HOUSE_RESULT_FILL : HOUSE_SLOT_FILL;
    }
    const point = window.threeGame.stagePoint(threeStageHandle, fx, fy, 0);
    if (!point.pxPerUnit)
        return null;
    const bounds = (threeWorld && threeWorld.bounds) || houseBounds('nha-mai-do');
    const scale = Math.min(heightPx * fill / (bounds.h * point.pxPerUnit), widthPx * 0.92 / (bounds.w * point.pxPerUnit));
    // Part coordinates start at the ground (the foundation slab), so the group
    // origin is the house's base, not its centre. Drop the base half a house so
    // the box straddles the target instead of growing up into the stage header.
    point.y -= bounds.h / 2 * scale;
    return { point, scale };
}
function placeHouse(animate) {
    const world = threeWorld;
    const handle = threeStageHandle;
    if (!world || !world.construction || !handle || !window.threeGame)
        return;
    const target = houseTarget();
    if (!target)
        return;
    const group = world.construction.group;
    if (!animate) {
        group.position.set(target.point.x, target.point.y, target.point.z);
        group.scale.setScalar(target.scale);
        return;
    }
    const from = { x: group.position.x, y: group.position.y, scale: group.scale.x };
    window.threeGame.tween(handle, {
        from: 0,
        to: 1,
        duration: 0.55,
        ease: 'easeOutCubic',
        apply: (v) => {
            // A remount while the tween runs must not move the new world's house.
            if (threeWorld !== world || threeStageHandle !== handle)
                return;
            group.position.set(from.x + (target.point.x - from.x) * v, from.y + (target.point.y - from.y) * v, target.point.z);
            group.scale.setScalar(from.scale + (target.scale - from.scale) * v);
        }
    });
}
let houseRelayoutBound = false;
function buildHouseWorld() {
    if (!threeStageHandle || !window.threeGame)
        return;
    const world = {};
    const style = houseStyleForCurrentGame();
    const construction = window.threeGame.makeConstruction({ parts: houseParts(style) });
    window.threeGame.addObject(threeStageHandle, construction.group, 0, -0.6, -1.2);
    const target = houseTargetParts(state.currentGame);
    const parts = houseSummary(houseState(), target).parts;
    // On the very first question, pop the foundation in as a short introduction.
    const intro = state.gameAnswers.length === 0;
    construction.setStage(threeStageHandle, 1 + houseVisualStages(parts, target), { animate: intro });
    world.construction = construction;
    world.style = style;
    world.bounds = houseBounds(style);
    threeWorld = world;
    // The canvas is still 1x1 until step() runs, so the camera aspect is not
    // final this tick; place on the next two frames instead.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (threeWorld === world)
            placeHouse(false);
    }));
    if (!houseRelayoutBound) {
        houseRelayoutBound = true;
        window.addEventListener('resize', () => {
            if (!threeWorld || !threeWorld.construction)
                return;
            // Fullscreen/projector toggles change the visible band too.
            if ($('.game-stage.is-house-showcase'))
                pinShowcaseStage();
            placeHouse(false);
        });
    }
}
// Height the play surface actually shows from the top of the stage to the
// bottom of the modal/window. Hiding the question collapses a content-sized
// stage and the feedback card then stretches it past the viewport (measured
// 957px stage vs 950px modal bottom at 1600x1000), so the showcase freezes the
// stage to the visible area instead of to its current content.
function showcaseStageHeight(stage) {
    const box = stage.getBoundingClientRect();
    const modal = $('.modal');
    const modalBox = modal ? modal.getBoundingClientRect() : null;
    const bottom = Math.min(window.innerHeight, modalBox && modalBox.bottom ? modalBox.bottom : window.innerHeight);
    return Math.max(320, Math.round(bottom - box.top));
}
function pinShowcaseStage() {
    const stage = $('.game-stage');
    if (stage)
        stage.style.minHeight = `${showcaseStageHeight(stage)}px`;
}
// After an answer the house steps forward as the achievement: the question and
// answers leave the stage, the feedback becomes a card under the house and the
// house grows into the free space (DECISIONS #142).
function showcaseHouse() {
    const stage = $('.game-stage');
    if (!stage || !threeWorld || !threeWorld.construction)
        return;
    if (!stage.classList.contains('is-house-showcase')) {
        pinShowcaseStage();
        stage.classList.add('is-house-showcase');
    }
    placeHouse(true);
}
function reactHouse(event, detail) {
    const world = threeWorld;
    const house = detail && detail.house;
    paintHouseProgress();
    if (event === 'answer:correct') {
        burstThreeStage('#34d399');
        if (world && world.construction && house)
            world.construction.setStage(threeStageHandle, 1 + houseVisualStages(house.parts, house.maxParts));
        if (house && house.completedNow && window.threeGame.celebrate)
            window.threeGame.celebrate(threeStageHandle);
    }
    else if (event === 'answer:incorrect') {
        burstThreeStage('#f87171');
        // A wrong answer removes the last-added part (shrink animation on the
        // remaining handle — no remount happens until "next").
        if (world && world.construction && house)
            world.construction.setStage(threeStageHandle, 1 + houseVisualStages(house.parts, house.maxParts));
    }
    else if (event === 'game:completed') {
        if (detail && detail.houseCompleted && window.threeGame.celebrate)
            window.threeGame.celebrate(threeStageHandle);
    }
}
