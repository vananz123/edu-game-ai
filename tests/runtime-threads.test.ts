import assert from 'node:assert/strict';
import { resolveCpuThreads } from '../src/ai-core/runtime-threads';

// O11: thread count stays automatic. Measured on the i3-10105F (4C/8T) with the
// installed Qwen3.5 4B Q4_0: 8 threads did 18.2-18.4 prompt tok/s vs 14.4-15.7
// at 4 threads, and decoding tied (5.4-5.6 vs 4.9-5.6). A 4-vs-8 switch would
// therefore let teachers make the app slower, so no setting is exposed. These
// cases pin the clamp that keeps 4C/4T laptops at 4 threads instead.
assert.equal(resolveCpuThreads(8, 8), 8, '4C/8T machine uses all 8 threads');
assert.equal(resolveCpuThreads(4, 8), 4, '4C/4T laptop is clamped to its 4 logical CPUs');
assert.equal(resolveCpuThreads(16, 6), 6, 'the model recommendation caps faster machines');
assert.equal(resolveCpuThreads(2, 8), 2, 'dual core never oversubscribes');
assert.equal(resolveCpuThreads(8, 0), 1, 'broken recommendation still yields a usable count');
assert.equal(resolveCpuThreads(0, 8), 1, 'unknown CPU count still yields a usable count');
assert.equal(resolveCpuThreads(Number.NaN, Number.NaN), 1, 'garbage input is safe');
assert.equal(resolveCpuThreads(8.9, 6.9), 6, 'fractions are floored');
for (const [logical, recommended] of [[8, 8], [4, 8], [16, 6], [2, 8], [12, 12], [1, 8]]) {
  const threads = resolveCpuThreads(logical, recommended);
  assert.ok(threads >= 1 && threads <= logical, `${threads} must stay within 1..${logical}`);
}
console.log('runtime-threads.test.ts passed');
