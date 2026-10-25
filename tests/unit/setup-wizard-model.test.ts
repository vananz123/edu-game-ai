/**
 * First-run setup wizard UI helper, §7 (docs/archive/specs/update_AI_plan_5.txt).
 *
 * Two things are tested here, and the first one is the reason this file was
 * written the way it is:
 *
 *   1. The built file is a *classic script*. `index.html` loads it with
 *      `<script src>`, and CommonJS output would throw `exports is not defined`
 *      at load time and take the whole renderer down. The module is therefore
 *      evaluated with `vm.runInContext` against a bare context — no `exports`,
 *      no `module`, no `require` — which is exactly the browser situation.
 *   2. The screen-selection rules, which decide whether a teacher can retry,
 *      must exit to the offline app, or is told the installation finished.
 *
 * The UI file itself (`renderer/features/setup-wizard.ts`) is `@ts-nocheck`
 * DOM code and is not covered; every branch that matters lives in the model.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { SETUP_STEPS } from '../../src/ai-core/setup-state';
import { toSetupError } from '../../src/ai-core/setup-orchestrator';
import type { SetupProgress, SetupStatus } from '../../src/ai-core/setup-orchestrator';

const BUILT = path.join(__dirname, '..', '..', 'src', 'renderer', 'setup-wizard-model.js');

/** Loads the compiled renderer file the way the browser will. */
function loadWizardModel() {
  const code = fs.readFileSync(BUILT, 'utf8');
  const context = vm.createContext({ console });
  vm.runInContext(code, context, { filename: BUILT });
  return { code, model: (context as any).SetupWizardModel };
}

const { code, model } = loadWizardModel();

// --- 1. The file must load as a classic script ------------------------------
assert.ok(!/Object\.defineProperty\(exports/.test(code), 'the wizard model must not be compiled to CommonJS');
// The real proof is that `loadWizardModel()` above succeeded: a CommonJS file
// throws `exports is not defined` in that bare context before running a single
// statement. A raw `/require\(/` text scan is useless here because the file's
// own comments legitimately mention `require()`, so no text assertion is made.
assert.ok(model && typeof model.resolveWizardView === 'function', 'the SetupWizardModel global must exist');

const {
  resolveWizardView,
  progressPercent,
  formatEta,
  progressDetail,
  stepChecklist,
  requirementRows,
  isWorkingScreen,
  SETUP_FAILURE_COPY,
  WIZARD_STEPS,
  SETUP_DEFAULT_MODEL_ID
} = model;

// --- 2. The restated contracts must match the real modules -----------------
// The model file cannot `import` (see its header), so it repeats the step list
// and the failure codes. If `ai-core` gains a step or a code and this list is
// not updated, the wizard would render an unknown state as a stuck one.
{
  const realSteps = [...SETUP_STEPS].filter(step => step !== 'idle' && step !== 'complete');
  // `WIZARD_STEPS` was created inside the `vm` context, i.e. in another realm,
  // so its arrays have a different `Array.prototype` and `deepStrictEqual`
  // would fail even on identical contents. Compare copied primitives instead.
  const usedSteps = WIZARD_STEPS.map((step: { id: string }) => String(step.id));
  assert.equal(
    usedSteps.join(','),
    realSteps.join(','),
    'every SetupStep except idle/complete must appear in the wizard checklist, in order'
  );

  // `toSetupError` is the only public source of SetupFailureCode values; a code
  // it can return but the copy table lacks would render a blank error screen.
  const codes = Object.keys(SETUP_FAILURE_COPY);
  for (const code of ['unsupported-hardware', 'disk-space', 'network', 'download', 'integrity',
    'startup', 'smoke-test', 'incomplete-configuration', 'cancelled', 'busy']) {
    assert.ok(codes.includes(code), `failure copy must cover "${code}"`);
  }
  for (const code of codes) {
    const entry = SETUP_FAILURE_COPY[code];
    assert.ok(entry.headline.trim().length > 0, `${code} needs a teacher-facing headline`);
    assert.ok(entry.recovery.trim().length > 0, `${code} needs a recovery sentence`);
  }

  // The mapped error keeps its step, which the retry logic depends on.
  const mapped = toSetupError(new Error('ENOTFOUND registry.npmjs.org'), undefined, 'installing-models');
  assert.equal(mapped.code, 'network');
  assert.equal(mapped.step, 'installing-models');
  assert.ok(SETUP_FAILURE_COPY[mapped.code], 'a mapped code must have copy');

  // Regression (2026-10-22, teacher report): the real smoke-test failure after a
  // first-run 4B install was saved with code `startup` — "AI local chưa khởi động
  // nên không thể kiểm tra." matched the /khởi động/ sniff — and the wizard then
  // rendered "AI không khởi động được" with a retry that could never work, while
  // the model was running fine. A step-12 failure is always a smoke test.
  for (const message of [
    'AI local chưa khởi động nên không thể kiểm tra.',
    'AI local khởi động nhưng không trả về nội dung thử nghiệm.',
    'Không khởi chạy được model Qwen 4B: AI không trả về nội dung.'
  ]) {
    const smoke = toSetupError(new Error(message), undefined, 'smoke-test');
    assert.equal(smoke.code, 'smoke-test', `"${message}" must stay a smoke-test failure`);
    assert.equal(smoke.step, 'smoke-test');
  }
  // A genuine start failure keeps the startup copy.
  assert.equal(toSetupError(new Error('Không khởi chạy được model X: exit 1'), undefined, 'starting').code, 'startup');
}

// --- Fixtures (synthetic; no machine is ever inspected) --------------------
const plan = {
  runtime: {
    id: 'llama.cpp-b5000-cpu-x64',
    displayName: 'llama.cpp · CPU x64',
    downloadBytes: 300 * 1024 ** 2,
    installed: false,
    usedFallback: false
  },
  model: {
    id: SETUP_DEFAULT_MODEL_ID,
    displayName: 'Qwen3.5 2B · Q4_K_M',
    downloadBytes: 1_280_835_840,
    installed: false
  },
  remainingBytes: 1_529_423_872,
  diskFreeBytes: 40 * 1024 ** 3,
  enoughDiskSpace: true
};

function status(overrides: Partial<SetupStatus> = {}): SetupStatus {
  return { step: 'idle', complete: false, running: false, ...overrides } as SetupStatus;
}

function progress(overrides: Partial<SetupProgress> = {}): SetupProgress {
  return {
    step: 'installing-models',
    stage: 'model',
    itemId: SETUP_DEFAULT_MODEL_ID,
    receivedBytes: 300 * 1024 ** 2,
    totalBytes: 1_200 * 1024 ** 2,
    bytesPerSecond: 5 * 1024 ** 2,
    message: 'Đang tải model AI…',
    ...overrides
  };
}

// --- 3. Screen selection ---------------------------------------------------
{
  // First launch: explanation first, and escaping to the offline app is allowed.
  const welcome = resolveWizardView({ status: status() });
  assert.equal(welcome.screen, 'welcome');
  assert.equal(welcome.canSkip, true);
  assert.ok(welcome.buttons.some((button: { id: string }) => button.id === 'start'));
  assert.ok(welcome.buttons.some((button: { id: string }) => button.id === 'skip-ai'),
    'a teacher must always be able to leave the wizard');

  // Detection in flight: no "Bắt đầu" yet, and nothing claims to be stuck.
  const detecting = resolveWizardView({ status: status(), preflightPending: true });
  assert.equal(detecting.screen, 'detecting');
  assert.ok(isWorkingScreen(detecting.screen));

  // After preflight: real numbers before a 1.1 GB download.
  const requirements = resolveWizardView({ status: status({ plan, step: 'detecting' }) });
  assert.equal(requirements.screen, 'requirements');
  const labels = requirements.requirements.map((row: { label: string }) => row.label);
  assert.ok(labels.includes('Model AI'), 'the model name must be shown (§7)');
  assert.ok(labels.includes('Cần tải thêm'));
  assert.ok(labels.includes('Dung lượng còn trống'), 'free disk space must be shown (§7)');
  const modelRow = requirements.requirements.find((row: { label: string }) => row.label === 'Model AI');
  assert.match(modelRow.value, /Qwen3\.5 2B/, 'the row names the model');
  assert.match(modelRow.value, /GB/, 'and its approximate size');
}

// --- 4. Precedence: blocked > running > error > resume > welcome -----------
{
  const blockedByCpu = resolveWizardView({
    status: status({
      plan,
      blocked: { code: 'unsupported-hardware', message: 'Máy này dùng Windows ARM64.' }
    })
  });
  assert.equal(blockedByCpu.screen, 'blocked');
  // A retry button here would be a button that can never succeed.
  assert.ok(!blockedByCpu.buttons.some((button: { id: string }) => button.id === 'retry'),
    'unsupported hardware must not offer "Thử lại"');
  assert.ok(blockedByCpu.buttons.some((button: { id: string }) => button.id === 'skip-ai'));
  assert.match(blockedByCpu.message, /ARM64/, 'the orchestrator message is shown verbatim');

  const blockedByDisk = resolveWizardView({
    status: status({ plan: { ...plan, enoughDiskSpace: false, diskFreeBytes: 200 * 1024 ** 2 } })
  });
  // Disk space is actionable, so it is an error with retry, not a dead end.
  assert.notEqual(blockedByDisk.screen, 'blocked');
  const diskRow = blockedByDisk.requirements.find((row: { label: string }) => row.label === 'Dung lượng còn trống');
  assert.equal(diskRow.ok, false);
  assert.match(diskRow.hint, /Cần thêm/, 'the shortfall is the only actionable number');

  // A live run wins over the error left by the previous attempt.
  const retrying = resolveWizardView({
    status: status({ plan, step: 'installing-models', running: true, error: { message: 'cũ', code: 'network', step: 'installing-models', attempts: 1 } }),
    progress: progress()
  });
  assert.equal(retrying.screen, 'downloading', 'a running retry must not show the old error');

  // "Đang bắt đầu" is true before the first status poll reports running: the
  // click must not be answered with a second clickable "Bắt đầu".
  const clicked = resolveWizardView({ status: status({ plan }), starting: true });
  assert.ok(isWorkingScreen(clicked.screen), 'the click immediately shows work in progress');
  assert.ok(!clicked.buttons.some((button: { id: string }) => button.id === 'start'));

  // An interrupted run offers resume, not a restart of the download.
  const interrupted = resolveWizardView({ status: status({ plan, step: 'installing-models' }) });
  assert.equal(interrupted.screen, 'resume');
  assert.ok(interrupted.buttons.some((button: { id: string }) => button.id === 'start'));
  assert.match(interrupted.message, /Tải model AI/, 'the interrupted step is named');

  // `preflight()` persists `detecting` just by inspecting the machine, so a
  // healthy first run must still land on the requirements screen.
  for (const step of ['detecting', 'idle'] as const) {
    const firstRun = resolveWizardView({ status: status({ plan, step }) });
    assert.notEqual(firstRun.screen, 'resume', `step "${step}" is not an interrupted run`);
  }

  // Complete beats a stale error and offers only the way in.
  const done = resolveWizardView({ status: status({ plan, step: 'complete', complete: true }) });
  assert.equal(done.screen, 'complete');
  assert.equal(done.percent, 100);
  assert.equal(done.buttons.map((button: { id: string }) => String(button.id)).join(','), 'close');
  assert.ok(done.steps.every((step: { state: string }) => step.state === 'done'));
}

// --- 5. Errors: the recovery action must match the failure -----------------
{
  const network = resolveWizardView({
    status: status({
      plan,
      error: { message: 'Không kết nối được để tải AI.', code: 'network', step: 'installing-models', attempts: 1 }
    })
  });
  assert.equal(network.screen, 'error');
  assert.equal(network.tone, 'danger');
  assert.ok(network.buttons.some((button: { id: string }) => button.id === 'retry'),
    'a network failure is retryable');
  assert.match(network.message, /Không kết nối được/, 'the specific message is kept');
  assert.match(network.message, /sẽ không phải tải lại/,
    'the copy promises resumable bytes, which the orchestrator honours');
  const failedStep = network.steps.find((step: { state: string }) => step.state === 'failed');
  assert.equal(failedStep.id, 'installing-models', 'the checklist marks where it stopped');

  // A failed smoke test is not a download problem: it points at Settings.
  const smoke = resolveWizardView({
    status: status({
      plan,
      error: { message: 'AI local không trả về nội dung.', code: 'smoke-test', step: 'smoke-test', attempts: 1 }
    })
  });
  assert.ok(smoke.buttons.some((button: { id: string }) => button.id === 'settings'),
    'a smoke-test failure offers the model/repair path');
  assert.ok(!smoke.buttons.some((button: { id: string }) => button.id === 'retry'));

  // A rejection with no code falls back to generic copy instead of rendering an
  // undefined headline.
  const unknown = resolveWizardView({
    status: status({ plan, error: { message: 'lỗi lạ', step: 'installing-runtime', attempts: 2 } })
  });
  assert.equal(unknown.screen, 'error');
  assert.ok(unknown.title.length > 0);
  assert.ok(unknown.buttons.some((button: { id: string }) => button.id === 'retry'));

  // A rejection raised by the IPC call itself (no persisted status yet).
  const rejected = resolveWizardView({ status: status({ plan }), error: { message: 'Bị từ chối.' } });
  assert.equal(rejected.screen, 'error');
  assert.match(rejected.message, /Bị từ chối/);
  assert.equal(rejected.canSkip, true);
}

// --- 6. Progress maths and labels ------------------------------------------
{
  assert.equal(progressPercent(0, 100), 0);
  assert.equal(progressPercent(50, 100), 50);
  assert.equal(progressPercent(100, 100), 100);
  // A progress event with a missing total must not render "NaN%".
  assert.equal(progressPercent(500, 0), 0);
  assert.equal(progressPercent(Number.NaN, 100), 0);
  assert.equal(progressPercent(300, 100), 100, 'a server reporting over 100% is clamped');

  assert.equal(formatEta(10 * 1024 ** 2, 5 * 1024 ** 2), 'còn khoảng 2 giây');
  assert.equal(formatEta(30 * 1024 ** 2, 1 * 1024 ** 2), 'còn khoảng 30 giây');
  assert.equal(formatEta(300 * 1024 ** 2, 1 * 1024 ** 2), 'còn khoảng 5 phút');
  assert.equal(formatEta(100 * 1024 ** 2, 0), undefined, 'no speed means no ETA, not Infinity');
  assert.equal(formatEta(0, 5 * 1024 ** 2), undefined, 'a finished download has no ETA');

  const detail = progressDetail(progress());
  assert.match(detail, /GB \/ .*GB/, 'received and total are both shown');
  assert.match(detail, /còn khoảng/, 'and a coarse ETA');
  assert.equal(progressDetail(undefined), undefined);

  const downloading = resolveWizardView({
    status: status({ plan, step: 'installing-models', running: true }),
    progress: progress()
  });
  assert.equal(downloading.screen, 'downloading');
  assert.equal(downloading.percent, 25);
  assert.equal(downloading.stepLabel, 'Đang tải model AI…');
  // Cancel is the only exit while downloading; closing would hide progress.
  assert.equal(downloading.buttons.map((button: { id: string }) => String(button.id)).join(','), 'cancel');
  assert.equal(downloading.canSkip, false);

  // The runtime download labels itself as the runtime, not the model.
  const runtimeProgress = progress({ stage: 'runtime', step: 'installing-runtime', itemId: 'llama.cpp-b5000-cpu-x64' });
  const runtimeView = resolveWizardView({ status: status({ plan, step: 'installing-runtime', running: true }), progress: runtimeProgress });
  assert.equal(runtimeView.screen, 'downloading');
  assert.match(runtimeView.title, /bộ AI local/);

  // Health check/smoke test has no byte counter, so no percentage is invented.
  const starting = resolveWizardView({ status: status({ plan, step: 'smoke-test', running: true }) });
  assert.equal(starting.screen, 'starting');
  assert.equal(starting.percent, undefined);
  assert.match(starting.stepLabel, /chạy thử/i);

  // The runtime step is recorded before its first byte: show verification, not
  // a 0% bar that looks frozen.
  const verifying = resolveWizardView({ status: status({ plan, step: 'installing-runtime', running: true }) });
  assert.equal(verifying.screen, 'verifying');
  assert.equal(verifying.percent, undefined);

  // A byte event names the real step, so a stale status step must not keep the
  // UI on "verifying" once the download has started.
  const runtimeBytes = resolveWizardView({
    status: status({ plan, step: 'installing-runtime', running: true }),
    progress: progress({ step: 'installing-runtime', stage: 'runtime' })
  });
  assert.equal(runtimeBytes.screen, 'downloading');
}

// --- 7. Checklist ----------------------------------------------------------
{
  const partial = stepChecklist('installing-models');
  assert.equal(partial.map((step: { state: string }) => String(step.state)).join(','),
    'done,done,current,pending,pending');

  const failed = stepChecklist('installing-runtime', 'installing-runtime');
  assert.equal(failed[1].state, 'failed');
  assert.equal(failed[0].state, 'done', 'a completed step stays completed');

  const idle = stepChecklist('idle');
  assert.ok(idle.every((step: { state: string }) => step.state === 'pending'),
    'nothing is claimed before detection runs');
  assert.equal(stepChecklist(undefined).length, WIZARD_STEPS.length);
}

// --- 8. Requirement rows degrade instead of throwing ------------------------
{
  assert.equal(requirementRows(undefined, undefined).length, 0,
    'no status means no rows, not a crash on first paint');

  const rows = requirementRows(
    status({
      plan,
      hardware: {
        platform: 'win32',
        arch: 'x64',
        osArch: 'x64',
        cpuModel: 'Intel Core i5 (synthetic)',
        logicalCpuCount: 8,
        totalRamBytes: 16 * 1024 ** 3,
        diskFreeBytes: undefined,
        supported: true
      }
    }),
    plan
  );
  const byLabel = Object.fromEntries(
    rows.map((row: { label: string; value: string }) => [row.label, row.value])
  );
  assert.equal(byLabel['Bộ xử lý'], 'Intel Core i5 (synthetic)');
  assert.match(byLabel['RAM'], /GB/);
  assert.match(byLabel['Hệ điều hành và CPU'], /8 nhân/);

  // The model row must say *why* this model was chosen: setup now picks it from
  // CPU/RAM via `recommendLocalModelId()`, so the screen has to explain it rather
  // than presenting an arbitrary download.
  const modelRow = rows.find((row: { label: string }) => row.label === 'Model AI');
  assert.ok(modelRow, 'the requirements screen must name the model to download');
  assert.match(modelRow.value, /Qwen/);
  assert.match(modelRow.hint || '', /phù hợp nhất/, 'the model row must justify the choice');

  // A CPU the detector rejected is shown as not-ok even before `blocked` is set.
  const unsupported = requirementRows(
    status({
      plan,
      hardware: {
        platform: 'win32',
        arch: 'arm64',
        osArch: 'arm64',
        cpuModel: 'synthetic',
        logicalCpuCount: 8,
        totalRamBytes: 16 * 1024 ** 3,
        diskFreeBytes: undefined,
        supported: false
      }
    }),
    plan
  );
  assert.equal(unsupported[0].ok, false);

  // The fallback reason (e.g. no verified accelerated build) must reach the teacher.
  const fallbackPlan = {
    ...plan,
    runtime: { ...plan.runtime, usedFallback: true, fallbackReason: 'Chưa có bản tăng tốc đã kiểm tra.' }
  };
  const fallbackRows = requirementRows(status({ plan: fallbackPlan }), fallbackPlan);
  const runtimeRow = fallbackRows.find((row: { label: string }) => row.label === 'Bộ AI local');
  assert.match(runtimeRow.hint, /Chưa có bản tăng tốc/);

  // An unmeasurable disk (`undefined`) is omitted rather than shown as "NaN GB".
  const unknownDisk = { ...plan, diskFreeBytes: undefined };
  const unknownRows = requirementRows(status({ plan: unknownDisk }), unknownDisk);
  assert.ok(!unknownRows.some((row: { label: string }) => row.label === 'Dung lượng còn trống'));
}

console.log('setup wizard model tests passed');
