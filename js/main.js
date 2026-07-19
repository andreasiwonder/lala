/* ==========================================================================
   main.js — wiring.
   Each section loads independently: a failure in the radar or the climatology
   must never take down the forecast, which is the reason anyone opens the page.
   ========================================================================== */

import { fetchForecast, fetchAccuracy, fetchStation, fetchClimatology } from './api.js';
import { evaluate, evaluateDay, TONE_VAR } from './verdict.js';
import { chopFor } from './chop.js';
import { pickState, applyState } from './theme.js';
import {
  describeCode, compassPoint, round, dayName, dateLabel, stampLabel,
  weatherIcon, iconWarning, iconCheck, iconInfo, iconPlay, iconPause,
} from './format.js';
import { scoreHour, scoreSeries } from './score.js';
import { renderScoreStrip } from './scoreStrip.js';
import { renderTimeline } from './charts/timeline.js';
import { renderWindRose } from './charts/windRose.js';
import { computeAccuracy, renderAccuracy } from './charts/accuracy.js';
import { createMap } from './map/base.js';
import { createRadar } from './map/radar.js';
import { createWind } from './map/wind.js';
import { initPhoneCompass } from './compass.js';

const $ = (id) => document.getElementById(id);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

let forecast = null;
let currentMode = 'light';

/* ==========================================================================
   Hero + days + chart
   ========================================================================== */

async function loadForecast() {
  try {
    forecast = await fetchForecast();
  } catch (err) {
    $('hero-loading').hidden = true;
    const box = $('hero-error');
    box.hidden = false;
    box.textContent = `Could not load the forecast: ${err.message}`;
    return;
  }

  const c = forecast.current;
  const now = new Date();

  /* --- Theme ------------------------------------------------------------- */
  const state = pickState({
    weatherCode: c.weather_code,
    isDay: c.is_day === 1,
    cloudCover: c.cloud_cover,
    now,
    sunrise: forecast.daily.sunrise?.[0],
    sunset: forecast.daily.sunset?.[0],
  });
  const applied = applyState(state);
  currentMode = document.documentElement.dataset.mode;

  /* --- Current numbers ---------------------------------------------------- */
  const wind = c.wind_speed_10m;
  const gust = c.wind_gusts_10m;
  const dir = c.wind_direction_10m;

  $('wind-now').textContent = round(wind, wind < 10 ? 1 : 0);
  $('gust-now').textContent = `${round(gust, 0)} kn`;
  $('wx-now').textContent = describeCode(c.weather_code);
  $('feels-now').textContent = `${round(c.apparent_temperature, 0)}°`;
  $('dir-text').textContent = compassPoint(dir);
  $('dir-deg').textContent = `${Math.round(dir)}°`;

  /* The arrow shows where the wind is GOING; meteorological direction is where
     it comes FROM, hence the 180° offset. */
  $('compass-arrow').setAttribute('transform', `rotate(${dir + 180} 50 50)`);

  $('temp-now').textContent = `${round(c.temperature_2m, 0)}°C`;
  $('pres-now').textContent = `${round(c.pressure_msl, 0)} hPa`;

  const hIdx = forecast.hourly.time.findIndex((t) => new Date(t) >= now);
  const popNow = forecast.hourly.precipitation_probability?.[Math.max(hIdx, 0)];
  $('pop-now').textContent = popNow == null ? '–' : `${popNow}%`;

  const chop = chopFor(wind, dir);
  $('chop-now').innerHTML = `${chop.label}`;
  $('fetch-now').innerHTML = `${chop.fetchKm.toFixed(1)}<small> km ${compassPoint(dir)}</small>`;

  /* --- Verdict ------------------------------------------------------------ */
  const v = evaluate({ windKn: wind, gustKn: gust, weatherCode: c.weather_code });
  const color = TONE_VAR[v.tone];
  $('verdict').style.setProperty('--verdict-color', color);
  $('verdict-icon').innerHTML =
    v.tone === 'good' ? iconCheck : v.tone === 'neutral' ? iconInfo : iconWarning;
  $('verdict-label').textContent = v.label;
  $('verdict-detail').textContent = v.detail;

  $('warnings').innerHTML = v.warnings.map((w) =>
    `<div class="warn" style="--warn-color:${TONE_VAR[w.tone]}">${iconWarning}<span>${w.text}</span></div>`
  ).join('');

  /* --- Score, now and hour by hour ---------------------------------------- */
  const nowScore = scoreHour({
    windKn: wind, gustKn: gust,
    pop: popNow ?? 0,
    tempC: c.temperature_2m,
    weatherCode: c.weather_code,
    isDay: c.is_day === 1,
  });
  renderNowScore(nowScore);

  $('updated').textContent = `Updated ${stampLabel(c.time)}`;
  $('updated').setAttribute('datetime', c.time);

  $('hero-loading').hidden = true;
  $('hero-body').hidden = false;

  renderScoreStrip($('scorestrip'), scoreSeries(forecast.hourly));
  renderDays();
  renderChart();
  return applied;
}

const SCORE_TONE = {
  good: 'var(--good)', warning: 'var(--warning)',
  serious: 'var(--serious)', critical: 'var(--critical)',
};

function renderNowScore(s) {
  const CIRC = 2 * Math.PI * 42;      // r=42 in the ring's viewBox
  const arc = $('score-arc');
  arc.setAttribute('stroke-dasharray', CIRC.toFixed(1));
  arc.style.setProperty('--tone', SCORE_TONE[s.band.tone]);
  /* Fill clockwise from the top; the transition animates it in on load. */
  requestAnimationFrame(() => {
    arc.setAttribute('stroke-dashoffset', (CIRC * (1 - s.score / 100)).toFixed(1));
  });

  $('score-num').textContent = s.score;
  $('score-label').textContent = `${s.band.label} — ${s.score}/100 right now`;
  $('score-sub').textContent = s.reasons.length
    ? s.reasons.join(' · ')
    : 'wind, rain and temperature combined';
}

function renderDays() {
  const d = forecast.daily;
  $('days').innerHTML = d.time.map((t, i) => {
    const day = {
      windMax: d.wind_speed_10m_max[i],
      gustMax: d.wind_gusts_10m_max[i],
      weatherCode: d.weather_code[i],
    };
    const v = evaluateDay(day);
    const dirDom = d.wind_direction_10m_dominant[i];
    return `
      <article class="day">
        <div class="drow">
          <div>
            <div class="dname">${dayName(t)}</div>
            <div class="ddate">${dateLabel(t)}</div>
          </div>
          <span class="icon-wx" title="${describeCode(day.weatherCode)}">${weatherIcon(day.weatherCode)}</span>
        </div>
        <div class="drow">
          <div class="dwind">${round(day.windMax, 0)}<small> kn</small></div>
          <div class="dgust">gusts ${round(day.gustMax, 0)} kn<br>${compassPoint(dirDom)}</div>
        </div>
        <div class="dmeta">
          <span>${round(d.temperature_2m_min[i], 0)}° / ${round(d.temperature_2m_max[i], 0)}°</span>
          <span>${d.precipitation_probability_max[i] ?? 0}% rain</span>
        </div>
        <div class="dverdict" style="color:${TONE_VAR[v.tone]}">
          <span class="dot" style="background:${TONE_VAR[v.tone]}"></span>
          <span style="color:var(--ink)">${v.label}</span>
        </div>
      </article>`;
  }).join('');
}

function renderChart() {
  if (forecast) renderTimeline($('timeline'), forecast);
}

/* ==========================================================================
   Map
   ========================================================================== */

async function loadMap() {
  if (typeof L === 'undefined') {
    $('map').innerHTML = '<p class="error">Map library failed to load.</p>';
    return;
  }

  const { map } = createMap('map', currentMode);
  const radar = createRadar(map, {
    onFrame: ({ index, total, label, forecast: isFc }) => {
      $('radar-fill').style.width = `${((index + 1) / total) * 100}%`;
      $('radar-time').textContent = isFc ? `${label} (forecast)` : label;
    },
  });
  const wind = createWind(map);

  const setPressed = (btn, on) => btn.setAttribute('aria-pressed', String(on));
  const paint = () => {
    $('radar-toggle').innerHTML = radar.playing ? iconPause : iconPlay;
  };

  /* Radar on by default — it's the layer people actually came for. */
  try {
    await radar.attach();
    radar.play();
    paint();
  } catch (err) {
    $('radar-bar').hidden = true;
    $('btn-radar').disabled = true;
    setPressed($('btn-radar'), false);
  }

  $('radar-toggle').addEventListener('click', () => { radar.toggle(); paint(); });

  $('btn-radar').addEventListener('click', async () => {
    const on = $('btn-radar').getAttribute('aria-pressed') === 'true';
    if (on) { radar.detach(); $('radar-bar').hidden = true; }
    else { await radar.attach(); radar.play(); $('radar-bar').hidden = false; }
    setPressed($('btn-radar'), !on);
    paint();
  });

  $('btn-wind').addEventListener('click', async () => {
    const btn = $('btn-wind');
    const on = btn.getAttribute('aria-pressed') === 'true';
    const note = $('wind-layer-note');
    if (on) {
      wind.detach();
      setPressed(btn, false);
      note.hidden = true;
      return;
    }
    btn.disabled = true;
    try {
      await wind.attach();
      setPressed(btn, true);
      note.hidden = false;
      note.textContent = 'Wind particles show the surface flow across Hamburg — direction and relative strength, sampled on a grid.';
    } catch (err) {
      note.hidden = false;
      note.textContent = 'The wind overlay is unavailable right now — the full weather map below shows the same field.';
    } finally {
      btn.disabled = false;
    }
  });
}

/* ==========================================================================
   Accuracy
   ========================================================================== */

async function loadAccuracy() {
  const box = $('accuracy');
  try {
    const data = await fetchAccuracy(30);
    const result = computeAccuracy(data);
    renderAccuracy(box, result);

    const days = Math.round(result.samples / 24);
    const caveat = $('accuracy-caveat');
    caveat.hidden = false;
    caveat.textContent =
      `Based on ${result.samples.toLocaleString('en-GB')} hourly comparisons (about ${days} days). ` +
      `"What actually happened" here is the model's own later analysis rather than a physical ` +
      `measurement — the closest real sensor is ${'7 km'} away at the airport, in far more open ground than the lake.`;
  } catch (err) {
    box.innerHTML = `<p class="note">Accuracy comparison unavailable: ${err.message}</p>`;
  }
}

/* ==========================================================================
   Climatology
   ========================================================================== */

let climatology = null;

async function loadClimatology() {
  try {
    climatology = await fetchClimatology();
  } catch {
    $('windrose').innerHTML = '<p class="note">Historical summary not available yet.</p>';
    $('monthly').innerHTML = '';
    return;
  }

  const sel = $('rose-month');
  MONTHS.forEach((m, i) => {
    const o = document.createElement('option');
    o.value = String(i + 1);
    o.textContent = m;
    sel.appendChild(o);
  });
  sel.value = String(new Date().getMonth() + 1);

  const draw = () => {
    const key = sel.value;
    const matrix = key === 'all'
      ? climatology.rose.all
      : climatology.rose.byMonth[key] || climatology.rose.all;
    renderWindRose($('windrose'), matrix);
  };
  sel.addEventListener('change', draw);
  draw();

  const { years } = climatology.meta;
  $('clim-note').textContent =
    `${years[1] - years[0] + 1} years of hourly reanalysis for the Alster (${years[0]}–${years[1]}).`;

  renderMonthly();
}

function renderMonthly() {
  const rows = climatology.months;
  const thisMonth = new Date().getMonth() + 1;
  /* Scale to the peak month rather than to 100%, so the seasonal shape is
     legible — the absolute value is printed alongside each bar anyway. */
  const maxPct = Math.max(...rows.map((m) => m.primePct));
  const best = rows.reduce((a, b) => (b.primePct > a.primePct ? b : a));
  const worst = rows.reduce((a, b) => (b.primePct < a.primePct ? b : a));

  $('monthly').innerHTML = rows.map((m) => `
    <div class="month-row${m.month === thisMonth ? ' is-now' : ''}">
      <span class="m">${MONTHS[m.month - 1].slice(0, 3)}</span>
      <span class="bar-track">
        <span class="bar" style="width:${(m.primePct / maxPct) * 100}%"></span>
      </span>
      <span class="val">${m.primePct.toFixed(0)}%</span>
    </div>
  `).join('');

  const note = document.createElement('p');
  note.className = 'month-legend';
  note.textContent =
    `Share of daylight hours in the prime 8–16 kn band. ` +
    `${MONTHS[best.month - 1]} is the windiest month (${best.primePct.toFixed(0)}%), ` +
    `${MONTHS[worst.month - 1]} the lightest (${worst.primePct.toFixed(0)}%).`;
  $('monthly').appendChild(note);
}

/* ==========================================================================
   Station cross-check
   ========================================================================== */

async function loadStation() {
  const box = $('station');
  try {
    const s = await fetchStation();
    $('stn-note').textContent =
      `${s.station}, ${s.distanceKm ? s.distanceKm.toFixed(1) + ' km' : 'nearby'} away — an airport in open ` +
      `terrain, so it usually reads windier than the sheltered Alster. Treat it as a sanity check, not the truth.`;
    box.innerHTML = `
      <div class="stn">
        <div class="cell"><div class="k">Measured wind</div><div class="v">${round(s.windKn, 1)}<small> kn</small></div></div>
        <div class="cell"><div class="k">Measured gusts</div><div class="v">${round(s.gustKn, 1)}<small> kn</small></div></div>
        <div class="cell"><div class="k">Direction</div><div class="v">${s.directionDeg == null ? '–' : compassPoint(s.directionDeg)}<small> ${s.directionDeg == null ? '' : Math.round(s.directionDeg) + '°'}</small></div></div>
        <div class="cell"><div class="k">Temperature</div><div class="v">${round(s.temperature, 1)}<small> °C</small></div></div>
        <div class="cell"><div class="k">Observed</div><div class="v" style="font-size:15px">${s.observedAt ? stampLabel(s.observedAt) : '–'}</div></div>
      </div>`;
  } catch (err) {
    box.innerHTML = `<p class="note">Station data unavailable: ${err.message}</p>`;
  }
}

/* ==========================================================================
   Boot
   ========================================================================== */

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderChart();
    if (climatology) {
      const sel = $('rose-month');
      const matrix = sel.value === 'all'
        ? climatology.rose.all
        : climatology.rose.byMonth[sel.value] || climatology.rose.all;
      renderWindRose($('windrose'), matrix);
    }
  }, 180);
});

/* Sections load in parallel and fail independently. */
initPhoneCompass({
  root: $('phone-compass'),
  face: $('phone-compass-face'),
  heading: $('phone-compass-heading'),
  note: $('phone-compass-note'),
  button: $('phone-compass-enable'),
});
loadForecast().then(loadMap);
loadAccuracy();
loadClimatology();
loadStation();
