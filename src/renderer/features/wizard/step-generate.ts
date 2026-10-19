// @ts-nocheck -- renderer UI logic; workflow contracts are typed in src/shared/lesson-types.ts.
/** Wizard step 5 — generation lands in P6; this step shows the locked-in config. */

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

function renderWizardGenerate() {
  const s = wizardState;
  const config = s.config;
  const rows = wizardConfigSummaryRows(config);
  return `<section class="form-panel" data-wizard-step-body="generate">
    <div class="section-head"><h3>Bước 5 · Tạo nội dung trò chơi</h3><span class="tag">Sắp có · P6</span></div>
    <div class="panel-sub">Bước sinh câu hỏi/tình huống bằng AI local và mở trình soạn thảo sẽ được bật ở giai đoạn tiếp theo. Cấu hình và phân tích của bạn đã được lưu vào dự án nên có thể mở lại bất cứ lúc nào — không cần chạy lại AI.</div>
    ${rows.length ? `<div class="grid gap-[6px] bg-[#f8f9fc] border border-line rounded-[10px] p-[14px]">${rows.map(([label, value]) => `<div class="flex justify-between gap-[12px] text-[12px]"><span class="text-[#788196]">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>` : ''}
    <div class="publish-actions">
      <button class="btn btn-secondary" data-wizard-action="back">← Cấu hình</button>
      <button class="btn btn-secondary" data-wizard-action="save"${s.busy ? ' disabled' : ''}>Lưu dự án</button>
      <button class="btn btn-primary" id="wizardGenerateBtn" disabled title="Sẽ bật ở giai đoạn P6">✦ Tạo nội dung bằng AI local</button>
    </div>
    ${s.projectId ? `<div class="field-hint">Dự án đã lưu: <code>${escapeHtml(s.projectId)}</code>. Vào “Dự án của tôi” để xem lại.</div>` : ''}
  </section>`;
}
