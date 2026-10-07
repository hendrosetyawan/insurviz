"""
build_county_year.py
--------------------
Integrates NOAA Storm Events, TDI homeowners losses and Census ACS into one
analytical table at  county FIPS x year  (2019-2025), plus an event table for
drill-down.

  0     = measured zero (e.g. no reported events, TDI reported $0)
  null  = unavailable / not reported / not computable

Inputs (--raw):
  noaa/tx_YYYY.csv                    NOAA details files, Texas rows (2019-2025)
  tdi_ho_losses_by_county.csv         TDI "Texas homeowners losses by county" download
  tdi_ho_premium_by_county.csv        OPTIONAL: TDI market-overview map data (premiums)
  acs/tx_{vintage}_{table}.csv        ACS 5-year table-based summary files, Texas counties
  counties-10m.json                   us-atlas county geometry (names, FIPS)

Outputs (--out):
  county_year.json   rows: one per county-year, columns as documented in META["fields"]
  events.json        hail / thunderstorm wind / tornado events for drill-down
  meta.json          sources, vintages, definitions, compatibility notes, caveats
"""
import argparse, glob, json, re
import numpy as np
import pandas as pd

YEARS = list(range(2019, 2026))
PERILS = ["Hail", "Thunderstorm Wind", "Tornado"]
PERIL_KEY = {"Hail": "hail", "Thunderstorm Wind": "wind", "Tornado": "tornado"}
# ACS 5-year vintage used for each analysis year (table-based files exist from 2021)
ACS_VINTAGE = {2019: 2021, 2020: 2021, 2021: 2021, 2022: 2022, 2023: 2023, 2024: 2024, 2025: 2024}
ACS_TABLES = {
    "b01003": {"population": "B01003_E001"},
    "b11001": {"households": "B11001_E001"},
    "b25001": {"housing_units": "B25001_E001"},
    "b25002": {"occupied_units": "B25002_E002"},
    "b25003": {"owner_occupied_units": "B25003_E002"},
    "b25077": {"median_home_value": "B25077_E001"},
    "b19013": {"median_household_income": "B19013_E001"},
}
TWIA_COUNTIES = ["Aransas", "Brazoria", "Calhoun", "Cameron", "Chambers", "Galveston", "Jefferson",
                 "Kenedy", "Kleberg", "Matagorda", "Nueces", "Refugio", "San Patricio", "Willacy"]
NARRATIVE_CHARS = 280


def parse_damage(value):
    """'10.00K' -> 10000; '0.00K' -> 0 (measured zero); blank -> NaN (not reported)."""
    if pd.isna(value) or str(value).strip() == "":
        return np.nan
    text = str(value).strip().upper()
    scale = {"K": 1e3, "M": 1e6, "B": 1e9}
    try:
        return float(text[:-1]) * scale[text[-1]] if text[-1] in scale else float(text)
    except ValueError:
        return np.nan


def money(series):
    """TDI money text: '$1,234 ' -> 1234; '($452)' -> -452 (negative paid losses kept)."""
    s = series.astype(str).str.strip()
    neg = s.str.startswith("(")
    v = pd.to_numeric(s.str.replace(r"[$,()% ]", "", regex=True), errors="coerce")
    return v.where(~neg, -v)


# ----------------------------------------------------------------------------- NOAA
def load_noaa(raw):
    frames = [pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(f"{raw}/noaa/tx_*.csv"))]
    ev = pd.concat(frames)
    ev = ev[ev.EVENT_TYPE.isin(PERILS) & (ev.CZ_TYPE == "C")].copy()
    ev["year"] = ev.BEGIN_YEARMONTH // 100
    ev = ev[ev.year.isin(YEARS)]
    ev["county_fips"] = 48000 + ev.CZ_FIPS.astype(int)
    ev["peril"] = ev.EVENT_TYPE.map(PERIL_KEY)
    ev["damage"] = ev.DAMAGE_PROPERTY.map(parse_damage)
    ev["crop_damage"] = ev.DAMAGE_CROPS.map(parse_damage)
    ev["injuries"] = ev.INJURIES_DIRECT.fillna(0) + ev.INJURIES_INDIRECT.fillna(0)
    ev["fatalities"] = ev.DEATHS_DIRECT.fillna(0) + ev.DEATHS_INDIRECT.fillna(0)
    return ev.sort_values(["county_fips", "year", "EVENT_ID"]).reset_index(drop=True)


def top_share(damages, k):
    """Share of the reported damage total carried by the k largest events (null if total <= 0)."""
    d = np.sort(damages[~np.isnan(damages)])[::-1]
    total = d.sum()
    return float(d[:k].sum() / total) if total > 0 else None


def noaa_county_year(ev, fips_list):
    rows = []
    groups = {k: g for k, g in ev.groupby(["county_fips", "year"])}
    for fips in fips_list:
        for year in YEARS:
            g = groups.get((fips, year))
            r = {"county_fips": fips, "year": year}
            if g is None:  # NOAA has no reported events: measured zero for counts and damage
                r.update(storm_count=0, hail_count=0, wind_count=0, tornado_count=0, noaa_property_damage=0.0,
                         noaa_damage_hail=0.0, noaa_damage_wind=0.0, noaa_damage_tornado=0.0, noaa_crop_damage=0.0,
                         damage_reported_events=0, damage_per_event=None, max_event_damage=None,
                         top1_event_damage_share=None, top3_event_damage_share=None, top5_event_damage_share=None,
                         injuries=0, fatalities=0, significant_count=0)
                rows.append(r)
                continue
            dmg = g.damage.to_numpy(dtype=float)
            reported = ~np.isnan(dmg)
            total = float(np.nansum(dmg)) if reported.any() else None  # all blank -> not reported
            r.update(
                storm_count=int(len(g)),
                hail_count=int((g.peril == "hail").sum()),
                wind_count=int((g.peril == "wind").sum()),
                tornado_count=int((g.peril == "tornado").sum()),
                significant_count=int(((g.peril == "tornado") | ((g.peril == "hail") & (g.MAGNITUDE >= 2.0)) |
                                       ((g.peril == "wind") & (g.MAGNITUDE >= 65))).sum()),
                noaa_property_damage=total,
                damage_reported_events=int(reported.sum()),
                damage_per_event=(total / len(g)) if total is not None else None,
                max_event_damage=float(np.nanmax(dmg)) if reported.any() else None,
                top1_event_damage_share=top_share(dmg, 1),
                top3_event_damage_share=top_share(dmg, 3),
                top5_event_damage_share=top_share(dmg, 5),
                noaa_crop_damage=float(np.nansum(g.crop_damage)) if g.crop_damage.notna().any() else None,
                injuries=int(g.injuries.sum()), fatalities=int(g.fatalities.sum()),
            )
            for p in ["hail", "wind", "tornado"]:
                sub = g.damage[g.peril == p]
                r[f"noaa_damage_{p}"] = float(sub.sum()) if sub.notna().any() else (0.0 if len(sub) == 0 else None)
            rows.append(r)
    return pd.DataFrame(rows)


def event_table(ev):
    """Compact columns for the drill-down table."""
    notes = {}
    for i, row in ev.iterrows():
        keep = (row.damage or 0) >= 250_000 or row.peril == "tornado" or (row.peril == "hail" and row.MAGNITUDE >= 3)
        text = row.EVENT_NARRATIVE if isinstance(row.EVENT_NARRATIVE, str) else ""
        if keep and text:
            text = re.sub(r"\s+", " ", text).strip()
            notes[int(i)] = text if len(text) <= NARRATIVE_CHARS else text[:NARRATIVE_CHARS].rsplit(" ", 1)[0] + "…"
    def col(series, digits=None):
        out = []
        for v in series:
            if pd.isna(v): out.append(None)
            elif digits is None: out.append(v if isinstance(v, str) else (int(v) if float(v).is_integer() else float(v)))
            else: out.append(round(float(v), digits))
        return out
    return {
        "count": int(len(ev)),
        "columns": {
            "event_id": col(ev.EVENT_ID), "county_fips": col(ev.county_fips), "year": col(ev.year),
            "date": [str(d)[:15] for d in ev.BEGIN_DATE_TIME],
            "month": col(ev.BEGIN_YEARMONTH % 100), "peril": col(ev.peril),
            "magnitude": col(ev.MAGNITUDE, 2), "magnitude_type": col(ev.MAGNITUDE_TYPE), "tor_f_scale": col(ev.TOR_F_SCALE),
            "damage": col(ev.damage), "crop_damage": col(ev.crop_damage),
            "injuries": col(ev.injuries), "fatalities": col(ev.fatalities),
            "begin_location": col(ev.BEGIN_LOCATION),
            "begin_lat": col(ev.BEGIN_LAT, 3), "begin_lon": col(ev.BEGIN_LON, 3),
            "end_lat": col(ev.END_LAT, 3), "end_lon": col(ev.END_LON, 3),
        },
        "narratives": notes,
    }


# ----------------------------------------------------------------------------- TDI
def load_tdi(raw, name_to_fips):
    d = pd.read_csv(f"{raw}/tdi_ho_losses_by_county.csv", encoding="utf-8-sig", dtype=str)
    d["year"] = d.Year.astype(int)
    d["county_fips"] = d.County.str.replace(" County", "", regex=False).str.strip().str.lower().map(name_to_fips)
    unmatched = sorted(d.County[d.county_fips.isna()].unique())
    d["paid"] = money(d["Paid losses"])
    d["pif"] = money(d["Policies in force"])
    key = {"Total Paid Loss": "tdi_paid_loss", "Wind": "tdi_paid_wind_hail", "Water": "tdi_paid_water",
           "Fire": "tdi_paid_fire", "Other": "tdi_paid_other"}
    d["field"] = d["Loss type"].map(key)
    wide = d.pivot_table(index=["county_fips", "year"], columns="field", values="paid", aggfunc="sum")
    pif = d[d.field == "tdi_paid_loss"].set_index(["county_fips", "year"]).pif.rename("active_policies")
    out = wide.join(pif).reset_index()
    out["county_fips"] = out.county_fips.astype(int)
    negatives = d[d.paid < 0][["year", "County", "Loss type", "paid"]].values.tolist()
    return out, unmatched, negatives


def load_premium(raw, name_to_fips):
    """Optional TDI market-overview export; returns None when the file is not present."""
    path = f"{raw}/tdi_ho_premium_by_county.csv"
    try:
        p = pd.read_csv(path, encoding="utf-8-sig", dtype=str)
    except FileNotFoundError:
        return None
    cols = {c.lower(): c for c in p.columns}
    pick = lambda *names: next((cols[n] for n in names if n in cols), None)
    year_c, county_c = pick("year"), pick("county", "county name")
    prem_c = pick("average premium (with wind)", "avg premium (with wind)", "average premium")
    pol_c = pick("policies (with wind)", "policies")
    cov_c = pick("average coverage", "avg coverage")
    col = lambda name: money(p[pick(name)]) if pick(name) else np.nan
    out = pd.DataFrame({
        "year": p[year_c].astype(int),
        "county_fips": p[county_c].str.replace(" County", "", regex=False).str.strip().str.lower().map(name_to_fips),
        "premium_per_policy": money(p[prem_c]) if prem_c else np.nan,       # avg annual premium, policies with wind
        "premium_policies_with_wind": money(p[pol_c]) if pol_c else np.nan,
        "average_coverage": money(p[cov_c]) if cov_c else np.nan,          # avg insured amount, policies with wind
        "premium_companies": col("companies"),
        "premium_no_wind": col("average premium (no wind)"), "policies_no_wind": col("policies (no wind)"),
        "premium_twia": col("average twia premium"), "policies_twia": col("twia policies"),
        "premium_fair": col("average fair premium"), "policies_fair": col("fair policies"),
    }).dropna(subset=["county_fips"])
    out["county_fips"] = out.county_fips.astype(int)
    return out


# ----------------------------------------------------------------------------- ACS
def load_acs(raw):
    frames = []
    for vintage in sorted(set(ACS_VINTAGE.values())):
        merged = None
        for table, cols in ACS_TABLES.items():
            t = pd.read_csv(f"{raw}/acs/tx_{vintage}_{table}.csv", sep="|", dtype=str)
            t["county_fips"] = t.GEO_ID.str[-5:].astype(int)
            t = t[["county_fips", *cols.values()]].rename(columns={v: k for k, v in cols.items()})
            merged = t if merged is None else merged.merge(t, on="county_fips", how="outer")
        merged["acs_vintage"] = vintage
        frames.append(merged)
    acs = pd.concat(frames)
    for c in [c for cols in ACS_TABLES.values() for c in cols]:
        acs[c] = pd.to_numeric(acs[c], errors="coerce")
        acs.loc[acs[c] < 0, c] = np.nan  # ACS annotation codes (e.g. -666666666) = not available
    return acs


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", default="data")
    args = ap.parse_args()

    geo = json.load(open(f"{args.raw}/counties-10m.json"))
    names = {int(g["id"]): g["properties"]["name"] for g in geo["objects"]["counties"]["geometries"] if g["id"].startswith("48")}
    name_to_fips = {n.lower(): f for f, n in names.items()}
    name_to_fips.update({"dewitt": 48123, "de witt": 48123, "la salle": 48283})
    fips_list = sorted(names)

    ev = load_noaa(args.raw)
    noaa = noaa_county_year(ev, fips_list)
    tdi, tdi_unmatched, tdi_negatives = load_tdi(args.raw, name_to_fips)
    premium = load_premium(args.raw, name_to_fips)
    acs = load_acs(args.raw)

    base = pd.DataFrame([(f, y) for f in fips_list for y in YEARS], columns=["county_fips", "year"])
    base["county_name"] = base.county_fips.map(names)
    base["acs_vintage"] = base.year.map(ACS_VINTAGE)
    df = base.merge(noaa, on=["county_fips", "year"], how="left") \
             .merge(tdi, on=["county_fips", "year"], how="left") \
             .merge(acs, on=["county_fips", "acs_vintage"], how="left")
    if premium is not None:
        df = df.merge(premium, on=["county_fips", "year"], how="left")
    else:
        df["premium_per_policy"] = np.nan

    # derived measures (null when the denominator is missing or not positive)
    def ratio(num, den, scale=1.0):
        return np.where((df[den] > 0) & df[num].notna(), df[num] / df[den].where(df[den] > 0) * scale, np.nan)
    df["twia_county"] = df.county_name.isin(TWIA_COUNTIES)
    df["loss_per_policy"] = ratio("tdi_paid_loss", "active_policies")
    df["estimated_property_exposure"] = df.owner_occupied_units * df.median_home_value
    df["damage_per_housing_unit"] = ratio("noaa_property_damage", "housing_units")
    df["insured_loss_per_housing_unit"] = ratio("tdi_paid_loss", "housing_units")
    df["insured_loss_per_owner_unit"] = ratio("tdi_paid_loss", "owner_occupied_units")
    df["insured_loss_per_1k_exposure"] = ratio("tdi_paid_loss", "estimated_property_exposure", 1000)
    df["noaa_damage_per_1k_exposure"] = ratio("noaa_property_damage", "estimated_property_exposure", 1000)
    df["policies_per_owner_unit"] = ratio("active_policies", "owner_occupied_units")
    statewide = df.groupby("year").tdi_paid_loss.transform("sum")
    df["share_of_statewide_paid_loss"] = np.where(df.tdi_paid_loss.notna(), df.tdi_paid_loss / statewide, np.nan)
    df = df.sort_values(["county_fips", "year"])
    for col, out in [("tdi_paid_loss", "yoy_paid_loss_change"), ("loss_per_policy", "yoy_loss_per_policy_change"),
                     ("premium_per_policy", "yoy_premium_change")]:
        prev = df.groupby("county_fips")[col].shift(1)
        df[out] = np.where((prev > 0) & df[col].notna(), df[col] / prev - 1, np.nan)

    # write rows (NaN -> null)
    records = []
    for row in df.to_dict("records"):
        rec = {}
        for k, v in row.items():
            if isinstance(v, (float, np.floating)):
                rec[k] = None if np.isnan(v) else (int(v) if float(v).is_integer() and abs(v) < 1e15 else round(float(v), 6))
            elif isinstance(v, (np.integer,)): rec[k] = int(v)
            elif isinstance(v, (np.bool_, bool)): rec[k] = bool(v)
            else: rec[k] = v
        records.append(rec)
    json.dump(records, open(f"{args.out}/county_year.json", "w"), separators=(",", ":"))
    json.dump(event_table(ev), open(f"{args.out}/events.json", "w"), separators=(",", ":"))

    missing = df[df.tdi_paid_loss.isna()][["county_name", "year"]].values.tolist()
    noaa_files = sorted(re.sub(r".*/", "", f) for f in glob.glob(f"{args.raw}/noaa/tx_*.csv"))
    meta = {
        "years": YEARS, "acsVintage": ACS_VINTAGE, "twiaCounties": TWIA_COUNTIES,
        "premiumAvailable": premium is not None,
        "quality": {
            "noaaEvents": int(len(ev)),
            "noaaDamageBlankShare": round(float(ev.damage.isna().mean()), 4),
            "tdiUnmatchedCounties": tdi_unmatched,
            "tdiMissingCountyYears": missing,
            "tdiNegativePaidLosses": tdi_negatives,
            "noaaFiles": noaa_files,
        },
    }
    json.dump(meta, open(f"{args.out}/meta.json", "w"), indent=1)
    print(f"{len(df)} county-year rows; {len(ev):,} events; TDI missing {missing}; unmatched {tdi_unmatched}; "
          f"negatives {len(tdi_negatives)}; premium {'yes' if premium is not None else 'not available'}")


if __name__ == "__main__":
    main()
