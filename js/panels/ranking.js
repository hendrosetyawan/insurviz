/**
 * ranking.js  ·  R1 Geographic comparison
 * ---------------------------------------------------------------------------
 * Counties ranked by the prism-height metric (riskiest first), with each bar
 * coloured by the prism-colour metric, so the ranking mirrors the 3D map.
 * A search box finds any of the 254 counties. Click a row to select it.
 */

import { METRICS, PANELS } from "../config.js";
import { formatMetric } from "../format.js";

export function createRanking(container, { countyList, onSelectCounty }) {
  const root = d3.select(container);
  const search = root.append("input").attr("class", "search").attr("type", "search")
    .attr("placeholder", "Find a county…").attr("list", "county-names");
  root.append("datalist").attr("id", "county-names").selectAll("option").data(countyList.map((c) => c.name).sort()).join("option").attr("value", (d) => d);
  search.on("change", () => {
    const match = countyList.find((c) => c.name.toLowerCase() === search.property("value").trim().toLowerCase());
    if (match) { onSelectCounty(match.fips); search.property("value", ""); }
  });

  const width = 300, rowHeight = 20, labelWidth = 92, valueWidth = 48;
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${PANELS.rankingCount * rowHeight}`).attr("class", "ranking");

  function update({ values, metric, colorOf, selectedSet }) {
    const spec = METRICS[metric];
    const rows = countyList.map((c, i) => ({ fips: c.fips, name: c.name, index: i, value: values[i][metric] }))
      .filter((r) => r.value != null && Number.isFinite(r.value))
      .sort((a, b) => (spec.risk === "low" ? a.value - b.value : b.value - a.value))
      .slice(0, PANELS.rankingCount);
    const extent = d3.extent(rows, (r) => r.value);
    const x = d3.scaleLinear().domain(spec.risk === "low" ? [extent[1] * 1.05, extent[0] * 0.95] : [0, extent[1] || 1])
      .range([4, width - labelWidth - valueWidth]);

    const row = svg.selectAll("g.rank-row").data(rows, (r) => r.fips).join((enter) => {
      const g = enter.append("g").attr("class", "rank-row");
      g.append("rect").attr("class", "rank-row__hit").attr("width", width).attr("height", rowHeight);
      g.append("text").attr("class", "rank-row__label").attr("x", labelWidth - 6).attr("y", rowHeight / 2).attr("dy", "0.35em").attr("text-anchor", "end");
      g.append("rect").attr("class", "rank-row__bar").attr("x", labelWidth).attr("y", 4).attr("height", rowHeight - 8).attr("rx", 2);
      g.append("text").attr("class", "rank-row__value").attr("y", rowHeight / 2).attr("dy", "0.35em");
      return g;
    });
    row.attr("transform", (_, i) => `translate(0,${i * rowHeight})`)
      .classed("is-selected", (r) => selectedSet && selectedSet.has(r.fips))
      .on("click", (_, r) => onSelectCounty(r.fips));
    row.select(".rank-row__label").text((r) => r.name);
    row.select(".rank-row__bar").attr("fill", (r) => colorOf(r.index)).transition().duration(400).attr("width", (r) => Math.max(2, x(r.value)));
    row.select(".rank-row__value").attr("x", (r) => labelWidth + x(r.value) + 5).text((r) => formatMetric(metric, r.value));
  }
  return { update };
}
