export function serializeNotebook(cells) {
  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: 'Python 3 (Jupy)', language: 'python', name: 'python3' },
      language_info: { name: 'python', pygments_lexer: 'ipython3' },
    },
    cells: cells.map((cell) => {
      const lines = cell.cm.getValue().split('\n');
      const cellType = cell.type || 'code';
      const outputs = (cell.outputs || []).map(out => {
        if (out.kind === 'stdout') {
          return { output_type: 'stream', name: 'stdout', text: out.text };
        } else if (out.kind === 'stderr') {
          return { output_type: 'stream', name: 'stderr', text: out.text };
        } else if (out.kind === 'plot') {
          return { output_type: 'display_data', data: { 'text/html': out.text } };
        } else if (out.kind === 'display') {
          return { output_type: 'display_data', data: out.data };
        }
        return null;
      }).filter(Boolean);
      return {
        cell_type: cellType,
        metadata: {},
        execution_count: cell.execCount ?? null,
        source: lines.map((line, i) => (i < lines.length - 1 ? line + '\n' : line)),
        outputs: outputs,
      };
    }),
  };
  return JSON.stringify(notebook, null, 2);
}

export function downloadNotebook(cells, filename) {
  const json = serializeNotebook(cells);
  const blob = new Blob([json], { type: 'application/x-ipynb+json' });
  const url = URL.createObjectURL(blob);
  const safeName = filename && filename.trim() ? filename.trim() : 'Untitled.ipynb';
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName.endsWith('.ipynb') ? safeName : `${safeName}.ipynb`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function parseNotebookFile(fileText) {
  const data = JSON.parse(fileText);
  const rawCells = Array.isArray(data.cells) ? data.cells : [];
  return rawCells.map((c) => {
    const cellType = c.cell_type || 'code';
    const source = Array.isArray(c.source) ? c.source.join('') : (c.source || '');
    return { type: cellType, source };
  });
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsText(file);
  });
}