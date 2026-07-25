/**
 * cells/cellOutput.js
 * Rendering of a cell's stdout/stderr text, matplotlib plots, and interactive
 * stdin prompts into its output pane.
 */
import { MAX_CELL_OUTPUT_LINES } from '../config/constants.js';

export function clearCellOutput(cell) {
  cell.outputs = [];
  cell.dom.outputEl.hidden = true;
  cell.dom.outputEl.innerHTML = '';
}

export function appendCellOutput(cell, text, kind) {
  cell.dom.outputEl.hidden = false;

  const span = document.createElement('span');
  if (kind === 'stderr') span.className = 'stderr-line';
  span.textContent = text + '\n';
  cell.dom.outputEl.appendChild(span);
  cell.outputs.push({ kind, text });

  const spans = cell.dom.outputEl.querySelectorAll('span');
  if (spans.length > MAX_CELL_OUTPUT_LINES) {
    const overflow = spans.length - MAX_CELL_OUTPUT_LINES;
    for (let i = 0; i < overflow; i++) {
      spans[i].remove();
    }
  }

  requestAnimationFrame(() => {
    cell.dom.outputEl.scrollTop = cell.dom.outputEl.scrollHeight;
  });
}

export function appendCellPlot(cell, htmlString) {
  if (!htmlString || !htmlString.trim()) return;

  cell.dom.outputEl.hidden = false;

  let plotsWrapper = cell.dom.outputEl.querySelector('.cell-plots-wrapper');
  if (!plotsWrapper) {
    plotsWrapper = document.createElement('div');
    plotsWrapper.className = 'cell-plots-wrapper';
    cell.dom.outputEl.appendChild(plotsWrapper);
  }

  const div = document.createElement('div');
  div.className = 'plot-container';
  div.innerHTML = htmlString;
  plotsWrapper.appendChild(div);

  cell.outputs.push({ kind: 'plot', text: htmlString });

  requestAnimationFrame(() => {
    cell.dom.outputEl.scrollTop = cell.dom.outputEl.scrollHeight;
  });
}

/**
 * Renders an inline `input()` prompt inside the cell's output pane.
 * @param {*} cell
 * @param {string} promptText
 * @param {(value: string) => void} onSubmit - called with the typed value
 */
export function appendCellStdinPrompt(cell, promptText, onSubmit) {
  cell.dom.outputEl.hidden = false;
  const box = document.createElement('div');
  box.className = 'cell-stdin-prompt';

  const label = document.createElement('span');
  label.className = 'stdin-label';
  label.textContent = promptText || 'Input:';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'stdin-input';
  input.placeholder = 'Type response and press Enter...';
  input.autocomplete = 'off';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn btn-primary stdin-submit-btn';
  submitBtn.textContent = 'SUBMIT';

  function submit() {
    const val = input.value;
    box.remove();
    appendCellOutput(cell, (promptText ? promptText + ' ' : '') + val, 'stdout');
    onSubmit(val);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  submitBtn.addEventListener('click', submit);

  box.appendChild(label);
  box.appendChild(input);
  box.appendChild(submitBtn);
  cell.dom.outputEl.appendChild(box);

  requestAnimationFrame(() => {
    cell.dom.outputEl.scrollTop = cell.dom.outputEl.scrollHeight;
    input.focus();
  });
}