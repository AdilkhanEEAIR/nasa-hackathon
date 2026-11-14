// Spherical geometry and map georeferencing.
// All spatial logic works in degrees and kilometres, never in pixels, because the source
// maps are stretched equirectangular grids with non-square pixels (see docs/DATA_NOTES.md).

export const EARTH_RADIUS_KM = 6371.0088;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Wraps a longitude into [-180, 180). */
export function normalizeLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function clampLat(lat) {
  return Math.max(-90, Math.min(90, lat));
}

/**
 * Point reached by travelling `distanceKm` from (lat, lon) along the great circle that starts
 * at `bearingDeg` (0 = north, 90 = east).
 */
export function destination(lat, lon, bearingDeg, distanceKm) {
  const d = distanceKm / EARTH_RADIUS_KM;
  const th = bearingDeg * D2R;
  const p1 = lat * D2R;
  const l1 = lon * D2R;
  const sinP2 = Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th);
  const p2 = Math.asin(Math.max(-1, Math.min(1, sinP2)));
  const l2 = l1 + Math.atan2(
    Math.sin(th) * Math.sin(d) * Math.cos(p1),
    Math.cos(d) - Math.sin(p1) * Math.sin(p2),
  );
  return { lat: p2 * R2D, lon: normalizeLon(l2 * R2D) };
}

/** Great-circle distance in km (haversine, stable for short distances). */
export function distanceKm(a, b) {
  const p1 = a.lat * D2R;
  const p2 = b.lat * D2R;
  const dp = p2 - p1;
  const dl = (b.lon - a.lon) * D2R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b in degrees [0, 360). */
export function bearingDeg(a, b) {
  const p1 = a.lat * D2R;
  const p2 = b.lat * D2R;
  const dl = (b.lon - a.lon) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

/**
 * Equirectangular grid description: `lon0` is the longitude of the left edge, the grid spans
 * 360 deg horizontally and 180 deg vertically (90 N at row 0).
 */
export function lonLatToPixel(lat, lon, grid) {
  const u = ((((lon - grid.lon0) % 360) + 360) % 360) / 360;
  const v = (90 - clampLat(lat)) / 180;
  return { x: u * grid.width, y: v * grid.height };
}

/** Inverse of lonLatToPixel; (x, y) are continuous pixel coordinates. */
export function pixelToLonLat(x, y, grid) {
  return {
    lat: clampLat(90 - (y / grid.height) * 180),
    lon: normalizeLon(grid.lon0 + (x / grid.width) * 360),
  };
}

/**
 * Sample points of a ring of radius `radiusKm` around `center`, split into `voices` equal arcs.
 * Voice k is centred on bearing k * 360 / voices (voice 0 = north, clockwise). Each arc gets
 * enough sub-samples that neighbouring samples are at most `spacingKm` apart, so the ring
 * "sees" everything it passes over, not just 16 isolated points.
 */
export function ringArcs(center, radiusKm, voices = 16, spacingKm = 40, minSub = 3, maxSub = 24) {
  const arcDeg = 360 / voices;
  const circumference = 2 * Math.PI * EARTH_RADIUS_KM * Math.sin(radiusKm / EARTH_RADIUS_KM);
  const arcLen = circumference / voices;
  const sub = Math.max(minSub, Math.min(maxSub, Math.ceil(arcLen / spacingKm)));
  const arcs = [];
  for (let k = 0; k < voices; k++) {
    const mid = k * arcDeg;
    const pts = [];
    for (let i = 0; i < sub; i++) {
      const b = mid - arcDeg / 2 + ((i + 0.5) * arcDeg) / sub;
      pts.push(destination(center.lat, center.lon, (b + 360) % 360, radiusKm));
    }
    arcs.push({ bearing: mid, points: pts });
  }
  return arcs;
}

/** Points filling a disk (for regional averages): concentric rings, area-proportional counts. */
export function diskPoints(center, radiusKm, rings = 8, spacingKm = 40) {
  const pts = [{ ...center, weight: 1 }];
  for (let i = 1; i <= rings; i++) {
    const r = (radiusKm * i) / rings;
    const circ = 2 * Math.PI * EARTH_RADIUS_KM * Math.sin(r / EARTH_RADIUS_KM);
    const n = Math.max(6, Math.ceil(circ / spacingKm));
    for (let j = 0; j < n; j++) {
      pts.push({ ...destination(center.lat, center.lon, (j * 360) / n, r), weight: 1 });
    }
  }
  return pts;
}

/** Human-readable coordinates, e.g. "22.5° N, 79.0° E". */
export function formatLatLon(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}° ${ns}, ${Math.abs(lon).toFixed(1)}° ${ew}`;
}
