"""
build_data.py
-------------
Turns NOAA NCEI Storm Events "details" CSV files (hail, thunderstorm wind,
tornado; 2015-2025) into the two compact files the StormLens site loads:

  data/events.bin    one row per event, column-packed little-endian arrays
  data/events.json   column layout of events.bin + lookup tables
  data/details.json  narratives for the high-damage / high-severity events (R4)

Usage:
  python3 scripts/build_data.py path/to/StormEvents_details-*.csv.gz ...
  (or a pickled DataFrame produced earlier: --pickle events.pkl)
"""
import json, sys, re, argparse
import numpy as np
import pandas as pd

PERILS = ["Hail", "Thunderstorm Wind", "Tornado"]
FIRST_YEAR, LAST_YEAR = 2015, 2025
DETAIL_MIN_DAMAGE = 250_000          # narratives kept for events with NOAA damage >= this
DETAIL_MIN_HAIL_IN = 3.0             # ... or hail at least this size
NARRATIVE_CHARS = 240

def parse_damage(value):
    """NOAA writes damage as '10.00K', '1.5M', '0.00K'; blank means not reported."""
    if pd.isna(value): return np.nan
    text = str(value).strip().upper()
    scale = {"K": 1e3, "M": 1e6, "B": 1e9}
    try:
        return float(text[:-1]) * scale[text[-1]] if text[-1] in scale else float(text)
    except ValueError:
        return np.nan

def load(args):
    if args.pickle:
        return pd.read_pickle(args.pickle)
    frames = []
    for path in args.csv:
        df = pd.read_csv(path, low_memory=False)
        frames.append(df[df.EVENT_TYPE.isin(PERILS)])
    return pd.concat(frames)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("csv", nargs="*"); ap.add_argument("--pickle"); ap.add_argument("--out", default="data")
    args = ap.parse_args()
    ev = load(args)
    ev = ev[ev.EVENT_TYPE.isin(PERILS) & ev.BEGIN_LAT.notna() & ev.BEGIN_LON.notna()].copy()
    ev["year"] = ev.BEGIN_YEARMONTH // 100
    ev = ev[(ev.year >= FIRST_YEAR) & (ev.year <= LAST_YEAR)]
    ev["month"] = ev.BEGIN_YEARMONTH % 100
    ev["damage"] = ev.DAMAGE_PROPERTY.map(parse_damage)
    ev = ev.sort_values(["year", "month", "BEGIN_DAY", "EVENT_ID"]).reset_index(drop=True)

    # magnitude: hail in hundredths of an inch, wind in knots, tornado has none (0)
    mag = ev.MAGNITUDE.fillna(0).to_numpy()
    mag = np.where(ev.EVENT_TYPE == "Hail", np.round(mag * 100), np.round(mag)).astype(np.uint16)
    columns = {
        "lon":    (np.round(ev.BEGIN_LON.to_numpy() * 100).astype(np.int16), "int16"),
        "lat":    (np.round(ev.BEGIN_LAT.to_numpy() * 100).astype(np.int16), "int16"),
        "damage": (ev.damage.fillna(-1).to_numpy().astype(np.float32), "float32"),   # -1 = blank
        "county": ((ev.STATE_FIPS.astype(int) * 1000 + ev.CZ_FIPS.astype(int)).to_numpy().astype(np.int32), "int32"),  # 5-digit FIPS
        "mag":    (mag, "uint16"),
        "peril":  (ev.EVENT_TYPE.map({p: i for i, p in enumerate(PERILS)}).to_numpy().astype(np.uint8), "uint8"),
        "year":   ((ev.year - FIRST_YEAR).to_numpy().astype(np.uint8), "uint8"),
        "month":  (ev.month.to_numpy().astype(np.uint8), "uint8"),
        "day":    (ev.BEGIN_DAY.to_numpy().astype(np.uint8), "uint8"),
        "measured": ((ev.MAGNITUDE_TYPE == "MG").to_numpy().astype(np.uint8), "uint8"),
    }
    # pack: 4-byte columns first, then 2-byte, then 1-byte, so every typed array is aligned
    order = sorted(columns, key=lambda k: -columns[k][0].itemsize)
    layout, chunks, offset = [], [], 0
    for name in order:
        arr, dtype = columns[name]
        layout.append({"name": name, "type": dtype, "offset": offset})
        chunks.append(arr.tobytes()); offset += arr.nbytes
    with open(f"{args.out}/events.bin", "wb") as f:
        for c in chunks: f.write(c)

    meta = {"count": int(len(ev)), "firstYear": FIRST_YEAR, "lastYear": LAST_YEAR, "perils": PERILS,
            "columns": layout,
            "source": "NOAA NCEI Storm Events Database, details files (hail, thunderstorm wind, tornado)",
            "note": "Damage values are NOAA estimates, not insured losses. -1 means the field was blank."}
    json.dump(meta, open(f"{args.out}/events.json", "w"))

    keep = (ev.damage >= DETAIL_MIN_DAMAGE) | ((ev.EVENT_TYPE == "Hail") & (ev.MAGNITUDE >= DETAIL_MIN_HAIL_IN))
    details = {}
    for idx, row in ev[keep].iterrows():
        text = row.EVENT_NARRATIVE if isinstance(row.EVENT_NARRATIVE, str) else ""
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) > NARRATIVE_CHARS: text = text[:NARRATIVE_CHARS].rsplit(" ", 1)[0] + "…"
        details[int(idx)] = {"id": int(row.EVENT_ID), "src": row.SOURCE if isinstance(row.SOURCE, str) else "", "text": text}
    json.dump(details, open(f"{args.out}/details.json", "w"), separators=(",", ":"))
    print(f"{len(ev):,} events, {len(details):,} with narratives, events.bin {offset/1e6:.1f} MB")

if __name__ == "__main__":
    main()
