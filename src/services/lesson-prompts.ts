/**
 * Prompt builders for the lesson-to-game workflow.
 *
 * These are pure string builders so they can be unit-tested and reviewed by the
 * teacher-facing team. The model always receives:
 *  - a system prompt that forbids inventing facts and forbids prose/markdown,
 *  - a user prompt that states the exact JSON shape for the current step.
 *
 * Content schemas (no `schemaVersion`) live in `lesson-contracts.ts`; the
 * matching JSON schema is sent as `response_format` for llama.cpp in `main.ts`.
 */
import { getLocalDocumentAnalysisExcerpt } from '../ai-core/document-assist';
import type {
  GameConfig,
  LessonAnalysis,
  WorkflowGameType
} from '../shared/lesson-types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LessonPromptContext {
  subject?: string;
  grade?: string;
  sourceName?: string;
}

export const LESSON_ANALYSIS_SYSTEM_PROMPT =
  'Bạn là trợ lý sư phạm tiếng Việt. Chỉ được dùng thông tin có trong tài liệu được cung cấp; tuyệt đối không bịa số liệu, sự kiện hay khái niệm ngoài tài liệu. Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ, không kèm markdown hay lời giải thích. Nếu tài liệu thiếu căn cứ, hãy ghi rõ trong mục "uncertainties".';

export const LESSON_RECOMMENDATION_SYSTEM_PROMPT =
  'Bạn là chuyên gia thiết kế trò chơi học tập. Chỉ gợi ý trò chơi có thể dựng trực tiếp từ mục tiêu và khái niệm đã phân tích. Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ, không kèm markdown.';

export const LESSON_GENERATION_SYSTEM_PROMPT =
  'Bạn là trợ lý thiết kế trò chơi giáo dục tiếng Việt. Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ, không markdown. Mọi câu hỏi phải có đúng một đáp án, giải thích ngắn, và phải dựa trên nội dung giáo án; không bịa điều luật hay số liệu.';

const MAX_OBJECTIVES = 10;
const MAX_KEY_CONCEPTS = 12;

/** Trims a lesson to the local-AI budget and notes when it was shortened. */
export function prepareLessonExcerpt(text: string): { excerpt: string; truncated: boolean } {
  const source = String(text ?? '');
  const excerpt = getLocalDocumentAnalysisExcerpt(source);
  return { excerpt, truncated: excerpt.length < source.length };
}

export function buildLessonAnalysisPrompt(input: { text: string } & LessonPromptContext): string {
  const { excerpt, truncated } = prepareLessonExcerpt(input.text);
  return `Phân tích giáo án dưới đây để chuẩn bị thiết kế trò chơi.
Trả về JSON đúng cấu trúc:
{"subject":"môn học hoặc null","grade":5,"topic":"chủ đề chính","objectives":[{"description":"mục tiêu học tập","cognitiveLevel":"remember|understand|apply|analyze","sourceExcerpt":"câu trích trong tài liệu"}],"keyConcepts":[{"term":"thuật ngữ","explanation":"giải thích ngắn gọn","sourceExcerpt":"câu trích trong tài liệu"}],"uncertainties":["điểm chưa chắc chắn hoặc thiếu căn cứ"]}
Yêu cầu:
- 1 đến ${MAX_OBJECTIVES} mục tiêu; mỗi mục tiêu là một việc học sinh làm được sau bài học.
- 1 đến ${MAX_KEY_CONCEPTS} khái niệm chính, mỗi khái niệm khác nhau.
- subject: môn học suy ra từ tài liệu, hoặc null nếu không rõ. grade: số lớp 1-12, hoặc null nếu không rõ.
- uncertainties: liệt kê nội dung tài liệu chưa đủ để tạo câu hỏi an toàn (có thể để mảng rỗng).
Môn/Lớp gợi ý của giáo viên: ${input.subject || 'chưa xác định'} / ${input.grade || 'chưa xác định'}. Tên tài liệu: ${input.sourceName || 'không có'}.
${truncated ? 'Lưu ý: tài liệu đã được rút gọn để vừa giới hạn của model.\n' : ''}Tài liệu:
${excerpt}`;
}

export function buildRecommendationPrompt(input: { analysis: LessonAnalysis }): string {
  const { analysis } = input;
  const objectives = analysis.objectives.map(objective => `- ${objective.id}: ${objective.description}`).join('\n');
  const concepts = analysis.keyConcepts.map(concept => `- ${concept.term}: ${concept.explanation}`).join('\n');
  return `Từ kết quả phân tích giáo án, đề xuất 2 đến 3 trò chơi phù hợp nhất.
Trả về JSON đúng cấu trúc:
{"recommendations":[{"gameType":"arena|scenario|matching|treasure|race","title":"tên trò chơi","description":"mô tả ngắn","reason":"lý do phù hợp với mục tiêu","learningObjectiveIds":["o1"],"suggestedDurationMinutes":15,"suggestedQuestionCount":8}]}
Yêu cầu:
- Mỗi thể loại chỉ xuất hiện một lần; chọn thể loại phù hợp nhất với nội dung và mục tiêu.
- learningObjectiveIds chỉ dùng các mã mục tiêu có trong danh sách bên dưới.
- suggestedDurationMinutes trong khoảng 3-60; suggestedQuestionCount 3-30 (có thể bỏ qua).
- reason phải nêu rõ trò chơi giúp đạt mục tiêu nào.
Chủ đề: ${analysis.topic}${analysis.subject ? ` — môn ${analysis.subject}` : ''}${analysis.grade ? ` — lớp ${analysis.grade}` : ''}.
Mục tiêu:
${objectives}
Khái niệm:
${concepts}`;
}

const DRAFT_SHAPES: Record<WorkflowGameType, string> = {
  arena: '{"gameType":"arena","questions":[{"id":"q1","type":"multiple-choice|true-false|fill-in-blank|short-answer","prompt":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."}],"correctOptionId":"a","correctAnswer":"chỉ với fill-in-blank/short-answer","explanation":"...","difficulty":"dễ|trung bình|khó","points":100}]}',
  scenario: '{"gameType":"scenario","situations":[{"id":"s1","context":"bối cảnh","prompt":"tình huống","options":[{"id":"a","text":"hành động","feedback":"...","consequence":"...","score":{"safety":0,"reasoning":0,"harmReduction":0},"nextSituationId":null}],"correctOptionId":"a","discussionPrompt":"..."}]}',
  matching: '{"gameType":"matching","mode":"columns|memory|categorize","pairs":[{"id":"p1","left":"...","right":"..."}],"pointsPerPair":100,"completionBonus":200,"wrongPenalty":0,"timeBonus":50,"bonusUnderSeconds":60,"practiceMode":false}',
  treasure: '{"gameType":"treasure","character":"nhân vật","intro":"lời mở đầu","journeyBonus":300,"hiddenItemBonus":50,"stages":[{"id":"st1","name":"Chặng 1","story":"bối cảnh nối tiếp","taskDescription":"nhiệm vụ","question":{"prompt":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."}],"correctOptionId":"a","explanation":"...","hint":"gợi ý"},"attempts":0,"points":100,"completionBonus":200,"nextStageId":"st2","hasHiddenItem":true}]}',
  race: '{"gameType":"race","trackLength":12,"maxRounds":6,"stepByDifficulty":true,"luckEnabled":true,"teams":[{"id":"t1","name":"Đội 1","icon":"🚀"},{"id":"t2","name":"Đội 2","icon":"🏎️"}],"cells":[{"cell":5,"type":"boost|penalty|lucky|challenge","label":"Tăng tốc"}],"questions":[{"id":"q1","prompt":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."}],"correctOptionId":"a","explanation":"...","difficulty":"dễ|trung bình|khó"}]}'
};

const DRAFT_RULES: Record<WorkflowGameType, string> = {
  arena: 'Tạo câu hỏi trắc nghiệm (3-4 phương án id "a".."d"), đúng/sai, điền từ và trả lời ngắn. Câu điền từ/trả lời ngắn bỏ "options" và điền "correctAnswer". Mọi câu cần "difficulty" và "points".',
  scenario: 'Mỗi tình huống có 2-4 hành động; "correctOptionId" là hành động an toàn/tối ưu nhất; có thể nối tình huống bằng "nextSituationId" (null nếu kết thúc).',
  matching: 'Cột "left" và "right" không được trùng lặp trong mỗi cột; mỗi cặp ghép đúng nghĩa với nhau.',
  treasure: 'Mỗi chặng có một câu trắc nghiệm (3-4 phương án). "nextStageId" nối chặng kế tiếp, chặng cuối để null. Chuỗi chặng không được tạo vòng lặp.',
  race: 'Mọi câu là trắc nghiệm kèm "difficulty". "cells" nằm trong khoảng 2..trackLength và không trùng ô. Cần 2-4 đội.'
};

export function buildDraftPrompt(input: {
  gameType: WorkflowGameType;
  config: GameConfig;
  analysis: LessonAnalysis;
  sourceExcerpt?: string;
}): string {
  const { gameType, config, analysis } = input;
  const objectiveIds = config.focusObjectiveIds.length
    ? config.focusObjectiveIds
    : analysis.objectives.map(objective => objective.id);
  const focusObjectives = analysis.objectives
    .filter(objective => objectiveIds.includes(objective.id))
    .map(objective => `- ${objective.id}: ${objective.description}`)
    .join('\n');
  const concepts = analysis.keyConcepts.map(concept => `- ${concept.term}: ${concept.explanation}`).join('\n');
  const countLine = (() => {
    switch (config.gameType) {
      case 'arena': return `Số câu hỏi: ${config.questionCount}. Chế độ tính điểm: ${config.scoringMode}.`;
      case 'scenario': return `Số tình huống: ${config.situationCount}.`;
      case 'matching': return `Số cặp ghép: ${config.pairCount}. Chế độ: ${config.matchingMode}.`;
      case 'treasure': return `Số chặng: ${config.stageCount}. Số lượt thử mỗi chặng: ${config.attemptsPerStage} (0 = không giới hạn).`;
      case 'race': return `Chiều dài đường đua: ${config.trackLength} ô. Số vòng: ${config.maxRounds}. Số đội: ${config.teamCount}.`;
      default: return '';
    }
  })();
  const source = input.sourceExcerpt
    ? `Trích tài liệu:\n${input.sourceExcerpt}`
    : `Tóm tắt giáo án:\n${analysis.topic}`;
  return `Tạo nội dung trò chơi "${gameType}" bằng tiếng Việt từ giáo án đã phân tích.
Trả về JSON đúng cấu trúc:
${DRAFT_SHAPES[gameType]}
Quy tắc thể loại: ${DRAFT_RULES[gameType]}
Thiết lập của giáo viên:
- Tiêu đề: ${config.title}
- Môn: ${config.subject || analysis.subject || 'chưa xác định'} — Lớp: ${config.grade || (analysis.grade ? `Lớp ${analysis.grade}` : 'chưa xác định')}
- Chủ đề: ${config.topic}
- Độ khó: ${config.difficulty}; đối tượng: ${config.audience}; phong cách: ${config.style}
- ${countLine}
- Ưu tiên các mục tiêu sau:
${focusObjectives || '- (không chỉ định; dùng toàn bộ mục tiêu)'}
Khái niệm cần bám sát:
${concepts}
${source}
Không tạo nội dung ngoài giáo án; nếu thiếu căn cứ cho một đáp án, hãy chọn phương án an toàn nhất và ghi chú trong "explanation".`;
}

export function buildDraftRepairMessages(input: {
  gameType: WorkflowGameType;
  messages: ChatMessage[];
  rawContent: string | null;
  errorMessage: string;
}): ChatMessage[] {
  const repair = `JSON trước đó không hợp lệ hoặc sai cấu trúc cho trò chơi "${input.gameType}".
Lỗi: ${input.errorMessage}
Hãy trả lại DUY NHẤT một đối tượng JSON hợp lệ, đúng cấu trúc đã mô tả, không thêm chữ nào khác.`;
  return [
    ...input.messages,
    ...(input.rawContent ? [{ role: 'assistant' as const, content: input.rawContent }] : []),
    { role: 'user' as const, content: repair }
  ];
}

/** Generic repair messages for analysis/recommendation steps. */
export function buildRepairMessages(input: {
  messages: ChatMessage[];
  rawContent: string | null;
  errorMessage: string;
}): ChatMessage[] {
  const repair = `Phản hồi trước đó không phải JSON hợp lệ hoặc sai cấu trúc.
Lỗi: ${input.errorMessage}
Hãy trả lại DUY NHẤT một đối tượng JSON hợp lệ đúng cấu trúc đã yêu cầu, không thêm chữ nào khác.`;
  return [
    ...input.messages,
    ...(input.rawContent ? [{ role: 'assistant' as const, content: input.rawContent }] : []),
    { role: 'user' as const, content: repair }
  ];
}
