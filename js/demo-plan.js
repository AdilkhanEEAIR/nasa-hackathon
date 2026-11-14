// The 28-second demo as data: when each scene starts, what it plays and the English subtitle.
// js/app.js runs it; tests/demo.test.js checks the timing (exactly 28 s, every subtitle on
// screen long enough to read, every scan finished before the next scene).

export const DEMO_LENGTH_MS = 28000;

export const DEMO_STEPS = [
  { at: 0, scene: 'intro',
    caption: 'EarthSonar: NASA Earth maps you can hear, made for blind and low-vision people.' },
  { at: 2900, scene: 'rule',
    caption: 'High notes = north. Right ear = east. Louder = more.' },
  { at: 5400, scene: 'india2012', scanS: 2.6,
    caption: 'Night lights, India 2012: sparse, quiet lights.' },
  { at: 8300, scene: 'india2023', scanS: 2.8,
    caption: 'India 2023: louder, brighter — map lights grew about 2.5 times.' },
  { at: 11600, scene: 'aerosols', scanS: 3.2,
    caption: 'Aerosols: Saharan dust rustles, smoke crackles, sea salt sounds like surf.' },
  { at: 15000, scene: 'ocean', scanS: 3.8,
    caption: 'Ocean, Gulf Stream: warm water flickers fast and bright, cold water shimmers slow.' },
  { at: 19200, scene: 'lightning',
    caption: 'Lightning seen from the space station: every new flash cracks in its direction.' },
  { at: 23800, scene: 'end',
    caption: 'earthsonar.vercel.app — keyboard-only, screen-reader friendly, open source. Data: NASA SVS.' },
  { at: DEMO_LENGTH_MS, scene: 'stop', caption: '' },
];

// Where each scene listens: centre, ring size and how close the camera frames it.
export const DEMO_CENTRES = {
  india: { name: 'India', lat: 22.5, lon: 79.0, radiusKm: 1500, zoom: 2.6 },
  sahara: { name: 'West Africa', lat: 14, lon: 0, radiusKm: 2500, zoom: 2 },
  gulf: { name: 'Gulf Stream', lat: 38, lon: -68, radiusKm: 1200, zoom: 2.4 },
  storms: { name: 'Central Africa', lat: 6, lon: 20, radiusKm: 2000, zoom: 2.2 },
};
