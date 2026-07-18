/* ==========================================================================
   scoreStrip.js — hourly sailing score, 0–100, one scrollable row per day.
   --------------------------------------------------------------------------
   Mobile-first: the row scrolls horizontally with snap points and 44px touch
   targets, and today's row auto-scrolls to the current hour. On a phone you
   should be able to answer "when should I go out?" in one glance and one swipe.

   Colour is a REINFORCEMENT, never the message: every cell prints its number,
   each row states its best window in words, and the legend labels every band.
   The four bands reuse the site's status colours so a green here means exactly
   what a green means on the verdict badge.
   ========================================================================== */

import { BANDS, bestWindow, dayPeak } from './score.js';
import { dayName, timeLabel } from './format.js';

const TONE_VAR = {
  good: 'var(--good)',
  warning: 'var(--warning)',
  serious: 'var(--serious)',
  critical: 'var(--critical)',
};

const hh = (d) => String(d.getHours()).padStart(2, '0');

/** Group a flat scored series into calendar days. */
export function groupByDay(scored) {
  const days = new Map();
  for (const h of scored) {
    const key = h.time.toDateString();
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(h);
  }
  return [...days.values()];
}

/* Deep night is dead space on a phone screen — nobody is sailing the Alster at
   03:00, and 24 cells per row pushes the useful hours off-screen. 05:00–22:00
   still covers every daylight hour even at midsummer, and in winter the dark
   ends simply render dimmed. */
const FIRST_HOUR = 5;
const LAST_HOUR = 22;

export function renderScoreStrip(container, scored, { maxDays = 4 } = {}) {
  container.textContent = '';
  const now = new Date();

  const days = groupByDay(scored)
    .map((hours) => {
      const isToday = hours[0].time.toDateString() === now.toDateString();
      return hours.filter((h) => {
        const hr = h.time.getHours();
        if (hr < FIRST_HOUR || hr > LAST_HOUR) return false;
        /* Today starts at the current hour: past hours are not a decision. */
        if (isToday && hr < now.getHours()) return false;
        return true;
      });
    })
    .filter((hours) => hours.length)
    .slice(0, maxDays);

  for (const hours of days) {
    const date = hours[0].time;
    const peak = dayPeak(hours);
    const win = bestWindow(hours);

    const row = document.createElement('section');
    row.className = 'sd';

    const head = document.createElement('div');
    head.className = 'sd-head';
    head.innerHTML =
      `<span class="sd-name">${dayName(date, now)}</span>` +
      (win
        ? `<span class="sd-best">Best <b>${hh(win.start)}–${String(win.end.getHours() + 1).padStart(2, '0')}h</b>` +
          `<span class="sd-chip" style="--tone:${TONE_VAR[peak.band.tone]}">${Math.round(win.avg)}</span></span>`
        : `<span class="sd-best sd-none">No good window</span>`);
    row.appendChild(head);

    const strip = document.createElement('div');
    strip.className = 'sd-strip';
    strip.setAttribute('role', 'list');
    strip.setAttribute('aria-label', `Hourly sailing score for ${dayName(date, now)}`);

    for (const h of hours) {
      const cell = document.createElement('div');
      cell.className = 'sd-cell' + (h.isDay ? '' : ' is-night');
      cell.setAttribute('role', 'listitem');
      cell.style.setProperty('--tone', TONE_VAR[h.band.tone]);

      const isNow = h.time.getHours() === now.getHours() &&
        h.time.toDateString() === now.toDateString();
      if (isNow) cell.classList.add('is-now');

      cell.innerHTML =
        `<span class="sd-hour">${hh(h.time)}</span>` +
        `<span class="sd-val">${h.score}</span>` +
        `<span class="sd-bar"></span>`;

      cell.title =
        `${timeLabel(h.time)} — ${h.score}/100, ${h.band.label}` +
        (h.reasons.length ? ` (${h.reasons.join(', ')})` : '') +
        (h.isDay ? '' : ' · after dark');

      strip.appendChild(cell);
    }

    row.appendChild(strip);
    container.appendChild(row);

    /* Open each row on the hour that matters: the current hour today, the
       first daylight hour on later days. Set scrollLeft directly rather than
       scrollIntoView, which would drag the whole page sideways/vertically. */
    const anchor = strip.querySelector('.is-now')
      || strip.querySelector('.sd-cell:not(.is-night)');
    if (anchor) requestAnimationFrame(() => {
      strip.scrollLeft = Math.max(
        0, anchor.offsetLeft - strip.clientWidth / 2 + anchor.offsetWidth / 2);
    });
  }

  const legend = document.createElement('div');
  legend.className = 'legend legend-score';
  legend.innerHTML = BANDS.map((b) =>
    `<span class="lg"><i class="sw" style="background:${TONE_VAR[b.tone]}"></i>` +
    `${b.label}<em>${b.min < 0 ? '0' : b.min}${b.min === 75 ? '–100' : b.min < 0 ? '–24' : `–${nextMin(b)}`}</em></span>`
  ).join('');
  container.appendChild(legend);
}

function nextMin(band) {
  const i = BANDS.indexOf(band);
  return i > 0 ? BANDS[i - 1].min - 1 : 100;
}
