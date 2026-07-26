/**
 * widgets/widgetRegistry.js
 * Adapter registry for third-party widgets (D2). Unknown widget types fall
 * back to a JSON-state view instead of "Unknown widget". Register adapters
 * with registerWidgetRenderer(viewName, renderFn).
 */
const renderers = new Map();

export function registerWidgetRenderer(viewName, renderFn) {
  renderers.set(viewName, renderFn);
}

export function hasRenderer(viewName) {
  return renderers.has(viewName);
}

export function getRenderer(viewName) {
  return renderers.get(viewName);
}

/** Fallback: show the widget's raw state so nothing is silently lost. */
export function renderFallback(type, kwargs, container) {
  const box = document.createElement('div');
  box.className = 'widget-fallback';
  box.style.cssText = 'border:1px dashed var(--color-border);padding:6px 8px;font-family:var(--font-mono);font-size:0.72rem;opacity:0.8;';
  const head = document.createElement('div');
  head.style.fontWeight = '800';
  head.textContent = `⚠ ${type} (no renderer)`;
  const pre = document.createElement('pre');
  pre.style.cssText = 'margin:4px 0 0;white-space:pre-wrap;word-break:break-word;';
  pre.textContent = JSON.stringify(kwargs, null, 2);
  box.appendChild(head);
  box.appendChild(pre);
  container.appendChild(box);
  return box;
}

// ---- Example adapter: ipyleaflet-style MapModel -> Leaflet (if loaded) ----
registerWidgetRenderer('LeafletMap', (kwargs, container) => {
  const div = document.createElement('div');
  div.style.cssText = 'width:100%;height:320px;border:var(--border-thick);';
  container.appendChild(div);
  if (window.L) {
    const map = window.L.map(div).setView([kwargs.center?.[0] ?? 0, kwargs.center?.[1] ?? 0], kwargs.zoom ?? 2);
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    return div;
  }
  div.textContent = 'Leaflet not loaded — install/CDN-include Leaflet to render maps.';
  return div;
});