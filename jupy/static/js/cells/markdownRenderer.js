// cells/markdownRenderer.js
export function renderMarkdown(markdownText) {
    if (window.marked) {
        return window.marked.parse(markdownText);
    }
    return `<pre>${markdownText}</pre>`;
}