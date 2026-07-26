/**
 * persistence/autosave.js
 * Debounced autosave -> POST /api/files/save. Shows SAVED/UNSAVED in the title.
 */
import { serializeNotebook } from '../notebook/notebookFile.js';

export function initAutosave(notebook, filenameInput, statusEl, { debounceMs = 2000 } = {}) {
  let dirty = false;
  let timer = null;
  let saving = false;

  function setIndicator(text, ok) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color = ok ? 'var(--color-success)' : 'var(--color-warning)';
  }

  async function save() {
    if (saving) return;
    saving = true;
    setIndicator('SAVING…', true);
    try {
      const content = serializeNotebook(notebook.getCells());
      const res = await fetch('/api/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: filenameInput?.value || 'Untitled.ipynb', content }),
      });
      const data = await res.json();
      dirty = false;
      setIndicator(data.success ? 'SAVED ✓' : 'SAVE FAILED', data.success);
    } catch {
      setIndicator('SAVE FAILED', false);
    } finally {
      saving = false;
    }
  }

  function markDirty() {
    dirty = true;
    setIndicator('UNSAVED ●', false);
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, debounceMs);
  }

  // watch every cell edit
  notebook.getCells().forEach(c => c.cm.on('change', markDirty));
  // heartbeat so unsaved work is never lost
  setInterval(() => { if (dirty) save(); }, 30000);

  return { save, markDirty, isDirty: () => dirty };
}