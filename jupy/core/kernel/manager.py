# manager.py
import json
import os
import subprocess
import sys
import threading
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
            try:
                proc.kill()
            except Exception:
                pass

def _reap_and_close(proc):
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
    """Persistent Python Kernel Manager with magics, widgets, and rich display."""

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

            collecting = None
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
                    json_line = current_proc.stdout.readline()
                    try:
                        mime_data = json.loads(json_line)
                        ws_send_fn({"type": "display", "data": mime_data})
                    except Exception:
                        pass
                    continue
                if "---JUPY_WIDGET---" in line:
                    json_line = current_proc.stdout.readline()
                    try:
                        widget_msg = json.loads(json_line)
                        ws_send_fn({"type": "widget", "data": widget_msg})
                    except Exception:
                        pass
                    continue
                if "---JUPY_LOAD_CELL---" in line:
                    json_line = current_proc.stdout.readline()
                    try:
                        load_data = json.loads(json_line)
                        ws_send_fn({"type": "load", "data": load_data})
                    except Exception:
                        pass
                    continue

                if collecting == 'stdout':
                    if line.strip():
                        ws_send_fn({"type": "stdout", "text": line})
                elif collecting == 'stderr':
                    if line.strip():
                        ws_send_fn({"type": "stderr", "text": line})
                elif collecting == 'plots':
                    plot_lines.append(line.strip())
                else:
                    if line.strip():
                        ws_send_fn({"type": "stdout", "text": line})

        ws_send_fn({"type": "complete", "exec_count": self.exec_count})