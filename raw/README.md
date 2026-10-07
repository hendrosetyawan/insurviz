# Raw source data

Inputs used by `scripts/build_county_year.py` (county × year 2019–2025) and `scripts/build_texas.py` (HB 2067 / exposure layer). All public sources; downloaded October 2026.

| File(s) | Source | Notes |
|---|---|---|
| `noaa/tx_2019.csv` … `tx_2025.csv` | NOAA NCEI Storm Events Database, details files (versions c2026-03-23 to c2026-08-19) | Texas rows only (STATE_FIPS = 48), all event types |
| `tdi_ho_losses_by_county.csv` | TDI, *Texas homeowners losses by county* — https://www.tdi.texas.gov/general/documents/home-owners-losses-by-county-25.csv | Paid losses by loss type and policies in force, 2019–2025 (page updated 6/22/2026) |
| `tdi_ho_premium_by_county.csv` | TDI, *Texas homeowners insurance market overview* map (Tableau Public view HO_Avg_Prem_Map_County_2019-2025) | Read per year from the public view; verified against in-view row counts and column sums |
| `tdi_pif_county.csv` | data.texas.gov 8mvr-4gj9 | Residential and farm policies in force by county, 2026 Q1 |
| `tdi_hb2067_policies.csv`, `tdi_hb2067_actual.csv`, `tdi_hb2067_reasons.csv` | data.texas.gov vyxq-akit, m7yx-zxf2, 3efz-d6qn | HB 2067 policy counts, actions and reasons by ZIP (reasons aggregated by action, policy type, reason code, ZIP) |
| `tdi_complaints_home_monthly.csv` | data.texas.gov ubdr-4uff | Homeowners complaints aggregated by month and reason |
| `acs/tx_{2021..2024}_{table}.csv`, `tx_b*.csv` | U.S. Census Bureau, ACS 5-year table-based summary files | Texas county rows of B01003, B11001, B19013, B25001, B25002, B25003, B25077 (and B25035 in `tx_b*.csv`, 2020–2024) |
| `zcta_county.txt` | Census 2020 ZCTA-to-county relationship file | ZIP → county (largest land overlap) |
| `counties-10m.json` | us-atlas v3 | County geometry and names |

`scripts/build_texas.py` additionally needs the 2015–2025 NOAA hail/wind/tornado events as a pickled DataFrame (`--noaa`), not stored here because of size; its outputs (`data/tx_*.json`) are committed.
