import json
import os
import threading
import time
from http.server import SimpleHTTPRequestHandler
from jupy.core.autocomplete import get_completions
from jupy.core.kernel import kernel
from jupy.core.metrics import get_system_metrics
from jupy.core.terminal import TerminalSession
from jupy.core.venv import VENV_DIR
from jupy.server.protocol import make_ws_accept, make_ws_frame, parse_ws_frame

STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))


class JupyHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length) if content_length > 0 else b""

            if self.path == "/api/complete":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                code = data.get("code", "")
                line = data.get("line", 1)
                col = data.get("column", 0)

                comps = kernel.get_completions(code, line, col)
                self._send_json({"completions": comps})
            else:
                self.send_error(404, "Endpoint not found")
        except Exception as e:
            self._send_json({"completions": [], "error": str(e)})

    def do_GET(self):
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
            elif self.path == "/ws/metrics":
                self.handle_metrics_ws()
            return

        if self.path == "/api/status":
            self._send_json({"status": "ready", "exec_count": kernel.exec_count, "venv": VENV_DIR})
        else:
            super().do_GET()

    def handle_metrics_ws(self):
        """Streams 5-second moving average hardware usage every 5 seconds over WebSocket."""
        ws_lock = threading.Lock()

        def stream_loop():
            while True:
                try:
                    data = get_system_metrics()
                    frame = make_ws_frame(json.dumps(data))
                    with ws_lock:
                        self.wfile.write(frame)
                        self.wfile.flush()
                    time.sleep(5.0)  # Updated: Exactly 5 seconds between updates
                except Exception:
                    break

        threading.Thread(target=stream_loop, daemon=True).start()

        while True:
            msg, opcode = parse_ws_frame(self.rfile)
            if opcode == 0x8 or msg is None:
                break

    def handle_run_ws(self):
        ws_lock = threading.Lock()

        def ws_send(data_dict):
            with ws_lock:
                try:
                    frame = make_ws_frame(json.dumps(data_dict))
                    self.wfile.write(frame)
                    self.wfile.flush()
                except Exception: pass

        while True:
            msg, opcode = parse_ws_frame(self.rfile)
            if opcode == 0x8 or msg is None: break
            try:
                req = json.loads(msg)
                action = req.get("action")
                if action == "run":
                    code = req.get("code", "")
                    threading.Thread(target=kernel.execute, args=(code, ws_send), daemon=True).start()
                elif action == "interrupt":
                    kernel.interrupt()
                elif action == "stdin_reply":
                    val = req.get("value", "")
                    kernel.handle_stdin_reply(val)
            except Exception: pass

    def handle_terminal_ws(self):
        ws_lock = threading.Lock()

        def ws_send(data_dict):
            with ws_lock:
                try:
                    frame = make_ws_frame(json.dumps(data_dict))
                    self.wfile.write(frame)
                    self.wfile.flush()
                except Exception: pass

        term = TerminalSession(ws_send)
        ws_send({"type": "prompt", "data": term.get_prompt()})

        while True:
            msg, opcode = parse_ws_frame(self.rfile)
            if opcode == 0x8 or msg is None:
                break
            try:
                data = json.loads(msg)
                if data.get("type") == "command":
                    cmd = data.get("cmd", "")
                    threading.Thread(
                        target=term.execute_cmd,
                        args=(cmd,),
                        daemon=True
                    ).start()
            except Exception: pass

    def _send_json(self, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)