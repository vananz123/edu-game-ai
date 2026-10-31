// @ts-nocheck -- renderer UI logic; workflow contracts are typed in src/shared/lesson-types.ts.
/** Wizard step 3 — suggest 2–3 genres by rules (no model call) and let the teacher pick one. */

function wizardObjectiveTitle(id) {
  const analysis = wizardState.analysis;
  if (!analysis) return id;
  const objective = analysis.objectives.find(item => item.id === id);
  return objective ? objective.description : id;
}

/**
 * #115: a recognised question bank reaches step 3 without a lesson analysis. The five
 * genres are still offered — scored against the questions themselves — and the teacher
 * stays free to pick any of them. Pure re-render on click: the scores are already in
 * state, so changing genre never calls the model or the converter.
 */
function renderWizardRecommendFromBank() {
  const s = wizardState;
  const results = Array.isArray(s.questionCompatibility) ? s.questionCompatibility : [];
  if (!results.length) return '';
  const recommended = typeof wizardRecommendedGame === 'function' ? wizardRecommendedGame() : null;
  const stats = wizardQuestionBankStats();
  const header = `<div class="section-head"><h3>Bước 3 · Chọn trò chơi</h3><span class="tag">Ngân hàng câu hỏi</span></div>
    <div class="panel-sub">Chấm điểm theo đúng câu hỏi đã nhận diện (${stats.total} câu · ${stats.needsReview} cần xem lại · ${stats.incompatible} không tương thích). Bạn đổi được sang bất kỳ thể loại nào — số liệu tính lại ngay, không gọi AI.</div>`;
  const cards = wizardCompatGameOrder.map(gameType => {
    const meta = wizardGameMeta(gameType);
    const result = results.find(item => item.gameType === gameType);
    if (!result) return '';
    const selected = s.selectedGameType === gameType;
    const suggested = recommended === gameType;
    return `<article class="border rounded-[12px] p-[15px] bg-white min-w-0 flex flex-col gap-[8px] ${selected ? 'border-[#6258e8] shadow-[0_0_0_2px_#6258e826]' : 'border-line'}" data-wizard-recommendation="" data-game-type="${escapeHtml(gameType)}" data-selected="${selected ? 'true' : 'false'}" data-compat-compatible="${result.compatible}" data-compat-needs-review="${result.needsReview}" data-compat-incompatible="${result.incompatible}">
      <div class="flex items-center gap-[9px]"><span class="text-[24px]">${meta.icon}</span><div class="min-w-0"><strong class="text-[13px] block">${escapeHtml(meta.label)}${suggested ? ' <span class="px-1.5 py-0.5 rounded bg-[#eef2ff] text-[#4f46e5] text-[10px] font-bold" data-compat-recommended="true">Được đề xuất</span>' : ''}</strong><small class="text-[11px] text-[#788196]">Dùng được ${result.compatible}/${stats.total} câu · cần xem lại ${result.needsReview} · không tương thích ${result.incompatible}</small></div></div>
      <p class="text-[11px] text-[#5b6478] leading-[1.6] m-0">${escapeHtml(result.reason || meta.hint)}</p>
      <button class="btn ${selected ? 'btn-primary' : 'btn-secondary'} btn-small mt-auto" data-wizard-action="select-type" data-game-type="${escapeHtml(gameType)}" aria-pressed="${selected ? 'true' : 'false'}">${selected ? '✓ Đã chọn' : 'Chọn thể loại này'}</button>
    </article>`;
  }).join('');
  const blocked = s.selectedGameType ? wizardBlockedParsed(s.selectedGameType) : [];
  // Inline, never a dialog (#115 §2.4c): what the chosen genre would leave out, and
  // what the teacher can do about it. Nothing is dropped unless they pick that action.
  const blockedNote = !blocked.length
    ? ''
    : `<div class="mt-[10px] text-[11px] px-2.5 py-2 rounded-lg bg-[#fff8e6] border border-[#f6e3b4] text-[#7a5b00] dark:bg-[#2d2614] dark:border-[#4a3d1a] dark:text-[#fbbf24] leading-relaxed" data-compat-blocked-note>
        ${escapeHtml(wizardGameMeta(s.selectedGameType).label)} không dùng được ${blocked.length} câu: ${escapeHtml(wizardBlockedKindSummary(blocked))}.
        <div class="mt-1.5 flex flex-wrap gap-1.5">
          <span class="font-semibold">Chọn:</span>
          <button type="button" class="underline" data-wizard-action="select-type" data-game-type="${escapeHtml(recommended || 'arena')}">Đổi sang thể loại khác</button>
          <span class="opacity-60">hoặc</span>
          <button type="button" class="underline" data-wizard-action="bank-drop-blocked" data-game-type="${escapeHtml(s.selectedGameType)}">Bỏ các câu đó</button>
        </div>
      </div>`;
  return `<section class="form-panel" data-wizard-step-body="recommend" data-wizard-bank-step="1">${header}
    <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[12px]" id="wizardRecommendations">${cards}</div>
    ${blockedNote}
    ${s.selectedGameType ? `<div class="field-hint mt-[10px]" data-wizard-selected-type="1">Đang chọn: <strong>${escapeHtml(wizardGameMeta(s.selectedGameType).label)}</strong>. Bấm “Tạo trò chơi” để hoàn tất — câu hỏi của bạn được dùng nguyên vẹn, không qua AI.</div>` : ''}
    <div class="publish-actions">
      <button class="btn btn-secondary" data-wizard-action="back">← Nhập giáo án</button>
      <button class="btn btn-primary" id="wizardNextBtn" data-wizard-action="next"${s.selectedGameType ? '' : ' disabled'}${s.busy ? ' disabled' : ''}>${s.busy === 'save' ? '⏳ Đang tạo trò chơi…' : '✦ Tạo trò chơi →'}</button>
    </div>
  </section>`;
}

/** "2 câu điền khuyết, 1 câu đúng/sai" — counts only, no question text. */
function wizardBlockedKindSummary(blocked) {
  const labels = {
    'multiple-choice': 'trắc nghiệm',
    'true-false': 'đúng/sai',
    'fill-in-blank': 'điền khuyết',
    'short-answer': 'trả lời ngắn',
    'multi-answer': 'nhiều đáp án',
    'multi-tf': 'nhiều phát biểu đúng/sai',
    matching: 'ghép cặp'
  };
  const counts = new Map();
  for (const item of blocked) counts.set(item.kind, (counts.get(item.kind) || 0) + 1);
  return [...counts.entries()].map(([kind, count]) => `${count} câu ${labels[kind] || kind}`).join(', ');
}

/**
 * Re-scores the remaining questions through main (the scoring rules live in one
 * module there, and the renderer may not import it).
 */
async function wizardRefreshCompatibilityScores() {
  try {
    const result = await window.eduGame.classifyLessonInput({ text: String(wizardState.text || '') });
    if (result && Array.isArray(result.compatibility)) wizardState.questionCompatibility = result.compatibility;
    if (result && result.import) {
      wizardState.importedQuestions = result.import.questions || [];
      wizardState.importIssues = result.import.issues || [];
      wizardState.parsedQuestions = Array.isArray(result.import.parsed) ? result.import.parsed : [];
    }
  } catch {
    // Scoring is a convenience here; the genre cards keep their previous numbers.
  }
}

/**
 * The teacher's explicit "Bỏ các câu đó": the questions this genre cannot play leave
 * the bank (and its scores), so the draft and the counts agree. Never automatic —
 * only this click removes anything.
 */
function wizardDropBlockedQuestions(gameType) {
  if (!gameType || wizardState.busy) return;
  const blocked = new Set(wizardBlockedParsed(gameType));
  if (!blocked.size) return;
  wizardState.parsedQuestions = (wizardState.parsedQuestions || []).filter(item => !blocked.has(item));
  wizardState.importedQuestions = wizardState.importedQuestions || [];
  wizardSetNotice(`Đã bỏ ${blocked.size} câu không dùng được với ${wizardGameMeta(gameType).label}. Bạn quay lại bước nhập liệu để sửa câu nếu cần.`);
  render();
}

function renderWizardRecommend() {
  const s = wizardState;
  const loading = s.busy === 'recommend';
  const analysis = s.analysis;
  // #115: questions were recognised, so the genre is chosen from real compatibility
  // scores instead of a lesson analysis the run never produced.
  if ((s.importedMode || s.draftOrigin === 'source') && (s.questionCompatibility || []).length) {
    return renderWizardRecommendFromBank();
  }
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

async function wizardRecommendSelect(recommendationId) {
  const recommendation = wizardState.recommendations.find(item => item.id === recommendationId);
  if (!recommendation) return;
  const changed = wizardState.selectedGameType !== recommendation.gameType;
  const staleDraft = Boolean(wizardState.draft) && wizardState.draft.gameType !== recommendation.gameType;
  // §4: convert what can be converted instead of throwing the draft away.
  const outcome = staleDraft ? await wizardConvertOrDiscardForGenre(recommendation.gameType) : null;
  // Cancel must change nothing: same genre, same draft, same config.
  if (outcome && outcome.kind === 'cancelled') return;
  wizardState.selectedRecommendationId = recommendation.id;
  wizardState.selectedGameType = recommendation.gameType;
  wizardState.quick = null;
  if (changed || !wizardState.config) {
    wizardState.config = wizardDefaultConfig(recommendation, wizardState.analysis);
    wizardState.countTouched = false;
    wizardState.capacity = null;
  }
  if (outcome && outcome.kind === 'converted' && outcome.draft) {
    wizardState.draft = outcome.draft;
    wizardState.gameSnapshot = null;
    wizardState.gameId = null;
  } else if (staleDraft || (changed && !wizardState.draft)) {
    wizardDiscardGeneratedContent();
  }
  wizardClearMessages();
  render();
}

/**
 * Picks a genre that was not among the suggestions. The spec requires the
 * teacher to stay free to choose any of the five genres, so this builds the
 * same default config the recommender path would (no model call involved).
 */
async function wizardRecommendSelectType(gameType) {
  if (!gameType) return;
  const changed = wizardState.selectedGameType !== gameType;
  const staleDraft = Boolean(wizardState.draft) && wizardState.draft.gameType !== gameType;
  // §4: same local conversion as the suggestion path.
  const outcome = staleDraft ? await wizardConvertOrDiscardForGenre(gameType) : null;
  // Cancel must change nothing.
  if (outcome && outcome.kind === 'cancelled') return;
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
  if (outcome && outcome.kind === 'converted' && outcome.draft) {
    wizardState.draft = outcome.draft;
    wizardState.gameSnapshot = null;
    wizardState.gameId = null;
  } else if (staleDraft || (changed && !wizardState.draft)) {
    wizardDiscardGeneratedContent();
  }
  wizardClearMessages();
  render();
}

async function wizardRecommendNext() {
  // #115: an imported bank converts here, once — the same explicit click as the old
  // "use the questions" button, but for the genre the teacher just chose.
  if ((wizardState.importedMode || wizardState.draftOrigin === 'source') && (wizardState.parsedQuestions || []).length) {
    // Going back and forth must not re-convert: once the draft already is the chosen
    // genre there is nothing to do, so the teacher's edits are never overwritten.
    if (wizardState.draft && wizardState.draft.gameType === wizardState.selectedGameType) {
      wizardState.busy = 'save';
      wizardClearMessages();
      render();
      try {
        if (wizardState.gameSnapshot) {
          // #117: the game is already built for this genre — go straight to finishing,
          // never rebuild it (that would drop the teacher's edits).
          wizardState.step = 'generate';
          await wizardSaveProject('generate');
        } else {
          wizardState.step = 'configure';
          await wizardSaveProject('configure');
        }
      } catch (error) {
        wizardSetError(error);
      }
      wizardState.busy = '';
      render();
      return;
    }
    await wizardStartGameFromBank(wizardState.selectedGameType);
    return;
  }
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
