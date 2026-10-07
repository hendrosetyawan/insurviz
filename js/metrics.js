/**
 * metrics.js
 * ---------------------------------------------------------------------------
 * Joins the three lenses per county:
 *   hazard   – aggregated here from NOAA reports under the current filters
 *   exposure – Census ACS values (static)
 *   market   – TDI values (static) and the rates derived from them
 *   insured losses – TDI paid homeowners losses (losses.js), with an
 *                    exploratory baseline and discordance types
 * and summarises the current selection for the panels.
 */

import { METRICS, MIN_POLICIES_FOR_RATES, SIGNIFICANT } from "./config.js";
import { inSelection } from "./state.js";
import { discordanceTypes, fitBaseline, lossMetrics } from "./losses.js";

const PERIL_COUNT = 3;

/** Is one storm report "significant" by NWS/SPC thresholds? */
export function isSignificant(peril, magnitude) {
  if (peril === 2) return true;
  if (peril === 0) return magnitude >= SIGNIFICANT.hailInches * 100;
  return magnitude >= SIGNIFICANT.windKnots;
}

/** Static exposure + market metrics for one county record (null when not computable). */
function staticMetrics(d) {
  const rateBase = d.hoPoliciesZip >= MIN_POLICIES_FOR_RATES ? d.hoPoliciesZip : null;
  const notices = d.hoNoticesWithReasons >= 20 ? d.hoNoticesWithReasons : null;
  return {
    housingUnits: d.housingUnits ?? null,
    ownerUnits: d.ownerUnits ?? null,
    ownerValue: d.ownerUnits && d.medianHomeValue ? d.ownerUnits * d.medianHomeValue : null,
    medianHomeValue: d.medianHomeValue ?? null,
    medianYearBuilt: d.medianYearBuilt ?? null,
    medianIncome: d.medianIncome ?? null,
    pifHomeowners: d.pifHomeowners ?? null,
    coverageRatio: d.ownerUnits >= 200 && d.pifHomeowners != null ? d.pifHomeowners / d.ownerUnits : null,
    nonrenewalRate: rateBase ? ((d.hoNonrenewals || 0) / rateBase) * 1000 : null,
    declinationRate: rateBase ? ((d.hoDeclinations || 0) / rateBase) * 1000 : null,
    windHailShare: notices ? (d.reasons.G || 0) / notices : null,
    roofShare: notices ? (d.reasons.M || 0) / notices : null,
  };
}

/** Precompute the static part once per county. */
export function prepareCounties(countyList) {
  countyList.forEach((county) => { county.static = staticMetrics(county.data); });
}

/**
 * One pass over the storm reports -> everything the views need.
 * `visibility` (one float per report) feeds the storm-light layer:
 * 1 = passes filters and is selected, 0.2 = passes filters only, 0 = filtered out.
 */
export function aggregate(data, state, { eventTableRows, highlightCount, visibility }) {
  const { events, countyList } = data;
  const { peril, year, month, mag, damage, countyIdx, measured } = events.columns;
  const yearCount = state.yearTo - state.yearFrom + 1;
  const n = countyList.length;
  const perCounty = Array.from({ length: n }, () => ({ events: 0, significant: 0, damage: 0 }));
  const firstYear = 2015;

  const selected = {
    byPeril: [0, 0, 0], damageByPeril: [0, 0, 0],
    byYear: Array.from({ length: 11 }, () => [0, 0, 0]),
    byMonth: Array.from({ length: 12 }, () => [0, 0, 0]),
    eventCount: 0, significant: 0, damageTotal: 0, topEvents: [],
  };
  const highlights = [];
  const keepTop = (list, size) => (index, value) => {
    if (list.length === size && value <= list[list.length - 1].damage) return;
    list.push({ index, damage: value }); list.sort((a, b) => b.damage - a.damage);
    if (list.length > size) list.pop();
  };
  const pushTop = keepTop(selected.topEvents, eventTableRows);
  const pushHighlight = keepTop(highlights, highlightCount);
  visibility.fill(0);

  for (let i = 0; i < events.count; i++) {
    const p = peril[i];
    if (!state.perils[p]) continue;
    const c = countyIdx[i];
    const fips = c >= 0 ? countyList[c].fips : -1;
    const isSelected = c >= 0 && inSelection(state.selection, fips);
    if (isSelected) selected.byYear[year[i] - firstYear][p] += 1; // yearly series ignores the year window
    if (year[i] < state.yearFrom || year[i] > state.yearTo) continue;

    const significant = isSignificant(p, mag[i]);
    visibility[i] = isSelected ? 1 : 0.2;
    if (damage[i] > 0) pushHighlight(i, damage[i]);
    if (c >= 0) {
      perCounty[c].events += 1;
      if (significant) perCounty[c].significant += 1;
      if (damage[i] > 0) perCounty[c].damage += damage[i];
    }
    if (!isSelected) continue;
    selected.byPeril[p] += 1;
    selected.byMonth[month[i] - 1][p] += 1;
    selected.eventCount += 1;
    if (significant) selected.significant += 1;
    if (damage[i] > 0) { selected.damageTotal += damage[i]; selected.damageByPeril[p] += damage[i]; pushTop(i, damage[i]); }
  }

  // county metric values (hazard from this pass + static lenses)
  const values = countyList.map((county, c) => {
    const h = perCounty[c];
    return {
      ...county.static,
      eventsPerYear: h.events / yearCount,
      significantPerYear: h.significant / yearCount,
      reportsPer1kHomes: county.data.housingUnits >= 200 ? (h.events / yearCount / county.data.housingUnits) * 1000 : null,
      noaaDamage: h.damage,
      stormDensity: (h.events / yearCount / county.areaKm2) * 1000,
      noaaDamagePerHome: county.data.ownerUnits > 0 ? h.damage / yearCount / county.data.ownerUnits : null,
      ...lossMetrics(county, state), // insured-loss lens (TDI, selected years ∩ 2019–2025)
    };
  });
  // exploratory baseline for loss per policy + discordance types (needs all counties' values)
  const baseline = fitBaseline(countyList, values, data.twia);
  values.forEach((v) => { v.types = discordanceTypes(values, v); });

  const selection = summariseMarket(countyList, state.selection, selected);
  // insured-loss totals for the selection
  const chosen = selection.counties.map((c) => values[c.index]);
  const paidSum = d3.sum(chosen, (v) => v.paidLoss || 0), policySum = d3.sum(chosen, (v) => v.avgPolicies || 0);
  selection.paidLoss = chosen.some((v) => v.paidLoss != null) ? paidSum : null;
  selection.lossPerPolicy = policySum > 0 ? paidSum / policySum : null;
  return { values, selection, highlights, baseline };
}

/** Add the ACS + TDI totals of the selected counties to the selection summary. */
function summariseMarket(countyList, selection, selected) {
  const sum = { ownerUnits: 0, housingUnits: 0, pifHomeowners: 0, hoPoliciesZip: 0, hoNonrenewals: 0, hoDeclinations: 0, notices: 0, reasons: {} };
  const chosen = [];
  for (const county of countyList) {
    if (!inSelection(selection, county.fips)) continue;
    chosen.push(county);
    const d = county.data;
    sum.ownerUnits += d.ownerUnits || 0;
    sum.housingUnits += d.housingUnits || 0;
    sum.pifHomeowners += d.pifHomeowners || 0;
    sum.hoPoliciesZip += d.hoPoliciesZip || 0;
    sum.hoNonrenewals += d.hoNonrenewals || 0;
    sum.hoDeclinations += d.hoDeclinations || 0;
    sum.notices += d.hoNoticesWithReasons || 0;
    for (const [code, count] of Object.entries(d.reasons || {})) sum.reasons[code] = (sum.reasons[code] || 0) + count;
  }
  return {
    ...selected, ...sum, counties: chosen,
    coverageRatio: sum.ownerUnits ? sum.pifHomeowners / sum.ownerUnits : null,
    nonrenewalRate: sum.hoPoliciesZip ? (sum.hoNonrenewals / sum.hoPoliciesZip) * 1000 : null,
  };
}

/** Values of one metric across counties, for scales and percentiles. */
export function metricColumn(values, metric) {
  return values.map((v) => v[metric]).filter((v) => v != null && Number.isFinite(v));
}

/** Percentile (0-1) of a value among counties, oriented so 1 = highest risk/stress. */
export function riskPercentile(values, metric, value) {
  if (value == null) return null;
  const column = metricColumn(values, metric).sort(d3.ascending);
  const rank = d3.bisectRight(column, value) / column.length;
  return METRICS[metric].risk === "low" ? 1 - rank : rank;
}
