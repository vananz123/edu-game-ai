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
  // Settings AI tabs (#158): the only cue that a tab is selected is its underline, and
  // it is keyed off the ARIA attribute the wiring sets — dropped, both tabs look equal.
  ['AI tab underline follows aria-selected', /\.settings-ai-tab\[aria-selected=("?)true\1\]\{[^}]*border-bottom-color/]
];

let failed = 0;
for (const [name, re] of expectations) {
  const ok = re.test(css);
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
console.log(`\n${expectations.length - failed}/${expectations.length} compiled-CSS checks passed`);
process.exit(failed ? 1 : 0);
