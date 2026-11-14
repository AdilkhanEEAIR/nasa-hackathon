// Map camera: zoom and pan for the visual layer only. The sound never reads the camera, so
// zooming can never change what is heard.
//
// Coordinates:
//   geo     (lat, lon) in degrees
//   map     (u, v) in [0, 1]: u = 0 at 180 W, v = 0 at 90 N (equirectangular, lon0 = -180)
//   screen  (x, y) in pixels of a view that is W x H (the whole map at scale 1)
// A camera is { s, cu, cv }: scale >= 1 and the map point shown at the centre of the view.

export const MIN_SCALE = 1;
// The sharpest source frames are 3840 px wide; beyond about 6x a 1000-px-wide map shows each
// source pixel at ~2 screen pixels and only gets blurrier, so zoom stops there.
export const MAX_SCALE = 6;

export function geoToMap(lat, lon) {
  const u = ((((lon + 180) % 360) + 360) % 360) / 360;
  return { u, v: (90 - Math.max(-90, Math.min(90, lat))) / 180 };
}

export function mapToGeo(u, v) {
  return { lat: 90 - v * 180, lon: -180 + u * 360 };
}

/** Keeps the scale in range and the view inside the map (no empty bands at the edges). */
export function clampCamera(cam) {
  const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.s));
  const half = 0.5 / s;
  return {
    s,
    cu: Math.max(half, Math.min(1 - half, cam.cu)),
    cv: Math.max(half, Math.min(1 - half, cam.cv)),
  };
}

export function mapToScreen(u, v, cam, W, H) {
  return { x: (u - cam.cu) * cam.s * W + W / 2, y: (v - cam.cv) * cam.s * H + H / 2 };
}

export function screenToMap(x, y, cam, W, H) {
  return { u: cam.cu + (x - W / 2) / (cam.s * W), v: cam.cv + (y - H / 2) / (cam.s * H) };
}

/** Zooms by `factor` keeping the map point under the screen point (sx, sy) fixed. */
export function zoomAt(cam, factor, sx, sy, W, H) {
  const anchor = screenToMap(sx, sy, cam, W, H);
  const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.s * factor));
  // Solve mapToScreen(anchor, newCam) == (sx, sy) for the new centre.
  const next = { s, cu: anchor.u - (sx - W / 2) / (s * W), cv: anchor.v - (sy - H / 2) / (s * H) };
  return clampCamera(next);
}

/** Moves the view by a screen-pixel drag (content follows the pointer). */
export function panBy(cam, dx, dy, W, H) {
  return clampCamera({ s: cam.s, cu: cam.cu - dx / (cam.s * W), cv: cam.cv - dy / (cam.s * H) });
}

/**
 * Keeps a map point in frame: if it lies outside the inner `margin` fraction of the view,
 * the camera re-centres on it (zoom unchanged).
 */
export function ensureVisible(cam, u, v, margin = 0.2) {
  const half = 0.5 / cam.s;
  const du = u - cam.cu;
  const dv = v - cam.cv;
  if (Math.abs(du) <= half * (1 - 2 * margin) && Math.abs(dv) <= half * (1 - 2 * margin)) return cam;
  return clampCamera({ s: cam.s, cu: u, cv: v });
}

/** Map-space visible rectangle, for deciding what to draw or load. */
export function visibleRect(cam) {
  const half = 0.5 / cam.s;
  return { u0: cam.cu - half, u1: cam.cu + half, v0: cam.cv - half, v1: cam.cv + half };
}

export const HOME = { s: 1, cu: 0.5, cv: 0.5 };
