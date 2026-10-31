import type { GameQuestion, RaceData, RaceQuestion, RaceSpecialCell, RaceTeam, TreasureHuntData, TreasureStage } from '../../shared/types';

const RACE_CELL_TYPES = new Set(['boost', 'penalty', 'lucky', 'challenge']);
const DIFFICULTIES = new Set(['dễ', 'trung bình', 'khó']);

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function intIn(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function isPuzzle(question: GameQuestion): boolean {
  if (!String(question.prompt || '').trim()) return false;
  const options = Array.isArray(question.options) ? question.options : [];
  if (options.length < 2) return false;
  const ids = options.map(option => option.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !String(id || '').trim())) return false;
  if (options.some(option => !String(option.text || '').trim())) return false;
  return ids.includes(question.correctOptionId);
}

/**
 * §5.5 — AI trả về nội dung hành trình; code lắp cấu trúc chặng (mỗi câu đố = một chặng,
 * tuyến tính, chặng cuối là kết thúc) để luôn hợp lệ với validateTreasureHuntGame.
 * Trả về null khi không đủ câu đố trắc nghiệm (editor sẽ dùng bản nháp mặc định).
 */
export function buildTreasureHunt(questions: GameQuestion[], design: unknown): TreasureHuntData | null {
  const usableCount = questions.filter(isPuzzle).length;
  if (usableCount < 2) return null;
  const meta = design && typeof design === 'object' && !Array.isArray(design) ? (design as Record<string, any>) : {};
  const stagesMeta = Array.isArray(meta.stages) ? meta.stages : [];
  const stages: TreasureStage[] = [];
  questions.forEach((question, originalIndex) => {
    if (!isPuzzle(question)) return;
    const stage = stagesMeta[originalIndex] && typeof stagesMeta[originalIndex] === 'object' ? stagesMeta[originalIndex] as Record<string, any> : {};
    stages.push({
      id: `stage-${stages.length + 1}`,
      name: text(stage.name, `Chặng ${stages.length + 1}`),
      story: text(stage.story, `Chặng ${stages.length + 1} của hành trình khám phá kho báu.`),
      taskDescription: text(stage.taskDescription, 'Trả lời đúng câu đố để nhận chìa khóa mở chặng tiếp theo.'),
      question: {
        prompt: question.prompt,
        options: question.options.map(option => ({ id: option.id, text: option.text })),
        correctOptionId: question.correctOptionId,
        explanation: String(question.explanation || ''),
        hint: text(stage.hint, '')
      },
      attempts: intIn(stage.attempts, 0, 99, 0),
      points: intIn(stage.points, 0, 1000, 100),
      completionBonus: intIn(stage.completionBonus, 0, 10000, 200),
      nextStageId: null,
      ...(stage.hasHiddenItem === true ? { hasHiddenItem: true } : {})
    });
  });
  stages.forEach((stage, index) => {
    stage.nextStageId = index < stages.length - 1 ? `stage-${index + 2}` : null;
  });
  return {
    character: text(meta.character, 'Nhà thám hiểm'),
    intro: text(meta.intro, 'Bắt đầu hành trình khám phá kho tàng kiến thức!'),
    journeyBonus: intIn(meta.journeyBonus, 0, 10000, 300),
    hiddenItemBonus: intIn(meta.hiddenItemBonus, 0, 1000, 50),
    stages
  };
}

function buildTeams(design: Record<string, any>): RaceTeam[] {
  const raw = Array.isArray(design.teams) ? design.teams : [];
  const teams: RaceTeam[] = [];
  const names = new Set<string>();
  raw.slice(0, 6).forEach((team: any, index: number) => {
    if (!team || typeof team !== 'object') return;
    const name = text(team.name, '');
    const key = name.toLowerCase();
    if (!name || names.has(key)) return;
    names.add(key);
    teams.push({ id: `t${index + 1}`, name, icon: text(team.icon, '🏎️').slice(0, 8) });
  });
  if (teams.length < 2) {
    return [
      { id: 't1', name: 'Đội A', icon: '🏎️' },
      { id: 't2', name: 'Đội B', icon: '🚀' }
    ];
  }
  return teams;
}

function buildCells(design: Record<string, any>, trackLength: number): RaceSpecialCell[] {
  const raw = Array.isArray(design.specialCells) ? design.specialCells : [];
  const cells: RaceSpecialCell[] = [];
  const used = new Set<number>();
  for (const item of raw) {
    if (cells.length >= 12) break;
    if (!item || typeof item !== 'object') continue;
    const cell = Number((item as Record<string, any>).cell);
    if (!Number.isInteger(cell) || cell < 2 || cell > trackLength || used.has(cell)) continue;
    const type = String((item as Record<string, any>).type || '');
    if (!RACE_CELL_TYPES.has(type)) continue;
    used.add(cell);
    cells.push({ cell, type: type as RaceSpecialCell['type'], label: text((item as Record<string, any>).label, '') });
  }
  return cells;
}

/**
 * §6.5 — AI đề xuất số câu, độ khó và ô đặc biệt; code lắp RaceData hợp lệ
 * với validateRaceGame (đội, ô, ngân hàng câu hỏi từ generated questions).
 * Trả về null khi không có câu trắc nghiệm nào (editor sẽ dùng bản nháp mặc định).
 */
export function buildRaceData(questions: GameQuestion[], design: unknown): RaceData | null {
  const usable = questions.filter(isPuzzle);
  if (!usable.length) return null;
  const meta = design && typeof design === 'object' && !Array.isArray(design) ? (design as Record<string, any>) : {};
  const trackLength = intIn(meta.trackLength, 3, 100, 12);
  const maxRounds = intIn(meta.maxRounds, 1, 50, Math.max(3, Math.min(50, Math.round(trackLength / 2))));
  const raceQuestions: RaceQuestion[] = usable.map((question, index) => {
    const difficulty = DIFFICULTIES.has(String(question.difficulty)) ? question.difficulty : 'trung bình';
    return {
      id: `rq${index + 1}`,
      prompt: question.prompt,
      options: question.options.map(option => ({ id: option.id, text: option.text })),
      correctOptionId: question.correctOptionId,
      explanation: String(question.explanation || ''),
      difficulty
    };
  });
  return {
    trackLength,
    maxRounds,
    stepByDifficulty: typeof meta.stepByDifficulty === 'boolean' ? meta.stepByDifficulty : true,
    luckEnabled: typeof meta.luckEnabled === 'boolean' ? meta.luckEnabled : false,
    teams: buildTeams(meta),
    cells: buildCells(meta, trackLength),
    questions: raceQuestions
  };
}
