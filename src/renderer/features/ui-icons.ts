// Chrome icons (docs/DECISIONS.md #161).
//
// One place for the Lucide icons that decorate controls and structure — sidebar,
// topbar, page headers, tabs, empty states, toasts. The chrome used to be
// hand-typed emoji, which render at whatever size and baseline the system font
// picks, so the same "gear" differed between the sidebar, a button and a toast.
// Everything here goes through the same generated node data as the game content
// icons (src/renderer/features/icon-data.ts), so the whole app shares one 24x24
// stroked set and one `currentColor` that dark mode already restyles.
//
// Two entry points:
//   - `uiIcon(name, className, size)` returns markup for a template string;
//   - `paintUiIcons(root)` fills the `data-icon` hooks that live in the static
//     shell in src/index.html, which cannot call a function.

/** Declared by icon-data.ts, which index.html loads before this file. */
declare function getIconNode(name: unknown): ReadonlyArray<readonly [string, Readonly<Record<string, string>>]> | null;

const UI_ICON_DEFAULT_SIZE = 18;

function escapeUiIconAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * `<svg>` markup for a chrome icon, or '' when the id is not in the registry.
 * `aria-hidden` always: a chrome icon sits next to its own text label, so it
 * must not be read out twice.
 */
function uiIcon(name, className, size) {
  const nodes = typeof getIconNode === 'function' ? getIconNode(name) : null;
  if (!Array.isArray(nodes) || !nodes.length) return '';
  const px = typeof size === 'number' && size > 0 ? Math.round(size) : UI_ICON_DEFAULT_SIZE;
  const body = nodes.map(function (node) {
    const attrs = node[1] || {};
    const rendered = Object.keys(attrs).map(function (key) {
      return key + '="' + escapeUiIconAttr(attrs[key]) + '"';
    }).join(' ');
    return '<' + node[0] + ' ' + rendered + '/>';
  }).join('');
  const classes = 'lucide lucide-' + escapeUiIconAttr(name) + (className ? ' ' + className : '');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
    ' class="' + classes + '" aria-hidden="true" focusable="false">' + body + '</svg>';
}

/**
 * Replaces the contents of every `[data-icon]` under `root` (default: the whole
 * document) with its Lucide icon. Idempotent: an element that already holds the
 * requested icon is left alone, so this is safe to call again after a re-render.
 * Returns how many elements still carry no icon — an unknown id, which the UI
 * check treats as a failure instead of silently shipping a blank.
 */
function paintUiIcons(root) {
  const scope = root && root.querySelectorAll ? root : document;
  let missing = 0;
  scope.querySelectorAll('[data-icon]').forEach(function (el) {
    const name = el.getAttribute('data-icon');
    const size = Number(el.getAttribute('data-icon-size')) || undefined;
    const svg = uiIcon(name, el.getAttribute('data-icon-class'), size);
    if (!svg) {
      if (name) missing += 1;
      return;
    }
    if (el.firstElementChild && el.firstElementChild.getAttribute('data-icon-rendered') === name) return;
    el.innerHTML = svg;
    const child = el.firstElementChild;
    if (child) child.setAttribute('data-icon-rendered', name);
  });
  return missing;
}
