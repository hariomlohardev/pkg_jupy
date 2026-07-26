/**
 * notebook/controller.js
 * Main notebook controller – combines all sub-modules and exposes public API.
 */
import { createState } from './state.js';
import { createOperations } from './operations.js';
import { createSelection } from './selection.js';
import { createExecution } from './execution.js';
import { createClipboard } from './clipboard.js';
import { createUndoRedo } from './undoRedo.js';
import { createDnD } from './dnd.js';
import { createFindReplace } from './findReplace.js';
import { createStatus } from './status.js';
import { createPresentation } from './presentation.js';
import { createLineNumbers } from './lineNumbers.js';
import { createCell } from '../cells/cellFactory.js';

export function createNotebookController({
  container,
  templates,
  runSocket,
  showToast,
  registerAutocomplete,
  onCellChange,
}) {
  // ===== State =====
  const state = createState();

  // ===== Reorder DOM =====
  function reorderDom() {
    state.cells.forEach(c => {
      container.appendChild(c.dom.root);
      container.appendChild(c.dom.insertBar);
    });
  }

  // ===== Build cell =====
  function buildCell(source, type = 'code') {
    const id = 'cell-' + (++state.idCounter);
    return createCell(
      id,
      source,
      templates,
      {
        onRun: (cellId, opts) => execution.runCell(cellId, opts),
        onRunButtonClick: (cellId) => {
          if (state.runningCellId === cellId) {
            runSocket.send({ action: 'interrupt' });
          } else {
            execution.runCell(cellId, { advance: false });
          }
        },
        onMove: (cellId, delta) => operations.moveCell(cellId, delta),
        onDelete: (cellId) => operations.deleteCell(cellId),
        onSelect: (cellId) => selection.selectCell(cellId),
        onEnterEdit: (cellId) => selection.enterEditMode(cellId),
        onExitEdit: (cellId) => selection.exitEditMode(cellId),
        onInsertAfter: (cellId) => operations.insertCellAt(state.indexOf(cellId) + 1, '', { focus: true }),
        onCellChange: (cellId) => { if (onCellChange) onCellChange(); },
        onDragStart: (cellId, e) => { e.dataTransfer.setData('text/plain', cellId); },
        onDragEnd: () => {},
      },
      registerAutocomplete
    );
  }

  // ===== Create sub-modules =====
  const operations = createOperations(state, buildCell, reorderDom, selection.selectCell, showToast, runSocket);
  const selection = createSelection(state, updateSelectionUI);
  const execution = createExecution(state, runSocket, showToast, setStatus, operations, selection);
  const clipboard = createClipboard(state, operations, selection);
  const undoRedo = createUndoRedo(state, operations, selection);
  const dnd = createDnD(container, state, operations, selection);
  const findReplace = createFindReplace(state);
  const status = createStatus(state);
  const presentation = createPresentation();
  const lineNumbers = createLineNumbers(state);

  // ===== UI update helper =====
  function updateSelectionUI() {
    const count = state.selectedIds.length;
    const selInfo = document.getElementById('selection-info');
    if (selInfo) selInfo.textContent = count > 0 ? `${count} selected` : '';
  }

  // ===== Set status =====
  function setStatus(newStatus) {
    status.setStatus(newStatus);
  }

  // ===== Public API =====
  return {
    // Existing
    insertCellAt: operations.insertCellAt,
    deleteCell: operations.deleteCell,
    moveCell: operations.moveCell,
    selectCell: selection.selectCell,
    enterEditMode: (id) => { selection.enterEditMode(id); state.getCell(id).cm.focus(); },
    exitEditMode: selection.exitEditMode,
    selectAdjacent: selection.selectAdjacent,
    runCell: execution.runCell,
    handleRunMessage: execution.handleRunMessage,
    runAll: execution.runAll,
    restartKernel: () => { /* implemented in app.js */ },
    restartAndRunAll: () => { /* implemented in app.js */ },
    restartAndRunToSelected: () => { /* implemented in app.js */ },
    interruptKernel: () => { /* implemented in app.js */ },
    loadNotebook: (sources) => { /* implemented in app.js */ },
    refreshAllEditors: () => state.cells.forEach(c => c.cm.refresh()),
    getSelectedId: () => state.selectedId,
    getEditingId: () => state.editingId,
    getCells: () => state.cells,

    // New
    getSelectedIds: () => state.selectedIds,
    getSelectedIndices: state.getSelectedIndices,
    deselectAll: selection.deselectAll,
    copyCells: clipboard.copyCells,
    cutCells: clipboard.cutCells,
    pasteCells: clipboard.pasteCells,
    undo: undoRedo.undo,
    redo: undoRedo.redo,
    mergeSelectedCells: operations.mergeSelectedCells,
    splitCellAtCursor: operations.splitCellAtCursor,
    findInNotebook: findReplace.findInNotebook,
    replaceInNotebook: findReplace.replaceInNotebook,
    toggleLineNumbers: lineNumbers.toggle,
    togglePresentation: presentation.toggle,
    setStatus,
  };
}
