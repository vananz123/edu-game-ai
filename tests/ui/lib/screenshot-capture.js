// screenshot-capture.js — capture page screenshots at an exact projector size.
//
// The classroom projector is the delivery target for every gameplay screen
// (update_UI.txt §7, §14), and until now nothing in the repo could prove what
// those screens actually look like: `grep capturePage|toPNG` returned no hits.
// Numeric checks (ui-fullscreen-density-check.js) prove offsets and font sizes
// but cannot show a clipped label, an overlapped block or an unattractive
// composition. This module adds the missing half.
//
// No new dependency: `connect()` from ui-check-lib.js already exposes the raw
// CDP `send()`, so Page.captureScreenshot and Emulation.setDeviceMetricsOverride
// are available directly.
//
// Sizes are applied with Emulation.setDeviceMetricsOverride rather than by
// resizing the OS window: the real window size on this machine is whatever the
// desktop allows (1366x768 minus taskbar = 1280x721), and a projector run must
// be measured at the resolution the projector will really use.
const fs = require('node:fs');
const path = require('node:path');

const SHOTS_DIR = path.join(__dirname, '..', 'shots');

/** Projector resolutions required by update_UI.txt §14. */
const PROJECTOR_SIZES = [
  { width: 1920, height: 1080, label: '1920x1080' },
  { width: 1366, height: 768, label: '1366x768' }
];

/**
 * Force the renderer viewport to an exact size and device pixel ratio.
 * Pass `null` to restore the real window metrics.
 */
async function setViewport(send, size) {
  if (!size) {
    const r = await send('Emulation.clearDeviceMetricsOverride');
    return r;
  }
  const r = await send('Emulation.setDeviceMetricsOverride', {
    width: size.width,
    height: size.height,
    deviceScaleFactor: 1,
    mobile: false
  });
  return r;
}

/**
 * Capture the current page as PNG bytes.
 *
 * `captureBeyondViewport: false` keeps the image to exactly the emulated
 * viewport, so a 1920x1080 file is really 1920x1080 and not the full scroll
 * height of an over-long page (which is itself a defect worth failing on,
 * see `measureOverflow`).
 */
async function capture(send, name, timeoutMs = 8000) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  let r;
  try {
    // The `send()` in ui-check-lib.js has no timeout of its own: a hidden or
    // occluded window cannot be composited, Chromium simply never answers, and
    // the promise hangs forever instead of letting the check report anything.
    // Race it so an unavailable image degrades to `error` below.
    r = await Promise.race([
      send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        fromSurface: true
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`capture timed out after ${timeoutMs}ms (window not composited)`)), timeoutMs))
    ]);
  } catch (e) {
    // A hidden/occluded window cannot be composited, so Chromium never answers.
    // Measurements below still run — only the image is unavailable.
    return { file: null, error: e.message };
  }
  const data = r?.result?.data;
  if (!data) return { file: null, error: 'Page.captureScreenshot returned no data' };
  const file = path.join(SHOTS_DIR, name + '.png');
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return { file, error: null };
}

/**
 * Layout defects that a screenshot makes obvious but that are worth asserting
 * numerically as well, because a human reviewing 20 images can miss one.
 *
 * Returned shape is deliberately flat and unnamed-by-selector walls: the caller
 * decides thresholds.
 */
const MEASURE_LAYOUT = `
  ((docSel) => {
    const host = docSel ? document.querySelector(docSel) : null;
    const win = host ? host.contentWindow : window;
    const doc = host ? host.contentDocument : document;
    const px = v => parseFloat(v) || 0;
    const cs = el => win.getComputedStyle(el);
    const rootEl = doc.documentElement;
    const viewport = { w: win.innerWidth, h: win.innerHeight };
    // Font floor and clipping describe the surface under test, not shared chrome:
    // the sidebar's 8px brand subtitle belongs to the app shell and would mask a
    // real shrink inside a page.
    const textScope = TEXT_SCOPE_SEL ? doc.querySelector(TEXT_SCOPE_SEL) : null;
    // Only genuinely PAINTED content counts.
    //
    // offsetParent/offsetWidth are not enough: while a modal is open the app
    // sets .app-shell to display:none, yet Chromium keeps layout boxes for a
    // display:none subtree, so sidebar labels (8px) and the 1398px-tall shell
    // were counted as "smallest text" and as "outside the viewport" even though
    // nothing on them is painted. checkVisibility() walks the ancestor chain
    // (display, visibility, opacity, content-visibility) and is the honest test.
    // Without this the play-surface check reported a font-floor failure naming a
    // hidden element - a false positive that buries the real ones.
    const painted = el => el === doc.body || el === rootEl ||
      (typeof el.checkVisibility === 'function'
        ? el.checkVisibility({ visibilityProperty: true, opacityProperty: true, contentVisibilityAuto: true })
        : Boolean(el.offsetParent || el.getClientRects().length));
    // Every visible element that carries text; used to detect clipping and to
    // report the smallest font actually on screen (the defect that the
    // presentation window had at 12px).
    const textEls = [...doc.querySelectorAll('body *')].filter(el => {
      if (!painted(el)) return false;
      if (textScope && !textScope.contains(el)) return false;
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      return own && el.offsetWidth > 0 && el.offsetHeight > 0;
    });
    const fonts = textEls.map(el => px(cs(el).fontSize)).filter(n => n > 0);
    // Which element is smallest? Reporting it makes the failure actionable
    // instead of just a number.
    let smallest = null;
    for (const el of textEls) {
      const f = px(cs(el).fontSize);
      if (f > 0 && (!smallest || f < smallest.font)) {
        smallest = { font: f, tag: el.tagName.toLowerCase(), cls: String(el.className || el.id || '').slice(0, 50), text: el.textContent.trim().slice(0, 30) };
      }
    }
    // Text clipping: scroll size exceeds the client box, which means content is
    // cut off rather than wrapped. Elements whose own overflow is visible are
    // excluded — an emoji's glyph box is taller than its line-height and would
    // otherwise be reported as clipped even though nothing is hidden.
    const clipped = textEls.filter(el => {
      const s = cs(el);
      const canScrollX = s.overflowX === 'auto' || s.overflowX === 'scroll';
      const canScrollY = s.overflowY === 'auto' || s.overflowY === 'scroll';
      const visibleX = s.overflowX === 'visible';
      const visibleY = s.overflowY === 'visible';
      if (visibleX && visibleY) return false;
      return (!canScrollX && !visibleX && el.scrollWidth > el.clientWidth + 2)
          || (!canScrollY && !visibleY && el.scrollHeight > el.clientHeight + 2);
    }).map(el => ({
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').slice(0, 60),
      text: el.textContent.trim().slice(0, 40)
    }));
    // Anything painted outside the viewport is unreachable for a projector
    // audience even if it is technically in the DOM.
    //
    // Two exclusions, both essential or the number is meaningless:

    //   1. hidden chrome (a display:none app shell behind a modal) is not painted;
    //   2. content inside a SCROLLABLE PANEL is reachable by scrolling, which is
    //      normal for an editor form (.modal has max-height 90vh, overflow auto).
    //      Counting it reported .modal-body as 189px "outside" while its parent
    //      .modal sat correctly inside the viewport.
    //   The game stage is NOT such a panel: a projector audience cannot scroll,
    //   so its overflowing children still count here (and innerScrollers also
    //   fails the stage itself).
    const PANEL_SELECTOR = '.modal, .modal-body, .modal-card, .drawer, .panel';
    const inScroller = el => {
      // The game-stage modal is the projector surface, not a form: do not excuse
      // its overflow.
      if (el.closest('.game-stage')) return false;
      for (let n = el.parentElement; n && n !== doc.body; n = n.parentElement) {
        if (!n.matches(PANEL_SELECTOR)) continue;
        const s = cs(n);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 2) return true;
        if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true;
      }
      return false;
    };
    const outside = [...doc.querySelectorAll('body *')].filter(el => {
      if (!painted(el) || inScroller(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      return r.left < -2 || r.top < -2 || r.right > viewport.w + 2 || r.bottom > viewport.h + 2;
    }).map(el => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || el.id || '').slice(0, 40),
        text: el.textContent.trim().slice(0, 24),
        box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
        // How many px it hangs past the closest edge; the actionable number.
        pastBy: Math.round(Math.max(-r.left, -r.top, r.right - viewport.w, r.bottom - viewport.h))
      };
    });
    // On a normal page the document scrolls vertically, so only sideways escape
    // is a layout defect there; the surface checks keep using the full count.
    const outsideX = outside.filter(o => o.box[0] < -2 || o.box[2] > viewport.w + 2);
    // Real overlap only. If one box *contains* the other (e.g. .options inside
    // .question-panel) that is nesting, not a layout collision.
    const q = doc.querySelector('.stage-question, .question-text');
    const grid = doc.querySelector('.answer-grid, .options');
    let overlap = false;
    if (q && grid) {
      const a = q.getBoundingClientRect(), b = grid.getBoundingClientRect();
      const contains = (o, i) => i.top >= o.top - 2 && i.bottom <= o.bottom + 2 && i.left >= o.left - 2 && i.right <= o.right + 2;
      if (!contains(a, b) && !contains(b, a)) {
        overlap = a.bottom > b.top + 2 && b.bottom > a.top + 2 && a.right > b.left + 2 && b.right > a.left + 2;
      }
    }
    return {
      viewport,
      docHeight: rootEl.scrollHeight,
      scrolls: rootEl.scrollHeight > viewport.h + 2,
      // A scroll container inside the stage hides content from the class just
      // as effectively as a clipped box, and a projector audience cannot scroll.
      innerScrollers: [...doc.querySelectorAll('body *')].filter(el => {
        if (!painted(el)) return false;
        const s = cs(el);
        const scrollsY = (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2;
        const scrollsX = (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2;
        return scrollsY || scrollsX;
      }).map(el => String(el.className || el.tagName).slice(0, 50)),
      minFont: fonts.length ? Math.min(...fonts) : 0,
      smallest,
      clippedCount: clipped.length,
      clipped: clipped.slice(0, 6),
      outsideCount: outside.length,
      outside: outside.slice(0, 6),
      outsideXCount: outsideX.length,
      outsideX: outsideX.slice(0, 6),
      // A page taller than the viewport is fine only if it really scrolls.
      docScrollable: cs(rootEl).overflowY !== 'hidden' || cs(doc.body).overflowY !== 'hidden',
      questionAnswerOverlap: overlap
    };
  })(DOC_SEL)`;

/** Measure the current page (or an iframe inside it) with the shared probe. */
async function measureLayout(evaluate, docSelector, textScopeSelector) {
  return evaluate(MEASURE_LAYOUT
    .replaceAll('DOC_SEL', JSON.stringify(docSelector || null))
    .replaceAll('TEXT_SCOPE_SEL', JSON.stringify(textScopeSelector || null)));
}

/**
 * List CDP page targets. ui-check-lib's `connect()` deliberately binds to the
 * main `index.html` window; the presentation window is a different target with
 * a different URL, so it must be found and connected to separately.
 */
async function listTargets(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return (await res.json()).filter(t => t.type === 'page');
}

/** Find a page target whose URL matches `pattern`. */
async function findTarget(port, pattern) {
  return (await listTargets(port)).find(t => pattern.test(t.url));
}

/**
 * Set the emulated viewport and wait until the renderer really reports it.
 *
 * Device metrics are applied asynchronously, so a `setViewport()` that resolves
 * has not necessarily resized the page yet. Opening or measuring in that window
 * captures the PREVIOUS size's layout — the bug that made a 1920x1080 run report
 * six elements outside a 1366x768 viewport. Always use this instead of a bare
 * `setViewport` before driving the UI.
 */
async function setViewportAndWait(ctx, size, timeoutMs = 5000) {
  await setViewport(ctx.send, size);
  if (!size) return;
  const deadline = Date.now() + timeoutMs;
  let got = null;
  while (Date.now() < deadline) {
    got = await ctx.evaluate(`[innerWidth, innerHeight]`);
    if (got && got[0] === size.width && got[1] === size.height) return got;
    await new Promise(r => setTimeout(r, 60));
  }
  throw new Error(`viewport did not become ${size.width}x${size.height} (got ${JSON.stringify(got)})`);
}

/**
 * Apply the projector-surface assertions that every measured screen owes.
 *
 * These are the same five properties `ui-presentation-check.js` proves for the
 * presentation window, generalised so the *main* window — where teachers spend
 * their time — is measured the same way. Kept here rather than in each check so
 * a new check cannot quietly apply four of the five.
 *
 * `opts.fontFloor` is the minimum computed font size in px. It differs per
 * surface on purpose: a projector board can afford 20px, while a dense editor
 * toolbar legitimately uses 12–13px labels, so the caller states its contract.
 * `opts.textScopeSelector` limits the font/clipping sample to the surface under
 * test (shared chrome such as the sidebar is not part of that contract).
 * `opts.pageMode` is for ordinary app pages: the document scrolls vertically by
 * design, so only sideways escape and nested scroll boxes are defects.
 */
function assertLayout(check, label, m, opts = {}) {
  const fontFloor = opts.fontFloor ?? 12;
  const prefix = opts.prefix ? `${opts.prefix} ${label}` : label;
  const where = m.smallest ? `${m.smallest.tag}.${m.smallest.cls} "${m.smallest.text}"` : 'no text';
  check(`${prefix}: smallest text >= ${fontFloor}px`, m.minFont >= fontFloor,
    `${(m.minFont || 0).toFixed(1)}px (${where})`);
  check(`${prefix}: no clipped text`, m.clippedCount === 0,
    m.clippedCount ? JSON.stringify(m.clipped[0]) : '');
  if (opts.pageMode) {
    check(`${prefix}: nothing escapes horizontally`, m.outsideXCount === 0,
      m.outsideXCount ? `${m.outsideXCount} element(s), worst: ${JSON.stringify(m.outsideX[0])}` : '');
    check(`${prefix}: no inner scroll box hides content`, m.innerScrollers.length === 0,
      m.innerScrollers.join(', '));
    check(`${prefix}: a taller page can scroll`, !m.scrolls || m.docScrollable,
      `doc ${m.docHeight}px vs viewport ${m.viewport.h}px, scrollable=${m.docScrollable}`);
  } else {
    check(`${prefix}: nothing outside the viewport`, m.outsideCount === 0,
      m.outsideCount ? `${m.outsideCount} element(s), worst: ${JSON.stringify(m.outside[0])}` : '');
    check(`${prefix}: no page scroll`, !m.scrolls, `${m.docHeight} vs ${m.viewport.h}`);
    if (opts.innerScrollAreas !== 0) {
      check(`${prefix}: no inner scroll area hides content`,
        m.innerScrollers.length === (opts.innerScrollAreas || 0), m.innerScrollers.join(', '));
    }
  }
  if (opts.questionAnswerOverlap === 'assert') {
    check(`${prefix}: question and answers do not overlap`, !m.questionAnswerOverlap);
  }
  return m;
}

/**
 * The measurement rig shared by the surface checks (docs/UI-PLAN-V2.md Phase B).
 *
 * One call = set the viewport, settle animations, measure, capture a PNG, and
 * apply the five projector assertions. Everything is measured at the emulated
 * size, never at whatever size the OS window happens to be — a check that does
 * not pin the viewport cannot notice a 1366×768-only defect at all.
 *
 * Passing `null` as the size restores the real window metrics and measures the
 * live window, which is only useful for diagnosing the emulated run.
 *
 * `ctx` is the object returned by `ui-check-lib.connect()` (`{ send, evaluate }`).
 * `beforeMeasure` runs after the viewport is applied and animations are settled,
 * for checks that must drive the UI *at that size*.
 */
async function measureAt(ctx, size, name, opts = {}) {
  // `check` is passed in by the caller rather than required here: this file
  // lives in `tests/ui/lib/`, so `require('../manual/lib/ui-check-lib')` would
  // resolve to a path that does not exist, and requiring the caller's module
  // from inside a module the caller requires is a cycle for no benefit.
  const check = opts.check;
  if (typeof check !== 'function') throw new Error('measureAt requires opts.check (from ui-check-lib)');
  const label = opts.label || (size ? size.label : 'window');

  await setViewportAndWait(ctx, size);
  // Two frames + a beat so a layout pass triggered by the resize has finished.
  await ctx.evaluate(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => r(true), 180))))`);

  if (opts.beforeMeasure) await opts.beforeMeasure(ctx, label);

  // Animations are suspended while the window is backgrounded, so `.modal` sits
  // at the first frame of its pop-in (scale 0.92) and every measured px comes
  // out ~8% small. Finish them before reading geometry.
  await ctx.evaluate(`(docSel => {
    const host = docSel ? document.querySelector(docSel) : null;
    const doc = host ? host.contentDocument : document;
    const win = host ? host.contentWindow : window;
    doc.querySelectorAll('.modal, .modal-backdrop').forEach(el =>
      el.getAnimations().forEach(a => { try { a.finish(); } catch {} }));
    return { docHeight: doc.documentElement.scrollHeight, innerHeight: win.innerHeight };
  })(${JSON.stringify(opts.docSelector || null)})`);
  await new Promise(r => setTimeout(r, 200));

  const m = await measureLayout(ctx.evaluate, opts.docSelector || null, opts.textScopeSelector || null);
  const shot = await capture(ctx.send, name);

  console.log(`  ${label.padEnd(10)} ${m.viewport.w}x${m.viewport.h}  minFont ${(m.minFont || 0).toFixed(0)}px  clipped ${m.clippedCount}  outside ${m.outsideCount}  scrolls ${m.scrolls}  -> ${shot.file || '(no image: ' + shot.error + ')'}`);
  shot.assertion = (opts.requireScreenshot !== false)
    ? check(`${label}: screenshot captured`, Boolean(shot.file), shot.file || shot.error)
    : null;

  if (opts.assertLayout !== false) assertLayout(check, label, m, opts);
  return { m, shot, label };
}

module.exports = {
  PROJECTOR_SIZES,
  SHOTS_DIR,
  setViewport,
  setViewportAndWait,
  capture,
  measureLayout,
  measureAt,
  assertLayout,
  listTargets,
  findTarget
};
