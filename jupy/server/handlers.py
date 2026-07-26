import json
import os
import platform
import threading
import time
import sys
import subprocess
import html
from http.server import SimpleHTTPRequestHandler
from jupy import __version__ as JUPY_VERSION
from jupy.core import envmanager
from jupy.core.metrics import get_system_metrics
from jupy.core.terminal import TerminalSession
from jupy.core.venv import get_python_version, install_package, list_packages, uninstall_package
from jupy.server.protocol import make_ws_accept, make_ws_frame, parse_ws_frame

STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))
VENV_DIR = os.path.abspath(".jupy_env")
VENV_BIN = os.path.join(VENV_DIR, "Scripts") if sys.platform == "win32" else os.path.join(VENV_DIR, "bin")

_kernel = None

def get_kernel():
    global _kernel
    if _kernel is None:
        print("[Jupy] Importing kernel for the first time...", flush=True)
        try:
            from jupy.core.kernel import kernel
            _kernel = kernel
            print("[Jupy] Kernel imported successfully.", flush=True)
        except Exception as e:
            print(f"[Jupy] ERROR importing kernel: {e}", flush=True)
            import traceback
            traceback.print_exc()
            raise
    return _kernel

def get_kernel_optional():
    global _kernel
    if _kernel is not None:
        return _kernel
    return None


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
                comps = get_kernel().get_completions(code, line, col)
                self._send_json({"completions": comps})

            elif self.path == "/api/hover":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                code = data.get("code", "")
                line = data.get("line", 1)
                col = data.get("column", 0)
                info = get_kernel().get_hover(code, line, col)
                self._send_json({"hover": info})

            elif self.path == "/api/restart":
                get_kernel().restart()
                self._send_json({"status": "restarted", "exec_count": get_kernel().exec_count})

            elif self.path == "/api/pip/install":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                name = data.get("name", "")
                success, output = install_package(get_kernel().python, name)
                self._send_json({"success": success, "output": output, "packages": list_packages(get_kernel().python)})

            elif self.path == "/api/pip/uninstall":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                name = data.get("name", "")
                success, output = uninstall_package(get_kernel().python, name)
                self._send_json({"success": success, "output": output, "packages": list_packages(get_kernel().python)})

            elif self.path == "/api/env/select":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                mode = data.get("mode", "global")
                name = data.get("name")
                try:
                    info = get_kernel().switch_env(mode, name)
                    self._send_json({"success": True, "current": self._env_payload(info)})
                except Exception as e:
                    self._send_json({"success": False, "error": str(e)})

            elif self.path == "/api/env/create":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                name = (data.get("name") or "").strip()
                if not name:
                    self._send_json({"success": False, "error": "No environment name given."})
                else:
                    try:
                        envmanager.ensure_env(envmanager.get_global_env_path(name))
                        self._send_json({"success": True, "global_envs": envmanager.list_global_envs()})
                    except Exception as e:
                        self._send_json({"success": False, "error": str(e)})

            elif self.path == "/api/env/delete":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                name = (data.get("name") or "").strip()
                success, error = envmanager.delete_global_env(name)
                self._send_json({"success": success, "error": error, "global_envs": envmanager.list_global_envs()})

            elif self.path == "/api/export/html":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                notebook_json = data.get("notebook", {})
                html_out = self._export_to_html(notebook_json)
                self._send_json({"html": html_out})

            elif self.path == "/api/export/py":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                notebook_json = data.get("notebook", {})
                script = self._export_to_py(notebook_json)
                self._send_json({"script": script})

            elif self.path == "/api/export/md":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                notebook_json = data.get("notebook", {})
                md = self._export_to_md(notebook_json)
                self._send_json({"markdown": md})

            elif self.path == "/api/export/pdf":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                notebook_json = data.get("notebook", {})
                html_out = self._export_to_html(notebook_json, for_pdf=True)
                self._send_json({"html": html_out})

            else:
                self.send_error(404, "Endpoint not found")
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            return
        except Exception as e:
            print(f"[Jupy] Error in do_POST: {e}", flush=True)
            import traceback
            traceback.print_exc()
            self._send_json({"success": False, "error": str(e)})

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

        elif self.path == "/api/status":
            kernel = get_kernel_optional()
            if kernel is None:
                self._send_json({"status": "not_started", "exec_count": 0, "venv": "—"})
            else:
                self._send_json({"status": "ready", "exec_count": kernel.exec_count, "venv": kernel.env_info["path"]})

        elif self.path == "/api/pip/list":
            self._send_json({"packages": list_packages(get_kernel().python)})

        elif self.path == "/api/env/list":
            self._send_json({
                "current": self._env_payload(get_kernel().env_info),
                "global_envs": envmanager.list_global_envs(),
                "jupy_version": JUPY_VERSION,
                "platform": platform.platform(),
                "data_dir": envmanager.get_data_dir(),
            })

        else:
            super().do_GET()

    def _env_payload(self, info):
        return {
            "mode": info["mode"],
            "name": info["name"],
            "path": info["path"],
            "label": info["label"],
            "python_version": get_python_version(info["python"]),
            "package_count": len(list_packages(info["python"])),
        }

    # ----- Export methods -----
    def _export_to_html(self, notebook_json, for_pdf=False):
        cells = notebook_json.get("cells", [])
        html_content = """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Exported Notebook</title>
<style>
body { font-family: sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; }
.cell { margin: 20px 0; border-left: 3px solid #ccc; padding-left: 15px; }
.cell-code { background: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; }
.cell-output { background: #fff; padding: 10px; border: 1px solid #ddd; margin-top: 5px; }
.cell-markdown { font-family: sans-serif; }
.plot-container { text-align: center; }
"""
        if for_pdf:
            html_content += """
@media print {
  body { margin: 0.5in; }
  .cell { page-break-after: always; }
  .cell:last-child { page-break-after: auto; }
}
"""
        html_content += """
</style>
</head>
<body>
"""
        for cell in cells:
            cell_type = cell.get("type", "code")
            source = cell.get("source", "")
            outputs = cell.get("outputs", [])
            if cell_type == "markdown":
                safe_source = html.escape(source)
                html_content += f'<div class="cell cell-markdown">{safe_source}</div>'
            else:
                safe_source = html.escape(source)
                html_content += f'<div class="cell cell-code"><pre>{safe_source}</pre>'
                for out in outputs:
                    if out.get("kind") == "stdout":
                        safe_text = html.escape(out.get("text", ""))
                        html_content += f'<div class="cell-output">{safe_text}</div>'
                    elif out.get("kind") == "stderr":
                        safe_text = html.escape(out.get("text", ""))
                        html_content += f'<div class="cell-output" style="color:red;">{safe_text}</div>'
                    elif out.get("kind") == "plot":
                        html_content += f'<div class="cell-output plot-container">{out.get("text", "")}</div>'
                    elif out.get("kind") == "display":
                        data = out.get("data", {})
                        if "text/html" in data:
                            html_content += f'<div class="cell-output">{data["text/html"]}</div>'
                        else:
                            safe_text = html.escape(data.get("text/plain", str(data)))
                            html_content += f'<div class="cell-output">{safe_text}</div>'
                html_content += '</div>'
        html_content += "</body></html>"
        return html_content

    def _export_to_py(self, notebook_json):
        cells = notebook_json.get("cells", [])
        lines = []
        for cell in cells:
            if cell.get("type") == "code":
                lines.append(cell.get("source", ""))
        return "\n\n".join(lines)

    def _export_to_md(self, notebook_json):
        cells = notebook_json.get("cells", [])
        lines = []
        for cell in cells:
            if cell.get("type") == "markdown":
                lines.append(cell.get("source", ""))
            elif cell.get("type") == "code":
                lines.append("```python\n" + cell.get("source", "") + "\n```")
        return "\n\n".join(lines)

    # ----- WebSocket handlers -----
    def handle_metrics_ws(self):
        ws_lock = threading.Lock()
        def stream_loop():
            while True:
                try:
                    data = get_system_metrics()
                    frame = make_ws_frame(json.dumps(data))
                    with ws_lock:
                        self.wfile.write(frame)
                        self.wfile.flush()
                    time.sleep(5.0)
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
                except Exception as e:
                    print(f"[Jupy] ws_send error: {e}", flush=True)

        try:
            kernel = get_kernel()
            print("[Jupy] WebSocket run handler: kernel ready", flush=True)
        except Exception as e:
            print(f"[Jupy] WebSocket run handler: kernel failed to start: {e}", flush=True)
            try:
                ws_send({"type": "error", "message": f"Kernel failed to start: {str(e)}"})
            except:
                pass
            try:
                self.wfile.write(make_ws_frame(json.dumps({"type": "error", "message": "Kernel unavailable"})))
                self.wfile.flush()
            except:
                pass
            return

        while True:
            msg, opcode = parse_ws_frame(self.rfile)
            if opcode == 0x8 or msg is None:
                break
            try:
                req = json.loads(msg)
                action = req.get("action")
                if action == "run":
                    code = req.get("code", "")
                    print(f"[Jupy] Received run request: {code[:50]}...", flush=True)
                    threading.Thread(target=kernel.execute, args=(code, ws_send), daemon=True).start()
                elif action == "interrupt":
                    kernel.interrupt()
                elif action == "stdin_reply":
                    val = req.get("value", "")
                    kernel.handle_stdin_reply(val)
            except Exception as e:
                print(f"[Jupy] Error in WebSocket message: {e}", flush=True)
                import traceback
                traceback.print_exc()

    def handle_terminal_ws(self):
        kernel = get_kernel()
        env_info = kernel.env_info
        venv_dir = env_info["path"]
        venv_bin = env_info["bin"]

        env = os.environ.copy()
        env["VIRTUAL_ENV"] = venv_dir
        env["PATH"] = venv_bin + os.path.pathsep + env.get("PATH", "")

        shell = ["cmd.exe", "/K"] if sys.platform == "win32" else [env.get("SHELL", "/bin/bash"), "-i"]

        proc = subprocess.Popen(
            shell,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=env,
            cwd=os.getcwd()
        )

        def stream_stdout():
            while proc.poll() is None:
                try:
                    chunk = proc.stdout.read(4096)
                    if chunk:
                        text = chunk.decode("utf-8", errors="replace")
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
                try:
                    proc.terminate()
                except Exception:
                    pass
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
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass