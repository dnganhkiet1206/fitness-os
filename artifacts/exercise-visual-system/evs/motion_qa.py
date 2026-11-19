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


def _angle(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    a = a / np.linalg.norm(a, axis=-1, keepdims=True)
    b = b / np.linalg.norm(b, axis=-1, keepdims=True)
    return np.degrees(np.arccos(np.clip((a * b).sum(-1), -1.0, 1.0)))


def posture(j: dict, prof: dict) -> list[dict]:
    """Whole-body posture checks added after the 14/11 squat (QA passed while
    the arms and head looked wrong; docs/exercise-visual-system/
    MOTION_KIT_LESSONS.md). Each one names the worst frame and side."""
    out = []
    worst = {"wrist": (0.0, None, None), "elbow": (0.0, None, None), "medial": (0.0, None, None)}
    for s, sign in (("l", 1.0), ("r", -1.0)):
        if f"knuckle_{s}" not in j:
            continue
        sh, el, wr, kn = j[f"shoulder_{s}"], j[f"elbow_{s}"], j[f"wrist_{s}"], j[f"knuckle_{s}"]
        bend = _angle(wr - el, kn - wr)
        flex = _angle(el - sh, wr - el)
        medial = -(el[:, 0] - sh[:, 0]) * sign  # + = elbow towards the midline
        for key, arr in (("wrist", bend), ("elbow", flex), ("medial", medial)):
            i = int(np.argmax(arr))
            if arr[i] > worst[key][0]:
                worst[key] = (float(arr[i]), s, i)
    for key, cid, title, limit, unit in (
            ("wrist", "wrist_bend", "Wrists stay near straight (forearm to hand)", prof["max_wrist_bend_deg"], "deg"),
            ("elbow", "elbow_flexion_anatomical", "Elbow flexion inside the soft-tissue limit", prof["max_elbow_flexion_deg"], "deg"),
            ("medial", "elbow_inside_shoulder", "Elbows do not fold in behind the shoulder line", prof["max_elbow_medial_m"], "m")):
        v, side, f = worst[key]
        out.append(rec(cid, "C", title, PASS if v <= limit else FAIL, round(v, 3), limit, {"side": side, "frame": f}, unit))
    if "head_top" in j:
        trunk = j["neck"] - j["pelvis"]
        head = j["head_top"] - j["neck"]
        # Neck flexion relative to the trunk, forward only (-Y is forward).
        ang = _angle(head, trunk) * np.where(np.cross(trunk, head)[:, 0] > 0, 1.0, -1.0)
        i = int(np.argmax(ang))
        out.append(rec("head_neutral", "C", "Head stays near neutral (not dropped to the chest)",
                       PASS if ang[i] <= prof["max_neck_flexion_deg"] else FAIL, round(float(ang[i]), 2),
                       prof["max_neck_flexion_deg"], {"frame": i}, "deg, + = chin towards chest"))
    return out


def penetration(depths: dict, limit_m: float, frames: list | None = None) -> dict:
    """depths: implement -> deepest skin point inside the implement (m) at
    each sampled frame. ``frames``: the animation frame of each sample, so
    the report names the real frame (14/11: it named the sample index, and
    the reviewer looked at the wrong frame)."""
    worst = (0.0, None, None)
    for name, arr in depths.items():
        arr = np.asarray(arr, float)
        i = int(np.argmax(arr))
        if arr[i] > worst[0]:
            worst = (float(arr[i]), name, i)
    return rec("implement_penetration", "C", "Implements do not pass through the body", PASS if worst[0] <= limit_m else FAIL,
               round(worst[0], 4), limit_m,
               {"implement": worst[1], "frame": (frames[worst[2]] if frames is not None and worst[2] is not None else worst[2])}, "m inside")


def summary(records: list[dict]) -> dict:
    counts = {}
    for r in records:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    technical = "PASS" if counts.get(FAIL, 0) == 0 else "FAIL"
    return {"counts": counts, "technically_validated": technical == "PASS",
            "states": {"technically_validated": technical == "PASS", "biomechanically_reviewed": False,
                       "human_approved": False, "production_approved": False}}


def tempo_sync(j: dict, expected: list, max_shift_frames: int = 1, min_corr: float = 0.9) -> dict:
    """The animation follows tempo.json within ``max_shift_frames`` (P5).

    ``expected``: family progress per frame rebuilt from tempo.json alone.
    The joint that travels farthest is projected on its main direction and
    normalised; the integer shift that best lines it up with the expected
    progress (either sign: a squat's hip goes down while progress goes up)
    must be within the limit, and the curves must agree (correlation)."""
    e = np.asarray(expected, float)
    best = None
    for k, v in j.items():
        v = np.asarray(v, float)[: len(e)]
        c = v - v.mean(axis=0)
        _u, _s, vt = np.linalg.svd(c, full_matrices=False)
        x = c @ vt[0]
        rng = float(x.max() - x.min())
        if best is None or rng > best[0]:
            best = (rng, k, x)
    rng, joint, x = best
    if rng < 1e-3 or e.max() - e.min() < 1e-6:
        return rec("tempo_sync", "B", "Animation follows tempo.json", NOT_TESTED, detail="no motion")
    x = (x - x.min()) / rng
    en = (e - e.min()) / (e.max() - e.min())
    n = len(en)
    scores = []
    for shift in range(-6, 7):
        a = x[max(shift, 0): n + min(shift, 0)]
        b = en[max(-shift, 0): n - max(shift, 0)]
        corr = float(np.corrcoef(a, b)[0, 1]) if a.std() > 0 and b.std() > 0 else 0.0
        scores.append((abs(corr), shift, corr))
    score, shift, corr = max(scores)
    ok = abs(shift) <= max_shift_frames and score >= min_corr
    return rec("tempo_sync", "B", "Animation follows tempo.json (rep timeline shipped to the app)", PASS if ok else FAIL,
               {"shift_frames": shift, "correlation": round(score, 4)}, {"max_shift_frames": max_shift_frames, "min_correlation": min_corr},
               {"joint": joint}, "best alignment of the farthest-travelling joint with the progress rebuilt from tempo.json")


def implement_clash(overlaps: dict, frames: list) -> dict:
    """Two implements must never pass through each other (14/11 Kiệt's
    recording: the two dumbbells of the shoulder press overlapped at the
    top and no check caught it). ``overlaps``: "A|B" -> per-frame count of
    overlapping triangle pairs."""
    worst = (0, None, None)
    for pair, arr in overlaps.items():
        for i, n in enumerate(arr):
            if n > worst[0]:
                worst = (int(n), pair, frames[i])
    return rec("implement_clash", "C", "Implements do not pass through each other", PASS if worst[0] == 0 else FAIL,
               worst[0], 0, {"pair": worst[1], "frame": worst[2]}, "overlapping triangle pairs")
