import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('UI Animations & Micro-interactions (Sprint 2)', async (t) => {
  const rootDir = path.resolve(__dirname, __dirname.includes('dist') ? '../../../' : '../../');
  const gameAnimCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/game-animations.css'), 'utf8');
  const baseCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/base.css'), 'utf8');
  const navCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/navigation.css'), 'utf8');
  const componentsCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/components.css'), 'utf8');
  const renderSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/core/render.ts'), 'utf8');

  await t.test('2.1: answer-celebrate is upgraded with scale, rotation and brightness drop-shadow', () => {
    assert.ok(gameAnimCss.includes('@keyframes answer-celebrate'), 'has answer-celebrate keyframes');
    assert.ok(gameAnimCss.includes('rotate('), 'answer-celebrate includes dynamic rotation');
    assert.ok(gameAnimCss.includes('brightness('), 'answer-celebrate includes brightness flash');
    assert.ok(gameAnimCss.includes('drop-shadow('), 'answer-celebrate includes glow drop-shadow');
    assert.ok(
      gameAnimCss.includes('.answer-option.correct') && gameAnimCss.includes('answer-celebrate'),
      'correct answer applies answer-celebrate animation'
    );
  });

  await t.test('2.2: page transition keyframes and render trigger are properly wired', () => {
    assert.ok(baseCss.includes('@keyframes page-fade-in'), 'base.css has page-fade-in keyframes');
    assert.ok(baseCss.includes('.page-fade-enter'), 'base.css defines .page-fade-enter class');
    assert.ok(renderSrc.includes('page-fade-enter'), 'render.ts triggers page-fade-enter class on navigation');
    assert.ok(renderSrc.includes('__lastRenderedPage'), 'render.ts checks last rendered page to avoid in-page re-render flicker');
  });

  await t.test('2.3: tab navigation active indicator pill and transitions', () => {
    assert.ok(navCss.includes('.nav-item::before'), 'navigation.css defines active indicator pill');
    assert.ok(navCss.includes('.nav-item.active::before'), 'navigation.css activates indicator on .active');
    assert.ok(navCss.includes('scaleY(1)'), 'indicator expands on active');
    assert.ok(navCss.includes('html[data-theme="dark"] .nav-item::before'), 'indicator supports dark theme');
  });

  await t.test('2.4: step completion pop animation in wizard stepper', () => {
    assert.ok(componentsCss.includes('@keyframes step-pop'), 'components.css defines step-pop keyframes');
    assert.ok(componentsCss.includes('.wizard-step[data-status=active] .wizard-step-index'), 'active step index has styling');
    assert.ok(componentsCss.includes('.wizard-step[data-status=done] .wizard-step-index'), 'done step index has styling');
    assert.ok(componentsCss.includes('animation:step-pop'), 'applies step-pop animation');
  });

  await t.test('accessibility: all animations respect prefers-reduced-motion', () => {
    assert.ok(gameAnimCss.includes('prefers-reduced-motion'), 'game-animations.css has prefers-reduced-motion guard');
    assert.ok(baseCss.includes('prefers-reduced-motion'), 'base.css has prefers-reduced-motion guard for page fade');
    assert.ok(navCss.includes('prefers-reduced-motion'), 'navigation.css has prefers-reduced-motion guard for nav transition');
    assert.ok(componentsCss.includes('prefers-reduced-motion'), 'components.css has prefers-reduced-motion guard for stepper');
  });
});
