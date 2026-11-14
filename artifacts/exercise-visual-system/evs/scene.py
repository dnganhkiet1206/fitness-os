"""Assembles an exercise scene from reusable parts: the saved master
character, brand materials, the exercise's muscle highlight map, equipment,
studio and cameras. Nothing here knows about a particular exercise."""

from __future__ import annotations

from pathlib import Path

import bpy
from mathutils import Vector

from . import bl_util, config, equipment, materials, muscles, studio

CAMERA_PREFIX = "CAM_"


def append_character(character_id: str) -> dict:
    """Appends the master character collection. The mesh, skeleton and skin
    weights come from the saved file, never from a rebuild, which is what
    keeps the character identical across exercises."""
    cfg = config.character_config()
    if cfg["master_character_id"] != character_id:
        raise ValueError(f"exercise wants {character_id}, config/master_character.json describes {cfg['master_character_id']}")
    blend = config.character_blend(character_id)
    if not blend.exists():
        raise FileNotFoundError(f"{blend} is missing: run pipeline/build_character.py first")
    name = cfg["names"]["collection"]
    with bpy.data.libraries.load(str(blend), link=False) as (src, dst):
        if name not in src.collections:
            raise RuntimeError(f"{blend} has no collection {name}")
        dst.collections = [name]
    coll = dst.collections[0]
    bpy.context.scene.collection.children.link(coll)
    objs = {o.name: o for o in coll.objects}
    return {
        "collection": coll,
        "body": objs[cfg["names"]["body_object"]],
        "shorts": objs[cfg["names"]["shorts_object"]],
        "rig": objs[cfg["names"]["armature_object"]],
        "config": cfg,
    }


def apply_brand_materials(character: dict, brand: dict) -> dict:
    mats = materials.character_materials(brand)
    for obj, key in ((character["body"], "body"), (character["shorts"], "apparel")):
        obj.data.materials.clear()
        obj.data.materials.append(mats[key])
    sculpt = config.character_dir(character["config"]["master_character_id"]) / "muscle_atlas" / "sculpt_normal.png"
    if sculpt.exists():
        materials.add_body_normal(mats["body"], sculpt)
    return mats


def apply_highlight(character_mats: dict, exercise: dict, exercise_path: Path, size: int = 2048) -> Path:
    """Composes the exercise's highlight map from the character's muscle
    atlas and plugs it into the body and apparel materials. Exercises with
    ``fiber_highlight`` get fibre striations drawn into the map (Lyfta-style
    lit fibres instead of a flat tint); the atlas regions are untouched."""
    atlas = config.character_dir(exercise["master_character_id"]) / "muscle_atlas"
    out = exercise_path / "muscle_highlight_map.png"
    roles = exercise.get("highlight_roles", ["primary", "secondary", "stabilizing"])
    muscles.write_highlight_map(atlas, out,
                                exercise["primary_muscles"] if "primary" in roles else [],
                                exercise["secondary_muscles"] if "secondary" in roles else [],
                                exercise.get("stabilizing_muscles", []) if "stabilizing" in roles else [], size=size,
                                fibers=bool(exercise.get("fiber_highlight", False)))
    old = bpy.data.images.get("EVS_HighlightMap")
    if old is not None:
        bpy.data.images.remove(old)
    image = bpy.data.images.load(str(out))
    image.name = "EVS_HighlightMap"
    image.pack()
    for mat in character_mats.values():
        materials.set_highlight_image(mat, image)
    return out


def build_equipment(exercise: dict, brand: dict) -> dict:
    """Creates every item in exercise['equipment'] at its listed placement."""
    specs = config.equipment_config()
    mats = materials.equipment_materials(brand)
    built = {}
    for item in exercise["equipment"]:
        spec = specs[item["spec"]]
        if spec["type"] == "barbell":
            result = equipment.load_barbell(item["id"].capitalize(), spec, specs[item["plate_spec"]], specs[item["collar_spec"]],
                                            int(item["plates_per_side"]), mats)
            root = result["bar"]
        elif spec["type"] == "bench_rack":
            result = equipment.build_bench_rack(item["id"].capitalize(), spec, mats, rack_height=float(item["rack_height"]))
            root = None
            for key in ("pad", "frame"):
                result[key].location = Vector(item.get("location", (0, 0, 0)))
        elif spec["type"] == "dumbbell":
            root = equipment.build_dumbbell(item["id"].capitalize(), spec, mats)
            result = {"bar": root}
        else:
            raise ValueError(f"no builder for equipment type {spec['type']}")
        if root is not None:
            root.location = Vector(item.get("location", (0, 0, 0)))
        result["spec"] = spec
        built[item["id"]] = result
    return built


def build_cameras(scene: bpy.types.Scene, exercise: dict, points, follow_targets: dict | None = None) -> dict:
    """One camera per preset in exercise['camera_presets'].

    ``points`` is an (N, 3) array of world positions covering everything that
    must stay in frame during the clip; framing cameras are placed so those
    points fill the frame. ``follow_targets`` maps a preset's 'follow' name to
    (object to ride along with, world point to look at)."""
    presets = config.camera_presets()
    aspect = scene.render.resolution_x / scene.render.resolution_y
    sensor = presets["sensor_width_mm"]
    cameras = {}
    for key in exercise["camera_presets"]:
        p = presets["presets"][key]
        name = CAMERA_PREFIX + key
        if "follow" in p:
            target = (follow_targets or {}).get(p["follow"])
            if target is None:
                continue
            parent, point = target
            distance = (p["frame_width_m"] * 0.5) / ((sensor * 0.5) / p["focal_length_mm"])
            cam = studio.add_camera(name, Vector(point), p["azimuth_deg"], p["elevation_deg"], distance, p["focal_length_mm"])
            # Rides along with the object it follows: a fixed offset, no keys
            # of its own, so it shows the same motion as every other camera.
            bpy.context.view_layer.update()
            cam.parent = parent
            cam.matrix_parent_inverse = parent.matrix_world.inverted()
            cam["evs_follow"] = p["follow"]
        else:
            focus, distance = studio.fit_view(points, p["azimuth_deg"], p["elevation_deg"], p["focal_length_mm"], sensor, aspect, p["margin"])
            cam = studio.add_camera(name, focus, p["azimuth_deg"], p["elevation_deg"], distance, p["focal_length_mm"])
        cam.data.sensor_width = sensor
        cam["evs_preset"] = key
        cam["evs_file_suffix"] = p["file_suffix"]
        cameras[key] = cam
    return cameras


def build_studio(scene: bpy.types.Scene, exercise: dict, brand: dict) -> dict:
    presets = config.render_presets()
    studio.apply_render_preset(scene, presets["render_presets"][brand["render_preset"]])
    lighting = presets["lighting_presets"][brand["lighting_preset"]]
    studio.build_world(scene, brand, lighting)
    studio.build_floor(brand, lighting)
    focus = Vector((0.0, 0.0, 0.8))
    studio.build_light_rig(lighting, focus)
    scene["evs_light_focus"] = list(focus)
    return studio.calibrate_floor(scene)


def set_timeline(scene: bpy.types.Scene, exercise: dict) -> int:
    fps = int(exercise["frame_rate"])
    scene.render.fps = fps
    scene.render.fps_base = 1.0
    # Motion Lab specs get their phases from the generator (tempo); until then
    # the scene only needs some length.
    end = max((p["end_s"] for p in exercise["exercise_phases"]), default=float(exercise.get("animation_duration") or 10.0))
    scene.frame_start = 0
    scene.frame_end = int(round(end * fps))
    scene.frame_set(0)
    return scene.frame_end
