// @ts-nocheck -- wizard/state/config.ts — cấu hình mặc định theo gợi ý, nhận dạng kiểu đầu vào và mức tương thích câu hỏi (split từ features/wizard/state.ts, DECISIONS #150).
/** Builds a schema-valid default config for a recommended game type. */
function wizardDefaultConfig(recommendation, analysis) {
  const gameType = recommendation.gameType;
  // O12: automatic counts live in 4..7 (content/time guard). The capacity
  // endpoint refines this with document length + the model actually in use.
  const suggestedCount = wizardClamp(Number(recommendation.suggestedQuestionCount) || 5, 4, 7);
  const base = {
    gameType,
    title: recommendation.title || (analysis && analysis.topic) || 'Trò chơi mới',
    subject: (analysis && analysis.subject) || '',
    grade: analysis && analysis.grade ? String(analysis.grade) : '',
    topic: (analysis && analysis.topic) || '',
    audience: 'teen',
    durationMinutes: wizardClamp(recommendation.suggestedDurationMinutes || 10, 1, 120),
    difficulty: 'trung bình',
    playMode: gameType === 'race' ? 'team' : 'individual',
    style: 'fun',
    focusObjectiveIds: Array.isArray(recommendation.learningObjectiveIds) ? recommendation.learningObjectiveIds.slice() : [],
    generationMode: 'fast'
  };
  if (gameType === 'arena') {
    return { ...base, questionCount: wizardClamp(suggestedCount, 1, 30), scoringMode: 'speed', pointsPerCorrect: 100, timeBonus: 20, pointsEasy: 100, pointsMedium: 200, pointsHard: 300 };
  }
  if (gameType === 'scenario') {
    return { ...base, situationCount: wizardClamp(suggestedCount, 1, 30), scoringMode: 'quality' };
  }
  if (gameType === 'matching') {
    return { ...base, pairCount: wizardClamp(suggestedCount, 2, 30), matchingMode: 'columns', wrongPenalty: 0 };
  }
  if (gameType === 'treasure') {
    return { ...base, stageCount: wizardClamp(suggestedCount, 2, 30), attemptsPerStage: 3, journeyBonus: 300, hiddenItemBonus: 100 };
  }
  if (gameType === 'race') {
    return { ...base, trackLength: 20, maxRounds: wizardClamp(suggestedCount, 4, 7), teamCount: 2, stepByDifficulty: true, luckEnabled: true };
  }
  return base;
}

/**
 * update_quy_trinh (§2, §3 nhánh B, §5): which workflow path the pasted text takes.
 *
 * `auto` uses the rule classifier in the main process (`lesson:classify-input`),
 * which is pure and never starts the model. The two explicit choices let the
 * teacher overrule it.
 */
/**
 * The workflow path (two paths only). `outline` is a *label*, not a third path: an
 * outline still goes through lesson analysis, per update_quy_trinh_2 §2 ("assess
 * content sufficiency … lightweight analysis or optional AI-assisted development").
 * Keeping this function's return type at two values means no caller can accidentally
 * invent a third branch.
 */
function wizardResolveInputKind() {
  const override = wizardState.inputKind;
  if (override === 'questions') return 'questions';
  if (override === 'lesson' || override === 'outline') return 'lesson';
  const classification = wizardState.inputClassification;
  return classification && classification.kind === 'questions' ? 'questions' : 'lesson';
}

/** What the teacher sees in the verdict badge (may be `outline` or `ambiguous`). */
function wizardDetectedKind() {
  const override = wizardState.inputKind;
  if (override !== 'auto') return override;
  return wizardState.inputClassification ? wizardState.inputClassification.kind : null;
}

/**
 * Teacher picks the input type (or returns to auto-detect).
 */
async function wizardSetInputKind(kind) {
  if (wizardState.busy) return;
  if (kind !== 'auto' && kind !== 'lesson' && kind !== 'outline' && kind !== 'questions') return;
  wizardState.inputKind = kind;
  wizardClearMessages();
  if (kind === 'questions') await wizardClassifyInput();
  render();
}

/**
 * Debounced re-classification while the teacher types or pastes in step 1. The
 * verdict is shown in place (no full re-render) so typing keeps focus and caret.
 */
let wizardInputKindTimer = 0;
function wizardInputKindSchedule() {
  if (wizardInputKindTimer) clearTimeout(wizardInputKindTimer);
  wizardInputKindTimer = setTimeout(async () => {
    wizardInputKindTimer = 0;
    if (!wizardState.text || !String(wizardState.text).trim()) return;
    await wizardClassifyInput();
    // Patch just the picker block; re-rendering the whole page would drop the caret.
    if (wizardState.step !== 'input') return;
    const host = document.querySelector('[data-wizard-input-kind-picker]');
    if (host && typeof wizardInputKindPickerHtml === 'function') {
      host.outerHTML = wizardInputKindPickerHtml(wizardState);
    }
    if (typeof wizardSyncStepInputStats === 'function') wizardSyncStepInputStats();
  }, 450);
}

/**
 * Ask main to classify the text and (when it looks like a question bank) parse it.
 * Cheap enough to call on the debounced keystroke; no model, no disk write.
 */
async function wizardClassifyInput() {
  const text = String(wizardState.text || '');
  if (!text.trim()) {
    wizardState.inputClassification = null;
    wizardState.inputSemantic = null;
    wizardState.inputSemanticNote = '';
    wizardState.importedQuestions = [];
    wizardState.importIssues = [];
    wizardState.parsedQuestions = [];
    wizardState.questionCompatibility = [];
    return null;
  }
  // Sequence guard: classification can take ~250 ms with the semantic layer, so a
  // faster second paste could otherwise have its result overwritten by the first.
  // Only the newest request may write state.
  const requestId = (wizardState.classifySeq || 0) + 1;
  wizardState.classifySeq = requestId;
  try {
    const result = await window.eduGame.classifyLessonInput({ text });
    if (wizardState.classifySeq !== requestId) return null;
    wizardState.inputClassification = result.classification || null;
    wizardState.inputSemantic = result.semantic || null;
    wizardState.inputSemanticNote = result.semanticNote || '';
    wizardState.importedQuestions = result.import ? result.import.questions : [];
    wizardState.importIssues = result.import ? result.import.issues : [];
    // #115: per-question status + per-game scores travel with the verdict, so the
    // "ngân hàng câu hỏi" note and step 3 need no extra IPC round trip.
    wizardState.parsedQuestions = result.import && Array.isArray(result.import.parsed) ? result.import.parsed : [];
    wizardState.questionCompatibility = Array.isArray(result.compatibility) ? result.compatibility : [];
    return result;
  } catch {
    if (wizardState.classifySeq !== requestId) return null;
    // Classification is a convenience; failing it must never block step 1.
    wizardState.inputClassification = null;
    wizardState.inputSemantic = null;
    wizardState.inputSemanticNote = '';
    return null;
  }
}

/**
 * Default config for a question-bank project. Recommendations need a lesson
 * analysis, which branch B never produces, so the genre is chosen directly and the
 * config is built as if the teacher had accepted a question-heavy suggestion.
 */
function wizardConfigForImportedQuestions(gameType) {
  const count = wizardClamp((wizardState.importedQuestions || []).length || 5, 1, 30);
  const base = {
    gameType,
    title: wizardState.documentName || 'Trò chơi từ câu hỏi có sẵn',
    subject: '',
    grade: '',
    topic: '',
    audience: 'teen',
    durationMinutes: 10,
    difficulty: 'trung bình',
    playMode: gameType === 'race' ? 'team' : 'individual',
    style: 'fun',
    focusObjectiveIds: [],
    generationMode: 'fast'
  };
  if (gameType === 'arena') return { ...base, questionCount: count, scoringMode: 'basic', pointsPerCorrect: 100, timeBonus: 20, pointsEasy: 100, pointsMedium: 200, pointsHard: 300 };
  if (gameType === 'matching') return { ...base, pairCount: wizardClamp(count, 2, 30), matchingMode: 'columns', wrongPenalty: 0 };
  if (gameType === 'treasure') return { ...base, stageCount: wizardClamp(count, 2, 30), attemptsPerStage: 3, journeyBonus: 300, hiddenItemBonus: 100 };
  if (gameType === 'race') return { ...base, trackLength: 20, maxRounds: wizardClamp(count, 4, 7), teamCount: 2, stepByDifficulty: true, luckEnabled: true };
  return { ...base, situationCount: wizardClamp(count, 1, 30), scoringMode: 'quality' };
}

/** The game the scores point at, or `null` when no game can play one question. */
function wizardRecommendedGame() {
  const results = wizardState.questionCompatibility || [];
  if (!results.length) return null;
  const best = results.reduce((winner, current) => {
    if (current.score !== winner.score) return current.score > winner.score ? current : winner;
    // Same score: the shared game order decides (`recommendedGame` in the service).
    return wizardCompatGameOrder.indexOf(current.gameType) < wizardCompatGameOrder.indexOf(winner.gameType) ? current : winner;
  }, results[0]);
  return best && best.compatible > 0 && best.score > 0 ? best.gameType : null;
}

/** Scores for one genre; `null` when nothing was scored (e.g. a lesson, not a bank). */
function wizardCompatibilityFor(gameType) {
  const results = wizardState.questionCompatibility || [];
  return results.find(result => result.gameType === gameType) || null;
}

/** The parsed questions the chosen game can play, in source order (status `ready`). */
function wizardUsableParsed(gameType) {
  const parsed = wizardState.parsedQuestions || [];
  if (!parsed.length) {
    return (wizardState.importedQuestions || []).map(question => ({ question, kind: question.type || 'multiple-choice', status: 'ready', warnings: [], sourceLine: 0 }));
  }
  const accepted = gameType === 'race'
    ? ['multiple-choice']
    : ['multiple-choice', 'true-false', 'fill-in-blank', 'short-answer'];
  return parsed.filter(item => {
    if (!accepted.includes(item.kind)) return false;
    // A question whose only gap is the explanation the teacher must write stays usable
    // (#114/#116): the wizard saves it and blocks with "Còn N câu chưa có Giải thích",
    // instead of claiming that no question can be used at all.
    const onlyExplanation = item.status === 'needs-review' && item.warnings.length > 0
      && item.warnings.every(warning => /Giải thích/u.test(warning));
    if (item.status !== 'ready' && !onlyExplanation) return false;
    const options = Array.isArray(item.question.options) ? item.question.options.length : 0;
    return item.kind !== 'multiple-choice' || (options >= 2 && options <= 6);
  });
}

/** The parsed questions the chosen game can never play (excludes ones still in review). */
function wizardBlockedParsed(gameType) {
  const usable = new Set(wizardUsableParsed(gameType));
  return (wizardState.parsedQuestions || []).filter(item => item.status !== 'needs-review' && !usable.has(item));
}

/**
 * #116: the parser recognized at least one question, even when the classifier was not
 * confident enough to pick the `questions` path (`ambiguous` happens for a single
 * question). Those questions are still the teacher's own content and must not be sent
 * through the lesson pipeline.
 */
function wizardHasRecognizedQuestions() {
  const parsed = wizardState.parsedQuestions || [];
  return parsed.some(item => item.status === 'ready' || item.status === 'needs-review');
}

/** Counts shown in step 1 and step 3, all from the parser's own statuses. */
function wizardQuestionBankStats() {
  const parsed = wizardState.parsedQuestions || [];
  return {
    total: parsed.length || (wizardState.importedQuestions || []).length,
    needsReview: parsed.filter(item => item.status === 'needs-review').length,
    incompatible: parsed.filter(item => item.status === 'incompatible').length
  };
}
