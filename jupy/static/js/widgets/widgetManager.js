/**
 * widgets/widgetManager.js
 * Handles widget messages from the kernel.
 */
export class WidgetManager {
  constructor(runSocket) {
    this.widgets = {};
    this.runSocket = runSocket;
  }

  handleMessage(msg) {
    // Stub: we'll implement full widget rendering later
    console.log('[Widget] Received:', msg);
    // For now, just store widgets
    if (msg.event === 'create') {
      this.widgets[msg.widget_id] = msg;
    }
  }

  renderWidget(widgetId, container) {
    const widget = this.widgets[widgetId];
    if (!widget) {
      container.textContent = 'Widget not found';
      return;
    }
    // Simple placeholder
    container.textContent = `Widget: ${widget.type} (${widgetId})`;
  }
}


export function initWidgetManager(runSocket) {
  console.warn('Widget manager is a stub. Widgets not fully implemented.');
  return {
    handleMessage: (msg) => {
      console.log('Widget message:', msg);
    },
  };
}