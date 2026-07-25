import json
import os
import re
import subprocess
import sys
import threading
import time
from jupy.core.venv import VENV_PYTHON

# Persistent Kernel Worker Process Script
KERNEL_WORKER_SCRIPT = r"""
import sys, io, ast, base64, json, traceback, builtins, warnings, re, keyword, importlib, threading

warnings.filterwarnings("ignore", category=UserWarning, module="matplotlib")

namespace = {"__name__": "__main__"}

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

def _capture_plots():
    plots = []
    if "matplotlib.pyplot" in sys.modules:
        import matplotlib.pyplot as plt
        from matplotlib._pylab_helpers import Gcf
        
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
        
        elif action == "execute":
            code = data.get("code", "")
            
            try:
                if "matplotlib" in sys.modules:
                    import matplotlib
                    try: matplotlib.use("Agg", force=True)
                    except Exception: pass

                tree = ast.parse(code, mode="exec")
                if tree.body and isinstance(tree.body[-1], ast.Expr):
                    last = tree.body.pop()
                    if tree.body:
                        exec(compile(tree, "<cell>", "exec"), namespace)
                    expr = ast.Expression(last.value)
                    ast.copy_location(expr, last.value)
                    val = eval(compile(expr, "<cell>", "eval"), namespace)
                    if val is not None:
                        print(repr(val), flush=True)
                else:
                    exec(compile(code, "<cell>", "exec"), namespace)

                plots = _capture_plots()
                if plots:
                    print("---JUPY_PLOTS_START---", flush=True)
                    for p in plots:
                        print(p, flush=True)
                    print("---JUPY_PLOTS_END---", flush=True)

            except SyntaxError as e:
                err_msg = "".join(traceback.format_exception_only(type(e), e))
                sys.stdout.write(f"---JUPY_STDERR_START---\n{err_msg}---JUPY_STDERR_END---\n")
                sys.stdout.flush()
            except Exception as e:
                tb = e.__traceback__.tb_next if e.__traceback__ else None
                err_msg = "".join(traceback.format_exception(type(e), e, tb))
                sys.stdout.write(f"---JUPY_STDERR_START---\n{err_msg}---JUPY_STDERR_END---\n")
                sys.stdout.flush()

            print("---JUPY_CELL_COMPLETE---", flush=True)

    except Exception as e:
        sys.stdout.write(f"---JUPY_STDERR_START---\nKernel error: {e}\n---JUPY_STDERR_END---\n")
        print("---JUPY_CELL_COMPLETE---", flush=True)
"""


def _force_kill_process(proc):
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


class KernelManager:
    """Persistent Python Kernel Manager with instant non-blocking process force-kill."""
    def __init__(self):
        self.exec_count = 0
        self.proc = None
        self.lock = threading.Lock()
        self._ensure_kernel_proc()

    def _ensure_kernel_proc(self):
        with self.lock:
            if self.proc is None or self.proc.poll() is not None:
                env = os.environ.copy()
                env["PYTHONUNBUFFERED"] = "1"

                self.proc = subprocess.Popen(
                    [VENV_PYTHON, "-u", "-c", KERNEL_WORKER_SCRIPT],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=1,
                    env=env
                )
                while True:
                    line = self.proc.stdout.readline()
                    if "---JUPY_KERNEL_READY---" in line or not line:
                        break

    def get_completions(self, code, line, col):
        """Sends completion request into worker kernel."""
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

    def force_interrupt(self):
        """Forcefully kills running process instantly without waiting for thread locks."""
        proc = self.proc
        if proc and proc.poll() is None:
            _force_kill_process(proc)
            return True
        return False

    def interrupt(self):
        return self.force_interrupt()

    def restart(self):
        """Restarts kernel process, wiping namespace state."""
        proc = self.proc
        if proc:
            _force_kill_process(proc)
        self.proc = None
        self.exec_count = 0
        self._ensure_kernel_proc()

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
        self._ensure_kernel_proc()
        current_proc = self.proc

        lines = code.splitlines()
        pip_cmds = []
        py_lines = []

        for line in lines:
            stripped = line.strip()
            if re.match(r'^[!%]?\s*pip\s+install\s+', stripped):
                clean_cmd = re.sub(r'^[!%]?\s*pip\s+install\s+', '', stripped)
                pip_cmds.append(clean_cmd)
            else:
                py_lines.append(line)

        for cmd in pip_cmds:
            ws_send_fn({"type": "stdout", "text": f"Installing {cmd} in .jupy_env...\n"})
            p = subprocess.run([VENV_PYTHON, "-m", "pip", "install"] + cmd.split(), capture_output=True, text=True)
            if p.stdout: ws_send_fn({"type": "stdout", "text": p.stdout})
            if p.stderr: ws_send_fn({"type": "stderr", "text": p.stderr})

        clean_code = "\n".join(py_lines)
        if not clean_code.strip():
            ws_send_fn({"type": "complete", "exec_count": self.exec_count})
            return

        req = json.dumps({"action": "execute", "code": clean_code}) + "\n"
        try:
            current_proc.stdin.write(req)
            current_proc.stdin.flush()
        except Exception as e:
            ws_send_fn({"type": "stderr", "text": f"Kernel communication error: {str(e)}\n"})
            ws_send_fn({"type": "complete", "exec_count": self.exec_count})
            return

        stderr_collecting = False
        plots_collecting = False
        plot_lines = []

        while current_proc:
            line = current_proc.stdout.readline()

            # Detect if process was force-killed by user interrupt
            if not line:
                if current_proc.poll() is not None:
                    ws_send_fn({"type": "stderr", "text": "\n⏹ Execution force stopped by user.\n"})
                break

            if line.startswith("---JUPY_STDIN_REQ:"):
                prompt = line.replace("---JUPY_STDIN_REQ:", "").replace("---", "").strip()
                ws_send_fn({"type": "stdin_request", "prompt": prompt})
                continue

            if "---JUPY_CELL_COMPLETE---" in line:
                break

            if "---JUPY_STDERR_START---" in line:
                stderr_collecting = True
                continue
            if "---JUPY_STDERR_END---" in line:
                stderr_collecting = False
                continue

            if "---JUPY_PLOTS_START---" in line:
                plots_collecting = True
                continue
            if "---JUPY_PLOTS_END---" in line:
                plots_collecting = False
                for p in plot_lines:
                    ws_send_fn({"type": "plot", "html": p})
                plot_lines = []
                continue

            if stderr_collecting:
                ws_send_fn({"type": "stderr", "text": line})
            elif plots_collecting:
                plot_lines.append(line.strip())
            else:
                ws_send_fn({"type": "stdout", "text": line})

        ws_send_fn({"type": "complete", "exec_count": self.exec_count})


kernel = KernelManager()
