import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LessonStore, LessonStoreError, LESSON_STORE_SCHEMA_SQL } from '../src/services/lesson-store';
import type { LessonStoreDatabase } from '../src/services/lesson-store';
import { chunkLessonText } from '../src/services/lesson-chunker';
import { toEducationalGame } from '../src/services/game-project-adapter';
import { advanceAfterRecommendations, createProjectFromAnalysis } from '../src/services/lesson-projects';
import type {
  ArenaDraft,
  GameProject,
  LessonAnalysis,
  MatchingConfig,
  MatchingDraft
} from '../src/shared/lesson-types';
import type { EducationalGame } from '../src/shared/types';

const Database = require('better-sqlite3');

const ISO = '2026-01-01T00:00:00.000Z';

function expectStoreError(code: string, run: () => unknown): void {
  try {
    run();
    assert.fail(`expected LessonStoreError ${code}`);
  } catch (error) {
    assert.ok(error instanceof LessonStoreError, `expected LessonStoreError, got ${String(error)}`);
    assert.equal((error as LessonStoreError).code, code);
  }
}

async function expectStoreErrorAsync(code: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
    assert.fail(`expected LessonStoreError ${code}`);
  } catch (error) {
    assert.ok(error instanceof LessonStoreError, `expected LessonStoreError, got ${String(error)}`);
    assert.equal((error as LessonStoreError).code, code);
  }
}

const arenaDraft: ArenaDraft = {
  gameType: 'arena',
  schemaVersion: 1,
  questions: [
    {
      id: 'q1', type: 'multiple-choice', prompt: '2 + 3 = ?',
      options: [{ id: 'a', text: '5' }, { id: 'b', text: '6' }],
      correctOptionId: 'a', explanation: 'Bằng 5.', difficulty: 'dễ', points: 100
    },
    {
      id: 'q2', type: 'true-false', prompt: 'Nước sôi ở 100°C.',
      options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }],
      correctOptionId: 'a', explanation: 'Đúng.', difficulty: 'trung bình', points: 200
    },
    {
      id: 'q3', type: 'fill-in-blank', prompt: 'Thủ đô Việt Nam là ...',
      correctAnswer: 'Hà Nội', explanation: 'Hà Nội.', difficulty: 'khó', points: 300
    }
  ]
};

function arenaProject(overrides: Partial<GameProject> = {}): GameProject {
  return {
    id: 'project-1',
    schemaVersion: 1,
    status: 'draft',
    step: 'configure',
    title: 'Đấu trường',
    description: 'Mô tả',
    tags: ['AI tạo'],
    sourceName: 'bai.txt',
    lesson: { documentId: 'doc-1', name: 'bai.txt', characters: 1200 },
    analysisId: 'analysis-1',
    recommendationId: null,
    config: {
      gameType: 'arena', title: 'Đấu trường', subject: 'Toán', grade: 'Lớp 5', topic: 'Cộng',
      audience: 'child', durationMinutes: 15, difficulty: 'trung bình', playMode: 'individual',
      style: 'fun', focusObjectiveIds: [], generationMode: 'fast',
      questionCount: 3, scoringMode: 'basic', pointsPerCorrect: 100, timeBonus: 10
    },
    draft: arenaDraft,
    gameSnapshot: null,
    gameId: null,
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides
  };
}

const matchingDraft: MatchingDraft = {
  gameType: 'matching',
  schemaVersion: 1,
  mode: 'columns',
  pairs: [
    { id: 'p1', left: 'Quang hợp', right: 'Tổng hợp chất hữu cơ' },
    { id: 'p2', left: 'Hô hấp', right: 'Giải phóng năng lượng' }
  ],
  pointsPerPair: 100, completionBonus: 200, wrongPenalty: 0, timeBonus: 50, bonusUnderSeconds: 60, practiceMode: false
};

const matchingConfig: MatchingConfig = {
  gameType: 'matching', title: 'Ghép cặp', subject: 'Sinh học', grade: 'Lớp 7', topic: 'Tế bào',
  audience: 'teen', durationMinutes: 10, difficulty: 'dễ', playMode: 'individual',
  style: 'minimal', focusObjectiveIds: [], generationMode: 'fast',
  pairCount: 2, matchingMode: 'columns', wrongPenalty: 0
};

const analysisTemplate: LessonAnalysis = {
  id: 'analysis-1',
  schemaVersion: 1,
  documentId: '',
  subject: 'Toán',
  grade: 5,
  topic: 'Phép cộng',
  objectives: [{ id: 'o1', description: 'Cộng hai số.', cognitiveLevel: 'apply' }],
  keyConcepts: [{ id: 'k1', term: 'Phép cộng', explanation: 'Gộp hai số.' }],
  uncertainties: [],
  sourceDocumentIds: [],
  createdAt: ISO
};

async function run(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'edugame-store-'));
  const lessonsDir = path.join(root, 'lessons');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  // Legacy tables must keep working and stay untouched by the store.
  db.exec(`
    CREATE TABLE games (id TEXT PRIMARY KEY, title TEXT, data_json TEXT);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, data_json TEXT);
    INSERT INTO games (id, title, data_json) VALUES ('legacy-game', 'Trò chơi cũ', '{"id":"legacy-game"}');
    INSERT INTO sessions (id, data_json) VALUES ('legacy-session', '{"id":"legacy-session"}');
  `);

  const store = new LessonStore({ db: db as unknown as LessonStoreDatabase, lessonsDir });
  store.ensureSchema();
  store.ensureSchema(); // idempotent

  // --- Documents -----------------------------------------------------------
  const document = await store.saveDocument({ name: 'bai-giang.txt', ext: '.TXT', text: 'Nội dung giáo án.', sizeBytes: undefined, characters: undefined });
  assert.equal(document.id.startsWith('doc_'), true);
  assert.equal(document.ext, 'txt');
  assert.equal(document.name, 'bai-giang.txt');
  assert.equal(document.characters, 'Nội dung giáo án.'.length);
  assert.equal(document.sha256?.length, 64);
  assert.equal(document.textRelPath, `lessons/${document.id}.txt`);
  assert.equal(await fs.readFile(path.join(lessonsDir, `${document.id}.txt`), 'utf8'), 'Nội dung giáo án.');

  const withText = await store.getDocumentWithText(document.id);
  assert.equal(withText?.text, 'Nội dung giáo án.');
  assert.equal(withText?.characters, document.characters);
  assert.equal(store.getDocument('missing-doc'), null);

  const updated = await store.saveDocument({ documentId: document.id, name: 'bai-giang-2.txt', ext: 'txt', text: 'Nội dung mới dài hơn.' });
  assert.equal(updated.createdAt, document.createdAt, 'createdAt must be preserved on update');
  assert.equal(updated.characters, 'Nội dung mới dài hơn.'.length);
  assert.equal((await store.getDocumentWithText(document.id))?.name, 'bai-giang-2.txt');

  await expectStoreErrorAsync('STORE_INVALID_DOCUMENT', () => store.saveDocument({ name: '', ext: 'txt', text: 'x' }));

  // --- Lesson chunks (O3) ---------------------------------------------------
  assert.equal(store.countChunks(document.id), 0);
  assert.deepEqual(store.listChunks(document.id), []);
  assert.deepEqual(store.listChunks(''), []);
  assert.equal(store.countChunks('missing-doc'), 0);

  const chunks = chunkLessonText('Phần 1\nQuang hợp là quá trình tổng hợp chất hữu cơ.\n\nPhần 2\nHô hấp là quá trình phân giải chất hữu cơ.');
  assert.ok(chunks.length >= 1);
  const storedChunks = store.replaceChunks(document.id, chunks);
  assert.equal(storedChunks.length, chunks.length);
  assert.equal(store.countChunks(document.id), chunks.length);
  assert.equal(storedChunks[0].documentId, document.id);
  assert.deepEqual(
    storedChunks.map(chunk => chunk.index),
    chunks.map(chunk => chunk.index)
  );
  assert.equal(storedChunks[0].text, chunks[0].text);
  assert.equal(storedChunks[0].heading, chunks[0].heading);
  assert.equal(storedChunks[0].charStart, chunks[0].charStart);
  assert.equal(storedChunks[0].charEnd, chunks[0].charEnd);
  assert.ok(storedChunks[0].tokenCount > 0);
  assert.equal(storedChunks[0].embeddingModel, null);
  assert.equal(storedChunks[0].embeddingDim, null);

  // Replacing is idempotent and drops stale rows.
  store.replaceChunks(document.id, [chunks[0]]);
  assert.equal(store.countChunks(document.id), 1);
  store.replaceChunks(document.id, chunks);
  assert.equal(store.countChunks(document.id), chunks.length);

  expectStoreError('STORE_DOCUMENT_MISSING', () => store.replaceChunks('missing-doc', chunks));
  expectStoreError('STORE_INVALID_DOCUMENT', () =>
    store.replaceChunks(document.id, [{ index: 0, text: '   ', charStart: 0, charEnd: 0, heading: null }])
  );
  assert.equal(store.countChunks(document.id), chunks.length, 'a rejected write must not delete the cached chunks');

  // --- Chunk embeddings (O4) ------------------------------------------------
  const modelId = 'test-embed-v1';
  const dim = 4;
  const vectorFor = (value: number) => Float32Array.from([value, value, value, value]);
  assert.equal(store.listChunkEmbeddings(document.id, modelId).size, 0);
  assert.equal(store.listChunkEmbeddings('', modelId).size, 0);

  const expectedEmbedded = Math.min(2, chunks.length);
  assert.equal(
    store.saveChunkEmbeddings(document.id, modelId, dim, new Map([[0, vectorFor(0.25)], [1, vectorFor(0.5)]])),
    expectedEmbedded
  );
  const cachedVectors = store.listChunkEmbeddings(document.id, modelId);
  assert.equal(cachedVectors.size, expectedEmbedded);
  assert.equal(cachedVectors.get(0)?.length, dim);
  assert.ok(Math.abs((cachedVectors.get(0)?.[0] ?? 0) - 0.25) < 1e-6, 'vectors must round-trip through the BLOB');
  assert.equal(store.listChunkEmbeddings(document.id, 'other-model').size, 0, 'vectors are scoped per model');

  expectStoreError('STORE_INVALID_DOCUMENT', () =>
    store.saveChunkEmbeddings(document.id, modelId, dim, new Map([[0, new Float32Array(3)]]))
  );
  expectStoreError('STORE_INVALID_DOCUMENT', () => store.saveChunkEmbeddings(document.id, modelId, 0, new Map()));
  expectStoreError('STORE_INVALID_DOCUMENT', () =>
    store.saveChunkEmbeddings(document.id, modelId, dim, new Map([[0, 'nope' as unknown as Float32Array]]))
  );
  expectStoreError('STORE_DOCUMENT_MISSING', () => store.saveChunkEmbeddings('missing-doc', modelId, dim, new Map()));
  assert.equal(store.clearChunkEmbeddings(document.id, 'other-model'), 0);
  assert.equal(store.clearChunkEmbeddings(document.id, modelId), expectedEmbedded);
  assert.equal(store.listChunkEmbeddings(document.id, modelId).size, 0);

  // Re-chunking invalidates vectors: the text they described is gone.
  store.saveChunkEmbeddings(document.id, modelId, dim, new Map([[0, vectorFor(0.5)]]));
  store.replaceChunks(document.id, chunks);
  assert.equal(store.listChunkEmbeddings(document.id, modelId).size, 0);

  // --- Analyses + recommendations -----------------------------------------
  const analysis: LessonAnalysis = { ...analysisTemplate, documentId: document.id, sourceDocumentIds: [document.id] };
  const savedAnalysis = store.saveAnalysis(analysis);
  assert.equal(savedAnalysis.id, 'analysis-1');
  assert.deepEqual(store.getAnalysis('analysis-1')?.objectives, analysis.objectives);
  assert.equal(store.listAnalyses(document.id).length, 1);

  store.saveAnalysis({ ...analysis, id: 'analysis-2', topic: 'Phép trừ' });
  assert.equal(store.listAnalyses(document.id).length, 2);
  assert.equal(store.getAnalysis('analysis-2')?.topic, 'Phép trừ');

  // Document library projection: newest analysis first, no text body.
  const library = await store.listDocumentLibrary();
  assert.equal(library.length, 1);
  assert.equal(library[0].id, document.id);
  assert.equal(library[0].sourceAvailable, true);
  assert.equal(library[0].analyses.length, 2);
  assert.deepEqual(library[0].analyses.map(item => item.id).sort(), ['analysis-1', 'analysis-2']);
  assert.equal('text' in library[0], false);
  const sourcePath = path.join(lessonsDir, `${document.id}.txt`);
  await fs.rename(sourcePath, `${sourcePath}.bak`);
  try {
    const missingSource = await store.listDocumentLibrary();
    assert.equal(missingSource[0].sourceAvailable, false);
  } finally {
    await fs.rename(`${sourcePath}.bak`, sourcePath);
  }

  const recommendations = [
    { id: 'rec-1', schemaVersion: 1 as const, analysisId: 'analysis-1', gameType: 'arena' as const, title: 'Đấu trường', description: 'Mô tả', reason: 'Phù hợp', learningObjectiveIds: ['o1'], suggestedDurationMinutes: 15, createdAt: ISO },
    { id: 'rec-2', schemaVersion: 1 as const, analysisId: 'analysis-1', gameType: 'matching' as const, title: 'Ghép cặp', description: 'Mô tả', reason: 'Phù hợp', learningObjectiveIds: ['o1'], suggestedDurationMinutes: 10, createdAt: ISO }
  ];
  store.saveRecommendations('analysis-1', recommendations);
  assert.equal(store.listRecommendations('analysis-1').length, 2);
  store.saveRecommendations('analysis-1', [recommendations[0]]);
  assert.equal(store.listRecommendations('analysis-1').length, 1, 'saving recommendations must replace the previous set');
  expectStoreError('STORE_INVALID_RECOMMENDATION', () => store.saveRecommendations('missing-analysis', [recommendations[0]]));

  // --- Projects ------------------------------------------------------------
  const savedProject = store.saveProject(arenaProject());
  assert.equal(savedProject.id, 'project-1');
  assert.equal(savedProject.createdAt, ISO);
  assert.notEqual(savedProject.updatedAt, undefined);
  assert.deepEqual(store.getProject('project-1'), savedProject);
  assert.equal(store.getProject('missing-project'), null);

  const snapshotGame = toEducationalGame(arenaProject({ id: 'project-2', gameSnapshot: null, gameId: 'game-2' }));
  const matchingProject: GameProject = {
    id: 'project-2',
    schemaVersion: 1,
    status: 'ready',
    step: 'done',
    title: 'Ghép cặp',
    description: 'Mô tả',
    tags: ['AI tạo'],
    sourceName: 'bai.txt',
    lesson: null,
    analysisId: null,
    recommendationId: null,
    config: matchingConfig,
    draft: matchingDraft,
    gameSnapshot: null,
    gameId: 'game-2',
    createdAt: ISO,
    updatedAt: ISO
  };
  const matchingSnapshot = toEducationalGame(matchingProject);
  const savedMatching = store.saveProject({ ...matchingProject, gameSnapshot: matchingSnapshot });
  assert.equal(savedMatching.gameId, 'game-2');
  assert.equal(store.listProjects().length, 2);
  assert.deepEqual(store.getProject('project-2')?.gameSnapshot, matchingSnapshot);

  // --- .egame JSON round-trip of a stored snapshot ------------------------
  const storedMatching = store.getProject('project-2');
  assert.ok(storedMatching?.gameSnapshot, 'stored snapshot is present before the round-trip');
  const packageJson = JSON.parse(JSON.stringify({ packageFormat: 'edugame', packageVersion: 1, game: storedMatching?.gameSnapshot }));
  assert.equal(packageJson.packageFormat, 'edugame');
  assert.deepEqual(packageJson.game, storedMatching?.gameSnapshot);

  // Saving again updates the same row (createdAt preserved).
  const updatedProject = store.saveProject({ ...arenaProject(), step: 'edit', description: 'Đã sửa' });
  assert.equal(updatedProject.createdAt, savedProject.createdAt);
  assert.equal(store.listProjects().length, 2);
  assert.equal(store.getProject('project-1')?.step, 'edit');
  assert.equal(snapshotGame.template, 'quiz');

  assert.equal(store.deleteProject('project-2'), true);
  assert.equal(store.deleteProject('project-2'), false);
  assert.equal(store.listProjects().length, 1);

  // --- Project validation --------------------------------------------------
  expectStoreError('PROJECT_VERSION_UNSUPPORTED', () => store.saveProject(arenaProject({ id: 'p-future', schemaVersion: 2 as 1 })));
  expectStoreError('PROJECT_MIGRATION_MISSING', () => store.saveProject({ ...arenaProject({ id: 'p-old' }), schemaVersion: 0 as 1 }));
  expectStoreError('STORE_INVALID_PROJECT', () => store.saveProject(arenaProject({ id: 'p-bad-draft', draft: { ...arenaDraft, questions: [] } as unknown as GameProject['draft'] })));
  expectStoreError('STORE_INVALID_PROJECT', () => store.saveProject(arenaProject({ id: 'p-type', config: matchingConfig })));
  expectStoreError('STORE_INVALID_PROJECT', () => store.saveProject(arenaProject({ id: 'p-status', status: 'weird' as GameProject['status'] })));

  const badSnapshot = { ...matchingSnapshot, matchingGame: { ...matchingSnapshot.matchingGame!, pairs: matchingSnapshot.matchingGame!.pairs.slice(0, 1) } } as EducationalGame;
  expectStoreError('PROJECT_SNAPSHOT_INVALID', () => store.saveProject({ ...matchingProject, id: 'p-snapshot', gameSnapshot: badSnapshot }));

  // --- .egame JSON round-trip of a stored snapshot ------------------------
  // (covered above, before the project was deleted)

  // --- P4 project builders produce store-valid projects --------------------
  const builtProject = createProjectFromAnalysis({
    projectId: 'project-built',
    document: { documentId: document.id, name: document.name, characters: document.characters },
    analysis,
    now: ISO
  });
  const savedBuilt = store.saveProject(builtProject);
  assert.equal(savedBuilt.step, 'recommend');
  assert.equal(savedBuilt.analysisId, 'analysis-1');
  const advancedBuilt = store.saveProject(advanceAfterRecommendations(savedBuilt, ISO));
  assert.equal(advancedBuilt.step, 'configure');
  assert.equal(advancedBuilt.status, 'review');
  assert.equal(store.getProject('project-built')?.step, 'configure');

  // --- Version guards on read ---------------------------------------------
  db.prepare('INSERT INTO game_projects (id,game_id,status,step,data_json,schema_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('p-future-row', null, 'draft', 'input', JSON.stringify(arenaProject({ id: 'p-future-row' })), 2, ISO, ISO);
  expectStoreError('PROJECT_VERSION_UNSUPPORTED', () => store.getProject('p-future-row'));
  db.prepare('INSERT INTO game_projects (id,game_id,status,step,data_json,schema_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('p-old-row', null, 'draft', 'input', JSON.stringify(arenaProject({ id: 'p-old-row' })), 0, ISO, ISO);
  expectStoreError('PROJECT_MIGRATION_MISSING', () => store.getProject('p-old-row'));
  db.prepare('INSERT INTO game_projects (id,game_id,status,step,data_json,schema_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('p-corrupt', null, 'draft', 'input', '{not json', 1, ISO, ISO);
  expectStoreError('STORE_CORRUPT_JSON', () => store.getProject('p-corrupt'));

  db.prepare('INSERT INTO lesson_analyses (id,document_id,data_json,schema_version,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run('analysis-future', document.id, JSON.stringify({ ...analysis, id: 'analysis-future' }), 2, ISO, ISO);
  expectStoreError('ANALYSIS_VERSION_UNSUPPORTED', () => store.getAnalysis('analysis-future'));

  // --- O5: analysis cache key ---------------------------------------------
  const analysisCacheKey = 'analysis_v1_test_key';
  store.saveAnalysis({ ...analysis, id: 'analysis-cached' }, { cacheKey: analysisCacheKey });
  assert.equal(store.findAnalysisByCacheKey(document.id, analysisCacheKey)?.id, 'analysis-cached');
  assert.equal(store.findAnalysisByCacheKey(document.id, 'another-key'), null);
  assert.equal(store.findAnalysisByCacheKey('missing-doc', analysisCacheKey), null);
  assert.equal(store.findAnalysisByCacheKey(document.id, ''), null);
  // A teacher edit arrives without a cache key; the row must keep its key so the
  // edited analysis is what a later automatic analyze reuses.
  store.saveAnalysis({ ...analysis, id: 'analysis-cached', topic: 'Chủ đề giáo viên sửa' });
  assert.equal(store.findAnalysisByCacheKey(document.id, analysisCacheKey)?.topic, 'Chủ đề giáo viên sửa');

  // --- O5: generation cache ------------------------------------------------
  assert.equal(store.getGenerationCache('missing-key'), null);
  const draftPayload = { draft: arenaDraft, mode: 'fast', context: { chunkCount: 1 } };
  const cacheEntry = store.putGenerationCache({
    cacheKey: 'draft_key_1',
    gameType: 'arena',
    analysisId: 'analysis-1',
    modelId: 'qwen-test',
    promptVersion: 'draft-v1',
    payload: draftPayload
  });
  assert.equal(cacheEntry.kind, 'draft');
  assert.equal(cacheEntry.analysisId, 'analysis-1');
  assert.deepEqual(store.getGenerationCache('draft_key_1')?.payload, draftPayload);
  store.putGenerationCache({
    cacheKey: 'draft_key_1',
    gameType: 'arena',
    modelId: 'qwen-test',
    promptVersion: 'draft-v1',
    payload: { draft: arenaDraft, mode: 'deep' }
  });
  assert.equal(store.getGenerationCache('draft_key_1')?.payload.mode, 'deep', 'upsert replaces the payload');
  expectStoreError('STORE_INVALID_ANALYSIS', () => store.putGenerationCache({ cacheKey: '', gameType: 'arena', modelId: 'qwen', promptVersion: 'v1', payload: {} }));
  expectStoreError('STORE_INVALID_ANALYSIS', () => store.putGenerationCache({ cacheKey: 'k', gameType: 'arena', modelId: 'qwen', promptVersion: 'v1', payload: 'not-an-object' }));

  // A corrupt row is a cache miss, and is dropped instead of failing generation.
  db.prepare('INSERT INTO ai_generation_cache (cache_key,kind,game_type,analysis_id,model_id,prompt_version,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('draft_corrupt', 'draft', 'arena', null, 'qwen-test', 'draft-v1', '{not json', ISO);
  assert.equal(store.getGenerationCache('draft_corrupt'), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ai_generation_cache WHERE cache_key='draft_corrupt'").get().count, 0);

  // Pruning keeps the newest rows only.
  assert.equal(store.deleteGenerationCache('draft_key_1'), true);
  assert.equal(store.deleteGenerationCache('draft_key_1'), false);
  db.prepare('INSERT INTO ai_generation_cache (cache_key,kind,game_type,analysis_id,model_id,prompt_version,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('draft_old', 'draft', 'arena', null, 'qwen-test', 'draft-v1', '{}', '2025-01-01T00:00:00.000Z');
  db.prepare('INSERT INTO ai_generation_cache (cache_key,kind,game_type,analysis_id,model_id,prompt_version,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('draft_new', 'draft', 'arena', null, 'qwen-test', 'draft-v1', '{}', '2026-06-01T00:00:00.000Z');
  assert.equal(store.pruneGenerationCache(1), 1);
  assert.equal(store.getGenerationCache('draft_old'), null);
  assert.ok(store.getGenerationCache('draft_new'));
  assert.ok(store.clearGenerationCache() >= 1);
  assert.equal(store.getGenerationCache('draft_new'), null);

  // O5 migration: a database created before the cache key column gets it added.
  const legacyDb = new Database(':memory:');
  legacyDb.exec(`
    CREATE TABLE lesson_documents (id TEXT PRIMARY KEY);
    CREATE TABLE lesson_analyses (
      id TEXT PRIMARY KEY, document_id TEXT NOT NULL, data_json TEXT NOT NULL,
      schema_version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  const legacyStore = new LessonStore({ db: legacyDb as unknown as LessonStoreDatabase, lessonsDir });
  legacyStore.ensureSchema();
  const analysisColumns = (legacyDb.prepare('PRAGMA table_info(lesson_analyses)').all() as Array<{ name: string }>).map(column => column.name);
  assert.ok(analysisColumns.includes('cache_key'), 'O5 migration adds lesson_analyses.cache_key');
  legacyStore.ensureSchema(); // idempotent
  legacyDb.close();

  // --- Cascade delete keeps projects --------------------------------------
  assert.equal(await store.deleteDocument(document.id), true);
  assert.equal(store.getDocument(document.id), null);
  assert.equal(store.getAnalysis('analysis-1'), null, 'deleting a document cascades analyses');
  assert.equal(store.listRecommendations('analysis-1').length, 0, 'deleting a document cascades recommendations');
  assert.equal(store.getAnalysis('analysis-2'), null);
  assert.equal(store.countChunks(document.id), 0, 'deleting a document removes its cached chunks');
  const fileExists = await fs.stat(path.join(lessonsDir, `${document.id}.txt`)).then(() => true).catch(() => false);
  assert.equal(fileExists, false, 'lesson text file is removed');
  assert.equal(store.getProject('project-1')?.id, 'project-1', 'projects keep their independent snapshot after lesson cleanup');

  // --- Legacy tables untouched --------------------------------------------
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM games').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);
  assert.equal(db.prepare("SELECT data_json FROM games WHERE id='legacy-game'").get().data_json, '{"id":"legacy-game"}');
  assert.equal(db.prepare("SELECT data_json FROM sessions WHERE id='legacy-session'").get().data_json, '{"id":"legacy-session"}');

  // --- .egame JSON round-trip of a stored snapshot ------------------------
  const stored = store.getProject('project-1');
  assert.equal(stored?.gameSnapshot, null);

  // Schema SQL is exported so main can create tables even without the store.
  assert.equal(LESSON_STORE_SCHEMA_SQL.includes('CREATE TABLE IF NOT EXISTS game_projects'), true);

  db.close();
  await fs.rm(root, { recursive: true, force: true });
  console.log('Lesson store tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
