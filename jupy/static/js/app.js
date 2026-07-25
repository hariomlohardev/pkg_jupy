/**
 * app.js
 * Application entry point.
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
import { setupEnvManager } from './env/envManager.js';

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

  const envPanel = document.getElementById('env-manager-panel');
  const envCloseBtn = document.getElementById('btn-env-manager-close');
  const envModeRadios = Array.from(document.querySelectorAll('input[name="env-mode"]'));
  const envNamedSelect = document.getElementById('env-named-select');
  const envCreateInput = document.getElementById('env-create-input');
  const envCreateBtn = document.getElementById('btn-env-create');
  const envApplyBtn = document.getElementById('btn-env-apply');
  const envStatusLine = document.getElementById('env-status-line');
  const envJupyVersion = document.getElementById('env-jupy-version');
  const envPythonVersion = document.getElementById('env-python-version');
  const envPath = document.getElementById('env-path');
  const envPlatform = document.getElementById('env-platform');
  const envPackageCount = document.getElementById('env-package-count');
  const pipManagerList = document.getElementById('pip-manager-list');
  const pipSearchInput = document.getElementById('pip-search-input');
  const pipInstallInput = document.getElementById('pip-install-input');
  const pipInstallBtn = document.getElementById('btn-pip-install');

  const cellTemplate = document.getElementById('cell-template');
  const insertBarTemplate = document.getElementById('insert-bar-template');

  const showToast = createToaster(toastContainer);

  initTheme(themeToggleBtn);
  initMetricsStream();

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

  const envManager = setupEnvManager({
    panel: envPanel,
    closeBtn: envCloseBtn,
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
    showToast,
    onResize: () => setTimeout(() => notebook.refreshAllEditors(), 50),
    onEnvSwitched: () => showToast('🔄 KERNEL RESTARTED ON NEW ENVIRONMENT', 'danger'),
  });
  envManager.refreshStatus(); // populate the topbar ENV label on boot

  initRuntimeMenu({
    menu: runtimeMenu,
    trigger: runtimeMenuTrigger,
    dropdown: runtimeMenuDropdown,
    notebook,
    envManager,
  });

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

  notebook.insertCellAt(0, [
    '# JUPY - COLAB & JUPYTER SHORTCUTS INTEGRATION',
    '# Press Ctrl + Shift + ? to open the Help Dialog!',
    '# Press Ctrl + / inside CodeMirror to toggle comments!',
    'import time',
    'print("Press Ctrl + Shift + ? to view all keyboard shortcuts!")',
  ].join('\n'));
})();