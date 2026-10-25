import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  clearAiLogs,
  createAiLogWriter,
  formatAiLogLine,
  formatDiagnosticBundle,
  redactValue,
  sanitizeLogMessage,
  writeDiagnosticBundle
} from '../../src/services/ai-log';

function tempDir(label: string): string {
  return mkdtempSync(path.join(os.tmpdir(), `edugame-ai-log-${label}-`));
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

const fixedNow = () => new Date('2026-10-21T03:04:05.000Z');
const dayName = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// --- redaction ------------------------------------------------------------
{
  const redacted = redactValue({
    apiKey: 'sk-live-secret',
    nested: {
      Authorization: 'Bearer abc',
      password: 'hunter2',
      accessToken: 'tok_123',
      safe: 'keep-me'
    },
    list: [{ clientSecret: 'shh', id: 'p1' }],
    count: 3
  }) as Record<string, any>;
  assert.equal(redacted.apiKey, '[redacted]');
  assert.equal(redacted.nested.Authorization, '[redacted]');
  assert.equal(redacted.nested.password, '[redacted]');
  assert.equal(redacted.nested.accessToken, '[redacted]');
  assert.equal(redacted.nested.safe, 'keep-me');
  assert.equal(redacted.list[0].clientSecret, '[redacted]');
  assert.equal(redacted.list[0].id, 'p1');
  assert.equal(redacted.count, 3);

  const circular: Record<string, unknown> = { id: 'x' };
  circular.self = circular;
  const safe = redactValue(circular) as Record<string, unknown>;
  assert.equal(safe.self, '[circular]');
  console.log('ok redactValue');
}

// --- line formatting ------------------------------------------------------
{
  const line = formatAiLogLine({
    time: '2026-10-21T03:04:05.000Z',
    level: 'warn',
    event: 'generate.incomplete',
    data: { requested: 4, found: 1, apiKey: 'sk-nope' }
  });
  const parsed = JSON.parse(line);
  assert.equal(parsed.level, 'warn');
  assert.equal(parsed.event, 'generate.incomplete');
  assert.equal(parsed.data.requested, 4);
  assert.equal(parsed.data.apiKey, '[redacted]');
  assert.ok(!line.includes('sk-nope'));
  console.log('ok formatAiLogLine');
}

// --- error messages never carry quoted generated content ------------------
{
  const message = sanitizeLogMessage(new Error('Nhánh "Uống nước" trỏ tới tình huống không tồn tại.'));
  assert.ok(!message.includes('Uống nước'), 'quoted generated text is elided');
  assert.ok(message.includes('trỏ tới tình huống không tồn tại'), 'the diagnostic part survives');
  assert.equal(sanitizeLogMessage('dòng 1\n\ndòng 2'), 'dòng 1 dòng 2');
  assert.equal(sanitizeLogMessage('x'.repeat(400)).length, 240);
  assert.equal(sanitizeLogMessage(undefined), '');
  assert.equal(sanitizeLogMessage({ message: 'Mã lỗi 42' }), 'Mã lỗi 42');
  console.log('ok sanitizeLogMessage');
}

// --- append, redaction on disk, readRecent --------------------------------
{
  const dir = tempDir('append');
  const writer = createAiLogWriter({ directory: dir, now: fixedNow });
  writer.info('app.start', { version: '0.3.0', apiKey: 'sk-should-not-land' });
  writer.warn('generate.incomplete', { reason: 'Mới có 1/4 câu hỏi', attempt: 1 });
  writer.error('generate.error', { code: 'AI_TIMEOUT', message: 'quá thời gian' });

  const file = path.join(dir, `ai-${dayName(fixedNow())}.jsonl`);
  assert.ok(existsSync(file), 'daily file exists');
  const raw = readFileSync(file, 'utf8');
  assert.ok(!raw.includes('sk-should-not-land'), 'secret never reaches disk');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 3);
  assert.equal(JSON.parse(lines[0]).event, 'app.start');

  const recent = writer.readRecent(2);
  assert.equal(recent.length, 2);
  assert.equal(JSON.parse(recent[0]).event, 'generate.incomplete');
  assert.equal(JSON.parse(recent[1]).event, 'generate.error');
  assert.deepEqual(writer.files(), [file]);
  console.log('ok writer append + readRecent');
}

// --- rotation at maxFileBytes --------------------------------------------
{
  const dir = tempDir('rotate');
  const writer = createAiLogWriter({ directory: dir, maxFileBytes: 16 * 1024, now: fixedNow });
  for (let index = 0; index < 150; index += 1) {
    writer.info('generate.attempt', { attempt: index + 1, pad: 'x'.repeat(200) });
  }
  const files = writer.files();
  assert.ok(files.length >= 2, `expected rotation, got ${files.length} file(s)`);
  const newestLines = writer.readRecent(3);
  assert.equal(newestLines.length, 3);
  console.log('ok rotation');
}

// --- retention prune ------------------------------------------------------
{
  const dir = tempDir('prune');
  const stale = path.join(dir, 'ai-2020-01-01.jsonl');
  writeFileSync(stale, '{"time":"2020-01-01T00:00:00.000Z","level":"info","event":"old"}\n', 'utf8');
  const old = new Date('2020-01-01T00:00:00.000Z');
  utimesSync(stale, old, old);
  const fresh = path.join(dir, 'ai-2026-10-21.jsonl');
  writeFileSync(fresh, '{"time":"2026-10-21T00:00:00.000Z","level":"info","event":"new"}\n', 'utf8');
  const writer = createAiLogWriter({ directory: dir, retentionDays: 14, now: fixedNow });
  assert.equal(existsSync(stale), false, 'file older than retention is removed');
  assert.equal(existsSync(fresh), true);
  writer.prune();
  console.log('ok prune');
}

// --- bundle + write -------------------------------------------------------
{
  const dir = tempDir('bundle');
  const writer = createAiLogWriter({ directory: dir, now: fixedNow });
  writer.info('app.start', { version: '0.3.0' });
  writer.info('generate.done', { requested: 4, found: 4, attempts: 1, seconds: 71, password: 'hunter2' });
  const lines = writer.readRecent(200);
  const text = formatDiagnosticBundle({
    generatedAt: '2026-10-21T03:05:00.000Z',
    appVersion: '0.3.0',
    electronVersion: '33.0.0',
    platform: 'win32',
    arch: 'x64',
    cpuModel: 'Intel Core i5-10210U',
    logicalCpuCount: 8,
    totalRamBytes: 16 * 1024 * 1024 * 1024,
    models: [
      { id: 'qwen3.5-2b-q4_k_m', displayName: 'Bản Nhanh 2B', installed: true },
      { id: 'qwen3.5-4b-q4_k_m', displayName: 'Bản Sâu 4B', installed: false }
    ],
    runtime: { installed: true, state: 'READY', modelId: 'qwen3.5-2b-q4_k_m' },
    logDirectory: dir,
    retentionDays: 14
  }, lines);

  assert.ok(text.includes('EduGame Studio — gói chẩn đoán AI'));
  assert.ok(text.includes('0.3.0'));
  assert.ok(text.includes('Intel Core i5-10210U'));
  assert.ok(text.includes('Bản Nhanh 2B (qwen3.5-2b-q4_k_m)'));
  assert.ok(text.includes('Runtime llama.cpp: đã cài'));
  assert.ok(text.includes('Không có nội dung giáo án, prompt, câu trả lời của model hay khóa API'));
  assert.ok(text.includes('"event":"app.start"'));
  assert.ok(text.includes('"requested":4'));
  assert.ok(!text.includes('hunter2'), 'redacted line is included, secret is not');
  assert.ok(!text.includes('Bản Sâu 4B ('), 'models that are not installed are not listed as installed');

  const written = writeDiagnosticBundle(dir, text, fixedNow);
  assert.ok(existsSync(written.path));
  assert.ok(written.bytes > 0);
  assert.equal(readFileSync(written.path, 'utf8'), text);
  const second = writeDiagnosticBundle(dir, text, fixedNow);
  assert.notEqual(second.path, written.path, 'two exports in the same millisecond never overwrite each other');
  assert.ok(readdirSync(dir).some(name => name.startsWith('diagnostics-')));
  console.log('ok diagnostic bundle');
}

// --- clear logs -----------------------------------------------------------
{
  const dir = tempDir('clear');
  const writer = createAiLogWriter({ directory: dir, now: fixedNow });
  writer.info('app.start', { version: '0.3.0' });
  writeDiagnosticBundle(dir, 'bundle', fixedNow);
  writeFileSync(path.join(dir, 'keep-me.txt'), 'not ours', 'utf8');
  const result = clearAiLogs(dir);
  assert.ok(result.removed >= 2, `expected the app files to be removed, got ${result.removed}`);
  assert.ok(result.bytes > 0);
  assert.deepEqual(readdirSync(dir), ['keep-me.txt'], 'unrelated files are left alone');
  console.log('ok clearAiLogs');
}

console.log('ai-log.test.ts passed');
