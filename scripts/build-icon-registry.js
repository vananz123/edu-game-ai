// build-icon-registry.js — one-off generator for src/shared/icon-registry.ts
//
// Writes the icon node arrays of the ~60 content icons we use into a committed
// TypeScript file, so the app needs no icon dependency at runtime and no bundler
// in the renderer (see docs/DECISIONS.md #61).
//
// This script is NOT part of `npm run build`. Run it by hand when the icon list
// changes, then commit the generated file:
//
//   node scripts/build-icon-registry.js
//
// Source: lucide@1.61.0 (ISC licence, https://lucide.dev). Only the node arrays
// are copied; no Lucide runtime code is vendored.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LUCIDE_VERSION = '1.61.0';
const SOURCE_URL = `https://unpkg.com/lucide@${LUCIDE_VERSION}/dist/cjs/lucide.js`;
const OUT_FILE = path.join(__dirname, '..', 'src', 'shared', 'icon-registry.ts');

// The content icons we ship, grouped the way the UI uses them.
// Name here is the Lucide kebab-case id; `renderIconSvg` accepts the same id.
const ICON_GROUPS = {
  categories: [
    'paw-print', 'leaf', 'rocket', 'heart-pulse', 'car', 'shield-check',
    'recycle', 'landmark', 'map', 'briefcase', 'trophy', 'file-music',
    'palette', 'calculator', 'languages', 'flask-conical', 'cpu', 'stethoscope',
    'users', 'house', 'cloud-sun', 'apple', 'box', 'waves-horizontal'
  ],
  interface: [
    'layout-grid', 'book-open', 'lightbulb', 'star', 'check', 'x',
    'arrow-right', 'arrow-left', 'play', 'pause', 'rotate-ccw', 'skip-forward',
    'volume-2', 'volume-x', 'maximize', 'minimize', 'search', 'settings',
    'library', 'pencil', 'trash', 'plus', 'download', 'upload',
    'clock', 'target', 'brain', 'zap', 'sparkles', 'gift'
  ],
  extra: [
    'shield-alert', 'mountain', 'fish', 'bird', 'bug', 'utility-pole'
  ]
};

const toPascal = (name) =>
  name.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : '')).join('');

// Splits a `const Name = [ ... ];` block out of the bundle by bracket matching,
// so we never depend on how the path data is formatted.
function extractBlock(source, pascalName) {
  const marker = `const ${pascalName} = [`;
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const open = source.indexOf('[', start + marker.length - 1);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Cannot download Lucide ${LUCIDE_VERSION}: HTTP ${res.status}`);
  const source = await res.text();

  const all = [...ICON_GROUPS.categories, ...ICON_GROUPS.interface, ...ICON_GROUPS.extra];
  const unique = [...new Set(all)];

  const found = [];
  const missing = [];
  for (const name of unique) {
    const block = extractBlock(source, toPascal(name));
    if (!block) missing.push(name);
    else found.push({ name, block });
  }

  if (missing.length) {
    // Fail loudly and name the substitution, instead of silently renaming.
    console.error(`ERROR: ${missing.length} icon(s) not found in lucide@${LUCIDE_VERSION}:`);
    for (const m of missing) console.error(`  - ${m}  (pascal: ${toPascal(m)})`);
    console.error('');
    console.error('Lucide renames icons between versions. Fix the name in ICON_GROUPS');
    console.error('or pick a real replacement; do not invent a name that does not exist.');
    process.exit(1);
  }

  // Each group's last entry already ends with a comma, so sections are joined
  // WITHOUT a separator; adding one here would emit `],,` and break the file.
  const sections = Object.entries(ICON_GROUPS).map(([group, names]) => {
    const lines = names.map((n) => {
      const hit = found.find((f) => f.name === n);
      return `  ${JSON.stringify(n)}: ${hit.block},`;
    });
    return `  // ${group}\n${lines.join('\n')}`;
  });

  const header = buildHeader();
  const body = buildBody(sections);
  fs.writeFileSync(OUT_FILE, header + body, 'utf8');
  console.log(`OK  wrote ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log(`    ${unique.length} icons from lucide@${LUCIDE_VERSION}`);
}

function buildHeader() {
  return `// GENERATED FILE - do not edit by hand.
// Run \`node scripts/build-icon-registry.js\` after changing the icon list.
//
// Icon node data extracted once from lucide@${LUCIDE_VERSION} (ISC licence).
// Copyright (c) Lucide Contributors - https://lucide.dev
// Licensed under the ISC License. Only the SVG node arrays are reproduced here;
// no Lucide runtime code is vendored and lucide is not a project dependency.
//
// Why a generated file instead of the package (docs/DECISIONS.md #61):
//   - the renderer is loaded as plain <script> tags, so it has no module loader;
//   - saved games must play offline, so nothing may be fetched at runtime;
//   - the packaged app carries no icon runtime.
// Unknown names are handled by getIconNode() returning null, never by throwing.

export type IconNode = ReadonlyArray<
  readonly [string, Readonly<Record<string, string | number>>]
>;

export const ICON_SOURCE = 'lucide@${LUCIDE_VERSION}' as const;

export const ICON_NODES: Readonly<Record<string, IconNode>> = {
`;
}

function buildBody(sections) {
  return `${sections.join('')}
};

export const ICON_NAMES: readonly string[] = Object.freeze(Object.keys(ICON_NODES));

export const ICON_GROUPS: Readonly<Record<string, readonly string[]>> = Object.freeze({
${Object.entries(ICON_GROUPS)
  .map(([g, names]) => `  ${g}: Object.freeze(${JSON.stringify(names)}),`)
  .join('\n')}
});

/** Returns the node array for an icon id, or null for anything unknown. Never throws. */
export function getIconNode(name: unknown): IconNode | null {
  if (typeof name !== 'string' || !name) return null;
  return Object.prototype.hasOwnProperty.call(ICON_NODES, name) ? ICON_NODES[name] : null;
}

export function isIconName(name: unknown): name is string {
  return getIconNode(name) !== null;
}

export interface IconSvgOptions {
  /** Pixel size for both width and height. Default 24. */
  size?: number;
  /** Extra class names appended after the mandatory \`lucide\` class. */
  className?: string;
  /** Accessible label. When omitted the icon is decorative and hidden from AT. */
  label?: string;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders an icon as a self-contained <svg> string, or '' when the name is unknown.
 * Attributes match Lucide's defaults so icons look identical to the upstream set.
 */
export function renderIconSvg(name: unknown, options: IconSvgOptions = {}): string {
  const node = getIconNode(name);
  if (!node) return '';
  const size = typeof options.size === 'number' && options.size > 0 ? Math.round(options.size) : 24;
  const classes = ['lucide', \`lucide-\${String(name)}\`];
  if (options.className) classes.push(options.className);
  const a11y = options.label
    ? \`role="img" aria-label="\${escapeAttr(options.label)}"\`
    : 'aria-hidden="true"';
  const children = node
    .map(([tag, attrs]) => {
      const rendered = Object.keys(attrs)
        .map((key) => \`\${key}="\${escapeAttr(String(attrs[key]))}"\`)
        .join(' ');
      return \`<\${tag} \${rendered}/>\`;
    })
    .join('');
  return \`<svg xmlns="http://www.w3.org/2000/svg" width="\${size}" height="\${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="\${escapeAttr(
    classes.join(' ')
  )}" \${a11y} focusable="false">\${children}</svg>\`;
}
`;
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
