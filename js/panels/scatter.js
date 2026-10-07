/**
 * scatter.js  ·  lens-vs-lens scatterplot
 * ---------------------------------------------------------------------------
 * Every county as a dot: x = the prism-height metric, y = the prism-colour
 * metric, size = owner-occupied homes. Axes are oriented so up and right
 * always mean more risk (metrics where lower is riskier run reversed).
 * Dashed lines at the Texas medians split
 * the plot into four quadrants (e.g. "high hazard · high nonrenewals").
 * Drag a box to select a group of counties in every view; click a dot to
 * select one county. Spearman's rank correlation is shown for context.
 */

import { METRICS } from "../config.js";
import { formatMetric } from "../format.js";

/** Spearman rank correlation of paired arrays (no NaNs). */
function spearman(xs, ys) {
  const rank = (a) => { const order = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); order.forEach(([, i], k) => { r[i] = k; }); return r; };
  const rx = rank(xs), ry = rank(ys);
  const mx = d3.mean(rx), my = d3.mean(ry);
  const num = d3.sum(rx, (v, i) => (v - mx) * (ry[i] - my));
  return num / Math.sqrt(d3.sum(rx, (v) => (v - mx) ** 2) * d3.sum(ry, (v) => (v - my) ** 2));
}

export function createScatter(container, { onBrush, onPick, onHover }) {
  const width = 330, height = 250, margin = { top: 10, right: 10, bottom: 34, left: 44 };
  const innerW = width - margin.left - margin.right, innerH = height - margin.top - margin.bottom;
  const root = d3.select(container);
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "scatter");
  const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const xAxisG = plot.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`);
  const yAxisG = plot.append("g").attr("class", "axis");
  const xLabel = svg.append("text").attr("class", "axis-label").attr("x", margin.left + innerW / 2).attr("y", height - 4).attr("text-anchor", "middle");
  const yLabel = svg.append("text").attr("class", "axis-label").attr("transform", `translate(11,${margin.top + innerH / 2}) rotate(-90)`).attr("text-anchor", "middle");
  const medians = plot.append("g").attr("class", "medians");
  const quadrant = plot.append("text").attr("class", "quadrant-label").attr("x", innerW - 4).attr("y", 10).attr("text-anchor", "end");
  const dotsG = plot.append("g");
  const brushG = plot.append("g").attr("class", "brush");
  const note = root.append("div").attr("class", "panel__sub scatter-note");

  let currentPoints = [];
  const brush = d3.brush().extent([[0, 0], [innerW, innerH]]).on("end", ({ selection }) => {
    if (!selection) return; // cleared by a click: handled by the dot click / background
    const [[x0, y0], [x1, y1]] = selection;
    const picked = currentPoints.filter((p) => p.px >= x0 && p.px <= x1 && p.py >= y0 && p.py <= y1).map((p) => p.fips);
    brushG.call(brush.move, null);
    if (picked.length) onBrush(picked);
  });
  brushG.call(brush);

  function update({ countyList, values, xMetric, yMetric, colorOf, selectedSet }) {
    const points = countyList.map((c, i) => ({ fips: c.fips, name: c.name, index: i, x: values[i][xMetric], y: values[i][yMetric], size: c.data.ownerUnits || 0 }))
      .filter((p) => p.x != null && p.y != null && Number.isFinite(p.x) && Number.isFinite(p.y));
    // symlog x when the metric is a count or strongly right-skewed (p99 far above the median)
    const xs = points.map((p) => p.x).sort(d3.ascending);
    const skewed = (d3.quantile(xs, 0.99) || 0) > 5 * (d3.median(xs) || 0);
    const logX = (METRICS[xMetric].scale === "sqrt" || skewed) && xs[0] >= 0;
    const x = (logX ? d3.scaleSymlog().constant(d3.quantile(xs, 0.25) || 0.01) : d3.scaleLinear())
      .domain(d3.extent(points, (p) => p.x)).nice().range(METRICS[xMetric].risk === "low" ? [innerW, 0] : [0, innerW]);
    const yVals = points.map((p) => p.y).sort(d3.ascending);
    const y = d3.scaleLinear().domain([d3.min(yVals), d3.quantile(yVals, 0.99)]).nice()
      .range(METRICS[yMetric].risk === "low" ? [0, innerH] : [innerH, 0]).clamp(true);
    const r = d3.scaleSqrt().domain([0, d3.max(points, (p) => p.size) || 1]).range([1.6, 11]);
    xAxisG.call(d3.axisBottom(x).ticks(4, logX ? "~s" : undefined).tickFormat((v) => formatMetric(xMetric, v)));
    yAxisG.call(d3.axisLeft(y).ticks(4).tickFormat((v) => formatMetric(yMetric, v)).tickSize(-innerW));
    const riskier = (m) => (METRICS[m].risk === "low" ? " (reversed)" : "");
    xLabel.text(`${METRICS[xMetric].label}${riskier(xMetric)} →`);
    yLabel.text(`${METRICS[yMetric].label}${riskier(yMetric)} →`);

    const mx = d3.median(points, (p) => p.x), my = d3.median(points, (p) => p.y);
    medians.selectAll("line").data([[x(mx), 0, x(mx), innerH], [0, y(my), innerW, y(my)]]).join("line")
      .attr("x1", (d) => d[0]).attr("y1", (d) => d[1]).attr("x2", (d) => d[2]).attr("y2", (d) => d[3]);
    quadrant.text("↗ riskier on both lenses");

    points.forEach((p) => { p.px = x(p.x); p.py = y(p.y); });
    currentPoints = points;
    dotsG.selectAll("circle").data(points.sort((a, b) => b.size - a.size), (p) => p.fips).join("circle")
      .attr("fill", (p) => colorOf(p.index)).attr("stroke", (p) => (selectedSet && selectedSet.has(p.fips) ? "#fff" : "#05080d"))
      .attr("stroke-width", (p) => (selectedSet && selectedSet.has(p.fips) ? 1.6 : 0.5))
      .attr("opacity", (p) => (!selectedSet || selectedSet.has(p.fips) ? 0.92 : 0.25))
      .on("click", (event, p) => { event.stopPropagation(); onPick(p.fips); })
      .on("mousemove", (event, p) => onHover(p.index, event))
      .on("mouseleave", () => onHover(null))
      .transition().duration(500).attr("cx", (p) => p.px).attr("cy", (p) => p.py).attr("r", (p) => r(p.size));
    dotsG.raise();

    const rho = points.length > 5 ? spearman(points.map((p) => p.x), points.map((p) => p.y)) : NaN;
    note.html(`${points.length} counties · Spearman ρ = <b>${Number.isFinite(rho) ? rho.toFixed(2) : "—"}</b> (rank association, not causation). Drag a box to select counties.`);
  }
  return { update };
}
