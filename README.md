# InsurViz · Severe weather and homeowners insurance losses across Texas

**InsurViz is an interactive visual analytics system for exploring the relationship between severe weather, property exposure, and homeowners insurance losses across Texas counties.**

Live: https://insurviz.web.app · deep links: `?county=Harris&compare=Dallas,Tarrant&metric=residual`

InsurViz integrates event-level severe-weather records, county-level homeowners insurance outcomes, and property exposure to support interactive discovery of geographic and temporal **discordance** between hazard and insured loss. Coordinated views let an analyst move from statewide patterns to anomalous counties and trace those patterns back to contributing hazards and extreme events.

**Target user:** a Texas property-insurance risk analyst asking not only *where are losses high?* but *why does this county look unusual?*

**Workflow:** Overview → Compare → Detect anomalies → Explain → Drill down
(WHERE is something unusual → WHAT metric makes it unusual → HOW does it compare with exposure and storm activity → WHICH peril contributes → WHEN did it emerge → WHICH events contributed).

## Research questions

| | Question | Where in the interface |
|---|---|---|
| RQ1 | How do storm activity, exposure and insured losses vary across counties? | County map (switchable metric) |
| RQ2 | Do counties with more storm activity have greater insured losses? | Hazard vs insurance scatterplot (fit line, ±1.5 SD band, r) |
| RQ3 | How does the picture change when losses are normalised? | Map metrics grouped *absolute* vs *normalised*; profile and explanation flag rank changes |
| RQ4 | Which counties are unusually high or low given storms and exposure? | Exploratory baseline residuals, anomaly list, discordance types |
| RQ5 | Which perils, years and events drive an unusual pattern? | Profile compositions, annual small multiples, event drill-down |

## Data (county FIPS × year, 2019–2025)

| Dataset | Use | Granularity | Version | Key limitations |
|---|---|---|---|---|
| NOAA NCEI Storm Events (details files) | Hazard: hail, thunderstorm wind, tornado; counts, magnitude, property/crop damage, casualties, lat/lon | Event → county × year | files c2026-03-23 to c2026-08-19 | Damage is an NWS **estimate, not insured loss**; 15.6% of events have blank damage (treated as unknown, not $0) |
| TDI, *Texas homeowners losses by county* | Insurance outcome: paid losses by loss type, policies in force | County × calendar year | page updated 6/22/2026 | Homeowners only (no renters, condo, dwelling); **excludes TWIA wind/hail**; TDI "Wind" = wind + hail (verified against statewide figures) |
| TDI, *Homeowners market overview* | Premiums | County × year | – | **Not integrated**: export only via an interactive Tableau view behind a bot check. Premium metrics show *n/a*; add the export as `raw/tdi_ho_premium_by_county.csv` and rebuild |
| Census ACS 5-year (table-based summary files) | Exposure normalisation: housing units, owner-occupied units, median home value, households, population, income | County | vintages 2017–2021 to 2020–2024 | Year → vintage mapping is stored per row (`acs_vintage`); 2019–2020 use 2017–2021, 2025 uses 2020–2024 |

Conventions: **0 = measured zero, null = unavailable.** Statewide TDI totals reconcile with TDI's published figures (e.g. 2025: $8.75B). One county-year is missing (Loving 2019). Eighteen TDI cells report net negative paid losses and are kept as reported.

### Derived metrics and compatibility

| Metric | Numerator / denominator | Compatibility |
|---|---|---|
| Loss per policy | TDI paid HO losses ÷ TDI HO policies in force | compatible |
| Loss per owner-occupied home | TDI paid HO losses ÷ ACS owner-occupied units | approximate |
| Loss per housing unit | TDI paid HO losses ÷ ACS housing units | mixed (crude) |
| Loss per $1,000 of estimated home value | TDI paid HO losses ÷ (ACS owner units × median value) | estimated |
| NOAA damage per event, per housing unit, top-1/3/5 event share | NOAA reported damage | estimate of all property damage |
| Loss ratio | – | **not computed** (no compatible county premium) |

## Anomaly baseline (exploratory, not causal)

`log(loss per policy) ~ log(1 + storm events per 1,000 km² per year) + log(1 + NOAA damage per owner home) + log(median home value)`, OLS on counties with ≥ 500 policies outside the TWIA area. Residual ratio = observed ÷ expected; |z| ≥ 1.5 flags an anomaly. Discordance types use Texas percentiles (e.g. *high storm · low loss*, *low exposure · high normalised loss*). The "Why is this county unusual?" panel lists deterministic, computed statements (percentile gaps, ratio to the Texas median and to peer counties, dominant peril, top-3 event share, peak years, loss mix) plus data caveats.

## Interpretation

NOAA estimated damage is not insured loss. Associations are not causal effects. Premiums and losses reflect many factors beyond recent local storms (construction, roof age, deductibles, policy forms, claim practices, market mix). The datasets use different reporting procedures and time definitions. Missing values are never treated as zero.

## Rebuild

```bash
python3 scripts/build_county_year.py --raw raw --out data
```

`raw/` needs `noaa/tx_YYYY.csv` (Texas rows of the NCEI details files 2019–2025), `tdi_ho_losses_by_county.csv` (from https://www.tdi.texas.gov/general/documents/home-owners-losses-by-county-25.csv), `acs/tx_{2021..2024}_{b01003,b11001,b25001,b25002,b25003,b25077,b19013}.csv` (ACS table-based summary files, Texas county rows) and `counties-10m.json` (us-atlas).

Run locally: `python3 -m http.server 8000`.

## Code

```
js/config.js        metric catalogue (definitions, units, compatibility), settings
js/data.js          load county-year table, events, geometry
js/model.js         period aggregation, percentiles, baseline regression, discordance, peers
js/explain.js       deterministic "why unusual" findings
js/views/*.js       map, scatter, temporal, profile, explainPanel, anomalies, events, compare, methodology
scripts/build_county_year.py   NOAA + TDI + ACS integration
```

Built with D3.js. CSCE 679 Data Visualization, Team 8 (Texas A&M): Aadi Mahajan · Abhinav Sheshadri · Hendro Setyawan · MD Imtiaz Mahi.
