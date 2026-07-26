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

    // FIX #8: Reorder DOM without destroying CodeMirror instances
    // Re-appending existing nodes just moves them in the DOM tree
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