// Lightning track source: the ISS LIS video, read frame by frame while it plays.
// The video loads only when the track is chosen (poster first, metadata only, then it
// streams as it plays). Frames are read at 1024x512 (half the 2048-px video): dots are 1-2 px
// there, so they are not averaged away.

import { lightningLevel } from './tracks.js';
import { fetchBlob } from './loader.js';

const W = 1024;
const H = 512;

export class LightningSource {
  constructor(video, entry) {
    this.video = video;
    this.entry = entry;
    this.dates = null;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.field = { width: W, height: H, lon0: -180, values: new Uint8Array(W * H) };
    this.prev = new Uint8Array(W * H);
    this.fresh = { width: W, height: H, lon0: -180, values: new Uint8Array(W * H) };
    this.lastTime = -1;
    this.tick = 0;
  }

  /** Loads the per-frame dates and the video metadata (not the whole video). */
  async load(progress) {
    const onDates = progress && progress.part('dates');
    const blob = await fetchBlob(this.entry.dates, onDates);
    if (progress) progress.finish('dates');
    this.dates = JSON.parse(await blob.text()).dates;
    const v = this.video;
    v.poster = this.entry.poster;
    v.preload = 'metadata';
    if (!v.getAttribute('src')) v.src = this.entry.video;
    if (v.readyState < 1) {
      const meta = progress && progress.part('video-metadata');
      await new Promise((resolve, reject) => {
        v.addEventListener('loadedmetadata', resolve, { once: true });
        v.addEventListener('error', () => reject(new Error('video failed to load')), { once: true });
      });
      if (meta) progress.finish('video-metadata');
    }
  }

  get ready() {
    return !!this.dates && this.video.readyState >= 1;
  }

  /** Date shown in the current frame, from the official label file (2003 corrected to 2023). */
  get date() {
    if (!this.dates) return '';
    const i = Math.min(this.dates.length - 1, Math.max(0, Math.floor(this.video.currentTime * this.entry.fps)));
    return this.dates[i];
  }

  /**
   * Current frame as fields: `field` = dot level per pixel, `fresh` = dots that appeared since
   * the last read (null when the frame has not changed). Frames are read on every other tick
   * (~15 Hz), which is plenty for a 10-day rolling window shown at 30 fps.
   */
  frame() {
    const v = this.video;
    if (v.readyState < 2) return null;
    this.tick++;
    if (v.currentTime === this.lastTime || this.tick % 2) return { field: this.field, fresh: null };
    this.lastTime = v.currentTime;
    this.ctx.drawImage(v, 0, 0, W, H);
    const px = this.ctx.getImageData(0, 0, W, H).data;
    const cur = this.field.values;
    const fresh = this.fresh.values;
    for (let i = 0, p = 0; i < cur.length; i++, p += 4) {
      const val = Math.round(255 * lightningLevel(px[p], px[p + 1], px[p + 2]));
      fresh[i] = val > this.prev[i] ? val - this.prev[i] : 0;
      this.prev[i] = val;
      cur[i] = val;
    }
    return { field: this.field, fresh: this.fresh };
  }

  /** Reads one frame now (e.g. after seeking while paused). */
  refresh() {
    this.lastTime = -1;
    this.tick = 1;
    return this.frame();
  }

  seekBy(seconds) {
    const v = this.video;
    v.currentTime = Math.max(0, Math.min(v.duration - 0.05, v.currentTime + seconds));
  }

  seekTo(seconds) {
    const v = this.video;
    v.currentTime = Math.max(0, Math.min(v.duration - 0.05, seconds));
  }
}
