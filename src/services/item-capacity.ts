import type { WorkflowGameType } from '../shared/lesson-types';

/**
 * O12 — predicts how many game items (questions / situations / pairs / stages)
 * the current lesson and model can support *with distinct content*.
 *
 * This is deliberately separate from the "AI tạo thiếu nội dung" warning:
 *   - prediction is deterministic (document length + analysis richness + model
 *     tier + fast/deep budget) and runs before generation, with no AI call;
 *   - the warning is only for a draft that really came back short.
 *
 * Asking a 2B model for 12 questions from a one-page lesson produces near
 * duplicates and wastes minutes, so automatic counts stay in 4..7 and the model
 * tier can lower the ceiling further. The teacher can still type 1..30; that
 * number is never overwritten by this module.
 */

export type GenerationMode = 'fast' | 'deep';

export interface ItemCapacityInput {
  gameType: WorkflowGameType;
  /** Full document length in characters (0/undefined when unknown). */
  documentCharacters?: number;
  objectiveCount?: number;
  conceptCount?: number;
  /** Installed model id, e.g. `qwen3.5-4b-q4_k_m`. */
  modelId?: string;
  mode?: GenerationMode;
}

export interface ModelCapacityProfile {
  id: string;
  /**
   * 7 was dropped on 2026-10-25 with the Qwen2.5 7B catalog entry; 4 is now the
   * highest tier and 6 the highest model cap.
   */
  tier: 0 | 2 | 4;
  label: string;
  /** Soft cap on distinct items before repetition becomes likely. */
  maxItems: number;
}

export interface ItemCapacityEstimate {
  suggested: number;
  /** Automatic bounds (the teacher may still choose outside them). */
  min: number;
  max: number;
  ceiling: number;
  mode: GenerationMode;
  model: ModelCapacityProfile;
  material: {
    documentCharacters: number;
    /** Characters the model actually receives for this mode (retrieval cap). */
    usableCharacters: number;
    objectiveCount: number;
    conceptCount: number;
    /** Items the text length can support (null when the document is unknown). */
    byText: number | null;
    /** Distinct ideas the analysis can support. */
    byIdeas: number;
    /** Content-only capacity, used to warn when a manual count is too high. */
    contentCapacity: number;
  };
  /** True when the lesson is too thin for even the 4-item floor. */
  repetitionRisk: boolean;
  reasons: string[];
}

export const AUTO_ITEM_MIN = 4;
export const AUTO_ITEM_MAX = 7;

/** Retrieval sends at most this many characters to the model per mode. */
const MODE_MAX_CHARACTERS: Record<GenerationMode, number> = { fast: 4500, deep: 6000 };
/** Output-token budget of `lesson:generate`, for the hard item ceiling. */
const MODE_MAX_OUTPUT_TOKENS: Record<GenerationMode, number> = { fast: 2048, deep: 4096 };
/** Rough characters of source material needed per meaningful item. */
const CHARACTERS_PER_ITEM = 600;
/** Rough output tokens per item (question + options + JSON keys) and fixed overhead. */
const TOKENS_PER_ITEM = 220;
const TOKEN_OVERHEAD = 350;

const MODEL_PROFILES: ReadonlyArray<{ pattern: RegExp; profile: ModelCapacityProfile }> = [
  // Order matters: the first match wins. Gemma must come before the bare `2b`
  // rule, otherwise `gemma-4-e2b-it-q4_k_m` would be scored as a Qwen 2B.
  {
    pattern: /gemma/i,
    profile: { id: '', tier: 4, label: 'Gemma 4 E2B (thử nghiệm)', maxItems: 5 }
  },
  { pattern: /(?:^|[^a-z0-9])2b(?:[^a-z0-9]|$)/i, profile: { id: '', tier: 2, label: '2B (Bản Nhanh)', maxItems: 5 } },
  { pattern: /(?:^|[^a-z0-9])4b(?:[^a-z0-9]|$)/i, profile: { id: '', tier: 4, label: '4B (Bản Linh hoạt)', maxItems: 6 } }
];

const UNKNOWN_MODEL: ModelCapacityProfile = { id: '', tier: 0, label: 'chưa xác định', maxItems: 5 };

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(Number(value));
  if (!Number.isFinite(rounded)) return min;
  return Math.min(max, Math.max(min, rounded));
}

export function capacityModelProfile(modelId?: string): ModelCapacityProfile {
  const raw = String(modelId || '').trim();
  const found = MODEL_PROFILES.find(entry => entry.pattern.test(raw));
  if (!found) return { ...UNKNOWN_MODEL, id: raw };
  return { ...found.profile, id: raw };
}

/**
 * How many *distinct* items an analysis can support. Matching needs one real
 * concept per pair; scenario/treasure can also turn objectives into situations.
 */
function ideaUnits(gameType: WorkflowGameType, objectives: number, concepts: number): number {
  switch (gameType) {
    case 'matching':
      return concepts;
    case 'scenario':
      return concepts + objectives;
    case 'treasure':
      return concepts + objectives * 0.5;
    default:
      return concepts * 1.5 + objectives * 0.75;
  }
}

export function estimateItemCapacity(input: ItemCapacityInput): ItemCapacityEstimate {
  const mode: GenerationMode = input.mode === 'deep' ? 'deep' : 'fast';
  const model = capacityModelProfile(input.modelId);
  const documentCharacters = Math.max(0, Math.round(Number(input.documentCharacters) || 0));
  const objectiveCount = Math.max(0, Math.round(Number(input.objectiveCount) || 0));
  const conceptCount = Math.max(0, Math.round(Number(input.conceptCount) || 0));

  // The model never sees the whole document in one pass; retrieval caps it.
  const usableCharacters = documentCharacters > 0
    ? Math.min(documentCharacters, MODE_MAX_CHARACTERS[mode])
    : 0;
  const byText = documentCharacters > 0 ? Math.floor(usableCharacters / CHARACTERS_PER_ITEM) : null;
  const byIdeas = Math.round(ideaUnits(input.gameType, objectiveCount, conceptCount));

  // When the document length is unknown (e.g. a directly-built analysis in a
  // test), fall back to the analysis richness instead of returning 4.
  const supply = byText === null ? byIdeas : Math.min(byText, byIdeas);

  const modeBonus = mode === 'deep' ? 1 : 0;
  const outputCap = Math.floor((MODE_MAX_OUTPUT_TOKENS[mode] - TOKEN_OVERHEAD) / TOKENS_PER_ITEM);
  const ceiling = clampInt(
    Math.min(AUTO_ITEM_MAX, model.maxItems + modeBonus, Math.max(AUTO_ITEM_MIN, outputCap)),
    AUTO_ITEM_MIN,
    AUTO_ITEM_MAX
  );
  const suggested = clampInt(supply, AUTO_ITEM_MIN, ceiling);
  const contentCapacity = clampInt(supply, AUTO_ITEM_MIN, 30);
  const repetitionRisk = (byText !== null && byText < AUTO_ITEM_MIN) || byIdeas < AUTO_ITEM_MIN;

  const modeLabel = mode === 'deep' ? 'Thinking (nhiều ngữ cảnh)' : 'Fast (nhanh)';
  const reasons = [
    documentCharacters > 0
      ? `Tài liệu ${documentCharacters.toLocaleString('vi-VN')} ký tự; ${modeLabel} gửi tối đa ${MODE_MAX_CHARACTERS[mode].toLocaleString('vi-VN')} ký tự liên quan.`
      : `Chưa đọc được độ dài tài liệu; ước lượng theo ${objectiveCount} mục tiêu và ${conceptCount} khái niệm.`,
    `${objectiveCount} mục tiêu + ${conceptCount} khái niệm đủ cho khoảng ${byIdeas} mục khác nhau${byIdeas < AUTO_ITEM_MIN ? ' (rất mỏng, nên bổ sung ví dụ)' : ''}.`,
    `Model ${model.label} đặt trần ${ceiling} mục${modeBonus ? ' (đã cộng 1 cho Thinking)' : ''} để tránh câu lặp.`
  ];

  return {
    suggested,
    min: AUTO_ITEM_MIN,
    max: AUTO_ITEM_MAX,
    ceiling,
    mode,
    model,
    material: {
      documentCharacters,
      usableCharacters,
      objectiveCount,
      conceptCount,
      byText,
      byIdeas,
      contentCapacity
    },
    repetitionRisk,
    reasons
  };
}
