/**
 * composition.js  ·  R2 Peril composition
 * ---------------------------------------------------------------------------
 * Which perils matter most in the selected region: two 100% stacked bars
 * (share of events and share of NOAA-reported damage) plus the raw numbers.
 * Comparing the two bars shows when a rare peril carries most of the damage.
 */

import { PERILS } from "../config.js";
import { formatCount, formatMoney, formatPercent } from "../format.js";

export function createComposition(container) {
  const root = d3.select(container);
  const width = 300, barHeight = 16;
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} 92`).attr("class", "composition");
  const rows = [
    { key: "byPeril", label: "Share of storm reports", y: 14 },
    { key: "damageByPeril", label: "Share of NOAA damage", y: 58 },
  ];
  const rowGroups = svg.selectAll("g.comp-row").data(rows).join("g").attr("class", "comp-row")
    .attr("transform", (r) => `translate(0,${r.y})`);
  rowGroups.append("text").attr("class", "comp-row__label").attr("y", -4).text((r) => r.label);

  const legend = root.append("div").attr("class", "comp-legend");

  function update(selected) {
    rowGroups.each(function (row) {
      const values = selected[row.key];
      const total = values[0] + values[1] + values[2];
      let start = 0;
      const segments = values.map((value, peril) => {
        const share = total ? value / total : 0;
        const seg = { peril, start, share };
        start += share;
        return seg;
      });
      const group = d3.select(this);
      group.selectAll("rect").data(segments).join("rect")
        .attr("height", barHeight).attr("fill", (s) => PERILS[s.peril].color)
        .transition().duration(400)
        .attr("x", (s) => s.start * width).attr("width", (s) => Math.max(0, s.share * width));
      group.selectAll("text.comp-share").data(segments.filter((s) => s.share >= 0.09)).join("text")
        .attr("class", "comp-share").attr("y", barHeight / 2).attr("dy", "0.35em").attr("text-anchor", "middle")
        .attr("x", (s) => (s.start + s.share / 2) * width).text((s) => formatPercent(s.share));
    });

    legend.selectAll("div").data(PERILS).join("div").attr("class", "comp-legend__item")
      .html((peril, i) => `<span class="swatch" style="background:${peril.color}"></span>${peril.label}
        <b>${formatCount(selected.byPeril[i])}</b> reports · <b>${formatMoney(selected.damageByPeril[i])}</b>`);
  }
  return { update };
}
