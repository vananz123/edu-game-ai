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
async function capture(send, name) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  let r;
  try {
    r = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      fromSurface: true
    });
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
    // Every visible element that carries text; used to detect clipping and to
    // report the smallest font actually on screen (the defect that the
    // presentation window had at 12px).
    const textEls = [...doc.querySelectorAll('body *')].filter(el => {
      if (!el.offsetParent && el !== doc.body) return false;
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
    const outside = [...doc.querySelectorAll('body *')].filter(el => {
      if (!el.offsetParent) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      return r.left < -2 || r.top < -2 || r.right > viewport.w + 2 || r.bottom > viewport.h + 2;
    }).length;
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
        const s = cs(el);
        const scrollsY = (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2;
        const scrollsX = (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2;
        return scrollsY || scrollsX;
      }).map(el => String(el.className || el.tagName).slice(0, 50)),
      minFont: fonts.length ? Math.min(...fonts) : 0,
      smallest,
      clippedCount: clipped.length,
      clipped: clipped.slice(0, 6),
      outsideCount: outside,
      questionAnswerOverlap: overlap
    };
  })(DOC_SEL)
`;

/** Measure the current page (or an iframe inside it) with the shared probe. */
async function measureLayout(evaluate, docSelector) {
  return evaluate(MEASURE_LAYOUT.replace('DOC_SEL', JSON.stringify(docSelector || null)));
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

module.exports = {
  PROJECTOR_SIZES,
  SHOTS_DIR,
  setViewport,
  capture,
  measureLayout,
  listTargets,
  findTarget
};
