/**
 * cells/cellFactory.js
 * Builds code, markdown, and raw cells with drag handle and line number support.
 */
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

    // ---------- Markdown styling ----------
  if (type === 'markdown') {
    root.classList.add('cell-md');
    root.style.position = 'relative'; // Needed for absolute edit button

    // Add Colab-style floating edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'md-edit-btn';
    editBtn.innerHTML = '✏️';
    editBtn.title = 'Edit markdown';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMarkdownEdit(cell);
    });
    root.appendChild(editBtn);

    // Hide the gutter (run button + execution count) entirely
    const gutter = frag.querySelector('.cell-gutter');
    if (gutter) gutter.style.display = 'none';
    
    // Hide drag handle
    const dragHandle = frag.querySelector('.cell-drag-handle');
    if (dragHandle) dragHandle.style.display = 'none';
  }

  const dragHandleEl = frag.querySelector('.cell-drag-handle');
  if (dragHandleEl) {
    dragHandleEl.draggable = true;
    dragHandleEl.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', id);
      if (hooks.onDragStart) hooks.onDragStart(id, e);
    });
    dragHandleEl.addEventListener('dragend', (e) => {
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
    dom: { root, runBtn, execCountEl, editorHost, outputEl, toolbar, insertBar, dragHandle: dragHandleEl },
    cm: null,
    language: 'python',
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
          hooks.onExitEdit(cell.id);
          hooks.onRun(cell.id, { advance: true }); // Advance to next cell
        } else {
          hooks.onRun(cell.id, { advance: true });
        }
      },
      'Ctrl-Enter': (editor) => {
        if (cell.type === 'markdown') {
          renderMarkdown(cell);
          hooks.onExitEdit(cell.id);
        } else {
          if (editor.state.completionActive) editor.state.completionActive.close();
          hooks.onRun(cell.id, { advance: false });
        }
      },
      'Cmd-Enter': (editor) => {
        if (cell.type === 'markdown') {
          renderMarkdown(cell);
          hooks.onExitEdit(cell.id);
        } else {
          if (editor.state.completionActive) editor.state.completionActive.close();
          hooks.onRun(cell.id, { advance: false });
        }
      },
      'Alt-Enter': (editor) => {
        if (cell.type === 'markdown') {
          renderMarkdown(cell);
          hooks.onExitEdit(cell.id);
          hooks.onRun(cell.id, { insertBelow: true });
        } else {
          if (editor.state.completionActive) editor.state.completionActive.close();
          hooks.onRun(cell.id, { insertBelow: true });
        }
      },
      'Esc': () => {
        if (cell.type === 'markdown' && !cell.isPreview) {
          renderMarkdown(cell);
          hooks.onExitEdit(cell.id);
        } else {
          hooks.onExitEdit(cell.id);
        }
      },
      'Alt-Up': moveLineUp,
      'Alt-Down': moveLineDown,
      'Ctrl-/': toggleComment,
      'Cmd-/': toggleComment,
    },
  });
  cell.cm = cm;

  // Fallback keydown listener on root
  root.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      hooks.onRun(cell.id, { advance: true });
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (cm.state.completionActive) cm.state.completionActive.close();
      hooks.onRun(cell.id, { advance: false });
    } else if (e.altKey && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      hooks.onRun(cell.id, { insertBelow: true });
    }
  });

  // ---- MARKDOWN DOUBLE-CLICK (toggle inline preview) ----
  if (cell.type === 'markdown') {
    root.addEventListener('dblclick', () => setMarkdownEdit(cell));
  }

  // ---- AUTOCOMPLETE (code cells only) ----
  if (type === 'code') {
    registerAutocomplete(cm, cell.id);
  }

  // ---- CHANGE / FOCUS EVENTS ----
  cm.on('change', () => {
    if (hooks.onCellChange) hooks.onCellChange(cell.id);
  });

  cm.on('focus', () => hooks.onEnterEdit(cell.id));

  // Auto-render markdown when clicking outside
  cm.on('blur', () => {
    if (cell.type === 'markdown' && !cell.isPreview) {
      setTimeout(() => {
        // Check if focus moved outside the editor and toolbar
        if (!cm.hasFocus() && !root.contains(document.activeElement)) {
          renderMarkdown(cell);
          hooks.onExitEdit(cell.id);
        }
      }, 150); // Small delay to allow clicking toolbar buttons
    }
  });

  // ---- CLICK TO SELECT ----
  root.addEventListener('click', (e) => {
    if (!editorHost.contains(e.target) && !dragHandleEl?.contains(e.target)) {
      hooks.onSelect(cell.id);
    }
  });

  // ---- RUN BUTTON (hidden for md) ----
  runBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hooks.onRunButtonClick(cell.id);
  });

  // ---- TOOLBAR ACTIONS ----
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

  // ---- INSERT BAR ----
  insertBar.querySelector('.add-cell-btn').addEventListener('click', () => {
    hooks.onInsertAfter(cell.id);
  });

  // ---- MARKDOWN HELPERS (inline preview via double-click) ----
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

  // ---- TOGGLE LINE NUMBERS ----
  cell.toggleLineNumbers = (enabled) => {
    cm.setOption('lineNumbers', enabled);
  };

  return cell;
}