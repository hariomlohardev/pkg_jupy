export function initDebugger(notebook, activityBar) {
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
            <label style="font-size:0.7rem;">Breakpoints (use &lt;cell&gt;:line, e.g. <b>&lt;cell&gt;:3</b>)</label>
            <textarea id="dbg-bps" rows="3" style="width:100%; border:var(--border-thick); background:var(--color-bg-well); font-family:var(--font-mono); font-size:0.7rem;"></textarea>
            <button id="dbg-set-bps" class="btn btn-primary" style="font-size:0.7rem;">Set Breakpoints</button>
        </div>
    `;
    document.body.appendChild(panel);

    // E3: render the call stack; click a frame to see its locals
    function renderStack(data) {
        const varsEl = document.getElementById('dbg-variables');
        const stack = data.stack || [];
        if (data.traceback) {
            const tb = document.createElement('pre');
            tb.style.cssText = 'color:var(--color-danger);white-space:pre-wrap;font-size:0.7rem;';
            tb.textContent = data.traceback;
            varsEl.innerHTML = '';
            varsEl.appendChild(tb);
        }
        const wrap = document.createElement('div');
        stack.forEach((fr, i) => {
            const row = document.createElement('div');
            row.style.cssText = 'padding:4px 6px;border-bottom:1px solid var(--color-bg-well);cursor:pointer;';
            row.innerHTML = `<b>#${i}</b> ${fr.function} <span style="opacity:0.6">${fr.file}:${fr.line}</span>`;
            row.addEventListener('click', () => {
                const pre = document.createElement('pre');
                pre.style.cssText = 'white-space:pre-wrap;font-size:0.7rem;margin:4px 0;';
                pre.textContent = JSON.stringify(fr.locals, null, 2);
                row.appendChild(pre);
            });
            wrap.appendChild(row);
        });
        if (!data.traceback) { varsEl.innerHTML = ''; }
        varsEl.appendChild(wrap);
    }

    function connectDebugger() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        debugSocket = new WebSocket(`${protocol}//${location.host}/ws/debugger`);
        debugSocket.onmessage = (ev) => {
            const data = JSON.parse(ev.data);
            if (data.type === 'paused') {
                paused = true;
                const tag = data.postmortem ? 'POST-MORTEM ' : '';
                document.getElementById('dbg-status').textContent =
                    `${tag}Paused at ${data.file}:${data.line} in ${data.function || '?'}`;
                renderStack(data);
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
        const bps = lines.map(line => {
            const parts = line.split(':');
            if (parts.length === 2) {
                return { file: parts[0].trim(), line: parseInt(parts[1].trim()) };
            }
            return null;
        }).filter(b => b !== null);
        fetch('/api/debugger/breakpoints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ breakpoints: bps })
        }).then(() => {
            alert('Breakpoints set');
        });
    });

    // ===== Register on the activity rail (single registration) =====
    // Guarded so the debugger still works if the rail isn't available.
    if (activityBar && typeof activityBar.registerPanel === 'function') {
        const handle = activityBar.registerPanel({
            id: 'debugger',
            icon: '🐞',
            title: 'Debugger',
            panel,
            mount: false,   // fixed-position panel, stays on <body>
        });
        document.getElementById('dbg-close').addEventListener('click', () => handle.close());
    } else {
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
    }

    return { panel };
}