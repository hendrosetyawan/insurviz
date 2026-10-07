/**
 * compare.js  ·  Comparison mode (2–4 counties)
 * ---------------------------------------------------------------------------
 * One row per metric, grouped as hazard / exposure / insurance, with raw
 * totals and normalised rates side by side. Each cell shows the value and a
 * percentile bar against all Texas counties (tick = Texas median), so
 * counties are compared both to each other and to the state distribution.
 * Peril composition bars and damage concentration close the table.
 */

import { COMPARE_COLORS, GROUPS, METRICS, PERILS } from "../config.js";
import { concentration } from "../model.js";
import { metric, ordinal, pct } from "../format.js";

const ROWS = [
  ["storm_count", "storm_density", "noaa_property_damage", "damage_per_event"],
  ["estimated_property_exposure", "owner_occupied_units", "median_home_value"],
  ["tdi_paid_loss", "loss_per_policy", "insured_loss_per_owner_unit", "insured_loss_per_1k_exposure", "premium_per_policy", "residual"],
];

export function createCompare(container, data, { onRemove }) {
  const root = d3.select(container);

  function update(state, analysis) {
    if (state.pinned.length < 2) {
      root.html(`<p class="placeholder">Shift-click counties on the map, scatterplot or anomaly list (or use “+ Compare” in the profile) to compare 2–4 counties. ${state.pinned.length ? `Selected: <b>${data.countyByFips.get(state.pinned[0]).name}</b>.` : ""}</p>`);
      return;
    }
    const cols = state.pinned.map((f, k) => {
      const i = data.counties.findIndex((c) => c.fips === f);
      return { f, k, c: data.counties[i], m: analysis.metrics[i], conc: concentration(data, f, state) };
    });
    const cell = (key, col) => {
      const p = col.m.pct[key];
      return `<td><div class="cv">${metric(key, col.m[key])}</div><div class="cbar"><span class="cmid"></span>${p == null ? "" : `<span class="cfill" style="width:${p}%;background:${COMPARE_COLORS[col.k]}"></span>`}</div><div class="cp">${ordinal(p)}</div></td>`;
    };
    const perilBar = (col) => {
      const total = d3.sum(PERILS, (p, j) => (state.perils[j] ? col.m.countsByPeril[p.key] : 0));
      return total ? `<div class="stack small">${PERILS.map((p, j) => (state.perils[j] && col.m.countsByPeril[p.key] ? `<span style="width:${(col.m.countsByPeril[p.key] / total) * 100}%;background:${p.color}"></span>` : "")).join("")}</div>` : "n/a";
    };
    root.html(`<table class="compare-table"><thead><tr><th></th>${cols.map((col) => `<th style="border-top:3px solid ${COMPARE_COLORS[col.k]}">${col.c.name}<button class="rm" data-f="${col.f}" title="Remove">×</button>${col.c.twia ? '<div class="tag tag-warn">TWIA</div>' : ""}</th>`).join("")}</tr></thead><tbody>
      ${ROWS.map((group) => {
        const g = METRICS[group[0]].group;
        return `<tr class="grp"><td colspan="${cols.length + 1}"><i style="background:${GROUPS[g].color}"></i>${GROUPS[g].label} <em>${GROUPS[g].source}</em></td></tr>` +
          group.map((key) => `<tr><td class="rl">${METRICS[key].label}<span class="kind">${METRICS[key].kind === "rate" ? "rate" : "total"}</span></td>${cols.map((col) => cell(key, col)).join("")}</tr>`).join("");
      }).join("")}
      <tr class="grp"><td colspan="${cols.length + 1}">Composition and concentration</td></tr>
      <tr><td class="rl">Events by peril</td>${cols.map((col) => `<td>${perilBar(col)}</td>`).join("")}</tr>
      <tr><td class="rl">Top-3 events' share of NOAA damage</td>${cols.map((col) => `<td><div class="cv">${pct(col.conc.top3)}</div></td>`).join("")}</tr>
      </tbody></table><div class="view-note">Bars = Texas percentile (tick = median). Trends for these counties are overlaid in the temporal view.</div>`);
    root.selectAll("button.rm").on("click", function () { onRemove(+this.dataset.f); });
  }
  return { update };
}
