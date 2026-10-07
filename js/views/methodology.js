/**
 * methodology.js  ·  Data and methods panel
 * ---------------------------------------------------------------------------
 * Sources (with years, granularity and update dates), metric definitions with
 * numerator/denominator compatibility, the baseline model, data-quality notes
 * and interpretation caveats. Built from config + meta so it stays in sync.
 */

import { GROUPS, METRICS } from "../config.js";

export function renderMethodology(container, meta) {
  const q = meta.quality;
  const noaaVersions = q.noaaFiles.length ? "NCEI details files (Texas rows), versions as downloaded" : "";
  const sources = [
    ["NOAA NCEI Storm Events Database", "Hail, thunderstorm wind, tornado reports (event level)", "2019–2025", "County (CZ type C); event lat/lon", "Details files c2026-03-23 to c2026-08-19", "Reported events and NWS-estimated property/crop damage. Damage is an estimate, not insured loss; " + `${(q.noaaDamageBlankShare * 100).toFixed(1)}% of events have a blank damage value (treated as unknown).`],
    ["Texas Department of Insurance — Texas homeowners losses by county", "Paid losses by loss type (Wind, Water, Fire, Other, Total); policies in force at year end", "2019–2025", "County × calendar year", "Page last updated 6/22/2026", "Homeowners policies only: excludes renters, condo and dwelling policies, and wind/hail losses covered by TWIA. Source: Texas Statistical Plan for Residential Risks. TDI's “Wind” loss type equals statewide Wind + Hail (verified for 2019: $3,949M), so it is labelled “Wind & hail”."],
    ["Texas Department of Insurance — Homeowners market overview (premiums)", "Average premium (with wind), coverage, companies", "2019–2025", "County × year", "n/a", meta.premiumAvailable ? "Integrated from the county export." : "<b>Not integrated.</b> The county export is only available through an interactive Tableau view behind a bot check; premium metrics are shown as unavailable rather than estimated. Place the export at raw/tdi_ho_premium_by_county.csv and rebuild to add them."],
    ["U.S. Census Bureau — ACS 5-year estimates", "Population, households, housing units, occupied and owner-occupied units, median home value, median household income", "Vintages 2017–2021 to 2020–2024", "County", "Table-based summary files", "Used for exposure normalisation. Year mapping: " + Object.entries(meta.acsVintage).map(([y, v]) => `${y}→${v - 4}–${v}`).join(", ") + ". Table-based files start with the 2021 vintage; 2025 uses the latest (2020–2024)."],
  ];
  const metricRows = Object.entries(METRICS).map(([k, m]) => `<tr><td><i class="gdot" style="background:${GROUPS[m.group].color}"></i>${m.label}</td><td>${m.unit}</td><td>${m.kind}</td><td>${m.compat ? `<span class="compat compat-${m.compat}">${m.compat}</span>` : "—"}</td><td>${m.def}</td></tr>`).join("");

  container.innerHTML = `
    <h2>Data and methods</h2>
    <p><b>Analytical unit:</b> county FIPS × year, 2019–2025 (the full TDI period; NOAA and ACS cover it). Period metrics average the selected years; rates divide period sums (e.g. Σ paid losses ÷ Σ policies). <b>0 = measured zero; n/a = unavailable</b> (never shown as 0).</p>
    <h3>Sources</h3>
    <table class="meth"><tr><th>Dataset</th><th>Content</th><th>Years</th><th>Granularity</th><th>Version / update</th><th>Notes and exclusions</th></tr>
      ${sources.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>
    <h3>Metrics</h3>
    <p>Compatibility of numerator and denominator: <span class="compat compat-compatible">compatible</span> same population and period · <span class="compat compat-approximate">approximate</span> close but not identical populations · <span class="compat compat-mixed">mixed</span> different populations, read as a crude ratio · <span class="compat compat-estimated">estimated</span> denominator is our estimate. A loss ratio is <b>not</b> computed: no compatible county premium (earned premium) is available.</p>
    <table class="meth"><tr><th>Metric</th><th>Unit</th><th>Kind</th><th>Compatibility</th><th>Definition</th></tr>${metricRows}</table>
    <h3>Exploratory baseline and anomalies</h3>
    <p>log(loss per policy) is regressed on log(1 + storm events per 1,000 km² per year), log(1 + NOAA damage per owner-occupied home per year) and log(median home value), by ordinary least squares, on counties with at least 500 average policies outside the TWIA area (where TDI excludes TWIA wind/hail). Residual ratio = observed ÷ expected; z = log residual ÷ its standard deviation. Counties with |z| ≥ 1.5 are flagged. This is a descriptive baseline for finding unusual counties, not a causal or predictive model, and it omits many drivers (construction, roof age, deductibles, policy forms, claim practices, market composition).</p>
    <h3>Data quality</h3>
    <ul>
      <li>TDI county-years missing: ${q.tdiMissingCountyYears.map((d) => d.join(" ")).join(", ") || "none"} (shown as n/a).</li>
      <li>TDI net negative paid losses kept as reported: ${q.tdiNegativePaidLosses.length} county-year-loss-type cells (e.g. recoveries exceeding payments).</li>
      <li>NOAA events integrated: ${q.noaaEvents.toLocaleString()} (hail, thunderstorm wind, tornado; county-based records). Tornado tracks crossing counties are counted once per county segment. ${noaaVersions}.</li>
      <li>County area for storm density comes from the boundary geometry (us-atlas, includes water).</li>
    </ul>
    <h3>Interpretation</h3>
    <ul>
      <li>NOAA estimated property damage is not insured loss, and covers all property (not only insured homes).</li>
      <li>Correlation does not imply causation; patterns are described as associations.</li>
      <li>Premium and loss variation reflect many factors beyond recent local storm activity.</li>
      <li>The datasets use different reporting procedures and temporal definitions (event date vs. paid-loss calendar year; year-end policy counts; 5-year ACS periods).</li>
      <li>Missing values are never interpreted as zero.</li>
    </ul>`;
}
