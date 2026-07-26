/**
 * cells/cellFactory.js
 * Builds code, markdown, and raw cells.
 */
import { moveLineUp, moveLineDown, toggleComment } from './editorCommands.js';

export function createCell(id, source, templates, hooks, registerAutocomplete) {
  const { cellTemplate, insertBarTemplate } = templates;

  const frag = cellTemplate.content.cloneNode(true);
  const root = frag.querySelector('.cell');
  const runBtn = frag.querySelector('.run-btn');
  const execCountEl = frag.querySelector('.exec-count');
  const editorHost = frag.querySelector('.cell-editor');
  const outputEl = frag.querySelector('.cell-output');
  const toolbar = frag.querySelector('.cell-toolbar');

  const barFrag = insertBarTemplate.content.cloneNode(true);
  const insertBar = barFrag.querySelector('.insert-bar');

  const cell = {
    id,
    type: 'code', // code, markdown, raw
    execCount: null,
    outputs: [],
    isPreview: false, // for markdown cells
    dom: { root, runBtn, execCountEl, editorHost, outputEl, toolbar, insertBar },
    cm: null,
  };

  // Setup CodeMirror with appropriate mode
  const mode = 'python'; // default
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
          // Render markdown preview
          renderMarkdown(cell);
          hooks.onRun(cell.id, { advance: true });
        } else {
          hooks.onRun(cell.id, { advance: true });
        }
      },
      'Ctrl-Enter': (editor) => { /* ... */ },
      'Cmd-Enter': (editor) => { /* ... */ },
      'Alt-Enter': (editor) => { /* ... */ },
      Esc: () => {
        if (cell.type === 'markdown' && cell.isPreview) {
          // Exit preview to edit mode
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

  // For markdown, we may want a different keymap to toggle preview
  if (cell.type === 'markdown') {
    // Add double-click to edit
    root.addEventListener('dblclick', () => setMarkdownEdit(cell));
  }

  // Hover/autocomplete registration (pass cellId)
  registerAutocomplete(cm, cell.id);

  // Notify on change
  cm.on('change', () => {
    if (hooks.onCellChange) hooks.onCellChange(cell.id);
  });

  cm.on('focus', () => hooks.onEnterEdit(cell.id));
  root.addEventListener('click', (e) => {
    if (!editorHost.contains(e.target)) hooks.onSelect(cell.id);
  });

  runBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (cell.type === 'markdown' && cell.isPreview) {
      // Re-render preview
      renderMarkdown(cell);
    } else {
      hooks.onRunButtonClick(cell.id);
    }
  });

  // Toolbar buttons
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
  // Add a cell type switcher? We'll add a dropdown in toolbar later.

  insertBar.querySelector('.add-cell-btn').addEventListener('click', () => {
    hooks.onInsertAfter(cell.id);
  });

  // Helpers for markdown
  function renderMarkdown(cell) {
    if (cell.type !== 'markdown') return;
    const src = cell.cm.getValue();
    if (!src.trim()) {
      setMarkdownEdit(cell);
      return;
    }
    // Render with marked
    let html = '';
    if (window.marked) {
      html = window.marked.parse(src);
    } else {
      html = `<pre>${src}</pre>`;
    }
    // Inject MathJax rendering later
    const previewDiv = document.createElement('div');
    previewDiv.className = 'markdown-preview';
    previewDiv.innerHTML = html;
    // Replace editor with preview
    editorHost.innerHTML = '';
    editorHost.appendChild(previewDiv);
    cell.isPreview = true;
    // Trigger MathJax
    if (window.MathJax) {
      MathJax.typesetPromise([previewDiv]).catch(() => {});
    }
    // Add heading collapsing
    addHeadingCollapse(previewDiv);
  }

  function setMarkdownEdit(cell) {
    if (cell.type !== 'markdown') return;
    // Restore CodeMirror editor
    editorHost.innerHTML = '';
    // Re-append the cm element (cm.getWrapperElement() is already in DOM)
    // We need to re-attach the CodeMirror instance
    // Since we removed it, we need to recreate or re-attach.
    // Simpler: we can hide preview and show the original editor.
    // Better: we can detach the cm wrapper and re-attach.
    // We'll just toggle visibility: we'll have both elements.
    // For simplicity, we'll keep both and toggle display.
    // In this version, we'll recreate the cm.
    // But we already have cm; we can just reinsert it.
    // Instead, we'll replace the innerHTML with the cm wrapper.
    // We'll store the cm wrapper reference.
    const wrapper = cell.cm.getWrapperElement();
    editorHost.appendChild(wrapper);
    cell.isPreview = false;
    cell.cm.refresh();
    cell.cm.focus();
  }

  function addHeadingCollapse(container) {
    // Find all headings (h1-h6) and wrap following content until next heading of same or higher level
    // We'll use a simple recursive function.
    // Not implemented fully here.
  }

  return cell;
}