/**
 * Text normalisation shared by the classifier, the question parser and the
 * compatibility scorer (DECISIONS #115).
 *
 * Both readers used to carry their own decoder. They agreed on HTML entities but
 * disagreed on everything else: the parser trimmed each line while the classifier
 * kept it, so a bank with indented options could be "questions" to one and
 * unparseable to the other. One implementation means the two cannot drift again.
 *
 * Pure: no I/O, no clock, no Electron.
 */
import { ANSWER_LINE, OPTION_LINE, QUESTION_BLOCK_START, QUESTION_START } from './input-classifier';

/**
 * Named entities teachers' copy-paste produces. Keys are the exact entity names;
 * lookup is case-insensitive first, then exact (HTML has both `&Aacute;` and
 * `&aacute;` with different letters). Numeric entities never need this table.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  // Word/HTML export writes Vietnamese words as `&#272;&aacute;p &aacute;n`: numeric
  // and named pieces inside the same word, so every Latin-1 letter must decode.
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ', eth: 'ð',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç',
  Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
  Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý', ETH: 'Ð',
  // Vietnamese letters Word writes by name.
  abreve: 'ă', Abreve: 'Ă', ohorn: 'ơ', Ohorn: 'Ơ', uhorn: 'ư', Uhorn: 'Ư',
  // Marks and symbols common in copied banks.
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„',
  deg: '°', sup2: '²', sup3: '³', frac12: '½', times: '×', divide: '÷', plusmn: '±',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥', cent: '¢'
};

/**
 * Decode HTML entities teachers copy out of Word, Moodle or a web page: `&#x20;`,
 * `&#272;`, `&aacute;`, `&amp;`… An unknown entity is left exactly as written, so the
 * original text is never mangled.
 */
export function decodeHtmlEntities(value: string): string {
  if (typeof value !== 'string' || value.indexOf('&') < 0) return value || '';
  return value.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (entity, token: string) => {
    if (token[0] === '#') {
      const codePoint = token[1] === 'x' || token[1] === 'X'
        ? Number.parseInt(token.slice(2), 16)
        : Number.parseInt(token.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    // Exact name first (`&Aacute;` vs `&aacute;`), then the lower-case legacy names.
    const exact = NAMED_ENTITIES[token];
    const named = exact === undefined ? NAMED_ENTITIES[token.toLowerCase()] : exact;
    return named === undefined ? entity : named;
  });
}

/**
 * One line as the parser sees it: no BOM, entities decoded, trailing whitespace off.
 *
 * Leading indentation is deliberately kept: the parser uses it to tell a wrapped
 * option (`   vẫn là phương án một`) from a new one, and trimming here made that
 * impossible. Line-ending blanks are replaced too, so a line that was only
 * whitespace becomes empty and can serve as a group separator.
 */
export function normalizeQuestionLine(line: string): string {
  // Decode until stable: a Word export writes `&#272;&aacute;p &aacute;n`, and one
  // pass turns the first entity into `Đ` while leaving the named ones behind.
  let current = String(line || '').replace(/^\uFEFF/, '');
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decodeHtmlEntities(current);
    if (next === current) break;
    current = next;
  }
  return current
    .replace(/[\t\u00a0]/g, ' ')
    .replace(/[ ]+$/, '');
}

/** Every line of the teacher's text, normalised, blank lines dropped. */
export function normalizeQuestionLines(text: string): string[] {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(normalizeQuestionLine)
    .filter(line => line.trim().length > 0);
}

/**
 * Symbol classes stripped at the *edges* of a question-bank line (#116).
 *
 * Deliberately a Unicode class, never a list of emoji: teacher banks copied from
 * slides, chat or a web page carry `👉 ✅ 📌 ⭐ ▶ ➜ ※` in front of the labels, and a
 * hand-maintained list would miss the next one. `\p{P}` is only used next to a label
 * (see `cleanQuestionLine`), never at the start of every line, because bullets and
 * dashes there are meaningful structure.
 */
const EDGE_SYMBOLS = /^[\p{S}\p{Sm}\p{Sk}\p{So}\s]+/u;
/** Symbols/punctuation allowed between the start of a label and the label text. */
const SYMBOL_PREFIX = '[\\p{S}\\s]';

/**
 * Remove decorative symbols from the beginning of a line, keeping the indentation
 * width. Indentation is a parser signal (a wrapped option is deeper than its label),
 * so `   👉 B. Hai` must stay three columns deep, not become `B. Hai` at column 0.
 */
export function stripLeadingSymbols(line: string): string {
  const text = String(line || '');
  const leading = text.match(/^[ \t\u00a0]*/u);
  const indentText = leading ? leading[0] : '';
  const rest = text.slice(indentText.length);
  const match = rest.match(EDGE_SYMBOLS);
  if (!match) return text;
  // Keep the original indent width plus one column per removed symbol character, so
  // "   👉 B. Hai" and "      👉👉 B. Hai" both stay deeper than a top-level label.
  const indent = indentText.length + leadingSymbolCount(match[0]);
  return ' '.repeat(indent) + rest.slice(match[0].length);
}

/** Number of characters in the symbol run that are not plain spaces. */
function leadingSymbolCount(run: string): number {
  return run.replace(/[ \t\u00a0]/g, '').length;
}

/** A label line whose decoration may be stripped: option, answer, explanation, reply. */
const LABELLED_LINE =
  /^[\s\p{S}\p{P}]{0,6}(?:(?<indent>\s*)(?=(?:\*\*)?\s*(?:[a-h]\s*\d{0,2}\s*[.)]\s|đ(?:áp|\s*&aacute;p|&aacute;p)\s*(?:án|&aacute;n)|dap\s*an|đ\s*\/\s*á|đa\s*[:：\-=]|giải\s*thích|giai\s*thich|lời\s*giải|loi\s*giai|trả\s*lời|answer|key|explanation)))/iu;

/**
 * One line cleaned for the question parser (#116): entities decoded, trailing
 * blanks off, decorative symbols (emoji, marks, bullet glyphs) off the start and off
 * the front of a label.
 *
 * Only the edges are touched. A symbol inside a prompt or an option
 * (\`6CO2 + 6H2O → C6H12O6\`, \`Việt Nam → châu Á\`) is content the teacher wrote, and
 * removing it would change the question.
 */
export function cleanQuestionLine(line: string): string {
  const normalized = normalizeQuestionLine(line);
  const labelled = normalized.match(LABELLED_LINE);
  // A label line starts at column 0: every leading space there is decoration or a
  // pasted indent from the slide, and both make the line invisible to the readers.
  // Drop the pasted indent and the decoration before the label, keeping the rest of
  // the line byte-for-byte (a trailing value may legitimately contain symbols).
  if (labelled) return normalized.slice(labelled[0].length).replace(/^[\s\p{S}\p{P}]+/u, '');
  return stripLeadingSymbols(normalized);
}

/**
 * True when the text carries the *shape* of a question bank, using the very patterns
 * the classifier and parser route on. Used as the gate for cleaning: an ordinary
 * lesson keeps its symbols (a "✅ Mục tiêu" heading is the teacher's formatting).
 */
export function looksLikeQuestionBankText(text: string): boolean {
  // Classify the *cleaned* lines: `&#272;&aacute;p &aacute;n:` only becomes an
  // answer marker after decoding, and the gate must not decide "not a bank" first.
  // One question (with its options and answer) is enough: a single question is still
  // the teacher's own content and must not be sent through the lesson pipeline.
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => cleanQuestionLine(line).trim())
    .filter(Boolean);
  if (lines.length < 3) return false;
  const questionLines = lines.filter(line =>
    QUESTION_START.test(line) || QUESTION_BLOCK_START.test(line) || /\?\s*(?:\*\*)?\s*$/.test(line)
  ).length;
  const optionLines = lines.filter(line => OPTION_LINE.test(line)).length;
  const answerLines = lines.filter(line => ANSWER_LINE.test(line)).length;
  // Two question-looking lines, or one question plus its options/answer, is a bank.
  return questionLines >= 2 || (questionLines >= 1 && optionLines >= 2 && answerLines + optionLines >= 3);
}

/**
 * The teacher's text as the question readers should see it: every line cleaned when
 * the text looks like a bank, untouched formatting otherwise.
 */
export function cleanQuestionText(text: string): string {
  const source = String(text || '');
  if (!looksLikeQuestionBankText(source)) return source;
  return source.split(/\r?\n/).map(cleanQuestionLine).join('\n');
}

/**
 * A prompt compared for duplicates: case, accents, punctuation and spacing
 * differences are ignored, the words are not reordered.
 */
export function normalizePromptKey(prompt: string): string {
  return decodeHtmlEntities(String(prompt || ''))
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
