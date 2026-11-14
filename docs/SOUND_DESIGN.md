# Sound design: which sound, by which rule, why, and what it means

This document describes every sound Sixth Sense makes. All numbers are taken from the code
(`js/music.js`, `js/fields.js`, `js/geo.js`, `js/scan.js`, `js/audio.js`, `js/tracks.js`,
`js/needle.js`, `js/lightning.js`, `js/haptics.js`, `tools/prepare_media.py`). Nothing is
pre-recorded: every sound is synthesised in the browser from the pixels of a NASA
visualization at the moment you listen.

We sonify the **rendered visualization**, as the challenge asks, not the raw measurements.
Each track says which of two classes it belongs to:

- **Data-true**: the value is read back from the visualization's own colour scale, so the
  sound follows a physical quantity (within the limits listed for each track).
- **Visual**: the picture itself is sonified (hue, brightness, where colour is). There is no
  numeric scale to read, so we never claim calibrated values.

## 1. One law for every track

| What you hear | What it means | Rule |
|---|---|---|
| **Timbre** (which instrument) | which phenomenon | one instrument per phenomenon, never shared |
| **Pitch** | north–south | north is high, south is low |
| **Stereo position** | west–east | west in the left ear, east in the right |
| **Loudness** (and brightness of tone) | how much | louder and brighter means more |

A listener learns this once (the 6-step tutorial, key T) and it holds on all eight tracks.

**Scale.** All pitches come from one major pentatonic scale (semitones 0, 2, 4, 7, 9) on
G3 = 196 Hz. A pentatonic scale has no semitone clashes, so any combination of voices stays
consonant whatever the data does. This is the balance between data and music that the
challenge asks for: the data decides *which* notes sound and how loud, the scale guarantees
that they sound good together.

**Smoothing and room.** Loudness changes glide with a 60 ms time constant, so there are no
clicks between steps. All voices share one small synthetic room (a 2.2 s decaying-noise
impulse, 22% wet) and a limiter (threshold −12 dB, ratio 8:1). While the optional voice guide
speaks, the mix drops to 25% so speech never covers the data.

## 2. The ring scan (tracks 1–5)

The method follows NASA's sonification of RS Puppis (SVS 14260), where a ring moves towards
the centre of an image; Data Sonification: Caldwell 73 (SVS 13786), listed in the challenge
resources, is our reference for the general approach. We moved the ring onto the globe.

1. The listener chooses a centre (a preset, the arrow keys, a click, a controller stick) and a
   ring size from 250 to 4,000 km.
2. A ring starts at that distance and shrinks onto the centre over the scan length
   (4 to 16 s, 8 s by default). It is re-read 30 times a second.
3. The ring is cut into **16 voices**, one per 22.5° of compass bearing. Each voice listens to
   its own arc. The arc is sampled every 40 km or closer (3 to 24 samples), and each sample is
   the mean of a 3 × 3 pixel box, so the ring hears everything it passes over.
4. Distances and bearings are computed on the sphere (great circles), never in pixels, because
   the maps are stretched equirectangular grids.

| Property of a voice | Formula | Result |
|---|---|---|
| Pitch | scale degree = round((cos bearing + 1) / 2 × 8) | south 196 Hz (G3), east and west 330 Hz (E4), north 587 Hz (D5) |
| Stereo | pan = 0.9 × sin bearing | west −0.9, east +0.9 |
| Loudness | (arc mean ÷ full-scale level)^0.7, capped at 1 | exponent 0.7 lifts faint values into hearing |
| Brightness | arc mean ÷ full-scale level, capped at 1 | opens the voice's filter |

The *full-scale level* (the arc mean heard at full loudness) is fixed per track and never
changes between frames, years or places. Without that, comparing two years by ear would be
meaningless.

**Why a ring and not a line.** A left-to-right line gives time order but no sense of
direction. A ring around a point the listener chose is an audible compass: a high sound in the
right ear means "to the north-east of me". The shrinking also gives distance: what sounds
first is far away, what sounds last is close.

**The end of a scan.** When the ring reaches the centre, one note reports the value *at* the
chosen point: a triangle tone at 659 Hz with a sine two octaves above G3 (1,319 Hz), louder
and brighter for a higher value. If there is nothing at the centre, a soft low thud at 98 Hz
sounds instead, because silence would be ambiguous. A sentence in the live region (and the
voice guide, if on) then says the same in words.

**Land, water and coast.** On the night-lights and aerosol tracks, an arc that is at least
half land and carries no data gets a very quiet bed at 2.5% level (on night lights a muffled
hum filtered at 320 Hz); open water is silent. On the map tracks 1, 2, 4 and 5, when an arc
crosses a coastline a 12 ms click sounds at its stereo position (key C switches clicks off).

**Explore mode (key E).** One sustained voice sits on the centre point. Its pitch follows
latitude (north is higher), and its loudness is (pixel value)^0.7, the same curve as the ring.

## 3. The needle (tracks 6–8)

Globe videos and 3D stills have no flat map to put a ring on, so they use a needle: a vertical
line over the picture.

- The needle is cut into **12 bands**. Each band has its own voice. The top band plays
  1,319 Hz and the bottom band 196 Hz, on the same pentatonic scale: top is north, as on the
  ring.
- On a **turning globe** (tracks 6 and 7) the needle stays in the middle and the planet moves
  under it. The pixels are read on every video frame actually shown (192 rows per frame).
- On a **still frame** (track 8) the needle sweeps from left to right over the scan length.
- A band's value is the mean of its pixels. Below 0.08 the band is silent; above that its
  loudness is ((value − 0.08) ÷ 0.92)^0.8. Loudness follows the picture with a 25 ms time
  constant, so the sound swells as something passes under the needle and fades as it leaves.
- The needle lights exactly the bands that sound, as bright as they are loud, delayed by the
  audio output latency so light and sound arrive together.
- Sound stops when the video is paused, buffering or the tab is hidden: only a moving frame
  that is on screen may sound.
- A scan lasts the scan length of *playing* time, stops by itself and reports where along the
  needle (north, middle, south; or left, middle, right for a sweep) the picture was strongest.

## 4. Loudness is matched between tracks

A phenomenon must not seem "more" just because its instrument is louder. Each instrument has
a fixed peak factor and each track a fixed trim. They were set by rendering scans offline with
the site's own synthesis code and measuring RMS (`tools/sound_report.mjs`,
[`SOUND_CHECK.md`](SOUND_CHECK.md)), so full rings land in a similar loudness window (most
between about 0.07 and 0.14 RMS in that table). Each voice has a base ceiling of 0.16 of full
scale, scaled by its instrument's peak factor, and the limiter guards the sum of 16 voices.

## 5. Vibration follows the same values

Haptics are optional and use what people already have (`js/haptics.js`).

- The 16 ring voices are folded into four directions: each direction takes the strongest
  voice on its side, weighted by how squarely it faces that direction.
- **Game controller** (two motors): low notes come from the south, so the heavy low-frequency
  motor carries the south; high notes come from the north, so the light high-frequency motor
  carries the north. East and west add half their value to both. Values at or below 0.15 do
  not vibrate.
- **Android phone** (one motor): one pulse of 10 + 50 × value ms (10 to 60 ms), at most four
  a second, for the stronger of the two values; nothing at or below 0.15.
- Vibration starts only after the user switches Haptics on, and stops on Esc, when a scan
  stops and when the tab is hidden.

---

## 6. The eight tracks

### Track 1. Night Lights 2012–2023

- **Source:** Change in Night Lights between 2012 and 2023 – EIC Version, NASA SVS 5313,
  https://svs.gsfc.nasa.gov/5313/ (NASA Black Marble, Suomi NPP VIIRS).
- **Class and scan:** Data-true · ring. One frame per year, 2012–2023.
- **Pixel → value.** The frame holds two copies of the world; we keep one, remove the overlay
  and shift it so 180° W is at the left edge. Light level = (max(R, G, B) − 45) ÷ 210, clipped
  to 0–1. The base map never exceeds 34, so 45 leaves a margin for compression noise. Frames
  are averaged down to 1,920 × 1,080 with a box filter, which dims small towns equally in every
  year instead of dropping them at random.
- **Value → sound.** A warm triangle wave at the compass pitch with a gentle twinkle (tremolo
  5.5 Hz, depth 0.35, slightly different on every voice). Brightness opens a low-pass filter
  from 600 to 4,800 Hz. Full loudness at an arc mean of 0.08. Unlit land is the quiet hum,
  water is silent, coasts click.
- **Why.** City lights are small, bright points: a clear tone that twinkles suggests exactly
  that, and it is the calmest instrument, because this is the track people start with. The
  full-scale level is low (0.08) because lights cover only a few percent of an arc.
- **What the listener learns.** Where the lit regions are around the chosen place, how far
  away, and how that changes from year to year (Page Up / Page Down). Key Y plays all twelve
  years as twelve notes: the mean brightness of the whole disk is mapped on a fixed
  logarithmic scale (0.001 to 0.03 over 15 scale steps), so a higher note is a brighter year.
- **Limits.** Pixel brightness is the display mapping, not calibrated radiance. The brightest
  city cores saturate. A pixel is about 21 km wide, so small towns blend.

### Track 2. Aerosols

- **Source:** GEOS Aerosols, NASA SVS 5669, https://svs.gsfc.nasa.gov/5669/ (GEOS-FP model,
  19 August 2025, 20:00 UTC).
- **Class and scan:** Data-true (for the particle type) · ring.
- **Pixel → value.** The type is the nearest of the four legend colours by chromaticity
  (colour with brightness divided out): smoke/black carbon (210, 94, 69), dust (193, 154, 220),
  sea salt (133, 170, 169), sulfate (83, 220, 52). The amount is brightness above the base map:
  (max − base) ÷ (255 − base), with base 62 on land and 35 over the ocean. Pixels darker than 35
  are "none". Sea salt is not allowed on land, where the grey relief has nearly the same colour.
  Small isolated white dots on land are the base map's cities and are removed.
- **Value → sound.** Four instruments, each at the compass pitch of its direction:

  | Type | Instrument | How it is made |
  |---|---|---|
  | Smoke / black carbon | crackling fire | low noise with about 30 random bursts a second, low-pass |
  | Dust | dry rustle | white noise through a narrow high band-pass |
  | Sea salt | soft surf | low noise that swells twice every 8 s |
  | Sulfate | buzzing tone | square wave, low-pass 500–1,800 Hz |

  Full loudness at an arc mean of 0.6; track trim 0.9. The noise instruments carry the compass
  pitch in the centre of their filter, so "north is high" holds for them as well.
- **Why.** The four types must be told apart without a legend, so each is a sound of the thing
  itself: fire crackles, dust rustles, the sea surges. Sulfate has no natural sound, so it gets
  the only pitched, artificial tone, which fits a mostly industrial pollutant.
- **What the listener learns.** Which particle type is in which direction, and how much. Key Y
  plays the types present in the ring one after another, strongest first.
- **Limits.** The legend has no numbers, so the amount is relative brightness only. Where
  plumes overlap we report the dominant type. Faint sea salt is hard to separate from faint
  sulfate.

### Track 3. Lightning

- **Source:** Lightning Events Detected from the ISS 2017–2023, NASA SVS 5011,
  https://svs.gsfc.nasa.gov/5011/ (Lightning Imaging Sensor on the ISS).
- **Class and scan:** Data-true (each dot is a detected flash) · ring over a playing video.
- **Pixel → value.** Dots are yellow on a neutral grey map, so "yellowness" separates them:
  a pixel counts if R > 90, G > 70 and B < G − 40, and its level is (min(R, G) − B − 40) ÷ 120.
  The video is read at 1,024 × 512 about 15 times a second. A *new* flash is a pixel that became
  brighter since the last read.
- **Value → sound.** Two layers.
  - *Thunder:* dot density on an arc drives a low rumble (noise through a low-pass an octave
    below the compass pitch); full loudness at an arc mean of 0.04.
  - *Strikes:* new dots trigger sharp cracks in their direction. The rate per voice is
    8 × √(new ÷ 0.02), capped at 8 a second, and at 30 a second for the whole ring. A strike is
    a 60 ms burst of high-passed noise plus a short thump that starts at the voice's pitch and
    falls to 60% of it in 0.12 s.
  - The ring closes once, easing in and out, while the video plays. At the end a sentence
    says how many flashes were heard and in which direction most of them were.
- **Why.** Lightning is the one phenomenon here that already has a sound. A crack for each
  flash and a rumble for stormy regions need no explanation.
- **What the listener learns.** Where the storms are around a place and how that moves with
  the seasons (Page Up / Page Down jump a month; "Play whole video" runs the whole record).
- **Limits.** The sensor sees only to about 52° north and south: arcs entirely outside that
  band are silent and reported as "no data", not "no lightning". Each dot stays for a 10-day
  window, so dots are accumulated detections, not live strikes.

### Track 4. Ocean Temperature

- **Source:** Global Sea Surface Currents and Temperature, NASA SVS 3912,
  https://svs.gsfc.nasa.gov/3912/ (ECCO2 model, frame for 19 June 2007).
- **Class and scan:** Data-true · ring.
- **Pixel → value.** Temperature is read from the official colour bar by **hue** (0 to 32 °C);
  reading the bar back with our own code gives an error of at most 1.5 °C. Brightness of the
  flow lines does not change the value. A pixel is "flow" if it is saturated and bright enough
  (PIL HSV S ≥ 90, V ≥ 40) and its hue is on the scale; grey land and dark gaps are not.
  Temperature of an arc = mean temperature of its flow pixels (needs at least 2% flow).
- **Value → sound.** Temperature chooses the **register and instrument**; five fixed bands,
  blended between neighbours:

  | Band (centre) | Register | Instrument |
  |---|---|---|
  | Ice-cold (0 °C) | one octave down | pure sine, filtered at 320 Hz: a low dense hum |
  | Cold (6 °C) | one octave down | darker triangle hum, 520–650 Hz |
  | Mild (14 °C) | middle | soft triangle pad, breathing at 0.45 Hz |
  | Warm (22 °C) | one octave up | ringing sine, shimmer 3.5 Hz |
  | Hot (29 °C) | one octave up | brighter triangle, shimmer 6 Hz |
  | Hottest (from about 30 °C) | one octave up | a twin tone 40 cents sharp beats against the hot tone: a light tension |

  Inside each register the compass still sets the note. Loudness is the share of sea on the
  arc (full at 60% sea); land is silent. Where current lines are dense, the tone slides: a slow
  wobble of up to ±28 cents in pitch and ±900 cents in filter, faster in busy currents. Track
  trim 0.55, because open ocean fills all 16 voices at once.
- **Why.** Cold as low and dark, warm as high and bright, matches how people already talk
  about sound, and a change of *instrument* is far easier to hear than a change of filter
  alone (measured in `SOUND_CHECK.md`). The tension on the hottest water marks a threshold
  without claiming a trend: this is one day, with no baseline.
- **What the listener learns.** Where warm and cold water meet (the Gulf Stream, the Kuroshio,
  the Agulhas front) and where the water is moving. Key Y names the coldest and warmest sides.
  The centre reading is shown and spoken in degrees.
- **Limits.** One model day, not an observation and not a trend. Temperature is known only
  where flow lines are drawn.

### Track 5. Near-Surface Wind

- **Source:** GEOS-FP Near-Surface Wind Speed, NASA SVS 5148, https://svs.gsfc.nasa.gov/5148/
  (GEOS-FP model, 29 October 2026, 09:00 UTC).
- **Class and scan:** Data-true · ring.
- **Pixel → value.** Speed is the nearest colour on the official colour bar (RGB distance at
  most 34, and the pixel must have some colour: channel spread at least 28). Reading the bar
  back with our own code gives an error of at most 0.41 m/s. Readable range: 3.6 to 34 m/s.
- **Value → sound.** Rushing air: band-passed noise at the compass pitch. Loudness =
  (mean speed ÷ 18 m/s)^0.7; the band opens and rises with speed (brightness = speed ÷ 25).
  Above about 12 m/s a narrow whistle two octaves up joins in, reaching full strength at
  22 m/s. Calm air is silent.
- **Why.** Wind is something everyone has heard. A whistle in a gale is the natural sign of
  "strong", and it gives a clear threshold a listener can remember.
- **What the listener learns.** Where the storms are, how strong, and where the air is calm.
  Key Y names the windiest and calmest directions.
- **Limits.** Air below 3.6 m/s is uncoloured on the map and reads as calm. The grey
  hurricane-force end of the scale cannot be told from the base map, so readings stop at
  34 m/s. Agency logos and the date box on the frame are marked "no data".

### Track 6. Forest Height (GEDI)

- **Source:** GEDI Forest Height, NASA SVS 4950, https://svs.gsfc.nasa.gov/4950/ (GEDI lidar
  on the ISS, April 2019 to April 2020), a turning globe.
- **Class and scan:** Visual · needle on a video (needle at the middle of the globe).
- **Pixel → value.** Vegetation is found by **colour, not brightness**, because the globe
  darkens towards its edge and in shadow. A pixel is vegetation if its hue is between 55° and
  115° and its saturation is at least 0.18. Then value = 0.45 + 0.55 × min(1, max channel ÷ 140):
  every green pixel sounds, paler and brighter green (taller in the palette) sounds stronger.
  Brown ground and desert (hue below 55°), ocean, ice and grey no-data stripes (no saturation)
  and black space read 0.
- **Value → sound.** Dry **marimba strikes**, not a held tone. Each sounding band re-strikes
  every 0.34 − 0.23 × level seconds (about 3 strikes a second for sparse green, 9 for dense).
  One strike is a 12 ms knock of noise, the bar's fundamental (0.22 s decay) and a partial
  3.93 times higher that is gone in 0.06 s.
- **Why.** Wood for forest is the most direct association there is. Short strikes with no ring
  keep it apart from every sustained voice on the other tracks: in our measurement its loudness
  fluctuates about twice as much as lightning and five times as much as the ocean.
- **What the listener learns.** At which latitudes the needle is crossing vegetation right
  now, and how dense and bright it is, as the continents turn past.
- **Limits.** Not calibrated heights: the globe is shaded and has gaps between orbit tracks.
  It says where the picture is green, not how many metres tall the trees are.

### Track 7. Carbon Dioxide (DYAMOND)

- **Source:** DYAMOND Global Carbon Dioxide, NASA SVS 5196, https://svs.gsfc.nasa.gov/5196/
  (model, January to February 2020), an orbiting globe.
- **Class and scan:** Visual · needle on a video.
- **Pixel → value.** Plumes are drawn yellow to orange to red over grey land and a black ocean,
  so the "warmth" of the colour stands for more CO2 in the picture:
  value = (R − B − 25) ÷ 130, clipped to 0–1. Greys, whites, black and greenish pixels read 0.
- **Value → sound.** A **breath**: soft noise through a band-pass at twice the band's pitch,
  over a low sine an octave below it. As a plume passes under the needle the band swells and
  its filter opens from 500 to 4,000 Hz; clean air is near silence.
- **Why.** CO2 is invisible and has no sound of its own. An exhale is the most human image of
  it, and a sound that swells and falls reads as a plume drifting past.
- **What the listener learns.** At which latitudes the plumes are and how they move as the
  globe turns.
- **Limits.** The colour bar has no numbers and a transparent low end, so this is the picture,
  not ppm.

### Track 8. Atmospheric River

- **Source:** A 3D View of an Atmospheric River from an Earth System Model, NASA SVS 4960,
  https://svs.gsfc.nasa.gov/4960/ (MERRA-2), one still frame.
- **Class and scan:** Visual · needle sweep across a still frame, left to right.
- **Pixel → value.** The blue of water vapour: value = (B − R − 40) ÷ 140, clipped to 0–1,
  counted only where blue is not weaker than green minus 10. The yellow label, the white
  letters, land and the white frame corner read 0.
- **Value → sound.** **Flowing water**: noise through a narrow band-pass at three times the
  band's pitch, whose centre slides slowly (0.6 Hz, ±500 cents), over a soft sine that wavers
  ±30 cents. Stronger blue is louder and brighter.
- **Why.** An atmospheric river is water in motion. The sliding band gives the sense of flow
  that a static picture cannot.
- **What the listener learns.** Where along the picture the river is and how high it sits; at
  the end, which third of the picture held the most vapour.
- **Limits.** A 3D perspective view: top and bottom of the picture are not north and south,
  and the value is colour strength, not water content.

---

## 7. What is deliberately not done

- No normalisation per frame, year or place: the same sound always means the same pixel value.
- No recorded samples and no generated audio files: everything is live synthesis.
- No invented numbers. Where a value cannot be read back honestly, the track is Visual and
  says so in its intro.
- The listener tests planned for this project are blindfolded tests with sighted volunteers.
  No results are quoted here because none have been measured yet.
