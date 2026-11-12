"""Assembles the QA report: rendering and export checks, the approval records
and the publication gate. Plain Python.

Rules that are enforced here, not left to whoever writes the report:
  * every status is one of PASS, FAIL, NOT_TESTED, REQUIRES_MANUAL_REVIEW, UNVERIFIED;
  * a check that did not run is NOT_TESTED, never PASS;
  * biomechanical correctness is never PASS without a named reviewer and date;
  * only an exercise whose status is APPROVED can be published."""

from __future__ import annotations

from pathlib import Path

from .. import (CHECK_STATUSES, EXERCISE_STATUSES, FAIL, NOT_TESTED, PASS, PUBLISHABLE_STATUS, REQUIRES_MANUAL_REVIEW,
                UNVERIFIED, UNVERIFIED_LABEL)
from .checks import record

REQUIRED_EXERCISE_FIELDS = (
    "exercise_id", "exercise_name", "exercise_category", "equipment", "primary_muscles", "secondary_muscles", "stabilizing_muscles",
    "master_character_id", "motion_source_id", "motion_source_license", "animation_file", "animation_duration", "frame_rate",
    "exercise_phases", "camera_presets", "validation_profile", "validation_results", "technical_cues", "common_mistakes", "status",
    "reviewer", "approval_date", "brand_profile_id",
)
REQUIRED_CAMERAS = ("side", "front", "three_quarter")


def validate_exercise_config(exercise: dict, muscle_groups: list[str] | None = None, camera_presets: list[str] | None = None) -> list[str]:
    """Problems in an exercise.json, as readable sentences (empty = valid)."""
    problems = [f"missing field '{f}'" for f in REQUIRED_EXERCISE_FIELDS if f not in exercise]
    if problems:
        return problems
    if exercise["status"] not in EXERCISE_STATUSES:
        problems.append(f"status '{exercise['status']}' is not one of {list(EXERCISE_STATUSES)}")
    if exercise["status"] == PUBLISHABLE_STATUS and not (exercise.get("reviewer") and exercise.get("approval_date")):
        problems.append("status APPROVED needs a reviewer and an approval_date")
    previous_end = None
    for p in exercise["exercise_phases"]:
        for key in ("id", "name", "start_s", "end_s", "cues", "checks"):
            if key not in p:
                problems.append(f"phase {p.get('id', '?')} lacks '{key}'")
        if "start_s" in p and "end_s" in p:
            if p["end_s"] <= p["start_s"]:
                problems.append(f"phase {p['id']} ends before it starts")
            if previous_end is not None and abs(p["start_s"] - previous_end) > 1e-6:
                problems.append(f"phase {p['id']} does not start where the previous phase ends")
            previous_end = p["end_s"]
    if previous_end is not None and abs(previous_end - exercise["animation_duration"]) > 1e-6:
        problems.append("animation_duration differs from the end of the last phase")
    if muscle_groups is not None:
        for role in ("primary_muscles", "secondary_muscles", "stabilizing_muscles"):
            for m in exercise[role]:
                if m not in muscle_groups:
                    problems.append(f"{role}: '{m}' is not a group in the muscle map")
        if not exercise["primary_muscles"]:
            problems.append("primary_muscles is empty")
    if camera_presets is not None:
        for c in exercise["camera_presets"]:
            if c not in camera_presets:
                problems.append(f"camera preset '{c}' does not exist")
    for c in REQUIRED_CAMERAS:
        if c not in exercise["camera_presets"]:
            problems.append(f"camera preset '{c}' is required")
    return problems


def rendering_checks(exercise_path: Path, exercise: dict, inventory: dict | None, render_meta: dict | None, preset: dict | None,
                     video_stats: dict | None, sync: dict | None, profile: dict) -> list[dict]:
    out = []
    if inventory is None:
        return [record("scene_inventory", "rendering", "Scene contents", NOT_TESTED)]
    missing = [c for c in REQUIRED_CAMERAS if c not in inventory["cameras"]]
    out.append(record("cameras_present", "rendering", "Side, front and 45-degree cameras exist in the scene", PASS if not missing else FAIL,
                      measured=sorted(inventory["cameras"]), detail=f"missing: {missing}" if missing else ""))
    out.append(record("materials_present", "rendering", "Every mesh has a material", PASS if not inventory["objects_without_material"] else FAIL,
                      measured=inventory["objects_without_material"]))
    out.append(record("geometry_present", "rendering", "No empty meshes", PASS if not inventory["objects_without_faces"] else FAIL,
                      measured=inventory["objects_without_faces"]))
    animated = inventory["animated_objects"]
    out.append(record("animation_present", "rendering", "The scene has keyframed animation", PASS if animated else FAIL,
                      measured={k: v["keyframes"] for k, v in animated.items()}, unit="keyframes per animated object"))

    if not render_meta:
        for cid, title in (("output_files", "Video files exist and are not empty"), ("resolution", "Resolution matches the render preset"),
                           ("frame_rate", "Frame rate matches the timeline"), ("frame_count", "Every camera has the same number of frames as the timeline"),
                           ("blank_frames", "No blank frames"), ("flicker", "No brightness flicker"), ("camera_sync", "Cameras show the same motion at the same time")):
            out.append(record(cid, "rendering", title, NOT_TESTED, detail="render_metadata.json not found: run pipeline/render_cameras.py"))
        return out

    outputs = render_meta["outputs"]
    need = [c for c in REQUIRED_CAMERAS if c not in outputs]
    sizes = {k: v["probe"]["size_bytes"] for k, v in outputs.items()}
    files_ok = not need and all((exercise_path / v["file"]).exists() and v["probe"]["size_bytes"] > 10_000 for v in outputs.values())
    out.append(record("output_files", "rendering", "Video files exist and are not empty", PASS if files_ok else FAIL, measured=sizes, unit="bytes",
                      detail=f"missing cameras: {need}" if need else ""))
    codecs = {k: f"{v['probe']['codec']}/{v['probe']['pixel_format']}" for k, v in outputs.items()}
    out.append(record("video_codec", "rendering", "H.264 with 4:2:0 chroma (plays in AVPlayer and browsers)",
                      PASS if all(c == "h264/yuv420p" for c in codecs.values()) else FAIL, measured=codecs))
    want = list(preset["resolution"]) if preset else render_meta["resolution"]
    res = {k: [v["probe"]["width"], v["probe"]["height"]] for k, v in outputs.items()}
    out.append(record("resolution", "rendering", "Resolution matches the render preset", PASS if all(r == want for r in res.values()) else FAIL,
                      measured=res, limit=want, unit="pixels"))
    fps = {k: v["probe"]["frame_rate"] for k, v in outputs.items()}
    out.append(record("frame_rate", "rendering", "Frame rate matches the timeline", PASS if all(abs(f - exercise["frame_rate"]) < 1e-3 for f in fps.values()) else FAIL,
                      measured=fps, limit=exercise["frame_rate"], unit="fps"))
    timeline = inventory["frame_range"][1] - inventory["frame_range"][0] + 1
    counts = {k: v["probe"]["frames_decoded"] for k, v in outputs.items()}
    out.append(record("frame_count", "rendering", "Every camera has the same number of frames as the timeline",
                      PASS if all(c == timeline for c in counts.values()) else FAIL, measured=counts, limit=timeline, unit="frames"))
    same_source = render_meta.get("source_blend_sha256")
    out.append(record("single_animation_source", "rendering", "All cameras were rendered from one scene file",
                      PASS if same_source else NOT_TESTED, measured=same_source, detail="sha256 of the .blend every camera rendered"))

    if not video_stats:
        for cid, title in (("blank_frames", "No blank frames"), ("flicker", "No brightness flicker"), ("camera_sync", "Cameras show the same motion at the same time")):
            out.append(record(cid, "rendering", title, NOT_TESTED, detail="videos were not decoded"))
        return out
    blank = {k: v["blank_frames"] for k, v in video_stats.items()}
    out.append(record("blank_frames", "rendering", "No blank frames", PASS if not any(blank.values()) else FAIL, measured={k: len(v) for k, v in blank.items()}, unit="frames"))
    flicker = {k: v["static_area_brightness_step"] for k, v in video_stats.items()}
    out.append(record("flicker", "rendering", "No brightness flicker in the parts of the picture that do not move",
                      PASS if max(flicker.values()) <= profile["max_static_brightness_step"] else FAIL, measured=flicker,
                      limit=profile["max_static_brightness_step"], unit="grey levels (0-255) between consecutive frames"))
    if sync:
        # Lag 0 must fit as well as any other lag (within 0.01): views that see
        # the same motion differently (a bar rising seen from the front looks
        # like growth, not travel) do not correlate perfectly at any lag.
        ok = all((s["best_lag_frames"] == 0 or s["correlation_at_best_lag"] - s["correlation_at_lag_0"] < 0.01)
                 and s["still_frames_agreement"] >= profile["min_still_frame_agreement"] for s in sync.values())
        out.append(record("camera_sync", "rendering", "Cameras show the same motion at the same time", PASS if ok else FAIL, measured=sync,
                          limit={"lag_0_within_of_best_correlation": 0.01, "still_frames_agreement": profile["min_still_frame_agreement"]},
                          detail="Measured on the encoded videos: when the picture changes and when it holds still, camera against camera."))
    else:
        out.append(record("camera_sync", "rendering", "Cameras show the same motion at the same time", NOT_TESTED))
    return out


def export_checks(glb_report: dict | None, exercise: dict, inventory: dict | None) -> list[dict]:
    if not glb_report:
        return [record("glb_export", "export", "GLB files exist and are structurally valid", NOT_TESTED, detail="run pipeline/export_glb.py")]
    out = []
    files = glb_report["files"]
    errors = {name: f["errors"] for name, f in files.items()}
    out.append(record("glb_structure", "export", "GLB files parse and every accessor fits its buffer", PASS if not any(errors.values()) else FAIL,
                      measured={name: f["size_bytes"] for name, f in files.items()}, unit="bytes", detail=str(errors) if any(errors.values()) else ""))
    exp = glb_report["expectations"]
    skins = {name: [s["joints"] for s in f["skins"]] for name, f in files.items()}
    out.append(record("glb_skeleton", "export", "Exported skeleton has exactly the deform bones", PASS if all(s == [exp["deform_bones"]] for s in skins.values()) else FAIL,
                      measured=skins, limit=exp["deform_bones"], unit="joints"))
    anim_ok = exp["clip_max_keys"] == exp["animation_frames"] and abs((exp["clip_duration_s"] or 0) - exp["animation_duration_s"]) < 1e-3
    out.append(record("glb_animation", "export", "Exported animation covers the whole timeline", PASS if anim_ok else FAIL,
                      measured={"duration_s": exp["clip_duration_s"], "keys": exp["clip_max_keys"]},
                      limit={"duration_s": exp["animation_duration_s"], "keys": exp["animation_frames"]}))
    back = glb_report.get("reimport", {})
    ok = bool(back) and all(r["armatures"] == 1 and r["bones"] == exp["deform_bones"] and r["skinned_mesh_objects"] >= 1 for r in back.values())
    out.append(record("glb_reimport", "export", "GLB files load again in Blender with skeleton and skinned meshes", PASS if ok else FAIL, measured=back))
    variants = {name: f["material_variants"] for name, f in files.items() if f["animations"]}
    out.append(record("glb_highlight_variants", "export", "Animation GLB carries a muscle-highlight and a neutral material variant",
                      PASS if all({"muscle_highlight", "neutral"} <= set(v) for v in variants.values()) and variants else FAIL, measured=variants))
    out.append(record("glb_mobile_playback", "export", "GLB plays on an iPhone", NOT_TESTED,
                      detail="No GLB viewer is integrated in the app; iOS has no built-in glTF loader. The app integration uses MP4."))
    return out


def approval_records(exercise: dict) -> list[dict]:
    approved = exercise["status"] == PUBLISHABLE_STATUS and bool(exercise.get("reviewer")) and bool(exercise.get("approval_date"))
    source_verified = exercise.get("motion_source_verification") == "VERIFIED" and approved
    return [
        record("motion_source", "approval", "Motion comes from a verified reference", PASS if source_verified else UNVERIFIED,
               measured=exercise["motion_source_id"],
               detail=f"{exercise.get('motion_source_type', '')}: {exercise['motion_source_license']} Label: {exercise.get('motion_source_verification', UNVERIFIED_LABEL)}"),
        record("biomechanical_correctness", "approval", "Technique shown is biomechanically correct", PASS if approved else UNVERIFIED,
               detail="Cannot be established by automated checks. Needs review of the motion by a qualified professional."),
        record("muscle_mapping_review", "approval", "Highlighted muscles and their regions are anatomically right", PASS if approved else REQUIRES_MANUAL_REVIEW,
               detail="Roles follow the cited EMG review (reference_notes.json); the regions on the body were placed by the pipeline author."),
        record("expert_approval", "approval", "Approved by a qualified reviewer", PASS if approved else REQUIRES_MANUAL_REVIEW,
               measured={"reviewer": exercise.get("reviewer"), "approval_date": exercise.get("approval_date")},
               detail="PENDING" if not approved else ""),
    ]


def summarize(checks: list[dict], exercise: dict) -> dict:
    for c in checks:
        if c["status"] not in CHECK_STATUSES:
            raise ValueError(f"check {c['id']} has an illegal status {c['status']!r}")
    counts = {s: sum(1 for c in checks if c["status"] == s) for s in CHECK_STATUSES}
    automated = [c for c in checks if c["category"] != "approval"]
    failed = [c["id"] for c in automated if c["status"] == FAIL]
    untested = [c["id"] for c in automated if c["status"] == NOT_TESTED]
    manual = [c["id"] for c in checks if c["status"] in (REQUIRES_MANUAL_REVIEW, UNVERIFIED)]
    if failed:
        recommended = "NEEDS_CORRECTION"
    elif untested:
        recommended = "DRAFT"
    else:
        recommended = "EXPERT_REVIEW_PENDING"
    approved = (exercise["status"] == PUBLISHABLE_STATUS and bool(exercise.get("reviewer")) and bool(exercise.get("approval_date"))
                and not failed)
    return {
        "counts": counts,
        "failed_checks": failed,
        "not_tested_checks": untested,
        "needs_human": manual,
        "technical_qa": FAIL if failed else (NOT_TESTED if untested else PASS),
        "recommended_exercise_status": recommended,
        "expert_approval": "APPROVED" if approved else "PENDING",
        "publication_status": "PUBLISHABLE" if approved else "BLOCKED",
        "publication_blocked_because": [] if approved else [
            reason for reason, applies in (
                (f"exercise status is {exercise['status']}, not APPROVED", exercise["status"] != PUBLISHABLE_STATUS),
                ("no reviewer recorded", not exercise.get("reviewer")),
                ("no approval date recorded", not exercise.get("approval_date")),
                (f"automated checks failed: {failed}", bool(failed)),
            ) if applies],
    }
