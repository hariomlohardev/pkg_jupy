/**
 * cells/cellOutput.js
 * Rendering of cell outputs (text, plots, and rich MIME data).
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
  trimOutputLines(cell);
  scrollToBottom(cell);
}

export function appendCellPlot(cell, htmlString) {
  if (!htmlString || !htmlString.trim()) return;
  cell.dom.outputEl.hidden = false;
  let wrapper = cell.dom.outputEl.querySelector('.cell-plots-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'cell-plots-wrapper';
    cell.dom.outputEl.appendChild(wrapper);
  }
  const div = document.createElement('div');
  div.className = 'plot-container';
  div.innerHTML = htmlString;
  wrapper.appendChild(div);
  cell.outputs.push({ kind: 'plot', text: htmlString });
  scrollToBottom(cell);
}

/**
 * Render MIME display data (from IPython.display, etc.)
 * @param {object} cell
 * @param {object} mimeData - dictionary with MIME types as keys
 */
export function appendDisplayData(cell, mimeData) {
  cell.dom.outputEl.hidden = false;
  const container = document.createElement('div');
  container.className = 'display-data-container';

  // Prioritize: HTML > SVG > LaTeX > DataFrame > plain text
  let rendered = false;

  if (mimeData['text/html']) {
    // Sanitize HTML with DOMPurify (if available)
    let html = mimeData['text/html'];
    if (window.DOMPurify) {
      html = window.DOMPurify.sanitize(html, { SAFE_FOR_JQUERY: true });
    }
    container.innerHTML = html;
    rendered = true;
  } else if (mimeData['image/svg+xml']) {
    const svg = mimeData['image/svg+xml'];
    container.innerHTML = `<svg style="max-width:100%;">${svg}</svg>`;
    rendered = true;
  } else if (mimeData['text/latex']) {
    // Render LaTeX via MathJax
    const latex = mimeData['text/latex'];
    container.innerHTML = `$$${latex}$$`; // double dollars for display math
    // We'll trigger MathJax typesetting later
    rendered = true;
  } else if (mimeData['application/vnd.dataresource+json'] || mimeData['text/html']) {
    // For DataFrames, they usually produce text/html, but we can handle
    // DataFrame-specific if needed.
    // Already covered by text/html branch.
  } else if (mimeData['video/mp4']) {
    const url = mimeData['video/mp4'];
    container.innerHTML = `<video controls style="max-width:100%;"><source src="${url}" type="video/mp4"></video>`;
    rendered = true;
  } else if (mimeData['audio/mpeg']) {
    const url = mimeData['audio/mpeg'];
    container.innerHTML = `<audio controls style="max-width:100%;"><source src="${url}" type="audio/mpeg"></audio>`;
    rendered = true;
  }

  // If nothing rich, fallback to plain text
  if (!rendered && mimeData['text/plain']) {
    container.textContent = mimeData['text/plain'];
  }

  // If still nothing, show a placeholder
  if (!rendered) {
    container.textContent = '(Display data with unknown format)';
  }

  cell.dom.outputEl.appendChild(container);
  cell.outputs.push({ kind: 'display', data: mimeData });

  // If LaTeX was rendered, trigger MathJax
  if (mimeData['text/latex'] && window.MathJax) {
    MathJax.typesetPromise([container]).catch(() => {});
  }

  // If HTML contains scripts or interactive content, we might need to execute them
  // For Plotly, we can detect and call Plotly.react later.

  scrollToBottom(cell);
  trimOutputLines(cell);
}

function trimOutputLines(cell) {
  const spans = cell.dom.outputEl.querySelectorAll('span');
  if (spans.length > MAX_CELL_OUTPUT_LINES) {
    const overflow = spans.length - MAX_CELL_OUTPUT_LINES;
    for (let i = 0; i < overflow; i++) {
      spans[i].remove();
    }
  }
}

function scrollToBottom(cell) {
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
