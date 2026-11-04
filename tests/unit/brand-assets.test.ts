import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Brand + version guard (DECISIONS #185).
 *
 * Why this exists. Until #185 the repository shipped no icon at all: `build/`
 * held only `installer.nsh`, `build.win.icon` was unset, and no `BrowserWindow`
 * asked for an icon — so the exe, the installer, the shortcut, the window and
 * the taskbar all showed the default Electron logo, and nothing failed when
 * that happened. The same silent-fallback shape applies to the version string,
 * which lives in four places that no compiler cross-checks.
 *
 * These assertions only read files. They prove the asset is a real RGBA square
 * of a size electron-builder accepts, that the config points at it, that the
 * window asks for it, and that the version agrees everywhere.
 */

const ROOT = path.join(__dirname, '..', '..');
const BUILD_ROOT = path.basename(ROOT) === 'dist' ? ROOT : path.join(ROOT, 'dist');
const SOURCE_ROOT = path.basename(ROOT) === 'dist' ? path.join(ROOT, '..') : ROOT;

/** PNG IHDR: width/height are big-endian at 16/20, bit depth 24, color type 25. */
function pngHeader(file: string) {
  const bytes = fs.readFileSync(file);
  assert.ok(bytes.subarray(1, 8).equals(Buffer.from([0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    `${file} is not a PNG`);
  return {
    bytes: bytes.length,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colorType: bytes[25]
  };
}

const pkg = JSON.parse(fs.readFileSync(path.join(SOURCE_ROOT, 'package.json'), 'utf8'));

// 1. The installer/exe icon: square, RGBA, and big enough that builder can emit
//    the 256 px entry of the .ico (smaller inputs get downscaled or rejected).
const winIcon = pkg.build?.win?.icon;
assert.ok(winIcon, 'build.win.icon must be set, else the exe ships the Electron logo');
assert.equal(winIcon, 'build/icon.png');
const exe = pngHeader(path.join(SOURCE_ROOT, winIcon));
assert.equal(exe.width, exe.height, 'the app icon must be square');
assert.ok(exe.width >= 512, `build/icon.png should be at least 512 px, got ${exe.width}`);
assert.equal(exe.colorType, 6, 'build/icon.png must be RGBA: a background-less logo needs real alpha');
assert.equal(exe.bitDepth, 8);

// 2. The window/taskbar icon is a renderer-side asset, so it travels through
//    `copyfiles` and lives beside the compiled main process.
const windowIcon = path.join('src', 'renderer', 'assets', 'app-icon.png');
const win = pngHeader(path.join(SOURCE_ROOT, windowIcon));
assert.equal(win.width, win.height, 'the window icon must be square');
assert.ok(win.width >= 256, `window icon should be at least 256 px, got ${win.width}`);
assert.equal(win.colorType, 6, 'the window icon must be RGBA');
assert.ok(fs.existsSync(path.join(BUILD_ROOT, windowIcon)),
  'the window icon is not copied into dist/, so `npm start` and the installer fall back to Electron');

// 3. main.ts must actually ask for it. The path is built from `__dirname`, which
//    is `dist/src` in both dev and packaged layouts.
const mainJs = fs.readFileSync(path.join(BUILD_ROOT, 'src', 'main.js'), 'utf8');
assert.match(mainJs, /icon:\s*path\.join\(__dirname,\s*['"]renderer['"],\s*['"]assets['"],\s*['"]app-icon\.png['"]\)/,
  'BrowserWindow has no icon: the window and taskbar keep the Electron logo');

// 4. One version, four places. `npm run dist:win` writes package.json's value
//    into the exe metadata and the artifact name, while server/index.ts answers
//    /health with its own literal — drift there is a lie the app tells teachers.
const lock = JSON.parse(fs.readFileSync(path.join(SOURCE_ROOT, 'package-lock.json'), 'utf8'));
assert.equal(lock.version, pkg.version, 'package-lock.json top-level version drifts from package.json');
assert.equal(lock.packages?.['']?.version, pkg.version, 'package-lock.json packages[""] version drifts');
const gateway = fs.readFileSync(path.join(SOURCE_ROOT, 'server', 'index.ts'), 'utf8');
assert.match(gateway, new RegExp(`version:\\s*'${pkg.version.replace(/[.]/g, '\\.')}'`),
  `server/index.ts /health must report ${pkg.version}`);
assert.match(String(pkg.build?.win?.artifactName || ''), /\$\{version\}/,
  'the artifact name must carry the version, else two builds produce the same filename');

console.log(`brand-assets: icon ${exe.width}x${exe.height} RGBA + window ${win.width}x${win.height} RGBA wired, version ${pkg.version} agrees in package.json/lock/server`);
