import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('UI Micro-Interactions & Polish (Sprint 5)', async (t) => {
  const rootDir = path.resolve(__dirname, __dirname.includes('dist') ? '../../../' : '../../');
  const navCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/navigation.css'), 'utf8');
  const componentsCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/components.css'), 'utf8');

  await t.test('5.1: Sidebar navigation hover micro-interactions and active press effect', () => {
    assert.ok(navCss.includes('.nav-item:hover') && navCss.includes('translateX(2px)'), 'nav-item slides forward on hover');
    assert.ok(navCss.includes('.nav-item:active') && navCss.includes('scale(0.98)'), 'nav-item has tactile press feedback on active');
    assert.ok(navCss.includes('transform: none !important'), 'reduced-motion turns off nav-item translation');
  });

  await t.test('5.2: Button tactile feedback and loading spinner state', () => {
    assert.ok(componentsCss.includes('.btn:active') && componentsCss.includes('scale(0.98)'), 'button has tactile press scale effect');
    assert.ok(componentsCss.includes('.btn-loading'), 'components.css defines .btn-loading class');
    assert.ok(componentsCss.includes('color: transparent !important'), 'btn-loading hides button text');
    assert.ok(componentsCss.includes('pointer-events: none'), 'btn-loading disables pointer interaction');
    assert.ok(componentsCss.includes('@keyframes btn-spin'), 'btn-spin keyframes are defined');
  });

  await t.test('5.3: Game card hover lift effect is polished with scale and shadow', () => {
    assert.ok(componentsCss.includes('.game-card:hover') && componentsCss.includes('translateY(-4px) scale(1.01)'), 'game-card has polished lift and scale');
    assert.ok(componentsCss.includes('.game-card:hover') && componentsCss.includes('var(--shadow-hover)'), 'game-card uses --shadow-hover');
  });

  await t.test('5.4: prefers-reduced-motion respects user accessibility preferences', () => {
    assert.ok(navCss.includes('prefers-reduced-motion'), 'navigation.css guards micro-interactions');
    assert.ok(componentsCss.includes('prefers-reduced-motion'), 'components.css guards button and card lift effects');
  });
});
