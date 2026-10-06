/**
 * main.js
 * ---------------------------------------------------------------------------
 * Loads the data, builds every view, and links them through one store:
 * any filter or selection change re-aggregates the events once and pushes
 * the result to the 3D map and the R1–R4 panels.
 */

import { DEFAULT_VIEW_MODE, METRICS, PANELS, PERILS, PLAYBACK_MS, VIEW_MODES } from "./config.js";
import { loadAll } from "./data.js";
import { createStore } from "./state.js";
import { aggregate, buildHexBins } from "./aggregate.js";
import { formatMetric, formatCount } from "./format.js";
import { createStormScene } from "./scene/stormScene.js";
import { createKpis } from "./panels/kpis.js";
import { createRanking } from "./panels/ranking.js";
import { createComposition } from "./panels/composition.js";
import { createTimeline } from "./panels/timeline.js";
import { createEventTable } from "./panels/eventTable.js";
import { createTicker } from "./panels/ticker.js";

const $ = (selector) => document.querySelector(selector);

/** The state each hexagon mostly falls in (for tooltips and labels). */
function majorityStatePerBin(events, bins) {
  const counts = new Map();
  const { county } = events.columns;
  for (let i = 0; i < events.count; i++) {
    const bin = bins.binIndex[i];
    if (bin < 0) continue;
    const key = bin * 100 + Math.floor(county[i] / 1000);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const best = new Int32Array(bins.centers.length);
  const bestCount = new Int32Array(bins.centers.length);
  for (const [key, count] of counts) {
    const bin = Math.floor(key / 100);
    if (count > bestCount[bin]) { bestCount[bin] = count; best[bin] = key % 100; }
  }
  return best;
}

async function start() {
  const data = await loadAll();
  const { events } = data;
  const firstYear = events.meta.firstYear, lastYear = events.meta.lastYear;
  const bins = buildHexBins(events);
  const binState = majorityStatePerBin(events, bins);
  const store = createStore(firstYear, lastYear);
  let latest = null; // last aggregation result (used by the tooltip)
  const visibility = new Float32Array(events.count); // per-event brightness for the light map

  /* ---------- views */
  const tooltip = $("#tooltip");
  const scene = createStormScene($("#scene"), {
    states: data.states, bins, events,
    onHover: (binId, event) => {
      if (binId == null || !latest) { tooltip.hidden = true; return; }
      const values = Array.from(latest.hexValues.subarray(binId * 3, binId * 3 + 3));
      const metric = store.get().metric;
      tooltip.hidden = false;
      tooltip.style.left = `${event.clientX + 14}px`;
      tooltip.style.top = `${event.clientY + 14}px`;
      tooltip.innerHTML = `<b>${data.stateNames.get(binState[binId]) || "—"}</b> · ${METRICS[metric].label}
        <div class="tooltip__total">${formatMetric(metric, values[0] + values[1] + values[2])}</div>
        ${PERILS.map((p, i) => `<div><span class="swatch" style="background:${p.color}"></span>${p.label}: ${formatMetric(metric, values[i])}</div>`).join("")}
        <div class="tooltip__hint">Click to select this cell</div>`;
    },
    onSelect: (binId) => {
      store.set({ selection: binId == null ? { type: "all" } : { type: "hex", id: binId }, focusEvent: null });
    },
  });

  const kpis = createKpis($("#kpis"));
  const ranking = createRanking($("#panel-r1 .panel__body"), {
    stateNames: data.stateNames, statePopulation: data.statePopulation,
    onSelectState: (fips) => store.set({ selection: { type: "state", fips }, focusEvent: null }),
  });
  const composition = createComposition($("#panel-r2 .panel__body"));
  const timeline = createTimeline($("#panel-r3 .panel__body"), {
    firstYear, onPickYear: (year) => { stopPlayback(); store.set({ yearFrom: year, yearTo: year }); syncYearInputs(); },
  });
  const eventTable = createEventTable($("#panel-r4 .panel__body"), {
    events, details: data.details, stateNames: data.stateNames, countyNames: data.countyNames,
    onFocusEvent: (index) => store.set({ focusEvent: store.get().focusEvent === index ? null : index }),
  });

  const ticker = createTicker($("#ticker"), { events, stateNames: data.stateNames });

  /* ---------- controls */
  // 3D view mode + auto-orbit
  const viewSelect = $("#view-mode");
  viewSelect.innerHTML = Object.entries(VIEW_MODES).map(([key, m]) => `<option value="${key}">${m.label}</option>`).join("");
  // a shareable start view, e.g. ?view=lights
  const requestedView = new URLSearchParams(location.search).get("view");
  viewSelect.value = VIEW_MODES[requestedView] ? requestedView : DEFAULT_VIEW_MODE;
  viewSelect.addEventListener("change", () => scene.setViewMode(viewSelect.value));
  scene.setViewMode(viewSelect.value);
  const orbitButton = $("#orbit");
  const setOrbit = (on) => { scene.setAutoRotate(on); orbitButton.classList.toggle("is-on", on); };
  orbitButton.addEventListener("click", () => setOrbit(!orbitButton.classList.contains("is-on")));
  scene.onAutoRotateStop(() => orbitButton.classList.remove("is-on"));
  setOrbit(true);

  // metric
  const metricSelect = $("#metric");
  metricSelect.innerHTML = Object.entries(METRICS).map(([key, m]) => `<option value="${key}">${m.label}</option>`).join("");
  metricSelect.addEventListener("change", () => store.set({ metric: metricSelect.value }));

  // peril toggles
  d3.select("#perils").selectAll("button").data(PERILS).join("button").attr("class", "chip is-on")
    .html((p) => `<span class="swatch" style="background:${p.color}"></span>${p.label}`)
    .on("click", function (_, p) {
      const perils = [...store.get().perils];
      const i = PERILS.indexOf(p);
      perils[i] = !perils[i];
      if (!perils.some(Boolean)) return; // keep at least one peril on
      d3.select(this).classed("is-on", perils[i]);
      store.set({ perils });
    });

  // year range + playback
  const yearFromInput = $("#year-from"), yearToInput = $("#year-to");
  for (const input of [yearFromInput, yearToInput]) { input.min = firstYear; input.max = lastYear; }
  function syncYearInputs() {
    const { yearFrom, yearTo } = store.get();
    yearFromInput.value = yearFrom; yearToInput.value = yearTo;
    $("#year-label").textContent = yearFrom === yearTo ? `${yearFrom}` : `${yearFrom}–${yearTo}`;
  }
  function onYearInput() {
    let from = +yearFromInput.value, to = +yearToInput.value;
    if (from > to) [from, to] = [to, from];
    stopPlayback();
    store.set({ yearFrom: from, yearTo: to });
    syncYearInputs();
  }
  yearFromInput.addEventListener("input", onYearInput);
  yearToInput.addEventListener("input", onYearInput);

  let playTimer = null;
  const playButton = $("#play");
  function stopPlayback() { clearInterval(playTimer); playTimer = null; playButton.textContent = "▶ Play years"; }
  playButton.addEventListener("click", () => {
    if (playTimer) { stopPlayback(); return; }
    let year = firstYear;
    playButton.textContent = "❚❚ Pause";
    const step = () => {
      store.set({ yearFrom: year, yearTo: year }); syncYearInputs();
      year = year >= lastYear ? firstYear : year + 1;
    };
    step();
    playTimer = setInterval(step, PLAYBACK_MS);
  });

  $("#reset").addEventListener("click", () => {
    stopPlayback();
    d3.selectAll("#perils button").classed("is-on", true);
    metricSelect.value = "events";
    store.set({ metric: "events", perils: [true, true, true], yearFrom: firstYear, yearTo: lastYear, selection: { type: "all" }, focusEvent: null });
    syncYearInputs();
    scene.resetCamera();
  });
  $("#clear-selection").addEventListener("click", () => store.set({ selection: { type: "all" }, focusEvent: null }));

  /* ---------- one update path for every view */
  function selectionTitle(state) {
    if (state.selection.type === "state") return data.stateNames.get(state.selection.fips);
    if (state.selection.type === "hex") return `Map cell in ${data.stateNames.get(binState[state.selection.id]) || "—"}`;
    return "United States";
  }

  function render(state) {
    latest = aggregate(events, bins, state, { eventTableRows: PANELS.eventTableRows, highlightCount: PANELS.tickerEvents, visibility });
    scene.setValues(latest.hexValues, latest.hexMax);
    scene.setVisibility(visibility);
    scene.setHighlights(latest.highlights);
    ticker.update(latest.highlights);
    scene.highlightHex(state.selection.type === "hex" ? state.selection.id : null);
    if (state.selection.type === "state") scene.setFocusBins((bin) => binState[bin] === state.selection.fips);
    else if (state.selection.type === "hex") scene.setFocusBins((bin) => bin === state.selection.id);
    else scene.setFocusBins(null);
    scene.highlightState(state.selection.type === "state" ? state.selection.fips : null);
    const focus = state.focusEvent;
    scene.showBeacon(focus != null && events.columns.onMap[focus] ? { x: events.columns.x[focus], y: events.columns.y[focus] } : null);

    $("#selection-title").textContent = selectionTitle(state);
    $("#clear-selection").hidden = state.selection.type === "all";
    $("#metric-note").textContent = `Column height = ${METRICS[state.metric].label} (square-root scale). Segments = peril share, largest on top, so the cap colour is the dominant peril.`;
    kpis.update(latest.selection);
    ranking.update(latest.stateValues, state);
    composition.update(latest.selection);
    timeline.update(latest.selection, state);
    eventTable.update(latest.selection, state);
  }
  store.subscribe(render);
  syncYearInputs();
  render(store.get());

  $("#event-count").textContent = formatCount(events.count);
  document.body.classList.remove("is-loading");
}

start().catch((error) => {
  console.error(error);
  $("#loading").textContent = "Could not load the storm data. Please refresh.";
});
