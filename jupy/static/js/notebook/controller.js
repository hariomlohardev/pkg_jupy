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

   // ===== Helper to update selection UI =====
   function updateSelectionUI() {
     const count = state.selectedIds.length;
     const selInfo = document.getElementById('selection-info');
     if (selInfo) selInfo.textContent = count > 0 ? `${count} selected` : '';
   }

   // ===== Reorder DOM =====
   function reorderDom() {
     state.cells.forEach(c => {
       container.appendChild(c.dom.root);
       container.appendChild(c.dom.insertBar);
     });
   }

   // ===== Selection =====
   const selection = createSelection(state, updateSelectionUI);

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
       registerAutocomplete,
       type
     );
   }

   // ===== Operations =====
   const operations = createOperations(state, buildCell, reorderDom, selection.selectCell, showToast, runSocket);

   // ===== Status =====
   const status = createStatus(state);
   function setStatus(newStatus) {
     status.setStatus(newStatus);
   }

   // ===== Execution (depends on operations) =====
   const execution = createExecution(state, runSocket, showToast, setStatus, operations, selection);

   // ===== Clipboard =====
   const clipboard = createClipboard(state, operations, selection);

   // ===== Undo/Redo =====
   const undoRedo = createUndoRedo(state, operations, selection);

   // ===== Other modules =====
   const dnd = createDnD(container, state, operations, selection);
   const findReplace = createFindReplace(state);
   const presentation = createPresentation();
   const lineNumbers = createLineNumbers(state);

   // ===== Load notebook =====
   function loadNotebook(cellDataArray) {
     while (state.cells.length > 0) {
       operations.deleteCell(state.cells[0].id, true);
     }
     cellDataArray.forEach((item, index) => {
       const type = item.type || 'code';
       const source = item.source || '';
       // silent:true → loading a file must not create undo history
       operations.insertCellAt(index, source, { type, silent: true });
     });
     // B3: opening a notebook must not leave the previous notebook's history
     // (or the load's own insert ops) on the undo/redo stacks.
     state.undoStack.length = 0;
     state.redoStack.length = 0;
     if (state.cells.length > 0) {
       selection.selectCell(state.cells[0].id);
       state.cells[0].cm.focus();
     }
   }

   // ===== Public API =====
   return {
     insertCellAt: operations.insertCellAt,
     deleteCell: operations.deleteCell,
     moveCell: operations.moveCell,
     selectCell: selection.selectCell,
     enterEditMode: (id) => {
       selection.enterEditMode(id);
       const cell = state.getCell(id);
       if (!cell) return;
       // Markdown cells need to swap preview -> editor; code cells just focus.
       if (typeof cell.enterEdit === 'function') {
         cell.enterEdit();
       } else {
         cell.cm.focus();
       }
     },
     exitEditMode: selection.exitEditMode,
     selectAdjacent: selection.selectAdjacent,
     runCell: execution.runCell,
     handleRunMessage: execution.handleRunMessage,
     runAll: execution.runAll,
     restartKernel: () => { /* implemented in app.js */ },
     restartAndRunAll: () => { /* implemented in app.js */ },
     restartAndRunToSelected: () => { /* implemented in app.js */ },
     interruptKernel: () => { /* implemented in app.js */ },
     loadNotebook,
     refreshAllEditors: () => state.cells.forEach(c => c.cm.refresh()),
     getSelectedId: () => state.selectedId,
     getEditingId: () => state.editingId,
     getCells: () => state.cells,
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
     executeNextInQueue: execution.executeNextInQueue,
     clearExecutionQueue: execution.clearExecutionQueue,
   };
 }