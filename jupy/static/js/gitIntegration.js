export function initGitIntegration(statusBarContainer) {
    const statusDiv = document.createElement('div');
    statusDiv.id = 'git-status';
    statusDiv.style.cssText = 'margin-left: 12px; font-family: var(--font-mono); font-size:0.7rem;';

    async function refresh() {
        try {
            const resp = await fetch('/api/git/status');
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`Server error ${resp.status}: ${text.substring(0, 100)}`);
            }
            const data = await resp.json();
            if (data.error) {
                statusDiv.textContent = '⚠️ git error';
                return;
            }
            const branch = data.branch || 'unknown';
            const modified = data.modified || [];
            const dirty = modified.length > 0 ? ' ✗' : ' ✓';
            statusDiv.textContent = `${branch}${dirty}`;
            statusDiv.style.cursor = 'pointer';
            statusDiv.title = modified.join('\n') || 'Clean';
            statusDiv.onclick = () => showCommitDialog(modified);
        } catch (err) {
            console.error('Git status error:', err);
            statusDiv.textContent = '⚠️ git error';
        }
    }

    function showCommitDialog(modified) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:center; justify-content:center;';
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--color-surface); border:var(--border-thick); padding:20px; max-width:500px; width:90%;';
        box.innerHTML = `
            <h3 style="margin:0 0 12px;">Commit Changes</h3>
            <p style="font-family:monospace; font-size:0.8rem; max-height:150px; overflow-y:auto;">${modified.join('\n')}</p>
            <input id="commit-msg" type="text" placeholder="Commit message" style="width:100%; padding:6px; margin:8px 0; border:var(--border-thick); background:var(--color-bg-well);">
            <div style="display:flex; gap:8px;">
                <button id="commit-btn" class="btn btn-primary">Commit</button>
                <button id="commit-cancel" class="btn btn-secondary">Cancel</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('commit-btn').addEventListener('click', async () => {
            const msg = document.getElementById('commit-msg').value || 'Update from Jupy';
            try {
                const resp = await fetch('/api/git/commit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msg })
                });
                if (!resp.ok) {
                    const text = await resp.text();
                    throw new Error(`Server error ${resp.status}: ${text.substring(0, 100)}`);
                }
                const data = await resp.json();
                if (data.success) {
                    alert('Committed successfully!');
                    refresh();
                } else {
                    alert('Commit failed: ' + (data.error || 'unknown error'));
                }
            } catch (err) {
                alert('Commit error: ' + err.message);
            }
            overlay.remove();
        });
        document.getElementById('commit-cancel').addEventListener('click', () => overlay.remove());
    }

    statusBarContainer.appendChild(statusDiv);
    refresh();
    return { refresh };
}