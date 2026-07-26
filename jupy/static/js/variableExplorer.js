export function initVariableExplorer(activityBar) {
  const panel = document.createElement('div');
  panel.id = 'var-explorer-panel';
  panel.style.cssText = `
    width: 320px; min-width: 250px; background: var(--color-surface);
    border-right: var(--border-thick); display: none; flex-direction: column;
    height: 100%; overflow: hidden; flex-shrink: 0;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'padding: 6px 12px; background: var(--color-secondary); color: #111827; font-weight: 800; font-family: var(--font-mono); display: flex; justify-content: space-between;';
  header.innerHTML = `<span>📊 VARIABLES</span><button id="var-close" style="background:none;border:none;color:#111827;cursor:pointer;">✕</button>`;
  panel.appendChild(header);

  const list = document.createElement('div');
  list.id = 'var-list';
  list.style.cssText = 'flex:1; overflow-y: auto; padding: 6px; font-family: var(--font-mono); font-size:0.8rem;';
  panel.appendChild(list);

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn btn-secondary';
  refreshBtn.textContent = '🔄';
  refreshBtn.style.margin = '6px';
  refreshBtn.addEventListener('click', refresh);
  panel.appendChild(refreshBtn);

  let handle = null;

  async function refresh() {
    try {
      const resp = await fetch('/api/variables/list');
      if (!resp.ok) { const text = await resp.text(); throw new Error(`Server error ${resp.status}: ${text.substring(0, 100)}`); }
      const data = await resp.json();
      if (data.error) { list.innerHTML = `<div style="color:var(--color-danger);">${data.error}</div>`; return; }
      const vars = data.variables || [];
      if (vars.length === 0) { list.innerHTML = '<div style="opacity:0.6;">No variables</div>'; return; }
      list.innerHTML = vars.map(v => `
        <div class="var-item" data-name="${v.name}" style="padding:4px 6px; border-bottom:1px solid var(--color-bg-well); cursor:pointer;">
          <span style="font-weight:700;">${v.name}</span>
          <span style="font-size:0.7rem; opacity:0.6;">${v.type}</span>
          <span style="float:right; font-size:0.6rem;">${v.size} B${v.length ? `, len=${v.length}` : ''}</span>
        </div>
      `).join('');
      list.querySelectorAll('.var-item').forEach(el => {
        el.addEventListener('click', () => {
          const name = el.dataset.name;
          fetch('/api/dataframe/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, rows: 10 })
          })
          .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
          .then(data => { if (data.html) showDataFrameModal(name, data.html); })
          .catch(err => { console.error('DataFrame preview error:', err); alert('Could not load DataFrame preview.'); });
        });
      });
    } catch (err) {
      console.error('Variable refresh error:', err);
      list.innerHTML = `<div style="color:var(--color-danger);">⚠️ Could not load variables: ${err.message}</div>`;
    }
  }

  function showDataFrameModal(name, html) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:center; justify-content:center;';
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--color-surface); border:var(--border-thick); padding:16px; max-width:90%; max-height:90%; overflow:auto;';
    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <h3 style="margin:0;">${name}</h3>
        <button id="df-close" class="action-btn">✕</button>
      </div>
      <div id="df-content">${html}</div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.getElementById('df-close').addEventListener('click', () => overlay.remove());
  }

  handle = activityBar.registerPanel({
    id: 'variables',
    icon: '📊',
    title: 'Variables',
    panel,
    mount: true,
    onActivate: () => refresh(),
  });

  panel.querySelector('#var-close').addEventListener('click', () => handle.close());

  return { refresh, panel };
}