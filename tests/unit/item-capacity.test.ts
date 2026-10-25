import assert from 'node:assert/strict';
import {
  AUTO_ITEM_MAX,
  AUTO_ITEM_MIN,
  capacityModelProfile,
  estimateItemCapacity
} from '../../src/services/item-capacity';

// --- model tiers ----------------------------------------------------------

assert.equal(capacityModelProfile('qwen3.5-2b-q4_k_m').maxItems, 5);
assert.equal(capacityModelProfile('qwen3.5-4b-q4_k_m').maxItems, 6);
// The Qwen2.5 7B tier was removed on 2026-10-25 with its catalog entry, so an
// old settings file naming it must not still unlock a 7-item cap.
assert.equal(capacityModelProfile('qwen2.5-7b-q4_k_m').maxItems, 5);
assert.equal(capacityModelProfile('').maxItems, 5, 'unknown model keeps the conservative 2B cap');
assert.equal(capacityModelProfile('custom-model').tier, 0);
assert.equal(capacityModelProfile('qwen2.5-14b-q4_k_m').tier, 0, '14B must not match the 4B tier');
assert.equal(capacityModelProfile('gemma-4-e2b-it-q4_k_m').tier, 4, 'Gemma must not be scored as a Qwen 2B');
assert.equal(capacityModelProfile('gemma-4-e2b-it-q4_k_m').maxItems, 5);
assert.equal(capacityModelProfile('gemma-3-27b-it').tier, 4, 'any Gemma id lands on the Gemma profile');
// Quantization must not change the tier: the catalog moved from Q4_0 to Q4_K_M
// and `2b`/`4b` are still the tokens the tier table matches on.
assert.equal(capacityModelProfile('qwen3.5-2b-q4_k_m').tier, 2);
assert.equal(capacityModelProfile('qwen3.5-4b-q4_k_m').tier, 4);

// --- document + analysis + model -----------------------------------------

const balanced = estimateItemCapacity({
  gameType: 'arena',
  documentCharacters: 3200,
  objectiveCount: 3,
  conceptCount: 2,
  modelId: 'qwen3.5-2b-q4_k_m',
  mode: 'fast'
});
assert.equal(balanced.material.byText, 5);
assert.equal(balanced.material.byIdeas, 5);
assert.equal(balanced.ceiling, 5);
assert.equal(balanced.suggested, 5);
assert.equal(balanced.repetitionRisk, false);

const thin = estimateItemCapacity({
  gameType: 'arena',
  documentCharacters: 1200,
  objectiveCount: 1,
  conceptCount: 1,
  modelId: 'qwen3.5-2b-q4_k_m',
  mode: 'fast'
});
assert.equal(thin.material.byText, 2);
assert.equal(thin.material.byIdeas, 2);
assert.equal(thin.suggested, AUTO_ITEM_MIN, 'thin lessons clamp to the automatic floor');
assert.equal(thin.material.contentCapacity, AUTO_ITEM_MIN);
assert.equal(thin.repetitionRisk, true);

const rich = estimateItemCapacity({
  gameType: 'arena',
  documentCharacters: 8000,
  objectiveCount: 4,
  conceptCount: 5,
  modelId: 'qwen3.5-4b-q4_k_m',
  mode: 'fast'
});
assert.equal(rich.material.usableCharacters, 4500, 'fast retrieval cap');
assert.equal(rich.material.byText, 7);
assert.equal(rich.ceiling, 6, '4B is now the strongest catalog tier and caps at 6 items');
assert.equal(rich.suggested, 6);

// 4B + Thinking is allowed one extra item on top of its cap. The Qwen2.5 7B
// model that used to fill this case was removed from the catalog, so the hard
// 7-item ceiling is reached by 4B in Thinking mode instead.
const richDeep = estimateItemCapacity({
  gameType: 'arena',
  documentCharacters: 8000,
  objectiveCount: 4,
  conceptCount: 5,
  modelId: 'qwen3.5-4b-q4_k_m',
  mode: 'deep'
});
assert.equal(richDeep.material.usableCharacters, 6000, 'deep retrieval cap');
assert.equal(richDeep.material.byText, 10);
assert.equal(richDeep.ceiling, AUTO_ITEM_MAX, '4B + Thinking reaches, but never exceeds, the hard cap');

const smallModel = estimateItemCapacity({
  gameType: 'arena',
  documentCharacters: 5000,
  objectiveCount: 4,
  conceptCount: 5,
  modelId: 'qwen3.5-2b-q4_k_m',
  mode: 'fast'
});
assert.equal(smallModel.material.byText, 7);
assert.equal(smallModel.ceiling, 5, '2B model cap');
assert.equal(smallModel.suggested, 5);

const deepBonus = estimateItemCapacity({
  gameType: 'arena',
  documentCharacters: 6000,
  objectiveCount: 5,
  conceptCount: 10,
  modelId: 'qwen3.5-2b-q4_k_m',
  mode: 'deep'
});
assert.equal(deepBonus.ceiling, 6, 'Thinking adds one item to the 2B cap');
assert.equal(deepBonus.suggested, 6);

const matching = estimateItemCapacity({
  gameType: 'matching',
  documentCharacters: 5000,
  objectiveCount: 3,
  conceptCount: 2,
  modelId: 'qwen3.5-4b-q4_k_m',
  mode: 'fast'
});
assert.equal(matching.material.byIdeas, 2, 'one pair per real concept');
assert.equal(matching.suggested, AUTO_ITEM_MIN);
assert.equal(matching.repetitionRisk, true);

const treasure = estimateItemCapacity({
  gameType: 'treasure',
  documentCharacters: 4000,
  objectiveCount: 2,
  conceptCount: 3,
  modelId: 'qwen3.5-4b-q4_k_m',
  mode: 'fast'
});
assert.equal(treasure.material.byIdeas, 4);
assert.equal(treasure.suggested, 4);

// Long lesson, lots of concepts, unknown model: the conservative cap wins.
const unknownModel = estimateItemCapacity({
  gameType: 'arena',
  documentCharacters: 6000,
  objectiveCount: 10,
  conceptCount: 50
});
assert.equal(unknownModel.model.tier, 0);
assert.equal(unknownModel.suggested, 5);

// Without a readable document length the analysis still drives the suggestion
// (the recommender is also used with analyses that have no lesson row).
const noDocument = estimateItemCapacity({
  gameType: 'arena',
  objectiveCount: 3,
  conceptCount: 4,
  modelId: 'qwen3.5-2b-q4_k_m'
});
assert.equal(noDocument.material.byText, null);
assert.equal(noDocument.material.byIdeas, 8);
assert.equal(noDocument.suggested, 5);

// --- invariants -----------------------------------------------------------

const cases = [
  { gameType: 'arena' as const, documentCharacters: 0, objectiveCount: 0, conceptCount: 0 },
  { gameType: 'scenario' as const, documentCharacters: 300, objectiveCount: 1, conceptCount: 1 },
  { gameType: 'matching' as const, documentCharacters: 9000, objectiveCount: 9, conceptCount: 9 },
  { gameType: 'treasure' as const, documentCharacters: 2500, objectiveCount: 2, conceptCount: 2 },
  { gameType: 'race' as const, documentCharacters: 4500, objectiveCount: 3, conceptCount: 3 }
];
for (const input of cases) {
  for (const modelId of ['', 'qwen3.5-2b-q4_k_m', 'qwen3.5-4b-q4_k_m', 'gemma-4-e2b-it-q4_k_m', 'qwen2.5-7b-q4_k_m']) {
    for (const mode of ['fast', 'deep'] as const) {
      const estimate = estimateItemCapacity({ ...input, modelId, mode });
      assert.ok(estimate.suggested >= AUTO_ITEM_MIN && estimate.suggested <= AUTO_ITEM_MAX, 'suggested stays in 4..7');
      assert.ok(estimate.ceiling >= AUTO_ITEM_MIN && estimate.ceiling <= AUTO_ITEM_MAX, 'ceiling stays in 4..7');
      assert.ok(estimate.material.contentCapacity >= AUTO_ITEM_MIN);
      assert.ok(Array.isArray(estimate.reasons) && estimate.reasons.length >= 2);
    }
  }
}

console.log('item-capacity.test.ts: OK');
