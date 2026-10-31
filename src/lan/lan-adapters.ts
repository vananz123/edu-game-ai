/* LAN Classroom Mode: turn an EduGame into LAN rounds, scored like the desktop.
 *
 * Why this file is separate from the reducer: the reducer only decides whether an
 * answer counts, while this file decides what an answer is *worth*. Both desktop
 * and LAN must agree, so every scoring path here delegates to the very same
 * `src/game-engine/runtime.ts` helpers the play surface
 * (`src/renderer/features/games/*.ts`) calls:
 *
 *   chooseAnswer()      scenarioScore -> scoreAnswer()      scoreTextAnswer()
 *   treasureRecordStage()  points = stage.points + stage.completionBonus
 *
 * IMPORTANT: those renderer scripts have no module exports, so their constants
 * cannot be imported. `tests/unit/lan-adapters.test.ts` reads every file under
 * `src/renderer/features/games/` as text and fails if either side drifts.
 */

import type { EducationalGame, GameQuestion, TreasureStage } from '../shared/types';
import type { LanEngine, LanPhoneInput, LanTeam } from '../shared/lan-types';
import type { LanGamePlan, LanRound } from './lan-reducer';
import { lanScoringMode } from './lan-reducer';

// runtime.ts is a plain renderer script (no `export` keywords, `@ts-nocheck`), but
// `tsc` still emits CommonJS, so main can require it exactly as the unit tests do.
const {
  scoreAnswer,
  scoreTextAnswer,
  scoreScenarioDecision,
  resolveScenarioTransition,
  isTextQuestion
} = require('../game-engine/runtime');

/**
 * Desktop constants, copied from `gameplay.ts`:
 *   treasureRecordStage()      (Number(stage.points) || 0) + (Number(stage.completionBonus) || 0)
 *   renderTreasureResults()    journeyBonus || 300, hiddenItemBonus || 50,
 *                              (Number(stage.points) || 100) + (Number(stage.completionBonus) || 200)
 * The max-score formula uses defaults 100/200, which is why a stage with
 * `points: 0` still shows 200 points in the desktop denominator.
 */
export const TREASURE_DEFAULTS = {
  stagePoints: 100,
  stageCompletionBonus: 200,
  journeyBonus: 300,
  hiddenItemBonus: 50
} as const;

export interface LanProfile {
  supported: boolean;
  engine: LanEngine | null;
  reason: string;
  /** Stages or questions LAN cannot run (matching, decode, classification...). */
  unsupportedRounds: number;
  roundCount: number;
}

export interface LanPhoneQuestion {
  type?: string;
  prompt: string;
  options?: { id: string; text: string; scenarioScore?: unknown }[];
  correctOptionId?: string;
  correctAnswer?: string;
  alternateAnswers?: string[];
  hint?: string;
  points?: number;
  difficulty?: string;
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The desktop writes `Number(stage.points) || 100`, so a configured `0` is treated
 * as "unset" and falls back. Copy that `||` semantics exactly, including `0`.
 */
function numberFalsyOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return parsed || fallback;
}

function optionText(options: { id: string; text: string }[] | undefined, id: string): { id: string; text: string }[] {
  return Array.isArray(options) ? options.map(option => ({ id: String(option.id), text: String(option.text ?? '') })) : [];
}

/**
 * The teacher's real `gameSetup` with only the scoring mode swapped for LAN's
 * effective mode. Passing this (not the raw setup) is what keeps points, the
 * difficulty table and the points-per-question identical to the projector.
 */
export function lanScoringSetup(game: EducationalGame | null | undefined): Record<string, unknown> {
  const setup = (game && game.gameSetup) || {};
  return { ...setup, scoringMode: lanScoringMode(setup.scoringMode).mode };
}

export function lanTeamsOf(teams: unknown): LanTeam[] {
  if (!Array.isArray(teams)) return [];
  return teams.map((team, index) => ({
    id: String(team && team.id || `t${index + 1}`),
    name: String(team && team.name || `Đội ${index + 1}`),
    icon: String(team && team.icon || '🏁')
  }));
}

function teamNamesFromSetup(competition: string | undefined): LanTeam[] {
  const names = String(competition ?? '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);
  return names.map((name, index) => ({ id: `t${index + 1}`, name, icon: index === 0 ? '🔴' : index === 1 ? '🔵' : '🏁' }));
}

/**
 * Default teams when the game has none: "Thi đấu đội" gets A/B (the same defaults
 * `openTeamSetup()` offers), everything else stays individual (empty list).
 */
export function lanDefaultTeams(game: EducationalGame): LanTeam[] {
  const raceTeams = lanTeamsOf(game && game.race && game.race.teams);
  if (raceTeams.length >= 2) return raceTeams;
  const setup = (game && game.gameSetup) || {};
  if (setup.scoringMode !== 'thi đấu đội') return [];
  const custom = teamNamesFromSetup(setup.competition);
  if (custom.length >= 2) return custom;
  return [
    { id: 't1', name: 'Đội A', icon: '🏎️' },
    { id: 't2', name: 'Đội B', icon: '🚀' }
  ];
}

function roundInput(question: LanPhoneQuestion): LanPhoneInput {
  if (isTextQuestion(question)) return { kind: 'text', placeholder: 'Nhập câu trả lời (tối đa 5 từ)' };
  const options = optionText(question.options, '');
  if (!options.length) return { kind: 'unsupported', reason: 'Câu hỏi không có đáp án để chọn.' };
  return { kind: 'options', options };
}

/**
 * `optionScore` mirrors the three branches of `chooseAnswer()`:
 *   1. text question            -> scoreTextAnswer(question, text, elapsed, gameSetup)
 *   2. scenario with scenarioScore -> scoreScenarioDecision(option)
 *   3. scenario without          -> correct ? points || 100 : 0
 *   4. plain choice              -> scoreAnswer(question, optionId, elapsed, gameSetup)
 *
 * Note the scenario branches hard-code 100 instead of `question.points || 100`;
 * that is a desktop quirk LAN must reproduce, not fix.
 */
function optionScore(
  question: LanPhoneQuestion,
  gameSetup: unknown,
  isScenarioTemplate: boolean,
  elapsedSeconds: number
) {
  const text = isTextQuestion(question);
  const scenario = isScenarioTemplate && question.type === 'scenario';
  return (optionId: string | null, answerText: string) => {
    if (text) return scoreTextAnswer(question, answerText, elapsedSeconds, gameSetup);
    const selected = Array.isArray(question.options) ? question.options.find(option => option.id === optionId) : undefined;
    if (scenario && selected && selected.scenarioScore) {
      // chooseAnswer() takes points from the rubric but `correct` from the answer
      // key, so a rubric-scored option that is not the key still counts as wrong.
      const rubric = scoreScenarioDecision(selected);
      return { ...rubric, correct: question.correctOptionId === optionId };
    }
    if (scenario) {
      const correct = question.correctOptionId === optionId;
      return { correct, points: correct ? numberOr(question.points, 100) : 0, speedBonus: 0 };
    }
    return scoreAnswer(question, optionId, elapsedSeconds, gameSetup);
  };
}

/** Maximum a correct answer can earn in a round, for the projector's score bar. */
function maxPointsOf(question: LanPhoneQuestion, gameSetup: unknown, isScenarioTemplate: boolean, elapsedSeconds: number): number {
  if (isTextQuestion(question)) return Number(optionScore(question, gameSetup, false, elapsedSeconds)(null, '__lan_probe__').points) || 0;
  const probe = optionScore(question, gameSetup, isScenarioTemplate, elapsedSeconds);
  const candidates = Array.isArray(question.options) ? question.options : [];
  if (!candidates.length) return 0;
  return Math.max(
    ...candidates.map(option => {
      const scored = probe(String(option.id), '');
      return scored && scored.correct ? Number(scored.points) || 0 : 0;
    })
  );
}

/**
 * Scenario games get a different route per answer (`nextQuestionId`), so pupils
 * would diverge from each other and from the projector. LAN always advances
 * linearly, so it is only offered when every path through the questions is the
 * same sequence — i.e. when each option resolves to the next question in order.
 */
export function scenarioIsLinear(questions: LanPhoneQuestion[], isScenarioTemplate: boolean): boolean {
  if (!isScenarioTemplate) return true;
  return questions.every((question, index) => {
    if (question.type !== 'scenario' || !Array.isArray(question.options)) return true;
    return question.options.every(option => {
      const expected = index + 1 >= questions.length ? questions.length : index + 1;
      try {
        const next = resolveScenarioTransition(option, index, questions);
        return next === expected || (next === undefined && expected === questions.length);
      } catch {
        // A dangling `nextQuestionId` also refuses LAN: the desktop would throw
        // mid-lesson, and a phone cannot recover from that.
        return false;
      }
    });
  });
}

function quizRounds(game: EducationalGame): { rounds: LanRound[]; unsupported: number } {
  const questions: GameQuestion[] = Array.isArray(game.questions) ? game.questions : [];
  // LAN has no per-pupil clock, so scoring uses the same setup the desktop uses
  // except `tốc độ` -> `cơ bản` (see lanScoringMode). Elapsed is fixed at 0.
  const setup = lanScoringSetup(game);
  const isScenarioTemplate = game.template === 'scenario';
  const rounds: LanRound[] = [];
  let unsupported = 0;
  questions.forEach((question, index) => {
    const input = roundInput(question as LanPhoneQuestion);
    if (input.kind === 'unsupported') {
      unsupported += 1;
      return;
    }
    const answerKey = () => (isTextQuestion(question)
      ? { correctAnswer: String(question.correctAnswer ?? '') }
      : { correctOptionId: String(question.correctOptionId ?? '') });
    rounds.push({
      label: `Câu ${index + 1}`,
      prompt: String(question.prompt ?? ''),
      context: question.context ? String(question.context) : '',
      input,
      maxPoints: maxPointsOf(question as LanPhoneQuestion, setup, isScenarioTemplate, 0),
      score: optionScore(question as LanPhoneQuestion, setup, isScenarioTemplate, 0),
      answerKey
    });
  });
  return { rounds, unsupported };
}

function stageMissionType(stage: TreasureStage): string {
  return stage && stage.mission && stage.mission.type ? String(stage.mission.type) : 'multiple-choice';
}

/**
 * Read the journey maximum straight from the desktop formula in
 * `renderTreasureResults()` (renderer/features/games/treasure.ts), including its
 * 100/200 defaults.
 */
function treasureHuntMax(game: EducationalGame): number {
  const hunt = game.treasureHunt;
  const stages: TreasureStage[] = hunt && Array.isArray(hunt.stages) ? hunt.stages : [];
  return stages.reduce(
    (sum, stage) => sum + numberFalsyOr(stage.points, TREASURE_DEFAULTS.stagePoints) + numberFalsyOr(stage.completionBonus, TREASURE_DEFAULTS.stageCompletionBonus),
    0
  )
    + numberFalsyOr(hunt && hunt.journeyBonus, TREASURE_DEFAULTS.journeyBonus)
    + stages.filter(stage => stage.hasHiddenItem).length * numberFalsyOr(hunt && hunt.hiddenItemBonus, TREASURE_DEFAULTS.hiddenItemBonus);
}

function treasureRounds(game: EducationalGame): { rounds: LanRound[]; unsupported: number } {
  const hunt = game.treasureHunt;
  const stages: TreasureStage[] = hunt && Array.isArray(hunt.stages) ? hunt.stages : [];
  const rounds: LanRound[] = [];
  let unsupported = 0;
  stages.forEach((stage, index) => {
    const missionType = stageMissionType(stage);
    // v1 runs choice-style stages only; matching/decode/classification need a
    // play-by-play model LAN does not have (plan §4).
    if (missionType !== 'multiple-choice' && missionType !== 'scenario') {
      unsupported += 1;
      return;
    }
    const question = (stage.question || {}) as LanPhoneQuestion;
    const input = roundInput(question);
    const points = numberOr(stage.points, 0);
    const bonus = numberOr(stage.completionBonus, 0);
    // Desktop awards `points + completionBonus` verbatim (no 100/200 defaults) and
    // LAN v1 gives one attempt, so a wrong answer scores 0 — same as the desktop
    // when the pupil runs out of attempts.
    const gained = points + bonus;
    if (input.kind === 'unsupported') {
      unsupported += 1;
      return;
    }
    rounds.push({
      label: `Chặng ${index + 1}`,
      prompt: String(question.prompt ?? ''),
      story: String(stage.story ?? ''),
      task: String(stage.taskDescription ?? ''),
      input,
      maxPoints: gained,
      score: (optionId: string | null, answerText: string) => {
        const correct = isTextQuestion(question)
          ? Boolean(scoreTextAnswer(question, answerText, 0, lanScoringSetup(game)).correct)
          : String(question.correctOptionId ?? '') === String(optionId ?? '');
        return { correct, points: correct ? gained : 0 };
      },
      answerKey: () => (isTextQuestion(question)
        ? { correctAnswer: String(question.correctAnswer ?? '') }
        : { correctOptionId: String(question.correctOptionId ?? '') })
    });
  });
  return { rounds, unsupported };
}

/** What the teacher screen shows before offering the "📱 Chơi LAN" button. */
export function lanProfileFor(game: EducationalGame | null | undefined): LanProfile {
  if (!game || typeof game !== 'object') {
    return { supported: false, engine: null, reason: 'Chưa mở trò chơi nào.', unsupportedRounds: 0, roundCount: 0 };
  }
  if (game.template === 'quiz' || game.template === 'scenario') {
    const questions = (game.questions || []) as LanPhoneQuestion[];
    if (!questions.length) return { supported: false, engine: null, reason: 'Trò chơi chưa có câu hỏi.', unsupportedRounds: 0, roundCount: 0 };
    if (!scenarioIsLinear(questions, game.template === 'scenario')) {
      return {
        supported: false,
        engine: null,
        reason: 'Tình huống có nhiều nhánh (mỗi đáp án dẫn tới câu khác nhau) nên cả lớp không thể đi cùng một đường — chưa chơi LAN được.',
        unsupportedRounds: 0,
        roundCount: questions.length
      };
    }
    const { rounds, unsupported } = quizRounds(game);
    return {
      supported: rounds.length > 0,
      engine: rounds.length ? 'quiz' : null,
      reason: unsupported ? `${unsupported} câu chưa có đáp án nên bị bỏ qua trên điện thoại.` : '',
      unsupportedRounds: unsupported,
      roundCount: rounds.length
    };
  }
  if (game.template === 'treasure-hunt') {
    const stages = (game.treasureHunt && game.treasureHunt.stages) || [];
    if (!stages.length) return { supported: false, engine: null, reason: 'Hành trình chưa có chặng.', unsupportedRounds: 0, roundCount: 0 };
    const { rounds, unsupported } = treasureRounds(game);
    if (!rounds.length) {
      return {
        supported: false,
        engine: null,
        reason: 'Các chặng dùng nhiệm vụ ghép cặp / giải mã / phân loại — LAN chưa hỗ trợ loại này.',
        unsupportedRounds: unsupported,
        roundCount: 0
      };
    }
    return {
      supported: true,
      engine: 'treasure',
      reason: unsupported ? `${unsupported} chặng dùng nhiệm vụ chưa hỗ trợ nên không chơi LAN được.` : '',
      unsupportedRounds: unsupported,
      roundCount: rounds.length
    };
  }
  const labels: Record<string, string> = {
    matching: 'Ghép cặp chưa hỗ trợ chơi LAN.',
    race: 'Đường đua chưa hỗ trợ chơi LAN.'
  };
  return {
    supported: false,
    engine: null,
    reason: labels[String(game.template)] || 'Trò chơi này chưa hỗ trợ chơi LAN.',
    unsupportedRounds: 0,
    roundCount: 0
  };
}

/**
 * Build the plan the reducer runs. Returns `null` when LAN cannot run this game,
 * so the caller reports `lanProfileFor().reason` instead of starting a dead room.
 */
export function buildLanPlan(game: EducationalGame | null | undefined): LanGamePlan | null {
  const profile = lanProfileFor(game);
  if (!profile.supported || !profile.engine || !game) return null;
  const scoring = lanScoringMode(game.gameSetup && game.gameSetup.scoringMode);
  const common = {
    gameId: String(game.id ?? ''),
    gameTitle: String(game.title ?? ''),
    teams: lanDefaultTeams(game),
    scoringMode: scoring.mode,
    scoringNote: scoring.note
  };
  if (profile.engine === 'quiz') return { ...common, engine: 'quiz', rounds: quizRounds(game).rounds };
  return { ...common, engine: 'treasure', rounds: treasureRounds(game).rounds };
}

/** Max points the finished session can report; mirrors each desktop results screen. */
export function lanMaxPoints(game: EducationalGame | null | undefined): number {
  if (!game) return 0;
  if (game.template === 'treasure-hunt') return treasureHuntMax(game);
  const questions = (game.questions || []) as LanPhoneQuestion[];
  const setup = lanScoringSetup(game);
  return questions.reduce(
    (sum, question) => sum + maxPointsOf(question, setup, game.template === 'scenario', 0),
    0
  );
}

/** One pupil on the final podium. */
export interface LanPodiumEntry {
  rank: number;
  id: string;
  name: string;
  points: number;
  correct: number;
  answered: number;
  teamName: string;
  /** True when this rank is shared: equal points *and* equal correct answers. */
  tie: boolean;
}

/**
 * Final ranking for the honour roll, highest first.
 *
 * Rules (deliberately simple, because a class can see the projector):
 *   - points desc, then correct answers desc, then name (Vietnamese collation) —
 *     a stable order so two pupils on the same score never swap between renders.
 *   - pupils with equal points AND equal correct answers share a rank ("đồng hạng"),
 *     so 100/100/50 shows 1, 1, 2 rather than inventing a winner.
 *   - pupils who answered nothing are still listed (a LAN lesson is not a competition
 *     to be last in), but they never receive a medal.
 *   - at most `limit` entries; the caller asks for 3.
 */
export function lanRankPlayers(
  players: { id: string; name: string; points?: number; correct?: number; answered?: number; teamId?: string }[],
  teams: { id: string; name: string }[] = [],
  limit = players.length
): LanPodiumEntry[] {
  const teamName = (id: string | undefined) => (teams.find(team => team.id === id) || {}).name || '';
  const sorted = (Array.isArray(players) ? players : [])
    .map(player => ({
      id: String(player.id ?? ''),
      name: String(player.name ?? ''),
      points: Number(player.points) || 0,
      correct: Number(player.correct) || 0,
      answered: Number(player.answered) || 0,
      teamName: teamName(player.teamId)
    }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct || a.name.localeCompare(b.name, 'vi'));

  const out: LanPodiumEntry[] = [];
  // Competition ranking: 1, 1, 2 (not 1, 1, 3). A tie shares the previous rank and
  // the next distinct pupil takes the following number, so no rank is skipped in the
  // honour roll a class is looking at.
  let rank = 0;
  let previous: { points: number; correct: number } | null = null;
  sorted.forEach(player => {
    const sameAsPrevious = Boolean(previous) && previous.points === player.points && previous.correct === player.correct;
    // A distinct pupil takes the rank right after the tie group: with two firsts the
    // next pupil is second, so the roll reads 1, 1, 2 and never skips a place.
    if (!sameAsPrevious) rank = previous ? rank + 1 : 1;
    out.push({ ...player, rank, tie: false });
    previous = { points: player.points, correct: player.correct };
  });
  // Mark both sides of a tie (the first entry was written before the second was seen).
  out.forEach((entry, index) => {
    const next = out[index + 1];
    if (next && next.rank === entry.rank) entry.tie = true;
    const previous = out[index - 1];
    if (previous && previous.rank === entry.rank) entry.tie = true;
  });
  return out.slice(0, Math.max(0, limit));
}

