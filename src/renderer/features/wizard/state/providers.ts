// @ts-nocheck -- wizard/state/providers.ts — nhãn/mô tả provider AI, thẻ chọn provider, bảng mã lỗi và các lựa chọn cấu hình (split từ features/wizard/state.ts, DECISIONS #150).
// #132: Step 2 / Step 5 show which provider they will use, without ever offering a
// configuration form (spec §1/§6). Everything here reads the key-free view main
// ships in `settings.ai` — no provider logic is duplicated in the renderer.

/** Label of the provider the workflow will use now ("AI local (llama.cpp)", "Gemini (Google)"…). */
function wizardProviderLabel() {
  const active = typeof aiActiveProvider === 'function' ? aiActiveProvider() : null;
  return active ? String(active.label || active.id) : 'AI';
}

/** " bằng AI local" / " bằng Gemini": the suffix both AI buttons carry. */
function wizardProviderSuffix(providerId) {
  const active = providerId && typeof aiProviderView === 'function'
    ? aiProviderView(providerId)
    : (typeof aiActiveProvider === 'function' ? aiActiveProvider() : null);
  if (!active) return '';
  return ` bằng ${active.id === 'local' ? 'AI local' : active.label}`;
}

/** The provider the teacher picked in the wizard; empty means "use the default". */
function wizardPickedProviderId() {
  return wizardState.selectedProviderId || '';
}

/**
 * The cloud provider the second button offers (DECISIONS #132 §D13): the provider the
 * teacher picked, or the first verified cloud provider. Only a provider that passed
 * its connection test can be offered — the step never advertises an untested key.
 */
/**
 * What the local button needs before it can run a real analysis (DECISIONS #132 §D14).
 * `ready` false means the step must open the AI-local window instead of starting a run
 * that could only fail with "AI local chưa chạy" a few seconds later.
 */
function wizardLocalAiLaunchState() {
  const machine = state.localAiMachine || {};
  const models = Array.isArray(state.localAiModels) ? state.localAiModels : [];
  const provider = typeof aiProviderView === 'function' ? aiProviderView('local') : null;
  const installed = models.filter(model => model && model.installed);
  const running = Boolean(machine.runtimeRunning) || Boolean(provider && provider.status === 'ready');
  if (!installed.length) {
    return { ready: false, need: 'model', message: 'Chưa có model AI local. Hãy mở cửa sổ AI local, tải một model rồi bấm “Bắt đầu chạy”.' };
  }
  if (!running) {
    return { ready: false, need: 'runtime', message: 'AI local đã có model nhưng chưa chạy. Hãy mở cửa sổ AI local và bấm “Bắt đầu chạy”.' };
  }
  return { ready: true, need: '', message: '' };
}

/** Red line above the buttons; does not run anything. */
function wizardLocalAiNoticeHtml() {
  const launch = wizardLocalAiLaunchState();
  if (launch.ready) return '';
  return `<div class="field-hint" data-wizard-local-notice="1" role="status" style="color:#dc2626">⚠ ${escapeHtml(launch.message)}</div>`;
}
// #132 D16: a page opened before a provider was verified keeps its old view. The wizard
// refreshes it on the step that shows the provider buttons, once at a time.
function wizardProvidersShouldSync() {
  return wizardState.providerSyncInFlight !== true;
}

async function wizardSyncProviders() {
  if (wizardState.providerSyncInFlight === true) return;
  wizardState.providerSyncInFlight = true;
  try {
    const view = await window.eduGame.getAiProviders();
    if (view && view.ai) {
      state.settings.ai = view.ai;
      render();
    }
  } catch (error) {
    // A failed refresh only means the step keeps what it had; a real failure shows
    // when the teacher runs the step.
  } finally {
    wizardState.providerSyncInFlight = false;
  }
}

function wizardCloudActionProvider() {
  const picked = wizardPickedProviderId();
  if (picked && picked !== 'local') return aiProviderView(picked);
  // The button exists for a provider that is configured, verified AND meant for the
  // lesson workflow (DECISIONS #132 D14). Both flags are required: `usable` alone would
  // also accept a provider the registry keeps out of the workflow.
  const cloud = aiProviderList().find(provider =>
    provider.id !== 'local' && provider.wizardEligible === true && provider.usable === true);
  return cloud || null;
}

/** A one-line privacy note that is true for the provider in use. */
function wizardProviderPrivacyText() {
  const active = typeof aiActiveProvider === 'function' ? aiActiveProvider() : null;
  if (!active || active.id === 'local') return 'AI local chạy trên máy này; giáo án không được gửi đi đâu. Có thể huỷ giữa chừng.';
  return `Giáo án và phần trả lời được gửi tới ${active.label} qua Internet. Không gửi dữ liệu học sinh; có thể huỷ giữa chừng.`;
}

/**
 * The provider the AI buttons will call: the teacher's pick while there is still
 * more than one usable provider, otherwise nothing (main applies the policy).
 * Sent on every request so a draft run and its per-item regenerations agree.
 */
function wizardProviderRequestPayload(explicitProviderId) {
  // An explicit button always wins over the picker. `localPreferred` tells main that
  // "AI local" was pressed on purpose: a running local runtime is used even when a
  // cloud provider is also ready, and a stopped one is an error, not a silent switch.
  if (explicitProviderId === 'local') return { providerId: 'local', localPreferred: true };
  if (explicitProviderId) return { providerId: explicitProviderId };
  const picker = typeof aiProviderPicker === 'function' ? aiProviderPicker() : { show: false };
  if (!picker.show || !wizardState.selectedProviderId) return {};
  return { providerId: wizardState.selectedProviderId };
}

/** Compact picker; it exists only when at least two providers are usable (#132 §D7). */
function wizardProviderPickerHtml() {
  const picker = typeof aiProviderPicker === 'function' ? aiProviderPicker() : { show: false, options: [] };
  if (!picker.show || !picker.options.length) return '';
  const selected = wizardState.selectedProviderId || picker.activeId || picker.options[0].id;
  return `<div class="field" data-wizard-provider-picker="1">
    <label>NHÀ CUNG CẤP AI CHO BƯỚC NÀY</label>
    <select id="wizardProviderSelect" data-wizard-provider-select>${picker.options.map(option =>
      `<option value="${escapeHtml(option.id)}"${option.id === selected ? ' selected' : ''}>${escapeHtml(option.label)}${option.model ? ` · ${escapeHtml(option.model)}` : ''}</option>`
    ).join('')}</select>
    <div class="field-hint">Dùng đúng nhà cung cấp này cho bước này; nếu lỗi, đổi ở đây hoặc mở Cài đặt AI. Ứng dụng không tự chuyển sang nhà cung cấp khác.</div>
  </div>`;
}

/**
 * Status strip + the way out when no provider can run: a short explanation and a
 * direct link to Settings, never a configuration form inside the wizard.
 */
function wizardProviderCard() {
  const ai = state.settings.ai || {};
  const active = typeof aiActiveProvider === 'function' ? aiActiveProvider() : null;
  const usable = (Array.isArray(ai.providers) ? ai.providers : []).filter(provider => provider.wizardEligible && provider.usable);
  if (usable.length) {
    const tone = 'border-[#ddf4e8] bg-[#effaf5] dark:bg-[#132d24] dark:border-[#1e4a3b]';
    // #132 D13: local is the default of the workflow; when a cloud provider is also
    // verified, say that the second button exists rather than hiding the choice.
    const cloud = typeof wizardCloudActionProvider === 'function' ? wizardCloudActionProvider() : null;
    const detail = active && active.id === 'local'
      ? (cloud ? 'AI local chạy trên máy này là mặc định; muốn dùng AI ngoài thì bấm nút thứ hai.' : 'AI local đang chạy trên máy này.')
      : 'Đã kiểm tra kết nối thành công.';
    return `<div class="flex gap-[12px] items-center border rounded-xl p-3 mb-4 ${tone}" data-wizard-provider="${escapeHtml(active ? active.id : '')}">
      <span class="text-[20px] shrink-0">🟢</span>
      <div class="min-w-0 flex-1">
        <strong class="text-[12px] block text-[#1e293b] dark:text-[#f8fafc]">Dùng ${escapeHtml(wizardProviderLabel())}</strong>
        <small class="block text-[11px] text-[#64748b] dark:text-[#94a3b8] mt-0.5 leading-snug">${escapeHtml(detail)}</small>
      </div>
      <button type="button" class="btn btn-secondary btn-small shrink-0" data-wizard-action="open-ai-settings">Cài đặt AI</button>
    </div>`;
  }
  const activeReason = active ? active.reason : 'Chưa có nhà cung cấp AI nào được cấu hình.';
  return `<div class="flex gap-[12px] items-center border rounded-xl p-3 mb-4 border-[#f2e3c8] bg-[#fdf7ec] dark:bg-[#2d2413] dark:border-[#4a3b1e]" data-wizard-provider="none" data-wizard-provider-empty="1">
    <span class="text-[20px] shrink-0">🟡</span>
    <div class="min-w-0 flex-1">
      <strong class="text-[12px] block text-[#1e293b] dark:text-[#f8fafc]">Chưa có nhà cung cấp AI sẵn sàng</strong>
      <small class="block text-[11px] text-[#64748b] dark:text-[#94a3b8] mt-0.5 leading-snug">${escapeHtml(activeReason)} Cấu hình khoá và kiểm tra kết nối một lần trong Cài đặt AI — không cần làm ở đây.</small>
    </div>
    <button type="button" class="btn btn-secondary btn-small shrink-0" data-wizard-action="open-ai-settings">Mở Cài đặt AI</button>
  </div>`;
}

/** #132: remembers the teacher's provider pick for this step; nothing is saved to disk. */
function wizardSelectProvider(providerId) {
  const wanted = String(providerId || '');
  // The select itself is the authority: it only exists while the picker is shown, so
  // a value coming from it is one of the offered providers.
  wizardState.selectedProviderId = wanted;
  render();
}
const wizardErrorMessages = {
  AI_NOT_RUNNING: 'AI local chưa chạy. Hãy mở cửa sổ AI local · llama.cpp, chọn model đã tải xong rồi nhấn “Bắt đầu chạy”.',
  AI_BUSY: 'AI local đang xử lý một yêu cầu khác. Hãy đợi yêu cầu hiện tại hoàn tất hoặc huỷ nó trước khi thử lại.',
  AI_CONFIG: 'Chưa cấu hình AI đúng cách. Hãy kiểm tra trong Cài đặt AI.',
  AI_CONNECTION: 'Không kết nối được tới AI local. Hãy kiểm tra cửa sổ AI local còn mở không rồi thử lại.',
  AI_TIMEOUT: 'AI local phản hồi quá lâu. Hãy thử lại với giáo án ngắn hơn hoặc model nhỏ hơn.',
  AI_CANCELLED: 'Bạn đã huỷ yêu cầu AI.',
  AI_HTTP: 'AI local báo lỗi khi xử lý. Hãy thử lại.',
  // #132: a cloud provider's own HTTP failure; keep it apart from AI_HTTP so the
  // message never blames the local model.
  AI_PROVIDER_HTTP: 'Nhà cung cấp AI trả lỗi khi xử lý. Hãy thử lại sau, hoặc kiểm tra model và endpoint trong Cài đặt AI.',
  AI_EMPTY: 'AI local không trả về nội dung. Hãy thử lại.',
  AI_TRUNCATED: 'Câu trả lời bị cắt do giới hạn độ dài. Hãy giảm yêu cầu hoặc thử lại.',
  AI_INVALID_JSON: 'AI local trả về dữ liệu không đọc được. Hãy thử lại.',
  AI_OUTPUT_INVALID: 'Nội dung AI trả về chưa đúng cấu trúc. Hãy thử lại hoặc chỉnh sửa thủ công ở bước sau.',
  // #132: provider selection and its failure modes, each with an actionable text.
  AI_NO_PROVIDER: 'Chưa có nhà cung cấp AI nào sẵn sàng. Hãy chạy AI local hoặc thêm API key của Gemini/ChatGPT trong Cài đặt AI, rồi kiểm tra kết nối một lần.',
  AI_PROVIDER_NOT_READY: 'Nhà cung cấp AI đã chọn chưa sẵn sàng. Hãy chọn nhà cung cấp khác hoặc mở Cài đặt AI để kiểm tra kết nối.',
  AI_PROVIDER_NOT_ELIGIBLE: 'Nhà cung cấp này chưa dùng được cho luồng tạo trò chơi. Hãy chọn AI local, Gemini hoặc ChatGPT.',
  AI_AUTH: 'API key của nhà cung cấp không hợp lệ hoặc bị thu hồi. Hãy nhập lại khoá trong Cài đặt AI.',
  AI_QUOTA: 'Tài khoản nhà cung cấp đã hết hạn mức. Hãy kiểm tra trang quản lý của nhà cung cấp hoặc chọn nhà cung cấp khác.',
  AI_RATE_LIMIT: 'Nhà cung cấp đang giới hạn số yêu cầu. Hãy đợi một lát rồi thử lại.',
  AI_MODEL_NOT_FOUND: 'Nhà cung cấp không có model đã chọn. Hãy kiểm tra tên model trong Cài đặt AI.',
  AI_NETWORK: 'Không kết nối được tới nhà cung cấp AI. Hãy kiểm tra mạng rồi thử lại.',
  AI_KEY_STORAGE_UNAVAILABLE: 'Máy này không lưu được khoá an toàn. Hãy nhập lại khoá trong Cài đặt AI trên máy này.'
};

function wizardErrorText(error = wizardState.error) {
  if (!error) return '';
  return wizardErrorMessages[error.code] || error.message || 'Đã xảy ra lỗi không xác định.';
}

/** Failures that mean the local runtime/model is unusable (offer the AI-local window). */
const wizardAiRecoveryCodes = ['AI_NOT_RUNNING', 'AI_CONFIG', 'AI_CONNECTION', 'AI_TIMEOUT', 'AI_NO_PROVIDER', 'AI_PROVIDER_NOT_READY', 'AI_PROVIDER_NOT_ELIGIBLE', 'AI_AUTH', 'AI_QUOTA', 'AI_RATE_LIMIT', 'AI_MODEL_NOT_FOUND', 'AI_NETWORK', 'AI_KEY_STORAGE_UNAVAILABLE', 'AI_PROVIDER_HTTP'];

function wizardNeedsAiRuntime(error = wizardState.error) {
  return Boolean(error && wizardAiRecoveryCodes.includes(error.code));
}

/** #132: failures that are fixed in Settings (keys, provider, model) rather than in the model window. */
const wizardProviderSettingCodes = ['AI_NO_PROVIDER', 'AI_PROVIDER_NOT_READY', 'AI_PROVIDER_NOT_ELIGIBLE', 'AI_AUTH', 'AI_QUOTA', 'AI_MODEL_NOT_FOUND', 'AI_KEY_STORAGE_UNAVAILABLE', 'AI_PROVIDER_HTTP'];
function wizardNeedsProviderSettings(error = wizardState.error) {
  // AI_CONFIG is the key/model/base-URL complaint and is fixed here; runtime codes
  // of the same name keep their own meaning (AI_NOT_RUNNING/AI_CONNECTION/AI_TIMEOUT).
  return Boolean(error && wizardProviderSettingCodes.includes(error.code))
    || Boolean(error && error.code === 'AI_CONFIG');
}

const wizardDifficultyOptions = ['dễ', 'trung bình', 'khó'];
const wizardAudienceOptions = [
  { value: 'child', label: 'Học sinh nhỏ' },
  { value: 'teen', label: 'Học sinh phổ thông' },
  { value: 'adult', label: 'Người lớn' }
];
const wizardStyleOptions = [
  { value: 'fun', label: 'Vui nhộn' },
  { value: 'exploration', label: 'Khám phá' },
  { value: 'competition', label: 'Thi đua' },
  { value: 'realistic', label: 'Thực tế' },
  { value: 'minimal', label: 'Tối giản' }
];
