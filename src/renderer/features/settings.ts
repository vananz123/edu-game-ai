// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
async function saveSettings() {
  const settings = {
    ai: { ...state.settings.ai, mode: $('#settingAiMode').value, cloudProvider: $('#settingCloudProvider').value, baseUrl: $('#settingBaseUrl').value.trim(), model: $('#settingModel').value.trim(), apiKey: $('#settingApiKey').value },
    preferences: {
      ...(state.settings.preferences || {}),
      largeText: $('#settingLargeText').checked,
      sound: $('#settingSound').checked,
      audience: $('#settingAudience')?.value || 'teen',
      teachingStyle: {
        tone: $('#settingStyleTone')?.value || 'thân thiện',
        humor: $('#settingStyleHumor')?.value || 'vừa phải',
        examples: $('#settingStyleExamples')?.value.trim() || '',
        visualStyle: $('#settingVisualStyle')?.value || 'hiện đại sinh động',
        notes: $('#settingStyleNotes')?.value.trim() || ''
      }
    }
  };
  await window.eduGame.saveSettings(settings);
  state.settings = await window.eduGame.getSettings();
  if (state.draft) {
    state.draft = {
      ...state.draft,
      mode: state.settings.ai?.mode || 'offline',
      localModelId: state.settings.ai?.localModelId
    };
  }
  toast('Đã lưu cài đặt.');
}
async function testAi() {
  const settings = { ai: { ...state.settings.ai, mode: $('#settingAiMode').value, cloudProvider: $('#settingCloudProvider').value, baseUrl: $('#settingBaseUrl').value.trim(), model: $('#settingModel').value.trim(), apiKey: $('#settingApiKey').value }, preferences: state.settings.preferences };
  await window.eduGame.saveSettings(settings); state.settings = await window.eduGame.getSettings();
  if ($('#settingAiMode').value === 'offline') return toast('Chế độ ngoại tuyến không cần kiểm tra kết nối.');
  const button = $('#testAiBtn'); button.disabled = true; button.textContent = 'Đang kiểm tra…';
  try {
    const result = await window.eduGame.generateGame({ mode:settings.ai.mode, localModelId: state.settings.ai?.localModelId, baseUrl: settings.ai.baseUrl, model: settings.ai.model, apiKey: settings.ai.apiKey, text:'Bài học mẫu: Cây cần ánh sáng, nước và chất dinh dưỡng để sinh trưởng. Hãy tạo 3 câu hỏi ngắn.', questionCount:3, template:'quiz', subject:'Khoa học' });
    toast(`Kết nối AI thành công (${result.provider}).`);
  } catch(e) { toast(`Chưa kết nối được: ${e.message}`, 5000); }
  finally { button.disabled = false; button.textContent = 'Kiểm tra kết nối AI'; }
}

// ---------------------------------------------------------------------------
// update_plan_3 §8: AI task manager UI (settings page).
// Pure view over `window.eduGame.listAiTasks()` / `verifyCpuRuntime()` — no
// task state lives in the renderer; history rows are always `restored: true`.
// ---------------------------------------------------------------------------

const AI_TASK_STATE_LABELS = {
  queued: 'Chờ xử lý',
  running: 'Đang chạy',
  completed: 'Hoàn thành',
  failed: 'Thất bại',
  cancelled: 'Đã huỷ'
};

const AI_TASK_STATE_CLASSES = {
  queued: 'bg-[#f5f6fa] text-[#788196]',
  running: 'bg-[#fff8e1] text-[#6b5600]',
  completed: 'bg-[#e8f8f2] text-[#0f7b5c]',
  failed: 'bg-[#fdecea] text-[#b3261e]',
  cancelled: 'bg-[#f5f6fa] text-[#788196]'
};

const AI_TASK_KIND_LABELS = {
  analyze: 'Phân tích giáo án',
  generate: 'Sinh nội dung',
  'regenerate-item': 'Tạo lại một mục',
  qa: 'Hỏi đáp',
  summarize: 'Tóm tắt',
  legacy: 'Tác vụ khác'
};

function aiTaskWhen(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function aiTaskRowHtml(task) {
  const state = String(task.state || '');
  const kind = AI_TASK_KIND_LABELS[task.kind] || task.kind || 'Tác vụ AI';
  const label = escapeHtml(String(task.label || kind));
  const badge = `<span class="inline-block px-[7px] py-[3px] rounded-[6px] text-[10px] font-bold whitespace-nowrap ${AI_TASK_STATE_CLASSES[state] || 'bg-[#f5f6fa] text-[#788196]'}">${AI_TASK_STATE_LABELS[state] || state}</span>`;
  const restored = task.restored ? '<span class="text-[10px] text-[#9199aa]">· lịch sử</span>' : '';
  const progress = task.progress && task.progress !== 'running' ? `<span class="text-[10px] text-[#9199aa]">· ${escapeHtml(String(task.progress))}</span>` : '';
  const summary = task.resultSummary ? `<div class="text-[11px] text-[#515c72] mt-[3px]">Kết quả: ${escapeHtml(String(task.resultSummary))}</div>` : '';
  const error = task.errorCode || task.errorMessage
    ? `<div class="text-[11px] text-[#b3261e] mt-[3px]">${task.errorCode ? escapeHtml(String(task.errorCode)) + ': ' : ''}${escapeHtml(String(task.errorMessage || ''))}</div>`
    : '';
  return `<div class="bg-[#f8f9fc] border border-line rounded-[10px] p-[12px]">
    <div class="flex justify-between items-start gap-[10px]">
      <div class="min-w-0">
        <div class="text-[12px] font-bold">${label} <span class="text-[10px] text-[#9199aa] font-normal">${escapeHtml(kind)}</span></div>
        <div class="text-[10px] text-[#9199aa] mt-[2px]">${aiTaskWhen(task.startedAt)}${task.finishedAt ? ` → ${aiTaskWhen(task.finishedAt)}` : ''} ${restored} ${progress}</div>
        ${summary}${error}
      </div>
      ${badge}
    </div>
  </div>`;
}

/** Loads live tasks + SQLite history and renders them (newest first, deduped by taskId). */
async function refreshAiTaskList() {
  const container = $('#aiTaskList');
  if (!container) return;
  try {
    const result = await window.eduGame.listAiTasks({ limit: 30 });
    const byTaskId = new Map();
    for (const task of result.history || []) byTaskId.set(task.taskId, task);
    // Live rows override history: they carry the true current state of this session.
    for (const task of result.live || []) byTaskId.set(task.taskId, task);
    const tasks = [...byTaskId.values()].sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
    container.innerHTML = tasks.length
      ? tasks.map(aiTaskRowHtml).join('')
      : '<div class="text-[11px] text-[#9199aa]">Chưa có tác vụ AI nào. Các tác vụ phân tích/sinh nội dung sẽ xuất hiện ở đây.</div>';
  } catch (error) {
    container.innerHTML = `<div class="text-[11px] text-[#b3261e]">Không đọc được danh sách tác vụ: ${escapeHtml(String(error && error.message ? error.message : error))}</div>`;
  }
}

/** update_plan_3 §4: shows measured CPU-only facts for the bundled runtime. */
async function verifyCpuRuntimeUi() {
  const box = $('#cpuVerifyResult');
  const button = $('#cpuRuntimeVerifyBtn');
  if (!box) return;
  if (button) { button.disabled = true; button.textContent = 'Đang xác minh…'; }
  try {
    const result = await window.eduGame.verifyCpuRuntime();
    const lines = [
      `Backend: ${result.backend}`,
      `Phiên bản runtime: ${result.expectedVersion}`,
      `Đã cài: ${result.installed ? 'có' : 'chưa'}`,
      `Số tệp trong thư mục runtime: ${(result.files || []).length}`,
      `Tệp gợi ý backend GPU: ${(result.gpuMarkers || []).length ? result.gpuMarkers.join(', ') : 'không'}`,
      `Tham số khởi động: ${(result.args || []).join(' ')}`,
      result.note
    ];
    box.innerHTML = `<div class="grid gap-[4px]">${lines.map(line => `<div>${escapeHtml(String(line))}</div>`).join('')}</div>`;
    box.classList.remove('hidden');
  } catch (error) {
    box.innerHTML = `<div class="text-[#b3261e]">Không xác minh được runtime: ${escapeHtml(String(error && error.message ? error.message : error))}</div>`;
    box.classList.remove('hidden');
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Xác minh runtime CPU'; }
  }
}

/** Called by the controller when the settings page is (re)wired. */
function wireSettingsAiTasks() {
  $('#aiTasksRefreshBtn')?.addEventListener('click', refreshAiTaskList);
  $('#cpuRuntimeVerifyBtn')?.addEventListener('click', verifyCpuRuntimeUi);
  refreshAiTaskList();
}
