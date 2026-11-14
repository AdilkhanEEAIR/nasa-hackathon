# EarthSonar

**Hear the planet change.** EarthSonar turns NASA Earth Information Center (EIC) visualizations
into live sound. A ring of sound sweeps in from far away toward any place you choose, so you
can *hear* where the lights, dust, smoke or lightning are around it. It is built first for
blind and low-vision people and works with the keyboard alone.

**Live site:** https://earthsonar.vercel.app

NASA Space Apps Challenge 2026 · Challenge: *The Earth Information Jukebox* · Bishkek

![EarthSonar during a ring scan around China, 2023](docs/screenshots/desktop-scan.jpg)

The site is a jukebox: pick a track, press Space.

| Track | Status |
|---|---|
| 01 Night Lights 2012–2023 | ✅ available |
| 02 What Changed, 2012 → 2023 | ✅ available |
| 03 Aerosols (dust, black carbon, sea salt, sulfate) | ✅ available |
| 04 Lightning from the ISS, 2017–2023 | coming next |
| Voice guide and explore mode | ✅ available (V toggles the voice, E explores point by point) |
| Tactile controller (Arduino, 4 vibration motors) | firmware and protocol ready; site link coming next |

---

## How it works: a sonar for Earth data

1. Choose a centre: India, China, Bishkek, Europe, or any point (arrow keys or a click).
2. A ring starts **1,500 km** away (adjustable) and shrinks onto the centre over 8 seconds.
3. The ring has 16 voices, one for each compass direction.
   - **Pitch is north–south:** voices on the north side of the ring sound high, voices on the
     south side sound low.
   - **Stereo is west–east:** west is in the left ear, east is in the right ear.
   - So a high note in your right ear means "north-east of the centre".
4. **Loudness and brightness are the data.** Where the ring passes over more light, its voice
   gets louder and brighter. Unlit land is a soft muffled hum, water is silent, and a click
   marks a coastline.
5. At the end the ring meets in **one note: the value at the centre**. A low thud means
   darkness there.

The ring is computed on the sphere (great-circle distance), so it is a true circle on Earth and
not a circle in map pixels. The same rule applies to every place and every year.

**Play all years (Y):** one note per year from 2012 to 2023, giving the average rendered
brightness inside the ring on a fixed scale. Higher note = brighter. You hear a decade of
change in seven seconds.

### Keyboard

| Key | Action |
|---|---|
| Space / Enter | Start or stop a ring scan |
| Arrow keys (Shift = ×5) | Move the centre by 1° |
| Page Up / Page Down, `]` / `[` | Next / previous year |
| Home / End | 2012 / 2023 |
| 1 2 3 4 | India, China, Bishkek, Europe |
| `.` / `,` | Bigger / smaller ring |
| + / − / 0 | Zoom the map in / out / reset (wheel, pinch and drag also work) |
| Y | Play all years |
| W | Where am I: year, centre, land or water, light level |
| S | Save the current scan as a WAV file |
| T | 10-second sound tutorial: north, east, south, west, dim vs bright |
| Shift + 1…4 | Choose a track |
| C | Coastline clicks on/off |
| Escape | Stop all sound |

Sound starts after the first key press or click, because browsers require a user gesture.
Every action is also a labelled button, so screen-reader users can work by Tab alone.

---

## How we address the challenge

Each item below is from the challenge's Objectives and Potential Considerations.

| Challenge item | EarthSonar feature | Status |
|---|---|---|
| **Objectives** | | |
| Generate dynamic sonifications from NASA's EIC visual frames | Sound is synthesized live (Web Audio) from the pixels of EIC frames as the ring moves. There are no pre-recorded tracks. | ✅ |
| Select or experience a specific EIC visualization alongside its soundscape | The map is shown with the moving ring; you choose the year, place and ring size. More visualizations are being added as modes. | ✅ night lights; others in progress |
| An interactive tool that actively translates the visual data into sound | The whole site is interactive: move, scan, compare years. | ✅ |
| …or a curated collection of original, generated audio files | **Save scan as WAV** renders any scan (track, year, place, ring size) offline with the same synthesis engine and downloads it, so listeners can build their own playlist of Earth sounds. | ✅ |
| Use computer vision on color palettes, shapes and pixel densities | Brightness thresholds, light-pixel density along each arc of the ring, hue classes for the change map and aerosol types, dot detection for lightning ([DATA_NOTES](docs/DATA_NOTES.md)). | ✅ brightness, density, change-map hues; aerosols and lightning coming next |
| Map them to pitch, tempo, instrumentation | Pitch = direction (or value in year sweeps), loudness and filter brightness = value, one instrument per colour class (3 for the change map, 4 for aerosols), tempo = lightning activity. | ✅ pitch, loudness, change-map instruments; aerosols and tempo coming next |
| ML, open-source synthesis frameworks, or custom data-driven rulesets | A **custom, documented ruleset** (below). We chose transparent rules over ML, so every sound can be traced to a pixel value. | ✅ (no ML, by choice) |
| Balance data interpretation with artistic, musically pleasing output | Major pentatonic scale (no clashing notes), smooth gain glides, a light synthetic room reverb. The data mapping is fixed and never "improved" per frame. | ✅ |
| A web-based jukebox | A static website on GitHub Pages: no install, no account. | ✅ |
| Convey the complexity of our changing planet through sound | Year sweeps (2012–2023) and the change map let you hear a decade of change in a region. | ✅ year sweep; change map in progress |
| **Potential Considerations** | | |
| Sonification as non-speech audio | All data is conveyed by non-speech sound. Speech is used only for navigation (place names, years). | ✅ |
| Extract individual frames from the animations | [`tools/prepare_media.py`](tools/prepare_media.py) extracts the exact frame for each year, measured frame by frame. | ✅ |
| UX: intuitively select a visualization and start the audio | One key or button to scan; presets for four regions; a "turn sound on" banner. | ✅ |
| Screen-reader compatibility | Labelled controls, live status region, map description that updates with every change, keyboard-only operation, visible focus. | ✅ |
| Tactile feedback | Arduino controller: joystick, year knob, button, **four vibration motors as a tactile compass** ([protocol](docs/PROTOCOL.md)). | firmware ✅; site link in progress |
| Rich descriptive text accompanying the audio | Spoken and on-screen summaries ("brightest year…", "at the centre: …"), help text and per-mode descriptions. | ✅ summaries; voice guide in progress |
| Map color, brightness, shapes, density to pitch, rhythm, tempo, volume, instrumentation | See *Value → sound rule*. | ✅ / in progress per mode |
| Strict translation vs musicality | Strict, fixed mapping from value to loudness; musicality comes only from the scale and the timbre. | ✅ |
| Computer vision, ML, synthesizers, DAWs | Custom computer vision and a browser synthesizer. No ML and no DAW. | ✅ (partly, by choice) |
| Document the process and the "why" | This README, [DATA_NOTES](docs/DATA_NOTES.md) and commented code. | ✅ |
| Emotional impact: urgency or beauty | Year sweeps make the human footprint at night audible. Aerosols will make the planet's connected air audible (Saharan dust crossing the Atlantic). We do not claim climate trends that these frames do not show. | partial |

---

## Value → sound rule

The same fixed rule applies to every frame of a dataset. There is no per-frame normalization,
so equal pixel values always give equal sounds.

**Night lights**

| Step | Rule |
|---|---|
| Pixel → light level | `level = 0` if `max(R,G,B) ≤ 45`, otherwise `(max − 45) / 210`, capped at 1. The base map never exceeds 34 (ice), so unlit land and water are 0. |
| Arc of the ring → value | Mean light level over sample points every ≤ 40 km along the arc, each averaged over a 3×3 pixel box (about 60 km). |
| Value → loudness | `gain = min(1, value / 0.08) ^ 0.7` |
| Value → timbre | Low-pass cutoff from 600 Hz (dim) to 4800 Hz (bright). |
| Direction → pitch | 9 degrees of G-major pentatonic from G3. North = top degree, south = bottom, east/west = middle. |
| Direction → stereo | `pan = 0.9 · sin(bearing)` (west left, east right). |
| Land / water | More than half the arc on land and no lights: quiet hum (320 Hz low-pass). Water: silence. Crossing a coast: a click panned to that direction. |
| Centre note | Light level at the centre → loudness and brightness of the final chord. Zero gives a low thud. |
| Year sweep | Mean light level inside the ring disk → 15 pentatonic degrees on a log scale from 0.001 to 0.03, the same for every region and year. |

**What Changed (2012 → 2023)**

The change map colours each lit pixel by the direction of change. EarthSonar gives each
direction its own instrument. The compass rule (pitch and stereo) and the loudness rule are
the same as for night lights.

| Pixel class (measured thresholds) | Instrument |
|---|---|
| More light, purple: `B > R+10` and `B > G+20` | Triangle wave one octave **up**, bright filter: a high sparkle |
| Less light, orange: `R > B+30` and `G > B+10` | Sawtooth one octave **down**, dark filter: a low muffled buzz |
| Little change, any other lit pixel (near-white) | Soft sine at the compass pitch, at 45% loudness, so change stands out |
| Base map (`max ≤ 45`) | Silent, or a land hum as above |

- **Centre note:** two rising notes for "more light", two falling notes for "less light", one
  chord for "little change", a low thud for darkness.
- **Ring summary (Y):** how the lit area inside the ring divides between the three classes,
  played as three notes whose loudness is each share, and read out as percentages.
- The direction of change is reliable. Its magnitude is approximate, because on-map
  brightness also carries the underlying light level ([DATA_NOTES](docs/DATA_NOTES.md) 1.4).

---

**Aerosols (19 August 2025, 20:00 UTC)**

The GEOS aerosol frame colours four particle types, and the legend gives no amounts.
EarthSonar classifies each pixel and plays each class on its own instrument.

| Pixel class | Rule | Instrument |
|---|---|---|
| Black carbon (smoke) | nearest legend chromaticity (210, 94, 69) | Crackle over a low rumble, like fire |
| Dust | nearest legend chromaticity (193, 154, 220) | Dry, high rustle (band-passed noise) |
| Sea salt | nearest legend chromaticity (133, 170, 169); **never on land**, where grey relief has the same chromaticity | Soft surf: low noise that swells and recedes |
| Sulfate | nearest legend chromaticity (83, 220, 52) | Buzzing square-wave tone |
| None | max channel < 35, or a small white dot on land (a city of the base map) | Silence, or the land hum |

- **Amount** is brightness above the base map: `(max − 62) / 193` on land and
  `(max − 35) / 220` over water. It is a relative amount only, because the legend has no
  scale.
- **Full loudness** is reached at an arc mean of 0.6. This is fixed for the frame, and the
  aerosols cover the map far more densely than night lights do.
- **Ring summary (Y):** each class inside the ring plays on its own instrument, largest share
  first, and the shares are read out.
- Classification runs once in `tools/prepare_media.py`, which writes a lossless class grid.
  On this frame: smoke 1.7% of pixels, dust 3.7%, sea salt 19.4%, sulfate 14.6%.

### Sound palette

One law for every track:
- **timbre** says *what* the phenomenon is;
- **pitch** says *where* it is on the north–south axis;
- **stereo** says west or east;
- **loudness** says *how much*.

For noise-based instruments, the centre of the noise band follows the same compass pitch.

| Phenomenon | Instrument |
|---|---|
| City lights | Warm triangle tone that opens up (gets brighter) with more light |
| More light (change) | High, bright sparkle (one octave up) |
| Less light (change) | Low, muffled buzz (one octave down) |
| Little change | Soft, quiet sine |
| Smoke, black carbon | Crackle with a low rumble |
| Dust | Dry rustle |
| Sea salt | Soft surf |
| Sulfate | Buzzing tone |
| Unlit land / water / coast | Muffled hum / silence / click |

Loudness is matched in two steps, both measured from offline renders:
- each instrument at full value gives about the same RMS;
- each track has a fixed trim, so a full scan averages RMS 0.07–0.12 with peaks at or below
  0.75. Dense and sparse maps sound equally loud, and nothing clips.

## Data and processing

| Visualization | NASA SVS ID | Frames we use |
|---|---|---|
| Change in Night Lights between 2012 and 2023 – EIC Version | [5313](https://svs.gsfc.nasa.gov/5313/) | One frame per year from the first, inset-free pass (frames 7 … 235), and the change map (frame 400). |
| GEOS Aerosols | [5669](https://svs.gsfc.nasa.gov/5669/) | The single frame 2025-08-19 20:00 UTC and its legend. |
| Lightning Events Detected from the ISS 2017–2023 | [5011](https://svs.gsfc.nasa.gov/5011/) | The Science On a Sphere movie, re-encoded at 30 fps, with per-frame dates from the official `labels.txt`. |

- All frame indices, crop boxes and map georeferences were measured from the pixels and are
  documented in [`docs/DATA_NOTES.md`](docs/DATA_NOTES.md).
- `tools/prepare_media.py` turns the raw downloads (not in this repository: one file is
  334 MB) into the web files in `media/`. Each file is under 50 MB.
- The night-lights EIC frame contains the world twice, side by side. We keep one copy, remove
  the colorbar overlay by patching from the other copy, and roll it so that 180° W is at the
  left edge.
- **Lightning dates:** the official SOS `labels.txt` (SVS 5011) writes every 2023 date as
  **"2003"**: it jumps from December 2022 to January 2003. We correct these to 2023 in
  `media/lightning/dates.json`.

## Limitations (please read)

- **We sonify the rendered visualization, not the raw measurements.** Pixel colors are the
  SVS display mapping. They are not calibrated radiance, aerosol mass or flash counts. When we
  say "brighter", we mean brighter on the rendered map. Changes in individual countries are
  reported as measured on the map, without interpretation.
- City lights saturate the color scale in the brightest cores, so the loudest sounds
  compress real differences between very bright cities.
- The night-lights map is about 21 km per pixel in our web version, so small towns blend
  together.
- **The aerosol legend is categorical** (black carbon, dust, sea salt, sulfate) with no
  quantitative scale. Brightness is only a relative amount. Sea salt is hard to separate from
  the grey land base and from faint sulfate. Overlapping plumes blend colors, so we report the
  dominant type.
- **Lightning coverage is about ±52° latitude** (the ISS orbit). Silence further north or
  south means "no data", not "no lightning". Each dot is shown for a 10-day window, so dots
  are accumulated detections, not individual real-time strikes.
- The change map shows the *direction* of change reliably (more / less / same). Its
  magnitude is approximate.

## Zoom and pan (visual only)

- The mouse wheel and pinch zoom toward the cursor, dragging moves the map, and a click sets
  the ring centre. Keys: `+`, `−`, `0`.
- **Zoom never changes the sound.** The ring is defined in kilometres on the sphere and reads
  the same sound grids at every zoom level.
- The ring, its loud arcs and the centre ripple are drawn through the same camera as the map,
  so they stay geographically aligned. Tests check the screen ↔ map ↔ degrees conversion.
- Past 1.5× the full-resolution source frame (3840 px) is fetched, for the frame on screen
  only.
- Zoom stops at **6×**. Beyond that each source pixel spans about two screen pixels and only
  gets blurrier.
- A selected preset, or a centre moved with the arrow keys, is kept in frame.

## Loading speed

**First-screen budget: 0.25 MB.** That covers HTML, CSS, JS, the manifest, one map view, one
sound grid and the land mask. Everything else loads after the player is ready: the other years
in the background, other tracks when you pick them. The audio engine is available at once, and
a Space press during loading starts the scan as soon as the data arrives.

| Measured on https://earthsonar.vercel.app, cold cache, headless Chrome ([`tools/measure_load.mjs`](tools/measure_load.mjs)) | Fast 4G | Slow 4G | Sent before ready |
|---|---|---|---|
| Before (all 12 years as lossless PNG, sequential requests), no warm-up | 3.05 s | 4.74 s | 0.64 MB (7.4 MB total) |
| After, same method, no warm-up | 2.19 s | 1.58 s | 0.14 MB |
| After, warm-up + median of 3 runs | **0.85 s** | **1.43 s** | **0.14 MB** |

- **Sound and sight are separate files.**
  - Sound grids are lossless 8-bit PNGs that hold the exact values the sonification uses.
    A test confirms the browser decodes them byte-for-byte as written.
  - Map views are WebP (JPEG fallback) and are only for the eyes. One year is a 0.06 MB view
    plus a 0.03 MB sound grid.
- Media file names carry a content hash and are served with
  `Cache-Control: immutable, max-age=1 year`. Repeat visits load them from cache. Only
  `manifest.json` is re-checked.
- Long loads show a progress bar, and the live region and the voice guide announce them.

## Accessibility

- Works with the keyboard alone, and with or without a screen reader. Tested with keyboard
  navigation; screen-reader testing is ongoing.
- A live status region announces every change. The map has a text description that updates
  with the year and centre.
- Large controls (48 px), visible focus, high contrast, keyboard hints always on screen, and a
  10-second sound tutorial (T).
- **Motion shows only what is sounding:**
  - the shrinking ring, with loud arcs drawn thicker;
  - 16 voice bars around a compass, and four N/E/S/W bars for the vibration motors;
  - a year chip that lights up as its note plays;
  - one ripple at the centre when the final note sounds.
- Changes you make from the keyboard are instant, never animated. Only transform and opacity
  are animated, or a separate canvas is drawn over the map.
- Nothing flashes more than about twice per second.
- With `prefers-reduced-motion`, all transitions become instant and the ripple becomes a static
  mark. The sound is identical.
- Designed for blind and low-vision users. Our user tests are blindfolded tests with sighted
  volunteers; results will be added here only as measured.

## Tactile controller

Optional. The site works fully without it. An Arduino with a joystick (move the centre), a
knob (year), a button (scan) and **four vibration motors (N, E, S, W)** connects by USB through
Web Serial (Chrome or Edge).

- Protocol and wiring: [`docs/PROTOCOL.md`](docs/PROTOCOL.md)
- Firmware: [`firmware/earthsonar_controller`](firmware/earthsonar_controller/earthsonar_controller.ino)

## Run locally

```bash
python -m http.server 8000      # then open http://localhost:8000
node --test "tests/*.test.js"   # ring geometry, georeferencing, sound mapping
python tools/prepare_media.py   # rebuild media/ from datasets/ (needs ffmpeg, numpy, Pillow)
```

Pixel reading needs the page to be served over http(s). Opening `index.html` as a file will
not work.

## Use of artificial intelligence

- **Code and documentation:** written with Claude (Anthropic, Claude Code) under the team's
  direction. The team reviewed, ran and tested everything. This includes the web app, tests,
  the media preparation script, the Arduino firmware, and the drafts of this README,
  `docs/DATA_NOTES.md` and `docs/PROTOCOL.md`.
- **Data analysis:** frame measurements were made by scripts written with Claude and checked by
  looking at the frames.
- **No AI-generated images, audio or video** are used. All visuals are NASA SVS frames, and all
  sound is synthesized by the rules above.
- No NASA logos or insignia are used or modified.

## Credits and references

**NASA visualizations (data used)**

- **Change in Night Lights between 2012 and 2023 – EIC Version**, NASA SVS ID 5313,
  https://svs.gsfc.nasa.gov/5313/.
  - Credit: NASA's Scientific Visualization Studio.
  - Visualizer: Kel Elkins (USRA).
  - Scientists: Zhuosen Wang (University of Maryland), Miguel Román (Leidos), Ranjay Shrestha
    (SSAI), Srija Chakraborty (USRA), Virginia Kalb (NASA).
  - Data: NASA Black Marble, Suomi NPP VIIRS.
- **GEOS Aerosols**, NASA SVS ID 5669, https://svs.gsfc.nasa.gov/5669/.
  - Credit: NASA Global Modeling and Assimilation Office (GMAO) and NASA's Scientific
    Visualization Studio.
  - Visualizers: Joseph V. Ardizzone, Helen-Nicole Kostis.
  - Scientist: Lesley Ott.
  - Data: GEOS-FP 2 km Replay, DOI 10.5281/zenodo.21893141.
- **Lightning Events Detected from the International Space Station (ISS) 2017–2023**, NASA SVS
  ID 5011, https://svs.gsfc.nasa.gov/5011/.
  - Credit: NASA's Scientific Visualization Studio.
  - Visualizers: Michala Garrison (SSAI), Greg Shirah (NASA/GSFC), Kel Elkins (USRA),
    Alex Kekesi (Global Science and Technology, Inc.).
  - Data: Blakeslee, R. J. 2020, Quality Controlled Lightning Imaging Sensor (LIS) on
    International Space Station (ISS) Science Data, NASA Global Hydrology Resource Center DAAC.
  - Base map: Natural Earth Gray Earth.
  - SOS label file `labels.txt` from the same page.
- Source collection: NASA Earth Information Center content database,
  https://svs.gsfc.nasa.gov/gallery/earth-information-center/.

**Method inspiration**

- Data Sonification: Caldwell 73, NASA SVS ID 13786, https://svs.gsfc.nasa.gov/13786/.
  Listed in the challenge resources.
- The ring-scan idea follows NASA's SYSTEM Sounds sonification of RS Puppis
  (https://svs.gsfc.nasa.gov/14260/), where a ring moves toward the centre of an image. We
  reuse only the principle; no part of that image or audio is used.

**Software and tools**

- Browser APIs: Web Audio, Web Serial, Web Speech, Canvas 2D. No third-party JavaScript
  libraries.
- Media preparation: FFmpeg (LGPL/GPL), Python, NumPy (BSD), Pillow (MIT-CMU).
- Tests: the Node.js built-in test runner.

**Team**

Adilkhan Dzhanteliev (software, data, deployment) and teammates (hardware).

EarthSonar is an independent Space Apps project and is not endorsed by NASA.
