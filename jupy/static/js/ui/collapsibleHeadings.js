/**
 * ui/collapsibleHeadings.js
 * JupyterLab-style collapsible headings inside rendered markdown.
 * Call applyCollapsibleHeadings(container) after markdown is rendered.
 */
export function applyCollapsibleHeadings(container) {
  if (!container) return;
  const headings = container.querySelectorAll('h1,h2,h3,h4,h5,h6');
  headings.forEach(h => {
    if (h.dataset.collapseReady) return;
    h.dataset.collapseReady = '1';
    h.style.cursor = 'pointer';
    h.style.position = 'relative';
    const chevron = document.createElement('span');
    chevron.textContent = '▾';
    chevron.style.cssText = 'display:inline-block;margin-right:6px;transition:transform 0.15s;font-size:0.8em;';
    h.prepend(chevron);

    const level = parseInt(h.tagName[1], 10);
    let collapsed = false;

    function sectionElements() {
      const els = [];
      let el = h.nextElementSibling;
      while (el) {
        if (/^H[1-6]$/.test(el.tagName) && parseInt(el.tagName[1], 10) <= level) break;
        els.push(el);
        el = el.nextElementSibling;
      }
      return els;
    }

    h.addEventListener('click', (e) => {
      // don't toggle when clicking a link inside the heading
      if (e.target.closest('a')) return;
      collapsed = !collapsed;
      chevron.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
      sectionElements().forEach(el => el.style.display = collapsed ? 'none' : '');
    });
  });
}