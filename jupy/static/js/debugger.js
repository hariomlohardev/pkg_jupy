export function initDebugger(notebook) {
    let breakpoints = [];
    let debugSocket = null;
    let paused = false;

    const panel = document.createElement('div');
    panel.id = 'debugger-panel';
    panel.style.cssText = `
        position: fixed; bottom: 60px; right: 20px; width: 400px; max-height: 400px;
        background: var(--color-surface); border: var(--border-thick); box-shadow: var(--shadow-brutal-lg);
        display: none; flex-direction: column; z-index: 9999; overflow: auto;
        padding: 10px; font-family: var(--font-mono); font-size: 0.8rem;
    `;
    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-weight:800;">🐞 DEBUGGER</span>
            <button id="dbg-close" class="action-btn">✕</button>
        </div>
        <div id="dbg-status" style="color:var(--color-secondary);">Idle</div>
        <div id="dbg-controls" style="margin:8px 0; display:flex; gap:6px;">
            <button id="dbg-continue" class="btn btn-secondary">▶ Continue</button>
            <button id="dbg-step-over" class="btn btn-secondary">⤵ Step Over</button>
            <button id="dbg-step-into" class="btn btn-secondary">⤵ Step Into</button>
            <button id="dbg-step-out" class="btn btn-secondary">⤴ Step Out</button>
            <button id="dbg-stop" class="btn btn-danger">⏹ Stop</button>
        </div>
        <div id="dbg-variables" style="max-height:200px; overflow:auto; border-top:1px solid var(--color-border); margin-top:4px; padding-top:4px;"></div>
        <div style="margin-top:8px;">
            <label style="font-size:0.7rem;">Breakpoints (file:line, one per line)</label>
            <textarea id="dbg-bps" rows="3" style="width:100%; border:var(--border-thick); background:var(--color-bg-well); font-family:var(--font-mono); font-size:0.7rem;"></textarea>
            <button id="dbg-set-bps" class="btn btn-primary" style="font-size:0.7rem;">Set Breakpoints</button>
        </div>
    `;
    document.body.appendChild(panel);

    function connectDebugger() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        debugSocket = new WebSocket(`${protocol}//${location.host}/ws/debugger`);
        debugSocket.onmessage = (ev) => {
            const data = JSON.parse(ev.data);
            if (data.type === 'paused') {
                paused = true;
                document.getElementById('dbg-status').textContent = `Paused at ${data.file}:${data.line}`;
                document.getElementById('dbg-variables').textContent = JSON.stringify(data.frame, null, 2);
            } else if (data.type === 'resumed') {
                paused = false;
                document.getElementById('dbg-status').textContent = 'Running';
                document.getElementById('dbg-variables').textContent = '';
            } else if (data.type === 'error') {
                alert('Debugger error: ' + data.message);
            }
        };
        debugSocket.onclose = () => {
            setTimeout(connectDebugger, 1000);
        };
    }
    connectDebugger();

    document.getElementById('dbg-continue').addEventListener('click', () => {
        if (debugSocket && debugSocket.readyState === WebSocket.OPEN) {
            debugSocket.send(JSON.stringify({ action: 'continue' }));
        }
    });
    document.getElementById('dbg-step-over').addEventListener('click', () => {
        if (debugSocket && debugSocket.readyState === WebSocket.OPEN) {
            debugSocket.send(JSON.stringify({ action: 'step_over' }));
        }
    });
    document.getElementById('dbg-step-into').addEventListener('click', () => {
        if (debugSocket && debugSocket.readyState === WebSocket.OPEN) {
            debugSocket.send(JSON.stringify({ action: 'step_into' }));
        }
    });
    document.getElementById('dbg-step-out').addEventListener('click', () => {
        if (debugSocket && debugSocket.readyState === WebSocket.OPEN) {
            debugSocket.send(JSON.stringify({ action: 'step_out' }));
        }
    });
    document.getElementById('dbg-stop').addEventListener('click', () => {
        if (debugSocket && debugSocket.readyState === WebSocket.OPEN) {
            debugSocket.send(JSON.stringify({ action: 'stop' }));
        }
    });

    document.getElementById('dbg-set-bps').addEventListener('click', () => {
        const text = document.getElementById('dbg-bps').value;
        const lines = text.split('\n').filter(l => l.trim());
        const breakpoints = lines.map(line => {
            const parts = line.split(':');
            if (parts.length === 2) {
                return { file: parts[0].trim(), line: parseInt(parts[1].trim()) };
            }
            return null;
        }).filter(b => b !== null);
        fetch('/api/debugger/breakpoints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ breakpoints })
        }).then(() => {
            alert('Breakpoints set');
        });
    });

    document.getElementById('dbg-close').addEventListener('click', () => {
        panel.style.display = 'none';
    });

    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.textContent = '🐞';
    btn.title = 'Toggle Debugger';
    btn.addEventListener('click', () => {
        panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    });
    document.querySelector('.topbar-actions').appendChild(btn);

    return { panel };
}