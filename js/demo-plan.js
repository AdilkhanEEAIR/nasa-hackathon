// The 28-second demo as data, built for a recording under the 30-second limit: a title, three
// scenes (night lights, aerosols, lightning) and an end card. js/app.js runs it in "cinema"
// mode; tests/demo.test.js checks the timing: exactly 28 s, subtitles of at most 8 words that
// stay at least 2.5 s, the first note within 2 s, every scan finished before the next scene.

import { BRAND } from './brand.js';

export const DEMO_LENGTH_MS = 28000;

/**
 * Scenes. At `at` the camera flies onto the place (no sound yet); the ring scan of `scanS`
 * seconds starts at `soundAt`. The previous scene's final chord bridges each change.
 */
export const DEMO_SCENES = [
  { at: 0, scene: 'title' },
  { at: 150, scene: 'nightlights', soundAt: 1100, scanS: 8.4 },
  { at: 9800, scene: 'aerosols', soundAt: 10400, scanS: 8.0 },
  { at: 18700, scene: 'lightning', soundAt: 19200, scanS: 6.6 },
  { at: 26000, scene: 'end' },
  { at: DEMO_LENGTH_MS, scene: 'stop' },
];

// Subtitles: English only, at most 8 words, each on screen at least 2.5 s.
export const DEMO_CAPTIONS = [
  { at: 1000, text: 'Night lights, Europe 2023.' },
  { at: 3700, text: 'Louder and brighter means more light.' },
  { at: 6600, text: 'High notes north, right ear east.' },
  { at: 10000, text: 'Aerosols over West and Central Africa.' },
  { at: 13300, text: 'Dust rustles, smoke crackles.' },
  { at: 16200, text: 'Two particle types, two different sounds.' },
  { at: 19000, text: 'Lightning seen from the space station.' },
  { at: 22300, text: 'The ring closes slowly on the storms.' },
  { at: 26000, text: '' },
];

export const DEMO_CARDS = {
  title: { name: BRAND.name, line: BRAND.tagline, small: [] },
  end: { name: BRAND.name, line: BRAND.url, small: [BRAND.event, BRAND.audience] },
};

// Where each scene listens: centre, ring size and how close the camera frames it.
export const DEMO_CENTRES = {
  europe: { name: 'Europe', lat: 48.5, lon: 9.0, radiusKm: 1500, zoom: 2.4 },
  africa: { name: 'West and Central Africa', lat: 6, lon: 13, radiusKm: 2000, zoom: 2.1 },
  storms: { name: 'Central Africa', lat: 6, lon: 20, radiusKm: 2000, zoom: 2.2 },
};
