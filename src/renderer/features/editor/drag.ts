// @ts-nocheck -- editor/drag.ts — kéo-thả đổi thứ tự/tham chiếu trong DOM, dùng chung cho matching và race; DOM vẫn là nguồn dữ liệu duy nhất (split từ features/game-editor.ts, DECISIONS #150).
/* G6 — kéo-thả trong trình soạn thảo (matching + race). DOM (#matchingPairs,
   #raceTeams, #raceCells, #raceQuestions) vẫn là nguồn dữ liệu duy nhất; kéo-thả
   chỉ đổi thứ tự/tham chiếu trong DOM rồi vẽ lại preview. Handle có draggable
   riêng vì row chứa <input> (draggable cả row sẽ chặn chọn/sửa chữ). */

let dragState = null;

function beginDrag(event, element, kind, value) {
  dragState = { element, kind, value };
  if (element) element.classList.add('dragging');
  if (event && event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', kind || 'move'); } catch (error) { /* synthetic DragEvent has no usable DataTransfer */ }
  }
}
function clearDropHighlights(scope) {
  if (!scope) return;
  $$('.drag-over', scope).forEach(el => el.classList.remove('drag-over'));
}
function endDrag(scope) {
  if (dragState && dragState.element) dragState.element.classList.remove('dragging');
  dragState = null;
  clearDropHighlights(scope);
}
function reorderByDrop(list, dragged, target, clientY) {
  if (!dragged || !target || dragged === target || !list.contains(dragged)) return;
  const rect = target.getBoundingClientRect();
  const after = clientY > rect.top + rect.height / 2;
  list.insertBefore(dragged, after ? target.nextElementSibling : target);
}
function bindDragList(list, itemSelector, onReorder) {
  if (!list) return;
  list.addEventListener('dragstart', event => {
    const handle = event.target.closest('[draggable="true"]');
    if (!handle || !list.contains(handle)) return;
    const item = handle.closest(itemSelector);
    if (!item) return;
    beginDrag(event, item, 'reorder');
  });
  list.addEventListener('dragover', event => {
    if (!dragState || dragState.kind !== 'reorder') return;
    const item = event.target.closest(itemSelector);
    if (!item || item === dragState.element) return;
    event.preventDefault();
    clearDropHighlights(list);
    item.classList.add('drag-over');
  });
  list.addEventListener('dragleave', event => {
    if (!list.contains(event.relatedTarget)) clearDropHighlights(list);
  });
  list.addEventListener('drop', event => {
    if (!dragState || dragState.kind !== 'reorder') return;
    const item = event.target.closest(itemSelector);
    if (!item) return;
    event.preventDefault();
    reorderByDrop(list, dragState.element, item, event.clientY);
    endDrag(list);
    if (typeof onReorder === 'function') onReorder();
  });
  list.addEventListener('dragend', () => endDrag(list));
}
