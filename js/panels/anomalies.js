/**
 * anomalies.js  ·  Detect anomalies
 * ---------------------------------------------------------------------------
 * Counties ranked by how far TDI paid loss per policy departs from the
 * exploratory baseline (z of the log residual), above or below expectation,
 * with their discordance types and the model summary.
 */

import { ANOMALY_Z, PANELS } from "../config.js";
import { formatMoney, formatTimes } from "../format.js";
import { BASELINE_FEATURES } from "../losses.js";

export function createAnomalies(container, { countyList, onSelectCounty }) {
  const root = d3.select(container);
  const toggle = root.append("div").attr("class", "segmented");
  let side = "above";
  toggle.selectAll("button").data([["above", "Above expected"], ["below", "Below expected"]]).join("button").text((d) => d[1])
    .on("click", (_, d) => { side = d[0]; if (last) update(...last); });
  const list = root.append("ol").attr("class", "anomaly-list");
  const note = root.append("div").attr("class", "panel__sub anomaly-note");
  let last = null;

  function update(values, baseline, selectedFips) {
    last = [values, baseline, selectedFips];
    toggle.selectAll("button").classed("is-active", (d) => d[0] === side);
    if (!baseline) { list.html(""); note.text("Baseline unavailable: TDI loss data covers 2019–2025; include those years in the filter."); return; }
    const rows = countyList.map((c, i) => ({ c, v: values[i] })).filter((d) => d.v.baselineInFit && d.v.baselineZ != null)
      .sort((a, b) => (side === "above" ? b.v.baselineZ - a.v.baselineZ : a.v.baselineZ - b.v.baselineZ)).slice(0, PANELS.anomalyRows);
    list.selectAll("li").data(rows, (d) => d.c.fips).join("li")
      .classed("is-selected", (d) => d.c.fips === selectedFips).classed("is-strong", (d) => Math.abs(d.v.baselineZ) >= ANOMALY_Z)
      .html((d) => `<span class="a-name">${d.c.name}</span><span class="a-ratio ${d.v.baselineZ > 0 ? "up" : "down"}">${formatTimes(d.v.baselineRatio)}</span>
        <span class="a-detail">${formatMoney(d.v.lossPerPolicy)} observed vs ${formatMoney(d.v.baselineExpected)} expected per policy · z ${d.v.baselineZ.toFixed(1)}</span>
        ${d.v.types.filter((t) => !t.includes("baseline")).map((t) => `<span class="type-tag">${t}</span>`).join("")}`)
      .on("click", (_, d) => onSelectCounty(d.c.fips));
    note.html(`Exploratory baseline, not causal: log(loss per policy) on ${BASELINE_FEATURES.map((f) => f.label).join(", ")} (log terms); ${baseline.n} counties with ≥ 500 policies outside the TWIA area; R² = ${baseline.r2.toFixed(2)}. Bold = |z| ≥ ${ANOMALY_Z}.`);
  }
  return { update };
}
