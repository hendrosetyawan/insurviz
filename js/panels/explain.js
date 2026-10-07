/**
 * explain.js  ·  "Why is this county unusual?"
 * ---------------------------------------------------------------------------
 * Deterministic findings computed from the metrics (never generated text),
 * ordered by salience: hazard-vs-loss rank gaps, ratio to the Texas median
 * and to peer counties, the baseline residual and its largest driver, the
 * effect of normalisation, dominant peril, catastrophic concentration, peak
 * years, and the TDI loss mix, followed by data caveats.
 */

import { ANOMALY_Z, MIN_POLICIES_FIT, PERILS } from "../config.js";
import { formatMoney, formatPercent, formatTimes, ordinal } from "../format.js";
import { percentileOf } from "../losses.js";

export function createExplain(container) {
  const root = d3.select(container);

  function update({ data, values, county, state }) {
    if (!county) {
      root.html('<p class="panel__sub">Click a county (map, ranking, scatter or anomaly list) to see why it stands out. Every statement is computed from the data.</p>');
      return;
    }
    const i = county.index, v = values[i];
    const pct = (k) => percentileOf(values, k, v[k]);
    const median = (k) => d3.median(values, (x) => x[k]);
    const out = [];
    const add = (score, html) => out.push({ score, html });

    // 1. hazard vs insured loss ranks
    const pl = pct("lossPerPolicy"), ps = pct("eventsPerYear");
    if (pl != null && ps != null && Math.abs(pl - ps) >= 25) {
      add(Math.abs(pl - ps), `Ranks in the <b>${ordinal(pl)} percentile</b> for paid loss per policy but ${pl > ps ? "only " : ""}the <b>${ordinal(ps)} percentile</b> for severe-storm frequency.`);
    }
    // 2. vs Texas median
    if (v.lossPerPolicy != null && median("lossPerPolicy") > 0) {
      const r = v.lossPerPolicy / median("lossPerPolicy");
      if (r >= 1.5 || r <= 0.67) add(40 * Math.abs(Math.log(r)), `Loss per policy is <b>${formatTimes(r)}</b> the Texas county median (${formatMoney(v.lossPerPolicy)} vs ${formatMoney(median("lossPerPolicy"))}).`);
    }
    // 3. baseline residual
    if (v.baselineRatio != null) {
      const top = v.baselineContrib.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
      const tag = Math.abs(v.baselineZ) >= ANOMALY_Z ? (v.baselineZ > 0 ? "well above" : "well below") : "close to";
      add(Math.abs(v.baselineZ) * 22, `Given its storm density, NOAA damage per home and home values, the baseline expects about <b>${formatMoney(v.baselineExpected)}</b> per policy; observed is <b>${formatMoney(v.lossPerPolicy)}</b> (${formatTimes(v.baselineRatio)}, ${tag} expectation, z = ${v.baselineZ.toFixed(1)}). Largest factor: ${top.label} (${top.value > 0 ? "raises" : "lowers"} the expectation).${v.baselineInFit ? "" : " <i>Outside the fitted sample.</i>"}`);
    }
    // 4. magnitude vs rate
    const pp = pct("paidLoss");
    if (pp != null && pl != null && Math.abs(pp - pl) >= 30) add(Math.abs(pp - pl) * 0.8, `Normalisation changes the picture: absolute paid losses rank <b>${ordinal(pp)}</b>, loss per policy ranks <b>${ordinal(pl)}</b>.`);

    // 5. dominant peril and 6. concentration (NOAA reports in the selected years and perils)
    const ev = data.events.columns;
    const idx = d3.range(data.events.count).filter((k) => ev.countyIdx[k] === i && ev.year[k] >= state.yearFrom && ev.year[k] <= state.yearTo && state.perils[ev.peril[k]]);
    const dmgBy = [0, 0, 0], nBy = [0, 0, 0];
    idx.forEach((k) => { nBy[ev.peril[k]] += 1; if (ev.damage[k] > 0) dmgBy[ev.peril[k]] += ev.damage[k]; });
    const dTot = d3.sum(dmgBy), nTot = d3.sum(nBy);
    if (dTot > 0) {
      const lead = d3.maxIndex(dmgBy), share = dmgBy[lead] / dTot;
      add(share > 0.6 ? 30 * share : 10, `<b>${formatPercent(share)}</b> of NOAA-reported property damage came from <b>${PERILS[lead].label.toLowerCase()}</b> events (${formatPercent(nBy[lead] / nTot)} of reports).`);
      const sorted = idx.map((k) => ev.damage[k]).filter((d) => d > 0).sort((a, b) => b - a);
      if (sorted.length >= 4) {
        const top3 = d3.sum(sorted.slice(0, 3)) / dTot;
        add(top3 > 0.7 ? 35 * top3 : 8, `<b>${formatPercent(top3)}</b> of reported NOAA damage came from the three largest events (largest: ${formatPercent(sorted[0] / dTot)}).`);
      }
    }
    // 7. when: peak paid-loss year vs peak NOAA damage year (2019–2025 overlap)
    const rows = county.lossRows.filter((r) => r.year >= state.yearFrom && r.year <= state.yearTo && r.tdi_paid_loss != null);
    if (rows.length >= 2) {
      const peak = d3.greatest(rows, (r) => r.tdi_paid_loss), share = peak.tdi_paid_loss / d3.sum(rows, (r) => Math.max(0, r.tdi_paid_loss));
      const dRows = rows.filter((r) => r.noaa_property_damage > 0), dPeak = dRows.length ? d3.greatest(dRows, (r) => r.noaa_property_damage) : null;
      add(share > 0.35 ? 25 * share : 6, `Paid losses peaked in <b>${peak.year}</b> (${formatPercent(share)} of the period)${dPeak ? `; NOAA damage peaked in <b>${dPeak.year}</b>${dPeak.year === peak.year ? ", the same year" : ""}` : ""}.`);
    }
    // 8. loss mix vs Texas
    const txWind = d3.sum(values, (x) => x.lossTypes?.wind || 0), txAll = d3.sum(values, (x) => x.lossTypes ? x.lossTypes.wind + x.lossTypes.water + x.lossTypes.fire + x.lossTypes.other : 0);
    if (v.windHailLossShare != null && txAll > 0 && Math.abs(v.windHailLossShare - txWind / txAll) > 0.15) {
      add(60 * Math.abs(v.windHailLossShare - txWind / txAll), `Wind & hail made up <b>${formatPercent(v.windHailLossShare)}</b> of paid homeowners losses (Texas: ${formatPercent(txWind / txAll)}).`);
    }
    // 9. peers (closest in storm density and median home value percentiles)
    const me = [pct("stormDensity"), pct("medianHomeValue")];
    if (me.every((x) => x != null) && v.lossPerPolicy != null) {
      const peers = values.map((x, k) => ({ k, x, d: Math.hypot(percentileOf(values, "stormDensity", x.stormDensity) - me[0], percentileOf(values, "medianHomeValue", x.medianHomeValue) - me[1]) }))
        .filter((p) => p.k !== i && Number.isFinite(p.d) && p.x.lossPerPolicy != null && p.x.avgPolicies >= MIN_POLICIES_FIT)
        .sort((a, b) => a.d - b.d).slice(0, 10);
      if (peers.length >= 5) {
        const pm = d3.median(peers, (p) => p.x.lossPerPolicy), r = v.lossPerPolicy / pm;
        add(Math.abs(Math.log(r)) * 30, `Among the 10 counties most similar in storm density and home value (${peers.slice(0, 3).map((p) => data.countyList[p.k].name).join(", ")}, …), median loss per policy is ${formatMoney(pm)}; this county is <b>${formatTimes(r)}</b> its peers.`);
      }
    }

    const caveats = [];
    if (data.twia.has(county.fips)) caveats.push("TWIA coastal county: TDI paid losses exclude wind/hail covered by TWIA, so insured wind/hail loss is understated.");
    if (!(v.avgPolicies >= MIN_POLICIES_FIT)) caveats.push(`Small policy base (about ${Math.round(v.avgPolicies || 0)} policies): rates are unstable; not in the baseline fit.`);
    if (state.yearTo < 2019) caveats.push("TDI loss data starts in 2019: widen the year filter to include 2019–2025.");
    if (v.negativeYears?.length) caveats.push(`TDI reports net negative paid losses in ${v.negativeYears.join(", ")}.`);
    caveats.push(`Loss metrics use ${v.lossWindow ? `${v.lossWindow[0]}–${v.lossWindow[1]}` : "2019–2025"} (TDI years within the filter). NOAA damage is an estimate, not insured loss.`);

    root.html(`<div class="explain-head"><b>${county.name} County</b> ${v.types.map((t) => `<span class="type-tag">${t}</span>`).join("") || '<span class="type-tag muted">no discordance type triggered</span>'}</div>
      <ol class="findings">${out.sort((a, b) => b.score - a.score).slice(0, 7).map((f) => `<li>${f.html}</li>`).join("")}</ol>
      <div class="explain-caveats">${caveats.map((c) => `<div>⚠ ${c}</div>`).join("")}</div>`);
  }
  return { update };
}
