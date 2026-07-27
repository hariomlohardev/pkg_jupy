#!/usr/bin/env python3
"""
Jupy CLI
========

Full command-line interface for Jupy.

Examples:
    jupy
    jupy serve --port 8000
    jupy doctor --full
    jupy env list
    jupy env create datasci
    jupy env use named datasci
    jupy pip list
    jupy pip install numpy
    jupy run notebook.ipynb --output executed.ipynb
    jupy export notebook.ipynb --format html
    jupy new my_notebook
    jupy init --sample
    jupy combine --output files.md
"""

import argparse
import html
import json
import os
import socket
import socketserver
import subprocess
import sys
import traceback
import webbrowser
from datetime import datetime
from pathlib import Path


# ---------------------------------------------------------------------------
# Version helper
# ---------------------------------------------------------------------------
def _get_version():
    try:
        from jupy import __version__
        return __version__
    except Exception:
        return "0.1.0"


# ---------------------------------------------------------------------------
# Server helper
# ---------------------------------------------------------------------------
class ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def _ensure_psutil():
    """
    Ensure psutil exists in the interpreter running the Jupy server.
    This is used by the metrics footer.
    """
    try:
        import psutil  # noqa: F401
        return True
    except ImportError:
        print("[Jupy] psutil not found. Installing...", flush=True)
        try:
            proc = subprocess.run(
                [sys.executable, "-m", "pip", "install", "psutil"],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if proc.returncode == 0:
                print("[Jupy] psutil installed successfully.", flush=True)
                return True
            print("[Jupy] Failed to install psutil:", proc.stderr, flush=True)
        except subprocess.TimeoutExpired:
            print("[Jupy] pip install psutil timed out.", flush=True)
        except Exception as e:
            print(f"[Jupy] Error installing psutil: {e}", flush=True)
        return False


def _port_free(host, port):
    bind_host = host or "0.0.0.0"
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((bind_host, int(port)))
            return True
    except OSError:
        return False


def _print_server_banner(url, cwd):
    print("", flush=True)
    print("  ┌───────────────────────────────────────────────────┐", flush=True)
    print("  │  JUPY LOCAL NOTEBOOK SERVER                       │", flush=True)
    print(f"  │  URL: {url:<43} │", flush=True)
    print(f"  │  DIR: {str(cwd)[:43]:<43} │", flush=True)
    print("  └───────────────────────────────────────────────────┘", flush=True)
    print("", flush=True)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _env_info_public(info):
    return {
        "mode": info.get("mode"),
        "name": info.get("name"),
        "path": info.get("path"),
        "python": info.get("python"),
        "bin": info.get("bin"),
        "label": info.get("label"),
    }


def _join_text(value):
    if isinstance(value, list):
        return "".join(value)
    return value or ""


def _starter_notebook(source):
    return {
        "cells": [
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": source.splitlines(keepends=True),
            }
        ],
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3 (Jupy)",
                "language": "python",
                "name": "python3",
            },
            "language_info": {
                "name": "python",
                "pygments_lexer": "ipython3",
            },
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


# ---------------------------------------------------------------------------
# Notebook loading / exporting helpers
# ---------------------------------------------------------------------------
def _load_ipynb(path):
    p = Path(path).expanduser().resolve()
    if not p.exists():
        raise FileNotFoundError(f"Notebook not found: {p}")

    raw = json.loads(p.read_text(encoding="utf-8"))
    cells = []

    for c in raw.get("cells", []):
        cell_type = c.get("cell_type", "code")
        source = _join_text(c.get("source", ""))
        outputs = []

        for o in c.get("outputs", []):
            otype = o.get("output_type")

            if otype == "stream":
                outputs.append({
                    "kind": "stdout" if o.get("name") == "stdout" else "stderr",
                    "text": _join_text(o.get("text", "")),
                })

            elif otype in ("display_data", "execute_result"):
                data = o.get("data", {})
                outputs.append({
                    "kind": "display",
                    "data": {k: _join_text(v) for k, v in data.items()},
                })

            elif otype == "error":
                outputs.append({
                    "kind": "stderr",
                    "text": "\n".join(o.get("traceback", [])),
                })

        cells.append({
            "type": cell_type,
            "source": source,
            "outputs": outputs,
        })

    return {"cells": cells}


def _export_to_py(nb):
    chunks = []
    for cell in nb.get("cells", []):
        if cell.get("type") == "code":
            chunks.append(cell.get("source", ""))
    return "\n\n".join(chunks)


def _export_to_md(nb):
    chunks = []
    for cell in nb.get("cells", []):
        if cell.get("type") == "markdown":
            chunks.append(cell.get("source", ""))
        elif cell.get("type") == "code":
            chunks.append("```python\n" + cell.get("source", "") + "\n```")
    return "\n\n".join(chunks)


def _export_to_html(nb, for_pdf=False):
    parts = []

    parts.append("""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Exported Notebook</title>
<style>
body { font-family: sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; }
.cell { margin: 20px 0; border-left: 3px solid #ccc; padding-left: 15px; }
.cell-code { background: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; }
.cell-output { background: #fff; padding: 10px; border: 1px solid #ddd; margin-top: 5px; }
.cell-markdown { font-family: sans-serif; }
img { max-width: 100%; }
</style>
""")

    if for_pdf:
        parts.append("""
<script>
window.addEventListener("load", () => {
  setTimeout(() => window.print(), 400);
});
</script>
""")

    parts.append("</head><body>")

    for cell in nb.get("cells", []):
        cell_type = cell.get("type", "code")
        source = cell.get("source", "")
        outputs = cell.get("outputs", [])

        if cell_type == "markdown":
            safe_md = source.replace("</script>", "<\\/script>")
            parts.append(
                '<div class="cell cell-markdown">'
                f'<script type="text/markdown">{safe_md}</script>'
                "</div>"
            )
        else:
            parts.append(f'<div class="cell cell-code"><pre>{html.escape(source)}</pre>')

            for out in outputs:
                kind = out.get("kind")

                if kind in ("stdout", "stderr"):
                    style = ' style="color:red;"' if kind == "stderr" else ""
                    parts.append(
                        f'<div class="cell-output"{style}>{html.escape(out.get("text", ""))}</div>'
                    )

                elif kind == "display":
                    data = out.get("data", {})

                    if "image/png" in data:
                        parts.append(
                            f'<div class="cell-output"><img src="data:image/png;base64,{data["image/png"]}" /></div>'
                        )
                    elif "text/html" in data:
                        parts.append(f'<div class="cell-output">{data["text/html"]}</div>')
                    elif "text/plain" in data:
                        parts.append(
                            f'<div class="cell-output">{html.escape(data["text/plain"])}</div>'
                        )

            parts.append("</div>")

    parts.append("""
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script>
document.querySelectorAll('.cell-markdown script[type="text/markdown"]').forEach(el => {
  const div = document.createElement('div');
  div.innerHTML = window.marked ? marked.parse(el.textContent) : el.textContent;
  el.replaceWith(div);
});
</script>
</body></html>
""")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Command: serve
# ---------------------------------------------------------------------------
def cmd_serve(args):
    if args.dir:
        target = Path(args.dir).expanduser().resolve()
        if not target.is_dir():
            print(f"[Jupy] Directory not found: {target}", file=sys.stderr)
            return 2
        os.chdir(target)

    if not _ensure_psutil():
        print("[Jupy] psutil is required for the server metrics footer.", file=sys.stderr)
        return 1

    # Import late so non-server commands stay fast.
    from jupy.server.handlers import JupyHTTPHandler

    if not args.force and not _port_free(args.host, args.port):
        print(
            f"[Jupy] Port {args.port} is already in use. "
            f"Use --port <other> or stop the other process.",
            file=sys.stderr,
        )
        return 1

    display_host = "localhost" if args.host in ("", "0.0.0.0") else args.host
    url = f"http://{display_host}:{args.port}"

    _print_server_banner(url, os.getcwd())

    if not args.no_browser:
        webbrowser.open(url)

    try:
        with ThreadingServer((args.host, args.port), JupyHTTPHandler) as httpd:
            print(f"[Jupy] Server running on {url}", flush=True)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[Jupy] Server stopped.")
        return 0


# ---------------------------------------------------------------------------
# Command: doctor
# ---------------------------------------------------------------------------
def cmd_doctor(args):
    print("Jupy doctor")
    print("===========")
    print(f"Jupy version   : {_get_version()}")
    print(f"Python version : {sys.version.split()[0]}")
    print(f"Executable     : {sys.executable}")
    print(f"Platform       : {sys.platform}")
    print(f"Current folder : {os.getcwd()}")

    static_dir = Path(__file__).resolve().parent / "static"
    print(f"Static folder  : {static_dir} ({'OK' if static_dir.is_dir() else 'MISSING'})")

    try:
        import psutil
        print(f"psutil         : {getattr(psutil, '__version__', 'installed')}")
    except Exception:
        print("psutil         : MISSING  -> python -m pip install psutil")

    if sys.platform == "win32":
        try:
            import winpty  # noqa: F401
            print("pywinpty       : OK")
        except Exception:
            print("pywinpty       : MISSING  -> python -m pip install pywinpty")
    else:
        print("PTY support    : built-in Unix PTY")

    try:
        from jupy.core import envmanager
        print(f"Data directory : {envmanager.get_data_dir()}")
        print(f"Envs root      : {envmanager.get_envs_root()}")
        print(f"Project config : {json.dumps(envmanager.load_project_config())}")
    except Exception as e:
        print(f"Env manager    : ERROR -> {e}")

    if args.full:
        try:
            from jupy.core import envmanager
            info = envmanager.resolve_active_env(
                on_progress=lambda m: print(m, flush=True)
            )
            print("\nActive environment:")
            print(json.dumps(_env_info_public(info), indent=2))
        except Exception as e:
            print(f"\nActive environment check failed: {e}")

    return 0


# ---------------------------------------------------------------------------
# Command: env
# ---------------------------------------------------------------------------
def cmd_env(args):
    from jupy.core import envmanager

    if args.env_cmd == "list":
        cfg = envmanager.load_project_config()
        print("Current folder config:")
        print(json.dumps(cfg, indent=2))
        print("\nGlobal environments:")
        for name in envmanager.list_global_envs():
            print(f" - {name}")
        return 0

    if args.env_cmd == "create":
        envmanager.ensure_env(
            envmanager.get_global_env_path(args.name),
            on_progress=lambda m: print(m, flush=True),
        )
        print(f"Environment '{args.name}' is ready.")
        return 0

    if args.env_cmd == "delete":
        ok, err = envmanager.delete_global_env(args.name)
        if not ok:
            print(err, file=sys.stderr)
            return 1
        print(f"Deleted environment '{args.name}'.")
        return 0

    if args.env_cmd == "use":
        mode = args.mode
        name = args.name

        if mode == "named" and not name:
            print("Usage: jupy env use named <name>", file=sys.stderr)
            return 2

        info = envmanager.set_active_env(
            mode,
            name,
            on_progress=lambda m: print(m, flush=True),
        )
        print("Active environment:")
        print(json.dumps(_env_info_public(info), indent=2))
        return 0

    if args.env_cmd in ("info", "path"):
        info = envmanager.resolve_active_env(
            on_progress=lambda m: print(m, flush=True)
        )

        if args.env_cmd == "path":
            print(info["path"])
        else:
            print(json.dumps(_env_info_public(info), indent=2))
        return 0

    print("Unknown env command.", file=sys.stderr)
    return 2


# ---------------------------------------------------------------------------
# Command: pip
# ---------------------------------------------------------------------------
def cmd_pip(args):
    from jupy.core import envmanager
    from jupy.core.venv import install_package, list_packages, uninstall_package

    info = envmanager.resolve_active_env(
        on_progress=lambda m: print(m, flush=True)
    )
    python = info["python"]

    print(f"Environment: {info.get('label')}")
    print(f"Python: {python}")
    print("")

    if args.pip_cmd == "list":
        pkgs = list_packages(python)
        if not pkgs:
            print("No packages found.")
            return 0

        width = max(len(p["name"]) for p in pkgs)
        for p in pkgs:
            print(f"{p['name']:<{width}}  {p['version']}")
        return 0

    if args.pip_cmd == "install":
        ok, output = install_package(python, args.spec)
        print(output)
        return 0 if ok else 1

    if args.pip_cmd == "uninstall":
        ok, output = uninstall_package(python, args.name)
        print(output)
        return 0 if ok else 1

    print("Unknown pip command.", file=sys.stderr)
    return 2


# ---------------------------------------------------------------------------
# Command: run
# ---------------------------------------------------------------------------
def cmd_run(args):
    from jupy.run_notebook import run_notebook
    run_notebook(args.notebook, args.output)
    return 0


# ---------------------------------------------------------------------------
# Command: export
# ---------------------------------------------------------------------------
def cmd_export(args):
    nb_path = Path(args.notebook).expanduser().resolve()
    nb = _load_ipynb(nb_path)

    fmt = args.format.lower()

    if fmt == "py":
        text = _export_to_py(nb)
        ext = ".py"
    elif fmt == "md":
        text = _export_to_md(nb)
        ext = ".md"
    elif fmt == "pdf":
        text = _export_to_html(nb, for_pdf=True)
        ext = ".print.html"
    else:
        text = _export_to_html(nb, for_pdf=False)
        ext = ".html"

    if args.output:
        out = Path(args.output).expanduser().resolve()
    else:
        out = nb_path.with_suffix(ext)

    out.write_text(text, encoding="utf-8")
    print(f"Exported: {out}")

    if fmt == "pdf":
        print("Open this HTML file in a browser and use Print -> Save as PDF.")

    return 0


# ---------------------------------------------------------------------------
# Command: new
# ---------------------------------------------------------------------------
def cmd_new(args):
    path = Path(args.name).expanduser()
    if path.suffix != ".ipynb":
        path = path.with_suffix(".ipynb")

    if path.exists() and not args.force:
        print(f"File already exists: {path}. Use --force to overwrite.", file=sys.stderr)
        return 1

    nb = _starter_notebook(
        "# Jupy notebook\n"
        "print('Welcome to Jupy!')\n"
    )

    path.write_text(json.dumps(nb, indent=2), encoding="utf-8")
    print(f"Created notebook: {path}")
    return 0


# ---------------------------------------------------------------------------
# Command: init
# ---------------------------------------------------------------------------
def cmd_init(args):
    base = Path(args.path).expanduser().resolve()
    base.mkdir(parents=True, exist_ok=True)

    cfg_dir = base / ".jupy"
    cfg_dir.mkdir(exist_ok=True)

    cfg_file = cfg_dir / "config.json"
    cfg = {
        "env_mode": "global",
        "env_name": "default",
    }

    if cfg_file.exists() and not args.force:
        print(f"Config already exists: {cfg_file}")
    else:
        cfg_file.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        print(f"Created config: {cfg_file}")

    gitignore = base / ".gitignore"
    wanted = [
        ".jupy_env/",
        ".jupy/checkpoints/",
        "__pycache__/",
        "*.pyc",
    ]

    existing = []
    if gitignore.exists():
        existing = gitignore.read_text(encoding="utf-8").splitlines()

    missing = [line for line in wanted if line not in existing]
    if missing:
        with gitignore.open("a", encoding="utf-8") as f:
            f.write("\n".join(missing) + "\n")
        print(f"Updated: {gitignore}")
    else:
        print(f".gitignore already OK: {gitignore}")

    if args.sample:
        sample = base / "hello_jupy.ipynb"
        if sample.exists() and not args.force:
            print(f"Sample notebook already exists: {sample}")
        else:
            sample.write_text(
                json.dumps(
                    _starter_notebook("# Hello Jupy\nprint('Hello from Jupy')"),
                    indent=2,
                ),
                encoding="utf-8",
            )
            print(f"Created sample notebook: {sample}")

    return 0


# ---------------------------------------------------------------------------
# Command: combine
# ---------------------------------------------------------------------------
def cmd_combine(args):
    root = Path(args.path).expanduser().resolve()
    out = root / args.output

    default_ignore = {
        ".git",
        ".vscode",
        ".venv",
        "venv",
        "__pycache__",
        "node_modules",
        ".jupy_env",
        ".jupy",
    }

    exclude_abs = {str((root / p).resolve()) for p in (args.exclude or [])}
    files = []

    for r, dirs, filenames in os.walk(root):
        dirs[:] = [
            d for d in dirs
            if d not in default_ignore
            and str(Path(r, d).resolve()) not in exclude_abs
        ]

        for f in filenames:
            fp = Path(r) / f
            if fp.resolve() == out.resolve():
                continue
            if str(fp.resolve()) in exclude_abs:
                continue
            files.append(fp)

    files.sort(key=lambda p: str(p.relative_to(root)).lower())

    with out.open("w", encoding="utf-8") as outfile:
        outfile.write("---\n")
        outfile.write("title: Folder Code Compilation\n")
        outfile.write(f"date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        outfile.write(f"root_folder: \"{root.name}\"\n")
        outfile.write(f"total_compiled_files: {len(files)}\n")
        outfile.write("---\n\n")

        for fp in files:
            rel = fp.relative_to(root).as_posix()
            ext = fp.suffix.lstrip(".")

            outfile.write(f"# File: {rel}\n\n")
            outfile.write(f"```{ext}\n")

            try:
                with fp.open("r", encoding="utf-8", errors="replace") as infile:
                    outfile.write(infile.read())
            except Exception as e:
                outfile.write(f"*Error reading file: {e}*")

            outfile.write("\n```\n\n---\n\n")

    print(f"Created {out} with {len(files)} files.")
    return 0


# ---------------------------------------------------------------------------
# Command: config
# ---------------------------------------------------------------------------
def cmd_config(args):
    from jupy.core import envmanager

    cwd = args.path or os.getcwd()

    if args.config_cmd == "show":
        cfg = envmanager.load_project_config(cwd)
        print(json.dumps(cfg, indent=2))
        return 0

    if args.config_cmd == "set":
        cfg = envmanager.load_project_config(cwd)

        if args.key == "env_mode" and args.value not in ("global", "project", "named"):
            print("env_mode must be one of: global, project, named", file=sys.stderr)
            return 2

        cfg[args.key] = args.value
        envmanager.save_project_config(cfg, cwd)

        print("Updated config:")
        print(json.dumps(cfg, indent=2))
        return 0

    print("Unknown config command.", file=sys.stderr)
    return 2


# ---------------------------------------------------------------------------
# Command: status
# ---------------------------------------------------------------------------
def cmd_status(args):
    from jupy.core import envmanager

    info = envmanager.resolve_active_env(on_progress=lambda m: None)

    payload = {
        "jupy": _get_version(),
        "python": sys.version.split()[0],
        "executable": sys.executable,
        "platform": sys.platform,
        "cwd": os.getcwd(),
        "data_dir": envmanager.get_data_dir(),
        "env": _env_info_public(info),
    }

    print(json.dumps(payload, indent=2))
    return 0


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------
COMMANDS = {
    "serve",
    "doctor",
    "env",
    "pip",
    "run",
    "export",
    "new",
    "init",
    "combine",
    "config",
    "status",
}


def build_parser():
    parser = argparse.ArgumentParser(
        prog="jupy",
        description="Jupy - Brutalist Local Python Notebook",
    )

    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {_get_version()}",
    )

    sub = parser.add_subparsers(dest="command", metavar="command")

    # ---------------- serve ----------------
    p_serve = sub.add_parser("serve", help="Start the notebook server")
    p_serve.add_argument("--port", type=int, default=8000, help="Port to run server on")
    p_serve.add_argument("--host", default="127.0.0.1", help="Host/bind address")
    p_serve.add_argument("--no-browser", action="store_true", help="Do not open browser")
    p_serve.add_argument("--dir", default=None, help="Directory to serve")
    p_serve.add_argument("--force", action="store_true", help="Skip port pre-check")
    p_serve.set_defaults(func=cmd_serve)

    # ---------------- doctor ----------------
    p_doctor = sub.add_parser("doctor", help="Check installation and environment health")
    p_doctor.add_argument("--full", action="store_true", help="Also resolve active environment")
    p_doctor.set_defaults(func=cmd_doctor)

    # ---------------- env ----------------
    p_env = sub.add_parser("env", help="Manage Jupy environments")
    env_sub = p_env.add_subparsers(dest="env_cmd", required=True)

    env_sub.add_parser("list", help="List environments")

    p_env_create = env_sub.add_parser("create", help="Create a global environment")
    p_env_create.add_argument("name")

    p_env_delete = env_sub.add_parser("delete", help="Delete a global environment")
    p_env_delete.add_argument("name")

    p_env_use = env_sub.add_parser("use", help="Set active environment mode")
    p_env_use.add_argument("mode", choices=["global", "project", "named"])
    p_env_use.add_argument("name", nargs="?", default=None)

    env_sub.add_parser("info", help="Show active environment info")
    env_sub.add_parser("path", help="Print active environment path")

    p_env.set_defaults(func=cmd_env)

    # ---------------- pip ----------------
    p_pip = sub.add_parser("pip", help="Manage packages in active environment")
    pip_sub = p_pip.add_subparsers(dest="pip_cmd", required=True)

    pip_sub.add_parser("list", help="List installed packages")

    p_pip_install = pip_sub.add_parser("install", help="Install package")
    p_pip_install.add_argument("spec", help="Package spec, e.g. numpy or requests==2.32.0")

    p_pip_uninstall = pip_sub.add_parser("uninstall", help="Uninstall package")
    p_pip_uninstall.add_argument("name")

    p_pip.set_defaults(func=cmd_pip)

    # ---------------- run ----------------
    p_run = sub.add_parser("run", help="Execute a notebook headlessly")
    p_run.add_argument("notebook")
    p_run.add_argument("--output", "-o", default=None)
    p_run.set_defaults(func=cmd_run)

    # ---------------- export ----------------
    p_export = sub.add_parser("export", help="Export notebook to HTML/PY/MD/PDF-HTML")
    p_export.add_argument("notebook")
    p_export.add_argument(
        "--format",
        choices=["html", "py", "md", "pdf"],
        default="html",
    )
    p_export.add_argument("--output", "-o", default=None)
    p_export.set_defaults(func=cmd_export)

    # ---------------- new ----------------
    p_new = sub.add_parser("new", help="Create a new notebook")
    p_new.add_argument("name")
    p_new.add_argument("--force", action="store_true")
    p_new.set_defaults(func=cmd_new)

    # ---------------- init ----------------
    p_init = sub.add_parser("init", help="Initialize a folder for Jupy")
    p_init.add_argument("path", nargs="?", default=".")
    p_init.add_argument("--sample", action="store_true", help="Create sample notebook")
    p_init.add_argument("--force", action="store_true")
    p_init.set_defaults(func=cmd_init)

    # ---------------- combine ----------------
    p_combine = sub.add_parser("combine", help="Compile project files into one Markdown file")
    p_combine.add_argument("--path", default=".", help="Root folder")
    p_combine.add_argument("--output", default="files.md")
    p_combine.add_argument("--exclude", nargs="*", default=[])
    p_combine.set_defaults(func=cmd_combine)

    # ---------------- config ----------------
    p_config = sub.add_parser("config", help="Show or set per-folder Jupy config")
    config_sub = p_config.add_subparsers(dest="config_cmd", required=True)

    p_config_show = config_sub.add_parser("show")
    p_config_show.add_argument("--path", default=None)

    p_config_set = config_sub.add_parser("set")
    p_config_set.add_argument("key", choices=["env_mode", "env_name"])
    p_config_set.add_argument("value")
    p_config_set.add_argument("--path", default=None)

    p_config.set_defaults(func=cmd_config)

    # ---------------- status ----------------
    p_status = sub.add_parser("status", help="Show Jupy and environment status")
    p_status.set_defaults(func=cmd_status)

    return parser


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main(argv=None):
    if len(sys.argv) > 1 and sys.argv[1] == 'theme':
        from jupy.core.themes.cli import run_theme_command
        sys.exit(run_theme_command(sys.argv[2:]))
        
    argv = sys.argv[1:] if argv is None else list(argv)

    parser = build_parser()

    # Default behavior:
    #   jupy
    #   jupy --port 9000
    # both start the server.
    
    if not argv:
        argv = ["serve"]
    elif argv[0] not in COMMANDS and argv[0] not in ("-h", "--help", "--version"):
        argv = ["serve"] + argv

    args = parser.parse_args(argv)

    if not getattr(args, "func", None):
        parser.print_help()
        return 0

    try:
        return args.func(args) or 0
    except KeyboardInterrupt:
        print("\n[Jupy] Interrupted.")
        return 130
    except Exception as e:
        print(f"\n[Jupy] ERROR: {e}", file=sys.stderr)
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())