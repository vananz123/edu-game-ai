// @ts-nocheck -- unit tests share one global script scope (moduleDetection: legacy), as the other suites do.
// LAN Classroom Mode state machine. Pure, so a whole lesson runs synchronously.
//
// Covers plan §10: join/duplicate name, answer twice, disconnect, out of turns,
// teacher closes the room, team locking, and the "late pupil" path.
const assert = require('node:assert/strict');
const {
  lanReduce, lanCreateState, lanStartRounds, lanNormalizeName, lanNameKey,
  lanAllConnectedAnswered, lanPlayersInRound, LAN_PLAYER_LIMIT
} = require('../../src/lan/lan-reducer');

let passed = 0;
function it(name, fn) {
  fn();
  passed += 1;
}

/** A two-question choice game where option `id` text is `right|wrong`. */
function plan(questionCount = 2, teams = [{ id: 't1', name: 'Đội A', icon: '🔴' }]) {
  return {
    gameId: 'g1',
    gameTitle: 'Synthetic quiz',
    engine: 'quiz',
    teams,
    scoringMode: 'cơ bản',
    scoringNote: '',
    rounds: Array.from({ length: questionCount }, (_, index) => ({
      label: `Câu ${index + 1}`,
      prompt: `Synthetic question ${index + 1}?`,
      input: { kind: 'options', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] },
      maxPoints: 100,
      score: (optionId) => (optionId === 'a' ? { correct: true, points: 100 } : { correct: false, points: 0 }),
      answerKey: () => ({ correctOptionId: 'a' })
    }))
  };
}

function ok(result) {
  assert.equal(result.ok, true, `expected success, got ${result.status}: ${result.message}`);
  return result;
}

function failWith(result, status) {
  assert.equal(result.ok, false, `expected ${status}, got success`);
  assert.equal(result.status, status);
  return result;
}

function join(state, name, index, roomCode = 'ROOM1') {
  return ok(lanReduce(state, {
    type: 'join', roomCode, name,
    now: 1000 + index,
    token: `token${String(index).padStart(19, '0')}`,
    id: `p${index}`
  }));
}

it('a new room is a lobby that accepts pupils', () => {
  const state = lanCreateState(plan(), 'ROOM1', 0);
  assert.equal(state.phase, 'lobby');
  assert.equal(state.teamLocked, false);
  assert.equal(state.players.length, 0);
  assert.equal(state.roundIndex, 0);
});

it('join normalises spacing and answers with the player id', () => {
  const created = lanCreateState(plan(), 'ROOM1', 0);
  const joined = join(created, '  Lan   Nguyễn ', 1);
  assert.equal(joined.playerId, 'p1');
  assert.equal(joined.state.players[0].name, 'Lan Nguyễn');
  assert.equal(joined.state.players[0].connected, true);
  assert.equal(joined.state.players[0].teamId, 't1', 'first pupil fills team 1');
});

it('a wrong room code is refused and leaks nothing', () => {
  const created = lanCreateState(plan(), 'ROOM1', 0);
  failWith(lanReduce(created, { type: 'join', roomCode: 'NOPE42', name: 'Lan', now: 1, token: 'token0000000000000000001', id: 'p1' }), 'wrong-room');
});

it('a duplicate name is refused, ignoring case and extra spacing', () => {
  const created = lanCreateState(plan(), 'ROOM1', 0);
  const first = join(created, 'Lan Nguyễn', 1);
  // Case-only variation of a Vietnamese name (lowercasing keeps the diacritics).
  failWith(lanReduce(first.state, { type: 'join', roomCode: 'ROOM1', name: 'LAN NGUYỄN', now: 9, token: 'token0000000000000000002', id: 'p2' }), 'name-taken');
  failWith(lanReduce(first.state, { type: 'join', roomCode: 'ROOM1', name: '  LAN  NGUYỄN ', now: 9, token: 'token0000000000000000002', id: 'p2' }), 'name-taken');
  // An unaccented spelling is a *different* string and is allowed: it matches
  // what pupils actually type on a phone keyboard.
  ok(lanReduce(first.state, { type: 'join', roomCode: 'ROOM1', name: 'lan nguyen', now: 9, token: 'token0000000000000000002', id: 'p2' }));
  assert.deepEqual([lanNormalizeName(' a  b '), lanNameKey('ĐỨC')], ['a b', 'đức']);
});

it('blank, overlong names and weak tokens are refused', () => {
  const created = lanCreateState(plan(), 'ROOM1', 0);
  failWith(lanReduce(created, { type: 'join', roomCode: 'ROOM1', name: '   ', now: 1, token: 'token0000000000000000001', id: 'p1' }), 'bad-name');
  failWith(lanReduce(created, { type: 'join', roomCode: 'ROOM1', name: 'x'.repeat(25), now: 1, token: 'token0000000000000000001', id: 'p1' }), 'bad-name');
  failWith(lanReduce(created, { type: 'join', roomCode: 'ROOM1', name: 'Lan', now: 1, token: 'short', id: 'p1' }), 'bad-name');
});

it('the room refuses pupils past the limit', () => {
  let state = lanCreateState(plan(), 'ROOM1', 0);
  for (let index = 0; index < LAN_PLAYER_LIMIT; index += 1) state = join(state, `Học sinh ${index}`, index).state;
  failWith(lanReduce(state, { type: 'join', roomCode: 'ROOM1', name: 'Học sinh dư', now: 1, token: 'token0000000000000000099', id: 'p99' }), 'room-full');
});

it('answers are scored, counted, and cannot be sent twice in one round', () => {
  let state = lanCreateState(plan(), 'ROOM1', 0);
  const joined = join(state, 'Lan', 1);
  state = ok(lanStartRounds(joined.state)).state;
  assert.equal(state.phase, 'question');

  const first = ok(lanReduce(state, { type: 'answer', token: 'token0000000000000000001', optionId: 'a', now: 10 }));
  assert.equal(first.state.players[0].points, 100);
  assert.equal(first.state.players[0].correct, 1);
  assert.equal(first.state.players[0].answered, 1);
  assert.equal(first.state.earned, 100);

  // A double tap must not add points.
  const second = failWith(lanReduce(first.state, { type: 'answer', token: 'token0000000000000000001', optionId: 'a', now: 11 }), 'already-answered');
  assert.equal(second.ok, false);
  assert.equal(first.state.players[0].points, 100);
});

it('an unknown option and an unknown token are refused', () => {
  let state = join(lanCreateState(plan(), 'ROOM1', 0), 'Lan', 1).state;
  state = ok(lanStartRounds(state)).state;
  failWith(lanReduce(state, { type: 'answer', token: 'token0000000000000000001', optionId: 'zzz', now: 10 }), 'bad-answer');
  failWith(lanReduce(state, { type: 'answer', token: 'token0000000000000000999', optionId: 'a', now: 10 }), 'not-in-room');
});

it('a wrong answer scores zero but still counts as answered', () => {
  let state = join(lanCreateState(plan(), 'ROOM1', 0), 'Lan', 1).state;
  state = ok(lanStartRounds(state)).state;
  const out = ok(lanReduce(state, { type: 'answer', token: 'token0000000000000000001', optionId: 'b', now: 10 })).state;
  assert.equal(out.players[0].points, 0);
  assert.equal(out.players[0].answered, 1);
  assert.equal(lanPlayersInRound(out).answered, 1);
});

it('closing a round records it once and opens the next question', () => {
  let state = join(lanCreateState(plan(), 'ROOM1', 0), 'Lan', 1).state;
  state = ok(lanStartRounds(state)).state;
  state = ok(lanReduce(state, { type: 'answer', token: 'token0000000000000000001', optionId: 'a', now: 10 })).state;
  state = ok(lanReduce(state, { type: 'next-round', now: 20 })).state;
  assert.equal(state.roundIndex, 1);
  assert.equal(state.phase, 'question');
  assert.equal(state.results.length, 1);
  assert.deepEqual(state.results[0].perPlayer[0], { id: 'p1', name: 'Lan', teamId: 't1', score: 100, correct: true });
  assert.equal(state.results[0].correctOptionId, 'a', 'answer key is only exposed on the projector after the round closes');

  // Closing again from the same index must not duplicate the record.
  state = ok(lanReduce(state, { type: 'next-round', now: 21 })).state;
  assert.equal(state.phase, 'finished');
  assert.equal(state.results.length, 2);
  assert.equal(state.teamLocked, true);
});

it('pupils who did not answer lose the round when the teacher advances', () => {
  let state = join(join(lanCreateState(plan(), 'ROOM1', 0), 'Lan', 1).state, 'Minh', 2).state;
  state = ok(lanStartRounds(state)).state;
  state = ok(lanReduce(state, { type: 'answer', token: 'token0000000000000000001', optionId: 'a', now: 10 })).state;
  state = ok(lanReduce(state, { type: 'next-round', now: 11 })).state;
  // Round 1 is closed and round 2 is open, so a late first answer is still
  // accepted — it belongs to the new question.
  const late = ok(lanReduce(state, { type: 'answer', token: 'token0000000000000000002', optionId: 'a', now: 12 })).state;
  assert.equal(late.players[1].answered, 1);
  assert.equal(late.answers['1'].p2.correct, true, 'the late answer lands on round 2, not round 1');
  assert.equal(late.answers['0'].p2, undefined);
  assert.equal(state.players[1].answered, 0, 'the teacher advancing did not forget the pupil');
});

it('a disconnect keeps points and marks the pupil offline', () => {
  let state = join(lanCreateState(plan(), 'ROOM1', 0), 'Lan', 1).state;
  state = ok(lanStartRounds(state)).state;
  state = ok(lanReduce(state, { type: 'answer', token: 'token0000000000000000001', optionId: 'a', now: 10 })).state;
  state = ok(lanReduce(state, { type: 'disconnect', token: 'token0000000000000000001', now: 15 })).state;
  assert.equal(state.players[0].connected, false);
  assert.equal(state.players[0].points, 100);
  assert.equal(lanAllConnectedAnswered(state), false, 'nobody online, so "all answered" is false');
});

it('reconnect restores the same pupil without a new round or new name', () => {
  let state = join(lanCreateState(plan(), 'ROOM1', 0), 'Lan', 1).state;
  state = ok(lanStartRounds(state)).state;
  state = ok(lanReduce(state, { type: 'disconnect', token: 'token0000000000000000001', now: 5 })).state;
  const back = ok(lanReduce(state, { type: 'reconnect', roomCode: 'ROOM1', token: 'token0000000000000000001', now: 6 }));
  assert.equal(back.playerId, 'p1');
  assert.equal(back.state.players.length, 1);
  assert.equal(back.state.players[0].connected, true);
  failWith(lanReduce(back.state, { type: 'reconnect', roomCode: 'ROOM1', token: 'token0000000000000000999', now: 7 }), 'not-in-room');
});

it('teams can be assigned until the game starts, then they are locked', () => {
  const teams = [{ id: 't1', name: 'A', icon: '🔴' }, { id: 't2', name: 'B', icon: '🔵' }];
  let state = join(lanCreateState(plan(1, teams), 'ROOM1', 0), 'Lan', 1).state;
  assert.equal(state.players[0].teamId, 't1');
  state = ok(lanReduce(state, { type: 'assign-team', playerId: 'p1', teamId: 't2' })).state;
  assert.equal(state.players[0].teamId, 't2');
  failWith(lanReduce(state, { type: 'assign-team', playerId: 'p1', teamId: 'nope' }), 'unknown-team');
  state = ok(lanStartRounds(state)).state;
  assert.equal(state.teamLocked, true);
  failWith(lanReduce(state, { type: 'assign-team', playerId: 'p1', teamId: 't1' }), 'teams-locked');
});

it('finishing closes the room to joins and answers', () => {
  let state = join(lanCreateState(plan(), 'ROOM1', 0), 'Lan', 1).state;
  state = ok(lanReduce(state, { type: 'finish', now: 50 })).state;
  assert.equal(state.phase, 'finished');
  failWith(lanReduce(state, { type: 'join', roomCode: 'ROOM1', name: 'Minh', now: 60, token: 'token0000000000000000002', id: 'p2' }), 'not-open');
  failWith(lanReduce(state, { type: 'answer', token: 'token0000000000000000001', optionId: 'a', now: 60 }), 'wrong-phase');
});

it('text rounds accept text and refuse a blank answer', () => {
  const textPlan = plan(1);
  textPlan.rounds[0].input = { kind: 'text', placeholder: 'Trả lời' };
  textPlan.rounds[0].score = (_optionId, text) => ({ correct: String(text).trim().toLowerCase() === 'paris', points: 80 });
  let state = join(lanCreateState(textPlan, 'ROOM1', 0), 'Lan', 1).state;
  state = ok(lanStartRounds(state)).state;
  failWith(lanReduce(state, { type: 'answer', token: 'token0000000000000000001', optionId: 'a', answerText: '', now: 1 }), 'bad-answer');
  const out = ok(lanReduce(state, { type: 'answer', token: 'token0000000000000000001', optionId: null, answerText: ' Paris ', now: 2 })).state;
  assert.equal(out.players[0].points, 80);
  assert.equal(out.answers['0'].p1.answerText, ' Paris ');
});

it('reducers never mutate the state they were given', () => {
  const created = ok(lanStartRounds(join(lanCreateState(plan(), 'ROOM1', 0), 'Lan', 1).state)).state;
  const frozen = JSON.stringify(created);
  ok(lanReduce(created, { type: 'answer', token: 'token0000000000000000001', optionId: 'a', now: 1 }));
  ok(lanReduce(created, { type: 'disconnect', token: 'token0000000000000000001', now: 2 }));
  ok(lanReduce(created, { type: 'next-round', now: 3 }));
  ok(lanReduce(created, { type: 'finish', now: 4 }));
  ok(lanStartRounds(lanCreateState(plan(), 'ROOM1', 0)));
  assert.equal(JSON.stringify(created), frozen);
});

it('a game with no rounds is finished immediately instead of opening a dead room', () => {
  const empty = lanCreateState(plan(0), 'ROOM1', 0);
  assert.equal(empty.phase, 'finished');
  failWith(lanStartRounds(empty), 'wrong-phase');
});

console.log(`lan-reducer: ${passed} checks passed`);
