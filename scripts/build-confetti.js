// build-confetti.js — bundles canvas-confetti into a single classic <script>
// global for the renderer (DECISIONS #194).
// Offline only, compliant with CSP `script-src 'self'`.
const esbuild = require('esbuild');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const ENTRY = path.join(ROOT, 'node_modules', 'canvas-confetti', 'dist', 'confetti.browser.js');
const OUTDIR = path.join(ROOT, 'dist', 'src', 'renderer', 'vendor');

async function main() {
  fs.mkdirSync(OUTDIR, { recursive: true });
  await esbuild.build({
    entryPoints: [ENTRY],
    bundle: false,
    minify: true,
    target: 'es2022',
    legalComments: 'none',
    outfile: path.join(OUTDIR, 'confetti.global.js')
  });
  const bytes = fs.statSync(path.join(OUTDIR, 'confetti.global.js')).size;
  console.log(`Wrote dist/src/renderer/vendor/confetti.global.js (${(bytes / 1024).toFixed(1)} KB)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
