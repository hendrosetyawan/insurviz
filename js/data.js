/**
 * data.js
 * ---------------------------------------------------------------------------
 * Loads the packed NOAA Storm Events file and the map/lookup files, then
 * projects every event onto the map once. Nothing here draws.
 */

import { DATA, MAP } from "./config.js";

const TYPED_ARRAYS = {
  float32: Float32Array, int32: Int32Array, int16: Int16Array,
  uint16: Uint16Array, uint8: Uint8Array,
};

/** Read events.bin using the column layout stored in events.json. */
async function loadEvents() {
  const [meta, buffer] = await Promise.all([
    d3.json(DATA.eventsMeta),
    fetch(DATA.eventsBinary).then((response) => response.arrayBuffer()),
  ]);
  const columns = {};
  for (const column of meta.columns) {
    columns[column.name] = new TYPED_ARRAYS[column.type](buffer, column.offset, meta.count);
  }
  return { meta, columns, count: meta.count };
}

/** Project every event's lon/lat to map pixels (same projection as us-atlas). */
function projectEvents(events) {
  const projection = d3.geoAlbersUsa().scale(MAP.projectionScale).translate(MAP.projectionTranslate);
  const x = new Float32Array(events.count);
  const y = new Float32Array(events.count);
  const onMap = new Uint8Array(events.count);
  const { lon, lat } = events.columns;
  for (let i = 0; i < events.count; i++) {
    const point = projection([lon[i] / 100, lat[i] / 100]);
    if (point) { x[i] = point[0]; y[i] = point[1]; onMap[i] = 1; }
  }
  Object.assign(events.columns, { x, y, onMap });
}

/** Population per state (sum of counties), used for "per 100k residents" rates. */
function populationByState(rows) {
  const totals = new Map();
  for (const row of rows) {
    const stateFips = Math.floor(+row["FIPS Code"] / 1000);
    totals.set(stateFips, (totals.get(stateFips) || 0) + +row.Population);
  }
  return totals;
}

/**
 * Load everything the app needs.
 * @returns {Promise<{events, details, states, counties, stateNames, countyNames, statePopulation}>}
 */
export async function loadAll() {
  const [events, details, states, counties, populationRows] = await Promise.all([
    loadEvents(),
    d3.json(DATA.eventDetails),
    d3.json(DATA.states),
    d3.json(DATA.counties),
    d3.csv(DATA.population),
  ]);
  projectEvents(events);

  const stateNames = new Map(states.objects.states.geometries.map((g) => [+g.id, g.properties.name]));
  const countyNames = new Map(counties.objects.counties.geometries.map((g) => [+g.id, g.properties.name]));
  return {
    events, details, states, counties, stateNames, countyNames,
    statePopulation: populationByState(populationRows),
  };
}
