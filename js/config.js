/**
 * config.js
 * ---------------------------------------------------------------------------
 * Every setting of InsurViz in one place: data paths, colours, map geometry,
 * 3D scene look, and the definitions behind each metric.
 */

export const DATA = {
  eventsMeta: "data/events.json",
  eventsBinary: "data/events.bin",
  eventDetails: "data/details.json",
  states: "data/states-albers-10m.json",
  counties: "data/counties-albers-10m.json",
  population: "data/county_population.csv",
};

/** The us-atlas "albers" files are pre-projected with exactly this projection. */
export const MAP = {
  width: 975,
  height: 610,
  projectionScale: 1300,
  projectionTranslate: [487.5, 305],
};

/** Perils in the same order as the binary file (0 = hail, 1 = wind, 2 = tornado). */
export const PERILS = [
  { key: "hail", label: "Hail", color: "#4ea8ff" },
  { key: "wind", label: "Thunderstorm wind", color: "#f5a524" },
  { key: "tornado", label: "Tornado", color: "#c77dff" },
];

/**
 * Metrics an analyst can put on the column height.
 * "significant" follows NWS/SPC conventions: hail >= 2 in, wind >= 65 kt,
 * and every tornado.
 */
export const METRICS = {
  events: { label: "Event count", short: "events", format: "count" },
  significant: { label: "Significant events", short: "significant", format: "count" },
  damage: { label: "NOAA-reported damage", short: "damage", format: "money" },
};
export const DEFAULT_METRIC = "events";
export const SIGNIFICANT = { hailInches: 2.0, windKnots: 65 };

/** Hexagon binning on the projected map (pixels of the 975 x 610 map). */
export const HEX = {
  radius: 8,
  gap: 0.86, // fraction of the radius drawn, leaving a dark gap between columns
};

/** 3D scene appearance. */
export const SCENE = {
  background: 0x05080d,
  maxColumnHeight: 95,
  stateLineColor: 0x2dd4bf,
  stateLineOpacity: 0.55,
  dimAmount: 0.78, // how far columns outside the selection fade towards the background
  selectedStateColor: 0xffffff,
  gridColor: 0x0f2a2e,
  bloom: { strength: 0.55, radius: 0.4, threshold: 0.55 },
  heightEasing: 0.14, // 0-1: how quickly columns grow to new heights per frame
  camera: { fov: 40, tilt: 52, margin: 1.02 }, // tilt = degrees above the map; margin > 1 leaves space
};

/** Light map: every event as a glowing point (eventParticles.js). */
export const PARTICLES = {
  height: 0.9, // above the floor
  baseSize: 2.2,
  significantSize: 2.4, // size multiplier for significant events
  opacity: 0.65,
};

/** Light pillars + expanding rings on the most damaging events (shockwaves.js). */
export const SHOCKWAVES = { count: 12, maxPillar: 150, maxRadius: 26, periodSeconds: 2.6 };

/** Decorative radar sweep (radarSweep.js). */
export const SWEEP = { radius: 560, speed: 0.45, trail: 0.7, opacity: 0.06, color: 0x2dd4bf };

/** What the 3D stage shows. */
export const VIEW_MODES = {
  lights: { label: "Light map", columns: false, particles: true },
  columns: { label: "Columns", columns: true, particles: false },
  both: { label: "Columns + light map", columns: true, particles: true },
};
export const DEFAULT_VIEW_MODE = "lights";
export const AUTO_ROTATE_SPEED = 0.45;

/** Year playback speed (ms per year). */
export const PLAYBACK_MS = 1100;

/** Panels. */
export const PANELS = {
  rankingCount: 12,
  eventTableRows: 8,
  tickerEvents: 24, // events scrolling in the bottom tape
};
