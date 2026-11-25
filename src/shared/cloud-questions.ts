/*
 * Cloud AI output → questions, then → the text format the question importer already
 * reads (#345, #349).
 *
 * The gateway returns a GAME (`{ title, questions: [{ prompt, options, correctOptionId,
 * explanation }] }`), but the editor's import path reads TEXT. Rather than inventing a
 * second way into a game — a second path that would need its own validation, its own
 * dedupe and its own report — we render the cloud's questions into the same block text a
 * teacher can paste, and let `parseQuestionsFromText` (already tested) do the reading.
 *
 * Two rules, both learned the hard way:
 *   - a question whose correct answer cannot be matched to a real option is DROPPED, not
 *     guessed: a game with a wrong answer key teaches the wrong thing (#336 boundary rule
 *     applied to content);
 *   - the model's prose is flattened to one line per field, because a newline inside a
 *     prompt would silently split one question into two blocks.
 *
 * #349 added `cloudGameToQuestions()`: the wizard needs the QUESTIONS themselves (it
 * builds a draft, not text), so the matching lives in one place and the text is rendered
 * from the same list. One converter, two consumers.
 *
 * The renderer cannot `import`, so `src/renderer/shared/cloud-questions.ts` mirrors this
 * file and `tests/unit/cloud-questions.test.ts` compares the two outputs on the same
 * input, then feeds the result through the real parser.
 */

export interface CloudOption {
  id?: unknown;
  text?: unknown;
  label?: unknown;
}

export interface CloudQuestion {
  prompt?: unknown;
  question?: unknown;
  text?: unknown;
  options?: unknown;
  correctOptionId?: unknown;
  correctOption?: unknown;
  correctAnswer?: unknown;
  explanation?: unknown;
}

export interface CloudGame {
  title?: unknown;
  questions?: unknown;
}

/** Letters used for the answer line; four options is the product's ceiling per question. */
export const CLOUD_ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function oneLine(value: unknown): string {
  return String(value == null ? '' : value).replace(/\s+/gu, ' ').trim();
}

function optionText(option: unknown): string {
  if (typeof option === 'string') return oneLine(option);
  if (!option || typeof option !== 'object') return '';
  const source = option as CloudOption;
  return oneLine(source.text != null ? source.text : source.label);
}

function optionId(option: unknown): string {
  if (!option || typeof option !== 'object') return '';
  const source = option as CloudOption;
  return source.id == null ? '' : String(source.id);
}

/**
 * Which option is the answer. The cloud names it by id; a model that names it by text is
 * also accepted, because that is the other shape we have actually seen. Ambiguity is not
 * resolved by guessing — an unmatched answer returns -1 and the question is dropped.
 */
function answerIndex(options: unknown[], question: CloudQuestion): number {
  const wanted = question.correctOptionId;
  if (wanted != null) {
    const byId = options.findIndex(option => optionId(option) === String(wanted));
    if (byId >= 0) return byId;
    const byText = options.findIndex(option => optionText(option) === oneLine(wanted));
    if (byText >= 0) return byText;
  }
  const byCorrect = question.correctOption;
  if (byCorrect != null) {
    const index = options.findIndex(option => optionText(option) === oneLine(byCorrect));
    if (index >= 0) return index;
  }
  const byAnswer = question.correctAnswer;
  if (byAnswer != null) {
    const index = options.findIndex(option => optionText(option) === oneLine(byAnswer));
    if (index >= 0) return index;
  }
  return -1;
}

/** The shape the wizard draft and the game engine both read. */
export interface CloudQuestionItem {
  id: string;
  type: 'multiple-choice';
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  explanation: string;
  points: number;
}

export interface CloudQuestionSet {
  questions: CloudQuestionItem[];
  /** Questions that survived; the caller can report the difference honestly. */
  kept: number;
  /** Questions the cloud sent that could not be used. */
  dropped: number;
}

/**
 * Turn a cloud game into playable questions (#349).
 *
 * The wizard needs questions, not text — it builds a draft the game engine converts. Both
 * consumers must agree about which questions are usable, so the matching lives HERE and
 * `cloudGameToImportText` renders this list instead of repeating it.
 */
export function cloudGameToQuestions(game: CloudGame | null | undefined): CloudQuestionSet {
  const source = game && Array.isArray(game.questions) ? (game.questions as CloudQuestion[]) : [];
  const questions: CloudQuestionItem[] = [];
  let dropped = 0;
  for (const question of source) {
    if (!question || typeof question !== 'object') {
      dropped += 1;
      continue;
    }
    const prompt = oneLine(question.prompt != null ? question.prompt : (question.question != null ? question.question : question.text));
    const rawOptions = Array.isArray(question.options) ? question.options : [];
    const options = rawOptions.slice(0, CLOUD_ANSWER_LETTERS.length);
    const index = prompt ? answerIndex(options, question) : -1;
    const texts = options.map(optionText).filter(Boolean);
    if (!prompt || texts.length < 2 || index < 0) {
      dropped += 1;
      continue;
    }
    // Option ids are positional (`a`, `b`, …) because the importer, the parser and the
    // game engine all treat ids as opaque keys; a model id like `opt_2` needs no echo.
    const letters = texts.map((text, position) => ({
      id: CLOUD_ANSWER_LETTERS[position].toLowerCase(),
      text,
    }));
    questions.push({
      id: `cloud-${questions.length + 1}`,
      type: 'multiple-choice',
      prompt,
      options: letters,
      correctOptionId: letters[index].id,
      explanation: oneLine(question.explanation),
      points: 100,
    });
  }
  return { questions, kept: questions.length, dropped };
}

export interface CloudImportText {
  /** Block text the importer reads (`Câu 1: …` / `A. …` / `Đáp án: B`). */
  text: string;
  /** Questions that survived; the caller can report the difference honestly. */
  kept: number;
  /** Questions the cloud sent that could not be used. */
  dropped: number;
}

/**
 * Render a cloud game as import text. Returns the text plus the counts, so the UI can say
 * "đã dùng 4/5 câu" instead of pretending everything landed.
 */
export function cloudGameToImportText(game: CloudGame | null | undefined): CloudImportText {
  const set = cloudGameToQuestions(game);
  const blocks = set.questions.map((question, position) => {
    const lines = [`Câu ${position + 1}: ${question.prompt}`];
    question.options.forEach((option, index) => {
      lines.push(`${CLOUD_ANSWER_LETTERS[index]}. ${option.text}`);
    });
    const answerAt = question.options.findIndex(option => option.id === question.correctOptionId);
    lines.push(`Đáp án: ${CLOUD_ANSWER_LETTERS[answerAt < 0 ? 0 : answerAt]}`);
    if (question.explanation) lines.push(`Giải thích: ${question.explanation}`);
    return lines.join('\n');
  });
  return {
    text: blocks.join('\n\n'),
    kept: set.kept,
    dropped: set.dropped,
  };
}
