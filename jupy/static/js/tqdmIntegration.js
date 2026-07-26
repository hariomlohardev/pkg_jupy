export function initTqdmIntegration(notebook) {
    const originalAppend = window.appendCellOutput;
    if (originalAppend) {
        window.appendCellOutput = function(cell, text, kind) {
            if (kind === 'stdout' && text.includes('%') && text.includes('[') && text.includes(']')) {
                const progress = text.match(/(\d+)%/);
                if (progress) {
                    const pct = parseInt(progress[1]);
                    let bar = cell.dom.outputEl.querySelector('.tqdm-bar');
                    if (!bar) {
                        bar = document.createElement('div');
                        bar.className = 'tqdm-bar';
                        bar.style.cssText = 'width:100%; height:6px; background:var(--color-bg-well); border:1px solid var(--color-border); margin:2px 0;';
                        const fill = document.createElement('div');
                        fill.className = 'tqdm-fill';
                        fill.style.cssText = 'height:100%; background:var(--color-primary); transition:width 0.2s;';
                        bar.appendChild(fill);
                        cell.dom.outputEl.appendChild(bar);
                    }
                    bar.querySelector('.tqdm-fill').style.width = pct + '%';
                    const span = document.createElement('span');
                    span.textContent = text;
                    cell.dom.outputEl.appendChild(span);
                    return;
                }
            }
            originalAppend(cell, text, kind);
        };
    }
}