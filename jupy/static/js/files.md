---
title: Folder Code Compilation
date: 2026-07-25 06:49:50
root_folder: "js"
total_compiled_files: 21
---

# File: autocomplete.js

let completionDebounceTimer = null;
let activeAbortController = null;

export function registerAutocomplete(cm) {
  // Bind Ctrl+Space and Cmd+Space manual shortcuts (triggers instantly, bypassing debounce)
  cm.addKeyMap({
    'Ctrl-Space': (editor) => {
      if (completionDebounceTimer) clearTimeout(completionDebounceTimer);
      triggerHint(editor);
    },
    'Cmd-Space': (editor) => {
      if (completionDebounceTimer) clearTimeout(completionDebounceTimer);
      triggerHint(editor);
    },
  });

  cm.on('keyup', (editor, event) => {
    // Exclude navigation, control keys, enter, backspace, and escape
    if (
      event.ctrlKey || event.metaKey || event.altKey ||
      event.key === 'Enter' || event.key === 'Escape' ||
      event.key === 'ArrowUp' || event.key === 'ArrowDown' ||
      event.key === 'ArrowLeft' || event.key === 'ArrowRight' ||
      event.key === 'Shift' || event.key === 'Tab' ||
      event.key === 'Backspace' || event.key === ' '
    ) {
      if (completionDebounceTimer) {
        clearTimeout(completionDebounceTimer);
        completionDebounceTimer = null;
      }
      return;
    }

    const cursor = editor.getCursor();
    const token = editor.getTokenAt(cursor);

    if (token.type === 'comment' || token.type === 'string') {
      if (completionDebounceTimer) {
        clearTimeout(completionDebounceTimer);
        completionDebounceTimer = null;
      }
      return;
    }

    const isDot = event.key === '.';
    const isWord = token.string.trim().length >= 1 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token.string);

    if (isDot || isWord) {
      // Clear any pending timeout while active typing is in progress
      if (completionDebounceTimer) {
        clearTimeout(completionDebounceTimer);
      }

      // Trigger completion instantly after a brief 50ms pause
      completionDebounceTimer = setTimeout(() => {
        triggerHint(editor);
      }, 50);
    } else {
      if (completionDebounceTimer) {
        clearTimeout(completionDebounceTimer);
        completionDebounceTimer = null;
      }
    }
  });
}

function triggerHint(editor) {
  CodeMirror.showHint(editor, fetchJupyCompletions, {
    async: true,
    completeSingle: false,
    closeOnUnfocus: true
  });
}

function fetchJupyCompletions(editor, callback) {
  const cursor = editor.getCursor();
  const code = editor.getValue();

  // Abort any slow, flying network requests before making a new one
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();

  fetch('/api/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: activeAbortController.signal,
    body: JSON.stringify({
      code: code,
      line: cursor.line + 1,
      column: cursor.ch
    })
  })
  .then((resp) => resp.json())
  .then((data) => {
    const list = data.completions || [];

    if (list.length === 0) {
      callback(null);
      return;
    }

    const token = editor.getTokenAt(cursor);
    let start = token.start;
    let end = cursor.ch;

    if (token.string === '.' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token.string)) {
      start = cursor.ch;
    }

    callback({
      list: list.map((item) => ({
        text: item.text,
        displayText: item.text,
        render: (element) => {
          const row = document.createElement('div');
          row.className = 'CodeMirror-hint-item';

          const nameSpan = document.createElement('span');
          nameSpan.className = 'hint-name';
          nameSpan.textContent = item.text;

          const badge = document.createElement('span');
          badge.className = 'hint-type';
          badge.textContent = (item.type || 'def').slice(0, 5);

          row.appendChild(nameSpan);
          row.appendChild(badge);
          element.appendChild(row);
        }
      })),
      from: CodeMirror.Pos(cursor.line, start),
      to: CodeMirror.Pos(cursor.line, end)
    });
  })
  .catch((err) => {
    // Suppress unhandled errors raised by aborting previous fetch requests
    if (err.name !== 'AbortError') {
      callback(null);
    }
  });
}

---

# File: filename.py

import os
import os
from datetime import datetime

def combine_files_to_markdown(output_filename="files.md"):
    # Get the directory where the script is located
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(current_dir, output_filename)
    
    # Get total file count for the frontmatter metadata
    total_files = 0
    for root, dirs, files in os.walk(current_dir):
        for file in files:
            if os.path.join(root, file) != output_path:
                total_files += 1

    with open(output_path, "w", encoding="utf-8") as outfile:
        # 1. Write YAML Frontmatter
        outfile.write("---\n")
        outfile.write(f"title: Folder Code Compilation\n")
        outfile.write(f"date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        outfile.write(f"root_folder: \"{os.path.basename(current_dir)}\"\n")
        outfile.write(f"total_compiled_files: {total_files}\n")
        outfile.write("---\n\n")
        
        # 2. Walk through all directories and files
        for root, dirs, files in os.walk(current_dir):
            for file in files:
                file_path = os.path.join(root, file)
                
                # Skip the output file itself
                if file_path == output_path:
                    continue
                    
                relative_path = os.path.relpath(file_path, current_dir)
                
                # Write the file location header
                outfile.write(f"# File: {relative_path}\n\n")
                
                try:
                    with open(file_path, "r", encoding="utf-8", errors="replace") as infile:
                        content = infile.read()
                        outfile.write(content)
                except Exception as e:
                    outfile.write(f"*Error reading this file: {str(e)}*")
                
                # Add spacing between files
                outfile.write("\n\n---\n\n")
                
    print(f"Successfully created {output_filename} with YAML frontmatter.")

if __name__ == "__main__":
    combine_files_to_markdown()



---

# File: metrics.js

export function initMetricsStream() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/ws/metrics`);

  const cpuBar = document.getElementById('cpu-bar-fill');
  const cpuVal = document.getElementById('cpu-val');

  const ramBar = document.getElementById('ram-bar-fill');
  const ramVal = document.getElementById('ram-val');

  const gpuBar = document.getElementById('gpu-bar-fill');
  const gpuVal = document.getElementById('gpu-val');

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // CPU Metric
      if (cpuBar && cpuVal) {
        cpuBar.style.width = `${Math.min(100, Math.max(0, data.cpu))}%`;
        cpuVal.textContent = `${data.cpu}%`;
      }

      // RAM Metric
      if (ramBar && ramVal) {
        ramBar.style.width = `${Math.min(100, Math.max(0, data.ram_pct))}%`;
        ramVal.textContent = `${data.ram_used_gb}/${data.ram_total_gb} GB (${data.ram_pct}%)`;
      }

      // GPU Metric
      if (gpuBar && gpuVal) {
        if (data.has_gpu) {
          gpuBar.style.width = `${Math.min(100, Math.max(0, data.gpu_pct))}%`;
          gpuVal.textContent = `${data.gpu_used_gb}/${data.gpu_total_gb} GB (${data.gpu_pct}%)`;
        } else {
          gpuBar.style.width = `0%`;
          gpuVal.textContent = `N/A`;
        }
      }
    } catch (e) {
      console.error("Metrics stream error:", e);
    }
  };

  socket.onclose = () => {
    setTimeout(initMetricsStream, 1000);
  };
}

---

# File: notebook.js

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

---

# File: pyodide-runtime.js

/**
 * pyodide-runtime.js
 * Pyodide execution wrapper supporting !pip install & Matplotlib plot capturing
 */
const PyRuntime = (() => {
  const PYODIDE_VERSION = "v0.26.4";
  const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

  let pyodide = null;
  let loadingPromise = null;
  let runCellFn = null;

  const BOOTSTRAP_PY = `
import ast, io, re, sys, traceback, warnings
from contextlib import redirect_stdout, redirect_stderr

warnings.filterwarnings("ignore", message=".*non-GUI backend.*")
warnings.filterwarnings("ignore", category=UserWarning, module="matplotlib")

async def __pynb_pip_install__(pkg_str):
    import micropip
    tokens = pkg_str.split()
    pkgs = [t for t in tokens if not t.startswith('-')]
    if not pkgs:
        print("Usage: !pip install <package_name>")
        return
    
    print(f"Installing {', '.join(pkgs)} via micropip...")
    try:
        await micropip.install(pkgs)
        print(f"Successfully installed {', '.join(pkgs)}")
    except Exception as e:
        print(f"Failed to install {', '.join(pkgs)}: {e}", file=sys.stderr)

def __pynb_capture_plots__():
    plot_htmls = []
    if "matplotlib.pyplot" in sys.modules:
        import matplotlib
        import matplotlib.pyplot as plt
        import io, base64
        
        fignums = plt.get_fignums()
        for i in fignums:
            try:
                fig = plt.figure(i)
                buf = io.BytesIO()
                fig.savefig(buf, format="png", bbox_inches="tight", dpi=110)
                buf.seek(0)
                b64 = base64.b64encode(buf.read()).decode("ascii")
                plot_htmls.append(f'<img class="notebook-plot" src="data:image/png;base64,{b64}" alt="Plot" />')
            except Exception:
                pass
        
        try:
            plt.close("all")
        except Exception:
            pass
            
        try:
            from matplotlib._pylab_helpers import Gcf
            Gcf.figs.clear()
        except Exception:
            pass

    return plot_htmls

async def __pynb_run_cell__(code, ns):
    out, err = io.StringIO(), io.StringIO()
    result_repr, error_tb = None, None
    plots = []
    
    lines = code.splitlines()
    pip_cmds = []
    py_lines = []
    
    for line in lines:
        stripped = line.strip()
        if re.match(r'^[!%]?\\s*pip\\s+install\\s+', stripped):
            clean_cmd = re.sub(r'^[!%]?\\s*pip\\s+install\\s+', '', stripped)
            pip_cmds.append(clean_cmd)
        elif re.match(r'^[!%]?\\s*matplotlib\\s+inline', stripped):
            pass
        else:
            py_lines.append(line)
            
    clean_code = "\\n".join(py_lines)
    
    try:
        with redirect_stdout(out), redirect_stderr(err):
            for cmd in pip_cmds:
                await __pynb_pip_install__(cmd)
            
            if "matplotlib" in sys.modules:
                import matplotlib
                try:
                    matplotlib.use("Agg", force=True)
                except Exception:
                    pass
            
            if clean_code.strip():
                tree = ast.parse(clean_code, mode="exec")
                if tree.body and isinstance(tree.body[-1], ast.Expr):
                    last = tree.body.pop()
                    if tree.body:
                        exec(compile(tree, "<cell>", "exec"), ns)
                    expr = ast.Expression(last.value)
                    ast.copy_location(expr, last.value)
                    value = eval(compile(expr, "<cell>", "eval"), ns)
                    if value is not None:
                        result_repr = repr(value)
                else:
                    exec(compile(tree, "<cell>", "exec"), ns)
            
            plots = __pynb_capture_plots__()

    except SyntaxError as e:
        error_tb = "".join(traceback.format_exception_only(type(e), e))
    except Exception as e:
        tb = e.__traceback__.tb_next if e.__traceback__ else None
        error_tb = "".join(traceback.format_exception(type(e), e, tb))
        
    return out.getvalue(), err.getvalue(), result_repr, error_tb, plots
`;

  function freshNamespace() {
    return pyodide.runPython("{'__name__': '__main__'}");
  }

  let namespace = null;

  async function init(onProgress) {
    if (pyodide) return pyodide;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      onProgress?.("Fetching Python runtime…");
      const { loadPyodide } = await import(PYODIDE_CDN + "pyodide.mjs");
      pyodide = await loadPyodide({ indexURL: PYODIDE_CDN });

      onProgress?.("Loading package installer (micropip)…");
      await pyodide.loadPackage("micropip");

      onProgress?.("Initializing kernel…");
      pyodide.runPython(BOOTSTRAP_PY);
      runCellFn = pyodide.globals.get("__pynb_run_cell__");
      namespace = freshNamespace();

      onProgress?.("Ready");
      return pyodide;
    })();

    return loadingPromise;
  }

  async function run(code) {
    if (!pyodide || !runCellFn) throw new Error("PyRuntime not ready");
    const proxy = await runCellFn(code, namespace);
    const [stdout, stderr, result, error, plots] = proxy.toJs();
    proxy.destroy();
    return { stdout, stderr, result, error, plots };
  }

  function restart() {
    if (namespace && namespace.destroy) {
      try { namespace.destroy(); } catch (e) {}
    }
    namespace = freshNamespace();
  }

  return {
    getPyodide: (onProgress) => init(onProgress),
    runCell: async (instance, code, { onStdout, onStderr, onPlot } = {}) => {
      const { stdout, stderr, result, error, plots } = await run(code);
      if (stdout) onStdout?.(stdout.replace(/\n$/, ""));
      if (result != null) onStdout?.(result);
      if (plots && plots.length > 0) {
        plots.forEach((html) => onPlot?.(html));
      }
      if (stderr) onStderr?.(stderr.replace(/\n$/, ""));
      if (error) onStderr?.(error.replace(/\n$/, ""));
    },
    restartKernel: async () => restart(),
    isReady: () => !!pyodide,
  };
})();

---

# File: shortcuts.js

/**
 * shortcuts.js
 * Hotkeys manager implementing native Brutalist stylesheet injection.
 */

let lastDeletedCellSource = "";

export function initShortcuts(actions) {
  // Inject Brutalist Dialog HTML and Inline CSS into the document
  injectDialogDOM();

  let lastDPress = 0;
  let lastIPress = 0;
  let lastZeroPress = 0;

  document.addEventListener('keydown', (e) => {
    const isEditing = actions.getEditingId() !== null;
    const activeEl = document.activeElement;

    // Ignore if typing inside inputs or non-editor textareas
    if (
      activeEl.tagName === 'INPUT' || 
      (activeEl.tagName === 'TEXTAREA' && !activeEl.classList.contains('CodeMirror-code') && activeEl.id !== 'terminal-hidden-input')
    ) {
      return;
    }

    // Toggle Help Dialog: Ctrl+Shift+? or Ctrl+Shift+/
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '?' || e.key === '/')) {
      e.preventDefault();
      toggleHelpDialog();
      return;
    }

    if (isEditing) {
      if (e.key === 'Escape') {
        e.preventDefault();
        actions.exitEditMode(actions.getEditingId());
      }
      return;
    }

    // Command Mode Shortcuts
    const selectedId = actions.getSelectedId();
    if (!selectedId) return;

    const cells = actions.getCells();
    const idx = cells.findIndex(c => c.id === selectedId);

    // Execution Controls
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      actions.runCell(selectedId, { advance: true });
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      actions.runCell(selectedId, { advance: false });
      return;
    }
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      actions.runCell(selectedId, { insertBelow: true });
      return;
    }

    // Focus cell
    if (e.key === 'Enter') {
      e.preventDefault();
      actions.enterEditMode(selectedId);
      return;
    }

    const k = e.key.toLowerCase();

    // Navigation
    if (e.key === 'ArrowUp' || k === 'k') {
      e.preventDefault();
      if (idx > 0) actions.selectCell(cells[idx - 1].id);
      return;
    }
    if (e.key === 'ArrowDown' || k === 'j') {
      e.preventDefault();
      if (idx < cells.length - 1) actions.selectCell(cells[idx + 1].id);
      return;
    }

    // Insert Cells
    if (k === 'a') {
      e.preventDefault();
      actions.insertCellAt(idx, '', { focus: true });
      return;
    }
    if (k === 'b') {
      e.preventDefault();
      actions.insertCellAt(idx + 1, '', { focus: true });
      return;
    }

    // Delete Cell (Double Tap D)
    if (k === 'd') {
      e.preventDefault();
      const now = Date.now();
      if (now - lastDPress < 600) {
        const cell = cells[idx];
        if (cell) lastDeletedCellSource = cell.cm.getValue();
        actions.deleteCell(selectedId);
        lastDPress = 0;
      } else {
        lastDPress = now;
        setTimeout(() => { lastDPress = 0; }, 600);
      }
      return;
    }

    // Undo Delete Cell (Z)
    if (k === 'z') {
      e.preventDefault();
      if (lastDeletedCellSource) {
        actions.insertCellAt(idx, lastDeletedCellSource, { focus: false });
        lastDeletedCellSource = "";
      }
      return;
    }

    // Reordering
    if (e.ctrlKey && e.shiftKey && e.key === 'ArrowUp') {
      e.preventDefault();
      actions.moveCell(selectedId, -1);
      return;
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'ArrowDown') {
      e.preventDefault();
      actions.moveCell(selectedId, 1);
      return;
    }

    // Double-tap 'i' to interrupt execution
    if (k === 'i') {
      e.preventDefault();
      const now = Date.now();
      if (now - lastIPress < 600) {
        actions.interruptKernel();
        lastIPress = 0;
      } else {
        lastIPress = now;
        setTimeout(() => { lastIPress = 0; }, 600);
      }
      return;
    }

    // Double-tap '0' to restart kernel runtime
    if (k === '0') {
      e.preventDefault();
      const now = Date.now();
      if (now - lastZeroPress < 600) {
        actions.restartKernel();
        lastZeroPress = 0;
      } else {
        lastZeroPress = now;
        setTimeout(() => { lastZeroPress = 0; }, 600);
      }
      return;
    }
  });
}

export function toggleHelpDialog() {
  const modal = document.getElementById('jupy-help-dialog');
  if (modal) {
    modal.hidden = !modal.hidden;
  }
}

function injectDialogDOM() {
  if (document.getElementById('jupy-help-dialog')) return;

  // 1. Inject Styles directly into head to prevent loading errors
  const style = document.createElement('style');
  style.textContent = `
    .shortcuts-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.65);
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .shortcuts-modal {
      width: 100%;
      max-width: 680px;
      background: var(--color-surface);
      border: var(--border-thick);
      border-radius: var(--rounded-md);
      box-shadow: var(--shadow-brutal-lg);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: var(--color-text);
    }
    .shortcuts-header {
      background: var(--color-primary);
      padding: 10px 14px;
      border-bottom: var(--border-thick);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .shortcuts-title {
      font-family: var(--font-mono);
      font-size: 0.85rem;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: 0.05em;
    }
    .shortcuts-body {
      display: flex;
      gap: 16px;
      padding: 16px;
      overflow-y: auto;
      background: var(--color-surface);
    }
    .shortcuts-column {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .shortcuts-column h3 {
      font-family: var(--font-display);
      font-size: 1.1rem;
      font-weight: 800;
      border-bottom: var(--border-thick);
      padding-bottom: 4px;
      margin-bottom: 6px;
      color: var(--color-primary);
    }
    .shortcut-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-mono);
      font-size: 0.72rem;
    }
    .shortcut-row span {
      margin-left: auto;
      font-family: var(--font-body);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--color-text);
    }
    .close-btn {
      border: var(--border-thick);
      background: var(--color-surface);
      color: var(--color-text);
      width: 24px;
      height: 24px;
      font-size: 0.75rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: var(--shadow-brutal-sm);
    }
    .close-btn:hover {
      background: var(--color-secondary);
      color: #111827;
    }
  `;
  document.head.appendChild(style);

  // 2. Inject Modal DOM
  const modal = document.createElement('div');
  modal.id = 'jupy-help-dialog';
  modal.className = 'shortcuts-overlay';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="shortcuts-modal">
      <div class="shortcuts-header">
        <span class="shortcuts-title">⌨️ JUPY KEYBOARD SHORTCUTS</span>
        <button class="close-btn" id="btn-shortcuts-close">✕</button>
      </div>
      <div class="shortcuts-body">
        <div class="shortcuts-column">
          <h3>COMMAND MODE (ESC)</h3>
          <div class="shortcut-row"><kbd>Shift</kbd>+<kbd>Enter</kbd> <span>Run cell &amp; select next</span></div>
          <div class="shortcut-row"><kbd>Ctrl/⌘</kbd>+<kbd>Enter</kbd> <span>Run cell in place</span></div>
          <div class="shortcut-row"><kbd>Alt/Option</kbd>+<kbd>Enter</kbd> <span>Run cell &amp; insert below</span></div>
          <div class="shortcut-row"><kbd>Enter</kbd> <span>Enter Edit Mode</span></div>
          <div class="shortcut-row"><kbd>A</kbd> <span>Insert cell above</span></div>
          <div class="shortcut-row"><kbd>B</kbd> <span>Insert cell below</span></div>
          <div class="shortcut-row"><kbd>D D</kbd> <span>Delete cell</span></div>
          <div class="shortcut-row"><kbd>Z</kbd> <span>Undo delete cell</span></div>
          <div class="shortcut-row"><kbd>ArrowUp/K</kbd> <span>Select cell above</span></div>
          <div class="shortcut-row"><kbd>ArrowDown/J</kbd> <span>Select cell below</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>↑</kbd> <span>Move cell up</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>↓</kbd> <span>Move cell down</span></div>
          <div class="shortcut-row"><kbd>I I</kbd> <span>Interrupt runtime</span></div>
          <div class="shortcut-row"><kbd>0 0</kbd> <span>Restart runtime</span></div>
        </div>
        <div class="shortcuts-column">
          <h3>EDIT MODE (ENTER)</h3>
          <div class="shortcut-row"><kbd>Esc</kbd> <span>Enter Command Mode</span></div>
          <div class="shortcut-row"><kbd>Alt/Option</kbd>+<kbd>↑</kbd> <span>Move current line up</span></div>
          <div class="shortcut-row"><kbd>Alt/Option</kbd>+<kbd>↓</kbd> <span>Move current line down</span></div>
          <div class="shortcut-row"><kbd>Tab</kbd> <span>Indent / Autocomplete</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Space</kbd> <span>Trigger manual suggestions</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>/</kbd> <span>Toggle line comment</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>?</kbd> <span>Open this help dialog</span></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('btn-shortcuts-close').addEventListener('click', toggleHelpDialog);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) toggleHelpDialog();
  });
}

---

# File: terminal.js

import { createTermSocket } from './websocket.js';

export function setupTerminal(toggleBtn, closeBtn, panel, screen, output, input, promptLabel, onResize) {
  let termSocket = null;
  const cmdHistory = [];
  let historyIdx = -1;

  function toggleTerminal() {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      if (!termSocket || termSocket.readyState !== WebSocket.OPEN) {
        output.textContent = 'Jupy Terminal (.jupy_env) Ready.\n';
        termSocket = createTermSocket((data) => {
          if (data.type === 'output') {
            output.textContent += data.data;
            screen.scrollTop = screen.scrollHeight;
          } else if (data.type === 'prompt') {
            if (promptLabel) promptLabel.textContent = data.data;
          } else if (data.type === 'clear') {
            output.textContent = '';
          }
        });
      }
      setTimeout(() => input.focus(), 50);
    }
    if (onResize) onResize();
  }

  toggleBtn.addEventListener('click', toggleTerminal);
  closeBtn.addEventListener('click', toggleTerminal);
  screen.addEventListener('click', () => input.focus());

  input.addEventListener('keydown', (e) => {
    if (!termSocket || termSocket.readyState !== WebSocket.OPEN) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value;
      if (val.trim()) {
        cmdHistory.push(val);
        historyIdx = cmdHistory.length;
      }

      const currentPrompt = promptLabel ? promptLabel.textContent : '(jupy_venv) ❯';
      output.textContent += `${currentPrompt} ${val}\n`;

      termSocket.send(JSON.stringify({ type: 'command', cmd: val }));
      input.value = '';
      screen.scrollTop = screen.scrollHeight;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0 && historyIdx > 0) {
        historyIdx--;
        input.value = cmdHistory[historyIdx];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx < cmdHistory.length - 1) {
        historyIdx++;
        input.value = cmdHistory[historyIdx];
      } else {
        historyIdx = cmdHistory.length;
        input.value = '';
      }
    }
  });
}

---

# File: theme.js

export function initTheme(toggleBtn) {
  function applyTheme() {
    const savedTheme = localStorage.getItem('jupy-theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
      toggleBtn.textContent = savedTheme === 'dark' ? '☀ LIGHT' : '🌙 DARK';
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      toggleBtn.textContent = prefersDark ? '☀ LIGHT' : '🌙 DARK';
    }
  }

  toggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isCurrentlyDark = currentTheme === 'dark' || (!currentTheme && systemDark);

    const nextTheme = isCurrentlyDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('jupy-theme', nextTheme);
    toggleBtn.textContent = nextTheme === 'dark' ? '☀ LIGHT' : '🌙 DARK';
  });

  applyTheme();
}

---

# File: websocket.js

export function createRunSocket(onMessage) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/ws/run`);

  socket.onmessage = (event) => onMessage(JSON.parse(event.data));
  socket.onclose = () => setTimeout(() => createRunSocket(onMessage), 1000);

  return socket;
}

export function createTermSocket(onMessage) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/ws/terminal`);

  socket.onmessage = (event) => onMessage(JSON.parse(event.data));
  socket.onclose = () => {};

  return socket;
}

---

# File: autocomplete\autocomplete.js

/**
 * autocomplete/autocomplete.js
 * Wires a CodeMirror instance up to Jupy's `/api/complete` endpoint.
 *
 * BUG FIX: the previous implementation kept its debounce timer and in-flight
 * AbortController in module-level variables shared by *every* cell. Typing in
 * one cell and quickly switching to another within the debounce window could
 * cancel or clobber the other cell's pending completion request. Both pieces
 * of state are now created fresh inside `registerAutocomplete()`, so each
 * CodeMirror instance gets its own private closure over them.
 */
import { AUTOCOMPLETE_DEBOUNCE_MS } from '../config/constants.js';

const IGNORED_KEYS = new Set([
  'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Shift', 'Tab', 'Backspace', ' ',
]);

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function registerAutocomplete(cm) {
  let debounceTimer = null;
  let activeAbortController = null;

  function triggerHint(editor) {
    CodeMirror.showHint(editor, fetchCompletions, {
      async: true,
      completeSingle: false,
      closeOnUnfocus: true,
    });
  }

  function fetchCompletions(editor, callback) {
    const cursor = editor.getCursor();
    const code = editor.getValue();

    // Abort any still-in-flight request from this same editor before starting a new one.
    if (activeAbortController) activeAbortController.abort();
    activeAbortController = new AbortController();

    fetch('/api/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: activeAbortController.signal,
      body: JSON.stringify({ code, line: cursor.line + 1, column: cursor.ch }),
    })
      .then((resp) => resp.json())
      .then((data) => {
        const list = data.completions || [];
        if (list.length === 0) {
          callback(null);
          return;
        }

        const token = editor.getTokenAt(cursor);
        let start = token.start;
        const end = cursor.ch;

        if (token.string === '.' || !IDENTIFIER_RE.test(token.string)) {
          start = cursor.ch;
        }

        callback({
          list: list.map((item) => ({
            text: item.text,
            displayText: item.text,
            render: (element) => {
              const row = document.createElement('div');
              row.className = 'CodeMirror-hint-item';

              const nameSpan = document.createElement('span');
              nameSpan.className = 'hint-name';
              nameSpan.textContent = item.text;

              const badge = document.createElement('span');
              badge.className = 'hint-type';
              badge.textContent = (item.type || 'def').slice(0, 5);

              row.appendChild(nameSpan);
              row.appendChild(badge);
              element.appendChild(row);
            },
          })),
          from: CodeMirror.Pos(cursor.line, start),
          to: CodeMirror.Pos(cursor.line, end),
        });
      })
      .catch((err) => {
        // Suppress errors caused by our own abort() calls above.
        if (err.name !== 'AbortError') callback(null);
      });
  }

  // Ctrl+Space / Cmd+Space trigger instantly, bypassing the debounce.
  cm.addKeyMap({
    'Ctrl-Space': (editor) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      triggerHint(editor);
    },
    'Cmd-Space': (editor) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      triggerHint(editor);
    },
  });

  cm.on('keyup', (editor, event) => {
    // Exclude navigation, control keys, enter, backspace, and escape.
    if (event.ctrlKey || event.metaKey || event.altKey || IGNORED_KEYS.has(event.key)) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      return;
    }

    const cursor = editor.getCursor();
    const token = editor.getTokenAt(cursor);

    if (token.type === 'comment' || token.type === 'string') {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      return;
    }

    const isDot = event.key === '.';
    const isWord = token.string.trim().length >= 1 && IDENTIFIER_RE.test(token.string);

    if (isDot || isWord) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => triggerHint(editor), AUTOCOMPLETE_DEBOUNCE_MS);
    } else if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  });
}

---

# File: cells\cellFactory.js

/**
 * cells/cellFactory.js
 * Builds a single cell's DOM (from the <template> tags) and its CodeMirror
 * instance, and wires up all of the cell-local UI events. Holds no shared
 * state of its own — all cross-cell state (selection, execution order, etc.)
 * lives in notebook/notebookController.js and is exposed to this factory via
 * the `hooks` callbacks below.
 */
import { moveLineUp, moveLineDown, toggleComment } from './editorCommands.js';

/**
 * @param {string} id
 * @param {string} source - initial code
 * @param {{cellTemplate: HTMLTemplateElement, insertBarTemplate: HTMLTemplateElement}} templates
 * @param {object} hooks
 * @param {(id: string, opts: object) => void} hooks.onRun
 * @param {(id: string) => void} hooks.onRunButtonClick
 * @param {(id: string, delta: number) => void} hooks.onMove
 * @param {(id: string) => void} hooks.onDelete
 * @param {(id: string) => void} hooks.onSelect
 * @param {(id: string) => void} hooks.onEnterEdit
 * @param {(id: string) => void} hooks.onExitEdit
 * @param {(id: string) => void} hooks.onInsertAfter
 * @param {(cm: any) => void} registerAutocomplete
 */
export function createCell(id, source, templates, hooks, registerAutocomplete) {
  const { cellTemplate, insertBarTemplate } = templates;

  const frag = cellTemplate.content.cloneNode(true);
  const root = frag.querySelector('.cell');
  const runBtn = frag.querySelector('.run-btn');
  const execCountEl = frag.querySelector('.exec-count');
  const editorHost = frag.querySelector('.cell-editor');
  const outputEl = frag.querySelector('.cell-output');
  const toolbar = frag.querySelector('.cell-toolbar');

  const barFrag = insertBarTemplate.content.cloneNode(true);
  const insertBar = barFrag.querySelector('.insert-bar');

  const cell = {
    id,
    execCount: null,
    outputs: [],
    dom: { root, runBtn, execCountEl, editorHost, outputEl, toolbar, insertBar },
  };

  const cm = CodeMirror(editorHost, {
    value: source,
    mode: 'python',
    theme: 'brutalism',
    lineNumbers: false,
    viewportMargin: Infinity,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    autoCloseBrackets: true,
    extraKeys: {
      'Shift-Enter': () => hooks.onRun(cell.id, { advance: true }),
      'Ctrl-Enter': () => hooks.onRun(cell.id, { advance: false }),
      'Cmd-Enter': () => hooks.onRun(cell.id, { advance: false }),
      'Alt-Enter': () => hooks.onRun(cell.id, { insertBelow: true }),
      Esc: () => hooks.onExitEdit(cell.id),
      // Edit Mode line shuffling shortcuts
      'Alt-Up': (editor) => moveLineUp(editor),
      'Alt-Down': (editor) => moveLineDown(editor),
      // Native commenting toggle
      'Ctrl-/': (editor) => toggleComment(editor),
      'Cmd-/': (editor) => toggleComment(editor),
    },
  });
  cell.cm = cm;

  registerAutocomplete(cm);

  cm.on('focus', () => hooks.onEnterEdit(cell.id));
  root.addEventListener('click', (e) => {
    if (!editorHost.contains(e.target)) hooks.onSelect(cell.id);
  });

  runBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hooks.onRunButtonClick(cell.id);
  });

  toolbar.querySelector('[data-action="move-up"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hooks.onMove(cell.id, -1);
  });
  toolbar.querySelector('[data-action="move-down"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hooks.onMove(cell.id, 1);
  });
  toolbar.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hooks.onDelete(cell.id);
  });

  insertBar.querySelector('.add-cell-btn').addEventListener('click', () => {
    hooks.onInsertAfter(cell.id);
  });

  return cell;
}

---

# File: cells\cellOutput.js

/**
 * cells/cellOutput.js
 * Rendering of a cell's stdout/stderr text, matplotlib plots, and interactive
 * stdin prompts into its output pane.
 */
import { MAX_CELL_OUTPUT_LINES } from '../config/constants.js';

export function clearCellOutput(cell) {
  cell.outputs = [];
  cell.dom.outputEl.hidden = true;
  cell.dom.outputEl.innerHTML = '';
}

export function appendCellOutput(cell, text, kind) {
  cell.dom.outputEl.hidden = false;

  const span = document.createElement('span');
  if (kind === 'stderr') span.className = 'stderr-line';
  span.textContent = text + '\n';
  cell.dom.outputEl.appendChild(span);
  cell.outputs.push({ kind, text });

  const spans = cell.dom.outputEl.querySelectorAll('span');
  if (spans.length > MAX_CELL_OUTPUT_LINES) {
    const overflow = spans.length - MAX_CELL_OUTPUT_LINES;
    for (let i = 0; i < overflow; i++) {
      spans[i].remove();
    }
  }

  requestAnimationFrame(() => {
    cell.dom.outputEl.scrollTop = cell.dom.outputEl.scrollHeight;
  });
}

export function appendCellPlot(cell, htmlString) {
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

/**
 * Renders an inline `input()` prompt inside the cell's output pane.
 * @param {*} cell
 * @param {string} promptText
 * @param {(value: string) => void} onSubmit - called with the typed value
 */
export function appendCellStdinPrompt(cell, promptText, onSubmit) {
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
    onSubmit(val);
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

---

# File: cells\editorCommands.js

/**
 * cells/editorCommands.js
 * Stateless CodeMirror editing helpers shared by every cell's key bindings.
 */

export function moveLineUp(cm) {
  const cursor = cm.getCursor();
  const line = cursor.line;
  if (line === 0) return;
  const text = cm.getLine(line);
  const prevText = cm.getLine(line - 1);
  cm.replaceRange(text + '\n' + prevText, { line: line - 1, ch: 0 }, { line, ch: cm.getLine(line).length });
  cm.setCursor({ line: line - 1, ch: cursor.ch });
}

export function moveLineDown(cm) {
  const cursor = cm.getCursor();
  const line = cursor.line;
  if (line === cm.lineCount() - 1) return;
  const text = cm.getLine(line);
  const nextText = cm.getLine(line + 1);
  cm.replaceRange(nextText + '\n' + text, { line, ch: 0 }, { line: line + 1, ch: cm.getLine(line + 1).length });
  cm.setCursor({ line: line + 1, ch: cursor.ch });
}

/** Toggles a Python `#` line comment across the current selection (Ctrl+/ / Cmd+/). */
export function toggleComment(cm) {
  const from = cm.getCursor('from');
  const to = cm.getCursor('to');
  const lineStart = from.line;
  const lineEnd = to.line;

  cm.operation(() => {
    let allCommented = true;

    for (let i = lineStart; i <= lineEnd; i++) {
      const lineText = cm.getLine(i);
      if (lineText.trim() !== '' && !lineText.trim().startsWith('#')) {
        allCommented = false;
        break;
      }
    }

    if (allCommented) {
      // Uncomment: strip a leading '#' plus one optional following space.
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
      // Comment: prepend '# ', skipping blank lines.
      for (let i = lineStart; i <= lineEnd; i++) {
        const lineText = cm.getLine(i);
        if (lineText.trim() === '') continue;
        cm.replaceRange('# ' + lineText, { line: i, ch: 0 }, { line: i, ch: lineText.length });
      }
    }
  });
}

---

# File: config\constants.js

/**
 * config/constants.js
 * Shared timing, sizing, and networking constants for the Jupy front-end.
 * Centralised here so magic numbers aren't scattered across feature modules.
 */

// Double-tap window for the "D D" (delete), "I I" (interrupt), "0 0" (restart) shortcuts.
export const DOUBLE_TAP_WINDOW_MS = 600;

// Debounce before firing an autocomplete request after the user stops typing.
export const AUTOCOMPLETE_DEBOUNCE_MS = 50;

// Toast notification visible duration + fade-out duration.
export const TOAST_VISIBLE_MS = 2000;
export const TOAST_FADE_MS = 150;

// Maximum number of <span> output lines kept per cell before older ones are trimmed.
export const MAX_CELL_OUTPUT_LINES = 300;

// Maximum number of characters kept in the terminal's output buffer.
export const MAX_TERMINAL_OUTPUT_CHARS = 200000;

// WebSocket reconnect backoff: starts at BASE, grows up to MAX on repeated failures,
// and resets back to BASE the moment a connection succeeds.
export const SOCKET_RECONNECT_BASE_MS = 1000;
export const SOCKET_RECONNECT_MAX_MS = 10000;

---

# File: core\socket.js

/**
 * core/socket.js
 *
 * A self-healing WebSocket wrapper used by every realtime feature (cell execution,
 * terminal, metrics).
 *
 * BUG FIX: the previous implementation (static/js/websocket.js) reconnected by
 * calling itself recursively on `close` and creating a brand new WebSocket, but
 * the *caller* kept holding a reference to the original (now-dead) socket object
 * forever, e.g. `const runSocket = createRunSocket(...)`. Once the socket dropped
 * even once, every future `runSocket.send(...)` call silently targeted a closed
 * socket, permanently breaking cell execution until a full page reload.
 *
 * `ReconnectingSocket` fixes this by being a stable, long-lived object: `.send()`
 * and `.isOpen` always operate on whatever the *current* underlying WebSocket is,
 * even after it has been transparently swapped out behind the scenes.
 */
import { SOCKET_RECONNECT_BASE_MS, SOCKET_RECONNECT_MAX_MS } from '../config/constants.js';

function buildWsUrl(path) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}${path}`;
}

export class ReconnectingSocket {
  /**
   * @param {string} path - e.g. '/ws/run'
   * @param {object} options
   * @param {(data: any) => void} [options.onMessage] - called with the parsed JSON payload
   * @param {() => void} [options.onOpen]
   * @param {() => void} [options.onClose]
   */
  constructor(path, { onMessage, onOpen, onClose } = {}) {
    this.path = path;
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onClose = onClose;

    this._ws = null;
    this._closedByUser = false;
    this._reconnectDelay = SOCKET_RECONNECT_BASE_MS;

    this._connect();
  }

  _connect() {
    const ws = new WebSocket(buildWsUrl(this.path));
    this._ws = ws;

    ws.onopen = () => {
      this._reconnectDelay = SOCKET_RECONNECT_BASE_MS; // reset backoff after a healthy connect
      this.onOpen?.();
    };

    ws.onmessage = (event) => {
      let parsed;
      try {
        parsed = JSON.parse(event.data);
      } catch (err) {
        console.error(`[socket:${this.path}] Failed to parse incoming message`, err);
        return;
      }
      this.onMessage?.(parsed);
    };

    ws.onerror = () => {
      // A close event always follows an error event for WebSockets; reconnection
      // logic lives entirely in onclose to avoid double-scheduling reconnects.
      try { ws.close(); } catch { /* already closing */ }
    };

    ws.onclose = () => {
      this.onClose?.();
      if (this._closedByUser) return;

      setTimeout(() => this._connect(), this._reconnectDelay);
      this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, SOCKET_RECONNECT_MAX_MS);
    };
  }

  /** True when the *current* underlying socket is open and ready to send. */
  get isOpen() {
    return !!this._ws && this._ws.readyState === WebSocket.OPEN;
  }

  /**
   * Sends a message on the current socket. Accepts a plain object (auto JSON-encoded)
   * or a raw string. Returns false (and logs a warning) instead of throwing if the
   * socket isn't currently open.
   */
  send(data) {
    if (!this.isOpen) {
      console.warn(`[socket:${this.path}] Dropped message — socket is not connected.`, data);
      return false;
    }
    this._ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    return true;
  }

  /** Permanently closes the socket and stops all future reconnect attempts. */
  close() {
    this._closedByUser = true;
    this._ws?.close();
  }
}

---

# File: core\toast.js

/**
 * core/toast.js
 * Bottom-left brutalist toast notifications.
 */
import { TOAST_VISIBLE_MS, TOAST_FADE_MS } from '../config/constants.js';

/**
 * @param {HTMLElement|null} container
 * @returns {(message: string, type?: 'warning'|'danger'|'success') => void}
 */
export function createToaster(container) {
  return function showToast(message, type = 'warning') {
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), TOAST_FADE_MS);
    }, TOAST_VISIBLE_MS);
  };
}

---

# File: metrics\metrics.js

/**
 * metrics/metrics.js
 * Footer CPU/RAM/GPU usage bars, streamed from /ws/metrics.
 */
import { ReconnectingSocket } from '../core/socket.js';

export function initMetricsStream() {
  const cpuBar = document.getElementById('cpu-bar-fill');
  const cpuVal = document.getElementById('cpu-val');

  const ramBar = document.getElementById('ram-bar-fill');
  const ramVal = document.getElementById('ram-val');

  const gpuBar = document.getElementById('gpu-bar-fill');
  const gpuVal = document.getElementById('gpu-val');

  new ReconnectingSocket('/ws/metrics', {
    onMessage: (data) => {
      if (cpuBar && cpuVal) {
        cpuBar.style.width = `${Math.min(100, Math.max(0, data.cpu))}%`;
        cpuVal.textContent = `${data.cpu}%`;
      }

      if (ramBar && ramVal) {
        ramBar.style.width = `${Math.min(100, Math.max(0, data.ram_pct))}%`;
        ramVal.textContent = `${data.ram_used_gb}/${data.ram_total_gb} GB (${data.ram_pct}%)`;
      }

      if (gpuBar && gpuVal) {
        if (data.has_gpu) {
          gpuBar.style.width = `${Math.min(100, Math.max(0, data.gpu_pct))}%`;
          gpuVal.textContent = `${data.gpu_used_gb}/${data.gpu_total_gb} GB (${data.gpu_pct}%)`;
        } else {
          gpuBar.style.width = '0%';
          gpuVal.textContent = 'N/A';
        }
      }
    },
  });
}

---

# File: notebook\notebookController.js

/**
 * notebook/notebookController.js
 *
 * Owns all notebook state: the cell list, selection/edit-mode, and the
 * run/queue/interrupt/restart lifecycle. This is the direct replacement for
 * the big IIFE that used to live in static/js/notebook.js, split out from
 * DOM/CodeMirror construction (cells/cellFactory.js) and output rendering
 * (cells/cellOutput.js) so each concern can be read/tested on its own.
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
 */
export function createNotebookController({ container, templates, runSocket, showToast, registerAutocomplete }) {
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

  /** Moves the selection up (-1) or down (+1), clamped to the cell list bounds. */
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
      selectCell(cells[idx + 1].id);
      cells[idx + 1].dom.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

      // Advance focus to the next cell without running it.
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

  /** Feed this to the run socket's onMessage handler. */
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

  function restartKernel() {
    fetch('/api/restart', { method: 'POST' })
      .then((res) => {
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        cells.forEach((c) => {
          c.execCount = null;
          c.dom.execCountEl.textContent = '[\u00A0]';
          clearCellOutput(c);
        });
        showToast('🔄 KERNEL RESTARTED', 'danger');
      })
      .catch((err) => {
        console.error('Kernel restart failed:', err);
        showToast('⚠️ FAILED TO RESTART KERNEL', 'danger');
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

  /** Replaces every cell in the notebook with the given list of source strings. */
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

---

# File: notebook\notebookFile.js

/**
 * notebookFile/notebookFile.js
 *
 * Client-side .ipynb save/open. Jupy has no backend "save" endpoint — the
 * notebook is a browser-only editing surface — so saving downloads a standard
 * Jupyter notebook (nbformat 4) file, and opening reads one back in via the
 * hidden <input type="file">.
 *
 * BUG FIX: the OPEN/SAVE toolbar buttons and the "+ CODE CELL" button at the
 * bottom of the notebook previously had no click handlers at all (their DOM
 * nodes were looked up but never used), so none of them did anything. See
 * app.js for where these are wired up.
 */

/** Builds an nbformat-4 notebook JSON string from the current cell list. */
export function serializeNotebook(cells) {
  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: 'Python 3 (Jupy)', language: 'python', name: 'python3' },
      language_info: { name: 'python', pygments_lexer: 'ipython3' },
    },
    cells: cells.map((cell) => {
      const lines = cell.cm.getValue().split('\n');
      return {
        cell_type: 'code',
        metadata: {},
        execution_count: cell.execCount ?? null,
        // nbformat convention: every source line keeps its trailing "\n" except the last.
        source: lines.map((line, i) => (i < lines.length - 1 ? line + '\n' : line)),
        outputs: [],
      };
    }),
  };
  return JSON.stringify(notebook, null, 2);
}

/** Triggers a browser download of the notebook as a `.ipynb` file. */
export function downloadNotebook(cells, filename) {
  const json = serializeNotebook(cells);
  const blob = new Blob([json], { type: 'application/x-ipynb+json' });
  const url = URL.createObjectURL(blob);

  const safeName = filename && filename.trim() ? filename.trim() : 'Untitled.ipynb';
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName.endsWith('.ipynb') ? safeName : `${safeName}.ipynb`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Parses raw `.ipynb` file text into a flat array of code-cell source strings.
 * Jupy only supports code cells, so any markdown/raw cells are skipped.
 */
export function parseNotebookFile(fileText) {
  const data = JSON.parse(fileText);
  const rawCells = Array.isArray(data.cells) ? data.cells : [];

  return rawCells
    .filter((c) => !c.cell_type || c.cell_type === 'code')
    .map((c) => (Array.isArray(c.source) ? c.source.join('') : c.source || ''));
}

/** Reads a File (e.g. from an <input type="file">) as text. */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

---

# File: terminal\terminal.js

/**
 * terminal/terminal.js
 * The right-hand split-pane shell terminal.
 *
 * BUG FIX: previously used a bare WebSocket with no reconnect and no close
 * handling at all — if the connection dropped (server restart, network blip),
 * the terminal went silently dead with no way to recover short of a full page
 * reload. It's now backed by the shared ReconnectingSocket, and output is
 * capped to avoid unbounded memory growth over long sessions (mirroring the
 * cap already applied to cell output).
 */
import { ReconnectingSocket } from '../core/socket.js';
import { MAX_TERMINAL_OUTPUT_CHARS } from '../config/constants.js';

export function setupTerminal(toggleBtn, closeBtn, panel, screen, output, input, promptLabel, onResize) {
  let termSocket = null;
  const cmdHistory = [];
  let historyIdx = -1;

  function appendOutput(text) {
    output.textContent += text;
    if (output.textContent.length > MAX_TERMINAL_OUTPUT_CHARS) {
      output.textContent = output.textContent.slice(-MAX_TERMINAL_OUTPUT_CHARS);
    }
    screen.scrollTop = screen.scrollHeight;
  }

  function ensureSocket() {
    if (termSocket) return; // ReconnectingSocket already owns its own reconnect loop

    output.textContent = 'Jupy Terminal (.jupy_env) Ready.\n';
    termSocket = new ReconnectingSocket('/ws/terminal', {
      onMessage: (data) => {
        if (data.type === 'output') {
          appendOutput(data.data);
        } else if (data.type === 'prompt') {
          if (promptLabel) promptLabel.textContent = data.data;
        } else if (data.type === 'clear') {
          output.textContent = '';
        }
      },
      onClose: () => appendOutput('\n[connection lost — reconnecting…]\n'),
    });
  }

  function toggleTerminal() {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      ensureSocket();
      setTimeout(() => input.focus(), 50);
    }
    if (onResize) onResize();
  }

  toggleBtn.addEventListener('click', toggleTerminal);
  closeBtn.addEventListener('click', toggleTerminal);
  screen.addEventListener('click', () => input.focus());

  input.addEventListener('keydown', (e) => {
    if (!termSocket || !termSocket.isOpen) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value;
      if (val.trim()) {
        cmdHistory.push(val);
        historyIdx = cmdHistory.length;
      }

      const currentPrompt = promptLabel ? promptLabel.textContent : '(jupy_venv) ❯';
      appendOutput(`${currentPrompt} ${val}\n`);

      termSocket.send({ type: 'command', cmd: val });
      input.value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0 && historyIdx > 0) {
        historyIdx--;
        input.value = cmdHistory[historyIdx];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx < cmdHistory.length - 1) {
        historyIdx++;
        input.value = cmdHistory[historyIdx];
      } else {
        historyIdx = cmdHistory.length;
        input.value = '';
      }
    }
  });
}

---

# File: theme\theme.js

/**
 * theme/theme.js
 * Light/dark theme toggle with localStorage persistence.
 */
export function initTheme(toggleBtn) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function savedTheme() {
    return localStorage.getItem('jupy-theme');
  }

  function isDarkActive() {
    const saved = savedTheme();
    return saved ? saved === 'dark' : media.matches;
  }

  function syncButtonLabel() {
    toggleBtn.textContent = isDarkActive() ? '☀ LIGHT' : '🌙 DARK';
  }

  function applyTheme() {
    const saved = savedTheme();
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      // No explicit user choice yet — let the CSS `prefers-color-scheme` rules drive it.
      document.documentElement.removeAttribute('data-theme');
    }
    syncButtonLabel();
  }

  toggleBtn.addEventListener('click', () => {
    const nextTheme = isDarkActive() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('jupy-theme', nextTheme);
    syncButtonLabel();
  });

  // Keep the button label in sync if the OS-level theme changes and the user
  // hasn't explicitly overridden it yet.
  media.addEventListener('change', () => {
    if (!savedTheme()) syncButtonLabel();
  });

  applyTheme();
}

---

