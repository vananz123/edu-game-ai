import type { GameQuestion } from '../shared/types';

const TEXT_QUESTION_TYPES = new Set(['fill-in-blank', 'short-answer']);
const KNOWN_QUESTION_TYPES = new Set(['multiple-choice', 'true-false', 'fill-in-blank', 'short-answer', 'scenario', 'matching']);

export interface NormalizeAiGamePayload {
  subject?: string;
  grade?: string;
  template?: string;
  sourceName?: string;
}

export function normalizeAiGame(raw: any, payload: NormalizeAiGamePayload, makeId: (prefix: string) => string): any {
  const rawQuestions = Array.isArray(raw?.questions) ? raw.questions.slice(0, 30) : [];
  const questions: GameQuestion[] = [];
  rawQuestions.forEach((q: any, index: number) => {
    const prompt = String(q?.prompt || `Câu hỏi ${index + 1}`);
    const explanation = String(q?.explanation || 'Hãy đối chiếu với nội dung bài học.');
    const points = Math.max(10, Number(q?.points) || 100);
    const difficulty = ['dễ', 'trung bình', 'khó'].includes(q?.difficulty) ? q.difficulty : undefined;
    const id = String(q?.id || `q${index + 1}`);
    const type = (KNOWN_QUESTION_TYPES.has(String(q?.type || '')) ? String(q.type) : 'multiple-choice') as GameQuestion['type'];
    if (TEXT_QUESTION_TYPES.has(type)) {
      const accepted = [
        ...(q?.correctAnswer != null ? [String(q.correctAnswer)] : []),
        ...(Array.isArray(q?.alternateAnswers) ? q.alternateAnswers.map((value: unknown) => String(value)) : [])
      ].map(value => value.trim()).filter(Boolean);
      if (!accepted.length) {
        // Thiếu đáp án văn bản: chuyển sang trắc nghiệm nếu có đủ phương án, nếu không bỏ câu.
        const fallbackOptions = normalizeOptions(q?.options);
        if (fallbackOptions.length < 2) return;
        const correctOptionId = resolveOptionId(q?.correctOptionId, fallbackOptions);
        questions.push({ id, type: 'multiple-choice', prompt, options: fallbackOptions, correctOptionId, explanation, points, ...(difficulty ? { difficulty } : {}) });
        return;
      }
      questions.push({
        id, type, prompt, options: [], correctOptionId: '', correctAnswer: accepted[0],
        ...(accepted.length > 1 ? { alternateAnswers: accepted.slice(1) } : {}),
        explanation, points, ...(difficulty ? { difficulty } : {})
      });
      return;
    }
    if (type === 'true-false') {
      const answerRaw = String(q?.correctOptionId ?? q?.correctAnswer ?? '').trim().toLowerCase();
      const correctOptionId = /^(b|sai|false|no|0)$/.test(answerRaw) ? 'b' : 'a';
      questions.push({ id, type, prompt, options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }], correctOptionId, explanation, points, ...(difficulty ? { difficulty } : {}) });
      return;
    }
    const options = normalizeOptions(q?.options);
    if (options.length < 2) return;
    questions.push({ id, type: type === 'scenario' || type === 'matching' ? type : 'multiple-choice', prompt, options, correctOptionId: resolveOptionId(q?.correctOptionId, options), explanation, points, ...(difficulty ? { difficulty } : {}) });
  });
  if (!questions.length) throw new Error('AI không tạo được câu hỏi nào.');
  return {
    id: makeId('game'),
    title: String(raw?.title || 'Trò chơi mới'),
    subject: String(raw?.subject || payload.subject || ''),
    grade: String(raw?.grade || payload.grade || ''),
    topic: String(raw?.topic || ''),
    template: ['quiz', 'scenario', 'matching'].includes(raw?.template) ? raw.template : (payload.template || 'scenario'),
    description: String(raw?.description || ''),
    questions,
    sourceName: payload.sourceName || '',
    tags: ['AI tạo'],
    createdAt: new Date().toISOString()
  };
}

function normalizeOptions(rawOptions: unknown): Array<{ id: string; text: string }> {
  if (!Array.isArray(rawOptions)) return [];
  return rawOptions
    .map((option: any, index: number) => typeof option === 'string'
      ? { id: String.fromCharCode(97 + index), text: option }
      : { id: String(option?.id || String.fromCharCode(97 + index)), text: String(option?.text || '') })
    .filter(option => option.text.trim());
}

function resolveOptionId(rawId: unknown, options: Array<{ id: string }>): string {
  const candidate = String(rawId || options[0]?.id || 'a');
  return options.some(option => option.id === candidate) ? candidate : options[0]?.id || 'a';
}
