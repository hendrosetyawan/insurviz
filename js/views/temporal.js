/**
 * temporal.js  ·  View 3: annual trends (RQ5 "when")
 * ---------------------------------------------------------------------------
 * Small multiples, one measure per panel with its own y axis, so measures in
 * different units are never forced onto a dual axis. Lines: focus county
 * (black), comparison counties (their colours), Texas county median (dashed).
 * Years outside the filter are shaded; click a year to drill down into it.
 */

import { COMPARE_COLORS, YEARS } from "../config.js";
import { money } from "../format.js";

const safe = (f) => (v) => (v == null || !Number.isFinite(v) ? "n/a" : f(v));
const PANELS = [
  { key: "storm_count", label: "Storm events", fmt: safe(d3.format(",.0f")), texas: "medianStorm" },
  { key: "noaa_property_damage", label: "NOAA property damage", fmt: money, texas: "medianDamage", note: "estimate, not insured loss" },
  { key: "tdi_paid_loss", label: "TDI paid homeowners losses", fmt: money, texas: "medianPaid" },
  { key: "loss_per_policy", label: "TDI loss per policy", fmt: money, texas: "medianLossPerPolicy" },
  { key: "premium_per_policy", label: "Premium per policy", fmt: money, unavailable: true },
];

export function createTemporal(container, data, { onYear }) {
  const root = d3.select(container);
  const grid = root.append("div").attr("class", "multiples");
  const w = 230, h = 132, m = { top: 18, right: 8, bottom: 20, left: 46 };
  const iw = w - m.left - m.right, ih = h - m.top - m.bottom;
  const x = d3.scalePoint().domain(YEARS).range([0, iw]).padding(0.3);

  const panels = PANELS.map((p) => {
    const svg = grid.append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("class", "multiple");
    svg.append("text").attr("class", "multiple-title").attr("x", 4).attr("y", 12).text(p.label + (p.note ? ` (${p.note})` : ""));
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
    return { p, svg, g, shade: g.append("g"), gx: g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`),
      gy: g.append("g").attr("class", "axis"), lines: g.append("g"), hit: g.append("g") };
  });
  const legend = root.append("div").attr("class", "view-note");

  function update(state, analysis) {
    const series = [
      ...(state.focus ? [{ fips: state.focus, color: "#000", width: 2.2 }] : []),
      ...state.pinned.filter((f) => f !== state.focus).map((f) => ({ fips: f, color: COMPARE_COLORS[state.pinned.indexOf(f)], width: 1.6 })),
    ];
    const rowsFor = (fips) => data.countyByFips.get(fips).rows;

    panels.forEach(({ p, svg, g, shade, gx, gy, lines, hit }) => {
      g.selectAll(".unavailable").remove();
      if (p.unavailable) {
        lines.selectAll("*").remove(); gy.selectAll("*").remove(); gx.call(d3.axisBottom(x).tickFormat((d) => `'${String(d).slice(2)}`));
        g.append("text").attr("class", "unavailable").attr("x", iw / 2).attr("y", ih / 2).attr("text-anchor", "middle").text("n/a: TDI county premium data not integrated");
        return;
      }
      const lineData = series.map((s) => ({ ...s, values: YEARS.map((yr) => ({ year: yr, v: rowsFor(s.fips).find((r) => r.year === yr)?.[p.key] ?? null })) }));
      const texas = { color: "#888", width: 1.2, dash: "4 3", values: analysis.texasByYear.map((t) => ({ year: t.year, v: t[p.texas] ?? null })) };
      const all = [...lineData, texas].flatMap((s) => s.values.map((d) => d.v)).filter((v) => v != null);
      const y = d3.scaleLinear().domain([Math.min(0, d3.min(all) ?? 0), d3.max(all) || 1]).nice().range([ih, 0]);
      gx.call(d3.axisBottom(x).tickFormat((d) => `'${String(d).slice(2)}`).tickSizeOuter(0));
      gy.call(d3.axisLeft(y).ticks(3).tickFormat(p.fmt).tickSize(-iw));
      shade.selectAll("rect").data(YEARS.filter((yr) => yr < state.yearFrom || yr > state.yearTo)).join("rect")
        .attr("class", "out-of-range").attr("x", (yr) => x(yr) - x.step() / 2).attr("width", x.step()).attr("y", 0).attr("height", ih);
      const line = d3.line().defined((d) => d.v != null).x((d) => x(d.year)).y((d) => y(d.v));
      lines.selectAll("path").data([texas, ...lineData]).join("path").attr("fill", "none")
        .attr("stroke", (s) => s.color).attr("stroke-width", (s) => s.width).attr("stroke-dasharray", (s) => s.dash || null)
        .attr("d", (s) => line(s.values));
      lines.selectAll("circle").data(lineData.flatMap((s) => s.values.filter((d) => d.v != null).map((d) => ({ ...d, color: s.color })))).join("circle")
        .attr("cx", (d) => x(d.year)).attr("cy", (d) => y(d.v)).attr("r", 2.2).attr("fill", (d) => d.color);
      // drill-year marker + click targets
      hit.selectAll("rect").data(YEARS).join("rect").attr("class", (yr) => `year-hit${state.drillYear === yr ? " is-drill" : ""}`)
        .attr("x", (yr) => x(yr) - x.step() / 2).attr("width", x.step()).attr("y", 0).attr("height", ih)
        .on("click", (_, yr) => onYear(state.drillYear === yr ? null : yr))
        .selectAll("title").data((yr) => [yr]).join("title").text((yr) => {
          const vals = lineData.map((s) => `${data.countyByFips.get(s.fips).name}: ${p.fmt(s.values.find((d) => d.year === yr).v)}`);
          return `${yr}\n${vals.join("\n")}\nTexas median: ${p.fmt(texas.values.find((d) => d.year === yr).v)}\nClick to drill into ${yr}`;
        });
    });
    legend.html(series.length
      ? `${series.map((s) => `<span class="key"><i style="background:${s.color}"></i>${data.countyByFips.get(s.fips).name}</span>`).join("")}<span class="key"><i class="dash"></i>Texas county median</span> · click a year to drill down${state.drillYear ? ` (showing ${state.drillYear})` : ""}`
      : "Select a county on the map, scatterplot or anomaly list to see its trends against the Texas median.");
  }
  return { update };
}
