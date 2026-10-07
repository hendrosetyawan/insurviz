/**
 * scatter.js  ·  View 2: hazard vs insurance outcome (RQ2, RQ4)
 * ---------------------------------------------------------------------------
 * One dot per county. Log axes by default (both variables are heavily
 * skewed). A least-squares line in log–log space and its ±1.5 SD residual
 * band show the general relationship; dots outside the band are outlined.
 * Dots are coloured by the baseline ratio (red = above expectation).
 * Click = focus · Shift-click = compare. Counties with a small policy base
 * are drawn hollow.
 */

import { ANOMALY_Z, COMPARE_COLORS, METRICS, SCATTER_X, SCATTER_Y } from "../config.js";
import { metric } from "../format.js";
import { TOOLTIP_KEYS, countyTooltip, hideTooltip, showTooltip } from "./common.js";

export function createScatter(container, data, { onFocus, onTogglePin, onAxes }) {
  const root = d3.select(container);
  const controls = root.append("div").attr("class", "view-controls");
  const xSel = controls.append("label").text("X ").append("select");
  const ySel = controls.append("label").text("Y ").append("select");
  const logToggle = controls.append("label").attr("class", "check").html('<input type="checkbox" checked> log axes').select("input");
  xSel.selectAll("option").data(SCATTER_X).join("option").attr("value", (d) => d).text((d) => METRICS[d].label);
  ySel.selectAll("option").data(SCATTER_Y).join("option").attr("value", (d) => d).text((d) => METRICS[d].label + (METRICS[d].unavailable ? " (unavailable)" : ""))
    .property("disabled", (d) => !!METRICS[d].unavailable);
  xSel.on("change", () => onAxes({ scatterX: xSel.property("value") }));
  ySel.on("change", () => onAxes({ scatterY: ySel.property("value") }));
  logToggle.on("change", () => last && update(...last));

  const width = 560, height = 400, margin = { top: 12, right: 14, bottom: 42, left: 62 };
  const iw = width - margin.left - margin.right, ih = height - margin.top - margin.bottom;
  const svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "scatter-svg");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const gx = g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`);
  const gy = g.append("g").attr("class", "axis");
  const band = g.append("path").attr("class", "fit-band");
  const fitLine = g.append("path").attr("class", "fit-line");
  const dotsG = g.append("g");
  const labelsG = g.append("g");
  const xLabel = svg.append("text").attr("class", "axis-title").attr("x", margin.left + iw / 2).attr("y", height - 6).attr("text-anchor", "middle");
  const yLabel = svg.append("text").attr("class", "axis-title").attr("transform", `translate(14,${margin.top + ih / 2}) rotate(-90)`).attr("text-anchor", "middle");
  const note = root.append("div").attr("class", "view-note");
  let last = null;

  function update(state, analysis) {
    last = [state, analysis];
    xSel.property("value", state.scatterX); ySel.property("value", state.scatterY);
    const xk = state.scatterX, yk = state.scatterY, useLog = logToggle.property("checked");
    const pts = data.counties.map((c, i) => ({ c, i, m: analysis.metrics[i], x: analysis.metrics[i][xk], y: analysis.metrics[i][yk] }))
      .filter((d) => d.x != null && d.y != null && Number.isFinite(d.x) && Number.isFinite(d.y) && (!useLog || (d.x > 0 && d.y > 0)));
    const dropped = data.counties.length - pts.length;
    const scaleX = useLog ? d3.scaleLog() : d3.scaleLinear(), scaleY = useLog ? d3.scaleLog() : d3.scaleLinear();
    const x = scaleX.domain(d3.extent(pts, (d) => d.x)).nice().range([0, iw]);
    const y = scaleY.domain(d3.extent(pts, (d) => d.y)).nice().range([ih, 0]);
    // on log axes label only 1-2-5 steps so ticks stay readable
    const logTicks = (scale) => scale.ticks().filter((v) => [1, 2, 5].includes(Math.round(v / 10 ** Math.floor(Math.log10(v)))));
    const ax = d3.axisBottom(x).tickFormat((v) => metric(xk, v)), ay = d3.axisLeft(y).tickFormat((v) => metric(yk, v)).tickSize(-iw);
    if (useLog) { ax.tickValues(logTicks(x)); ay.tickValues(logTicks(y)); } else { ax.ticks(6); ay.ticks(6); }
    gx.call(ax); gy.call(ay);
    xLabel.text(`${METRICS[xk].label} (${METRICS[xk].unit})${useLog ? ", log" : ""}`);
    yLabel.text(`${METRICS[yk].label} (${METRICS[yk].unit})${useLog ? ", log" : ""}`);

    // general relationship: OLS of ty on tx (log–log when log axes are on)
    const tx = (v) => (useLog ? Math.log(v) : v), ty = tx, inv = (v) => (useLog ? Math.exp(v) : v);
    const fitPts = pts.filter((d) => !d.m.smallBase && !d.c.twia);
    const mx = d3.mean(fitPts, (d) => tx(d.x)), my = d3.mean(fitPts, (d) => ty(d.y));
    const slope = d3.sum(fitPts, (d) => (tx(d.x) - mx) * (ty(d.y) - my)) / d3.sum(fitPts, (d) => (tx(d.x) - mx) ** 2);
    const resid = (d) => ty(d.y) - (my + slope * (tx(d.x) - mx));
    const sd = d3.deviation(fitPts, resid);
    const r = d3.sum(fitPts, (d) => (tx(d.x) - mx) * (ty(d.y) - my)) / Math.sqrt(d3.sum(fitPts, (d) => (tx(d.x) - mx) ** 2) * d3.sum(fitPts, (d) => (ty(d.y) - my) ** 2));
    const xs = d3.range(0, 41).map((k) => inv(tx(x.domain()[0]) + (k / 40) * (tx(x.domain()[1]) - tx(x.domain()[0]))));
    const yAt = (xv, off = 0) => y(Math.min(y.domain()[1], Math.max(y.domain()[0], inv(my + slope * (tx(xv) - mx) + off))));
    fitLine.attr("d", d3.line().x((v) => x(v)).y((v) => yAt(v))(xs));
    band.attr("d", d3.area().x((v) => x(v)).y0((v) => yAt(v, -ANOMALY_Z * sd)).y1((v) => yAt(v, ANOMALY_Z * sd))(xs));

    const color = d3.scaleDivergingLog(d3.interpolateRdBu).domain([3, 1, 1 / 3]).clamp(true);
    const pinIdx = (f) => state.pinned.indexOf(f);
    dotsG.selectAll("circle").data(pts, (d) => d.c.fips).join("circle")
      .attr("cx", (d) => x(d.x)).attr("cy", (d) => y(d.y))
      .attr("r", (d) => (d.c.fips === state.focus || pinIdx(d.c.fips) >= 0 ? 6 : 3.6))
      .attr("fill", (d) => (d.m.smallBase ? "white" : d.m.residual ? color(d.m.residual) : "#bbb"))
      .attr("stroke", (d) => (d.c.fips === state.focus ? "#000" : pinIdx(d.c.fips) >= 0 ? COMPARE_COLORS[pinIdx(d.c.fips)] : Math.abs(resid(d)) > ANOMALY_Z * sd ? "#333" : "#999"))
      .attr("stroke-width", (d) => (d.c.fips === state.focus || pinIdx(d.c.fips) >= 0 ? 2.4 : Math.abs(resid(d)) > ANOMALY_Z * sd ? 1.2 : 0.5))
      .on("click", (event, d) => (event.shiftKey ? onTogglePin(d.c.fips) : onFocus(d.c.fips)))
      .on("mousemove", (event, d) => showTooltip(event, countyTooltip(d.c, d.m, [...new Set([xk, yk, ...TOOLTIP_KEYS])])))
      .on("mouseleave", hideTooltip);
    dotsG.selectAll("circle").filter((d) => d.c.fips === state.focus || pinIdx(d.c.fips) >= 0).raise();

    // label focus, comparison counties and the 5 largest outliers from the line
    const outliers = fitPts.slice().sort((a, b) => Math.abs(resid(b)) - Math.abs(resid(a))).slice(0, 5).map((d) => d.c.fips);
    const labelled = pts.filter((d) => d.c.fips === state.focus || pinIdx(d.c.fips) >= 0 || outliers.includes(d.c.fips));
    labelsG.selectAll("text").data(labelled, (d) => d.c.fips).join("text").attr("class", (d) => (d.c.fips === state.focus ? "dot-label focus" : "dot-label"))
      .attr("x", (d) => x(d.x) + 7).attr("y", (d) => y(d.y) + 3).text((d) => d.c.name);

    note.html(`${pts.length} counties shown${dropped ? ` (${dropped} hidden: n/a${useLog ? " or ≤ 0 on a log axis" : ""})` : ""}. Line: least squares${useLog ? " in log–log space" : ""} on counties with ≥ 500 policies outside the TWIA area, r = <b>${r.toFixed(2)}</b>. Band = ±${ANOMALY_Z} SD; outlined dots fall outside it. Fill = baseline ratio (red above, blue below expectation); hollow = small policy base.`);
  }
  return { update };
}
