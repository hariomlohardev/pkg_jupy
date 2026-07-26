# jupy/core/kernel/worker_script.py
# All code is embedded – no external imports required.
KERNEL_WORKER_SCRIPT = r"""
import sys, io, ast, base64, json, traceback, builtins, warnings, re, keyword, importlib, threading
import contextlib, time, os, subprocess, glob, shutil, tempfile, shlex, pdb, gc, psutil

warnings.filterwarnings("ignore", category=UserWarning, module="matplotlib")

# ----------------------------------------------------------------------
# Global namespace (defined once)
# ----------------------------------------------------------------------
namespace = {"__name__": "__main__"}

# ----------------------------------------------------------------------
# Debugger globals
# ----------------------------------------------------------------------
_breakpoints = []
_debugger_enabled = False
_debugger_event = threading.Event()
_debugger_mode = None
_debugger_ws = None

def _debugger_trace(frame, event, arg):
    if not _debugger_enabled:
        return _debugger_trace
    filename = frame.f_code.co_filename
    lineno = frame.f_lineno
    for bp in _breakpoints:
        if bp.get("file") == filename and bp.get("line") == lineno:
            if _debugger_ws:
                _debugger_ws({"type": "paused", "file": filename, "line": lineno, "frame": str(frame.f_locals)})
            _debugger_event.clear()
            _debugger_event.wait()
            if _debugger_mode == "stop":
                return None
            elif _debugger_mode == "continue":
                return _debugger_trace
            elif _debugger_mode == "step_over":
                return _debugger_trace
            elif _debugger_mode == "step_into":
                return _debugger_trace
    return _debugger_trace

# ----------------------------------------------------------------------
# Helpers (completions, hover)
# ----------------------------------------------------------------------
def get_worker_completions(code, line, col, namespace):
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
                    except: pass
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

def get_worker_hover(code, line, col):
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
# Magics (full implementation)
# ----------------------------------------------------------------------
_alias_dict = {}
_bookmark_dict = {}
_dir_stack = []
_pdb_mode = False
_xmode = 'Context'   # 'Plain', 'Context', 'Verbose'
_float_precision = None
_history_lines = []   # store executed cell sources
_autoreload_enabled = False

def _run_magic(line, cell, namespace):
    parts = line.strip().split()
    if not parts:
        return ""
    magic_name = parts[0].lstrip('%')
    args = parts[1:]
    if magic_name == 'paste': return _magic_paste(args, cell, namespace)
    elif magic_name == 'cpaste': return _magic_cpaste(args, cell, namespace)
    elif magic_name == 'edit': return _magic_edit(args, cell, namespace)
    elif magic_name == 'env': return _magic_env(args, cell, namespace)
    elif magic_name == 'alias': return _magic_alias(args, cell, namespace)
    elif magic_name == 'unalias': return _magic_unalias(args, cell, namespace)
    elif magic_name == 'bookmark': return _magic_bookmark(args, cell, namespace)
    elif magic_name == 'pushd': return _magic_pushd(args, cell, namespace)
    elif magic_name == 'popd': return _magic_popd(args, cell, namespace)
    elif magic_name == 'dirs': return _magic_dirs(args, cell, namespace)
    elif magic_name == 'sc': return _magic_sc(args, cell, namespace)
    elif magic_name == 'system': return _magic_system(args, cell, namespace)
    elif magic_name == 'prun': return _magic_prun(args, cell, namespace)
    elif magic_name == 'lprun': return _magic_lprun(args, cell, namespace)
    elif magic_name == 'mprun': return _magic_mprun(args, cell, namespace)
    elif magic_name == 'memit': return _magic_memit(args, cell, namespace)
    elif magic_name == 'pdb': return _magic_pdb(args, cell, namespace)
    elif magic_name == 'xmode': return _magic_xmode(args, cell, namespace)
    elif magic_name == 'precision': return _magic_precision(args, cell, namespace)
    elif magic_name == 'config': return "Configuration system is not implemented in Jupy."
    elif magic_name == 'gui': return "GUI event loop integration is not implemented."
    elif magic_name == 'load_ext': return _magic_load_ext(args, cell, namespace)
    elif magic_name == 'unload_ext': return _magic_unload_ext(args, cell, namespace)
    elif magic_name == 'reload_ext': return _magic_reload_ext(args, cell, namespace)
    elif magic_name == 'time': return _magic_time(args, cell, namespace)
    elif magic_name == 'timeit': return _magic_timeit(args, cell, namespace)
    elif magic_name == 'cd': return _magic_cd(args, cell, namespace)
    elif magic_name == 'pwd': return _magic_pwd(args, cell, namespace)
    elif magic_name == 'ls': return _magic_ls(args, cell, namespace)
    elif magic_name == 'who': return _magic_who(args, cell, namespace)
    elif magic_name == 'reset': return _magic_reset(args, cell, namespace)
    elif magic_name == 'matplotlib': return _magic_matplotlib(args, cell, namespace)
    elif magic_name == 'autoreload': return _magic_autoreload(args, cell, namespace)
    elif magic_name == 'run': return _magic_run(args, cell, namespace)
    elif magic_name == 'load': return _magic_load(args, cell, namespace)
    elif magic_name == 'store': return _magic_store(args, cell, namespace)
    elif magic_name == 'history': return _magic_history(args, cell, namespace)
    elif magic_name == 'debug': return "Debugger not implemented. Use %pdb (which is also limited in headless mode)."
    elif magic_name == 'gc': return _magic_gc(args, cell, namespace)
    elif magic_name == 'cache': return _magic_cache(args, cell, namespace)
    elif magic_name == 'pip': return _magic_pip(args, cell, namespace)
    else: return f"Unknown magic: {magic_name}"

def _magic_paste(args, cell, namespace):
    try:
        import pyperclip
        text = pyperclip.paste()
        exec(text, namespace)
        return "Pasted and executed code from clipboard."
    except ImportError: return "pyperclip not installed. Install: pip install pyperclip"
    except Exception as e: return f"Error: {e}"

def _magic_cpaste(args, cell, namespace):
    print("Paste your code below. End with a blank line.", file=sys.stderr)
    lines = []
    while True:
        try: line = sys.stdin.readline()
        except KeyboardInterrupt: return "Interrupted."
        if not line or line.strip() == '': break
        lines.append(line)
    code = ''.join(lines)
    try:
        exec(code, namespace)
        return "Executed pasted code."
    except Exception as e: return f"Error: {e}"

def _magic_edit(args, cell, namespace):
    editor = os.environ.get('EDITOR', 'nano')
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.py', delete=False) as f: fname = f.name
    try:
        subprocess.run([editor, fname], check=True)
        with open(fname, 'r') as f: code = f.read()
        if code:
            exec(code, namespace)
            return f"Edited and executed {fname}"
        else: return "No code entered."
    except Exception as e: return f"Error: {e}"
    finally:
        try: os.unlink(fname)
        except: pass

def _magic_env(args, cell, namespace):
    if not args: return '\n'.join(f"{k}={v}" for k,v in os.environ.items())
    if '=' in args[0]:
        key, val = args[0].split('=', 1)
        os.environ[key] = val
        return f"Set {key}={val}"
    else:
        key = args[0]
        return os.environ.get(key, '')

def _magic_alias(args, cell, namespace):
    global _alias_dict
    if not args: return '\n'.join(f"{k} -> {v}" for k,v in _alias_dict.items())
    if len(args) == 1: return _alias_dict.get(args[0], f"Alias {args[0]} not found.")
    else:
        name = args[0]
        cmd = ' '.join(args[1:])
        _alias_dict[name] = cmd
        return f"Alias {name} = {cmd}"

def _magic_unalias(args, cell, namespace):
    global _alias_dict
    if not args: return "Usage: %unalias name"
    name = args[0]
    if name in _alias_dict:
        del _alias_dict[name]
        return f"Removed alias {name}"
    else: return f"Alias {name} not found."

def _magic_bookmark(args, cell, namespace):
    global _bookmark_dict
    if not args: return '\n'.join(f"{k} -> {v}" for k,v in _bookmark_dict.items())
    if len(args) == 1:
        name = args[0]
        if name in _bookmark_dict:
            os.chdir(_bookmark_dict[name])
            return f"Changed to bookmark {name}: {_bookmark_dict[name]}"
        else: return f"Bookmark {name} not found."
    else:
        name = args[0]
        path = args[1] if len(args) > 1 else os.getcwd()
        _bookmark_dict[name] = os.path.abspath(path)
        return f"Bookmark {name} -> {_bookmark_dict[name]}"

def _magic_pushd(args, cell, namespace):
    global _dir_stack
    if not args:
        _dir_stack.append(os.getcwd())
        os.chdir(os.path.expanduser('~'))
        return f"Pushed {os.getcwd()}"
    else:
        _dir_stack.append(os.getcwd())
        try:
            os.chdir(args[0])
            return f"Changed to {args[0]}"
        except Exception as e:
            _dir_stack.pop()
            return f"Error: {e}"

def _magic_popd(args, cell, namespace):
    global _dir_stack
    if not _dir_stack: return "Directory stack is empty."
    prev = _dir_stack.pop()
    os.chdir(prev)
    return f"Popped back to {prev}"

def _magic_dirs(args, cell, namespace):
    global _dir_stack
    return '\n'.join(f"{i}: {d}" for i,d in enumerate(_dir_stack))

def _magic_sc(args, cell, namespace):
    if not args: return "Usage: %sc command"
    cmd = ' '.join(args)
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        return result.stdout + result.stderr
    except Exception as e: return str(e)

def _magic_system(args, cell, namespace):
    if not args: return "Usage: %system command"
    cmd = ' '.join(args)
    try:
        subprocess.run(cmd, shell=True, check=False)
        return ""
    except Exception as e: return str(e)

def _magic_prun(args, cell, namespace):
    import cProfile, pstats, io
    if not args: return "Usage: %prun statement"
    code = ' '.join(args)
    if cell is not None: code = cell
    prof = cProfile.Profile()
    try:
        prof.enable()
        exec(code, namespace)
        prof.disable()
    except Exception as e: return f"Error: {e}"
    stream = io.StringIO()
    stats = pstats.Stats(prof, stream=stream)
    stats.sort_stats('cumtime').print_stats(20)
    return stream.getvalue()

def _magic_lprun(args, cell, namespace):
    try: from line_profiler import LineProfiler
    except ImportError: return "line_profiler not installed. Install: pip install line_profiler"
    if not args: return "Usage: %lprun statement"
    code = ' '.join(args)
    if cell is not None: code = cell
    prof = LineProfiler()
    try:
        prof.runctx(code, namespace, namespace)
        return prof.print_stats()
    except Exception as e: return f"Error: {e}"

def _magic_mprun(args, cell, namespace):
    try: from memory_profiler import memory_usage
    except ImportError: return "memory_profiler not installed. Install: pip install memory_profiler"
    if not args: return "Usage: %mprun statement"
    code = ' '.join(args)
    if cell is not None: code = cell
    def f(): exec(code, namespace)
    mem = memory_usage(f, interval=0.1, timeout=10)
    return f"Memory usage: {max(mem):.2f} MiB"

def _magic_memit(args, cell, namespace):
    if not args: return "Usage: %memit statement"
    code = ' '.join(args)
    if cell is not None: code = cell
    try:
        from memory_profiler import memory_usage
        def f(): exec(code, namespace)
        mem = memory_usage(f, interval=0.1, timeout=10)
        return f"Memory usage: {max(mem):.2f} MiB"
    except ImportError:
        try:
            import psutil
            process = psutil.Process(os.getpid())
            before = process.memory_info().rss
            exec(code, namespace)
            after = process.memory_info().rss
            diff = (after - before) / (1024*1024)
            return f"Memory used: {diff:.2f} MiB"
        except: return "memory_profiler or psutil required."

def _magic_pdb(args, cell, namespace):
    global _pdb_mode
    if not args: return f"pdb mode is {'on' if _pdb_mode else 'off'}"
    val = args[0].lower()
    if val in ('on', 'true', '1'):
        _pdb_mode = True
        return "pdb mode ON (post‑mortem debugging is not supported in headless kernel)"
    else:
        _pdb_mode = False
        return "pdb mode OFF"

def _magic_xmode(args, cell, namespace):
    global _xmode
    if not args: return f"xmode = {_xmode}"
    mode = args[0].capitalize()
    if mode in ('Plain', 'Context', 'Verbose'):
        _xmode = mode
        return f"xmode set to {mode}"
    else: return f"Invalid mode: {mode}. Use Plain, Context, or Verbose."

def _magic_precision(args, cell, namespace):
    global _float_precision
    if not args: return f"float precision = {_float_precision}"
    try:
        val = int(args[0])
        _float_precision = val
        return f"Set float precision to {val}"
    except: return "Usage: %precision <integer>"

def _magic_load_ext(args, cell, namespace):
    if not args: return "Usage: %load_ext module"
    try:
        __import__(args[0])
        return f"Loaded extension {args[0]}"
    except Exception as e: return f"Error: {e}"

def _magic_unload_ext(args, cell, namespace):
    if not args: return "Usage: %unload_ext module"
    if args[0] in sys.modules:
        del sys.modules[args[0]]
        return f"Unloaded {args[0]}"
    else: return f"{args[0]} not loaded."

def _magic_reload_ext(args, cell, namespace):
    if not args: return "Usage: %reload_ext module"
    try:
        import importlib
        mod = importlib.import_module(args[0])
        importlib.reload(mod)
        return f"Reloaded {args[0]}"
    except Exception as e: return f"Error: {e}"

def _magic_time(args, cell, namespace):
    code = ' '.join(args) if args else ''
    if not code: return "Usage: %time statement"
    start = time.perf_counter()
    try: exec(code, namespace)
    except Exception as e: return f"Error: {e}"
    elapsed = time.perf_counter() - start
    return f"CPU times: user {elapsed:.6f} s, sys: 0 s, total: {elapsed:.6f} s"

def _magic_timeit(args, cell, namespace):
    import timeit
    if cell is not None: code = cell
    else:
        code = ' '.join(args) if args else ''
        if not code: return "Usage: %timeit statement"
    try:
        timer = timeit.Timer(code, globals=namespace)
        number, _ = timer.autorange()
        result = timer.timeit(number)
        return f"{result:.6f} seconds (average over {number} runs)"
    except Exception as e: return f"Error in timeit: {e}"

def _magic_cd(args, cell, namespace):
    if not args: return f"Current directory: {os.getcwd()}"
    path = args[0]
    try:
        os.chdir(path)
        return f"Changed to: {os.getcwd()}"
    except Exception as e: return f"Error: {e}"

def _magic_pwd(args, cell, namespace): return os.getcwd()

def _magic_ls(args, cell, namespace):
    path = args[0] if args else '.'
    try:
        items = os.listdir(path)
        return '\n'.join(items)
    except Exception as e: return f"Error: {e}"

def _magic_who(args, cell, namespace):
    vars_list = [k for k in namespace.keys() if not k.startswith('_') and k not in ('display', '__builtins__')]
    if not vars_list: return "No user variables."
    return "Variables:\n" + '\n'.join(vars_list)

def _magic_reset(args, cell, namespace):
    keep = ['display', '__builtins__']
    for k in list(namespace.keys()):
        if k not in keep and not k.startswith('_'): del namespace[k]
    return "Namespace reset."

def _magic_matplotlib(args, cell, namespace):
    backend = 'agg'
    if args:
        req = args[0].strip()
        if req.lower() == 'inline': backend = 'agg'
        else: backend = req
    try:
        import matplotlib
        matplotlib.use(backend, force=True)
        return f"Matplotlib backend set to '{backend}' (headless mode)."
    except Exception as e: return f"Error setting backend: {e}"

def _magic_autoreload(args, cell, namespace):
    global _autoreload_enabled
    if args and args[0] == '2':
        _autoreload_enabled = True
        return "Autoreload enabled (level 2) – experimental, may be slow."
    elif args and args[0] == '0':
        _autoreload_enabled = False
        return "Autoreload disabled."
    else: return f"Autoreload currently {'enabled' if _autoreload_enabled else 'disabled'}. Use %autoreload 2 to enable, %autoreload 0 to disable. (Experimental)"

def _magic_run(args, cell, namespace):
    if not args: return "Usage: %run script.py [args]"
    filename = args[0]
    script_args = args[1:]
    old_argv = sys.argv
    sys.argv = [filename] + script_args
    try:
        with open(filename, 'r') as f: code = f.read()
        exec(code, namespace)
        return f"Executed {filename} successfully."
    except Exception as e: return f"Error running script: {e}"
    finally: sys.argv = old_argv

def _magic_load(args, cell, namespace):
    if not args: return "Usage: %load filename.py"
    filename = args[0]
    try:
        with open(filename, 'r') as f: content = f.read()
        sys.stdout.write("---JUPY_LOAD_CELL---\n")
        sys.stdout.write(json.dumps({"content": content}) + "\n")
        sys.stdout.flush()
        return ""
    except Exception as e: return f"Error loading file: {e}"

_stored_vars = {}
def _magic_store(args, cell, namespace):
    global _stored_vars
    if not args: return "Usage: %store var  or  %store -r var"
    if args[0] == '-r':
        var = args[1] if len(args) > 1 else None
        if var is None: return "Usage: %store -r var"
        if var in _stored_vars:
            namespace[var] = _stored_vars[var]
            return f"Restored {var}"
        else: return f"Variable {var} not found in store."
    else:
        var = args[0]
        if var in namespace:
            _stored_vars[var] = namespace[var]
            return f"Stored {var}"
        else: return f"Variable {var} not found in namespace."

def _magic_history(args, cell, namespace):
    lines = _history_lines[-20:] if _history_lines else []
    if not lines: return "No history yet."
    return "History:\n" + '\n'.join(f"{i+1}: {line}" for i, line in enumerate(lines))

def _magic_gc(args, cell, namespace):
    import gc, psutil
    process = psutil.Process()
    before = process.memory_info().rss / (1024**2)
    collected = gc.collect()
    after = process.memory_info().rss / (1024**2)
    return f"Garbage collection: {collected} objects collected. Memory: {before:.1f} MB -> {after:.1f} MB (freed {before-after:.1f} MB)"

def _magic_cache(args, cell, namespace):
    if len(args) < 2: return "Usage: %cache save varname [filename]  or  %cache load varname [filename]"
    action = args[0]
    varname = args[1]
    filename = args[2] if len(args) > 2 else f"{varname}.pkl"
    try: import joblib
    except ImportError: return "joblib not installed. Please install: pip install joblib"
    if action == 'save':
        if varname not in namespace: return f"Variable {varname} not found in namespace."
        obj = namespace[varname]
        joblib.dump(obj, filename)
        return f"Saved {varname} to {filename}"
    elif action == 'load':
        if not os.path.exists(filename): return f"File {filename} not found."
        obj = joblib.load(filename)
        namespace[varname] = obj
        return f"Loaded {varname} from {filename}"
    else: return "Invalid action. Use 'save' or 'load'."

def _magic_pip(args, cell, namespace):
    "%pip install <pkg> – install into the kernel's venv."
    if not args: return "Usage: %pip install <package>"
    cmd = [sys.executable, "-m", "pip"] + args
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        output = (proc.stdout or "") + (proc.stderr or "")
        return output or "Done."
    except subprocess.TimeoutExpired: return "pip install timed out (5 min limit)."
    except Exception as e: return f"Error: {e}"

# ----------------------------------------------------------------------
# Full ipywidgets system (unchanged)
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
        
        # FIX #4: Include children IDs in the payload
        children_ids = [c.id if hasattr(c, 'id') else c for c in self._children]
        payload = {**kwargs, 'widget_id': self.id, 'type': widget_type, 'children': children_ids}
        self._send_widget_event('create', payload)
        
        _widgets[self.id] = self
        
    def _send_widget_event(self, event, data):
        msg = {'event': event, 'widget_id': self.id, 'type': self.type, 'data': data}
        sys.stdout.write("---JUPY_WIDGET---\n")
        sys.stdout.write(json.dumps(msg) + "\n")
        sys.stdout.flush()
        
    def set_state(self, **kwargs):
        self.kwargs.update(kwargs)
        self._send_widget_event('update', kwargs)
        
    def observe(self, callback, names='value'):
        if isinstance(names, str): names = [names]
        for name in names:
            if name not in self._callbacks: self._callbacks[name] = []
            self._callbacks[name].append(callback)
            
    def on_click(self, callback): self.observe(callback, 'click')
    
    def _handle_frontend_event(self, event_data):
        for attr, value in event_data.items():
            if attr == 'value' or attr == 'click':
                self.kwargs[attr] = value
                if attr in self._callbacks:
                    for cb in self._callbacks[attr]: cb(value)
                for link in _links.values():
                    if link.source_id == self.id: link.propagate(value)

class OutputWidget(WidgetProxy):
    def __init__(self, **kwargs):
        super().__init__('Output', **kwargs)
        self._capturing = False
        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
        self._captured_out = io.StringIO()
        self._captured_err = io.StringIO()
    def __enter__(self):
        self._capturing = True
        sys.stdout = self._captured_out
        sys.stderr = self._captured_err
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        self._capturing = False
        sys.stdout = self._original_stdout
        sys.stderr = self._original_stderr
        out = self._captured_out.getvalue()
        err = self._captured_err.getvalue()
        if out: self._send_widget_event('output_stream', {'type': 'stdout', 'text': out})
        if err: self._send_widget_event('output_stream', {'type': 'stderr', 'text': err})
        self._captured_out = io.StringIO()
        self._captured_err = io.StringIO()
        return False

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
        msg = {
            'event': 'link' if not bidirectional else 'dlink',
            'widget_id': self.id,
            'data': {
                'source': self.source_id,
                'target': self.target_id,
                'transform': transform
            }
        }
        sys.stdout.write("---JUPY_WIDGET---\n")
        sys.stdout.write(json.dumps(msg) + "\n")
        sys.stdout.flush()
    def propagate(self, value):
        if self.transform: value = self.transform(value)
        target = _widgets.get(self.target_id)
        if target: target.set_state(value=value)

def link(source, target, transform=None): return Link(source, target, transform, bidirectional=False)
def dlink(source, target, transform=None): return Link(source, target, transform, bidirectional=True)

def IntSlider(**kwargs): return WidgetProxy('IntSlider', **kwargs)
def FloatSlider(**kwargs): return WidgetProxy('FloatSlider', **kwargs)
def IntText(**kwargs): return WidgetProxy('IntText', **kwargs)
def FloatText(**kwargs): return WidgetProxy('FloatText', **kwargs)
def Checkbox(**kwargs): return WidgetProxy('Checkbox', **kwargs)
def RadioButtons(**kwargs): return WidgetProxy('RadioButtons', **kwargs)
def ToggleButton(**kwargs): return WidgetProxy('ToggleButton', **kwargs)
def ToggleButtons(**kwargs): return WidgetProxy('ToggleButtons', **kwargs)
def Dropdown(**kwargs): return WidgetProxy('Dropdown', **kwargs)
def Select(**kwargs): return WidgetProxy('Select', **kwargs)
def SelectMultiple(**kwargs): return WidgetProxy('SelectMultiple', **kwargs)
def DatePicker(**kwargs): return WidgetProxy('DatePicker', **kwargs)
def TimePicker(**kwargs): return WidgetProxy('TimePicker', **kwargs)
def ColorPicker(**kwargs): return WidgetProxy('ColorPicker', **kwargs)
def FileUpload(**kwargs): return WidgetProxy('FileUpload', **kwargs)
def Play(**kwargs): return WidgetProxy('Play', **kwargs)
def VBox(**kwargs): return WidgetProxy('VBox', **kwargs)
def HBox(**kwargs): return WidgetProxy('HBox', **kwargs)
def GridBox(**kwargs): return WidgetProxy('GridBox', **kwargs)
def Accordion(**kwargs): return WidgetProxy('Accordion', **kwargs)
def Tab(**kwargs): return WidgetProxy('Tab', **kwargs)
def Stack(**kwargs): return WidgetProxy('Stack', **kwargs)
def Box(**kwargs): return WidgetProxy('Box', **kwargs)
def Output(**kwargs): return OutputWidget(**kwargs)

def interact(func=None, **options):
    if func is None:
        def decorator(f): return interact(f, **options)
        return decorator
    else:
        widgets = {}
        for name, value in options.items():
            if isinstance(value, (int, float)): widgets[name] = IntSlider(value=value, min=0, max=10*value, description=name)
            elif isinstance(value, list): widgets[name] = Dropdown(options=value, value=value[0], description=name)
            elif isinstance(value, bool): widgets[name] = Checkbox(value=value, description=name)
            else: widgets[name] = IntText(value=value, description=name)
        if widgets: display(VBox(children=list(widgets.values())))
        def wrapper(*args, **kwargs):
            kwargs = {name: w.kwargs.get('value') for name, w in widgets.items()}
            result = func(**kwargs)
            if result is not None: display(result)
            return result
        for w in widgets.values(): w.observe(lambda _: wrapper(), 'value')
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
namespace['Stack'] = Stack
namespace['Box'] = Box
namespace['Output'] = Output
namespace['link'] = link
namespace['dlink'] = dlink
namespace['interact'] = interact

# ----------------------------------------------------------------------
# Display, plots, input, warmup – WITH FULL IPYWIDGETS SUPPORT
# ----------------------------------------------------------------------
def _send_display_data(mimebundle):
    sys.stdout.write("---JUPY_DISPLAY_DATA---\n")
    sys.stdout.write(json.dumps(mimebundle) + "\n")
    sys.stdout.flush()

def _encode_binary(data):
    if isinstance(data, bytes): return base64.b64encode(data).decode('ascii')
    return data

def display(*objs, raw=False, **kwargs):
    if len(objs) == 0: return
    if len(objs) > 1:
        for obj in objs: display(obj, raw=raw, **kwargs)
        return
    obj = objs[0]
    if isinstance(obj, dict) and any(k in obj for k in ('text/html', 'text/plain', 'image/png', 'image/svg+xml')):
        for mime in ('image/png', 'image/jpeg', 'image/gif'):
            if mime in obj: obj[mime] = _encode_binary(obj[mime])
        _send_display_data(obj)
        return
    mimebundle = {}
    if hasattr(obj, '_repr_mimebundle_'):
        try:
            bundle = obj._repr_mimebundle_()
            if isinstance(bundle, dict):
                mimebundle.update(bundle)
                for key, val in mimebundle.items():
                    if isinstance(val, list): mimebundle[key] = val[0] if val else None
        except Exception: pass
    for fmt in ('html', 'svg', 'latex', 'markdown', 'json', 'png', 'jpeg', 'gif'):
        if fmt not in mimebundle:
            method = getattr(obj, f'_repr_{fmt}_', None)
            if method is not None:
                try:
                    data = method()
                    if data is not None: mimebundle[f'text/{fmt}'] = data
                except Exception: pass
    if hasattr(obj, '_repr_html_'):
        try:
            html = obj._repr_html_()
            if html: mimebundle['text/html'] = html
        except Exception: pass
    if not mimebundle:
        try: mimebundle['text/plain'] = repr(obj)
        except Exception: mimebundle['text/plain'] = str(obj)
    for mime in ('image/png', 'image/jpeg', 'image/gif'):
        if mime in mimebundle: mimebundle[mime] = _encode_binary(mimebundle[mime])
    if raw: mimebundle = {'text/plain': mimebundle.get('text/plain', str(obj))}
    if mimebundle: _send_display_data(mimebundle)

def _patch_ipython_display():
    try:
        import IPython.display
        IPython.display.display = display
    except ImportError: pass

sys.stdout.write("---JUPY_KERNEL_READY---\n")
sys.stdout.flush()
_patch_ipython_display()

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
            except Exception: pass
        fignums = plt.get_fignums()
        for i in list(fignums):
            try:
                manager = Gcf.get_fig_manager(i)
                if manager and manager.canvas and manager.canvas.figure:
                    fig = manager.canvas.figure
                    if fig.get_axes():
                        try: fig.tight_layout()
                        except: pass
                        buf = io.BytesIO()
                        fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0.1, dpi=110, facecolor="#FFFFFF")
                        buf.seek(0)
                        b64 = base64.b64encode(buf.read()).decode("ascii")
                        plots.append(f'<img class="notebook-plot" src="data:image/png;base64,{b64}" alt="Plot" />')
            except: pass
        try: plt.close("all")
        except: pass
        try: Gcf.destroy_all()
        except: pass
        try: Gcf.figs.clear()
        except: pass
    return plots

def _warmup_jedi():
    try:
        import jedi
        jedi.Script("import math\nmath.").complete(2, 5)
    except: pass
threading.Thread(target=_warmup_jedi, daemon=True).start()

def _custom_input(prompt=""):
    prompt_str = str(prompt)
    sys.stdout.write(f"---JUPY_STDIN_REQ:{prompt_str}---\n")
    sys.stdout.flush()
    line = sys.stdin.readline()
    if not line: raise KeyboardInterrupt("Input stream closed.")
    return line.rstrip("\r\n")
builtins.input = _custom_input

# ----------------------------------------------------------------------
# Main execution loop
# ----------------------------------------------------------------------
while True:
    line = sys.stdin.readline()
    if not line: break
    try:
        data = json.loads(line)
        action = data.get("action")
        if action == "complete":
            code = data.get("code", "")
            l_num = data.get("line", 1)
            c_num = data.get("column", 0)
            comps = get_worker_completions(code, l_num, c_num, namespace)
            sys.stdout.write(f"---JUPY_COMPS:{json.dumps(comps)}---\n")
            sys.stdout.flush()
        elif action == "hover":
            code = data.get("code", "")
            l_num = data.get("line", 1)
            c_num = data.get("column", 0)
            info = get_worker_hover(code, l_num, c_num)
            sys.stdout.write(f"---JUPY_HOVER:{json.dumps(info)}---\n")
            sys.stdout.flush()
        elif action == "widget_event":
            widget_id = data.get('widget_id')
            event_data = data.get('data', {})
            if widget_id in _widgets: _widgets[widget_id]._handle_frontend_event(event_data)
            continue
        elif action == "list_vars":
            vars_list = []
            for name, val in namespace.items():
                if name.startswith('_'): continue
                try:
                    size = sys.getsizeof(val)
                    type_name = type(val).__name__
                    length = len(val) if hasattr(val, '__len__') else None
                    vars_list.append({"name": name, "type": type_name, "size": size, "length": length})
                except: pass
            sys.stdout.write(f"---JUPY_VARS:{json.dumps(vars_list)}---\n")
            sys.stdout.flush()
        elif action == "df_preview":
            var_name = data.get("var")
            rows = data.get("rows", 10)
            html = "<p>Variable not found or not a DataFrame</p>"
            if var_name in namespace:
                obj = namespace[var_name]
                try:
                    import pandas as pd
                    if isinstance(obj, pd.DataFrame): html = obj.head(rows).to_html()
                    elif hasattr(obj, 'to_html'): html = obj.to_html()
                except: pass
            sys.stdout.write(f"---JUPY_DF_HTML:{html}---\n")
            sys.stdout.flush()
        elif action == "set_breakpoints":
            breakpoints = data.get("breakpoints", [])
            _breakpoints = breakpoints
            _debugger_enabled = True
            sys.stdout.write("---JUPY_BREAKPOINTS_SET---\n")
            sys.stdout.flush()
        elif action == "debugger":
            cmd = data.get("cmd")
            arg = data.get("arg")
            if cmd == "step":
                _debugger_event.set()
                _debugger_mode = arg
            elif cmd == "continue":
                _debugger_event.set()
                _debugger_mode = "continue"
            elif cmd == "stop":
                _debugger_event.set()
                _debugger_mode = "stop"
            sys.stdout.write("---JUPY_DEBUGGER_ACK---\n")
            sys.stdout.flush()
        elif action == "execute":
            code = data.get("code", "")
            lines = code.splitlines()
            if lines and lines[0].strip().startswith('%%'):
                magic_line = lines[0]
                cell_body = '\n'.join(lines[1:])
                parts = magic_line[2:].strip().split()
                magic_name = parts[0] if parts else ''
                args = parts[1:]
                magic_str = '%' + magic_name + ' ' + ' '.join(args)
                result = _run_magic(magic_str, cell_body, namespace)
                if result:
                    sys.stdout.write("---JUPY_STDOUT---\n")
                    sys.stdout.write(result + "\n")
                sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
                sys.stdout.flush()
                continue
            non_empty_lines = [l for l in lines if l.strip()]
            if non_empty_lines and non_empty_lines[0].strip().startswith('%'):
                magic_line = non_empty_lines[0].strip()
                first_non_empty_idx = next(i for i, l in enumerate(lines) if l.strip())
                result = _run_magic(magic_line, None, namespace)
                if result:
                    sys.stdout.write("---JUPY_STDOUT---\n")
                    sys.stdout.write(result + "\n")
                remaining_lines = lines[first_non_empty_idx+1:]
                remaining_code = '\n'.join(remaining_lines)
                if not remaining_code.strip():
                    sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
                    sys.stdout.flush()
                    continue
                code = remaining_code
                lines = remaining_lines
            non_empty_lines = [l for l in lines if l.strip()]
            if non_empty_lines and non_empty_lines[0].strip().startswith('!'):
                cmd_line = non_empty_lines[0].strip()
                if cmd_line.startswith('!'): cmd = cmd_line[1:].strip()
                else: cmd = cmd_line
                first_non_empty_idx = next(i for i, l in enumerate(lines) if l.strip())
                if cmd.startswith('pip ') or cmd.startswith('pip3 '):
                    pip_args = cmd.split()[1:]
                    try:
                        proc = subprocess.run([sys.executable, "-m", "pip"] + pip_args, capture_output=True, text=True, timeout=300)
                        if proc.stdout:
                            sys.stdout.write("---JUPY_STDOUT---\n")
                            sys.stdout.write(proc.stdout)
                        if proc.stderr:
                            sys.stdout.write("---JUPY_STDERR---\n")
                            sys.stdout.write(proc.stderr)
                    except Exception as e:
                        sys.stdout.write("---JUPY_STDERR---\n")
                        sys.stdout.write(str(e) + "\n")
                else:
                    try:
                        proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
                        if proc.stdout:
                            sys.stdout.write("---JUPY_STDOUT---\n")
                            sys.stdout.write(proc.stdout)
                        if proc.stderr:
                            sys.stdout.write("---JUPY_STDERR---\n")
                            sys.stdout.write(proc.stderr)
                    except Exception as e:
                        sys.stdout.write("---JUPY_STDERR---\n")
                        sys.stdout.write(str(e) + "\n")
                remaining_lines = lines[first_non_empty_idx+1:]
                remaining_code = '\n'.join(remaining_lines)
                if not remaining_code.strip():
                    sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
                    sys.stdout.flush()
                    continue
                code = remaining_code
                lines = remaining_lines
            if code.strip(): _history_lines.append(code)
            _patch_ipython_display()
            if _autoreload_enabled:
                for mod_name, mod in list(sys.modules.items()):
                    if (mod_name not in sys.builtin_module_names and not mod_name.startswith('_') and mod_name not in ('jupy', 'jupy.core', 'jupy.core.kernel')):
                        try: importlib.reload(mod)
                        except: pass
            if _breakpoints: sys.settrace(_debugger_trace)
            out, err = io.StringIO(), io.StringIO()
            try:
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    tree = ast.parse(code, mode="exec")
                    if tree.body and isinstance(tree.body[-1], ast.Expr):
                        last = tree.body.pop()
                        if tree.body: exec(compile(tree, "<cell>", "exec"), namespace)
                        expr = ast.Expression(last.value)
                        ast.copy_location(expr, last.value)
                        val = eval(compile(expr, "<cell>", "eval"), namespace)
                        if val is not None:
                            if _float_precision is not None:
                                if isinstance(val, float): sys.stdout.write(format(val, f'.{_float_precision}f') + "\n")
                                else: sys.stdout.write(repr(val) + "\n")
                            else: sys.stdout.write(repr(val) + "\n")
                    else: exec(compile(code, "<cell>", "exec"), namespace)
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
                    for p in plots: sys.stdout.write(p + "\n")
                    sys.stdout.write("---JUPY_PLOTS_END---\n")
            except SyntaxError as e:
                err_msg = "".join(traceback.format_exception_only(type(e), e))
                if _xmode == 'Plain': err_msg = f"{type(e).__name__}: {e}"
                elif _xmode == 'Context': err_msg = "".join(traceback.format_exception_only(type(e), e))
                else: err_msg = "".join(traceback.format_exception_only(type(e), e))
                sys.stdout.write(f"---JUPY_STDERR---\n{err_msg}\n")
            except Exception as e:
                if _pdb_mode:
                    sys.stdout.write("---JUPY_STDERR---\n")
                    sys.stdout.write("pdb mode is ON, but post‑mortem debugging is not supported in headless kernel.\n")
                tb = e.__traceback__.tb_next if e.__traceback__ else None
                if _xmode == 'Plain': err_msg = f"{type(e).__name__}: {e}"
                elif _xmode == 'Context': err_msg = "".join(traceback.format_exception(type(e), e, tb))
                else: err_msg = "".join(traceback.format_exception(type(e), e, tb))
                sys.stdout.write(f"---JUPY_STDERR---\n{err_msg}\n")
            sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
            sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(f"---JUPY_STDERR---\nKernel error: {e}\n")
        sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
        sys.stdout.flush()
"""