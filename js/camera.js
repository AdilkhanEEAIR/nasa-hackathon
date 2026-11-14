export const MIN_SCALE = 1;
export const MAX_SCALE = 6;

export function geoToMap(lat, lon) {
  const u = ((((lon + 180) % 360) + 360) % 360) / 360;
  return { u, v: (90 - Math.max(-90, Math.min(90, lat))) / 180 };
}

export function mapToGeo(u, v) {
  return { lat: 90 - v * 180, lon: -180 + u * 360 };
}

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

export function zoomAt(cam, factor, sx, sy, W, H) {
  const anchor = screenToMap(sx, sy, cam, W, H);
  const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.s * factor));
  const next = { s, cu: anchor.u - (sx - W / 2) / (s * W), cv: anchor.v - (sy - H / 2) / (s * H) };
  return clampCamera(next);
}

export function panBy(cam, dx, dy, W, H) {
  return clampCamera({ s: cam.s, cu: cam.cu - dx / (cam.s * W), cv: cam.cv - dy / (cam.s * H) });
}

export function ensureVisible(cam, u, v, margin = 0.2) {
  const half = 0.5 / cam.s;
  const du = u - cam.cu;
  const dv = v - cam.cv;
  if (Math.abs(du) <= half * (1 - 2 * margin) && Math.abs(dv) <= half * (1 - 2 * margin)) return cam;
  return clampCamera({ s: cam.s, cu: u, cv: v });
}

export function visibleRect(cam) {
  const half = 0.5 / cam.s;
  return { u0: cam.cu - half, u1: cam.cu + half, v0: cam.cv - half, v1: cam.cv + half };
}

export const HOME = { s: 1, cu: 0.5, cv: 0.5 };
