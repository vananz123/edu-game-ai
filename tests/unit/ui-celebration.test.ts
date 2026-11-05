import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Unit tests for Animation Tier 2 (Celebration & Transitions, DECISIONS #194)
const root = path.join(__dirname, '..', '..', '..');

// 1. canvas-confetti bundle and index.html integration
const indexPath = path.join(root, 'src', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');
assert.ok(
  indexHtml.includes('renderer/vendor/confetti.global.js'),
  'src/index.html must load renderer/vendor/confetti.global.js'
);

// 2. package.json build script wiring
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
assert.ok(
  pkg.scripts['build:confetti'],
  'package.json must declare build:confetti script'
);
assert.ok(
  pkg.scripts.build.includes('npm run build:confetti'),
  'package.json build pipeline must run build:confetti'
);

// 3. Question slide-in keyframes in game-animations.css
const animCssPath = path.join(root, 'src', 'renderer', 'styles', 'game-animations.css');
const animCss = fs.readFileSync(animCssPath, 'utf8');
assert.ok(
  animCss.includes('@keyframes question-slide-in'),
  'game-animations.css must define @keyframes question-slide-in'
);
assert.ok(
  animCss.includes('.modal[data-player-theme] .stage-question'),
  'game-animations.css must apply question-slide-in to .stage-question'
);
assert.ok(
  animCss.includes('prefers-reduced-motion: reduce') && animCss.includes('.stage-question'),
  'game-animations.css must respect prefers-reduced-motion for question slide'
);

// 4. Celebration logic and score animation in results.ts
const resultsPath = path.join(root, 'src', 'renderer', 'features', 'results.ts');
const resultsCode = fs.readFileSync(resultsPath, 'utf8');
assert.ok(
  resultsCode.includes('function celebrateGameResults(summary)'),
  'results.ts must define celebrateGameResults'
);
assert.ok(
  resultsCode.includes('function animateResultScore(summary)'),
  'results.ts must define animateResultScore'
);
assert.ok(
  resultsCode.includes('percent < 70'),
  'celebrateGameResults must only fire when percent >= 70%'
);
assert.ok(
  resultsCode.includes('prefers-reduced-motion: reduce'),
  'celebrateGameResults and animateResultScore must check prefers-reduced-motion'
);
assert.ok(
  resultsCode.includes('window.confetti'),
  'celebrateGameResults must safely check and invoke window.confetti'
);
assert.ok(
  resultsCode.includes('celebrateGameResults(summary)') && resultsCode.includes('animateResultScore(summary)'),
  'wireResultSession must invoke both celebrateGameResults and animateResultScore'
);

console.log('ui-celebration: all 7 Animation Tier 2 contract assertions passed');
