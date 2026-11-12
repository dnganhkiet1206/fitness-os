"""Assembles an exercise scene from reusable parts: the saved master
character, brand materials, the exercise's muscle highlight map, equipment,
studio and cameras. Nothing here knows about a particular exercise."""

from __future__ import annotations

import math
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
    return mats


def apply_highlight(character_mats: dict, exercise: dict, exercise_path: Path, size: int = 2048) -> Path:
    """Composes the exercise's highlight map from the character's muscle
    atlas and plugs it into the body and apparel materials."""
    atlas = config.character_dir(exercise["master_character_id"]) / "muscle_atlas"
    out = exercise_path / "muscle_highlight_map.png"
    muscles.write_highlight_map(atlas, out, exercise["primary_muscles"], exercise["secondary_muscles"],
                                exercise.get("stabilizing_muscles", []), size=size)
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
        else:
            raise ValueError(f"no builder for equipment type {spec['type']}")
        if root is not None:
            root.location = Vector(item.get("location", (0, 0, 0)))
        result["spec"] = spec
        built[item["id"]] = result
    return built


def framing_box(exercise: dict) -> tuple[Vector, Vector]:
    f = exercise["framing"]
    return Vector(f["center"]), Vector(f["size"])


def _fit_distance(center: Vector, size: Vector, direction: Vector, lens: float, sensor: float, aspect: float, margin: float) -> float:
    """Smallest camera distance along ``direction`` at which the whole box is
    inside the frame."""
    forward = -direction.normalized()
    right = forward.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(forward)
    tan_h = (sensor * 0.5) / lens
    tan_v = tan_h / aspect
    corners = [center + Vector((sx * size.x, sy * size.y, sz * size.z)) * 0.5 for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    need = 0.0
    for c in corners:
        rel = c - center
        depth = rel.dot(forward)  # how far beyond the centre plane the corner is
        need = max(need, abs(rel.dot(right)) / tan_h - depth, abs(rel.dot(up)) / tan_v - depth)
    return need * margin


def build_cameras(scene: bpy.types.Scene, exercise: dict, follow_targets: dict | None = None) -> dict:
    presets = config.camera_presets()
    center, size = framing_box(exercise)
    aspect = scene.render.resolution_x / scene.render.resolution_y
    sensor = presets["sensor_width_mm"]
    cameras = {}
    for key in exercise["camera_presets"]:
        p = presets["presets"][key]
        az, el = math.radians(p["azimuth_deg"]), math.radians(p["elevation_deg"])
        direction = Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))
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
            distance = _fit_distance(center, size, direction, p["focal_length_mm"], sensor, aspect, p["margin"])
            cam = studio.add_camera(name, center, p["azimuth_deg"], p["elevation_deg"], distance, p["focal_length_mm"])
        cam.data.sensor_width = sensor
        cam["evs_preset"] = key
        cam["evs_file_suffix"] = p["file_suffix"]
        cameras[key] = cam
    return cameras


def build_studio(scene: bpy.types.Scene, exercise: dict, brand: dict) -> None:
    presets = config.render_presets()
    studio.apply_render_preset(scene, presets["render_presets"][brand["render_preset"]])
    lighting = presets["lighting_presets"][brand["lighting_preset"]]
    studio.build_world(scene, brand, lighting)
    studio.build_floor(brand, lighting)
    center, _size = framing_box(exercise)
    studio.build_light_rig(lighting, center)
    scene["evs_light_focus"] = list(center)


def set_timeline(scene: bpy.types.Scene, exercise: dict) -> int:
    fps = int(exercise["frame_rate"])
    scene.render.fps = fps
    scene.render.fps_base = 1.0
    end = max(p["end_s"] for p in exercise["exercise_phases"])
    scene.frame_start = 0
    scene.frame_end = int(round(end * fps))
    scene.frame_set(0)
    return scene.frame_end
