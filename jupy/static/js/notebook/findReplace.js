/**
 * notebook/findReplace.js
 * Find and replace across all cells (literal text, case-insensitive by default).
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createFindReplace(state) {
  function findInNotebook(search, caseSensitive = false) {
    const results = [];
    if (!search) return results;
    const regex = new RegExp(escapeRegex(search), caseSensitive ? 'g' : 'gi');
    state.cells.forEach((cell, idx) => {
      const content = cell.cm.getValue();
      let match;
      while ((match = regex.exec(content)) !== null) {
        // `line` is a character index (used with cm.posFromIndex)
        results.push({ cellIdx: idx, line: match.index, text: match[0] });
        if (match.index === regex.lastIndex) regex.lastIndex++; // guard zero-length matches
      }
    });
    return results;
  }

  function replaceInNotebook(search, replace, caseSensitive = false) {
    if (!search) return 0;
    const regex = new RegExp(escapeRegex(search), caseSensitive ? 'g' : 'gi');
    const safeReplace = replace.replace(/\$/g, '$$$$'); // treat $ literally
    let total = 0;
    state.cells.forEach(cell => {
      const content = cell.cm.getValue();
      const newContent = content.replace(regex, safeReplace);
      if (newContent !== content) {
        cell.cm.setValue(newContent);
        total++;
      }
    });
    return total;
  }

  return { findInNotebook, replaceInNotebook };
}