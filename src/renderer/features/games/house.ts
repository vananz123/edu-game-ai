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
// Envelope of the FINISHED model, walked from its own part specs. #179 dropped the
// hand-recorded width × height table (#144): sizing needs DEPTH too, because the
// silhouette a perspective camera draws of a deep model is wider than its footprint
// (measured: the garden's 4,08-unit yard projects 456 px in a 423 px hero slot).
// All 73 part specs are axis-aligned boxes, so min/max of (x ± w/2) is exact.
function houseEnvelope(style) {
    const env = {
        minX: Infinity, maxX: -Infinity,
        minY: Infinity, maxY: -Infinity,
        minZ: Infinity, maxZ: -Infinity
    };
    for (const stage of houseParts(style)) {
        for (const spec of stage) {
            const halfW = (spec.w || 0) / 2;
            const halfH = (spec.h || 0) / 2;
            const halfD = (spec.d || 0) / 2;
            const x = spec.x || 0;
            const y = spec.y || 0;
            const z = spec.z || 0;
            env.minX = Math.min(env.minX, x - halfW);
            env.maxX = Math.max(env.maxX, x + halfW);
            env.minY = Math.min(env.minY, y - halfH);
            env.maxY = Math.max(env.maxY, y + halfH);
            env.minZ = Math.min(env.minZ, z - halfD);
            env.maxZ = Math.max(env.maxZ, z + halfD);
        }
    }
    return env;
}
function houseBounds(style) {
    const env = houseEnvelope(style);
    return { w: env.maxX - env.minX, h: env.maxY - env.minY, front: env.maxZ };
}
const HOUSE_SLOT_FILL = 0.92;
// The house has real depth and the camera is close, so its projected box is bigger
// than the z = 0 slice it used to be sized from: measured at the showcase scale,
// the near face is 1,34× taller than the mid-plane (#142 hid that behind a fill
// constant tuned for one particular build stage). Sizing on footprint × pxPerUnit
// still lost the DEPTH, which is what spreads the silhouette sideways: the garden
// model overflowed its own hero slot by 33 px of width at 1366x768 and 116 px at
// 1920x1080 (#179). `fill` can only mean "fraction of the slot" if the fit reads
// the silhouette itself, so it now measures the eight projected corners and
// corrects once more — the same box a student sees, not a proxy for it.
const HOUSE_SHOWCASE_FILL = 0.86;
// The result hero has a caption directly under its slot, so the house keeps a
// little more air there than in the answer band (#144).
const HOUSE_RESULT_FILL = 0.92;
// Silhouette of the placed envelope in LAYOUT pixels of the canvas (origin =
// stage top-left). Measured with threeGame.stageProject(), the analytic inverse
// of the stagePoint() that produced the placement, so the fit needs no rendered
// frame (#179).
function houseHullPx(view, env, x, y, scale) {
    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const cx of [env.minX, env.maxX])
        for (const cy of [env.minY, env.maxY])
            for (const cz of [env.minZ, env.maxZ]) {
                const f = window.threeGame.stageProject(threeStageHandle, x + cx * scale, y + cy * scale, cz * scale);
                const px = f.fx * view.width;
                const py = f.fy * view.height;
                if (px < left)
                    left = px;
                if (px > right)
                    right = px;
                if (py < top)
                    top = py;
                if (py > bottom)
                    bottom = py;
            }
    return { left, right, top, bottom, width: right - left, height: bottom - top };
}
// Screen-space target for the 3D house. The WebGL canvas covers the whole
// stage, so the only reliable way to line the house up with the DOM is to map the
// reserved slot through the camera. DECISIONS #142, one slot for both phases since
// #179: `.house-stage-slot` is the answer-phase placeholder band AND the showcase's
// left column, so CSS owns the rectangle the house must fit and this function only
// measures it — in layout pixels, and with the analytic projection that needs no
// rendered frame (#179).
function houseTarget() {
    if (!threeStageHandle || !window.threeGame || !window.threeGame.stagePoint)
        return null;
    const stage = threeStageHandle.container.getBoundingClientRect();
    if (!stage.width || !stage.height)
        return null;
    const showcase = Boolean($('.game-stage.is-house-showcase'));
    const slot = $('.game-stage .house-stage-slot');
    if (!slot)
        return null;
    const rect = slot.getBoundingClientRect();
    // Never place the house from a guess: a slot that has not been laid out yet
    // (the showcase flips classes on the same beat the stage height is pinned)
    // would park the house at the wrong size for the rest of the question.
    if (!rect.width || !rect.height)
        return null;
    // Two pixel grids are in play. `getBoundingClientRect()` answers in TRANSFORMED
    // pixels — a `.modal` whose pop-in never ran sits at scale 0,92 (measured on a
    // hidden test window: stage rect 1041 px over a canvas 1130 px wide) — while
    // stagePoint().pxPerUnit counts LAYOUT pixels. Mixing them sized the house to
    // 0,92² of its slot and left its centre 41 px off, so everything below works in
    // layout pixels and the fit holds whatever transform the modal is mid-way through.
    const view = {
        width: threeStageHandle.container.clientWidth || stage.width,
        height: threeStageHandle.container.clientHeight || stage.height
    };
    const k = view.width / stage.width;
    const box = {
        left: (rect.left - stage.left) * k,
        top: (rect.top - stage.top) * k,
        width: rect.width * k,
        height: rect.height * k
    };
    const env = (threeWorld && threeWorld.envelope) || houseEnvelope(houseStyleForCurrentGame());
    const fx = (box.left + box.width / 2) / view.width;
    const fy = (box.top + box.height / 2) / view.height;
    const point = window.threeGame.stagePoint(threeStageHandle, fx, fy, 0);
    if (!point.pxPerUnit)
        return null;
    const fill = showcase ? HOUSE_SHOWCASE_FILL : ($('.result-house-hero') ? HOUSE_RESULT_FILL : HOUSE_SLOT_FILL);
    const nearZ = Math.max(0, env.maxZ);
    // First guess on the plane the near face sits on: it covers the most pixels per
    // unit, so it never overshoots. The loop below only ever tightens it.
    const ppu = (nearZ ? window.threeGame.stagePoint(threeStageHandle, fx, fy, nearZ).pxPerUnit : 0) || point.pxPerUnit;
    let scale = Math.min(box.height * fill / ((env.maxY - env.minY) * ppu), box.width * fill / ((env.maxX - env.minX) * ppu));
    // Part coordinates start at the ground, so the group origin is the house's base.
    // Lift the envelope's own centre onto the slot's centre instead of dropping half
    // a hand-recorded height, so a model whose props sit above the ground line still
    // lands where the slot is.
    let x = point.x;
    let y = point.y - (env.minY + env.maxY) / 2 * scale;
    const midZ = (env.minZ + env.maxZ) / 2;
    const shift = window.threeGame.stagePoint(threeStageHandle, fx, fy, midZ).pxPerUnit || point.pxPerUnit;
    const slotCx = box.left + box.width / 2;
    const slotCy = box.top + box.height / 2;
    // Resize and re-centre from a fresh measurement every pass: the two feed each
    // other (shrinking pulls the silhouette toward the camera axis, which moves its
    // centre), so the loop has to end on a pass that already saw the new scale.
    for (let i = 0; i < 6; i++) {
        const hull = houseHullPx(view, env, x, y, scale);
        if (!(hull.width > 0) || !(hull.height > 0) || !Number.isFinite(hull.width) || !Number.isFinite(hull.height))
            break;
        const ratio = Math.min(box.height * fill / hull.height, box.width * fill / hull.width);
        // A deep box off the camera axis is NOT centred on its anchor: the near face
        // spreads wider than the far one, so the silhouette leans toward whichever
        // side of the stage the house stands on (measured 31–132 px past the slot).
        const dx = (slotCx - (hull.left + hull.right) / 2) / shift;
        // Screen y grows DOWN while world y grows UP: the pixel and world deltas
        // have opposite signs (measured: same formula as x parked the house 55 px
        // below its slot).
        const dy = ((hull.top + hull.bottom) / 2 - slotCy) / shift;
        // Clamped so one bad pass cannot cascade: an enormous hull would crush the
        // scale to ~0, and the next pass divides by a hull of ~0 px and blows the
        // position up to 1e7 — the house leaves the screen and never comes back.
        scale *= Math.min(4, Math.max(0.25, ratio));
        x += dx;
        y += dy;
        if (Math.abs(ratio - 1) < 0.002 && Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005)
            break;
    }
    // The loop's last move centred a hull measured at the PREVIOUS scale, which
    // leaves up to that tolerance of lean uncorrected (measured fill 0,921 against
    // a target of 0,92). Centre once more at the scale the house is drawn with.
    const fin = houseHullPx(view, env, x, y, scale);
    if (fin.width > 0 && fin.height > 0 && Number.isFinite(fin.width) && Number.isFinite(fin.height)) {
        x += (slotCx - (fin.left + fin.right) / 2) / shift;
        y += ((fin.top + fin.bottom) / 2 - slotCy) / shift;
    }
    if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(x) || !Number.isFinite(y))
        return null;
    return { point: { x, y, z: 0 }, scale };
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
    world.envelope = houseEnvelope(style);
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
// Height the showcase stage keeps: the rectangle it already had while the question
// was on screen. Hiding the question collapses a content-sized stage and the
// feedback card then stretches it past the viewport (measured 957px stage vs
// 950px modal bottom at 1600x1000), so the showcase freezes it instead.
//
// It must NOT be derived from `.modal`'s own bottom (#179): the modal is
// content-sized, so a taller stage makes a taller modal, which the next pin reads
// back as more room — measured +25 px, then +56 px per answer, and the window
// creeps down until it hits its cap. A pure freeze has no feedback path, and the
// play surface stops moving on every answer.
function showcaseStageHeight(stage) {
    return Math.max(320, Math.round(stage.getBoundingClientRect().height));
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
