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
import sys, io, ast, base64, json, traceback, builtins, warnings

# Suppress non-GUI backend warnings
warnings.filterwarnings("ignore", category=UserWarning, module="matplotlib")

namespace = {"__name__": "__main__"}

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
                    # Only capture figures that actually contain plotted axes (ignore blank figures)
                    if fig.get_axes():
                        try: fig.tight_layout()
                        except Exception: pass
                        buf = io.BytesIO()
                        fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0.1, dpi=110, facecolor="#FFFFFF")
                        buf.seek(0)
                        b64 = base64.b64encode(buf.read()).decode("ascii")
                        plots.append(f'<img class="notebook-plot" src="data:image/png;base64,{b64}" alt="Plot" />')
            except Exception: pass
        
        # Complete registry wipe so subsequent cells start clean
        try: plt.close("all")
        except Exception: pass
        try: Gcf.destroy_all()
        except Exception: pass
        try: Gcf.figs.clear()
        except Exception: pass

    return plots

sys.stdout.write("---JUPY_KERNEL_READY---\n")
sys.stdout.flush()

while True:
    line = sys.stdin.readline()
    if not line:
        break
    try:
        data = json.loads(line)
        action = data.get("action")
        
        if action == "execute":
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


class KernelManager:
    """Persistent Python Kernel Manager that retains state across cell executions."""
    def __init__(self):
        self.exec_count = 0
        self.proc = None
        self.lock = threading.Lock()
        self._ensure_kernel_proc()

    def _ensure_kernel_proc(self):
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

    def restart(self):
        """Restarts kernel process, wiping namespace state."""
        with self.lock:
            if self.proc and self.proc.poll() is None:
                try: self.proc.terminate()
                except Exception: pass
            self.proc = None
            self.exec_count = 0
            self._ensure_kernel_proc()

    def interrupt(self):
        """Interrupts executing process and restarts kernel worker."""
        with self.lock:
            if self.proc and self.proc.poll() is None:
                try: self.proc.terminate()
                except Exception: pass
            self.proc = None
            self._ensure_kernel_proc()
        return True

    def handle_stdin_reply(self, value):
        """Sends typed input into kernel stdin stream."""
        if self.proc and self.proc.poll() is None and self.proc.stdin:
            try:
                self.proc.stdin.write(f"{value}\n")
                self.proc.stdin.flush()
            except Exception:
                pass

    def execute(self, code, ws_send_fn):
        with self.lock:
            self.exec_count += 1
            self._ensure_kernel_proc()

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

            # Handle local pip installations
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
                self.proc.stdin.write(req)
                self.proc.stdin.flush()
            except Exception as e:
                ws_send_fn({"type": "stderr", "text": f"Kernel communication error: {str(e)}\n"})
                ws_send_fn({"type": "complete", "exec_count": self.exec_count})
                return

            stderr_collecting = False
            plots_collecting = False
            plot_lines = []

            while self.proc and self.proc.poll() is None:
                line = self.proc.stdout.readline()
                if not line:
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