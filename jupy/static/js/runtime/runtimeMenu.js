/**
 * runtime/runtimeMenu.js
 * Jupyter-style "RUNTIME" dropdown menu, top-left of the topbar next to the
 * brand block. Opens on hover (via CSS, see components/runtime-menu.css)
 * *or* on click (so it also works for touch/keyboard), and wires:
 *   - Restart                              -> notebook.restartKernel()
 *   - Restart and run all                  -> notebook.restartAndRunAll()
 *   - Restart and run to selected cell     -> notebook.restartAndRunToSelected()
 *   - Pip Manager                          -> opens the pip manager panel
 *   - About Jupyvenv                       -> opens the about dialog
 *
 * The dropdown is shown/hidden via an `.open` class rather than the
 * `hidden` attribute, so the CSS `:hover` rule and this module's click
 * handling don't fight over the same mechanism.
 */
export function initRuntimeMenu({ menu, trigger, dropdown, notebook, pipManager, aboutDialog }) {
  function open() {
    menu.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }
  function close() {
    menu.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }
  function isOpen() {
    return menu.classList.contains('open');
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen() ? close() : open();
  });

  document.addEventListener('click', (e) => {
    if (isOpen() && !menu.contains(e.target)) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close();
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
