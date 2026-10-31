/**
 * Semantic confirmation layer for step-2 input classification.
 *
 * update_quy_trinh_2 §2: run cheap deterministic rules first, then use the existing
 * MiniLM model *when rules cannot confidently classify*. Per the agreed design
 * (DECISIONS #113) the model always runs when available, but it only **confirms**:
 * it may flip a rule verdict, never invent one from nothing, and it must not be able
 * to flip on noise.
 *
 * This module is pure — vectors in, verdict out — so the flip policy is unit-tested
 * without a model, a runtime, or Electron. The I/O (embedding the text and the
 * anchors) lives in `main.ts`, which already owns `ensureEmbeddingRuntime()`.
 */

import type { InputClassification, InputKind } from './input-classifier';

/** Anchors per category. Short, Vietnamese, typical of each kind of material. */
export const CLASSIFIER_ANCHORS: Record<InputKind, string[]> = {
  lesson: [
    'Mục tiêu: sau bài học học sinh trình bày được khái niệm và phân tích được ví dụ.',
    'Kiến thức trọng tâm: học sinh hiểu và giải thích được nội dung bài học.',
    'Hoạt động dạy học: giáo viên tổ chức thảo luận nhóm và học sinh trình bày kết quả.',
    'Củng cố và dặn dò: học sinh tóm tắt nội dung chính của bài.'
  ],
  questions: [
    'Câu 1: Thủ đô của Việt Nam là gì? A. Hà Nội B. Huế C. Đà Nẵng Đáp án: A',
    'Câu 2: Hành tinh nào gần Mặt Trời nhất? A. Sao Kim B. Trái Đất C. Sao Thủy Đáp án: C',
    'Câu hỏi trắc nghiệm có bốn phương án và một đáp án đúng.',
    'Đáp án: B. Giải thích: vì đây là phương án đúng nhất.'
  ],
  outline: [
    'I. Mục tiêu II. Kiến thức trọng tâm III. Hoạt động dạy học IV. Củng cố',
    'Dàn ý bài học gồm các mục: mục tiêu, nội dung, hoạt động, củng cố.',
    'Khung sườn bài giảng: hoạt động 1, hoạt động 2, hoạt động 3, tổng kết.',
    'Đề cương bài học ngắn gọn, mới có tiêu đề các phần.'
  ]
};

/** A similarity per category, in 0..1 (cosine). */
export interface CategorySimilarity {
  lesson: number;
  questions: number;
  outline: number;
}

export interface SemanticInput {
  /** What the rules concluded, including its confidence. */
  rule: InputClassification;
  similarity: CategorySimilarity;
}

export interface SemanticVerdict {
  /** Final classification after confirmation. */
  classification: InputClassification;
  /** True when the model overrode the rules. */
  flipped: boolean;
  /** Short Vietnamese reason, shown under the verdict. */
  note: string;
}

/**
 * How much better a competing category must score before it may override the rules.
 *
 * 0.08 cosine is deliberately conservative: embeddings of two lesson-ish texts sit
 * within a few hundredths of each other, so a smaller margin would let sampling noise
 * flip a correct rule verdict. Unit-tested at the boundary.
 */
export const SEMANTIC_FLIP_MARGIN = 0.08;

/** Rules at or above this confidence are trusted as-is; the model cannot override. */
export const SEMANTIC_OVERRIDE_MAX_RULE_CONFIDENCE = 0.8;

/** Cosine similarity of two same-length vectors; 0 for a degenerate vector. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    const left = Number(a[index]);
    const right = Number(b[index]);
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Best score per category: the highest similarity to any anchor of that category. */
export function similarityToAnchors(textVector: number[], anchors: Record<InputKind, number[][]>): CategorySimilarity {
  const best = (vectors: number[][]) => vectors.reduce((max, vector) => Math.max(max, cosineSimilarity(textVector, vector)), 0);
  return {
    lesson: best(anchors.lesson || []),
    questions: best(anchors.questions || []),
    outline: best(anchors.outline || [])
  };
}

/** The category the model favours, ignoring confidence ties. */
export function preferredCategory(similarity: CategorySimilarity): { kind: InputKind; score: number } {
  const entries: Array<{ kind: InputKind; score: number }> = [
    { kind: 'lesson', score: Number(similarity.lesson) || 0 },
    { kind: 'questions', score: Number(similarity.questions) || 0 },
    { kind: 'outline', score: Number(similarity.outline) || 0 }
  ];
  return entries.reduce((best, entry) => (entry.score > best.score ? entry : best), entries[0]);
}

/** Margin below which differences are float noise rather than evidence. */
const MARGIN_EPSILON = 1e-9;

/**
 * Confirm (or refuse to change) the rule verdict.
 *
 * Rules win unless **all** of these hold:
 *   1. the rules were not confident (`confidence < SEMANTIC_OVERRIDE_MAX_RULE_CONFIDENCE`),
 *   2. the model prefers a different category,
 *   3. that preference is at least `SEMANTIC_FLIP_MARGIN` above the current one.
 *
 * `ambiguous` is treated like a low-confidence rule verdict, so the model helps
 * exactly where it is most useful and never fights a confident rule.
 */
export function confirmWithSemantics(input: SemanticInput): SemanticVerdict {
  const { rule, similarity } = input;
  const current = rule.kind === 'ambiguous' ? 'lesson' : rule.kind;
  const currentScore = Number(similarity[current]) || 0;
  const best = preferredCategory(similarity);
  // An `ambiguous` rule is resolved to the category it is treated as (`lesson`), so
  // callers never have to re-apply `resolveInputKind()` to the confirmed result.
  const settled = (verdict: InputClassification): InputClassification =>
    verdict.kind === 'ambiguous' ? { ...verdict, kind: 'lesson' } : verdict;

  if (rule.confidence >= SEMANTIC_OVERRIDE_MAX_RULE_CONFIDENCE) {
    return { classification: settled(rule), flipped: false, note: 'Quy tắc đã đủ chắc chắn.' };
  }
  if (best.kind === current) {
    return { classification: settled(rule), flipped: false, note: 'Bộ đọc hiểu đồng ý với quy tắc.' };
  }
  const margin = best.score - currentScore;
  // `margin < SEMANTIC_FLIP_MARGIN` on exact-boundary input is decided by float
  // noise (0.5 + 0.08 - 0.5 is not exactly 0.08), so the boundary is inclusive.
  if (margin < SEMANTIC_FLIP_MARGIN - MARGIN_EPSILON) {
    // Too close to call: keep the rules. This is the anti-flicker guard.
    return { classification: settled(rule), flipped: false, note: 'Bộ đọc hiểu chưa đủ khác biệt — giữ kết quả quy tắc.' };
  }
  const reasons = [`Bộ đọc hiểu nghiêng về “${best.kind}” (chênh ${margin.toFixed(2)}).`, ...rule.reasons];
  return {
    classification: { ...rule, kind: best.kind, confidence: Math.min(0.85, rule.confidence + 0.1), reasons },
    flipped: true,
    note: `Bộ đọc hiểu xác nhận lại thành “${best.kind}”.`
  };
}
