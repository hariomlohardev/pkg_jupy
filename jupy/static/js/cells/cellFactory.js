/**
 * cells/cellFactory.js
 * Builds a single cell's DOM (from the <template> tags) and its CodeMirror
 * instance, and wires up all of the cell-local UI events. Holds no shared
 * state of its own — all cross-cell state (selection, execution order, etc.)
 * lives in notebook/notebookController.js and is exposed to this factory via
 * the `hooks` callbacks below.
 */
import { moveLineUp, moveLineDown, toggleComment } from './editorCommands.js';

/**
 * @param {string} id
 * @param {string} source - initial code
 * @param {{cellTemplate: HTMLTemplateElement, insertBarTemplate: HTMLTemplateElement}} templates
 * @param {object} hooks
 * @param {(id: string, opts: object) => void} hooks.onRun
 * @param {(id: string) => void} hooks.onRunButtonClick
 * @param {(id: string, delta: number) => void} hooks.onMove
 * @param {(id: string) => void} hooks.onDelete
 * @param {(id: string) => void} hooks.onSelect
 * @param {(id: string) => void} hooks.onEnterEdit
 * @param {(id: string) => void} hooks.onExitEdit
 * @param {(id: string) => void} hooks.onInsertAfter
 * @param {(cm: any) => void} registerAutocomplete
 */
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
    execCount: null,
    outputs: [],
    dom: { root, runBtn, execCountEl, editorHost, outputEl, toolbar, insertBar },
  };

  const cm = CodeMirror(editorHost, {
    value: source,
    mode: 'python',
    theme: 'brutalism',
    lineNumbers: false,
    viewportMargin: Infinity,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    autoCloseBrackets: true,
    extraKeys: {
      'Shift-Enter': () => hooks.onRun(cell.id, { advance: true }),
      'Ctrl-Enter': () => hooks.onRun(cell.id, { advance: false }),
      'Cmd-Enter': () => hooks.onRun(cell.id, { advance: false }),
      'Alt-Enter': () => hooks.onRun(cell.id, { insertBelow: true }),
      Esc: () => hooks.onExitEdit(cell.id),
      // Edit Mode line shuffling shortcuts
      'Alt-Up': (editor) => moveLineUp(editor),
      'Alt-Down': (editor) => moveLineDown(editor),
      // Native commenting toggle
      'Ctrl-/': (editor) => toggleComment(editor),
      'Cmd-/': (editor) => toggleComment(editor),
    },
  });
  cell.cm = cm;

  registerAutocomplete(cm);

  cm.on('focus', () => hooks.onEnterEdit(cell.id));
  root.addEventListener('click', (e) => {
    if (!editorHost.contains(e.target)) hooks.onSelect(cell.id);
  });

  runBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hooks.onRunButtonClick(cell.id);
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

  return cell;
}
