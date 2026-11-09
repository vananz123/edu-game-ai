/**
 * `game-package-ops.ts` — cửa vào của gói `.egame` cho V8 nhúng của vỏ Tauri.
 *
 * Ba thứ Rust dựa vào: `writePackage` trả đúng chữ mà `files:export-game` ghi xuống
 * đĩa cùng tên tệp gợi ý (Windows không nhận `\ / : * ? " < > |`), `readPackage`
 * đọc lại được chữ đó với một danh sách id đã lưu, và `IMPORT_GAME_MAX_BYTES` là
 * con số Rust đọc thay vì gõ lại. Gate `tauri-webview-check` đo đường tệp thật; ở
 * đây chỉ đo phần chữ, nên khi hỏng thì biết hỏng ở đâu.
 */
import assert from 'node:assert/strict';
import type { EducationalGame } from '../../src/shared/types';
import {
  IMPORT_GAME_MAX_BYTES,
  readPackage,
  suggestedFileName,
  writePackage
} from '../../src/services/game/game-package-ops';
import { writeGamePackage } from '../../src/services/game/game-package';

const game = {
  id: 'game-co-so',
  title: 'An toàn giao thông: "đèn đỏ" / dừng lại?',
  template: 'scenario',
  subject: 'Giáo dục công dân',
  questions: [{
    id: 'q1',
    type: 'scenario',
    prompt: 'Đèn đỏ thì dừng?',
    options: [{ id: 'a', text: 'Đi tiếp' }, { id: 'b', text: 'Dừng lại' }],
    correctOptionId: 'b',
    explanation: 'Dừng trước vạch.'
  }]
} as unknown as EducationalGame;

async function run(): Promise<void> {
  // --- con số kích thước: Rust đọc từ đây, không gõ lại ------------------------
  assert.equal(IMPORT_GAME_MAX_BYTES, 20 * 1024 * 1024);

  // --- tên tệp gợi ý ----------------------------------------------------------
  // Cùng biểu thức `defaultPath` của `files:export-game`: ký tự Windows cấm thành
  // `-`, cắt ở 60 ký tự, đuôi `.egame`.
  assert.equal(suggestedFileName(game), 'An toàn giao thông- -đèn đỏ- - dừng lại-.egame');
  assert.equal(suggestedFileName({ ...game, title: 'x'.repeat(100) } as EducationalGame).length, 'x'.repeat(60).length + '.egame'.length);
  assert.equal(suggestedFileName({ title: '' } as EducationalGame), 'tro-choi.egame', 'không tên thì có tên thay');
  assert.equal(suggestedFileName(null), 'tro-choi.egame');
  assert.doesNotMatch(suggestedFileName({ title: 'a\\b/c:d*e?f"g<h>i|j' } as EducationalGame), /[\\/:*?"<>|]/u);

  // --- xuất: đúng chữ của serializer dùng chung -------------------------------
  const written = writePackage(game);
  assert.equal(written.text, writeGamePackage(game), 'một serializer, hai vỏ');
  assert.equal(written.fileName, suggestedFileName(game));
  assert.match(written.text, /"packageFormat":\s*"edugame"/u);

  // --- nhập: id tác giả được giữ khi thư viện chưa có nó ----------------------
  const kept = readPackage(written.text, '2026-01-02T03:04:05.000Z', '7', []);
  assert.equal(kept.id, 'game-co-so');
  assert.equal(kept.title, game.title);
  assert.equal(kept.questions[0].explanation, 'Dừng trước vạch.');

  // --- nhập lại chính nó: id mới, không ghi đè dòng đang có -------------------
  const now = '2026-01-02T03:04:05.000Z';
  const again = readPackage(written.text, now, '7', ['game-co-so']);
  assert.match(again.id, /^imported_[0-9a-z]+_[0-9a-z]{6}$/u, `id mới: ${again.id}`);
  assert.notEqual(again.id, 'game-co-so');

  // Bộ đếm trong `freshId` tách hai lượt cùng gốc thời gian (hai lần nhập trong
  // cùng một mili-giây, canh nhau qua hai lần gọi riêng): đuôi vẫn khác vì `nonce`
  // và bộ đếm khác nhau ở mỗi lượt.
  const a = readPackage(written.text, now, '7', ['game-co-so']);
  const b = readPackage(written.text, now, '8', ['game-co-so']);
  assert.notEqual(a.id, b.id);

  // --- danh sách id hỏng không làm sập: chỉ chuỗi mới tính --------------------
  assert.equal(readPackage(written.text, now, '1', null).id, 'game-co-so', 'không có danh sách = thư viện rỗng');
  const messy = readPackage(written.text, now, '1', ['game-co-so', 7, null]);
  assert.match(messy.id, /^imported_[0-9a-z]+_[0-9a-z]{6}$/u, 'id không phải chuỗi thì bỏ qua, id trùng vẫn nhận id mới');

  // --- gói hỏng: lỗi đọc được, không phải TypeError ---------------------------
  assert.throws(() => readPackage('{not json', now, '1', []), /JSON hợp lệ/u);
  assert.throws(() => readPackage(JSON.stringify({ packageFormat: 'edugame', game: { title: 'thiếu câu hỏi' } }), now, '1', []), /thiếu tên trò chơi/u);

  console.log('Game package ops tests passed');
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
