/**
 * Tests cho phần THUẦN của setup-ipc: `resolveSetupModel` và `readSetupRequest`.
 *
 * Các test cho `registerSetupIpc` (Electron IPC handler) đã bị xóa khi chuyển
 * sang Tauri. Logic orchestration đã có coverage trong setup-orchestrator.test.ts.
 */
import assert from 'node:assert/strict';
import { QWEN_LOCAL_MODELS } from '../../src/ai-core/model-catalog';
import {
  SETUP_CHANNELS,
  readSetupRequest,
  resolveSetupModel
} from '../../src/ai-core/setup-ipc';

async function run() {
  // --- SETUP_CHANNELS: channel names are stable (renderer depends on them) ---
  assert.deepEqual({ ...SETUP_CHANNELS }, {
    status: 'setup:status',
    preflight: 'setup:preflight',
    start: 'setup:start',
    cancel: 'setup:cancel',
    progress: 'setup:progress'
  }, 'channel names must not change without updating the renderer');

  // --- Model id validation (§5: never substitute a model) ------------------
  assert.equal(resolveSetupModel('qwen3.5-4b-q4_k_m').id, 'qwen3.5-4b-q4_k_m');
  assert.throws(() => resolveSetupModel(''), /Thiếu mã mô hình/);
  assert.throws(() => resolveSetupModel('   '), /Thiếu mã mô hình/);
  assert.throws(() => resolveSetupModel(undefined), /Thiếu mã mô hình/);
  assert.throws(() => resolveSetupModel(42), /Thiếu mã mô hình/);
  assert.throws(() => resolveSetupModel('gpt-4'), /không nằm trong danh mục đã xác minh/,
    'an unknown model must be refused, not silently replaced');
  assert.throws(() => resolveSetupModel('../evil'), /không nằm trong danh mục đã xác minh/);

  // Every catalog id is resolvable, so the wizard cannot offer a dead option.
  for (const model of QWEN_LOCAL_MODELS) {
    assert.equal(resolveSetupModel(model.id).id, model.id);
  }
  // The removed Qwen2.5 7B id must be refused by name, not mapped to something
  // else: a stale settings file or script would otherwise install a model the
  // teacher never asked for.
  assert.throws(() => resolveSetupModel('qwen2.5-7b-q4_k_m'), /không nằm trong danh mục đã xác minh/);
  // Gemma 4 E2B is installable on request (manual choice), just never automatic.
  assert.equal(resolveSetupModel('gemma-4-e2b-it-q4_k_m').id, 'gemma-4-e2b-it-q4_k_m');

  // --- Payload hardening (§8: no paths, no URLs from the renderer) --------
  assert.deepEqual(readSetupRequest(undefined), {});
  assert.deepEqual(readSetupRequest(null), {});
  assert.deepEqual(readSetupRequest({ modelId: 'qwen3.5-2b-q4_k_m' }), { modelId: 'qwen3.5-2b-q4_k_m' });
  // Extra keys are dropped, so a renderer cannot smuggle a directory, URL or
  // backend choice into the setup run.
  assert.deepEqual(
    readSetupRequest({
      modelId: 'qwen3.5-2b-q4_k_m',
      modelDirectory: 'C:\\Windows\\System32',
      downloadUrl: 'https://evil.invalid/x.zip',
      backend: 'openvino',
      runtimeBackend: 'vulkan'
    }),
    { modelId: 'qwen3.5-2b-q4_k_m' }
  );
  assert.throws(() => readSetupRequest(['a']), /không hợp lệ/);
  assert.throws(() => readSetupRequest('model'), /không hợp lệ/);

  console.log('setup-ipc.test.ts: all assertions passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
