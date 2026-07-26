export function createUndoRedo(state, operations, selection) {
  const { undoStack, redoStack, pushOperation } = state;

  function applyReverse(op) {
    switch (op.type) {
      case 'insert':
        operations.deleteCell(op.data.cellId, true);
        break;
      case 'delete':
        operations.insertCellAt(op.data.index, op.data.source, { type: op.data.type, silent: true });
        break;
      case 'move': {
        const idx = state.indexOf(op.data.id);
        if (idx !== -1) {
          const [moved] = state.cells.splice(idx, 1);
          state.cells.splice(op.data.from, 0, moved);
          selection.selectCell(op.data.id);
        }
        break;
      }
      case 'merge': {
        const firstCell = state.getCell(op.data.first);
        if (firstCell) firstCell.cm.setValue(op.data.before);
        // B1: re-insert removed cells in their ORIGINAL order, forward.
        const removedData = op.data.removedData || [];
        let insertIdx = state.indexOf(op.data.first) + 1;
        for (const data of removedData) {
          operations.insertCellAt(insertIdx, data.source, { type: data.type, silent: true });
          insertIdx++;
        }
        break;
      }
      case 'split': {
        const original = state.getCell(op.data.id);
        if (original) original.cm.setValue(op.data.before + '\n' + op.data.after);
        if (op.data.newId) operations.deleteCell(op.data.newId, true);
        break;
      }
    }
  }

  function applyForward(op) {
    switch (op.type) {
      case 'insert':
        operations.insertCellAt(op.data.index, op.data.source, { type: op.data.type, silent: true });
        break;
      case 'delete': {
        const cell = state.cells[op.data.index];
        if (cell) operations.deleteCell(cell.id, true);
        break;
      }
      case 'move': {
        const idx = state.indexOf(op.data.id);
        if (idx !== -1) {
          const [moved] = state.cells.splice(idx, 1);
          state.cells.splice(op.data.to, 0, moved);
          selection.selectCell(op.data.id);
        }
        break;
      }
      case 'merge': {
        const firstCell = state.getCell(op.data.first);
        if (firstCell) {
          (op.data.removed || []).forEach(id => {
            if (state.getCell(id)) operations.deleteCell(id, true);
          });
          firstCell.cm.setValue(op.data.after);
        }
        break;
      }
      case 'split': {
        const original = state.getCell(op.data.id);
        if (original) {
          original.cm.setValue(op.data.before);
          const idx = state.indexOf(op.data.id) + 1;
          operations.insertCellAt(idx, op.data.after, { type: op.data.type, silent: true });
        }
        break;
      }
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