/*
 * Object Connection progression (DECISIONS #168) — pure, no DOM, no scoring.
 *
 * Two questions this module answers, and nothing else:
 *   1. `planConnectionStages` — which template stage does each question earn?
 *   2. `applyConnectionAnswer` — given an already-evaluated answer, what is next?
 *
 * Scoring stays in `game-engine/runtime.ts`; rendering stays in the renderer.
 * `update_game.txt` §5 asks for exactly this split ("keep gameplay evaluation
 * separate from visual rendering") and for progress that adapts to the question
 * count, so the mapping lives here as data and is unit-tested for every
 * (question count, stage count) pair a teacher can produce.
 *
 * Invariants (each one has a test):
 *   - `plan.length === questions.length` always, and the plan is deterministic.
 *   - The same question evaluated twice changes nothing (idempotent by id).
 *   - A wrong answer never removes a connection.
 *   - A stage is earned at most once, so the counter cannot exceed its total.
 *   - Answering everything correctly always ends at `total/total`; answering
 *     nothing correctly ends at `0/total`.
 *   - The final picture reflects what the player actually completed: with fewer
 *     questions than stages, the missing stages open only on the last correct
 *     answer (update_game.txt §4 "completion").
 */

import {
  CONNECTION_STAGE_MAX,
  CONNECTION_STAGE_MIN,
  connectionTemplate,
  type ConnectionTemplate
} from './connection-templates';

export interface ConnectionProgress {
  /** The resolved template id (never empty). */
  templateId: string;
  /** Stage ids in the order they were earned. */
  connectedStageIds: string[];
  /**
   * Question ids whose CORRECT answer has already been applied — the idempotency
   * key, and also the "all questions used" counter for the completion sweep.
   */
  appliedQuestionIds: string[];
  /** Question ids that were answered wrongly at least once (feedback only). */
  wrongQuestionIds: string[];
  /** Answers that earned nothing (wrong, or a question past the last stage). */
  missed: number;
}

export interface ConnectionAnswerResult {
  progress: ConnectionProgress;
  /** Stage earned by THIS answer, or `null`. */
  stageId: string | null;
  /** True when this answer finished the picture. */
  completedNow: boolean;
  /** True when the picture was already complete and this answer changed nothing. */
  alreadyComplete: boolean;
}

/**
 * A played item: one matching PAIR (Object Connection is a matching play style,
 * DECISIONS #168). Only the id matters for the plan and the idempotency key;
 * the pair is the thing a correct answer connects.
 */
export interface ConnectionItem {
  id: string;
}

function resolveTemplate(template: ConnectionTemplate | string | null | undefined): ConnectionTemplate {
  return typeof template === 'string' ? connectionTemplate(template) : connectionTemplate(template && template.id);
}

/**
 * Bind every played item (one matching pair) to at most one template stage
 * (`''` = earns nothing for this plan).
 *
 * - `n === k`: one pair per stage, in order.
 * - `n > k`: the first `k` pairs earn a stage; the rest earn nothing but still
 *   score (the picture is finished before the board is).
 * - `n < k`: stages are spread evenly (`floor(i * k / n)`), so consecutive
 *   matches move the picture forward instead of leaving gaps until the end; the
 *   leftover stages open on the last correct match.
 */
export function planConnectionStages(
  template: ConnectionTemplate | string | null | undefined,
  items: readonly ConnectionItem[] | number | null | undefined
): string[] {
  const stages = resolveTemplate(template).stages;
  // A bare number is accepted (the matching board knows its pair count before it
  // builds the ids), which keeps callers from inventing placeholder ids.
  const list: Array<{ id: string }> = typeof items === 'number'
    ? Array.from({ length: Math.max(0, Math.round(items) || 0) }, (_, i) => ({ id: String(i) }))
    : (Array.isArray(items) ? items as Array<{ id: string }> : []);
  const n = list.length;
  const k = stages.length;
  if (!n || !k) return [];
  if (n <= k) return list.map((_, index) => stages[Math.min(k - 1, Math.floor((index * k) / n))].id);
  return list.map((_, index) => (index < k ? stages[index].id : ''));
}

/** Fresh state for one playing of one game. */
export function resetConnectionProgress(template: ConnectionTemplate | string | null | undefined): ConnectionProgress {
  return {
    templateId: resolveTemplate(template).id,
    connectedStageIds: [],
    appliedQuestionIds: [],
    wrongQuestionIds: [],
    missed: 0
  };
}

/**
 * Apply one already-evaluated answer.
 *
 * `itemIndex` is the position in the plan (the index of the matching pair that
 * was just resolved), so the module needs no lookup table. A repeated or
 * out-of-range index falls back to the first still-open planned stage, which
 * keeps the function total and never throws on saved or replayed data.
 *
 * `correct: true` earns the stage planned for that pair, once. `correct: false`
 * never changes which stages are connected.
 */
export function applyConnectionAnswer(
  progress: ConnectionProgress | null | undefined,
  template: ConnectionTemplate | string | null | undefined,
  plan: readonly string[] | null | undefined,
  itemIndex: number,
  itemId: string,
  correct: boolean
): ConnectionAnswerResult {
  const resolved = resolveTemplate(template);
  const base = progress || resetConnectionProgress(resolved);
  const id = String(itemId || '');
  const stageIds = resolved.stages.map(stage => stage.id);
  const wasComplete = isConnectionComplete(base, resolved);
  const planStages = Array.isArray(plan) ? plan : [];

  // Idempotency: the same CORRECT answer evaluated twice changes nothing. A
  // retry after a wrong answer is NOT a repeat — it still earns its stage, which
  // is what makes the mode safe for a question the surface lets the player retry.
  if (id && base.appliedQuestionIds.indexOf(id) !== -1) {
    return { progress: cloneProgress(base), stageId: null, completedNow: false, alreadyComplete: wasComplete };
  }

  if (!correct || !stageIds.length) {
    const missed = cloneProgress(base);
    missed.missed += correct ? 0 : 1;
    if (id && !correct) missed.wrongQuestionIds = missed.wrongQuestionIds.indexOf(id) === -1
      ? missed.wrongQuestionIds.concat(id)
      : missed.wrongQuestionIds.slice();
    return { progress: missed, stageId: null, completedNow: false, alreadyComplete: wasComplete };
  }

  const applied = {
    ...cloneProgress(base),
    appliedQuestionIds: id ? base.appliedQuestionIds.concat(id) : base.appliedQuestionIds.slice()
  };
  if (wasComplete) {
    // Every stage is earned; a later correct answer does not invent a new one.
    return { progress: applied, stageId: null, completedNow: false, alreadyComplete: true };
  }

  const stageId = stageForAnswer(stageIds, applied.connectedStageIds, itemIndex);
  if (!stageId) {
    // Correct, but every stage it could honestly earn is already connected.
    return { progress: applied, stageId: null, completedNow: false, alreadyComplete: false };
  }
  // Keep the picture in TEMPLATE order rather than completion order: a 2-question
  // run over a 6-stage template earns net-1 and net-3, and the closure adds
  // net-2 before net-4 — so the stored list must be re-sorted, otherwise the
  // renderer (which draws stages in template order anyway) and this module
  // would report the same picture as two different arrays.
  let connected = stageIds.filter(id => applied.connectedStageIds.indexOf(id) !== -1 || id === stageId);

  // Completion sweep: only after EVERY pair that can earn a stage has been
  // answered correctly may the stages a short board could not reach open by
  // themselves — a 50 % run stays at 50 % and the final picture matches what the
  // player actually completed.
  //
  // The sweep needs BOTH facts:
  //  - every slot that can earn a stage was answered correctly (the plan pads
  //    itself with '' past the last stage, so its length is not that count), and
  //  - the player made no mistake at all. A short board cannot show four stages
  //    earned by two pairs, and it must not reward a mistake either: measured on
  //    2 pairs over a 4-stage bridge, a wrong-then-retried pair used to report an
  //    unearned 4/4.
  const earningSlots = planStages.filter(Boolean).length;
  const everyEarningPairCorrect = earningSlots > 0
    && applied.appliedQuestionIds.length >= earningSlots
    && applied.missed === 0;
  if (everyEarningPairCorrect) connected = stageIds.slice();

  return {
    progress: { ...applied, connectedStageIds: connected },
    stageId,
    completedNow: connected.length >= stageIds.length,
    alreadyComplete: false
  };
}

/** The planned stage for this index, or the first open one when the plan is unusable. */
function stageForAnswer(stageIds: readonly string[], connected: readonly string[], itemIndex: number): string {
  const planned = Number.isInteger(itemIndex) && itemIndex >= 0 ? stageIds[itemIndex] || '' : '';
  if (planned && connected.indexOf(planned) === -1) return planned;
  for (const id of stageIds) {
    if (connected.indexOf(id) === -1) return id;
  }
  return '';
}

function cloneProgress(progress: ConnectionProgress): ConnectionProgress {
  return {
    templateId: progress.templateId,
    connectedStageIds: progress.connectedStageIds.slice(),
    appliedQuestionIds: progress.appliedQuestionIds.slice(),
    wrongQuestionIds: (progress.wrongQuestionIds || []).slice(),
    missed: progress.missed
  };
}

/** A picture is complete when every stage is connected. */
export function isConnectionComplete(
  progress: ConnectionProgress | null | undefined,
  template: ConnectionTemplate | string | null | undefined
): boolean {
  const resolved = resolveTemplate(template);
  if (!resolved.stages.length || !progress) return false;
  return resolved.stages.every(stage => progress.connectedStageIds.indexOf(stage.id) !== -1);
}

/** Counters for the play surface ("2/6 kết nối") and the result screen. */
export function connectionSummary(
  progress: ConnectionProgress | null | undefined,
  template: ConnectionTemplate | string | null | undefined
): { connected: number; total: number; remaining: number; completed: boolean; missed: number; percent: number } {
  const total = resolveTemplate(template).stages.length;
  const connected = progress ? Math.min(progress.connectedStageIds.length, total) : 0;
  return {
    connected,
    total,
    remaining: total - connected,
    completed: total > 0 && connected >= total,
    missed: progress ? progress.missed : 0,
    percent: total ? Math.round((connected / total) * 100) : 0
  };
}

/** Guard for callers that accept a stage count from outside: clamps, never throws. */
export function clampStageCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CONNECTION_STAGE_MIN;
  return Math.min(CONNECTION_STAGE_MAX, Math.max(CONNECTION_STAGE_MIN, n));
}

export { connectionTemplate };
export type { ConnectionTemplate };
