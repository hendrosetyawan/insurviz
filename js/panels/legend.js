/**
 * legend.js
 * ---------------------------------------------------------------------------
 * The encoding key floating over the 3D stage: what height means, and the
 * colour classes (quantiles) with their value breaks.
 */

import { LENSES, METRICS, NO_DATA_COLOR } from "../config.js";
import { formatMetric } from "../format.js";

export function createLegend(container) {
  const root = d3.select(container);
  const heightRow = root.append("div").attr("class", "legend__row");
  const colorTitle = root.append("div").attr("class", "legend__row");
  const width = 250, swatch = 22;
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} 30`).attr("class", "legend__ramp");

  function update(heightMetric, colorMetric, colorScale) {
    const tag = (m) => `<span class="lens-tag" style="--lens:${LENSES[METRICS[m].lens].color}">${LENSES[METRICS[m].lens].label}</span>`;
    heightRow.html(`<b>Height</b> ${tag(heightMetric)} ${METRICS[heightMetric].label}${METRICS[heightMetric].risk === "low" ? " (taller = lower)" : ""}`);
    colorTitle.html(`<b>Colour</b> ${tag(colorMetric)} ${METRICS[colorMetric].label} <em>quantile classes</em>`);
    const items = [...colorScale.colors.map((c, i) => ({ color: c, i })), { color: NO_DATA_COLOR, i: -1 }];
    svg.selectAll("rect").data(items).join("rect")
      .attr("x", (d) => (d.i < 0 ? width - swatch : d.i * swatch)).attr("y", 2).attr("width", swatch - 2).attr("height", 10).attr("fill", (d) => d.color);
    const labels = colorScale.breaks.map((b, i) => ({ x: (i + 1) * swatch - 1, text: formatMetric(colorMetric, b) }));
    svg.selectAll("text.break").data(labels).join("text").attr("class", "break")
      .attr("x", (d) => d.x).attr("y", 24).attr("text-anchor", "middle").text((d, i) => (i % 2 === 0 ? d.text : ""));
    svg.selectAll("text.nodata").data([0]).join("text").attr("class", "nodata").attr("x", width - swatch / 2).attr("y", 24).attr("text-anchor", "middle").text("n/a");
  }
  return { update };
}
