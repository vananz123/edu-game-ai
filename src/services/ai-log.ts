/**
 * AI diagnostic log (O10).
 *
 * Teachers run EduGame Studio on machines we cannot inspect. When local AI
 * behaves strangely (a short draft, a runtime that will not start) the only way
 * to diagnose it is a log the teacher can send back. This module owns that log:
 *
 *  - one JSON object per line, files per day under `<userData>/edugame-data/logs`,
 *  - **no lesson text, prompts, model answers or API keys** — only ids, counts,
 *    durations, model/runtime facts and error codes/messages. Secrets are
 *    redacted defensively by key name in case a caller passes a settings object,
 *  - bounded on disk: rotate the current day file at `maxFileBytes` and delete
 *    files older than `retentionDays`,
 *  - `formatDiagnosticBundle()` turns the recent lines plus machine facts into a
 *    single `.txt` the teacher can attach to a message.
 *
 * All file operations are best-effort: a broken log must never fail a game
 * generation or crash the app.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';

export type AiLogLevel = 'info' | 'warn' | 'error';

export interface AiLogEntry {
  time: string;
  level: AiLogLevel;
  event: string;
  data?: Record<string, unknown>;
}

/** Key names that must never reach disk, even if a caller is careless. */
const SENSITIVE_KEY = /(api[-_]?key|authorization|password|secret|token|cookie|credential)/i;
const LOG_FILE = /^ai-\d{4}-\d{2}-\d{2}(-\d{9})?\.jsonl$/;

const DAY_MS = 24 * 60 * 60 * 1000;

export function redactValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (Array.isArray(value)) return value.map(item => redactValue(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactValue(item, seen);
  }
  return output;
}

/** One JSONL line, with defensive redaction and a stable key order. */
export function formatAiLogLine(entry: AiLogEntry): string {
  return JSON.stringify({
    time: entry.time,
    level: entry.level,
    event: entry.event,
    ...(entry.data ? { data: redactValue(entry.data) } : {})
  });
}

/**
 * Validation/transport messages can quote the model's own text (for example
 * `Nhánh "…" trỏ tới tình huống không tồn tại`). The log must never carry that
 * content, so quoted fragments are elided and the rest is flattened/truncated.
 */
export function sanitizeLogMessage(value: unknown, maxLength = 240): string {
  const raw = typeof value === 'string'
    ? value
    : String((value && (value as { message?: unknown }).message) || value || '');
  return raw
    .replace(/"[^"]*"|“[^”]*”|‘[^’]*’|«[^»]*»/g, '"…"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(1, maxLength));
}

export interface AiLogWriterOptions {
  directory: string;
  /** Default 14 days. */
  retentionDays?: number;
  /** Default 2 MB per day file; older lines are rotated, never mixed in. */
  maxFileBytes?: number;
  now?: () => Date;
}

export interface AiLogWriter {
  readonly directory: string;
  write(level: AiLogLevel, event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
  /** Newest lines, oldest first, up to `limit`. */
  readRecent(limit: number): string[];
  /** Log files currently on disk (oldest first). */
  files(): string[];
  prune(): void;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dayStamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeStamp(date: Date): string {
  return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** Rotated files and bundles include milliseconds so same-second work never collides. */
function fileStamp(date: Date): string {
  return `${timeStamp(date)}${String(date.getMilliseconds()).padStart(3, '0')}`;
}

export function createAiLogWriter(options: AiLogWriterOptions): AiLogWriter {
  const directory = options.directory;
  const retentionDays = Math.max(1, options.retentionDays ?? 14);
  const maxFileBytes = Math.max(16 * 1024, options.maxFileBytes ?? 2 * 1024 * 1024);
  const now = options.now ?? (() => new Date());

  try {
    mkdirSync(directory, { recursive: true });
  } catch {
    // A read-only profile still gets a working app; writes below are no-ops.
  }

  function files(): string[] {
    try {
      return readdirSync(directory)
        .filter(name => LOG_FILE.test(name))
        .sort()
        .map(name => path.join(directory, name));
    } catch {
      return [];
    }
  }

  function prune(): void {
    const cutoff = now().getTime() - retentionDays * DAY_MS;
    for (const file of files()) {
      try {
        if (statSync(file).mtimeMs < cutoff) unlinkSync(file);
      } catch {
        // Ignore: another process may have removed it already.
      }
    }
  }

  function currentFile(date: Date): string {
    return path.join(directory, `ai-${dayStamp(date)}.jsonl`);
  }

  function write(level: AiLogLevel, event: string, data?: Record<string, unknown>): void {
    try {
      const date = now();
      let file = currentFile(date);
      if (existsSync(file) && statSync(file).size >= maxFileBytes) {
        renameSync(file, path.join(directory, `ai-${dayStamp(date)}-${fileStamp(date)}.jsonl`));
        file = currentFile(date);
      }
      appendFileSync(file, `${formatAiLogLine({ time: date.toISOString(), level, event, ...(data ? { data } : {}) })}\n`, 'utf8');
    } catch {
      // Never let diagnostics break the feature being diagnosed.
    }
  }

  function readRecent(limit: number): string[] {
    const wanted = Math.max(1, Math.floor(limit) || 1);
    const collected: string[] = [];
    const list = files();
    for (let index = list.length - 1; index >= 0 && collected.length < wanted; index -= 1) {
      let lines: string[] = [];
      try {
        lines = readFileSync(list[index], 'utf8').split(/\r?\n/).filter(Boolean);
      } catch {
        continue;
      }
      collected.unshift(...lines);
    }
    return collected.slice(-wanted);
  }

  prune();

  return {
    directory,
    write,
    info: (event, data) => write('info', event, data),
    warn: (event, data) => write('warn', event, data),
    error: (event, data) => write('error', event, data),
    readRecent,
    files,
    prune
  };
}

export interface DiagnosticBundleContext {
  generatedAt: string;
  appVersion: string;
  electronVersion?: string;
  platform: string;
  arch: string;
  cpuModel: string;
  logicalCpuCount: number;
  totalRamBytes: number;
  models: { id: string; displayName: string; installed: boolean }[];
  runtime: { installed: boolean; state: string; modelId?: string | null };
  logDirectory: string;
  retentionDays: number;
}

function formatMegabytes(bytes: number): string {
  const value = Number(bytes) || 0;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Header + recent JSONL lines. The header is deliberately human-readable so a
 * teacher (or a support person) can see the machine facts without a parser.
 */
export function formatDiagnosticBundle(context: DiagnosticBundleContext, lines: string[]): string {
  const installed = context.models.filter(model => model.installed);
  return [
    'EduGame Studio — gói chẩn đoán AI',
    `Tạo lúc: ${context.generatedAt}`,
    `Phiên bản ứng dụng: ${context.appVersion}${context.electronVersion ? ` (Electron ${context.electronVersion})` : ''}`,
    `Hệ điều hành: ${context.platform} ${context.arch}`,
    `CPU: ${context.cpuModel || 'không nhận diện được'} · ${context.logicalCpuCount} luồng logic`,
    `RAM: ${formatMegabytes(context.totalRamBytes)}`,
    `Model đã cài: ${installed.length ? installed.map(model => `${model.displayName} (${model.id})`).join(', ') : 'chưa có'}`,
    `Runtime llama.cpp: ${context.runtime.installed ? 'đã cài' : 'chưa cài'} · trạng thái ${context.runtime.state}${context.runtime.modelId ? ` · model ${context.runtime.modelId}` : ''}`,
    `Thư mục log: ${context.logDirectory} (giữ ${context.retentionDays} ngày)`,
    '',
    'Lưu ý quyền riêng tư: log chỉ chứa id dự án/tài liệu, số lượng mục, thời gian, model/runtime và mã lỗi.',
    'Không có nội dung giáo án, prompt, câu trả lời của model hay khóa API trong tệp này.',
    '',
    `--- log (${lines.length} dòng gần nhất) ---`,
    ...(lines.length ? lines : ['(chưa có dòng log nào)']),
    ''
  ].join('\n');
}

/** Writes the bundle next to the logs and returns the absolute path. */
export function writeDiagnosticBundle(
  directory: string,
  text: string,
  now: () => Date = () => new Date(),
  prefix = 'diagnostics'
): { path: string; bytes: number } {
  mkdirSync(directory, { recursive: true });
  const date = now();
  const stamp = `${dayStamp(date)}-${fileStamp(date)}`;
  let file = path.join(directory, `${prefix}-${stamp}.txt`);
  let suffix = 2;
  while (existsSync(file)) {
    file = path.join(directory, `${prefix}-${stamp}-${suffix}.txt`);
    suffix += 1;
  }
  writeFileSync(file, text, 'utf8');
  return { path: file, bytes: Buffer.byteLength(text, 'utf8') };
}

const DIAGNOSTIC_FILE = /^(ai-.*\.jsonl|diagnostics-.*\.txt)$/;

/**
 * O10: deletes the app's own log and bundle files (nothing else in the folder).
 * Exported bundles on the Desktop are the teacher's files and are not touched.
 */
export function clearAiLogs(directory: string): { removed: number; bytes: number } {
  let removed = 0;
  let bytes = 0;
  let names: string[] = [];
  try {
    names = readdirSync(directory);
  } catch {
    return { removed, bytes };
  }
  for (const name of names) {
    if (!DIAGNOSTIC_FILE.test(name)) continue;
    try {
      const file = path.join(directory, name);
      bytes += statSync(file).size;
      unlinkSync(file);
      removed += 1;
    } catch {
      // A file opened by Explorer may be locked; keep going and report the rest.
    }
  }
  return { removed, bytes };
}
