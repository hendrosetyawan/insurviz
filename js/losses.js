/**
 * losses.js
 * ---------------------------------------------------------------------------
 * The insured-loss lens (TDI "Texas homeowners losses by county", 2019–2025):
 *  - per-county loss metrics for the selected years ∩ 2019–2025,
 *  - an exploratory baseline for loss per policy (descriptive, not causal),
 *  - discordance types between hazard, exposure and insured loss.
 * null = unavailable; 0 = measured zero.
 */

import { ANOMALY_Z, LOSS_YEARS, MIN_POLICIES_FIT } from "./config.js";

const safeDiv = (a, b) => (a == null || b == null || !(b > 0) ? null : a / b);

/** Loss metrics for one county over the overlap of the year filter with 2019–2025. */
export function lossMetrics(county, state) {
  const from = Math.max(state.yearFrom, LOSS_YEARS[0]), to = Math.min(state.yearTo, LOSS_YEARS[LOSS_YEARS.length - 1]);
  const rows = county.lossRows.filter((r) => r.year >= from && r.year <= to);
  const paid = rows.filter((r) => r.tdi_paid_loss != null);
  if (!paid.length) return { paidLoss: null, lossPerPolicy: null, lossPerOwnerHome: null, lossPer1kValue: null, windHailLossShare: null, avgPolicies: null, lossYears: 0, lossWindow: [from, to] };
  const total = d3.sum(paid, (r) => r.tdi_paid_loss);
  const policyYears = d3.sum(paid, (r) => r.active_policies || 0);
  const perYear = total / paid.length;
  const latest = rows[rows.length - 1];
  const exposure = latest.owner_occupied_units && latest.median_home_value ? latest.owner_occupied_units * latest.median_home_value : null;
  const wind = d3.sum(paid, (r) => r.tdi_paid_wind_hail || 0);
  return {
    paidLoss: perYear,
    lossPerPolicy: safeDiv(total, policyYears),
    lossPerOwnerHome: safeDiv(perYear, latest.owner_occupied_units),
    lossPer1kValue: exposure ? safeDiv(perYear, exposure) * 1000 : null,
    windHailLossShare: total > 0 ? wind / total : null,
    avgPolicies: policyYears / paid.length,
    lossYears: paid.length, lossWindow: [from, to],
    lossTypes: { wind: wind, water: d3.sum(paid, (r) => r.tdi_paid_water || 0), fire: d3.sum(paid, (r) => r.tdi_paid_fire || 0), other: d3.sum(paid, (r) => r.tdi_paid_other || 0) },
    negativeYears: paid.filter((r) => r.tdi_paid_loss < 0).map((r) => r.year),
  };
}

/** OLS via normal equations (Gauss–Jordan), small number of predictors. */
function ols(X, y) {
  const k = X[0].length, M = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  X.forEach((row, i) => { for (let a = 0; a < k; a++) { M[a][k] += row[a] * y[i]; for (let b = 0; b < k; b++) M[a][b] += row[a] * row[b]; } });
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r, i) => r[k] / r[i]);
}

export const BASELINE_FEATURES = [
  { key: "stormDensity", label: "storm density", x: (v) => Math.log1p(v.stormDensity) },
  { key: "noaaDamagePerHome", label: "NOAA damage per home", x: (v) => (v.noaaDamagePerHome == null ? null : Math.log1p(v.noaaDamagePerHome)) },
  { key: "medianHomeValue", label: "median home value", x: (v) => (v.medianHomeValue > 0 ? Math.log(v.medianHomeValue) : null) },
];

/**
 * log(loss per policy) ~ log1p(storm density) + log1p(NOAA damage per owner home) + log(median home value),
 * fitted on counties with ≥ MIN_POLICIES_FIT policies outside the TWIA area (TDI excludes TWIA wind/hail).
 * Writes baselineRatio / baselineZ / baselineExpected / baselineContrib / baselineInFit onto `values`.
 */
export function fitBaseline(countyList, values, twia) {
  const feats = (v) => BASELINE_FEATURES.map((f) => f.x(v));
  const ok = (x) => x.every((v) => v != null && Number.isFinite(v));
  const fit = [];
  values.forEach((v, i) => {
    const x = feats(v);
    if (twia.has(countyList[i].fips) || !(v.avgPolicies >= MIN_POLICIES_FIT) || !(v.lossPerPolicy > 0) || !ok(x)) return;
    fit.push({ i, x, y: Math.log(v.lossPerPolicy) });
  });
  if (fit.length < 10) return null;
  const beta = ols(fit.map((r) => [1, ...r.x]), fit.map((r) => r.y));
  const means = BASELINE_FEATURES.map((_, j) => d3.mean(fit, (r) => r.x[j]));
  const predict = (x) => beta[0] + x.reduce((s, v, j) => s + beta[j + 1] * v, 0);
  const res = fit.map((r) => r.y - predict(r.x));
  const sd = d3.deviation(res), yMean = d3.mean(fit, (r) => r.y);
  const r2 = 1 - d3.sum(res, (e) => e * e) / d3.sum(fit, (r) => (r.y - yMean) ** 2);
  const inFit = new Set(fit.map((r) => r.i));
  values.forEach((v, i) => {
    const x = feats(v);
    if (!ok(x) || !(v.lossPerPolicy > 0)) { v.baselineRatio = null; v.baselineZ = null; return; }
    const lnExp = predict(x), resid = Math.log(v.lossPerPolicy) - lnExp;
    v.baselineExpected = Math.exp(lnExp);
    v.baselineRatio = Math.exp(resid);
    v.baselineZ = resid / sd;
    v.baselineInFit = inFit.has(i);
    v.baselineContrib = BASELINE_FEATURES.map((f, j) => ({ label: f.label, value: beta[j + 1] * (x[j] - means[j]) }));
  });
  return { beta, r2, n: fit.length, sd };
}

/** Percentile (0–100) helper on raw values (higher value = higher percentile). */
export function percentileOf(values, key, value) {
  if (value == null || !Number.isFinite(value)) return null;
  const col = values.map((v) => v[key]).filter((x) => x != null && Number.isFinite(x)).sort(d3.ascending);
  return (d3.bisectRight(col, value) / col.length) * 100;
}

/** Discordance types for one county (thresholds stated in the methodology). */
export function discordanceTypes(values, v) {
  const p = (k) => percentileOf(values, k, v[k]);
  const t = [];
  const storm = p("eventsPerYear"), lpp = p("lossPerPolicy"), paid = p("paidLoss"), dmg = p("noaaDamage"), expo = p("ownerValue"), norm = p("lossPer1kValue");
  if (storm >= 67 && lpp <= 33) t.push("High storm · low loss");
  if (storm <= 33 && lpp >= 67) t.push("Low storm · high loss");
  if (paid >= 80 && lpp >= 30 && lpp <= 70) t.push("High absolute · ordinary per policy");
  if (dmg >= 30 && dmg <= 70 && paid >= 80) t.push("Moderate NOAA damage · high paid loss");
  if (expo >= 80 && norm <= 33) t.push("High exposure · low normalised loss");
  if (expo <= 33 && norm >= 80) t.push("Low exposure · high normalised loss");
  if (v.baselineInFit && v.baselineZ >= ANOMALY_Z) t.push("Above baseline");
  if (v.baselineInFit && v.baselineZ <= -ANOMALY_Z) t.push("Below baseline");
  return t;
}
