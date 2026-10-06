/**
 * aggregate.js
 * ---------------------------------------------------------------------------
 * Turns the filtered events into the numbers every view needs:
 *  - per hexagon, per peril values (3D columns, R1/R2)
 *  - per state values (R1 ranking)
 *  - the selection's peril mix, yearly and monthly values (R2, R3)
 *  - the selection's most damaging events (R4)
 */

import { HEX, SIGNIFICANT } from "./config.js";

const PERIL_COUNT = 3;

/* ------------------------------------------------------------------ hexbin */

/**
 * Pointy-top hexagon binning (same arithmetic as d3-hexbin).
 * Returns the bin centres and, for every event, the index of its bin.
 */
export function buildHexBins(events, radius = HEX.radius) {
  const dx = radius * 2 * Math.sin(Math.PI / 3);
  const dy = radius * 1.5;
  const { x, y, onMap } = events.columns;
  const binIndex = new Int32Array(events.count).fill(-1);
  const keyToBin = new Map();
  const centers = [];

  for (let i = 0; i < events.count; i++) {
    if (!onMap[i]) continue;
    let py = y[i] / dy, pj = Math.round(py);
    let px = x[i] / dx - (pj & 1) / 2, pi = Math.round(px);
    const py1 = py - pj;
    if (Math.abs(py1) * 3 > 1) {
      const px1 = px - pi;
      const pi2 = pi + (px < pi ? -1 : 1) / 2;
      const pj2 = pj + (py < pj ? -1 : 1);
      const px2 = px - pi2, py2 = py - pj2;
      if (px1 * px1 + py1 * py1 > px2 * px2 + py2 * py2) { pi = pi2 + (pj & 1 ? 1 : -1) / 2; pj = pj2; }
    }
    const key = `${pi},${pj}`;
    let bin = keyToBin.get(key);
    if (bin === undefined) {
      bin = centers.length;
      keyToBin.set(key, bin);
      centers.push({ x: (pi + (pj & 1) / 2) * dx, y: pj * dy });
    }
    binIndex[i] = bin;
  }
  return { centers, binIndex, radius };
}

/* -------------------------------------------------------------- filtering */

/** Value one event contributes to the chosen metric. */
function metricValue(metric, peril, magnitude, damage) {
  if (metric === "events") return 1;
  if (metric === "damage") return damage > 0 ? damage : 0;
  // significant events
  if (peril === 2) return 1;
  if (peril === 0) return magnitude >= SIGNIFICANT.hailInches * 100 ? 1 : 0;
  return magnitude >= SIGNIFICANT.windKnots ? 1 : 0;
}

/** Does the event pass the peril and year filters? */
function passesFilters(state, peril, yearOffset, firstYear) {
  const year = firstYear + yearOffset;
  return state.perils[peril] && year >= state.yearFrom && year <= state.yearTo;
}

/** Is the event inside the current selection (all / one hexagon / one state)? */
function inSelection(selection, binOfEvent, stateOfEvent) {
  if (selection.type === "hex") return binOfEvent === selection.id;
  if (selection.type === "state") return stateOfEvent === selection.fips;
  return true;
}

/* ------------------------------------------------------------ aggregation */

/**
 * One pass over all events -> every number the views need.
 * `visibility` (one float per event) is filled for the particle light map:
 * 1 = passes the filters and is in the selection, 0.22 = passes the filters
 * but is outside the selection, 0 = filtered out.
 * @returns {{hexValues, hexMax, stateValues, selection, highlights}}
 */
export function aggregate(events, bins, state, { eventTableRows, highlightCount, visibility }) {
  const { peril, year, month, mag, damage, county, measured } = events.columns;
  const firstYear = events.meta.firstYear;
  const yearCount = events.meta.lastYear - firstYear + 1;

  const hexValues = new Float64Array(bins.centers.length * PERIL_COUNT);
  const stateValues = new Map(); // fips -> [hail, wind, tornado]
  const selected = {
    byPeril: [0, 0, 0],
    eventsByPeril: [0, 0, 0],
    damageByPeril: [0, 0, 0],
    byYear: Array.from({ length: yearCount }, () => [0, 0, 0]),
    byMonth: Array.from({ length: 12 }, () => [0, 0, 0]),
    eventCount: 0, damageTotal: 0, damageReported: 0, significant: 0,
    windEvents: 0, windMeasured: 0,
    topEvents: [],
  };

  /** Keep the N largest {index, damage} items in a small sorted list. */
  const makeTopList = (list, size) => (index, value) => {
    if (list.length === size && value <= list[list.length - 1].damage) return;
    list.push({ index, damage: value });
    list.sort((a, b) => b.damage - a.damage);
    if (list.length > size) list.pop();
  };
  const pushTop = makeTopList(selected.topEvents, eventTableRows);
  const highlights = []; // most damaging events in the filters, whole map (shockwaves, ticker)
  const pushHighlight = makeTopList(highlights, highlightCount);
  visibility.fill(0);

  for (let i = 0; i < events.count; i++) {
    const p = peril[i];
    if (!state.perils[p]) continue;
    const value = metricValue(state.metric, p, mag[i], damage[i]);
    const bin = bins.binIndex[i];
    const stateFips = Math.floor(county[i] / 1000);
    const selectedEvent = inSelection(state.selection, bin, stateFips);

    // the yearly series ignores the year window, so R3 can show every year (dimming the rest)
    if (selectedEvent) selected.byYear[year[i]][p] += value;
    if (!passesFilters(state, p, year[i], firstYear)) continue;
    visibility[i] = selectedEvent ? 1 : 0.22;
    if (damage[i] > 0) pushHighlight(i, damage[i]);

    if (bin >= 0) hexValues[bin * PERIL_COUNT + p] += value;
    let stateRow = stateValues.get(stateFips);
    if (!stateRow) { stateRow = [0, 0, 0]; stateValues.set(stateFips, stateRow); }
    stateRow[p] += value;

    if (!selectedEvent) continue;
    selected.byPeril[p] += value;
    selected.eventsByPeril[p] += 1;
    selected.byMonth[month[i] - 1][p] += value;
    selected.eventCount += 1;
    if (damage[i] >= 0) selected.damageReported += 1;
    if (damage[i] > 0) { selected.damageTotal += damage[i]; selected.damageByPeril[p] += damage[i]; pushTop(i, damage[i]); }
    if (metricValue("significant", p, mag[i], 0)) selected.significant += 1;
    if (p === 1) { selected.windEvents += 1; selected.windMeasured += measured[i]; }
  }

  let hexMax = 0;
  for (let b = 0; b < bins.centers.length; b++) {
    const total = hexValues[b * 3] + hexValues[b * 3 + 1] + hexValues[b * 3 + 2];
    if (total > hexMax) hexMax = total;
  }
  return { hexValues, hexMax, stateValues, selection: selected, highlights };
}
