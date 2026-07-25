---
title: Folder Code Compilation
date: 2026-07-25 07:24:27
root_folder: "jupy"
total_compiled_files: 41
---

# File: cli.py

```py
import argparse
import socketserver
import sys
import webbrowser
from jupy.server.handlers import JupyHTTPHandler


class ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    parser = argparse.ArgumentParser(description="Jupy - Brutalist Local Python Notebook")
    parser.add_argument("--port", type=int, default=8888, help="Port to run server on (default: 8888)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open browser")
    args = parser.parse_args()

    url = f"http://localhost:{args.port}"
    print(f"\n  ┌───────────────────────────────────────────────────┐")
    print(f"  │  JUPY LOCAL NOTEBOOK SERVER                       │")
    print(f"  │  URL: {url:<43} │")
    print(f"  └───────────────────────────────────────────────────┘\n")

    if not args.no_browser:
        webbrowser.open(url)

    try:
        with ThreadingServer(("", args.port), JupyHTTPHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[Jupy] Server stopped.")
        sys.exit(0)


if __name__ == "__main__":
    main()
```


---

# File: combine.py

```py
import os
import argparse
from datetime import datetime

def combine_files_to_markdown(output_filename="files.md", user_excludes=None):
    if user_excludes is None:
        user_excludes = []
        
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(current_dir, output_filename)
    
    # Core default folders to always skip
    default_ignore_folders = {".git", ".vscode", ".venv", "venv", "__pycache__", "node_modules"}
    
    # Standardise user-provided paths to absolute paths for robust matching
    exclude_paths = [os.path.abspath(os.path.join(current_dir, p)) for p in user_excludes]

    # First pass: Count files while applying filter rules
    total_files = 0
    valid_files = []
    
    for root, dirs, files in os.walk(current_dir):
        # Filter out default ignored folders in-place to avoid walking down them
        dirs[:] = [d for d in dirs if d not in default_ignore_folders]
        
        # Filter out user-specified excluded folders
        dirs[:] = [d for d in dirs if os.path.abspath(os.path.join(root, d)) not in exclude_paths]
        
        for file in files:
            file_path = os.path.join(root, file)
            abs_file_path = os.path.abspath(file_path)
            
            # Skip the output markdown file itself and any explicitly excluded file paths
            if abs_file_path == os.path.abspath(output_path) or abs_file_path in exclude_paths:
                continue
                
            total_files += 1
            valid_files.append((file_path, root))

    # Second pass: Write the compiled file
    with open(output_path, "w", encoding="utf-8") as outfile:
        # 1. Write YAML Frontmatter
        outfile.write("---\n")
        outfile.write("title: Folder Code Compilation\n")
        outfile.write(f"date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        outfile.write(f"root_folder: \"{os.path.basename(current_dir)}\"\n")
        outfile.write(f"total_compiled_files: {total_files}\n")
        outfile.write("---\n\n")
        
        # 2. Write content of valid files
        for file_path, root in valid_files:
            relative_path = os.path.relpath(file_path, current_dir)
            
            # Write the file location header
            outfile.write(f"# File: {relative_path}\n\n")
            
            # Auto-detect extension for markdown code blocks (optional but cleaner)
            ext = os.path.splitext(file_path)[1].lstrip('.')
            outfile.write(f"```{ext}\n")
            
            try:
                with open(file_path, "r", encoding="utf-8", errors="replace") as infile:
                    content = infile.read()
                    outfile.write(content)
            except Exception as e:
                outfile.write(f"*Error reading this file: {str(e)}*")
                
            outfile.write("\n```\n")
            # Add spacing between files
            outfile.write("\n\n---\n\n")
                
    print(f"Successfully created {output_filename} with YAML frontmatter.")
    print(f"Total compiled files: {total_files}")

if __name__ == "__main__":
    # Setup terminal command-line arguments
    parser = argparse.ArgumentParser(description="Compile project files into a single Markdown file.")
    parser.add_argument(
        "-e", "--exclude", 
        nargs="*", 
        default=[], 
        help="Space-separated relative paths of folders or files to exclude (e.g., -e tests/ secret_configs/)"
    )
    parser.add_argument(
        "-o", "--output", 
        default="files.md", 
        help="Name of the output markdown file (default: files.md)"
    )
    
    args = parser.parse_args()
    combine_files_to_markdown(output_filename=args.output, user_excludes=args.exclude)

```


---

# File: server.py

```py
import ast
import base64
import hashlib
import io
import json
import os
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
    """Handles cell execution with safe real-time process interrupt support."""
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
        proc = subprocess.Popen([VENV_PYTHON, "-c", runner_script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.current_proc = proc
        stdout, stderr = proc.communicate()

        if proc.returncode != 0 and not stdout:
            ws_send_fn({"type": "stderr", "text": "\n⏹ Execution interrupted by user.\n"})
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
        """Native Shell Handler."""
        env = os.environ.copy()
        env["VIRTUAL_ENV"] = VENV_DIR
        env["PATH"] = VENV_BIN + os.path.pathsep + env.get("PATH", "")

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
                    chunk = proc.stdout.read(1)
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
```


---

# File: __init__.py

```py
"""Jupy - Lightweight Brutalist Python Notebook"""
__version__ = "0.1.0"
```


---

# File: __main__.py

```py
from jupy.cli import main

if __name__ == "__main__":
    main()
```


---

# File: core\autocomplete.py

```py
import builtins
import importlib
import keyword
import re
import sys
from jupy.core.venv import VENV_PYTHON

_jedi_env = None


def get_jedi_env():
    """Lazily resolves and caches the .jupy_env environment for Jedi."""
    global _jedi_env
    if _jedi_env is None:
        try:
            import jedi
            _jedi_env = jedi.get_system_environment(VENV_PYTHON)
        except Exception:
            _jedi_env = False
    return _jedi_env


def get_completions(code, line, column, namespace):
    """Generates autocompletion suggestions using Jedi, regex import parsing, and kernel namespace."""
    completions = []
    seen = set()

    # Parse import statements directly from code editor text (e.g. import numpy as np)
    local_imports = {}
    for l in code.splitlines():
        # Match "import x as y" or "import x"
        m1 = re.match(r'^\s*import\s+([a-zA-Z0-9_\.]+)(?:\s+as\s+([a-zA-Z0-9_]+))?', l)
        if m1:
            mod_name, alias = m1.group(1), m1.group(2)
            local_imports[alias if alias else mod_name] = mod_name

        # Match "from x import y"
        m2 = re.match(r'^\s*from\s+([a-zA-Z0-9_\.]+)\s+import\s+([a-zA-Z0-9_\.,\s\*]+)', l)
        if m2:
            mod_name = m2.group(1)
            for item in m2.group(2).split(','):
                item = item.strip()
                if ' as ' in item:
                    orig, alias = item.split(' as ')
                    local_imports[alias.strip()] = f"{mod_name}.{orig.strip()}"
                elif item and item != '*':
                    local_imports[item] = f"{mod_name}.{item}"

    # 1. Try Jedi with .jupy_env environment
    env = get_jedi_env()
    if env:
        try:
            import jedi
            script = jedi.Script(code, environment=env)
            jedi_comps = script.complete(line, column)
            for c in jedi_comps:
                if c.name not in seen:
                    seen.add(c.name)
                    info = c.type
                    try:
                        sigs = c.get_signatures()
                        if sigs:
                            info = sigs[0].to_string()
                    except Exception:
                        pass
                    completions.append({
                        "text": c.name,
                        "type": c.type,
                        "info": info
                    })
        except Exception:
            pass

    # 2. Extract active word at cursor for attributes, keywords, builtins, and imports
    try:
        lines = code.splitlines()
        if 0 <= line - 1 < len(lines):
            cur_line = lines[line - 1][:column]
            parts = cur_line.split('.')

            # Dot completion (e.g. np. or math. or obj.)
            if len(parts) > 1:
                var_name = parts[-2].strip().split()[-1] if parts[-2].strip() else ""
                prefix = parts[-1].strip()

                obj = None
                # Check kernel namespace first
                if var_name in namespace:
                    obj = namespace[var_name]
                # Check local imports detected in editor
                elif var_name in local_imports:
                    try:
                        obj = importlib.import_module(local_imports[var_name])
                    except Exception:
                        pass

                if obj is not None:
                    for a in dir(obj):
                        if not a.startswith('_') and a.lower().startswith(prefix.lower()) and a not in seen:
                            seen.add(a)
                            completions.append({"text": a, "type": "attr", "info": f"{var_name}.{a}"})

            # Identifier completion (keywords, builtins, imports, globals)
            else:
                word = parts[-1].strip()
                if word:
                    for kw in keyword.kwlist:
                        if kw.startswith(word) and kw not in seen:
                            seen.add(kw)
                            completions.append({"text": kw, "type": "kw", "info": "keyword"})

                    for b in dir(builtins):
                        if not b.startswith('_') and b.startswith(word) and b not in seen:
                            seen.add(b)
                            completions.append({"text": b, "type": "func", "info": "builtin"})

                    for k in local_imports.keys():
                        if k.startswith(word) and k not in seen:
                            seen.add(k)
                            completions.append({"text": k, "type": "mod", "info": f"import {local_imports[k]}"})

                    for k in namespace.keys():
                        if not k.startswith('_') and k.lower().startswith(word.lower()) and k not in seen:
                            seen.add(k)
                            type_name = type(namespace[k]).__name__
                            completions.append({"text": k, "type": type_name[:5], "info": f"global {k}"})
    except Exception:
        pass

    return completions
```


---

# File: core\kernel.py

```py
import json
import os
import re
import subprocess
import sys
import threading
import time
from jupy.core.venv import VENV_PYTHON

# Persistent Kernel Worker Process Script
KERNEL_WORKER_SCRIPT = r"""
import sys, io, ast, base64, json, traceback, builtins, warnings, re, keyword, importlib, threading

warnings.filterwarnings("ignore", category=UserWarning, module="matplotlib")

namespace = {"__name__": "__main__"}

def _warmup_jedi():
    try:
        import jedi
        jedi.Script("import math\nmath.").complete(2, 5)
    except Exception:
        pass

threading.Thread(target=_warmup_jedi, daemon=True).start()

def _custom_input(prompt=""):
    prompt_str = str(prompt)
    sys.stdout.write(f"---JUPY_STDIN_REQ:{prompt_str}---\n")
    sys.stdout.flush()
    line = sys.stdin.readline()
    if not line:
        raise KeyboardInterrupt("Input stream closed.")
    return line.rstrip("\r\n")

builtins.input = _custom_input

def _capture_plots():
    plots = []
    if "matplotlib.pyplot" in sys.modules:
        import matplotlib.pyplot as plt
        from matplotlib._pylab_helpers import Gcf
        
        fignums = plt.get_fignums()
        for i in list(fignums):
            try:
                manager = Gcf.get_fig_manager(i)
                if manager and manager.canvas and manager.canvas.figure:
                    fig = manager.canvas.figure
                    if fig.get_axes():
                        try: fig.tight_layout()
                        except Exception: pass
                        buf = io.BytesIO()
                        fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0.1, dpi=110, facecolor="#FFFFFF")
                        buf.seek(0)
                        b64 = base64.b64encode(buf.read()).decode("ascii")
                        plots.append(f'<img class="notebook-plot" src="data:image/png;base64,{b64}" alt="Plot" />')
            except Exception: pass
        
        try: plt.close("all")
        except Exception: pass
        try: Gcf.destroy_all()
        except Exception: pass
        try: Gcf.figs.clear()
        except Exception: pass

    return plots

def _get_worker_completions(code, line, col):
    completions = []
    seen = set()

    local_imports = {}
    for l in code.splitlines():
        m1 = re.match(r'^\s*import\s+([a-zA-Z0-9_\.]+)(?:\s+as\s+([a-zA-Z0-9_]+))?', l)
        if m1:
            mod_name, alias = m1.group(1), m1.group(2)
            local_imports[alias if alias else mod_name] = mod_name
        m2 = re.match(r'^\s*from\s+([a-zA-Z0-9_\.]+)\s+import\s+([a-zA-Z0-9_\.,\s\*]+)', l)
        if m2:
            mod_name = m2.group(1)
            for item in m2.group(2).split(','):
                item = item.strip()
                if ' as ' in item:
                    orig, alias = item.split(' as ')
                    local_imports[alias.strip()] = f"{mod_name}.{orig.strip()}"
                elif item and item != '*':
                    local_imports[item] = f"{mod_name}.{item}"

    try:
        import jedi
        script = jedi.Script(code)
        jedi_comps = script.complete(line, col)
        for c in jedi_comps:
            if c.name not in seen:
                seen.add(c.name)
                info = c.type
                try:
                    sigs = c.get_signatures()
                    if sigs: info = sigs[0].to_string()
                except Exception: pass
                completions.append({"text": c.name, "type": c.type, "info": info})
    except Exception: pass

    try:
        lines = code.splitlines()
        if 0 <= line - 1 < len(lines):
            cur_line = lines[line - 1][:col]
            parts = cur_line.split('.')

            if len(parts) > 1:
                var_match = re.search(r'([a-zA-Z_][a-zA-Z0-9_]*)$', parts[-2].strip())
                var_name = var_match.group(1) if var_match else ""
                prefix_match = re.search(r'([a-zA-Z_][a-zA-Z0-9_]*)$', parts[-1])
                prefix = prefix_match.group(1) if prefix_match else ""

                obj = None
                if var_name in namespace:
                    obj = namespace[var_name]
                elif var_name in local_imports:
                    try: obj = importlib.import_module(local_imports[var_name])
                    except Exception: pass

                if obj is not None:
                    for a in dir(obj):
                        if not a.startswith('_') and a.lower().startswith(prefix.lower()) and a not in seen:
                            seen.add(a)
                            completions.append({"text": a, "type": "attr", "info": f"{var_name}.{a}"})

            else:
                word_match = re.search(r'([a-zA-Z_][a-zA-Z0-9_]*)$', cur_line)
                word = word_match.group(1) if word_match else ""
                if word:
                    for kw in keyword.kwlist:
                        if kw.startswith(word) and kw not in seen:
                            seen.add(kw)
                            completions.append({"text": kw, "type": "kw", "info": "keyword"})

                    for b in dir(builtins):
                        if not b.startswith('_') and b.startswith(word) and b not in seen:
                            seen.add(b)
                            completions.append({"text": b, "type": "func", "info": "builtin"})

                    for k in local_imports.keys():
                        if k.startswith(word) and k not in seen:
                            seen.add(k)
                            completions.append({"text": k, "type": "mod", "info": f"import {local_imports[k]}"})

                    for k in namespace.keys():
                        if not k.startswith('_') and k.lower().startswith(word.lower()) and k not in seen:
                            seen.add(k)
                            type_name = type(namespace[k]).__name__
                            completions.append({"text": k, "type": type_name[:5], "info": f"global {k}"})
    except Exception: pass

    return completions

sys.stdout.write("---JUPY_KERNEL_READY---\n")
sys.stdout.flush()

while True:
    line = sys.stdin.readline()
    if not line:
        break
    try:
        data = json.loads(line)
        action = data.get("action")

        if action == "complete":
            code = data.get("code", "")
            l_num = data.get("line", 1)
            c_num = data.get("column", 0)
            comps = _get_worker_completions(code, l_num, c_num)
            sys.stdout.write(f"---JUPY_COMPS:{json.dumps(comps)}---\n")
            sys.stdout.flush()
        
        elif action == "execute":
            code = data.get("code", "")
            
            try:
                if "matplotlib" in sys.modules:
                    import matplotlib
                    try: matplotlib.use("Agg", force=True)
                    except Exception: pass

                tree = ast.parse(code, mode="exec")
                if tree.body and isinstance(tree.body[-1], ast.Expr):
                    last = tree.body.pop()
                    if tree.body:
                        exec(compile(tree, "<cell>", "exec"), namespace)
                    expr = ast.Expression(last.value)
                    ast.copy_location(expr, last.value)
                    val = eval(compile(expr, "<cell>", "eval"), namespace)
                    if val is not None:
                        print(repr(val), flush=True)
                else:
                    exec(compile(code, "<cell>", "exec"), namespace)

                plots = _capture_plots()
                if plots:
                    print("---JUPY_PLOTS_START---", flush=True)
                    for p in plots:
                        print(p, flush=True)
                    print("---JUPY_PLOTS_END---", flush=True)

            except SyntaxError as e:
                err_msg = "".join(traceback.format_exception_only(type(e), e))
                sys.stdout.write(f"---JUPY_STDERR_START---\n{err_msg}---JUPY_STDERR_END---\n")
                sys.stdout.flush()
            except Exception as e:
                tb = e.__traceback__.tb_next if e.__traceback__ else None
                err_msg = "".join(traceback.format_exception(type(e), e, tb))
                sys.stdout.write(f"---JUPY_STDERR_START---\n{err_msg}---JUPY_STDERR_END---\n")
                sys.stdout.flush()

            print("---JUPY_CELL_COMPLETE---", flush=True)

    except Exception as e:
        sys.stdout.write(f"---JUPY_STDERR_START---\nKernel error: {e}\n---JUPY_STDERR_END---\n")
        print("---JUPY_CELL_COMPLETE---", flush=True)
"""


def _force_kill_process(proc):
    """Forcefully kills process tree instantly."""
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


class KernelManager:
    """Persistent Python Kernel Manager with instant non-blocking process force-kill."""
    def __init__(self):
        self.exec_count = 0
        self.proc = None
        self.lock = threading.Lock()
        self._ensure_kernel_proc()

    def _ensure_kernel_proc(self):
        with self.lock:
            if self.proc is None or self.proc.poll() is not None:
                env = os.environ.copy()
                env["PYTHONUNBUFFERED"] = "1"

                self.proc = subprocess.Popen(
                    [VENV_PYTHON, "-u", "-c", KERNEL_WORKER_SCRIPT],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=1,
                    env=env
                )
                while True:
                    line = self.proc.stdout.readline()
                    if "---JUPY_KERNEL_READY---" in line or not line:
                        break

    def get_completions(self, code, line, col):
        """Sends completion request into worker kernel."""
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

    def force_interrupt(self):
        """Forcefully kills running process instantly without waiting for thread locks."""
        proc = self.proc
        if proc and proc.poll() is None:
            _force_kill_process(proc)
            return True
        return False

    def interrupt(self):
        return self.force_interrupt()

    def restart(self):
        """Restarts kernel process, wiping namespace state."""
        proc = self.proc
        if proc:
            _force_kill_process(proc)
        self.proc = None
        self.exec_count = 0
        self._ensure_kernel_proc()

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
        self._ensure_kernel_proc()
        current_proc = self.proc

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

        for cmd in pip_cmds:
            ws_send_fn({"type": "stdout", "text": f"Installing {cmd} in .jupy_env...\n"})
            p = subprocess.run([VENV_PYTHON, "-m", "pip", "install"] + cmd.split(), capture_output=True, text=True)
            if p.stdout: ws_send_fn({"type": "stdout", "text": p.stdout})
            if p.stderr: ws_send_fn({"type": "stderr", "text": p.stderr})

        clean_code = "\n".join(py_lines)
        if not clean_code.strip():
            ws_send_fn({"type": "complete", "exec_count": self.exec_count})
            return

        req = json.dumps({"action": "execute", "code": clean_code}) + "\n"
        try:
            current_proc.stdin.write(req)
            current_proc.stdin.flush()
        except Exception as e:
            ws_send_fn({"type": "stderr", "text": f"Kernel communication error: {str(e)}\n"})
            ws_send_fn({"type": "complete", "exec_count": self.exec_count})
            return

        stderr_collecting = False
        plots_collecting = False
        plot_lines = []

        while current_proc:
            line = current_proc.stdout.readline()

            # Detect if process was force-killed by user interrupt
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

            if "---JUPY_STDERR_START---" in line:
                stderr_collecting = True
                continue
            if "---JUPY_STDERR_END---" in line:
                stderr_collecting = False
                continue

            if "---JUPY_PLOTS_START---" in line:
                plots_collecting = True
                continue
            if "---JUPY_PLOTS_END---" in line:
                plots_collecting = False
                for p in plot_lines:
                    ws_send_fn({"type": "plot", "html": p})
                plot_lines = []
                continue

            if stderr_collecting:
                ws_send_fn({"type": "stderr", "text": line})
            elif plots_collecting:
                plot_lines.append(line.strip())
            else:
                ws_send_fn({"type": "stdout", "text": line})

        ws_send_fn({"type": "complete", "exec_count": self.exec_count})


kernel = KernelManager()
```


---

# File: core\metrics.py

```py
import collections
import os
import subprocess
import sys
import threading
import time

try:
    import psutil
    # Pre-warm psutil CPU time counters immediately on module import
    psutil.cpu_percent(interval=None)
except ImportError:
    psutil = None


class MetricsSampler:
    """Maintains a rolling 5-second window buffer of hardware metrics with instant initial sampling."""
    def __init__(self, window_seconds=5.0):
        self.window_seconds = window_seconds
        self.history = collections.deque()
        self.lock = threading.Lock()

        # Take an initial sample immediately so get_5sec_average() works at t=0ms
        self._take_sample()

        # Start continuous background sampler thread (samples every 200ms)
        threading.Thread(target=self._sampling_loop, daemon=True).start()

    def _get_gpu_sample(self):
        try:
            res = subprocess.run(
                ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=0.1
            )
            if res.returncode == 0 and res.stdout.strip():
                parts = res.stdout.strip().split("\n")[0].split(",")
                gpu_pct = float(parts[0].strip())
                gpu_used_mb = float(parts[1].strip())
                gpu_total_mb = float(parts[2].strip())
                return True, gpu_pct, round(gpu_used_mb / 1024, 1), round(gpu_total_mb / 1024, 1)
        except Exception:
            pass
        return False, 0.0, 0.0, 0.0

    def _take_sample(self):
        """Captures an instant hardware metric sample and appends to rolling 5s history."""
        now = time.time()
        cpu = psutil.cpu_percent(interval=None) if psutil else 0.0
        ram_pct, ram_used_gb, ram_total_gb = 0.0, 0.0, 0.0

        if psutil:
            try:
                mem = psutil.virtual_memory()
                ram_pct = mem.percent
                ram_used_gb = mem.used / (1024**3)
                ram_total_gb = mem.total / (1024**3)
            except Exception:
                pass

        has_gpu, gpu_pct, gpu_used_gb, gpu_total_gb = self._get_gpu_sample()

        sample = {
            "time": now,
            "cpu": cpu,
            "ram_pct": ram_pct,
            "ram_used_gb": ram_used_gb,
            "ram_total_gb": ram_total_gb,
            "has_gpu": has_gpu,
            "gpu_pct": gpu_pct,
            "gpu_used_gb": gpu_used_gb,
            "gpu_total_gb": gpu_total_gb
        }

        with self.lock:
            self.history.append(sample)
            # Evict samples older than 5.0 seconds
            cutoff = now - self.window_seconds
            while self.history and self.history[0]["time"] < cutoff:
                self.history.popleft()

    def _sampling_loop(self):
        while True:
            self._take_sample()
            time.sleep(0.2)  # 200ms sampling rate

    def get_5sec_average(self):
        """Calculates mean average metrics across the last 5 seconds."""
        with self.lock:
            if not self.history:
                return {
                    "cpu": 0.0, "ram_pct": 0.0, "ram_used_gb": 0.0, "ram_total_gb": 0.0,
                    "has_gpu": False, "gpu_pct": 0.0, "gpu_used_gb": 0.0, "gpu_total_gb": 0.0
                }

            count = len(self.history)
            avg_cpu = sum(s["cpu"] for s in self.history) / count
            avg_ram_pct = sum(s["ram_pct"] for s in self.history) / count
            avg_ram_used = sum(s["ram_used_gb"] for s in self.history) / count
            avg_gpu_pct = sum(s["gpu_pct"] for s in self.history) / count
            avg_gpu_used = sum(s["gpu_used_gb"] for s in self.history) / count

            latest = self.history[-1]

            return {
                "cpu": round(avg_cpu, 1),
                "ram_pct": round(avg_ram_pct, 1),
                "ram_used_gb": round(avg_ram_used, 1),
                "ram_total_gb": round(latest["ram_total_gb"], 1),
                "has_gpu": latest["has_gpu"],
                "gpu_pct": round(avg_gpu_pct, 1),
                "gpu_used_gb": round(avg_gpu_used, 1),
                "gpu_total_gb": round(latest["gpu_total_gb"], 1)
            }


metrics_sampler = MetricsSampler(window_seconds=5.0)


def get_system_metrics():
    """Returns instant 5-second moving average system metrics."""
    return metrics_sampler.get_5sec_average()
```


---

# File: core\terminal.py

```py
import os
import re
import subprocess
import sys
from jupy.core.venv import VENV_BIN, VENV_DIR

ANSI_ESCAPE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')

def clean_text(text):
    return ANSI_ESCAPE.sub('', text)


class TerminalSession:
    """Executes shell commands in .jupy_env with real-time output streaming and a clean yellow prompt."""
    def __init__(self, ws_send_fn):
        self.ws_send_fn = ws_send_fn
        self.cwd = os.getcwd()

    def get_env(self):
        env = os.environ.copy()
        env["VIRTUAL_ENV"] = VENV_DIR
        env["PATH"] = VENV_BIN + os.path.pathsep + env.get("PATH", "")
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        return env

    def get_prompt(self):
        return "(jupy_venv) ❯"

    def execute_cmd(self, cmd_str):
        cmd = cmd_str.strip()

        if not cmd:
            self.ws_send_fn({"type": "prompt", "data": self.get_prompt()})
            return

        if cmd in ("cls", "clear"):
            self.ws_send_fn({"type": "clear"})
            self.ws_send_fn({"type": "prompt", "data": self.get_prompt()})
            return

        if cmd.startswith("cd ") or cmd == "cd":
            target = cmd[3:].strip() if len(cmd) > 3 else os.path.expanduser("~")
            if target == "~":
                target = os.path.expanduser("~")
            new_path = os.path.abspath(os.path.join(self.cwd, target))
            if os.path.exists(new_path) and os.path.isdir(new_path):
                self.cwd = new_path
                self.ws_send_fn({"type": "prompt", "data": self.get_prompt()})
            else:
                self.ws_send_fn({"type": "output", "data": f"Path not found: {target}\n"})
                self.ws_send_fn({"type": "prompt", "data": self.get_prompt()})
            return

        try:
            proc = subprocess.Popen(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=self.get_env(),
                cwd=self.cwd,
                bufsize=1,
                text=True,
                errors="replace"
            )

            while True:
                line = proc.stdout.readline()
                if not line and proc.poll() is not None:
                    break
                if line:
                    cleaned = clean_text(line)
                    self.ws_send_fn({"type": "output", "data": cleaned})

            proc.communicate()
            self.ws_send_fn({"type": "prompt", "data": self.get_prompt()})

        except Exception as e:
            self.ws_send_fn({"type": "output", "data": f"Error: {str(e)}\n"})
            self.ws_send_fn({"type": "prompt", "data": self.get_prompt()})
```


---

# File: core\venv.py

```py
import json
import os
import subprocess
import sys
import venv

VENV_DIR = os.path.abspath(".jupy_env")


def ensure_virtualenv():
    """Ensure isolated .jupy_env virtual environment exists with psutil & jedi."""
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

    # Auto-install psutil and jedi
    try:
        subprocess.run([venv_python, "-c", "import psutil, jedi"], check=True, capture_output=True)
    except Exception:
        print("[Jupy] Installing core packages (psutil, jedi) into .jupy_env...")
        subprocess.run([venv_python, "-m", "pip", "install", "psutil", "jedi"], capture_output=True)

    return venv_python, venv_bin


VENV_PYTHON, VENV_BIN = ensure_virtualenv()


def list_packages():
    """Returns installed packages in .jupy_env as [{"name": ..., "version": ...}, ...], sorted by name."""
    try:
        result = subprocess.run(
            [VENV_PYTHON, "-m", "pip", "list", "--format=json"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return []
        packages = json.loads(result.stdout)
        packages.sort(key=lambda p: p["name"].lower())
        return packages
    except Exception:
        return []


def install_package(spec):
    """Installs a package (e.g. "requests" or "requests==2.32.0") into .jupy_env.
    Returns (success: bool, output: str) — output is combined stdout+stderr from pip."""
    spec = (spec or "").strip()
    if not spec:
        return False, "No package name given."
    try:
        result = subprocess.run(
            [VENV_PYTHON, "-m", "pip", "install", spec],
            capture_output=True, text=True, timeout=300
        )
        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, f"Timed out installing {spec} (5 min limit)."
    except Exception as e:
        return False, str(e)


def uninstall_package(name):
    """Uninstalls a package from .jupy_env. Returns (success: bool, output: str)."""
    name = (name or "").strip()
    if not name:
        return False, "No package name given."
    try:
        result = subprocess.run(
            [VENV_PYTHON, "-m", "pip", "uninstall", "-y", name],
            capture_output=True, text=True, timeout=60
        )
        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, f"Timed out uninstalling {name}."
    except Exception as e:
        return False, str(e)


def get_python_version():
    """Returns the .jupy_env interpreter's version string, e.g. 'Python 3.11.6'."""
    try:
        result = subprocess.run([VENV_PYTHON, "--version"], capture_output=True, text=True, timeout=5)
        return (result.stdout or result.stderr or "").strip()
    except Exception:
        return "unknown"
```


---

# File: core\__init__.py

```py

```


---

# File: server\handlers.py

```py
import json
import os
import platform
import threading
import time
from http.server import SimpleHTTPRequestHandler
from jupy import __version__ as JUPY_VERSION
from jupy.core.autocomplete import get_completions
from jupy.core.kernel import kernel
from jupy.core.metrics import get_system_metrics
from jupy.core.terminal import TerminalSession
from jupy.core.venv import (
    VENV_DIR,
    get_python_version,
    install_package,
    list_packages,
    uninstall_package,
)
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

            elif self.path == "/api/restart":
                # BUG FIX: the frontend has always called this endpoint to restart the
                # kernel (see notebook/notebookController.js), but it never had a route
                # here — every restart request silently 404'd.
                kernel.restart()
                self._send_json({"status": "restarted", "exec_count": kernel.exec_count})

            elif self.path == "/api/pip/install":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                name = data.get("name", "")
                success, output = install_package(name)
                self._send_json({"success": success, "output": output, "packages": list_packages()})

            elif self.path == "/api/pip/uninstall":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                name = data.get("name", "")
                success, output = uninstall_package(name)
                self._send_json({"success": success, "output": output, "packages": list_packages()})

            else:
                self.send_error(404, "Endpoint not found")
        except Exception as e:
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

        if self.path == "/api/status":
            self._send_json({"status": "ready", "exec_count": kernel.exec_count, "venv": VENV_DIR})

        elif self.path == "/api/pip/list":
            self._send_json({"packages": list_packages()})

        elif self.path == "/api/about":
            packages = list_packages()
            self._send_json({
                "jupy_version": JUPY_VERSION,
                "python_version": get_python_version(),
                "venv_dir": VENV_DIR,
                "platform": platform.platform(),
                "package_count": len(packages),
            })

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
```


---

# File: server\protocol.py

```py
import base64
import hashlib
import struct

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
        if opcode == 0x8: return None, 0x8

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
```


---

# File: server\__init__.py

```py

```


---

# File: static\index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Untitled.ipynb — Jupy</title>

<!-- Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Darker+Grotesque:wght@500;700;800;900&family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet">

<!-- CodeMirror Core & Autocomplete Addons -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.css" />

<!-- Modular CSS Modules Entry Point -->
<link rel="stylesheet" href="css/main.css" />
</head>
<body>

<!-- Bottom-Left Toast Notifications Container -->
<div class="toast-container" id="toast-container"></div>

<!-- Brutalist Topbar Header -->
<header class="topbar">
  <div class="brand-block">
    <img src="logo.png" alt="Jupy" class="logo-img" onerror="this.style.display='none'" />
    <span class="brand-name">JUPY</span>
  </div>

  <div class="title-block">
    <div class="filename-wrapper">
      <input id="filename" class="filename-input" value="Untitled.ipynb" spellcheck="false" autocomplete="off" />
    </div>
    <span class="status" id="status">
      <span class="status-indicator"></span>
      ENV: .JUPY_ENV READY
    </span>
  </div>

  <div class="spacer"></div>

  <div class="topbar-actions">
    <button class="btn btn-warning" id="btn-terminal-toggle">📟 TERMINAL</button>
    <button class="btn btn-secondary" id="btn-theme-toggle" title="Toggle Light/Dark Theme">☀ DARK</button>
    <input type="file" id="file-input" accept=".ipynb" hidden />
    <button class="btn btn-secondary" id="btn-open">OPEN</button>
    <button class="btn btn-secondary" id="btn-save">SAVE</button>
    <button class="btn btn-primary" id="btn-run-all">RUN ALL</button>
  </div>
</header>

<!-- Main Workspace Split Container -->
<div class="app-workspace" id="app-workspace">
  <!-- Left Side: Notebook Cells -->
  <div class="notebook-panel">
    <main class="notebook" id="notebook"></main>
    <div class="add-cell-bottom">
      <button class="add-cell-btn" id="btn-add-bottom">+ CODE CELL</button>
    </div>
  </div>

  <!-- Right Side Split Terminal (Hidden by Default) -->
  <aside class="terminal-panel" id="terminal-panel" hidden>
    <div class="terminal-header">
      <span class="terminal-title">📟 TERMINAL (jupy_venv)</span>
      <button class="action-btn action-danger" id="btn-terminal-close" title="Close Terminal">✕</button>
    </div>
    <div class="terminal-screen" id="terminal-screen">
      <pre class="terminal-output" id="terminal-output"></pre>
      <div class="terminal-input-line">
        <span class="terminal-prompt" id="terminal-prompt-label">(jupy_venv) ❯</span>
        <input type="text" id="terminal-input" class="terminal-input" autocomplete="off" spellcheck="false" placeholder="type command..." />
      </div>
      <div class="terminal-bottom-spacer"></div>
    </div>
  </aside>
</div>

<!-- Real-Time System Resource Monitor Footer Bar -->
<footer class="system-bar-wrapper">
  <div class="system-bar" id="system-bar">
    <div class="sys-item">
      <span class="sys-label">CPU</span>
      <div class="sys-bar-track"><div class="sys-bar-fill" id="cpu-bar-fill" style="width: 0%;"></div></div>
      <span class="sys-val" id="cpu-val">0%</span>
    </div>

    <div class="sys-divider"></div>

    <div class="sys-item">
      <span class="sys-label">RAM</span>
      <div class="sys-bar-track"><div class="sys-bar-fill" id="ram-bar-fill" style="width: 0%;"></div></div>
      <span class="sys-val" id="ram-val">0/0 GB (0%)</span>
    </div>

    <div class="sys-divider"></div>

    <div class="sys-item">
      <span class="sys-label">GPU</span>
      <div class="sys-bar-track"><div class="sys-bar-fill warning" id="gpu-bar-fill" style="width: 0%;"></div></div>
      <span class="sys-val" id="gpu-val">N/A</span>
    </div>
  </div>
</footer>

<!-- Templates -->
<template id="cell-template">
  <div class="cell" tabindex="-1">
    <div class="cell-gutter">
      <button class="run-btn" title="Run cell (Shift+Enter)">▶</button>
      <div class="exec-count">[&nbsp;]</div>
    </div>
    <div class="cell-body">
      <div class="cell-editor"></div>
      <pre class="cell-output" hidden></pre>
    </div>
    <div class="cell-toolbar">
      <button data-action="move-up" class="action-btn" title="Move cell up">↑</button>
      <button data-action="move-down" class="action-btn" title="Move cell down">↓</button>
      <button data-action="delete" class="action-btn action-danger" title="Delete cell">✕</button>
    </div>
  </div>
</template>

<template id="insert-bar-template">
  <div class="insert-bar">
    <div class="insert-line"></div>
    <button class="add-cell-btn add-cell-btn-inline">+ CODE</button>
  </div>
</template>

<!-- Scripts -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.js"></script>
<!-- CodeMirror closebrackets Addon Script -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/edit/closebrackets.min.js"></script>
<script type="module" src="js/app.js"></script>
</body>
</html>
```


---

# File: static\css\codemirror-brutalism.css

```css
/* ==========================================================================
   Brutalism Design System - CodeMirror Theme
   ========================================================================== */

.CodeMirror {
  font-family: "JetBrains Mono", monospace !important;
  font-size: 0.82rem !important;
  line-height: 1.4 !important;
  height: auto !important;
  background: var(--color-surface) !important;
  color: var(--color-text) !important;
  padding: 4px 6px !important;
}

/* Caret & Selection */
.CodeMirror-cursor {
  border-left: 2.5px solid var(--color-primary) !important;
}

.CodeMirror-selected {
  background: var(--color-secondary) !important;
  color: #111827 !important;
}

/* Base Syntax Tokens */
.cm-s-brutalism .cm-keyword { color: var(--color-primary); font-weight: 800; }
.cm-s-brutalism .cm-string { color: var(--color-warning); font-weight: 500; }
.cm-s-brutalism .cm-number { color: var(--color-danger); font-weight: 700; }
.cm-s-brutalism .cm-builtin { color: var(--color-text); font-weight: 800; text-decoration: underline; }
.cm-s-brutalism .cm-variable { color: var(--color-text); font-weight: 500; }
.cm-s-brutalism .cm-operator { color: var(--color-text); font-weight: 800; }
.cm-s-brutalism .cm-comment { color: #6B7280; font-style: italic; }
.cm-s-brutalism .cm-def { color: var(--color-secondary); font-weight: 800; }
.cm-s-brutalism .cm-atom { color: var(--color-success); font-weight: 800; }

/* Dark Mode Tokens */
html[data-theme="dark"] .cm-s-brutalism .cm-comment { color: #9CA3AF; }
html[data-theme="dark"] .cm-s-brutalism .cm-builtin { color: #F9FAFB; }
html[data-theme="dark"] .cm-s-brutalism .cm-variable { color: #F9FAFB; }

@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) .cm-s-brutalism .cm-comment { color: #9CA3AF; }
  html:not([data-theme="light"]) .cm-s-brutalism .cm-builtin { color: #F9FAFB; }
  html:not([data-theme="light"]) .cm-s-brutalism .cm-variable { color: #F9FAFB; }
}
```


---

# File: static\css\main.css

```css
@import "base/variables.css";
@import "components/topbar.css";
@import "components/cells.css";
@import "components/terminal.css";
@import "components/editor.css";
@import "components/system-bar.css";
@import "components/shortcuts-dialog.css"; /* New Import */

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }
body {
  background-color: var(--color-bg-well);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.25;
  display: flex;
  flex-direction: column;
}
```


---

# File: static\css\notebook.css

```css
/* ==========================================================================
   Jupy Brutalism Design System - Split Side Terminal & Compact CSS
   ========================================================================== */

:root {
  --color-primary: #DD614C;
  --color-secondary: #DAA144;
  --color-success: #16A34A;
  --color-warning: #D97706;
  --color-danger: #DC2626;
  --color-surface: #FFFFFF;
  --color-text: #111827;
  --color-bg-well: #F3F4F6;
  --color-border: #111827;
  --color-shadow: #111827;
  
  --rounded-sm: 4px;
  --rounded-md: 6px;
  
  --border-thick: 2px solid var(--color-border);
  --shadow-brutal-sm: 2px 2px 0px var(--color-shadow);
  --shadow-brutal: 3px 3px 0px var(--color-shadow);
  --shadow-brutal-lg: 5px 5px 0px var(--color-shadow);
  
  --font-display: "Darker Grotesque", sans-serif;
  --font-body: "Darker Grotesque", sans-serif;
  --font-mono: "JetBrains Mono", monospace;
}

html[data-theme="dark"] {
  --color-surface: #18181B;
  --color-text: #F9FAFB;
  --color-bg-well: #09090B;
  --color-border: #F9FAFB;
  --color-shadow: #F9FAFB;
}

@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) {
    --color-surface: #18181B;
    --color-text: #F9FAFB;
    --color-bg-well: #09090B;
    --color-border: #F9FAFB;
    --color-shadow: #F9FAFB;
  }
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }

body {
  background-color: var(--color-bg-well);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.25;
  display: flex;
  flex-direction: column;
}

/* Header */
.topbar {
  position: sticky; top: 0; z-index: 200; display: flex; align-items: center; gap: 12px;
  padding: 6px 14px; background: var(--color-surface); border-bottom: var(--border-thick); flex-shrink: 0;
}
.brand-block { display: flex; align-items: center; gap: 8px; }
.logo-img { height: 24px; width: auto; object-fit: contain; }
.brand-name { font-family: var(--font-display); font-size: 1.4rem; font-weight: 900; letter-spacing: -0.02em; color: var(--color-primary); }

.title-block { display: flex; flex-direction: column; gap: 1px; }
.filename-input {
  border: var(--border-thick); border-radius: var(--rounded-sm); background: var(--color-surface);
  font-family: var(--font-display); font-size: 1.1rem; font-weight: 800; color: var(--color-text);
  padding: 1px 6px; box-shadow: 1px 1px 0px var(--color-shadow);
}
.filename-input:focus { outline: none; background: var(--color-secondary); color: #111827; }

.status { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 0.68rem; font-weight: 700; color: var(--color-text); }
.status-indicator { width: 8px; height: 8px; border: 1px solid var(--color-border); background-color: var(--color-success); }

.spacer { flex: 1; }
.topbar-actions { display: flex; align-items: center; gap: 6px; }

/* Buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; border: var(--border-thick);
  border-radius: var(--rounded-sm); padding: 4px 10px; font-family: var(--font-mono); font-size: 0.72rem;
  font-weight: 700; cursor: pointer; box-shadow: var(--shadow-brutal-sm); user-select: none;
}
.btn:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0px var(--color-shadow); }
.btn:active { transform: translate(1px, 1px); box-shadow: 1px 1px 0px var(--color-shadow); }
.btn-secondary { background: var(--color-surface); color: var(--color-text); }
.btn-primary { background: var(--color-primary); color: #FFFFFF; }
.btn-warning { background: var(--color-warning); color: #FFFFFF; }

/* Workspace Split Layout */
.app-workspace { display: flex; flex: 1; width: 100%; height: calc(100vh - 42px); overflow: hidden; position: relative; }
.notebook-panel { flex: 1; overflow-y: auto; padding-bottom: 60px; }
.notebook { max-width: 820px; width: 100%; margin: 0 auto; padding: 16px 12px; }

/* Cell Cards */
.cell {
  display: flex; align-items: stretch; gap: 8px; background: var(--color-surface);
  border: var(--border-thick); border-radius: var(--rounded-md); padding: 8px; margin-bottom: 8px;
  box-shadow: var(--shadow-brutal);
}
.cell.selected { border-top: 4px solid var(--color-secondary); }
.cell.editing { border-left: 6px solid var(--color-primary); }
.cell.running { background: rgba(217, 119, 6, 0.12); }

.cell-gutter { width: 28px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; padding-top: 2px; }

.run-btn {
  width: 24px; height: 24px; border-radius: var(--rounded-sm); border: var(--border-thick);
  background: var(--color-secondary); color: #111827; font-size: 0.7rem; font-weight: 800;
  display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 1px 1px 0px var(--color-shadow);
}
.run-btn:hover { background: var(--color-primary); color: #FFFFFF; }

/* Running / Interrupt Button State */
.cell.running .run-btn { background: var(--color-danger); color: #FFFFFF; }

.exec-count { margin-top: 6px; font-family: var(--font-mono); font-size: 0.68rem; font-weight: 700; }
.cell-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }

.cell-editor { border: var(--border-thick); border-radius: var(--rounded-sm); overflow: hidden; background: var(--color-surface); }
.cell-output {
  padding: 6px 10px; border: var(--border-thick); border-radius: var(--rounded-sm); background: var(--color-surface);
  font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.4; white-space: pre-wrap; word-break: break-word;
  color: var(--color-text); box-shadow: 1px 1px 0px var(--color-shadow);
}
.cell-output .stderr-line { color: var(--color-danger); font-weight: 700; }

.plot-container {
  display: flex; justify-content: center; align-items: center; margin: 4px 0; padding: 8px; background: #FFFFFF;
  border: var(--border-thick); border-radius: var(--rounded-sm); box-shadow: var(--shadow-brutal-sm); overflow-x: auto;
}
.plot-container img.notebook-plot { max-width: 100%; height: auto; border: 1px solid #111827; }

.cell-toolbar { flex-shrink: 0; display: flex; flex-direction: column; gap: 4px; opacity: 0; transition: opacity 0.15s ease; }
.cell:hover .cell-toolbar, .cell.selected .cell-toolbar { opacity: 1; }
.action-btn {
  border: var(--border-thick); background: var(--color-surface); color: var(--color-text); width: 22px; height: 22px;
  border-radius: var(--rounded-sm); font-family: var(--font-mono); font-size: 0.75rem; font-weight: 800;
  display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 1px 1px 0px var(--color-shadow);
}
.action-btn:hover { background: var(--color-secondary); color: #111827; }
.action-danger:hover { background: var(--color-danger); color: #FFFFFF; }

.insert-bar { height: 16px; display: flex; align-items: center; justify-content: center; position: relative; margin: 2px 0; }
.insert-line { position: absolute; left: 16px; right: 16px; height: 2px; background: var(--color-border); opacity: 0; transition: opacity 0.15s ease; }
.add-cell-btn {
  border: var(--border-thick); background: var(--color-surface); color: var(--color-text); font-family: var(--font-mono); font-size: 0.68rem;
  font-weight: 700; padding: 2px 8px; border-radius: var(--rounded-sm); cursor: pointer; box-shadow: 1px 1px 0px var(--color-shadow); z-index: 2;
}
.insert-bar .add-cell-btn { opacity: 0; }
.insert-bar:hover .insert-line, .insert-bar:hover .add-cell-btn, .insert-bar:focus-within .add-cell-btn { opacity: 1; }
.add-cell-btn:hover { background: var(--color-primary); color: #FFFFFF; }

.add-cell-bottom { max-width: 820px; width: 100%; margin: 0 auto; padding: 8px 12px 60px; display: flex; justify-content: center; }
.add-cell-bottom .add-cell-btn { padding: 6px 14px; font-size: 0.75rem; }

/* ==========================================================================
   Right-Side Split Native Terminal
   ========================================================================== */

.terminal-panel {
  width: 480px; min-width: 340px; max-width: 55vw; background: #0C0C0C;
  border-left: var(--border-thick); display: flex; flex-direction: column; height: 100%; flex-shrink: 0; z-index: 100;
}

.terminal-header {
  padding: 6px 12px; background: var(--color-primary); border-bottom: var(--border-thick);
  display: flex; align-items: center; justify-content: space-between;
}

.terminal-title { font-family: var(--font-mono); font-size: 0.75rem; font-weight: 800; color: #FFFFFF; letter-spacing: 0.04em; }

.terminal-screen {
  flex: 1; padding: 12px; overflow-y: auto; background: #0C0C0C; cursor: text;
  display: flex; flex-direction: column; gap: 4px;
}

.terminal-output {
  font-family: var(--font-mono); font-size: 0.85rem; line-height: 1.4; color: #34D399;
  white-space: pre-wrap; word-break: break-all;
}

.terminal-input-line {
  display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 0.85rem;
}

.terminal-prompt {
  color: var(--color-secondary); font-weight: 800; white-space: nowrap;
}

.terminal-input {
  flex: 1; border: none; background: transparent; font-family: var(--font-mono); font-size: 0.85rem;
  color: #F9FAFB; outline: none; caret-color: #34D399;
}

/* Footer Hint Bar */
.hint-bar-wrapper { position: fixed; bottom: 8px; left: 0; right: 0; display: flex; justify-content: center; z-index: 100; pointer-events: none; }
.hint-bar {
  pointer-events: auto; padding: 4px 12px; border: var(--border-thick); border-radius: var(--rounded-sm);
  background: var(--color-surface); box-shadow: var(--shadow-brutal);
  font-family: var(--font-mono); font-size: 0.68rem; font-weight: 700; color: var(--color-text);
  display: flex; gap: 12px; align-items: center;
}
kbd { background: var(--color-secondary); border: 1px solid var(--color-border); border-radius: 2px; padding: 1px 4px; font-family: var(--font-mono); font-size: 0.65rem; font-weight: 800; color: #111827; }
```


---

# File: static\css\base\variables.css

```css
:root {
  --color-primary: #DD614C;
  --color-secondary: #DAA144;
  --color-success: #16A34A;
  --color-warning: #D97706;
  --color-danger: #DC2626;
  --color-surface: #FFFFFF;
  --color-text: #111827;
  --color-bg-well: #F3F4F6;
  --color-border: #111827;
  --color-shadow: #111827;
  
  --rounded-sm: 4px;
  --rounded-md: 6px;
  
  --border-thick: 2px solid var(--color-border);
  --shadow-brutal-sm: 2px 2px 0px var(--color-shadow);
  --shadow-brutal: 3px 3px 0px var(--color-shadow);
  --shadow-brutal-lg: 5px 5px 0px var(--color-shadow);
  
  --font-display: "Darker Grotesque", sans-serif;
  --font-body: "Darker Grotesque", sans-serif;
  --font-mono: "JetBrains Mono", monospace;
}

html[data-theme="dark"] {
  --color-surface: #18181B;
  --color-text: #F9FAFB;
  --color-bg-well: #09090B;
  --color-border: #F9FAFB;
  --color-shadow: #F9FAFB;
}

@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) {
    --color-surface: #18181B;
    --color-text: #F9FAFB;
    --color-bg-well: #09090B;
    --color-border: #F9FAFB;
    --color-shadow: #F9FAFB;
  }
}
```


---

# File: static\css\components\cells.css

```css
/* ==========================================================================
   Jupy Brutalism Design System - Cells & Output Styling
   ========================================================================== */

.app-workspace {
  display: flex;
  flex: 1;
  width: 100%;
  height: calc(100vh - 42px);
  overflow: hidden;
  position: relative;
}

.notebook-panel {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 60px;
}

.notebook {
  max-width: 820px;
  width: 100%;
  margin: 0 auto;
  padding: 16px 12px;
}

/* Cell Card Container */
.cell {
  display: flex;
  align-items: stretch;
  gap: 8px;
  background: var(--color-surface);
  border: var(--border-thick);
  border-radius: var(--rounded-md);
  padding: 8px;
  margin-bottom: 8px;
  box-shadow: var(--shadow-brutal);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.cell.selected {
  border-top: 4px solid var(--color-secondary); /* Ochre Yellow #DAA144 */
}

.cell.editing {
  border-left: 6px solid var(--color-primary); /* Terracotta #DD614C */
}

/* Running Cell State */
.cell.running {
  border-left: 6px solid var(--color-primary);
  background: rgba(221, 97, 76, 0.08);
}

/* Queued / Pending Cell State */
.cell.queued {
  border-left: 6px solid var(--color-secondary);
  background: rgba(218, 161, 68, 0.08);
}

.cell.queued .exec-count {
  color: var(--color-secondary);
  font-weight: 800;
}

/* Cell Gutter & Execution Controls */
.cell-gutter {
  width: 28px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 2px;
}

.run-btn {
  width: 24px;
  height: 24px;
  border-radius: var(--rounded-sm);
  border: var(--border-thick);
  background: var(--color-secondary);
  color: #111827;
  font-size: 0.7rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 1px 1px 0px var(--color-shadow);
  transition: transform 0.1s ease;
}

.run-btn:hover {
  background: var(--color-primary);
  color: #FFFFFF;
}

.cell.running .run-btn {
  background: var(--color-danger);
  color: #FFFFFF;
}

.exec-count {
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
}

.cell-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cell-editor {
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  overflow: hidden;
  background: var(--color-surface);
}

/* Scrollable Cell Output (Capped at 480px) */
.cell-output {
  padding: 6px 10px;
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  background: var(--color-surface);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text);
  box-shadow: 1px 1px 0px var(--color-shadow);
  max-height: 480px;
  overflow-y: auto;
}

.cell-output .stderr-line {
  color: var(--color-danger);
  font-weight: 700;
}

/* Interactive Stdin Input Container */
.cell-stdin-prompt {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  padding: 6px 10px;
  background: var(--color-surface);
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  box-shadow: var(--shadow-brutal-sm);
}

.stdin-label {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--color-primary);
  white-space: nowrap;
}

.stdin-input {
  flex: 1;
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  background: var(--color-bg-well);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-text);
  padding: 3px 8px;
  outline: none;
}

.stdin-input:focus {
  border-color: var(--color-secondary);
  background: var(--color-surface);
}

/* Single Column Stacked Plot Container */
.cell-plots-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 8px 0;
  width: 100%;
}

.plot-container {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px;
  background: #FFFFFF;
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  box-shadow: var(--shadow-brutal-sm);
  box-sizing: border-box;
}

.plot-container img.notebook-plot {
  width: 100%;
  height: auto;
  max-width: 100%;
  object-fit: contain;
  display: block;
}

/* Cell Side Toolbar */
.cell-toolbar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.cell:hover .cell-toolbar,
.cell.selected .cell-toolbar {
  opacity: 1;
}

.action-btn {
  border: var(--border-thick);
  background: var(--color-surface);
  color: var(--color-text);
  width: 22px;
  height: 22px;
  border-radius: var(--rounded-sm);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 1px 1px 0px var(--color-shadow);
}

.action-btn:hover {
  background: var(--color-secondary);
  color: #111827;
}

.action-danger:hover {
  background: var(--color-danger);
  color: #FFFFFF;
}

/* Inline Add Cell Dividers */
.insert-bar {
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin: 2px 0;
}

.insert-line {
  position: absolute;
  left: 16px;
  right: 16px;
  height: 2px;
  background: var(--color-border);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.add-cell-btn {
  border: var(--border-thick);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--rounded-sm);
  cursor: pointer;
  box-shadow: 1px 1px 0px var(--color-shadow);
  z-index: 2;
}

.insert-bar .add-cell-btn { opacity: 0; }
.insert-bar:hover .insert-line,
.insert-bar:hover .add-cell-btn,
.insert-bar:focus-within .add-cell-btn {
  opacity: 1;
}

.add-cell-btn:hover {
  background: var(--color-primary);
  color: #FFFFFF;
}

.add-cell-bottom {
  max-width: 820px;
  width: 100%;
  margin: 0 auto;
  padding: 8px 12px 60px;
  display: flex;
  justify-content: center;
}

.add-cell-bottom .add-cell-btn {
  padding: 6px 14px;
  font-size: 0.75rem;
}

/* Bottom-Left Brutalist Toast Notifications */
.toast-container {
  position: fixed;
  bottom: 12px;
  left: 14px;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
}

.toast-message {
  pointer-events: auto;
  padding: 6px 12px;
  background: var(--color-secondary); /* Ochre Yellow #DAA144 */
  color: #111827;
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  box-shadow: var(--shadow-brutal-sm);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  animation: toastIn 0.15s ease-out;
  transition: opacity 0.15s ease;
}

.toast-message.danger {
  background: var(--color-danger);
  color: #FFFFFF;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```


---

# File: static\css\components\editor.css

```css
/* CodeMirror Syntax Theme */
.CodeMirror {
  font-family: "JetBrains Mono", monospace !important;
  font-size: 0.82rem !important;
  line-height: 1.4 !important;
  height: auto !important;
  background: var(--color-surface) !important;
  color: var(--color-text) !important;
  padding: 4px 6px !important;
}

.CodeMirror-cursor { border-left: 2.5px solid var(--color-primary) !important; }
.CodeMirror-selected { background: var(--color-secondary) !important; color: #111827 !important; }

.cm-s-brutalism .cm-keyword { color: var(--color-primary); font-weight: 800; }
.cm-s-brutalism .cm-string { color: var(--color-warning); font-weight: 500; }
.cm-s-brutalism .cm-number { color: var(--color-danger); font-weight: 700; }
.cm-s-brutalism .cm-builtin { color: var(--color-text); font-weight: 800; text-decoration: underline; }
.cm-s-brutalism .cm-variable { color: var(--color-text); font-weight: 500; }
.cm-s-brutalism .cm-operator { color: var(--color-text); font-weight: 800; }
.cm-s-brutalism .cm-comment { color: #6B7280; font-style: italic; }
.cm-s-brutalism .cm-def { color: var(--color-secondary); font-weight: 800; }
.cm-s-brutalism .cm-atom { color: var(--color-success); font-weight: 800; }

/* ==========================================================================
   Brutalism Autocomplete Dropdown Popup
   ========================================================================== */

.CodeMirror-hints {
  position: absolute;
  z-index: 99999 !important;
  background: var(--color-surface) !important;
  border: var(--border-thick) !important;
  border-radius: var(--rounded-sm) !important;
  box-shadow: var(--shadow-brutal-lg) !important;
  font-family: var(--font-mono) !important;
  font-size: 0.78rem !important;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px 0;
  min-width: 220px;
}

.CodeMirror-hint {
  padding: 4px 10px !important;
  color: var(--color-text) !important;
  cursor: pointer;
  border-bottom: 1px solid var(--color-bg-well);
}

.CodeMirror-hint-active {
  background: var(--color-secondary) !important; /* Ochre Yellow #DAA144 */
  color: #111827 !important;
  font-weight: 800;
}

.CodeMirror-hint-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

.CodeMirror-hint .hint-name {
  font-family: var(--font-mono);
  font-size: 0.78rem;
}

.CodeMirror-hint .hint-type {
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
  padding: 1px 4px;
  border-radius: 2px;
  background: var(--color-primary);
  color: #FFFFFF;
  letter-spacing: 0.03em;
}
```


---

# File: static\css\components\shortcuts-dialog.css

```css
/* ==========================================================================
   Jupy Keyboard Shortcuts Help Dialog - Brutalist Design System
   ========================================================================== */

.shortcuts-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: fadeIn 0.15s ease-out;
}

.shortcuts-modal {
  width: 100%;
  max-width: 680px;
  background: var(--color-surface);
  border: var(--border-thick);
  border-radius: var(--rounded-md);
  box-shadow: var(--shadow-brutal-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--color-text);
}

.shortcuts-header {
  background: var(--color-primary); /* Terracotta #DD614C */
  padding: 10px 14px;
  border-bottom: var(--border-thick);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.shortcuts-title {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 800;
  color: #FFFFFF;
  letter-spacing: 0.05em;
}

.shortcuts-body {
  display: flex;
  gap: 16px;
  padding: 16px;
  overflow-y: auto;
  background: var(--color-surface);
}

.shortcuts-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shortcuts-column h3 {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 800;
  border-bottom: var(--border-thick);
  padding-bottom: 4px;
  margin-bottom: 6px;
  color: var(--color-primary);
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
}

.shortcut-row span {
  margin-left: auto;
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text);
}

.close-btn {
  border: var(--border-thick);
  background: var(--color-surface);
  color: var(--color-text);
  width: 24px;
  height: 24px;
  font-size: 0.75rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-brutal-sm);
}

.close-btn:hover {
  background: var(--color-secondary);
  color: #111827;
}
```


---

# File: static\css\components\system-bar.css

```css
/* ==========================================================================
   Jupy Brutalism Design System - Real-Time System Resource Footer Bar
   ========================================================================== */

.system-bar-wrapper {
  position: fixed;
  bottom: 12px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999 !important;
  pointer-events: none;
}

.system-bar {
  pointer-events: auto;
  padding: 6px 16px;
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-brutal-lg);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  display: flex;
  gap: 16px;
  align-items: center;
}

.sys-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sys-label {
  font-weight: 800;
  color: var(--color-primary); /* Terracotta #DD614C */
  letter-spacing: 0.05em;
}

.sys-bar-track {
  width: 60px;
  height: 10px;
  background: var(--color-bg-well);
  border: 1.5px solid var(--color-border);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.sys-bar-fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.8s ease-out; /* Smooth transition for 5-second updates */
}

.sys-bar-fill.warning {
  background: var(--color-secondary); /* Ochre Yellow #DAA144 */
}

.sys-val {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
  color: var(--color-text);
}

.sys-divider {
  width: 2px;
  height: 14px;
  background: var(--color-border);
}
```


---

# File: static\css\components\terminal.css

```css
/* ==========================================================================
   Jupy Brutalism Design System - Split Terminal Drawer (Yellow Prompt & 80% Max Height)
   ========================================================================== */

.terminal-panel[hidden],
[hidden] {
  display: none !important;
}

.terminal-panel {
  width: 480px;
  min-width: 340px;
  max-width: 55vw;
  background: #09090B;
  border-left: var(--border-thick);
  display: flex;
  flex-direction: column;
  height: 100%;
  flex-shrink: 0;
  z-index: 100;
}

.terminal-header {
  padding: 6px 12px;
  background: var(--color-primary);
  border-bottom: var(--border-thick);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.terminal-title {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 800;
  color: #FFFFFF;
  letter-spacing: 0.04em;
}

.terminal-screen {
  flex: 1;
  max-height: 80vh; /* Limits screen to 80% height */
  padding: 12px 14px 0 14px;
  overflow-y: auto;
  background: #09090B;
  cursor: text;
  display: flex;
  flex-direction: column;
  font-family: var(--font-mono);
}

.terminal-output {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  line-height: 1.45;
  color: #F9FAFB;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
}

.terminal-input-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 0.82rem;
}

/* Yellow Ochre Prompt (#DAA144) */
.terminal-prompt {
  color: var(--color-secondary);
  font-weight: 800;
  white-space: nowrap;
}

.terminal-input {
  flex: 1;
  border: none;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: #F9FAFB;
  outline: none;
  caret-color: #F9FAFB;
  padding: 0;
  margin: 0;
}

/* Keeps bottom 20% area permanently free */
.terminal-bottom-spacer {
  height: 20vh;
  flex-shrink: 0;
}
```


---

# File: static\css\components\topbar.css

```css
.topbar {
  position: sticky; top: 0; z-index: 200; display: flex; align-items: center; gap: 12px;
  padding: 6px 14px; background: var(--color-surface); border-bottom: var(--border-thick); flex-shrink: 0;
}
.brand-block { display: flex; align-items: center; gap: 8px; }
.logo-img { height: 24px; width: auto; object-fit: contain; }
.brand-name { font-family: var(--font-display); font-size: 1.4rem; font-weight: 900; letter-spacing: -0.02em; color: var(--color-primary); }

.title-block { display: flex; flex-direction: column; gap: 1px; }
.filename-input {
  border: var(--border-thick); border-radius: var(--rounded-sm); background: var(--color-surface);
  font-family: var(--font-display); font-size: 1.1rem; font-weight: 800; color: var(--color-text);
  padding: 1px 6px; box-shadow: 1px 1px 0px var(--color-shadow);
}
.filename-input:focus { outline: none; background: var(--color-secondary); color: #111827; }

.status { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 0.68rem; font-weight: 700; color: var(--color-text); }
.status-indicator { width: 8px; height: 8px; border: 1px solid var(--color-border); background-color: var(--color-success); }

.spacer { flex: 1; }
.topbar-actions { display: flex; align-items: center; gap: 6px; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; border: var(--border-thick);
  border-radius: var(--rounded-sm); padding: 4px 10px; font-family: var(--font-mono); font-size: 0.72rem;
  font-weight: 700; cursor: pointer; box-shadow: var(--shadow-brutal-sm); user-select: none;
}
.btn:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0px var(--color-shadow); }
.btn:active { transform: translate(1px, 1px); box-shadow: 1px 1px 0px var(--color-shadow); }
.btn-secondary { background: var(--color-surface); color: var(--color-text); }
.btn-primary { background: var(--color-primary); color: #FFFFFF; }
.btn-warning { background: var(--color-warning); color: #FFFFFF; }
```


---

# File: static\js\app.js

```js
/**
 * app.js
 * Application entry point. Looks up every DOM node, wires the feature
 * modules together, and boots the notebook. This replaces the big IIFE that
 * used to live at the top of static/js/notebook.js — that file is now split
 * across cells/, notebook/, core/, etc., and this is the file that plugs
 * them back into the page.
 *
 * BUG FIX: `filenameInput` and `fileInput` were looked up in the old
 * notebook.js but never actually used — the OPEN and SAVE toolbar buttons,
 * and the "+ CODE CELL" button at the bottom of the notebook, had no click
 * handlers at all. They're wired up below via notebook/notebookFile.js.
 *
 * ASSUMPTION: the compiled `js/` bundle this refactor was done from only
 * contained .js files, not index.html, so the exact ids of the Open/Save/
 * bottom-add-cell buttons weren't available. `btn-open`, `btn-save`, and
 * `btn-add-cell` below are a best guess following the existing `btn-*`
 * naming convention (btn-run-all, btn-theme-toggle, btn-terminal-toggle,
 * ...) — update these three `getElementById` calls if your index.html uses
 * different ids.
 */
import { initTheme } from './theme/theme.js';
import { initMetricsStream } from './metrics/metrics.js';
import { ReconnectingSocket } from './core/socket.js';
import { createToaster } from './core/toast.js';
import { setupTerminal } from './terminal/terminal.js';
import { registerAutocomplete } from './autocomplete/autocomplete.js';
import { initShortcuts } from './shortcuts/shortcuts.js';
import { createNotebookController } from './notebook/notebookController.js';
import { downloadNotebook, parseNotebookFile, readFileAsText } from './notebook/notebookFile.js';

(() => {
  const container = document.getElementById('notebook');
  const filenameInput = document.getElementById('filename');
  const fileInput = document.getElementById('file-input');
  const openBtn = document.getElementById('btn-open');
  const saveBtn = document.getElementById('btn-save');
  const addCellBtn = document.getElementById('btn-add-cell');
  const runAllBtn = document.getElementById('btn-run-all');
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  const toastContainer = document.getElementById('toast-container');

  const terminalPanel = document.getElementById('terminal-panel');
  const terminalToggleBtn = document.getElementById('btn-terminal-toggle');
  const terminalCloseBtn = document.getElementById('btn-terminal-close');
  const terminalScreen = document.getElementById('terminal-screen');
  const terminalOutput = document.getElementById('terminal-output');
  const terminalInput = document.getElementById('terminal-input');
  const terminalPromptLabel = document.getElementById('terminal-prompt-label');

  const cellTemplate = document.getElementById('cell-template');
  const insertBarTemplate = document.getElementById('insert-bar-template');

  const showToast = createToaster(toastContainer);

  initTheme(themeToggleBtn);
  initMetricsStream();

  // `notebook` and `runSocket` are mutually dependent (the controller needs
  // the socket to send run requests; the socket's onMessage needs the
  // controller to dispatch incoming run output) — start `notebook` as a
  // mutable binding so the socket's callback can close over it and pick up
  // the real value once it's assigned just below.
  let notebook = null;

  const runSocket = new ReconnectingSocket('/ws/run', {
    onMessage: (data) => notebook?.handleRunMessage(data),
    onClose: () => showToast('⚠️ KERNEL CONNECTION LOST — RECONNECTING…', 'danger'),
  });

  notebook = createNotebookController({
    container,
    templates: { cellTemplate, insertBarTemplate },
    runSocket,
    showToast,
    registerAutocomplete,
  });

  setupTerminal(
    terminalToggleBtn,
    terminalCloseBtn,
    terminalPanel,
    terminalScreen,
    terminalOutput,
    terminalInput,
    terminalPromptLabel,
    () => setTimeout(() => notebook.refreshAllEditors(), 50)
  );

  initShortcuts(notebook);

  runAllBtn.addEventListener('click', () => notebook.runAll());

  addCellBtn?.addEventListener('click', () => {
    notebook.insertCellAt(notebook.getCells().length, '', { focus: true });
  });

  // --- Open / Save (.ipynb) — previously dead DOM lookups, now wired up. ---
  saveBtn?.addEventListener('click', () => {
    downloadNotebook(notebook.getCells(), filenameInput?.value);
  });

  openBtn?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    try {
      const text = await readFileAsText(file);
      const sources = parseNotebookFile(text);
      notebook.loadNotebook(sources); // also selects the first loaded cell
      if (filenameInput) filenameInput.value = file.name.replace(/\.ipynb$/, '');
      showToast('📂 NOTEBOOK LOADED', 'success');
    } catch (err) {
      console.error('Failed to open notebook:', err);
      showToast('⚠️ FAILED TO OPEN NOTEBOOK — INVALID .ipynb FILE', 'danger');
    } finally {
      fileInput.value = '';
    }
  });

  // Demo initial cell. insertCellAt() already selects it, so no separate
  // selectCell() call is needed afterward.
  notebook.insertCellAt(0, [
    '# JUPY - COLAB & JUPYTER SHORTCUTS INTEGRATION',
    '# Press Ctrl + Shift + ? to open the Help Dialog!',
    '# Press Ctrl + / inside CodeMirror to toggle comments!',
    'import time',
    'print("Press Ctrl + Shift + ? to view all keyboard shortcuts!")',
  ].join('\n'));
})();
```


---

# File: static\js\filename.py

```py
import os
import os
from datetime import datetime

def combine_files_to_markdown(output_filename="files.md"):
    # Get the directory where the script is located
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(current_dir, output_filename)
    
    # Get total file count for the frontmatter metadata
    total_files = 0
    for root, dirs, files in os.walk(current_dir):
        for file in files:
            if os.path.join(root, file) != output_path:
                total_files += 1

    with open(output_path, "w", encoding="utf-8") as outfile:
        # 1. Write YAML Frontmatter
        outfile.write("---\n")
        outfile.write(f"title: Folder Code Compilation\n")
        outfile.write(f"date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        outfile.write(f"root_folder: \"{os.path.basename(current_dir)}\"\n")
        outfile.write(f"total_compiled_files: {total_files}\n")
        outfile.write("---\n\n")
        
        # 2. Walk through all directories and files
        for root, dirs, files in os.walk(current_dir):
            for file in files:
                file_path = os.path.join(root, file)
                
                # Skip the output file itself
                if file_path == output_path:
                    continue
                    
                relative_path = os.path.relpath(file_path, current_dir)
                
                # Write the file location header
                outfile.write(f"# File: {relative_path}\n\n")
                
                try:
                    with open(file_path, "r", encoding="utf-8", errors="replace") as infile:
                        content = infile.read()
                        outfile.write(content)
                except Exception as e:
                    outfile.write(f"*Error reading this file: {str(e)}*")
                
                # Add spacing between files
                outfile.write("\n\n---\n\n")
                
    print(f"Successfully created {output_filename} with YAML frontmatter.")

if __name__ == "__main__":
    combine_files_to_markdown()


```


---

# File: static\js\autocomplete\autocomplete.js

```js
/**
 * autocomplete/autocomplete.js
 * Wires a CodeMirror instance up to Jupy's `/api/complete` endpoint.
 *
 * BUG FIX: the previous implementation kept its debounce timer and in-flight
 * AbortController in module-level variables shared by *every* cell. Typing in
 * one cell and quickly switching to another within the debounce window could
 * cancel or clobber the other cell's pending completion request. Both pieces
 * of state are now created fresh inside `registerAutocomplete()`, so each
 * CodeMirror instance gets its own private closure over them.
 */
import { AUTOCOMPLETE_DEBOUNCE_MS } from '../config/constants.js';

const IGNORED_KEYS = new Set([
  'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Shift', 'Tab', 'Backspace', ' ',
]);

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function registerAutocomplete(cm) {
  let debounceTimer = null;
  let activeAbortController = null;

  function triggerHint(editor) {
    CodeMirror.showHint(editor, fetchCompletions, {
      async: true,
      completeSingle: false,
      closeOnUnfocus: true,
    });
  }

  function fetchCompletions(editor, callback) {
    const cursor = editor.getCursor();
    const code = editor.getValue();

    // Abort any still-in-flight request from this same editor before starting a new one.
    if (activeAbortController) activeAbortController.abort();
    activeAbortController = new AbortController();

    fetch('/api/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: activeAbortController.signal,
      body: JSON.stringify({ code, line: cursor.line + 1, column: cursor.ch }),
    })
      .then((resp) => resp.json())
      .then((data) => {
        const list = data.completions || [];
        if (list.length === 0) {
          callback(null);
          return;
        }

        const token = editor.getTokenAt(cursor);
        let start = token.start;
        const end = cursor.ch;

        if (token.string === '.' || !IDENTIFIER_RE.test(token.string)) {
          start = cursor.ch;
        }

        callback({
          list: list.map((item) => ({
            text: item.text,
            displayText: item.text,
            render: (element) => {
              const row = document.createElement('div');
              row.className = 'CodeMirror-hint-item';

              const nameSpan = document.createElement('span');
              nameSpan.className = 'hint-name';
              nameSpan.textContent = item.text;

              const badge = document.createElement('span');
              badge.className = 'hint-type';
              badge.textContent = (item.type || 'def').slice(0, 5);

              row.appendChild(nameSpan);
              row.appendChild(badge);
              element.appendChild(row);
            },
          })),
          from: CodeMirror.Pos(cursor.line, start),
          to: CodeMirror.Pos(cursor.line, end),
        });
      })
      .catch((err) => {
        // Suppress errors caused by our own abort() calls above.
        if (err.name !== 'AbortError') callback(null);
      });
  }

  // Ctrl+Space / Cmd+Space trigger instantly, bypassing the debounce.
  cm.addKeyMap({
    'Ctrl-Space': (editor) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      triggerHint(editor);
    },
    'Cmd-Space': (editor) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      triggerHint(editor);
    },
  });

  cm.on('keyup', (editor, event) => {
    // Exclude navigation, control keys, enter, backspace, and escape.
    if (event.ctrlKey || event.metaKey || event.altKey || IGNORED_KEYS.has(event.key)) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      return;
    }

    const cursor = editor.getCursor();
    const token = editor.getTokenAt(cursor);

    if (token.type === 'comment' || token.type === 'string') {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      return;
    }

    const isDot = event.key === '.';
    const isWord = token.string.trim().length >= 1 && IDENTIFIER_RE.test(token.string);

    if (isDot || isWord) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => triggerHint(editor), AUTOCOMPLETE_DEBOUNCE_MS);
    } else if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  });
}
```


---

# File: static\js\cells\cellFactory.js

```js
/**
 * cells/cellFactory.js
 * Builds a single cell's DOM (from the <template> tags) and its CodeMirror
 * instance, and wires up all of the cell-local UI events. Holds no shared
 * state of its own — all cross-cell state (selection, execution order, etc.)
 * lives in notebook/notebookController.js and is exposed to this factory via
 * the `hooks` callbacks below.
 */
import { moveLineUp, moveLineDown, toggleComment } from './editorCommands.js';

/**
 * @param {string} id
 * @param {string} source - initial code
 * @param {{cellTemplate: HTMLTemplateElement, insertBarTemplate: HTMLTemplateElement}} templates
 * @param {object} hooks
 * @param {(id: string, opts: object) => void} hooks.onRun
 * @param {(id: string) => void} hooks.onRunButtonClick
 * @param {(id: string, delta: number) => void} hooks.onMove
 * @param {(id: string) => void} hooks.onDelete
 * @param {(id: string) => void} hooks.onSelect
 * @param {(id: string) => void} hooks.onEnterEdit
 * @param {(id: string) => void} hooks.onExitEdit
 * @param {(id: string) => void} hooks.onInsertAfter
 * @param {(cm: any) => void} registerAutocomplete
 */
export function createCell(id, source, templates, hooks, registerAutocomplete) {
  const { cellTemplate, insertBarTemplate } = templates;

  const frag = cellTemplate.content.cloneNode(true);
  const root = frag.querySelector('.cell');
  const runBtn = frag.querySelector('.run-btn');
  const execCountEl = frag.querySelector('.exec-count');
  const editorHost = frag.querySelector('.cell-editor');
  const outputEl = frag.querySelector('.cell-output');
  const toolbar = frag.querySelector('.cell-toolbar');

  const barFrag = insertBarTemplate.content.cloneNode(true);
  const insertBar = barFrag.querySelector('.insert-bar');

  const cell = {
    id,
    execCount: null,
    outputs: [],
    dom: { root, runBtn, execCountEl, editorHost, outputEl, toolbar, insertBar },
  };

  const cm = CodeMirror(editorHost, {
    value: source,
    mode: 'python',
    theme: 'brutalism',
    lineNumbers: false,
    viewportMargin: Infinity,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    autoCloseBrackets: true,
    extraKeys: {
      'Shift-Enter': () => hooks.onRun(cell.id, { advance: true }),
      'Ctrl-Enter': () => hooks.onRun(cell.id, { advance: false }),
      'Cmd-Enter': () => hooks.onRun(cell.id, { advance: false }),
      'Alt-Enter': () => hooks.onRun(cell.id, { insertBelow: true }),
      Esc: () => hooks.onExitEdit(cell.id),
      // Edit Mode line shuffling shortcuts
      'Alt-Up': (editor) => moveLineUp(editor),
      'Alt-Down': (editor) => moveLineDown(editor),
      // Native commenting toggle
      'Ctrl-/': (editor) => toggleComment(editor),
      'Cmd-/': (editor) => toggleComment(editor),
    },
  });
  cell.cm = cm;

  registerAutocomplete(cm);

  cm.on('focus', () => hooks.onEnterEdit(cell.id));
  root.addEventListener('click', (e) => {
    if (!editorHost.contains(e.target)) hooks.onSelect(cell.id);
  });

  runBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hooks.onRunButtonClick(cell.id);
  });

  toolbar.querySelector('[data-action="move-up"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hooks.onMove(cell.id, -1);
  });
  toolbar.querySelector('[data-action="move-down"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hooks.onMove(cell.id, 1);
  });
  toolbar.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hooks.onDelete(cell.id);
  });

  insertBar.querySelector('.add-cell-btn').addEventListener('click', () => {
    hooks.onInsertAfter(cell.id);
  });

  return cell;
}
```


---

# File: static\js\cells\cellOutput.js

```js
/**
 * cells/cellOutput.js
 * Rendering of a cell's stdout/stderr text, matplotlib plots, and interactive
 * stdin prompts into its output pane.
 */
import { MAX_CELL_OUTPUT_LINES } from '../config/constants.js';

export function clearCellOutput(cell) {
  cell.outputs = [];
  cell.dom.outputEl.hidden = true;
  cell.dom.outputEl.innerHTML = '';
}

export function appendCellOutput(cell, text, kind) {
  cell.dom.outputEl.hidden = false;

  const span = document.createElement('span');
  if (kind === 'stderr') span.className = 'stderr-line';
  span.textContent = text + '\n';
  cell.dom.outputEl.appendChild(span);
  cell.outputs.push({ kind, text });

  const spans = cell.dom.outputEl.querySelectorAll('span');
  if (spans.length > MAX_CELL_OUTPUT_LINES) {
    const overflow = spans.length - MAX_CELL_OUTPUT_LINES;
    for (let i = 0; i < overflow; i++) {
      spans[i].remove();
    }
  }

  requestAnimationFrame(() => {
    cell.dom.outputEl.scrollTop = cell.dom.outputEl.scrollHeight;
  });
}

export function appendCellPlot(cell, htmlString) {
  if (!htmlString || !htmlString.trim()) return;

  cell.dom.outputEl.hidden = false;

  let plotsWrapper = cell.dom.outputEl.querySelector('.cell-plots-wrapper');
  if (!plotsWrapper) {
    plotsWrapper = document.createElement('div');
    plotsWrapper.className = 'cell-plots-wrapper';
    cell.dom.outputEl.appendChild(plotsWrapper);
  }

  const div = document.createElement('div');
  div.className = 'plot-container';
  div.innerHTML = htmlString;
  plotsWrapper.appendChild(div);

  cell.outputs.push({ kind: 'plot', text: htmlString });

  requestAnimationFrame(() => {
    cell.dom.outputEl.scrollTop = cell.dom.outputEl.scrollHeight;
  });
}

/**
 * Renders an inline `input()` prompt inside the cell's output pane.
 * @param {*} cell
 * @param {string} promptText
 * @param {(value: string) => void} onSubmit - called with the typed value
 */
export function appendCellStdinPrompt(cell, promptText, onSubmit) {
  cell.dom.outputEl.hidden = false;
  const box = document.createElement('div');
  box.className = 'cell-stdin-prompt';

  const label = document.createElement('span');
  label.className = 'stdin-label';
  label.textContent = promptText || 'Input:';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'stdin-input';
  input.placeholder = 'Type response and press Enter...';
  input.autocomplete = 'off';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn btn-primary stdin-submit-btn';
  submitBtn.textContent = 'SUBMIT';

  function submit() {
    const val = input.value;
    box.remove();
    appendCellOutput(cell, (promptText ? promptText + ' ' : '') + val, 'stdout');
    onSubmit(val);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  submitBtn.addEventListener('click', submit);

  box.appendChild(label);
  box.appendChild(input);
  box.appendChild(submitBtn);
  cell.dom.outputEl.appendChild(box);

  requestAnimationFrame(() => {
    cell.dom.outputEl.scrollTop = cell.dom.outputEl.scrollHeight;
    input.focus();
  });
}
```


---

# File: static\js\cells\editorCommands.js

```js
/**
 * cells/editorCommands.js
 * Stateless CodeMirror editing helpers shared by every cell's key bindings.
 */

export function moveLineUp(cm) {
  const cursor = cm.getCursor();
  const line = cursor.line;
  if (line === 0) return;
  const text = cm.getLine(line);
  const prevText = cm.getLine(line - 1);
  cm.replaceRange(text + '\n' + prevText, { line: line - 1, ch: 0 }, { line, ch: cm.getLine(line).length });
  cm.setCursor({ line: line - 1, ch: cursor.ch });
}

export function moveLineDown(cm) {
  const cursor = cm.getCursor();
  const line = cursor.line;
  if (line === cm.lineCount() - 1) return;
  const text = cm.getLine(line);
  const nextText = cm.getLine(line + 1);
  cm.replaceRange(nextText + '\n' + text, { line, ch: 0 }, { line: line + 1, ch: cm.getLine(line + 1).length });
  cm.setCursor({ line: line + 1, ch: cursor.ch });
}

/** Toggles a Python `#` line comment across the current selection (Ctrl+/ / Cmd+/). */
export function toggleComment(cm) {
  const from = cm.getCursor('from');
  const to = cm.getCursor('to');
  const lineStart = from.line;
  const lineEnd = to.line;

  cm.operation(() => {
    let allCommented = true;

    for (let i = lineStart; i <= lineEnd; i++) {
      const lineText = cm.getLine(i);
      if (lineText.trim() !== '' && !lineText.trim().startsWith('#')) {
        allCommented = false;
        break;
      }
    }

    if (allCommented) {
      // Uncomment: strip a leading '#' plus one optional following space.
      for (let i = lineStart; i <= lineEnd; i++) {
        const lineText = cm.getLine(i);
        const match = lineText.match(/^(\s*)#\s?/);
        if (match) {
          const spaces = match[1];
          const stripped = lineText.substring(match[0].length);
          cm.replaceRange(spaces + stripped, { line: i, ch: 0 }, { line: i, ch: lineText.length });
        }
      }
    } else {
      // Comment: prepend '# ', skipping blank lines.
      for (let i = lineStart; i <= lineEnd; i++) {
        const lineText = cm.getLine(i);
        if (lineText.trim() === '') continue;
        cm.replaceRange('# ' + lineText, { line: i, ch: 0 }, { line: i, ch: lineText.length });
      }
    }
  });
}
```


---

# File: static\js\config\constants.js

```js
/**
 * config/constants.js
 * Shared timing, sizing, and networking constants for the Jupy front-end.
 * Centralised here so magic numbers aren't scattered across feature modules.
 */

// Double-tap window for the "D D" (delete), "I I" (interrupt), "0 0" (restart) shortcuts.
export const DOUBLE_TAP_WINDOW_MS = 600;

// Debounce before firing an autocomplete request after the user stops typing.
export const AUTOCOMPLETE_DEBOUNCE_MS = 50;

// Toast notification visible duration + fade-out duration.
export const TOAST_VISIBLE_MS = 2000;
export const TOAST_FADE_MS = 150;

// Maximum number of <span> output lines kept per cell before older ones are trimmed.
export const MAX_CELL_OUTPUT_LINES = 300;

// Maximum number of characters kept in the terminal's output buffer.
export const MAX_TERMINAL_OUTPUT_CHARS = 200000;

// WebSocket reconnect backoff: starts at BASE, grows up to MAX on repeated failures,
// and resets back to BASE the moment a connection succeeds.
export const SOCKET_RECONNECT_BASE_MS = 1000;
export const SOCKET_RECONNECT_MAX_MS = 10000;
```


---

# File: static\js\core\socket.js

```js
/**
 * core/socket.js
 *
 * A self-healing WebSocket wrapper used by every realtime feature (cell execution,
 * terminal, metrics).
 *
 * BUG FIX: the previous implementation (static/js/websocket.js) reconnected by
 * calling itself recursively on `close` and creating a brand new WebSocket, but
 * the *caller* kept holding a reference to the original (now-dead) socket object
 * forever, e.g. `const runSocket = createRunSocket(...)`. Once the socket dropped
 * even once, every future `runSocket.send(...)` call silently targeted a closed
 * socket, permanently breaking cell execution until a full page reload.
 *
 * `ReconnectingSocket` fixes this by being a stable, long-lived object: `.send()`
 * and `.isOpen` always operate on whatever the *current* underlying WebSocket is,
 * even after it has been transparently swapped out behind the scenes.
 */
import { SOCKET_RECONNECT_BASE_MS, SOCKET_RECONNECT_MAX_MS } from '../config/constants.js';

function buildWsUrl(path) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}${path}`;
}

export class ReconnectingSocket {
  /**
   * @param {string} path - e.g. '/ws/run'
   * @param {object} options
   * @param {(data: any) => void} [options.onMessage] - called with the parsed JSON payload
   * @param {() => void} [options.onOpen]
   * @param {() => void} [options.onClose]
   */
  constructor(path, { onMessage, onOpen, onClose } = {}) {
    this.path = path;
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onClose = onClose;

    this._ws = null;
    this._closedByUser = false;
    this._reconnectDelay = SOCKET_RECONNECT_BASE_MS;

    this._connect();
  }

  _connect() {
    const ws = new WebSocket(buildWsUrl(this.path));
    this._ws = ws;

    ws.onopen = () => {
      this._reconnectDelay = SOCKET_RECONNECT_BASE_MS; // reset backoff after a healthy connect
      this.onOpen?.();
    };

    ws.onmessage = (event) => {
      let parsed;
      try {
        parsed = JSON.parse(event.data);
      } catch (err) {
        console.error(`[socket:${this.path}] Failed to parse incoming message`, err);
        return;
      }
      this.onMessage?.(parsed);
    };

    ws.onerror = () => {
      // A close event always follows an error event for WebSockets; reconnection
      // logic lives entirely in onclose to avoid double-scheduling reconnects.
      try { ws.close(); } catch { /* already closing */ }
    };

    ws.onclose = () => {
      this.onClose?.();
      if (this._closedByUser) return;

      setTimeout(() => this._connect(), this._reconnectDelay);
      this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, SOCKET_RECONNECT_MAX_MS);
    };
  }

  /** True when the *current* underlying socket is open and ready to send. */
  get isOpen() {
    return !!this._ws && this._ws.readyState === WebSocket.OPEN;
  }

  /**
   * Sends a message on the current socket. Accepts a plain object (auto JSON-encoded)
   * or a raw string. Returns false (and logs a warning) instead of throwing if the
   * socket isn't currently open.
   */
  send(data) {
    if (!this.isOpen) {
      console.warn(`[socket:${this.path}] Dropped message — socket is not connected.`, data);
      return false;
    }
    this._ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    return true;
  }

  /** Permanently closes the socket and stops all future reconnect attempts. */
  close() {
    this._closedByUser = true;
    this._ws?.close();
  }
}
```


---

# File: static\js\core\toast.js

```js
/**
 * core/toast.js
 * Bottom-left brutalist toast notifications.
 */
import { TOAST_VISIBLE_MS, TOAST_FADE_MS } from '../config/constants.js';

/**
 * @param {HTMLElement|null} container
 * @returns {(message: string, type?: 'warning'|'danger'|'success') => void}
 */
export function createToaster(container) {
  return function showToast(message, type = 'warning') {
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), TOAST_FADE_MS);
    }, TOAST_VISIBLE_MS);
  };
}
```


---

# File: static\js\metrics\metrics.js

```js
/**
 * metrics/metrics.js
 * Footer CPU/RAM/GPU usage bars, streamed from /ws/metrics.
 */
import { ReconnectingSocket } from '../core/socket.js';

export function initMetricsStream() {
  const cpuBar = document.getElementById('cpu-bar-fill');
  const cpuVal = document.getElementById('cpu-val');

  const ramBar = document.getElementById('ram-bar-fill');
  const ramVal = document.getElementById('ram-val');

  const gpuBar = document.getElementById('gpu-bar-fill');
  const gpuVal = document.getElementById('gpu-val');

  new ReconnectingSocket('/ws/metrics', {
    onMessage: (data) => {
      if (cpuBar && cpuVal) {
        cpuBar.style.width = `${Math.min(100, Math.max(0, data.cpu))}%`;
        cpuVal.textContent = `${data.cpu}%`;
      }

      if (ramBar && ramVal) {
        ramBar.style.width = `${Math.min(100, Math.max(0, data.ram_pct))}%`;
        ramVal.textContent = `${data.ram_used_gb}/${data.ram_total_gb} GB (${data.ram_pct}%)`;
      }

      if (gpuBar && gpuVal) {
        if (data.has_gpu) {
          gpuBar.style.width = `${Math.min(100, Math.max(0, data.gpu_pct))}%`;
          gpuVal.textContent = `${data.gpu_used_gb}/${data.gpu_total_gb} GB (${data.gpu_pct}%)`;
        } else {
          gpuBar.style.width = '0%';
          gpuVal.textContent = 'N/A';
        }
      }
    },
  });
}
```


---

# File: static\js\notebook\notebookController.js

```js
/**
 * notebook/notebookController.js
 *
 * Owns all notebook state: the cell list, selection/edit-mode, and the
 * run/queue/interrupt/restart lifecycle. This is the direct replacement for
 * the big IIFE that used to live in static/js/notebook.js, split out from
 * DOM/CodeMirror construction (cells/cellFactory.js) and output rendering
 * (cells/cellOutput.js) so each concern can be read/tested on its own.
 */
import { createCell } from '../cells/cellFactory.js';
import { clearCellOutput, appendCellOutput, appendCellPlot, appendCellStdinPrompt } from '../cells/cellOutput.js';

/**
 * @param {object} deps
 * @param {HTMLElement} deps.container
 * @param {{cellTemplate: HTMLTemplateElement, insertBarTemplate: HTMLTemplateElement}} deps.templates
 * @param {import('../core/socket.js').ReconnectingSocket} deps.runSocket
 * @param {(message: string, type?: string) => void} deps.showToast
 * @param {(cm: any) => void} deps.registerAutocomplete
 */
export function createNotebookController({ container, templates, runSocket, showToast, registerAutocomplete }) {
  const cells = [];
  let idCounter = 0;
  let selectedId = null;
  let editingId = null;
  let runningCellId = null;
  const executionQueue = [];

  function indexOf(id) {
    return cells.findIndex((c) => c.id === id);
  }
  function getCell(id) {
    return cells.find((c) => c.id === id);
  }

  function reorderDom() {
    cells.forEach((c) => {
      container.appendChild(c.dom.root);
      container.appendChild(c.dom.insertBar);
    });
  }

  function buildCell(source) {
    const id = 'cell-' + (++idCounter);
    return createCell(
      id,
      source,
      templates,
      {
        onRun: (cellId, opts) => runCell(cellId, opts),
        onRunButtonClick: (cellId) => {
          if (runningCellId === cellId) {
            runSocket.send({ action: 'interrupt' });
          } else {
            runCell(cellId, { advance: false });
          }
        },
        onMove: (cellId, delta) => moveCell(cellId, delta),
        onDelete: (cellId) => deleteCell(cellId),
        onSelect: (cellId) => selectCell(cellId),
        onEnterEdit: (cellId) => enterEditMode(cellId),
        onExitEdit: (cellId) => exitEditMode(cellId),
        onInsertAfter: (cellId) => insertCellAt(indexOf(cellId) + 1, '', { focus: true }),
      },
      registerAutocomplete
    );
  }

  function insertCellAt(index, source = '', { focus = false } = {}) {
    const cell = buildCell(source);
    cells.splice(index, 0, cell);
    reorderDom();
    cell.cm.refresh();
    if (focus) {
      enterEditMode(cell.id);
      cell.cm.focus();
    } else {
      selectCell(cell.id);
    }
    cell.dom.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return cell;
  }

  function deleteCell(id) {
    if (id === runningCellId) {
      if (runSocket.isOpen) runSocket.send({ action: 'interrupt' });
      runningCellId = null;
      showToast('⚠️ RUNNING CELL DELETED & TERMINATED', 'danger');
    }

    const qIdx = executionQueue.indexOf(id);
    if (qIdx !== -1) executionQueue.splice(qIdx, 1);

    if (cells.length === 1) {
      const cell = cells[0];
      cell.cm.setValue('');
      clearCellOutput(cell);
      cell.execCount = null;
      cell.dom.execCountEl.textContent = '[\u00A0]';
      selectCell(cell.id);
      return;
    }
    const idx = indexOf(id);
    const cell = cells[idx];
    cell.dom.root.remove();
    cell.dom.insertBar.remove();
    cells.splice(idx, 1);
    selectCell(cells[Math.min(idx, cells.length - 1)].id);
  }

  function moveCell(id, delta) {
    const idx = indexOf(id);
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= cells.length) return;
    const [cell] = cells.splice(idx, 1);
    cells.splice(newIdx, 0, cell);
    reorderDom();
    selectCell(id);
  }

  function selectCell(id) {
    selectedId = id;
    editingId = null;
    cells.forEach((c) => {
      c.dom.root.classList.toggle('selected', c.id === id);
      c.dom.root.classList.remove('editing');
    });
  }

  function enterEditMode(id) {
    selectedId = id;
    editingId = id;
    cells.forEach((c) => {
      c.dom.root.classList.toggle('editing', c.id === id);
      c.dom.root.classList.toggle('selected', c.id === id);
    });
  }

  function exitEditMode(id) {
    const cell = getCell(id);
    cell?.cm.getInputField().blur();
    selectCell(id);
  }

  /** Moves the selection up (-1) or down (+1), clamped to the cell list bounds. */
  function selectAdjacent(delta) {
    if (!selectedId) return;
    const idx = indexOf(selectedId);
    const newIdx = Math.min(cells.length - 1, Math.max(0, idx + delta));
    selectCell(cells[newIdx].id);
  }

  function advanceSelectionAfter(idx) {
    if (idx === cells.length - 1) {
      insertCellAt(idx + 1, '', { focus: true });
    } else {
      selectCell(cells[idx + 1].id);
      cells[idx + 1].dom.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function runCell(id, { advance = false, insertBelow = false } = {}) {
    const cell = getCell(id);
    if (!cell) return;

    if (!runSocket.isOpen) {
      showToast('⚠️ NOT CONNECTED TO KERNEL — RECONNECTING…', 'danger');
      return;
    }

    const idx = indexOf(id);

    if (runningCellId === id) {
      showToast('⚠️ CELL ALREADY RUNNING', 'warning');
      return;
    }

    if (runningCellId !== null) {
      if (!executionQueue.includes(id)) {
        executionQueue.push(id);
        cell.dom.root.classList.add('queued');
        cell.dom.execCountEl.textContent = '[*]';
        cell.dom.runBtn.textContent = '⏳';
        cell.dom.runBtn.title = 'Queued to run next';
        showToast('⏳ CELL QUEUED TO RUN NEXT', 'warning');
      } else {
        showToast('⚠️ CELL ALREADY QUEUED', 'warning');
      }

      // Advance focus to the next cell without running it.
      if (advance) advanceSelectionAfter(idx);
      return;
    }

    executeNextInQueue(id);

    if (insertBelow) {
      insertCellAt(idx + 1, '', { focus: true });
    } else if (advance) {
      advanceSelectionAfter(idx);
    } else {
      selectCell(id);
    }
  }

  function executeNextInQueue(id) {
    const cell = getCell(id);
    if (!cell) return;

    runningCellId = id;
    cell.dom.root.classList.remove('queued');
    cell.dom.root.classList.add('running');
    cell.dom.runBtn.textContent = '⏹';
    cell.dom.runBtn.title = 'Interrupt Execution';
    cell.dom.execCountEl.textContent = '[*]';
    clearCellOutput(cell);

    runSocket.send({ action: 'run', code: cell.cm.getValue() });
  }

  /** Feed this to the run socket's onMessage handler. */
  function handleRunMessage(data) {
    if (!runningCellId) return;
    const cell = getCell(runningCellId);
    if (!cell) return;

    if (data.type === 'stdout') appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stdout');
    if (data.type === 'stderr') appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stderr');
    if (data.type === 'plot') appendCellPlot(cell, data.html);
    if (data.type === 'stdin_request') {
      appendCellStdinPrompt(cell, data.prompt, (value) => {
        runSocket.send({ action: 'stdin_reply', value });
      });
    }

    if (data.type === 'complete') {
      cell.dom.root.classList.remove('running', 'queued');
      cell.dom.runBtn.textContent = '▶';
      cell.dom.runBtn.title = 'Run cell (Shift+Enter)';
      cell.execCount = data.exec_count;
      cell.dom.execCountEl.textContent = `[${cell.execCount}]`;
      runningCellId = null;

      if (executionQueue.length > 0) {
        const nextId = executionQueue.shift();
        executeNextInQueue(nextId);
      }
    }
  }

  /**
   * Shared restart implementation — hits POST /api/restart, wipes exec counts
   * and outputs on success. Returns a promise<boolean> so the "Restart and
   * run…" Runtime-menu actions can wait for the kernel to actually come back
   * before submitting cells to it.
   */
  async function performRestart() {
    try {
      const res = await fetch('/api/restart', { method: 'POST' });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      cells.forEach((c) => {
        c.execCount = null;
        c.dom.execCountEl.textContent = '[\u00A0]';
        clearCellOutput(c);
      });
      return true;
    } catch (err) {
      console.error('Kernel restart failed:', err);
      showToast('⚠️ FAILED TO RESTART KERNEL', 'danger');
      return false;
    }
  }

  function restartKernel() {
    performRestart().then((ok) => {
      if (ok) showToast('🔄 KERNEL RESTARTED', 'danger');
    });
  }

  function interruptKernel() {
    if (runSocket.isOpen) {
      runSocket.send({ action: 'interrupt' });
      showToast('⏹ EXECUTION INTERRUPTED', 'danger');
    }
  }

  function runAll() {
    [...cells].forEach((cell) => runCell(cell.id, { advance: false }));
  }

  /** Restarts the kernel, then (on success) runs every cell top to bottom. */
  async function restartAndRunAll() {
    const ok = await performRestart();
    if (ok) {
      showToast('🔄 KERNEL RESTARTED — RUNNING ALL CELLS', 'danger');
      runAll();
    }
  }

  /**
   * Restarts the kernel, then (on success) runs every cell from the top
   * through a target cell — the currently selected cell if one is selected,
   * otherwise the last cell that had already been run before the restart.
   * If neither applies (nothing selected, nothing ever run) it falls back to
   * just the first cell, rather than guessing and running the whole notebook.
   */
  async function restartAndRunToSelected() {
    let targetIdx = selectedId ? indexOf(selectedId) : -1;
    if (targetIdx === -1) {
      cells.forEach((c, i) => {
        if (c.execCount != null) targetIdx = i;
      });
    }
    if (targetIdx === -1) targetIdx = 0;

    const ok = await performRestart();
    if (ok) {
      showToast('🔄 KERNEL RESTARTED — RUNNING TO SELECTED CELL', 'danger');
      cells.slice(0, targetIdx + 1).forEach((c) => runCell(c.id, { advance: false }));
    }
  }

  /** Replaces every cell in the notebook with the given list of source strings. */
  function loadNotebook(sources) {
    cells.forEach((c) => {
      c.dom.root.remove();
      c.dom.insertBar.remove();
    });
    cells.length = 0;
    runningCellId = null;
    executionQueue.length = 0;

    const list = sources && sources.length ? sources : [''];
    list.forEach((src) => cells.push(buildCell(src)));

    reorderDom();
    cells.forEach((c) => c.cm.refresh());
    selectCell(cells[0].id);
  }

  return {
    insertCellAt,
    deleteCell,
    moveCell,
    selectCell,
    enterEditMode: (id) => {
      enterEditMode(id);
      getCell(id).cm.focus();
    },
    exitEditMode,
    selectAdjacent,
    runCell,
    restartKernel,
    interruptKernel,
    runAll,
    loadNotebook,
    handleRunMessage,
    refreshAllEditors: () => cells.forEach((c) => c.cm.refresh()),
    getSelectedId: () => selectedId,
    getEditingId: () => editingId,
    getCells: () => cells,
  };
}
```


---

# File: static\js\notebook\notebookFile.js

```js
/**
 * notebookFile/notebookFile.js
 *
 * Client-side .ipynb save/open. Jupy has no backend "save" endpoint — the
 * notebook is a browser-only editing surface — so saving downloads a standard
 * Jupyter notebook (nbformat 4) file, and opening reads one back in via the
 * hidden <input type="file">.
 *
 * BUG FIX: the OPEN/SAVE toolbar buttons and the "+ CODE CELL" button at the
 * bottom of the notebook previously had no click handlers at all (their DOM
 * nodes were looked up but never used), so none of them did anything. See
 * app.js for where these are wired up.
 */

/** Builds an nbformat-4 notebook JSON string from the current cell list. */
export function serializeNotebook(cells) {
  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: 'Python 3 (Jupy)', language: 'python', name: 'python3' },
      language_info: { name: 'python', pygments_lexer: 'ipython3' },
    },
    cells: cells.map((cell) => {
      const lines = cell.cm.getValue().split('\n');
      return {
        cell_type: 'code',
        metadata: {},
        execution_count: cell.execCount ?? null,
        // nbformat convention: every source line keeps its trailing "\n" except the last.
        source: lines.map((line, i) => (i < lines.length - 1 ? line + '\n' : line)),
        outputs: [],
      };
    }),
  };
  return JSON.stringify(notebook, null, 2);
}

/** Triggers a browser download of the notebook as a `.ipynb` file. */
export function downloadNotebook(cells, filename) {
  const json = serializeNotebook(cells);
  const blob = new Blob([json], { type: 'application/x-ipynb+json' });
  const url = URL.createObjectURL(blob);

  const safeName = filename && filename.trim() ? filename.trim() : 'Untitled.ipynb';
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName.endsWith('.ipynb') ? safeName : `${safeName}.ipynb`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Parses raw `.ipynb` file text into a flat array of code-cell source strings.
 * Jupy only supports code cells, so any markdown/raw cells are skipped.
 */
export function parseNotebookFile(fileText) {
  const data = JSON.parse(fileText);
  const rawCells = Array.isArray(data.cells) ? data.cells : [];

  return rawCells
    .filter((c) => !c.cell_type || c.cell_type === 'code')
    .map((c) => (Array.isArray(c.source) ? c.source.join('') : c.source || ''));
}

/** Reads a File (e.g. from an <input type="file">) as text. */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
```


---

# File: static\js\runtime\pyodideRuntime.js

```js
/**
 * runtime/pyodideRuntime.js
 * Client-side (in-browser) Python execution via Pyodide — supports
 * `!pip install` and captures Matplotlib plots as inline <img> output.
 *
 * FLAG FOR REVIEW: this module isn't imported anywhere, and it wasn't wired
 * into the old static/js/notebook.js either — live cell execution goes
 * through the backend kernel over the `/ws/run` WebSocket instead (see
 * notebook/notebookController.js#runCell). It's migrated here unchanged so
 * nothing is silently dropped, but as far as this codebase shows, it's dead
 * code from an earlier or alternate (offline/serverless) execution path.
 * Worth a decision: wire it up as a fallback/offline mode, or delete it.
 */
const PYODIDE_VERSION = 'v0.26.4';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

let pyodide = null;
let loadingPromise = null;
let runCellFn = null;
let namespace = null;

const BOOTSTRAP_PY = `
import ast, io, re, sys, traceback, warnings
from contextlib import redirect_stdout, redirect_stderr

warnings.filterwarnings("ignore", message=".*non-GUI backend.*")
warnings.filterwarnings("ignore", category=UserWarning, module="matplotlib")

async def __pynb_pip_install__(pkg_str):
    import micropip
    tokens = pkg_str.split()
    pkgs = [t for t in tokens if not t.startswith('-')]
    if not pkgs:
        print("Usage: !pip install <package_name>")
        return
    
    print(f"Installing {', '.join(pkgs)} via micropip...")
    try:
        await micropip.install(pkgs)
        print(f"Successfully installed {', '.join(pkgs)}")
    except Exception as e:
        print(f"Failed to install {', '.join(pkgs)}: {e}", file=sys.stderr)

def __pynb_capture_plots__():
    plot_htmls = []
    if "matplotlib.pyplot" in sys.modules:
        import matplotlib
        import matplotlib.pyplot as plt
        import io, base64
        
        fignums = plt.get_fignums()
        for i in fignums:
            try:
                fig = plt.figure(i)
                buf = io.BytesIO()
                fig.savefig(buf, format="png", bbox_inches="tight", dpi=110)
                buf.seek(0)
                b64 = base64.b64encode(buf.read()).decode("ascii")
                plot_htmls.append(f'<img class="notebook-plot" src="data:image/png;base64,{b64}" alt="Plot" />')
            except Exception:
                pass
        
        try:
            plt.close("all")
        except Exception:
            pass
            
        try:
            from matplotlib._pylab_helpers import Gcf
            Gcf.figs.clear()
        except Exception:
            pass

    return plot_htmls

async def __pynb_run_cell__(code, ns):
    out, err = io.StringIO(), io.StringIO()
    result_repr, error_tb = None, None
    plots = []
    
    lines = code.splitlines()
    pip_cmds = []
    py_lines = []
    
    for line in lines:
        stripped = line.strip()
        if re.match(r'^[!%]?\\s*pip\\s+install\\s+', stripped):
            clean_cmd = re.sub(r'^[!%]?\\s*pip\\s+install\\s+', '', stripped)
            pip_cmds.append(clean_cmd)
        elif re.match(r'^[!%]?\\s*matplotlib\\s+inline', stripped):
            pass
        else:
            py_lines.append(line)
            
    clean_code = "\\n".join(py_lines)
    
    try:
        with redirect_stdout(out), redirect_stderr(err):
            for cmd in pip_cmds:
                await __pynb_pip_install__(cmd)
            
            if "matplotlib" in sys.modules:
                import matplotlib
                try:
                    matplotlib.use("Agg", force=True)
                except Exception:
                    pass
            
            if clean_code.strip():
                tree = ast.parse(clean_code, mode="exec")
                if tree.body and isinstance(tree.body[-1], ast.Expr):
                    last = tree.body.pop()
                    if tree.body:
                        exec(compile(tree, "<cell>", "exec"), ns)
                    expr = ast.Expression(last.value)
                    ast.copy_location(expr, last.value)
                    value = eval(compile(expr, "<cell>", "eval"), ns)
                    if value is not None:
                        result_repr = repr(value)
                else:
                    exec(compile(tree, "<cell>", "exec"), ns)
            
            plots = __pynb_capture_plots__()

    except SyntaxError as e:
        error_tb = "".join(traceback.format_exception_only(type(e), e))
    except Exception as e:
        tb = e.__traceback__.tb_next if e.__traceback__ else None
        error_tb = "".join(traceback.format_exception(type(e), e, tb))
        
    return out.getvalue(), err.getvalue(), result_repr, error_tb, plots
`;

function freshNamespace() {
  return pyodide.runPython("{'__name__': '__main__'}");
}

async function init(onProgress) {
  if (pyodide) return pyodide;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    onProgress?.('Fetching Python runtime…');
    const { loadPyodide } = await import(PYODIDE_CDN + 'pyodide.mjs');
    pyodide = await loadPyodide({ indexURL: PYODIDE_CDN });

    onProgress?.('Loading package installer (micropip)…');
    await pyodide.loadPackage('micropip');

    onProgress?.('Initializing kernel…');
    pyodide.runPython(BOOTSTRAP_PY);
    runCellFn = pyodide.globals.get('__pynb_run_cell__');
    namespace = freshNamespace();

    onProgress?.('Ready');
    return pyodide;
  })();

  return loadingPromise;
}

async function run(code) {
  if (!pyodide || !runCellFn) throw new Error('PyRuntime not ready');
  const proxy = await runCellFn(code, namespace);
  const [stdout, stderr, result, error, plots] = proxy.toJs();
  proxy.destroy();
  return { stdout, stderr, result, error, plots };
}

function restart() {
  if (namespace && namespace.destroy) {
    try { namespace.destroy(); } catch { /* already gone */ }
  }
  namespace = freshNamespace();
}

/** Loads (once) and returns the Pyodide instance, reporting progress via onProgress. */
export const getPyodide = (onProgress) => init(onProgress);

/**
 * @param {*} instance - unused; kept for call-signature parity with the backend run path
 * @param {string} code
 * @param {{onStdout?: (text: string) => void, onStderr?: (text: string) => void, onPlot?: (html: string) => void}} [callbacks]
 */
export async function runCell(instance, code, { onStdout, onStderr, onPlot } = {}) {
  const { stdout, stderr, result, error, plots } = await run(code);
  if (stdout) onStdout?.(stdout.replace(/\n$/, ''));
  if (result != null) onStdout?.(result);
  if (plots && plots.length > 0) {
    plots.forEach((html) => onPlot?.(html));
  }
  if (stderr) onStderr?.(stderr.replace(/\n$/, ''));
  if (error) onStderr?.(error.replace(/\n$/, ''));
}

export const restartKernel = async () => restart();
export const isReady = () => !!pyodide;
```


---

# File: static\js\shortcuts\shortcuts.js

```js
/**
 * shortcuts/shortcuts.js
 * Global command-mode keyboard shortcuts, plus the "⌨️ Keyboard Shortcuts"
 * help dialog (Ctrl/Cmd+Shift+? or +/).
 *
 * CLEANUP: Up/Down/K/J navigation used to re-derive "clamp to the cell list
 * bounds" locally, duplicating logic that also lives in
 * notebook/notebookController.js#selectAdjacent. Now it just calls
 * actions.selectAdjacent(-1|1) so the bounds-check exists in exactly one
 * place.
 */
import { DOUBLE_TAP_WINDOW_MS } from '../config/constants.js';

let lastDeletedCellSource = '';

export function initShortcuts(actions) {
  // Inject Brutalist Dialog HTML and inline CSS into the document.
  injectDialogDOM();

  let lastDPress = 0;
  let lastIPress = 0;
  let lastZeroPress = 0;

  document.addEventListener('keydown', (e) => {
    const isEditing = actions.getEditingId() !== null;
    const activeEl = document.activeElement;

    // Ignore if typing inside inputs or non-editor textareas.
    if (
      activeEl.tagName === 'INPUT' ||
      (activeEl.tagName === 'TEXTAREA' && !activeEl.classList.contains('CodeMirror-code') && activeEl.id !== 'terminal-hidden-input')
    ) {
      return;
    }

    // Toggle Help Dialog: Ctrl+Shift+? or Ctrl+Shift+/
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '?' || e.key === '/')) {
      e.preventDefault();
      toggleHelpDialog();
      return;
    }

    if (isEditing) {
      if (e.key === 'Escape') {
        e.preventDefault();
        actions.exitEditMode(actions.getEditingId());
      }
      return;
    }

    // Command Mode Shortcuts
    const selectedId = actions.getSelectedId();
    if (!selectedId) return;

    const cells = actions.getCells();
    const idx = cells.findIndex((c) => c.id === selectedId);

    // Execution Controls
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      actions.runCell(selectedId, { advance: true });
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      actions.runCell(selectedId, { advance: false });
      return;
    }
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      actions.runCell(selectedId, { insertBelow: true });
      return;
    }

    // Focus cell
    if (e.key === 'Enter') {
      e.preventDefault();
      actions.enterEditMode(selectedId);
      return;
    }

    const k = e.key.toLowerCase();

    // Navigation — bounds-clamping lives in notebookController#selectAdjacent.
    if (e.key === 'ArrowUp' || k === 'k') {
      e.preventDefault();
      actions.selectAdjacent(-1);
      return;
    }
    if (e.key === 'ArrowDown' || k === 'j') {
      e.preventDefault();
      actions.selectAdjacent(1);
      return;
    }

    // Insert Cells
    if (k === 'a') {
      e.preventDefault();
      actions.insertCellAt(idx, '', { focus: true });
      return;
    }
    if (k === 'b') {
      e.preventDefault();
      actions.insertCellAt(idx + 1, '', { focus: true });
      return;
    }

    // Delete Cell (Double Tap D)
    if (k === 'd') {
      e.preventDefault();
      const now = Date.now();
      if (now - lastDPress < DOUBLE_TAP_WINDOW_MS) {
        const cell = cells[idx];
        if (cell) lastDeletedCellSource = cell.cm.getValue();
        actions.deleteCell(selectedId);
        lastDPress = 0;
      } else {
        lastDPress = now;
        setTimeout(() => { lastDPress = 0; }, DOUBLE_TAP_WINDOW_MS);
      }
      return;
    }

    // Undo Delete Cell (Z)
    if (k === 'z') {
      e.preventDefault();
      if (lastDeletedCellSource) {
        actions.insertCellAt(idx, lastDeletedCellSource, { focus: false });
        lastDeletedCellSource = '';
      }
      return;
    }

    // Reordering
    if (e.ctrlKey && e.shiftKey && e.key === 'ArrowUp') {
      e.preventDefault();
      actions.moveCell(selectedId, -1);
      return;
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'ArrowDown') {
      e.preventDefault();
      actions.moveCell(selectedId, 1);
      return;
    }

    // Double-tap 'i' to interrupt execution
    if (k === 'i') {
      e.preventDefault();
      const now = Date.now();
      if (now - lastIPress < DOUBLE_TAP_WINDOW_MS) {
        actions.interruptKernel();
        lastIPress = 0;
      } else {
        lastIPress = now;
        setTimeout(() => { lastIPress = 0; }, DOUBLE_TAP_WINDOW_MS);
      }
      return;
    }

    // Double-tap '0' to restart kernel runtime
    if (k === '0') {
      e.preventDefault();
      const now = Date.now();
      if (now - lastZeroPress < DOUBLE_TAP_WINDOW_MS) {
        actions.restartKernel();
        lastZeroPress = 0;
      } else {
        lastZeroPress = now;
        setTimeout(() => { lastZeroPress = 0; }, DOUBLE_TAP_WINDOW_MS);
      }
      return;
    }
  });
}

export function toggleHelpDialog() {
  const modal = document.getElementById('jupy-help-dialog');
  if (modal) {
    modal.hidden = !modal.hidden;
  }
}

function injectDialogDOM() {
  if (document.getElementById('jupy-help-dialog')) return;

  // 1. Inject styles directly into head to prevent loading errors.
  const style = document.createElement('style');
  style.textContent = `
    .shortcuts-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.65);
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .shortcuts-modal {
      width: 100%;
      max-width: 680px;
      background: var(--color-surface);
      border: var(--border-thick);
      border-radius: var(--rounded-md);
      box-shadow: var(--shadow-brutal-lg);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: var(--color-text);
    }
    .shortcuts-header {
      background: var(--color-primary);
      padding: 10px 14px;
      border-bottom: var(--border-thick);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .shortcuts-title {
      font-family: var(--font-mono);
      font-size: 0.85rem;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: 0.05em;
    }
    .shortcuts-body {
      display: flex;
      gap: 16px;
      padding: 16px;
      overflow-y: auto;
      background: var(--color-surface);
    }
    .shortcuts-column {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .shortcuts-column h3 {
      font-family: var(--font-display);
      font-size: 1.1rem;
      font-weight: 800;
      border-bottom: var(--border-thick);
      padding-bottom: 4px;
      margin-bottom: 6px;
      color: var(--color-primary);
    }
    .shortcut-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-mono);
      font-size: 0.72rem;
    }
    .shortcut-row span {
      margin-left: auto;
      font-family: var(--font-body);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--color-text);
    }
    .close-btn {
      border: var(--border-thick);
      background: var(--color-surface);
      color: var(--color-text);
      width: 24px;
      height: 24px;
      font-size: 0.75rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: var(--shadow-brutal-sm);
    }
    .close-btn:hover {
      background: var(--color-secondary);
      color: #111827;
    }
  `;
  document.head.appendChild(style);

  // 2. Inject modal DOM.
  const modal = document.createElement('div');
  modal.id = 'jupy-help-dialog';
  modal.className = 'shortcuts-overlay';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="shortcuts-modal">
      <div class="shortcuts-header">
        <span class="shortcuts-title">⌨️ JUPY KEYBOARD SHORTCUTS</span>
        <button class="close-btn" id="btn-shortcuts-close">✕</button>
      </div>
      <div class="shortcuts-body">
        <div class="shortcuts-column">
          <h3>COMMAND MODE (ESC)</h3>
          <div class="shortcut-row"><kbd>Shift</kbd>+<kbd>Enter</kbd> <span>Run cell &amp; select next</span></div>
          <div class="shortcut-row"><kbd>Ctrl/⌘</kbd>+<kbd>Enter</kbd> <span>Run cell in place</span></div>
          <div class="shortcut-row"><kbd>Alt/Option</kbd>+<kbd>Enter</kbd> <span>Run cell &amp; insert below</span></div>
          <div class="shortcut-row"><kbd>Enter</kbd> <span>Enter Edit Mode</span></div>
          <div class="shortcut-row"><kbd>A</kbd> <span>Insert cell above</span></div>
          <div class="shortcut-row"><kbd>B</kbd> <span>Insert cell below</span></div>
          <div class="shortcut-row"><kbd>D D</kbd> <span>Delete cell</span></div>
          <div class="shortcut-row"><kbd>Z</kbd> <span>Undo delete cell</span></div>
          <div class="shortcut-row"><kbd>ArrowUp/K</kbd> <span>Select cell above</span></div>
          <div class="shortcut-row"><kbd>ArrowDown/J</kbd> <span>Select cell below</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>↑</kbd> <span>Move cell up</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>↓</kbd> <span>Move cell down</span></div>
          <div class="shortcut-row"><kbd>I I</kbd> <span>Interrupt runtime</span></div>
          <div class="shortcut-row"><kbd>0 0</kbd> <span>Restart runtime</span></div>
        </div>
        <div class="shortcuts-column">
          <h3>EDIT MODE (ENTER)</h3>
          <div class="shortcut-row"><kbd>Esc</kbd> <span>Enter Command Mode</span></div>
          <div class="shortcut-row"><kbd>Alt/Option</kbd>+<kbd>↑</kbd> <span>Move current line up</span></div>
          <div class="shortcut-row"><kbd>Alt/Option</kbd>+<kbd>↓</kbd> <span>Move current line down</span></div>
          <div class="shortcut-row"><kbd>Tab</kbd> <span>Indent / Autocomplete</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Space</kbd> <span>Trigger manual suggestions</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>/</kbd> <span>Toggle line comment</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>?</kbd> <span>Open this help dialog</span></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('btn-shortcuts-close').addEventListener('click', toggleHelpDialog);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) toggleHelpDialog();
  });
}
```


---

# File: static\js\terminal\terminal.js

```js
/**
 * terminal/terminal.js
 * The right-hand split-pane shell terminal.
 *
 * BUG FIX: previously used a bare WebSocket with no reconnect and no close
 * handling at all — if the connection dropped (server restart, network blip),
 * the terminal went silently dead with no way to recover short of a full page
 * reload. It's now backed by the shared ReconnectingSocket, and output is
 * capped to avoid unbounded memory growth over long sessions (mirroring the
 * cap already applied to cell output).
 */
import { ReconnectingSocket } from '../core/socket.js';
import { MAX_TERMINAL_OUTPUT_CHARS } from '../config/constants.js';

export function setupTerminal(toggleBtn, closeBtn, panel, screen, output, input, promptLabel, onResize) {
  let termSocket = null;
  const cmdHistory = [];
  let historyIdx = -1;

  function appendOutput(text) {
    output.textContent += text;
    if (output.textContent.length > MAX_TERMINAL_OUTPUT_CHARS) {
      output.textContent = output.textContent.slice(-MAX_TERMINAL_OUTPUT_CHARS);
    }
    screen.scrollTop = screen.scrollHeight;
  }

  function ensureSocket() {
    if (termSocket) return; // ReconnectingSocket already owns its own reconnect loop

    output.textContent = 'Jupy Terminal (.jupy_env) Ready.\n';
    termSocket = new ReconnectingSocket('/ws/terminal', {
      onMessage: (data) => {
        if (data.type === 'output') {
          appendOutput(data.data);
        } else if (data.type === 'prompt') {
          if (promptLabel) promptLabel.textContent = data.data;
        } else if (data.type === 'clear') {
          output.textContent = '';
        }
      },
      onClose: () => appendOutput('\n[connection lost — reconnecting…]\n'),
    });
  }

  function toggleTerminal() {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      ensureSocket();
      setTimeout(() => input.focus(), 50);
    }
    if (onResize) onResize();
  }

  toggleBtn.addEventListener('click', toggleTerminal);
  closeBtn.addEventListener('click', toggleTerminal);
  screen.addEventListener('click', () => input.focus());

  input.addEventListener('keydown', (e) => {
    if (!termSocket || !termSocket.isOpen) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value;
      if (val.trim()) {
        cmdHistory.push(val);
        historyIdx = cmdHistory.length;
      }

      const currentPrompt = promptLabel ? promptLabel.textContent : '(jupy_venv) ❯';
      appendOutput(`${currentPrompt} ${val}\n`);

      termSocket.send({ type: 'command', cmd: val });
      input.value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0 && historyIdx > 0) {
        historyIdx--;
        input.value = cmdHistory[historyIdx];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx < cmdHistory.length - 1) {
        historyIdx++;
        input.value = cmdHistory[historyIdx];
      } else {
        historyIdx = cmdHistory.length;
        input.value = '';
      }
    }
  });
}
```


---

# File: static\js\theme\theme.js

```js
/**
 * theme/theme.js
 * Light/dark theme toggle with localStorage persistence.
 */
export function initTheme(toggleBtn) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function savedTheme() {
    return localStorage.getItem('jupy-theme');
  }

  function isDarkActive() {
    const saved = savedTheme();
    return saved ? saved === 'dark' : media.matches;
  }

  function syncButtonLabel() {
    toggleBtn.textContent = isDarkActive() ? '☀ LIGHT' : '🌙 DARK';
  }

  function applyTheme() {
    const saved = savedTheme();
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      // No explicit user choice yet — let the CSS `prefers-color-scheme` rules drive it.
      document.documentElement.removeAttribute('data-theme');
    }
    syncButtonLabel();
  }

  toggleBtn.addEventListener('click', () => {
    const nextTheme = isDarkActive() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('jupy-theme', nextTheme);
    syncButtonLabel();
  });

  // Keep the button label in sync if the OS-level theme changes and the user
  // hasn't explicitly overridden it yet.
  media.addEventListener('change', () => {
    if (!savedTheme()) syncButtonLabel();
  });

  applyTheme();
}
```


---

