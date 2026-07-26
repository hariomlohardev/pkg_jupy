/**
 * notebook/operations.js
 * Cell insertion, deletion, movement, merge, split.
 */
import { clearCellOutput } from '../cells/cellOutput.js';

export function createOperations(state, buildCell, reorderDom, selectCell, showToast, runSocket) {
  const { cells, indexOf, getCell, getSelectedIndices, pushOperation, executionQueue, runningCellId } = state;

  function insertCellAt(index, source = '', { focus = false, type = 'code' } = {}) {
    const cell = buildCell(source, type);
    cells.splice(index, 0, cell);
    reorderDom();
    cell.cm.refresh();
    if (focus) {
      // We need enterEditMode – we'll call it from selection module via callback
      // but here we just select and focus
      selectCell(cell.id);
      cell.cm.focus();
    } else {
      selectCell(cell.id);
    }
    cell.dom.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    pushOperation({ type: 'insert', data: { index, cellId: cell.id, source, type } });
    return cell;
  }

  function deleteCell(id, silent = false) {
    if (id === runningCellId) {
      if (runSocket.isOpen) runSocket.send({ action: 'interrupt' });
      runningCellId = null;
      if (!silent) showToast('⚠️ RUNNING CELL DELETED & TERMINATED', 'danger');
    }
    const qIdx = executionQueue.indexOf(id);
    if (qIdx !== -1) executionQueue.splice(qIdx, 1);

    const idx = indexOf(id);
    if (idx === -1) return;
    const cell = cells[idx];
    const source = cell.cm.getValue();
    const type = cell.type;
    cell.dom.root.remove();
    cell.dom.insertBar.remove();
    cells.splice(idx, 1);
    state.selectedIds = state.selectedIds.filter(cid => cid !== id);
    if (cells.length === 0) {
      insertCellAt(0, '', { focus: true });
    } else {
      const newIdx = Math.min(idx, cells.length - 1);
      selectCell(cells[newIdx].id);
    }
    if (!silent) pushOperation({ type: 'delete', data: { index: idx, cellId: id, source, type } });
  }

  function moveCell(id, delta) {
    const idx = indexOf(id);
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= cells.length) return;
    const [cell] = cells.splice(idx, 1);
    cells.splice(newIdx, 0, cell);
    reorderDom();
    selectCell(id);
    pushOperation({ type: 'move', data: { id, from: idx, to: newIdx } });
  }

  function mergeSelectedCells() {
    const indices = getSelectedIndices().sort((a, b) => a - b);
    if (indices.length < 2) return;
    const firstIdx = indices[0];
    let mergedContent = '';
    const removedIds = [];
    for (let i = indices.length - 1; i > 0; i--) {
      const idx = indices[i];
      const cell = cells[idx];
      mergedContent = cell.cm.getValue() + '\n' + mergedContent;
      removedIds.push(cell.id);
      deleteCell(cell.id, true);
    }
    const firstCell = cells[firstIdx];
    const existing = firstCell.cm.getValue();
    firstCell.cm.setValue(existing + (existing ? '\n' : '') + mergedContent);
    selectCell(firstCell.id);
    pushOperation({
      type: 'merge',
      data: { first: firstCell.id, removed: removedIds, before: existing, after: firstCell.cm.getValue() }
    });
  }

  function splitCellAtCursor(id) {
    const cell = getCell(id);
    if (!cell) return;
    const cm = cell.cm;
    const cursor = cm.getCursor();
    const line = cursor.line;
    const content = cm.getValue();
    const lines = content.split('\n');
    const before = lines.slice(0, line).join('\n');
    const after = lines.slice(line).join('\n');
    cm.setValue(before);
    const newCell = insertCellAt(indexOf(id) + 1, after, { focus: true });
    pushOperation({ type: 'split', data: { id, before, after, newId: newCell.id } });
  }

  return {
    insertCellAt,
    deleteCell,
    moveCell,
    mergeSelectedCells,
    splitCellAtCursor,
  };
}
