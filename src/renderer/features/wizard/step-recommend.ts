// @ts-nocheck -- renderer UI logic; workflow contracts are typed in src/shared/lesson-types.ts.
/** Wizard step 3 — ask the local AI for 2–3 game suggestions and pick one. */

function wizardObjectiveTitle(id) {
  const analysis = wizardState.analysis;
  if (!analysis) return id;
  const objective = analysis.objectives.find(item => item.id === id);
  return objective ? objective.description : id;
}

function renderWizardRecommend() {
  const s = wizardState;
  const loading = s.busy === 'recommend';
  const analysis = s.analysis;
  const header = `<div class="section-head"><h3>Bước 3 · Chọn trò chơi</h3><span class="tag">2–3 gợi ý</span></div>
    <div class="panel-sub">AI local đề xuất thể loại phù hợp với mục tiêu của giáo án. Bạn chọn một gợi ý để cấu hình — có thể đổi thể loại sau.</div>`;

  if (!analysis) {
    return `<section class="form-panel" data-wizard-step-body="recommend">${header}
      <div class="field-hint">Chưa có phân tích. Hãy quay lại bước phân tích giáo án.</div>
      <div class="publish-actions"><button class="btn btn-secondary" data-wizard-action="back">← Phân tích giáo án</button></div>
    </section>`;
  }

  if (!s.recommendations.length) {
    return `<section class="form-panel" data-wizard-step-body="recommend">${header}
      <div class="field"><strong class="text-[12px] block mb-[6px]">Chủ đề: ${escapeHtml(analysis.topic || '—')}</strong>
        <small class="block text-[11px] text-[#788196]">${analysis.objectives.length} mục tiêu · ${analysis.keyConcepts.length} kiến thức trọng tâm</small></div>
      ${wizardAiReadinessHint()}
      <div class="publish-actions">
        <button class="btn btn-primary" id="wizardRecommendBtn" data-wizard-action="recommend"${loading ? ' disabled' : ''}>${loading ? 'AI đang gợi ý…' : '✦ Gợi ý trò chơi bằng AI local'}</button>
        ${loading ? '<button class="btn btn-secondary" data-wizard-action="cancel">Huỷ</button>' : ''}
        <button class="btn btn-secondary" data-wizard-action="back">← Xem lại phân tích</button>
      </div>
      ${loading ? '<div class="field-hint" data-wizard-loading="recommend">AI local đang cân nhắc thể loại phù hợp với mục tiêu…</div>' : ''}
    </section>`;
  }

  return `<section class="form-panel" data-wizard-step-body="recommend">${header}
    <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[12px]" id="wizardRecommendations">
      ${s.recommendations.map(recommendation => {
        const meta = wizardGameMeta(recommendation.gameType);
        const selected = recommendation.id === s.selectedRecommendationId;
        return `<article class="border rounded-[12px] p-[15px] bg-white min-w-0 flex flex-col gap-[8px] ${selected ? 'border-[#6258e8] shadow-[0_0_0_2px_#6258e826]' : 'border-line'}" data-wizard-recommendation="${escapeHtml(recommendation.id)}" data-game-type="${recommendation.gameType}">
          <div class="flex items-center gap-[9px]"><span class="text-[24px]">${meta.icon}</span><div class="min-w-0"><strong class="text-[13px] block">${escapeHtml(recommendation.title || meta.label)}</strong><small class="text-[11px] text-[#788196]">${escapeHtml(meta.label)} · gợi ý ${Number(recommendation.suggestedDurationMinutes) || 10} phút</small></div></div>
          <p class="text-[11px] text-[#5b6478] leading-[1.6] m-0">${escapeHtml(recommendation.reason || recommendation.description || meta.hint)}</p>
          ${recommendation.learningObjectiveIds && recommendation.learningObjectiveIds.length ? `<ul class="m-0 pl-[16px] text-[11px] text-[#6d7688]">${recommendation.learningObjectiveIds.map(id => `<li>${escapeHtml(wizardObjectiveTitle(id))}</li>`).join('')}</ul>` : ''}
          <button class="btn ${selected ? 'btn-primary' : 'btn-secondary'} btn-small mt-auto" data-wizard-action="select" data-id="${escapeHtml(recommendation.id)}" data-game-type="${recommendation.gameType}">${selected ? '✓ Đã chọn' : 'Chọn thể loại này'}</button>
        </article>`;
      }).join('')}
    </div>
    <div class="publish-actions">
      <button class="btn btn-secondary" data-wizard-action="rerun-recommend"${loading ? ' disabled' : ''}>↻ Gợi ý lại</button>
      <button class="btn btn-secondary" data-wizard-action="back">← Xem lại phân tích</button>
      <button class="btn btn-primary" id="wizardNextBtn" data-wizard-action="next"${s.selectedRecommendationId ? '' : ' disabled'}>Tiếp tục · Cấu hình →</button>
    </div>
  </section>`;
}

async function wizardRecommendRun() {
  if (wizardState.busy) return;
  if (!wizardState.analysisId) {
    wizardSetError(new Error('Chưa có kết quả phân tích. Hãy phân tích giáo án trước.'));
    render();
    return;
  }
  wizardState.busy = 'recommend';
  wizardClearMessages();
  const requestId = wizardNewRequestId('recommend');
  wizardState.activeRequestId = requestId;
  render();
  try {
    const result = await window.eduGame.recommendGames({
      analysisId: wizardState.analysisId,
      projectId: wizardState.projectId || undefined,
      requestId
    });
    wizardState.recommendations = result.recommendations || [];
    if (result.project) {
      wizardState.projectId = result.project.id;
      wizardState.createdAt = result.project.createdAt || wizardState.createdAt;
    }
    await wizardRefreshProjects();
    wizardSetNotice('AI local đã gợi ý thể loại trò chơi. Hãy chọn một gợi ý.');
  } catch (error) {
    wizardSetError(error);
  }
  wizardState.busy = '';
  wizardState.activeRequestId = null;
  render();
}

function wizardRecommendSelect(recommendationId) {
  const recommendation = wizardState.recommendations.find(item => item.id === recommendationId);
  if (!recommendation) return;
  const changed = wizardState.selectedGameType !== recommendation.gameType;
  wizardState.selectedRecommendationId = recommendation.id;
  wizardState.selectedGameType = recommendation.gameType;
  if (changed || !wizardState.config) {
    wizardState.config = wizardDefaultConfig(recommendation, wizardState.analysis);
  }
  wizardClearMessages();
  render();
}

async function wizardRecommendNext() {
  if (!wizardState.selectedRecommendationId) {
    wizardSetError(new Error('Hãy chọn một thể loại trò chơi trước khi cấu hình.'));
    render();
    return;
  }
  wizardState.busy = 'save';
  wizardClearMessages();
  render();
  try {
    wizardState.step = 'configure';
    await wizardSaveProject('configure');
    wizardSetNotice('Đã lưu lựa chọn thể loại. Bước tiếp theo: cấu hình chi tiết.');
  } catch (error) {
    wizardSetError(error);
  }
  wizardState.busy = '';
  render();
}
