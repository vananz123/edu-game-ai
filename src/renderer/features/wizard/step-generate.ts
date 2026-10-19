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
    ['Chế độ tạo', config.generationMode === 'deep' ? 'Kỹ' : 'Nhanh']
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

function renderWizardGenerate() {
  const s = wizardState;
  const config = s.config;
  const hasContent = Boolean(s.gameSnapshot);
  return `<section class="form-panel" data-wizard-step-body="generate">
    <div class="section-head"><h3>Bước 5 · Tạo nội dung trò chơi</h3><span class="tag">${hasContent ? 'Đã tạo bản nháp' : (config && config.generationMode === 'deep' ? 'Chế độ kỹ' : 'Chế độ nhanh')}</span></div>
    ${hasContent
      ? `<div class="panel-sub">AI local đã soạn bản nháp từ giáo án và đã được kiểm tra cấu trúc. Hãy mở trình chỉnh sửa để duyệt, sửa lại rồi lưu vào thư viện để chơi thử.</div>
        ${wizardSummaryGrid(wizardGeneratedSummaryRows(s.gameSnapshot))}
        <div class="publish-actions">
          <button class="btn btn-primary" data-wizard-action="open-editor"${s.busy ? ' disabled' : ''}>✎ Mở trình chỉnh sửa</button>
          <button class="btn btn-secondary" data-wizard-action="regenerate"${s.busy ? ' disabled' : ''}>🔄 Tạo lại nội dung</button>
          <button class="btn btn-secondary" data-wizard-action="save"${s.busy ? ' disabled' : ''}>Lưu dự án</button>
          <button class="btn btn-secondary" data-wizard-action="go-library">📚 Vào thư viện để chơi</button>
        </div>`
      : `<div class="panel-sub">AI local sẽ soạn câu hỏi/tình huống theo đúng cấu hình bên dưới, sau đó bạn duyệt và chỉnh sửa trong trình soạn thảo. Cấu hình và phân tích đã được lưu nên có thể mở lại bất cứ lúc nào — không cần chạy lại AI.</div>
        ${wizardSummaryGrid(wizardConfigSummaryRows(config))}
        <div class="publish-actions">
          <button class="btn btn-secondary" data-wizard-action="back">← Cấu hình</button>
          <button class="btn btn-secondary" data-wizard-action="save"${s.busy ? ' disabled' : ''}>Lưu dự án</button>
          <button class="btn btn-primary" id="wizardGenerateBtn" data-wizard-action="generate"${s.busy ? ' disabled' : ''}>✦ Tạo nội dung bằng AI local</button>
        </div>`}
    ${s.projectId ? `<div class="field-hint">Dự án đã lưu: <code>${escapeHtml(s.projectId)}</code>. Nội dung AI tạo ra chỉ nằm trên máy này.</div>` : ''}
  </section>`;
}

async function wizardGenerateRun() {
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
  wizardState.activeRequestId = wizardNewRequestId('generate');
  render();
  try {
    const result = await window.eduGame.generateLessonDraft({
      projectId: wizardState.projectId,
      requestId: wizardState.activeRequestId,
      mode: wizardState.config.generationMode
    });
    wizardState.projectId = result.project.id;
    wizardState.createdAt = result.project.createdAt || wizardState.createdAt;
    wizardState.draft = result.project.draft || null;
    wizardState.gameSnapshot = result.game;
    wizardState.gameId = result.game.id;
    wizardState.step = 'generate';
    await wizardRefreshProjects();
    wizardSetNotice(`Đã tạo bản nháp “${result.game.title || 'trò chơi'}”. Hãy mở trình chỉnh sửa để duyệt.`);
  } catch (error) {
    wizardSetError(error);
  }
  wizardState.busy = '';
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
  return wizardGenerateRun();
}

/** Opens the generated game in the normal editor (same editor the manual path uses). */
function wizardGenerateOpenEditor() {
  const game = wizardState.gameSnapshot;
  if (!game) {
    toast('Chưa có nội dung để chỉnh sửa. Hãy tạo nội dung trước.');
    return undefined;
  }
  openEditor(
    JSON.parse(JSON.stringify(game)),
    true,
    'AI local đã soạn bản nháp từ giáo án. Hãy duyệt, sửa nội dung và nhấn “Lưu vào thư viện” để chơi thử.'
  );
  return undefined;
}
