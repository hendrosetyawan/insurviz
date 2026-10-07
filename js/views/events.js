/**
 * events.js  ·  View 6: event drill-down (RQ5 "which events")
 * ---------------------------------------------------------------------------
 * NOAA events for the focus county in the drill-down year (or the whole
 * period). A cumulative-share strip shows how few events carry most of the
 * reported damage; events in the top 50% of damage are flagged "extreme".
 * The table sorts by damage, magnitude or date; event IDs link to NOAA.
 */

import { PERILS } from "../config.js";
import { count, money, pct, perilLabel } from "../format.js";

const SORTS = { damage: "Damage", magnitude: "Magnitude", date: "Date" };

export function createEvents(container, data, { onSort }) {
  const root = d3.select(container);
  const head = root.append("div").attr("class", "view-controls");
  const title = head.append("span").attr("class", "events-title");
  const sort = head.append("div").attr("class", "segmented");
  sort.selectAll("button").data(Object.entries(SORTS)).join("button").text((d) => `Sort: ${d[1]}`).on("click", (_, d) => onSort(d[0]));
  const strip = root.append("div").attr("class", "cumshare");
  const tableWrap = root.append("div").attr("class", "table-wrap");
  const ev = data.events.columns;
  const parseDate = d3.timeParse("%d-%b-%y %H:%M:%S"); // NOAA BEGIN_DATE_TIME, e.g. 20-MAY-19 07:50:00
  const time = ev.date.map((d) => +(parseDate(d) || 0));

  function update(state, idx) {
    sort.selectAll("button").classed("is-active", (d) => d[0] === state.eventSort);
    if (state.focus == null) { title.text("Select a county to list its events."); strip.html(""); tableWrap.html(""); return; }
    const county = data.countyByFips.get(state.focus);
    title.html(`<b>${county.name} County</b> · ${state.drillYear ?? `${state.yearFrom}–${state.yearTo}`} · ${count(idx.length)} hail/wind/tornado events`);

    // which events carry the first 50% of reported damage
    const byDamage = idx.filter((i) => ev.damage[i] > 0).sort((a, b) => ev.damage[b] - ev.damage[a]);
    const total = d3.sum(byDamage, (i) => ev.damage[i]);
    const extreme = new Set();
    let cum = 0;
    for (const i of byDamage) { if (cum / total >= 0.5) break; extreme.add(i); cum += ev.damage[i]; }
    const blank = idx.filter((i) => ev.damage[i] == null).length;
    strip.html(total > 0
      ? `<div class="cum-bar">${byDamage.slice(0, 40).map((i) => `<span style="width:${(ev.damage[i] / total) * 100}%;background:${PERILS.find((p) => p.key === ev.peril[i]).color}" class="${extreme.has(i) ? "ext" : ""}" title="${perilLabel(ev.peril[i])} ${ev.date[i]}: ${money(ev.damage[i])} (${pct(ev.damage[i] / total)})"></span>`).join("")}</div>
         <div class="view-note"><b>${extreme.size}</b> of ${count(idx.length)} events carry half of the ${money(total)} NOAA-reported damage (bar = each event's share, largest first). ${blank ? `${blank} events have no damage value (unknown, not $0).` : ""}</div>`
      : `<div class="view-note">No NOAA-reported property damage in this selection${blank ? ` (${blank} events have no damage value)` : ""}.</div>`);

    const sorter = { damage: (a, b) => (ev.damage[b] ?? -1) - (ev.damage[a] ?? -1),
      magnitude: (a, b) => (ev.magnitude[b] ?? -1) - (ev.magnitude[a] ?? -1), date: (a, b) => time[a] - time[b] }[state.eventSort];
    const rows = idx.slice().sort(sorter).slice(0, 150);
    const mag = (i) => (ev.peril[i] === "tornado" ? ev.tor_f_scale[i] || "tornado" : ev.magnitude[i] == null ? "n/a"
      : ev.peril[i] === "hail" ? `${ev.magnitude[i].toFixed(2)} in` : `${ev.magnitude[i]} kt${ev.magnitude_type[i] ? ` (${ev.magnitude_type[i]})` : ""}`);
    tableWrap.html(`<table class="events-table"><thead><tr><th>Date</th><th>Type</th><th>Magnitude</th><th class="num">NOAA damage</th><th>Location</th><th class="num">Inj./deaths</th><th>Event ID</th></tr></thead><tbody>
      ${rows.map((i) => `<tr class="${extreme.has(i) ? "extreme" : ""}" title="${(data.events.narratives[i] || "").replace(/"/g, "&quot;")}">
        <td>${ev.date[i]}</td><td><i class="pdot" style="background:${PERILS.find((p) => p.key === ev.peril[i]).color}"></i>${perilLabel(ev.peril[i])}</td>
        <td>${mag(i)}</td><td class="num">${ev.damage[i] == null ? '<span class="na">n/a</span>' : money(ev.damage[i])}${extreme.has(i) ? ' <span class="tag tag-hot">extreme</span>' : ""}</td>
        <td>${ev.begin_location[i] || ""} <span class="coords">${ev.begin_lat[i]?.toFixed(2)}, ${ev.begin_lon[i]?.toFixed(2)}</span></td>
        <td class="num">${(ev.injuries[i] || 0) + (ev.fatalities[i] || 0) ? `${ev.injuries[i]} / ${ev.fatalities[i]}` : "–"}</td>
        <td><a href="https://www.ncei.noaa.gov/stormevents/eventdetails.jsp?id=${ev.event_id[i]}" target="_blank" rel="noopener">${ev.event_id[i]}</a></td></tr>`).join("")}
      </tbody></table>${idx.length > rows.length ? `<div class="view-note">Showing ${rows.length} of ${idx.length}.</div>` : ""}`);
  }
  return { update };
}
