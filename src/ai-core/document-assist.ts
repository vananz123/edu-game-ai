const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for', 'from', 'in', 'is',
  'it', 'of', 'on', 'or', 'the', 'this', 'to', 'with', 'cay', 'trong', 'tu',
  'va', 'co', 'cac', 'nhung', 'mot', 'cua', 'cho', 'duoc', 'can', 'phan', 'nao',
  'gi', 'sao', 'vi', 'thi', 'de', 've', 'em', 'tao', 'doi', 'bo', 'cau', 'hoi',
  'khac', 'moi', 'them', 'hay'
]);

export const LOCAL_DOCUMENT_ANALYSIS_MAX_CHARS = 12_000;

export function isQuestionSetRequest(question: string): boolean {
  const normalized = normalizeText(question);
  return /\b(tao|soan|viet|doi|thay|lam|cho)\b.{0,45}\b(bo|danh sach|cau hoi)\b/.test(normalized) ||
    /\b(bo|danh sach)\b.{0,35}\b(cau hoi)\b.{0,30}\b(khac|moi|tiep|nua)\b/.test(normalized) ||
    /\b(cau hoi)\b.{0,30}\b(khac|moi|tiep|nua)\b/.test(normalized);
}

export function getLocalDocumentAnalysisExcerpt(text: string): string {
  if (text.length <= LOCAL_DOCUMENT_ANALYSIS_MAX_CHARS) return text;
  const marker = '\n\n[Đã lược bớt phần giữa của tài liệu để AI local xử lý nhanh hơn.]\n\n';
  const startLength = 8_000;
  const endLength = LOCAL_DOCUMENT_ANALYSIS_MAX_CHARS - startLength - marker.length;
  return `${text.slice(0, startLength)}${marker}${text.slice(-endLength)}`;
}

export function selectRelevantEvidence(
  text: string,
  question: string,
  maximumQuotes = 4
): string[] {
  const sentences = text.match(/[^.!?。！？\n]+[.!?。！？]?/g)
    ?.map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 0) ?? [];
  const questionTerms = new Set(getTerms(question));
  if (sentences.length === 0 || questionTerms.size === 0) {
    return sentences.slice(0, maximumQuotes).map(sentence => sentence.slice(0, 500));
  }

  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: getTerms(sentence).reduce((total, term) =>
        total + (questionTerms.has(term) ? Math.min(term.length, 8) : 0), 0)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const bestScore = ranked[0]?.score ?? 0;
  if (bestScore === 0) return [];
  return ranked
    .filter(candidate => candidate.score >= Math.max(2, Math.ceil(bestScore / 2)))
    .slice(0, maximumQuotes)
    .map(({ sentence }) => sentence.slice(0, 500));
}

export function isAnswerSupportedByEvidence(answer: string, evidence: readonly string[]): boolean {
  if (evidence.length === 0) return false;
  const terms = getTerms(answer);
  const normalizedAnswer = normalizeText(answer);
  const exactMatch = evidence.some(quote => {
    const normalizedQuote = normalizeText(quote);
    return normalizedAnswer.length > 0 && normalizedQuote.includes(normalizedAnswer);
  });
  if (exactMatch) return true;
  const evidenceTerms = new Set(evidence.flatMap(getTerms));
  const matchingTerms = new Set(terms.filter(term => evidenceTerms.has(term)));
  const requiredMatches = terms.length <= 2 ? terms.length : Math.max(2, Math.ceil(terms.length * 0.7));
  return terms.length > 0 && matchingTerms.size >= requiredMatches;
}

function getTerms(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .map(term => term.length > 4 && term.endsWith('s') ? term.slice(0, -1) : term)
    .filter(term => term.length > 1 && !STOP_WORDS.has(term));
}

function normalizeText(value: string): string {
  return value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function deduplicateQuestions(candidates: readonly string[], previous: readonly string[]): string[] {
  const normalizedPrevious = previous.map((item) => normalizeText(item));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const text = String(candidate || '').trim().slice(0, 500);
    if (text.length < 10 || !text.trim().endsWith('?')) continue;
    const key = normalizeText(text);
    if (!key || seen.has(key)) continue;
    const isDuplicate = normalizedPrevious.some((prevKey) => {
      if (!prevKey || !key) return false;
      if (prevKey === key) return true;
      const prevTerms = new Set(prevKey.split(' ').filter((term) => term.length > 2));
      const keyTerms = new Set(key.split(' ').filter((term) => term.length > 2));
      if (prevTerms.size === 0 || keyTerms.size === 0) return false;
      let overlap = 0;
      for (const term of keyTerms) if (prevTerms.has(term)) overlap += 1;
      const similarity = overlap / Math.max(prevTerms.size, keyTerms.size);
      return similarity >= 0.65;
    });
    if (isDuplicate) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}
