/**
 * notebook/execution.js
 * Cell execution, queue, message handling, status.
 */
import {
  clearCellOutput,
  appendCellOutput,
  appendCellPlot,
  appendCellStdinPrompt,
  appendDisplayData,
  appendWidget
} from '../cells/cellOutput.js';

/** Render a markdown cell's content into its output area. */
function renderMarkdownOutput(cell) {
  const src = cell.cm.getValue();
  clearCellOutput(cell);
  if (!src.trim()) return;

  let html = window.marked ? window.marked.parse(src) : `<pre>${src}</pre>`;
  const div = document.createElement('div');
  div.className = 'markdown-preview';
  div.innerHTML = html;
  cell.dom.outputEl.hidden = false;
  cell.dom.outputEl.appendChild(div);
  if (window.MathJax) MathJax.typesetPromise([div]).catch(() => {});
}

export function createExecution(state, runSocket, showToast, setStatus, operations, selection) {
  const { cells, indexOf, getCell, executionQueue } = state;

  function executeNextInQueue(id) {
    const cell = getCell(id);
    if (!cell) {
      console.warn('[Jupy] executeNextInQueue: cell not found', id);
      state.runningCellId = null;
      setStatus('idle');
      return;
    }

    // ---------- Handle markdown cells locally ----------
    if (cell.type === 'markdown') {
      renderMarkdownOutput(cell);
      cell.dom.root.classList.remove('queued', 'running');
      cell.dom.runBtn.textContent = '▶';
      cell.dom.runBtn.title = 'Run cell (Shift+Enter)';
      cell.dom.execCountEl.textContent = '[ ]';
      state.runningCellId = null;
      setStatus('idle');

      // Continue with any queued cells
      if (executionQueue.length > 0) {
        const nextId = executionQueue.shift();
        executeNextInQueue(nextId);
      }
      return;
    }

    // ---------- Code cells (unchanged) ----------
    state.runningCellId = id;
    cell.dom.root.classList.remove('queued');
    cell.dom.root.classList.add('running');
    cell.dom.runBtn.textContent = '⏹';
    cell.dom.runBtn.title = 'Interrupt Execution';
    cell.dom.execCountEl.textContent = '[*]';
    clearCellOutput(cell);
    const language = cell.language || 'python';
    console.log('[Jupy] Executing cell', id, 'language:', language);
    runSocket.send({
      action: 'run',
      code: cell.cm.getValue(),
      language: language,
    });
  }

  function advanceSelectionAfter(idx) {
    // Safety check: if operations is null, log and return
    if (!operations) {
      console.error('[Jupy] advanceSelectionAfter: operations is null!');
      return;
    }
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
    console.log('[Jupy] runCell called', id, { advance, insertBelow });
    const cell = getCell(id);
    if (!cell) {
      console.warn('[Jupy] runCell: cell not found', id);
      return;
    }

    // ---------- Markdown cells run immediately, no kernel call ----------
    if (cell.type === 'markdown') {
      renderMarkdownOutput(cell);
      const idx = indexOf(id);
      if (insertBelow && operations) {
        operations.insertCellAt(idx + 1, '', { focus: true });
      } else if (advance) {
        advanceSelectionAfter(idx);
      } else {
        selection.selectCell(id);
      }
      return;
    }

    // ---------- Code cells (original logic) ----------
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
      // Queue the cell
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
    // Run now
    executeNextInQueue(id);
    if (insertBelow) {
      if (!operations) {
        console.error('[Jupy] insertBelow: operations is null!');
        return;
      }
      operations.insertCellAt(idx + 1, '', { focus: true });
    } else if (advance) {
      advanceSelectionAfter(idx);
    } else {
      selection.selectCell(id);
    }
  }

  function handleRunMessage(data) {
    if (!state.runningCellId) {
      console.warn('[Jupy] handleRunMessage: no running cell');
      return;
    }
    const cell = getCell(state.runningCellId);
    if (!cell) {
      console.warn('[Jupy] handleRunMessage: running cell not found', state.runningCellId);
      state.runningCellId = null;
      setStatus('idle');
      return;
    }

    if (data.type === 'stdout') {
      appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stdout');
    } else if (data.type === 'stderr') {
      appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stderr');
    } else if (data.type === 'plot') {
      appendCellPlot(cell, data.html);
    } else if (data.type === 'display') {
      appendDisplayData(cell, data.data);
    } else if (data.type === 'widget') {
      appendWidget(cell, data.data);
    } else if (data.type === 'stdin_request') {
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