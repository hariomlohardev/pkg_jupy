# worker_script.py
# Contains the persistent worker script executed by the kernel subprocess.

KERNEL_WORKER_SCRIPT = r"""
import sys, io, ast, base64, json, traceback, builtins, warnings, re, keyword, importlib, threading
import contextlib
import time
import os
import subprocess
import glob
import shutil
import tempfile

warnings.filterwarnings("ignore", category=UserWarning, module="matplotlib")

# ----------------------------------------------------------------------
# Namespace, display, plot capture
# ----------------------------------------------------------------------
namespace = {"__name__": "__main__"}

def _send_display_data(mimebundle):
    sys.stdout.write("---JUPY_DISPLAY_DATA---\n")
    sys.stdout.write(json.dumps(mimebundle) + "\n")
    sys.stdout.flush()

def display(obj, raw=False, **kwargs):
    if isinstance(obj, dict) and any(k in obj for k in ('text/html', 'text/plain', 'image/png', 'image/svg+xml')):
        _send_display_data(obj)
        return
    mimebundle = {}
    for fmt in ('html', 'svg', 'latex', 'markdown', 'json', 'png', 'jpeg'):
        method = getattr(obj, f'_repr_{fmt}_', None)
        if method is not None:
            try:
                data = method()
                if data is not None:
                    mimebundle[f'text/{fmt}'] = data
            except Exception:
                pass
    if hasattr(obj, '_repr_html_'):
        try:
            html = obj._repr_html_()
            if html:
                mimebundle['text/html'] = html
        except Exception:
            pass
    if not mimebundle:
        try:
            mimebundle['text/plain'] = repr(obj)
        except Exception:
            mimebundle['text/plain'] = str(obj)
    if raw:
        mimebundle = {'text/plain': str(obj)}
    if mimebundle:
        _send_display_data(mimebundle)

namespace['display'] = display

# Matplotlib plot capture
_matplotlib_backend_set = False
def _capture_plots():
    global _matplotlib_backend_set
    plots = []
    if "matplotlib.pyplot" in sys.modules:
        import matplotlib.pyplot as plt
        from matplotlib._pylab_helpers import Gcf
        if not _matplotlib_backend_set:
            try:
                import matplotlib
                matplotlib.use("Agg", force=True)
                _matplotlib_backend_set = True
            except Exception:
                pass
        fignums = plt.get_fignums()
        for i in list(fignums):
            try:
                manager = Gcf.get_fig_manager(i)
                if manager and manager.canvas and manager.canvas.figure:
                    fig = manager.canvas.figure
                    if fig.get_axes():
                        try: fig.tight_layout()
                        except Exception: pass
                        buf = io.BytesIO()
                        fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0.1, dpi=110, facecolor="#FFFFFF")
                        buf.seek(0)
                        b64 = base64.b64encode(buf.read()).decode("ascii")
                        plots.append(f'<img class="notebook-plot" src="data:image/png;base64,{b64}" alt="Plot" />')
            except Exception: pass
        try: plt.close("all")
        except Exception: pass
        try: Gcf.destroy_all()
        except Exception: pass
        try: Gcf.figs.clear()
        except Exception: pass
    return plots

# ----------------------------------------------------------------------
# Autocomplete, hover, input
# ----------------------------------------------------------------------
def _warmup_jedi():
    try:
        import jedi
        jedi.Script("import math\nmath.").complete(2, 5)
    except Exception:
        pass
threading.Thread(target=_warmup_jedi, daemon=True).start()

def _custom_input(prompt=""):
    prompt_str = str(prompt)
    sys.stdout.write(f"---JUPY_STDIN_REQ:{prompt_str}---\n")
    sys.stdout.flush()
    line = sys.stdin.readline()
    if not line:
        raise KeyboardInterrupt("Input stream closed.")
    return line.rstrip("\r\n")
builtins.input = _custom_input

def _get_worker_completions(code, line, col):
    completions = []
    seen = set()
    local_imports = {}
    for l in code.splitlines():
        m1 = re.match(r'^\s*import\s+([a-zA-Z0-9_\.]+)(?:\s+as\s+([a-zA-Z0-9_]+))?', l)
        if m1:
            mod_name, alias = m1.group(1), m1.group(2)
            local_imports[alias if alias else mod_name] = mod_name
        m2 = re.match(r'^\s*from\s+([a-zA-Z0-9_\.]+)\s+import\s+([a-zA-Z0-9_\.,\s\*]+)', l)
        if m2:
            mod_name = m2.group(1)
            for item in m2.group(2).split(','):
                item = item.strip()
                if ' as ' in item:
                    orig, alias = item.split(' as ')
                    local_imports[alias.strip()] = f"{mod_name}.{orig.strip()}"
                elif item and item != '*':
                    local_imports[item] = f"{mod_name}.{item}"
    try:
        import jedi
        script = jedi.Script(code)
        jedi_comps = script.complete(line, col)
        for c in jedi_comps:
            if c.name not in seen:
                seen.add(c.name)
                info = c.type
                try:
                    sigs = c.get_signatures()
                    if sigs: info = sigs[0].to_string()
                except Exception: pass
                completions.append({"text": c.name, "type": c.type, "info": info})
    except Exception: pass
    try:
        lines = code.splitlines()
        if 0 <= line - 1 < len(lines):
            cur_line = lines[line - 1][:col]
            parts = cur_line.split('.')
            if len(parts) > 1:
                var_match = re.search(r'([a-zA-Z_][a-zA-Z0-9_]*)$', parts[-2].strip())
                var_name = var_match.group(1) if var_match else ""
                prefix_match = re.search(r'([a-zA-Z_][a-zA-Z0-9_]*)$', parts[-1])
                prefix = prefix_match.group(1) if prefix_match else ""
                obj = None
                if var_name in namespace:
                    obj = namespace[var_name]
                elif var_name in local_imports:
                    try: obj = importlib.import_module(local_imports[var_name])
                    except Exception: pass
                if obj is not None:
                    for a in dir(obj):
                        if not a.startswith('_') and a.lower().startswith(prefix.lower()) and a not in seen:
                            seen.add(a)
                            completions.append({"text": a, "type": "attr", "info": f"{var_name}.{a}"})
            else:
                word_match = re.search(r'([a-zA-Z_][a-zA-Z0-9_]*)$', cur_line)
                word = word_match.group(1) if word_match else ""
                if word:
                    for kw in keyword.kwlist:
                        if kw.startswith(word) and kw not in seen:
                            seen.add(kw)
                            completions.append({"text": kw, "type": "kw", "info": "keyword"})
                    for b in dir(builtins):
                        if not b.startswith('_') and b.startswith(word) and b not in seen:
                            seen.add(b)
                            completions.append({"text": b, "type": "func", "info": "builtin"})
                    for k in local_imports.keys():
                        if k.startswith(word) and k not in seen:
                            seen.add(k)
                            completions.append({"text": k, "type": "mod", "info": f"import {local_imports[k]}"})
                    for k in namespace.keys():
                        if not k.startswith('_') and k.lower().startswith(word.lower()) and k not in seen:
                            seen.add(k)
                            type_name = type(namespace[k]).__name__
                            completions.append({"text": k, "type": type_name[:5], "info": f"global {k}"})
    except Exception: pass
    return completions

def _get_worker_hover(code, line, col):
    try:
        import jedi
        script = jedi.Script(code)
        names = script.infer(line, col)
        if not names:
            defs = script.goto(line, col, follow_imports=True)
            if defs:
                name = defs[0]
            else:
                return None
        else:
            name = names[0]
        docstring = name.docstring() or ""
        sig = ""
        if hasattr(name, 'get_signatures'):
            sigs = name.get_signatures()
            if sigs:
                sig = sigs[0].to_string()
        return {
            "name": name.name,
            "type": name.type,
            "description": docstring.split("\n")[0] if docstring else "",
            "docstring": docstring,
            "signature": sig,
            "module": name.module_name
        }
    except Exception:
        return None

# ----------------------------------------------------------------------
# Magics (including %time)
# ----------------------------------------------------------------------
_magic_history = []
_autoreload_enabled = False
_stored_vars = {}

def _run_magic(line, cell=None):
    parts = line.strip().split()
    if not parts:
        return ""
    magic_name = parts[0].lstrip('%')
    args = parts[1:]

    if magic_name == 'time':
        return _magic_time(args)
    elif magic_name == 'timeit':
        return _magic_timeit(args, cell)
    elif magic_name == 'cd':
        return _magic_cd(args)
    elif magic_name == 'pwd':
        return _magic_pwd()
    elif magic_name == 'ls':
        return _magic_ls(args)
    elif magic_name == 'who':
        return _magic_who()
    elif magic_name == 'reset':
        return _magic_reset(args)
    elif magic_name == 'matplotlib':
        return _magic_matplotlib(args)
    elif magic_name == 'autoreload':
        return _magic_autoreload(args)
    elif magic_name == 'run':
        return _magic_run(args)
    elif magic_name == 'load':
        return _magic_load(args)
    elif magic_name == 'store':
        return _magic_store(args)
    elif magic_name == 'history':
        return _magic_history_cmd(args)
    elif magic_name == 'debug':
        return _magic_debug(args)
    else:
        return f"Unknown magic: {magic_name}"

# ---- new %time ----
def _magic_time(args):
    # %time statement
    code = ' '.join(args) if args else ''
    if not code:
        return "Usage: %time statement"
    start = time.perf_counter()
    try:
        exec(code, namespace)
    except Exception as e:
        return f"Error: {e}"
    elapsed = time.perf_counter() - start
    return f"CPU times: user {elapsed:.6f} s, sys: 0 s, total: {elapsed:.6f} s"

# ---- %timeit ----
def _magic_timeit(args, cell):
    import timeit
    if cell is not None:
        code = cell
    else:
        code = ' '.join(args) if args else ''
        if not code:
            return "Usage: %timeit statement"
    try:
        timer = timeit.Timer(code, globals=namespace)
        number, _ = timer.autorange()
        result = timer.timeit(number)
        return f"{result:.6f} seconds (average over {number} runs)"
    except Exception as e:
        return f"Error in timeit: {e}"

def _magic_cd(args):
    if not args:
        return f"Current directory: {os.getcwd()}"
    path = args[0]
    try:
        os.chdir(path)
        return f"Changed to: {os.getcwd()}"
    except Exception as e:
        return f"Error: {e}"

def _magic_pwd():
    return os.getcwd()

def _magic_ls(args):
    path = args[0] if args else '.'
    try:
        items = os.listdir(path)
        return '\n'.join(items)
    except Exception as e:
        return f"Error: {e}"

def _magic_who():
    vars_list = [k for k in namespace.keys() if not k.startswith('_') and k not in ('display', '__builtins__')]
    if not vars_list:
        return "No user variables."
    return "Variables:\n" + '\n'.join(vars_list)

def _magic_reset(args):
    keep = ['display', '__builtins__']
    for k in list(namespace.keys()):
        if k not in keep and not k.startswith('_'):
            del namespace[k]
    return "Namespace reset."

def _magic_matplotlib(args):
    backend = args[0] if args else 'inline'
    if backend == 'inline':
        try:
            import matplotlib
            matplotlib.use('Agg')
            return "Matplotlib backend set to inline (Agg)."
        except Exception as e:
            return f"Error setting backend: {e}"
    else:
        return f"Unsupported backend: {backend}. Only 'inline' is implemented."

def _magic_autoreload(args):
    global _autoreload_enabled
    if args and args[0] == '2':
        _autoreload_enabled = True
        return "Autoreload enabled (level 2)."
    elif args and args[0] == '0':
        _autoreload_enabled = False
        return "Autoreload disabled."
    else:
        return f"Autoreload currently {'enabled' if _autoreload_enabled else 'disabled'}. Use %autoreload 2 to enable, %autoreload 0 to disable."

def _magic_run(args):
    if not args:
        return "Usage: %run script.py [args]"
    filename = args[0]
    script_args = args[1:]
    try:
        with open(filename, 'r') as f:
            code = f.read()
        exec(code, namespace)
        return f"Executed {filename} successfully."
    except Exception as e:
        return f"Error running script: {e}"

def _magic_load(args):
    if not args:
        return "Usage: %load filename.py"
    filename = args[0]
    try:
        with open(filename, 'r') as f:
            content = f.read()
        sys.stdout.write("---JUPY_LOAD_CELL---\n")
        sys.stdout.write(json.dumps({"content": content}) + "\n")
        sys.stdout.flush()
        return ""
    except Exception as e:
        return f"Error loading file: {e}"

def _magic_store(args):
    if not args:
        return "Usage: %store var  or  %store -r var"
    if args[0] == '-r':
        var = args[1] if len(args) > 1 else None
        if var is None:
            return "Usage: %store -r var"
        if var in _stored_vars:
            namespace[var] = _stored_vars[var]
            return f"Restored {var}"
        else:
            return f"Variable {var} not found in store."
    else:
        var = args[0]
        if var in namespace:
            _stored_vars[var] = namespace[var]
            return f"Stored {var}"
        else:
            return f"Variable {var} not found in namespace."

def _magic_history_cmd(args):
    return "History:\n" + '\n'.join(_magic_history[-20:])

def _magic_debug(args):
    return "Debugger not implemented. Use %pdb to enable."

# ----------------------------------------------------------------------
# Widget system (simplified ipywidgets)
# ----------------------------------------------------------------------
_widgets = {}
_widget_counter = 0

class WidgetProxy:
    def __init__(self, widget_type, **kwargs):
        global _widget_counter
        self.id = f"widget-{_widget_counter}"
        _widget_counter += 1
        self.type = widget_type
        self.kwargs = kwargs
        self._callbacks = []
        self._send_widget_event('create', {**kwargs, 'widget_id': self.id, 'type': widget_type})

    def _send_widget_event(self, event, data):
        msg = {'event': event, 'widget_id': self.id, 'type': self.type, 'data': data}
        sys.stdout.write("---JUPY_WIDGET---\n")
        sys.stdout.write(json.dumps(msg) + "\n")
        sys.stdout.flush()

    def set_state(self, **kwargs):
        self.kwargs.update(kwargs)
        self._send_widget_event('update', kwargs)

    def observe(self, callback, names):
        self._callbacks.append((names, callback))

    def on_click(self, callback):
        self._callbacks.append(('click', callback))

    def _handle_frontend_event(self, event_data):
        if 'value' in event_data:
            self.kwargs['value'] = event_data['value']
            for names, cb in self._callbacks:
                if 'value' in names:
                    cb(event_data['value'])

def IntSlider(**kwargs):
    return WidgetProxy('IntSlider', **kwargs)

def Button(**kwargs):
    return WidgetProxy('Button', **kwargs)

def Output(**kwargs):
    return WidgetProxy('Output', **kwargs)

def VBox(**kwargs):
    return WidgetProxy('VBox', **kwargs)

def HBox(**kwargs):
    return WidgetProxy('HBox', **kwargs)

namespace['IntSlider'] = IntSlider
namespace['Button'] = Button
namespace['Output'] = Output
namespace['VBox'] = VBox
namespace['HBox'] = HBox

def interact(func=None, **options):
    if func is None:
        def decorator(f):
            return interact(f, **options)
        return decorator
    else:
        # Create widgets and display them (simplified)
        return func

namespace['interact'] = interact

# ----------------------------------------------------------------------
# Main execution loop
# ----------------------------------------------------------------------
sys.stdout.write("---JUPY_KERNEL_READY---\n")
sys.stdout.flush()

while True:
    line = sys.stdin.readline()
    if not line:
        break
    try:
        data = json.loads(line)
        action = data.get("action")

        if action == "complete":
            code = data.get("code", "")
            l_num = data.get("line", 1)
            c_num = data.get("column", 0)
            comps = _get_worker_completions(code, l_num, c_num)
            sys.stdout.write(f"---JUPY_COMPS:{json.dumps(comps)}---\n")
            sys.stdout.flush()

        elif action == "hover":
            code = data.get("code", "")
            l_num = data.get("line", 1)
            c_num = data.get("column", 0)
            info = _get_worker_hover(code, l_num, c_num)
            sys.stdout.write(f"---JUPY_HOVER:{json.dumps(info)}---\n")
            sys.stdout.flush()

        elif action == "widget_event":
            widget_id = data.get('widget_id')
            event_data = data.get('data', {})
            if widget_id in _widgets:
                _widgets[widget_id]._handle_frontend_event(event_data)
            continue

        elif action == "execute":
            code = data.get("code", "")
            lines = code.splitlines()
            if lines and lines[0].startswith('%%'):
                magic_line = lines[0]
                cell_body = '\n'.join(lines[1:])
                parts = magic_line[2:].strip().split()
                magic_name = parts[0] if parts else ''
                args = parts[1:]
                magic_str = '%' + magic_name + ' ' + ' '.join(args)
                result = _run_magic(magic_str, cell_body)
                if result:
                    sys.stdout.write("---JUPY_STDOUT---\n")
                    sys.stdout.write(result + "\n")
                sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
                sys.stdout.flush()
                continue

            if lines and lines[0].strip().startswith('%'):
                magic_line = lines[0].strip()
                result = _run_magic(magic_line, None)
                if result:
                    sys.stdout.write("---JUPY_STDOUT---\n")
                    sys.stdout.write(result + "\n")
                if len(lines) > 1:
                    code = '\n'.join(lines[1:])
                else:
                    code = ''
                if not code:
                    sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
                    sys.stdout.flush()
                    continue

            if _autoreload_enabled:
                for mod_name, mod in list(sys.modules.items()):
                    if mod_name not in sys.builtin_module_names and not mod_name.startswith('_'):
                        try:
                            importlib.reload(mod)
                        except Exception:
                            pass

            out, err = io.StringIO(), io.StringIO()
            try:
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    tree = ast.parse(code, mode="exec")
                    if tree.body and isinstance(tree.body[-1], ast.Expr):
                        last = tree.body.pop()
                        if tree.body:
                            exec(compile(tree, "<cell>", "exec"), namespace)
                        expr = ast.Expression(last.value)
                        ast.copy_location(expr, last.value)
                        val = eval(compile(expr, "<cell>", "eval"), namespace)
                        if val is not None:
                            sys.stdout.write(repr(val) + "\n")
                    else:
                        exec(compile(code, "<cell>", "exec"), namespace)
                    plots = _capture_plots()

                stdout_val = out.getvalue()
                stderr_val = err.getvalue()
                if stdout_val:
                    sys.stdout.write("---JUPY_STDOUT---\n")
                    sys.stdout.write(stdout_val)
                if stderr_val:
                    sys.stdout.write("---JUPY_STDERR---\n")
                    sys.stdout.write(stderr_val)
                if plots:
                    sys.stdout.write("---JUPY_PLOTS_START---\n")
                    for p in plots:
                        sys.stdout.write(p + "\n")
                    sys.stdout.write("---JUPY_PLOTS_END---\n")

            except SyntaxError as e:
                err_msg = "".join(traceback.format_exception_only(type(e), e))
                sys.stdout.write(f"---JUPY_STDERR---\n{err_msg}\n")
            except Exception as e:
                tb = e.__traceback__.tb_next if e.__traceback__ else None
                err_msg = "".join(traceback.format_exception(type(e), e, tb))
                sys.stdout.write(f"---JUPY_STDERR---\n{err_msg}\n")

            sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
            sys.stdout.flush()

    except Exception as e:
        sys.stdout.write(f"---JUPY_STDERR---\nKernel error: {e}\n")
        sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
        sys.stdout.flush()
"""