# Sixth Sense — submission texts

Ready-to-paste text for the fields of the NASA Space Apps Challenge 2026 submission form.

- **Project name:** Sixth Sense — Hear and feel Earth data
- **Team:** Rococo
- **Members:** Dzhanteliev Adilkhan, Sakybaev Meder, Osmonbaev Aibek, Emilev Bektur
- **Local event:** Bishkek, Ala-Too International University, Kyrgyzstan, 14–15 November 2026
- **Challenge:** The Earth Information Jukebox

---

## High-level summary

Sixth Sense is a web jukebox that turns NASA Earth Information Center visualizations into live
sound and vibration, so people who cannot see a map can still explore it. You choose one of
eight tracks (night lights 2012–2023, aerosols, lightning seen from the ISS, ocean temperature,
near-surface wind, forest height, carbon dioxide, an atmospheric river) and a place on Earth.
A ring of sound closes in on that place: high notes come from the north and low notes from
the south, the left ear is west and the right ear is east, and louder means more. Each
phenomenon has its own voice: lightning cracks, dust rustles, smoke crackles, wind rushes.

It answers the challenge directly: EIC visual frames are paired with sonifications generated
in real time in the browser, nothing is pre-recorded, and accessibility is the starting point,
not an add-on. It matters because Earth science is shown almost only as pictures, while the
World Health Organization reports that at least 2.2 billion people have a near or distance
vision impairment. Sixth Sense gives them, and everyone else, a way to hear and feel where the
planet is bright, smoky, stormy, warm or cold.

## Project demo

Seven slides (PDF, English):
https://github.com/AdilkhanEEAIR/nasa-hackathon/blob/main/docs/SixthSense-slides.pdf

A 28-second live demo with English captions also runs on the site itself:
https://earthsonar.vercel.app/#demo

## Final project link

https://earthsonar.vercel.app

Source code: https://github.com/AdilkhanEEAIR/nasa-hackathon

## Project details

**What it does.** Sixth Sense is a jukebox of eight NASA visualizations, each played as live,
data-driven sound.

1. **Night Lights 2012–2023.** A decade of city lights. One key plays all twelve years as
   twelve notes for any region.
2. **Aerosols.** Smoke, dust, sea salt and sulfate as four instruments.
3. **Lightning.** Six years of flashes detected from the International Space Station: a crack
   for each new flash in its real direction, a rumble for stormy regions.
4. **Ocean Temperature.** Cold water is a low hum, warm water rings high; where currents are
   dense the tone slides.
5. **Near-Surface Wind.** Rushing air that grows with speed; a whistle joins in strong wind.
6. **Forest Height (GEDI).** Dry wooden strikes where a needle crosses vegetation on a
   turning globe.
7. **Carbon Dioxide (DYAMOND).** A breath that swells as a plume passes under the needle.
8. **Atmospheric River.** Flowing water where the needle crosses the river of vapour.

**How it works.**

- You choose a centre (presets, arrow keys, a click or a game controller) and a ring size
  from 250 to 4,000 km.
- A ring of 16 voices starts that far away and shrinks onto the centre. It is computed on the
  sphere with great-circle geometry, and re-read 30 times a second.
- Each voice averages the pixel values on its own arc. Direction sets its pitch and stereo
  position, the value sets loudness and brightness, the phenomenon sets the instrument.
- All notes come from one pentatonic scale, so any combination is consonant: the data decides
  which notes sound, the scale keeps it musical.
- The scan ends in one note for the value at the centre, and a sentence for screen readers.
- Globe videos and 3D stills use a needle of 12 voices instead of a ring.
- All scales are fixed. The same sound always means the same pixel value, in every year and
  place.

**Two honest classes.** Tracks 1–5 are *Data-true*: values are read back from the
visualization's own colour scale. Tracks 6–8 are *Visual*: they sonify the picture (hue,
brightness), not calibrated measurements, and every intro says so.

**Accessibility.**

- Everything works from the keyboard; every action is also a labelled button.
- A live region announces every action and result for screen readers.
- The Accessibility menu is the first control on every page: an optional voice guide, large
  text with high contrast, and Haptics.
- Touch: phone vibration on Android and rumble on a game controller follow the same values
  as the sound.
- `prefers-reduced-motion` is respected; contrast is AA; data colours are colour-blind checked.

**What is new.** Most image sonifications sweep a line across the picture. A ring centred on
the listener's own place gives direction and distance: "a loud, high sound in my right ear"
means "something strong to the north-east of me". The listener steers it, explores point by
point, and can feel it.

**Limits we state openly.**

- We sonify the rendered visualization, not raw measurements.
- Night-lights pixels are about 21 km wide; the aerosol legend has no numbers; lightning is
  seen only between about 52° north and south; ocean temperature is one model day; wind reads
  from 3.6 to 34 m/s.
- Vibration works on Android phones (Chrome) and on computers with a rumble controller
  (Chrome or Edge). It does not work on iPhone or iPad. It was checked in browser emulation
  only, not yet on physical devices.
- Designed for blind and low-vision users. It has not yet been tested with blind users, and
  no listening-test results are claimed.

**Tools.** A static website in plain HTML, CSS and JavaScript (Web Audio, Canvas, Web Speech,
Gamepad and Vibration APIs), with no third-party JavaScript libraries. Media preparation in
Python with NumPy, Pillow and FFmpeg. Hosted on Vercel. 89 automated unit tests and
headless-browser checks.

**What we hope to achieve.** Make the Earth Information Center's visual stories reachable by
ear and by touch, for blind and low-vision people first.

## AI and NASA data

**Use of artificial intelligence.**

- Code and documentation were written with Claude (Anthropic), through Claude Code, under the
  team's direction and with the team's review. This covers the web app, the tests, the media
  preparation scripts, the firmware kept for future work, and drafts of the README, the data
  notes, the sound-design document, the slides and these texts.
- The team chose the idea, the design, the datasets and the sound rules, and ran and checked
  the result.
- No AI-generated images, video or audio. Every image is an original NASA SVS frame, resized
  or cropped. Every sound is synthesised live in the browser by fixed, documented rules. No
  AI model interprets the data or makes any sound at run time.
- No NASA logos or insignia were generated, used or modified.

**NASA data.** All frames come from the NASA Scientific Visualization Studio (SVS). The site
reads their pixels and turns them into sound; the exact rules are in `docs/SOUND_DESIGN.md`,
and file addresses, checksums and measurements are in `docs/DATA_NOTES.md`.

| Track | NASA SVS visualization | How it is used |
|---|---|---|
| Night Lights | Change in Night Lights between 2012 and 2023 – EIC Version, SVS 5313, https://svs.gsfc.nasa.gov/5313/ | one frame per year; brightness → loudness |
| Aerosols | GEOS Aerosols, SVS 5669, https://svs.gsfc.nasa.gov/5669/ | legend colour → particle type → instrument |
| Lightning | Lightning Events Detected from the ISS 2017–2023, SVS 5011, https://svs.gsfc.nasa.gov/5011/ | video; new yellow dots → strikes |
| Ocean Temperature | Global Sea Surface Currents and Temperature, SVS 3912, https://svs.gsfc.nasa.gov/3912/ | hue on the colour bar → 0–32 °C → register |
| Near-Surface Wind | GEOS-FP Near-Surface Wind Speed, SVS 5148, https://svs.gsfc.nasa.gov/5148/ | colour bar → 3.6–34 m/s → rushing air |
| Forest Height | GEDI Forest Height, SVS 4950, https://svs.gsfc.nasa.gov/4950/ | Visual: green in the picture → wooden strikes |
| Carbon Dioxide | DYAMOND Global Carbon Dioxide, SVS 5196, https://svs.gsfc.nasa.gov/5196/ | Visual: plume colour → breath |
| Atmospheric River | A 3D View of an Atmospheric River from an Earth System Model, SVS 4960, https://svs.gsfc.nasa.gov/4960/ | Visual: vapour blue → flowing water |

Source collection: NASA Earth Information Center content database,
https://svs.gsfc.nasa.gov/gallery/earth-information-center/. Seven of the eight
visualizations are in the challenge's resource list; SVS 5148 is an SVS page tagged Earth
Information Center.

**Space agency partner and other data.** None beyond the NASA SVS frames, except:

- Natural Earth 1:110m borders and populated places (public domain,
  https://www.naturalearthdata.com), an optional visual label layer that is never sonified;
- a short built-in list of large-city coordinates, used only to say where you are.

## References

**NASA visualizations and credits**

1. Change in Night Lights between 2012 and 2023 – EIC Version, SVS 5313. NASA's Scientific
   Visualization Studio; visualizer Kel Elkins. Data: NASA Black Marble (Suomi NPP VIIRS).
2. GEOS Aerosols, SVS 5669. NASA Global Modeling and Assimilation Office and NASA's Scientific
   Visualization Studio; Joseph V. Ardizzone, Helen-Nicole Kostis; scientist Lesley Ott.
   Data: GEOS-FP 2 km Replay, DOI 10.5281/zenodo.21893141.
3. Lightning Events Detected from the International Space Station (ISS) 2017–2023, SVS 5011.
   NASA's Scientific Visualization Studio; Michala Garrison, Greg Shirah, Kel Elkins, Alex
   Kekesi. Data: Blakeslee, R. J. 2020, Quality Controlled Lightning Imaging Sensor (LIS) on
   International Space Station (ISS) Science Data, NASA GHRC DAAC.
4. Global Sea Surface Currents and Temperature, SVS 3912. NASA/Goddard Space Flight Center
   Scientific Visualization Studio; Greg Shirah, Horace Mitchell, Eric Sokolowsky. Data: ECCO2.
5. GEOS-FP Near-Surface Wind Speed, SVS 5148. NASA's Global Modeling and Assimilation Office;
   visualizer Joseph V. Ardizzone. Data: GEOS-FP.
6. GEDI Forest Height, SVS 4950. NASA's Scientific Visualization Studio; Kel Elkins, Horace
   Mitchell, Greg Shirah; scientists Temilola Fatoyinbo, Atticus Stovall. Data: GEDI L2B RH100.
7. DYAMOND Global Carbon Dioxide, SVS 5196. NASA's Scientific Visualization Studio;
   AJ Christensen, Greg Shirah, Helen-Nicole Kostis, Mark SubbaRao; scientists Lesley Ott,
   Brad Weir, William Putman, Tomohiro Oda. Data: DYAMOND (GEOS-MITgcm).
8. A 3D View of an Atmospheric River from an Earth System Model, SVS 4960. NASA's Scientific
   Visualization Studio; Greg Shirah, Horace Mitchell, Cindy Starr, Kel Elkins; scientists
   Allison Collow, Natalie Thomas, Michael Bosilovich. Data: MERRA-2.

**Method**

9. Data Sonification: Caldwell 73, NASA SVS 13786, https://svs.gsfc.nasa.gov/13786/ (in the
   challenge resources).
10. Sonification of RS Puppis, NASA SVS 14260, https://svs.gsfc.nasa.gov/14260/. Principle
    only; no part of it is reused.

**Other sources and tools**

11. World Health Organization, "Blindness and vision impairment" fact sheet,
    https://www.who.int/news-room/fact-sheets/detail/blindness-and-visual-impairment.
12. Natural Earth, https://www.naturalearthdata.com (public domain).
13. FFmpeg (LGPL/GPL), Python, NumPy (BSD), Pillow (MIT-CMU), Node.js test runner.
14. Browser APIs: Web Audio, Canvas 2D, Web Speech, Gamepad, Vibration.
15. Claude (Anthropic), used as described under "AI and NASA data".

Sixth Sense is not affiliated with or endorsed by NASA.

---

## Before you submit

| Item | Status |
|---|---|
| Demo: at most 7 slides, or a video of at most 30 s with English subtitles | ready: 7 slides (PDF); the site demo runs 28 s |
| Demo and project open without login | ready: GitHub and Vercel links are public |
| Everything in English | ready |
| NASA data used and named | ready: 8 SVS visualizations |
| AI use declared | ready: site footer, README, this file, slide 7 |
| No NASA logos or insignia | ready |
| Team registered, Bishkek event selected, all four members listed | to do by the team on spaceappschallenge.org |
| Terms and originality boxes ticked | to do by the team in the form |
