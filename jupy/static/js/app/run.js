/**
 * app/run.js – Run dropdown handlers
 */
export function initRunDropdown(notebook) {
  document.getElementById('run-all')?.addEventListener('click', () => notebook.runAll());
  document.getElementById('run-above')?.addEventListener('click', () => {
    const selectedId = notebook.getSelectedId();
    if (!selectedId) return;
    const cells = notebook.getCells();
    const idx = cells.findIndex(c => c.id === selectedId);
    if (idx === -1) return;
    cells.slice(0, idx).forEach(c => notebook.runCell(c.id, { advance: false }));
  });
  document.getElementById('run-below')?.addEventListener('click', () => {
    const selectedId = notebook.getSelectedId();
    if (!selectedId) return;
    const cells = notebook.getCells();
    const idx = cells.findIndex(c => c.id === selectedId);
    if (idx === -1) return;
    cells.slice(idx + 1).forEach(c => notebook.runCell(c.id, { advance: false }));
  });
  document.getElementById('run-selected')?.addEventListener('click', () => {
    const ids = notebook.getSelectedIds();
    if (ids.length === 0) return;
    ids.forEach(id => notebook.runCell(id, { advance: false }));
  });
  document.getElementById('run-cell-keep-going')?.addEventListener('click', () => {
    const id = notebook.getSelectedId();
    if (!id) return;
    notebook.runCell(id, { advance: true });
  });
}
