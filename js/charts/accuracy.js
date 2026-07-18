/* ==========================================================================
   charts/accuracy.js — how much should you trust the forecast?
   --------------------------------------------------------------------------
   Fed by the Previous-Runs API, which returns the analysis ("truth") and what
   the forecast said 1/2/3 days earlier on identical timestamps. We reduce that
   to mean absolute error per lead time.

   Lead time is an ORDERED magnitude, so the bars take an ordinal ramp (one
   hue, light → dark). Ordinal ramps must clear 2:1 against the surface, so the
   ramp starts at step 250, not step 100.
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => {
  const e = document.createElementNS(NS, n);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, v);
  return e;
};

const LEADS = [
  { key: 'wind_speed_10m_previous_day1', label: '1 day ahead',  color: 'var(--seq-250)' },
  { key: 'wind_speed_10m_previous_day2', label: '2 days ahead', color: 'var(--seq-400)' },
  { key: 'wind_speed_10m_previous_day3', label: '3 days ahead', color: 'var(--seq-550)' },
];

/** Tolerance for "close enough" — a dinghy sailor doesn't care about 2 kn. */
export const CLOSE_ENOUGH_KN = 2;

/**
 * @returns {{leads: Array<{label:string, color:string, mae:number, within:number, n:number}>,
 *            samples:number, from:string|null, to:string|null}}
 */
export function computeAccuracy(data) {
  const h = data?.hourly;
  if (!h?.time?.length) return { leads: [], samples: 0, from: null, to: null };

  const truth = h.wind_speed_10m;
  const leads = LEADS.map(({ key, label, color }) => {
    const pred = h[key] || [];
    let sum = 0, close = 0, n = 0;
    for (let i = 0; i < truth.length; i++) {
      const a = truth[i], b = pred[i];
      if (a === null || b === null || a === undefined || b === undefined) continue;
      const err = Math.abs(a - b);
      sum += err;
      if (err <= CLOSE_ENOUGH_KN) close++;
      n++;
    }
    return { label, color, mae: n ? sum / n : NaN, within: n ? (close / n) * 100 : NaN, n };
  }).filter((l) => l.n > 0);

  const valid = h.time.filter((_, i) => truth[i] !== null && truth[i] !== undefined);
  return {
    leads,
    samples: valid.length,
    from: valid[0] ?? null,
    to: valid[valid.length - 1] ?? null,
  };
}

export function renderAccuracy(container, result) {
  container.textContent = '';
  if (!result.leads.length) {
    container.innerHTML = '<p class="note">No comparison data available right now.</p>';
    return;
  }

  /* Headline: the reassuring number, as text not a chart. */
  const day1 = result.leads[0];
  const lead = document.createElement('p');
  lead.className = 'accuracy-lead';
  lead.innerHTML =
    `Tomorrow's wind forecast lands within <b>${CLOSE_ENOUGH_KN} kn</b> of what actually ` +
    `happened <b>${day1.within.toFixed(0)}%</b> of the time.`;
  container.appendChild(lead);

  const W = Math.max(container.clientWidth || 520, 300);
  const rowH = 46;
  const labelW = 104;
  const valueW = 92;
  const barW = W - labelW - valueW;
  const H = result.leads.length * rowH + 26;

  const maxMae = Math.max(...result.leads.map((l) => l.mae), 1);
  const scale = (v) => (v / (maxMae * 1.25)) * barW;

  const svg = el('svg', {
    width: '100%', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': 'Average wind forecast error by how far ahead the forecast was made',
  });

  result.leads.forEach((l, i) => {
    const y = i * rowH + 8;
    const bh = 22;

    const label = el('text', {
      x: 0, y: y + bh / 2 + 4, fill: 'var(--ink-2)', 'font-size': 13,
    });
    label.textContent = l.label;
    svg.appendChild(label);

    svg.appendChild(el('rect', {
      x: labelW, y, width: Math.max(scale(l.mae), 3), height: bh,
      /* 4px rounded data-end, anchored to the baseline at x = labelW */
      rx: 4, fill: l.color,
    }));
    svg.appendChild(el('rect', {
      x: labelW, y, width: 4, height: bh, fill: l.color,
    }));

    const val = el('text', {
      x: labelW + Math.max(scale(l.mae), 3) + 10, y: y + bh / 2 + 4,
      fill: 'var(--ink)', 'font-size': 13, 'font-weight': 600,
      style: 'font-variant-numeric: tabular-nums',
    });
    val.textContent = `± ${l.mae.toFixed(1)} kn`;
    svg.appendChild(val);

    const sub = el('text', {
      x: labelW, y: y + bh + 13, fill: 'var(--ink-muted)', 'font-size': 11,
    });
    sub.textContent = `${l.within.toFixed(0)}% within ${CLOSE_ENOUGH_KN} kn`;
    svg.appendChild(sub);
  });

  container.appendChild(svg);
}
