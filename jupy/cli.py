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
    parser.add_argument("--port", type=int, default=8000, help="Port to run server on (default: 8000)")
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
