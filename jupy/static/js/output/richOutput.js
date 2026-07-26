import { renderMarkdown } from '../cells/markdownRenderer.js';

export function renderRichOutput(container, mimeData, options = {}) {
  let rendered = false;

  if (mimeData['text/html']) {
    let html = mimeData['text/html'];
    if (window.DOMPurify) {
      html = window.DOMPurify.sanitize(html, { SAFE_FOR_JQUERY: true });
    }
    container.innerHTML = html;
    rendered = true;
  }

  if (mimeData['application/javascript']) {
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.border = 'none';
    iframe.style.background = 'transparent';
    iframe.sandbox = 'allow-scripts';
    container.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<script>${mimeData['application/javascript']}<\/script>`);
    doc.close();
    rendered = true;
  }

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

  if (mimeData['application/vnd.bokehjs_exec.v0+json']) {
    const bokehData = mimeData['application/vnd.bokehjs_exec.v0+json'];
    const div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '500px';
    container.appendChild(div);
    if (window.Bokeh) {
      try {
        if (bokehData.id) {
          window.Bokeh.embed.embed_item(bokehData, div);
        } else {
          if (window.Bokeh.embed.embed_item) {
            window.Bokeh.embed.embed_item(bokehData, div);
          } else {
            div.textContent = 'Bokeh embed not supported.';
          }
        }
      } catch (e) {
        div.textContent = 'Error rendering Bokeh plot: ' + e.message;
      }
    } else {
      div.textContent = 'Bokeh library not loaded.';
    }
    rendered = true;
  }

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

  const imageTypes = ['image/png', 'image/jpeg', 'image/gif'];
  for (const type of imageTypes) {
    if (mimeData[type]) {
      const img = document.createElement('img');
      let src = mimeData[type];
      if (!src.startsWith('data:')) {
        src = `data:${type};base64,${src}`;
      }
      img.src = src;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      container.appendChild(img);
      rendered = true;
      break;
    }
  }

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

  if (!rendered && mimeData['text/plain']) {
    const pre = document.createElement('pre');
    pre.textContent = mimeData['text/plain'];
    container.appendChild(pre);
    rendered = true;
  }

  return rendered;
}