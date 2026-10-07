/**
 * profile.js  ·  the three-lens profile
 * ---------------------------------------------------------------------------
 * For the selected county (or the whole selection), one row per key metric,
 * grouped by lens: Hazard (NOAA) · Exposure (ACS) · Insurance market (TDI)
 * · Insured losses (TDI paid homeowners losses).
 * Each row shows the value and a percentile bar among Texas's 254 counties,
 * oriented so a longer bar always means more risk or stress. Seeing the three
 * lenses side by side is the point: no single composite score.
 */

import { LENSES, METRICS } from "../config.js";
import { formatMetric } from "../format.js";
import { riskPercentile } from "../metrics.js";

const ROWS = {
  hazard: ["significantPerYear", "reportsPer1kHomes", "noaaDamage"],
  exposure: ["ownerValue", "medianHomeValue", "coverageToValue", "medianYearBuilt"],
  market: ["premiumPerPolicy", "premiumChange", "premiumPer1kCoverage", "coverageRatio", "nonrenewalRate", "windHailShare"],
  losses: ["paidLoss", "lossPerPolicy", "lossPer1kValue", "windHailLossShare", "mismatch", "baselineRatio"],
};

export function createProfile(container, { onMetricClick }) {
  const root = d3.select(container);
  const title = root.append("div").attr("class", "profile__title");
  const groups = root.selectAll(".lens").data(Object.entries(ROWS)).join("div").attr("class", "lens");
  groups.append("div").attr("class", "lens__head")
    .html(([lens]) => `<span class="lens__dot" style="background:${LENSES[lens].color}"></span>${LENSES[lens].label}<em>${LENSES[lens].source}</em>`);
  const rows = groups.selectAll(".metric-row").data(([lens, metrics]) => metrics.map((m) => ({ lens, metric: m })))
    .join("div").attr("class", "metric-row").attr("title", (d) => METRICS[d.metric].note || "")
    .on("click", (_, d) => onMetricClick(d.metric));
  rows.append("span").attr("class", "metric-row__label").text((d) => METRICS[d.metric].label);
  rows.append("span").attr("class", "metric-row__value");
  const bars = rows.append("span").attr("class", "metric-row__bar");
  bars.append("i");

  /**
   * @param {string} label - what is selected
   * @param {Object} profileValues - metric -> value for the selection
   * @param {Array} countyValues - all counties' metric values (for percentiles)
   * @param {boolean} single - percentiles only make sense for one county
   */
  function update(label, profileValues, countyValues, single) {
    title.html(`${label}${single ? "" : " <em>(totals / weighted rates)</em>"}`);
    rows.select(".metric-row__value").text((d) => formatMetric(d.metric, profileValues[d.metric]));
    rows.select(".metric-row__bar i")
      .style("background", (d) => LENSES[d.lens].color)
      .transition().duration(500)
      .style("width", (d) => {
        const p = single ? riskPercentile(countyValues, d.metric, profileValues[d.metric]) : null;
        return p == null ? "0%" : `${Math.max(3, p * 100)}%`;
      });
    rows.select(".metric-row__bar").attr("title", (d) => {
      const p = single ? riskPercentile(countyValues, d.metric, profileValues[d.metric]) : null;
      return p == null ? "" : `Riskier than ${Math.round(p * 100)}% of Texas counties on this metric`;
    });
  }
  return { update };
}
