/**
 * config.js
 * ---------------------------------------------------------------------------
 * Every setting of InsurViz Texas in one place: data paths, the metric
 * catalogue (what each lens measures and where it comes from), colours,
 * 3D scene look, and panel sizes.
 */

export const DATA = {
  events: "data/tx_events.json",
  counties: "data/tx_counties.json",
  complaints: "data/tx_complaints.json",
  meta: "data/tx_meta.json",
  geometry: "data/us-counties-10m.json",
  countyYear: "data/county_year.json", // integrated NOAA + TDI losses + ACS, county × year 2019–2025
  lossMeta: "data/meta.json",
};
/** TDI "Texas homeowners losses by county" covers these calendar years. */
export const LOSS_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

export const TEXAS_FIPS = 48;

/** Map frame (pixels) the Texas projection is fitted into. */
export const MAP = { width: 900, height: 860 };

/** Perils in the same order as the data (0 = hail, 1 = wind, 2 = tornado). */
export const PERILS = [
  { key: "hail", label: "Hail", color: "#4ea8ff" },
  { key: "wind", label: "Thunderstorm wind", color: "#f5a524" },
  { key: "tornado", label: "Tornado", color: "#c77dff" },
];
export const FIRST_YEAR = 2015;
export const LAST_YEAR = 2025;

/** NWS/SPC "significant" thresholds: hail >= 2 in, wind >= 65 kt, every tornado. */
export const SIGNIFICANT = { hailInches: 2.0, windKnots: 65 };

/**
 * The three lenses. Every county metric belongs to one lens:
 *   hazard   – NOAA Storm Events (what the weather did)
 *   exposure – Census ACS (what homes are there)
 *   market   – Texas Department of Insurance (how insurance is behaving)
 */
export const LENSES = {
  hazard: { label: "Hazard", source: "NOAA Storm Events 2015–2025", color: "#4ea8ff" },
  exposure: { label: "Exposure", source: "Census ACS 2020–2024", color: "#2dd4bf" },
  market: { label: "Insurance market", source: "Texas Dept. of Insurance", color: "#ff6b8b" },
  losses: { label: "Insured losses", source: "TDI homeowners losses 2019–2025", color: "#fb923c" },
};

/**
 * Metric catalogue.
 *  scale:   "sqrt" for counts/money (column height), "linear" for rates
 *  risk:    "high" if a larger value means more risk/stress (warm colour),
 *           "low" if a smaller value does (palette is flipped)
 *  format:  count | money | rate | percent | ratio | year
 *  filtered: depends on the peril/year filters (NOAA metrics)
 */
export const METRICS = {
  // hazard (NOAA, follows the peril and year filters)
  eventsPerYear: { lens: "hazard", label: "Storm reports per year", scale: "sqrt", risk: "high", format: "rate1", filtered: true },
  significantPerYear: { lens: "hazard", label: "Significant reports per year", scale: "sqrt", risk: "high", format: "rate1", filtered: true,
    note: "hail ≥ 2 in, wind ≥ 65 kt, every tornado" },
  reportsPer1kHomes: { lens: "hazard", label: "Reports per 1,000 homes per year", scale: "linear", risk: "high", format: "rate2", filtered: true },
  noaaDamage: { lens: "hazard", label: "NOAA-reported damage", scale: "sqrt", risk: "high", format: "money", filtered: true,
    note: "NWS estimate, not insured loss" },
  // exposure (ACS)
  housingUnits: { lens: "exposure", label: "Housing units", scale: "sqrt", risk: "high", format: "count" },
  ownerUnits: { lens: "exposure", label: "Owner-occupied homes", scale: "sqrt", risk: "high", format: "count" },
  ownerValue: { lens: "exposure", label: "Owner-occupied home value (proxy)", scale: "sqrt", risk: "high", format: "money",
    note: "owner-occupied homes × median home value" },
  medianHomeValue: { lens: "exposure", label: "Median home value", scale: "linear", risk: "high", format: "money" },
  medianYearBuilt: { lens: "exposure", label: "Median year built", scale: "linear", risk: "low", format: "year",
    note: "older housing stock, older roofs" },
  medianIncome: { lens: "exposure", label: "Median household income", scale: "linear", risk: "low", format: "money" },
  // insurance market (TDI)
  pifHomeowners: { lens: "market", label: "Homeowners policies in force", scale: "sqrt", risk: "high", format: "count", note: "2026 Q1" },
  coverageRatio: { lens: "market", label: "Homeowners policies per owner-occupied home", scale: "linear", risk: "low", format: "ratio",
    note: "TDI policies ÷ ACS owner-occupied homes; a take-up proxy that can exceed 1" },
  nonrenewalRate: { lens: "market", label: "Nonrenewals per 1,000 HO policies", scale: "linear", risk: "high", format: "rate1",
    note: "HB 2067 data, Apr–Jun 2026" },
  declinationRate: { lens: "market", label: "Declinations per 1,000 HO policies", scale: "linear", risk: "high", format: "rate1",
    note: "applications declined, Apr–Jun 2026" },
  windHailShare: { lens: "market", label: "Notices citing wind/hail/hurricane", scale: "linear", risk: "high", format: "percent",
    note: "share of HO nonrenewal + declination notices (reason G)" },
  roofShare: { lens: "market", label: "Notices citing roof condition", scale: "linear", risk: "high", format: "percent",
    note: "share of HO nonrenewal + declination notices (reason M)" },
  // insured losses (TDI "Texas homeowners losses by county"; selected years ∩ 2019–2025)
  paidLoss: { lens: "losses", label: "TDI paid homeowners losses per year", scale: "sqrt", risk: "high", format: "money",
    note: "homeowners policies only; excludes renters, condo, dwelling and TWIA wind/hail" },
  lossPerPolicy: { lens: "losses", label: "TDI paid loss per policy", scale: "linear", risk: "high", format: "money",
    note: "Σ paid losses ÷ Σ policies in force (same TDI population: compatible)" },
  lossPerOwnerHome: { lens: "losses", label: "TDI paid loss per owner-occupied home", scale: "linear", risk: "high", format: "money",
    note: "paid losses ÷ ACS owner-occupied homes (approximate: not every owner home has a HO policy)" },
  lossPer1kValue: { lens: "losses", label: "TDI paid loss per $1,000 of home value", scale: "linear", risk: "high", format: "rate2",
    note: "paid losses ÷ estimated owner-occupied value (ACS owner homes × median value): estimated denominator" },
  windHailLossShare: { lens: "losses", label: "Wind & hail share of paid losses", scale: "linear", risk: "high", format: "percent",
    note: "TDI loss type “Wind” (= wind + hail) ÷ total paid losses" },
  baselineRatio: { lens: "losses", label: "Loss per policy vs. baseline (×)", scale: "linear", risk: "high", format: "times",
    note: "observed ÷ expected loss per policy from an exploratory regression on storm density, NOAA damage per home and home value; not causal" },
  stormDensity: { lens: "hazard", label: "Storm reports per 1,000 km² per year", scale: "linear", risk: "high", format: "rate2", filtered: true,
    note: "reports per year ÷ county area (from boundary geometry)" },
};
export const DEFAULT_HEIGHT_METRIC = "significantPerYear";
export const DEFAULT_COLOR_METRIC = "lossPerPolicy";

/** Counties too small for stable insurance rates are drawn grey for rate metrics. */
export const MIN_POLICIES_FOR_RATES = 500;

/** Colour classes for the county prisms (quantile classes of a magma ramp). */
export const COLOR_CLASSES = 7;
export const COLOR_RAMP = [0.18, 0.97]; // portion of d3.interpolateMagma used (low -> high risk)
export const NO_DATA_COLOR = "#2a3238";

/**
 * TWIA catastrophe area: the 14 first-tier coastal counties (plus part of
 * Harris County, not outlined here) where the Texas Windstorm Insurance
 * Association writes wind and hail coverage.
 */
export const TWIA_COUNTIES = [
  "Aransas", "Brazoria", "Calhoun", "Cameron", "Chambers", "Galveston", "Jefferson",
  "Kenedy", "Kleberg", "Matagorda", "Nueces", "Refugio", "San Patricio", "Willacy",
];

/** 3D scene appearance. */
export const SCENE = {
  background: 0x05080d,
  maxPrismHeight: 120,
  minPrismHeight: 1.2,
  outlineColor: 0x2dd4bf,
  selectedColor: 0xffffff,
  twiaColor: 0x7dd3fc,
  gridColor: 0x0f2a2e,
  dimAmount: 0.8,
  bloom: { strength: 0.5, radius: 0.4, threshold: 0.6 },
  heightEasing: 0.12,
  camera: { fov: 40, tilt: 55, margin: 0.78 },
};

export const PARTICLES = { lift: 0.8, baseSize: 2.4, significantSize: 2.2, opacity: 0.75 };
export const SHOCKWAVES = { count: 10, maxPillar: 130, maxRadius: 22, periodSeconds: 2.6 };
export const SWEEP = { radius: 620, speed: 0.45, trail: 0.7, opacity: 0.05, color: 0x2dd4bf };

export const VIEW_MODES = {
  both: { label: "Prisms + storm lights", prisms: true, particles: true },
  prisms: { label: "County prisms", prisms: true, particles: false },
  lights: { label: "Storm lights", prisms: false, particles: true },
};
export const DEFAULT_VIEW_MODE = "both";
export const AUTO_ROTATE_SPEED = 0.4;
export const PLAYBACK_MS = 1100;

export const PANELS = { rankingCount: 12, eventTableRows: 8, tickerEvents: 24, reasonsShown: 9, anomalyRows: 10 };

/** Exploratory baseline: fitted on counties with at least this many policies, outside the TWIA area. */
export const MIN_POLICIES_FIT = 500;
/** |z| of the baseline residual at which a county is called an anomaly. */
export const ANOMALY_Z = 1.5;
