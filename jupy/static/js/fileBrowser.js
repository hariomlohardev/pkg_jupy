export function initFileBrowser(container) {
    const panel = document.createElement('div');
    panel.id = 'file-browser-panel';
    panel.style.cssText = `
        width: 280px; min-width: 200px; background: var(--color-surface);
        border-right: var(--border-thick); display: none; flex-direction: column;
        height: 100%; overflow: hidden; flex-shrink: 0;
    `;
    const header = document.createElement('div');
    header.style.cssText = 'padding: 6px 12px; background: var(--color-primary); color: #fff; font-weight: 800; font-family: var(--font-mono); display: flex; justify-content: space-between;';
    header.innerHTML = `<span>📁 FILES</span><button id="fb-close" style="background:none;border:none;color:#fff;cursor:pointer;">✕</button>`;
    panel.appendChild(header);

    const list = document.createElement('div');
    list.id = 'fb-list';
    list.style.cssText = 'flex:1; overflow-y: auto; padding: 6px;';
    panel.appendChild(list);

    const workspace = document.querySelector('.app-workspace');
    workspace.insertBefore(panel, workspace.firstChild);

    let currentPath = '.';

    async function refresh(path = '.') {
        currentPath = path;
        try {
            const resp = await fetch('/api/files/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`Server error ${resp.status}: ${text.substring(0, 100)}`);
            }
            const data = await resp.json();
            if (data.error) {
                list.innerHTML = `<div style="color:var(--color-danger);">${data.error}</div>`;
                return;
            }
            list.innerHTML = data.items.map(item => `
                <div class="fb-item" data-path="${item.name}" style="padding:4px 6px; border-bottom:1px solid var(--color-bg-well); cursor:pointer; display:flex; justify-content:space-between;">
                    <span>${item.is_dir ? '📁' : '📄'} ${item.name}</span>
                    <span style="font-size:0.7rem; opacity:0.6;">${item.is_dir ? '' : (item.size/1024).toFixed(1)+'KB'}</span>
                </div>
            `).join('');
            list.querySelectorAll('.fb-item').forEach(el => {
                el.addEventListener('click', () => {
                    const name = el.dataset.path;
                    const isDir = data.items.find(i => i.name === name)?.is_dir;
                    if (isDir) {
                        refresh(name);
                    } else if (name.endsWith('.ipynb')) {
                        fetch('/api/files/read', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ path: currentPath + '/' + name })
                        })
                        .then(res => {
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            return res.json();
                        })
                        .then(data => {
                            if (data.content) {
                                const notebook = window.__jupy_notebook;
                                const cells = parseNotebookFile(data.content);
                                notebook.loadNotebook(cells);
                                document.getElementById('filename').value = name.replace('.ipynb', '');
                            }
                        })
                        .catch(err => {
                            console.error('Failed to open notebook:', err);
                            alert('Could not open notebook: ' + err.message);
                        });
                    }
                });
            });
        } catch (err) {
            console.error('File browser refresh error:', err);
            list.innerHTML = `<div style="color:var(--color-danger);">⚠️ ${err.message}</div>`;
        }
    }

    document.getElementById('fb-close').addEventListener('click', () => {
        panel.style.display = 'none';
    });

    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.textContent = '📁';
    btn.title = 'Toggle File Browser';
    btn.addEventListener('click', () => {
        if (panel.style.display === 'none') {
            panel.style.display = 'flex';
            refresh('.');
        } else {
            panel.style.display = 'none';
        }
    });
    document.querySelector('.topbar-actions').prepend(btn);

    return { refresh, panel };
}