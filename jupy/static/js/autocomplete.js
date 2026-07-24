export function registerAutocomplete(cm) {
  // Bind Ctrl+Space and Cmd+Space manual shortcuts
  cm.addKeyMap({
    'Ctrl-Space': (editor) => triggerHint(editor),
    'Cmd-Space': (editor) => triggerHint(editor),
  });

  cm.on('keyup', (editor, event) => {
    // Exclude navigation, control keys, enter, backspace
    if (
      event.ctrlKey || event.metaKey || event.altKey ||
      event.key === 'Enter' || event.key === 'Escape' ||
      event.key === 'ArrowUp' || event.key === 'ArrowDown' ||
      event.key === 'ArrowLeft' || event.key === 'ArrowRight' ||
      event.key === 'Shift' || event.key === 'Tab' ||
      event.key === 'Backspace' || event.key === ' '
    ) {
      return;
    }

    const cursor = editor.getCursor();
    const token = editor.getTokenAt(cursor);

    if (token.type === 'comment' || token.type === 'string') return;

    const isDot = event.key === '.';
    const isWord = token.string.trim().length >= 1 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token.string);

    if (isDot || isWord) {
      // Instant zero-delay execution
      triggerHint(editor);
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

  fetch('/api/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  .catch(() => callback(null));
}