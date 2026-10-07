/**
 * model.js
 * ---------------------------------------------------------------------------
 * Period metrics per county for the selected years and perils, Texas
 * percentiles, an exploratory regression baseline for loss per policy,
 * discordance types, peer groups and per-county event concentration.
 *
 * Conventions: null = unavailable / not computable; 0 = measured zero.
 */

import { ANOMALY_Z, METRICS, MIN_POLICIES, YEARS } from "./config.js";

const sumOrNull = (values) => { const v = values.filter((x) => x != null); return v.length ? d3.sum(v) : null; };
const meanOrNull = (values) => { const v = values.filter((x) => x != null); return v.length ? d3.mean(v) : null; };
const safeDiv = (a, b) => (a == null || b == null || !(b > 0) ? null : a / b);

/** Aggregate one county's county-year rows into period metrics. */
function periodMetrics(county, state) {
  const rows = county.rows.filter((r) => r.year >= state.yearFrom && r.year <= state.yearTo);
  const n = rows.length;
  const perils = ["hail", "wind", "tornado"].filter((_, i) => state.perils[i]);
  const latest = rows[rows.length - 1] || {};

  const counts = (p) => d3.sum(rows, (r) => r[`${p}_count`] || 0);
  const stormTotal = d3.sum(perils, counts);
  // damage per peril: null only if every year is unreported for that peril
  const damageByPeril = Object.fromEntries(["hail", "wind", "tornado"].map((p) => [p, sumOrNull(rows.map((r) => r[`noaa_damage_${p}`]))]));
  const damageTotal = sumOrNull(perils.map((p) => damageByPeril[p]));
  const tdiYears = rows.filter((r) => r.tdi_paid_loss != null);
  const paidTotal = tdiYears.length ? d3.sum(tdiYears, (r) => r.tdi_paid_loss) : null;
  const policyYears = d3.sum(tdiYears, (r) => r.active_policies || 0);
  const paidPerYear = tdiYears.length ? paidTotal / tdiYears.length : null;
  const lossTypes = Object.fromEntries(["tdi_paid_wind_hail", "tdi_paid_water", "tdi_paid_fire", "tdi_paid_other"]
    .map((k) => [k, sumOrNull(tdiYears.map((r) => r[k]))]));

  const m = {
    years: n, tdiYears: tdiYears.length,
    storm_count: stormTotal / n,
    storm_density: (stormTotal / n / county.areaKm2) * 1000,
    hail_count: state.perils[0] ? counts("hail") / n : null,
    wind_count: state.perils[1] ? counts("wind") / n : null,
    tornado_count: state.perils[2] ? counts("tornado") / n : null,
    noaa_property_damage: damageTotal == null ? null : damageTotal / n,
    damage_per_event: stormTotal > 0 ? safeDiv(damageTotal, stormTotal) : null,
    tdi_paid_loss: paidPerYear,
    loss_per_policy: safeDiv(paidTotal, policyYears),
    active_policies: latest.active_policies ?? null,
    avg_policies: tdiYears.length ? policyYears / tdiYears.length : null,
    housing_units: latest.housing_units ?? null,
    owner_occupied_units: latest.owner_occupied_units ?? null,
    median_home_value: latest.median_home_value ?? null,
    estimated_property_exposure: latest.estimated_property_exposure ?? null,
    acs_vintage: latest.acs_vintage ?? null,
    premium_per_policy: meanOrNull(rows.map((r) => r.premium_per_policy)),
    damageByPeril, lossTypes,
    countsByPeril: { hail: counts("hail"), wind: counts("wind"), tornado: counts("tornado") },
    damageReportedShare: stormTotal ? d3.sum(rows, (r) => r.damage_reported_events || 0) / d3.sum(rows, (r) => r.storm_count || 0) : null,
    negativeYears: rows.filter((r) => r.tdi_paid_loss != null && r.tdi_paid_loss < 0).map((r) => r.year),
  };
  m.insured_loss_per_housing_unit = safeDiv(paidPerYear, m.housing_units);
  m.insured_loss_per_owner_unit = safeDiv(paidPerYear, m.owner_occupied_units);
  m.insured_loss_per_1k_exposure = m.estimated_property_exposure ? safeDiv(paidPerYear, m.estimated_property_exposure) * 1000 : null;
  m.noaa_damage_per_owner_unit = safeDiv(m.noaa_property_damage, m.owner_occupied_units);
  m.smallBase = !(m.avg_policies >= MIN_POLICIES);
  return m;
}

/** Event-level concentration for one county in the period (top-k shares of NOAA damage). */
export function concentration(data, fips, state, year = null) {
  const ev = data.events.columns;
  const perils = ["hail", "wind", "tornado"];
  const idx = (data.eventsByCounty.get(fips) || []).filter((i) => {
    const y = ev.year[i];
    return (year ? y === year : y >= state.yearFrom && y <= state.yearTo) && state.perils[perils.indexOf(ev.peril[i])];
  });
  const damages = idx.map((i) => ev.damage[i]).filter((d) => d != null).sort((a, b) => b - a);
  const total = d3.sum(damages);
  const share = (k) => (total > 0 ? d3.sum(damages.slice(0, k)) / total : null);
  return { events: idx, total, top1: share(1), top3: share(3), top5: share(5), reported: damages.length };
}

/** Percentile rank (0–100) of every county for one metric (nulls stay null). */
function percentiles(values) {
  const sorted = values.filter((v) => v != null && Number.isFinite(v)).sort(d3.ascending);
  return values.map((v) => (v == null || !Number.isFinite(v) ? null : (d3.bisectRight(sorted, v) / sorted.length) * 100));
}

/** Ordinary least squares via normal equations (small k). Returns coefficients. */
function ols(X, y) {
  const k = X[0].length;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);
  X.forEach((row, i) => { for (let a = 0; a < k; a++) { Xty[a] += row[a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += row[a] * row[b]; } });
  // Gauss-Jordan elimination
  const M = XtX.map((r, i) => [...r, Xty[i]]);
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r, i) => r[k] / r[i]);
}

export const BASELINE_FEATURES = [
  { key: "storm_density", label: "storm density", transform: (m) => Math.log1p(m.storm_density) },
  { key: "noaa_damage_per_owner_unit", label: "NOAA damage per home", transform: (m) => (m.noaa_damage_per_owner_unit == null ? null : Math.log1p(m.noaa_damage_per_owner_unit)) },
  { key: "median_home_value", label: "median home value", transform: (m) => (m.median_home_value > 0 ? Math.log(m.median_home_value) : null) },
];

/**
 * Exploratory baseline: log(loss per policy) ~ log1p(storm density)
 *   + log1p(NOAA damage per owner home) + log(median home value).
 * Fitted on counties with ≥ MIN_POLICIES average policies that are not in the
 * TWIA area (TDI excludes TWIA wind/hail losses there). Predictions for all.
 */
function fitBaseline(counties, metrics) {
  const features = (m) => BASELINE_FEATURES.map((f) => f.transform(m));
  const fitRows = [];
  counties.forEach((c, i) => {
    const m = metrics[i], x = features(m);
    if (c.twia || m.smallBase || !(m.loss_per_policy > 0) || x.some((v) => v == null || !Number.isFinite(v))) return;
    fitRows.push({ i, x, y: Math.log(m.loss_per_policy) });
  });
  const beta = ols(fitRows.map((r) => [1, ...r.x]), fitRows.map((r) => r.y));
  const means = BASELINE_FEATURES.map((_, j) => d3.mean(fitRows, (r) => r.x[j]));
  const predict = (x) => beta[0] + x.reduce((s, v, j) => s + beta[j + 1] * v, 0);
  const residuals = fitRows.map((r) => r.y - predict(r.x));
  const sd = d3.deviation(residuals);
  const yMean = d3.mean(fitRows, (r) => r.y);
  const r2 = 1 - d3.sum(residuals, (e) => e * e) / d3.sum(fitRows, (r) => (r.y - yMean) ** 2);
  const fitted = new Set(fitRows.map((r) => r.i));

  const results = counties.map((c, i) => {
    const m = metrics[i], x = features(m);
    if (x.some((v) => v == null || !Number.isFinite(v)) || !(m.loss_per_policy > 0)) return null;
    const logExpected = predict(x);
    const resid = Math.log(m.loss_per_policy) - logExpected;
    // contribution of each feature to the expected value, relative to the fitted-sample mean
    const contributions = BASELINE_FEATURES.map((f, j) => ({ key: f.key, label: f.label, value: beta[j + 1] * (x[j] - means[j]) }));
    return { expected: Math.exp(logExpected), ratio: Math.exp(resid), z: resid / sd, inFit: fitted.has(i), contributions };
  });
  return { beta, r2, n: fitRows.length, sd, results };
}

/** Discordance types from Texas percentiles (thresholds are stated in the UI). */
function discordance(p, z) {
  const types = [];
  if (p.storm_count >= 67 && p.loss_per_policy <= 33) types.push("High storm · low loss");
  if (p.storm_count <= 33 && p.loss_per_policy >= 67) types.push("Low storm · high loss");
  if (p.tdi_paid_loss >= 80 && p.loss_per_policy >= 30 && p.loss_per_policy <= 70) types.push("High absolute · ordinary per policy");
  if (p.noaa_property_damage >= 30 && p.noaa_property_damage <= 70 && p.tdi_paid_loss >= 80) types.push("Moderate NOAA damage · high paid loss");
  if (p.estimated_property_exposure >= 80 && p.insured_loss_per_1k_exposure <= 33) types.push("High exposure · low normalised loss");
  if (p.estimated_property_exposure <= 33 && p.insured_loss_per_1k_exposure >= 80) types.push("Low exposure · high normalised loss");
  if (z != null && z >= ANOMALY_Z) types.push("Above baseline");
  if (z != null && z <= -ANOMALY_Z) types.push("Below baseline");
  return types;
}

/** Everything the views need for the current filters. */
export function analyse(data, state) {
  const { counties } = data;
  const metrics = counties.map((c) => periodMetrics(c, state));
  const baseline = fitBaseline(counties, metrics);
  metrics.forEach((m, i) => { m.residual = baseline.results[i]?.ratio ?? null; });

  const keys = Object.keys(METRICS);
  const pct = {};
  keys.forEach((k) => {
    const raw = percentiles(metrics.map((m) => m[k]));
    raw.forEach((p, i) => { (pct[i] ||= {})[k] = p; });
  });
  const medians = Object.fromEntries(keys.map((k) => [k, d3.median(metrics, (m) => m[k])]));
  metrics.forEach((m, i) => {
    m.pct = pct[i];
    m.z = baseline.results[i]?.z ?? null;
    m.baseline = baseline.results[i];
    m.types = discordance(m.pct, baseline.results[i]?.inFit ? m.z : null);
  });

  // Texas totals by year (for temporal baselines) and statewide shares
  const texasByYear = YEARS.map((year) => {
    const rows = counties.map((c) => c.rows.find((r) => r.year === year)).filter(Boolean);
    const lpp = rows.map((r) => r.loss_per_policy).filter((v) => v != null);
    return { year, medianLossPerPolicy: d3.median(lpp), medianStorm: d3.median(rows, (r) => r.storm_count),
      medianDamage: d3.median(rows, (r) => r.noaa_property_damage), medianPaid: d3.median(rows, (r) => r.tdi_paid_loss) };
  });
  const lossTypeTotals = Object.fromEntries(["tdi_paid_wind_hail", "tdi_paid_water", "tdi_paid_fire", "tdi_paid_other"]
    .map((k) => [k, d3.sum(metrics, (m) => m.lossTypes[k] || 0)]));
  return { metrics, baseline, medians, texasByYear, lossTypeTotals };
}

/** The k counties most similar on storm density and median home value percentiles. */
export function peers(analysis, index, k = 10) {
  const me = analysis.metrics[index];
  if (me.pct.storm_density == null || me.pct.median_home_value == null) return [];
  return analysis.metrics.map((m, i) => ({ i, m }))
    .filter(({ i, m }) => i !== index && m.pct.storm_density != null && m.pct.median_home_value != null && m.loss_per_policy != null && !m.smallBase)
    .map((d) => ({ ...d, dist: Math.hypot(d.m.pct.storm_density - me.pct.storm_density, d.m.pct.median_home_value - me.pct.median_home_value) }))
    .sort((a, b) => a.dist - b.dist).slice(0, k);
}
