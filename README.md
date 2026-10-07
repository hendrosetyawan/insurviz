# InsurViz Texas · Where severe storms meet the homeowners insurance market

3D visual analytics for all 254 Texas counties, joining three public lenses
that are usually looked at separately:

| Lens | Source | What it says |
|---|---|---|
| **Hazard** | NOAA NCEI Storm Events, hail + thunderstorm wind + tornado, 2015–2025 (25,867 Texas reports) | what the weather did |
| **Exposure** | U.S. Census Bureau ACS 5-year 2020–2024 (housing units, owner-occupied homes, median value, year built, income) | what homes are in harm's way |
| **Insurance market** | Texas Department of Insurance via data.texas.gov: homeowners policies in force (2026 Q1), **HB 2067** declinations / cancellations / nonrenewals and their reasons (Apr–Jun 2026), homeowners complaints | how coverage is behaving |

**Live:** https://insurviz.web.app · guided story: https://insurviz.web.app/?story=1

## Positioning

Texas logs more hail, thunderstorm-wind and tornado reports than any other
state in NOAA's Storm Events Database (2015–2025), and in 2026 its regulator
began publishing something new: under **HB 2067**
(89th Legislature), insurers report, by ZIP code and month, every homeowners
declination, cancellation and nonrenewal *and the reason*. Reasons include
"exposure to loss – wind/hail/hurricane" and "condition of property – roof".

InsurViz puts that market signal next to the storm record and the housing
stock, county by county. It is built for regulators, insurance analysts,
researchers and journalists who ask:

* Are insurers pulling back where storms actually hit, or somewhere else?
* Where is homeowners coverage already thin relative to the number of owner-occupied homes?
* What reasons do insurers give, and do weather reasons line up with weather history?

### What is new

1. **Three lenses, one county.** Hazard, exposure and market are never folded
   into a single risk score. The 3D prism map encodes two lenses at once
   (height and colour, any metric). The three-lens profile shows every lens with
   its Texas percentile.
2. **TDI's new HB 2067 data, beside the storm record.** Nonrenewal and
   declination rates per 1,000 homeowners policies (ZIP → county via the Census
   ZCTA relationship file) and reason shares, published since spring 2026.
3. **Coverage-gap proxy.** TDI homeowners policies in force ÷ ACS owner-occupied homes.
4. **Findings it surfaces** (from the data, see the guided story):
   * Nonrenewals concentrate on the coast (Cameron, Victoria, Orange, Nueces),
     not in the hail-heaviest counties.
   * Notices citing wind/hail/hurricane are most common in coastal counties
     (Aransas, Harris, Chambers). Their rank correlation with hail reports per
     home is *negative*, pointing to hurricane exposure rather than hail history.
   * Hail-heavy rural counties (e.g. Archer, Jones) have about 0.4 homeowners
     policies per owner-occupied home, against 0.83 statewide.

## Views (linked)

| | View | Requirement |
|---|---|---|
| 3D | County prisms (height + colour = any two metrics), storm lights (every report on its county's roof), damage pillars and shockwaves, TWIA coastal outline | R1, R2 |
| | Ranking + county search | R1 Geographic comparison |
| | Three-lens profile with Texas percentiles | all lenses |
| | Height-vs-colour scatter with quadrant medians, brushing and Spearman ρ | lens comparison |
| | Peril composition (reports vs NOAA damage) | R2 Peril composition |
| | Yearly storm reports + statewide TDI homeowners complaints; radial peril clock | R3 Temporal change |
| | Why insurers say no (HB 2067 reasons, weather reasons highlighted) | market lens |
| | Most damaging reports with NWS narratives, fly-to | R4 Event investigation |
| | Guided story (7 chapters, numbers computed live), `?story=N` deep links | presentation |

## Caveats

* **Different periods:** NOAA 2015–2025, ACS 2020–2024, policies in force
  2026 Q1, HB 2067 actions Apr–Jun 2026 (three months), HB 2067 policy counts as of
  2025-12-31.
* **NOAA damage** is a National Weather Service estimate, **not insured loss**.
* **NOAA layers** are hail, thunderstorm wind and tornado only. Hurricanes and
  floods are not included.
* **Coverage ratio** is a proxy and can exceed 1: policies are counted by
  TDI's county assignment, and some homes carry dwelling, farm or surplus-lines
  cover instead.
* **ZIP → county** uses the largest land-area overlap (99.9% of policies matched).
* **Correlations** are rank associations across counties, not causal effects.
* Rates are hidden (grey) for counties with fewer than 500 homeowners policies.

## Rebuilding the data

```bash
mkdir -p raw && cd raw
# Census ACS 5-year 2024 county tables (keyless summary files; keep Texas rows)
for t in b01003 b25001 b25003 b25077 b25035 b19013; do
  curl -s -o $t.dat https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-$t.dat
  head -1 $t.dat > tx_$t.csv && grep '^0500000US48' $t.dat >> tx_$t.csv && rm $t.dat
done
curl -s -o zcta_county.txt https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt
curl -s -o counties-10m.json https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json
# Texas Department of Insurance (data.texas.gov)
curl -s -o tdi_pif_county.csv        "https://data.texas.gov/resource/8mvr-4gj9.csv?\$limit=20000"
curl -s -o tdi_hb2067_policies.csv   "https://data.texas.gov/resource/vyxq-akit.csv?\$limit=100000"
curl -s -o tdi_hb2067_actual.csv     "https://data.texas.gov/resource/m7yx-zxf2.csv?\$limit=100000"
curl -s -o tdi_hb2067_reasons.csv    "https://data.texas.gov/resource/3efz-d6qn.csv?\$select=action_type,policy_type,reason_code,zip,sum(policy_count)%20as%20n&\$group=action_type,policy_type,reason_code,zip&\$limit=500000"
curl -s -o tdi_complaints_home_monthly.csv "https://data.texas.gov/resource/ubdr-4uff.csv?\$select=date_trunc_ym(received_date)%20as%20month,reason,count(*)%20as%20n&\$where=coverage_type='Homeowners'&\$group=month,reason&\$limit=200000"
cd ..
python3 scripts/build_texas.py --raw raw --noaa path/to/noaa_events.pkl
```

Code tables (action types 80/81/82, policy types, reason letters) come from the
TDI *Texas Statistical Plan for Residential Risks* (effective 2026), Sections E–G.

## Run locally

```bash
python3 -m http.server 8000
```

## Code

```
js/config.js            settings + metric catalogue (lens, scale, risk direction, notes)
js/data.js              load files, Texas projection, project counties and reports
js/metrics.js           join lenses per county, one-pass aggregation, percentiles
js/scales.js            prism height and quantile colour scales (shared by all views)
js/state.js             store that links the views
js/story.js             guided story chapters
js/scene/texasScene.js  Three.js stage: prisms, picking, camera fly-to, bloom
js/scene/eventParticles.js, shockwaves.js, radarSweep.js, geo.js
js/panels/*.js          D3 panels: kpis, ranking, profile, scatter, composition,
                        timeline (+ peril clock), reasons, eventTable, ticker, legend
scripts/build_texas.py  builds data/tx_*.json from the raw sources
```

Built with Three.js and D3.js. CSCE 679 Data Visualization, Team 8 (Texas A&M):
Aadi Mahajan · Abhinav Sheshadri · Hendro Setyawan · MD Imtiaz Mahi.
