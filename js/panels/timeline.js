/**
 * timeline.js  ·  R3 Temporal change
 * ---------------------------------------------------------------------------
 * Year-by-year stacked bars (metric by peril) for the selected region, with
 * the active year window highlighted, plus a radial "peril clock": twelve
 * month sectors whose stacked radial bars show the season of each peril.
 * Clicking a year narrows the year filter to that year.
 */

import { PERILS } from "../config.js";
import { formatMetric, monthName } from "../format.js";

export function createTimeline(container, { firstYear, onPickYear }) {
  const root = d3.select(container);
  const width = 300, height = 112, margin = { top: 6, right: 4, bottom: 18, left: 34 };
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "timeline");
  const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const innerW = width - margin.left - margin.right, innerH = height - margin.top - margin.bottom;
  const xAxisG = plot.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`);
  const yAxisG = plot.append("g").attr("class", "axis");
  const barsG = plot.append("g");

  // radial peril clock (month of year)
  const clockSize = 190, innerRadius = 24, outerRadius = 76;
  const clockRow = root.append("div").attr("class", "clock-row");
  const clock = clockRow.append("svg").attr("viewBox", `${-clockSize / 2} ${-clockSize / 2} ${clockSize} ${clockSize}`).attr("class", "clock");
  const clockNote = clockRow.append("div").attr("class", "clock-note");
  const sectorsG = clock.append("g");
  const monthAngle = d3.scaleBand().domain(d3.range(12)).range([0, 2 * Math.PI]).padding(0.12);
  clock.append("g").attr("class", "clock__labels").selectAll("text").data(d3.range(12)).join("text")
    .attr("text-anchor", "middle").attr("dy", "0.35em")
    .attr("x", (m) => Math.sin(monthAngle(m) + monthAngle.bandwidth() / 2) * (outerRadius + 8))
    .attr("y", (m) => -Math.cos(monthAngle(m) + monthAngle.bandwidth() / 2) * (outerRadius + 8))
    .text((m) => monthName(m + 1)[0]);
  const clockCentre = clock.append("text").attr("class", "clock__centre").attr("text-anchor", "middle").attr("dy", "0.35em");
  clock.append("circle").attr("r", innerRadius - 3).attr("class", "clock__core");

  function update(selected, state) {
    const years = selected.byYear.map((values, i) => ({ year: firstYear + i, values, total: values[0] + values[1] + values[2] }));
    const x = d3.scaleBand().domain(years.map((d) => d.year)).range([0, innerW]).padding(0.18);
    const y = d3.scaleLinear().domain([0, d3.max(years, (d) => d.total) || 1]).nice().range([innerH, 0]);
    xAxisG.call(d3.axisBottom(x).tickValues(x.domain().filter((yr) => yr % 2 === 1)).tickFormat((yr) => `'${String(yr).slice(2)}`).tickSize(0));
    yAxisG.call(d3.axisLeft(y).ticks(3).tickFormat((v) => formatMetric(state.metric, v)).tickSize(-innerW));

    const yearGroups = barsG.selectAll("g.year").data(years, (d) => d.year).join("g").attr("class", "year")
      .attr("transform", (d) => `translate(${x(d.year)},0)`)
      .classed("is-dim", (d) => d.year < state.yearFrom || d.year > state.yearTo)
      .on("click", (_, d) => onPickYear(d.year));
    yearGroups.selectAll("rect.hit").data((d) => [d]).join("rect").attr("class", "hit")
      .attr("width", x.bandwidth()).attr("height", innerH).attr("fill", "transparent");
    yearGroups.selectAll("rect.seg").data((d) => {
      let base = 0;
      return d.values.map((value, peril) => { const seg = { peril, base, value }; base += value; return seg; });
    }).join("rect").attr("class", "seg").attr("width", x.bandwidth()).attr("fill", (s) => PERILS[s.peril].color)
      .transition().duration(400)
      .attr("y", (s) => y(s.base + s.value)).attr("height", (s) => Math.max(0, y(s.base) - y(s.base + s.value)));
    yearGroups.selectAll("title").data((d) => [d]).join("title").text((d) => `${d.year}: ${formatMetric(state.metric, d.total)}`);

    // peril clock: stacked radial bars per month (square-root radius = honest area)
    const monthTotals = selected.byMonth.map((m) => m[0] + m[1] + m[2]);
    const radius = d3.scaleRadial().domain([0, d3.max(monthTotals) || 1]).range([innerRadius, outerRadius]);
    const arc = d3.arc().startAngle((d) => monthAngle(d.month)).endAngle((d) => monthAngle(d.month) + monthAngle.bandwidth())
      .innerRadius((d) => radius(d.base)).outerRadius((d) => radius(d.base + d.value)).padAngle(0.01).cornerRadius(1.5);
    const segments = selected.byMonth.flatMap((values, month) => {
      let base = 0;
      return values.map((value, peril) => { const seg = { month, peril, base, value }; base += value; return seg; });
    });
    sectorsG.selectAll("path").data(segments, (d) => `${d.month}-${d.peril}`).join("path")
      .attr("fill", (d) => PERILS[d.peril].color).attr("fill-opacity", 0.92)
      .transition().duration(500).attr("d", arc);
    const peak = d3.maxIndex(monthTotals);
    clockCentre.text(monthTotals[peak] ? monthName(peak + 1) : "—");
    clockNote.html(`<b>Peril clock</b>${state.yearFrom === state.yearTo ? state.yearFrom : `${state.yearFrom}–${state.yearTo}`}<br>
      Peak month: <b>${monthTotals[peak] ? monthName(peak + 1) : "—"}</b><br>
      ${PERILS.map((p, i) => { const m = d3.maxIndex(selected.byMonth, (row) => row[i]); return `<span class="swatch" style="background:${p.color}"></span>${p.label.split(" ")[0]} peaks ${selected.byMonth[m][i] ? monthName(m + 1) : "—"}`; }).join("<br>")}`);
  }
  return { update };
}
