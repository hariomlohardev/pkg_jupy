/**
 * runtime/aboutDialog.js
 * "About Jupyvenv" modal — fetches GET /api/about (server/handlers.py) and
 * fills in the Jupy version, .jupy_env Python version, venv path,
 * platform, and installed package count.
 */
export function setupAboutDialog({ overlay, closeBtn }) {
  const fields = {
    jupyVersion: document.getElementById('about-jupy-version'),
    pythonVersion: document.getElementById('about-python-version'),
    venvDir: document.getElementById('about-venv-dir'),
    platform: document.getElementById('about-platform'),
    packageCount: document.getElementById('about-package-count'),
  };

  function setAll(text) {
    Object.values(fields).forEach((el) => {
      if (el) el.textContent = text;
    });
  }

  async function open() {
    overlay.hidden = false;
    setAll('…');
    try {
      const res = await fetch('/api/about');
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      if (fields.jupyVersion) fields.jupyVersion.textContent = data.jupy_version ?? '—';
      if (fields.pythonVersion) fields.pythonVersion.textContent = data.python_version ?? '—';
      if (fields.venvDir) fields.venvDir.textContent = data.venv_dir ?? '—';
      if (fields.platform) fields.platform.textContent = data.platform ?? '—';
      if (fields.packageCount) fields.packageCount.textContent = data.package_count ?? '—';
    } catch (err) {
      console.error('Failed to load /api/about:', err);
      setAll('⚠️ error');
    }
  }

  function close() {
    overlay.hidden = true;
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  return { open, close };
}
