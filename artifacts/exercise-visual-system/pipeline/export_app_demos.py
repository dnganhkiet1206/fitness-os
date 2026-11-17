"""App data for the 3D viewer as files, not Swift (MODULAR_3D_PLAN.md, Kiệt
16/11): adding or fixing an exercise no longer touches app code.

    python3 pipeline/export_app_demos.py [--out <folder>]

For every exercise whose exercise.json has an ``app_demo`` block it writes
``<prefix>_demo.json`` and one ``demo3d_index.json`` (catalogue order) into
the app's Resources/ExerciseDemos (default). Each demo file holds:

* files: the motion file and skin texture prefixes (modular export), or the
  full USDZ (exercises not yet split, e.g. bench press);
* the default camera, from ``<exercise>/usdz/usdz_report.json``;
* the legend, built from the muscle roles in exercise.json with
  ``config/legend_keys.json`` (name keys) and ``config/brand.config.json``
  (role colours), so a role change is one edit in exercise.json;
* the Lab notes (``app_demo.review`` / ``note``) and the name aliases the app
  matches a logged exercise against.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT.parent.parent / "apps" / "ios" / "ASCND" / "Resources" / "ExerciseDemos"


def camel(muscle_id: str) -> str:
    head, *rest = muscle_id.split("_")
    return head + "".join(w.capitalize() for w in rest)


def legend(exercise: dict, keys: dict, colors: dict) -> list[dict]:
    out, seen = [], set()
    for role, field in (("primary", "primary_muscles"), ("secondary", "secondary_muscles"),
                        ("stabilizing", "stabilizing_muscles")):
        if role not in exercise.get("highlight_roles", ["primary", "secondary"]):
            continue
        for m in exercise.get(field, []):
            key = keys["overrides"].get(m, camel(m))
            if key in seen:
                continue
            seen.add(key)
            out.append({"hex": colors[keys["role_colors"][role]], "name_key": f"eg.demo3d.legend.{key}",
                        "role_key": keys["role_keys"][role]})
    return out


def tempo(ex_dir: Path) -> dict | None:
    """Rep-by-rep timing for the app's tempo strip (C1, 17/11): every phase of every rep, in ms
    of the clip, with its breath. Same clip timeline as the motion (tempo.json is written by
    the Motion Lab together with the animation and checked by QA)."""
    path = ex_dir / "tempo.json"
    if not path.exists():
        return None
    t = json.loads(path.read_text())
    return {
        "duration_ms": t["duration_ms"],
        "notation": t.get("notation"),
        "reps": len(t["reps"]),
        "phases": [
            {"rep": r["index"], "kind": p["kind"], "start_ms": p["start_ms"], "end_ms": p["end_ms"],
             "breath": p.get("breath")}
            for r in t["reps"] for p in r["phases"]
        ],
    }


def demo(ex_dir: Path, keys: dict, colors: dict) -> tuple[str, dict] | None:
    exercise = json.loads((ex_dir / "exercise.json").read_text())
    app = exercise.get("app_demo")
    if not app:
        return None
    prefix = ex_dir.name.replace("-", "_")
    report_path = ex_dir / "usdz" / "usdz_report.json"
    report = json.loads(report_path.read_text()) if report_path.exists() else {}
    modular = (ex_dir / "usdz_split" / f"{prefix}_motion.usdz").exists()
    cam = app.get("camera") or report.get("default_camera") or {}  # app override first (bench: old file)
    d = {
        "id": prefix,
        "title": app["title"],
        "family_label": app["family_label"],
        "aliases": app["aliases"],
        "usdz": app.get("usdz", f"{prefix}_animation"),
        "loop": app.get("loop"),
        "poster": app.get("poster", f"{prefix}_poster"),
        "duration_s": app.get("duration_s") or round(report["expectations"]["animation_duration_s"], 1),
        "camera": {"position": cam.get("position_m"), "target": cam.get("target_m")},
        "legend": legend(exercise, keys, colors),
        # Muscle ids per role for the runtime muscle shader (MODULAR_3D_PLAN.md step 1, 17/11):
        # the app builds a 64-entry colour table from these, aggregates expanded with
        # muscle_parts.json. Same three roles as the legend.
        "roles": {r: list(exercise.get(f"{r}_muscles") or []) for r in ("primary", "secondary", "stabilizing")},
        "focus_prefix": f"{prefix}_focus",
        "motion": f"{prefix}_motion" if modular else None,
        "full_prefix": f"{prefix}_full" if modular else None,
        "review": app.get("review"),
        "note": app.get("note"),
        # Technique tips (B1, 17/11): id (i18n keys eg.demo3d.tip.<id>*), anchor on the skin in
        # the first frame, and the joint + offset the leader line follows while the clip plays
        # (filled by pipeline/tip_anchors.py). No joint = fixed point (equipment).
        "tips": [{k: t[k] for k in ("id", "anchor", "joint", "offset") if k in t} for t in app.get("tips") or []],
        "tempo": tempo(ex_dir),
    }
    return prefix, d | {"catalog_order": app.get("catalog_order", 999)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(APP))
    args = ap.parse_args()
    out = Path(args.out)
    keys = json.loads((ROOT / "config" / "legend_keys.json").read_text())
    colors = json.loads((ROOT / "config" / "brand.config.json").read_text())["colors"]
    demos = []
    for ex_dir in sorted(p for p in ROOT.iterdir() if (p / "exercise.json").exists()):
        r = demo(ex_dir, keys, colors)
        if r:
            demos.append(r)
    demos.sort(key=lambda r: r[1]["catalog_order"])
    for prefix, d in demos:
        d.pop("catalog_order")
        (out / f"{prefix}_demo.json").write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
        print(f"[evs] app demo {prefix}: {len(d['legend'])} legend rows, {'modular' if d['motion'] else 'full usdz'}")
    (out / "demo3d_index.json").write_text(json.dumps({"demos": [p for p, _ in demos]}, indent=2) + "\n")
    assert all(re.fullmatch(r"[a-z0-9_]+", p) for p, _ in demos)


if __name__ == "__main__":
    main()
