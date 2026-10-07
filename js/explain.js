/**
 * explain.js
 * ---------------------------------------------------------------------------
 * "Why is this county unusual?" — deterministic findings computed from the
 * metrics, never generated text. Each finding has a salience score (used for
 * ordering), the view that shows the evidence, and plain-language wording
 * that avoids causal claims.
 */

import { ANOMALY_Z, MIN_POLICIES, PERILS, TDI_LOSS_TYPES } from "./config.js";
import { concentration, peers } from "./model.js";
import { money, ordinal, pct, perilLabel, times } from "./format.js";

export function explainCounty(data, analysis, index, state) {
  const county = data.counties[index];
  const m = analysis.metrics[index];
  const p = m.pct;
  const med = analysis.medians;
  const out = [];
  const add = (salience, view, html, kind = "finding") => out.push({ salience, view, html, kind });

  // 1. hazard vs outcome ranks (RQ2/RQ4)
  if (p.loss_per_policy != null && p.storm_count != null) {
    const gap = p.loss_per_policy - p.storm_count;
    if (Math.abs(gap) >= 25) {
      add(Math.abs(gap), "scatter", `Ranks in the <b>${ordinal(p.loss_per_policy)} percentile</b> for paid loss per policy but ${gap > 0 ? "only " : ""}the <b>${ordinal(p.storm_count)} percentile</b> for severe-storm frequency.`);
    } else {
      add(5, "scatter", `Loss per policy (${ordinal(p.loss_per_policy)} percentile) is in line with storm frequency (${ordinal(p.storm_count)} percentile).`);
    }
  }

  // 2. loss per policy vs Texas median
  if (m.loss_per_policy != null && med.loss_per_policy > 0) {
    const r = m.loss_per_policy / med.loss_per_policy;
    if (r >= 1.5 || r <= 0.67) add(40 * Math.abs(Math.log(r)), "map", `Loss per policy is <b>${times(r)}</b> the Texas county median (${money(m.loss_per_policy)} vs ${money(med.loss_per_policy)} per policy per year).`);
  }

  // 3. exploratory baseline residual (RQ4)
  const b = m.baseline;
  if (b) {
    const top = b.contributions.slice().sort((a, c) => Math.abs(c.value) - Math.abs(a.value))[0];
    const direction = top.value > 0 ? "raises" : "lowers";
    const tag = Math.abs(m.z) >= ANOMALY_Z ? (m.z > 0 ? "well above" : "well below") : "close to";
    add(Math.abs(m.z) * 22, "anomalies", `Given its storm density, NOAA damage per home and home values, the baseline expects about <b>${money(b.expected)}</b> per policy; observed is <b>${money(m.loss_per_policy)}</b> (${times(b.ratio)}, ${tag} expectation, z = ${m.z.toFixed(1)}). The largest factor in the expectation is ${top.label}, which ${direction} it.${b.inFit ? "" : " <i>This county is outside the fitted sample.</i>"}`);
  }

  // 4. magnitude vs rate (RQ3)
  if (p.tdi_paid_loss != null && p.loss_per_policy != null && Math.abs(p.tdi_paid_loss - p.loss_per_policy) >= 30) {
    add(Math.abs(p.tdi_paid_loss - p.loss_per_policy) * 0.8, "map", `Normalisation changes the picture: absolute paid losses rank <b>${ordinal(p.tdi_paid_loss)}</b>, but loss per policy ranks <b>${ordinal(p.loss_per_policy)}</b>.`);
  }

  // 5. dominant peril in NOAA damage vs events (RQ5)
  const dmg = PERILS.map((x, i) => ({ key: x.key, value: state.perils[i] ? m.damageByPeril[x.key] || 0 : 0, n: state.perils[i] ? m.countsByPeril[x.key] : 0 }));
  const dTotal = d3.sum(dmg, (d) => d.value), nTotal = d3.sum(dmg, (d) => d.n);
  if (dTotal > 0) {
    const lead = dmg.slice().sort((a, c) => c.value - a.value)[0];
    const share = lead.value / dTotal, eventShare = nTotal ? lead.n / nTotal : 0;
    add(share > 0.6 ? 30 * share : 10, "profile", `<b>${pct(share)}</b> of NOAA-reported property damage came from <b>${perilLabel(lead.key).toLowerCase()}</b> events, which are ${pct(eventShare)} of reported events.`);
  }

  // 6. catastrophic concentration (event level)
  const conc = concentration(data, county.fips, state);
  if (conc.top3 != null && conc.reported >= 4) {
    add(conc.top3 > 0.7 ? 35 * conc.top3 : 8, "events", `<b>${pct(conc.top3)}</b> of reported NOAA property damage came from the three largest events (largest single event: ${pct(conc.top1)}).`);
  }

  // 7. when (temporal)
  const rows = county.rows.filter((r) => r.year >= state.yearFrom && r.year <= state.yearTo);
  const paidRows = rows.filter((r) => r.tdi_paid_loss != null);
  if (paidRows.length >= 2) {
    const peakPaid = d3.greatest(paidRows, (r) => r.tdi_paid_loss);
    const paidShare = peakPaid.tdi_paid_loss / d3.sum(paidRows, (r) => Math.max(0, r.tdi_paid_loss));
    const dmgRows = rows.filter((r) => r.noaa_property_damage > 0);
    const peakDmg = dmgRows.length ? d3.greatest(dmgRows, (r) => r.noaa_property_damage) : null;
    const coincide = peakDmg && peakDmg.year === peakPaid.year;
    add(paidShare > 0.35 ? 25 * paidShare : 6, "temporal", `Paid losses peaked in <b>${peakPaid.year}</b> (${pct(paidShare)} of the period total)${peakDmg ? `; NOAA damage peaked in <b>${peakDmg.year}</b>${coincide ? ", the same year" : ""}` : ""}.`);
  }

  // 8. TDI loss mix vs Texas
  const lt = TDI_LOSS_TYPES.map((t) => ({ ...t, v: m.lossTypes[t.key] || 0 }));
  const ltTotal = d3.sum(lt, (t) => Math.max(0, t.v));
  const txTotal = d3.sum(Object.values(analysis.lossTypeTotals));
  if (ltTotal > 0 && txTotal > 0) {
    const wh = lt[0].v / ltTotal, txWh = analysis.lossTypeTotals.tdi_paid_wind_hail / txTotal;
    add(Math.abs(wh - txWh) > 0.15 ? 60 * Math.abs(wh - txWh) : 4, "profile", `Wind & hail made up <b>${pct(wh)}</b> of paid homeowners losses (Texas overall: ${pct(txWh)}).`);
  }

  // 9. peer comparison
  const peerList = peers(analysis, index);
  if (peerList.length >= 5 && m.loss_per_policy != null) {
    const peerMedian = d3.median(peerList, (d) => d.m.loss_per_policy);
    const r = m.loss_per_policy / peerMedian;
    add(Math.abs(Math.log(r)) * 30, "compare", `Among the ${peerList.length} counties most similar in storm density and home value (${peerList.slice(0, 3).map((d) => data.counties[d.i].name).join(", ")}, …), median loss per policy is ${money(peerMedian)}; this county is <b>${times(r)}</b> its peers.`);
  }

  // caveats (always listed after findings)
  if (county.twia) add(-1, "methodology", "Coastal TWIA county: TDI paid losses exclude wind and hail covered by TWIA, so insured wind/hail loss is understated here.", "caveat");
  if (m.smallBase) add(-1, "methodology", `Small policy base (about ${Math.round(m.avg_policies || 0)} policies; below ${MIN_POLICIES}): rates are unstable and the county is not in the baseline fit.`, "caveat");
  if (m.damageReportedShare != null && m.damageReportedShare < 0.7) add(-1, "methodology", `Only ${pct(m.damageReportedShare)} of NOAA reports here have a property-damage value; blank values are treated as unknown, not $0.`, "caveat");
  if (m.negativeYears.length) add(-1, "methodology", `TDI reports net negative paid losses in ${m.negativeYears.join(", ")} (e.g. recoveries exceeding payments).`, "caveat");
  if (m.tdiYears < m.years) add(-1, "methodology", `TDI data is missing for ${m.years - m.tdiYears} of ${m.years} selected years; averages use available years.`, "caveat");

  const findings = out.filter((f) => f.kind === "finding").sort((a, c) => c.salience - a.salience);
  return { findings, caveats: out.filter((f) => f.kind === "caveat"), concentration: conc, peers: peerList };
}
