"""App data for the 3D viewer as files, not Swift (MODULAR_3D_PLAN.md, Kiệt
16/11): adding or fixing an exercise no longer touches app code.

    python3 pipeline/export_app_demos.py [--out <folder>] [--check]

For every exercise whose exercise.json has an ``app_demo`` block it writes into
the app's Resources/ExerciseDemos (default) one file per independent module
(Kiệt 20/11: "tách các file trong chế độ hướng dẫn 3d thành các file độc lập"):

* ``<prefix>_demo.json``     core: names, files, camera, muscles, and ``modules``;
* ``<prefix>_tips.json``     technique tips with their text (en / es / vi), from
  ``app_demo.tips`` (anchors) + ``content/tips.json`` (text);
* ``<prefix>_tempo.json``    rep-by-rep timing, from ``tempo.json``;
* ``<prefix>_mistakes.json`` common-mistake clips with their text, from sibling
  folders' ``mistake_demo`` + ``content/mistake.json``;
* ``demo3d_index.json``      catalogue order + a content hash per file.

A module that has nothing is not written and not listed: the app hides that
feature. Every file is checked against ``schemas/demo3d_*.schema.json`` (JSON
Schema 2020-12) when the ``jsonschema`` package is installed, and files whose
content did not change are not rewritten. ``--check`` writes nothing and fails
when a file in the app differs from what this script would write.

The core demo file holds:

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
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT.parent.parent / "apps" / "ios" / "ASCND" / "Resources" / "ExerciseDemos"
SCHEMAS = ROOT / "schemas"
LANGS = ("en", "es", "vi")


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
        "schema": 1,
        "exercise": ex_dir.name.replace("-", "_"),
        "duration_ms": t["duration_ms"],
        "notation": t.get("notation"),
        "reps": len(t["reps"]),
        "phases": [
            {"rep": r["index"], "kind": p["kind"], "start_ms": p["start_ms"], "end_ms": p["end_ms"],
             "breath": p.get("breath")}
            for r in t["reps"] for p in r["phases"]
        ],
    }


def mistakes(ex_dir: Path) -> list[dict]:
    out = []
    for other in sorted(p for p in ROOT.iterdir() if (p / "exercise.json").exists()):
        spec = json.loads((other / "exercise.json").read_text())
        m = spec.get("mistake_demo")
        if not m or m.get("of") != ex_dir.name:
            continue
        prefix = other.name.replace("-", "_")
        if not (other / "usdz_split" / f"{prefix}_motion.usdz").exists():
            continue
        text_path = other / "content" / "mistake.json"
        if not text_path.exists():
            raise SystemExit(f"[evs] {other.name}: thiếu content/mistake.json (chữ lỗi sai en/es/vi)")
        out.append({"id": m["id"], "motion": f"{prefix}_motion", "joints": m.get("fault_joints", []),
                    "text": json.loads(text_path.read_text())})
    return out


def tips(ex_dir: Path, app: dict) -> list[dict]:
    """Tip anchors (``app_demo.tips``, filled by tip_anchors.py) joined with their text
    (``content/tips.json``). A tip without text, or text without a tip, is an error."""
    anchors = app.get("tips") or []
    if not anchors:
        return []
    path = ex_dir / "content" / "tips.json"
    text = json.loads(path.read_text()) if path.exists() else {}
    ids = [t["id"] for t in anchors]
    if set(ids) != set(text):
        raise SystemExit(f"[evs] {ex_dir.name}: mẹo {sorted(ids)} khác chữ trong content/tips.json {sorted(text)}")
    return [{k: t[k] for k in ("id", "anchor", "joint", "offset") if k in t} | {"text": text[t["id"]]}
            for t in anchors]


def demo(ex_dir: Path, keys: dict, colors: dict) -> tuple[str, dict[str, dict], int] | None:
    exercise = json.loads((ex_dir / "exercise.json").read_text())
    app = exercise.get("app_demo")
    if not app:
        return None
    prefix = ex_dir.name.replace("-", "_")
    report_path = ex_dir / "usdz" / "usdz_report.json"
    report = json.loads(report_path.read_text()) if report_path.exists() else {}
    modular = (ex_dir / "usdz_split" / f"{prefix}_motion.usdz").exists()
    cam = app.get("camera") or report.get("default_camera") or {}  # app override first (bench: old file)
    modules = {
        "tips": tips(ex_dir, app),
        "tempo": tempo(ex_dir),
        "mistakes": mistakes(ex_dir),
    }
    d = {
        "schema": 1,
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
        # Independent module files (20/11): the app reads <prefix>_<module>.json only when listed.
        "modules": {name: f"{prefix}_{name}" for name, v in modules.items() if v},
    }
    files = {f"{prefix}_demo": d}
    if modules["tips"]:
        # Technique tips (B1, 17/11): id, anchor on the skin in the first frame, and the joint +
        # offset the leader line follows while the clip plays (pipeline/tip_anchors.py). No
        # joint = fixed point (equipment). Text travels with the tip (20/11), not in the app.
        files[f"{prefix}_tips"] = {"schema": 1, "exercise": prefix, "tips": modules["tips"]}
    if modules["tempo"]:
        files[f"{prefix}_tempo"] = modules["tempo"]
    if modules["mistakes"]:
        # Common-mistake clips (C2, 17/11): sibling exercise folders whose exercise.json has
        # mistake_demo.of == this folder. Same character, same timing; the app swaps the motion.
        files[f"{prefix}_mistakes"] = {"schema": 1, "exercise": prefix, "mistakes": modules["mistakes"]}
    return prefix, files, app.get("catalog_order", 999)


def dump(data: dict) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def validator(required: bool = False):
    """JSON Schema validators by schema name, or None when ``jsonschema`` (MIT, open source)
    is not installed — the CI gate ``apps/ios/tools/demo3d-content.mjs`` still checks the
    meaning (files exist, three languages, ids unique, phases in order)."""
    try:
        import jsonschema  # type: ignore
    except ImportError:
        if required:
            raise SystemExit("[evs] --require-schema: cần jsonschema (pip install jsonschema)")
        print("[evs] jsonschema chưa cài: bỏ qua kiểm schema (pip install jsonschema)", file=sys.stderr)
        return None
    out = {}
    for path in SCHEMAS.glob("demo3d_*.schema.json"):
        schema = json.loads(path.read_text())
        jsonschema.Draft202012Validator.check_schema(schema)
        out[path.name.removesuffix(".schema.json")] = jsonschema.Draft202012Validator(schema)
    return out


def schema_for(name: str) -> str:
    if name == "demo3d_index":
        return "demo3d_index"
    return "demo3d_" + name.rsplit("_", 1)[1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(APP))
    ap.add_argument("--check", action="store_true", help="write nothing; fail when the app is stale")
    ap.add_argument("--require-schema", action="store_true", help="fail when jsonschema is not installed (CI)")
    args = ap.parse_args()
    out = Path(args.out)
    keys = json.loads((ROOT / "config" / "legend_keys.json").read_text())
    colors = json.loads((ROOT / "config" / "brand.config.json").read_text())["colors"]
    demos = []
    for ex_dir in sorted(p for p in ROOT.iterdir() if (p / "exercise.json").exists()):
        r = demo(ex_dir, keys, colors)
        if r:
            demos.append(r)
    demos.sort(key=lambda r: r[2])
    files: dict[str, dict] = {}
    for prefix, parts, _ in demos:
        assert re.fullmatch(r"[a-z0-9_]+", prefix), prefix
        files.update(parts)
        core = parts[f"{prefix}_demo"]
        print(f"[evs] app demo {prefix}: {len(core['legend'])} legend rows, "
              f"{'modular' if core['motion'] else 'full usdz'}, modules {sorted(core['modules']) or '-'}")
    texts = {name: dump(data) for name, data in files.items()}
    index = {"schema": 2, "demos": [p for p, _, _ in demos],
             "files": {name: digest(texts[name]) for name in sorted(texts)}}
    texts["demo3d_index"] = dump(index)

    checks = validator(args.require_schema)
    errors = []
    if checks:
        for name, text in texts.items():
            for e in checks[schema_for(name)].iter_errors(json.loads(text)):
                errors.append(f"{name}.json: {'/'.join(map(str, e.absolute_path))}: {e.message}")
    if errors:
        raise SystemExit("[evs] sai schema:\n  " + "\n  ".join(errors))

    # Module files this script owns but no longer produces (a module removed from an exercise).
    owned = re.compile(r"^[a-z0-9_]+_(tips|tempo|mistakes)\.json$")
    stale = [p for p in out.glob("*.json") if owned.match(p.name) and p.stem not in texts]
    changed = [n for n, t in texts.items() if not (out / f"{n}.json").exists() or (out / f"{n}.json").read_text() != t]
    if args.check:
        if changed or stale:
            raise SystemExit(f"[evs] app cũ so với Motion Lab: đổi {sorted(changed)}, thừa {sorted(p.name for p in stale)}")
        print(f"[evs] app khớp Motion Lab ({len(texts)} tệp)")
        return
    for n in changed:
        (out / f"{n}.json").write_text(texts[n])
        print(f"[evs] ghi {n}.json")
    for p in stale:
        p.unlink()
        print(f"[evs] bỏ {p.name} (bài không còn khối này)")
    print(f"[evs] {len(texts)} tệp, đổi {len(changed)}")


if __name__ == "__main__":
    main()
