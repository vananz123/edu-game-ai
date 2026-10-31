// build-three.js — bundles three.js into a single classic <script> global for
// the renderer, which has NO ES-module support (src/index.html loads plain
// scripts; CSP is `script-src 'self'` and games must play offline).
//
// three r160+ ships ESM-only (three.module.js); its CJS entry (`three.cjs`) is a
// deprecation shim that just re-exports the ESM build. esbuild wraps the ESM
// build as an IIFE exposing the whole namespace as `THREE` (so `THREE.Scene`,
// `THREE.WebGLRenderer`, … are globals), written straight into dist/ so it ships
// with the app with no CDN and no runtime fetch.
//
// Wired into `npm run build` as `build:three`; it runs after tsc so `dist/`
// exists, and after `clean` so a fresh build always regenerates it.
const esbuild = require('esbuild');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const ENTRY = path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js');
const OUTDIR = path.join(ROOT, 'dist', 'src', 'renderer', 'vendor');

async function main() {
  await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    globalName: 'THREE',
    minify: true,
    target: 'es2022',
    legalComments: 'none',
    outfile: path.join(OUTDIR, 'three.global.js')
  });
  const bytes = fs.statSync(path.join(OUTDIR, 'three.global.js')).size;
  console.log(`Wrote dist/src/renderer/vendor/three.global.js (${(bytes / 1024).toFixed(0)} KB)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
