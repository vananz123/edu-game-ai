// @ts-nocheck -- wizard/state/draft.ts — ngân hàng câu hỏi đã nhận, dựng draft theo trò chơi, origin và giới hạn số mục (split từ features/wizard/state.ts, DECISIONS #150).
/** Turns the usable parsed questions into the arena-shaped draft a game converts from. */
function wizardImportedSourceDraft(usable) {
  return {
    gameType: 'arena',
    schemaVersion: 1,
    questions: usable.map(item => ({
      ...item.question,
      difficulty: item.question.difficulty || 'trung bình'
    }))
  };
}

/**
 * Branch B → configure. Skips `analyze` and `recommend` (both need a lesson
 * analysis), builds a draft straight from the teacher's questions, and saves it so
 * `lesson:generate` can convert it without any model call.
 *
 * `gameType` defaults to the game the scores recommend (#115); the teacher's pick in
 * step 3 is passed explicitly and recalculated there, never regenerated.
 */
async function wizardUseImportedQuestions(gameType) {
  if (wizardState.busy) return;
  if (!wizardState.importedQuestions.length) await wizardClassifyInput();
  const target = gameType || wizardRecommendedGame() || 'arena';
  // Only questions that are ready AND playable by the target; without this the
  // conversion failed for every question and the reason named the wrong field.
  const usable = wizardUsableParsed(target);
  if (!usable.length) {
    // Every row had a problem that stops it being a game question (no options, no
    // answer, a question shape no game supports, or no explanation — which the app
    // refuses to invent, §4.3).
    const issues = wizardState.importIssues || [];
    const first = issues[0];
    const stats = wizardQuestionBankStats();
    wizardSetError(new Error(first
      ? `Chưa có câu hỏi nào dùng được. ${first.message}`
      : stats.total
        ? `Không có câu nào phù hợp với thể loại đã chọn (${stats.needsReview} câu cần xem lại, ${stats.incompatible} câu không tương thích).`
        : 'Chưa nhận ra câu hỏi nào. Mỗi câu cần nội dung, ít nhất hai phương án A–D, một dòng “Đáp án:” và một dòng “Giải thích:”.'));
    render();
    return;
  }
  wizardState.busy = 'save';
  wizardClearMessages();
  render();
  try {
    // `importIssueSummary` counts by field from the same list the parser returned,
    // so the wizard and the importer cannot disagree about what is missing. Only the
    // questions actually going into the draft are checked: a bank row the teacher is
    // leaving out cannot block the game.
    const missingWhy = usable.filter(item => !String(item.question.explanation || '').trim()).length;
    if (missingWhy) {
      // The draft schema requires a non-empty explanation and the app must not invent
      // one, so the project cannot be saved in this state. Say exactly what is missing
      // instead of letting `saveProject` fail with a schema error.
      wizardState.busy = '';
      wizardSetError(new Error(
        `Còn ${missingWhy} câu chưa có “Giải thích:”. Thêm dòng “Giải thích: …” cho mỗi câu rồi thử lại — hệ thống không tự viết lời giải thay giáo viên.`
      ));
      render();
      return;
    }
    const config = wizardConfigForImportedQuestions(target);
    // Questions parsed from text are already `GameQuestion`s, which is exactly the
    // arena/subject shape, so arena needs no conversion at all.
    const source = wizardImportedSourceDraft(usable);
    let draft = target === 'arena' ? source : null;
    if (!draft) {
      const converted = await window.eduGame.convertLessonDraft({ draft: source, target, config });
      draft = converted && converted.draft ? converted.draft : null;
      if (draft && converted.gaps && converted.gaps.length) {
        wizardSetNotice(`Đã chuyển ${converted.converted} câu. Phần chưa chuyển được: ${converted.gaps.map(gap => gap.reason).join(' ')}`);
      }
    }
    if (!draft) {
      wizardState.busy = '';
      wizardSetError(new Error('Không chuyển được câu hỏi sang thể loại này. Ghép cặp và Tình huống cần nội dung khác; Giải mã kho báu cần bối cảnh và mô tả nhiệm vụ.'));
      render();
      return;
    }
    wizardState.config = wizardClampImportedConfig(draft, config);
    wizardState.draft = draft;
    wizardState.draftSource = 'imported-questions';
    wizardState.draftOrigin = 'source';
    // The genre is now part of the saved project, so step 3 (if the teacher goes back
    // there) shows it as chosen and the counts of that genre.
    wizardState.selectedGameType = target;
    wizardState.selectedRecommendationId = null;
    // #117 (teacher's request): the questions already are the game, so the run is
    // finished here — the content is built locally from the draft (no model, no
    // Fast/Thinking choice) and step 5 offers "Lưu vào thư viện" as its only
    // forward action. The project must be persisted first: the main process attaches
    // the game to the stored project.
    await wizardSaveProject('configure');
    const game = await wizardBuildGameAfterSave(target, draft, config);
    if (!game) {
      wizardState.busy = '';
      wizardSetError(new Error('Câu hỏi đã sẵn sàng nhưng hệ thống chưa tạo được trò chơi từ đó. Hãy thử lại hoặc báo lỗi kèm mã dự án.'));
      render();
      return;
    }
    wizardState.gameSnapshot = game;
    wizardState.gameId = game.id || null;
    wizardState.quality = null;
    wizardState.context = null;
    wizardState.step = 'generate';
    await wizardSaveProject('generate');
    // Missing explanations were rejected above, so reaching here means every question
    // is complete: no issue can remain.
    const skipped = (wizardState.parsedQuestions || []).length - usable.length;
    // #117: the game is built, so the wizard is already at the finishing step; the
    // teacher can save it right away or adjust the game information first.
    wizardSetNotice(`Đã tạo trò chơi từ ${usable.length} câu${skipped > 0 ? `, bỏ qua ${skipped} câu không tương thích hoặc đang xem lại` : ''} — không dùng AI. Kiểm tra thông tin rồi bấm “Lưu vào thư viện”.`);
  } catch (error) {
    wizardSetError(error);
  }
  wizardState.busy = '';
  render();
}

/**
 * #115 branch B in step 1 ("Phân tích & thêm câu hỏi"): the analyse pipeline runs as
 * usual on the document, and the recognized bank is kept next to it as the source of
 * truth for which genre fits. The genre is still the teacher's to change in step 3;
 * `draftOrigin` only records that the questions started from the bank.
 */
async function wizardKeepImportedAndAnalyze() {
  if (wizardState.busy) return;
  if (!(wizardState.parsedQuestions || []).length) await wizardClassifyInput();
  wizardState.draftOrigin = 'source';
  wizardState.importedMode = false;
  // #117: this run uses the model later, so the built-from-bank marker must not
  // survive here — it would hide the Fast/Thinking choice on a run that needs it.
  wizardState.draftSource = null;
  wizardState.gameSnapshot = null;
  wizardState.gameId = null;
  return wizardInputNextLesson();
}

/**
 * #117: builds the playable game from the draft already in state, through the same
 * local pipeline the model path uses (`lesson:generate` on a project whose draft is
 * `imported-questions`). No model is called; a grid question bank becomes a quiz
 * game (arena and race both play it), any other genre keeps its own template.
 */
async function wizardBuildGameAfterSave(target, draft, config) {
  // Kept in its own function so the conversion never runs inside the block that also
  // awaits the save: the call site reads "save, then build", and a failure here cannot
  // be mistaken for a failed save.
  if (!draft) return null;
  const saved = await window.eduGame.generateLessonDraft({
    projectId: wizardState.projectId,
    requestId: wizardNewRequestId('bank'),
    mode: config.generationMode || 'fast',
    regenerate: false,
    localOnly: true
  });
  if (saved && saved.project) {
    wizardState.projectId = saved.project.id;
    if (saved.project.draft) wizardState.draft = saved.project.draft;
  }
  if (draft.gameType === 'arena' && saved && saved.game) return saved.game;
  // Any other genre is a different template: build it from its converted draft with the
  // same pure converter the "change genre" path uses.
  const converted = await window.eduGame.convertLessonDraft({ draft, target: draft.gameType, config });
  return converted && converted.game ? converted.game : (saved && saved.game ? saved.game : null);
}

/**
 * #117: copies the teacher's game information from the configuration onto the game
 * built from the bank, so the library entry carries what they typed.
 */
function wizardApplyConfigToGame(game) {
  const config = wizardState.config;
  if (!game || !config) return game;
  const text = value => String(value === undefined || value === null ? '' : value);
  return {
    ...game,
    title: text(config.title).trim() || game.title,
    subject: text(config.subject).trim() || game.subject,
    grade: text(config.grade).trim() || game.grade,
    topic: text(config.topic).trim() || game.topic
  };
}

/** Branch A of #115: reuse the recognised bank for `gameType`, skipping the model. */
async function wizardStartGameFromBank(gameType) {
  wizardState.draftOrigin = 'source';
  wizardState.importedMode = true;
  return wizardUseImportedQuestions(gameType || wizardRecommendedGame() || 'arena');
}

/** Branch B of #115: analyse the document, keeping the recognised bank as the source. */
async function wizardAnalyzeWithBank() {
  return wizardKeepImportedAndAnalyze();
}

/** Marks one recognised question as teacher-written (`'source'`) or AI-added (`'ai'`). */
function wizardSetImportedOrigin(itemId, origin) {
  if (origin !== 'source' && origin !== 'ai') return;
  if (!itemId) return;
  const item = (wizardState.parsedQuestions || []).find(entry => entry.question && entry.question.id === itemId);
  if (!item) return;
  item.origin = origin;
  // A question the model wrote is complete by construction, so the source status no
  // longer applies to it.
  if (origin === 'ai') {
    item.status = 'ready';
    item.warnings = [];
  }
}

/** Questions by origin for the step-3 summary (`'source'` bank vs `'ai'` additions). */
function wizardQuestionOriginCounts() {
  const parsed = wizardState.parsedQuestions || [];
  return {
    source: parsed.filter(item => item.origin !== 'ai').length,
    ai: parsed.filter(item => item.origin === 'ai').length
  };
}

/** Match auto-generated counts to the number of imported items (no content change). */
function wizardClampImportedConfig(draft, config) {
  const count = Array.isArray(draft.questions) ? draft.questions.length : Array.isArray(draft.stages) ? draft.stages.length : 0;
  if (!count) return config;
  if (config.gameType === 'arena') return { ...config, questionCount: wizardClamp(count, 1, 30) };
  if (config.gameType === 'treasure') return { ...config, stageCount: wizardClamp(count, 2, 30) };
  if (config.gameType === 'race') return { ...config, maxRounds: wizardClamp(count, 4, 7) };
  return config;
}

/** Turns the current wizard state into a `GameProject` row for `project:save-draft`. */
function wizardBuildProject(step) {
  const s = wizardState;
  const config = s.config || null;
  // The store requires `config.gameType === draft.gameType` and rejects the whole
  // project otherwise. Changing genre clears the draft (see
  // `wizardDiscardGeneratedContent`); this is the last-resort guard so a stale
  // pair can never block a save.
  const staleContent = Boolean(config && s.draft && config.gameType !== s.draft.gameType);
  const effectiveStep = staleContent && step === 'done' ? 'generate' : step;
  const title = (config && config.title) || (s.analysis && s.analysis.topic) || s.documentName || 'Dự án mới';
  return {
    id: s.projectId,
    schemaVersion: 1,
    status: effectiveStep === 'done' ? 'ready' : s.analysis ? 'review' : 'draft',
    step: effectiveStep || s.step,
    title,
    description: (s.analysis && s.analysis.topic) || '',
    tags: ['AI local'],
    sourceName: s.documentName || '',
    lesson: s.documentId
      ? { documentId: s.documentId, name: s.documentName || '', characters: (s.documentMeta && s.documentMeta.characters) || 0 }
      : null,
    analysisId: s.analysisId || null,
    recommendationId: s.selectedRecommendationId || null,
    config,
    draft: staleContent ? null : s.draft || null,
    // Provenance: only a teacher-authored question bank may skip the model later.
    ...(s.draftSource ? { draftSource: s.draftSource } : {}),
    gameSnapshot: staleContent ? null : s.gameSnapshot || null,
    gameId: staleContent ? null : s.gameId || null,
    createdAt: s.createdAt || wizardNow(),
    updatedAt: wizardNow()
  };
}

function wizardNewProjectId() {
  return `project_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Persists the wizard as a draft. Returns the stored project (or null on failure). */
async function wizardSaveProject(step) {
  if (!wizardState.projectId) {
    wizardState.projectId = wizardNewProjectId();
    wizardState.createdAt = wizardNow();
  }
  const project = wizardBuildProject(step);
  const saved = await window.eduGame.saveProjectDraft(project);
  wizardState.projectId = saved.id;
  wizardState.createdAt = saved.createdAt || wizardState.createdAt;
  wizardState.projects = await window.eduGame.listProjects();
  wizardState.projectsLoaded = true;
  return saved;
}

/**
 * True when the generated game is already a row in the library, so the copy in
 * the project can be dropped without losing the teacher's work. Generation sets
 * `gameId` before anything is saved, so the library is the only reliable check.
 */
function wizardGameSavedToLibrary() {
  return Boolean(wizardState.gameId)
    && Array.isArray(state.db.games)
    && state.db.games.some(game => game.id === wizardState.gameId);
}

/**
 * Drops the generated content (draft, snapshot, quality report, retrieval
 * summary). Used when the teacher switches genre: content belongs to one genre
 * and the store refuses a project whose config and draft disagree.
 */
function wizardDiscardGeneratedContent() {
  wizardState.draft = null;
  // Provenance goes with the draft: a stale flag would let an AI draft skip the model.
  wizardState.draftSource = null;
  wizardState.gameSnapshot = null;
  wizardState.gameId = null;
  wizardState.quality = null;
  wizardState.context = null;
  wizardState.lessonStage = '';
  wizardState.lessonRepaired = false;
}

// ---------------------------------------------------------------------------
// O12 — predicted item count (document length + analysis richness + model/mode)
// ---------------------------------------------------------------------------

/** Config key that holds the item count for each genre, or '' for none. */
function wizardCapacityCountKey(gameType) {
  return {
    arena: 'questionCount',
    scenario: 'situationCount',
    matching: 'pairCount',
    treasure: 'stageCount',
    race: 'maxRounds'
  }[gameType] || '';
}

/** Vietnamese unit used by the count hints/warnings for each genre. */
function wizardItemUnit(gameType) {
  return {
    arena: 'câu hỏi',
    scenario: 'tình huống',
    matching: 'cặp ghép',
    treasure: 'chặng',
    race: 'câu hỏi'
  }[gameType] || 'mục';
}

let wizardCapacityInflight = '';

/**
 * Asks the main process to predict a sensible item count for the current
 * document + analysis + model + mode (no AI call). The result is advisory and
 * cached per project/genre/mode; `countTouched` keeps a teacher's own number.
 */
async function wizardEnsureCapacity() {
  const s = wizardState;
  const config = s.config;
  if (!config || !s.projectId || typeof window.eduGame.estimateLessonCapacity !== 'function') return;
  const key = `${s.projectId}|${config.gameType}|${config.generationMode}`;
  if (s.capacity && s.capacity.key === key) return;
  if (wizardCapacityInflight === key) return;
  wizardCapacityInflight = key;
  try {
    const estimate = await window.eduGame.estimateLessonCapacity({
      projectId: s.projectId,
      gameType: config.gameType,
      mode: config.generationMode
    });
    if (!estimate) return;
    if (!wizardState.config || `${wizardState.projectId}|${wizardState.config.gameType}|${wizardState.config.generationMode}` !== key) return;
    wizardState.capacity = { ...estimate, key };
    if (typeof wizardApplyCapacity === 'function') wizardApplyCapacity();
  } catch {
    // Prediction is an optimisation; never block configuration or generation.
  } finally {
    if (wizardCapacityInflight === key) wizardCapacityInflight = '';
  }
}

/**
 * True when generated content exists that closing the window would destroy.
 *
 * Spec §4/§12: a teacher must not lose work by closing or navigating. Content
 * already in the library is redundant (the library row survives), so it does not
 * count as dirty — otherwise a teacher who finished correctly could not close.
 *
 * Deliberately narrower than "anything typed": in-flight text lives in the
 * wizard's own fields and is recoverable from the project row on reload, while
 * a generated draft costs minutes of AI/local work and cannot be reconstructed.
 */
function wizardHasUnsavedDraft() {
  return Boolean(wizardState.draft) && !wizardGameSavedToLibrary();
}
