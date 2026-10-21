/**
 * O11: how many CPU threads llama.cpp gets.
 *
 * Measured on an i3-10105F (4 cores / 8 threads, no GPU) with Qwen3.5 4B Q4_0,
 * 2.386-token prompt + 160-token answer, two runs with the order reversed to
 * rule out thermal bias:
 *
 *   threads | load | prompt tok/s | decode tok/s
 *   4       | 4-6 s| 14.4 - 15.7  | 4.9 - 5.6
 *   6       | 4 s  | 17.0         | 5.9
 *   8       | 3-4 s| 18.2 - 18.4  | 5.4 - 5.6
 *
 * 8 threads wins prompt processing by 15-20% and ties on decoding, so the app
 * keeps using `min(logical CPUs, model recommendation)` automatically instead
 * of exposing a 4-vs-8 switch that would mostly make machines slower. The clamp
 * is what already protects 4-core/4-thread laptops (they get 4, never 8).
 */
export function resolveCpuThreads(logicalCpuCount: number, recommendedCpuThreads: number): number {
  const logical = Number.isFinite(logicalCpuCount) && logicalCpuCount >= 1 ? Math.floor(logicalCpuCount) : 1;
  const recommended = Number.isFinite(recommendedCpuThreads) && recommendedCpuThreads >= 1 ? Math.floor(recommendedCpuThreads) : 1;
  return Math.max(1, Math.min(logical, recommended));
}
