"""Dựng danh sách món cuối cùng: món USDA (usda_picked.json) + món Việt (vn_recipes.py).

Mỗi món: tên en / vi / es, phần ăn en / vi / es, serving_g, dinh dưỡng MỘT phần ăn,
nguồn (`usda_sr_legacy` + fdc_id, hoặc `ascnd_recipe` + danh sách thành phần), cờ ước tính.
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import pick  # noqa: E402
import vn_recipes as V  # noqa: E402

KEYS = ["kcal", "protein", "carbs", "fat", "fiber"]


def main():
    usda = json.load(open(HERE / "usda_picked.json", encoding="utf-8"))
    by_en = {r["en"]: r for r in usda}
    foods = pick.load()
    ing = {}
    for k, must in V.ING.items():
        fid = pick.pick(foods, must[0].split(","), [])
        if not fid:
            sys.exit(f"ingredient not found: {k}")
        ing[k] = {"fdc_id": int(fid), "usda": foods[fid]["desc"], "per100": {n: foods[fid]["n"].get(n, 0.0) for n in KEYS}}

    def per100(name):
        if name in by_en:
            return by_en[name]["per100"], [by_en[name]["fdc_id"]]
        if name in ing:
            return ing[name]["per100"], [ing[name]["fdc_id"]]
        if name in V.COMPOSITE:
            acc = {k: 0.0 for k in KEYS}
            ids = []
            for part, share in V.COMPOSITE[name]:
                p, i = per100(part)
                for k in KEYS:
                    acc[k] += p[k] * share
                ids += i
            return acc, ids
        sys.exit(f"unknown ingredient: {name}")

    out = []
    for r in usda:
        g = r["serving_g"]
        n = {k: round(r["per100"][k] * g / 100, 1) for k in KEYS}
        out.append({"key": f"usda:{r['fdc_id']}", "source": "usda_sr_legacy", "source_ref": str(r["fdc_id"]),
                    "en": r["en"], "vi": r["vi"], "es": r["es"], "portion": r["portion"], "serving_g": g,
                    "n": n, "estimate": False})
    for vi, en, es, pvi, pen, pes, parts in V.R:
        total = {k: 0.0 for k in KEYS}
        grams = 0
        refs = []
        for name, g in parts:
            if g <= 0:
                continue
            p, ids = per100(name)
            for k in KEYS:
                total[k] += p[k] * g / 100
            grams += g
            refs.append(f"{name}:{g}g")
        n = {k: round(v, 1) for k, v in total.items()}
        out.append({"key": f"ascnd:{en.lower()}", "source": "ascnd_recipe", "source_ref": "; ".join(refs),
                    "en": en, "vi": vi, "es": es, "portion": {"en": pen, "vi": pvi, "es": pes}, "serving_g": grams,
                    "n": n, "estimate": True})
    keys = [o["key"] for o in out]
    assert len(keys) == len(set(keys)), "duplicate keys"
    json.dump(out, open(HERE / "foods_final.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for o in out:
        if o["estimate"]:
            n = o["n"]
            print(f'{o["vi"][:34]:34} {o["serving_g"]:>5.0f} g {n["kcal"]:>6.0f} kcal  P{n["protein"]:>5.1f} C{n["carbs"]:>6.1f} F{n["fat"]:>5.1f}')
    print(len(out), "foods;", sum(o["estimate"] for o in out), "estimates")


if __name__ == "__main__":
    main()
