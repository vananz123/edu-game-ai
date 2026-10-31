#!/usr/bin/env node
/**
 * Fail the build when a renderer script *calls* a function that no renderer
 * script declares.
 *
 * Why this exists
 * ---------------
 * 28 of the 33 renderer files start with `@ts-nocheck`. That directive turns off
 * the one check that would otherwise catch this: `tsc` never reports
 * "Cannot find name 'x'". So a renderer can call a function that does not exist
 * anywhere, compile cleanly, ship, and only fail when a teacher clicks the
 * button that reaches it.
 *
 * That is not hypothetical. `wizardStructureScopeError()` was called by
 * `step-input.ts` (twice) and by `create-wizard.ts`, but was defined nowhere.
 * Import worked, the tree rendered, and then `render()` threw
 * `ReferenceError: wizardStructureScopeError is not defined` and the page stopped
 * repainting — the reported symptom was "nothing happens and no error shows".
 *
 * What it checks
 * --------------
 * The compiled renderer scripts listed in `dist/src/index.html`, in order, are
 * scanned for *call sites* (`name(`) and for function declarations. A call whose
 * name is declared by no script is reported.
 *
 * Deliberately narrow, to stay trustworthy:
 *   - Function declarations only (`function name(`). Function declarations hoist
 *     into the shared global script scope, so a call in any script is satisfiable
 *     by a declaration in any other script. `const`/`let` helpers do NOT hoist,
 *     so cross-file reads of them are a load-order problem already covered by
 *     renderer-load-order.test.ts — checking them here would be false positives.
 *   - Anything that is not a bare identifier followed by `(` is ignored:
 *     `obj.method(`, `?.`, keywords, and any name bound locally somewhere.
 *   - Browser / preload-provided names are allow-listed below.
 *
 * Usage: node scripts/check-renderer-undefined-globals.js [--dist <dir>]
 * Exit code 1 (listing file:line) when a call target is undefined.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const DIST = path.resolve(ROOT, argValue('--dist', path.join('dist', 'src')));
const INDEX = path.join(DIST, 'index.html');

/**
 * Third-party bundles (esbuild outputs under renderer/vendor/, e.g. three.global.js)
 * are skipped. They are minified: their function declarations land mid-line
 * (`...;function C(){...}`), which the line-anchored DECL_FN_LINE scanner cannot
 * see, so every internal call would read as a false "undefined function". Their
 * own globals (`var THREE=`) are still the renderer's responsibility to reference
 * correctly, which the load-order test and runtime cover.
 */
const VENDOR_PREFIX = 'renderer/vendor/';

/**
 * Call names legitimately provided by the browser, by the preload bridge, or by
 * the renderer's own shims. Without this the check is too noisy to trust.
 */
const PLATFORM_ALLOWLIST = new Set([
  // globals
  'eval', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'structuredClone', 'fetch',
  'atob', 'btoa', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback', 'alert', 'confirm', 'prompt',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'getComputedStyle',
  'matchMedia', 'open', 'close', 'focus', 'blur', 'scrollTo', 'scrollBy',
  'postMessage', 'print', 'getSelection', 'createImageBitmap',
  // constructors
  'Array', 'Object', 'String', 'Number', 'Boolean', 'Function', 'Date', 'RegExp',
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'Map', 'Set', 'WeakMap',
  'WeakSet', 'Promise', 'Proxy', 'Symbol', 'BigInt', 'ArrayBuffer', 'DataView',
  'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array',
  'Int32Array', 'Float32Array', 'Float64Array', 'URL', 'URLSearchParams',
  'Blob', 'File', 'FileReader', 'FormData', 'Headers', 'Request', 'Response',
  'AbortController', 'Event', 'CustomEvent', 'Image', 'Audio', 'Worker',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'DOMParser',
  'TextEncoder', 'TextDecoder', 'Notification', 'SpeechSynthesisUtterance',
  'AudioContext', 'webkitAudioContext', 'Path2D', 'OffscreenCanvas',
  // keywords that take a following `(` and look like calls
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'void', 'delete',
  'instanceof', 'in', 'of', 'do', 'else', 'try', 'new', 'await', 'yield', 'with'
]);

/**
 * Function declarations, matched at the START of a line.
 *
 * Why line-anchored: declarations must be found *reliably* — a missed one turns
 * into a false "undefined function" report, which destroys trust in the check.
 * A general-purpose string/regex-aware scan is easy to get subtly wrong (nested
 * template literals with interpolations, regex literals that look like comments),
 * and one wrong guess silently hides every later declaration in the file. Every
 * function declaration in this renderer begins a line, which makes a line-anchored
 * scan exact and immune to string/comment noise.
 */
const DECL_FN_LINE = /^[ \t]*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/gm;

/** `const name =`, `let name =`, `var name =` at the start of a line. */
const DECL_VAR_LINE = /^[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?==|;|,)/gm;

/** Any binding form, anywhere in *stripped* code (used for shadowing tolerance). */
const LOCAL_DECL = /\b(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;

/**
 * Parameter lists of function declarations, so that a callback passed in as a
 * parameter (`function bindDragList(list, itemSelector, onReorder)`) is not
 * reported when it is later invoked as `onReorder()`.
 */
const PARAM_LIST = /(?:^|[^\w$.])(?:async\s+)?function\s*\*?\s*[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g;
const IDENT = /[A-Za-z_$][\w$]*/g;

/** Words that, placed immediately before `name(`, mean `name` is not a call. */
const NOT_A_CALL_WORDS = new Set([
  'async', 'function', 'typeof', 'void', 'new', 'await', 'yield',
  'delete', 'in', 'of', 'instanceof'
]);

/**
 * A call site: a bare identifier immediately followed by `(`.
 *
 * Group 1 is the text before the identifier, so the caller can look at the
 * preceding token. Matching punctuation plus the identifier keeps indices simple.
 */
const CALL = /([^\w$.]|^)([A-Za-z_$][\w$]*)[ \t]*\(/g;

/**
 * The identifier word that ends immediately before `end` in `text`, i.e. the word
 * formed by the characters up to (but not including) `end`. Returns '' when the
 * character just before `end` is not part of a word.
 */
function wordBefore(text, end) {
  let i = end;
  while (i > 0 && /[A-Za-z_$]/.test(text[i - 1])) i--;
  return text.slice(i, end);
}

/** Placeholder removed: see CALL above. */

/**
 * Blank out comments and string/template literals so that prose and selectors
 * such as `'Đã lưu (x)'` cannot be mistaken for call sites. Newlines are kept so
 * reported line numbers still match the source file.
 *
 * Regex literals MUST be handled: `\/\/` inside `/^https?:\/\//` otherwise looks
 * like a line comment and swallows the rest of the file, which silently made
 * every later declaration invisible. Because `/` is both division and regex
 * start, we use the standard heuristic: a `/` begins a regex unless the previous
 * meaningful token can end an expression (identifier, number, `)`, `]`, quote).
 */
function stripCommentsAndStrings(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  // True when the last significant character ended an expression, so `/` is division.
  let lastSignificant = '';

  const regexCanFollow = () => {
    if (lastSignificant === '') return true;
    if (/[\w$)\]]/.test(lastSignificant)) return false;
    return true;
  };

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    // Line comment
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }

    // Block comment
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }

    // Regex literal
    if (c === '/' && regexCanFollow()) {
      out += c;
      i++;
      let inClass = false;
      while (i < n) {
        const ch = source[i];
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) {
          i++;
          break;
        } else if (ch === '\n') {
          break; // malformed regex; bail to avoid eating the file
        }
        i++;
      }
      // regex flags
      while (i < n && /[a-z]/.test(source[i])) i++;
      out += '/';
      lastSignificant = '/';
      continue;
    }

    // String / template literal.
    //
    // The *body* is dropped entirely so prose such as `Lịch sử (…)` cannot look
    // like a call to `ử()`, but the delimiters are kept so line structure survives.
    //
    // Template literals hold real code inside `${ ... }`, which must keep being
    // analysed: `` `${fn()}` `` is a genuine call site. The interpolation is found
    // by brace-matching and stripped recursively, so a nested template literal or
    // a `}` in nested code cannot end the outer template early
    // (`` `${cond ? `<div>` : ''}` ``).
    if (c === '"' || c === "'" || c === '`') {
      out += c;
      i++;
      while (i < n) {
        const ch = source[i];

        if (ch === '\\') {
          i += 2;
          continue;
        }

        if (ch === c) break;

        if (ch === '\n') {
          out += '\n';
          i++;
          continue;
        }

        // `${ ... }` — find the matching brace, strip the inner code, keep it.
        if (c === '`' && ch === '$' && source[i + 1] === '{') {
          let j = i + 2;
          let braces = 1;
          while (j < n && braces > 0) {
            const cj = source[j];
            if (cj === '\\') { j += 2; continue; }
            if (cj === '{') braces++;
            else if (cj === '}') braces--;
            if (braces > 0) j++;
          }
          const inner = source.slice(i + 2, j);
          out += '${' + stripCommentsAndStrings(inner) + '}';
          i = j + 1;
          continue;
        }

        i++;
      }
      if (i < n) {
        out += c;
        i++;
      }
      lastSignificant = c;
      continue;
    }

    out += c;
    if (!/\s/.test(c)) lastSignificant = c;
    i++;
  }
  return out;
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/**
 * Scan one script, accumulating declarations, local bindings, and call sites.
 * Exposed so tests can drive it on small synthetic sources.
 */
function scanSource(rel, raw, declaredFunctions, localNames, calls) {
  // Declarations: scanned on RAW source, line-anchored (see DECL_FN_LINE), so a
  // string or comment can never hide one.
  for (const m of raw.matchAll(DECL_FN_LINE)) declaredFunctions.add(m[1]);
  for (const m of raw.matchAll(DECL_VAR_LINE)) localNames.add(m[1]);

  // Call sites: scanned on STRIPPED source, so text inside strings and comments
  // — Vietnamese prose, CSS class lists, Tailwind selectors — is not mistaken
  // for code. Line numbers are preserved because newlines are kept.
  const code = stripCommentsAndStrings(raw);
  for (const m of code.matchAll(LOCAL_DECL)) localNames.add(m[1]);
  for (const m of code.matchAll(PARAM_LIST)) {
    for (const p of m[1].matchAll(IDENT)) localNames.add(p[0]);
  }
  for (const m of code.matchAll(CALL)) {
    // `m[1]` is the single character captured before the identifier, so the
    // identifier itself starts at `m.index + m[1].length`.
    const identStart = m.index + m[1].length;
    const identEnd = identStart + m[2].length;

    // Guard against mid-word matches (`String(` also matches `ng(`): the character
    // immediately preceding the identifier must not continue an identifier.
    const before = code[identStart - 1];
    if (before !== undefined && /[\w$]/.test(before)) continue;

    // Only treat the match as code when the identifier is not sitting inside HTML
    // markup. Template literals holding HTML (`<h3>Chẩn đoán AI (log)</h3>`) can
    // survive partial stripping, and Vietnamese prose plus markup produces
    // call-like text such as `ụng (mục` → `ng()`.
    const lineStart = code.lastIndexOf('\n', m.index) + 1;
    const htmlText = code.slice(lineStart, identStart);
    if (/<[^>]*$/.test(htmlText)) continue;

    if (NOT_A_CALL_WORDS.has(wordBefore(code, identEnd))) continue;
    calls.push({ name: m[2], file: rel, line: lineOf(code, m.index) });
  }
}

function main() {
  if (!fs.existsSync(INDEX)) {
    console.error(`check-renderer-undefined-globals: ${INDEX} not found — run "npm run build" first.`);
    process.exit(2);
  }

  const html = fs.readFileSync(INDEX, 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  if (scripts.length === 0) {
    console.error('check-renderer-undefined-globals: index.html lists no renderer scripts; refusing to pass vacuously.');
    process.exit(2);
  }

  const declaredFunctions = new Set();
  const localNames = new Set();
  const calls = [];
  let scanned = 0;

  for (const rel of scripts) {
    if (rel.startsWith(VENDOR_PREFIX)) continue;
    scanned++;
    const file = path.join(DIST, rel);
    if (!fs.existsSync(file)) {
      console.error(`check-renderer-undefined-globals: ${rel} is listed in index.html but missing from dist/.`);
      process.exit(2);
    }
    scanSource(rel, fs.readFileSync(file, 'utf8'), declaredFunctions, localNames, calls);
  }

  const unresolved = calls.filter(({ name }) => {
    if (PLATFORM_ALLOWLIST.has(name)) return false;
    if (declaredFunctions.has(name)) return false;
    if (localNames.has(name)) return false;
    return true;
  });

  if (unresolved.length === 0) {
    console.log(
      `check-renderer-undefined-globals: ${scanned} of ${scripts.length} scripts scanned, ` +
        `${declaredFunctions.size} declared functions, ${calls.length} call sites — no undefined globals.`
    );
    process.exit(0);
  }

  console.error('check-renderer-undefined-globals: these calls target a function no renderer script declares.');
  console.error('Under @ts-nocheck nothing else reports this; at runtime it is a ReferenceError.\n');
  for (const { name, file, line } of unresolved) {
    console.error(`  ${file}:${line}  ${name}()`);
  }
  console.error(`\n${unresolved.length} unresolved call site(s).`);
  process.exit(1);
}

// Allow tests to require() the internals without executing the check.
if (require.main === module) {
  main();
}

module.exports = {
  stripCommentsAndStrings,
  wordBefore,
  lineOf,
  collectCalls: scanSource,
  scanSource,
  NOT_A_CALL_WORDS,
  PLATFORM_ALLOWLIST
};
