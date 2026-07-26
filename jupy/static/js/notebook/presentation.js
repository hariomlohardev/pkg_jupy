/**
 * notebook/presentation.js
 * Presentation mode toggle.
 */
export function createPresentation() {
  let presentationMode = false;

  function toggle() {
    presentationMode = !presentationMode;
    document.body.classList.toggle('presentation-mode', presentationMode);
    const topbar = document.querySelector('.topbar');
    const systemBar = document.querySelector('.system-bar-wrapper');
    const envPanel = document.getElementById('env-manager-panel');
    const terminalPanel = document.getElementById('terminal-panel');
    if (topbar) topbar.style.display = presentationMode ? 'none' : '';
    if (systemBar) systemBar.style.display = presentationMode ? 'none' : '';
    if (envPanel) envPanel.style.display = presentationMode ? 'none' : '';
    if (terminalPanel) terminalPanel.style.display = presentationMode ? 'none' : '';
    const notebookPanel = document.querySelector('.notebook-panel');
    if (notebookPanel) {
      notebookPanel.style.transform = presentationMode ? 'scale(0.8)' : '';
      notebookPanel.style.transformOrigin = 'top left';
    }
  }

  return { toggle, isActive: () => presentationMode };
}
