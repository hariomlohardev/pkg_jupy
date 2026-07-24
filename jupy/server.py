import ast
import base64
import hashlib
import io
import json
import os
import queue
import re
import socketserver
import struct
import subprocess
import sys
import threading
import time
import traceback
import venv
from http.server import SimpleHTTPRequestHandler

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
VENV_DIR = os.path.abspath(".jupy_env")

def ensure_virtualenv():
    """Ensure isolated .jupy_env virtual environment exists."""
    if not os.path.exists(VENV_DIR):
        print(f"[Jupy] Creating isolated virtual environment at {VENV_DIR}...")
        venv.create(VENV_DIR, with_pip=True)
        print("[Jupy] Virtual environment ready.")

    if sys.platform == "win32":
        venv_python = os.path.join(VENV_DIR, "Scripts", "python.exe")
        venv_bin = os.path.join(VENV_DIR, "Scripts")
    else:
        venv_python = os.path.join(VENV_DIR, "bin", "python")
        venv_bin = os.path.join(VENV_DIR, "bin")

    return venv_python, venv_bin

VENV_PYTHON, VENV_BIN = ensure_virtualenv()

# WebSocket Helpers
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

def make_ws_accept(key):
    sha1 = hashlib.sha1((key + WS_GUID).encode('utf-8')).digest()
    return base64.b64encode(sha1).decode('utf-8')

def parse_ws_frame(rfile):
    try:
        head1_b = rfile.read(1)
        if not head1_b: return None, None
        head2_b = rfile.read(1)
        if not head2_b: return None, None

        head1, head2 = head1_b[0], head2_b[0]
        opcode = head1 & 0x0F
        if opcode == 0x8:  # Connection close
            return None, 0x8

        has_mask = bool(head2 & 0x80)
        length = head2 & 0x7F

        if length == 126:
            length = struct.unpack(">H", rfile.read(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", rfile.read(8))[0]

        masks = rfile.read(4) if has_mask else None
        data = bytearray(rfile.read(length))
        if has_mask:
            for i in range(len(data)):
                data[i] ^= masks[i % 4]

        return data.decode('utf-8', errors='ignore'), opcode
    except Exception:
        return None, 0x8

def make_ws_frame(message):
    data = message.encode('utf-8')
    length = len(data)
    if length <= 125:
        header = struct.pack("BB", 0x81, length)
    elif length <= 65535:
        header = struct.pack(">BBH", 0x81, 126, length)
    else:
        header = struct.pack(">BBQ", 0x81, 127, length)
    return header + data


class KernelManager:
    """Handles cell execution with real-time process interrupt support."""
    def __init__(self):
        self.current_proc = None
        self.exec_count = 0

    def interrupt(self):
        if self.current_proc and self.current_proc.poll() is None:
            try:
                self.current_proc.terminate()
                time.sleep(0.1)
                if self.current_proc.poll() is None:
                    self.current_proc.kill()
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

        # Run pip installs
        for cmd in pip_cmds:
            ws_send_fn({"type": "stdout", "text": f"Installing {cmd} in .jupy_env...\n"})
            p = subprocess.run([VENV_PYTHON, "-m", "pip", "install"] + cmd.split(), capture_output=True, text=True)
            if p.stdout: ws_send_fn({"type": "stdout", "text": p.stdout})
            if p.stderr: ws_send_fn({"type": "stderr", "text": p.stderr})

        clean_code = "\n".join(py_lines)
        if not clean_code.strip():
            ws_send_fn({"type": "complete", "exec_count": self.exec_count})
            return

        runner_script = f"""
import sys, io, ast, base64, json, traceback
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
        
        tree = ast.parse({repr(clean_code)}, mode="exec")
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
            exec(compile({repr(clean_code)}, "<cell>", "exec"), globals())
        plots = capture_plots()
except SyntaxError as e:
    error_tb = "".join(traceback.format_exception_only(type(e), e))
except Exception as e:
    tb = e.__traceback__.tb_next if e.__traceback__ else None
    error_tb = "".join(traceback.format_exception(type(e), e, tb))

print("---JUPY_JSON_START---")
print(json.dumps({{
    "stdout": out.getvalue(),
    "stderr": err.getvalue(),
    "result": result_repr,
    "error": error_tb,
    "plots": plots
}}))
"""

        self.current_proc = subprocess.Popen([VENV_PYTHON, "-c", runner_script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = self.current_proc.communicate()

        if self.current_proc.returncode != 0 and not stdout:
            ws_send_fn({"type": "stderr", "text": "\nKeyboardInterrupt: Execution interrupted by user.\n"})
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

        self.current_proc = None
        ws_send_fn({"type": "complete", "exec_count": self.exec_count})


kernel = KernelManager()


class JupyHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        # Handle WebSocket Handshake
        if self.headers.get("Upgrade", "").lower() == "websocket":
            ws_key = self.headers.get("Sec-WebSocket-Key")
            accept_key = make_ws_accept(ws_key)

            self.send_response(101)
            self.send_header("Upgrade", "websocket")
            self.send_header("Connection", "Upgrade")
            self.send_header("Sec-WebSocket-Accept", accept_key)
            self.end_headers()

            if self.path == "/ws/run":
                self.handle_run_ws()
            elif self.path == "/ws/terminal":
                self.handle_terminal_ws()
            return

        if self.path == "/api/status":
            self._send_json({"status": "ready", "exec_count": kernel.exec_count, "venv": VENV_DIR})
        else:
            super().do_GET()

    def handle_run_ws(self):
        """WebSocket handler for real-time cell execution and cancellation."""
        def ws_send(data_dict):
            try:
                frame = make_ws_frame(json.dumps(data_dict))
                self.wfile.write(frame)
                self.wfile.flush()
            except Exception:
                pass

        while True:
            msg, opcode = parse_ws_frame(self.rfile)
            if opcode == 0x8 or msg is None:
                break
            try:
                req = json.loads(msg)
                action = req.get("action")
                if action == "run":
                    code = req.get("code", "")
                    threading.Thread(target=kernel.execute, args=(code, ws_send), daemon=True).start()
                elif action == "interrupt":
                    kernel.interrupt()
            except Exception:
                pass

    def handle_terminal_ws(self):
        """WebSocket handler for native interactive shell (PowerShell / zsh / bash)."""
        env = os.environ.copy()
        env["VIRTUAL_ENV"] = VENV_DIR
        env["PATH"] = VENV_BIN + os.path.pathsep + env.get("PATH", "")

        shell = ["powershell.exe", "-NoExit"] if sys.platform == "win32" else [env.get("SHELL", "/bin/bash"), "-i"]

        proc = subprocess.Popen(
            shell,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=0,
            env=env,
            cwd=os.getcwd()
        )

        def stream_stdout():
            while proc.poll() is None:
                try:
                    chunk = proc.stdout.read(1024)
                    if chunk:
                        text = chunk.decode("utf-8", errors="ignore")
                        frame = make_ws_frame(json.dumps({"type": "output", "data": text}))
                        self.wfile.write(frame)
                        self.wfile.flush()
                    else:
                        break
                except Exception:
                    break

        threading.Thread(target=stream_stdout, daemon=True).start()

        while True:
            msg, opcode = parse_ws_frame(self.rfile)
            if opcode == 0x8 or msg is None:
                try: proc.terminate()
                except Exception: pass
                break
            try:
                data = json.loads(msg)
                if data.get("type") == "input":
                    inp = data.get("data", "")
                    proc.stdin.write(inp.encode("utf-8"))
                    proc.stdin.flush()
            except Exception:
                pass

    def _send_json(self, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_server(port=8888):
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), JupyHTTPHandler) as httpd:
        httpd.serve_forever()