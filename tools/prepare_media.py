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


# Aerosol legend swatches measured from Aerosols_cbar.png (DATA_NOTES 2.2), in class order.
AEROSOL_CLASSES = ["smoke", "dust", "salt", "sulfate"]   # smoke = "Black Carbon" in the legend
AEROSOL_LEGEND = np.array([[210, 94, 69], [193, 154, 220], [133, 170, 169], [83, 220, 52]], np.float64)
AE_WEAK = 35          # below this max channel nothing is classified (dark background)
AE_LAND_BASE = 62     # brightest grey land relief (Antarctica); subtracted on land
AE_OCEAN_BASE = 35


def aerosol_grid(rgb: np.ndarray, land: np.ndarray) -> np.ndarray:
    """R = amount 0..255 (brightness above the base map), G = class id * 50 (0 = none).

    Class = nearest legend chromaticity. Sea salt is not allowed on land, where the grey
    relief has almost the same chromaticity. Small white dots on land are city lights of the
    base map and are dropped. Overlapping plumes are reported as their dominant type.
    """
    a = rgb.astype(np.float64)
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    chroma = a / (a.sum(axis=2, keepdims=True) + 1e-9)
    leg = AEROSOL_LEGEND / AEROSOL_LEGEND.sum(axis=1, keepdims=True)
    dist = np.linalg.norm(chroma[..., None, :] - leg[None, None], axis=3)
    cls = dist.argmin(axis=2) + 1                                   # 1..4

    base = np.where(land, AE_LAND_BASE, AE_OCEAN_BASE)
    level = np.clip((mx - base) / (255 - base), 0, 1)
    none = (mx < AE_WEAK) | (level <= 0)
    none |= land & (cls == 3)                                      # no sea salt on land

    cand = land & (mn > 150) & ((mx - mn) < 35)                    # white, unsaturated, on land
    k = 7
    pad = np.pad(cand.astype(np.int32), k // 2)
    count = sum(pad[dy:dy + cand.shape[0], dx:dx + cand.shape[1]] for dy in range(k) for dx in range(k))
    none |= cand & (count <= 9)                                    # isolated dots = cities

    out = np.zeros(rgb.shape, np.uint8)
    out[..., 0] = np.where(none, 0, np.round(255 * level)).astype(np.uint8)
    out[..., 1] = np.where(none, 0, cls * 50).astype(np.uint8)
    return out


def aerosol_self_check() -> None:
    sw = np.array([[[210, 94, 69], [193, 154, 220], [133, 170, 169], [83, 220, 52], [4, 15, 4]]], np.uint8)
    sea = np.zeros(sw.shape[:2], bool)
    g = aerosol_grid(sw, sea)[0]
    assert [int(v) // 50 for v in g[:4, 1]] == [1, 2, 3, 4], g
    assert g[4, 0] == 0 and g[4, 1] == 0, g[4]
    grey_land = np.array([[[62, 69, 61], [120, 125, 118]]], np.uint8)
    gl = aerosol_grid(grey_land, np.ones((1, 2), bool))[0]
    assert gl[0, 1] == 0 and gl[1, 1] != 150, gl                     # relief never becomes sea salt


def aerosols(manifest: dict) -> None:
    print("Aerosols")
    aerosol_self_check()
    full = Image.open(AE_IMAGE).convert("RGB")
    img = full.resize((WEB_W, WEB_H), Image.BOX)
    land = np.asarray(Image.open(sorted((OUT / "masks").glob("land.*.png"))[0]).convert("L")) >= 128
    grid = aerosol_grid(np.asarray(img), land)
    shares = {c: float(((grid[..., 1] // 50) == i + 1).mean()) for i, c in enumerate(AEROSOL_CLASSES)}
    print("  class shares of all pixels:", {k: f"{v:.3f}" for k, v in shares.items()})
    manifest["aerosols"] = {
        "source": "NASA SVS 5669", "lon0": -180, "width": WEB_W, "height": WEB_H,
        "view": publish_view(img, "aerosols", "2025-08-19T20"),
        "viewHi": publish_view(full, "aerosols", "2025-08-19T20-hi"),
        "sound": publish_image(Image.fromarray(grid), "aerosols", "sound-2025-08-19T20", format="PNG", optimize=True),
        "classes": AEROSOL_CLASSES,
        "legend": publish(AE_LEGEND, "aerosols", "legend"),
        "validTime": "2025-08-19T20:00:00Z",
    }


OC_FRAME = SRC / "ecco2" / "flat_global_ecco2_2028x1024.25000.jpg"
OC_CBAR = SRC / "ecco2" / "sst_ecco2_cbar.png"
OC_DATES = SRC / "ecco2" / "flat_ecco2_dates.txt"
OC_SAT_MIN, OC_VAL_MIN = 90, 40   # PIL HSV units (0..255): below this a pixel is grey land or a dark gap


def ocean_hue_lut() -> np.ndarray:
    """Temperature (deg C) for every PIL hue 0..255, read from the official colorbar.

    The bar runs 0..32 deg C over x = 14..291 at y = 50. Hue falls monotonically from blue
    (~161) to red; the last few red pixels wrap past 0 to ~250, so hues above 200 are treated
    as negative before matching.
    """
    bar = np.asarray(Image.open(OC_CBAR).convert("RGB").convert("HSV")).astype(np.int32)[50, 14:292]
    hues = np.where(bar[:, 0] > 200, bar[:, 0] - 256, bar[:, 0]).astype(np.float64)
    temps = np.linspace(0, 32, len(hues))
    lut = np.full(256, np.nan)
    for h in range(256):
        hh = h - 256 if h > 200 else h
        if hh < hues.min() - 6 or hh > hues.max() + 6:
            continue  # purple/magenta hues that the scale never uses
        lut[h] = temps[np.abs(hues - hh).argmin()]
    return lut


def ocean_grid(rgb: np.ndarray, lut: np.ndarray) -> np.ndarray:
    """R = flow present (255) or not, G = temperature as 0..255 over 0..32 deg C."""
    hsv = np.asarray(Image.fromarray(rgb).convert("HSV")).astype(np.int32)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    temp = lut[h]
    flow = (s >= OC_SAT_MIN) & (v >= OC_VAL_MIN) & ~np.isnan(temp)
    out = np.zeros(rgb.shape, np.uint8)
    out[..., 0] = np.where(flow, 255, 0)
    out[..., 1] = np.where(flow, np.round(np.nan_to_num(temp) / 32 * 255), 0).astype(np.uint8)
    return out


def ocean_self_check(lut: np.ndarray) -> None:
    bar = np.asarray(Image.open(OC_CBAR).convert("RGB"))[50:51, 14:292]
    g = ocean_grid(bar, lut)[0]
    t = g[:, 1].astype(np.float64) / 255 * 32
    expect = np.linspace(0, 32, len(t))
    err = np.abs(t - expect)[g[:, 0] > 0]
    assert len(err) > 250 and err.max() <= 1.5, f"colorbar round-trip error {err.max():.2f} C"
    grey = np.array([[[60, 60, 60], [5, 5, 8]]], np.uint8)
    assert ocean_grid(grey, lut)[0, :, 0].max() == 0, "grey land / dark gaps must be silent"


def ocean(manifest: dict) -> None:
    print("Ocean temperature")
    lut = ocean_hue_lut()
    ocean_self_check(lut)
    img = Image.open(OC_FRAME).convert("RGB")      # 2048x1024, equirectangular, 180 W at x = 0
    grid = ocean_grid(np.asarray(img), lut)
    cover = (grid[..., 0] > 0).mean()
    print(f"  flow pixels: {cover:.1%} of the frame")
    frame_no = OC_FRAME.name.split(".")[1]
    date = next(l.split()[1] for l in OC_DATES.read_text().splitlines() if l.startswith(frame_no))
    manifest["ocean"] = {
        "source": "NASA SVS 3912", "lon0": -180, "width": img.width, "height": img.height,
        "view": publish_view(img, "ocean", f"ecco2-{frame_no}"),
        "sound": publish_image(Image.fromarray(grid), "ocean", f"sound-ecco2-{frame_no}", format="PNG", optimize=True),
        "legend": publish(OC_CBAR, "ocean", "legend"),
        "validTime": date, "sourceFrame": int(frame_no), "rangeC": [0, 32],
    }


# ---------------------------------------------------------------- near-surface wind (SVS 5148)

WD_DIR = SRC / "svs-5148"
WD_FRAME = WD_DIR / "00000001.png"            # 2048x1024 equirectangular, 180 W at x = 0
WD_CBAR = WD_DIR / "NearSurfaceWindSpeed_colorbar_plain.png"
WD_DATE = "2026-10-29T09:00Z"                  # "29 Oct 2026 05:00:00 EDT" printed on the frame
# Colorbar geometry, measured on the 528x165 file: major ticks every 5 m/s at x = 71.5, 120.5,
# 169.5 ... 463.5 (9.8 px per m/s); colour starts at x = 107 (3.6 m/s, calmer air is left
# transparent so the base map shows through) and ends at x = 462; the bar spans rows 80..108.
WD_X0, WD_PX_PER_MS = 71.5, 9.8
WD_COL0, WD_COL1, WD_ROWS = 107, 462, (80, 109)
WD_TOP = 34.0           # highest speed matched (m/s), see wind_lut
WD_MAX_DIST = 34        # RGB distance to the nearest bar colour that still counts as a reading
WD_MIN_SAT = 28         # max-min channel spread: white/grey land and grey labels are not wind
# Overlays on the frame that are not data. The agency logos are also never shown on our site:
# their area is painted over in the view and marked "no data" in the sound grid.
WD_LOGOS = (0, 0, 360, 80)          # x0, y0, x1, y1
WD_DATEBOX = (0, 920, 515, 1024)
WD_NODATA_FILL = (8, 24, 58)


def wind_lut() -> tuple[np.ndarray, np.ndarray]:
    bar = np.asarray(Image.open(WD_CBAR).convert("RGB")).astype(np.float64)
    cols = bar[WD_ROWS[0]:WD_ROWS[1], WD_COL0:WD_COL1 + 1].mean(axis=0)
    speeds = (np.arange(WD_COL0, WD_COL1 + 1) - WD_X0) / WD_PX_PER_MS
    # The grey hurricane-force end (above 34 m/s) is too close to the dark-purple calm ocean
    # base to tell apart, so it is left out: such winds read as 34 m/s at most (the cap is
    # stated in the README), never the other way round.
    keep = speeds <= WD_TOP
    return cols[keep], speeds[keep]


def wind_speed(rgb: np.ndarray, lut: tuple[np.ndarray, np.ndarray]) -> np.ndarray:
    """Wind speed in m/s per pixel from the nearest colorbar colour; NaN where unreadable."""
    cols, speeds = lut
    flat = rgb.reshape(-1, 3).astype(np.int32)
    packed = (flat[:, 0] << 16) | (flat[:, 1] << 8) | flat[:, 2]
    uniq, inv = np.unique(packed, return_inverse=True)
    u = np.stack([(uniq >> 16) & 255, (uniq >> 8) & 255, uniq & 255], axis=1).astype(np.float64)
    out = np.full(len(uniq), np.nan)
    for i in range(0, len(u), 20000):
        d = np.linalg.norm(u[i:i + 20000, None, :] - cols[None, :, :], axis=2)
        k = d.argmin(axis=1)
        ok = (d[np.arange(len(k)), k] <= WD_MAX_DIST) & ((u[i:i + 20000].max(1) - u[i:i + 20000].min(1)) >= WD_MIN_SAT)
        out[i:i + 20000] = np.where(ok, speeds[k], np.nan)
    return out[inv].reshape(rgb.shape[:2])


def wind_grid(rgb: np.ndarray, lut) -> np.ndarray:
    """R = speed 0..255 over 0..40 m/s (0 = calm or unreadable), G = 255 where a speed was read,
    B = 255 where the frame carries no data (logos, date box)."""
    sp = wind_speed(rgb, lut)
    out = np.zeros(rgb.shape, np.uint8)
    read = ~np.isnan(sp)
    out[..., 0] = np.where(read, np.round(np.clip(np.nan_to_num(sp), 0, 40) / 40 * 255), 0).astype(np.uint8)
    out[..., 1] = np.where(read, 255, 0)
    for x0, y0, x1, y1 in (WD_LOGOS, WD_DATEBOX):
        out[y0:y1, x0:x1] = (0, 0, 255)
    return out


def wind_self_check(lut) -> None:
    cols, speeds = lut
    bar = np.round(cols).astype(np.uint8)[None, :, :]
    got = wind_speed(bar, lut)[0]
    ok = ~np.isnan(got)
    err = np.abs(got - speeds)[ok]
    # The palest start (3.6-5 m/s, lavender) and the grey hurricane-force end (35-40 m/s) are
    # too colourless to tell from land and labels; everything between must read back.
    mid = speeds >= 5
    assert ok[mid].all() and err.max() <= 1.0, f"colorbar round trip: {ok[mid].mean():.0%} of 5-34 m/s read, max error {err.max():.2f} m/s"
    print(f"  colorbar round trip: 5-34 m/s all read, max error {err.max():.2f} m/s")
    probe = np.array([[[235, 235, 235], [120, 120, 120], [20, 15, 40], [3, 3, 8], [52, 29, 60]]], np.uint8)
    assert np.isnan(wind_speed(probe, lut)).all(), "land greys and the dark ocean base must not read as wind"


def wind(manifest: dict) -> None:
    print("Near-surface wind (SVS 5148)")
    lut = wind_lut()
    wind_self_check(lut)
    img = Image.open(WD_FRAME).convert("RGB")
    rgb = np.asarray(img)
    grid = wind_grid(rgb, lut)
    read = (grid[..., 1] > 0).mean()
    print(f"  pixels with a wind reading: {read:.1%}; max {grid[..., 0].max() / 255 * 40:.1f} m/s")
    view = rgb.copy()
    x0, y0, x1, y1 = WD_LOGOS
    view[y0:y1, x0:x1] = WD_NODATA_FILL
    manifest["wind"] = {
        "source": "NASA SVS 5148", "lon0": -180, "width": img.width, "height": img.height,
        "view": publish_view(Image.fromarray(view), "wind", "geosfp-wind"),
        "sound": publish_image(Image.fromarray(grid), "wind", "sound-geosfp-wind", format="PNG", optimize=True),
        "legend": publish(WD_CBAR, "wind", "legend"),
        "validTime": WD_DATE, "rangeMs": [0, 40], "readableFromMs": round((WD_COL0 - WD_X0) / WD_PX_PER_MS, 1),
    }



NE_DIR = SRC / "naturalearth"


def natural_earth(manifest: dict) -> None:
    """Country borders and large cities for an optional visual layer (never sonified)."""
    print("Natural Earth")
    rnd = lambda c: [round(c[0], 2), round(c[1], 2)]  # noqa: E731 - ~1 km, plenty at 1:110m
    lines = []
    for f in json.loads((NE_DIR / "ne_110m_admin_0_boundary_lines_land.geojson").read_text(encoding="utf-8"))["features"]:
        g = f["geometry"]
        parts = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        lines += [[rnd(c) for c in part] for part in parts]
    cities = []
    for f in json.loads((NE_DIR / "ne_110m_populated_places_simple.geojson").read_text(encoding="utf-8"))["features"]:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"][:2]
        cities.append({"name": p.get("name"), "lat": round(lat, 2), "lon": round(lon, 2), "pop": int(p.get("pop_max") or 0)})
    cities.sort(key=lambda c: -c["pop"])
    bpath, cpath = tmp("borders.json"), tmp("cities.json")
    bpath.write_text(json.dumps(lines, separators=(",", ":")))
    cpath.write_text(json.dumps(cities, separators=(",", ":")))
    manifest["naturalEarth"] = {
        "source": "Natural Earth 1:110m (public domain), naturalearthdata.com",
        "borders": publish(bpath, "ne", "borders-110m"),
        "cities": publish(cpath, "ne", "cities-110m"),
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
    # --only <step> rebuilds one dataset into the existing manifest (adding a track must not
    # re-encode everything else, and unchanged files keep their hashed names).
    if "--only" in sys.argv:
        step = sys.argv[sys.argv.index("--only") + 1]
        manifest = json.loads(MANIFEST.read_text())
        globals()[step](manifest)
        MANIFEST.write_text(json.dumps(manifest, indent=2))
        shutil.rmtree(BUILD / "tmp", ignore_errors=True)
        return
    self_check()
    if OUT.exists():
        shutil.rmtree(OUT)  # media/ only ever holds generated, hashed files
    manifest: dict = {"version": 2}
    nightlights(manifest)
    aerosols(manifest)
    lightning(manifest)
    ocean(manifest)
    wind(manifest)
    natural_earth(manifest)
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
