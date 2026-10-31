/**
 * Reading an exported `.egame` package (DECISIONS #118).
 *
 * `files:export-game` writes `{ packageFormat: 'edugame', packageVersion: 1, game }`.
 * Nothing could read it back: the library had an export button and no import, and the
 * import handler that existed made the caller do the parsing. The rules live here —
 * pure and testable — so the handler only does the dialog and the file I/O.
 *
 * The package is untrusted input from another machine. Everything is validated with the
 * same validators used when saving a game, ids are reassigned so an import can never
 * overwrite an existing game, and external resource URLs are removed because the play
 * surface loads only the built-in illustration registry.
 *
 * Pure: no I/O, no clock, no Electron.
 */
import type { EducationalGame } from '../shared/types';
import { validateMatchingGame, validateRaceGame, validateScenarioGame, validateTreasureHuntGame } from './game-validation';

// `game-service` is a CommonJS module (legacy, `@ts-nocheck`); require it the way the
// rest of main does so the same implementation runs here and in the editor.
const { normalizeGame } = require('./game-service') as { normalizeGame: (game: unknown) => EducationalGame };

/** A game plus text plus illustration ids is small; anything bigger is the wrong file. */
export const IMPORT_GAME_MAX_BYTES = 20 * 1024 * 1024;

/** Keys that hold a resource URL in an exported game. */
const URL_KEYS = new Set([
  'imageUrl', 'image', 'illustrationUrl', 'illustration', 'assetUrl', 'src', 'backgroundImage', 'audioUrl'
]);
/** Anything that names a scheme (`http:`, `file:`, `data:`) or is protocol-relative. */
const URL_VALUE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu;

/**
 * Removes external resource references from an imported game, in place.
 *
 * The key is deleted rather than blanked, so the item falls back to its generated
 * illustration. Values inside normal text (`description: "xem http://…"`) are kept:
 * they are displayed as text and never loaded.
 */
export function stripImportedAssetUrls(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(entry => stripImportedAssetUrls(entry));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const entry = record[key];
    if (URL_KEYS.has(key) && typeof entry === 'string' && URL_VALUE.test(entry.trim())) {
      delete record[key];
      continue;
    }
    stripImportedAssetUrls(entry);
  }
}

export class GamePackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GamePackageError';
  }
}

/**
 * Parses the text of a `.egame`/`.json` package into a game ready to save.
 *
 * `newId` is injected so the result is deterministic in tests. `createdAt`/`updatedAt`
 * are dropped: the store sets them on insert, and keeping the author's timestamps
 * would make a fresh import look older than the row it came from.
 */
export function readGamePackage(text: string, newId: () => string): EducationalGame {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(text || ''));
  } catch {
    throw new GamePackageError('Tệp .egame không phải JSON hợp lệ hoặc bị hỏng.');
  }
  const wrapper = parsed && typeof parsed === 'object' ? parsed as { game?: unknown } : null;
  const raw = wrapper && wrapper.game ? wrapper.game : parsed;
  if (!raw || typeof raw !== 'object') {
    throw new GamePackageError('Tệp không phải gói trò chơi hợp lệ.');
  }
  const game = raw as EducationalGame & { createdAt?: string; updatedAt?: string };
  if (typeof game.title !== 'string' || !Array.isArray(game.questions)) {
    throw new GamePackageError('Tệp không phải gói trò chơi hợp lệ (thiếu tên trò chơi hoặc danh sách câu hỏi).');
  }
  // `normalizeGame` is what the editor and the store run before validation: it trims
  // text and repairs an answer id, so an import is held to the same standard as a game
  // saved here. It does not carry asset fields (`illustrationAssetId`, `iconName`,
  // `contentCategory`) — those are re-attached per item, by position, from the original
  // package, so a game imported here renders the same illustrations it had.
  const assetFields = collectItemAssets(game.questions);
  const normalized = normalizeGame(game) as EducationalGame & { createdAt?: string; updatedAt?: string };
  reattachItemAssets(normalized.questions, assetFields);
  try {
    validateQuizAnswers(normalized);
    validateScenarioGame(normalized);
    validateMatchingGame(normalized);
    validateTreasureHuntGame(normalized);
    validateRaceGame(normalized);
  } catch (error) {
    throw new GamePackageError(`Gói trò chơi không hợp lệ: ${(error && (error as Error).message) || 'dữ liệu sai cấu trúc'}`);
  }
  stripImportedAssetUrls(normalized);
  normalized.id = newId();
  delete normalized.createdAt;
  delete normalized.updatedAt;
  return normalized;
}

/** The three asset fields the editor persists per question (DECISIONS #65). */
const ITEM_ASSET_KEYS = ['illustrationAssetId', 'iconName', 'contentCategory'] as const;

/** Asset fields of each question, in order, so they survive `normalizeGame`. */
function collectItemAssets(questions: unknown): Array<Record<string, unknown>> {
  const list = Array.isArray(questions) ? questions : [];
  return list.map(question => {
    const source = (question && typeof question === 'object' ? question : {}) as Record<string, unknown>;
    const fields: Record<string, unknown> = {};
    for (const key of ITEM_ASSET_KEYS) {
      const value = source[key];
      if (typeof value === 'string' && value) fields[key] = value;
    }
    return fields;
  });
}

/** Puts the collected asset fields back onto the normalised questions, by position. */
function reattachItemAssets(questions: unknown, assets: Array<Record<string, unknown>>): void {
  if (!Array.isArray(questions)) return;
  questions.forEach((question, index) => {
    const fields = assets[index];
    if (!question || typeof question !== 'object' || !fields) return;
    for (const key of ITEM_ASSET_KEYS) {
      if (fields[key] !== undefined) (question as Record<string, unknown>)[key] = fields[key];
    }
  });
}

/**
 * The question shapes `library:save-game` accepts. The per-template validators only
 * check their own template, so a quiz package (quiz has no dedicated validator) needs
 * this check to survive the round trip.
 */
function validateQuizAnswers(game: EducationalGame): void {
  if (game.template !== 'quiz' && game.template !== 'scenario') return;
  for (const question of game.questions || []) {
    if (question.type === 'scenario') continue;
    const options = Array.isArray(question.options) ? question.options : [];
    if (options.length < 2) throw new Error(`Câu “${question.prompt}” cần ít nhất hai phương án.`);
    if (question.type === 'multiple-choice' || question.type === 'true-false') {
      if (!options.some(option => option.id === question.correctOptionId)) {
        throw new Error(`Câu “${question.prompt}” có đáp án không khớp phương án nào.`);
      }
    }
    if (question.type === 'fill-in-blank' || question.type === 'short-answer') {
      if (!String(question.correctAnswer || '').trim()) throw new Error(`Câu “${question.prompt}” chưa có đáp án.`);
    }
  }
}
