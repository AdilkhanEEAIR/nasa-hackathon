"""Local static server for EarthSonar development: like `python -m http.server`, but with
caching disabled, so edited JS modules are always reloaded.

    python tools/dev_server.py 8765
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = Path(__file__).resolve().parents[1]
    handler = partial(NoCacheHandler, directory=str(root))
    print(f"Serving {root} at http://localhost:{port} (no-store)")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
