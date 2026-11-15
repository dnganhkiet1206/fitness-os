"""Production catalogue and coverage (P1, MARKET_REVERSE_ANALYSIS.md).

    python3 pipeline/catalogue.py refresh     # recount from the app's starter programs
    python3 pipeline/catalogue.py coverage    # what is built, what is next, speed
    python3 pipeline/catalogue.py new "Hammer Curls" --from dumbbell-curl
                                              # scaffold the next exercise's spec

Which exercises to build first is not a guess: the app's starter programs
(apps/ios/.../StarterPrograms.swift: gym, home with a pair of dumbbells,
bodyweight) say which exercises a new member actually meets and for how
many sets a week. ``refresh`` recounts them into config/catalogue.json and
keeps the hand-written part of every entry (family, equipment, folder).
``coverage`` joins the catalogue with the exercise folders:

* per exercise: family, whether that family has a Motion Lab solver, built,
  QA, USDZ, approved;
* coverage weighted by program sets (share of the sets a member does that
  have a 3D demo), the honest number for "how much of the app is covered";
* speed: machine minutes per build (factory_log.json) and human minutes per
  exercise (exercise.json -> production.human_minutes, filled in by whoever
  wrote the spec and reviewed the sheet). Target: <= 30 human minutes.
"""

from __future__ import annotations

import datetime
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent.parent
PROGRAMS = REPO / "apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Workout/StarterPrograms.swift"
CATALOGUE = ROOT / "config/catalogue.json"
HUMAN_MINUTES_TARGET = 30

sys.path.insert(0, str(ROOT))


def _block(src: str, name: str) -> str:
    start = src.index(f"static let {name}")
    depth, i = 0, src.index("= [", start) + 2
    for j in range(i, len(src)):
        depth += {"[": 1, "]": -1}.get(src[j], 0)
        if depth == 0:
            return src[i:j + 1]
    raise ValueError(name)


def count_programs(src: str) -> dict:
    """name -> {"gym": sets, "home_dumbbell": sets, "bodyweight": sets, "days": n}."""
    tup = re.compile(r'\("([^"]+)",\s*(\d+),\s*(\d+)\)')
    swap = dict(re.findall(r'"([^"]+)":\s*"([^"]+)"', _block(src, "dumbbellSwap")))
    out: dict = {}

    def add(name: str, place: str, sets: int) -> None:
        e = out.setdefault(name, {"gym": 0, "home_dumbbell": 0, "bodyweight": 0, "days": 0})
        e[place] += sets
        e["days"] += 1

    for name, sets, _reps in tup.findall(_block(src, "gym")):
        add(name, "gym", int(sets))
        add(swap.get(name, name), "home_dumbbell", int(sets))
    for name, sets, _reps in tup.findall(_block(src, "bodyweight")):
        add(name, "bodyweight", int(sets))
    return out


def refresh() -> None:
    counts = count_programs(PROGRAMS.read_text(encoding="utf-8"))
    old = json.loads(CATALOGUE.read_text(encoding="utf-8")) if CATALOGUE.exists() else {"entries": {}}
    entries = {}
    for name, c in counts.items():
        e = dict(old["entries"].get(name, {"family": None, "equipment": None, "folder": None}))
        e["program_sets"] = c
        e["weekly_sets_total"] = c["gym"] + c["home_dumbbell"] + c["bodyweight"]
        entries[name] = e
    # Keep hand-added entries that are not in the programs (variants).
    for name, e in old["entries"].items():
        entries.setdefault(name, e)
    old.update({"source": str(PROGRAMS.relative_to(REPO)), "counted": datetime.date.today().isoformat(),
                "entries": dict(sorted(entries.items(), key=lambda kv: -kv[1].get("weekly_sets_total", 0)))})
    CATALOGUE.write_text(json.dumps(old, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"[catalogue] {len(counts)} exercises counted from {PROGRAMS.name} -> {CATALOGUE.relative_to(ROOT)}")


def _qa(folder: Path) -> tuple[str, bool]:
    f = folder / "qa_report.json"
    if not f.exists():
        return "-", False
    s = json.loads(f.read_text(encoding="utf-8")).get("summary", {})
    c = s.get("counts") or s.get("status_counts") or {}
    return "/".join(f"{c.get(k, 0)}" for k in ("PASS", "FAIL")) + (" (P/F)" if c else ""), bool(c) and c.get("FAIL", 0) == 0


def rows() -> list[dict]:
    from motionlab import FAMILIES, families  # noqa: F401
    import motionlab.families.curl  # noqa: F401
    import motionlab.families.squat  # noqa: F401
    for mod in (ROOT / "motionlab/families").glob("*.py"):
        if mod.stem != "__init__":
            __import__(f"motionlab.families.{mod.stem}")
    cat = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    out = []
    for name, e in cat["entries"].items():
        folder = ROOT / e["folder"] if e.get("folder") else None
        built = bool(folder and (folder / "exercise.json").exists())
        spec = json.loads((folder / "exercise.json").read_text(encoding="utf-8")) if built else {}
        qa, qa_ok = _qa(folder) if built else ("-", False)
        usdz = bool(built and list((folder / "usdz").glob("*.usdz"))) if built and (folder / "usdz").exists() else False
        log = json.loads((folder / "factory_log.json").read_text(encoding="utf-8")) if built and (folder / "factory_log.json").exists() else []
        out.append({"name": name, "family": e.get("family"), "equipment": e.get("equipment"),
                    "solver": (e.get("template") or e.get("family")) in FAMILIES, "built": built, "qa": qa, "qa_ok": qa_ok,
                    "usdz": usdz, "approved": bool(spec.get("approval_date")), "sets": e.get("weekly_sets_total", 0),
                    "machine_min": round(log[-1]["total_seconds"] / 60, 1) if log else None,
                    "human_min": spec.get("production", {}).get("human_minutes")})
    return out


def coverage() -> None:
    rs = rows()
    total = sum(r["sets"] for r in rs) or 1
    print(f"{'exercise':38s} {'family':18s} {'solver':6s} {'built':5s} {'QA':12s} {'usdz':4s} {'sets':>4s}  machine/human min")
    for r in rs:
        mark = lambda b: "yes" if b else "-"  # noqa: E731
        print(f"{r['name'][:38]:38s} {str(r['family'])[:18]:18s} {mark(r['solver']):6s} {mark(r['built']):5s} {r['qa']:12s} "
              f"{mark(r['usdz']):4s} {r['sets']:4d}  {r['machine_min'] or '-'}/{r['human_min'] or '-'}")
    built = [r for r in rs if r["built"]]
    solver = [r for r in rs if r["solver"]]
    demo_sets = sum(r["sets"] for r in rs if r["usdz"])
    fams = sorted({r["family"] for r in rs if r["family"]})
    missing = sorted({r["family"] for r in rs if r["family"] and not r["solver"]},
                     key=lambda f: -sum(r["sets"] for r in rs if r["family"] == f))
    print(f"\n[coverage] {len(rs)} exercises in the catalogue, {len(built)} built, {sum(r['qa_ok'] for r in rs)} with QA all PASS, "
          f"{sum(r['approved'] for r in rs)} approved")
    print(f"[coverage] program sets with a 3D demo: {demo_sets}/{total} = {100 * demo_sets / total:.0f}%; "
          f"sets whose family has a solver: {100 * sum(r['sets'] for r in solver) / total:.0f}%")
    print(f"[coverage] families: {len(fams)}; without a solver, by program sets: {', '.join(missing) or 'none'}")
    hm = [r["human_min"] for r in built if r["human_min"] is not None]
    mm = [r["machine_min"] for r in built if r["machine_min"] is not None]
    if mm:
        print(f"[speed] machine minutes per build: median {sorted(mm)[len(mm) // 2]}")
    if hm:
        med = sorted(hm)[len(hm) // 2]
        print(f"[speed] human minutes per exercise: median {med} (target <= {HUMAN_MINUTES_TARGET}) {'OK' if med <= HUMAN_MINUTES_TARGET else 'OVER'}")
    else:
        print("[speed] human minutes: not recorded yet (exercise.json -> production.human_minutes)")


RESULT_KEYS = ("exercise_phases", "validation_results", "approval_date", "reviewer", "animation_duration")


def new(name: str, base: str) -> Path:
    """Scaffold <folder>/exercise.json for a catalogue entry from a built
    exercise of the same family: everything a human must rewrite (id, name,
    template, muscles, provenance, cues, mistakes) is copied as a starting
    point and marked in ``todo``; results and approvals are cleared. The
    writer then fills production.human_minutes when the sheet is reviewed."""
    cat = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    e = cat["entries"][name]
    folder = e.get("folder") or re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    e["folder"] = folder
    dest = ROOT / folder
    if (dest / "exercise.json").exists():
        raise SystemExit(f"{dest / 'exercise.json'} exists")
    spec = json.loads((ROOT / base / "exercise.json").read_text(encoding="utf-8"))
    for k in RESULT_KEYS:
        spec.pop(k, None)
    slug = folder.replace("-", "_")
    spec.update({"exercise_id": slug, "exercise_name": name, "animation_file": f"{slug}_master.blend", "status": "DRAFT",
                 "reviewer": None, "approval_date": None, "motion_source_verification": "UNVERIFIED — NOT APPROVED FOR PRODUCTION"})
    spec["movement"]["template"] = e["family"]
    spec["movement"]["pattern"] = e["family"]
    spec["production"] = {"catalogue_name": name, "scaffolded_from": base, "human_minutes": None,
                          "todo": ["technique", "tempo", "primary/secondary/stabilizing_muscles", "motion_provenance",
                                   "phase_cues", "technical_cues", "common_mistakes", "muscle_roles_note"]}
    dest.mkdir(exist_ok=True)
    (dest / "exercise.json").write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    CATALOGUE.write_text(json.dumps(cat, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"[catalogue] {name}: scaffolded {dest.relative_to(ROOT)}/exercise.json from {base}; fill the todo list")
    return dest


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "coverage"
    if cmd == "new":
        import argparse
        ap = argparse.ArgumentParser()
        ap.add_argument("cmd"); ap.add_argument("name"); ap.add_argument("--from", dest="base", required=True)
        a = ap.parse_args()
        new(a.name, a.base)
    else:
        {"refresh": refresh, "coverage": coverage}[cmd]()
