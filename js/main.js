/**
 * main.js
 * ---------------------------------------------------------------------------
 * Loads the integrated data, creates the coordinated views and links them
 * through one store. Workflow: Overview → Compare → Detect anomalies →
 * Explain → Drill down. Selecting a county, year, peril or anomaly in any
 * view updates every other view.
 */

import { MAP_METRICS, MAX_COMPARE, METRICS, PERILS, YEARS } from "./config.js";
import { loadAll } from "./data.js";
import { createStore, initialState } from "./state.js";
import { analyse } from "./model.js";
import { explainCounty } from "./explain.js";
import { createMap } from "./views/map.js";
import { createScatter } from "./views/scatter.js";
import { createTemporal } from "./views/temporal.js";
import { createProfile } from "./views/profile.js";
import { createExplainPanel } from "./views/explainPanel.js";
import { createAnomalies } from "./views/anomalies.js";
import { createEvents } from "./views/events.js";
import { createCompare } from "./views/compare.js";
import { renderMethodology } from "./views/methodology.js";

const $ = (s) => document.querySelector(s);

async function start() {
  const data = await loadAll();
  const store = createStore();
  const set = (patch) => store.set(patch);

  // shared actions
  const focus = (fips) => set({ focus: fips, drillYear: null });
  const togglePin = (fips) => {
    const pinned = store.get().pinned.slice();
    const k = pinned.indexOf(fips);
    if (k >= 0) pinned.splice(k, 1); else if (pinned.length < MAX_COMPARE) pinned.push(fips);
    set({ pinned });
  };
  const goto = (view) => {
    if (view === "methodology") { $("#methodology").showModal(); return; }
    const el = document.querySelector(`[data-view="${view}"]`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1200); }
  };

  const views = {
    map: createMap($("#view-map .body"), data, { onFocus: focus, onTogglePin: togglePin }),
    scatter: createScatter($("#view-scatter .body"), data, { onFocus: focus, onTogglePin: togglePin, onAxes: set }),
    temporal: createTemporal($("#view-temporal .body"), data, { onYear: (y) => set({ drillYear: y }) }),
    profile: createProfile($("#view-profile .body"), data),
    explain: createExplainPanel($("#view-explain .body"), { onGoto: goto }),
    anomalies: createAnomalies($("#view-anomalies .body"), data, { onFocus: focus, onTogglePin: togglePin, onSide: (s) => set({ anomalySide: s }) }),
    events: createEvents($("#view-events .body"), data, { onSort: (s) => set({ eventSort: s }) }),
    compare: createCompare($("#view-compare .body"), data, { onRemove: togglePin }),
  };
  renderMethodology($("#methodology .content"), data.meta);

  /* ---------- global filters */
  const mapSel = $("#map-metric");
  mapSel.innerHTML = ["magnitude", "rate"].map((kind) => `<optgroup label="${kind === "magnitude" ? "Absolute (magnitude)" : "Normalised (rate) / model"}">${MAP_METRICS.filter((k) => METRICS[k].kind === kind)
    .map((k) => `<option value="${k}" ${METRICS[k].unavailable ? "disabled" : ""}>${METRICS[k].label}${METRICS[k].unavailable ? " (unavailable)" : ""}</option>`).join("")}</optgroup>`).join("");
  mapSel.addEventListener("change", () => set({ mapMetric: mapSel.value }));
  const fromSel = $("#year-from"), toSel = $("#year-to");
  for (const sel of [fromSel, toSel]) sel.innerHTML = YEARS.map((y) => `<option>${y}</option>`).join("");
  const onYears = () => { let a = +fromSel.value, b = +toSel.value; if (a > b) [a, b] = [b, a]; set({ yearFrom: a, yearTo: b, drillYear: null }); };
  fromSel.addEventListener("change", onYears); toSel.addEventListener("change", onYears);
  d3.select("#perils").selectAll("label").data(PERILS).join("label").attr("class", "check")
    .html((p) => `<input type="checkbox" checked><i style="background:${p.color}"></i>${p.label}`)
    .select("input").on("change", function (_, p) {
      const perils = store.get().perils.slice(); perils[PERILS.indexOf(p)] = this.checked;
      if (!perils.some(Boolean)) { this.checked = true; return; }
      set({ perils });
    });
  $("#open-methodology").addEventListener("click", () => $("#methodology").showModal());
  $("#close-methodology").addEventListener("click", () => $("#methodology").close());
  $("#reset").addEventListener("click", () => { set(initialState()); syncControls(); });
  document.querySelectorAll(".workflow button").forEach((b) => b.addEventListener("click", () => goto(b.dataset.goto)));
  $("#pin-focus").addEventListener("click", () => { const f = store.get().focus; if (f != null) togglePin(f); });
  $("#clear-focus").addEventListener("click", () => set({ focus: null, drillYear: null }));
  const search = $("#county-search");
  $("#county-names").innerHTML = data.counties.map((c) => `<option value="${c.name}">`).join("");
  search.addEventListener("change", () => {
    const c = data.counties.find((d) => d.name.toLowerCase() === search.value.trim().toLowerCase());
    if (c) { focus(c.fips); search.value = ""; }
  });

  function syncControls() {
    const s = store.get();
    mapSel.value = s.mapMetric; fromSel.value = s.yearFrom; toSel.value = s.yearTo;
    d3.selectAll("#perils input").property("checked", (_, i) => s.perils[i]);
  }

  /* ---------- one update path; re-analyse only when filters change */
  let analysis = null, analysedKey = "";
  function render(state) {
    const key = `${state.yearFrom}-${state.yearTo}-${state.perils.join("")}`;
    if (key !== analysedKey) { analysis = analyse(data, state); analysedKey = key; }
    const index = state.focus == null ? -1 : data.counties.findIndex((c) => c.fips === state.focus);
    const explanation = index >= 0 ? explainCounty(data, analysis, index, state) : null;

    // drill-down events: focus county, drill year or whole period, selected perils
    const ev = data.events.columns, perilKeys = ["hail", "wind", "tornado"];
    const drill = state.focus == null ? null : (data.eventsByCounty.get(state.focus) || []).filter((i) =>
      (state.drillYear ? ev.year[i] === state.drillYear : ev.year[i] >= state.yearFrom && ev.year[i] <= state.yearTo) && state.perils[perilKeys.indexOf(ev.peril[i])]);

    views.map.update(state, analysis, drill);
    views.scatter.update(state, analysis);
    views.temporal.update(state, analysis);
    views.profile.update(state, analysis, explanation || { concentration: {} });
    views.explain.update(state, explanation, index >= 0 ? data.counties[index] : null, index >= 0 ? analysis.metrics[index] : null);
    views.anomalies.update(state, analysis);
    views.events.update(state, drill || []);
    views.compare.update(state, analysis);

    $("#focus-label").textContent = index >= 0 ? `${data.counties[index].name} County` : "No county selected";
    $("#pin-focus").textContent = state.pinned.includes(state.focus) ? "− Compare" : "+ Compare";
    $("#pin-focus").disabled = state.focus == null || (!state.pinned.includes(state.focus) && state.pinned.length >= MAX_COMPARE);
    $("#clear-focus").hidden = state.focus == null;
    $("#period-label").textContent = state.yearFrom === state.yearTo ? state.yearFrom : `${state.yearFrom}–${state.yearTo}`;
  }
  store.subscribe(render);
  syncControls();

  // optional deep link: ?county=Harris&compare=Dallas,Tarrant&metric=residual
  const params = new URLSearchParams(location.search);
  const byName = (n) => data.counties.find((c) => c.name.toLowerCase() === n.trim().toLowerCase())?.fips;
  const patch = {};
  if (params.get("county")) patch.focus = byName(params.get("county")) ?? null;
  if (params.get("compare")) patch.pinned = params.get("compare").split(",").map(byName).filter(Boolean).slice(0, MAX_COMPARE);
  if (params.get("metric") && METRICS[params.get("metric")] && !METRICS[params.get("metric")].unavailable) patch.mapMetric = params.get("metric");
  set(patch); syncControls();
  document.body.classList.remove("is-loading");
}

start().catch((e) => { console.error(e); document.getElementById("loading").textContent = "Could not load data. Please refresh."; });
