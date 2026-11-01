#!/usr/bin/env node
/**
 * DECISIONS #160 (ROADMAP G6) — the `dark` variant is wired to [data-theme], and dark mode
 * is actually legible.
 *
 * Before #160, Tailwind compiled `dark:` under `@media (prefers-color-scheme: dark)` while
 * `applyTheme()` (src/renderer/shared.ts) set the theme through `document.documentElement
 * .dataset.theme`. The two never met, so all 296 `dark:*` usages in the renderer were dead
 * and dark mode depended entirely on the hand-written `[data-theme="dark"]` translation
 * table in shell.css. Measured on the shipped build: 149 of 223 elements carrying a `dark:`
 * class sat below 4.5:1 contrast, 69 of them below 2:1 — e.g. `#settingStyleTone` had ink
 * rgb(30,41,59) on background rgb(23,27,46), i.e. 1.16:1, nearly invisible.
 *
 * This check is what keeps that from coming back, in either direction:
 *   - the variant must fire when the app asks for dark, and must stay off in light;
 *   - no element carrying a `dark:` class may sit on a near-white card in dark mode
 *     (that was `.form-panel`: a component class the utility table never reached);
 *   - no text carrying a `dark:` class may drop below 3:1, and since DECISIONS #165 none may
 *     drop below 4.5:1 at all — the last five sub-4.5:1 elements were the numbered step
 *     chips, fixed by moving them onto the indigo ink pair the wizard already used;
 *   - the light half of the same sweep is measured too and pinned to a ceiling: light has
 *     its own sub-4.5:1 set (status pills on tinted plates) that is deliberately not
 *     asserted clean, because closing it means re-choosing the semantic pill palette.
 *
 * DECISIONS #164 added the four batch-selection bars (lessons #122, results #123, library
 * #154, projects #163). They carry no `dark:` class at all, so the walk above cannot see
 * them: their dark treatment comes only from the shell.css table. The check now seeds one
 * synthetic row per store (a bar only renders where there is something to tick), measures
 * each strip's four text controls, its own surface against the card behind it, and the
 * `bg-white/[90%]` pick chip, then deletes what it seeded.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 * `node tests/ui/ui-dark-theme-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9349';
const { connect } = require('../manual/lib/ui-check-lib');

const PAGES = ['library', 'settings', 'create', 'create-wizard', 'lesson-plans', 'my-projects', 'sessions'];

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const SCENARIO = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // A fresh profile opens the setup onboarding into #modalRoot a moment after load, which
  // would replace the pages this walk measures. Canonical guard.
  // Wall-clock deadline instead of 40 fixed polls: with the window occluded Chromium
  // throttles setTimeout to ~1s, and 40 of those cost 40 seconds on a profile that has
  // already been onboarded (the modal never appears, so the loop can only end by exhaustion).
  const guardDeadline = Date.now() + 4000;
  while (Date.now() < guardDeadline && !document.querySelector('#modalRoot .setup-fullscreen')) await sleep(100);
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);

  // #164: a bar only renders on a page that has something to pick, so on a fresh
  // profile the four selection strips — the exact markup this sweep now measures —
  // would not exist. Seed one synthetic row per store and delete it again at the end.
  const SEED_PREFIX = 'dark-probe-';
  const runTag = Date.now().toString(36);
  const seeded = { games: [], docs: [], projects: [], sessions: [] };
  const projectId = SEED_PREFIX + runTag;
  await window.eduGame.saveProjectDraft({
    id: projectId, title: SEED_PREFIX + ' dự án thử giao diện tối', description: 'Dữ liệu tổng hợp.',
    status: 'draft', step: 'edit', schemaVersion: 1, sourceName: 'ui-check', createdAt: new Date().toISOString()
  });
  seeded.projects.push(projectId);
  const gameId = SEED_PREFIX + runTag;
  await window.eduGame.saveGame({
    id: gameId, title: SEED_PREFIX + ' trò chơi thử giao diện tối', subject: 'Kỹ năng sống', grade: '6',
    template: 'quiz', description: 'Dữ liệu tổng hợp.', tags: [], sourceName: 'ui-check',
    createdAt: new Date().toISOString(), gameSetup: { scoringMode: 'cơ bản' },
    questions: [{
      id: 'q1', type: 'multiple-choice', prompt: 'Câu hỏi thử?',
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }, { id: 'd', text: 'D' }],
      correctOptionId: 'a', correctAnswer: '', explanation: 'Giải thích.', points: 100
    }]
  });
  seeded.games.push(gameId);
  const doc = await window.eduGame.saveLessonDocument({
    name: SEED_PREFIX + runTag + '.txt', ext: 'txt',
    text: 'Nội dung thử giao diện tối. ' + 'x'.repeat(120), characters: 145, sizeBytes: 145
  });
  // The store returns the saved document, but an older shape answers without an id;
  // reading it back by name keeps the cleanup honest either way.
  const docId = (doc && doc.id)
    || ((await window.eduGame.listLessonLibrary() || []).find(d => d.name === SEED_PREFIX + runTag + '.txt') || {}).id;
  if (docId) seeded.docs.push(docId);
  const sessionId = SEED_PREFIX + runTag;
  await window.eduGame.saveSession({
    id: sessionId, gameId, gameTitle: SEED_PREFIX + ' trò chơi thử giao diện tối', template: 'quiz',
    playerName: SEED_PREFIX + ' người chơi', durationSeconds: 60, points: 100, percent: 50,
    createdAt: new Date().toISOString()
  });
  seeded.sessions.push(sessionId);
  state.db = await window.eduGame.getLibrary();
  state.projects = await window.eduGame.listProjects();

  const parse = rgb => {
    const m = String(rgb).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(v => parseFloat(v.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const backdrop = el => {
    let node = el;
    while (node && node.nodeType === 1) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.9) return bg;
      node = node.parentElement;
    }
    return { r: 0, g: 0, b: 0, a: 1 };
  };
  const nearWhite = c => c.r > 235 && c.g > 235 && c.b > 235;

  /**
   * Rasterise any computed colour through a 1x1 canvas. Needed because Chromium
   * serialises modern colours as oklab(...) and neither the regex above nor
   * ctx.fillStyle turns those back into sRGB numbers — but a filled pixel does.
   */
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

  const walk = () => {
    const rows = [];
    for (const el of (document.getElementById('pageContent') || document.body).querySelectorAll('*')) {
      const attr = el.getAttribute('class') || '';
      if (!/\bdark:/.test(attr)) continue;
      const cs = getComputedStyle(el);
      const ink = parse(cs.color);
      if (!ink) continue;
      const bg = backdrop(el);
      rows.push({
        sig: el.id ? '#' + el.id : el.tagName.toLowerCase() + '::' + (el.textContent || '').trim().slice(0, 24),
        dark: attr.split(/\s+/).filter(c => c.startsWith('dark:')).join(' '),
        own: cs.backgroundColor,
        edge: cs.borderTopColor,
        color: cs.color,
        bg: 'rgb(' + [bg.r, bg.g, bg.b].join(', ') + ')',
        ratio: Math.round(ratio(ink, bg) * 100) / 100,
        onWhite: nearWhite(bg)
      });
    }
    return rows;
  };

  /**
   * #164: the four batch-selection bars (#122 lessons, #123 results, #154 library,
   * #163 projects) carry no dark: class, so walk() above never looks at them —
   * their whole dark treatment comes from the hand-written shell.css table. Measure
   * the strip, its four text controls and the pick chip directly.
   */
  const BAR_SELECTOR = '[data-lesson-selection-bar],[data-library-selection-bar],[data-project-selection-bar],[data-session-selection-bar]';
  const measureBars = page => {
    const bar = document.querySelector(BAR_SELECTOR);
    if (!bar) return null;
    const text = el => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const ink = parse(cs.color);
      if (!ink) return null;
      const bg = backdrop(el);
      return { color: cs.color, bg: 'rgb(' + [bg.r, bg.g, bg.b].join(', ') + ')', ratio: Math.round(ratio(ink, bg) * 100) / 100 };
    };
    // The strip has to read as a band on the card, not melt into it — so compare against
    // the colour actually painted behind it, not against a section token that may itself
    // be transparent.
    const behind = backdrop(bar.parentElement || bar);
    const chipWrap = (() => {
      const box = document.querySelector('#pageContent [data-action="project-select"], #pageContent [data-action="library-select"]');
      return box ? box.closest('label') : null;
    })();
    return {
      page,
      barBg: getComputedStyle(bar).backgroundColor,
      cardBg: 'rgb(' + [behind.r, behind.g, behind.b].join(', ') + ')',
      barBorder: getComputedStyle(bar).borderTopColor,
      label: text(bar.querySelector('label')),
      count: text(bar.querySelector('[data-lesson-selected-count],[data-library-selected-count],[data-project-selected-count],[data-session-selected-count]')),
      del: text(bar.querySelector('button[id$="DeleteSelectedBtn"]')),
      clear: text(bar.querySelector('button[id$="ClearSelectionBtn"]')),
      chipBg: chipWrap ? getComputedStyle(chipWrap).backgroundColor : 'none',
      chipBorder: chipWrap ? getComputedStyle(chipWrap).borderTopColor : 'none',
      // The chip is painted bg-white/[90%] — a token the .bg-white row of the
      // translation table does not match, so it survives dark mode as a white square.
      // Composite its own paint over the card behind it: that is the colour the eye gets.
      chipPlate: (() => {
        if (!chipWrap) return null;
        const paint = pixelOf(getComputedStyle(chipWrap).backgroundColor);
        const under = backdrop(chipWrap.parentElement || chipWrap);
        const mix = k => Math.round(paint.a * paint[k] + (1 - paint.a) * under[k]);
        return { r: mix('r'), g: mix('g'), b: mix('b') };
      })()
    };
  };

  const savedTheme = (state.settings.preferences || {}).theme || 'light';
  const sweep = async theme => {
    applyTheme(theme);
    await sleep(350);
    const rows = [];
    const bars = [];
    const visited = [];
    for (const page of PAGES_PLACEHOLDER) {
      navigate(page);
      await sleep(900);
      visited.push(page);
      for (const r of walk()) rows.push({ ...r, page });
      const bar = measureBars(page);
      if (bar) bars.push({ ...bar, theme });
    }
    return { rows, bars, visited };
  };

  const darkSweep = await sweep('dark');
  const lightSweep = await sweep('light');
  applyTheme(savedTheme);
  await sleep(200);
  for (const id of seeded.projects) await window.eduGame.deleteProjects([id]);
  for (const id of seeded.games) await window.eduGame.deleteGames([id]);
  for (const id of seeded.sessions) await window.eduGame.deleteSessions([id]);
  for (const id of seeded.docs) await window.eduGame.deleteLessonDocument(id);
  // Read the stores back AFTER the deletes: a snapshot taken before them would always
  // report the probe rows as still present.
  const after = await window.eduGame.getLibrary();
  const projects = await window.eduGame.listProjects();
  const docs = await window.eduGame.listLessonLibrary();
  state.db = after;
  state.projects = await window.eduGame.listProjects();
  state.lessonLibrary = null;
  render();
  await sleep(300);
  return JSON.stringify({
    dark: darkSweep.rows,
    light: lightSweep.rows,
    bars: [...darkSweep.bars, ...lightSweep.bars],
    visited: darkSweep.visited,
    cleanup: {
      gamesLeft: (after.games || []).filter(g => String(g.title || '').startsWith(SEED_PREFIX)).length,
      sessionsLeft: (after.sessions || []).filter(s => String(s.playerName || '').startsWith(SEED_PREFIX)).length,
      projectsLeft: (projects || []).filter(p => String(p.title || '').startsWith(SEED_PREFIX)).length,
      docsLeft: (Array.isArray(docs) ? docs : []).filter(d => String(d.name || '').startsWith(SEED_PREFIX)).length,
      seeded: Object.keys(seeded).reduce((n, k) => n + seeded[k].length, 0)
    }
  });
})()`;

(async () => {
  const cdp = await connect();
  const scenario = SCENARIO.replace('PAGES_PLACEHOLDER', JSON.stringify(PAGES));
  const out = JSON.parse(await cdp.evaluate(scenario));
  const dark = out.dark;
  const light = out.light;
  const find = (rows, needle) => rows.find(r => r.dark.includes(needle));

  check('the walk visited every page', out.visited.length === PAGES.length && out.visited[0] === 'library', out.visited.join(','));
  check('the three pages that carry dark: markup were among them',
    ['settings', 'create', 'create-wizard'].every(p => dark.some(r => r.page === p)),
    [...new Set(dark.map(r => r.page))].join(','));
  // #334155 is not one of the values the shell.css translation table rewrites, so the only
  // rule that can paint this border in dark mode is the `dark:` variant itself.
  const DARK_EDGE = 'rgb(51, 65, 85)';
  const keyed = find(dark, 'dark:border-[#334155]');
  check('a dark: border really applies when the app is dark',
    Boolean(keyed) && keyed.edge === DARK_EDGE, keyed ? `${keyed.sig} → ${keyed.edge}` : 'no element carrying dark:border-[#334155] found');
  const keyedLight = find(light, 'dark:border-[#334155]');
  check('and stays off when the app is light',
    Boolean(keyedLight) && keyedLight.edge !== DARK_EDGE, keyedLight ? `${keyedLight.sig} → ${keyedLight.edge}` : 'no element carrying dark:border-[#334155] found');

  const islands = dark.filter(r => r.onWhite);
  check('no dark:-classed element sits on a white card in dark mode', islands.length === 0,
    islands.slice(0, 5).map(r => `${r.page} ${r.sig} on ${r.own}`).join(' | '));

  const invisible = dark.filter(r => r.ratio < 3);
  check('no dark:-classed text drops below 3:1', invisible.length === 0,
    invisible.slice(0, 5).map(r => `${r.ratio} ${r.page} ${r.sig}`).join(' | '));

  const median = () => { const s = dark.map(r => r.ratio).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

  const weak = dark.filter(r => r.ratio < 4.5);
  check('no dark-mode text carrying a dark: class sits below 4.5:1', weak.length === 0,
    weak.length ? weak.slice(0, 6).map(r => `${r.page} ${r.ratio}:1 ${r.color} on ${r.bg} "${r.sig}"`).join(' | ')
      : `0 of ${dark.length} (worst ${Math.min(...dark.map(r => r.ratio))}, median ${median()})`);

  check('the typical dark-mode text is comfortably legible', median() >= 8, `median ${median()} over ${dark.length} elements`);

  // #165: the walk always collected the light half too but nothing ever read it. Two things
  // came out of looking: the step chips failed in light as well (below), and light has its own
  // sub-4.5:1 set that has nothing to do with dark mode (status pills on tinted plates).
  // The chips are pinned exactly; the light set is only pinned to a ceiling, because shrinking
  // it means re-choosing the semantic pill palette — a decision, not a fix.
  const chip = r => r.dark.includes('dark:bg-[#262c55]');
  const chipsDark = dark.filter(chip);
  const chipsLight = light.filter(chip);
  const worst = rows => rows.length ? Math.min(...rows.map(r => r.ratio)) : 0;
  check('every step chip clears 4.5:1 in BOTH themes',
    chipsDark.length >= 5 && chipsLight.length >= 5 && worst(chipsDark) >= 4.5 && worst(chipsLight) >= 4.5,
    `dark ${chipsDark.length} chips worst ${worst(chipsDark)} | light ${chipsLight.length} chips worst ${worst(chipsLight)}`);

  const weakLight = light.filter(r => r.ratio < 4.5);
  check('light mode keeps its known sub-4.5:1 set from growing', weakLight.length <= 32,
    `${weakLight.length} of ${light.length} (worst ${worst(weakLight)}) — ` +
    [...new Set(weakLight.map(r => `${r.color} on ${r.bg}`))].slice(0, 3).join(' | '));

  // The hint ink is the one pair #160 swapped: it must read as the muted slate of each
  // theme, not as one value for both.
  const hintDark = dark.find(r => r.page === 'settings' && r.dark.includes('dark:text-[#94a3b8]'));
  const hintLight = light.find(r => r.page === 'settings' && r.dark.includes('dark:text-[#94a3b8]'));
  check('hint text uses the light slate on dark cards and the dark slate on white',
    Boolean(hintDark) && hintDark.color === 'rgb(148, 163, 184)'
      && Boolean(hintLight) && hintLight.color === 'rgb(100, 116, 139)',
    `dark ${hintDark && hintDark.color} / light ${hintLight && hintLight.color}`);

  // #164: the four batch-selection bars. `page` is the page that drew them, so a bar that
  // never rendered (empty store) shows up here as a missing page, not as a pass.
  const bars = out.bars;
  const darkBars = bars.filter(b => b.theme === 'dark');
  const lightBars = bars.filter(b => b.theme === 'light');
  const controls = bar => [bar.label, bar.count, bar.del, bar.clear].filter(Boolean);

  check('all four selection bars were measured, in both themes',
    ['library', 'lesson-plans', 'my-projects', 'sessions'].every(p => darkBars.some(b => b.page === p) && lightBars.some(b => b.page === p)),
    `${darkBars.length} dark / ${lightBars.length} light — ${[...new Set(bars.map(b => b.page))].join(',')}`);

  const darkWeak = darkBars.flatMap(bar => controls(bar).filter(c => c.ratio < 4.5).map(c => `${bar.page} ${c.color} ${c.ratio}:1`));
  check('every control in a dark selection bar clears 4.5:1', darkWeak.length === 0,
    darkWeak.length ? darkWeak.slice(0, 6).join(' | ') : darkBars.map(bar => `${bar.page} ${controls(bar).map(c => c.ratio).join('/')}`).join(' | '));

  const darkFlat = darkBars.filter(bar => bar.barBg === bar.cardBg).map(bar => `${bar.page} ${bar.barBg}`);
  check('the dark strip keeps a surface of its own instead of melting into the card', darkFlat.length === 0,
    darkFlat.length ? darkFlat.join(' | ') : darkBars.map(bar => `${bar.page} ${bar.barBg}`).join(' | '));

  // chipPlate is the composite the eye actually gets, so a translucent veil passes and an
  // opaque white square does not. The detail always prints it: a resolver that quietly
  // returned black would read as a suspicious rgb(0, 0, 0), not as a pass.
  // A number the harness cannot read is worse than a failing number: NaN > 200 is false, so
  // an unresolved plate would silently "pass" the white-square check. Only library and
  // projects have a chip, so two is the expected count.
  const chipsMeasured = darkBars.filter(bar => bar.chipPlate);
  const unresolved = chipsMeasured.filter(bar => !['r', 'g', 'b'].every(k => Number.isInteger(bar.chipPlate[k])));
  check('the chip paint resolved to real pixels', chipsMeasured.length === 2 && unresolved.length === 0,
    `${chipsMeasured.length} chip(s) measured, ${unresolved.length} unresolved`);

  const brightChips = darkBars.filter(bar => bar.chipPlate && bar.chipPlate.r > 200 && bar.chipPlate.g > 200 && bar.chipPlate.b > 200)
    .map(bar => `${bar.page} rgb(${bar.chipPlate.r}, ${bar.chipPlate.g}, ${bar.chipPlate.b})`);
  check('no pick chip stays a white square on a dark card', brightChips.length === 0,
    brightChips.length ? brightChips.join(' | ')
      : darkBars.filter(bar => bar.chipPlate).map(bar => `${bar.page} ${bar.chipBg} → rgb(${bar.chipPlate.r}, ${bar.chipPlate.g}, ${bar.chipPlate.b})`).join(' | ') || 'no chip on these pages');

  const LIGHT_BAR = 'rgb(248, 247, 255)';
  const lightOff = lightBars.filter(bar => bar.barBg !== LIGHT_BAR || controls(bar).some(c => c.ratio < 4.5))
    .map(bar => `${bar.page} ${bar.barBg} ${controls(bar).map(c => c.ratio).join('/')}`);
  const lightWorst = Math.min(...lightBars.flatMap(controls).map(c => c.ratio));
  check('light mode is untouched: same strip colour, every control still 4.5:1', lightOff.length === 0,
    lightOff.length ? lightOff.slice(0, 4).join(' | ') : `${lightBars.length} bars on ${LIGHT_BAR}, worst control ${lightWorst}:1`);

  check('the probe rows it seeded were all deleted again',
    out.cleanup.seeded === 4 && out.cleanup.gamesLeft === 0 && out.cleanup.projectsLeft === 0
      && out.cleanup.sessionsLeft === 0 && out.cleanup.docsLeft === 0, JSON.stringify(out.cleanup));

  console.log(failures ? `\n${failures} dark-theme check(s) failed` : '\nAll dark-theme checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
