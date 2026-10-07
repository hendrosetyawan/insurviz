/**
 * data.js
 * ---------------------------------------------------------------------------
 * Loads the Texas files, builds the Texas projection, and projects every
 * county outline and storm report onto the same map once. Also attaches the
 * integrated TDI-loss county × year rows (2019–2025) to each county.
 */

import { DATA, MAP, TEXAS_FIPS, TWIA_COUNTIES } from "./config.js";

/** Texas-centric equal-area projection (EPSG:3083 parallels), fitted to the map frame. */
function texasProjection(texasFeature) {
  return d3.geoConicEqualArea().parallels([27.5, 35]).rotate([100, 0]).center([0, 31.25])
    .fitSize([MAP.width, MAP.height], texasFeature);
}

export async function loadAll() {
  const [events, counties, complaints, meta, geometry, countyYear, lossMeta, zipData] = await Promise.all([
    d3.json(DATA.events), d3.json(DATA.counties), d3.json(DATA.complaints), d3.json(DATA.meta), d3.json(DATA.geometry),
    d3.json(DATA.countyYear), d3.json(DATA.lossMeta), d3.json(DATA.zipReasons),
  ]);
  const lossRowsByFips = d3.group(countyYear, (r) => r.county_fips);

  // Texas outline + the 254 county shapes
  const texas = topojson.feature(geometry, geometry.objects.states.geometries.find((g) => +g.id === TEXAS_FIPS));
  const countyGeoms = geometry.objects.counties.geometries.filter((g) => Math.floor(+g.id / 1000) === TEXAS_FIPS);
  const countyFeatures = countyGeoms.map((g) => topojson.feature(geometry, g));
  const projection = texasProjection(texas);
  const countyBorders = topojson.mesh(geometry, { type: "GeometryCollection", geometries: countyGeoms }, (a, b) => a !== b);

  // county records in a stable order (index = position in arrays used by the views)
  const countyList = countyFeatures.map((feature, index) => {
    const fips = +feature.id;
    const record = counties[fips] || { name: feature.properties.name, reasons: {} };
    const centroid = projection(d3.geoCentroid(feature));
    return {
      index, fips, name: record.name || feature.properties.name, feature, centroid, data: record,
      areaKm2: d3.geoArea(feature) * 6371 ** 2, // from boundary geometry (includes water)
      lossRows: (lossRowsByFips.get(fips) || []).sort((a, b) => a.year - b.year), // TDI losses + ACS, 2019–2025
    };
  });
  const countyIndex = new Map(countyList.map((c) => [c.fips, c.index]));
  const twia = new Set(TWIA_COUNTIES.map((name) => countyList.find((c) => c.name === name)?.fips).filter(Boolean));

  // project storm reports once; keep the county index for fast aggregation
  const columns = events.columns;
  const count = events.count;
  const x = new Float32Array(count), y = new Float32Array(count), county = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    const point = projection([columns.lon[i], columns.lat[i]]) || [NaN, NaN];
    x[i] = point[0]; y[i] = point[1];
    county[i] = countyIndex.has(columns.county[i]) ? countyIndex.get(columns.county[i]) : -1;
  }
  Object.assign(columns, { x, y, countyIdx: county });

  return { events, countyList, countyIndex, twia, texas, countyBorders, projection, complaints, meta, lossMeta, zipData };
}
