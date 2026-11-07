#!/usr/bin/env node
// Dev mode: build once, then watch sources and keep the running app in sync.
// Renderer changes reload the window automatically (main.ts gates this behind
// EDUGAME_DEV_RELOAD=1); main-process changes still need a manual restart.
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'node_modules', '.bin');
const IS_WIN = process.platform === 'win32';
const children = [];
let shuttingDown = false;

function bin(name) {
  return path.join(BIN, IS_WIN ? `${name}.cmd` : name);
}

function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', shell: IS_WIN, ...options });
  children.push(child);
  child.on('error', error => {
    console.error(`[dev] ${command}: ${error.message}`);
    shutdown(1);
  });
  return child;
}

function killTree(pid) {
  if (IS_WIN) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ } }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.pid && child.exitCode === null) killTree(child.pid);
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// Static assets that `npm run build` copies with copyfiles; tsc --watch and
// Tailwind --watch cover the compiled parts, this covers the rest.
const STATIC_COPY = [
  /^index\.html$/,
  /^renderer[\\/]styles[\\/].+\.css$/,
  /^presentation[\\/]presentation\.html$/,
  /^presentation[\\/]presentation-preload\.js$/,
  /^lan[\\/]mobile[\\/].+$/,
  /^renderer[\\/]assets[\\/].+$/
];

function watchStaticFiles() {
  const timers = new Map();
  fs.watch(path.join(ROOT, 'src'), { recursive: true }, (event, filename) => {
    if (!filename) return;
    const rel = filename.toString();
    if (!STATIC_COPY.some(pattern => pattern.test(rel))) return;
    clearTimeout(timers.get(rel));
    timers.set(rel, setTimeout(() => {
      timers.delete(rel);
      const from = path.join(ROOT, 'src', rel);
      const to = path.join(ROOT, 'dist', 'src', rel);
      try {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
        console.log(`[dev] copied src/${rel.replace(/\\/g, '/')}`);
      } catch (error) {
        if (error.code !== 'ENOENT') console.error(`[dev] copy failed: ${error.message}`);
      }
    }, 100));
  });
}

async function main() {
  console.log('[dev] building once before starting watchers...');
  const build = run('npm', ['run', 'build']);
  const buildCode = await new Promise(resolve => build.on('exit', resolve));
  if (buildCode !== 0) shutdown(buildCode ?? 1);

  const tsc = run(bin('tsc'), ['-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], {
    stdio: ['ignore', 'pipe', 'inherit']
  });
  // Start Electron only after the first full compile, so it never reads a
  // half-written dist. The timeout is a safety net, not the normal path.
  await new Promise(resolve => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } };
    const timer = setTimeout(done, 120000);
    tsc.stdout.on('data', chunk => {
      process.stdout.write(chunk);
      if (/Watching for file changes|Found \d+ errors?/.test(chunk.toString())) done();
    });
    tsc.on('exit', done);
  });
  if (tsc.exitCode !== null && tsc.exitCode !== 0) shutdown(tsc.exitCode);

  run(bin('tailwindcss'), [
    '-i', 'src/renderer/styles/app.css',
    '-o', 'dist/src/renderer/styles/app.css',
    '--watch'
  ]);
  watchStaticFiles();

  console.log('[dev] starting Electron — renderer edits reload automatically;');
  console.log('[dev] main-process edits (src/main.ts, services) need Ctrl+C and a re-run.');
  const electron = run(bin('electron'), ['.', ...process.argv.slice(2)], {
    env: { ...process.env, EDUGAME_DEV_RELOAD: '1' }
  });
  electron.on('exit', code => shutdown(code ?? 0));
}

main().catch(error => {
  console.error(error);
  shutdown(1);
});