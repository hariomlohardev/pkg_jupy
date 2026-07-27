/**
 * theme/themePanel.js
 * 🎨 Themes panel on the activity rail: STORE (browse/install from registry),
 * INSTALLED (apply/update/export/remove), UPLOAD, samples, reset.
 * Backend (ThemeStore on disk) is the source of truth.
 */
export function initThemePanel(activityBar, engine, showToast, store) {
  const panel = document.createElement('div');
  panel.id = 'theme-panel';
  panel.style.cssText = `
    width: 340px; min-width: 280px; background: var(--color-surface);
    border-right: var(--border-thick); display: none; flex-direction: column;
    height: 100%; overflow: hidden; flex-shrink: 0;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'padding:6px 12px; background:var(--color-primary); color:var(--color-on-primary); font-weight:800; font-family:var(--font-mono); display:flex; justify-content:space-between; align-items:center;';
  header.innerHTML = `<span>🎨 THEMES</span><button id="theme-close" style="background:none;border:none;color:inherit;cursor:pointer;font-size:1rem;">✕</button>`;
  panel.appendChild(header);

  const body = document.createElement('div');
  body.style.cssText = 'flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:14px; font-family:var(--font-mono); font-size:0.75rem;';
  panel.appendChild(body);

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function swatch(color, size = '14px') {
    return `<span style="display:inline-block;width:${size};height:${size};border:1.5px solid var(--color-border);background:${color};vertical-align:middle;border-radius:2px;"></span>`;
  }
  function mkBtn(text, cls) {
    const b = document.createElement('button');
    b.className = 'btn ' + cls;
    b.textContent = text;
    b.style.cssText = 'padding:2px 7px;font-size:0.62rem;';
    return b;
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme'; }
  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // ---- Active theme card ----
  const activeCard = document.createElement('div');
  activeCard.style.cssText = 'border:var(--border-thick); border-radius:var(--rounded-md); padding:10px; box-shadow:var(--shadow-brutal-sm);';
  body.appendChild(activeCard);

  function renderActiveCard() {
    const t = engine.getActiveTheme();
    const L = t.colors.light;
    activeCard.innerHTML = `
      <div style="font-weight:800;font-size:0.85rem;margin-bottom:2px;">${esc(t.name)}</div>
      <div style="opacity:0.6;margin-bottom:8px;">by ${esc(t.author || 'unknown')} · v${t.version || 1}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        ${swatch(L.primary)}${swatch(L.secondary)}${swatch(L.success)}${swatch(L.warning)}${swatch(L.danger)}${swatch(L.surface)}${swatch(L.text)}${swatch(L.bg_well)}
      </div>`;
  }

  // ---- STORE section ----
  const storeSection = document.createElement('div');
  body.appendChild(storeSection);

  async function renderStore() {
    storeSection.innerHTML = `<div style="font-weight:800;color:var(--color-primary);border-bottom:1px solid var(--color-bg-well);padding-bottom:4px;margin-bottom:6px;">🏪 THEME STORE</div><div style="opacity:0.6;">Loading…</div>`;
    try {
      const reg = await store.getRegistry();
      const themes = reg.themes || [];
      const installedRes = await store.getInstalled();
      const installedNames = new Set((installedRes.installed || []).map(t => t.unique_name));
      const updateNames = new Set((installedRes.updates || []).map(u => u.unique_name));

      let html = `<div style="font-weight:800;color:var(--color-primary);border-bottom:1px solid var(--color-bg-well);padding-bottom:4px;margin-bottom:6px;">🏪 THEME STORE (${themes.length})</div>`;
      if (!themes.length) {
        html += `<div style="opacity:0.6;">Registry is empty or unreachable.</div>`;
        storeSection.innerHTML = html;
        return;
      }
      storeSection.innerHTML = html;
      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

      themes.forEach(t => {
        const isInstalled = installedNames.has(t.unique_name);
        const hasUpdate = updateNames.has(t.unique_name);
        const card = document.createElement('div');
        card.style.cssText = 'border:var(--border-thick);border-radius:var(--rounded-sm);padding:8px;display:flex;gap:8px;align-items:flex-start;';

        const img = document.createElement('img');
        img.src = store.previewUrl(t.unique_name);
        img.style.cssText = 'width:48px;height:48px;object-fit:cover;border:1px solid var(--color-border);border-radius:3px;flex-shrink:0;background:var(--color-bg-well);';
        img.onerror = () => { img.style.display = 'none'; };

        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';
        info.innerHTML = `
          <div style="font-weight:800;font-size:0.8rem;">${esc(t.name || t.unique_name)}</div>
          <div style="opacity:0.6;font-size:0.65rem;">by ${esc((t.author && t.author.display_name) || t.author?.github || 'unknown')} · v${t.version || '?'}</div>
          <div style="opacity:0.5;font-size:0.62rem;margin-top:2px;">${esc((t.tags || []).join(', '))}</div>`;

        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:4px;flex-shrink:0;align-items:center;';

        if (!isInstalled) {
          const installBtn = mkBtn('INSTALL', 'btn-primary');
          installBtn.addEventListener('click', async () => {
            installBtn.disabled = true;
            installBtn.textContent = '…';
            try {
              const res = await store.install(t.unique_name, false);
              if (res.success) {
                showToast(`🎨 INSTALLED "${(t.name || t.unique_name).toUpperCase()}"`, 'success');
                renderAll();
              } else {
                showToast('⚠️ INSTALL FAILED: ' + (res.error || ''), 'danger');
                installBtn.disabled = false;
                installBtn.textContent = 'INSTALL';
              }
            } catch (e) {
              showToast('⚠️ INSTALL FAILED', 'danger');
              installBtn.disabled = false;
              installBtn.textContent = 'INSTALL';
            }
          });
          btns.appendChild(installBtn);
        } else if (hasUpdate) {
          const updateBtn = mkBtn('UPDATE', 'btn-warning');
          updateBtn.addEventListener('click', async () => {
            updateBtn.disabled = true;
            try {
              await store.update(t.unique_name);
              showToast(`🎨 UPDATED "${(t.name || t.unique_name).toUpperCase()}"`, 'success');
              renderAll();
            } catch (e) {
              showToast('⚠️ UPDATE FAILED', 'danger');
              updateBtn.disabled = false;
            }
          });
          btns.appendChild(updateBtn);
        } else {
          const badge = document.createElement('span');
          badge.textContent = '✓';
          badge.style.cssText = 'color:var(--color-success);font-weight:800;font-size:0.9rem;';
          btns.appendChild(badge);
        }

        card.appendChild(img);
        card.appendChild(info);
        card.appendChild(btns);
        list.appendChild(card);
      });
      storeSection.appendChild(list);
    } catch (e) {
      storeSection.innerHTML = `<div style="font-weight:800;color:var(--color-primary);border-bottom:1px solid var(--color-bg-well);padding-bottom:4px;margin-bottom:6px;">🏪 THEME STORE</div><div style="color:var(--color-danger);">⚠️ ${esc(e.message)}</div>`;
    }
  }

  // ---- Installed section ----
  const installedSection = document.createElement('div');
  body.appendChild(installedSection);

  async function renderInstalled() {
    try {
      const res = await store.getInstalled();
      const items = res.installed || [];
      const activeName = res.active;
      const updateNames = new Set((res.updates || []).map(u => u.unique_name));

      let html = `<div style="font-weight:800;color:var(--color-primary);border-bottom:1px solid var(--color-bg-well);padding-bottom:4px;margin-bottom:6px;">INSTALLED (${items.length})</div>`;
      if (!items.length) {
        html += `<div style="opacity:0.55;padding:6px 0;">No custom themes yet. Browse the store above.</div>`;
        installedSection.innerHTML = html;
        return;
      }
      installedSection.innerHTML = html;
      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

      items.forEach(t => {
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:6px;padding:6px;border:var(--border-thick);border-radius:var(--rounded-sm);${t.active ? 'background:var(--color-secondary-tint);' : ''}`;
        row.innerHTML = `<span style="flex:1;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t.name || t.unique_name)}${t.active ? ' ●' : ''}${updateNames.has(t.unique_name) ? ' <span style="color:var(--color-warning);">●</span>' : ''}</span>`;

        const applyBtn = mkBtn('APPLY', 'btn-primary');
        applyBtn.addEventListener('click', async () => {
          try {
            const res2 = await store.activate(t.unique_name);
            if (res2.success && res2.active && res2.active.theme) {
              engine.applyTheme(res2.active.theme);
            }
            renderAll();
            showToast(`🎨 APPLIED "${(t.name || t.unique_name).toUpperCase()}"`, 'success');
          } catch (e) {
            showToast('⚠️ APPLY FAILED', 'danger');
          }
        });

        const exportBtn = mkBtn('⬇', 'btn-secondary');
        exportBtn.addEventListener('click', async () => {
          try {
            const theme = engine.getInstalled()[t.unique_name] || engine.getActiveTheme();
            downloadText(engine.exportYaml(theme), slug(t.unique_name) + '.yml');
          } catch (e) {
            showToast('⚠️ EXPORT FAILED', 'danger');
          }
        });

        const delBtn = mkBtn('✕', 'btn-secondary');
        delBtn.addEventListener('click', async () => {
          if (!confirm(`Delete theme "${t.name || t.unique_name}"?`)) return;
          try {
            await store.uninstall(t.unique_name);
            engine.removeTheme(t.unique_name);
            renderAll();
            showToast('🗑 THEME DELETED', 'warning');
          } catch (e) {
            showToast('⚠️ DELETE FAILED', 'danger');
          }
        });

        row.appendChild(applyBtn);
        row.appendChild(exportBtn);
        row.appendChild(delBtn);
        list.appendChild(row);
      });
      installedSection.appendChild(list);
    } catch (e) {
      installedSection.innerHTML = `<div style="color:var(--color-danger);">⚠️ ${esc(e.message)}</div>`;
    }
  }

  // ---- Upload zone ----
  const upload = document.createElement('div');
  upload.style.cssText = 'border:2px dashed var(--color-border); border-radius:var(--rounded-md); padding:12px; text-align:center; cursor:pointer;';
  upload.innerHTML = `<div style="font-weight:800;">⬆ UPLOAD THEME</div><div style="opacity:0.6;margin-top:4px;">Drop .yml / .yaml / .json or click</div>`;
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.yml,.yaml,.json'; fileInput.style.display = 'none';
  upload.appendChild(fileInput);
  body.appendChild(upload);

  const errorBox = document.createElement('div');
  errorBox.style.cssText = 'display:none; border:var(--border-thick); border-color:var(--color-danger); color:var(--color-danger); border-radius:var(--rounded-sm); padding:8px; white-space:pre-wrap;';
  body.appendChild(errorBox);

  upload.addEventListener('click', () => fileInput.click());
  upload.addEventListener('dragover', (e) => { e.preventDefault(); upload.style.background = 'var(--color-secondary-tint)'; });
  upload.addEventListener('dragleave', () => { upload.style.background = ''; });
  upload.addEventListener('drop', (e) => {
    e.preventDefault(); upload.style.background = '';
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = '';
  });

  async function handleFile(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        errorBox.style.display = 'none';
        const res = await store.upload(reader.result, file.name, null, true);
        if (res.success) {
          // apply immediately
          const active = await store.getActive();
          if (active && active.theme) engine.applyTheme(active.theme);
          renderAll();
          showToast(`🎨 INSTALLED "${(res.theme?.name || file.name).toUpperCase()}"`, 'success');
        } else {
          errorBox.style.display = 'block';
          errorBox.textContent = '✕ ' + (res.error || 'Unknown error');
          showToast('⚠️ INVALID THEME FILE', 'danger');
        }
      } catch (err) {
        errorBox.style.display = 'block';
        errorBox.textContent = '✕ ' + err.message;
        showToast('⚠️ COULD NOT PARSE THEME', 'danger');
      }
    };
    reader.readAsText(file);
  }

  // ---- Footer ----
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:var(--border-thick);';
  const templateBtn = mkBtn('⬇ DOWNLOAD THEME TEMPLATE', 'btn-secondary');
  templateBtn.style.cssText += 'width:100%;font-size:0.68rem;';
  templateBtn.addEventListener('click', () => downloadText(engine.exportYaml(engine.getActiveTheme()), 'my-theme.yml'));
  const resetBtn = mkBtn('↺ RESET TO JUPY DEFAULT', 'btn-secondary');
  resetBtn.style.cssText += 'width:100%;font-size:0.68rem;';
  resetBtn.addEventListener('click', async () => {
    try {
      await store.activateDefault();
      engine.resetToDefault();
      renderAll();
      showToast('↺ RESET TO DEFAULT THEME', 'warning');
    } catch (e) {
      engine.resetToDefault();
      renderAll();
    }
  });
  footer.appendChild(templateBtn);
  footer.appendChild(resetBtn);
  body.appendChild(footer);

  function renderAll() {
    renderActiveCard();
    renderStore();
    renderInstalled();
    errorBox.style.display = 'none';
  }

  const handle = activityBar.registerPanel({
    id: 'themes', icon: '🎨', title: 'Themes', panel, mount: true,
    onActivate: () => renderAll(),
  });
  header.querySelector('#theme-close').addEventListener('click', () => handle.close());
  return { panel };
}