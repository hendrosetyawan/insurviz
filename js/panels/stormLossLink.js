/**
 * stormLossLink.js  ·  Year by year: storm damage vs insured loss
 * ---------------------------------------------------------------------------
 * A mirrored bar chart for the selected county (or Texas): above the axis,
 * each year's share of the period's NOAA-reported property damage; below it,
 * each year's share of the period's TDI paid homeowners losses. Both are
 * shares of their own 2019–2025 total, so there is no dual axis. A connector
 * joins the two bars of each year; years where the shares differ by ≥ 20
 * points are flagged as mismatched (storm year ≠ loss year).
 */

import { LOSS_YEARS } from "../config.js";
import { formatMoney, formatPercent } from "../format.js";

const FLAG = 0.2;

export function createStormLossLink(container, { countyList }) {
  const root = d3.select(container);
  const w = 900, h = 214, m = { top: 16, right: 10, bottom: 26, left: 120 };
  const iw = w - m.left - m.right, ih = h - m.top - m.bottom, mid = ih / 2;
  const svg = root.append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("class", "link-chart");
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
  const x = d3.scaleBand().domain(LOSS_YEARS).range([0, iw]).padding(0.35);
  // one common share scale for both directions (re-set on every update), so bar lengths compare directly
  const yUp = d3.scaleLinear().range([mid, 12]), yDown = d3.scaleLinear().range([mid, ih - 12]);
  g.append("text").attr("class", "link-label link-label--storm").attr("x", -8).attr("y", mid - 20).attr("text-anchor", "end").text("NOAA damage share ▲");
  g.append("text").attr("class", "link-label link-label--loss").attr("x", -8).attr("y", mid + 28).attr("text-anchor", "end").text("TDI paid loss share ▼");
  const connectors = g.append("g"), barsUp = g.append("g"), barsDown = g.append("g"), labels = g.append("g");
  g.append("line").attr("class", "link-axis").attr("x1", 0).attr("x2", iw).attr("y1", mid).attr("y2", mid);
  const years = g.append("g");
  const note = root.append("div").attr("class", "panel__sub");

  // Texas totals per year (sum over counties)
  const texas = LOSS_YEARS.map((yr) => ({
    year: yr,
    noaa: d3.sum(countyList, (c) => c.lossRows.find((r) => r.year === yr)?.noaa_property_damage || 0),
    paid: d3.sum(countyList, (c) => c.lossRows.find((r) => r.year === yr)?.tdi_paid_loss || 0),
  }));

  function update(county) {
    const rows = county ? LOSS_YEARS.map((yr) => { const r = county.lossRows.find((d) => d.year === yr) || {}; return { year: yr, noaa: r.noaa_property_damage ?? null, paid: r.tdi_paid_loss ?? null }; }) : texas;
    const nT = d3.sum(rows, (d) => Math.max(0, d.noaa || 0)), pT = d3.sum(rows, (d) => Math.max(0, d.paid || 0));
    rows.forEach((d) => { d.ns = nT > 0 && d.noaa != null ? Math.max(0, d.noaa) / nT : null; d.ps = pT > 0 && d.paid != null ? Math.max(0, d.paid) / pT : null; d.flag = d.ns != null && d.ps != null && Math.abs(d.ns - d.ps) >= FLAG; });
    const maxShare = d3.max(rows, (d) => Math.max(d.ns || 0, d.ps || 0)) || 1;
    yUp.domain([0, maxShare]); yDown.domain([0, maxShare]);
    const cx = (yr) => x(yr) + x.bandwidth() / 2;
    barsUp.selectAll("rect").data(rows).join("rect").attr("class", "bar-storm").attr("x", (d) => x(d.year)).attr("width", x.bandwidth())
      .transition().duration(400).attr("y", (d) => yUp(d.ns || 0)).attr("height", (d) => mid - yUp(d.ns || 0));
    barsDown.selectAll("rect").data(rows).join("rect").attr("class", "bar-loss").attr("x", (d) => x(d.year)).attr("width", x.bandwidth())
      .transition().duration(400).attr("y", mid).attr("height", (d) => yDown(d.ps || 0) - mid);
    connectors.selectAll("line").data(rows).join("line").attr("class", (d) => `connector${d.flag ? " is-flag" : ""}`)
      .attr("x1", (d) => cx(d.year)).attr("x2", (d) => cx(d.year)).attr("y1", (d) => yUp(d.ns || 0) - 2).attr("y2", (d) => yDown(d.ps || 0) + 2);
    labels.selectAll("text").data(rows.flatMap((d) => [
      { x: cx(d.year), y: yUp(d.ns || 0) - 4, t: d.ns == null ? "n/a" : formatPercent(d.ns) },
      { x: cx(d.year), y: yDown(d.ps || 0) + 10, t: d.ps == null ? "n/a" : formatPercent(d.ps) }])).join("text").attr("class", "share-label")
      .attr("x", (d) => d.x).attr("y", (d) => d.y).attr("text-anchor", "middle").text((d) => d.t);
    years.selectAll("text").data(rows).join("text").attr("class", (d) => `year-tag${d.flag ? " is-flag" : ""}`)
      .attr("x", (d) => cx(d.year)).attr("y", ih + 18).attr("text-anchor", "middle").text((d) => String(d.year))
      .selectAll("title").data((d) => [d]).join("title").text((d) => `${d.year}: NOAA damage ${formatMoney(d.noaa)} · TDI paid ${formatMoney(d.paid)}`);
    const flagged = rows.filter((d) => d.flag).map((d) => d.year);
    note.html(`<b>${county ? `${county.name} County` : "All of Texas"}</b>: NOAA-reported damage ${formatMoney(nT)} vs TDI paid homeowners losses ${formatMoney(pT)} over 2019–2025. ${flagged.length ? `Mismatched years (share gap ≥ ${FLAG * 100} pts): <b>${flagged.join(", ")}</b>.` : "No year differs by 20+ points."} Shares of each source's own total; NOAA damage is an estimate, not insured loss.`);
  }
  return { update };
}
