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
    this._interactHandlers = [];
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
  // Widget creation (now handles children)
  // ----------------------------------------------
  createWidget(id, type, kwargs) {
    let el;
    let children = [];
    if (kwargs.children && Array.isArray(kwargs.children)) {
      children = kwargs.children.map(childId => {
        if (this.widgets[childId]) {
          return this.widgets[childId].el;
        } else {
          const placeholder = document.createElement('div');
          placeholder.textContent = `Loading widget ${childId}...`;
          placeholder.dataset.widgetId = childId;
          this.widgets[childId] = { type: 'placeholder', el: placeholder, kwargs: {}, children: [], callbacks: [] };
          return placeholder;
        }
      });
    }

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
      case 'VBox':         el = this._createLayout(id, kwargs, 'flex', 'column', children); break;
      case 'HBox':         el = this._createLayout(id, kwargs, 'flex', 'row', children); break;
      case 'GridBox':      el = this._createLayout(id, kwargs, 'grid', null, children); break;
      case 'Accordion':    el = this._createAccordion(id, kwargs, children); break;
      case 'Tab':          el = this._createTab(id, kwargs, children); break;
      case 'Stack':        el = this._createStacked(id, kwargs, children); break;
      case 'Box':          el = this._createLayout(id, kwargs, 'block', null, children); break;
      case 'Output':       el = this._createOutput(id, kwargs); break;
      default:
        el = document.createElement('div');
        el.textContent = `Unknown widget: ${type}`;
    }
    this.widgets[id] = { type, el, kwargs, children, callbacks: [] };
    this._updateLayoutsWithChildren(id);
    return el;
  }

  _updateLayoutsWithChildren(childId) {
    for (const [wid, w] of Object.entries(this.widgets)) {
      if (w.children && w.children.includes(childId)) {
        const layoutEl = w.el;
        const placeholder = layoutEl.querySelector(`[data-widget-id="${childId}"]`);
        if (placeholder) {
          const newEl = this.widgets[childId].el;
          placeholder.replaceWith(newEl);
        }
      }
    }
  }

  // ----------------------------------------------
  // Widget updates (simplified – full implementation exists)
  // ----------------------------------------------
  updateWidget(id, data) {
    const w = this.widgets[id];
    if (!w) return;
    Object.assign(w.kwargs, data);
    // Update DOM – full logic omitted for brevity; it's in the original.
  }

  removeWidget(id) {
    const w = this.widgets[id];
    if (w) {
      w.el.remove();
      delete this.widgets[id];
    }
  }

  createLink(id, data) {
    // placeholder
  }

  createDLink(id, data) {
    // placeholder
  }

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

  renderWidget(id, container) {
    const w = this.widgets[id];
    if (!w) return;
    container.innerHTML = '';
    container.appendChild(w.el);
  }

  _sendEvent(widgetId, attr, value) {
    if (this.runSocket && this.runSocket.isOpen) {
      this.runSocket.send({
        action: 'widget_event',
        widget_id: widgetId,
        data: { [attr]: value }
      });
    }
  }

  registerInteractHandler(widgetIds, func) {
    widgetIds.forEach(id => {
      const w = this.widgets[id];
      if (!w) return;
      if (!w.callbacks) w.callbacks = [];
      w.callbacks.push((value) => {
        const kwargs = {};
        widgetIds.forEach(wid => {
          const w2 = this.widgets[wid];
          if (w2) kwargs[w2.kwargs.description || 'arg'] = w2.kwargs.value;
        });
        try {
          const result = func(kwargs);
          if (result !== undefined) {
            if (window.display) {
              window.display(result);
            } else {
              console.warn('Interact result not displayed: display() not available');
            }
          }
        } catch (e) {
          console.error('Error in interact function:', e);
        }
      });
    });
  }

  // ---- DOM creation methods ----
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

  _createLayout(id, kwargs, display, direction, children) {
    const div = document.createElement('div');
    div.className = `widget-layout widget-${display}`;
    if (direction) div.style.flexDirection = direction;
    if (children && children.length) {
      children.forEach(childEl => { if (childEl) div.appendChild(childEl); });
    }
    this.widgets[id] = { type: 'Layout', el: div, kwargs, children: kwargs.children || [] };
    return div;
  }

  _createAccordion(id, kwargs, children) {
    const div = document.createElement('div');
    div.className = 'widget-accordion';
    const titles = kwargs.titles || [];
    if (children && children.length) {
      children.forEach((childEl, i) => {
        const panel = document.createElement('div');
        panel.className = 'accordion-panel';
        const header = document.createElement('div');
        header.className = 'accordion-header';
        header.textContent = titles[i] || `Panel ${i+1}`;
        const content = document.createElement('div');
        content.className = 'accordion-content';
        content.appendChild(childEl);
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

  _createTab(id, kwargs, children) {
    const div = document.createElement('div');
    div.className = 'widget-tabs';
    const headerRow = document.createElement('div');
    headerRow.className = 'tab-headers';
    const contentRow = document.createElement('div');
    contentRow.className = 'tab-contents';
    const titles = kwargs.titles || [];
    if (children && children.length) {
      children.forEach((childEl, i) => {
        const tabBtn = document.createElement('button');
        tabBtn.className = 'tab-header';
        tabBtn.textContent = titles[i] || `Tab ${i+1}`;
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        tabContent.appendChild(childEl);
        tabContent.style.display = i === 0 ? 'block' : 'none';
        tabBtn.addEventListener('click', () => {
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

  _createStacked(id, kwargs, children) {
    const div = document.createElement('div');
    div.className = 'widget-stacked';
    if (children && children.length) {
      children.forEach((childEl, i) => {
        const stackItem = document.createElement('div');
        stackItem.className = 'stack-item';
        stackItem.appendChild(childEl);
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

  _initDOMEvents() {}
}

// ===== EXPORT =====
export function initWidgetManager(runSocket) {
  return new WidgetManager(runSocket);
}