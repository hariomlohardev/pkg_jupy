/**
 * ui/sessionNotes.js
 * Scratch/notes panel on the activity rail. Notes persist in the notebook's
 * metadata (jupy.notes) so they travel with the .ipynb file.
 */
export function initSessionNotes(notebook, showToast, activityBar) {
  window.__jupy_notes = window.__jupy_notes || '';

  const panel = document.createElement('div');
  panel.id = 'notes-panel';
  panel.style.cssText = `
    width: 320px; min-width: 260px; background: var(--color-surface);
    border-right: var(--border-thick); display: none; flex-direction: column;
    height: 100%; overflow: hidden; flex-shrink: 0;
  `;
  panel.innerHTML = `
    <div style="padding:6px 12px; background:var(--color-secondary); color:#111827; font-weight:800;
      font-family:var(--font-mono); display:flex; justify-content:space-between;">
      <span>🗒 SESSION NOTES</span><button id="notes-close" style="background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <textarea id="notes-area" spellcheck="false"
      style="flex:1; border:none; resize:none; padding:10px; font-family:var(--font-mono); font-size:0.8rem;
      background:var(--color-bg-well); color:var(--color-text); outline:none;"
      placeholder="Scratch notes, TODOs, links… saved inside the notebook file."></textarea>`;

  const area = panel.querySelector('#notes-area');
  area.value = window.__jupy_notes;
  area.addEventListener('input', () => { window.__jupy_notes = area.value; });

  const handle = activityBar.registerPanel({
    id: 'notes',
    icon: '🗒',
    title: 'Session Notes',
    panel,
    mount: true,
    onActivate: () => setTimeout(() => area.focus(), 50),
  });

  panel.querySelector('#notes-close').addEventListener('click', () => handle.close());

  return { getNotes: () => window.__jupy_notes, setNotes: (t) => { window.__jupy_notes = t; area.value = t; } };
}