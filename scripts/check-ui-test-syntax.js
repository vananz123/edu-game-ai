/* check-ui-test-syntax.js — every tests/ui/*.js must at least COMPILE.
 *
 * Why this exists (#258): those files build their page code as a template
 * literal passed to `evaluate()`. A backtick inside a `//` comment inside that
 * literal closes it early, and the result is a SyntaxError *at load*, long
 * before any browser check runs. That happened three times (#254, #256, #257) and
 * each time cost a full app launch to discover.
 *
 * A regex over the source would be a guess; compiling it is the truth. This
 * does not run the file (it needs a live app), it only parses it, which is
 * exactly the failure above.
 *
 * Usage: node scripts/check-ui-test-syntax.js [--quiet]
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'tests', 'ui');

/** Files that a compile error would break; helpers are included on purpose. */
function uiTestFiles() {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

/** A backtick in a comment inside an evaluate() template literal: the known trap. */
function suspiciousComment(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') && trimmed.includes('`');
}

function diagnose(source, error) {
  const lines = source.split(/\r?\n/);
  const hints = [];
  lines.forEach((line, index) => {
    if (suspiciousComment(line)) hints.push(index + 1);
  });
  if (/missing \) after argument list|Unexpected token|Invalid or unexpected token/u.test(error.message) && hints.length) {
    return `dong ${hints.join(', ')} co dau backtick trong chu thich -> template literal cua evaluate() bi dong som`;
  }
  return '';
}

function main() {
  const quiet = process.argv.includes('--quiet');
  const files = uiTestFiles();
  const failures = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    try {
      // Compile only: never run. `Script` is the cheapest real parser here.
      new vm.Script(source, { filename: file });
    } catch (error) {
      failures.push({
        file: path.relative(root, file),
        message: String((error && error.message) || error),
        hint: diagnose(source, error),
      });
    }
  }
  if (!quiet) {
    console.log(`check-ui-test-syntax: ${files.length} tệp trong tests/ui`);
  }
  if (!failures.length) {
    if (!quiet) console.log('check-ui-test-syntax: không tệp nào lỗi cú pháp.');
    return;
  }
  for (const failure of failures) {
    console.error(`FAIL ${failure.file}: ${failure.message}`);
    if (failure.hint) console.error(`     ${failure.hint}`);
  }
  process.exitCode = 1;
}

main();
