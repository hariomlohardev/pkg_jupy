/**
 * app.js
 * Application entry point. Looks up every DOM node, wires the feature
 * modules together, and boots the notebook. This replaces the big IIFE that
 * used to live at the top of static/js/notebook.js — that file is now split
 * across cells/, notebook/, core/, etc., and this is the file that plugs
 * them back into the page.
 *
 * BUG FIX: `filenameInput` and `fileInput` were looked up in the old
 * notebook.js but never actually used — the OPEN and SAVE toolbar buttons,
 * and the "+ CODE CELL" button at the bottom of the notebook, had no click
 * handlers at all. They're wired up below via notebook/notebookFile.js.
 *
 * BUG FIX: the bottom "+ CODE CELL" button was still dead after the above
 * fix. It had been wired to `btn-add-cell`, a best guess made when this
 * file was first migrated (the bundle available at the time had no
 * index.html to check ids against). The real index.html has now been
 * reviewed — the button's actual id is `btn-add-bottom` — so the lookup
 * below is corrected. `btn-open` and `btn-save` were confirmed correct.
 */
import { initTheme } from './theme/theme.js';
import { initMetricsStream } from './metrics/metrics.js';
import { ReconnectingSocket } from './core/socket.js';
import { createToaster } from './core/toast.js';
import { setupTerminal } from './terminal/terminal.js';
import { registerAutocomplete } from './autocomplete/autocomplete.js';
import { initShortcuts } from './shortcuts/shortcuts.js';
import { createNotebookController } from './notebook/notebookController.js';
import { downloadNotebook, parseNotebookFile, readFileAsText } from './notebook/notebookFile.js';
import { initRuntimeMenu } from './runtime/runtimeMenu.js';
import { setupPipManager } from './pip/pipManager.js';
import { setupAboutDialog } from './runtime/aboutDialog.js';

(() => {
  const container = document.getElementById('notebook');
  const filenameInput = document.getElementById('filename');
  const fileInput = document.getElementById('file-input');
  const openBtn = document.getElementById('btn-open');
  const saveBtn = document.getElementById('btn-save');
  const addCellBtn = document.getElementById('btn-add-bottom');
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

  const runtimeMenu = document.getElementById('runtime-menu');
  const runtimeMenuTrigger = document.getElementById('runtime-menu-trigger');
  const runtimeMenuDropdown = document.getElementById('runtime-menu-dropdown');

  const pipManagerPanel = document.getElementById('pip-manager-panel');
  const pipManagerCloseBtn = document.getElementById('btn-pip-manager-close');
  const pipManagerList = document.getElementById('pip-manager-list');
  const pipSearchInput = document.getElementById('pip-search-input');
  const pipInstallInput = document.getElementById('pip-install-input');
  const pipInstallBtn = document.getElementById('btn-pip-install');

  const aboutModal = document.getElementById('about-modal');
  const aboutCloseBtn = document.getElementById('btn-about-close');

  const cellTemplate = document.getElementById('cell-template');
  const insertBarTemplate = document.getElementById('insert-bar-template');

  const showToast = createToaster(toastContainer);

  initTheme(themeToggleBtn);
  initMetricsStream();

  // `notebook` and `runSocket` are mutually dependent (the controller needs
  // the socket to send run requests; the socket's onMessage needs the
  // controller to dispatch incoming run output) — start `notebook` as a
  // mutable binding so the socket's callback can close over it and pick up
  // the real value once it's assigned just below.
  let notebook = null;

  const runSocket = new ReconnectingSocket('/ws/run', {
    onMessage: (data) => notebook?.handleRunMessage(data),
    onClose: () => showToast('⚠️ KERNEL CONNECTION LOST — RECONNECTING…', 'danger'),
  });

  notebook = createNotebookController({
    container,
    templates: { cellTemplate, insertBarTemplate },
    runSocket,
    showToast,
    registerAutocomplete,
  });

  setupTerminal(
    terminalToggleBtn,
    terminalCloseBtn,
    terminalPanel,
    terminalScreen,
    terminalOutput,
    terminalInput,
    terminalPromptLabel,
    () => setTimeout(() => notebook.refreshAllEditors(), 50)
  );

  initShortcuts(notebook);

  const pipManager = setupPipManager({
    panel: pipManagerPanel,
    closeBtn: pipManagerCloseBtn,
    listEl: pipManagerList,
    searchInput: pipSearchInput,
    installInput: pipInstallInput,
    installBtn: pipInstallBtn,
    showToast,
    onResize: () => setTimeout(() => notebook.refreshAllEditors(), 50),
  });

  const aboutDialog = setupAboutDialog({
    overlay: aboutModal,
    closeBtn: aboutCloseBtn,
  });

  initRuntimeMenu({
    menu: runtimeMenu,
    trigger: runtimeMenuTrigger,
    dropdown: runtimeMenuDropdown,
    notebook,
    pipManager,
    aboutDialog,
  });

  runAllBtn.addEventListener('click', () => notebook.runAll());

  addCellBtn?.addEventListener('click', () => {
    notebook.insertCellAt(notebook.getCells().length, '', { focus: true });
  });

  // --- Open / Save (.ipynb) — previously dead DOM lookups, now wired up. ---
  saveBtn?.addEventListener('click', () => {
    downloadNotebook(notebook.getCells(), filenameInput?.value);
  });

  openBtn?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    try {
      const text = await readFileAsText(file);
      const sources = parseNotebookFile(text);
      notebook.loadNotebook(sources); // also selects the first loaded cell
      if (filenameInput) filenameInput.value = file.name.replace(/\.ipynb$/, '');
      showToast('📂 NOTEBOOK LOADED', 'success');
    } catch (err) {
      console.error('Failed to open notebook:', err);
      showToast('⚠️ FAILED TO OPEN NOTEBOOK — INVALID .ipynb FILE', 'danger');
    } finally {
      fileInput.value = '';
    }
  });

  // Demo initial cell. insertCellAt() already selects it, so no separate
  // selectCell() call is needed afterward.
  notebook.insertCellAt(0, [
    '# JUPY - COLAB & JUPYTER SHORTCUTS INTEGRATION',
    '# Press Ctrl + Shift + ? to open the Help Dialog!',
    '# Press Ctrl + / inside CodeMirror to toggle comments!',
    'import time',
    'print("Press Ctrl + Shift + ? to view all keyboard shortcuts!")',
  ].join('\n'));
})();
