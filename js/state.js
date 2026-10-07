/**
 * state.js
 * ---------------------------------------------------------------------------
 * Shared selection and filter state for the coordinated views.
 *   focus    – the county under analysis (profile, explanation, trends, events)
 *   pinned   – up to four counties for comparison mode
 *   drillYear – year shown in the event drill-down (null = whole period)
 */

import { DEFAULTS, YEARS } from "./config.js";

export const initialState = () => ({
  yearFrom: YEARS[0], yearTo: YEARS[YEARS.length - 1],
  perils: [true, true, true],
  mapMetric: DEFAULTS.mapMetric, scatterX: DEFAULTS.scatterX, scatterY: DEFAULTS.scatterY,
  focus: null, pinned: [], drillYear: null, hover: null,
  anomalySide: "above", eventSort: "damage",
});

export function createStore() {
  const state = initialState();
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) { Object.assign(state, patch); listeners.forEach((l) => l(state, patch)); },
    subscribe(l) { listeners.add(l); },
  };
}
