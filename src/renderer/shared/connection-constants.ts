// @ts-nocheck -- classic renderer script; constants only, no DOM (DECISIONS #168).
/*
 * Object Connection constants for the renderer.
 *
 * The renderer is plain global scripts and cannot `import` a TypeScript module,
 * so the values the play surface needs live here. They are MIRRORS of
 * `src/shared/connection-templates.ts`, which stays the single source of truth
 * for the data, the validation and the progression; `connection-templates.test.ts`
 * asserts that this file lists exactly the same ids in the same order, so the
 * two cannot drift silently.
 */
const CONNECTION_VIEWBOX = { width: 1000, height: 620 };
const CONNECTION_TEMPLATE_IDS = [
  'knowledge-network',
  'bridge',
  'solar-system',
  'circuit',
  'ecosystem',
  'timeline',
  'geometry'
];
const DEFAULT_CONNECTION_TEMPLATE = 'knowledge-network';

/*
 * Object Connection ships as BETA (DECISIONS #170).
 *
 * The mode works and is tested, but its 3D surface is still being evaluated in
 * real classrooms, so a teacher must be told before committing a lesson to it.
 * These live HERE, in the script that loads first, because every surface reads
 * them — the library card (`shared.js`, line ~105), the wizard and the editor.
 * Graduating the feature means changing this flag and the literal labels; nothing
 * else should hard-code the word "BETA".
 */
const CONNECTION_BETA = true;
const CONNECTION_BETA_LABEL = CONNECTION_BETA ? 'BETA' : '';
const CONNECTION_BETA_NOTE = CONNECTION_BETA
  ? 'Tính năng đang ở giai đoạn thử nghiệm (beta): cách chơi và hình kết nối có thể còn thay đổi.'
  : '';
