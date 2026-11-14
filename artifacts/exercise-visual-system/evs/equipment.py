"""Parametric gym equipment built from config/equipment.json.

Conventions: metres; a barbell's axis is its local X and its origin is the
middle of the shaft; a bench's long axis is local Y, the head end is +Y, the
origin is on the floor under the middle of the pad."""

from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from . import bl_util

EQUIPMENT_COLLECTION = "EQUIPMENT"


def _object(name: str, bm: bmesh.types.BMesh, smooth_angle: float | None = 40.0) -> bpy.types.Object:
    old = bpy.data.objects.get(name)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bl_util.get_collection(EQUIPMENT_COLLECTION).objects.link(obj)
    if smooth_angle is not None:
        bl_util.set_smooth(mesh)
        mod = obj.modifiers.new("Edge Split", "EDGE_SPLIT")
        mod.split_angle = math.radians(smooth_angle)
    return obj


def _material_index(obj: bpy.types.Object, mat: bpy.types.Material) -> int:
    for i, m in enumerate(obj.data.materials):
        if m == mat:
            return i
    obj.data.materials.append(mat)
    return len(obj.data.materials) - 1


def _cylinder_x(bm: bmesh.types.BMesh, x0: float, x1: float, radius: float, segments: int = 48, material: int = 0,
                bevel: float = 0.0) -> None:
    """Closed cylinder along X between x0 and x1."""
    geom = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius, radius2=radius,
                                 depth=abs(x1 - x0), matrix=Matrix.Translation(((x0 + x1) * 0.5, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    faces = {f for v in geom["verts"] for f in v.link_faces}
    for f in faces:
        f.material_index = material
    if bevel > 0:
        edges = [e for e in {e for v in geom["verts"] for e in v.link_edges}
                 if len(e.link_faces) == 2 and any(len(f.verts) > 4 for f in e.link_faces)]
        result = bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=3, affect="EDGES", profile=0.5)
        for f in result["faces"]:
            f.material_index = material


def _box(bm: bmesh.types.BMesh, center, size, material: int = 0, bevel: float = 0.0) -> None:
    geom = bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(center) @ Matrix.Diagonal((size[0], size[1], size[2], 1.0)))
    faces = {f for v in geom["verts"] for f in v.link_faces}
    for f in faces:
        f.material_index = material
    if bevel > 0:
        edges = list({e for v in geom["verts"] for e in v.link_edges})
        result = bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=4, affect="EDGES", profile=0.5)
        for f in result["faces"]:
            f.material_index = material


def build_barbell(name: str, spec: dict, mats: dict) -> bpy.types.Object:
    """Shaft with knurled zones and grip marks, collars and sleeves."""
    obj = _object(name, bmesh.new())
    metal = _material_index(obj, mats["metal"])
    knurl = _material_index(obj, mats["knurl"])
    bm = bmesh.new()
    r = spec["shaft_diameter"] * 0.5
    inner = spec["inside_collar_distance"] * 0.5
    half = spec["total_length"] * 0.5
    mark = spec["grip_mark_distance"] * 0.5
    mw = spec["grip_mark_width"] * 0.5
    ck = spec["center_knurl_half_length"]
    ks = spec["knurl_start"]
    # Shaft pieces from the centre outwards, mirrored. Knurled pieces are a
    # hair thicker so the two finishes do not z-fight where they meet.
    pieces = [(0.0, ck, knurl), (ck, ks, metal), (ks, mark - mw, knurl), (mark - mw, mark + mw, metal),
              (mark + mw, inner - 0.04, knurl), (inner - 0.04, inner, metal)]
    for a, b, mat in pieces:
        for sign in (1, -1):
            if a == 0.0 and sign == -1:
                _cylinder_x(bm, -b, 0.0, r, material=mat)
            else:
                _cylinder_x(bm, sign * a, sign * b, r, material=mat)
    cw = spec["collar_width"]
    for sign in (1, -1):
        _cylinder_x(bm, sign * inner, sign * (inner + cw), spec["collar_diameter"] * 0.5, material=metal, bevel=0.004)
        _cylinder_x(bm, sign * (inner + cw), sign * half, spec["sleeve_diameter"] * 0.5, material=metal, bevel=0.003)
    bm.to_mesh(obj.data)
    bm.free()
    bl_util.set_smooth(obj.data)
    obj["evs_equipment"] = "barbell"
    obj["evs_shaft_radius"] = r
    obj["evs_sleeve_start"] = inner + cw
    return obj


def build_plate(name: str, spec: dict, mats: dict, collar: dict | None = None) -> bpy.types.Object:
    """One plate (axis X, centred on its own origin) with an accent ring and,
    optionally, a collar on its outer (+X) side."""
    obj = _object(name, bmesh.new())
    rubber = _material_index(obj, mats["plate"])
    accent = _material_index(obj, mats["plate_accent"])
    metal = _material_index(obj, mats["metal"])
    bm = bmesh.new()
    t = spec["thickness"] * 0.5
    radius = spec["diameter"] * 0.5
    _cylinder_x(bm, -t, t, radius, segments=96, material=rubber, bevel=0.007)
    # Raised lip and accent ring on both faces, steel hub in the middle.
    for sign in (1, -1):
        _ring_x(bm, sign * t, sign * (t + 0.0015), radius * 0.80, radius * 0.86, accent)
        _cylinder_x(bm, sign * t, sign * (t + 0.004), spec["hub_diameter"] * 0.5, segments=64, material=metal, bevel=0.0015)
    if collar:
        _cylinder_x(bm, t + 0.004, t + 0.004 + collar["width"], collar["diameter"] * 0.5, segments=48, material=metal, bevel=0.004)
    bm.to_mesh(obj.data)
    bm.free()
    bl_util.set_smooth(obj.data)
    obj["evs_equipment"] = "plate"
    return obj


def _ring_x(bm: bmesh.types.BMesh, x0: float, x1: float, r_in: float, r_out: float, material: int, segments: int = 96) -> None:
    """Flat annulus between two radii, extruded from x0 to x1."""
    rings = []
    for x in (x0, x1):
        for r in (r_in, r_out):
            rings.append([bm.verts.new((x, r * math.cos(2 * math.pi * i / segments), r * math.sin(2 * math.pi * i / segments))) for i in range(segments)])
    in0, out0, in1, out1 = rings
    for i in range(segments):
        j = (i + 1) % segments
        for quad in ((in1[i], out1[i], out1[j], in1[j]), (out0[i], out1[i], out1[j], out0[j]), (in0[i], in1[i], in1[j], in0[j])):
            f = bm.faces.new(quad)
            f.material_index = material
    bmesh.ops.recalc_face_normals(bm, faces=list({f for v in in0 + out0 + in1 + out1 for f in v.link_faces}))


def build_bench_rack(name: str, spec: dict, mats: dict, rack_height: float) -> dict:
    """Flat bench with two uprights and bar rests. ``rack_height`` is the
    height of the bar's centre when it lies in the rests.

    Returns the objects and the point where the racked bar's centre sits."""
    pad_len, pad_w, pad_t = spec["pad_length"], spec["pad_width"], spec["pad_thickness"]
    top = spec["pad_top_height"]
    tube = spec["frame_tube"]

    pad = _object(f"{name}_Pad", bmesh.new(), smooth_angle=None)
    bm = bmesh.new()
    _box(bm, (0, 0, top - pad_t * 0.5), (pad_w, pad_len, pad_t), _material_index(pad, mats["pad"]), bevel=0.018)
    bm.to_mesh(pad.data)
    bm.free()
    bl_util.set_smooth(pad.data)

    frame = _object(f"{name}_Frame", bmesh.new(), smooth_angle=None)
    fm = _material_index(frame, mats["frame"])
    metal = _material_index(frame, mats["metal"])
    bm = bmesh.new()
    under = top - pad_t
    head_y = pad_len * 0.5
    foot_y = -pad_len * 0.5
    upright_y = head_y - spec["upright_from_head_end"]
    half_spacing = spec["upright_spacing"] * 0.5
    b = 0.006
    # Spine under the pad, a post and a floor bar at the foot end.
    _box(bm, (0, (foot_y + 0.12 + upright_y) * 0.5, under - tube * 0.5), (tube, upright_y - foot_y - 0.12, tube), fm, bevel=b)
    _box(bm, (0, foot_y + 0.15, (under - tube) * 0.5), (tube, tube, under - tube), fm, bevel=b)
    _box(bm, (0, foot_y + 0.15, tube * 0.5), (spec["foot_width"], tube, tube), fm, bevel=b)
    # Head end: a cross member under the pad out to the uprights, the
    # uprights, and floor runners.
    _box(bm, (0, upright_y, under - tube * 0.5), (spec["upright_spacing"] + tube, tube, tube), fm, bevel=b)
    for sign in (1, -1):
        x = sign * half_spacing
        _box(bm, (x, upright_y, spec["upright_height"] * 0.5), (tube, tube, spec["upright_height"]), fm, bevel=b)
        _box(bm, (x, upright_y - spec["rack_base_length"] * 0.5 + tube * 0.5 + 0.12, tube * 0.5), (tube, spec["rack_base_length"], tube), fm, bevel=b)
    _box(bm, (0, upright_y + 0.12, tube * 0.5), (spec["upright_spacing"] + tube, tube, tube), fm, bevel=b)
    # Bar rests: a seat in front of each upright (towards the lifter's feet)
    # with a lip that keeps the bar from rolling off.
    reach, lip = spec["hook_reach"], spec["hook_lip"]
    bar_r = 0.0145
    seat_z = rack_height - bar_r
    for sign in (1, -1):
        x = sign * half_spacing
        y0 = upright_y - tube * 0.5
        _box(bm, (x, y0 - (reach + 0.03) * 0.5, seat_z - 0.012), (tube * 0.8, reach + 0.03, 0.024), metal, bevel=0.003)
        _box(bm, (x, y0 - reach - 0.03 + 0.006, seat_z + lip * 0.5 - 0.004), (tube * 0.8, 0.012, lip + 0.016), metal, bevel=0.003)
    bm.to_mesh(frame.data)
    bm.free()
    bl_util.set_smooth(frame.data)
    for obj in (pad, frame):
        mod = obj.modifiers.new("Edge Split", "EDGE_SPLIT")
        mod.split_angle = math.radians(50)
        obj["evs_equipment"] = "bench_rack"
    racked = Vector((0.0, upright_y - tube * 0.5 - reach * 0.5, rack_height))
    return {"pad": pad, "frame": frame, "racked_bar_center": racked, "pad_top": top,
            "pad_half_width": pad_w * 0.5, "head_end_y": head_y, "foot_end_y": foot_y,
            "lip_top": seat_z + lip + 0.004, "upright_y": upright_y, "upright_half_spacing": half_spacing}


def build_dumbbell(name: str, spec: dict, mats: dict) -> bpy.types.Object:
    """Hex dumbbell along X: knurled handle between two hexagonal heads.
    The object origin is the centre of the handle, so a hand socket at the
    origin holds it the way a barbell socket holds a bar."""
    obj = _object(name, bmesh.new())
    metal = _material_index(obj, mats["metal"])
    knurl = _material_index(obj, mats["knurl"])
    pad = _material_index(obj, mats.get("pad", mats["metal"]))
    bm = bmesh.new()
    half = spec["handle_length"] * 0.5
    r = spec["handle_diameter"] * 0.5
    _cylinder_x(bm, -half, half, r, material=knurl)
    head_r = spec["head_across_corners"] * 0.5
    for sign in (1, -1):
        _cylinder_x(bm, sign * half, sign * (half + spec["head_length"]), head_r, segments=6, material=pad, bevel=0.004)
        _cylinder_x(bm, sign * (half - 0.004), sign * half, r * 1.6, material=metal)
    bm.to_mesh(obj.data)
    bm.free()
    bl_util.set_smooth(obj.data)
    obj["evs_equipment"] = "dumbbell"
    obj["evs_shaft_radius"] = r
    obj["evs_total_mass_kg"] = spec["mass_kg"]
    return obj


def load_barbell(name: str, bar_spec: dict, plate_spec: dict, collar_spec: dict, plates_per_side: int, mats: dict) -> dict:
    """A barbell with plates and collars parented to it, so the whole thing
    moves, tilts and exports as one rigid unit."""
    bar = build_barbell(name, bar_spec, mats)
    x = bar["evs_sleeve_start"] + 0.002
    t = plate_spec["thickness"] + 0.008
    children = []
    for side, sign in (("L", 1), ("R", -1)):
        for i in range(plates_per_side):
            last = i == plates_per_side - 1
            plate = build_plate(f"{name}_Plate_{side}{i + 1}", plate_spec, mats, collar_spec if last else None)
            plate.parent = bar
            plate.location = (sign * (x + plate_spec["thickness"] * 0.5 + i * t), 0, 0)
            if sign < 0:
                plate.rotation_euler = (0, 0, math.pi)
            children.append(plate)
    total = bar_spec["mass_kg"] + 2 * plates_per_side * plate_spec["mass_kg"]
    bar["evs_total_mass_kg"] = total
    return {"bar": bar, "plates": children, "total_mass_kg": total}
