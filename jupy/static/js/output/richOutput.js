/**
 * output/richOutput.js
 * Handles rich MIME types: HTML, JavaScript, images (PNG/JPEG/GIF),
 * Plotly, Bokeh, Vega‑Lite, JSON, Markdown.
 */
import { renderMarkdown } from '../cells/markdownRenderer.js';  // optional

/**
 * Renders a MIME bundle inside a container element.
 * @param {HTMLElement} container - The DOM element to render into.
 * @param {Object} mimeData - Dictionary with MIME types as keys.
 * @param {Object} options - Additional options (e.g., for Plotly layout).
 * @returns {boolean} True if any MIME type was rendered.
 */
export function renderRichOutput(container, mimeData, options = {}) {
  // Priority order: HTML, JavaScript, Plotly, Bokeh, Vega‑Lite, SVG, PNG/JPEG/GIF, JSON, Markdown, Plain text.
  let rendered = false;

  // 1. HTML – sanitize and insert
  if (mimeData['text/html']) {
    let html = mimeData['text/html'];
    if (window.DOMPurify) {
      html = window.DOMPurify.sanitize(html, { SAFE_FOR_JQUERY: true });
    }
    container.innerHTML = html;
    // Execute any embedded scripts? We'll handle application/javascript separately.
    // For safety, we don't execute scripts in HTML by default.
    rendered = true;
  }

  // 2. JavaScript – execute in a sandboxed iframe
  if (mimeData['application/javascript']) {
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.border = 'none';
    iframe.style.background = 'transparent';
    iframe.sandbox = 'allow-scripts allow-same-origin';
    container.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<script>${mimeData['application/javascript']}<\/script>`);
    doc.close();
    rendered = true;
  }

  // 3. Plotly – application/vnd.plotly.v1+json
  if (mimeData['application/vnd.plotly.v1+json']) {
    const plotlyData = mimeData['application/vnd.plotly.v1+json'];
    const div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '500px';
    container.appendChild(div);
    if (window.Plotly) {
      const layout = plotlyData.layout || {};
      const config = plotlyData.config || { responsive: true };
      window.Plotly.newPlot(div, plotlyData.data, layout, config);
    } else {
      div.textContent = 'Plotly library not loaded. Please load Plotly.';
    }
    rendered = true;
  }

  // 4. Bokeh – application/vnd.bokehjs_exec.v0+json
  if (mimeData['application/vnd.bokehjs_exec.v0+json']) {
    const bokehData = mimeData['application/vnd.bokehjs_exec.v0+json'];
    const div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '500px';
    container.appendChild(div);
    if (window.Bokeh) {
      // Bokeh expects to be embedded with a script tag; we'll handle it differently.
      // For simplicity, we'll just display a placeholder.
      div.textContent = 'Bokeh support: please embed the Bokeh script.';
    } else {
      div.textContent = 'Bokeh library not loaded.';
    }
    rendered = true;
  }

  // 5. Vega‑Lite – application/vnd.vegalite.v2+json
  if (mimeData['application/vnd.vegalite.v2+json']) {
    const vegaData = mimeData['application/vnd.vegalite.v2+json'];
    const div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '400px';
    container.appendChild(div);
    if (window.vegaEmbed) {
      window.vegaEmbed(div, vegaData, { actions: false });
    } else {
      div.textContent = 'Vega‑Lite library not loaded. Please load vega‑embed.';
    }
    rendered = true;
  }

  // 6. Images – image/png, image/jpeg, image/gif
  const imageTypes = ['image/png', 'image/jpeg', 'image/gif'];
  for (const type of imageTypes) {
    if (mimeData[type]) {
      const img = document.createElement('img');
      let src = mimeData[type];
      // If it's a base64 data URI, use directly; otherwise, treat as URL.
      if (!src.startsWith('data:')) {
        src = `data:${type};base64,${src}`;
      }
      img.src = src;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      container.appendChild(img);
      rendered = true;
      break; // only render the first image type found
    }
  }

  // 7. JSON – application/json (pretty printed)
  if (mimeData['application/json']) {
    const jsonData = mimeData['application/json'];
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(jsonData, null, 2);
    pre.style.background = 'var(--color-bg-well)';
    pre.style.padding = '8px';
    pre.style.borderRadius = '4px';
    pre.style.overflow = 'auto';
    container.appendChild(pre);
    rendered = true;
  }

  // 8. Markdown – text/markdown
  if (mimeData['text/markdown']) {
    const md = mimeData['text/markdown'];
    let html;
    if (window.marked) {
      html = window.marked.parse(md);
    } else {
      html = `<pre>${md}</pre>`;
    }
    const div = document.createElement('div');
    div.className = 'markdown-preview';
    div.innerHTML = html;
    container.appendChild(div);
    if (window.MathJax) {
      MathJax.typesetPromise([div]).catch(() => {});
    }
    rendered = true;
  }

  // 9. Plain text fallback
  if (!rendered && mimeData['text/plain']) {
    const pre = document.createElement('pre');
    pre.textContent = mimeData['text/plain'];
    container.appendChild(pre);
    rendered = true;
  }

  return rendered;
}
