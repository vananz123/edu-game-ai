// @ts-nocheck -- classic renderer script; one text formatter, no DOM.
/*
 * Cloud AI output → import text (DECISIONS #345).
 *
 * The renderer cannot `import`, so this file MIRRORS `src/shared/cloud-questions.ts`,
 * which is the single source of truth. `tests/unit/cloud-questions.test.ts` runs THIS
 * file's function and the shared module's on the same input, compares the two strings,
 * and then feeds the result through the real `parseQuestionsFromText`, so the copy cannot
 * drift and the output cannot stop being importable.
 *
 * Same two rules as the shared module: a question whose answer cannot be matched to a
 * real option is DROPPED (never guessed), and every field is flattened to one line so a
 * newline inside a prompt cannot split one question into two.
 *
 * #349: `cloudGameToQuestions()` is here too, because the wizard needs questions (it
 * builds a draft) while the editor needs text; the text is rendered from the same list so
 * the two can never disagree about which questions are usable.
 */

const CLOUD_ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function cloudOneLine(value) {
  return String(value == null ? '' : value).replace(/\s+/gu, ' ').trim();
}

function cloudOptionText(option) {
  if (typeof option === 'string') return cloudOneLine(option);
  if (!option || typeof option !== 'object') return '';
  return cloudOneLine(option.text != null ? option.text : option.label);
}

function cloudOptionId(option) {
  if (!option || typeof option !== 'object') return '';
  return option.id == null ? '' : String(option.id);
}

function cloudAnswerIndex(options, question) {
  const wanted = question.correctOptionId;
  if (wanted != null) {
    const byId = options.findIndex(option => cloudOptionId(option) === String(wanted));
    if (byId >= 0) return byId;
    const byText = options.findIndex(option => cloudOptionText(option) === cloudOneLine(wanted));
    if (byText >= 0) return byText;
  }
  const byCorrect = question.correctOption;
  if (byCorrect != null) {
    const index = options.findIndex(option => cloudOptionText(option) === cloudOneLine(byCorrect));
    if (index >= 0) return index;
  }
  const byAnswer = question.correctAnswer;
  if (byAnswer != null) {
    const index = options.findIndex(option => cloudOptionText(option) === cloudOneLine(byAnswer));
    if (index >= 0) return index;
  }
  return -1;
}

function cloudGameToQuestions(game) {
  const source = game && Array.isArray(game.questions) ? game.questions : [];
  const questions = [];
  let dropped = 0;
  for (const question of source) {
    if (!question || typeof question !== 'object') {
      dropped += 1;
      continue;
    }
    const prompt = cloudOneLine(question.prompt != null ? question.prompt : (question.question != null ? question.question : question.text));
    const rawOptions = Array.isArray(question.options) ? question.options : [];
    const options = rawOptions.slice(0, CLOUD_ANSWER_LETTERS.length);
    const index = prompt ? cloudAnswerIndex(options, question) : -1;
    const texts = options.map(cloudOptionText).filter(Boolean);
    if (!prompt || texts.length < 2 || index < 0) {
      dropped += 1;
      continue;
    }
    const letters = texts.map((text, position) => ({
      id: CLOUD_ANSWER_LETTERS[position].toLowerCase(),
      text: text,
    }));
    questions.push({
      id: `cloud-${questions.length + 1}`,
      type: 'multiple-choice',
      prompt: prompt,
      options: letters,
      correctOptionId: letters[index].id,
      explanation: cloudOneLine(question.explanation),
      points: 100,
    });
  }
  return { questions: questions, kept: questions.length, dropped: dropped };
}

function cloudGameToImportText(game) {
  const set = cloudGameToQuestions(game);
  const blocks = set.questions.map((question, position) => {
    const lines = [`Câu ${position + 1}: ${question.prompt}`];
    question.options.forEach((option, index) => {
      lines.push(`${CLOUD_ANSWER_LETTERS[index]}. ${option.text}`);
    });
    let answerAt = -1;
    for (let index = 0; index < question.options.length; index += 1) {
      if (question.options[index].id === question.correctOptionId) answerAt = index;
    }
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
