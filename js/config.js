/**
 * config.js
 * ---------------------------------------------------------------------------
 * Settings and the metric catalogue. Every metric documents its numerator,
 * denominator and whether the two describe compatible populations, so the
 * methodology panel and tooltips can explain exactly what is being shown.
 */

export const DATA = {
  countyYear: "data/county_year.json",
  events: "data/events.json",
  meta: "data/meta.json",
  geometry: "data/us-counties-10m.json",
};
export const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

export const PERILS = [
  { key: "hail", label: "Hail", color: "#2f7ed8" },
  { key: "wind", label: "Thunderstorm wind", color: "#e8932b" },
  { key: "tornado", label: "Tornado", color: "#7b52c7" },
];
export const TDI_LOSS_TYPES = [
  { key: "tdi_paid_wind_hail", label: "Wind & hail", color: "#3d7ea6" },
  { key: "tdi_paid_water", label: "Water", color: "#6cb7c9" },
  { key: "tdi_paid_fire", label: "Fire", color: "#d1603d" },
  { key: "tdi_paid_other", label: "Other", color: "#a3a3a3" },
];

/** Groups give every metric a consistent colour cue across views. */
export const GROUPS = {
  hazard: { label: "Hazard", source: "NOAA Storm Events", color: "#2f7ed8" },
  exposure: { label: "Exposure", source: "Census ACS 5-year", color: "#2a9d8f" },
  insurance: { label: "Insurance outcome", source: "TDI homeowners", color: "#b5446e" },
  model: { label: "Baseline model", source: "exploratory regression", color: "#555" },
};

/**
 * Period metrics (computed for the selected year range and perils).
 *  unit:  shown in legends and tooltips
 *  kind:  "magnitude" (absolute) or "rate" (normalised) — the UI groups by it
 *  compat: compatibility of numerator and denominator populations
 */
export const METRICS = {
  storm_count: { group: "hazard", kind: "magnitude", label: "Storm events per year", unit: "events/yr", format: "count1",
    def: "NOAA hail, thunderstorm-wind and tornado reports in the county, averaged over the selected years.", scale: "log" },
  storm_density: { group: "hazard", kind: "rate", label: "Storm events per 1,000 km² per year", unit: "events/1,000 km²/yr", format: "rate2",
    def: "Storm events per year ÷ county area (from boundary geometry, includes water). Fairer than counts between large and small counties.", scale: "log" },
  hail_count: { group: "hazard", kind: "magnitude", label: "Hail events per year", unit: "events/yr", format: "count1", def: "NOAA hail reports per year.", scale: "log" },
  wind_count: { group: "hazard", kind: "magnitude", label: "Thunderstorm-wind events per year", unit: "events/yr", format: "count1", def: "NOAA thunderstorm-wind reports per year.", scale: "log" },
  tornado_count: { group: "hazard", kind: "magnitude", label: "Tornado events per year", unit: "events/yr", format: "count2", def: "NOAA tornado county segments per year.", scale: "log" },
  noaa_property_damage: { group: "hazard", kind: "magnitude", label: "NOAA property damage per year", unit: "$/yr", format: "money",
    def: "Sum of NOAA-reported property damage per year. An NWS estimate, not insured loss; blank reports are excluded, not counted as $0.", scale: "log" },
  damage_per_event: { group: "hazard", kind: "rate", label: "NOAA damage per event", unit: "$/event", format: "money",
    def: "NOAA property damage ÷ storm events (severity, not frequency).", scale: "log" },
  tdi_paid_loss: { group: "insurance", kind: "magnitude", label: "TDI paid homeowners losses per year", unit: "$/yr", format: "money",
    def: "Paid losses on homeowners policies (all loss types), averaged over available years. Excludes renters, condo, dwelling policies and TWIA wind/hail.", scale: "log" },
  loss_per_policy: { group: "insurance", kind: "rate", label: "TDI paid loss per active policy", unit: "$/policy/yr", format: "money",
    def: "Σ paid losses ÷ Σ policies in force at year end. Same population (TDI homeowners) in numerator and denominator.", scale: "log", compat: "compatible" },
  insured_loss_per_housing_unit: { group: "insurance", kind: "rate", label: "TDI paid loss per housing unit", unit: "$/unit/yr", format: "money",
    def: "Paid homeowners losses per year ÷ ACS housing units. Crude: housing units include rentals and condos that homeowners policies do not cover.", scale: "log", compat: "mixed" },
  insured_loss_per_owner_unit: { group: "insurance", kind: "rate", label: "TDI paid loss per owner-occupied home", unit: "$/home/yr", format: "money",
    def: "Paid homeowners losses per year ÷ ACS owner-occupied units. Closer populations, but not all owner homes carry a homeowners policy.", scale: "log", compat: "approximate" },
  insured_loss_per_1k_exposure: { group: "insurance", kind: "rate", label: "TDI paid loss per $1,000 of estimated home value", unit: "$ per $1,000/yr", format: "rate2",
    def: "Paid homeowners losses per year ÷ estimated owner-occupied property value (ACS owner units × median value) × 1,000. Estimated denominator.", scale: "log", compat: "estimated" },
  premium_per_policy: { group: "insurance", kind: "rate", label: "Average premium per policy", unit: "$/policy", format: "money",
    def: "TDI average annual premium (policies with wind). Not integrated: the TDI county premium export could not be retrieved automatically.", scale: "linear", unavailable: true },
  estimated_property_exposure: { group: "exposure", kind: "magnitude", label: "Estimated owner-occupied home value", unit: "$", format: "money",
    def: "ACS owner-occupied units × ACS median home value (latest vintage in range). An estimate of exposure, not insured value.", scale: "log", compat: "estimated" },
  owner_occupied_units: { group: "exposure", kind: "magnitude", label: "Owner-occupied homes", unit: "homes", format: "count", def: "ACS owner-occupied housing units.", scale: "log" },
  housing_units: { group: "exposure", kind: "magnitude", label: "Housing units", unit: "units", format: "count", def: "ACS total housing units.", scale: "log" },
  median_home_value: { group: "exposure", kind: "rate", label: "Median home value", unit: "$", format: "money", def: "ACS median value of owner-occupied homes.", scale: "linear" },
  active_policies: { group: "insurance", kind: "magnitude", label: "Active homeowners policies", unit: "policies", format: "count", def: "TDI policies in force at year end (latest year in range).", scale: "log" },
  residual: { group: "model", kind: "rate", label: "Loss per policy vs. baseline (×)", unit: "× expected", format: "times",
    def: "Observed ÷ expected loss per policy from the exploratory baseline (storm density, NOAA damage per home, median home value). Not a causal model.", scale: "diverging" },
};

export const MAP_METRICS = ["storm_count", "storm_density", "noaa_property_damage", "damage_per_event", "tdi_paid_loss",
  "loss_per_policy", "insured_loss_per_housing_unit", "insured_loss_per_owner_unit", "insured_loss_per_1k_exposure",
  "premium_per_policy", "estimated_property_exposure", "residual"];
export const SCATTER_X = ["storm_count", "storm_density", "hail_count", "wind_count", "tornado_count", "noaa_property_damage", "damage_per_event", "estimated_property_exposure"];
export const SCATTER_Y = ["tdi_paid_loss", "loss_per_policy", "insured_loss_per_housing_unit", "insured_loss_per_owner_unit", "insured_loss_per_1k_exposure", "premium_per_policy"];

export const DEFAULTS = { mapMetric: "loss_per_policy", scatterX: "storm_density", scatterY: "loss_per_policy" };

/** Counties with fewer average policies than this are flagged as unstable for rates. */
export const MIN_POLICIES = 500;
/** |z| of the baseline residual above which a county is called an anomaly. */
export const ANOMALY_Z = 1.5;
export const MAX_COMPARE = 4;
export const COMPARE_COLORS = ["#c2410c", "#0f766e", "#7c3aed", "#a16207"]; // focus county is always black
export const NULL_FILL = "url(#null-hatch)";
export const ZERO_FILL = "#f4f4f2";
