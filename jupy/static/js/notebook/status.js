/**
 * notebook/status.js
 * Kernel status and last execution time.
 */
export function createStatus(state) {
  let status = 'idle';
  let lastExecTime = null;

  function setStatus(newStatus) {
    status = newStatus;
    const indicator = document.querySelector('.status-indicator');
    const label = document.getElementById('status-label');
    if (indicator) {
      indicator.style.backgroundColor = newStatus === 'busy' ? '#DC2626' : (newStatus === 'queued' ? '#D97706' : '#16A34A');
    }
    if (label) {
      label.textContent = newStatus.toUpperCase();
    }
    if (newStatus === 'idle') {
      lastExecTime = new Date();
      const timeEl = document.getElementById('last-exec-time');
      if (timeEl) timeEl.textContent = lastExecTime.toLocaleTimeString();
    }
  }

  return { setStatus, getStatus: () => status, getLastExecTime: () => lastExecTime };
}
