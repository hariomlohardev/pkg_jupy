"""
jupy/core/kernel.py
Persistent Python Kernel Manager — one long-lived worker subprocess per
notebook session, communicating over stdin/stdout with simple ASCII framing.

Which interpreter backs the worker is now dynamic (see core/envmanager.py):
by default it's a global env shared across projects, but the user can switch
to a project-local `.jupy_env` or another named global env from the
Environment panel — see switch_env() below, wired up via
POST /api/env/select in server/handlers.py.
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

# Lazy matplotlib backend – only set when capturing plots
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
        # Get definitions and signatures
        names = script.infer(line, col)
        if not names:
            return None
        # Get the first definition
        name = names[0]
        docstring = name.docstring() or ""
        # Get signature if it's a function/class
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

            try:
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
                        sys.stdout.flush()
                else:
                    exec(compile(code, "<cell>", "exec"), namespace)

                plots = _capture_plots()
                if plots:
                    sys.stdout.write("---JUPY_PLOTS_START---\n")
                    sys.stdout.flush()
                    for p in plots:
                        sys.stdout.write(p + "\n")
                        sys.stdout.flush()
                    sys.stdout.write("---JUPY_PLOTS_END---\n")
                    sys.stdout.flush()

            except SyntaxError as e:
                err_msg = "".join(traceback.format_exception_only(type(e), e))
                sys.stdout.write(f"---JUPY_STDERR_START---\n{err_msg}---JUPY_STDERR_END---\n")
                sys.stdout.flush()
            except Exception as e:
                tb = e.__traceback__.tb_next if e.__traceback__ else None
                err_msg = "".join(traceback.format_exception(type(e), e, tb))
                sys.stdout.write(f"---JUPY_STDERR_START---\n{err_msg}---JUPY_STDERR_END---\n")
                sys.stdout.flush()

            sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
            sys.stdout.flush()

    except Exception as e:
        sys.stdout.write(f"---JUPY_STDERR_START---\nKernel error: {e}\n---JUPY_STDERR_END---\n")
        sys.stdout.flush()
        sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
        sys.stdout.flush()
"""


def _kill_process_tree(proc):
    """Forcefully kills process tree instantly, without touching its
    stdin/stdout/stderr pipe objects. Safe to call from any thread — including
    while another thread is concurrently blocked reading/writing those pipes
    — which is required for interrupt() to work instantly without waiting on
    comm_lock (see KernelManager.force_interrupt)."""
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
    """Waits for an already-killed process to fully exit, then closes its
    pipes. Run on a background thread by restart() (see below) so that
    restart() itself stays instant — it never blocks waiting for comm_lock,
    exactly like interrupt(), even if a cell is currently running.

    Waiting for the process to actually exit before touching its pipes is
    what makes this safe to do without holding any lock: once wait() returns,
    the process (and both ends of its pipes) are fully torn down, so any
    other thread that was blocked reading/writing them has already unblocked
    on its own (a dead process's pipes surface as a normal, harmless EOF/
    write-failure to whoever's using them — see execute()'s retry logic).

    Without this cleanup, a killed process's pipe handles would otherwise get
    closed implicitly and lazily by the garbage collector at some later,
    unrelated point in the program. On Windows that deferred close can raise
    "OSError: [Errno 22] Invalid argument" from inside a finalizer, which
    Python can't propagate normally and instead prints as a scary-looking but
    harmless "Exception ignored in: <_io.TextIOWrapper ...>" — closing things
    ourselves, on our own schedule, avoids that entirely.
    """
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
    """Persistent Python Kernel Manager with instant non-blocking process
    force-kill and a switchable backing environment (see core/envmanager.py)."""

    def __init__(self):
        self.exec_count = 0
        self.proc = None
        self.lock = threading.Lock()
        self.comm_lock = threading.Lock()  # guards ALL stdin/stdout traffic with the worker

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
        """Sends completion request into worker kernel. Never blocks a
        running cell — returns [] immediately if the kernel is busy, exactly
        like real Jupyter/Colab do."""
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
        """Sends hover request to worker kernel and returns info dict or None."""
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
        """Forcefully kills running process instantly without waiting for thread locks."""
        proc = self.proc
        if proc and proc.poll() is None:
            _kill_process_tree(proc)
            return True
        return False

    def interrupt(self):
        return self.force_interrupt()

    def restart(self):
        """Restarts kernel process (same env), wiping namespace state.

        Kills the old process and spawns a new one immediately — this is
        intentionally NOT gated on comm_lock, so it (and switch_env(), which
        calls this) stay instant even while a cell is currently running,
        exactly like interrupt(). The old process's pipes are reaped and
        closed on a background thread once it has actually exited (see
        _reap_and_close) instead of synchronously here or left for the
        garbage collector.

        Because this doesn't wait for comm_lock, there's an inherent tiny
        window where execute() could grab a reference to the process being
        killed right here and try to write to it. execute() handles that
        itself by transparently respawning and retrying once — see below —
        so switching environments never surfaces a "Kernel communication
        error" to the user.
        """
        old_proc = self.proc
        self.proc = None
        _kill_process_tree(old_proc)
        if old_proc is not None:
            threading.Thread(target=_reap_and_close, args=(old_proc,), daemon=True).start()
        self.exec_count = 0
        self._ensure_kernel_proc()

    def switch_env(self, mode, name=None, on_progress=None):
        """Persists a new env choice for this folder, ensures it exists
        (creating it on first use), and restarts the kernel against it."""
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

        lines = code.splitlines()
        pip_cmds = []
        py_lines = []

        # Faster pip detection using startswith and slicing
        for line in lines:
            stripped = line.strip()
            if stripped.startswith(('!pip install', '%pip install', 'pip install')):
                # Remove leading ! or % and the "pip install" part
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
                # current_proc may have just been killed by a concurrent
                # restart()/switch_env() call — those intentionally don't wait
                # for comm_lock so they stay instant even mid-execution (see
                # KernelManager.restart). Recover by respawning a fresh
                # process and trying once more before giving up.
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

            stderr_collecting = False
            plots_collecting = False
            plot_lines = []

            while current_proc:
                try:
                    line = current_proc.stdout.readline()
                except Exception:
                    line = ""

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
                    # Skip sending empty lines to reduce WebSocket traffic
                    if line.strip():
                        ws_send_fn({"type": "stdout", "text": line})

        ws_send_fn({"type": "complete", "exec_count": self.exec_count})


kernel = KernelManager()