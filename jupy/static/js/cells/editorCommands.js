/**
 * cells/editorCommands.js
 * Stateless CodeMirror editing helpers shared by every cell's key bindings.
 */

export function moveLineUp(cm) {
  const cursor = cm.getCursor();
  const line = cursor.line;
  if (line === 0) return;
  const text = cm.getLine(line);
  const prevText = cm.getLine(line - 1);
  cm.replaceRange(text + '\n' + prevText, { line: line - 1, ch: 0 }, { line, ch: cm.getLine(line).length });
  cm.setCursor({ line: line - 1, ch: cursor.ch });
}

export function moveLineDown(cm) {
  const cursor = cm.getCursor();
  const line = cursor.line;
  if (line === cm.lineCount() - 1) return;
  const text = cm.getLine(line);
  const nextText = cm.getLine(line + 1);
  cm.replaceRange(nextText + '\n' + text, { line, ch: 0 }, { line: line + 1, ch: cm.getLine(line + 1).length });
  cm.setCursor({ line: line + 1, ch: cursor.ch });
}

/** Toggles a Python `#` line comment across the current selection (Ctrl+/ / Cmd+/). */
export function toggleComment(cm) {
  const from = cm.getCursor('from');
  const to = cm.getCursor('to');
  const lineStart = from.line;
  const lineEnd = to.line;

  cm.operation(() => {
    let allCommented = true;

    for (let i = lineStart; i <= lineEnd; i++) {
      const lineText = cm.getLine(i);
      if (lineText.trim() !== '' && !lineText.trim().startsWith('#')) {
        allCommented = false;
        break;
      }
    }

    if (allCommented) {
      // Uncomment: strip a leading '#' plus one optional following space.
      for (let i = lineStart; i <= lineEnd; i++) {
        const lineText = cm.getLine(i);
        const match = lineText.match(/^(\s*)#\s?/);
        if (match) {
          const spaces = match[1];
          const stripped = lineText.substring(match[0].length);
          cm.replaceRange(spaces + stripped, { line: i, ch: 0 }, { line: i, ch: lineText.length });
        }
      }
    } else {
      // Comment: prepend '# ', skipping blank lines.
      for (let i = lineStart; i <= lineEnd; i++) {
        const lineText = cm.getLine(i);
        if (lineText.trim() === '') continue;
        cm.replaceRange('# ' + lineText, { line: i, ch: 0 }, { line: i, ch: lineText.length });
      }
    }
  });
}
