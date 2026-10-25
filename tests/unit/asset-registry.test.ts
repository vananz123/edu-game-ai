import assert from 'node:assert/strict';
import {
  CONTENT_CATEGORIES,
  CONTENT_CATEGORY_IDS,
  CONTENT_CATEGORY_OPTIONS,
  DEFAULT_CONTENT_CATEGORY,
  getCategoryIcon,
  getCategoryLabel,
  inferContentCategory,
  isContentCategory,
  normalizeContentCategory
} from '../../src/shared/content-categories';
import {
  ICON_NAMES,
  getIconNode,
  isIconName,
  renderIconSvg
} from '../../src/shared/icon-registry';
import {
  ILLUSTRATION_MODES,
  getItemIconNode,
  normalizeIconName,
  normalizeIllustrationAssetId,
  normalizeIllustrationMode,
  normalizeItemAssets,
  renderItemIcon
} from '../../src/shared/asset-validation';

// --- taxonomy shape -------------------------------------------------------

const TOPIC_COUNT = 24;

assert.equal(CONTENT_CATEGORY_IDS.length, TOPIC_COUNT + 1, '24 topics plus `general`');
assert.equal(new Set(CONTENT_CATEGORY_IDS).size, CONTENT_CATEGORY_IDS.length, 'no duplicate ids');
assert.equal(CONTENT_CATEGORY_IDS[0], DEFAULT_CONTENT_CATEGORY, 'general is first');
assert.equal(Object.keys(CONTENT_CATEGORIES).length, CONTENT_CATEGORY_IDS.length);

// Every id is its own key and has a real Vietnamese label.
for (const id of CONTENT_CATEGORY_IDS) {
  const def = CONTENT_CATEGORIES[id];
  assert.ok(def, `missing definition for ${id}`);
  assert.equal(def.id, id, `definition id mismatch for ${id}`);
  assert.ok(def.label.length > 0, `missing label for ${id}`);
  assert.notEqual(def.label, id, `${id} needs a human label, not the raw id`);
}
assert.deepEqual(
  CONTENT_CATEGORY_IDS.filter((id) => id !== 'general'),
  [
    'animals', 'plants', 'space', 'human-body', 'transport', 'safety',
    'environment', 'history', 'geography', 'jobs', 'sports', 'music',
    'art', 'math', 'language', 'science', 'technology', 'health',
    'family', 'community', 'weather', 'food', 'objects', 'water-world'
  ],
  'the locked 24-topic list must not drift'
);

// `general` deliberately has no icon: an unknown item should show nothing
// rather than a meaningless placeholder symbol.
assert.equal(CONTENT_CATEGORIES.general.icon, null);

// --- options list ---------------------------------------------------------

assert.equal(CONTENT_CATEGORY_OPTIONS.length, CONTENT_CATEGORY_IDS.length);
assert.equal(
  CONTENT_CATEGORY_OPTIONS[CONTENT_CATEGORY_OPTIONS.length - 1].id,
  'general',
  'general goes last in the picker'
);
const optionLabels = CONTENT_CATEGORY_OPTIONS.slice(0, -1).map((o) => o.label);
const sortedLabels = [...optionLabels].sort((a, b) => a.localeCompare(b, 'vi'));
assert.deepEqual(optionLabels, sortedLabels, 'topics sorted by Vietnamese label');

// --- normalisation (must never throw, must never return undefined) --------

for (const id of CONTENT_CATEGORY_IDS) {
  assert.equal(normalizeContentCategory(id), id);
  assert.equal(isContentCategory(id), true);
}
const junk: unknown[] = [
  undefined, null, '', '  ', 'Animal', 'ANIMALS', 'animals ', 'dinosaurs',
  0, 1, NaN, true, false, [], {}, ['animals'], { id: 'animals' }, () => 'animals'
];
for (const value of junk) {
  assert.equal(normalizeContentCategory(value), 'general', `normalise(${String(value)}) -> general`);
  assert.equal(isContentCategory(value), false, `isContentCategory(${String(value)}) is false`);
}

// --- labels + icons -------------------------------------------------------

assert.equal(getCategoryLabel('animals'), 'Động vật');
assert.equal(getCategoryLabel('nope'), 'Tổng quát');
assert.equal(getCategoryIcon('animals'), 'paw-print');
assert.equal(getCategoryIcon('nope'), null, 'general has no icon');
assert.equal(getCategoryIcon(undefined), null);

// Every category icon must exist in the icon registry, else the picker would
// render blank tiles.
for (const id of CONTENT_CATEGORY_IDS) {
  const icon = CONTENT_CATEGORIES[id].icon;
  if (icon) assert.ok(isIconName(icon), `category ${id} uses unknown icon ${icon}`);

// --- icon registry --------------------------------------------------------

const ICON_COUNT = 60;
assert.equal(ICON_NAMES.length, ICON_COUNT, `expected exactly ${ICON_COUNT} icons, got ${ICON_NAMES.length}`);
assert.equal(new Set(ICON_NAMES).size, ICON_COUNT, 'no duplicate icon ids');
assert.equal(ICON_NAMES.includes('paw-print'), true);
assert.equal(ICON_NAMES.includes('Music'), false, 'names are kebab-case ids');

// Every node array is well formed: [tag, attrs] pairs with a string tag.
for (const name of ICON_NAMES) {
  const node = getIconNode(name);
  assert.ok(Array.isArray(node) && node.length > 0, `${name} has no nodes`);
  for (const entry of node as NonNullable<typeof node>) {
    assert.equal(Array.isArray(entry), true, `${name} node is not a tuple`);
    assert.equal(typeof entry[0], 'string', `${name} node tag is not a string`);
    assert.equal(typeof entry[1], 'object', `${name} node attrs are not an object`);
  }
}

// Total lookups: unknown input returns null, never throws.
for (const value of [undefined, null, '', 'nope', 'constructor', '__proto__', 'toString', 42, {}, []]) {
  assert.equal(getIconNode(value as unknown), null, `getIconNode(${String(value)}) -> null`);
  assert.equal(isIconName(value as unknown), false);
}
assert.equal(getIconNode('toString'), null, 'prototype keys must not leak through the registry');
assert.equal(getIconNode('__proto__'), null);

// --- rendering ------------------------------------------------------------

const svg = renderIconSvg('paw-print');
assert.ok(svg.startsWith('<svg '), 'renders an <svg>');
assert.ok(svg.endsWith('</svg>'));
assert.ok(svg.includes('viewBox="0 0 24 24"'), 'Lucide viewBox');
assert.ok(svg.includes('stroke="currentColor"'), 'inherits text colour');
assert.ok(svg.includes('class="lucide lucide-paw-print"'));
assert.ok(svg.includes('aria-hidden="true"'), 'decorative by default');
assert.equal((svg.match(/<svg/g) || []).length, 1);

const sized = renderIconSvg('leaf', { size: 32, className: 'cat-icon', label: 'Thực vật' });
assert.ok(sized.includes('width="32"') && sized.includes('height="32"'));
assert.ok(sized.includes('cat-icon'));
assert.ok(sized.includes('role="img"') && sized.includes('aria-label="Thực vật"'));
assert.equal(sized.includes('aria-hidden="true"'), false, 'labelled icons are not hidden');

// A label containing quotes must be escaped, never break the markup.
const tricky = renderIconSvg('leaf', { label: 'a "quoted" & <tag>' });
assert.ok(tricky.includes('&quot;') && tricky.includes('&amp;') && tricky.includes('&lt;'));
assert.equal(tricky.split('<svg').length, 2, 'exactly one svg element');

// Bad options and unknown names degrade to something safe.
assert.equal(renderIconSvg('nope'), '');
assert.equal(renderIconSvg(undefined), '');
assert.equal(renderIconSvg(null), '');
assert.equal(renderIconSvg(42 as unknown), '');
assert.ok(renderIconSvg('leaf', { size: 0 }).includes('width="24"'), 'size 0 falls back to 24');
assert.ok(renderIconSvg('leaf', { size: -5 }).includes('width="24"'), 'negative size falls back to 24');
assert.ok(renderIconSvg('leaf', { size: 12.6 }).includes('width="13"'), 'size is rounded');

// No icon may smuggle a script or an event handler into the markup.
for (const name of ICON_NAMES) {
  const html = renderIconSvg(name);
  assert.equal(/<script|on[a-z]+=/i.test(html), false, `${name} contains executable markup`);
}


// --- item asset normalisation --------------------------------------------

const bare = normalizeItemAssets(undefined);
assert.deepEqual(bare, {
  contentCategory: 'general',
  iconName: '',
  illustrationAssetId: null,
  iconFromCategory: false
});
assert.equal(normalizeItemAssets(null).contentCategory, 'general');

// An explicit icon wins; the category icon is the fallback.
const explicit = normalizeItemAssets({ contentCategory: 'animals', iconName: 'fish' });
assert.equal(explicit.iconName, 'fish');
assert.equal(explicit.iconFromCategory, false);

const fromCategory = normalizeItemAssets({ contentCategory: 'animals' });
assert.equal(fromCategory.iconName, 'paw-print');
assert.equal(fromCategory.iconFromCategory, true);

// A bogus explicit icon must NOT suppress the category icon.
const badIcon = normalizeItemAssets({ contentCategory: 'animals', iconName: 'definitely-not-an-icon' });
assert.equal(badIcon.iconName, 'paw-print', 'unknown icon falls back to the category icon');
assert.equal(badIcon.iconFromCategory, true);

// Unknown category with a good icon still shows the icon.
const unknownCat = normalizeItemAssets({ contentCategory: 'dinosaurs', iconName: 'bug' });
assert.equal(unknownCat.contentCategory, 'general');
assert.equal(unknownCat.iconName, 'bug');

// Whitespace and wrong types are handled, never thrown on.
assert.equal(normalizeIconName('  leaf  '), 'leaf');
assert.equal(normalizeIconName(''), '');
assert.equal(normalizeIconName(null), '');
assert.equal(normalizeIconName(12 as unknown), '');
assert.equal(normalizeIllustrationAssetId('  water-drop  '), 'water-drop');
assert.equal(normalizeIllustrationAssetId('   '), null);
assert.equal(normalizeIllustrationAssetId(7 as unknown), null);
assert.equal(normalizeIllustrationAssetId({} as unknown), null);

// renderItemIcon / getItemIconNode are total.
assert.ok(renderItemIcon({ contentCategory: 'space' }).includes('lucide-rocket'));
assert.equal(renderItemIcon({}), '');
assert.equal(renderItemIcon(null), '');
assert.ok(getItemIconNode({ contentCategory: 'space' })!.length > 0);
assert.equal(getItemIconNode({}), null);

// Illustration mode switch keeps a sane default and rejects junk.
assert.equal(normalizeIllustrationMode('manual'), 'manual');
assert.equal(normalizeIllustrationMode('off'), 'off');
assert.equal(normalizeIllustrationMode('auto'), 'auto');
assert.equal(normalizeIllustrationMode('OFF'), 'auto', 'case-sensitive, falls back to auto');
assert.equal(normalizeIllustrationMode(undefined), 'auto');
assert.equal(normalizeIllustrationMode({} as unknown), 'auto');
assert.deepEqual([...ILLUSTRATION_MODES], ['auto', 'manual', 'off']);

// --- category inference ---------------------------------------------------

assert.equal(inferContentCategory('Con mèo có mấy chân?'), 'animals');
assert.equal(inferContentCategory('Cây xanh quang hợp nhờ chất gì?'), 'plants');
assert.equal(inferContentCategory('Hành tinh nào gần Mặt Trời nhất?'), 'space');
assert.equal(inferContentCategory('Chúng ta nên tái chế rác thế nào?'), 'environment');
assert.equal(inferContentCategory('Phép tính 7 + 5 bằng bao nhiêu?'), 'math');
assert.equal(inferContentCategory(''), 'general');
assert.equal(inferContentCategory(undefined, null, ''), 'general');
// A sentence with no topic keyword at all must stay `general`. Note this must
// not contain any keyword as a WORD either: "một câu hoàn toàn trung tính" is
// NOT neutral because `câu` is a real word there, so the text below is chosen
// to be genuinely empty of keywords.
assert.equal(inferContentCategory('Hãy chọn một đáp án đúng dưới đây'), 'general');
assert.equal(inferContentCategory('Lựa chọn nào sau đây là hợp lí nhất'), 'general');

// Case-insensitive, and works across several texts (prompt + answers).
assert.equal(inferContentCategory('CON MÈO', 'Mèo kêu meo meo'), 'animals');
assert.equal(inferContentCategory('Chủ đề bài học', 'Các loài chim di cư'), 'animals');

// Deterministic: same input, same output, every time.
const once = inferContentCategory('Con mèo và con chó');
for (let i = 0; i < 20; i++) {
  assert.equal(inferContentCategory('Con mèo và con chó'), once);
}

console.log('asset-registry: ok');

}
