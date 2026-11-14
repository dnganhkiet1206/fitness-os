"""Sculpts the master character's muscles as separate anatomical blocks.

    Blender -b --factory-startup --python pipeline/sculpt_muscles.py

Run after bake_muscle_atlas.py (it reads the masks). Splits each group into
its parts (config/muscle_parts.json, evs/muscle_sculpt.py), then:

* moves the rest mesh outwards by up to ``geometry.amplitude_m`` inside each
  part, with a groove on every part outline (broad forms that survive any
  renderer and the silhouette); vertices next to the shorts are left alone so
  the cloth does not get pierced;
* writes muscle_atlas/sculpt_height.npz: the same field at texel resolution
  with a narrower groove, added to the body normal map at export (crisp
  separations between heads, the abdominal rows, the pectoral heads...).

The rig, weights, UVs and masks are unchanged. Facts go to
character_facts.json under "muscle_sculpt".
"""

from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402
from mathutils.kdtree import KDTree  # noqa: E402

from evs import bl_util, config, fiber_lic, muscle_eval, muscle_sculpt, muscles, pngio  # noqa: E402


def nearest_distance(tree: KDTree, points: np.ndarray, cap: float) -> np.ndarray:
    out = np.full(len(points), cap)
    for i, p in enumerate(points):
        _co, _idx, d = tree.find(p)
        if d < cap:
            out[i] = d
    return out


def give_patch_uv_island(body, valid: np.ndarray, size: int = 56, margin: int = 10) -> list:
    """The faceless head patch is built without UVs: all its faces sit on one
    UV point, so RealityKit has no tangents there and shades the face as one
    flat plate with a jagged edge (14/11, seen in the app). Give it its own
    island: a front (x, z) projection into an empty square of the atlas,
    where every texture is plain skin with a flat normal. Returns the
    island's centre (flattened again in every normal map)."""
    mesh = body.data
    uv = mesh.uv_layers.active.data
    res = valid.shape[0]
    patch = []
    for poly in mesh.polygons:
        u = np.array([uv[i].uv[:] for i in poly.loop_indices])
        if (u.max(axis=0) - u.min(axis=0)).max() < 1e-4:
            patch.append(poly)
    island_attr = mesh.attributes.get("evs_face_island")
    if not patch and island_attr is None:
        return []
    if island_attr is not None and not patch:
        patch = [p for p in mesh.polygons if island_attr.data[p.index].value]
    occupied = valid.copy()
    for poly in patch:  # an earlier run's island must not block itself
        for li in poly.loop_indices:
            c, r = (np.array(uv[li].uv[:]) * res).astype(int)
            occupied[max(r - 2, 0):r + 3, max(c - 2, 0):c + 3] = False
    need = size + 2 * margin
    found = None
    for r0 in range(0, res - need, 8):
        for c0 in range(0, res - need, 8):
            if not occupied[r0:r0 + need, c0:c0 + need].any():
                found = (r0 + margin, c0 + margin)
                break
        if found:
            break
    if found is None:
        raise RuntimeError("no free square in the UV atlas for the face patch")
    vidx = sorted({v for p in patch for v in p.vertices})
    co = np.array([mesh.vertices[i].co[:] for i in vidx])
    lo, hi = co[:, [0, 2]].min(axis=0), co[:, [0, 2]].max(axis=0)
    span = float((hi - lo).max())
    r0, c0 = found
    for poly in patch:
        for li in poly.loop_indices:
            x, _y, z = mesh.vertices[mesh.loops[li].vertex_index].co
            uv[li].uv = ((c0 + (x - lo[0]) / span * size) / res, (r0 + (z - lo[1]) / span * size) / res)
    if island_attr is None:
        island_attr = mesh.attributes.new("evs_face_island", "BOOLEAN", "FACE")
    for poly in patch:
        island_attr.data[poly.index].value = True
    centre = [(c0 + size / 2) / res, (r0 + size / 2) / res]
    print(f"[evs] sculpt: face patch ({len(patch)} faces) moved to its own UV island at {centre}")
    return [centre]


def main() -> None:
    t0 = time.time()
    cfg = config.character_config()
    names = cfg["names"]
    parts_cfg = config.load_json(config.CONFIG_DIR / "muscle_parts.json")
    muscle_map = config.load_json(config.CONFIG_DIR / "muscle_map.json")
    blend = config.character_blend(cfg["master_character_id"])
    atlas = config.character_dir(cfg["master_character_id"]) / "muscle_atlas"
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    body, rig = bpy.data.objects[names["body_object"]], bpy.data.objects[names["armature_object"]]
    shorts = next((o for o in bpy.data.objects if o.type == "MESH" and o is not body and o.parent == rig), None)
    joints = muscles.rest_joints(rig)
    masks = muscles.load_masks(atlas)
    masks.pop("_side_left", None)
    groups = list(masks.keys())
    res = next(iter(masks.values())).shape[0]

    # Texel positions on the rest surface.
    pos = np.zeros((res, res, 3), np.float32)
    valid = np.zeros((res, res), bool)
    for points, _n, _w, col, row in muscles._surface_samples(body, res):
        pos[row, col] = points
        valid[row, col] = True
    stack = np.stack([masks[g] for g in groups], axis=-1)
    gidx = np.where(stack.max(axis=-1) > 127, stack.argmax(axis=-1), -1)
    gidx[~valid] = -1
    labels = muscle_sculpt.part_labels(gidx.ravel(), groups, pos.reshape(-1, 3).astype(float), joints, parts_cfg["groups"]).reshape(res, res)
    outlines = muscle_sculpt.boundary_points_by_kind(labels, pos, valid)
    trees = {}
    for k, pts in outlines.items():
        tree = KDTree(max(len(pts), 1))
        for i, p in enumerate(pts):
            tree.insert(p, i)
        if not len(pts):
            tree.insert((1e3, 1e3, 1e3), 0)
        tree.balance()
        trees[k] = tree
    outline = np.concatenate(list(outlines.values()))
    print(f"[evs] sculpt: {len(np.unique(labels)) - 1} parts, outline points {({k: len(v) for k, v in outlines.items()})} ({time.time() - t0:.1f}s)")

    def field(points: np.ndarray, is_muscle: np.ndarray, profile: dict) -> np.ndarray:
        d = {k: nearest_distance(trees[k], points, 3 * profile[k]["width_m"]) for k in trees}
        return muscle_sculpt.relief(d, is_muscle, profile)

    # Texture field (narrow grooves).
    muscle_tex = labels > 0
    h_tex = np.zeros((res, res), np.float32)
    idx = np.flatnonzero(muscle_tex.ravel())
    h_tex.ravel()[idx] = field(pos.reshape(-1, 3)[idx], np.ones(len(idx), bool), parts_cfg["texture"]["profile"])
    # Grow the field past the UV island borders before taking gradients, or
    # every island edge inside a muscle becomes a false groove.
    h_tex = muscles._dilate(h_tex, valid, 8)
    # Outlines follow texels and come out jagged (a stitched-seam look on
    # the spine and the back of the legs): soften by ~2 mm before shading.
    h_tex = fiber_lic.box_blur(fiber_lic.box_blur(h_tex.astype(np.float64), 2), 2).astype(np.float32)
    np.savez_compressed(atlas / "sculpt_height.npz", height=h_tex.astype(np.float16), relief=np.float32(parts_cfg["texture"]["relief"]))
    flat_points = give_patch_uv_island(body, valid)
    normal = fiber_lic.flatten_points(fiber_lic.normal_map(h_tex * parts_cfg["texture"]["relief"]), flat_points)
    pngio.write_png(atlas / "sculpt_normal.png", (np.flipud(normal) * 255.0 + 0.5).astype(np.uint8))
    print(f"[evs] sculpt: texture field written ({time.time() - t0:.1f}s)")

    # Mesh displacement (broad blocks).
    mesh = body.data
    # Idempotent: the unsculpted rest shape is kept in a vertex attribute the
    # first time, and every run starts from it.
    attr = mesh.attributes.get("evs_presculpt_co")
    if attr is None:
        attr = mesh.attributes.new("evs_presculpt_co", "FLOAT_VECTOR", "POINT")
        attr.data.foreach_set("vector", bl_util.mesh_coords(mesh).astype(np.float32).ravel())
    co = np.empty(len(mesh.vertices) * 3, np.float32)
    attr.data.foreach_get("vector", co)
    co = co.reshape(-1, 3).astype(float)
    bl_util.set_mesh_coords(mesh, co.astype(np.float32))
    mesh.update()
    no = bl_util.mesh_normals(mesh).astype(float)
    mirrored, n_m = co.copy(), no.copy()
    left = co[:, 0] >= 0
    mirrored[:, 0] = np.abs(mirrored[:, 0])
    n_m[:, 0] = np.where(left, n_m[:, 0], -n_m[:, 0])
    values = muscle_eval.evaluate_groups(muscle_map, joints, mirrored, n_m, muscles._gate_weights(body).astype(float))
    vstack = np.stack([values[g] for g in groups], axis=-1)
    vg = np.where(vstack.max(axis=-1) > 0.5, vstack.argmax(axis=-1), -1)
    vlab = muscle_sculpt.part_labels(vg, groups, co, joints, parts_cfg["groups"])
    geo = parts_cfg["geometry"]
    h_v = field(co, vlab > 0, geo["profile"])
    keep = np.ones(len(co))
    if shorts is not None:
        dg = bpy.context.evaluated_depsgraph_get()
        import bmesh
        bm = bmesh.new()
        bm.from_object(shorts, dg)
        bm.transform(shorts.matrix_world)
        sbvh = BVHTree.FromBMesh(bm)
        bm.free()
        mw = body.matrix_world
        skip = geo["skip_near_apparel_m"]
        for i, p in enumerate(co):
            hit = sbvh.find_nearest(mw @ Vector(p), 2 * skip)
            if hit[0] is not None:
                keep[i] = np.clip((hit[3] - skip) / skip, 0.0, 1.0)
    disp = geo["amplitude_m"] * h_v * keep
    bl_util.set_mesh_coords(mesh, (co + no * disp[:, None]).astype(np.float32))
    mesh.update()

    facts_path = config.character_dir(cfg["master_character_id"]) / "character_facts.json"
    facts = config.load_json(facts_path)
    facts["uv_flat_points"] = flat_points
    facts["muscle_sculpt"] = {"parts": int(len(np.unique(labels)) - 1), "outline_points": int(len(outline)),
                              "vertices_moved": int((disp > 1e-5).sum()), "max_displacement_m": round(float(disp.max()), 4),
                              "geometry": geo, "texture": parts_cfg["texture"]}
    config.save_json(facts_path, facts)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    print(f"[evs] sculpt: {facts['muscle_sculpt']['vertices_moved']} vertices moved, max {facts['muscle_sculpt']['max_displacement_m']} m, done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
