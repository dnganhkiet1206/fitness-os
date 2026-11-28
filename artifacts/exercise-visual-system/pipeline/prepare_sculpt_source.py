"""Prepares the sculpted body that character 005 is fitted to (Kiệt 23/11).

    Blender -b --factory-startup --python pipeline/prepare_sculpt_source.py -- --fbx "<Body builder.fbx>"

Source: "Male base muscular anatomy" by CharacterZone, Sketchfab, CC BY 4.0
(characters/sources/male_base_muscular_cc_by/ATTRIBUTION.md). The FBX is not
in the repository; this script turns it into ``sculpt_B.blend`` (one mesh,
no materials):

* imported, turned upright, scaled to 1.78 m, centred, soles on z = 0
  (the model stands in a T-pose, facing -Y);
* "level B" chosen by Kiệt on 23/11 out of three ("looks like steroids"
  otherwise): the fine detail (veins, deep striations) is reduced by blending
  60 % towards a smoothed copy (6 smoothing passes), and the thighs and upper
  arms are scaled 0.92 about their own axes.
"""
from __future__ import annotations

import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402

from evs import bl_util, config  # noqa: E402

OUT = config.ROOT / "characters" / "sources" / "male_base_muscular_cc_by" / "sculpt_B.blend"
DETAIL_BLEND = 0.6
SMOOTH_PASSES = 6
LIMB_SCALE = 0.92


def smoothed(mesh, passes: int) -> np.ndarray:
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for _ in range(passes):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.verts.ensure_lookup_table()
    out = np.array([tuple(v.co) for v in bm.verts])
    bm.free()
    return out


def shrink_limb(co: np.ndarray, mask: np.ndarray, axis: int, k: float, lo: float, hi: float, ramp: float = 0.05) -> None:
    """Scales a limb about its axis by ``k``; the scale ramps in over ``ramp`` metres from both
    ends of [lo, hi] along ``axis`` (|coordinate| for the arms), so there is no step where the
    shrink starts (23/11: an abrupt start left a ring on the upper arm)."""
    idx = np.flatnonzero(mask)
    if not len(idx):
        return
    p = co[idx]
    t = p[:, axis]
    at = np.abs(t)
    f = np.clip(np.minimum(at - lo, hi - at) / ramp, 0.0, 1.0)
    f = f * f * (3 - 2 * f)
    kk = 1.0 - (1.0 - k) * f
    bins = np.linspace(t.min(), t.max(), 30)
    b = np.clip(np.digitize(t, bins) - 1, 0, 28)
    for i in range(29):
        m = b == i
        if m.sum() < 5:
            continue
        c = p[m].mean(0)
        d = p[m] - c
        d[:, axis] = 0.0
        q = c + d * kk[m, None]
        q[:, axis] = p[m, axis]
        p[m] = q
    co[idx] = p


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fbx", required=True)
    args = bl_util.script_args(ap)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=args.fbx)
    body = max((o for o in bpy.context.scene.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
    for o in list(bpy.context.scene.objects):
        if o is not body:
            bpy.data.objects.remove(o)
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    co = np.array([tuple(v.co) for v in body.data.vertices])
    ext = co.max(0) - co.min(0)
    if ext[1] > ext[2]:  # height along Y: stand it up
        body.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
    co = np.array([tuple(v.co) for v in body.data.vertices])
    body.scale = (1.78 / np.ptp(co[:, 2]),) * 3
    bpy.ops.object.transform_apply(scale=True)
    co = np.array([tuple(v.co) for v in body.data.vertices])
    body.location = (-co[:, 0].mean(), -co[:, 1].mean(), -co[:, 2].min())
    bpy.ops.object.transform_apply(location=True)

    me = body.data
    co = np.array([tuple(v.co) for v in me.vertices])
    co = co - DETAIL_BLEND * (co - smoothed(me, SMOOTH_PASSES))
    z, x = co[:, 2], co[:, 0]
    for side in (1, -1):
        shrink_limb(co, (z < 0.92) & (z > 0.08) & (x * side > 0.015), 2, LIMB_SCALE, 0.08, 0.92)
        shrink_limb(co, (np.abs(x) > 0.24) & (x * side > 0) & (z > 1.25), 0, LIMB_SCALE, 0.24, 2.0)
    bl_util.set_mesh_coords(me, co.astype(np.float32))
    me.update()
    body.name = me.name = "SculptBody"
    body.data.materials.clear()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
    print(f"[evs] sculpt source: {len(me.vertices)} vertices -> {OUT}")


if __name__ == "__main__":
    main()
