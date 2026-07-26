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
        with self.lock:
            if self.proc is None or self.proc.poll() is not None:
                self._cleanup_worker_script()
                fd, script_path = tempfile.mkstemp(suffix='.py', text=True)
                self.worker_script_path = script_path
                try:
                    with os.fdopen(fd, 'w', encoding='utf-8') as f:
                        f.write(KERNEL_WORKER_SCRIPT)
                except Exception as e:
                    os.close(fd)
                    raise RuntimeError(f"Failed to write worker script: {e}")
                env = os.environ.copy()
                env["PYTHONUNBUFFERED"] = "1"
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
                except Exception as e:
                    self._cleanup_worker_script()
                    raise RuntimeError(f"Couldn't launch Python: {e}") from e
                def read_stderr():
                    for line in proc.stderr:
                        print(f"[Kernel stderr] {line.rstrip()}", flush=True)
                stderr_thread = threading.Thread(target=read_stderr, daemon=True)
                stderr_thread.start()
                q = queue.Queue()
                def reader():
                    line = proc.stdout.readline()
                    q.put(line)
                t = threading.Thread(target=reader, daemon=True)
                t.start()
                try:
                    line = q.get(timeout=20)
                except queue.Empty:
                    _kill_process_tree(proc)
                    self._cleanup_worker_script()
                    raise RuntimeError("Kernel didn't respond within 20s on startup.")
                ready = "---JUPY_KERNEL_READY---" in line
                if not ready:
                    try:
                        stderr_output = proc.stderr.read()
                    except:
                        stderr_output = ""
                    try:
                        proc.wait(timeout=2)
                    except:
                        pass
                    detail = stderr_output.strip() or "exited immediately"
                    self._cleanup_worker_script()
                    raise RuntimeError(f"Couldn't start kernel: {detail}")
                self.proc = proc

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
            if proc is None or proc.poll() is None:
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
        with self.comm_lock:
            if self.proc and self.proc.poll() is None:
                try:
                    self.proc.stdin.write('{"action":"interrupt"}\n')
                    self.proc.stdin.flush()
                except:
                    pass
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

    def send_to_worker(self, data):
        with self.comm_lock:
            if self.proc and self.proc.poll() is None:
                try:
                    self.proc.stdin.write(json.dumps(data) + "\n")
                    self.proc.stdin.flush()
                except:
                    pass

    def handle_stdin_reply(self, value):
        self.send_to_worker({"action": "stdin_reply", "value": value})

    def execute(self, code, ws_send_fn, timeout=None, language='python'):
        if language != 'python':
            self.exec_count += 1
            # FIX #2: Pass exec_count
            self._execute_other_language(code, ws_send_fn, language, timeout, self.exec_count)
            return
            
        self.exec_count += 1
        exec_count = self.exec_count
        
        with self.comm_lock:
            proc = self.proc
            if proc is None or proc.poll() is not None:
                ws_send_fn({"type": "stderr", "text": "Kernel not running. Restart required."})
                ws_send_fn({"type": "complete", "exec_count": exec_count})
                return
                
            try:
                proc.stdin.write(json.dumps({"action": "execute", "code": code}) + "\n")
                proc.stdin.flush()
            except Exception as e:
                ws_send_fn({"type": "stderr", "text": f"Failed to send code: {e}"})
                ws_send_fn({"type": "complete", "exec_count": exec_count})
                return
                
            completed_normally = False
            while proc.poll() is None:
                line = proc.stdout.readline()
                if not line:
                    break
                line = line.rstrip('\n')
                if line.startswith("---JUPY_STDOUT---"):
                    continue
                elif line.startswith("---JUPY_STDERR---"):
                    continue
                elif line.startswith("---JUPY_DISPLAY_DATA---"):
                    data_line = proc.stdout.readline().strip()
                    try:
                        mime = json.loads(data_line)
                        ws_send_fn({"type": "display", "data": mime})
                    except:
                        pass
                elif line.startswith("---JUPY_WIDGET---"):
                    widget_line = proc.stdout.readline().strip()
                    try:
                        widget_msg = json.loads(widget_line)
                        ws_send_fn({"type": "widget", "data": widget_msg})
                    except:
                        pass
                elif line.startswith("---JUPY_STDIN_REQ:"):
                    prompt = line.split("---JUPY_STDIN_REQ:")[1].split("---")[0]
                    ws_send_fn({"type": "stdin_request", "prompt": prompt})
                elif line.startswith("---JUPY_LOAD_CELL---"):
                    load_line = proc.stdout.readline().strip()
                    try:
                        content = json.loads(load_line)["content"]
                        ws_send_fn({"type": "load", "data": {"content": content}})
                    except:
                        pass
                elif "---JUPY_CELL_COMPLETE---" in line:
                    ws_send_fn({"type": "complete", "exec_count": exec_count})
                    completed_normally = True
                    return
                else:
                    if line.strip():
                        ws_send_fn({"type": "stdout", "text": line + "\n"})
            
            # FIX #3: Ensure complete message is sent if interrupted
            if not completed_normally:
                ws_send_fn({"type": "stderr", "text": "\n⏹ Execution interrupted by user.\n"})
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