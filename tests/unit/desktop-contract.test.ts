import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Test chạy từ `dist/tests/unit` (JSON không được tsc chép sang) hoặc từ
// `tests/unit` khi chạy bằng tsx — nhảy lên cho tới khi thấy package.json.
function findRepoRoot(start: string): string {
  let current = start;
  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(current, 'package.json'))) return current;
    current = path.dirname(current);
  }
  throw new Error(`không tìm thấy gốc repo từ ${start}`);
}

const root = findRepoRoot(__dirname);
const contract = JSON.parse(
  fs.readFileSync(path.join(root, 'src', 'shared', 'desktop-contract.json'), 'utf8'),
);

const preloadSource = fs.readFileSync(path.join(root, 'src', 'preload.ts'), 'utf8');
const typesSource = fs.readFileSync(path.join(root, 'src', 'shared', 'types.ts'), 'utf8');

function interfaceMembers(source: string): Set<string> {
  const start = source.indexOf('export interface EduGameBridge {');
  assert.ok(start >= 0, 'không tìm thấy `export interface EduGameBridge`');
  // Tệp dùng CRLF: dấu đóng là `\r\n}\r\n`, không phải `\n}\n`.
  const end = source.slice(start).search(/\n\}/);
  assert.ok(end > 0, 'không tìm thấy dấu đóng của EduGameBridge');
  const body = source.slice(start, start + end);
  return new Set([...body.matchAll(/^ {2}([A-Za-z0-9_]+)\(/gm)].map(match => match[1]));
}

function preloadKeys() {
  return new Set([...preloadSource.matchAll(/^ {2}([A-Za-z0-9_]+):/gm)].map(match => match[1]));
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('desktop-contract.json khớp số khoá với preload.ts', () => {
  const fromPreload = preloadKeys();
  const fromContract = new Set([
    ...Object.keys(contract.invoke),
    ...Object.keys(contract.send),
    ...Object.keys(contract.event),
  ]);
  const order = list => [...list].sort();
  assert.deepEqual(order(fromContract), order(fromPreload));
});

test('mỗi khoá preload thuộc đúng một loại (invoke / send / event)', () => {
  for (const key of Object.keys(contract.invoke)) {
    assert.ok(!contract.send[key], `${key} vừa invoke vừa send`);
    assert.ok(!contract.event[key], `${key} vừa invoke vừa event`);
  }
  for (const key of Object.keys(contract.send)) {
    assert.ok(!contract.event[key], `${key} vừa send vừa event`);
  }
});

test('kênh event ghi nhận đủ 8 sự kiện main → renderer', () => {
  assert.deepEqual(Object.keys(contract.event).sort(), [
    'onAboutState',
    'onFullscreenChanged',
    'onLanState',
    'onLessonProgress',
    'onLocalAiProgress',
    'onPresentationExit',
    'onPresentationState',
    'onSetupProgress',
  ]);
});

test('khoá preload có kiểu trong EduGameBridge', () => {
  const typed = interfaceMembers(typesSource);
  const missing = [...preloadKeys()].filter(key => !typed.has(key)).sort();
  assert.deepEqual(missing, [], `khoá chưa khai kiểu trong EduGameBridge: ${missing.join(', ')}`);
});

test('EduGameBridge không khai khoá không tồn tại trong preload', () => {
  const typed = interfaceMembers(typesSource);
  const fromPreload = preloadKeys();
  const extra = [...typed].filter(key => !fromPreload.has(key)).sort();
  assert.deepEqual(extra, [], `EduGameBridge khai khoá không có trong preload: ${extra.join(', ')}`);
});
