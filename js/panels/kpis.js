/**
 * kpis.js
 * ---------------------------------------------------------------------------
 * Header tiles for the current selection, one or two per lens, counting up
 * to their new values on every change.
 */

import { LENSES } from "../config.js";
import { formatCount, formatMoney } from "../format.js";

const TILES = [
  { key: "paidLoss", lens: "losses", label: "TDI paid losses / yr", format: formatMoney },
  { key: "lossPerPolicy", lens: "losses", label: "Paid loss / policy", format: formatMoney },
  { key: "premium", lens: "market", label: "Avg premium (latest)", format: formatMoney },
  { key: "pif", lens: "market", label: "HO policies in force", format: formatCount },
  { key: "nonrenewal", lens: "market", label: "Nonrenewals / 1k HO", format: (v) => d3.format(".1f")(v) },
  { key: "propertyValue", lens: "exposure", label: "Census property value", format: formatMoney },
  { key: "reports", lens: "hazard", label: "Storm reports", format: formatCount },
  { key: "noaaDamage", lens: "hazard", label: "NOAA damage (est.)", format: formatMoney },
];

export function createKpis(container) {
  const tiles = d3.select(container).selectAll(".kpi").data(TILES).join("div").attr("class", "kpi")
    .style("--lens", (t) => LENSES[t.lens].color);
  tiles.append("div").attr("class", "kpi__value");
  tiles.append("div").attr("class", "kpi__label").text((t) => t.label);

  function update(selected) {
    const values = {
      reports: selected.eventCount, noaaDamage: selected.damageTotal, propertyValue: selected.propertyValue,
      pif: selected.pifHomeowners, nonrenewal: selected.nonrenewalRate, premium: selected.premium,
      paidLoss: selected.paidLoss, lossPerPolicy: selected.lossPerPolicy,
    };
    tiles.select(".kpi__value").transition().duration(650).ease(d3.easeCubicOut).tween("text", function (tile) {
      const target = values[tile.key];
      if (target == null || !Number.isFinite(target)) { this.textContent = "—"; return () => {}; }
      const interpolate = d3.interpolateNumber(this.__value ?? 0, target);
      this.__value = target;
      return (t) => { this.textContent = tile.format(interpolate(t)); };
    });
  }
  return { update, formatMoney };
}
