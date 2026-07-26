/**
 * persistence/checkpoints.js
 * Snapshot drawer on the activity rail: save/list/restore notebook versions.
 */
import { serializeNotebook, parseNotebookFile } from '../notebook/notebookFile.js';

export function initCheckpoints(notebook, filenameInput, showToast, activityBar) {
  const panel = document.createElement('div');
  panel.id = 'checkpoints-panel';
  panel.style.cssText = `
    width: 300px; min-width: 240px; background: var(--color-surface);
    border-right: var(--border-thick); display: none; flex-direction: column;
    height: 100%; overflow: hidden; flex-shrink: 0;
  `;
  panel.innerHTML = `
    <div style="padding:6px 12px; background:var(--color-secondary); color:#111827; font-weight:800;
      font-family:var(--font-mono); display:flex; justify-content:space-between;">
      <span>🕘 CHECKPOINTS</span><button id="cp-close" style="background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div style="padding:10px; display:flex; flex-direction:column; gap:8px; flex:1; overflow-y:auto; font-family:var(--font-mono); font-size:0.75rem;">
      <button id="cp-snapshot" class="btn btn-primary">+ SNAPSHOT NOW</button>
      <div id="cp-list"></div>
    </div>`;

  const name = () => (filenameInput?.value || 'Untitled').replace(/\.ipynb$/, '');
  let handle = null;

  async function refresh() {
    const list = panel.querySelector('#cp-list');
    const res = await fetch('/api/checkpoints/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name() }),
    });
    const data = await res.json();
    const items = data.checkpoints || [];
    list.innerHTML = items.length ? '' : '<div style="opacity:0.6">No snapshots yet.</div>';
    items.forEach(cp => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:4px 2px; border-bottom:1px solid var(--color-bg-well);';
      row.innerHTML = `<span>${cp}</span>`;
      const restore = document.createElement('button');
      restore.className = 'btn btn-secondary';
      restore.textContent = 'RESTORE';
      restore.style.fontSize = '0.65rem';
      restore.addEventListener('click', async () => {
        if (!confirm(`Restore ${cp}? Current unsaved work will be replaced.`)) return;
        const r = await fetch('/api/checkpoints/restore', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkpoint: cp }),
        });
        const d = await r.json();
        if (d.success) {
          notebook.loadNotebook(parseNotebookFile(d.content));
          showToast('🕘 CHECKPOINT RESTORED', 'success');
        } else showToast('⚠️ RESTORE FAILED', 'danger');
      });
      row.appendChild(restore);
      list.appendChild(row);
    });
  }

  panel.querySelector('#cp-snapshot').addEventListener('click', async () => {
    const res = await fetch('/api/checkpoints/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name(), content: serializeNotebook(notebook.getCells()) }),
    });
    const data = await res.json();
    if (data.success) { showToast('🕘 SNAPSHOT SAVED', 'success'); refresh(); }
    else showToast('⚠️ SNAPSHOT FAILED', 'danger');
  });

  handle = activityBar.registerPanel({
    id: 'checkpoints',
    icon: '🕘',
    title: 'Checkpoints',
    panel,
    mount: true,
    onActivate: () => refresh(),
  });

  panel.querySelector('#cp-close').addEventListener('click', () => handle.close());

  return { snapshot: () => panel.querySelector('#cp-snapshot').click() };
}