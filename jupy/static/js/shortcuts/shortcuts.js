/**
 * shortcuts/shortcuts.js
 * Global command-mode keyboard shortcuts with new features.
 */
import { DOUBLE_TAP_WINDOW_MS } from '../config/constants.js';

let lastDeletedCellSource = '';
let findBarVisible = false;

export function initShortcuts(actions) {
  // Inject Help Dialog DOM if not present
  injectDialogDOM();

  let lastDPress = 0;
  let lastIPress = 0;
  let lastZeroPress = 0;

  document.addEventListener('keydown', (e) => {
    // Ignore if inside CodeMirror (handled by editor)
    if (e.target.closest && e.target.closest('.CodeMirror')) {
      // However, some shortcuts like Ctrl+F should still work globally
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleFindBar();
        return;
      }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        // Undo cell operation
        if (!e.shiftKey) {
          e.preventDefault();
          actions.undo();
          return;
        }
      }
      if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        actions.redo();
        return;
      }
      return;
    }

    const isEditing = actions.getEditingId() !== null;
    const activeEl = document.activeElement;

    // Ignore input fields
    if (
      activeEl.tagName === 'INPUT' ||
      (activeEl.tagName === 'TEXTAREA' && activeEl.id !== 'terminal-hidden-input')
    ) {
      return;
    }

    // Help dialog: Ctrl+Shift+? or +/
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '?' || e.key === '/')) {
      e.preventDefault();
      toggleHelpDialog();
      return;
    }

    // Find bar: Ctrl+F
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      toggleFindBar();
      return;
    }

    // Merge selected: Ctrl+Shift+M
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'm') {
      e.preventDefault();
      actions.mergeSelectedCells();
      return;
    }

    // Split cell: Ctrl+Shift+- (hyphen)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '-') {
      e.preventDefault();
      const id = actions.getSelectedId();
      if (id) actions.splitCellAtCursor(id);
      return;
    }

    // Copy: Ctrl+C
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      actions.copyCells();
      return;
    }

    // Cut: Ctrl+X
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
      e.preventDefault();
      actions.cutCells();
      return;
    }

    // Paste: Ctrl+V
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      actions.pasteCells();
      return;
    }

    // Undo cell op: Ctrl+Z (already handled inside CodeMirror, but global as well)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      actions.undo();
      return;
    }

    // Redo: Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      actions.redo();
      return;
    }

    // Toggle line numbers: Ctrl+Shift+L
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'l') {
      e.preventDefault();
      actions.toggleLineNumbers();
      return;
    }

    // Presentation mode: Ctrl+Shift+P
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'p') {
      e.preventDefault();
      actions.togglePresentation();
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
    const idx = cells.findIndex((c) => c.id === selectedId);

    // Run cells
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

    // Enter edit mode
    if (e.key === 'Enter') {
      e.preventDefault();
      actions.enterEditMode(selectedId);
      return;
    }

    const k = e.key.toLowerCase();

    // Navigation
    if (e.key === 'ArrowUp' || k === 'k') {
      e.preventDefault();
      actions.selectAdjacent(-1);
      return;
    }
    if (e.key === 'ArrowDown' || k === 'j') {
      e.preventDefault();
      actions.selectAdjacent(1);
      return;
    }

    // Insert cells
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

    // Delete (double D)
    if (k === 'd') {
      e.preventDefault();
      const now = Date.now();
      if (now - lastDPress < DOUBLE_TAP_WINDOW_MS) {
        const cell = cells[idx];
        if (cell) lastDeletedCellSource = cell.cm.getValue();
        actions.deleteCell(selectedId);
        lastDPress = 0;
      } else {
        lastDPress = now;
        setTimeout(() => { lastDPress = 0; }, DOUBLE_TAP_WINDOW_MS);
      }
      return;
    }

    // Undo delete (Z)
    if (k === 'z') {
      e.preventDefault();
      if (lastDeletedCellSource) {
        actions.insertCellAt(idx, lastDeletedCellSource, { focus: false });
        lastDeletedCellSource = '';
      }
      return;
    }

    // Move cells (Ctrl+Shift+Arrow)
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

    // Interrupt (double I)
    if (k === 'i') {
      e.preventDefault();
      const now = Date.now();
      if (now - lastIPress < DOUBLE_TAP_WINDOW_MS) {
        actions.interruptKernel();
        lastIPress = 0;
      } else {
        lastIPress = now;
        setTimeout(() => { lastIPress = 0; }, DOUBLE_TAP_WINDOW_MS);
      }
      return;
    }

    // Restart (double 0)
    if (k === '0') {
      e.preventDefault();
      const now = Date.now();
      if (now - lastZeroPress < DOUBLE_TAP_WINDOW_MS) {
        actions.restartKernel();
        lastZeroPress = 0;
      } else {
        lastZeroPress = now;
        setTimeout(() => { lastZeroPress = 0; }, DOUBLE_TAP_WINDOW_MS);
      }
      return;
    }

    // Select multiple (Shift+Arrow)
    if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      const newIdx = Math.min(cells.length - 1, Math.max(0, idx + delta));
      // In notebookController, selectCell handles range selection when shift is held
      // We need to call selectCell with shift flag. Since we don't have it here,
      // we'll rely on the notebook controller's keydown handling.
      // To avoid duplication, we'll let the controller handle shift selections.
      // The controller should listen for arrow keys with shift and call selectCell with range=true.
      // So we skip here.
    }
  });

  // Toggle find bar helper
  function toggleFindBar() {
    const bar = document.getElementById('find-bar');
    if (bar) {
      findBarVisible = !findBarVisible;
      bar.style.display = findBarVisible ? 'flex' : 'none';
      if (findBarVisible) {
        const input = document.getElementById('find-input');
        if (input) setTimeout(() => input.focus(), 50);
      }
    }
  }
}

export function toggleHelpDialog() {
  const modal = document.getElementById('jupy-help-dialog');
  if (modal) {
    modal.hidden = !modal.hidden;
  }
}

function injectDialogDOM() {
  if (document.getElementById('jupy-help-dialog')) return;

  // Style and dialog HTML (same as before, add new shortcuts)
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
          <div class="shortcut-row"><kbd>Shift</kbd>+<kbd>Click</kbd> <span>Select multiple cells</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> <span>Merge selected cells</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>-</kbd> <span>Split cell at cursor</span></div>
        </div>
        <div class="shortcuts-column">
          <h3>EDIT MODE (ENTER)</h3>
          <div class="shortcut-row"><kbd>Esc</kbd> <span>Enter Command Mode</span></div>
          <div class="shortcut-row"><kbd>Alt/Option</kbd>+<kbd>↑</kbd> <span>Move current line up</span></div>
          <div class="shortcut-row"><kbd>Alt/Option</kbd>+<kbd>↓</kbd> <span>Move current line down</span></div>
          <div class="shortcut-row"><kbd>Tab</kbd> <span>Indent / Autocomplete</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Space</kbd> <span>Trigger manual suggestions</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>/</kbd> <span>Toggle line comment</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>F</kbd> <span>Find in notebook</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Z</kbd> <span>Undo cell operation</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Y</kbd> <span>Redo cell operation</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>X</kbd> <span>Cut selected cells</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>C</kbd> <span>Copy selected cells</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>V</kbd> <span>Paste cells</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> <span>Toggle line numbers</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> <span>Presentation mode</span></div>
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