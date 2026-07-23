export const FORECAST_REFRESH_MS = 10 * 60 * 1000;

/** Whether a page returning from the background needs fresh conditions. */
export function needsForecastRefresh(lastLoadedAt, now = Date.now()) {
  return !lastLoadedAt || now - lastLoadedAt >= FORECAST_REFRESH_MS;
}
