/**
 * format.js
 * ---------------------------------------------------------------------------
 * Number formatting. null renders as "n/a" (unavailable), never as 0.
 */

import { METRICS, PERILS } from "./config.js";

export const NA = "n/a";
const compact = d3.format(".3~s");

export function money(v) {
  if (v == null || !Number.isFinite(v)) return NA;
  if (v === 0) return "$0";
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  return sign + "$" + (a < 1000 ? d3.format(",.0f")(a) : compact(a).replace("G", "B"));
}
export const count = (v) => (v == null || !Number.isFinite(v) ? NA : d3.format(",.0f")(v));
export const pct = (v, digits = 0) => (v == null || !Number.isFinite(v) ? NA : d3.format(`.${digits}%`)(v));
export const ordinal = (p) => {
  if (p == null) return NA;
  const n = Math.round(p), s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export const times = (v) => (v == null || !Number.isFinite(v) ? NA : `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}×`);

/** Format a value of a catalogue metric. */
export function metric(key, v) {
  if (v == null || !Number.isFinite(v)) return NA;
  switch (METRICS[key].format) {
    case "money": return money(v);
    case "count": return count(v);
    case "count1": return d3.format(",.1f")(v);
    case "count2": return d3.format(",.2f")(v);
    case "rate2": return d3.format(",.2f")(v);
    case "times": return times(v);
    default: return String(v);
  }
}
export const perilLabel = (key) => PERILS.find((p) => p.key === key)?.label ?? key;
