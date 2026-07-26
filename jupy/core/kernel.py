"""
jupy/core/kernel.py
Persistent Python Kernel Manager with rich display support.
"""
import json
import os
import re
import subprocess
import sys
import threading

from jupy.core import envmanager

# Persistent Kernel Worker Process Script
KERNEL_WORKER_SCRIPT = r"""
import sys, io, ast, base64, json, traceback, builtins, warnings, re, keyword, importlib, threading
import contextlib

warnings.filterwarnings("ignore", category=UserWarning, module="matplotlib")

namespace = {"__name__": "__main__"}

# ----------------------------------------------------------------------
# Custom display() function to capture rich MIME data
# ----------------------------------------------------------------------
def _send_display_data(mimebundle):
    # Send MIME bundle to frontend via stdout marker.
    sys.stdout.write("---JUPY_DISPLAY_DATA---\n")
    sys.stdout.write(json.dumps(mimebundle) + "\n")
    sys.stdout.flush()

def display(obj, raw=False, **kwargs):
    # Mimics IPython.display.display.
    # Captures rich representations and sends them to the frontend.
    # If obj is a dict with MIME keys, treat as mimebundle
    if isinstance(obj, dict) and any(k in obj for k in ('text/html', 'text/plain', 'image/png', 'image/svg+xml')):
        _send_display_data(obj)
        return

    # Try to get rich representations
    mimebundle = {}
    # 1. Check for _repr_html_, _repr_svg_, _repr_latex_, _repr_markdown_, etc.
    for fmt in ('html', 'svg', 'latex', 'markdown', 'json', 'png', 'jpeg'):
        method = getattr(obj, f'_repr_{fmt}_', None)
        if method is not None:
            try:
                data = method()
                if data is not None:
                    mimebundle[f'text/{fmt}'] = data
            except Exception:
                pass
    # 2. If it's a pandas DataFrame, get HTML
    if hasattr(obj, '_repr_html_'):
        try:
            html = obj._repr_html_()
            if html:
                mimebundle['text/html'] = html
        except Exception:
            pass
    # 3. Fallback to repr
    if not mimebundle:
        try:
            mimebundle['text/plain'] = repr(obj)
        except Exception:
            mimebundle['text/plain'] = str(obj)

    # 4. If raw=True, skip repr and just send text
    if raw:
        mimebundle = {'text/plain': str(obj)}

    # Send if we have something
    if mimebundle:
        _send_display_data(mimebundle)

# Inject display into namespace
namespace['display'] = display

# ----------------------------------------------------------------------
# Matplotlib plot capture (improved)
# ----------------------------------------------------------------------
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
# Autocomplete, hover, input helpers
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
            # Try goto_definition as fallback
            defs = script.goto(line, col, follow_imports=True)
            if defs:
                # Use the first definition
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

        elif action == "execute":
            code = data.get("code", "")

            # Capture stdout/stderr
            out, err = io.StringIO(), io.StringIO()

            try:
                # Redirect stdout/stderr to capture print and display output
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    # Parse and execute
                    tree = ast.parse(code, mode="exec")
                    if tree.body and isinstance(tree.body[-1], ast.Expr):
                        last = tree.body.pop()
                        if tree.body:
                            exec(compile(tree, "<cell>", "exec"), namespace)
                        expr = ast.Expression(last.value)
                        ast.copy_location(expr, last.value)
                        val = eval(compile(expr, "<cell>", "eval"), namespace)
                        if val is not None:
                            # Print repr to stdout
                            sys.stdout.write(repr(val) + "\n")
                    else:
                        exec(compile(code, "<cell>", "exec"), namespace)

                    # Capture plots after execution
                    plots = _capture_plots()

                # Send stdout/stderr
                stdout_val = out.getvalue()
                stderr_val = err.getvalue()
                if stdout_val:
                    sys.stdout.write("---JUPY_STDOUT---\n")
                    sys.stdout.write(stdout_val)
                if stderr_val:
                    sys.stdout.write("---JUPY_STDERR---\n")
                    sys.stdout.write(stderr_val)

                # Send plots
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

            # Signal completion
            sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
            sys.stdout.flush()

    except Exception as e:
        sys.stdout.write(f"---JUPY_STDERR---\nKernel error: {e}\n")
        sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
        sys.stdout.flush()
"""


def _kill_process_tree(proc):
    """Forcefully kills process tree instantly."""
    if proc and proc.poll() is None:
        try:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
            else:
                proc.kill()
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass


def _reap_and_close(proc):
    """Waits for an already-killed process to fully exit, then closes its pipes."""
    if proc is None:
        return
    try:
        proc.wait(timeout=5)
    except Exception:
        pass
    for stream in (proc.stdin, proc.stdout, proc.stderr):
        if stream is not None:
            try:
                stream.close()
            except Exception:
                pass


class KernelManager:
    """Persistent Python Kernel Manager with rich display support."""

    def __init__(self):
        self.exec_count = 0
        self.proc = None
        self.lock = threading.Lock()
        self.comm_lock = threading.Lock()

        self.env_info = envmanager.resolve_active_env(on_progress=print)
        self.python = self.env_info["python"]

        self._ensure_kernel_proc()

    def _ensure_kernel_proc(self):
        with self.lock:
            if self.proc is None or self.proc.poll() is not None:
                env = os.environ.copy()
                env["PYTHONUNBUFFERED"] = "1"

                try:
                    proc = subprocess.Popen(
                        [self.python, "-u", "-c", KERNEL_WORKER_SCRIPT],
                        stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        bufsize=1,
                        env=env
                    )
                except Exception as e:
                    raise RuntimeError(f"Couldn't launch the Python interpreter at '{self.python}': {e}") from e

                ready = False
                while True:
                    line = proc.stdout.readline()
                    if "---JUPY_KERNEL_READY---" in line:
                        ready = True
                        break
                    if not line:
                        break

                if not ready:
                    try:
                        stderr_output = proc.stderr.read()
                    except Exception:
                        stderr_output = ""
                    try:
                        proc.wait(timeout=2)
                    except Exception:
                        pass
                    detail = stderr_output.strip() or "it exited immediately with no output"
                    raise RuntimeError(
                        f"Couldn't start the Python kernel using '{self.python}': {detail}"
                    )

                self.proc = proc

    def get_completions(self, code, line, col):
        if not self.comm_lock.acquire(blocking=False):
            return []

        try:
            proc = self.proc
            if proc is None or proc.poll() is not None:
                return []

            req = json.dumps({"action": "complete", "code": code, "line": line, "column": col}) + "\n"
            try:
                proc.stdin.write(req)
                proc.stdin.flush()
            except Exception:
                return []

            while proc and proc.poll() is None:
                line_str = proc.stdout.readline()
                if not line_str:
                    break

                if line_str.startswith("---JUPY_COMPS:"):
                    json_str = line_str.replace("---JUPY_COMPS:", "").strip()
                    if json_str.endswith("---"):
                        json_str = json_str[:-3]
                    try:
                        return json.loads(json_str)
                    except Exception:
                        return []
                elif "---JUPY_CELL_COMPLETE---" in line_str:
                    break

            return []
        finally:
            self.comm_lock.release()

    def get_hover(self, code, line, col):
        if not self.comm_lock.acquire(blocking=False):
            return None

        try:
            proc = self.proc
            if proc is None or proc.poll() is not None:
                return None

            req = json.dumps({"action": "hover", "code": code, "line": line, "column": col}) + "\n"
            try:
                proc.stdin.write(req)
                proc.stdin.flush()
            except Exception:
                return None

            while proc and proc.poll() is None:
                line_str = proc.stdout.readline()
                if not line_str:
                    break

                if line_str.startswith("---JUPY_HOVER:"):
                    json_str = line_str.replace("---JUPY_HOVER:", "").strip()
                    if json_str.endswith("---"):
                        json_str = json_str[:-3]
                    try:
                        return json.loads(json_str) if json_str and json_str != "null" else None
                    except Exception:
                        return None
                elif "---JUPY_CELL_COMPLETE---" in line_str:
                    break

            return None
        finally:
            self.comm_lock.release()

    def force_interrupt(self):
        proc = self.proc
        if proc and proc.poll() is None:
            _kill_process_tree(proc)
            return True
        return False

    def interrupt(self):
        return self.force_interrupt()

    def restart(self):
        old_proc = self.proc
        self.proc = None
        _kill_process_tree(old_proc)
        if old_proc is not None:
            threading.Thread(target=_reap_and_close, args=(old_proc,), daemon=True).start()
        self.exec_count = 0
        self._ensure_kernel_proc()

    def switch_env(self, mode, name=None, on_progress=None):
        self.env_info = envmanager.set_active_env(mode, name, on_progress=on_progress)
        self.python = self.env_info["python"]
        self.restart()
        return self.env_info

    def handle_stdin_reply(self, value):
        proc = self.proc
        if proc and proc.poll() is None and proc.stdin:
            try:
                proc.stdin.write(f"{value}\n")
                proc.stdin.flush()
            except Exception:
                pass

    def execute(self, code, ws_send_fn):
        self.exec_count += 1

        # Split pip installs from code
        lines = code.splitlines()
        pip_cmds = []
        py_lines = []
        for line in lines:
            stripped = line.strip()
            if stripped.startswith(('!pip install', '%pip install', 'pip install')):
                cmd = stripped.lstrip('!%').lstrip()
                if cmd.startswith('pip install '):
                    clean_cmd = cmd[11:].strip()
                    if clean_cmd:
                        pip_cmds.append(clean_cmd)
            else:
                py_lines.append(line)

        for cmd in pip_cmds:
            ws_send_fn({"type": "stdout", "text": f"Installing {cmd}...\n"})
            p = subprocess.run([self.python, "-m", "pip", "install"] + cmd.split(), capture_output=True, text=True)
            if p.stdout:
                ws_send_fn({"type": "stdout", "text": p.stdout})
            if p.stderr:
                ws_send_fn({"type": "stderr", "text": p.stderr})

        clean_code = "\n".join(py_lines)
        if not clean_code.strip():
            ws_send_fn({"type": "complete", "exec_count": self.exec_count})
            return

        req = json.dumps({"action": "execute", "code": clean_code}) + "\n"

        with self.comm_lock:
            try:
                self._ensure_kernel_proc()
                current_proc = self.proc
            except Exception as e:
                ws_send_fn({"type": "stderr", "text": f"{e}\n"})
                ws_send_fn({"type": "complete", "exec_count": self.exec_count})
                return

            try:
                current_proc.stdin.write(req)
                current_proc.stdin.flush()
            except Exception:
                # Retry once if process died
                self.proc = None
                try:
                    self._ensure_kernel_proc()
                    current_proc = self.proc
                    current_proc.stdin.write(req)
                    current_proc.stdin.flush()
                except Exception as e:
                    ws_send_fn({"type": "stderr", "text": f"Kernel communication error: {str(e)}\n"})
                    ws_send_fn({"type": "complete", "exec_count": self.exec_count})
                    return

            # Read and parse output
            collecting = None  # 'stdout', 'stderr', 'plots', 'display'
            plot_lines = []
            display_data = []

            while current_proc:
                try:
                    line = current_proc.stdout.readline()
                except Exception:
                    line = ""

                if not line:
                    if current_proc.poll() is not None:
                        ws_send_fn({"type": "stderr", "text": "\n⏹ Execution force stopped by user.\n"})
                    break

                # Check for markers
                if line.startswith("---JUPY_STDIN_REQ:"):
                    prompt = line.replace("---JUPY_STDIN_REQ:", "").replace("---", "").strip()
                    ws_send_fn({"type": "stdin_request", "prompt": prompt})
                    continue

                if "---JUPY_CELL_COMPLETE---" in line:
                    break

                if "---JUPY_STDOUT---" in line:
                    collecting = 'stdout'
                    continue
                if "---JUPY_STDERR---" in line:
                    collecting = 'stderr'
                    continue
                if "---JUPY_PLOTS_START---" in line:
                    collecting = 'plots'
                    plot_lines = []
                    continue
                if "---JUPY_PLOTS_END---" in line:
                    collecting = None
                    for p in plot_lines:
                        ws_send_fn({"type": "plot", "html": p})
                    plot_lines = []
                    continue
                if "---JUPY_DISPLAY_DATA---" in line:
                    # Next line is JSON MIME bundle
                    json_line = current_proc.stdout.readline()
                    try:
                        mime_data = json.loads(json_line)
                        ws_send_fn({"type": "display", "data": mime_data})
                    except Exception:
                        pass
                    continue

                # Handle collected output
                if collecting == 'stdout':
                    if line.strip():
                        ws_send_fn({"type": "stdout", "text": line})
                elif collecting == 'stderr':
                    if line.strip():
                        ws_send_fn({"type": "stderr", "text": line})
                elif collecting == 'plots':
                    plot_lines.append(line.strip())
                else:
                    # Normal stdout (not from marker)
                    if line.strip():
                        ws_send_fn({"type": "stdout", "text": line})

        ws_send_fn({"type": "complete", "exec_count": self.exec_count})


kernel = KernelManager()