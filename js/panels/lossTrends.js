/**
 * lossTrends.js  ·  Insured-loss trends, 2019–2025
 * ---------------------------------------------------------------------------
 * Small multiples (one measure per panel, its own axis, no dual axes):
 * storm reports, NOAA damage, TDI paid losses and loss per policy for the
 * selected county (or the Texas total / median when nothing is selected),
 * with the Texas county median as a dashed reference line.
 */

import { LOSS_YEARS } from "../config.js";
import { formatMoney } from "../format.js";

const safe = (f) => (v) => (v == null || !Number.isFinite(v) ? "n/a" : f(v));
const PANELS = [
  { key: "storm_count", label: "Storm reports", fmt: safe(d3.format(",.0f")) },
  { key: "noaa_property_damage", label: "NOAA damage (estimate)", fmt: safe(formatMoney) },
  { key: "tdi_paid_loss", label: "TDI paid losses", fmt: safe(formatMoney) },
  { key: "loss_per_policy", label: "TDI loss per policy", fmt: safe(formatMoney) },
];

export function createLossTrends(container, { countyList }) {
  const root = d3.select(container);
  const grid = root.append("div").attr("class", "loss-multiples");
  const w = 190, h = 112, m = { top: 16, right: 6, bottom: 16, left: 40 };
  const iw = w - m.left - m.right, ih = h - m.top - m.bottom;
  const x = d3.scalePoint().domain(LOSS_YEARS).range([0, iw]).padding(0.3);
  const charts = PANELS.map((p) => {
    const svg = grid.append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("class", "loss-multiple");
    svg.append("text").attr("class", "lm-title").attr("x", 4).attr("y", 11).text(p.label);
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
    return { p, gx: g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`), gy: g.append("g").attr("class", "axis"), lines: g.append("g") };
  });
  const note = root.append("div").attr("class", "panel__sub");

  // Texas county median per year (reference line)
  const median = Object.fromEntries(PANELS.map((p) => [p.key, LOSS_YEARS.map((yr) => d3.median(countyList, (c) => c.lossRows.find((r) => r.year === yr)?.[p.key] ?? undefined))]));

  function update(county) {
    charts.forEach(({ p, gx, gy, lines }) => {
      const own = county ? LOSS_YEARS.map((yr) => county.lossRows.find((r) => r.year === yr)?.[p.key] ?? null) : null;
      const ref = median[p.key];
      const all = [...(own || []), ...ref].filter((v) => v != null);
      const y = d3.scaleLinear().domain([Math.min(0, d3.min(all) ?? 0), d3.max(all) || 1]).nice().range([ih, 0]);
      gx.call(d3.axisBottom(x).tickFormat((d) => `'${String(d).slice(2)}`).tickSize(0));
      gy.call(d3.axisLeft(y).ticks(3).tickFormat(p.fmt).tickSize(-iw));
      const line = d3.line().defined((d) => d != null).x((_, k) => x(LOSS_YEARS[k])).y((d) => y(d));
      const series = [{ values: ref, cls: "lm-ref" }, ...(own ? [{ values: own, cls: "lm-own" }] : [])];
      lines.selectAll("path").data(series).join("path").attr("class", (s) => s.cls).attr("d", (s) => line(s.values));
      lines.selectAll("circle").data(own ? own.map((v, k) => ({ v, k })).filter((d) => d.v != null) : []).join("circle")
        .attr("class", "lm-dot").attr("r", 2).attr("cx", (d) => x(LOSS_YEARS[d.k])).attr("cy", (d) => y(d.v))
        .selectAll("title").data((d) => [d]).join("title").text((d) => `${LOSS_YEARS[d.k]}: ${p.fmt(d.v)}`);
    });
    note.html(county ? `<b>${county.name} County</b> (solid) vs Texas county median (dashed), 2019–2025. Separate axes per measure; NOAA damage is not insured loss.`
      : "Texas county median per year. Select a county to compare its trend.");
  }
  return { update };
}
