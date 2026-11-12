// Phone-side client for the Tauri LAN server.
//
// The Rust server speaks plain RFC 6455 WebSocket text frames carrying
// `{ event, payload }` JSON (src-tauri/src/lan.rs). The phone page falls back to
// the same protocol when `io` is absent, so checks must NOT use socket.io-client:
// that client starts an Engine.IO handshake the server does not implement.
'use strict';

function openPhone(roomUrl, options = {}) {
  const room = options.room;
  const name = options.name;
  const timeoutMs = options.timeoutMs || 8000;
  const url = new URL(roomUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';

  const socket = new WebSocket(url.toString());
  const states = [];
  const events = [];
  const waiters = [];

  socket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    const kind = message && message.event;
    const payload = message && message.payload;
    if (!kind) return;
    events.push({ event: kind, payload });
    if (kind === 'lan:state') states.push(payload);
    for (const waiter of [...waiters]) {
      if (waiter.event !== kind) continue;
      waiters.splice(waiters.indexOf(waiter), 1);
      clearTimeout(waiter.timer);
      waiter.resolve(payload);
    }
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ event: 'lan:join', payload: { room, name } }));
      resolve();
    }, { once: true });
    socket.addEventListener('error', () => {
      reject(new Error(`LAN phone socket failed to open: ${url}`));
    }, { once: true });
  });

  /**
   * Wait for one event. Events that already arrived (including `lan:joined`,
   * which can beat the caller) resolve immediately instead of hanging.
   */
  function next(event, waitMs = timeoutMs) {
    const already = events.find(entry => entry.event === event);
    if (already) return Promise.resolve(already.payload);
    return new Promise((resolve, reject) => {
      const waiter = { event, resolve };
      waiter.timer = setTimeout(() => {
        const at = waiters.indexOf(waiter);
        if (at >= 0) waiters.splice(at, 1);
        reject(new Error(`LAN phone never received ${event} within ${waitMs} ms`));
      }, waitMs);
      waiters.push(waiter);
    });
  }

  return {
    states,
    events,
    opened,
    next,
    send(event, payload) { socket.send(JSON.stringify({ event, payload })); },
    close() { try { socket.close(); } catch { /* already closed */ } }
  };
}

module.exports = { openPhone };
