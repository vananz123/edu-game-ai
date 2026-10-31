// @ts-nocheck -- renderer UI logic; workflow contracts are typed in src/shared/lesson-types.ts.
/**
 * Wizard step 5 — generate the game content with the local model, then hand the
 * teacher the normal editor. Nothing here writes `EducationalGame` by hand: the
 * main process validates the draft, runs it through the single adapter and
 * returns a snapshot, which the editor then edits/saves like any other game.
 */

function wizardConfigSummaryRows(config) {
  if (!config) return [];
  const rows = [
    ['Thể loại', wizardGameMeta(config.gameType).label],
    ['Thời lượng', `${config.durationMinutes} phút`],
    ['Độ khó', config.difficulty],
    ['Hình thức', config.playMode === 'team' ? 'Đội nhóm' : 'Cá nhân'],
    ['Chế độ tạo', config.generationMode === 'deep' ? 'Thinking (kỹ)' : 'Fast (nhanh)']
  ];
  if (config.gameType === 'arena') rows.push(['Số câu hỏi', String(config.questionCount)]);
  if (config.gameType === 'scenario') rows.push(['Số tình huống', String(config.situationCount)]);
  if (config.gameType === 'matching') rows.push(['Số cặp ghép', String(config.pairCount)]);
  if (config.gameType === 'treasure') rows.push(['Số chặng', String(config.stageCount)]);
  if (config.gameType === 'race') rows.push(['Đường đua', `${config.trackLength} ô · ${config.teamCount} đội`]);
  return rows;
}

/** What the model actually produced, so the teacher sees real numbers, not the config. */
function wizardGeneratedSummaryRows(game) {
  if (!game) return [];
  const rows = [['Tên trò chơi', game.title || '']];
  if (game.template === 'quiz') rows.push(['Số câu hỏi', String((game.questions || []).length)]);
  if (game.template === 'scenario') rows.push(['Số tình huống', String((game.questions || []).length)]);
  if (game.template === 'matching') rows.push(['Số cặp ghép', String(((game.matchingGame || {}).pairs || []).length)]);
  if (game.template === 'treasure-hunt') rows.push(['Số chặng', String(((game.treasureHunt || {}).stages || []).length)]);
  if (game.template === 'race') {
    const race = game.race || {};
    rows.push(['Đường đua', `${race.trackLength || 0} ô · ${((race.teams || []).length)} đội`]);
    rows.push(['Số câu hỏi', String((race.questions || []).length)]);
  }
  rows.push(['Điểm tối đa (tham khảo)', String(wizardGeneratedMaxPoints(game))]);
  return rows;
}

function wizardGeneratedMaxPoints(game) {
  const sum = list => list.reduce((total, item) => total + (Number(item && item.points) || 0), 0);
  if (game.template === 'matching') {
    const matching = game.matchingGame || {};
    return ((matching.pairs || []).length * (Number(matching.pointsPerPair) || 0)) + (Number(matching.completionBonus) || 0);
  }
  if (game.template === 'treasure-hunt') {
    const treasure = game.treasureHunt || {};
    return sum(treasure.stages || []) + (Number(treasure.journeyBonus) || 0);
  }
  return sum(game.questions || []);
}

function wizardSummaryGrid(rows) {
  if (!rows.length) return '';
  return `<div class="grid gap-[6px] bg-[#f8f9fc] border border-line rounded-[10px] p-[14px]">${rows.map(([label, value]) => `<div class="flex justify-between gap-[12px] text-[12px]"><span class="text-[#788196]">${escapeHtml(label)}</span><strong class="text-right">${escapeHtml(String(value))}</strong></div>`).join('')}</div>`;
}

/**
 * O2: advisory content-quality panel. Pure data from the main process (no model
 * call). Errors are surfaced but do not block the editor: structural validity is
 * already enforced by the adapter + legacy validators, and the teacher must stay
 * able to fix content by hand (DECISIONS #21).
 */
function wizardQualityPanel(report) {
  if (!report) return '';
  const issues = report.issues || [];
  if (!issues.length) {
    return `<div class="field-hint" data-wizard-quality="ok">✓ Đã kiểm tra chất lượng: không thấy câu trùng, đáp án thiếu hay liên kết hỏng.</div>`;
  }
  const errors = issues.filter(issue => issue.severity === 'error');
  const warnings = issues.filter(issue => issue.severity === 'warning');
  const list = (items, color) => `<ul class="list-disc pl-[18px] text-[12px] space-y-[3px]">${items.slice(0, 6).map(issue => `<li class="${color}">${escapeHtml(issue.message)}</li>`).join('')}${items.length > 6 ? `<li class="text-[#788196]">… và ${items.length - 6} mục khác</li>` : ''}</ul>`;
  return `<div class="field mt-[10px]" data-wizard-quality="${errors.length ? 'errors' : 'warnings'}">
    <div class="flex items-center gap-[8px] mb-[6px] flex-wrap">
      <strong class="text-[12px]">Kiểm tra chất lượng nội dung</strong>
      <span class="tag">${errors.length} lỗi · ${warnings.length} cảnh báo</span>
    </div>
    ${errors.length ? list(errors, 'text-[#b3261e]') : ''}
    ${warnings.length ? `<div class="${errors.length ? 'mt-[4px]' : ''}">${list(warnings, 'text-[#8a6d00]')}</div>` : ''}
    <div class="field-hint">${errors.length
      ? 'Những lỗi này có thể làm trò chơi chấm sai hoặc chạy sai. Bạn vẫn mở được trình chỉnh sửa để sửa tay, hoặc tạo lại nội dung.'
      : 'Đây là gợi ý để nội dung chặt chẽ hơn — không chặn việc lưu hay chơi thử.'}</div>
  </div>`;
}

/**
 * O9: a valid draft can still be short — the local model sometimes stops before
 * the configured item count. Surface the exact numbers and a one-click retry
 * above the advisory list. Saving stays allowed (DECISIONS #21); a teacher who
 * prefers to add the missing items by hand can still open the editor.
 */
function wizardShortfallNotice(report, busy, manual) {
  const counts = report && report.counts;
  if (!counts || !counts.requested || !counts.found || counts.found >= counts.requested) return '';
  const missing = counts.requested - counts.found;
  const explanation = manual
    ? 'Bạn đã tự chọn số lượng này, nên bản nháp ngắn hơn cấu hình. Tạo lại để AI soạn đủ, hoặc mở trình chỉnh sửa để tự thêm.'
    : 'AI tạo ít hơn cả mức tối thiểu 4 mục. Hãy tạo lại, giảm yêu cầu hoặc bổ sung thêm tài liệu.';
  return `<div class="field mt-[10px] rounded-[10px] border border-[#e0b13a] bg-[#fff8e1] p-[12px]" data-wizard-shortfall="${counts.found}/${counts.requested}" role="alert">
    <strong class="text-[13px] text-[#7a5a00]">AI mới tạo ${counts.found}/${counts.requested} ${escapeHtml(counts.unit)} — còn thiếu ${missing}.</strong>
    <div class="field-hint mt-[4px]">${escapeHtml(explanation)}</div>
    <button class="btn btn-secondary btn-small mt-[8px]" data-wizard-action="regenerate"${busy ? ' disabled' : ''}>🔄 Tạo lại cho đủ ${counts.requested} ${escapeHtml(counts.unit)}</button>
  </div>`;
}

/**
 * O12 fallback: the predicted count is usually right, but a weak model can still
 * stop early. When the teacher never edited the count and the draft is still in
 * the automatic 4..7 range, save the observed count so the configuration matches
 * the content instead of showing a permanent "AI tạo thiếu" warning. Manual
 * counts and drafts below 4 keep the warning — those are real quality problems.
 */
async function wizardAutoAdjustCount(report) {
  const s = wizardState;
  const config = s.config;
  if (!config || s.countTouched) return;
  const counts = report && report.counts;
  if (!counts || !counts.requested || !counts.found) return;
  if (counts.found >= counts.requested) return;
  if (counts.found < 4 || counts.found > 7) return;
  const key = wizardCapacityCountKey(config.gameType);
  if (!key) return;
  const previous = Number(config[key]);
  if (previous === counts.found) return;
  config[key] = counts.found;
  try {
    await wizardSaveProject('generate');
    if (typeof window.eduGame.checkLessonQuality === 'function') {
      s.quality = (await window.eduGame.checkLessonQuality({ projectId: s.projectId })) || s.quality;
    }
    toast(`AI tạo được ${counts.found} ${counts.unit} — đã tự điều chỉnh cấu hình xuống ${counts.found}.`);
  } catch {
    // If the save fails, keep the original configuration and the warning.
    config[key] = previous;
  }
}

/**
 * O3: transparency about what the model actually read. Not a warning — just so a
 * teacher is not surprised that a long lesson produced questions from one section.
 */
function wizardContextHint(context) {
  if (!context || !context.chunkCount) return '';
  const parts = [`Đã dùng ${context.selectedChunkCount}/${context.chunkCount} đoạn giáo án liên quan`];
  if (context.fallback) parts.push('(chưa khớp chủ đề rõ ràng nên dùng phần đầu giáo án)');
  return `<div class="field-hint" data-wizard-context="1">${escapeHtml(parts.join(' '))}.</div>`;
}

/**
 * O5: per-item regeneration (docs/archive/specs/update-AI-local.txt §5.5). The list is built
 * from the typed draft (not the snapshot) so the position matches the quality
 * report and the `lesson:regenerate-item` payload. One request rewrites one item;
 * every other item (and its id/links) stays untouched.
 *
 * DECISIONS #24: this lives in the wizard, not inside the editor. The editor
 * edits the `EducationalGame` snapshot while regeneration works on the typed
 * draft + project context; keeping it here means one source of truth and no
 * re-snapshotting from the editor. The teacher regenerates, then opens the editor.
 */
function wizardDraftItemList(draft) {
  if (!draft) return [];
  if (draft.gameType === 'scenario') return draft.situations || [];
  if (draft.gameType === 'matching') return draft.pairs || [];
  if (draft.gameType === 'treasure') return draft.stages || [];
  return draft.questions || [];
}

function wizardDraftItemLabel(gameType, position) {
  const units = { arena: 'Câu hỏi', scenario: 'Tình huống', matching: 'Cặp ghép', treasure: 'Chặng', race: 'Câu hỏi' };
  return `${units[gameType] || 'Mục'} ${position}`;
}

function wizardDraftItemPreview(gameType, item) {
  if (!item) return '';
  let text = '';
  if (gameType === 'matching') text = `${item.left || ''} ↔ ${item.right || ''}`;
  else if (gameType === 'treasure') text = `${item.name || ''}${item.question && item.question.prompt ? ` — ${item.question.prompt}` : ''}`;
  else text = item.prompt || '';
  const compact = String(text).replace(/\s+/g, ' ').trim();
  return compact.length > 140 ? `${compact.slice(0, 137)}…` : compact;
}

/**
 * #124: the step-5 list, one card per question, with its picture in the same card.
 *
 * Before this the question text and the artwork were two separate lists ("Từng mục"
 * and "Minh hoạ từng mục") and the teacher had to match them by position — the very
 * thing the user asked to fix ("câu hỏi và ảnh minh phải đi cùng nhau"). The card now
 * holds: the question, its answers (collapsed), the picture, the "Đổi ảnh" /
 * "Tải ảnh lên" actions, and "Tạo lại" — so every decision about one item happens in
 * one place.
 */
function wizardItemCardsPanel(s) {
  const draft = s.draft;
  const items = wizardDraftItemList(draft);
  if (!items.length) return '';
  const gameType = draft.gameType;
  const game = wizardArtGame();
  const mode = wizardArtMode();
  const missing = items.filter(item => !stageIllustrationHtml(wizardArtSource(gameType, item), game)).length;
  const modeHint = mode === 'off'
    ? 'Chế độ “Tắt” đang bật nên khi chơi sẽ không hiện minh hoạ nào. Tải ảnh lên sẽ bật lại minh hoạ cho mục đó.'
    : mode === 'manual'
      ? 'Chế độ “Chọn thủ công” chỉ hiện ảnh bạn chọn — mục chưa chọn sẽ không có hình khi chơi.'
      : 'Chế độ “Tự động”: mục chưa chọn hình sẽ dùng hình theo chủ đề nội dung.';
  return `<div class="field mt-[12px]" data-wizard-item-cards="1">
    <div class="flex items-center gap-[8px] mb-[8px] flex-wrap"><strong class="text-[12px]">Câu hỏi và ảnh minh hoạ</strong><span class="tag">${items.length} mục</span>${missing ? `<span class="tag">${missing} mục chưa có hình</span>` : ''}</div>
    <div class="wizard-item-list">${items.map((item, index) => wizardItemCard(s, gameType, item, index + 1, index)).join('')}</div>
    <div class="field-hint">${escapeHtml(modeHint)} Ảnh lưu trên máy này; trò chơi vẫn chơi được khi không có mạng.</div>
  </div>`;
}

/** One question with its picture: the unit the teacher thinks in. */
function wizardItemCard(s, gameType, item, position, index) {
  const game = wizardArtGame();
  const open = s.openArtItem === `${gameType}:${position}`;
  const source = wizardArtSource(gameType, item);
  const assetId = typeof source.illustrationAssetId === 'string' ? source.illustrationAssetId : '';
  const isCustom = /^ci-[a-f0-9]{32}$/u.test(assetId);
  const rawCategory = typeof source.contentCategory === 'string' ? source.contentCategory.trim() : '';
  const category = WIZARD_ART_CATEGORIES.some(([value]) => value === rawCategory) ? rawCategory : '';
  const asset = wizardArtSelectedAsset(gameType, item);
  const assetOptions = [
    `<option value=""${isCustom ? '' : ' selected'}>Theo chủ đề nội dung</option>`,
    ...wizardArtSceneCategories().map(id => `<option value="${escapeHtml(id)}-scene"${!isCustom && asset === `${id}-scene` ? ' selected' : ''}>${escapeHtml(wizardArtCategoryLabel(id))}</option>`),
    // An uploaded picture is listed so the select shows the true state instead of
    // "Theo chủ đề nội dung" while the card draws the upload.
    ...(isCustom ? [`<option value="${escapeHtml(assetId)}" selected>Ảnh tự tải lên (giữ nguyên)</option>`] : [])
  ].join('');
  const categoryOptions = [
    `<option value="">Tự nhận diện theo nội dung</option>`,
    ...WIZARD_ART_CATEGORIES.map(([id, label]) => `<option value="${escapeHtml(id)}"${category === id ? ' selected' : ''}>${escapeHtml(label)}</option>`)
  ].join('');
  const badge = isCustom
    ? 'Ảnh tự tải lên'
    : asset ? wizardArtCategoryLabel(asset.slice(0, -'-scene'.length)) : (category ? wizardArtCategoryLabel(category) : 'Tự động');
  const disabled = s.artBusy ? ' disabled' : '';
  const answers = wizardDraftItemAnswers(gameType, item);
  return `<article class="wizard-item-card${open ? ' is-open' : ''}" data-wizard-item-card="${position}" data-wizard-art-card="${position}">
    <div class="wizard-item-main">
      <div class="wizard-item-text">
        <div class="wizard-item-label">${escapeHtml(wizardDraftItemLabel(gameType, position))}</div>
        <div class="wizard-item-prompt">${escapeHtml(wizardDraftItemPreview(gameType, item))}</div>
        ${answers.length ? `<ul class="wizard-item-answers">${answers.map(answer => `<li${answer.correct ? ' class="is-correct"' : ''}>${escapeHtml(answer.text)}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="wizard-item-art">
        ${wizardArtThumb(gameType, item, game, asset)}
        <div class="wizard-item-art-badge">${escapeHtml(badge)}</div>
      </div>
    </div>
    <div class="wizard-item-actions">
      <button class="btn btn-secondary btn-small" data-wizard-action="upload-art" data-item-index="${position}"${disabled} title="Chọn một ảnh PNG/JPG/WEBP/GIF từ máy">📷 Tải ảnh lên</button>
      <button class="btn btn-secondary btn-small" data-wizard-action="toggle-art" data-item-index="${position}"${disabled}>${open ? 'Đóng' : '🖼 Đổi hình có sẵn'}</button>
      ${isCustom || asset || category ? `<button class="btn btn-secondary btn-small" data-wizard-action="reset-art" data-item-index="${position}"${disabled}>Tự động</button>` : ''}
      <button class="btn btn-secondary btn-small ml-auto" data-wizard-action="regenerate-item" data-item-index="${position}"${s.busy ? ' disabled' : ''} title="Viết lại nội dung câu này, giữ nguyên các câu còn lại">🔄 Tạo lại câu</button>
    </div>
    ${open ? `<div class="wizard-art-pick">
      <label>HÌNH MINH HOẠ CÓ SẴN</label>
      <select data-wizard-art-asset data-item-index="${position}"${disabled}>${assetOptions}</select>
      <label>CHỦ ĐỀ NỘI DUNG</label>
      <select data-wizard-art-category data-item-index="${position}"${disabled}>${categoryOptions}</select>
      <div class="wizard-art-hint">Hoặc tải ảnh từ máy bằng “📷 Tải ảnh lên”. Chọn xong là lưu ngay, không gọi AI và không đổi nội dung câu hỏi.</div>
    </div>` : ''}
  </article>`;
}

/**
 * The answers of one item, with the correct one flagged — so the picture sits next to
 * the question it helps, not next to a title only.
 */
function wizardDraftItemAnswers(gameType, item) {
  const options = item && Array.isArray(item.options) ? item.options : [];
  if (!options.length) return [];
  const correctId = String((item && item.correctOptionId) || '');
  return options
    .map(option => ({
      text: String((option && option.text) || ''),
      correct: Boolean(correctId) && String(option && option.id) === correctId
    }))
    .filter(answer => answer.text);
}

/**
 * Thumbnail for one item: the real play-surface SVG when there is something to
 * draw, otherwise an honest "no artwork" tile (never a stand-in that looks like art).
 */
const WIZARD_ART_CATEGORY_LABELS = {
  general: 'Tổng quát',
  animals: 'Động vật',
  plants: 'Thực vật',
  space: 'Vũ trụ',
  'human-body': 'Cơ thể người',
  transport: 'Giao thông',
  safety: 'An toàn',
  environment: 'Môi trường',
  history: 'Lịch sử',
  geography: 'Địa lí',
  jobs: 'Nghề nghiệp',
  sports: 'Thể thao',
  music: 'Âm nhạc',
  art: 'Mỹ thuật',
  math: 'Toán',
  language: 'Tiếng Việt',
  science: 'Khoa học',
  technology: 'Công nghệ',
  health: 'Sức khỏe',
  family: 'Gia đình',
  community: 'Cộng đồng',
  weather: 'Thời tiết',
  food: 'Thực phẩm',
  objects: 'Đồ vật',
  'water-world': 'Thế giới nước'
};

/** `[id, label]` pairs, in registry order, for the pickers below. */
const WIZARD_ART_CATEGORIES = Object.keys(WIZARD_ART_CATEGORY_LABELS)
  .map(id => [id, WIZARD_ART_CATEGORY_LABELS[id]]);

/**
 * Categories with a hand-tuned scene, i.e. the ones `resolveStageIllustration` accepts.
 *
 * **Lazy on purpose.** This file is a classic script loaded at `index.html:80`, but
 * `STAGE_ILLUSTRATION_CATEGORY_ICONS` is declared by `renderer/features/game-illustration.js`
 * at `index.html:94` — *after* this file. Computing this list at top level therefore read
 * a not-yet-initialised binding and threw before the page finished loading (the whole
 * wizard died, the error surfaced as "Cannot access '…' before initialization"). The list
 * is now built on first call, by which point every script has run.
 */
let wizardArtSceneCategoriesCache = null;
function wizardArtSceneCategories() {
  if (!wizardArtSceneCategoriesCache) {
    const icons = typeof STAGE_ILLUSTRATION_CATEGORY_ICONS === 'object' && STAGE_ILLUSTRATION_CATEGORY_ICONS
      ? STAGE_ILLUSTRATION_CATEGORY_ICONS
      : {};
    wizardArtSceneCategoriesCache = WIZARD_ART_CATEGORIES
      .map(([id]) => id)
      .filter(id => Object.prototype.hasOwnProperty.call(icons, id));
  }
  return wizardArtSceneCategoriesCache;
}

function wizardArtCategoryLabel(id) {
  return Object.prototype.hasOwnProperty.call(WIZARD_ART_CATEGORY_LABELS, id)
    ? WIZARD_ART_CATEGORY_LABELS[id]
    : id;
}

/** The object that owns the artwork, which for treasure is the nested question. */
function wizardArtSource(gameType, item) {
  if (!item || typeof item !== 'object') return {};
  if (gameType === 'treasure') return (item.question && typeof item.question === 'object') ? item.question : {};
  return item;
}

function wizardArtSelectedAsset(gameType, item) {
  const source = wizardArtSource(gameType, item);
  const id = typeof source.illustrationAssetId === 'string' ? source.illustrationAssetId.trim() : '';
  // #124: a teacher-uploaded picture is a selected asset too. Before this, an uploaded
  // id fell through to '' and the thumbnail silently showed the built-in scene — the
  // card said "Ảnh tự tải lên" while drawing something else.
  if (/^ci-[a-f0-9]{32}$/u.test(id)) return id;
  return id && wizardArtSceneCategories().some(category => `${category}-scene` === id) ? id : '';
}

/** Previews a *candidate* asset id without touching the draft. */
function wizardArtPreviewItem(gameType, item, assetId) {
  const source = Object.assign({}, wizardArtSource(gameType, item));
  if (assetId) source.illustrationAssetId = assetId;
  else delete source.illustrationAssetId;
  return source;
}

/** The illustration mode this draft would be played with (projects carry no setup yet). */
function wizardArtMode() {
  const setup = (wizardState.gameSnapshot && wizardState.gameSnapshot.gameSetup) || {};
  return setup.illustrationMode === 'manual' || setup.illustrationMode === 'off' ? setup.illustrationMode : 'auto';
}

/** The resolver reads `game.gameSetup.illustrationMode`; this is the only field it needs. */
function wizardArtGame() {
  return { gameSetup: { illustrationMode: wizardArtMode() } };
}

/**
 * Thumbnail for one item: the real play-surface SVG when there is something to
 * draw, otherwise an honest "no artwork" tile (never a stand-in that looks like art).
 */
function wizardArtThumb(gameType, item, game, assetId) {
  const html = stageIllustrationHtml(wizardArtPreviewItem(gameType, item, assetId), game, 'is-wizard-preview');
  if (!html) {
    const reason = game.gameSetup.illustrationMode === 'off' ? 'Minh hoạ đang tắt' : 'Chưa có hình minh hoạ';
    return `<div class="wizard-art-thumb is-empty">${escapeHtml(reason)}</div>`;
  }
  return `<div class="wizard-art-thumb">${html}</div>`;
}
/**
 * Saves one item's artwork. `patch` is a partial object of the three whitelisted
 * keys; the main process normalises and re-validates, then returns a fresh
 * snapshot so this preview and the editor cannot drift.
 *
 * Errors are surfaced in the wizard banner, never swallowed: a pick that did not
 * save must not look saved.
 */
/**
 * #127: one queue for every artwork write (built-in pick, "Tự động", uploaded file).
 *
 * #124–#126 left two flaws that a teacher can hit in normal use:
 *  - an "upload in progress" flag blocked actions but **nothing reset it** when the
 *    native dialog hung or the project could not be saved, so every later click did
 *    nothing (the button looked dead — "vẫn chưa hoạt động");
 *  - each call ran on its own, so two quick picks raced and the last one to finish won,
 *    not the last one clicked.
 *
 * Writes are now serialised: a click enqueues an operation, the queue runs them one at a
 * time, the busy flag is cleared in `finally`, and the preview is redrawn from the
 * project the main process returns — so what the card shows is always what was saved.
 */

/** Serialises artwork writes for one wizard session. */
let wizardArtQueue = Promise.resolve();
/** Bumped on every queued write so a stale refresh cannot overwrite a newer draft. */
let wizardArtWriteSeq = 0;

/** Runs `task` after every artwork write already queued, then releases the UI. */
function wizardQueueArtTask(task) {
  wizardState.artBusy = true;
  render();
  const seq = ++wizardArtWriteSeq;
  wizardArtQueue = wizardArtQueue
    .then(async () => {
      try {
        await task(seq);
      } catch (error) {
        // Always shown, never swallowed: a pick that did not save must not look saved.
        if (seq === wizardArtWriteSeq) wizardSetError(error);
      }
    })
    .catch(() => undefined)
    .finally(() => {
      if (seq !== wizardArtWriteSeq) return;
      // Only the last queued write clears the flag, so the card cannot be left disabled
      // while another write is still on its way.
      wizardState.artBusy = false;
      render();
      wizardRepaintArtThumbs();
    });
  return undefined;
}

/** Applies a patch to one item and adopts the project/ game main returns. */
async function wizardApplyItemPatch(position, patch) {
  const result = await window.eduGame.patchLessonItemAssets({
    projectId: wizardState.projectId,
    itemIndex: position,
    patch
  });
  if (!result || !result.project) throw new Error('Hệ thống không trả về dự án sau khi đổi minh hoạ.');
  const previousId = (() => {
    const gameType = (wizardState.config && wizardState.config.gameType) || '';
    const item = wizardDraftItemList(wizardState.draft)[position - 1];
    const source = item ? wizardArtSource(gameType, item) : {};
    return typeof source.illustrationAssetId === 'string' ? source.illustrationAssetId : '';
  })();
  wizardState.projectId = result.project.id;
  wizardState.draft = result.project.draft || wizardState.draft;
  wizardState.gameSnapshot = result.game || wizardState.gameSnapshot;
  if (result.game && result.game.id) wizardState.gameId = result.game.id;
  // #127: a picture this project uploaded and that is no longer on the item is deleted
  // once the save succeeded. main refuses to delete anything another game or project
  // still points at, so this only removes what would otherwise be an orphan file.
  if (/^ci-[a-f0-9]{32}$/u.test(previousId) && previousId !== String(patch.illustrationAssetId || '')) {
    window.eduGame.deleteIllustration(previousId).catch(() => {});
  }
  return result;
}

/** What one item's picture is, as the data model sees it (for the success message). */
function wizardItemArtSummary(position) {
  const draft = wizardState.draft;
  const gameType = (wizardState.config && wizardState.config.gameType) || (draft && draft.gameType) || '';
  const items = wizardDraftItemList(draft);
  const item = items[position - 1];
  const source = item ? wizardArtSource(gameType, item) : {};
  const id = typeof source.illustrationAssetId === 'string' ? source.illustrationAssetId.trim() : '';
  if (/^ci-[a-f0-9]{32}$/u.test(id)) return 'ảnh tải lên từ máy';
  if (id) return wizardArtCategoryLabel(id.slice(0, -'-scene'.length)) || 'hình có sẵn';
  return 'hình theo chủ đề nội dung';
}

async function wizardPatchItemAssets(position, patch) {
  if (!(await wizardEnsureProjectSaved())) {
    // Shown in the wizard banner, not a toast: a toast disappears before a teacher reads
    // it and the preview then looks "unchanged" with no explanation (#126).
    wizardSetError(new Error('Chưa lưu được dự án nên chưa gắn được ảnh. Hãy bấm “Lưu tiến trình” rồi thử tải ảnh lại.'));
    render();
    return undefined;
  }
  return wizardQueueArtTask(async () => {
    await wizardApplyItemPatch(position, patch);
    const gameType = (wizardState.config && wizardState.config.gameType) || '';
    wizardSetNotice(`Đã đổi minh hoạ cho ${wizardDraftItemLabel(gameType, position)} → ${wizardItemArtSummary(position)}. Nội dung câu hỏi giữ nguyên.`);
  });
}

/**
 * #126: guarantees step 5 has a stored project before anything is written to it.
 *
 * The artwork channels (`lesson:patch-item-assets`, and the picture upload) address a
 * *saved* project. A project opened from the list can arrive at step 5 with no
 * `projectId` in the wizard state (the id was not restored with the rest of the
 * project), and every picture action then did nothing but show a toast — the teacher
 * saw "uploaded" and an unchanged picture. Saving here makes the invariant true instead
 * of asking the teacher to discover an invisible precondition.
 */
async function wizardEnsureProjectSaved() {
  if (wizardState.projectId) return true;
  if (!wizardState.config || !wizardState.draft) return false;
  try {
    await wizardSaveProject(wizardState.step || 'generate');
    return Boolean(wizardState.projectId);
  } catch (error) {
    wizardSetError(error);
    return false;
  }
}

/**
 * The one call that opens the file dialog and copies the picture.
 *
 * It is a named function rather than a direct `window.eduGame` call so the dialog — the
 * only step a headless check cannot drive — can be replaced while everything after it
 * (validation, patch, project save, card) stays the real code path (see
 * `tests/ui/ui-art-upload-flow-check.js`).
 */
function wizardImportIllustration() {
  return window.eduGame.importIllustration();
}

/**
 * #124: "📷 Tải ảnh lên" — the teacher's own picture for one question.
 *
 * The file is chosen first (the native dialog), then the id is written through the same
 * whitelisted patch as a built-in illustration. Choosing before touching the project
 * means a cancelled dialog changes nothing, and the busy flag is cleared by the queue
 * even when the dialog is dismissed or the save fails (#127).
 */
async function wizardUploadArt(position) {
  // The dialog is the only long wait; while it is open a second click is ignored. The
  // flag is reset on *every* path below, so a dismissed dialog can never leave the
  // buttons disabled (that was #127's "button does nothing").
  if (wizardState.artBusy) return undefined;
  if (!(await wizardEnsureProjectSaved())) {
    // No dialog is opened: asking a teacher to pick a picture that cannot be saved is
    // worse than saying why (#126).
    wizardSetError(new Error('Chưa lưu được dự án nên chưa tải được ảnh. Hãy bấm “Lưu tiến trình” rồi thử lại.'));
    render();
    return undefined;
  }
  wizardState.artBusy = true;
  render();
  let picked = null;
  try {
    picked = await wizardImportIllustration();
  } catch (error) {
    wizardState.artBusy = false;
    wizardSetError(error);
    render();
    return undefined;
  }
  if (!picked || !picked.id) {
    // The teacher cancelled the dialog: nothing changes, nothing is reported.
    wizardState.artBusy = false;
    render();
    return undefined;
  }
  return wizardQueueArtTask(async () => {
    await wizardApplyItemPatch(position, { illustrationAssetId: picked.id });
    const gameType = (wizardState.config && wizardState.config.gameType) || '';
    wizardSetNotice(`Đã tải ảnh lên và gắn vào ${wizardDraftItemLabel(gameType, position)}. Ảnh được lưu trên máy này.`);
  });
}

/**
 * #124: forces the play surface to load the pictures again.
 *
 * Chromium caches an `<img>`/SVG `<image>` by URL. When a teacher replaces a picture,
 * the *new* URL is different (a new id), so a cache miss is normal — but the browser
 * can also keep the previous node alive across an innerHTML rebuild in a way that
 * leaves a stale frame until the next paint. Re-adding the `src`/`href` after a frame
 * is cheap and makes the thumbnail and the play screen show the current file.
 */
function wizardRepaintArtThumbs() {
  if (wizardState.step !== 'generate') return;
  document.querySelectorAll('[data-wizard-item-card] .stage-illustration.is-custom image').forEach(node => {
    const href = node.getAttribute('href');
    if (!href) return;
    node.removeAttribute('href');
    // Re-adding in the next frame guarantees a fresh paint rather than a no-op.
    setTimeout(() => { if (node.isConnected) node.setAttribute('href', href); }, 0);
  });
}

/**
 * Opens/closes the "Đổi" popover of one item. Only one is open at a time so the
 * grid cannot turn into a wall of selects, and the choice is kept in
 * `wizardState` because `render()` rebuilds the whole step from scratch.
 */
function wizardToggleArtItem(position) {
  if (wizardState.artBusy) return undefined;
  const gameType = (wizardState.config && wizardState.config.gameType) || '';
  const key = `${gameType}:${position}`;
  wizardState.openArtItem = wizardState.openArtItem === key ? null : key;
  return render();
}

function wizardArtCard(gameType, item, position, index) {
  const game = wizardArtGame();
  const open = wizardState.openArtItem === `${gameType}:${position}`;
  const source = wizardArtSource(gameType, item);
  const rawCategory = typeof source.contentCategory === 'string' ? source.contentCategory.trim() : '';
  const category = WIZARD_ART_CATEGORIES.some(([value]) => value === rawCategory) ? rawCategory : '';
  const asset = wizardArtSelectedAsset(gameType, item);
  const assetOptions = [
    `<option value="">Theo chủ đề nội dung</option>`,
    ...wizardArtSceneCategories().map(id => `<option value="${escapeHtml(id)}-scene"${asset === `${id}-scene` ? ' selected' : ''}>${escapeHtml(wizardArtCategoryLabel(id))}</option>`)
  ].join('');
  const categoryOptions = [
    `<option value="">Tự nhận diện theo nội dung</option>`,
    ...WIZARD_ART_CATEGORIES.map(([id, label]) => `<option value="${escapeHtml(id)}"${category === id ? ' selected' : ''}>${escapeHtml(label)}</option>`)
  ].join('');
  const badge = asset
    ? wizardArtCategoryLabel(asset.slice(0, -'-scene'.length))
    : (category ? wizardArtCategoryLabel(category) : 'Tự động');
  const disabled = wizardState.artBusy ? ' disabled' : '';
  return `<div class="wizard-art-card${open ? ' is-open' : ''}" data-wizard-art-card="${position}">
    ${wizardArtThumb(gameType, item, game, asset)}
    <div class="wizard-art-meta"><strong>${escapeHtml(wizardDraftItemLabel(gameType, index + 1))}</strong>${escapeHtml(badge)}</div>
    <div class="wizard-art-actions">
      <button class="btn btn-secondary btn-small" data-wizard-action="toggle-art" data-item-index="${position}"${disabled}>${open ? 'Đóng' : '🖼 Đổi'}</button>
      ${asset || category ? `<button class="btn btn-secondary btn-small" data-wizard-action="reset-art" data-item-index="${position}"${disabled}>Tự động</button>` : ''}
    </div>
    ${open ? `<div class="wizard-art-pick">
      <label>HÌNH MINH HOẠ</label>
      <select data-wizard-art-asset data-item-index="${position}"${disabled}>${assetOptions}</select>
      <label>CHỦ ĐỀ NỘI DUNG</label>
      <select data-wizard-art-category data-item-index="${position}"${disabled}>${categoryOptions}</select>
      <div class="wizard-art-hint">Chọn xong là lưu ngay, không gọi AI và không tốn thời gian. Nội dung câu hỏi không thay đổi.</div>
    </div>` : ''}
  </div>`;
}

function wizardIllustrationGrid(s) {
  const draft = s.draft;
  const items = wizardDraftItemList(draft);
  if (!items.length) return '';
  const game = wizardArtGame();
  const mode = wizardArtMode();
  const missing = items.filter(item => !stageIllustrationHtml(wizardArtSource(draft.gameType, item), game)).length;
  const modeHint = mode === 'off'
    ? 'Chế độ “Tắt” đang bật nên khi chơi sẽ không hiện minh hoạ nào. Mở trình chỉnh sửa để bật lại.'
    : mode === 'manual'
      ? 'Chế độ “Chọn thủ công” chỉ hiện hình bạn chọn — mục chưa chọn sẽ không có hình khi chơi.'
      : 'Chế độ “Tự động”: mục chưa chọn hình sẽ dùng hình theo chủ đề nội dung.';
  return `<div class="field mt-[12px]" data-wizard-art-grid="1">
    <div class="flex items-center gap-[8px] mb-[8px] flex-wrap"><strong class="text-[12px]">Minh hoạ từng mục</strong><span class="tag">${items.length} mục</span>${missing ? `<span class="tag">${missing} mục chưa có hình</span>` : ''}</div>
    <div class="wizard-art-grid">${items.map((item, index) => wizardArtCard(draft.gameType, item, index + 1, index)).join('')}</div>
    <div class="field-hint">${escapeHtml(modeHint)}</div>
  </div>`;
}




/**
 * O7: five progress states from `docs/archive/specs/update-AI-local.txt` §10. Each state is
 * driven by a real IPC boundary from the main process (retrieve → generate →
 * validate → repair-if-needed → ready), not by a timer. "Sửa phần chưa đạt" is
 * marked "không cần" when no repair happened, so the list never claims work that
 * was not done.
 */
const WIZARD_GENERATION_STAGES = [
  ['retrieve', 'Tìm kiến thức phù hợp trong giáo án'],
  ['generate', 'Tạo nội dung trò chơi'],
  ['validate', 'Kiểm tra câu hỏi và cấu trúc'],
  ['repair', 'Sửa phần chưa đạt (nếu cần)'],
  ['ready', 'Sẵn sàng xem trước']
];

/** The spinning ring drawn beside the running stage. Purely decorative. */
const WIZARD_GENERATION_SPINNER =
  '<svg class="wizard-gen-spinner" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="7"/></svg>';

/**
 * #71: how far the run has actually got, as a fraction of the reported stages.
 *
 * This is a *stage counter*, not a time estimate, which is why it is allowed to
 * show a percentage at all: the previous comment in this file correctly refused
 * to invent one from a timer. The number only ever reflects stages the main
 * process has really reported, and a skipped repair stage counts as reached.
 */
function wizardGenerationProgressFraction(stage) {
  return wzEtaStageFraction(stage);
}

function renderWizardGenerationProgress() {
  const s = wizardState;
  if (s.busy !== 'generate') return '';
  // O7: a cache hit runs no generation at all, so the five stages would be a lie.
  if (s.lessonStage === 'cached') {
    return `<div class="field-hint mt-[8px]" data-wizard-progress="cached">✓ Giáo án và cấu hình không đổi — dùng lại nội dung đã tạo, không gọi AI.</div>`;
  }
  const currentIndex = Math.max(0, WIZARD_GENERATION_STAGES.findIndex(([id]) => id === s.lessonStage));
  const rows = WIZARD_GENERATION_STAGES.map(([id, initialLabel], index) => {
    let label = initialLabel;
    let status = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'todo';
    let mark = index < currentIndex ? '✓' : index === currentIndex ? '⏳' : '·';
    if (id === 'repair' && status === 'done' && !s.lessonRepaired) {
      status = 'skipped';
      mark = '–';
      label = `${label} · không cần`;
    }
    const prefix = status === 'active' ? WIZARD_GENERATION_SPINNER : `${mark} `;
    return `<li data-stage="${id}" data-status="${status}" class="text-[12px] ${status === 'active' ? 'font-bold text-[#3b3a63]' : status === 'skipped' ? 'text-[#98a0b0]' : 'text-[#5a6478]'}">${prefix}${escapeHtml(label)}</li>`;
  }).join('');
  const fraction = wizardGenerationProgressFraction(s.lessonStage);
  const percent = Math.round(fraction * 100);
  const eta = wizardGenerationEtaText();
  return `<div class="field-hint mt-[8px]" data-wizard-progress="${escapeHtml(s.lessonStage || '')}" data-wizard-progress-percent="${percent}">
    <div class="wizard-gen-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="Tiến trình tạo nội dung"><div class="wizard-gen-progress-fill" style="width:${percent}%"></div></div>
    <div class="wizard-gen-meta"><span><strong>${percent}%</strong> · ${Math.max(1, currentIndex + 1)}/${WIZARD_GENERATION_STAGES.length} bước</span><span data-wizard-generate-eta>${escapeHtml(eta || 'Đang chạy…')}</span></div>
    <ol class="space-y-[2px] pl-[2px]" role="list">${rows}</ol>
    <div class="mt-[5px] flex flex-wrap gap-x-[10px] gap-y-[2px]">
      <span data-wizard-generate-elapsed>${escapeHtml(wizardGenerationElapsedText())}</span>
      <span>Bạn có thể chuyển sang trang khác — AI vẫn chạy nền và kết quả sẽ được giữ.</span>
    </div>
    <span>${wizardProviderPrivacyText()}</span>
  </div>`;
}

/** O7: cancel while the model is generating; the request id aborts the call. */
async function wizardCancelGenerate() {
  const requestId = wizardState.activeRequestId;
  try {
    if (requestId) await window.eduGame.cancelAi(requestId);
  } catch (error) {
    /* cancelling is best-effort */
  }
  wizardSetNotice('Đã yêu cầu huỷ. Kết quả dở dang sẽ không được lưu.');
  render();
  return undefined;
}

function renderWizardGenerate() {
  const s = wizardState;
  const config = s.config;
  const hasContent = Boolean(s.gameSnapshot);
  // #117: a run that started from the teacher's question bank never uses the model, so
  // it has no Fast/Thinking choice and its forward action is saving to the library.
  const bankRun = s.draftOrigin === 'source' && s.draftSource === 'imported-questions';
  const tag = bankRun
    ? 'Từ câu hỏi có sẵn'
    : (hasContent ? 'Đã tạo bản nháp' : (config && config.generationMode === 'deep' ? 'Chế độ Thinking' : 'Chế độ Fast'));
  if (bankRun && hasContent) {
    return `<section class="form-panel" data-wizard-step-body="generate" data-wizard-bank-finish="1">
    <div class="section-head"><h3>Bước 4 · Hoàn tất trò chơi</h3><span class="tag">${tag}</span></div>
    <div class="panel-sub">Trò chơi đã được tạo từ đúng câu hỏi giáo viên cung cấp và đã qua kiểm tra cấu trúc. Không dùng AI ở bước này — bấm “Lưu vào thư viện” để có thể chơi ngay, hoặc mở trình chỉnh sửa nếu muốn sửa.</div>
    ${wizardSummaryGrid(wizardGeneratedSummaryRows(s.gameSnapshot))}
    ${wizardItemCardsPanel(s)}
    <div class="publish-actions">
      <button class="btn btn-secondary" data-wizard-action="back"${s.busy ? ' disabled' : ''}>← Cấu hình</button>
      <button class="btn btn-primary" id="wizardNextBtn" data-wizard-action="save-game"${s.busy ? ' disabled' : ''}>${s.busy === 'save-game' ? 'Đang lưu…' : '💾 Lưu vào thư viện'}</button>
      <button class="btn btn-secondary" data-wizard-action="open-editor"${s.busy ? ' disabled' : ''}>✎ Mở trình chỉnh sửa</button>
      <button class="btn btn-secondary" data-wizard-action="save-project"${s.busy ? ' disabled' : ''}>Lưu tiến trình</button>
    </div>
  </section>`;
  }
  return `<section class="form-panel" data-wizard-step-body="generate">
    <div class="section-head"><h3>Bước 5 · Tạo nội dung trò chơi</h3><span class="tag">${tag}</span></div>
    ${hasContent
      ? `<div class="panel-sub">${escapeHtml(wizardProviderLabel())} đã soạn bản nháp từ giáo án và đã được kiểm tra cấu trúc. Hãy mở trình chỉnh sửa để duyệt, sửa lại rồi lưu vào thư viện để chơi thử.</div>
        ${wizardSummaryGrid(wizardGeneratedSummaryRows(s.gameSnapshot))}
        ${wizardShortfallNotice(s.quality, Boolean(s.busy), s.countTouched)}
        ${wizardQualityPanel(s.quality)}
        ${wizardItemCardsPanel(s)}
        ${wizardContextHint(s.context)}
        ${wizardGenerationTotalText() ? `<div class="field-hint" data-wizard-generate-total-line>⏱ ${escapeHtml(wizardGenerationTotalText())}</div>` : ''}
        <div class="publish-actions">
          <button class="btn btn-secondary" data-wizard-action="back"${s.busy ? ' disabled' : ''}>← Cấu hình</button>
          <button class="btn btn-primary" data-wizard-action="save-game"${s.busy ? ' disabled' : ''}>${s.busy === 'save-game' ? 'Đang lưu…' : '💾 Lưu vào Thư viện trò chơi'}</button>
          <button class="btn btn-secondary" data-wizard-action="open-editor"${s.busy ? ' disabled' : ''}>✎ Mở trình chỉnh sửa</button>
          <button class="btn btn-secondary" data-wizard-action="regenerate"${s.busy ? ' disabled' : ''}>🔄 Tạo lại nội dung</button>
          ${s.busy === 'generate' ? '<button class="btn btn-secondary" data-wizard-action="cancel">Huỷ</button>' : ''}
          <button class="btn btn-secondary" data-wizard-action="another-game"${s.busy ? ' disabled' : ''}>＋ Trò chơi khác từ giáo án này</button>
          <button class="btn btn-secondary" data-wizard-action="save-project"${s.busy ? ' disabled' : ''}>Lưu tiến trình</button>
          <button class="btn btn-secondary" data-wizard-action="go-library"${s.busy ? ' disabled' : ''}>📚 Vào thư viện để chơi</button>
        </div>
        <div class="field-hint">“Trò chơi khác” mở một dự án mới nhưng dùng lại phân tích đã lưu — không gọi AI phân tích lại. Bạn chỉ cần chọn thể loại và cấu hình mới.</div>`
      : `<div class="panel-sub">${escapeHtml(wizardProviderLabel())} sẽ soạn câu hỏi/tình huống theo đúng cấu hình bên dưới, sau đó bạn duyệt và chỉnh sửa trong trình soạn thảo. Cấu hình và phân tích đã được lưu nên có thể mở lại bất cứ lúc nào — không cần chạy lại AI.</div>
        ${wizardProviderCard()}
        ${wizardProviderPickerHtml()}
        ${wizardSummaryGrid(wizardConfigSummaryRows(config))}
        <div class="publish-actions">
          <button class="btn btn-secondary" data-wizard-action="back">← Cấu hình</button>
          <button class="btn btn-secondary" data-wizard-action="save-project"${s.busy ? ' disabled' : ''}>Lưu tiến trình</button>
          <button class="btn btn-primary" id="wizardGenerateBtn" data-wizard-action="generate"${s.busy ? ' disabled' : ''}>✦ Tạo nội dung${wizardProviderSuffix()}</button>
          ${s.busy === 'generate' ? '<button class="btn btn-secondary" data-wizard-action="cancel">Huỷ</button>' : ''}
        </div>`}
    ${s.projectId ? `<div class="field-hint">Dự án đã lưu: <code>${escapeHtml(s.projectId)}</code>. Nội dung AI tạo ra chỉ nằm trên máy này.</div>` : ''}
  </section>`;
}

async function wizardGenerateRun(options) {
  if (wizardState.busy) return undefined;
  wizardSyncCurrentStepFromDom();
  if (!wizardState.config) {
    wizardSetError(new Error('Chưa có cấu hình trò chơi. Hãy hoàn tất bước cấu hình.'));
    return render();
  }
  // The main process needs a persisted project to attach the content to.
  if (!wizardState.projectId) {
    try {
      wizardState.busy = 'save';
      render();
      await wizardSaveProject('generate');
    } catch (error) {
      wizardState.busy = '';
      wizardSetError(error);
      return render();
    }
  }
  wizardClearMessages();
  wizardState.busy = 'generate';
  wizardState.lessonStage = 'retrieve';
  wizardState.lessonRepaired = false;
  wizardState.activeRequestId = wizardNewRequestId('generate');
  // #71: refresh the measured ETA baseline before the clock starts. Not awaited on
  // the critical path — a failed read only removes the estimate, never the run.
  wizardLoadGenerationHistory(true).catch(() => {});
  render();
  wizardStartGenerationClock();
  try {
    const result = await window.eduGame.generateLessonDraft({
      projectId: wizardState.projectId,
      requestId: wizardState.activeRequestId,
      mode: wizardState.config.generationMode,
      // #132: the provider picked in the wizard (absent = the automatic policy).
      ...wizardProviderRequestPayload(),
      // O5: "Tạo lại" always asks the model for new content; a plain "Tạo nội
      // dung" may reuse the cached draft when nothing changed (§9).
      regenerate: Boolean(options && options.regenerate)
    });
    wizardState.projectId = result.project.id;
    wizardState.createdAt = result.project.createdAt || wizardState.createdAt;
    wizardState.draft = result.project.draft || null;
    wizardState.gameSnapshot = result.game;
    wizardState.quality = result.quality || null;
    wizardState.context = result.context || null;
    wizardState.gameId = result.game.id;
    wizardState.step = 'generate';
    if (!result.cached) await wizardAutoAdjustCount(wizardState.quality);
    await wizardRefreshProjects();
    wizardSetNotice(result.cached
      ? 'Giáo án và cấu hình không đổi nên đã dùng lại nội dung đã tạo (không gọi AI). Nhấn “Tạo lại nội dung” nếu muốn nội dung mới.'
      : `Đã tạo bản nháp “${result.game.title || 'trò chơi'}”. Hãy mở trình chỉnh sửa để duyệt.`);
  } catch (error) {
    const parsed = wizardParseError(error);
    if (parsed.code === 'AI_CANCELLED') wizardSetNotice('Đã huỷ tạo nội dung. Chưa có thay đổi nào được lưu.');
    else wizardSetError(error);
  }
  // #75: keep the total of a finished run so step 5 can print it after the panel
  // is gone. A cache hit never called the AI, so there is no run to time.
  wizardStopGenerationClock({ finished: Boolean(wizardState.gameSnapshot) && wizardState.lessonStage !== 'cached' });
  wizardState.busy = '';
  wizardState.lessonStage = '';
  wizardState.generationStartedAt = 0;
  wizardState.activeRequestId = null;
  render();
  return undefined;
}

function wizardGenerateRegenerate() {
  if (wizardState.busy) return undefined;
  const type = wizardState.config ? wizardGameMeta(wizardState.config.gameType).label : 'bản nháp';
  if (wizardState.gameSnapshot && !window.confirm(`Tạo lại toàn bộ nội dung “${type}” từ giáo án? Bản nháp hiện tại sẽ bị thay thế khi AI trả kết quả mới.`)) {
    return undefined;
  }
  return wizardGenerateRun({ regenerate: true });
}

/** O5: rewrite one item only; the other items are not sent to the model. */
async function wizardRegenerateItem(position) {
  if (wizardState.busy) return undefined;
  if (!(await wizardEnsureProjectSaved())) {
    // Same invisible precondition as the artwork actions (#126): say it in the banner.
    wizardSetError(new Error('Chưa lưu được dự án nên chưa tạo lại được câu này. Hãy bấm “Lưu tiến trình” rồi thử lại.'));
    render();
    return undefined;
  }
  wizardClearMessages();
  wizardState.busy = 'generate';
  wizardState.lessonStage = 'retrieve';
  wizardState.lessonRepaired = false;
  wizardState.activeRequestId = wizardNewRequestId('regen');
  render();
  wizardStartGenerationClock();
  try {
    const result = await window.eduGame.regenerateLessonItem({
      projectId: wizardState.projectId,
      requestId: wizardState.activeRequestId,
      itemIndex: position,
      // #132: regenerating one item stays on the provider the draft used.
      ...wizardProviderRequestPayload()
    });
    wizardState.projectId = result.project.id;
    wizardState.draft = result.project.draft || wizardState.draft;
    wizardState.gameSnapshot = result.game;
    wizardState.quality = result.quality || null;
    wizardState.context = result.context || wizardState.context;
    wizardState.gameId = result.game.id;
    const gameType = (wizardState.config && wizardState.config.gameType) || (result.project.draft && result.project.draft.gameType) || '';
    await wizardRefreshProjects();
    wizardSetNotice(`Đã tạo lại ${wizardDraftItemLabel(gameType, position)}. Các mục khác giữ nguyên.`);
  } catch (error) {
    const parsed = wizardParseError(error);
    if (parsed.code === 'AI_CANCELLED') wizardSetNotice('Đã huỷ tạo lại mục. Mục hiện tại được giữ nguyên.');
    else wizardSetError(error);
  }
  wizardStopActivityClock();
  wizardState.busy = '';
  wizardState.lessonStage = '';
  wizardState.generationStartedAt = 0;
  wizardState.activeRequestId = null;
  render();
  return undefined;
}

/** Maps the typed draft items (or the adapted snapshot) to the ids the editor rows carry. */
function wizardDraftItemIds(gameType, draft, game) {
  if (draft) {
    if (gameType === 'arena' || gameType === 'race') return (draft.questions || []).map(question => question.id);
    if (gameType === 'scenario') return (draft.situations || []).map(situation => situation.id);
    if (gameType === 'matching') return (draft.pairs || []).map(pair => pair.id);
    if (gameType === 'treasure') return (draft.stages || []).map(stage => stage.id);
  }
  if (gameType === 'matching') return ((game.matchingGame || {}).pairs || []).map(pair => pair.id);
  if (gameType === 'treasure') return ((game.treasureHunt || {}).stages || []).map(stage => stage.id);
  if (gameType === 'race') return ((game.race || {}).questions || []).map(question => question.id);
  return (game.questions || []).map(question => question.id);
}

/** Opens the generated game in the normal editor (same editor the manual path uses). */
function wizardGenerateOpenEditor() {
  const game = wizardState.gameSnapshot;
  if (!game) {
    toast('Chưa có nội dung để chỉnh sửa. Hãy tạo nội dung trước.');
    return undefined;
  }
  const gameType = wizardState.config ? wizardState.config.gameType : '';
  openEditor(
    JSON.parse(JSON.stringify(game)),
    true,
      'Đã soạn bản nháp từ giáo án. Hãy duyệt, sửa nội dung và nhấn “Lưu vào thư viện” để chơi thử.',
    {
      projectId: wizardState.projectId,
      gameType,
      itemIds: wizardDraftItemIds(gameType, wizardState.draft, game)
    }
  );
  return undefined;
}
