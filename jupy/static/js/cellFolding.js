export function initCellFolding(notebook) {
    if (!CodeMirror.fold) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/fold/foldcode.min.js';
        document.head.appendChild(script);
        const script2 = document.createElement('script');
        script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/fold/foldgutter.min.js';
        document.head.appendChild(script2);
        const style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/fold/foldgutter.min.css';
        document.head.appendChild(style);
    }

    setTimeout(() => {
        if (CodeMirror.fold) {
            const cells = notebook.getCells();
            cells.forEach(cell => {
                const cm = cell.cm;
                cm.setOption('foldGutter', true);
                cm.setOption('gutters', ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']);
                cm.setOption('extraKeys', {
                    'Ctrl-Q': (cm) => cm.foldCode(cm.getCursor())
                });
                const toolbar = cell.dom.toolbar;
                const foldBtn = document.createElement('button');
                foldBtn.className = 'action-btn';
                foldBtn.textContent = '⊟';
                foldBtn.title = 'Fold cell';
                foldBtn.style.fontSize = '0.8rem';
                foldBtn.addEventListener('click', () => {
                    const cm = cell.cm;
                    if (cm.foldCode) {
                        const firstLine = cm.firstLine();
                        const lastLine = cm.lastLine();
                        cm.foldCode({ line: firstLine, ch: 0 }, { range: { from: { line: firstLine, ch: 0 }, to: { line: lastLine, ch: 0 } } });
                    }
                });
                toolbar.prepend(foldBtn);
            });
        }
    }, 500);
}