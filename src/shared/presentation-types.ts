/* Presentation Mode shared types and IPC contracts. */

/** IPC channel names for Presentation Mode. */
export const PRESENTATION_CHANNELS = {
  START: 'presentation:start',
  STOP: 'presentation:stop',
  TOGGLE: 'presentation:toggle',
  DISPLAYS: 'presentation:displays',
  STATE_UPDATE: 'presentation:state-update',
  STATE_SYNC: 'presentation:state-sync',
  REQUEST_STATE: 'presentation:request-state',
  EXIT: 'presentation:exit',
} as const;

export type PresentationChannel =
  | typeof PRESENTATION_CHANNELS.START
  | typeof PRESENTATION_CHANNELS.STOP
  | typeof PRESENTATION_CHANNELS.TOGGLE
  | typeof PRESENTATION_CHANNELS.DISPLAYS
  | typeof PRESENTATION_CHANNELS.STATE_UPDATE
  | typeof PRESENTATION_CHANNELS.STATE_SYNC
  | typeof PRESENTATION_CHANNELS.REQUEST_STATE
  | typeof PRESENTATION_CHANNELS.EXIT;

/** Information about a detected display (projector or monitor). */
export interface DisplayInfo {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  primary: boolean;
}

/** Game state snapshot sent from main renderer to presentation window. */
export interface PresentationState {
  sessionId: string;
  gameId: string;
  gameTitle: string;
  template: string;
  gameIndex: number;
  gameAnswers: unknown[];
  score?: { points: number; max: number; percent: number; correct: number; total: number };
  timer?: number;
  isComplete: boolean;
  revision: number;
  view?: PresentationView;
}

/** A read-only answer option. */
export interface PresentationOption {
  id: string;
  text: string;
}

/** One memory card as shown on the projector. */
export interface PresentationMatchingCard {
  index: number;
  pairId: string;
  text: string;
  matched: boolean;
  flipped: boolean;
}

/** A category column with the items already sorted into it. */
export interface PresentationCategoryGroup {
  name: string;
  items: string[];
}

/** Read-only treasure mission data. */
export interface PresentationMission {
  type: string;
  instruction?: string;
  pairs?: { id: string; left: string; right: string }[];
  groups?: { id: string; name: string }[];
  items?: { id: string; text: string; groupId?: string }[];
  cipher?: string;
  matchedIds?: string[];
}

/** Template-specific snapshot rendered by the presentation window. */
export type PresentationView =
  | {
      kind: 'quiz';
      prompt: string;
      context?: string;
      type?: string;
      options: PresentationOption[];
      selectedOptionId?: string | null;
      correctOptionId?: string;
      answerText?: string;
      correctAnswer?: string;
      revealed?: boolean;
      explanation?: string;
      teamTurn?: string;
      progressLabel?: string;
    }
  | {
      kind: 'matching';
      mode: string;
      pairs: { id: string; left: string; right: string }[];
      matchedIds: string[];
      matched: number;
      total: number;
      wrong: number;
      selectedPairId?: string | null;
      memoryCards?: PresentationMatchingCard[];
      categoryGroups?: PresentationCategoryGroup[];
    }
  | {
      kind: 'treasure';
      character?: string;
      stages: { id: string; name: string; status: string }[];
      currentStageId?: string;
      stageName?: string;
      prompt?: string;
      story?: string;
      taskDescription?: string;
      missionType?: string;
      mission?: PresentationMission;
      options: PresentationOption[];
      selectedOptionId?: string | null;
      correctOptionId?: string;
      revealed?: boolean;
      explanation?: string;
      earned?: number;
      itemsFound?: number;
      totalStages?: number;
    }
  | {
      kind: 'race';
      teams: { id: string; name: string; icon: string; progress: number; points: number; active?: boolean }[];
      trackLength: number;
      round: number;
      maxRounds: number;
      currentTeamName?: string;
      currentTeamIcon?: string;
      prompt?: string;
      options: PresentationOption[];
      lastEvent?: string;
      winnerName?: string;
      completed?: boolean;
    }
  | {
      kind: 'results';
      title: string;
      subtitle?: string;
      medal?: string;
      scoreText?: string;
      rows: { label: string; value: string; highlight?: boolean }[];
      message?: string;
    };

/** Payload for presentation:start IPC (the full initial snapshot). */
export type StartPresentationPayload = PresentationState;

/** Payload for presentation:stop IPC. */
export interface StopPresentationPayload {
  sessionId: string;
}

/** Result of getDisplays IPC. */
export interface GetDisplaysResult {
  displays: DisplayInfo[];
  preferred: DisplayInfo | null;
}

/** IPC result shape used by preload invoke handlers. */
export interface InvokeResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}