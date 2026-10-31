// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
/**
 * The backend the teacher picked in Settings.
 *
 * Returns `'cpu'`/`'vulkan'` for an explicit choice, and `undefined` for
 * "Tự động" (or when the select is not rendered). Returning `undefined` on
 * purpose rather than `'auto'` matters twice over: the key disappears from the
 * saved file (the main process round-trips settings through
 * `JSON.parse(JSON.stringify(...))`, which drops `undefined` values), so
 * switching back from Vulkan really clears the preference instead of leaving the
 * old value in place; and "no preference" stays defined in exactly one place,
 * the resolver.
 */
function readRuntimeBackendSelection() {
  const select = $('#localRuntimeBackendSelect');
  if (!select) return undefined;
  const value = select.value;
  return value === 'cpu' || value === 'vulkan' ? value : undefined;
}
/**
 * #132: the settings form sends only what changed, and never a stored key.
 *
 * `providerPatches` carries one entry per provider the teacher touched:
 *  - `baseUrl`/`model` are sent always (they are visible and editable);
 *  - `apiKey` is sent only when the field is non-empty (an empty field means
 *    "keep the stored key", never "delete it");
 *  - `clearKey` removes the stored key explicitly.
 * Main drops everything else from `ai` (keys included), so a stale renderer can
 * never overwrite the encrypted blobs.
 */
function readAiProviderPatches() {
  const patches = {};
  $$('[data-ai-provider]').forEach(node => {
    const id = node.dataset.aiProvider;
    if (!id) return;
    const baseUrl = $(`[data-ai-provider-baseurl="${id}"]`);
    const model = $(`[data-ai-provider-model="${id}"]`);
    const key = $(`[data-ai-key-input="${id}"]`);
    const patch = {};
    if (baseUrl) patch.baseUrl = baseUrl.value.trim();
    if (model) patch.model = model.value.trim();
    if (key && key.value.trim()) patch.apiKey = key.value.trim();
    if (node.dataset.aiKeyClear === '1') patch.clearKey = true;
    patches[id] = patch;
  });
  return patches;
}
async function saveSettings() {
  const settings = {
    ai: { ...state.settings.ai, runtimeBackend: readRuntimeBackendSelection(), providers: readAiProviderPatches() },
    preferences: {
      ...(state.settings.preferences || {}),
      largeText: $('#settingLargeText').checked,
      sound: $('#settingSound').checked,
      audience: $('#settingAudience')?.value || 'teen',
      theme: $('#settingTheme')?.value || state.settings.preferences?.theme || 'light',
      teachingStyle: {
        tone: $('#settingStyleTone')?.value || 'thân thiện',
        humor: $('#settingStyleHumor')?.value || 'vừa phải',
        examples: $('#settingStyleExamples')?.value.trim() || '',
        visualStyle: $('#settingVisualStyle')?.value || 'hiện đại sinh động',
        notes: $('#settingStyleNotes')?.value.trim() || ''
      }
    }
  };
  // Strip any key-shaped field a stale page may still hold: keys travel only via
  // `providers[id].apiKey`, and that is decided above.
  delete settings.ai.apiKey;
  delete settings.ai.apiKeyEncrypted;
  const result = await window.eduGame.saveSettings(settings);
  state.settings = (result && result.settings) || await window.eduGame.getSettings();
  applyTheme(state.settings && state.settings.preferences && state.settings.preferences.theme);
  if (state.draft) {
    state.draft = {
      ...state.draft,
      mode: state.settings.ai?.mode || 'offline',
      localModelId: state.settings.ai?.localModelId
    };
  }
  toast('Đã lưu cài đặt.');
  if (state.page === 'settings') render();
}
/**
 * Connection test for one provider (spec §4: real, minimal requests, independent of
 * game creation). The result moves the provider between `ready` and `failing`.
 */
async function testAi() {
  const ai = state.settings.ai || {};
  if (ai.mode === 'offline') {
    // Kept for the legacy callers (tests/legacy/smoke2.js): offline needs no test.
    await saveSettings();
    return toast('Chế độ ngoại tuyến không cần kiểm tra kết nối.');
  }
  return testAiProvider(ai.provider);
}
async function testAiProvider(providerId) {
  // Wait for a key that is still being saved: the test must check what the teacher
  // just typed, not the key that was there before it.
  if (aiKeySaveInFlight) {
    try { await aiKeySaveInFlight; } catch (error) { /* reported by its own caller */ }
  }
  const id = String(providerId || (state.settings.ai && state.settings.ai.provider) || '');
  const button = document.querySelector(`[data-ai-test="${id}"]`);
  const restore = button ? button.textContent : '';
  if (button) { button.disabled = true; button.textContent = 'Đang kiểm tra…'; }
  try {
    // Save what the form shows first: a test must check the values the teacher sees,
    // not the previous saved state.
    await window.eduGame.saveSettings({ ai: { ...state.settings.ai, providers: readAiProviderPatches() }, preferences: state.settings.preferences });
    const result = await window.eduGame.testAiProvider({ providerId: id });
    state.settings = (result && result.settings) || await window.eduGame.getSettings();
    toast(`Kết nối ${(aiProviderView(id) || {}).label || id} thành công (${result.durationMs} ms).`);
  } catch (error) {
    state.settings = await window.eduGame.getSettings();
    const message = String((error && error.message) || error || '').replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^[A-Za-z]*Error:\s*/, '');
    toast(`Chưa kết nối được ${(aiProviderView(id) || {}).label || id}: ${message}`, 7000);
  } finally {
    if (button) { button.disabled = false; button.textContent = restore; }
    if (state.page === 'settings') render();
  }
}
/** Saves the key typed for one provider; an empty field is not a change. */
// #132: the pending "save key" request. A connection test must wait for it, or it can
// read the previous key and report AI_AUTH for a key that was just entered.
let aiKeySaveInFlight = null;
async function saveAiProviderKey(providerId) {
  const input = document.querySelector(`[data-ai-key-input="${providerId}"]`);
  if (!input || !input.value.trim()) return toast('Hãy nhập khoá mới trước khi lưu.');
  try {
    // The key save sends the form as it stands: a base URL or model typed just
    // before the key must not be lost when the page re-renders afterwards.
    const request = window.eduGame.saveSettings({ ai: { ...state.settings.ai, providers: { ...readAiProviderPatches(), [providerId]: { ...(readAiProviderPatches()[providerId] || {}), apiKey: input.value.trim() } } }, preferences: state.settings.preferences });
    aiKeySaveInFlight = request;
    const result = await request;
    state.settings = (result && result.settings) || await window.eduGame.getSettings();
    toast('Đã lưu khoá. Hãy bấm “Kiểm tra kết nối”.');
  } catch (error) {
    const message = String((error && error.message) || error || '');
    if (/AI_KEY_STORAGE_UNAVAILABLE/.test(message)) {
      toast('Máy này không lưu được khoá an toàn. Khoá chưa được lưu; cấu hình cũ giữ nguyên.', 8000);
    } else {
      toast(`Không lưu được khoá: ${message}`, 7000);
    }
  } finally {
    aiKeySaveInFlight = null;
  }
  if (state.page === 'settings') render();
}
/**
 * Removes a stored key through the Save bar (never on the keystroke, so the teacher
 * can still change their mind before leaving the page): the flag is shown on the
 * card and sent by `readAiProviderPatches` on the next save.
 */
function markAiProviderKeyClear(providerId) {
  const node = document.querySelector(`[data-ai-provider="${providerId}"]`);
  if (!node) return;
  node.dataset.aiKeyClear = node.dataset.aiKeyClear === '1' ? '0' : '1';
  const stateLine = node.querySelector(`[data-ai-key-state="${providerId}"]`);
  if (stateLine) {
    stateLine.textContent = node.dataset.aiKeyClear === '1'
      ? 'Khoá sẽ bị xoá khi bạn bấm “Lưu cài đặt” (bấm lại để huỷ).'
      : 'Đã lưu khoá.';
  }
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

/**
 * #121: history pages. 10 rows a page over the 30 rows the store keeps, so a teacher
 * can still reach a task from earlier today without the page growing forever.
 */
const AI_TASK_PAGE_SIZE = 10;
const AI_TASK_PAGES_MAX = 3;
let aiTaskPage = 0;
/** Set while a refresh is in flight, so two `refreshAiTaskList` calls cannot race. */
let aiTaskRefreshToken = 0;

function aiTaskPageCount(total) {
  const pages = Math.ceil(Math.max(0, Number(total) || 0) / AI_TASK_PAGE_SIZE);
  return Math.max(1, Math.min(AI_TASK_PAGES_MAX, pages));
}

/** Previous / next / "Trang 2/3 · 30 tác vụ gần nhất" under the list. */
function aiTaskPagerHtml(page, pages, total) {
  const button = (label, target, disabled, id) =>
    `<button type="button" class="px-[10px] py-[6px] rounded-[7px] border border-[#e7eaf2] bg-white text-[11px] font-semibold text-[#515c72] disabled:opacity-50 disabled:cursor-not-allowed" id="${id}" data-ai-task-page="${target}"${disabled ? ' disabled' : ''}>${label}</button>`;
  return `<div class="flex items-center justify-between gap-[10px] mt-[8px] flex-wrap" data-ai-task-pager>
    <span class="text-[11px] text-[#9199aa]">Trang <b>${page + 1}</b>/${pages} · ${total} tác vụ gần nhất${total >= AI_TASK_PAGE_SIZE * AI_TASK_PAGES_MAX ? ' (cũ hơn tự động xoá)' : ''}</span>
    <div class="flex gap-[6px]">${button('← Trước', Math.max(0, page - 1), page <= 0, 'aiTasksPrevBtn')}${button('Sau →', Math.min(pages - 1, page + 1), page >= pages - 1, 'aiTasksNextBtn')}</div>
  </div>`;
}

/**
 * Loads live tasks + one page of SQLite history and renders them (newest first,
 * deduped by taskId). The live registry is merged in on every page: a task running
 * right now belongs at the top, and it also pushes the history rows down a slot — the
 * page index follows that shift so the teacher's view does not jump.
 */
async function refreshAiTaskList() {
  const container = $('#aiTaskList');
  if (!container) return;
  const token = ++aiTaskRefreshToken;
  try {
    // The first page is where a brand-new task shows up; other pages also need live
    // rows so a running task is visible from anywhere.
    const result = await window.eduGame.listAiTasks({
      limit: AI_TASK_PAGE_SIZE,
      offset: aiTaskPage * AI_TASK_PAGE_SIZE,
      history: true
    });
    if (token !== aiTaskRefreshToken || !$('#aiTaskList')) return;
    const byTaskId = new Map();
    for (const task of result.history || []) byTaskId.set(task.taskId, task);
    // Live rows override history: they carry the true current state of this session.
    for (const task of result.live || []) byTaskId.set(task.taskId, task);
    const tasks = [...byTaskId.values()].sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
    const total = Number(result.total) || tasks.length;
    const pages = aiTaskPageCount(total);
    if (aiTaskPage > pages - 1) aiTaskPage = pages - 1;
    const rows = tasks.slice(0, AI_TASK_PAGE_SIZE);
    container.innerHTML = (rows.length
      ? rows.map(aiTaskRowHtml).join('')
      : '<div class="text-[11px] text-[#9199aa]">Chưa có tác vụ AI nào. Các tác vụ phân tích/sinh nội dung sẽ xuất hiện ở đây.</div>')
      + aiTaskPagerHtml(aiTaskPage, pages, total);
    container.querySelectorAll('[data-ai-task-page]').forEach(button => {
      button.addEventListener('click', () => {
        const target = Number(button.dataset.aiTaskPage);
        if (!Number.isFinite(target) || target === aiTaskPage) return;
        aiTaskPage = Math.max(0, Math.min(pages - 1, target));
        refreshAiTaskList();
      });
    });
  } catch (error) {
    if (token !== aiTaskRefreshToken) return;
    container.innerHTML = `<div class="text-[11px] text-[#b3261e]">Không đọc được danh sách tác vụ: ${escapeHtml(String(error && error.message ? error.message : error))}</div>`;
  }
}

/**
 * Keeps the list current while the settings page is open: a new task is recorded in
 * the database by main, so the page re-reads the first page when the live count grows.
 */
function startAiTaskAutoRefresh() {
  const timer = setInterval(async () => {
    if (state.page !== 'settings') { clearInterval(timer); return; }
    try {
      const live = await window.eduGame.listAiTasks({ limit: 5, history: false });
      const key = (live.live || []).map(task => `${task.taskId}:${task.state}`).join('|');
      if (key !== startAiTaskAutoRefresh.lastLive) {
        startAiTaskAutoRefresh.lastLive = key;
        if (aiTaskPage !== 0) aiTaskPage = 0;
        refreshAiTaskList();
      }
    } catch {
      // The page still works with the rows it has; the next tick tries again.
    }
  }, 5000);
  clearTimeout(startAiTaskAutoRefresh.timer);
  startAiTaskAutoRefresh.timer = timer;
}
startAiTaskAutoRefresh.lastLive = '';
startAiTaskAutoRefresh.timer = null;

/**
 * update_plan_3 §4, extended for the backend choice: reports which llama.cpp
 * build this machine will actually run, with the real flags, so a teacher who
 * picked the GPU can confirm the choice took effect (or that it fell back).
 */
async function verifyCpuRuntimeUi() {
  const box = $('#cpuVerifyResult');
  const button = $('#cpuRuntimeVerifyBtn');
  if (!box) return;
  if (button) { button.disabled = true; button.textContent = 'Đang xác minh…'; }
  try {
    const result = await window.eduGame.verifyCpuRuntime();
    const lines = [
      `Bộ xử lý đang dùng: ${result.backend}`,
      `Phiên bản runtime: ${result.expectedVersion}`,
      `Đã cài: ${result.installed ? 'có' : 'chưa'}`,
      `Số tệp trong thư mục runtime: ${(result.files || []).length}`,
      `Tệp gợi ý backend GPU: ${(result.gpuMarkers || []).length ? result.gpuMarkers.join(', ') : 'không'}`,
      `GPU nhận diện được: ${(result.gpuNames || []).length ? result.gpuNames.join(', ') : 'không đọc được'}`,
      `Tham số khởi động: ${(result.args || []).join(' ')}`,
      result.note
    ];
    box.innerHTML = `<div class="grid gap-[4px]">${lines.map(line => `<div>${escapeHtml(String(line))}</div>`).join('')}</div>`;
    box.classList.remove('hidden');
  } catch (error) {
    box.innerHTML = `<div class="text-[#b3261e]">Không xác minh được runtime: ${escapeHtml(String(error && error.message ? error.message : error))}</div>`;
    box.classList.remove('hidden');
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Xác minh runtime AI local'; }
  }
}

/** O10: one file to send back — machine facts + recent id/count/timing log lines. */
async function exportDiagnosticsUi() {
  const button = $('#exportDiagnosticsBtn');
  const box = $('#diagnosticsResult');
  if (!box) return;
  if (button) { button.disabled = true; button.textContent = 'Đang xuất…'; }
  try {
    const result = await window.eduGame.exportDiagnostics();
    box.classList.remove('hidden');
    box.innerHTML = `<strong>Đã lưu ${result.lines} dòng log.</strong><br>Gửi tệp này cho người hỗ trợ:<br><code>${escapeHtml(result.path)}</code>`;
  } catch (error) {
    box.classList.remove('hidden');
    box.innerHTML = `<span class="text-[#b3261e]">Không xuất được gói chẩn đoán: ${escapeHtml(String(error && error.message ? error.message : error))}</span>`;
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Xuất gói chẩn đoán'; }
  }
}

/** O10: opens the folder that holds ai-YYYY-MM-DD.jsonl and diagnostics-*.txt. */
async function openLogFolderUi() {
  const box = $('#diagnosticsResult');
  try {
    const result = await window.eduGame.openDiagnosticsFolder();
    if (!box) return;
    box.classList.remove('hidden');
    box.innerHTML = result.ok
      ? `Đã mở thư mục log:<br><code>${escapeHtml(result.path)}</code>`
      : `<span class="text-[#b3261e]">Không mở được thư mục log: ${escapeHtml(result.error || result.path)}</span>`;
  } catch (error) {
    if (!box) return;
    box.classList.remove('hidden');
    box.innerHTML = `<span class="text-[#b3261e]">Không mở được thư mục log: ${escapeHtml(String(error && error.message ? error.message : error))}</span>`;
  }
}

/** O10: shows where the log lives and how much is stored, before the teacher exports. */
async function refreshDiagnosticsInfo() {
  const info = $('#diagnosticsInfo');
  if (!info) return;
  try {
    const result = await window.eduGame.diagnosticsInfo();
    const megabytes = (result.bytes / (1024 * 1024)).toFixed(1);
    info.textContent = `Log trên máy: ${result.files} tệp · ${megabytes} MB · tự xóa sau ${result.retentionDays} ngày · ${result.folder}`;
  } catch (error) {
    info.textContent = `Không đọc được thư mục log: ${String(error && error.message ? error.message : error)}`;
  }
}

// O10: deleting is irreversible, so the button asks for a second click within 4 s
// instead of a native confirm dialog (which would block the window).
let diagnosticsClearArmed = false;
let diagnosticsClearTimer = null;

async function clearDiagnosticsUi() {
  const button = $('#clearDiagnosticsBtn');
  const box = $('#diagnosticsResult');
  if (!button || !box) return;
  if (!diagnosticsClearArmed) {
    diagnosticsClearArmed = true;
    button.textContent = 'Bấm lần nữa để xóa';
    if (diagnosticsClearTimer) clearTimeout(diagnosticsClearTimer);
    diagnosticsClearTimer = setTimeout(() => {
      diagnosticsClearArmed = false;
      diagnosticsClearTimer = null;
      button.textContent = 'Xóa log trên máy';
    }, 4000);
    return;
  }
  diagnosticsClearArmed = false;
  if (diagnosticsClearTimer) { clearTimeout(diagnosticsClearTimer); diagnosticsClearTimer = null; }
  button.disabled = true;
  try {
    const result = await window.eduGame.clearDiagnostics();
    const megabytes = (result.bytes / (1024 * 1024)).toFixed(1);
    box.classList.remove('hidden');
    box.innerHTML = `Đã xóa ${result.removed} tệp log (${megabytes} MB) trong dữ liệu ứng dụng.`;
    await refreshDiagnosticsInfo();
  } catch (error) {
    box.classList.remove('hidden');
    box.innerHTML = `<span class="text-[#b3261e]">Không xóa được log: ${escapeHtml(String(error && error.message ? error.message : error))}</span>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Xóa log trên máy';
  }
}

/** Called by the controller when the settings page is (re)wired. */
function wireSettingsAiTasks() {
  // #121: "Làm mới" jumps back to the newest page, then re-reads it.
  $('#aiTasksRefreshBtn')?.addEventListener('click', () => { aiTaskPage = 0; refreshAiTaskList(); });
  $('#cpuRuntimeVerifyBtn')?.addEventListener('click', verifyCpuRuntimeUi);
  // Repair surface for first-run setup: the wizard is the only place that
  // drives `setup:*`, so Settings just reopens it rather than duplicating the
  // download logic. `probe: false` shows it even when setup already succeeded.
  $('#openSetupWizardBtn')?.addEventListener('click', () => {
    if (typeof window.openSetupWizard === 'function') window.openSetupWizard({ probe: false });
  });
  $('#exportDiagnosticsBtn')?.addEventListener('click', exportDiagnosticsUi);
  $('#openLogFolderBtn')?.addEventListener('click', openLogFolderUi);
  $('#clearDiagnosticsBtn')?.addEventListener('click', clearDiagnosticsUi);
  refreshAiTaskList();
  refreshDiagnosticsInfo();
  // #121: a task recorded while this page is open reappears without a manual refresh.
  startAiTaskAutoRefresh();
}
