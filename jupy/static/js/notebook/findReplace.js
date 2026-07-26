/**
 * notebook/findReplace.js
 * Find and replace across all cells.
 */
export function createFindReplace(state) {
  function findInNotebook(search, caseSensitive = false) {
    const results = [];
    state.cells.forEach((cell, idx) => {
      const content = cell.cm.getValue();
      const regex = new RegExp(search, caseSensitive ? 'g' : 'gi');
      let match;
      while ((match = regex.exec(content)) !== null) {
        results.push({ cellIdx: idx, line: match.index, text: match[0] });
      }
    });
    return results;
  }

  function replaceInNotebook(search, replace, caseSensitive = false) {
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(search, flags);
    let total = 0;
    state.cells.forEach(cell => {
      const content = cell.cm.getValue();
      const newContent = content.replace(regex, replace);
      if (newContent !== content) {
        cell.cm.setValue(newContent);
        total++;
      }
    });
    return total;
  }

  return { findInNotebook, replaceInNotebook };
}
