---
title: Folder Code Compilation
date: 2026-07-26 15:57:37
root_folder: "jupy"
total_compiled_files: 90
---

# File: cli.py

import argparse
import socketserver
import sys
import webbrowser
import traceback
import subprocess
import time

class ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def ensure_dependencies_with_timeout():
    """Check and install psutil with a 30‑second timeout."""
    try:
        import psutil
        print("[Jupy] psutil already installed.", flush=True)
        return
    except ImportError:
        print("[Jupy] psutil not found. Installing...", flush=True)
        try:
            proc = subprocess.run(
                [sys.executable, "-m", "pip", "install", "psutil"],
                capture_output=True,
                text=True,
                timeout=30
            )
            if proc.returncode == 0:
                print("[Jupy] psutil installed successfully.", flush=True)
            else:
                print("[Jupy] Failed to install psutil:", proc.stderr, flush=True)
        except subprocess.TimeoutExpired:
            print("[Jupy] pip install timed out after 30 seconds.", flush=True)
            print("[Jupy] Please install psutil manually: pip install psutil", flush=True)


def main():
    # Allow 'serve' subcommand
    if len(sys.argv) > 1 and sys.argv[1] == 'serve':
        sys.argv.pop(1)

    parser = argparse.ArgumentParser(description="Jupy - Brutalist Local Python Notebook")
    parser.add_argument("--port", type=int, default=8000, help="Port to run server on (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open browser")
    args = parser.parse_args()

    try:
        print("[Jupy] Checking dependencies...", flush=True)
        ensure_dependencies_with_timeout()

        print("[Jupy] Importing JupyHTTPHandler (this will start the kernel)...", flush=True)
        from jupy.server.handlers import JupyHTTPHandler
        print("[Jupy] Handler imported successfully.", flush=True)

        url = f"http://localhost:{args.port}"
        print(f"\n  ┌───────────────────────────────────────────────────┐", flush=True)
        print(f"  │  JUPY LOCAL NOTEBOOK SERVER                       │", flush=True)
        print(f"  │  URL: {url:<43} │", flush=True)
        print(f"  └───────────────────────────────────────────────────┘\n", flush=True)

        if not args.no_browser:
            webbrowser.open(url)

        print(f"[Jupy] Creating ThreadingServer on port {args.port}...", flush=True)
        with ThreadingServer(("", args.port), JupyHTTPHandler) as httpd:
            print(f"[Jupy] Server running on {url}", flush=True)
            httpd.serve_forever()

    except KeyboardInterrupt:
        print("\n[Jupy] Server stopped.")
        sys.exit(0)
    except Exception as e:
        print("\n[Jupy] ERROR starting server:")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

---

# File: combine.py

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



---

# File: filename.py

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



---

# File: run_notebook.py

#!/usr/bin/env python3
"""
Standalone notebook executor (headless).
Usage: python run_notebook.py notebook.ipynb [--output out.ipynb]
"""

import sys
import os
import json
import argparse

def run_notebook(notebook_path, output_path=None):
    try:
        import nbformat
        from nbformat.v4 import new_output
    except ImportError:
        print("Error: 'nbformat' is required for headless execution.")
        print("Install it with: pip install nbformat")
        sys.exit(1)

    # Ensure Jupy dependencies are installed in the current environment
    from jupy.core.envmanager import ensure_jupy_dependencies
    ensure_jupy_dependencies()

    # Import kernel (which will start it)
    from jupy.core.kernel import kernel

    # Ensure kernel is running
    if not kernel.proc or kernel.proc.poll() is not None:
        print("[Jupy] Starting kernel...")
        kernel._ensure_kernel_proc()

    # Load notebook
    if not os.path.exists(notebook_path):
        print(f"Error: Notebook file not found: {notebook_path}")
        sys.exit(1)

    with open(notebook_path, 'r', encoding='utf-8') as f:
        nb = nbformat.read(f, as_version=4)

    print(f"[Jupy] Executing notebook: {notebook_path}")

    total_cells = len(nb.cells)
    for idx, cell in enumerate(nb.cells):
        if cell.cell_type != 'code':
            continue
        print(f"  Running cell {idx+1}/{total_cells}...", end='', flush=True)
        outputs = []
        def ws_send(data):
            outputs.append(data)
        kernel.execute(cell.source, ws_send)
        # Collect outputs into nbformat structure
        for out in outputs:
            if out['type'] == 'stdout':
                cell.outputs.append(new_output('stream', name='stdout', text=out['text']))
            elif out['type'] == 'stderr':
                cell.outputs.append(new_output('stream', name='stderr', text=out['text']))
            elif out['type'] == 'plot':
                cell.outputs.append(new_output('display_data', data={'text/html': out['html']}))
            elif out['type'] == 'display':
                # Pass MIME data directly
                cell.outputs.append(new_output('display_data', data=out['data']))
            elif out['type'] == 'complete':
                # Execution complete marker – ignore
                pass
        print(" done")

    out_path = output_path or notebook_path
    with open(out_path, 'w', encoding='utf-8') as f:
        nbformat.write(nb, f)

    print(f"[Jupy] Notebook executed successfully and saved to: {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Execute a Jupy notebook headlessly")
    parser.add_argument('notebook', help='Path to .ipynb file')
    parser.add_argument('--output', '-o', help='Output file (default: overwrite input)', default=None)
    args = parser.parse_args()
    run_notebook(args.notebook, args.output)

---

# File: server.py

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


---

# File: __init__.py

"""Jupy - Lightweight Brutalist Python Notebook"""
__version__ = "0.1.0"


---

# File: __main__.py

from jupy.cli import main

if __name__ == "__main__":
    main()


---

# File: core\autocomplete.py

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


---

# File: core\envmanager.py

"""
jupy/core/envmanager.py

Central manager for Jupy's Python environments.

By default, the virtual environment used to run notebook cells lives in a
global, per-machine location outside any project folder (so `pip install jupy`
+ running `jupy` in any random folder never dumps a `.jupy_env/` next to the
user's files). Users can opt in, per-folder, to either:

  - "global"  (default) - a shared global env (envs/default), or any other
                           named global env they've created
  - "project"            - a `.jupy_env` folder local to the current working
                           directory, same as Jupy's old default behavior
  - "named"              - a specific named global env (e.g. "datasci")

The choice is remembered per-folder in `.jupy/config.json` (only written once
the user picks something other than the implicit global default, so a fresh
folder stays clean).

This module also keeps Jupy's own runtime dependencies (currently just
`psutil`, used for the CPU/RAM/GPU footer) separate from whichever venv is
running the user's notebook code — see `ensure_jupy_dependencies()`. Those are
installed into the interpreter that's running the Jupy server itself
(`sys.executable`), never into a user/project venv.
"""
import json
import os
import subprocess
import sys
import venv

APP_NAME = "Jupy"

# Packages Jupy itself needs to *run the server*, installed into sys.executable
# (the interpreter that launched `jupy`), never into a user/project venv.
JUPY_SERVER_DEPENDENCIES = ["psutil"]

# Packages installed into every *code* venv for Jupy's own features (currently
# just Jedi, needed in-process by the kernel worker for autocomplete against
# the user's actual installed packages/namespace). Filtered back out of the
# Pip Manager's package list so they don't clutter the user's view.
JUPY_ENV_DEPENDENCIES = ["jedi"]
JUPY_INTERNAL_PACKAGE_NAMES = {"pip", "setuptools", "wheel", "jedi", "parso"}

DEFAULT_ENV_NAME = "default"
PROJECT_CONFIG_DIR = ".jupy"
PROJECT_CONFIG_FILE = "config.json"


# ---------------------------------------------------------------------------
# Global data directory (OS-appropriate, outside any project folder)
# ---------------------------------------------------------------------------

def get_data_dir():
    """Returns the OS-appropriate global app-data directory for Jupy."""
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser(r"~\AppData\Local")
        path = os.path.join(base, APP_NAME)
    elif sys.platform == "darwin":
        path = os.path.expanduser(f"~/Library/Application Support/{APP_NAME}")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
        path = os.path.join(base, APP_NAME.lower())

    os.makedirs(path, exist_ok=True)
    return path


def get_envs_root():
    path = os.path.join(get_data_dir(), "envs")
    os.makedirs(path, exist_ok=True)
    return path


def get_global_env_path(name):
    safe = "".join(c for c in name if c.isalnum() or c in ("-", "_")) or DEFAULT_ENV_NAME
    return os.path.join(get_envs_root(), safe)


def get_project_env_path(cwd=None):
    return os.path.join(cwd or os.getcwd(), ".jupy_env")


# ---------------------------------------------------------------------------
# Per-folder config (which env this folder should use)
# ---------------------------------------------------------------------------

def _project_config_path(cwd=None):
    return os.path.join(cwd or os.getcwd(), PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE)


def load_project_config(cwd=None):
    cwd = cwd or os.getcwd()
    path = _project_config_path(cwd)

    if not os.path.exists(path):
        # Back-compat: a pre-existing project-local .jupy_env (Jupy's old
        # default behavior) means "stay put" rather than silently switching
        # this folder over to the new global default env.
        if os.path.isdir(get_project_env_path(cwd)):
            return {"env_mode": "project", "env_name": DEFAULT_ENV_NAME}
        return {"env_mode": "global", "env_name": DEFAULT_ENV_NAME}

    try:
        with open(path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        cfg.setdefault("env_mode", "global")
        cfg.setdefault("env_name", DEFAULT_ENV_NAME)
        return cfg
    except Exception:
        return {"env_mode": "global", "env_name": DEFAULT_ENV_NAME}


def save_project_config(cfg, cwd=None):
    path = _project_config_path(cwd)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


# ---------------------------------------------------------------------------
# Venv creation / interpreter paths
# ---------------------------------------------------------------------------

def _interpreter_paths(env_dir):
    if sys.platform == "win32":
        return (
            os.path.join(env_dir, "Scripts", "python.exe"),
            os.path.join(env_dir, "Scripts"),
        )
    return (
        os.path.join(env_dir, "bin", "python"),
        os.path.join(env_dir, "bin"),
    )


def _venv_is_valid(env_dir):
    """A venv directory is only really usable if its interpreter actually
    exists on disk. A directory that exists but is missing this — most often
    the result of an earlier venv.create() call that was interrupted, or
    files removed by antivirus software right after creation — is NOT valid,
    and must be recreated rather than reused as-is forever. Reusing a broken
    venv like this is what used to make jupy silently spawn a kernel process
    that could never start, surfacing downstream as a confusing "Kernel
    communication error: [Errno 22] Invalid argument" the moment a cell tried
    to run."""
    python, _ = _interpreter_paths(env_dir)
    return os.path.isfile(python)


def ensure_env(env_dir, on_progress=None):
    """Creates a venv at env_dir if missing *or incomplete*, installs Jupy's
    per-env deps (currently just Jedi, for in-process completions). Returns
    (python, bin). Raises RuntimeError with a clear, specific reason if the
    environment still isn't usable afterwards, instead of silently handing
    back a path to an interpreter that doesn't actually work."""
    if os.path.exists(env_dir) and not _venv_is_valid(env_dir):
        if on_progress:
            on_progress(f"Found an incomplete environment at {env_dir} — recreating…")
        try:
            import shutil
            shutil.rmtree(env_dir)
        except Exception as e:
            raise RuntimeError(
                f"Environment at {env_dir} is incomplete/broken and couldn't be "
                f"removed to recreate it: {e}. Try deleting that folder manually."
            ) from e

    if not os.path.exists(env_dir):
        if on_progress:
            on_progress(f"Creating environment at {env_dir}...")
        venv.create(env_dir, with_pip=True)

    python, binpath = _interpreter_paths(env_dir)

    if not os.path.isfile(python):
        raise RuntimeError(
            f"Failed to create a working Python environment at {env_dir} "
            f"(expected an interpreter at {python}, but it's missing). This "
            f"usually means venv creation was interrupted, or antivirus "
            f"software removed files right after creation."
        )

    try:
        subprocess.run([python, "-c", "import jedi"], check=True, capture_output=True)
    except Exception:
        if on_progress:
            on_progress("Installing completion engine...")
        subprocess.run([python, "-m", "pip", "install", "-q"] + JUPY_ENV_DEPENDENCIES, capture_output=True)

    return python, binpath


def ensure_jupy_dependencies():
    """Ensures Jupy's own server-side dependencies (psutil) are importable in
    the interpreter currently running the Jupy server (sys.executable) — the
    user's global Python, NOT any project/code venv. Installs them there if
    missing. Must be called before any module that imports these packages
    (e.g. core/metrics.py) is itself imported."""
    missing = []
    for pkg in JUPY_SERVER_DEPENDENCIES:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)

    if missing:
        print(f"[Jupy] Installing required packages into {sys.executable}: {', '.join(missing)}")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q"] + missing, capture_output=True)


# ---------------------------------------------------------------------------
# Listing global envs
# ---------------------------------------------------------------------------

def list_global_envs():
    root = get_envs_root()
    names = []
    try:
        for entry in sorted(os.listdir(root)):
            if os.path.isdir(os.path.join(root, entry)):
                names.append(entry)
    except Exception:
        pass
    if DEFAULT_ENV_NAME not in names:
        names.insert(0, DEFAULT_ENV_NAME)
    return names


def delete_global_env(name):
    if name == DEFAULT_ENV_NAME:
        return False, "Cannot delete the default environment."
    path = get_global_env_path(name)
    if not os.path.exists(path):
        return False, "Environment does not exist."
    try:
        import shutil
        shutil.rmtree(path)
        return True, ""
    except Exception as e:
        return False, str(e)


# ---------------------------------------------------------------------------
# Resolving / switching the active environment for the current folder
# ---------------------------------------------------------------------------

def resolve_active_env(on_progress=None):
    """Reads this folder's config (or defaults to the global 'default' env),
    ensures that env exists, and returns its info dict."""
    cfg = load_project_config()
    mode = cfg.get("env_mode", "global")
    name = cfg.get("env_name", DEFAULT_ENV_NAME)

    if mode == "project":
        env_dir = get_project_env_path()
        label = "This Folder (.jupy_env)"
    elif mode == "named":
        env_dir = get_global_env_path(name)
        label = f"Global: {name}"
    else:
        mode = "global"
        name = DEFAULT_ENV_NAME
        env_dir = get_global_env_path(DEFAULT_ENV_NAME)
        label = "Global: default"

    python, binpath = ensure_env(env_dir, on_progress=on_progress)

    return {
        "mode": mode,
        "name": name,
        "path": env_dir,
        "python": python,
        "bin": binpath,
        "label": label,
    }


def set_active_env(mode, name=None, on_progress=None):
    """Persists the folder's env choice and ensures it exists. Returns the
    resolved env info (same shape as resolve_active_env)."""
    if mode not in ("global", "project", "named"):
        raise ValueError(f"Invalid env mode: {mode}")

    cfg = {"env_mode": mode, "env_name": name or DEFAULT_ENV_NAME}
    save_project_config(cfg)
    return resolve_active_env(on_progress=on_progress)

---

# File: core\metrics.py

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


---

# File: core\terminal.py

import os
import re
import subprocess

ANSI_ESCAPE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')

def clean_text(text):
    return ANSI_ESCAPE.sub('', text)


def _get_kernel():
    # Imported lazily on purpose: importing this module (which handlers.py
    # does at startup) must NOT force the kernel subprocess to spawn before
    # the HTTP server is even listening.
    from jupy.core.kernel import kernel
    return kernel


class TerminalSession:
    """Executes shell commands in the currently active Jupy environment with
    real-time output streaming and a clean yellow prompt."""
    def __init__(self, ws_send_fn):
        self.ws_send_fn = ws_send_fn
        self.cwd = os.getcwd()

    def get_env(self):
        kernel = _get_kernel()
        env = os.environ.copy()
        env["VIRTUAL_ENV"] = kernel.env_info["path"]
        env["PATH"] = kernel.env_info["bin"] + os.path.pathsep + env.get("PATH", "")
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        return env

    def get_prompt(self):
        kernel = _get_kernel()
        return f"({kernel.env_info['name']}) ❯"

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

---

# File: core\venv.py

"""
jupy/core/venv.py

Pip package operations (list/install/uninstall/version) against a given
Python interpreter path. Environment *location* and *selection* now lives in
core/envmanager.py — this module just operates on whatever interpreter it's
given, so it works the same whether that's the global default env, a
project-local env, or a named env.
"""
import json
import subprocess

from jupy.core.envmanager import JUPY_INTERNAL_PACKAGE_NAMES


def list_packages(python):
    """Returns installed packages for the given interpreter as
    [{"name": ..., "version": ...}, ...], sorted by name, with Jupy's own
    internal per-env packages (e.g. jedi) filtered out of the view."""
    try:
        result = subprocess.run(
            [python, "-m", "pip", "list", "--format=json"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return []
        packages = json.loads(result.stdout)
        packages = [p for p in packages if p["name"].lower() not in JUPY_INTERNAL_PACKAGE_NAMES]
        packages.sort(key=lambda p: p["name"].lower())
        return packages
    except Exception:
        return []


def install_package(python, spec):
    """Installs a package (e.g. "requests" or "requests==2.32.0").
    Returns (success: bool, output: str)."""
    spec = (spec or "").strip()
    if not spec:
        return False, "No package name given."
    try:
        result = subprocess.run(
            [python, "-m", "pip", "install", spec],
            capture_output=True, text=True, timeout=300
        )
        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, f"Timed out installing {spec} (5 min limit)."
    except Exception as e:
        return False, str(e)


def uninstall_package(python, name):
    """Uninstalls a package. Returns (success: bool, output: str)."""
    name = (name or "").strip()
    if not name:
        return False, "No package name given."
    if name.lower() in JUPY_INTERNAL_PACKAGE_NAMES:
        return False, f"{name} is managed by Jupy and can't be removed here."
    try:
        result = subprocess.run(
            [python, "-m", "pip", "uninstall", "-y", name],
            capture_output=True, text=True, timeout=60
        )
        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, f"Timed out uninstalling {name}."
    except Exception as e:
        return False, str(e)


def get_python_version(python):
    """Returns the interpreter's version string, e.g. 'Python 3.11.6'."""
    try:
        result = subprocess.run([python, "--version"], capture_output=True, text=True, timeout=5)
        return (result.stdout or result.stderr or "").strip()
    except Exception:
        return "unknown"

---

# File: core\__init__.py

"""Jupy - Lightweight Brutalist Python Notebook"""
__version__ = "0.1.0"

---

# File: core\kernel\helpers.py

"""
jupy/core/kernel/helpers.py
Shared helpers for completions, hover, stdin, etc.
"""
import re
import keyword
import builtins
import importlib

def get_worker_completions(code, line, col, namespace):
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

def get_worker_hover(code, line, col):
    try:
        import jedi
        script = jedi.Script(code)
        names = script.infer(line, col)
        if not names:
            defs = script.goto(line, col, follow_imports=True)
            if defs:
                name = defs[0]
            else:
                return None
        else:
            name = names[0]
        docstring = name.docstring() or ""
        sig = ""
        if hasattr(name, 'get_signatures'):
            sigs = name.get_signatures()
            if sigs:
                sig = sigs[0].to_string()
        return {
            "name": name.name,
            "type": name.type,
            "description": docstring.split("\n")[0] if docstring else "",
            "docstring": docstring,
            "signature": sig,
            "module": name.module_name
        }
    except Exception:
        return None


---

# File: core\kernel\magics.py

"""
jupy/core/kernel/magics.py
All IPython-style magics (line and cell).
"""
import os
import sys
import subprocess
import shlex
import time
import tempfile
import io
import contextlib
from collections import deque

# Global state (per kernel instance)
alias_dict = {}
bookmark_dict = {}
dir_stack = deque()
pdb_mode = False
xmode = 'Context'  # 'Plain', 'Context', 'Verbose'
float_precision = None

# --------------------------------------------------------------------
# Helper: run system command and capture output
# --------------------------------------------------------------------
def run_system_command(cmd, capture=False, capture_stderr=False):
    try:
        if capture:
            stderr = subprocess.STDOUT if capture_stderr else subprocess.PIPE
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
            return result.stdout + (result.stderr if capture_stderr else '')
        else:
            subprocess.run(cmd, shell=True, check=False)
            return ''
    except Exception as e:
        return str(e)

# --------------------------------------------------------------------
# Magic implementations
# --------------------------------------------------------------------
def magic_paste(args, cell, namespace):
    # Try to use pyperclip
    try:
        import pyperclip
        text = pyperclip.paste()
        # Execute the pasted code
        exec(text, namespace)
        return "Pasted and executed code from clipboard."
    except ImportError:
        return "pyperclip not installed. Please install: pip install pyperclip"
    except Exception as e:
        return f"Error pasting: {e}"

def magic_cpaste(args, cell, namespace):
    # Read multi-line input until a blank line
    print("Paste your code below. End with a blank line.", file=sys.stderr)
    lines = []
    while True:
        try:
            line = sys.stdin.readline()
        except KeyboardInterrupt:
            return "Interrupted."
        if not line or line.strip() == '':
            break
        lines.append(line)
    code = ''.join(lines)
    try:
        exec(code, namespace)
        return "Executed pasted code."
    except Exception as e:
        return f"Error: {e}"

def magic_edit(args, cell, namespace):
    # Open editor (use $EDITOR or fallback)
    editor = os.environ.get('EDITOR', 'nano')
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.py', delete=False) as f:
        fname = f.name
    try:
        subprocess.run([editor, fname], check=True)
        with open(fname, 'r') as f:
            code = f.read()
        if code:
            exec(code, namespace)
            return f"Edited and executed {fname}"
        else:
            return "No code entered."
    except Exception as e:
        return f"Error: {e}"
    finally:
        try: os.unlink(fname)
        except: pass

def magic_env(args, cell, namespace):
    if not args:
        # show all env vars
        return '\n'.join(f"{k}={v}" for k,v in os.environ.items())
    if '=' in args[0]:
        # set var
        key, val = args[0].split('=', 1)
        os.environ[key] = val
        return f"Set {key}={val}"
    else:
        # get var
        key = args[0]
        return os.environ.get(key, '')

def magic_alias(args, cell, namespace):
    global alias_dict
    if not args:
        return '\n'.join(f"{k} -> {v}" for k,v in alias_dict.items())
    if len(args) == 1:
        # show specific alias
        return alias_dict.get(args[0], f"Alias {args[0]} not found.")
    else:
        name = args[0]
        cmd = ' '.join(args[1:])
        alias_dict[name] = cmd
        return f"Alias {name} = {cmd}"

def magic_unalias(args, cell, namespace):
    global alias_dict
    if not args:
        return "Usage: %unalias name"
    name = args[0]
    if name in alias_dict:
        del alias_dict[name]
        return f"Removed alias {name}"
    else:
        return f"Alias {name} not found."

def magic_bookmark(args, cell, namespace):
    global bookmark_dict
    if not args:
        return '\n'.join(f"{k} -> {v}" for k,v in bookmark_dict.items())
    if len(args) == 1:
        name = args[0]
        if name in bookmark_dict:
            os.chdir(bookmark_dict[name])
            return f"Changed to bookmark {name}: {bookmark_dict[name]}"
        else:
            return f"Bookmark {name} not found."
    else:
        name = args[0]
        path = args[1] if len(args) > 1 else os.getcwd()
        bookmark_dict[name] = os.path.abspath(path)
        return f"Bookmark {name} -> {bookmark_dict[name]}"

def magic_pushd(args, cell, namespace):
    global dir_stack
    if not args:
        # push current dir and go to home
        dir_stack.append(os.getcwd())
        os.chdir(os.path.expanduser('~'))
        return f"Pushed {os.getcwd()}"
    else:
        dir_stack.append(os.getcwd())
        try:
            os.chdir(args[0])
            return f"Changed to {args[0]}"
        except Exception as e:
            dir_stack.pop()
            return f"Error: {e}"

def magic_popd(args, cell, namespace):
    global dir_stack
    if not dir_stack:
        return "Directory stack is empty."
    prev = dir_stack.pop()
    os.chdir(prev)
    return f"Popped back to {prev}"

def magic_dirs(args, cell, namespace):
    global dir_stack
    return '\n'.join(f"{i}: {d}" for i,d in enumerate(dir_stack))

def magic_sc(args, cell, namespace):
    # shell capture: %sc [options] command
    if not args:
        return "Usage: %sc command"
    cmd = ' '.join(args)
    return run_system_command(cmd, capture=True)

def magic_system(args, cell, namespace):
    # %system or ! command
    if not args:
        return "Usage: %system command"
    cmd = ' '.join(args)
    return run_system_command(cmd, capture=False)

def magic_prun(args, cell, namespace):
    # %prun statement – run under cProfile
    import cProfile, pstats, io
    if not args:
        return "Usage: %prun statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell  # cell magic
    prof = cProfile.Profile()
    try:
        prof.enable()
        exec(code, namespace)
        prof.disable()
    except Exception as e:
        return f"Error: {e}"
    stream = io.StringIO()
    stats = pstats.Stats(prof, stream=stream)
    stats.sort_stats('cumtime').print_stats(20)
    return stream.getvalue()

def magic_lprun(args, cell, namespace):
    # needs line_profiler
    try:
        from line_profiler import LineProfiler
    except ImportError:
        return "line_profiler not installed. Install: pip install line_profiler"
    if not args:
        return "Usage: %lprun statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    prof = LineProfiler()
    try:
        prof.runctx(code, namespace, namespace)
        return prof.print_stats()
    except Exception as e:
        return f"Error: {e}"

def magic_mprun(args, cell, namespace):
    # needs memory_profiler
    try:
        from memory_profiler import memory_usage
    except ImportError:
        return "memory_profiler not installed. Install: pip install memory_profiler"
    if not args:
        return "Usage: %mprun statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    def f():
        exec(code, namespace)
    mem = memory_usage(f, interval=0.1, timeout=10)
    return f"Memory usage: {max(mem):.2f} MiB"

def magic_memit(args, cell, namespace):
    # measure memory usage of a statement
    if not args:
        return "Usage: %memit statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    try:
        from memory_profiler import memory_usage
        def f():
            exec(code, namespace)
        mem = memory_usage(f, interval=0.1, timeout=10)
        return f"Memory usage: {max(mem):.2f} MiB"
    except ImportError:
        # fallback: use psutil
        try:
            import psutil
            process = psutil.Process(os.getpid())
            before = process.memory_info().rss
            exec(code, namespace)
            after = process.memory_info().rss
            diff = (after - before) / (1024*1024)
            return f"Memory used: {diff:.2f} MiB"
        except:
            return "memory_profiler or psutil required."

def magic_pdb(args, cell, namespace):
    global pdb_mode
    if not args:
        return f"pdb mode is {'on' if pdb_mode else 'off'}"
    val = args[0].lower()
    if val in ('on', 'true', '1'):
        pdb_mode = True
        return "pdb mode ON"
    else:
        pdb_mode = False
        return "pdb mode OFF"

def magic_xmode(args, cell, namespace):
    global xmode
    if not args:
        return f"xmode = {xmode}"
    mode = args[0].capitalize()
    if mode in ('Plain', 'Context', 'Verbose'):
        xmode = mode
        return f"xmode set to {mode}"
    else:
        return f"Invalid mode: {mode}. Use Plain, Context, or Verbose."

def magic_precision(args, cell, namespace):
    global float_precision
    if not args:
        return f"float precision = {float_precision}"
    try:
        val = int(args[0])
        float_precision = val
        return f"Set float precision to {val}"
    except:
        return "Usage: %precision <integer>"

def magic_config(args, cell, namespace):
    return "Configuration system not implemented yet."

def magic_gui(args, cell, namespace):
    return "GUI event loop integration not implemented."

def magic_load_ext(args, cell, namespace):
    if not args:
        return "Usage: %load_ext module"
    try:
        __import__(args[0])
        return f"Loaded extension {args[0]}"
    except Exception as e:
        return f"Error: {e}"

def magic_unload_ext(args, cell, namespace):
    if not args:
        return "Usage: %unload_ext module"
    # remove from sys.modules?
    if args[0] in sys.modules:
        del sys.modules[args[0]]
        return f"Unloaded {args[0]}"
    else:
        return f"{args[0]} not loaded."

def magic_reload_ext(args, cell, namespace):
    if not args:
        return "Usage: %reload_ext module"
    try:
        import importlib
        mod = importlib.import_module(args[0])
        importlib.reload(mod)
        return f"Reloaded {args[0]}"
    except Exception as e:
        return f"Error: {e}"

# --------------------------------------------------------------------
# Dispatch table
# --------------------------------------------------------------------
MAGIC_DISPATCH = {
    'paste': magic_paste,
    'cpaste': magic_cpaste,
    'edit': magic_edit,
    'env': magic_env,
    'alias': magic_alias,
    'unalias': magic_unalias,
    'bookmark': magic_bookmark,
    'pushd': magic_pushd,
    'popd': magic_popd,
    'dirs': magic_dirs,
    'sc': magic_sc,
    'system': magic_system,
    'prun': magic_prun,
    'lprun': magic_lprun,
    'mprun': magic_mprun,
    'memit': magic_memit,
    'pdb': magic_pdb,
    'xmode': magic_xmode,
    'precision': magic_precision,
    'config': magic_config,
    'gui': magic_gui,
    'load_ext': magic_load_ext,
    'unload_ext': magic_unload_ext,
    'reload_ext': magic_reload_ext,
}


---

# File: core\kernel\manager.py

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

---

# File: core\kernel\worker_script.py

# jupy/core/kernel/worker_script.py
# All code is embedded – no external imports required.

KERNEL_WORKER_SCRIPT = r"""
import sys, io, ast, base64, json, traceback, builtins, warnings, re, keyword, importlib, threading
import contextlib, time, os, subprocess, glob, shutil, tempfile, shlex
warnings.filterwarnings("ignore", category=UserWarning, module="matplotlib")

# ----------------------------------------------------------------------
# Global namespace (defined once)
# ----------------------------------------------------------------------
namespace = {"__name__": "__main__"}

# ----------------------------------------------------------------------
# Helpers (completions, hover)
# ----------------------------------------------------------------------
def get_worker_completions(code, line, col, namespace):
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
                    except: pass
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

def get_worker_hover(code, line, col):
    try:
        import jedi
        script = jedi.Script(code)
        names = script.infer(line, col)
        if not names:
            defs = script.goto(line, col, follow_imports=True)
            if defs:
                name = defs[0]
            else:
                return None
        else:
            name = names[0]
        docstring = name.docstring() or ""
        sig = ""
        if hasattr(name, 'get_signatures'):
            sigs = name.get_signatures()
            if sigs:
                sig = sigs[0].to_string()
        return {
            "name": name.name,
            "type": name.type,
            "description": docstring.split("\n")[0] if docstring else "",
            "docstring": docstring,
            "signature": sig,
            "module": name.module_name
        }
    except Exception:
        return None

# ----------------------------------------------------------------------
# Magics (full implementation)
# ----------------------------------------------------------------------
_alias_dict = {}
_bookmark_dict = {}
_dir_stack = []
_pdb_mode = False
_xmode = 'Context'
_float_precision = None

def _run_magic(line, cell, namespace):
    parts = line.strip().split()
    if not parts:
        return ""
    magic_name = parts[0].lstrip('%')
    args = parts[1:]

    if magic_name == 'paste':
        return _magic_paste(args, cell, namespace)
    elif magic_name == 'cpaste':
        return _magic_cpaste(args, cell, namespace)
    elif magic_name == 'edit':
        return _magic_edit(args, cell, namespace)
    elif magic_name == 'env':
        return _magic_env(args, cell, namespace)
    elif magic_name == 'alias':
        return _magic_alias(args, cell, namespace)
    elif magic_name == 'unalias':
        return _magic_unalias(args, cell, namespace)
    elif magic_name == 'bookmark':
        return _magic_bookmark(args, cell, namespace)
    elif magic_name == 'pushd':
        return _magic_pushd(args, cell, namespace)
    elif magic_name == 'popd':
        return _magic_popd(args, cell, namespace)
    elif magic_name == 'dirs':
        return _magic_dirs(args, cell, namespace)
    elif magic_name == 'sc':
        return _magic_sc(args, cell, namespace)
    elif magic_name == 'system':
        return _magic_system(args, cell, namespace)
    elif magic_name == 'prun':
        return _magic_prun(args, cell, namespace)
    elif magic_name == 'lprun':
        return _magic_lprun(args, cell, namespace)
    elif magic_name == 'mprun':
        return _magic_mprun(args, cell, namespace)
    elif magic_name == 'memit':
        return _magic_memit(args, cell, namespace)
    elif magic_name == 'pdb':
        return _magic_pdb(args, cell, namespace)
    elif magic_name == 'xmode':
        return _magic_xmode(args, cell, namespace)
    elif magic_name == 'precision':
        return _magic_precision(args, cell, namespace)
    elif magic_name == 'config':
        return "Configuration system not implemented."
    elif magic_name == 'gui':
        return "GUI event loop integration not implemented."
    elif magic_name == 'load_ext':
        return _magic_load_ext(args, cell, namespace)
    elif magic_name == 'unload_ext':
        return _magic_unload_ext(args, cell, namespace)
    elif magic_name == 'reload_ext':
        return _magic_reload_ext(args, cell, namespace)
    elif magic_name == 'time':
        return _magic_time(args, cell, namespace)
    elif magic_name == 'timeit':
        return _magic_timeit(args, cell, namespace)
    elif magic_name == 'cd':
        return _magic_cd(args, cell, namespace)
    elif magic_name == 'pwd':
        return _magic_pwd(args, cell, namespace)
    elif magic_name == 'ls':
        return _magic_ls(args, cell, namespace)
    elif magic_name == 'who':
        return _magic_who(args, cell, namespace)
    elif magic_name == 'reset':
        return _magic_reset(args, cell, namespace)
    elif magic_name == 'matplotlib':
        return _magic_matplotlib(args, cell, namespace)
    elif magic_name == 'autoreload':
        return _magic_autoreload(args, cell, namespace)
    elif magic_name == 'run':
        return _magic_run(args, cell, namespace)
    elif magic_name == 'load':
        return _magic_load(args, cell, namespace)
    elif magic_name == 'store':
        return _magic_store(args, cell, namespace)
    elif magic_name == 'history':
        return _magic_history(args, cell, namespace)
    elif magic_name == 'debug':
        return "Debugger not implemented. Use %pdb."
    else:
        return f"Unknown magic: {magic_name}"

# ---- All magic functions (complete) ----
def _magic_paste(args, cell, namespace):
    try:
        import pyperclip
        text = pyperclip.paste()
        exec(text, namespace)
        return "Pasted and executed code from clipboard."
    except ImportError:
        return "pyperclip not installed. Install: pip install pyperclip"
    except Exception as e:
        return f"Error: {e}"

def _magic_cpaste(args, cell, namespace):
    print("Paste your code below. End with a blank line.", file=sys.stderr)
    lines = []
    while True:
        try:
            line = sys.stdin.readline()
        except KeyboardInterrupt:
            return "Interrupted."
        if not line or line.strip() == '':
            break
        lines.append(line)
    code = ''.join(lines)
    try:
        exec(code, namespace)
        return "Executed pasted code."
    except Exception as e:
        return f"Error: {e}"

def _magic_edit(args, cell, namespace):
    editor = os.environ.get('EDITOR', 'nano')
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.py', delete=False) as f:
        fname = f.name
    try:
        subprocess.run([editor, fname], check=True)
        with open(fname, 'r') as f:
            code = f.read()
        if code:
            exec(code, namespace)
            return f"Edited and executed {fname}"
        else:
            return "No code entered."
    except Exception as e:
        return f"Error: {e}"
    finally:
        try: os.unlink(fname)
        except: pass

def _magic_env(args, cell, namespace):
    if not args:
        return '\n'.join(f"{k}={v}" for k,v in os.environ.items())
    if '=' in args[0]:
        key, val = args[0].split('=', 1)
        os.environ[key] = val
        return f"Set {key}={val}"
    else:
        key = args[0]
        return os.environ.get(key, '')

def _magic_alias(args, cell, namespace):
    global _alias_dict
    if not args:
        return '\n'.join(f"{k} -> {v}" for k,v in _alias_dict.items())
    if len(args) == 1:
        return _alias_dict.get(args[0], f"Alias {args[0]} not found.")
    else:
        name = args[0]
        cmd = ' '.join(args[1:])
        _alias_dict[name] = cmd
        return f"Alias {name} = {cmd}"

def _magic_unalias(args, cell, namespace):
    global _alias_dict
    if not args:
        return "Usage: %unalias name"
    name = args[0]
    if name in _alias_dict:
        del _alias_dict[name]
        return f"Removed alias {name}"
    else:
        return f"Alias {name} not found."

def _magic_bookmark(args, cell, namespace):
    global _bookmark_dict
    if not args:
        return '\n'.join(f"{k} -> {v}" for k,v in _bookmark_dict.items())
    if len(args) == 1:
        name = args[0]
        if name in _bookmark_dict:
            os.chdir(_bookmark_dict[name])
            return f"Changed to bookmark {name}: {_bookmark_dict[name]}"
        else:
            return f"Bookmark {name} not found."
    else:
        name = args[0]
        path = args[1] if len(args) > 1 else os.getcwd()
        _bookmark_dict[name] = os.path.abspath(path)
        return f"Bookmark {name} -> {_bookmark_dict[name]}"

def _magic_pushd(args, cell, namespace):
    global _dir_stack
    if not args:
        _dir_stack.append(os.getcwd())
        os.chdir(os.path.expanduser('~'))
        return f"Pushed {os.getcwd()}"
    else:
        _dir_stack.append(os.getcwd())
        try:
            os.chdir(args[0])
            return f"Changed to {args[0]}"
        except Exception as e:
            _dir_stack.pop()
            return f"Error: {e}"

def _magic_popd(args, cell, namespace):
    global _dir_stack
    if not _dir_stack:
        return "Directory stack is empty."
    prev = _dir_stack.pop()
    os.chdir(prev)
    return f"Popped back to {prev}"

def _magic_dirs(args, cell, namespace):
    global _dir_stack
    return '\n'.join(f"{i}: {d}" for i,d in enumerate(_dir_stack))

def _magic_sc(args, cell, namespace):
    if not args:
        return "Usage: %sc command"
    cmd = ' '.join(args)
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        return result.stdout + result.stderr
    except Exception as e:
        return str(e)

def _magic_system(args, cell, namespace):
    if not args:
        return "Usage: %system command"
    cmd = ' '.join(args)
    try:
        subprocess.run(cmd, shell=True, check=False)
        return ""
    except Exception as e:
        return str(e)

def _magic_prun(args, cell, namespace):
    import cProfile, pstats, io
    if not args:
        return "Usage: %prun statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    prof = cProfile.Profile()
    try:
        prof.enable()
        exec(code, namespace)
        prof.disable()
    except Exception as e:
        return f"Error: {e}"
    stream = io.StringIO()
    stats = pstats.Stats(prof, stream=stream)
    stats.sort_stats('cumtime').print_stats(20)
    return stream.getvalue()

def _magic_lprun(args, cell, namespace):
    try:
        from line_profiler import LineProfiler
    except ImportError:
        return "line_profiler not installed. Install: pip install line_profiler"
    if not args:
        return "Usage: %lprun statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    prof = LineProfiler()
    try:
        prof.runctx(code, namespace, namespace)
        return prof.print_stats()
    except Exception as e:
        return f"Error: {e}"

def _magic_mprun(args, cell, namespace):
    try:
        from memory_profiler import memory_usage
    except ImportError:
        return "memory_profiler not installed. Install: pip install memory_profiler"
    if not args:
        return "Usage: %mprun statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    def f():
        exec(code, namespace)
    mem = memory_usage(f, interval=0.1, timeout=10)
    return f"Memory usage: {max(mem):.2f} MiB"

def _magic_memit(args, cell, namespace):
    if not args:
        return "Usage: %memit statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    try:
        from memory_profiler import memory_usage
        def f():
            exec(code, namespace)
        mem = memory_usage(f, interval=0.1, timeout=10)
        return f"Memory usage: {max(mem):.2f} MiB"
    except ImportError:
        try:
            import psutil
            process = psutil.Process(os.getpid())
            before = process.memory_info().rss
            exec(code, namespace)
            after = process.memory_info().rss
            diff = (after - before) / (1024*1024)
            return f"Memory used: {diff:.2f} MiB"
        except:
            return "memory_profiler or psutil required."

def _magic_pdb(args, cell, namespace):
    global _pdb_mode
    if not args:
        return f"pdb mode is {'on' if _pdb_mode else 'off'}"
    val = args[0].lower()
    if val in ('on', 'true', '1'):
        _pdb_mode = True
        return "pdb mode ON"
    else:
        _pdb_mode = False
        return "pdb mode OFF"

def _magic_xmode(args, cell, namespace):
    global _xmode
    if not args:
        return f"xmode = {_xmode}"
    mode = args[0].capitalize()
    if mode in ('Plain', 'Context', 'Verbose'):
        _xmode = mode
        return f"xmode set to {mode}"
    else:
        return f"Invalid mode: {mode}. Use Plain, Context, or Verbose."

def _magic_precision(args, cell, namespace):
    global _float_precision
    if not args:
        return f"float precision = {_float_precision}"
    try:
        val = int(args[0])
        _float_precision = val
        return f"Set float precision to {val}"
    except:
        return "Usage: %precision <integer>"

def _magic_load_ext(args, cell, namespace):
    if not args:
        return "Usage: %load_ext module"
    try:
        __import__(args[0])
        return f"Loaded extension {args[0]}"
    except Exception as e:
        return f"Error: {e}"

def _magic_unload_ext(args, cell, namespace):
    if not args:
        return "Usage: %unload_ext module"
    if args[0] in sys.modules:
        del sys.modules[args[0]]
        return f"Unloaded {args[0]}"
    else:
        return f"{args[0]} not loaded."

def _magic_reload_ext(args, cell, namespace):
    if not args:
        return "Usage: %reload_ext module"
    try:
        import importlib
        mod = importlib.import_module(args[0])
        importlib.reload(mod)
        return f"Reloaded {args[0]}"
    except Exception as e:
        return f"Error: {e}"

def _magic_time(args, cell, namespace):
    code = ' '.join(args) if args else ''
    if not code:
        return "Usage: %time statement"
    start = time.perf_counter()
    try:
        exec(code, namespace)
    except Exception as e:
        return f"Error: {e}"
    elapsed = time.perf_counter() - start
    return f"CPU times: user {elapsed:.6f} s, sys: 0 s, total: {elapsed:.6f} s"

def _magic_timeit(args, cell, namespace):
    import timeit
    if cell is not None:
        code = cell
    else:
        code = ' '.join(args) if args else ''
        if not code:
            return "Usage: %timeit statement"
    try:
        timer = timeit.Timer(code, globals=namespace)
        number, _ = timer.autorange()
        result = timer.timeit(number)
        return f"{result:.6f} seconds (average over {number} runs)"
    except Exception as e:
        return f"Error in timeit: {e}"

def _magic_cd(args, cell, namespace):
    if not args:
        return f"Current directory: {os.getcwd()}"
    path = args[0]
    try:
        os.chdir(path)
        return f"Changed to: {os.getcwd()}"
    except Exception as e:
        return f"Error: {e}"

def _magic_pwd(args, cell, namespace):
    return os.getcwd()

def _magic_ls(args, cell, namespace):
    path = args[0] if args else '.'
    try:
        items = os.listdir(path)
        return '\n'.join(items)
    except Exception as e:
        return f"Error: {e}"

def _magic_who(args, cell, namespace):
    vars_list = [k for k in namespace.keys() if not k.startswith('_') and k not in ('display', '__builtins__')]
    if not vars_list:
        return "No user variables."
    return "Variables:\n" + '\n'.join(vars_list)

def _magic_reset(args, cell, namespace):
    keep = ['display', '__builtins__']
    for k in list(namespace.keys()):
        if k not in keep and not k.startswith('_'):
            del namespace[k]
    return "Namespace reset."

def _magic_matplotlib(args, cell, namespace):
    backend = args[0] if args else 'inline'
    if backend == 'inline':
        try:
            import matplotlib
            matplotlib.use('Agg')
            return "Matplotlib backend set to inline (Agg)."
        except Exception as e:
            return f"Error setting backend: {e}"
    else:
        return f"Unsupported backend: {backend}. Only 'inline' is implemented."

_autoreload_enabled = False
def _magic_autoreload(args, cell, namespace):
    global _autoreload_enabled
    if args and args[0] == '2':
        _autoreload_enabled = True
        return "Autoreload enabled (level 2)."
    elif args and args[0] == '0':
        _autoreload_enabled = False
        return "Autoreload disabled."
    else:
        return f"Autoreload currently {'enabled' if _autoreload_enabled else 'disabled'}. Use %autoreload 2 to enable, %autoreload 0 to disable."

def _magic_run(args, cell, namespace):
    if not args:
        return "Usage: %run script.py [args]"
    filename = args[0]
    script_args = args[1:]
    try:
        with open(filename, 'r') as f:
            code = f.read()
        exec(code, namespace)
        return f"Executed {filename} successfully."
    except Exception as e:
        return f"Error running script: {e}"

def _magic_load(args, cell, namespace):
    if not args:
        return "Usage: %load filename.py"
    filename = args[0]
    try:
        with open(filename, 'r') as f:
            content = f.read()
        sys.stdout.write("---JUPY_LOAD_CELL---\n")
        sys.stdout.write(json.dumps({"content": content}) + "\n")
        sys.stdout.flush()
        return ""
    except Exception as e:
        return f"Error loading file: {e}"

_stored_vars = {}
def _magic_store(args, cell, namespace):
    global _stored_vars
    if not args:
        return "Usage: %store var  or  %store -r var"
    if args[0] == '-r':
        var = args[1] if len(args) > 1 else None
        if var is None:
            return "Usage: %store -r var"
        if var in _stored_vars:
            namespace[var] = _stored_vars[var]
            return f"Restored {var}"
        else:
            return f"Variable {var} not found in store."
    else:
        var = args[0]
        if var in namespace:
            _stored_vars[var] = namespace[var]
            return f"Stored {var}"
        else:
            return f"Variable {var} not found in namespace."

_magic_history = []
def _magic_history(args, cell, namespace):
    return "History:\n" + '\n'.join(_magic_history[-20:])

# ----------------------------------------------------------------------
# Full ipywidgets system
# ----------------------------------------------------------------------
_widgets = {}
_widget_counter = 0
_links = {}
_link_counter = 0

class WidgetProxy:
    def __init__(self, widget_type, **kwargs):
        global _widget_counter
        self.id = f"widget-{_widget_counter}"
        _widget_counter += 1
        self.type = widget_type
        self.kwargs = kwargs
        self._callbacks = {}
        self._children = kwargs.pop('children', [])
        self._send_widget_event('create', {**kwargs, 'widget_id': self.id, 'type': widget_type})
        _widgets[self.id] = self

    def _send_widget_event(self, event, data):
        msg = {'event': event, 'widget_id': self.id, 'type': self.type, 'data': data}
        sys.stdout.write("---JUPY_WIDGET---\n")
        sys.stdout.write(json.dumps(msg) + "\n")
        sys.stdout.flush()

    def set_state(self, **kwargs):
        self.kwargs.update(kwargs)
        self._send_widget_event('update', kwargs)

    def observe(self, callback, names='value'):
        if isinstance(names, str):
            names = [names]
        for name in names:
            if name not in self._callbacks:
                self._callbacks[name] = []
            self._callbacks[name].append(callback)

    def on_click(self, callback):
        self.observe(callback, 'click')

    def _handle_frontend_event(self, event_data):
        for attr, value in event_data.items():
            if attr == 'value' or attr == 'click':
                self.kwargs[attr] = value
                if attr in self._callbacks:
                    for cb in self._callbacks[attr]:
                        cb(value)
                for link in _links.values():
                    if link.source_id == self.id:
                        link.propagate(value)

class Link:
    def __init__(self, source, target, transform=None, bidirectional=False):
        global _link_counter
        self.id = f"link-{_link_counter}"
        _link_counter += 1
        self.source_id = source.id if hasattr(source, 'id') else source
        self.target_id = target.id if hasattr(target, 'id') else target
        self.transform = transform
        self.bidirectional = bidirectional
        _links[self.id] = self
        msg = {
            'event': 'link' if not bidirectional else 'dlink',
            'widget_id': self.id,
            'data': {
                'source': self.source_id,
                'target': self.target_id,
                'transform': transform
            }
        }
        sys.stdout.write("---JUPY_WIDGET---\n")
        sys.stdout.write(json.dumps(msg) + "\n")
        sys.stdout.flush()

    def propagate(self, value):
        if self.transform:
            value = self.transform(value)
        target = _widgets.get(self.target_id)
        if target:
            target.set_state(value=value)

def link(source, target, transform=None):
    return Link(source, target, transform, bidirectional=False)

def dlink(source, target, transform=None):
    return Link(source, target, transform, bidirectional=True)

# ---- Widget classes ----
def IntSlider(**kwargs):
    return WidgetProxy('IntSlider', **kwargs)

def FloatSlider(**kwargs):
    return WidgetProxy('FloatSlider', **kwargs)

def IntText(**kwargs):
    return WidgetProxy('IntText', **kwargs)

def FloatText(**kwargs):
    return WidgetProxy('FloatText', **kwargs)

def Checkbox(**kwargs):
    return WidgetProxy('Checkbox', **kwargs)

def RadioButtons(**kwargs):
    return WidgetProxy('RadioButtons', **kwargs)

def ToggleButton(**kwargs):
    return WidgetProxy('ToggleButton', **kwargs)

def ToggleButtons(**kwargs):
    return WidgetProxy('ToggleButtons', **kwargs)

def Dropdown(**kwargs):
    return WidgetProxy('Dropdown', **kwargs)

def Select(**kwargs):
    return WidgetProxy('Select', **kwargs)

def SelectMultiple(**kwargs):
    return WidgetProxy('SelectMultiple', **kwargs)

def DatePicker(**kwargs):
    return WidgetProxy('DatePicker', **kwargs)

def TimePicker(**kwargs):
    return WidgetProxy('TimePicker', **kwargs)

def ColorPicker(**kwargs):
    return WidgetProxy('ColorPicker', **kwargs)

def FileUpload(**kwargs):
    return WidgetProxy('FileUpload', **kwargs)

def Play(**kwargs):
    return WidgetProxy('Play', **kwargs)

def VBox(**kwargs):
    return WidgetProxy('VBox', **kwargs)

def HBox(**kwargs):
    return WidgetProxy('HBox', **kwargs)

def GridBox(**kwargs):
    return WidgetProxy('GridBox', **kwargs)

def Accordion(**kwargs):
    return WidgetProxy('Accordion', **kwargs)

def Tab(**kwargs):
    return WidgetProxy('Tab', **kwargs)

def Stack(**kwargs):
    return WidgetProxy('Stack', **kwargs)

def Box(**kwargs):
    return WidgetProxy('Box', **kwargs)

def Output(**kwargs):
    return WidgetProxy('Output', **kwargs)

def interact(func=None, **options):
    if func is None:
        def decorator(f):
            return interact(f, **options)
        return decorator
    else:
        widgets = {}
        for name, value in options.items():
            if isinstance(value, (int, float)):
                widgets[name] = IntSlider(value=value, min=0, max=10*value, description=name)
            elif isinstance(value, list):
                widgets[name] = Dropdown(options=value, value=value[0], description=name)
            elif isinstance(value, bool):
                widgets[name] = Checkbox(value=value, description=name)
            else:
                widgets[name] = IntText(value=value, description=name)
        if widgets:
            display(VBox(children=list(widgets.values())))
        def wrapper(*args, **kwargs):
            kwargs = {name: w.kwargs.get('value') for name, w in widgets.items()}
            return func(**kwargs)
        for w in widgets.values():
            w.observe(lambda _: wrapper(), 'value')
        return wrapper

# Populate namespace with widget classes
namespace['IntSlider'] = IntSlider
namespace['FloatSlider'] = FloatSlider
namespace['IntText'] = IntText
namespace['FloatText'] = FloatText
namespace['Checkbox'] = Checkbox
namespace['RadioButtons'] = RadioButtons
namespace['ToggleButton'] = ToggleButton
namespace['ToggleButtons'] = ToggleButtons
namespace['Dropdown'] = Dropdown
namespace['Select'] = Select
namespace['SelectMultiple'] = SelectMultiple
namespace['DatePicker'] = DatePicker
namespace['TimePicker'] = TimePicker
namespace['ColorPicker'] = ColorPicker
namespace['FileUpload'] = FileUpload
namespace['Play'] = Play
namespace['VBox'] = VBox
namespace['HBox'] = HBox
namespace['GridBox'] = GridBox
namespace['Accordion'] = Accordion
namespace['Tab'] = Tab
namespace['Stack'] = Stack
namespace['Box'] = Box
namespace['Output'] = Output
namespace['link'] = link
namespace['dlink'] = dlink
namespace['interact'] = interact

# ----------------------------------------------------------------------
# Display, plots, input, warmup – WITH FULL IPYWIDGETS SUPPORT
# ----------------------------------------------------------------------
def _send_display_data(mimebundle):
    sys.stdout.write("---JUPY_DISPLAY_DATA---\n")
    sys.stdout.write(json.dumps(mimebundle) + "\n")
    sys.stdout.flush()

def _encode_binary(data):
    if isinstance(data, bytes):
        return base64.b64encode(data).decode('ascii')
    return data

def display(*objs, raw=False, **kwargs):
    if len(objs) == 0:
        return
    if len(objs) > 1:
        for obj in objs:
            display(obj, raw=raw, **kwargs)
        return

    obj = objs[0]

    # 1. If it's already a MIME bundle dict
    if isinstance(obj, dict) and any(k in obj for k in ('text/html', 'text/plain', 'image/png', 'image/svg+xml')):
        for mime in ('image/png', 'image/jpeg', 'image/gif'):
            if mime in obj:
                obj[mime] = _encode_binary(obj[mime])
        _send_display_data(obj)
        return

    # 2. Try to get rich representations (including ipywidgets)
    mimebundle = {}

    # 2a. Check for _repr_mimebundle_ (used by ipywidgets)
    if hasattr(obj, '_repr_mimebundle_'):
        try:
            bundle = obj._repr_mimebundle_()
            if isinstance(bundle, dict):
                mimebundle.update(bundle)
                for key, val in mimebundle.items():
                    if isinstance(val, list):
                        mimebundle[key] = val[0] if val else None
        except Exception:
            pass

    # 2b. Individual _repr_*_ methods
    for fmt in ('html', 'svg', 'latex', 'markdown', 'json', 'png', 'jpeg', 'gif'):
        if fmt not in mimebundle:
            method = getattr(obj, f'_repr_{fmt}_', None)
            if method is not None:
                try:
                    data = method()
                    if data is not None:
                        mimebundle[f'text/{fmt}'] = data
                except Exception:
                    pass

    # 2c. Pandas DataFrames
    if hasattr(obj, '_repr_html_'):
        try:
            html = obj._repr_html_()
            if html:
                mimebundle['text/html'] = html
        except Exception:
            pass

    # 2d. If nothing yet, try repr
    if not mimebundle:
        try:
            mimebundle['text/plain'] = repr(obj)
        except Exception:
            mimebundle['text/plain'] = str(obj)

    # 2e. Encode binary image data
    for mime in ('image/png', 'image/jpeg', 'image/gif'):
        if mime in mimebundle:
            mimebundle[mime] = _encode_binary(mimebundle[mime])

    # 2f. If raw=True, only send text/plain
    if raw:
        mimebundle = {'text/plain': mimebundle.get('text/plain', str(obj))}

    if mimebundle:
        _send_display_data(mimebundle)

# Patch IPython.display.display
def _patch_ipython_display():
    try:
        import IPython.display
        IPython.display.display = display
    except ImportError:
        pass

# Send ready marker, then patch IPython
sys.stdout.write("---JUPY_KERNEL_READY---\n")
sys.stdout.flush()
_patch_ipython_display()

# Matplotlib plot capture
_matplotlib_backend_set = False
def _capture_plots():
    global _matplotlib_backend_set
    plots = []
    if "matplotlib.pyplot" in sys.modules:
        import matplotlib.pyplot as plt
        from matplotlib._pylab_helpers import Gcf
        if not _matplotlib_backend_set:
            try:
                import matplotlib
                matplotlib.use("Agg", force=True)
                _matplotlib_backend_set = True
            except Exception:
                pass
        fignums = plt.get_fignums()
        for i in list(fignums):
            try:
                manager = Gcf.get_fig_manager(i)
                if manager and manager.canvas and manager.canvas.figure:
                    fig = manager.canvas.figure
                    if fig.get_axes():
                        try: fig.tight_layout()
                        except: pass
                        buf = io.BytesIO()
                        fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0.1, dpi=110, facecolor="#FFFFFF")
                        buf.seek(0)
                        b64 = base64.b64encode(buf.read()).decode("ascii")
                        plots.append(f'<img class="notebook-plot" src="data:image/png;base64,{b64}" alt="Plot" />')
            except: pass
        try: plt.close("all")
        except: pass
        try: Gcf.destroy_all()
        except: pass
        try: Gcf.figs.clear()
        except: pass
    return plots

def _warmup_jedi():
    try:
        import jedi
        jedi.Script("import math\nmath.").complete(2, 5)
    except:
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

# ----------------------------------------------------------------------
# Main execution loop
# ----------------------------------------------------------------------
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
            comps = get_worker_completions(code, l_num, c_num, namespace)
            sys.stdout.write(f"---JUPY_COMPS:{json.dumps(comps)}---\n")
            sys.stdout.flush()
        elif action == "hover":
            code = data.get("code", "")
            l_num = data.get("line", 1)
            c_num = data.get("column", 0)
            info = get_worker_hover(code, l_num, c_num)
            sys.stdout.write(f"---JUPY_HOVER:{json.dumps(info)}---\n")
            sys.stdout.flush()
        elif action == "widget_event":
            widget_id = data.get('widget_id')
            event_data = data.get('data', {})
            if widget_id in _widgets:
                _widgets[widget_id]._handle_frontend_event(event_data)
            continue
        elif action == "execute":
            code = data.get("code", "")
            lines = code.splitlines()
            # Cell magic %%
            if lines and lines[0].startswith('%%'):
                magic_line = lines[0]
                cell_body = '\n'.join(lines[1:])
                parts = magic_line[2:].strip().split()
                magic_name = parts[0] if parts else ''
                args = parts[1:]
                magic_str = '%' + magic_name + ' ' + ' '.join(args)
                result = _run_magic(magic_str, cell_body, namespace)
                if result:
                    sys.stdout.write("---JUPY_STDOUT---\n")
                    sys.stdout.write(result + "\n")
                sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
                sys.stdout.flush()
                continue
            # Line magic %
            if lines and lines[0].strip().startswith('%'):
                magic_line = lines[0].strip()
                result = _run_magic(magic_line, None, namespace)
                if result:
                    sys.stdout.write("---JUPY_STDOUT---\n")
                    sys.stdout.write(result + "\n")
                if len(lines) > 1:
                    code = '\n'.join(lines[1:])
                else:
                    code = ''
                if not code:
                    sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
                    sys.stdout.flush()
                    continue
            # System command !
            if lines and lines[0].strip().startswith('!'):
                cmd = lines[0].strip()[1:]
                try:
                    proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
                    if proc.stdout:
                        sys.stdout.write("---JUPY_STDOUT---\n")
                        sys.stdout.write(proc.stdout)
                    if proc.stderr:
                        sys.stdout.write("---JUPY_STDERR---\n")
                        sys.stdout.write(proc.stderr)
                except Exception as e:
                    sys.stdout.write("---JUPY_STDERR---\n")
                    sys.stdout.write(str(e) + "\n")
                if len(lines) > 1:
                    code = '\n'.join(lines[1:])
                else:
                    code = ''
                if not code:
                    sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
                    sys.stdout.flush()
                    continue

            # Patch IPython again (if imported later)
            _patch_ipython_display()

            # Autoreload
            if _autoreload_enabled:
                for mod_name, mod in list(sys.modules.items()):
                    if mod_name not in sys.builtin_module_names and not mod_name.startswith('_'):
                        try:
                            importlib.reload(mod)
                        except:
                            pass

            # Normal execution
            out, err = io.StringIO(), io.StringIO()
            try:
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    tree = ast.parse(code, mode="exec")
                    if tree.body and isinstance(tree.body[-1], ast.Expr):
                        last = tree.body.pop()
                        if tree.body:
                            exec(compile(tree, "<cell>", "exec"), namespace)
                        expr = ast.Expression(last.value)
                        ast.copy_location(expr, last.value)
                        val = eval(compile(expr, "<cell>", "eval"), namespace)
                        if val is not None:
                            sys.stdout.write(repr(val) + "\n")
                    else:
                        exec(compile(code, "<cell>", "exec"), namespace)
                    plots = _capture_plots()
                stdout_val = out.getvalue()
                stderr_val = err.getvalue()
                if stdout_val:
                    sys.stdout.write("---JUPY_STDOUT---\n")
                    sys.stdout.write(stdout_val)
                if stderr_val:
                    sys.stdout.write("---JUPY_STDERR---\n")
                    sys.stdout.write(stderr_val)
                if plots:
                    sys.stdout.write("---JUPY_PLOTS_START---\n")
                    for p in plots:
                        sys.stdout.write(p + "\n")
                    sys.stdout.write("---JUPY_PLOTS_END---\n")
            except SyntaxError as e:
                err_msg = "".join(traceback.format_exception_only(type(e), e))
                sys.stdout.write(f"---JUPY_STDERR---\n{err_msg}\n")
            except Exception as e:
                tb = e.__traceback__.tb_next if e.__traceback__ else None
                err_msg = "".join(traceback.format_exception(type(e), e, tb))
                sys.stdout.write(f"---JUPY_STDERR---\n{err_msg}\n")
            sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
            sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(f"---JUPY_STDERR---\nKernel error: {e}\n")
        sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
        sys.stdout.flush()
"""

---

# File: core\kernel\__init__.py

"""
jupy/core/kernel/__init__.py
Exports the kernel instance.
"""
from .manager import KernelManager

kernel = KernelManager()


---

# File: core\kernel\__pycache__\manager.cpython-313.pyc

�

    ��ej`>  �                   �   � S r SSKrSSKrSSKrSSKrSSKrSSKrSSKrSSKrSSK	J
r
  SSKJr  S r
S r " S S	5      rg)
zY
jupy/core/kernel/manager.py
KernelManager class with startup timeout and debug logging.
�    N)�
envmanager�   )�KERNEL_WORKER_SCRIPTc           	      �.  � U (       af  U R                  5       cT   [        R                  S:X  a.  [        R                  " SSSS[        U R                  5      /SS9  g U R                  5         g g g ! [         a    U R                  5          g !     g = ff = f)N�win32�taskkillz/Fz/Tz/PIDT)�capture_output)	�poll�sys�platform�
subprocess�run�str�pid�kill�	Exception)�procs    �2D:\Hooby\pkg_jupy\jupy\jupy\core\kernel\manager.py�_kill_process_treer      st   � ���	�	��#�	��|�|�w�&����
�D�$���D�H�H�
�N�_c�d��	�	�� $�t�� � 	�������D��	�s*   �AA/ �A/ �/
B�9B�B�
B�Bc                 ��   � U c  g U R                  SS9  U R                  U R                  U R                  4 H  nUc  M  UR	                  5         M     g !    ND= f!    M)  = f)N�   ��timeout)�wait�stdin�stdout�stderr�close)r   �ss     r   �_reap_and_closer       sS   � ��|�V�	
���1��	��j�j�$�+�+�t�{�{�
3���=����� 4�� �D�� 
�D�s   �A �A�A�A c                   �Z   � \ rS rSrS rS rS rS rS rS r	S r
S	 rSS jrS r
S
 rSrg
)�
KernelManager�&   c                 ��  � [        SSS9  SU l        S U l        [        R                  " 5       U l        [        R                  " 5       U l        S U l        [        SSS9  [        R                  " S S9U l
        U R                  S   U l        [        S	U R                   3SS9  [        S
SS9  U R                  5         [        SSS9  [        R                  " U R                  5        g )Nz'[Kernel] KernelManager.__init__ startedT��flushr   z([Kernel] Resolving active environment...c                 �   � [        U SS9$ )NTr%   )�print)�ms    r   �<lambda>�(KernelManager.__init__.<locals>.<lambda>0   s   � �%���"6�    ��on_progress�pythonz[Kernel] Python interpreter: z'[Kernel] Calling _ensure_kernel_proc...z'[Kernel] _ensure_kernel_proc completed.)r(   �
exec_countr   �	threading�Lock�lock�	comm_lock�worker_script_pathr   �resolve_active_env�env_infor/   �_ensure_kernel_proc�atexit�register�_cleanup_worker_script��selfs    r   �__init__�KernelManager.__init__'   s�   � �
�7�t�D������	��N�N�$��	�"���)���"&���
�8��E�"�5�5�6�
��
� �m�m�H�-���
�-�d�k�k�]�;�4�H�
�7�t�D�� � �"�
�7�t�D�����3�3�4r,   c                 �>  � U R                   (       ah  [        R                  R                  U R                   5      (       a9   [        R                  " U R                   5        [        SU R                    3SS9  g g g ! [         a  n[        SU 3SS9   S nAg S nAff = f)Nz![Kernel] Cleaned up temp script: Tr%   z)[Kernel] Failed to clean up temp script: )r5   �os�path�exists�unlinkr(   r   )r=   �es     r   r;   �$KernelManager._cleanup_worker_script9   s�   � ��"�"�r�w�w�~�~�d�6M�6M�'N�'N�
S��	�	�$�1�1�2��9�$�:Q�:Q�9R�S�[_�`� (O�"�� � 
S��A�!��E�T�R��
S�s   �7A; �;
B�
B�Bc                 �  ^^� [        SSS9  U R                     [        SSS9  U R                  b  U R                  R                  5       Gbb  [        SSS9  U R	                  5         [        SSS9  [
        R                  " SSS9u  pX l        [        S	U 3SS9   [        R                  " US
SS9 nUR                  [        5        S S S 5        [        S
SS9  [        R                  R!                  5       nSUS'   [        SSS9   ["        R$                  " U R&                  U/["        R(                  ["        R(                  ["        R(                  SSSUS9m[        STR*                   3SS9  U4S jn[,        R.                  " USS9nUR1                  5         [2        R4                  " 5       mUU4S jn[,        R.                  " USS9n	U	R1                  5          [        SSS9  TR7                  SS9n
[        S[9        U
5       3SS9  S!U
;   nU(       d�  [        S"[9        U
5       3SS9   TR>                  RA                  5       n TRC                  S$S9  URE                  5       =(       d    S%n
[        S&U
 3SS9  U R	                  5         [        S'U
 35      e[        S(SS9  TU l        O
[        S)SS9  S S S 5        g ! , (       d  f       GN= f! [         a6  n[        R                  " U5        [        SU 3SS9  [        SU 35      eS nAff = f! [         a1  n[        SU 3SS9  U R	                  5         [        SU 35      UeS nAff = f! [2        R:                   a1    [        SSS9  [=        T5        U R	                  5         [        S 5      ef = f!   S#n GN[= f!    GNS= f! , (       d  f       g = f)*Nz$[Kernel] _ensure_kernel_proc enteredTr%   z[Kernel] Acquired lockz*[Kernel] Creating new kernel subprocess...z.[Kernel] Writing worker script to temp file...z.py)�suffix�textz[Kernel] Temp file: �wzutf-8)�encodingz,[Kernel] Worker script written successfully.z([Kernel] Failed to write worker script: zFailed to write worker script: �1�PYTHONUNBUFFEREDz2[Kernel] Launching subprocess using script file...r   )r   r   r   rI   rK   �bufsize�envz[Kernel] Subprocess PID: z&[Kernel] Failed to launch subprocess: zCouldn't launch Python: c                  �b   >� TR                    H  n [        SU R                  5        3SS9  M      g )Nz[Kernel stderr] Tr%   )r   r(   �rstrip)�liner   s    �r   �read_stderr�6KernelManager._ensure_kernel_proc.<locals>.read_stderrl   s)   �� � $����� 0������@��M� !,r,   )�target�daemonc                  �   >� TR                   R                  5       n [        S[        U 5       3SS9  TR	                  U 5        g )Nz[Kernel] Reader got line: Tr%   )r   �readliner(   �repr�put)rR   r   �qs    ��r   �reader�1KernelManager._ensure_kernel_proc.<locals>.readert   s6   �� ��;�;�/�/�1�D��6�t�D�z�l�C�4�P��E�E�$�Kr,   z:[Kernel] Waiting for kernel ready message (timeout 20s)...�   r   z[Kernel] Received: z2[Kernel] Timeout waiting for kernel ready message.z,Kernel didn't respond within 20s on startup.z---JUPY_KERNEL_READY---z[Kernel] Unexpected response: � �   zexited immediatelyz [Kernel] Kernel startup failed: zCouldn't start kernel: z[Kernel] Kernel ready.z2[Kernel] Existing kernel process is still running.)#r(   r3   r   r
   r;   �tempfile�mkstempr5   rA   �fdopen�writer   r   r   �RuntimeError�environ�copyr
   �Popenr/   �PIPEr   r1   �Thread�start�queue�Queue�getrY   �Emptyr   r   �readr   �strip)r=   �fd�script_path�frE   rO   rS   �
stderr_threadr\   �trR   �ready�
stderr_output�detailr   r[   s                 @@r   r8   �!KernelManager._ensure_kernel_procA   s}  �� �
�4�D�A�
�Y�Y��*�$�7��y�y� �D�I�I�N�N�$4�$@��B�$�O��+�+�-��F�d�S�"*�"2�"2�%�d�"K���*5�'��,�[�M�:�$�G�N����2�s�W�=����� 4�5� >��H�PT�U� �j�j�o�o�'��*-��&�'��J�RV�W�N�%�+�+����k�2�(�o�o�)���)���!�!(� !��	�D� �5�d�h�h�Z�@��M�N� !*� 0� 0��D� Q�
��#�#�%� �K�K�M�� � �$�$�F�4�@�����	�W��V�^b�c��5�5��5�,�D��/��T�
�|�<�D�I� 2�T�9����:�4��:�,�G�t�T�+�(,���(8�(8�(:�
���	�	�!�	�,� +�0�0�2�J�6J�F��<�V�H�E�T�R��/�/�1�&�)@���'I�J�J��.�d�;� ��	��J�RV�W�k �Y� >�=�� !� N��H�H�R�L��D�Q�C�H�PT�U�&�)H���'L�M�M��N��* !� N��B�1�#�F�d�S��/�/�1�&�)A�!��'E�F�A�M��N��2 �{�{� W��N�VZ�[�&�t�,��/�/�1�&�'U�V�V�	W��+�(*�
�����Y �Y�s�   �BN/�K�2K�K�-N/�A(L�0A,N/�/M�"N/�/N�
N'�A N/�
K	�K�
L�1L�L�N/�
M�!,M
�
M�N/�AN�N/�N$�!N/�'N,�)N/�/
N=c                 �  � U R                   R                  SS9(       d  / $  U R                  nUb  UR                  5       b  / U R                   R	                  5         $ [
        R                  " SXUS.5      S-   nUR                  R                  U5        UR                  R                  5         U(       a�  UR                  5       c�  UR                  R                  5       nU(       d  O�UR                  S5      (       ak  UR                  SS5      R                  5       nUR                  S5      (       a  US S	 n[
        R                   " U5      U R                   R	                  5         $ S
U;   a  OU(       a  UR                  5       c  M�  / U R                   R	                  5         $ !   / s U R                   R	                  5         $ = f!   / s U R                   R	                  5         $ = f! U R                   R	                  5         f = f)NF��blocking�complete��action�coderR   �column�
z---JUPY_COMPS:r_   �---������---JUPY_CELL_COMPLETE---�r4   �acquirer   r
   �release�json�dumpsr   rd   r&   r   rX   �
startswith�replacerq   �endswith�loads�r=   r�   rR   �colr   �req�line_str�json_strs           r   �get_completions�KernelManager.get_completions�   s�  � ��~�~�%�%�u�%�5��I�	%��9�9�D��|�t�y�y�{�6��" 
�N�N�"�"�$�! �*�*�
�D�Z]�^�_�bf�f�C����!�!�#�&��
�
�(8�(8�(:��4�9�9�;�.��;�;�/�/�1�����&�&�'7�8�8�'�/�/�0@�"�E�K�K�M�H��(�(��/�/�H�S�b�M�� $�
�
�8� 4� 
�N�N�"�"�$�	 0�8�;�� �4�9�9�;�.� ��N�N�"�"�$�� 
�2�I� 
�N�N�"�"�$�� &�2�I�
 
�N�N�"�"�$��D�N�N�"�"�$�sT   �!G. �G. �;5F( �0BG. �;G �+G. �G. �(G�,G. �G. �G+�G. �+G. �.H
c                 �0  � U R                   R                  SS9(       d  g  U R                  nUb  UR                  5       b   U R                   R	                  5         g [
        R                  " SXUS.5      S-   nUR                  R                  U5        UR                  R                  5         U(       a�  UR                  5       c�  UR                  R                  5       nU(       d  O�UR                  S5      (       a{  UR                  SS5      R                  5       nUR                  S5      (       a  US S	 nU(       a  US
:w  a  [
        R                   " U5      OS  U R                   R	                  5         $ SU;   a  OU(       a  UR                  5       c  M�   U R                   R	                  5         g !    U R                   R	                  5         g = f!    U R                   R	                  5         g = f! U R                   R	                  5         f = f)NFr|   �hoverr   r�   z---JUPY_HOVER:r_   r�   r�   �nullr�   r�   r�   s           r   �	get_hover�KernelManager.get_hover�   s�  � ��~�~�%�%�u�%�5��	%��9�9�D��|�t�y�y�{�6��" 
�N�N�"�"�$�! �*�*���WZ�[�\�_c�c�C����!�!�#�&��
�
�(8�(8�(:��4�9�9�;�.��;�;�/�/�1�����&�&�'7�8�8�'�/�/�0@�"�E�K�K�M�H��(�(��/�/�H�S�b�M��8@�X�QW�EW��
�
�8� 4�]a�a� 
�N�N�"�"�$�	 0�8�;�� �4�9�9�;�.� ��N�N�"�"�$�� 
 �4� 
�N�N�"�"�$�� (�4�
 
�N�N�"�"�$��D�N�N�"�"�$�sN   � G9 �G9 �:5F7 �/BG9 �:$G �:G9 �7G�9G9 �G9 �G6�G9 �6G9 �9Hc                 �d   � U R                   nU(       a  UR                  5       c  [        U5        gg)NTF)r   r
   r   )r=   r   s     r   �force_interrupt�KernelManager.force_interrupt�   s'   � ��y�y���D�I�I�K�'��t�$��r,   c                 �"   � U R                  5       $ )N)r�   r<   s    r   �	interrupt�KernelManager.interrupt�   s   � ��#�#�%�%r,   c                 ��   � U R                   nS U l         [        U5        Ub)  [        R                  " [        U4SS9R                  5         SU l        U R                  5         U R                  5         g )NT)rU   �argsrV   r   )	r   r   r1   rj   r    rk   r0   r;   r8   )r=   �old_procs     r   �restart�KernelManager.restart�   s\   � ��9�9����	��8�$������O�8�+�d�S�Y�Y�[�����#�#�%�� � �"r,   Nc                 �   � [         R                  " XUS9U l        U R                  S   U l        U R	                  5         U R                  $ )Nr-   r/   )r   �set_active_envr7   r/   r�   )r=   �mode�namer.   s       r   �
switch_env�KernelManager.switch_env�   s9   � �"�1�1�$�+�V��
��m�m�H�-��������}�}�r,   c                 ��   � U R                   nU(       a^  UR                  5       cL  UR                  (       a:   UR                  R                  U S35        UR                  R	                  5         g g g g !    g = f)Nr�   )r   r
   r   rd   r&   )r=   �valuer   s      r   �handle_stdin_reply� KernelManager.handle_stdin_reply�   s_   � ��y�y���D�I�I�K�'�D�J�J�
��
�
� � �E�7�"��.��
�
� � �"� -7�'�4�� 
�D�s   �8A3 �3A7c           
      �  � U =R                   S-
  sl         [        S[        U5       3SS9  UR                  5       n/ / pTU H�  nUR	                  5       nUR                  S5      (       af  UR
                  S5      R
                  5       nUR                  S5      (       a/  USS  R	                  5       n	U	(       a  UR                  U	5        M�  M�  M�  UR                  U5        M�     U H�  nU" S	S
U S3S.5        [        R                  " U R                  S
SS/UR                  5       -   SSS9n
U
R                  (       a  U" S	U
R                  S.5        U
R                  (       d  M�  U" SU
R                  S.5        M�     SR                  U5      nUR	                  5       (       d  U" SU R                   S.5        g [        R                   " SUS.5      S-   n[        SUS S  S3SS9  U R"                      U R%                  5         U R&                  n
 U
R*                  R-                  U5        U
R*                  R/                  5         [        SSS9  S n/ n[        S SS9  U
(       GaH   U
R                  R3                  5       nU(       d  U
R5                  5       b  U" SS"S.5        GOUR                  S#5      (       a=  UR7                  S#S!5      R7                  S$S!5      R	                  5       nU" S%US&.5        M�  S'U;   a  GO�S(U;   a  S	nM�  S)U;   a  SnM�  S*U;   a  S+n/ nM�  S,U;   a  S nU H  n
U" S-U
S..5        M     / nM�  S/U;   a?  U
R                  R3                  5       n [        R8                  " U5      nU" S0US1.5        GM(  S2U;   a?  U
R                  R3                  5       n [        R8                  " U5      nU" S3US1.5        GMm  S4U;   a?  U
R                  R3                  5       n [        R8                  " U5      nU" S5US1.5        GM�  US	:X  a!  UR	                  5       (       a  U" S	US.5        OmUS:X  a!  UR	                  5       (       a  U" SUS.5        OFUS+:X  a   UR                  UR	                  5       5        O UR	                  5       (       a  U" S	US.5        U
(       a  GMH  [        S6SS9  S S S 5        U" SU R                   S.5        [        S7SS9  g ! [(         aB  n[        SU 3SS9  U" SU S3S.5        U" SU R                   S.5         S nAS S S 5        g S nAff = f! [(         a�  n[        SU 3SS9  S U l         U R%                  5         U R&                  n
U
R*                  R-                  U5        U
R*                  R/                  5         [        SSS9   S nAGN_! [(         aP  n[        SU 3SS9  U" SS[1        U5       S3S.5        U" SU R                   S.5         S nA S nAS S S 5        g S nAff = fS nAff = f!   S!n GN�= f!    GN�= f!    GNc= f!    GN&= f! , (       d  f       GN�= f)8Nr   z*[Kernel] execute called with code length: Tr%   )z!pip installz%pip installzpip installz!%zpip install �   r   zInstalling z...
)�typerI   z-m�pip�install)r	   rI   r   r�   r~   )r�   r0   �execute)r�   r�   z"[Kernel] Sending execute request: �2   z...z"[Kernel] Failed to ensure kernel: z[Kernel] Execute request sent.z [Kernel] Error sending request: z$[Kernel] Retry execute request sent.z[Kernel] Retry failed: zKernel communication error: z[Kernel] Reading output...r_   u&   
⏹ Execution force stopped by user.
z---JUPY_STDIN_REQ:r�   �
stdin_request)r�   �promptr�   z---JUPY_STDOUT---z---JUPY_STDERR---z---JUPY_PLOTS_START---�plotsz---JUPY_PLOTS_END---�plot)r�   �htmlz---JUPY_DISPLAY_DATA---�display)r�   �dataz---JUPY_WIDGET---�widgetz---JUPY_LOAD_CELL---�loadz![Kernel] Finished reading output.z[Kernel] Complete signal sent.)r0   r(   �len�
splitlinesrq   r�   �lstrip�appendr
   r   r/   �splitr   r   �joinr�   r�   r4   r8   r   r   r   rd   r&   r   rX   r
   r�   r�   )r=   r�   �
ws_send_fn�lines�pip_cmds�py_linesrR   �stripped�cmd�	clean_cmd�p�
clean_coder�   �current_procrE   �e2�
collecting�
plot_linesr�   �	json_line�	mime_data�
widget_msg�	load_datas                          r   r�   �KernelManager.execute�   s�  � ����1���
�:�3�t�9�+�F�d�S����!����(��D��z�z�|�H��"�"�#R�S�S��o�o�d�+�2�2�4���>�>�.�1�1� #�B�C���� 0�I� � ���	�2� !� 2�
 ����%� � �C���K��u�E�2J�K�L�������T�5�)�D�s�y�y�{�R�cg�nr�s�A��x�x��X�q�x�x�$H�I��x�x�x��X�q�x�x�$H�I�	 �
 �Y�Y�x�(�
����!�!��
�$�/�/�J�K���j�j�I�z�B�C�d�J��
�2�:�c�r�?�2C�3�G�t�T�
�^�^�
��(�(�*�#�y�y��
��"�"�(�(��-��"�"�(�(�*��6�d�C� �J��J��.�d�;���'�.�.�7�7�9�D� �#�(�(�*�6�"�H�>h�#i�j���?�?�#7�8�8�!�\�\�*>��C�K�K�E�SU�V�\�\�^�F���6�J�K��-��5��&�$�.�!)�J��&�$�.�!)�J��+�t�3�!(�J�!#�J��)�T�1�!%�J�'��"�F�A�#>�?� (�!#�J��,��4� ,� 3� 3� <� <� >�I�!�$(�J�J�y�$9�	�"�I�y�#I�J��&�$�.� ,� 3� 3� <� <� >�I�!�%)�Z�Z�	�%:�
�"�H�j�#I�J��)�T�1� ,� 3� 3� <� <� >�I�!�$(�J�J�y�$9�	�"�F�I�#F�G����)��z�z�|�|�"�H�d�#C�D���8�+��z�z�|�|�"�H�d�#C�D���7�*��%�%�d�j�j�l�3��z�z�|�|�"�H�d�#C�D�} �,�~ 
�5�T�B�{ �| 	�J�d�o�o�F�G�
�.�d�;��w � 
��:�1�#�>�d�K��H���2�h�?�@��J�d�o�o�N�O�� �^��
�� � 

��8���<�D�I� ��	�
��,�,�.�#'�9�9�L� �&�&�,�,�S�1� �&�&�,�,�.��@��M�M�� � ��3�B�4�8��E���<X�Y\�]_�Y`�Xa�ac�:d�e�f��
�$�/�/�R�S��5 �^��,��

��(��D��@ !�D�� !�D�� !�D��a �^�s�   �5X9�7S#�?T2�X9�*X�C X9�%!X!�#X9�*!X)�#X9�/!X1�BX9�1
X9�#
T/�-0T*�X9�*T/�/X9�2
X�<X�AV2�,X9�2
X�<:X�6X�:X9�X�X�X�X9�X�X9�!X&�#X9�)X.�+X9�1X6�3X9�9
Y)r4   r7   r0   r3   r   r/   r5   )NN)�__name__�
__module__�__qualname__�__firstlineno__r>   r;   r8   r�   r�   r�   r�   r�   r�   r�   r�   �__static_attributes__� r,   r   r"   r"   &   s>   � �5�$S�WX�r%�2%�2�&�#���y<r,   r"   )�__doc__r�   rA   r
   r   r1   rl   ra   r9   �	jupy.corer   �
worker_scriptr   r   r    r"   r�   r,   r   �<module>r�      sB   ��� � 	� � 
� � � � 
�  � 0�	��A<� A<r,   

---

# File: core\kernel\__pycache__\worker_script.cpython-313.pyc

�

    ��ej:�  �                   �   � S r g)u:�  
import sys, io, ast, base64, json, traceback, builtins, warnings, re, keyword, importlib, threading
import contextlib, time, os, subprocess, glob, shutil, tempfile, shlex
warnings.filterwarnings("ignore", category=UserWarning, module="matplotlib")

# ----------------------------------------------------------------------
# Global namespace (defined once)
# ----------------------------------------------------------------------
namespace = {"__name__": "__main__"}

# ----------------------------------------------------------------------
# Helpers (completions, hover)
# ----------------------------------------------------------------------
def get_worker_completions(code, line, col, namespace):
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
                    except: pass
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

def get_worker_hover(code, line, col):
    try:
        import jedi
        script = jedi.Script(code)
        names = script.infer(line, col)
        if not names:
            defs = script.goto(line, col, follow_imports=True)
            if defs:
                name = defs[0]
            else:
                return None
        else:
            name = names[0]
        docstring = name.docstring() or ""
        sig = ""
        if hasattr(name, 'get_signatures'):
            sigs = name.get_signatures()
            if sigs:
                sig = sigs[0].to_string()
        return {
            "name": name.name,
            "type": name.type,
            "description": docstring.split("\n")[0] if docstring else "",
            "docstring": docstring,
            "signature": sig,
            "module": name.module_name
        }
    except Exception:
        return None

# ----------------------------------------------------------------------
# Magics (full implementation)
# ----------------------------------------------------------------------
_alias_dict = {}
_bookmark_dict = {}
_dir_stack = []
_pdb_mode = False
_xmode = 'Context'
_float_precision = None

def _run_magic(line, cell, namespace):
    parts = line.strip().split()
    if not parts:
        return ""
    magic_name = parts[0].lstrip('%')
    args = parts[1:]

    if magic_name == 'paste':
        return _magic_paste(args, cell, namespace)
    elif magic_name == 'cpaste':
        return _magic_cpaste(args, cell, namespace)
    elif magic_name == 'edit':
        return _magic_edit(args, cell, namespace)
    elif magic_name == 'env':
        return _magic_env(args, cell, namespace)
    elif magic_name == 'alias':
        return _magic_alias(args, cell, namespace)
    elif magic_name == 'unalias':
        return _magic_unalias(args, cell, namespace)
    elif magic_name == 'bookmark':
        return _magic_bookmark(args, cell, namespace)
    elif magic_name == 'pushd':
        return _magic_pushd(args, cell, namespace)
    elif magic_name == 'popd':
        return _magic_popd(args, cell, namespace)
    elif magic_name == 'dirs':
        return _magic_dirs(args, cell, namespace)
    elif magic_name == 'sc':
        return _magic_sc(args, cell, namespace)
    elif magic_name == 'system':
        return _magic_system(args, cell, namespace)
    elif magic_name == 'prun':
        return _magic_prun(args, cell, namespace)
    elif magic_name == 'lprun':
        return _magic_lprun(args, cell, namespace)
    elif magic_name == 'mprun':
        return _magic_mprun(args, cell, namespace)
    elif magic_name == 'memit':
        return _magic_memit(args, cell, namespace)
    elif magic_name == 'pdb':
        return _magic_pdb(args, cell, namespace)
    elif magic_name == 'xmode':
        return _magic_xmode(args, cell, namespace)
    elif magic_name == 'precision':
        return _magic_precision(args, cell, namespace)
    elif magic_name == 'config':
        return "Configuration system not implemented."
    elif magic_name == 'gui':
        return "GUI event loop integration not implemented."
    elif magic_name == 'load_ext':
        return _magic_load_ext(args, cell, namespace)
    elif magic_name == 'unload_ext':
        return _magic_unload_ext(args, cell, namespace)
    elif magic_name == 'reload_ext':
        return _magic_reload_ext(args, cell, namespace)
    elif magic_name == 'time':
        return _magic_time(args, cell, namespace)
    elif magic_name == 'timeit':
        return _magic_timeit(args, cell, namespace)
    elif magic_name == 'cd':
        return _magic_cd(args, cell, namespace)
    elif magic_name == 'pwd':
        return _magic_pwd(args, cell, namespace)
    elif magic_name == 'ls':
        return _magic_ls(args, cell, namespace)
    elif magic_name == 'who':
        return _magic_who(args, cell, namespace)
    elif magic_name == 'reset':
        return _magic_reset(args, cell, namespace)
    elif magic_name == 'matplotlib':
        return _magic_matplotlib(args, cell, namespace)
    elif magic_name == 'autoreload':
        return _magic_autoreload(args, cell, namespace)
    elif magic_name == 'run':
        return _magic_run(args, cell, namespace)
    elif magic_name == 'load':
        return _magic_load(args, cell, namespace)
    elif magic_name == 'store':
        return _magic_store(args, cell, namespace)
    elif magic_name == 'history':
        return _magic_history(args, cell, namespace)
    elif magic_name == 'debug':
        return "Debugger not implemented. Use %pdb."
    else:
        return f"Unknown magic: {magic_name}"

# ---- All magic functions (complete) ----
def _magic_paste(args, cell, namespace):
    try:
        import pyperclip
        text = pyperclip.paste()
        exec(text, namespace)
        return "Pasted and executed code from clipboard."
    except ImportError:
        return "pyperclip not installed. Install: pip install pyperclip"
    except Exception as e:
        return f"Error: {e}"

def _magic_cpaste(args, cell, namespace):
    print("Paste your code below. End with a blank line.", file=sys.stderr)
    lines = []
    while True:
        try:
            line = sys.stdin.readline()
        except KeyboardInterrupt:
            return "Interrupted."
        if not line or line.strip() == '':
            break
        lines.append(line)
    code = ''.join(lines)
    try:
        exec(code, namespace)
        return "Executed pasted code."
    except Exception as e:
        return f"Error: {e}"

def _magic_edit(args, cell, namespace):
    editor = os.environ.get('EDITOR', 'nano')
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.py', delete=False) as f:
        fname = f.name
    try:
        subprocess.run([editor, fname], check=True)
        with open(fname, 'r') as f:
            code = f.read()
        if code:
            exec(code, namespace)
            return f"Edited and executed {fname}"
        else:
            return "No code entered."
    except Exception as e:
        return f"Error: {e}"
    finally:
        try: os.unlink(fname)
        except: pass

def _magic_env(args, cell, namespace):
    if not args:
        return '\n'.join(f"{k}={v}" for k,v in os.environ.items())
    if '=' in args[0]:
        key, val = args[0].split('=', 1)
        os.environ[key] = val
        return f"Set {key}={val}"
    else:
        key = args[0]
        return os.environ.get(key, '')

def _magic_alias(args, cell, namespace):
    global _alias_dict
    if not args:
        return '\n'.join(f"{k} -> {v}" for k,v in _alias_dict.items())
    if len(args) == 1:
        return _alias_dict.get(args[0], f"Alias {args[0]} not found.")
    else:
        name = args[0]
        cmd = ' '.join(args[1:])
        _alias_dict[name] = cmd
        return f"Alias {name} = {cmd}"

def _magic_unalias(args, cell, namespace):
    global _alias_dict
    if not args:
        return "Usage: %unalias name"
    name = args[0]
    if name in _alias_dict:
        del _alias_dict[name]
        return f"Removed alias {name}"
    else:
        return f"Alias {name} not found."

def _magic_bookmark(args, cell, namespace):
    global _bookmark_dict
    if not args:
        return '\n'.join(f"{k} -> {v}" for k,v in _bookmark_dict.items())
    if len(args) == 1:
        name = args[0]
        if name in _bookmark_dict:
            os.chdir(_bookmark_dict[name])
            return f"Changed to bookmark {name}: {_bookmark_dict[name]}"
        else:
            return f"Bookmark {name} not found."
    else:
        name = args[0]
        path = args[1] if len(args) > 1 else os.getcwd()
        _bookmark_dict[name] = os.path.abspath(path)
        return f"Bookmark {name} -> {_bookmark_dict[name]}"

def _magic_pushd(args, cell, namespace):
    global _dir_stack
    if not args:
        _dir_stack.append(os.getcwd())
        os.chdir(os.path.expanduser('~'))
        return f"Pushed {os.getcwd()}"
    else:
        _dir_stack.append(os.getcwd())
        try:
            os.chdir(args[0])
            return f"Changed to {args[0]}"
        except Exception as e:
            _dir_stack.pop()
            return f"Error: {e}"

def _magic_popd(args, cell, namespace):
    global _dir_stack
    if not _dir_stack:
        return "Directory stack is empty."
    prev = _dir_stack.pop()
    os.chdir(prev)
    return f"Popped back to {prev}"

def _magic_dirs(args, cell, namespace):
    global _dir_stack
    return '\n'.join(f"{i}: {d}" for i,d in enumerate(_dir_stack))

def _magic_sc(args, cell, namespace):
    if not args:
        return "Usage: %sc command"
    cmd = ' '.join(args)
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        return result.stdout + result.stderr
    except Exception as e:
        return str(e)

def _magic_system(args, cell, namespace):
    if not args:
        return "Usage: %system command"
    cmd = ' '.join(args)
    try:
        subprocess.run(cmd, shell=True, check=False)
        return ""
    except Exception as e:
        return str(e)

def _magic_prun(args, cell, namespace):
    import cProfile, pstats, io
    if not args:
        return "Usage: %prun statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    prof = cProfile.Profile()
    try:
        prof.enable()
        exec(code, namespace)
        prof.disable()
    except Exception as e:
        return f"Error: {e}"
    stream = io.StringIO()
    stats = pstats.Stats(prof, stream=stream)
    stats.sort_stats('cumtime').print_stats(20)
    return stream.getvalue()

def _magic_lprun(args, cell, namespace):
    try:
        from line_profiler import LineProfiler
    except ImportError:
        return "line_profiler not installed. Install: pip install line_profiler"
    if not args:
        return "Usage: %lprun statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    prof = LineProfiler()
    try:
        prof.runctx(code, namespace, namespace)
        return prof.print_stats()
    except Exception as e:
        return f"Error: {e}"

def _magic_mprun(args, cell, namespace):
    try:
        from memory_profiler import memory_usage
    except ImportError:
        return "memory_profiler not installed. Install: pip install memory_profiler"
    if not args:
        return "Usage: %mprun statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    def f():
        exec(code, namespace)
    mem = memory_usage(f, interval=0.1, timeout=10)
    return f"Memory usage: {max(mem):.2f} MiB"

def _magic_memit(args, cell, namespace):
    if not args:
        return "Usage: %memit statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    try:
        from memory_profiler import memory_usage
        def f():
            exec(code, namespace)
        mem = memory_usage(f, interval=0.1, timeout=10)
        return f"Memory usage: {max(mem):.2f} MiB"
    except ImportError:
        try:
            import psutil
            process = psutil.Process(os.getpid())
            before = process.memory_info().rss
            exec(code, namespace)
            after = process.memory_info().rss
            diff = (after - before) / (1024*1024)
            return f"Memory used: {diff:.2f} MiB"
        except:
            return "memory_profiler or psutil required."

def _magic_pdb(args, cell, namespace):
    global _pdb_mode
    if not args:
        return f"pdb mode is {'on' if _pdb_mode else 'off'}"
    val = args[0].lower()
    if val in ('on', 'true', '1'):
        _pdb_mode = True
        return "pdb mode ON"
    else:
        _pdb_mode = False
        return "pdb mode OFF"

def _magic_xmode(args, cell, namespace):
    global _xmode
    if not args:
        return f"xmode = {_xmode}"
    mode = args[0].capitalize()
    if mode in ('Plain', 'Context', 'Verbose'):
        _xmode = mode
        return f"xmode set to {mode}"
    else:
        return f"Invalid mode: {mode}. Use Plain, Context, or Verbose."

def _magic_precision(args, cell, namespace):
    global _float_precision
    if not args:
        return f"float precision = {_float_precision}"
    try:
        val = int(args[0])
        _float_precision = val
        return f"Set float precision to {val}"
    except:
        return "Usage: %precision <integer>"

def _magic_load_ext(args, cell, namespace):
    if not args:
        return "Usage: %load_ext module"
    try:
        __import__(args[0])
        return f"Loaded extension {args[0]}"
    except Exception as e:
        return f"Error: {e}"

def _magic_unload_ext(args, cell, namespace):
    if not args:
        return "Usage: %unload_ext module"
    if args[0] in sys.modules:
        del sys.modules[args[0]]
        return f"Unloaded {args[0]}"
    else:
        return f"{args[0]} not loaded."

def _magic_reload_ext(args, cell, namespace):
    if not args:
        return "Usage: %reload_ext module"
    try:
        import importlib
        mod = importlib.import_module(args[0])
        importlib.reload(mod)
        return f"Reloaded {args[0]}"
    except Exception as e:
        return f"Error: {e}"

def _magic_time(args, cell, namespace):
    code = ' '.join(args) if args else ''
    if not code:
        return "Usage: %time statement"
    start = time.perf_counter()
    try:
        exec(code, namespace)
    except Exception as e:
        return f"Error: {e}"
    elapsed = time.perf_counter() - start
    return f"CPU times: user {elapsed:.6f} s, sys: 0 s, total: {elapsed:.6f} s"

def _magic_timeit(args, cell, namespace):
    import timeit
    if cell is not None:
        code = cell
    else:
        code = ' '.join(args) if args else ''
        if not code:
            return "Usage: %timeit statement"
    try:
        timer = timeit.Timer(code, globals=namespace)
        number, _ = timer.autorange()
        result = timer.timeit(number)
        return f"{result:.6f} seconds (average over {number} runs)"
    except Exception as e:
        return f"Error in timeit: {e}"

def _magic_cd(args, cell, namespace):
    if not args:
        return f"Current directory: {os.getcwd()}"
    path = args[0]
    try:
        os.chdir(path)
        return f"Changed to: {os.getcwd()}"
    except Exception as e:
        return f"Error: {e}"

def _magic_pwd(args, cell, namespace):
    return os.getcwd()

def _magic_ls(args, cell, namespace):
    path = args[0] if args else '.'
    try:
        items = os.listdir(path)
        return '\n'.join(items)
    except Exception as e:
        return f"Error: {e}"

def _magic_who(args, cell, namespace):
    vars_list = [k for k in namespace.keys() if not k.startswith('_') and k not in ('display', '__builtins__')]
    if not vars_list:
        return "No user variables."
    return "Variables:\n" + '\n'.join(vars_list)

def _magic_reset(args, cell, namespace):
    keep = ['display', '__builtins__']
    for k in list(namespace.keys()):
        if k not in keep and not k.startswith('_'):
            del namespace[k]
    return "Namespace reset."

def _magic_matplotlib(args, cell, namespace):
    backend = args[0] if args else 'inline'
    if backend == 'inline':
        try:
            import matplotlib
            matplotlib.use('Agg')
            return "Matplotlib backend set to inline (Agg)."
        except Exception as e:
            return f"Error setting backend: {e}"
    else:
        return f"Unsupported backend: {backend}. Only 'inline' is implemented."

_autoreload_enabled = False
def _magic_autoreload(args, cell, namespace):
    global _autoreload_enabled
    if args and args[0] == '2':
        _autoreload_enabled = True
        return "Autoreload enabled (level 2)."
    elif args and args[0] == '0':
        _autoreload_enabled = False
        return "Autoreload disabled."
    else:
        return f"Autoreload currently {'enabled' if _autoreload_enabled else 'disabled'}. Use %autoreload 2 to enable, %autoreload 0 to disable."

def _magic_run(args, cell, namespace):
    if not args:
        return "Usage: %run script.py [args]"
    filename = args[0]
    script_args = args[1:]
    try:
        with open(filename, 'r') as f:
            code = f.read()
        exec(code, namespace)
        return f"Executed {filename} successfully."
    except Exception as e:
        return f"Error running script: {e}"

def _magic_load(args, cell, namespace):
    if not args:
        return "Usage: %load filename.py"
    filename = args[0]
    try:
        with open(filename, 'r') as f:
            content = f.read()
        sys.stdout.write("---JUPY_LOAD_CELL---\n")
        sys.stdout.write(json.dumps({"content": content}) + "\n")
        sys.stdout.flush()
        return ""
    except Exception as e:
        return f"Error loading file: {e}"

_stored_vars = {}
def _magic_store(args, cell, namespace):
    global _stored_vars
    if not args:
        return "Usage: %store var  or  %store -r var"
    if args[0] == '-r':
        var = args[1] if len(args) > 1 else None
        if var is None:
            return "Usage: %store -r var"
        if var in _stored_vars:
            namespace[var] = _stored_vars[var]
            return f"Restored {var}"
        else:
            return f"Variable {var} not found in store."
    else:
        var = args[0]
        if var in namespace:
            _stored_vars[var] = namespace[var]
            return f"Stored {var}"
        else:
            return f"Variable {var} not found in namespace."

_magic_history = []
def _magic_history(args, cell, namespace):
    return "History:\n" + '\n'.join(_magic_history[-20:])

# ----------------------------------------------------------------------
# Full ipywidgets system
# ----------------------------------------------------------------------
_widgets = {}
_widget_counter = 0
_links = {}
_link_counter = 0

class WidgetProxy:
    def __init__(self, widget_type, **kwargs):
        global _widget_counter
        self.id = f"widget-{_widget_counter}"
        _widget_counter += 1
        self.type = widget_type
        self.kwargs = kwargs
        self._callbacks = {}
        self._children = kwargs.pop('children', [])
        self._send_widget_event('create', {**kwargs, 'widget_id': self.id, 'type': widget_type})
        _widgets[self.id] = self

    def _send_widget_event(self, event, data):
        msg = {'event': event, 'widget_id': self.id, 'type': self.type, 'data': data}
        sys.stdout.write("---JUPY_WIDGET---\n")
        sys.stdout.write(json.dumps(msg) + "\n")
        sys.stdout.flush()

    def set_state(self, **kwargs):
        self.kwargs.update(kwargs)
        self._send_widget_event('update', kwargs)

    def observe(self, callback, names='value'):
        if isinstance(names, str):
            names = [names]
        for name in names:
            if name not in self._callbacks:
                self._callbacks[name] = []
            self._callbacks[name].append(callback)

    def on_click(self, callback):
        self.observe(callback, 'click')

    def _handle_frontend_event(self, event_data):
        for attr, value in event_data.items():
            if attr == 'value' or attr == 'click':
                self.kwargs[attr] = value
                if attr in self._callbacks:
                    for cb in self._callbacks[attr]:
                        cb(value)
                for link in _links.values():
                    if link.source_id == self.id:
                        link.propagate(value)

class Link:
    def __init__(self, source, target, transform=None, bidirectional=False):
        global _link_counter
        self.id = f"link-{_link_counter}"
        _link_counter += 1
        self.source_id = source.id if hasattr(source, 'id') else source
        self.target_id = target.id if hasattr(target, 'id') else target
        self.transform = transform
        self.bidirectional = bidirectional
        _links[self.id] = self
        msg = {
            'event': 'link' if not bidirectional else 'dlink',
            'widget_id': self.id,
            'data': {
                'source': self.source_id,
                'target': self.target_id,
                'transform': transform
            }
        }
        sys.stdout.write("---JUPY_WIDGET---\n")
        sys.stdout.write(json.dumps(msg) + "\n")
        sys.stdout.flush()

    def propagate(self, value):
        if self.transform:
            value = self.transform(value)
        target = _widgets.get(self.target_id)
        if target:
            target.set_state(value=value)

def link(source, target, transform=None):
    return Link(source, target, transform, bidirectional=False)

def dlink(source, target, transform=None):
    return Link(source, target, transform, bidirectional=True)

# ---- Widget classes ----
def IntSlider(**kwargs):
    return WidgetProxy('IntSlider', **kwargs)

def FloatSlider(**kwargs):
    return WidgetProxy('FloatSlider', **kwargs)

def IntText(**kwargs):
    return WidgetProxy('IntText', **kwargs)

def FloatText(**kwargs):
    return WidgetProxy('FloatText', **kwargs)

def Checkbox(**kwargs):
    return WidgetProxy('Checkbox', **kwargs)

def RadioButtons(**kwargs):
    return WidgetProxy('RadioButtons', **kwargs)

def ToggleButton(**kwargs):
    return WidgetProxy('ToggleButton', **kwargs)

def ToggleButtons(**kwargs):
    return WidgetProxy('ToggleButtons', **kwargs)

def Dropdown(**kwargs):
    return WidgetProxy('Dropdown', **kwargs)

def Select(**kwargs):
    return WidgetProxy('Select', **kwargs)

def SelectMultiple(**kwargs):
    return WidgetProxy('SelectMultiple', **kwargs)

def DatePicker(**kwargs):
    return WidgetProxy('DatePicker', **kwargs)

def TimePicker(**kwargs):
    return WidgetProxy('TimePicker', **kwargs)

def ColorPicker(**kwargs):
    return WidgetProxy('ColorPicker', **kwargs)

def FileUpload(**kwargs):
    return WidgetProxy('FileUpload', **kwargs)

def Play(**kwargs):
    return WidgetProxy('Play', **kwargs)

def VBox(**kwargs):
    return WidgetProxy('VBox', **kwargs)

def HBox(**kwargs):
    return WidgetProxy('HBox', **kwargs)

def GridBox(**kwargs):
    return WidgetProxy('GridBox', **kwargs)

def Accordion(**kwargs):
    return WidgetProxy('Accordion', **kwargs)

def Tab(**kwargs):
    return WidgetProxy('Tab', **kwargs)

def Stack(**kwargs):
    return WidgetProxy('Stack', **kwargs)

def Box(**kwargs):
    return WidgetProxy('Box', **kwargs)

def Output(**kwargs):
    return WidgetProxy('Output', **kwargs)

def interact(func=None, **options):
    if func is None:
        def decorator(f):
            return interact(f, **options)
        return decorator
    else:
        widgets = {}
        for name, value in options.items():
            if isinstance(value, (int, float)):
                widgets[name] = IntSlider(value=value, min=0, max=10*value, description=name)
            elif isinstance(value, list):
                widgets[name] = Dropdown(options=value, value=value[0], description=name)
            elif isinstance(value, bool):
                widgets[name] = Checkbox(value=value, description=name)
            else:
                widgets[name] = IntText(value=value, description=name)
        if widgets:
            display(VBox(children=list(widgets.values())))
        def wrapper(*args, **kwargs):
            kwargs = {name: w.kwargs.get('value') for name, w in widgets.items()}
            return func(**kwargs)
        for w in widgets.values():
            w.observe(lambda _: wrapper(), 'value')
        return wrapper

# Populate namespace with widget classes
namespace['IntSlider'] = IntSlider
namespace['FloatSlider'] = FloatSlider
namespace['IntText'] = IntText
namespace['FloatText'] = FloatText
namespace['Checkbox'] = Checkbox
namespace['RadioButtons'] = RadioButtons
namespace['ToggleButton'] = ToggleButton
namespace['ToggleButtons'] = ToggleButtons
namespace['Dropdown'] = Dropdown
namespace['Select'] = Select
namespace['SelectMultiple'] = SelectMultiple
namespace['DatePicker'] = DatePicker
namespace['TimePicker'] = TimePicker
namespace['ColorPicker'] = ColorPicker
namespace['FileUpload'] = FileUpload
namespace['Play'] = Play
namespace['VBox'] = VBox
namespace['HBox'] = HBox
namespace['GridBox'] = GridBox
namespace['Accordion'] = Accordion
namespace['Tab'] = Tab
namespace['Stack'] = Stack
namespace['Box'] = Box
namespace['Output'] = Output
namespace['link'] = link
namespace['dlink'] = dlink
namespace['interact'] = interact

# ----------------------------------------------------------------------
# Display, plots, input, warmup – WITH FULL IPYWIDGETS SUPPORT
# ----------------------------------------------------------------------
def _send_display_data(mimebundle):
    sys.stdout.write("---JUPY_DISPLAY_DATA---\n")
    sys.stdout.write(json.dumps(mimebundle) + "\n")
    sys.stdout.flush()

def _encode_binary(data):
    if isinstance(data, bytes):
        return base64.b64encode(data).decode('ascii')
    return data

def display(*objs, raw=False, **kwargs):
    if len(objs) == 0:
        return
    if len(objs) > 1:
        for obj in objs:
            display(obj, raw=raw, **kwargs)
        return

    obj = objs[0]

    # 1. If it's already a MIME bundle dict
    if isinstance(obj, dict) and any(k in obj for k in ('text/html', 'text/plain', 'image/png', 'image/svg+xml')):
        for mime in ('image/png', 'image/jpeg', 'image/gif'):
            if mime in obj:
                obj[mime] = _encode_binary(obj[mime])
        _send_display_data(obj)
        return

    # 2. Try to get rich representations (including ipywidgets)
    mimebundle = {}

    # 2a. Check for _repr_mimebundle_ (used by ipywidgets)
    if hasattr(obj, '_repr_mimebundle_'):
        try:
            bundle = obj._repr_mimebundle_()
            if isinstance(bundle, dict):
                mimebundle.update(bundle)
                for key, val in mimebundle.items():
                    if isinstance(val, list):
                        mimebundle[key] = val[0] if val else None
        except Exception:
            pass

    # 2b. Individual _repr_*_ methods
    for fmt in ('html', 'svg', 'latex', 'markdown', 'json', 'png', 'jpeg', 'gif'):
        if fmt not in mimebundle:
            method = getattr(obj, f'_repr_{fmt}_', None)
            if method is not None:
                try:
                    data = method()
                    if data is not None:
                        mimebundle[f'text/{fmt}'] = data
                except Exception:
                    pass

    # 2c. Pandas DataFrames
    if hasattr(obj, '_repr_html_'):
        try:
            html = obj._repr_html_()
            if html:
                mimebundle['text/html'] = html
        except Exception:
            pass

    # 2d. If nothing yet, try repr
    if not mimebundle:
        try:
            mimebundle['text/plain'] = repr(obj)
        except Exception:
            mimebundle['text/plain'] = str(obj)

    # 2e. Encode binary image data
    for mime in ('image/png', 'image/jpeg', 'image/gif'):
        if mime in mimebundle:
            mimebundle[mime] = _encode_binary(mimebundle[mime])

    # 2f. If raw=True, only send text/plain
    if raw:
        mimebundle = {'text/plain': mimebundle.get('text/plain', str(obj))}

    if mimebundle:
        _send_display_data(mimebundle)

# Patch IPython.display.display
def _patch_ipython_display():
    try:
        import IPython.display
        IPython.display.display = display
    except ImportError:
        pass

# Send ready marker, then patch IPython
sys.stdout.write("---JUPY_KERNEL_READY---\n")
sys.stdout.flush()
_patch_ipython_display()

# Matplotlib plot capture
_matplotlib_backend_set = False
def _capture_plots():
    global _matplotlib_backend_set
    plots = []
    if "matplotlib.pyplot" in sys.modules:
        import matplotlib.pyplot as plt
        from matplotlib._pylab_helpers import Gcf
        if not _matplotlib_backend_set:
            try:
                import matplotlib
                matplotlib.use("Agg", force=True)
                _matplotlib_backend_set = True
            except Exception:
                pass
        fignums = plt.get_fignums()
        for i in list(fignums):
            try:
                manager = Gcf.get_fig_manager(i)
                if manager and manager.canvas and manager.canvas.figure:
                    fig = manager.canvas.figure
                    if fig.get_axes():
                        try: fig.tight_layout()
                        except: pass
                        buf = io.BytesIO()
                        fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0.1, dpi=110, facecolor="#FFFFFF")
                        buf.seek(0)
                        b64 = base64.b64encode(buf.read()).decode("ascii")
                        plots.append(f'<img class="notebook-plot" src="data:image/png;base64,{b64}" alt="Plot" />')
            except: pass
        try: plt.close("all")
        except: pass
        try: Gcf.destroy_all()
        except: pass
        try: Gcf.figs.clear()
        except: pass
    return plots

def _warmup_jedi():
    try:
        import jedi
        jedi.Script("import math\nmath.").complete(2, 5)
    except:
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

# ----------------------------------------------------------------------
# Main execution loop
# ----------------------------------------------------------------------
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
            comps = get_worker_completions(code, l_num, c_num, namespace)
            sys.stdout.write(f"---JUPY_COMPS:{json.dumps(comps)}---\n")
            sys.stdout.flush()
        elif action == "hover":
            code = data.get("code", "")
            l_num = data.get("line", 1)
            c_num = data.get("column", 0)
            info = get_worker_hover(code, l_num, c_num)
            sys.stdout.write(f"---JUPY_HOVER:{json.dumps(info)}---\n")
            sys.stdout.flush()
        elif action == "widget_event":
            widget_id = data.get('widget_id')
            event_data = data.get('data', {})
            if widget_id in _widgets:
                _widgets[widget_id]._handle_frontend_event(event_data)
            continue
        elif action == "execute":
            code = data.get("code", "")
            lines = code.splitlines()
            # Cell magic %%
            if lines and lines[0].startswith('%%'):
                magic_line = lines[0]
                cell_body = '\n'.join(lines[1:])
                parts = magic_line[2:].strip().split()
                magic_name = parts[0] if parts else ''
                args = parts[1:]
                magic_str = '%' + magic_name + ' ' + ' '.join(args)
                result = _run_magic(magic_str, cell_body, namespace)
                if result:
                    sys.stdout.write("---JUPY_STDOUT---\n")
                    sys.stdout.write(result + "\n")
                sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
                sys.stdout.flush()
                continue
            # Line magic %
            if lines and lines[0].strip().startswith('%'):
                magic_line = lines[0].strip()
                result = _run_magic(magic_line, None, namespace)
                if result:
                    sys.stdout.write("---JUPY_STDOUT---\n")
                    sys.stdout.write(result + "\n")
                if len(lines) > 1:
                    code = '\n'.join(lines[1:])
                else:
                    code = ''
                if not code:
                    sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
                    sys.stdout.flush()
                    continue
            # System command !
            if lines and lines[0].strip().startswith('!'):
                cmd = lines[0].strip()[1:]
                try:
                    proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
                    if proc.stdout:
                        sys.stdout.write("---JUPY_STDOUT---\n")
                        sys.stdout.write(proc.stdout)
                    if proc.stderr:
                        sys.stdout.write("---JUPY_STDERR---\n")
                        sys.stdout.write(proc.stderr)
                except Exception as e:
                    sys.stdout.write("---JUPY_STDERR---\n")
                    sys.stdout.write(str(e) + "\n")
                if len(lines) > 1:
                    code = '\n'.join(lines[1:])
                else:
                    code = ''
                if not code:
                    sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
                    sys.stdout.flush()
                    continue

            # Patch IPython again (if imported later)
            _patch_ipython_display()

            # Autoreload
            if _autoreload_enabled:
                for mod_name, mod in list(sys.modules.items()):
                    if mod_name not in sys.builtin_module_names and not mod_name.startswith('_'):
                        try:
                            importlib.reload(mod)
                        except:
                            pass

            # Normal execution
            out, err = io.StringIO(), io.StringIO()
            try:
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    tree = ast.parse(code, mode="exec")
                    if tree.body and isinstance(tree.body[-1], ast.Expr):
                        last = tree.body.pop()
                        if tree.body:
                            exec(compile(tree, "<cell>", "exec"), namespace)
                        expr = ast.Expression(last.value)
                        ast.copy_location(expr, last.value)
                        val = eval(compile(expr, "<cell>", "eval"), namespace)
                        if val is not None:
                            sys.stdout.write(repr(val) + "\n")
                    else:
                        exec(compile(code, "<cell>", "exec"), namespace)
                    plots = _capture_plots()
                stdout_val = out.getvalue()
                stderr_val = err.getvalue()
                if stdout_val:
                    sys.stdout.write("---JUPY_STDOUT---\n")
                    sys.stdout.write(stdout_val)
                if stderr_val:
                    sys.stdout.write("---JUPY_STDERR---\n")
                    sys.stdout.write(stderr_val)
                if plots:
                    sys.stdout.write("---JUPY_PLOTS_START---\n")
                    for p in plots:
                        sys.stdout.write(p + "\n")
                    sys.stdout.write("---JUPY_PLOTS_END---\n")
            except SyntaxError as e:
                err_msg = "".join(traceback.format_exception_only(type(e), e))
                sys.stdout.write(f"---JUPY_STDERR---\n{err_msg}\n")
            except Exception as e:
                tb = e.__traceback__.tb_next if e.__traceback__ else None
                err_msg = "".join(traceback.format_exception(type(e), e, tb))
                sys.stdout.write(f"---JUPY_STDERR---\n{err_msg}\n")
            sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
            sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(f"---JUPY_STDERR---\nKernel error: {e}\n")
        sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
        sys.stdout.flush()
N)�KERNEL_WORKER_SCRIPT� �    �8D:\Hooby\pkg_jupy\jupy\jupy\core\kernel\worker_script.py�<module>r      s   ��A� r   

---

# File: core\kernel\__pycache__\__init__.cpython-313.pyc

�

    ��ej�   �                   �"   � S r SSKJr  \" 5       rg)z;
jupy/core/kernel/__init__.py
Exports the kernel instance.
�   )�
KernelManagerN)�__doc__�managerr   �kernel� �    �3D:\Hooby\pkg_jupy\jupy\jupy\core\kernel\__init__.py�<module>r
      s   ��� #�	��r   

---

# File: core\__pycache__\envmanager.cpython-313.pyc

�

    2�ej�+  �                   ��   � S r SSKrSSKrSSKrSSKrSSKrSrS/rS/r1 Skr	Sr
SrS	rS
 r
S rS rSS
 jrSS jrSS jrSS jrS rS rSS jrS rS rS rSS jrSS jrg)u�  
jupy/core/envmanager.py

Central manager for Jupy's Python environments.

By default, the virtual environment used to run notebook cells lives in a
global, per-machine location outside any project folder (so `pip install jupy`
+ running `jupy` in any random folder never dumps a `.jupy_env/` next to the
user's files). Users can opt in, per-folder, to either:

  - "global"  (default) - a shared global env (envs/default), or any other
                           named global env they've created
  - "project"            - a `.jupy_env` folder local to the current working
                           directory, same as Jupy's old default behavior
  - "named"              - a specific named global env (e.g. "datasci")

The choice is remembered per-folder in `.jupy/config.json` (only written once
the user picks something other than the implicit global default, so a fresh
folder stays clean).

This module also keeps Jupy's own runtime dependencies (currently just
`psutil`, used for the CPU/RAM/GPU footer) separate from whichever venv is
running the user's notebook code — see `ensure_jupy_dependencies()`. Those are
installed into the interpreter that's running the Jupy server itself
(`sys.executable`), never into a user/project venv.
�    N�Jupy�psutil�jedi>   �pipr   �parso�wheel�
setuptools�defaultz.jupyzconfig.jsonc                  �  � [         R                  S:X  aj  [        R                  R	                  S5      =(       d    [        R
                  R
                  S5      n [        R
                  R                  U [        5      nO�[         R                  S:X  a'  [        R
                  R
                  S[         35      nOw[        R                  R	                  S5      =(       d    [        R
                  R
                  S5      n [        R
                  R                  U [        R                  5       5      n[        R                  " USS	9  U$ )
z>Returns the OS-appropriate global app-data directory for Jupy.�win32�LOCALAPPDATAz~\AppData\Local�darwinz~/Library/Application Support/�
XDG_DATA_HOMEz~/.local/shareT��exist_ok)�sys�platform�os�environ�get�path�
expanduser�join�APP_NAME�lower�makedirs)�baser   s     �.D:\Hooby\pkg_jupy\jupy\jupy\core\envmanager.py�get_data_dirr   7   s�   � �
�|�|�w���z�z�~�~�n�-�W����1C�1C�DV�1W���w�w�|�|�D�(�+��	����	!��w�w�!�!�$B�8�*�"M�N���z�z�~�~�o�.�V�"�'�'�2D�2D�EU�2V���w�w�|�|�D�(�.�.�"2�3���K�K��t�$��K�    c                  �   � [         R                  R                  [        5       S5      n [         R                  " U SS9  U $ )N�envsTr   )r   r   r   r   r   )r   s    r   �
get_envs_rootr#   F   s+   � �
�7�7�<�<����/�D��K�K��t�$��Kr    c                 �   � SR                  S U  5       5      =(       d    [        n[        R                  R                  [	        5       U5      $ )N� c              3   �^   #   � U  H#  oR                  5       (       d  US ;   d  M  Uv �  M%     g7f))�-�_N)�isalnum)�.0�cs     r   �	<genexpr>�&get_global_env_path.<locals>.<genexpr>M   s    � � �E�d��i�i�k�k�Q�*�_�1�1�d�s   �-�	-)r   �DEFAULT_ENV_NAMEr   r   r#   )�name�safes     r   �get_global_env_pathr1   L   s3   � �
�7�7�E�d�E�E�Y�IY�D�
�7�7�<�<�
���.�.r    c                 �z   � [         R                  R                  U =(       d    [         R                  " 5       S5      $ )Nz	.jupy_env)r   r   r   �getcwd��cwds    r   �get_project_env_pathr6   Q   s"   � �
�7�7�<�<��*�r�y�y�{�K�8�8r    c                 �   � [         R                  R                  U =(       d    [         R                  " 5       [        [
        5      $ �N)r   r   r   r3   �PROJECT_CONFIG_DIR�PROJECT_CONFIG_FILEr4   s    r   �_project_config_pathr;   Y   s&   � �
�7�7�<�<��*�r�y�y�{�,>�@S�T�Tr    c                 �  � U =(       d    [         R                  " 5       n [        U 5      n[         R                  R	                  U5      (       d?  [         R                  R                  [
        U 5      5      (       a	  S[        S.$ S[        S.$  [        USSS9 n[        R                  " U5      nS S S 5        WR                  SS5        UR                  S[        5        U$ ! , (       d  f       N8= f! [         a    S[        S.s $ f = f)	N�project��env_mode�env_name�global�r�utf-8��encodingr?   r@   )
r   r3   r;   r   �exists�isdirr6   r.   �open�json�load�
setdefault�	Exception)r5   r   �f�cfgs       r   �load_project_configrO   ]   s�   � �

�
�����C���$�D�
�7�7�>�>�$��� �7�7�=�=�-�c�2�3�3� )�7G�H�H�$�2B�C�C�D�
�$��g�
.�!��)�)�A�,�C� /����z�8�,����z�#3�4��
�	 /�
.��
 � D�$�2B�C�C�D�s*   �C3 �C"�01C3 �"
C0�,C3 �3D	�D	c                 ��   � [        U5      n[        R                  " [        R                  R	                  U5      SS9  [        USSS9 n[        R                  " XSS9  S S S 5        g ! , (       d  f       g = f)NTr   �wrC   rD   �   )�indent)r;   r   r   r   �dirnamerH   rI   �dump)rN   r5   r   rM   s       r   �save_project_configrV   s   sO   � ���$�D��K�K�������%��5�	
�d�C�'�	*�a��	�	�#��#� 
+�	*�	*�s   �	A(�(
A6c                 �.  � [         R                  S:X  aA  [        R                  R	                  U SS5      [        R                  R	                  U S5      4$ [        R                  R	                  U SS5      [        R                  R	                  U S5      4$ )Nr   �Scriptsz
python.exe�bin�python)r   r   r   r   r   )�env_dirs    r   �_interpreter_pathsr\   ~   sp   � �
�|�|�w���G�G�L�L��)�\�:��G�G�L�L��)�,�
� 	
�
 	�����W�e�X�.�
�����W�e�$�� r    c                 �Z   � [        U 5      u  p[        R                  R                  U5      $ )uE  A venv directory is only really usable if its interpreter actually
exists on disk. A directory that exists but is missing this — most often
the result of an earlier venv.create() call that was interrupted, or
files removed by antivirus software right after creation — is NOT valid,
and must be recreated rather than reused as-is forever. Reusing a broken
venv like this is what used to make jupy silently spawn a kernel process
that could never start, surfacing downstream as a confusing "Kernel
communication error: [Errno 22] Invalid argument" the moment a cell tried
to run.)r\   r   r   �isfile)r[   rZ   r(   s      r   �_venv_is_validr_   �   s#   � � #�7�+�I�F�
�7�7�>�>�&�!�!r    c                 ��  � [         R                  R                  U 5      (       a9  [        U 5      (       d)  U(       a  U" SU  S35         SSKnUR                  U 5        [         R                  R                  U 5      (       d(  U(       a  U" SU  S	35        [        R                  " U S
S9  [        U 5      u  pE[         R                  R                  U5      (       d  [        SU  S
U S35      e [        R                  " USS/S
S
S9  XE4$ ! [         a  n[        SU  SU S35      UeSnAff = f! [         a5    U(       a  U" S5        [        R                  " USSSS/[        -   S
S9   XE4$ f = f)aV  Creates a venv at env_dir if missing *or incomplete*, installs Jupy's
per-env deps (currently just Jedi, for in-process completions). Returns
(python, bin). Raises RuntimeError with a clear, specific reason if the
environment still isn't usable afterwards, instead of silently handing
back a path to an interpreter that doesn't actually work.z#Found an incomplete environment at u    — recreating…r   NzEnvironment at z> is incomplete/broken and couldn't be removed to recreate it: z$. Try deleting that folder manually.zCreating environment at z...T)�with_pipz1Failed to create a working Python environment at z (expected an interpreter at z�, but it's missing). This usually means venv creation was interrupted, or antivirus software removed files right after creation.z-czimport jedi)�check�capture_outputzInstalling completion engine...�-mr   �install�-q�rc   )r   r   rF   r_   �shutil�rmtreerL   �RuntimeError�venv�creater\   r^   �
subprocess�run�JUPY_ENV_DEPENDENCIES)r[   �on_progressrh   �erZ   �binpaths         r   �
ensure_envrs   �   sw  � � 
�w�w�~�~�g���~�g�'>�'>���=�g�Y�FX�Y�Z�	���M�M�'�"� �7�7�>�>�'�"�"���2�7�)�3�?�@����G�d�+�(��1�O�F�
�7�7�>�>�&�!�!��?��y� I+�+1�(� 3;�
<�
� 	
�l������m�4�D�QU�V� �?���9 � 	��!�'�� ++�+,�#�-Q�S�� �
��	��. � l���9�:������e�Y��=�@U�U�fj�k��?��l�s*   �	D
 �.D/ �

D,�D'�'D,�/:E.�-E.c                  �@  � / n [          H  n [        U5        M     U (       aZ  [	        S[
        R                   SSR                  U 5       35        [        R                  " [
        R                  SSSS/U -   SS	9  g
g
! [         a    U R                  U5         M�  f = f)uJ  Ensures Jupy's own server-side dependencies (psutil) are importable in
the interpreter currently running the Jupy server (sys.executable) — the
user's global Python, NOT any project/code venv. Installs them there if
missing. Must be called before any module that imports these packages
(e.g. core/metrics.py) is itself imported.z)[Jupy] Installing required packages into z: z, rd   r   re   rf   Trg   N)
�JUPY_SERVER_DEPENDENCIES�
__import__�ImportError�append�printr   �
executabler   rm   rn   )�missing�pkgs     r   �ensure_jupy_dependenciesr}   �   s�   � � �G�'��	 ��s�O� (� �
�9�#�.�.�9I��D�I�I�V]�L^�K_�`�a��������e�Y��E��O�`d�e� �� � 	 ��N�N�3��	 �s   �A>�>B�Bc                  �t  � [        5       n / n [        [        R                  " U 5      5       HW  n[        R                  R                  [        R                  R
                  X5      5      (       d  MF  UR                  U5        MY     [        U;  a  UR                  S[        5        U$ ! [         a     N.f = f)Nr   )r#   �sortedr   �listdirr   rG   r   rx   rL   r.   �insert)�root�names�entrys      r   �list_global_envsr�   �   s�   � ��?�D��E�
��B�J�J�t�,�-�E��w�w�}�}�R�W�W�\�\�$�6�7�7����U�#� .�
 �u�$�
���Q�(�)��L��	 � 
��
�s   �A!B* �3B* �*
B7�6B7c                 ��   � U [         :X  a  g[        U 5      n[        R                  R	                  U5      (       d  g SS KnUR
                  U5        g! [         a  nS[        U5      4s S nA$ S nAff = f)N)Fz&Cannot delete the default environment.)FzEnvironment does not exist.r   )Tr%   F)	r.   r1   r   r   rF   rh   ri   rL   �str)r/   r   rh   rq   s       r   �delete_global_envr�   �   sc   � ����>��t�$�D�
�7�7�>�>�$���3����
�
�d����� ��c�!�f�}����s   �A �
A4�A/�)A4�/A4c                 �  � [        5       nUR                  SS5      nUR                  S[        5      nUS:X  a
  [        5       nSnO0US:X  a  [	        U5      nSU 3nOSn[        n[	        [        5      nSn[        X@S	9u  pgUUUUUUS
.$ )zyReads this folder's config (or defaults to the global 'default' env),
ensures that env exists, and returns its info dict.r?   rA   r@   r=   zThis Folder (.jupy_env)�namedzGlobal: zGlobal: default�rp   )�moder/   r   rZ   rY   �label)rO   r   r.   r6   r1   rs   )rp   rN   r�   r/   r[   r�   rZ   rr   s           r   �resolve_active_envr�   �   s�   � � �
�C��7�7�:�x�(�D��7�7�:�/�0�D��y��&�(��)��	
���%�d�+���4�&�!������%�&6�7��!�� ��B�O�F� ������
� r    c                 �t   � U S;  a  [        SU  35      eX=(       d    [        S.n[        U5        [        US9$ )zyPersists the folder's env choice and ensures it exists. Returns the
resolved env info (same shape as resolve_active_env).)rA   r=   r�   zInvalid env mode: r>   r�   )�
ValueErrorr.   rV   r�   )r�   r/   rp   rN   s       r   �set_active_envr�     sA   � � �1�1��-�d�V�4�5�5��)A�1A�
B�C�����+�6�6r    r8   )NN)�__doc__rI   r   rm   r   rk   r   ru   ro   �JUPY_INTERNAL_PACKAGE_NAMESr.   r9   r:   r   r#   r1   r6   r;   rO   rV   r\   r_   rs   r}   r�   r�   r�   r�   � r    r   �<module>r�      s�   ���4 � 	� � 
� ��� %�:� �  �� �M� �� �� �#� ���/�
9�U�D�,$�	�"�(�Vf�,��$�>7r    

---

# File: core\__pycache__\metrics.cpython-313.pyc

�

    <"dj�  �                   �   � S SK r S SKrS SKrS SKrS SKrS SKr S SKr\R                  " SS9   " S S5      r	\	" SS9r
S rg! \ a    Sr Nf = f)�    N��intervalc                   �:   � \ rS rSrSrS
S jrS rS rS rS r	Sr
g	)�MetricsSampler�   z]Maintains a rolling 5-second window buffer of hardware metrics with instant initial sampling.c                 ��   � Xl         [        R                  " 5       U l        [        R
                  " 5       U l        U R                  5         [        R                  " U R                  SS9R                  5         g )NT)�target�daemon)�window_seconds�collections�deque�history�	threading�Lock�lock�_take_sample�Thread�_sampling_loop�start)�selfr   s     �+D:\Hooby\pkg_jupy\jupy\jupy\core\metrics.py�__init__�MetricsSampler.__init__   sU   � �,��"�(�(�*����N�N�$��	� 	
���� 	���� 3� 3�D�A�G�G�I�    c                 �  �  [         R                  " / SQSSSS9nUR                  S:X  a�  UR                  R	                  5       (       a�  UR                  R	                  5       R                  S5      S   R                  S5      n[
        US   R	                  5       5      n[
        US   R	                  5       5      n[
        US	   R	                  5       5      nSU[        US
-  S5      [        US
-  S5      4$ g! [         a     gf = f)N)z
nvidia-smiz4--query-gpu=utilization.gpu,memory.used,memory.totalz--format=csv,noheader,nounitsTg�������?)�capture_output�text�timeoutr   �
�,�   �   i   )F�        r#   r#   )	�
subprocess�run�
returncode�stdout�strip�split�float�round�	Exception)r   �res�parts�gpu_pct�gpu_used_mb�gpu_total_mbs         r   �_get_gpu_sample�MetricsSampler._get_gpu_sample   s�   � �	��.�.�w�#�$���C� �~�~��"�s�z�z�'7�'7�'9�'9��
�
�(�(�*�0�0��6�q�9�?�?��D����a���� 0�1��#�E�!�H�N�N�$4�5��$�U�1�X�^�^�%5�6���W�e�K�$�,>��&B�E�,�Y]�J]�_`�Da�a�a� $�� � 	��#�	�s   �C6C: �:
D�Dc           
      ��  � [         R                   " 5       n[        (       a  [        R                  " SS9OSnSu  p4n[        (       a@   [        R                  " 5       nUR                  nUR
                  S-  nUR                  S-  nU R                  5       u  pxp�UUUUUUUU	U
S.	nU R                     U R                  R                  U5        XR                  -
  nU R                  (       aY  U R                  S   S   U:  aC  U R                  R                  5         U R                  (       a  U R                  S   S   U:  a  MC  SSS5        g! [         a     N�f = f! , (       d  f       g= f)	zMCaptures an instant hardware metric sample and appends to rolling 5s history.Nr   r#   )r#   r#   r#   i   @)	�time�cpu�ram_pct�ram_used_gb�ram_total_gb�has_gpur/   �gpu_used_gb�gpu_total_gbr   r5   )r5   �psutil�cpu_percent�virtual_memory�percent�used�totalr,   r2   r   r   �appendr   �popleft)
r   �nowr6   r7   r8   r9   �memr:   r/   r;   r<   �sample�cutoffs
                r   r   �MetricsSampler._take_sample-   s7  � ��i�i�k��39�6�f� � �$�/�s��-:�*��l��6�
��+�+�-���+�+��!�h�h�'�2��"�y�y�G�4�� 7;�6J�6J�6L�3��+� ���&�(���&�(�

�� �Y�Y��L�L����'��.�.�.�F��,�,�4�<�<��?�6�#:�V�#C����$�$�&� �,�,�4�<�<��?�6�#:�V�#C�	 �Y��# � 
��
��" �Y�s   �?E �2BE�
E�E�
E-c                 �T   �  U R                  5         [        R                  " S5        M(  )Ng�������?)r   r5   �sleep)r   s    r   r   �MetricsSampler._sampling_loopQ   s!   � �������J�J�s�O� r   c                 ��  � U R                      U R                  (       d  SSSSSSSSS.sSSS5        $ [        U R                  5      n[        S U R                   5       5      U-  n[        S U R                   5       5      U-  n[        S U R                   5       5      U-  n[        S U R                   5       5      U-  n[        S	 U R                   5       5      U-  nU R                  S
   n[	        US5      [	        US5      [	        US5      [	        US   S5      US
   [	        US5      [	        US5      [	        US   S5      S.sSSS5        $ ! , (       d  f       g= f)z:Calculates mean average metrics across the last 5 seconds.r#   F)r6   r7   r8   r9   r:   r/   r;   r<   Nc              3   �*   #   � U  H	  oS    v �  M     g7f)r6   N� ��.0�ss     r   �	<genexpr>�2MetricsSampler.get_5sec_average.<locals>.<genexpr>`   s   � � �9�L�q�E�(�L��   �c              3   �*   #   � U  H	  oS    v �  M     g7f)r7   NrO   rP   s     r   rS   rT   a   �   � � �A�L�q�	�l�L�rU   c              3   �*   #   � U  H	  oS    v �  M     g7f)r8   NrO   rP   s     r   rS   rT   b   �   � � �F��A��/��rU   c              3   �*   #   � U  H	  oS    v �  M     g7f)r/   NrO   rP   s     r   rS   rT   c   rW   rU   c              3   �*   #   � U  H	  oS    v �  M     g7f)r;   NrO   rP   s     r   rS   rT   d   rY   rU   �����r!   r9   r:   r<   )r   r   �len�sumr+   )r   �count�avg_cpu�avg_ram_pct�avg_ram_used�avg_gpu_pct�avg_gpu_used�latests           r   �get_5sec_average�MetricsSampler.get_5sec_averageV   s4  � �
�Y�Y��<�<��3�s�TW�$��S�Z]�� �Y� ����%�E��9�D�L�L�9�9�E�A�G��A�D�L�L�A�A�E�I�K��F����F�F��N�L��A�D�L�L�A�A�E�I�K��F����F�F��N�L��\�\�"�%�F� �W�a�(� ��a�0�$�\�1�5� %�f�^�&<�a� @�!�)�,� ��a�0�$�\�1�5� %�f�^�&<�a� @�	�! �Y�Y�s   �E�DE�
E#)r   r   r   N)�      @)�__name__�
__module__�__qualname__�__firstlineno__�__doc__r   r2   r   r   rf   �__static_attributes__rO   r   r   r   r      s    � �g�	J�$� "'�H�
r   r   rh   )r   c                  �*   � [         R                  5       $ )z7Returns instant 5-second moving average system metrics.)�metrics_samplerrf   rO   r   r   �get_system_metricsrq   w   s   � ��+�+�-�-r   )r   �osr$   �sysr   r5   r=   r>   �ImportErrorr   rp   rq   rO   r   r   �<module>ru      sb   �� � 	� � 
� � ���
����%�
a� a�H !��4��.��W � �
�F��s   �A �A
�A


---

# File: core\__pycache__\terminal.cpython-313.pyc

�

    ��ej}  �                   �`   � S SK r S SKrS SKr\R                  " S5      rS rS r " S S5      rg)�    Nz%\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])c                 �.   � [         R                  SU 5      $ )N� )�ANSI_ESCAPE�sub)�texts    �,D:\Hooby\pkg_jupy\jupy\jupy\core\terminal.py�
clean_textr	      s   � ��?�?�2�t�$�$�    c                  �   � SSK Jn   U $ )Nr   ��kernel)�jupy.core.kernelr
   r   s    r   �_get_kernelr      s   � � (��Mr
   c                   �0   � \ rS rSrSrS rS rS rS rSr	g)	�TerminalSession�   z{Executes shell commands in the currently active Jupy environment with
real-time output streaming and a clean yellow prompt.c                 �D   � Xl         [        R                  " 5       U l        g )N)�
ws_send_fn�os�getcwd�cwd)�selfr   s     r   �__init__�TerminalSession.__init__   s   � �$���9�9�;��r
   c                 �  � [        5       n[        R                  R                  5       nUR                  S   US'   UR                  S   [        R
                  R                  -   UR                  SS5      -   US'   SUS'   SUS	'   U$ )
N�path�VIRTUAL_ENV�bin�PATHr   �1�PYTHONUNBUFFEREDzutf-8�PYTHONIOENCODING)r   r   �environ�copy�env_infor   �pathsep�get)r   r
   �envs      r   �get_env�TerminalSession.get_env   sw   � �����j�j�o�o���#�_�_�V�4��M���o�o�e�,�r�w�w���>�����QS�AT�T��F��"%����")�����
r
   c                 �<   � [        5       nSUR                  S    S3$ )N�(�nameu   ) ❯)r   r%   )r   r
   s     r   �
get_prompt�TerminalSession.get_prompt#   s"   � �����6�?�?�6�*�+�5�1�1r
   c                 �N  � UR                  5       nU(       d#  U R                  SU R                  5       S.5        g US;   a6  U R                  SS05        U R                  SU R                  5       S.5        g UR                  S5      (       d  US:X  GaY  [	        U5      S:�  a  USS  R                  5       O[
        R                  R                  S	5      nUS	:X  a  [
        R                  R                  S	5      n[
        R                  R                  [
        R                  R                  U R                  U5      5      n[
        R                  R                  U5      (       aM  [
        R                  R                  U5      (       a)  X@l
        U R                  SU R                  5       S.5        g U R                  S
SU S3S.5        U R                  SU R                  5       S.5        g  [        R                  " US
[        R                  [        R                   U R#                  5       U R                  SS
SS9	n UR$                  R'                  5       nU(       d  UR)                  5       b  O(U(       a  [+        U5      nU R                  S
US.5        M[  UR-                  5         U R                  SU R                  5       S.5        g ! [.         aM  nU R                  S
S[1        U5       S3S.5        U R                  SU R                  5       S.5         S nAg S nAff = f)N�prompt)�type�data)�cls�clearr2   r5   zcd �cd�   �~�outputzPath not found: �
T�   �replace)�shell�stdout�stderrr(   r   �bufsizer   �errorszError: )�stripr   r.   �
startswith�lenr   r   �
expanduser�abspath�joinr   �exists�isdir�
subprocess�Popen�PIPE�STDOUTr)   r>   �readline�pollr	   �communicate�	Exception�str)	r   �cmd_str�cmd�target�new_path�proc�line�cleaned�es	            r   �execute_cmd�TerminalSession.execute_cmd'   sb  � ��m�m�o����O�O�X�t���7H�I�J���"�"��O�O�V�W�-�.��O�O�X�t���7H�I�J���>�>�%� � �C�4�K�(+�C��1��S���W�]�]�_�"�'�'�:L�:L�S�:Q�F���}����+�+�C�0���w�w���r�w�w�|�|�D�H�H�f�'E�F�H��w�w�~�~�h�'�'�B�G�G�M�M�(�,C�,C�#������4�?�?�;L� M�N� 
� ����=M�f�X�UW�;X� Y�Z�����4�?�?�;L� M�N��	K��#�#���!���!�(�(��L�L�N��H�H��� �
�D� ��{�{�+�+�-����	�	�� 7���(��.�G��O�O�X�w�$G�H�
 � 
�����O�O�X�t���7H�I�J��� 	K��O�O�X���Q����7K�L�M��O�O�X�t���7H�I�J�J��	K�s   �.CK
 �
L$�AL�L$)r   r   N)
�__name__�
__module__�__qualname__�__firstlineno__�__doc__r   r)   r.   r[   �__static_attributes__� r
   r   r   r      s   � �=���2�3Kr
   r   )r   �rerJ   �compiler   r	   r   r   rc   r
   r   �<module>rf      s5   �� 	� 	� ��j�j�A�B��%��GK� GKr
   

---

# File: core\__pycache__\venv.cpython-313.pyc

�

    �zdj�  �                   �<   � S r SSKrSSKrSSKJr  S rS rS rS rg)u_  
jupy/core/venv.py

Pip package operations (list/install/uninstall/version) against a given
Python interpreter path. Environment *location* and *selection* now lives in
core/envmanager.py — this module just operates on whatever interpreter it's
given, so it works the same whether that's the global default env, a
project-local env, or a named env.
�    N)�JUPY_INTERNAL_PACKAGE_NAMESc                 �N  �  [         R                  " U SSSS/SSSS9nUR                  S:w  a  / $ [        R                  " UR
                  5      nU Vs/ s H!  o3S	   R
                  5       [        ;  d  M  UPM#     nnUR                  S
 S9  U$ s  snf ! [         a    / s $ f = f)z�Returns installed packages for the given interpreter as
[{"name": ..., "version": ...}, ...], sorted by name, with Jupy's own
internal per-env packages (e.g. jedi) filtered out of the view.�-m�pip�listz
--format=jsonT�   ��capture_output�text�timeoutr   �namec                 �(   � U S   R                  5       $ )Nr
   )�lower)�ps    �(D:\Hooby\pkg_jupy\jupy\jupy\core\venv.py�<lambda>�list_packages.<locals>.<lambda>   s   � �A�f�I�O�O�$5�    )�key)
�
subprocess�run�
returncode�json�loads�stdoutr   r   �sort�	Exception)�python�result�packagesr   s       r   �
list_packagesr!      s�   � �����
�T�5�&�/�:��d�B�
�� ����!��I��:�:�f�m�m�,��'�`�x�!�V�9�?�?�+<�D_�+_�A�x��`��
�
�5�
�6���� a�� � ��	��s.   �-B �$B �B�6B�<B �B �B$�#B$c                 �x  � U=(       d    SR                  5       nU(       d  g [        R                  " U SSSU/SSSS9nUR                  =(       d    SUR                  =(       d    S-   nUR
                  S	:H  U4$ ! [        R                   a    S
SU S34s $ [         a  nS
[        U5      4s S
nA$ S
nAff = f)zaInstalls a package (e.g. "requests" or "requests==2.32.0").
Returns (success: bool, output: str).� �FzNo package name given.r   r   �installTi,  r	   r   FzTimed out installing z (5 min limit).N)	�stripr   r   r   �stderrr   �TimeoutExpiredr   �str)r   �specr   �output�es        r   �install_packager-   #   s�   � � 
�J�B����D��.�
����
�T�5�)�T�2��d�C�
�� �-�-�%�2�&�-�-�*=�2�>��� � �A�%�v�-�-���$�$� D��-�d�V�?�C�C�C�� ��c�!�f�}����s$   �AA; �;B9�	B9�"B4�.B9�4B9c                 �  � U=(       d    SR                  5       nU(       d  gUR                  5       [        ;   a  SU S34$  [        R                  " U SSSSU/S	S	S
S9nUR
                  =(       d    SUR                  =(       d    S-   nUR                  S:H  U4$ ! [        R                   a    SS
U S34s $ [         a  nS[        U5      4s SnA$ SnAff = f)z;Uninstalls a package. Returns (success: bool, output: str).r#   r$   Fz. is managed by Jupy and can't be removed here.r   r   �	uninstallz-yT�<   r	   r   zTimed out uninstalling �.N)r&   r   r   r   r   r   r'   r   r(   r   r)   )r   r
   r   r+   r,   s        r   �uninstall_packager2   6   s�   � ��J�B����D��.��z�z�|�2�2����L�M�M�M�
����
�T�5�+�t�T�:��d�B�
�� �-�-�%�2�&�-�-�*=�2�>��� � �A�%�v�-�-���$�$� 8��/��v�Q�7�7�7�� ��c�!�f�}����s%   �AB �C�9	C�C�C�Cc                 ��   �  [         R                  " U S/SSSS9nUR                  =(       d    UR                  =(       d    SR	                  5       $ ! [
         a     gf = f)z?Returns the interpreter's version string, e.g. 'Python 3.11.6'.z	--versionT�   r	   r#   �unknown)r   r   r   r'   r&   r   )r   r   s     r   �get_python_versionr6   J   sU   � ������� 5�d�QU�_`�a���
�
�4����4�"�;�;�=�=��� ���s   �AA �
A�A)	�__doc__r   r   �jupy.core.envmanagerr   r!   r-   r2   r6   � r   r   �<module>r:      s)   ��� � � <��&�&�(r   

---

# File: core\__pycache__\__init__.cpython-313.pyc

�

    M�ejI   �                   �   � S r Srg)z,Jupy - Lightweight Brutalist Python Notebookz0.1.0N)�__doc__�__version__� �    �,D:\Hooby\pkg_jupy\jupy\jupy\core\__init__.py�<module>r      s
   �� 2��r   

---

# File: server\handlers.py

import json
import os
import platform
import threading
import time
import sys
import subprocess
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

# Lazy kernel import – with debug logging
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

            # ----- Export endpoints -----
            elif self.path == "/api/export/html":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                notebook_json = data.get("notebook", {})
                html = self._export_to_html(notebook_json)
                self._send_json({"html": html})

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
                html = self._export_to_html(notebook_json, for_pdf=True)
                self._send_json({"html": html})

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
            self._send_json({"status": "ready", "exec_count": get_kernel().exec_count, "venv": get_kernel().env_info["path"]})

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
        html = """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Exported Notebook</title>
<style>
body { font-family: sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; }
.cell { margin: 20px 0; border-left: 3px solid #ccc; padding-left: 15px; }
.cell-code { background: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; }
.cell-output { background: #fff; padding: 10px; border: 1px solid #ddd; margin-top: 5px; }
.cell-markdown { font-family: sans-serif; }
.plot-container { text-align: center; }
</style>
</head>
<body>
"""
        for cell in cells:
            cell_type = cell.get("type", "code")
            source = cell.get("source", "")
            outputs = cell.get("outputs", [])
            if cell_type == "markdown":
                html += f'<div class="cell cell-markdown">{source}</div>'
            else:
                html += f'<div class="cell cell-code"><pre>{source}</pre>'
                for out in outputs:
                    if out.get("kind") == "stdout":
                        html += f'<div class="cell-output">{out["text"]}</div>'
                    elif out.get("kind") == "stderr":
                        html += f'<div class="cell-output" style="color:red;">{out["text"]}</div>'
                    elif out.get("kind") == "plot":
                        html += f'<div class="cell-output plot-container">{out["text"]}</div>'
                    elif out.get("kind") == "display":
                        data = out.get("data", {})
                        if "text/html" in data:
                            html += f'<div class="cell-output">{data["text/html"]}</div>'
                        else:
                            html += f'<div class="cell-output">{data.get("text/plain", str(data))}</div>'
                html += '</div>'
        html += "</body></html>"
        return html

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

        # Ensure kernel is imported and alive before accepting messages
        try:
            kernel = get_kernel()
            print("[Jupy] WebSocket run handler: kernel ready", flush=True)
        except Exception as e:
            print(f"[Jupy] WebSocket run handler: kernel failed to start: {e}", flush=True)
            # Send an error message to the frontend if possible
            # But we can't because we need to respond on WebSocket
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

---

# File: server\protocol.py

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


---

# File: server\__init__.py



---

# File: server\__pycache__\handlers.cpython-313.pyc

�

    ;�ej?>  �                   �(  � S SK r S SKrS SKrS SKrS SKrS SKrS SKrS SKJr  S SK	J
r  S SKJ
r
  S SKJr  S SKJr  S SKJrJrJrJr  S SKJrJrJr  \R6                  R9                  \R6                  R;                  \R6                  R=                  \5      S	S
5      5      r \R6                  R9                  S5      r!\R                  S:X  a  \R6                  R;                  \!S
5      O\R6                  R;                  \!S5      r"Sq#S r$ " S S\5      r%g)�    N)�SimpleHTTPRequestHandler)�__version__)�
envmanager)�get_system_metrics)�TerminalSession)�get_python_version�install_package�
list_packages�uninstall_package)�make_ws_accept�
make_ws_frame�parse_ws_framez..�staticz	.jupy_env�win32�Scripts�binc                  ��   � [         c#  [        SSS9   SSKJn   U q [        SSS9  [         $ [         $ ! [         a'  n[        SU 3SS9  SS KnUR
                  5         e S nAff = f)Nz-[Jupy] Importing kernel for the first time...T��flushr   )�kernelz$[Jupy] Kernel imported successfully.z[Jupy] ERROR importing kernel: )�_kernel�print�jupy.core.kernelr   �	Exception�	traceback�	print_exc)r   �er   s      �.D:\Hooby\pkg_jupy\jupy\jupy\server\handlers.py�
get_kernelr      sk   � ���
�=�T�J�	�/��G��8��E� �N�7�N�� � 	��3�A�3�7�t�D�����!���		�s   �1 �
A"�"A�A"c                   �n   ^ � \ rS rSrU 4S jrS rU 4S jrS rSS jrS r	S r
S	 rS
 rS r
S rS
rU =r$ )�JupyHTTPHandler�'   c                 �2   >� [         TU ]  " US[        0UD6  g )N�	directory)�super�__init__�
STATIC_DIR)�self�args�kwargs�	__class__s      �r   r&   �JupyHTTPHandler.__init__(   s   �� �
���$�?�*�?��?�    c                 ��  �  [        U R                  R                  SS5      5      nUS:�  a  U R                  R	                  U5      OSnU R
                  S:X  a�  U(       a%  [        R                  " UR                  S5      5      O0 nUR                  SS5      nUR                  SS	5      nUR                  S
S5      n[        5       R                  XEU5      nU R                  SU05        g U R
                  S:X  a�  U(       a%  [        R                  " UR                  S5      5      O0 nUR                  SS5      nUR                  SS	5      nUR                  S
S5      n[        5       R                  XEU5      nU R                  S
U05        g U R
                  S:X  a?  [        5       R                  5         U R                  S[        5       R                  S.5        g U R
                  S:X  a�  U(       a%  [        R                  " UR                  S5      5      O0 nUR                  SS5      n	[        [        5       R                   U	5      u  p�U R                  X�[#        [        5       R                   5      S.5        g U R
                  S:X  a�  U(       a%  [        R                  " UR                  S5      5      O0 nUR                  SS5      n	[%        [        5       R                   U	5      u  p�U R                  X�[#        [        5       R                   5      S.5        g U R
                  S:X  a�  U(       a%  [        R                  " UR                  S5      5      O0 nUR                  SS5      nUR                  S5      n	 [        5       R'                  X�5      nU R                  SU R)                  U5      S.5        g U R
                  S:X  a�  U(       a%  [        R                  " UR                  S5      5      O0 nUR                  S5      =(       d    SR/                  5       n	U	(       d  U R                  SSS.5        g  [0        R2                  " [0        R4                  " U	5      5        U R                  S[0        R6                  " 5       S.5        g U R
                  S:X  a�  U(       a%  [        R                  " UR                  S5      5      O0 nUR                  S5      =(       d    SR/                  5       n	[0        R8                  " U	5      u  p�U R                  X�[0        R6                  " 5       S .5        g U R
                  S!:X  ae  U(       a%  [        R                  " UR                  S5      5      O0 nUR                  S"0 5      nU R;                  U5      nU R                  S#U05        g U R
                  S$:X  ae  U(       a%  [        R                  " UR                  S5      5      O0 nUR                  S"0 5      nU R=                  U5      nU R                  S%U05        g U R
                  S&:X  ae  U(       a%  [        R                  " UR                  S5      5      O0 nUR                  S"0 5      nU R?                  U5      nU R                  S'U05        g U R
                  S(:X  ad  U(       a%  [        R                  " UR                  S5      5      O0 nUR                  S"0 5      nU R;                  USS)9nU R                  S#U05        g U RA                  S*S+5        g ! [*         a'  n
U R                  S[-        U
5      S.5         S n
A
g S n
A
ff = f! [*         a'  n
U R                  S[-        U
5      S.5         S n
A
g S n
A
ff = f! [B        [D        [F        4 a     g [*         aH  n
[I        S,U
 3SS-9  SS K%nURM                  5         U R                  S[-        U
5      S.5         S n
A
g S n
A
ff = f).N�Content-Lengthr   r-   z
/api/complete�utf-8�code� �line�   �column�completionsz
/api/hover�hoverz/api/restart�	restarted)�status�
exec_countz/api/pip/install�name)�success�output�packagesz/api/pip/uninstallz/api/env/select�mode�globalT)r<   �currentF)r<   �errorz/api/env/createzNo environment name given.)r<   �global_envsz/api/env/delete)r<   rB   rC   z/api/export/html�notebook�htmlz/api/export/py�scriptz/api/export/md�markdownz/api/export/pdf)�for_pdfi�  zEndpoint not foundz[Jupy] Error in do_POST: r   )'�int�headers�get�rfile�read�path�json�loads�decoder   �get_completions�
_send_json�	get_hover�restartr:   r	   �pythonr
   r   �
switch_env�_env_payloadr   �str�stripr   �
ensure_env�get_global_env_path�list_global_envs�delete_global_env�_export_to_html�
_export_to_py�
_export_to_md�
send_error�ConnectionAbortedError�ConnectionResetError�BrokenPipeErrorr   r   r   )r(   �content_length�	post_data�datar1   r3   �col�comps�infor;   r<   r=   r?   r   rB   �
notebook_jsonrE   rF   �mdr   s                       r   �do_POST�JupyHTTPHandler.do_POST+   s  � �a	A� ����!1�!1�2B�A�!F�G�N�;I�A�;M��
�
����7�SV�I��y�y�O�+�@I�t�z�z�)�"2�"2�7�";�<�r���x�x���+���x�x���*���h�h�x��+��"��4�4�T��E������� 6�7����l�*�@I�t�z�z�)�"2�"2�7�";�<�r���x�x���+���x�x���*���h�h�x��+��!�|�-�-�d�#�>������$��0����n�,���$�$�&����;�j�l�F]�F]� ^�_����0�0�@I�t�z�z�)�"2�"2�7�";�<�r���x�x���+��"1�*�,�2E�2E�t�"L������G�S`�ak�am�at�at�Su� v�w����2�2�@I�t�z�z�)�"2�"2�7�";�<�r���x�x���+��"3�J�L�4G�4G��"N������G�S`�ak�am�at�at�Su� v�w����/�/�@I�t�z�z�)�"2�"2�7�";�<�r���x�x���1���x�x��'��I�%�<�2�2�4�>�D��O�O���AR�AR�SW�AX�$Y�Z� ���/�/�@I�t�z�z�)�"2�"2�7�";�<�r������(�.�B�5�5�7����O�O��@\�$]�^�M�"�-�-�j�.L�.L�T�.R�S����D��Id�Id�If�(g�h� ���/�/�@I�t�z�z�)�"2�"2�7�";�<�r������(�.�B�5�5�7��!+�!=�!=�d�!C������G�T^�To�To�Tq� r�s� ���0�0�@I�t�z�z�)�"2�"2�7�";�<�r�� $����R� 8�
��+�+�M�:��������/����.�.�@I�t�z�z�)�"2�"2�7�";�<�r�� $����R� 8�
��+�+�M�:������6� 2�3����.�.�@I�t�z�z�)�"2�"2�7�";�<�r�� $����R� 8�
��'�'�
�6������R� 0�1����/�/�@I�t�z�z�)�"2�"2�7�";�<�r�� $����R� 8�
��+�+�M�4�+�H��������/� ����%9�:��_ !� I��O�O���A��$G�H�H��I�� %� M����E�C��F�(K�L�L��M��H '�(<�o�N� 	��� 	A��-�a�S�1��>�����!��O�O���A��?�@�@��		A�s�   �C)^ �,B!^ �A^ �B^ �=B^ �A!^ �?<\ �<B^ �?A] �B%^ �7A4^ �,A4^ �!A4^ �A3^ �
^ �
]�']	�^ �	]�^ �
^�]=�8^ �=^�^ �_-�	_-�%>_(�(_-c                 �b  >� U R                   R                  SS5      R                  5       S:X  a�  U R                   R                  S5      n[        U5      nU R	                  S5        U R                  SS5        U R                  SS5        U R                  SU5        U R
                  5         U R                  S:X  a  U R                  5         g U R                  S	:X  a  U R                  5         g U R                  S
:X  a  U R                  5         g U R                  S:X  a=  U R                  S[        5       R                  [        5       R                  S
   S.5        g U R                  S:X  a/  U R                  S[        [        5       R                   5      05        g U R                  S:X  av  U R                  U R#                  [        5       R                  5      [$        R&                  " 5       [(        [*        R*                  " 5       [$        R,                  " 5       S.5        g [.        TU ]a  5         g )N�Upgrader2   �	websocketzSec-WebSocket-Key�e   �
ConnectionzSec-WebSocket-Acceptz/ws/runz/ws/terminalz/ws/metricsz/api/status�readyrN   )r9   r:   �venvz
/api/pip/listr>   z
/api/env/list)rA   rC   �jupy_version�platform�data_dir)rJ   rK   �lowerr   �
send_response�send_header�end_headersrN   �
handle_run_ws�handle_terminal_ws�handle_metrics_wsrS   r   r:   �env_infor
   rV   rX   r   r]   �JUPY_VERSIONrx   �get_data_dirr%   �do_GET)r(   �ws_key�
accept_keyr+   s      �r   r�   �JupyHTTPHandler.do_GET�   s�  �� ��<�<���I�r�*�0�0�2�k�A��\�\�%�%�&9�:�F�'��/�J����s�#����Y��4����\�9�5����3�Z�@������y�y�I�%��"�"�$�
 
�	 ���n�,��'�'�)� 
� ���m�+��&�&�(��
�Y�Y�-�
'��O�O�w�j�l�>U�>U�_i�_k�_t�_t�u{�_|�}�~�
�Y�Y�/�
)��O�O�Z��z�|�7J�7J�)K�L�M�
�Y�Y�/�
)��O�O��,�,�Z�\�-B�-B�C�)�:�:�<� ,�$�-�-�/�&�3�3�5�� 
� 
�G�N�r-   c                 �n   � US   US   US   US   [        US   5      [        [        US   5      5      S.$ )Nr?   r;   rN   �labelrV   )r?   r;   rN   r�   �python_version�
package_count)r   �lenr
   )r(   rk   s     r   rX   �JupyHTTPHandler._env_payload�   sE   � ���L���L���L��'�]�0��h��@� ��t�H�~�!>�?�

� 	
r-   c           
      �  � UR                  S/ 5      nSnU GH*  nUR                  SS5      nUR                  SS5      nUR                  S/ 5      nUS:X  a  US	U S
3-
  nMK  USU S3-
  nU H�  n	U	R                  S
5      S:X  a  USU	S    S
3-
  nM&  U	R                  S
5      S:X  a  USU	S    S
3-
  nMI  U	R                  S
5      S:X  a  USU	S    S
3-
  nMl  U	R                  S
5      S:X  d  M�  U	R                  S0 5      n
SU
;   a  USU
S    S
3-
  nM�  USU
R                  S[        U
5      5       S
3-
  nM�     US
-
  nGM-     US-
  nU$ )N�cellsa<  <!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Exported Notebook</title>
<style>
body { font-family: sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; }
.cell { margin: 20px 0; border-left: 3px solid #ccc; padding-left: 15px; }
.cell-code { background: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; }
.cell-output { background: #fff; padding: 10px; border: 1px solid #ddd; margin-top: 5px; }
.cell-markdown { font-family: sans-serif; }
.plot-container { text-align: center; }
</style>
</head>
<body>
�typer1   �sourcer2   �outputsrG   z <div class="cell cell-markdown">z</div>z!<div class="cell cell-code"><pre>z</pre>�kind�stdoutz<div class="cell-output">�text�stderrz,<div class="cell-output" style="color:red;">�plotz(<div class="cell-output plot-container">�displayrh   z	text/htmlz
text/plainz</body></html>)rK   rY   )r(   rl   rH   r�   rE   �cell�	cell_typer�   r�   �outrh   s              r   r_   �JupyHTTPHandler._export_to_html�   s�  � ��!�!�'�2�.��
�� �D������0�I��X�X�h��+�F��h�h�y�"�-�G��J�&��:�6�(�&�I�I���;�F�8�6�J�J��"�C��w�w�v��(�2��";�C��K�=�� O�O�������H�4��"N�s�SY�{�m�[a� b�b�������F�2��"J�3�v�;�-�W]� ^�^�������I�5�"�w�w�v�r�2��&�$�.� �&?��[�@Q�?R�RX�$Y�Y�D� �&?�����WZ�[_�W`�@a�?b�bh�$i�i�D� #� �� ��+ �, 	
� � ���r-   c                 ��   � UR                  S/ 5      n/ nU H;  nUR                  S5      S:X  d  M  UR                  UR                  SS5      5        M=     SR                  U5      $ )Nr�   r�   r1   r�   r2   �

�rK   �append�join�r(   rl   r�   �linesr�   s        r   r`   �JupyHTTPHandler._export_to_py�   s\   � ��!�!�'�2�.�����D��x�x���6�)����T�X�X�h��3�4� � �{�{�5�!�!r-   c                 �J  � UR                  S/ 5      n/ nU Hy  nUR                  S5      S:X  a#  UR                  UR                  SS5      5        M;  UR                  S5      S:X  d  MR  UR                  SUR                  SS5      -   S-   5        M{     S	R                  U5      $ )
Nr�   r�   rG   r�   r2   r1   z
```python
z
```r�   r�   r�   s        r   ra   �JupyHTTPHandler._export_to_md�   s�   � ��!�!�'�2�.�����D��x�x���:�-����T�X�X�h��3�4����&�!�V�+����]�T�X�X�h��-C�C�g�M�N�	 �
 �{�{�5�!�!r-   c                 ��   ^ ^� [         R                  " 5       mU U4S jn[         R                  " USS9R                  5          [	        T R
                  5      u  p#US:X  d  Uc  g M#  )Nc                  �L  >�   [        5       n [        [        R                  " U 5      5      nT   TR                  R                  U5        TR                  R
                  5         S S S 5        [        R                  " S5        M�  ! , (       d  f       N&= f! [         a     g f = f)Ng      @)
r   r
   rO   �dumps�wfile�writer   �time�sleepr   )rh   �framer(   �ws_locks     ��r   �stream_loop�6JupyHTTPHandler.handle_metrics_ws.<locals>.stream_loop�   s}   �� ���-�/�D�)�$�*�*�T�*:�;�E� ��
�
�(�(��/��
�
�(�(�*� !� �J�J�s�O� � !��� !� ���s(   �+B �6B�%B �
B�B �
B#�"B#T��target�daemon�   )�	threading�Lock�Thread�startr   rL   )r(   r�   �msg�opcoder�   s   `   @r   r�   �!JupyHTTPHandler.handle_metrics_ws�   sU   �� ��.�.�"��
	� 	����D�9�?�?�A��(����4�K�C���}���� r-   c                 ��  ^ ^� [         R                  " 5       mU U4S jn [        5       n[        SSS9   [        T R                  5      u  pEUS:X  d  Uc  g  [        R                  " U5      nUR                  S5      nUS:X  aS  UR                  S	S
5      n[        SUS S  S
3SS9  [         R                  " UR                  X�4SS9R                  5         O@US:X  a  UR                  5         O)US:X  a#  UR                  SS
5      n	UR                  U	5        M�  ! [         a  n[        SU 3SS9   S nAg S nAff = f! [         a+  n[        SU 3SS9  SS Kn
U
R!                  5          S nANVS nAff = f)Nc                 �0  >� T    [        [        R                  " U 5      5      nTR                  R	                  U5        TR                  R                  5         S S S 5        g ! [         a  n[        SU 3SS9   S nAN%S nAff = f! , (       d  f       g = f)Nz[Jupy] ws_send error: Tr   )r
   rO   r�   r�   r�   r   r   r   )�	data_dictr�   r   r(   r�   s      ��r   �ws_send�.JupyHTTPHandler.handle_run_ws.<locals>.ws_send  sv   �� ��D�)�$�*�*�Y�*?�@�E��J�J�$�$�U�+��J�J�$�$�&�	 ���
 !� D��2�1�#�6�d�C��D�� ��s/   �B�AA#�#
B�-
A?�:B�?B�B�
Bz*[Jupy] WebSocket run handler: kernel readyTr   z6[Jupy] WebSocket run handler: kernel failed to start: r�   �action�runr1   r2   z[Jupy] Received run request: �2   z...)r�   r)   r�   �	interrupt�stdin_reply�valuez#[Jupy] Error in WebSocket message: r   )r�   r�   r   r   r   r   rL   rO   rP   rK   r�   �executer�   r�   �handle_stdin_replyr   r   )r(   r�   r   r   r�   r�   �reqr�   r1   �valr   r�   s   `          @r   r~   �JupyHTTPHandler.handle_run_ws  sa  �� ��.�.�"��	D�	��\�F��>�d�K� �(����4�K�C���}����
&��j�j��o������*���U�?��7�7�6�2�.�D��9�$�s��)��C�H�PT�U��$�$�F�N�N�$��Y]�^�d�d�f��{�*��$�$�&��}�,��'�'�'�2�.�C��-�-�c�2� ��
 � 	��J�1�#�N�VZ�[� 
��		��, � 
&��;�A�3�?�t�L� ��#�#�%�%��
&�s<   �D �A?D= �D= �.)D= �
D:�#
D5�5D:�=
E2�!E-�-E2c           	      ��  ^ ^� [         R                  R                  5       n[        US'   [        [         R
                  R                  -   UR                  SS5      -   US'   [        R                  S:X  a  SS/OUR                  SS5      S	/n[        R                  " U[        R                  [        R                  [        R                  U[         R                  " 5       S
9mUU 4S jn[        R                   " USS
9R#                  5          [%        T R&                  5      u  pEUS:X  d  Uc   TR)                  5         g  [,        R.                  " U5      nUR                  S5      S:X  aV  UR                  SS5      nTR0                  R3                  UR5                  S5      5        TR0                  R7                  5         M�  ! [*         a     g f = f! [*         a     Nf = f)N�VIRTUAL_ENV�PATHr2   r   zcmd.exez/K�SHELLz	/bin/bashz-i)�stdinr�   r�   �env�cwdc                  �  >� TR                  5       c�   TR                  R                  S5      n U (       ah  U R                  SSS9n[	        [
        R                  " SUS.5      5      nTR                  R                  U5        TR                  R                  5         Og TR                  5       c  M�  g g ! [         a     g f = f)Ni   r0   �replace)�errorsr=   )r�   rh   )�pollr�   rM   rQ   r
   rO   r�   r�   r�   r   r   )�chunkr�   r�   �procr(   s      ��r   �
stream_stdout�9JupyHTTPHandler.handle_terminal_ws.<locals>.stream_stdoutL  s�   �� ��)�)�+�%�
� �K�K�,�,�T�2�E��$�|�|�G�I�|�F�� -�d�j�j�(�TX�9Y�.Z� [���
�
�(�(��/��
�
�(�(�*�� �)�)�+�%�� !� ���s   �B	B4 �4
C� CTr�   r�   r�   �inputrh   r0   )�os�environ�copy�VENV_DIR�VENV_BINrN   �pathseprK   �sysrx   �
subprocess�Popen�PIPE�STDOUT�getcwdr�   r�   r�   r   rL   �	terminater   rO   rP   r�   r�   �encoder   )	r(   r�   �shellr�   r�   r�   rh   �inpr�   s	   `       @r   r   �"JupyHTTPHandler.handle_terminal_ws<  s�  �� ��j�j�o�o���%��M��������0�3�7�7�6�2�3F�F��F��%(�\�\�W�%<��D�!�3�7�7�7�T_�C`�bf�Bg�������/�/��?�?��$�$���	�	��

��	� 	���
�d�;�A�A�C��(����4�K�C���}�����N�N�$� �
��z�z�#����8�8�F�#�w�.��(�(�6�2�.�C��J�J�$�$�S�Z�Z��%8�9��J�J�$�$�&� ��
 !� ����� � 
��
�s%   �/G �BG �
G�G�
G!� G!c                 �j  � [         R                  " U5      R                  S5      n U R                  S5        U R	                  SS5        U R	                  S[        [
        U5      5      5        U R                  5         U R                  R                  U5        g ! [        [        [        4 a     g f = f)Nr0   ��   zContent-Typezapplication/jsonr/   )
rO   r�   r�   r{   r|   rY   r�   r}   r�   r�   rc   rd   re   )r(   rh   �bodys      r   rS   �JupyHTTPHandler._send_jsonm  s�   � ��z�z�$��&�&�w�/��	����s�#����^�-?�@����-�s�3�t�9�~�>������J�J���T�"��&�(<�o�N� 	��	�s   �A2B �B2�1B2� )F)�__name__�
__module__�__qualname__�__firstlineno__r&   rn   r�   rX   r_   r`   ra   r�   r~   r   rS   �__static_attributes__�
__classcell__)r+   s   @r   r!   r!   '   sG   �� �@�bA�H#�J
�'�R"�"��,)&�V/�b	� 	r-   r!   )&rO   r�   rx   r�   r�   r�   r�   �http.serverr   �jupyr   r�   �	jupy.corer   �jupy.core.metricsr   �jupy.core.terminalr   �jupy.core.venvr   r	   r
   r   �jupy.server.protocolr   r
   r   rN   �abspathr�   �dirname�__file__r'   r�   r�   r   r   r!   r�   r-   r   �<module>r     s�   �� � 	� � � � 
� � 0� ,�  � 0� .� `� `� N� N�
�W�W�_�_�R�W�W�\�\�"�'�'�/�/�(�*C�T�8�T�
U�
�
�7�7�?�?�;�'��03����0G�2�7�7�<�<��)�,�R�W�W�\�\�Zb�di�Mj�� ��
� O�.� Or-   

---

# File: server\__pycache__\protocol.cpython-313.pyc

�

    <"dj�  �                   �2   � S SK r S SKrS SKrSrS rS rS rg)�    Nz$258EAFA5-E914-47DA-95CA-C5AB0DC85B11c                 ��   � [         R                  " U [        -   R                  S5      5      R	                  5       n[
        R                  " U5      R                  S5      $ )N�utf-8)�hashlib�sha1�WS_GUID�encode�digest�base64�	b64encode�decode)�keyr   s     �.D:\Hooby\pkg_jupy\jupy\jupy\server\protocol.py�make_ws_acceptr      sD   � ��<�<��w��.�.�w�7�8�?�?�A�D����D�!�(�(��1�1�    c                 �  �  U R                  S5      nU(       d  gU R                  S5      nU(       d  gUS   US   pCUS-  nUS:X  a  g[        US-  5      nUS-  nUS	:X  a*  [        R                  " S
U R                  S5      5      S   nO/US:X  a)  [        R                  " SU R                  S5      5      S   nU(       a  U R                  S
5      OS n[	        U R                  U5      5      n	U(       a,  [        [
        U	5      5       H  n
X�==   X�S
-     -  ss'   M     U	R                  SSS9U4$ ! [         a     gf = f)N�   )NNr   �   �   )Nr   �   �   �~   z>H�   z>Q�   r   �ignore)�errors)	�read�bool�struct�unpack�	bytearray�range�lenr   �	Exception)�rfile�head1_b�head2_b�head1�head2�opcode�has_mask�length�masks�data�is              r   �parse_ws_framer/      s#  � ���*�*�Q�-���z��*�*�Q�-���z��q�z�7�1�:�u������S�=������%�������S�=��]�]�4����A��7��:�F�
�s�]��]�]�4����A��7��:�F�!)��
�
�1�
�t������F�+�,����3�t�9�%����5�Q��<�'�� &� �{�{�7�8�{�4�f�<�<��� ���s"   �D4 �D4 �D4 �	C*D4 �4
E� Ec                 ��   � U R                  S5      n[        U5      nUS::  a  [        R                  " SSU5      nX1-   $ US::  a  [        R                  " SSSU5      nX1-   $ [        R                  " SSS	U5      nX1-   $ )
Nr   �}   �BB�   i��  z>BBHr   z>BBQr   )r   r"   r   �pack)�messager-   r+   �headers       r   �
make_ws_framer7   (   s�   � ��>�>�'�"�D�
��Y�F�
��}����T�4��0��
 �=��	 
�5�����V�T�3��7�� �=�� ���V�T�3��7���=�r   )r
   r   r   r   r   r/   r7   � r   r   �<module>r9      s"   �� 
� � 
�
0��2��:	r   

---

# File: server\__pycache__\__init__.cpython-313.pyc

�

    <"dj    �                   �   � g )N� r   �    �.D:\Hooby\pkg_jupy\jupy\jupy\server\__init__.py�<module>r      s   �r   

---

# File: static\index.html

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Untitled.ipynb — Jupy</title>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Darker+Grotesque:wght@500;700;800;900&family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet">

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.css" />

<!-- MathJax, marked, DOMPurify -->
<script>
  window.MathJax = {
    tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
    svg: { fontCache: 'global' }
  };
</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.js" async></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.4/purify.min.js"></script>

<link rel="stylesheet" href="css/main.css" />
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<script src="https://cdn.bokeh.org/bokeh/release/bokeh-3.3.4.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
</head>
<body>

<div class="toast-container" id="toast-container"></div>

<header class="topbar">
  <div class="brand-block">
    <img src="logo.png" alt="Jupy" class="logo-img" onerror="this.style.display='none'" />
    <span class="brand-name">JUPY</span>
  </div>

  <div class="menu-block">
    <!-- RUNTIME Menu -->
    <div class="runtime-menu" id="runtime-menu">
      <button class="runtime-menu-trigger" id="runtime-menu-trigger" aria-haspopup="true" aria-expanded="false">
        RUNTIME
        <svg class="runtime-menu-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="runtime-menu-dropdown" id="runtime-menu-dropdown" role="menu">
        <button class="runtime-menu-item" id="runtime-restart" role="menuitem">
          <span class="runtime-menu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/></svg></span> Restart
        </button>
        <button class="runtime-menu-item" id="runtime-restart-run-all" role="menuitem">
          <span class="runtime-menu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg></span> Restart and run all
        </button>
        <button class="runtime-menu-item" id="runtime-restart-run-selected" role="menuitem">
          <span class="runtime-menu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg></span> Restart and run to selected cell
        </button>
      </div>
    </div>

    <!-- ENVIRONMENT Menu -->
    <div class="runtime-menu" id="env-topbar-menu">
      <button class="runtime-menu-trigger" id="env-topbar-menu-trigger" aria-haspopup="true" aria-expanded="false">
        ENVIRONMENT
        <svg class="runtime-menu-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="runtime-menu-dropdown" id="env-topbar-menu-dropdown" role="menu">
        <button class="runtime-menu-item" id="envmenu-current" role="menuitem" data-view="current">
          <span class="runtime-menu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></span> Current Environment
        </button>
        <button class="runtime-menu-item" id="envmenu-create" role="menuitem" data-view="create">
          <span class="runtime-menu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span> Create Environment
        </button>
        <button class="runtime-menu-item" id="envmenu-pip" role="menuitem" data-view="pip">
          <span class="runtime-menu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span> Pip Manager
        </button>
        <button class="runtime-menu-item" id="envmenu-outline" role="menuitem" data-view="outline">
          <span class="runtime-menu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></span> Outline
        </button>
      </div>
    </div>
  </div>

  <div class="title-block">
    <div class="filename-wrapper">
      <input id="filename" class="filename-input" value="Untitled.ipynb" spellcheck="false" autocomplete="off" />
    </div>
    <span class="status" id="status">
      <span class="status-indicator"></span>
      <span id="status-label">IDLE</span>
      <span id="last-exec-time" style="font-size:0.6rem; opacity:0.6; margin-left:6px;"></span>
    </span>
  </div>

  <div class="spacer"></div>

  <div class="topbar-actions">
    <!-- Run Dropdown -->
    <div class="runtime-menu" id="run-menu">
      <button class="runtime-menu-trigger" id="run-menu-trigger" aria-haspopup="true" aria-expanded="false">
        RUN
        <svg class="runtime-menu-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="runtime-menu-dropdown" id="run-menu-dropdown" role="menu">
        <button class="runtime-menu-item" id="run-all" role="menuitem">▶ Run All Cells</button>
        <button class="runtime-menu-item" id="run-above" role="menuitem">⏫ Run Above Selected</button>
        <button class="runtime-menu-item" id="run-below" role="menuitem">⏬ Run Below Selected</button>
        <button class="runtime-menu-item" id="run-selected" role="menuitem">☑ Run Selected Cells</button>
        <div class="runtime-menu-divider"></div>
        <button class="runtime-menu-item" id="run-cell-keep-going" role="menuitem">⏩ Run Cell & Keep Going</button>
      </div>
    </div>

    <!-- Edit Dropdown -->
    <div class="runtime-menu" id="edit-menu">
      <button class="runtime-menu-trigger" id="edit-menu-trigger" aria-haspopup="true" aria-expanded="false">
        EDIT
        <svg class="runtime-menu-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="runtime-menu-dropdown" id="edit-menu-dropdown" role="menu">
        <button class="runtime-menu-item" id="btn-undo" role="menuitem">↩ Undo (Ctrl+Z)</button>
        <button class="runtime-menu-item" id="btn-redo" role="menuitem">↪ Redo (Ctrl+Y)</button>
        <div class="runtime-menu-divider"></div>
        <button class="runtime-menu-item" id="btn-merge" role="menuitem">⊞ Merge Selected Cells</button>
        <button class="runtime-menu-item" id="btn-split" role="menuitem">⊟ Split Cell</button>
        <div class="runtime-menu-divider"></div>
        <button class="runtime-menu-item" id="btn-find" role="menuitem">🔍 Find/Replace (Ctrl+F)</button>
        <button class="runtime-menu-item" id="btn-line-numbers" role="menuitem"># Toggle Line Numbers</button>
      </div>
    </div>

    <!-- Export Dropdown -->
    <div class="runtime-menu" id="export-menu">
      <button class="runtime-menu-trigger" id="export-menu-trigger" aria-haspopup="true" aria-expanded="false">
        EXPORT
        <svg class="runtime-menu-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="runtime-menu-dropdown" id="export-menu-dropdown" role="menu">
        <button class="runtime-menu-item" id="btn-export-html" role="menuitem">🌐 HTML</button>
        <button class="runtime-menu-item" id="btn-export-py" role="menuitem">🐍 Python Script</button>
        <button class="runtime-menu-item" id="btn-export-md" role="menuitem">📝 Markdown</button>
        <button class="runtime-menu-item" id="btn-export-pdf" role="menuitem">📄 PDF (Print)</button>
      </div>
    </div>

    <!-- Other buttons -->
    <button class="btn btn-warning" id="btn-terminal-toggle">📟 TERMINAL</button>
    <button class="btn btn-secondary" id="btn-theme-toggle" title="Toggle Light/Dark Theme">☀ DARK</button>
    <button class="btn btn-secondary" id="btn-presentation" title="Presentation mode (Ctrl+Shift+P)">⛶</button>
    <input type="file" id="file-input" accept=".ipynb" hidden />
    <button class="btn btn-secondary" id="btn-open">OPEN</button>
    <button class="btn btn-secondary" id="btn-save">SAVE</button>
  </div>
</header>

<div class="app-workspace" id="app-workspace">
  <!-- Environment Manager Panel (Left) -->
  <aside class="env-manager-panel" id="env-manager-panel" hidden>
    <div class="env-manager-header">
      <span class="env-manager-title" id="env-manager-title-text">📦 ENVIRONMENT</span>
      <button class="action-btn action-danger" id="btn-env-manager-close" title="Close">✕</button>
    </div>
    <div class="env-manager-body">
      <!-- views: current, create, pip, outline -->
      <div class="env-view" id="env-view-current">
        <section class="env-section">
          <h3>ACTIVE ENVIRONMENT</h3>
          <div class="env-mode-options">
            <label class="env-mode-option">
              <input type="radio" name="env-mode" value="global" />
              <span>Global Default</span>
            </label>
            <label class="env-mode-option">
              <input type="radio" name="env-mode" value="named" />
              <span>Named Global Env</span>
              <select id="env-named-select"></select>
            </label>
            <label class="env-mode-option">
              <input type="radio" name="env-mode" value="project" />
              <span>This Folder Only (.jupy_env)</span>
            </label>
          </div>
          <button class="btn btn-primary" id="btn-env-apply">SWITCH ENVIRONMENT</button>
          <div class="env-status-line" id="env-status-line"></div>
        </section>
        <section class="env-section">
          <h3>DETAILS</h3>
          <div class="about-row"><span>Jupy Version</span><span id="env-jupy-version">—</span></div>
          <div class="about-row"><span>Python</span><span id="env-python-version">—</span></div>
          <div class="about-row"><span>Env Path</span><span id="env-path">—</span></div>
          <div class="about-row"><span>Platform</span><span id="env-platform">—</span></div>
          <div class="about-row"><span>Packages</span><span id="env-package-count">—</span></div>
        </section>
      </div>
      <div class="env-view" id="env-view-create" hidden>
        <section class="env-section">
          <h3>CREATE NEW ENVIRONMENT</h3>
          <div class="env-create-row">
            <input type="text" id="env-create-input" placeholder="new environment name" autocomplete="off" spellcheck="false" />
            <button class="btn btn-secondary" id="btn-env-create">+ NEW</button>
          </div>
          <div class="env-status-line" id="env-create-status-line"></div>
          <div class="about-row"><span>Existing Envs</span><span id="env-existing-list">—</span></div>
        </section>
      </div>
      <div class="env-view" id="env-view-pip" hidden>
        <section class="env-section env-section-grow">
          <h3>PACKAGES</h3>
          <div class="pip-manager-install-row">
            <input type="text" id="pip-install-input" class="pip-search-input" placeholder="package name, e.g. requests==2.32.0" autocomplete="off" spellcheck="false" />
            <button class="btn btn-primary" id="btn-pip-install">INSTALL</button>
          </div>
          <div class="env-status-line" id="pip-status-line"></div>
          <div class="pip-manager-search-row">
            <input type="text" id="pip-search-input" class="pip-search-input" placeholder="🔍 search installed packages…" autocomplete="off" spellcheck="false" />
          </div>
          <div class="pip-manager-list" id="pip-manager-list">
            <div class="pip-manager-empty">Loading packages…</div>
          </div>
        </section>
      </div>
      <div class="env-view" id="env-view-outline" hidden>
        <section class="env-section env-section-grow">
          <h3>📋 OUTLINE</h3>
          <div style="font-size:0.7rem;opacity:0.7;margin-bottom:6px;">Functions &amp; classes in your notebook</div>
          <div class="outline-list" id="outline-list" style="flex:1;overflow-y:auto;max-height:400px;">
            <div class="pip-manager-empty">No functions or classes found.</div>
          </div>
        </section>
      </div>
    </div>
  </aside>

  <div class="notebook-panel">
    <main class="notebook" id="notebook"></main>
    <div class="add-cell-bottom">
      <button class="add-cell-btn" id="btn-add-bottom">+ CODE CELL</button>
    </div>
  </div>

  <aside class="terminal-panel" id="terminal-panel" hidden>
    <div class="terminal-header">
      <span class="terminal-title">📟 TERMINAL</span>
      <button class="action-btn action-danger" id="btn-terminal-close" title="Close Terminal">✕</button>
    </div>
    <div class="terminal-screen" id="terminal-screen">
      <pre class="terminal-output" id="terminal-output"></pre>
      <div class="terminal-input-line">
        <span class="terminal-prompt" id="terminal-prompt-label">❯</span>
        <input type="text" id="terminal-input" class="terminal-input" autocomplete="off" spellcheck="false" placeholder="type command..." />
      </div>
      <div class="terminal-bottom-spacer"></div>
    </div>
  </aside>
</div>

<!-- Find / Replace Bar -->
<div id="find-bar" style="display:none; position:fixed; bottom:60px; left:50%; transform:translateX(-50%); background:var(--color-surface); border:var(--border-thick); padding:6px 12px; border-radius:var(--rounded-sm); box-shadow:var(--shadow-brutal); z-index:9999; gap:8px; align-items:center;">
  <input id="find-input" type="text" placeholder="Find..." style="border:var(--border-thick); padding:2px 6px; font-family:var(--font-mono); background:var(--color-surface); color:var(--color-text);">
  <input id="replace-input" type="text" placeholder="Replace..." style="border:var(--border-thick); padding:2px 6px; font-family:var(--font-mono); background:var(--color-surface); color:var(--color-text);">
  <button id="find-next" class="btn btn-secondary">Next</button>
  <button id="find-replace-all" class="btn btn-primary">Replace All</button>
  <button id="find-close" class="action-btn">✕</button>
</div>

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
  <div class="cell" tabindex="-1" data-cell-id="{{id}}">
    <div class="cell-drag-handle" title="Drag to reorder">⠿</div>
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

<!-- CodeMirror and App -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/markdown/markdown.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/edit/closebrackets.min.js"></script>

<!-- Main App -->
<script type="module" src="js/app.js"></script>
</body>
</html>

---

# File: static\css\codemirror-brutalism.css

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


---

# File: static\css\main.css

@import "base/variables.css";
@import "components/topbar.css";
@import "components/runtime-menu.css";
@import "components/cells.css";
@import "components/terminal.css";
@import "components/env-manager.css";
@import "components/editor.css";
@import "components/system-bar.css";
@import "components/shortcuts-dialog.css";

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

---

# File: static\css\notebook.css

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


---

# File: static\css\base\variables.css

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


---

# File: static\css\components\about-modal.css

/* ==========================================================================
   Jupy Brutalism Design System - About Jupyvenv Modal
   ========================================================================== */

.about-overlay[hidden] {
  display: none !important;
}

.about-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.about-modal {
  width: 100%;
  max-width: 420px;
  background: var(--color-surface);
  border: var(--border-thick);
  border-radius: var(--rounded-md);
  box-shadow: var(--shadow-brutal-lg);
  overflow: hidden;
  color: var(--color-text);
}

.about-header {
  background: var(--color-primary);
  padding: 10px 14px;
  border-bottom: var(--border-thick);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.about-title {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 800;
  color: #FFFFFF;
  letter-spacing: 0.05em;
}

.about-close-btn {
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
.about-close-btn:hover {
  background: var(--color-secondary);
  color: #111827;
}

.about-body {
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.about-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 14px;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-bg-well);
}
.about-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.about-row span:first-child {
  opacity: 0.6;
  font-weight: 700;
  flex-shrink: 0;
}
.about-row span:last-child {
  font-weight: 800;
  text-align: right;
  word-break: break-word;
}


---

# File: static\css\components\cells.css

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


/* Markdown preview */
.markdown-preview {
  padding: 8px 12px;
  font-family: var(--font-body);
  line-height: 1.6;
  color: var(--color-text);
}
.markdown-preview h1, h2, h3, h4, h5, h6 {
  margin: 0.8em 0 0.4em;
  font-weight: 800;
}
.markdown-preview p {
  margin: 0.4em 0;
}
.markdown-preview ul, ol {
  padding-left: 1.5em;
}
.markdown-preview code {
  background: var(--color-bg-well);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: var(--font-mono);
}
.markdown-preview pre {
  background: var(--color-bg-well);
  padding: 0.8em;
  overflow-x: auto;
  border-radius: 4px;
}
/* Tables */
.markdown-preview table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.8em 0;
}
.markdown-preview th, .markdown-preview td {
  border: 1px solid var(--color-border);
  padding: 4px 8px;
  text-align: left;
}
.markdown-preview th {
  background: var(--color-secondary);
  color: #111827;
}
/* Plot containers */
.plot-container {
  margin: 6px 0;
}
/* Display data container */
.display-data-container {
  margin: 6px 0;
  overflow-x: auto;
}
.display-data-container video, .display-data-container audio {
  max-width: 100%;
}

/* Drag handle */
.cell-drag-handle {
  cursor: grab;
  opacity: 0.3;
  font-size: 1.2rem;
  line-height: 1;
  user-select: none;
  padding: 0 4px;
}
.cell-drag-handle:hover { opacity: 1; }

/* Selected cells */
.cell.selected {
  outline: 3px solid var(--color-secondary);
}

/* Presentation mode */
body.presentation-mode .topbar,
body.presentation-mode .system-bar-wrapper,
body.presentation-mode .env-manager-panel,
body.presentation-mode .terminal-panel {
  display: none !important;
}
body.presentation-mode .notebook-panel {
  background: #fff;
  transform: scale(0.8);
  transform-origin: top left;
}
body.presentation-mode .cell {
  border: 1px solid #ccc;
  box-shadow: none;
}

/* Find bar */
#find-bar input {
  background: var(--color-surface);
  color: var(--color-text);
}

---

# File: static\css\components\editor.css

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


---

# File: static\css\components\env-manager.css

/* ==========================================================================
   Jupy Brutalism Design System - Environment Manager Left Slide Panel
   (Env switcher + details + package manager, combined)
   ========================================================================== */

.env-manager-panel[hidden] { display: none !important; }

.env-manager-panel {
  width: 440px;
  min-width: 340px;
  max-width: 50vw;
  background: var(--color-surface);
  border-right: var(--border-thick);
  display: flex;
  flex-direction: column;
  height: 100%;
  flex-shrink: 0;
  z-index: 100;
}

.env-manager-header {
  padding: 6px 12px;
  background: var(--color-primary);
  border-bottom: var(--border-thick);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.env-manager-title {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 800;
  color: #FFFFFF;
  letter-spacing: 0.04em;
}

.env-manager-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Only one env-view (current / create / pip) is ever visible at a time —
   opening one from the ENVIRONMENT topbar dropdown hides whichever was
   previously showing (see env/envManager.js#showView). */
.env-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
}
.env-view[hidden] { display: none !important; }

.env-section {
  border: var(--border-thick);
  border-radius: var(--rounded-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-brutal-sm);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.env-section-grow {
  flex: 1;
  min-height: 220px;
}

.env-section h3 {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: var(--color-primary);
  border-bottom: 1px solid var(--color-bg-well);
  padding-bottom: 6px;
}

.env-mode-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.env-mode-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-body);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 2px;
}

.env-mode-option input[type="radio"] {
  accent-color: var(--color-primary);
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.env-mode-option select {
  margin-left: auto;
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  background: var(--color-bg-well);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  padding: 3px 6px;
  max-width: 140px;
}
.env-mode-option select:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.env-create-row {
  display: flex;
  gap: 6px;
}
.env-create-row input {
  flex: 1;
  min-width: 0;
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  background: var(--color-bg-well);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  padding: 6px 8px;
}
.env-create-row input:focus { outline: none; background: var(--color-surface); }

.env-status-line {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  opacity: 0.75;
  padding-top: 2px;
}

.about-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 14px;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-bg-well);
}
.about-row:last-child { border-bottom: none; padding-bottom: 0; }
.about-row span:first-child { opacity: 0.6; font-weight: 700; flex-shrink: 0; }
.about-row span:last-child { font-weight: 800; text-align: right; word-break: break-word; }

.pip-manager-install-row,
.pip-manager-search-row {
  display: flex;
  gap: 6px;
}

.pip-search-input {
  flex: 1;
  min-width: 0;
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  background: var(--color-bg-well);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  padding: 6px 8px;
}
.pip-search-input:focus { outline: none; background: var(--color-surface); }

.pip-manager-list {
  flex: 1;
  overflow-y: auto;
  min-height: 100px;
}

.pip-manager-empty {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--color-text);
  opacity: 0.55;
  text-align: center;
  padding: 20px 10px;
}

.pip-package-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 4px;
  border-bottom: 1px solid var(--color-bg-well);
}
.pip-package-row:last-child { border-bottom: none; }

.pip-package-name {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.pip-package-version {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  opacity: 0.6;
  flex-shrink: 0;
}


/* Hover tooltip */
.jupy-hover-tooltip {
  background: var(--color-surface);
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  box-shadow: var(--shadow-brutal-lg);
  padding: 6px 10px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  max-width: 400px;
  max-height: 200px;
  overflow: auto;
  pointer-events: none;
  z-index: 100000;
}

/* Outline items */
.outline-item:hover {
  background: var(--color-bg-well);
}
.outline-item:active {
  background: var(--color-secondary);
}

.jupy-hover-tooltip {
  pointer-events: auto !important;
}

---

# File: static\css\components\pip-manager.css

/* ==========================================================================
   Jupy Brutalism Design System - Pip Manager Left Slide Panel
   ========================================================================== */

.pip-manager-panel[hidden] {
  display: none !important;
}

.pip-manager-panel {
  width: 420px;
  min-width: 320px;
  max-width: 50vw;
  background: var(--color-surface);
  border-right: var(--border-thick);
  display: flex;
  flex-direction: column;
  height: 100%;
  flex-shrink: 0;
  z-index: 100;
}

.pip-manager-header {
  padding: 6px 12px;
  background: var(--color-primary);
  border-bottom: var(--border-thick);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pip-manager-title {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 800;
  color: #FFFFFF;
  letter-spacing: 0.04em;
}

.pip-manager-install-row,
.pip-manager-search-row {
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: var(--border-thick);
  flex-shrink: 0;
}

.pip-search-input {
  flex: 1;
  min-width: 0;
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  background: var(--color-bg-well);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  padding: 6px 8px;
}
.pip-search-input:focus {
  outline: none;
  background: var(--color-surface);
}

.pip-manager-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.pip-manager-empty {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--color-text);
  opacity: 0.55;
  text-align: center;
  padding: 28px 10px;
}

.pip-package-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-bottom: 1px solid var(--color-bg-well);
}
.pip-package-row:last-child {
  border-bottom: none;
}

.pip-package-name {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.pip-package-version {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  opacity: 0.6;
  flex-shrink: 0;
}

.pip-remove-btn {
  flex-shrink: 0;
}


---

# File: static\css\components\runtime-menu.css

/* ==========================================================================
   Jupy Brutalism Design System - Runtime Dropdown Menu (Top-Left)
   ========================================================================== */

.menu-block { position: relative; display: flex; align-items: center; gap: 8px; }

.runtime-menu { position: relative; }

.runtime-menu-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  background: var(--color-surface);
  color: var(--color-text);
  padding: 4px 10px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  cursor: pointer;
  box-shadow: var(--shadow-brutal-sm);
  user-select: none;
}
.runtime-menu-trigger:hover {
  background: var(--color-secondary);
  color: #111827;
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0px var(--color-shadow);
}
.runtime-menu-caret {
  font-size: 0.7rem;
  transition: transform 0.1s ease;
}
.runtime-menu.open .runtime-menu-caret {
  transform: rotate(180deg);
}

.runtime-menu-dropdown {
  display: none;
  flex-direction: column;
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 280px;
  background: var(--color-surface);
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  box-shadow: var(--shadow-brutal-lg);
  padding: 5px;
  z-index: 300;
}

/* Opens on hover (mouse) or via the .open class toggled by runtimeMenu.js
   (click, keyboard, touch) — see runtime/runtimeMenu.js. */
.runtime-menu-dropdown {
  display: none;
  flex-direction: column;
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 280px;
  background: var(--color-surface);
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  box-shadow: var(--shadow-brutal-lg);
  padding: 5px;
  z-index: 300;
}

/* Visibility is controlled entirely by JS via core/dropdownMenu.js, which
   already implements hover-to-open (mouseenter/mouseleave) with a close
   delay — a parallel CSS :hover rule here would fight that JS state and
   keep the dropdown open even after close() runs, if the mouse happens to
   still be over the menu. .open is the single source of truth. */
.runtime-menu.open .runtime-menu-dropdown {
  display: flex;
}
.runtime-menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  border: none;
  border-radius: var(--rounded-sm);
  background: transparent;
  color: var(--color-text);
  text-align: left;
  padding: 8px 10px;
  font-family: var(--font-body);
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
}
.runtime-menu-item:hover {
  background: var(--color-bg-well);
}
.runtime-menu-item:active {
  background: var(--color-secondary);
  color: #111827;
}

.runtime-menu-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.runtime-menu-icon svg {
  width: 100%;
  height: 100%;
}

.runtime-menu-caret {
  flex-shrink: 0;
  transition: transform 0.1s ease;
}
.runtime-menu.open .runtime-menu-caret {
  transform: rotate(180deg);
}

.runtime-menu-divider {
  height: 2px;
  background: var(--color-border);
  opacity: 0.15;
  margin: 5px 4px;
  flex-shrink: 0;
}


/* Ensure dropdowns work for any .runtime-menu */
.runtime-menu .runtime-menu-dropdown {
  display: none;
  flex-direction: column;
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 220px;
  background: var(--color-surface);
  border: var(--border-thick);
  border-radius: var(--rounded-sm);
  box-shadow: var(--shadow-brutal-lg);
  padding: 5px;
  z-index: 300;
}
.runtime-menu.open .runtime-menu-dropdown {
  display: flex;
}
.runtime-menu-divider {
  height: 2px;
  background: var(--color-border);
  opacity: 0.15;
  margin: 5px 4px;
}

---

# File: static\css\components\shortcuts-dialog.css

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


---

# File: static\css\components\system-bar.css

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


---

# File: static\css\components\terminal.css

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


---

# File: static\css\components\topbar.css

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


---

# File: static\css\components\widgets.css


/* widgets.css */
.widget-slider {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}
.widget-slider .widget-label {
  font-weight: 700;
  min-width: 80px;
}
.widget-slider input[type="range"] {
  flex: 1;
}
.widget-slider .widget-value {
  min-width: 30px;
  font-family: var(--font-mono);
}

.widget-text, .widget-dropdown, .widget-select, .widget-datepicker, .widget-timepicker, .widget-colorpicker, .widget-fileupload {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.widget-text .widget-label, .widget-dropdown .widget-label, .widget-select .widget-label,
.widget-datepicker .widget-label, .widget-timepicker .widget-label, .widget-colorpicker .widget-label,
.widget-fileupload .widget-label {
  font-weight: 700;
  min-width: 80px;
}
.widget-text input, .widget-datepicker input, .widget-timepicker input, .widget-colorpicker input,
.widget-fileupload input {
  border: var(--border-thick);
  padding: 2px 6px;
  font-family: var(--font-mono);
  background: var(--color-surface);
  color: var(--color-text);
}
.widget-fileupload input[type="file"] {
  border: none;
  padding: 0;
}
.widget-dropdown select, .widget-select select {
  border: var(--border-thick);
  padding: 2px 6px;
  font-family: var(--font-mono);
  background: var(--color-surface);
  color: var(--color-text);
}

.widget-checkbox label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
}
.widget-checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
}

.widget-radio-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.widget-radio-option {
  border: var(--border-thick);
  padding: 2px 12px;
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}
.widget-radio-option.active {
  background: var(--color-secondary);
  color: #111827;
}
.widget-radio-option:hover {
  background: var(--color-primary);
  color: #FFFFFF;
}

.widget-toggle-button {
  border: var(--border-thick);
  padding: 4px 12px;
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}
.widget-toggle-button.active {
  background: var(--color-secondary);
  color: #111827;
}

.widget-play {
  display: flex;
  align-items: center;
  gap: 10px;
}
.widget-play-button {
  border: var(--border-thick);
  padding: 4px 12px;
  background: var(--color-secondary);
  color: #111827;
  font-weight: 700;
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
}
.widget-play-button:hover {
  background: var(--color-primary);
  color: #FFFFFF;
}

.widget-layout {
  padding: 4px 0;
}
.widget-flex {
  display: flex;
}
.widget-grid {
  display: grid;
}
.widget-block {
  display: block;
}

.widget-accordion .accordion-panel {
  border: var(--border-thick);
  margin-bottom: 4px;
}
.widget-accordion .accordion-header {
  background: var(--color-secondary);
  padding: 4px 10px;
  font-weight: 700;
  cursor: pointer;
  color: #111827;
}
.widget-accordion .accordion-header:hover {
  background: var(--color-primary);
  color: #FFFFFF;
}
.widget-accordion .accordion-content {
  padding: 6px 10px;
}

.widget-tabs .tab-headers {
  display: flex;
  gap: 2px;
}
.widget-tabs .tab-header {
  border: var(--border-thick);
  padding: 4px 12px;
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}
.widget-tabs .tab-header.active {
  background: var(--color-secondary);
  color: #111827;
}
.widget-tabs .tab-content {
  border: var(--border-thick);
  padding: 6px;
  border-top: none;
}

.widget-stacked .stack-item {
  padding: 6px;
  border: var(--border-thick);
}

.widget-output {
  border: var(--border-thick);
  background: var(--color-bg-well);
  padding: 4px;
}
.widget-output .widget-output-content {
  max-height: 200px;
  overflow: auto;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-text);
}
.widget-container {
  margin: 4px 0;
}


---

# File: static\js\app.js

/**
 * app.js – Main entry point
 * Imports from the 'app' folder for modularity.
 */
import { initTheme } from './theme/theme.js';
import { initMetricsStream } from './metrics/metrics.js';
import { ReconnectingSocket } from './core/socket.js';
import { createToaster } from './core/toast.js';
import { setupTerminal } from './terminal/terminal.js';
import { registerAutocomplete } from './autocomplete/autocomplete.js';
import { initShortcuts } from './shortcuts/shortcuts.js';
import { createNotebookController } from './notebook/controller.js';
import { downloadNotebook, parseNotebookFile, readFileAsText } from './notebook/notebookFile.js';
import { initRuntimeMenu } from './runtime/runtimeMenu.js';
import { initEnvTopbarMenu } from './env/envTopbarMenu.js';
import { setupEnvManager } from './env/envManager.js';
import { initWidgetManager } from './widgets/widgetManager.js';
import { initDropdowns } from './app/init.js';
import { initRunDropdown } from './app/run.js';
import { initExportDropdown } from './app/export.js';
import { initEditDropdown } from './app/edit.js';

(() => {
  // ===== DOM Elements =====
  const container = document.getElementById('notebook');
  const filenameInput = document.getElementById('filename');
  const fileInput = document.getElementById('file-input');
  const openBtn = document.getElementById('btn-open');
  const saveBtn = document.getElementById('btn-save');
  const addCellBtn = document.getElementById('btn-add-bottom');
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  const toastContainer = document.getElementById('toast-container');
  const envStatusLabel = document.getElementById('env-status-label');

  const terminalPanel = document.getElementById('terminal-panel');
  const terminalToggleBtn = document.getElementById('btn-terminal-toggle');
  const terminalCloseBtn = document.getElementById('btn-terminal-close');
  const terminalScreen = document.getElementById('terminal-screen');
  const terminalOutput = document.getElementById('terminal-output');
  const terminalInput = document.getElementById('terminal-input');
  const terminalPromptLabel = document.getElementById('terminal-prompt-label');

  const runtimeMenu = document.getElementById('runtime-menu');
  const runtimeMenuTrigger = document.getElementById('runtime-menu-trigger');
  const runtimeMenuDropdown = document.getElementById('runtime-menu-dropdown');

  const envTopbarMenu = document.getElementById('env-topbar-menu');
  const envTopbarMenuTrigger = document.getElementById('env-topbar-menu-trigger');
  const envTopbarMenuDropdown = document.getElementById('env-topbar-menu-dropdown');

  const envPanel = document.getElementById('env-manager-panel');
  const envPanelTitle = document.getElementById('env-manager-title-text');
  const envCloseBtn = document.getElementById('btn-env-manager-close');

  const envViewCurrent = document.getElementById('env-view-current');
  const envViewCreate = document.getElementById('env-view-create');
  const envViewPip = document.getElementById('env-view-pip');
  const envViewOutline = document.getElementById('env-view-outline');

  const envModeRadios = Array.from(document.querySelectorAll('input[name="env-mode"]'));
  const envNamedSelect = document.getElementById('env-named-select');
  const envApplyBtn = document.getElementById('btn-env-apply');
  const envStatusLine = document.getElementById('env-status-line');
  const envJupyVersion = document.getElementById('env-jupy-version');
  const envPythonVersion = document.getElementById('env-python-version');
  const envPath = document.getElementById('env-path');
  const envPlatform = document.getElementById('env-platform');
  const envPackageCount = document.getElementById('env-package-count');

  const envCreateInput = document.getElementById('env-create-input');
  const envCreateBtn = document.getElementById('btn-env-create');
  const envCreateStatusLine = document.getElementById('env-create-status-line');
  const envExistingList = document.getElementById('env-existing-list');

  const pipManagerList = document.getElementById('pip-manager-list');
  const pipSearchInput = document.getElementById('pip-search-input');
  const pipInstallInput = document.getElementById('pip-install-input');
  const pipInstallBtn = document.getElementById('btn-pip-install');
  const pipStatusLine = document.getElementById('pip-status-line');

  const outlineListEl = document.getElementById('outline-list');

  const cellTemplate = document.getElementById('cell-template');
  const insertBarTemplate = document.getElementById('insert-bar-template');

  const showToast = createToaster(toastContainer);

  // ===== Theme & Metrics =====
  initTheme(themeToggleBtn);
  initMetricsStream();

  // ===== Run Socket =====
  let notebook = null;
  let reconnectToastShown = false;

  const runSocket = new ReconnectingSocket('/ws/run', {
    onMessage: (data) => {
      if (data.type === 'widget') {
        if (window.__jupy_widgetManager) {
          window.__jupy_widgetManager.handleMessage(data.data);
        }
      } else {
        notebook?.handleRunMessage(data);
      }
    },
    onOpen: () => {
      if (reconnectToastShown) {
        showToast('🔄 KERNEL RECONNECTED', 'success');
        reconnectToastShown = false;
      }
    },
    onClose: () => {
      if (!reconnectToastShown) {
        showToast('⚠️ KERNEL CONNECTION LOST — RECONNECTING…', 'danger');
        reconnectToastShown = true;
      }
    },
  });

  // ===== Widget Manager =====
  const widgetManager = initWidgetManager(runSocket);
  window.__jupy_widgetManager = widgetManager;
  window.__jupy_runSocket = runSocket;

  // ===== Notebook Controller =====
  const onCellChange = () => {
    if (envManager && typeof envManager.scheduleOutlineUpdate === 'function') {
      envManager.scheduleOutlineUpdate();
    }
  };

  notebook = createNotebookController({
    container,
    templates: { cellTemplate, insertBarTemplate },
    runSocket,
    showToast,
    registerAutocomplete,
    onCellChange,
  });

  window.__jupy_notebook = notebook;

  // ===== Terminal =====
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

  // ===== Shortcuts =====
  initShortcuts(notebook);

  // ===== Environment Manager =====
  const envManager = setupEnvManager({
    panel: envPanel,
    titleEl: envPanelTitle,
    closeBtn: envCloseBtn,
    views: {
      current: envViewCurrent,
      create: envViewCreate,
      pip: envViewPip,
      outline: envViewOutline,
    },
    modeRadios: envModeRadios,
    namedSelect: envNamedSelect,
    createInput: envCreateInput,
    createBtn: envCreateBtn,
    applyBtn: envApplyBtn,
    statusLine: envStatusLine,
    jupyVersionEl: envJupyVersion,
    pythonVersionEl: envPythonVersion,
    pathEl: envPath,
    platformEl: envPlatform,
    packageCountEl: envPackageCount,
    statusLabelEl: envStatusLabel,
    listEl: pipManagerList,
    searchInput: pipSearchInput,
    installInput: pipInstallInput,
    installBtn: pipInstallBtn,
    createStatusLine: envCreateStatusLine,
    existingEnvsEl: envExistingList,
    pipStatusLine,
    outlineListEl,
    notebook,
    showToast,
    onResize: () => setTimeout(() => notebook.refreshAllEditors(), 50),
    onEnvSwitched: () => showToast('🔄 KERNEL RESTARTED ON NEW ENVIRONMENT', 'danger'),
  });
  envManager.refreshStatus();

  // ===== Dropdown Menus =====
  initDropdowns();
  initRunDropdown(notebook);
  initExportDropdown(notebook, showToast);
  initEditDropdown(notebook, showToast);

  // ===== Presentation Button =====
  document.getElementById('btn-presentation')?.addEventListener('click', () => {
    notebook.togglePresentation();
  });

  // ===== Restart / Interrupt methods (attach to notebook) =====
  notebook.restartKernel = async function() {
    try {
      const res = await fetch('/api/restart', { method: 'POST' });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      this.getCells().forEach((c) => {
        c.execCount = null;
        c.dom.execCountEl.textContent = '[\u00A0]';
        const output = c.dom.outputEl;
        output.hidden = true;
        output.innerHTML = '';
      });
      showToast('🔄 KERNEL RESTARTED', 'danger');
      return true;
    } catch (err) {
      showToast('⚠️ FAILED TO RESTART KERNEL', 'danger');
      return false;
    }
  };

  notebook.restartAndRunAll = async function() {
    const ok = await this.restartKernel();
    if (ok) this.runAll();
  };

  notebook.restartAndRunToSelected = async function() {
    const ok = await this.restartKernel();
    if (ok) {
      const targetIdx = this.getSelectedId()
        ? this.getCells().findIndex(c => c.id === this.getSelectedId())
        : -1;
      if (targetIdx === -1) {
        this.runAll();
      } else {
        this.getCells().slice(0, targetIdx + 1).forEach(c => this.runCell(c.id, { advance: false }));
      }
    }
  };

  notebook.interruptKernel = function() {
    if (runSocket.isOpen) {
      runSocket.send({ action: 'interrupt' });
      showToast('⏹ EXECUTION INTERRUPTED', 'danger');
    }
  };

  // ===== Open / Save =====
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
      notebook.loadNotebook(sources);
      if (filenameInput) filenameInput.value = file.name.replace(/\.ipynb$/, '');
      showToast('📂 NOTEBOOK LOADED', 'success');
    } catch (err) {
      console.error('Failed to open notebook:', err);
      showToast('⚠️ FAILED TO OPEN NOTEBOOK — INVALID .ipynb FILE', 'danger');
    } finally {
      fileInput.value = '';
    }
  });

  // ===== Add Cell Button =====
  addCellBtn?.addEventListener('click', () => {
    notebook.insertCellAt(notebook.getCells().length, '', { focus: true });
  });

  // ===== Default Notebook =====
  notebook.insertCellAt(0, [
    '# JUPY - COLAB & JUPYTER SHORTCUTS INTEGRATION',
    '# Press Ctrl + Shift + ? to open the Help Dialog!',
    '# Press Ctrl + / inside CodeMirror to toggle comments!',
    'import time',
    'print("Press Ctrl + Shift + ? to view all keyboard shortcuts!")',
  ].join('\n'));

  // ===== Menus =====
  initRuntimeMenu({
    menu: runtimeMenu,
    trigger: runtimeMenuTrigger,
    dropdown: runtimeMenuDropdown,
    notebook,
  });

  initEnvTopbarMenu({
    menu: envTopbarMenu,
    trigger: envTopbarMenuTrigger,
    dropdown: envTopbarMenuDropdown,
    envManager,
  });
})();

---

# File: static\js\app\edit.js

/**
 * app/edit.js – Edit dropdown handlers
 */
export function initEditDropdown(notebook, showToast) {
  document.getElementById('btn-undo')?.addEventListener('click', () => {
    notebook.undo();
  });
  document.getElementById('btn-redo')?.addEventListener('click', () => {
    notebook.redo();
  });
  document.getElementById('btn-merge')?.addEventListener('click', () => {
    notebook.mergeSelectedCells();
  });
  document.getElementById('btn-split')?.addEventListener('click', () => {
    const id = notebook.getSelectedId();
    if (id) notebook.splitCellAtCursor(id);
  });
  document.getElementById('btn-find')?.addEventListener('click', () => {
    toggleFindBar();
  });
  document.getElementById('btn-line-numbers')?.addEventListener('click', () => {
    notebook.toggleLineNumbers();
  });
}

let findBarVisible = false;
function toggleFindBar() {
  const bar = document.getElementById('find-bar');
  if (bar) {
    findBarVisible = !findBarVisible;
    bar.style.display = findBarVisible ? 'flex' : 'none';
    if (findBarVisible) {
      const input = document.getElementById('find-input');
      if (input) setTimeout(() => input.focus(), 50);
    }
  }
}


---

# File: static\js\app\export.js

/**
 * app/export.js – Export dropdown handlers and utilities
 */
export function getNotebookData(notebook) {
  const cells = notebook.getCells();
  return {
    cells: cells.map(c => ({
      type: c.type || 'code',
      source: c.cm.getValue(),
      outputs: c.outputs || []
    }))
  };
}

export function initExportDropdown(notebook, showToast) {
  document.getElementById('btn-export-html')?.addEventListener('click', async () => {
    const notebookData = getNotebookData(notebook);
    const res = await fetch('/api/export/html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notebook: notebookData })
    });
    const data = await res.json();
    if (data.html) {
      const blob = new Blob([data.html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'notebook.html';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      showToast('⚠️ Export failed: No HTML returned', 'danger');
    }
  });

  document.getElementById('btn-export-py')?.addEventListener('click', async () => {
    const notebookData = getNotebookData(notebook);
    const res = await fetch('/api/export/py', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notebook: notebookData })
    });
    const data = await res.json();
    if (data.script) {
      const blob = new Blob([data.script], { type: 'text/x-python' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'notebook.py';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      showToast('⚠️ Export failed: No Python script returned', 'danger');
    }
  });

  document.getElementById('btn-export-md')?.addEventListener('click', async () => {
    const notebookData = getNotebookData(notebook);
    const res = await fetch('/api/export/md', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notebook: notebookData })
    });
    const data = await res.json();
    if (data.markdown) {
      const blob = new Blob([data.markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'notebook.md';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      showToast('⚠️ Export failed: No Markdown returned', 'danger');
    }
  });

  document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
    const notebookData = getNotebookData(notebook);
    const res = await fetch('/api/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notebook: notebookData })
    });
    const data = await res.json();
    if (data.html) {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(data.html);
        win.document.close();
        win.focus();
        win.print();
      } else {
        showToast('⚠️ Popup blocked. Please allow popups for this site.', 'danger');
      }
    } else {
      showToast('⚠️ Export failed: No HTML returned for PDF', 'danger');
    }
  });
}


---

# File: static\js\app\init.js

/**
 * app/init.js – Common initializations: dropdowns, etc.
 */
import { createDropdown } from '../core/dropdownMenu.js';

export function initDropdowns() {
  createDropdown({
    menu: document.getElementById('run-menu'),
    trigger: document.getElementById('run-menu-trigger'),
    dropdown: document.getElementById('run-menu-dropdown')
  });
  createDropdown({
    menu: document.getElementById('edit-menu'),
    trigger: document.getElementById('edit-menu-trigger'),
    dropdown: document.getElementById('edit-menu-dropdown')
  });
  createDropdown({
    menu: document.getElementById('export-menu'),
    trigger: document.getElementById('export-menu-trigger'),
    dropdown: document.getElementById('export-menu-dropdown')
  });
}


---

# File: static\js\app\run.js

/**
 * app/run.js – Run dropdown handlers
 */
export function initRunDropdown(notebook) {
  document.getElementById('run-all')?.addEventListener('click', () => notebook.runAll());
  document.getElementById('run-above')?.addEventListener('click', () => {
    const selectedId = notebook.getSelectedId();
    if (!selectedId) return;
    const cells = notebook.getCells();
    const idx = cells.findIndex(c => c.id === selectedId);
    if (idx === -1) return;
    cells.slice(0, idx).forEach(c => notebook.runCell(c.id, { advance: false }));
  });
  document.getElementById('run-below')?.addEventListener('click', () => {
    const selectedId = notebook.getSelectedId();
    if (!selectedId) return;
    const cells = notebook.getCells();
    const idx = cells.findIndex(c => c.id === selectedId);
    if (idx === -1) return;
    cells.slice(idx + 1).forEach(c => notebook.runCell(c.id, { advance: false }));
  });
  document.getElementById('run-selected')?.addEventListener('click', () => {
    const ids = notebook.getSelectedIds();
    if (ids.length === 0) return;
    ids.forEach(id => notebook.runCell(id, { advance: false }));
  });
  document.getElementById('run-cell-keep-going')?.addEventListener('click', () => {
    const id = notebook.getSelectedId();
    if (!id) return;
    notebook.runCell(id, { advance: true });
  });
}


---

# File: static\js\autocomplete\autocomplete.js

/**
 * autocomplete/autocomplete.js
 * Wires a CodeMirror instance to Jupy's `/api/complete` and `/api/hover`.
 * Shows VS‑Code‑style tooltips with full details.
 */
import { AUTOCOMPLETE_DEBOUNCE_MS } from '../config/constants.js';

const IGNORED_KEYS = new Set([
  'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Shift', 'Tab', 'Backspace', ' ',
]);

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Global tooltip element
let hoverTooltip = null;
let hideTooltipTimer = null;
let isHoveringTooltip = false;

function createTooltip() {
  if (!hoverTooltip) {
    hoverTooltip = document.createElement('div');
    hoverTooltip.className = 'jupy-hover-tooltip';
    hoverTooltip.style.position = 'absolute';
    hoverTooltip.style.display = 'none';
    hoverTooltip.style.zIndex = '100000';
    hoverTooltip.style.background = 'var(--color-surface)';
    hoverTooltip.style.border = 'var(--border-thick)';
    hoverTooltip.style.borderRadius = 'var(--rounded-sm)';
    hoverTooltip.style.boxShadow = 'var(--shadow-brutal-lg)';
    hoverTooltip.style.padding = '8px 12px';
    hoverTooltip.style.fontFamily = 'var(--font-mono)';
    hoverTooltip.style.fontSize = '0.78rem';
    hoverTooltip.style.maxWidth = '480px';
    hoverTooltip.style.maxHeight = '280px';
    hoverTooltip.style.overflow = 'auto';
    hoverTooltip.style.pointerEvents = 'auto';
    hoverTooltip.style.lineHeight = '1.4';
    document.body.appendChild(hoverTooltip);

    hoverTooltip.addEventListener('mouseenter', () => {
      isHoveringTooltip = true;
      if (hideTooltipTimer) {
        clearTimeout(hideTooltipTimer);
        hideTooltipTimer = null;
      }
    });
    hoverTooltip.addEventListener('mouseleave', () => {
      isHoveringTooltip = false;
      scheduleHideTooltip(300);
    });
  }
  return hoverTooltip;
}

function scheduleHideTooltip(delay = 300) {
  if (hideTooltipTimer) clearTimeout(hideTooltipTimer);
  hideTooltipTimer = setTimeout(() => {
    if (!isHoveringTooltip) {
      hideTooltip();
    }
    hideTooltipTimer = null;
  }, delay);
}

function hideTooltip() {
  if (hoverTooltip) {
    hoverTooltip.style.display = 'none';
    hoverTooltip.innerHTML = '';
  }
  isHoveringTooltip = false;
  if (hideTooltipTimer) {
    clearTimeout(hideTooltipTimer);
    hideTooltipTimer = null;
  }
}

function clampTooltip(tooltip) {
  const rect = tooltip.getBoundingClientRect();
  const margin = 10;
  let left = parseFloat(tooltip.style.left) || 0;
  let top = parseFloat(tooltip.style.top) || 0;
  const maxLeft = window.innerWidth - rect.width - margin;
  const maxTop = window.innerHeight - rect.height - margin;
  if (left > maxLeft) left = maxLeft;
  if (left < margin) left = margin;
  if (top > maxTop) top = maxTop;
  if (top < margin) top = margin;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

/**
 * Register autocomplete and hover for a CodeMirror instance.
 * @param {CodeMirror} cm
 * @param {string} cellId - ID of the cell this editor belongs to
 */
export function registerAutocomplete(cm, cellId) {
  let debounceTimer = null;
  let activeAbortController = null;
  let hoverTimer = null;

  const notebook = window.__jupy_notebook;

  function triggerHint(editor) {
    CodeMirror.showHint(editor, fetchCompletions, {
      async: true,
      completeSingle: false,
      closeOnUnfocus: true,
      customKeys: {
        Up: (cm, handle) => handle.moveFocus(-1),
        Down: (cm, handle) => handle.moveFocus(1),
        Tab: (cm, handle) => handle.pick(),
        Enter: (cm, handle) => handle.pick(),
        Esc: (cm, handle) => handle.close(),
      },
    });
  }

  function fetchCompletions(editor, callback) {
    const cursor = editor.getCursor();
    const code = editor.getValue();

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
        if (err.name !== 'AbortError') callback(null);
      });
  }

  // Hover with VS‑Code‑style tooltip
  function showHover(editor, event) {
    const cursor = editor.coordsChar({ left: event.clientX, top: event.clientY });
    const token = editor.getTokenAt(cursor);
    if (!token || !token.string || token.type === 'comment' || token.type === 'string') {
      hideTooltip();
      return;
    }
    if (!IDENTIFIER_RE.test(token.string) && token.string !== '.') {
      hideTooltip();
      return;
    }

    if (!notebook) {
      hideTooltip();
      return;
    }

    // Find this cell's index
    const cells = notebook.getCells();
    let targetIndex = -1;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].id === cellId) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex === -1) {
      hideTooltip();
      return;
    }

    // Build combined code and compute line offsets correctly
    let allCode = '';
    const lineOffsets = []; // number of lines before each cell
    let currentLineCount = 0;
    for (let i = 0; i < cells.length; i++) {
      const cellCode = cells[i].cm.getValue();
      const lines = cellCode.split('\n');
      lineOffsets[i] = currentLineCount; // lines before this cell
      allCode += cellCode;
      currentLineCount += lines.length;
      if (i < cells.length - 1) {
        // Add two newlines – this creates one empty line between cells
        allCode += '\n\n';
        currentLineCount += 1; // the empty line
      }
    }

    const absoluteLine = lineOffsets[targetIndex] + cursor.line + 1; // 1‑based

    // Debug logs (remove after verification)
    console.log(`[Hover] cellId: ${cellId}, targetIndex: ${targetIndex}`);
    console.log(`[Hover] cursor.line: ${cursor.line}, cursor.ch: ${cursor.ch}`);
    console.log(`[Hover] lineOffsets[targetIndex]: ${lineOffsets[targetIndex]}, absoluteLine: ${absoluteLine}`);
    console.log(`[Hover] combinedCode length: ${allCode.length}, first 200 chars:`, allCode.substring(0, 200));

    const pos = editor.cursorCoords(cursor, 'page');
    const tooltip = createTooltip();
    tooltip.style.display = 'block';
    tooltip.style.left = (pos.left + 10) + 'px';
    tooltip.style.top = (pos.top - 10) + 'px';

    if (hideTooltipTimer) {
      clearTimeout(hideTooltipTimer);
      hideTooltipTimer = null;
    }

    tooltip.textContent = 'Loading…';

    fetch('/api/hover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: allCode,
        line: absoluteLine,
        column: cursor.ch,
      }),
    })
      .then(res => res.json())
      .then(data => {
        const info = data.hover;
        console.log('[Hover] Server response:', info);
        if (!info) {
          // If Jedi couldn't find it, try a fallback: get the definition using goto
          // but we'll just show a more helpful message.
          tooltip.innerHTML = '<div style="opacity:0.7;">No documentation available</div>';
          clampTooltip(tooltip);
          return;
        }

        let html = '';

        // Header: name + type badge
        html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">`;
        html += `<span style="font-weight:800; font-size:0.9rem; color:var(--color-primary);">${info.name}</span>`;
        if (info.type) {
          const typeLabel = info.type === 'function' ? 'func' : info.type;
          html += `<span style="font-size:0.6rem; background:var(--color-secondary); padding:1px 6px; border-radius:3px; color:#111827; font-weight:700; text-transform:uppercase;">${typeLabel}</span>`;
        }
        html += `</div>`;

        // Signature
        if (info.signature) {
          html += `<div style="font-family:var(--font-mono); font-size:0.75rem; background:var(--color-bg-well); padding:3px 8px; border-radius:3px; margin-bottom:4px; border-left:3px solid var(--color-primary); white-space:pre-wrap; word-break:break-all;">${info.signature}</div>`;
        }

        // Description
        if (info.description) {
          html += `<div style="font-size:0.78rem; margin-bottom:2px;">${info.description}</div>`;
        }

        // Full docstring (after first line)
        if (info.docstring && info.docstring !== info.description) {
          const lines = info.docstring.split('\n');
          if (lines.length > 1) {
            const rest = lines.slice(1).join('\n');
            html += `<div style="font-size:0.72rem; opacity:0.8; border-top:1px solid var(--color-border); padding-top:4px; margin-top:2px; max-height:80px; overflow-y:auto; white-space:pre-wrap;">${rest}</div>`;
          }
        }

        // Module
        if (info.module) {
          html += `<div style="font-size:0.6rem; opacity:0.5; margin-top:4px; border-top:1px solid var(--color-bg-well); padding-top:2px;">from ${info.module}</div>`;
        }

        tooltip.innerHTML = html;
        clampTooltip(tooltip);
      })
      .catch((err) => {
        console.error('[Hover] Fetch error:', err);
        tooltip.innerHTML = '<div style="opacity:0.7;">Error fetching info</div>';
        clampTooltip(tooltip);
      });
  }

  const wrapper = cm.getWrapperElement();
  wrapper.addEventListener('mouseover', (event) => {
    const target = event.target.closest('.CodeMirror');
    if (!target) return;
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      showHover(cm, event);
      hoverTimer = null;
    }, 400);
  });

  wrapper.addEventListener('mouseout', (event) => {
    const related = event.relatedTarget;
    if (related && wrapper.contains(related)) return;
    scheduleHideTooltip(300);
  });

  cm.on('scroll', () => {
    if (!isHoveringTooltip) hideTooltip();
  });
  cm.on('cursorActivity', () => {
    if (!isHoveringTooltip) hideTooltip();
  });

  // Ctrl+Space / Cmd+Space trigger instantly
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

---

# File: static\js\cells\cellFactory.js

/**
 * cells/cellFactory.js
 * Builds code, markdown, and raw cells with drag handle and line number support.
 */
import { moveLineUp, moveLineDown, toggleComment } from './editorCommands.js';

export function createCell(id, source, templates, hooks, registerAutocomplete) {
  const { cellTemplate, insertBarTemplate } = templates;

  const frag = cellTemplate.content.cloneNode(true);
  const root = frag.querySelector('.cell');
  const runBtn = frag.querySelector('.run-btn');
  const execCountEl = frag.querySelector('.exec-count');
  const editorHost = frag.querySelector('.cell-editor');
  const outputEl = frag.querySelector('.cell-output');
  const toolbar = frag.querySelector('.cell-toolbar');

  // Drag handle
  const dragHandle = frag.querySelector('.cell-drag-handle');
  if (dragHandle) {
    dragHandle.draggable = true;
    dragHandle.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', id);
      if (hooks.onDragStart) hooks.onDragStart(id, e);
    });
    dragHandle.addEventListener('dragend', (e) => {
      if (hooks.onDragEnd) hooks.onDragEnd(e);
    });
  }

  const barFrag = insertBarTemplate.content.cloneNode(true);
  const insertBar = barFrag.querySelector('.insert-bar');

  const cell = {
    id,
    type: 'code', // code, markdown, raw
    execCount: null,
    outputs: [],
    isPreview: false,
    dom: { root, runBtn, execCountEl, editorHost, outputEl, toolbar, insertBar, dragHandle },
    cm: null,
  };

  // Create CodeMirror instance
  const cm = CodeMirror(editorHost, {
    value: source,
    mode: 'python',
    theme: 'brutalism',
    lineNumbers: false, // toggled later
    viewportMargin: Infinity,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    autoCloseBrackets: true,
    extraKeys: {
      'Shift-Enter': (editor) => {
        if (cell.type === 'markdown') {
          renderMarkdown(cell);
          hooks.onRun(cell.id, { advance: true });
        } else {
          hooks.onRun(cell.id, { advance: true });
        }
      },
      'Ctrl-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { advance: false }); },
      'Cmd-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { advance: false }); },
      'Alt-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { insertBelow: true }); },
      Esc: () => {
        if (cell.type === 'markdown' && cell.isPreview) {
          setMarkdownEdit(cell);
        } else {
          hooks.onExitEdit(cell.id);
        }
      },
      'Alt-Up': (editor) => moveLineUp(editor),
      'Alt-Down': (editor) => moveLineDown(editor),
      'Ctrl-/': (editor) => toggleComment(editor),
      'Cmd-/': (editor) => toggleComment(editor),
    },
  });
  cell.cm = cm;

  // For markdown, double-click to edit
  if (cell.type === 'markdown') {
    root.addEventListener('dblclick', () => setMarkdownEdit(cell));
  }

  // Register autocomplete (pass cell ID for line offset)
  registerAutocomplete(cm, cell.id);

  // Notify on change
  cm.on('change', () => {
    if (hooks.onCellChange) hooks.onCellChange(cell.id);
  });

  cm.on('focus', () => hooks.onEnterEdit(cell.id));
  root.addEventListener('click', (e) => {
    if (!editorHost.contains(e.target) && !dragHandle?.contains(e.target)) {
      hooks.onSelect(cell.id);
    }
  });

  runBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (cell.type === 'markdown' && cell.isPreview) {
      renderMarkdown(cell);
    } else {
      hooks.onRunButtonClick(cell.id);
    }
  });

  // Toolbar actions
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

  // Insert bar
  insertBar.querySelector('.add-cell-btn').addEventListener('click', () => {
    hooks.onInsertAfter(cell.id);
  });

  // Markdown helpers
  function renderMarkdown(cell) {
    if (cell.type !== 'markdown') return;
    const src = cell.cm.getValue();
    if (!src.trim()) {
      setMarkdownEdit(cell);
      return;
    }
    let html = '';
    if (window.marked) {
      html = window.marked.parse(src);
    } else {
      html = `<pre>${src}</pre>`;
    }
    const previewDiv = document.createElement('div');
    previewDiv.className = 'markdown-preview';
    previewDiv.innerHTML = html;
    // Replace editor with preview
    editorHost.innerHTML = '';
    editorHost.appendChild(previewDiv);
    cell.isPreview = true;
    if (window.MathJax) {
      MathJax.typesetPromise([previewDiv]).catch(() => {});
    }
  }

  function setMarkdownEdit(cell) {
    if (cell.type !== 'markdown') return;
    // Restore CodeMirror editor
    editorHost.innerHTML = '';
    editorHost.appendChild(cm.getWrapperElement());
    cell.isPreview = false;
    cm.refresh();
    cm.focus();
  }

  // Public method to toggle line numbers
  cell.toggleLineNumbers = (enabled) => {
    cm.setOption('lineNumbers', enabled);
  };

  return cell;
}

---

# File: static\js\cells\cellOutput.js

/**
 * cells/cellOutput.js
 * Rendering of cell outputs (text, plots, rich display data, widgets).
 */
import { MAX_CELL_OUTPUT_LINES } from '../config/constants.js';
import { renderRichOutput } from '../output/richOutput.js';

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
  trimOutputLines(cell);
  scrollToBottom(cell);
}

export function appendCellPlot(cell, htmlString) {
  if (!htmlString || !htmlString.trim()) return;
  cell.dom.outputEl.hidden = false;
  let wrapper = cell.dom.outputEl.querySelector('.cell-plots-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'cell-plots-wrapper';
    cell.dom.outputEl.appendChild(wrapper);
  }
  const div = document.createElement('div');
  div.className = 'plot-container';
  div.innerHTML = htmlString;
  wrapper.appendChild(div);
  cell.outputs.push({ kind: 'plot', text: htmlString });
  scrollToBottom(cell);
}

export function appendDisplayData(cell, mimeData) {
  console.log('[appendDisplayData] Called with mimeData:', mimeData);
  cell.dom.outputEl.hidden = false;
  const container = document.createElement('div');
  container.className = 'display-data-container';
  const rendered = renderRichOutput(container, mimeData);
  console.log('[appendDisplayData] rendered =', rendered);
  if (!rendered) {
    container.textContent = '(Display data with unknown format)';
  }
  cell.dom.outputEl.appendChild(container);
  cell.outputs.push({ kind: 'display', data: mimeData });
  scrollToBottom(cell);
}

export function appendWidget(cell, widgetData) {
  cell.dom.outputEl.hidden = false;
  const container = document.createElement('div');
  container.className = 'widget-container';
  if (window.__jupy_widgetManager) {
    window.__jupy_widgetManager.renderWidget(widgetData, container);
  } else {
    container.textContent = 'Widget manager not available';
  }
  cell.dom.outputEl.appendChild(container);
  cell.outputs.push({ kind: 'widget', data: widgetData });
  scrollToBottom(cell);
}

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

function trimOutputLines(cell) {
  const spans = cell.dom.outputEl.querySelectorAll('span');
  if (spans.length > MAX_CELL_OUTPUT_LINES) {
    const overflow = spans.length - MAX_CELL_OUTPUT_LINES;
    for (let i = 0; i < overflow; i++) {
      spans[i].remove();
    }
  }
}

function scrollToBottom(cell) {
  requestAnimationFrame(() => {
    cell.dom.outputEl.scrollTop = cell.dom.outputEl.scrollHeight;
  });
}

---

# File: static\js\cells\editorCommands.js

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

---

# File: static\js\cells\markdownRenderer.js

// cells/markdownRenderer.js
export function renderMarkdown(markdownText) {
    if (window.marked) {
        return window.marked.parse(markdownText);
    }
    return `<pre>${markdownText}</pre>`;
}

---

# File: static\js\config\constants.js

/**
 * config/constants.js
 * Shared timing, sizing, and networking constants for the Jupy front-end.
 */

// Double-tap window for the "D D" (delete), "I I" (interrupt), "0 0" (restart) shortcuts.
export const DOUBLE_TAP_WINDOW_MS = 600;

// Debounce before firing an autocomplete request after the user stops typing.
export const AUTOCOMPLETE_DEBOUNCE_MS = 200;  // increased from 50 to reduce load

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

---

# File: static\js\core\dropdownMenu.js

/**
 * core/dropdownMenu.js
 * Generic hover/click controller for a topbar dropdown menu (opens on hover
 * OR click, closes on click-outside, Escape, or the mouse leaving the whole
 * menu). Shared by the RUNTIME dropdown and the ENVIRONMENT dropdown so both
 * behave identically — see runtime/runtimeMenu.js and env/envTopbarMenu.js.
 *
 * @param {object} deps
 * @param {HTMLElement} deps.menu - the outer `.runtime-menu` container (trigger + dropdown)
 * @param {HTMLElement} deps.trigger - the visible button that opens/closes the menu
 * @param {HTMLElement} deps.dropdown - the dropdown panel itself (unused directly here,
 *   visibility is driven purely by the `.open` class + CSS, but kept for symmetry/future use)
 */
export function createDropdown({ menu, trigger, dropdown }) {
  const HOVER_CLOSE_DELAY_MS = 250;
  let closeTimer = null;

  function open() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    menu.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }
  function close() {
    menu.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }
  function scheduleClose() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { close(); closeTimer = null; }, HOVER_CLOSE_DELAY_MS);
  }
  function isOpen() {
    return menu.classList.contains('open');
  }

  menu.addEventListener('mouseenter', open);
  menu.addEventListener('mouseleave', scheduleClose);

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen() ? close() : open();
  });

  document.addEventListener('click', (e) => {
    if (isOpen() && !menu.contains(e.target)) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      close();
      trigger.focus();
    }
  });

  /** Binds a click handler to a menu item by id; closes the dropdown first. */
  function bind(id, fn) {
    const el = document.getElementById(id);
    el?.addEventListener('click', () => {
      close();
      fn(el);
    });
  }

  return { open, close, isOpen, bind };
}

---

# File: static\js\core\socket.js

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


---

# File: static\js\core\toast.js

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


---

# File: static\js\debugger\debugger.js

export function initDebugger() { console.warn('Debugger not implemented'); }
export function showDebugger() {}
export function hideDebugger() {}

---

# File: static\js\env\envManager.js

/**
 * env/envManager.js
 * Left slide-out panel with four views: current, create, pip, outline.
 */
export function setupEnvManager({
  panel, closeBtn, titleEl,
  views, // { current, create, pip, outline }
  modeRadios, namedSelect, createInput, createBtn, applyBtn, statusLine,
  jupyVersionEl, pythonVersionEl, pathEl, platformEl, packageCountEl,
  statusLabelEl,
  listEl, searchInput, installInput, installBtn,
  createStatusLine, existingEnvsEl, pipStatusLine,
  outlineListEl,  // container for outline items
  notebook,       // notebook controller (to get cells and listen)
  showToast, onResize, onEnvSwitched,
}) {
  let current = null;
  let globalEnvs = [];
  let packages = [];
  let loaded = false;
  let busy = false;
  let activeView = null;
  let outlineUpdateTimer = null;
  let cellChangeListeners = [];

  const VIEW_LABELS = {
    current: '📦 CURRENT ENVIRONMENT',
    create: '➕ CREATE ENVIRONMENT',
    pip: '📦 PIP MANAGER',
    outline: '📋 OUTLINE',
  };

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function setBusy(isBusy, label, targetStatusEl) {
    busy = isBusy;
    applyBtn.disabled = isBusy;
    createBtn.disabled = isBusy;
    installBtn.disabled = isBusy;
    if (label && targetStatusEl) targetStatusEl.textContent = label;
  }

  function syncSelectDisabled() {
    const mode = modeRadios.find((r) => r.checked)?.value;
    namedSelect.disabled = mode !== 'named';
  }

  function renderModeUI() {
    if (!current) return;
    modeRadios.forEach((r) => { r.checked = r.value === current.mode; });
    namedSelect.innerHTML = globalEnvs.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    if (current.mode === 'named') namedSelect.value = current.name;
    syncSelectDisabled();
    statusLine.textContent = `Active: ${current.label}`;
    if (statusLabelEl) statusLabelEl.textContent = `ENV: ${current.label.toUpperCase()}`;
  }

  function renderDetails() {
    if (!current) return;
    jupyVersionEl.textContent = current._jupyVersion ?? '—';
    pythonVersionEl.textContent = current.python_version ?? '—';
    pathEl.textContent = current.path ?? '—';
    platformEl.textContent = current._platform ?? '—';
    packageCountEl.textContent = current.package_count ?? '—';
  }

  function renderExistingEnvsList() {
    if (!existingEnvsEl) return;
    existingEnvsEl.textContent = globalEnvs.length ? globalEnvs.join(', ') : '—';
  }

  function renderPackages() {
    const query = searchInput.value.trim().toLowerCase();

    if (!packages.length) {
      listEl.innerHTML = `<div class="pip-manager-empty">${loaded ? 'No packages installed.' : 'Loading packages…'}</div>`;
      return;
    }

    const filtered = query ? packages.filter((p) => p.name.toLowerCase().includes(query)) : packages;
    if (!filtered.length) {
      listEl.innerHTML = `<div class="pip-manager-empty">No packages match “${escapeHtml(searchInput.value.trim())}”.</div>`;
      return;
    }

    listEl.innerHTML = '';
    filtered.forEach((pkg) => {
      const row = document.createElement('div');
      row.className = 'pip-package-row';
      row.innerHTML = `
        <span class="pip-package-name">${escapeHtml(pkg.name)}</span>
        <span class="pip-package-version">${escapeHtml(pkg.version)}</span>
        <button class="action-btn action-danger pip-remove-btn" title="Uninstall ${escapeHtml(pkg.name)}">✕</button>
      `;
      row.querySelector('.pip-remove-btn').addEventListener('click', () => uninstall(pkg.name));
      listEl.appendChild(row);
    });
  }

  // --- Outline ---

  function renderOutline() {
    if (!notebook) return;
    const cells = notebook.getCells();
    const items = [];
    // Improved regex: allows decorators (with optional arguments) and 'async'
    const definitionRegex = /^\s*(?:@\w+(?:\s*\([^)]*\))?\s+)*(?:async\s+)?(?:def|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[\(:]/;
    cells.forEach((cell, idx) => {
      const code = cell.cm.getValue();
      const lines = code.split('\n');
      lines.forEach((line, lineIdx) => {
        const match = line.match(definitionRegex);
        if (match) {
          const name = match[1];
          const kind = line.includes('class') ? 'class' : 'func';
          items.push({ name, kind, cellIdx: idx, line: lineIdx + 1, source: line.trim() });
        }
      });
    });

    if (!outlineListEl) return;
    if (items.length === 0) {
      outlineListEl.innerHTML = '<div class="pip-manager-empty">No functions or classes found.</div>';
      return;
    }

    outlineListEl.innerHTML = '';
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'outline-item';
      div.style.cursor = 'pointer';
      div.style.padding = '4px 6px';
      div.style.borderBottom = '1px solid var(--color-bg-well)';
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.gap = '8px';
      div.innerHTML = `
        <span style="font-weight:800;color:var(--color-primary);">${item.kind === 'class' ? '📦' : '🔧'}</span>
        <span style="font-family:var(--font-mono);font-size:0.8rem;">${escapeHtml(item.name)}</span>
        <span style="font-size:0.65rem;opacity:0.6;margin-left:auto;">cell ${item.cellIdx+1}, line ${item.line}</span>
      `;
      div.addEventListener('click', () => {
        notebook.selectCell(notebook.getCells()[item.cellIdx].id);
        notebook.enterEditMode(notebook.getCells()[item.cellIdx].id);
        const cm = notebook.getCells()[item.cellIdx].cm;
        cm.focus();
        cm.setCursor({ line: item.line - 1, ch: 0 });
        close();
      });
      outlineListEl.appendChild(div);
    });
  }

  function scheduleOutlineUpdate() {
    if (activeView === 'outline') {
      if (outlineUpdateTimer) clearTimeout(outlineUpdateTimer);
      outlineUpdateTimer = setTimeout(() => {
        renderOutline();
        outlineUpdateTimer = null;
      }, 300);
    }
  }

  function startOutlineListening() {
    if (!notebook) return;
    // Remove old listeners
    cellChangeListeners.forEach(unbind => unbind());
    cellChangeListeners = [];
    const cells = notebook.getCells();
    cells.forEach(cell => {
      const handler = () => scheduleOutlineUpdate();
      cell.cm.on('change', handler);
      cellChangeListeners.push(() => cell.cm.off('change', handler));
    });
    // Also listen for when cells are added/deleted/moved (patch methods)
    // We'll rely on the notebook's callbacks for that.
  }

  function stopOutlineListening() {
    cellChangeListeners.forEach(unbind => unbind());
    cellChangeListeners = [];
  }

  // We'll also need to listen to cell insertion/deletion via notebook's public methods.
  // For that, we can monkey-patch the notebook insert/delete methods in the controller
  // to call scheduleOutlineUpdate (already done in app.js).

  // --- API calls ---

  async function refreshEnvInfo() {
    try {
      const res = await fetch('/api/env/list');
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      current = data.current;
      current._jupyVersion = data.jupy_version;
      current._platform = data.platform;
      globalEnvs = data.global_envs || [];
      renderModeUI();
      renderDetails();
      renderExistingEnvsList();
    } catch (err) {
      console.error('Failed to load environment info:', err);
      statusLine.textContent = '⚠️ Failed to load environment info.';
    }
  }

  async function refreshPackages() {
    try {
      const res = await fetch('/api/pip/list');
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      packages = data.packages || [];
      loaded = true;
      renderPackages();
    } catch (err) {
      console.error('Failed to load package list:', err);
      loaded = true;
      listEl.innerHTML = '<div class="pip-manager-empty">⚠️ Failed to load package list.</div>';
    }
  }

  async function applyEnv() {
    if (busy) return;
    const mode = modeRadios.find((r) => r.checked)?.value || 'global';
    const name = mode === 'named' ? namedSelect.value : undefined;

    setBusy(true, '⏳ Switching environment (first use may take a moment)…', statusLine);
    try {
      const res = await fetch('/api/env/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, name }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`🔁 SWITCHED TO ${data.current.label.toUpperCase()}`, 'success');
        await refreshEnvInfo();
        loaded = false;
        await refreshPackages();
        onEnvSwitched?.();
      } else {
        showToast('⚠️ FAILED TO SWITCH ENVIRONMENT', 'danger');
        console.error(data.error);
      }
    } catch (err) {
      console.error('Environment switch failed:', err);
      showToast('⚠️ ENVIRONMENT SWITCH REQUEST FAILED', 'danger');
    } finally {
      setBusy(false, null, statusLine);
      renderModeUI();
    }
  }

  async function createEnv() {
    const name = createInput.value.trim();
    if (!name || busy) return;

    setBusy(true, `⏳ Creating "${name}"…`, createStatusLine);
    try {
      const res = await fetch('/api/env/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) {
        globalEnvs = data.global_envs || globalEnvs;
        namedSelect.innerHTML = globalEnvs.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
        namedSelect.value = name;
        renderExistingEnvsList();
        modeRadios.forEach((r) => { r.checked = r.value === 'named'; });
        syncSelectDisabled();
        createInput.value = '';
        showToast(`📦 CREATED ENVIRONMENT "${name.toUpperCase()}"`, 'success');
      } else {
        showToast('⚠️ FAILED TO CREATE ENVIRONMENT', 'danger');
        console.error(data.error);
      }
    } catch (err) {
      console.error('Create environment failed:', err);
      showToast('⚠️ CREATE REQUEST FAILED', 'danger');
    } finally {
      setBusy(false, current ? `Active: ${current.label}` : '', createStatusLine);
    }
  }

  async function install() {
    const spec = installInput.value.trim();
    if (!spec || busy) return;

    setBusy(true, `⏳ Installing ${spec}…`, pipStatusLine);
    try {
      const res = await fetch('/api/pip/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: spec }),
      });
      const data = await res.json();
      packages = data.packages || packages;
      loaded = true;
      renderPackages();

      if (data.success) {
        showToast(`📦 INSTALLED ${spec.toUpperCase()}`, 'success');
        installInput.value = '';
        await refreshEnvInfo();
      } else {
        showToast(`⚠️ FAILED TO INSTALL ${spec.toUpperCase()}`, 'danger');
        console.error('pip install failed:', data.output);
      }
    } catch (err) {
      console.error('Install request failed:', err);
      showToast('⚠️ INSTALL REQUEST FAILED', 'danger');
    } finally {
      setBusy(false, current ? `Active: ${current.label}` : '', pipStatusLine);
    }
  }

  async function uninstall(name) {
    if (busy) return;
    setBusy(true, `⏳ Removing ${name}…`, pipStatusLine);

    try {
      const res = await fetch('/api/pip/uninstall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      packages = data.packages || packages;
      loaded = true;
      renderPackages();

      if (data.success) {
        showToast(`🗑️ REMOVED ${name.toUpperCase()}`, 'warning');
        await refreshEnvInfo();
      } else {
        showToast(`⚠️ FAILED TO REMOVE ${name.toUpperCase()}`, 'danger');
        console.error('pip uninstall failed:', data.output);
      }
    } catch (err) {
      console.error('Uninstall request failed:', err);
      showToast('⚠️ REMOVE REQUEST FAILED', 'danger');
    } finally {
      setBusy(false, current ? `Active: ${current.label}` : '', pipStatusLine);
    }
  }

  // --- View management ---

  function showView(view) {
    Object.entries(views).forEach(([key, el]) => {
      if (el) el.hidden = key !== view;
    });
    activeView = view;
    if (titleEl) titleEl.textContent = VIEW_LABELS[view] || '📦 ENVIRONMENT';
    if (view === 'outline' && notebook) {
      renderOutline();
      startOutlineListening();
      window.__outlineVisible = true;
    } else {
      stopOutlineListening();
      window.__outlineVisible = false;
    }
  }

  function openView(view) {
    if (!views[view]) return;

    if (!panel.hidden && activeView === view) {
      close();
      return;
    }

    showView(view);
    panel.hidden = false;
    refreshEnvInfo();
    if (view === 'pip' && !loaded) refreshPackages();
    if (onResize) onResize();

    if (view === 'pip') setTimeout(() => searchInput.focus(), 50);
    else if (view === 'create') setTimeout(() => createInput.focus(), 50);
  }

  function close() {
    panel.hidden = true;
    activeView = null;
    stopOutlineListening();
    window.__outlineVisible = false;
    if (onResize) onResize();
  }

  closeBtn.addEventListener('click', close);
  searchInput.addEventListener('input', renderPackages);
  installBtn.addEventListener('click', install);
  installInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); install(); }
  });
  applyBtn.addEventListener('click', applyEnv);
  createBtn.addEventListener('click', createEnv);
  createInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); createEnv(); }
  });
  modeRadios.forEach((r) => r.addEventListener('change', syncSelectDisabled));

  // Expose scheduleOutlineUpdate so notebook can call it on cell add/delete/move
  return { openView, close, refreshStatus: refreshEnvInfo, scheduleOutlineUpdate };
}

---

# File: static\js\env\envTopbarMenu.js

/**
 * env/envTopbarMenu.js
 * "ENVIRONMENT" topbar dropdown. Items:
 *   - Current Environment
 *   - Create Environment
 *   - Pip Manager
 *   - Outline
 */
import { createDropdown } from '../core/dropdownMenu.js';

export function initEnvTopbarMenu({ menu, trigger, dropdown, envManager }) {
  const { bind } = createDropdown({ menu, trigger, dropdown });

  bind('envmenu-current', () => envManager.openView('current'));
  bind('envmenu-create', () => envManager.openView('create'));
  bind('envmenu-pip', () => envManager.openView('pip'));
  bind('envmenu-outline', () => envManager.openView('outline'));
}

---

# File: static\js\findReplace\findReplace.js

export function initFindBar() { console.warn('Find/Replace not fully implemented'); }

---

# File: static\js\metrics\metrics.js

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


---

# File: static\js\notebook\clipboard.js

/**
 * notebook/clipboard.js
 * Cut, copy, paste cells.
 */
export function createClipboard(state, operations, selection) {
  let clipboardData = null;

  function copyCells() {
    const indices = state.getSelectedIndices();
    if (indices.length === 0) return;
    const data = indices.map(i => ({
      content: state.cells[i].cm.getValue(),
      type: state.cells[i].type,
    }));
    clipboardData = data;
    navigator.clipboard.writeText(JSON.stringify(data)).catch(() => {});
  }

  function cutCells() {
    copyCells();
    const indices = state.getSelectedIndices().sort((a, b) => b - a);
    for (const i of indices) {
      operations.deleteCell(state.cells[i].id, true);
    }
    selection.deselectAll();
  }

  function pasteCells() {
    if (!clipboardData) {
      navigator.clipboard.readText().then(text => {
        try {
          const data = JSON.parse(text);
          if (Array.isArray(data)) {
            clipboardData = data;
            doPaste();
          }
        } catch (e) {}
      }).catch(() => {});
      return;
    }
    doPaste();
  }

  function doPaste() {
    if (!clipboardData) return;
    const idx = state.selectedId ? state.indexOf(state.selectedId) + 1 : state.cells.length;
    let insertIdx = idx;
    clipboardData.forEach((item, i) => {
      operations.insertCellAt(insertIdx + i, item.content, { type: item.type || 'code' });
    });
    clipboardData = null;
    selection.deselectAll();
  }

  return { copyCells, cutCells, pasteCells };
}


---

# File: static\js\notebook\controller.js

/**
 * notebook/controller.js
 * Main notebook controller – combines all sub-modules and exposes public API.
 */
import { createState } from './state.js';
import { createOperations } from './operations.js';
import { createSelection } from './selection.js';
import { createExecution } from './execution.js';
import { createClipboard } from './clipboard.js';
import { createUndoRedo } from './undoRedo.js';
import { createDnD } from './dnd.js';
import { createFindReplace } from './findReplace.js';
import { createStatus } from './status.js';
import { createPresentation } from './presentation.js';
import { createLineNumbers } from './lineNumbers.js';
import { createCell } from '../cells/cellFactory.js';

export function createNotebookController({
  container,
  templates,
  runSocket,
  showToast,
  registerAutocomplete,
  onCellChange,
}) {
  // ===== State =====
  const state = createState();

  // ===== Helper to update selection UI =====
  function updateSelectionUI() {
    const count = state.selectedIds.length;
    const selInfo = document.getElementById('selection-info');
    if (selInfo) selInfo.textContent = count > 0 ? `${count} selected` : '';
  }

  // ===== Reorder DOM =====
  function reorderDom() {
    state.cells.forEach(c => {
      container.appendChild(c.dom.root);
      container.appendChild(c.dom.insertBar);
    });
  }

  // ===== Selection (created first, uses updateSelectionUI) =====
  const selection = createSelection(state, updateSelectionUI);

  // ===== Build cell (needs selection and execution) =====
  function buildCell(source, type = 'code') {
    const id = 'cell-' + (++state.idCounter);
    return createCell(
      id,
      source,
      templates,
      {
        onRun: (cellId, opts) => execution.runCell(cellId, opts),
        onRunButtonClick: (cellId) => {
          if (state.runningCellId === cellId) {
            runSocket.send({ action: 'interrupt' });
          } else {
            execution.runCell(cellId, { advance: false });
          }
        },
        onMove: (cellId, delta) => operations.moveCell(cellId, delta),
        onDelete: (cellId) => operations.deleteCell(cellId),
        onSelect: (cellId) => selection.selectCell(cellId),
        onEnterEdit: (cellId) => selection.enterEditMode(cellId),
        onExitEdit: (cellId) => selection.exitEditMode(cellId),
        onInsertAfter: (cellId) => operations.insertCellAt(state.indexOf(cellId) + 1, '', { focus: true }),
        onCellChange: (cellId) => { if (onCellChange) onCellChange(); },
        onDragStart: (cellId, e) => { e.dataTransfer.setData('text/plain', cellId); },
        onDragEnd: () => {},
      },
      registerAutocomplete
    );
  }

  // ===== Operations (needs selection.selectCell) =====
  const operations = createOperations(state, buildCell, reorderDom, selection.selectCell, showToast, runSocket);

  // ===== Status (must be defined before execution) =====
  const status = createStatus(state);
  function setStatus(newStatus) {
    status.setStatus(newStatus);
  }

  // ===== Execution (needs operations, selection, and setStatus) =====
  const execution = createExecution(state, runSocket, showToast, setStatus, operations, selection);

  // ===== Clipboard (needs operations and selection) =====
  const clipboard = createClipboard(state, operations, selection);

  // ===== Undo/Redo (needs operations and selection) =====
  const undoRedo = createUndoRedo(state, operations, selection);

  // ===== Other modules =====
  const dnd = createDnD(container, state, operations, selection);
  const findReplace = createFindReplace(state);
  const presentation = createPresentation();
  const lineNumbers = createLineNumbers(state);

  // ===== Public API =====
  return {
    insertCellAt: operations.insertCellAt,
    deleteCell: operations.deleteCell,
    moveCell: operations.moveCell,
    selectCell: selection.selectCell,
    enterEditMode: (id) => { selection.enterEditMode(id); state.getCell(id).cm.focus(); },
    exitEditMode: selection.exitEditMode,
    selectAdjacent: selection.selectAdjacent,
    runCell: execution.runCell,
    handleRunMessage: execution.handleRunMessage,
    runAll: execution.runAll,
    restartKernel: () => { /* implemented in app.js */ },
    restartAndRunAll: () => { /* implemented in app.js */ },
    restartAndRunToSelected: () => { /* implemented in app.js */ },
    interruptKernel: () => { /* implemented in app.js */ },
    loadNotebook: (sources) => { /* implemented in app.js */ },
    refreshAllEditors: () => state.cells.forEach(c => c.cm.refresh()),
    getSelectedId: () => state.selectedId,
    getEditingId: () => state.editingId,
    getCells: () => state.cells,
    getSelectedIds: () => state.selectedIds,
    getSelectedIndices: state.getSelectedIndices,
    deselectAll: selection.deselectAll,
    copyCells: clipboard.copyCells,
    cutCells: clipboard.cutCells,
    pasteCells: clipboard.pasteCells,
    undo: undoRedo.undo,
    redo: undoRedo.redo,
    mergeSelectedCells: operations.mergeSelectedCells,
    splitCellAtCursor: operations.splitCellAtCursor,
    findInNotebook: findReplace.findInNotebook,
    replaceInNotebook: findReplace.replaceInNotebook,
    toggleLineNumbers: lineNumbers.toggle,
    togglePresentation: presentation.toggle,
    setStatus,
  };
}

---

# File: static\js\notebook\dnd.js

/**
 * notebook/dnd.js
 * Drag and drop reordering.
 */
export function createDnD(container, state, operations, selection) {
  function handleDragOver(e) { e.preventDefault(); }
  function handleDrop(e) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const cellEl = target.closest('.cell');
    if (!cellEl) return;
    const targetId = cellEl.dataset.cellId;
    if (!targetId || draggedId === targetId) return;
    const fromIdx = state.indexOf(draggedId);
    const toIdx = state.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [cell] = state.cells.splice(fromIdx, 1);
    state.cells.splice(toIdx, 0, cell);
    // reorder DOM
    // We need to reorder the DOM manually or call a function
    // Since we don't have reorderDom here, we'll do it manually:
    container.innerHTML = '';
    state.cells.forEach(c => {
      container.appendChild(c.dom.root);
      container.appendChild(c.dom.insertBar);
    });
    selection.selectCell(cell.id);
  }
  container.addEventListener('dragover', handleDragOver);
  container.addEventListener('drop', handleDrop);
  return { handleDragOver, handleDrop };
}


---

# File: static\js\notebook\execution.js

/**
 * notebook/execution.js
 * Cell execution, queue, message handling, status.
 */
// import { clearCellOutput, appendCellOutput, appendCellPlot, appendCellStdinPrompt } from '../cells/cellOutput.js';
import { 
  clearCellOutput, 
  appendCellOutput, 
  appendCellPlot, 
  appendCellStdinPrompt,
  appendDisplayData,
  appendWidget
} from '../cells/cellOutput.js';
export function createExecution(state, runSocket, showToast, setStatus, operations, selection) {
  const { cells, indexOf, getCell, runningCellId, executionQueue } = state;

  function executeNextInQueue(id) {
    const cell = getCell(id);
    if (!cell) return;
    state.runningCellId = id;
    cell.dom.root.classList.remove('queued');
    cell.dom.root.classList.add('running');
    cell.dom.runBtn.textContent = '⏹';
    cell.dom.runBtn.title = 'Interrupt Execution';
    cell.dom.execCountEl.textContent = '[*]';
    clearCellOutput(cell);
    runSocket.send({ action: 'run', code: cell.cm.getValue() });
  }

  function advanceSelectionAfter(idx) {
    if (idx === cells.length - 1) {
      operations.insertCellAt(idx + 1, '', { focus: true });
    } else {
      document.activeElement?.blur();
      const next = cells[idx + 1];
      selection.enterEditMode(next.id);
      next.cm.focus();
      next.dom.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    if (state.runningCellId === id) {
      showToast('⚠️ CELL ALREADY RUNNING', 'warning');
      if (advance) advanceSelectionAfter(idx);
      return;
    }
    if (state.runningCellId !== null) {
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
      if (advance) advanceSelectionAfter(idx);
      return;
    }
    executeNextInQueue(id);
    if (insertBelow) {
      operations.insertCellAt(idx + 1, '', { focus: true });
    } else if (advance) {
      advanceSelectionAfter(idx);
    } else {
      selection.selectCell(id);
    }
  }

  function handleRunMessage(data) {
    if (!state.runningCellId) return;
    const cell = getCell(state.runningCellId);
    if (!cell) return;
    if (data.type === 'stdout') appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stdout');
    if (data.type === 'stderr') appendCellOutput(cell, data.text.replace(/\n$/, ''), 'stderr');
    if (data.type === 'plot') appendCellPlot(cell, data.html);
    if (data.type === 'display') {
      appendDisplayData(cell, data.data);
    }
    if (data.type === 'widget') {
      appendWidget(cell, data.data);
    }
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
      state.runningCellId = null;
      setStatus('idle');
      if (executionQueue.length > 0) {
        const nextId = executionQueue.shift();
        executeNextInQueue(nextId);
      }
    }
  }

  function runAll() {
    [...cells].forEach((cell) => runCell(cell.id, { advance: false }));
  }

  return {
    runCell,
    handleRunMessage,
    runAll,
    executeNextInQueue,
    advanceSelectionAfter,
  };
}


---

# File: static\js\notebook\findReplace.js

/**
 * notebook/findReplace.js
 * Find and replace across all cells.
 */
export function createFindReplace(state) {
  function findInNotebook(search, caseSensitive = false) {
    const results = [];
    state.cells.forEach((cell, idx) => {
      const content = cell.cm.getValue();
      const regex = new RegExp(search, caseSensitive ? 'g' : 'gi');
      let match;
      while ((match = regex.exec(content)) !== null) {
        results.push({ cellIdx: idx, line: match.index, text: match[0] });
      }
    });
    return results;
  }

  function replaceInNotebook(search, replace, caseSensitive = false) {
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(search, flags);
    let total = 0;
    state.cells.forEach(cell => {
      const content = cell.cm.getValue();
      const newContent = content.replace(regex, replace);
      if (newContent !== content) {
        cell.cm.setValue(newContent);
        total++;
      }
    });
    return total;
  }

  return { findInNotebook, replaceInNotebook };
}


---

# File: static\js\notebook\lineNumbers.js

/**
 * notebook/lineNumbers.js
 * Toggle line numbers in all cell editors.
 */
export function createLineNumbers(state) {
  let enabled = false;

  function toggle() {
    enabled = !enabled;
    state.cells.forEach(c => c.cm.setOption('lineNumbers', enabled));
  }

  return { toggle, isEnabled: () => enabled };
}


---

# File: static\js\notebook\notebookFile.js

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


---

# File: static\js\notebook\operations.js

/**
 * notebook/operations.js
 * Cell insertion, deletion, movement, merge, split.
 */
import { clearCellOutput } from '../cells/cellOutput.js';

export function createOperations(state, buildCell, reorderDom, selectCell, showToast, runSocket) {
  const { cells, indexOf, getCell, getSelectedIndices, pushOperation, executionQueue, runningCellId } = state;

  function insertCellAt(index, source = '', { focus = false, type = 'code' } = {}) {
    const cell = buildCell(source, type);
    cells.splice(index, 0, cell);
    reorderDom();
    cell.cm.refresh();
    if (focus) {
      // We need enterEditMode – we'll call it from selection module via callback
      // but here we just select and focus
      selectCell(cell.id);
      cell.cm.focus();
    } else {
      selectCell(cell.id);
    }
    cell.dom.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    pushOperation({ type: 'insert', data: { index, cellId: cell.id, source, type } });
    return cell;
  }

  function deleteCell(id, silent = false) {
    if (id === runningCellId) {
      if (runSocket.isOpen) runSocket.send({ action: 'interrupt' });
      runningCellId = null;
      if (!silent) showToast('⚠️ RUNNING CELL DELETED & TERMINATED', 'danger');
    }
    const qIdx = executionQueue.indexOf(id);
    if (qIdx !== -1) executionQueue.splice(qIdx, 1);

    const idx = indexOf(id);
    if (idx === -1) return;
    const cell = cells[idx];
    const source = cell.cm.getValue();
    const type = cell.type;
    cell.dom.root.remove();
    cell.dom.insertBar.remove();
    cells.splice(idx, 1);
    state.selectedIds = state.selectedIds.filter(cid => cid !== id);
    if (cells.length === 0) {
      insertCellAt(0, '', { focus: true });
    } else {
      const newIdx = Math.min(idx, cells.length - 1);
      selectCell(cells[newIdx].id);
    }
    if (!silent) pushOperation({ type: 'delete', data: { index: idx, cellId: id, source, type } });
  }

  function moveCell(id, delta) {
    const idx = indexOf(id);
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= cells.length) return;
    const [cell] = cells.splice(idx, 1);
    cells.splice(newIdx, 0, cell);
    reorderDom();
    selectCell(id);
    pushOperation({ type: 'move', data: { id, from: idx, to: newIdx } });
  }

  function mergeSelectedCells() {
    const indices = getSelectedIndices().sort((a, b) => a - b);
    if (indices.length < 2) return;
    const firstIdx = indices[0];
    let mergedContent = '';
    const removedIds = [];
    for (let i = indices.length - 1; i > 0; i--) {
      const idx = indices[i];
      const cell = cells[idx];
      mergedContent = cell.cm.getValue() + '\n' + mergedContent;
      removedIds.push(cell.id);
      deleteCell(cell.id, true);
    }
    const firstCell = cells[firstIdx];
    const existing = firstCell.cm.getValue();
    firstCell.cm.setValue(existing + (existing ? '\n' : '') + mergedContent);
    selectCell(firstCell.id);
    pushOperation({
      type: 'merge',
      data: { first: firstCell.id, removed: removedIds, before: existing, after: firstCell.cm.getValue() }
    });
  }

  function splitCellAtCursor(id) {
    const cell = getCell(id);
    if (!cell) return;
    const cm = cell.cm;
    const cursor = cm.getCursor();
    const line = cursor.line;
    const content = cm.getValue();
    const lines = content.split('\n');
    const before = lines.slice(0, line).join('\n');
    const after = lines.slice(line).join('\n');
    cm.setValue(before);
    const newCell = insertCellAt(indexOf(id) + 1, after, { focus: true });
    pushOperation({ type: 'split', data: { id, before, after, newId: newCell.id } });
  }

  return {
    insertCellAt,
    deleteCell,
    moveCell,
    mergeSelectedCells,
    splitCellAtCursor,
  };
}


---

# File: static\js\notebook\presentation.js

/**
 * notebook/presentation.js
 * Presentation mode toggle.
 */
export function createPresentation() {
  let presentationMode = false;

  function toggle() {
    presentationMode = !presentationMode;
    document.body.classList.toggle('presentation-mode', presentationMode);
    const topbar = document.querySelector('.topbar');
    const systemBar = document.querySelector('.system-bar-wrapper');
    const envPanel = document.getElementById('env-manager-panel');
    const terminalPanel = document.getElementById('terminal-panel');
    if (topbar) topbar.style.display = presentationMode ? 'none' : '';
    if (systemBar) systemBar.style.display = presentationMode ? 'none' : '';
    if (envPanel) envPanel.style.display = presentationMode ? 'none' : '';
    if (terminalPanel) terminalPanel.style.display = presentationMode ? 'none' : '';
    const notebookPanel = document.querySelector('.notebook-panel');
    if (notebookPanel) {
      notebookPanel.style.transform = presentationMode ? 'scale(0.8)' : '';
      notebookPanel.style.transformOrigin = 'top left';
    }
  }

  return { toggle, isActive: () => presentationMode };
}


---

# File: static\js\notebook\selection.js

/**
 * notebook/selection.js
 * Selection logic (single, range, multi).
 */
export function createSelection(state, updateSelectionUI) {
  const { cells, selectedId, editingId, selectedIds, lastSelectedId } = state;

  function selectCell(id, additive = false, range = false) {
    if (!additive) {
      selectedIds.length = 0;
      cells.forEach(c => c.dom.root.classList.remove('selected'));
    }
    if (!id) return;
    const idx = state.indexOf(id);
    if (idx === -1) return;
    if (range && lastSelectedId) {
      const lastIdx = state.indexOf(lastSelectedId);
      const start = Math.min(idx, lastIdx);
      const end = Math.max(idx, lastIdx);
      if (!additive) {
        selectedIds.length = 0;
        cells.forEach(c => c.dom.root.classList.remove('selected'));
      }
      for (let i = start; i <= end; i++) {
        const cid = cells[i].id;
        if (!selectedIds.includes(cid)) {
          selectedIds.push(cid);
          cells[i].dom.root.classList.add('selected');
        }
      }
    } else {
      if (!selectedIds.includes(id)) {
        selectedIds.push(id);
        const cell = state.getCell(id);
        if (cell) cell.dom.root.classList.add('selected');
      }
    }
    state.lastSelectedId = id;
    state.selectedId = id;
    state.editingId = null;
    if (updateSelectionUI) updateSelectionUI();
  }

  function deselectAll() {
    selectedIds.length = 0;
    cells.forEach(c => c.dom.root.classList.remove('selected'));
    state.lastSelectedId = null;
    if (updateSelectionUI) updateSelectionUI();
  }

  function selectAdjacent(delta) {
    if (!state.selectedId) return;
    const idx = state.indexOf(state.selectedId);
    const newIdx = Math.min(cells.length - 1, Math.max(0, idx + delta));
    selectCell(cells[newIdx].id, false, false);
  }

  function enterEditMode(id) {
    state.selectedId = id;
    state.editingId = id;
    cells.forEach((c) => {
      c.dom.root.classList.toggle('editing', c.id === id);
      c.dom.root.classList.toggle('selected', c.id === id);
    });
  }

  function exitEditMode(id) {
    const cell = state.getCell(id);
    cell?.cm.getInputField().blur();
    selectCell(id);
  }

  return {
    selectCell,
    deselectAll,
    selectAdjacent,
    enterEditMode,
    exitEditMode,
  };
}


---

# File: static\js\notebook\state.js

/**
 * notebook/state.js
 * Core state: cells, counters, selection, undo/redo stacks.
 */
import { clearCellOutput } from '../cells/cellOutput.js';

export function createState() {
  const cells = [];
  let idCounter = 0;
  let selectedId = null;
  let editingId = null;
  let runningCellId = null;
  const executionQueue = [];
  let selectedIds = [];
  let lastSelectedId = null;
  const undoStack = [];
  const redoStack = [];
  const MAX_UNDO = 100;

  function indexOf(id) {
    return cells.findIndex(c => c.id === id);
  }

  function getCell(id) {
    return cells.find(c => c.id === id);
  }

  function getSelectedIndices() {
    return selectedIds.map(id => indexOf(id)).filter(i => i !== -1).sort((a, b) => a - b);
  }

  function pushOperation(op) {
    undoStack.push(op);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
  }

  return {
    cells,
    idCounter,
    selectedId,
    editingId,
    runningCellId,
    executionQueue,
    selectedIds,
    lastSelectedId,
    undoStack,
    redoStack,
    MAX_UNDO,
    indexOf,
    getCell,
    getSelectedIndices,
    pushOperation,
  };
}


---

# File: static\js\notebook\status.js

/**
 * notebook/status.js
 * Kernel status and last execution time.
 */
export function createStatus(state) {
  let status = 'idle';
  let lastExecTime = null;

  function setStatus(newStatus) {
    status = newStatus;
    const indicator = document.querySelector('.status-indicator');
    const label = document.getElementById('status-label');
    if (indicator) {
      indicator.style.backgroundColor = newStatus === 'busy' ? '#DC2626' : (newStatus === 'queued' ? '#D97706' : '#16A34A');
    }
    if (label) {
      label.textContent = newStatus.toUpperCase();
    }
    if (newStatus === 'idle') {
      lastExecTime = new Date();
      const timeEl = document.getElementById('last-exec-time');
      if (timeEl) timeEl.textContent = lastExecTime.toLocaleTimeString();
    }
  }

  return { setStatus, getStatus: () => status, getLastExecTime: () => lastExecTime };
}


---

# File: static\js\notebook\undoRedo.js

/**
 * notebook/undoRedo.js
 * Undo/Redo for cell operations.
 */
export function createUndoRedo(state, operations, selection) {
  const { undoStack, redoStack, pushOperation } = state;

  function applyReverse(op) {
    switch (op.type) {
      case 'insert':
        operations.deleteCell(op.data.cellId, true);
        break;
      case 'delete':
        // re-insert
        operations.insertCellAt(op.data.index, op.data.source, { type: op.data.type });
        break;
      case 'move':
        const c = state.getCell(op.data.id);
        if (c) {
          const idx = state.indexOf(op.data.id);
          const [moved] = state.cells.splice(idx, 1);
          state.cells.splice(op.data.from, 0, moved);
          // reorderDOM is called inside operations.moveCell, but we need to reorder here
          // We'll call it manually via a callback? We'll just call selection.selectCell to refresh.
          selection.selectCell(op.data.id);
        }
        break;
      case 'merge':
        // restore removed cells
        // complex – skip for now
        break;
      case 'split':
        const splitCell = state.getCell(op.data.newId);
        if (splitCell) {
          const before = op.data.before;
          const after = splitCell.cm.getValue();
          const merged = before + '\n' + after;
          const origCell = state.getCell(op.data.id);
          if (origCell) {
            origCell.cm.setValue(merged);
            operations.deleteCell(op.data.newId, true);
          }
        }
        break;
    }
  }

  function applyForward(op) {
    switch (op.type) {
      case 'insert':
        // redo insert: insert again at same index
        operations.insertCellAt(op.data.index, op.data.source, { type: op.data.type });
        break;
      case 'delete':
        // redo delete: delete the cell again (it should be at the index)
        const cell = state.cells[op.data.index];
        if (cell) operations.deleteCell(cell.id, true);
        break;
      case 'move':
        // redo move: move again
        const c = state.getCell(op.data.id);
        if (c) {
          const idx = state.indexOf(op.data.id);
          const [moved] = state.cells.splice(idx, 1);
          state.cells.splice(op.data.to, 0, moved);
          selection.selectCell(op.data.id);
        }
        break;
      case 'merge':
        // re-merge
        // not implemented
        break;
      case 'split':
        // re-split
        const orig = state.getCell(op.data.id);
        if (orig) {
          // restore original content, then split again
          // We'll need to use splitCellAtCursor again, but with stored data.
        }
        break;
    }
  }

  function undo() {
    if (undoStack.length === 0) return;
    const op = undoStack.pop();
    redoStack.push(op);
    applyReverse(op);
  }

  function redo() {
    if (redoStack.length === 0) return;
    const op = redoStack.pop();
    undoStack.push(op);
    applyForward(op);
  }

  return { undo, redo };
}


---

# File: static\js\notebookFile\notebookFile.js

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


---

# File: static\js\output\richOutput.js

/**
 * output/richOutput.js
 * Handles rich MIME types: HTML, JavaScript, images (PNG/JPEG/GIF),
 * Plotly, Bokeh, Vega‑Lite, JSON, Markdown.
 */
import { renderMarkdown } from '../cells/markdownRenderer.js';  // optional

/**
 * Renders a MIME bundle inside a container element.
 * @param {HTMLElement} container - The DOM element to render into.
 * @param {Object} mimeData - Dictionary with MIME types as keys.
 * @param {Object} options - Additional options (e.g., for Plotly layout).
 * @returns {boolean} True if any MIME type was rendered.
 */
export function renderRichOutput(container, mimeData, options = {}) {
  // Priority order: HTML, JavaScript, Plotly, Bokeh, Vega‑Lite, SVG, PNG/JPEG/GIF, JSON, Markdown, Plain text.
  let rendered = false;

  // 1. HTML – sanitize and insert
  if (mimeData['text/html']) {
    let html = mimeData['text/html'];
    if (window.DOMPurify) {
      html = window.DOMPurify.sanitize(html, { SAFE_FOR_JQUERY: true });
    }
    container.innerHTML = html;
    // Execute any embedded scripts? We'll handle application/javascript separately.
    // For safety, we don't execute scripts in HTML by default.
    rendered = true;
  }

  // 2. JavaScript – execute in a sandboxed iframe
  if (mimeData['application/javascript']) {
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.border = 'none';
    iframe.style.background = 'transparent';
    iframe.sandbox = 'allow-scripts allow-same-origin';
    container.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<script>${mimeData['application/javascript']}<\/script>`);
    doc.close();
    rendered = true;
  }

  // 3. Plotly – application/vnd.plotly.v1+json
  if (mimeData['application/vnd.plotly.v1+json']) {
    const plotlyData = mimeData['application/vnd.plotly.v1+json'];
    const div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '500px';
    container.appendChild(div);
    if (window.Plotly) {
      const layout = plotlyData.layout || {};
      const config = plotlyData.config || { responsive: true };
      window.Plotly.newPlot(div, plotlyData.data, layout, config);
    } else {
      div.textContent = 'Plotly library not loaded. Please load Plotly.';
    }
    rendered = true;
  }

  // 4. Bokeh – application/vnd.bokehjs_exec.v0+json
  if (mimeData['application/vnd.bokehjs_exec.v0+json']) {
    const bokehData = mimeData['application/vnd.bokehjs_exec.v0+json'];
    const div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '500px';
    container.appendChild(div);
    if (window.Bokeh) {
      // Bokeh expects to be embedded with a script tag; we'll handle it differently.
      // For simplicity, we'll just display a placeholder.
      div.textContent = 'Bokeh support: please embed the Bokeh script.';
    } else {
      div.textContent = 'Bokeh library not loaded.';
    }
    rendered = true;
  }

  // 5. Vega‑Lite – application/vnd.vegalite.v2+json
  if (mimeData['application/vnd.vegalite.v2+json']) {
    const vegaData = mimeData['application/vnd.vegalite.v2+json'];
    const div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '400px';
    container.appendChild(div);
    if (window.vegaEmbed) {
      window.vegaEmbed(div, vegaData, { actions: false });
    } else {
      div.textContent = 'Vega‑Lite library not loaded. Please load vega‑embed.';
    }
    rendered = true;
  }

  // 6. Images – image/png, image/jpeg, image/gif
  const imageTypes = ['image/png', 'image/jpeg', 'image/gif'];
  for (const type of imageTypes) {
    if (mimeData[type]) {
      const img = document.createElement('img');
      let src = mimeData[type];
      // If it's a base64 data URI, use directly; otherwise, treat as URL.
      if (!src.startsWith('data:')) {
        src = `data:${type};base64,${src}`;
      }
      img.src = src;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      container.appendChild(img);
      rendered = true;
      break; // only render the first image type found
    }
  }

  // 7. JSON – application/json (pretty printed)
  if (mimeData['application/json']) {
    const jsonData = mimeData['application/json'];
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(jsonData, null, 2);
    pre.style.background = 'var(--color-bg-well)';
    pre.style.padding = '8px';
    pre.style.borderRadius = '4px';
    pre.style.overflow = 'auto';
    container.appendChild(pre);
    rendered = true;
  }

  // 8. Markdown – text/markdown
  if (mimeData['text/markdown']) {
    const md = mimeData['text/markdown'];
    let html;
    if (window.marked) {
      html = window.marked.parse(md);
    } else {
      html = `<pre>${md}</pre>`;
    }
    const div = document.createElement('div');
    div.className = 'markdown-preview';
    div.innerHTML = html;
    container.appendChild(div);
    if (window.MathJax) {
      MathJax.typesetPromise([div]).catch(() => {});
    }
    rendered = true;
  }

  // 9. Plain text fallback
  if (!rendered && mimeData['text/plain']) {
    const pre = document.createElement('pre');
    pre.textContent = mimeData['text/plain'];
    container.appendChild(pre);
    rendered = true;
  }

  return rendered;
}


---

# File: static\js\runtime\aboutDialog.js

/**
 * runtime/aboutDialog.js
 * "About Jupyvenv" modal — fetches GET /api/about (server/handlers.py) and
 * fills in the Jupy version, .jupy_env Python version, venv path,
 * platform, and installed package count.
 */
export function setupAboutDialog({ overlay, closeBtn }) {
  const fields = {
    jupyVersion: document.getElementById('about-jupy-version'),
    pythonVersion: document.getElementById('about-python-version'),
    venvDir: document.getElementById('about-venv-dir'),
    platform: document.getElementById('about-platform'),
    packageCount: document.getElementById('about-package-count'),
  };

  function setAll(text) {
    Object.values(fields).forEach((el) => {
      if (el) el.textContent = text;
    });
  }

  async function open() {
    overlay.hidden = false;
    setAll('…');
    try {
      const res = await fetch('/api/about');
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      if (fields.jupyVersion) fields.jupyVersion.textContent = data.jupy_version ?? '—';
      if (fields.pythonVersion) fields.pythonVersion.textContent = data.python_version ?? '—';
      if (fields.venvDir) fields.venvDir.textContent = data.venv_dir ?? '—';
      if (fields.platform) fields.platform.textContent = data.platform ?? '—';
      if (fields.packageCount) fields.packageCount.textContent = data.package_count ?? '—';
    } catch (err) {
      console.error('Failed to load /api/about:', err);
      setAll('⚠️ error');
    }
  }

  function close() {
    overlay.hidden = true;
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  return { open, close };
}


---

# File: static\js\runtime\pyodideRuntime.js

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


---

# File: static\js\runtime\runtimeMenu.js

/**
 * runtime/runtimeMenu.js
 * Jupyter-style "RUNTIME" dropdown menu. Hover/click/outside-click/Escape
 * behavior lives in the shared core/dropdownMenu.js controller — this module
 * just wires the RUNTIME-specific menu items to notebook actions.
 *
 * NOTE: "Environment" used to live at the bottom of this menu. It's now its
 * own top-level "ENVIRONMENT" dropdown next to RUNTIME — see
 * env/envTopbarMenu.js — so this menu only ever deals with kernel lifecycle.
 */
import { createDropdown } from '../core/dropdownMenu.js';

export function initRuntimeMenu({ menu, trigger, dropdown, notebook }) {
  const { bind } = createDropdown({ menu, trigger, dropdown });

  bind('runtime-restart', () => notebook.restartKernel());
  bind('runtime-restart-run-all', () => notebook.restartAndRunAll());
  bind('runtime-restart-run-selected', () => notebook.restartAndRunToSelected());
}

---

# File: static\js\shortcuts\shortcuts.js

/**
 * shortcuts/shortcuts.js
 * Global command-mode keyboard shortcuts with new features.
 */
import { DOUBLE_TAP_WINDOW_MS } from '../config/constants.js';

let lastDeletedCellSource = '';
let findBarVisible = false;

export function initShortcuts(actions) {
  // Inject Help Dialog DOM if not present
  injectDialogDOM();

  let lastDPress = 0;
  let lastIPress = 0;
  let lastZeroPress = 0;

  document.addEventListener('keydown', (e) => {
    // Ignore if inside CodeMirror (handled by editor)
    if (e.target.closest && e.target.closest('.CodeMirror')) {
      // However, some shortcuts like Ctrl+F should still work globally
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleFindBar();
        return;
      }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        // Undo cell operation
        if (!e.shiftKey) {
          e.preventDefault();
          actions.undo();
          return;
        }
      }
      if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        actions.redo();
        return;
      }
      return;
    }

    const isEditing = actions.getEditingId() !== null;
    const activeEl = document.activeElement;

    // Ignore input fields
    if (
      activeEl.tagName === 'INPUT' ||
      (activeEl.tagName === 'TEXTAREA' && activeEl.id !== 'terminal-hidden-input')
    ) {
      return;
    }

    // Help dialog: Ctrl+Shift+? or +/
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '?' || e.key === '/')) {
      e.preventDefault();
      toggleHelpDialog();
      return;
    }

    // Find bar: Ctrl+F
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      toggleFindBar();
      return;
    }

    // Merge selected: Ctrl+Shift+M
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'm') {
      e.preventDefault();
      actions.mergeSelectedCells();
      return;
    }

    // Split cell: Ctrl+Shift+- (hyphen)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '-') {
      e.preventDefault();
      const id = actions.getSelectedId();
      if (id) actions.splitCellAtCursor(id);
      return;
    }

    // Copy: Ctrl+C
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      actions.copyCells();
      return;
    }

    // Cut: Ctrl+X
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
      e.preventDefault();
      actions.cutCells();
      return;
    }

    // Paste: Ctrl+V
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      actions.pasteCells();
      return;
    }

    // Undo cell op: Ctrl+Z (already handled inside CodeMirror, but global as well)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      actions.undo();
      return;
    }

    // Redo: Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      actions.redo();
      return;
    }

    // Toggle line numbers: Ctrl+Shift+L
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'l') {
      e.preventDefault();
      actions.toggleLineNumbers();
      return;
    }

    // Presentation mode: Ctrl+Shift+P
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'p') {
      e.preventDefault();
      actions.togglePresentation();
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

    // Run cells
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

    // Enter edit mode
    if (e.key === 'Enter') {
      e.preventDefault();
      actions.enterEditMode(selectedId);
      return;
    }

    const k = e.key.toLowerCase();

    // Navigation
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

    // Insert cells
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

    // Delete (double D)
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

    // Undo delete (Z)
    if (k === 'z') {
      e.preventDefault();
      if (lastDeletedCellSource) {
        actions.insertCellAt(idx, lastDeletedCellSource, { focus: false });
        lastDeletedCellSource = '';
      }
      return;
    }

    // Move cells (Ctrl+Shift+Arrow)
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

    // Interrupt (double I)
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

    // Restart (double 0)
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

    // Select multiple (Shift+Arrow)
    if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      const newIdx = Math.min(cells.length - 1, Math.max(0, idx + delta));
      // In notebookController, selectCell handles range selection when shift is held
      // We need to call selectCell with shift flag. Since we don't have it here,
      // we'll rely on the notebook controller's keydown handling.
      // To avoid duplication, we'll let the controller handle shift selections.
      // The controller should listen for arrow keys with shift and call selectCell with range=true.
      // So we skip here.
    }
  });

  // Toggle find bar helper
  function toggleFindBar() {
    const bar = document.getElementById('find-bar');
    if (bar) {
      findBarVisible = !findBarVisible;
      bar.style.display = findBarVisible ? 'flex' : 'none';
      if (findBarVisible) {
        const input = document.getElementById('find-input');
        if (input) setTimeout(() => input.focus(), 50);
      }
    }
  }
}

export function toggleHelpDialog() {
  const modal = document.getElementById('jupy-help-dialog');
  if (modal) {
    modal.hidden = !modal.hidden;
  }
}

function injectDialogDOM() {
  if (document.getElementById('jupy-help-dialog')) return;

  // Style and dialog HTML (same as before, add new shortcuts)
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
          <div class="shortcut-row"><kbd>Shift</kbd>+<kbd>Click</kbd> <span>Select multiple cells</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> <span>Merge selected cells</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>-</kbd> <span>Split cell at cursor</span></div>
        </div>
        <div class="shortcuts-column">
          <h3>EDIT MODE (ENTER)</h3>
          <div class="shortcut-row"><kbd>Esc</kbd> <span>Enter Command Mode</span></div>
          <div class="shortcut-row"><kbd>Alt/Option</kbd>+<kbd>↑</kbd> <span>Move current line up</span></div>
          <div class="shortcut-row"><kbd>Alt/Option</kbd>+<kbd>↓</kbd> <span>Move current line down</span></div>
          <div class="shortcut-row"><kbd>Tab</kbd> <span>Indent / Autocomplete</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Space</kbd> <span>Trigger manual suggestions</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>/</kbd> <span>Toggle line comment</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>F</kbd> <span>Find in notebook</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Z</kbd> <span>Undo cell operation</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Y</kbd> <span>Redo cell operation</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>X</kbd> <span>Cut selected cells</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>C</kbd> <span>Copy selected cells</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>V</kbd> <span>Paste cells</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> <span>Toggle line numbers</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> <span>Presentation mode</span></div>
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

---

# File: static\js\terminal\terminal.js

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


---

# File: static\js\theme\theme.js

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


---

# File: static\js\variables\variables.js

export function initVariableInspector() { console.warn('Variable inspector not implemented'); }

---

# File: static\js\widgets\widgetManager.js


/**
 * widgets/widgetManager.js
 * Full ipywidgets implementation for Jupy.
 */
export class WidgetManager {
  constructor(runSocket) {
    this.widgets = {};               // widget_id -> { type, el, kwargs, children, callbacks }
    this.links = {};                 // link_id -> { source, target, transform }
    this.runSocket = runSocket;
    this.widgetCounter = 0;
    this._initDOMEvents();
  }

  // ----------------------------------------------
  // Message handling from kernel
  // ----------------------------------------------
  handleMessage(msg) {
    const { event, widget_id, type, data } = msg;
    if (event === 'create') {
      this.createWidget(widget_id, type, data);
    } else if (event === 'update') {
      this.updateWidget(widget_id, data);
    } else if (event === 'remove') {
      this.removeWidget(widget_id);
    } else if (event === 'link') {
      this.createLink(widget_id, data);
    } else if (event === 'dlink') {
      this.createDLink(widget_id, data);
    } else if (event === 'output_stream') {
      this.appendOutput(widget_id, data);
    }
  }

  // ----------------------------------------------
  // Widget creation
  // ----------------------------------------------
  createWidget(id, type, kwargs) {
    let el;
    let children = [];
    switch (type) {
      case 'IntSlider':    el = this._createSlider(id, kwargs, 'int'); break;
      case 'FloatSlider':  el = this._createSlider(id, kwargs, 'float'); break;
      case 'IntText':      el = this._createText(id, kwargs, 'int'); break;
      case 'FloatText':    el = this._createText(id, kwargs, 'float'); break;
      case 'Checkbox':     el = this._createCheckbox(id, kwargs); break;
      case 'RadioButtons': el = this._createRadioButtons(id, kwargs); break;
      case 'ToggleButton': el = this._createToggleButton(id, kwargs); break;
      case 'ToggleButtons': el = this._createToggleButtons(id, kwargs); break;
      case 'Dropdown':     el = this._createDropdown(id, kwargs); break;
      case 'Select':       el = this._createSelect(id, kwargs, false); break;
      case 'SelectMultiple': el = this._createSelect(id, kwargs, true); break;
      case 'DatePicker':   el = this._createDatePicker(id, kwargs); break;
      case 'TimePicker':   el = this._createTimePicker(id, kwargs); break;
      case 'ColorPicker':  el = this._createColorPicker(id, kwargs); break;
      case 'FileUpload':   el = this._createFileUpload(id, kwargs); break;
      case 'Play':         el = this._createPlay(id, kwargs); break;
      case 'VBox':         el = this._createLayout(id, kwargs, 'flex', 'column'); break;
      case 'HBox':         el = this._createLayout(id, kwargs, 'flex', 'row'); break;
      case 'GridBox':      el = this._createLayout(id, kwargs, 'grid', null); break;
      case 'Accordion':    el = this._createAccordion(id, kwargs); break;
      case 'Tab':          el = this._createTab(id, kwargs); break;
      case 'Stacked':      el = this._createStacked(id, kwargs); break;
      case 'Box':          el = this._createLayout(id, kwargs, 'block', null); break;
      case 'Output':       el = this._createOutput(id, kwargs); break;
      default:
        el = document.createElement('div');
        el.textContent = `Unknown widget: ${type}`;
    }
    this.widgets[id] = { type, el, kwargs, children, callbacks: [] };
    return el;
  }

  // ----------------------------------------------
  // Widget updates
  // ----------------------------------------------
  updateWidget(id, data) {
    const w = this.widgets[id];
    if (!w) return;
    Object.assign(w.kwargs, data);
    // Update DOM
    const { type, el } = w;
    if (type.endsWith('Slider')) {
      const input = el.querySelector('input[type="range"]');
      const label = el.querySelector('.widget-value');
      if (input && data.value !== undefined) {
        input.value = data.value;
        if (label) label.textContent = data.value;
      }
      if (data.min !== undefined && input) input.min = data.min;
      if (data.max !== undefined && input) input.max = data.max;
      if (data.step !== undefined && input) input.step = data.step;
    } else if (type === 'IntText' || type === 'FloatText') {
      const input = el.querySelector('input[type="text"]');
      if (input && data.value !== undefined) input.value = data.value;
    } else if (type === 'Checkbox') {
      const input = el.querySelector('input[type="checkbox"]');
      if (input && data.value !== undefined) input.checked = data.value;
    } else if (type === 'ToggleButton') {
      const btn = el.querySelector('.widget-toggle-button');
      if (btn) {
        if (data.value !== undefined) {
          btn.classList.toggle('active', data.value);
          btn.textContent = data.value ? (data.label_on || 'ON') : (data.label_off || 'OFF');
        }
        if (data.description !== undefined) btn.textContent = data.description;
      }
    } else if (type === 'RadioButtons' || type === 'ToggleButtons') {
      // Rebuild
      const container = el.querySelector('.widget-radio-group') || el;
      container.innerHTML = '';
      const opts = data.options || w.kwargs.options || [];
      const value = data.value !== undefined ? data.value : w.kwargs.value;
      opts.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.className = 'widget-radio-option' + (opt === value ? ' active' : '');
        btn.dataset.value = opt;
        btn.addEventListener('click', () => {
          this._sendEvent(id, 'value', opt);
        });
        container.appendChild(btn);
      });
    } else if (type === 'Dropdown' || type === 'Select' || type === 'SelectMultiple') {
      const select = el.querySelector('select');
      if (!select) return;
      if (data.options !== undefined) {
        select.innerHTML = '';
        data.options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          select.appendChild(option);
        });
      }
      if (data.value !== undefined) {
        if (type === 'SelectMultiple') {
          const vals = Array.isArray(data.value) ? data.value : [data.value];
          Array.from(select.options).forEach(opt => {
            opt.selected = vals.includes(opt.value);
          });
        } else {
          select.value = data.value;
        }
      }
    } else if (type === 'DatePicker') {
      const input = el.querySelector('input[type="date"]');
      if (input && data.value !== undefined) input.value = data.value;
    } else if (type === 'TimePicker') {
      const input = el.querySelector('input[type="time"]');
      if (input && data.value !== undefined) input.value = data.value;
    } else if (type === 'ColorPicker') {
      const input = el.querySelector('input[type="color"]');
      if (input && data.value !== undefined) input.value = data.value;
    } else if (type === 'Play') {
      // Update value display, but not needed for play
    } else if (type.startsWith('VBox') || type.startsWith('HBox') || type === 'Box' || type === 'GridBox') {
      // Children are updated via separate messages; we handle that in setChildren
    } else if (type === 'Accordion' || type === 'Tab' || type === 'Stacked') {
      // Children updates handled separately
    } else if (type === 'Output') {
      // Output widget updates are handled via output_stream messages
    }
  }

  // ----------------------------------------------
  // Remove widget
  // ----------------------------------------------
  removeWidget(id) {
    const w = this.widgets[id];
    if (w) {
      w.el.remove();
      delete this.widgets[id];
    }
  }

  // ----------------------------------------------
  // Create links
  // ----------------------------------------------
  createLink(id, data) {
    // data: { source, target, transform? }
    // We'll implement two-way linking by registering callbacks
    const source = this.widgets[data.source];
    const target = this.widgets[data.target];
    if (!source || !target) return;
    // Register callback on source to update target
    const cb = (value) => {
      const newValue = data.transform ? data.transform(value) : value;
      this._sendEvent(data.target, 'value', newValue);
      // Also update the target widget's display
      this.updateWidget(data.target, { value: newValue });
    };
    source.callbacks.push(cb);
    // For dlink, the reverse direction
  }

  createDLink(id, data) {
    // dlink: one-way (source -> target)
    this.createLink(id, data);
  }

  // ----------------------------------------------
  // Output widget streaming
  // ----------------------------------------------
  appendOutput(id, data) {
    const w = this.widgets[id];
    if (!w || w.type !== 'Output') return;
    const outputEl = w.el.querySelector('.widget-output-content');
    if (!outputEl) return;
    if (data.type === 'stdout') {
      const span = document.createElement('span');
      span.textContent = data.text;
      outputEl.appendChild(span);
    } else if (data.type === 'stderr') {
      const span = document.createElement('span');
      span.style.color = 'red';
      span.textContent = data.text;
      outputEl.appendChild(span);
    } else if (data.type === 'clear') {
      outputEl.innerHTML = '';
    }
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  // ----------------------------------------------
  // Render a widget into a container
  // ----------------------------------------------
  renderWidget(id, container) {
    const w = this.widgets[id];
    if (!w) return;
    container.innerHTML = '';
    container.appendChild(w.el);
    // Set children for layout widgets (if any)
    if (w.children && w.children.length > 0) {
      // Children are already appended via createLayout
    }
  }

  // ----------------------------------------------
  // Private: send events to kernel
  // ----------------------------------------------
  _sendEvent(widgetId, attr, value) {
    if (this.runSocket && this.runSocket.isOpen) {
      this.runSocket.send({
        action: 'widget_event',
        widget_id: widgetId,
        data: { [attr]: value }
      });
    }
  }

  // ----------------------------------------------
  // DOM creation methods
  // ----------------------------------------------
  _createSlider(id, kwargs, type) {
    const div = document.createElement('div');
    div.className = 'widget-slider';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = kwargs.min !== undefined ? kwargs.min : (type === 'int' ? 0 : 0.0);
    input.max = kwargs.max !== undefined ? kwargs.max : (type === 'int' ? 100 : 100.0);
    input.step = kwargs.step !== undefined ? kwargs.step : (type === 'int' ? 1 : 0.1);
    input.value = kwargs.value !== undefined ? kwargs.value : input.min;
    const valueLabel = document.createElement('span');
    valueLabel.className = 'widget-value';
    valueLabel.textContent = input.value;
    input.addEventListener('input', () => {
      const val = type === 'int' ? parseInt(input.value) : parseFloat(input.value);
      valueLabel.textContent = val;
      this._sendEvent(id, 'value', val);
    });
    div.appendChild(label);
    div.appendChild(input);
    div.appendChild(valueLabel);
    return div;
  }

  _createText(id, kwargs, type) {
    const div = document.createElement('div');
    div.className = 'widget-text';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = kwargs.value !== undefined ? kwargs.value : '';
    input.addEventListener('change', () => {
      let val = input.value;
      if (type === 'int') val = parseInt(val) || 0;
      else if (type === 'float') val = parseFloat(val) || 0.0;
      this._sendEvent(id, 'value', val);
    });
    div.appendChild(label);
    div.appendChild(input);
    return div;
  }

  _createCheckbox(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-checkbox';
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = kwargs.value !== undefined ? kwargs.value : false;
    input.addEventListener('change', () => {
      this._sendEvent(id, 'value', input.checked);
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(kwargs.description || ''));
    div.appendChild(label);
    return div;
  }

  _createRadioButtons(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-radio-group';
    const opts = kwargs.options || [];
    const value = kwargs.value !== undefined ? kwargs.value : opts[0];
    opts.forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.className = 'widget-radio-option' + (opt === value ? ' active' : '');
      btn.dataset.value = opt;
      btn.addEventListener('click', () => {
        this._sendEvent(id, 'value', opt);
      });
      div.appendChild(btn);
    });
    return div;
  }

  _createToggleButton(id, kwargs) {
    const btn = document.createElement('button');
    btn.className = 'widget-toggle-button' + (kwargs.value ? ' active' : '');
    btn.textContent = kwargs.value ? (kwargs.label_on || 'ON') : (kwargs.label_off || 'OFF');
    btn.addEventListener('click', () => {
      const newVal = !this.widgets[id]?.kwargs?.value;
      this._sendEvent(id, 'value', newVal);
    });
    return btn;
  }

  _createToggleButtons(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-radio-group';
    const opts = kwargs.options || [];
    const value = kwargs.value !== undefined ? kwargs.value : opts[0];
    opts.forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.className = 'widget-radio-option' + (opt === value ? ' active' : '');
      btn.dataset.value = opt;
      btn.addEventListener('click', () => {
        this._sendEvent(id, 'value', opt);
      });
      div.appendChild(btn);
    });
    return div;
  }

  _createDropdown(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-dropdown';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const select = document.createElement('select');
    const opts = kwargs.options || [];
    const value = kwargs.value !== undefined ? kwargs.value : opts[0];
    opts.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      option.selected = opt === value;
      select.appendChild(option);
    });
    select.addEventListener('change', () => {
      this._sendEvent(id, 'value', select.value);
    });
    div.appendChild(label);
    div.appendChild(select);
    return div;
  }

  _createSelect(id, kwargs, multiple) {
    const div = document.createElement('div');
    div.className = 'widget-select';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const select = document.createElement('select');
    select.multiple = multiple;
    const opts = kwargs.options || [];
    const value = kwargs.value !== undefined ? kwargs.value : (multiple ? [] : opts[0]);
    opts.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      if (multiple) {
        option.selected = Array.isArray(value) && value.includes(opt);
      } else {
        option.selected = opt === value;
      }
      select.appendChild(option);
    });
    select.addEventListener('change', () => {
      if (multiple) {
        const vals = Array.from(select.selectedOptions).map(o => o.value);
        this._sendEvent(id, 'value', vals);
      } else {
        this._sendEvent(id, 'value', select.value);
      }
    });
    div.appendChild(label);
    div.appendChild(select);
    return div;
  }

  _createDatePicker(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-datepicker';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const input = document.createElement('input');
    input.type = 'date';
    if (kwargs.value) input.value = kwargs.value;
    input.addEventListener('change', () => {
      this._sendEvent(id, 'value', input.value);
    });
    div.appendChild(label);
    div.appendChild(input);
    return div;
  }

  _createTimePicker(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-timepicker';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const input = document.createElement('input');
    input.type = 'time';
    if (kwargs.value) input.value = kwargs.value;
    input.addEventListener('change', () => {
      this._sendEvent(id, 'value', input.value);
    });
    div.appendChild(label);
    div.appendChild(input);
    return div;
  }

  _createColorPicker(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-colorpicker';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const input = document.createElement('input');
    input.type = 'color';
    if (kwargs.value) input.value = kwargs.value;
    input.addEventListener('input', () => {
      this._sendEvent(id, 'value', input.value);
    });
    div.appendChild(label);
    div.appendChild(input);
    return div;
  }

  _createFileUpload(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-fileupload';
    const label = document.createElement('span');
    label.className = 'widget-label';
    label.textContent = kwargs.description || '';
    const input = document.createElement('input');
    input.type = 'file';
    if (kwargs.accept) input.accept = kwargs.accept;
    if (kwargs.multiple) input.multiple = true;
    input.addEventListener('change', () => {
      const files = Array.from(input.files).map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
        lastModified: f.lastModified
      }));
      this._sendEvent(id, 'value', files);
    });
    div.appendChild(label);
    div.appendChild(input);
    return div;
  }

  _createPlay(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-play';
    const btn = document.createElement('button');
    btn.textContent = '▶';
    btn.className = 'widget-play-button';
    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'widget-value';
    valueDisplay.textContent = kwargs.value !== undefined ? kwargs.value : 0;
    let playing = false;
    let interval = null;
    btn.addEventListener('click', () => {
      playing = !playing;
      btn.textContent = playing ? '⏸' : '▶';
      if (playing) {
        const step = kwargs.step || 1;
        const max = kwargs.max || 100;
        interval = setInterval(() => {
          let val = parseInt(valueDisplay.textContent) + step;
          if (val > max) val = max;
          valueDisplay.textContent = val;
          this._sendEvent(id, 'value', val);
        }, kwargs.interval || 100);
      } else if (interval) {
        clearInterval(interval);
        interval = null;
      }
    });
    div.appendChild(btn);
    div.appendChild(valueDisplay);
    return div;
  }

  _createLayout(id, kwargs, display, direction) {
    const div = document.createElement('div');
    div.className = `widget-layout widget-${display}`;
    if (direction) div.style.flexDirection = direction;
    if (kwargs.children) {
      kwargs.children.forEach(childId => {
        const child = this.widgets[childId];
        if (child) div.appendChild(child.el);
      });
    }
    // Store children ids for later updates
    this.widgets[id] = { type: 'Layout', el: div, kwargs, children: kwargs.children || [] };
    return div;
  }

  _createAccordion(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-accordion';
    if (kwargs.children) {
      kwargs.children.forEach((childId, i) => {
        const child = this.widgets[childId];
        if (!child) return;
        const panel = document.createElement('div');
        panel.className = 'accordion-panel';
        const header = document.createElement('div');
        header.className = 'accordion-header';
        header.textContent = kwargs.titles ? kwargs.titles[i] : `Panel ${i+1}`;
        const content = document.createElement('div');
        content.className = 'accordion-content';
        content.appendChild(child.el);
        content.style.display = 'none';
        header.addEventListener('click', () => {
          const isOpen = content.style.display !== 'none';
          content.style.display = isOpen ? 'none' : 'block';
        });
        panel.appendChild(header);
        panel.appendChild(content);
        div.appendChild(panel);
      });
    }
    return div;
  }

  _createTab(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-tabs';
    const headerRow = document.createElement('div');
    headerRow.className = 'tab-headers';
    const contentRow = document.createElement('div');
    contentRow.className = 'tab-contents';
    if (kwargs.children) {
      kwargs.children.forEach((childId, i) => {
        const child = this.widgets[childId];
        if (!child) return;
        const tabBtn = document.createElement('button');
        tabBtn.className = 'tab-header';
        tabBtn.textContent = kwargs.titles ? kwargs.titles[i] : `Tab ${i+1}`;
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        tabContent.appendChild(child.el);
        tabContent.style.display = i === 0 ? 'block' : 'none';
        tabBtn.addEventListener('click', () => {
          // Hide all contents, show this one
          contentRow.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
          tabContent.style.display = 'block';
          headerRow.querySelectorAll('.tab-header').forEach(b => b.classList.remove('active'));
          tabBtn.classList.add('active');
        });
        if (i === 0) tabBtn.classList.add('active');
        headerRow.appendChild(tabBtn);
        contentRow.appendChild(tabContent);
      });
    }
    div.appendChild(headerRow);
    div.appendChild(contentRow);
    return div;
  }

  _createStacked(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-stacked';
    if (kwargs.children) {
      kwargs.children.forEach((childId, i) => {
        const child = this.widgets[childId];
        if (!child) return;
        const stackItem = document.createElement('div');
        stackItem.className = 'stack-item';
        stackItem.appendChild(child.el);
        stackItem.style.display = i === 0 ? 'block' : 'none';
        div.appendChild(stackItem);
      });
    }
    return div;
  }

  _createOutput(id, kwargs) {
    const div = document.createElement('div');
    div.className = 'widget-output';
    const content = document.createElement('div');
    content.className = 'widget-output-content';
    content.style.whiteSpace = 'pre-wrap';
    content.style.fontFamily = 'monospace';
    content.style.maxHeight = '200px';
    content.style.overflow = 'auto';
    div.appendChild(content);
    return div;
  }

  // ----------------------------------------------
  // Private: DOM event setup
  // ----------------------------------------------
  _initDOMEvents() {
    // Nothing needed globally
  }
}


export function initWidgetManager(runSocket) {
  return new WidgetManager(runSocket);
}

---

