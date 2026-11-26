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
 *   npm run check:embedded-gateway -- --require --pilot  # bản phát cho giáo viên: https, không localhost,
 *                                                       #  và gateway thật phải tự khai đúng tên + bản
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXE = path.join(ROOT, 'src-tauri', 'target', 'release', 'edugame-studio-tauri.exe');
const NAME = 'EDUGAME_AI_GATEWAY_URL';
const requireConfigured = process.argv.includes('--require');
// #359: một bộ cài giao cho giáo viên mà trỏ `127.0.0.1` thì Cloud AI chỉ chạy trên máy
// người dựng. Cờ `--pilot` biến điều đó thành lỗi phát hành, thay vì một lời nhắc trong docs.
const pilot = process.argv.includes('--pilot');
// `--pilot` kiểm cả DANH TÍNH gateway đang chạy thật. Một worker "gần đúng" (trả `ok:true`
// nhưng là gateway khác, xác thực bằng khoá chung) đã làm mất một buổi (#360), nên bộ cài cho
// giáo viên không được coi là phát hành được khi chưa hỏi chính nó là ai. `--no-live` để dựng
// offline (máy không có mạng) — khi đó phải nói rõ là chưa kiểm được.
const liveCheck = pilot && !process.argv.includes('--no-live');
const LOCAL_HOSTS = /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?/iu;

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

if (pilot) {
  if (!/^https:\/\//u.test(wanted)) {
    console.error('check-embedded-gateway: FAIL (--pilot) — bộ cài cho giáo viên phải trỏ https, đang là "' + wanted + '".');
    process.exit(1);
  }
  if (LOCAL_HOSTS.test(wanted)) {
    console.error('check-embedded-gateway: FAIL (--pilot) — "' + wanted + '" chỉ chạy trên máy người dựng. Hãy dựng với gateway đã triển khai.');
    process.exit(1);
  }
}
async function main() {
  // Hỏi gateway TRƯỚC: nếu nó không phải gateway của sản phẩm này thì việc URL có nằm trong
  // exe hay không cũng không cứu được bản cài. Chẩn đoán đúng chỗ trước, byte sau.
  if (liveCheck) {
    const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    let response = null;
    try {
      response = await fetch(wanted + '/health', { signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      console.error('check-embedded-gateway: FAIL (--pilot) — không gọi được ' + wanted + '/health (' + error.message + ').');
      console.error('Bộ cài trỏ vào một gateway không trả lời được. Sửa host trước khi phát cho giáo viên.');
      process.exit(1);
    }
    const text = await response.text().catch(() => '');
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    const service = body && typeof body.service === 'string' ? body.service : '';
    const version = body && typeof body.version === 'string' ? body.version : '';
    if (response.status !== 200 || !body || body.ok !== true || service !== 'edugame-ai-gateway') {
      console.error('check-embedded-gateway: FAIL (--pilot) — gateway KHONG phai cua san pham nay.');
      console.error('  đòi: service="edugame-ai-gateway", ok=true');
      console.error('  nhận: status=' + response.status + ' service="' + service + '" body=' + text.slice(0, 160));
      process.exit(1);
    }
    if (version !== expected) {
      console.error('check-embedded-gateway: FAIL (--pilot) — gateway báo bản "' + version + '", bộ cài là "' + expected + '".');
      process.exit(1);
    }
    console.log('check-embedded-gateway: OK — gateway đang chạy là edugame-ai-gateway ' + version + ' (' + response.status + ').');
  } else if (pilot) {
    console.log('check-embedded-gateway: chú ý — bỏ qua kiểm danh tính gateway (--no-live): CHƯA biết host có đúng không.');
  }

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
}

void main().catch((error) => {
  console.error('check-embedded-gateway: FAIL — ' + (error && error.message ? error.message : String(error)));
  process.exit(1);
});
