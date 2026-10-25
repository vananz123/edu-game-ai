/**
 * What does the excerpt step actually remove from real teacher documents?
 *
 * For every PDF in tests/tailieu, prints how many *content* characters
 * (letters/digits) survive, and the share of word bigrams of the cleaned
 * document that appear in the excerpt. Bigram recall is the honest question:
 * "could the model still produce an item that cites the lesson?" — a plan whose
 * questions sit in the dropped middle loses them even if the char count looks
 * fine.
 *
 * Run: npm run build && node tests/manual/measure-retention.js
 * Synthetic + real counting only; nothing is sent to a model.
 */
const fs = require('node:fs');
const path = require('node:path');
const pdfParse = require('pdf-parse');
const {
  cleanLessonSource,
  preprocessLessonSource,
  preprocessBudgetForMode
} = require(path.join(__dirname, '..', '..', 'dist', 'src', 'services', 'lesson-preprocess.js'));

const contentChars = text => (text.match(/[\p{L}\p{N}]/gu) || []).length;

function wordBigrams(text) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const grams = new Set();
  for (let i = 0; i + 1 < words.length; i += 1) grams.add(`${words[i]} ${words[i + 1]}`);
  return grams;
}

function recall(reference, candidate) {
  if (!reference.size) return 1;
  let hit = 0;
  for (const gram of reference) if (candidate.has(gram)) hit += 1;
  return hit / reference.size;
}

async function main() {
  const rows = [];
  for (const file of fs.readdirSync(path.join(__dirname, '..', 'tailieu')).filter(f => f.toLowerCase().endsWith('.pdf'))) {
    const raw = (await pdfParse(fs.readFileSync(path.join(__dirname, '..', 'tailieu', file)))).text.trim();
    const cleaned = cleanLessonSource(raw).text;
    const fast = preprocessLessonSource(raw, { maxChars: preprocessBudgetForMode('fast') });
    const deep = preprocessLessonSource(raw, { maxChars: preprocessBudgetForMode('deep') });
    const grams = wordBigrams(cleaned);
    const contentRaw = contentChars(cleaned);
    rows.push({
      file,
      raw: raw.length,
      fast: fast.text.length,
      deep: deep.text.length,
      fastRecall: recall(grams, wordBigrams(fast.text)),
      deepRecall: recall(grams, wordBigrams(deep.text)),
      fastContent: contentChars(fast.text) / contentRaw,
      deepContent: contentChars(deep.text) / contentRaw
    });
  }

  const pad = (value, width) => String(value).padEnd(width);
  process.stdout.write(
    pad('file', 18) + pad('raw', 8) + pad('fast', 8) + pad('deep', 8) +
    pad('recall fast', 13) + pad('recall deep', 13) + pad('content fast', 14) + 'content deep\n'
  );
  for (const r of rows) {
    process.stdout.write(
      pad(r.file.slice(0, 16), 18) + pad(r.raw, 8) + pad(r.fast, 8) + pad(r.deep, 8) +
      pad(`${(r.fastRecall * 100).toFixed(0)}%`, 13) + pad(`${(r.deepRecall * 100).toFixed(0)}%`, 13) +
      pad(`${(r.fastContent * 100).toFixed(0)}%`, 14) + `${(r.deepContent * 100).toFixed(0)}%\n`
    );
  }
}

main().catch(error => {
  process.stdout.write(`measure-retention failed: ${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
