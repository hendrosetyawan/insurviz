"""
build_texas.py
--------------
Builds the Texas data files InsurViz loads, from three public sources:

  NOAA NCEI Storm Events   hail, thunderstorm wind, tornado reports (2015-2025)
  U.S. Census ACS 5-year   2020-2024 county tables (keyless summary files)
  Texas Dept. of Insurance data.texas.gov:
     8mvr-4gj9  residential & farm policies in force by county (2026 Q1)
     vyxq-akit  HB 2067 active residential policies by ZIP (2025-12-31)
     m7yx-zxf2  HB 2067 actual declinations/cancellations/nonrenewals by ZIP
     3efz-d6qn  HB 2067 reasons for those actions by ZIP
     ubdr-4uff  insurance complaints (homeowners, monthly)

Outputs (data/):
  tx_events.json      one record per storm report, column arrays
  tx_counties.json    per-county ACS + TDI metrics
  tx_complaints.json  statewide homeowners complaints per month
  tx_meta.json        sources, periods, code tables, caveats

Usage:
  python3 scripts/build_texas.py --raw path/to/raw --noaa events.pkl
The raw folder holds the files fetched by the README's download commands.
"""
import argparse, json, re
import numpy as np
import pandas as pd

PERILS = ["Hail", "Thunderstorm Wind", "Tornado"]
TX = 48
ACTIONS = {80: "cancellation", 81: "nonrenewal", 82: "declination"}
POLICY_TYPES = {1: "Tenants", 2: "Condo", 3: "Homeowners", 4: "Dwelling", 5: "Mobile home", 6: "Private flood"}
# TDI Texas Statistical Plan for Residential Risks (eff. 2026), Section E reason codes
REASONS_NONRENEW = {
    "A": "Failure to pay premium", "D": "Claims history", "E": "Liability exposure",
    "F": "Wildfire exposure", "G": "Wind/hail/hurricane exposure", "H": "Insurer concentration of risk",
    "J": "Insurer leaving market", "K": "Location of risk", "L": "Credit or insurance score",
    "M": "Roof condition", "N": "Tree overhang", "P": "Defensible space",
    "Q": "Maintenance/occupancy/vacancy", "R": "Other property condition", "S": "Value of home",
    "T": "Agent no longer appointed", "Z": "Other insurer action",
    # cancellation codes that some insurers also put on nonrenewal/declination notices
    "B": "Increase in hazard", "C": "No inspection report accepted", "X": "Assumption reinsurance (TWIA)",
    "Y": "At insured's request",
}
NARRATIVE_CHARS = 260


def parse_damage(value):
    """NOAA writes damage as '10.00K', '1.5M'; blank means not reported (-1)."""
    if pd.isna(value):
        return -1.0
    text = str(value).strip().upper()
    scale = {"K": 1e3, "M": 1e6, "B": 1e9}
    try:
        return float(text[:-1]) * scale[text[-1]] if text[-1] in scale else float(text)
    except (ValueError, IndexError):
        return -1.0


def read_acs(raw, table, columns):
    df = pd.read_csv(f"{raw}/tx_{table}.csv", sep="|", dtype=str)
    df["fips"] = df.GEO_ID.str[-5:].astype(int)
    out = df[["fips"]].copy()
    for name, col in columns.items():
        out[name] = pd.to_numeric(df[col], errors="coerce")
    return out.set_index("fips")


def zip_to_county(raw):
    """Each ZCTA goes to the Texas county holding most of its land area."""
    rel = pd.read_csv(f"{raw}/zcta_county.txt", sep="|", dtype=str, encoding="utf-8-sig")
    rel = rel[rel.GEOID_COUNTY_20.str.startswith("48", na=False) & rel.GEOID_ZCTA5_20.notna()]
    rel["land"] = pd.to_numeric(rel.AREALAND_PART)
    best = rel.sort_values("land").groupby("GEOID_ZCTA5_20").tail(1)
    return dict(zip(best.GEOID_ZCTA5_20.astype(int), best.GEOID_COUNTY_20.astype(int)))


def build_events(noaa_pickle):
    ev = pd.read_pickle(noaa_pickle)
    ev = ev[(ev.STATE_FIPS.astype(int) == TX) & ev.EVENT_TYPE.isin(PERILS)].copy()
    ev["year"] = ev.BEGIN_YEARMONTH // 100
    ev = ev[(ev.year >= 2015) & (ev.year <= 2025) & ev.BEGIN_LAT.notna()]
    ev["damage"] = ev.DAMAGE_PROPERTY.map(parse_damage)
    ev = ev.sort_values(["BEGIN_YEARMONTH", "BEGIN_DAY", "EVENT_ID"]).reset_index(drop=True)
    peril = ev.EVENT_TYPE.map({p: i for i, p in enumerate(PERILS)})
    mag = np.where(peril == 0, np.round(ev.MAGNITUDE.fillna(0) * 100), np.round(ev.MAGNITUDE.fillna(0))).astype(int)
    columns = {
        "lon": np.round(ev.BEGIN_LON, 3).tolist(), "lat": np.round(ev.BEGIN_LAT, 3).tolist(),
        "county": (TX * 1000 + ev.CZ_FIPS.astype(int)).tolist(),
        "peril": peril.tolist(), "year": ev.year.tolist(), "month": (ev.BEGIN_YEARMONTH % 100).tolist(),
        "day": ev.BEGIN_DAY.astype(int).tolist(), "mag": mag.tolist(),
        "measured": (ev.MAGNITUDE_TYPE == "MG").astype(int).tolist(),
        "damage": [round(d) for d in ev.damage],
        "id": ev.EVENT_ID.astype(int).tolist(),
    }
    # narratives only for the events an analyst is likely to open (R4)
    keep = (ev.damage >= 100_000) | ((peril == 0) & (ev.MAGNITUDE >= 2.75)) | (peril == 2)
    notes = {}
    for idx in ev.index[keep]:
        text = ev.at[idx, "EVENT_NARRATIVE"]
        text = re.sub(r"\s+", " ", text).strip() if isinstance(text, str) else ""
        if len(text) > NARRATIVE_CHARS:
            text = text[:NARRATIVE_CHARS].rsplit(" ", 1)[0] + "…"
        if text:
            notes[int(idx)] = text
    return {"count": len(ev), "perils": PERILS, "columns": columns, "narratives": notes}


def build_counties(raw, zip_county, county_names):
    acs = read_acs(raw, "b01003", {"population": "B01003_E001"}) \
        .join(read_acs(raw, "b25001", {"housingUnits": "B25001_E001"})) \
        .join(read_acs(raw, "b25003", {"occupiedUnits": "B25003_E001", "ownerUnits": "B25003_E002"})) \
        .join(read_acs(raw, "b25077", {"medianHomeValue": "B25077_E001"})) \
        .join(read_acs(raw, "b25035", {"medianYearBuilt": "B25035_E001"})) \
        .join(read_acs(raw, "b19013", {"medianIncome": "B19013_E001"}))
    acs[acs < 0] = np.nan  # ACS jam values (-666666666 etc.)

    # TDI policies in force by county, 2026 Q1 (county names -> FIPS)
    pif = pd.read_csv(f"{raw}/tdi_pif_county.csv").dropna(subset=["year"])
    pif["county"] = pif.county.astype(str).str.strip().str.lower()
    pif["line"] = pif.line.str.strip()
    name_to_fips = {n.lower().replace(" county", ""): f for f, n in county_names.items()}
    name_to_fips.update({"de witt": 48123, "dewitt": 48123, "la salle": 48283})
    pif["fips"] = pif.county.map(name_to_fips)
    unmatched = sorted(set(pif.county[pif.fips.isna()]) - {"zz.state", "zz.missing"})
    pif = pif.dropna(subset=["fips"]).pivot_table(index="fips", columns="line", values="policies_in_force_at_end", aggfunc="sum")
    pif.index = pif.index.astype(int)
    pif = pif.rename(columns={"HO": "pifHomeowners", "DW": "pifDwelling", "TN": "pifTenants", "FR": "pifFarmRanch", "FRO": "pifFarmRanchOwners"})

    # HB 2067: ZIP -> county
    pol = pd.read_csv(f"{raw}/tdi_hb2067_policies.csv")
    pol["fips"] = pol.zip.map(zip_county)
    zip_match_policies = pol.policy_count[pol.fips.notna()].sum() / pol.policy_count.sum()
    ho_policies = pol[pol.policy_type == 3].groupby("fips").policy_count.sum().rename("hoPoliciesZip")
    res_policies = pol.groupby("fips").policy_count.sum().rename("resPoliciesZip")

    act = pd.read_csv(f"{raw}/tdi_hb2067_actual.csv")
    act["fips"] = act.zip.map(zip_county)
    months = sorted(act.effective_date.unique(), key=lambda m: (m[-4:], m[:2]))
    ho = act[act.policy_type == 3].pivot_table(index="fips", columns="action_type", values="policy_count", aggfunc="sum").fillna(0)
    ho.columns = ["ho" + ACTIONS[c].capitalize() + "s" for c in ho.columns]
    res = act.pivot_table(index="fips", columns="action_type", values="policy_count", aggfunc="sum").fillna(0)
    res.columns = ["res" + ACTIONS[c].capitalize() + "s" for c in res.columns]

    # reasons: homeowners nonrenewal + declination notices, split concatenated letter codes
    rea = pd.read_csv(f"{raw}/tdi_hb2067_reasons.csv")
    rea = rea[(rea.policy_type == 3) & rea.action_type.isin([81, 82])].copy()
    rea["fips"] = rea.zip.map(zip_county)
    rea["letters"] = rea.reason_code.astype(str).str.replace("0", "").map(list)
    rea = rea.explode("letters").dropna(subset=["letters", "fips"])
    reasons = rea.pivot_table(index="fips", columns="letters", values="n", aggfunc="sum").fillna(0)
    notices = rea.drop_duplicates(["action_type", "reason_code", "zip"]).groupby("fips").n.sum().rename("hoNoticesWithReasons")

    df = acs.join(pif).join(ho_policies).join(res_policies).join(ho).join(res).join(notices)
    df.index = df.index.astype(int)
    df = df[df.index // 1000 == TX]
    records = {}
    for fips, row in df.iterrows():
        rec = {k: (None if pd.isna(v) else (int(v) if float(v).is_integer() else round(float(v), 2))) for k, v in row.items()}
        rec["name"] = county_names.get(fips, str(fips))
        rec["reasons"] = {k: int(v) for k, v in reasons.loc[fips].items() if v > 0} if fips in reasons.index else {}
        records[int(fips)] = rec
    stats = {"zipPolicyShareMatched": round(float(zip_match_policies), 4), "pifUnmatchedCounties": unmatched, "hb2067Months": months}
    return records, stats


def build_complaints(raw):
    c = pd.read_csv(f"{raw}/tdi_complaints_home_monthly.csv")
    c["month"] = c.month.str[:7]
    c["claims"] = c.reason.fillna("").str.contains("Claim|Settle", case=False)
    total = c.groupby("month").n.sum()
    claims = c[c.claims].groupby("month").n.sum()
    out = pd.DataFrame({"total": total, "claims": claims}).fillna(0).astype(int)
    out = out[(out.index >= "2015-01") & (out.index <= "2026-12")]
    return {"months": out.index.tolist(), "total": out.total.tolist(), "claims": out.claims.tolist()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--noaa", required=True)
    ap.add_argument("--out", default="data")
    args = ap.parse_args()

    geo = json.load(open(f"{args.raw}/counties-10m.json"))
    county_names = {int(g["id"]): g["properties"]["name"] for g in geo["objects"]["counties"]["geometries"] if g["id"].startswith("48")}
    events = build_events(args.noaa)
    counties, stats = build_counties(args.raw, zip_to_county(args.raw), county_names)
    complaints = build_complaints(args.raw)

    meta = {
        "perils": PERILS, "actions": ACTIONS, "policyTypes": POLICY_TYPES, "reasons": REASONS_NONRENEW,
        "periods": {"noaa": "2015–2025", "acs": "2020–2024 (5-year)", "pif": "2026 Q1", "hb2067": stats["hb2067Months"],
                    "hb2067Denominator": "active policies by ZIP, 2025-12-31", "complaints": "2015–2026"},
        "quality": stats,
        "sources": {
            "noaa": "NOAA NCEI Storm Events Database, details files",
            "acs": "U.S. Census Bureau, ACS 5-year 2024 table-based summary files (B01003, B25001, B25003, B25035, B25077, B19013)",
            "tdi": "Texas Department of Insurance via data.texas.gov (8mvr-4gj9, vyxq-akit, m7yx-zxf2, 3efz-d6qn, ubdr-4uff)",
            "zip": "Census 2020 ZCTA-to-county relationship file (largest land-area overlap)",
        },
    }
    for name, obj in [("tx_events", events), ("tx_counties", counties), ("tx_complaints", complaints), ("tx_meta", meta)]:
        json.dump(obj, open(f"{args.out}/{name}.json", "w"), separators=(",", ":"))
    print(f"{events['count']:,} Texas events, {len(events['narratives']):,} narratives; {len(counties)} counties; "
          f"ZIP match {stats['zipPolicyShareMatched']:.1%}; PIF unmatched {stats['pifUnmatchedCounties']}; months {stats['hb2067Months']}")


if __name__ == "__main__":
    main()
