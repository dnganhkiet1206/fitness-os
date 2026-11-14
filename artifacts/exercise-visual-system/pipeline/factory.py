"""ASCND Motion Lab factory: one command per exercise, or the whole catalogue.

    python3 pipeline/factory.py status
    python3 pipeline/factory.py build dumbbell-curl back-squat [--no-export] [--force]
    python3 pipeline/factory.py batch [--no-export]
    python3 pipeline/factory.py sheet back-squat

build = build_scene -> generate_exercise -> validate_motion -> review sheet
-> export_usdz, with the time of each step. Exercises without a Motion Lab
template (movement.template) keep their own animate script and validator.
An exercise with an approval_date is approved: it is never rebuilt unless
--force is given, so regeneration cannot silently replace approved assets.
Each build appends to <exercise>/factory_log.json (version, timings, QA).
"""

from __future__ import annotations

import argparse
import datetime
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"
SHEET_SHOTS = "three_quarter:{a}:a,{b}:b,{c}:c front:{c}:c side:{c}:c"


def blender(script: str, *args: str) -> tuple[bool, str, float]:
    t = time.time()
    p = subprocess.run([BLENDER, "-b", "--factory-startup", "--python-exit-code", "1", "--python", script, "--", *args],
                       cwd=ROOT, capture_output=True, text=True)
    out = p.stdout + p.stderr
    return p.returncode == 0 and "Traceback" not in out, out, round(time.time() - t, 1)


def exercises() -> list[Path]:
    return sorted(p.parent for p in ROOT.glob("*/exercise.json"))


def load(ex: Path) -> dict:
    return json.loads((ex / "exercise.json").read_text(encoding="utf-8"))


def qa_summary(ex: Path) -> str:
    f = ex / "qa_report.json"
    if not f.exists():
        return "-"
    r = json.loads(f.read_text(encoding="utf-8"))
    counts = r.get("summary", {}).get("counts") or r.get("summary", {}).get("status_counts") or r.get("summary")
    return json.dumps(counts, ensure_ascii=False) if counts else "?"


def status(_args) -> None:
    print(f"{'exercise':18s} {'template':10s} {'pattern':18s} {'usdz':5s} {'prov':4s} QA")
    for ex in exercises():
        spec = load(ex)
        mv = spec.get("movement", {})
        usdz = any((ex / "usdz").glob("*.usdz")) if (ex / "usdz").exists() else False
        print(f"{ex.name:18s} {mv.get('template', '(script)'):10s} {mv.get('pattern', '-'):18s} {'yes' if usdz else 'no':5s} "
              f"{len(spec.get('motion_provenance', [])):<4d} {qa_summary(ex)}")


def sheet(ex: Path, spec: dict) -> tuple[bool, float]:
    """4 cameras x 3 key frames of the first repetition, tiled into one image."""
    phases = {p["id"]: p for p in spec.get("exercise_phases", [])}
    fps = int(spec["frame_rate"])
    mid = next((p for k, p in phases.items() if k in ("concentric", "eccentric")), None)
    a = 0
    b = int(round(mid["start_s"] * fps + 0.5 * (mid["end_s"] - mid["start_s"]) * fps)) if mid else 30
    c = int(round(mid["end_s"] * fps)) if mid else 60
    out_dir = ex / "_sheet"
    ok, _o, t = blender("pipeline/render_stills.py", "--exercise", ex.name, "--out-dir", str(out_dir),
                        "--shots", SHEET_SHOTS.format(a=a, b=b, c=c), "--width", "360", "--height", "640")
    if ok:
        files = [out_dir / n for n in ("still_3q_a.png", "still_3q_b.png", "still_3q_c.png", "still_front_c.png", "still_side_c.png")]
        files = [f for f in files if f.exists()]
        cmd = ["ffmpeg", "-loglevel", "error", "-y"]
        for f in files:
            cmd += ["-i", str(f)]
        cmd += ["-filter_complex", f"hstack=inputs={len(files)}", str(ex / "review_sheet.png")]
        ok = subprocess.run(cmd).returncode == 0
    return ok, t


def build(names: list[str], export: bool, force: bool) -> list[dict]:
    results = []
    for name in names:
        ex = ROOT / name
        spec = load(ex)
        if spec.get("approval_date") and not force:
            print(f"[factory] {name}: approved on {spec['approval_date']}, skipped (use --force)")
            continue
        steps, t0 = {}, time.time()
        template = spec.get("movement", {}).get("template")
        plan = [("scene", "pipeline/build_scene.py", ["--exercise", name])]
        if template:
            plan += [("generate", "pipeline/generate_exercise.py", ["--exercise", name]),
                     ("validate", "pipeline/validate_motion.py", ["--exercise", name])]
        else:
            script = next(ex.glob("animate_*.py"))
            plan += [("generate", str(script.relative_to(ROOT)), []),
                     ("validate", "pipeline/validate_animation.py", ["--exercise", name])]
        ok = True
        for step, script, args in plan:
            ok, out, t = blender(script, *args)
            steps[step] = {"ok": ok, "seconds": t}
            print(f"[factory] {name}: {step:9s} {'ok' if ok else 'FAILED'} in {t}s")
            if not ok:
                print("\n".join(out.splitlines()[-12:]))
                break
        if ok:
            spec = load(ex)  # phases written by the generator
            sok, t = sheet(ex, spec)
            steps["sheet"] = {"ok": sok, "seconds": t}
            print(f"[factory] {name}: sheet     {'ok' if sok else 'FAILED'} in {t}s -> {ex / 'review_sheet.png'}")
            if export:
                (ex / "usdz").mkdir(exist_ok=True)
                eok, _o, t = blender("pipeline/export_usdz.py", "--exercise", name, "--out-dir", str(ex / "usdz"))
                steps["export"] = {"ok": eok, "seconds": t}
                print(f"[factory] {name}: export    {'ok' if eok else 'FAILED'} in {t}s")
        log_path = ex / "factory_log.json"
        log = json.loads(log_path.read_text(encoding="utf-8")) if log_path.exists() else []
        entry = {"version": len(log) + 1, "when": datetime.datetime.now().isoformat(timespec="seconds"), "template": template,
                 "steps": steps, "total_seconds": round(time.time() - t0, 1), "qa": qa_summary(ex)}
        log.append(entry)
        log_path.write_text(json.dumps(log, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        results.append({"exercise": name, **entry})
        print(f"[factory] {name}: v{entry['version']} done in {entry['total_seconds']}s, QA {entry['qa']}")
    return results


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    b = sub.add_parser("build"); b.add_argument("names", nargs="+"); b.add_argument("--no-export", action="store_true"); b.add_argument("--force", action="store_true")
    bt = sub.add_parser("batch"); bt.add_argument("--no-export", action="store_true"); bt.add_argument("--force", action="store_true")
    s = sub.add_parser("sheet"); s.add_argument("name")
    args = ap.parse_args()
    if args.cmd == "status":
        status(args)
    elif args.cmd == "build":
        build(args.names, not args.no_export, args.force)
    elif args.cmd == "batch":
        names = [ex.name for ex in exercises() if load(ex).get("movement", {}).get("template")]
        t = time.time()
        res = build(names, not args.no_export, args.force)
        print(f"[factory] batch: {len(res)} exercises in {round(time.time() - t, 1)}s")
    elif args.cmd == "sheet":
        ex = ROOT / args.name
        ok, t = sheet(ex, load(ex))
        print(f"[factory] sheet {'ok' if ok else 'FAILED'} in {t}s -> {ex / 'review_sheet.png'}")


if __name__ == "__main__":
    main()
