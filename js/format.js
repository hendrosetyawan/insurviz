/**
 * format.js
 * ---------------------------------------------------------------------------
 * Number and text formatting shared by all panels.
 */

import { METRICS, PERILS } from "./config.js";

const countFormat = d3.format(",");
const compactFormat = d3.format(".3~s");

/** "$1.2M", "$350K", "$0" */
export function formatMoney(value) {
  if (!value) return "$0";
  return "$" + compactFormat(value).replace("G", "B");
}

/** Format a value of the chosen metric. */
export function formatMetric(metric, value) {
  return METRICS[metric].format === "money" ? formatMoney(value) : countFormat(Math.round(value));
}

export const formatCount = (value) => countFormat(Math.round(value));
export const formatPercent = d3.format(".0%");

/** Event magnitude as it reads in NOAA terms. */
export function formatMagnitude(peril, magnitude, measured) {
  if (peril === 2 || !magnitude) return "—";
  if (peril === 0) return `${(magnitude / 100).toFixed(2)} in hail`;
  return `${magnitude} kt ${measured ? "(measured)" : "(estimated)"}`;
}

export const perilLabel = (peril) => PERILS[peril].label;
export const perilColor = (peril) => PERILS[peril].color;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (month) => MONTHS[month - 1];
