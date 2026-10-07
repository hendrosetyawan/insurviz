/**
 * data.js
 * ---------------------------------------------------------------------------
 * Loads the integrated county × year table, the event table, metadata and
 * county geometry. Nothing here draws.
 */

import { DATA } from "./config.js";

export async function loadAll() {
  const [rows, events, meta, geometry] = await Promise.all([
    d3.json(DATA.countyYear), d3.json(DATA.events), d3.json(DATA.meta), d3.json(DATA.geometry),
  ]);

  const geoms = geometry.objects.counties.geometries.filter((g) => g.id.startsWith("48"));
  const features = geoms.map((g) => topojson.feature(geometry, g));
  const texas = topojson.feature(geometry, geometry.objects.states.geometries.find((g) => g.id === "48"));
  const borders = topojson.mesh(geometry, { type: "GeometryCollection", geometries: geoms }, (a, b) => a !== b);

  // county list with area (km², from geometry incl. water; earth radius 6371 km)
  const byFips = d3.group(rows, (r) => r.county_fips);
  const counties = features.map((f) => {
    const fips = +f.id;
    const years = (byFips.get(fips) || []).sort((a, b) => a.year - b.year);
    return { fips, name: years[0]?.county_name || f.properties.name, feature: f,
      areaKm2: d3.geoArea(f) * 6371 ** 2, twia: !!years[0]?.twia_county, rows: years };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const countyByFips = new Map(counties.map((c) => [c.fips, c]));

  // event index by county
  const ev = events.columns;
  const eventsByCounty = d3.group(d3.range(events.count), (i) => ev.county_fips[i]);

  return { counties, countyByFips, events, eventsByCounty, meta, features, texas, borders };
}
