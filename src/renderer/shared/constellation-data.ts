// @ts-nocheck -- classic renderer script; constellation DATA mirror (DECISIONS #171).
/*
 * The seven constellations, as data for the renderer.
 *
 * The renderer is plain global scripts and cannot `import`
 * `src/shared/constellation-templates.ts`, which stays the single source of truth
 * (data + selection + validation). This file mirrors the same table so the setup
 * gallery, the SVG fallback and the 3D layer need no build step.
 *
 * Drift is not possible by accident: `constellation-parity.test.ts` compares this
 * file with the TypeScript module — same ids, same stars, same links, same
 * priority order — and fails the unit suite on any difference. Edit both together
 * (or, better, edit the TypeScript module and mirror it here).
 */
const CONSTELLATION_TEMPLATES = [
  {
    id: "ursa-major",
    name: "Đại Hùng",
    description: "Chòm Gấu Lớn: bốn sao của chiếc gáo nối với ba sao cán gáo, chỉ dần tới Bắc Cực.",
    subjectHint: "Thiên văn · Địa lý · Định hướng",
    sky: "Bắc bán cầu · hiển thị cả năm",
    stars: [
      { id: "dubhe", x: 60, y: 300, label: "Bắc Đẩu", priority: 1, brightness: 1 },
      { id: "merak", x: 60, y: 470, label: "Thiên Tuyền", priority: 2, brightness: 0.95 },
      { id: "phecda", x: 500, y: 470, label: "Thiên Cơ", priority: 3, brightness: 0.9 },
      { id: "megrez", x: 500, y: 300, label: "Thiên Quyền", priority: 4, brightness: 0.8 },
      { id: "alioth", x: 960, y: 300, label: "Ngọc Hành", priority: 5, brightness: 0.95 },
      { id: "mizar", x: 960, y: 470, label: "Khai Dương", priority: 6, brightness: 0.9 },
      { id: "alkaid", x: 960, y: 140, label: "Dao Quang", priority: 7, brightness: 0.85 },
      { id: "talitha", x: 500, y: 140, label: "Thượng Phụ", priority: 8, brightness: 0.55 },
      { id: "alula", x: 300, y: 40, label: "Hạ Phụ", priority: 9, brightness: 0.5 },
      { id: "muscida", x: 760, y: 40, label: "", priority: 10, brightness: 0.35 }
    ],
    edges: [
      { id: "bowl-1", from: "dubhe", to: "merak" },
      { id: "bowl-2", from: "merak", to: "phecda" },
      { id: "bowl-3", from: "phecda", to: "megrez" },
      { id: "bowl-4", from: "megrez", to: "dubhe" },
      { id: "handle-1", from: "megrez", to: "alioth" },
      { id: "handle-2", from: "alioth", to: "mizar" },
      { id: "handle-3", from: "mizar", to: "alkaid" },
      { id: "paw-1", from: "megrez", to: "talitha" },
      { id: "paw-2", from: "alioth", to: "alula" },
      { id: "paw-3", from: "alula", to: "muscida" }
    ],
    priority: ["dubhe", "merak", "phecda", "megrez", "alioth", "mizar", "alkaid", "talitha", "alula", "muscida"]
  },
  {
    id: "orion",
    name: "Orion",
    description: "Thợ Săn: ba sao thắt lưng thẳng hàng, hai vai và hai chân tạo thành chữ H quen thuộc.",
    subjectHint: "Thiên văn · Ngữ văn (thần thoại)",
    sky: "Xích đạo · rõ nhất về đêm mùa đông",
    stars: [
      { id: "alnitak", x: 500, y: 250, label: "Thắt lưng Đông", priority: 1, brightness: 0.9 },
      { id: "alnilam", x: 200, y: 340, label: "Thắt lưng Giữa", priority: 2, brightness: 1 },
      { id: "mintaka", x: 800, y: 340, label: "Thắt lưng Tây", priority: 3, brightness: 0.9 },
      { id: "betelgeuse", x: 120, y: 120, label: "Vai Đông", priority: 4, brightness: 1 },
      { id: "bellatrix", x: 880, y: 120, label: "Vai Tây", priority: 5, brightness: 0.85 },
      { id: "saiph", x: 150, y: 560, label: "Chân Đông", priority: 6, brightness: 0.8 },
      { id: "rigel", x: 860, y: 560, label: "Chân Tây", priority: 7, brightness: 1 },
      { id: "meissa", x: 500, y: 24, label: "Đầu", priority: 8, brightness: 0.6 },
      { id: "thabit", x: 500, y: 430, label: "", priority: 9, brightness: 0.4 },
      { id: "tabit", x: 900, y: 480, label: "", priority: 10, brightness: 0.35 }
    ],
    edges: [
      { id: "belt-1", from: "alnitak", to: "alnilam" },
      { id: "belt-2", from: "alnilam", to: "mintaka" },
      { id: "shoulder-1", from: "betelgeuse", to: "alnitak" },
      { id: "shoulder-2", from: "bellatrix", to: "mintaka" },
      { id: "body-1", from: "betelgeuse", to: "saiph" },
      { id: "body-2", from: "bellatrix", to: "rigel" },
      { id: "head", from: "betelgeuse", to: "meissa" },
      { id: "arm-1", from: "mintaka", to: "thabit" },
      { id: "arm-2", from: "saiph", to: "tabit" }
    ],
    priority: ["alnilam", "alnitak", "mintaka", "betelgeuse", "bellatrix", "saiph", "rigel", "meissa", "thabit", "tabit"]
  },
  {
    id: "cygnus",
    name: "Thiên Nga",
    description: "Con thiên nga bay dọc Ngân Hà: chữ thập dài từ đầu tới đuôi, đôi cánh xoè ngang.",
    subjectHint: "Thiên văn · Địa lý",
    sky: "Bắc bán cầu · mùa hạ và mùa thu",
    stars: [
      { id: "sadr", x: 500, y: 320, label: "Tâm Sao", priority: 1, brightness: 1 },
      { id: "deneb", x: 500, y: 100, label: "Sao Thiên Tân", priority: 2, brightness: 1 },
      { id: "albireo", x: 500, y: 580, label: "Mỏ Sao", priority: 3, brightness: 0.75 },
      { id: "gienah", x: 60, y: 300, label: "Cánh Tây", priority: 4, brightness: 0.85 },
      { id: "delta", x: 940, y: 300, label: "Cánh Đông", priority: 5, brightness: 0.9 },
      { id: "iota", x: 940, y: 460, label: "", priority: 6, brightness: 0.45 },
      { id: "kappa", x: 60, y: 460, label: "", priority: 7, brightness: 0.45 },
      { id: "zeta", x: 500, y: 20, label: "", priority: 8, brightness: 0.4 },
      { id: "eta", x: 500, y: 220, label: "", priority: 9, brightness: 0.4 },
      { id: "xi", x: 500, y: 460, label: "", priority: 10, brightness: 0.35 }
    ],
    edges: [
      { id: "spine-1", from: "deneb", to: "sadr" },
      { id: "spine-2", from: "sadr", to: "albireo" },
      { id: "wing-1", from: "sadr", to: "gienah" },
      { id: "wing-2", from: "sadr", to: "delta" },
      { id: "feather-1", from: "gienah", to: "kappa" },
      { id: "feather-2", from: "delta", to: "iota" },
      { id: "neck-1", from: "deneb", to: "zeta" },
      { id: "neck-2", from: "deneb", to: "eta" },
      { id: "tail", from: "albireo", to: "xi" }
    ],
    priority: ["sadr", "deneb", "albireo", "gienah", "delta", "iota", "kappa", "zeta", "eta", "xi"]
  },
  {
    id: "lyra",
    name: "Thiên Cầm",
    description: "Cây đàn Lyre của Orpheus: một hình bình hành nhỏ và ngôi sao sáng Chức Nữ bắc lên trên.",
    subjectHint: "Thiên văn · Ngữ văn (thần thoại) · Âm nhạc",
    sky: "Bắc bán cầu · mùa hạ",
    stars: [
      { id: "vega", x: 500, y: 20, label: "Chức Nữ", priority: 1, brightness: 1 },
      { id: "sheliak", x: 60, y: 300, label: "Lyre Tây", priority: 2, brightness: 0.7 },
      { id: "sulafat", x: 940, y: 300, label: "Lyre Đông", priority: 3, brightness: 0.75 },
      { id: "delta2", x: 60, y: 470, label: "", priority: 4, brightness: 0.5 },
      { id: "zeta1", x: 940, y: 470, label: "", priority: 5, brightness: 0.5 },
      { id: "aladfar", x: 60, y: 60, label: "", priority: 6, brightness: 0.4 },
      { id: "eta", x: 940, y: 60, label: "", priority: 7, brightness: 0.4 },
      { id: "epsilon", x: 940, y: 180, label: "", priority: 8, brightness: 0.35 },
      { id: "theta", x: 60, y: 180, label: "", priority: 9, brightness: 0.35 },
      { id: "kappa", x: 500, y: 470, label: "", priority: 10, brightness: 0.3 }
    ],
    edges: [
      { id: "frame-1", from: "vega", to: "sheliak" },
      { id: "frame-2", from: "vega", to: "sulafat" },
      { id: "base-1", from: "sheliak", to: "delta2" },
      { id: "base-2", from: "sulafat", to: "zeta1" },
      { id: "base-3", from: "delta2", to: "zeta1" },
      { id: "string-1", from: "sheliak", to: "aladfar" },
      { id: "string-2", from: "sulafat", to: "eta" },
      { id: "arm-1", from: "aladfar", to: "theta" },
      { id: "arm-2", from: "eta", to: "epsilon" },
      { id: "base-4", from: "delta2", to: "kappa" }
    ],
    priority: ["vega", "sulafat", "sheliak", "delta2", "zeta1", "aladfar", "eta", "epsilon", "theta", "kappa"]
  },
  {
    id: "taurus",
    name: "Kim Ngưu",
    description: "Con bò: đầu hình chữ V với mắt Aldebaran đỏ, hai sừng vươn dài lên trời.",
    subjectHint: "Thiên văn · Sinh học (chòm sao hoàng đạo)",
    sky: "Xích đạo · đêm mùa đông",
    stars: [
      { id: "aldebaran", x: 460, y: 340, label: "Chủ Tinh", priority: 1, brightness: 1 },
      { id: "ain", x: 20, y: 180, label: "Mắt Tây", priority: 2, brightness: 0.7 },
      { id: "elnath", x: 960, y: 200, label: "Sừng Bắc", priority: 3, brightness: 0.8 },
      { id: "prima", x: 460, y: 120, label: "Sừng Giữa", priority: 4, brightness: 0.65 },
      { id: "theta", x: 960, y: 400, label: "", priority: 5, brightness: 0.55 },
      { id: "gamma", x: 540, y: 600, label: "Sừng Đông", priority: 6, brightness: 0.75 },
      { id: "lambda", x: 960, y: 580, label: "", priority: 7, brightness: 0.45 },
      { id: "sigma1", x: 20, y: 340, label: "", priority: 8, brightness: 0.4 },
      { id: "rho", x: 300, y: 500, label: "", priority: 9, brightness: 0.35 },
      { id: "omega", x: 660, y: 40, label: "", priority: 10, brightness: 0.3 }
    ],
    edges: [
      { id: "face-1", from: "aldebaran", to: "ain" },
      { id: "face-2", from: "ain", to: "prima" },
      { id: "horn-1", from: "prima", to: "elnath" },
      { id: "horn-2", from: "elnath", to: "gamma" },
      { id: "horn-3", from: "gamma", to: "omega" },
      { id: "jaw-1", from: "aldebaran", to: "theta" },
      { id: "jaw-2", from: "theta", to: "lambda" },
      { id: "body-1", from: "lambda", to: "rho" },
      { id: "leg", from: "ain", to: "sigma1" }
    ],
    priority: ["aldebaran", "ain", "elnath", "prima", "theta", "gamma", "lambda", "sigma1", "rho", "omega"]
  },
  {
    id: "scorpius",
    name: "Thần Nông",
    description: "Bọ cạp: thân hình cong với ngôi sao đỏ Antares ở tim và chiếc đuôi vòng lên.",
    subjectHint: "Thiên văn · Ngữ văn (thần thoại)",
    sky: "Nam bán cầu · đêm mùa hạ",
    stars: [
      { id: "antares", x: 460, y: 300, label: "Tâm Bò Cạp", priority: 1, brightness: 1 },
      { id: "graffias", x: 20, y: 20, label: "Đầu", priority: 2, brightness: 0.7 },
      { id: "dschubba", x: 20, y: 480, label: "", priority: 3, brightness: 0.6 },
      { id: "sargas", x: 960, y: 480, label: "Đuôi Giữa", priority: 4, brightness: 0.75 },
      { id: "shaula", x: 520, y: 580, label: "Ngòi Đuôi", priority: 5, brightness: 0.9 },
      { id: "lesath", x: 960, y: 180, label: "", priority: 6, brightness: 0.5 },
      { id: "tau", x: 460, y: 120, label: "", priority: 7, brightness: 0.5 },
      { id: "epsilon", x: 960, y: 320, label: "", priority: 8, brightness: 0.45 },
      { id: "acrab", x: 20, y: 600, label: "", priority: 9, brightness: 0.4 },
      { id: "kappa", x: 960, y: 580, label: "", priority: 10, brightness: 0.35 }
    ],
    edges: [
      { id: "head-1", from: "acrab", to: "graffias" },
      { id: "head-2", from: "graffias", to: "dschubba" },
      { id: "claw", from: "dschubba", to: "antares" },
      { id: "body-1", from: "antares", to: "tau" },
      { id: "body-2", from: "tau", to: "epsilon" },
      { id: "body-3", from: "epsilon", to: "sargas" },
      { id: "tail-1", from: "sargas", to: "shaula" },
      { id: "tail-2", from: "shaula", to: "lesath" },
      { id: "tail-3", from: "lesath", to: "kappa" }
    ],
    priority: ["antares", "graffias", "dschubba", "sargas", "shaula", "lesath", "tau", "epsilon", "acrab", "kappa"]
  },
  {
    id: "andromeda",
    name: "Tiên Nữ",
    description: "Công chúa Andromeda trải dài thành chuỗi sao, nối vào hình vuông của Phi Mã.",
    subjectHint: "Thiên văn · Ngữ văn (thần thoại)",
    sky: "Bắc bán cầu · đêm mùa thu",
    stars: [
      { id: "alpheratz", x: 60, y: 460, label: "Góc Phi Mã", priority: 1, brightness: 0.9 },
      { id: "delta", x: 60, y: 300, label: "Thân", priority: 2, brightness: 0.8 },
      { id: "mirach", x: 520, y: 300, label: "Đai", priority: 3, brightness: 0.85 },
      { id: "almach", x: 960, y: 300, label: "Bàn Chân", priority: 4, brightness: 0.9 },
      { id: "mu", x: 520, y: 460, label: "", priority: 5, brightness: 0.5 },
      { id: "beta", x: 960, y: 40, label: "", priority: 6, brightness: 0.5 },
      { id: "gamma", x: 60, y: 60, label: "", priority: 7, brightness: 0.45 },
      { id: "theta", x: 500, y: 40, label: "", priority: 8, brightness: 0.4 },
      { id: "sigma", x: 520, y: 580, label: "", priority: 9, brightness: 0.35 },
      { id: "upsilon", x: 60, y: 580, label: "", priority: 10, brightness: 0.3 }
    ],
    edges: [
      { id: "chain-1", from: "alpheratz", to: "delta" },
      { id: "chain-2", from: "delta", to: "mirach" },
      { id: "chain-3", from: "mirach", to: "almach" },
      { id: "square-1", from: "alpheratz", to: "upsilon" },
      { id: "square-2", from: "upsilon", to: "mu" },
      { id: "square-3", from: "mu", to: "sigma" },
      { id: "square-4", from: "sigma", to: "delta" },
      { id: "arm-1", from: "mirach", to: "beta" },
      { id: "arm-2", from: "beta", to: "gamma" },
      { id: "arm-3", from: "delta", to: "theta" }
    ],
    priority: ["alpheratz", "delta", "mirach", "almach", "mu", "beta", "gamma", "theta", "sigma", "upsilon"]
  }
];

/* Old connection ids → the constellation they open on (DECISIONS #171). A game
 * saved before this change keeps its id on disk and is mapped here; the adapter
 * accepts both shapes so nothing is rewritten silently. */
const LEGACY_CONNECTION_MAP = {
  "knowledge-network": "ursa-major",
  bridge: "andromeda",
  "solar-system": "orion",
  circuit: "scorpius",
  ecosystem: "cygnus",
  timeline: "taurus",
  geometry: "lyra"
};

