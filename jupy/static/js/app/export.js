/**
 * app/export.js – Export dropdown handlers and utilities
 */
export function getNotebookData(notebook) {
  const cells = notebook.getCells();
  return {
    cells: cells.map(c => ({
      type: c.type || 'code',
      source: c.cm.getValue(),
      outputs: c.outputs || []
    }))
  };
}

export function initExportDropdown(notebook, showToast) {
  document.getElementById('btn-export-html')?.addEventListener('click', async () => {
    const notebookData = getNotebookData(notebook);
    const res = await fetch('/api/export/html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notebook: notebookData })
    });
    const data = await res.json();
    if (data.html) {
      const blob = new Blob([data.html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'notebook.html';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      showToast('⚠️ Export failed: No HTML returned', 'danger');
    }
  });

  document.getElementById('btn-export-py')?.addEventListener('click', async () => {
    const notebookData = getNotebookData(notebook);
    const res = await fetch('/api/export/py', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notebook: notebookData })
    });
    const data = await res.json();
    if (data.script) {
      const blob = new Blob([data.script], { type: 'text/x-python' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'notebook.py';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      showToast('⚠️ Export failed: No Python script returned', 'danger');
    }
  });

  document.getElementById('btn-export-md')?.addEventListener('click', async () => {
    const notebookData = getNotebookData(notebook);
    const res = await fetch('/api/export/md', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notebook: notebookData })
    });
    const data = await res.json();
    if (data.markdown) {
      const blob = new Blob([data.markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'notebook.md';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      showToast('⚠️ Export failed: No Markdown returned', 'danger');
    }
  });

  document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
    const notebookData = getNotebookData(notebook);
    const res = await fetch('/api/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notebook: notebookData })
    });
    const data = await res.json();
    if (data.html) {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(data.html);
        win.document.close();
        win.focus();
        win.print();
      } else {
        showToast('⚠️ Popup blocked. Please allow popups for this site.', 'danger');
      }
    } else {
      showToast('⚠️ Export failed: No HTML returned for PDF', 'danger');
    }
  });
}
