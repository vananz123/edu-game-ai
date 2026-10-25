import type { GameOption } from '../shared/types';

export type AiLifecycleState =
  | 'NOT_INSTALLED'
  | 'DOWNLOADING'
  | 'VERIFYING'
  | 'STOPPED'
  | 'STARTING'
  | 'READY'
  | 'GENERATING'
  | 'ERROR';

export interface AiRuntimeStatus {
  state: AiLifecycleState;
  modelId?: string;
  message?: string;
}

export interface ModelManifestEntry {
  id: string;
  version: string;
  displayName: string;
  friendlyName: string;
  tagline: string;
  downloadUrl: string;
  sizeBytes: number;
  sha256: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
  hardware: ModelHardwareProfile;
}

export interface ModelHardwareProfile {
  minimumRamBytes: number;
  recommendedRamBytes: number;
  recommendedCpuThreads: number;
  gpu: {
    supported: boolean;
    required: boolean;
    recommendedLayers: number;
    estimatedVramBytes?: number;
  };
  supportedLanguages: string[];
  expectedResult: string;
  performanceBenchmark?: {
    tokensPerSecond: number;
    hardware: string;
    method: string;
    sourceUrl: string;
  };
}

export interface MachineCapabilities {
  totalRamBytes: number;
  logicalCpuCount: number;
  gpu?: {
    name: string;
    vramBytes?: number;
  };
}

export interface ModelSelectionSummary {
  modelName: string;
  downloadSizeBytes: number;
  licenseName: string;
  licenseUrl: string;
  memory: {
    status: 'insufficient' | 'below-recommended' | 'recommended';
    machineRamBytes: number;
    minimumRamBytes: number;
    recommendedRamBytes: number;
  };
  cpu: {
    logicalCpuCount: number;
    recommendedThreads: number;
  };
  cpuThreads: number;
  gpu: {
    status: 'not-supported' | 'not-detected' | 'below-recommended' | 'recommended';
    machineName?: string;
    machineVramBytes?: number;
    recommendedVramBytes?: number;
    supported: boolean;
    required: boolean;
  };
  gpuLayers: number;
  supportedLanguages: string[];
  expectedResult: string;
  performanceBenchmark?: ModelHardwareProfile['performanceBenchmark'];
  performanceReference: string;
}

export interface ModelDownloadProgress {
  receivedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  canResume: boolean;
}

export interface LocalAiRuntimeOptions {
  modelId: string;
  host: '127.0.0.1';
  port: number;
  contextSize: number;
  cpuThreads: number;
  gpuLayers: number;
  /**
   * Vulkan device to offload to, e.g. `Vulkan0`. Undefined means "no explicit
   * device", which is correct for the CPU build. Selecting a device by name
   * matters because a machine can expose several (iGPU + discrete + a virtual
   * display adapter), and llama.cpp would otherwise pick the first one listed.
   */
  device?: string;
}

export interface LocalAiModelStatus {
  id: string;
  displayName: string;
  friendlyName: string;
  tagline: string;
  sizeBytes: number;
  sha256: string;
  licenseName: string;
  licenseUrl: string;
  sourceUrl: string;
  installed: boolean;
  selected: boolean;
  minimumRamBytes: number;
  recommendedRamBytes: number;
  recommendedCpuThreads: number;
  cpuStatus: 'recommended' | 'limited';
  memoryStatus: 'insufficient' | 'below-recommended' | 'recommended';
  recommendation: 'recommended' | 'possible' | 'not-recommended';
  recommendationReason: string;
  supportedLanguages: string[];
  expectedResult: string;
}

export interface LocalAiMachineProfile {
  totalRamBytes: number;
  logicalCpuCount: number;
  cpuModel: string;
  gpuDetectionStatus: 'detected' | 'not-detected' | 'unavailable';
  gpuDetectionMessage?: string;
  gpu?: {
    name: string;
    vramBytes?: number;
  };
  recommendedModelId: string;
  runtimeInstalled: boolean;
  runtimeSupported: boolean;
  runtimeState: AiLifecycleState;
  runtimeModelId?: string;
}

export interface LocalAiDownloadProgress {
  stage: 'runtime' | 'model' | 'starting';
  modelId: string;
  receivedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
}

export interface QuizGenerationInput {
  lessonText: string;
  subject: string;
  grade: string;
  questionCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface GeneratedQuizQuestion {
  type: 'multiple-choice';
  prompt: string;
  options: GameOption[];
  correctOptionId: string;
  explanation: string;
  points: number;
}

export interface GeneratedQuizDraft {
  title: string;
  subject: string;
  grade: string;
  topic: string;
  description: string;
  template: 'quiz';
  questions: GeneratedQuizQuestion[];
}

export interface LocalAiClient {
  generateText(prompt: string, signal?: AbortSignal): Promise<string>;
}