/**
 * notebook/dnd.js
 * Drag and drop reordering.
 */
export function createDnD(container, state, operations, selection) {
  function handleDragOver(e) { e.preventDefault(); }
  function handleDrop(e) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const cellEl = target.closest('.cell');
    if (!cellEl) return;
    const targetId = cellEl.dataset.cellId;
    if (!targetId || draggedId === targetId) return;
    const fromIdx = state.indexOf(draggedId);
    const toIdx = state.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [cell] = state.cells.splice(fromIdx, 1);
    state.cells.splice(toIdx, 0, cell);
    // reorder DOM
    // We need to reorder the DOM manually or call a function
    // Since we don't have reorderDom here, we'll do it manually:
    container.innerHTML = '';
    state.cells.forEach(c => {
      container.appendChild(c.dom.root);
      container.appendChild(c.dom.insertBar);
    });
    selection.selectCell(cell.id);
  }
  container.addEventListener('dragover', handleDragOver);
  container.addEventListener('drop', handleDrop);
  return { handleDragOver, handleDrop };
}
