/**
 * autocomplete/autocomplete.js
 * Wires a CodeMirror instance to Jupy's `/api/complete` and `/api/hover`.
 * Shows VS‑Code‑style tooltips with full details.
 */
import { AUTOCOMPLETE_DEBOUNCE_MS } from '../config/constants.js';

const IGNORED_KEYS = new Set([
  'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Shift', 'Tab', 'Backspace', ' ',
]);
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Global tooltip element
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
    hoverTooltip.style.padding = '8px 12px';
    hoverTooltip.style.fontFamily = 'var(--font-mono)';
    hoverTooltip.style.fontSize = '0.78rem';
    hoverTooltip.style.maxWidth = '480px';
    hoverTooltip.style.maxHeight = '280px';
    hoverTooltip.style.overflow = 'auto';
    hoverTooltip.style.pointerEvents = 'auto';
    hoverTooltip.style.lineHeight = '1.4';
    document.body.appendChild(hoverTooltip);

    hoverTooltip.addEventListener('mouseenter', () => {
      isHoveringTooltip = true;
      if (hideTooltipTimer) {
        clearTimeout(hideTooltipTimer);
        hideTooltipTimer = null;
      }
    });

    hoverTooltip.addEventListener('mouseleave', () => {
      isHoveringTooltip = false;
      scheduleHideTooltip(300);
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

function clampTooltip(tooltip) {
  const rect = tooltip.getBoundingClientRect();
  const margin = 10;
  let left = parseFloat(tooltip.style.left) || 0;
  let top = parseFloat(tooltip.style.top) || 0;
  const maxLeft = window.innerWidth - rect.width - margin;
  const maxTop = window.innerHeight - rect.height - margin;
  if (left > maxLeft) left = maxLeft;
  if (left < margin) left = margin;
  if (top > maxTop) top = maxTop;
  if (top < margin) top = margin;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

/**
 * Register autocomplete and hover for a CodeMirror instance.
 * @param {CodeMirror} cm
 * @param {string} cellId - ID of the cell this editor belongs to
 */
export function registerAutocomplete(cm, cellId) {
  let debounceTimer = null;
  let activeAbortController = null;
  let hoverTimer = null;
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

  // Hover with VS‑Code‑style tooltip
  function showHover(editor, event) {
    const cursor = editor.coordsChar({ left: event.clientX, top: event.clientY });
    const token = editor.getTokenAt(cursor);
    if (!token || !token.string || token.type === 'comment' || token.type === 'string') {
      hideTooltip();
      return;
    }
    if (!IDENTIFIER_RE.test(token.string) && token.string !== '.') {
      hideTooltip();
      return;
    }
    if (!notebook) {
      hideTooltip();
      return;
    }

    // FIX #7: Only send current cell code to avoid massive payload lag
    const cellCode = editor.getValue();
    const absoluteLine = cursor.line + 1; // 1-based relative to current cell

    // Debug logs (remove after verification)
    console.log(`[Hover] cellId: ${cellId}`);
    console.log(`[Hover] cursor.line: ${cursor.line}, cursor.ch: ${cursor.ch}`);
    console.log(`[Hover] absoluteLine: ${absoluteLine}`);
    console.log(`[Hover] cellCode length: ${cellCode.length}, first 200 chars:`, cellCode.substring(0, 200));

    const pos = editor.cursorCoords(cursor, 'page');
    const tooltip = createTooltip();
    tooltip.style.display = 'block';
    tooltip.style.left = (pos.left + 10) + 'px';
    tooltip.style.top = (pos.top - 10) + 'px';

    if (hideTooltipTimer) {
      clearTimeout(hideTooltipTimer);
      hideTooltipTimer = null;
    }

    tooltip.textContent = 'Loading…';

    fetch('/api/hover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: cellCode, // FIX: Send only current cell code
        line: absoluteLine,
        column: cursor.ch,
      }),
    })
      .then(res => res.json())
      .then(data => {
        const info = data.hover;
        console.log('[Hover] Server response:', info);
        if (!info) {
          tooltip.innerHTML = '<div style="opacity:0.7;">No documentation available</div>';
          clampTooltip(tooltip);
          return;
        }

        let html = '';
        // Header: name + type badge
        html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">`;
        html += `<span style="font-weight:800; font-size:0.9rem; color:var(--color-primary);">${info.name}</span>`;
        if (info.type) {
          const typeLabel = info.type === 'function' ? 'func' : info.type;
          html += `<span style="font-size:0.6rem; background:var(--color-secondary); padding:1px 6px; border-radius:3px; color:#111827; font-weight:700; text-transform:uppercase;">${typeLabel}</span>`;
        }
        html += `</div>`;

        // Signature
        if (info.signature) {
          html += `<div style="font-family:var(--font-mono); font-size:0.75rem; background:var(--color-bg-well); padding:3px 8px; border-radius:3px; margin-bottom:4px; border-left:3px solid var(--color-primary); white-space:pre-wrap; word-break:break-all;">${info.signature}</div>`;
        }

        // Description
        if (info.description) {
          html += `<div style="font-size:0.78rem; margin-bottom:2px;">${info.description}</div>`;
        }

        // Full docstring (after first line)
        if (info.docstring && info.docstring !== info.description) {
          const lines = info.docstring.split('\n');
          if (lines.length > 1) {
            const rest = lines.slice(1).join('\n');
            html += `<div style="font-size:0.72rem; opacity:0.8; border-top:1px solid var(--color-border); padding-top:4px; margin-top:2px; max-height:80px; overflow-y:auto; white-space:pre-wrap;">${rest}</div>`;
          }
        }

        // Module
        if (info.module) {
          html += `<div style="font-size:0.6rem; opacity:0.5; margin-top:4px; border-top:1px solid var(--color-bg-well); padding-top:2px;">from ${info.module}</div>`;
        }

        tooltip.innerHTML = html;
        clampTooltip(tooltip);
      })
      .catch((err) => {
        console.error('[Hover] Fetch error:', err);
        tooltip.innerHTML = '<div style="opacity:0.7;">Error fetching info</div>';
        clampTooltip(tooltip);
      });
  }

  const wrapper = cm.getWrapperElement();

  wrapper.addEventListener('mouseover', (event) => {
    const target = event.target.closest('.CodeMirror');
    if (!target) return;
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      showHover(cm, event);
      hoverTimer = null;
    }, 400);
  });

  wrapper.addEventListener('mouseout', (event) => {
    const related = event.relatedTarget;
    if (related && wrapper.contains(related)) return;
    scheduleHideTooltip(300);
  });

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