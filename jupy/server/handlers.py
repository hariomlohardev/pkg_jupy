import json
import os
import threading
from http.server import SimpleHTTPRequestHandler
from jupy.core.kernel import kernel
from jupy.core.terminal import TerminalSession
from jupy.core.venv import VENV_DIR
from jupy.server.protocol import make_ws_accept, make_ws_frame, parse_ws_frame

STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))


class JupyHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

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
            return

        if self.path == "/api/status":
            self._send_json({"status": "ready", "exec_count": kernel.exec_count, "venv": VENV_DIR})
        else:
            super().do_GET()

    def handle_run_ws(self):
        ws_lock = threading.Lock()

        def ws_send(data_dict):
            with ws_lock:
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
                elif action == "stdin_reply":
                    val = req.get("value", "")
                    kernel.handle_stdin_reply(val)
            except Exception:
                pass

    def handle_terminal_ws(self):
        term_session = TerminalSession()
        ws_lock = threading.Lock()

        def ws_send(data_dict):
            with ws_lock:
                try:
                    frame = make_ws_frame(json.dumps(data_dict))
                    self.wfile.write(frame)
                    self.wfile.flush()
                except Exception:
                    pass

        # Send initial shell prompt
        ws_send({"type": "output", "data": f"Jupy Shell (.jupy_env)\n{term_session.get_prompt()}"})

        while True:
            msg, opcode = parse_ws_frame(self.rfile)
            if opcode == 0x8 or msg is None:
                break
            try:
                data = json.loads(msg)
                if data.get("type") == "command":
                    cmd = data.get("cmd", "")
                    threading.Thread(
                        target=term_session.execute_cmd,
                        args=(cmd, ws_send),
                        daemon=True
                    ).start()
            except Exception:
                pass

    def _send_json(self, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)