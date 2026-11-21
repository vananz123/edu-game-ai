#!/usr/bin/env node
/*
 * Một lượt "Gợi ý cảnh" với MODEL THẬT, chạy ngoài app (maintenance).
 *
 * Vì sao cần: #269 khoá được "đường ống chạy" bằng stub, nhưng câu hỏi "model có
 * CHỌN đúng layout/id không" thì chỉ model thật mới trả lời được. Script này gọi
 * đúng prompt + đúng cổng kiểm (`suggestSceneBlueprint`) mà app dùng, nên kết quả
 * ở đây là kết quả thật, không phải bản mô phỏng.
 *
 * KHOÁ KHÔNG NẰM TRONG REPO. Đọc từ biến môi trường:
 *
 *   GEMINI_API_KEY=... node scripts/scene-suggest-live.js [--png]
 *
 *   SCENE_AI_BASE   mặc định https://generativelanguage.googleapis.com/v1beta/openai
 *   SCENE_AI_MODEL  mặc định gemini-3.5-flash-lite
 *   --png           render mỗi blueprint ra .tmp-art/live-<n>.png (cần dist/ đã dựng)
 *
 * Không có khoá thì script thoát với lời nhắn, không gọi mạng.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const wantPng = args.includes('--png');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist', 'src');

let sceneSuggest;
try {
  sceneSuggest = require(path.join(dist, 'services', 'ai', 'scene-suggest.js'));
} catch (error) {
  console.error('Chưa có dist/ — chạy "npx tsc -p tsconfig.json" trước.');
  process.exit(1);
}

const key = process.env.GEMINI_API_KEY || process.env.SCENE_AI_KEY || '';
if (!key) {
  console.error(
    'Thiếu khoá. Chạy lại với GEMINI_API_KEY=... (khoá chỉ nằm trong biến môi trường\n' +
    'của lệnh này, không ghi vào repo, không ghi vào settings.json).'
  );
  process.exit(2);
}

const BASE = process.env.SCENE_AI_BASE || 'https://generativelanguage.googleapis.com/v1beta/openai';
const MODEL = process.env.SCENE_AI_MODEL || 'gemini-3.5-flash-lite';

/**
 * Sáu câu hỏi, mỗi câu nhắm một layout, để biết model có chọn đúng hình học khi
 * câu hỏi đúng là hình học. `expect` không phải điều kiện đỏ: nó là thứ để đọc
 * kết quả, và để lần sau ai đó so lại.
 */
const CASES = [
  {
    name: 'compare — voi với kiến',
    expect: 'compare',
    question: {
      prompt: 'Con voi nặng hơn hay con kiến nặng hơn?',
      answers: ['Con voi', 'Con kiến'],
      category: 'animals',
    },
  },
  {
    name: 'process — vòng đời con ếch',
    expect: 'process',
    question: {
      prompt: 'Sắp xếp các bước trong vòng đời của con ếch.',
      answers: ['Trứng', 'Nòng nọc', 'Ếch con'],
      category: 'animals',
    },
  },
  {
    name: 'surround — đồ dùng học tập',
    expect: 'surround',
    question: {
      prompt: 'Kể tên bốn đồ dùng học tập em dùng mỗi ngày.',
      answers: ['Bút chì', 'Thước kẻ', 'Sách', 'Cặp sách'],
      category: 'language',
    },
  },
  {
    name: 'single — lá cây màu gì',
    expect: 'single',
    question: {
      prompt: 'Lá cây thường có màu gì vào mùa hè?',
      answers: ['Màu xanh', 'Màu đỏ', 'Màu tím', 'Màu trắng'],
      category: 'plants',
    },
  },
  {
    name: 'scenario — trời mưa (bố cục tình huống #254)',
    expect: 'single',
    question: {
      prompt: 'Trời mưa rất to, em đang đi bộ trên đường. Em nên làm gì?',
      answers: ['Mở ô và đi chậm lại', 'Chạy thật nhanh', 'Đứng dưới gốc cây to', 'Cất ô đi cho khô'],
      category: 'safety',
    },
  },
  {
    name: 'science — thí nghiệm tan trong nước',
    expect: 'process',
    question: {
      prompt: 'Thứ tự các bước để biết đường có tan trong nước không.',
      answers: ['Cho đường vào cốc', 'Khuấy đều', 'Quan sát'],
      category: 'science',
    },
  },
];

async function callModel(prompt) {
  const started = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 400,
    }),
  });
  const ms = Date.now() - started;
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('reply is not JSON: ' + text.slice(0, 200));
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('no message content');
  callModel.lastMs = ms;
  return content;
}

(async () => {
  console.log(`model: ${MODEL} @ ${BASE}`);
  const rows = [];
  for (const testCase of CASES) {
    const result = await sceneSuggest.suggestSceneBlueprint(testCase.question, callModel);
    const bp = result.blueprint;
    const shape = [
      bp.layout,
      `backdrop=${bp.backdrop}`,
      `palette=${bp.paletteKey}`,
      `main=${bp.mainIcon}`,
      bp.compareIcon ? `second=${bp.compareIcon}/${bp.compareSign}` : '',
      bp.steps ? `steps=${bp.steps.join('>')}` : '',
      bp.around ? `around=${bp.around.join(',')}` : '',
      bp.subIcons ? `sub=${bp.subIcons.map(s => `${s.icon}@${s.position}`).join(',')}` : '',
      bp.props ? `props=${bp.props.join(',')}` : '',
    ].filter(Boolean).join('  ');
    rows.push({ name: testCase.name, expect: testCase.expect, ...result, shape, ms: callModel.lastMs });
    console.log(`\n${testCase.name}  (mong đợi: ${testCase.expect})`);
    console.log(`  source=${result.source}  ${callModel.lastMs}ms`);
    console.log(`  ${shape}`);
    if (result.issues.length) console.log(`  issues: ${result.issues.join(', ')}`);
    if (result.source === 'model') console.log(`  json: ${result.acceptedJson}`);
  }

  const modelCount = rows.filter(r => r.source === 'model').length;
  const matches = rows.filter(r => r.blueprint.layout === r.expect).length;
  console.log(`\ntóm tắt: ${modelCount}/${rows.length} blueprint do model quyết định, ` +
    `${matches}/${rows.length} đúng layout mong đợi`);

  if (wantPng) {
    const S = require(path.join(dist, 'shared', 'illustration-scene.js'));
    const R = require(path.join(dist, 'shared', 'illustration-registry.js'));
    const outDir = path.join(root, '.tmp-art');
    fs.mkdirSync(outDir, { recursive: true });
    const tmp = path.join(process.env.TEMP || '.', 'eg-art');
    fs.mkdirSync(tmp, { recursive: true });
    const { execFileSync } = require('child_process');
    const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    rows.forEach((row, index) => {
      const svg = S.renderBlueprintSvg(row.blueprint, R.getIllustrationPalette(row.blueprint.paletteKey), {
        label: row.name, assetId: `live-${index}`, className: 'scene',
      });
      const html = path.join(tmp, `live-${index}.html`);
      fs.writeFileSync(html,
        `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}` +
        `svg.scene{width:960px;height:600px;display:block}</style>${svg}`);
      const png = path.join(outDir, `live-${index}.png`);
      execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--window-size=960,600', `--screenshot=${png}`, `file:///${html.split(path.sep).join('/')}`],
        { stdio: 'ignore' });
      console.log(`  .tmp-art/live-${index}.png  ← ${row.name}`);
    });
  }
})().catch(error => {
  console.error('\nLỗi: ' + (error && error.message));
  process.exit(1);
});
