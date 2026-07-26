export function initHyperparams(notebook) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.textContent = '🎛️';
    btn.title = 'Hyperparameter Tuning';
    btn.addEventListener('click', () => {
        const selectedId = notebook.getSelectedId();
        if (!selectedId) return;
        const cell = notebook.getCells().find(c => c.id === selectedId);
        if (!cell) return;
        const code = cell.cm.getValue();
        const params = [];
        const lines = code.split('\n');
        for (const line of lines) {
            const match = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^#]+)/);
            if (match) {
                const name = match[1];
                let value = match[2].trim();
                let type = 'text';
                if (/^\d+$/.test(value)) type = 'int';
                else if (/^\d+\.\d+$/.test(value)) type = 'float';
                else if (/^True|False$/i.test(value)) type = 'bool';
                else if (/^\[.*\]$/.test(value)) type = 'list';
                params.push({ name, value, type });
            }
        }
        if (params.length === 0) {
            alert('No parameters found in selected cell.');
            return;
        }
        showHyperparamsDialog(cell, params);
    });
    document.querySelector('.topbar-actions').appendChild(btn);

   function toPythonLiteral(value) {
     if (typeof value === 'boolean') return value ? 'True' : 'False';
     if (typeof value === 'number') return String(value);
     if (typeof value === 'string') return JSON.stringify(value);
     return JSON.stringify(value);
   }

    function showHyperparamsDialog(cell, params) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:center; justify-content:center;';
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--color-surface); border:var(--border-thick); padding:20px; max-width:600px; width:90%; max-height:80%; overflow:auto;';
        let html = '<h3 style="margin-top:0;">Hyperparameter Tuning</h3>';
        params.forEach(p => {
            html += `
                <div style="margin:8px 0;">
                    <label style="font-weight:700;">${p.name} (${p.type})</label>
                    <input id="hp-${p.name}" type="${p.type === 'bool' ? 'checkbox' : 'text'}" value="${p.type === 'bool' ? (p.value === 'True' ? 'checked' : '') : p.value}" style="display:block; width:100%; border:var(--border-thick); padding:4px; background:var(--color-bg-well);">
                </div>
            `;
        });
        html += `
            <div style="display:flex; gap:8px; margin-top:12px;">
                <button id="hp-run" class="btn btn-primary">Run with new params</button>
                <button id="hp-cancel" class="btn btn-secondary">Cancel</button>
            </div>
        `;
        box.innerHTML = html;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('hp-run').addEventListener('click', () => {
            const replacements = {};
            params.forEach(p => {
                const input = document.getElementById(`hp-${p.name}`);
                let val = input.value;
                if (p.type === 'int') val = parseInt(val);
                else if (p.type === 'float') val = parseFloat(val);
                else if (p.type === 'bool') val = input.checked;
                replacements[p.name] = val;
            });
            let newCode = cell.cm.getValue();
            for (const [name, val] of Object.entries(replacements)) {
                const regex = new RegExp(`^\\s*${name}\\s*=\\s*[^#]+`, 'm');
                const replacement = `${name} = ${toPythonLiteral(val)}`;
                newCode = newCode.replace(regex, replacement);
            }
            cell.cm.setValue(newCode);
            notebook.runCell(cell.id, { advance: false });
            overlay.remove();
        });
        document.getElementById('hp-cancel').addEventListener('click', () => overlay.remove());
    }
}