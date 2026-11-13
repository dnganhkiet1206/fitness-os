"""Validates an exercise and writes its QA report.

    Blender -b --factory-startup --python pipeline/validate_animation.py -- --exercise bench-press

1. Opens the exercise's .blend, lists what is in it and samples every frame
   (joints, bar, hands, feet, contacts, penetration, skin deformation).
2. Runs the automated checks on those numbers (evs/validation/checks.py).
3. If videos were rendered, decodes them and checks frames, flicker and sync.
4. If GLB files were exported, checks what is inside them.
5. Adds the approval records and the publication gate.

Writes qa_report.json and adds the joint positions of every phase to
motion_metadata.json. A check that could not run is reported NOT_TESTED.

    python pipeline/validate_animation.py --exercise bench-press --from-samples

re-runs steps 2 to 5 without Blender on the samples saved by the last run."""

from __future__ import annotations

import argparse
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from evs import PIPELINE_VERSION, UNVERIFIED_LABEL, config  # noqa: E402
from evs.validation import checks, report, video  # noqa: E402


def sample_with_blender(exercise_path, exercise) -> tuple[dict, dict]:
    import bpy

    from evs import sampling

    bpy.ops.wm.open_mainfile(filepath=str(exercise_path / exercise["animation_file"]))
    scene = bpy.context.scene
    names = config.character_config()["names"]
    rig = bpy.data.objects[names["armature_object"]]
    body = bpy.data.objects[names["body_object"]]
    bar = bpy.data.objects["Barbell"]
    fps = scene.render.fps
    phase = {p["id"]: p for p in exercise["exercise_phases"]}

    def frame(seconds: float) -> int:
        return int(round(seconds * fps))

    ecc, con = phase["eccentric"], phase["concentric"]
    deformation_frames = sorted({0, frame(ecc["start_s"]), frame(0.5 * (ecc["start_s"] + ecc["end_s"])), frame(ecc["end_s"]),
                                 frame(0.5 * (con["start_s"] + con["end_s"]))})
    inventory = sampling.scene_inventory(scene, exercise)
    samples = sampling.sample_scene(scene, rig, body, bar, exercise, deformation_frames)
    return samples, inventory


def main(exercise_name: str | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exercise", default=exercise_name, required=exercise_name is None)
    parser.add_argument("--from-samples", action="store_true", help="reuse _motion_samples.json instead of opening Blender")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    exercise_path = config.exercise_dir(args.exercise)
    exercise = config.exercise_config(args.exercise)
    profile = exercise["validation_profile"]
    samples_path = exercise_path / "_motion_samples.json"
    if args.from_samples:
        saved = config.load_json(samples_path)
        samples, inventory = saved["samples"], saved["inventory"]
    else:
        samples, inventory = sample_with_blender(exercise_path, exercise)
        with open(samples_path, "w", encoding="utf-8") as fh:
            json.dump({"samples": samples, "inventory": inventory}, fh, allow_nan=True)

    character_dir = config.character_dir(exercise["master_character_id"])
    facts = config.load_json(character_dir / "character_facts.json")
    rig_test_path = character_dir / "rig_test.json"
    rig_test = config.load_json(rig_test_path) if rig_test_path.exists() else None
    muscle_map = config.muscle_map()
    cameras = config.camera_presets()["presets"]

    results = []
    problems = report.validate_exercise_config(exercise, list(muscle_map["groups"]), list(cameras))
    results.append(checks.record("exercise_config", "configuration", "exercise.json has every required field and consistent phases",
                                 "PASS" if not problems else "FAIL", detail="; ".join(problems)))
    clip = checks.Clip(samples, exercise)
    results += checks.character_checks(samples, facts, profile, rig_test)
    results += checks.movement_checks(clip, profile)
    results += checks.equipment_checks(clip, profile, exercise, inventory, config.equipment_config())

    render_meta_path = exercise_path / "render_metadata.json"
    render_meta = config.load_json(render_meta_path) if render_meta_path.exists() else None
    brand = config.brand_config()
    preset = config.render_presets()["render_presets"][brand["render_preset"]]
    video_stats = sync = None
    if render_meta:
        video_stats, motion = {}, {}
        for key, out in render_meta["outputs"].items():
            path = exercise_path / out["file"]
            if path.exists():
                stats = video.frame_statistics(video.decode_gray(path))
                motion[key] = stats.pop("motion")
                video_stats[key] = stats
        fixed = [k for k in motion if "follow" not in cameras[k]]
        sync = {f"{a} vs {b}": video.sync_score(motion[a], motion[b]) for i, a in enumerate(fixed) for b in fixed[i + 1 :]}
    results += report.rendering_checks(exercise_path, exercise, inventory, render_meta, preset, video_stats, sync, profile)
    glb_path = exercise_path / "glb_report.json"
    results += report.export_checks(config.load_json(glb_path) if glb_path.exists() else None, exercise, inventory)
    results += report.approval_records(exercise)
    summary = report.summarize(results, exercise)

    qa = {
        "pipeline_version": PIPELINE_VERSION,
        "generated": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "exercise": exercise["exercise_name"],
        "exercise_id": exercise["exercise_id"],
        "character": exercise["master_character_id"],
        "motion_source": exercise["motion_source_id"],
        "motion_source_verification": UNVERIFIED_LABEL if exercise.get("motion_source_verification") != "VERIFIED" else "VERIFIED",
        "exercise_status": exercise["status"],
        "reviewer": exercise["reviewer"],
        "approval_date": exercise["approval_date"],
        "validation_profile": profile["profile_id"],
        "allowed_statuses": ["PASS", "FAIL", "NOT_TESTED", "REQUIRES_MANUAL_REVIEW", "UNVERIFIED"],
        "what_this_report_is": "Automated quality control of animation data, files and renders. It is not a biomechanical review. "
                               "Expert approval is recorded separately and is PENDING until a qualified person signs off.",
        "summary": summary,
        "checks": results,
    }
    config.save_json(exercise_path / exercise["validation_results"], qa)

    meta_path = exercise_path / "motion_metadata.json"
    if meta_path.exists():
        meta = config.load_json(meta_path)
        meta["phase_joint_positions"] = checks.joint_positions_by_phase(clip)
        meta["scene_inventory"] = inventory
        config.save_json(meta_path, meta)

    print(f"[evs] {summary['counts']}")
    print(f"[evs] technical QA: {summary['technical_qa']}; recommended status: {summary['recommended_exercise_status']}; "
          f"expert approval: {summary['expert_approval']}; publication: {summary['publication_status']}")
    for c in results:
        if c["status"] != "PASS":
            print(f"[evs]   {c['status']:22s} {c['category']:11s} {c['id']}: measured {json.dumps(c['measured'])[:150]} limit {json.dumps(c['limit'])[:90]}")


if __name__ == "__main__":
    main()
