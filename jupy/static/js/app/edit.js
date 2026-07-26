/**
  * app/edit.js – Edit dropdown handlers + working Find/Replace bar
  */

let findBarVisible = false;
let findResults = [];
let findIndex = 0;
let wired = false;

export function initEditDropdown(notebook, showToast) {
  document.getElementById('btn-undo')?.addEventListener('click', () => {
    notebook.undo();
  });

  document.getElementById('btn-redo')?.addEventListener('click', () => {
    notebook.redo();
  });

  document.getElementById('btn-merge')?.addEventListener('click', () => {
    notebook.mergeSelectedCells();
  });

  document.getElementById('btn-split')?.addEventListener('click', () => {
    const id = notebook.getSelectedId();
    if (id) notebook.splitCellAtCursor(id);
  });

  document.getElementById('btn-find')?.addEventListener('click', () => {
    toggleFindBar(notebook, showToast);
  });

  document.getElementById('btn-line-numbers')?.addEventListener('click', () => {
    notebook.toggleLineNumbers();
  });

  wireFindBar(notebook, showToast);
}

function toggleFindBar(notebook, showToast) {
  const bar = document.getElementById('find-bar');
  if (!bar) return;

  findBarVisible = !findBarVisible;
  bar.style.display = findBarVisible ? 'flex' : 'none';

  if (findBarVisible) {
    const input = document.getElementById('find-input');
    if (input) setTimeout(() => input.focus(), 50);
  }
}

function wireFindBar(notebook, showToast) {
  if (wired) return;

  const findNext = document.getElementById('find-next');
  const replaceAll = document.getElementById('find-replace-all');
  const closeBtn = document.getElementById('find-close');
  const findInput = document.getElementById('find-input');
  const replaceInput = document.getElementById('replace-input');

  if (!findNext || !replaceAll || !closeBtn || !findInput || !replaceInput) return;

  findNext.addEventListener('click', () => {
    const q = findInput.value;
    if (!q) return;

    findResults = notebook.findInNotebook(q) || [];
    if (!findResults.length) {
      showToast('⚠️ NO MATCHES FOUND', 'warning');
      return;
    }

    const result = findResults[findIndex % findResults.length];
    findIndex++;

    const cells = notebook.getCells();
    const cell = cells[result.cellIdx];
    if (!cell) return;

    notebook.enterEditMode(cell.id);
    const pos = cell.cm.posFromIndex(result.line);
    cell.cm.setCursor(pos);
    cell.cm.focus();
  });

  replaceAll.addEventListener('click', () => {
    const q = findInput.value;
    const r = replaceInput.value;
    if (!q) return;

    const count = notebook.replaceInNotebook(q, r);
    showToast(`✅ REPLACED IN ${count} CELL(S)`, 'success');
  });

  closeBtn.addEventListener('click', () => {
    const bar = document.getElementById('find-bar');
    if (bar) bar.style.display = 'none';
    findBarVisible = false;
  });

  wired = true;
}