/**
 * The AI providers the teacher can configure in Settings (DECISIONS #132).
 *
 * The provider list used to live twice: as `cloudProviderPresets` in
 * `renderer/shared.ts` (labels, base URL, model) and as hand-written branches in
 * `main.ts` (`mode: local|online`, an OpenCode-Zen special case). The two drifted —
 * the type said `openai | gemini | custom`, the UI offered `opencode`, and the
 * lesson workflow only ever talked to the local runtime.
 *
 * This file is the one place that says *what a provider is*. It is pure data plus a
 * few pure helpers, with no Electron, no I/O and no network, so the renderer cannot
 * import it (classic scripts) and main can unit-test it without a model:
 *
 *  - main imports it directly;
 *  - the renderer receives the same table over IPC (`ai:providers`) and renders it.
 *
 * Adding a provider means adding a row here. A row is only listed when the
 * transport in `createChatClientForProvider` (`main.ts`) really sends chat
 * completions to it; the registry never advertises an integration that does not
 * exist.
 */

export type AiProviderId = 'local' | 'gemini' | 'openai' | 'opencode' | 'custom';

export interface AiProviderDefinition {
  id: AiProviderId;
  /** Vietnamese label shown in Settings and in the wizard picker. */
  label: string;
  /** `local` is the bundled llama.cpp runtime; the rest speak the OpenAI chat API. */
  transport: 'local' | 'openai-compatible';
  /** Default endpoint, empty when the teacher must supply one (`custom`). */
  baseUrl: string;
  /** Default model, empty when the teacher must supply one (`custom`). */
  model: string;
  /** A key is required before the provider may report `configured`. */
  requiresKey: boolean;
  /**
   * Whether Step 2 / Step 5 may use it. `opencode` (an OpenCode-Zen gateway client,
   * legacy-only) and `custom` are configured in Settings but stay out of the game
   * workflow — the product decision recorded in DECISIONS #132.
   */
  wizardEligible: boolean;
  /** One line of context under the provider in Settings. */
  note: string;
}

export const AI_PROVIDERS: AiProviderDefinition[] = [
  {
    id: 'local',
    label: 'AI local (llama.cpp)',
    transport: 'local',
    baseUrl: '',
    model: '',
    requiresKey: false,
    wizardEligible: true,
    note: 'Chạy trên máy này, không cần API key và không gửi giáo án đi đâu.'
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    transport: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    requiresKey: true,
    wizardEligible: true,
    note: 'Điểm cuối tương thích OpenAI của Google. Cần API key của Google AI Studio.'
  },
  {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    transport: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    requiresKey: true,
    wizardEligible: true,
    note: 'Cần API key của OpenAI; chi phí tính theo tài khoản OpenAI của bạn.'
  },
  {
    id: 'opencode',
    label: 'OpenCode Zen',
    transport: 'openai-compatible',
    baseUrl: 'https://opencode.ai/zen/v1',
    model: 'mimo-v2.6-flash-free',
    requiresKey: false,
    wizardEligible: false,
    note: 'Chưa dùng cho luồng tạo trò chơi. Chỉ dùng cho công cụ AI cũ.'
  },
  {
    id: 'custom',
    label: 'API tương thích OpenAI (tự cấu hình)',
    transport: 'openai-compatible',
    baseUrl: '',
    model: '',
    requiresKey: true,
    // A custom OpenAI-compatible endpoint is a real cloud provider for the lesson
    // workflow once its connection test passes (DECISIONS #132 D17): a teacher whose
    // gateway is not Gemini/ChatGPT must not lose the second analysis button.
    wizardEligible: true,
    note: 'Điểm cuối tương thích OpenAI khác (máy chủ của trường, proxy…). Dùng được cho luồng tạo trò chơi sau khi kiểm tra kết nối.'
  }
];

/** Policy order for `providerPolicy: 'auto'` (DECISIONS #132 §D7). */
export const AUTO_PROVIDER_ORDER: AiProviderId[] = ['local', 'gemini', 'openai'];

export function getProviderDefinition(id: unknown): AiProviderDefinition | null {
  const wanted = String(id || '');
  return AI_PROVIDERS.find(provider => provider.id === wanted) || null;
}

export function isProviderId(value: unknown): value is AiProviderId {
  return getProviderDefinition(value) !== null;
}

/** Providers the game-creation workflow may dispatch to, in policy order. */
export function wizardProviders(): AiProviderDefinition[] {
  return AUTO_PROVIDER_ORDER
    .map(id => getProviderDefinition(id))
    .filter((provider): provider is AiProviderDefinition => Boolean(provider && provider.wizardEligible));
}

export type AiProviderStatus = 'not-configured' | 'configured' | 'ready' | 'failing';

/** The persisted shape of one provider (never sent to the renderer as-is). */
export interface StoredProviderConfig {
  apiKeyEncrypted?: string;
  baseUrl?: string;
  model?: string;
  enabled?: boolean;
  lastTestAt?: string;
  lastTestOk?: boolean;
  lastTestCode?: string;
}

export interface AiSettingsShape {
  provider?: string;
  providerPolicy?: 'auto';
  providers?: Record<string, StoredProviderConfig | undefined>;
  localModelId?: string;
  [key: string]: unknown;
}

/**
 * Everything that decides whether a provider may be used, computed once.
 *
 * `localRunning` comes from the runtime manager when the caller is main; the
 * renderer simply passes the runtime state it already polls, so both sides see the
 * same verdict for the same inputs. A provider with a stored key only counts as
 * `configured` if the stored key is actually there — an old `mode`/`baseUrl` pair
 * from before DECISIONS #132 is not enough.
 */
export interface ResolveProviderInput {
  settings: AiSettingsShape | null | undefined;
  localRunning?: boolean;
  localModelReady?: boolean;
}

export interface ResolvedProvider {
  id: AiProviderId;
  definition: AiProviderDefinition;
  status: AiProviderStatus;
  hasKey: boolean;
  baseUrl: string;
  model: string;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestCode: string | null;
  /** Turned off by the teacher in the "tự động" table. */
  enabled: boolean;
  /** This provider may be dispatched to right now. */
  usable: boolean;
  /** Vietnamese explanation of `status`, shown next to the chip. */
  reason: string;
}

export function resolveProviderState(input: ResolveProviderInput): ResolvedProvider[] {
  const settings = input.settings || {};
  const stored = settings.providers || {};
  return AI_PROVIDERS.map(definition => {
    const config = stored[definition.id] || {};
    const hasKey = Boolean(config.apiKeyEncrypted);
    const baseUrl = String(config.baseUrl || definition.baseUrl || '').replace(/\/+$/, '');
    const model = String(config.model || definition.model || '');
    const enabled = config.enabled !== false;
    const lastTestOk = typeof config.lastTestOk === 'boolean' ? config.lastTestOk : null;
    const lastTestAt = config.lastTestAt || null;
    const lastTestCode = config.lastTestCode || null;
    let status: AiProviderStatus;
    let reason: string;
    if (definition.id === 'local') {
      const ready = Boolean(input.localRunning);
      status = ready ? 'ready' : 'configured';
      reason = ready
        ? 'Đang chạy trên máy này.'
        : input.localModelReady === false
          ? 'Chưa có model. Hãy tải model trong phần AI local phía trên.'
          : 'Model đã tải nhưng chưa chạy. Nhấn “Bắt đầu chạy” trong cửa sổ AI local.';
    } else if (definition.id === 'opencode') {
      // Zen keys may come from the local OpenCode login, so a key field is optional.
      const configured = Boolean(baseUrl && model);
      status = !configured ? 'not-configured' : lastTestOk === false ? 'failing' : lastTestOk === true ? 'ready' : 'configured';
      reason = !configured
        ? 'Chưa có điểm cuối hoặc model.'
        : lastTestOk === false ? lastTestNote(lastTestAt, lastTestCode) : lastTestOk === true ? lastTestNote(lastTestAt, null) : 'Chưa kiểm tra kết nối.';
    } else {
      const configured = Boolean(hasKey && baseUrl && model);
      status = !configured ? 'not-configured' : lastTestOk === false ? 'failing' : lastTestOk === true ? 'ready' : 'configured';
      reason = !configured
        ? !hasKey ? 'Chưa có API key.' : !baseUrl ? 'Chưa có điểm cuối (base URL).' : 'Chưa có tên model.'
        : lastTestOk === false
          ? lastTestNote(lastTestAt, lastTestCode)
          : lastTestOk === true
            ? (definition.wizardEligible ? lastTestNote(lastTestAt, null) : lastTestNote(lastTestAt, null) + ' Chưa dùng được cho luồng tạo trò chơi.')
            : 'Đã cấu hình nhưng chưa kiểm tra kết nối.';
    }
    const usable = definition.wizardEligible
      && enabled
      // Strict on purpose (spec §3): only the latest successful real request makes a
      // cloud provider usable. "Configured but never verified" is visible in Settings
      // but never silently used for a game — the teacher tests it once, on purpose.
      && (definition.id === 'local' ? Boolean(input.localRunning) : status === 'ready');
    return {
      id: definition.id,
      definition,
      status,
      hasKey,
      baseUrl,
      model,
      lastTestAt,
      lastTestOk,
      lastTestCode,
      enabled,
      usable,
      reason
    };
  });
}

function lastTestNote(at: string | null, code: string | null): string {
  const when = at ? ` lúc ${formatShortTime(at)}` : '';
  if (code) return `Kiểm tra gần nhất thất bại${when} (${errorLabel(code)}).`;
  return `Kiểm tra kết nối thành công${when}.`;
}

function formatShortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

const ERROR_LABELS: Record<string, string> = {
  AI_AUTH: 'API key không hợp lệ hoặc bị thu hồi',
  AI_QUOTA: 'Tài khoản hết hạn mức',
  AI_RATE_LIMIT: 'Đang bị giới hạn số yêu cầu',
  AI_NETWORK: 'Không kết nối được tới nhà cung cấp',
  AI_CONNECTION: 'Không kết nối được tới nhà cung cấp',
  AI_TIMEOUT: 'Nhà cung cấp phản hồi quá lâu',
  AI_MODEL_NOT_FOUND: 'Không có model này',
  AI_CONFIG: 'Cấu hình chưa đúng',
  AI_KEY_STORAGE_UNAVAILABLE: 'Máy không lưu được khoá an toàn',
  AI_INVALID_JSON: 'Nhà cung cấp trả về dữ liệu không đọc được',
  AI_HTTP: 'Nhà cung cấp báo lỗi',
  AI_PROVIDER_HTTP: 'Nhà cung cấp báo lỗi'
};

/** Vietnamese label for a provider error code (Settings and the wizard banner). */
export function errorLabel(code: unknown): string {
  return ERROR_LABELS[String(code || '')] || 'Lỗi chưa xác định';
}

/** The statuses that count as "ready to use" for the automatic policy. */
export function isReadyForWorkflow(provider: ResolvedProvider): boolean {
  return provider.usable;
}

export type ChooseProviderInput = ResolveProviderInput & {
  /** A provider the caller explicitly asked for (the wizard picker). */
  requested?: unknown;
  /**
   * DECISIONS #132 §D13: the lesson workflow's "AI local" button always means the
   * local runtime. When local is running it is chosen even if a cloud provider is
   * also ready; when it is not, the request fails as `AI_NOT_RUNNING` instead of
   * silently running on a provider the teacher did not ask for. The explicit cloud
   * button passes that provider's id, so it never reaches this branch.
   */
  localPreferred?: boolean;
};

export interface ChooseProviderResult {
  provider: ResolvedProvider | null;
  /** `AI_NOT_RUNNING` belongs to the explicit local button (D13): it is a runtime state, not a setting to fix. */
  code: 'AI_NO_PROVIDER' | 'AI_PROVIDER_NOT_READY' | 'AI_PROVIDER_NOT_ELIGIBLE' | 'AI_NOT_RUNNING' | null;
  reason: string;
}

/**
 * Picks the provider for one workflow call (DECISIONS #132 §D7/D8).
 *
 * - `requested` always wins *if* it is a wizard provider that is usable right now.
 *   A requested provider that is not usable is returned as an error, never swapped
 *   for another one: the teacher picked it on purpose.
 * - Without a request, the automatic policy walks `local → gemini → openai` and
 *   takes the first usable provider.
 * - `opencode`/`custom` are never chosen, even when they are ready.
 */
export function chooseProvider(input: ChooseProviderInput): ChooseProviderResult {
  const resolved = resolveProviderState(input);
  const requested = String(input.requested || '').trim();
  if (requested) {
    const match = resolved.find(provider => provider.id === requested);
    if (!match) {
      return { provider: null, code: 'AI_NO_PROVIDER', reason: 'Nhà cung cấp AI không tồn tại trong ứng dụng.' };
    }
    if (!match.definition.wizardEligible) {
      return {
        provider: null,
        code: 'AI_PROVIDER_NOT_ELIGIBLE',
        reason: `${match.definition.label} chưa dùng được cho luồng tạo trò chơi. Hãy chọn AI local, Gemini hoặc ChatGPT trong Cài đặt AI.`
      };
    }
    if (!match.usable) {
      return {
        provider: null,
        code: 'AI_PROVIDER_NOT_READY',
        reason: `${match.definition.label} chưa sẵn sàng: ${match.reason}`
      };
    }
    return { provider: match, code: null, reason: '' };
  }
  // The explicit local button (D13): a running local runtime wins over the policy.
  if (input.localPreferred) {
    const local = resolved.find(provider => provider.id === 'local');
    if (local && local.definition.wizardEligible && local.usable) {
      return { provider: local, code: null, reason: '' };
    }
    return {
      provider: null,
      code: 'AI_NOT_RUNNING',
      reason: 'AI local chưa chạy. Hãy nhấn “Tổng hợp với AI trên máy” để mở cửa sổ AI local · llama.cpp, chọn model đã tải đầy đủ rồi nhấn “Bắt đầu chạy”, hoặc dùng nút phân tích bằng AI ngoài.'
    };
  }
  for (const id of AUTO_PROVIDER_ORDER) {
    const match = resolved.find(provider => provider.id === id);
    if (match && match.definition.wizardEligible && match.usable) {
      return { provider: match, code: null, reason: '' };
    }
  }
  // Nothing from the preferred list: a teacher whose only working gateway is the
  // custom endpoint must still be able to create a game (DECISIONS #132 D17).
  const custom = resolved.find(provider => provider.id === 'custom');
  if (custom && custom.definition.wizardEligible && custom.usable) {
    return { provider: custom, code: null, reason: '' };
  }
  return {
    provider: null,
    code: 'AI_NO_PROVIDER',
    reason: 'Chưa có nhà cung cấp AI nào sẵn sàng. Hãy chạy AI local hoặc thêm API key của Gemini hoặc ChatGPT trong Cài đặt AI.'
  };
}

/** Short `••••abcd` form of a stored key — the only form the renderer ever sees. */
export function maskApiKey(key: unknown): string {
  const text = String(key || '');
  if (!text) return '';
  return `••••${text.slice(-4)}`;
}

/**
 * Moves the pre-#132 single key into `providers[provider]` (DECISIONS #132 §D3).
 *
 * Pure so the migration can be tested without a disk: it returns the next settings
 * object and whether anything changed. The caller only writes when `changed` is
 * true, so a settings file that was already migrated is never rewritten (and never
 * re-migrated twice). The old `ai.apiKeyEncrypted` and the cloud fields that
 * described it (`baseUrl`, `model`, `cloudProvider`, `mode: online`) move to the
 * provider they belonged to; the legacy `mode` is kept for the old `ai:generate`
 * channel. It never decrypts anything: the window's own key blob is moved as-is.
 */
export function migrateLegacyAiSettings(input: unknown): { settings: AiSettingsShape; changed: boolean } {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const aiSource = source.ai && typeof source.ai === 'object' ? { ...(source.ai as Record<string, unknown>) } : null;
  if (!aiSource) return { settings: source as AiSettingsShape, changed: false };
  const hasLegacyKey = typeof aiSource.apiKeyEncrypted === 'string' && aiSource.apiKeyEncrypted.length > 0;
  const hasProviderId = typeof aiSource.provider === 'string' && isProviderId(aiSource.provider);
  if (!hasLegacyKey && hasProviderId) return { settings: source as AiSettingsShape, changed: false };
  const legacyProvider = String(aiSource.cloudProvider || '') || inferLegacyProvider(aiSource.baseUrl);
  const providerId = isProviderId(legacyProvider) ? legacyProvider as AiProviderId : (hasLegacyKey ? 'openai' : 'local');
  const providers: Record<string, StoredProviderConfig> = { ...(aiSource.providers as Record<string, StoredProviderConfig> || {}) };
  const target: StoredProviderConfig = { ...(providers[providerId] || {}) };
  let changed = false;
  if (hasLegacyKey && !target.apiKeyEncrypted) {
    target.apiKeyEncrypted = String(aiSource.apiKeyEncrypted);
    changed = true;
  }
  // The old form stored one base URL/model next to the one key: they belong to it.
  if (hasLegacyKey && typeof aiSource.baseUrl === 'string' && aiSource.baseUrl && !target.baseUrl) {
    target.baseUrl = aiSource.baseUrl;
    changed = true;
  }
  if (hasLegacyKey && typeof aiSource.model === 'string' && aiSource.model && !target.model) {
    target.model = aiSource.model;
    changed = true;
  }
  if (changed || hasLegacyKey) providers[providerId] = target;
  const ai: Record<string, unknown> = { ...aiSource, providers };
  if (!hasProviderId) {
    ai.provider = providerId;
    changed = true;
  }
  if (!ai.providerPolicy) {
    ai.providerPolicy = 'auto';
    changed = true;
  }
  if (hasLegacyKey) {
    // Only now that the blob lives under its provider: one key, one owner.
    delete ai.apiKeyEncrypted;
    changed = true;
  }
  delete ai.apiKey;
  return { settings: { ...source, ai } as AiSettingsShape, changed };
}

function inferLegacyProvider(baseUrl: unknown): string {
  const text = String(baseUrl || '');
  if (!text) return '';
  if (text.includes('googleapis.com')) return 'gemini';
  if (text.includes('api.openai.com')) return 'openai';
  if (/opencode\.ai/i.test(text)) return 'opencode';
  return 'custom';
}

/**
 * What the Settings page and the wizard receive about the AI configuration.
 * Deliberately key-free: `hasKey` + `keyMasked` only (DECISIONS #132 §D4).
 */
export interface AiProviderPublicView {
  id: AiProviderId;
  label: string;
  note: string;
  wizardEligible: boolean;
  requiresKey: boolean;
  status: AiProviderStatus;
  reason: string;
  hasKey: boolean;
  keyMasked: string;
  baseUrl: string;
  model: string;
  defaultBaseUrl: string;
  defaultModel: string;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestCode: string | null;
  enabled: boolean;
  usable: boolean;
}

/** Builds the renderer-safe view; `keys` maps provider id → decrypted key (main only). */
export function toPublicProviderView(
  resolved: ResolvedProvider[],
  keys: Partial<Record<AiProviderId, string>> = {}
): AiProviderPublicView[] {
  return resolved.map(provider => ({
    id: provider.id,
    label: provider.definition.label,
    note: provider.definition.note,
    wizardEligible: provider.definition.wizardEligible,
    requiresKey: provider.definition.requiresKey,
    status: provider.status,
    reason: provider.reason,
    hasKey: provider.hasKey,
    keyMasked: maskApiKey(keys[provider.id]),
    baseUrl: provider.baseUrl,
    model: provider.model,
    defaultBaseUrl: provider.definition.baseUrl,
    defaultModel: provider.definition.model,
    lastTestAt: provider.lastTestAt,
    lastTestOk: provider.lastTestOk,
    lastTestCode: provider.lastTestCode,
    enabled: provider.enabled,
    usable: provider.usable
  }));
}
