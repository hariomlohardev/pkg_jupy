/**
 * runtime/runtimeMenu.js
 * Jupyter-style "RUNTIME" dropdown menu, top-left of the topbar.
 *
 * Opens on hover OR click, closes on click-outside, Escape, or mouse leaving
 * the whole menu. A short close-delay absorbs the small visual gap between
 * the trigger button and the dropdown (see `top: calc(100% + 6px)` in CSS)
 * so moving the pointer diagonally from trigger -> dropdown doesn't close it
 * mid-transit. `.open` is the single source of truth for visibility — see
 * components/runtime-menu.css, which no longer has a competing `:hover` rule.
 */
export function initRuntimeMenu({ menu, trigger, dropdown, notebook, pipManager, aboutDialog }) {
  const HOVER_CLOSE_DELAY_MS = 250;
  let closeTimer = null;

  function open() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    menu.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function close() {
    menu.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  function scheduleClose() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      close();
      closeTimer = null;
    }, HOVER_CLOSE_DELAY_MS);
  }

  function isOpen() {
    return menu.classList.contains('open');
  }

  // Hover: open immediately on entry, close after a short delay on exit —
  // the delay is cancelled if the pointer re-enters anywhere in the menu
  // (trigger or dropdown) before it fires.
  menu.addEventListener('mouseenter', open);
  menu.addEventListener('mouseleave', scheduleClose);

  // Click: for touch/keyboard users, or anyone who clicks instead of hovering.
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen() ? close() : open();
  });

  document.addEventListener('click', (e) => {
    if (isOpen() && !menu.contains(e.target)) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      close();
      trigger.focus();
    }
  });

  function bind(id, fn) {
    const el = document.getElementById(id);
    el?.addEventListener('click', () => {
      close();
      fn();
    });
  }

  bind('runtime-restart', () => notebook.restartKernel());
  bind('runtime-restart-run-all', () => notebook.restartAndRunAll());
  bind('runtime-restart-run-selected', () => notebook.restartAndRunToSelected());
  bind('runtime-pip-manager', () => pipManager.open());
  bind('runtime-about', () => aboutDialog.open());
}