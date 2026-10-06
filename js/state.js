/**
 * state.js
 * ---------------------------------------------------------------------------
 * A tiny shared store for the analyst's choices. Views subscribe and redraw
 * whenever the filters or the selection change (linked views).
 */

import { DEFAULT_METRIC } from "./config.js";

export function createStore(firstYear, lastYear) {
  const state = {
    metric: DEFAULT_METRIC,          // what the column height shows
    perils: [true, true, true],      // hail, wind, tornado switched on/off
    yearFrom: firstYear,
    yearTo: lastYear,
    selection: { type: "all" },      // {type:"all"} | {type:"hex", id} | {type:"state", fips}
    focusEvent: null,                // event index highlighted from the R4 table
  };
  const listeners = new Set();

  return {
    get: () => state,
    /** Merge a partial update and notify every view. */
    set(patch) {
      Object.assign(state, patch);
      listeners.forEach((listener) => listener(state));
    },
    subscribe(listener) { listeners.add(listener); },
  };
}
