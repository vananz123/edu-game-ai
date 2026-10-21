import type {
  ArenaChoiceQuestion,
  ArenaTextQuestion,
  GameConfig,
  GameDraft,
  LessonAnalysis,
  ScenarioSituation,
  WorkflowGameType
} from '../shared/lesson-types';

/**
 * Deterministic content-quality checks (O2 of docs/archive/specs/update-AI-local.txt).
 *
 * Structural validity is already guaranteed before this runs: the draft passes
 * per-type zod, the single adapter builds `EducationalGame`, and the four legacy
 * validators run on the result. What those cannot express is content quality:
 * two questions asking the same thing, two identical options, a scenario without
 * a best answer, a treasure chain pointing at a missing stage, a generic
 * distractor, an objective nobody exercises.
 *
 * Everything here is plain TypeScript — no model call, no I/O, no randomness —
 * so it is cheap enough to run on every generation and fully unit-testable.
 *
 * Design rule (DECISIONS #21): this is **advisory**. Findings are shown to the
 * teacher before they open the editor; they never block saving, because the
 * adapter + legacy validators already gate structurally broken content and a
 * false positive must not trap a teacher who knows better.
 */

export type QualitySeverity = 'error' | 'warning';

export type QualityIssueCode =
  | 'NO_ITEMS'
  | 'COUNT_BELOW_REQUEST'
  | 'DUPLICATE_PROMPT'
  | 'NEAR_DUPLICATE_PROMPT'
  | 'DUPLICATE_OPTION'
  | 'TOO_FEW_OPTIONS'
  | 'ONLY_TWO_OPTIONS'
  | 'GENERIC_OPTION'
  | 'MISSING_CORRECT_OPTION'
  | 'MISSING_ANSWER'
  | 'DUPLICATE_ANSWER'
  | 'EMPTY_EXPLANATION'
  | 'ZERO_POINTS'
  | 'SITUATION_NO_BEST_OPTION'
  | 'SITUATION_NO_SCORE_DIFFERENCE'
  | 'SITUATION_NO_FEEDBACK'
  | 'BROKEN_LINK'
  | 'EMPTY_PAIR_SIDE'
  | 'DUPLICATE_PAIR'
  | 'MATCHING_IDENTICAL_SIDES'
  | 'MATCHING_GENERIC_SIDE'
  | 'DUPLICATE_STAGE_ID'
  | 'CHAIN_CYCLE'
  | 'UNREACHABLE_STAGE'
  | 'STAGE_NO_ATTEMPTS'
  | 'RACE_TOO_FEW_TEAMS'
  | 'RACE_TEAM_COUNT_MISMATCH'
  | 'RACE_CELL_OUT_OF_TRACK'
  | 'DUPLICATE_CELL'
  | 'OBJECTIVE_UNCOVERED';

export interface QualityIssue {
  severity: QualitySeverity;
  code: QualityIssueCode;
  /** Teacher-facing Vietnamese sentence (already includes the item position). */
  message: string;
  /** Draft item id when the finding is scoped to one item. */
  itemId?: string;
  /** 1-based position, for the UI to jump/highlight later. */
  itemIndex?: number;
}

export interface QualityCounts {
  requested: number | null;
  found: number;
  /** Vietnamese noun used in messages: "câu hỏi", "tình huống", ... */
  unit: string;
}

export interface QualityReport {
  gameType: WorkflowGameType;
  issues: QualityIssue[];
  errors: number;
  warnings: number;
  /** True when there is no hard finding (advisory gate — see DECISIONS #21). */
  canPublish: boolean;
  counts: QualityCounts;
  /** Focus objectives that no item seems to exercise. */
  uncoveredObjectiveIds: string[];
}

export interface QualityCheckOptions {
  draft: GameDraft;
  config?: GameConfig | null;
  analysis?: LessonAnalysis | null;
}

const GENERIC_OPTION_TEXTS = new Set([
  'tất cả đều đúng',
  'tất cả đều sai',
  'cả a và b',
  'cả a b và c',
  'không có đáp án nào',
  'không xác định'
]);

const COVERAGE_STOP_WORDS = new Set([
  'nêu',
  'trình',
  'bày',
  'hiểu',
  'biết',
  'vận',
  'dụng',
  'phân',
  'tích',
  'giải',
  'thích',
  'mô',
  'tả',
  'nhận',
  'xét',
  'sánh',
  'liệt',
  'kê',
  'tên',
  'các',
  'những',
  'của',
  'trong',
  'khi',
  'cho',
  'với',
  'được',
  'thể',
  'một',
  'đúng',
  'sai',
  'theo',
  'như',
  'thế',
  'nào'
]);

/** Lowercase, strip punctuation, collapse whitespace. Diacritics are meaningful. */
export function normalizeItemText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,;:!?()[\]{}"'“”‘’\-–—_/\\|*+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(text: string): string[] {
  return normalizeItemText(text).split(' ').filter(token => token.length >= 2);
}

function tokenSet(text: string): Set<string> {
  return new Set(tokens(text).filter(token => token.length >= 3));
}

/** Jaccard similarity on word sets; 1 means identical wording. */
export function textSimilarity(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  left.forEach(token => {
    if (right.has(token)) shared += 1;
  });
  return shared / (left.size + right.size - shared);
}

function isBlank(value: unknown): boolean {
  return !String(value ?? '').trim();
}

function pointsOf(items: Array<{ points?: number }>): number {
  return items.reduce((total, item) => total + (Number(item.points) || 0), 0);
}

function sentence(index: number, text: string): string {
  return `Mục ${index}: ${text}`;
}

/** One draft item's identity + displayable text, for duplicate checks. */
interface ItemText {
  id?: string;
  index: number;
  text: string;
  label: string;
}

function collectItemTexts(draft: GameDraft): ItemText[] {
  switch (draft.gameType) {
    case 'arena':
      return draft.questions.map((question, position) => ({
        id: question.id,
        index: position + 1,
        text: question.prompt,
        label: 'Câu'
      }));
    case 'scenario':
      return draft.situations.map((situation, position) => ({
        id: situation.id,
        index: position + 1,
        text: `${situation.context || ''} ${situation.prompt || ''}`,
        label: 'Tình huống'
      }));
    case 'matching':
      return draft.pairs.map((pair, position) => ({
        id: pair.id,
        index: position + 1,
        text: pair.left,
        label: 'Cặp'
      }));
    case 'treasure':
      return draft.stages.map((stage, position) => ({
        id: stage.id,
        index: position + 1,
        text: stage.question ? stage.question.prompt : stage.taskDescription,
        label: 'Chặng'
      }));
    case 'race':
      return draft.questions.map((question, position) => ({
        id: question.id,
        index: position + 1,
        text: question.prompt,
        label: 'Câu'
      }));
    default:
      return [];
  }
}

function checkDuplicatePrompts(items: ItemText[], push: (issue: QualityIssue) => void): void {
  const seen = new Map<string, ItemText>();
  items.forEach(item => {
    const key = normalizeItemText(item.text);
    if (!key) return;
    const first = seen.get(key);
    if (first) {
      push({
        severity: 'error',
        code: 'DUPLICATE_PROMPT',
        message: `${item.label} ${item.index} trùng hoàn toàn nội dung với ${first.label.toLowerCase()} ${first.index}.`,
        itemId: item.id,
        itemIndex: item.index
      });
      return;
    }
    seen.set(key, item);
  });

  // Near-duplicates are warnings: wording may differ while the question is the same.
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const similarity = textSimilarity(items[i].text, items[j].text);
      if (similarity >= 0.85 && normalizeItemText(items[i].text) !== normalizeItemText(items[j].text)) {
        push({
          severity: 'warning',
          code: 'NEAR_DUPLICATE_PROMPT',
          message: `${items[j].label} ${items[j].index} gần giống ${items[i].label.toLowerCase()} ${items[i].index} (${Math.round(similarity * 100)}%). Nên gộp hoặc viết lại cho khác nhau.`,
          itemId: items[j].id,
          itemIndex: items[j].index
        });
      }
    }
  }
}

function checkChoiceOptions(
  options: Array<{ id: string; text: string }>,
  correctOptionId: string | null | undefined,
  itemIndex: number,
  push: (issue: QualityIssue) => void,
  itemId?: string,
  /** True/false questions legitimately have exactly two options. */
  allowTwoOptions = false
): void {
  const usable = options.filter(option => !isBlank(option.text));
  if (usable.length < 2) {
    push({
      severity: 'error',
      code: 'TOO_FEW_OPTIONS',
      message: sentence(itemIndex, 'cần ít nhất 2 lựa chọn có nội dung.'),
      itemId,
      itemIndex
    });
  } else if (usable.length === 2 && !allowTwoOptions) {
    push({
      severity: 'warning',
      code: 'ONLY_TWO_OPTIONS',
      message: sentence(itemIndex, 'chỉ có 2 lựa chọn nên học sinh dễ đoán đúng (nên có 3–4).'),
      itemId,
      itemIndex
    });
  }

  const seen = new Map<string, string>();
  usable.forEach(option => {
    const key = normalizeItemText(option.text);
    if (seen.has(key)) {
      push({
        severity: 'error',
        code: 'DUPLICATE_OPTION',
        message: sentence(itemIndex, `có hai lựa chọn trùng nhau (“${option.text.trim()}”).`),
        itemId,
        itemIndex
      });
    } else {
      seen.set(key, option.id);
    }
    if (GENERIC_OPTION_TEXTS.has(key)) {
      push({
        severity: 'warning',
        code: 'GENERIC_OPTION',
        message: sentence(itemIndex, `phương án “${option.text.trim()}” chung chung, không kiểm tra được kiến thức.`),
        itemId,
        itemIndex
      });
    }
  });

  if (isBlank(correctOptionId)) {
    push({
      severity: 'error',
      code: 'MISSING_CORRECT_OPTION',
      message: sentence(itemIndex, 'chưa có đáp án đúng.'),
      itemId,
      itemIndex
    });
  } else if (!usable.some(option => option.id === correctOptionId)) {
    push({
      severity: 'error',
      code: 'MISSING_CORRECT_OPTION',
      message: sentence(itemIndex, 'đáp án đúng không nằm trong danh sách lựa chọn.'),
      itemId,
      itemIndex
    });
  }
}

function checkArena(draft: Extract<GameDraft, { gameType: 'arena' }>, config: GameConfig | null, push: (issue: QualityIssue) => void): void {
  if (!draft.questions.length) {
    push({ severity: 'error', code: 'NO_ITEMS', message: 'Chưa có câu hỏi nào.' });
    return;
  }
  draft.questions.forEach((question, position) => {
    const index = position + 1;
    if (isBlank(question.prompt)) {
      push({ severity: 'error', code: 'NO_ITEMS', message: sentence(index, 'câu hỏi bị trống.'), itemId: question.id, itemIndex: index });
    }
    if (question.type === 'multiple-choice' || question.type === 'true-false') {
      const choice = question as ArenaChoiceQuestion;
      checkChoiceOptions(choice.options || [], choice.correctOptionId, index, push, question.id, question.type === 'true-false');
    } else {
      const textQuestion = question as ArenaTextQuestion;
      if (isBlank(textQuestion.correctAnswer)) {
        push({ severity: 'error', code: 'MISSING_ANSWER', message: sentence(index, 'chưa có đáp án đúng.'), itemId: question.id, itemIndex: index });
      }
      const alternates = (textQuestion.alternateAnswers || []).map(normalizeItemText).filter(Boolean);
      if (new Set(alternates).size !== alternates.length) {
        push({ severity: 'warning', code: 'DUPLICATE_ANSWER', message: sentence(index, 'có đáp án thay thế bị lặp.'), itemId: question.id, itemIndex: index });
      }
    }
    if (isBlank(question.explanation) || String(question.explanation).trim().length < 12) {
      push({ severity: 'warning', code: 'EMPTY_EXPLANATION', message: sentence(index, 'thiếu giải thích sau khi trả lời.'), itemId: question.id, itemIndex: index });
    }
    if (!(Number(question.points) > 0)) {
      push({ severity: 'warning', code: 'ZERO_POINTS', message: sentence(index, 'chưa có điểm thưởng.'), itemId: question.id, itemIndex: index });
    }
  });
  if (pointsOf(draft.questions) <= 0) {
    push({ severity: 'warning', code: 'ZERO_POINTS', message: 'Tổng điểm của trò chơi đang bằng 0.' });
  }
}

function scenarioBestOption(situation: ScenarioSituation): string | null {
  const options = situation.options || [];
  if (situation.correctOptionId && options.some(option => option.id === situation.correctOptionId)) {
    return situation.correctOptionId;
  }
  const scored = options
    .filter(option => option.score)
    .map(option => ({
      id: option.id,
      total:
        (Number(option.score?.safety) || 0) +
        (Number(option.score?.reasoning) || 0) +
        (Number(option.score?.harmReduction) || 0)
    }));
  if (!scored.length) return null;
  scored.sort((a, b) => b.total - a.total);
  if (scored.length > 1 && scored[0].total === scored[1].total) return null;
  return scored[0].total > 0 ? scored[0].id : null;
}

function checkScenario(draft: Extract<GameDraft, { gameType: 'scenario' }>, push: (issue: QualityIssue) => void): void {
  if (!draft.situations.length) {
    push({ severity: 'error', code: 'NO_ITEMS', message: 'Chưa có tình huống nào.' });
    return;
  }
  const ids = new Set(draft.situations.map(situation => situation.id));
  draft.situations.forEach((situation, position) => {
    const index = position + 1;
    const options = situation.options || [];
    if (options.length < 2) {
      push({ severity: 'error', code: 'TOO_FEW_OPTIONS', message: sentence(index, 'cần ít nhất 2 phương án để chọn.'), itemId: situation.id, itemIndex: index });
    }
    if (!scenarioBestOption(situation)) {
      push({
        severity: 'error',
        code: 'SITUATION_NO_BEST_OPTION',
        message: sentence(index, 'chưa xác định được phương án tốt nhất (thiếu điểm hoặc các điểm bằng nhau).'),
        itemId: situation.id,
        itemIndex: index
      });
    }
    const totals = options.filter(option => option.score).map(option =>
      (Number(option.score?.safety) || 0) + (Number(option.score?.reasoning) || 0) + (Number(option.score?.harmReduction) || 0)
    );
    if (totals.length > 1 && new Set(totals).size === 1) {
      push({ severity: 'warning', code: 'SITUATION_NO_SCORE_DIFFERENCE', message: sentence(index, 'mọi phương án cùng điểm nên không phân biệt được lựa chọn tốt.'), itemId: situation.id, itemIndex: index });
    }
    if (options.length && options.every(option => isBlank(option.feedback) && isBlank(option.consequence))) {
      push({ severity: 'warning', code: 'SITUATION_NO_FEEDBACK', message: sentence(index, 'chưa có phản hồi/hậu quả cho các phương án.'), itemId: situation.id, itemIndex: index });
    }
    options.forEach(option => {
      if (option.nextSituationId && !ids.has(option.nextSituationId)) {
        push({
          severity: 'error',
          code: 'BROKEN_LINK',
          message: sentence(index, `phương án “${(option.text || '').trim()}” trỏ tới tình huống không tồn tại.`),
          itemId: situation.id,
          itemIndex: index
        });
      }
    });
  });
}

function checkMatching(draft: Extract<GameDraft, { gameType: 'matching' }>, push: (issue: QualityIssue) => void): void {
  if (!draft.pairs.length) {
    push({ severity: 'error', code: 'NO_ITEMS', message: 'Chưa có cặp ghép nào.' });
    return;
  }
  const lefts = new Map<string, number>();
  const rights = new Map<string, number>();
  draft.pairs.forEach((pair, position) => {
    const index = position + 1;
    if (isBlank(pair.left) || isBlank(pair.right)) {
      push({ severity: 'error', code: 'EMPTY_PAIR_SIDE', message: sentence(index, 'một bên của cặp ghép bị trống.'), itemId: pair.id, itemIndex: index });
      return;
    }
    const left = normalizeItemText(pair.left);
    const right = normalizeItemText(pair.right);
    if (lefts.has(left) || rights.has(right)) {
      push({
        severity: 'error',
        code: 'DUPLICATE_PAIR',
        message: sentence(index, 'bị trùng với cặp khác nên học sinh không biết ghép thế nào mới đúng.'),
        itemId: pair.id,
        itemIndex: index
      });
    }
    if (!lefts.has(left)) lefts.set(left, index);
    if (!rights.has(right)) rights.set(right, index);
    if (left === right) {
      push({
        severity: 'warning',
        code: 'MATCHING_IDENTICAL_SIDES',
        message: sentence(index, 'có hai vế giống nhau; học sinh có thể ghép mà không cần hiểu quan hệ.'),
        itemId: pair.id,
        itemIndex: index
      });
    }
    const generic = new Set(['tất cả', 'khác', 'không', 'có', 'đúng', 'sai']);
    if (generic.has(left) || generic.has(right)) {
      push({
        severity: 'warning',
        code: 'MATCHING_GENERIC_SIDE',
        message: sentence(index, 'dùng từ quá chung chung; hãy thay bằng nội dung kiến thức cụ thể.'),
        itemId: pair.id,
        itemIndex: index
      });
    }
  });
  if (!(Number(draft.pointsPerPair) > 0)) {
    push({ severity: 'warning', code: 'ZERO_POINTS', message: 'Điểm cho mỗi cặp ghép đang bằng 0.' });
  }
}

function checkTreasure(draft: Extract<GameDraft, { gameType: 'treasure' }>, push: (issue: QualityIssue) => void): void {
  if (!draft.stages.length) {
    push({ severity: 'error', code: 'NO_ITEMS', message: 'Chưa có chặng nào.' });
    return;
  }
  const ids = new Set<string>();
  draft.stages.forEach((stage, position) => {
    const index = position + 1;
    if (ids.has(stage.id)) {
      push({ severity: 'error', code: 'DUPLICATE_STAGE_ID', message: sentence(index, 'mã chặng bị trùng.'), itemId: stage.id, itemIndex: index });
    }
    ids.add(stage.id);
    if (!stage.question) {
      push({ severity: 'error', code: 'NO_ITEMS', message: sentence(index, 'chặng chưa có câu hỏi.'), itemId: stage.id, itemIndex: index });
    } else {
      const missionType = stage.mission?.type || 'multiple-choice';
      if (missionType === 'multiple-choice' || missionType === 'scenario') {
        checkChoiceOptions(stage.question.options || [], stage.question.correctOptionId, index, push, stage.id);
      } else if (missionType === 'matching') {
        const pairs = stage.mission?.type === 'matching' ? stage.mission.pairs : [];
        if (pairs.length < 2) {
          push({ severity: 'error', code: 'NO_ITEMS', message: sentence(index, 'cần ít nhất 2 cặp ghép.'), itemId: stage.id, itemIndex: index });
        }
        const seenPairs = new Set<string>();
        pairs.forEach(pair => {
          if (isBlank(pair.left) || isBlank(pair.right)) {
            push({ severity: 'error', code: 'EMPTY_PAIR_SIDE', message: sentence(index, 'có cặp ghép bị trống một vế.'), itemId: stage.id, itemIndex: index });
          }
          const key = `${normalizeItemText(pair.left)}|${normalizeItemText(pair.right)}`;
          if (seenPairs.has(key)) {
            push({ severity: 'warning', code: 'DUPLICATE_PAIR', message: sentence(index, 'có cặp ghép trùng nội dung.'), itemId: stage.id, itemIndex: index });
          }
          seenPairs.add(key);
        });
      } else if (missionType === 'decode') {
        if (stage.mission?.type === 'decode' && isBlank(stage.mission.answer)) {
          push({ severity: 'error', code: 'MISSING_ANSWER', message: sentence(index, 'chưa có đáp án giải mã.'), itemId: stage.id, itemIndex: index });
        }
      } else if (missionType === 'classification') {
        const groups = stage.mission?.type === 'classification' ? stage.mission.groups : [];
        const items = stage.mission?.type === 'classification' ? stage.mission.items : [];
        if (groups.length < 2 || items.length < 2) {
          push({ severity: 'error', code: 'NO_ITEMS', message: sentence(index, 'cần ít nhất 2 nhóm và 2 mục phân loại.'), itemId: stage.id, itemIndex: index });
        }
        const groupIds = new Set(groups.map(group => group.id));
        if (items.some(item => isBlank(item.text) || !groupIds.has(item.groupId))) {
          push({ severity: 'error', code: 'BROKEN_LINK', message: sentence(index, 'có mục phân loại trống hoặc trỏ tới nhóm không tồn tại.'), itemId: stage.id, itemIndex: index });
        }
      }
      if (isBlank(stage.question.explanation)) {
        push({ severity: 'warning', code: 'EMPTY_EXPLANATION', message: sentence(index, 'thiếu giải thích khi mở khoá chặng.'), itemId: stage.id, itemIndex: index });
      }
    }
    if (!(Number(stage.attempts) > 0)) {
      push({ severity: 'warning', code: 'STAGE_NO_ATTEMPTS', message: sentence(index, 'chưa có số lần thử.'), itemId: stage.id, itemIndex: index });
    }
  });

  draft.stages.forEach((stage, position) => {
    const index = position + 1;
    [stage.nextStageId, stage.branchStageId].forEach(target => {
      if (target && !ids.has(target)) {
        push({ severity: 'error', code: 'BROKEN_LINK', message: sentence(index, `trỏ tới chặng không tồn tại (${target}).`), itemId: stage.id, itemIndex: index });
      }
    });
  });

  // The adapter chains stages in order when `nextStageId` is omitted, so the
  // relevant structural risk here is a cycle through explicit links.
  const linkOf = (stage: (typeof draft.stages)[number]) => stage.nextStageId || null;
  draft.stages.forEach((stage, position) => {
    const seen = new Set<string>([stage.id]);
    let cursor = linkOf(stage);
    let steps = 0;
    while (cursor && steps < draft.stages.length + 1) {
      if (seen.has(cursor)) {
        push({ severity: 'error', code: 'CHAIN_CYCLE', message: sentence(position + 1, 'chuỗi chặng bị vòng lặp.'), itemId: stage.id, itemIndex: position + 1 });
        return;
      }
      seen.add(cursor);
      const next = draft.stages.find(item => item.id === cursor);
      cursor = next ? linkOf(next) : null;
      steps += 1;
    }
  });

  if (draft.stages.length > 1) {
    const reachable = new Set<string>();
    let cursor: string | null = draft.stages[0].id;
    let guard = 0;
    while (cursor && guard <= draft.stages.length) {
      reachable.add(cursor);
      const stage = draft.stages.find(item => item.id === cursor);
      cursor = stage ? linkOf(stage) : null;
      guard += 1;
    }
    draft.stages.forEach((stage, position) => {
      if (!reachable.has(stage.id)) {
        push({ severity: 'warning', code: 'UNREACHABLE_STAGE', message: sentence(position + 1, 'không nằm trên chuỗi chặng chính nên có thể không bao giờ tới được.'), itemId: stage.id, itemIndex: position + 1 });
      }
    });
  }
}

function checkRace(draft: Extract<GameDraft, { gameType: 'race' }>, config: GameConfig | null, push: (issue: QualityIssue) => void): void {
  if (!draft.questions.length) {
    push({ severity: 'error', code: 'NO_ITEMS', message: 'Chưa có câu hỏi nào.' });
  }
  if ((draft.teams || []).length < 2) {
    push({ severity: 'error', code: 'RACE_TOO_FEW_TEAMS', message: 'Đường đua cần ít nhất 2 đội.' });
  }
  if (config && config.gameType === 'race' && draft.teams.length < config.teamCount) {
    push({
      severity: 'warning',
      code: 'RACE_TEAM_COUNT_MISMATCH',
      message: `Đang có ${draft.teams.length}/${config.teamCount} đội theo cấu hình.`
    });
  }
  const trackLength = Number(draft.trackLength) || Number(config && config.gameType === 'race' ? config.trackLength : 0);
  const seenCells = new Set<number>();
  (draft.cells || []).forEach(cell => {
    if (trackLength && (cell.cell < 1 || cell.cell > trackLength)) {
      push({ severity: 'error', code: 'RACE_CELL_OUT_OF_TRACK', message: `Ô đặc biệt số ${cell.cell} nằm ngoài đường đua (${trackLength} ô).` });
    }
    if (seenCells.has(cell.cell)) {
      push({ severity: 'warning', code: 'DUPLICATE_CELL', message: `Có nhiều ô đặc biệt cùng số ${cell.cell}.` });
    }
    seenCells.add(cell.cell);
  });
  draft.questions.forEach((question, position) => {
    const index = position + 1;
    checkChoiceOptions(question.options || [], question.correctOptionId, index, push, question.id);
    if (isBlank(question.explanation)) {
      push({ severity: 'warning', code: 'EMPTY_EXPLANATION', message: sentence(index, 'thiếu giải thích sau khi trả lời.'), itemId: question.id, itemIndex: index });
    }
  });
}

/**
 * How many items the teacher asked for, with the Vietnamese unit used in both the
 * quality warning and the generation shortfall retry (O9).
 */
export function requestedItemCount(config: GameConfig | null): { requested: number | null; unit: string } {
  if (!config) return { requested: null, unit: 'mục' };
  switch (config.gameType) {
    case 'arena':
      return { requested: Number(config.questionCount) || null, unit: 'câu hỏi' };
    case 'scenario':
      return { requested: Number(config.situationCount) || null, unit: 'tình huống' };
    case 'matching':
      return { requested: Number(config.pairCount) || null, unit: 'cặp ghép' };
    case 'treasure':
      return { requested: Number(config.stageCount) || null, unit: 'chặng' };
    case 'race':
      return { requested: Number(config.maxRounds) || null, unit: 'câu hỏi' };
    default:
      return { requested: null, unit: 'mục' };
  }
}

function foundCount(draft: GameDraft): number {
  switch (draft.gameType) {
    case 'arena':
      return draft.questions.length;
    case 'scenario':
      return draft.situations.length;
    case 'matching':
      return draft.pairs.length;
    case 'treasure':
      return draft.stages.length;
    case 'race':
      return draft.questions.length;
    default:
      return 0;
  }
}

/** Distinctive words of an objective, used for the (hedged) coverage warning. */
function objectiveKeywords(description: string): string[] {
  return tokens(description).filter(token => token.length >= 4 && !COVERAGE_STOP_WORDS.has(token)).slice(0, 6);
}

function checkObjectiveCoverage(
  analysis: LessonAnalysis | null | undefined,
  config: GameConfig | null,
  items: ItemText[],
  push: (issue: QualityIssue) => void
): string[] {
  const focus = config && Array.isArray(config.focusObjectiveIds) ? config.focusObjectiveIds : [];
  if (!focus.length || !analysis) return [];
  const haystack = items.map(item => normalizeItemText(item.text)).join(' ');
  const uncovered: string[] = [];
  focus.forEach(objectiveId => {
    const objective = (analysis.objectives || []).find(item => item.id === objectiveId);
    if (!objective) return;
    const keywords = objectiveKeywords(objective.description || '');
    if (!keywords.length) return;
    const covered = keywords.some(keyword => haystack.includes(keyword));
    if (!covered) {
      uncovered.push(objectiveId);
      push({
        severity: 'warning',
        code: 'OBJECTIVE_UNCOVERED',
        message: `Mục tiêu “${objective.description}” có thể chưa được thể hiện trong nội dung.`,
        itemId: objectiveId
      });
    }
  });
  return uncovered;
}

/**
 * Runs every deterministic quality check for a draft.
 * Pure: same input -> same report.
 */
export function checkDraftQuality(options: QualityCheckOptions): QualityReport {
  const { draft, config = null, analysis = null } = options;
  const issues: QualityIssue[] = [];
  const push = (issue: QualityIssue) => issues.push(issue);

  switch (draft.gameType) {
    case 'arena':
      checkArena(draft, config, push);
      break;
    case 'scenario':
      checkScenario(draft, push);
      break;
    case 'matching':
      checkMatching(draft, push);
      break;
    case 'treasure':
      checkTreasure(draft, push);
      break;
    case 'race':
      checkRace(draft, config, push);
      break;
    default:
      break;
  }

  const items = collectItemTexts(draft);
  checkDuplicatePrompts(items, push);
  const uncoveredObjectiveIds = checkObjectiveCoverage(analysis, config, items, push);

  const { requested, unit } = requestedItemCount(config);
  const found = foundCount(draft);
  if (requested && found > 0 && found < requested) {
    push({
      severity: 'warning',
      code: 'COUNT_BELOW_REQUEST',
      message: `Có ${found}/${requested} ${unit} theo cấu hình — vẫn dùng được nhưng ngắn hơn dự kiến.`
    });
  }

  const errors = issues.filter(issue => issue.severity === 'error').length;
  const warnings = issues.filter(issue => issue.severity === 'warning').length;
  return {
    gameType: draft.gameType,
    issues,
    errors,
    warnings,
    canPublish: errors === 0,
    counts: { requested, found, unit },
    uncoveredObjectiveIds
  };
}
