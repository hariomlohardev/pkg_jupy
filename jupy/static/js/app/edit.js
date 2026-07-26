/**
 * app/edit.js – Edit dropdown handlers
 */
export function initEditDropdown(notebook, showToast) {
  document.getElementById('btn-undo')?.addEventListener('click', () => {
    notebook.undo();
  });
  document.getElementById('btn-redo')?.addEventListener('click', () => {
    notebook.redo();
  });
  document.getElementById('btn-merge')?.addEventListener('click', () => {
    notebook.mergeSelectedCells();
  });
  document.getElementById('btn-split')?.addEventListener('click', () => {
    const id = notebook.getSelectedId();
    if (id) notebook.splitCellAtCursor(id);
  });
  document.getElementById('btn-find')?.addEventListener('click', () => {
    toggleFindBar();
  });
  document.getElementById('btn-line-numbers')?.addEventListener('click', () => {
    notebook.toggleLineNumbers();
  });
}

let findBarVisible = false;
function toggleFindBar() {
  const bar = document.getElementById('find-bar');
  if (bar) {
    findBarVisible = !findBarVisible;
    bar.style.display = findBarVisible ? 'flex' : 'none';
    if (findBarVisible) {
      const input = document.getElementById('find-input');
      if (input) setTimeout(() => input.focus(), 50);
    }
  }
}
