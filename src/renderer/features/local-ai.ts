// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function localModelLabel(model) {
  return model ? (model.friendlyName || model.displayName) : 'Chưa chọn';
}
function localModalCard(model, machine) {
  const status = model.installed
    ? machine.runtimeInstalled ? 'Đã tải đầy đủ' : 'Đã tải model · thiếu runtime'
    : 'Chưa tải';
  return `<div class="editor-question" data-local-model="${escapeHtml(model.id)}">`
    + `<div class="editor-question-head"><strong>${escapeHtml(model.friendlyName || model.displayName)}</strong><span class="tag">${escapeHtml(status)}${model.id === machine.recommendedModelId ? ' · Đề xuất' : ''}</span></div>`
    + `<p class="small muted mb-[8px] mt-0">${escapeHtml(model.tagline || '')}</p>`
    + `<p class="small muted mb-[8px] mt-0">Dung lượng ${formatBytes(model.sizeBytes)} · RAM tối thiểu ${formatBytes(model.minimumRamBytes)}, khuyến nghị ${formatBytes(model.recommendedRamBytes)} · ${escapeHtml(model.recommendationReason || '')}</p>`
    + `<p class="small muted mb-[8px] mt-0">Kỹ thuật: ${escapeHtml(model.displayName)} · Giấy phép ${escapeHtml(model.licenseName)}</p>`
    + `<div class="flex items-center gap-[8px] flex-wrap"><button class="btn btn-secondary btn-small" data-local-download="${escapeHtml(model.id)}" ${machine.runtimeSupported === false ? 'disabled' : ''}>${model.installed ? 'Xác minh lại' : 'Tải model này'}</button>`
    + `<span class="field-hint" data-local-progress="${escapeHtml(model.id)}">${model.installed ? 'Đã có trên máy; nhấn Tải để xác minh lại.' : 'Chưa có trên máy.'}</span></div></div>`;
}
function localRuntimeStateLabel(machine) {
  if (machine.runtimeState === 'READY') {
    const running = (state.localAiModels || []).find(model => model.id === machine.runtimeModelId);
    return `Đang chạy${running ? ` · ${localModelLabel(running)}` : ''}`;
  }
  if (machine.runtimeState === 'STARTING') return 'Đang khởi động…';
  return 'Chưa chạy';
}
function openLocalAiModal() {
  const machine = state.localAiMachine || {};
  const models = state.localAiModels || [];
  const selectedId = state.draft?.localModelId || state.settings.ai?.localModelId || machine.recommendedModelId || models[0]?.id || '';
  const running = machine.runtimeState === 'READY';
  const starting = machine.runtimeState === 'STARTING';
  const cards = models.map(model => localModalCard(model, machine)).join('');
  $('#modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><h2>Cửa sổ AI local · llama.cpp</h2><div class="small muted mt-[5px]">Chọn bản Nhanh / Linh hoạt / Chuyên sâu, tải đầy đủ rồi nhấn “Bắt đầu chạy”. Runtime chỉ chạy khi bạn yêu cầu.</div></div><button class="modal-close" data-close>✕</button></div>`
    + `<div class="modal-body">`
    + `${machine.runtimeSupported === false ? '<div class="info-box"><strong>Chưa hỗ trợ cấu hình này</strong><p>Runtime AI local tích hợp hiện chỉ hỗ trợ Windows x64.</p></div>' : ''}`
    + `<div class="field"><label>MODEL SẼ CHẠY</label><select id="localModalSelect">${models.map(model => `<option value="${escapeHtml(model.id)}" ${model.id === selectedId ? 'selected' : ''}>${escapeHtml(model.friendlyName || model.displayName)}${model.installed ? ' · Đã tải' : ''}</option>`).join('')}</select><div class="field-hint">Model được chọn ở đây sẽ dùng chung cho màn hình Tạo trò chơi.</div></div>`
    + `<p><strong>Trạng thái chạy:</strong> ${escapeHtml(localRuntimeStateLabel(machine))}</p>`
    + `${cards || '<p>Đang nạp danh sách model…</p>'}`
    + `<div id="localModalProgress" class="field-hint"></div>`
    + `</div><div class="modal-foot"><button class="btn btn-secondary" data-close>Đóng</button>${running ? '<button class="btn btn-secondary" id="stopLocalRuntimeBtn">Dừng llama.cpp</button>' : ''}<button class="btn btn-primary" id="startLocalRuntimeBtn" ${starting || machine.runtimeSupported === false ? 'disabled' : ''}>▶ Bắt đầu chạy</button></div></div></div>`;
  const root = $('#modalRoot');
  root.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => { root.innerHTML = ''; }));
  root.querySelectorAll('[data-local-download]').forEach(btn => btn.addEventListener('click', () => installLocalModel(btn.dataset.localDownload)));
  $('#startLocalRuntimeBtn', root)?.addEventListener('click', startLocalRuntimeFromModal);
  $('#stopLocalRuntimeBtn', root)?.addEventListener('click', stopLocalRuntimeFromModal);
}
async function refreshLocalAiState() {
  try {
    const result = await window.eduGame.getLocalAiModels();
    state.localAiModels = result.models;
    state.localAiMachine = result.machine;
    state.settings = await window.eduGame.getSettings();
  } catch (error) {
    toast(error.message || 'Không nạp được danh sách AI local.');
  }
}
async function installLocalModel(requestedModelId) {
  const modelId = requestedModelId
    || ($('#localModalSelect')?.value)
    || ($('#localModelSelect')?.value);
  if (!modelId) return toast('Chọn model trước khi tải.');
  const inModal = Boolean($('#modalRoot')?.querySelector('[data-local-download]'));
  const button = inModal
    ? $(`[data-local-download="${modelId}"]`)
    : $('#installLocalModelBtn');
  const progress = inModal
    ? $(`[data-local-progress="${modelId}"]`)
    : $('#localAiProgress');
  if (button) { button.disabled = true; button.textContent = 'Đang tải…'; }
  const unsubscribe = window.eduGame.onLocalAiProgress(value => {
    if (value.stage === 'starting') {
      const modalProgress = $('#localModalProgress');
      if (modalProgress?.isConnected) modalProgress.textContent = 'Đang khởi động llama.cpp…';
      return;
    }
    if (value.modelId && value.modelId !== modelId) return;
    if (!progress?.isConnected) return;
    const phase = value.stage === 'runtime' ? 'Đang tải llama.cpp' : 'Đang tải model';
    const percent = value.totalBytes ? Math.min(100, Math.floor(value.receivedBytes / value.totalBytes * 100)) : 0;
    progress.textContent = `${phase}: ${formatBytes(value.receivedBytes)} / ${formatBytes(value.totalBytes)} (${percent}%)`;
  });
  try {
    const result = await window.eduGame.installLocalAiModel(modelId);
    state.localAiModels = result.models.models;
    state.localAiMachine = result.models.machine;
    state.settings = await window.eduGame.getSettings();
    if (state.page === 'create' && !inModal) {
      state.draft = { ...collectDraft(), localModelId: modelId, mode: 'local' };
      render();
    }
    if (inModal) openLocalAiModal();
    else if (state.page === 'settings') render();
    toast('Đã tải và xác minh đầy đủ. Hãy nhấn “Bắt đầu chạy” để khởi động llama.cpp.');
  } catch (error) {
    toast(error.message || 'Không thể tải model AI local.', 6000);
  } finally {
    unsubscribe();
    if (inModal && $('#modalRoot')?.isConnected) openLocalAiModalRefreshOnly();
    else if (button?.isConnected) {
      button.disabled = false;
      button.textContent = 'Tải / xác minh model và runtime';
    }
  }
}
function openLocalAiModalRefreshOnly() {
  try {
    const selected = $('#localModalSelect')?.value;
    openLocalAiModal();
    if (selected) {
      const next = $('#localModalSelect');
      if (next) next.value = selected;
    }
  } catch { /* modal đã đóng */ }
}
async function startLocalRuntimeFromModal() {
  const root = $('#modalRoot');
  const select = $('#localModalSelect', root);
  const modelId = select?.value;
  if (!modelId) return toast('Hãy chọn model trước khi chạy.');
  const model = (state.localAiModels || []).find(item => item.id === modelId);
  if (!model?.installed || !state.localAiMachine?.runtimeInstalled) {
    return toast('Model này chưa tải đầy đủ. Hãy nhấn “Tải model này” trước, rồi mới nhấn “Bắt đầu chạy”.', 6000);
  }
  const startBtn = $('#startLocalRuntimeBtn', root);
  const progress = $('#localModalProgress', root);
  if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Đang khởi động llama.cpp…'; }
  if (progress) progress.textContent = 'Đang khởi động llama.cpp trên CPU; lần đầu có thể mất vài phút…';
  try {
    const result = await window.eduGame.startLocalRuntime(modelId);
    state.localAiModels = result.models.models;
    state.localAiMachine = result.models.machine;
    state.settings = await window.eduGame.getSettings();
    if (state.page === 'create') state.draft = { ...collectDraft(), localModelId: modelId, mode: 'local', assistMode: 'local' };
    root.innerHTML = '';
    if (state.page === 'create') render();
    else if (state.page === 'settings') render();
    toast('llama.cpp đã chạy. Ứng dụng sẽ tự tổng hợp tài liệu.');
    const summarizeAfterStart = state.pendingDocumentSummary && state.page === 'create';
    state.pendingDocumentSummary = false;
    if (summarizeAfterStart) await assistWithDocument('summarize', 'local');
  } catch (error) {
    toast(error.message || 'Không khởi động được llama.cpp.', 6000);
    if (startBtn?.isConnected) { startBtn.disabled = false; startBtn.textContent = '▶ Bắt đầu chạy'; }
  }
}
async function stopLocalRuntimeFromModal() {
  try {
    const result = await window.eduGame.stopLocalRuntime();
    state.localAiModels = result.models.models;
    state.localAiMachine = result.models.machine;
    $('#modalRoot').innerHTML = '';
    if (state.page === 'create' || state.page === 'settings') render();
    toast('Đã dừng llama.cpp.');
  } catch (error) {
    toast(error.message || 'Không dừng được llama.cpp.');
  }
}
