// scene-preview.js — render sample scenes and save PNGs for a visual review.
//
// Why this exists: docs/DECISIONS.md #70 and #72 both changed how an
// illustration is composed, and neither change can be judged by a string test.
// A scene can pass every assertion and still be ugly, so the layers have to be
// looked at. This script renders the REAL renderer code (dist/), not a mock, so
// what you see is what a teacher's screen shows.
//
// Usage (the app must be running with a debugging port):
//   npm run build
//   npx electron . --remote-debugging-port=9341
//   node tests/manual/scene-preview.js 9341 math science history          # a few
//   node tests/manual/scene-preview.js 9341 all                          # all 24
const fs = require('fs');
const path = require('path');
const { connect } = require('./lib/ui-check-lib');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'tests', 'manual', 'out');

const CATEGORIES = process.argv.slice(2).filter((arg) => !/^\d+$/.test(arg));
// The 24 registered category ids, in registry order. `all` renders every scene;
// with no argument a representative few are rendered as a smoke check.
const ALL_CATEGORIES = [
  'animals', 'plants', 'space', 'human-body', 'transport', 'safety', 'environment', 'history',
  'geography', 'jobs', 'sports', 'music', 'art', 'math', 'language', 'science', 'technology',
  'health', 'family', 'community', 'weather', 'food', 'objects', 'water-world',
];
const targets = !CATEGORIES.length
  ? ['math', 'science', 'history']
  : CATEGORIES.includes('all')
    ? ALL_CATEGORIES
    : CATEGORIES;

function readBuilt(rel) {
  const file = path.join(ROOT, 'dist', 'src', 'renderer', rel);
  if (!fs.existsSync(file)) throw new Error(`missing build output ${file} — run npm run build first`);
  return fs.readFileSync(file, 'utf8');
}

(async () => {
  const { ws, send } = await connect();
  await send('Page.enable');

  const sources = [readBuilt('shared.js'), readBuilt('features/icon-data.js'), readBuilt('features/game-illustration.js')];
  // Classic scripts share one global scope, so they are concatenated once and
  // evaluated in-page. What runs here is the code `npm run build` ships.
  const runtime = sources.map((src) => src.replace(/<\/script>/gi, '<\\/script>')).join('\n');

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const category of targets) {
    const prep = await send('Runtime.evaluate', {
      expression: `(() => {
        ${runtime}
        const old = document.getElementById('__scene_preview__');
        if (old) old.remove();
        const host = document.createElement('div');
        host.id = '__scene_preview__';
        // Pinned at the top-left of the viewport at exactly 1:1, so the clip
        // rectangle below is the whole scene and nothing is scaled.
        host.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:200px;z-index:2147483647;overflow:hidden;background:#0f1220';
        const css = document.createElement('style');
        css.textContent = '.preview{display:block;width:320px;height:200px}.preview>svg{display:block;width:320px;height:200px}';
        host.appendChild(css);
        host.insertAdjacentHTML('beforeend',
          stageIllustrationHtml({ contentCategory: ${JSON.stringify(category)}, iconName: '' },
            { gameSetup: { illustrationMode: 'auto' } }, 'preview'));
        document.body.appendChild(host);
        const svg = host.querySelector('svg');
        return svg ? svg.outerHTML.length : 0;
      })()`,
      returnByValue: true,
    });
    const length = prep.result?.result?.value;
    if (prep.result?.exceptionDetails || !length) {
      throw new Error(`${category}: renderer produced no svg (${JSON.stringify(prep.result?.exceptionDetails || length)})`);
    }
    await new Promise((r) => setTimeout(r, 350));

    // 2x for a readable review image; the element itself is 320x200 at 0,0.
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 320, height: 200, scale: 2 },
    });
    const data = shot.result?.data;
    if (!data) throw new Error('screenshot failed for ' + category);
    const file = path.join(OUT_DIR, `scene-${category}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`wrote ${file}  (${length} bytes of svg)`);
  }

  await send('Runtime.evaluate', {
    expression: `(() => { const el = document.getElementById('__scene_preview__'); if (el) el.remove(); return true; })()`,
    returnByValue: true,
  });

  ws.close();
  process.exit(0);
})().catch((e) => {
  console.log('ERR ' + e.message);
  process.exit(1);
});
