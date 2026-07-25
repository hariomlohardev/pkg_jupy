/**
 * core/toast.js
 * Bottom-left brutalist toast notifications.
 */
import { TOAST_VISIBLE_MS, TOAST_FADE_MS } from '../config/constants.js';

/**
 * @param {HTMLElement|null} container
 * @returns {(message: string, type?: 'warning'|'danger'|'success') => void}
 */
export function createToaster(container) {
  return function showToast(message, type = 'warning') {
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), TOAST_FADE_MS);
    }, TOAST_VISIBLE_MS);
  };
}
