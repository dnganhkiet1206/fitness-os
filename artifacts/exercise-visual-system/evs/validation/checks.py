"""Automated checks on a sampled exercise animation. Plain Python + numpy.

Input is what evs/sampling.py measured (or a synthetic equivalent in the unit
tests). Every check returns one record with a status from the five allowed
values. These checks find defects in animation DATA: jumps, slides,
penetration, asymmetry, broken contact. They cannot tell whether the
technique shown is right for a human body; that question is answered by the
approval records in report.py and is never PASS without a qualified reviewer."""

from __future__ import annotations

import math

import numpy as np

from .. import CHECK_STATUSES, FAIL, NOT_TESTED, PASS, REQUIRES_MANUAL_REVIEW


def record(check_id: str, category: str, title: str, status: str, measured=None, limit=None, unit: str = "",
           detail: str = "", phases: list[str] | None = None) -> dict:
    if status not in CHECK_STATUSES:
        raise ValueError(f"status {status!r} is not one of {CHECK_STATUSES}")
    return {"id": check_id, "category": category, "title": title, "status": status, "measured": measured, "limit": limit,
            "unit": unit, "detail": detail, "phases": phases or []}


def _r(value, digits: int = 4):
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        return [_r(v, digits) for v in value]
    return round(float(value), digits)


def angle_between(u: np.ndarray, v: np.ndarray) -> np.ndarray:
    u = u / np.linalg.norm(u, axis=-1, keepdims=True)
    v = v / np.linalg.norm(v, axis=-1, keepdims=True)
    return np.degrees(np.arccos(np.clip((u * v).sum(axis=-1), -1.0, 1.0)))


def interior_angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    """Angle at b of the chain a-b-c, in degrees (180 = straight)."""
    return angle_between(a - b, c - b)


class Clip:
    """Convenience view on the sampled data."""

    def __init__(self, samples: dict, exercise: dict):
        self.s = samples
        self.fps = samples["fps"]
        self.frames = np.array(samples["frames"])
        self.j = {k: np.array(v, dtype=float) for k, v in samples["joints"].items()}
        self.bar = np.array(samples["bar"]["center"], dtype=float)
        self.axis = np.array(samples["bar"]["axis"], dtype=float)
        self.phases = {p["id"]: p for p in exercise["exercise_phases"]}
        self.first = int(self.frames[0])

    def span(self, phase: str) -> slice:
        p = self.phases[phase]
        return slice(int(round(p["start_s"] * self.fps)) - self.first, int(round(p["end_s"] * self.fps)) - self.first + 1)

    def has(self, phase: str) -> bool:
        return phase in self.phases


def _both(clip: Clip, name: str) -> tuple[np.ndarray, np.ndarray]:
    return clip.j[f"{name}_l"], clip.j[f"{name}_r"]


# --------------------------------------------------------------------------
# Character
# --------------------------------------------------------------------------

def character_checks(samples: dict, facts: dict, profile: dict, rig_test: dict | None) -> list[dict]:
    out = []
    const = samples["constants"]
    expected = facts["bones"]
    names_ok = sorted(const["deform_bones"]) == sorted(expected.keys())
    parents_ok = names_ok and all(const["parents"][n] == expected[n]["parent"] for n in expected)
    out.append(record("skeleton_integrity", "character", "Skeleton matches the master character (bone names and hierarchy)",
                      PASS if parents_ok else FAIL, measured=len(const["deform_bones"]), limit=len(expected), unit="deform bones",
                      detail="" if parents_ok else "bone names or parents differ from character_facts.json"))
    rest_error = max(abs(const["rest_bone_length_m"][n] - expected[n]["length_m"]) for n in expected) if names_ok else None
    same = names_ok and rest_error < 1e-4 and const["body_vertices"] == facts["vertices"]
    out.append(record("character_identity", "character", "Same mesh and bone lengths as the saved master character",
                      PASS if same else FAIL, measured={"body_vertices": const["body_vertices"], "max_rest_length_difference_m": _r(rest_error, 6)},
                      limit={"body_vertices": facts["vertices"], "max_rest_length_difference_m": 1e-4}))
    stretch = max(samples["bone_length_error_m"])
    out.append(record("bone_lengths", "character", "Bone lengths stay constant during the clip (no stretching)",
                      PASS if stretch <= 1e-4 else FAIL, measured=_r(stretch, 6), limit=1e-4, unit="m"))
    deformation = samples.get("deformation") or {}
    if deformation:
        p999 = max(d["p999_edge_stretch"] for d in deformation.values())
        volume = max(abs(d["volume_change"]) for d in deformation.values())
        ok = p999 <= profile["max_p999_edge_stretch"] and volume <= profile["max_volume_change"]
        out.append(record("skin_deformation", "character", "Skin stretch and body volume stay within limits in the exercise poses",
                          PASS if ok else FAIL, measured={"p99.9_edge_stretch": _r(p999, 3), "volume_change": _r(volume, 4)},
                          limit={"p99.9_edge_stretch": profile["max_p999_edge_stretch"], "volume_change": profile["max_volume_change"]},
                          detail=f"measured at frames {sorted(int(f) for f in deformation)}"))
        crossing = max(d["new_self_intersections"] for d in deformation.values())
        out.append(record("mesh_self_intersection", "character", "Skin passing through skin (beyond the rest pose)",
                          PASS if crossing <= profile["max_new_self_intersections"] else REQUIRES_MANUAL_REVIEW,
                          measured=crossing, limit=profile["max_new_self_intersections"], unit="face pairs",
                          detail="Skin folding onto skin at a bent elbow or inside a closed fist is contact, not a defect; a count above the limit needs eyes."))
    else:
        out.append(record("skin_deformation", "character", "Skin stretch and body volume in the exercise poses", NOT_TESTED))
        out.append(record("mesh_self_intersection", "character", "Skin passing through skin", NOT_TESTED))
    out.append(record("deformation_visual", "character", "Shoulder, elbow, hip, knee and wrist deformation looks anatomically right",
                      REQUIRES_MANUAL_REVIEW, detail="Look at the rendered frames and at characters/<id>/rig_deformation_test.png."))
    if rig_test:
        statuses = {name: p["status"] for name, p in rig_test["poses"].items()}
        worst = FAIL if FAIL in statuses.values() else (REQUIRES_MANUAL_REVIEW if REQUIRES_MANUAL_REVIEW in statuses.values() else PASS)
        out.append(record("rig_compatibility", "character", "Rig test poses (joint ranges other exercises will need)", worst, measured=statuses,
                          detail="From characters/<id>/rig_test.json. A pose that fails here limits which exercises this rig can show without corrective work."))
    else:
        out.append(record("rig_compatibility", "character", "Rig test poses", NOT_TESTED, detail="run pipeline/test_rig.py"))
    return out


# --------------------------------------------------------------------------
# Movement
# --------------------------------------------------------------------------

def movement_checks(clip: Clip, profile: dict) -> list[dict]:
    out = []
    fps = clip.fps
    sh_l, sh_r = _both(clip, "shoulder")
    el_l, el_r = _both(clip, "elbow")
    wr_l, wr_r = _both(clip, "wrist")
    hip_l, hip_r = _both(clip, "hip")
    kn_l, kn_r = _both(clip, "knee")
    an_l, an_r = _both(clip, "ankle")
    elbow = {"l": interior_angle(sh_l, el_l, wr_l), "r": interior_angle(sh_r, el_r, wr_r)}
    knee = {"l": interior_angle(hip_l, kn_l, an_l), "r": interior_angle(hip_r, kn_r, an_r)}

    flexion = 180.0 - np.concatenate([elbow["l"], elbow["r"]])
    lo, hi = profile["elbow_flexion_range_deg"]
    out.append(record("elbow_range", "movement", "Elbow flexion stays inside the allowed range",
                      PASS if flexion.min() >= lo - 1e-6 and flexion.max() <= hi + 1e-6 else FAIL,
                      measured=[_r(flexion.min(), 1), _r(flexion.max(), 1)], limit=[lo, hi], unit="deg of flexion"))
    lo, hi = profile["knee_flexion_range_deg"]
    kflex = 180.0 - np.concatenate([knee["l"], knee["r"]])
    out.append(record("knee_range", "movement", "Knee flexion stays inside the allowed range",
                      PASS if kflex.min() >= lo and kflex.max() <= hi else FAIL, measured=[_r(kflex.min(), 1), _r(kflex.max(), 1)],
                      limit=[lo, hi], unit="deg of flexion"))

    for phase in ("start_position", "lockout"):
        if clip.has(phase):
            sl = clip.span(phase)
            worst = float(min(elbow["l"][sl].min(), elbow["r"][sl].min()))
            out.append(record(f"elbow_extension_{phase}", "movement", f"Elbows extended in '{phase}'",
                              PASS if worst >= profile["min_elbow_angle_at_lockout_deg"] else FAIL, measured=_r(worst, 1),
                              limit=profile["min_elbow_angle_at_lockout_deg"], unit="deg (180 = straight)", phases=[phase]))

    if clip.has("bottom"):
        sl = clip.span("bottom")
        trunk = 0.5 * (hip_l + hip_r) - 0.5 * (sh_l + sh_r)
        abduction = np.concatenate([angle_between(el_l - sh_l, trunk)[sl], angle_between(el_r - sh_r, trunk)[sl]])
        lo, hi = profile["shoulder_abduction_at_bottom_deg"]
        out.append(record("shoulder_abduction_bottom", "movement", "Upper arm angle to the trunk at the bottom is inside the configured range",
                          PASS if abduction.min() >= lo and abduction.max() <= hi else FAIL, measured=[_r(abduction.min(), 1), _r(abduction.max(), 1)],
                          limit=[lo, hi], unit="deg", phases=["bottom"],
                          detail="The range is a configuration choice. No primary source prescribes an angle (see reference_notes.json)."))
        up = np.array([0.0, 0.0, 1.0])
        tilt = np.concatenate([angle_between(wr_l - el_l, up)[sl], angle_between(wr_r - el_r, up)[sl]])
        out.append(record("forearm_vertical_bottom", "movement", "Forearms upright under the bar at the bottom",
                          PASS if tilt.max() <= profile["max_forearm_from_vertical_at_bottom_deg"] else FAIL, measured=_r(tilt.max(), 2),
                          limit=profile["max_forearm_from_vertical_at_bottom_deg"], unit="deg from vertical", phases=["bottom"]))

    rep = [p for p in ("eccentric", "bottom", "concentric") if clip.has(p)]
    if rep:
        sl = slice(clip.span(rep[0]).start, clip.span(rep[-1]).stop)
        # Only while the elbow is bent: with straight arms and a grip wider than
        # the shoulders the forearm has to lean out, and that is not tracking.
        bent = np.concatenate([elbow["l"][sl], elbow["r"][sl]]) < profile.get("elbow_tracking_below_deg", 150.0)
        frontal = np.concatenate([np.degrees(np.arctan2(np.abs(w[sl, 0] - e[sl, 0]), np.abs(w[sl, 2] - e[sl, 2]))) for e, w in ((el_l, wr_l), (el_r, wr_r))])
        frontal = frontal[bent] if bent.any() else np.zeros(1)
        out.append(record("elbow_tracking", "movement", "Elbows stay under the wrists through the repetition (front view)",
                          PASS if frontal.max() <= profile["max_forearm_frontal_tilt_during_rep_deg"] else FAIL, measured=_r(frontal.max(), 2),
                          limit=profile["max_forearm_frontal_tilt_during_rep_deg"], unit="deg forearm lean in the front view", phases=rep))

    # Wrist: angle between forearm and hand, split into bending back (extension)
    # and bending sideways (deviation).
    ext_all, dev_all = [], []
    for s, elb, wri in (("l", el_l, wr_l), ("r", el_r, wr_r)):
        forearm = wri - elb
        forearm /= np.linalg.norm(forearm, axis=1, keepdims=True)
        long_axis = np.array(clip.s["hand"][s]["long"], dtype=float)
        across = np.array(clip.s["hand"][s]["across"], dtype=float)
        normal = np.array(clip.s["hand"][s]["normal"], dtype=float)
        ext_all.append(np.degrees(np.arctan2((forearm * normal).sum(axis=1), (forearm * long_axis).sum(axis=1))))  # + = bent back
        dev_all.append(np.degrees(np.arcsin(np.clip((forearm * across).sum(axis=1), -1, 1))))
    ext = np.concatenate(ext_all)
    dev = np.abs(np.concatenate(dev_all))
    lo, hi = profile["wrist_extension_range_deg"]
    out.append(record("wrist_extension", "movement", "Wrist bend (extension) stays inside the allowed range",
                      PASS if ext.min() >= lo and ext.max() <= hi else FAIL, measured=[_r(ext.min(), 1), _r(ext.max(), 1)], limit=[lo, hi], unit="deg"))
    out.append(record("wrist_deviation", "movement", "Wrist side bend (radial / ulnar deviation) stays inside the allowed range",
                      PASS if dev.max() <= profile["max_wrist_deviation_deg"] else FAIL, measured=_r(dev.max(), 1),
                      limit=profile["max_wrist_deviation_deg"], unit="deg"))

    # Continuity of the bar: speed and acceleration by finite differences.
    vel = np.diff(clip.bar, axis=0) * fps
    speed = np.linalg.norm(vel, axis=1)
    acc = np.linalg.norm(np.diff(vel, axis=0), axis=1) * fps
    out.append(record("bar_speed", "movement", "Bar speed has no spikes", PASS if speed.max() <= profile["max_bar_speed_m_s"] else FAIL,
                      measured=_r(speed.max(), 3), limit=profile["max_bar_speed_m_s"], unit="m/s"))
    out.append(record("bar_acceleration", "movement", "Bar acceleration has no spikes",
                      PASS if acc.max() <= profile["max_bar_acceleration_m_s2"] else FAIL, measured=_r(acc.max(), 3),
                      limit=profile["max_bar_acceleration_m_s2"], unit="m/s^2"))
    joint_speed = max(float(np.linalg.norm(np.diff(p, axis=0), axis=1).max() * fps) for p in clip.j.values())
    out.append(record("joint_position_continuity", "movement", "No joint jumps between frames",
                      PASS if joint_speed <= profile["max_joint_speed_m_s"] else FAIL, measured=_r(joint_speed, 3),
                      limit=profile["max_joint_speed_m_s"], unit="m/s (fastest joint)"))
    steps = {n: (max(v) if v else 0.0) for n, v in clip.s["bone_step_deg"].items()}
    worst_bone = max(steps, key=steps.get)
    jump = steps[worst_bone]
    out.append(record("joint_rotation_continuity", "movement", "No sudden joint rotation between frames",
                      PASS if jump <= profile["max_frame_to_frame_joint_jump_deg"] and jump * fps <= profile["max_joint_angular_speed_deg_s"] else FAIL,
                      measured={"largest_step_deg": _r(jump, 3), "bone": worst_bone, "angular_speed_deg_s": _r(jump * fps, 1)},
                      limit={"largest_step_deg": profile["max_frame_to_frame_joint_jump_deg"], "angular_speed_deg_s": profile["max_joint_angular_speed_deg_s"]}))

    # Symmetry: the right side should mirror the left.
    mirror = np.array([-1.0, 1.0, 1.0])
    offsets = [float(np.linalg.norm(clip.j[f"{n}_l"] - clip.j[f"{n}_r"] * mirror, axis=1).max()) for n in ("shoulder", "elbow", "wrist", "hip", "knee", "ankle")]
    angle_diff = float(np.abs(elbow["l"] - elbow["r"]).max())
    ok = max(offsets) <= profile["max_left_right_position_difference_m"] and angle_diff <= profile["max_left_right_joint_angle_difference_deg"]
    out.append(record("symmetry", "movement", "Left and right sides mirror each other", PASS if ok else FAIL,
                      measured={"position_m": _r(max(offsets), 5), "elbow_angle_deg": _r(angle_diff, 3)},
                      limit={"position_m": profile["max_left_right_position_difference_m"], "elbow_angle_deg": profile["max_left_right_joint_angle_difference_deg"]}))

    # Feet: no sliding, no lifting, no sinking into the floor.
    slide = max(float(np.linalg.norm((clip.j[k] - clip.j[k][0])[:, :2], axis=1).max()) for k in ("ankle_l", "ankle_r", "toe_l", "toe_r"))
    soles = np.array([clip.s["foot"]["l"]["sole_min_z_m"], clip.s["foot"]["r"]["sole_min_z_m"]])
    ok = slide <= profile["max_foot_slide_m"] and soles.max() <= profile["max_foot_lift_m"] and soles.min() >= -profile["max_foot_into_floor_m"]
    out.append(record("foot_contact", "movement", "Feet stay planted: no sliding, lifting or sinking", PASS if ok else FAIL,
                      measured={"slide_m": _r(slide, 5), "sole_height_m": [_r(soles.min(), 4), _r(soles.max(), 4)]},
                      limit={"slide_m": profile["max_foot_slide_m"], "sole_height_m": [-profile["max_foot_into_floor_m"], profile["max_foot_lift_m"]]}))

    bench = clip.s["bench"]
    gaps = {k: [min(bench[k]), max(bench[k])] for k in ("head_gap_m", "upper_back_gap_m", "glute_gap_m")}
    ok = all(v[1] <= profile["max_bench_contact_gap_m"] for v in gaps.values())
    out.append(record("bench_contact", "movement", "Head, upper back and glutes stay on the bench", PASS if ok else FAIL,
                      measured={k: _r(v, 4) for k, v in gaps.items()}, limit=profile["max_bench_contact_gap_m"], unit="m above the pad (negative = pressed in)"))
    drift = {k: float(np.linalg.norm(clip.j[k] - clip.j[k][0], axis=1).max()) for k in ("pelvis", "chest", "head")}
    ok = drift["pelvis"] <= profile["max_pelvis_drift_m"] and drift["chest"] <= profile["max_pelvis_drift_m"] and drift["head"] <= profile["max_head_drift_m"]
    out.append(record("unexplained_body_movement", "movement", "Trunk and head do not drift", PASS if ok else FAIL,
                      measured={k: _r(v, 5) for k, v in drift.items()}, limit=profile["max_pelvis_drift_m"], unit="m"))
    return out


# --------------------------------------------------------------------------
# Equipment
# --------------------------------------------------------------------------

def equipment_checks(clip: Clip, profile: dict, exercise: dict, inventory: dict | None, equipment_specs: dict | None) -> list[dict]:
    out = []
    s = clip.s
    radius = s["constants"]["bar_radius_m"]
    hand = s["hand"]

    centres = np.array([hand["l"]["grip_centre_on_bar_m"], hand["r"]["grip_centre_on_bar_m"]], dtype=float)
    asym = float(np.nanmax(np.abs(centres[0] + centres[1])))
    out.append(record("grip_symmetry", "equipment", "Hands are the same distance from the middle of the bar",
                      PASS if asym <= profile["max_grip_asymmetry_m"] else FAIL, measured=_r(asym, 5), limit=profile["max_grip_asymmetry_m"], unit="m",
                      detail=f"grip centres at {_r(float(np.nanmean(centres[0])), 3)} m and {_r(float(np.nanmean(centres[1])), 3)} m from the middle"))

    socket = max(max(hand["l"]["socket_distance_m"] or [0]), max(hand["r"]["socket_distance_m"] or [0]))
    socket_angle = max(max(hand["l"]["socket_angle_deg"] or [0]), max(hand["r"]["socket_angle_deg"] or [0]))
    touch = max(max(hand["l"]["min_distance_to_bar_axis_m"]), max(hand["r"]["min_distance_to_bar_axis_m"])) - radius
    ok = socket <= profile["max_hand_to_socket_m"] and socket_angle <= profile["max_hand_to_socket_deg"] and touch <= profile["max_hand_bar_gap_m"]
    out.append(record("hand_bar_contact", "equipment", "Hands stay on the bar in every frame", PASS if ok else FAIL,
                      measured={"hand_to_grip_socket_m": _r(socket, 6), "hand_to_grip_socket_deg": _r(socket_angle, 3), "skin_to_bar_surface_m": _r(touch, 5)},
                      limit={"hand_to_grip_socket_m": profile["max_hand_to_socket_m"], "hand_to_grip_socket_deg": profile["max_hand_to_socket_deg"],
                             "skin_to_bar_surface_m": profile["max_hand_bar_gap_m"]}))
    inside = max(max(hand["l"]["skin_inside_bar_m"]), max(hand["r"]["skin_inside_bar_m"]))
    out.append(record("hand_bar_penetration", "equipment", "Hand skin does not pass through the bar",
                      PASS if inside <= profile["max_hand_into_bar_m"] else FAIL, measured=_r(inside, 5), limit=profile["max_hand_into_bar_m"], unit="m"))

    tilt = float(np.degrees(np.arcsin(np.clip(np.abs(clip.axis[:, 2]), 0, 1))).max())
    yaw = float(np.degrees(np.arctan2(np.abs(clip.axis[:, 1]), np.abs(clip.axis[:, 0]))).max())
    out.append(record("bar_level", "equipment", "Bar stays level and square (no tilt, no twist)",
                      PASS if tilt <= profile["max_bar_tilt_deg"] and yaw <= profile["max_bar_yaw_deg"] else FAIL,
                      measured={"tilt_deg": _r(tilt, 4), "yaw_deg": _r(yaw, 4)}, limit={"tilt_deg": profile["max_bar_tilt_deg"], "yaw_deg": profile["max_bar_yaw_deg"]}))

    if clip.has("eccentric") and clip.has("concentric"):
        down = clip.bar[clip.span("eccentric")]
        up = clip.bar[clip.span("concentric")]
        reversal = max(float(np.diff(down[:, 2]).max()), float(-np.diff(up[:, 2]).min()), 0.0)
        vertical = float(down[:, 2].max() - down[:, 2].min())
        horizontal = float(abs(down[0, 1] - down[-1, 1]))
        lateral = float(np.abs(clip.bar[:, 0] - clip.bar[0, 0]).max())
        lo, hi = profile["bar_vertical_range_m"]
        ok = reversal <= 1e-4 and lo <= vertical <= hi and horizontal <= profile["max_bar_horizontal_travel_m"] and lateral <= 1e-3
        out.append(record("bar_path", "equipment", "Bar path is plausible: steady down, steady up, no sideways drift", PASS if ok else FAIL,
                          measured={"vertical_range_m": _r(vertical, 4), "horizontal_travel_m": _r(horizontal, 4), "reversal_m": _r(reversal, 5), "sideways_drift_m": _r(lateral, 5)},
                          limit={"vertical_range_m": [lo, hi], "horizontal_travel_m": profile["max_bar_horizontal_travel_m"], "reversal_m": 1e-4, "sideways_drift_m": 1e-3},
                          phases=["eccentric", "concentric"],
                          detail="'Plausible' means inside the range of published measurements (reference_notes.json). It does not mean the path is the right one for a given lifter."))

    shoulder_y = 0.5 * (clip.j["shoulder_l"][:, 1] + clip.j["shoulder_r"][:, 1])
    for phase in ("start_position", "lockout"):
        if clip.has(phase):
            sl = clip.span(phase)
            off = float(np.abs(clip.bar[sl, 1] - shoulder_y[sl]).max())
            out.append(record(f"bar_over_shoulders_{phase}", "equipment", f"Bar is over the shoulder joints in '{phase}'",
                              PASS if off <= profile["lockout_bar_over_shoulder_tolerance_m"] else FAIL, measured=_r(off, 4),
                              limit=profile["lockout_bar_over_shoulder_tolerance_m"], unit="m", phases=[phase]))
    if clip.has("bottom"):
        sl = clip.span("bottom")
        target = exercise["technique"]["touch_point_below_shoulder_joint_m"]
        off = float(np.abs((shoulder_y[sl] - clip.bar[sl, 1]) - target).max())
        out.append(record("bar_touch_point", "equipment", "Bar meets the chest at the configured touch point",
                          PASS if off <= profile["touch_point_tolerance_m"] else FAIL, measured=_r(off, 4), limit=profile["touch_point_tolerance_m"],
                          unit="m from the configured point", phases=["bottom"]))

    sink = max(s["bar_into_torso_m"])
    out.append(record("bar_torso_penetration", "equipment", "Bar does not sink into the torso",
                      PASS if sink <= profile["max_bar_into_torso_m"] else FAIL, measured=_r(sink, 5), limit=profile["max_bar_into_torso_m"], unit="m"))
    pad = max(s["bench"]["body_into_pad_m"])
    out.append(record("body_bench_penetration", "equipment", "Body does not sink into the bench beyond pad compression",
                      PASS if pad <= profile["max_body_into_bench_m"] else FAIL, measured=_r(pad, 4), limit=profile["max_body_into_bench_m"], unit="m"))
    clearances = [c for c in s["bar_to_rest_clearance_m"] if c is not None]
    if clearances:
        out.append(record("bar_rack_clearance", "equipment", "Bar clears the lip of the rests on the way out and back in",
                          PASS if min(clearances) >= profile["min_bar_to_rack_clearance_m"] else FAIL, measured=_r(min(clearances), 4),
                          limit=profile["min_bar_to_rack_clearance_m"], unit="m", phases=["unrack", "finish"]))
    else:
        out.append(record("bar_rack_clearance", "equipment", "Bar clears the lip of the rests", NOT_TESTED,
                          detail="the bar never crossed the lip in the sampled frames"))
    drift = max(max(s["plate_drift_m"]), max(s["static_equipment_drift_m"]))
    out.append(record("equipment_stability", "equipment", "Plates stay fixed on the bar; bench and rack do not move",
                      PASS if drift <= 1e-5 else FAIL, measured=_r(drift, 7), limit=1e-5, unit="m"))

    if inventory and equipment_specs:
        dims = inventory["equipment_dimensions_m"]
        problems = []
        measured = {}
        for item in exercise["equipment"]:
            spec = equipment_specs[item["spec"]]
            if spec["type"] == "barbell":
                length = dims.get(item["id"].capitalize(), [0])[0]
                measured["bar_length_m"] = length
                if abs(length - spec["total_length"]) > 0.003:
                    problems.append(f"bar length {length} != {spec['total_length']}")
                plate = equipment_specs[item["plate_spec"]]
                for name, d in dims.items():
                    if "_Plate_" in name:
                        measured["plate_diameter_m"] = max(d[1], d[2])
                        if abs(max(d[1], d[2]) - plate["diameter"]) > 0.003:
                            problems.append(f"{name} diameter {max(d[1], d[2])} != {plate['diameter']}")
            if spec["type"] == "bench_rack":
                pad = dims.get(f"{item['id'].capitalize()}_Pad")
                if pad:
                    measured["pad_m"] = pad
                    if abs(pad[0] - spec["pad_width"]) > 0.003 or abs(pad[1] - spec["pad_length"]) > 0.003:
                        problems.append(f"pad {pad} != {spec['pad_width']} x {spec['pad_length']}")
                measured["pad_top_m"] = s["constants"]["pad_top_m"]
                if abs(s["constants"]["pad_top_m"] - spec["pad_top_height"]) > 0.002:
                    problems.append("pad height differs from the specification")
        out.append(record("equipment_scale", "equipment", "Equipment has its specified real-world size",
                          PASS if not problems else FAIL, measured=_r_dict(measured), detail="; ".join(problems)))
    else:
        out.append(record("equipment_scale", "equipment", "Equipment has its specified real-world size", NOT_TESTED))
    return out


def _r_dict(d: dict) -> dict:
    return {k: _r(v, 4) for k, v in d.items()}


def joint_positions_by_phase(clip: Clip) -> dict:
    """Joint and bar positions at the start and end of every phase."""
    out = {}
    for name in clip.phases:
        sl = clip.span(name)
        first, last = sl.start, sl.stop - 1
        out[name] = {
            "start_frame": int(clip.frames[first]), "end_frame": int(clip.frames[last]),
            "bar_centre_m": {"start": _r(clip.bar[first].tolist(), 4), "end": _r(clip.bar[last].tolist(), 4)},
            "joints_m": {k: {"start": _r(v[first].tolist(), 4), "end": _r(v[last].tolist(), 4)} for k, v in clip.j.items()},
            "elbow_angle_deg": {
                "start": _r(float(interior_angle(clip.j["shoulder_l"][first], clip.j["elbow_l"][first], clip.j["wrist_l"][first])), 1),
                "end": _r(float(interior_angle(clip.j["shoulder_l"][last], clip.j["elbow_l"][last], clip.j["wrist_l"][last])), 1),
            },
        }
    return out


def safe_number(x):
    return None if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))) else x
