// @ts-nocheck -- wizard/state/actions.ts — hành động cuối wizard: đổi thể loại, lưu project/thư viện, mở project và mở giáo án đã lưu (split từ features/wizard/state.ts, DECISIONS #150).
/**
 * Genre changes invalidate the draft. Saved-to-library content is redundant (the
 * game stays playable in the library) and is dropped silently; an unsaved draft
 * costs minutes of generation, so ask first.
 */
function wizardConfirmGenreChange() {
  if (!wizardState.draft) return true;
  if (wizardGameSavedToLibrary()) return true;
  const label = wizardGameMeta(wizardState.draft.gameType).label;
  return window.confirm(
    `Nội dung “${label}” chưa được lưu vào Thư viện trò chơi. Đổi thể loại sẽ bỏ nội dung này. Tiếp tục?`
  );
}

/**
 * Change genre while keeping what can be kept (update_quy_trinh §4, §7.10).
 *
 * Before this, picking another genre discarded the whole draft and the next
 * "Tạo nội dung" regenerated everything from the model. Now the existing draft is
 * converted locally first: question-shaped content (arena ⇄ treasure ⇄ race) carries
 * over verbatim, and only what cannot be converted is reported. The teacher is asked
 * once, and only when there is a real gap — not for every genre click.
 *
 * Returns a discriminated outcome, NOT a draft-or-null, because "the teacher pressed
 * Cancel" and "there is a new draft" used to be indistinguishable: the old code
 * returned the *source* draft on cancel, the caller stored it against the new genre,
 * and the stale-content guard then deleted the teacher's work.
 *
 *   { kind: 'converted', draft }  use this draft for the new genre
 *   { kind: 'restart' }           discard and let the model regenerate
 *   { kind: 'cancelled' }         change nothing at all
 */
async function wizardConvertOrDiscardForGenre(target) {
  const source = wizardState.draft;
  if (!source || source.gameType === target) return { kind: 'converted', draft: source || null };
  if (wizardGameSavedToLibrary()) return { kind: 'converted', draft: source };
  const config = wizardState.config && wizardState.config.gameType === target
    ? wizardState.config
    : wizardConfigForImportedQuestions(target);
  let converted = null;
  try {
    converted = await window.eduGame.convertLessonDraft({ draft: source, target, config });
  } catch {
    // A failed conversion is treated like "cannot convert": never block the click.
    converted = null;
  }
  const targetLabel = wizardGameMeta(target).label;
  if (converted && converted.draft) {
    if (!converted.complete) {
      // One dialog, listing exactly what could not be carried over (§4.4) and — for
      // update_quy_trinh_2 §5 Path C — what AI would have to write if the teacher
      // chose to regenerate instead.
      const gaps = converted.gaps.map(gap => `• ${gap.item}: ${gap.reason}`).join('\n');
      const keep = window.confirm(
        `Đã chuyển ${converted.converted} mục sang “${targetLabel}” và giữ nguyên nội dung gốc.\n\n` +
        `Phần chưa chuyển được (AI sẽ phải viết thêm nếu chọn tạo mới):\n${gaps}\n\n` +
        'OK: dùng phần đã chuyển (phần thiếu bổ sung sau trong trình chỉnh sửa).\n' +
        'Cancel: giữ nguyên thể loại cũ, không mất nội dung nào.'
      );
      if (!keep) return { kind: 'cancelled' };
    }
    return { kind: 'converted', draft: converted.draft };
  }
  // Nothing convertible: ask whether to let AI write the whole thing. Cancel keeps the
  // old genre and the old draft untouched.
  const reasons = converted && converted.gaps.length
    ? `\n\nVì sao không chuyển được:\n${converted.gaps.map(gap => `• ${gap.reason}`).join('\n')}`
    : '';
  const restart = window.confirm(
    `Không chuyển trực tiếp được nội dung “${wizardGameMeta(source.gameType).label}” sang “${targetLabel}”.${reasons}\n\n` +
    `Tạo mới bằng AI sẽ khiến AI viết lại toàn bộ nội dung cho “${targetLabel}”. Nội dung gốc vẫn được giữ trong dự án trước khi thay bản nháp.\n\n` +
    'OK: để AI viết bản mới. Cancel: giữ nguyên như hiện tại.'
  );
  return restart ? { kind: 'restart' } : { kind: 'cancelled' };
}

/**
 * Starts a second project from the same lesson without touching the model.
 *
 * The lesson document and its analysis are carried over by id, while the
 * game-specific fields are cleared. The teacher therefore lands on the genre
 * step with the previous analysis/recommendations already available; changing
 * genre or config only affects generation, not analysis.
 */
async function wizardStartAnotherGame() {
  if (wizardState.busy) return undefined;
  if (!wizardState.analysisId || !wizardState.analysis) {
    wizardSetError(new Error('Chưa có kết quả phân tích để dùng lại. Hãy phân tích giáo án trước.'));
    if (state.page === 'create-wizard') render();
    return undefined;
  }
  const lesson = {
    documentId: wizardState.documentId,
    documentName: wizardState.documentName,
    documentMeta: wizardState.documentMeta,
    text: wizardState.text,
    analysis: wizardState.analysis,
    analysisOriginal: wizardState.analysisOriginal,
    analysisId: wizardState.analysisId,
    recommendations: (wizardState.recommendations || []).slice()
  };
  wizardReset();
  Object.assign(wizardState, {
    documentId: lesson.documentId,
    documentName: lesson.documentName,
    documentMeta: lesson.documentMeta,
    text: lesson.text,
    analysis: lesson.analysis,
    analysisOriginal: lesson.analysisOriginal,
    analysisId: lesson.analysisId,
    recommendations: lesson.recommendations,
    step: 'recommend',
    busy: 'save'
  });
  wizardClearMessages();
  if (state.page === 'create-wizard') render();
  try {
    await wizardSaveProject('recommend');
    // Recommendations are deterministic (no model call). Rebuild them only if
    // this analysis has never produced a set, so the teacher still sees genres.
    if (!wizardState.recommendations.length) {
      try {
        // No projectId: this only fills the deterministic suggestion list. The
        // new project stays at `recommend` until the teacher picks a genre.
        const result = await window.eduGame.recommendGames({
          analysisId: wizardState.analysisId,
          requestId: wizardNewRequestId('recommend')
        });
        wizardState.recommendations = result.recommendations || [];
      } catch {
        // The recommendation step has its own retry button.
      }
    }
    wizardSetNotice('Đã tạo dự án mới từ cùng giáo án. Phân tích được dùng lại — không gọi AI phân tích lại.');
    toast('Đã tạo dự án mới từ cùng giáo án.');
  } catch (error) {
    wizardSetError(error);
    toast(wizardErrorText());
  }
  wizardState.busy = '';
  if (state.page === 'create-wizard') render();
  return undefined;
}

/**
 * Step-5 save. It must save the *current* step, not `configure`: the old button
 * reused the configure-save helper, which rewound the persisted project every
 * time the teacher saved after generating.
 */
async function wizardSaveCurrentProject() {
  if (wizardState.busy) return undefined;
  wizardState.busy = 'save';
  wizardClearMessages();
  render();
  try {
    // Do not rewind a project whose game was already saved to the library.
    const savedInLibrary = wizardGameSavedToLibrary();
    const step = savedInLibrary ? 'done' : wizardState.step === 'edit' ? 'generate' : wizardState.step;
    await wizardSaveProject(step);
    wizardSetNotice(`Đã lưu tiến trình dự án lúc ${new Date().toLocaleTimeString('vi-VN')}.`);
    // The status area is above the long step-5 body, so the teacher may not see
    // the inline notice from the bottom action row. Confirm with a toast too.
    toast('Đã lưu tiến trình dự án.');
  } catch (error) {
    wizardSetError(error);
    toast(wizardErrorText());
  }
  wizardState.busy = '';
  render();
  return undefined;
}

/**
 * Explicit step-5 "save to library". The adapter-validated snapshot is the only
 * object written; the project row keeps its id and points at the library game so
 * reopening the project can continue from the same content.
 */
async function wizardSaveGameToLibrary() {
  if (wizardState.busy) return undefined;
  const game = wizardState.gameSnapshot;
  if (!game) {
    toast('Chưa có nội dung trò chơi để lưu. Hãy tạo nội dung trước.');
    return undefined;
  }
  wizardState.busy = 'save-game';
  wizardClearMessages();
  render();
  try {
    const saved = await window.eduGame.saveGame(game);
    wizardState.gameSnapshot = saved;
    wizardState.gameId = saved.id;
    await wizardSaveProject('done');
    if (typeof refreshDb === 'function') await refreshDb();
    wizardSetNotice(`Đã lưu “${saved.title}” vào Thư viện trò chơi lúc ${new Date().toLocaleTimeString('vi-VN')}. Bạn có thể chơi thử hoặc quay lại chỉnh sửa.`);
    toast(`Đã lưu “${saved.title}” vào Thư viện trò chơi.`);
  } catch (error) {
    wizardSetError(error);
    toast(wizardErrorText());
  }
  wizardState.busy = '';
  render();
  return undefined;
}

async function wizardRefreshProjects() {
  try {
    wizardState.projects = await window.eduGame.listProjects();
  } catch {
    wizardState.projects = [];
  }
  wizardState.projectsLoaded = true;
}

/** Reopens a draft from the store without calling AI. */
async function wizardOpenProject(projectId) {
  const project = await window.eduGame.getProject(projectId);
  if (!project) throw new Error('Không tìm thấy dự án để mở.');
  wizardReset();
  wizardState.projectId = project.id;
  wizardState.createdAt = project.createdAt;
  wizardState.gameId = project.gameId || null;
  wizardState.documentId = project.lesson ? project.lesson.documentId : null;
  wizardState.documentName = project.lesson ? project.lesson.name : (project.sourceName || '');
  wizardState.documentMeta = project.lesson ? { characters: project.lesson.characters, ext: '', sizeBytes: 0 } : null;
  wizardState.config = project.config || null;
  wizardState.draft = project.draft || null;
  wizardState.gameSnapshot = project.gameSnapshot || null;
  // O2: recompute the advisory quality report locally (no model call).
  wizardState.quality = null;
  // O3: the retrieval summary belongs to the last generation, not the project.
  wizardState.context = null;
  wizardState.capacity = null;
  // Reopened projects are already settled: a saved draft means the teacher
  // accepted its item count, so never rewrite it automatically.
  wizardState.countTouched = Boolean(project.draft || project.gameSnapshot);
  wizardState.quick = null;
  if (project.draft && project.config && typeof window.eduGame.checkLessonQuality === 'function') {
    try {
      wizardState.quality = await window.eduGame.checkLessonQuality({ projectId: project.id });
    } catch {
      wizardState.quality = null;
    }
  }
  wizardState.analysisId = project.analysisId || null;
  wizardState.selectedRecommendationId = project.recommendationId || null;

  if (project.lesson) {
    try {
      const document = await window.eduGame.getLessonDocument(project.lesson.documentId);
      if (document) {
        wizardState.text = document.text || '';
        wizardState.documentMeta = { characters: document.characters, ext: document.ext, sizeBytes: document.sizeBytes };
      }
    } catch {
      // The project/draft/game snapshot is still usable even when the source file
      // was moved or deleted; explain that instead of failing the whole open.
      wizardState.text = '';
      wizardState.documentMeta = { characters: project.lesson.characters || 0, ext: '', sizeBytes: 0 };
      wizardSetNotice('Không đọc được tệp giáo án nguồn (có thể đã bị di chuyển hoặc xoá). Bạn vẫn có thể xem bản nháp đã lưu, nhưng cần nhập lại tệp nếu muốn phân tích lại.');
    }
  }
  if (project.analysisId) {
    wizardState.analysis = await window.eduGame.getLessonAnalysis(project.analysisId);
    wizardState.analysisOriginal = wizardState.analysis;
    wizardState.recommendations = await window.eduGame.getLessonRecommendations(project.analysisId);
    if (project.recommendationId) {
      const chosen = wizardState.recommendations.find(item => item.id === project.recommendationId);
      wizardState.selectedGameType = chosen ? chosen.gameType : (project.config ? project.config.gameType : null);
    }
  }
  wizardState.step = project.step === 'done' || project.step === 'edit' ? 'generate' : project.step;
  return project;
}

/**
 * Loads a saved lesson source (and optionally one of its analyses) without
 * creating a project or calling AI. This is the shared path for "Mở lại" in the
 * Giáo án page; the teacher can review the cached analysis and then start another
 * game from it.
 */
async function wizardLoadSavedLesson(documentId, analysisId) {
  const document = await window.eduGame.getLessonDocument(documentId);
  if (!document) throw new Error('Không tìm thấy tệp giáo án đã lưu. Hãy nhập lại tài liệu nguồn.');
  const analysis = analysisId ? await window.eduGame.getLessonAnalysis(analysisId) : null;
  if (analysisId && (!analysis || analysis.documentId !== document.id)) {
    throw new Error('Không tìm thấy kết quả phân tích của giáo án này.');
  }
  wizardReset();
  wizardState.documentId = document.id;
  wizardState.documentName = document.name || 'giao-an.txt';
  wizardState.documentMeta = {
    characters: document.characters || String(document.text || '').length,
    ext: document.ext || 'txt',
    sizeBytes: document.sizeBytes || 0
  };
  wizardState.text = document.text || '';
  if (analysis) {
    wizardState.analysis = analysis;
    wizardState.analysisOriginal = analysis;
    wizardState.analysisId = analysis.id;
    wizardState.recommendations = await window.eduGame.getLessonRecommendations(analysis.id);
    wizardState.step = 'analyze';
  } else {
    wizardState.step = 'input';
  }
  return { document, analysis };
}

async function wizardOpenSavedLesson(documentId, analysisId) {
  if (wizardState.busy) return undefined;
  wizardState.busy = 'open';
  wizardClearMessages();
  render();
  try {
    const { analysis } = await wizardLoadSavedLesson(documentId, analysisId);
    wizardSetNotice(analysis
      ? 'Đã mở lại giáo án và kết quả phân tích đã lưu. Bạn có thể xem lại rồi chọn thể loại trò chơi.'
      : 'Đã mở lại giáo án đã lưu. Hãy phân tích hoặc tiếp tục tạo trò chơi.');
  } catch (error) {
    wizardSetError(error);
  }
  wizardState.busy = '';
  render();
  return undefined;
}

/**
 * Starts a new game from an already-analysed lesson. A new project row is created
 * at the category step; the analysis is reused exactly as-is (zero AI calls).
 */
async function wizardCreateGameFromSavedLesson(documentId, analysisId) {
  if (wizardState.busy) return undefined;
  wizardState.busy = 'open';
  wizardClearMessages();
  render();
  try {
    const { analysis } = await wizardLoadSavedLesson(documentId, analysisId);
    if (!analysis) throw new Error('Giáo án này chưa có kết quả phân tích. Hãy phân tích trước khi tạo trò chơi.');
    if (!wizardState.recommendations.length) {
      await window.eduGame.recommendGames({ analysisId: analysis.id });
      wizardState.recommendations = await window.eduGame.getLessonRecommendations(analysis.id);
    }
    wizardState.step = 'recommend';
    wizardState.projectId = wizardNewProjectId();
    wizardState.createdAt = wizardNow();
    await wizardSaveProject('recommend');
    wizardSetNotice('Đã tạo dự án mới từ kết quả phân tích cũ (không gọi AI). Hãy chọn thể loại trò chơi.');
  } catch (error) {
    wizardSetError(error);
  }
  wizardState.busy = '';
  render();
  return undefined;
}
