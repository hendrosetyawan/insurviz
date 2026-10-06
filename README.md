# InsurViz · Storm Damage Risk Analytics

Showcase 3D visual analytics of NOAA severe-weather history for
property-insurance risk analysis, built with Three.js and D3.js. CSCE 679 Data Visualization, Team 8 (Texas A&M):
Aadi Mahajan · Abhinav Sheshadri · Hendro Setyawan · MD Imtiaz Mahi.

**Live:** https://insurviz.web.app  ·  light map: `?view=lights`, columns: `?view=columns`

## The problem

Property-insurance analysts need to understand how severe-weather hazards vary
across **location, peril, severity and time**. NOAA's Storm Events Database
holds the history (about 309,000 hail, thunderstorm-wind and tornado events
from 2015 to 2025), but as rows that are hard to compare at scale. InsurViz
supports the analyst's judgement; it does not replace it with a single score.

## Design requirements → views

| Req. | Requirement | Task | View |
|---|---|---|---|
| R1 | Geographic comparison | Compare regions | 3D hex-column map + state ranking (total or per 100k residents per year) |
| R2 | Peril composition | Summarize and compare the peril mix | Column segments by peril; share-of-events vs share-of-damage bars |
| R3 | Temporal change | Discover temporal trends | Year filter + playback; yearly stacked bars; month-of-year profile |
| R4 | Event investigation | Locate and inspect key events | Most damaging events with NWS narratives; click to light the event on the map |

All views are linked: choosing a metric, peril, year window, map cell or state
updates everything at once.

## The 3D stage

- **Light map** (default): every NOAA report is a glowing point coloured by
  peril; significant or damaging events glow larger. Filtered-out events
  fade away and events outside the selection dim.
- **Damage pillars**: light pillars with pulsing hexagonal shockwaves mark the
  12 most damaging events in the current filters (pillar height grows with
  NOAA-reported damage). The same events scroll in the bottom ticker.
- **Columns** (switch with "3D view"): stacked hexagon columns, described below.
- **Ambience**: radar sweep, range rings, bloom glow and an auto-orbit that
  stops as soon as you drag.

The D3 panels add a radial **peril clock** (month-of-year stacked radial bars,
R3) and count-up KPI tiles.

### Hex columns

The map is a stacked hexagon-column map in the style of a glowing "light map".

- **Columns:** each map cell (hexagon, about 15 km across) becomes a column.
- **Height** is the chosen metric on a square-root scale: event count,
  significant events (hail ≥ 2 in, wind ≥ 65 kt, every tornado), or
  NOAA-reported damage.
- **Segments:** each column is split into peril segments sorted by share, with
  the largest on top. Seen from above, the cap colour is the cell's dominant
  peril; the sides show the full mix.

Drag to orbit, scroll to zoom, right-drag to pan. Hover a column for values;
click it to select that cell.

## Data and caveats

- **Source:** NOAA NCEI Storm Events Database "details" files (hail,
  thunderstorm wind, tornado), 2015–2025.
- **Damage:** NOAA property-damage values are **estimates entered by the
  National Weather Service, not insured losses** (NWS Instruction 10-1605).
  Many are blank or rough, so InsurViz shows how often the damage field is
  filled and how many wind gusts were measured rather than estimated.
- **Population:** state populations for per-100k rates come from a
  Census-derived county table (JHU CSSE lookup).

`scripts/build_data.py` rebuilds `data/events.bin`, `data/events.json` and
`data/details.json` from the NOAA CSV files.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Code

```
index.html, css/style.css
js/config.js          every setting (colours, sizes, metrics, paths)
js/data.js            load the packed events + maps, project points
js/aggregate.js       hexbin + one-pass aggregation for all views
js/state.js           shared store that links the views
js/scene/stormScene.js  Three.js stage (columns, outlines, picking, glow, camera)
js/scene/eventParticles.js  light map (shader points)
js/scene/shockwaves.js  damage pillars + rings
js/scene/radarSweep.js  decorative sweep
js/panels/*.js        D3 panels: KPIs, R1 ranking, R2 composition, R3 timeline + peril clock, R4 events, ticker
js/main.js            wiring
```

Built with D3.js v7, Three.js and topojson; hosted on Firebase Hosting.
