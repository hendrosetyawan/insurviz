/**
 * ticker.js
 * ---------------------------------------------------------------------------
 * A scrolling "tape" along the bottom of the page listing the most damaging
 * events in the current filters (the same events marked by shockwaves).
 */

import { formatMoney, perilColor, perilLabel } from "../format.js";

export function createTicker(container, { events, countyList }) {
  const track = d3.select(container).append("div").attr("class", "ticker__track");
  const { peril, year, month, countyIdx } = events.columns;

  function update(highlights) {
    const items = highlights.map(({ index, damage }) => ({
      key: index,
      peril: peril[index],
      label: `${countyIdx[index] >= 0 ? countyList[countyIdx[index]].name + " Co." : "Texas"} ${year[index]}-${String(month[index]).padStart(2, "0")}`,
      damage,
    }));
    // the list is drawn twice so the CSS scroll loops without a gap
    const doubled = [...items, ...items].map((item, k) => ({ ...item, slot: k }));
    track.selectAll(".ticker__item").data(doubled, (d) => d.slot).join("span").attr("class", "ticker__item")
      .html((d) => `<i style="background:${perilColor(d.peril)}"></i>${perilLabel(d.peril)} · ${d.label} <b>${formatMoney(d.damage)}</b>`);
    track.style("animation-duration", `${Math.max(30, items.length * 3.2)}s`);
  }
  return { update };
}
