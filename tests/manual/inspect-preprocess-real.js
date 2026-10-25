/**
 * Diagnostic for the real documents in tests/tailieu, not a pass/fail test.
 *
 * Prints the lines L1 removed as "repeated" and the tail of the excerpt, so a
 * human can judge whether real content was lost. Output is also written to
 * docs/_preprocess-real-report.txt (UTF-8) because the Windows console cannot
 * print Vietnamese diacritics reliably.
 *
 * Run: node tests/manual/inspect-preprocess-real.js
 */
const fs = require('node:fs');
const path = require('node:path');
const pdfParse = require('pdf-parse');
const { cleanLessonSource, preprocessLessonSource } = require(
  path.join(__dirname, '..', '..', 'dist', 'src', 'services', 'lesson-preprocess.js')
);

const DOC_DIR = path.join(__dirname, '..', 'tailieu');
const OUT = path.join(__dirname, '..', '..', 'docs', '_preprocess-real-report.txt');
const lines = [];
const say = text => lines.push(text);

function splitLines(text) {
  return text.split('\n');
}

async function main() {
  fs.writeFileSync(OUT, '', 'utf8');
  const files = fs.readdirSync(DOC_DIR).filter(name => name.toLowerCase().endsWith('.pdf'));
  for (const file of files) {
    const parsed = await pdfParse(fs.readFileSync(path.join(DOC_DIR, file)));
    const raw = (parsed.text || '').trim().slice(0, 120000);
    const cleaned = cleanLessonSource(raw);
    const result = preprocessLessonSource(raw, { mode: 'fast' });

    say('='.repeat(100));
    say(`FILE: ${file}`);
    say(`pages=${parsed.numpages} raw=${raw.length} cleaned=${cleaned.text.length} excerpt=${result.text.length}`);
    say(`removedControl=${cleaned.removedControl} removedBlankRuns=${cleaned.removedBlankRuns} removedRepeatedLines=${cleaned.removedRepeatedLines}`);

    // Which lines did L1 count as repeated boilerplate?
    const rawLines = splitLines(raw);
    const keptLines = new Set(splitLines(cleaned.text));
    const removedRaw = rawLines.filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && trimmed.length <= 80 && !keptLines.has(trimmed) && rawLines.filter(l => l.trim() === trimmed).length > 1;
    });
    say(`--- repeated/candidate lines NOT present after L1 (${removedRaw.length} raw hits, unique shown) ---`);
    const seen = new Set();
    for (const line of removedRaw) {
      const key = line.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      say(`  [${rawLines.filter(l => l.trim() === key).length}x] ${key}`);
      if (seen.size >= 40) break;
    }
    if (seen.size === 0) say('  (none)');

    // Where was the excerpt cut, and what sits immediately before/after it?
    const excerpt = result.text;
    if (result.metrics.truncated) {
      const markerMatch = excerpt.match(/\n\s*\[[^\]]*\]\s*\n/);
      say(`--- cut marker: ${markerMatch ? JSON.stringify(markerMatch[0]) : '(none found)'} ---`);
      say('--- 200 chars before the end of the head part / after start of the tail ---');
      if (markerMatch && markerMatch.index !== undefined) {
        const at = markerMatch.index;
        say(`HEAD ...${JSON.stringify(excerpt.slice(Math.max(0, at - 200), at))}`);
        say(`TAIL ${JSON.stringify(excerpt.slice(at + markerMatch[0].length, at + markerMatch[0].length + 200))}...`);
      }
    }
    say('--- last 200 chars of the excerpt ---');
    say(JSON.stringify(excerpt.slice(-200)));
    // Are headings preserved end to end? Which top-level headings survive?
    const headings = [...raw.matchAll(/^\s*(?:PHẦN|CHƯƠNG|BÀI|Phần|Chương|Bài)\s+[\dIVXLC]+[^\n]{0,80}$/gmu)].map(m => m[0].trim());
    const headingsKept = headings.filter(h => excerpt.includes(h));
    say(`--- headings: raw=${headings.length} kept=${headingsKept.length} ---`);
    for (const h of headings) say(`  ${excerpt.includes(h) ? 'KEPT  ' : 'DROPPED'} ${h}`);
  }
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  process.stdout.write(`written ${OUT} (${lines.length} lines)\n`);
}

main().catch(error => {
  process.stdout.write(`inspect failed: ${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
