#!/usr/bin/env node
/**
 * DECISIONS #181 — the teacher screens are readable: no text smaller than 11px and
 * no text below 4.5:1, in either theme.
 *
 * The user's complaint was "độ đậm của chữ rất nhỏ gây ra tình trạng khó đọc" — small,
 * light text. That is two measurable numbers, so this gate measures exactly those two
 * instead of grepping declarations. Baseline measured before the fix by the same kind of
 * walk over the six busiest screens (12 theme x screen views, symbol runs excluded, so
 * 538 runs): 184 of them sat below 4.5:1 (136 light / 48 dark, worst 1.08:1) and 124 were
 * 10px or smaller — e.g. `.nav-count` 10px #717b90 on a white chip (3.2:1), `.field-hint`
 * 11px #94a3b8 (2.6:1), and 47 dark-mode runs whose ink had been flipped to a light alias
 * while the surface behind it stayed light. The same census re-run over 24 views after the
 * fix gives 982 runs, 0 below 4.5:1 (worst 4.76:1) and 0 at 10px or smaller.
 *
 * What the walk does that a stylesheet grep cannot:
 *   - it reads the COMPUTED font-size and colour of every element that owns a visible
 *     text run, so a `text-[10px]` overridden by a component rule measures as its real
 *     size;
 *   - backgrounds are resolved through the whole ancestor chain and a gradient
 *     contributes every stop, so the contrast is the WORST stop, not the first one —
 *     without this the light-only `.ask-panel` gradient read as a dark surface in dark
 *     mode and hid a 1.04:1 offender;
 *   - colours are rasterised through a 1x1 canvas, the way #160 learned to do it:
 *     Chromium serialises modern colours as `oklab(...)` and neither a regex nor
 *     `ctx.fillStyle` turns those back into numbers, but a filled pixel does. Without
 *     that, an unparsable ink used to be scored as black and passed;
 *   - symbol-only runs (🚦, ✓, ○, ✕) are skipped: they carry no readable text, so a
 *     contrast ratio on them is not a legibility claim;
 *   - dialogs are swept too. `.modal` is a component class, so the shell.css hex
 *     translation table never reached it: in dark mode the card stayed `#ffffff` while
 *     every alias inside it flipped to light ink. Measured before #181: 13 of 14 runs in
 *     the Help dialog and 19 of 28 in the AI local dialog were at 1.2:1 or 2.4:1.
 *   - one synthetic row per store is seeded first (game, project, lesson document,
 *     session), because the card chips — the ext-tone pill in Giáo án, the delete icon in
 *     Dự án của tôi — only exist where there is a row to draw;
 *   - a second pass pins `:hover` and `:focus` on every element whose class list carries a
 *     hover/focus background utility (CDP `CSS.forcePseudoState`, which is why the seeds are
 *     still on screen when it runs). The rest-state walk cannot see those plates and the
 *     stylesheet grep cannot score them, but they are where the shell.css translation table
 *     is blind: it matches class names WITHOUT a variant, so `hover:bg-[#f5f6fa]` survived in
 *     dark while the element's own `text-[#515c72]` had already been flipped. Measured before
 *     the fix: #e8eaf2 on #f5f6fa = 1.23:1, #a5b4fc on #f8f7ff = 1.97:1, #fca5a5 on #fff1f2 =
 *     1.13:1, and one LIGHT red no sweep could reach — the "Xóa log" label #dc2626 on its own
 *     #fef2f2 hover plate at 4.41:1. Now 48 forced states, worst 4.72:1.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 * `node tests/ui/ui-typography-readability-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9361';
const { connect } = require('../manual/lib/ui-check-lib');

const MIN_SIZE = 11;
const MIN_CONTRAST = 4.5;
const PAGES = ['library', 'settings', 'create', 'create-wizard', 'lesson-plans', 'my-projects', 'sessions', 'editor'];
const WIZARD_STEPS = ['input', 'structure', 'analyze', 'recommend', 'configure'];

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

// Every element whose own class list carries a hover/focus background utility. The class
// name of `hover:bg-[#f5f6fa]` is `hover\:bg-\[\#f5f6fa\]`, so the attribute search finds it
// by the readable substring the markup actually contains.
const HOVER_SELECTOR = '[class*="hover:bg-["], [class*="focus:bg-["]';
const MEASURE_HOVER = String.raw`function () {
  const st = getComputedStyle(this);
  const swatch = document.createElement('canvas');
  swatch.width = swatch.height = 1;
  const ctx = swatch.getContext('2d', { willReadFrequently: true });
  const pixelOf = value => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  // The hover plate is painted on this very element by the forced state; only when it is
  // still translucent does the surface come from an ancestor (same rule as the rest walk).
  let back = pixelOf(st.backgroundColor);
  if (back.a < 0.95) {
    for (let p = this.parentElement; p && back.a < 0.95; p = p.parentElement) {
      const c = pixelOf(getComputedStyle(p).backgroundColor);
      if (c.a > 0.95) back = c;
    }
    if (back.a < 0.95) back = { r: 255, g: 255, b: 255, a: 1 };
  }
  const ink = pixelOf(st.color);
  const l1 = lum(ink);
  const l2 = lum(back);
  const hex = c => '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('');
  return {
    hasText: Array.prototype.some.call(this.childNodes, n => n.nodeType === 3 && /[\p{L}\p{N}]/u.test(n.textContent)),
    size: Math.round(parseFloat(st.fontSize) * 10) / 10,
    ink: hex(ink), back: hex(back),
    contrast: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100,
    cls: (typeof this.className === 'string' && this.className ? this.className : this.tagName).slice(0, 70),
    text: (this.textContent || '').trim().slice(0, 30)
  };
}`;

const LESSON = 'Bai 12: Quang hop o thuc vat\n\nI. Muc tieu\nSau bai hoc, hoc sinh trinh bay duoc khai niem quang hop.\n\nII. Kien thuc trong tam\nQuang hop la qua trinh thuc vat su dung nang luong anh sang.';

const SCENARIO = String.raw`(async () => {
  const PAGES = ${JSON.stringify(PAGES)};
  const WIZARD_STEPS = ${JSON.stringify(WIZARD_STEPS)};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const guardDeadline = Date.now() + 4000;
  while (Date.now() < guardDeadline && !document.querySelector('#modalRoot .setup-fullscreen')) await sleep(100);
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);

  const SEED_PREFIX = 'typo-probe-';
  // A run that dies mid-sweep (or whose deletes failed) leaves probe rows in the shared
  // profile, and this gate reads the real lists — so it purges its own prefix before it
  // seeds, and reports how much it found.
  const purge = async () => {
    const lib = await desktop.call('getLibrary');
    const projects = await desktop.call('listProjects') || [];
    const docs = await desktop.call('listLessonLibrary') || [];
    const found = {
      games: (lib.games || []).filter(g => String(g.title || '').startsWith(SEED_PREFIX)).map(g => g.id),
      sessions: (lib.sessions || []).filter(s => String(s.playerName || '').startsWith(SEED_PREFIX)).map(s => s.id),
      projects: projects.filter(p => String(p.title || '').startsWith(SEED_PREFIX)).map(p => p.id),
      docs: (Array.isArray(docs) ? docs : []).filter(d => String(d.name || '').startsWith(SEED_PREFIX)).map(d => d.id)
    };
    if (found.projects.length) await desktop.call('deleteProjects', found.projects);
    if (found.games.length) await desktop.call('deleteGames', found.games);
    if (found.sessions.length) await desktop.call('deleteSessions', found.sessions);
    for (const id of found.docs) await desktop.call('deleteLessonDocument', id);
    return Object.values(found).reduce((n, v) => n + v.length, 0);
  };
  const purged = await purge();
  const runTag = Date.now().toString(36);
  const seeded = { games: [], docs: [], projects: [], sessions: [] };
  const projectId = SEED_PREFIX + runTag;
  await desktop.call('saveProjectDraft', {
    id: projectId, title: SEED_PREFIX + ' dự án thử độ đọc của chữ', description: 'Dữ liệu tổng hợp.',
    status: 'draft', step: 'edit', schemaVersion: 1, sourceName: 'ui-check', createdAt: new Date().toISOString()
  });
  seeded.projects.push(projectId);
  const gameId = SEED_PREFIX + runTag;
  await desktop.call('saveGame', {
    id: gameId, title: SEED_PREFIX + ' trò chơi thử độ đọc của chữ', subject: 'Kỹ năng sống', grade: '6',
    template: 'quiz', description: 'Dữ liệu tổng hợp.', tags: [], sourceName: 'ui-check',
    createdAt: new Date().toISOString(), gameSetup: { scoringMode: 'cơ bản' },
    questions: [{
      id: 'q1', type: 'multiple-choice', prompt: 'Câu hỏi thử?',
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }, { id: 'd', text: 'D' }],
      correctOptionId: 'a', correctAnswer: '', explanation: 'Giải thích.', points: 100
    }]
  });
  seeded.games.push(gameId);
  const pdfDoc = await desktop.call('saveLessonDocument', {
    name: SEED_PREFIX + runTag + '.pdf', ext: 'pdf',
    text: 'Nội dung thử độ đọc. ' + 'x'.repeat(120), characters: 140, sizeBytes: 140
  });
  const txtDoc = await desktop.call('saveLessonDocument', {
    name: SEED_PREFIX + runTag + '.txt', ext: 'txt',
    text: 'Nội dung thử độ đọc. ' + 'x'.repeat(120), characters: 140, sizeBytes: 140
  });
  const library = await desktop.call('listLessonLibrary') || [];
  for (const d of [pdfDoc, txtDoc]) {
    const id = (d && d.id) || (library.find(x => x.name === (d && d.name)) || {}).id;
    if (id) seeded.docs.push(id);
  }
  const sessionId = SEED_PREFIX + runTag;
  await desktop.call('saveSession', {
    id: sessionId, gameId, gameTitle: SEED_PREFIX + ' trò chơi thử độ đọc của chữ', template: 'quiz',
    playerName: SEED_PREFIX + ' người chơi', durationSeconds: 60, points: 100, percent: 50,
    createdAt: new Date().toISOString()
  });
  seeded.sessions.push(sessionId);
  state.db = await desktop.call('getLibrary');
  state.projects = await desktop.call('listProjects');

  const swatch = document.createElement('canvas');
  swatch.width = swatch.height = 1;
  const swatchCtx = swatch.getContext('2d', { willReadFrequently: true });
  const pixelOf = str => {
    swatchCtx.clearRect(0, 0, 1, 1);
    swatchCtx.fillStyle = str;
    swatchCtx.fillRect(0, 0, 1, 1);
    const d = swatchCtx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const stopsOf = img => {
    if (!img || img === 'none' || !/gradient/i.test(img)) return [];
    const out = [];
    const re = /(rgba?\([^)]*\)|#[0-9a-f]{3,8})/gi;
    let t;
    while ((t = re.exec(img))) { const c = pixelOf(t[1]); if (c.a > 0) out.push(c); }
    return out;
  };
  const backsOf = el => {
    if (!el || el.nodeType !== 1) return [{ r: 255, g: 255, b: 255, a: 1 }];
    const st = getComputedStyle(el);
    const gs = stopsOf(st.backgroundImage);
    const own = pixelOf(st.backgroundColor);
    const layer = gs.length ? gs : (own.a > 0 || st.backgroundImage === 'none' ? [own] : []);
    const parents = backsOf(el.parentElement);
    if (!layer.length) return parents;
    const opaque = layer.filter(c => c.a > 0.95);
    if (opaque.length) return opaque;
    const merged = [];
    for (const p of parents) for (const c of layer) merged.push(blend(c, p));
    return merged.slice(0, 8);
  };
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  // A run is only a legibility claim when it holds a letter or a digit: 🚦, ✓, ○, ✕
  // are glyphs, not text.
  const READABLE = /[\p{L}\p{N}]/u;
  const walk = screen => {
    const rows = [];
    const walk1 = el => {
      const own = Array.prototype.filter.call(el.childNodes, n => n.nodeType === 3 && READABLE.test(n.textContent));
      if (own.length) {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        if (r.width > 1 && r.height > 1 && st.visibility !== 'hidden' && parseFloat(st.opacity) > 0.05) {
          const backs = backsOf(el);
          const ink = pixelOf(st.color);
          let worst = null, worstBack = backs[0];
          for (const bg of backs) {
            const cr = ratio(ink.a < 1 ? blend(ink, bg) : ink, bg);
            if (worst === null || cr < worst) { worst = cr; worstBack = bg; }
          }
          rows.push({
            screen,
            size: Math.round(parseFloat(st.fontSize) * 10) / 10,
            weight: parseInt(st.fontWeight, 10) || 400,
            ink: hex(ink), back: hex(worstBack),
            contrast: Math.round(worst * 100) / 100,
            cls: (typeof el.className === 'string' && el.className ? el.className : el.tagName).slice(0, 70),
            text: own.map(n => n.textContent.trim()).join(' ').slice(0, 40)
          });
          return;
        }
      }
      for (const c of el.children) walk1(c);
    };
    walk1(document.body);
    return rows;
  };

  const pages = PAGES.map(name => [name, async () => { navigate(name); await sleep(name === 'my-projects' || name === 'lesson-plans' ? 700 : 500); }]);
  const wizard = WIZARD_STEPS.map(step => ['wizard-' + step, async () => {
    if (typeof wizardReset === 'function') wizardReset();
    wizardState.text = ${JSON.stringify(LESSON)};
    wizardState.documentName = 'c.doc';
    wizardState.step = step;
    navigate('create-wizard');
    render();
    await sleep(650);
  }]);
  const dialogs = [
    ['dialog-help', async () => { document.getElementById('helpBtn').click(); await sleep(400); }],
    ['dialog-localai', async () => { openLocalAiModal(); await sleep(400); }],
    ['setup', async () => { navigate('settings'); await openSetupWizard({ probe: false }); await sleep(1500); }]
  ];

  const rows = [];
  const hosts = {};
  for (const theme of ['light', 'dark']) {
    document.documentElement.dataset.theme = theme;
    render();
    await sleep(200);
    for (const [name, go] of pages.concat(wizard)) {
      await go();
      rows.push(...walk(theme + '/' + name));
    }
    for (const [name, go] of dialogs) {
      await go();
      const modal = document.querySelector('#modalRoot .modal') || document.querySelector('.setup-fullscreen');
      if (modal) hosts[theme + '/' + name] = {
        bg: getComputedStyle(modal).backgroundColor,
        ink: getComputedStyle(modal).color,
        bgLum: Math.round(lum(pixelOf(getComputedStyle(modal).backgroundColor)) * 1000) / 1000,
        inkLum: Math.round(lum(pixelOf(getComputedStyle(modal).color)) * 1000) / 1000
      };
      rows.push(...walk(theme + '/' + name));
      const root = document.getElementById('modalRoot');
      if (root) root.innerHTML = '';
      if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
      await sleep(150);
    }
  }
  document.documentElement.dataset.theme = 'light';
  render();

  // The rows are deleted by the Node side AFTER the hover pass (an element only has its
  // hover plate painted while the row that owns it is on screen), so the sweep hands back
  // what it seeded instead of cleaning up after itself.
  return JSON.stringify({
    rows, hosts,
    seeded,
    cleanup: {
      purgedBeforeSeed: purged,
      seeded: Object.keys(seeded).reduce((n, k) => n + seeded[k].length, 0)
    }
  });
})()`;

const CLEANUP = seeded => String.raw`(async () => {
  const SEED_PREFIX = 'typo-probe-';
  const seeded = ${JSON.stringify(seeded)};
  for (const id of seeded.projects) await desktop.call('deleteProjects', [id]);
  for (const id of seeded.games) await desktop.call('deleteGames', [id]);
  for (const id of seeded.sessions) await desktop.call('deleteSessions', [id]);
  for (const id of seeded.docs) await desktop.call('deleteLessonDocument', id);
  // The hover sweep ends on the dark pass; without this the page stays dark for
  // whatever gate runs next and a light-surface check reads dark-mode inks.
  applyTheme((state.settings.preferences || {}).theme || 'light');
  const lib = await desktop.call('getLibrary');
  const projects = await desktop.call('listProjects');
  const docs = await desktop.call('listLessonLibrary') || [];
  return JSON.stringify({
    gamesLeft: ((lib || {}).games || []).filter(g => String(g.title || '').startsWith(SEED_PREFIX)).length,
    sessionsLeft: ((lib || {}).sessions || []).filter(s => String(s.playerName || '').startsWith(SEED_PREFIX)).length,
    projectsLeft: (projects || []).filter(p => String(p.title || '').startsWith(SEED_PREFIX)).length,
    docsLeft: (Array.isArray(docs) ? docs : []).filter(d => String(d.name || '').startsWith(SEED_PREFIX)).length
  });
})()`;

(async () => {
  const cdp = await connect();
  await cdp.send('Page.enable', {});
  await cdp.send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 80; i += 1) {
    const ready = await cdp.evaluate('document.readyState').catch(() => null);
    const ok = await cdp.evaluate(`typeof render === 'function' && typeof navigate === 'function'`).catch(() => false);
    if (ready === 'complete' && ok) break;
    await new Promise(r => setTimeout(r, 250));
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  const out = JSON.parse(await cdp.evaluate(SCENARIO));
  const rows = out.rows;

  // --- the `:hover` / `:focus` pass -------------------------------------------------------
  // A stylesheet grep cannot see these and neither can the sweep above, because `:hover` is
  // a state the page cannot apply to itself. CDP can: `CSS.forcePseudoState` pins the state
  // on a real node, and the utility that paints the hover plate then computes for real, so
  // the pair ink/plate is measured the same way as at rest.
  // Why this matters specifically: the shell.css dark translation table matches class names
  // WITHOUT a variant, so `hover:bg-[#f5f6fa]` slipped past it while the element's own
  // `text-[…]` utility *was* translated — the text vanished exactly when a teacher pointed
  // at it or tabbed into it.
  await cdp.send('DOM.enable', {});
  await cdp.send('CSS.enable', {});
  const hoverRows = [];
  const hoverErrors = [];
  for (const theme of ['light', 'dark']) {
    await cdp.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; render(); true`);
    for (const page of PAGES) {
      await cdp.evaluate(`navigate(${JSON.stringify(page)}); true`);
      await new Promise(r => setTimeout(r, page === 'my-projects' || page === 'lesson-plans' ? 700 : 450));
      let nodeIds = [];
      try {
        const doc = (await cdp.send('DOM.getDocument', { depth: 0 })).result;
        nodeIds = (await cdp.send('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector: HOVER_SELECTOR })).result.nodeIds;
      } catch (error) {
        hoverErrors.push(`${page}: ${String(error.message || error).slice(0, 90)}`);
        continue;
      }
      for (const nodeId of nodeIds) {
        try {
          await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover', 'focus'] });
          const resolved = (await cdp.send('DOM.resolveNode', { nodeId })).result;
          const measured = (await cdp.send('Runtime.callFunctionOn', {
            objectId: resolved.object.objectId, functionDeclaration: MEASURE_HOVER, returnByValue: true
          })).result;
          await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
          if (measured.result.value && measured.result.value.hasText) hoverRows.push({ theme, page, ...measured.result.value });
        } catch (error) {
          hoverErrors.push(`${theme}/${page}: ${String(error.message || error).slice(0, 90)}`);
        }
      }
    }
  }

  const clean = JSON.parse(await cdp.evaluate(CLEANUP(out.seeded)));
  const fmt = r => `${r.screen} ${r.size}px w${r.weight} ${r.ink} on ${r.back} ${r.contrast}:1 [${r.cls}] "${r.text}"`;

  const screens = [...new Set(rows.map(r => r.screen))];
  const expected = (PAGES.length + WIZARD_STEPS.length + 3) * 2;
  const perTheme = ['light', 'dark'].map(t => rows.filter(r => r.screen.startsWith(t + '/')).length);
  check(`the sweep measured real text on all ${expected / 2} screens in both themes`,
    screens.length >= expected && perTheme[0] >= 200 && perTheme[1] >= 200,
    `${rows.length} runs over ${screens.length} sweeps (${perTheme[0]} light / ${perTheme[1]} dark)`);

  const small = rows.filter(r => r.size < MIN_SIZE);
  check(`no readable text is smaller than ${MIN_SIZE}px`, small.length === 0,
    small.length ? small.slice(0, 6).map(fmt).join(' | ')
      : `smallest run ${Math.min(...rows.map(r => r.size))}px, ${rows.filter(r => r.size === MIN_SIZE).length} of ${rows.length} at the floor`);

  const lowInk = rows.filter(r => r.contrast < MIN_CONTRAST);
  check(`no readable text sits below ${MIN_CONTRAST}:1 against its real painted background`, lowInk.length === 0,
    lowInk.length ? lowInk.slice(0, 6).map(fmt).join(' | ')
      : `worst ${Math.min(...rows.map(r => r.contrast)).toFixed(2)}:1, ` +
        `${rows.filter(r => r.contrast < 7).length} runs between ${MIN_CONTRAST}:1 and 7:1`);

  const fmtHover = r => `${r.theme}/${r.page} ${r.size}px ${r.ink} on ${r.back} ${r.contrast}:1 [${r.cls}] "${r.text}"`;
  const hoverBad = hoverRows.filter(r => r.contrast < MIN_CONTRAST);
  check('a hovered or keyboard-focused control keeps its label readable',
    hoverErrors.length === 0 && hoverRows.length >= 8 && hoverBad.length === 0,
    hoverBad.length ? hoverBad.slice(0, 6).map(fmtHover).join(' | ')
      : `${hoverRows.length} forced-hover/focus labels, worst `
        + `${hoverRows.length ? Math.min(...hoverRows.map(r => r.contrast)).toFixed(2) : 'n/a'}:1`
        + (hoverErrors.length ? ` | probe errors: ${hoverErrors.slice(0, 3).join(' | ')}` : ''));

  for (const theme of ['light', 'dark']) {
    const t = rows.filter(r => r.screen.startsWith(theme + '/'));
    check(`${theme}: no sweep came back empty (a screen that failed to render would hide its own reds)`,
      PAGES.concat(WIZARD_STEPS.map(s => 'wizard-' + s)).every(p => t.some(r => r.screen === `${theme}/${p}`)),
      `${t.length} runs, ${new Set(t.map(r => r.screen)).size} screens`);
  }

  // The dialog half of #181: `.modal` keeps a white card in dark mode, so its own ink has
  // to be the dark side. Before the alias re-pin the card computed ink rgb(232,234,242) on
  // rgb(255,255,255) and every `.muted` / `.field-hint` inside inherited the light alias.
  const island = Object.entries(out.hosts).filter(([k, h]) => k.startsWith('dark/') && h.bgLum > 0.6 && h.inkLum > 0.5);
  check('a light dialog never inherits the dark theme\'s light ink',
    Object.keys(out.hosts).length >= 3 && island.length === 0,
    island.length ? island.map(([k, h]) => `${k} ${h.ink} on ${h.bg}`).join(' | ')
      : Object.entries(out.hosts).map(([k, h]) => `${k} ink ${h.inkLum} on ${h.bgLum}`).join(' | '));

  check('the probe rows it seeded were all deleted again',
    out.cleanup.seeded === 5 && clean.gamesLeft === 0 && clean.projectsLeft === 0
      && clean.sessionsLeft === 0 && clean.docsLeft === 0,
    `seeded ${out.cleanup.seeded}, ${out.cleanup.purgedBeforeSeed} rows left over from earlier runs purged first, `
      + JSON.stringify(clean));

  console.log(failures ? `\n${failures} typography check(s) failed` : '\nAll typography checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
