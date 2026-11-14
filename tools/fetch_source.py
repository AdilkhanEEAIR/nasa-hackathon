"""Safe downloader for EarthSonar source data.

Rules (see docs/DATA_NOTES.md, "Downloads"):
  * https only, and only from allowed hosts (NASA SVS by default; Natural Earth when asked);
    a redirect to any other host aborts the download;
  * only media and text: .mp4 .png .jpg .txt (+ .geojson/.json for Natural Earth);
  * nothing over 400 MB;
  * after download the content must match its extension (file signature, ffprobe for video,
    UTF-8 for text); nothing downloaded is ever executed;
  * every file is logged with URL, size, date and SHA-256 to datasets/downloads.json.

    python tools/fetch_source.py <url> [<url> ...] [--dest datasets/<sub>] [--allow-natural-earth]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT / "datasets" / "downloads.json"
MAX_BYTES = 400 * 1024 * 1024
SVS_HOSTS = {"svs.gsfc.nasa.gov"}
NE_HOSTS = {"naciscdn.org", "www.naturalearthdata.com", "naturalearthdata.com", "raw.githubusercontent.com"}
EXT = {".mp4", ".png", ".jpg", ".txt"}
NE_EXT = {".geojson", ".json"}


class Guard(urllib.request.HTTPRedirectHandler):
    def __init__(self, hosts):
        self.hosts = hosts

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        u = urlparse(newurl)
        if u.scheme != "https" or u.hostname not in self.hosts:
            raise SystemExit(f"Refusing redirect to {newurl}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def check_content(path: Path) -> str:
    head = path.read_bytes()[:16]
    ext = path.suffix.lower()
    if ext == ".png":
        assert head.startswith(b"\x89PNG\r\n\x1a\n"), "not a PNG"
        return "PNG signature OK"
    if ext == ".jpg":
        assert head.startswith(b"\xff\xd8\xff"), "not a JPEG"
        return "JPEG signature OK"
    if ext == ".mp4":
        out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                              "stream=codec_name,width,height,r_frame_rate:format=duration", "-of", "json", str(path)],
                             capture_output=True, text=True)
        assert out.returncode == 0 and '"codec_name"' in out.stdout, "ffprobe found no video stream"
        info = json.loads(out.stdout)
        s = info["streams"][0]
        return f"ffprobe OK: {s['codec_name']} {s['width']}x{s['height']} {s['r_frame_rate']} fps, {float(info['format']['duration']):.1f} s"
    text = path.read_bytes()
    text.decode("utf-8")  # raises if binary
    assert b"<script" not in text.lower() and b"<html" not in text[:512].lower(), "looks like an HTML page"
    if ext in NE_EXT:
        json.loads(text)
        return "valid JSON text"
    return "UTF-8 text OK"


def fetch(url: str, dest: Path, hosts: set, exts: set) -> dict:
    u = urlparse(url)
    if u.scheme != "https" or u.hostname not in hosts:
        raise SystemExit(f"Refusing {url}: only https from {sorted(hosts)}")
    name = Path(u.path).name
    if Path(name).suffix.lower() not in exts:
        raise SystemExit(f"Refusing {name}: allowed types {sorted(exts)}")
    opener = urllib.request.build_opener(Guard(hosts))
    opener.addheaders = [("User-Agent", "EarthSonar-data-fetch/1.0")]
    dest.mkdir(parents=True, exist_ok=True)
    out = dest / name
    tmp = out.with_suffix(out.suffix + ".part")
    sha = hashlib.sha256()
    size = 0
    with opener.open(url, timeout=60) as r:
        final = urlparse(r.geturl())
        if final.hostname not in hosts:
            raise SystemExit(f"Ended on another host: {r.geturl()}")
        declared = int(r.headers.get("Content-Length") or 0)
        if declared > MAX_BYTES:
            raise SystemExit(f"{name} is {declared / 1e6:.0f} MB, over the 400 MB limit")
        with open(tmp, "wb") as f:
            while chunk := r.read(1 << 20):
                size += len(chunk)
                if size > MAX_BYTES:
                    tmp.unlink(missing_ok=True)
                    raise SystemExit(f"{name} exceeded 400 MB")
                sha.update(chunk)
                f.write(chunk)
    tmp.replace(out)
    try:
        verdict = check_content(out)
    except Exception as e:  # noqa: BLE001 - any failure means the file is rejected
        out.unlink(missing_ok=True)
        raise SystemExit(f"{name} rejected: {e}")
    rec = {
        "url": url, "file": out.relative_to(ROOT).as_posix(), "bytes": size,
        "sha256": sha.hexdigest(), "downloaded": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "check": verdict,
    }
    print(f"  {rec['file']}  {size / 1e6:.2f} MB  sha256 {rec['sha256'][:16]}…  {verdict}")
    return rec


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="+")
    ap.add_argument("--dest", default="datasets")
    ap.add_argument("--allow-natural-earth", action="store_true")
    a = ap.parse_args()
    hosts = SVS_HOSTS | (NE_HOSTS if a.allow_natural_earth else set())
    exts = EXT | (NE_EXT if a.allow_natural_earth else set())
    log = json.loads(LOG.read_text()) if LOG.exists() else []
    for url in a.urls:
        rec = fetch(url, ROOT / a.dest, hosts, exts)
        log = [x for x in log if x["file"] != rec["file"]] + [rec]
    LOG.write_text(json.dumps(log, indent=2))


if __name__ == "__main__":
    sys.exit(main())
