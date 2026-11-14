# EarthSonar — NASA Space Apps Challenge 2026 submission texts

Ready-to-paste text for each field of the submission form. Challenge: **The Earth Information
Jukebox**. Local event: Bishkek.

- **Final project (open, no login):** https://earthsonar.vercel.app
- **Source code:** https://github.com/AdilkhanEEAIR/nasa-hackathon
- **Demo video:** `[paste the YouTube / Drive link after uploading — 28 s, English subtitles burned in]`
- **Demo tab used to record it:** https://earthsonar.vercel.app/#demo (the old `/?demo` address still opens it)
- **Player:** https://earthsonar.vercel.app/#jukebox · **How it works:** https://earthsonar.vercel.app/#how · **Data & credits:** https://earthsonar.vercel.app/#data

---

## Project Name

EarthSonar

## High-Level Project Summary

EarthSonar is a web jukebox that turns NASA Earth Information Center visualizations into live
sound, so people who cannot see a map can still explore it. You pick a track (night lights
2012–2023, what changed, aerosols, lightning from the ISS, ocean temperature) and a place. A
"ring of sound" closes in on that place:
- high notes come from the north and low notes from the south;
- the left ear is west and the right ear is east;
- louder means more.

Each phenomenon has its own recognisable voice. Lightning cracks, dust rustles, smoke
crackles, warm water sounds bright. EarthSonar works with the keyboard alone and with screen
readers, and it can drive an Arduino controller with four vibration motors as a tactile
compass. It matters because Earth science is shown almost only as pictures. EarthSonar gives
blind and low-vision people, and everyone else, a new way to hear where our planet is
changing.

## Link to Project Demo

`[YouTube/Drive link]` — 28 seconds, English subtitles on screen.

## Link to Final Project

https://earthsonar.vercel.app (the player itself: https://earthsonar.vercel.app/#jukebox; source: https://github.com/AdilkhanEEAIR/nasa-hackathon)

## Detailed Project Description

**What it does.**

EarthSonar is a "jukebox" of NASA Earth Information Center (EIC) visualizations, each played
as live, data-driven sound:

1. **Night Lights 2012–2023.** A decade of city lights. One key plays all twelve years as a
   rising or falling melody for any region.
2. **What Changed.** More light, less light and little change between 2012 and 2023, each
   with its own instrument.
3. **Aerosols.** Black carbon (smoke), dust, sea salt and sulfate from the GEOS model, as four
   instruments.
4. **Lightning.** Six years of flashes detected from the International Space Station, played
   as strikes in their real direction while the video runs.
5. **Ocean Temperature.** Sea surface currents coloured by temperature, from a dull cold tone
   to a bright warm one.

**How it works.**

- You choose a centre: a preset (India, China, Bishkek, Europe), the arrow keys, a click, or
  the controller's joystick.
- A ring of 16 voices starts up to thousands of kilometres away and shrinks onto the centre.
- **Each voice reads one arc of the ring.** Its pitch follows north–south, its stereo position
  follows west–east, its loudness follows the value on the map, and its timbre tells *what*
  the value is.
- At the end the ring meets in a single note: the value at the centre.
- The ring is computed on the sphere (great-circle distance), so it is a true circle on Earth
  at any zoom.

Other modes:
- **Explore mode** turns the centre into a probe you can walk around.
- **A voice guide** names places ("110 km south of Bishkek"), years and summaries.
- **Save scan as WAV** renders any scan offline, so people can build their own playlist of
  Earth sounds.

**Scientific honesty.**

- We sonify the rendered visualizations, as the challenge asks, not raw measurements.
- Every rule "pixel → value → sound" is fixed per dataset, documented, and never normalised
  per frame:
  - light thresholds;
  - legend-colour classification for aerosols;
  - hue matching against the official colorbar for temperature (round-trip error ≤ 1.5 °C);
  - yellow-dot detection for lightning.
- Limits are stated in the app and in the README:
  - the aerosol legend is categorical;
  - lightning coverage is ±52°, so silence there means "no data";
  - the ocean frame is one model day and is not a trend.
- Every frame index, crop and georeference was measured from the pixels and is written up in
  `docs/DATA_NOTES.md`.

**Accessibility.**

- Fully keyboard-operable, with labelled controls and a live status region.
- A spoken guide that can be turned off for screen-reader users.
- A short sound tutorial ("top is north, right is east, louder is brighter").
- Large controls, high contrast, keyboard hints always on screen.
- `prefers-reduced-motion` support. Animations only show what is sounding.

**Hardware.**

- An optional Arduino controller: a joystick moves the centre, a knob picks the year, a button
  plays.
- Four vibration motors (N/E/S/W) form a tactile compass driven by the same ring.
- It connects over USB with Web Serial, no drivers needed. The protocol and firmware are open.

**Tools.**

- A plain static website: HTML, CSS and JavaScript (Web Audio, Web Speech, Web Serial,
  Canvas), with no third-party JavaScript libraries.
- Media preparation in Python with NumPy, Pillow and FFmpeg.
- Arduino C++ firmware.
- Hosted on Vercel. Automated tests use the Node.js test runner.
- First-screen load is about 0.14 MB, ready in under 1.5 s on slow 4G.

**What we hope to achieve.** Make the EIC's visual stories reachable by ear and by touch, for
blind and low-vision visitors first, and give every listener a new, musical sense of where the
planet is bright, smoky, stormy, warm or cold.

## NASA Data

All visualizations come from NASA's Scientific Visualization Studio (SVS) and the Earth
Information Center collection listed in the challenge resources.

1. **Change in Night Lights between 2012 and 2023 – EIC Version**, SVS ID 5313,
   https://svs.gsfc.nasa.gov/5313/.
   - Credit: NASA's Scientific Visualization Studio.
   - Visualizer: Kel Elkins (USRA).
   - Scientists: Zhuosen Wang (University of Maryland), Miguel Román (Leidos), Ranjay
     Shrestha (SSAI), Srija Chakraborty (USRA), Virginia Kalb (NASA).
   - Data: NASA Black Marble (Suomi NPP VIIRS).
   - *Use:* one frame per year (2012–2023) and the change map, read pixel by pixel for the
     Night Lights and What Changed tracks.
2. **GEOS Aerosols**, SVS ID 5669, https://svs.gsfc.nasa.gov/5669/.
   - Credit: NASA Global Modeling and Assimilation Office (GMAO) and NASA's Scientific
     Visualization Studio.
   - Visualizers: Joseph V. Ardizzone, Helen-Nicole Kostis.
   - Scientist: Lesley Ott.
   - Data: GEOS-FP 2 km Replay, DOI 10.5281/zenodo.21893141.
   - *Use:* the 19 Aug 2025 20:00 UTC frame and its legend, classified into four aerosol types.
3. **Lightning Events Detected from the International Space Station (ISS) 2017–2023**, SVS ID
   5011, https://svs.gsfc.nasa.gov/5011/.
   - Credit: NASA's Scientific Visualization Studio.
   - Visualizers: Michala Garrison (SSAI), Greg Shirah (NASA/GSFC), Kel Elkins (USRA), Alex
     Kekesi (Global Science and Technology, Inc.).
   - Data: Blakeslee, R. J. 2020, Quality Controlled LIS on ISS Science Data, NASA GHRC DAAC.
   - *Use:* the Science On a Sphere movie, read frame by frame. Per-frame dates come from the
     official `labels.txt`, where we correct a "2003" typo to 2023.
4. **Global Sea Surface Currents and Temperature**, SVS ID 3912,
   https://svs.gsfc.nasa.gov/3912/.
   - Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio.
   - Animators: Greg Shirah, Horace Mitchell, Eric Sokolowsky.
   - Producer: Michael Starobin.
   - Scientists: Hong Zhang (UCLA), Dimitris Menemenlis (NASA/JPL).
   - Data: ECCO2 model.
   - *Use:* one flat frame (19 June 2007) and the SST colorbar. Temperature is recovered by
     hue.
5. **Method reference:** Data Sonification: Caldwell 73, SVS ID 13786,
   https://svs.gsfc.nasa.gov/13786/ (in the challenge resources). The ring scan also follows
   the principle of NASA's RS Puppis sonification (SVS 14260); no part of it is reused.

## Space Agency Partner & Other Data

- **Other data:** none beyond NASA SVS frames.
- **Built-in place names:** a short list of large-city coordinates used only to *say* where you
  are. It is never sonified.
- **Base maps** inside the NASA frames: Natural Earth (public domain), as credited by SVS.
- **Optional map labels** (key L, visual only, never sonified): Natural Earth 1:110m country
  borders and populated places (public domain, naturalearthdata.com).
- **Reviewed and not used:** SVS 5196 (CO₂), 4950 (GEDI) and 5533 (air quality). Their colours
  cannot be turned into values honestly: missing numeric scales, transparency, shading, or
  mixed variables. Details are in docs/DATA_NOTES.md section 8.
- **Software (all open):**
  - FFmpeg (LGPL/GPL), Python, NumPy (BSD), Pillow (MIT-CMU), Node.js test runner;
  - browser APIs: Web Audio, Web Speech, Web Serial, Canvas;
  - Arduino core.
- No NASA logos or insignia are used.

## Use of Artificial Intelligence

- **Code and documentation:** written with Claude (Anthropic's Claude Code), under the team's
  direction and with the team's review. The team chose the idea, the design, the datasets and
  the sound rules, and ran and checked everything. Automated tests cover the geometry, the
  sound mapping and the hardware protocol. AI assistance covered the web app, the tests, the
  media preparation scripts, the Arduino firmware, and drafts of the README, data notes and
  these texts.
- **No AI-generated images, video or audio.** Every image is an original NASA SVS frame
  (resized or cropped). Every sound is synthesised live in the browser by fixed,
  documented rules. No AI model makes or changes any sound.
- **Data analysis:** done with scripts and checked against the frames by eye. No AI model
  interprets the data at run time.
- **No NASA branding** was generated or modified.

## Project Submission Verification

Tick both boxes in the form: agreement to the terms, and confirmation that the work is
original.

---

### Checklist against the submission rules (NOTES.local.md 5.3–5.6)

| Rule | Status |
|---|---|
| Demo ≤ 30 s with English subtitles, or ≤ 7 slides | ✅ the Demo tab (/#demo) runs exactly 28 s with on-screen English subtitles. ✅ slides: 7 pages, PDF in `docs/EarthSonar-slides.pdf` |
| Demo hosted externally, open link, no login | ⏳ **you** upload the recording (YouTube unlisted/public, or Drive "anyone with the link") |
| Final project link open without login | ✅ https://earthsonar.vercel.app (checked without cookies) |
| Everything in English | ✅ site, README, DATA_NOTES, PROTOCOL, these texts, slides |
| NASA data used | ✅ 4 SVS datasets (more if the globe tracks pass review) |
| AI use declared; AI images/video watermarked | ✅ declared above. No AI images or video exist, so no watermark is needed |
| No NASA logo/insignia | ✅ none in the site, slides or video |
| No personal data, no ads | ✅ |
| References for all code, text, images | ✅ README "Credits and references" |
| Team registered, Bishkek event selected, members listed | ⏳ **you**: check on spaceappschallenge.org before the deadline |
| Terms and originality boxes ticked | ⏳ **you**, in the form |
| Blindfold test results | ⏳ **you**: run the test. Its slot in the slides is empty on purpose; no numbers are invented |
