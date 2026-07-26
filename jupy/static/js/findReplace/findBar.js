/**
 * findReplace/findBar.js
 * Wires the #find-bar UI to the notebook's find/replace engine.
 * Next = jump to match + highlight; Replace All = replace + toast.
 */
export function initFindBar(notebook, showToast) {
  // one-time style for the active match highlight
  if (!document.getElementById('find-match-style')) {
    const st = document.createElement('style');
    st.id = 'find-match-style';
    st.textContent = `.jupy-find-match { background: var(--color-secondary); color:#111827; border-radius:2px; }`;
    document.head.appendChild(st);
  }

  const bar = document.getElementById('find-bar');
  const findInput = document.getElementById('find-input');
  const replaceInput = document.getElementById('replace-input');
  const nextBtn = document.getElementById('find-next');
  const replaceBtn = document.getElementById('find-replace-all');
  const closeBtn = document.getElementById('find-close');
  if (!bar || !findInput) return { open: () => {}, close: () => {}, toggle: () => {} };

  let results = [];
  let cursor = 0;
  let activeMark = null;

  function clearMark() {
    if (activeMark) { try { activeMark.clear(); } catch {} activeMark = null; }
  }

  function jumpTo(result) {
    const cells = notebook.getCells();
    const cell = cells[result.cellIdx];
    if (!cell) return;
    notebook.enterEditMode(cell.id);
    const pos = cell.cm.posFromIndex(result.line);
    cell.cm.setCursor(pos);
    cell.cm.focus();
    clearMark();
    activeMark = cell.cm.markText(
      pos,
      cell.cm.posFromIndex(result.line + result.text.length),
      { className: 'jupy-find-match' }
    );
    cell.dom.root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function findNext() {
    const q = findInput.value;
    if (!q) return;
    results = notebook.findInNotebook(q) || [];
    if (!results.length) {
      showToast('⚠️ NO MATCHES FOUND', 'warning');
      return;
    }
    jumpTo(results[cursor % results.length]);
    cursor++;
  }

  function replaceAll() {
    const q = findInput.value, r = replaceInput.value;
    if (!q) return;
    const count = notebook.replaceInNotebook(q, r);
    clearMark(); results = []; cursor = 0;
    showToast(`✅ REPLACED IN ${count} CELL(S)`, 'success');
  }

  function open() { bar.style.display = 'flex'; setTimeout(() => findInput.focus(), 50); }
  function close() { bar.style.display = 'none'; clearMark(); }
  function toggle() { bar.style.display === 'flex' ? close() : open(); }

  nextBtn?.addEventListener('click', findNext);
  replaceBtn?.addEventListener('click', replaceAll);
  closeBtn?.addEventListener('click', close);
  findInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); findNext(); } });

  return { open, close, toggle };
}