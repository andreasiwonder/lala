import test from 'node:test';
import assert from 'node:assert/strict';
import { FORECAST_REFRESH_MS, needsForecastRefresh } from '../js/refresh.js';

test('a forecast refreshes after ten minutes, but not before', () => {
  const loadedAt = 1_000;
  assert.equal(needsForecastRefresh(loadedAt, loadedAt + FORECAST_REFRESH_MS - 1), false);
  assert.equal(needsForecastRefresh(loadedAt, loadedAt + FORECAST_REFRESH_MS), true);
});

test('a page without a successful forecast retries immediately', () => {
  assert.equal(needsForecastRefresh(0, 10_000), true);
});
