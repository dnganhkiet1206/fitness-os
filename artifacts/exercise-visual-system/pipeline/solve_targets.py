"""Finds technique parameters that hit measured targets (motion kit).

    python3 pipeline/solve_targets.py --exercise bench-press [--rounds 3] [--apply]

Instead of a person nudging numbers until a pose looks right, the exercise
declares targets (exercise.json -> movement.targets) taken from research or
from pipeline/measure_video.py, and the parameters the solver may move
(movement.tune: technique key -> [min, max, step]). Each trial writes the
parameters into exercise.json, rebuilds the motion with the exercise's
animation script and measures it with pipeline/measure_animation.py. A
coordinate search keeps the best trial; ties prefer the smaller change.

A target is {"metric": name, "value": v, "tolerance": t, "weight": w}
(cost ((measured - v) / t)^2 * w) or {"metric": name, "min"/"max": v,
"tolerance": t} for one-sided bounds. With --apply the best parameters stay
in exercise.json; otherwise the file is restored. The report goes to
<exercise>/solve_report.json either way.
"""

from __future__ import annotations

import argparse
import copy
import datetime
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"


def run(cmd: list[str]) -> str:
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    return p.stdout + p.stderr


def trial(ex_dir: Path, base: dict, params: dict) -> dict | None:
    spec = copy.deepcopy(base)
    spec["technique"].update(params)
    (ex_dir / "exercise.json").write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    script = ex_dir / base.get("animation_script", f"animate_{ex_dir.name.replace('-', '_')}.py")
    out = run([BLENDER, "-b", "--factory-startup", "--python-exit-code", "1", "--python", str(script)])
    if "Traceback" in out or "RuntimeError" in out:
        return None
    out = run([BLENDER, "-b", "--factory-startup", "--python", "pipeline/measure_animation.py", "--", "--exercise", ex_dir.name])
    for line in out.splitlines():
        if line.startswith("METRICS "):
            return json.loads(line[8:])
    return None


def cost(metrics: dict | None, targets: list[dict]) -> float:
    if metrics is None:
        return float("inf")
    c = 0.0
    for t in targets:
        v, tol, w = metrics[t["metric"]], float(t["tolerance"]), float(t.get("weight", 1.0))
        if "value" in t:
            c += w * ((v - t["value"]) / tol) ** 2
        if "min" in t and v < t["min"]:
            c += w * ((t["min"] - v) / tol) ** 2
        if "max" in t and v > t["max"]:
            c += w * ((v - t["max"]) / tol) ** 2
    return c


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--exercise", required=True)
    ap.add_argument("--rounds", type=int, default=2)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    ex_dir = ROOT / args.exercise
    original = (ex_dir / "exercise.json").read_text(encoding="utf-8")
    base = json.loads(original)
    targets = base["movement"]["targets"]
    tune = base["movement"]["tune"]
    current = {k: base["technique"][k] for k in tune}
    history = []

    def evaluate(params: dict) -> float:
        m = trial(ex_dir, base, params)
        c = cost(m, targets)
        history.append({"params": dict(params), "cost": None if c == float("inf") else round(c, 4), "metrics": m})
        print(f"  {params} -> cost {c:.3f}", flush=True)
        return c

    try:
        best_c = evaluate(current)
        for r in range(args.rounds):
            improved = False
            for key, (lo, hi, step) in tune.items():
                s = step / (2 ** r)
                for direction in (+1, -1):
                    while True:
                        cand = dict(current)
                        cand[key] = round(min(max(current[key] + direction * s, lo), hi), 4)
                        if cand[key] == current[key]:
                            break
                        c = evaluate(cand)
                        if c + 1e-6 < best_c:
                            best_c, current, improved = c, cand, True
                        else:
                            break
            print(f"round {r + 1}: best cost {best_c:.3f} with {current}", flush=True)
            if not improved and r > 0:
                break
    finally:
        if args.apply:
            final = copy.deepcopy(base)
            final["technique"].update(current)
            (ex_dir / "exercise.json").write_text(json.dumps(final, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        else:
            (ex_dir / "exercise.json").write_text(original, encoding="utf-8")
    best = min((h for h in history if h["cost"] is not None), key=lambda h: h["cost"])
    report = {"tool": "pipeline/solve_targets.py", "date": datetime.date.today().isoformat(), "targets": targets,
              "tune": tune, "best": best, "trials": len(history), "history": history, "applied": args.apply}
    (ex_dir / "solve_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(best, indent=1))


if __name__ == "__main__":
    main()
