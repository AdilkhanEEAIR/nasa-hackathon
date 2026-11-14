# EarthSonar

**Hear the planet change.** EarthSonar turns NASA Earth Information Center (EIC) visualizations
into live sound. A ring of sound sweeps in from far away toward any place you choose, so you
can *hear* where the lights, dust, smoke or lightning are around it. It is built first for
blind and low-vision people and works with the keyboard alone.

**Live site:** https://adilkhaneeair.github.io/nasa-hackathon/

NASA Space Apps Challenge 2026 · Challenge: *The Earth Information Jukebox* · Bishkek

![EarthSonar during a ring scan around China, 2023](docs/screenshots/desktop-scan.jpg)

The site is a jukebox: pick a track, press Space.

| Track | Status |
|---|---|
| 01 Night Lights 2012–2023 | ✅ available |
| 02 What Changed, 2012 → 2023 | coming next |
| 03 Aerosols (dust, black carbon, sea salt, sulfate) | coming next |
| 04 Lightning from the ISS, 2017–2023 | coming next |
| Voice guide and explore mode | coming next |
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
| + / − | Bigger / smaller ring |
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
| Use computer vision on color palettes, shapes and pixel densities | Brightness thresholds, light-pixel density along each arc of the ring, hue classes for the change map and aerosol types, dot detection for lightning ([DATA_NOTES](docs/DATA_NOTES.md)). | ✅ brightness and density; color classes in progress |
| Map them to pitch, tempo, instrumentation | Pitch = direction (or value in year sweeps), loudness and filter brightness = value, one instrument per aerosol type, tempo = lightning activity. | ✅ pitch, loudness; instruments and tempo in progress |
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

---

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
