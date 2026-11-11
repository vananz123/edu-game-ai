/**
 * Setup wizard channel names and pure payload/model validation helpers.
 *
 * Tauri implements the desktop commands in `src-tauri/src/setup.rs`; these
 * helpers remain for shared TypeScript behavior and regression tests.
 *
 * The stable channel names are checked by `tests/unit/setup-wiring.test.ts`.
 */

import { QWEN_LOCAL_MODELS } from './model-catalog';

/** Renderer channels for the setup wizard. */
export const SETUP_CHANNELS = Object.freeze({
  status: 'setup:status',
  preflight: 'setup:preflight',
  start: 'setup:start',
  cancel: 'setup:cancel',
  progress: 'setup:progress',
});

/**
 * Parse payload từ renderer. Chỉ giữ `modelId` — mọi trường khác bị drop để
 * renderer không thể smuggle path, URL, hay backend vào setup run.
 */
export function readSetupRequest(payload: unknown): { modelId?: string } {
  if (payload === undefined || payload === null) return {};
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Payload không hợp lệ: phải là object hoặc null/undefined');
  }
  const p = payload as Record<string, unknown>;
  const result: { modelId?: string } = {};
  if (typeof p.modelId === 'string') result.modelId = p.modelId;
  return result;
}

/**
 * Resolve model id từ catalog. Throw nếu id rỗng hoặc không trong catalog.
 * Bảo đảm wizard không install model ngoài danh mục đã kiểm.
 */
export function resolveSetupModel(modelId: unknown) {
  if (typeof modelId !== 'string' || !modelId.trim()) {
    throw new Error('Thiếu mã mô hình');
  }
  const model = QWEN_LOCAL_MODELS.find(m => m.id === modelId);
  if (!model) {
    throw new Error(`Mô hình "${modelId}" không nằm trong danh mục đã xác minh`);
  }
  return model;
}
