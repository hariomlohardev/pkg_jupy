/**
 * theme/themePanel.js
 * 🎨 Themes panel on the activity rail: upload, install, apply, export,
 * delete, one-click samples, template download, reset to default.
 */
export function initThemePanel(activityBar, engine, showToast) {
  const panel = document.createElement('div');
  panel.id = 'theme-panel';
  panel.style.cssText = `
    width: 320px; min-width: 260px; background: var(--color-surface);
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

  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function swatch(color, size = '16px') {
    return `<span style="display:inline-block;width:${size};height:${size};border:1.5px solid var(--color-border);background:${color};vertical-align:middle;"></span>`;
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
      <div style="font-weight:800;font-size:0.85rem;margin-bottom:2px;">${escapeHtml(t.name)}</div>
      <div style="opacity:0.6;margin-bottom:8px;">by ${escapeHtml(t.author || 'unknown')} · v${t.version || 1}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;">
        ${swatch(L.primary)}${swatch(L.secondary)}${swatch(L.success)}${swatch(L.warning)}${swatch(L.danger)}${swatch(L.surface)}${swatch(L.text)}${swatch(L.bg_well)}
      </div>`;
  }

  // ---- Upload zone ----
  const upload = document.createElement('div');
  upload.style.cssText = 'border:2px dashed var(--color-border); border-radius:var(--rounded-md); padding:14px; text-align:center; cursor:pointer;';
  upload.innerHTML = `<div style="font-weight:800;">⬆ UPLOAD THEME</div><div style="opacity:0.6;margin-top:4px;">Drop a .yml / .yaml / .json here<br>or click to browse</div>`;
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.yml,.yaml,.json'; fileInput.style.display = 'none';
  upload.appendChild(fileInput);
  body.appendChild(upload);

  const errorBox = document.createElement('div');
  errorBox.style.cssText = 'display:none; border:var(--border-thick); border-color:var(--color-danger); color:var(--color-danger); border-radius:var(--rounded-sm); padding:8px; white-space:pre-wrap;';
  body.appendChild(errorBox);
  const showError = (errs) => { errorBox.style.display = 'block'; errorBox.textContent = '✕ ' + errs.join('\n✕ '); };
  const hideError = () => { errorBox.style.display = 'none'; errorBox.textContent = ''; };

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

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const theme = engine.parse(reader.result, file.name);
        const v = engine.validate(theme);
        if (!v.ok) { showError(v.errors); showToast('⚠️ INVALID THEME FILE', 'danger'); return; }
        engine.installTheme(theme);
        engine.activate(theme.name);
        renderAll();
        showToast(`🎨 INSTALLED "${theme.name.toUpperCase()}"`, 'success');
      } catch (err) {
        showError(['Could not parse file: ' + err.message]);
        showToast('⚠️ COULD NOT PARSE THEME', 'danger');
      }
    };
    reader.readAsText(file);
  }

  // ---- Installed list ----
  const listSection = document.createElement('div');
  body.appendChild(listSection);
  function renderList() {
    const installed = engine.getInstalled();
    const activeKey = engine.getActiveKey();
    const names = Object.keys(installed);
    listSection.innerHTML = `<div style="font-weight:800;color:var(--color-primary);border-bottom:1px solid var(--color-bg-well);padding-bottom:4px;margin-bottom:6px;">INSTALLED (${names.length})</div>`;
    if (!names.length) {
      listSection.innerHTML += `<div style="opacity:0.55;padding:8px 0;">No custom themes yet. Upload one above, or install a sample below.</div>`;
      return;
    }
    names.forEach(name => {
      const t = installed[name];
      const L = t.colors.light;
      const isActive = activeKey === name;
      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:8px;padding:7px 6px;border:var(--border-thick);border-radius:var(--rounded-sm);margin-bottom:6px;${isActive ? 'background:var(--color-secondary-tint);' : ''}`;
      row.innerHTML = `
        <span style="display:flex;gap:2px;">${swatch(L.primary,'12px')}${swatch(L.secondary,'12px')}${swatch(L.surface,'12px')}${swatch(L.text,'12px')}</span>
        <span style="flex:1;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(name)}${isActive ? ' ●' : ''}</span>`;
      const applyBtn = mkBtn('APPLY', 'btn-primary');
      const exportBtn = mkBtn('⬇', 'btn-secondary');
      const delBtn = mkBtn('✕', 'btn-secondary');
      applyBtn.addEventListener('click', () => { engine.activate(name); renderAll(); showToast(`🎨 APPLIED "${name.toUpperCase()}"`, 'success'); });
      exportBtn.addEventListener('click', () => downloadText(engine.exportYaml(t), slug(name) + '.yml'));
      delBtn.addEventListener('click', () => {
        if (confirm(`Delete theme "${name}"?`)) { engine.removeTheme(name); renderAll(); showToast('🗑 THEME DELETED', 'warning'); }
      });
      row.appendChild(applyBtn); row.appendChild(exportBtn); row.appendChild(delBtn);
      listSection.appendChild(row);
    });
  }

  // ---- Samples ----
  const samples = document.createElement('div');
  body.appendChild(samples);
  const SAMPLES = [
    { key: 'nord', label: '❄ Nord' },
    { key: 'solarized', label: '☀ Solarized' },
    { key: 'monokai', label: '🌑 Monokai' },
  ];
  function renderSamples() {
    samples.innerHTML = `<div style="font-weight:800;color:var(--color-primary);border-bottom:1px solid var(--color-bg-well);padding-bottom:4px;margin-bottom:6px;">SAMPLE THEMES</div>`;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    SAMPLES.forEach(s => {
      const b = mkBtn(s.label, 'btn-secondary');
      b.style.cssText += 'width:100%;justify-content:flex-start;font-size:0.7rem;';
      b.addEventListener('click', () => installSample(s.key));
      wrap.appendChild(b);
    });
    samples.appendChild(wrap);
  }
  async function installSample(key) {
    try {
      const res = await fetch(`/js/theme/themes/${key}.yml`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const theme = engine.parse(await res.text(), key + '.yml');
      const v = engine.validate(theme);
      if (!v.ok) { showError(v.errors); return; }
      engine.installTheme(theme);
      engine.activate(theme.name);
      renderAll();
      showToast(`🎨 INSTALLED "${theme.name.toUpperCase()}"`, 'success');
    } catch (err) {
      showToast('⚠️ COULD NOT LOAD SAMPLE: ' + err.message, 'danger');
    }
  }

  // ---- Footer ----
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:var(--border-thick);';
  const templateBtn = mkBtn('⬇ DOWNLOAD THEME TEMPLATE', 'btn-secondary');
  templateBtn.style.cssText += 'width:100%;font-size:0.68rem;';
  templateBtn.addEventListener('click', () => downloadText(engine.exportYaml(engine.getActiveTheme()), 'my-theme.yml'));
  const resetBtn = mkBtn('↺ RESET TO JUPY DEFAULT', 'btn-secondary');
  resetBtn.style.cssText += 'width:100%;font-size:0.68rem;';
  resetBtn.addEventListener('click', () => { engine.resetToDefault(); renderAll(); showToast('↺ RESET TO DEFAULT THEME', 'warning'); });
  footer.appendChild(templateBtn); footer.appendChild(resetBtn);
  body.appendChild(footer);

  function renderAll() { renderActiveCard(); renderList(); renderSamples(); hideError(); }

  const handle = activityBar.registerPanel({
    id: 'themes', icon: '🎨', title: 'Themes', panel, mount: true,
    onActivate: () => renderAll(),
  });
  header.querySelector('#theme-close').addEventListener('click', () => handle.close());

  return { panel };
}