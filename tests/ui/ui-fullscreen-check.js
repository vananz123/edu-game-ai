// ui-fullscreen-check.js — verify the game modal covers the whole window
// (sidebar/nav must not show through while a game is being played).
//
// Start the app with:
//   EDUGAME_USER_DATA=<temp folder> electron . --remote-debugging-port=9337
// Then:
//   node tests/ui/ui-fullscreen-check.js
const PORT = Number(process.env.CDP_PORT || 9337);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(label, pass, extra) {
  results.push({ label, pass: Boolean(pass) });
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + label + (extra != null && extra !== '' ? '  -> ' + extra : ''));
}

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const target = list.find(x => x.type === 'page' && /index\.html/.test(x.url));
      if (target) return target;
    } catch {}
    await sleep(1000);
  }
  throw new Error('No page target on CDP port ' + PORT);
}

(async () => {
  const target = await findTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await send('Runtime.enable');
  const evaluate = async expression => {
    const res = await send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error('evaluate failed: ' +
        (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res.result.value;
  };

  // When the app window is not frontmost the renderer is backgrounded and
  // Chromium suspends the animation timeline, so entrance animations
  // (.modal-backdrop fade-in, .modal pop-in) never advance and the modal
  // would be measured at its scale(0.92) start frame. Finish them so layout
  // is measured at rest. This does not hide any layout defect.
  await evaluate(`(() => {
    window.__settleAnimations = () => {
      document.querySelectorAll('.modal, .modal-backdrop').forEach(el => {
        el.getAnimations().forEach(a => { try { a.finish(); } catch { try { a.currentTime = 400; } catch {} } });
      });
    };
    window.__settleAnimations();
    return true;
  })()`);

  const opened = await evaluate(`(async () => {
    const nav = Array.from(document.querySelectorAll('.nav-item'));
    nav.find(b => b.dataset.page === 'library')?.click();
    await new Promise(r => setTimeout(r, 700));
    const playBtn = document.querySelector('[data-action="play"], [data-play]');
    if (!playBtn) return { error: 'no play button', buttons: document.querySelectorAll('button').length };
    playBtn.click();
    await new Promise(r => setTimeout(r, 900));
    return { opened: Boolean(document.querySelector('.modal-backdrop')) };
  })()`);
  check('a game opens', opened && opened.opened === true, JSON.stringify(opened));
  if (!opened || !opened.opened) { ws.close(); return finish(); }


  // --- fullscreen ON: shell must be invisible, backdrop must cover viewport --
  const fs = await evaluate(`(async () => {
    document.querySelector('[data-play-fullscreen]').click();
    await new Promise(r => setTimeout(r, 900));
    if (window.__settleAnimations) window.__settleAnimations();
    await new Promise(r => setTimeout(r, 250));
    const backdrop = document.querySelector('.modal-backdrop');
    const cs = el => el ? getComputedStyle(el) : null;
    const b = backdrop.getBoundingClientRect();
    const topbar = document.querySelector('.topbar');
    const sidebar = document.querySelector('.sidebar');
    const shell = document.querySelector('.app-shell');
    return {
      flag: document.documentElement.dataset.fullscreen,
      backdrop: { x: b.x, y: b.y, w: b.width, h: b.height },
      viewport: { w: innerWidth, h: innerHeight },
      shellVisibility: shell ? cs(shell).visibility : null,
      topbarVisibility: topbar ? cs(topbar).visibility : null,
      sidebarVisibility: sidebar ? cs(sidebar).visibility : null,
      topbarZ: topbar ? Number(cs(topbar).zIndex) : 0,
      backdropZ: Number(cs(backdrop).zIndex)
    };
  })()`);
  console.log('  fullscreen state -> ' + JSON.stringify(fs));

  check('fullscreen flag is set', fs.flag === '1', fs.flag);
  check('backdrop starts at viewport origin', fs.backdrop.x === 0 && fs.backdrop.y === 0,
    `x=${fs.backdrop.x},y=${fs.backdrop.y}`);
  check('backdrop covers full viewport width',
    Math.abs(fs.backdrop.w - fs.viewport.w) < 2, `${fs.backdrop.w} vs ${fs.viewport.w}`);
  check('backdrop covers full viewport height',
    Math.abs(fs.backdrop.h - fs.viewport.h) < 2, `${fs.backdrop.h} vs ${fs.viewport.h}`);
  check('sidebar is hidden during play', fs.sidebarVisibility === 'hidden', fs.sidebarVisibility);
  check('topbar is hidden during play', fs.topbarVisibility === 'hidden', fs.topbarVisibility);
  check('app shell is hidden during play', fs.shellVisibility === 'hidden', fs.shellVisibility);
  check('backdrop z-index is above the topbar', fs.backdropZ > fs.topbarZ,
    `${fs.backdropZ} > ${fs.topbarZ}`);

  // --- the nav must not be the topmost element on top of the game ----------
  const navHit = await evaluate(`(() => {
    const nav = document.querySelector('.nav-item[data-page="home"]');
    if (!nav) return { found: false };
    const r = nav.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return {
      found: true,
      inSidebar: Boolean(hit && hit.closest('.sidebar')),
      hitClass: hit ? (hit.className || '').toString().slice(0, 60) : null
    };
  })()`);
  check('nav button is not the topmost element at its own position',
    navHit.found && navHit.inSidebar === false, JSON.stringify(navHit));

  // --- game panel is full-window and correctly placed ----------------------
  const panel = await evaluate(`(async () => {
    window.__settleAnimations?.();
    await new Promise(r => setTimeout(r, 250));
    const r = document.querySelector('.modal').getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             vw: innerWidth, vh: innerHeight };
  })()`);
  check('game panel fills the window',
    Math.abs(panel.w - panel.vw) < 2 && Math.abs(panel.h - panel.vh) < 2,
    `${panel.w}x${panel.h} in ${panel.vw}x${panel.vh}`);
  check('game panel is not offset by the sidebar', panel.x === 0 && panel.y === 0,
    `x=${panel.x},y=${panel.y}`);

  // --- leaving fullscreen restores the shell -------------------------------
  const restored = await evaluate(`(async () => {
    document.querySelector('[data-play-fullscreen]').click();
    await new Promise(r => setTimeout(r, 900));
    window.__settleAnimations?.();
    await new Promise(r => setTimeout(r, 250));
    const cs = el => el ? getComputedStyle(el) : null;
    const shell = document.querySelector('.app-shell');
    const topbar = document.querySelector('.topbar');
    const backdrop = document.querySelector('.modal-backdrop');
    return {
      flag: document.documentElement.dataset.fullscreen,
      shellVisibility: shell ? cs(shell).visibility : null,
      topbarVisibility: topbar ? cs(topbar).visibility : null,
      backdropZ: backdrop ? Number(cs(backdrop).zIndex) : null
    };
  })()`);
  check('leaving fullscreen clears the flag', restored.flag === '0', restored.flag);
  check('shell is visible again after exit', restored.shellVisibility === 'visible', restored.shellVisibility);
  check('topbar is visible again after exit', restored.topbarVisibility === 'visible', restored.topbarVisibility);
  check('backdrop z-index returns to the normal modal layer', restored.backdropZ === 20, restored.backdropZ);

  await evaluate(`(() => { const b = document.querySelector('[data-play-close]'); if (b) b.click(); return true; })()`);
  ws.close();
  finish();
})().catch(err => {
  console.error('ui-fullscreen-check failed:', err.message);
  process.exit(1);
});

function finish() {
  const failed = results.filter(r => !r.pass);
  console.log(`\nui-fullscreen-check: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
