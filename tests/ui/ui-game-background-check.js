// ui-game-background-check.js — the play surface runs on a LIGHT 2D background.
//
// Regression guard for DECISIONS #220 (which supersedes the 3D cosmos backdrop of
// #173). Two promises are measured on every world a teacher can start:
//
//   1. LIGHT — the stage's painted backdrop is a bright surface, and every text
//      run on it clears 4.5:1 against the colour actually behind it. "Actually"
//      is the hard part: the first version of this measurement read the LAST stop
//      of a gradient and reported dark text on cream as 1.24:1. The backdrop is
//      resolved the way the browser paints it — the last OPAQUE fill walk-up
//      (background-image stop, else background-color) — so a light island inside
//      a light card inside the stage all resolve to what the eye sees.
//
//   2. LIGHT-ON-CPU — the decorative 3D layer is gone: no cosmos, no dust, no
//      emblem, no sky mesh, and an idle play screen renders zero frames. The
//      gameplay 3D that a world really uses (the constellation's stars, the
//      house's bricks) is untouched and is asserted to still render on demand.
//
// Run against a built app started with --remote-debugging-port:
//   npm run build
//   npx electron . --remote-debugging-port=9341
//   node tests/ui/ui-game-background-check.js 9341
// Argument 3 filters worlds while iterating (`... 9341 quiz,race`).
const { check, connect, results } = require('../manual/lib/ui-check-lib');

const ONLY = (process.argv[3] || '').trim().split(',').map(s => s.trim()).filter(Boolean);
const want = name => ONLY.length === 0 || ONLY.includes(name);

// Synthetic content only — no real student data (AGENTS.md).
const OPTIONS = [
  { id: 'a', text: 'Chủ động chào hỏi và hỏi thăm bạn một cách tự nhiên' },
  { id: 'b', text: 'Đứng quan sát từ xa cho đến khi bạn ấy nói trước' },
  { id: 'c', text: 'Kể ngay một câu chuyện cười thật dài để gây chú ý' },
  { id: 'd', text: 'Chờ giáo viên giới thiệu rồi mới dám lên tiếng' }
];
const base = (id, template) => ({
  id, title: 'Kiểm tra nền sáng', subject: 'Đạo đức', grade: '4',
  template, description: '', tags: [], sourceName: 'ui-check',
  createdAt: '2026-01-01T00:00:00.000Z'
});

const GAMES = {
  quiz: JSON.stringify({
    ...base('ui-bg-quiz', 'quiz'),
    gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'none' },
    questions: [1, 2].map(n => ({
      id: 'q' + n, type: 'multiple-choice',
      prompt: 'Câu hỏi số ' + n + ': khi gặp một bạn mới trong lớp em nên làm gì?',
      contentCategory: 'animals', iconName: 'paw-print',
      options: OPTIONS, correctOptionId: 'a', correctAnswer: '',
      explanation: 'Chào hỏi chủ động là bước đầu của một tình bạn mới.', points: 100
    }))
  }),
  scenario: JSON.stringify({
    ...base('ui-bg-scn', 'scenario'),
    gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'none' },
    questions: [{
      id: 's1', type: 'scenario', prompt: 'Em sẽ làm gì trong tình huống này?',
      scenario: 'Bạn mới chuyển đến lớp và ngồi một mình trong giờ ra chơi.',
      contentCategory: 'community', iconName: 'users',
      options: OPTIONS, correctOptionId: 'a', correctAnswer: '', explanation: '', points: 100
    }]
  }),
  matching: JSON.stringify({
    ...base('ui-bg-matching', 'matching'),
    questions: [],
    matchingGame: {
      mode: 'columns', pointsPerPair: 100, completionBonus: 200, wrongPenalty: 0, timeBonus: 0,
      pairs: [1, 2, 3, 4].map(n => ({ id: 'p' + n, left: 'Khái niệm ' + n, right: 'Định nghĩa ' + n }))
    }
  }),
  constellation: JSON.stringify({
    ...base('ui-bg-const', 'matching'),
    questions: [],
    matchingGame: {
      mode: 'connection', connectionTemplate: 'orion', pointsPerPair: 100,
      completionBonus: 200, wrongPenalty: 0, timeBonus: 0,
      pairs: ['alnilam', 'alnitak', 'mintaka', 'betelgeuse', 'bellatrix'].map((id, n) =>
        ({ id, left: 'Khái niệm ' + (n + 1), right: 'Định nghĩa ' + (n + 1) }))
    }
  }),
  treasure: JSON.stringify({
    ...base('ui-bg-treasure', 'treasure-hunt'),
    questions: [],
    treasureHunt: {
      character: 'Nhà thám hiểm An',
      intro: 'Hành trình bắt đầu từ ngôi đền cổ.',
      journeyBonus: 200, hiddenItemBonus: 50,
      backgroundId: 'temple', characterId: 'explorer',
      stages: [1, 2, 3].map(n => ({
        id: 's' + n, name: 'Chặng ' + n,
        story: 'Bối cảnh cho chặng ' + n + '.',
        taskDescription: 'Nhiệm vụ của chặng ' + n + '.',
        question: {
          prompt: 'Câu hỏi kho báu số ' + n + '?',
          options: OPTIONS, correctOptionId: 'a',
          explanation: 'Giải thích ' + n, hint: 'Gợi ý ' + n
        },
        attempts: 2, points: 100, completionBonus: 10,
        nextStageId: n < 3 ? 's' + (n + 1) : null, hasHiddenItem: n === 2
      }))
    }
  }),
  race: JSON.stringify({
    ...base('ui-bg-race', 'race'),
    topic: 'Ôn tập',
    questions: [],
    race: {
      trackLength: 20, maxRounds: 2, stepByDifficulty: false, luckEnabled: false,
      teams: [{ id: 't1', name: 'Đội Một', icon: '🔴' }, { id: 't2', name: 'Đội Hai', icon: '🔵' }],
      cells: [
        { cell: 3, type: 'boost', label: 'Tăng tốc' },
        { cell: 7, type: 'penalty', label: 'Chướng ngại' },
        { cell: 11, type: 'lucky', label: 'May mắn' },
        { cell: 15, type: 'challenge', label: 'Thử thách' }
      ],
      questions: [1, 2].map(n => ({
        id: 'rq' + n, prompt: 'Câu hỏi đường đua số ' + n + '?',
        options: OPTIONS, correctOptionId: 'a',
        explanation: 'Giải thích ' + n, difficulty: 'trung bình'
      }))
    }
  })
};

const OPEN = game => `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.getElementById('closeResultBtn')?.click();
  document.querySelector('[data-play-close]')?.click();
  document.getElementById('modalRoot').innerHTML = '';
  await sleep(300);
  playGame(${game}, { fullscreen: true });
  for (let i = 0; i < 60; i++) {
    if (document.querySelector('.game-stage')) break;
    await sleep(100);
  }
  await sleep(1200);
  return Boolean(document.querySelector('.game-stage'));
})()`;

// Everything measured inside the page in one round trip: the backdrop walk, the
// contrast census, and the idle frame count. Kept as one expression because each
// evaluate against a cold renderer is slow.
const PROBE = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const parse = s => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(/[,\\/ ]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = Math.max(a, b), l2 = Math.min(a, b); return (l1 + 0.05) / (l2 + 0.05); };

  // The colour the browser actually paints behind \`el\`: CSS paint order is
  // background-image (its LAST stop), then background-color; the first opaque
  // one wins as we walk up. The walk starts at the PARENT: a text node is not
  // painted over its own box's fill, so an element's own plate (a chip, a pill)
  // is never the colour "behind" its own characters — reading it as the backdrop
  // reported a dark label on a white chip as 1.24:1. Its own ink/plate pair is
  // a different question (the ink has to clear its own plate), and the typography
  // gate measures plates on their own terms.
  const backdrop = el => {
    let node = el.parentElement;
    while (node) {
      const bs = getComputedStyle(node);
      const bc = parse(bs.backgroundColor);
      const bi = bs.backgroundImage;
      if (bc && bc.a >= 0.99) return { ...bc, from: String(node.className || node.tagName) };
      if (bi && bi !== 'none') {
        const stops = [...bi.matchAll(/rgba?\\([^)]+\\)/g)].map(m => parse(m[0])).filter(Boolean).filter(x => x.a >= 0.95);
        if (stops.length) return { ...stops[stops.length - 1], from: String(node.className || node.tagName) + ' img' };
      }
      node = node.parentElement;
    }
    return { r: 244, g: 246, b: 251, a: 1, from: 'html' };
  };

  // A text node is painted over its own box's fill when that fill is opaque (a
  // chip, a pill, a card body): then its plate is the surface, and the ink has to
  // clear the plate. When the box's fill is translucent it is a tint over the
  // page, so the page is what the pair is judged on.
  const inkOnOwnPlate = (el, outer, lum, ratio) => {
    const st = getComputedStyle(el);
    const own = parse(st.backgroundColor);
    const fg = parse(st.color);
    const plate = own && own.a >= 0.99 ? { ...own, from: String(el.className || el.tagName) }
      : (st.backgroundImage && st.backgroundImage !== 'none'
        ? (() => { const s = [...st.backgroundImage.matchAll(/rgba?\\([^)]+\\)/g)].map(m => parse(m[0])).filter(Boolean).filter(x => x.a >= 0.95); return s.length ? { ...s[s.length - 1], from: String(el.className || el.tagName) + ' img' } : null; })()
        : null);
    const bg = plate || outer;
    const eff = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
    return { cr: ratio(lum(eff), lum(bg)), bg };
  };

  const stage = document.querySelector('.game-stage');
  if (!stage) return { ok: false, why: 'no stage' };
  const stageBg = backdrop(stage);

  // Anything inside an invisible or faded-out layer is not a legibility claim: the
  // 3D constellation keeps a live SVG fallback in the DOM at opacity 0, and its
  // labels inherit a white \`color\` from the canvas frame even though they paint
  // with \`fill\` (which IS dark). Reading them would report phantom 1.11:1 runs.
  const painted = el => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) return false;
      if (n === stage) return true;
    }
    return true;
  };

  const rows = [];
  for (const el of stage.querySelectorAll('*')) {
    const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
    if (!text) continue;
    const s = getComputedStyle(el);
    if (!painted(el)) continue;
    // SVG text paints with its fill; only HTML text paints with its color.
    const ns = el.namespaceURI;
    const svgText = ns === 'http://www.w3.org/2000/svg' && el.tagName.toLowerCase() === 'text';
    if (svgText && s.fill === 'none') continue;
    const fg = parse(svgText ? s.fill : s.color);
    if (!fg) continue;
    const bg = backdrop(el);
    const pair = inkOnOwnPlate(el, bg, lum, ratio);
    const cr = pair.cr;
    if (cr < 4.5) rows.push({ cr: Math.round(cr * 100) / 100, text: text.slice(0, 40), color: svgText ? s.fill : s.color,
      cls: String(el.className.baseVal === undefined ? el.className : el.className.baseVal).slice(0, 60), bg: String(pair.bg.from).slice(0, 40) });
  }
  rows.sort((a, b) => a.cr - b.cr);

  // Decorative 3D must be gone everywhere it used to be built.
  const h = (typeof threeStageHandle !== 'undefined') ? threeStageHandle : null;
  const world = (typeof threeWorld !== 'undefined') ? threeWorld : null;
  let meshCount = 0;
  if (h && h.scene) h.scene.traverse(o => { if (o.isMesh || o.isPoints || o.isSprite) meshCount += 1; });

  // Idle cost: count real renderer.render calls over one second with no input.
  let idleFrames = 0;
  if (h && h.renderer) {
    const orig = h.renderer.render;
    h.renderer.render = function () { idleFrames += 1; return orig.apply(this, arguments); };
    await sleep(1000);
    h.renderer.render = orig;
  }

  // The idle gate is only allowed to skip DRAWS, not the picture. Without
  // preserveDrawingBuffer Chromium clears the buffer as soon as it composites a
  // frame, so an idle board painted its stars for ~14 frames and then went blank
  // (measured 0% opaque after 2.5s). Read the canvas the way the screen does.
  let paintedPct = null;
  if (h && h.canvas) {
    const shot = document.createElement('canvas');
    shot.width = h.canvas.width; shot.height = h.canvas.height;
    const ctx = shot.getContext('2d');
    ctx.drawImage(h.canvas, 0, 0);
    const px = ctx.getImageData(0, 0, shot.width, shot.height).data;
    let opaque = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 8) opaque += 1;
    paintedPct = Math.round(10000 * opaque / (shot.width * shot.height)) / 100;
  }

  return JSON.stringify({
    ok: true,
    stageBg, stageLum: Math.round(lum(stageBg) * 1000) / 1000,
    rows: rows.slice(0, 10), sub45: rows.length, sampled: stage.querySelectorAll('*').length,
    cosmos: Boolean(world && world.cosmos),
    dust: Boolean(h && h.particles),
    emblem: Boolean(h && h.emblem),
    sky: Boolean(h && h.scene && h.scene.background),
    hasCanvas: Boolean(stage.querySelector('canvas')),
    meshCount, idleFrames, paintedPct
  });
})()`;

// The gameplay 3D a world really needs must still draw when something happens:
// a constellation answers, a house is built, a burst is fired.
const BURST = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const h = threeStageHandle;
  if (!h || !h.renderer) return JSON.stringify({ ok: false, why: 'no 3D handle' });
  let frames = 0;
  const orig = h.renderer.render;
  h.renderer.render = function () { frames += 1; return orig.apply(this, arguments); };
  if (window.threeGame && h.scene) { try { window.threeGame.burst(h, 0, 0, 0); } catch (e) {} }
  await sleep(700);
  h.renderer.render = orig;
  return JSON.stringify({ ok: true, frames });
})()`;

(async () => {
  const page = await connect();
  for (const [name, game] of Object.entries(GAMES)) {
    if (!want(name)) continue;
    console.log(`\n=== ${name} ===`);
    const opened = await page.evaluate(OPEN(game));
    check(`[${name}] the play surface opens`, opened === true);

    const raw = await page.evaluate(PROBE);
    const snap = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!snap || snap.ok === false) { check(`[${name}] probe ran`, false, JSON.stringify(snap)); continue; }

    check(`[${name}] the stage backdrop is a bright surface (luminance >= 0.55)`,
      snap.stageLum >= 0.55,
      `luminance=${snap.stageLum} from ${String(snap.stageBg.from).slice(0, 40)}`);
    check(`[${name}] every text run clears 4.5:1 against its real backdrop`,
      snap.sub45 === 0,
      snap.sub45 === 0 ? `${snap.sampled} elements sampled` : JSON.stringify(snap.rows));
    check(`[${name}] no decorative 3D layer: no cosmos, no dust, no emblem, no sky mesh`,
      snap.cosmos === false && snap.dust === false && snap.emblem === false && snap.sky === false,
      JSON.stringify({ cosmos: snap.cosmos, dust: snap.dust, emblem: snap.emblem, sky: snap.sky }));
    check(`[${name}] an idle play screen renders zero frames`,
      snap.idleFrames === 0,
      `renderer.render calls in 1s idle = ${snap.idleFrames}`);

    // Only the constellation builds gameplay 3D from the start; for every other
    // world there is nothing to draw until an answer or a build happens.
    if (snap.hasCanvas) {
      // Zero is the defect (a cleared buffer); the size is not — quiz/scenario/race
      // carry only a small prop, while the constellation's stars cover ~15%.
      check(`[${name}] the idle canvas keeps its picture`, snap.paintedPct > 0,
        `${snap.paintedPct}% of pixels painted after 1s of no drawing`);
      const rawBurst = await page.evaluate(BURST);
      const burst = typeof rawBurst === 'string' ? JSON.parse(rawBurst) : rawBurst;
      check(`[${name}] gameplay 3D still draws on demand`,
        burst.ok === true && burst.frames > 0,
        JSON.stringify(burst));
    } else {
      check(`[${name}] no canvas is mounted when the world has no gameplay 3D`,
        snap.hasCanvas === false && snap.meshCount === 0,
        `canvas=${snap.hasCanvas} meshes=${snap.meshCount}`);
    }
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\nui-game-background-check: ${results.length - failed.length}/${results.length} checks passed`);
  page.ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
