/**
 * story.js
 * ---------------------------------------------------------------------------
 * A guided tour of insurance-first findings (2019–2025). Each chapter sets the lenses, filters and
 * selection, flies the camera, and explains what to look at. Every number in
 * the text is computed from the loaded data when the chapter opens, so the
 * story cannot drift from the views.
 */

import { FIRST_YEAR, LAST_YEAR } from "./config.js";

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
  const base = () => ({ ...initialState(), yearFrom: FIRST_YEAR, yearTo: LAST_YEAR });
  const sumRows = (key) => d3.sum(data.countyList, (c) => d3.sum(c.lossRows, (r) => (r[key] > 0 ? r[key] : 0)));
  const topBy = (values, key, n = 3, min = 1000) => data.countyList.map((c, i) => ({ c, v: values[i][key], p: values[i].avgPolicies }))
    .filter((d) => d.v != null && d.p >= min).sort((a, b) => b.v - a.v).slice(0, n);

  return [
    {
      title: "Where Texas pays homeowners losses",
      patch: { ...base(), heightMetric: "paidLoss", colorMetric: "lossPerPolicy" }, view: "prisms",
      text: (values) => `Height = TDI paid homeowners losses per year; colour = paid loss per policy (2019–2025). Insurers paid <b>${formatMoneyShort(sumRows("tdi_paid_loss"))}</b> on Texas homeowners policies over these seven years (TDI, excluding renters, condo, dwelling and TWIA wind/hail). Largest per year: ${topBy(values, "paidLoss").map((d) => `${d.c.name} ${formatMoneyShort(d.v)}`).join(", ")}.`,
    },
    {
      title: "Normalise: per policy and per $1,000 of property value",
      patch: { ...base(), heightMetric: "lossPerPolicy", colorMetric: "lossPer1kValue" }, view: "prisms",
      text: (values) => `Big metros dominate absolute losses only because they hold most policies. Height = paid loss per policy; colour = paid loss per $1,000 of Census property value (owner homes × median value, ACS). Highest per policy (≥ 1,000 policies): ${topBy(values, "lossPerPolicy").map((d) => `${d.c.name} ${formatMoneyShort(d.v)}`).join(", ")}.`,
    },
    {
      title: "Storms vs insured loss: the mismatch",
      patch: { ...base(), heightMetric: "paidLoss", colorMetric: "mismatch" }, view: "prisms",
      text: (values) => {
        const mm = data.countyList.map((c, i) => ({ c, v: values[i].mismatch })).filter((d) => d.v != null);
        const up = mm.filter((d) => d.v >= 30).sort((a, b) => b.v - a.v), down = mm.filter((d) => d.v <= -30).sort((a, b) => a.v - b.v);
        return `Colour = Texas percentile of paid loss per policy minus percentile of storm reports per 1,000 km². <b style="color:#fb923c">Red</b>: ${up.length} counties lose far more per policy than their storm record suggests (e.g. ${up.slice(0, 3).map((d) => d.c.name).join(", ")}). <b style="color:#60a5fa">Blue</b>: ${down.length} counties see many storms but low insured loss (e.g. ${down.slice(0, 3).map((d) => d.c.name).join(", ")}). The mismatch matrix and the storm-year vs loss-year chart show why.`;
      },
    },
    {
      title: "Thin coverage where hail is heavy",
      patch: { ...base(), heightMetric: "significantPerYear", colorMetric: "coverageRatio", selection: { type: "set", fips: fips(data, ["Archer", "Jones", "Martin"]) } }, view: "prisms",
      text: () => `Colour = TDI homeowners policies per Census owner-occupied home (a take-up proxy). In hail-heavy rural Archer and Jones counties it is about 0.4, against about 0.8 statewide: many homes may carry no homeowners policy, so storm damage there may never appear in TDI paid losses.`,
    },
    {
      title: "Premiums climbed everywhere",
      patch: { ...base(), heightMetric: "paidLoss", colorMetric: "premiumChange" }, view: "prisms",
      text: (values) => `Colour = change in TDI average premium (policies with wind), 2019 to 2025. Median county change: <b>${formatPercentShort(d3.median(values, (v) => v.premiumChange))}</b>. Largest rises: ${topBy(values, "premiumChange").map((d) => `${d.c.name} ${formatPercentShort(d.v)}`).join(", ")}. Premium is an average per policy, so no loss ratio is computed.`,
    },
    {
      title: "Pullback is coastal",
      patch: { ...base(), heightMetric: "paidLoss", colorMetric: "nonrenewalRate", showTwia: true }, view: "prisms",
      text: (values) => `Colour = homeowners nonrenewals per 1,000 policies (TDI HB 2067, Apr–Jun 2026). Highest: ${top(data, values, "nonrenewalRate").map((d) => `${d.c.name} ${d.v.toFixed(1)}`).join(", ")}. The blue outline is the TWIA coastal catastrophe area.`,
    },
    {
      title: "What insurers say, ZIP by ZIP",
      patch: { ...base(), heightMetric: "reportsPer1kHomes", colorMetric: "windHailShare", showTwia: true }, view: "prisms",
      text: (values) => `Colour = share of homeowners nonrenewal and declination notices citing wind/hail/hurricane exposure (reason G). Highest: ${top(data, values, "windHailShare").map((d) => `${d.c.name} ${Math.round(d.v * 100)}%`).join(", ")}. On 23 Sep 2026 TDI opened a ZIP lookup of these reasons; the ZIP panel shows the same data for any county you select.`,
    },
    {
      title: "Insured losses vs. an exploratory baseline",
      patch: { ...base(), heightMetric: "paidLoss", colorMetric: "baselineRatio" }, view: "prisms",
      text: (values) => {
        const above = data.countyList.map((c, i) => ({ c, v: values[i] })).filter((d) => d.v.baselineInFit && d.v.baselineZ != null).sort((a, b) => b.v.baselineZ - a.v.baselineZ).slice(0, 3);
        return `Colour = paid loss per policy ÷ what a simple model expects from storm density, NOAA damage per home and home value. Highest: ${above.map((d) => `${d.c.name} ${d.v.baselineRatio.toFixed(1)}×`).join(", ")}. Open “Why is this county unusual?” on any county. Associations only, not causes.`;
      },
    },
    {
      title: "Your turn",
      patch: { ...base() }, view: "prisms",
      text: () => `Pick metrics for height and colour, click a county, or use the mismatch matrix. Caveats: NOAA damage is not insured loss; TDI losses exclude renters, condo, dwelling and TWIA wind/hail; HB 2067 covers three months so far.`,
    },
  ];
}
const formatMoneyShort = (v) => (v == null ? "—" : "$" + d3.format(".3~s")(v).replace("G", "B"));
const formatPercentShort = (v) => (v == null ? "—" : d3.format(".0%")(v));

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
