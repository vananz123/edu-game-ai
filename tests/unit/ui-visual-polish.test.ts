import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('UI Visual Polish & Theme Consistency (Sprint 3)', async (t) => {
  const rootDir = path.resolve(__dirname, __dirname.includes('dist') ? '../../../' : '../../');
  const appCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/app.css'), 'utf8');
  const shellCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/shell.css'), 'utf8');
  const componentsCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/components.css'), 'utf8');
  const navCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/navigation.css'), 'utf8');

  await t.test('3.1: Enhanced custom scrollbars with smooth transitions and container pairing', () => {
    assert.ok(componentsCss.includes('scrollbar-width: thin'), 'app-wide thin scrollbar declared');
    assert.ok(componentsCss.includes('transition: background'), 'scrollbar thumb has transition for smooth hover');
    assert.ok(componentsCss.includes('html[data-theme="dark"] ::-webkit-scrollbar-thumb:active'), 'dark scrollbar has active state');
    assert.ok(componentsCss.includes('.modal { scrollbar-color:'), 'modal scroll container has paired scrollbar-color');
    assert.ok(componentsCss.includes('.notification-popover { scrollbar-color:'), 'popover scroll container has paired scrollbar-color');
    assert.ok(componentsCss.includes('.ai-chat-messages { scrollbar-color:'), 'chat messages container has paired scrollbar-color');
  });

  await t.test('3.2: Multi-layer elevation shadow system tokens (light and dark)', () => {
    assert.ok(appCss.includes('--shadow-sm:'), 'app.css defines --shadow-sm token');
    assert.ok(appCss.includes('--shadow-md:'), 'app.css defines --shadow-md token');
    assert.ok(appCss.includes('--shadow-lg:'), 'app.css defines --shadow-lg token');
    assert.ok(appCss.includes('--shadow-hover:'), 'app.css defines --shadow-hover token');

    assert.ok(shellCss.includes('--shadow-sm:'), 'shell.css dark block defines dark --shadow-sm');
    assert.ok(shellCss.includes('--shadow-md:'), 'shell.css dark block defines dark --shadow-md');
    assert.ok(shellCss.includes('--shadow-lg:'), 'shell.css dark block defines dark --shadow-lg');
    assert.ok(shellCss.includes('--shadow-hover:'), 'shell.css dark block defines dark --shadow-hover');
  });

  await t.test('3.3: Component application of layered elevation shadows', () => {
    assert.ok(componentsCss.includes('.game-card') && componentsCss.includes('var(--shadow-md)'), 'game-card uses --shadow-md');
    assert.ok(componentsCss.includes('.game-card:hover') && componentsCss.includes('var(--shadow-hover)'), 'game-card:hover uses --shadow-hover');
    assert.ok(componentsCss.includes('.form-panel') && componentsCss.includes('var(--shadow-sm)'), 'form-panel uses --shadow-sm');
    assert.ok(componentsCss.includes('.quick-action') && componentsCss.includes('var(--shadow-sm)'), 'quick-action uses --shadow-sm');
    assert.ok(componentsCss.includes('.modal') && componentsCss.includes('var(--shadow-lg)'), 'modal uses --shadow-lg');
    assert.ok(componentsCss.includes('.ai-chat-panel') && componentsCss.includes('var(--shadow-md)'), 'ai-chat-panel uses --shadow-md');
  });

  await t.test('3.4: Dark mode surface layering and depth hierarchy tokens', () => {
    assert.ok(shellCss.includes('--surface-0:'), 'shell.css dark block defines --surface-0 (canvas)');
    assert.ok(shellCss.includes('--surface-1:'), 'shell.css dark block defines --surface-1 (panel)');
    assert.ok(shellCss.includes('--surface-2:'), 'shell.css dark block defines --surface-2 (elevated)');
    assert.ok(shellCss.includes('--surface-3:'), 'shell.css dark block defines --surface-3 (interactive hover)');

    assert.ok(navCss.includes('var(--surface-1)'), 'navigation sidebar-shortcuts uses --surface-1');
    assert.ok(navCss.includes('var(--surface-2)'), 'navigation shortcut-icon uses --surface-2');
    assert.ok(navCss.includes('html[data-theme="dark"] .nav-icon'), 'dark nav-icon uses surface tokens');
    assert.ok(componentsCss.includes('html[data-theme="dark"] .modal-body { background: var(--surface-0); }'), 'dark modal-body uses surface-0');
    assert.ok(componentsCss.includes('html[data-theme="dark"] .notification-popover { background: var(--surface-2)'), 'dark popover uses surface-2');
  });
});
