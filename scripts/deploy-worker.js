#!/usr/bin/env node
/**
 * #364 — deploy Worker bằng API Cloudflare, không cần wrangler.
 *
 * Vì sao là một tệp trong repo chứ không phải lệnh tay: mỗi lần deploy là một lần dễ quên một
 * binding. Tệp này đọc `.env` và khai ĐÚNG bộ biến mà gateway cần, kể cả biến thanh toán khi có —
 * nhưng KHÔNG tự bật `EDUGAME_ALLOW_FAKE_PAYMENTS`, vì cờ đó biến máy chủ thật thành "ai có token
 * cũng được Pro miễn phí".
 *
 * Cách dùng:
 *   node --env-file=.env scripts/deploy-worker.js
 *   node --env-file=.env scripts/deploy-worker.js --script ai-gateway-fake --allow-fake
 *   node --env-file=.env scripts/deploy-worker.js --script ai-gateway-fake --var EDUGAME_BILLING_PROVIDER=fake
 */
const { build } = require('esbuild');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '2b919fc574709d476f6ec08e0828d323';
const SCRIPT = arg('--script', process.env.EDUGAME_WORKER_SCRIPT || 'ai-gateway');
const ALLOW_FAKE = process.argv.includes('--allow-fake');
/** `--var NAME=VALUE` (lặp được): biến chỉ thuộc về LẦN DEPLOY NÀY, không cần có trong .env. */
const CLI_VARS = process.argv.reduce((list, value, index, argv) => {
  if (value === '--var' && argv[index + 1] && argv[index + 1].includes('=')) {
    const [name, ...rest] = argv[index + 1].split('=');
    list.push({ type: 'plain_text', name, text: rest.join('=') });
  }
  return list;
}, []);
const COMPAT_DATE = '2025-01-01';

/** Biến thường: đọc được từ dashboard, không phải bí mật. */
function plainBindings() {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const list = [
    { type: 'plain_text', name: 'GATEWAY_VERSION', text: version },
    { type: 'plain_text', name: 'GEMINI_MODEL', text: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' },
    { type: 'plain_text', name: 'SUPABASE_URL', text: process.env.SUPABASE_URL || '' },
    { type: 'plain_text', name: 'SUPABASE_ANON_KEY', text: process.env.SUPABASE_ANON_KEY || '' },
  ];
  const optional = [
    'EDUGAME_BILLING_PROVIDER',
    'EDUGAME_PRO_PRICE_VND',
    'EDUGAME_PRO_PERIOD_DAYS',
    'EDUGAME_PRO_CREDITS',
    'EDUGAME_PUBLIC_URL',
  ];
  for (const name of optional) {
    if (process.env[name]) list.push({ type: 'plain_text', name, text: process.env[name] });
  }
  if (ALLOW_FAKE) list.push({ type: 'plain_text', name: 'EDUGAME_ALLOW_FAKE_PAYMENTS', text: '1' });
  // `--var` đi sau nên nó THẮNG .env — một script staging phải khai được `fake` kể cả khi .env
  // đang nói `payos` (hoặc chưa nói gì).
  for (const binding of CLI_VARS) {
    const at = list.findIndex((item) => item.name === binding.name);
    if (at >= 0) list.splice(at, 1);
    list.push(binding);
  }
  return list;
}

/** Secret: gửi riêng qua endpoint `/secrets`, không nằm trong metadata. */
const SECRETS = ['GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY'];

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN || '';
  if (!token) throw new Error('thiếu CLOUDFLARE_API_TOKEN trong .env');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) throw new Error('thiếu SUPABASE_URL / SUPABASE_ANON_KEY');
  if (ALLOW_FAKE && SCRIPT === 'ai-gateway') {
    throw new Error('--allow-fake bị từ chối trên script ai-gateway: dùng một script riêng, ví dụ --script ai-gateway-fake');
  }

  const outDir = path.join(os.tmpdir(), 'eg-worker-' + Date.now());
  mkdirSync(outDir, { recursive: true });
  const outfile = path.join(outDir, 'index.mjs');
  await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', target: 'es2022', platform: 'neutral', outfile });
  const code = readFileSync(outfile, 'utf8');
  // Bundle không được kéo theo `node:` — bật `nodejs_compat` chỉ để chạy một import không cần
  // thiết là tăng bề mặt lỗi của máy chủ tiền.
  if (/require\("node:|from "node:/.test(code)) throw new Error('bundle cần nodejs_compat — không được');

  const metadata = { main_module: 'index.mjs', compatibility_date: COMPAT_DATE, bindings: plainBindings() };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
  form.append('index.mjs', new Blob([code], { type: 'application/javascript+module' }), 'index.mjs');
  const upload = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const result = await upload.json();
  console.log(`upload ${SCRIPT}: ${upload.status} success=${result.success} etag=${result.result && result.result.etag} bytes=${code.length}`);
  if (!upload.ok) {
    console.log(JSON.stringify(result.errors || result).slice(0, 500));
    process.exit(1);
  }

  // Secret là trạng thái SỐNG trên máy chủ: chỉ đẩy cái đang có trong .env, không xoá cái khác,
  // và không bao giờ in giá trị.
  for (const name of SECRETS) {
    const value = process.env[name];
    if (!value) continue;
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/secrets`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, text: value, type: 'secret_text' }),
    });
    console.log(`secret ${name}: ${response.status}${response.ok ? '' : ' (lỗi)'}`);
  }

  writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  console.log('bundle + metadata để đối chiếu: ' + outDir);
}

main().catch(error => {
  console.error('deploy-worker lỗi:', error && error.message ? error.message : error);
  process.exit(1);
});
