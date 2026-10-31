import assert from 'node:assert/strict';
import {
  analysisFingerprint,
  buildAnalysisCacheKey,
  buildClassificationCacheKey,
  buildGenerationCacheKey,
  cacheKey,
  CLASSIFIER_VERSION,
  configFingerprint,
  sha256Hex,
  stableJson
} from '../../src/services/lesson-cache';
import type { ArenaConfig, LessonAnalysis } from '../../src/shared/lesson-types';

const analysis: LessonAnalysis = {
  id: 'analysis-1',
  schemaVersion: 1,
  documentId: 'doc-1',
  subject: 'Sinh học',
  grade: 8,
  topic: 'Quang hợp',
  objectives: [
    { id: 'o1', description: 'Mô tả quá trình quang hợp.', cognitiveLevel: 'understand' },
    { id: 'o2', description: 'Giải thích vai trò của ánh sáng.', cognitiveLevel: 'apply' }
  ],
  keyConcepts: [
    { id: 'k1', term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ nhờ ánh sáng.' }
  ],
  uncertainties: ['Chưa rõ thời lượng bài.'],
  sourceDocumentIds: ['doc-1'],
  createdAt: '2026-01-01T00:00:00.000Z'
};

const baseConfig: ArenaConfig = {
  gameType: 'arena',
  title: 'Đấu trường quang hợp',
  subject: 'Sinh học',
  grade: 'Lớp 8',
  topic: 'Quang hợp',
  audience: 'teen',
  durationMinutes: 15,
  difficulty: 'trung bình',
  playMode: 'individual',
  style: 'fun',
  focusObjectiveIds: ['o1'],
  generationMode: 'fast',
  questionCount: 8,
  scoringMode: 'basic',
  pointsPerCorrect: 100,
  timeBonus: 0
};

function run(): void {
  // --- Hashing helpers ------------------------------------------------------
  assert.equal(sha256Hex('abc'), sha256Hex('abc'));
  assert.notEqual(sha256Hex('abc'), sha256Hex('abd'));
  assert.equal(stableJson({ b: 1, a: [{ d: 2, c: 3 }] }), stableJson({ a: [{ c: 3, d: 2 }], b: 1 }));
  assert.notEqual(cacheKey('draft', ['a', 'b']), cacheKey('draft', ['ab']));

  // --- Analysis key ---------------------------------------------------------
  const analysisInput = { documentSha256: sha256Hex('Giáo án'), modelId: 'qwen-a', mode: 'fast', sourceName: 'bai.txt' };
  const analysisKey = buildAnalysisCacheKey(analysisInput);
  assert.equal(buildAnalysisCacheKey({ ...analysisInput }), analysisKey, 'same inputs → same key');
  assert.notEqual(buildAnalysisCacheKey({ ...analysisInput, documentSha256: sha256Hex('Giáo án mới') }), analysisKey, 'lesson change invalidates');
  assert.notEqual(buildAnalysisCacheKey({ ...analysisInput, modelId: 'qwen-b' }), analysisKey, 'model change invalidates');
  assert.notEqual(buildAnalysisCacheKey({ ...analysisInput, mode: 'deep' }), analysisKey, 'mode change invalidates');
  assert.notEqual(buildAnalysisCacheKey({ ...analysisInput, sourceName: 'khac.txt' }), analysisKey, 'source name is part of the prompt');

  // --- Analysis fingerprint (generation input) ------------------------------
  const fingerprint = analysisFingerprint(analysis);
  assert.equal(analysisFingerprint({ ...analysis, id: 'analysis-2', createdAt: '2027-01-01T00:00:00.000Z' }), fingerprint, 'identity/timestamp do not matter');
  assert.equal(analysisFingerprint({ ...analysis, uncertainties: ['Khác'] }), fingerprint, 'uncertainties are not sent to the draft prompt');
  assert.notEqual(
    analysisFingerprint({ ...analysis, objectives: [analysis.objectives[0]] }),
    fingerprint,
    'removing an objective invalidates'
  );
  assert.notEqual(
    analysisFingerprint({ ...analysis, keyConcepts: [{ ...analysis.keyConcepts[0], explanation: 'Khác.' }] }),
    fingerprint,
    'editing a concept explanation invalidates'
  );

  // --- Config fingerprint ---------------------------------------------------
  const configFingerprintValue = configFingerprint(baseConfig);
  assert.equal(configFingerprint({ ...baseConfig }), configFingerprintValue);
  assert.notEqual(configFingerprint({ ...baseConfig, questionCount: 9 }), configFingerprintValue, 'question count is part of the prompt');
  assert.notEqual(configFingerprint({ ...baseConfig, title: 'Khác' }), configFingerprintValue);
  assert.notEqual(configFingerprint({ ...baseConfig, focusObjectiveIds: ['o2'] }), configFingerprintValue);

  // --- Generation key -------------------------------------------------------
  const generationInput = {
    documentId: 'doc-1',
    analysisFingerprint: fingerprint,
    gameType: 'arena',
    configFingerprint: configFingerprintValue,
    modelId: 'qwen-a',
    mode: 'fast'
  };
  const generationKey = buildGenerationCacheKey(generationInput);
  assert.equal(buildGenerationCacheKey({ ...generationInput }), generationKey);
  assert.notEqual(buildGenerationCacheKey({ ...generationInput, gameType: 'race' }), generationKey, 'genre change invalidates');
  assert.notEqual(buildGenerationCacheKey({ ...generationInput, documentId: 'doc-2' }), generationKey, 'another lesson invalidates');
  assert.notEqual(buildGenerationCacheKey({ ...generationInput, analysisFingerprint: analysisFingerprint({ ...analysis, topic: 'Hô hấp' }) }), generationKey);
  assert.notEqual(buildGenerationCacheKey({ ...generationInput, mode: 'deep' }), generationKey);
  assert.notEqual(buildGenerationCacheKey({ ...generationInput, configFingerprint: configFingerprint({ ...baseConfig, difficulty: 'khó' }) }), generationKey);

  // Analysis and generation keys never collide.
  assert.notEqual(analysisKey, generationKey);

  // --- Classification key (update_quy_trinh_2 §6) ---------------------------
  const classifyInput = { text: 'I. Mục tiêu\nII. Hoạt động', embeddingModelId: 'minilm-1' };
  const classifyKey = buildClassificationCacheKey(classifyInput);
  assert.equal(buildClassificationCacheKey({ ...classifyInput }), classifyKey, 'deterministic');
  assert.notEqual(buildClassificationCacheKey({ ...classifyInput, text: 'I. Mục tiêu' }), classifyKey, 'editing the selected text invalidates');
  assert.notEqual(buildClassificationCacheKey({ ...classifyInput, embeddingModelId: 'minilm-2' }), classifyKey, 'another embedding model invalidates');
  assert.notEqual(buildClassificationCacheKey({ ...classifyInput, classifierVersion: CLASSIFIER_VERSION + 1 }), classifyKey, 'a rules change invalidates');
  assert.notEqual(buildClassificationCacheKey({ text: 'abc' }), classifyKey, 'rules-only key differs from a semantic key');
  // The key must never carry lesson content.
  assert.ok(!classifyKey.includes('Mục tiêu'), 'the key is a hash, not the text');
  assert.notEqual(classifyKey, analysisKey);
  assert.notEqual(classifyKey, generationKey);

  // #132: the provider is part of the analysis key. Same lesson + model on two
  // providers must not share a cached analysis; no provider keeps the old key.
  const docHash = sha256Hex('giáo án');
  const localKey = buildAnalysisCacheKey({ documentSha256: docHash, modelId: 'm', mode: 'fast', provider: 'local' });
  const geminiKey = buildAnalysisCacheKey({ documentSha256: docHash, modelId: 'm', mode: 'fast', provider: 'gemini' });
  const noProvider = buildAnalysisCacheKey({ documentSha256: docHash, modelId: 'm', mode: 'fast' });
  assert.notEqual(localKey, geminiKey, 'two providers never share an analysis');
  assert.notEqual(noProvider, localKey, 'a provider is part of the key');
  assert.equal(
    buildAnalysisCacheKey({ documentSha256: docHash, modelId: 'm', mode: 'fast' }),
    buildAnalysisCacheKey({ documentSha256: docHash, modelId: 'm', mode: 'fast', provider: '' }),
    'an absent provider is stable'
  );

  // #132 D13: a draft is also per provider (the explicit cloud button vs. AI local).
  const draftBase = { documentId: 'd', analysisFingerprint: 'f', gameType: 'arena', configFingerprint: 'c', modelId: 'm', mode: 'fast' };
  assert.equal(
    buildGenerationCacheKey(draftBase),
    buildGenerationCacheKey({ ...draftBase, provider: '' }),
    'no provider keeps the pre-#132 draft key'
  );
  assert.notEqual(
    buildGenerationCacheKey({ ...draftBase, provider: 'gemini' }),
    buildGenerationCacheKey({ ...draftBase, provider: 'local' }),
    'a draft from one provider is not reused by another'
  );

  console.log('Lesson cache tests passed');
}

run();
