/**
 * app.js
 * Application entry point – now uses modular notebook controller.
 */
import { initTheme } from './theme/theme.js';
import { initMetricsStream } from './metrics/metrics.js';
import { ReconnectingSocket } from './core/socket.js';
import { createToaster } from './core/toast.js';
import { setupTerminal } from './terminal/terminal.js';
import { registerAutocomplete } from './autocomplete/autocomplete.js';
import { initShortcuts } from './shortcuts/shortcuts.js';
import { createNotebookController } from './notebook/controller.js'; // <-- new import
import { downloadNotebook, parseNotebookFile, readFileAsText } from './notebook/notebookFile.js';
import { initRuntimeMenu } from './runtime/runtimeMenu.js';
import { initEnvTopbarMenu } from './env/envTopbarMenu.js';
import { setupEnvManager } from './env/envManager.js';
import { initWidgetManager } from './widgets/widgetManager.js';

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
  const envStatusLabel = document.getElementById('env-status-label');

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

  const envTopbarMenu = document.getElementById('env-topbar-menu');
  const envTopbarMenuTrigger = document.getElementById('env-topbar-menu-trigger');
  const envTopbarMenuDropdown = document.getElementById('env-topbar-menu-dropdown');

  const envPanel = document.getElementById('env-manager-panel');
  const envPanelTitle = document.getElementById('env-manager-title-text');
  const envCloseBtn = document.getElementById('btn-env-manager-close');

  const envViewCurrent = document.getElementById('env-view-current');
  const envViewCreate = document.getElementById('env-view-create');
  const envViewPip = document.getElementById('env-view-pip');
  const envViewOutline = document.getElementById('env-view-outline');

  const envModeRadios = Array.from(document.querySelectorAll('input[name="env-mode"]'));
  const envNamedSelect = document.getElementById('env-named-select');
  const envApplyBtn = document.getElementById('btn-env-apply');
  const envStatusLine = document.getElementById('env-status-line');
  const envJupyVersion = document.getElementById('env-jupy-version');
  const envPythonVersion = document.getElementById('env-python-version');
  const envPath = document.getElementById('env-path');
  const envPlatform = document.getElementById('env-platform');
  const envPackageCount = document.getElementById('env-package-count');

  const envCreateInput = document.getElementById('env-create-input');
  const envCreateBtn = document.getElementById('btn-env-create');
  const envCreateStatusLine = document.getElementById('env-create-status-line');
  const envExistingList = document.getElementById('env-existing-list');

  const pipManagerList = document.getElementById('pip-manager-list');
  const pipSearchInput = document.getElementById('pip-search-input');
  const pipInstallInput = document.getElementById('pip-install-input');
  const pipInstallBtn = document.getElementById('btn-pip-install');
  const pipStatusLine = document.getElementById('pip-status-line');

  const outlineListEl = document.getElementById('outline-list');

  const cellTemplate = document.getElementById('cell-template');
  const insertBarTemplate = document.getElementById('insert-bar-template');

  const showToast = createToaster(toastContainer);

  initTheme(themeToggleBtn);
  initMetricsStream();

  let notebook = null;
  let reconnectToastShown = false;

  // ======================================================================
  // 1. Create the run socket
  // ======================================================================
  const runSocket = new ReconnectingSocket('/ws/run', {
    onMessage: (data) => {
      // Forward widget messages to the widget manager
      if (data.type === 'widget') {
        if (window.__jupy_widgetManager) {
          window.__jupy_widgetManager.handleMessage(data.data);
        }
      } else {
        notebook?.handleRunMessage(data);
      }
    },
    onOpen: () => {
      if (reconnectToastShown) {
        showToast('🔄 KERNEL RECONNECTED', 'success');
        reconnectToastShown = false;
      }
    },
    onClose: () => {
      if (!reconnectToastShown) {
        showToast('⚠️ KERNEL CONNECTION LOST — RECONNECTING…', 'danger');
        reconnectToastShown = true;
      }
    },
  });

  // ======================================================================
  // 2. Initialize widget manager
  // ======================================================================
  const widgetManager = initWidgetManager(runSocket);
  window.__jupy_widgetManager = widgetManager;
  window.__jupy_runSocket = runSocket;

  // ======================================================================
  // 3. Create notebook controller
  // ======================================================================
  const onCellChange = () => {
    if (envManager && typeof envManager.scheduleOutlineUpdate === 'function') {
      envManager.scheduleOutlineUpdate();
    }
  };

  notebook = createNotebookController({
    container,
    templates: { cellTemplate, insertBarTemplate },
    runSocket,
    showToast,
    registerAutocomplete,
    onCellChange,
  });

  window.__jupy_notebook = notebook;

  // ======================================================================
  // 4. Setup terminal, shortcuts, env manager, menus
  // ======================================================================
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

  const envManager = setupEnvManager({
    panel: envPanel,
    titleEl: envPanelTitle,
    closeBtn: envCloseBtn,
    views: {
      current: envViewCurrent,
      create: envViewCreate,
      pip: envViewPip,
      outline: envViewOutline,
    },
    modeRadios: envModeRadios,
    namedSelect: envNamedSelect,
    createInput: envCreateInput,
    createBtn: envCreateBtn,
    applyBtn: envApplyBtn,
    statusLine: envStatusLine,
    jupyVersionEl: envJupyVersion,
    pythonVersionEl: envPythonVersion,
    pathEl: envPath,
    platformEl: envPlatform,
    packageCountEl: envPackageCount,
    statusLabelEl: envStatusLabel,
    listEl: pipManagerList,
    searchInput: pipSearchInput,
    installInput: pipInstallInput,
    installBtn: pipInstallBtn,
    createStatusLine: envCreateStatusLine,
    existingEnvsEl: envExistingList,
    pipStatusLine,
    outlineListEl,
    notebook,
    showToast,
    onResize: () => setTimeout(() => notebook.refreshAllEditors(), 50),
    onEnvSwitched: () => showToast('🔄 KERNEL RESTARTED ON NEW ENVIRONMENT', 'danger'),
  });
  envManager.refreshStatus();

  // ======================================================================
  // 5. Wire up toolbar buttons (use new notebook methods)
  // ======================================================================
  document.getElementById('btn-undo')?.addEventListener('click', () => notebook.undo());
  document.getElementById('btn-redo')?.addEventListener('click', () => notebook.redo());
  document.getElementById('btn-merge')?.addEventListener('click', () => notebook.mergeSelectedCells());
  document.getElementById('btn-split')?.addEventListener('click', () => {
    const id = notebook.getSelectedId();
    if (id) notebook.splitCellAtCursor(id);
  });
  document.getElementById('btn-find')?.addEventListener('click', () => toggleFindBar());
  document.getElementById('btn-line-numbers')?.addEventListener('click', () => notebook.toggleLineNumbers());
  document.getElementById('btn-presentation')?.addEventListener('click', () => notebook.togglePresentation());

  // Find bar logic
  let findBarVisible = false;
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

  // Find bar buttons
  document.getElementById('find-close')?.addEventListener('click', toggleFindBar);
  document.getElementById('find-next')?.addEventListener('click', () => {
    const search = document.getElementById('find-input')?.value;
    if (search) {
      const results = notebook.findInNotebook(search);
      if (results.length > 0) {
        const first = results[0];
        notebook.selectCell(notebook.getCells()[first.cellIdx].id);
        notebook.enterEditMode(notebook.getCells()[first.cellIdx].id);
        const cm = notebook.getCells()[first.cellIdx].cm;
        cm.focus();
        cm.setCursor({ line: first.line, ch: 0 });
        showToast(`Found ${results.length} matches`, 'success');
      } else {
        showToast('No matches found', 'warning');
      }
    }
  });
  document.getElementById('find-replace-all')?.addEventListener('click', () => {
    const search = document.getElementById('find-input')?.value;
    const replace = document.getElementById('replace-input')?.value;
    if (search) {
      const count = notebook.replaceInNotebook(search, replace);
      showToast(`Replaced ${count} occurrences`, 'success');
    }
  });

  // Export buttons
  document.getElementById('btn-export-html')?.addEventListener('click', async () => {
      const notebookData = getNotebookData();
      const res = await fetch('/api/export/html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notebook: notebookData })
      });
      const data = await res.json();
      if (data.html) {
          const blob = new Blob([data.html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'notebook.html';
          a.click();
          URL.revokeObjectURL(url);
      }
  });

  document.getElementById('btn-export-py')?.addEventListener('click', async () => {
      const notebookData = getNotebookData();
      const res = await fetch('/api/export/py', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notebook: notebookData })
      });
      const data = await res.json();
      if (data.script) {
          const blob = new Blob([data.script], { type: 'text/x-python' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'notebook.py';
          a.click();
          URL.revokeObjectURL(url);
      }
  });

  document.getElementById('btn-export-md')?.addEventListener('click', async () => {
      const notebookData = getNotebookData();
      const res = await fetch('/api/export/md', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notebook: notebookData })
      });
      const data = await res.json();
      if (data.markdown) {
          const blob = new Blob([data.markdown], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'notebook.md';
          a.click();
          URL.revokeObjectURL(url);
      }
  });

  document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
      const notebookData = getNotebookData();
      const res = await fetch('/api/export/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notebook: notebookData })
      });
      const data = await res.json();
      if (data.html) {
          // Open a new window for printing
          const win = window.open('', '_blank');
          win.document.write(data.html);
          win.document.close();
          win.focus();
          win.print();
      }
  });

  function getNotebookData() {
      const cells = notebook.getCells();
      return {
          cells: cells.map(c => ({
              type: c.type || 'code',
              source: c.cm.getValue(),
              outputs: c.outputs || []
          }))
      };
  }

  runAllBtn.addEventListener('click', () => notebook.runAll());

  addCellBtn?.addEventListener('click', () => {
    notebook.insertCellAt(notebook.getCells().length, '', { focus: true });
  });

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
      notebook.loadNotebook(sources);
      if (filenameInput) filenameInput.value = file.name.replace(/\.ipynb$/, '');
      showToast('📂 NOTEBOOK LOADED', 'success');
    } catch (err) {
      console.error('Failed to open notebook:', err);
      showToast('⚠️ FAILED TO OPEN NOTEBOOK — INVALID .ipynb FILE', 'danger');
    } finally {
      fileInput.value = '';
    }
  });

  // Restart / interrupt hooks (if not already in notebook)
  notebook.restartKernel = async function() {
    try {
      const res = await fetch('/api/restart', { method: 'POST' });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      this.getCells().forEach((c) => {
        c.execCount = null;
        c.dom.execCountEl.textContent = '[\u00A0]';
        // clear output
        const output = c.dom.outputEl;
        output.hidden = true;
        output.innerHTML = '';
      });
      showToast('🔄 KERNEL RESTARTED', 'danger');
      return true;
    } catch (err) {
      showToast('⚠️ FAILED TO RESTART KERNEL', 'danger');
      return false;
    }
  };
  notebook.restartAndRunAll = async function() {
    const ok = await this.restartKernel();
    if (ok) this.runAll();
  };
  notebook.restartAndRunToSelected = async function() {
    const ok = await this.restartKernel();
    if (ok) {
      const targetIdx = this.getSelectedId() ? this.getCells().findIndex(c => c.id === this.getSelectedId()) : -1;
      if (targetIdx === -1) {
        this.runAll();
      } else {
        this.getCells().slice(0, targetIdx + 1).forEach(c => this.runCell(c.id, { advance: false }));
      }
    }
  };
  notebook.interruptKernel = function() {
    if (runSocket.isOpen) {
      runSocket.send({ action: 'interrupt' });
      showToast('⏹ EXECUTION INTERRUPTED', 'danger');
    }
  };

  // Load default notebook
  notebook.insertCellAt(0, [
    '# JUPY - COLAB & JUPYTER SHORTCUTS INTEGRATION',
    '# Press Ctrl + Shift + ? to open the Help Dialog!',
    '# Press Ctrl + / inside CodeMirror to toggle comments!',
    'import time',
    'print("Press Ctrl + Shift + ? to view all keyboard shortcuts!")',
  ].join('\n'));

  // Initialize runtime menu with notebook methods
  initRuntimeMenu({
    menu: runtimeMenu,
    trigger: runtimeMenuTrigger,
    dropdown: runtimeMenuDropdown,
    notebook,
  });

  initEnvTopbarMenu({
    menu: envTopbarMenu,
    trigger: envTopbarMenuTrigger,
    dropdown: envTopbarMenuDropdown,
    envManager,
  });
})();