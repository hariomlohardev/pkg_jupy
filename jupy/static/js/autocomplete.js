let completionDebounceTimer = null;

export function registerAutocomplete(cm) {
  // Register manual Ctrl+Space / Cmd+Space shortcut
  cm.setOption('extraKeys', Object.assign({}, cm.getOption('extraKeys'), {
    'Ctrl-Space': (editor) => triggerHint(editor),
    'Cmd-Space': (editor) => triggerHint(editor),
  }));

  cm.on('keyup', (editor, event) => {
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
      if (completionDebounceTimer) clearTimeout(completionDebounceTimer);
      completionDebounceTimer = setTimeout(() => {
        triggerHint(editor);
      }, 80);
    }
  });
}

function triggerHint(editor) {
  CodeMirror.showHint(editor, fetchJupyCompletions, {
    completeSingle: false,
    closeOnUnfocus: true
  });
}

async function fetchJupyCompletions(editor) {
  const cursor = editor.getCursor();
  const code = editor.getValue();

  try {
    const resp = await fetch('/api/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        line: cursor.line + 1,
        column: cursor.ch
      })
    });

    const data = await resp.json();
    const list = data.completions || [];

    if (list.length === 0) {
      return { list: [], from: cursor, to: cursor };
    }

    const token = editor.getTokenAt(cursor);
    let start = token.start;
    let end = cursor.ch;

    if (token.string === '.' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token.string)) {
      start = cursor.ch;
    }

    return {
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
    };
  } catch (err) {
    return { list: [], from: cursor, to: cursor };
  }
}