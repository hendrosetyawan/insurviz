/**
 * timeline.js  ·  R3 Temporal change
 * ---------------------------------------------------------------------------
 * Left: storm reports per year for the selection (stacked by peril, the year
 * window highlighted) with statewide TDI homeowners complaints per year as a
 * line on its own axis: do complaint years follow storm years?
 * Right: the radial "peril clock", month-of-year stacked radial bars.
 * Clicking a year narrows the year filter to it.
 */

import { FIRST_YEAR, PERILS } from "../config.js";
import { formatCount, monthName } from "../format.js";

export function createTimeline(container, { complaints, onPickYear }) {
  const root = d3.select(container).append("div").attr("class", "timeline-row");
  const width = 760, height = 170, margin = { top: 18, right: 44, bottom: 20, left: 40 };
  const innerW = width - margin.left - margin.right, innerH = height - margin.top - margin.bottom;
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "timeline");
  const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const xAxisG = plot.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`);
  const yAxisG = plot.append("g").attr("class", "axis");
  const y2AxisG = plot.append("g").attr("class", "axis axis--complaints").attr("transform", `translate(${innerW},0)`);
  const barsG = plot.append("g");
  const complaintPath = plot.append("path").attr("class", "complaint-line");
  const complaintDots = plot.append("g");
  svg.append("text").attr("class", "axis-label").attr("x", margin.left).attr("y", 10).text("storm reports / yr (selection)");
  svg.append("text").attr("class", "axis-label axis-label--complaints").attr("x", width - 4).attr("y", 10).attr("text-anchor", "end").text("TDI homeowners complaints / yr (statewide)");

  // statewide complaints per year (2015-2025, matching the storm years)
  const complaintsByYear = d3.rollups(complaints.months.map((m, i) => ({ year: +m.slice(0, 4), n: complaints.total[i] })), (v) => d3.sum(v, (d) => d.n), (d) => d.year)
    .filter(([year]) => year >= FIRST_YEAR && year <= 2025).sort((a, b) => a[0] - b[0]);

  // peril clock
  const size = 170, inner = 22, outer = 68;
  const clock = root.append("svg").attr("viewBox", `${-size / 2} ${-size / 2} ${size} ${size}`).attr("class", "clock");
  const sectorsG = clock.append("g");
  const angle = d3.scaleBand().domain(d3.range(12)).range([0, 2 * Math.PI]).padding(0.12);
  clock.append("g").attr("class", "clock__labels").selectAll("text").data(d3.range(12)).join("text")
    .attr("text-anchor", "middle").attr("dy", "0.35em")
    .attr("x", (m) => Math.sin(angle(m) + angle.bandwidth() / 2) * (outer + 9))
    .attr("y", (m) => -Math.cos(angle(m) + angle.bandwidth() / 2) * (outer + 9))
    .text((m) => monthName(m + 1)[0]);
  const centre = clock.append("text").attr("class", "clock__centre").attr("text-anchor", "middle").attr("dy", "0.35em");
  clock.append("circle").attr("r", inner - 3).attr("class", "clock__core");

  function update(selected, state) {
    const years = selected.byYear.map((v, i) => ({ year: FIRST_YEAR + i, values: v, total: v[0] + v[1] + v[2] }));
    const x = d3.scaleBand().domain(years.map((d) => d.year)).range([0, innerW]).padding(0.2);
    const y = d3.scaleLinear().domain([0, d3.max(years, (d) => d.total) || 1]).nice().range([innerH, 0]);
    const y2 = d3.scaleLinear().domain([0, d3.max(complaintsByYear, (d) => d[1]) || 1]).nice().range([innerH, 0]);
    xAxisG.call(d3.axisBottom(x).tickFormat((yr) => `'${String(yr).slice(2)}`).tickSize(0));
    yAxisG.call(d3.axisLeft(y).ticks(3).tickFormat(d3.format("~s")).tickSize(-innerW));
    y2AxisG.call(d3.axisRight(y2).ticks(3).tickFormat(d3.format("~s")));

    const groups = barsG.selectAll("g.year").data(years, (d) => d.year).join("g").attr("class", "year")
      .attr("transform", (d) => `translate(${x(d.year)},0)`)
      .classed("is-dim", (d) => d.year < state.yearFrom || d.year > state.yearTo)
      .on("click", (_, d) => onPickYear(d.year));
    groups.selectAll("rect.hit").data((d) => [d]).join("rect").attr("class", "hit").attr("width", x.bandwidth()).attr("height", innerH).attr("fill", "transparent");
    groups.selectAll("rect.seg").data((d) => {
      let base = 0;
      return d.values.map((value, peril) => { const s = { peril, base, value }; base += value; return s; });
    }).join("rect").attr("class", "seg").attr("width", x.bandwidth()).attr("fill", (s) => PERILS[s.peril].color)
      .transition().duration(400).attr("y", (s) => y(s.base + s.value)).attr("height", (s) => Math.max(0, y(s.base) - y(s.base + s.value)));
    groups.selectAll("title").data((d) => [d]).join("title").text((d) => `${d.year}: ${formatCount(d.total)} storm reports`);

    const cx = (yr) => x(yr) + x.bandwidth() / 2;
    complaintPath.attr("d", d3.line().x((d) => cx(d[0])).y((d) => y2(d[1])).curve(d3.curveMonotoneX)(complaintsByYear));
    complaintDots.selectAll("circle").data(complaintsByYear).join("circle").attr("r", 2.4).attr("class", "complaint-dot")
      .attr("cx", (d) => cx(d[0])).attr("cy", (d) => y2(d[1]))
      .selectAll("title").data((d) => [d]).join("title").text((d) => `${d[0]}: ${formatCount(d[1])} homeowners complaints to TDI`);

    // peril clock (radial bars; sqrt radius keeps areas honest)
    const totals = selected.byMonth.map((m) => m[0] + m[1] + m[2]);
    const radius = d3.scaleRadial().domain([0, d3.max(totals) || 1]).range([inner, outer]);
    const arc = d3.arc().startAngle((d) => angle(d.month)).endAngle((d) => angle(d.month) + angle.bandwidth())
      .innerRadius((d) => radius(d.base)).outerRadius((d) => radius(d.base + d.value)).padAngle(0.01).cornerRadius(1.5);
    const segments = selected.byMonth.flatMap((values, month) => {
      let base = 0;
      return values.map((value, peril) => { const s = { month, peril, base, value }; base += value; return s; });
    });
    sectorsG.selectAll("path").data(segments, (d) => `${d.month}-${d.peril}`).join("path")
      .attr("fill", (d) => PERILS[d.peril].color).transition().duration(500).attr("d", arc);
    const peak = d3.maxIndex(totals);
    centre.text(totals[peak] ? monthName(peak + 1) : "—");
  }
  return { update };
}
