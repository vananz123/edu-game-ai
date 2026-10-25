/* Content categories for game items (docs/DECISIONS.md #60).
 *
 * A "content category" says what a question/pair is ABOUT (Động vật, Không gian,
 * Bảo vệ môi trường...). It is deliberately NOT the same thing as:
 *   - the wizard's "category step", which recommends a game TYPE by age/subject;
 *   - `PresentationCategoryGroup`, the `categorize` matching-mode groups;
 *   - `GameType` / `GameTemplate`.
 * Hence the field is `contentCategory`, never `category`.
 *
 * The field is optional everywhere. A missing or unknown value normalises to
 * `general`, which is a normal value and never a validation error: saved games
 * written before this field existed must keep loading and playing unchanged.
 *
 * The list is topic-shaped rather than subject-shaped because the icons and
 * illustrations it drives are topical: a cat illustrates "Động vật", not
 * "Tiếng Việt".
 */

export const CONTENT_CATEGORY_IDS = [
  'general',
  'animals',
  'plants',
  'space',
  'human-body',
  'transport',
  'safety',
  'environment',
  'history',
  'geography',
  'jobs',
  'sports',
  'music',
  'art',
  'math',
  'language',
  'science',
  'technology',
  'health',
  'family',
  'community',
  'weather',
  'food',
  'objects',
  'water-world',
] as const;

export type ContentCategory = (typeof CONTENT_CATEGORY_IDS)[number];

/** The fallback used for anything missing or unrecognised. Never an error. */
export const DEFAULT_CONTENT_CATEGORY: ContentCategory = 'general';

export interface ContentCategoryDefinition {
  id: ContentCategory;
  /** Vietnamese label shown to teachers. */
  label: string;
  /** Default icon id from `icon-registry.ts`. `general` has no icon on purpose. */
  icon: string | null;
  /** Lower-cased Vietnamese/English words used to infer a category from text. */
  keywords: readonly string[];
}

/**
 * Single source of truth for categories. `keywords` drive
 * `inferContentCategory()`, the cheap app-side fallback so an AI that omits the
 * field still gets a sensible icon instead of a blank one.
 */
export const CONTENT_CATEGORIES: Readonly<Record<ContentCategory, ContentCategoryDefinition>> = Object.freeze({
  general: { id: 'general', label: 'Tổng quát', icon: null, keywords: [] },
  animals: {
    id: 'animals',
    label: 'Động vật',
    icon: 'paw-print',
    keywords: ['động vật', 'con vật', 'con mèo', 'con chó', 'chim', 'cá', 'vật nuôi', 'animal'],
  },
  plants: {
    id: 'plants',
    label: 'Thực vật',
    icon: 'leaf',
    keywords: ['thực vật', 'cây', 'hoa', 'lá', 'rễ', 'hạt', 'plant'],
  },
  space: {
    id: 'space',
    label: 'Vũ trụ',
    icon: 'rocket',
    keywords: ['vũ trụ', 'không gian', 'mặt trời', 'mặt trăng', 'hành tinh', 'ngôi sao', 'space'],
  },
  'human-body': {
    id: 'human-body',
    label: 'Cơ thể người',
    icon: 'heart-pulse',
    keywords: ['cơ thể', 'bộ phận cơ thể', 'trái tim', 'phổi', 'xương', 'giác quan', 'body'],
  },
  transport: {
    id: 'transport',
    label: 'Giao thông',
    icon: 'car',
    keywords: ['giao thông', 'xe', 'tàu', 'thuyền', 'máy bay', 'đường bộ', 'transport'],
  },
  safety: {
    id: 'safety',
    label: 'An toàn',
    icon: 'shield-check',
    keywords: ['an toàn', 'phòng tránh', 'nguy hiểm', 'tai nạn', 'safety'],
  },
  environment: {
    id: 'environment',
    label: 'Môi trường',
    icon: 'recycle',
    keywords: ['môi trường', 'rác', 'tái chế', 'ô nhiễm', 'environment'],
  },
  history: {
    id: 'history',
    label: 'Lịch sử',
    icon: 'landmark',
    keywords: ['lịch sử', 'chiến thắng', 'triều đại', 'anh hùng', 'cổ đại', 'history'],
  },
  geography: {
    id: 'geography',
    label: 'Địa lí',
    icon: 'map',
    keywords: ['địa lí', 'bản đồ', 'châu lục', 'biển đảo', 'ngọn núi', 'geography'],
  },
  jobs: {
    id: 'jobs',
    label: 'Nghề nghiệp',
    icon: 'briefcase',
    keywords: ['nghề nghiệp', 'công việc', 'bác sĩ', 'giáo viên', 'nông dân', 'job'],
  },
  sports: {
    id: 'sports',
    label: 'Thể thao',
    icon: 'trophy',
    keywords: ['thể thao', 'bóng đá', 'chạy', 'bơi lội', 'thi đấu', 'sport'],
  },
  music: {
    id: 'music',
    label: 'Âm nhạc',
    icon: 'file-music',
    keywords: ['âm nhạc', 'bài hát', 'nhạc cụ', 'giai điệu', 'music'],
  },
  art: {
    id: 'art',
    label: 'Mỹ thuật',
    icon: 'palette',
    keywords: ['mỹ thuật', 'vẽ tranh', 'màu sắc', 'bức tranh', 'thủ công', 'art'],
  },
  math: {
    id: 'math',
    label: 'Toán',
    icon: 'calculator',
    keywords: ['toán', 'phép tính', 'hình học', 'đo lường', 'math'],
  },
  language: {
    id: 'language',
    label: 'Tiếng Việt',
    icon: 'languages',
    keywords: ['tiếng việt', 'từ ngữ', 'đọc hiểu', 'ngữ pháp', 'chính tả', 'language'],
  },
  science: {
    id: 'science',
    label: 'Khoa học',
    icon: 'flask-conical',
    keywords: ['khoa học', 'thí nghiệm', 'vật lí', 'hoá học', 'năng lượng', 'science'],
  },
  technology: {
    id: 'technology',
    label: 'Công nghệ',
    icon: 'cpu',
    keywords: ['công nghệ', 'máy tính', 'internet', 'rô bốt', 'lập trình', 'technology'],
  },
  health: {
    id: 'health',
    label: 'Sức khỏe',
    icon: 'stethoscope',
    keywords: ['sức khỏe', 'dinh dưỡng', 'bệnh tật', 'vệ sinh', 'health'],
  },
  family: {
    id: 'family',
    label: 'Gia đình',
    icon: 'users',
    keywords: ['gia đình', 'bố mẹ', 'ông bà', 'anh chị em', 'family'],
  },
  community: {
    id: 'community',
    label: 'Cộng đồng',
    icon: 'house',
    keywords: ['cộng đồng', 'làng xóm', 'hàng xóm', 'trường học', 'community'],
  },
  weather: {
    id: 'weather',
    label: 'Thời tiết',
    icon: 'cloud-sun',
    keywords: ['thời tiết', 'trời mưa', 'trời nắng', 'cơn bão', 'mùa', 'weather'],
  },
  food: {
    id: 'food',
    label: 'Thực phẩm',
    icon: 'apple',
    keywords: ['thực phẩm', 'thức ăn', 'rau củ', 'trái cây', 'món ăn', 'food'],
  },
  objects: {
    id: 'objects',
    label: 'Đồ vật',
    icon: 'box',
    keywords: ['đồ vật', 'đồ dùng', 'dụng cụ', 'vật dụng', 'object'],
  },
  'water-world': {
    id: 'water-world',
    label: 'Thế giới nước',
    icon: 'waves-horizontal',
    keywords: ['nước', 'dòng sông', 'biển', 'ao hồ', 'đại dương', 'water'],
  },
});

/** Teacher-facing ordering: alphabetical by label, with `general` last. */
export const CONTENT_CATEGORY_OPTIONS: readonly ContentCategoryDefinition[] = Object.freeze(
  CONTENT_CATEGORY_IDS.filter((id) => id !== DEFAULT_CONTENT_CATEGORY)
    .map((id) => CONTENT_CATEGORIES[id])
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'))
    .concat([CONTENT_CATEGORIES[DEFAULT_CONTENT_CATEGORY]])
);

const ID_SET: ReadonlySet<string> = new Set<string>(CONTENT_CATEGORY_IDS);

/** True only for an exact, known category id. */
export function isContentCategory(value: unknown): value is ContentCategory {
  return typeof value === 'string' && ID_SET.has(value);
}

/**
 * Normalises anything into a valid category. Total function: never throws and
 * never returns `undefined`. Missing, empty, wrong-typed and unknown values all
 * become `general`, which callers must treat as a normal value, not an error.
 */
export function normalizeContentCategory(value: unknown): ContentCategory {
  return isContentCategory(value) ? value : DEFAULT_CONTENT_CATEGORY;
}

/** Default icon for a category, or null when the category has none. Never throws. */
export function getCategoryIcon(category: unknown): string | null {
  return CONTENT_CATEGORIES[normalizeContentCategory(category)].icon;
}

/** Vietnamese label for a category; falls back to the `general` label. */
export function getCategoryLabel(category: unknown): string {
  return CONTENT_CATEGORIES[normalizeContentCategory(category)].label;
}

/**
 * Cheap app-side category guess from free text (question prompt + answer text).
 * Used only when the AI omitted `contentCategory`, so the item still gets a
 * sensible icon. Returns `general` when nothing matches — never throws.
 *
 * Matching is on WORD BOUNDARIES, not raw substrings. Vietnamese has short
 * keywords that are substrings of unrelated words (`câu` is inside `câu hỏi`
 * but also inside many ordinary words), so plain `includes()` mis-tags neutral
 * text. Unicode-aware boundaries (`\b` is ASCII-only in JS) are built with
 * `u` mode so Vietnamese diacritics still match.
 *
 * Scoring: longest matching keyword wins, ties broken by declaration order, so
 * the result is deterministic for a given input.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const KEYWORD_PATTERNS: ReadonlyArray<readonly [ContentCategory, ReadonlyArray<readonly [string, RegExp]>]> = (() => {
  const entries: Array<readonly [ContentCategory, ReadonlyArray<readonly [string, RegExp]>]> = [];
  for (const id of CONTENT_CATEGORY_IDS) {
    const pairs = CONTENT_CATEGORIES[id].keywords
      .filter((k) => k.length > 1)
      .map(
        (k) =>
          [
            k,
            new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(k)}(?![\\p{L}\\p{N}])`, 'iu')
          ] as const
      );
    if (pairs.length) entries.push([id, pairs] as const);
  }
  return entries;
})();

export function inferContentCategory(...texts: Array<string | null | undefined>): ContentCategory {
  const haystack = texts
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .join(' ')
    .toLowerCase();
  if (!haystack) return DEFAULT_CONTENT_CATEGORY;

  let best: ContentCategory = DEFAULT_CONTENT_CATEGORY;
  let bestScore = 0;
  for (const [id, pairs] of KEYWORD_PATTERNS) {
    let score = 0;
    for (const [keyword, pattern] of pairs) {
      if (pattern.test(haystack)) score += keyword.length;
    }
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

