"""
jupy/core/kernel/manager.py
KernelManager class with startup timeout, parallel execution, and per-cell timeout.
"""
import json
import os
import subprocess
import sys
import threading
import queue
import tempfile
import atexit
import signal
import re
from jupy.core import envmanager
from .worker_script import KERNEL_WORKER_SCRIPT

def _kill_process_tree(proc):
    if proc and proc.poll() is None:
        try:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
            else:
                proc.kill()
        except Exception:
            try: proc.kill()
            except: pass

def _reap_and_close(proc):
    if proc is None: return
    try: proc.wait(timeout=5)
    except: pass
    for s in (proc.stdin, proc.stdout, proc.stderr):
        if s is not None:
            try: s.close()
            except: pass

class KernelManager:
    def __init__(self):
        self.exec_count = 0
        self.proc = None
        self.lock = threading.Lock()
        self.comm_lock = threading.Lock()
        self.worker_script_path = None
        self.env_info = envmanager.resolve_active_env(
            on_progress=lambda m: print(m, flush=True)
        )
        self.python = self.env_info["python"]
        self.default_timeout = 60
        self._debugger_ws = None
        self._ensure_kernel_proc()
        atexit.register(self._cleanup_worker_script)

    def _cleanup_worker_script(self):
        if self.worker_script_path and os.path.exists(self.worker_script_path):
            try:
                os.unlink(self.worker_script_path)
            except Exception:
                pass

    def _ensure_kernel_proc(self):
        print("[Kernel] _ensure_kernel_proc entered", flush=True)
        with self.lock:
            print("[Kernel] Acquired lock", flush=True)
            if self.proc is None or self.proc.poll() is not None:
                print("[Kernel] Creating new kernel subprocess...", flush=True)
                self._cleanup_worker_script()

                print("[Kernel] Writing worker script to temp file...", flush=True)
                fd, script_path = tempfile.mkstemp(suffix='.py', text=True)
                self.worker_script_path = script_path
                print(f"[Kernel] Temp file: {script_path}", flush=True)
                try:
                    with os.fdopen(fd, 'w', encoding='utf-8') as f:
                        f.write(KERNEL_WORKER_SCRIPT)
                    print("[Kernel] Worker script written successfully.", flush=True)
                except Exception as e:
                    os.close(fd)
                    print(f"[Kernel] Failed to write worker script: {e}", flush=True)
                    raise RuntimeError(f"Failed to write worker script: {e}")

                env = os.environ.copy()
                env["PYTHONUNBUFFERED"] = "1"

                print("[Kernel] Launching subprocess using script file...", flush=True)
                try:
                    proc = subprocess.Popen(
                        [self.python, script_path],
                        stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        encoding='utf-8',
                        bufsize=1,
                        env=env
                    )
                    print(f"[Kernel] Subprocess PID: {proc.pid}", flush=True)
                except Exception as e:
                    print(f"[Kernel] Failed to launch subprocess: {e}", flush=True)
                    self._cleanup_worker_script()
                    raise RuntimeError(f"Couldn't launch Python: {e}") from e

                # Start a thread to read stderr and log it
                def read_stderr():
                    for line in proc.stderr:
                        print(f"[Kernel stderr] {line.rstrip()}", flush=True)
                stderr_thread = threading.Thread(target=read_stderr, daemon=True)
                stderr_thread.start()

                # ---- Timeout handshake ----
                q = queue.Queue()
                def reader():
                    line = proc.stdout.readline()
                    print(f"[Kernel] Reader got line: {repr(line)}", flush=True)
                    q.put(line)
                t = threading.Thread(target=reader, daemon=True)
                t.start()

                try:
                    print("[Kernel] Waiting for kernel ready message (timeout 20s)...", flush=True)
                    line = q.get(timeout=20)
                    print(f"[Kernel] Received: {repr(line)}", flush=True)
                except queue.Empty:
                    print("[Kernel] Timeout waiting for kernel ready message.", flush=True)
                    _kill_process_tree(proc)
                    self._cleanup_worker_script()
                    raise RuntimeError("Kernel didn't respond within 20s on startup.")

                ready = "---JUPY_KERNEL_READY---" in line
                if not ready:
                    print(f"[Kernel] Unexpected response: {repr(line)}", flush=True)
                    try:
                        stderr_output = proc.stderr.read()
                    except:
                        stderr_output = ""
                    try:
                        proc.wait(timeout=2)
                    except:
                        pass
                    detail = stderr_output.strip() or "exited immediately"
                    print(f"[Kernel] Kernel startup failed: {detail}", flush=True)
                    self._cleanup_worker_script()
                    raise RuntimeError(f"Couldn't start kernel: {detail}")

                print("[Kernel] Kernel ready.", flush=True)
                self.proc = proc
            else:
                print("[Kernel] Existing kernel process is still running.", flush=True)

    def get_completions(self, code, line, col):
        if not self.comm_lock.acquire(blocking=False):
            return []
        try:
            proc = self.proc
            if proc is None or proc.poll() is not None:
                return []
            req = json.dumps({"action": "complete", "code": code, "line": line, "column": col}) + "\n"
            try: proc.stdin.write(req); proc.stdin.flush()
            except: return []
            while proc and proc.poll() is None:
                line_str = proc.stdout.readline()
                if not line_str:
                    break
                if line_str.startswith("---JUPY_COMPS:"):
                    json_str = line_str.replace("---JUPY_COMPS:", "").strip()
                    if json_str.endswith("---"): json_str = json_str[:-3]
                    try: return json.loads(json_str)
                    except: return []
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
            try: proc.stdin.write(req); proc.stdin.flush()
            except: return None
            while proc and proc.poll() is None:
                line_str = proc.stdout.readline()
                if not line_str:
                    break
                if line_str.startswith("---JUPY_HOVER:"):
                    json_str = line_str.replace("---JUPY_HOVER:", "").strip()
                    if json_str.endswith("---"): json_str = json_str[:-3]
                    try: return json.loads(json_str) if json_str and json_str != "null" else None
                    except: return None
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
        self._cleanup_worker_script()
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
            except: pass

    # ---- Execute with magic support ----
    def execute(self, code, ws_send_fn, timeout=None, language='python'):
        if timeout is None:
            timeout = self.default_timeout

        self.exec_count += 1
        exec_count = self.exec_count

        if language != 'python':
            self._execute_other_language(code, ws_send_fn, language, timeout, exec_count)
            return

        # ---- Handle magics ----
        lines = code.splitlines()
        remaining_code = code

        # Cell magic %%
        if lines and lines[0].strip().startswith('%%'):
            magic_line = lines[0]
            cell_body = '\n'.join(lines[1:])
            parts = magic_line[2:].strip().split()
            magic_name = parts[0] if parts else ''
            args = parts[1:]
            magic_str = '%' + magic_name + ' ' + ' '.join(args)
            result = self._run_magic(magic_str, cell_body)
            if result:
                ws_send_fn({"type": "stdout", "text": result + "\n"})
            ws_send_fn({"type": "complete", "exec_count": exec_count})
            return

        # Line magic %
        non_empty_lines = [l for l in lines if l.strip()]
        if non_empty_lines and non_empty_lines[0].strip().startswith('%'):
            magic_line = non_empty_lines[0].strip()
            first_non_empty_idx = next(i for i, l in enumerate(lines) if l.strip())
            result = self._run_magic(magic_line, None)
            if result:
                ws_send_fn({"type": "stdout", "text": result + "\n"})
            remaining_lines = lines[first_non_empty_idx+1:]
            remaining_code = '\n'.join(remaining_lines)
            if not remaining_code.strip():
                ws_send_fn({"type": "complete", "exec_count": exec_count})
                return

        # ---- Execute remaining code (if any) ----
        if remaining_code.strip():
            self._execute_python(remaining_code, ws_send_fn, timeout, exec_count)
        else:
            ws_send_fn({"type": "complete", "exec_count": exec_count})

    def _run_magic(self, magic_line, cell_body):
        """
        Execute a magic command by writing a temporary Python file.
        This avoids command-line length limits on Windows.
        """
        worker_code = KERNEL_WORKER_SCRIPT

        if cell_body is not None:
            runner = f"""
import sys, io, json, re

# Embed the worker script to define all magics
{worker_code}

# Now run the magic
magic_line = {repr(magic_line)}
cell_body = {repr(cell_body)}
namespace = {{"__name__": "__main__"}}
out = io.StringIO()
err = io.StringIO()
try:
    sys.stdout = out
    sys.stderr = err
    result = _run_magic(magic_line, cell_body, namespace)
finally:
    sys.stdout = sys.__stdout__
    sys.stderr = sys.__stderr__
print("---JUPY_MAGIC_RESULT---")
if result:
    print(result)
if out.getvalue():
    print(out.getvalue(), end='')
if err.getvalue():
    print(err.getvalue(), end='', file=sys.stderr)
"""
        else:
            runner = f"""
import sys, io, json, re

{worker_code}

magic_line = {repr(magic_line)}
namespace = {{"__name__": "__main__"}}
out = io.StringIO()
err = io.StringIO()
try:
    sys.stdout = out
    sys.stderr = err
    result = _run_magic(magic_line, None, namespace)
finally:
    sys.stdout = sys.__stdout__
    sys.stderr = sys.__stderr__
print("---JUPY_MAGIC_RESULT---")
if result:
    print(result)
if out.getvalue():
    print(out.getvalue(), end='')
if err.getvalue():
    print(err.getvalue(), end='', file=sys.stderr)
"""
        # Write runner to a temporary file
        fd, temp_path = tempfile.mkstemp(suffix='.py', text=True)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(runner)
            
            # Execute the temp file
            proc = subprocess.run(
                [self.python, temp_path],
                capture_output=True,
                text=True,
                timeout=15,
                env=os.environ.copy()
            )
            output = ""
            if proc.stdout:
                if "---JUPY_MAGIC_RESULT---" in proc.stdout:
                    parts = proc.stdout.split("---JUPY_MAGIC_RESULT---", 1)
                    if len(parts) > 1:
                        output = parts[1].strip()
                else:
                    output = proc.stdout.strip()
            if proc.stderr:
                output += "\n" + proc.stderr.strip()
            return output if output else None
        except subprocess.TimeoutExpired:
            return "Magic timed out after 15 seconds."
        except Exception as e:
            return f"Error running magic: {e}"
        finally:
            try:
                os.unlink(temp_path)
            except:
                pass

    def _execute_python(self, code, ws_send_fn, timeout, exec_count):
        runner_script = f"""
import sys, io, ast, base64, json, traceback, gc
from contextlib import redirect_stdout, redirect_stderr

out, err = io.StringIO(), io.StringIO()
result_repr, error_tb = None, None
plots = []

def capture_plots():
    plot_htmls = []
    if "matplotlib.pyplot" in sys.modules:
        import matplotlib.pyplot as plt
        for i in plt.get_fignums():
            try:
                fig = plt.figure(i)
                buf = io.BytesIO()
                fig.savefig(buf, format="png", bbox_inches="tight", dpi=110)
                buf.seek(0)
                b64 = base64.b64encode(buf.read()).decode("ascii")
                plot_htmls.append(f'<img class="notebook-plot" src="data:image/png;base64,{{b64}}" alt="Plot" />')
            except Exception: pass
        try: plt.close("all")
        except Exception: pass
    return plot_htmls

try:
    with redirect_stdout(out), redirect_stderr(err):
        if "matplotlib" in sys.modules:
            import matplotlib
            try: matplotlib.use("Agg", force=True)
            except Exception: pass

        tree = ast.parse({repr(code)}, mode="exec")
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = tree.body.pop()
            if tree.body:
                exec(compile(tree, "<cell>", "exec"), globals())
            expr = ast.Expression(last.value)
            ast.copy_location(expr, last.value)
            value = eval(compile(expr, "<cell>", "eval"), globals())
            if value is not None:
                result_repr = repr(value)
        else:
            exec(compile({repr(code)}, "<cell>", "exec"), globals())
        plots = capture_plots()
except Exception as e:
    error_tb = "".join(traceback.format_exception(type(e), e, e.__traceback__))
print("---JUPY_JSON_START---")
print(json.dumps({{
    "stdout": out.getvalue(),
    "stderr": err.getvalue(),
    "result": result_repr,
    "error": error_tb,
    "plots": plots
}}))
"""
        proc = subprocess.Popen(
            [self.python, "-c", runner_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        timer = threading.Timer(timeout, lambda: proc.kill() if proc.poll() is None else None)
        timer.start()
        stdout, stderr = proc.communicate()
        timer.cancel()

        if proc.returncode != 0 and not stdout:
            ws_send_fn({"type": "stderr", "text": f"\n⏹ Execution timed out after {timeout}s\n"})
        else:
            if "---JUPY_JSON_START---" in stdout:
                parts = stdout.split("---JUPY_JSON_START---")
                pre = parts[0]
                if pre: ws_send_fn({"type": "stdout", "text": pre})
                try:
                    res = json.loads(parts[1].strip())
                    if res.get("stdout"): ws_send_fn({"type": "stdout", "text": res["stdout"]})
                    if res.get("stderr"): ws_send_fn({"type": "stderr", "text": res["stderr"]})
                    if res.get("result"): ws_send_fn({"type": "stdout", "text": res["result"]})
                    if res.get("error"): ws_send_fn({"type": "stderr", "text": res["error"]})
                    if res.get("plots"):
                        for p in res["plots"]: ws_send_fn({"type": "plot", "html": p})
                except Exception:
                    pass
        ws_send_fn({"type": "complete", "exec_count": exec_count})

    def _execute_other_language(self, code, ws_send_fn, language, timeout, exec_count):
        if language == 'r':
            interpreter = 'Rscript'
            file_ext = '.R'
        elif language == 'julia':
            interpreter = 'julia'
            file_ext = '.jl'
        else:
            ws_send_fn({"type": "stderr", "text": f"Unsupported language: {language}"})
            ws_send_fn({"type": "complete", "exec_count": exec_count})
            return

        with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False, mode='w') as f:
            f.write(code)
            temp_file = f.name

        try:
            proc = subprocess.Popen(
                [interpreter, temp_file],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )
            timer = threading.Timer(timeout, lambda: proc.kill() if proc.poll() is None else None)
            timer.start()
            stdout, stderr = proc.communicate()
            timer.cancel()

            if stdout:
                ws_send_fn({"type": "stdout", "text": stdout})
            if stderr:
                ws_send_fn({"type": "stderr", "text": stderr})
        except Exception as e:
            ws_send_fn({"type": "stderr", "text": f"Error executing {language}: {str(e)}"})
        finally:
            try:
                os.unlink(temp_file)
            except:
                pass
            ws_send_fn({"type": "complete", "exec_count": exec_count})

    # ---- Variable Explorer ----
    def get_variables(self):
        with self.comm_lock:
            try:
                self._ensure_kernel_proc()
                proc = self.proc
                if proc is None or proc.poll() is not None:
                    return []
                req = json.dumps({"action": "list_vars"}) + "\n"
                proc.stdin.write(req)
                proc.stdin.flush()
                while proc and proc.poll() is None:
                    line = proc.stdout.readline()
                    if not line:
                        break
                    if line.startswith("---JUPY_VARS:"):
                        json_str = line.replace("---JUPY_VARS:", "").strip()
                        if json_str.endswith("---"):
                            json_str = json_str[:-3]
                        try:
                            return json.loads(json_str)
                        except:
                            return []
                return []
            except Exception:
                return []

    # ---- DataFrame Preview ----
    def get_dataframe_preview(self, var_name, rows=10):
        with self.comm_lock:
            try:
                self._ensure_kernel_proc()
                proc = self.proc
                if proc is None or proc.poll() is not None:
                    return "<p>Kernel not running</p>"
                req = json.dumps({"action": "df_preview", "var": var_name, "rows": rows}) + "\n"
                proc.stdin.write(req)
                proc.stdin.flush()
                while proc and proc.poll() is None:
                    line = proc.stdout.readline()
                    if not line:
                        break
                    if line.startswith("---JUPY_DF_HTML:"):
                        html = line.replace("---JUPY_DF_HTML:", "").strip()
                        if html.endswith("---"):
                            html = html[:-3]
                        return html
                return "<p>No DataFrame found</p>"
            except Exception:
                return "<p>Error fetching DataFrame</p>"

    # ---- Debugger ----
    def set_breakpoints(self, breakpoints):
        with self.comm_lock:
            try:
                self._ensure_kernel_proc()
                proc = self.proc
                if proc is None or proc.poll() is not None:
                    return
                req = json.dumps({"action": "set_breakpoints", "breakpoints": breakpoints}) + "\n"
                proc.stdin.write(req)
                proc.stdin.flush()
                while proc and proc.poll() is None:
                    line = proc.stdout.readline()
                    if not line:
                        break
                    if "---JUPY_BREAKPOINTS_SET---" in line:
                        break
            except Exception:
                pass

    def set_debugger_ws(self, ws_send):
        self._debugger_ws = ws_send

    def debugger_step(self, mode):
        self._send_debugger_command("step", mode)

    def debugger_continue(self):
        self._send_debugger_command("continue")

    def debugger_stop(self):
        self._send_debugger_command("stop")

    def _send_debugger_command(self, cmd, arg=None):
        with self.comm_lock:
            try:
                proc = self.proc
                if proc is None or proc.poll() is not None:
                    return
                data = {"action": "debugger", "cmd": cmd}
                if arg:
                    data["arg"] = arg
                req = json.dumps(data) + "\n"
                proc.stdin.write(req)
                proc.stdin.flush()
                while proc and proc.poll() is None:
                    line = proc.stdout.readline()
                    if not line:
                        break
                    if "---JUPY_DEBUGGER_ACK---" in line:
                        break
            except Exception:
                pass