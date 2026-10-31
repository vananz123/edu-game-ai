// @ts-nocheck -- pure, deterministic house-building progression (DECISIONS #140, revised #141/#143/#144).
// Tracks ONLY how many buildable parts of the house are standing. A correct answer
// adds one part; a wrong answer removes one part (never below the foundation, which
// is always present). `maxParts` is the target for this game: the renderer sets it
// to the question count capped at the house's eight visual parts, so any quiz
// length can finish the house by answering everything correctly (#143). This is
// deliberately separate from scoring (runtime.ts) and from rendering.
const HOUSE_PART_MIN = 1;

// House models (#144). Every style is a different block model with the SAME
// nine-stage layout (foundation + eight buildable parts), so the economy and the
// #143 target mapping never depend on which house a quiz uses. The list lives
// here, beside the pure economy, so the editor/wizard can build their pickers
// from it and unit tests can verify the choice without a DOM.
const HOUSE_STYLE_IDS = ['nha-mai-do', 'nha-vuon', 'thap-canh', 'nha-go'];
const HOUSE_STYLE_LABELS = {
  'nha-mai-do': 'Nhà mái đỏ',
  'nha-vuon': 'Nhà vườn',
  'thap-canh': 'Tháp canh',
  'nha-go': 'Nhà gỗ'
};

/** Style ids in menu order, paired with their Vietnamese labels. */
function houseStyleOptions() {
  return HOUSE_STYLE_IDS.map(id => ({ id, label: HOUSE_STYLE_LABELS[id] }));
}

/** Human label for a style id ('' when unknown). */
function houseStyleLabel(style) {
  return HOUSE_STYLE_LABELS[style] || '';
}

/**
 * Resolve a saved style. An explicit valid id wins; anything else (`auto`, absent,
 * or a game saved before styles existed) picks a stable style from the game id, so
 * the same quiz always shows the same house — variety across games, not across
 * replays.
 */
function houseStyleFor(style, seed) {
  if (HOUSE_STYLE_IDS.indexOf(style) !== -1) return style;
  const key = String(seed == null ? '' : seed);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return HOUSE_STYLE_IDS[hash % HOUSE_STYLE_IDS.length];
}

/** Fresh construction state for one playing of a quiz. `parts` counts buildable
 *  parts above the foundation (which is always present). */
function houseCreate() {
  return { parts: 0, correct: 0, wrong: 0 };
}

/**
 * Apply one answer. Correct → +1 part (capped at `maxParts`); wrong → −1 part
 * (floored at 0). The foundation is never removed, so parts never go negative.
 */
function houseApplyAnswer(state, maxParts, correct) {
  const max = Math.max(HOUSE_PART_MIN, Math.round(Number(maxParts) || 0));
  const prev = Math.max(0, Math.min(max, state.parts | 0));
  let parts = prev;
  if (correct) parts = Math.min(max, prev + 1);
  else parts = Math.max(0, prev - 1);
  const completed = parts >= max;
  return {
    state: {
      parts,
      correct: (state.correct | 0) + (correct ? 1 : 0),
      wrong: (state.wrong | 0) + (correct ? 0 : 1)
    },
    parts,
    prev,
    maxParts: max,
    grew: parts > prev,
    shrank: parts < prev,
    completed,
    completedNow: completed && prev < max
  };
}

/** Read-only snapshot for the UI and result screen. */
function houseSummary(state, maxParts) {
  const max = Math.max(HOUSE_PART_MIN, Math.round(Number(maxParts) || 0));
  const parts = Math.max(0, Math.min(max, state.parts | 0));
  const completed = parts >= max;
  return {
    parts,
    maxParts: max,
    correct: state.correct | 0,
    wrong: state.wrong | 0,
    completed,
    remaining: Math.max(0, max - parts)
  };
}

if (typeof module !== 'undefined') module.exports = {
  houseCreate,
  houseApplyAnswer,
  houseSummary,
  houseStyleOptions,
  houseStyleLabel,
  houseStyleFor
};
