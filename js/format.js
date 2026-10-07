/**
 * format.js
 * ---------------------------------------------------------------------------
 * Number and text formatting shared by all panels.
 */

import { METRICS, PERILS } from "./config.js";

const countFormat = d3.format(",");
const compactFormat = d3.format(".3~s");

export function formatMoney(value) {
  if (value == null) return "—";
  if (!value) return "$0";
  return "$" + compactFormat(value).replace("G", "B");
}
export const formatCount = (value) => (value == null ? "—" : countFormat(Math.round(value)));
export const formatPercent = (value) => (value == null ? "—" : d3.format(".0%")(value));

/** Format a value of any catalogue metric. */
export function formatMetric(metric, value) {
  if (value == null || !Number.isFinite(value)) return "—";
  switch (METRICS[metric].format) {
    case "money": return formatMoney(value);
    case "percent": return d3.format(value > 0 && value < 0.1 ? ".1%" : ".0%")(value);
    case "ratio": return d3.format(".2f")(value);
    case "rate1": return d3.format(",.1f")(value);
    case "rate2": return d3.format(",.2f")(value);
    case "year": return String(Math.round(value));
    default: return formatCount(value);
  }
}

export function formatMagnitude(peril, magnitude, measured) {
  if (peril === 2 || !magnitude) return "tornado";
  if (peril === 0) return `${(magnitude / 100).toFixed(2)} in hail`;
  return `${magnitude} kt ${measured ? "(measured)" : "(estimated)"}`;
}

export const perilLabel = (peril) => PERILS[peril].label;
export const perilColor = (peril) => PERILS[peril].color;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (month) => MONTHS[month - 1];
