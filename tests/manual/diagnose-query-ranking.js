/**
 * #58 diagnosis: why does a query sentence disappear even when ranking is on?
 * Prints, for one real PDF, the sentence score, the block that contains it and
 * whether that block was kept / dropped by budget.
 *
 * Run: npm run build && node tests/manual/diagnose-query-ranking.js
 */
const fs = require('node:fs');
const path = require('node:path');
const pdfParse = require('pdf-parse');
const {
  cleanLessonSource,
  preprocessLessonSource,
  queryTokensForRanking,
  preprocessBudgetForMode
} = require(path.join(__dirname, '..', '..', 'dist', 'src', 'services', 'lesson-preprocess.js'));

const file = process.argv[2] || 'Tu duy tích cực.pdf';

async function main() {
  const candidate = path.join(__dirname, '..', 'tailieu', file);
  const target = fs.existsSync(candidate)
    ? candidate
    : path.join(__dirname, '..', 'tailieu', fs.readdirSync(path.join(__dirname, '..', 'tailieu')).find(f => f.endsWith('.pdf')));
  const raw = (await pdfParse(fs.readFileSync(target))).text.trim();
  const cleaned = cleanLessonSource(raw).text;
  console.log('file:', path.basename(target), 'cleaned:', cleaned.length);

  const middleStart = Math.floor(cleaned.length / 3);
  const middle = cleaned.slice(middleStart, Math.floor((cleaned.length * 2) / 3));
  const sentences = (middle.match(/[^\n]{40,200}[.]/g) || []).sort((a, b) => b.length - a.length);
  const query = sentences.slice(0, 2).join(' ');
  const longest = sentences[0] || '';
  console.log('query:', JSON.stringify(query.slice(0, 160)));
  console.log('tokens:', [...queryTokensForRanking(query)].join(', '));
  console.log('longest sentence len:', longest.length, 'offset in cleaned:', cleaned.indexOf(longest.trim()));

  const blocks = cleaned.split(/\n[ \t]*\n/);
  let cursor = 0;
  const owner = blocks.map(block => {
    const start = cleaned.indexOf(block, cursor);
    cursor = start + block.length;
    return { block, start, end: start + block.length };
  }).filter(entry => entry.start >= 0);
  const holder = owner.find(entry => entry.block.includes(longest.trim().slice(0, 40)));
  console.log('holder block len:', holder ? holder.block.length : 'NOT FOUND', 'at', holder ? holder.start : '-');
  if (holder) console.log('holder preview:', JSON.stringify(holder.block.slice(0, 200)));

  const budget = preprocessBudgetForMode('fast');
  const byQuery = preprocessLessonSource(raw, { maxChars: budget, query });
  console.log('reason:', byQuery.metrics.excerptReason, 'excerpt:', byQuery.text.length, 'marker:', byQuery.text.includes('ít trọng tâm'));
  console.log('kept verbatim:', byQuery.text.includes(longest.trim()));
  // Is the sentence cut by the anchor lines? Some PDFs break it across blocks.
  const pieces = longest.trim().split(/\n/);
  console.log('sentence line pieces:', pieces.length, 'kept pieces:', pieces.filter(p => byQuery.text.includes(p)).length);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
