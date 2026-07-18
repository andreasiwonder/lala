/* ==========================================================================
   chop.js — surface state on the Außenalster.
   --------------------------------------------------------------------------
   There is no wave model for a 1.6 km² inland lake, and there shouldn't be:
   the physics that matter here are fetch-limited wind chop, not swell. So we
   derive a QUALITATIVE band from wind speed and the fetch available in the
   wind's direction, and we deliberately never render a wave height in metres —
   a number like "0.3 m" would imply a precision that does not exist.

   Geometry: the Außenalster is roughly elliptical, ~1.6 km N–S by ~1.2 km E–W.
   A northerly therefore builds noticeably more chop than an easterly at the
   same wind speed, which is a real and locally well-known effect.
   ========================================================================== */

const SEMI_NS_KM = 0.80;   // semi-axis, north–south
const SEMI_EW_KM = 0.60;   // semi-axis, east–west
const KN_TO_MS = 0.514444;

/**
 * Fetch (km) available to wind arriving from `directionDeg` (meteorological:
 * the direction it blows FROM). Modelled as the chord of the ellipse through
 * the centre — symmetric, so the from/to distinction doesn't affect length.
 */
export function fetchKm(directionDeg) {
  const t = (directionDeg * Math.PI) / 180;     // 0° = N, along the long axis
  const a = SEMI_NS_KM, b = SEMI_EW_KM;
  const denom = Math.hypot(b * Math.cos(t), a * Math.sin(t));
  return (2 * a * b) / denom;
}

/* Fetch-limited chop grows with wind speed and the square root of fetch. We
   keep this as a dimensionless index rather than converting to a height. */
export const chopIndex = (windKn, directionDeg) =>
  windKn * KN_TO_MS * Math.sqrt(fetchKm(directionDeg));

const BANDS = [
  { max: 2,        key: 'glassy', label: 'Glassy',      detail: 'Mirror flat' },
  { max: 5,        key: 'ripple', label: 'Rippled',     detail: 'Small ripples, no real chop' },
  { max: 9,        key: 'light',  label: 'Light chop',  detail: 'Short wind chop building' },
  { max: 13,       key: 'chop',   label: 'Choppy',      detail: 'Steep little waves, spray downwind' },
  { max: Infinity, key: 'steep',  label: 'Steep chop',  detail: 'Short, steep and wet' },
];

/**
 * @returns {{key:string, label:string, detail:string, fetchKm:number, index:number}}
 */
export function chopFor(windKn, directionDeg) {
  const index = chopIndex(windKn, directionDeg);
  const band = BANDS.find((b) => index < b.max) ?? BANDS[BANDS.length - 1];
  return { ...band, fetchKm: fetchKm(directionDeg), index };
}

/** True when this direction gives near-maximum fetch — the choppiest axis. */
export const isLongFetch = (directionDeg) => fetchKm(directionDeg) > 1.4;
