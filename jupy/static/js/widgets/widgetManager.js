// static/js/widgets/widgetManager.js (minimal)
export function initWidgetManager(runSocket) {
    console.log('Widget manager initialized (stub)');
    return {
        handleMessage: (msg) => console.log('Widget message:', msg),
        renderWidget: (id, container) => {
            container.textContent = 'Widget support is a stub.';
        }
    };
}