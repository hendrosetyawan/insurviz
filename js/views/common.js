/**
 * common.js
 * ---------------------------------------------------------------------------
 * Shared helpers for the views: tooltip, metric colour scales, county tooltip
 * content, and the SVG hatch pattern that marks unavailable (null) values.
 */

import { GROUPS, METRICS, NULL_FILL, ZERO_FILL } from "../config.js";
import { metric, ordinal } from "../format.js";

const tooltipEl = () => document.getElementById("tooltip");
export function showTooltip(event, html) {
  const el = tooltipEl();
  el.innerHTML = html;
  el.hidden = false;
  const pad = 14, w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = `${Math.min(event.clientX + pad, window.innerWidth - w - 8)}px`;
  el.style.top = `${Math.min(event.clientY + pad, window.innerHeight - h - 8)}px`;
}
export const hideTooltip = () => { tooltipEl().hidden = true; };

/** Add the diagonal-hatch pattern used for null (unavailable) values to an SVG. */
export function addNullPattern(svg) {
  const defs = svg.append("defs");
  const p = defs.append("pattern").attr("id", "null-hatch").attr("patternUnits", "userSpaceOnUse").attr("width", 5).attr("height", 5).attr("patternTransform", "rotate(45)");
  p.append("rect").attr("width", 5).attr("height", 5).attr("fill", "#fafafa");
  p.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 5).attr("stroke", "#c8c8c8").attr("stroke-width", 1.4);
}

/**
 * Colour scale for a metric across counties.
 *  - quantile classes (7) for skewed magnitudes and rates,
 *  - a diverging log scale around 1× for the baseline ratio.
 * Returns fill(value) plus legend items.
 */
export function colorScale(key, values) {
  const spec = METRICS[key];
  const valid = values.filter((v) => v != null && Number.isFinite(v));
  if (spec.scale === "diverging") {
    const s = d3.scaleDivergingLog(d3.interpolateRdBu).domain([3, 1, 1 / 3]).clamp(true);
    const stops = [1 / 3, 0.5, 0.75, 1, 1.33, 2, 3];
    return { fill: (v) => (v == null || !(v > 0) ? NULL_FILL : s(v)), legend: stops.map((v) => ({ color: s(v), label: `${v >= 1 ? v.toFixed(v === 1 ? 0 : 1) : v.toFixed(2)}×` })), kind: "diverging" };
  }
  const positive = valid.filter((v) => v > 0);
  const colors = d3.quantize(d3.interpolateYlGnBu, 8).slice(1);
  const q = d3.scaleQuantile().domain(positive).range(colors);
  const fill = (v) => (v == null || !Number.isFinite(v) ? NULL_FILL : v <= 0 ? ZERO_FILL : q(v));
  const breaks = q.quantiles();
  const legend = colors.map((c, i) => ({ color: c, label: i === 0 ? `< ${metric(key, breaks[0])}` : i === colors.length - 1 ? `≥ ${metric(key, breaks[i - 1])}` : `${metric(key, breaks[i - 1])}–${metric(key, breaks[i])}` }));
  return { fill, legend, kind: "quantile", hasZero: valid.some((v) => v <= 0) };
}

/** Standard county tooltip: name plus key metrics with Texas percentiles. */
export function countyTooltip(county, m, keys) {
  const rows = keys.map((k) => `<tr><td><span class="gdot" style="background:${GROUPS[METRICS[k].group].color}"></span>${METRICS[k].label}</td><td class="num">${metric(k, m[k])}</td><td class="pct">${m.pct[k] == null ? "" : ordinal(m.pct[k])}</td></tr>`).join("");
  const flags = [county.twia ? "TWIA coastal county" : null, m.smallBase ? "small policy base" : null].filter(Boolean);
  return `<div class="tt-title">${county.name} County</div>${flags.length ? `<div class="tt-flags">${flags.join(" · ")}</div>` : ""}
    <table class="tt-table"><tr><th></th><th>value</th><th>TX pct.</th></tr>${rows}</table>
    ${m.types.length ? `<div class="tt-types">${m.types.map((t) => `<span class="tag">${t}</span>`).join("")}</div>` : ""}`;
}
export const TOOLTIP_KEYS = ["storm_count", "noaa_property_damage", "tdi_paid_loss", "loss_per_policy", "estimated_property_exposure", "residual"];
