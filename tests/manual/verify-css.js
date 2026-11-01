// verify-css.js — assert the compiled stylesheet kept the recent UI fixes.
// Run after `npm run build`:  node tests/manual/verify-css.js
// Tailwind v4 rewrites/minifies CSS and drops rules it considers unreachable,
// so the source file being correct is not proof the shipped file is.
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'dist', 'src', 'renderer', 'styles', 'app.css'), 'utf8');
// Tailwind v4 minifies: no space after `{`, declarations reordered, quotes
// dropped from attribute values. Match those shapes, not the source formatting.
const expectations = [
  ['app-wide thin scrollbar (7px)', /::-webkit-scrollbar\{width:7px/],
  ['dark-theme scrollbar thumb', /\[data-theme=("?)dark\1\] ::-webkit-scrollbar-thumb/],
  ['player scrollbar thinned to 8px', /\[data-player-theme\] ::-webkit-scrollbar\{width:8px/],
  ['race turn panel is dark', /\.race-turn\{[^}]*background:#1b2140/],
  ['race team row is dark', /\.race-team-row\{[^}]*background:#1b2140/],
  ['race active row is dark', /\.race-team-row\.active\{[^}]*background:#262c50/],
  // Tailwind collapses `overflow-x/y` into `overflow:hidden auto` (x=hidden,
  // y=auto): same behaviour, different text — assert the computed shape.
  ['stage is a scroll container', /\[data-player-theme\] \.game-stage\{[^}]*min-height:0[^}]*(overflow-y:auto|overflow:hidden auto)/],
  ['race track is height-bounded', /\[data-player-theme\] \.race-track\{[^}]*max-height:172px/],
  ['race turn question sized', /\[data-player-theme\] \.race-turn \.stage-question\{/],
  ['fullscreen panel is dark', /html\[data-fullscreen=("?)1\1\] \.modal\{[^}]*background:#0b0e1a/],
  ['fullscreen body clips (no page scroll)', /html\[data-fullscreen=("?)1\1\] body\{overflow:hidden\}/],
  ['treasure map pinned', /\[data-player-theme\] \.treasure-map\{[^}]*position:sticky/],
  // LAN honour roll: without these the podium collapses to three equal cards and the
  // winner's "higher step" (the whole point) is invisible (DECISIONS #107).
  ['LAN podium is a 3-column grid', /\.lan-podium\{[^}]*grid-template-columns:repeat\(3/],
  ['LAN winner block is the tallest', /is-rank-1 \.lan-podium-block\{[^}]*height:96px/],
  ['LAN winner block keeps its gold', /is-earned\.is-rank-1 \.lan-podium-block\{[^}]*linear-gradient/],
  // Treasure header: the world label and the "Bối cảnh & Nhiệm vụ" button must sit
  // on one row, pushed to opposite ends. Without `space-between` they stack and the
  // button loses its place at the right (DECISIONS #109).
  ['treasure header row splits left/right', /\.treasure-head-row\{[^}]*justify-content:space-between/],
  ['treasure header row spans the stage', /\.treasure-head-row\{[^}]*align-self:stretch/],
  // Settings tabs (#158, #159): the only cue that a tab is selected is its underline, and
  // it is keyed off the ARIA attribute the wiring sets — dropped, every tab looks equal.
  ['Settings tab underline follows aria-selected', /\.settings-tab\[aria-selected=("?)true\1\]\{[^}]*border-bottom-color/],
  // Five tabs share one row on a 1366px screen; if the label may wrap, the strip becomes
  // two ragged rows and the underline of a split tab lands under half a word.
  ['Settings tab label stays on one line', /\.settings-tab\{[^}]*white-space:nowrap/],
  // The strip's rule under it is a hand-written selector rather than a utility: it has to
  // recolour the border of the container the tabs sit on, and the app had no working dark
  // variant when #159 was written. (#160 has since wired `dark:` to [data-theme] — see the
  // two checks below, which are what actually guard that.)
  ['Settings tab strip rule has a dark colour', /html\[data-theme=("?)dark\1\] \.settings-tablist\{[^}]*border-bottom-color/],
  // G6 / #160: the `dark` variant must key off [data-theme], because applyTheme() sets that
  // attribute and the OS scheme is not what the teacher picked. Revert the @custom-variant
  // and every `dark:` class in the renderer silently stops firing again (measured: 149 of
  // 223 dark-themed elements fell below 4.5:1 contrast, 69 of them below 2:1).
  ['dark: utilities are keyed on [data-theme=dark]', /\.dark\\:[^{]+:where\(\[data-theme=("?)dark\1\]/],
  // The wizard's card is a component class, so the utility translation table in shell.css
  // never reached it: without this rule the wizard stays a white card in dark mode and the
  // `dark:text-[#f1f5f9]` markup inside it becomes white-on-white.
  ['wizard form panel goes dark with the theme', /\[data-theme=("?)dark\1\] \.form-panel\{[^}]*background:var\(--panel\)/],
  // #161: a chrome icon is a <span data-icon> hook filled with an <svg>. Inline-level boxes
  // sit on the text baseline, so the hook has to be a flex box and its svg a block; dropped,
  // every icon in a button, chip or meta row rides a few pixels off the label next to it.
  // Tailwind reorders declarations, so match `display:inline-flex` anywhere in the block.
  ['chrome icon hooks are flex boxes', /span\[data-icon\]\{[^}]*display:inline-flex/],
  ['chrome icon svgs render as blocks', /span\[data-icon\] svg\{display:block\}/],
  // #164: the four batch-selection bars. These four assertions only prove the rules survived
  // minification — which of two equal-specificity `!important` rules wins is decided by source
  // order, and that is what tests/ui/ui-dark-theme-check.js measures on the live page.
  ['dark batch bar gets a surface of its own', /\[data-theme=("?)dark\1\] \[data-lesson-selection-bar\][^{]*\{[^}]*#2a324b/],
  ['the pick chip is no longer an opaque white plate', /\[data-theme=("?)dark\1\] \.bg-white\\\/\\\[90\\%\\\]\{background-color:#ffffff14/],
  ['bar label ink is mapped for dark', /\.text-\\\[\\#4c4680\\\][^{]*\{[^}]*color:var\(--text\)/],
  ['bar count and "Bỏ chọn" inks land in the muted list', /\.text-\\\[\\#5b5680\\\],[^{]*\\#6b6690\\\][^{]*\{[^}]*color:var\(--muted\)/]
];

let failed = 0;
for (const [name, re] of expectations) {
  const ok = re.test(css);
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
console.log(`\n${expectations.length - failed}/${expectations.length} compiled-CSS checks passed`);
process.exit(failed ? 1 : 0);
