interface ScenarioOption {
  id?: unknown;
  text?: unknown;
  nextQuestionId?: unknown;
  scenarioScore?: {
    safety?: unknown;
    reasoning?: unknown;
    harmReduction?: unknown;
  };
}

interface ScenarioQuestion {
  id?: unknown;
  type?: unknown;
  options?: ScenarioOption[];
}

interface ScenarioGame {
  template?: unknown;
  questions?: ScenarioQuestion[];
}

export function validateScenarioGame(game: ScenarioGame): void {
  if (game.template !== 'scenario') return;
  const questions = Array.isArray(game.questions) ? game.questions : [];
  const scenarioQuestions = questions.filter(question => question.type === 'scenario');
  const questionIds = new Set(scenarioQuestions.map(question => question.id));
  if (questionIds.size !== scenarioQuestions.length || [...questionIds].some(id => typeof id !== 'string' || !id)) {
    throw new Error('Mỗi tình huống cần có ID riêng.');
  }
  for (const question of scenarioQuestions) {
    if (!Array.isArray(question.options) || question.options.length < 2 ||
        question.options.some(option => !option || typeof option.text !== 'string' || !option.text.trim())) {
      throw new Error(`Tình huống ${String(question.id)} cần ít nhất hai hành động có nội dung.`);
    }
    const optionIds = question.options.map(option => option.id);
    if (new Set(optionIds).size !== optionIds.length ||
        optionIds.some(id => typeof id !== 'string' || !id)) {
      throw new Error(`Các hành động trong tình huống ${String(question.id)} cần ID riêng.`);
    }
    for (const option of question.options) {
      if (typeof option.nextQuestionId === 'string' && !questionIds.has(option.nextQuestionId)) {
        throw new Error(`Nhánh “${option.text}” trỏ tới tình huống không tồn tại.`);
      }
      const score = option.scenarioScore;
      if (score && (
        !isScoreInRange(score.safety, 60) ||
        !isScoreInRange(score.reasoning, 25) ||
        !isScoreInRange(score.harmReduction, 15)
      )) {
        throw new Error(`Điểm cho hành động “${option.text}” vượt giới hạn của thang điểm tình huống.`);
      }
    }
  }
}

function isScoreInRange(value: unknown, maximum: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) &&
    Number.isInteger(value) && value >= 0 && value <= maximum;
}

interface MatchingPairLike {
  id?: unknown;
  left?: unknown;
  right?: unknown;
}

interface MatchingGameLike {
  mode?: unknown;
  pairs?: unknown;
  pointsPerPair?: unknown;
  completionBonus?: unknown;
  wrongPenalty?: unknown;
  timeBonus?: unknown;
  bonusUnderSeconds?: unknown;
  practiceMode?: unknown;
}

interface MatchingTemplateGame {
  template?: unknown;
  matchingGame?: MatchingGameLike;
}

const MATCHING_MODES = ['columns', 'memory', 'categorize'];
const MATCHING_NUMBER_LIMITS: Array<[keyof MatchingGameLike, number]> = [
  ['pointsPerPair', 1000],
  ['completionBonus', 10000],
  ['wrongPenalty', 1000],
  ['timeBonus', 10000],
  ['bonusUnderSeconds', 86400]
];

export function validateMatchingGame(game: MatchingTemplateGame): void {
  if (game.template !== 'matching') return;
  const matching = game.matchingGame;
  if (!matching || typeof matching !== 'object' || Array.isArray(matching)) {
    throw new Error('Trò chơi ghép cặp cần có dữ liệu cặp ghép.');
  }
  if (!MATCHING_MODES.includes(String(matching.mode))) {
    throw new Error('Cách chơi ghép cặp không hợp lệ.');
  }
  const pairs: MatchingPairLike[] = Array.isArray(matching.pairs) ? matching.pairs : [];
  if (pairs.length < 2) {
    throw new Error('Trò chơi ghép cặp cần ít nhất 2 cặp.');
  }
  const ids = pairs.map(pair => (pair as MatchingPairLike)?.id);
  if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !id)) {
    throw new Error('Mỗi cặp ghép cần có ID riêng.');
  }
  for (const pair of pairs) {
    if (typeof pair?.left !== 'string' || !pair.left.trim() ||
        typeof pair?.right !== 'string' || !pair.right.trim()) {
      throw new Error(`Cặp “${String(pair?.id)}” cần có nội dung ở cả cột A và cột B.`);
    }
  }
  const rights = pairs.map(pair => String(pair.right).trim().toLowerCase());
  if (new Set(rights).size !== rights.length) {
    throw new Error('Cột B đang có nội dung trùng lặp; mỗi định nghĩa chỉ nên có một đáp án ghép.');
  }
  if (String(matching.mode) !== 'categorize') {
    const lefts = pairs.map(pair => String(pair.left).trim().toLowerCase());
    if (new Set(lefts).size !== lefts.length) {
      throw new Error('Cột A đang có nội dung trùng lặp; mỗi thuật ngữ chỉ nên ghép với một đáp án.');
    }
  }
  for (const [field, limit] of MATCHING_NUMBER_LIMITS) {
    const value = (matching as MatchingGameLike)[field];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > limit) {
      throw new Error(`Cấu hình điểm ghép cặp “${String(field)}” phải là số từ 0 đến ${limit}.`);
    }
  }
  if (matching.practiceMode !== undefined && typeof matching.practiceMode !== 'boolean') {
    throw new Error('Chế độ luyện tập của ghép cặp phải là true hoặc false.');
  }
}

interface TreasureTemplateGame {
  template?: unknown;
  treasureHunt?: {
    stages?: unknown;
    journeyBonus?: unknown;
    hiddenItemBonus?: unknown;
  };
}

const TREASURE_NUMBER_LIMITS: Array<[string, number]> = [
  ['journeyBonus', 10000],
  ['hiddenItemBonus', 1000]
];

export function validateTreasureHuntGame(game: TreasureTemplateGame): void {
  if (game.template !== 'treasure-hunt') return;
  const hunt = game.treasureHunt;
  if (!hunt || typeof hunt !== 'object' || Array.isArray(hunt)) {
    throw new Error('Hành trình kho báu cần có danh sách chặng.');
  }
  for (const [field, limit] of TREASURE_NUMBER_LIMITS) {
    const value = (hunt as Record<string, unknown>)[field];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > limit) {
      throw new Error(`Cấu hình điểm hành trình “${field}” phải là số từ 0 đến ${limit}.`);
    }
  }
  const stages = Array.isArray(hunt.stages) ? hunt.stages : [];
  if (stages.length < 2) {
    throw new Error('Hành trình cần ít nhất 2 chặng.');
  }
  const ids = stages.map((stage: { id?: unknown }) => stage?.id);
  if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !id)) {
    throw new Error('Mỗi chặng cần có ID riêng.');
  }
  const idSet = new Set(ids as string[]);
  let endingCount = 0;
  for (const stage of stages as Array<Record<string, unknown>>) {
    const label = String(stage.name || stage.id);
    if (typeof stage.name !== 'string' || !stage.name.trim()) {
      throw new Error(`Chặng “${label}” cần có tên.`);
    }
    const question = stage.question as Record<string, unknown> | undefined;
    if (!question || typeof question.prompt !== 'string' || !String(question.prompt).trim()) {
      throw new Error(`Chặng “${label}” cần có nội dung câu đố.`);
    }
    const options = Array.isArray(question.options) ? question.options : [];
    if (options.length < 2) {
      throw new Error(`Câu đố của chặng “${label}” cần ít nhất 2 đáp án.`);
    }
    const optionIds = options.map((option: { id?: unknown }) => option?.id);
    if (new Set(optionIds).size !== optionIds.length ||
        optionIds.some(id => typeof id !== 'string' || !id) ||
        options.some((option: { text?: unknown }) => typeof option?.text !== 'string' || !option.text.trim())) {
      throw new Error(`Đáp án của chặng “${label}” cần ID riêng và nội dung đầy đủ.`);
    }
    if (!optionIds.includes(question.correctOptionId)) {
      throw new Error(`Đáp án đúng của chặng “${label}” không nằm trong danh sách đáp án.`);
    }
    if (question.hint !== undefined && question.hint !== null && typeof question.hint !== 'string') {
      throw new Error(`Gợi ý của chặng “${label}” không hợp lệ.`);
    }
    const attempts = stage.attempts;
    if (attempts !== undefined && attempts !== null &&
        (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0 || attempts > 99)) {
      throw new Error(`Số lượt thử của chặng “${label}” phải là số nguyên từ 0 (không giới hạn) đến 99.`);
    }
    for (const [field, limit] of [['points', 1000], ['completionBonus', 10000]] as Array<[string, number]>) {
      const value = stage[field];
      if (value === undefined || value === null || value === '') continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > limit) {
        throw new Error(`Điểm “${field}” của chặng “${label}” phải là số từ 0 đến ${limit}.`);
      }
    }
    if (stage.nextStageId === null || stage.nextStageId === undefined) {
      endingCount += 1;
    } else if (typeof stage.nextStageId !== 'string' || !idSet.has(stage.nextStageId as string)) {
      throw new Error(`Chặng “${label}” trỏ tới chặng không tồn tại.`);
    }
    if (stage.branchStageId !== undefined && stage.branchStageId !== null && stage.branchStageId !== '') {
      if (typeof stage.branchLabel !== 'string' || !stage.branchLabel.trim()) {
        throw new Error(`Nhánh phụ của chặng “${label}” cần có nhãn để học sinh lựa chọn.`);
      }
      if (typeof stage.branchStageId !== 'string' || !idSet.has(stage.branchStageId as string) || stage.branchStageId === stage.id) {
        throw new Error(`Nhánh phụ của chặng “${label}” trỏ tới chặng không hợp lệ.`);
      }
    }
  }
  if (endingCount === 0) {
    throw new Error('Hành trình cần ít nhất một chặng kết thúc (chặng không trỏ tới chặng tiếp theo).');
  }
}

interface RaceTemplateGame {
  template?: unknown;
  race?: {
    trackLength?: unknown;
    maxRounds?: unknown;
    stepByDifficulty?: unknown;
    luckEnabled?: unknown;
    teams?: unknown;
    cells?: unknown;
    questions?: unknown;
  };
}

const RACE_CELL_TYPES = ['normal', 'boost', 'penalty', 'lucky', 'challenge'];

export function validateRaceGame(game: RaceTemplateGame): void {
  if (game.template !== 'race') return;
  const race = game.race;
  if (!race || typeof race !== 'object' || Array.isArray(race)) {
    throw new Error('Đường đua cần có cấu hình đội và sân.');
  }
  if (typeof race.trackLength !== 'number' || !Number.isInteger(race.trackLength) || race.trackLength < 3 || race.trackLength > 100) {
    throw new Error('Chiều dài đường đua phải là số nguyên từ 3 đến 100 ô.');
  }
  if (typeof race.maxRounds !== 'number' || !Number.isInteger(race.maxRounds) || race.maxRounds < 1 || race.maxRounds > 50) {
    throw new Error('Số vòng đua phải là số nguyên từ 1 đến 50.');
  }
  const teams = Array.isArray(race.teams) ? race.teams : [];
  if (teams.length < 2) {
    throw new Error('Đường đua cần ít nhất 2 đội.');
  }
  const teamIds = teams.map((team: { id?: unknown }) => team?.id);
  const teamNames = teams.map((team: { name?: unknown }) => String(team?.name || '').trim().toLowerCase());
  if (new Set(teamIds).size !== teamIds.length ||
      teamIds.some(id => typeof id !== 'string' || !id) ||
      teams.some((team: { name?: unknown }) => typeof team?.name !== 'string' || !String(team.name).trim())) {
    throw new Error('Mỗi đội cần có ID và tên riêng.');
  }
  if (new Set(teamNames).size !== teamNames.length) {
    throw new Error('Tên các đội đang trùng nhau.');
  }
  const cells = Array.isArray(race.cells) ? race.cells : [];
  const cellIndexes = cells.map((cell: { cell?: unknown }) => cell?.cell);
  if (new Set(cellIndexes).size !== cellIndexes.length) {
    throw new Error('Đường đua đang có nhiều hiệu ứng trên cùng một ô.');
  }
  for (const cell of cells as Array<Record<string, unknown>>) {
    if (typeof cell.cell !== 'number' || !Number.isInteger(cell.cell) || cell.cell < 2 || cell.cell > race.trackLength) {
      throw new Error('Ô đặc biệt phải là số nguyên trong khoảng 2 đến hết đường đua.');
    }
    if (!RACE_CELL_TYPES.includes(String(cell.type))) {
      throw new Error('Hiệu ứng ô đặc biệt không hợp lệ.');
    }
    if (cell.label !== undefined && cell.label !== null && typeof cell.label !== 'string') {
      throw new Error('Nhãn ô đặc biệt không hợp lệ.');
    }
  }
  const questions = Array.isArray(race.questions) ? race.questions : [];
  if (questions.length < 1) {
    throw new Error('Đường đua cần ít nhất 1 câu hỏi trong ngân hàng.');
  }
  const questionIds = questions.map((question: { id?: unknown }) => question?.id);
  if (new Set(questionIds).size !== questionIds.length ||
      questionIds.some(id => typeof id !== 'string' || !id)) {
    throw new Error('Mỗi câu hỏi đường đua cần có ID riêng.');
  }
  for (const question of questions as Array<Record<string, unknown>>) {
    const label = String(question.id);
    if (typeof question.prompt !== 'string' || !String(question.prompt).trim()) {
      throw new Error(`Câu hỏi “${label}” cần có nội dung.`);
    }
    const options = Array.isArray(question.options) ? question.options : [];
    if (options.length < 2) {
      throw new Error(`Câu hỏi “${label}” cần ít nhất 2 đáp án.`);
    }
    const optionIds = options.map((option: { id?: unknown }) => option?.id);
    if (new Set(optionIds).size !== optionIds.length ||
        optionIds.some(id => typeof id !== 'string' || !id) ||
        options.some((option: { text?: unknown }) => typeof option?.text !== 'string' || !option.text.trim())) {
      throw new Error(`Đáp án của câu hỏi “${label}” cần ID riêng và nội dung đầy đủ.`);
    }
    if (!optionIds.includes(question.correctOptionId)) {
      throw new Error(`Đáp án đúng của câu hỏi “${label}” không nằm trong danh sách đáp án.`);
    }
    if (question.difficulty !== undefined && question.difficulty !== null &&
        !['dễ', 'trung bình', 'khó'].includes(String(question.difficulty))) {
      throw new Error(`Độ khó của câu hỏi “${label}” không hợp lệ.`);
    }
  }
  if (race.stepByDifficulty !== undefined && typeof race.stepByDifficulty !== 'boolean') {
    throw new Error('Luật tiến theo độ khó phải là true hoặc false.');
  }
  if (race.luckEnabled !== undefined && typeof race.luckEnabled !== 'boolean') {
    throw new Error('Bật/tắt yếu tố may mắn phải là true hoặc false.');
  }
}
