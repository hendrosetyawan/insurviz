/**
 * zipReasons.js  ·  ZIP-level nonrenewals, declinations and reasons
 * ---------------------------------------------------------------------------
 * TDI launched a ZIP lookup on 23 Sep 2026 showing why insurers decline,
 * cancel or do not renew home policies (HB 2067). This panel uses the same
 * data: for the selected county (or the whole state) it ranks ZIP codes by
 * homeowners nonrenewals + declinations per 1,000 policies and shows each
 * ZIP's reason mix, highlighting weather-related reasons (G wind/hail/
 * hurricane, M roof) that tie insurer decisions back to storm hazard.
 */

import { formatCount } from "../format.js";

const GROUPS = [
  { key: "weather", label: "Wind/hail/hurricane (G)", codes: ["G"], color: "#f97316" },
  { key: "roof", label: "Roof (M)", codes: ["M"], color: "#fbbf24" },
  { key: "claims", label: "Claims history (D)", codes: ["D"], color: "#a78bfa" },
  { key: "property", label: "Other property condition (N, Q, R)", codes: ["N", "Q", "R"], color: "#60a5fa" },
  { key: "other", label: "Other reasons", codes: null, color: "#5b6770" },
];
const MIN_POLICIES = 200, ROWS = 10;

export function createZipReasons(container, { zipData }) {
  const root = d3.select(container);
  root.append("div").attr("class", "zip-key").html(GROUPS.map((g) => `<span><i style="background:${g.color}"></i>${g.label}</span>`).join(""));
  const table = root.append("div").attr("class", "zip-table");
  const note = root.append("div").attr("class", "panel__sub");
  const zips = Object.entries(zipData.zips).map(([zip, d]) => ({ zip, ...d }));

  function update(county) {
    const rows = zips.filter((d) => (county ? d.c === county.fips : true) && d.p >= MIN_POLICIES)
      .map((d) => {
        const r = d.r || {}, total = Object.values(r).reduce((a, b) => a + b, 0);
        const used = new Set(GROUPS.flatMap((g) => g.codes || []));
        const parts = GROUPS.map((g) => ({ ...g, v: g.codes ? d3.sum(g.codes, (c) => r[c] || 0) : d3.sum(Object.entries(r).filter(([c]) => !used.has(c)), ([, v]) => v) }));
        return { ...d, rate: ((d.non + d.dec) / d.p) * 1000, parts, total };
      })
      .sort((a, b) => b.rate - a.rate).slice(0, ROWS);
    table.html(rows.length ? `<table><tr><th>ZIP</th><th class="num">HO policies</th><th class="num">Nonrenew + decline / 1k</th><th>Reason mix (share of reason citations)</th></tr>
      ${rows.map((d) => `<tr><td class="mono">${d.zip}</td><td class="num">${formatCount(d.p)}</td><td class="num"><b>${d.rate.toFixed(1)}</b></td>
        <td><div class="zip-bar">${d.total ? d.parts.filter((p) => p.v > 0).map((p) => `<span style="width:${(p.v / d.total) * 100}%;background:${p.color}" title="${p.label}: ${Math.round((p.v / d.total) * 100)}%"></span>`).join("") : '<em class="muted">no reasons reported</em>'}</div></td></tr>`).join("")}</table>`
      : '<p class="panel__sub">No ZIP with at least 200 homeowners policies in this selection.</p>');
    note.html(`Same data as TDI's ZIP lookup (launched 23 Sep 2026, HB 2067): homeowners actions Apr–Jun 2026 ÷ active policies (31 Dec 2025); ZIPs with ≥ ${MIN_POLICIES} policies, ${county ? `in ${county.name} County` : "statewide"}. A notice can cite several reasons.`);
  }
  return { update };
}
