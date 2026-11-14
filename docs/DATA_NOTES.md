# Data Notes

Analysis of the NASA SVS visualization frames used by this project, done on 14 November 2026.
All numbers come from measuring the decoded frames: 8-bit RGB values, pixel coordinates in the
source resolution, frame indices at the source frame rate. Nothing here is copied from a
description without checking it against the pixels.

**What we sonify.** We sonify the *rendered visualizations* (the frames), as the challenge
asks. We do not sonify the underlying physical measurements. Pixel values are display colors
produced by the SVS rendering, not radiances, concentrations or flash rates.

---

## 0. Inventory

| File (in `datasets/`, not committed) | Size | Codec | Resolution | fps | Duration | Frames | Source |
|---|---|---|---|---|---|---|---|
| `nightlights_flat_series_and_change_wZooms_13_EIC_2160p30_h265.mp4` | 32.7 MB | HEVC Main, yuv420p | 7680×2160 | 30 | 43.333 s | 1300 | [SVS 5313](https://svs.gsfc.nasa.gov/5313/) |
| `Aerosols_2025-08-19T20_00_00_3840x2160.png` | 8.85 MB | PNG RGB | 3840×2160 | — | — | 1 | [SVS 5669](https://svs.gsfc.nasa.gov/5669/) |
| `Aerosols_cbar.png` | 37.8 KB | PNG RGBA | 1500×300 | — | — | 1 | [SVS 5669](https://svs.gsfc.nasa.gov/5669/) |
| `iss_lightning_sos_yearly_07312023_2048p60.mp4` | 334 MB | H.264 High, yuv420p | 4096×2048 | 60 | 100.033 s | 6002 | [SVS 5011](https://svs.gsfc.nasa.gov/5011/) |

Coordinate conventions used below: `x` grows to the right and `y` grows downward, starting at
(0,0) in the top-left pixel of the full source frame. "Max channel" means `max(R,G,B)`.

---

## 1. Night lights (SVS 5313, NASA Black Marble)

### 1.1 Geometry

- The 7680×2160 frame holds **two identical copies of the world side by side**, each
  **3840×2160**. Copy 1 covers `x = 0..3839` and copy 2 covers `x = 3840..7679`.
  The column-brightness profile repeats with a period of exactly 3840 px.
- There are **no black bars**. The map fills the full height: the Arctic Ocean is at the top
  row and Antarctica runs down to the bottom row.
- The projection is equirectangular over the full globe (360° × 180°), but it is **stretched to
  16:9**. That gives 10.667 px per degree of longitude and 12 px per degree of latitude, so
  pixels are not square.
- **Georeference** (fitted on 13 cities, residual about ±3 px, roughly ±0.3°):

  ```
  lon = -169.0 + x * 360 / 3840     (copy 1, x in [0, 3840); wraps at +191°)
  lat =   90.0 - y * 180 / 2160
  ```

  The map is therefore centered near 11°E, **not** on Greenwich. Copy 1 starts at about 169°W,
  just east of the Bering Strait.
- Effective resolution: about 10 km per pixel at the equator in the source, and about 21 km
  per pixel if the frame is scaled to 1920 px wide.

### 1.2 Timeline (measured per frame, t = frame / 30)

| Phase | Frames | Time (s) |
|---|---|---|
| Yearly series, global map, no insets | 0–277 | 0.000–9.267 |
| Lights fade out | 278–290 | 9.267–9.700 |
| Change map fades in | 291–306 | 9.700–10.233 |
| **Change map, fully visible and static** | **307–616** | **10.233–20.567** |
| Change map fades out, then base map only | 617–639 | 20.567–21.333 |
| Yearly series repeats (label "2012" back at frame 640) | 640–1093 | 21.333–36.467 |
| Zoom insets animate in | 670–686 | 22.333–22.900 |
| Insets fully drawn | 687 → end | 22.900 → |
| Lights fade out | 1091–1104 | 36.367–36.833 |
| Change map (with insets) fades in | 1105–1121 | 36.833–37.400 |
| Change map with insets, static | 1122–1299 | 37.400–43.333 |

**Year → frames.** Each year shows for 17–18 frames (about 0.6 s). 2012 in the first pass is
shorter, and 2023 is held longer. The label was segmented automatically and every segment was
then read by eye.

| Year | Pass 1 frames | Recommended frame (pass 1) | Time (s) | Pass 2 frames (with insets) |
|---|---|---|---|---|
| 2012 | 0–14 | 7 | 0.233 | 641–829 |
| 2013 | 15–32 | 24 | 0.800 | 830–847 |
| 2014 | 33–50 | 42 | 1.400 | 848–865 |
| 2015 | 51–68 | 60 | 2.000 | 866–883 |
| 2016 | 69–85 | 77 | 2.567 | 884–900 |
| 2017 | 86–103 | 95 | 3.167 | 901–918 |
| 2018 | 104–121 | 113 | 3.767 | 919–936 |
| 2019 | 122–138 | 130 | 4.333 | 937–953 |
| 2020 | 139–156 | 148 | 4.933 | 954–971 |
| 2021 | 157–174 | 166 | 5.533 | 972–989 |
| 2022 | 175–192 | 184 | 6.133 | 990–1007 |
| 2023 | 193–277 | 235 | 7.833 | 1008–1093 |
| Change map | 307–616 | **400** | **13.333** | 1122–1299 |

Use mid-segment frames. The encoder puts a keyframe every 60 frames (2 s), which shows up as
small frame-to-frame differences that are not real content changes.

### 1.3 Overlays (pixels that must not be sonified)

| Overlay | Box (x0–x1, y0–y1) | Notes |
|---|---|---|
| Year label | 3982–4151, 1080–1134 | Grey sans-serif digits, in copy 2 over the Pacific. **Not inside copy 1.** |
| Change colorbar and text | 3760–4372, 1181–1290 | Title "Change in Lighting Intensity from 2012 to 2023", labels "lights out / no change / new lights". **Overlaps the right edge of copy 1 (x 3760–3839, near Samoa).** |
| Insets (pass 2 only, approximate ±8 px) | W. Europe 684–1992, 744–2056; E. Mediterranean 2372–3224, 132–1268; Ukraine 4640–5732, 104–916; India 6060–7084, 1060–2092 | They cover large parts of **both** copies, so there is no clean global map in pass 2. |

**Clean single world map:** take copy 1 (`x 0..3839`) and replace the strip `x 3760..3839,
y 1181..1290` with the same strip from copy 2 (`x 7600..7679`), which is clean in pass 1.

### 1.4 Colors and thresholds (pass 1, max channel)

| Surface | Typical RGB | Max channel |
|---|---|---|
| Ocean | (1,0,2) | 0–3 |
| Dark vegetated land (Amazon, Congo) | (2,4,0) | 2–10 |
| Desert / dry land (Australia, Sahara) | (15,9,4) … (26,21,15) | 13–29 |
| Ice and snow (Greenland, Antarctica, Siberia in this base) | (29–33, same, same), neutral grey | 29–34 |
| Night lights | warm yellow-white, R ≥ G > B | mostly > 60, cores saturate at 255 |

- **Light threshold:** max channel > 45 sits above every base surface (max 34). For
  measurement we used > 60.
- **Land vs ocean:** brightness alone fails, because dark forest is as dark as the ocean.
  This hue rule works and was checked visually over the whole globe (lakes included):
  `ocean = max(R,G,B) <= 4 AND B >= R AND B >= G`, then a 5×5 mode filter.
  Compute the mask once and reuse it for every year.

**Change map (frame 400).**

| Meaning | Colorbar color | Typical on-map color | Rule |
|---|---|---|---|
| Lights out (less light) | orange-yellow, endpoint (229,158,89) | median (131,98,71) | R > B+30 and G > B+10 |
| No change | white (252,252,252) | median (105,92,99) | otherwise neutral |
| New lights (more light) | purple, endpoint (148,105,197) | median (96,77,123) | B > R+10 and B > G+20 |

On-map colors are darker than the colorbar, so pixel brightness also carries the underlying
light level. **Hue gives the direction of change reliably. The magnitude of change can only be
estimated roughly.**

### 1.5 Is there a real signal between years? (yes, mostly regional)

Share of pixels with max channel > 60, measured on the recommended frames (pass 1, copy 1):

| Year | World | India | Ukraine | Syria | Nigeria | USA | W. Europe | China |
|---|---|---|---|---|---|---|---|---|
| 2012 | 0.43 | 1.68 | 1.82 | 3.94 | 1.22 | 4.58 | 9.32 | 4.55 |
| 2015 | 0.47 | 2.03 | 1.85 | 2.99 | 1.21 | 4.65 | 9.52 | 5.24 |
| 2019 | 0.51 | 2.40 | 2.22 | 4.69 | 1.24 | 4.66 | 9.35 | 7.01 |
| 2021 | 0.52 | 2.61 | 2.31 | 4.46 | 1.17 | 4.54 | 8.73 | 8.03 |
| 2022 | 0.57 | 3.43 | 1.86 | 4.73 | 1.16 | 5.01 | 9.08 | 8.93 |
| 2023 | 0.60 | 4.18 | 1.90 | 5.16 | 1.21 | 5.20 | 8.42 | 9.53 |

(Values are percent of the region's pixels. All 12 years were measured; selected rows are shown.)

Stories that are clearly visible in the rendered frames:
- **India** lights up 2.5×.
- **China** roughly 2×.
- **Ukraine** drops about 19% from 2021 to 2022.
- **Syria** dims in 2013–2015, then recovers.
- **Western Europe** slowly declines.
- The **global** total changes only slightly (0.43% → 0.60%), so a whole-world "which year is
  brighter" comparison is hard to hear.

These are statements about the rendered map, not calibrated radiance trends.

---

## 2. Aerosols (SVS 5669, GEOS-FP)

### 2.1 Geometry

- 3840×2160, **the whole image is the map**: no margins, no text, no legend inside.
- Equirectangular and stretched to 16:9 like the night lights, but centered on Greenwich:

  ```
  lon = -180 + x * 360 / 3840
  lat =   90 - y * 180 / 2160
  ```

  Checked on Cape Town and Perth city dots (±1 px).
- **The aerosol map is shifted 11° (117 px) relative to the night-lights map.** Rolling the
  night-lights land mask by +117 px aligns it with this image.

### 2.2 Legend (`Aerosols_cbar.png`)

The legend is categorical: four swatches on a dark rounded panel. **There is no quantitative
scale**, so brightness is a relative amount at best.

| Legend label | Swatch RGB | Chromaticity (r,g,b) | Measured on map (chromaticity) |
|---|---|---|---|
| Black Carbon | (210,94,69) | .56/.25/.18 | Angola/DRC fires: .56/.27/.17, median (118,60,34) |
| Dust | (193,154,220) | .34/.27/.39 | Sahara core: .34/.28/.39, median (173,137,199) |
| Sea Salt | (133,170,169) | .28/.36/.36 | Southern Ocean: .18/.43/.38, median (17,41,34) |
| Sulfate | (83,220,52) | .23/.62/.15 | N. Pacific plume: .23/.60/.17, median (20,51,15) |

Two corrections to the project brief:
- **Sea salt is grey-teal, not blue.**
- The red class is **black carbon** (fires *and* combustion), not "fire smoke" only.

### 2.3 Base layers to filter

| Layer | Color | How to filter |
|---|---|---|
| Land relief (grey) | (41,46,42) Australia … (62,69,61) Antarctica, chromaticity .32/.36/.32 | **This is almost the same chromaticity as sea salt.** Use the land mask: never call land pixels "sea salt". |
| City lights | white dots, 1–3 px, min channel > 150, saturation < 35 | Saturation alone also catches the bright Saharan dust core. Add a size test (isolated ≤ 3 px blob) or run a 5×5 median filter on land first. |
| Arctic edge | (4,15,4) | weak, treat as nothing |

### 2.4 How reliably the types separate

Nearest-legend-chromaticity classification at 1920×1080, ignoring pixels with max channel < 35:

| Class | Share of non-weak pixels |
|---|---|
| "Sea salt"-like | 55.7% (**includes grey land**; 75.8% of non-weak land pixels fall here) |
| Sulfate | 20.9% |
| Dust | 4.4% |
| Black carbon | 2.4% |
| Ambiguous (best and second-best within 0.04) | 16.6% |

- **Dust, black carbon, and dense sulfate are clean and reliable.**
- **Sea salt vs faint sulfate over the ocean is a continuum** (teal ↔ green). There is no clean
  ocean background, because sea salt covers nearly all of the ocean.
- Overlapping plumes blend additively. Dust and smoke give pink tones; sulfate and smoke give
  olive or yellow (Iberia, East Asia: chromaticity about .32–.37 / .38–.43 / .19–.25).
  Report the **dominant** type only.

---

## 3. Lightning (SVS 5011, ISS LIS)

### 3.1 Geometry

- 4096×2048, 2:1 equirectangular, full globe, square pixels:

  ```
  lon = -180 + x * 360 / 4096
  lat =   90 - y * 180 / 2048
  ```

  Checked on the Cape Peninsula.
- Base map: grey shaded relief (Natural Earth Gray Earth). Ocean is flat grey 20 inside the
  ISS coverage band and 6–11 outside it.
- **Coverage band:** full brightness between ±50.6° (rows 448–1600), fading to dark by ±56°
  (rows 380 / 1666). Lightning dots were seen from 55.5°N to 47.5°S.

### 3.2 Lines (must not be sonified)

All lines are neutral grey (R = G = B).

| Line | Rows | Grey level |
|---|---|---|
| Tropic of Cancer (dashed) | 754–758 | ~33–40 |
| Equator (solid) | 1021–1025 | up to 72 |
| Tropic of Capricorn (dashed) | 1289–1293 | ~27–39 |

### 3.3 Lightning dots

- Yellow: median (138,130,21), p10 (99,91,0), p90 (209,203,57).
- Detection rule: `R > 90 AND G > 70 AND B < G - 40`. Lines and relief are neutral grey, so
  they never pass.
- **The dots persist rather than flash.** SVS states a **10-day roving window**. Measured
  turnover is about 3% of dots per frame, so a dot stays on screen for about 0.5 s
  (~30 frames).

### 3.4 Time

- **No date is shown on screen.**
- SVS publishes an SOS `labels.txt` (https://svs.gsfc.nasa.gov/vis/a000000/a005000/a005011/labels.txt,
  108 KB, 6001 lines, one date per frame). We read it but have not stored it yet.
- What `labels.txt` shows:
  - Frames 0–595 are all **March 2017** (ramp-up as the window fills).
  - After that, about 55–70 frames per month (~1 s per month) until 2022.
  - 2023 runs slower (87–177 frames per month).
  - **Bug in the official file:** every 2023 entry is labeled "2003" (frames 4927–6000).
  - Labels continue to 31 Aug 2023 although the data ends on 31 Jul 2023. The last ~270
    frames are the window draining, and dot counts fall to zero by 99 s.
- Measured seasonal cycle: northern-hemisphere maxima at about 16, 28, 40.5, 52, 63, 75 and
  93 s, which matches the summers 2017–2023. Southern-hemisphere maxima fall in between.
- Both hemispheres dip sharply at about 35 s and 70 s (Feb 2019, Feb 2022 by labels). These may
  be gaps in the instrument data. Not verified.
- The page also offers an **EIC-display version** (`iss_lightning_eic_display_2160p30_h2652.mp4`,
  7680×2160). We have the Science On a Sphere version, which is not the EIC wall format.

---

## 4. Summary for the team

### 4.1 What is wrong with the data

1. **Night lights are H.265 at 7680×2160.** Many browsers and machines cannot decode this.
   It must be transcoded before use on the site.
2. The night-lights frame holds **two copies of the world**. The colorbar overlaps the edge of
   copy 1, and the year label sits in copy 2. A clean map needs a crop plus a patch (1.3).
3. Night-lights maps are **not centered on Greenwich** (lon₀ = −169°), the aerosol map is
   (lon₀ = −180°), and both are **stretched to 16:9**, so pixels are not square. All spatial
   logic must work in degrees, not pixels.
4. In pass 2 the night-lights **insets cover large parts of the map**. Only pass 1 gives a
   clean global map for each year.
5. Night-lights pixel values are a **nonlinear display mapping** with saturated city cores.
   They are not radiance.
6. The change-map **magnitude** is entangled with base brightness. Only the direction is
   robust.
7. The aerosol legend is **categorical only**: no amounts. Sea salt looks like the grey land
   base and blends into faint sulfate.
8. The lightning video has **no on-screen date**. The official `labels.txt` has a "2003"
   typo for 2023, and its time axis is non-linear.
9. Lightning covers only about ±52°. **Silence poleward means "no data", not "no lightning".**
10. Lightning dots represent a **10-day accumulation window**, not individual real-time
    strikes.
11. The lightning file is 334 MB and the SOS format rather than the EIC display version.
    It cannot go to GitHub as is.

### 4.2 What is missing

- `labels.txt` for lightning dates. Small; needs approval to store in `datasets/`.
- Optionally, the EIC-display lightning video (size not checked).
- Lossless PNG frames for night lights. SVS links a `frames/7680x2160_32x9_30p/...` directory,
  but listing it returns 403. A download through the page menu may still work.

### 4.3 What from the project plan is impossible or risky on this data

| Planned item | Verdict |
|---|---|
| Night lights by year, year knob | **Works**, using the pass-1 frames in 1.2. Comparing the **whole globe** by ear is weak (+40% lit share over 11 years). Comparing **regions** is strong. Build the demo and the blindfold test around regions (India, China, Ukraine 2022), not the globe. |
| "What changed" mode | **Works for direction** (more / less / same). Present the magnitude as approximate. |
| Aerosols, four instruments | **Three are solid** (dust, black carbon, sulfate). **Sea salt is risky**: valid only over ocean with a land mask, and still mixed with faint sulfate. Expect ~17% ambiguous pixels. Map sea salt to a soft ocean "bed" sound rather than a crisp instrument, and say so in the README. |
| Lightning strikes plus vibration pulses | **Works**, but "strike" means a dot entering the 10-day window. Trigger on *new* dots (frame difference), not on all lit pixels. Word it honestly: "lightning detected over a 10-day window". |
| Ring scan "compass" | **Works**, but the ring must be computed in degrees. Use great-circle distance so it is a true circle on Earth. The pixel aspect ratios differ between datasets. |
| Pitch = north/south | Fine. For lightning, latitudes outside ±52° need an explicit "no data" cue. |
| Land vs ocean timbre, coast click | **Works.** One land mask derived from the night-lights base (1.4) serves all three maps after a longitude roll. |
| Same scale across years | Fine: all years share one rendering. Use fixed thresholds, never per-frame normalization. |
| Blindfold task "where is dust vs smoke" | Fine: these two separate cleanly. |
| Blindfold task "which year is brighter" | Risky globally. Use a region. |

### 4.4 Open questions

1. May we store `labels.txt` (108 KB, NASA SVS) in `datasets/`?
2. Should we download the EIC-display lightning version (7680×2160) to stay strictly on
   "EIC frames"? Its size is not checked yet.
3. Should we try to obtain the lossless night-lights PNG frames from the SVS download menu?

---

## 6. Ocean temperature (SVS 3912, ECCO2)

- **Frame:** `flat_global_ecco2_2028x1024.25000.jpg` is 2048 × 1024 (despite the name).
  It is an equirectangular full globe with 180° W at x = 0. Checked on the US west coast at
  about 122° W, which lands at x ≈ 322 of 2000.
- **Date:** frame 25000 is 2007-06-19 12:00 UTC, per `flat_ecco2_dates.txt` (2001 lines,
  frames 23000…, four-hourly steps).
- **Content:**
  - surface current streaks coloured by SST;
  - land is flat grey shaded relief (low saturation);
  - gaps between streaks are near-black.
  - There is no text or colorbar in the frame.
- **Colorbar** (`sst_ecco2_cbar.png`, 310 × 95 RGBA): the bar runs x = 14…291 at y = 30…65,
  for 0…32 °C. PIL hue falls monotonically from about 161 (blue, 0 °C) through about 85
  (green, about 10 °C) and about 45 (yellow, about 20 °C) to about 11 (orange-red). The last
  few red pixels wrap to hue about 250.
- **Value recovery:** temperature from hue only, by nearest match on the colorbar, so streak
  brightness does not matter. A pixel counts as ocean flow if saturation ≥ 90 and
  value ≥ 40 (0–255). Round trip on the colorbar itself: maximum error 1.5 °C.
- **Coverage:** 27 % of the frame's pixels are flow streaks.
- **Spot checks:** equatorial Pacific 27.3 °C, Arabian Sea 29.2 °C, Gulf Stream 24.8 °C,
  North Atlantic at 60° N 8.6 °C, Southern Ocean 1.4 °C. All plausible for June.
- **Limits:**
  - one model day only, so no trend;
  - surface only;
  - a colour-derived value, about ±1.5 °C;
  - currents (motion) are not used, because the 292 MB video was deliberately not
    downloaded.

## 7. Downloads after 14 November 2026

All downloads go through [`tools/fetch_source.py`](../tools/fetch_source.py). Its rules:
- https only, from svs.gsfc.nasa.gov (plus Natural Earth hosts when explicitly allowed);
- a redirect to any other host aborts the download;
- only `.mp4 .png .jpg .txt` (plus `.geojson` for Natural Earth);
- 400 MB maximum;
- the content must match the extension (file signature, ffprobe for video, UTF-8 for text);
- nothing downloaded is ever executed.

Folders were scanned with Microsoft Defender (`MpCmdRun -Scan -ScanType 3`).

| URL | Bytes | Downloaded | SHA-256 | Content check |
|---|---|---|---|---|
| https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003912/flat_global_ecco2_2028x1024.25000.jpg | 1,026,047 | 2026-11-14 10:56 UTC | `dcfd17864c2940f9ce1cf406e866818379991d57b0e900f9b8812f0c7cf72e3c` | JPEG signature OK |
| https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003912/sst_ecco2_cbar.png | 8,867 | 2026-11-14 10:56 UTC | `7c4c25f9ca51bb458c100ca4d31f452b8dfdbce8898e2945b7042729d55404c5` | PNG signature OK |
| https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003912/flat_ecco2_dates.txt | 50,025 | 2026-11-14 10:56 UTC | `2911a0e01ba21542462283276636f834511527ac45b9e5df76226acc03f743fb` | UTF-8 text OK |

| https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005196/dyamondPointCloud_12-1-2023b_dyamond_co2_anim_globe_orbit_1080p30_h265.mp4 | 7,228,199 | 2026-11-14 11:09 UTC | `bd0f6dfaf17b652e0e2c0aac4e5ac36c9a0120acb17d54d791ef9ac74eeb78e3` | ffprobe OK: hevc 1920x1080 30 fps, 39.2 s |
| https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005196/dyamondCbar_6-27-2024a.png | 48,713 | 2026-11-14 11:09 UTC | `5354a4734cdf11dfd6738c0d8875d47d5d3b6779ea5a50a8dc71d24f08f11a5f` | PNG signature OK |
| https://svs.gsfc.nasa.gov/vis/a000000/a004900/a004950/GEDI_global_w_colorbar_1080p60.mp4 | 18,574,070 | 2026-11-14 11:09 UTC | `c47012d28b996d528069fc28f39ad7e9425be6e50f65d2b3274a1cc817d91915` | ffprobe OK: h264 1920x1080 60 fps, 51.5 s |
| https://svs.gsfc.nasa.gov/vis/a000000/a004900/a004950/GEDI_colorbar_0to50_01_print.jpg | 11,031 | 2026-11-14 11:09 UTC | `b27d8869d0247542849b92ca1a09677475192047f46ec10552620d2a59608576` | JPEG signature OK |
| https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005533/AirQuality_WithLabels_1920x1080_0000.png | 2,306,930 | 2026-11-14 11:11 UTC | `b28c1e0379019d9482a839be4c18b6a5906cb47dff31637563fcd3f6dfe48a00` | PNG signature OK |
| https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_boundary_lines_land.geojson | 340,010 | 2026-11-14 11:11 UTC | `d42479fd79552cca4eec7f85fcdca717a790d29ff06be7676f1af0568c6d3f7c` | valid JSON text |
| https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_populated_places_simple.geojson | 166,071 | 2026-11-14 11:11 UTC | `0dbd25c9ad8bd797ddf164b067f563be5c16be2c002254eb594862377963f9dc` | valid JSON text |

Defender results: `datasets/ecco2`, `datasets/dyamond`, `datasets/gedi`, `datasets/airquality`
and `datasets/naturalearth` all report "found no threats".

Credits for the reviewed (not used) SVS pages:
- 5196: AJ Christensen (visualization), Lesley Ott (science).
- 4950: Kel Elkins, Horace Mitchell, Greg Shirah; scientists Temilola Fatoyinbo and Atticus
  Stovall; data GEDI L2B RH100.
- 5533: Helen-Nicole Kostis and Joseph V. Ardizzone; science Lesley Ott; GEOS-CF.

Natural Earth: public domain, https://www.naturalearthdata.com. The files come from the
project's official repository, `nvkelso/natural-earth-vector`.

## 9. Near-surface wind (SVS 5148, GEOS-FP) — Data-true track

**Source.** GEOS-FP Near-Surface Wind Speed, https://svs.gsfc.nasa.gov/5148/. Credit: NASA's
Global Modeling and Assimilation Office; visualizer Joseph V. Ardizzone (NASA/GSFC); data
GEOS-FP (Lucchesi 2018, GMAO Office Note 4). The SVS page is tagged *Earth Information
Center*, but on 14 Nov 2026 it was not in the EIC gallery list (3912 and 5669 were not listed
there either, although both are in the challenge resources).

| File | URL | Size | Downloaded (UTC) | SHA-256 |
|---|---|---|---|---|
| `00000001.png` (2048×1024 frame) | https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005148/frames/2048x1024_2x1_12p/MC02_stage3_GMAO_near_surface_wind_2048x1024_en-hwtool/00000001.png | 6,311,956 B | 2026-11-14 16:08 | `4c919f56eaf077907094142d1a337827596a48cbea4635bc599d75f8afbd0b7d` |
| `NearSurfaceWindSpeed_colorbar_plain.png` | https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005148/NearSurfaceWindSpeed_colorbar_plain.png | 7,861 B | 2026-11-14 16:08 | `47c0ffa11a85fc42f98b81e44693c32f184e2782943760a829c6f8c333e833b5` |
| `NearSurfaceWindSpeed_colorbar.png` | https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005148/NearSurfaceWindSpeed_colorbar.png | 14,205 B | 2026-11-14 16:08 | `335cf63fb882c9c7c1a1daa194e68c02d5831b14c95201ec0d7d2fd4f43f1043` |

All three: PNG signature checked; Windows Defender scan of `datasets/svs-5148`: no threats.

**The frame.** Equirectangular, 180° W at x = 0, full ±90°. Printed on it: the date
"29 Oct 2026 05:00:00 EDT" (09:00 UTC) in a translucent box at bottom left (x 0–515,
y 920–1024) and agency logos at top left (x 0–360, y 0–80). Both areas are "no data" in the
sound grid; the logos are painted over in our view, so no agency insignia appears on the site.

**Reading the colours (Data-true).** The colorbar file is 528×165; major ticks every 5 m/s sit
at x = 71.5, 120.5 … 463.5 (9.8 px per m/s). Below 3.6 m/s the bar is transparent: calm air is
not coloured on the map, so it reads as 0 and is silent. Each map pixel takes the speed of the
nearest bar colour (RGB distance ≤ 34, channel spread ≥ 28 so white/grey land and labels never
match). Round trip on the bar itself: every colour from 5 to 34 m/s reads back, max error
0.41 m/s.

**Stated limits.**
- The palest start (3.6–5 m/s) is too close to white land to be read reliably.
- The grey hurricane-force end (34–40 m/s) cannot be told from the dark-purple calm ocean base,
  so it is left out: such winds read as 34 m/s at most. Leaving it in made 3.9 % of calm ocean
  read as hurricane-force, so the cap errs on the safe side.
- 49.6 % of the frame carries a reading; median 8.5 m/s, maximum 33.9 m/s.

**Sound.** Band-passed noise on the compass pitch (rushing air); stronger wind is louder and
opens the band upward; above about 12 m/s a narrow whistle joins in. Measured offline
(`tools/sound_report.mjs`): North Atlantic storm centroid 3094 Hz, Southern Ocean westerlies
2865 Hz, Atlantic trade winds 1886 Hz, equatorial calm 988 Hz (and nearly silent).

## 10. Forest height (SVS 4950, GEDI) — Visual track, needle mode

**Source.** GEDI Forest Height, https://svs.gsfc.nasa.gov/4950/. Credit: NASA's Scientific
Visualization Studio; visualizers Kel Elkins (USRA), Horace Mitchell and Greg Shirah
(NASA/GSFC); scientists Temilola Fatoyinbo (NASA/GSFC) and Atticus Stovall (University of
Maryland); data GEDI L2B RH100 (relative height), April 2019 to April 2020.

| File | URL | Size | Downloaded (UTC) | SHA-256 |
|---|---|---|---|---|
| `GEDI_global_w_colorbar_1080p60.mp4` | https://svs.gsfc.nasa.gov/vis/a000000/a004900/a004950/GEDI_global_w_colorbar_1080p60.mp4 | 18,574,070 B | 2026-11-14 11:09 UTC | `c47012d28b996d528069fc28f39ad7e9425be6e50f65d2b3274a1cc817d91915` |

ffprobe: H.264 1920×1080, 60 fps, 51.5 s, 3089 frames. Windows Defender: no threats.

**Why Visual, not Data-true.** The globe is shaded and the heights are exaggerated in 3D, so
the rendered colour also carries light and relief; the colorbar's numbers cannot be read back
honestly. We therefore sonify the picture: brightness of non-blue, non-black pixels ("brighter
green and white = taller in the picture"), with no metres claimed.

**Needle.** The globe turns once in about 50 s and always fills the frame: disk centre x = 960
of 1920, lit from y = 23 to 1056 (measured on frames 0, 900, 1800, 2700). A fixed needle at
x = 0.5, y = 0.025–0.975 reads 192 pixels per tick in 16 segments, north at the top (high
notes). A segment with vegetation plays a wooden knock (marimba-like: a sine plus a fast-fading
partial at 4×), louder and quicker for brighter vegetation; at most 24 knocks per second.
Web copy: 1280×720, 30 fps, H.264, 2.93 MB.

## 11. Carbon dioxide (SVS 5196, DYAMOND) — Visual track, needle mode

**Source.** DYAMOND Global Carbon Dioxide, https://svs.gsfc.nasa.gov/5196/. Credit: NASA's
Scientific Visualization Studio; visualizers AJ Christensen (SSAI), Greg Shirah (NASA/GSFC),
Helen-Nicole Kostis (USRA), Mark SubbaRao (NASA/GSFC); scientists Lesley Ott (NASA/GSFC), Brad
Weir (Morgan State University), William Putman (NASA/GSFC), Tomohiro Oda (USRA/EfSI); data
DYAMOND (GEOS-MITgcm), January–March 2020. We use the "globe orbit" camera move.

| File | URL | Size | Downloaded (UTC) | SHA-256 |
|---|---|---|---|---|
| `dyamondPointCloud_12-1-2023b_dyamond_co2_anim_globe_orbit_1080p30_h265.mp4` | https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005196/dyamondPointCloud_12-1-2023b_dyamond_co2_anim_globe_orbit_1080p30_h265.mp4 | 7,228,199 B | 2026-11-14 11:09 UTC | `bd0f6dfaf17b652e0e2c0aac4e5ac36c9a0120acb17d54d791ef9ac74eeb78e3` |
| `dyamondCbar_6-27-2024a.png` | https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005196/dyamondCbar_6-27-2024a.png | 48,713 B | 2026-11-14 11:09 UTC | `5354a4734cdf11dfd6738c0d8875d47d5d3b6779ea5a50a8dc71d24f08f11a5f` |
| `dyamondPointCloud_12-1-2023b_dyamond_co2_anim_globe_orbit_1080p30_h265.mp4` | https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005196/dyamondPointCloud_12-1-2023b_dyamond_co2_anim_globe_orbit_1080p30_h265.mp4 | 7,228,199 B | 2026-11-14 16:22 UTC | `bd0f6dfaf17b652e0e2c0aac4e5ac36c9a0120acb17d54d791ef9ac74eeb78e3` |
| `dyamondCbar_6-27-2024a.png` | https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005196/dyamondCbar_6-27-2024a.png | 48,713 B | 2026-11-14 16:22 UTC | `5354a4734cdf11dfd6738c0d8875d47d5d3b6779ea5a50a8dc71d24f08f11a5f` |

ffprobe: HEVC 1920×1080, 30 fps, 39.2 s, 1176 frames (dates on screen 14 Jan – 27 Feb 2020).
Windows Defender: no threats. Web copy: H.264 1280×720, 2.47 MB.

**Why Visual.** As found in section 8, the colorbar has no readable numbers on the frame, the
low end is transparent and the plumes are blended over the base map, so ppm cannot be read
back. We sonify the picture: the warmth of the plume colour (red minus blue) on non-grey
pixels; grey land, white desert and the dark ocean read 0.

**Needle.** Disk measured on frames 0, 400, 800, 1150: x 480–1406, y 59–1002 of 1080, centre
x = 0.495. The needle runs from y = 0.06 to 0.925. Each segment with plume colour plays a low
hum an octave down that thickens (detuned twin, wider filter) as the colour warms; notes are
spaced 2.2× wider than the forest knocks so the hum stays a drone.

## 12. Air quality (SVS 5533, GEOS-CF) — removed from the site on 14 Nov 2026

*The track built from this frame was removed at the team's request; the notes are kept for the record. The frame is no longer in `media/` or in the manifest.*

**Source.** Air Quality Model Runs, https://svs.gsfc.nasa.gov/5533/. Credit: NASA's Scientific
Visualization Studio; visualizers Helen-Nicole Kostis and Joseph V. Ardizzone; scientist Lesley
Ott; data GEOS-CF (NASA GMAO), July–August 2024.

| File | URL | Size | Downloaded (UTC) | SHA-256 |
|---|---|---|---|---|
| `AirQuality_WithLabels_1920x1080_0000.png` | https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005533/AirQuality_WithLabels_1920x1080_0000.png | 2,306,930 B | 2026-11-14 11:11 UTC | `b28c1e0379019d9482a839be4c18b6a5906cb47dff31637563fcd3f6dfe48a00` |

PNG signature checked; Windows Defender: no threats.

**The frame.** One equirectangular world map (full ±90°, 180° W at x = 0), cut into vertical
strips of about 50° of longitude; each strip shows a different pollutant with its own colour
ramp and a name box (y 805–862). Strip edges, measured as colour jumps along rows 600–700:
269, 538/539, 808/809, 1078/1079, 1348/1349, 1618/1619, 1888/1889. Order: CO, PM2.5, NOx, ozone,
repeated.

**Why Visual, and how.** There are no numeric scales on the frame. We sonify darkness within a
strip's own ramp: value = (L_clean − L) / (L_clean − 40), with the clean-end luminance measured
over open ocean (CO 215, PM2.5 245, NOx 185), after a 5-px median filter that removes the thin
coastline strokes. Black pixels (no data in the picture) and the label boxes are 0. **Ozone strips
are silent**: their grey/violet two-tone ramp cannot be put in order honestly. Strips are not
comparable with each other, so the ring is meant to stay inside one strip; the presets do.

**Sound.** "Hoarse" air: a low sawtooth roughened by a 27 Hz amplitude wobble (heard as rasp);
darker strips open the filter. Measured offline: Central Africa fires (CO) RMS 0.142 vs a clean
South Pacific PM2.5 area 0.003 before the track trim.

## 13. Atmospheric river (SVS 4960) and Perpetual Ocean 2 (SVS 5425) — Visual, still frames

**Why still frames.** For 4960 the full-resolution frames are OpenEXR (not on our allowed
list) and the HD movie is 789 MB (over the 600 MB limit); for 5425 every movie is 115 MB to
5 GB and the frames are EXR as well. Each page offers light JPEG stills, so each track uses one
still and a **needle sweep**: the needle moves across the picture from left to right over the
scan length, reading a precomputed value grid top (high notes) to bottom (low notes).

| File | URL | Size | Downloaded (UTC) | SHA-256 |
|---|---|---|---|---|
| `atmos_river.0324_rfm23_2021-11-29_1351.04370_print.jpg` | https://svs.gsfc.nasa.gov/vis/a000000/a004900/a004960/atmos_river.0324_rfm23_2021-11-29_1351.04370_print.jpg | 245,646 B | 2026-11-14 16:28 UTC | `775730587b0d40dc09ae45831d30320347c0f06b87aae62ac70e06e2f4be946b` |
| `perpetual_ocean2_CLOSE_093_clean_noDate_1080p_carousel.jpg` | https://svs.gsfc.nasa.gov/vis/a000000/a005400/a005425/perpetual_ocean2_CLOSE_093_clean_noDate_1080p_carousel.jpg | 653,329 B | 2026-11-14 16:28 UTC | `9722bc06db465c714e4bdc01782fb019ef4e3e8e9ffc6f312bb5e291099dd266` |

Both: JPEG signature checked; Windows Defender: no threats.

**4960 — A 3D View of an Atmospheric River from an Earth System Model.** Credit: NASA's
Scientific Visualization Studio; visualizers Greg Shirah, Horace Mitchell (NASA/GSFC), Cindy
Starr (GST), Kel Elkins (USRA); scientists Allison Collow, Natalie Thomas (UMBC), Michael
Bosilovich (NASA/GSFC); data MERRA-2. The still (1024×576, frame 4370 of the 2021-11-29
render) shows the North Pacific in 3D perspective, so it is not georeferenced. Value: blue
intensity, clamp((B − R − 40) / 140), where B ≥ G − 10 (water vapour in the picture); the
yellow "atmospheric river" label, the white H/L letters and land read 0 (17 % of the frame
sounds). Voice: water drops (a sine that springs up an octave in 50 ms).

**5425 — Perpetual Ocean 2: Western Boundary Currents.** Credit: NASA's Scientific Visualization
Studio; visualizers Greg Shirah, Horace Mitchell (NASA/GSFC); scientists Atousa Saberi
(NASA/GSFC), Josh Willis (JPL); data ECCO. The still is the 1920×1080 "carousel" image of the
globe (beauty version). Value: whiteness of current streaks, clamp((min(R,G,B) − 150) / 90),
counted only where the surrounding 41×41 px are ocean blue (mean B − R > 35), because snow on
land has the same white (snow b−r median 10 vs Gulf Stream streaks 25, equatorial 60). 2.1 % of
the frame sounds: the Gulf Stream, the equatorial currents and the Brazil–Falklands confluence
stand out. Voice: a soft triangle tone sliding gently down (flowing water).

Both are **Visual**: they sonify the picture, not calibrated measurements.

## 8. Datasets reviewed and rejected (honesty check)

The rule for every track: a pixel colour must translate into a value honestly. Where it
cannot, the dataset is left out.

| SVS | What it shows | Why it was rejected |
|---|---|---|
| **5196** DYAMOND CO₂, globe orbit (39 s, 1080p) | The globe turns steadily the whole time, with a date label at the bottom right. | The colorbar has **no numbers**: tick marks only, and no ppm range on the page. Its low end is **transparent** (a checkerboard), so the base map shows through. Its beige middle matches the base map (pale Sahara, pinkish Australia). Only "strongest orange-red plumes" could be detected, not a value. |
| **4950** GEDI forest height, rotating globe (51 s) | The globe turns the whole time, with a 0–50 m colorbar in the frame at bottom left (x 63–470, y ≈ 1000). Disk centre (960, 539), radius ≈ 515 px. | **Lighting:** globe colours are 1.5–2× darker than the colorbar, e.g. (52,54,21) against (85,89,54) on the bar. The scale separates heights mostly by brightness, from dark brown through green to light cream, so shading destroys the value. **Data gaps:** GEDI samples narrow orbit tracks (the visible cross-hatching), and the dark-brown base between tracks cannot be told apart from 0 m. On the centre meridian, where shading is mildest, nearest-colour matching still gave "0 m" for most of Africa, with colour errors of 50–63. |
| **5533** Air quality, flat map with labels | The world is cut into vertical strips, each strip showing a different pollutant (CO, PM2.5, NOx, O₃, repeated), with name labels. | **No colorbars or units in the frame**, and each longitude shows only one of four different quantities. A ring would mix four different scales in arbitrary places. |
| 4960 Atmospheric river | 3D camera flights with narration | No fixed geography; files over 400 MB. Not downloaded. |
| 5425 Perpetual Ocean 2 | Camera zooms, aesthetic white flow lines | 1–5 GB files; the colouring is not data. Not downloaded. |

Because both rotating-globe candidates (5196, 4950) failed this check, the planned "needle"
scan mode was not built. It would have had no honest data to read.

Credits for SVS 3912:
- NASA/Goddard Space Flight Center Scientific Visualization Studio.
- Animators: Greg Shirah, Horace Mitchell, Eric Sokolowsky.
- Producer: Michael Starobin.
- Scientists: Hong Zhang (UCLA), Dimitris Menemenlis (NASA/JPL).
- Model: ECCO2.

## 5. Credits for these sources

- **Change in Night Lights between 2012 and 2023 – EIC Version**, SVS ID 5313,
  https://svs.gsfc.nasa.gov/5313/.
  - Credit: NASA's Scientific Visualization Studio.
  - Visualizer: Kel Elkins (USRA).
  - Scientists: Zhuosen Wang (University of Maryland), Miguel Román (Leidos),
    Ranjay Shrestha (SSAI), Srija Chakraborty (USRA), Virginia Kalb (NASA).
  - Data: NASA Black Marble (Suomi NPP VIIRS).
- **GEOS Aerosols**, SVS ID 5669, https://svs.gsfc.nasa.gov/5669/.
  - NASA Global Modeling and Assimilation Office (GMAO) and NASA SVS.
  - Visualization: Joseph V. Ardizzone, Helen-Nicole Kostis.
  - Scientist: Lesley Ott.
  - Data: GEOS-FP 2 km Replay, DOI 10.5281/zenodo.21893141.
- **Lightning Events Detected from the ISS 2017–2023**, SVS ID 5011,
  https://svs.gsfc.nasa.gov/5011/.
  - Credit: NASA's Scientific Visualization Studio.
  - Visualizers: Michala Garrison (SSAI), Greg Shirah (NASA/GSFC), Kel Elkins (USRA),
    Alex Kekesi (Global Science and Technology, Inc.).
  - Data: Blakeslee, R. J. 2020, Quality Controlled LIS on ISS Science Data,
    NASA GHRC DAAC.
  - Base map: Natural Earth Gray Earth.
