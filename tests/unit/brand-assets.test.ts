import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Tauri brand/version guard: icon files and versions must match the shipped config.
 */
const ROOT = path.join(__dirname, '..', '..');
const SOURCE_ROOT = path.basename(ROOT) === 'dist' ? path.join(ROOT, '..') : ROOT;

const pkg = JSON.parse(fs.readFileSync(path.join(SOURCE_ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(SOURCE_ROOT, 'package-lock.json'), 'utf8'));
const tauri = JSON.parse(fs.readFileSync(path.join(SOURCE_ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));

assert.equal(lock.version, pkg.version, 'package-lock.json top-level version drifts from package.json');
assert.equal(lock.packages?.['']?.version, pkg.version, 'package-lock.json packages[""] version drifts');
assert.equal(tauri.version, pkg.version, 'tauri.conf.json version drifts from package.json');
assert.equal(tauri.bundle?.active, true, 'Tauri bundling must remain enabled');

const icons = tauri.bundle?.icon;
assert.ok(Array.isArray(icons) && icons.length > 0, 'Tauri bundle.icon must list packaged icons');
for (const relativePath of icons) {
  assert.ok(
    fs.existsSync(path.join(SOURCE_ROOT, 'src-tauri', relativePath)),
    `Tauri bundle icon is missing: ${relativePath}`,
  );
}
assert.ok(icons.some((icon: string) => icon.endsWith('.ico')), 'Windows bundle must include an .ico icon');

const server = fs.readFileSync(path.join(SOURCE_ROOT, 'server', 'index.ts'), 'utf8');
assert.match(server, new RegExp(`version:\\s*'${pkg.version.replace(/[.]/g, '\\.')}'`),
  `server/index.ts /health must report ${pkg.version}`);

console.log(`brand-assets: Tauri icons are present; package, lock, Tauri, and server versions agree at ${pkg.version}`);
