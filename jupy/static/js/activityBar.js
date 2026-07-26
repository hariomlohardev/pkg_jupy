/**
 * activityBar.js
 * Colab-style vertical icon rail on the far left. Utility panels register
 * here instead of adding buttons to the topbar. Panels are exclusive:
 * opening one closes the others.
 */
export function initActivityBar() {
  const workspace = document.querySelector('.app-workspace');
  if (!workspace) return null;

  const rail = document.createElement('nav');
  rail.id = 'activity-bar';
  rail.className = 'activity-bar';
  workspace.insertBefore(rail, workspace.firstChild);

  const panelEntries = [];
  let activeId = null;

  function deactivateAllPanels() {
    panelEntries.forEach(entry => {
      entry.btn.classList.remove('active');
      entry.btn.setAttribute('aria-pressed', 'false');
      if (entry.panel) entry.panel.style.display = 'none';
      entry.onDeactivate?.();
    });
    activeId = null;
  }

  function makeBtn(id, icon, title) {
    const btn = document.createElement('button');
    btn.className = 'activity-btn';
    btn.dataset.activityId = id;
    btn.type = 'button';
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = `<span class="activity-icon">${icon}</span>`;
    return btn;
  }

  /**
   * Register a toggleable utility panel (exclusive).
   * @param {object} opts
   * @param {string} opts.id        unique id
   * @param {string} opts.icon      emoji or svg markup
   * @param {string} opts.title     tooltip
   * @param {HTMLElement} opts.panel the panel element
   * @param {boolean} [opts.mount]  insert panel right after the rail (workspace panels)
   * @param {Function} [opts.onActivate]
   * @param {Function} [opts.onDeactivate]
   * @returns {{close: Function, open: Function}}
   */
  function registerPanel({ id, icon, title, panel, mount = false, onActivate, onDeactivate }) {
    const btn = makeBtn(id, icon, title);
    rail.appendChild(btn);
    if (panel) {
      panel.style.display = 'none';
      if (mount) rail.after(panel);
    }
    const entry = { id, btn, panel, onActivate, onDeactivate };
    panelEntries.push(entry);

    btn.addEventListener('click', () => {
      const wasActive = activeId === id;
      deactivateAllPanels();
      if (!wasActive) {
        activeId = id;
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        if (panel) panel.style.display = 'flex';
        onActivate?.();
      }
    });

    return {
      close() { if (activeId === id) deactivateAllPanels(); },
      open()  { if (activeId !== id) btn.click(); },
    };
  }

  /** Register a one-shot action button (no persistent active state). */
  function registerAction({ id, icon, title, onTrigger }) {
    const btn = makeBtn(id, icon, title);
    rail.appendChild(btn);
    btn.addEventListener('click', () => onTrigger?.());
    return btn;
  }

  function addSeparator() {
    const sep = document.createElement('div');
    sep.className = 'activity-separator';
    rail.appendChild(sep);
    return sep;
  }

  return {
    rail,
    registerPanel,
    registerAction,
    addSeparator,
    deactivateAllPanels,
    getActiveId: () => activeId,
  };
}