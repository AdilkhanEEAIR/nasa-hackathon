"""Prepare web-ready media for EarthSonar from the raw NASA SVS downloads.

Reads   datasets/   raw SVS files (not in git)
Caches  build/      expensive intermediate encodes (not in git)
Writes  media/      content-hashed files (committed, each < 50 MB, cached "immutable")
        manifest.json  index of everything in media/ (short cache, read first by the site)

Two kinds of output per frame:
  * sound grids - lossless 8-bit PNGs holding the exact values the sonification uses, so
    compression can never change a sound;
  * views       - lossy WebP (with JPEG fallback) for the eyes only.

Every number used here (frame indices, crop boxes, longitude offset, thresholds) was measured
from the frames and is documented in docs/DATA_NOTES.md. Run from the repository root:

    python tools/prepare_media.py

Requires ffmpeg/ffprobe on PATH, numpy and Pillow (with WebP support).
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "datasets"
BUILD = ROOT / "build"
OUT = ROOT / "media"
MANIFEST = ROOT / "manifest.json"

NL_VIDEO = SRC / "nightlights_flat_series_and_change_wZooms_13_EIC_2160p30_h265.mp4"
AE_IMAGE = SRC / "Aerosols_2025-08-19T20_00_00_3840x2160.png"
AE_LEGEND = SRC / "Aerosols_cbar.png"
LT_VIDEO = SRC / "iss_lightning_sos_yearly_07312023_2048p60.mp4"
LT_LABELS = SRC / "lightning_labels.txt"

# --- Night lights geometry (DATA_NOTES section 1) -----------------------------------------
NL_W, NL_H = 7680, 2160
COPY_W = 3840
# Copy 1 starts at about 169.0 W; rolling right by 117 px puts 180 W at x = 0 (residual
# 0.03 deg, well inside the +-0.3 deg fit error) so every map in the app shares lon0 = -180.
NL_ROLL_PX = 117
# The change-map colorbar overlaps copy 1 at its right edge; copy 2 holds the same geography
# there without the overlay.
PATCH_X0, PATCH_X1, PATCH_Y0, PATCH_Y1 = 3760, 3840, 1181, 1291
# Mid-segment frames of the first (inset-free) pass, one per year.
NL_YEAR_FRAMES = {
    2012: 7, 2013: 24, 2014: 42, 2015: 60, 2016: 77, 2017: 95,
    2018: 113, 2019: 130, 2020: 148, 2021: 166, 2022: 184, 2023: 235,
}
NL_CHANGE_FRAME = 400

WEB_W, WEB_H = 1920, 1080
MAX_BYTES = 50 * 1024 * 1024

# Must match js/fields.js (LIGHT_FLOOR) and js/tracks.js (changeClass).
LIGHT_FLOOR = 45


def run(cmd: list[str]) -> bytes:
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0:
        sys.exit(f"Command failed: {' '.join(cmd)}\n{res.stderr.decode(errors='replace')}")
    return res.stdout


def publish(src: Path, sub: str, stem: str) -> str:
    """Copies `src` into media/<sub>/<stem>.<hash><ext>; returns the site-relative path."""
    digest = hashlib.sha256(src.read_bytes()).hexdigest()[:10]
    dst = OUT / sub / f"{stem}.{digest}{src.suffix}"
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    print(f"  {dst.relative_to(ROOT).as_posix():58s} {dst.stat().st_size / 1e6:6.2f} MB")
    return dst.relative_to(ROOT).as_posix()


def tmp(name: str) -> Path:
    p = BUILD / "tmp" / name
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def publish_image(img: Image.Image, sub: str, stem: str, **save) -> str:
    fmt = save.pop("format")
    path = tmp(f"{stem}.{ 'jpg' if fmt == 'JPEG' else fmt.lower() }")
    img.save(path, format=fmt, **save)
    return publish(path, sub, stem)


def publish_view(img: Image.Image, sub: str, stem: str) -> dict:
    """Lossy view for the eyes: WebP plus a JPEG fallback."""
    return {
        "webp": publish_image(img, sub, f"view-{stem}", format="WEBP", quality=82, method=6),
        "jpg": publish_image(img.convert("RGB"), sub, f"view-{stem}", format="JPEG", quality=85, optimize=True, progressive=True),
    }


def read_frames(video: Path, indices: list[int], w: int, h: int) -> dict[int, np.ndarray]:
    """Decode exact frame indices as RGB arrays (one ffmpeg pass)."""
    expr = "+".join(f"eq(n\\,{i})" for i in sorted(indices))
    raw = run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"select={expr}",
               "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
    arr = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)
    if len(arr) != len(indices):
        sys.exit(f"Expected {len(indices)} frames, decoded {len(arr)}")
    return dict(zip(sorted(indices), arr))


def clean_world(frame: np.ndarray) -> np.ndarray:
    """One copy of the world, overlay removed, rolled to start at 180 W."""
    world = frame[:, :COPY_W].copy()
    world[PATCH_Y0:PATCH_Y1, PATCH_X0:PATCH_X1] = \
        frame[PATCH_Y0:PATCH_Y1, COPY_W + PATCH_X0:COPY_W + PATCH_X1]
    return np.roll(world, NL_ROLL_PX, axis=1)


def to_web(arr: np.ndarray) -> Image.Image:
    # Box filter averages instead of picking pixels, so small city lights are dimmed equally
    # in every year rather than randomly dropped.
    return Image.fromarray(arr).resize((WEB_W, WEB_H), Image.BOX)


def light_grid(rgb: np.ndarray) -> np.ndarray:
    """0..255 light level per pixel: identical to lightLevel() in js/fields.js."""
    m = rgb.max(axis=2).astype(np.float64)
    level = np.where(m <= LIGHT_FLOOR, 0.0, np.minimum(1.0, (m - LIGHT_FLOOR) / (255 - LIGHT_FLOOR)))
    return np.round(255 * level).astype(np.uint8)


def change_grid(rgb: np.ndarray) -> np.ndarray:
    """RGB = (more, less, same) levels: identical to changeClass() in js/tracks.js."""
    r, g, b = (rgb[..., i].astype(np.int16) for i in range(3))
    level = light_grid(rgb)
    lit = level > 0
    more = lit & (b > r + 10) & (b > g + 20)
    less = lit & ~more & (r > b + 30) & (g > b + 10)
    same = lit & ~more & ~less
    out = np.zeros(rgb.shape, np.uint8)
    out[..., 0] = np.where(more, level, 0)
    out[..., 1] = np.where(less, level, 0)
    out[..., 2] = np.where(same, level, 0)
    return out


def self_check() -> None:
    """Same test vectors as tests/sound.test.js and tests/tracks.test.js."""
    px = np.array([[[1, 0, 2], [26, 21, 15], [33, 33, 33], [255, 255, 255], [96, 77, 123], [131, 98, 71], [105, 92, 99]]], np.uint8)
    lg = light_grid(px)[0]
    assert lg[0] == lg[1] == lg[2] == 0 and lg[3] == 255, lg
    cg = change_grid(px)[0]
    assert cg[4][0] > 0 and cg[4][1] == 0 and cg[4][2] == 0, cg[4]   # purple -> more
    assert cg[5][1] > 0 and cg[5][0] == 0, cg[5]                      # orange -> less
    assert cg[6][2] > 0 and cg[6][0] == 0 and cg[6][1] == 0, cg[6]   # white  -> same


def land_mask_from(world: np.ndarray) -> Image.Image:
    """Ocean is near-black and bluish in the night-lights base map; everything else is land."""
    r, g, b = (world[..., i].astype(np.int16) for i in range(3))
    mx = world.max(axis=2)
    ocean = (mx <= 4) & (b >= r) & (b >= g)
    land = Image.fromarray(np.where(ocean, 0, 255).astype(np.uint8))
    land = land.filter(ImageFilter.ModeFilter(5))
    land = land.resize((WEB_W, WEB_H), Image.BOX)
    return land.point(lambda v: 255 if v >= 128 else 0).convert("1")


def nightlights(manifest: dict) -> None:
    print("Night lights")
    frames = read_frames(NL_VIDEO, list(NL_YEAR_FRAMES.values()) + [NL_CHANGE_FRAME], NL_W, NL_H)
    years = {}
    for year, idx in NL_YEAR_FRAMES.items():
        world = clean_world(frames[idx])
        web = to_web(world)
        years[str(year)] = {
            "view": publish_view(web, "nl", str(year)),
            # Full source resolution, fetched by the site only when zoomed past 1.5x.
            "viewHi": publish_view(Image.fromarray(world), "nl", f"{year}-hi"),
            "sound": publish_image(Image.fromarray(light_grid(np.asarray(web))), "nl", f"sound-{year}", format="PNG", optimize=True),
            "sourceFrame": idx, "sourceTime": round(idx / 30, 3),
        }
        if year == 2012:
            manifest["landMask"] = {
                "file": publish_image(land_mask_from(world), "masks", "land", format="PNG", optimize=True),
                "lon0": -180, "width": WEB_W, "height": WEB_H,
                "derivedFrom": "night-lights base map, 2012 frame",
            }
    change_world = clean_world(frames[NL_CHANGE_FRAME])
    change = to_web(change_world)
    manifest["nightlights"] = {
        "source": "NASA SVS 5313", "lon0": -180, "width": WEB_W, "height": WEB_H,
        "years": years,
        "change": {
            "view": publish_view(change, "nl", "change"),
            "viewHi": publish_view(Image.fromarray(change_world), "nl", "change-hi"),
            "sound": publish_image(Image.fromarray(change_grid(np.asarray(change))), "nl", "sound-change", format="PNG", optimize=True),
            "channels": ["more", "less", "same"],
            "sourceFrame": NL_CHANGE_FRAME, "sourceTime": round(NL_CHANGE_FRAME / 30, 3),
        },
    }


def aerosols(manifest: dict) -> None:
    print("Aerosols")
    full = Image.open(AE_IMAGE).convert("RGB")
    img = full.resize((WEB_W, WEB_H), Image.BOX)
    manifest["aerosols"] = {
        "source": "NASA SVS 5669", "lon0": -180, "width": WEB_W, "height": WEB_H,
        "view": publish_view(img, "aerosols", "2025-08-19T20"),
        "viewHi": publish_view(full, "aerosols", "2025-08-19T20-hi"),
        # Lossless RGB copy: the aerosol classes are decided from colour in the browser.
        "pixels": publish_image(img, "aerosols", "pixels-2025-08-19T20", format="PNG", optimize=True),
        "legend": publish(AE_LEGEND, "aerosols", "legend"),
        "validTime": "2025-08-19T20:00:00Z",
    }


def lightning_dates() -> list[str]:
    out = []
    for line in LT_LABELS.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        d = datetime.strptime(line, "%d %b %Y %H:%M")
        # The official SOS label file writes every 2023 date as 2003 (it jumps from Dec 2022
        # to Jan 2003); the dataset spans 2017-2023, so these are corrected.
        if d.year == 2003:
            d = d.replace(year=2023)
        out.append(d.strftime("%Y-%m-%d"))
    return out


def lightning(manifest: dict) -> None:
    print("Lightning")
    enc = BUILD / "lightning_2048x1024_30p.mp4"
    if not enc.exists():
        # Halving to 30 fps keeps every second source frame; a GOP of 30 keeps seeking quick.
        run(["ffmpeg", "-v", "error", "-y", "-i", str(LT_VIDEO),
             "-vf", "fps=30,scale=2048:1024:flags=area",
             "-c:v", "libx264", "-crf", "25", "-preset", "slow", "-g", "30", "-pix_fmt", "yuv420p",
             "-movflags", "+faststart", "-an", str(enc)])
    else:
        print(f"  reusing {enc.relative_to(ROOT).as_posix()}")
    probe = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets",
                            "-show_entries", "stream=nb_read_packets", "-of", "json", str(enc)]))
    n_out = int(probe["streams"][0]["nb_read_packets"])
    src = lightning_dates()
    dates = [src[min(2 * i, len(src) - 1)] for i in range(n_out)]
    dpath = tmp("dates.json")
    dpath.write_text(json.dumps({"fps": 30, "dates": dates}, separators=(",", ":")))
    # Poster: a mid-series frame with plenty of lightning, so the player is never a black box.
    poster = tmp("poster.png")
    run(["ffmpeg", "-v", "error", "-y", "-ss", "53", "-i", str(enc), "-frames:v", "1", str(poster)])
    manifest["lightning"] = {
        "source": "NASA SVS 5011", "lon0": -180, "width": 2048, "height": 1024,
        "video": publish(enc, "lightning", "lightning-2048x1024-30p"),
        "poster": publish_image(Image.open(poster).convert("RGB").resize((1024, 512), Image.BOX), "lightning", "poster", format="WEBP", quality=80),
        "dates": publish(dpath, "lightning", "dates"),
        "frames": n_out, "fps": 30, "coverageLat": [-52, 52],
    }


def main() -> None:
    self_check()
    if OUT.exists():
        shutil.rmtree(OUT)  # media/ only ever holds generated, hashed files
    manifest: dict = {"version": 2}
    nightlights(manifest)
    aerosols(manifest)
    lightning(manifest)
    MANIFEST.write_text(json.dumps(manifest, indent=2))
    shutil.rmtree(BUILD / "tmp", ignore_errors=True)

    files = [p for p in OUT.rglob("*") if p.is_file()]
    too_big = [p for p in files if p.stat().st_size >= MAX_BYTES]
    if too_big:
        sys.exit("Files over 50 MB: " + ", ".join(str(p) for p in too_big))
    total = sum(p.stat().st_size for p in files)
    print(f"OK: {len(files)} files, all < 50 MB, total {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
