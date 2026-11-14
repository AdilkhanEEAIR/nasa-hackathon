"""Local static server for EarthSonar development: like `python -m http.server`, but with
caching disabled (edited JS modules always reload) and HTTP Range support (browsers need it
to seek in the lightning video; production hosting supports it too).

    python tools/dev_server.py 8765
"""
import os
import re
import sys
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class DevHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", rng or "")
        if not m or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2)))
        end = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
        if start >= size:
            self.send_error(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            return None
        end = min(end, size - 1)
        f = open(path, "rb")
        f.seek(start)
        self.send_response(HTTPStatus.PARTIAL_CONTENT)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        try:
            while remaining > 0:
                chunk = source.read(min(65536, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (ConnectionResetError, BrokenPipeError):
            pass  # the browser cancels range requests freely while seeking
        finally:
            self._remaining = None


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = Path(__file__).resolve().parents[1]
    handler = partial(DevHandler, directory=str(root))
    print(f"Serving {root} at http://localhost:{port} (no-store, ranges)")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
