"""Generic motion QA for Motion Lab exercises (numpy, no bpy, unit-tested).

Every check returns a record with a status and, when it fails, the exact
frame and joint (or implement) and the measured value, so a reviewer can
seek straight to the problem. Stages follow the Motion Lab spec:

  A structural   frame count, finite data
  B motion       joint speed / rotation steps, hand-implement contact,
                 planted feet, left/right symmetry
  C visual       skin stretch (measured by the Blender side)
  D exercise     movement-family bounds (evs/movement_gate.py)

Passing these is "technically validated" only. Biomechanical review, human
approval and production approval are separate states in the report.
"""

from __future__ import annotations

import numpy as np

PASS, FAIL, REVIEW, NOT_TESTED = "PASS", "FAIL", "REQUIRES_MANUAL_REVIEW", "NOT_TESTED"


def rec(cid: str, stage: str, title: str, status: str, measured=None, limit=None, where=None, detail: str = "") -> dict:
    return {"id": cid, "stage": stage, "title": title, "status": status, "measured": measured, "limit": limit,
            "where": where, "detail": detail}


def joint_speed(j: dict, fps: float, limit: float) -> dict:
    worst = (0.0, None, None)
    for k, v in j.items():
        sp = np.linalg.norm(np.diff(v, axis=0), axis=1) * fps
        i = int(np.argmax(sp))
        if sp[i] > worst[0]:
            worst = (float(sp[i]), k, i + 1)
    return rec("joint_speed", "B", "No joint moves faster than a human joint plausibly does", PASS if worst[0] <= limit else FAIL,
               round(worst[0], 3), limit, {"joint": worst[1], "frame": worst[2]}, "m/s")


def rotation_steps(quats: dict, limit_deg: float) -> dict:
    """quats: bone -> (frames, 4) local rotations (w, x, y, z)."""
    worst = (0.0, None, None)
    for bone, q in quats.items():
        q = np.asarray(q, float)
        dots = np.abs((q[1:] * q[:-1]).sum(axis=1)).clip(0, 1)
        step = np.degrees(2 * np.arccos(dots))
        i = int(np.argmax(step))
        if step[i] > worst[0]:
            worst = (float(step[i]), bone, i + 1)
    return rec("rotation_step", "B", "No sudden bone rotation between frames", PASS if worst[0] <= limit_deg else FAIL,
               round(worst[0], 3), limit_deg, {"bone": worst[1], "frame": worst[2]}, "deg per frame")


def contact(dist: dict, limit_m: float) -> dict:
    """dist: implement -> per-frame wrist-to-socket distance."""
    worst = (0.0, None, None)
    for k, d in dist.items():
        d = np.asarray(d, float)
        i = int(np.argmax(d))
        if d[i] > worst[0]:
            worst = (float(d[i]), k, i)
    return rec("hand_implement_contact", "B", "Hands stay on the implements in every frame", PASS if worst[0] <= limit_m else FAIL,
               round(worst[0], 5), limit_m, {"implement": worst[1], "frame": worst[2]}, "m wrist to grip socket")


def planted(feet: dict, slide_limit: float, lift_limit: float) -> dict:
    """feet: name -> (frames, 3) positions; planted feet must not slide or lift."""
    worst_slide, worst_lift = (0.0, None, None), (0.0, None, None)
    for k, p in feet.items():
        p = np.asarray(p, float)
        slide = np.linalg.norm(p[:, :2] - p[0, :2], axis=1)
        lift = np.abs(p[:, 2] - p[0, 2])
        i, j = int(np.argmax(slide)), int(np.argmax(lift))
        if slide[i] > worst_slide[0]:
            worst_slide = (float(slide[i]), k, i)
        if lift[j] > worst_lift[0]:
            worst_lift = (float(lift[j]), k, j)
    ok = worst_slide[0] <= slide_limit and worst_lift[0] <= lift_limit
    return rec("feet_planted", "B", "Planted feet neither slide nor lift", PASS if ok else FAIL,
               {"slide_m": round(worst_slide[0], 5), "lift_m": round(worst_lift[0], 5)}, {"slide_m": slide_limit, "lift_m": lift_limit},
               {"foot": worst_slide[1] if worst_slide[0] > slide_limit else worst_lift[1],
                "frame": worst_slide[2] if worst_slide[0] > slide_limit else worst_lift[2]})


def symmetry(j: dict, limit_m: float, pairs=("shoulder", "elbow", "wrist", "hip", "knee", "ankle")) -> dict:
    """Bilateral exercises: the right side mirrors the left (x -> -x)."""
    worst = (0.0, None, None)
    m = np.array([-1.0, 1.0, 1.0])
    for n in pairs:
        if f"{n}_l" not in j:
            continue
        d = np.linalg.norm(j[f"{n}_l"] - j[f"{n}_r"] * m, axis=1)
        i = int(np.argmax(d))
        if d[i] > worst[0]:
            worst = (float(d[i]), n, i)
    return rec("left_right_symmetry", "B", "Left and right sides move as mirror images", PASS if worst[0] <= limit_m else FAIL,
               round(worst[0], 5), limit_m, {"joint": worst[1], "frame": worst[2]}, "m")


def summary(records: list[dict]) -> dict:
    counts = {}
    for r in records:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    technical = "PASS" if counts.get(FAIL, 0) == 0 else "FAIL"
    return {"counts": counts, "technically_validated": technical == "PASS",
            "states": {"technically_validated": technical == "PASS", "biomechanically_reviewed": False,
                       "human_approved": False, "production_approved": False}}
