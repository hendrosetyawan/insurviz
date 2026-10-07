/**
 * profile.js  ·  View 4: risk / insurance profile
 * ---------------------------------------------------------------------------
 * For the focus county: dominant peril, hazard composition (events by peril),
 * NOAA damage composition, TDI paid-loss composition, a percentile strip
 * against all 254 counties, and catastrophic concentration.
 */

import { GROUPS, METRICS, PERILS, TDI_LOSS_TYPES } from "../config.js";
import { metric, ordinal, pct, perilLabel } from "../format.js";

const STRIP = ["storm_count", "storm_density", "noaa_property_damage", "damage_per_event", "tdi_paid_loss", "loss_per_policy",
  "insured_loss_per_1k_exposure", "estimated_property_exposure", "residual"];

const sumParts = (parts) => d3.sum(parts, (p) => p.v || 0);

/** A 100% stacked bar as HTML (segments with labels when wide enough). */
function stackBar(parts, total) {
  if (!(total > 0)) return '<div class="stack empty">n/a</div>';
  return `<div class="stack">${parts.filter((p) => p.v > 0).map((p) => {
    const s = p.v / total;
    return `<span style="width:${s * 100}%;background:${p.color}" title="${p.label}: ${pct(s)}">${s >= 0.12 ? pct(s) : ""}</span>`;
  }).join("")}</div>`;
}

export function createProfile(container, data) {
  const root = d3.select(container);

  function update(state, analysis, explanation) {
    if (state.focus == null) { root.html('<p class="placeholder">Select a county to see its hazard, exposure and insurance profile.</p>'); return; }
    const i = data.counties.findIndex((c) => c.fips === state.focus);
    const c = data.counties[i], m = analysis.metrics[i];
    const perils = PERILS.filter((_, k) => state.perils[k]);
    const counts = perils.map((p) => ({ ...p, v: m.countsByPeril[p.key] }));
    const dmg = perils.map((p) => ({ ...p, v: m.damageByPeril[p.key] || 0 }));
    const loss = TDI_LOSS_TYPES.map((t) => ({ ...t, v: Math.max(0, m.lossTypes[t.key] || 0) }));
    const lead = dmg.slice().sort((a, b) => b.v - a.v)[0];
    const leadByCount = counts.slice().sort((a, b) => b.v - a.v)[0];
    const conc = explanation.concentration;

    root.html(`
      <div class="profile-head"><h3>${c.name} County</h3>
        <span class="meta">${state.yearFrom === state.yearTo ? state.yearFrom : `${state.yearFrom}–${state.yearTo}`} · ACS ${m.acs_vintage ? `${m.acs_vintage - 4}–${m.acs_vintage}` : "n/a"}${c.twia ? ' · <span class="tag tag-warn">TWIA coast</span>' : ""}${m.smallBase ? ' · <span class="tag tag-warn">small policy base</span>' : ""}</span></div>
      <div class="kv">
        <div><span>Dominant peril (events)</span><b>${leadByCount && leadByCount.v ? perilLabel(leadByCount.key) : "n/a"}</b></div>
        <div><span>Dominant peril (NOAA damage)</span><b>${lead && lead.v ? perilLabel(lead.key) : "n/a"}</b></div>
        <div><span>Top-3 events' share of NOAA damage</span><b>${pct(conc.top3)}</b></div>
        <div><span>Active homeowners policies</span><b>${metric("active_policies", m.active_policies)}</b></div>
      </div>
      <div class="comp"><label>Hazard composition <em>events by peril</em></label>${stackBar(counts, sumParts(counts))}
        <div class="comp-key">${PERILS.map((p) => `<span><i style="background:${p.color}"></i>${p.label}</span>`).join("")}</div></div>
      <div class="comp"><label>NOAA damage composition <em>reported $ by peril</em></label>${stackBar(dmg, sumParts(dmg))}</div>
      <div class="comp"><label>TDI paid-loss composition <em>homeowners, by loss type</em></label>${stackBar(loss, sumParts(loss))}
        <div class="comp-key">${TDI_LOSS_TYPES.map((t) => `<span><i style="background:${t.color}"></i>${t.label}</span>`).join("")}</div></div>
      <div class="strip-title">Position in the Texas distribution <em>(percentile among 254 counties; tick = median)</em></div>
      <div class="strip">${STRIP.map((k) => {
        const p = m.pct[k];
        return `<div class="strip-row" title="${METRICS[k].def}"><span class="strip-label"><i style="background:${GROUPS[METRICS[k].group].color}"></i>${METRICS[k].label}</span>
          <span class="strip-track"><span class="strip-mid"></span>${p == null ? '<span class="strip-na">n/a</span>' : `<span class="strip-dot" style="left:${p}%;background:${GROUPS[METRICS[k].group].color}"></span>`}</span>
          <span class="strip-val">${metric(k, m[k])}</span><span class="strip-pct">${ordinal(p)}</span></div>`;
      }).join("")}</div>`);
  }
  return { update };
}
