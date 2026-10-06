/**
 * ranking.js  ·  R1 Geographic comparison
 * ---------------------------------------------------------------------------
 * States ranked by the chosen metric, as stacked bars by peril. A toggle
 * switches between totals and a rate per 100k residents per year, because raw
 * counts mostly show where people live (population map ≠ rate map).
 * Clicking a state selects it in every view.
 */

import { PANELS, PERILS } from "../config.js";
import { formatMetric } from "../format.js";

export function createRanking(container, { stateNames, statePopulation, onSelectState }) {
  const root = d3.select(container);
  const toggle = root.append("div").attr("class", "segmented");
  let mode = "total";
  toggle.selectAll("button").data([["total", "Total"], ["rate", "Per 100k / yr"]]).join("button")
    .text((d) => d[1])
    .on("click", (_, d) => { mode = d[0]; toggle.selectAll("button").classed("is-active", (b) => b[0] === mode); render(); });
  toggle.selectAll("button").classed("is-active", (b) => b[0] === mode);

  const width = 300, rowHeight = 21, labelWidth = 104, valueWidth = 52;
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${PANELS.rankingCount * rowHeight}`).attr("class", "ranking");
  let last = null;

  function render() {
    if (!last) return;
    const { stateValues, metric, yearSpan, selectedFips } = last;
    const rows = [];
    for (const [fips, values] of stateValues) {
      const name = stateNames.get(fips);
      const population = statePopulation.get(fips);
      if (!name || (mode === "rate" && !(population > 250000))) continue; // skip tiny bases for rates
      const scale = mode === "rate" ? 1e5 / population / yearSpan : 1;
      const parts = values.map((v) => v * scale);
      rows.push({ fips, name, parts, total: parts[0] + parts[1] + parts[2] });
    }
    rows.sort((a, b) => b.total - a.total);
    const shown = rows.slice(0, PANELS.rankingCount);
    const x = d3.scaleLinear().domain([0, d3.max(shown, (r) => r.total) || 1]).range([0, width - labelWidth - valueWidth]);

    const row = svg.selectAll("g.rank-row").data(shown, (r) => r.fips).join((enter) => {
      const g = enter.append("g").attr("class", "rank-row");
      g.append("rect").attr("class", "rank-row__hit").attr("width", width).attr("height", rowHeight);
      g.append("text").attr("class", "rank-row__label").attr("x", labelWidth - 6).attr("y", rowHeight / 2).attr("dy", "0.35em").attr("text-anchor", "end");
      g.append("g").attr("class", "rank-row__bars").attr("transform", `translate(${labelWidth},4)`);
      g.append("text").attr("class", "rank-row__value").attr("y", rowHeight / 2).attr("dy", "0.35em");
      return g;
    });
    row.attr("transform", (_, i) => `translate(0,${i * rowHeight})`)
      .classed("is-selected", (r) => r.fips === selectedFips)
      .on("click", (_, r) => onSelectState(r.fips));
    row.select(".rank-row__label").text((r) => r.name);
    row.select(".rank-row__bars").selectAll("rect").data((r) => {
      let start = 0;
      return r.parts.map((value, peril) => { const seg = { peril, start, value }; start += value; return seg; });
    }).join("rect")
      .attr("x", (s) => x(s.start)).attr("width", (s) => Math.max(0, x(s.value)))
      .attr("height", rowHeight - 8).attr("fill", (s) => PERILS[s.peril].color);
    row.select(".rank-row__value").attr("x", (r) => labelWidth + x(r.total) + 5)
      .text((r) => (mode === "rate" ? r.total.toFixed(r.total < 10 ? 1 : 0) : formatMetric(metric, r.total)));
  }

  /** Called on every filter/selection change. */
  function update(stateValues, state) {
    last = {
      stateValues, metric: state.metric,
      yearSpan: state.yearTo - state.yearFrom + 1,
      selectedFips: state.selection.type === "state" ? state.selection.fips : null,
    };
    render();
  }
  return { update };
}
