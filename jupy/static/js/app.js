/**
 * app.js – Main entry point
 * Imports from the 'app' folder for modularity.
 */
import { initTheme } from './theme/theme.js';
import { initMetricsStream } from './metrics/metrics.js';
import { ReconnectingSocket } from './core/socket.js';
import { createToaster } from './core/toast.js';
import { setupTerminal } from './terminal/terminal.js';
import { registerAutocomplete } from './autocomplete/autocomplete.js';
import { initShortcuts } from './shortcuts/shortcuts.js';
import { createNotebookController } from './notebook/controller.js';
import { downloadNotebook, parseNotebookFile, readFileAsText } from './notebook/notebookFile.js';
import { initRuntimeMenu } from './runtime/runtimeMenu.js';
import { initEnvTopbarMenu } from './env/envTopbarMenu.js';
import { setupEnvManager } from './env/envManager.js';
import { initWidgetManager } from './widgets/widgetManager.js';
import { initDropdowns } from './app/init.js';
import { initRunDropdown } from './app/run.js';
import { initExportDropdown } from './app/export.js';
import { initEditDropdown } from './app/edit.js';
import { initCommandPalette } from './commandPalette.js';
import { initZenMode } from './zenMode.js';
import { initFileBrowser } from './fileBrowser.js';
import { initGitIntegration } from './gitIntegration.js';
import { initCellFolding } from './cellFolding.js';
import { initVariableExplorer } from './variableExplorer.js';
import { initDebugger } from './debugger.js';
import { initHyperparams } from './hyperparams.js';
import { initTqdmIntegration } from './tqdmIntegration.js';
import { appendCellOutput } from './cells/cellOutput.js'; // FIX #5

(() => {
  // ===== DOM Elements =====
  const container = document.getElementById('notebook');
  const filenameInput = document.getElementById('filename');
  const fileInput = document.getElementById('file-input');
  const openBtn = document.getElementById('btn-open');
  const saveBtn = document.getElementById('btn-save');
  const addCellBtn = document.getElementById('btn-add-bottom');
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
  
  // FIX #5: Expose appendCellOutput globally so tqdmIntegration.js can wrap it
  window.appendCellOutput = appendCellOutput;

  // ===== Theme & Metrics =====
  initTheme(themeToggleBtn);
  initMetricsStream();

  // ===== Run Socket =====
  let notebook = null;
  let reconnectToastShown = false;
  const runSocket = new ReconnectingSocket('/ws/run', {
    onMessage: (data) => {
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
      // FIX #11: Clear queue and reset UI states when connection drops
      if (notebook && typeof notebook.clearExecutionQueue === 'function') {
        notebook.clearExecutionQueue();
      }
    },
  });

  // ===== Widget Manager =====
  const widgetManager = initWidgetManager(runSocket);
  window.__jupy_widgetManager = widgetManager;
  window.__jupy_runSocket = runSocket;

  // ===== Notebook Controller =====
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

  // ===== Terminal =====
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

  // ===== Shortcuts =====
  initShortcuts(notebook);

  // ===== Environment Manager =====
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

  // ===== Dropdown Menus =====
  initDropdowns();
  initRunDropdown(notebook);
  initExportDropdown(notebook, showToast);
  initEditDropdown(notebook, showToast);

  // ===== Command Palette =====
  initCommandPalette(notebook);

  // ===== Zen Mode =====
  initZenMode();

  // ===== File Browser =====
  initFileBrowser(document.querySelector('.app-workspace'));

  // ===== Git Integration =====
  const statusBar = document.querySelector('.system-bar');
  if (statusBar) {
    const gitContainer = document.createElement('span');
    gitContainer.style.display = 'flex';
    gitContainer.style.alignItems = 'center';
    statusBar.appendChild(gitContainer);
    initGitIntegration(gitContainer);
  }

  // ===== Cell Folding =====
  initCellFolding(notebook);

  // ===== Variable Explorer =====
  initVariableExplorer(document.querySelector('.app-workspace'));

  // ===== Debugger =====
  initDebugger(notebook);

  // ===== Hyperparameter Tuning =====
  initHyperparams(notebook);

  // ===== tqdm Integration =====
  initTqdmIntegration(notebook);

  // ===== Presentation Button =====
  document.getElementById('btn-presentation')?.addEventListener('click', () => {
    notebook.togglePresentation();
  });

  // ===== Restart / Interrupt methods =====
  notebook.restartKernel = async function() {
    try {
      const res = await fetch('/api/restart', { method: 'POST' });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      
      // FIX #11: Clear any pending executions before wiping outputs
      if (typeof this.clearExecutionQueue === 'function') {
        this.clearExecutionQueue();
      }

      this.getCells().forEach((c) => {
        c.execCount = null;
        c.dom.execCountEl.textContent = '[\u00A0]';
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
      const targetIdx = this.getSelectedId()
        ? this.getCells().findIndex(c => c.id === this.getSelectedId())
        : -1;
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

  // ===== Open / Save =====
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

  // ===== Add Cell Button =====
  addCellBtn?.addEventListener('click', () => {
    notebook.insertCellAt(notebook.getCells().length, '', { focus: true });
  });

  // ===== Default Notebook =====
  notebook.insertCellAt(0, [
    '# JUPY - FULL FEATURED LOCAL NOTEBOOK',
    '# Press Ctrl + Shift + P for command palette',
    '# Press Ctrl + Shift + ? for shortcuts help',
    'import time',
    'print("Welcome to Jupy!")',
  ].join('\n'));

  // ===== Menus =====
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