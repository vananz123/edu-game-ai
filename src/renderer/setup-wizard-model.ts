/**
 * First-run setup wizard, §7 Setup Wizard UI
 * (docs/archive/specs/update_AI_plan_5.txt) — the *decisions*, not the DOM.
 *
 * Why this file exists separately from `features/setup-wizard.ts`:
 * the renderer is loaded as plain global scripts and is `@ts-nocheck`, so
 * anything that lives only inside a template string cannot be unit-tested. The
 * rules a teacher depends on — which screen appears, whether "Thử lại" or
 * "Tiếp tục không AI" is offered, what a failure actually means — are the part
 * most likely to be wrong and the part hardest to check by eye. So they live
 * here as pure functions over the `SetupStatus` / `SetupProgress` values that
 * `setup:status`, `setup:preflight` and `setup:progress` already return.
 *
 * This module deliberately:
 *   - never builds a URL, path or shell command — the main process owns those
 *     (§8) and the renderer may only pick a model id;
 *   - returns plain data (`{ title, tone, buttons }`) so the DOM layer stays a
 *     dumb mapper and CSP stays happy (no inline handlers anywhere).
 *
 * ## Why there is no `import`/`export` in this file
 *
 * `index.html` loads the renderer as classic `<script src>` files, and
 * `tsconfig.json` compiles with `module: Node16` while `package.json` has no
 * `"type": "module"` — so `tsc` emits CommonJS. A CommonJS file evaluated as a
 * classic script throws `exports is not defined` before the first statement
 * (verified with `vm.runInContext`), which would take the whole renderer down.
 * Every other renderer file avoids this by having no imports or exports at all.
 *
 * This file keeps that constraint but stays typed and testable:
 *   - the shared contracts are restated as local `type` aliases, because a
 *     `type`-only import is erased and would be the one construct that survives
 *     tree-shaking into `require()` in some configurations;
 *   - `tsc` still emits plain `function`/`const` declarations plus one
 *     `var SetupWizardModel = { ... }` object, which is a normal global;
 *   - `tests/setup-wizard-model.test.ts` loads the built file with
 *     `vm.runInContext` — the same way the browser will — so a regression back
 *     to CommonJS output fails the test suite instead of shipping.
 */

// ---------------------------------------------------------------------------
// Shared contracts, restated locally.
//
// These mirror `ai-core/setup-state.ts` and `ai-core/setup-orchestrator.ts`
// exactly. They are copies rather than `import type` on purpose: a type-only
// import is erased only when the compiler can prove the file is a module, and
// that proof is exactly what turns the output back into CommonJS.
// `tests/setup-wizard-model.test.ts` cross-checks both step and failure-code
// lists against the real modules, so drift is a test failure, not a silent bug.
// ---------------------------------------------------------------------------

type SetupStep =
  | 'idle'
  | 'detecting'
  | 'installing-runtime'
  | 'installing-models'
  | 'starting'
  | 'smoke-test'
  | 'complete';

type SetupFailureCode =
  | 'unsupported-hardware'
  | 'incomplete-configuration'
  | 'disk-space'
  | 'network'
  | 'download'
  | 'integrity'
  | 'startup'
  | 'smoke-test'
  | 'cancelled'
  | 'busy';

/** Mirrors `SetupPlan`. What setup intends to download/start. */
interface SetupPlan {
  runtime: {
    id: string;
    displayName: string;
    downloadBytes: number;
    installed: boolean;
    usedFallback: boolean;
    fallbackReason?: string;
  };
  model: { id: string; displayName: string; downloadBytes: number; installed: boolean };
  remainingBytes: number;
  diskFreeBytes: number | undefined;
  enoughDiskSpace: boolean;
}

/** Mirrors `SetupProgress`. Never contains file contents. */
interface SetupProgress {
  step: SetupStep;
  stage: 'runtime' | 'model';
  itemId: string;
  receivedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  message: string;
}

/** Mirrors `SetupStatus`: everything the wizard may render. */
interface SetupStatus {
  step: SetupStep;
  complete: boolean;
  error?: { message: string; code?: string; step: SetupStep; attempts: number };
  runtimeId?: string;
  backend?: string;
  modelId?: string;
  running: boolean;
  hardware?: {
    platform: string;
    arch: string;
    osArch: string;
    cpuModel: string;
    logicalCpuCount: number;
    totalRamBytes: number;
    diskFreeBytes: number | undefined;
    supported: boolean;
  };
  plan?: SetupPlan;
  blocked?: { code: SetupFailureCode; message: string };
}

/**
 * The eight states §7 asks for, plus two the product needs.
 *
 * `welcome`      — explanation before anything is downloaded.
 * `detecting`    — hardware detection in flight.
 * `requirements` — runtime chosen, sizes/disk shown, before the big download.
 * `downloading`  — byte progress for runtime/model.
 * `verifying`    — integrity/installation work that has no byte counter.
 * `starting`     — llama-server boot + health check + smoke test.
 * `complete`     — everything passed.
 * `error`        — retryable failure.
 *
 * Beyond §7:
 * `blocked` — the machine cannot run AI (unsupported hardware, too little
 *             disk). Retrying is pointless, so the wizard must offer the
 *             offline way forward instead of a button that always fails.
 * `resume`  — an earlier run was interrupted; offer "continue" instead of
 *             restarting a 1.1 GB download from zero.
 */
type SetupWizardScreen =
  | 'welcome'
  | 'detecting'
  | 'requirements'
  | 'downloading'
  | 'verifying'
  | 'starting'
  | 'complete'
  | 'error'
  | 'blocked'
  | 'resume';

type WizardTone = 'neutral' | 'progress' | 'success' | 'danger' | 'warning';

/** A button the DOM layer renders. `id` doubles as the `data-setup-action` hook. */
interface SetupWizardButton {
  id: 'start' | 'retry' | 'cancel' | 'close' | 'skip-ai' | 'settings' | 'restart';
  label: string;
  /** `primary` keeps exactly one filled button on screen. */
  variant: 'primary' | 'secondary';
  /** True while an action is in flight; the DOM layer disables it. */
  disabled?: boolean;
}

interface SetupWizardRequirementRow {
  label: string;
  value: string;
  ok: boolean;
  /** Shown under the value when the row failed, e.g. how much is missing. */
  hint?: string;
}

/** Everything the renderer needs to draw one screen, and nothing else. */
interface SetupWizardView {
  screen: SetupWizardScreen;
  /** Small kicker above the title. */
  eyebrow: string;
  title: string;
  /** Teacher-facing explanation; no jargon (§7). */
  message: string;
  tone: WizardTone;
  /** 0–100, or `undefined` when the screen has no measurable progress. */
  percent?: number;
  /** e.g. "Đang tải model…" — the current step, in words. */
  stepLabel?: string;
  /** e.g. "0,4 GB / 1,1 GB · còn khoảng 3 phút". */
  progressDetail?: string;
  requirements: SetupWizardRequirementRow[];
  buttons: SetupWizardButton[];
  /** True when the teacher can close the wizard and use the app without AI. */
  canSkip: boolean;
  /** Checklist shown beside the content. */
  steps: { id: SetupStep; label: string; state: 'done' | 'current' | 'pending' | 'failed' }[];
}

/**
 * Last-resort model id, used only until `preflight` reports what this machine
 * should install. The backend picks via `recommendLocalModelId()` (2B on 8 GB,
 * 4B on 12 GB and above), so the fallback only matters when `preflight` fails.
 *
 * It is 2B on purpose: a fallback must never start a multi-gigabyte download on
 * a machine we know nothing about. Gemma 4 E2B is deliberately absent from
 * `AUTO_INSTALL_MODEL_IDS`, so first-run setup never installs it on its own —
 * the teacher opts in by choosing it in Settings → Model.
 */
const SETUP_DEFAULT_MODEL_ID = 'qwen3.5-2b-q4_k_m';

/**
 * The steps shown in the checklist. `idle`/`complete` are not stages of work,
 * so they never appear as a row; `detecting` covers hardware *and* the runtime
 * choice because a teacher reads them as one "kiểm tra máy" moment.
 */
const WIZARD_STEPS: { id: SetupStep; label: string }[] = [
  { id: 'detecting', label: 'Kiểm tra máy' },
  { id: 'installing-runtime', label: 'Cài bộ AI local' },
  { id: 'installing-models', label: 'Tải model AI' },
  { id: 'starting', label: 'Khởi động AI' },
  { id: 'smoke-test', label: 'Chạy thử' }
];

/** Ordering used for "what is already finished" comparisons. */
const STEP_ORDER: SetupStep[] = WIZARD_STEPS.map(step => step.id);

/** `installing-runtime`/`installing-models` are the only byte-counted steps. */
const DOWNLOAD_STEPS: SetupStep[] = ['installing-runtime', 'installing-models'];

/**
 * Failure code -> teacher-facing explanation and the way out.
 *
 * The recovery *action* is the important column: "Thử lại" is wrong for a full
 * disk or an unsupported CPU, and offering it there is how a teacher ends up
 * clicking a button that can never succeed.
 */
const SETUP_FAILURE_COPY: Record<
  SetupFailureCode,
  { headline: string; recovery: string; action: 'retry' | 'skip-ai' | 'settings' }
> = {
  'unsupported-hardware': {
    headline: 'Máy này chưa chạy được AI local',
    recovery: 'Bạn vẫn có thể soạn và chơi trò chơi bằng chế độ không dùng AI, hoặc dùng AI online trong Cài đặt.',
    action: 'skip-ai'
  },
  'disk-space': {
    headline: 'Không đủ dung lượng trống',
    recovery: 'Hãy xoá bớt tệp rồi thử lại. Phần đã tải xong sẽ được giữ nguyên.',
    action: 'retry'
  },
  network: {
    headline: 'Mất kết nối khi tải AI',
    recovery: 'Kiểm tra Wi-Fi hoặc dây mạng rồi thử lại. Những gì đã tải xong sẽ không phải tải lại.',
    action: 'retry'
  },
  download: {
    headline: 'Không tải xong bộ AI',
    recovery: 'Thử lại; tiến trình tải sẽ tiếp tục từ chỗ dừng.',
    action: 'retry'
  },
  integrity: {
    headline: 'Tệp tải về bị hỏng',
    recovery: 'Thử lại để tải lại phần bị hỏng. Ứng dụng luôn kiểm tra tệp trước khi dùng.',
    action: 'retry'
  },
  startup: {
    headline: 'AI không khởi động được',
    recovery: 'Thử lại. Nếu vẫn lỗi, hãy mở Cài đặt để chạy lại phần cài đặt AI.',
    action: 'retry'
  },
  'smoke-test': {
    headline: 'AI chạy nhưng trả lời không đúng',
    recovery: 'Thử lại; nếu vẫn lỗi, hãy chọn model nhẹ hơn trong Cài đặt.',
    action: 'settings'
  },
  'incomplete-configuration': {
    headline: 'Thiếu thông tin để cài AI',
    recovery: 'Bản cài này chưa có đủ dữ liệu AI. Hãy cập nhật EduGame Studio rồi thử lại.',
    action: 'settings'
  },
  cancelled: {
    headline: 'Đã dừng cài đặt',
    recovery: 'Bạn có thể tiếp tục bất cứ lúc nào; những gì đã tải xong vẫn còn trên máy.',
    action: 'retry'
  },
  busy: {
    headline: 'Đang có một lần cài đặt khác',
    recovery: 'Hãy chờ lần cài đặt đang chạy kết thúc rồi thử lại.',
    action: 'retry'
  }
};

/** Vietnamese labels for the two download stages, used when no message arrives. */
const STAGE_LABEL: Record<SetupProgress['stage'], string> = {
  runtime: 'Đang tải bộ AI local…',
  model: 'Đang tải model AI…'
};

/**
 * `undefined`/non-finite input yields 0 instead of NaN, so a progress event with
 * a missing `totalBytes` cannot render "NaN%" into the bar.
 */
function progressPercent(receivedBytes: number, totalBytes: number): number {
  if (!Number.isFinite(receivedBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) return 0;
  return Math.min(100, Math.max(0, Math.floor((receivedBytes / totalBytes) * 100)));
}

/** Rounds to one decimal in GB, matching `formatBytes` elsewhere in the renderer. */
function formatGb(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return 'không xác định';
  return `${(bytes / 1024 ** 3).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} GB`;
}

/**
 * Human ETA for the progress bar. Deliberately coarse ("khoảng 3 phút"): a
 * precise countdown on a 1.1 GB download over school Wi-Fi is always wrong and
 * makes teachers distrust the whole screen.
 */
function formatEta(remainingBytes: number, bytesPerSecond: number): string | undefined {
  if (!Number.isFinite(remainingBytes) || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return undefined;
  const seconds = Math.round(remainingBytes / bytesPerSecond);
  if (seconds <= 0) return undefined;
  if (seconds < 60) return `còn khoảng ${Math.max(1, seconds)} giây`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `còn khoảng ${minutes} phút`;
  return `còn khoảng ${Math.round(minutes / 60)} giờ`;
}

/** "0,4 GB / 1,1 GB · còn khoảng 3 phút" */
function progressDetail(progress: SetupProgress | undefined): string | undefined {
  if (!progress) return undefined;
  const received = Math.max(0, Number(progress.receivedBytes) || 0);
  const total = Math.max(0, Number(progress.totalBytes) || 0);
  const parts = [`${formatGb(received)} / ${formatGb(total)}`];
  const eta = formatEta(total - received, Number(progress.bytesPerSecond) || 0);
  if (eta) parts.push(eta);
  return parts.join(' · ');
}

/**
 * Maps the current `SetupStep` onto the checklist. A support call about "it is
 * stuck" is almost always this row being wrong, so it is derived from the
 * step the orchestrator reports instead of a flag the UI keeps in sync by hand.
 */
function stepChecklist(
  current: SetupStep | undefined,
  failedAt?: SetupStep
): SetupWizardView['steps'] {
  const currentIndex = current ? STEP_ORDER.indexOf(current) : -1;
  return WIZARD_STEPS.map(step => {
    const index = STEP_ORDER.indexOf(step.id);
    if (failedAt === step.id) return { ...step, state: 'failed' as const };
    if (current === 'complete') return { ...step, state: 'done' as const };
    if (currentIndex < 0) return { ...step, state: 'pending' as const };
    if (index < currentIndex) return { ...step, state: 'done' as const };
    if (index === currentIndex) return { ...step, state: 'current' as const };
    return { ...step, state: 'pending' as const };
  });
}

/** Requirement rows for the "system requirements" screen (§7). */
function requirementRows(
  status: SetupStatus | undefined,
  plan: SetupPlan | undefined
): SetupWizardRequirementRow[] {
  const rows: SetupWizardRequirementRow[] = [];
  const hardware = status?.hardware;

  if (hardware) {
    rows.push({
      label: 'Hệ điều hành và CPU',
      value: `${hardware.osArch} · ${hardware.logicalCpuCount} nhân`,
      ok: hardware.supported !== false
    });
    rows.push({
      label: 'Bộ xử lý',
      value: hardware.cpuModel || 'không xác định',
      ok: true
    });
    rows.push({
      label: 'RAM',
      value: formatGb(hardware.totalRamBytes),
      ok: true
    });
  }

  if (plan) {
    // §12 forbids claiming a backend is faster without measurement, so this row
    // names the build and never promises speed.
    rows.push({
      label: 'Bộ AI local',
      value: plan.runtime.installed
        ? `${plan.runtime.displayName} · đã có sẵn`
        : plan.runtime.displayName,
      ok: true,
      ...(plan.runtime.usedFallback
        ? { hint: plan.runtime.fallbackReason || 'Dùng bản CPU đã được kiểm tra thay cho bản tăng tốc.' }
        : {})
    });
    rows.push({
      label: 'Model AI',
      value: plan.model.installed
        ? `${plan.model.displayName} · đã có sẵn`
        : `${plan.model.displayName} · tải khoảng ${formatGb(plan.model.downloadBytes)}`,
      ok: true,
      // Naming the reason turns the choice from arbitrary into explainable, so a
      // teacher on a weak laptop understands why a smaller model was picked.
      hint: 'Bản phù hợp nhất với CPU và RAM của máy này.'
    });
    rows.push({
      label: 'Cần tải thêm',
      value: plan.remainingBytes > 0 ? formatGb(plan.remainingBytes) : 'không cần tải gì',
      ok: true
    });
    if (plan.diskFreeBytes !== undefined) {
      rows.push({
        label: 'Dung lượng còn trống',
        value: formatGb(plan.diskFreeBytes),
        ok: plan.enoughDiskSpace,
        // Show the shortfall, not just "not enough": it is the only number the
        // teacher can act on.
        ...(plan.enoughDiskSpace
          ? {}
          : { hint: `Cần thêm khoảng ${formatGb(Math.max(0, plan.remainingBytes - plan.diskFreeBytes))}.` })
      });
    }
  }

  return rows;
}

/**
 * Screens that mean "work is happening right now" — the wizard must not offer a
 * second "Bắt đầu" that the orchestrator would refuse as `busy`, and must not
 * let the teacher close it believing setup finished.
 */
function isWorkingScreen(screen: SetupWizardScreen): boolean {
  return screen === 'detecting' || screen === 'downloading' || screen === 'verifying' || screen === 'starting';
}

/**
 * The single source of truth for "what should the teacher see".
 *
 * Precedence is deliberate, and is the whole point of this function:
 *   1. a refusal (`blocked`) beats everything — the machine cannot proceed, so
 *      an error-plus-retry screen would be a dead end;
 *   2. a live run beats a stale error, because that error belongs to the run the
 *      teacher already retried;
 *   3. an interruption beats "welcome" — setup resumes rather than restarts.
 *
 * `preflightPending` exists because detection takes a second or two on a slow
 * school laptop; without it the wizard flashes "Chưa cài AI" and then the
 * requirements table, which reads as a glitch.
 */
function resolveWizardView(options: {
  status: SetupStatus | undefined;
  /** Whether `setup:preflight` is in flight. */
  preflightPending?: boolean;
  /** Whether `setup:start` is in flight. */
  starting?: boolean;
  /** Latest byte progress for the running download. */
  progress?: SetupProgress;
  /** Set when `setup:preflight`/`setup:start` rejected instead of returning. */
  error?: { message: string; code?: string };
}): SetupWizardView {
  const { status, preflightPending, starting, progress, error } = options;
  const plan = status?.plan;

  const base = {
    requirements: requirementRows(status, plan),
    steps: stepChecklist(status?.step, status?.error?.step)
  };

  // --- 1. Refusals: no retry, offer the offline path instead ---------------
  if (status?.blocked) {
    const copy = SETUP_FAILURE_COPY[status.blocked.code] || SETUP_FAILURE_COPY.download;
    return {
      ...base,
      screen: 'blocked',
      eyebrow: 'CHƯA CÀI ĐƯỢC AI',
      title: copy.headline,
      message: status.blocked.message || copy.recovery,
      tone: 'warning',
      canSkip: true,
      buttons: [
        { id: 'skip-ai', label: 'Dùng không có AI', variant: 'primary' },
        { id: 'settings', label: 'Mở cài đặt', variant: 'secondary' }
      ]
    };
  }

  // --- 2. Setup finished --------------------------------------------------
  // `complete` wins over a leftover error: the orchestrator clears the error on
  // transition, but a stale render must never undo a finished install.
  if (status?.complete) {
    return {
      ...base,
      screen: 'complete',
      eyebrow: 'SẴN SÀNG',
      title: 'AI trên máy đã sẵn sàng',
      message: 'Từ giờ bạn có thể tạo trò chơi bằng AI mà không cần Internet. Dữ liệu bài học không rời khỏi máy này.',
      tone: 'success',
      percent: 100,
      steps: stepChecklist('complete'),
      canSkip: true,
      buttons: [{ id: 'close', label: 'Bắt đầu dùng', variant: 'primary' }]
    };
  }

  // --- 3. A run is active (or being started) ------------------------------
  // `starting` is checked first: between the click and the first status poll the
  // persisted state is still `idle`, and showing "Bắt đầu" again would invite a
  // second run that the orchestrator refuses as `busy`.
  if (starting || status?.running) {
    const step = status?.step;
    const activeStep = progress ? progress.step : step;
    const isDownloadStep = activeStep ? DOWNLOAD_STEPS.includes(activeStep) : false;
    // A download step is only "downloading" once a byte event has arrived. The
    // orchestrator records the step *before* the first byte, and there is also a
    // post-download phase (hash verification, unpacking) that reports no bytes at
    // all. Without this, `verifying` would be unreachable and the teacher would
    // stare at a frozen 0% bar while a 1.1 GB file is hashed.
    const hasBytes = Boolean(progress) && (Number(progress?.totalBytes) || 0) > 0;

    if (isDownloadStep && hasBytes) {
      const percent = progress
        ? progressPercent(progress.receivedBytes, progress.totalBytes)
        : undefined;
      return {
        ...base,
        screen: 'downloading',
        eyebrow: 'ĐANG CÀI AI',
        title: progress?.stage === 'model' ? 'Đang tải model AI' : 'Đang cài bộ AI local',
        message: 'Bạn có thể thu nhỏ cửa sổ. Nếu mất mạng hoặc tắt máy, lần sau ứng dụng sẽ tải tiếp từ chỗ dừng.',
        tone: 'progress',
        ...(percent !== undefined ? { percent } : {}),
        stepLabel: progress?.message || (progress ? STAGE_LABEL[progress.stage] : 'Đang tải…'),
        ...(progressDetail(progress) ? { progressDetail: progressDetail(progress) } : {}),
        canSkip: false,
        buttons: [{ id: 'cancel', label: 'Hủy cài đặt', variant: 'secondary' }]
      };
    }

    if (step === 'starting' || step === 'smoke-test') {
      return {
        ...base,
        screen: 'starting',
        eyebrow: 'ĐANG KHỞI ĐỘNG',
        title: 'Đang kiểm tra AI',
        message: 'Ứng dụng đang khởi động AI trên máy và gửi một câu hỏi thử. Lần đầu bước này mất vài phút.',
        tone: 'progress',
        stepLabel: step === 'starting' ? 'Đang khởi động AI…' : 'Đang chạy thử câu hỏi mẫu…',
        canSkip: false,
        buttons: [{ id: 'cancel', label: 'Hủy cài đặt', variant: 'secondary' }]
      };
    }

    if (step === 'installing-runtime' || step === 'installing-models') {
      // Reached before the first byte arrives, and again after the download
      // finishes while the archive is verified/installed. Neither phase reports
      // bytes, so this screen explains the wait instead of showing a 0% bar.
      return {
        ...base,
        screen: 'verifying',
        eyebrow: 'ĐANG HOÀN TẤT',
        title: 'Đang kiểm tra tệp AI',
        message: 'Ứng dụng đang xác minh và cài tệp AI vừa tải. Bước này có thể mất vài phút với tệp lớn.',
        tone: 'progress',
        stepLabel: 'Đang xác minh và cài đặt…',
        canSkip: false,
        buttons: [{ id: 'cancel', label: 'Hủy cài đặt', variant: 'secondary' }]
      };
    }

    return {
      ...base,
      screen: 'detecting',
      eyebrow: 'ĐANG KIỂM TRA',
      title: 'Đang kiểm tra máy',
      message: 'Ứng dụng đang xem CPU, RAM và dung lượng trống để chọn bản AI phù hợp.',
      tone: 'progress',
      canSkip: false,
      buttons: [{ id: 'cancel', label: 'Hủy', variant: 'secondary' }]
    };
  }

  // --- 4. A recoverable failure recorded by the orchestrator --------------
  if (status?.error) {
    const code = (status.error.code || 'download') as SetupFailureCode;
    const copy = SETUP_FAILURE_COPY[code] || SETUP_FAILURE_COPY.download;
    const buttons: SetupWizardButton[] = [];
    if (copy.action === 'skip-ai') {
      buttons.push({ id: 'skip-ai', label: 'Dùng không có AI', variant: 'primary' });
    } else if (copy.action === 'settings') {
      buttons.push({ id: 'settings', label: 'Mở cài đặt', variant: 'primary' });
    } else {
      buttons.push({ id: 'retry', label: 'Thử lại', variant: 'primary' });
    }
    buttons.push({ id: 'skip-ai', label: 'Để sau', variant: 'secondary' });
    return {
      ...base,
      screen: 'error',
      eyebrow: 'CẦN XỬ LÝ',
      title: copy.headline,
      // The orchestrator's message is more specific than the generic copy, so
      // keep it first and append the sentence that says what to do next.
      message: `${status.error.message} ${copy.recovery}`,
      tone: 'danger',
      canSkip: true,
      buttons
    };
  }

  // --- 5. A rejection the renderer caught itself -------------------------
  if (error) {
    return {
      ...base,
      screen: 'error',
      eyebrow: 'CẦN XỬ LÝ',
      title: 'Chưa cài được AI',
      message: `${error.message} Bạn vẫn có thể dùng ứng dụng không có AI.`,
      tone: 'danger',
      canSkip: true,
      buttons: [
        { id: 'retry', label: 'Thử lại', variant: 'primary' },
        { id: 'skip-ai', label: 'Để sau', variant: 'secondary' }
      ]
    };
  }

  // --- 6. Detection in flight, before anything is known -------------------
  if (preflightPending) {
    return {
      ...base,
      screen: 'detecting',
      eyebrow: 'ĐANG KIỂM TRA',
      title: 'Đang kiểm tra máy',
      message: 'Ứng dụng đang xem CPU, RAM và dung lượng trống để chọn bản AI phù hợp.',
      tone: 'progress',
      canSkip: true,
      buttons: []
    };
  }

  // --- 7. Interrupted earlier: resume, do not restart ---------------------
  // `detecting` is excluded on purpose: `preflight()` persists it while only
  // inspecting the machine, so treating it as an interruption would replace the
  // requirements screen with "lần trước chưa xong" on a first, healthy run.
  // Resume is offered only once real work (a download) has been recorded.
  const interruptedStep = status && plan && status.step !== 'idle' && status.step !== 'complete'
    && status.step !== 'detecting';
  if (status && plan && interruptedStep) {
    const stepLabel = WIZARD_STEPS.find(step => step.id === status.step)?.label || 'cài đặt';
    return {
      ...base,
      screen: 'resume',
      eyebrow: 'TIẾP TỤC CÀI ĐẶT',
      title: 'Lần cài đặt trước chưa xong',
      message: `Ứng dụng đã dừng ở bước “${stepLabel}”. Tiếp tục sẽ không phải tải lại phần đã xong.`,
      tone: 'neutral',
      canSkip: true,
      buttons: [
        { id: 'start', label: 'Tiếp tục cài đặt', variant: 'primary' },
        { id: 'skip-ai', label: 'Để sau', variant: 'secondary' }
      ]
    };
  }

  // --- 8. First run -------------------------------------------------------
  return {
    ...base,
    screen: plan ? 'requirements' : 'welcome',
    eyebrow: plan ? 'KIỂM TRA ĐÃ XONG' : 'CHÀO MỪNG',
    title: plan ? 'Máy bạn đã sẵn sàng' : 'Cài AI ngay trên máy này',
    message: plan
      ? 'Ứng dụng cần tải thêm bộ AI để tạo trò chơi. Bạn vẫn dùng được EduGame Studio trong lúc chờ.'
      : 'Để tạo trò chơi bằng AI, EduGame Studio cần cài thêm một lần. Bộ AI chạy ngay trên máy bạn, không gửi bài học lên Internet, và dùng được khi mất mạng.',
    tone: 'neutral',
    canSkip: true,
    buttons: [
      { id: 'start', label: plan ? 'Bắt đầu tải và cài' : 'Bắt đầu', variant: 'primary' },
      { id: 'skip-ai', label: 'Để sau', variant: 'secondary' }
    ]
  };
}

/**
 * The public surface, published as one global.
 *
 * There is no `export` in this file (see the header), so this object is how both
 * consumers reach it: `renderer/features/setup-wizard.ts` as a classic script,
 * and `tests/setup-wizard-model.test.ts` through `vm.runInContext`. Keeping the
 * surface in a single literal means a renamed helper cannot silently leave the
 * wizard calling `undefined`.
 */
var SetupWizardModel = {
  SETUP_DEFAULT_MODEL_ID,
  WIZARD_STEPS,
  SETUP_FAILURE_COPY,
  progressPercent,
  formatGb,
  formatEta,
  progressDetail,
  stepChecklist,
  requirementRows,
  isWorkingScreen,
  resolveWizardView
};


