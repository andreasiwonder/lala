/* ==========================================================================
   charts/windRose.js — climatological wind rose.
   --------------------------------------------------------------------------
   Polar stacked bars: 16 direction sectors × 5 speed bins. Speed is an ordered
   magnitude, so it takes a SEQUENTIAL single-hue ramp (light → dark), never
   categorical hues. The bins deliberately match the sailing verdict bands, so
   the rose reads as "how often is it sailable, and from where".
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => {
  const e = document.createElementNS(NS, n);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, v);
  return e;
};

export const SPEED_BINS = [
  { label: '0–4 kn',  hint: 'drifting',  color: 'var(--seq-100)' },
  { label: '4–8 kn',  hint: 'light',     color: 'var(--seq-250)' },
  { label: '8–16 kn', hint: 'prime',     color: 'var(--seq-400)' },
  { label: '16–22 kn', hint: 'demanding', color: 'var(--seq-550)' },
  { label: '22+ kn',  hint: 'too much',  color: 'var(--seq-700)' },
];

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/**
 * @param {HTMLElement} container
 * @param {number[][]} matrix 16 sectors × 5 bins, values are % of all hours
 */
export function renderWindRose(container, matrix) {
  container.textContent = '';

  const size = Math.min(Math.max(container.clientWidth || 320, 260), 380);
  const cx = size / 2, cy = size / 2;
  const rMax = size / 2 - 30;

  const totals = matrix.map((s) => s.reduce((a, b) => a + b, 0));
  const peak = Math.max(...totals, 0.001);
  const ringStep = peak > 12 ? 5 : peak > 6 ? 3 : 2;
  const rings = [];
  for (let v = ringStep; v <= peak + ringStep; v += ringStep) rings.push(v);
  const ringMax = rings[rings.length - 1] || peak;

  const r = (v) => (v / ringMax) * rMax;
  const sectorWidth = (2 * Math.PI) / 16;
  const pad = sectorWidth * 0.14;

  const svg = el('svg', {
    width: '100%', viewBox: `0 0 ${size} ${size}`,
    role: 'img',
    'aria-label': 'Wind rose: how often the wind blows from each direction, by speed band',
    style: `max-width:${size}px`,
  });

  /* Rings + radial labels */
  for (const v of rings) {
    svg.appendChild(el('circle', {
      cx, cy, r: r(v), fill: 'none', stroke: 'var(--grid)', 'stroke-width': 1,
    }));
    const t = el('text', {
      x: cx + 3, y: cy - r(v) - 2, fill: 'var(--ink-muted)', 'font-size': 9,
      style: 'font-variant-numeric: tabular-nums',
    });
    t.textContent = `${v}%`;
    svg.appendChild(t);
  }

  /* Cardinal labels */
  DIRS.forEach((d, i) => {
    if (i % 4 !== 0) return;
    const a = i * sectorWidth - Math.PI / 2;
    const t = el('text', {
      x: cx + Math.cos(a) * (rMax + 16),
      y: cy + Math.sin(a) * (rMax + 16) + 4,
      'text-anchor': 'middle', fill: 'var(--ink-2)',
      'font-size': 12, 'font-weight': 650,
    });
    t.textContent = d;
    svg.appendChild(t);
  });

  /* Stacked petals */
  const arc = (r0, r1, a0, a1) => {
    const p = (rad, ang) => [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
    const [x0, y0] = p(r0, a0), [x1, y1] = p(r1, a0);
    const [x2, y2] = p(r1, a1), [x3, y3] = p(r0, a1);
    return `M${x0},${y0}L${x1},${y1}A${r1},${r1} 0 0 1 ${x2},${y2}L${x3},${y3}A${r0},${r0} 0 0 0 ${x0},${y0}Z`;
  };

  matrix.forEach((sector, i) => {
    const a0 = i * sectorWidth - Math.PI / 2 - sectorWidth / 2 + pad;
    const a1 = a0 + sectorWidth - pad * 2;
    let acc = 0;
    sector.forEach((val, b) => {
      if (val <= 0) return;
      const path = el('path', {
        d: arc(r(acc), r(acc + val), a0, a1),
        fill: SPEED_BINS[b].color,
        /* 2px surface gap between stacked segments */
        stroke: 'var(--card)', 'stroke-width': 2, 'stroke-linejoin': 'round',
      });
      const title = el('title');
      title.textContent = `${DIRS[i]} · ${SPEED_BINS[b].label} — ${val.toFixed(1)}% of hours`;
      path.appendChild(title);
      svg.appendChild(path);
      acc += val;
    });
  });

  container.appendChild(svg);

  /* Legend — sequential ramp, ordered, always present */
  const legend = document.createElement('div');
  legend.className = 'legend legend-ramp';
  legend.innerHTML = SPEED_BINS.map((b) =>
    `<span class="lg"><i class="sw" style="background:${b.color}"></i>${b.label}<em>${b.hint}</em></span>`
  ).join('');
  container.appendChild(legend);
}
