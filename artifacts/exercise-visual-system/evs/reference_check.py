"""Golden measurements: lock reference numbers into a regression test.

Part of the ASCND Motion Kit (docs/exercise-visual-system/MOTION_KIT.md).
Pure Python, no bpy, unit-tested outside Blender.

A reference file (<exercise>/reference_measurements.json, written by
pipeline/measure_video.py) holds numbers measured from a licensed clip:
per-rep top/bottom joint angles plus a summary of medians. Those numbers
used to be documentation only, so a wrong bottom pose (elbow flexion 136
deg vs the 101 deg standard) reached the final evaluation before anyone
noticed. This module compares the animation's measured joint angles
(evs/movement_gate.metrics over the repetition phases) against the
reference medians and fails when they deviate.

Only checks explicitly declared in exercise.json -> movement
-> reference_checks run, so a comparison is never silently invented:

    "reference_checks": [
      {"metric": "elbow_max_deg", "reference": "elbow_top_2d_median",
       "tolerance": 10.0}
    ]

"metric" is a movement_gate metric (interior angles, 180 = straight);
"reference" is a key of the reference file's "summary" object;
"tolerance" is in the metric's units. A declared check whose metric,
reference key or tolerance is wrong FAILS loudly instead of passing
silently, because a broken declaration must never look green.

Three states, kept distinct:

- checks declared + file present: one PASS/FAIL result per check.
- no checks declared + no file: one NOT_TESTED result ("no reference
  measurements"). This is neither a pass nor a fail: golden measurements
  are simply not established for this exercise yet.
- file present + no checks declared: one NOT_TESTED result recording
  that the reference exists but nothing comparable was declared, with
  the reason from movement.reference_note (e.g. the clip is a different
  grip, so its angles are not comparable to the animation).
- checks declared + file missing: FAIL. The exercise claims golden
  measurements that are not there.

Both validators (pipeline/validate_motion.py for template exercises and
pipeline/validate_animation.py for the bench press) call check() and map
its outcomes onto their own record types, so the comparison logic lives
in exactly one place.
"""

from __future__ import annotations

import json
from pathlib import Path

REFERENCE_FILENAME = "reference_measurements.json"

PASS = "pass"
FAIL = "fail"
NOT_TESTED = "not_tested"


def _result(cid: str, title: str, outcome: str, measured, reference, tolerance, detail: str) -> dict:
    return {"id": cid, "title": title, "outcome": outcome, "measured": measured,
            "reference": reference, "tolerance": tolerance, "detail": detail}


def position_of(key, declared: dict) -> str | None:
    """Which pose a reference number describes: "top" / "bottom" from an explicit
    ``"at"`` in the declaration, else from the key (``elbow_top_2d_median``). ``None``
    for a reference that is not tied to one pose (it compares to the extreme)."""
    at = declared.get("at")
    if at in ("top", "bottom"):
        return at
    name = str(key or "")
    for pos in ("top", "bottom"):
        if f"_{pos}_" in name or name.endswith(f"_{pos}") or name.startswith(f"{pos}_"):
            return pos
    return None


def position_frames(phases, fps: float) -> dict[str, list[int]]:
    """Frames of each pose of each repetition, from exercise_phases: "top" = the end
    of every lifting phase (``concentric*``), "bottom" = the end of every lowering
    phase (``eccentric*``). The same moments measure_video.py samples per rep."""
    out: dict[str, list[int]] = {"top": [], "bottom": []}
    for p in phases or []:
        pid = str(p.get("id", ""))
        pos = "top" if pid.startswith("concentric") else "bottom" if pid.startswith("eccentric") else None
        if pos and "end_s" in p:
            out[pos].append(int(round(float(p["end_s"]) * fps)))
    return {k: sorted(set(v)) for k, v in out.items() if v}


def metrics_at(joints: dict, frames: list[int], metric_fn) -> dict[str, float]:
    """``metric_fn`` (movement_gate.metrics) at each frame on its own, median over the
    frames — the animation's angle AT that pose, not the extreme of the whole rep
    (Devin #890: a transition frame must not stand in for the top)."""
    import statistics
    n = min(len(v) for v in joints.values())
    per = [metric_fn({k: v[f:f + 1] for k, v in joints.items()}) for f in frames if 0 <= f < n]
    if not per:
        return {}
    return {k: float(statistics.median(m[k] for m in per)) for k in per[0]}


def check(exercise_dir, movement: dict | None, metrics: dict, at: dict | None = None) -> list[dict]:
    """Compare measured metrics against the exercise's reference file.

    exercise_dir: directory holding reference_measurements.json (if any).
    movement: the exercise.json "movement" object (may be None).
    metrics: movement_gate.metrics() over the repetition phases.
    at: {"top": metrics at the top frames, "bottom": ...} (metrics_at). A reference
    tied to one pose (position_of) is compared there; without it the check FAILS
    loudly instead of falling back to the extreme of the whole rep.
    Returns one result dict per check, or a single aggregate result for
    the no-file / no-declaration states.
    """
    movement = movement or {}
    declared = movement.get("reference_checks") or []
    ref_path = Path(exercise_dir) / REFERENCE_FILENAME
    if not declared:
        if not ref_path.exists():
            return [_result("reference_measurements", "Golden measurements: reference comparison", NOT_TESTED, None, None, None,
                            "No reference measurements: this exercise has no reference_measurements.json and declares no "
                            "reference_checks. Golden measurements are not established yet; this is neither a pass nor a fail.")]
        note = movement.get("reference_note", "")
        detail = ("Reference measurements exist but no comparable checks are declared, so nothing is compared. "
                  + (note if note else "Record why in movement.reference_note."))
        return [_result("reference_measurements", "Golden measurements: reference comparison", NOT_TESTED, None, None, None, detail)]
    if not ref_path.exists():
        return [_result("reference_measurements", "Golden measurements: reference comparison", FAIL, None, None, None,
                        f"exercise.json declares {len(declared)} reference check(s) but {REFERENCE_FILENAME} is missing.")]
    try:
        data = json.loads(ref_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return [_result("reference_measurements", "Golden measurements: reference comparison", FAIL, None, None, None,
                        f"{REFERENCE_FILENAME} is unreadable: {exc}")]
    summary = data.get("summary") if isinstance(data, dict) else None
    if not isinstance(summary, dict):
        return [_result("reference_measurements", "Golden measurements: reference comparison", FAIL, None, None, None,
                        f"{REFERENCE_FILENAME} has no 'summary' object.")]
    reps = summary.get("reps")
    basis = f"median of {reps} reps" if isinstance(reps, int) else "reference summary"
    out = []
    for d in declared:
        if not isinstance(d, dict):
            out.append(_result("reference_measurements", "Golden measurements: reference comparison", FAIL, None, None, None,
                               f"reference check {d!r} is not an object with metric/reference/tolerance"))
            continue
        metric, key, tol = d.get("metric"), d.get("reference"), d.get("tolerance")
        cid = f"reference_{metric}" if metric else "reference_measurements"
        title = f"Golden measurement: {metric} matches {key} within tolerance"
        if metric not in metrics:
            out.append(_result(cid, title, FAIL, None, None, tol if isinstance(tol, (int, float)) else None,
                               f"unknown metric {metric!r}: not a movement_gate metric"))
            continue
        if key not in summary:
            out.append(_result(cid, title, FAIL, None, None, tol if isinstance(tol, (int, float)) else None,
                               f"unknown reference key {key!r}: not in {REFERENCE_FILENAME} summary"))
            continue
        if not isinstance(tol, (int, float)) or isinstance(tol, bool):
            out.append(_result(cid, title, FAIL, None, None, None, f"tolerance for {metric!r} must be a number"))
            continue
        try:
            ref = float(summary[key])
        except (TypeError, ValueError):
            out.append(_result(cid, title, FAIL, None, None, float(tol), f"reference key {key!r} is not a number"))
            continue
        pos = position_of(key, d)
        if pos is not None:
            posed = (at or {}).get(pos) or {}
            if metric not in posed:
                out.append(_result(cid, title, FAIL, None, round(ref, 3), float(tol),
                                   f"reference {key!r} is measured at the {pos} of each rep, but no {pos}-frame metrics were "
                                   f"given (exercise_phases need concentric/eccentric phases); refusing to compare with the "
                                   f"extreme of the whole rep"))
                continue
            measured, where = float(posed[metric]), f" at the {pos} (median over reps)"
        else:
            measured, where = float(metrics[metric]), ""
        ok = abs(measured - ref) <= float(tol)
        out.append(_result(cid, title, PASS if ok else FAIL, round(measured, 3), round(ref, 3), float(tol),
                           f"{metric} {measured:.1f}{where} vs reference {key} {ref:.1f} +/- {tol:g} ({basis})"))
    return out
