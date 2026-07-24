import json
import re
import subprocess
import sys
import threading
import time
from jupy.core.venv import VENV_PYTHON


class KernelManager:
    """Executes Python code cells inside an isolated .jupy_env process with real-time output streaming."""
    def __init__(self):
        self.current_proc = None
        self.exec_count = 0

    def interrupt(self):
        proc = self.current_proc
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                time.sleep(0.1)
                if proc.poll() is None:
                    proc.kill()
            except Exception:
                pass
            return True
        return False

    def execute(self, code, ws_send_fn):
        self.exec_count += 1

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

        # Execute pip installations
        for cmd in pip_cmds:
            ws_send_fn({"type": "stdout", "text": f"Installing {cmd} in .jupy_env...\n"})
            p = subprocess.run([VENV_PYTHON, "-m", "pip", "install"] + cmd.split(), capture_output=True, text=True)
            if p.stdout: ws_send_fn({"type": "stdout", "text": p.stdout})
            if p.stderr: ws_send_fn({"type": "stderr", "text": p.stderr})

        clean_code = "\n".join(py_lines)
        if not clean_code.strip():
            ws_send_fn({"type": "complete", "exec_count": self.exec_count})
            return

        runner_code = f"""
import sys, io, ast, base64, json, traceback

def _capture_plots():
    plots = []
    if "matplotlib.pyplot" in sys.modules:
        import matplotlib.pyplot as plt
        for i in plt.get_fignums():
            try:
                fig = plt.figure(i)
                buf = io.BytesIO()
                fig.savefig(buf, format="png", bbox_inches="tight", dpi=110)
                buf.seek(0)
                b64 = base64.b64encode(buf.read()).decode("ascii")
                plots.append(f'<img class="notebook-plot" src="data:image/png;base64,{{b64}}" alt="Plot" />')
            except Exception: pass
        try: plt.close("all")
        except Exception: pass
    return plots

try:
    if "matplotlib" in sys.modules:
        import matplotlib
        try: matplotlib.use("Agg", force=True)
        except Exception: pass

    tree = ast.parse({repr(clean_code)}, mode="exec")
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        last = tree.body.pop()
        if tree.body:
            exec(compile(tree, "<cell>", "exec"), globals())
        expr = ast.Expression(last.value)
        ast.copy_location(expr, last.value)
        val = eval(compile(expr, "<cell>", "eval"), globals())
        if val is not None:
            print(repr(val))
    else:
        exec(compile({repr(clean_code)}, "<cell>", "exec"), globals())

    plots = _capture_plots()
    if plots:
        print("---JUPY_PLOTS_START---")
        for p in plots:
            print(p)
        print("---JUPY_PLOTS_END---")

except SyntaxError as e:
    print("".join(traceback.format_exception_only(type(e), e)), file=sys.stderr)
except Exception as e:
    tb = e.__traceback__.tb_next if e.__traceback__ else None
    print("".join(traceback.format_exception(type(e), e, tb)), file=sys.stderr)
"""

        proc = subprocess.Popen(
            [VENV_PYTHON, "-u", "-c", runner_code],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        self.current_proc = proc

        plots_collecting = False
        plot_lines = []

        def read_stdout():
            nonlocal plots_collecting, plot_lines
            for line in proc.stdout:
                if "---JUPY_PLOTS_START---" in line:
                    plots_collecting = True
                    continue
                if "---JUPY_PLOTS_END---" in line:
                    plots_collecting = False
                    for p in plot_lines:
                        ws_send_fn({"type": "plot", "html": p})
                    continue

                if plots_collecting:
                    plot_lines.append(line.strip())
                else:
                    ws_send_fn({"type": "stdout", "text": line})

        def read_stderr():
            for line in proc.stderr:
                ws_send_fn({"type": "stderr", "text": line})

        t1 = threading.Thread(target=read_stdout, daemon=True)
        t2 = threading.Thread(target=read_stderr, daemon=True)
        t1.start()
        t2.start()

        proc.wait()
        t1.join()
        t2.join()

        self.current_proc = None
        ws_send_fn({"type": "complete", "exec_count": self.exec_count})


kernel = KernelManager()