import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scoreHour, windScore, bandFor, bestWindow, dayPeak, scoreSeries } from '../js/score.js';

/* ==========================================================================
   Wind curve
   ========================================================================== */

test('the wind curve peaks across the prime band and falls off both sides', () => {
  assert.equal(windScore(0), 0);
  assert.equal(windScore(8), 100);
  assert.equal(windScore(12), 100, 'plateau holds mid-band');
  assert.equal(windScore(16), 100);
  assert.ok(windScore(4) < windScore(6), 'rises through the light band');
  assert.ok(windScore(18) < windScore(16), 'falls once overpowered');
  assert.ok(windScore(30) < windScore(22));
  assert.equal(windScore(50), 0, 'beyond the curve clamps to zero');
});

test('the wind curve is monotonic up to the plateau', () => {
  let prev = -1;
  for (let kn = 0; kn <= 8; kn += 0.5) {
    const s = windScore(kn);
    assert.ok(s >= prev, `dip at ${kn} kn`);
    prev = s;
  }
});

test('bad input degrades to zero rather than NaN', () => {
  assert.equal(windScore(NaN), 0);
  assert.equal(windScore(undefined), 0);
  assert.equal(windScore(-5), 0);
});

/* ==========================================================================
   Scoring
   ========================================================================== */

test('a perfect hour scores at the top', () => {
  const r = scoreHour({ windKn: 12, gustKn: 14, pop: 0, tempC: 21, weatherCode: 0 });
  assert.equal(r.score, 100);
  assert.equal(r.band.key, 'excellent');
});

test('gustiness pulls down an otherwise perfect breeze', () => {
  const calm = scoreHour({ windKn: 12, gustKn: 14, pop: 0, tempC: 20 });
  const gusty = scoreHour({ windKn: 12, gustKn: 24, pop: 0, tempC: 20 });   // gf 2.0
  assert.ok(gusty.score < calm.score, 'gusty scores lower');
  assert.ok(gusty.reasons.includes('gusty and shifty'));
});

test('rain penalty is sub-linear, not proportional', () => {
  const dry = scoreHour({ windKn: 12, gustKn: 14, pop: 0, tempC: 20 });
  const half = scoreHour({ windKn: 12, gustKn: 14, pop: 50, tempC: 20 });
  const wet = scoreHour({ windKn: 12, gustKn: 14, pop: 100, tempC: 20 });
  assert.ok(half.score < dry.score);
  assert.ok(wet.score < half.score);
  assert.ok(dry.score - half.score < half.score - wet.score,
    'the second half of the rain scale costs more than the first');
});

test('thunderstorms hard-cap the score regardless of a perfect breeze', () => {
  const r = scoreHour({ windKn: 12, gustKn: 13, pop: 20, tempC: 22, weatherCode: 95 });
  assert.ok(r.score <= 5);
  assert.equal(r.band.key, 'bad');
  assert.deepEqual(r.reasons, ['thunderstorms']);
});

test('calm and storm both score badly, for opposite reasons', () => {
  const calm = scoreHour({ windKn: 1, gustKn: 2, tempC: 20 });
  const storm = scoreHour({ windKn: 32, gustKn: 45, tempC: 12 });
  assert.ok(calm.score < 25, `calm scored ${calm.score}`);
  assert.ok(storm.score < 25, `storm scored ${storm.score}`);
  assert.ok(calm.reasons.includes('too little wind'));
});

test('cold weather costs points', () => {
  const warm = scoreHour({ windKn: 12, gustKn: 14, tempC: 20 });
  const cold = scoreHour({ windKn: 12, gustKn: 14, tempC: 1 });
  assert.ok(cold.score < warm.score);
  assert.ok(cold.reasons.includes('cold'));
});

test('score is always clamped into 0..100 and integral', () => {
  for (const kn of [0, 3, 7, 12, 19, 25, 40]) {
    for (const pop of [0, 50, 100]) {
      const r = scoreHour({ windKn: kn, gustKn: kn * 2.2, pop, tempC: -5, weatherCode: 45 });
      assert.ok(r.score >= 0 && r.score <= 100, `out of range: ${r.score}`);
      assert.equal(r.score, Math.round(r.score));
    }
  }
});

test('bands cover the whole range with no gaps', () => {
  for (let s = 0; s <= 100; s++) {
    assert.ok(bandFor(s), `no band for ${s}`);
  }
  assert.equal(bandFor(100).key, 'excellent');
  assert.equal(bandFor(75).key, 'excellent');
  assert.equal(bandFor(74).key, 'fair');
  assert.equal(bandFor(50).key, 'fair');
  assert.equal(bandFor(49).key, 'poor');
  assert.equal(bandFor(25).key, 'poor');
  assert.equal(bandFor(24).key, 'bad');
  assert.equal(bandFor(0).key, 'bad');
});

/* ==========================================================================
   Windows
   ========================================================================== */

const mk = (scores, isDay = () => true) =>
  scores.map((s, i) => ({
    time: new Date(2026, 6, 18, i), score: s, isDay: isDay(i), band: bandFor(s),
  }));

test('bestWindow picks the strongest 3-hour daylight block', () => {
  const hours = mk([10, 20, 80, 90, 85, 10, 60, 62]);
  const w = bestWindow(hours);
  assert.equal(w.hours, 3);
  assert.equal(w.start.getHours(), 2);
  assert.equal(w.end.getHours(), 4);
  assert.equal(w.peak, 90);
});

test('bestWindow stays short instead of reporting the whole day', () => {
  // Every hour clears the bar. A "longest run" would return 0-11h, which is
  // not advice; the fixed window must still isolate the actual peak.
  const hours = mk([60, 62, 61, 63, 88, 92, 90, 64, 61, 60, 62, 61]);
  const w = bestWindow(hours);
  assert.equal(w.hours, 3, 'window stays 3h wide');
  assert.equal(w.start.getHours(), 4);
  assert.equal(w.end.getHours(), 6);
});

test('bestWindow ignores night hours even when they score well', () => {
  const hours = mk([95, 95, 95, 95, 10, 60, 65, 62], (i) => i >= 4);
  const w = bestWindow(hours);
  assert.equal(w.start.getHours(), 5, 'picked the daylight run');
  assert.equal(w.hours, 3);
});

test('bestWindow will not straddle a gap in the hours', () => {
  // Daylight at 0,1 then a jump to 10,11 — never one window.
  const hours = [0, 1, 10, 11].map((h) => ({
    time: new Date(2026, 6, 18, h), score: 90, isDay: true, band: bandFor(90),
  }));
  assert.equal(bestWindow(hours, { length: 3 }), null);
});

test('bestWindow returns null when nothing clears the threshold', () => {
  assert.equal(bestWindow(mk([10, 12, 20, 5])), null);
});

test('bestWindow returns null on an isolated spike', () => {
  assert.equal(bestWindow(mk([10, 90, 10, 90, 10])), null, 'one good hour is not a window');
});

test('dayPeak prefers daylight hours', () => {
  const hours = mk([99, 99, 40, 55], (i) => i >= 2);
  assert.equal(dayPeak(hours).score, 55);
});

/* ==========================================================================
   Series
   ========================================================================== */

test('scoreSeries maps an Open-Meteo hourly block', () => {
  const out = scoreSeries({
    time: ['2026-07-18T10:00', '2026-07-18T11:00'],
    wind_speed_10m: [12, 2],
    wind_gusts_10m: [14, 3],
    precipitation_probability: [0, 90],
    temperature_2m: [20, 20],
    weather_code: [0, 61],
    is_day: [1, 1],
  });
  assert.equal(out.length, 2);
  assert.equal(out[0].score, 100);
  assert.ok(out[1].score < 25);
  assert.ok(out[0].time instanceof Date);
});

test('scoreSeries tolerates missing optional fields', () => {
  const out = scoreSeries({
    time: ['2026-07-18T10:00'],
    wind_speed_10m: [12],
  });
  assert.equal(out.length, 1);
  assert.ok(out[0].score > 0);
  assert.equal(out[0].isDay, true);
});
