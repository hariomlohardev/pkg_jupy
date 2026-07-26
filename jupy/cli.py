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