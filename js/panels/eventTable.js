/**
 * eventTable.js  ·  R4 Event investigation
 * ---------------------------------------------------------------------------
 * The most damaging individual events behind the current selection, with the
 * NWS narrative when available. Clicking a row raises a beacon over the event
 * on the 3D map.
 */

import { formatMagnitude, formatMoney, perilColor, perilLabel } from "../format.js";

export function createEventTable(container, { events, countyList, onFocusEvent }) {
  const root = d3.select(container);
  const list = root.append("div").attr("class", "event-list");
  const { peril, year, month, day, mag, countyIdx, measured } = events.columns;
  const narratives = events.narratives;

  const describePlace = (c) => (c >= 0 ? `${countyList[c].name} County` : "Texas");

  function update(selected, state) {
    const rows = selected.topEvents.map(({ index, damage }) => ({
      index, damage,
      peril: peril[index],
      date: `${year[index]}-${String(month[index]).padStart(2, "0")}-${String(day[index]).padStart(2, "0")}`,
      place: describePlace(countyIdx[index]),
      magnitude: formatMagnitude(peril[index], mag[index], measured[index]),
      detail: narratives[index],
    }));

    list.selectAll(".event").data(rows, (r) => r.index).join((enter) => {
      const item = enter.append("div").attr("class", "event");
      const head = item.append("div").attr("class", "event__head");
      head.append("span").attr("class", "event__peril");
      head.append("span").attr("class", "event__date");
      head.append("span").attr("class", "event__damage");
      item.append("div").attr("class", "event__place");
      item.append("div").attr("class", "event__text");
      return item;
    })
      .classed("is-focused", (r) => r.index === state.focusEvent)
      .on("click", (_, r) => onFocusEvent(r.index))
      .call((item) => {
        item.select(".event__peril").style("color", (r) => perilColor(r.peril)).text((r) => perilLabel(r.peril));
        item.select(".event__date").text((r) => r.date);
        item.select(".event__damage").text((r) => formatMoney(r.damage));
        item.select(".event__place").text((r) => `${r.place} · ${r.magnitude}`);
        item.select(".event__text").text((r) => r.detail || "");
      });

    root.select(".event-empty").remove();
    if (!rows.length) root.append("div").attr("class", "event-empty").text("No events with reported damage in this selection.");
  }
  return { update };
}
