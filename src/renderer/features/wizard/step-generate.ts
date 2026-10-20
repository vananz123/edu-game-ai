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

function wizardDraftItemsPanel(s) {
  const draft = s.draft;
  const items = wizardDraftItemList(draft);
  if (!items.length) return '';
  const rows = items.map((item, index) => `<li class="flex items-start justify-between gap-[10px] py-[7px] border-t border-line first:border-t-0">
      <div class="min-w-0">
        <div class="text-[11px] text-[#788196]">${escapeHtml(wizardDraftItemLabel(draft.gameType, index + 1))}</div>
        <div class="text-[12px] break-words">${escapeHtml(wizardDraftItemPreview(draft.gameType, item))}</div>
      </div>
      <button class="btn btn-secondary btn-small shrink-0" data-wizard-action="regenerate-item" data-item-index="${index + 1}"${s.busy ? ' disabled' : ''}>🔄 Tạo lại</button>
    </li>`).join('');
  return `<div class="field mt-[10px]" data-wizard-draft-items="1">
    <div class="flex items-center gap-[8px] mb-[6px] flex-wrap"><strong class="text-[12px]">Từng mục</strong><span class="tag">${items.length} mục</span></div>
    <ul class="bg-[#f8f9fc] border border-line rounded-[10px] px-[12px]">${rows}</ul>
    <div class="field-hint">“Tạo lại” chỉ viết lại đúng một mục và giữ nguyên mọi mục còn lại.</div>
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
    return `<li data-stage="${id}" data-status="${status}" class="text-[12px] ${status === 'active' ? 'font-bold text-[#3b3a63]' : status === 'skipped' ? 'text-[#98a0b0]' : 'text-[#5a6478]'}">${mark} ${escapeHtml(label)}</li>`;
  }).join('');
  return `<div class="field-hint mt-[8px]" data-wizard-progress="${escapeHtml(s.lessonStage || '')}">
    <ol class="space-y-[2px] pl-[2px]" role="list">${rows}</ol>
    <span>AI local chạy trên máy này; giáo án không được gửi đi đâu. Có thể huỷ giữa chừng.</span>
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
  return `<section class="form-panel" data-wizard-step-body="generate">
    <div class="section-head"><h3>Bước 5 · Tạo nội dung trò chơi</h3><span class="tag">${hasContent ? 'Đã tạo bản nháp' : (config && config.generationMode === 'deep' ? 'Chế độ Thinking' : 'Chế độ Fast')}</span></div>
    ${hasContent
      ? `<div class="panel-sub">AI local đã soạn bản nháp từ giáo án và đã được kiểm tra cấu trúc. Hãy mở trình chỉnh sửa để duyệt, sửa lại rồi lưu vào thư viện để chơi thử.</div>
        ${wizardSummaryGrid(wizardGeneratedSummaryRows(s.gameSnapshot))}
        ${wizardQualityPanel(s.quality)}
        ${wizardDraftItemsPanel(s)}
        ${wizardContextHint(s.context)}
        <div class="publish-actions">
          <button class="btn btn-primary" data-wizard-action="save-game"${s.busy ? ' disabled' : ''}>${s.busy === 'save-game' ? 'Đang lưu…' : '💾 Lưu vào Thư viện trò chơi'}</button>
          <button class="btn btn-secondary" data-wizard-action="open-editor"${s.busy ? ' disabled' : ''}>✎ Mở trình chỉnh sửa</button>
          <button class="btn btn-secondary" data-wizard-action="regenerate"${s.busy ? ' disabled' : ''}>🔄 Tạo lại nội dung</button>
          ${s.busy === 'generate' ? '<button class="btn btn-secondary" data-wizard-action="cancel">Huỷ</button>' : ''}
          <button class="btn btn-secondary" data-wizard-action="another-game"${s.busy ? ' disabled' : ''}>＋ Trò chơi khác từ giáo án này</button>
          <button class="btn btn-secondary" data-wizard-action="save-project"${s.busy ? ' disabled' : ''}>Lưu tiến trình</button>
          <button class="btn btn-secondary" data-wizard-action="go-library">📚 Vào thư viện để chơi</button>
        </div>
        <div class="field-hint">“Trò chơi khác” mở một dự án mới nhưng dùng lại phân tích đã lưu — không gọi AI phân tích lại. Bạn chỉ cần chọn thể loại và cấu hình mới.</div>`
      : `<div class="panel-sub">AI local sẽ soạn câu hỏi/tình huống theo đúng cấu hình bên dưới, sau đó bạn duyệt và chỉnh sửa trong trình soạn thảo. Cấu hình và phân tích đã được lưu nên có thể mở lại bất cứ lúc nào — không cần chạy lại AI.</div>
        ${wizardSummaryGrid(wizardConfigSummaryRows(config))}
        <div class="publish-actions">
          <button class="btn btn-secondary" data-wizard-action="back">← Cấu hình</button>
          <button class="btn btn-secondary" data-wizard-action="save-project"${s.busy ? ' disabled' : ''}>Lưu tiến trình</button>
          <button class="btn btn-primary" id="wizardGenerateBtn" data-wizard-action="generate"${s.busy ? ' disabled' : ''}>✦ Tạo nội dung bằng AI local</button>
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
  render();
  try {
    const result = await window.eduGame.generateLessonDraft({
      projectId: wizardState.projectId,
      requestId: wizardState.activeRequestId,
      mode: wizardState.config.generationMode,
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
    await wizardRefreshProjects();
    wizardSetNotice(result.cached
      ? 'Giáo án và cấu hình không đổi nên đã dùng lại nội dung đã tạo (không gọi AI). Nhấn “Tạo lại nội dung” nếu muốn nội dung mới.'
      : `Đã tạo bản nháp “${result.game.title || 'trò chơi'}”. Hãy mở trình chỉnh sửa để duyệt.`);
  } catch (error) {
    const parsed = wizardParseError(error);
    if (parsed.code === 'AI_CANCELLED') wizardSetNotice('Đã huỷ tạo nội dung. Chưa có thay đổi nào được lưu.');
    else wizardSetError(error);
  }
  wizardState.busy = '';
  wizardState.lessonStage = '';
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
  if (!wizardState.projectId) {
    toast('Hãy lưu dự án trước khi tạo lại một mục.');
    return undefined;
  }
  wizardClearMessages();
  wizardState.busy = 'generate';
  wizardState.lessonStage = 'retrieve';
  wizardState.lessonRepaired = false;
  wizardState.activeRequestId = wizardNewRequestId('regen');
  render();
  try {
    const result = await window.eduGame.regenerateLessonItem({
      projectId: wizardState.projectId,
      requestId: wizardState.activeRequestId,
      itemIndex: position
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
  wizardState.busy = '';
  wizardState.lessonStage = '';
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
    'AI local đã soạn bản nháp từ giáo án. Hãy duyệt, sửa nội dung và nhấn “Lưu vào thư viện” để chơi thử.',
    {
      projectId: wizardState.projectId,
      gameType,
      itemIds: wizardDraftItemIds(gameType, wizardState.draft, game)
    }
  );
  return undefined;
}
