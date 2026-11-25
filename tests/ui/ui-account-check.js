#!/usr/bin/env node
/**
 * DECISIONS #337 — account chip: Khách is a valid state, and no token reaches the DOM.
 *
 * Phase 1 of docs/archive/specs/cloud-auth-plan.md adds a Google login. The risk it
 * brings is not a wrong pixel, it is a wrong *promise*:
 *   1. a teacher who never signs in must keep a working app — the chip says "Khách",
 *      not an error and not a wall;
 *   2. the renderer must never hold an access/refresh token (auth.rs keeps it), so the
 *      session payload is inspected for token-shaped keys;
 *   3. the four states the UI can be in are a STATE ("guest/member/unconfigured/unknown"),
 *      and the expected label is derived from the same `authStatus` answer the app used,
 *      never hardcoded here (#320/#321).
 *
 * Nothing in this gate signs in: clicking "Đăng nhập với Google" opens a real browser
 * window, and a gate that fakes a dialog cannot test it (#313).
 *
 * Usage: `node tests/ui/ui-account-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9381';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const ROLE_TEXT = {
  member: 'Đã đăng nhập',
  guest: 'Chưa đăng nhập',
  unconfigured: 'Cloud AI chưa cấu hình',
  unknown: 'Không đọc được trạng thái',
};

const PROBE = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const chip = document.querySelector('[data-account-chip]');
  if (!chip) return { missing: 'chip' };
  // Wait for the asynchronous first read to land (bootstrap does not await it).
  for (let i = 0; i < 40 && chip.dataset.state === 'unknown'; i += 1) await sleep(100);
  const status = await window.__accountGateStatus();
  const session = await window.__accountGateSession();
  const name = document.querySelector('[data-account-name]');
  const role = document.querySelector('[data-account-role]');
  const avatar = document.querySelector('[data-account-avatar]');
  const avatarBox = avatar ? avatar.getBoundingClientRect() : null;
  return {
    status,
    session,
    state: chip.dataset.state,
    name: name ? name.textContent.trim() : null,
    role: role ? role.textContent.trim() : null,
    avatarSize: avatarBox ? [Math.round(avatarBox.width), Math.round(avatarBox.height)] : null,
    chipWidth: Math.round(chip.getBoundingClientRect().width),
  };
})()`;

const OPEN_PANEL = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const chip = document.querySelector('[data-account-chip]');
  chip.click();
  await sleep(160);
  const panel = document.querySelector('[data-account-panel]');
  if (!panel) return { panel: null };
  return {
    panel: panel.dataset.accountPanelState,
    signIn: Boolean(panel.querySelector('[data-account-signin]')),
    signOut: Boolean(panel.querySelector('[data-account-signout]')),
    reset: Boolean(panel.querySelector('[data-account-reset]')),
    heading: (panel.querySelector('h2') || {}).textContent || '',
    close: Boolean(panel.querySelector('[data-close]')),
  };
})()`;

const CLOSE_PANEL = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const close = document.querySelector('[data-account-panel] [data-close]');
  if (!close) return { closed: false, reason: 'không có nút đóng' };
  close.click();
  await sleep(120);
  return { closed: !document.querySelector('[data-account-panel]') };
})()`;

/** Expected label derived from the state, not from the chip markup. */
function expectedState(status) {
  if (!status) return 'unknown';
  // A session file that exists but cannot be read is NOT "guest": saying so would
  // tell a teacher they never signed in when in fact the session broke.
  if (status.problem) return 'unknown';
  if (!status.configured) return 'unconfigured';
  return status.loggedIn ? 'member' : 'guest';
}

// #352: the usage log channel, measured where it is reachable without a Google click.
// A guest must get a NAMED refusal over the real IPC channel, not an empty list.
const USAGE_GUEST = String.raw`(async () => {
  const result = await desktop.call('accountUsageHistory', { limit: 5 });
  // The panel is already open at this point in the gate; reading a node must not move it,
  // or the later "closing removes the panel" check measures the probe instead of the app.
  const panel = document.querySelector('[data-account-panel]');
  return {
    ok: Boolean(result && result.ok),
    code: result && result.code,
    rows: Array.isArray(result && result.rows) ? result.rows.length : -1,
    state: panel ? panel.getAttribute('data-account-panel-state') : '',
    usageBlock: Boolean(document.querySelector('[data-account-usage]'))
  };
})()`;

(async () => {
  const cdp = await connect();

  // The gate reads through the façade, so it measures the same path the app uses.
  await cdp.evaluate(String.raw`(async () => {
    window.__accountGateStatus = async () => { try { return await desktop.call('authStatus'); } catch (e) { return null; } };
    window.__accountGateSession = async () => { try { return await desktop.call('authSession'); } catch (e) { return null; } };
    return true;
  })()`);

  const probe = await cdp.evaluate(PROBE);
  const dom = probe.result ? probe.result.value : probe;
  check('the sidebar has an account chip', !dom.missing, dom.missing || 'found');

  const wantState = expectedState(dom.status);
  check('the chip state is the state the app reported', dom.state === wantState,
    'chip=' + dom.state + ' authStatus=' + JSON.stringify(dom.status));

  // Blind mode: the launcher started the app with NO SUPABASE_* in its environment.
  // Passing here is the only proof that the cloud config travelled inside the binary,
  // which is the difference between working on this machine and working on a teacher's.
  if (process.env.EDUGAME_ACCOUNT_BLIND === '1') {
    check('the packaged build knows its cloud config without environment variables',
      Boolean(dom.status) && dom.status.configured === true,
      JSON.stringify(dom.status));
  }

  const wantName = dom.status && dom.status.loggedIn ? (dom.status.email || 'Đã đăng nhập') : 'Khách';
  check('the chip name comes from the account state', dom.name === wantName, dom.name + ' vs ' + wantName);

  check('the chip explains the state in words', dom.role === ROLE_TEXT[wantState],
    dom.role + ' vs ' + ROLE_TEXT[wantState]);

  check('the avatar keeps its 34px box', Array.isArray(dom.avatarSize) && dom.avatarSize[0] === 34 && dom.avatarSize[1] === 34,
    JSON.stringify(dom.avatarSize));

  // A token in the renderer would be a security regression, and it would also mean the
  // session payload changed shape without anyone noticing.
  const sessionKeys = dom.session && typeof dom.session === 'object' ? Object.keys(dom.session) : [];
  check('the session payload carries no token field',
    sessionKeys.every(key => !/token|secret|key/i.test(key)),
    sessionKeys.length ? sessionKeys.join(',') : '(chưa đăng nhập)');

  const opened = await cdp.evaluate(OPEN_PANEL);
  const panel = opened.result ? opened.result.value : opened;
  check('clicking the chip opens the account panel', Boolean(panel.panel), String(panel.panel));
  check('the panel shows the same state as the chip', panel.panel === dom.state, panel.panel + ' vs ' + dom.state);
  check('the panel is titled "Tài khoản"', /Tài khoản/i.test(panel.heading || ''), panel.heading);
  const usageGuest = await cdp.evaluate(USAGE_GUEST);
  check(
    'reading the usage log as a guest is refused with a named code',
    usageGuest.ok === false && usageGuest.code === 'not_signed_in' && usageGuest.rows === 0,
    usageGuest.code + ' rows=' + usageGuest.rows
  );
  check('a guest panel shows no usage log', usageGuest.usageBlock === false, 'state=' + usageGuest.state);

  check('a guest is offered Google sign-in', dom.state === 'guest' ? panel.signIn === true : panel.signIn !== true,
    'state=' + dom.state + ' signIn=' + panel.signIn);
  check('an unreadable session offers to clear it instead of claiming "guest"',
    dom.state === 'unknown' ? panel.reset === true : panel.reset !== true,
    'state=' + dom.state + ' reset=' + panel.reset);
  check('sign-out appears only for a signed-in teacher', dom.state === 'member' ? panel.signOut === true : panel.signOut !== true,
    'state=' + dom.state + ' signOut=' + panel.signOut);
  check('the panel can be closed', panel.close === true, String(panel.close));

  const closed = await cdp.evaluate(CLOSE_PANEL);
  const closeResult = closed.result ? closed.result.value : closed;
  check('closing the panel removes it', closeResult.closed === true, closeResult.reason || 'closed');

  // A teacher who is not signed in must not be blocked anywhere: the shell is the same
  // shell, and the library page still renders with the chip in place.
  const shell = await cdp.evaluate(String.raw`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('.nav-item[data-page="library"]').click();
    await sleep(320);
    return {
      page: document.querySelector('.nav-item.active').dataset.page,
      chip: Boolean(document.querySelector('[data-account-chip]')),
      cards: document.querySelectorAll('.lib-item').length,
      fullscreenLock: document.documentElement.hasAttribute('data-setup-fullscreen'),
    };
  })()`);
  const shellState = shell.result ? shell.result.value : shell;
  check('the app stays usable without signing in', shellState.page === 'library' && shellState.chip && shellState.cards > 0,
    JSON.stringify(shellState));

  const failed = results.filter(entry => !entry.ok).length;
  console.log('');
  console.log(failed === 0
    ? 'ui-account-check: ' + results.length + '/' + results.length + ' passed'
    : failed + ' check(s) failed');
  process.exit(failed === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
