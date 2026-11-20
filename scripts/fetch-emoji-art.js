#!/usr/bin/env node
/*
 * Regenerates src/shared/emoji-art.generated.ts from Twemoji.
 *
 * MAINTENANCE script: it is the only thing in the project that talks to the
 * network, `npm run build` never runs it, and the app never fetches artwork at
 * runtime (a saved game must play offline).
 *
 * Why Twemoji:
 *   - Licence: the graphics are CC BY 4.0 (code MIT), so the artwork may be
 *     bundled in a commercial offline desktop app with attribution only. There
 *     is no share-alike obligation and no ban on redistribution.
 *   - One studio drew the whole set, so 41 icons are actually the same style.
 *     The previous set (Microsoft Fluent Emoji) was MIT too and looked fine icon
 *     by icon, but it mixes flat and shaded art, so four of them in one scene
 *     read as "four different clip-art pieces" (#280, rejected by the teacher).
 *   - Size: 41 icons are ~55 KiB of SVG, against ~78 KiB for Fluent and megabytes
 *     for any raster set. It is the cheapest colourful option per KiB.
 *   - Coverage: every concept a school subject needs exists as emoji, so the id
 *     table stays one line per id.
 *
 * Rejected, with the reason recorded once so nobody re-litigates it:
 *   - unDraw: licence forbids redistributing the pack and forbids automated
 *     downloads; its art is unusable below ~620px and a scene icon here renders
 *     at 40-120px.
 *   - OpenMoji: CC BY-SA, i.e. share-alike on the artwork we would be modifying
 *     (we rewrite SVG ids, see `namespaceIds`).
 *   - Microsoft Fluent Emoji: MIT but visually inconsistent within its own set.
 *   - Phosphor (MIT, duotone/fill): beautiful, but it is an icon family, not
 *     illustration; at 40px the duotone washes out and the fill reads as a
 *     silhouette.
 *
 * Usage: node scripts/fetch-emoji-art.js
 */
const fs = require('fs');
const path = require('path');

const REPO = 'jdecked/twemoji';
const BASE = `https://raw.githubusercontent.com/${REPO}/main/assets/svg`;

/**
 * Scene icon id -> twemoji codepoint file name. Every id on the left is the id
 * the rest of the app already uses (`SCENE_ICON_IDS`), so no prompt, blueprint
 * or saved game changes when the ART behind an id changes. `emoji-art.test.ts`
 * fails if this table and that list disagree.
 */
const MAP = {
  // the category icons — every category must be representable by default
  'paw-print': '1f43e',
  leaf: '1f343',
  rocket: '1f680',
  'heart-pulse': '1f493',
  car: '1f697',
  'shield-check': '1f6e1',
  recycle: '267b',
  landmark: '1f3db',
  map: '1f5fa',
  briefcase: '1f4bc',
  trophy: '1f3c6',
  'file-music': '1f3b6',
  palette: '1f3a8',
  calculator: '1f9ee',
  languages: '1f310',
  'flask-conical': '1f9ea',
  cpu: '1f5a5',
  stethoscope: '1fa7a',
  users: '1f465',
  house: '1f3e0',
  'cloud-sun': '26c5',
  apple: '1f34e',
  box: '1f4e6',
  'waves-horizontal': '1f30a',
  // concrete subjects that are not any category's default
  'book-open': '1f4da',
  lightbulb: '1f4a1',
  star: '2b50',
  clock: '23f0',
  target: '1f3af',
  brain: '1f9e0',
  zap: '26a1',
  sparkles: '2728',
  gift: '1f381',
  pencil: '270f',
  mountain: '26f0',
  fish: '1f41f',
  bird: '1f426',
  bug: '1f41b',
  // #266 people: a scene about "who" needs a who
  user: '1f464',
  'graduation-cap': '1f393',
  'hard-hat': '1f477',
};

const OUT = path.join(__dirname, '..', 'src', 'shared', 'emoji-art.generated.ts');

/**
 * SVG ids are document-global. The editor preview and the play stage can show
 * the same icon at the same time, so a duplicated id would make the second copy
 * borrow the first one's gradient or clip path.
 */
function namespaceIds(body, iconId) {
  return body
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="e-${iconId}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#e-${iconId}-${id})`)
    .replace(/xlink:href="#([^"]+)"/g, (_, id) => `xlink:href="#e-${iconId}-${id}"`);
}

/** Strips everything that must not reach a saved game: XML prolog, comments,
 *  remote references and executable markup. Throws rather than sanitising
 *  silently — a set that suddenly needs a fetch is a set we cannot ship. */
function cleanSvg(svg, iconId) {
  const body = svg
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '')
    .trim();
  for (const bad of ['http://', 'https://', '<script', '<image', '<foreignObject', 'javascript:']) {
    if (body.includes(bad)) throw new Error(`${iconId}: art contains ${bad}`);
  }
  return namespaceIds(body, iconId);
}

function viewBoxOf(svg) {
  const m = svg.match(/viewBox="([^"]+)"/);
  if (!m) throw new Error('art has no viewBox');
  return m[1];
}

async function fetchArt(iconId, codepoint) {
  const url = `${BASE}/${codepoint}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${iconId}: HTTP ${res.status} from ${url}`);
  const svg = await res.text();
  return { viewBox: viewBoxOf(svg), body: cleanSvg(svg, iconId) };
}

(async () => {
  const art = {};
  const ids = Object.keys(MAP);
  for (const id of ids) {
    art[id] = await fetchArt(id, MAP[id]);
    process.stderr.write('.');
  }
  const bytes = Object.values(art).reduce((sum, a) => sum + a.body.length, 0);
  const lines = [
    '// GENERATED FILE — do not edit by hand.',
    '//',
    '// Regenerate with: node scripts/fetch-emoji-art.js',
    '//',
    '// Twemoji graphics: Copyright 2020 Twitter, Inc and other contributors,',
    '// licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).',
    '// The SVG bodies are embedded unmodified except that internal ids are',
    '// prefixed per icon so the same art can appear twice on one page.',
    '// See docs/THIRD_PARTY_NOTICES.md. Nothing here is fetched at runtime.',
    '',
    "export const EMOJI_ART_SOURCE = 'twemoji';",
    '',
    'export interface EmojiArt {',
    '  viewBox: string;',
    '  body: string;',
    '}',
    '',
    // Deliberately NOT Object.freeze(): the Rust-embedded bundle (#152) does not
    // render icons, and a frozen object defeats esbuild's tree-shaking, putting
    // 57 KiB of art into five slots (+287 KiB in the binary, measured).
    'export const EMOJI_ART: Readonly<Record<string, EmojiArt>> = {',
  ];
  for (const id of ids) {
    lines.push(`  ${JSON.stringify(id)}: { viewBox: ${JSON.stringify(art[id].viewBox)}, body: ${JSON.stringify(art[id].body)} },`);
  }
  lines.push('};', '');
  fs.writeFileSync(OUT, lines.join('\n'));
  console.log(`\nemoji-art: ${ids.length} icons, ${bytes} bytes (${(bytes / 1024).toFixed(1)} KiB) -> ${path.relative(process.cwd(), OUT)}`);
})().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
