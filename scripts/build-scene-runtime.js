// build-scene-runtime.js — bundles the shared scene code into ONE classic
// <script> the renderer can load (DECISIONS #272).
//
// Why this exists: `src/renderer/features/game-illustration.ts` used to carry a
// hand-maintained copy of `scene-blueprint.ts` + `illustration-scene.ts`,
// because the play surface is a set of classic scripts and cannot `import`. The
// copy drifted twice (#262, #267) and every new layout meant writing the same
// geometry twice. The bundle removes the second copy without turning the
// renderer into modules: esbuild emits an IIFE that publishes `SceneRuntime`.
//
// Offline only, compliant with CSP `script-src 'self'`: no eval, no network, no
// dynamic import in the output.
//
// Usage:
//   node scripts/build-scene-runtime.js           # write the bundle
//   node scripts/build-scene-runtime.js --check   # fail if stale (gates use this)
const esbuild = require('esbuild');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const ENTRY = path.join(ROOT, 'src', 'shared', 'scene-runtime.ts');
const OUTFILE = path.join(ROOT, 'dist', 'src', 'renderer', 'shared', 'scene-runtime.js');
/** The global the renderer reads. One name, so `check:renderer-globals` sees it. */
const GLOBAL_NAME = 'SceneRuntime';

async function bundle() {
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    // `iife` + `globalName`: exactly the shape a classic script can consume.
    format: 'iife',
    globalName: GLOBAL_NAME,
    platform: 'browser',
    target: 'es2022',
    minify: false,
    // A sourcemap next to the script keeps line numbers readable in devtools;
    // the shipped renderer loads it only when devtools are open.
    sourcemap: false,
    legalComments: 'none',
    // Nothing may reach for Node: a `require('node:…')` surviving into the
    // bundle would throw at load time inside WebView2, taken down the whole page.
    external: [],
    outfile: OUTFILE,
    logLevel: 'silent',
    metafile: true,
    write: true
  });
  return result;
}

async function main() {
  const check = process.argv.includes('--check');
  if (check) {
    // Freshness gate: bundle again into memory-free temp state and compare.
    const before = fs.existsSync(OUTFILE) ? fs.readFileSync(OUTFILE) : null;
    if (!before) {
      console.error('scene-runtime: thiếu bundle — chạy `node scripts/build-scene-runtime.js`.');
      process.exit(1);
    }
    const tmp = path.join(ROOT, 'dist', 'src', 'renderer', 'shared', '.scene-runtime.check.js');
    const result = await esbuild.build({
      entryPoints: [ENTRY],
      bundle: true,
      format: 'iife',
      globalName: GLOBAL_NAME,
      platform: 'browser',
      target: 'es2022',
      minify: false,
      sourcemap: false,
      legalComments: 'none',
      outfile: tmp,
      logLevel: 'silent'
    });
    const fresh = fs.readFileSync(tmp);
    fs.unlinkSync(tmp);
    const same = Buffer.compare(before, fresh) === 0;
    const kb = (fresh.length / 1024).toFixed(1);
    console.log(`scene-runtime: ${same ? 'khớp' : 'LỆCH'} (${kb} KiB)${same ? '' : ' — chạy lại `node scripts/build-scene-runtime.js`'}`);
    void result;
    process.exit(same ? 0 : 1);
  }

  fs.mkdirSync(path.dirname(OUTFILE), { recursive: true });
  const result = await bundle();
  const bytes = fs.statSync(OUTFILE).size;
  const inputs = Object.keys(result.metafile.inputs).length;
  console.log(`Wrote dist/src/renderer/shared/scene-runtime.js (${(bytes / 1024).toFixed(1)} KB, ${inputs} inputs)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
