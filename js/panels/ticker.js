/**
 * ticker.js
 * ---------------------------------------------------------------------------
 * A scrolling "tape" along the bottom of the page: the largest TDI paid
 * homeowners-loss county-years in the selected window, each next to the
 * NOAA-reported damage for the same county and year (storm vs insured loss).
 */

import { formatMoney, formatTimes } from "../format.js";

export function createTicker(container, { events, countyList }) {
  const track = d3.select(container).append("div").attr("class", "ticker__track");
  const { peril, year, month, countyIdx } = events.columns;

  /** Insurance tape: biggest paid-loss county-years with that year's NOAA damage. */
  function update(countyListArg, state) {
    const items = countyListArg.flatMap((c) => c.lossRows.filter((r) => r.year >= state.yearFrom && r.year <= state.yearTo && r.tdi_paid_loss > 0)
      .map((r) => ({ key: `${c.fips}-${r.year}`, name: c.name, year: r.year, paid: r.tdi_paid_loss, noaa: r.noaa_property_damage })))
      .sort((a, b) => b.paid - a.paid).slice(0, 24);
    const doubled = [...items, ...items].map((item, k) => ({ ...item, slot: k }));
    track.selectAll(".ticker__item").data(doubled, (d) => d.slot).join("span").attr("class", "ticker__item")
      .html((d) => `<i style="background:#fb923c"></i>${d.name} Co. ${d.year} · TDI paid <b>${formatMoney(d.paid)}</b> · NOAA damage ${formatMoney(d.noaa)}${d.noaa > 0 ? ` (${formatTimes(d.paid / d.noaa)})` : ""}`);
    track.style("animation-duration", `${Math.max(40, items.length * 3.6)}s`);
  }
  return { update };
}
