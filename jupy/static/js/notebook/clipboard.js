/**
 * notebook/clipboard.js
 * Cut, copy, paste cells.
 */
export function createClipboard(state, operations, selection) {
  let clipboardData = null;

  function copyCells() {
    const indices = state.getSelectedIndices();
    if (indices.length === 0) return;
    const data = indices.map(i => ({
      content: state.cells[i].cm.getValue(),
      type: state.cells[i].type,
    }));
    clipboardData = data;
    navigator.clipboard.writeText(JSON.stringify(data)).catch(() => {});
  }

  function cutCells() {
    copyCells();
    const indices = state.getSelectedIndices().sort((a, b) => b - a);
    for (const i of indices) {
      operations.deleteCell(state.cells[i].id, true);
    }
    selection.deselectAll();
  }

  function pasteCells() {
    if (!clipboardData) {
      navigator.clipboard.readText().then(text => {
        try {
          const data = JSON.parse(text);
          if (Array.isArray(data)) {
            clipboardData = data;
            doPaste();
          }
        } catch (e) {}
      }).catch(() => {});
      return;
    }
    doPaste();
  }

  function doPaste() {
    if (!clipboardData) return;
    const idx = state.selectedId ? state.indexOf(state.selectedId) + 1 : state.cells.length;
    let insertIdx = idx;
    clipboardData.forEach((item, i) => {
      operations.insertCellAt(insertIdx + i, item.content, { type: item.type || 'code' });
    });
    clipboardData = null;
    selection.deselectAll();
  }

  return { copyCells, cutCells, pasteCells };
}
