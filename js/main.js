/**
 * main.js
 * ---------------------------------------------------------------------------
 * Loads the Texas data, builds every view and links them through one store.
 * Any change of lens, filter or selection re-aggregates once and pushes the
 * result to the 3D stage and all D3 panels.
 */

import { DEFAULT_VIEW_MODE, FIRST_YEAR, LAST_YEAR, LENSES, METRICS, PANELS, PERILS, PLAYBACK_MS, VIEW_MODES } from "./config.js";
import { loadAll } from "./data.js";
import { createStore, initialState, inSelection } from "./state.js";
import { aggregate, prepareCounties } from "./metrics.js";
import { makeColorScale, makeHeightScale } from "./scales.js";
import { formatMetric } from "./format.js";
import { createTexasScene } from "./scene/texasScene.js";
import { createKpis } from "./panels/kpis.js";
import { createRanking } from "./panels/ranking.js";
import { createProfile } from "./panels/profile.js";
import { createScatter } from "./panels/scatter.js";
import { createComposition } from "./panels/composition.js";
import { createTimeline } from "./panels/timeline.js";
import { createReasons } from "./panels/reasons.js";
import { createEventTable } from "./panels/eventTable.js";
import { createTicker } from "./panels/ticker.js";
import { createLegend } from "./panels/legend.js";
import { buildChapters, createStory } from "./story.js";

const $ = (selector) => document.querySelector(selector);

/** Metric picker with one <optgroup> per lens. */
function fillMetricSelect(select, value) {
  select.innerHTML = Object.entries(LENSES).map(([lens, l]) =>
    `<optgroup label="${l.label} · ${l.source}">${Object.entries(METRICS).filter(([, m]) => m.lens === lens)
      .map(([key, m]) => `<option value="${key}">${m.label}</option>`).join("")}</optgroup>`).join("");
  select.value = value;
}

/** Selection-level values for the profile (sums, and weighted rates/medians). */
function selectionProfile(sel, state, countyValues, countyList) {
  const years = state.yearTo - state.yearFrom + 1;
  const weighted = (field) => {
    let w = 0, s = 0;
    for (const c of sel.counties) { const v = c.data[field], o = c.data.ownerUnits || 0; if (v != null) { s += v * o; w += o; } }
    return w ? s / w : null;
  };
  if (sel.counties.length === 1) return countyValues[countyList.indexOf(sel.counties[0])];
  return {
    significantPerYear: sel.significant / years,
    reportsPer1kHomes: sel.housingUnits ? (sel.eventCount / years / sel.housingUnits) * 1000 : null,
    noaaDamage: sel.damageTotal,
    ownerUnits: sel.ownerUnits,
    medianHomeValue: weighted("medianHomeValue"),
    medianYearBuilt: weighted("medianYearBuilt"),
    coverageRatio: sel.coverageRatio,
    nonrenewalRate: sel.nonrenewalRate,
    windHailShare: sel.notices ? (sel.reasons.G || 0) / sel.notices : null,
    roofShare: sel.notices ? (sel.reasons.M || 0) / sel.notices : null,
  };
}

async function start() {
  const data = await loadAll();
  const { countyList, events } = data;
  prepareCounties(countyList);
  const store = createStore();
  const visibility = new Float32Array(events.count);
  let latest = null, colorScale = null, colors = [];

  /* ---------- 3D stage */
  const tooltip = $("#tooltip");
  function showCountyTooltip(index, event) {
    if (index == null || !latest) { tooltip.hidden = true; return; }
    const county = countyList[index], v = latest.values[index], st = store.get();
    const line = (m) => `<div><span class="lens-tag" style="--lens:${LENSES[METRICS[m].lens].color}">${LENSES[METRICS[m].lens].label}</span>${METRICS[m].label}: <b>${formatMetric(m, v[m])}</b></div>`;
    tooltip.hidden = false;
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
    tooltip.innerHTML = `<b>${county.name} County</b>${data.twia.has(county.fips) ? ' <span class="twia-tag">TWIA area</span>' : ""}
      ${[...new Set([st.heightMetric, st.colorMetric, "significantPerYear", "ownerUnits", "coverageRatio", "nonrenewalRate"])].map(line).join("")}
      <div class="tooltip__hint">Click to select</div>`;
  }
  const scene = createTexasScene($("#scene"), data, {
    onHover: showCountyTooltip,
    onSelect: (index) => store.set({ selection: index == null ? { type: "all" } : { type: "county", fips: countyList[index].fips }, focusEvent: null }),
  });

  /* ---------- panels */
  const selectCounty = (fips, fly = true) => {
    store.set({ selection: { type: "county", fips }, focusEvent: null });
    if (fly) scene.frameCounties([data.countyIndex.get(fips)]);
  };
  const kpis = createKpis($("#kpis"));
  const legend = createLegend($("#legend"));
  const ranking = createRanking($("#panel-r1 .panel__body"), { countyList, onSelectCounty: selectCounty });
  const profile = createProfile($("#panel-profile .panel__body"), {
    onMetricClick: (metric) => { store.set({ colorMetric: metric }); $("#color-metric").value = metric; },
  });
  const scatter = createScatter($("#panel-scatter .panel__body"), {
    onBrush: (list) => { store.set({ selection: { type: "set", fips: list }, focusEvent: null }); scene.frameCounties(list.map((f) => data.countyIndex.get(f))); },
    onPick: (fips) => selectCounty(fips),
    onHover: showCountyTooltip,
  });
  const composition = createComposition($("#panel-r2 .panel__body"));
  const timeline = createTimeline($("#panel-r3 .panel__body"), {
    complaints: data.complaints,
    onPickYear: (year) => { stopPlayback(); store.set({ yearFrom: year, yearTo: year }); syncControls(); },
  });
  const reasons = createReasons($("#panel-reasons .panel__body"), { reasonLabels: data.meta.reasons });
  const eventTable = createEventTable($("#panel-r4 .panel__body"), {
    events, countyList,
    onFocusEvent: (index) => { const next = store.get().focusEvent === index ? null : index; store.set({ focusEvent: next }); scene.focusEvent(next); },
  });
  const ticker = createTicker($("#ticker"), { events, countyList });

  /* ---------- controls */
  const heightSelect = $("#height-metric"), colorSelect = $("#color-metric"), viewSelect = $("#view-mode");
  fillMetricSelect(heightSelect, store.get().heightMetric);
  fillMetricSelect(colorSelect, store.get().colorMetric);
  heightSelect.addEventListener("change", () => store.set({ heightMetric: heightSelect.value }));
  colorSelect.addEventListener("change", () => store.set({ colorMetric: colorSelect.value }));
  $("#swap-metrics").addEventListener("click", () => { const s = store.get(); store.set({ heightMetric: s.colorMetric, colorMetric: s.heightMetric }); syncControls(); });

  viewSelect.innerHTML = Object.entries(VIEW_MODES).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join("");
  const requestedView = new URLSearchParams(location.search).get("view");
  viewSelect.value = VIEW_MODES[requestedView] ? requestedView : DEFAULT_VIEW_MODE;
  viewSelect.addEventListener("change", () => scene.setViewMode(viewSelect.value));
  scene.setViewMode(viewSelect.value);

  d3.select("#perils").selectAll("button").data(PERILS).join("button").attr("class", "chip is-on")
    .html((p) => `<span class="swatch" style="background:${p.color}"></span>${p.label}`)
    .on("click", (_, p) => {
      const perils = [...store.get().perils], i = PERILS.indexOf(p);
      perils[i] = !perils[i];
      if (!perils.some(Boolean)) return;
      store.set({ perils }); syncControls();
    });

  const yearFrom = $("#year-from"), yearTo = $("#year-to");
  for (const input of [yearFrom, yearTo]) { input.min = FIRST_YEAR; input.max = LAST_YEAR; }
  const onYear = () => {
    let a = +yearFrom.value, b = +yearTo.value;
    if (a > b) [a, b] = [b, a];
    stopPlayback(); store.set({ yearFrom: a, yearTo: b }); syncControls();
  };
  yearFrom.addEventListener("input", onYear); yearTo.addEventListener("input", onYear);

  let playTimer = null;
  const playButton = $("#play");
  function stopPlayback() { clearInterval(playTimer); playTimer = null; playButton.textContent = "▶ Play years"; }
  playButton.addEventListener("click", () => {
    if (playTimer) { stopPlayback(); return; }
    let year = FIRST_YEAR;
    playButton.textContent = "❚❚ Pause";
    const step = () => { store.set({ yearFrom: year, yearTo: year }); syncControls(); year = year >= LAST_YEAR ? FIRST_YEAR : year + 1; };
    step(); playTimer = setInterval(step, PLAYBACK_MS);
  });

  const twiaToggle = $("#twia");
  twiaToggle.addEventListener("change", () => store.set({ showTwia: twiaToggle.checked }));
  const orbitButton = $("#orbit");
  const setOrbit = (on) => { scene.setAutoRotate(on); orbitButton.classList.toggle("is-on", on); };
  orbitButton.addEventListener("click", () => setOrbit(!orbitButton.classList.contains("is-on")));
  scene.onAutoRotateStop(() => orbitButton.classList.remove("is-on"));

  function syncControls() {
    const s = store.get();
    heightSelect.value = s.heightMetric; colorSelect.value = s.colorMetric;
    yearFrom.value = s.yearFrom; yearTo.value = s.yearTo;
    $("#year-label").textContent = s.yearFrom === s.yearTo ? `${s.yearFrom}` : `${s.yearFrom}–${s.yearTo}`;
    d3.selectAll("#perils button").classed("is-on", (_, i) => s.perils[i]);
    twiaToggle.checked = s.showTwia;
  }
  function resetAll() {
    stopPlayback();
    store.set(initialState());
    viewSelect.value = DEFAULT_VIEW_MODE; scene.setViewMode(DEFAULT_VIEW_MODE);
    syncControls(); scene.resetCamera();
  }
  $("#reset").addEventListener("click", resetAll);
  $("#clear-selection").addEventListener("click", () => { store.set({ selection: { type: "all" }, focusEvent: null }); scene.resetCamera(); });

  /* ---------- story */
  const story = createStory($("#story"), {
    chapters: buildChapters(data),
    apply(chapter) {
      stopPlayback(); setOrbit(false);
      store.set({ ...chapter.patch, focusEvent: null });
      viewSelect.value = chapter.view; scene.setViewMode(chapter.view);
      syncControls();
      const sel = chapter.patch.selection;
      scene.frameCounties(sel && sel.type === "set" ? sel.fips.map((f) => data.countyIndex.get(f)) : null);
      return latest.values;
    },
  });
  $("#story-open").addEventListener("click", () => story.open());

  /* ---------- one update path for every view */
  function selectionLabel(sel) {
    if (sel.type === "county") return `${countyList[data.countyIndex.get(sel.fips)].name} County`;
    if (sel.type === "set") return `${sel.fips.length} counties`;
    return "All of Texas";
  }
  function render(state) {
    latest = aggregate(data, state, { eventTableRows: PANELS.eventTableRows, highlightCount: PANELS.tickerEvents, visibility });
    const { values, selection: sel } = latest;
    const heightScale = makeHeightScale(values, state.heightMetric);
    colorScale = makeColorScale(values, state.colorMetric);
    colors = values.map((v) => colorScale.color(v[state.colorMetric]));
    const heights = values.map((v) => { const x = v[state.heightMetric]; return x == null || !Number.isFinite(x) ? 0.6 : heightScale(x); });
    scene.setPrisms(heights, colors);
    scene.setVisibility(visibility);
    scene.setHighlights(latest.highlights);
    scene.setTwia(state.showTwia);

    const selectedSet = state.selection.type === "all" ? null : new Set(sel.counties.map((c) => c.fips));
    scene.setFocus(selectedSet ? (i) => inSelection(state.selection, countyList[i].fips) : null);
    scene.highlightCounties(selectedSet && selectedSet.size <= 40 ? sel.counties.map((c) => c.index) : []);

    const colorOf = (i) => colors[i];
    $("#selection-title").textContent = selectionLabel(state.selection);
    $("#clear-selection").hidden = state.selection.type === "all";
    legend.update(state.heightMetric, state.colorMetric, colorScale);
    kpis.update(sel);
    ranking.update({ values, metric: state.heightMetric, colorOf, selectedSet });
    profile.update(selectionLabel(state.selection), selectionProfile(sel, state, values, countyList), values, sel.counties.length === 1);
    scatter.update({ countyList, values, xMetric: state.heightMetric, yMetric: state.colorMetric, colorOf, selectedSet });
    composition.update(sel);
    timeline.update(sel, state);
    reasons.update(sel);
    eventTable.update(sel, state);
    ticker.update(latest.highlights);
  }
  store.subscribe(render);
  syncControls();
  render(store.get());
  const params = new URLSearchParams(location.search);
  setOrbit(!params.has("still") && !params.has("story"));
  if (params.has("story")) story.open(Math.max(0, (+params.get("story") || 1) - 1)); // shareable chapter link
  document.body.classList.remove("is-loading");
}

start().catch((error) => {
  console.error(error);
  $("#loading").textContent = "Could not load the Texas data. Please refresh.";
});
