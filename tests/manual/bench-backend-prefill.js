/**
 * Manual benchmark: CPU vs GPU (Vulkan) prompt-prefill on a real lesson document.
 *
 * Not part of `npm test`: it needs a downloaded runtime, an installed model and
 * several minutes of wall clock. Run it to decide whether the GPU backend is
 * actually faster on this machine before changing a default:
 *
 *   node tests/manual/bench-backend-prefill.js <doc.txt> <model.gguf> <runtimeDir>
 *
 * Prints the measured prefill tokens/second for `--n-gpu-layers 0` and
 * `--n-gpu-layers 99 --device Vulkan0`. Both runs use the app's exact flags, so
 * the numbers are comparable with docs/BENCHMARKS.md. Nothing is estimated: a
 * run that fails to start reports FAILED, never a guess.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

/**
 * POST JSON over node:http instead of `fetch`. A long CPU prefill can take
 * several minutes, which trips undici's 300 s header timeout inside `fetch` and
 * would abort a run that was about to succeed. node:http has no such limit.
 */
function postJson(port, payload) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: '/completion',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': body.length }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: response.statusCode, text });
      });
    });
    request.on('error', reject);
    request.setTimeout(0);
    request.end(body);
  });
}

function getHealth(port) {
  return new Promise(resolve => {
    const request = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 3000 }, response => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => { request.destroy(); resolve(false); });
  });
}

const [docPath, modelPath, runtimeDir] = process.argv.slice(2);
if (!docPath || !modelPath || !runtimeDir) {
  console.error('usage: node tests/manual/bench-backend-prefill.js <doc.txt> <model.gguf> <runtimeDir>');
  process.exit(2);
}

const PROMPT = fs.readFileSync(docPath, 'utf8');
const PORT = 18877;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(deadlineMs) {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    if (await getHealth(PORT)) return true;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

async function runBackend(label, extraArgs) {
  const args = [
    '--model', modelPath,
    '--alias', 'bench',
    '--host', '127.0.0.1',
    '--port', String(PORT),
    '--ctx-size', '16384',
    '--parallel', '1',
    '--ctx-checkpoints', '0',
    '--threads', String(Math.max(1, require('node:os').cpus().length)),
    '--no-warmup',
    ...extraArgs
  ];
  const child = spawn(path.join(runtimeDir, 'llama-server.exe'), args, {
    cwd: runtimeDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk.toString(); });
  child.stderr.on('data', chunk => { log += chunk.toString(); });

  try {
    if (!await waitForHealth(300_000)) {
      return { label, status: 'FAILED', detail: 'server did not become healthy', log: log.slice(-2000) };
    }
    // Warm up once so model page-in is not counted as prefill time.
    const warm = await postJson(PORT, { prompt: 'Xin chào', n_predict: 1 });
    if (warm.status !== 200) {
      console.log(`  [${label}] warmup said: ${warm.text.slice(0, 400)}`);
      return { label, status: 'FAILED', detail: `warmup HTTP ${warm.status}`, log: log.slice(-2000) };
    }

    const started = Date.now();
    const response = await postJson(PORT, { prompt: PROMPT, n_predict: 1, temperature: 0 });
    const elapsedMs = Date.now() - started;
    if (response.status !== 200) {
      console.log(`  [${label}] server said: ${response.text.slice(0, 800)}`);
      console.log(`  [${label}] server log tail: ${log.slice(-1500)}`);
      return { label, status: 'FAILED', detail: `HTTP ${response.status} ${response.text.slice(0, 500)}`, log: log.slice(-2000) };
    }
    const body = JSON.parse(response.text);
    return {
      label,
      status: 'OK',
      promptChars: PROMPT.length,
      promptTokens: body.timings && body.timings.prompt_n,
      prefillTokPerSec: body.timings && Number(body.timings.prompt_per_second.toFixed(2)),
      elapsedSec: Number((elapsedMs / 1000).toFixed(1))
    };
  } finally {
    child.kill();
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (!child.killed) child.kill('SIGKILL');
  }
}

async function main() {
  const results = [];
  results.push(await runBackend('cpu', ['--n-gpu-layers', '0']));
  results.push(await runBackend('vulkan', ['--n-gpu-layers', '99', '--device', 'Vulkan0']));
  for (const result of results) {
    if (result.status === 'OK') {
      console.log(
        `${result.label.padEnd(7)} OK   prefill ${result.prefillTokPerSec} tok/s  ` +
        `(${result.promptTokens} tokens, ${result.elapsedSec} s)`
      );
    } else {
      console.log(`${result.label.padEnd(7)} FAILED  ${result.detail}`);
    }
  }
  const [cpu, gpu] = results;
  if (cpu.status === 'OK' && gpu.status === 'OK' && cpu.prefillTokPerSec > 0) {
    const speedup = gpu.prefillTokPerSec / cpu.prefillTokPerSec;
    console.log(`prefill speedup: ${speedup.toFixed(2)}x`);
    console.log(speedup > 1
      ? 'VERDICT: GPU prefill is faster on this machine.'
      : 'VERDICT: GPU prefill is NOT faster here; keep the CPU default.');
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
