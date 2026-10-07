/**
 * anomalies.js  ·  Detect anomalies (RQ4)
 * ---------------------------------------------------------------------------
 * Counties ranked by how far observed loss per policy departs from the
 * exploratory baseline (z of the log residual), above or below expectation,
 * with their discordance types. A type filter narrows the list. The model
 * summary (n, R², coefficients) is shown so the baseline can be judged.
 */

import { ANOMALY_Z } from "../config.js";
import { money, times } from "../format.js";
import { BASELINE_FEATURES } from "../model.js";

const TYPES = ["Any", "High storm · low loss", "Low storm · high loss", "High absolute · ordinary per policy",
  "Moderate NOAA damage · high paid loss", "High exposure · low normalised loss", "Low exposure · high normalised loss"];

export function createAnomalies(container, data, { onFocus, onTogglePin, onSide }) {
  const root = d3.select(container);
  const controls = root.append("div").attr("class", "view-controls");
  const side = controls.append("div").attr("class", "segmented");
  side.selectAll("button").data([["above", "Above expected"], ["below", "Below expected"]]).join("button").text((d) => d[1])
    .on("click", (_, d) => onSide(d[0]));
  const typeSel = controls.append("label").text("Type ").append("select");
  typeSel.selectAll("option").data(TYPES).join("option").text((d) => d);
  typeSel.on("change", () => last && update(...last));
  const list = root.append("ol").attr("class", "anomaly-list");
  const model = root.append("div").attr("class", "view-note");
  let last = null;

  function update(state, analysis) {
    last = [state, analysis];
    side.selectAll("button").classed("is-active", (d) => d[0] === state.anomalySide);
    const type = typeSel.property("value");
    const rows = data.counties.map((c, i) => ({ c, m: analysis.metrics[i] }))
      .filter((d) => d.m.baseline && d.m.baseline.inFit && (type === "Any" ? true : d.m.types.includes(type)))
      .sort((a, b) => (state.anomalySide === "above" ? b.m.z - a.m.z : a.m.z - b.m.z)).slice(0, 14);
    list.selectAll("li").data(rows, (d) => d.c.fips).join("li")
      .attr("class", (d) => `${d.c.fips === state.focus ? "is-focus" : ""} ${Math.abs(d.m.z) >= ANOMALY_Z ? "is-strong" : ""}`)
      .html((d) => `<span class="a-name">${d.c.name}</span><span class="a-ratio ${d.m.z > 0 ? "up" : "down"}">${times(d.m.baseline.ratio)}</span>
        <span class="a-detail">${money(d.m.loss_per_policy)} observed vs ${money(d.m.baseline.expected)} expected per policy · z ${d.m.z.toFixed(1)}</span>
        <span class="a-types">${d.m.types.filter((t) => !t.includes("baseline")).map((t) => `<span class="tag">${t}</span>`).join("")}</span>`)
      .on("click", (event, d) => (event.shiftKey ? onTogglePin(d.c.fips) : onFocus(d.c.fips)));
    const b = analysis.baseline;
    model.html(`<b>Exploratory baseline</b> (not causal): log(loss per policy) = ${b.beta[0].toFixed(2)} ${BASELINE_FEATURES.map((f, j) => `${b.beta[j + 1] >= 0 ? "+" : "−"} ${Math.abs(b.beta[j + 1]).toFixed(2)}·${f.label}`).join(" ")} (log terms). Fitted on ${b.n} counties with ≥ 500 policies outside the TWIA area; R² = ${b.r2.toFixed(2)}. Anomaly = |z| ≥ ${ANOMALY_Z}. Types use Texas percentile thresholds (high ≥ 67th/80th, low ≤ 33rd).`);
    if (!rows.length) list.html('<li class="empty">No county matches this type for the current filters.</li>');
  }
  return { update };
}
