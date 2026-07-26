/**
 * cells/cellOutput.js
 * Rendering of cell outputs (text, plots, rich display data, widgets).
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

export function appendDisplayData(cell, mimeData) {
  cell.dom.outputEl.hidden = false;
  const container = document.createElement('div');
  container.className = 'display-data-container';

  let rendered = false;

  if (mimeData['text/html']) {
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
    const latex = mimeData['text/latex'];
    container.innerHTML = `$$${latex}$$`;
    rendered = true;
    if (window.MathJax) {
      MathJax.typesetPromise([container]).catch(() => {});
    }
  } else if (mimeData['video/mp4']) {
    container.innerHTML = `<video controls style="max-width:100%;"><source src="${mimeData['video/mp4']}" type="video/mp4"></video>`;
    rendered = true;
  } else if (mimeData['audio/mpeg']) {
    container.innerHTML = `<audio controls style="max-width:100%;"><source src="${mimeData['audio/mpeg']}" type="audio/mpeg"></audio>`;
    rendered = true;
  }

  if (!rendered && mimeData['text/plain']) {
    container.textContent = mimeData['text/plain'];
    rendered = true;
  }

  if (!rendered) {
    container.textContent = '(Display data with unknown format)';
  }

  cell.dom.outputEl.appendChild(container);
  cell.outputs.push({ kind: 'display', data: mimeData });
  scrollToBottom(cell);
}

export function appendWidget(cell, widgetData) {
  cell.dom.outputEl.hidden = false;
  const container = document.createElement('div');
  container.className = 'widget-container';
  if (window.__jupy_widgetManager) {
    window.__jupy_widgetManager.renderWidget(widgetData, container);
  } else {
    container.textContent = 'Widget manager not available';
  }
  cell.dom.outputEl.appendChild(container);
  cell.outputs.push({ kind: 'widget', data: widgetData });
  scrollToBottom(cell);
}

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