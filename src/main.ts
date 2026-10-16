// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const JSZip = require('jszip');
const Database = require('better-sqlite3');

let sqlite;

let mainWindow;
const DATA_DIR = () => path.join(app.getPath('userData'), 'edugame-data');
const DB_FILE = () => path.join(DATA_DIR(), 'edugame.sqlite');
const LEGACY_DB_FILE = () => path.join(DATA_DIR(), 'library.json');
const SETTINGS_FILE = () => path.join(DATA_DIR(), 'settings.json');

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
  const gameCount = sqlite.prepare('SELECT COUNT(*) AS count FROM games').get().count;
  if (gameCount === 0) {
    let legacy = { games: [], sessions: [] };
    try { legacy = JSON.parse(await fs.readFile(LEGACY_DB_FILE(), 'utf8')); } catch {}
    const games = Array.isArray(legacy.games) && legacy.games.length ? legacy.games : [seedGame()];
    saveDb({ version: 1, games, sessions: Array.isArray(legacy.sessions) ? legacy.sessions : [] });
  }
  try { await fs.access(SETTINGS_FILE()); }
  catch { await writeJson(SETTINGS_FILE(), { ai: { mode: 'offline', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b', apiKeyEncrypted: '' }, preferences: { sound: true, largeText: true } }); }
}
async function readJson(file, fallback = {}) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}
async function readDb() {
  if (!sqlite) return { version: 1, games: [], sessions: [] };
  const games = sqlite.prepare('SELECT data_json FROM games ORDER BY updated_at DESC').all().map(row => JSON.parse(row.data_json));
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
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(async () => {
  await ensureData();
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

function registerIpc() {
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, userData: app.getPath('userData') }));
  ipcMain.handle('library:get', async () => readDb());
  ipcMain.handle('library:save-game', async (_e, game) => {
    if (!game || typeof game.title !== 'string' || !Array.isArray(game.questions)) throw new Error('Dữ liệu trò chơi không hợp lệ.');
    const db = await readDb();
    const now = new Date().toISOString();
    const normalized = { ...game, id: game.id || id('game'), updatedAt: now, createdAt: game.createdAt || now };
    const index = db.games.findIndex(g => g.id === normalized.id);
    if (index >= 0) db.games[index] = normalized; else db.games.unshift(normalized);
    await saveDb(db);
    return normalized;
  });
  ipcMain.handle('library:delete-game', async (_e, gameId) => {
    const db = await readDb();
    db.games = db.games.filter(g => g.id !== gameId);
    await saveDb(db);
    return { ok: true };
  });
  ipcMain.handle('library:save-session', async (_e, session) => {
    const db = await readDb();
    db.sessions.unshift({ ...session, id: id('session'), createdAt: new Date().toISOString() });
    db.sessions = db.sessions.slice(0, 1000);
    await saveDb(db);
    return { ok: true };
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
  ipcMain.handle('files:import-game', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Nhập trò chơi', properties: ['openFile'], filters: [{ name: 'EduGame package', extensions: ['egame', 'json'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const raw = JSON.parse(await fs.readFile(result.filePaths[0], 'utf8'));
    const game = raw.game || raw;
    if (!game || typeof game.title !== 'string' || !Array.isArray(game.questions)) throw new Error('Tệp không phải gói trò chơi hợp lệ.');
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
  ipcMain.handle('ai:generate', async (_e, payload) => {
    const settings = await readJson(SETTINGS_FILE(), {});
    const ai = settings.ai || {};
    const mode = payload.mode || ai.mode || 'offline';
    if (mode === 'offline') {
      const response = await generateOffline(payload);
      return { ...response, provider: 'offline-template' };
    }
    const baseUrl = (payload.baseUrl || ai.baseUrl || '').replace(/\/+$/, '');
    const model = payload.model || ai.model;
    let apiKey = payload.apiKey || '';
    if (!apiKey && ai.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
      try { apiKey = safeStorage.decryptString(Buffer.from(ai.apiKeyEncrypted, 'base64')); } catch {}
    }
    if (!baseUrl || !model) throw new Error('Hãy cấu hình địa chỉ API và tên mô hình trong Cài đặt.');
    const prompt = buildPrompt(payload);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: 'Bạn là trợ lý thiết kế trò chơi giáo dục tiếng Việt. Chỉ trả về JSON hợp lệ, không markdown. Không bịa quy định pháp luật hoặc số liệu; nếu không chắc, hãy ghi chú cần giáo viên xác minh.' },
          { role: 'user', content: prompt }
        ]
      }),
      signal: AbortSignal.timeout(90000)
    });
    if (!response.ok) throw new Error(`AI API trả về lỗi HTTP ${response.status}. Kiểm tra endpoint, model và API key.`);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI không trả về nội dung.');
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch { throw new Error('AI trả về JSON không hợp lệ. Hãy thử lại hoặc giảm độ dài tài liệu.'); }
    return { game: normalizeAiGame(parsed, payload), provider: mode };
  });
}

function buildPrompt(payload) {
  return `Tạo một trò chơi giáo dục bằng tiếng Việt từ tài liệu sau.
Trả về JSON có cấu trúc:
{"title":"...","subject":"...","grade":"...","topic":"...","template":"quiz|scenario|matching","description":"...","questions":[{"id":"q1","type":"multiple-choice|scenario|matching","prompt":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"correctOptionId":"b","explanation":"...","points":100}]}
Yêu cầu: tạo ${Math.max(3, Math.min(15, Number(payload.questionCount) || 8))} câu; mỗi câu trắc nghiệm có 3-4 lựa chọn; một đáp án đúng; giải thích ngắn, rõ; tránh câu mơ hồ; không tự bịa mức phạt hoặc điều luật. Thể loại mong muốn: ${payload.template || 'scenario'}. Lớp: ${payload.grade || 'chưa xác định'}. Môn học: ${payload.subject || 'chưa xác định'}.
Tên tài liệu: ${payload.sourceName || 'Không có'}.
Nội dung:
${String(payload.text || '').slice(0, 26000)}`;
}
function normalizeAiGame(raw, payload) {
  const questions = Array.isArray(raw.questions) ? raw.questions.slice(0, 30).map((q, i) => {
    const options = Array.isArray(q.options) ? q.options.map((o, j) => typeof o === 'string' ? ({ id: String.fromCharCode(97+j), text: o }) : ({ id: String(o.id || String.fromCharCode(97+j)), text: String(o.text || '') })) : [];
    let correctOptionId = String(q.correctOptionId || options[0]?.id || 'a');
    if (!options.some(o => o.id === correctOptionId)) correctOptionId = options[0]?.id || 'a';
    return { id: String(q.id || `q${i+1}`), type: q.type === 'scenario' ? 'scenario' : 'multiple-choice', prompt: String(q.prompt || `Câu hỏi ${i+1}`), options, correctOptionId, explanation: String(q.explanation || 'Hãy đối chiếu với nội dung bài học.'), points: Math.max(10, Number(q.points) || 100) };
  }) : [];
  if (!questions.length) throw new Error('AI không tạo được câu hỏi nào.');
  return { id: id('game'), title: String(raw.title || 'Trò chơi mới'), subject: String(raw.subject || payload.subject || ''), grade: String(raw.grade || payload.grade || ''), topic: String(raw.topic || ''), template: ['quiz','scenario','matching'].includes(raw.template) ? raw.template : (payload.template || 'scenario'), description: String(raw.description || ''), questions, sourceName: payload.sourceName || '', tags: ['AI tạo'], createdAt: new Date().toISOString() };
}
async function generateOffline(payload) {
  const text = String(payload.text || '').trim();
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
  return { game: { id: id('game'), title: payload.title || `Trò chơi: ${payload.topic || payload.sourceName || 'Bài học mới'}`, subject: payload.subject || '', grade: payload.grade || '', topic: payload.topic || '', template: payload.template || 'scenario', description: 'Bản nháp được tạo ngoại tuyến theo mẫu. Cần giáo viên duyệt trước khi sử dụng.', questions, sourceName: payload.sourceName || '', tags: ['Ngoại tuyến', 'Cần duyệt'], createdAt: new Date().toISOString() }, warning: 'Chế độ ngoại tuyến tạo bản nháp theo quy tắc, không phải mô hình AI. Vui lòng rà soát đáp án trước khi dùng.' };
}
