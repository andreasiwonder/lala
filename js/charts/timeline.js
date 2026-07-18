/* ==========================================================================
   charts/timeline.js — 72h wind + rain.
   --------------------------------------------------------------------------
   Wind (mean + gusts) and rain probability are DIFFERENT measures on different
   scales, so they get two stacked panels sharing one x-axis — never a dual
   y-axis. One crosshair drives both panels at once.

   Colours come from CSS custom properties so the light/dark card substrates
   swap in one place. Series pair validated: CVD ΔE 24.7 light / 26.8 dark.
   ========================================================================== */

import { compassPoint, timeLabel } from '../format.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => {
  const e = document.createElementNS(NS, n);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, v);
  return e;
};

/* right margin holds the direct labels ("wind", "gusts") and the sweet-spot
   annotation, all of which sit outside the plot area */
const M = { top: 26, right: 74, bottom: 26, left: 40 };
const WIND_H = 150;
const RAIN_H = 68;
const GAP = 40;

export function renderTimeline(container, data, { hours = 72 } = {}) {
  container.textContent = '';

  const h = data.hourly;
  const n = Math.min(hours, h.time.length);
  const times = h.time.slice(0, n).map((t) => new Date(t));
  const wind = h.wind_speed_10m.slice(0, n);
  const gust = h.wind_gusts_10m.slice(0, n);
  const dir = h.wind_direction_10m.slice(0, n);
  const pop = h.precipitation_probability.slice(0, n).map((v) => v ?? 0);

  const W = Math.max(container.clientWidth || 640, 320);
  const innerW = W - M.left - M.right;
  const totalH = M.top + WIND_H + GAP + RAIN_H + M.bottom;

  const svg = el('svg', {
    width: '100%', viewBox: `0 0 ${W} ${totalH}`,
    role: 'img',
    'aria-label': `Wind and rain probability for the next ${n} hours`,
  });

  const x = (i) => M.left + (i / (n - 1)) * innerW;

  const windMax = Math.max(12, Math.ceil(Math.max(...gust, ...wind) / 5) * 5);
  const yWindTop = M.top;
  const yWind = (v) => yWindTop + WIND_H - (v / windMax) * WIND_H;

  const yRainTop = M.top + WIND_H + GAP;
  const yRain = (v) => yRainTop + RAIN_H - (v / 100) * RAIN_H;

  /* --- Gridlines + y ticks (recessive) ---------------------------------- */
  const windTicks = [0, windMax / 2, windMax];
  for (const t of windTicks) {
    svg.appendChild(el('line', {
      x1: M.left, x2: M.left + innerW, y1: yWind(t), y2: yWind(t),
      stroke: 'var(--grid)', 'stroke-width': 1,
    }));
    const lab = el('text', {
      x: M.left - 8, y: yWind(t) + 4, 'text-anchor': 'end',
      fill: 'var(--ink-muted)', 'font-size': 11,
      style: 'font-variant-numeric: tabular-nums',
    });
    lab.textContent = t;
    svg.appendChild(lab);
  }

  const unitLabel = el('text', {
    x: M.left - 8, y: yWindTop - 10, 'text-anchor': 'end',
    fill: 'var(--ink-muted)', 'font-size': 11,
  });
  unitLabel.textContent = 'kn';
  svg.appendChild(unitLabel);

  for (const t of [0, 50, 100]) {
    svg.appendChild(el('line', {
      x1: M.left, x2: M.left + innerW, y1: yRain(t), y2: yRain(t),
      stroke: 'var(--grid)', 'stroke-width': 1,
    }));
    const lab = el('text', {
      x: M.left - 8, y: yRain(t) + 4, 'text-anchor': 'end',
      fill: 'var(--ink-muted)', 'font-size': 11,
      style: 'font-variant-numeric: tabular-nums',
    });
    lab.textContent = t === 100 ? '100%' : t;
    svg.appendChild(lab);
  }

  /* --- Sailing sweet-spot band (8–16 kn) -------------------------------- */
  svg.appendChild(el('rect', {
    x: M.left, y: yWind(16), width: innerW, height: Math.max(0, yWind(8) - yWind(16)),
    fill: 'var(--good)', opacity: 0.07,
  }));
  const bandLab = el('text', {
    x: M.left + innerW + 6, y: yWind(12) + 4,
    fill: 'var(--ink-muted)', 'font-size': 10,
  });
  bandLab.textContent = 'sweet spot';
  svg.appendChild(bandLab);

  /* --- Day boundaries + x labels every 6h -------------------------------- */
  for (let i = 0; i < n; i++) {
    const d = times[i];
    if (d.getHours() === 0 && i > 0) {
      svg.appendChild(el('line', {
        x1: x(i), x2: x(i), y1: yWindTop, y2: yRainTop + RAIN_H,
        stroke: 'var(--axis)', 'stroke-width': 1, 'stroke-dasharray': '2 3',
      }));
    }
    if (d.getHours() % 6 === 0) {
      const lab = el('text', {
        x: x(i), y: yRainTop + RAIN_H + 16, 'text-anchor': 'middle',
        fill: 'var(--ink-muted)', 'font-size': 11,
        style: 'font-variant-numeric: tabular-nums',
      });
      lab.textContent = d.getHours() === 0 ? timeLabel(d) : String(d.getHours()).padStart(2, '0');
      svg.appendChild(lab);
    }
  }

  /* --- Rain: sequential blue area ---------------------------------------- */
  const rainArea = pop.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${yRain(v)}`).join('') +
    `L${x(n - 1)},${yRain(0)}L${x(0)},${yRain(0)}Z`;
  svg.appendChild(el('path', { d: rainArea, fill: 'var(--seq-400)', opacity: 0.28 }));
  svg.appendChild(el('path', {
    d: pop.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${yRain(v)}`).join(''),
    fill: 'none', stroke: 'var(--seq-400)', 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));

  /* Direct label — this panel has one series, so it needs no legend entry. */
  const rainLab = el('text', {
    x: M.left + innerW + 6, y: yRainTop + 12,
    fill: 'var(--seq-400)', 'font-size': 11, 'font-weight': 600,
  });
  rainLab.textContent = 'rain';
  svg.appendChild(rainLab);

  /* --- Wind: gust area + two lines --------------------------------------- */
  const gustArea = gust.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${yWind(v)}`).join('') +
    wind.map((v, i) => `L${x(n - 1 - i)},${yWind(wind[n - 1 - i])}`).join('') + 'Z';
  svg.appendChild(el('path', { d: gustArea, fill: 'var(--series-gust)', opacity: 0.12 }));

  const line = (vals, stroke, dash) => el('path', {
    d: vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${yWind(v)}`).join(''),
    fill: 'none', stroke, 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    ...(dash ? { 'stroke-dasharray': dash } : {}),
  });
  svg.appendChild(line(gust, 'var(--series-gust)', '4 3'));
  svg.appendChild(line(wind, 'var(--series-wind)'));

  /* --- Direct labels at the right end (identity never by colour alone) --- */
  const endLabel = (v, i, fill, text) => {
    const t = el('text', {
      x: x(i) + 6, y: yWind(v) + 4, fill, 'font-size': 11, 'font-weight': 600,
    });
    t.textContent = text;
    return t;
  };
  svg.appendChild(endLabel(gust[n - 1], n - 1, 'var(--series-gust)', 'gusts'));
  svg.appendChild(endLabel(wind[n - 1], n - 1, 'var(--series-wind)', 'wind'));

  /* --- "Now" marker ------------------------------------------------------ */
  const now = new Date();
  const nowIdx = times.findIndex((t) => t >= now);
  if (nowIdx > 0) {
    svg.appendChild(el('line', {
      x1: x(nowIdx), x2: x(nowIdx), y1: yWindTop - 6, y2: yRainTop + RAIN_H,
      stroke: 'var(--ink)', 'stroke-width': 1.5, opacity: 0.45,
    }));
    const t = el('text', {
      x: x(nowIdx), y: yWindTop - 12, 'text-anchor': 'middle',
      fill: 'var(--ink-2)', 'font-size': 10, 'font-weight': 650,
    });
    t.textContent = 'NOW';
    svg.appendChild(t);
  }

  /* --- Crosshair + tooltip (shared across both panels) ------------------- */
  const hair = el('line', {
    y1: yWindTop - 6, y2: yRainTop + RAIN_H,
    stroke: 'var(--ink)', 'stroke-width': 1, opacity: 0, 'pointer-events': 'none',
  });
  const dotW = el('circle', { r: 4.5, fill: 'var(--series-wind)', stroke: 'var(--card)', 'stroke-width': 2, opacity: 0, 'pointer-events': 'none' });
  const dotG = el('circle', { r: 4.5, fill: 'var(--series-gust)', stroke: 'var(--card)', 'stroke-width': 2, opacity: 0, 'pointer-events': 'none' });
  const dotR = el('circle', { r: 4.5, fill: 'var(--seq-400)', stroke: 'var(--card)', 'stroke-width': 2, opacity: 0, 'pointer-events': 'none' });
  svg.append(hair, dotW, dotG, dotR);

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;

  const hit = el('rect', {
    x: M.left, y: yWindTop - 6, width: innerW, height: yRainTop + RAIN_H - yWindTop + 6,
    fill: 'transparent', style: 'cursor: crosshair',
  });
  svg.appendChild(hit);

  const show = (i) => {
    const px = x(i);
    hair.setAttribute('x1', px); hair.setAttribute('x2', px);
    hair.setAttribute('opacity', 0.28);
    dotW.setAttribute('cx', px); dotW.setAttribute('cy', yWind(wind[i])); dotW.setAttribute('opacity', 1);
    dotG.setAttribute('cx', px); dotG.setAttribute('cy', yWind(gust[i])); dotG.setAttribute('opacity', 1);
    dotR.setAttribute('cx', px); dotR.setAttribute('cy', yRain(pop[i])); dotR.setAttribute('opacity', 1);

    tip.hidden = false;
    tip.innerHTML =
      `<div class="tip-h">${timeLabel(times[i])} · ${times[i].toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Europe/Berlin' })}</div>` +
      `<div class="tip-r"><span class="sw" style="background:var(--series-wind)"></span>Wind<b>${wind[i].toFixed(1)} kn</b></div>` +
      `<div class="tip-r"><span class="sw" style="background:var(--series-gust)"></span>Gusts<b>${gust[i].toFixed(1)} kn</b></div>` +
      `<div class="tip-r"><span class="sw" style="background:var(--seq-400)"></span>Rain<b>${pop[i]}%</b></div>` +
      `<div class="tip-r tip-sub">Direction<b>${compassPoint(dir[i])} ${Math.round(dir[i])}°</b></div>`;

    const cw = container.clientWidth;
    const left = Math.min(Math.max(px - 70, 4), Math.max(cw - 152, 4));
    tip.style.left = `${left}px`;
    tip.style.top = `${yWindTop + 4}px`;
  };

  const hide = () => {
    hair.setAttribute('opacity', 0);
    for (const d of [dotW, dotG, dotR]) d.setAttribute('opacity', 0);
    tip.hidden = true;
  };

  const idxFromEvent = (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(n - 1, Math.round(((sx - M.left) / innerW) * (n - 1))));
  };

  svg.addEventListener('pointermove', (ev) => show(idxFromEvent(ev)));
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('pointerdown', (ev) => show(idxFromEvent(ev)));

  container.style.position = 'relative';
  container.append(svg, tip);
  return { redraw: () => renderTimeline(container, data, { hours }) };
}
