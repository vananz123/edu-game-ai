/**
 * Wizard generation ETA (docs/DECISIONS.md #71).
 *
 * The main process reports five real stages but no per-stage timing, and the
 * model has no token stream, so a live percentage inside a stage would be
 * invented. What *is* measured is the total duration of previous generations on
 * this machine (`ai_tasks` rows with a `finishedAt`). That is enough for an
 * honest, deliberately coarse remaining-time estimate.
 *
 * Everything here is a pure function so the renderer and the unit tests share one
 * implementation: the renderer only formats and displays the result.
 */

/** Stage order for one lesson generation, mirroring the IPC boundaries. */
export const GENERATION_STAGE_ORDER = ['retrieve', 'generate', 'validate', 'repair', 'ready'] as const;
export type GenerationStage = (typeof GENERATION_STAGE_ORDER)[number];

/** A finished generation, as persisted in `ai_tasks`. */
export interface GenerationSample {
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface GenerationEta {
  /** Milliseconds still expected. Zero once the learned total is exceeded. */
  remainingMs: number;
  /** How far past the learned total the run already is; 0 while on schedule. */
  overrunMs: number;
  /** The baseline that produced this estimate, for the tooltip. */
  medianMs: number;
  /** Number of usable samples behind the baseline. */
  sampleCount: number;
}

/** Spans outside this window are clock skew or abandoned rows, not a baseline. */
const MIN_SAMPLE_MS = 1000;
const MAX_SAMPLE_MS = 3 * 60 * 60 * 1000;

/**
 * Median duration of the usable samples, or null when there is nothing to learn
 * from. The median is used instead of the mean so a single aborted overnight run
 * cannot inflate every later estimate.
 */
export function generationBaselineMs(samples: GenerationSample[] | null | undefined): number | null {
  const durations = (Array.isArray(samples) ? samples : [])
    .map(sample => {
      const started = Date.parse(String((sample && sample.startedAt) || ''));
      const finished = Date.parse(String((sample && sample.finishedAt) || ''));
      if (!Number.isFinite(started) || !Number.isFinite(finished)) return 0;
      const span = finished - started;
      return span >= MIN_SAMPLE_MS && span <= MAX_SAMPLE_MS ? span : 0;
    })
    .filter(span => span > 0)
    .sort((a, b) => a - b);
  if (!durations.length) return null;
  return durations[Math.floor(durations.length / 2)];
}

/** How many usable samples the baseline is built from. */
export function generationSampleCount(samples: GenerationSample[] | null | undefined): number {
  return (Array.isArray(samples) ? samples : []).filter(sample => {
    const started = Date.parse(String((sample && sample.startedAt) || ''));
    const finished = Date.parse(String((sample && sample.finishedAt) || ''));
    if (!Number.isFinite(started) || !Number.isFinite(finished)) return false;
    const span = finished - started;
    return span >= MIN_SAMPLE_MS && span <= MAX_SAMPLE_MS;
  }).length;
}

/**
 * Stage fraction reported by the progress bar.
 *
 * This is a *stage counter*, not a time estimate — the only percentage the UI is
 * allowed to claim. `ready` is always 100% so a skipped repair stage cannot leave
 * the bar stuck below done.
 */
export function generationProgressFraction(stage: string | null | undefined): number {
  if (stage === 'ready') return 1;
  const index = GENERATION_STAGE_ORDER.indexOf(stage as GenerationStage);
  if (index < 0) return 0;
  return Math.min(1, (index + 1) / GENERATION_STAGE_ORDER.length);
}

/**
 * Remaining time for the current run, or null when no baseline exists.
 *
 * Stages are assumed equally long, which is why the result is only a coarse
 * "about N minutes". Passing the learned total is reported as an overrun rather
 * than clamped, so the UI never shows a reassuring countdown that never ends.
 */
export function generationEta(
  elapsedMs: number,
  stage: string | null | undefined,
  samples: GenerationSample[] | null | undefined
): GenerationEta | null {
  const medianMs = generationBaselineMs(samples);
  if (medianMs === null) return null;

  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const fraction = generationProgressFraction(stage) || 1 / GENERATION_STAGE_ORDER.length;
  const expectedTotal = medianMs / fraction;
  const remaining = expectedTotal - elapsed;
  const sampleCount = generationSampleCount(samples);

  if (remaining <= 0) return { remainingMs: 0, overrunMs: -remaining, medianMs, sampleCount };
  return { remainingMs: remaining, overrunMs: 0, medianMs, sampleCount };
}

/** Compact Vietnamese duration: "45 giây", "3 phút", "1 phút 20 giây". */
export function formatEta(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds} giây`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // Past half an hour the seconds are noise, so they are dropped.
  if (minutes >= 30) return `${minutes} phút`;
  return seconds ? `${minutes} phút ${seconds} giây` : `${minutes} phút`;
}

/**
 * Stage order for one lesson analysis, mirroring the IPC boundaries of
 * `lesson:analyze`: cache check → model attempt → repair-if-needed → stored.
 * DECISIONS #75: step 2 shows the same three pieces of progress as step 5.
 */
export const ANALYSIS_STAGE_ORDER = ['prepare', 'generate', 'repair', 'ready'] as const;
export type AnalysisStage = (typeof ANALYSIS_STAGE_ORDER)[number];

/**
 * Stage fraction for step 2 — a *stage counter*, exactly like
 * `generationProgressFraction`. `ready` is always 100% so a skipped repair stage
 * cannot leave the bar stuck at 75%, and a cache hit (`cached`) reports 0 because
 * it is not a stage of the pipeline at all.
 */
export function analysisProgressFraction(stage: string | null | undefined): number {
  if (stage === 'ready') return 1;
  const index = ANALYSIS_STAGE_ORDER.indexOf(stage as AnalysisStage);
  if (index < 0) return 0;
  return Math.min(1, (index + 1) / ANALYSIS_STAGE_ORDER.length);
}

/**
 * Freeze a clock into a total duration: "mm:ss", or "h:mm:ss" past the hour.
 *
 * A non-positive span means the clock was never started (or was already stopped),
 * and returns an empty string so the UI can omit the total instead of printing a
 * misleading "0:00".
 */
export function formatStopwatch(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  if (totalSeconds <= 0) return '';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}:${String(seconds).padStart(2, '0')}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
