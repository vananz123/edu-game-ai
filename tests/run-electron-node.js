// Runs a compiled test file with Electron's bundled Node runtime.
//
// `better-sqlite3` (used by the lesson store) is compiled for Electron's ABI,
// so tests that touch SQLite cannot run under the plain Node used for the rest
// of the suite. ELECTRON_RUN_AS_NODE makes the Electron binary behave as Node.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const electronPath = require('electron');

const target = process.argv[2];
if (!target) {
  console.error('usage: node tests/run-electron-node.js <compiled-test.js>');
  process.exit(1);
}

const result = spawnSync(electronPath, [path.resolve(target)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
});

process.exit(typeof result.status === 'number' ? result.status : 1);
