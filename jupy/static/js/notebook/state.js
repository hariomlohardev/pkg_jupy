/**
 * notebook/state.js
 * Core state: cells, counters, selection, undo/redo stacks.
 */
import { clearCellOutput } from '../cells/cellOutput.js';

export function createState() {
  const cells = [];
  let idCounter = 0;
  let selectedId = null;
  let editingId = null;
  let runningCellId = null;
  const executionQueue = [];
  let selectedIds = [];
  let lastSelectedId = null;
  const undoStack = [];
  const redoStack = [];
  const MAX_UNDO = 100;

  function indexOf(id) {
    return cells.findIndex(c => c.id === id);
  }

  function getCell(id) {
    return cells.find(c => c.id === id);
  }

  function getSelectedIndices() {
    return selectedIds.map(id => indexOf(id)).filter(i => i !== -1).sort((a, b) => a - b);
  }

  function pushOperation(op) {
    undoStack.push(op);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
  }

  return {
    cells,
    idCounter,
    selectedId,
    editingId,
    runningCellId,
    executionQueue,
    selectedIds,
    lastSelectedId,
    undoStack,
    redoStack,
    MAX_UNDO,
    indexOf,
    getCell,
    getSelectedIndices,
    pushOperation,
  };
}
