# Alster Sailing Weather

Wind, gusts, rain and sailing conditions for the **Außenalster** in Hamburg —
plus radar, ten years of history, and an honest answer to "should I trust this
forecast?"

Built for a dinghy / small keelboat sailor. Free data sources only, no backend,
no API keys.

## Running it

It's a static site with no build step:

```bash
npm run serve     # http://localhost:8000
npm test          # 23 unit tests, no dependencies
```

Deploy is `git push` — GitHub Pages serves `main` directly.

## How it works

| Piece | Source | Notes |
|---|---|---|
| Current + hourly + 3-day forecast | Open-Meteo | Keyless, CORS-open, fetched in the browser |
| Forecast accuracy | Open-Meteo Previous-Runs | Truth + 1/2/3-day-ahead forecasts in one call |
| Ten-year climatology | Open-Meteo ERA5 archive | Precomputed into `data/climatology.json` |
| Rain radar | RainViewer | Animated, keyless |
| Station cross-check | Bright Sky / DWD | Hamburg-Fuhlsbüttel, ~7 km |
| Map tiles | CARTO / OpenStreetMap | Follows the light/dark substrate |

### Two things worth knowing

**Don't pin `models=icon_d2`.** ICON-D2 is the high-resolution German model but
only runs ~48h. Pinning it returns `null` for day 3 and for
`precipitation_probability` at *every* hour. The default `best_match` already
selects ICON-D2 for the near term and falls back beyond it. `fetchForecast()`
asserts against this specific failure so a silent model swap surfaces loudly.

**Forecast accuracy needs no infrastructure.** The Previous-Runs API returns the
analysis and what the forecast said 1/2/3 days earlier, already aligned on the
same timestamps. So there is no cron job, no database, and no waiting weeks for
data to accumulate — it works on first load. The trade-off, stated on the page:
"truth" there is the model's own later analysis, not a measurement.

**No waves.** The Außenalster is ~1.6 km². No wave model covers it and none
would mean anything. Instead `js/chop.js` derives a qualitative surface state
from wind speed and the fetch available in that direction — the lake is ~1.6 km
N–S but only ~1.2 km E–W, so a northerly builds noticeably more chop than an
easterly at the same speed. It deliberately never prints a wave height in metres.

## The hourly score

Every hour gets a 0–100 sailing score (`js/score.js`), shown as a colour-coded
strip per day and as a ring for the current hour. It starts from a wind curve
that plateaus at 100 across 8–16 kn, then deducts for gustiness, rain, cold and
fog; thunderstorms hard-cap it at 5. Nothing is a tuned black box — each hour
carries a `reasons` array that the UI surfaces, so any reading can be explained.

Each day also names its **best 3-hour window**. That length is deliberate: a
"longest run above a threshold" is useless here, because on a typical Alster day
almost every hour clears the bar and it reports "best 06–22h", which is not
advice. The window also requires every hour to clear a floor, not just the
average — otherwise 90 / 10 / 90 averages to a recommendation.

The four score bands reuse the site's status colours, so green means the same
thing here as on the verdict badge. Colour is never the only channel: every cell
prints its number, every row states its window in words, and the legend labels
each band.

## Design

The page is **conditions-reactive**: the current sailing verdict selects a
pastel traffic-light background — green for good, yellow for caution or calm,
and red for serious or critical conditions. Weather and sun position still
provide the initial loading theme before live conditions arrive.

Charts do *not* ride that shifting background — they sit on one of exactly two
card surfaces (light `#fcfcfb` / dark `#1a1a19`), because the series palette is
validated against those two and nothing else. The wind/gust pair measures CVD
ΔE 24.7 (light) and 26.8 (dark), well clear of the ≥8 target.

Wind and rain share an x-axis but never a y-axis — they're stacked panels with
one crosshair, not a dual-axis chart.

Force a theme for testing with `?theme=storm` (any of the six states).

## Layout

```
index.html
css/       theme.css (reactive states) · layout.css · charts.css
js/
  api.js      all remote data access + caching
  verdict.js  wind → sailing verdict, gust-factor and thunder overrides
  chop.js     fetch geometry → qualitative surface state
  theme.js    conditions → theme state
  charts/     timeline · windRose · accuracy  (hand-rolled SVG)
  map/        base · radar · wind
data/climatology.json         committed; 87,672 hours, 2016–2025
scripts/build-climatology.mjs
.github/workflows/climatology.yml   monthly refresh
```

## Data & licensing

Non-commercial use of free tiers throughout. Open-Meteo (CC BY 4.0), DWD via
Bright Sky, RainViewer, CARTO tiles, OpenStreetMap data. Attribution is in the
page footer.

This is a planning aid, not a safety service.
