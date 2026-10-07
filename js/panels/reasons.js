/**
 * reasons.js  ·  why insurers say no (TDI HB 2067)
 * ---------------------------------------------------------------------------
 * Reasons on homeowners nonrenewal and declination notices in the selection,
 * as horizontal bars. Weather-related reasons (G wind/hail/hurricane, M roof
 * condition, F wildfire) are highlighted, because they connect the insurance
 * market back to the hazard lens. A notice can carry several reasons.
 */

import { PANELS } from "../config.js";
import { formatCount, formatPercent } from "../format.js";

const WEATHER_CODES = new Set(["G", "M", "F", "N"]);

export function createReasons(container, { reasonLabels }) {
  const root = d3.select(container);
  const width = 300, rowHeight = 19, labelWidth = 150;
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${PANELS.reasonsShown * rowHeight}`).attr("class", "reasons");
  const note = root.append("div").attr("class", "panel__sub");

  function update(selected) {
    const total = selected.notices || 0;
    const rows = Object.entries(selected.reasons || {}).map(([code, count]) => ({ code, count, label: reasonLabels[code] || code }))
      .sort((a, b) => b.count - a.count).slice(0, PANELS.reasonsShown);
    const x = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.count) || 1]).range([0, width - labelWidth - 46]);
    const row = svg.selectAll("g.reason").data(rows, (r) => r.code).join((enter) => {
      const g = enter.append("g").attr("class", "reason");
      g.append("text").attr("class", "reason__label").attr("x", labelWidth - 6).attr("y", rowHeight / 2).attr("dy", "0.35em").attr("text-anchor", "end");
      g.append("rect").attr("x", labelWidth).attr("y", 3).attr("height", rowHeight - 6).attr("rx", 2);
      g.append("text").attr("class", "reason__value").attr("y", rowHeight / 2).attr("dy", "0.35em");
      return g;
    });
    row.attr("transform", (_, i) => `translate(0,${i * rowHeight})`).classed("is-weather", (r) => WEATHER_CODES.has(r.code));
    row.select(".reason__label").text((r) => `${r.label} (${r.code})`);
    row.select("rect").transition().duration(400).attr("width", (r) => Math.max(1, x(r.count)));
    row.select(".reason__value").attr("x", (r) => labelWidth + x(r.count) + 4)
      .text((r) => (total ? formatPercent(r.count / total) : formatCount(r.count)));
    note.html(total
      ? `${formatCount(total)} homeowners nonrenewal/declination notices, Apr–Jun 2026. Bars = share of notices citing each reason; weather-related reasons highlighted.`
      : "No reason data for this selection.");
  }
  return { update };
}
