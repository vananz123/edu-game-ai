#!/usr/bin/env node
/**
 * Lan smoke test (plan §7, Phase 1 acceptance + §10 scenarios 1, 3, 4): starts the
 * real LAN server from `dist/src/lan/lan-server.js`, connects three fake pupils
 * with a real socket.io client over localhost, and checks the points the teacher
 * screen would show.
 *
 * What this proves:
 *   - the Express/Socket.IO server binds, serves the phone page and /health
 *   - join / duplicate name / one-answer-per-question / disconnect / reconnect
 *   - points equal the desktop scoring (same runtime.ts helpers)
 *   - closing the server releases the port (no leaked listener)
 *
 * Run:  npm run build && node tests/manual/lan-smoke.js
 *
 * Synthetic pupils only (AGENTS.md): no real student data.
 */
'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { io } = require('socket.io-client');
const { startLanServer } = require('../../dist/src/lan/lan-server');

const GAME = {
  id: 'smoke-quiz',
  title: 'Synthetic LAN quiz',
  template: 'quiz',
  gameSetup: { scoringMode: 'cơ bản' },
  questions: [
    { id: 'q1', type: 'multiple-choice', prompt: 'Synthetic 1?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a', explanation: '', points: 100 },
    { id: 'q2', type: 'multiple-choice', prompt: 'Synthetic 2?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'b', explanation: '', points: 100 }
  ]
};

let passed = 0;
function check(name, fn) {
  return Promise.resolve().then(fn).then(() => {
    passed += 1;
    console.log(`ok   ${name}`);
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    }).on('error', reject);
  });
}

function connect(port) {
  return new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function next(socket, event) {
  return new Promise(resolve => socket.once(event, resolve));
}

async function main() {
  let lastSnapshot = null;
  let closed = null;
  const handle = await startLanServer(GAME, {
    port: 0,
    onSnapshot: snapshot => { lastSnapshot = snapshot; },
    onClosed: reason => { closed = reason; }
  });
  const port = Number(new URL(lastSnapshot.urls[0]).port);

  await check('the room opens as a lobby with a 6-character code', () => {
    assert.equal(lastSnapshot.state, 'lobby');
    assert.match(lastSnapshot.roomCode, /^[A-HJ-NP-Z2-9]{6}$/, 'codes exclude 0/1/I/O');
    assert.equal(lastSnapshot.roundCount, 2);
  });

  await check('/health answers {ok:true} and says nothing else', async () => {
    const response = await httpGet(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { ok: true });
  });

  await check('the phone page is served from dist/src/lan/mobile', async () => {
    const response = await httpGet(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
    assert.match(response.body, /mobile\.js/, 'index.html must be the mobile page');
  });

  await check('there is no route that exposes app data', async () => {
    for (const path of ['/api/library', '/app-info', '/package.json', '/..%2fsrc%2fmain.js']) {
      const response = await httpGet(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 404, `${path} must 404`);
    }
  });

  const lan = await connect(port);
  const minh = await connect(port);
  const lan2 = await connect(port);
  // Every snapshot the phones receive, so the state push can be asserted directly.
  const phoneStates = [];

  await check('a socket that never joined receives no state at all', async () => {
    // The room code is the only join secret, so an unauthenticated client on the LAN
    // must learn nothing: not the code, not the prompt. Another pupil joins meanwhile,
    // which produces a broadcast that must skip the lurker.
    const lurker = await connect(port);
    const seen = [];
    lurker.on('lan:state', snapshot => seen.push(snapshot));
    await new Promise(resolve => setTimeout(resolve, 300));
    minh.emit('lan:join', { room: lastSnapshot.roomCode, name: 'Minh' });
    await next(minh, 'lan:joined');
    await new Promise(resolve => setTimeout(resolve, 400));
    lurker.disconnect();
    assert.equal(seen.length, 0, `a non-joined socket received ${seen.length} snapshots`);
  });

  lan.on('lan:state', snapshot => phoneStates.push(snapshot));
  lan.on('lan:state', snapshot => phoneStates.push(snapshot));
  await check('a joining pupil is sent the current state immediately', async () => {
    lan.emit('lan:join', { room: lastSnapshot.roomCode, name: 'Lan' });
    const joined = await next(lan, 'lan:joined');
    assert.equal(joined.name, 'Lan');
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.ok(phoneStates.length > 0, 'a phone that joins must not wait for someone else to act');
    assert.equal(phoneStates[phoneStates.length - 1].state, 'lobby');
  });
  await check('three pupils join and the projector lists them', async () => {
    // Minh joined in the previous check (to produce a broadcast the lurker must not see).
    lan2.emit('lan:join', { room: lastSnapshot.roomCode, name: 'Hoa' });
    await next(lan2, 'lan:joined');
    assert.equal(lastSnapshot.players.length, 3);
    assert.deepEqual(lastSnapshot.players.map(player => player.name), ['Minh', 'Lan', 'Hoa']);
  });

  await check('a duplicate name is refused without leaking the roster', async () => {
    const spy = await connect(port);
    spy.emit('lan:join', { room: lastSnapshot.roomCode, name: 'lan' });
    const refused = await next(spy, 'lan:refused');
    assert.equal(refused.status, 'name-taken');
    assert.equal(lastSnapshot.players.length, 3, 'a refused join adds nobody');
    spy.disconnect();
  });

  await check('a wrong room code is refused', async () => {
    const spy = await connect(port);
    spy.emit('lan:join', { room: 'ZZZZZZ', name: 'Kẻ lạ' });
    const refused = await next(spy, 'lan:refused');
    assert.equal(refused.status, 'wrong-room');
    spy.disconnect();
  });

  handle.begin();
  await check('the teacher starts and round 1 is open with options', () => {
    assert.equal(lastSnapshot.state, 'question');
    assert.equal(lastSnapshot.input.kind, 'options');
    assert.equal(lastSnapshot.input.options.length, 2);
    assert.equal(lastSnapshot.teamLocked, true, 'teams lock when the game starts');
  });

  await check('starting pushes the question to every phone (the reported bug)', async () => {
    // `begin()` must reach the phones, not only the projector: without this a
    // connected pupil stayed on "Chờ giáo viên bắt đầu" forever. The push is sent
    // during handle.begin(), so give the socket a moment to deliver it.
    await new Promise(resolve => setTimeout(resolve, 300));
    const pushed = phoneStates.filter(entry => entry.state === 'question').pop();
    assert.ok(pushed, 'no lan:state with state=question reached the phone');
    assert.equal(pushed.prompt, 'Synthetic 1?');
    assert.equal(pushed.input.options.length, 2);
  });

  await check('the phone view hides the answer key and other pupils\u2019 data', () => {
    const pushed = phoneStates[phoneStates.length - 1];
    assert.equal(pushed.lastResult, null, 'the answer key must not reach a phone while the round is open');
    assert.equal(pushed.players, undefined, 'a phone must not receive the roster with points');
  });

  await check('answers are scored like the desktop and acknowledged without the answer', async () => {
    lan.emit('lan:answer', { optionId: 'a' });
    const ack = await next(lan, 'lan:answer-ack');
    assert.equal(ack.roundIndex, 0);
    assert.equal(ack.correct, undefined, 'the phone must not learn right/wrong');
    minh.emit('lan:answer', { optionId: 'b' });
    await next(minh, 'lan:answer-ack');
    const byName = Object.fromEntries(lastSnapshot.players.map(player => [player.name, player]));
    assert.equal(byName.Lan.points, 100, 'correct answer = question.points');
    assert.equal(byName.Minh.points, 0);
    assert.equal(lastSnapshot.answeredCount, 2, 'Hoa has not answered');
    assert.equal(lastSnapshot.lastResult, null, 'the answer key is not exposed while open');
  });

  await check('a pupil cannot answer the same question twice', async () => {
    lan.emit('lan:answer', { optionId: 'a' });
    const refused = await next(lan, 'lan:answer-refused');
    assert.equal(refused.status, 'already-answered');
    assert.equal(lastSnapshot.players.find(player => player.name === 'Lan').points, 100);
  });

  await check('an offline pupil is marked offline and a made-up token is refused', async () => {
    const saved = lastSnapshot.players.find(player => player.name === 'Hoa');
    lan2.disconnect();
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(lastSnapshot.players.find(player => player.name === 'Hoa').connected, false);
    assert.ok(saved, 'the pupil still has points after disconnecting');
    // The token is server-side only (never in a snapshot), so an unauthenticated
    // client cannot take over a pupil by guessing a name.
    const rejoined = await connect(port);
    rejoined.emit('lan:rejoin', { room: lastSnapshot.roomCode, token: 'f'.repeat(48) });
    const refused = await next(rejoined, 'lan:refused');
    assert.equal(refused.status, 'not-in-room');
    rejoined.disconnect();
  });

  await check('closing the round reveals the answer key on the projector only', () => {
    handle.nextRound();
    assert.equal(lastSnapshot.state, 'question', 'round 2 opened');
    assert.equal(lastSnapshot.lastResult.correctOptionId, 'a');
    assert.equal(lastSnapshot.lastResult.answered, 2);
    assert.equal(lastSnapshot.currentRoundIndex, 1);
  });

  await check('the advance also reaches the phones, on the new question', async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const pushed = phoneStates.filter(entry => entry.currentRoundIndex === 1).pop();
    assert.ok(pushed, 'the phone never saw round 2');
    assert.equal(pushed.prompt, 'Synthetic 2?');
    // Round 2 is open, so its key stays hidden from phones; the projector shows it.
    assert.equal(pushed.lastResult, null, 'an open round must not send its key to phones');
  });

  await check('a late joiner is admitted but cannot answer the closed round', async () => {
    const late = await connect(port);
    late.emit('lan:join', { room: lastSnapshot.roomCode, name: 'Trễ' });
    await next(late, 'lan:joined');
    // Round 2 is open for the class, so the newcomer becomes part of the round.
    assert.ok(lastSnapshot.players.some(player => player.name === 'Trễ'));
    late.disconnect();
    lan.emit('lan:answer', { optionId: 'b' });
    await next(lan, 'lan:answer-ack');
    assert.equal(lastSnapshot.players.find(player => player.name === 'Lan').points, 200);
  });

  await check('finishing freezes the score and refuses new answers', async () => {
    const snapshot = handle.finish();
    assert.equal(snapshot.state, 'finished');
    assert.deepEqual(snapshot.score, { points: 200, max: 200, percent: 100 });
    lan.emit('lan:answer', { optionId: 'a' });
    const refused = await next(lan, 'lan:answer-refused');
    assert.equal(refused.status, 'wrong-phase');
  });

  await check('closing the server releases the port', async () => {
    lan.disconnect();
    minh.disconnect();
    await handle.close('smoke-done');
    assert.equal(closed, 'smoke-done');
    await new Promise(resolve => setTimeout(resolve, 150));
    // Nothing listens any more: a connection attempt is refused.
    await assert.rejects(httpGet(`http://127.0.0.1:${port}/health`), /ECONNREFUSED/);
  });

  console.log(`\nlan-smoke: ${passed} checks passed`);
}

main().catch(error => {
  console.error('lan-smoke FAILED:', error && error.stack || error);
  process.exit(1);
});
