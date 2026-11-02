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
 * BETA label (DECISIONS #170, retired in #171).
 *
 * The mode shipped as BETA while its 3D surface was evaluated in real
 * classrooms. #171 replaced that surface with the constellation board and
 * graduated the mode, so the label is now EMPTY: every surface keeps rendering
 * the same two constants and simply paints nothing. Do not delete the constants
 * (a cached build still reads them), and do not hard-code the word "BETA"
 * anywhere else — a `grep BETA src/renderer` must only find this note.
 */
const CONNECTION_BETA = false;
const CONNECTION_BETA_LABEL = CONNECTION_BETA ? 'BETA' : '';
const CONNECTION_BETA_NOTE = CONNECTION_BETA
  ? 'Tính năng đang ở giai đoạn thử nghiệm (beta): cách chơi và hình kết nối có thể còn thay đổi.'
  : '';
