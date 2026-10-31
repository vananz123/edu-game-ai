// @ts-nocheck -- unit tests share one global script scope (moduleDetection: legacy), as the other suites do.
// LAN Classroom Mode — the phone page renders what the server sends.
//
// Why this exists: `lan-smoke.js` proves the *server* pushes `lan:state`, but not
// that `mobile.js` reacts to it. Both bugs reported after the first LAN build lived
// exactly here — the server never emitted state to phones at all, and the page had
// no way to leave "Chờ giáo viên bắt đầu". This test drives `dist/src/lan/mobile/`
// (the real built page, not a copy) in jsdom with a stub socket, and asserts the DOM
// a pupil sees: join -> waiting -> question -> "đã ghi nhận" -> next question.
//
// Run after `npm run build`:  node tests/unit/lan-mobile.test.js
// Auto-discovered by `node tests/run-unit.js` like every other unit suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const BUILD_ROOT = path.basename(ROOT) === 'dist' ? ROOT : path.join(ROOT, 'dist');
const MOBILE_DIR = path.join(BUILD_ROOT, 'src', 'lan', 'mobile');

let jsdom;
try {
  ({ JSDOM } = require('jsdom'));
} catch (error) {
  // Keep `npm test` usable on a machine where devDependencies were not installed;
  // the suite is still declared a dev dependency, so CI does run it.
  console.log('lan-mobile: SKIPPED (jsdom is not installed; run npm install)');
  process.exit(0);
}

const html = fs.readFileSync(path.join(MOBILE_DIR, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(MOBILE_DIR, 'mobile.js'), 'utf8');

let passed = 0;
function it(name, fn) {
  fn();
  passed += 1;
  console.log(`ok   ${name}`);
}

/** Load the real page with a fake socket that records emits and replays events. */
function boot() {
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:5555/?room=ABC123', runScripts: 'outside-only', pretendToBeVisual: true });
  const emitted = [];
  const handlers = {};
  let socket;
  dom.window.io = () => {
    socket = {
      on(event, handler) { handlers[event] = handler; },
      emit(event, payload) { emitted.push({ event, payload }); }
    };
    return socket;
  };
  dom.window.eval(script);
  return { dom, doc: dom.window.document, emitted, fire: (event, payload) => { if (handlers[event]) handlers[event](payload); } };
}

const visibleViews = doc => ['view-join', 'view-wait', 'view-question', 'view-status'].filter(id => !doc.getElementById(id).hidden);

function lobbySnapshot(extra = {}) {
  return Object.assign({
    state: 'lobby', roomCode: 'ABC123', engine: 'quiz', gameTitle: 'Synthetic', roundIndex: 0, roundCount: 2,
    currentRoundIndex: 0, kicker: '', prompt: '', input: null, teams: [], teamLocked: false, lastResult: null, players: []
  }, extra);
}

function questionSnapshot(extra = {}) {
  return lobbySnapshot(Object.assign({
    state: 'question', roundIndex: 1, currentRoundIndex: 0, kicker: 'Câu 1', prompt: 'Câu một?',
    input: { kind: 'options', options: [{ id: 'a', text: 'Đáp án A' }, { id: 'b', text: 'Đáp án B' }] }
  }, extra));
}

/** Join and return the joined page, ready for `lan:state`. */
function joinedPage() {
  const page = boot();
  page.doc.getElementById('nameInput').value = 'Học sinh A';
  page.doc.getElementById('joinBtn').click();
  page.fire('lan:joined', { playerId: 'p1', token: 'x'.repeat(48), name: 'Học sinh A' });
  return page;
}

it('the page opens on the join form with the room filled from the URL', () => {
  const { doc } = boot();
  assert.ok(visibleViews(doc).includes('view-join'));
  assert.equal(doc.getElementById('roomInput').value, 'ABC123');
});

it('join sends lan:join with the room and the typed name', () => {
  const page = boot();
  page.doc.getElementById('nameInput').value = 'Học sinh A';
  page.doc.getElementById('joinBtn').click();
  const sent = page.emitted.find(entry => entry.event === 'lan:join');
  assert.ok(sent, 'lan:join was not emitted');
  assert.equal(sent.payload.room, 'ABC123');
  assert.equal(sent.payload.name, 'Học sinh A');
});

it('a joined pupil waits until the teacher starts, and the hint counts the class', () => {
  const page = joinedPage();
  assert.ok(visibleViews(page.doc).includes('view-wait'), 'must show the waiting screen after lan:joined');
  page.fire('lan:state', lobbySnapshot({ players: [{ id: 'p1', name: 'A', connected: true }, { id: 'p2', name: 'B', connected: false }] }));
  assert.ok(visibleViews(page.doc).includes('view-wait'));
  assert.match(page.doc.getElementById('waitHint').textContent, /2 bạn đã vào phòng/);
});

it('the question snapshot replaces the waiting screen (the reported bug)', () => {
  const page = joinedPage();
  page.fire('lan:state', lobbySnapshot());
  page.fire('lan:state', questionSnapshot());
  assert.ok(visibleViews(page.doc).includes('view-question'), 'the phone must leave the lobby when the teacher starts');
  assert.equal(page.doc.getElementById('qPrompt').textContent, 'Câu một?');
});

it('options render with letters and the kicker shows the position', () => {
  const page = joinedPage();
  page.fire('lan:state', questionSnapshot());
  const options = [...page.doc.querySelectorAll('#qOptions button')].map(button => button.textContent.trim());
  assert.equal(options.length, 2);
  assert.match(options[0], /^A\s*Đáp án A$/);
  assert.match(options[1], /^B\s*Đáp án B$/);
  assert.match(page.doc.getElementById('qKicker').textContent, /1\/2/);
});

it('teacher content is escaped, never injected as HTML', () => {
  const page = joinedPage();
  page.fire('lan:state', questionSnapshot({
    prompt: '<img src=x onerror=alert(1)>',
    input: { kind: 'options', options: [{ id: 'a', text: '<b>bold</b>' }] }
  }));
  assert.equal(page.doc.getElementById('qPrompt').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(page.doc.querySelectorAll('#qOptions img, #qOptions b').length, 0, 'markup in an option must not create elements');
});

it('tapping an option sends that option id', () => {
  const page = joinedPage();
  page.fire('lan:state', questionSnapshot());
  page.doc.querySelector('#qOptions button').click();
  const sent = page.emitted.find(entry => entry.event === 'lan:answer');
  assert.ok(sent, 'lan:answer was not emitted');
  // JSON comparison: the payload was built inside the jsdom realm, so its objects
  // have different prototypes and `deepStrictEqual` would compare constructor identity.
  assert.equal(JSON.stringify(sent.payload), JSON.stringify({ optionId: 'a', answerText: '' }));
});

it('after answering the phone says "đã ghi nhận" and never reveals right/wrong', () => {
  const page = joinedPage();
  page.fire('lan:state', questionSnapshot());
  page.doc.querySelector('#qOptions button').click();
  page.fire('lan:answer-ack', { roundIndex: 0 });
  assert.ok(visibleViews(page.doc).includes('view-status'));
  assert.match(page.doc.getElementById('statusTitle').textContent, /Đã ghi nhận/);
  const note = page.doc.getElementById('statusNote').textContent;
  // The note may say the result will appear on the projector; it must not give it.
  assert.doesNotMatch(note, /chính xác|sai rồi|đáp án đúng/i);
});

it('a second press of the same reason (already answered) shows, not an error', () => {
  const page = joinedPage();
  page.fire('lan:state', questionSnapshot());
  page.fire('lan:answer-refused', { status: 'already-answered', message: 'Em đã trả lời câu này rồi.' });
  assert.match(page.doc.getElementById('statusTitle').textContent, /đã trả lời/i);
});

it('the next question replaces the previous one', () => {
  const page = joinedPage();
  page.fire('lan:state', questionSnapshot());
  page.doc.querySelector('#qOptions button').click();
  page.fire('lan:state', questionSnapshot({
    roundIndex: 2, currentRoundIndex: 1, kicker: 'Câu 2', prompt: 'Câu hai?',
    input: { kind: 'options', options: [{ id: 'a', text: 'X' }] }
  }));
  assert.equal(page.doc.getElementById('qPrompt').textContent, 'Câu hai?');
  assert.ok(visibleViews(page.doc).includes('view-question'), 'a new round must clear the "đã ghi nhận" screen');
});

it('a text round shows the input form instead of options', () => {
  const page = joinedPage();
  page.fire('lan:state', questionSnapshot({ input: { kind: 'text', placeholder: 'Nhập câu trả lời' } }));
  assert.equal(page.doc.getElementById('qTextForm').hidden, false);
  assert.equal(page.doc.getElementById('qOptions').hidden, true);
  page.doc.getElementById('qTextInput').value = 'Paris';
  page.doc.getElementById('qTextForm').dispatchEvent(new page.dom.window.Event('submit', { bubbles: true, cancelable: true }));
  const sent = page.emitted.find(entry => entry.event === 'lan:answer');
  assert.equal(JSON.stringify(sent.payload), JSON.stringify({ optionId: null, answerText: 'Paris' }));
});

it('an empty text answer is refused before it reaches the server', () => {
  const page = joinedPage();
  page.fire('lan:state', questionSnapshot({ input: { kind: 'text', placeholder: 'Trả lời' } }));
  page.doc.getElementById('qTextInput').value = '   ';
  page.doc.getElementById('qTextForm').dispatchEvent(new page.dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(page.emitted.filter(entry => entry.event === 'lan:answer').length, 0);
  assert.match(page.doc.getElementById('qError').textContent, /nhập câu trả lời/i);
});

it('a wrong room code shows the server message and stays on the join form', () => {
  const page = joinedPage();
  page.fire('lan:refused', { status: 'wrong-room', message: 'Mã phòng không đúng.' });
  assert.ok(visibleViews(page.doc).includes('view-join'));
  assert.equal(page.doc.getElementById('joinError').textContent, 'Mã phòng không đúng.');
});

it('finishing shows the pupil their own tally and no one else\u2019s', () => {
  const page = joinedPage();
  page.fire('lan:state', lobbySnapshot({
    state: 'finished',
    players: [{ id: 'p1', name: 'A', connected: false, points: 200, correct: 2, answered: 2 }, { id: 'p2', name: 'B', points: 100, correct: 1, answered: 2 }]
  }));
  assert.match(page.doc.getElementById('statusTitle').textContent, /kết thúc/i);
  const note = page.doc.getElementById('statusNote').textContent;
  assert.match(note, /2\/2|câu/);
  assert.doesNotMatch(note, /B/, 'another pupil must not be named');
});

console.log(`lan-mobile: ${passed} checks passed`);
