/**
 * state.js
 * ---------------------------------------------------------------------------
 * A tiny shared store for the analyst's choices. Every view subscribes and
 * redraws when the lenses, filters or selection change (linked views).
 */

import { DEFAULT_COLOR_METRIC, DEFAULT_HEIGHT_METRIC, FIRST_YEAR, LAST_YEAR } from "./config.js";

export const initialState = () => ({
  heightMetric: DEFAULT_HEIGHT_METRIC, // what the prism height shows
  colorMetric: DEFAULT_COLOR_METRIC,   // what the prism colour shows
  perils: [true, true, true],          // hail, wind, tornado
  yearFrom: FIRST_YEAR,
  yearTo: LAST_YEAR,
  selection: { type: "all" },          // {type:"all"} | {type:"county", fips} | {type:"set", fips:[...]}
  focusEvent: null,                    // event index lit from the R4 list
  showTwia: false,                     // outline the TWIA coastal catastrophe area
});

export function createStore() {
  const state = initialState();
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) { Object.assign(state, patch); listeners.forEach((listener) => listener(state)); },
    subscribe(listener) { listeners.add(listener); },
  };
}

/** Is a county (by FIPS) part of the current selection? */
export function inSelection(selection, fips) {
  if (selection.type === "county") return selection.fips === fips;
  if (selection.type === "set") return selection.fips.includes(fips);
  return true;
}
