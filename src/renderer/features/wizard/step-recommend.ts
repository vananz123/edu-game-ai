// @ts-nocheck -- renderer UI logic; workflow contracts are typed in src/shared/lesson-types.ts.
/** Wizard step 3 — suggest 2–3 genres by rules (no model call) and let the teacher pick one. */

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
    <div class="panel-sub">Hệ thống gợi ý thể loại phù hợp với mục tiêu của giáo án. Bạn chọn một gợi ý để cấu hình — vẫn có thể đổi sang thể loại khác.</div>`;

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
      <div class="publish-actions">
        <button class="btn btn-primary" id="wizardRecommendBtn" data-wizard-action="recommend"${loading ? ' disabled' : ''}>${loading ? 'Đang chọn thể loại…' : '✦ Gợi ý thể loại phù hợp'}</button>
        ${loading ? '<button class="btn btn-secondary" data-wizard-action="cancel">Huỷ</button>' : ''}
        <button class="btn btn-secondary" data-wizard-action="back">← Xem lại phân tích</button>
      </div>
      ${loading ? '<div class="field-hint" data-wizard-loading="recommend">Đang đối chiếu mục tiêu, kiến thức trọng tâm với 5 thể loại…</div>' : ''}
    </section>`;
  }

  return `<section class="form-panel" data-wizard-step-body="recommend">${header}
    <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[12px]" id="wizardRecommendations">
      ${s.recommendations.map(recommendation => {
        const meta = wizardGameMeta(recommendation.gameType);
        // The config is the source of truth: a genre picked from "thể loại khác"
        // has no recommendation id, but it is still the active choice.
        const selected = recommendation.gameType === s.selectedGameType;
        return `<article class="border rounded-[12px] p-[15px] bg-white min-w-0 flex flex-col gap-[8px] ${selected ? 'border-[#6258e8] shadow-[0_0_0_2px_#6258e826]' : 'border-line'}" data-wizard-recommendation="${escapeHtml(recommendation.id)}" data-game-type="${recommendation.gameType}" data-selected="${selected ? 'true' : 'false'}">
          <div class="flex items-center gap-[9px]"><span class="text-[24px]">${meta.icon}</span><div class="min-w-0"><strong class="text-[13px] block">${escapeHtml(recommendation.title || meta.label)}</strong><small class="text-[11px] text-[#788196]">${escapeHtml(meta.label)} · gợi ý ${Number(recommendation.suggestedDurationMinutes) || 10} phút</small></div></div>
          <p class="text-[11px] text-[#5b6478] leading-[1.6] m-0">${escapeHtml(recommendation.reason || recommendation.description || meta.hint)}</p>
          ${recommendation.learningObjectiveIds && recommendation.learningObjectiveIds.length ? `<ul class="m-0 pl-[16px] text-[11px] text-[#6d7688]">${recommendation.learningObjectiveIds.map(id => `<li>${escapeHtml(wizardObjectiveTitle(id))}</li>`).join('')}</ul>` : ''}
          <button class="btn ${selected ? 'btn-primary' : 'btn-secondary'} btn-small mt-auto" data-wizard-action="select" data-id="${escapeHtml(recommendation.id)}" data-game-type="${recommendation.gameType}" aria-pressed="${selected ? 'true' : 'false'}">${selected ? '✓ Đã chọn' : 'Chọn thể loại này'}</button>
        </article>`;
      }).join('')}
    </div>
    ${(() => {
      const shown = new Set(s.recommendations.map(item => item.gameType));
      const others = wizardGameTypeOrder.filter(gameType => !shown.has(gameType));
      if (!others.length) return '';
      return `<div class="field mt-[10px]"><small class="block text-[11px] text-[#788196] mb-[6px]">Hoặc chọn thể loại khác:</small>
        <div class="flex flex-wrap gap-[6px]">${others.map(gameType => {
          const meta = wizardGameMeta(gameType);
          const selected = gameType === s.selectedGameType;
          return `<button class="btn ${selected ? 'btn-primary' : 'btn-secondary'} btn-small" data-wizard-action="select-type" data-game-type="${escapeHtml(gameType)}" aria-pressed="${selected ? 'true' : 'false'}">${selected ? '✓ ' : ''}${meta.icon} ${escapeHtml(meta.label)}</button>`;
        }).join('')}</div></div>`;
    })()}
    ${s.selectedGameType ? `<div class="field-hint mt-[10px]" data-wizard-selected-type="1">Đang chọn: <strong>${escapeHtml(wizardGameMeta(s.selectedGameType).label)}</strong>. Bấm “Tiếp tục” để chỉnh cấu hình.</div>` : ''}
    <div class="publish-actions">
      <button class="btn btn-secondary" data-wizard-action="rerun-recommend"${loading ? ' disabled' : ''}>↻ Gợi ý lại</button>
      <button class="btn btn-secondary" data-wizard-action="back">← Xem lại phân tích</button>
      <button class="btn btn-primary" id="wizardNextBtn" data-wizard-action="next"${s.selectedGameType ? '' : ' disabled'}>Tiếp tục · Cấu hình →</button>
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
    wizardSetNotice('Đã gợi ý thể loại phù hợp với giáo án. Hãy chọn một thể loại để cấu hình.');
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
  const staleDraft = Boolean(wizardState.draft) && wizardState.draft.gameType !== recommendation.gameType;
  if (staleDraft && !wizardConfirmGenreChange()) return;
  wizardState.selectedRecommendationId = recommendation.id;
  wizardState.selectedGameType = recommendation.gameType;
  wizardState.quick = null;
  if (changed || !wizardState.config) {
    wizardState.config = wizardDefaultConfig(recommendation, wizardState.analysis);
    wizardState.countTouched = false;
    wizardState.capacity = null;
  }
  if (staleDraft || (changed && !wizardState.draft)) wizardDiscardGeneratedContent();
  wizardClearMessages();
  render();
}

/**
 * Picks a genre that was not among the suggestions. The spec requires the
 * teacher to stay free to choose any of the five genres, so this builds the
 * same default config the recommender path would (no model call involved).
 */
function wizardRecommendSelectType(gameType) {
  if (!gameType) return;
  const changed = wizardState.selectedGameType !== gameType;
  const staleDraft = Boolean(wizardState.draft) && wizardState.draft.gameType !== gameType;
  if (staleDraft && !wizardConfirmGenreChange()) return;
  // Keep the recommendation id when this genre was also suggested, so the saved
  // project keeps its provenance; a non-suggested genre simply has no id.
  const suggested = wizardState.recommendations.find(item => item.gameType === gameType);
  wizardState.selectedRecommendationId = suggested ? suggested.id : null;
  wizardState.selectedGameType = gameType;
  wizardState.quick = null;
  if (changed || !wizardState.config) {
    wizardState.config = wizardDefaultConfig(suggested || { gameType }, wizardState.analysis);
    wizardState.countTouched = false;
    wizardState.capacity = null;
  }
  if (staleDraft || (changed && !wizardState.draft)) wizardDiscardGeneratedContent();
  wizardClearMessages();
  render();
}

async function wizardRecommendNext() {
  if (!wizardState.selectedGameType) {
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
