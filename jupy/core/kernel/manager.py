"""
jupy/core/kernel/manager.py
KernelManager class with startup timeout and debug logging.
"""
import json
import os
import subprocess
import sys
import threading
import queue
import tempfile
import atexit
from jupy.core import envmanager

# The worker script is defined in worker_script.py
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
        print("[Kernel] KernelManager.__init__ started", flush=True)
        self.exec_count = 0
        self.proc = None
        self.lock = threading.Lock()
        self.comm_lock = threading.Lock()
        self.worker_script_path = None
        print("[Kernel] Resolving active environment...", flush=True)
        self.env_info = envmanager.resolve_active_env(
            on_progress=lambda m: print(m, flush=True)
        )
        self.python = self.env_info["python"]
        print(f"[Kernel] Python interpreter: {self.python}", flush=True)
        print("[Kernel] Calling _ensure_kernel_proc...", flush=True)
        self._ensure_kernel_proc()
        print("[Kernel] _ensure_kernel_proc completed.", flush=True)
        atexit.register(self._cleanup_worker_script)

    def _cleanup_worker_script(self):
        if self.worker_script_path and os.path.exists(self.worker_script_path):
            try:
                os.unlink(self.worker_script_path)
                print(f"[Kernel] Cleaned up temp script: {self.worker_script_path}", flush=True)
            except Exception as e:
                print(f"[Kernel] Failed to clean up temp script: {e}", flush=True)

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
                        encoding='utf-8',   # Force UTF-8 to handle Unicode/emoji
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

    def execute(self, code, ws_send_fn):
        self.exec_count += 1
        print(f"[Kernel] execute called with code length: {len(code)}", flush=True)
        lines = code.splitlines()
        pip_cmds, py_lines = [], []
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
            if p.stdout: ws_send_fn({"type": "stdout", "text": p.stdout})
            if p.stderr: ws_send_fn({"type": "stderr", "text": p.stderr})
        clean_code = "\n".join(py_lines)
        if not clean_code.strip():
            ws_send_fn({"type": "complete", "exec_count": self.exec_count})
            return
        req = json.dumps({"action": "execute", "code": clean_code}) + "\n"
        print(f"[Kernel] Sending execute request: {clean_code[:50]}...", flush=True)
        with self.comm_lock:
            try:
                self._ensure_kernel_proc()
                current_proc = self.proc
            except Exception as e:
                print(f"[Kernel] Failed to ensure kernel: {e}", flush=True)
                ws_send_fn({"type": "stderr", "text": f"{e}\n"})
                ws_send_fn({"type": "complete", "exec_count": self.exec_count})
                return
            try:
                current_proc.stdin.write(req)
                current_proc.stdin.flush()
                print("[Kernel] Execute request sent.", flush=True)
            except Exception as e:
                print(f"[Kernel] Error sending request: {e}", flush=True)
                self.proc = None
                try:
                    self._ensure_kernel_proc()
                    current_proc = self.proc
                    current_proc.stdin.write(req)
                    current_proc.stdin.flush()
                    print("[Kernel] Retry execute request sent.", flush=True)
                except Exception as e2:
                    print(f"[Kernel] Retry failed: {e2}", flush=True)
                    ws_send_fn({"type": "stderr", "text": f"Kernel communication error: {str(e2)}\n"})
                    ws_send_fn({"type": "complete", "exec_count": self.exec_count})
                    return
            collecting = None
            plot_lines = []
            print("[Kernel] Reading output...", flush=True)
            while current_proc:
                try:
                    line = current_proc.stdout.readline()
                except:
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
                    except: pass
                    continue
                if "---JUPY_WIDGET---" in line:
                    json_line = current_proc.stdout.readline()
                    try:
                        widget_msg = json.loads(json_line)
                        ws_send_fn({"type": "widget", "data": widget_msg})
                    except: pass
                    continue
                if "---JUPY_LOAD_CELL---" in line:
                    json_line = current_proc.stdout.readline()
                    try:
                        load_data = json.loads(json_line)
                        ws_send_fn({"type": "load", "data": load_data})
                    except: pass
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
            print("[Kernel] Finished reading output.", flush=True)
        ws_send_fn({"type": "complete", "exec_count": self.exec_count})
        print("[Kernel] Complete signal sent.", flush=True)