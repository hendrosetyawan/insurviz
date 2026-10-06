/**
 * kpis.js
 * ---------------------------------------------------------------------------
 * Header tiles summarising the current selection, including how much of the
 * evidence is measured (wind gusts) and how often damage is reported at all.
 */

import { formatCount, formatMoney, formatPercent } from "../format.js";

export function createKpis(container) {
  const tiles = [
    { key: "events", label: "Events" },
    { key: "significant", label: "Significant events" },
    { key: "damage", label: "NOAA-reported damage" },
    { key: "reported", label: "Damage field filled" },
    { key: "measured", label: "Wind gusts measured" },
  ];
  const tileSelection = d3.select(container).selectAll(".kpi").data(tiles).join("div").attr("class", "kpi");
  tileSelection.append("div").attr("class", "kpi__value");
  tileSelection.append("div").attr("class", "kpi__label").text((tile) => tile.label);

  /** Update the tiles from the aggregated selection, counting up to the new values. */
  function update(selected) {
    const values = {
      events: [selected.eventCount, formatCount],
      significant: [selected.significant, formatCount],
      damage: [selected.damageTotal, formatMoney],
      reported: [selected.eventCount ? selected.damageReported / selected.eventCount : NaN, formatPercent],
      measured: [selected.windEvents ? selected.windMeasured / selected.windEvents : NaN, formatPercent],
    };
    tileSelection.select(".kpi__value").transition().duration(650).ease(d3.easeCubicOut)
      .tween("text", function (tile) {
        const [target, format] = values[tile.key];
        if (Number.isNaN(target)) { this.textContent = "—"; return () => {}; }
        const start = this.__value ?? 0;
        const interpolate = d3.interpolateNumber(start, target);
        this.__value = target;
        return (t) => { this.textContent = format(interpolate(t)); };
      });
  }
  return { update };
}
