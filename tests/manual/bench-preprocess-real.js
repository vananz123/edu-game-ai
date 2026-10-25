/**
 * Real-document check for the lesson preprocessor.
 *
 * Extracts text from PDFs exactly the way the app does (`pdfParse(buffer)` in
 * `src/main.ts`, `files:import-document-from-path`), then reports what L1/L2/L3
 * do to that text. This is the first run against documents a teacher actually
 * uploaded (tests/tailieu/*.pdf), not the synthetic fixtures.
 *
 * The scripts are CONTRACTS ONLY — no teacher or student personal data is
 * asserted, and no text is written to disk.
 *
 * Run: npm run build && node tests/manual/bench-preprocess-real.js
 */
const fs = require('node:fs');
const path = require('node:path');
const pdfParse = require('pdf-parse');
const {
  preprocessLessonSource,
  preprocessBudgetForMode
} = require(path.join(__dirname, '..', '..', 'dist', 'src', 'services', 'lesson-preprocess.js'));

const CHARS_PER_TOKEN = 3.23;
const tokens = chars => Math.round(chars / CHARS_PER_TOKEN);
const DOC_DIR = path.join(__dirname, '..', 'tailieu');

/** Content that must survive excerpting, checked by regex on the output. */
const KEEP_PATTERNS = [
  { id: 'câu hỏi', re: /(?:^|[^\p{L}])(?:câu hỏi|hỏi)(?![^\p{L}])/iu },
  { id: 'đáp án', re: /(?:^|[^\p{L}])(?:đáp án|trả lời|lời giải)(?![^\p{L}])/iu },
  { id: 'số liệu', re: /\d+\s*(?:%|phút|giây|năm|tuổi|điểm|byte|MB|lần)/iu },
  { id: 'hoạt động', re: /(?:^|[^\p{L}])hoạt động(?![^\p{L}])/iu }
];

function countMatches(text, pattern) {
  const matcher = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  return [...text.matchAll(matcher)].length;
}

function lines(text) {
  return text.split('\n').length;
}

async function main() {
  if (!fs.existsSync(DOC_DIR)) {
    process.stdout.write(`No real documents at ${DOC_DIR}; nothing to measure.\n`);
    return;
  }
  const files = fs.readdirSync(DOC_DIR).filter(name => name.toLowerCase().endsWith('.pdf'));
  if (!files.length) {
    process.stdout.write(`No PDFs in ${DOC_DIR}; nothing to measure.\n`);
    return;
  }

  const rows = [];
  for (const file of files) {
    const buffer = fs.readFileSync(path.join(DOC_DIR, file));
    let text;
    try {
      const parsed = await pdfParse(buffer);
      // Same trimming the app applies before handing text to the pipeline.
      text = (parsed.text || '').trim().slice(0, 120000);
    } catch (error) {
      rows.push({ file, error: error.message });
      continue;
    }

    const startedAt = process.hrtime.bigint();
    const fast = preprocessLessonSource(text, { mode: 'fast' });
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    const excerpt = fast.text;
    const droppedByKeepPatterns = KEEP_PATTERNS
      .map(p => ({ id: p.id, before: countMatches(text, p.re), after: countMatches(excerpt, p.re) }))
      .filter(p => p.before > 0);

    rows.push({
      file,
      raw: text.length,
      rawLines: lines(text),
      clean: fast.metrics.cleanedChars,
      fast: fast.metrics.excerptChars,
      deep: preprocessLessonSource(text, { mode: 'deep' }).metrics.excerptChars,
      truncated: fast.metrics.truncated,
      removedLines: fast.metrics.removedRepeatedLines,
      rankingSavingsChars: fast.metrics.rankingSavingsChars,
      elapsedMs,
      keep: droppedByKeepPatterns,
      stats: fast.metrics
    });
  }

  const header = ['document', 'raw', 'clean', 'fast', 'deep', 'cut?', 'rmLines', 'L3save', 'ms', 'tokRaw', 'tokFast'];
  process.stdout.write(`${header.map(h => h.padEnd(9)).join('')}\n`);
  for (const row of rows) {
    if (row.error) {
      process.stdout.write(`${row.file.padEnd(9)} ERROR ${row.error}\n`);
      continue;
    }
    process.stdout.write([
      row.file.slice(0, 8).padEnd(9),
      String(row.raw).padEnd(9),
      String(row.clean).padEnd(9),
      String(row.fast).padEnd(9),
      String(row.deep).padEnd(9),
      String(row.truncated).padEnd(9),
      String(row.removedLines).padEnd(9),
      String(row.rankingSavingsChars).padEnd(9),
      row.elapsedMs.toFixed(2).padEnd(9),
      String(tokens(row.raw)).padEnd(9),
      String(tokens(row.fast)).padEnd(9)
    ].join(''));
    process.stdout.write('\n');
  }

  process.stdout.write('\nContent retention (regex matches in raw vs fast excerpt):\n');
  for (const row of rows) {
    if (row.error) continue;
    const parts = row.keep.map(p => `${p.id} ${p.before}->${p.after}${p.after < p.before ? ' LOST' : ''}`);
    process.stdout.write(`- ${row.file}: ${parts.length ? parts.join(', ') : '(no marker found in raw text)'}\n`);
  }

  process.stdout.write(`\nBudget fast=${preprocessBudgetForMode('fast')} deep=${preprocessBudgetForMode('deep')} chars\n`);
  const totalRaw = rows.reduce((sum, r) => sum + (r.raw || 0), 0);
  const totalFast = rows.reduce((sum, r) => sum + (r.fast || 0), 0);
  process.stdout.write(`TOTAL chars: raw=${totalRaw} fast=${totalFast} (${totalFast >= totalRaw ? '+' : ''}${totalRaw ? (((totalFast - totalRaw) / totalRaw) * 100).toFixed(1) : 0}%)\n`);
  process.stdout.write(`TOTAL estimated tokens: raw=${tokens(totalRaw)} fast=${tokens(totalFast)}\n`);
}

main().catch(error => {
  process.stdout.write(`bench-preprocess-real failed: ${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
