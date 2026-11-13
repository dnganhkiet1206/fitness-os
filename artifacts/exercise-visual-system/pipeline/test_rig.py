"""Rig test: puts the master character through joint ranges the exercises
need, measures how the skin behaves and renders every pose for a human to
look at.

    Blender -b --factory-startup --python pipeline/test_rig.py

Writes, under characters/<master_character_id>/:
    rig_test.json                 numbers per pose (stretch, volume, self-intersection)
    rig_deformation_test.png      one tile per pose

The numbers catch gross failures (collapsing joints, skin passing through
skin). Whether a shoulder LOOKS right still needs eyes: the report marks that
part REQUIRES_MANUAL_REVIEW."""

from __future__ import annotations

import math
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Quaternion, Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

from evs import FAIL, PASS, REQUIRES_MANUAL_REVIEW, bl_util, config, equipment, materials, studio  # noqa: E402
from evs import rig as evs_rig  # noqa: E402

LIMITS = {"max_p999_edge_stretch": 2.6, "max_volume_change": 0.08, "skin_contact_review_above": 40}


def aim(rig, bone: str, target: Vector) -> None:
    """Rotates a bone (FK) so it points along ``target`` (armature space),
    by the shortest rotation from where its parent currently puts it."""
    bpy.context.view_layer.update()
    pb = rig.pose.bones[bone]
    current = (pb.tail - pb.head).normalized()
    swing = current.rotation_difference(Vector(target).normalized())
    m = pb.matrix.copy()
    head = pb.head.copy()
    pb.matrix = Matrix.Translation(head) @ swing.to_matrix().to_4x4() @ Matrix.Translation(-head) @ m
    bpy.context.view_layer.update()


def bend(rig, bone: str, axis: Vector, degrees: float) -> None:
    """Rotates a bone about an armature-space axis through its head."""
    bpy.context.view_layer.update()
    pb = rig.pose.bones[bone]
    head = pb.head.copy()
    pb.matrix = Matrix.Translation(head) @ Quaternion(Vector(axis).normalized(), math.radians(degrees)).to_matrix().to_4x4() @ Matrix.Translation(-head) @ pb.matrix
    bpy.context.view_layer.update()


def reset(rig) -> None:
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
        if pb.rotation_mode == "QUATERNION":
            pb.rotation_quaternion = (1, 0, 0, 0)
        elif pb.rotation_mode == "AXIS_ANGLE":
            pb.rotation_axis_angle[0] = 0.0
        else:
            pb.rotation_euler = (0, 0, 0)
    for side in ("l", "r"):
        rig[f"grip_{side}"] = 0.0
        for limb in ("arm", "leg"):
            rig[f"ik_{limb}_{side}"] = 0.0  # FK: the deform bones are posed directly
    rig.update_tag()
    bpy.context.view_layer.update()


def hinge(rig, upper: str, lower: str) -> Vector:
    u = rig.pose.bones[upper]
    lo = rig.pose.bones[lower]
    return (u.tail - u.head).cross(lo.tail - lo.head).normalized()


def poses(rig) -> dict:
    def arms(direction_l: Vector, elbow_deg: float = 0.0, wrist_deg: float = 0.0) -> None:
        for side, sign in (("l", 1.0), ("r", -1.0)):
            d = Vector((direction_l.x * sign, direction_l.y, direction_l.z))
            axis = hinge(rig, f"upperarm_{side}", f"lowerarm_{side}")
            aim(rig, f"upperarm_{side}", d)
            if elbow_deg:
                # hinge axis moved with the upper arm
                axis = hinge(rig, f"upperarm_{side}", f"lowerarm_{side}")
                bend(rig, f"lowerarm_{side}", axis, elbow_deg)
            if wrist_deg:
                frame_axis = rig.pose.bones[f"hand_{side}"].matrix.to_3x3() @ (rig.data.bones[f"hand_{side}"].matrix_local.to_3x3().inverted() @ evs_rig.palm_frame(rig, side)["across"])
                bend(rig, f"hand_{side}", frame_axis, wrist_deg * sign)

    def legs(thigh: Vector, knee_deg: float) -> None:
        for side, sign in (("l", 1.0), ("r", -1.0)):
            aim(rig, f"thigh_{side}", Vector((thigh.x * sign, thigh.y, thigh.z)))
            bend(rig, f"calf_{side}", Vector((1, 0, 0)), knee_deg)

    def grip() -> None:
        for side in ("l", "r"):
            rig[f"grip_{side}"] = 1.0
        rig.update_tag()

    return {
        "rest": (lambda: None, 20, 4, "full"),
        "arms_forward_90": (lambda: arms(Vector((0.22, -1, 0))), 60, 8, "upper"),
        "arms_out_90": (lambda: arms(Vector((1, 0, 0))), 20, 8, "upper"),
        "arms_overhead_160": (lambda: arms(Vector((0.25, -0.1, 1))), 30, 6, "upper_tall"),
        "elbows_flexed_130": (lambda: arms(Vector((0.35, -0.05, -1)), elbow_deg=130), 60, 6, "upper"),
        "wrists_bent_60": (lambda: arms(Vector((0.3, -0.9, -0.2)), wrist_deg=60), 80, 10, "upper"),
        "hips_90_knees_90": (lambda: legs(Vector((0.12, -1, 0.02)), 90), 70, 6, "full"),
        "deep_squat_like": (lambda: legs(Vector((0.3, -0.9, 0.45)), 135), 70, 6, "full"),
        "grip_closed": (grip, 35, 20, "hand"),
    }


def body_stats(body, rest_edges: np.ndarray, rest_lengths: np.ndarray) -> dict:
    """Stretch, volume and self-intersection of the deformed base mesh."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    mesh = ev.to_mesh()
    co = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    lengths = np.linalg.norm(co[rest_edges[:, 0]] - co[rest_edges[:, 1]], axis=1)
    ratio = lengths / rest_lengths
    bm = bmesh.new()
    bm.from_mesh(mesh)
    volume = bm.calc_volume(signed=True)
    tree = BVHTree.FromBMesh(bm)
    pairs = tree.overlap(tree)
    bm.faces.ensure_lookup_table()
    crossing = 0
    for a, b in pairs:
        if a < b and not set(v.index for v in bm.faces[a].verts) & set(v.index for v in bm.faces[b].verts):
            crossing += 1
    bm.free()
    ev.to_mesh_clear()
    return {"max_edge_stretch": round(float(ratio.max()), 3), "p999_edge_stretch": round(float(np.percentile(ratio, 99.9)), 3),
            "min_edge_ratio": round(float(ratio.min()), 3), "volume_m3": round(float(volume), 5), "self_intersecting_face_pairs": int(crossing)}


def main() -> None:
    cfg = config.character_config()
    brand = config.brand_config()
    out_dir = config.character_dir(cfg["master_character_id"])
    bpy.ops.wm.open_mainfile(filepath=str(config.character_blend(cfg["master_character_id"])))
    scene = bpy.context.scene
    names = cfg["names"]
    rig = bpy.data.objects[names["armature_object"]]
    body = bpy.data.objects[names["body_object"]]
    for mod in body.modifiers:
        if mod.type == "SUBSURF":
            mod.show_viewport = False  # measure the base mesh; render still subdivides

    presets = config.render_presets()
    preset = dict(presets["render_presets"][brand["render_preset"]])
    preset["resolution"] = [560, 640]
    preset["taa_render_samples"] = 32
    lighting = presets["lighting_presets"][brand["lighting_preset"]]
    studio.apply_render_preset(scene, preset)
    studio.build_world(scene, brand, lighting)
    studio.build_floor(brand, lighting)
    studio.build_light_rig(lighting, Vector((0, 0, 0.9)))
    studio.calibrate_floor(scene)

    # A bar in the left palm for the grip pose, placed exactly as an exercise would.
    spec = config.equipment_config()["barbell_olympic_20kg"]
    bar = equipment.build_barbell("TestBar", spec, materials.equipment_materials(brand))
    centre, x, _radius = evs_rig.grip_bar(rig, "l", cfg["grip"])
    z = evs_rig.palm_frame(rig, "l")["normal"]
    z = (z - x * z.dot(x)).normalized()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = centre
    bar.matrix_world = rig.matrix_world @ m
    bar.scale = (0.12, 1, 1)
    bar.hide_render = True

    reset(rig)
    mesh = body.data
    edges = np.array([e.vertices[:] for e in mesh.edges])
    rest_co = bl_util.mesh_coords(mesh)
    rest_len = np.linalg.norm(rest_co[edges[:, 0]] - rest_co[edges[:, 1]], axis=1)
    rest = body_stats(body, edges, rest_len)

    views = {
        "full": (Vector((0, 0, 0.93)), 7.4, 85.0),
        "upper": (Vector((0, -0.05, 1.3)), 7.4, 150.0),
        "upper_tall": (Vector((0, -0.05, 1.5)), 7.4, 110.0),
        "hand": (Vector(rig.matrix_world @ centre), 7.4, 900.0),
    }
    report = {"master_character_id": cfg["master_character_id"], "limits": LIMITS, "rest": rest, "poses": {}}
    tiles = []
    for name, (apply, azimuth, elevation, view) in poses(rig).items():
        reset(rig)
        apply()
        bpy.context.view_layer.update()
        stats = body_stats(body, edges, rest_len)
        stats["volume_change"] = round(stats["volume_m3"] / rest["volume_m3"] - 1.0, 4)
        stats["new_self_intersections"] = stats["self_intersecting_face_pairs"] - rest["self_intersecting_face_pairs"]
        checks = {
            "edge_stretch": PASS if stats["p999_edge_stretch"] <= LIMITS["max_p999_edge_stretch"] else FAIL,
            "volume": PASS if abs(stats["volume_change"]) <= LIMITS["max_volume_change"] else FAIL,
            # Skin folding onto skin at a bent joint or inside a fist is normal
            # contact, so a high count is a prompt to look, not a failure.
            "skin_contact": PASS if stats["new_self_intersections"] <= LIMITS["skin_contact_review_above"] else REQUIRES_MANUAL_REVIEW,
        }
        stats["checks"] = checks
        stats["status"] = FAIL if FAIL in checks.values() else (REQUIRES_MANUAL_REVIEW if REQUIRES_MANUAL_REVIEW in checks.values() else PASS)
        report["poses"][name] = stats
        bar.hide_render = name != "grip_closed"
        focus, distance, lens = views[view]
        cam = studio.add_camera("EVS_RigTest", focus, azimuth, elevation, distance, focal_length=lens)
        path = str(out_dir / f"_rig_{name}.png")
        studio.render_still(scene, cam, path, focus)
        tiles.append(path)
        print(f"[evs] {name:20s} {stats}")
    report["visual_review"] = {"status": REQUIRES_MANUAL_REVIEW, "image": "rig_deformation_test.png",
                               "note": "Numbers catch collapse and self-penetration. Whether shoulders, elbows, hips, knees and wrists look anatomically right must be judged by a person."}
    report["tile_order"] = list(report["poses"].keys())
    config.save_json(out_dir / "rig_test.json", report)

    cols = 5
    args, n = [], len(tiles)
    for t in tiles:
        args += ["-i", t]
    layout = "|".join(f"{(i % cols) * 560}_{(i // cols) * 640}" for i in range(n))
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args, "-filter_complex", f"xstack=inputs={n}:layout={layout}:fill=white[out]", "-map", "[out]",
                    "-frames:v", "1", str(out_dir / "rig_deformation_test.png")], check=True)
    for t in tiles:
        os.remove(t)
    print(f"[evs] wrote {out_dir / 'rig_test.json'} and rig_deformation_test.png")


if __name__ == "__main__":
    main()
