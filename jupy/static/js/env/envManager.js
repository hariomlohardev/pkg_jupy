/**
 * env/envManager.js
 * Left slide-out "Environment" panel: switch between the global default env,
 * a named global env, or a project-local `.jupy_env`; create new named envs;
 * view active-env details; and manage packages installed in it.
 */
export function setupEnvManager({
  panel, closeBtn,
  modeRadios, namedSelect, createInput, createBtn, applyBtn, statusLine,
  jupyVersionEl, pythonVersionEl, pathEl, platformEl, packageCountEl,
  statusLabelEl,
  listEl, searchInput, installInput, installBtn,
  showToast, onResize, onEnvSwitched,
}) {
  let current = null;
  let globalEnvs = [];
  let packages = [];
  let loaded = false;
  let busy = false;

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function setBusy(isBusy, label) {
    busy = isBusy;
    applyBtn.disabled = isBusy;
    createBtn.disabled = isBusy;
    installBtn.disabled = isBusy;
    if (label) statusLine.textContent = label;
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

    setBusy(true, '⏳ Switching environment (first use may take a moment)…');
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
        onEnvSwitched?.();
      } else {
        showToast('⚠️ FAILED TO SWITCH ENVIRONMENT', 'danger');
        console.error(data.error);
      }
    } catch (err) {
      console.error('Environment switch failed:', err);
      showToast('⚠️ ENVIRONMENT SWITCH REQUEST FAILED', 'danger');
    } finally {
      setBusy(false);
      renderModeUI();
    }
  }

  async function createEnv() {
    const name = createInput.value.trim();
    if (!name || busy) return;

    setBusy(true, `⏳ Creating "${name}"…`);
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
      setBusy(false, current ? `Active: ${current.label}` : '');
    }
  }

  async function install() {
    const spec = installInput.value.trim();
    if (!spec || busy) return;

    setBusy(true, `⏳ Installing ${spec}…`);
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
      setBusy(false, current ? `Active: ${current.label}` : '');
    }
  }

  async function uninstall(name) {
    if (busy) return;
    setBusy(true, `⏳ Removing ${name}…`);

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
      setBusy(false, current ? `Active: ${current.label}` : '');
    }
  }

  function open() {
    panel.hidden = false;
    refreshEnvInfo();
    if (!loaded) refreshPackages();
    if (onResize) onResize();
    setTimeout(() => searchInput.focus(), 50);
  }
  function close() {
    panel.hidden = true;
    if (onResize) onResize();
  }
  function toggle() {
    panel.hidden ? open() : close();
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

  return { open, close, toggle, refreshStatus: refreshEnvInfo };
}