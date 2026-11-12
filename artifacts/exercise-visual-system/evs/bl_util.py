"""Small Blender helpers shared by the pipeline modules (needs bpy)."""

from __future__ import annotations

import argparse
import sys

import bpy
import numpy as np
from mathutils import Vector

MPFB_MODULE = "bl_ext.blender_org.mpfb"


def script_args(parser: argparse.ArgumentParser) -> argparse.Namespace:
    """Arguments after ``--`` on the Blender command line."""
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def enable_mpfb() -> None:
    """Register MPFB for this session only. With --factory-startup the user's
    saved preferences are neither read nor written."""
    import addon_utils

    loaded = addon_utils.check(MPFB_MODULE)[1]
    if not loaded:
        addon_utils.enable(MPFB_MODULE, default_set=True, persistent=True)
    if not addon_utils.check(MPFB_MODULE)[1]:
        raise RuntimeError(
            "MPFB is not installed. Install it once with: "
            "Blender --online-mode --command extension install mpfb --sync --no-prefs"
        )


def reset_scene() -> bpy.types.Scene:
    """Empty file with metric units; nothing from the user's startup file."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    return scene


def ensure_object_mode() -> None:
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def select_only(obj: bpy.types.Object) -> None:
    ensure_object_mode()
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def look_at(obj: bpy.types.Object, target, up: str = "Y") -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", up).to_euler()


def get_collection(name: str, parent: bpy.types.Collection | None = None) -> bpy.types.Collection:
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(coll)
    return coll


def move_to_collection(obj: bpy.types.Object, coll: bpy.types.Collection) -> None:
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


def mesh_coords(mesh: bpy.types.Mesh) -> np.ndarray:
    co = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
    mesh.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)


def set_mesh_coords(mesh: bpy.types.Mesh, co: np.ndarray) -> None:
    mesh.vertices.foreach_set("co", np.ascontiguousarray(co, dtype=np.float64).ravel())
    mesh.update()


def mesh_normals(mesh: bpy.types.Mesh) -> np.ndarray:
    no = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
    mesh.vertices.foreach_get("normal", no)
    return no.reshape(-1, 3)


def shape_key_mix(mesh: bpy.types.Mesh) -> np.ndarray:
    """Vertex coordinates with every shape key applied at its current value."""
    keys = mesh.shape_keys
    if keys is None:
        return mesh_coords(mesh)
    n = len(mesh.vertices)
    basis = np.empty(n * 3, dtype=np.float64)
    keys.key_blocks[0].data.foreach_get("co", basis)
    basis = basis.reshape(-1, 3)
    out = basis.copy()
    buf = np.empty(n * 3, dtype=np.float64)
    for kb in keys.key_blocks[1:]:
        kb.data.foreach_get("co", buf)
        out += (buf.reshape(-1, 3) - basis) * kb.value
    return out


def group_members(obj: bpy.types.Object, group_name: str, min_weight: float = 0.0) -> np.ndarray:
    """Boolean mask of the vertices that belong to a vertex group."""
    mask = np.zeros(len(obj.data.vertices), dtype=bool)
    group = obj.vertex_groups.get(group_name)
    if group is None:
        return mask
    gi = group.index
    for v in obj.data.vertices:
        for g in v.groups:
            if g.group == gi and g.weight > min_weight:
                mask[v.index] = True
                break
    return mask


def group_weights(obj: bpy.types.Object, names: list[str]) -> np.ndarray:
    """Dense (n_vertices, len(names)) array of vertex-group weights."""
    index = {}
    for col, name in enumerate(names):
        g = obj.vertex_groups.get(name)
        if g is not None:
            index[g.index] = col
    out = np.zeros((len(obj.data.vertices), len(names)), dtype=np.float32)
    for v in obj.data.vertices:
        for g in v.groups:
            col = index.get(g.group)
            if col is not None:
                out[v.index, col] = g.weight
    return out


def vertex_adjacency(mesh: bpy.types.Mesh) -> list[list[int]]:
    adj: list[list[int]] = [[] for _ in range(len(mesh.vertices))]
    for e in mesh.edges:
        a, b = e.vertices
        adj[a].append(b)
        adj[b].append(a)
    return adj


def set_smooth(mesh: bpy.types.Mesh) -> None:
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.update()


def bone_world(rig: bpy.types.Object, name: str, tail: bool = False) -> Vector:
    """Rest-pose joint position in world space."""
    b = rig.data.bones[name]
    return rig.matrix_world @ (b.tail_local if tail else b.head_local)
