"""Bakes config/fiber_map.json into per-group striation phase images for the
master character, in the character's UV space next to the muscle atlas.

    Blender -b --factory-startup --python pipeline/bake_fiber_fields.py

Run it again whenever fiber_map.json changes. The character mesh, the rig,
the muscle atlas and every animation stay untouched; exercises only need
their highlight map recomposed (build_scene.py does that, preferring the
phase atlas over the PCA fallback).

Method: the same surface sampling as bake_muscle_atlas.py. Every sample is
evaluated in its group's chart space (the muscle map's own coordinates, on
the rest pose mirrored onto the left side, with each group's own
angle/radius parameters), the striation phase comes from
evs/fiber_fields.py, and cos/sin of the phase are splatted per texel so the
stored fraction survives averaging and dilation across UV seams. The bake
also records each fan's angular span and the mean coherence (1 = every
sample in a texel agrees on the phase) in fiber_facts.json."""

from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from evs import config, fiber_fields, muscle_eval, muscles, pngio  # noqa: E402


def main() -> None:
    cfg = config.character_config()
    muscle_map = config.muscle_map()
    fiber_map = config.fiber_map()
    out_dir = config.character_dir(cfg["master_character_id"])
    atlas_dir = out_dir / "muscle_atlas"
    bpy.ops.wm.open_mainfile(filepath=str(config.character_blend(cfg["master_character_id"])))
    body = bpy.data.objects[cfg["names"]["body_object"]]
    rig = bpy.data.objects[cfg["names"]["armature_object"]]

    frames = muscle_eval.limb_frames(muscles.rest_joints(rig))
    problems = fiber_fields.validate_fiber_map(fiber_map, muscle_map, frames)
    if problems:
        raise ValueError("fibre field specs are invalid:\n- " + "\n- ".join(problems))

    res = int(muscle_map["atlas_resolution"])
    names = list(fiber_map["groups"].keys())
    specs = fiber_map["groups"]
    centres = {n: fiber_fields.spec_center_metric(specs[n], frames) if specs[n]["type"] == "fan" else None for n in names}
    cos_sum = {n: np.zeros((res, res), dtype=np.float32) for n in names}
    sin_sum = {n: np.zeros((res, res), dtype=np.float32) for n in names}
    counts = np.zeros((res, res), dtype=np.int32)

    t0 = time.time()
    samples = 0
    for points, _normals, _weights, col, row in muscles._surface_samples(body, res):
        mirrored = points.astype(np.float64)
        mirrored[:, 0] = np.abs(mirrored[:, 0])
        flat = row.astype(np.int64) * res + col.astype(np.int64)
        counts += np.bincount(flat, minlength=res * res).reshape(res, res).astype(np.int32)
        for n in names:
            spec = specs[n]
            coords = fiber_fields.chart_metric_coords(spec["chart"], mirrored, frames, spec)
            if spec["type"] == "fan":
                phase = fiber_fields.fan_phase(spec, coords, centres[n])
            else:
                phase = fiber_fields.parallel_phase(spec, coords)
            angle = 2.0 * np.pi * phase
            size = res * res
            cos_sum[n] += np.bincount(flat, weights=np.cos(angle), minlength=size).reshape(res, res).astype(np.float32)
            sin_sum[n] += np.bincount(flat, weights=np.sin(angle), minlength=size).reshape(res, res).astype(np.float32)
        samples += len(points)
    print(f"[evs] fibre fields sampled in {time.time() - t0:.1f}s: {samples} samples")

    valid = counts > 0
    masks_path = atlas_dir / "masks.npz"
    if not masks_path.exists():
        raise FileNotFoundError(f"{masks_path} is missing: run pipeline/bake_muscle_atlas.py first")
    masks = muscles.load_masks(atlas_dir)
    masks.pop("_side_left", None)
    packed = {}
    facts = {"fiber_map_id": fiber_map["fiber_map_id"], "atlas_resolution": res, "samples": int(samples),
             "uv_coverage": round(float(valid.mean()), 4), "groups": {}}
    for n in names:
        spec = specs[n]
        mean = np.zeros((res, res, 2), dtype=np.float32)
        mean[..., 0][valid] = cos_sum[n][valid] / counts[valid]
        mean[..., 1][valid] = sin_sum[n][valid] / counts[valid]
        coherence = float(np.linalg.norm(mean[valid], axis=1).mean()) if valid.any() else 0.0
        dilated = muscles._dilate(mean, valid, 6)
        frac = ((np.arctan2(dilated[..., 1], dilated[..., 0]) / (2.0 * np.pi)) % 1.0 * 255.0 + 0.5)
        # The phase only ever modulates texels the group's mask claims (the
        # highlight channel is 0 everywhere else), so zero the rest: the
        # atlas compresses like the mask atlas instead of 40 MB of stripes.
        packed[n] = np.where(masks[n] > 0, np.clip(frac, 0, 255).astype(np.uint8), 0).astype(np.uint8)
        entry = {"texels": int(valid.sum()), "coherence": round(coherence, 4), "label": spec.get("label", n)}
        if spec["type"] == "fan":
            span, nearest = fiber_fields.fan_span_check(spec, muscle_map["groups"][n], frames)
            entry["fan_span_deg"] = round(span, 1)
            entry["fan_centre_distance_m"] = round(nearest, 4)
        facts["groups"][n] = entry
        print(f"[evs]   {n:26s} coherence {coherence:.3f}" + (f", fan span {entry['fan_span_deg']} deg" if spec["type"] == "fan" else ""))

    np.savez_compressed(atlas_dir / "fiber_phase.npz", **packed)
    config.save_json(atlas_dir / "fiber_facts.json", facts)

    debug = np.zeros((res, res, 3), dtype=np.uint8)
    for channel, group in enumerate(("pectoralis_major", "deltoid_anterior", "triceps_brachii")):
        debug[..., channel] = packed[group]
    pngio.write_png(atlas_dir / "_fiber_phase_debug.png", np.flipud(debug)[::2, ::2])
    print(f"[evs] phase atlas: {atlas_dir / 'fiber_phase.npz'} (+ fiber_facts.json, _fiber_phase_debug.png)")


if __name__ == "__main__":
    main()
