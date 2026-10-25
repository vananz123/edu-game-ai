import assert from 'node:assert/strict';
import path from 'node:path';

/**
 * `scripts/check-renderer-undefined-globals.js` guards the one error class that
 * `@ts-nocheck` hides: a renderer calling a function that no renderer declares.
 *
 * The check is a hand-written scanner, not a parser, so it has two failure modes
 * that matter, and both are covered here:
 *   1. False negatives — the scanner stops "seeing" declarations or call sites
 *      because it mis-lexed a string, regex, or nested template literal. That is
 *      how the first draft silently missed every declaration after a regex
 *      literal and after a nested template literal.
 *   2. False positives — prose, CSS class names, or `async ()` / `function ()`
 *      syntax reported as an undefined call, which makes the check untrustworthy.
 *
 * Real history behind it: `wizardStructureScopeError()` was called from
 * `step-input.ts` and `create-wizard.ts` while defined nowhere; the app compiled,
 * launched, and then threw `ReferenceError` on the step-1 render.
 */

const ROOT = path.join(__dirname, '..', '..', '..');
const checker = require(path.join(ROOT, 'scripts', 'check-renderer-undefined-globals.js'));
const { scanSource, stripCommentsAndStrings, wordBefore } = checker;

/** Run the scanner over a single synthetic source and return the unresolved names. */
function unresolvedNames(source: string) {
  const declaredFunctions = new Set<string>();
  const localNames = new Set<string>();
  const calls: Array<{ name: string; file: string; line: number }> = [];

  scanSource('synthetic.js', source, declaredFunctions, localNames, calls);

  return calls
    .filter(({ name }) => {
      if (checker.PLATFORM_ALLOWLIST.has(name)) return false;
      if (declaredFunctions.has(name)) return false;
      if (localNames.has(name)) return false;
      return true;
    })
    .map(({ name }) => name);
}

// The exact regression: a call to a function nobody declares must be reported.
assert.deepEqual(
  unresolvedNames('renderWizardInput();\n'),
  ['renderWizardInput'],
  'a call to an undeclared function must be reported'
);

// A declared function, wherever it lives, satisfies the call.
assert.deepEqual(
  unresolvedNames('function renderWizardInput() {}\nrenderWizardInput();\n'),
  [],
  'a declared function satisfies the call'
);
assert.deepEqual(
  unresolvedNames('async function loadWindow() {}\nloadWindow();\n'),
  [],
  'async function declarations must count (they were missed by an early draft)'
);

// Declarations AFTER constructs that used to desynchronise the lexer.
assert.deepEqual(
  unresolvedNames(
    [
      "const url = /^https?:\\/\\//;",
      'function afterRegex() {}',
      'afterRegex();',
      ''
    ].join('\n')
  ),
  [],
  'a regex literal containing // must not hide later declarations'
);

assert.deepEqual(
  unresolvedNames(
    [
      'function afterNestedTemplate() {}',
      'const html = `${on ? `<div class="x">` : \'\'}`;',
      'afterNestedTemplate();',
      ''
    ].join('\n')
  ),
  [],
  'a nested template literal inside an interpolation must not hide later declarations'
);

// Text inside strings, including Vietnamese prose, is not code.
assert.deepEqual(
  unresolvedNames("const note = 'Lịch sử (mục đã khôi phục)';\n"),
  [],
  'parentheses inside Vietnamese prose must not look like a call'
);
assert.deepEqual(
  unresolvedNames('const html = `<h3>Chẩn đoán AI (log)</h3>`;\n'),
  [],
  'parentheses inside markup text must not look like a call'
);

// The complementary failure: if a string were not terminated at its closing quote,
// the rest of the line would be swallowed and a REAL call would go unreported.
assert.deepEqual(
  unresolvedNames("const label = 'Đã lưu'; renderWizardInput();\n"),
  ['renderWizardInput'],
  'a call after a closed string literal must still be reported'
);
assert.deepEqual(
  unresolvedNames('// call renderWizardInput() later\nconst x = 1;\n'),
  [],
  'calls inside comments must be ignored'
);

// Function expressions and keywords are not calls.
assert.deepEqual(
  unresolvedNames("addEventListener('click', async () => {});\n"),
  [],
  '`async () =>` must not be reported as a call to async()'
);
assert.deepEqual(
  unresolvedNames('items.map(function (item) { return item; });\n'),
  [],
  '`function (` must not be reported as a call to function()'
);

// Callbacks passed as parameters, plus dotted access.
assert.deepEqual(
  unresolvedNames(
    ['function bind(onReorder) {', '  onReorder();', '}', ''].join('\n')
  ),
  [],
  'a callback parameter invoked as a function must not be reported'
);
assert.deepEqual(
  unresolvedNames('window.requestAnimationFrame(() => {});\nstate.save();\n'),
  [],
  'dotted member calls are not globals'
);

// Calls inside `${...}` are real code and must still be analysed.
assert.deepEqual(
  unresolvedNames('const html = `<b>${missingRender()}</b>`;\n'),
  ['missingRender'],
  'a call inside a template interpolation must still be reported'
);

// A mid-word match must not produce a bogus short name.
assert.deepEqual(
  unresolvedNames("const tone = String(teachingStyle.tone || '');\n"),
  [],
  '`String(` must not also yield a bogus `ng()` call'
);

// `wordBefore` returns the word ENDING at the given index.
assert.equal(wordBefore(', async (event)', 7), 'async');
assert.equal(wordBefore(', async (event)', 2), '');

// The stripper must keep line count stable so reported line numbers stay accurate.
const withNewlines = "const a = `line1\nline2 ${b(\n)}`;\nconst c = 1;\n";
assert.equal(
  stripCommentsAndStrings(withNewlines).split('\n').length,
  withNewlines.split('\n').length,
  'stripping must preserve newlines so line numbers remain correct'
);

console.log('renderer-undefined-globals: all assertions passed');
