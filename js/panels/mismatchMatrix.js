/**
 * mismatchMatrix.js  ·  Storm ↔ insurance mismatch matrix
 * ---------------------------------------------------------------------------
 * The view that connects hazard and insured loss directly. Every county is a
 * dot: x = Texas percentile of storm hazard (reports per 1,000 km² per year),
 * y = Texas percentile of TDI paid loss per policy (2019–2025). On the
 * diagonal, hazard and insured loss agree; far above it, insured losses are
 * higher than the storm record suggests; far below, storms are frequent but
 * insured losses are low. The largest disagreements are labelled and listed.
 */

import { formatMoney } from "../format.js";

const BAND = 30; // |insurance pct − hazard pct| ≥ BAND points = mismatch

export function createMismatchMatrix(container, { countyList, onSelectCounty, onHover }) {
  const root = d3.select(container);
  const size = 300, m = { top: 10, right: 10, bottom: 34, left: 38 };
  const iw = size - m.left - m.right, ih = size - m.top - m.bottom;
  const svg = root.append("svg").attr("viewBox", `0 0 ${size} ${size}`).attr("class", "matrix");
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
  const x = d3.scaleLinear().domain([0, 100]).range([0, iw]), y = d3.scaleLinear().domain([0, 100]).range([ih, 0]);

  // mismatch zones and diagonal
  g.append("path").attr("class", "zone zone--ins").attr("d", `M${x(0)},${y(BAND)} L${x(100 - BAND)},${y(100)} L${x(0)},${y(100)} Z`);
  g.append("path").attr("class", "zone zone--haz").attr("d", `M${x(BAND)},${y(0)} L${x(100)},${y(100 - BAND)} L${x(100)},${y(0)} Z`);
  g.append("line").attr("class", "diag").attr("x1", x(0)).attr("y1", y(0)).attr("x2", x(100)).attr("y2", y(100));
  g.append("text").attr("class", "zone-label zone-label--ins").attr("x", 4).attr("y", 12).text("Insured loss > hazard");
  g.append("text").attr("class", "zone-label zone-label--haz").attr("x", iw - 4).attr("y", y(100 - BAND) + 14).attr("text-anchor", "end").text("Hazard > insured loss");
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(5).tickFormat((d) => `${d}`));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${d}`));
  svg.append("text").attr("class", "axis-label").attr("x", m.left + iw / 2).attr("y", size - 4).attr("text-anchor", "middle").text("Storm hazard percentile (NOAA reports per 1,000 km²) →");
  svg.append("text").attr("class", "axis-label").attr("transform", `translate(10,${m.top + ih / 2}) rotate(-90)`).attr("text-anchor", "middle").text("TDI paid loss per policy percentile →");
  const dotsG = g.append("g"), labelsG = g.append("g");
  const list = root.append("div").attr("class", "mismatch-list");

  function update(values, selectedFips) {
    const pts = countyList.map((c, i) => ({ c, i, v: values[i] })).filter((d) => d.v.mismatch != null);
    const color = (mm) => (mm >= BAND ? "#f97316" : mm <= -BAND ? "#60a5fa" : "#5b6770");
    dotsG.selectAll("circle").data(pts, (d) => d.c.fips).join("circle")
      .attr("cx", (d) => x(d.v.hazardPct)).attr("cy", (d) => y(d.v.insurancePct))
      .attr("r", (d) => (d.c.fips === selectedFips ? 5.5 : Math.abs(d.v.mismatch) >= BAND ? 3.4 : 2.4))
      .attr("fill", (d) => color(d.v.mismatch)).attr("stroke", (d) => (d.c.fips === selectedFips ? "#fff" : "none")).attr("stroke-width", 1.5)
      .attr("opacity", (d) => (Math.abs(d.v.mismatch) >= BAND || d.c.fips === selectedFips ? 0.95 : 0.45))
      .on("click", (_, d) => onSelectCounty(d.c.fips))
      .on("mousemove", (event, d) => onHover(d.i, event)).on("mouseleave", () => onHover(null));
    dotsG.selectAll("circle").filter((d) => d.c.fips === selectedFips).raise();

    const top = pts.slice().sort((a, b) => Math.abs(b.v.mismatch) - Math.abs(a.v.mismatch));
    const labelled = top.slice(0, 6).concat(pts.filter((d) => d.c.fips === selectedFips));
    labelsG.selectAll("text").data(labelled, (d) => d.c.fips).join("text").attr("class", "dot-name")
      .attr("x", (d) => x(d.v.hazardPct) + 5).attr("y", (d) => y(d.v.insurancePct) + 3).text((d) => d.c.name);

    const above = top.filter((d) => d.v.mismatch >= BAND).slice(0, 4), below = top.filter((d) => d.v.mismatch <= -BAND).slice(0, 4);
    const row = (d) => `<li data-f="${d.c.fips}"><b>${d.c.name}</b> <span>${Math.round(d.v.hazardPct)} → ${Math.round(d.v.insurancePct)}</span> <em>${formatMoney(d.v.lossPerPolicy)}/policy</em></li>`;
    list.html(`<div><h4 class="ins">Insured loss &gt; hazard</h4><ul>${above.map(row).join("")}</ul></div>
      <div><h4 class="haz">Hazard &gt; insured loss</h4><ul>${below.map(row).join("")}</ul></div>
      <p class="panel__sub">${top.filter((d) => Math.abs(d.v.mismatch) >= BAND).length} of ${pts.length} counties differ by ≥ ${BAND} percentile points (hazard pct. → insured-loss pct.). Coastal TWIA counties exclude TWIA wind/hail losses, which lowers their insured percentile.</p>`);
    list.selectAll("li").on("click", function () { onSelectCounty(+this.dataset.f); });
  }
  return { update };
}
