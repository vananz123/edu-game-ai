// @ts-nocheck -- renderer UI logic; the tree/selection contracts are typed in src/services/lesson-structure.ts and lesson-selection.ts.
/**
 * Step 1 — document structure tree and teacher selection
 * (docs/archive/specs/update_AI_plan_7.txt §4, §5.5).
 *
 * The analyzer and the preparation layer live in the main process
 * (`lesson:get-structure` / `lesson:preview-selection`); this file owns only the
 * view state and the checkboxes. Nothing here calls AI: every structure request
 * is a local, deterministic walk over text the app already has.
 *
 * Tree state rules (§4.1), implemented exactly:
 *  - all sections are selected by default, and "no selection yet" means the
 *    whole document (the request then carries no `selectedIds` at all, which is
 *    what keeps the cache key byte-identical to the old behaviour);
 *  - ticking a parent ticks every descendant, clearing it clears them;
 *  - a parent whose descendants are partly ticked renders `indeterminate`;
 *  - "Chọn tất cả" / "Bỏ chọn tất cả" are one click each.
 */

/** Same character floor as the import step; below it there is nothing to analyse. */
const WIZARD_STRUCTURE_MIN_CHARS = 40;
/** Requests are debounced so typing/pasting does not hammer the main process. */
const WIZARD_STRUCTURE_DEBOUNCE_MS = 350;

/** Lazily created so the script can load before the first tree exists. */
function wizardStructureState() {
  if (!wizardState.structure) {
    wizardState.structure = {
      /** Analyzer result, or null before the first request. */
      tree: null,
      loading: false,
      /** Text the tree was built from; a mismatch means the request was stale. */
      text: '',
      /** Explicit ticks; empty + `customized: false` = whole document. */
      selected: [],
      customized: false,
      collapsed: [],
      preview: null,
      previewLoading: false,
      warnings: [],
      error: null
    };
  }
  return wizardState.structure;
}

function wizardStructureAllIds(tree) {
  if (!tree || !Array.isArray(tree.nodes)) return [];
  return tree.nodes
    .filter(node => node.id !== tree.root.id && !node.empty)
    .map(node => node.id);
}

/** All ids a tick on `node` covers: the node itself plus its descendants. */
function wizardStructureSubtree(node) {
  const ids = [node.id];
  const walk = current => (current.children || []).forEach(child => {
    ids.push(child.id);
    walk(child);
  });
  walk(node);
  return ids;
}

function wizardStructureIndex(tree) {
  const byId = new Map();
  const walk = node => {
    byId.set(node.id, node);
    (node.children || []).forEach(walk);
  };
  if (tree) walk(tree.root);
  return { byId };
}

/**
 * Derives the rendered checkbox state of every node from the explicit ticks.
 * `checked` = every non-empty descendant is ticked, `partial` = some are.
 * Deriving instead of storing keeps parent and child states from disagreeing.
 */
function wizardStructureNodeStates(tree) {
  const states = new Map();
  const s = wizardStructureState();
  // "No explicit ticks yet" means the whole document is in scope (tree-state rule
  // §4.1), not "nothing is selected". Reading `s.selected` alone made every
  // checkbox render unticked on first paint and made one click on a section
  // select the entire document, because `wizardStructureToggle` starts from
  // `wizardStructureAllIds()` in exactly that case. Both paths must agree.
  const selected = new Set(
    s.customized || !tree ? s.selected : wizardStructureAllIds(tree)
  );
  const visit = node => {
    const childStates = (node.children || []).map(visit);
    const selectable = !node.empty && node.id !== tree.root.id;
    let checked = selectable ? selected.has(node.id) : false;
    let partial = false;
    if (selectable && childStates.length) {
      const all = childStates.filter(state => state.selectableCount > 0);
      checked = all.length > 0 && all.every(state => state.checked);
      partial = !checked && all.some(state => state.checked || state.partial);
    }
    const state = {
      checked,
      partial,
      selectableCount: (selectable ? 1 : 0) + childStates.reduce((sum, item) => sum + item.selectableCount, 0)
    };
    states.set(node.id, state);
    return state;
  };
  if (tree) visit(tree.root);
  return { states, byId: wizardStructureIndex(tree).byId };
}

/** `true` when no section is excluded — including the untouched default. */
function wizardStructureEverythingSelected(tree) {
  const states = wizardStructureNodeStates(tree).states;
  return Array.from(states.values()).every(state => state.checked || state.selectableCount === 0);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function wizardStructureToggle(id) {
  wizardStructureToggle.pendingFocus = id;
  const s = wizardStructureState();
  const tree = s.tree;
  if (!tree) return;
  const node = wizardStructureIndex(tree).byId.get(id);
  if (!node) return;
  const state = wizardStructureNodeStates(tree).states.get(id);
  const selected = new Set(s.customized ? s.selected : wizardStructureAllIds(tree));
  const subtree = wizardStructureSubtree(node);
  if (state && state.checked) subtree.forEach(item => selected.delete(item));
  else subtree.forEach(item => selected.add(item));
  // Un-ticking the last section is allowed here and reported by the UI; the
  // request itself is never made (the main process refuses an empty selection).
  s.customized = true;
  s.selected = Array.from(selected);
  // The preview is rebuilt after the debounce, so clearing it here only made
  // the panel flash "Chưa có bản xem trước." on every tick.
  wizardStructureSchedulePreview();
  render();
}

function wizardStructureSelectAll() {
  const s = wizardStructureState();
  s.customized = false;
  s.selected = [];
  wizardStructureSchedulePreview();
  render();
}

function wizardStructureClearAll() {
  const s = wizardStructureState();
  s.customized = true;
  s.selected = [];
  s.preview = null;
  s.warnings = [];
  wizardStructureSchedulePreview();
  render();
}

function wizardStructureToggleCollapse(id) {
  const s = wizardStructureState();
  const collapsed = new Set(s.collapsed);
  if (collapsed.has(id)) collapsed.delete(id);
  else collapsed.add(id);
  s.collapsed = Array.from(collapsed);
  render();
}

/**
 * Carries the step-1 tree state across the `innerHTML` re-render: the scroll
 * offset of the tree and the preview text, `aria-checked` on the partial rows,
 * and the section the teacher just ticked.
 *
 * Re-rendering used to reset the tree to its top and gave the browser nothing
 * to keep the caret/label steady, which read as a jump on every click.
 */
function wizardStructureRestoreView(focusSectionId) {
  const treeList = document.querySelector('[data-structure-tree]');
  const tree = wizardStructureState().tree;
  if (!tree) return;
  // Always write the remembered offset. Leaving it at 0 simply scrolls to the
  // top; skipping the write is NOT the same thing, because the preview block
  // below the tree changes height when the debounced preview lands, and the
  // browser re-anchors the scroll position to keep its old first visible node —
  // which showed up as "the tree jumps to a neighbour row after a tick".
  const treeTarget = Number(wizardStructureRestoreView.treeScroll || 0);
  if (treeList) treeList.scrollTop = treeTarget;
  const previewTarget = Number(wizardStructureRestoreView.previewScroll || 0);
  const preview = document.querySelector('[data-structure-preview-text]');
  if (preview) preview.scrollTop = previewTarget;
  if (focusSectionId) {
    const input = document.querySelector(`[data-wizard-section="${focusSectionId.replace(/"/g, '\\"')}"]`);
    // The page was just replaced, so the browser has already moved the focus to
    // <body>. Defer one frame (the DOM is connected and laid out by then) so the
    // focus lands on the fresh checkbox instead of failing silently.
    const restoreFocus = () => {
      const target = document.querySelector(`[data-wizard-section="${focusSectionId.replace(/"/g, '\\"')}"]`);
      if (target) target.focus({ preventScroll: true });
    };
    if (input && input.isConnected) restoreFocus();
    else requestAnimationFrame(restoreFocus);
    // A nested tick awaits a microtask before `wizardStructureToggle` runs, which
    // would send the focus back to <body> after the render; re-apply next frame.
    requestAnimationFrame(() => {
      if (/^(INPUT|BUTTON)$/.test(document.activeElement ? document.activeElement.tagName : '')) return;
      restoreFocus();
    });
  }
}

/**
 * Persists the two scroll offsets right before the DOM is thrown away.
 * Called by `render()` (core/render.ts) and by a passive capture listener on
 * the page root, so a plain scroll — with no click following it — is recorded
 * too, without adding a listener to a node that is replaced on every render.
 */
function wizardStructureCaptureView() {
  const treeList = document.querySelector('[data-structure-tree]');
  // A hidden pane (the content tab) reports 0 for `scrollTop`; keeping the last
  // real offset is what lets the teacher come back to the same row.
  if (treeList && treeList.scrollTop > 0) wizardStructureRestoreView.treeScroll = treeList.scrollTop;
  const preview = document.querySelector('[data-structure-preview-text]');
  if (preview && preview.scrollTop > 0) wizardStructureRestoreView.previewScroll = preview.scrollTop;
}

let wizardStructureScrollCaptureWired = false;
function wireWizardStructureScrollCapture() {
  if (wizardStructureScrollCaptureWired) return;
  wizardStructureScrollCaptureWired = true;
  document.addEventListener('scroll', () => {
    if (wizardState.step !== 'input') return;
    wizardStructureCaptureView();
  }, { capture: true, passive: true });
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/**
 * Asks the main process for the structure. Local and deterministic, so it is
 * safe to run on every debounced text change; a stale response (the text moved
 * on while it was being built) is dropped instead of shown.
 */
function wizardStructureSchedule(delay = WIZARD_STRUCTURE_DEBOUNCE_MS) {
  if (wizardStructureSchedule.timer) clearTimeout(wizardStructureSchedule.timer);
  wizardStructureSchedule.timer = setTimeout(() => {
    wizardStructureSchedule.timer = null;
    wizardStructureRefresh();
  }, delay);
}

async function wizardStructureRefresh() {
  const s = wizardStructureState();
  const text = String(wizardState.text || '');
  if (text.trim().length < WIZARD_STRUCTURE_MIN_CHARS) {
    s.tree = null;
    s.text = '';
    s.loading = false;
    s.preview = null;
    return;
  }
  s.loading = true;
  s.error = null;
  if (wizardState.step === 'input') render();
  try {
    const result = await window.eduGame.inspectLessonStructure({ text, name: wizardState.documentName || '' });
    // The teacher may have edited the text while the analyzer ran.
    if (String(wizardState.text || '') !== text) return;
    s.tree = result || null;
    s.text = text;
    s.customized = false;
    s.selected = [];
    s.preview = null;
    s.warnings = [];
    await wizardStructurePreview();
  } catch (error) {
    s.tree = null;
    s.error = (error && error.message) || 'Không đọc được cấu trúc tài liệu.';
  } finally {
    s.loading = false;
    if (String(wizardState.text || '') === text && wizardState.step === 'input') render();
  }
}

function wizardStructureSchedulePreview() {
  if (wizardStructureSchedulePreview.timer) clearTimeout(wizardStructureSchedulePreview.timer);
  wizardStructureSchedulePreview.timer = setTimeout(() => {
    wizardStructureSchedulePreview.timer = null;
    wizardStructurePreview().then(() => {
      if (wizardState.step === 'input') render();
    });
  }, 120);
}

/**
 * §4.2/§5.5: the preview comes from the *same* preparation function the analysis
 * uses (`lesson:preview-selection`), so it cannot drift from what is sent.
 */
async function wizardStructurePreview() {
  const s = wizardStructureState();
  const tree = s.tree;
  if (!tree || tree.empty) {
    s.preview = null;
    return;
  }
  if (s.customized && !s.selected.length) {
    s.preview = null;
    return;
  }
  s.previewLoading = true;
  try {
    s.preview = await window.eduGame.previewLessonSelection({
      text: String(wizardState.text || ''),
      structure: tree,
      selectedIds: s.customized ? s.selected : undefined,
      mode: 'fast'
    });
    s.warnings = (s.preview && s.preview.warnings) || [];
    s.error = null;
  } catch (error) {
    s.preview = null;
    s.error = (error && error.message) || 'Không dựng được bản xem trước.';
  } finally {
    s.previewLoading = false;
  }
}

/** Payload for `lesson:analyze`: empty object keeps the whole-document path. */
function wizardStructureAnalyzePayload() {
  const s = wizardStructureState();
  if (!s.tree || !s.customized) return {};
  return { selectedIds: s.selected.slice() };
}

/**
 * Drops the reviewed scope. Called when the document text changes (the tree no
 * longer describes it) and when a project is opened (its selection is unknown).
 * `rebuild: true` re-runs the local analyzer immediately and selects everything.
 */
function wizardResetStructure(options = {}) {
  const previous = wizardState.structure;
  wizardState.structure = null;
  if (wizardStructureSchedule.timer) {
    clearTimeout(wizardStructureSchedule.timer);
    wizardStructureSchedule.timer = null;
  }
  if (wizardStructureSchedulePreview.timer) {
    clearTimeout(wizardStructureSchedulePreview.timer);
    wizardStructureSchedulePreview.timer = null;
  }
  if (previous && previous.tree) previous.tree = null;
  if (options.rebuild && String(wizardState.text || '').trim().length >= WIZARD_STRUCTURE_MIN_CHARS) {
    wizardStructureSchedule(0);
  }
}

/** Ids the teacher ticked, or `null` when the whole document is in scope. */
function wizardStructureSelectedIds() {
  const s = wizardStructureState();
  if (!s.tree || !s.customized) return null;
  return s.selected.slice();
}

/**
 * Blocks "Tiếp tục" when the reviewed scope would send nothing.
 *
 * The tree is the source of truth: `customized` means the teacher touched the
 * checkboxes, and an empty `selected` list then means every section was cleared
 * on purpose. Letting that through would call the analyzer with `selectedIds: []`
 * and hand the AI an empty document — the failure the panel already warns about
 * in `wizardStructurePreviewPanel()`. Returns '' (no problem) otherwise, so the
 * caller can use it directly as a disabled-condition.
 */
function wizardStructureScopeError() {
  const s = wizardStructureState();
  if (!s.tree) return '';
  if (s.customized && !s.selected.length) {
    return 'Chưa chọn phần nào trong cấu trúc tài liệu. Hãy chọn ít nhất một phần, hoặc bấm “Chọn tất cả”.';
  }
  return '';
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const WIZARD_SECTION_KIND_LABELS = {
  document: 'toàn bộ',
  section: 'mục',
  subsection: 'mục con',
  'table-row': 'bảng',
  'list-item': 'danh sách',
  question: 'câu hỏi',
  answer: 'đáp án',
  example: 'ví dụ',
  formula: 'công thức',
  'figure-caption': 'hình/bảng',
  administrative: 'hành chính'
};

function wizardStructureBadges(node) {
  const parts = [];
  if (node.confidence === 'low') {
    parts.push('<span class="wizard-tree-badge is-uncertain" title="Đoán từ hình dạng dòng — hãy kiểm tra">cần xem lại</span>');
  }
  if (node.kind && node.kind !== 'section' && node.kind !== 'document') {
    parts.push(`<span class="wizard-tree-badge">${escapeHtml(WIZARD_SECTION_KIND_LABELS[node.kind] || node.kind)}</span>`);
  }
  return parts.join('');
}

function wizardStructureTreeRow(node, states, collapsed, depth, rootId) {
  const state = states.get(node.id) || { checked: false, partial: false };
  const children = node.children || [];
  const isCollapsed = collapsed.has(node.id);
  const isRoot = node.id === rootId;
  const caret = children.length
    ? `<button type="button" class="wizard-tree-caret" data-wizard-action="toggle-section" data-section-id="${escapeHtml(node.id)}" aria-expanded="${isCollapsed ? 'false' : 'true'}" aria-label="${isCollapsed ? 'Mở rộng' : 'Thu gọn'}">${isCollapsed ? '▸' : '▾'}</button>`
    : '<span class="wizard-tree-caret is-leaf" aria-hidden="true">·</span>';
  // The root row is the document itself: it is not selectable (`selectable` is
  // forced off for `tree.root.id` in `wizardStructureNodeStates`), so it must
  // not get a checkbox. It used to render one that was permanently unticked and
  // whose click toggled *every* section at once.
  const checkbox = node.empty
    ? '<span class="wizard-tree-empty" title="Phần này không có chữ">trống</span>'
    : isRoot
      ? ''
      : `<input type="checkbox" data-wizard-section="${escapeHtml(node.id)}"${state.checked ? ' checked' : ''} aria-label="${escapeHtml(node.title)}">`;
  const rows = [`
    <li class="wizard-tree-node" data-depth="${depth}" data-section-row="${escapeHtml(node.id)}">
      ${caret}
      ${checkbox}
      <span class="wizard-tree-title${state.partial ? ' is-partial' : ''}" title="${escapeHtml(node.title)}">${escapeHtml(node.title)}</span>
      ${wizardStructureBadges(node)}
      <span class="wizard-tree-size">${Number(node.characters || 0).toLocaleString('vi-VN')}</span>
    </li>`];
  if (children.length && !isCollapsed) {
    children.forEach(child => rows.push(wizardStructureTreeRow(child, states, collapsed, depth + 1, rootId)));
  }
  return rows.join('');
}

function wizardStructurePreviewPanel() {
  const s = wizardStructureState();
  const preview = s.preview;
  if (s.customized && !s.selected.length) {
    return '<div class="wizard-tree-warning" data-structure-empty-scope>Chưa chọn phần nào. Hãy chọn ít nhất một phần, hoặc bấm “Chọn tất cả”.</div>';
  }
  if (!preview) {
    return `<div class="field-hint" data-structure-preview-state="none">${s.previewLoading ? 'Đang dựng bản xem trước…' : 'Chưa có bản xem trước.'}</div>`;
  }
  const ranges = preview.ranges || [];
  const selectedCount = ranges.filter(range => range.selected).length;
  const contextCount = ranges.filter(range => !range.selected).length;
  const kept = preview.preserved || {};
  const warnings = (preview.warnings || []).map(text => `<li>${escapeHtml(text)}</li>`).join('');
  const heading = preview.truncated
    ? '⚠ Phần nội dung sẽ gửi cho AI (đã phải lược bớt)'
    : '✓ Phần nội dung sẽ gửi cho AI';
  return `<div class="wizard-tree-preview" data-structure-preview data-structure-truncated="${preview.truncated ? 'true' : 'false'}">
    <div class="wizard-tree-preview-head">
      <strong>${heading}</strong>
      <span class="wizard-tree-figures">${Number(preview.chars || 0).toLocaleString('vi-VN')} ký tự · ~${Number(preview.estimatedTokens || 0).toLocaleString('vi-VN')} token (ước tính) · ${selectedCount.toLocaleString('vi-VN')} phần đã chọn${contextCount ? ` · ${contextCount} tiêu đề ngữ cảnh` : ''}</span>
    </div>
    <div class="wizard-tree-figures mb-[8px]">Giữ nguyên: ${Number(kept.tables || 0)} dòng bảng · ${Number(kept.questions || 0)} câu hỏi · ${Number(kept.answers || 0)} đáp án · ${Number(kept.examples || 0)} ví dụ · ${Number(kept.formulas || 0)} công thức</div>
    ${warnings ? `<ul class="wizard-tree-warning" data-structure-warnings>${warnings}</ul>` : ''}
    <pre class="wizard-tree-text" data-structure-preview-text>${escapeHtml(preview.text || '')}</pre>
  </div>`;
}

/**
 * Restores the tristate that `innerHTML` cannot express.
 *
 * `core/render.ts` calls this right after replacing `#pageContent`, so it must
 * use the element-rooted `$$`, not `document.querySelectorAll`: the document
 * <head> is writable and survives the re-render, so a query that leaked into it
 * (or a stale copy of this function in another bundle) is caught the next time
 * this runs. The previous version queried the <head> and threw
 * `HTMLCollection does not support named properties`, which aborted the restore
 * before the scroll offset and the focus were re-applied — the "giật" on click.
 */
function wizardSyncStructureCheckboxes() {
  const s = wizardStructureState();
  const tree = s.tree;
  if (!tree) return;
  const host = document.querySelector('[data-tab-pane="structure"]') || document.getElementById('pageContent') || document;
  if (!host) return;
  const { states } = wizardStructureNodeStates(tree);
  $$('[data-wizard-section]', host).forEach(input => {
    const state = states.get(input.getAttribute('data-wizard-section'));
    if (!state) return;
    input.checked = Boolean(state.checked);
    input.indeterminate = Boolean(state.partial);
    // Exposed as an attribute so a screen reader and the UI checks can read the
    // derived state; `indeterminate` alone is a live DOM property only.
    const row = input.closest('.wizard-tree-node');
    if (row) row.setAttribute('aria-checked', state.partial ? 'mixed' : String(Boolean(state.checked)));
  });
  const focusId = wizardStructureToggle.pendingFocus;
  wizardStructureToggle.pendingFocus = null;
  if (focusId) wizardStructureRestoreView(focusId);
}

/** The review block shown under the document text in step 1. */
function renderWizardStructureTree() {
  const s = wizardStructureState();
  if (String(wizardState.text || '').trim().length < WIZARD_STRUCTURE_MIN_CHARS) return '';
  if (s.loading && !s.tree) {
    return `<div class="form-panel mt-[14px]" data-structure-panel data-structure-loading>
      <div class="section-head"><h3>Cấu trúc tài liệu</h3><span class="tag">Đang đọc trên máy</span></div>
      <div class="field-hint">Đang tách chương/mục bằng quy tắc cục bộ — không gọi AI.</div>
    </div>`;
  }
  if (s.error && !s.tree) {
    return `<div class="form-panel mt-[14px]" data-structure-panel data-structure-error>
      <div class="section-head"><h3>Cấu trúc tài liệu</h3><span class="tag">Chưa đọc được</span></div>
      <div class="wizard-tree-warning">${escapeHtml(s.error)} Bạn vẫn có thể phân tích toàn bộ tài liệu.</div>
    </div>`;
  }
  const tree = s.tree;
  if (!tree) return '';
  if (tree.empty) {
    // §3.5: no text layer (an image-only PDF) is stated, never drawn as an empty lesson.
    return `<div class="form-panel mt-[14px]" data-structure-panel data-structure-no-text>
      <div class="section-head"><h3>Cấu trúc tài liệu</h3><span class="tag">Không có chữ</span></div>
      <div class="wizard-tree-warning">Không tìm thấy chữ trong tài liệu này (có thể là PDF scan). App chưa có OCR: hãy dán nội dung bằng tay hoặc dùng tệp DOCX/TXT.</div>
    </div>`;
  }
  const everything = wizardStructureEverythingSelected(tree);
  const selectedCount = s.customized ? s.selected.length : wizardStructureAllIds(tree).length;
  const { states } = wizardStructureNodeStates(tree);
  const rows = wizardStructureTreeRow(tree.root, states, new Set(s.collapsed || []), 0, tree.root.id);
  const notice = everything
    ? 'AI sẽ đọc toàn bộ nội dung tài liệu đang chọn. Chọn ít mục hơn có thể giúp phân tích nhanh và đúng trọng tâm hơn.'
    : 'Chỉ những phần đã đánh dấu được gửi cho AI. Ít nội dung hơn có thể giúp phân tích nhanh và đúng trọng tâm hơn.';
  const title = tree.headingsFound
    ? `Cấu trúc tài liệu · ${Number(tree.headingsFound).toLocaleString('vi-VN')} tiêu đề`
    : 'Cấu trúc tài liệu · chia theo đoạn văn';
  return renderWizardStructurePanel(s, tree, { everything, selectedCount, rows, notice, title });
}

function renderWizardStructurePanel(s, tree, view) {
  const lowConfidence = Number(tree.lowConfidence || 0);
  const degraded = tree.degraded
    ? '<div class="wizard-tree-warning" data-structure-degraded-note>Không đọc được cấu trúc chi tiết; danh sách dưới đây là toàn bộ tài liệu. Bạn vẫn phân tích được.</div>'
    : '';
  const uncertain = lowConfidence
    ? `<div class="field-hint mb-[8px]">${lowConfidence.toLocaleString('vi-VN')} tiêu đề được đoán từ hình dạng dòng và đánh dấu “cần xem lại”. Bỏ chọn nếu đó không phải tiêu đề.</div>`
    : '';
  const emptyScope = s.customized && !s.selected.length;
  return `<div class="form-panel mt-[14px]" data-structure-panel data-structure-sections="${Number(tree.headingsFound || 0)}" data-structure-selected="${view.selectedCount}" data-structure-custom="${s.customized ? 'true' : 'false'}" data-structure-degraded="${tree.degraded ? 'true' : 'false'}">
    <div class="section-head"><h3>${escapeHtml(view.title)}</h3><span class="tag">${view.everything ? 'Toàn bộ tài liệu' : `${view.selectedCount.toLocaleString('vi-VN')} phần đã chọn`}</span></div>
    <div class="panel-sub">${escapeHtml(view.notice)}</div>
    ${degraded}
    ${uncertain}
    <div class="wizard-tree-actions">
      <button type="button" class="btn btn-secondary btn-small" data-wizard-action="structure-select-all"${view.everything ? ' disabled' : ''}>Chọn tất cả</button>
      <button type="button" class="btn btn-secondary btn-small" data-wizard-action="structure-clear-all"${emptyScope ? ' disabled' : ''}>Bỏ chọn tất cả</button>
      <small class="text-[11px] text-[#788196]">cấu trúc v${Number(tree.version || 0)} · ${Number(tree.textLength || 0).toLocaleString('vi-VN')} ký tự</small>
    </div>
    <ul class="wizard-tree" data-structure-tree>${view.rows}</ul>
    ${wizardStructurePreviewPanel()}
  </div>`;
}


