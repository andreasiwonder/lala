/* Run: node --test test/ */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluate, bandFor, isThunder, GUST_FACTOR_LIMIT } from '../js/verdict.js';
import { fetchKm, chopFor, chopIndex } from '../js/chop.js';
import { pickState, modeFor } from '../js/theme.js';
import { compassPoint, describeCode } from '../js/format.js';
import { computeAccuracy } from '../js/charts/accuracy.js';

/* ==========================================================================
   Verdict bands
   ========================================================================== */

test('bands map wind speed to the right verdict', () => {
  assert.equal(bandFor(0).key, 'drifting');
  assert.equal(bandFor(3.9).key, 'drifting');
  assert.equal(bandFor(4).key, 'light');
  assert.equal(bandFor(7.9).key, 'light');
  assert.equal(bandFor(8).key, 'prime');
  assert.equal(bandFor(15.9).key, 'prime');
  assert.equal(bandFor(16).key, 'demanding');
  assert.equal(bandFor(22).key, 'toomuch');
  assert.equal(bandFor(60).key, 'toomuch');
});

test('a calm day reads as drifting with no warnings', () => {
  const v = evaluate({ windKn: 2, gustKn: 3, weatherCode: 0 });
  assert.equal(v.key, 'drifting');
  assert.equal(v.tone, 'neutral');
  assert.equal(v.warnings.length, 0);
});

test('steady 12 kn is prime and unwarned', () => {
  const v = evaluate({ windKn: 12, gustKn: 15, weatherCode: 1 });
  assert.equal(v.key, 'prime');
  assert.equal(v.tone, 'good');
  assert.equal(v.warnings.length, 0);
});

/* --- Override 1: gustiness ------------------------------------------------ */

test('gusty wind is flagged even when the mean sits in the sweet spot', () => {
  const v = evaluate({ windKn: 10, gustKn: 18, weatherCode: 1 });   // factor 1.8
  assert.equal(v.key, 'prime', 'band itself is still prime');
  assert.equal(v.tone, 'warning', 'but the tone is escalated');
  assert.ok(v.warnings.some((w) => w.key === 'gusty'));
  assert.ok(v.gustFactor > GUST_FACTOR_LIMIT);
});

test('gust factor is not applied to near-calm air', () => {
  // 1 kn mean gusting 3 kn is a 3x factor but meteorologically meaningless.
  const v = evaluate({ windKn: 1, gustKn: 3, weatherCode: 0 });
  assert.equal(v.warnings.length, 0);
});

test('an absolute gust over the limit escalates to critical', () => {
  const v = evaluate({ windKn: 19, gustKn: 30, weatherCode: 1 });
  assert.equal(v.tone, 'critical');
  assert.ok(v.warnings.some((w) => w.key === 'gust-absolute'));
});

/* --- Override 2: thunderstorms -------------------------------------------- */

test('thunderstorms override a perfect wind reading', () => {
  const v = evaluate({ windKn: 11, gustKn: 13, weatherCode: 95 });
  assert.equal(v.tone, 'critical');
  assert.equal(v.label, 'Thunderstorms');
  assert.equal(v.warnings[0].key, 'thunder', 'thunder warning comes first');
});

test('thunder codes are exactly 95/96/99', () => {
  assert.ok(isThunder(95) && isThunder(96) && isThunder(99));
  assert.ok(!isThunder(82), 'violent showers are not thunder');
  assert.ok(!isThunder(3));
});

test('missing gust data degrades gracefully', () => {
  const v = evaluate({ windKn: 12 });
  assert.equal(v.key, 'prime');
  assert.equal(v.gustFactor, null);
  assert.equal(v.warnings.length, 0);
});

/* ==========================================================================
   Chop — fetch geometry
   ========================================================================== */

test('fetch is longest along the north-south axis', () => {
  const north = fetchKm(0);
  const east = fetchKm(90);
  const south = fetchKm(180);
  assert.ok(north > east, 'N-S fetch exceeds E-W');
  assert.ok(Math.abs(north - south) < 1e-9, 'symmetric through the centre');
  assert.ok(Math.abs(north - 1.6) < 0.01, `N-S chord is ~1.6 km, got ${north}`);
  assert.ok(Math.abs(east - 1.2) < 0.01, `E-W chord is ~1.2 km, got ${east}`);
});

test('same wind builds more chop from the north than from the east', () => {
  assert.ok(chopIndex(15, 0) > chopIndex(15, 90));
});

test('chop bands escalate with wind speed', () => {
  assert.equal(chopFor(1, 0).key, 'glassy');
  assert.equal(chopFor(25, 0).key, 'steep');
  const order = ['glassy', 'ripple', 'light', 'chop', 'steep'];
  let last = -1;
  for (const kn of [1, 5, 10, 16, 25]) {
    const idx = order.indexOf(chopFor(kn, 0).key);
    assert.ok(idx >= last, 'bands are monotonic in wind speed');
    last = idx;
  }
});

test('chop never reports a wave height', () => {
  const c = chopFor(15, 0);
  assert.equal(typeof c.label, 'string');
  assert.ok(!('heightM' in c), 'no fabricated metric height');
});

/* ==========================================================================
   Theme selection
   ========================================================================== */

const NOON = new Date('2026-07-18T12:00:00Z');

test('thunder wins over everything, including night', () => {
  assert.equal(pickState({ weatherCode: 95, isDay: false, now: NOON }), 'storm');
});

test('night is chosen when the sun is down', () => {
  assert.equal(pickState({ weatherCode: 0, isDay: false, now: NOON }), 'night');
});

test('clear day is clear; overcast follows cloud cover', () => {
  assert.equal(pickState({ weatherCode: 0, isDay: true, cloudCover: 10, now: NOON }), 'clear');
  assert.equal(pickState({ weatherCode: 3, isDay: true, cloudCover: 90, now: NOON }), 'overcast');
  assert.equal(pickState({ weatherCode: 0, isDay: true, cloudCover: 80, now: NOON }), 'overcast');
});

test('rain codes select the rain state', () => {
  assert.equal(pickState({ weatherCode: 63, isDay: true, now: NOON }), 'rain');
  assert.equal(pickState({ weatherCode: 80, isDay: true, now: NOON }), 'rain');
});

test('sunrise proximity selects dawn', () => {
  const now = new Date('2026-07-18T05:10:00Z');
  const state = pickState({
    weatherCode: 0, isDay: true, now,
    sunrise: '2026-07-18T05:00:00Z', sunset: '2026-07-18T21:00:00Z',
  });
  assert.equal(state, 'dawn');
});

test('only storm and night use the dark card substrate', () => {
  assert.equal(modeFor('storm'), 'dark');
  assert.equal(modeFor('night'), 'dark');
  for (const s of ['dawn', 'clear', 'overcast', 'rain']) {
    assert.equal(modeFor(s), 'light', `${s} should be light`);
  }
});

/* ==========================================================================
   Formatting
   ========================================================================== */

test('compass points wrap correctly', () => {
  assert.equal(compassPoint(0), 'N');
  assert.equal(compassPoint(360), 'N');
  assert.equal(compassPoint(359), 'N');
  assert.equal(compassPoint(90), 'E');
  assert.equal(compassPoint(180), 'S');
  assert.equal(compassPoint(270), 'W');
  assert.equal(compassPoint(247), 'WSW');
  assert.equal(compassPoint(-90), 'W', 'negative degrees still resolve');
});

test('unknown weather codes do not crash', () => {
  assert.equal(describeCode(1234), 'Unknown');
});

/* ==========================================================================
   Accuracy maths
   ========================================================================== */

test('accuracy computes MAE and within-tolerance share, skipping nulls', () => {
  const data = {
    hourly: {
      time: ['a', 'b', 'c', 'd'],
      wind_speed_10m:               [10, 10, 10, null],
      wind_speed_10m_previous_day1: [10, 11, 12, 5],
      wind_speed_10m_previous_day2: [null, null, null, null],
      wind_speed_10m_previous_day3: [4, 4, 4, 4],
    },
  };
  const r = computeAccuracy(data);

  const d1 = r.leads.find((l) => l.label === '1 day ahead');
  assert.equal(d1.n, 3, 'the null truth row is skipped');
  assert.ok(Math.abs(d1.mae - 1) < 1e-9, `MAE of 0,1,2 is 1 — got ${d1.mae}`);
  assert.ok(Math.abs(d1.within - 100) < 1e-9, 'all three within 2 kn');

  const d3 = r.leads.find((l) => l.label === '3 days ahead');
  assert.ok(Math.abs(d3.mae - 6) < 1e-9);
  assert.equal(d3.within, 0);

  assert.ok(!r.leads.some((l) => l.label === '2 days ahead'), 'all-null lead is dropped');
  assert.equal(r.samples, 3);
});

test('accuracy handles an empty response', () => {
  const r = computeAccuracy({});
  assert.deepEqual(r.leads, []);
  assert.equal(r.samples, 0);
});
