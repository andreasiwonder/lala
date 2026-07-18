/* ==========================================================================
   map/radar.js — animated RainViewer radar.
   Frames are preloaded as hidden layers and swapped by opacity so the loop
   doesn't flicker while tiles fetch.
   ========================================================================== */

import { fetchRadarFrames, radarTileUrl } from '../api.js';
import { timeLabel } from '../format.js';

const FRAME_MS = 480;
const REST_MS = 1400;      // linger on the last frame before looping

export function createRadar(map, { onFrame } = {}) {
  let layers = [];
  let frames = [];
  let idx = 0;
  let timer = null;
  let playing = false;
  let attached = false;

  async function load() {
    const { host, frames: f } = await fetchRadarFrames();
    frames = f;
    layers = frames.map((frame) =>
      L.tileLayer(radarTileUrl(host, frame.path), {
        opacity: 0, zIndex: 400, tileSize: 256,
        /* RainViewer's free tile cache serves radar only up to z7 — z8 and
           above return a grey "Zoom Level Not Supported" placeholder PNG with
           HTTP 200, so it cannot be detected as an error and renders as broken
           boxes over the map. Verified by probing z6–z12 directly.
           maxNativeZoom makes Leaflet upscale the z7 tile instead. Radar is
           ~1 km data drawn as soft blobs, so upscaling loses nothing real. */
        maxNativeZoom: 7,
        maxZoom: 19,
        attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>',
      })
    );
    return frames.length;
  }

  function showFrame(i) {
    if (!layers.length) return;
    idx = ((i % layers.length) + layers.length) % layers.length;
    layers.forEach((l, k) => l.setOpacity(k === idx ? 0.75 : 0));
    const f = frames[idx];
    onFrame?.({
      index: idx,
      total: frames.length,
      time: new Date(f.time * 1000),
      label: timeLabel(new Date(f.time * 1000)),
      forecast: f.forecast,
    });
  }

  function step() {
    const last = idx === layers.length - 1;
    showFrame(idx + 1);
    timer = setTimeout(step, last ? FRAME_MS : (idx === layers.length - 1 ? REST_MS : FRAME_MS));
  }

  return {
    async attach() {
      if (!attached) {
        if (!layers.length) await load();
        layers.forEach((l) => l.addTo(map));
        attached = true;
      }
      showFrame(layers.length - 1);
      return frames.length;
    },
    detach() {
      this.pause();
      layers.forEach((l) => map.removeLayer(l));
      attached = false;
    },
    play() {
      if (playing || !layers.length) return;
      /* Respect reduced-motion: show the latest frame, don't animate. */
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        showFrame(layers.length - 1);
        return;
      }
      playing = true;
      timer = setTimeout(step, FRAME_MS);
    },
    pause() {
      playing = false;
      clearTimeout(timer);
      timer = null;
    },
    toggle() { playing ? this.pause() : this.play(); return playing; },
    get playing() { return playing; },
    get count() { return frames.length; },
  };
}
