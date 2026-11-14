import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('UI Micro-Interactions & Polish (Sprint 5)', async (t) => {
  const rootDir = path.resolve(__dirname, __dirname.includes('dist') ? '../../../' : '../../');
  const navCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/navigation.css'), 'utf8');
  const componentsCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/components.css'), 'utf8');

  await t.test('5.1: Sidebar navigation uses colour feedback, not positional motion', () => {
    assert.ok(!navCss.includes('translateX(2px)'), 'nav-item no longer slides sideways on hover');
    assert.ok(navCss.includes('.nav-item:hover .nav-icon'), 'nav-item hover still highlights the icon tile');
    assert.ok(navCss.includes('transform: none !important'), 'reduced-motion turns off nav transforms');
  });

  await t.test('5.2: Button feedback and loading spinner state', () => {
    assert.ok(componentsCss.includes('.btn{') && componentsCss.includes('background-color .12s'), 'button transitions colours instead of lifting');
    assert.ok(!componentsCss.includes('.btn:hover{transform'), 'button has no hover lift');
    assert.ok(componentsCss.includes('.btn-loading'), 'components.css defines .btn-loading class');
    assert.ok(componentsCss.includes('color: transparent !important'), 'btn-loading hides button text');
    assert.ok(componentsCss.includes('pointer-events: none'), 'btn-loading disables pointer interaction');
    assert.ok(componentsCss.includes('@keyframes btn-spin'), 'btn-spin keyframes are defined');
  });

  await t.test('5.3: Game card hover gives shadow depth without moving the card', () => {
    assert.ok(!componentsCss.includes('translateY(-4px) scale(1.01)'), 'game-card no longer lifts/scales on hover');
    assert.ok(componentsCss.includes('.game-card:hover{box-shadow:var(--shadow-hover)}'), 'game-card still uses --shadow-hover');
  });

  await t.test('5.4: prefers-reduced-motion respects user accessibility preferences', () => {
    assert.ok(navCss.includes('prefers-reduced-motion'), 'navigation.css guards micro-interactions');
    assert.ok(componentsCss.includes('prefers-reduced-motion'), 'components.css guards button and card lift effects');
  });
});
