/**
 * methodology.js  ·  Data & methods dialog
 * ---------------------------------------------------------------------------
 * Sources (years, granularity, version), every metric's definition grouped
 * by lens, the baseline model, data quality and interpretation caveats.
 */

import { LENSES, METRICS } from "../config.js";

export function renderMethodology(container, lossMeta) {
  const q = lossMeta.quality;
  const sources = [
    ["NOAA NCEI Storm Events", "Hail, thunderstorm wind, tornado reports: counts, magnitude, property damage, narratives", "2015–2025 (losses analysis: 2019–2025)", "Event → county", "NCEI details files (2019–2025 versions c2026-03 to c2026-08)", `Property damage is an NWS estimate, not insured loss; ${(q.noaaDamageBlankShare * 100).toFixed(1)}% of 2019–2025 events have no damage value (unknown, not $0).`],
    ["TDI · Texas homeowners losses by county", "Paid losses by loss type (Wind, Water, Fire, Other, Total), policies in force at year end", "2019–2025", "County × calendar year", "Page updated 6/22/2026", "Homeowners policies only: excludes renters, condo, dwelling policies and TWIA wind/hail. Source: Texas Statistical Plan for Residential Risks. TDI “Wind” = wind + hail (matches statewide Wind + Hail)."],
    ["TDI · Residential policies in force by county", "Homeowners, dwelling, tenant, farm & ranch policies", "2026 Q1", "County", "data.texas.gov 8mvr-4gj9", "Used for the coverage-ratio proxy."],
    ["TDI · HB 2067 actions and reasons", "Declinations, cancellations, nonrenewals and stated reasons", "Apr–Jun 2026", "ZIP → county", "data.texas.gov m7yx-zxf2, 3efz-d6qn, vyxq-akit", "Three months of a new data series; ZIP → county by largest land overlap."],
    ["TDI · Homeowners market overview (premiums)", "Average premium per policy", "2019–2025", "County × year", "—", "Not integrated: the county export is only available through an interactive Tableau view behind a bot check. Premium and loss ratio are therefore not shown."],
    ["U.S. Census Bureau · ACS 5-year", "Housing units, owner-occupied units, median home value, income", "Vintages 2017–2021 to 2020–2024", "County", "Table-based summary files", "Exposure normalisation; year → vintage mapping recorded per county-year."],
  ];
  const lensBlocks = Object.entries(LENSES).map(([lens, l]) => `<h4><span class="lens-tag" style="--lens:${l.color}">${l.label}</span> ${l.source}</h4><ul>${Object.values(METRICS).filter((m) => m.lens === lens).map((m) => `<li><b>${m.label}</b>${m.note ? ` · ${m.note}` : ""}</li>`).join("")}</ul>`).join("");

  container.innerHTML = `
    <h2>Data &amp; methods</h2>
    <p>InsurViz is an interactive visual analytics system for exploring the relationship between severe weather, property exposure, and homeowners insurance losses across Texas counties. Workflow: Overview → Compare → Detect anomalies → Explain → Drill down. <b>0 = measured zero; n/a or — = unavailable</b>.</p>
    <table class="meth"><tr><th>Dataset</th><th>Content</th><th>Years</th><th>Granularity</th><th>Version</th><th>Notes / exclusions</th></tr>${sources.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>
    <h3>Metrics by lens</h3>${lensBlocks}
    <h3>Exploratory baseline</h3>
    <p>log(TDI loss per policy) is regressed by OLS on log(1 + storm reports per 1,000 km² per year), log(1 + NOAA damage per owner-occupied home per year) and log(median home value), using counties with ≥ 500 average policies outside the TWIA area. Ratio = observed ÷ expected; z = log residual ÷ SD; |z| ≥ 1.5 is flagged. It is a descriptive reference for finding unusual counties, not a causal or predictive model; it omits construction, roof age, deductibles, policy forms, claim practices and market mix. Discordance types use Texas percentiles (high ≥ 67th/80th, low ≤ 33rd).</p>
    <h3>Data quality</h3>
    <ul><li>TDI county-years missing: ${q.tdiMissingCountyYears.map((d) => d.join(" ")).join(", ") || "none"}.</li>
      <li>${q.tdiNegativePaidLosses.length} TDI cells report net negative paid losses (kept as reported).</li>
      <li>Statewide TDI paid losses reconcile with TDI's published totals (e.g. 2025 ≈ $8.75B).</li></ul>
    <h3>Interpretation</h3>
    <ul><li>NOAA estimated property damage is not insured loss.</li><li>Correlation does not imply causation; relationships are described as associations.</li>
      <li>Losses and premiums reflect many factors beyond recent local storms.</li><li>Datasets differ in reporting procedures and time definitions.</li><li>Missing values are never treated as zero.</li></ul>`;
}
