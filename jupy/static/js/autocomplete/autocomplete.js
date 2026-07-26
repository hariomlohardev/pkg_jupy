/**
 * autocomplete/autocomplete.js
 * Wires a CodeMirror instance up to Jupy's `/api/complete` endpoint.
 * Adds hover tooltips using `/api/hover`.
 */
import { AUTOCOMPLETE_DEBOUNCE_MS } from '../config/constants.js';

const IGNORED_KEYS = new Set([
  'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Shift', 'Tab', 'Backspace', ' ',
]);

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Global tooltip element (created once)
let hoverTooltip = null;
let hideTooltipTimer = null;
let isHoveringTooltip = false;

function createTooltip() {
  if (!hoverTooltip) {
    hoverTooltip = document.createElement('div');
    hoverTooltip.className = 'jupy-hover-tooltip';
    hoverTooltip.style.position = 'absolute';
    hoverTooltip.style.display = 'none';
    hoverTooltip.style.zIndex = '100000';
    hoverTooltip.style.background = 'var(--color-surface)';
    hoverTooltip.style.border = 'var(--border-thick)';
    hoverTooltip.style.borderRadius = 'var(--rounded-sm)';
    hoverTooltip.style.boxShadow = 'var(--shadow-brutal-lg)';
    hoverTooltip.style.padding = '6px 10px';
    hoverTooltip.style.fontFamily = 'var(--font-mono)';
    hoverTooltip.style.fontSize = '0.78rem';
    hoverTooltip.style.maxWidth = '400px';
    hoverTooltip.style.maxHeight = '200px';
    hoverTooltip.style.overflow = 'auto';
    hoverTooltip.style.pointerEvents = 'auto'; // allow scrolling and mouse events
    document.body.appendChild(hoverTooltip);

    // When mouse enters the tooltip, cancel any pending hide
    hoverTooltip.addEventListener('mouseenter', () => {
      isHoveringTooltip = true;
      if (hideTooltipTimer) {
        clearTimeout(hideTooltipTimer);
        hideTooltipTimer = null;
      }
    });
    // When mouse leaves the tooltip, start a short hide delay
    hoverTooltip.addEventListener('mouseleave', () => {
      isHoveringTooltip = false;
      scheduleHideTooltip();
    });
  }
  return hoverTooltip;
}

function scheduleHideTooltip(delay = 300) {
  if (hideTooltipTimer) clearTimeout(hideTooltipTimer);
  hideTooltipTimer = setTimeout(() => {
    if (!isHoveringTooltip) {
      hideTooltip();
    }
    hideTooltipTimer = null;
  }, delay);
}

function hideTooltip() {
  if (hoverTooltip) {
    hoverTooltip.style.display = 'none';
    hoverTooltip.innerHTML = '';
  }
  isHoveringTooltip = false;
  if (hideTooltipTimer) {
    clearTimeout(hideTooltipTimer);
    hideTooltipTimer = null;
  }
}

export function registerAutocomplete(cm) {
  let debounceTimer = null;
  let activeAbortController = null;
  let hoverTimer = null;
  let currentHoverPos = null;

  // Store a reference to the notebook controller to get all cells' code.
  // We'll set this via a global or a closure. For simplicity, we'll assume
  // the notebook controller is available globally (we'll set it in app.js).
  // Alternatively, we can pass it as an argument. We'll use a global for now.
  const notebook = window.__jupy_notebook;

  function triggerHint(editor) {
    CodeMirror.showHint(editor, fetchCompletions, {
      async: true,
      completeSingle: false,
      closeOnUnfocus: true,
      customKeys: {
        Up: (cm, handle) => handle.moveFocus(-1),
        Down: (cm, handle) => handle.moveFocus(1),
        Tab: (cm, handle) => handle.pick(),
        Enter: (cm, handle) => handle.pick(),
        Esc: (cm, handle) => handle.close(),
      },
    });
  }

  function fetchCompletions(editor, callback) {
    const cursor = editor.getCursor();
    const code = editor.getValue();

    if (activeAbortController) activeAbortController.abort();
    activeAbortController = new AbortController();

    fetch('/api/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: activeAbortController.signal,
      body: JSON.stringify({ code, line: cursor.line + 1, column: cursor.ch }),
    })
      .then((resp) => resp.json())
      .then((data) => {
        const list = data.completions || [];
        if (list.length === 0) {
          callback(null);
          return;
        }

        const token = editor.getTokenAt(cursor);
        let start = token.start;
        const end = cursor.ch;

        if (token.string === '.' || !IDENTIFIER_RE.test(token.string)) {
          start = cursor.ch;
        }

        callback({
          list: list.map((item) => ({
            text: item.text,
            displayText: item.text,
            render: (element) => {
              const row = document.createElement('div');
              row.className = 'CodeMirror-hint-item';

              const nameSpan = document.createElement('span');
              nameSpan.className = 'hint-name';
              nameSpan.textContent = item.text;

              const badge = document.createElement('span');
              badge.className = 'hint-type';
              badge.textContent = (item.type || 'def').slice(0, 5);

              row.appendChild(nameSpan);
              row.appendChild(badge);
              element.appendChild(row);
            },
          })),
          from: CodeMirror.Pos(cursor.line, start),
          to: CodeMirror.Pos(cursor.line, end),
        });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') callback(null);
      });
  }

  // Hover functionality
  function showHover(editor, event) {
    const cursor = editor.coordsChar({ left: event.clientX, top: event.clientY });
    const token = editor.getTokenAt(cursor);
    if (!token || !token.string || token.type === 'comment' || token.type === 'string') {
      hideTooltip();
      return;
    }
    // Only hover on identifiers (including dots)
    if (!IDENTIFIER_RE.test(token.string) && token.string !== '.') {
      hideTooltip();
      return;
    }

    // If we have a notebook, get the entire code from all cells
    let allCode = '';
    if (notebook) {
      const cells = notebook.getCells();
      allCode = cells.map(c => c.cm.getValue()).join('\n\n');
    } else {
      allCode = editor.getValue(); // fallback to current cell only
    }

    const pos = editor.cursorCoords(cursor, 'page');
    const tooltip = createTooltip();
    tooltip.style.display = 'block';
    tooltip.style.left = (pos.left + 10) + 'px';
    tooltip.style.top = (pos.top - 10) + 'px';
    // Clear any scheduled hide
    if (hideTooltipTimer) {
      clearTimeout(hideTooltipTimer);
      hideTooltipTimer = null;
    }

    // Show loading
    tooltip.textContent = 'Loading…';

    const lineNum = cursor.line + 1;
    const colNum = cursor.ch;

    fetch('/api/hover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: allCode, line: lineNum, column: colNum }),
    })
      .then(res => res.json())
      .then(data => {
        const info = data.hover;
        if (!info) {
          tooltip.innerHTML = '<div style="opacity:0.7;">No documentation available</div>';
          return;
        }
        let html = `<div style="font-weight:800;color:var(--color-primary);">${info.name}</div>`;
        if (info.type) html += `<div style="opacity:0.7;font-size:0.7rem;">${info.type}</div>`;
        if (info.signature) html += `<div style="font-weight:700;margin-top:4px;">${info.signature}</div>`;
        if (info.description) html += `<div style="margin-top:4px;">${info.description}</div>`;
        if (info.docstring && info.docstring !== info.description) {
          const lines = info.docstring.split('\n');
          if (lines.length > 1) {
            html += `<div style="margin-top:4px;opacity:0.8;border-top:1px solid var(--color-bg-well);padding-top:4px;">${lines.slice(1).join('<br>')}</div>`;
          }
        }
        tooltip.innerHTML = html;
      })
      .catch(() => {
        tooltip.innerHTML = '<div style="opacity:0.7;">Error fetching info</div>';
      });
  }

  // Attach hover events
  const wrapper = cm.getWrapperElement();
  wrapper.addEventListener('mouseover', (event) => {
    const target = event.target.closest('.CodeMirror');
    if (!target) return;
    // Debounce hover
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      showHover(cm, event);
      hoverTimer = null;
    }, 400);
  });

  wrapper.addEventListener('mouseout', (event) => {
    const related = event.relatedTarget;
    if (related && wrapper.contains(related)) return;
    // Start a hide delay to allow moving to the tooltip
    scheduleHideTooltip(300);
  });

  // Also hide when scrolling or moving cursor
  cm.on('scroll', () => {
    if (!isHoveringTooltip) hideTooltip();
  });
  cm.on('cursorActivity', () => {
    if (!isHoveringTooltip) hideTooltip();
  });

  // Ctrl+Space / Cmd+Space trigger instantly
  cm.addKeyMap({
    'Ctrl-Space': (editor) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      triggerHint(editor);
    },
    'Cmd-Space': (editor) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      triggerHint(editor);
    },
  });

  cm.on('keyup', (editor, event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || IGNORED_KEYS.has(event.key)) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      return;
    }

    const cursor = editor.getCursor();
    const token = editor.getTokenAt(cursor);

    if (token.type === 'comment' || token.type === 'string') {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      return;
    }

    const isDot = event.key === '.';
    const isWord = token.string.trim().length >= 1 && IDENTIFIER_RE.test(token.string);

    if (isDot || isWord) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => triggerHint(editor), AUTOCOMPLETE_DEBOUNCE_MS);
    } else if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  });
}