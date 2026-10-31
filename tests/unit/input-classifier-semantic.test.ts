// @ts-nocheck -- unit tests share one global script scope (moduleDetection: legacy), as the other suites do.
// update_quy_trinh_2 §2/§6/§8: the MiniLM confirmation layer.
//
// These tests pin the *flip policy*, not the model. Embeddings are synthetic vectors,
// so the suite runs without a runtime, a model file, or Electron. The point is that
// the model can only confirm a low-confidence rule verdict, never override a
// confident one, and never flip on noise.
const assert = require('node:assert/strict');
const {
  confirmWithSemantics,
  cosineSimilarity,
  preferredCategory,
  similarityToAnchors,
  CLASSIFIER_ANCHORS,
  SEMANTIC_FLIP_MARGIN,
  SEMANTIC_OVERRIDE_MAX_RULE_CONFIDENCE
} = require('../../src/services/input-classifier-semantic');

let passed = 0;
function it(name, fn) {
  fn();
  passed += 1;
  console.log(`ok   ${name}`);
}

function rule(kind, confidence) {
  return { kind, confidence, reasons: ['từ quy tắc'], questionLineRatio: 0, questionCount: 0, lessonMarkerCount: 0 };
}

function sim(lesson, questions, outline) {
  return { lesson, questions, outline };
}

it('anchors cover all three categories', () => {
  for (const kind of ['lesson', 'questions', 'outline']) {
    assert.ok(Array.isArray(CLASSIFIER_ANCHORS[kind]) && CLASSIFIER_ANCHORS[kind].length >= 3, kind);
    CLASSIFIER_ANCHORS[kind].forEach(text => assert.ok(text.trim().length > 10, `${kind} anchor too short`));
  }
});

it('cosineSimilarity is 0 for degenerate input and 1 for identical vectors', () => {
  assert.equal(cosineSimilarity([], []), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  const vector = [0.3, 0.4, 0.5];
  assert.ok(Math.abs(cosineSimilarity(vector, vector) - 1) < 1e-9);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

it('similarityToAnchors reports the best anchor per category', () => {
  const anchors = { lesson: [[1, 0], [0, 1]], questions: [[1, 0]], outline: [[0.5, 0.5]] };
  const result = similarityToAnchors([1, 0], anchors);
  assert.ok(Math.abs(result.lesson - 1) < 1e-9, 'best anchor wins, not the average');
  assert.ok(Math.abs(result.questions - 1) < 1e-9);
  assert.ok(result.outline < 0.8);
});

it('a confident rule is never overridden', () => {
  // Same category model prefers, but the rule is confident -> rules win regardless.
  const result = confirmWithSemantics({
    rule: rule('lesson', SEMANTIC_OVERRIDE_MAX_RULE_CONFIDENCE),
    similarity: sim(0.1, 0.9, 0.2)
  });
  assert.equal(result.flipped, false);
  assert.equal(result.classification.kind, 'lesson');
  assert.match(result.note, /chắc chắn/);
});

it('a low-confidence rule is flipped when the model is clearly more confident elsewhere', () => {
  const result = confirmWithSemantics({
    rule: rule('lesson', 0.5),
    similarity: sim(0.30, 0.75, 0.2)   // questions is +0.45 over lesson
  });
  assert.equal(result.flipped, true);
  assert.equal(result.classification.kind, 'questions');
  assert.match(result.classification.reasons[0], /Bộ đọc hiểu/);
});

it('the model does not flip on a margin below the threshold', () => {
  const justUnder = SEMANTIC_FLIP_MARGIN - 0.01;
  const result = confirmWithSemantics({
    rule: rule('lesson', 0.5),
    similarity: sim(0.50, 0.50 + justUnder, 0.2)
  });
  assert.equal(result.flipped, false, 'anti-flicker guard');
  assert.equal(result.classification.kind, 'lesson');
  assert.match(result.note, /chưa đủ khác biệt/);
});

it('the flip happens exactly at the margin boundary', () => {
  const atMargin = confirmWithSemantics({
    rule: rule('lesson', 0.5),
    similarity: sim(0.50, 0.50 + SEMANTIC_FLIP_MARGIN, 0.2)
  });
  assert.equal(atMargin.flipped, true);
});

it('a model that agrees with the rules changes nothing', () => {
  const result = confirmWithSemantics({ rule: rule('outline', 0.6), similarity: sim(0.2, 0.1, 0.7) });
  assert.equal(result.flipped, false);
  assert.equal(result.classification.kind, 'outline');
  assert.match(result.note, /đồng ý/);
});

it('"ambiguous" resolves toward the model when the model clearly prefers another category', () => {
  // `ambiguous` behaves as "lesson with low confidence", so a model that also prefers
  // lesson simply confirms it (no flip), while a clear preference elsewhere resolves it.
  const confirms = confirmWithSemantics({ rule: rule('ambiguous', 0.4), similarity: sim(0.72, 0.34, 0.30) });
  assert.equal(confirms.flipped, false);
  assert.equal(confirms.classification.kind, 'lesson');

  const resolved = confirmWithSemantics({ rule: rule('ambiguous', 0.35), similarity: sim(0.30, 0.70, 0.30) });
  assert.equal(resolved.flipped, true);
  assert.equal(resolved.classification.kind, 'questions');

  const staysUnsure = confirmWithSemantics({ rule: rule('ambiguous', 0.4), similarity: sim(0.40, 0.41, 0.39) });
  assert.equal(staysUnsure.flipped, false, 'no clear winner means no flip');
});

it('preferredCategory picks the highest score and is stable on ties', () => {
  assert.equal(preferredCategory(sim(0.1, 0.9, 0.2)).kind, 'questions');
  // Equal scores: the first in a fixed order wins, so the result never alternates.
  assert.equal(preferredCategory(sim(0.5, 0.5, 0.5)).kind, 'lesson');
});

it('invalid similarity values are treated as zero, never NaN', () => {
  const result = confirmWithSemantics({
    rule: rule('lesson', 0.5),
    similarity: { lesson: NaN, questions: undefined, outline: null }
  });
  assert.equal(result.flipped, false);
  assert.equal(result.classification.kind, 'lesson');
});

it('the flip keeps the original rule reasons so the UI can explain both', () => {
  const result = confirmWithSemantics({ rule: rule('lesson', 0.45), similarity: sim(0.2, 0.8, 0.2) });
  assert.equal(result.flipped, true);
  assert.ok(result.classification.reasons.includes('từ quy tắc'));
});

it('confirmation is deterministic', () => {
  const input = { rule: rule('lesson', 0.55), similarity: sim(0.3, 0.7, 0.25) };
  assert.deepEqual(confirmWithSemantics(input), confirmWithSemantics(input));
});

it('confirmation never mutates the rule classification it receives', () => {
  const original = rule('lesson', 0.5);
  const snapshot = JSON.stringify(original);
  confirmWithSemantics({ rule: original, similarity: sim(0.2, 0.9, 0.2) });
  assert.equal(JSON.stringify(original), snapshot);
});

console.log(`input-classifier-semantic: ${passed} checks passed`);
