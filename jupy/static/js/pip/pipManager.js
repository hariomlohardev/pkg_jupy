/**
 * pip/pipManager.js
 * Left-hand slide-out panel for managing packages in .jupy_env — mirrors
 * terminal/terminal.js's toggle-panel pattern, but on the left side.
 *
 * Lists installed packages (GET /api/pip/list, fetched lazily on first
 * open), filters them client-side against the search box, and
 * installs/uninstalls packages via the existing POST /api/pip/install and
 * POST /api/pip/uninstall endpoints (server/handlers.py) — both of which
 * already return the fresh package list, so the panel re-renders from the
 * response instead of doing a second round-trip.
 */
export function setupPipManager({ panel, closeBtn, listEl, searchInput, installInput, installBtn, showToast, onResize }) {
  let packages = [];
  let loaded = false;
  let busy = false;

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function render() {
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

  async function refresh() {
    try {
      const res = await fetch('/api/pip/list');
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      packages = data.packages || [];
      loaded = true;
      render();
    } catch (err) {
      console.error('Failed to load package list:', err);
      loaded = true;
      listEl.innerHTML = '<div class="pip-manager-empty">⚠️ Failed to load package list.</div>';
    }
  }

  async function install() {
    const spec = installInput.value.trim();
    if (!spec || busy) return;

    busy = true;
    installBtn.disabled = true;
    installBtn.textContent = 'INSTALLING…';

    try {
      const res = await fetch('/api/pip/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: spec }),
      });
      const data = await res.json();
      packages = data.packages || packages;
      loaded = true;
      render();

      if (data.success) {
        showToast(`📦 INSTALLED ${spec.toUpperCase()}`, 'success');
        installInput.value = '';
      } else {
        showToast(`⚠️ FAILED TO INSTALL ${spec.toUpperCase()}`, 'danger');
        console.error('pip install failed:', data.output);
      }
    } catch (err) {
      console.error('Install request failed:', err);
      showToast('⚠️ INSTALL REQUEST FAILED', 'danger');
    } finally {
      busy = false;
      installBtn.disabled = false;
      installBtn.textContent = 'INSTALL';
    }
  }

  async function uninstall(name) {
    if (busy) return;
    busy = true;

    try {
      const res = await fetch('/api/pip/uninstall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      packages = data.packages || packages;
      loaded = true;
      render();

      if (data.success) {
        showToast(`🗑️ REMOVED ${name.toUpperCase()}`, 'warning');
      } else {
        showToast(`⚠️ FAILED TO REMOVE ${name.toUpperCase()}`, 'danger');
        console.error('pip uninstall failed:', data.output);
      }
    } catch (err) {
      console.error('Uninstall request failed:', err);
      showToast('⚠️ REMOVE REQUEST FAILED', 'danger');
    } finally {
      busy = false;
    }
  }

  function open() {
    panel.hidden = false;
    if (!loaded) refresh();
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
  searchInput.addEventListener('input', render);
  installBtn.addEventListener('click', install);
  installInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      install();
    }
  });

  return { open, close, toggle };
}
