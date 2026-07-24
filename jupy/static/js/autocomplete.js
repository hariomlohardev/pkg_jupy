let completionDebounceTimer = null;
let activeAbortController = null;

export function registerAutocomplete(cm) {
  // Bind Ctrl+Space and Cmd+Space manual shortcuts (triggers instantly, bypassing debounce)
  cm.addKeyMap({
    'Ctrl-Space': (editor) => {
      if (completionDebounceTimer) clearTimeout(completionDebounceTimer);
      triggerHint(editor);
    },
    'Cmd-Space': (editor) => {
      if (completionDebounceTimer) clearTimeout(completionDebounceTimer);
      triggerHint(editor);
    },
  });

  cm.on('keyup', (editor, event) => {
    // Exclude navigation, control keys, enter, backspace, and escape
    if (
      event.ctrlKey || event.metaKey || event.altKey ||
      event.key === 'Enter' || event.key === 'Escape' ||
      event.key === 'ArrowUp' || event.key === 'ArrowDown' ||
      event.key === 'ArrowLeft' || event.key === 'ArrowRight' ||
      event.key === 'Shift' || event.key === 'Tab' ||
      event.key === 'Backspace' || event.key === ' '
    ) {
      if (completionDebounceTimer) {
        clearTimeout(completionDebounceTimer);
        completionDebounceTimer = null;
      }
      return;
    }

    const cursor = editor.getCursor();
    const token = editor.getTokenAt(cursor);

    if (token.type === 'comment' || token.type === 'string') {
      if (completionDebounceTimer) {
        clearTimeout(completionDebounceTimer);
        completionDebounceTimer = null;
      }
      return;
    }

    const isDot = event.key === '.';
    const isWord = token.string.trim().length >= 1 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token.string);

    if (isDot || isWord) {
      // Clear any pending timeout while active typing is in progress
      if (completionDebounceTimer) {
        clearTimeout(completionDebounceTimer);
      }

      // Trigger completion instantly after a brief 50ms pause
      completionDebounceTimer = setTimeout(() => {
        triggerHint(editor);
      }, 50);
    } else {
      if (completionDebounceTimer) {
        clearTimeout(completionDebounceTimer);
        completionDebounceTimer = null;
      }
    }
  });
}

function triggerHint(editor) {
  CodeMirror.showHint(editor, fetchJupyCompletions, {
    async: true,
    completeSingle: false,
    closeOnUnfocus: true
  });
}

function fetchJupyCompletions(editor, callback) {
  const cursor = editor.getCursor();
  const code = editor.getValue();

  // Abort any slow, flying network requests before making a new one
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();

  fetch('/api/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: activeAbortController.signal,
    body: JSON.stringify({
      code: code,
      line: cursor.line + 1,
      column: cursor.ch
    })
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
    let end = cursor.ch;

    if (token.string === '.' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token.string)) {
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
        }
      })),
      from: CodeMirror.Pos(cursor.line, start),
      to: CodeMirror.Pos(cursor.line, end)
    });
  })
  .catch((err) => {
    // Suppress unhandled errors raised by aborting previous fetch requests
    if (err.name !== 'AbortError') {
      callback(null);
    }
  });
}