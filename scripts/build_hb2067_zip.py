"""
build_hb2067_zip.py
-------------------
ZIP-level homeowners (policy type 03) declinations, cancellations, nonrenewals
and stated reasons from TDI's HB 2067 data — the same data behind TDI's ZIP
lookup tool launched 23 Sep 2026. Writes data/hb2067_zip.json.

  python3 scripts/build_hb2067_zip.py --raw raw --out data
"""
import argparse, json
import pandas as pd

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--raw", default="raw"); ap.add_argument("--out", default="data")
    a = ap.parse_args()
    rel = pd.read_csv(f"{a.raw}/zcta_county.txt", sep="|", dtype=str, encoding="utf-8-sig")
    rel = rel[rel.GEOID_COUNTY_20.str.startswith("48", na=False) & rel.GEOID_ZCTA5_20.notna()]
    rel["land"] = pd.to_numeric(rel.AREALAND_PART)
    best = rel.sort_values("land").groupby("GEOID_ZCTA5_20").tail(1)
    zip_county = dict(zip(best.GEOID_ZCTA5_20.astype(int), best.GEOID_COUNTY_20.astype(int)))

    pol = pd.read_csv(f"{a.raw}/tdi_hb2067_policies.csv")
    act = pd.read_csv(f"{a.raw}/tdi_hb2067_actual.csv")
    rea = pd.read_csv(f"{a.raw}/tdi_hb2067_reasons.csv")
    ho = pol[pol.policy_type == 3].groupby("zip").policy_count.sum()
    acts = act[act.policy_type == 3].pivot_table(index="zip", columns="action_type", values="policy_count", aggfunc="sum").fillna(0)
    r = rea[(rea.policy_type == 3) & rea.action_type.isin([81, 82])].copy()
    r["letters"] = r.reason_code.astype(str).str.replace("0", "").map(list)
    notices = r.groupby("zip").n.sum()
    letters = r.explode("letters").dropna(subset=["letters"]).pivot_table(index="zip", columns="letters", values="n", aggfunc="sum").fillna(0)

    out = {}
    for z in sorted(set(ho.index) | set(acts.index)):
        if z not in zip_county: continue
        rec = {"c": zip_county[z], "p": int(ho.get(z, 0)),
               "can": int(acts.loc[z, 80]) if z in acts.index and 80 in acts.columns else 0,
               "non": int(acts.loc[z, 81]) if z in acts.index and 81 in acts.columns else 0,
               "dec": int(acts.loc[z, 82]) if z in acts.index and 82 in acts.columns else 0,
               "n": int(notices.get(z, 0))}
        if z in letters.index:
            rec["r"] = {k: int(v) for k, v in letters.loc[z].items() if v > 0}
        out[int(z)] = rec
    json.dump({"period": "Apr–Jun 2026 actions; policies as of 2025-12-31; reasons on notices (HO nonrenewals + declinations)",
               "zips": out}, open(f"{a.out}/hb2067_zip.json", "w"), separators=(",", ":"))
    print(len(out), "ZIPs")

if __name__ == "__main__":
    main()
