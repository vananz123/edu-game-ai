import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ANALYSIS_STAGE_ORDER,
  GENERATION_STAGE_ORDER,
  analysisProgressFraction,
  formatEta,
  formatStopwatch,
  generationBaselineMs,
  generationEta,
  generationProgressFraction,
  generationSampleCount
} from '../../src/shared/generation-eta';

/**
 * DECISIONS #71: the step-5 progress bar, percentage and ETA.
 *
 * Two kinds of check:
 *   1. the pure maths (`src/shared/generation-eta.ts`);
 *   2. drift between that module and the renderer copy in
 *      `src/renderer/features/wizard/state.ts`. The renderer is a flat set of
 *      classic scripts with no bundler, so the maths is duplicated by necessity;
 *      without this test the two copies would silently diverge and the bar would
 *      report numbers the tested code never produced.
 */

// `__dirname` is `dist/tests/unit` at runtime, so three levels up is the repo
// root (same convention as tests/unit/illustration-registry.test.ts).
const ROOT = path.join(__dirname, '..', '..', '..');
const STATE_SRC = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'features', 'wizard', 'state.ts'), 'utf8');
const STEP_SRC = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'features', 'wizard', 'step-generate.ts'), 'utf8');
const ANALYSIS_SRC = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'features', 'wizard', 'step-analysis.ts'), 'utf8');
const CSS_SRC = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles', 'app.css'), 'utf8');

/** Pull a top-level `const NAME = [...]` array of string literals out of a source file. */
function readStringArray(source: string, name: string): string[] {
  const match = source.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  assert.ok(match, `không tìm thấy ${name}`);
  return [...match![1].matchAll(/'([^']+)'/g)].map(item => item[1]);
}

function iso(offsetMs: number): string {
  return new Date(1700000000000 + offsetMs).toISOString();
}

/** A finished generation that took `durationMs`. */
function sample(durationMs: number, startOffsetMs = 0) {
  return { startedAt: iso(startOffsetMs), finishedAt: iso(startOffsetMs + durationMs) };
}

async function main(): Promise<void> {
  // --- 1. stage order is shared verbatim with the renderer -------------------
  const rendererOrder = readStringArray(STATE_SRC, 'WIZARD_GENERATION_STAGES_ORDER');
  assert.deepEqual(
    rendererOrder,
    [...GENERATION_STAGE_ORDER],
    'thứ tự bước trong renderer phải khớp GENERATION_STAGE_ORDER'
  );
  // The checklist in step-generate.ts renders exactly these stages.
  const checklistStages = [...STEP_SRC.matchAll(/^\s*\['([a-z]+)', '[^']*'\]/gm)].map(match => match[1]);
  assert.deepEqual(checklistStages, [...GENERATION_STAGE_ORDER], 'checklist bước 5 phải khớp thứ tự bước');

  // --- 2. progress bar is a stage counter, never a timer --------------------
  assert.equal(generationProgressFraction('retrieve'), 0.2);
  assert.equal(generationProgressFraction('generate'), 0.4);
  assert.equal(generationProgressFraction('validate'), 0.6);
  assert.equal(generationProgressFraction('repair'), 0.8);
  // A skipped repair stage must not leave the bar under 100%.
  assert.equal(generationProgressFraction('ready'), 1);
  assert.equal(generationProgressFraction('cached'), 0, 'cached không phải một bước tiến trình');
  assert.equal(generationProgressFraction(''), 0);
  assert.equal(generationProgressFraction(null), 0);

  // --- 3. ETA needs a measured baseline; otherwise it reports nothing -------
  assert.equal(generationBaselineMs([]), null);
  assert.equal(generationBaselineMs(null), null);
  assert.equal(generationEta(1000, 'generate', []), null, 'không có mẫu thì không được bịa số');

  // Rows without a finish time (a run still in flight) are not samples.
  assert.equal(generationSampleCount([{ startedAt: iso(0), finishedAt: null }]), 0);
  assert.equal(generationSampleCount([{ startedAt: null, finishedAt: iso(1000) }]), 0);
  assert.equal(generationSampleCount([sample(60000)]), 1);

  // Clock skew and abandoned rows are rejected, not used as a baseline.
  assert.equal(generationBaselineMs([sample(500)]), null, 'dưới 1 giây là dữ liệu rác');
  assert.equal(generationBaselineMs([sample(4 * 60 * 60 * 1000)]), null, 'trên 3 giờ là dữ liệu rác');
  assert.equal(generationBaselineMs([{ startedAt: 'not-a-date', finishedAt: iso(1000) }]), null);

  // --- 4. median, so one aborted run cannot inflate the estimate -----------
  const mixed = [sample(60000), sample(90000), sample(120000), { startedAt: iso(0), finishedAt: iso(6 * 60 * 60 * 1000) }];
  assert.equal(generationBaselineMs(mixed), 90000, 'median bỏ qua lần chạy 6 giờ bị treo');
  assert.equal(generationSampleCount(mixed), 3);

  // --- 5. ETA shrinks as the run advances ---------------------------------
  const baseline = [sample(60000), sample(70000), sample(80000)];
  const early = generationEta(0, 'retrieve', baseline);
  const middle = generationEta(20000, 'generate', baseline);
  assert.ok(early && middle, 'phải có ước tính khi có mẫu');
  assert.ok(middle!.remainingMs < early!.remainingMs, 'càng về sau thời gian còn lại càng giảm');
  assert.equal(early!.overrunMs, 0);
  assert.equal(early!.medianMs, 70000);
  assert.equal(early!.sampleCount, 3);

  // Never negative: past the learned total it becomes an overrun, not a fake
  // "còn 1 giây" countdown that never reaches zero.
  const overrun = generationEta(10 * 60 * 1000, 'validate', baseline);
  assert.ok(overrun);
  assert.equal(overrun!.remainingMs, 0);
  assert.ok(overrun!.overrunMs > 0, 'phải báo trễ thay vì kẹt ở 0');

  // Unknown stage still produces a number (fraction falls back to one stage).
  assert.ok(generationEta(0, 'unknown', baseline));

  // --- 6. duration formatting -------------------------------------------
  assert.equal(formatEta(0), '0 giây');
  assert.equal(formatEta(45000), '45 giây');
  assert.equal(formatEta(60000), '1 phút');
  assert.equal(formatEta(80000), '1 phút 20 giây');
  assert.equal(formatEta(31 * 60000), '31 phút');
  assert.equal(formatEta(-5000), '0 giây', 'không hiển thị thời gian âm');

  // --- 7. drift guard: the renderer copy must match the tested module -----
  // Baseline window constants.
  assert.match(STATE_SRC, /WZ_ETA_MIN_SAMPLE_MS\s*=\s*1000\b/, 'ngưỡng mẫu tối thiểu trong renderer bị lệch');
  assert.match(
    STATE_SRC,
    /WZ_ETA_MAX_SAMPLE_MS\s*=\s*3\s*\*\s*60\s*\*\s*60\s*\*\s*1000\b/,
    'ngưỡng mẫu tối đa trong renderer bị lệch'
  );
  // The median index and the fraction formula are the parts a rewrite would
  // silently change.
  assert.match(STATE_SRC, /durations\[Math\.floor\(durations\.length\s*\/\s*2\)\]/, 'renderer phải dùng median');
  assert.match(STATE_SRC, /if \(stage === 'ready'\) return 1;/, 'ready phải luôn là 100%');
  assert.match(STATE_SRC, /\(index \+ 1\) \/ order\.length/, 'công thức phần trăm bước bị lệch');

  // --- 8. the UI actually renders what is asserted above -----------------
  assert.match(STEP_SRC, /const percent = Math\.round\(fraction \* 100\)/, 'bước 5 phải tính % từ số bước');
  assert.match(STEP_SRC, /role="progressbar"/, 'thiếu progressbar cho trình đọc màn hình');
  assert.match(STEP_SRC, /data-wizard-generate-eta/, 'thiếu chỗ hiển thị ETA');
  assert.match(STEP_SRC, /Đang chạy…/, 'chưa có trạng thái trung thực khi không có mẫu');
  assert.match(STEP_SRC, /wizardLoadGenerationHistory\(true\)/, 'ETA phải đọc lịch sử thật từ ai_tasks');
  assert.match(STATE_SRC, /row\.kind === 'generate-lesson' && row\.finishedAt/, 'chỉ dùng mục đã tạo xong cùng loại');

  // Spinner: markup + the keyframe it depends on must both exist, otherwise the
  // "running" stage is visually static.
  assert.match(STEP_SRC, /wizard-gen-spinner/, 'thiếu spinner ở bước đang chạy');
  assert.match(STEP_SRC, /aria-hidden="true"/, 'spinner phải ẩn với trình đọc màn hình');
  assert.match(CSS_SRC, /@keyframes spin-slow/, 'thiếu keyframes spin-slow');
  assert.match(CSS_SRC, /\.wizard-gen-spinner\{[^}]*animation:spin-slow/, 'spinner chưa được gắn animation');
  assert.match(
    CSS_SRC,
    /@media \(prefers-reduced-motion: reduce\)\{[^@]*\.wizard-gen-spinner\{animation:none/,
    'phải tôn trọng prefers-reduced-motion'
  );

  // --- 9. step 2 shows the same three pieces of progress (#75) --------------
  // Same contract as step 5: the checklist order comes from one array, and the
  // renderer copy must not drift from the tested module.
  const rendererAnalysisOrder = readStringArray(STATE_SRC, 'WIZARD_ANALYSIS_STAGES_ORDER');
  assert.deepEqual(
    rendererAnalysisOrder,
    [...ANALYSIS_STAGE_ORDER],
    'thứ tự bước phân tích trong renderer phải khớp ANALYSIS_STAGE_ORDER'
  );
  const analysisChecklist = [...ANALYSIS_SRC.matchAll(/^\s*\['([a-z]+)', '[^']*'\]/gm)].map(match => match[1]);
  assert.deepEqual(analysisChecklist, [...ANALYSIS_STAGE_ORDER], 'checklist bước 2 phải khớp thứ tự bước');

  // Stage counter, never a timer — and `ready` is always 100%.
  assert.equal(analysisProgressFraction('prepare'), 0.25);
  assert.equal(analysisProgressFraction('generate'), 0.5);
  assert.equal(analysisProgressFraction('repair'), 0.75);
  assert.equal(analysisProgressFraction('ready'), 1);
  assert.equal(analysisProgressFraction('cached'), 0, 'cached không phải một bước tiến trình');
  assert.equal(analysisProgressFraction(''), 0);
  assert.equal(analysisProgressFraction(null), 0);

  // Step 2 markup: bar + aria + spinner + the frozen-total line.
  assert.match(ANALYSIS_SRC, /role="progressbar"/, 'bước 2 thiếu progressbar cho trình đọc màn hình');
  assert.match(ANALYSIS_SRC, /aria-label="Tiến trình phân tích"/, 'progressbar bước 2 cần nhãn riêng');
  assert.match(ANALYSIS_SRC, /WIZARD_GENERATION_SPINNER/, 'bước 2 phải dùng chung spinner với bước 5');
  assert.match(ANALYSIS_SRC, /data-wizard-analysis-elapsed/, 'thiếu đồng hồ đang chạy của bước 2');
  assert.match(ANALYSIS_SRC, /data-wizard-analysis-total-line/, 'thiếu dòng tổng thời gian sau khi phân tích xong');
  assert.match(ANALYSIS_SRC, /lessonStage === 'cached'/, 'bước 2 phải báo dùng lại cache thay vì bốn bước giả');
  // A total is only frozen for a run that really happened.
  assert.match(
    ANALYSIS_SRC,
    /wizardStopAnalysisClock\(\{ finished: Boolean\(result\) && !result\.cached \}\)/,
    'chỉ được ghi tổng khi phân tích thật sự chạy xong'
  );
  // The old constant guess must not come back: the only claim is measured time.
  assert.doesNotMatch(STATE_SRC, /Đã chờ/, 'bước 2 không được bịa thời gian ước lượng');
  assert.doesNotMatch(STATE_SRC, /thường mất \d+–\d+ phút/, 'bước 2 không được bịa thời gian ước lượng');

  // --- 10. drift guard for the renderer copies of the shared maths ----------
  assert.match(STATE_SRC, /if \(stage === 'ready'\) return 1;/, 'ready phải luôn là 100% (bước 2)');
  assert.match(STATE_SRC, /\(index \+ 1\) \/ order\.length/, 'công thức phần trăm bước 2 bị lệch');
  // The stopwatch is duplicated between `src/shared` and the renderer, so both
  // must compute the same string for the same span.
  assert.equal(formatStopwatch(0), '');
  assert.equal(formatStopwatch(-5000), '');
  assert.equal(formatStopwatch(65 * 1000), '1:05');
  assert.equal(formatStopwatch(12 * 60 * 1000 + 3000), '12:03');
  assert.equal(formatStopwatch(3600 * 1000 + 123 * 1000), '1:02:03');

  console.log('generation-eta: ok');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

