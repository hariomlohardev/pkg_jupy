import { initTheme } from './theme.js';
import { createRunSocket } from './websocket.js';
import { setupTerminal } from './terminal.js';
import { registerAutocomplete } from './autocomplete.js';
import { initMetricsStream } from './metrics.js';
import { initShortcuts } from './shortcuts.js';

(() => {
  const container = document.getElementById('notebook');
  const filenameInput = document.getElementById('filename');
  const fileInput = document.getElementById('file-input');
  const runAllBtn = document.getElementById('btn-run-all');
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  const toastContainer = document.getElementById('toast-container');

  const terminalPanel = document.getElementById('terminal-panel');
  const terminalToggleBtn = document.getElementById('btn-terminal-toggle');
  const terminalCloseBtn = document.getElementById('btn-terminal-close');
  const terminalScreen = document.getElementById('terminal-screen');
  const terminalOutput = document.getElementById('terminal-output');
  const terminalInput = document.getElementById('terminal-input');
  const terminalPromptLabel = document.getElementById('terminal-prompt-label');

  const cellTpl = document.getElementById('cell-template');
  const insertBarTpl = document.getElementById('insert-bar-template');

  const cells = [];
  let idCounter = 0;
  let selectedId = null;
  let editingId = null;
  let runningCellId = null;
  const executionQueue = [];
  let pendingD = false;

  initTheme(themeToggleBtn);
  initMetricsStream();

  function showToast(message, type = 'warning') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 150);
    }, 2000);
  }

  const runSocket = createRunSocket((data) => {
    if (!runningCellId) return;
    const cell = getCell(runningCellId);
    if (!cell) return;

    if (data.type === 'stdout') appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stdout');
    if (data.type === 'stderr') appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stderr');
    if (data.type === 'plot') appendCellPlot(cell, data.html);
    if (data.type === 'stdin_request') appendCellStdinPrompt(cell, data.prompt);
    
    if (data.type === 'complete') {
      cell.dom.root.classList.remove('running', 'queued');
      cell.dom.runBtn.textContent = '▶';
      cell.dom.runBtn.title = 'Run cell (Shift+Enter)';
      cell.execCount = data.exec_count;
      cell.dom.execCountEl.textContent = `[${cell.execCount}]`;
      runningCellId = null;

      // Run next queued cell
      if (executionQueue.length > 0) {
        const nextId = executionQueue.shift();
        executeNextInQueue(nextId);
      }
    }
  });

  setupTerminal(
    terminalToggleBtn,
    terminalCloseBtn,
    terminalPanel,
    terminalScreen,
    terminalOutput,
    terminalInput,
    terminalPromptLabel,
    () => setTimeout(() => cells.forEach((c) => c.cm.refresh()), 50)
  );

  // Edit Mode CodeMirror Line-Movement Helpers
  function moveLineUp(cm) {
    const cursor = cm.getCursor();
    const line = cursor.line;
    if (line === 0) return;
    const text = cm.getLine(line);
    const prevText = cm.getLine(line - 1);
    cm.replaceRange(text + "\n" + prevText, { line: line - 1, ch: 0 }, { line: line, ch: cm.getLine(line).length });
    cm.setCursor({ line: line - 1, ch: cursor.ch });
  }

  function moveLineDown(cm) {
    const cursor = cm.getCursor();
    const line = cursor.line;
    if (line === cm.lineCount() - 1) return;
    const text = cm.getLine(line);
    const nextText = cm.getLine(line + 1);
    cm.replaceRange(nextText + "\n" + text, { line: line, ch: 0 }, { line: line + 1, ch: cm.getLine(line + 1).length });
    cm.setCursor({ line: line + 1, ch: cursor.ch });
  }

  // Edit Mode CodeMirror Python Comment Toggle Helper (Ctrl+/)
  function toggleComment(cm) {
    const from = cm.getCursor("from");
    const to = cm.getCursor("to");
    const lineStart = from.line;
    const lineEnd = to.line;

    cm.operation(() => {
      let allCommented = true;

      // Check if all selected lines are already commented with '#'
      for (let i = lineStart; i <= lineEnd; i++) {
        const lineText = cm.getLine(i);
        if (lineText.trim() !== "" && !lineText.trim().startsWith("#")) {
          allCommented = false;
          break;
        }
      }

      if (allCommented) {
        // Uncomment: Strip leading '#' and spacing
        for (let i = lineStart; i <= lineEnd; i++) {
          const lineText = cm.getLine(i);
          const match = lineText.match(/^(\s*)#\s?/);
          if (match) {
            const spaces = match[1];
            const stripped = lineText.substring(match[0].length);
            cm.replaceRange(spaces + stripped, { line: i, ch: 0 }, { line: i, ch: lineText.length });
          }
        }
      } else {
        // Comment: Prepend '#'
        for (let i = lineStart; i <= lineEnd; i++) {
          const lineText = cm.getLine(i);
          if (lineText.trim() === "") continue; // Skip blank lines
          cm.replaceRange("# " + lineText, { line: i, ch: 0 }, { line: i, ch: lineText.length });
        }
      }
    });
  }

  function makeCell(source = '') {
    const id = 'cell-' + (++idCounter);
    const frag = cellTpl.content.cloneNode(true);
    const root = frag.querySelector('.cell');
    const runBtn = frag.querySelector('.run-btn');
    const execCountEl = frag.querySelector('.exec-count');
    const editorHost = frag.querySelector('.cell-editor');
    const outputEl = frag.querySelector('.cell-output');
    const toolbar = frag.querySelector('.cell-toolbar');

    const barFrag = insertBarTpl.content.cloneNode(true);
    const insertBar = barFrag.querySelector('.insert-bar');

    const cell = {
      id, execCount: null, outputs: [],
      dom: { root, runBtn, execCountEl, editorHost, outputEl, toolbar, insertBar }
    };

    const cm = CodeMirror(editorHost, {
      value: source, mode: 'python', theme: 'brutalism',
      lineNumbers: false, viewportMargin: Infinity, indentUnit: 4, tabSize: 4, indentWithTabs: false,
      autoCloseBrackets: true,
      extraKeys: {
        'Shift-Enter': () => runCell(cell.id, { advance: true }),
        'Ctrl-Enter': () => runCell(cell.id, { advance: false }),
        'Cmd-Enter': () => runCell(cell.id, { advance: false }),
        'Alt-Enter': () => runCell(cell.id, { insertBelow: true }),
        Esc: () => exitEditMode(cell.id),
        // Edit Mode Line Shuffling shortcuts
        'Alt-Up': (editor) => moveLineUp(editor),
        'Alt-Down': (editor) => moveLineDown(editor),
        // Native Commenting toggle
        'Ctrl-/': (editor) => toggleComment(editor),
        'Cmd-/': (editor) => toggleComment(editor),
      },
    });
    cell.cm = cm;

    registerAutocomplete(cm);

    cm.on('focus', () => enterEditMode(cell.id));
    root.addEventListener('click', (e) => {
      if (!editorHost.contains(e.target)) selectCell(cell.id);
    });

    runBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (runningCellId === cell.id) {
        if (runSocket) runSocket.send(JSON.stringify({ action: 'interrupt' }));
      } else {
        runCell(cell.id, { advance: false });
      }
    });

    toolbar.querySelector('[data-action="move-up"]').addEventListener('click', (e) => { e.stopPropagation(); moveCell(cell.id, -1); });
    toolbar.querySelector('[data-action="move-down"]').addEventListener('click', (e) => { e.stopPropagation(); moveCell(cell.id, 1); });
    toolbar.querySelector('[data-action="delete"]').addEventListener('click', (e) => { e.stopPropagation(); deleteCell(cell.id); });

    insertBar.querySelector('.add-cell-btn').addEventListener('click', () => {
      insertCellAt(indexOf(cell.id) + 1, '', { focus: true });
    });

    return cell;
  }

  function indexOf(id) { return cells.findIndex((c) => c.id === id); }
  function getCell(id) { return cells.find((c) => c.id === id); }

  function reorderDom() {
    cells.forEach((c) => {
      container.appendChild(c.dom.root);
      container.appendChild(c.dom.insertBar);
    });
  }

  function insertCellAt(index, source = '', { focus = false } = {}) {
    const cell = makeCell(source);
    cells.splice(index, 0, cell);
    reorderDom();
    cell.cm.refresh();
    if (focus) { enterEditMode(cell.id); cell.cm.focus(); }
    else { selectCell(cell.id); }
    cell.dom.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return cell;
  }

  function deleteCell(id) {
    if (id === runningCellId) {
      if (runSocket && runSocket.readyState === WebSocket.OPEN) {
        runSocket.send(JSON.stringify({ action: 'interrupt' }));
      }
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
    selectedId = id; editingId = null;
    cells.forEach((c) => {
      c.dom.root.classList.toggle('selected', c.id === id);
      c.dom.root.classList.remove('editing');
    });
  }

  function enterEditMode(id) {
    selectedId = id; editingId = id;
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

  function clearCellOutput(cell) {
    cell.outputs = []; cell.dom.outputEl.hidden = true; cell.dom.outputEl.innerHTML = '';
  }

  function appendCellOutput(cell, text, kind) {
    cell.dom.outputEl.hidden = false;
    
    const span = document.createElement('span');
    if (kind === 'stderr') span.className = 'stderr-line';
    span.textContent = text + '\n';
    cell.dom.outputEl.appendChild(span);
    cell.outputs.push({ kind, text });

    const spans = cell.dom.outputEl.querySelectorAll('span');
    if (spans.length > 300) {
      const overflow = spans.length - 300;
      for (let i = 0; i < overflow; i++) {
        spans[i].remove();
      }
    }

    requestAnimationFrame(() => {
      cell.dom.outputEl.scrollTop = cell.dom.outputEl.scrollHeight;
    });
  }

  function appendCellPlot(cell, htmlString) {
    if (!htmlString || !htmlString.trim()) return;

    cell.dom.outputEl.hidden = false;

    let plotsWrapper = cell.dom.outputEl.querySelector('.cell-plots-wrapper');
    if (!plotsWrapper) {
      plotsWrapper = document.createElement('div');
      plotsWrapper.className = 'cell-plots-wrapper';
      cell.dom.outputEl.appendChild(plotsWrapper);
    }

    const div = document.createElement('div');
    div.className = 'plot-container';
    div.innerHTML = htmlString;
    plotsWrapper.appendChild(div);

    cell.outputs.push({ kind: 'plot', text: htmlString });

    requestAnimationFrame(() => {
      cell.dom.outputEl.scrollTop = cell.dom.outputEl.scrollHeight;
    });
  }

  function appendCellStdinPrompt(cell, promptText) {
    cell.dom.outputEl.hidden = false;
    const box = document.createElement('div');
    box.className = 'cell-stdin-prompt';

    const label = document.createElement('span');
    label.className = 'stdin-label';
    label.textContent = promptText || 'Input:';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'stdin-input';
    input.placeholder = 'Type response and press Enter...';
    input.autocomplete = 'off';

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary stdin-submit-btn';
    submitBtn.textContent = 'SUBMIT';

    function submit() {
      const val = input.value;
      box.remove();
      appendCellOutput(cell, (promptText ? promptText + ' ' : '') + val, 'stdout');
      runSocket.send(JSON.stringify({ action: 'stdin_reply', value: val }));
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
    submitBtn.addEventListener('click', submit);

    box.appendChild(label);
    box.appendChild(input);
    box.appendChild(submitBtn);
    cell.dom.outputEl.appendChild(box);

    requestAnimationFrame(() => {
      cell.dom.outputEl.scrollTop = cell.dom.outputEl.scrollHeight;
      input.focus();
    });
  }

  function runCell(id, { advance = false, insertBelow = false } = {}) {
    const cell = getCell(id);
    if (!cell || !runSocket || runSocket.readyState !== WebSocket.OPEN) return;
    const idx = indexOf(id);

    if (runningCellId === id) {
      showToast('⚠️ CELL ALREADY RUNNING', 'warning');
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

      // Advance focus to next cell without running it
      if (advance) {
        if (idx === cells.length - 1) {
          insertCellAt(idx + 1, '', { focus: true });
        } else {
          selectCell(cells[idx + 1].id);
          cells[idx + 1].dom.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
      return;
    }

    executeNextInQueue(id);

    if (insertBelow) {
      insertCellAt(idx + 1, '', { focus: true });
    } else if (advance) {
      if (idx === cells.length - 1) {
        insertCellAt(idx + 1, '', { focus: true });
      } else {
        selectCell(cells[idx + 1].id);
        cells[idx + 1].dom.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
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

    runSocket.send(JSON.stringify({ action: 'run', code: cell.cm.getValue() }));
  }

  function restartKernel() {
    fetch('/api/restart', { method: 'POST' }).then(() => {
      cells.forEach((c) => {
        c.execCount = null;
        c.dom.execCountEl.textContent = '[\u00A0]';
        clearCellOutput(c);
      });
      showToast('🔄 KERNEL RESTARTED', 'danger');
    });
  }

  // Interruption
  function interruptKernel() {
    if (runSocket && runSocket.readyState === WebSocket.OPEN) {
      runSocket.send(JSON.stringify({ action: 'interrupt' }));
      showToast('⏹ EXECUTION INTERRUPTED', 'danger');
    }
  }

  // Bind Modular Hotkeys Engine
  initShortcuts({
    runCell,
    selectCell,
    insertCellAt,
    deleteCell,
    moveCell,
    restartKernel,
    interruptKernel,
    getSelectedId: () => selectedId,
    getEditingId: () => editingId,
    getCells: () => cells,
    enterEditMode: (id) => {
      enterEditMode(id);
      getCell(id).cm.focus();
    },
    exitEditMode
  });

  runAllBtn.addEventListener('click', async () => {
    for (const cell of [...cells]) {
      runCell(cell.id, { advance: false });
    }
  });

  // Demo Initial Cells
  insertCellAt(0, [
    '# JUPY - COLAB & JUPYTER SHORTCUTS INTEGRATION',
    '# Press Ctrl + Shift + ? to open the Help Dialog!',
    '# Press Ctrl + / inside CodeMirror to toggle comments!',
    'import time',
    'print("Press Ctrl + Shift + ? to view all keyboard shortcuts!")',
  ].join('\n'));

  selectCell(cells[0].id);
})();