/**
 * theme/themeStore.js
 * Front-end client for the backend theme store (/api/themes/*).
 * The backend (files on disk) is the source of truth; this just talks to it.
 */

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

export function createThemeStore() {
  return {
    getRegistry: (refresh = false) => getJSON('/api/themes/registry' + (refresh ? '?refresh=1' : '')),
    getInstalled: () => getJSON('/api/themes/installed'),
    getActive: () => getJSON('/api/themes/active'),
    install: (uniqueName, activate = true) => postJSON('/api/themes/install', { unique_name: uniqueName, activate }),
    uninstall: (uniqueName) => postJSON('/api/themes/uninstall', { unique_name: uniqueName }),
    activate: (uniqueName) => postJSON('/api/themes/activate', { unique_name: uniqueName }),
    activateDefault: () => postJSON('/api/themes/activate', { default: true }),
    upload: (content, filename, name, activate = true) =>
      postJSON('/api/themes/upload', { content, filename, name, activate }),
    update: (uniqueName) => postJSON('/api/themes/update', { unique_name: uniqueName }),
    updateAll: () => postJSON('/api/themes/update', { all: true }),
    refresh: () => postJSON('/api/themes/refresh', {}),
    previewUrl: (uniqueName) => `/api/themes/preview/${encodeURIComponent(uniqueName)}`,
  };
}

/**
 * Make the backend the source of truth on page load:
 *  1. apply the server's active theme (overrides localStorage cache)
 *  2. one-time migrate any localStorage-only themes up to the server
 */
export async function syncThemeFromServer(engine, store) {
  try {
    const active = await store.getActive();
    if (active && !active.is_default && active.theme) {
      engine.applyTheme(active.theme);
      try {
        const inst = engine.getInstalled();
        inst[active.unique_name] = active.theme;
        localStorage.setItem('jupy-themes', JSON.stringify(inst));
        localStorage.setItem('jupy-active-theme', active.unique_name);
      } catch (e) { /* cache is best-effort */ }
    }
    await migrateLocalThemesToServer(engine, store);
  } catch (e) {
    console.warn('[themes] server sync failed — using local cache', e);
  }
}

async function migrateLocalThemesToServer(engine, store) {
  try {
    if (localStorage.getItem('jupy-themes-migrated') === '1') return;
    const local = engine.getInstalled() || {};
    for (const [name, theme] of Object.entries(local)) {
      try {
        const yamlText = engine.exportYaml(theme);
        await store.upload(yamlText, `${name}.yml`, name, false);
      } catch (e) {
        console.warn(`[themes] migration skip "${name}":`, e.message);
      }
    }
    localStorage.setItem('jupy-themes-migrated', '1');
  } catch (e) { /* best-effort */ }
}