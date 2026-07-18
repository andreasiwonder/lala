/* ==========================================================================
   map/wind.js — animated wind-particle overlay.
   --------------------------------------------------------------------------
   leaflet-velocity wants a GRIB-style u/v grid. Open-Meteo accepts
   comma-separated coordinate lists, so an 8×8 grid over Hamburg costs ONE
   request (see fetchWindGrid in api.js) rather than 64.

   This is the most fragile piece of the site — it depends on a third-party
   plugin loaded from a CDN. Every failure path here degrades to "layer
   unavailable" rather than breaking the map, and the Windy embed below already
   covers the same need.
   ========================================================================== */

import { fetchWindGrid } from '../api.js';

/* The box must cover more than the visible map at the default zoom, or the
   particle field ends in a hard rectangle mid-view. Still one request: a
   10×10 grid is 100 coordinate pairs in a single comma-separated call. */
const BOX = { west: 8.80, south: 52.95, east: 11.20, north: 54.25 };
const GRID = { cols: 10, rows: 10 };

export function createWind(map) {
  let layer = null;
  let loading = null;

  async function build() {
    if (typeof L.velocityLayer !== 'function') {
      throw new Error('wind plugin unavailable');
    }
    const data = await fetchWindGrid({ ...BOX, ...GRID });
    return L.velocityLayer({
      displayValues: false,
      data,
      minVelocity: 0,
      maxVelocity: 15,          // m/s — saturates around a strong breeze
      velocityScale: 0.012,
      particleAge: 70,
      particleMultiplier: 1 / 220,
      lineWidth: 1.6,
      colorScale: ['#86b6ef', '#3987e5', '#2a78d6', '#eb6834'],
    });
  }

  return {
    async attach() {
      if (!layer) {
        loading = loading || build();
        layer = await loading;
      }
      layer.addTo(map);
    },
    detach() {
      if (layer) map.removeLayer(layer);
    },
  };
}
