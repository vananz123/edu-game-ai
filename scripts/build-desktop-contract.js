#!/usr/bin/env node
/**
 * Sinh `src/shared/desktop-contract.json` từ `src/preload.ts`.
 *
 * Vì sao có file này
 * ------------------
 * `window.eduGame` là hợp đồng duy nhất giữa renderer và lớp desktop. Bản
 * Electron giữ hợp đồng đó trong preload; bản Tauri (Core/Api) phải phục vụ
 * đúng *cùng* tập khoá và sự kiện, nếu không một nút nào đó sẽ chết im lặng ở
 * bản Tauri mà không có lỗi biên dịch nào báo.
 *
 * Nguồn sự thật vẫn là `preload.ts` (Electron đang chạy). File JSON này là
 * bản chụp có thể so sánh của hợp đồng đó; test `desktop-contract.test.ts`
 * đọc cả hai và báo lệch theo từng khoá.
 *
 * Preload chạy sandbox nên không import được `src/shared/*`; vì vậy không thể
 * đặt hợp đồng vào một module TS dùng chung. Sinh JSON ra khỏi nó là cách duy
 * nhất giữ một nguồn sự thật mà cả hai vỏ cùng so được.
 *
 * Cách chạy: node scripts/build-desktop-contract.js [--check]
 *   (mặc định) ghi lại file JSON
 *   --check    chỉ so sánh; lệch → exit 1 (dùng trong cổng kiểm tra)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const preloadPath = path.join(root, 'src', 'preload.ts');
const contractPath = path.join(root, 'src', 'shared', 'desktop-contract.json');

/**
 * Quét preload theo dòng. Không dùng AST để khỏi thêm dependency; định dạng
 * preload là danh sách khoá phẳng nên quét dòng là đủ và dễ soát.
 */
function readPreload() {
  const source = fs.readFileSync(preloadPath, 'utf8');
  /** @type {{invoke: Record<string,string>, send: Record<string,string>, event: Record<string,string>}} */
  const out = { invoke: {}, send: {}, event: {} };

  const lines = source.split(/\r?\n/);
  let pendingKey = null;
  for (const line of lines) {
    const keyMatch = line.match(/^ {2}([A-Za-z0-9_]+):/);
    if (keyMatch) pendingKey = keyMatch[1];

    const invoke = line.match(/ipcRenderer\.invoke\(\s*'([^']+)'/);
    if (invoke && pendingKey) out.invoke[pendingKey] = invoke[1];

    const send = line.match(/ipcRenderer\.send\(\s*'([^']+)'/);
    if (send && pendingKey) out.send[pendingKey] = send[1];

    const on = line.match(/ipcRenderer\.on\(\s*'([^']+)'/);
    if (on && pendingKey) out.event[pendingKey] = on[1];
  }
  return out;
}

function build() {
  const surface = readPreload();
  const keys = [
    ...Object.keys(surface.invoke),
    ...Object.keys(surface.send),
    ...Object.keys(surface.event),
  ].sort();

  const duplicate = keys.filter((k, i) => i > 0 && keys[i - 1] === k);
  if (duplicate.length) {
    console.error('Khoá trùng trong preload:', duplicate.join(', '));
    process.exit(1);
  }

  const sameKeyDifferentKind = keys.filter(key => {
    const kinds = ['invoke', 'send', 'event'].filter(kind => surface[kind][key]);
    return kinds.length > 1;
  });
  if (sameKeyDifferentKind.length) {
    console.error('Khoá vừa invoke vừa event/send:', sameKeyDifferentKind.join(', '));
    process.exit(1);
  }

  const sorted = kind =>
    Object.fromEntries(Object.keys(surface[kind]).sort().map(k => [k, surface[kind][k]]));

  return {
    $comment:
      'Sinh tự động từ src/preload.ts bởi scripts/build-desktop-contract.js. Không sửa tay.',
    objectName: 'eduGame',
    counts: {
      invoke: Object.keys(surface.invoke).length,
      send: Object.keys(surface.send).length,
      event: Object.keys(surface.event).length,
      total: keys.length,
    },
    invoke: sorted('invoke'),
    send: sorted('send'),
    event: sorted('event'),
  };
}

const serialized = `${JSON.stringify(build(), null, 2)}\n`;
const check = process.argv.includes('--check');

if (check) {
  const current = fs.existsSync(contractPath) ? fs.readFileSync(contractPath, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== serialized) {
    console.error(
      'src/shared/desktop-contract.json lệch với src/preload.ts.\n' +
        'Chạy: node scripts/build-desktop-contract.js',
    );
    process.exit(1);
  }
  const counts = JSON.parse(serialized).counts;
  console.log(
    `Hợp đồng desktop khớp preload: ${counts.invoke} invoke, ${counts.send} send, ` +
      `${counts.event} sự kiện (${counts.total} khoá).`,
  );
} else {
  fs.writeFileSync(contractPath, serialized, 'utf8');
  const counts = JSON.parse(serialized).counts;
  console.log(
    `Đã ghi ${path.relative(root, contractPath)}: ${counts.invoke} invoke, ` +
      `${counts.send} send, ${counts.event} sự kiện (${counts.total} khoá).`,
  );
}
