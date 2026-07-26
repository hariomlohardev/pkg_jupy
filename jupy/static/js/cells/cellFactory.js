import { moveLineUp, moveLineDown, toggleComment } from './editorCommands.js';

export function createCell(id, source, templates, hooks, registerAutocomplete, type = 'code') {
  const { cellTemplate, insertBarTemplate } = templates;

  const frag = cellTemplate.content.cloneNode(true);
  const root = frag.querySelector('.cell');
  const runBtn = frag.querySelector('.run-btn');
  const execCountEl = frag.querySelector('.exec-count');
  const editorHost = frag.querySelector('.cell-editor');
  const outputEl = frag.querySelector('.cell-output');
  const toolbar = frag.querySelector('.cell-toolbar');

  const dragHandle = frag.querySelector('.cell-drag-handle');
  if (dragHandle) {
    dragHandle.draggable = true;
    dragHandle.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', id);
      if (hooks.onDragStart) hooks.onDragStart(id, e);
    });
    dragHandle.addEventListener('dragend', (e) => {
      if (hooks.onDragEnd) hooks.onDragEnd(e);
    });
  }

  const barFrag = insertBarTemplate.content.cloneNode(true);
  const insertBar = barFrag.querySelector('.insert-bar');

  const cell = {
    id,
    type: type,
    execCount: null,
    outputs: [],
    isPreview: false,
    dom: { root, runBtn, execCountEl, editorHost, outputEl, toolbar, insertBar, dragHandle },
    cm: null,
  };

  let mode = 'python';
  if (type === 'markdown') mode = 'markdown';
  else if (type === 'raw') mode = 'text';

  const cm = CodeMirror(editorHost, {
    value: source,
    mode: mode,
    theme: 'brutalism',
    lineNumbers: false,
    viewportMargin: Infinity,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    autoCloseBrackets: true,
    extraKeys: {
      'Shift-Enter': (editor) => {
        if (cell.type === 'markdown') {
          renderMarkdown(cell);
          hooks.onRun(cell.id, { advance: true });
        } else {
          hooks.onRun(cell.id, { advance: true });
        }
      },
      'Ctrl-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { advance: false }); },
      'Cmd-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { advance: false }); },
      'Alt-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { insertBelow: true }); },
      Esc: () => {
        if (cell.type === 'markdown' && cell.isPreview) {
          setMarkdownEdit(cell);
        } else {
          hooks.onExitEdit(cell.id);
        }
      },
      'Alt-Up': (editor) => moveLineUp(editor),
      'Alt-Down': (editor) => moveLineDown(editor),
      'Ctrl-/': (editor) => toggleComment(editor),
      'Cmd-/': (editor) => toggleComment(editor),
    },
  });
  cell.cm = cm;

  if (cell.type === 'markdown') {
    root.addEventListener('dblclick', () => setMarkdownEdit(cell));
  }

  if (type === 'code') {
    registerAutocomplete(cm, cell.id);
  }

  cm.on('change', () => {
    if (hooks.onCellChange) hooks.onCellChange(cell.id);
  });

  cm.on('focus', () => hooks.onEnterEdit(cell.id));
  root.addEventListener('click', (e) => {
    if (!editorHost.contains(e.target) && !dragHandle?.contains(e.target)) {
      hooks.onSelect(cell.id);
    }
  });

  runBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (cell.type === 'markdown' && cell.isPreview) {
      renderMarkdown(cell);
    } else {
      hooks.onRunButtonClick(cell.id);
    }
  });

  toolbar.querySelector('[data-action="move-up"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hooks.onMove(cell.id, -1);
  });
  toolbar.querySelector('[data-action="move-down"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hooks.onMove(cell.id, 1);
  });
  toolbar.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hooks.onDelete(cell.id);
  });

  insertBar.querySelector('.add-cell-btn').addEventListener('click', () => {
    hooks.onInsertAfter(cell.id);
  });

  function renderMarkdown(cell) {
    if (cell.type !== 'markdown') return;
    const src = cell.cm.getValue();
    if (!src.trim()) {
      setMarkdownEdit(cell);
      return;
    }
    let html = '';
    if (window.marked) {
      html = window.marked.parse(src);
    } else {
      html = `<pre>${src}</pre>`;
    }
    const previewDiv = document.createElement('div');
    previewDiv.className = 'markdown-preview';
    previewDiv.innerHTML = html;
    editorHost.innerHTML = '';
    editorHost.appendChild(previewDiv);
    cell.isPreview = true;
    if (window.MathJax) {
      MathJax.typesetPromise([previewDiv]).catch(() => {});
    }
  }

  function setMarkdownEdit(cell) {
    if (cell.type !== 'markdown') return;
    editorHost.innerHTML = '';
    editorHost.appendChild(cm.getWrapperElement());
    cell.isPreview = false;
    cm.refresh();
    cm.focus();
  }

  cell.toggleLineNumbers = (enabled) => {
    cm.setOption('lineNumbers', enabled);
  };

  return cell;
}