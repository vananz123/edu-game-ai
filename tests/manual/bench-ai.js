#!/usr/bin/env node
/**
 * O6 benchmark for the lesson-to-game workflow (docs/archive/specs/update-AI-local.txt §5.3,
 * §5.4, §12).
 *
 * It talks to a llama-server that is already listening (same arguments the app
 * uses) and replays the *real* prompts, schemas, validators and adapter, so the
 * numbers describe the shipped workflow rather than a toy prompt:
 *
 *   llama-server.exe --model qwen3.5-2b-q4_k_m-31e04817b38d.gguf ^
 *     --alias qwen3.5-2b --host 127.0.0.1 --port 9342 ^
 *     --ctx-size 8192 --threads 4 --n-gpu-layers 0
 *
 *   node tests/manual/bench-ai.js --url http://127.0.0.1:9342 --phase analyze,generate --modes fast,deep
 *
 * Phases:
 *   analyze   one `lesson:analyze` per lesson/mode (real prompt + json_schema).
 *   generate  one `lesson:generate` (arena) per lesson/mode, using the analysis
 *             produced in this run and the lexical retrieval budget.
 *   batch     §5.4 comparison on the first lesson: one 6-question request versus
 *             6 single-item requests (the batch size the app ships today).
 *
 * The corpus is synthetic Vietnamese lesson text (no student data). Every
 * derived number is printed and, with --out, written as JSON.
 */
const path = require('node:path');
const fs = require('node:fs');

const DIST = path.join(__dirname, '..', 'dist');
const services = (...parts) => require(path.join(DIST, 'src', 'services', ...parts));
const {
  AiRequestRegistry,
  AiTransportError,
  buildChatRequestBody,
  parseModelJson,
  readAssistantContent
} = services('ai-transport.js');
const { buildGenerationOptions } = require(path.join(DIST, 'src', 'ai-core', 'generation-options.js'));
const { analyzeLesson, generateGameDraft, regenerateGameItem } = services('lesson-workflow.js');
const { parseGameDraft } = services('lesson-contracts.js');
const { toEducationalGame } = services('game-project-adapter.js');
const { checkDraftQuality } = services('lesson-quality.js');
const { chunkLessonText } = services('lesson-chunker.js');
const { buildRetrievalQuery, selectChunks, DEEP_MAX_SELECTED_CHUNKS, DEEP_MAX_SELECTED_CHARS } = services('lesson-retrieval.js');
const { formatRetrievedChunks } = services('lesson-prompts.js');
const { tokenizeForRetrieval } = services('lesson-retrieval.js');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const url = String(args.url || 'http://127.0.0.1:9342').replace(/\/+$/, '');
const model = String(args.model || 'qwen3.5-2b');
const phases = String(args.phase || 'analyze,generate').split(',').map(value => value.trim()).filter(Boolean);
const modes = String(args.modes || 'fast,deep').split(',').map(value => value.trim()).filter(Boolean);
const questionCount = clampInt(args.questions, 8, 1, 20);
const limit = Number(args.limit) || 0;
const from = Math.max(0, Number(args.from) || 0);
const timeoutMs = Number(args.timeout) * 1000 || 600_000;
const thinkingProbe = Boolean(args.thinking);
/** Optional budget overrides for experiments; defaults match main.ts. */
const analyzeTokensOverride = Number(args['analyze-tokens']) || 0;
const generateTokensOverride = Number(args['generate-tokens']) || 0;
const analyzeMax = mode => analyzeTokensOverride || (mode === 'deep' ? 2560 : 2048);
const generateMax = mode => generateTokensOverride || (mode === 'deep' ? 4096 : 2048);
const corpusPath = args.corpus
  ? path.resolve(String(args.corpus))
  : path.join(__dirname, 'fixtures', 'bench', 'lessons.json');
const outPath = args.out ? path.resolve(String(args.out)) : '';
/**
 * Optional on-disk analysis reuse, mirroring the app's analysis cache: reruns of
 * the generation/batch phases should not pay for the same analyze call again.
 * `--force-analyze` ignores the file.
 */
const analysisCachePath = args['analysis-cache'] ? path.resolve(String(args['analysis-cache'])) : '';
let analysisCache = {};
if (analysisCachePath && fs.existsSync(analysisCachePath)) {
  try { analysisCache = JSON.parse(fs.readFileSync(analysisCachePath, 'utf8')); } catch { analysisCache = {}; }
}
function saveAnalysisCache() {
  if (!analysisCachePath) return;
  fs.writeFileSync(analysisCachePath, JSON.stringify(analysisCache, null, 2));
}

function clampInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

// ---------------------------------------------------------------------------
// Model client: the same request body as `createLessonChatClient()` in main.ts,
// plus bookkeeping for tokens/latency. No fixtures, no cache, no fallback.
// ---------------------------------------------------------------------------

const registry = new AiRequestRegistry();
let requestCounter = 0;
let connectionFailed = false;
const requests = [];

function createClient({ mode, phase, lessonId, thinking = false, bucket = [] }) {
  return {
    async chatJson({ messages, maxTokens, responseSchema, signal }) {
      requestCounter += 1;
      const generation = buildGenerationOptions('local', maxTokens);
      if (thinking) generation.chat_template_kwargs = { enable_thinking: true };
      const body = buildChatRequestBody({
        model,
        mode: 'local',
        temperature: 0.2,
        generation,
        messages,
        responseSchema: responseSchema || null
      });
      const started = Date.now();
      const entry = { phase, lessonId, mode, thinking, status: 'error' };
      requests.push(entry);
      bucket.push(entry);
      try {
        const combined = signal && typeof AbortSignal.any === 'function'
          ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs);
        const response = await fetch(`${url}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: combined
        });
        const text = await response.text();
        entry.ms = Date.now() - started;
        if (!response.ok) {
          throw new AiTransportError('AI_HTTP', `HTTP ${response.status}: ${text.slice(0, 300)}`);
        }
        const data = JSON.parse(text);
        const choice = (data.choices && data.choices[0]) || {};
        entry.finish = choice.finish_reason;
        entry.usage = data.usage || null;
        entry.timings = data.timings || null;
        entry.reasoningChars = ((choice.message && choice.message.reasoning_content) || '').length;
        entry.contentChars = ((choice.message && choice.message.content) || '').length;
        entry.status = 'ok';
        return parseModelJson(readAssistantContent(data));
      } catch (error) {
        entry.ms = entry.ms || Date.now() - started;
        entry.error = error && error.message ? error.message : String(error);
        // Match the app: a dead server / socket failure is a connection problem,
        // not invalid model output.
        if (error && (error.name === 'TypeError' || error.name === 'TimeoutError')) {
          const wrapped = new AiTransportError(
            'AI_CONNECTION',
            `Mất kết nối tới llama-server (${url}): ${entry.error}`
          );
          entry.error = wrapped.message;
          entry.code = wrapped.code;
          connectionFailed = true;
          throw wrapped;
        }
        throw error;
      }
    }
  };
}

function usageOf(entries) {
  let prompt = 0;
  let completion = 0;
  let promptMs = 0;
  let predictedMs = 0;
  for (const entry of entries) {
    if (entry.usage) {
      prompt += entry.usage.prompt_tokens || 0;
      completion += entry.usage.completion_tokens || 0;
    }
    if (entry.timings) {
      promptMs += entry.timings.prompt_ms || 0;
      predictedMs += entry.timings.predicted_ms || 0;
    }
  }
  return { promptTokens: prompt, completionTokens: completion, promptMs, predictedMs };
}

// ---------------------------------------------------------------------------
// Config/project used by the generation phase (arena is the most common genre).
// ---------------------------------------------------------------------------

function buildArenaConfig(lesson, count) {
  return {
    gameType: 'arena',
    title: `Đấu trường: ${lesson.name.replace(/\.txt$/i, '')}`,
    subject: lesson.subject,
    grade: lesson.grade,
    topic: lesson.name.replace(/\.txt$/i, ''),
    audience: Number(lesson.grade) <= 5 ? 'child' : 'teen',
    durationMinutes: 15,
    difficulty: 'trung bình',
    playMode: 'individual',
    style: 'competition',
    focusObjectiveIds: [],
    generationMode: 'fast',
    questionCount: count,
    scoringMode: 'basic',
    pointsPerCorrect: 100,
    timeBonus: 20
  };
}

function buildProject(lesson, config, draft) {
  const now = new Date().toISOString();
  return {
    id: `bench-${lesson.id}`,
    schemaVersion: 1,
    status: 'draft',
    step: 'generate',
    title: config.title,
    description: '',
    tags: [],
    sourceName: lesson.name,
    lesson: null,
    analysisId: null,
    recommendationId: null,
    config,
    draft,
    createdAt: now,
    updatedAt: now
  };
}

/** Lexical grounding proxy: >= 2 content tokens (length >= 4) shared with the lesson. */
const GENERIC_TOKENS = new Set([
  'nhung', 'duoc', 'trong', 'nhieu', 'thong', 'dung', 'chinh', 'giup', 'theo', 'bang', 'cung', 'khong',
  'nhung', 'phai', 'cach', 'buoc', 'hoc', 'sinh', 'cau', 'hoi', 'dap', 'an', 'phuong', 'tinh', 'nao'
]);

function groundingRate(draft, lessonText) {
  const lessonTokens = new Set(tokenizeForRetrieval(lessonText).filter(token => token.length >= 4));
  const items = Array.isArray(draft.questions) ? draft.questions : [];
  if (!items.length) return { grounded: 0, total: 0, rate: null };
  let grounded = 0;
  for (const question of items) {
    const texts = [question.prompt, question.explanation, question.correctAnswer]
      .filter(value => typeof value === 'string');
    const tokens = new Set(texts.flatMap(text => tokenizeForRetrieval(text))
      .filter(token => token.length >= 4 && !GENERIC_TOKENS.has(token)));
    let shared = 0;
    for (const token of tokens) if (lessonTokens.has(token)) shared += 1;
    if (shared >= 2) grounded += 1;
  }
  return { grounded, total: items.length, rate: grounded / items.length };
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

const summaries = [];

async function runAnalyze(lesson, mode) {
  const entries = [];
  const client = createClient({ mode, phase: 'analyze', lessonId: lesson.id, bucket: entries });
  const started = Date.now();
  let analysis = null;
  let error = null;
  try {
    analysis = await analyzeLesson({
      client,
      registry,
      requestId: `bench-analyze-${lesson.id}-${mode}-${requestCounter}`,
      documentId: `doc-${lesson.id}`,
      text: lesson.text,
      subject: lesson.subject,
      grade: lesson.grade,
      sourceName: lesson.name,
      maxTokens: analyzeMax(mode)
    });
  } catch (caught) {
    error = caught && caught.message ? caught.message : String(caught);
  }
  const result = {
    phase: 'analyze',
    lessonId: lesson.id,
    mode,
    ms: Date.now() - started,
    calls: entries.length,
    ok: Boolean(analysis),
    error,
    ...usageOf(entries),
    objectives: analysis ? analysis.objectives.length : 0,
    concepts: analysis ? analysis.keyConcepts.length : 0,
    finishReasons: entries.map(entry => entry.finish || entry.error || 'error')
  };
  summaries.push(result);
  console.log(`[analyze] ${lesson.id} ${mode}: ${result.ok ? 'OK' : 'FAIL'} ${result.ms}ms calls=${result.calls} ` +
    `prompt=${result.promptTokens} completion=${result.completionTokens}` + (error ? ` error=${error.slice(0, 160)}` : ''));
  return analysis;
}

async function runGenerate(lesson, mode, analysis) {
  const config = buildArenaConfig(lesson, questionCount);
  const chunks = chunkLessonText(lesson.text);
  const selectionOptions = mode === 'deep'
    ? { maxChunks: DEEP_MAX_SELECTED_CHUNKS, maxChars: DEEP_MAX_SELECTED_CHARS }
    : {};
  const selection = selectChunks(chunks, buildRetrievalQuery({ analysis, config }), selectionOptions);
  const sourceExcerpt = formatRetrievedChunks(selection.selected);
  const entries = [];
  const client = createClient({ mode, phase: 'generate', lessonId: lesson.id, bucket: entries });
  const started = Date.now();
  let draft = null;
  let error = null;
  try {
    draft = await generateGameDraft({
      client,
      registry,
      requestId: `bench-generate-${lesson.id}-${mode}-${requestCounter}`,
      gameType: 'arena',
      config,
      analysis,
      sourceExcerpt,
      maxTokens: generateMax(mode)
    });
  } catch (caught) {
    error = caught && caught.message ? caught.message : String(caught);
  }

  let adapterOk = false;
  let adapterError = null;
  let quality = null;
  let grounding = { grounded: 0, total: 0, rate: null };
  if (draft) {
    try {
      toEducationalGame(buildProject(lesson, config, draft));
      adapterOk = true;
    } catch (caught) {
      adapterError = caught && caught.message ? caught.message : String(caught);
    }
    quality = checkDraftQuality({ draft, config, analysis });
    grounding = groundingRate(draft, lesson.text);
  }

  const result = {
    phase: 'generate',
    lessonId: lesson.id,
    mode,
    ms: Date.now() - started,
    calls: entries.length,
    ok: Boolean(draft) && adapterOk,
    error: error || adapterError,
    ...usageOf(entries),
    items: draft && Array.isArray(draft.questions) ? draft.questions.length : 0,
    requestedItems: questionCount,
    qualityErrors: quality ? quality.errors : null,
    qualityWarnings: quality ? quality.warnings : null,
    qualityCodes: quality ? [...new Set(quality.issues.map(issue => issue.code))] : [],
    uncoveredObjectives: quality ? quality.uncoveredObjectiveIds.length : null,
    grounding,
    retrieval: {
      scorer: selection.scorer,
      chunks: selection.selected.length,
      characters: selection.characters,
      fallback: selection.fallback
    },
    finishReasons: entries.map(entry => entry.finish || entry.error || 'error')
  };
  summaries.push(result);
  console.log(`[generate] ${lesson.id} ${mode}: ${result.ok ? 'OK' : 'FAIL'} ${result.ms}ms calls=${result.calls} ` +
    `prompt=${result.promptTokens} completion=${result.completionTokens} items=${result.items}/${questionCount} ` +
    `grounded=${grounding.grounded}/${grounding.total}` + (result.error ? ` error=${result.error.slice(0, 160)}` : ''));
  return draft ? { draft, config, analysis, sourceExcerpt, selection } : null;
}

/**
 * §5.4: one 6-question request versus six single-item requests (the smallest
 * possible batch, already implemented as "Tạo lại"). The second variant replaces
 * every item of the one-shot draft, so ids/links and validation still run.
 */
async function runBatch(lesson, analysis) {
  const config = buildArenaConfig(lesson, questionCount);
  const chunks = chunkLessonText(lesson.text);
  const selection = selectChunks(chunks, buildRetrievalQuery({ analysis, config }));
  const sourceExcerpt = formatRetrievedChunks(selection.selected);

  const shotEntries = [];
  const shotClient = createClient({ mode: 'fast', phase: 'batch-one-shot', lessonId: lesson.id, bucket: shotEntries });
  let oneShot = null;
  const oneStarted = Date.now();
  let oneError = null;
  try {
    oneShot = await generateGameDraft({
      client: shotClient, registry,
      requestId: `bench-batch-one-${lesson.id}-${requestCounter}`,
      gameType: 'arena', config, analysis, sourceExcerpt, maxTokens: 2048
    });
  } catch (caught) { oneError = caught && caught.message ? caught.message : String(caught); }
  const oneResult = {
    phase: 'batch-one-shot', lessonId: lesson.id, mode: 'fast',
    ms: Date.now() - oneStarted, calls: shotEntries.length, ok: Boolean(oneShot), error: oneError,
    ...usageOf(shotEntries),
    items: oneShot ? oneShot.questions.length : 0,
    finishReasons: shotEntries.map(entry => entry.finish || entry.error || 'error')
  };
  summaries.push(oneResult);
  console.log(`[batch] one-shot ${lesson.id}: ${oneResult.ok ? 'OK' : 'FAIL'} ${oneResult.ms}ms ` +
    `calls=${oneResult.calls} completion=${oneResult.completionTokens} items=${oneResult.items}`);

  if (!oneShot) return;

  const itemResult = {
    phase: 'batch-per-item', lessonId: lesson.id, mode: 'fast',
    ms: 0, calls: 0, ok: false, items: 0, itemOk: 0,
    promptTokens: 0, completionTokens: 0, finishReasons: []
  };
  const started = Date.now();
  for (let position = 1; position <= oneShot.questions.length; position += 1) {
    const total = oneShot.questions.length;
    const entries = [];
    const client = createClient({ mode: 'fast', phase: 'batch-per-item', lessonId: lesson.id, bucket: entries });
    try {
      const item = await regenerateGameItem({
        client, registry,
        requestId: `bench-batch-item-${lesson.id}-${position}-${requestCounter}`,
        gameType: 'arena', config, analysis,
        position, total,
        itemLabel: `Câu hỏi ${position}`,
        currentItem: oneShot.questions[position - 1],
        sourceExcerpt,
        maxTokens: 1024
      });
      itemResult.itemOk += 1;
      itemResult.items += 1;
      console.log(`[batch] item ${position}/${total}: OK ${entries.map(entry => entry.ms).join('/')}ms`);
      void item;
    } catch (caught) {
      console.log(`[batch] item ${position}/${total}: FAIL ${caught && caught.message ? caught.message.slice(0, 160) : caught}`);
    }
    itemResult.calls += entries.length;
    const usage = usageOf(entries);
    itemResult.promptTokens += usage.promptTokens;
    itemResult.completionTokens += usage.completionTokens;
    itemResult.finishReasons.push(...entries.map(entry => entry.finish || entry.error || 'error'));
  }
  itemResult.ms = Date.now() - started;
  itemResult.ok = itemResult.itemOk === oneShot.questions.length;
  summaries.push(itemResult);
  console.log(`[batch] per-item ${lesson.id}: ${itemResult.ok ? 'OK' : 'PARTIAL'} ${itemResult.ms}ms ` +
    `calls=${itemResult.calls} ok=${itemResult.itemOk}/${oneShot.questions.length} completion=${itemResult.completionTokens}`);
}

/** §7: verify the GGUF/llama.cpp can toggle thinking (small, explicit probe). */
async function runThinkingProbe(lesson) {
  const entries = [];
  const client = createClient({ mode: 'fast', phase: 'thinking-probe', lessonId: lesson.id, thinking: true, bucket: entries });
  const started = Date.now();
  let ok = false;
  let error = null;
  try {
    await analyzeLesson({
      client, registry,
      requestId: `bench-thinking-${requestCounter}`,
      documentId: `doc-${lesson.id}`, text: lesson.text,
      subject: lesson.subject, grade: lesson.grade, sourceName: lesson.name,
      maxTokens: 1024
    });
    ok = true;
  } catch (caught) { error = caught && caught.message ? caught.message : String(caught); }
  const result = {
    phase: 'thinking-probe', lessonId: lesson.id, mode: 'deep', thinking: true,
    ms: Date.now() - started, calls: entries.length, ok, error,
    ...usageOf(entries),
    reasoningChars: entries.reduce((sum, entry) => sum + (entry.reasoningChars || 0), 0),
    finishReasons: entries.map(entry => entry.finish || entry.error || 'error')
  };
  summaries.push(result);
  console.log(`[thinking] ${ok ? 'OK' : 'FAIL'} ${result.ms}ms calls=${result.calls} ` +
    `completion=${result.completionTokens} reasoningChars=${result.reasoningChars}` + (error ? ` error=${error.slice(0, 160)}` : ''));
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function markdownTable(rows) {
  const header = '| Phase | Lesson | Mode | Calls | ms | Prompt tok | Completion tok | Items | Grounded | Result |\n|---|---|---|---:|---:|---:|---:|---:|---:|---|';
  const body = rows.map(row => `| ${row.phase} | ${row.lessonId} | ${row.mode} | ${row.calls} | ${row.ms} | ` +
    `${row.promptTokens} | ${row.completionTokens} | ${row.items === undefined ? '' : row.items} | ` +
    `${row.grounding && row.grounding.total ? `${row.grounding.grounded}/${row.grounding.total}` : ''} | ` +
    `${row.ok ? 'ok' : 'fail'} |`);
  return [header, ...body].join('\n');
}

function serverMemory() {
  if (process.platform !== 'win32') return null;
  try {
    const { execSync } = require('node:child_process');
    const output = execSync(
      'powershell -NoProfile -Command "Get-Process llama-server -ErrorAction SilentlyContinue | ' +
      'Sort-Object PeakWorkingSet64 -Descending | Select-Object -First 1 | ' +
      'ForEach-Object { $_.Id.ToString() + \' \' + $_.PeakWorkingSet64.ToString() + \' \' + $_.WorkingSet64.ToString() }"',
      { encoding: 'utf8', timeout: 15_000 }
    ).trim();
    if (!output) return null;
    const [pid, peak, working] = output.split(/\s+/);
    return { pid: Number(pid), peakBytes: Number(peak), workingSetBytes: Number(working) };
  } catch {
    return null;
  }
}

(async () => {
  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  const lessons = limit > 0 ? corpus.slice(from, from + limit) : corpus.slice(from);
  if (!lessons.length) throw new Error('Bộ giáo án rỗng.');
  console.log(`# bench-ai: ${lessons.length} lessons, url=${url}, model=${model}, phases=${phases.join(',')}, modes=${modes.join(',')}`);

  const analyses = new Map();
  let serverDown = false;

  for (const mode of modes) {
    for (const lesson of lessons) {
      const key = `${lesson.id}:${mode}`;
      if (phases.includes('analyze')) {
        const reusable = !args['force-analyze'] && analysisCache[key];
        if (reusable) {
          analyses.set(key, reusable);
          console.log(`[analyze] ${lesson.id} ${mode}: reused from ${path.basename(analysisCachePath)} (no model call)`);
        } else {
          const analysis = await runAnalyze(lesson, mode);
          if (analysis) {
            analyses.set(key, analysis);
            if (analysisCachePath) { analysisCache[key] = analysis; saveAnalysisCache(); }
          }
        }
      }
      if (phases.includes('generate')) {
        let analysis = analyses.get(`${lesson.id}:${mode}`);
        if (!analysis) {
          console.log(`[generate] skipping ${lesson.id} ${mode}: no analysis (run --phase analyze first)`);
          continue;
        }
        await runGenerate(lesson, mode, analysis);
      }
      if (connectionFailed) break;
    }
    if (connectionFailed) break;
  }

  if (phases.includes('thinking')) {
    await runThinkingProbe(lessons[0]);
  }

  if (phases.includes('batch')) {
    const lesson = lessons[0];
    const analysis = analyses.get(`${lesson.id}:fast`);
    if (!analysis) {
      console.log('[batch] skipped: the fast analysis of the first lesson is missing');
    } else {
      await runBatch(lesson, analysis);
    }
  }

  const memory = serverMemory();
  const report = {
    generatedAt: new Date().toISOString(),
    machine: {
      platform: process.platform,
      arch: process.arch,
      cpus: require('node:os').cpus().length,
      totalMemoryBytes: require('node:os').totalmem()
    },
    server: { url, model, memory },
    corpus: { path: corpusPath, lessons: lessons.length, characters: lessons.reduce((sum, lesson) => sum + lesson.text.length, 0) },
    requests,
    summaries
  };
  console.log('\n' + markdownTable(summaries));
  if (memory) {
    console.log(`\nServer RAM: peak=${(memory.peakBytes / 1048576).toFixed(0)} MB, working=${(memory.workingSetBytes / 1048576).toFixed(0)} MB (pid ${memory.pid})`);
  }
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\nJSON: ${outPath}`);
  }
})().catch(error => {
  console.error('bench failed:', error && error.stack ? error.stack : error);
  process.exit(1);
});
