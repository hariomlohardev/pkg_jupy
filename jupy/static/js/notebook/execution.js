import {
  clearCellOutput,
  appendCellOutput,
  appendCellPlot,
  appendCellStdinPrompt,
  appendDisplayData,
  appendWidget
} from '../cells/cellOutput.js';

export function createExecution(state, runSocket, showToast, setStatus, operations, selection) {
  const { cells, indexOf, getCell, executionQueue } = state;

  function executeNextInQueue(id) {
    const cell = getCell(id);
    if (!cell) return;
    state.runningCellId = id;
    cell.dom.root.classList.remove('queued');
    cell.dom.root.classList.add('running');
    cell.dom.runBtn.textContent = '⏹';
    cell.dom.runBtn.title = 'Interrupt Execution';
    cell.dom.execCountEl.textContent = '[*]';
    clearCellOutput(cell);
    runSocket.send({ action: 'run', code: cell.cm.getValue() });
  }

  function advanceSelectionAfter(idx) {
    if (idx === cells.length - 1) {
      operations.insertCellAt(idx + 1, '', { focus: true });
    } else {
      document.activeElement?.blur();
      const next = cells[idx + 1];
      selection.enterEditMode(next.id);
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
    if (state.runningCellId === id) {
      showToast('⚠️ CELL ALREADY RUNNING', 'warning');
      if (advance) advanceSelectionAfter(idx);
      return;
    }
    if (state.runningCellId !== null) {
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
      operations.insertCellAt(idx + 1, '', { focus: true });
    } else if (advance) {
      advanceSelectionAfter(idx);
    } else {
      selection.selectCell(id);
    }
  }

  function handleRunMessage(data) {
    if (!state.runningCellId) return;
    const cell = getCell(state.runningCellId);
    if (!cell) return;

    if (data.type === 'stdout') appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stdout');
    else if (data.type === 'stderr') appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stderr');
    else if (data.type === 'plot') appendCellPlot(cell, data.html);
    else if (data.type === 'display') appendDisplayData(cell, data.data);
    else if (data.type === 'widget') appendWidget(cell, data.data);
    else if (data.type === 'stdin_request') {
      appendCellStdinPrompt(cell, data.prompt, (value) => {
        runSocket.send({ action: 'stdin_reply', value });
      });
    } else if (data.type === 'load') {
      if (data.data && data.data.content) {
        cell.cm.setValue(data.data.content);
        showToast('📄 Loaded file content into cell', 'success');
      }
    } else if (data.type === 'complete') {
      cell.dom.root.classList.remove('running', 'queued');
      cell.dom.runBtn.textContent = '▶';
      cell.dom.runBtn.title = 'Run cell (Shift+Enter)';
      cell.execCount = data.exec_count;
      cell.dom.execCountEl.textContent = `[${cell.execCount}]`;
      state.runningCellId = null;
      setStatus('idle');
      if (executionQueue.length > 0) {
        const nextId = executionQueue.shift();
        executeNextInQueue(nextId);
      }
    }
  }

  function runAll() {
    [...cells].forEach((cell) => runCell(cell.id, { advance: false }));
  }

  return {
    runCell,
    handleRunMessage,
    runAll,
    executeNextInQueue,
    advanceSelectionAfter,
  };
}