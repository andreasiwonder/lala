/* ==========================================================================
   map/base.js — Leaflet map + Außenalster locator.
   Base tiles follow the card substrate so the map never fights the theme.
   ========================================================================== */

import { ALSTER } from '../api.js';

const TILES = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
};

/* Rough outline of the Außenalster — enough to orient a local, not a survey. */
const OUTLINE = [
  [53.5760, 9.9975], [53.5775, 10.0040], [53.5768, 10.0105], [53.5735, 10.0140],
  [53.5690, 10.0140], [53.5645, 10.0115], [53.5610, 10.0070], [53.5598, 10.0020],
  [53.5612, 9.9975], [53.5650, 9.9945], [53.5700, 9.9940], [53.5740, 9.9950],
];

export function createMap(elId, mode = 'light') {
  const map = L.map(elId, {
    center: [ALSTER.lat, ALSTER.lon],
    /* z10 balances the two jobs this map has: the Alster outline stays
       identifiable, while enough of the region is visible for approaching
       weather to be readable — and it keeps the radar upscale (native z7)
       modest enough to still look like weather. */
    zoom: 10,
    scrollWheelZoom: false,   // don't hijack the page scroll on the way past
    zoomControl: true,
  });

  const conf = TILES[mode] || TILES.light;
  const base = L.tileLayer(conf.url, {
    attribution: conf.attribution, subdomains: 'abcd', maxZoom: 19,
  }).addTo(map);

  L.polygon(OUTLINE, {
    color: '#2a78d6', weight: 2, fillColor: '#2a78d6', fillOpacity: 0.16,
  }).addTo(map).bindTooltip('Außenalster', { permanent: false });

  return { map, base, setMode(next) {
    const c = TILES[next] || TILES.light;
    base.setUrl(c.url);
  } };
}
