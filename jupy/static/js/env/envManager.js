/**
 * env/envManager.js
 * Left slide-out panel with four views: current, create, pip, outline.
 */
export function setupEnvManager({
  panel, closeBtn, titleEl,
  views, // { current, create, pip, outline }
  modeRadios, namedSelect, createInput, createBtn, applyBtn, statusLine,
  jupyVersionEl, pythonVersionEl, pathEl, platformEl, packageCountEl,
  statusLabelEl,
  listEl, searchInput, installInput, installBtn,
  createStatusLine, existingEnvsEl, pipStatusLine,
  outlineListEl,  // container for outline items
  notebook,       // notebook controller (to get cells and listen)
  showToast, onResize, onEnvSwitched,
}) {
  let current = null;
  let globalEnvs = [];
  let packages = [];
  let loaded = false;
  let busy = false;
  let activeView = null;
  let outlineUpdateTimer = null;
  let cellChangeListeners = [];

  const VIEW_LABELS = {
    current: '📦 CURRENT ENVIRONMENT',
    create: '➕ CREATE ENVIRONMENT',
    pip: '📦 PIP MANAGER',
    outline: '📋 OUTLINE',
  };

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function setBusy(isBusy, label, targetStatusEl) {
    busy = isBusy;
    applyBtn.disabled = isBusy;
    createBtn.disabled = isBusy;
    installBtn.disabled = isBusy;
    if (label && targetStatusEl) targetStatusEl.textContent = label;
  }

  function syncSelectDisabled() {
    const mode = modeRadios.find((r) => r.checked)?.value;
    namedSelect.disabled = mode !== 'named';
  }

  function renderModeUI() {
    if (!current) return;
    modeRadios.forEach((r) => { r.checked = r.value === current.mode; });
    namedSelect.innerHTML = globalEnvs.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    if (current.mode === 'named') namedSelect.value = current.name;
    syncSelectDisabled();
    statusLine.textContent = `Active: ${current.label}`;
    if (statusLabelEl) statusLabelEl.textContent = `ENV: ${current.label.toUpperCase()}`;
  }

  function renderDetails() {
    if (!current) return;
    jupyVersionEl.textContent = current._jupyVersion ?? '—';
    pythonVersionEl.textContent = current.python_version ?? '—';
    pathEl.textContent = current.path ?? '—';
    platformEl.textContent = current._platform ?? '—';
    packageCountEl.textContent = current.package_count ?? '—';
  }

  function renderExistingEnvsList() {
    if (!existingEnvsEl) return;
    existingEnvsEl.textContent = globalEnvs.length ? globalEnvs.join(', ') : '—';
  }

  function renderPackages() {
    const query = searchInput.value.trim().toLowerCase();
    if (!packages.length) {
      listEl.innerHTML = `<div class="pip-manager-empty">${loaded ? 'No packages installed.' : 'Loading packages…'}</div>`;
      return;
    }
    const filtered = query ? packages.filter((p) => p.name.toLowerCase().includes(query)) : packages;
    if (!filtered.length) {
      listEl.innerHTML = `<div class="pip-manager-empty">No packages match “${escapeHtml(searchInput.value.trim())}”.</div>`;
      return;
    }
    listEl.innerHTML = '';
    filtered.forEach((pkg) => {
      const row = document.createElement('div');
      row.className = 'pip-package-row';
      row.innerHTML = `
        <span class="pip-package-name">${escapeHtml(pkg.name)}</span>
        <span class="pip-package-version">${escapeHtml(pkg.version)}</span>
        <button class="action-btn action-danger pip-remove-btn" title="Uninstall ${escapeHtml(pkg.name)}">✕</button>
      `;
      row.querySelector('.pip-remove-btn').addEventListener('click', () => uninstall(pkg.name));
      listEl.appendChild(row);
    });
  }

  // --- Outline ---
  function renderOutline() {
    if (!notebook) return;
    const cells = notebook.getCells();
    const items = [];
    // Improved regex: allows decorators (with optional arguments) and 'async'
    const definitionRegex = /^\s*(?:@\w+(?:\s*\([^)]*\))?\s+)*(?:async\s+)?(?:def|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[\(:]/;
    cells.forEach((cell, idx) => {
      const code = cell.cm.getValue();
      const lines = code.split('\n');
      lines.forEach((line, lineIdx) => {
        const match = line.match(definitionRegex);
        if (match) {
          const name = match[1];
          const kind = line.includes('class') ? 'class' : 'func';
          items.push({ name, kind, cellIdx: idx, line: lineIdx + 1, source: line.trim() });
        }
      });
    });

    if (!outlineListEl) return;
    if (items.length === 0) {
      outlineListEl.innerHTML = '<div class="pip-manager-empty">No functions or classes found.</div>';
      return;
    }
    outlineListEl.innerHTML = '';
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'outline-item';
      div.style.cursor = 'pointer';
      div.style.padding = '4px 6px';
      div.style.borderBottom = '1px solid var(--color-bg-well)';
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.gap = '8px';
      div.innerHTML = `
        <span style="font-weight:800;color:var(--color-primary);">${item.kind === 'class' ? '📦' : '🔧'}</span>
        <span style="font-family:var(--font-mono);font-size:0.8rem;">${escapeHtml(item.name)}</span>
        <span style="font-size:0.65rem;opacity:0.6;margin-left:auto;">cell ${item.cellIdx+1}, line ${item.line}</span>
      `;
      div.addEventListener('click', () => {
        notebook.selectCell(notebook.getCells()[item.cellIdx].id);
        notebook.enterEditMode(notebook.getCells()[item.cellIdx].id);
        const cm = notebook.getCells()[item.cellIdx].cm;
        cm.focus();
        cm.setCursor({ line: item.line - 1, ch: 0 });
        close();
      });
      outlineListEl.appendChild(div);
    });
  }

  function scheduleOutlineUpdate() {
    if (activeView === 'outline') {
      if (outlineUpdateTimer) clearTimeout(outlineUpdateTimer);
      outlineUpdateTimer = setTimeout(() => {
        renderOutline();
        outlineUpdateTimer = null;
      }, 300);
    }
  }

  function startOutlineListening() {
    if (!notebook) return;
    // Remove old listeners
    cellChangeListeners.forEach(unbind => unbind());
    cellChangeListeners = [];
    const cells = notebook.getCells();
    cells.forEach(cell => {
      const handler = () => scheduleOutlineUpdate();
      cell.cm.on('change', handler);
      cellChangeListeners.push(() => cell.cm.off('change', handler));
    });
  }

  function stopOutlineListening() {
    cellChangeListeners.forEach(unbind => unbind());
    cellChangeListeners = [];
  }

  // --- API calls ---
  async function refreshEnvInfo() {
    try {
      const res = await fetch('/api/env/list');
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      current = data.current;
      current._jupyVersion = data.jupy_version;
      current._platform = data.platform;
      globalEnvs = data.global_envs || [];
      renderModeUI();
      renderDetails();
      renderExistingEnvsList();
    } catch (err) {
      console.error('Failed to load environment info:', err);
      statusLine.textContent = '⚠️ Failed to load environment info.';
    }
  }

  async function refreshPackages() {
    try {
      const res = await fetch('/api/pip/list');
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      packages = data.packages || [];
      loaded = true;
      renderPackages();
    } catch (err) {
      console.error('Failed to load package list:', err);
      loaded = true;
      listEl.innerHTML = '<div class="pip-manager-empty">⚠️ Failed to load package list.</div>';
    }
  }

  async function applyEnv() {
    if (busy) return;
    const mode = modeRadios.find((r) => r.checked)?.value || 'global';
    const name = mode === 'named' ? namedSelect.value : undefined;
    setBusy(true, '⏳ Switching environment (first use may take a moment)…', statusLine);
    try {
      const res = await fetch('/api/env/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, name }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`🔁 SWITCHED TO ${data.current.label.toUpperCase()}`, 'success');
        await refreshEnvInfo();
        loaded = false;
        await refreshPackages();
        
        // FIX #6: Actually restart the kernel so the new environment takes effect
        if (notebook && typeof notebook.restartKernel === 'function') {
          await notebook.restartKernel();
        }
        
        onEnvSwitched?.();
      } else {
        showToast('⚠️ FAILED TO SWITCH ENVIRONMENT', 'danger');
        console.error(data.error);
      }
    } catch (err) {
      console.error('Environment switch failed:', err);
      showToast('⚠️ ENVIRONMENT SWITCH REQUEST FAILED', 'danger');
    } finally {
      setBusy(false, null, statusLine);
      renderModeUI();
    }
  }

  async function createEnv() {
    const name = createInput.value.trim();
    if (!name || busy) return;
    setBusy(true, `⏳ Creating "${name}"…`, createStatusLine);
    try {
      const res = await fetch('/api/env/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) {
        globalEnvs = data.global_envs || globalEnvs;
        namedSelect.innerHTML = globalEnvs.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
        namedSelect.value = name;
        renderExistingEnvsList();
        modeRadios.forEach((r) => { r.checked = r.value === 'named'; });
        syncSelectDisabled();
        createInput.value = '';
        showToast(`📦 CREATED ENVIRONMENT "${name.toUpperCase()}"`, 'success');
      } else {
        showToast('⚠️ FAILED TO CREATE ENVIRONMENT', 'danger');
        console.error(data.error);
      }
    } catch (err) {
      console.error('Create environment failed:', err);
      showToast('⚠️ CREATE REQUEST FAILED', 'danger');
    } finally {
      setBusy(false, current ? `Active: ${current.label}` : '', createStatusLine);
    }
  }

  async function install() {
    const spec = installInput.value.trim();
    if (!spec || busy) return;
    setBusy(true, `⏳ Installing ${spec}…`, pipStatusLine);
    try {
      const res = await fetch('/api/pip/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: spec }),
      });
      const data = await res.json();
      packages = data.packages || packages;
      loaded = true;
      renderPackages();
      if (data.success) {
        showToast(`📦 INSTALLED ${spec.toUpperCase()}`, 'success');
        installInput.value = '';
        await refreshEnvInfo();
      } else {
        showToast(`⚠️ FAILED TO INSTALL ${spec.toUpperCase()}`, 'danger');
        console.error('pip install failed:', data.output);
      }
    } catch (err) {
      console.error('Install request failed:', err);
      showToast('⚠️ INSTALL REQUEST FAILED', 'danger');
    } finally {
      setBusy(false, current ? `Active: ${current.label}` : '', pipStatusLine);
    }
  }

  async function uninstall(name) {
    if (busy) return;
    setBusy(true, `⏳ Removing ${name}…`, pipStatusLine);
    try {
      const res = await fetch('/api/pip/uninstall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      packages = data.packages || packages;
      loaded = true;
      renderPackages();
      if (data.success) {
        showToast(`🗑️ REMOVED ${name.toUpperCase()}`, 'warning');
        await refreshEnvInfo();
      } else {
        showToast(`⚠️ FAILED TO REMOVE ${name.toUpperCase()}`, 'danger');
        console.error('pip uninstall failed:', data.output);
      }
    } catch (err) {
      console.error('Uninstall request failed:', err);
      showToast('⚠️ REMOVE REQUEST FAILED', 'danger');
    } finally {
      setBusy(false, current ? `Active: ${current.label}` : '', pipStatusLine);
    }
  }

  // --- View management ---
  function showView(view) {
    Object.entries(views).forEach(([key, el]) => {
      if (el) el.hidden = key !== view;
    });
    activeView = view;
    if (titleEl) titleEl.textContent = VIEW_LABELS[view] || '📦 ENVIRONMENT';
    if (view === 'outline' && notebook) {
      renderOutline();
      startOutlineListening();
      window.__outlineVisible = true;
    } else {
      stopOutlineListening();
      window.__outlineVisible = false;
    }
  }

  function openView(view) {
    if (!views[view]) return;
    if (!panel.hidden && activeView === view) {
      close();
      return;
    }
    showView(view);
    panel.hidden = false;
    refreshEnvInfo();
    if (view === 'pip' && !loaded) refreshPackages();
    if (onResize) onResize();
    if (view === 'pip') setTimeout(() => searchInput.focus(), 50);
    else if (view === 'create') setTimeout(() => createInput.focus(), 50);
  }

  function close() {
    panel.hidden = true;
    activeView = null;
    stopOutlineListening();
    window.__outlineVisible = false;
    if (onResize) onResize();
  }

  closeBtn.addEventListener('click', close);
  searchInput.addEventListener('input', renderPackages);
  installBtn.addEventListener('click', install);
  installInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); install(); }
  });
  applyBtn.addEventListener('click', applyEnv);
  createBtn.addEventListener('click', createEnv);
  createInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); createEnv(); }
  });
  modeRadios.forEach((r) => r.addEventListener('change', syncSelectDisabled));

  // Expose scheduleOutlineUpdate so notebook can call it on cell add/delete/move
  return { openView, close, refreshStatus: refreshEnvInfo, scheduleOutlineUpdate };
}