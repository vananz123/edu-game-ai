import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Build-artifact guard: every non-TypeScript file the app loads at runtime must
 * actually exist in `dist/`.
 *
 * Why this exists. `npm run build` runs `tsc` (emits .js/.js.map only) and then
 * `copyfiles` for the handful of static assets. Anything not listed there is
 * silently absent from `dist/` — and from the packaged installer, since
 * electron-builder ships `dist/**`. `tsc` cannot catch it (the file is not
 * TypeScript), and no unit test executed the built app, so Presentation Mode
 * loaded `presentation.html` from a path that did not exist (`net::
 * ERR_FILE_NOT_FOUND`) while the whole suite stayed green.
 *
 * The list below is derived from what code actually opens at runtime:
 *   - src/main.ts            -> loadFile('index.html')
 *   - src/presentation/*     -> path.join(__dirname, 'presentation.html')
 *                               path.join(__dirname, 'presentation-preload.js')
 *   - src/index.html         -> <link href="renderer/styles/app.css">
 *   - src/presentation/presentation.html -> <script src="../renderer/features/presentation.js">
 *
 * The last two are produced by `tsc`/`build:css`, so this test also proves the
 * relative paths between them still line up after copying.
 */

const ROOT = path.join(__dirname, '..', '..');

/**
 * The compiled test lives at `dist/tests/unit/*.js`, so ROOT is already the
 * `dist` directory when running from the build output. Detect it rather than
 * assuming, so the same file works from source too.
 */
const BUILD_ROOT = path.basename(ROOT) === 'dist' ? ROOT : path.join(ROOT, 'dist');
const SOURCE_ROOT = path.basename(ROOT) === 'dist' ? path.join(ROOT, '..') : ROOT;

/** Assets copied verbatim by `npm run build` (see scripts.build in package.json). */
const COPIED_ASSETS = [
  'src/index.html',
  'src/renderer/styles/app.css',
  'src/presentation/presentation.html',
  'src/presentation/presentation-preload.js',
  // LAN Classroom Mode: the phone page is served from dist/src/lan/mobile by
  // `startLanServer()`. If it is missing from the installer, every phone gets a
  // 404 while the desktop happily shows "Đã mở phòng".
  'src/lan/mobile/index.html',
  'src/lan/mobile/mobile.css',
  'src/lan/mobile/mobile.js'
];

// 1. Each source asset exists in the repository at all.
for (const rel of COPIED_ASSETS) {
  assert.ok(fs.existsSync(path.join(SOURCE_ROOT, rel)), `missing source asset: ${rel}`);
}

// 2. Each one is produced in dist/ by the build, byte-identical.
//    `app.css` is minified by build:css, so only its presence is asserted.
for (const rel of COPIED_ASSETS) {
  const built = path.join(BUILD_ROOT, rel);
  assert.ok(fs.existsSync(built), `build did not emit ${rel} into dist/ (checked ${built})`);
}
const editedAssets = COPIED_ASSETS.filter((rel) => !rel.endsWith('app.css'));
for (const rel of editedAssets) {
  const src = fs.readFileSync(path.join(SOURCE_ROOT, rel));
  const out = fs.readFileSync(path.join(BUILD_ROOT, rel));
  assert.ok(src.equals(out), `dist/${rel} does not match src/${rel}`);
}

// 2b. app.css is a Tailwind entry that imports the area files (DECISIONS #149).
//     Every import must exist beside it in src and be copied into dist, or a
//     whole area silently disappears from the shipped stylesheet.
const cssEntry = fs.readFileSync(path.join(SOURCE_ROOT, 'src', 'renderer', 'styles', 'app.css'), 'utf8');
const areaImports = [...cssEntry.matchAll(/@import\s+"\.\/([^"]+)"/g)].map((match) => match[1]);
assert.ok(areaImports.length >= 10, `app.css should import its area files, saw ${areaImports.length}`);
for (const name of areaImports) {
  for (const base of [SOURCE_ROOT, BUILD_ROOT]) {
    const file = path.join(base, 'src', 'renderer', 'styles', name);
    assert.ok(fs.existsSync(file), `app.css imports ${name}, which is missing at ${file}`);
  }
}

// 3. The references the two HTML pages make must resolve inside dist/.
//    A wrong relative depth here is how the projector page would 404 its script.
const distHtml = path.join(BUILD_ROOT, 'src', 'presentation', 'presentation.html');
const html = fs.readFileSync(distHtml, 'utf8');
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
assert.ok(scripts.length > 0, 'presentation.html should load at least one script');
for (const src of scripts) {
  const resolved = path.resolve(path.dirname(distHtml), src);
  assert.ok(fs.existsSync(resolved), `presentation.html references ${src}, which resolves to ${resolved} and does not exist`);
}

const indexHtml = path.join(BUILD_ROOT, 'src', 'index.html');
const index = fs.readFileSync(indexHtml, 'utf8');
for (const m of index.matchAll(/<(?:script[^>]*src|link[^>]*href)="([^"]+)"/g)) {
  const ref = m[1];
  if (/^(https?:|data:|#)/.test(ref)) continue;
  const resolved = path.resolve(path.dirname(indexHtml), ref);
  assert.ok(fs.existsSync(resolved), `index.html references ${ref}, which resolves to ${resolved} and does not exist`);
}

// 4. The phone page must resolve its own assets inside dist/src/lan/mobile.
//    `mobile.js` is plain JS (no bundler), so a typo in its <script> tag is only
//    visible on a real phone — assert it here instead.
const mobileHtml = path.join(BUILD_ROOT, 'src', 'lan', 'mobile', 'index.html');
const mobilePage = fs.readFileSync(mobileHtml, 'utf8');
const mobileRefs = [...mobilePage.matchAll(/<(?:script[^>]*src|link[^>]*href)="([^"]+)"/g)].map((m) => m[1]);
assert.ok(mobileRefs.length >= 2, 'the LAN mobile page should load mobile.js and mobile.css');
for (const src of mobileRefs) {
  // `/socket.io/socket.io.min.js` is served by the Socket.IO server at runtime.
  if (src.startsWith('/')) continue;
  const resolved = path.resolve(path.dirname(mobileHtml), src);
  assert.ok(fs.existsSync(resolved), `lan/mobile/index.html references ${src}, which resolves to ${resolved} and does not exist`);
}
assert.match(mobilePage, /http-equiv="Content-Security-Policy"/, 'the LAN page must keep its CSP: classroom Wi-Fi may have no trusted origins');
assert.doesNotMatch(mobilePage, /<script[^>]+src="https?:/, 'the LAN page must not load scripts from the Internet');

console.log(`build-assets: ${COPIED_ASSETS.length} copied assets present, all HTML references resolve`);
