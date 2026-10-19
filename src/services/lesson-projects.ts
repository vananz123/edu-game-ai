/**
 * Project assembly for the lesson-to-game workflow.
 *
 * Pure helpers that turn step results (analysis, recommendations) into a
 * `GameProject` row. Keeping them here (instead of inline in `main.ts`) makes
 * the wizard's persistence rules testable and gives P5 a single place to evolve
 * the step machine.
 */
import {
  LESSON_SCHEMA_VERSION,
  type GameProject,
  type LessonAnalysis,
  type WorkflowStep
} from '../shared/lesson-types';

export const WORKFLOW_STEP_ORDER: readonly WorkflowStep[] = [
  'input',
  'analyze',
  'recommend',
  'configure',
  'generate',
  'edit',
  'done'
];

/** Never moves a project backwards when a teacher re-runs an earlier step. */
export function advanceStep(current: WorkflowStep, target: WorkflowStep): WorkflowStep {
  return WORKFLOW_STEP_ORDER.indexOf(target) > WORKFLOW_STEP_ORDER.indexOf(current) ? target : current;
}

export interface LessonIdentity {
  documentId: string;
  name: string;
  characters: number;
}

export interface CreateProjectInput {
  projectId: string;
  document: LessonIdentity;
  analysis: LessonAnalysis;
  now: string;
}

export function createProjectFromAnalysis(input: CreateProjectInput): GameProject {
  return {
    id: input.projectId,
    schemaVersion: LESSON_SCHEMA_VERSION,
    status: 'draft',
    step: 'recommend',
    title: input.analysis.topic || input.document.name,
    description: '',
    tags: [],
    sourceName: input.document.name,
    lesson: { documentId: input.document.documentId, name: input.document.name, characters: input.document.characters },
    analysisId: input.analysis.id,
    recommendationId: null,
    config: null,
    draft: null,
    gameSnapshot: null,
    gameId: null,
    createdAt: input.now,
    updatedAt: input.now
  };
}

export interface ApplyAnalysisInput {
  document: LessonIdentity;
  analysis: LessonAnalysis;
  now: string;
}

/** Attaches an analysis to an existing project (resume or re-analyze). */
export function applyAnalysis(project: GameProject, input: ApplyAnalysisInput): GameProject {
  return {
    ...project,
    title: project.title || input.analysis.topic || input.document.name,
    sourceName: project.sourceName || input.document.name,
    lesson: {
      documentId: input.document.documentId,
      name: input.document.name,
      characters: input.document.characters
    },
    analysisId: input.analysis.id,
    step: advanceStep(project.step, 'recommend'),
    updatedAt: input.now
  };
}

/** Records that recommendations were produced and the wizard can move to configure. */
export function advanceAfterRecommendations(project: GameProject, now: string): GameProject {
  return {
    ...project,
    status: project.status === 'draft' ? 'review' : project.status,
    step: advanceStep(project.step, 'configure'),
    updatedAt: now
  };
}
