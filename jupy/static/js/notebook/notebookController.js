/**
 * notebook/notebookController.js
 * Owns all notebook state.
 */
import { createCell } from '../cells/cellFactory.js';
import { clearCellOutput, appendCellOutput, appendCellPlot, appendCellStdinPrompt } from '../cells/cellOutput.js';

/**
 * @param {object} deps
 * @param {HTMLElement} deps.container
 * @param {{cellTemplate: HTMLTemplateElement, insertBarTemplate: HTMLTemplateElement}} deps.templates
 * @param {import('../core/socket.js').ReconnectingSocket} deps.runSocket
 * @param {(message: string, type?: string) => void} deps.showToast
 * @param {(cm: any) => void} deps.registerAutocomplete
 * @param {() => void} [deps.onCellChange] - called whenever any cell's code changes
 */
export function createNotebookController({ container, templates, runSocket, showToast, registerAutocomplete, onCellChange }) {
  const cells = [];
  let idCounter = 0;
  let selectedId = null;
  let editingId = null;
  let runningCellId = null;
  const executionQueue = [];

  function indexOf(id) {
    return cells.findIndex((c) => c.id === id);
  }
  function getCell(id) {
    return cells.find((c) => c.id === id);
  }

  function reorderDom() {
    cells.forEach((c) => {
      container.appendChild(c.dom.root);
      container.appendChild(c.dom.insertBar);
    });
  }

  function buildCell(source) {
    const id = 'cell-' + (++idCounter);
    return createCell(
      id,
      source,
      templates,
      {
        onRun: (cellId, opts) => runCell(cellId, opts),
        onRunButtonClick: (cellId) => {
          if (runningCellId === cellId) {
            runSocket.send({ action: 'interrupt' });
          } else {
            runCell(cellId, { advance: false });
          }
        },
        onMove: (cellId, delta) => moveCell(cellId, delta),
        onDelete: (cellId) => deleteCell(cellId),
        onSelect: (cellId) => selectCell(cellId),
        onEnterEdit: (cellId) => enterEditMode(cellId),
        onExitEdit: (cellId) => exitEditMode(cellId),
        onInsertAfter: (cellId) => insertCellAt(indexOf(cellId) + 1, '', { focus: true }),
        onCellChange: (cellId) => {
          // Forward to the external callback if provided
          if (onCellChange) onCellChange();
        },
      },
      registerAutocomplete
    );
  }

  function insertCellAt(index, source = '', { focus = false } = {}) {
    const cell = buildCell(source);
    cells.splice(index, 0, cell);
    reorderDom();
    cell.cm.refresh();
    if (focus) {
      enterEditMode(cell.id);
      cell.cm.focus();
    } else {
      selectCell(cell.id);
    }
    cell.dom.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return cell;
  }

  function deleteCell(id) {
    if (id === runningCellId) {
      if (runSocket.isOpen) runSocket.send({ action: 'interrupt' });
      runningCellId = null;
      showToast('⚠️ RUNNING CELL DELETED & TERMINATED', 'danger');
    }

    const qIdx = executionQueue.indexOf(id);
    if (qIdx !== -1) executionQueue.splice(qIdx, 1);

    if (cells.length === 1) {
      const cell = cells[0];
      cell.cm.setValue('');
      clearCellOutput(cell);
      cell.execCount = null;
      cell.dom.execCountEl.textContent = '[\u00A0]';
      selectCell(cell.id);
      return;
    }
    const idx = indexOf(id);
    const cell = cells[idx];
    cell.dom.root.remove();
    cell.dom.insertBar.remove();
    cells.splice(idx, 1);
    selectCell(cells[Math.min(idx, cells.length - 1)].id);
  }

  function moveCell(id, delta) {
    const idx = indexOf(id);
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= cells.length) return;
    const [cell] = cells.splice(idx, 1);
    cells.splice(newIdx, 0, cell);
    reorderDom();
    selectCell(id);
  }

  function selectCell(id) {
    selectedId = id;
    editingId = null;
    cells.forEach((c) => {
      c.dom.root.classList.toggle('selected', c.id === id);
      c.dom.root.classList.remove('editing');
    });
  }

  function enterEditMode(id) {
    selectedId = id;
    editingId = id;
    cells.forEach((c) => {
      c.dom.root.classList.toggle('editing', c.id === id);
      c.dom.root.classList.toggle('selected', c.id === id);
    });
  }

  function exitEditMode(id) {
    const cell = getCell(id);
    cell?.cm.getInputField().blur();
    selectCell(id);
  }

  function selectAdjacent(delta) {
    if (!selectedId) return;
    const idx = indexOf(selectedId);
    const newIdx = Math.min(cells.length - 1, Math.max(0, idx + delta));
    selectCell(cells[newIdx].id);
  }

  function advanceSelectionAfter(idx) {
    if (idx === cells.length - 1) {
      insertCellAt(idx + 1, '', { focus: true });
    } else {
      document.activeElement?.blur();
      const next = cells[idx + 1];
      enterEditMode(next.id);
      next.cm.focus();
      next.dom.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function runCell(id, { advance = false, insertBelow = false } = {}) {
    const cell = getCell(id);
    if (!cell) return;

    if (!runSocket.isOpen) {
      showToast('⚠️ NOT CONNECTED TO KERNEL — RECONNECTING…', 'danger');
      return;
    }

    const idx = indexOf(id);

    if (runningCellId === id) {
      showToast('⚠️ CELL ALREADY RUNNING', 'warning');
      if (advance) advanceSelectionAfter(idx);
      return;
    }

    if (runningCellId !== null) {
      if (!executionQueue.includes(id)) {
        executionQueue.push(id);
        cell.dom.root.classList.add('queued');
        cell.dom.execCountEl.textContent = '[*]';
        cell.dom.runBtn.textContent = '⏳';
        cell.dom.runBtn.title = 'Queued to run next';
        showToast('⏳ CELL QUEUED TO RUN NEXT', 'warning');
      } else {
        showToast('⚠️ CELL ALREADY QUEUED', 'warning');
      }

      if (advance) advanceSelectionAfter(idx);
      return;
    }

    executeNextInQueue(id);

    if (insertBelow) {
      insertCellAt(idx + 1, '', { focus: true });
    } else if (advance) {
      advanceSelectionAfter(idx);
    } else {
      selectCell(id);
    }
  }

  function executeNextInQueue(id) {
    const cell = getCell(id);
    if (!cell) return;

    runningCellId = id;
    cell.dom.root.classList.remove('queued');
    cell.dom.root.classList.add('running');
    cell.dom.runBtn.textContent = '⏹';
    cell.dom.runBtn.title = 'Interrupt Execution';
    cell.dom.execCountEl.textContent = '[*]';
    clearCellOutput(cell);

    runSocket.send({ action: 'run', code: cell.cm.getValue() });
  }

  function handleRunMessage(data) {
    if (!runningCellId) return;
    const cell = getCell(runningCellId);
    if (!cell) return;

    if (data.type === 'stdout') appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stdout');
    if (data.type === 'stderr') appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stderr');
    if (data.type === 'plot') appendCellPlot(cell, data.html);
    if (data.type === 'stdin_request') {
      appendCellStdinPrompt(cell, data.prompt, (value) => {
        runSocket.send({ action: 'stdin_reply', value });
      });
    }

    if (data.type === 'complete') {
      cell.dom.root.classList.remove('running', 'queued');
      cell.dom.runBtn.textContent = '▶';
      cell.dom.runBtn.title = 'Run cell (Shift+Enter)';
      cell.execCount = data.exec_count;
      cell.dom.execCountEl.textContent = `[${cell.execCount}]`;
      runningCellId = null;

      if (executionQueue.length > 0) {
        const nextId = executionQueue.shift();
        executeNextInQueue(nextId);
      }
    }
  }

  async function performRestart() {
    try {
      const res = await fetch('/api/restart', { method: 'POST' });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      cells.forEach((c) => {
        c.execCount = null;
        c.dom.execCountEl.textContent = '[\u00A0]';
        clearCellOutput(c);
      });
      return true;
    } catch (err) {
      console.error('Kernel restart failed:', err);
      showToast('⚠️ FAILED TO RESTART KERNEL', 'danger');
      return false;
    }
  }

  function restartKernel() {
    performRestart().then((ok) => {
      if (ok) showToast('🔄 KERNEL RESTARTED', 'danger');
    });
  }

  function interruptKernel() {
    if (runSocket.isOpen) {
      runSocket.send({ action: 'interrupt' });
      showToast('⏹ EXECUTION INTERRUPTED', 'danger');
    }
  }

  function runAll() {
    [...cells].forEach((cell) => runCell(cell.id, { advance: false }));
  }

  async function restartAndRunAll() {
    const ok = await performRestart();
    if (ok) {
      showToast('🔄 KERNEL RESTARTED — RUNNING ALL CELLS', 'danger');
      runAll();
    }
  }

  async function restartAndRunToSelected() {
    let targetIdx = selectedId ? indexOf(selectedId) : -1;
    if (targetIdx === -1) {
      cells.forEach((c, i) => {
        if (c.execCount != null) targetIdx = i;
      });
    }
    if (targetIdx === -1) targetIdx = 0;

    const ok = await performRestart();
    if (ok) {
      showToast('🔄 KERNEL RESTARTED — RUNNING TO SELECTED CELL', 'danger');
      cells.slice(0, targetIdx + 1).forEach((c) => runCell(c.id, { advance: false }));
    }
  }

  function loadNotebook(sources) {
    cells.forEach((c) => {
      c.dom.root.remove();
      c.dom.insertBar.remove();
    });
    cells.length = 0;
    runningCellId = null;
    executionQueue.length = 0;

    const list = sources && sources.length ? sources : [''];
    list.forEach((src) => cells.push(buildCell(src)));

    reorderDom();
    cells.forEach((c) => c.cm.refresh());
    selectCell(cells[0].id);
  }

  return {
    insertCellAt,
    deleteCell,
    moveCell,
    selectCell,
    enterEditMode: (id) => {
      enterEditMode(id);
      getCell(id).cm.focus();
    },
    exitEditMode,
    selectAdjacent,
    runCell,
    restartKernel,
    restartAndRunAll,
    restartAndRunToSelected,
    interruptKernel,
    runAll,
    loadNotebook,
    handleRunMessage,
    refreshAllEditors: () => cells.forEach((c) => c.cm.refresh()),
    getSelectedId: () => selectedId,
    getEditingId: () => editingId,
    getCells: () => cells,
  };
}