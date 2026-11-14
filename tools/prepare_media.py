"""Prepare web-ready media for EarthSonar from the raw NASA SVS downloads.

Reads   datasets/   (raw SVS files, not in git)
Writes  media/      (committed, every file < 50 MB)

Every number used here (frame indices, crop boxes, longitude offset) was measured from the
frames and is documented in docs/DATA_NOTES.md. Run from the repository root:

    python tools/prepare_media.py            # everything
    python tools/prepare_media.py --only nightlights aerosols

Requires ffmpeg/ffprobe on PATH, numpy and Pillow.
"""
from __future__ import annotations

import argparse
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
OUT = ROOT / "media"

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


def run(cmd: list[str]) -> bytes:
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0:
        sys.exit(f"Command failed: {' '.join(cmd)}\n{res.stderr.decode(errors='replace')}")
    return res.stdout


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


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)}  {path.stat().st_size / 1e6:.2f} MB")


def land_mask_from(world: np.ndarray) -> Image.Image:
    """Ocean is near-black and bluish in the night-lights base map; everything else is land."""
    r, g, b = (world[..., i].astype(np.int16) for i in range(3))
    mx = world.max(axis=2)
    ocean = (mx <= 4) & (b >= r) & (b >= g)
    land = Image.fromarray(np.where(ocean, 0, 255).astype(np.uint8))
    land = land.filter(ImageFilter.ModeFilter(5))
    land = land.resize((WEB_W, WEB_H), Image.BOX)
    return land.point(lambda v: 255 if v >= 128 else 0)


def nightlights(manifest: dict) -> None:
    print("Night lights")
    frames = read_frames(NL_VIDEO, list(NL_YEAR_FRAMES.values()) + [NL_CHANGE_FRAME], NL_W, NL_H)
    years = {}
    for year, idx in NL_YEAR_FRAMES.items():
        world = clean_world(frames[idx])
        path = OUT / "nightlights" / f"year_{year}.png"
        save_png(to_web(world), path)
        years[str(year)] = {"file": f"media/nightlights/year_{year}.png", "sourceFrame": idx,
                            "sourceTime": round(idx / 30, 3)}
        if year == 2012:
            save_png(land_mask_from(world), OUT / "masks" / "land.png")
    change = clean_world(frames[NL_CHANGE_FRAME])
    save_png(to_web(change), OUT / "nightlights" / "change_2012_2023.png")

    # Background video for sighted viewers: same crop, patch and roll, re-encoded to H.264 so
    # it plays in every browser (the source is HEVC).
    out = OUT / "nightlights" / "nightlights_1080p_h264.mp4"
    fc = (f"[0:v]split[a][b];[a]crop={COPY_W}:{NL_H}:0:0[m];"
          f"[b]crop={PATCH_X1 - PATCH_X0}:{PATCH_Y1 - PATCH_Y0}:{COPY_W + PATCH_X0}:{PATCH_Y0}[p];"
          f"[m][p]overlay={PATCH_X0}:{PATCH_Y0},split[c][d];"
          f"[c]crop={NL_ROLL_PX}:{NL_H}:{COPY_W - NL_ROLL_PX}:0[r];"
          f"[d]crop={COPY_W - NL_ROLL_PX}:{NL_H}:0:0[l];"
          f"[r][l]hstack,scale={WEB_W}:{WEB_H}:flags=area[v]")
    run(["ffmpeg", "-v", "error", "-y", "-i", str(NL_VIDEO), "-filter_complex", fc, "-map", "[v]",
         "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", "-an", str(out)])
    print(f"  {out.relative_to(ROOT)}  {out.stat().st_size / 1e6:.2f} MB")

    manifest["nightlights"] = {
        "source": "NASA SVS 5313", "lon0": -180, "width": WEB_W, "height": WEB_H,
        "years": years,
        "change": {"file": "media/nightlights/change_2012_2023.png",
                   "sourceFrame": NL_CHANGE_FRAME, "sourceTime": round(NL_CHANGE_FRAME / 30, 3)},
        "video": "media/nightlights/nightlights_1080p_h264.mp4",
    }
    manifest["landMask"] = {"file": "media/masks/land.png", "lon0": -180,
                            "width": WEB_W, "height": WEB_H,
                            "derivedFrom": "night-lights base map, 2012 frame"}


def aerosols(manifest: dict) -> None:
    print("Aerosols")
    img = Image.open(AE_IMAGE).convert("RGB")
    save_png(img.resize((WEB_W, WEB_H), Image.BOX), OUT / "aerosols" / "aerosols_2025-08-19T20.png")
    dst = OUT / "aerosols" / "legend.png"
    shutil.copyfile(AE_LEGEND, dst)
    print(f"  {dst.relative_to(ROOT)}  {dst.stat().st_size / 1e6:.2f} MB")
    manifest["aerosols"] = {
        "source": "NASA SVS 5669", "lon0": -180, "width": WEB_W, "height": WEB_H,
        "file": "media/aerosols/aerosols_2025-08-19T20.png", "legend": "media/aerosols/legend.png",
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
    out = OUT / "lightning" / "lightning_2048x1024_30p.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    # Halving to 30 fps keeps every second source frame; GOP of 30 frames keeps seeking quick.
    run(["ffmpeg", "-v", "error", "-y", "-i", str(LT_VIDEO),
         "-vf", "fps=30,scale=2048:1024:flags=area",
         "-c:v", "libx264", "-crf", "25", "-preset", "slow", "-g", "30", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", "-an", str(out)])
    print(f"  {out.relative_to(ROOT)}  {out.stat().st_size / 1e6:.2f} MB")
    probe = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets",
                            "-show_entries", "stream=nb_read_packets", "-of", "json", str(out)]))
    n_out = int(probe["streams"][0]["nb_read_packets"])
    src = lightning_dates()
    dates = [src[min(2 * i, len(src) - 1)] for i in range(n_out)]
    dpath = OUT / "lightning" / "dates.json"
    dpath.write_text(json.dumps({"fps": 30, "dates": dates}, separators=(",", ":")))
    print(f"  {dpath.relative_to(ROOT)}  {n_out} frames, {dates[0]} .. {dates[-1]}")
    manifest["lightning"] = {
        "source": "NASA SVS 5011", "lon0": -180, "width": 2048, "height": 1024,
        "video": "media/lightning/lightning_2048x1024_30p.mp4", "dates": "media/lightning/dates.json",
        "frames": n_out, "fps": 30, "coverageLat": [-52, 52],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--only", nargs="*", choices=["nightlights", "aerosols", "lightning"])
    args = ap.parse_args()
    steps = args.only or ["nightlights", "aerosols", "lightning"]

    mpath = OUT / "manifest.json"
    manifest = json.loads(mpath.read_text()) if mpath.exists() else {}
    for step in steps:
        {"nightlights": nightlights, "aerosols": aerosols, "lightning": lightning}[step](manifest)
    OUT.mkdir(exist_ok=True)
    mpath.write_text(json.dumps(manifest, indent=2))

    too_big = [p for p in OUT.rglob("*") if p.is_file() and p.stat().st_size >= MAX_BYTES]
    if too_big:
        sys.exit("Files over 50 MB: " + ", ".join(str(p) for p in too_big))
    total = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(f"OK: all media files < 50 MB, total {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
