#!/usr/bin/env node
/*
 * Regenerates src/shared/emoji-art.generated.ts from Microsoft Fluent Emoji.
 *
 * This is a MAINTENANCE script: it is the only thing in the project that talks
 * to the network, it is never run by `npm run build`, and the app never fetches
 * artwork at runtime (saved games must play offline).
 *
 * Licence (why this set and not another):
 *   Fluent Emoji is MIT. That permits bundling the artwork in a commercial
 *   desktop app, modifying it, and shipping it offline, with attribution only.
 *   unDraw was rejected earlier: its licence forbids redistributing the pack and
 *   forbids automated downloads, and its art is unusable below ~620px, while a
 *   scene icon here renders at 40-120px. OpenMoji is CC BY-SA (share-alike on
 *   the artwork) and Twemoji has no flat-illustration range to cover 24 school
 *   subjects. Only the FLAT style is used: 3D is a PNG and would triple the
 *   installer for no gain at 120px.
 *
 * Usage: node scripts/fetch-emoji-art.js
 */
const fs = require('fs');
const path = require('path');

const REPO = 'microsoft/fluentui-emoji';
const BASE = `https://raw.githubusercontent.com/${REPO}/main/assets`;

/**
 * Scene icon id -> Fluent Emoji entry. Every id is the id the rest of the app
 * already uses (`SCENE_ICON_IDS`), so no prompt, blueprint or saved game changes
 * when the ART behind an id changes. `SCENE_ICON_IDS` has 41 entries; the test
 * `emoji-art.test.ts` fails if this table and that list ever disagree.
 */
const MAP = {
  'paw-print': 'Paw prints',
  leaf: 'Leaf fluttering in wind',
  rocket: 'Rocket',
  'heart-pulse': 'Beating heart',
  car: 'Automobile',
  'shield-check': 'Shield',
  recycle: 'Recycling symbol',
  landmark: 'Classical building',
  map: 'World map',
  briefcase: 'Briefcase',
  trophy: 'Trophy',
  'file-music': 'Musical notes',
  palette: 'Artist palette',
  calculator: 'Abacus',
  languages: 'Globe with meridians',
  'flask-conical': 'Test tube',
  cpu: 'Desktop computer',
  stethoscope: 'Stethoscope',
  users: 'Busts in silhouette',
  house: 'House',
  'cloud-sun': 'Sun behind cloud',
  apple: 'Red apple',
  box: 'Package',
  'waves-horizontal': 'Water wave',
  'book-open': 'Books',
  lightbulb: 'Light bulb',
  star: 'Glowing star',
  clock: 'Alarm clock',
  target: 'Bullseye',
  brain: 'Brain',
  zap: 'High voltage',
  sparkles: 'Sparkles',
  gift: 'Wrapped gift',
  pencil: 'Pencil',
  mountain: 'Snow-capped mountain',
  fish: 'Fish',
  bird: 'Bird',
  bug: 'Bug',
  user: 'Bust in silhouette',
  'graduation-cap': 'Graduation cap',
  'hard-hat': 'Rescue workers helmet',
};

/** `Leaf fluttering in wind` -> `leaf_fluttering_in_wind`; hyphens survive upstream. */
function slug(name) {
  return name
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
}

function assetUrl(name) {
  // encodeURIComponent leaves the apostrophe alone, and raw.githubusercontent
  // answers 404 for it, so it is escaped by hand ("Rescue worker's helmet").
  const dir = encodeURIComponent(name).replace(/'/g, '%27');
  return `${BASE}/${dir}/Flat/${slug(name)}_flat.svg`;
}

/**
 * Namespaces every `id` so two copies of the same art on one page cannot
 * collide (an SVG id is document-global; the editor preview and the play stage
 * can show the same icon at once, and a duplicate id would make the second copy
 * borrow the first one's gradient).
 */
function namespaceIds(body, iconId) {
  const prefix = `e-${iconId}-`;
  const ids = [...body.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  let out = body;
  for (const id of ids) {
    const safe = prefix + id.replace(/[^A-Za-z0-9_-]/g, '-');
    out = out.split(`id="${id}"`).join(`id="${safe}"`);
    out = out.split(`url(#${id})`).join(`url(#${safe})`);
    out = out.split(`href="#${id}"`).join(`href="#${safe}"`);
  }
  return out;
}

function cleanSvg(raw) {
  const viewBox = (raw.match(/viewBox="([^"]+)"/) || [])[1];
  if (!viewBox) throw new Error('asset has no viewBox');
  const body = raw
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '')
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  if (!body) throw new Error('asset has no body');
  // The app must never reach the network at runtime, and must never execute
  // anything a third party shipped inside an SVG.
  for (const forbidden of ['http://', 'https://', '<script', '<image', 'xlink:href', '<foreignObject', 'javascript:']) {
    if (body.includes(forbidden)) throw new Error(`asset body contains ${forbidden}`);
  }
  return { viewBox, body };
}

async function main() {
  const art = {};
  for (const [iconId, name] of Object.entries(MAP)) {
    const res = await fetch(assetUrl(name));
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${name}`);
    const { viewBox, body } = cleanSvg(await res.text());
    art[iconId] = { viewBox, body: namespaceIds(body, iconId) };
    process.stdout.write(`  ${iconId.padEnd(20)} ${name.padEnd(26)} ${String(body.length).padStart(5)} bytes\n`);
  }

  const entries = Object.keys(art)
    .sort()
    .map((id) => `  ${JSON.stringify(id)}: {\n    viewBox: ${JSON.stringify(art[id].viewBox)},\n    body: ${JSON.stringify(art[id].body)},\n  },`)
    .join('\n');
  const total = Object.values(art).reduce((sum, a) => sum + a.body.length, 0);

  const out = `// GENERATED FILE - do not edit by hand.
// Run \`node scripts/fetch-emoji-art.js\` to refresh (maintenance only, needs network).
//
// Art: Microsoft Fluent Emoji, Flat style - https://github.com/${REPO}
// Copyright (c) Microsoft Corporation. MIT License. See docs/THIRD_PARTY_NOTICES.md.
//
// Only the SVG bodies are embedded: no runtime fetch, no PNG/3D variants, no
// emoji font, no network dependency. ${Object.keys(art).length} icons, ${total} bytes of art.
// SVG ids are namespaced per icon (\`e-<icon>-<id>\`) so the same art can appear
// twice on one page without the second copy borrowing the first one's gradient.

export interface EmojiArt {
  readonly viewBox: string;
  readonly body: string;
}

export const EMOJI_ART_SOURCE = '${REPO}@main (Flat)' as const;

export const EMOJI_ART: Readonly<Record<string, EmojiArt>> = {
${entries}
};
`;

  const target = path.join(__dirname, '..', 'src', 'shared', 'emoji-art.generated.ts');
  fs.writeFileSync(target, out, 'utf8');
  console.log(`\nwrote ${path.relative(process.cwd(), target)} (${(out.length / 1024).toFixed(1)} KiB, ${total} bytes of art)`);
}

main().catch((err) => {
  console.error(`fetch-emoji-art: ${err.message}`);
  process.exit(1);
});
