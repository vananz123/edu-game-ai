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

  await t.test('5.5: every chrome button uses one flat brand/white/red palette', () => {
    const sharedSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/shared.ts'), 'utf8');
    const pagesDir = path.join(rootDir, 'src/renderer/pages');
    const pageSrc = fs.readdirSync(pagesDir)
      .filter(file => file.endsWith('.ts'))
      .map(file => fs.readFileSync(path.join(pagesDir, file), 'utf8'))
      .join('\n');

    assert.ok(componentsCss.includes('.btn-primary{background:var(--color-brand);color:#fff}'),
      '.btn-primary is a single flat brand fill with white ink');
    assert.ok(componentsCss.includes('.btn-danger{background:#c33b4b;color:#fff}'),
      '.btn-danger is a single flat red fill with white ink');
    assert.ok(/\.btn-primary:hover\{background:#5145d6\}/.test(componentsCss),
      '.btn-primary darkens a shade on hover instead of glowing');
    assert.ok(!/#6258e82b|0 6px 14px/.test(componentsCss),
      'no coloured button glow left in components.css');

    const markup = sharedSrc + '\n' + pageSrc;
    assert.ok(!/shadow-\[0_6px_14px/.test(markup),
      'card buttons do not hand-roll a coloured shadow');
    assert.ok(!/hover:-translate-y-\[1px\]/.test(markup),
      'page buttons do not lift on hover');
    assert.ok(!/style="background:#c33b4b"/.test(markup),
      'destructive buttons use .btn-danger instead of inline red');
    assert.ok(!/bg-gradient-to-br/.test(pageSrc),
      'no gradient-filled panel or button left in page markup');
  });
});
