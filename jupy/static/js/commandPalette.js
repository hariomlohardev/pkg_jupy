export function initCommandPalette(notebook) {
    const overlay = document.createElement('div');
    overlay.id = 'command-palette-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.6); z-index: 99999;
        display: none; align-items: center; justify-content: center;
    `;
    const box = document.createElement('div');
    box.style.cssText = `
        background: var(--color-surface); border: var(--border-thick);
        border-radius: var(--rounded-sm); padding: 16px;
        max-width: 600px; width: 90%; box-shadow: var(--shadow-brutal-lg);
    `;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search commands...';
    input.style.cssText = `
        width: 100%; padding: 8px 12px; font-family: var(--font-mono);
        border: var(--border-thick); background: var(--color-bg-well);
        color: var(--color-text); font-size: 1rem;
    `;
    const list = document.createElement('div');
    list.style.cssText = 'margin-top: 12px; max-height: 300px; overflow-y: auto;';

    const commands = [
        { name: 'Run All Cells', action: () => notebook.runAll() },
        { name: 'Insert Code Cell Below', action: () => notebook.insertCellAt(notebook.getCells().length, '', { focus: true }) },
        { name: 'Insert Markdown Cell Below', action: () => notebook.insertCellAt(notebook.getCells().length, '', { focus: true, type: 'markdown' }) },
        { name: 'Toggle Line Numbers', action: () => notebook.toggleLineNumbers() },
        { name: 'Toggle Theme', action: () => document.getElementById('btn-theme-toggle').click() },
        { name: 'Toggle Terminal', action: () => document.getElementById('btn-terminal-toggle').click() },
        { name: 'Toggle Zen Mode', action: () => window.toggleZenMode ? window.toggleZenMode() : null },
        { name: 'Restart Kernel', action: () => notebook.restartKernel() },
        { name: 'Interrupt Kernel', action: () => notebook.interruptKernel() },
        { name: 'Merge Selected Cells', action: () => notebook.mergeSelectedCells() },
        { name: 'Split Cell at Cursor', action: () => { const id = notebook.getSelectedId(); if (id) notebook.splitCellAtCursor(id); } },
        { name: 'Toggle Variable Explorer', action: () => document.querySelector('[title="Toggle Variable Explorer"]').click() },
        { name: 'Toggle Debugger', action: () => document.querySelector('[title="Toggle Debugger"]').click() },
        { name: 'Toggle File Browser', action: () => document.querySelector('[title="Toggle File Browser"]').click() },
        { name: 'Hyperparameter Tuning', action: () => document.querySelector('[title="Hyperparameter Tuning"]').click() },
    ];

    function filterCommands(query) {
        const q = query.toLowerCase();
        return commands.filter(c => c.name.toLowerCase().includes(q));
    }

    function render(query) {
        const items = filterCommands(query);
        list.innerHTML = items.map((c, i) =>
            `<div class="command-item" data-index="${i}" style="padding:6px 10px; cursor:pointer; border-bottom:1px solid var(--color-bg-well); font-family:var(--font-mono); font-size:0.85rem;">${c.name}</div>`
        ).join('');
        list.querySelectorAll('.command-item').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.index);
                items[idx].action();
                close();
            });
        });
        const first = list.querySelector('.command-item');
        if (first) first.style.background = 'var(--color-secondary)';
    }

    function close() {
        overlay.style.display = 'none';
        input.value = '';
        render('');
    }

    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const first = list.querySelector('.command-item');
            if (first) first.click();
        } else if (e.key === 'Escape') {
            close();
        }
    });

    overlay.appendChild(box);
    box.appendChild(input);
    box.appendChild(list);
    document.body.appendChild(overlay);

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            if (overlay.style.display === 'flex') {
                close();
            } else {
                overlay.style.display = 'flex';
                setTimeout(() => input.focus(), 50);
                render('');
            }
        }
    });

    return { open: () => { overlay.style.display = 'flex'; input.focus(); }, close };
}