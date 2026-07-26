/**
 * notebook/selection.js
 * Selection logic (single, range, multi).
 */
export function createSelection(state, updateSelectionUI) {
  const { cells, selectedId, editingId, selectedIds, lastSelectedId } = state;

  function selectCell(id, additive = false, range = false) {
    if (!additive) {
      selectedIds.length = 0;
      cells.forEach(c => c.dom.root.classList.remove('selected'));
    }
    if (!id) return;
    const idx = state.indexOf(id);
    if (idx === -1) return;
    if (range && lastSelectedId) {
      const lastIdx = state.indexOf(lastSelectedId);
      const start = Math.min(idx, lastIdx);
      const end = Math.max(idx, lastIdx);
      if (!additive) {
        selectedIds.length = 0;
        cells.forEach(c => c.dom.root.classList.remove('selected'));
      }
      for (let i = start; i <= end; i++) {
        const cid = cells[i].id;
        if (!selectedIds.includes(cid)) {
          selectedIds.push(cid);
          cells[i].dom.root.classList.add('selected');
        }
      }
    } else {
      if (!selectedIds.includes(id)) {
        selectedIds.push(id);
        const cell = state.getCell(id);
        if (cell) cell.dom.root.classList.add('selected');
      }
    }
    state.lastSelectedId = id;
    state.selectedId = id;
    state.editingId = null;
    if (updateSelectionUI) updateSelectionUI();
  }

  function deselectAll() {
    selectedIds.length = 0;
    cells.forEach(c => c.dom.root.classList.remove('selected'));
    state.lastSelectedId = null;
    if (updateSelectionUI) updateSelectionUI();
  }

  function selectAdjacent(delta) {
    if (!state.selectedId) return;
    const idx = state.indexOf(state.selectedId);
    const newIdx = Math.min(cells.length - 1, Math.max(0, idx + delta));
    selectCell(cells[newIdx].id, false, false);
  }

  function enterEditMode(id) {
    state.selectedId = id;
    state.editingId = id;
    cells.forEach((c) => {
      c.dom.root.classList.toggle('editing', c.id === id);
      c.dom.root.classList.toggle('selected', c.id === id);
    });
  }

  function exitEditMode(id) {
    const cell = state.getCell(id);
    cell?.cm.getInputField().blur();
    selectCell(id);
  }

  return {
    selectCell,
    deselectAll,
    selectAdjacent,
    enterEditMode,
    exitEditMode,
  };
}
