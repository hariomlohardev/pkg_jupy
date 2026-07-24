import { initTheme } from './theme.js';
import { createRunSocket } from './websocket.js';
import { setupTerminal } from './terminal.js';

(() => {
  const container = document.getElementById('notebook');
  const filenameInput = document.getElementById('filename');
  const fileInput = document.getElementById('file-input');
  const runAllBtn = document.getElementById('btn-run-all');
  const themeToggleBtn = document.getElementById('btn-theme-toggle');

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
  let pendingD = false;

  initTheme(themeToggleBtn);

  const runSocket = createRunSocket((data) => {
    if (!runningCellId) return;
    const cell = getCell(runningCellId);
    if (!cell) return;

    if (data.type === 'stdout') appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stdout');
    if (data.type === 'stderr') appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stderr');
    if (data.type === 'plot') appendCellPlot(cell, data.html);
    if (data.type === 'complete') {
      cell.dom.root.classList.remove('running');
      cell.dom.runBtn.textContent = '▶';
      cell.dom.runBtn.title = 'Run cell (Shift+Enter)';
      cell.execCount = data.exec_count;
      cell.dom.execCountEl.textContent = `[${cell.execCount}]`;
      runningCellId = null;
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
      extraKeys: {
        'Shift-Enter': () => runCell(cell.id, { advance: true }),
        'Ctrl-Enter': () => runCell(cell.id, { advance: false }),
        'Cmd-Enter': () => runCell(cell.id, { advance: false }),
        'Alt-Enter': () => runCell(cell.id, { insertBelow: true }),
        Esc: () => exitEditMode(cell.id),
      },
    });
    cell.cm = cm;

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
  }

  function appendCellPlot(cell, htmlString) {
    cell.dom.outputEl.hidden = false;
    const div = document.createElement('div');
    div.className = 'plot-container';
    div.innerHTML = htmlString;
    cell.dom.outputEl.appendChild(div);
    cell.outputs.push({ kind: 'plot', text: htmlString });
  }

  function runCell(id, { advance = false, insertBelow = false } = {}) {
    const cell = getCell(id);
    if (!cell || !runSocket || runSocket.readyState !== WebSocket.OPEN) return;
    const idx = indexOf(id);

    if (runningCellId && runningCellId !== id) return;

    runningCellId = id;
    cell.dom.root.classList.add('running');
    cell.dom.runBtn.textContent = '⏹';
    cell.dom.runBtn.title = 'Interrupt Execution';
    clearCellOutput(cell);

    runSocket.send(JSON.stringify({ action: 'run', code: cell.cm.getValue() }));

    if (insertBelow) insertCellAt(idx + 1, '', { focus: true });
    else if (advance) {
      if (idx === cells.length - 1) insertCellAt(idx + 1, '', { focus: true });
      else selectCell(cells[idx + 1].id);
    } else selectCell(id);
  }

  function toSourceLines(text) {
    const lines = text.split('\n');
    return lines.map((line, i) => (i < lines.length - 1 ? line + '\n' : line));
  }

  function serializeNotebook() {
    return {
      cells: cells.map((cell) => ({
        cell_type: 'code', execution_count: cell.execCount, metadata: {},
        outputs: cell.outputs.map((o) => ({
          output_type: o.kind === 'plot' ? 'display_data' : 'stream',
          name: o.kind === 'stderr' ? 'stderr' : 'stdout',
          text: toSourceLines(o.text),
        })),
        source: toSourceLines(cell.cm.getValue()),
      })),
      metadata: { kernelspec: { display_name: 'Python 3 (.jupy_env)', language: 'python', name: 'python3' } },
      nbformat: 4, nbformat_minor: 5,
    };
  }

  function loadNotebookJson(json) {
    [...cells].forEach((c) => { c.dom.root.remove(); c.dom.insertBar.remove(); });
    cells.length = 0;

    let rawCells = Array.isArray(json.cells) ? json.cells.filter((c) => c.cell_type === 'code') : [];
    if (rawCells.length === 0) rawCells = [{ source: [''] }];

    rawCells.forEach((rc) => {
      const src = Array.isArray(rc.source) ? rc.source.join('') : rc.source || '';
      const cell = makeCell(src);
      if (typeof rc.execution_count === 'number') {
        cell.execCount = rc.execution_count;
        cell.dom.execCountEl.textContent = `[${cell.execCount}]`;
      }
      (rc.outputs || []).forEach((o) => {
        if (o.output_type === 'display_data') appendCellPlot(cell, Array.isArray(o.text) ? o.text.join('') : o.text || '');
        else if (o.output_type === 'stream') appendCellOutput(cell, (Array.isArray(o.text) ? o.text.join('') : o.text || '').replace(/\n$/, ''), o.name === 'stderr' ? 'stderr' : 'stdout');
      });
      cells.push(cell);
    });

    reorderDom();
    cells.forEach((c) => c.cm.refresh());
    selectCell(cells[0].id);
  }

  function downloadNotebook() {
    const data = JSON.stringify(serializeNotebook(), null, 1);
    const blob = new Blob([data], { type: 'application/x-ipynb+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filenameInput.value.trim() || 'Untitled.ipynb';
    a.click();
    URL.revokeObjectURL(url);
  }

  const leadingBarFrag = insertBarTpl.content.cloneNode(true);
  const leadingInsertBar = leadingBarFrag.querySelector('.insert-bar');
  leadingInsertBar.querySelector('.add-cell-btn').addEventListener('click', () => insertCellAt(0, '', { focus: true }));
  container.appendChild(leadingInsertBar);

  document.getElementById('btn-add-bottom').addEventListener('click', () => insertCellAt(cells.length, '', { focus: true }));
  document.getElementById('btn-open').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      loadNotebookJson(JSON.parse(await file.text()));
      filenameInput.value = file.name;
    } catch (err) { alert('Could not read this notebook file: ' + err.message); }
    fileInput.value = '';
  });

  document.getElementById('btn-save').addEventListener('click', downloadNotebook);

  runAllBtn.addEventListener('click', async () => {
    for (const cell of [...cells]) {
      runCell(cell.id, { advance: false });
      while (runningCellId) await new Promise((r) => setTimeout(r, 100));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (editingId || document.activeElement === terminalInput) return;
    if (!selectedId) return;

    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); runCell(selectedId, { advance: true }); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCell(selectedId, { advance: false }); return; }
    if (e.key === 'Enter' && e.altKey) { e.preventDefault(); runCell(selectedId, { insertBelow: true }); return; }
    if (e.key === 'Enter') { e.preventDefault(); enterEditMode(selectedId); getCell(selectedId).cm.focus(); return; }

    const k = e.key.toLowerCase();
    if (k === 'a') { e.preventDefault(); insertCellAt(indexOf(selectedId), ''); }
    else if (k === 'b') { e.preventDefault(); insertCellAt(indexOf(selectedId) + 1, ''); }
    else if (k === 'd') {
      if (pendingD) { pendingD = false; deleteCell(selectedId); }
      else { pendingD = true; setTimeout(() => (pendingD = false), 600); }
    }
    else if (k === 'arrowup') { e.preventDefault(); selectAdjacent(-1); }
    else if (k === 'arrowdown') { e.preventDefault(); selectAdjacent(1); }
  });

  // Initial Cell
  insertCellAt(0, [
    '# JUPY - UNBUFFERED REAL-TIME ENGINE',
    'import sys',
    'print("Executing in virtualenv:", sys.executable)',
  ].join('\n'));
  selectCell(cells[0].id);
})();