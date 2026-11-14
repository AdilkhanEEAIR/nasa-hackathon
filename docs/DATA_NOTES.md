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

Defender result for `datasets/ecco2`: "found no threats".

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
