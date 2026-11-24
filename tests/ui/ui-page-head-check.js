#!/usr/bin/env node
/**
 * DECISIONS #326 — a page title is 20px, and it must not move the page.
 *
 * Plan item S4-1 ("h1 17px -> 20px"). The font change is typographic ONLY: the head
 * strip is 28px tall and its height comes from the action buttons, not from the
 * title, so enlarging the title must leave the strip and every list below it in
 * exactly the same place. That is what this gate pins — an aesthetic change that
 * silently reflows the page is a layout change and has to be measured as one.
 *
 * Usage: `node tests/ui/ui-page-head-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9347';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const MEASURE = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const nav = name => document.querySelector('.nav-item[data-page="' + name + '"]');
  const out = {};
  for (const page of ['library', 'my-projects']) {
    nav(page).click();
    await sleep(400);
    const head = document.querySelector('.page-head');
    const title = document.querySelector('.page-head h1');
    const actions = document.querySelector('.page-head-actions');
    if (!head || !title) { out[page] = null; continue; }
    const hb = head.getBoundingClientRect();
    const tb = title.getBoundingClientRect();
    const ab = actions ? actions.getBoundingClientRect() : null;
    out[page] = {
      headHeight: Math.round(hb.height * 10) / 10,
      headWidth: Math.round(hb.width),
      titleSize: getComputedStyle(title).fontSize,
      titleHeight: Math.round(tb.height * 10) / 10,
      titleLines: Math.round(tb.height / (parseFloat(getComputedStyle(title).lineHeight) || 1)),
      overlap: ab ? Math.round(Math.min(tb.right, ab.right) - Math.max(tb.left, ab.left)) > 0
        && Math.round(Math.min(tb.bottom, ab.bottom) - Math.max(tb.top, ab.top)) > 0 : false,
      actionsTop: ab ? Math.round(ab.top) : null,
      headTop: Math.round(hb.top)
    };
  }
  nav('library').click();
  await sleep(300);
  return out;
})()`;

(async () => {
  const cdp = await connect();
  const out = {};

  for (const [width, height] of [[1280, 800], [1366, 768], [1920, 1080]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const raw = await cdp.evaluate(MEASURE);
    out[`${width}x${height}`] = raw.result ? raw.result.value : raw;
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  const sizes = Object.keys(out);
  const all = sizes.map(size => out[size]).filter(Boolean);

  check('every size reports a head strip on both pages',
    all.length === sizes.length && all.every(entry => Boolean(entry.library) && Boolean(entry['my-projects'])),
    sizes.join(' '));

  const titles = all.flatMap(entry => Object.values(entry)).map(page => page.titleSize);
  check('every page title is 20px', titles.length >= 4 && titles.every(size => size === '20px'), titles.join(' '));

  const heights = all.flatMap(entry => Object.values(entry)).map(page => page.headHeight);
  check('the head strip stays 28px — the title does not push the page down',
    heights.every(height => height === 28), heights.join(' '));

  const overlaps = all.flatMap(entry => Object.values(entry)).map(page => page.overlap);
  check('the title never collides with the buttons on its right',
    overlaps.every(value => value === false), overlaps.join(' '));

  const lines = all.flatMap(entry => Object.values(entry)).map(page => page.titleLines);
  check('the title stays on one line', lines.every(value => value === 1), lines.join(' '));

  // The strip geometry must be identical across page types, otherwise one page has
  // quietly grown a taller header than the other (#314: one ceiling for every page).
  const perSize = sizes.map(size => {
    const entry = out[size] || {};
    return [entry.library && entry.library.headHeight, entry['my-projects'] && entry['my-projects'].headHeight];
  });
  check('library and projects share the same head geometry',
    perSize.every(([a, b]) => a === b), JSON.stringify(perSize));

  const failed = results.filter(entry => !entry.ok).length;
  console.log('');
  console.log(failed === 0
    ? `ui-page-head-check: ${results.length}/${results.length} passed`
    : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
