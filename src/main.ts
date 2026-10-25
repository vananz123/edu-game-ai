// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, Menu } = require('electron');
const path = require('node:path');
// Test/support hook: Windows resolves `%APPDATA%` through the shell API, so
// setting the APPDATA environment variable in a smoke script does not isolate
// the profile. An explicit path keeps automated runs away from teacher data.
if (process.env.EDUGAME_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.EDUGAME_USER_DATA));
}
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const JSZip = require('jszip');
const Database = require('better-sqlite3');
const { z } = require('zod');
const { AIManager } = require('./ai-core/ai-manager');
const { resolveCpuThreads } = require('./ai-core/runtime-threads');
const { ModelInstaller, summarizeModelSelection, verifyModelFile } = require('./ai-core/model-installer');
const { buildGenerationOptions } = require('./ai-core/generation-options');
const { LlamaRuntimeInstaller } = require('./ai-core/runtime-installer');
const { importQuestionsFromFile } = require('./services/question-import');
const { normalizeAiGame: normalizeAiGameService } = require('./services/ai-game-normalize');
const { LessonStore } = require('./services/lesson-store');
const { AiTaskManager, newAiTaskId } = require('./services/ai-tasks');
const { buildTreasureHunt: buildTreasureHuntService, buildRaceData: buildRaceDataService } = require('./services/ai-game-design');
const { validateScenarioGame, validateMatchingGame, validateTreasureHuntGame, validateRaceGame } = require('./services/game-validation');
const { isZenBaseUrl, postZenChatCompletions, readLocalOpencodeApiKey } = require('./services/opencode-zen');
const {
  AiRequestRegistry,
  AiSingleFlight,
  AiTransportError,
  isCancelReason,
  readPromptTokens,
  requestChatJson
} = require('./services/ai-transport');
const { analyzeLesson, generateGameDraft, regenerateGameItem } = require('./services/lesson-workflow');
// O6d: per-mode excerpt budget for the analysis preprocessor.
const { preprocessBudgetForMode } = require('./services/lesson-preprocess');
// #76: offline document structure + teacher selection (spec update_AI_plan_7).
const { normalizeLessonSource } = require('./services/lesson-chunker');
const { buildLessonStructure } = require('./services/lesson-structure');
const {
  prepareSelectedLessonText,
  prepareWholeLessonText,
  selectionFingerprint
} = require('./services/lesson-selection');
// O5: cache keys (document hash + model + prompt/schema version + config).
const {
  buildAnalysisCacheKey,
  buildGenerationCacheKey,
  analysisFingerprint,
  configFingerprint,
  sha256Hex
} = require('./services/lesson-cache');
// O5: replace exactly one item while the app keeps ids/links (§5.5).
const {
  replaceDraftItem,
  patchDraftItemAssets,
  resolveItemIndexes,
  itemCount,
  itemAt,
  itemLabel
} = require('./services/lesson-item-repair');
// Phase B: the asset whitelist lives in shared code so main, editor and wizard
// cannot disagree about which fields a teacher may change (DECISIONS #72).
const { applyItemAssetPatch } = require('./shared/asset-validation');
const { parseGameDraft } = require('./services/lesson-contracts');
// O1: genre suggestions are rule-based, so this step never calls the model.
const { recommendGamesForAnalysis } = require('./services/game-recommender');
// O12: prediction for a sensible item count (document + analysis + model + mode).
const { estimateItemCapacity } = require('./services/item-capacity');
const { WORKFLOW_GAME_TYPES } = require('./shared/lesson-types');
// O2: deterministic content-quality checks (no model call).
const { checkDraftQuality, requestedItemCount } = require('./services/lesson-quality');
// O10: on-machine diagnostic log so a teacher can send back what happened.
const { createAiLogWriter, formatDiagnosticBundle, writeDiagnosticBundle, sanitizeLogMessage, clearAiLogs } = require('./services/ai-log');
// O3: chunk the lesson once, then retrieve only the relevant part for generation.
const { chunkLessonText } = require('./services/lesson-chunker');
const { selectChunks, selectChunksByVectors, selectChunksForItem, buildRetrievalQuery, DEFAULT_MAX_SELECTED_CHUNKS, DEFAULT_MAX_SELECTED_CHARS, DEEP_MAX_SELECTED_CHUNKS, DEEP_MAX_SELECTED_CHARS } = require('./services/lesson-retrieval');
const { formatRetrievedChunks, LESSON_PROMPT_VERSIONS } = require('./services/lesson-prompts');
// O4: the retrieval model + its dedicated llama-server process (embeddings only).
const { getEmbeddingModel, embeddingTextForChunk } = require('./ai-core/embedding-catalog');
const { createEmbeddingRuntime, chunkTextsForEmbedding } = require('./ai-core/embedding-manager');
// Presentation Mode
const { registerPresentationIpc, unregisterPresentationIpc } = require('./presentation/presentation-ipc');
const {
  createProjectFromAnalysis,
  applyAnalysis,
  advanceAfterRecommendations,
  applyDraft
} = require('./services/lesson-projects');
const { toEducationalGame } = require('./services/game-project-adapter');
const { SetupOrchestrator } = require('./ai-core/setup-orchestrator');
const { registerSetupIpc } = require('./ai-core/setup-ipc');
const { SetupStateStore, parseSetupState, createInitialSetupState, SETUP_STATE_SCHEMA_VERSION, needsSetup } = require('./ai-core/setup-state');
const { detectHardware, diskFreeBytes } = require('./ai-core/hardware-detector');
const { RUNTIME_MANIFEST } = require('./ai-core/runtime-manifest');
const { detectInstalledBackend } = require('./ai-core/runtime-manifest');
const { resolveRuntime } = require('./ai-core/runtime-resolver');
const {
  QWEN_LOCAL_MODELS,
  LLAMA_CPP_RUNTIME,
  getLocalModel,
  getLocalModelRecommendation,
  recommendLocalModelId,
  resolveBackendAttempts
} = require('./ai-core/model-catalog');

const gameDraftSchema = z.object({
  title: z.string().trim().min(3).max(200),
  subject: z.string().max(100).optional().default(''),
  grade: z.string().max(50).optional().default(''),
  topic: z.string().max(200).optional().default(''),
  template: z.enum(['quiz', 'scenario', 'matching', 'treasure-hunt', 'race']).optional(),
  treasureDesign: z.object({
    character: z.string().max(100).optional(),
    intro: z.string().max(2000).optional(),
    journeyBonus: z.number().int().min(0).max(10000).optional(),
    hiddenItemBonus: z.number().int().min(0).max(1000).optional(),
    stages: z.array(z.object({
      name: z.string().max(120).optional(),
      story: z.string().max(2000).optional(),
      taskDescription: z.string().max(1000).optional(),
      attempts: z.number().int().min(0).max(99).optional(),
      points: z.number().int().min(0).max(1000).optional(),
      completionBonus: z.number().int().min(0).max(10000).optional(),
      hasHiddenItem: z.boolean().optional(),
      hint: z.string().max(500).optional()
    })).max(30).optional()
  }).optional(),
  raceDesign: z.object({
    trackLength: z.number().int().min(3).max(100).optional(),
    maxRounds: z.number().int().min(1).max(50).optional(),
    stepByDifficulty: z.boolean().optional(),
    luckEnabled: z.boolean().optional(),
    teams: z.array(z.object({
      name: z.string().trim().min(1).max(60),
      icon: z.string().max(8).optional()
    })).min(2).max(6).optional(),
    specialCells: z.array(z.object({
      cell: z.number().int().min(2).max(100),
      type: z.enum(['boost', 'penalty', 'lucky', 'challenge']),
      label: z.string().max(80).optional()
    })).max(12).optional()
  }).optional(),
  description: z.string().max(2000).optional().default(''),
  questions: z.array(z.object({
    id: z.string().max(20).optional(),
    type: z.enum(['multiple-choice', 'true-false', 'fill-in-blank', 'short-answer', 'scenario', 'matching']).optional(),
    prompt: z.string().trim().min(12).max(1000)
      .refine((item) => item.trim().endsWith('?') || item.trim().length >= 30, { message: 'Prompt câu hỏi phải là câu hỏi cụ thể hoặc tình huống chi tiết.' })
      .refine((item) => !/^(tóm tắt|tom tat|ý chính|y chinh|gợi ý|goi y)\s*$/i.test(item.trim()), { message: 'Prompt không được là nhãn phân đoạn.' }),
    options: z.array(z.object({
      id: z.enum(['a', 'b', 'c', 'd']),
      text: z.string().trim().min(1).max(500)
    })).min(0).max(4).optional(),
    correctOptionId: z.enum(['a', 'b', 'c', 'd']).optional(),
    correctAnswer: z.string().trim().min(1).max(500).optional(),
    hint: z.string().trim().max(200).optional(),
    explanation: z.string().max(1000).optional().default(''),
    points: z.number().int().min(10).max(500).optional(),
    difficulty: z.enum(['dễ', 'trung bình', 'khó']).optional()
  }).superRefine((question, ctx) => {
    const type = question.type || 'multiple-choice';
    if (type === 'fill-in-blank' || type === 'short-answer') {
      if (!question.correctAnswer) {
        ctx.addIssue({ code: 'custom', message: `Câu ${type === 'fill-in-blank' ? 'điền từ' : 'trả lời ngắn'} cần có correctAnswer.` });
      }
    } else if (!(question.options && question.options.length >= 2 && question.correctOptionId)) {
      ctx.addIssue({ code: 'custom', message: `Câu ${type} cần ít nhất 2 phương án và correctOptionId.` });
    }
  })).min(3).max(15)
});
const gameDraftResponseSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    subject: { type: 'string' },
    grade: { type: 'string' },
    topic: { type: 'string' },
    template: { type: 'string', enum: ['quiz', 'scenario', 'matching', 'treasure-hunt', 'race'] },
    description: { type: 'string' },
    treasureDesign: {
      type: 'object',
      properties: {
        character: { type: 'string' },
        intro: { type: 'string' },
        journeyBonus: { type: 'number' },
        hiddenItemBonus: { type: 'number' },
        stages: {
          type: 'array', maxItems: 30,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              story: { type: 'string' },
              taskDescription: { type: 'string' },
              attempts: { type: 'number' },
              points: { type: 'number' },
              completionBonus: { type: 'number' },
              hasHiddenItem: { type: 'boolean' },
              hint: { type: 'string' }
            },
            required: ['name'],
            additionalProperties: false
          }
        }
      },
      required: ['stages'],
      additionalProperties: false
    },
    raceDesign: {
      type: 'object',
      properties: {
        trackLength: { type: 'number' },
        maxRounds: { type: 'number' },
        stepByDifficulty: { type: 'boolean' },
        luckEnabled: { type: 'boolean' },
        teams: {
          type: 'array', minItems: 2, maxItems: 6,
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, icon: { type: 'string' } },
            required: ['name'],
            additionalProperties: false
          }
        },
        specialCells: {
          type: 'array', maxItems: 12,
          items: {
            type: 'object',
            properties: {
              cell: { type: 'number' },
              type: { type: 'string', enum: ['boost', 'penalty', 'lucky', 'challenge'] },
              label: { type: 'string' }
            },
            required: ['cell', 'type'],
            additionalProperties: false
          }
        }
      },
      required: ['trackLength'],
      additionalProperties: false
    },
    questions: {
      type: 'array', minItems: 3, maxItems: 15,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['multiple-choice', 'true-false', 'fill-in-blank', 'short-answer', 'scenario', 'matching'] },
          prompt: { type: 'string' },
          options: {
            type: 'array', minItems: 0, maxItems: 4,
            items: {
              type: 'object',
              properties: { id: { type: 'string', enum: ['a', 'b', 'c', 'd'] }, text: { type: 'string' } },
              required: ['id', 'text'],
              additionalProperties: false
            }
          },
          correctOptionId: { type: 'string', enum: ['a', 'b', 'c', 'd'] },
          correctAnswer: { type: 'string' },
          hint: { type: 'string' },
          explanation: { type: 'string' },
          points: { type: 'number' },
          difficulty: { type: 'string', enum: ['dễ', 'trung bình', 'khó'] }
        },
        required: ['prompt'],
        additionalProperties: false
      }
    }
  },
  required: ['title', 'questions'],
  additionalProperties: false
};

let sqlite;
let lessonStore;
/** Maps renderer `requestId` → AbortController for the new lesson workflow + `ai:cancel`. */
const aiRequests = new AiRequestRegistry();
/** Rejects overlapping local-model work even when the renderer uses new ids. */
const aiSingleFlight = new AiSingleFlight();
// update_plan_3 §8: central CPU task registry (one stable id per task).
const aiTasks = new AiTaskManager();

/** Best-effort task history write: history must never fail the teacher's run. */
function recordAiTask(record) {
  if (!record || !record.taskId) return;
  try {
    requireLessonStore().saveAiTask(record);
  } catch (error) {
    console.warn('Không lưu được lịch sử tác vụ AI:', error && error.message ? error.message : error);
  }
}

let mainWindow;
let localAiManager;
let localAiModelId;
let localEmbeddingRuntime;
let localEmbeddingModelId;
/** Shared start promises so two IPC calls cannot create two llama-server processes. */
let localRuntimeStart = null;
let localEmbeddingStart = null;
let localModelInstallInProgress = false;
let quittingAfterAiShutdown = false;
const DATA_DIR = () => path.join(app.getPath('userData'), 'edugame-data');
// O10: diagnostics live next to the SQLite database, never in the repo or installer.
const LOG_DIR = () => path.join(DATA_DIR(), 'logs');
const AI_LOG_RETENTION_DAYS = 14;
/**
 * O10: the exported bundle goes somewhere a teacher can find without knowing
 * about AppData. The env hook exists only so automated runs do not litter a real
 * Desktop; teachers never set it.
 */
const DIAGNOSTICS_EXPORT_DIR = () => process.env.EDUGAME_DIAGNOSTICS_DIR || app.getPath('desktop');
/** Set once after `ensureData()`; callers must tolerate `null` (early errors). */
let aiLog = null;
function aiLogWrite(level, event, data) {
  if (!aiLog) return;
  aiLog.write(level, event, data);
}
/** Error facts only: code + a short message with quoted content elided. */
function errorFacts(error) {
  return {
    code: String((error && error.code) || (error && error.message && /\[([A-Z_]+)\]/.exec(error.message)?.[1]) || 'UNKNOWN'),
    message: sanitizeLogMessage(error, 240)
  };
}
const DB_FILE = () => path.join(DATA_DIR(), 'edugame.sqlite');
const LEGACY_DB_FILE = () => path.join(DATA_DIR(), 'library.json');
const SETTINGS_FILE = () => path.join(DATA_DIR(), 'settings.json');
const AI_LOCAL_ROOT = () => path.join(DATA_DIR(), 'ai-local');
const MODEL_DIR = () => path.join(AI_LOCAL_ROOT(), 'models');
const RUNTIME_DIR = () => path.join(AI_LOCAL_ROOT(), 'runtime', `llama.cpp-${LLAMA_CPP_RUNTIME.version}`);
// O4: how many chunks go into one `/v1/embeddings` request. Measured, not guessed
// (tests/bench-embedding.js); 8 keeps a single request well under a second on the
// target 16 GB / U-series machine while avoiding one request per chunk.
// O5: the default stays 8 but is now overridable (`ai.embeddingBatchSize` in
// settings.json, 1..32) so O6 can tune it from the benchmark instead of a guess.
const DEFAULT_EMBEDDING_BATCH_SIZE = 8;

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

async function readAiSettings() {
  const settings = await readJson(SETTINGS_FILE(), {});
  return (settings && settings.ai) || {};
}

async function readEmbeddingBatchSize() {
  const ai = await readAiSettings();
  return clampInteger(ai.embeddingBatchSize, 1, 32, DEFAULT_EMBEDDING_BATCH_SIZE);
}

/**
 * The chat model id is part of every O5 cache key. This mirrors the resolution
 * inside `createLessonChatClient` (settings first, catalog default second) so a
 * model switch invalidates cached analyses/content instead of silently reusing
 * output produced by the previous model.
 */
async function currentChatModelId() {
  const ai = await readAiSettings();
  return String(ai.localModelId || QWEN_LOCAL_MODELS[0].id);
}

async function deleteLocalAiData() {
  try {
    await fs.rm(AI_LOCAL_ROOT(), { recursive: true, force: true });
  } catch (error) {
    console.error('Could not remove local AI data during cleanup:', error);
  }
}

function id(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function seedGame() {
  return {
    id: 'sample-traffic-001',
    title: 'Thử thách an toàn giao thông',
    subject: 'Giáo dục công dân',
    grade: '7',
    topic: 'An toàn giao thông',
    template: 'scenario',
    description: 'Nhận diện tình huống giao thông và lựa chọn cách xử lý an toàn.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceName: 'Trò chơi mẫu',
    tags: ['Giao thông', 'Tình huống', 'Lớp 7'],
    questions: [
      { id: 'q1', type: 'scenario', prompt: 'Em đang đi xe đạp đến gần ngã tư. Đèn tín hiệu chuyển đỏ khi em còn cách vạch dừng vài mét. Em nên làm gì?', options: [{id:'a',text:'Tăng tốc để vượt qua trước khi xe khác tới'},{id:'b',text:'Giảm tốc và dừng trước vạch dừng'},{id:'c',text:'Đi lên vỉa hè để tránh đèn đỏ'},{id:'d',text:'Quan sát sơ qua rồi đi tiếp'}], correctOptionId: 'b', explanation: 'Khi đèn tín hiệu màu đỏ, người tham gia giao thông phải dừng trước vạch dừng. Đi chậm và dừng đúng vị trí giúp bảo vệ bản thân và người khác.', points: 100 },
      { id: 'q2', type: 'multiple-choice', prompt: 'Khi đi xe đạp trên đường, hành vi nào an toàn nhất?', options: [{id:'a',text:'Đi hàng ba để trò chuyện'},{id:'b',text:'Bám vào xe máy phía trước'},{id:'c',text:'Đi đúng phần đường, chú ý quan sát và giữ khoảng cách'},{id:'d',text:'Vừa đi vừa sử dụng điện thoại'}], correctOptionId: 'c', explanation: 'Đi đúng phần đường, quan sát và giữ khoảng cách giúp người đi xe đạp chủ động xử lý tình huống bất ngờ.', points: 100 },
      { id: 'q3', type: 'scenario', prompt: 'Một người bạn rủ em ngồi sau xe máy nhưng không đội mũ bảo hiểm. Em sẽ làm gì?', options: [{id:'a',text:'Đi ngay vì quãng đường ngắn'},{id:'b',text:'Từ chối đi cho đến khi có mũ bảo hiểm phù hợp'},{id:'c',text:'Đội mũ lưỡi trai thay thế'},{id:'d',text:'Chỉ đội nếu gặp công an'}], correctOptionId: 'b', explanation: 'Mũ bảo hiểm đạt chuẩn và cài quai đúng cách giúp giảm nguy cơ chấn thương đầu. An toàn không phụ thuộc quãng đường dài hay ngắn.', points: 100 },
      { id: 'q4', type: 'multiple-choice', prompt: 'Khi muốn sang đường tại nơi không có đèn tín hiệu, em nên làm gì?', options: [{id:'a',text:'Chạy thật nhanh qua đường'},{id:'b',text:'Đi theo người khác mà không quan sát'},{id:'c',text:'Chọn nơi dễ quan sát, nhìn trái–phải–trái và chỉ sang khi an toàn'},{id:'d',text:'Vừa đi vừa nhìn điện thoại'}], correctOptionId: 'c', explanation: 'Quan sát kỹ cả hai phía, đánh giá khoảng cách và tốc độ phương tiện trước khi sang đường. Không chạy bất ngờ ra lòng đường.', points: 100 },
      { id: 'q5', type: 'scenario', prompt: 'Trời mưa, mặt đường trơn và tầm nhìn giảm. Điều chỉnh nào phù hợp?', options: [{id:'a',text:'Đi nhanh hơn để về sớm'},{id:'b',text:'Phanh gấp liên tục'},{id:'c',text:'Giảm tốc độ, tăng khoảng cách và tránh phanh/đánh lái đột ngột'},{id:'d',text:'Đi sát xe phía trước'}], correctOptionId: 'c', explanation: 'Mặt đường trơn làm tăng quãng đường phanh. Giảm tốc độ và tăng khoảng cách giúp có thêm thời gian xử lý.', points: 100 }
    ]
  };
}
async function ensureData() {
  await fs.mkdir(DATA_DIR(), { recursive: true });
  sqlite = new Database(DB_FILE());
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT DEFAULT '',
      grade TEXT DEFAULT '',
      topic TEXT DEFAULT '',
      template TEXT DEFAULT 'quiz',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_games_updated_at ON games(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
  `);
  await fs.mkdir(path.join(DATA_DIR(), 'lessons'), { recursive: true });
  lessonStore = new LessonStore({ db: sqlite, lessonsDir: path.join(DATA_DIR(), 'lessons') });
  // Single entry point for the sidecar schema: creates the tables and applies
  // additive migrations (e.g. O5's `lesson_analyses.cache_key`) to older files.
  lessonStore.ensureSchema();
  const gameCount = sqlite.prepare('SELECT COUNT(*) AS count FROM games').get().count;
  if (gameCount === 0) {
    let legacy = { games: [], sessions: [] };
    try { legacy = JSON.parse(await fs.readFile(LEGACY_DB_FILE(), 'utf8')); } catch {}
    const games = Array.isArray(legacy.games) && legacy.games.length ? legacy.games : [seedGame()];
    saveDb({ version: 1, games, sessions: Array.isArray(legacy.sessions) ? legacy.sessions : [] });
  }
  try { await fs.access(SETTINGS_FILE()); }
  catch { await writeJson(SETTINGS_FILE(), { ai: { mode: 'offline', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b', apiKeyEncrypted: '' }, preferences: { sound: true, largeText: true, theme: 'light' } }); }
}
async function readJson(file, fallback = {}) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}
function requireLessonStore() {
  if (!lessonStore) throw new Error('Kho giáo án chưa sẵn sàng.');
  return lessonStore;
}
async function readDb() {
  if (!sqlite) return { version: 1, games: [], sessions: [] };  const games = sqlite.prepare('SELECT data_json FROM games ORDER BY updated_at DESC').all().map(row => JSON.parse(row.data_json));
  const sessions = sqlite.prepare('SELECT data_json FROM sessions ORDER BY created_at DESC LIMIT 1000').all().map(row => JSON.parse(row.data_json));
  return { version: 1, games, sessions };
}
async function saveDb(db) {
  if (!sqlite) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const replace = sqlite.transaction((value) => {
    sqlite.prepare('DELETE FROM games').run();
    sqlite.prepare('DELETE FROM sessions').run();
    const insertGame = sqlite.prepare(`INSERT INTO games (id,title,subject,grade,topic,template,created_at,updated_at,data_json) VALUES (@id,@title,@subject,@grade,@topic,@template,@created_at,@updated_at,@data_json)`);
    for (const game of value.games || []) {
      const now = new Date().toISOString();
      insertGame.run({ id: String(game.id || id('game')), title: String(game.title || 'Trò chơi chưa đặt tên'), subject: String(game.subject || ''), grade: String(game.grade || ''), topic: String(game.topic || ''), template: String(game.template || 'quiz'), created_at: String(game.createdAt || now), updated_at: String(game.updatedAt || now), data_json: JSON.stringify(game) });
    }
    const insertSession = sqlite.prepare('INSERT INTO sessions (id,created_at,data_json) VALUES (@id,@created_at,@data_json)');
    for (const session of (value.sessions || []).slice(0, 1000)) {
      const createdAt = String(session.createdAt || new Date().toISOString());
      insertSession.run({ id: String(session.id || id('session')), created_at: createdAt, data_json: JSON.stringify(session) });
    }
  });
  replace(db);
  return { ok: true };
}

/**
 * Targeted game upsert used by `library:save-game`. The old read-whole-DB /
 * delete-whole-DB / rewrite path could lose a concurrent session save; writing
 * one row keeps saves independent. `created_at` is preserved on update.
 */
function upsertGameRow(game) {
  if (!sqlite) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const now = new Date().toISOString();
  const existing = sqlite.prepare('SELECT created_at FROM games WHERE id = ?').get(game.id);
  const createdAt = String(game.createdAt || (existing && existing.created_at) || now);
  const updatedAt = String(game.updatedAt || now);
  sqlite.prepare(`
    INSERT INTO games (id,title,subject,grade,topic,template,created_at,updated_at,data_json)
    VALUES (@id,@title,@subject,@grade,@topic,@template,@created_at,@updated_at,@data_json)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, subject=excluded.subject, grade=excluded.grade,
      topic=excluded.topic, template=excluded.template,
      updated_at=excluded.updated_at, data_json=excluded.data_json
  `).run({
    id: String(game.id),
    title: String(game.title || 'Trò chơi chưa đặt tên'),
    subject: String(game.subject || ''),
    grade: String(game.grade || ''),
    topic: String(game.topic || ''),
    template: String(game.template || 'quiz'),
    created_at: createdAt,
    updated_at: updatedAt,
    data_json: JSON.stringify({ ...game, createdAt, updatedAt })
  });
}

/**
 * Idempotent session upsert. The renderer generates the session id once per
 * completed playthrough, so rendering results twice or renaming the player
 * updates the same history row instead of adding duplicates.
 */
function upsertSessionRow(session) {
  if (!sqlite) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const now = new Date().toISOString();
  const sessionId = String(session && session.id ? session.id : id('session'));
  const existing = sqlite.prepare('SELECT created_at FROM sessions WHERE id = ?').get(sessionId);
  const createdAt = String(session.createdAt || (existing && existing.created_at) || now);
  const stored = { ...session, id: sessionId, createdAt };
  sqlite.prepare(`
    INSERT INTO sessions (id,created_at,data_json)
    VALUES (@id,@created_at,@data_json)
    ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json
  `).run({
    id: sessionId,
    created_at: createdAt,
    data_json: JSON.stringify(stored)
  });
  // Keep the same bounded history as before, but never prune the row that was
  // just written (a rename of an old session must stay visible).
  sqlite.prepare(`
    DELETE FROM sessions WHERE id <> @id AND id NOT IN (
      SELECT id FROM sessions WHERE id <> @id ORDER BY created_at DESC LIMIT 999
    )
  `).run({ id: sessionId });
  return stored;
}

// Main is the source of truth for the native window state, so the renderer
// flag cannot drift if Windows or a shortcut leaves fullscreen on its own.
function sendFullscreenState(enabled) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('window:fullscreen-changed', Boolean(enabled));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 720,
    backgroundColor: '#f5f7fb',
    title: 'EduGame Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  /* Hide the default Electron menu bar (File / Edit / View / Window / Help).
     It is a framework leftover: its only useful entries are Reload / Force
     Reload / Toggle DevTools / Zoom, none of which a teacher needs, and it ate
     a strip of the window.
     A real application menu is still installed because Electron's built-in F11
     handling comes from the default menu's View role — removing the menu
     outright would take the shortcut with it. The single top-level item is
     `visible: false`, so nothing is drawn, and auto-hide keeps the bar shut
     (pressing Alt reveals it temporarily, which is standard Windows behaviour).
     Measured at devicePixelRatio 1.5, same window size: outerHeight -
     innerHeight was 63 CSS px with the default menu and is 37 CSS px now, i.e.
     the ~39 device-px menu strip is gone and only the title bar remains. */
  const windowMenu = Menu.buildFromTemplate([
    { label: 'View', visible: false, submenu: [{ role: 'togglefullscreen', accelerator: 'F11' }] }
  ]);
  Menu.setApplicationMenu(windowMenu);
  mainWindow.setAutoHideMenuBar(true);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on('enter-full-screen', () => sendFullscreenState(true));
  mainWindow.on('leave-full-screen', () => sendFullscreenState(false));
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(async () => {
  await ensureData();
  // O10: start the diagnostic log as early as possible so runtime/analyze/generate
  // events on a teacher's machine can be sent back as one file.
  aiLog = createAiLogWriter({ directory: LOG_DIR(), retentionDays: AI_LOG_RETENTION_DAYS });
  try {
    const aiSettings = (await readJson(SETTINGS_FILE(), {})).ai || {};
    const cpus = os.cpus();
    // Which build is actually on disk, not just whether *an* executable exists.
    // The first report of "I chose Vulkan but the CPU is still busy" could not be
    // diagnosed from a log that only said `runtimeInstalled: true`.
    const installedBackend = await createRuntimeInstaller().getInstalledBackend().catch(() => undefined);
    aiLog.info('app.start', {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      cpuModel: cpus[0]?.model || '',
      logicalCpuCount: cpus.length,
      totalRamBytes: os.totalmem(),
      modelIds: QWEN_LOCAL_MODELS.map(model => model.id),
      aiMode: aiSettings.mode || 'unknown',
      localModelId: aiSettings.localModelId || '',
      runtimeBackend: aiSettings.runtimeBackend || 'auto',
      installedBackend: installedBackend || 'none',
      runtimeInstalled: Boolean(await createRuntimeInstaller().getExecutablePath()),
      fixtureMode: Boolean(process.env.EDUGAME_AI_TEST_DIR)
    });
  } catch (error) {
    aiLog.warn('app.start.failed', errorFacts(error));
  }
  registerIpc();
  registerSetup();
  registerPresentationIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', async event => {
  aiRequests.cancelAll();
  unregisterPresentationIpc();
  if (quittingAfterAiShutdown) return;
  if (!localAiManager) return;

  event.preventDefault();
  const manager = localAiManager;
  localAiManager = undefined;
  localAiModelId = undefined;

  try {
    await manager.stop();
  } catch (error) {
    console.error('Could not stop local llama.cpp runtime:', error);
  } finally {
    quittingAfterAiShutdown = true;
    app.quit();
  }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

function localModelFilePath(model) {
  return path.join(MODEL_DIR(), `${model.id}-${model.version}.gguf`);
}
/**
 * The MSVC runtime DLLs are shipped as extraResources so llama-server does not
 * depend on an outdated system-wide Visual C++ redistributable. In development
 * the same files live under vendor/vc-runtime.
 */
function vcRuntimeDirectory() {
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, 'vc-runtime')
    : path.join(__dirname, '..', '..', 'vendor', 'vc-runtime');
  return fsSync.existsSync(candidate) ? candidate : undefined;
}
/**
 * Display adapter names from WMI. Used only to classify the GPU vendor; the
 * value is never shown as fact, and a failure yields `undefined` so the
 * detector reports `unknown` rather than guessing.
 */
async function readGpuAdapterNames() {
  try {
    const { execFile } = require('node:child_process');
    const { promisify } = require('node:util');
    const run = promisify(execFile);
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name'],
      { timeout: 8000, windowsHide: true }
    );
    return String(stdout).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  } catch (error) {
    console.warn('Không đọc được danh sách GPU:', error && error.message ? error.message : error);
    return undefined;
  }
}
/**
 * Resolves which runtime build this machine should run. Kept in one place so
 * setup, install, verification and startup can never disagree about the
 * backend — a mismatch would install the Vulkan files and then spawn the CPU
 * command line, or the reverse.
 *
 * The teacher's saved `ai.runtimeBackend` is the *request*; the resolver is
 * still the decision. Passing it here (rather than at each call site) means
 * Settings, the setup wizard, verification and every later start all honour the
 * same choice. `auto` is indistinguishable from the old behaviour, so a
 * settings file written before this option existed resolves exactly as before.
 */
async function resolveRuntimeForThisMachine() {
  const hardware = await detectHardware(MODEL_DIR(), {
    getDiskFreeBytes: diskFreeBytes,
    getGpuNames: readGpuAdapterNames
  });
  const preferredBackend = await readRuntimeBackendPreference();
  return {
    hardware,
    resolution: resolveRuntime(hardware, RUNTIME_MANIFEST, {
      ...(preferredBackend !== 'auto' ? { backend: preferredBackend } : {})
    })
  };
}
/**
 * Reads the teacher's backend choice from settings, defensively.
 *
 * A malformed or unknown value must never reach the resolver as a surprise, and
 * must never break startup: anything that is not an exact known option reads as
 * `auto`. `'openvino'` is deliberately *not* offered (no verified build ships),
 * so it is treated as unknown rather than silently forwarded.
 */
async function readRuntimeBackendPreference() {
  try {
    const settings = await readJson(SETTINGS_FILE(), {});
    const value = settings && settings.ai ? settings.ai.runtimeBackend : undefined;
    return value === 'cpu' || value === 'vulkan' ? value : 'auto';
  } catch {
    return 'auto';
  }
}
/**
 * `entry` is the manifest entry chosen by the resolver. Passing it explicitly
 * matters: the downloader must fetch the same build the resolver promised, or a
 * setup wizard that announced "Vulkan" would install the CPU zip.
 */
function createRuntimeInstaller(entry) {
  return new LlamaRuntimeInstaller({
    runtimeDirectory: RUNTIME_DIR(),
    supportFilesDirectory: vcRuntimeDirectory(),
    ...(entry ? { runtimeArtifact: entry } : {})
  });
}
/**
 * GPU layers to offload when the Vulkan build is selected. `99` exceeds any
 * layer count the models here have, and llama.cpp clamps it to the real number,
 * so the whole model lands on the GPU without hard-coding an architecture.
 */
const VULKAN_GPU_LAYERS = 99;
/**
 * Runtime verification (§4/§6). Reports the backend the resolver actually
 * chose for this machine and the flags it will run with.
 *
 * Previously this asserted "CPU only": it hard-coded `llama.cpp CPU`, forced
 * `--n-gpu-layers 0`, and treated any Vulkan/CUDA DLL as an anomaly. Once a GPU
 * build can legitimately be installed, that assertion would fire on a *correct*
 * install and tell the teacher their working setup was broken. So the expected
 * backend now comes from the resolver, and GPU files are only flagged when they
 * do not match the selected build.
 */
async function verifyRuntime() {
  const { hardware, resolution } = await resolveRuntimeForThisMachine();
  const installer = createRuntimeInstaller();
  const executablePath = await installer.getExecutablePath();
  const files = [];
  if (executablePath) {
    try {
      const entries = await fs.readdir(path.dirname(executablePath));
      for (const entry of entries) files.push(entry);
    } catch (error) {
      console.warn('Không đọc được thư mục runtime:', error && error.message ? error.message : error);
    }
  }
  const lower = files.map(name => String(name).toLowerCase());
  const gpuMarkers = lower.filter(name =>
    name.includes('cuda') || name.includes('cublas') || name.includes('cudart') ||
    name.includes('vulkan') || name.includes('nccl') || name.includes('cudnn')
  );
  const selectedBackend = resolution.status === 'ok' ? resolution.entry.backend : 'cpu';
  const expected = resolution.status === 'ok' ? resolution.entry : LLAMA_CPP_RUNTIME;
  // What is *actually* on disk. Reporting `selectedBackend` alone claimed the
  // GPU build was in use while the CPU files were still installed, which is how
  // "I chose Vulkan but the CPU is still busy" went unnoticed.
  const installedBackend = executablePath
    ? detectInstalledBackend(files.map(name => String(name)))
    : undefined;
  const backendMismatch = Boolean(executablePath) && installedBackend !== selectedBackend;
  const gpuLayers = selectedBackend === 'vulkan' ? VULKAN_GPU_LAYERS : 0;
  return {
    cpuOnly: selectedBackend === 'cpu',
    backend: resolution.status === 'ok'
      ? resolution.entry.displayName
      : `Không chọn được runtime (${resolution.code}); dùng CPU.`,
    selectedBackend,
    installedBackend: installedBackend || null,
    backendMismatch,
    gpuVendor: hardware.gpuVendor || 'unknown',
    gpuNames: hardware.gpuNames || [],
    expectedVersion: expected.version,
    expectedDownloadUrl: expected.downloadUrl,
    expectedSizeBytes: expected.sizeBytes,
    executablePath: executablePath || null,
    installed: Boolean(executablePath),
    files,
    gpuMarkers,
    gpuBackendShipped: gpuMarkers.length > 0,
    args: [
      '--n-gpu-layers', String(gpuLayers),
      ...(selectedBackend === 'vulkan' ? ['--device', 'Vulkan0'] : []),
      '--parallel', '1', '--ctx-checkpoints', '0'
    ],
    note: backendMismatch
      ? `Thư mục runtime đang chứa bản ${installedBackend || 'không rõ'}, nhưng cấu hình chọn ${selectedBackend}. `
        + 'Bấm “Cài model” (hoặc chạy lại AI local) để thay bằng bản đã chọn.'
      : selectedBackend === 'vulkan'
        ? 'Đang dùng bản GPU (Vulkan) — tùy chọn nâng cao; đo trên máy phổ thông thấy chưa nhanh hơn CPU. Nếu máy không khởi động được, ứng dụng tự chuyển về CPU.'
        : gpuMarkers.length
          ? 'Thư mục runtime có tệp GPU, nhưng cấu hình này chọn bản CPU nên các tệp đó không được dùng.'
          : 'Không có backend GPU trong thư mục runtime. Mọi tiến trình chạy CPU (`--n-gpu-layers 0`).'
  };
}
function formatMemoryBytes(bytes) {
  return `${(bytes / 1024 ** 3).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} GB`;
}
/**
 * Fail before llama-server is spawned when the machine cannot plausibly hold
 * the model. Without this an 8 GB machine can end up with a native 0xC0000005
 * crash instead of an actionable message. The estimate is deliberately coarse
 * (weights + KV/runtime headroom); it is a guard, not a performance claim.
 */
function assertModelFitsMachine(model) {
  const totalRam = os.totalmem();
  const minimumRam = model.hardware.minimumRamBytes;
  if (totalRam < minimumRam) {
    throw new Error(
      `Máy có ${formatMemoryBytes(totalRam)} RAM, thấp hơn mức tối thiểu ${formatMemoryBytes(minimumRam)} ` +
      `của ${model.displayName}. Hãy chọn “Bản Nhanh” 2B hoặc dùng máy có nhiều RAM hơn.`
    );
  }
  const freeRam = os.freemem();
  const estimatedNeed = model.sizeBytes + 768 * 1024 ** 2;
  if (freeRam < estimatedNeed) {
    throw new Error(
      `Máy chỉ còn ${formatMemoryBytes(freeRam)} RAM trống, không đủ để nạp ${model.displayName} ` +
      `(cần khoảng ${formatMemoryBytes(estimatedNeed)}). Hãy đóng bớt ứng dụng hoặc chọn “Bản Nhanh” 2B.`
    );
  }
}
async function getLocalAiModels() {
  const runtimeInstalled = Boolean(await createRuntimeInstaller().getExecutablePath());
  const aiSettings = (await readJson(SETTINGS_FILE(), {})).ai || {};
  const totalRamBytes = os.totalmem();
  const cpus = os.cpus();
  const logicalCpuCount = Math.max(1, cpus.length);
  const cpuModel = cpus.find(cpu => cpu.model)?.model || 'Không nhận diện được tên CPU';
  const detectedGpu = await detectMachineGpu();
  const capabilities = {
    totalRamBytes,
    logicalCpuCount,
    ...(detectedGpu.gpu ? { gpu: detectedGpu.gpu } : {})
  };
  const recommendedModelId = recommendLocalModelId(capabilities);
  return {
    models: await Promise.all(QWEN_LOCAL_MODELS.map(async model => {
      let installed = false;
      try {
        const file = await fs.stat(localModelFilePath(model));
        installed = file.isFile() && file.size === model.sizeBytes;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const summary = summarizeModelSelection(model, capabilities);
      const recommendation = getLocalModelRecommendation(model, capabilities);
      return {
        id: model.id,
        displayName: model.displayName,
        friendlyName: model.friendlyName,
        tagline: model.tagline,
        sizeBytes: model.sizeBytes,
        sha256: model.sha256,
        licenseName: model.licenseName,
        licenseUrl: model.licenseUrl,
        sourceUrl: model.sourceUrl,
        installed,
        selected: (aiSettings.localModelId || QWEN_LOCAL_MODELS[0].id) === model.id,
        minimumRamBytes: model.hardware.minimumRamBytes,
        recommendedRamBytes: model.hardware.recommendedRamBytes,
        recommendedCpuThreads: summary.cpuThreads,
        cpuStatus: recommendation.cpuStatus,
        memoryStatus: recommendation.memoryStatus,
        recommendation: recommendation.status,
        recommendationReason: recommendation.reason,
        supportedLanguages: model.hardware.supportedLanguages,
        expectedResult: model.hardware.expectedResult
      };
    })),
    machine: {
      totalRamBytes,
      logicalCpuCount,
      cpuModel,
      gpuDetectionStatus: detectedGpu.status,
      ...(detectedGpu.message ? { gpuDetectionMessage: detectedGpu.message } : {}),
      ...(detectedGpu.gpu ? { gpu: detectedGpu.gpu } : {}),
      recommendedModelId,
      runtimeInstalled,
      runtimeSupported: process.platform === 'win32' && process.arch === 'x64',
      runtimeState: localAiManager ? localAiManager.getStatus().state : 'STOPPED',
      ...(localAiModelId ? { runtimeModelId: localAiModelId } : {})
    }
  };
}
/**
 * O10: one human-readable .txt the teacher can attach to a message. It holds
 * machine facts plus the last 200 log lines; the lines never include lesson
 * text, prompts, model answers or API keys (see services/ai-log.ts).
 *
 * The file is written to the Desktop (easy to find, attach and delete); if that
 * folder is not writable it falls back to the log folder inside the app data.
 */
async function exportDiagnosticsBundle() {
  const writer = aiLog || createAiLogWriter({ directory: LOG_DIR(), retentionDays: AI_LOG_RETENTION_DAYS });
  const [catalog, aiSettings] = await Promise.all([getLocalAiModels(), readAiSettings()]);
  const cpus = os.cpus();
  const machine = catalog.machine || {};
  const lines = writer.readRecent(200);
  const text = formatDiagnosticBundle({
    generatedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
    cpuModel: machine.cpuModel || cpus[0]?.model || '',
    logicalCpuCount: machine.logicalCpuCount || cpus.length,
    totalRamBytes: machine.totalRamBytes || os.totalmem(),
    models: (catalog.models || []).map(model => ({
      id: model.id,
      displayName: model.displayName,
      installed: Boolean(model.installed)
    })),
    runtime: {
      installed: Boolean(machine.runtimeInstalled),
      state: machine.runtimeState || 'STOPPED',
      modelId: aiSettings.localModelId || machine.runtimeModelId || null
    },
    logDirectory: writer.directory,
    retentionDays: AI_LOG_RETENTION_DAYS
  }, lines);
  let folder = DIAGNOSTICS_EXPORT_DIR();
  let written;
  try {
    written = writeDiagnosticBundle(folder, text, () => new Date(), 'EduGame-Studio-chan-doan');
  } catch (error) {
    folder = writer.directory;
    written = writeDiagnosticBundle(folder, text);
    aiLogWrite('warn', 'diagnostics.export.fallback', { folder, ...errorFacts(error) });
  }
  writer.info('diagnostics.export', { file: written.path, lines: lines.length, bytes: written.bytes });
  return { path: written.path, lines: lines.length, bytes: written.bytes, folder };
}

/** O10: what is currently on disk, so the panel can show it before exporting. */
function diagnosticsSummary() {
  const writer = aiLog || createAiLogWriter({ directory: LOG_DIR(), retentionDays: AI_LOG_RETENTION_DAYS });
  let files = 0;
  let bytes = 0;
  try {
    for (const name of fsSync.readdirSync(writer.directory)) {
      if (!/^(ai-.*\.jsonl|diagnostics-.*\.txt)$/.test(name)) continue;
      files += 1;
      try {
        bytes += fsSync.statSync(path.join(writer.directory, name)).size;
      } catch {
        // A file can disappear between readdir and stat; keep the count.
      }
    }
  } catch {
    // No folder yet: report an empty log.
  }
  return { folder: writer.directory, files, bytes, retentionDays: AI_LOG_RETENTION_DAYS };
}

async function detectMachineGpu() {
  try {
    const info = await app.getGPUInfo('complete');
    const gpuInfo = info && typeof info === 'object' ? info : {};
    const devices = Array.isArray(gpuInfo.devices) ? gpuInfo.devices : [];
    const activeDevice = devices.find(device => device && device.active) || devices[0];
    if (!activeDevice) return { status: 'not-detected' };

    const name = [activeDevice.deviceString, activeDevice.vendorString]
      .filter(value => typeof value === 'string' && value.trim())
      .join(' ')
      .trim();
    const attributes = gpuInfo.auxAttributes && typeof gpuInfo.auxAttributes === 'object'
      ? gpuInfo.auxAttributes
      : {};
    const videoMemoryMb = Number(activeDevice.videoMemoryMB ?? attributes.videoMemoryMB);
    return {
      status: 'detected',
      gpu: {
        name: name || 'GPU đã nhận diện (không có tên chi tiết)',
        ...(Number.isFinite(videoMemoryMb) && videoMemoryMb > 0
          ? { vramBytes: videoMemoryMb * 1024 ** 2 }
          : {})
      }
    };
  } catch (error) {
    return {
      status: 'unavailable',
      message: `Không đọc được thông tin GPU từ hệ thống: ${error.message}`
    };
  }
}
async function ensureLocalRuntime(modelId) {
  const model = getLocalModel(modelId);
  if (localRuntimeStart && localRuntimeStart.modelId === model.id) {
    return localRuntimeStart.promise;
  }
  // A different model is starting: serialize starts instead of racing two
  // llama-server processes against the same port.
  if (localRuntimeStart) {
    try { await localRuntimeStart.promise; } catch { /* its caller reports the failure */ }
  }
  const promise = startLocalRuntimeUnlocked(model.id);
  localRuntimeStart = { modelId: model.id, promise };
  try {
    return await promise;
  } finally {
    if (localRuntimeStart && localRuntimeStart.promise === promise) localRuntimeStart = null;
  }
}

async function startLocalRuntimeUnlocked(modelId) {
  const model = getLocalModel(modelId);
  if (localAiManager && localAiModelId === model.id &&
      localAiManager.getStatus().state === 'READY') {
    return localAiManager.getBaseUrl();
  }
  const modelPath = localModelFilePath(model);
  assertModelFitsMachine(model);
  const runtimeInstaller = createRuntimeInstaller();
  let executablePath = await runtimeInstaller.getExecutablePath();
  if (!executablePath) {
    throw new Error('Runtime llama.cpp chưa được cài trong ứng dụng. Hãy chọn “Cài model” trong phần AI local trước.');
  }
  try {
    await verifyModelFile(modelPath, model);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Model ${model.displayName} chưa được tải. Hãy cài model trong phần AI local trước.`);
    }
    throw new Error(`Không xác minh được model ${model.displayName}: ${error.message}. Hãy cài lại model.`);
  }
  if (localAiManager) {
    const previous = localAiManager;
    localAiManager = undefined;
    localAiModelId = undefined;
    await previous.stop();
  }

  // Repair runtimes installed before the VC++ DLLs were bundled. This must
  // happen after the previous runtime has stopped so the DLLs are not in use.
  await runtimeInstaller.ensureSupportFiles();

  const totalThreads = Math.max(1, os.cpus().length);
  const { resolution } = await resolveRuntimeForThisMachine();
  // 'auto' resolves to CPU on today's measured evidence, but the request is
  // honoured if a caller/config ever selects Vulkan: the entry is real and was
  // verified to run. Keep the CPU retry for that case, because a GPU that
  // cannot start must not cost the teacher the whole app.
  const wantsGpu = resolution.status === 'ok' && resolution.entry.backend === 'vulkan';
  let attempts: string[] = wantsGpu ? ['vulkan', 'cpu'] : ['cpu'];

  // The runtime directory is shared by every backend, so an installed
  // `llama-server.exe` may still be the *other* build. Switching to Vulkan in
  // Settings must replace the CPU files; otherwise `--n-gpu-layers 99` is passed
  // to a binary with no GPU code and nothing is offloaded.
  //
  // This download is reported like a normal install: without progress the
  // window looks frozen for the ~32 MB it takes, and the teacher has no way to
  // tell that the app is doing what they asked for.
  if (resolution.status === 'ok') {
    const wanted = resolution.entry;
    if (!(await runtimeInstaller.matchesBackend(wanted.backend))) {
      const installed = await runtimeInstaller.getInstalledBackend();
      console.info(installed
        ? `Đang thay bản AI local ${installed} bằng ${wanted.backend} theo lựa chọn trong Cài đặt.`
        : `Đang cài bản AI local ${wanted.backend} theo lựa chọn trong Cài đặt.`);
      const sendProgress = progress => {
        if (setupProgressSink) setupProgressSink(progress);
      };
      await runtimeInstaller.install(model.id, sendProgress);
      const now = await runtimeInstaller.getInstalledBackend();
      if (now !== wanted.backend) {
        // Not fatal any more. A backend mismatch used to throw here, which left
        // local AI completely unavailable even when a working CPU build was on
        // disk — the exact "post-install GPU failure bricks AI" report. CPU is
        // the default runtime, so fall back and say so instead of failing.
        //
        // `install()` replaces the whole directory and verifies the archive's
        // SHA-256 before extracting, so an unrecognised layout here means the
        // package is not one this app can run. Only a missing executable makes
        // the mismatch fatal; anything else continues on CPU.
        const executablePresent = Boolean(await runtimeInstaller.getExecutablePath());
        const fallback = resolveBackendAttempts({
          requestedBackends: attempts,
          installedBackend: now,
          executablePresent
        });
        if (fallback.attempts.length === 0) {
          throw new Error(
            `Đã tải xong nhưng thư mục runtime vẫn là bản ${now || 'không rõ'} thay vì ${wanted.backend}. `
            + 'Hãy xoá thư mục runtime trong phần AI local rồi cài lại.'
          );
        }
        aiLog.warn('runtime.backend-swap-failed', {
          wanted: wanted.backend,
          installed: now ?? 'unknown',
          continuation: fallback.attempts.join(',')
        });
        attempts = fallback.attempts;
        console.warn(`Đã tải xong nhưng không nhận ra bản ${wanted.backend} (thấy ${now || 'không rõ'}). `
          + `Ứng dụng tiếp tục chạy AI local trên ${attempts.join(' → ')}.`);
      } else {
        console.info(`Đã cài xong bản AI local ${wanted.backend}.`);
      }
    }
  }

  let lastError;
  for (const backend of attempts) {
    const gpuLayers = backend === 'vulkan' ? VULKAN_GPU_LAYERS : 0;
    const manager = new AIManager({
      executablePath,
      modelPath,
      modelId: model.id,
      contextSize: 8192,
      cpuThreads: resolveCpuThreads(totalThreads, model.hardware.recommendedCpuThreads),
      gpuLayers,
      backend,
      ...(backend === 'vulkan' ? { device: 'Vulkan0' } : {}),
      startupTimeoutMs: 300_000
    });
    localAiManager = manager;
    localAiModelId = model.id;
    // Stop first, then report: disposing a half-started server is housekeeping
    // and must never replace the real startup error with its own.
    let failure;
    try {
      await manager.start();
    } catch (error) {
      failure = error;
    }
    if (!failure) {
      if (backend === 'cpu' && attempts[0] === 'vulkan') {
        // The GPU path was tried and failed. Say so in the diagnostic log too, so
        // a later slowdown is explainable instead of mysterious: `console.warn`
        // alone is invisible in the packaged app.
        const reason = lastError && lastError.message ? lastError.message : String(lastError);
        console.warn('GPU (Vulkan) không khởi động được; đã tự chuyển sang CPU.', reason);
        aiLog.warn('runtime.gpu-fallback', { modelId: model.id, reason: String(reason).slice(0, 500) });
      }
      return manager.getBaseUrl();
    }
    lastError = failure;
    localAiManager = undefined;
    localAiModelId = undefined;
    try { await manager.stop(); } catch { /* best effort: the failed child is already gone */ }
  }
  throw new Error(`Không khởi chạy được model ${model.displayName}: ${lastError && lastError.message ? lastError.message : lastError}`);
}

async function stopLocalAiRuntime() {
  if (localRuntimeStart) {
    try { await localRuntimeStart.promise; } catch { /* start failure is reported to its caller */ }
  }
  if (localEmbeddingStart) {
    try { await localEmbeddingStart.promise; } catch { /* optional retrieval runtime */ }
  }
  const embedding = localEmbeddingRuntime;
  localEmbeddingRuntime = undefined;
  localEmbeddingModelId = undefined;
  if (embedding) {
    try {
      await embedding.stop();
    } catch (error) {
      console.error('Không dừng được máy chủ embedding:', error);
    }
  }
  const manager = localAiManager;
  if (!manager) return;
  await manager.stop();
  if (localAiManager === manager) {
    localAiManager = undefined;
    localAiModelId = undefined;
  }
}

/**
 * First-run AI setup, §11 (docs/archive/specs/update_AI_plan_5.txt).
 *
 * This block is wiring only: it tells `SetupOrchestrator` where files live and
 * which existing functions to call. The sequencing, retry and state logic live
 * in `ai-core/setup-orchestrator.ts`, and the only thing the renderer may
 * choose is a model id (see `ai-core/setup-ipc.ts`).
 */
const SETUP_STATE_FILE = () => path.join(AI_LOCAL_ROOT(), 'setup-state.json');

/**
 * Model first-run setup installs when the renderer does not pin one.
 *
 * This must follow `recommendLocalModelId()` (RAM/CPU), not the catalog's first
 * entry: the Settings → Model page recommends 4B on a 12 GB machine while the
 * catalog's first entry is 2B, so a hard-coded 2B here made the wizard and the
 * settings page disagree about the same computer. A fallback is kept only for the
 * pathological case where the recommendation throws — refusing to set up at all
 * would be worse. That fallback is the catalog's first entry, the lightest model.
 */
async function recommendedSetupModelId(): Promise<string> {
  try {
    const capabilities = { totalRamBytes: os.totalmem(), logicalCpuCount: Math.max(1, os.cpus().length) };
    const detectedGpu = await detectMachineGpu();
    const recommended = recommendLocalModelId(
      detectedGpu.gpu ? { ...capabilities, gpu: detectedGpu.gpu } : capabilities
    );
    if (recommended) return recommended;
    aiLog.warn('runtime.model-recommendation-empty', {});
  } catch (error) {
    // Must stay visible: silently falling back to 2B hides a broken catalog.
    aiLog.warn('runtime.model-recommendation-failed', errorFacts(error));
  }
  return QWEN_LOCAL_MODELS[0].id;
}

let setupOrchestrator = null;
let setupProgressSink = null;

/**
 * Reads the persisted setup state. A corrupt file must never keep the app from
 * starting, so read and parse failures both degrade to "not set up yet".
 */
async function readSetupState() {
  try {
    return parseSetupState(JSON.parse(await fs.readFile(SETUP_STATE_FILE(), 'utf8')));
  } catch {
    return createInitialSetupState();
  }
}

async function writeSetupState(state) {
  await fs.mkdir(AI_LOCAL_ROOT(), { recursive: true });
  await writeJson(SETUP_STATE_FILE(), state);
}

/** True when the model file exists and matches the catalog size. */
async function isModelFileInstalled(model) {
  try {
    const file = await fs.stat(localModelFilePath(model));
    return file.isFile() && file.size === model.sizeBytes;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

/**
 * §3 step 12: prove the freshly started runtime can actually generate before
 * declaring setup complete. This is the one place setup proves itself; a
 * server that started but answers nothing would otherwise look "installed".
 *
 * The request must carry the same local generation options the app uses
 * (`buildGenerationOptions('local', …)`), above all
 * `chat_template_kwargs: { enable_thinking: false }`. Measured on llama.cpp
 * b11681 + Qwen3.5-4B Q4_K_M (and the same on 2B): the chat template thinks by
 * default, so this probe without that flag spent all 8 tokens on
 * `reasoning_content`, returned `content: ""` with `finish_reason: "length"`,
 * and every first-run setup failed with "AI local khởi động nhưng không trả về
 * nội dung thử nghiệm" while the model was in fact working. The token ceiling is
 * kept at 8 because the flag is what makes the answer short, not the budget.
 */
async function runSetupSmokeTest({ baseUrl }) {
  const response = await fetch(`${String(baseUrl).replace(/\/+$/, '')}/health`, {
    method: 'GET',
    signal: AbortSignal.timeout(30_000)
  }).catch(() => {
    throw new Error('Không kết nối được máy chủ AI local vừa khởi động.');
  });
  if (!response.ok) {
    throw new Error(`Máy chủ AI local trả về trạng thái ${response.status} khi kiểm tra.`);
  }
  const completion = await fetch(`${String(baseUrl).replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'local',
      messages: [{ role: 'user', content: 'Trả lời đúng một chữ: OK' }],
      temperature: 0,
      stream: false,
      ...buildGenerationOptions('local', 8)
    }),
    signal: AbortSignal.timeout(120_000)
  }).catch(() => {
    throw new Error('Không gửi được yêu cầu thử nghiệm tới máy chủ AI local.');
  });
  if (!completion.ok) {
    throw new Error(`Máy chủ AI local không trả lời được yêu cầu thử nghiệm (HTTP ${completion.status}).`);
  }
  const body = await completion.json().catch(() => null);
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('AI local khởi động nhưng không trả về nội dung thử nghiệm.');
  }
}

/** Builds the orchestrator once per process, reading the state from disk first. */
async function ensureSetupOrchestrator() {
  if (setupOrchestrator) return setupOrchestrator;
  const initial = await readSetupState();
  const store = new SetupStateStore(initial, state => writeSetupState(state));
  setupOrchestrator = new SetupOrchestrator({
    store,
    detectHardware: () => detectHardware(MODEL_DIR(), { getDiskFreeBytes: diskFreeBytes, getGpuNames: readGpuAdapterNames }),
    getRuntimeExecutablePath: () => createRuntimeInstaller().getExecutablePath(),
    createRuntimeInstaller: () => createRuntimeInstaller(),
    createModelInstaller: () => new ModelInstaller({ modelDirectory: MODEL_DIR() }),
    startRuntime: model => ensureLocalRuntime(model.id),
    stopRuntime: () => stopLocalAiRuntime(),
    runSmokeTest: input => runSetupSmokeTest(input),
    getDiskFreeBytes: diskFreeBytes,
    modelDirectory: MODEL_DIR(),
    isModelInstalled: model => isModelFileInstalled(model),
    onProgress: progress => {
      if (setupProgressSink) setupProgressSink(progress);
    }
  });
  return setupOrchestrator;
}

function registerSetup() {
  registerSetupIpc({
    orchestrator: {
      getStatus: async () => (await ensureSetupOrchestrator()).getStatus(),
      preflight: async options => (await ensureSetupOrchestrator()).preflight(options),
      start: async options => (await ensureSetupOrchestrator()).start(options),
      cancel: () => {
        if (setupOrchestrator) setupOrchestrator.cancel();
      }
    },
    ipcMain,
    defaultModelId: recommendedSetupModelId,
    // Setup installs the build the teacher chose, so re-running the wizard cannot
    // quietly swap a working Vulkan install for the CPU one.
    defaultBackend: readRuntimeBackendPreference,
    setProgressSink: sink => {
      setupProgressSink = sink;
    }
  });
}

/**
 * O4: a dedicated embedding server (mini BERT) that turns chunks and the query
 * into vectors. It is optional: if the model/runtime is missing or fails, the
 * caller falls back to lexical retrieval instead of blocking generation.
 */
function embeddingModelFilePath(model) {
  return path.join(MODEL_DIR(), `${model.id}-${model.version}.gguf`);
}
async function ensureEmbeddingRuntime() {
  const model = getEmbeddingModel();
  if (localEmbeddingRuntime && localEmbeddingModelId === model.id && localEmbeddingRuntime.isReady()) {
    return localEmbeddingRuntime;
  }
  if (localEmbeddingStart && localEmbeddingStart.modelId === model.id) {
    return localEmbeddingStart.promise;
  }
  const promise = startEmbeddingRuntimeUnlocked();
  localEmbeddingStart = { modelId: model.id, promise };
  try {
    return await promise;
  } finally {
    if (localEmbeddingStart && localEmbeddingStart.promise === promise) localEmbeddingStart = null;
  }
}

async function startEmbeddingRuntimeUnlocked() {
  const model = getEmbeddingModel();
  const runtimeInstaller = createRuntimeInstaller();
  const executablePath = await runtimeInstaller.getExecutablePath();
  if (!executablePath) throw new Error('Runtime llama.cpp chưa được cài để chạy bộ đọc hiểu giáo án.');
  await verifyModelFile(embeddingModelFilePath(model), model);
  const previous = localEmbeddingRuntime;
  localEmbeddingRuntime = undefined;
  localEmbeddingModelId = undefined;
  if (previous) {
    try { await previous.stop(); } catch (error) { /* ignored: replacing the process */ }
  }
  await runtimeInstaller.ensureSupportFiles();
  const totalThreads = Math.max(1, os.cpus().length);
  const runtime = createEmbeddingRuntime({
    executablePath,
    modelPath: embeddingModelFilePath(model),
    modelId: model.id,
    dimension: model.dimension,
    pooling: model.pooling,
    contextLength: model.contextLength,
    cpuThreads: resolveCpuThreads(totalThreads, model.hardware.recommendedCpuThreads)
  });
  try {
    await runtime.start();
  } catch (error) {
    try { await runtime.stop(); } catch (stopError) { /* process never became ready */ }
    throw new Error(`Không khởi chạy được bộ đọc hiểu giáo án: ${error.message}`);
  }
  localEmbeddingRuntime = runtime;
  localEmbeddingModelId = model.id;
  return runtime;
}
/**
 * Cached per chunk, so re-opening a lesson or generating a second game type does
 * not re-embed the document. Vectors are keyed by model id; a model change
 * invalidates them (see `lesson-store.listChunkEmbeddings`).
 */
async function embedLessonChunks(store, documentId, chunks) {
  const model = getEmbeddingModel();
  const stored = store.listChunkEmbeddings(documentId, model.id);
  const missing = chunks.filter(chunk => !stored.has(chunk.index));
  if (!missing.length) return stored;
  const runtime = await ensureEmbeddingRuntime();
  const vectors = new Map(stored);
  const batches = chunkTextsForEmbedding(missing, await readEmbeddingBatchSize());
  for (const batch of batches) {
    const embedded = await runtime.embed(batch.map(chunk => embeddingTextForChunk(chunk, model)));
    batch.forEach((chunk, position) => vectors.set(chunk.index, embedded[position]));
  }
  store.saveChunkEmbeddings(documentId, model.id, model.dimension, vectors);
  return vectors;
}

/**
 * #76: validates the teacher's section scope against the stored text and returns
 * the exact prepared input. Throws the same Vietnamese errors the UI already
 * shows, so an unknown/stale/empty selection is a message, never a silent
 * fallback to "analyse the whole document" (§10.12).
 *
 * `mode` only selects the budget (`fast` 12k / `deep` 18k, unchanged).
 */
function prepareSelectionForAnalyze(text, selectedIds, mode) {
  const source = normalizeLessonSource(text ?? '');
  const structure = buildLessonStructure(source);
  const prepared = prepareSelectedLessonText(source, structure, selectedIds, { mode });
  const fingerprint = selectionFingerprint(structure, selectedIds, { maxChars: preprocessBudgetForMode(mode) });
  return {
    text: prepared.text,
    truncated: prepared.truncated,
    fingerprint: fingerprint || '',
    sectionCount: prepared.ranges.filter(range => range.selected).length,
    chars: prepared.chars,
    warnings: prepared.warnings
  };
}

/**
 * Builds the lesson slice sent to the model (O3 retrieval + O4 embeddings).
 *
 * Shared by full generation and by single-item regeneration, so a regenerated
 * question sees exactly the same source material as the draft it belongs to.
 * Retrieval is best-effort: any failure falls back to `lexical-v1` and, with no
 * chunks at all, to the head of the document.
 */
async function buildLessonGenerationContext(store, project, analysis, mode = 'fast') {
  let sourceExcerpt;
  let context = { chunkCount: 0, selectedChunkCount: 0, characters: 0, scorer: 'none', fallback: false };
  if (!project.lesson || !project.lesson.documentId) return { sourceExcerpt, context };
  const document = await store.getDocumentWithText(project.lesson.documentId);
  if (!document || !document.text) return { sourceExcerpt, context };

  // O3: chunk the document once (cached in `lesson_chunks`), then send only the
  // slices that match the topic/objectives instead of the first 6000 characters.
  let chunks = store.listChunks(document.id);
  if (!chunks.length) {
    store.replaceChunks(document.id, chunkLessonText(document.text));
    chunks = store.listChunks(document.id);
  }
  const query = buildRetrievalQuery({ analysis, config: project.config });
  const selectionOptions = mode === 'deep'
    ? { maxChunks: DEEP_MAX_SELECTED_CHUNKS, maxChars: DEEP_MAX_SELECTED_CHARS }
    : { maxChunks: DEFAULT_MAX_SELECTED_CHUNKS, maxChars: DEFAULT_MAX_SELECTED_CHARS };
  // O4: rank by meaning when the embedding model is available and cached;
  // otherwise (model missing, server error, first run offline) keep the lexical
  // ranking. Retrieval quality may drop, generation never blocks.
  let selection;
  try {
    const vectors = await embedLessonChunks(store, document.id, chunks);
    if (vectors.size) {
      const runtime = await ensureEmbeddingRuntime();
      const [queryVector] = await runtime.embed([query]);
      if (queryVector) selection = selectChunksByVectors(chunks, queryVector, vectors, selectionOptions);
    }
  } catch (error) {
    console.warn('Bộ đọc hiểu giáo án không dùng được, tạm dùng truy xuất từ vựng:', error && error.message ? error.message : error);
  }
  if (!selection) selection = selectChunks(chunks, query, selectionOptions);
  sourceExcerpt = selection.selected.length
    ? formatRetrievedChunks(selection.selected)
    : document.text.slice(0, 6000);
  context = {
    chunkCount: chunks.length,
    selectedChunkCount: selection.selected.length,
    characters: sourceExcerpt.length,
    scorer: selection.scorer,
    fallback: selection.fallback
  };
  // #54 follow-up: `selection` is returned so single-item regeneration can narrow
  // the same slice to one item (`selectChunksForItem`) without re-reading the
  // document. Full generation only uses `sourceExcerpt` + `context`.
  return { sourceExcerpt, context, selection };
}

/**
 * O7: coarse progress for the create step (docs/archive/specs/update-AI-local.txt §10). Each
 * call marks a real boundary in the run — there are no timers and no invented
 * stages. Delivery is best-effort: progress must never fail a generation.
 */
function sendLessonProgress(sender, requestId, stage) {
  if (!requestId || !sender) return;
  try {
    if (typeof sender.isDestroyed === 'function' && sender.isDestroyed()) return;
    sender.send('lesson:progress', { requestId, stage });
  } catch (error) {
    // cosmetic only
  }
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, userData: app.getPath('userData') }));
  ipcMain.handle('library:get', async () => readDb());
  ipcMain.handle('library:save-game', async (_e, game) => {
    if (!game || typeof game.title !== 'string' || !Array.isArray(game.questions)) throw new Error('Dữ liệu trò chơi không hợp lệ.');
    validateScenarioGame(game);
    validateMatchingGame(game);
    validateTreasureHuntGame(game);
    validateRaceGame(game);
    const now = new Date().toISOString();
    const normalized = { ...game, id: game.id || id('game'), updatedAt: now, createdAt: game.createdAt || now };
    upsertGameRow(normalized);
    return normalized;
  });
  ipcMain.handle('library:delete-game', async (_e, gameId) => {
    if (sqlite) sqlite.prepare('DELETE FROM games WHERE id = ?').run(String(gameId || ''));
    return { ok: true };
  });
  ipcMain.handle('library:save-session', async (_e, session) => upsertSessionRow(session || {}));
  ipcMain.handle('lesson:save-document', async (_e, payload) => requireLessonStore().saveDocument(payload || {}));
  // #76: offline structure tree for step 1. Pure and local — no AI, no disk, no
  // network — so it is safe to call on every debounced keystroke. Either an
  // already-saved `documentId` or the `text` the teacher is editing.
  ipcMain.handle('lesson:get-structure', async (_e, payload) => {
    const store = requireLessonStore();
    let text = typeof payload?.text === 'string' ? payload.text : null;
    if (text === null && payload?.documentId) {
      const document = await store.getDocumentWithText(String(payload.documentId));
      if (!document) throw new Error('Không tìm thấy giáo án đã lưu. Hãy nhập lại tài liệu.');
      text = document.text || '';
    }
    if (text === null) throw new Error('Thiếu nội dung tài liệu để đọc cấu trúc.');
    return buildLessonStructure(text);
  });
  // #76: the preview the teacher reviews. It runs the *same* preparation the
  // analysis uses, so what is shown cannot drift from what is sent (§4.2/§5.5).
  ipcMain.handle('lesson:preview-selection', async (_e, payload) => {
    const text = String(payload?.text ?? '');
    if (!text.trim()) throw new Error('Thiếu nội dung tài liệu để dựng bản xem trước.');
    const mode = payload?.mode === 'deep' ? 'deep' : 'fast';
    const structure = payload?.structure && typeof payload.structure === 'object'
      ? payload.structure
      : buildLessonStructure(text);
    const selectedIds = Array.isArray(payload?.selectedIds) ? payload.selectedIds.map(id => String(id || '')) : null;
    if (!selectedIds || !selectedIds.length) {
      // No selection = whole document: exactly what `lesson:analyze` sends today.
      return prepareWholeLessonText(text, { mode });
    }
    return prepareSelectedLessonText(text, structure, selectedIds, { mode });
  });
  ipcMain.handle('lesson:get-document', async (_e, documentId) => requireLessonStore().getDocumentWithText(String(documentId || '')));
  ipcMain.handle('lesson:library', async () => requireLessonStore().listDocumentLibrary());
  ipcMain.handle('project:save-draft', async (_e, project) => requireLessonStore().saveProject(project));
  ipcMain.handle('project:get', async (_e, projectId) => requireLessonStore().getProject(String(projectId || '')));
  ipcMain.handle('project:list', async () => requireLessonStore().listProjects());
  ipcMain.handle('project:delete', async (_e, projectId) => ({ ok: requireLessonStore().deleteProject(String(projectId || '')) }));
  ipcMain.handle('lesson:analyze', async (event, payload) => {
    const documentId = String(payload?.documentId || '');
    const requestId = String(payload?.requestId || '');
    if (!documentId) throw new Error('Thiếu mã tài liệu để phân tích.');
    const store = requireLessonStore();
    const document = await store.getDocumentWithText(documentId);
    if (!document) throw new Error('Không tìm thấy giáo án đã lưu. Hãy nhập lại tài liệu.');
    const mode = payload?.mode === 'deep' ? 'deep' : 'fast';
    // O10: the diagnostic log records timing and counts, never the lesson text.
    const analyzeStartedAt = Date.now();
    // #76: the teacher's section scope from step 1, validated against the stored
    // text *before* anything is hashed or sent. No `selectedIds` = whole document,
    // which is the previous behaviour and the previous cache key.
    let selection = null;
    if (Array.isArray(payload?.selectedIds)) {
      selection = prepareSelectionForAnalyze(document.text, payload.selectedIds, mode);
    }
    // O5 (docs/archive/specs/update-AI-local.txt §4): never analyze the same text twice when the
    // document hash, model, mode and prompt version are unchanged. `force` is the
    // teacher's explicit "Phân tích lại" action, and also what a changed lesson
    // produces automatically (different hash → different key).
    const cacheKey = buildAnalysisCacheKey({
      documentSha256: sha256Hex(document.text),
      modelId: await currentChatModelId(),
      mode,
      sourceName: document.name,
      // #76: two different picks on the same document must never share a cached
      // analysis. `undefined` (whole document) leaves the key byte-identical.
      ...(selection ? { selectionFingerprint: selection.fingerprint } : {})
    });
    let analysis = payload?.force ? null : store.findAnalysisByCacheKey(documentId, cacheKey);
    let cached = Boolean(analysis);
    if (!analysis) {
      const task = aiTasks.start({
        taskId: newAiTaskId('analyze'),
        requestId,
        kind: 'analyze',
        projectId: payload?.projectId ? String(payload.projectId) : null,
        documentId,
        label: 'phân tích giáo án'
      });
      recordAiTask(task);
      sendLessonProgress(event.sender, requestId, 'prepare');
      // O6d: offline preprocessing metrics (never the lesson text itself).
      let preprocessMetrics = null;
      lastPromptTokens = null;
      try {
        analysis = await aiSingleFlight.run(
          `analyze:${documentId}:${cacheKey}`,
          'phân tích giáo án',
          async () => {
            const generated = await analyzeLesson({
              client: createLessonChatClient(),
              registry: aiRequests,
              requestId,
              documentId,
              text: document.text,
              sourceName: document.name,
              analysisId: payload?.analysisId ? String(payload.analysisId) : undefined,
              now: new Date().toISOString(),
              // O6d: structure-aware excerpt with a per-mode budget; block ranking
              // stays off until the O6 quality gate passes.
              maxChars: preprocessBudgetForMode(mode),
              // #76: with a scope, the model reads exactly the prepared selection;
              // without one, `analyzeLesson` uses the whole-document excerpt.
              ...(selection ? { preparedSelection: { text: selection.text, truncated: selection.truncated } } : {}),
              onPreprocess: metrics => {
                preprocessMetrics = metrics;
                aiLogWrite('info', 'analyze.preprocess', {
                  documentId,
                  mode,
                  version: metrics.version,
                  ms: metrics.ms,
                  originalChars: metrics.originalChars,
                  cleanedChars: metrics.cleanedChars,
                  excerptChars: metrics.excerptChars,
                  removedControl: metrics.removedControl,
                  removedRepeatedLines: metrics.removedRepeatedLines,
                  truncated: metrics.truncated,
                  excerptReason: metrics.excerptReason,
                  rankingSavingsChars: metrics.rankingSavingsChars,
                  ...(metrics.error ? { error: metrics.error } : {})
                });
              },
              // O6: measured with the smaller 6/8 ask, a ~1,800-character lesson still
              // needed >1,024 tokens (it truncated, then succeeded on the shortened
              // repair). A 2,048 ceiling removes that extra round without costing
              // anything when the model stops earlier on its own.
              maxTokens: mode === 'deep' ? 2560 : 2048,
              onAttempt: attempt => {
                recordAiTask(aiTasks.progress(task.taskId, attempt > 1 ? 'repair' : 'generate'));
                sendLessonProgress(event.sender, requestId, attempt > 1 ? 'repair' : 'generate');
              }
            });
            store.saveAnalysis(generated, { cacheKey });
            sendLessonProgress(event.sender, requestId, 'ready');
            return generated;
          }
        );
        cached = false;
        recordAiTask(aiTasks.complete(task.taskId, `${analysis.objectives.length} mục tiêu · ${analysis.keyConcepts.length} khái niệm`));
        aiLogWrite('info', 'analyze.done', {
          documentId,
          mode,
          cached: false,
          seconds: Math.round((Date.now() - analyzeStartedAt) / 1000),
          objectives: analysis.objectives.length,
          concepts: analysis.keyConcepts.length,
          ...(lastPromptTokens !== null ? { promptTokens: lastPromptTokens } : {}),
          ...(preprocessMetrics ? { excerptChars: preprocessMetrics.excerptChars } : {})
        });
      } catch (error) {
        const code = String((error && error.code) || (error && error.message && /\[([A-Z_]+)\]/.exec(error.message)?.[1]) || 'AI_OUTPUT_INVALID');
        aiLogWrite('error', 'analyze.error', {
          documentId,
          mode,
          cached: false,
          seconds: Math.round((Date.now() - analyzeStartedAt) / 1000),
          ...errorFacts(error)
        });
        if (code === 'AI_CANCELLED' || isCancelReason(error)) {
          recordAiTask(aiTasks.cancel(task.taskId));
        } else {
          recordAiTask(aiTasks.fail(task.taskId, code, error && error.message ? error.message : 'Phân tích thất bại.'));
        }
        throw error;
      }
    }
    if (cached) {
      aiLogWrite('info', 'analyze.done', {
        documentId,
        mode,
        cached: true,
        seconds: Math.round((Date.now() - analyzeStartedAt) / 1000),
        objectives: analysis.objectives.length,
        concepts: analysis.keyConcepts.length
      });
    }
    const identity = { documentId: document.id, name: document.name, characters: document.characters };
    const now = new Date().toISOString();
    let project;
    if (payload?.projectId) {
      const existing = store.getProject(String(payload.projectId));
      if (!existing) throw new Error('Không tìm thấy dự án để cập nhật kết quả phân tích.');
      project = store.saveProject(applyAnalysis(existing, { document: identity, analysis, now }));
    } else {
      project = store.saveProject(createProjectFromAnalysis({ projectId: id('project'), document: identity, analysis, now }));
    }
    return { analysis, project, cached };
  });
  ipcMain.handle('lesson:recommend', async (_e, payload) => {
    const analysisId = String(payload?.analysisId || '');
    if (!analysisId) throw new Error('Thiếu mã phân tích để gợi ý trò chơi.');
    const store = requireLessonStore();
    const analysis = store.getAnalysis(analysisId);
    if (!analysis) throw new Error('Không tìm thấy kết quả phân tích. Hãy phân tích giáo án trước.');
    // Rule-based: no model call, so no requestId/registry entry is needed here.
    // Recommendation ids are globally unique (they are a primary key), so scope
    // them to the analysis: re-running for the same analysis replaces the set.
    const projectId = String(payload?.projectId || '');
    const existing = projectId ? store.getProject(projectId) : null;
    // O12: the suggested count shown on each card already respects the document
    // length and the model the teacher is running, so it matches step 4.
    const recommendations = recommendGamesForAnalysis({
      analysis,
      idPrefix: `rec_${analysis.id}_`,
      now: new Date().toISOString(),
      documentCharacters: existing && existing.lesson ? existing.lesson.characters : 0,
      modelId: await currentChatModelId(),
      mode: payload?.mode === 'deep' ? 'deep' : 'fast'
    });
    store.saveRecommendations(analysis.id, recommendations);
    const project = existing
      ? store.saveProject(advanceAfterRecommendations(existing, new Date().toISOString()))
      : null;
    return { recommendations, project };
  });
  // O12: predict how many items the document + analysis + model can support.
  // Advisory and deterministic — no AI call, no writes.
  ipcMain.handle('lesson:capacity', async (_e, payload) => {
    const projectId = String(payload?.projectId || '');
    if (!projectId) throw new Error('Thiếu mã dự án để ước lượng số lượng nội dung.');
    const gameType = String(payload?.gameType || '');
    if (!WORKFLOW_GAME_TYPES.includes(gameType)) throw new Error('Thể loại trò chơi không hợp lệ.');
    const store = requireLessonStore();
    const project = store.getProject(projectId);
    if (!project) throw new Error('Không tìm thấy dự án. Hãy lưu dự án trước khi cấu hình.');
    const analysis = project.analysisId ? store.getAnalysis(project.analysisId) : null;
    return estimateItemCapacity({
      gameType,
      documentCharacters: project.lesson ? project.lesson.characters : 0,
      objectiveCount: analysis ? analysis.objectives.length : 0,
      conceptCount: analysis ? analysis.keyConcepts.length : 0,
      modelId: await currentChatModelId(),
      mode: payload?.mode === 'deep' ? 'deep' : 'fast'
    });
  });
  ipcMain.handle('lesson:get-analysis', async (_e, analysisId) => requireLessonStore().getAnalysis(String(analysisId || '')));
  ipcMain.handle('lesson:save-analysis', async (_e, analysis) => requireLessonStore().saveAnalysis(analysis));
  ipcMain.handle('lesson:recommendations', async (_e, analysisId) => requireLessonStore().listRecommendations(String(analysisId || '')));
  // P6: turn a configured project into real game content (fast/deep) and attach
  // the validated game snapshot. The teacher reviews/edits it in the editor next.
  ipcMain.handle('lesson:generate', async (event, payload) => {
    const projectId = String(payload?.projectId || '');
    const requestId = String(payload?.requestId || '');
    if (!projectId) throw new Error('Thiếu mã dự án để tạo nội dung.');
    const store = requireLessonStore();
    const project = store.getProject(projectId);
    if (!project) throw new Error('Không tìm thấy dự án. Hãy lưu dự án trước khi tạo nội dung.');
    if (!project.config) throw new Error('Dự án chưa có cấu hình trò chơi. Hãy hoàn tất bước cấu hình.');
    if (!project.analysisId) throw new Error('Dự án chưa có kết quả phân tích giáo án.');
    const analysis = store.getAnalysis(project.analysisId);
    if (!analysis) throw new Error('Không tìm thấy kết quả phân tích giáo án. Hãy phân tích lại.');

    const mode = payload?.mode === 'deep' ? 'deep' : project.config.generationMode === 'deep' ? 'deep' : 'fast';
    const modelId = await currentChatModelId();
    // O5 cache key: lesson + analysis content + genre + config + model + prompt
    // version. Any change to one of those misses the cache (and the AI is called).
    const cacheKey = buildGenerationCacheKey({
      documentId: project.lesson ? project.lesson.documentId : '',
      analysisFingerprint: analysisFingerprint(analysis),
      gameType: project.config.gameType,
      configFingerprint: configFingerprint(project.config),
      modelId,
      mode
    });
    // §9: a second press of "Tạo nội dung" with identical inputs reuses the stored
    // draft. Check the cache before retrieval/embedding so a cache hit does no
    // model work at all (and is not blocked by an unrelated in-flight AI job).
    // "Tạo lại" (`regenerate: true`) always calls the model, because the teacher
    // explicitly asked for different content.
    if (!payload?.regenerate) {
      const cachedEntry = store.getGenerationCache(cacheKey);
      if (cachedEntry) {
        try {
          // Re-run the adapter instead of trusting the stored snapshot: it is the
          // single conversion boundary and may have changed since the cache write.
          const cachedDraft = parseGameDraft(cachedEntry.payload.draft);
          const cachedGame = toEducationalGame({ ...project, draft: cachedDraft });
          const cachedSaved = store.saveProject(applyDraft(project, {
            draft: cachedDraft,
            game: cachedGame,
            now: new Date().toISOString()
          }));
          const cachedQuality = checkDraftQuality({ draft: cachedDraft, config: project.config, analysis });
          // O7: a cache hit did no generation/validation work; say so instead of
          // showing stages that never ran.
          sendLessonProgress(event.sender, requestId, 'cached');
          aiLogWrite('info', 'generate.cached', {
            projectId,
            gameType: project.config.gameType,
            mode,
            modelId,
            requested: cachedQuality.counts.requested,
            found: cachedQuality.counts.found
          });
          return {
            project: cachedSaved,
            game: cachedGame,
            mode,
            quality: cachedQuality,
            context: cachedEntry.payload.context || null,
            cached: true
          };
        } catch (error) {
          // A row written by an older schema/adapter must never block generation.
          console.warn('Bộ nhớ đệm nội dung không dùng được, tạo mới:', error && error.message ? error.message : error);
          store.deleteGenerationCache(cacheKey);
        }
      }
    }

    const generateTask = aiTasks.start({
      taskId: newAiTaskId('generate'),
      requestId,
      kind: 'generate',
      projectId,
      documentId: project.lesson ? project.lesson.documentId : null,
      label: `tạo nội dung ${project.config.gameType}`
    });
    recordAiTask(generateTask);
    // O10: counts/timings only — enough to diagnose a short draft without storing content.
    const generateStartedAt = Date.now();
    const generateRequest = requestedItemCount(project.config);
    let generateAttempts = 0;
    aiLogWrite('info', 'generate.start', {
      projectId,
      gameType: project.config.gameType,
      mode,
      modelId,
      requested: generateRequest.requested,
      unit: generateRequest.unit,
      regenerate: Boolean(payload?.regenerate)
    });
    try {
      return await aiSingleFlight.run(
        `generate:${projectId}:${cacheKey}`,
        `tạo nội dung ${project.config.gameType}`,
        async () => {
          recordAiTask(aiTasks.progress(generateTask.taskId, 'retrieve'));
          sendLessonProgress(event.sender, requestId, 'retrieve');
          const { sourceExcerpt, context } = await buildLessonGenerationContext(store, project, analysis, mode);
          const draft = await generateGameDraft({
            client: createLessonChatClient(),
            registry: aiRequests,
            requestId,
            gameType: project.config.gameType,
            config: project.config,
            analysis,
            sourceExcerpt,
            maxTokens: mode === 'deep' ? 4096 : 2048,
            onAttempt: attempt => {
              generateAttempts = attempt;
              aiLogWrite('info', 'generate.attempt', { projectId, attempt });
              recordAiTask(aiTasks.progress(generateTask.taskId, attempt === 1 ? 'generate' : 'repair'));
              sendLessonProgress(event.sender, requestId, attempt === 1 ? 'generate' : 'repair');
            },
            onIncomplete: info => {
              aiLogWrite('warn', 'generate.incomplete', { projectId, ...info });
            }
          });

          // The adapter is the only place that builds `EducationalGame`; it also runs
          // the existing per-template validators, so invalid content is caught here.
          recordAiTask(aiTasks.progress(generateTask.taskId, 'validate'));
          sendLessonProgress(event.sender, requestId, 'validate');
          let game;
          try {
            game = toEducationalGame({ ...project, draft });
          } catch (error) {
            throw new Error(`[GENERATION_INVALID] ${error && error.message ? error.message : 'Nội dung AI tạo ra chưa hợp lệ.'}`);
          }
          const saved = store.saveProject(applyDraft(project, { draft, game, now: new Date().toISOString() }));
          // O2: advisory content-quality report (duplicates, weak distractors, broken
          // chains, coverage). Pure TypeScript, so it costs nothing here.
          const quality = checkDraftQuality({ draft, config: project.config, analysis });
          aiLogWrite('info', 'generate.done', {
            projectId,
            gameType: project.config.gameType,
            mode,
            modelId,
            seconds: Math.round((Date.now() - generateStartedAt) / 1000),
            attempts: generateAttempts,
            requested: quality.counts.requested,
            found: quality.counts.found,
            unit: quality.counts.unit,
            errors: quality.errors,
            warnings: quality.warnings,
            canPublish: quality.canPublish,
            cached: false
          });
          // Best effort: a cache write must never fail the generation the teacher waited for.
          try {
            store.putGenerationCache({
              cacheKey,
              kind: 'draft',
              gameType: project.config.gameType,
              analysisId: project.analysisId,
              modelId,
              promptVersion: `draft-v${LESSON_PROMPT_VERSIONS.draft}`,
              payload: { draft, mode, context }
            });
            store.pruneGenerationCache(50);
          } catch (error) {
            console.warn('Không lưu được bộ nhớ đệm nội dung:', error && error.message ? error.message : error);
          }
          sendLessonProgress(event.sender, requestId, 'ready');
          recordAiTask(aiTasks.complete(generateTask.taskId, `${project.config.gameType} · ${mode}`));
          return { project: saved, game, mode, quality, context, cached: false };
        }
      );
    } catch (error) {
      const code = String((error && error.code) || (error && error.message && /\[([A-Z_]+)\]/.exec(error.message)?.[1]) || 'AI_OUTPUT_INVALID');
      if (code === 'AI_CANCELLED' || isCancelReason(error)) {
        recordAiTask(aiTasks.cancel(generateTask.taskId));
      } else {
        recordAiTask(aiTasks.fail(generateTask.taskId, code, error && error.message ? error.message : 'Tạo nội dung thất bại.'));
      }
      aiLogWrite('error', 'generate.error', {
        projectId,
        gameType: project.config.gameType,
        mode,
        seconds: Math.round((Date.now() - generateStartedAt) / 1000),
        attempts: generateAttempts,
        cancelled: code === 'AI_CANCELLED' || isCancelReason(error),
        ...errorFacts(error)
      });
      throw error;
    }
  });
  // O2: recompute the advisory report when a draft is reopened (no model call).
  ipcMain.handle('lesson:quality', async (_e, payload) => {
    const projectId = String(payload?.projectId || '');
    if (!projectId) return null;
    const store = requireLessonStore();
    const project = store.getProject(projectId);
    if (!project || !project.draft) return null;
    const analysis = project.analysisId ? store.getAnalysis(project.analysisId) : null;
    return checkDraftQuality({ draft: project.draft, config: project.config, analysis });
  });
  // Phase B (DECISIONS #72): change the artwork of ONE item, no model involved.
  //
  // Deliberately narrow: this channel can only touch `contentCategory`,
  // `iconName` and `illustrationAssetId` of one item (whitelist enforced inside
  // `applyItemAssetPatch`), so it cannot be used to rewrite a question, an
  // answer or an id. It also never calls the AI stack — a teacher picking a
  // picture must not cost tokens, wait on a model, or fail when offline.
  //
  // The adapter still runs: it is the single conversion boundary, and a draft
  // that cannot be adapted must not be saved (the same rule as regeneration).
  ipcMain.handle('lesson:patch-item-assets', async (_e, payload) => {
    const projectId = String(payload?.projectId || '');
    if (!projectId) throw new Error('Thiếu mã dự án để đổi minh hoạ.');
    const position = Number(payload?.itemIndex);
    const patch = payload?.patch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('Thiếu thông tin minh hoạ cần đổi.');
    }
    const applied = applyItemAssetPatch({}, patch);
    if (!applied.changed) {
      throw new Error('Không có trường minh hoạ nào được gửi lên. Chỉ đổi được chủ đề, biểu tượng và hình minh hoạ.');
    }
    const store = requireLessonStore();
    const project = store.getProject(projectId);
    if (!project) throw new Error('Không tìm thấy dự án. Hãy lưu dự án trước khi đổi minh hoạ.');
    if (!project.draft) throw new Error('Dự án chưa có nội dung. Hãy tạo nội dung trước khi đổi minh hoạ.');
    if (!project.config) throw new Error('Dự án chưa có cấu hình trò chơi. Hãy hoàn tất bước cấu hình.');
    if (project.draft.gameType !== project.config.gameType) {
      throw new Error('[GENERATION_INVALID] Nội dung hiện tại không khớp thể loại đã chọn. Hãy tạo lại toàn bộ nội dung.');
    }

    let draft;
    try {
      draft = patchDraftItemAssets(project.draft, position, patch);
    } catch (error) {
      throw new Error(error && error.message ? error.message : 'Không đổi được minh hoạ cho mục này.');
    }
    let game;
    try {
      game = toEducationalGame({ ...project, draft });
    } catch (error) {
      throw new Error(`[GENERATION_INVALID] ${error && error.message ? error.message : 'Nội dung sau khi đổi minh hoạ chưa hợp lệ.'}`);
    }
    const saved = store.saveProject(applyDraft(project, { draft, game, now: new Date().toISOString() }));
    return { project: saved, game, itemIndex: position, applied: applied.applied };
  });
  // O5: rewrite exactly one item (docs/archive/specs/update-AI-local.txt §5.5). Everything else
  // in the draft is preserved; ids and links stay app-owned (lesson-item-repair).
  ipcMain.handle('lesson:regenerate-item', async (event, payload) => {
    const projectId = String(payload?.projectId || '');
    const requestId = String(payload?.requestId || '');
    if (!projectId) throw new Error('Thiếu mã dự án để tạo lại nội dung.');
    if (!requestId) throw new Error('Thiếu mã yêu cầu AI.');
    const store = requireLessonStore();
    const project = store.getProject(projectId);
    if (!project) throw new Error('Không tìm thấy dự án. Hãy lưu dự án trước khi tạo lại nội dung.');
    if (!project.config) throw new Error('Dự án chưa có cấu hình trò chơi. Hãy hoàn tất bước cấu hình.');
    if (!project.draft) throw new Error('Dự án chưa có nội dung để tạo lại. Hãy tạo nội dung trước.');
    if (!project.analysisId) throw new Error('Dự án chưa có kết quả phân tích giáo án.');
    if (project.draft.gameType !== project.config.gameType) {
      throw new Error('[GENERATION_INVALID] Nội dung hiện tại không khớp thể loại đã chọn. Hãy tạo lại toàn bộ nội dung.');
    }
    const analysis = store.getAnalysis(project.analysisId);
    if (!analysis) throw new Error('Không tìm thấy kết quả phân tích giáo án. Hãy phân tích lại.');

    const qualityBefore = checkDraftQuality({ draft: project.draft, config: project.config, analysis });
    const requested = Array.isArray(payload?.itemIndexes)
      ? payload.itemIndexes.map(value => Number(value))
      : [Number(payload?.itemIndex)];
    // No explicit position: the teacher asked to fix the items the quality report
    // flagged (the "Tạo lại các câu lỗi" path).
    const indexes = resolveItemIndexes(project.draft, requested, qualityBefore);
    if (!indexes.length) {
      throw new Error('Không xác định được mục cần tạo lại. Hãy chọn một mục cụ thể.');
    }
    const issuesByIndex = new Map();
    for (const issue of qualityBefore.issues) {
      if (!issue.itemIndex) continue;
      const list = issuesByIndex.get(issue.itemIndex) || [];
      list.push(issue.message);
      issuesByIndex.set(issue.itemIndex, list);
    }

    const mode = project.config.generationMode === 'deep' ? 'deep' : 'fast';
    const regenTask = aiTasks.start({
      taskId: newAiTaskId('regen'),
      requestId,
      kind: 'regenerate-item',
      projectId,
      documentId: project.lesson ? project.lesson.documentId : null,
      label: `tạo lại ${indexes.length} mục ${project.draft.gameType}`
    });
    recordAiTask(regenTask);
    try {
      return await aiSingleFlight.run(
        `regenerate:${projectId}:${indexes.join(',')}:${project.draft.gameType}`,
        'tạo lại một mục nội dung',
        async () => {
          recordAiTask(aiTasks.progress(regenTask.taskId, 'retrieve'));
          sendLessonProgress(event.sender, requestId, 'retrieve');
          const { sourceExcerpt, context, selection } = await buildLessonGenerationContext(store, project, analysis, mode);
          const total = itemCount(project.draft);
          let draft = project.draft;
          let itemsNarrowed = 0;
          for (const position of indexes) {
            // One model call per item: §5.5 keeps failing items isolated so the passing
            // ones are never regenerated (and never change). `handle.done()` frees the
            // requestId between items, so the same id can be reused sequentially.
            // #54 follow-up: an item usually needs only the passage it paraphrases, so
            // send the item-scoped slice when one section clearly dominates the item
            // (measured: the full slice makes one regeneration cost 2.2–2.8× the whole
            // lesson analysis). Multi-section items keep the full slice, because a
            // missing source chunk costs correctness and extra prefill only costs time.
            const currentItem = itemAt(draft, position);
            const itemSelection = selectChunksForItem(selection, {
              reference: currentItem ? JSON.stringify(currentItem) : ''
            });
            const itemExcerpt = itemSelection.selected.length ? formatRetrievedChunks(itemSelection.selected) : sourceExcerpt;
            if (itemExcerpt !== sourceExcerpt) itemsNarrowed += 1;
            const item = await regenerateGameItem({
              client: createLessonChatClient(),
              registry: aiRequests,
              requestId,
              gameType: project.config.gameType,
              config: project.config,
              analysis,
              position,
              total,
              itemLabel: itemLabel(project.config.gameType, position),
              currentItem,
              issues: issuesByIndex.get(position) || [],
              sourceExcerpt: itemExcerpt,
              maxTokens: mode === 'deep' ? 1536 : 1024,
              onAttempt: attempt => {
                recordAiTask(aiTasks.progress(regenTask.taskId, attempt === 1 ? 'generate' : 'repair'));
                sendLessonProgress(event.sender, requestId, attempt === 1 ? 'generate' : 'repair');
              }
            });
            try {
              draft = replaceDraftItem(draft, position, item);
            } catch (error) {
              throw new Error(`[GENERATION_INVALID] ${itemLabel(project.config.gameType, position)} mới chưa hợp lệ: ${error && error.message ? error.message : 'không đọc được nội dung AI trả về.'}`);
            }
          }

          // The adapter stays the single conversion boundary and runs the legacy
          // validators; a failed adapter must not overwrite the project.
          recordAiTask(aiTasks.progress(regenTask.taskId, 'validate'));
          sendLessonProgress(event.sender, requestId, 'validate');
          let game;
          try {
            game = toEducationalGame({ ...project, draft });
          } catch (error) {
            throw new Error(`[GENERATION_INVALID] ${error && error.message ? error.message : 'Nội dung mới chưa hợp lệ.'}`);
          }
          const saved = store.saveProject(applyDraft(project, { draft, game, now: new Date().toISOString() }));
          const quality = checkDraftQuality({ draft, config: project.config, analysis });
          sendLessonProgress(event.sender, requestId, 'ready');
          recordAiTask(aiTasks.complete(regenTask.taskId, `${indexes.length} mục ${project.config.gameType}`));
          return { project: saved, game, quality, context, mode, itemIndexes: indexes, cached: false, itemContext: { items: indexes.length, narrowed: itemsNarrowed } };
        }
      );
    } catch (error) {
      const code = String((error && error.code) || (error && error.message && /\[([A-Z_]+)\]/.exec(error.message)?.[1]) || 'AI_OUTPUT_INVALID');
      if (code === 'AI_CANCELLED' || isCancelReason(error)) {
        recordAiTask(aiTasks.cancel(regenTask.taskId));
      } else {
        recordAiTask(aiTasks.fail(regenTask.taskId, code, error && error.message ? error.message : 'Tạo lại mục thất bại.'));
      }
      throw error;
    }
  });
  ipcMain.handle('lesson:answer-question', async (_e, payload) => {
    const documentId = String(payload?.documentId || '');
    const question = String(payload?.question || '').trim();
    if (!documentId) throw new Error('Thiếu mã tài liệu để hỏi đáp.');
    if (question.length < 3) throw new Error('Câu hỏi quá ngắn.');
    const store = requireLessonStore();
    const document = await store.getDocumentWithText(documentId);
    if (!document) throw new Error('Không tìm thấy giáo án đã lưu. Hãy nhập lại tài liệu.');
    const { selectRelevantEvidence } = require('./ai-core/document-assist');
    const citations = selectRelevantEvidence(document.text, question, 4);
    let answer = '';
    try {
      const client = createLessonChatClient();
      const result = await client.chatJson({
        messages: [
          { role: 'system', content: 'Bạn là trợ lý giáo dục. Chỉ trả lời dựa trên các đoạn trích dẫn được cung cấp. Nếu không đủ thông tin, nói rõ không đủ dữ liệu. Trả lời ngắn gọn bằng tiếng Việt.' },
          { role: 'user', content: `Câu hỏi: ${question}\n\nĐoạn trích:\n${citations.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')}\n\nTrả về JSON: {"answer":"..."}` }
        ],
        maxTokens: 512,
        responseSchema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] }
      });
      answer = String(result && result.answer ? result.answer : '').trim();
    } catch (error) {
      answer = citations.length
        ? 'AI local chưa sẵn sàng. Các đoạn liên quan được trích dẫn bên dưới.'
        : 'Không tìm thấy đoạn liên quan trong giáo án.';
    }
    if (!answer) {
      answer = citations.length
        ? 'Không có câu trả lời tự động; xem các trích dẫn bên dưới.'
        : 'Không tìm thấy đoạn liên quan trong giáo án.';
    }
    return { answer, citations };
  });
  ipcMain.handle('files:import-document', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Chọn giáo án hoặc tài liệu',
      properties: ['openFile'],
      filters: [
        { name: 'Tài liệu hỗ trợ', extensions: ['txt', 'md', 'docx', 'pdf', 'pptx'] },
        { name: 'Tất cả tệp', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    const buffer = await fs.readFile(filePath);
    let text = '';
    if (ext === '.txt' || ext === '.md') text = buffer.toString('utf8');
    else if (ext === '.docx') {
      const parsed = await mammoth.extractRawText({ buffer });
      text = parsed.value || '';
    } else if (ext === '.pdf') {
      const parsed = await pdfParse(buffer);
      text = parsed.text || '';
    } else if (ext === '.pptx') {
      const zip = await JSZip.loadAsync(buffer);
      const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b) => {
        const na = Number(a.match(/slide(\d+)/)[1]), nb = Number(b.match(/slide(\d+)/)[1]); return na - nb;
      });
      const chunks = [];
      for (const slide of slides) {
        const xml = await zip.files[slide].async('text');
        const words = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"'));
        if (words.length) chunks.push(words.join(' '));
      }
      text = chunks.join('\n\n');
    } else throw new Error('Định dạng này chưa được hỗ trợ.');
    return { name: path.basename(filePath), path: filePath, text: text.trim().slice(0, 120000), characters: text.length };
  });
  ipcMain.handle('files:import-document-from-path', async (_e, filePath) => {
    const target = String(filePath || '').trim();
    if (!target) return null;
    const ext = path.extname(target).toLowerCase();
    if (!['.txt', '.md', '.docx', '.pdf', '.pptx'].includes(ext)) throw new Error('Định dạng này chưa được hỗ trợ.');
    const buffer = await fs.readFile(target);
    let text = '';
    if (ext === '.txt' || ext === '.md') text = buffer.toString('utf8');
    else if (ext === '.docx') {
      const parsed = await mammoth.extractRawText({ buffer });
      text = parsed.value || '';
    } else if (ext === '.pdf') {
      const parsed = await pdfParse(buffer);
      text = parsed.text || '';
    } else if (ext === '.pptx') {
      const zip = await JSZip.loadAsync(buffer);
      const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b) => {
        const na = Number(a.match(/slide(\d+)/)[1]), nb = Number(b.match(/slide(\d+)/)[1]); return na - nb;
      });
      const chunks = [];
      for (const slide of slides) {
        const xml = await zip.files[slide].async('text');
        const words = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"'));
        if (words.length) chunks.push(words.join(' '));
      }
      text = chunks.join('\n\n');
    }
    return { name: path.basename(target), path: target, text: text.trim().slice(0, 120000), characters: text.length, sizeBytes: buffer.length };
  });

  ipcMain.handle('files:import-questions', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Nhập câu hỏi từ bảng tính',
      properties: ['openFile'],
      filters: [{ name: 'Bảng câu hỏi', extensions: ['csv', 'tsv', 'xlsx'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const questions = await importQuestionsFromFile(path.basename(filePath), await fs.readFile(filePath));
    return { name: path.basename(filePath), questions };
  });
  ipcMain.handle('files:export-game', async (_e, game) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Xuất gói trò chơi',
      defaultPath: `${(game.title || 'tro-choi').replace(/[\\/:*?"<>|]/g, '-').slice(0,60)}.egame`,
      filters: [{ name: 'EduGame package', extensions: ['egame', 'json'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, JSON.stringify({ packageFormat: 'edugame', packageVersion: 1, game }, null, 2), 'utf8');
    return { ok: true, path: result.filePath };
  });
  // The ⛶ button in gameplay must work on any page, before any game has been
  // imported. This handler used to be nested inside files:import-game, so it
  // was only registered after an import (and the second import threw
  // "Attempted to register a second handler").
  ipcMain.handle('window:set-fullscreen', (_e, enabled) => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
    mainWindow.setFullScreen(Boolean(enabled));
    return { ok: true };
  });
  ipcMain.handle('files:import-game', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Nhập trò chơi', properties: ['openFile'], filters: [{ name: 'EduGame package', extensions: ['egame', 'json'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const raw = JSON.parse(await fs.readFile(result.filePaths[0], 'utf8'));
    const game = raw.game || raw;
    if (!game || typeof game.title !== 'string' || !Array.isArray(game.questions)) throw new Error('Tệp không phải gói trò chơi hợp lệ.');
    validateScenarioGame(game);
    validateMatchingGame(game);
    validateTreasureHuntGame(game);
    validateRaceGame(game);
    game.id = id('imported');
    return game;
  });
  ipcMain.handle('settings:get', async () => {
    const settings = await readJson(SETTINGS_FILE(), {});
    let apiKey = '';
    if (settings.ai?.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
      try { apiKey = safeStorage.decryptString(Buffer.from(settings.ai.apiKeyEncrypted, 'base64')); } catch {}
    }
    return { ...settings, ai: { ...settings.ai, apiKey } };
  });
  ipcMain.handle('settings:save', async (_e, settings) => {
    const safe = JSON.parse(JSON.stringify(settings || {}));
    const key = safe.ai?.apiKey || '';
    if (safe.ai) {
      if (key && safeStorage.isEncryptionAvailable()) safe.ai.apiKeyEncrypted = safeStorage.encryptString(key).toString('base64');
      else safe.ai.apiKeyEncrypted = '';
      delete safe.ai.apiKey;
    }
    await writeJson(SETTINGS_FILE(), safe);
    return { ok: true };
  });
  ipcMain.handle('ai:local-models', async () => getLocalAiModels());
  ipcMain.handle('ai:local-status', async () => {
    if (!localAiManager) return { state: 'STOPPED' };
    const status = localAiManager.getStatus();
    return { state: status.state, ...(localAiModelId ? { modelId: localAiModelId } : {}), ...(status.message ? { message: status.message } : {}) };
  });
  ipcMain.handle('ai:install-local-model', async (event, modelId) => {
    const model = getLocalModel(String(modelId || ''));
    if (localModelInstallInProgress) {
      throw new Error('Đang cài một model AI khác. Vui lòng chờ hoàn tất rồi thử lại.');
    }
    localModelInstallInProgress = true;
    const sendProgress = progress => {
      if (!event.sender.isDestroyed()) event.sender.send('ai:local-progress', progress);
    };
    try {
      // Install exactly the build the resolver picked for this machine; the
      // installer's default artifact is the CPU zip, which would silently
      // defeat GPU offload on an iGPU machine.
      const { resolution } = await resolveRuntimeForThisMachine();
      const entry = resolution.status === 'ok' ? resolution.entry : undefined;
      const runtimeInstaller = createRuntimeInstaller(entry);
      // Compare the *build*, not just the presence of the file: a teacher who
      // switched to Vulkan already has a CPU `llama-server.exe` on disk.
      const backendWanted = entry ? entry.backend : 'cpu';
      if (await runtimeInstaller.matchesBackend(backendWanted)) {
        await runtimeInstaller.ensureSupportFiles();
      } else {
        await runtimeInstaller.install(model.id, sendProgress);
      }
      const installer = new ModelInstaller({
        modelDirectory: MODEL_DIR()
      });
      await installer.install(model, progress => sendProgress({
        stage: 'model',
        modelId: model.id,
        ...progress
      }));
      // O4: install the small retrieval model (131 MB) with the same click. The
      // chat model id is reused for progress so the existing progress bar keeps
      // moving; a failure here only degrades retrieval to lexical scoring, so it
      // must never fail the chat model install.
      try {
        const embeddingModel = getEmbeddingModel();
        await installer.install(embeddingModel, progress => sendProgress({
          stage: 'model',
          modelId: model.id,
          ...progress
        }));
      } catch (error) {
        console.warn('Không cài được bộ đọc hiểu giáo án (sẽ dùng truy xuất từ vựng):', error && error.message ? error.message : error);
      }
      const settings = await readJson(SETTINGS_FILE(), {});
      settings.ai = { ...settings.ai, mode: 'local', localModelId: model.id };
      await writeJson(SETTINGS_FILE(), settings);
      return { ok: true, models: await getLocalAiModels() };
    } finally {
      localModelInstallInProgress = false;
    }
  });
  ipcMain.handle('ai:start-local-runtime', async (event, modelId) => {
    if (aiSingleFlight.busy) {
      throw new Error(`[AI_BUSY] AI local đang xử lý “${aiSingleFlight.activeLabel}”. Hãy đợi hoặc huỷ yêu cầu hiện tại trước khi đổi/khởi động lại model.`);
    }
    const model = getLocalModel(String(modelId || ''));
    const executablePath = await createRuntimeInstaller().getExecutablePath();
    if (!executablePath) {
      throw new Error('Runtime llama.cpp chưa được tải. Hãy tải model và runtime trước khi bắt đầu chạy.');
    }
    if (localAiManager && localAiModelId === model.id &&
        localAiManager.getStatus().state === 'READY') {
      const settings = await readJson(SETTINGS_FILE(), {});
      settings.ai = { ...settings.ai, mode: 'local', localModelId: model.id };
      await writeJson(SETTINGS_FILE(), settings);
      aiLogWrite('info', 'runtime.reuse', { modelId: model.id, state: localAiManager.getStatus().state });
      return { ok: true, baseUrl: localAiManager.getBaseUrl(), models: await getLocalAiModels() };
    }
    if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('ai:local-progress', { stage: 'starting', modelId: model.id, receivedBytes: 0, totalBytes: 1, bytesPerSecond: 0 });
    }
    const runtimeStartedAt = Date.now();
    aiLogWrite('info', 'runtime.start', { modelId: model.id });
    try {
      const baseUrl = await ensureLocalRuntime(model.id);
      const settings = await readJson(SETTINGS_FILE(), {});
      settings.ai = { ...settings.ai, mode: 'local', localModelId: model.id };
      await writeJson(SETTINGS_FILE(), settings);
      aiLogWrite('info', 'runtime.ready', {
        modelId: model.id,
        seconds: Math.round((Date.now() - runtimeStartedAt) / 1000)
      });
      return { ok: true, baseUrl, models: await getLocalAiModels() };
    } catch (error) {
      aiLogWrite('error', 'runtime.error', {
        modelId: model.id,
        seconds: Math.round((Date.now() - runtimeStartedAt) / 1000),
        ...errorFacts(error)
      });
      throw new Error(error.message || 'Không khởi động được llama.cpp.');
    }
  });
  ipcMain.handle('ai:stop-local-runtime', async () => {
    if (aiSingleFlight.busy) {
      throw new Error(`[AI_BUSY] AI local đang xử lý “${aiSingleFlight.activeLabel}”. Hãy huỷ yêu cầu hiện tại trước khi dừng runtime.`);
    }
    const stoppedModelId = localAiModelId || null;
    await stopLocalAiRuntime();
    aiLogWrite('info', 'runtime.stop', { modelId: stoppedModelId });
    return { ok: true, models: await getLocalAiModels() };
  });
  // O10: teacher-facing diagnostics. The exported .txt is written to the Desktop
  // (fallback: the log folder); nothing is uploaded and no lesson/AI content is included.
  ipcMain.handle('diagnostics:export', async () => exportDiagnosticsBundle());
  ipcMain.handle('diagnostics:info', async () => diagnosticsSummary());
  ipcMain.handle('diagnostics:clear', async () => {
    const writer = aiLog || createAiLogWriter({ directory: LOG_DIR(), retentionDays: AI_LOG_RETENTION_DAYS });
    const result = clearAiLogs(writer.directory);
    // Leave one fresh line so the next export shows that the clear happened.
    writer.info('diagnostics.clear', { removed: result.removed, bytes: result.bytes });
    return { removed: result.removed, bytes: result.bytes, folder: writer.directory };
  });
  ipcMain.handle('diagnostics:open-folder', async () => {
    try {
      await fs.mkdir(LOG_DIR(), { recursive: true });
    } catch {
      // openPath below still reports a useful error.
    }
    const failure = await shell.openPath(LOG_DIR());
    return failure ? { ok: false, path: LOG_DIR(), error: failure } : { ok: true, path: LOG_DIR() };
  });
  ipcMain.handle('ai:cancel', async (_e, requestId) => {
    const cancelled = aiRequests.cancel(String(requestId || ''));
    const tracked = aiTasks.getByRequest(String(requestId || ''));
    if (tracked) recordAiTask(aiTasks.cancel(tracked.taskId));
    return { ok: cancelled };
  });
  // update_plan_3 §8: live tasks + persisted history (history is never "running").
  ipcMain.handle('ai:tasks', async (_e, payload) => {
    const limit = Number(payload?.limit) || 50;
    const live = aiTasks.list(limit).map(record => ({ ...record, restored: false }));
    let history = [];
    // The status bar polls every couple of seconds and only needs live tasks;
    // skip the SQLite read when the caller says it does not need history.
    const includeHistory = payload?.history !== false;
    try {
      if (includeHistory) history = requireLessonStore().listAiTasks(limit).map(row => ({ ...row, restored: true }));
    } catch (error) {
      console.warn('Không đọc được lịch sử tác vụ AI:', error && error.message ? error.message : error);
    }
    return { live, history };
  });
  // update_plan_3 §4/§6: CPU-only runtime verification for the bundled llama.cpp.
  ipcMain.handle('ai:runtime-verify', async () => verifyRuntime());
  ipcMain.handle('ai:generate', async (_e, payload) => {
    const settings = await readJson(SETTINGS_FILE(), {});
    const ai = settings.ai || {};
    const mode = payload.mode || ai.mode || 'offline';
    if (mode === 'offline') {
      const response = await generateOffline(payload);
      return { ...response, provider: 'offline-template' };
    }
    const localModelId = payload.localModelId || ai.localModelId || QWEN_LOCAL_MODELS[0].id;
    if (mode === 'local' && (!localAiManager || localAiManager.getStatus().state !== 'READY')) {
      throw new Error('AI local chưa chạy. Hãy nhấn “Tổng hợp với AI trên máy” để mở cửa sổ AI local · llama.cpp, chọn model đã tải đầy đủ rồi nhấn “Bắt đầu chạy”.');
    }
    const baseUrl = mode === 'local'
      ? await ensureLocalRuntime(localModelId)
      : String(payload.baseUrl || ai.baseUrl || '').replace(/\/+$/, '');
    const model = mode === 'local' ? localModelId : payload.model || ai.model;
    let endpoint;
    try { endpoint = new URL(baseUrl); } catch { throw new Error('API Base URL không hợp lệ.'); }
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if (mode === 'local' && (!isLoopback || endpoint.protocol !== 'http:')) {
      throw new Error('Runtime AI tích hợp phải hoạt động trên loopback HTTP của ứng dụng.');
    }
    if (mode === 'online' && endpoint.protocol !== 'https:' &&
        !(endpoint.protocol === 'http:' && isLoopback)) {
      throw new Error('API online phải dùng HTTPS. HTTP chỉ được phép cho endpoint loopback trong môi trường thử nghiệm.');
    }
    if (endpoint.username || endpoint.password || endpoint.hash) throw new Error('Base URL không được chứa thông tin đăng nhập hoặc fragment.');
    let apiKey = mode === 'online' ? payload.apiKey || '' : '';
    const useZen = mode === 'online' && isZenBaseUrl(baseUrl);
    if (mode === 'online' && !apiKey && ai.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
      try { apiKey = safeStorage.decryptString(Buffer.from(ai.apiKeyEncrypted, 'base64')); }
      catch (error) {
        if (!useZen) {
          console.error('Could not decrypt configured AI API key:', error instanceof Error ? error.message : 'unknown');
          throw new AiTransportError('AI_CONFIG', 'Không đọc được API key đã lưu. Hãy nhập lại khóa trong Cài đặt.');
        }
        apiKey = '';
      }
    }
    if (useZen && !apiKey) apiKey = readLocalOpencodeApiKey();
    if (!baseUrl || !model) throw new Error('Hãy cấu hình địa chỉ API và tên mô hình trong Cài đặt.');
    const prompt = buildPrompt({ ...payload, teachingStyle: settings.preferences?.teachingStyle });
    const useStrictGameSchema = mode === 'local';
    const requestBody = {
      model,
      temperature: mode === 'local' ? 0.2 : 0.4,
      ...(mode === 'local' ? { top_p: 1.0, top_k: 20, presence_penalty: 0.0 } : {}),
      ...buildGenerationOptions(
        mode,
        Math.min(4_096, Math.max(1_200, Number(payload.questionCount || 8) * 256))
      ),
      ...(useStrictGameSchema
        ? { response_format: { type: 'json_schema', json_schema: { name: 'game_draft', strict: true, schema: gameDraftResponseSchema } } }
        : {}),
      messages: [
        { role: 'system', content: 'Bạn là trợ lý thiết kế trò chơi giáo dục tiếng Việt. Chỉ trả về JSON hợp lệ, không markdown. Câu trắc nghiệm có 3-4 phương án với id "a","b","c","d" và correctOptionId là một trong các id đó. Câu đúng/sai đặt type "true-false", correctOptionId là "a" (Đúng) hoặc "b" (Sai). Câu điền từ/trả lời ngắn đặt type "fill-in-blank" hoặc "short-answer", bỏ options, điền correctAnswer bằng văn bản đáp án đúng (tối đa 5 từ, nếu cần nhiều ý thì ngăn bằng ";") và thêm hint là một gợi ý ngắn (tối đa 20 từ) giúp học sinh nhớ ra đáp án nhưng KHÔNG được chứa chính đáp án. Với template "treasure-hunt": mọi câu là trắc nghiệm và phải kèm treasureDesign (cốt truyện, tên chặng, vật phẩm ẩn). Với template "race": mọi câu là trắc nghiệm có difficulty và phải kèm raceDesign (chiều dài đường đua, đội, ô đặc biệt). Không bịa quy định pháp luật hoặc số liệu; nếu không chắc, hãy ghi chú cần giáo viên xác minh.' },
        { role: 'user', content: prompt }
      ]
    };
    return await aiSingleFlight.run(
      `legacy:${mode}`,
      mode === 'local' ? 'tạo trò chơi bằng AI local' : 'tạo trò chơi bằng AI',
      async () => {
        const response = useZen
          ? await postZenChatCompletions({ baseUrl, apiKey, payload: requestBody, timeoutMs: 180_000 })
          : await fetchAiEndpoint(`${baseUrl}/chat/completions`, {
            method: 'POST',
            redirect: 'error',
            headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(mode === 'local' ? 300_000 : 90_000)
          }, mode);
        if (!response.ok) throw new Error(`AI API trả về lỗi HTTP ${response.status}. Kiểm tra endpoint, model và API key.`);
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('AI không trả về nội dung.');
        const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        let parsed;
        try { parsed = JSON.parse(cleaned); } catch { throw new Error('AI trả về JSON không hợp lệ. Hãy thử lại hoặc giảm độ dài tài liệu.'); }
        if (useStrictGameSchema) {
          const validated = gameDraftSchema.safeParse(parsed);
          if (!validated.success) {
            throw new Error('AI trả về game sai cấu trúc (thiếu đáp án correctAnswer cho câu điền từ/trả lời ngắn, hoặc thiếu phương án/correctOptionId cho câu trắc nghiệm). Hãy thử lại.');
          }
          parsed = validated.data;
        }
        return { game: normalizeAiGameService(parsed, payload, id), provider: mode };
      }
    );
  });
}

async function fetchAiEndpoint(url, options, mode) {
  try {
    return await fetch(url, options);
  } catch (error) {
    // A teacher cancel must never restart the runtime or look like a timeout.
    if (isCancelReason(error) || isCancelReason(options?.signal?.reason)) {
      throw createCancelReason(options?.signal?.reason);
    }
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      if (mode === 'local') {
        const manager = localAiManager;
        if (!manager) {
          throw new AiTransportError('AI_TIMEOUT', 'AI local đã vượt quá thời gian chờ và runtime không còn hoạt động. Hãy khởi động lại AI local rồi thử lại.');
        }
        try {
          await manager.stop();
          await manager.start();
        } catch (restartError) {
          console.error('Could not restart local AI runtime after a timed-out request:', restartError);
          const restartMessage = restartError instanceof Error ? restartError.message : String(restartError);
          throw new AiTransportError(
            'AI_TIMEOUT',
            `AI local đã vượt quá thời gian chờ và không khởi động lại được runtime: ${restartMessage}`
          );
        }
        throw new AiTransportError('AI_TIMEOUT', 'AI local đã vượt quá thời gian chờ; runtime đã được khởi động lại. Hãy thử với tài liệu ngắn hơn hoặc model nhẹ hơn.');
      }
      throw new AiTransportError('AI_TIMEOUT', 'Yêu cầu AI quá thời gian chờ. Kiểm tra dịch vụ/model hoặc thử lại với tài liệu ngắn hơn.');
    }
    if (mode === 'local' && error?.cause?.code === 'ECONNREFUSED') {
      const origin = new URL(url).origin;
      throw new AiTransportError('AI_CONNECTION', `Không kết nối được llama.cpp tại ${origin}. Hãy thử lại hoặc kiểm tra runtime AI local trong ứng dụng.`);
    }
    if (error instanceof TypeError) {
      throw new AiTransportError('AI_CONNECTION', 'Không kết nối được AI API. Kiểm tra endpoint, kết nối mạng và chứng thư HTTPS.');
    }
    throw error;
  }
}

/** Preserve the original cancel reason so `isCancelReason` still matches upstream. */
function createCancelReason(reason) {
  if (isCancelReason(reason)) return reason;
  const error = new Error('Yêu cầu AI đã bị huỷ.');
  error.name = 'AiCancelledError';
  return error;
}


/**
 * Test-only fixture loader for the lesson workflow.
 *
 * Enabled **only** in an unpackaged build (`npx electron .`) via
 * `EDUGAME_AI_TEST_DIR`, so a packaged installer can never fabricate AI output:
 * there, `createLessonChatClient` still fails with `AI_NOT_RUNNING` until a real
 * local model is running. Fixture files are named after the request's JSON
 * schema (`lesson_analysis.json`, `game_recommendations.json`, …); a file with a
 * `__testDouble` marker can force a specific typed error instead.
 */
function loadLessonTestFixture(responseSchema) {
  if (app.isPackaged) return { found: false };
  const dir = process.env.EDUGAME_AI_TEST_DIR;
  if (!dir) return { found: false };
  const name = String((responseSchema && responseSchema.name) || 'default').replace(/[^a-z0-9_-]/gi, '');
  const file = path.join(dir, `${name}.json`);
  const fsSync = require('node:fs');
  if (!fsSync.existsSync(file)) return { found: false };
  let parsed;
  try {
    parsed = JSON.parse(fsSync.readFileSync(file, 'utf8'));
  } catch (error) {
    return { found: true, error: { code: 'AI_INVALID_JSON', message: `Fixture ${name}.json không đọc được: ${error.message}`, rawContent: null } };
  }
  const marker = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.__testDouble : null;
  if (marker) {
    return {
      found: true,
      error: {
        code: String(marker.code || 'AI_OUTPUT_INVALID'),
        message: String(marker.message || 'Lỗi AI mô phỏng cho kiểm thử.'),
        rawContent: marker.rawContent === undefined ? null : marker.rawContent
      }
    };
  }
  return { found: true, value: parsed };
}

/**
 * O6d: `prompt_tokens` reported by the server for the most recent local chat
 * round trip. Filled by `createLessonChatClient`, read by `lesson:analyze` for
 * the diagnostics log; `null` when the runtime does not report usage.
 */
let lastPromptTokens: number | null = null;

/**
 * Local-only chat client for the lesson-to-game workflow.
 *
 * Reuses the same llama.cpp runtime and `fetchAiEndpoint` as the legacy
 * document assistant, but never falls back to a cloud provider and forwards the
 * workflow's abort signal so `ai:cancel` stops the request.
 */
function createLessonChatClient() {
  return {
    async chatJson({ messages, maxTokens, responseSchema, signal }) {
      const fixture = loadLessonTestFixture(responseSchema);
      if (fixture.found) {
        if (fixture.error) {
          throw new AiTransportError(fixture.error.code, fixture.error.message, { rawContent: fixture.error.rawContent });
        }
        return fixture.value;
      }
      if (!localAiManager || localAiManager.getStatus().state !== 'READY') {
        throw new AiTransportError('AI_NOT_RUNNING', 'AI local chưa chạy. Hãy nhấn “Tổng hợp với AI trên máy” để mở cửa sổ AI local · llama.cpp, chọn model đã tải đầy đủ rồi nhấn “Bắt đầu chạy”.');
      }
      const settings = await readJson(SETTINGS_FILE(), {});
      const ai = settings.ai || {};
      const localModelId = ai.localModelId || QWEN_LOCAL_MODELS[0].id;
      let baseUrl;
      try {
        baseUrl = await ensureLocalRuntime(localModelId);
      } catch (error) {
        throw new AiTransportError('AI_NOT_RUNNING', error instanceof Error ? error.message : String(error));
      }
      return requestChatJson({
        model: localModelId,
        mode: 'local',
        messages,
        generation: buildGenerationOptions('local', maxTokens),
        responseSchema: responseSchema || null,
        timeoutMs: 300_000,
        signal,
        send: (body, sendSignal) => fetchAiEndpoint(`${baseUrl}/chat/completions`, {
          method: 'POST',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: sendSignal
        }, 'local').then(async response => {
          // O6d: record the server-reported input size for prefill metrics.
          // Wrapping `json` keeps `requestChatJson` unchanged; if the body is not
          // JSON or reports no usage we simply store null.
          if (response && response.ok && typeof response.json === 'function') {
            const originalJson = response.json.bind(response);
            response.json = async () => {
              const data = await originalJson();
              const tokens = readPromptTokens(data);
              if (tokens !== null) lastPromptTokens = tokens;
              return data;
            };
          }
          return response;
        })
      });
    }
  };
}

function getAnalyzedSource(payload) {
  if (!payload.analysis) return String(payload.text || '').slice(0, 26000);
  const conversation = (payload.qaEntries || []).slice(-4).map(entry =>
    `Trao đổi với giáo viên — Câu hỏi: ${String(entry.question || '').slice(0, 500)}\nTrả lời đã đối chiếu với tài liệu: ${String(entry.answer?.answer || '').slice(0, 1200)}\n${(entry.answer?.evidence || []).slice(0, 3).map(item => `Căn cứ: ${String(item).slice(0, 300)}`).join('\n')}`
  );
  return [
    `TÓM TẮT ĐÃ ĐƯỢC GIÁO VIÊN XEM LẠI:\n${payload.analysis.summary}`,
    `Ý CHÍNH:\n${(payload.analysis.keyPoints || []).map(point => `- ${point}`).join('\n')}`,
    `CÂU HỎI ÔN TẬP GỢI Ý:\n${(payload.analysis.suggestedQuestions || []).map(question => `- ${question}`).join('\n')}`,
    ...conversation
  ].join('\n\n');
}

function buildPrompt(payload) {
  const sourceContent = getAnalyzedSource(payload);
  const setup = payload.gameSetup && typeof payload.gameSetup === 'object' ? payload.gameSetup : {};
  const mode = String(setup.scoringMode || '');
  const pointsPer = Number(setup.pointsPerCorrect) || 100;
  const timeBonus = Math.min(50, Math.max(0, Number(setup.timeBonus) || 20));
  const pointsEasy = Number(setup.pointsEasy) || 100;
  const pointsMedium = Number(setup.pointsMedium) || 200;
  const pointsHard = Number(setup.pointsHard) || 300;
  const scoringLine = !mode ? '' : `\nChế độ tính điểm giáo viên chọn: ${mode}. ${mode === 'theo độ khó' ? `Đặt điểm points mỗi câu theo bảng: dễ ${pointsEasy}, trung bình ${pointsMedium}, khó ${pointsHard}; gán trường "difficulty" cho từng câu là "dễ", "trung bình" hoặc "khó" phù hợp mức độ. ` : mode === 'tốc độ' ? `Mỗi câu đúng nhận khoảng ${pointsPer} điểm; trả lời nhanh được cộng tối đa ${timeBonus} điểm. ` : mode === 'luyện tập' ? 'Ưu tiên câu hỏi rõ ràng và giải thích chi tiết; không nhấn mạnh thời gian. ' : mode === 'thi đấu đội' ? 'Câu hỏi vừa sức để các đội luân phiên trả lời; điểm số cộng về cho đội. ' : `Mỗi câu đúng nhận ${pointsPer} điểm. `}`;
  const ts = payload.teachingStyle && typeof payload.teachingStyle === 'object' ? payload.teachingStyle : null;
  const styleLine = ts ? `\nPhong cách giảng dạy của giáo viên (áp dụng cho trò chơi này): giọng điệu ${String(ts.tone || 'thân thiện')}; mức độ hài hước ${String(ts.humor || 'vừa phải')}; phong cách mỹ thuật ${String(ts.visualStyle || 'hiện đại sinh động')}${ts.examples ? `; ưu tiên ví dụ hoặc tình huống: ${String(ts.examples).slice(0, 300)}` : ''}${ts.notes ? `; lưu ý thêm: ${String(ts.notes).slice(0, 400)}` : ''}.` : '';
  const template = ['quiz', 'scenario', 'matching', 'treasure-hunt', 'race'].includes(String(payload.template)) ? String(payload.template) : 'scenario';
  const questionCount = Math.max(3, Math.min(15, Number(payload.questionCount) || 8));
  const genericStructure = '{"title":"...","subject":"...","grade":"...","topic":"...","template":"quiz|scenario|matching","description":"...","questions":[{"id":"q1","type":"multiple-choice|true-false|fill-in-blank|short-answer|scenario|matching","prompt":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"correctOptionId":"b","explanation":"...","points":100}]}';
  const genericRules = 'trộn đa dạng kiểu câu hỏi: trắc nghiệm (3-4 lựa chọn id "a","b","c","d", correctOptionId là một trong các id đó), đúng/sai (type "true-false", correctOptionId "a" cho Đúng hoặc "b" cho Sai), điền từ (type "fill-in-blank", không options, correctAnswer là đáp án cần điền) và trả lời ngắn (type "short-answer", không options, correctAnswer là đáp án mẫu); với hai kiểu này đáp án tối đa 5 từ (nhiều ý thì ngăn bằng ";") và câu hỏi phải kèm hint là một câu gợi ý ngắn (tối đa 20 từ, không chứa đáp án); Thể loại mong muốn: ' + template + '.';
  const treasureStructure = '{"title":"...","subject":"...","grade":"...","topic":"...","template":"treasure-hunt","description":"...","questions":[{"id":"q1","type":"multiple-choice","prompt":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."}],"correctOptionId":"a","explanation":"..."}],"treasureDesign":{"character":"Nhà thám hiểm","intro":"...","journeyBonus":300,"hiddenItemBonus":50,"stages":[{"name":"Chặng 1 — ...","story":"...","taskDescription":"...","hint":"...","attempts":0,"points":100,"completionBonus":200,"hasHiddenItem":true}]}}';
  const treasureRules = `Thể loại mong muốn: treasure-hunt (Giải mã kho báu). Tạo ${questionCount} câu ứng với ${questionCount} chặng (tối thiểu 2); MỌI câu hỏi đều là trắc nghiệm nhiều phương án (type "multiple-choice", 3-4 phương án; KHÔNG dùng đúng/sai, điền từ hay trả lời ngắn trong thể loại này). Kèm treasureDesign: stages có MỖI PHẦN tương ứng theo đúng thứ tự questions — name (tên chặng), story (bối cảnh, lời dẫn nối tiếp mạch lạc giữa các chặng), taskDescription (nhiệm vụ của học sinh ở chặng này), hint (gợi ý khi trả lời sai), attempts (số lượt thử 0-99, 0 = không giới hạn), points (0-1000), completionBonus (0-10000), hasHiddenItem (true cho khoảng một nửa số chặng cất vật phẩm ẩn). character là nhân vật của học sinh, intro là lời mở đầu hành trình; journeyBonus (0-10000) thưởng khi hoàn thành cả hành trình; hiddenItemBonus (0-1000) điểm cho mỗi vật phẩm ẩn. Hệ thống tự nối các chặng thành hành trình một nhánh, chặng cuối là kết thúc.`;
  const raceStructure = '{"title":"...","subject":"...","grade":"...","topic":"...","template":"race","description":"...","questions":[{"id":"q1","type":"multiple-choice","prompt":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."}],"correctOptionId":"a","explanation":"...","difficulty":"dễ"}],"raceDesign":{"trackLength":12,"maxRounds":6,"stepByDifficulty":true,"luckEnabled":true,"teams":[{"name":"Đội Sao Mộc","icon":"🚀"},{"name":"Đội Sao Kim","icon":"🏎️"}],"specialCells":[{"cell":5,"type":"boost","label":"Tăng tốc"},{"cell":9,"type":"challenge","label":"Thử thách"}]}}';
  const raceRules = 'Thể loại mong muốn: race (Đường đua chinh phục). MỌI câu hỏi đều là trắc nghiệm và CÓ trường difficulty là "dễ", "trung bình" hoặc "khó" — phân bố đều ba mức trong bộ câu hỏi. Kèm raceDesign: trackLength (số ô đường đua, 3-100, gợi ý 10-16 theo thời lượng), maxRounds (số vòng đua, 1-50), stepByDifficulty (true nếu trả lời đúng khó thì đi thêm ô), luckEnabled (yếu tố may mắn), teams (2-4 đội gợi ý gồm name và icon emoji — giáo viên sẽ chỉnh lại), specialCells (4-8 ô đặc biệt: cell ≥ 2 và ≤ trackLength, không trùng số ô, type là "boost" (tăng tốc), "penalty" (chướng ngại), "lucky" (may mắn) hoặc "challenge" (thử thách), label là nhãn hiển thị).';
  const structure = template === 'treasure-hunt' ? { json: treasureStructure, rules: treasureRules }
    : template === 'race' ? { json: raceStructure, rules: raceRules }
    : { json: genericStructure, rules: genericRules };
  return `Tạo một trò chơi giáo dục bằng tiếng Việt từ tài liệu sau.
Trả về JSON có cấu trúc:
${structure.json}
Yêu cầu: tạo ${questionCount} câu; ${structure.rules} prompt của mỗi câu PHẢI là câu hỏi hoặc tình huống cụ thể (kết thúc bằng ? hoặc mô tả tình huống), tuyệt đối KHÔNG dùng nhãn như "TOM TAT", "Y CHINH", "GOI Y"; một đáp án đúng; giải thích ngắn, rõ; tránh câu mơ hồ; không tự bịa mức phạt hoặc điều luật. Lớp: ${payload.grade || 'chưa xác định'}. Môn học: ${payload.subject || 'chưa xác định'}.
${scoringLine}${styleLine}Tên tài liệu: ${payload.sourceName || 'Không có'}.
${payload.analysis ? 'Chỉ sử dụng bản tổng hợp, ý chính, câu hỏi gợi ý và phần trao đổi dưới đây làm nguồn nội dung cho trò chơi. Không tham chiếu văn bản tài liệu gốc ngoài phần đã tổng hợp. Dùng câu hỏi và câu trả lời của giáo viên để định hướng nội dung; mọi đáp án vẫn phải được căn cứ vào ý chính và bản tổng hợp.' : 'Dùng nội dung tài liệu gốc bên dưới làm nguồn.'}
${payload.useSuggestedQuestions ? 'Ưu tiên chuyển bộ câu hỏi gợi ý trong bản tổng hợp thành câu hỏi của trò chơi; giữ đúng trọng tâm và tạo đáp án dựa trên nội dung nguồn.' : ''}
Nội dung nguồn:
${sourceContent}`;
}
async function generateOffline(payload) {
  const text = getAnalyzedSource(payload).trim();
  if (!text) throw new Error('Hãy nhập nội dung hoặc nạp tài liệu trước khi tạo game.');
  const sentences = text.replace(/\r/g,'').split(/[\n.!?。]+/).map(s => s.trim()).filter(s => s.length > 30 && s.length < 450);
  const unique = [...new Set(sentences)].slice(0, 20);
  if (!unique.length) throw new Error('Chưa tìm thấy đủ đoạn nội dung để tạo câu hỏi tự động. Hãy thêm nội dung dài hơn hoặc dùng AI online.');
  const questions = unique.slice(0, Math.max(3, Math.min(15, Number(payload.questionCount) || 8))).map((sentence, i) => ({
    id: `q${i+1}`, type: payload.template === 'scenario' ? 'scenario' : 'multiple-choice',
    prompt: `Theo tài liệu, phát biểu nào cần ghi nhớ?\n\n“${sentence.slice(0, 260)}${sentence.length > 260 ? '…' : ''}”`,
    options: [
      { id: 'a', text: 'Nội dung trên cần được xem xét theo bài học' },
      { id: 'b', text: 'Bỏ qua nội dung vì không liên quan' },
      { id: 'c', text: 'Luôn chọn phương án nhanh nhất' },
      { id: 'd', text: 'Không cần kiểm chứng thông tin' }
    ],
    correctOptionId: 'a',
    explanation: 'Câu hỏi ngoại tuyến được tạo theo mẫu từ văn bản trích xuất. Giáo viên cần chỉnh sửa lựa chọn và xác nhận đáp án trước khi dùng trên lớp.',
    points: 100
  }));
  const game: any = { id: id('game'), title: payload.title || `Trò chơi: ${payload.topic || payload.sourceName || 'Bài học mới'}`, subject: payload.subject || '', grade: payload.grade || '', topic: payload.topic || '', template: payload.template || 'scenario', description: 'Bản nháp được tạo ngoại tuyến theo mẫu. Cần giáo viên duyệt trước khi sử dụng.', questions, sourceName: payload.sourceName || '', tags: ['Ngoại tuyến', 'Cần duyệt'], createdAt: new Date().toISOString() };
  if (game.template === 'treasure-hunt') {
    const hunt = buildTreasureHuntService(questions, null);
    if (hunt) game.treasureHunt = hunt;
  }
  if (game.template === 'race') {
    const race = buildRaceDataService(questions, null);
    if (race) game.race = race;
  }
  return { game, warning: 'Chế độ ngoại tuyến tạo bản nháp theo quy tắc, không phải mô hình AI. Vui lòng rà soát đáp án trước khi dùng.' };
}
