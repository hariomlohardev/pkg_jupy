import ast
import base64
import builtins
import io
import json
import queue
import re
import subprocess
import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout


class KernelManager:
    """Manages persistent kernel state and interactive cell execution."""
    def __init__(self):
        self.exec_count = 0
        self.namespace = {"__name__": "__main__"}
        self.stdin_queue = queue.Queue()

    def interrupt(self):
        """Interrupts cell execution or unblocks pending input requests."""
        if not self.stdin_queue.empty():
            try:
                self.stdin_queue.get_nowait()
            except queue.Empty:
                pass
        self.stdin_queue.put(None)  # Interrupt signal
        return True

    def handle_stdin_reply(self, value):
        """Receives user input from frontend and passes it to waiting input()."""
        self.stdin_queue.put(value)

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

        # Execute pip install commands
        for cmd in pip_cmds:
            ws_send_fn({"type": "stdout", "text": f"Installing {cmd} in .jupy_env...\n"})
            p = subprocess.run([sys.executable, "-m", "pip", "install"] + cmd.split(), capture_output=True, text=True)
            if p.stdout: ws_send_fn({"type": "stdout", "text": p.stdout})
            if p.stderr: ws_send_fn({"type": "stderr", "text": p.stderr})

        clean_code = "\n".join(py_lines)
        if not clean_code.strip():
            ws_send_fn({"type": "complete", "exec_count": self.exec_count})
            return

        # Clear any leftover stdin responses
        while not self.stdin_queue.empty():
            try: self.stdin_queue.get_nowait()
            except queue.Empty: pass

        # Custom builtins.input hook
        def custom_input(prompt=""):
            ws_send_fn({"type": "stdin_request", "prompt": str(prompt)})
            reply = self.stdin_queue.get()
            if reply is None:
                raise KeyboardInterrupt("Cell execution interrupted by user.")
            return reply

        orig_input = builtins.input
        builtins.input = custom_input

        out, err = io.StringIO(), io.StringIO()
        result_repr = None
        plots = []

        try:
            with redirect_stdout(out), redirect_stderr(err):
                if "matplotlib" in sys.modules:
                    import matplotlib
                    try: matplotlib.use("Agg", force=True)
                    except Exception: pass

                tree = ast.parse(clean_code, mode="exec")
                if tree.body and isinstance(tree.body[-1], ast.Expr):
                    last = tree.body.pop()
                    if tree.body:
                        exec(compile(tree, "<cell>", "exec"), self.namespace)
                    expr = ast.Expression(last.value)
                    ast.copy_location(expr, last.value)
                    val = eval(compile(expr, "<cell>", "eval"), self.namespace)
                    if val is not None:
                        result_repr = repr(val)
                else:
                    exec(compile(clean_code, "<cell>", "exec"), self.namespace)

                # Capture Matplotlib Figures
                if "matplotlib.pyplot" in sys.modules:
                    import matplotlib.pyplot as plt
                    for i in plt.get_fignums():
                        try:
                            fig = plt.figure(i)
                            buf = io.BytesIO()
                            fig.savefig(buf, format="png", bbox_inches="tight", dpi=110)
                            buf.seek(0)
                            b64 = base64.b64encode(buf.read()).decode("ascii")
                            plots.append(f'<img class="notebook-plot" src="data:image/png;base64,{b64}" alt="Plot" />')
                        except Exception: pass
                    try: plt.close("all")
                    except Exception: pass

        except KeyboardInterrupt:
            ws_send_fn({"type": "stderr", "text": "\n⏹ KeyboardInterrupt: Execution interrupted by user.\n"})
        except SyntaxError as e:
            err_tb = "".join(traceback.format_exception_only(type(e), e))
            ws_send_fn({"type": "stderr", "text": err_tb})
        except Exception as e:
            tb = e.__traceback__.tb_next if e.__traceback__ else None
            err_tb = "".join(traceback.format_exception(type(e), e, tb))
            ws_send_fn({"type": "stderr", "text": err_tb})
        finally:
            builtins.input = orig_input

        if out.getvalue(): ws_send_fn({"type": "stdout", "text": out.getvalue()})
        if err.getvalue(): ws_send_fn({"type": "stderr", "text": err.getvalue()})
        if result_repr: ws_send_fn({"type": "stdout", "text": result_repr})
        for p in plots: ws_send_fn({"type": "plot", "html": p})

        ws_send_fn({"type": "complete", "exec_count": self.exec_count})


kernel = KernelManager()