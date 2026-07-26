export function createUndoRedo(state, operations, selection) {
  const { undoStack, redoStack, pushOperation } = state;

  function applyReverse(op) {
    switch (op.type) {
      case 'insert':
        operations.deleteCell(op.data.cellId, true);
        break;
      case 'delete':
        operations.insertCellAt(op.data.index, op.data.source, { type: op.data.type });
        break;
      case 'move': {
        const c = state.getCell(op.data.id);
        if (c) {
          const idx = state.indexOf(op.data.id);
          const [moved] = state.cells.splice(idx, 1);
          state.cells.splice(op.data.from, 0, moved);
          selection.selectCell(op.data.id);
        }
        break;
      }
      case 'merge': {
        const firstCell = state.getCell(op.data.first);
        if (firstCell) {
          firstCell.cm.setValue(op.data.before);
        }
        const removedData = op.data.removedData || [];
        for (let i = removedData.length - 1; i >= 0; i--) {
          const data = removedData[i];
          const idx = state.indexOf(op.data.first) + 1;
          operations.insertCellAt(idx, data.source, { type: data.type });
        }
        break;
      }
      case 'split': {
        const original = state.getCell(op.data.id);
        if (original) {
          original.cm.setValue(op.data.before + '\n' + op.data.after);
        }
        const newCell = state.getCell(op.data.newId);
        if (newCell) operations.deleteCell(op.data.newId, true);
        break;
      }
    }
  }

  function applyForward(op) {
    switch (op.type) {
      case 'insert':
        operations.insertCellAt(op.data.index, op.data.source, { type: op.data.type });
        break;
      case 'delete': {
        const cell = state.cells[op.data.index];
        if (cell) operations.deleteCell(cell.id, true);
        break;
      }
      case 'move': {
        const c = state.getCell(op.data.id);
        if (c) {
          const idx = state.indexOf(op.data.id);
          const [moved] = state.cells.splice(idx, 1);
          state.cells.splice(op.data.to, 0, moved);
          selection.selectCell(op.data.id);
        }
        break;
      }
      case 'merge': {
        const firstCell = state.getCell(op.data.first);
        if (firstCell) {
          const removedIds = op.data.removed || [];
          removedIds.forEach(id => {
            const cell = state.getCell(id);
            if (cell) operations.deleteCell(id, true);
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
          operations.insertCellAt(idx, op.data.after, { type: op.data.type });
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