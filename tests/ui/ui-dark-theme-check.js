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
 *   - no text carrying a `dark:` class may drop below 3:1, and the sub-4.5:1 population
 *     may not grow past the handful of decorative step badges left knowingly.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 * `node tests/ui/ui-dark-theme-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9349';
const { connect } = require('../manual/lib/ui-check-lib');

const PAGES = ['home', 'library', 'settings', 'create', 'create-wizard', 'lesson-plans', 'my-projects', 'sessions'];

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const SCENARIO = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // A fresh profile opens the setup onboarding into #modalRoot a moment after load, which
  // would replace the pages this walk measures. Canonical guard.
  for (let i = 0; i < 40; i++) { if (document.querySelector('#modalRoot .setup-fullscreen')) break; await sleep(100); }
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);

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
        ratio: Math.round(ratio(ink, bg) * 100) / 100,
        onWhite: nearWhite(bg)
      });
    }
    return rows;
  };

  const savedTheme = (state.settings.preferences || {}).theme || 'light';
  const sweep = async theme => {
    applyTheme(theme);
    await sleep(350);
    const rows = [];
    const visited = [];
    for (const page of PAGES_PLACEHOLDER) {
      navigate(page);
      await sleep(900);
      visited.push(page);
      for (const r of walk()) rows.push({ ...r, page });
    }
    return { rows, visited };
  };

  const darkSweep = await sweep('dark');
  const lightSweep = await sweep('light');
  applyTheme(savedTheme);
  await sleep(200);
  return JSON.stringify({ dark: darkSweep.rows, light: lightSweep.rows, visited: darkSweep.visited });
})()`;

(async () => {
  const cdp = await connect();
  const scenario = SCENARIO.replace('PAGES_PLACEHOLDER', JSON.stringify(PAGES));
  const out = JSON.parse(await cdp.evaluate(scenario));
  const dark = out.dark;
  const light = out.light;
  const find = (rows, needle) => rows.find(r => r.dark.includes(needle));

  check('the walk visited every page', out.visited.length === PAGES.length && out.visited[0] === 'home', out.visited.join(','));
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

  const weak = dark.filter(r => r.ratio < 4.5);
  check('the sub-4.5:1 population stays a known handful of step badges', weak.length <= 8,
    `${weak.length} of ${dark.length} (worst ${Math.min(...dark.map(r => r.ratio))})`);

  const median = () => { const s = dark.map(r => r.ratio).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  check('the typical dark-mode text is comfortably legible', median() >= 8, `median ${median()} over ${dark.length} elements`);

  // The hint ink is the one pair #160 swapped: it must read as the muted slate of each
  // theme, not as one value for both.
  const hintDark = dark.find(r => r.page === 'settings' && r.dark.includes('dark:text-[#94a3b8]'));
  const hintLight = light.find(r => r.page === 'settings' && r.dark.includes('dark:text-[#94a3b8]'));
  check('hint text uses the light slate on dark cards and the dark slate on white',
    Boolean(hintDark) && hintDark.color === 'rgb(148, 163, 184)'
      && Boolean(hintLight) && hintLight.color === 'rgb(100, 116, 139)',
    `dark ${hintDark && hintDark.color} / light ${hintLight && hintLight.color}`);

  console.log(failures ? `\n${failures} dark-theme check(s) failed` : '\nAll dark-theme checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
