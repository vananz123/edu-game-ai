/**
 * Answers "what does L2 actually remove?" for the real documents in
 * tests/tailieu: the dropped middle is printed (and its length), so a human can
 * judge whether that middle carried content the analysis step needs.
 *
 * Run: node tests/manual/inspect-preprocess-real.js (report) or this file.
 */
const fs = require('node:fs');
const path = require('node:path');
const pdfParse = require('pdf-parse');
const { preprocessLessonSource } = require(
  path.join(__dirname, '..', '..', 'dist', 'src', 'services', 'lesson-preprocess.js')
);

const DOC_DIR = path.join(__dirname, '..', 'tailieu');
const OUT = path.join(__dirname, '..', '..', 'docs', '_preprocess-real-report.txt');
const out = [];
const say = text => out.push(text);

async function main() {
  for (const file of fs.readdirSync(DOC_DIR).filter(f => f.toLowerCase().endsWith('.pdf'))) {
    const raw = (await pdfParse(fs.readFileSync(path.join(DOC_DIR, file)))).text.trim();
    const result = preprocessLessonSource(raw, { mode: 'fast' });
    const excerpt = result.text;
    const marker = '\n\n[Đã lược bớt phần giữa của tài liệu để AI local xử lý nhanh hơn.]\n\n';
    const at = excerpt.indexOf(marker.trim());
    const head = at > 0 ? excerpt.slice(0, at) : excerpt;
    const tail = at > 0 ? excerpt.slice(excerpt.indexOf(marker.trim()) + marker.trim().length) : '';
    say('='.repeat(100));
    say(`FILE ${file}  raw=${raw.length} clean=${result.metrics.cleanedChars} excerpt=${excerpt.length}`);
    if (at < 0) {
      say('not truncated');
      continue;
    }
    // Rebuild the dropped middle: it is raw[headEnd .. raw.length - tail.length]
    const headText = head.trimEnd();
    const tailText = tail.trimStart();
    const headEnd = raw.indexOf(headText.slice(0, 200));
    const tailStart = raw.lastIndexOf(tailText.slice(-200));
    const dropped = raw.slice(headEnd + headText.length, tailStart);
    say(`head=${head.length} tail=${tail.length} droppedMiddle=${dropped.length} chars (${Math.round((dropped.length / raw.length) * 100)}% of raw)`);
    say(`--- dropped middle, first 1200 chars ---`);
    say(dropped.slice(0, 1200));
    say(`--- dropped middle, last 600 chars ---`);
    say(dropped.slice(-600));
  }
  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  process.stdout.write(`written ${OUT}\n`);
}

main().catch(error => {
  process.stdout.write(`inspect failed: ${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
