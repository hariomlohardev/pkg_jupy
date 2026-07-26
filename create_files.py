#!/usr/bin/env python3
"""
Generate the full ipywidgets implementation.
Run this script once from the project root.
"""
import os

# ---- Paths ----
STATIC_JS_DIR = "static/js"
WIDGETS_DIR = os.path.join(STATIC_JS_DIR, "widgets")
OUTPUT_DIR = os.path.join(STATIC_JS_DIR, "output")
CELL_OUTPUT_PATH = os.path.join(STATIC_JS_DIR, "cells", "cellOutput.js")
APP_JS_PATH = os.path.join(STATIC_JS_DIR, "app.js")
WORKER_SCRIPT_PATH = os.path.join("jupy", "core", "kernel", "worker_script.py")
WIDGETS_CSS_PATH = os.path.join("static", "css", "components", "widgets.css")

# Ensure directories exist
os.makedirs(WIDGETS_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ---- 1. widgetManager.js (full) ----
WIDGET_MANAGER_JS = """
/**
 * widgets/widgetManager.js
 * Full ipywidgets implementation for Jupy.
 */
export class WidgetManager {
  constructor(runSocket) {
    this.widgets = {};               // widget_id -> { type, el, kwargs, children, callbacks }
    this.links = {};                 // link_id -> { source, target, transform }
    this.runSocket = runSocket;
    this.widgetCounter = 0;
    this._initDOMEvents();
  }

  // ----------------------------------------------
  // Message handling from kernel
  // ----------------------------------------------
  handleMessage(msg) {
    const { event, widget_id, type, data } = msg;
    if (event === 'create') {
      this.createWidget(widget_id, type, data);
    } else if (event === 'update') {
      this.updateWidget(widget_id, data);
    } else if (event === 'remove') {
      this.removeWidget(widget_id);
    } else if (event === 'link') {
      this.createLink(widget_id, data);
    } else if (event === 'dlink') {
      this.createDLink(widget_id, data);
    } else if (event === 'output_stream') {
      this.appendOutput(widget_id, data);
    }
  }

  // ----------------------------------------------
  // Widget creation
  // ----------------------------------------------
  createWidget(id, type, kwargs) {
    let el;
    let children = [];
    switch (type) {
      case 'IntSlider':    el = this._createSlider(id, kwargs, 'int'); break;
      case 'FloatSlider':  el = this._createSlider(id, kwargs, 'float'); break;
      case 'IntText':      el = this._createText(id, kwargs, 'int'); break;
      case 'FloatText':    el = this._createText(id, kwargs, 'float'); break;
      case 'Checkbox':     el = this._createCheckbox(id, kwargs); break;
      case 'RadioButtons': el = this._createRadioButtons(id, kwargs); break;
      case 'ToggleButton': el = this._createToggleButton(id, kwargs); break;
      case 'ToggleButtons': el = this._createToggleButtons(id, kwargs); break;
      case 'Dropdown':     el = this._createDropdown(id, kwargs); break;
      case 'Select':       el = this._createSelect(id, kwargs, false); break;
      case 'SelectMultiple': el = this._createSelect(id, kwargs, true); break;
      case 'DatePicker':   el = this._createDatePicker(id, kwargs); break;
      case 'TimePicker':   el = this._createTimePicker(id, kwargs); break;
      case 'ColorPicker':  el = this._createColorPicker(id, kwargs); break;
      case 'FileUpload':   el = this._createFileUpload(id, kwargs); break;
      case 'Play':         el = this._createPlay(id, kwargs); break;
      case 'VBox':         el = this._createLayout(id, kwargs, 'flex', 'column'); break;
      case 'HBox':         el = this._createLayout(id, kwargs, 'flex', 'row'); break;
      case 'GridBox':      el = this._createLayout(id, kwargs, 'grid', null); break;
      case 'Accordion':    el = this._createAccordion(id, kwargs); break;
      case 'Tab':          el = this._createTab(id, kwargs); break;
      case 'Stacked':      el = this._createStacked(id, kwargs); break;
      case 'Box':          el = this._createLayout(id, kwargs, 'block', null); break;
      case 'Output':       el = this._createOutput(id, kwargs); break;
      default:
        el = document.createElement('div');
        el.textContent = `Unknown widget: ${type}`;
    }
    this.widgets[id] = { type, el, kwargs, children, callbacks: [] };
    return el;
  }

  // ----------------------------------------------
  // Widget updates
  // ----------------------------------------------
  updateWidget(id, data) {
    const w = this.widgets[id];
    if (!w) return;
    Object.assign(w.kwargs, data);
    // Update DOM
    const { type, el } = w;
    if (type.endsWith('Slider')) {
      const input = el.querySelector('input[type="range"]');
      const label = el.querySelector('.widget-value');
      if (input && data.value !== undefined) {
        input.value = data.value;
        if (label) label.textContent = data.value;
      }
      if (data.min !== undefined && input) input.min = data.min;
      if (data.max !== undefined && input) input.max = data.max;
      if (data.step !== undefined && input) input.step = data.step;
    } else if (type === 'IntText' || type === 'FloatText') {
      const input = el.querySelector('input[type="text"]');
      if (input && data.value !== undefined) input.value = data.value;
    } else if (type === 'Checkbox') {
      const input = el.querySelector('input[type="checkbox"]');
      if (input && data.value !== undefined) input.checked = data.value;
    } else if (type === 'ToggleButton') {
      const btn = el.querySelector('.widget-toggle-button');
      if (btn) {
        if (data.value !== undefined) {
          btn.classList.toggle('active', data.value);
          btn.textContent = data.value ? (data.label_on || 'ON') : (data.label_off || 'OFF');
        }
        if (data.description !== undefined) btn.textContent = data.description;
      }
    } else if (type === 'RadioButtons' || type === 'ToggleButtons') {
      // Rebuild
      const container = el.querySelector('.widget-radio-group') || el;
      container.innerHTML = '';
      const opts = data.options || w.kwargs.options || [];
      const value = data.value !== undefined ? data.value : w.kwargs.value;
      opts.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.className = 'widget-radio-option' + (opt === value ? ' active' : '');
        btn.dataset.value = opt;
        btn.addEventListener('click', () => {
          this._sendEvent(id, 'value', opt);
        });
        container.appendChild(btn);
      });
    } else if (type === 'Dropdown' || type === 'Select' || type === 'SelectMultiple') {
      const select = el.querySelector('select');
      if (!select) return;
      if (data.options !== undefined) {
        select.innerHTML = '';
        data.options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          select.appendChild(option);
        });
      }
      if (data.value !== undefined) {
        if (type === 'SelectMultiple') {
          const vals = Array.isArray(data.value) ? data.value : [data.value];
          Array.from(select.options).forEach(opt => {
            opt.selected = vals.includes(opt.value);
          });
        } else {
          select.value = data.value;
        }
      }
    } else if (type === 'DatePicker') {
      const input = el.querySelector('input[type="date"]');
      if (input && data.value !== undefined) input.value = data.value;
    } else if (type === 'TimePicker') {
      const input = el.querySelector('input[type="time"]');
      if (input && data.value !== undefined) input.value = data.value;
    } else if (type === 'ColorPicker') {
      const input = el.querySelector('input[type="color"]');
      if (input && data.value !== undefined) input.value = data.value;
    } else if (type === 'Play') {
      // Update value display, but not needed for play
    } else if (type.startsWith('VBox') || type.startsWith('HBox') || type === 'Box' || type === 'GridBox') {
      // Children are updated via separate messages; we handle that in setChildren
    } else if (type === 'Accordion' || type === 'Tab' || type === 'Stacked') {
      // Children updates handled separately
    } else if (type === 'Output') {
      // Output widget updates are handled via output_stream messages
    }
  }

  // ----------------------------------------------
  // Remove widget
  // ----------------------------------------------
  removeWidget(id) {
    const w = this.widgets[id];
    if (w) {
      w.el.remove();
      delete this.widgets[id];
    }
  }

  // ----------------------------------------------
  // Create links
  // ----------------------------------------------
  createLink(id, data) {
    // data: { source, target, transform? }
    // We'll implement two-way linking by registering callbacks
    const source = this.widgets[data.source];
    const target = this.widgets[data.target];
    if (!source || !target) return;
    // Register callback on source to update target
    const cb = (value) => {
      const newValue = data.transform ? data.transform(value) : value;
      this._sendEvent(data.target, 'value', newValue);
      // Also update the target widget's display
      this.updateWidget(data.target, { value: newValue });
    };
    source.callbacks.push(cb);
    // For dlink, the reverse direction
  }

  createDLink(id, data) {
    // dlink: one-way (source -> target)
    this.createLink(id, data);
  }

  // ----------------------------------------------
  // Output widget streaming
  // ----------------------------------------------
  appendOutput(id, data) {
    const w = this.widgets[id];
    if (!w || w.type !== 'Output') return;
    const outputEl = w.el.querySelector('.widget-output-content');
    if (!outputEl) return;
    if (data.type === 'stdout') {
      const span = document.createElement('span');
      span.textContent = data.text;
      outputEl.appendChild(span);
    } else if (data.type === 'stderr') {
      const span = document.createElement('span');
      span.style.color = 'red';
      span.textContent = data.text;
      outputEl.appendChild(span);
    } else if (data.type === 'clear') {
      outputEl.innerHTML = '';
    }
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  // ----------------------------------------------
  // Render a widget into a container
  // ----------------------------------------------
  renderWidget(id, container) {
    const w = this.widgets[id];
    if (!w) return;
    container.innerHTML = '';
    container.appendChild(w.el);
    // Set children for layout widgets (if any)
    if (w.children && w.children.length > 0) {
      // Children are already appended via createLayout
    }
  }

  // ----------------------------------------------
  // Private: send events to kernel
  // ----------------------------------------------
  _sendEvent(widgetId, attr, value) {
    if (this.runSocket && this.runSocket.isOpen) {
      this.runSocket.send({
        action: 'widget_event',
        widget_id: widgetId,
        data: { [attr]: value }
      });
    }
  }

  // ----------------------------------------------
  // DOM creation methods
  // ----------------------------------------------
  _createSlider(id, kwargs, type) {
    const div = document.createElement('div');
    div.className = 'widget-slider';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = kwargs.min !== undefined ? kwargs.min : (type === 'int' ? 0 : 0.0);
    input.max = kwargs.max !== undefined ? kwargs.max : (type === 'int' ? 100 : 100.0);
    input.step = kwargs.step !== undefined ? kwargs.step : (type === 'int' ? 1 : 0.1);
    input.value = kwargs.value !== undefined ? kwargs.value : input.min;
    const valueLabel = document.createElement('span');
    valueLabel.className = 'widget-value';
    valueLabel.textContent = input.value;
    input.addEventListener('input', () => {
      const val = type === 'int' ? parseInt(input.value) : parseFloat(input.value);
      valueLabel.textContent = val;
      this._sendEvent(id, 'value', val);
    });
    div.appendChild(label);
    div.appendChild(input);
    div.appendChild(valueLabel);
    return div;
  }

  _createText(id, kwargs, type) {
    const div = document.createElement('div');
    div.className = 'widget-text';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = kwargs.value !== undefined ? kwargs.value : '';
    input.addEventListener('change', () => {
      let val = input.value;
      if (type === 'int') val = parseInt(val) || 0;
      else if (type === 'float') val = parseFloat(val) || 0.0;
      this._sendEvent(id, 'value', val);
    });
    div.appendChild(label);
    div.appendChild(input);
    return div;
  }

  _createCheckbox(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-checkbox';
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = kwargs.value !== undefined ? kwargs.value : false;
    input.addEventListener('change', () => {
      this._sendEvent(id, 'value', input.checked);
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(kwargs.description || ''));
    div.appendChild(label);
    return div;
  }

  _createRadioButtons(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-radio-group';
    const opts = kwargs.options || [];
    const value = kwargs.value !== undefined ? kwargs.value : opts[0];
    opts.forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.className = 'widget-radio-option' + (opt === value ? ' active' : '');
      btn.dataset.value = opt;
      btn.addEventListener('click', () => {
        this._sendEvent(id, 'value', opt);
      });
      div.appendChild(btn);
    });
    return div;
  }

  _createToggleButton(id, kwargs) {
    const btn = document.createElement('button');
    btn.className = 'widget-toggle-button' + (kwargs.value ? ' active' : '');
    btn.textContent = kwargs.value ? (kwargs.label_on || 'ON') : (kwargs.label_off || 'OFF');
    btn.addEventListener('click', () => {
      const newVal = !this.widgets[id]?.kwargs?.value;
      this._sendEvent(id, 'value', newVal);
    });
    return btn;
  }

  _createToggleButtons(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-radio-group';
    const opts = kwargs.options || [];
    const value = kwargs.value !== undefined ? kwargs.value : opts[0];
    opts.forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.className = 'widget-radio-option' + (opt === value ? ' active' : '');
      btn.dataset.value = opt;
      btn.addEventListener('click', () => {
        this._sendEvent(id, 'value', opt);
      });
      div.appendChild(btn);
    });
    return div;
  }

  _createDropdown(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-dropdown';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const select = document.createElement('select');
    const opts = kwargs.options || [];
    const value = kwargs.value !== undefined ? kwargs.value : opts[0];
    opts.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      option.selected = opt === value;
      select.appendChild(option);
    });
    select.addEventListener('change', () => {
      this._sendEvent(id, 'value', select.value);
    });
    div.appendChild(label);
    div.appendChild(select);
    return div;
  }

  _createSelect(id, kwargs, multiple) {
    const div = document.createElement('div');
    div.className = 'widget-select';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const select = document.createElement('select');
    select.multiple = multiple;
    const opts = kwargs.options || [];
    const value = kwargs.value !== undefined ? kwargs.value : (multiple ? [] : opts[0]);
    opts.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      if (multiple) {
        option.selected = Array.isArray(value) && value.includes(opt);
      } else {
        option.selected = opt === value;
      }
      select.appendChild(option);
    });
    select.addEventListener('change', () => {
      if (multiple) {
        const vals = Array.from(select.selectedOptions).map(o => o.value);
        this._sendEvent(id, 'value', vals);
      } else {
        this._sendEvent(id, 'value', select.value);
      }
    });
    div.appendChild(label);
    div.appendChild(select);
    return div;
  }

  _createDatePicker(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-datepicker';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const input = document.createElement('input');
    input.type = 'date';
    if (kwargs.value) input.value = kwargs.value;
    input.addEventListener('change', () => {
      this._sendEvent(id, 'value', input.value);
    });
    div.appendChild(label);
    div.appendChild(input);
    return div;
  }

  _createTimePicker(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-timepicker';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const input = document.createElement('input');
    input.type = 'time';
    if (kwargs.value) input.value = kwargs.value;
    input.addEventListener('change', () => {
      this._sendEvent(id, 'value', input.value);
    });
    div.appendChild(label);
    div.appendChild(input);
    return div;
  }

  _createColorPicker(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-colorpicker';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const input = document.createElement('input');
    input.type = 'color';
    if (kwargs.value) input.value = kwargs.value;
    input.addEventListener('input', () => {
      this._sendEvent(id, 'value', input.value);
    });
    div.appendChild(label);
    div.appendChild(input);
    return div;
  }

  _createFileUpload(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-fileupload';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const input = document.createElement('input');
    input.type = 'file';
    if (kwargs.accept) input.accept = kwargs.accept;
    if (kwargs.multiple) input.multiple = true;
    input.addEventListener('change', () => {
      const files = Array.from(input.files).map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
        lastModified: f.lastModified
      }));
      this._sendEvent(id, 'value', files);
    });
    div.appendChild(label);
    div.appendChild(input);
    return div;
  }

  _createPlay(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-play';
    const btn = document.createElement('button');
    btn.textContent = '▶';
    btn.className = 'widget-play-button';
    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'widget-value';
    valueDisplay.textContent = kwargs.value !== undefined ? kwargs.value : 0;
    let playing = false;
    let interval = null;
    btn.addEventListener('click', () => {
      playing = !playing;
      btn.textContent = playing ? '⏸' : '▶';
      if (playing) {
        const step = kwargs.step || 1;
        const max = kwargs.max || 100;
        interval = setInterval(() => {
          let val = parseInt(valueDisplay.textContent) + step;
          if (val > max) val = max;
          valueDisplay.textContent = val;
          this._sendEvent(id, 'value', val);
        }, kwargs.interval || 100);
      } else if (interval) {
        clearInterval(interval);
        interval = null;
      }
    });
    div.appendChild(btn);
    div.appendChild(valueDisplay);
    return div;
  }

  _createLayout(id, kwargs, display, direction) {
    const div = document.createElement('div');
    div.className = `widget-layout widget-${display}`;
    if (direction) div.style.flexDirection = direction;
    if (kwargs.children) {
      kwargs.children.forEach(childId => {
        const child = this.widgets[childId];
        if (child) div.appendChild(child.el);
      });
    }
    // Store children ids for later updates
    this.widgets[id] = { type: 'Layout', el: div, kwargs, children: kwargs.children || [] };
    return div;
  }

  _createAccordion(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-accordion';
    if (kwargs.children) {
      kwargs.children.forEach((childId, i) => {
        const child = this.widgets[childId];
        if (!child) return;
        const panel = document.createElement('div');
        panel.className = 'accordion-panel';
        const header = document.createElement('div');
        header.className = 'accordion-header';
        header.textContent = kwargs.titles ? kwargs.titles[i] : `Panel ${i+1}`;
        const content = document.createElement('div');
        content.className = 'accordion-content';
        content.appendChild(child.el);
        content.style.display = 'none';
        header.addEventListener('click', () => {
          const isOpen = content.style.display !== 'none';
          content.style.display = isOpen ? 'none' : 'block';
        });
        panel.appendChild(header);
        panel.appendChild(content);
        div.appendChild(panel);
      });
    }
    return div;
  }

  _createTab(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-tabs';
    const headerRow = document.createElement('div');
    headerRow.className = 'tab-headers';
    const contentRow = document.createElement('div');
    contentRow.className = 'tab-contents';
    if (kwargs.children) {
      kwargs.children.forEach((childId, i) => {
        const child = this.widgets[childId];
        if (!child) return;
        const tabBtn = document.createElement('button');
        tabBtn.className = 'tab-header';
        tabBtn.textContent = kwargs.titles ? kwargs.titles[i] : `Tab ${i+1}`;
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        tabContent.appendChild(child.el);
        tabContent.style.display = i === 0 ? 'block' : 'none';
        tabBtn.addEventListener('click', () => {
          // Hide all contents, show this one
          contentRow.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
          tabContent.style.display = 'block';
          headerRow.querySelectorAll('.tab-header').forEach(b => b.classList.remove('active'));
          tabBtn.classList.add('active');
        });
        if (i === 0) tabBtn.classList.add('active');
        headerRow.appendChild(tabBtn);
        contentRow.appendChild(tabContent);
      });
    }
    div.appendChild(headerRow);
    div.appendChild(contentRow);
    return div;
  }

  _createStacked(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-stacked';
    if (kwargs.children) {
      kwargs.children.forEach((childId, i) => {
        const child = this.widgets[childId];
        if (!child) return;
        const stackItem = document.createElement('div');
        stackItem.className = 'stack-item';
        stackItem.appendChild(child.el);
        stackItem.style.display = i === 0 ? 'block' : 'none';
        div.appendChild(stackItem);
      });
    }
    return div;
  }

  _createOutput(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-output';
    const content = document.createElement('div');
    content.className = 'widget-output-content';
    content.style.whiteSpace = 'pre-wrap';
    content.style.fontFamily = 'monospace';
    content.style.maxHeight = '200px';
    content.style.overflow = 'auto';
    div.appendChild(content);
    return div;
  }

  // ----------------------------------------------
  // Private: DOM event setup
  // ----------------------------------------------
  _initDOMEvents() {
    // Nothing needed globally
  }
}
"""

with open(os.path.join(WIDGETS_DIR, "widgetManager.js"), "w", encoding="utf-8") as f:
    f.write(WIDGET_MANAGER_JS)

# ---- 2. Update cellOutput.js to use the new widget manager ----
# We'll read the existing file and update the appendWidget function.
cell_output_path = CELL_OUTPUT_PATH
if os.path.exists(cell_output_path):
    with open(cell_output_path, "r", encoding="utf-8") as f:
        content = f.read()
    # Replace the appendWidget function with the new version
    new_append_widget = """
export function appendWidget(cell, widgetData) {
  cell.dom.outputEl.hidden = false;
  const container = document.createElement('div');
  container.className = 'widget-container';
  // widgetData should be the widget ID or the full message
  let widgetId = widgetData;
  if (typeof widgetData === 'object' && widgetData.widget_id) {
    widgetId = widgetData.widget_id;
  }
  if (window.__jupy_widgetManager) {
    window.__jupy_widgetManager.renderWidget(widgetId, container);
  } else {
    container.textContent = 'Widget manager not available';
  }
  cell.dom.outputEl.appendChild(container);
  cell.outputs.push({ kind: 'widget', data: widgetData });
  scrollToBottom(cell);
}
"""
    # Find the existing appendWidget and replace it
    import re
    pattern = r'export function appendWidget\(cell, widgetData\) \{[^}]*\}'
    if re.search(pattern, content, re.DOTALL):
        content = re.sub(pattern, new_append_widget, content, flags=re.DOTALL)
        with open(cell_output_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated: {cell_output_path}")
    else:
        print(f"Could not find appendWidget in {cell_output_path}. Please add manually.")
else:
    print(f"Warning: {cell_output_path} not found. Skipping.")

# ---- 3. Update app.js to initialize widget manager ----
# We'll add the initialization if not present.
app_path = APP_JS_PATH
if os.path.exists(app_path):
    with open(app_path, "r", encoding="utf-8") as f:
        content = f.read()
    # Check if widget manager is already imported
    if "import { initWidgetManager } from './widgets/widgetManager.js';" not in content:
        # Add import after other imports
        import_line = "import { initWidgetManager } from './widgets/widgetManager.js';"
        # Find the last import
        lines = content.splitlines()
        last_import_idx = -1
        for i, line in enumerate(lines):
            if line.startswith("import"):
                last_import_idx = i
        if last_import_idx != -1:
            lines.insert(last_import_idx + 1, import_line)
        else:
            lines.insert(0, import_line)
        content = "\n".join(lines)
        # Also ensure widget manager is initialized
        # Find where runSocket is created and add after it
        if "const widgetManager = initWidgetManager(runSocket);" not in content:
            # Add after runSocket creation
            # We'll look for "const runSocket = new ReconnectingSocket" and insert after
            import re
            pattern = r'(const runSocket = new ReconnectingSocket\([^;]+;)\s*'
            replacement = r'\1\n\n  // Initialize widget manager\n  const widgetManager = initWidgetManager(runSocket);\n  window.__jupy_widgetManager = widgetManager;\n  window.__jupy_runSocket = runSocket;\n'
            content = re.sub(pattern, replacement, content, flags=re.DOTALL)
        with open(app_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated: {app_path}")
    else:
        print(f"{app_path} already has widget manager.")
else:
    print(f"Warning: {app_path} not found. Skipping.")

# ---- 4. Update worker_script.py with full widget system ----
# We'll append the new widget classes and interact to the worker script.
# Since worker_script.py is large, we'll insert the new code after the existing widget stubs.
# We'll locate the section where widgets are defined and replace it.
worker_path = WORKER_SCRIPT_PATH
if os.path.exists(worker_path):
    with open(worker_path, "r", encoding="utf-8") as f:
        content = f.read()

    # We'll replace the existing widget section with the full implementation.
    # We'll define a new widget block.
    new_widget_block = """
# ----------------------------------------------------------------------
# Full ipywidgets system
# ----------------------------------------------------------------------
_widgets = {}
_widget_counter = 0
_links = {}
_link_counter = 0

class WidgetProxy:
    def __init__(self, widget_type, **kwargs):
        global _widget_counter
        self.id = f"widget-{_widget_counter}"
        _widget_counter += 1
        self.type = widget_type
        self.kwargs = kwargs
        self._callbacks = {}
        self._children = kwargs.pop('children', [])
        self._send_widget_event('create', {**kwargs, 'widget_id': self.id, 'type': widget_type})
        # Register in global dict for link resolution
        _widgets[self.id] = self

    def _send_widget_event(self, event, data):
        msg = {'event': event, 'widget_id': self.id, 'type': self.type, 'data': data}
        sys.stdout.write("---JUPY_WIDGET---\\n")
        sys.stdout.write(json.dumps(msg) + "\\n")
        sys.stdout.flush()

    def set_state(self, **kwargs):
        self.kwargs.update(kwargs)
        self._send_widget_event('update', kwargs)

    def observe(self, callback, names='value'):
        if isinstance(names, str):
            names = [names]
        for name in names:
            if name not in self._callbacks:
                self._callbacks[name] = []
            self._callbacks[name].append(callback)

    def on_click(self, callback):
        self.observe(callback, 'click')

    def _handle_frontend_event(self, event_data):
        # Called from frontend via widget_event action
        for attr, value in event_data.items():
            if attr == 'value' or attr == 'click':
                self.kwargs[attr] = value
                if attr in self._callbacks:
                    for cb in self._callbacks[attr]:
                        cb(value)
                # If this is a link source, propagate
                for link in _links.values():
                    if link.source_id == self.id:
                        link.propagate(value)
        # Also update other widgets if linked via dlink

class Link:
    def __init__(self, source, target, transform=None, bidirectional=False):
        global _link_counter
        self.id = f"link-{_link_counter}"
        _link_counter += 1
        self.source_id = source.id if hasattr(source, 'id') else source
        self.target_id = target.id if hasattr(target, 'id') else target
        self.transform = transform
        self.bidirectional = bidirectional
        _links[self.id] = self
        # Send link creation to frontend
        msg = {
            'event': 'link' if not bidirectional else 'dlink',
            'widget_id': self.id,
            'data': {
                'source': self.source_id,
                'target': self.target_id,
                'transform': transform
            }
        }
        sys.stdout.write("---JUPY_WIDGET---\\n")
        sys.stdout.write(json.dumps(msg) + "\\n")
        sys.stdout.flush()

    def propagate(self, value):
        if self.transform:
            value = self.transform(value)
        target = _widgets.get(self.target_id)
        if target:
            target.set_state(value=value)

def link(source, target, transform=None):
    return Link(source, target, transform, bidirectional=False)

def dlink(source, target, transform=None):
    return Link(source, target, transform, bidirectional=True)

# ---- Widget classes ----
def IntSlider(**kwargs):
    return WidgetProxy('IntSlider', **kwargs)

def FloatSlider(**kwargs):
    return WidgetProxy('FloatSlider', **kwargs)

def IntText(**kwargs):
    return WidgetProxy('IntText', **kwargs)

def FloatText(**kwargs):
    return WidgetProxy('FloatText', **kwargs)

def Checkbox(**kwargs):
    return WidgetProxy('Checkbox', **kwargs)

def RadioButtons(**kwargs):
    return WidgetProxy('RadioButtons', **kwargs)

def ToggleButton(**kwargs):
    return WidgetProxy('ToggleButton', **kwargs)

def ToggleButtons(**kwargs):
    return WidgetProxy('ToggleButtons', **kwargs)

def Dropdown(**kwargs):
    return WidgetProxy('Dropdown', **kwargs)

def Select(**kwargs):
    return WidgetProxy('Select', **kwargs)

def SelectMultiple(**kwargs):
    return WidgetProxy('SelectMultiple', **kwargs)

def DatePicker(**kwargs):
    return WidgetProxy('DatePicker', **kwargs)

def TimePicker(**kwargs):
    return WidgetProxy('TimePicker', **kwargs)

def ColorPicker(**kwargs):
    return WidgetProxy('ColorPicker', **kwargs)

def FileUpload(**kwargs):
    return WidgetProxy('FileUpload', **kwargs)

def Play(**kwargs):
    return WidgetProxy('Play', **kwargs)

def VBox(**kwargs):
    return WidgetProxy('VBox', **kwargs)

def HBox(**kwargs):
    return WidgetProxy('HBox', **kwargs)

def GridBox(**kwargs):
    return WidgetProxy('GridBox', **kwargs)

def Accordion(**kwargs):
    return WidgetProxy('Accordion', **kwargs)

def Tab(**kwargs):
    return WidgetProxy('Tab', **kwargs)

def Stacked(**kwargs):
    return WidgetProxy('Stacked', **kwargs)

def Box(**kwargs):
    return WidgetProxy('Box', **kwargs)

def Output(**kwargs):
    return WidgetProxy('Output', **kwargs)

# ---- @interact decorator ----
def interact(func=None, **options):
    if func is None:
        def decorator(f):
            return interact(f, **options)
        return decorator
    else:
        # Create widgets from options
        widgets = {}
        for name, value in options.items():
            if isinstance(value, (int, float)):
                widgets[name] = IntSlider(value=value, min=0, max=10*value, description=name)
            elif isinstance(value, list):
                widgets[name] = Dropdown(options=value, value=value[0], description=name)
            elif isinstance(value, bool):
                widgets[name] = Checkbox(value=value, description=name)
            else:
                widgets[name] = IntText(value=value, description=name)
        # Display widgets in a VBox
        if widgets:
            display(VBox(children=list(widgets.values())))
        # Define wrapper function
        def wrapper(*args, **kwargs):
            # Forward widget values to the function
            args = tuple(widgets.values())
            kwargs = {name: w.kwargs.get('value') for name, w in widgets.items()}
            return func(**kwargs)
        # Register callbacks to update wrapper
        for w in widgets.values():
            w.observe(lambda _: wrapper(), 'value')
        return wrapper

namespace['IntSlider'] = IntSlider
namespace['FloatSlider'] = FloatSlider
namespace['IntText'] = IntText
namespace['FloatText'] = FloatText
namespace['Checkbox'] = Checkbox
namespace['RadioButtons'] = RadioButtons
namespace['ToggleButton'] = ToggleButton
namespace['ToggleButtons'] = ToggleButtons
namespace['Dropdown'] = Dropdown
namespace['Select'] = Select
namespace['SelectMultiple'] = SelectMultiple
namespace['DatePicker'] = DatePicker
namespace['TimePicker'] = TimePicker
namespace['ColorPicker'] = ColorPicker
namespace['FileUpload'] = FileUpload
namespace['Play'] = Play
namespace['VBox'] = VBox
namespace['HBox'] = HBox
namespace['GridBox'] = GridBox
namespace['Accordion'] = Accordion
namespace['Tab'] = Tab
namespace['Stacked'] = Stacked
namespace['Box'] = Box
namespace['Output'] = Output
namespace['link'] = link
namespace['dlink'] = dlink
namespace['interact'] = interact
"""
    # We'll replace the existing widget block.
    # Find the old widget block and replace it.
    # We'll look for the line "# ----------------------------------------------------------------------" and replace until the next "# ----------------------------------------------------------------------"
    import re
    pattern = r'(# ----------------------------------------------------------------------\n# Widget system.*?)\n# ----------------------------------------------------------------------'
    # The old block might be different. Let's do a simpler approach: find the old start and end.
    # We'll just append the new block after the existing magics, and comment out the old block.
    # This is safer.
    # Locate the line before the old widget block.
    marker = "# ----------------------------------------------------------------------\n# Widget system (simplified ipywidgets)"
    if marker in content:
        # Replace from marker to the next section
        start = content.find(marker)
        end = content.find("# ----------------------------------------------------------------------", start + 10)
        if end != -1:
            # Remove the old block
            content = content[:start] + new_widget_block + content[end:]
        else:
            # If no end marker, just replace until end of file? Not safe.
            # We'll append after the marker
            pass
    else:
        # If marker not found, append at the end before the main loop.
        # Find the main loop start
        main_loop_start = content.find("# ----------------------------------------------------------------------\n# Main execution loop")
        if main_loop_start != -1:
            content = content[:main_loop_start] + new_widget_block + "\n\n" + content[main_loop_start:]
        else:
            # Fallback: append at the very end before the closing of the string.
            content = content.rstrip() + "\n\n" + new_widget_block

    with open(worker_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Updated: {worker_path}")
else:
    print(f"Warning: {worker_path} not found. Skipping.")

# ---- 5. Widgets CSS (add styles) ----
# We'll add the styles to the existing widgets.css or create it.
widgets_css = """
/* widgets.css */
.widget-slider {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}
.widget-slider .widget-label {
  font-weight: 700;
  min-width: 80px;
}
.widget-slider input[type="range"] {
  flex: 1;
}
.widget-slider .widget-value {
  min-width: 30px;
  font-family: var(--font-mono);
}

.widget-text, .widget-dropdown, .widget-select, .widget-datepicker, .widget-timepicker, .widget-colorpicker, .widget-fileupload {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.widget-text .widget-label, .widget-dropdown .widget-label, .widget-select .widget-label,
.widget-datepicker .widget-label, .widget-timepicker .widget-label, .widget-colorpicker .widget-label,
.widget-fileupload .widget-label {
  font-weight: 700;
  min-width: 80px;
}
.widget-text input, .widget-datepicker input, .widget-timepicker input, .widget-colorpicker input,
.widget-fileupload input {
  border: var(--border-thick);
  padding: 2px 6px;
  font-family: var(--font-mono);
  background: var(--color-surface);
  color: var(--color-text);
}
.widget-fileupload input[type="file"] {
  border: none;
  padding: 0;
}
.widget-dropdown select, .widget-select select {
  border: var(--border-thick);
  padding: 2px 6px;
  font-family: var(--font-mono);
  background: var(--color-surface);
  color: var(--color-text);
}

.widget-checkbox label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
}
.widget-checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
}

.widget-radio-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.widget-radio-option {
  border: var(--border-thick);
  padding: 2px 12px;
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}
.widget-radio-option.active {
  background: var(--color-secondary);
  color: #111827;
}
.widget-radio-option:hover {
  background: var(--color-primary);
  color: #FFFFFF;
}

.widget-toggle-button {
  border: var(--border-thick);
  padding: 4px 12px;
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}
.widget-toggle-button.active {
  background: var(--color-secondary);
  color: #111827;
}

.widget-play {
  display: flex;
  align-items: center;
  gap: 10px;
}
.widget-play-button {
  border: var(--border-thick);
  padding: 4px 12px;
  background: var(--color-secondary);
  color: #111827;
  font-weight: 700;
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
}
.widget-play-button:hover {
  background: var(--color-primary);
  color: #FFFFFF;
}

.widget-layout {
  padding: 4px 0;
}
.widget-flex {
  display: flex;
}
.widget-grid {
  display: grid;
}
.widget-block {
  display: block;
}

.widget-accordion .accordion-panel {
  border: var(--border-thick);
  margin-bottom: 4px;
}
.widget-accordion .accordion-header {
  background: var(--color-secondary);
  padding: 4px 10px;
  font-weight: 700;
  cursor: pointer;
  color: #111827;
}
.widget-accordion .accordion-header:hover {
  background: var(--color-primary);
  color: #FFFFFF;
}
.widget-accordion .accordion-content {
  padding: 6px 10px;
}

.widget-tabs .tab-headers {
  display: flex;
  gap: 2px;
}
.widget-tabs .tab-header {
  border: var(--border-thick);
  padding: 4px 12px;
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}
.widget-tabs .tab-header.active {
  background: var(--color-secondary);
  color: #111827;
}
.widget-tabs .tab-content {
  border: var(--border-thick);
  padding: 6px;
  border-top: none;
}

.widget-stacked .stack-item {
  padding: 6px;
  border: var(--border-thick);
}

.widget-output {
  border: var(--border-thick);
  background: var(--color-bg-well);
  padding: 4px;
}
.widget-output .widget-output-content {
  max-height: 200px;
  overflow: auto;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-text);
}
.widget-container {
  margin: 4px 0;
}
"""
os.makedirs(os.path.dirname(WIDGETS_CSS_PATH), exist_ok=True)
with open(WIDGETS_CSS_PATH, "w", encoding="utf-8") as f:
    f.write(widgets_css)

print("\n✅ All files created/updated.")
print("Next steps:")
print("1. Restart the server.")
print("2. Test widgets with:\n")
print("```python")
print("from IPython.display import display")
print("slider = IntSlider(value=42, min=0, max=100)")
print("display(slider)")
print("```")
print("3. Test interact:")
print("```python")
print("@interact(x=10, y=20, text='hello')")
print("def f(x, y, text):")
print("    print(x, y, text)")
print("```")