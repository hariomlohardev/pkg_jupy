/**
 * notebook/undoRedo.js
 * Undo/Redo for cell operations.
 */
export function createUndoRedo(state, operations, selection) {
  const { undoStack, redoStack, pushOperation } = state;

  function applyReverse(op) {
    switch (op.type) {
      case 'insert':
        operations.deleteCell(op.data.cellId, true);
        break;
      case 'delete':
        // re-insert
        operations.insertCellAt(op.data.index, op.data.source, { type: op.data.type });
        break;
      case 'move':
        const c = state.getCell(op.data.id);
        if (c) {
          const idx = state.indexOf(op.data.id);
          const [moved] = state.cells.splice(idx, 1);
          state.cells.splice(op.data.from, 0, moved);
          // reorderDOM is called inside operations.moveCell, but we need to reorder here
          // We'll call it manually via a callback? We'll just call selection.selectCell to refresh.
          selection.selectCell(op.data.id);
        }
        break;
      case 'merge':
        // restore removed cells
        // complex – skip for now
        break;
      case 'split':
        const splitCell = state.getCell(op.data.newId);
        if (splitCell) {
          const before = op.data.before;
          const after = splitCell.cm.getValue();
          const merged = before + '\n' + after;
          const origCell = state.getCell(op.data.id);
          if (origCell) {
            origCell.cm.setValue(merged);
            operations.deleteCell(op.data.newId, true);
          }
        }
        break;
    }
  }

  function applyForward(op) {
    switch (op.type) {
      case 'insert':
        // redo insert: insert again at same index
        operations.insertCellAt(op.data.index, op.data.source, { type: op.data.type });
        break;
      case 'delete':
        // redo delete: delete the cell again (it should be at the index)
        const cell = state.cells[op.data.index];
        if (cell) operations.deleteCell(cell.id, true);
        break;
      case 'move':
        // redo move: move again
        const c = state.getCell(op.data.id);
        if (c) {
          const idx = state.indexOf(op.data.id);
          const [moved] = state.cells.splice(idx, 1);
          state.cells.splice(op.data.to, 0, moved);
          selection.selectCell(op.data.id);
        }
        break;
      case 'merge':
        // re-merge
        // not implemented
        break;
      case 'split':
        // re-split
        const orig = state.getCell(op.data.id);
        if (orig) {
          // restore original content, then split again
          // We'll need to use splitCellAtCursor again, but with stored data.
        }
        break;
    }
  }

  function undo() {
    if (undoStack.length === 0) return;
    const op = undoStack.pop();
    redoStack.push(op);
    applyReverse(op);
  }

  function redo() {
    if (redoStack.length === 0) return;
    const op = redoStack.pop();
    undoStack.push(op);
    applyForward(op);
  }

  return { undo, redo };
}
