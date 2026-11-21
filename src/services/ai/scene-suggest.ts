// scene-suggest.ts — the "✨ Gợi ý cảnh từ nội dung" pipeline, model-agnostic.
//
// The prompt a model sees is BUILT from `scene-asset-catalog.ts` instead of being
// copied into a second string, so an asset added to the catalogue appears in the
// prompt with no second edit. `tests/unit/scene-prompt-doc.test.ts` still pins the
// prose of `docs/AI_SCENE_DIRECTOR_DESIGN.md` §5 to the same catalogue, so the doc
// and this builder cannot disagree silently.
//
// The model is injected (`callModel`), never imported: the real channel lives in
// Rust (`scene:suggest`) and a unit test can drive this module with a fake. What
// the model returns is DATA — it goes through `normalizeSceneBlueprint`, exactly
// like a blueprint read from SQLite. Nothing here can render markup, and a reply
// that fails the gate falls back to the deterministic category scene rather than
// leaving the question with an empty frame.
import {
  SCENE_BACKDROP_IDS,
  SCENE_BLUEPRINT_MAX_BYTES,
  SCENE_COMPARE_SIGNS,
  SCENE_COMPARE_SUB_ICON_POSITIONS,
  SCENE_ICON_IDS,
  SCENE_LAYOUT_IDS,
  SCENE_MAX_PROPS,
  SCENE_MAX_SUB_ICONS,
  SCENE_PALETTE_KEYS,
  SCENE_SUB_ICON_POSITIONS,
} from '../../shared/scene-asset-catalog';
import {
  DEFAULT_SCENE_ICON,
  normalizeSceneBlueprint,
  sceneBlueprintFromCategory,
  type SceneBlueprint,
} from '../../shared/scene-blueprint';

/** Input a teacher's question gives the model. Text is capped because a local
 *  runtime is given a small context window and a whole lesson would crowd out
 *  the answer format. */
export interface SceneSuggestQuestion {
  /** Question text, as the teacher wrote it. */
  prompt: string;
  /** Answer texts, in the order shown on screen. */
  answers?: readonly string[];
  /** `contentCategory` of the question (`math`, `animals`, …), when chosen. */
  category?: string;
  /** Icon already chosen for the question, when chosen. */
  iconName?: string;
  subject?: string;
  grade?: string;
}

/** Hard cap on the reply we are willing to parse. A model that rambles for
 *  100 KB is rejected before any regex runs over it. */
export const SCENE_SUGGEST_MAX_REPLY_CHARS = 8000;

/** Per-field cap on question text sent to the model. */
export const SCENE_SUGGEST_MAX_INPUT_CHARS = 1200;

export interface SceneSuggestResult {
  /** Always drawable: either the model's blueprint or the category fallback. */
  blueprint: SceneBlueprint;
  /** `model` when the reply passed the gate, `fallback` when it did not. */
  source: 'model' | 'fallback';
  /** Why the reply was rejected or trimmed. Empty on a clean model reply. */
  issues: string[];
  /** The JSON text the gate accepted, for logging/debugging. */
  acceptedJson: string;
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean;
}

/**
 * The prompt for one question. Stable for the same input (a test asserts it), so
 * an `ai_tasks` row can be compared with the prompt that produced it.
 */
export function buildSceneSuggestPrompt(question: SceneSuggestQuestion): string {
  const answers = (question.answers ?? [])
    .map((answer) => clip(answer, 120))
    .filter((answer) => answer.length > 0)
    .map((answer, index) => `${index + 1}. ${answer}`)
    .join('\n');

  const lines = [
    'Bạn là AI Scene Director của EduGame Studio. Đọc câu hỏi (và đáp án nếu có), rồi',
    'chọn thành phần từ KHO ASSET dưới đây thành MỘT cảnh minh hoạ cho câu hỏi đó.',
    '',
    'QUY TẮC BẮT BUỘC',
    '1. CHỈ dùng đúng tên asset trong danh sách. Không bịa tên mới.',
    '2. KHÔNG viết mã SVG, HTML hay markup. Chỉ trả JSON dữ liệu.',
    '3. Trả về DUY NHẤT một khối JSON, không lời chào, không giải thích, không markdown.',
    `4. Bắt buộc có "v": 1 và "layout" là một trong: ${SCENE_LAYOUT_IDS.join(', ')}.`,
    '5. Không tham chiếu tài nguyên ngoài: không URL, không ảnh, không font, không script.',
    `6. Tối đa ${SCENE_MAX_SUB_ICONS} subIcons (chỉ ${
      SCENE_COMPARE_SUB_ICON_POSITIONS.length
    } khi layout = compare); chúng phải KHÁC mainIcon và không trùng nhau.`,
    `7. Tối đa ${SCENE_MAX_PROPS} props, KHÁC mainIcon, KHÁC mọi subIcons và KHÁC compareIcon.`,
    `8. Toàn bộ JSON dưới ${SCENE_BLUEPRINT_MAX_BYTES} byte.`,
    '9. Chọn "compare" CHỈ khi câu hỏi thật sự so sánh hai đối tượng ngang hàng.',
    '10. Khi layout = "compare": mainIcon là hình BÊN TRÁI, compareIcon là hình BÊN PHẢI',
    '    (bắt buộc, KHÁC mainIcon), compareSign là dấu ở giữa; chỉ dùng góc',
    `    ${SCENE_COMPARE_SUB_ICON_POSITIONS.join(' và ')} cho subIcons.`,
    // #284: the rules below are the three the model actually broke in the first
    // real run. `process` and `surround` were listed in the vocabulary but never
    // DESCRIBED, so the model dumped everything into subIcons and the normaliser
    // silently flattened the scene to `single`. Naming the shape is what makes a
    // layout choosable; a bare id is not a description.
    '11. Khi layout = "process": mainIcon là BƯỚC 1, "steps" là 1-2 bước TIẾP THEO theo',
    '    ĐÚNG thứ tự (bắt buộc, khác mainIcon và khác nhau). Process KHÔNG có',
    '    compareIcon, KHÔNG có compareSign. Quy trình dài hơn 3 bước thì để "single".',
    '12. Khi layout = "surround": mainIcon là vật Ở GIỮA, "around" là 1-4 thứ vây quanh',
    '    (bắt buộc, khác mainIcon và khác nhau). Surround KHÔNG có subIcons, KHÔNG có',
    '    steps, KHÔNG có dấu.',
    '13. Nếu câu hỏi là một QUY TRÌNH 2-3 bước theo thứ tự (trứng → nòng nọc → ếch,',
    '    gieo hạt → nảy mầm) thì dùng "process", không dùng "single" với subIcons.',
    '14. Nếu câu hỏi hỏi về MỘT vật và những thứ quanh nó (đồ dùng học tập, các bộ',
    '    phận của cây, con gì sống quanh ao) thì dùng "surround", không dùng "single"',
    '    với bốn subIcons.',
    '',
    'KHO ASSET',
    `layout (chọn 1): ${SCENE_LAYOUT_IDS.join(', ')}`,
    `backdrop (chọn 1): ${SCENE_BACKDROP_IDS.join(', ')}`,
    `paletteKey (chọn 1): ${SCENE_PALETTE_KEYS.join(', ')}`,
    `mainIcon (chọn 1): ${SCENE_ICON_IDS.join(', ')}`,
    'compareIcon (chỉ khi layout = compare): cùng danh sách icon trên, khác mainIcon.',
    `compareSign (chỉ khi layout = compare): ${SCENE_COMPARE_SIGNS.join(', ')}`,
    'steps (chỉ khi layout = process): tên icon, 1-2 bước SAU bước đầu, đúng thứ tự thời gian.',
    'around (chỉ khi layout = surround): tên icon, 1-4 thứ vây quanh chủ thể, xếp theo',
    '    chiều kim đồng hồ từ góc trên-trái.',
    'subIcons (tuỳ chọn): {"icon": "<tên icon>", "position": "' +
      SCENE_SUB_ICON_POSITIONS.join('|') +
      '"}',
    'props (tuỳ chọn): tên icon, là vật thể đứng ở mặt đất hai bên.',
    '',
    'CÂU HỎI CẦN MINH HOẠ',
    clip(question.prompt, SCENE_SUGGEST_MAX_INPUT_CHARS),
  ];

  if (answers) lines.push('ĐÁP ÁN', answers);
  if (question.category) lines.push(`CHỦ ĐỀ (contentCategory): ${clip(question.category, 40)}`);
  if (question.iconName) lines.push(`ICON ĐÃ CHỌN: ${clip(question.iconName, 40)}`);
  if (question.subject || question.grade) {
    lines.push(`LỚP / MÔN: ${clip([question.grade, question.subject].filter(Boolean).join(' · '), 80)}`);
  }

  // One worked example PER LAYOUT, written as real JSON a model could copy. The
  // first real run (#284) proved a rule without an example is a rule the model
  // skips: it stayed on the two shapes it had seen.
  lines.push(
    '',
    'ĐỊNH DẠNG ĐẦU RA (bốn ví dụ dưới đây là JSON THẬT, chạy được ngay)',
    'Một hình:',
    '{"v":1,"layout":"single","backdrop":"classroom","paletteKey":"math",',
    ' "mainIcon":"calculator","subIcons":[{"icon":"pencil","position":"left"}],',
    ' "props":["box"]}',
    'So sánh hai hình:',
    '{"v":1,"layout":"compare","backdrop":"forest","paletteKey":"animals",',
    ' "mainIcon":"paw-print","compareIcon":"bird","compareSign":"greater-than"}',
    'Quy trình nhiều bậc:',
    '{"v":1,"layout":"process","backdrop":"lab","paletteKey":"science",',
    ' "mainIcon":"flask-conical","steps":["lightbulb","sparkles"]}',
    'Một vật ở giữa, những thứ khác vây quanh:',
    '{"v":1,"layout":"surround","backdrop":"classroom","paletteKey":"language",',
    ' "mainIcon":"book-open","around":["pencil","calculator","languages","lightbulb"]}'
  );

  return lines.join('\n');
}

/**
 * First balanced `{...}` in a model reply, or null.
 *
 * Models wrap JSON in ```json fences, prepend "Đây là JSON:" and occasionally
 * emit a second object as a comment. Braces inside string literals must not count,
 * or the slice ends in the middle of a value and the blueprint is lost.
 */
export function extractJsonObject(text: string): string | null {
  if (typeof text !== 'string' || text.length === 0) return null;
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth < 0) return null; // stray close brace: not JSON
      if (depth === 0 && start >= 0) return text.slice(start, i + 1);
    }
  }
  return null; // truncated reply
}

/**
 * Ask the model for a scene and return something the stage can always draw.
 *
 * `callModel` is injected so the Rust channel owns credentials and transport
 * while this function owns the contract. Any failure — thrown call, prose
 * instead of JSON, unknown ids, an unusable `compare` — degrades to
 * `sceneBlueprintFromCategory`, which is the P0 behaviour teachers already see.
 */
export async function suggestSceneBlueprint(
  question: SceneSuggestQuestion,
  callModel: (prompt: string) => Promise<string>
): Promise<SceneSuggestResult> {
  const issues: string[] = [];
  const fallback = (): SceneSuggestResult => ({
    blueprint: sceneBlueprintFromCategory(question.category, question.iconName ?? DEFAULT_SCENE_ICON),
    source: 'fallback',
    issues,
    acceptedJson: '',
  });

  let reply = '';
  try {
    reply = await callModel(buildSceneSuggestPrompt(question));
  } catch (error) {
    issues.push('call:' + (error instanceof Error ? error.message : String(error)));
    return fallback();
  }

  if (typeof reply !== 'string' || reply.trim().length === 0) {
    issues.push('empty-reply');
    return fallback();
  }
  if (reply.length > SCENE_SUGGEST_MAX_REPLY_CHARS) {
    issues.push('reply-too-long:' + reply.length);
    return fallback();
  }

  const json = extractJsonObject(reply);
  if (!json) {
    issues.push('no-json');
    return fallback();
  }

  const blueprint = normalizeSceneBlueprint(json, issues);
  if (!blueprint) {
    // `issues` already explains why (version/json/size/…); the fallback is what
    // keeps the question from rendering an empty frame.
    return fallback();
  }

  return { blueprint, source: 'model', issues, acceptedJson: json };
}
