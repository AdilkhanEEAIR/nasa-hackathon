# Sound check: do different places sound different?

We cannot listen to a build in a test runner, so differences between places are measured.
[`tools/sound_report.mjs`](../tools/sound_report.mjs) renders an 8-second ring scan offline in
headless Chrome with the site's own synthesis code (the same path as *Save as WAV*) and measures
the result. Re-run it with:

```bash
node tools/sound_report.mjs http://localhost:8766/
```

| Column | Meaning |
|---|---|
| Voices sounding | share of the 16 ring voices above 5% loudness, averaged over five ring sizes |
| Temp heard | mean temperature the voices read from the colorbar (ocean) |
| Current motion | density of current lines on the sea part of each arc, on the fixed 0.25–0.75 scale |
| RMS | loudness of the whole render |
| Centroid | spectral centroid: how bright the timbre is |
| Energy > 1.5 kHz | how much of the sound lives in upper harmonics |
| Flicker | dominant envelope fluctuation between 1 and 16 Hz (shimmer speed; noisy for mixed rings) |
| Mod depth | how strongly the envelope fluctuates after the slow ring swell is removed |
| Wobble | spread of the spectral centroid over the scan: audible sliding or changing colour |
| Tonal | share of energy in the 40 strongest spectral bins: clear tones high, noise low |

## Ocean Temperature (SVS 3912): before and after (14 November 2026)

**Cause of the monotony, confirmed.** The ocean track reused the land presets. At India only 31%
of the ring voices sounded, and at Europe 39%: the rest of the ring was land and silent. On top
of that, temperature only moved one low-pass filter, so 6 °C and 27 °C differed by less than one
octave of brightness (482 vs 827 Hz) and not at all in shimmer.

Before (one sawtooth, temperature = filter only):

| Place | Voices sounding | Temp heard °C | RMS | Centroid Hz | Energy > 1.5 kHz |
|---|---|---|---|---|---|
| India (old preset) | 31% | 29.7 | 0.049 | 552 | 8% |
| Europe (old preset) | 39% | 16.4 | 0.034 | 514 | 7% |
| Equatorial Pacific | 100% | 26.8 | 0.118 | 827 | 15% |
| Southern Ocean front | 100% | 6.0 | 0.100 | 482 | 1% |

**Fix.**
1. The ocean has its own presets on strong temperature fronts: Gulf Stream, Kuroshio, Agulhas
   Current, Equatorial Pacific, Southern Ocean front. Every track now has its own presets.
2. Five fixed temperature bands with their own instruments, blended between neighbours:
   ice (0 °C) pure sine, slow 0.7 Hz shimmer · cold (6 °C) hollow triangle, 1.6 Hz · mild
   (14 °C) square wave, 3 Hz · warm (22 °C) sawtooth, 5 Hz · hot (29 °C) bright sawtooth an
   octave up, 8.5 Hz. Harmonics, brightness and shimmer all rise with temperature.
3. Current-line density on the sea part of each arc drives a slow glide of pitch (up to
   ±28 cents) and filter (±900 cents), faster where currents are dense: the water is heard
   moving. The compass pitch stays the centre of the glide.
4. Loudness is now the share of sea on the arc, so calm water is not quieter than busy water.

After, three contrasting places (the full table is below):

| Place | Temp heard °C | Motion | RMS | Centroid Hz | Energy > 1.5 kHz | Flicker Hz | Wobble Hz |
|---|---|---|---|---|---|---|---|
| Southern Ocean front | 6.0 | 0.47 | 0.102 | 361 | 0% | 3.25 | 47 |
| Agulhas Current | 14.5 | 0.74 | 0.083 | 488 | 5% | 3.00 | 116 |
| Equatorial Pacific | 26.8 | 0.83 | 0.074 | 1558 | 30% | 8.75 | 245 |

The hot equator is 4.3× brighter than the cold Southern Ocean (was 1.7×), has 30% of its
energy in upper harmonics (was 15% vs 1%), shimmers about 2.7× faster, and slides 5× more.
Loudness stays within the shared 0.07–0.12 RMS window, so temperature is never heard as
"louder". Calm water reads low motion (Weddell Sea ice edge 0.09, mid-Atlantic subtropics
0.36) against 0.67–0.83 in the boundary currents.

## Other tracks

- **Night lights:** one instrument by design; places differ by how much of the ring is lit
  and in which direction (India 49%, Europe 64%, Sahara 18% of voices; RMS 0.070 / 0.099 /
  0.043). That is the information, so nothing was changed.
- **Aerosols: one fix.** A first "Southern Ocean" preset turned out to be 85% sulfate on this
  frame, the same class as East China (80%), so the two would have sounded alike. Measured
  class shares inside a 1,500 km disk:

  | Preset | Smoke | Dust | Sea salt | Sulfate |
  |---|---|---|---|---|
  | Sahara dust | 0% | 99% | 0% | 0% |
  | Central Africa fires | 97% | 0% | 0% | 3% |
  | East China | 4% | 7% | 10% | 80% |
  | Indian Ocean sea salt (15° S, 65° E) | 0% | 0% | 100% | 0% |
  | *Southern Ocean, 50° S 40° E (dropped)* | 0% | 0% | 15% | 85% |

  The salt preset moved to the southern Indian Ocean. Its render differs from East China
  (sulfate) by tonality 0.61 vs 0.93, centroid wobble 79 vs 697 Hz and upper-harmonic share
  14% vs 4%.
- **Lightning:** the scan reads a playing video, which the offline renderer cannot step
  through, so it is not in this table. Its presets are known storm hot spots (Congo Basin,
  Lake Maracaibo, Florida, Bangladesh).

## Full table after the change

| Track | Place | Voices sounding | Temp heard °C | Current motion 0-1 | RMS | Centroid Hz | Energy >1.5 kHz | Flicker Hz | Mod depth | Wobble Hz |
|---|---|---|---|---|---|---|---|---|---|---|
| ocean | India (old preset) | 31% | 29.7 | 0.60 | 0.044 | 1128 | 18% | 8.25 | 0.24 | 182 |
| ocean | Europe (old preset) | 39% | 16.4 | 0.29 | 0.045 | 502 | 4% | 1.50 | 0.21 | 120 |
| ocean | Gulf Stream | 81% | 20.8 | 0.67 | 0.074 | 699 | 8% | 2.75 | 0.21 | 79 |
| ocean | Kuroshio | 99% | 19.9 | 0.75 | 0.081 | 689 | 9% | 2.50 | 0.22 | 93 |
| ocean | Agulhas | 86% | 14.5 | 0.74 | 0.083 | 488 | 5% | 3.00 | 0.27 | 116 |
| ocean | Equatorial Pacific | 100% | 26.8 | 0.83 | 0.074 | 1558 | 30% | 8.75 | 0.16 | 245 |
| ocean | Southern Ocean front | 100% | 6.0 | 0.47 | 0.102 | 361 | 0% | 3.25 | 0.25 | 47 |
| nightlights | India 2023 | 49% | – | – | 0.070 | 388 | 0% | 5.50 | 0.21 | 78 |
| nightlights | Europe 2023 | 64% | – | – | 0.099 | 343 | 0% | 1.50 | 0.26 | 73 |
| nightlights | Sahara 2023 | 18% | – | – | 0.043 | 376 | 0% | 2.00 | 0.28 | 85 |
| aerosols | Sahara dust | 84% | – | – | 0.140 | 9787 | 100% | 12.00 | 0.06 | 611 |
| aerosols | Central Africa fires | 83% | – | – | 0.105 | 581 | 8% | 7.00 | 0.43 | 324 |
| aerosols | East China | 85% | – | – | 0.085 | 730 | 4% | 1.25 | 0.25 | 697 |
| aerosols | Indian Ocean sea salt | 89% | – | – | 0.070 | 768 | 14% | 2.50 | 0.17 | 79 |

These numbers describe the synthesis; whether the differences are *clear to a listener* is
for the blindfold test to decide.
