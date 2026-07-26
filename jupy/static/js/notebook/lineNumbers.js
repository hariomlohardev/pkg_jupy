/**
 * notebook/lineNumbers.js
 * Toggle line numbers in all cell editors.
 */
export function createLineNumbers(state) {
  let enabled = false;

  function toggle() {
    enabled = !enabled;
    state.cells.forEach(c => c.cm.setOption('lineNumbers', enabled));
  }

  return { toggle, isEnabled: () => enabled };
}
