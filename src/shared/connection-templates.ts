/*
 * Object Connection templates (DECISIONS #168) — pure data, no DOM, no Three.js.
 *
 * A template is a small picture that gets assembled from parts. Each template
 * declares NODES (points in a fixed `viewBox`), EDGES (a link between two nodes)
 * and STAGES (an ordered list of edges + nodes that appear together). One stage
 * is one "connection" the player earns with one correct answer.
 *
 * The template decides HOW the picture looks; `connection-progress.ts` decides
 * WHICH stage a question earns. Keeping the two apart is deliberate: adding a
 * template must be a data-only change, and the progression rules must be
 * testable without any template at all.
 *
 * Coordinates are in the `viewBox` below (1000 x 620). Renderers scale the box
 * to whatever space they get, and the 3D renderer places nodes by fraction
 * (`x / VIEWBOX.width`, `y / VIEWBOX.height`) so a template looks the same in
 * the compact preview and on a 16:9 projector.
 *
 * Everything here is optional-with-fallback at the edges: an unknown template id
 * resolves to `DEFAULT_CONNECTION_TEMPLATE`, never to an error, so a game saved
 * by a newer build still opens (same rule as `asset-validation.ts`).
 */

/** Every template is drawn in this coordinate space; renderers scale it. */
export const CONNECTION_VIEWBOX = { width: 1000, height: 620 } as const;

/** The number of stages a template is designed around. */
export const CONNECTION_STAGE_MIN = 2;
export const CONNECTION_STAGE_MAX = 8;

export interface ConnectionNode {
  id: string;
  /** `viewBox` coordinates (top-left origin). */
  x: number;
  y: number;
  /** Short caption drawn beside the node (never the question text). */
  label: string;
  /** Presentation hint: a ring, a filled dot or a plate with a caption. */
  kind: 'dot' | 'ring' | 'plate';
}

export interface ConnectionEdge {
  id: string;
  /** Node ids; both must exist in the same template. */
  from: string;
  to: string;
  /** Optional gentle curve so overlapping links stay readable. `0` = straight. */
  bend?: number;
}

export interface ConnectionStage {
  id: string;
  /** Vietnamese caption for the connection counter ("Nhịp 1", "Quỹ đạo 2"…). */
  label: string;
  /** Edges that appear when this stage is earned. */
  edgeIds: string[];
  /** Nodes that are hidden until this stage is earned. */
  nodeIds: string[];
}

export interface ConnectionTemplate {
  id: string;
  name: string;
  description: string;
  /** Where this picture fits best, shown in the gallery. Empty when universal. */
  subjectHint: string;
  nodes: ConnectionNode[];
  edges: ConnectionEdge[];
  stages: ConnectionStage[];
}

/**
 * Seven visually distinct pictures for secondary school. They differ in shape,
 * direction and reading order on purpose — "a different picture", not "the same
 * object recoloured" (update_game.txt §3).
 */
export const CONNECTION_TEMPLATES: readonly ConnectionTemplate[] = [
  {
    id: 'knowledge-network',
    name: 'Mạng lưới tri thức',
    description: 'Các ý chính nối dần thành một sơ đồ tư duy hoàn chỉnh quanh chủ đề trung tâm.',
    subjectHint: 'Mọi môn · sơ đồ tư duy, tổng kết chương',
    nodes: [
      { id: 'core', x: 500, y: 310, label: 'Chủ đề', kind: 'plate' },
      { id: 'n1', x: 500, y: 90, label: 'Ý 1', kind: 'dot' },
      { id: 'n2', x: 800, y: 210, label: 'Ý 2', kind: 'dot' },
      { id: 'n3', x: 800, y: 420, label: 'Ý 3', kind: 'dot' },
      { id: 'n4', x: 500, y: 540, label: 'Ý 4', kind: 'dot' },
      { id: 'n5', x: 200, y: 420, label: 'Ý 5', kind: 'dot' },
      { id: 'n6', x: 200, y: 210, label: 'Ý 6', kind: 'dot' }
    ],
    edges: [
      { id: 'e1', from: 'core', to: 'n1' },
      { id: 'e2', from: 'core', to: 'n2' },
      { id: 'e3', from: 'core', to: 'n3' },
      { id: 'e4', from: 'core', to: 'n4' },
      { id: 'e5', from: 'core', to: 'n5' },
      { id: 'e6', from: 'core', to: 'n6' }
    ],
    stages: [
      { id: 'net-1', label: 'Nhánh 1', edgeIds: ['e1'], nodeIds: ['n1'] },
      { id: 'net-2', label: 'Nhánh 2', edgeIds: ['e2'], nodeIds: ['n2'] },
      { id: 'net-3', label: 'Nhánh 3', edgeIds: ['e3'], nodeIds: ['n3'] },
      { id: 'net-4', label: 'Nhánh 4', edgeIds: ['e4'], nodeIds: ['n4'] },
      { id: 'net-5', label: 'Nhánh 5', edgeIds: ['e5'], nodeIds: ['n5'] },
      { id: 'net-6', label: 'Nhánh 6', edgeIds: ['e6'], nodeIds: ['n6'] }
    ]
  },
  {
    id: 'bridge',
    name: 'Xây cầu',
    description: 'Hai mố cầu có sẵn; mỗi câu đúng nối thêm một nhịp cho tới khi cầu bắc qua sông.',
    subjectHint: 'Vật lý · Kỹ thuật · Công nghệ',
    nodes: [
      { id: 'left', x: 120, y: 400, label: 'Mố trái', kind: 'plate' },
      { id: 'p1', x: 300, y: 400, label: 'Nhịp 1', kind: 'dot' },
      { id: 'p2', x: 480, y: 400, label: 'Nhịp 2', kind: 'dot' },
      { id: 'p3', x: 660, y: 400, label: 'Nhịp 3', kind: 'dot' },
      { id: 'right', x: 860, y: 400, label: 'Mố phải', kind: 'plate' }
    ],
    edges: [
      { id: 'e1', from: 'left', to: 'p1' },
      { id: 'e2', from: 'p1', to: 'p2' },
      { id: 'e3', from: 'p2', to: 'p3' },
      { id: 'e4', from: 'p3', to: 'right' }
    ],
    stages: [
      { id: 'bridge-1', label: 'Nhịp 1', edgeIds: ['e1'], nodeIds: ['p1'] },
      { id: 'bridge-2', label: 'Nhịp 2', edgeIds: ['e2'], nodeIds: ['p2'] },
      { id: 'bridge-3', label: 'Nhịp 3', edgeIds: ['e3'], nodeIds: ['p3'] },
      { id: 'bridge-4', label: 'Nhịp cuối', edgeIds: ['e4'], nodeIds: [] }
    ]
  },
  {
    id: 'solar-system',
    name: 'Hệ Mặt Trời',
    description: 'Mặt Trời ở giữa; các thiên thể từng bước vào đúng quỹ đạo của mình.',
    subjectHint: 'Vật lý · Địa lý · Khoa học tự nhiên',
    nodes: [
      { id: 'sun', x: 500, y: 310, label: 'Mặt Trời', kind: 'plate' },
      { id: 'm1', x: 660, y: 310, label: 'Hành tinh 1', kind: 'dot' },
      { id: 'm2', x: 320, y: 310, label: 'Hành tinh 2', kind: 'dot' },
      { id: 'm3', x: 500, y: 110, label: 'Hành tinh 3', kind: 'dot' },
      { id: 'm4', x: 500, y: 510, label: 'Hành tinh 4', kind: 'dot' },
      { id: 'm5', x: 760, y: 180, label: 'Hành tinh 5', kind: 'dot' }
    ],
    edges: [
      { id: 'e1', from: 'sun', to: 'm1', bend: -70 },
      { id: 'e2', from: 'sun', to: 'm2', bend: 70 },
      { id: 'e3', from: 'sun', to: 'm3', bend: 70 },
      { id: 'e4', from: 'sun', to: 'm4', bend: -70 },
      { id: 'e5', from: 'sun', to: 'm5', bend: -110 }
    ],
    stages: [
      { id: 'space-1', label: 'Quỹ đạo 1', edgeIds: ['e1'], nodeIds: ['m1'] },
      { id: 'space-2', label: 'Quỹ đạo 2', edgeIds: ['e2'], nodeIds: ['m2'] },
      { id: 'space-3', label: 'Quỹ đạo 3', edgeIds: ['e3'], nodeIds: ['m3'] },
      { id: 'space-4', label: 'Quỹ đạo 4', edgeIds: ['e4'], nodeIds: ['m4'] },
      { id: 'space-5', label: 'Quỹ đạo 5', edgeIds: ['e5'], nodeIds: ['m5'] }
    ]
  },
  {
    id: 'circuit',
    name: 'Mạch điện',
    description: 'Một mạch điện hở; mỗi câu đúng nối thêm một đoạn cho tới khi bóng đèn sáng.',
    subjectHint: 'Vật lý · Công nghệ · Tin học',
    nodes: [
      { id: 'battery', x: 200, y: 470, label: 'Nguồn', kind: 'plate' },
      { id: 'c1', x: 200, y: 300, label: 'Dây', kind: 'dot' },
      { id: 'switch', x: 400, y: 160, label: 'Công tắc', kind: 'plate' },
      { id: 'lamp', x: 640, y: 160, label: 'Đèn', kind: 'ring' },
      { id: 'c2', x: 830, y: 300, label: 'Dây', kind: 'dot' },
      { id: 'c3', x: 830, y: 470, label: 'Dây', kind: 'dot' }
    ],
    edges: [
      { id: 'e1', from: 'battery', to: 'c1' },
      { id: 'e2', from: 'c1', to: 'switch' },
      { id: 'e3', from: 'switch', to: 'lamp' },
      { id: 'e4', from: 'lamp', to: 'c2' },
      { id: 'e5', from: 'c2', to: 'c3' }
    ],
    stages: [
      { id: 'circuit-1', label: 'Đoạn 1', edgeIds: ['e1'], nodeIds: ['c1'] },
      { id: 'circuit-2', label: 'Đoạn 2', edgeIds: ['e2'], nodeIds: ['switch'] },
      { id: 'circuit-3', label: 'Đoạn 3', edgeIds: ['e3'], nodeIds: ['lamp'] },
      { id: 'circuit-4', label: 'Đoạn 4', edgeIds: ['e4'], nodeIds: ['c2'] },
      { id: 'circuit-5', label: 'Đoạn 5', edgeIds: ['e5'], nodeIds: ['c3'] }
    ]
  },
  {
    id: 'ecosystem',
    name: 'Chuỗi hệ sinh thái',
    description: 'Các loài và yếu tố môi trường nối dần thành một lưới thức ăn cân bằng.',
    subjectHint: 'Sinh học · Giáo dục môi trường',
    nodes: [
      { id: 'sun', x: 120, y: 130, label: 'Ánh sáng', kind: 'dot' },
      { id: 'grass', x: 320, y: 330, label: 'Cỏ', kind: 'plate' },
      { id: 'rabbit', x: 560, y: 190, label: 'Thỏ', kind: 'dot' },
      { id: 'snake', x: 780, y: 330, label: 'Rắn', kind: 'dot' },
      { id: 'eagle', x: 640, y: 510, label: 'Đại bàng', kind: 'dot' },
      { id: 'soil', x: 330, y: 520, label: 'Đất', kind: 'plate' }
    ],
    edges: [
      { id: 'e1', from: 'sun', to: 'grass' },
      { id: 'e2', from: 'grass', to: 'rabbit' },
      { id: 'e3', from: 'rabbit', to: 'snake' },
      { id: 'e4', from: 'snake', to: 'eagle' },
      { id: 'e5', from: 'rabbit', to: 'eagle', bend: 60 },
      { id: 'e6', from: 'soil', to: 'grass' }
    ],
    stages: [
      { id: 'eco-1', label: 'Năng lượng', edgeIds: ['e1'], nodeIds: ['sun'] },
      { id: 'eco-2', label: 'Sinh vật sản xuất', edgeIds: ['e2'], nodeIds: ['rabbit'] },
      { id: 'eco-3', label: 'Sinh vật tiêu thụ', edgeIds: ['e3'], nodeIds: ['snake'] },
      { id: 'eco-4', label: 'Đỉnh chuỗi', edgeIds: ['e4'], nodeIds: ['eagle'] },
      { id: 'eco-5', label: 'Nhánh phụ', edgeIds: ['e5'], nodeIds: [] },
      { id: 'eco-6', label: 'Vòng tuần hoàn', edgeIds: ['e6'], nodeIds: [] }
    ]
  },
  {
    id: 'timeline',
    name: 'Dòng thời gian',
    description: 'Một trục thời gian trống; các mốc sự kiện nối dần từ trái sang phải.',
    subjectHint: 'Lịch sử · Ngữ văn · Khoa học',
    nodes: [
      { id: 'start', x: 110, y: 310, label: 'Khởi đầu', kind: 'plate' },
      { id: 't1', x: 290, y: 190, label: 'Mốc 1', kind: 'ring' },
      { id: 't2', x: 470, y: 430, label: 'Mốc 2', kind: 'ring' },
      { id: 't3', x: 650, y: 190, label: 'Mốc 3', kind: 'ring' },
      { id: 't4', x: 840, y: 430, label: 'Mốc 4', kind: 'ring' },
      { id: 'end', x: 930, y: 310, label: 'Kết thúc', kind: 'plate' }
    ],
    edges: [
      { id: 'axis', from: 'start', to: 'end' },
      { id: 'e1', from: 'start', to: 't1' },
      { id: 'e2', from: 't1', to: 't2' },
      { id: 'e3', from: 't2', to: 't3' },
      { id: 'e4', from: 't3', to: 't4' },
      { id: 'e5', from: 't4', to: 'end' }
    ],
    stages: [
      { id: 'time-1', label: 'Mốc 1', edgeIds: ['axis', 'e1'], nodeIds: ['t1'] },
      { id: 'time-2', label: 'Mốc 2', edgeIds: ['e2'], nodeIds: ['t2'] },
      { id: 'time-3', label: 'Mốc 3', edgeIds: ['e3'], nodeIds: ['t3'] },
      { id: 'time-4', label: 'Mốc 4', edgeIds: ['e4'], nodeIds: ['t4'] },
      { id: 'time-5', label: 'Khép trục', edgeIds: ['e5'], nodeIds: ['end'] }
    ]
  },
  {
    id: 'geometry',
    name: 'Hình học ghép',
    description: 'Bốn mảnh rời ghép lại thành một hình tam giác hoàn chỉnh.',
    subjectHint: 'Toán · Hình học',
    nodes: [
      { id: 'apex', x: 500, y: 110, label: 'Đỉnh', kind: 'dot' },
      { id: 'left', x: 210, y: 500, label: 'Đáy trái', kind: 'dot' },
      { id: 'mid', x: 500, y: 500, label: 'Đáy giữa', kind: 'dot' },
      { id: 'right', x: 790, y: 500, label: 'Đáy phải', kind: 'dot' },
      { id: 'inner', x: 500, y: 360, label: 'Tâm', kind: 'ring' }
    ],
    edges: [
      { id: 'e1', from: 'apex', to: 'left' },
      { id: 'e2', from: 'apex', to: 'right' },
      { id: 'e3', from: 'left', to: 'mid' },
      { id: 'e4', from: 'mid', to: 'right' }
    ],
    stages: [
      { id: 'geo-1', label: 'Cạnh trái', edgeIds: ['e1'], nodeIds: ['left'] },
      { id: 'geo-2', label: 'Cạnh phải', edgeIds: ['e2'], nodeIds: ['right'] },
      { id: 'geo-3', label: 'Đáy trái', edgeIds: ['e3'], nodeIds: ['mid'] },
      { id: 'geo-4', label: 'Đáy phải', edgeIds: ['e4'], nodeIds: ['inner'] }
    ]
  }
];

export const CONNECTION_TEMPLATE_IDS = CONNECTION_TEMPLATES.map(template => template.id);

/** Used whenever an id is missing or unknown. Never an error. */
export const DEFAULT_CONNECTION_TEMPLATE: string = CONNECTION_TEMPLATES[0].id;

/**
 * Resolve a saved template id. An explicit known id wins; anything else
 * (`null`, absent, a template this build does not ship) falls back to the
 * default, so an older `.egame` and a newer one both play.
 */
export function connectionTemplate(id: unknown): ConnectionTemplate {
  const key = typeof id === 'string' ? id.trim() : '';
  const found = CONNECTION_TEMPLATES.find(template => template.id === key);
  return found || CONNECTION_TEMPLATES[0];
}

/** True only for an id this build ships (an absent id is NOT the default here). */
export function isConnectionTemplateId(id: unknown): boolean {
  return typeof id === 'string' && CONNECTION_TEMPLATE_IDS.indexOf(id) !== -1;
}

/**
 * Structural check used by the unit test and by any caller that accepts template
 * data from outside. Returns a list of problems ("node x is out of the viewBox"),
 * empty when the template is usable. Never throws — the renderer must cope with
 * whatever it is handed.
 */
export function validateConnectionTemplate(template: any): string[] {
  const problems: string[] = [];
  const fail = (message: string) => problems.push(message);
  if (!template || typeof template !== 'object') {
    fail('template is not an object');
    return problems;
  }
  if (typeof template.id !== 'string' || !template.id) fail('missing id');
  if (typeof template.name !== 'string' || !template.name) fail('missing name');
  if (typeof template.description !== 'string') fail('missing description');
  if (typeof template.subjectHint !== 'string') fail('missing subjectHint');

  const nodes = Array.isArray(template.nodes) ? template.nodes : [];
  const edges = Array.isArray(template.edges) ? template.edges : [];
  const stages = Array.isArray(template.stages) ? template.stages : [];
  if (!nodes.length) fail('no nodes');
  if (!edges.length) fail('no edges');
  if (!stages.length) fail('no stages');

  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || !node.id) { fail('node without id'); continue; }
    if (nodeIds.has(node.id)) fail(`duplicate node id ${node.id}`);
    nodeIds.add(node.id);
    if (!isInsideViewbox(node)) fail(`node ${node.id} is outside the viewBox`);
    if (node.kind !== 'dot' && node.kind !== 'ring' && node.kind !== 'plate') fail(`node ${node.id} has an unknown kind`);
  }

  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (!edge || typeof edge.id !== 'string' || !edge.id) { fail('edge without id'); continue; }
    if (edgeIds.has(edge.id)) fail(`duplicate edge id ${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from)) fail(`edge ${edge.id} starts at an unknown node`);
    if (!nodeIds.has(edge.to)) fail(`edge ${edge.id} ends at an unknown node`);
    if (edge.from === edge.to) fail(`edge ${edge.id} connects a node to itself`);
  }

  if (stages.length < CONNECTION_STAGE_MIN || stages.length > CONNECTION_STAGE_MAX) {
    fail(`stage count ${stages.length} is outside ${CONNECTION_STAGE_MIN}..${CONNECTION_STAGE_MAX}`);
  }
  const stageIds = new Set<string>();
  const claimedEdges = new Set<string>();
  for (const stage of stages) {
    if (!stage || typeof stage.id !== 'string' || !stage.id) { fail('stage without id'); continue; }
    if (stageIds.has(stage.id)) fail(`duplicate stage id ${stage.id}`);
    stageIds.add(stage.id);
    if (typeof stage.label !== 'string' || !stage.label) fail(`stage ${stage.id} has no label`);
    if (!Array.isArray(stage.edgeIds) || !Array.isArray(stage.nodeIds)) { fail(`stage ${stage.id} has no edge/node list`); continue; }
    for (const id of stage.edgeIds) {
      if (!edgeIds.has(id)) fail(`stage ${stage.id} uses unknown edge ${id}`);
      if (claimedEdges.has(id)) fail(`edge ${id} is claimed by two stages`);
      claimedEdges.add(id);
    }
    for (const id of stage.nodeIds) {
      if (!nodeIds.has(id)) fail(`stage ${stage.id} uses unknown node ${id}`);
    }
    if (!stage.edgeIds.length && !stage.nodeIds.length) fail(`stage ${stage.id} is empty`);
  }
  return problems;
}

function isInsideViewbox(node: any): boolean {
  return Boolean(node)
    && typeof node.x === 'number' && Number.isFinite(node.x) && node.x >= 0 && node.x <= CONNECTION_VIEWBOX.width
    && typeof node.y === 'number' && Number.isFinite(node.y) && node.y >= 0 && node.y <= CONNECTION_VIEWBOX.height;
}

/** Fraction of the viewBox for a node, for renderers that place by percentage. */
export function connectionNodeFraction(node: ConnectionNode): { fx: number; fy: number } {
  return {
    fx: Math.min(1, Math.max(0, node.x / CONNECTION_VIEWBOX.width)),
    fy: Math.min(1, Math.max(0, node.y / CONNECTION_VIEWBOX.height))
  };
}
