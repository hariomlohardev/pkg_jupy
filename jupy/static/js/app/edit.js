/**
 * app/edit.js – Edit dropdown handlers (find bar now delegated to findBar.js)
 */
let findBar = null;
export function setFindBar(fb) { findBar = fb; }

export function initEditDropdown(notebook, showToast) {
  document.getElementById('btn-undo')?.addEventListener('click', () => notebook.undo());
  document.getElementById('btn-redo')?.addEventListener('click', () => notebook.redo());
  document.getElementById('btn-merge')?.addEventListener('click', () => notebook.mergeSelectedCells());
  document.getElementById('btn-split')?.addEventListener('click', () => {
    const id = notebook.getSelectedId();
    if (id) notebook.splitCellAtCursor(id);
  });
  document.getElementById('btn-find')?.addEventListener('click', () => findBar?.toggle());
  document.getElementById('btn-line-numbers')?.addEventListener('click', () => notebook.toggleLineNumbers());
}