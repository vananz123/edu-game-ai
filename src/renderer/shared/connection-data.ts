// @ts-nocheck -- classic renderer script; template DATA mirror (DECISIONS #168).
/*
 * The seven Object Connection templates, as data for the renderer.
 *
 * The renderer is plain global scripts and cannot `import`
 * `src/shared/connection-templates.ts`, which stays the single source of truth
 * (data + validation + progression). This file mirrors the same table so the
 * setup gallery, the SVG renderer and the 3D layer need no build step.
 *
 * Drift is not possible by accident: `connection-templates.test.ts` compares this
 * file with the TypeScript module — same ids, same node/edge/stage structure,
 * same order — and fails the unit suite on any difference. Edit both together
 * (or, better, edit the TypeScript module and mirror it here).
 */
const CONNECTION_TEMPLATES = [
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
