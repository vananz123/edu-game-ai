/**
 * Single-item regeneration helpers (O5, docs/update-AI-local.txt §5.5).
 *
 * The rule the spec asks for is narrow: detect the bad item with TypeScript, ask
 * the model only for that item with minimal context, and keep every other item
 * untouched. This module owns the deterministic half of that rule — locating the
 * item, and merging the model's content back into a valid draft.
 *
 * Merge policy: **the model writes content, the app keeps identity and
 * structure.** Item ids, option ids (and therefore scenario branch links),
 * treasure chain links, branch labels and attempt counts are copied from the
 * existing item. A regenerated item can therefore never orphan a sibling or
 * break the game graph, even if the model invents new ids. The merged draft is
 * re-validated with `parseGameDraft`, so a merge that still breaks a contract
 * (e.g. a duplicate matching pair) fails loudly instead of being saved.
 *
 * Positions are **1-based** everywhere in this module, the IPC payload and the
 * quality report (`QualityIssue.itemIndex`), so the UI never converts bases.
 */
import { parseGameDraft } from './lesson-contracts';
import type { GameDraft, WorkflowGameType } from '../shared/lesson-types';
import type { QualityReport } from './lesson-quality';

export type LessonItemErrorCode = 'ITEM_INDEX_INVALID' | 'ITEM_INVALID' | 'ITEM_LIST_MISSING';

export class LessonItemError extends Error {
  readonly code: LessonItemErrorCode;

  constructor(code: LessonItemErrorCode, message: string) {
    super(message);
    this.name = 'LessonItemError';
    this.code = code;
  }
}

export const ITEM_UNITS: Record<WorkflowGameType, string> = {
  arena: 'Câu hỏi',
  scenario: 'Tình huống',
  matching: 'Cặp ghép',
  treasure: 'Chặng',
  race: 'Câu hỏi'
};

export function itemCount(draft: GameDraft): number {
  return itemList(draft).length;
}

/** "Câu hỏi 3", "Chặng 2", … (1-based). */
export function itemLabel(gameType: WorkflowGameType, position: number): string {
  return `${ITEM_UNITS[gameType]} ${position}`;
}

export function itemAt(draft: GameDraft, position: number): unknown {
  const list = itemList(draft);
  const index = toArrayIndex(position, list.length);
  return list[index];
}

/**
 * Replaces one item, then validates the whole draft. Throws `LessonItemError`
 * for a bad position and `LessonContractError` when the merged draft is invalid.
 */
export function replaceDraftItem(draft: GameDraft, position: number, regenerated: unknown): GameDraft {
  const list = itemList(draft);
  const index = toArrayIndex(position, list.length);
  const oldItem = asRecord(list[index]);
  const newItem = asRecord(regenerated);
  if (!oldItem) {
    throw new LessonItemError('ITEM_INVALID', `Không đọc được ${itemLabel(draft.gameType, position)} hiện tại.`);
  }
  if (!newItem) {
    throw new LessonItemError('ITEM_INVALID', 'AI không trả về nội dung hợp lệ cho mục cần tạo lại.');
  }

  const knownSituationIds = draft.gameType === 'scenario'
    ? new Set(draft.situations.map(situation => situation.id))
    : null;
  const merged = mergeItem(draft.gameType, oldItem, newItem, knownSituationIds);

  const nextItems = list.slice();
  nextItems[index] = merged;
  return parseGameDraft({ ...draft, [listKeyOf(draft.gameType)]: nextItems });
}

/**
 * Which positions the teacher asked for. Invalid/duplicate positions are dropped;
 * with no explicit position, the items flagged by the quality report are used
 * (that is the "fix the broken ones" path of §5.5).
 */
export function resolveItemIndexes(
  draft: GameDraft,
  requested: number[] | null | undefined,
  quality?: QualityReport | null
): number[] {
  const count = itemCount(draft);
  const clean = (values: Array<number | undefined>): number[] => Array.from(new Set(
    values
      .map(value => (typeof value === 'number' ? Math.trunc(value) : NaN))
      .filter(value => Number.isFinite(value) && value >= 1 && value <= count)
  )).sort((a, b) => a - b);

  const explicit = clean(Array.isArray(requested) ? requested : []);
  if (explicit.length) return explicit;
  const fromQuality = (quality && quality.issues ? quality.issues : [])
    .filter(issue => issue.itemIndex !== undefined)
    .map(issue => issue.itemIndex as number);
  return clean(fromQuality);
}

function itemList(draft: GameDraft): unknown[] {
  switch (draft.gameType) {
    case 'arena':
    case 'race':
      return draft.questions;
    case 'scenario':
      return draft.situations;
    case 'matching':
      return draft.pairs;
    case 'treasure':
      return draft.stages;
    default:
      throw new LessonItemError('ITEM_LIST_MISSING', 'Thể loại trò chơi chưa hỗ trợ tạo lại từng mục.');
  }
}

function listKeyOf(gameType: WorkflowGameType): 'questions' | 'situations' | 'pairs' | 'stages' {
  switch (gameType) {
    case 'arena':
    case 'race':
      return 'questions';
    case 'scenario':
      return 'situations';
    case 'matching':
      return 'pairs';
    case 'treasure':
      return 'stages';
    default:
      throw new LessonItemError('ITEM_LIST_MISSING', 'Thể loại trò chơi chưa hỗ trợ tạo lại từng mục.');
  }
}

function toArrayIndex(position: number, count: number): number {
  const numeric = Number(position);
  if (!Number.isFinite(numeric) || Math.trunc(numeric) !== numeric || numeric < 1 || numeric > count) {
    throw new LessonItemError(
      'ITEM_INDEX_INVALID',
      `Mục cần tạo lại không hợp lệ (${position}); trò chơi có ${count} mục.`
    );
  }
  return numeric - 1;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * App-owned fields win. The model's text fields (prompt, options, explanation,
 * story, …) are kept; ids and links come from the old item.
 */
function mergeItem(
  gameType: WorkflowGameType,
  oldItem: Record<string, unknown>,
  newItem: Record<string, unknown>,
  knownSituationIds: Set<string> | null
): Record<string, unknown> {
  switch (gameType) {
    case 'arena':
    case 'race':
    case 'matching':
      return { ...newItem, id: oldItem.id };
    case 'treasure':
      return mergeTreasureStage(oldItem, newItem);
    case 'scenario':
      return mergeScenarioSituation(oldItem, newItem, knownSituationIds || new Set<string>());
    default:
      throw new LessonItemError('ITEM_INVALID', 'Thể loại trò chơi chưa hỗ trợ tạo lại từng mục.');
  }
}

function mergeTreasureStage(
  oldItem: Record<string, unknown>,
  newItem: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...newItem,
    id: oldItem.id,
    attempts: oldItem.attempts,
    nextStageId: oldItem.nextStageId === undefined ? null : oldItem.nextStageId
  };
  if (oldItem.branchStageId) {
    merged.branchStageId = oldItem.branchStageId;
    merged.branchLabel = oldItem.branchLabel;
  } else {
    delete merged.branchStageId;
    delete merged.branchLabel;
  }
  return merged;
}

function mergeScenarioSituation(
  oldItem: Record<string, unknown>,
  newItem: Record<string, unknown>,
  knownSituationIds: Set<string>
): Record<string, unknown> {
  const oldOptions = Array.isArray(oldItem.options)
    ? oldItem.options.map(asRecord).filter((option): option is Record<string, unknown> => Boolean(option))
    : [];
  const newOptions = Array.isArray(newItem.options)
    ? newItem.options.map(asRecord).filter((option): option is Record<string, unknown> => Boolean(option))
    : [];
  if (!newOptions.length) {
    throw new LessonItemError('ITEM_INVALID', 'Tình huống mới không có hành động nào để học sinh chọn.');
  }
  const selfId = typeof oldItem.id === 'string' ? oldItem.id : '';
  const options = newOptions.map((option, index) => {
    const previous = oldOptions[index];
    const id = previous && typeof previous.id === 'string' ? previous.id : option.id;
    const oldTarget = previous && typeof previous.nextSituationId === 'string'
      ? previous.nextSituationId
      : null;
    let nextSituationId = option.nextSituationId;
    const validTarget = typeof nextSituationId === 'string'
      && knownSituationIds.has(nextSituationId)
      && nextSituationId !== selfId;
    // Branch links are structure, not content: keep the model's target only when
    // it points at a real, different situation; otherwise reuse the old branch
    // (or end the conversation for options the old situation did not have).
    if (!validTarget) nextSituationId = oldTarget;
    return { ...option, id, nextSituationId: nextSituationId === undefined ? null : nextSituationId };
  });
  const correctIndex = newOptions.findIndex(option => option.id === newItem.correctOptionId);
  const correctOptionId = correctIndex >= 0 && options[correctIndex]
    ? options[correctIndex].id
    : undefined;

  const merged: Record<string, unknown> = { ...newItem, id: oldItem.id, options };
  delete merged.correctOptionId;
  if (typeof correctOptionId === 'string') merged.correctOptionId = correctOptionId;
  return merged;
}
