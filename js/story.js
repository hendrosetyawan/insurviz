/**
 * story.js
 * ---------------------------------------------------------------------------
 * A guided tour of six findings. Each chapter sets the lenses, filters and
 * selection, flies the camera, and explains what to look at. Every number in
 * the text is computed from the loaded data when the chapter opens, so the
 * story cannot drift from the views.
 */

import { FIRST_YEAR, LAST_YEAR } from "./config.js";
import { formatCount } from "./format.js";
import { initialState } from "./state.js";

const BIG = 5000; // counties with at least this many HO policies, for stable rates

/** Top counties by a metric among counties with enough policies. */
function top(data, values, metric, n = 3, minPolicies = BIG) {
  return data.countyList.map((c, i) => ({ c, v: values[i][metric] }))
    .filter((d) => d.v != null && (d.c.data.hoPoliciesZip || 0) >= minPolicies)
    .sort((a, b) => b.v - a.v).slice(0, n);
}
const names = (rows, fmt) => rows.map((d) => `${d.c.name} ${fmt(d.v)}`).join(", ");
const fips = (data, list) => list.map((name) => data.countyList.find((c) => c.name === name)?.fips).filter(Boolean);

export function buildChapters(data) {
  const totals = data.countyList.reduce((s, c) => {
    s.pif += c.data.pifHomeowners || 0; s.owner += c.data.ownerUnits || 0;
    s.non += c.data.hoNonrenewals || 0; s.pol += c.data.hoPoliciesZip || 0; return s;
  }, { pif: 0, owner: 0, non: 0, pol: 0 });
  const base = () => ({ ...initialState(), yearFrom: FIRST_YEAR, yearTo: LAST_YEAR });

  return [
    {
      title: "Ten years of Texas storms",
      patch: { ...base(), selection: { type: "all" } }, view: "lights",
      text: () => `Every light is one NOAA Storm Events report: <b>${formatCount(data.events.count)}</b> hail, thunderstorm-wind and tornado reports in Texas, 2015–2025. Pillars mark the most damaging events. Hazard alone, though, says nothing about homes or insurance.`,
    },
    {
      title: "Hail: the Plains and the I-35 corridor",
      patch: { ...base(), perils: [true, false, false], heightMetric: "eventsPerYear", colorMetric: "reportsPer1kHomes" }, view: "both",
      text: (values) => `Height = hail reports per year; colour = reports per 1,000 homes. Counts peak in the Panhandle and around Dallas–Fort Worth, but per home the most exposed places are small counties: ${names(top(data, values, "reportsPer1kHomes", 3, 1000), (v) => v.toFixed(2))} reports per 1,000 homes a year.`,
    },
    {
      title: "Exposure: where the homes and value are",
      patch: { ...base(), heightMetric: "ownerValue", colorMetric: "medianYearBuilt" }, view: "prisms",
      text: () => `Height = owner-occupied homes × median value (Census ACS 2020–2024). Five metro counties hold most of it. Colour = median year built: the brightest counties have the oldest housing, and so the oldest roofs, which matters for hail.`,
    },
    {
      title: "Thin coverage where hail is heavy",
      patch: { ...base(), heightMetric: "significantPerYear", colorMetric: "coverageRatio", selection: { type: "set", fips: fips(data, ["Archer", "Jones", "Martin"]) } }, view: "both",
      text: () => `Colour = TDI homeowners policies per ACS owner-occupied home (a take-up proxy). Statewide it is <b>${(totals.pif / totals.owner).toFixed(2)}</b>. In hail-heavy rural Archer and Jones counties it is about 0.4: many homes there may carry no homeowners policy, or only dwelling, farm or surplus-lines cover this measure misses.`,
    },
    {
      title: "Pullback is coastal",
      patch: { ...base(), heightMetric: "significantPerYear", colorMetric: "nonrenewalRate", showTwia: true }, view: "prisms",
      text: (values) => `Colour = homeowners nonrenewals per 1,000 policies, from TDI's new HB 2067 reports (Apr–Jun 2026). Statewide: <b>${((totals.non / totals.pol) * 1000).toFixed(1)}</b>. Highest: ${names(top(data, values, "nonrenewalRate"), (v) => v.toFixed(1))}. The blue outline is the TWIA coastal catastrophe area. These are not the tallest storm prisms.`,
    },
    {
      title: "What insurers say: wind and hurricane, on the coast",
      patch: { ...base(), perils: [true, false, false], heightMetric: "reportsPer1kHomes", colorMetric: "windHailShare", showTwia: true }, view: "prisms",
      text: (values) => `Colour = share of homeowners nonrenewal and declination notices citing wind/hail/hurricane exposure (reason G). Highest: ${names(top(data, values, "windHailShare"), (v) => `${Math.round(v * 100)}%`)}. The scatter's rank correlation with hail rates is negative: insurers' wind/hail reasons follow hurricane exposure, which these hail/wind/tornado reports do not cover. Open the reasons panel for any county.`,
    },
    {
      title: "Insured losses: where they don't follow the storms",
      patch: { ...base(), yearFrom: 2019, heightMetric: "significantPerYear", colorMetric: "baselineRatio" }, view: "prisms",
      text: (values) => {
        const above = data.countyList.map((c, i) => ({ c, v: values[i] })).filter((d) => d.v.baselineInFit && d.v.baselineZ != null)
          .sort((a, b) => b.v.baselineZ - a.v.baselineZ).slice(0, 3);
        return `Colour = TDI paid loss per homeowners policy (2019–2025) ÷ what an exploratory baseline expects from storm density, NOAA damage per home and home value. Bright counties lose more per policy than their storms and homes would suggest: ${above.map((d) => `${d.c.name} ${d.v.baselineRatio.toFixed(1)}×`).join(", ")}. Open “Why is this county unusual?” on any county to trace the pattern to perils, years and events. Associations only, not causes.`;
      },
    },
    {
      title: "Your turn",
      patch: { ...base() }, view: "both",
      text: () => `Pick any metric for height and colour, filter perils and years, brush the scatter, or click a county. Remember the caveats: NOAA damage is not insured loss, and the HB 2067 data covers only three months so far.`,
    },
  ];
}

/** Wire the story overlay: open/close, previous/next. */
export function createStory(root, { chapters, apply }) {
  let index = 0;
  const el = d3.select(root);
  const step = el.select(".story__step"), title = el.select(".story__title"), body = el.select(".story__text");
  function show(i) {
    index = Math.max(0, Math.min(chapters.length - 1, i));
    const chapter = chapters[index];
    const values = apply(chapter);
    step.text(`${index + 1} / ${chapters.length}`);
    title.text(chapter.title);
    body.html(chapter.text(values));
    el.select(".story__prev").attr("disabled", index === 0 ? true : null);
    el.select(".story__next").text(index === chapters.length - 1 ? "Explore ✓" : "Next →");
  }
  el.select(".story__prev").on("click", () => show(index - 1));
  el.select(".story__next").on("click", () => (index === chapters.length - 1 ? close() : show(index + 1)));
  el.select(".story__close").on("click", () => close());
  function open(chapter = 0) { el.attr("hidden", null); show(chapter); }
  function close() { el.attr("hidden", true); }
  return { open, close };
}
