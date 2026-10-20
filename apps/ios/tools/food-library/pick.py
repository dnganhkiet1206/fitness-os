"""Pick USDA SR Legacy foods for a curated spec and report matches.

spec line: en | vi | es | serving_g | portion_en | portion_vi | portion_es | must,keywords | exclude,words
The chosen USDA food is the shortest description containing every `must` keyword
(case-insensitive, whole comma-separated phrase parts allowed) and none of `exclude`.
"""
import csv, json, sys, re
from pathlib import Path

SR = Path(__file__).parent / "dl/sr/FoodData_Central_sr_legacy_food_csv_2018-04"
NUT = {"1008": "kcal", "1003": "protein", "1004": "fat", "1005": "carbs", "1079": "fiber"}


def load():
    foods = {}
    with open(SR / "food.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            foods[r["fdc_id"]] = {"desc": r["description"], "cat": r["food_category_id"], "n": {}}
    with open(SR / "food_nutrient.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            k = NUT.get(r["nutrient_id"])
            if k and r["fdc_id"] in foods:
                foods[r["fdc_id"]]["n"][k] = float(r["amount"] or 0)
    return foods


def pick(foods, must, exclude):
    must = [m.strip().lower() for m in must if m.strip()]
    exclude = [x.strip().lower() for x in exclude if x.strip()]
    best = None
    for fid, f in foods.items():
        d = f["desc"].lower()
        if f["cat"] in ("3", "26", "27", "24"):  # baby, branded, QC, AI/AN
            continue
        if all(m in d for m in must) and not any(x in d for x in exclude):
            if "kcal" not in f["n"]:
                continue
            if best is None or len(d) < len(foods[best]["desc"]):
                best = fid
    return best


def main(spec_path, out_path):
    foods = load()
    rows, missing = [], []
    for ln, line in enumerate(open(spec_path, encoding="utf-8"), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 8:
            sys.exit(f"bad line {ln}: {line}")
        en, vi, es, g, pen, pvi, pes, must = parts[:8]
        exclude = parts[8].split(",") if len(parts) > 8 else []
        fid = pick(foods, must.split(","), exclude)
        if not fid:
            missing.append((ln, en, must))
            continue
        n = foods[fid]["n"]
        rows.append({"fdc_id": int(fid), "usda": foods[fid]["desc"], "en": en, "vi": vi, "es": es, "serving_g": float(g),
                     "portion": {"en": pen, "vi": pvi, "es": pes}, "per100": {k: n.get(k, 0.0) for k in NUT.values()}})
    json.dump(rows, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for r in rows:
        print(f'{r["fdc_id"]:>7} {r["en"][:28]:28} <- {r["usda"][:90]}  [{r["per100"]["kcal"]:.0f} kcal/100g]')
    for m in missing:
        print("MISSING", m)
    ids = [r["fdc_id"] for r in rows]
    dup = {i for i in ids if ids.count(i) > 1}
    for r in rows:
        if r["fdc_id"] in dup:
            print("DUP", r["fdc_id"], r["en"])
    print(len(rows), "picked,", len(missing), "missing")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
