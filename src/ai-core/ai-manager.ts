import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import type { AiLifecycleState, AiRuntimeStatus, LocalAiRuntimeOptions } from './contracts';

export interface AiManagerOptions {
  executablePath: string;
  modelPath: string;
  modelId: string;
  contextSize: number;
  cpuThreads: number;
  gpuLayers: number;
  /** Vulkan device name from the manifest, e.g. `Vulkan0`. Omit for CPU. */
  device?: string;
  /**
   * Backend label reported in the status, e.g. 'vulkan' or 'cpu'.
   * The manager does not select it — the caller resolved it already — but the
   * UI must be able to say which one actually ended up running.
   */
  backend?: string;
  startupTimeoutMs?: number;
  healthIntervalMs?: number;
  shutdownTimeoutMs?: number;
}

interface AiManagerDependencies {
  spawnProcess?: typeof spawn;
  buildArguments?: (modelPath: string, options: LocalAiRuntimeOptions) => string[];
  fetchHealth?: typeof fetch;
}

type ExitResult = { code: number | null; signal: NodeJS.Signals | null } | { error: Error };

const LOOPBACK_HOST = '127.0.0.1';

export function buildLlamaServerArguments(modelPath: string, runtimeOptions: LocalAiRuntimeOptions): string[] {
  const args = [
    '--model', modelPath,
    '--alias', runtimeOptions.modelId,
    '--host', runtimeOptions.host,
    '--port', String(runtimeOptions.port),
    '--ctx-size', String(runtimeOptions.contextSize),
    // The app serialises AI work, so one slot is enough. The llama-server
    // default is several slots and multiplies KV-cache memory, which can make
    // a 4B model fail to start on an 8 GB machine. Context checkpoints are not
    // needed for this single-request flow and have a known Windows crash.
    '--parallel', '1',
    '--ctx-checkpoints', '0',
    '--threads', String(runtimeOptions.cpuThreads),
    '--n-gpu-layers', String(runtimeOptions.gpuLayers)
  ];
  // Only the Vulkan build understands `--device`; passing it to the CPU build
  // would fail startup, so it is gated on an explicit device name.
  if (runtimeOptions.device) args.push('--device', runtimeOptions.device);
  return args;
}

/**
 * Windows native exit codes are hard to read in the UI. Keep the most useful
 * hints next to the code so a teacher can recover instead of seeing only
 * "code 3221225477". The runtime logs (stdout/stderr) are still appended.
 */
export function describeRuntimeExitCode(code: number | null): string {
  if (code === null) return '';
  const normalized = code < 0 ? code + 0x1_0000_0000 : code;
  switch (normalized) {
    case 0xC0000005:
      return 'Mã 0xC0000005 là lỗi truy cập bộ nhớ của tiến trình llama.cpp. Nguyên nhân thường gặp: Microsoft Visual C++ 2015–2022 (x64) thiếu hoặc quá cũ, RAM trống không đủ, hoặc CPU không tương thích. Bản cài này đã kèm VC++ runtime; nếu vẫn lỗi, hãy đóng bớt ứng dụng rồi chọn “Bản Nhanh” 2B.';
    case 0xC000001D:
      return 'Mã 0xC000001D là lệnh CPU không được hỗ trợ. Hãy chọn “Bản Nhanh” 2B hoặc dùng máy có CPU x64 hỗ trợ AVX2.';
    case 0xC0000135:
      return 'Mã 0xC0000135 là thiếu thư viện DLL cần thiết. Hãy cài lại Microsoft Visual C++ 2015–2022 (x64) rồi thử lại.';
    case 0xC0000139:
      return 'Mã 0xC0000139 là DLL có nhưng không đúng phiên bản. Hãy cài Microsoft Visual C++ 2015–2022 (x64) mới nhất rồi thử lại.';
    case 0xC00000FD:
      return 'Mã 0xC00000FD là tràn ngăn xếp. Hãy chọn model nhỏ hơn (Bản Nhanh 2B) hoặc đóng bớt ứng dụng.';
    case 0xC0000409:
      return 'Mã 0xC0000409 là lỗi bảo vệ bộ nhớ của tiến trình. Hãy chọn model nhỏ hơn hoặc khởi động lại máy.';
    default:
      return '';
  }
}

export class AIManager {
  private readonly spawnProcess: typeof spawn;
  private readonly buildArguments: (modelPath: string, options: LocalAiRuntimeOptions) => string[];
  private readonly fetchHealth: typeof fetch;
  private readonly startupTimeoutMs: number;
  private readonly healthIntervalMs: number;
  private readonly shutdownTimeoutMs: number;
  private state: AiLifecycleState = 'STOPPED';
  private message?: string;
  private child?: ChildProcess;
  private exitPromise?: Promise<ExitResult>;
  private exitResult?: ExitResult;
  private startPromise?: Promise<AiRuntimeStatus>;
  private stopRequested = false;
  private stopping = false;
  private port?: number;
  private runtimeOutput = '';

  constructor(
    private readonly options: AiManagerOptions,
    dependencies: AiManagerDependencies = {}
  ) {
    this.spawnProcess = dependencies.spawnProcess ?? spawn;
    this.buildArguments = dependencies.buildArguments ?? buildLlamaServerArguments;
    this.fetchHealth = dependencies.fetchHealth ?? fetch;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 30_000;
    this.healthIntervalMs = options.healthIntervalMs ?? 250;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 5_000;
    this.validateOptions();
  }

  getStatus(): AiRuntimeStatus {
    return {
      state: this.state,
      ...(this.state === 'READY' ? { modelId: this.options.modelId } : {}),
      ...(this.message ? { message: this.message } : {})
    };
  }

  getBaseUrl(): string {
    if (this.state !== 'READY' || this.port === undefined) {
      throw new Error('Local AI runtime chưa sẵn sàng.');
    }
    return `http://${LOOPBACK_HOST}:${this.port}`;
  }

  start(): Promise<AiRuntimeStatus> {
    if (this.state === 'READY') return Promise.resolve(this.getStatus());
    if (this.startPromise) return this.startPromise;

    this.stopRequested = false;
    this.message = undefined;
    this.setState('STARTING');
    this.startPromise = this.launch()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Không thể khởi chạy AI runtime.';
        this.message = message;
        this.setState(this.stopRequested ? 'STOPPED' : 'ERROR');
        throw error instanceof Error ? error : new Error(message);
      })
      .finally(() => {
        this.startPromise = undefined;
      });
    return this.startPromise;
  }

  async stop(): Promise<AiRuntimeStatus> {
    this.stopRequested = true;
    this.stopping = true;
    const child = this.child;
    const exitPromise = this.exitPromise;

    try {
      if (child && exitPromise) await this.terminateChild(child, exitPromise);
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Không dừng được AI runtime.';
      this.setState('ERROR');
      this.stopping = false;
      throw error;
    }

    if (this.startPromise) await this.startPromise.catch(() => undefined);
    this.child = undefined;
    this.exitPromise = undefined;
    this.exitResult = undefined;
    this.port = undefined;
    this.message = undefined;
    this.setState('STOPPED');
    this.stopping = false;
    return this.getStatus();
  }

  private async launch(): Promise<AiRuntimeStatus> {
    const port = await this.findAvailablePort();
    if (this.stopRequested) throw new Error('Yêu cầu khởi chạy AI đã bị hủy.');

    this.port = port;
    this.runtimeOutput = '';
    const runtimeOptions: LocalAiRuntimeOptions = {
      modelId: this.options.modelId,
      host: LOOPBACK_HOST,
      port,
      contextSize: this.options.contextSize,
      cpuThreads: this.options.cpuThreads,
      gpuLayers: this.options.gpuLayers,
      ...(this.options.device ? { device: this.options.device } : {})
    };
    const child = this.spawnProcess(
      this.options.executablePath,
      this.buildArguments(this.options.modelPath, runtimeOptions),
      {
        cwd: path.dirname(this.options.executablePath),
        windowsHide: true,
        shell: false,
        // llama.cpp writes most startup/load messages to stdout and crashes
        // sometimes print nothing to stderr. Keep both streams for diagnosis.
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    this.child = child;
    child.stdout?.on('data', chunk => this.appendRuntimeOutput(chunk));
    child.stderr?.on('data', chunk => this.appendRuntimeOutput(chunk));
    this.exitResult = undefined;
    this.exitPromise = new Promise<ExitResult>((resolve) => {
      child.once('error', (error) => {
        const result = { error };
        this.exitResult = result;
        resolve(result);
      });
      child.once('exit', (code, signal) => {
        const result = { code, signal };
        this.exitResult = result;
        if (!this.stopping && this.child === child) {
          this.message = `AI runtime đã thoát (code ${code ?? 'unknown'}).`;
          this.setState('ERROR');
        }
        resolve(result);
      });
    });

    try {
      await this.waitForHealth(child, this.exitPromise, port);
      if (this.stopRequested) throw new Error('Yêu cầu khởi chạy AI đã bị hủy.');
      this.message = undefined;
      this.setState('READY');
      return this.getStatus();
    } catch (error) {
      const exitPromise = this.exitPromise;
      if (exitPromise) {
        this.stopping = true;
        await this.terminateChild(child, exitPromise);
        this.stopping = false;
      }
      if (this.child === child) {
        this.child = undefined;
        this.exitPromise = undefined;
        this.exitResult = undefined;
        this.port = undefined;
      }
      throw error;
    }
  }

  private async waitForHealth(child: ChildProcess, exitPromise: Promise<ExitResult>, port: number): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs;
    const healthUrl = `http://${LOOPBACK_HOST}:${port}/health`;
    let lastError = 'API AI chưa sẵn sàng.';

    while (Date.now() < deadline) {
      if (this.stopRequested) throw new Error('Yêu cầu khởi chạy AI đã bị hủy.');
      const exited = this.getExitResult();
      if (exited) {
        if ('error' in exited) {
          throw new Error(this.withRuntimeOutput(`AI runtime không thể khởi chạy: ${exited.error.message}`));
        }
        const hint = describeRuntimeExitCode(exited.code);
        throw new Error(this.withRuntimeOutput(
          `AI runtime đã thoát trước khi sẵn sàng (code ${exited.code ?? 'unknown'}).` +
          (hint ? `\n${hint}` : '')
        ));
      }

      try {
        const remainingMs = Math.max(1, deadline - Date.now());
        const response = await this.fetchHealth(healthUrl, {
          signal: AbortSignal.timeout(Math.min(1_000, remainingMs))
        });
        if (response.ok) return;
        lastError = `Health check trả về HTTP ${response.status}.`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Không kết nối được với AI runtime.';
      }
      if (child.exitCode !== null) continue;
      await this.delay(this.healthIntervalMs);
    }
    throw new Error(this.withRuntimeOutput(
      `AI runtime không sẵn sàng sau ${this.startupTimeoutMs} ms: ${lastError}`
    ));
  }

  private appendRuntimeOutput(chunk: Buffer | string): void {
    this.runtimeOutput = `${this.runtimeOutput}${chunk.toString()}`.slice(-4_000);
  }

  private withRuntimeOutput(message: string): string {
    const details = this.runtimeOutput.trim();
    return details ? `${message}\nThông tin từ llama.cpp:\n${details}` : message;
  }

  private async findAvailablePort(): Promise<number> {
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, LOOPBACK_HOST, () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Không cấp phát được cổng local cho AI runtime.');
    }
    const port = address.port;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    return port;
  }

  private getExitResult(): ExitResult | undefined {
    return this.exitResult;
  }

  private async terminateChild(child: ChildProcess, exitPromise: Promise<ExitResult>): Promise<void> {
    if (this.getExitResult()) return;
    child.kill();
    const firstExit = await Promise.race([
      exitPromise,
      this.delay(this.shutdownTimeoutMs).then(() => undefined)
    ]);
    if (!firstExit && !this.getExitResult()) {
      child.kill('SIGKILL');
      await Promise.race([exitPromise, this.delay(1_000)]);
    }
    if (!this.getExitResult()) {
      throw new Error('AI runtime chưa xác nhận đã dừng sau yêu cầu kết thúc.');
    }
  }

  private setState(state: AiLifecycleState): void {
    this.state = state;
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private validateOptions(): void {
    if (!path.isAbsolute(this.options.executablePath) || !path.isAbsolute(this.options.modelPath)) {
      throw new Error('Đường dẫn runtime và mô hình phải là đường dẫn tuyệt đối do ứng dụng xác định.');
    }
    if (!this.options.modelId.trim()) throw new Error('Thiếu ID mô hình AI.');
    if (this.startupTimeoutMs < 1 || this.healthIntervalMs < 1 || this.shutdownTimeoutMs < 1) {
      throw new Error('Các giới hạn thời gian của AI runtime phải lớn hơn 0.');
    }
    for (const [name, value] of Object.entries({
      contextSize: this.options.contextSize,
      cpuThreads: this.options.cpuThreads,
      gpuLayers: this.options.gpuLayers
    })) {
      if (!Number.isInteger(value) || value < 0 || (name !== 'gpuLayers' && value === 0)) {
        throw new Error(`Cấu hình AI không hợp lệ: ${name}.`);
      }
    }
  }
}
