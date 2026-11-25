#!/usr/bin/env node
/**
 * check-embedded-gateway (#356) — bản cài có thật sự mang URL gateway Cloud AI không?
 *
 * Bài học #355: một biến chỉ nằm trong môi trường của người dựng thì **không tồn tại trên
 * máy đã cài**, nên "tôi đã export nó" không phải bằng chứng. Cổng này đọc **byte của tệp
 * .exe đã dựng**: chuỗi URL phải nằm trong đó.
 *
 * Cách dùng:
 *   npm run check:embedded-gateway                       # đọc .env rồi đối chiếu .exe
 *   EDUGAME_AI_GATEWAY_URL=… npm run check:embedded-gateway   # biến env thắng .env
 *   npm run check:embedded-gateway -- --require          # thiếu cấu hình = LỖI (cổng phát hành)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXE = path.join(ROOT, 'src-tauri', 'target', 'release', 'edugame-studio-tauri.exe');
const NAME = 'EDUGAME_AI_GATEWAY_URL';
const requireConfigured = process.argv.includes('--require');

function fromDotenv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return '';
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const text = line.trim();
    if (!text || text.startsWith('#') || !text.includes('=')) continue;
    const index = text.indexOf('=');
    if (text.slice(0, index).trim() !== NAME) continue;
    return text.slice(index + 1).trim().replace(/^["']|["']$/gu, '');
  }
  return '';
}

const configured = String(process.env[NAME] || '').trim() || fromDotenv();

if (!configured) {
  if (requireConfigured) {
    console.error(
      'check-embedded-gateway: FAIL — chưa đặt ' + NAME + '. Bộ cài dựng ra sẽ KHÔNG có Cloud AI.'
    );
    console.error('Đặt một dòng trong .env rồi dựng lại: ' + NAME + '=https://…');
    process.exit(1);
  }
  console.log('check-embedded-gateway: bỏ qua — chưa đặt ' + NAME + ', nên chưa có gì để đối chiếu.');
  process.exit(0);
}

if (!fs.existsSync(EXE)) {
  console.error('check-embedded-gateway: FAIL — không có ' + path.relative(ROOT, EXE) + ', hãy dựng trước.');
  process.exit(1);
}

const wanted = configured.replace(/\/+$/u, '');
const bytes = fs.readFileSync(EXE);
const found = bytes.includes(Buffer.from(wanted, 'utf8'));

if (!found) {
  console.error(
    'check-embedded-gateway: FAIL — chuỗi "' + wanted + '" KHÔNG có trong ' + path.relative(ROOT, EXE) + '.'
  );
  console.error('Nghĩa là bản dựng này không nhúng URL gateway (hoặc .exe còn là bản dựng cũ).');
  process.exit(1);
}

console.log(
  'check-embedded-gateway: OK — ' + wanted + ' có trong ' + path.relative(ROOT, EXE)
    + ' (' + Math.round(bytes.length / 1024) + ' KiB).'
);
