/**
 * map.js  ·  View 1: Texas county map (RQ1, RQ3)
 * ---------------------------------------------------------------------------
 * Choropleth of one period metric. Quantile classes with an explicit legend;
 * hatched = unavailable (null); pale = measured zero. The focus county is
 * outlined in black, comparison counties in their comparison colours, and
 * the drill-down events of the focus county are drawn as dots.
 * Click = focus · Shift-click = add to / remove from comparison.
 */

import { COMPARE_COLORS, METRICS, NULL_FILL, ZERO_FILL } from "../config.js";
import { TOOLTIP_KEYS, addNullPattern, colorScale, countyTooltip, hideTooltip, showTooltip } from "./common.js";

export function createMap(container, data, { onFocus, onTogglePin }) {
  const width = 620, height = 580;
  const projection = d3.geoConicEqualArea().parallels([27.5, 35]).rotate([100, 0]).center([0, 31.25]).fitSize([width, height - 10], data.texas);
  const path = d3.geoPath(projection);
  const root = d3.select(container);
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "map-svg").attr("role", "img").attr("aria-label", "Texas county map");
  addNullPattern(svg);
  const countiesG = svg.append("g");
  svg.append("path").datum(data.borders).attr("class", "county-borders").attr("d", path);
  svg.append("path").datum(data.texas).attr("class", "state-outline").attr("d", path);
  const highlightG = svg.append("g");
  const eventsG = svg.append("g");
  const legendEl = root.append("div").attr("class", "legend");

  const shapes = countiesG.selectAll("path").data(data.counties).join("path").attr("class", "county").attr("d", (c) => path(c.feature))
    .on("click", (event, c) => (event.shiftKey ? onTogglePin(c.fips) : onFocus(c.fips)));

  function update(state, analysis, drill) {
    const key = state.mapMetric, spec = METRICS[key];
    const values = analysis.metrics.map((m) => m[key]);
    const scale = colorScale(key, values);
    shapes.attr("fill", (_, i) => (spec.unavailable ? NULL_FILL : scale.fill(values[i])))
      .on("mousemove", (event, c) => showTooltip(event, countyTooltip(c, analysis.metrics[data.counties.indexOf(c)], [...new Set([key, ...TOOLTIP_KEYS])])))
      .on("mouseleave", hideTooltip);

    // highlight focus + comparison counties
    const marks = [...state.pinned.map((f, i) => ({ fips: f, color: COMPARE_COLORS[i], width: 2.4 })),
      ...(state.focus ? [{ fips: state.focus, color: "#000", width: 3 }] : [])];
    highlightG.selectAll("path").data(marks, (d) => d.fips + d.color).join("path")
      .attr("d", (d) => path(data.countyByFips.get(d.fips).feature)).attr("fill", "none")
      .attr("stroke", (d) => d.color).attr("stroke-width", (d) => d.width).attr("stroke-linejoin", "round");

    // event dots for the focus county drill-down
    const ev = data.events.columns;
    const dots = drill ? drill.filter((i) => ev.begin_lat[i] != null) : [];
    const maxD = d3.max(dots, (i) => ev.damage[i] || 0) || 1;
    eventsG.selectAll("circle").data(dots, (i) => i).join("circle")
      .attr("cx", (i) => projection([ev.begin_lon[i], ev.begin_lat[i]])?.[0]).attr("cy", (i) => projection([ev.begin_lon[i], ev.begin_lat[i]])?.[1])
      .attr("r", (i) => 1.6 + 6 * Math.sqrt((ev.damage[i] || 0) / maxD))
      .attr("class", (i) => `event-dot peril-${ev.peril[i]}`);

    // legend with units and the zero / unavailable keys
    const items = spec.unavailable ? [] : scale.legend;
    legendEl.html(`<div class="legend-title">${spec.label} <span class="unit">(${spec.unit})</span>${spec.compat && spec.compat !== "compatible" ? ` <span class="compat compat-${spec.compat}">${spec.compat}</span>` : ""}</div>
      <div class="legend-def">${spec.def}</div>
      <div class="legend-swatches">${items.map((d) => `<span class="sw"><i style="background:${d.color}"></i>${d.label}</span>`).join("")}
      ${scale.hasZero ? `<span class="sw"><i style="background:${ZERO_FILL}"></i>0 (measured)</span>` : ""}
      <span class="sw"><i class="hatch"></i>n/a (unavailable)</span></div>
      ${spec.scale === "diverging" ? '<div class="legend-def">Red = higher paid loss per policy than the baseline expects; blue = lower.</div>' : ""}
      ${drill && drill.length ? `<div class="legend-def">Dots: NOAA events in the drill-down (size ∝ reported damage).</div>` : ""}`);
  }
  return { update };
}
