---
title: Folder Code Compilation
date: 2026-07-25 21:59:54
root_folder: "jupy"
total_compiled_files: 51
---

# File: cli.py

```py
import argparse
import socketserver
import sys
import webbrowser


class ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    parser = argparse.ArgumentParser(description="Jupy - Brutalist Local Python Notebook")
    parser.add_argument("--port", type=int, default=8000, help="Port to run server on (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open browser")
    args = parser.parse_args()

    # Ensure Jupy's own server-side dependencies (psutil) exist in *this*
    # interpreter — the one running `jupy` itself — before anything else is
    # imported. Must happen before core/metrics.py (imported transitively via
    # server/handlers.py below) does its top-level `import psutil`.
    from jupy.core.envmanager import ensure_jupy_dependencies
    ensure_jupy_dependencies()

    from jupy.server.handlers import JupyHTTPHandler

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

# File: core\envmanager.py

```py
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
        if on_progress: on_progress(f"Creating environment at {env_dir}...")
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
        if on_progress: on_progress("Installing completion engine...")
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
```


---

# File: core\kernel.py

```py
"""
jupy/core/kernel.py
Persistent Python Kernel Manager — one long-lived worker subprocess per
notebook session, communicating over stdin/stdout with simple ASCII framing.

Which interpreter backs the worker is now dynamic (see core/envmanager.py):
by default it's a global env shared across projects, but the user can switch
to a project-local `.jupy_env` or another named global env from the
Environment panel — see switch_env() below, wired up via
POST /api/env/select in server/handlers.py.
"""
import json
import os
import re
import subprocess
import sys
import threading

from jupy.core import envmanager

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

# Lazy matplotlib backend – only set when capturing plots
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
                        sys.stdout.flush()
                else:
                    exec(compile(code, "<cell>", "exec"), namespace)

                plots = _capture_plots()
                if plots:
                    sys.stdout.write("---JUPY_PLOTS_START---\n")
                    sys.stdout.flush()
                    for p in plots:
                        sys.stdout.write(p + "\n")
                        sys.stdout.flush()
                    sys.stdout.write("---JUPY_PLOTS_END---\n")
                    sys.stdout.flush()

            except SyntaxError as e:
                err_msg = "".join(traceback.format_exception_only(type(e), e))
                sys.stdout.write(f"---JUPY_STDERR_START---\n{err_msg}---JUPY_STDERR_END---\n")
                sys.stdout.flush()
            except Exception as e:
                tb = e.__traceback__.tb_next if e.__traceback__ else None
                err_msg = "".join(traceback.format_exception(type(e), e, tb))
                sys.stdout.write(f"---JUPY_STDERR_START---\n{err_msg}---JUPY_STDERR_END---\n")
                sys.stdout.flush()

            sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
            sys.stdout.flush()

    except Exception as e:
        sys.stdout.write(f"---JUPY_STDERR_START---\nKernel error: {e}\n---JUPY_STDERR_END---\n")
        sys.stdout.flush()
        sys.stdout.write("---JUPY_CELL_COMPLETE---\n")
        sys.stdout.flush()
"""


def _kill_process_tree(proc):
    """Forcefully kills process tree instantly, without touching its
    stdin/stdout/stderr pipe objects. Safe to call from any thread — including
    while another thread is concurrently blocked reading/writing those pipes
    — which is required for interrupt() to work instantly without waiting on
    comm_lock (see KernelManager.force_interrupt)."""
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
    """Waits for an already-killed process to fully exit, then closes its
    pipes. Run on a background thread by restart() (see below) so that
    restart() itself stays instant — it never blocks waiting for comm_lock,
    exactly like interrupt(), even if a cell is currently running.

    Waiting for the process to actually exit before touching its pipes is
    what makes this safe to do without holding any lock: once wait() returns,
    the process (and both ends of its pipes) are fully torn down, so any
    other thread that was blocked reading/writing them has already unblocked
    on its own (a dead process's pipes surface as a normal, harmless EOF/
    write-failure to whoever's using them — see execute()'s retry logic).

    Without this cleanup, a killed process's pipe handles would otherwise get
    closed implicitly and lazily by the garbage collector at some later,
    unrelated point in the program. On Windows that deferred close can raise
    "OSError: [Errno 22] Invalid argument" from inside a finalizer, which
    Python can't propagate normally and instead prints as a scary-looking but
    harmless "Exception ignored in: <_io.TextIOWrapper ...>" — closing things
    ourselves, on our own schedule, avoids that entirely.
    """
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
    """Persistent Python Kernel Manager with instant non-blocking process
    force-kill and a switchable backing environment (see core/envmanager.py)."""

    def __init__(self):
        self.exec_count = 0
        self.proc = None
        self.lock = threading.Lock()
        self.comm_lock = threading.Lock()  # guards ALL stdin/stdout traffic with the worker

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
        """Sends completion request into worker kernel. Never blocks a
        running cell — returns [] immediately if the kernel is busy, exactly
        like real Jupyter/Colab do."""
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

    def force_interrupt(self):
        """Forcefully kills running process instantly without waiting for thread locks."""
        proc = self.proc
        if proc and proc.poll() is None:
            _kill_process_tree(proc)
            return True
        return False

    def interrupt(self):
        return self.force_interrupt()

    def restart(self):
        """Restarts kernel process (same env), wiping namespace state.

        Kills the old process and spawns a new one immediately — this is
        intentionally NOT gated on comm_lock, so it (and switch_env(), which
        calls this) stay instant even while a cell is currently running,
        exactly like interrupt(). The old process's pipes are reaped and
        closed on a background thread once it has actually exited (see
        _reap_and_close) instead of synchronously here or left for the
        garbage collector.

        Because this doesn't wait for comm_lock, there's an inherent tiny
        window where execute() could grab a reference to the process being
        killed right here and try to write to it. execute() handles that
        itself by transparently respawning and retrying once — see below —
        so switching environments never surfaces a "Kernel communication
        error" to the user.
        """
        old_proc = self.proc
        self.proc = None
        _kill_process_tree(old_proc)
        if old_proc is not None:
            threading.Thread(target=_reap_and_close, args=(old_proc,), daemon=True).start()
        self.exec_count = 0
        self._ensure_kernel_proc()

    def switch_env(self, mode, name=None, on_progress=None):
        """Persists a new env choice for this folder, ensures it exists
        (creating it on first use), and restarts the kernel against it."""
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

        # Faster pip detection using startswith and slicing
        for line in lines:
            stripped = line.strip()
            if stripped.startswith(('!pip install', '%pip install', 'pip install')):
                # Remove leading ! or % and the "pip install" part
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
                # current_proc may have just been killed by a concurrent
                # restart()/switch_env() call — those intentionally don't wait
                # for comm_lock so they stay instant even mid-execution (see
                # KernelManager.restart). Recover by respawning a fresh
                # process and trying once more before giving up.
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

            stderr_collecting = False
            plots_collecting = False
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
                    # Skip sending empty lines to reduce WebSocket traffic
                    if line.strip():
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
from jupy.core.kernel import kernel

ANSI_ESCAPE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')

def clean_text(text):
    return ANSI_ESCAPE.sub('', text)


class TerminalSession:
    """Executes shell commands in the currently active Jupy environment with
    real-time output streaming and a clean yellow prompt."""
    def __init__(self, ws_send_fn):
        self.ws_send_fn = ws_send_fn
        self.cwd = os.getcwd()

    def get_env(self):
        env = os.environ.copy()
        env["VIRTUAL_ENV"] = kernel.env_info["path"]
        env["PATH"] = kernel.env_info["bin"] + os.path.pathsep + env.get("PATH", "")
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        return env

    def get_prompt(self):
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
```


---

# File: core\venv.py

```py
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
from jupy.core import envmanager
from jupy.core.kernel import kernel
from jupy.core.metrics import get_system_metrics
from jupy.core.terminal import TerminalSession
from jupy.core.venv import get_python_version, install_package, list_packages, uninstall_package
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
                kernel.restart()
                self._send_json({"status": "restarted", "exec_count": kernel.exec_count})

            elif self.path == "/api/pip/install":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                name = data.get("name", "")
                success, output = install_package(kernel.python, name)
                self._send_json({"success": success, "output": output, "packages": list_packages(kernel.python)})

            elif self.path == "/api/pip/uninstall":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                name = data.get("name", "")
                success, output = uninstall_package(kernel.python, name)
                self._send_json({"success": success, "output": output, "packages": list_packages(kernel.python)})

            elif self.path == "/api/env/select":
                data = json.loads(post_data.decode("utf-8")) if post_data else {}
                mode = data.get("mode", "global")
                name = data.get("name")
                try:
                    info = kernel.switch_env(mode, name)
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

            else:
                self.send_error(404, "Endpoint not found")
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            return
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

        elif self.path == "/api/status":
            self._send_json({"status": "ready", "exec_count": kernel.exec_count, "venv": kernel.env_info["path"]})

        elif self.path == "/api/pip/list":
            self._send_json({"packages": list_packages(kernel.python)})

        elif self.path == "/api/env/list":
            self._send_json({
                "current": self._env_payload(kernel.env_info),
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
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass
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

# File: static\files.md

```md
---
title: Folder Code Compilation
date: 2026-07-25 21:33:26
root_folder: "static"
total_compiled_files: 36
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

# File: index.html

```html
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

<link rel="stylesheet" href="css/main.css" />
</head>
<body>

<div class="toast-container" id="toast-container"></div>

<header class="topbar">
  <div class="brand-block">
    <img src="logo.png" alt="Jupy" class="logo-img" onerror="this.style.display='none'" />
    <span class="brand-name">JUPY</span>
  </div>

  <div class="menu-block">
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
      </div>
    </div>
  </div>

  <div class="title-block">
    <div class="filename-wrapper">
      <input id="filename" class="filename-input" value="Untitled.ipynb" spellcheck="false" autocomplete="off" />
    </div>
    <span class="status" id="status">
      <span class="status-indicator"></span>
      <span id="env-status-label">ENV: READY</span>
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

<div class="app-workspace" id="app-workspace">
  <!-- Far-Left Split Environment Manager (Hidden by Default) -->
  <aside class="env-manager-panel" id="env-manager-panel" hidden>
    <div class="env-manager-header">
      <span class="env-manager-title" id="env-manager-title-text">📦 ENVIRONMENT</span>
      <button class="action-btn action-danger" id="btn-env-manager-close" title="Close">✕</button>
    </div>
    <div class="env-manager-body">

      <!-- VIEW: CURRENT ENVIRONMENT -->
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

      <!-- VIEW: CREATE ENVIRONMENT -->
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

      <!-- VIEW: PIP MANAGER -->
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

<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/edit/closebrackets.min.js"></script>
<script type="module" src="js/app.js"></script>
</body>
</html>
```


---

# File: css\codemirror-brutalism.css

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

# File: css\main.css

```css
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
```


---

# File: css\notebook.css

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

# File: css\base\variables.css

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

# File: css\components\about-modal.css

```css
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

```


---

# File: css\components\cells.css

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

# File: css\components\editor.css

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

# File: css\components\env-manager.css

```css
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
```


---

# File: css\components\pip-manager.css

```css
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

```


---

# File: css\components\runtime-menu.css

```css
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
.runtime-menu:hover .runtime-menu-dropdown,
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
```


---

# File: css\components\shortcuts-dialog.css

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

# File: css\components\system-bar.css

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

# File: css\components\terminal.css

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

# File: css\components\topbar.css

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

# File: js\app.js

```js
/**
 * app.js
 * Application entry point.
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
import { initRuntimeMenu } from './runtime/runtimeMenu.js';
import { initEnvTopbarMenu } from './env/envTopbarMenu.js';
import { setupEnvManager } from './env/envManager.js';

(() => {
  const container = document.getElementById('notebook');
  const filenameInput = document.getElementById('filename');
  const fileInput = document.getElementById('file-input');
  const openBtn = document.getElementById('btn-open');
  const saveBtn = document.getElementById('btn-save');
  const addCellBtn = document.getElementById('btn-add-bottom');
  const runAllBtn = document.getElementById('btn-run-all');
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

  const cellTemplate = document.getElementById('cell-template');
  const insertBarTemplate = document.getElementById('insert-bar-template');

  const showToast = createToaster(toastContainer);

  initTheme(themeToggleBtn);
  initMetricsStream();

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

  const envManager = setupEnvManager({
    panel: envPanel,
    titleEl: envPanelTitle,
    closeBtn: envCloseBtn,
    views: { current: envViewCurrent, create: envViewCreate, pip: envViewPip },
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
    showToast,
    onResize: () => setTimeout(() => notebook.refreshAllEditors(), 50),
    onEnvSwitched: () => showToast('🔄 KERNEL RESTARTED ON NEW ENVIRONMENT', 'danger'),
  });
  envManager.refreshStatus(); // populate the topbar ENV label on boot

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

  runAllBtn.addEventListener('click', () => notebook.runAll());

  addCellBtn?.addEventListener('click', () => {
    notebook.insertCellAt(notebook.getCells().length, '', { focus: true });
  });

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

# File: js\autocomplete\autocomplete.js

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
      customKeys: {
        Up: (cm, handle) => handle.moveFocus(-1),
        Down: (cm, handle) => handle.moveFocus(1),
        Tab: (cm, handle) => handle.pick(),
        Enter: (cm, handle) => handle.pick(), // accept the highlighted suggestion
        Esc: (cm, handle) => handle.close(),
        // Shift-Enter/Ctrl-Enter/Cmd-Enter are NOT listed here (different key
        // names to CodeMirror than plain "Enter"), so they always fall
        // through untouched to cellFactory.js's run bindings — hint or no hint.
      },
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

# File: js\cells\cellFactory.js

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
      'Shift-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { advance: true }); },
      'Ctrl-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { advance: false }); },
      'Cmd-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { advance: false }); },
      'Alt-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { insertBelow: true }); },
      Esc: () => hooks.onExitEdit(cell.id),
      'Alt-Up': (editor) => moveLineUp(editor),
      'Alt-Down': (editor) => moveLineDown(editor),
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

# File: js\cells\cellOutput.js

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

# File: js\cells\editorCommands.js

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

# File: js\config\constants.js

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

# File: js\core\dropdownMenu.js

```js
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
```


---

# File: js\core\socket.js

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

# File: js\core\toast.js

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

# File: js\env\envManager.js

```js
/**
 * env/envManager.js
 * Left slide-out panel with three mutually-exclusive views, each opened from
 * the "ENVIRONMENT" topbar dropdown (see env/envTopbarMenu.js):
 *
 *   - "current" : switch between the global default env, a named global env,
 *                 or a project-local `.jupy_env`, plus details about whatever
 *                 is currently active.
 *   - "create"  : create a new named global env.
 *   - "pip"     : manage packages (search/install/uninstall) in the active env.
 *
 * Only one view is ever shown at a time. Calling openView(view) while a
 * *different* view is already open swaps to the new one (the old one is
 * cancelled, not stacked). Calling openView(view) again for the view that's
 * already open closes the whole panel — a simple toggle.
 */
export function setupEnvManager({
  panel, closeBtn, titleEl,
  views, // { current: HTMLElement, create: HTMLElement, pip: HTMLElement }
  modeRadios, namedSelect, createInput, createBtn, applyBtn, statusLine,
  jupyVersionEl, pythonVersionEl, pathEl, platformEl, packageCountEl,
  statusLabelEl,
  listEl, searchInput, installInput, installBtn,
  createStatusLine, existingEnvsEl, pipStatusLine,
  showToast, onResize, onEnvSwitched,
}) {
  let current = null;
  let globalEnvs = [];
  let packages = [];
  let loaded = false;
  let busy = false;
  let activeView = null;

  const VIEW_LABELS = {
    current: '📦 CURRENT ENVIRONMENT',
    create: '➕ CREATE ENVIRONMENT',
    pip: '📦 PIP MANAGER',
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

  /** Shows exactly one of the three views, hiding the other two. */
  function showView(view) {
    Object.entries(views).forEach(([key, el]) => {
      if (el) el.hidden = key !== view;
    });
    activeView = view;
    if (titleEl) titleEl.textContent = VIEW_LABELS[view] || '📦 ENVIRONMENT';
  }

  /**
   * Opens the given view. If that same view is already open, this instead
   * closes the panel (toggle). If a *different* view is open, it is
   * cancelled/replaced by the requested one — only one view is ever visible.
   */
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

  return { openView, close, refreshStatus: refreshEnvInfo };
}
```


---

# File: js\env\envTopbarMenu.js

```js
/**
 * env/envTopbarMenu.js
 * "ENVIRONMENT" topbar dropdown, next to RUNTIME. Each item opens a
 * different view inside the left env-manager-panel (see env/envManager.js).
 * Only one view is ever visible at a time — clicking an item while a
 * *different* view is open cancels/replaces it; clicking the item for the
 * view that's already open closes the panel.
 */
import { createDropdown } from '../core/dropdownMenu.js';

export function initEnvTopbarMenu({ menu, trigger, dropdown, envManager }) {
  const { bind } = createDropdown({ menu, trigger, dropdown });

  bind('envmenu-current', () => envManager.openView('current'));
  bind('envmenu-create', () => envManager.openView('create'));
  bind('envmenu-pip', () => envManager.openView('pip'));
}
```


---

# File: js\metrics\metrics.js

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

# File: js\notebook\notebookController.js

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
      document.activeElement?.blur();
      const next = cells[idx + 1];
      enterEditMode(next.id);
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

    if (runningCellId === id) {
      showToast('⚠️ CELL ALREADY RUNNING', 'warning');
      // Advance focus to the next cell even though we're not re-running it —
      // matches the "queued" branch below. Without this, Shift+Enter on a
      // cell that is itself still executing (a loop, sleep(), waiting on
      // stdin, or just enough websocket latency to notice) leaves the
      // selection stuck instead of moving down, which is the one case that
      // looked like "Shift+Enter sometimes doesn't advance."
      if (advance) advanceSelectionAfter(idx);
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
    restartAndRunAll,
    restartAndRunToSelected,
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

# File: js\notebook\notebookFile.js

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

# File: js\runtime\aboutDialog.js

```js
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

```


---

# File: js\runtime\pyodideRuntime.js

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

# File: js\runtime\runtimeMenu.js

```js
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
```


---

# File: js\shortcuts\shortcuts.js

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
    // Keydowns originating inside a CodeMirror editor are fully owned by that
    // editor's own extraKeys (see cells/cellFactory.js). Cell state can change
    // synchronously mid-event (Shift-Enter advances selection), so re-checking
    // state here for the same event is unreliable and caused Shift-Enter to
    // run both the old cell and the newly-selected one. Always bail instead.
    if (e.target.closest && e.target.closest('.CodeMirror')) {
      return;
    }

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

# File: js\terminal\terminal.js

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

# File: js\theme\theme.js

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

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Darker+Grotesque:wght@500;700;800;900&family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet">

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.css" />

<link rel="stylesheet" href="css/main.css" />
</head>
<body>

<div class="toast-container" id="toast-container"></div>

<header class="topbar">
  <div class="brand-block">
    <img src="logo.png" alt="Jupy" class="logo-img" onerror="this.style.display='none'" />
    <span class="brand-name">JUPY</span>
  </div>

  <div class="menu-block">
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
      </div>
    </div>
  </div>

  <div class="title-block">
    <div class="filename-wrapper">
      <input id="filename" class="filename-input" value="Untitled.ipynb" spellcheck="false" autocomplete="off" />
    </div>
    <span class="status" id="status">
      <span class="status-indicator"></span>
      <span id="env-status-label">ENV: READY</span>
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

<div class="app-workspace" id="app-workspace">
  <!-- Far-Left Split Environment Manager (Hidden by Default) -->
  <aside class="env-manager-panel" id="env-manager-panel" hidden>
    <div class="env-manager-header">
      <span class="env-manager-title" id="env-manager-title-text">📦 ENVIRONMENT</span>
      <button class="action-btn action-danger" id="btn-env-manager-close" title="Close">✕</button>
    </div>
    <div class="env-manager-body">

      <!-- VIEW: CURRENT ENVIRONMENT -->
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

      <!-- VIEW: CREATE ENVIRONMENT -->
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

      <!-- VIEW: PIP MANAGER -->
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

<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.js"></script>
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

# File: static\css\components\about-modal.css

```css
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

# File: static\css\components\env-manager.css

```css
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
```


---

# File: static\css\components\pip-manager.css

```css
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

```


---

# File: static\css\components\runtime-menu.css

```css
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
 * Application entry point.
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
import { initRuntimeMenu } from './runtime/runtimeMenu.js';
import { initEnvTopbarMenu } from './env/envTopbarMenu.js';
import { setupEnvManager } from './env/envManager.js';

(() => {
  const container = document.getElementById('notebook');
  const filenameInput = document.getElementById('filename');
  const fileInput = document.getElementById('file-input');
  const openBtn = document.getElementById('btn-open');
  const saveBtn = document.getElementById('btn-save');
  const addCellBtn = document.getElementById('btn-add-bottom');
  const runAllBtn = document.getElementById('btn-run-all');
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

  const cellTemplate = document.getElementById('cell-template');
  const insertBarTemplate = document.getElementById('insert-bar-template');

  const showToast = createToaster(toastContainer);

  initTheme(themeToggleBtn);
  initMetricsStream();

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

  const envManager = setupEnvManager({
    panel: envPanel,
    titleEl: envPanelTitle,
    closeBtn: envCloseBtn,
    views: { current: envViewCurrent, create: envViewCreate, pip: envViewPip },
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
    showToast,
    onResize: () => setTimeout(() => notebook.refreshAllEditors(), 50),
    onEnvSwitched: () => showToast('🔄 KERNEL RESTARTED ON NEW ENVIRONMENT', 'danger'),
  });
  envManager.refreshStatus(); // populate the topbar ENV label on boot

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

  runAllBtn.addEventListener('click', () => notebook.runAll());

  addCellBtn?.addEventListener('click', () => {
    notebook.insertCellAt(notebook.getCells().length, '', { focus: true });
  });

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
      customKeys: {
        Up: (cm, handle) => handle.moveFocus(-1),
        Down: (cm, handle) => handle.moveFocus(1),
        Tab: (cm, handle) => handle.pick(),
        Enter: (cm, handle) => handle.pick(), // accept the highlighted suggestion
        Esc: (cm, handle) => handle.close(),
        // Shift-Enter/Ctrl-Enter/Cmd-Enter are NOT listed here (different key
        // names to CodeMirror than plain "Enter"), so they always fall
        // through untouched to cellFactory.js's run bindings — hint or no hint.
      },
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
      'Shift-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { advance: true }); },
      'Ctrl-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { advance: false }); },
      'Cmd-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { advance: false }); },
      'Alt-Enter': (editor) => { editor.state.completionActive?.close(); hooks.onRun(cell.id, { insertBelow: true }); },
      Esc: () => hooks.onExitEdit(cell.id),
      'Alt-Up': (editor) => moveLineUp(editor),
      'Alt-Down': (editor) => moveLineDown(editor),
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

# File: static\js\core\dropdownMenu.js

```js
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

# File: static\js\env\envManager.js

```js
/**
 * env/envManager.js
 * Left slide-out panel with three mutually-exclusive views, each opened from
 * the "ENVIRONMENT" topbar dropdown (see env/envTopbarMenu.js):
 *
 *   - "current" : switch between the global default env, a named global env,
 *                 or a project-local `.jupy_env`, plus details about whatever
 *                 is currently active.
 *   - "create"  : create a new named global env.
 *   - "pip"     : manage packages (search/install/uninstall) in the active env.
 *
 * Only one view is ever shown at a time. Calling openView(view) while a
 * *different* view is already open swaps to the new one (the old one is
 * cancelled, not stacked). Calling openView(view) again for the view that's
 * already open closes the whole panel — a simple toggle.
 */
export function setupEnvManager({
  panel, closeBtn, titleEl,
  views, // { current: HTMLElement, create: HTMLElement, pip: HTMLElement }
  modeRadios, namedSelect, createInput, createBtn, applyBtn, statusLine,
  jupyVersionEl, pythonVersionEl, pathEl, platformEl, packageCountEl,
  statusLabelEl,
  listEl, searchInput, installInput, installBtn,
  createStatusLine, existingEnvsEl, pipStatusLine,
  showToast, onResize, onEnvSwitched,
}) {
  let current = null;
  let globalEnvs = [];
  let packages = [];
  let loaded = false;
  let busy = false;
  let activeView = null;

  const VIEW_LABELS = {
    current: '📦 CURRENT ENVIRONMENT',
    create: '➕ CREATE ENVIRONMENT',
    pip: '📦 PIP MANAGER',
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

  /** Shows exactly one of the three views, hiding the other two. */
  function showView(view) {
    Object.entries(views).forEach(([key, el]) => {
      if (el) el.hidden = key !== view;
    });
    activeView = view;
    if (titleEl) titleEl.textContent = VIEW_LABELS[view] || '📦 ENVIRONMENT';
  }

  /**
   * Opens the given view. If that same view is already open, this instead
   * closes the panel (toggle). If a *different* view is open, it is
   * cancelled/replaced by the requested one — only one view is ever visible.
   */
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

  return { openView, close, refreshStatus: refreshEnvInfo };
}
```


---

# File: static\js\env\envTopbarMenu.js

```js
/**
 * env/envTopbarMenu.js
 * "ENVIRONMENT" topbar dropdown, next to RUNTIME. Each item opens a
 * different view inside the left env-manager-panel (see env/envManager.js).
 * Only one view is ever visible at a time — clicking an item while a
 * *different* view is open cancels/replaces it; clicking the item for the
 * view that's already open closes the panel.
 */
import { createDropdown } from '../core/dropdownMenu.js';

export function initEnvTopbarMenu({ menu, trigger, dropdown, envManager }) {
  const { bind } = createDropdown({ menu, trigger, dropdown });

  bind('envmenu-current', () => envManager.openView('current'));
  bind('envmenu-create', () => envManager.openView('create'));
  bind('envmenu-pip', () => envManager.openView('pip'));
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
      document.activeElement?.blur();
      const next = cells[idx + 1];
      enterEditMode(next.id);
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

    if (runningCellId === id) {
      showToast('⚠️ CELL ALREADY RUNNING', 'warning');
      // Advance focus to the next cell even though we're not re-running it —
      // matches the "queued" branch below. Without this, Shift+Enter on a
      // cell that is itself still executing (a loop, sleep(), waiting on
      // stdin, or just enough websocket latency to notice) leaves the
      // selection stuck instead of moving down, which is the one case that
      // looked like "Shift+Enter sometimes doesn't advance."
      if (advance) advanceSelectionAfter(idx);
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
    restartAndRunAll,
    restartAndRunToSelected,
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

# File: static\js\runtime\aboutDialog.js

```js
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

# File: static\js\runtime\runtimeMenu.js

```js
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
    // Keydowns originating inside a CodeMirror editor are fully owned by that
    // editor's own extraKeys (see cells/cellFactory.js). Cell state can change
    // synchronously mid-event (Shift-Enter advances selection), so re-checking
    // state here for the same event is unreliable and caused Shift-Enter to
    // run both the old cell and the newly-selected one. Always bail instead.
    if (e.target.closest && e.target.closest('.CodeMirror')) {
      return;
    }

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

