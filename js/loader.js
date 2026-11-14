export async function fetchBlob(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !onProgress) return res.blob();
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(got, total);
  }
  return new Blob(chunks, { type: res.headers.get('content-type') || '' });
}

export async function blobToPixels(blob) {
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, c.width, c.height);
}

export function channelField(img, channel = 0, lon0 = -180) {
  const { width, height, data } = img;
  const values = new Uint8Array(width * height);
  for (let i = 0, p = channel; i < values.length; i++, p += 4) values[i] = data[p];
  return { width, height, lon0, values };
}

let webpCheck = null;
export function supportsWebp() {
  if (!webpCheck) {
    webpCheck = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.width === 1);
      img.onerror = () => resolve(false);
      img.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
    });
  }
  return webpCheck;
}

export class Progress {
  constructor(onChange) {
    this.onChange = onChange;
    this.parts = new Map();
  }

  part(key) {
    this.parts.set(key, { got: 0, total: 0, done: false });
    return (got, total) => {
      const p = this.parts.get(key);
      p.got = got;
      p.total = total;
      this._emit();
    };
  }

  finish(key) {
    const p = this.parts.get(key);
    if (p) p.done = true;
    this._emit();
  }

  get fraction() {
    let sum = 0;
    for (const p of this.parts.values()) {
      if (p.done) sum += 1;
      else if (p.total > 0) sum += Math.min(1, p.got / p.total);
    }
    return this.parts.size ? sum / this.parts.size : 1;
  }

  _emit() {
    if (this.onChange) this.onChange(this.fraction);
  }
}
