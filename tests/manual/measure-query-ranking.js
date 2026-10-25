/**
 * #58: does supervising the excerpt with a real query help?
 *
 * Runs the preprocessor in three configurations on every PDF in tests/tailieu:
 *   head+tail   (what `lesson:analyze` still does — no query exists there)
 *   ranked      (unsupervised L3, measured behind the O6 gate)
 *   ranked-query(the query path: topic + objectives + key concepts of an
 *                analysis, or the retrieval query of one item)
 *
 * The query is synthetic and built here, never a model call: for each lesson it
 * picks the two longest sentences of the *middle* of the document (the part
 * head+tail drops) as "what the teacher asked for". That is the friendliest
 * possible case for the query path, so read the numbers as an upper bound, not
 * as a product claim.
 *
 * Run: npm run build && node tests/manual/measure-query-ranking.js
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

/** A synthetic "teacher query": long sentences from the middle third. */
function middleSentences(cleaned) {
  const middle = cleaned.slice(Math.floor(cleaned.length / 3), Math.floor((cleaned.length * 2) / 3));
  return (middle.match(/[^\n]{40,200}[.]/g) || [])
    .sort((left, right) => right.length - left.length)
    .slice(0, 2);
}

/** How many of the query sentences survive verbatim in the excerpt. */
function countKeptSentences(excerpt, sentences) {
  return sentences.filter(sentence => Boolean(sentence) && excerpt.includes(sentence.trim())).length;
}

async function main() {
  const rows = [];
  for (const file of fs.readdirSync(path.join(__dirname, '..', 'tailieu')).filter(f => f.toLowerCase().endsWith('.pdf'))) {
    const raw = (await pdfParse(fs.readFileSync(path.join(__dirname, '..', 'tailieu', file)))).text.trim();
    const cleaned = cleanLessonSource(raw).text;
    const grams = wordBigrams(cleaned);
    const contentRaw = contentChars(cleaned);
    const sentenceList = middleSentences(cleaned);
    const query = sentenceList.join(' ');
    const budget = preprocessBudgetForMode('fast');
    const headTail = preprocessLessonSource(raw, { maxChars: budget });
    const ranked = preprocessLessonSource(raw, { maxChars: budget, ranking: true });
    const byQuery = preprocessLessonSource(raw, { maxChars: budget, query });
    rows.push({
      file,
      cleaned: cleaned.length,
      sentences: sentenceList.length,
      reasonQuery: byQuery.metrics.excerptReason,
      headTailKeeps: countKeptSentences(headTail.text, sentenceList),
      rankedKeeps: countKeptSentences(ranked.text, sentenceList),
      queryKeeps: countKeptSentences(byQuery.text, sentenceList),
      headTailRecall: recall(grams, wordBigrams(headTail.text)),
      rankedRecall: recall(grams, wordBigrams(ranked.text)),
      queryRecall: recall(grams, wordBigrams(byQuery.text)),
      headTailContent: contentChars(headTail.text) / contentRaw,
      rankedContent: contentChars(ranked.text) / contentRaw,
      queryContent: contentChars(byQuery.text) / contentRaw
    });
  }

  const pad = (value, width) => String(value).padEnd(width);
  process.stdout.write(
    pad('file', 18) + pad('chars', 8) + pad('reason', 14) + pad('recall H/T', 12) + pad('recall ranked', 15) +
    pad('recall query', 14) + pad('content H/T', 13) + pad('content query', 15) + 'query sentences kept H/T|ranked|query\n'
  );
  for (const r of rows) {
    process.stdout.write(
      pad(r.file.slice(0, 16), 18) + pad(r.cleaned, 8) + pad(r.reasonQuery, 14) +
      pad(`${(r.headTailRecall * 100).toFixed(0)}%`, 12) + pad(`${(r.rankedRecall * 100).toFixed(0)}%`, 15) +
      pad(`${(r.queryRecall * 100).toFixed(0)}%`, 14) + pad(`${(r.headTailContent * 100).toFixed(0)}%`, 13) +
      pad(`${(r.queryContent * 100).toFixed(0)}%`, 15) +
      `${r.headTailKeeps}/${r.sentences}|${r.rankedKeeps}/${r.sentences}|${r.queryKeeps}/${r.sentences}\n`
    );
  }
  process.stdout.write(
    '\nQuery = the 2 longest sentences from the middle third of each cleaned document (synthetic, optimistic).\n' +
    'Budget = fast mode (' + preprocessBudgetForMode('fast') + ') chars. Bigram recall is measured against the cleaned document.\n' +
    '"query sentences kept" counts how many of those 2 sentences survive verbatim — a shared word is not grounding.\n'
  );
}

main().catch(error => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
