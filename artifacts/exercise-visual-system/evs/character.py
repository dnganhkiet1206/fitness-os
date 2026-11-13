"""Master character: MakeHuman base mesh (through MPFB), made faceless, with
shorts, skinned to a 53-bone deform skeleton. Built once per character
version; every exercise appends the saved result instead of rebuilding it."""

from __future__ import annotations

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from . import bl_util


# --------------------------------------------------------------------------
# Body shape
# --------------------------------------------------------------------------

def _mpfb_human(shape: dict, muscle: float, weight: float) -> bpy.types.Object:
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService

    macro = TargetService.get_default_macro_info_dict()
    macro.update(
        gender=shape["gender"],
        age=shape["age"],
        proportions=shape["proportions"],
        height=shape["height"],
        muscle=muscle,
        weight=weight,
    )
    macro["race"] = dict(shape["race"])
    return HumanService.create_human(
        mask_helpers=False,
        detailed_helpers=True,  # joint cubes are needed to fit the rig
        extra_vertex_groups=True,
        feet_on_ground=False,
        scale=0.1,  # MakeHuman decimetres to metres
        macro_detail_dict=macro,
    )


def build_body(cfg: dict) -> tuple[bpy.types.Object, bpy.types.Object, dict]:
    """Returns (body mesh object, armature object, facts measured on the mesh)."""
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService

    shape = cfg["body_shape"]
    names = cfg["names"]

    base = _mpfb_human(shape, 1.0, shape["weight"])
    average = _mpfb_human(shape, 0.5, shape["weight"])
    lean = _mpfb_human(shape, 1.0, 0.0)
    p_max = bl_util.shape_key_mix(base.data)
    muscle_delta = p_max - bl_util.shape_key_mix(average.data)
    lean_delta = bl_util.shape_key_mix(lean.data) - p_max
    # The extra definition is for the body. Applied to the head it hollows the
    # cheeks and thickens the neck, so it fades out between the base of the
    # neck and the jaw.
    neck = bl_util.group_members(base, "joint-neck")
    neck_z = float(p_max[neck, 2].mean()) if neck.any() else float(p_max[:, 2].max()) - 0.25
    fade = np.clip((p_max[:, 2] - (neck_z - 0.02)) / 0.06, 0.0, 1.0)
    below_head = (1.0 - fade * fade * (3.0 - 2.0 * fade))[:, None]
    coords = p_max + below_head * ((shape["muscle_definition"] - 1.0) * muscle_delta + shape["leanness"] * lean_delta)
    for tmp in (average, lean):
        mesh = tmp.data
        bpy.data.objects.remove(tmp, do_unlink=True)
        bpy.data.meshes.remove(mesh)

    body_mask = bl_util.group_members(base, "body")
    coords[:, 2] -= coords[body_mask, 2].min()  # soles on z = 0
    base.shape_key_clear()
    bl_util.set_mesh_coords(base.data, coords)

    # Landmarks that only exist while the helper geometry is still there.
    facts = {}
    for side in ("l", "r"):
        eye = bl_util.group_members(base, f"joint-{side}-eye")
        if eye.any():
            facts[f"eye_{side}"] = coords[eye].mean(axis=0).tolist()

    rig = HumanService.add_builtin_rig(base, cfg["rig"]["mpfb_rig"], import_weights=True)
    if rig is None:
        raise RuntimeError("MPFB could not create the rig")

    _delete_helper_geometry(base)
    for mod in list(base.modifiers):
        if mod.type == "MASK":
            base.modifiers.remove(mod)

    base.name = names["body_object"]
    base.data.name = names["body_object"]
    rig.name = names["armature_object"]
    rig.data.name = names["armature_object"]
    bl_util.set_smooth(base.data)
    return base, rig, facts


def _delete_helper_geometry(obj: bpy.types.Object) -> None:
    """Keeps the 13,380 skin vertices; drops joint cubes, eyes, teeth, hair
    and clothing helpers. Then drops the vertex groups that are not bones."""
    keep = bl_util.group_members(obj, "body")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep[v.index]], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    for g in list(obj.vertex_groups):
        if g.name.startswith(("joint-", "helper-")) or g.name in {"HelperGeometry", "JointCubes", "Left", "Mid", "Right", "body"}:
            obj.vertex_groups.remove(g)


# --------------------------------------------------------------------------
# Thin-plate fairing (used for the faceless head and to remove the nipples)
# --------------------------------------------------------------------------

def fair_region(mesh: bpy.types.Mesh, region: np.ndarray, bulge: float = 0.0,
                bulge_direction: tuple[float, float, float] | None = None, blend_rings: int = 2,
                thin_plate: bool = False) -> float:
    """Replaces the vertices in ``region`` by a membrane spanned between the
    surrounding vertices (uniform Laplace equation, so it can never overshoot
    or fold), optionally pushed out by a smooth dome of height ``bulge``
    (solution of a Poisson equation, zero at the border), then relaxes a band
    of ``blend_rings`` vertex rings across the border so no crease is left.

    Returns the largest vertex displacement in metres."""
    adj = bl_util.vertex_adjacency(mesh)
    coords = bl_util.mesh_coords(mesh)
    original = coords.copy()
    unknown = np.flatnonzero(region)
    if unknown.size == 0:
        return 0.0
    col = {int(v): i for i, v in enumerate(unknown)}
    n = len(unknown)
    a = np.zeros((n, n), dtype=np.float64)
    b = np.zeros((n, 3), dtype=np.float64)
    for r, v in enumerate(unknown):
        neigh = adj[int(v)]
        w = 1.0 / len(neigh)
        a[r, r] = 1.0
        for m in neigh:
            c = col.get(m)
            if c is None:
                b[r] += w * coords[m]
            else:
                a[r, c] -= w
    coords[unknown] = np.linalg.solve(a, b)
    if thin_plate:
        # Second pass on an evenly meshed patch: minimise the squared
        # Laplacian over the patch and its first ring, which also matches the
        # slope of the surrounding surface. Started from the membrane above.
        rows = set(int(v) for v in unknown)
        for v in unknown:
            rows.update(adj[int(v)])
        rows = sorted(rows)
        a2 = np.zeros((len(rows), n), dtype=np.float64)
        b2 = np.zeros((len(rows), 3), dtype=np.float64)
        for r, v in enumerate(rows):
            neigh = adj[v]
            w = 1.0 / len(neigh)
            if v in col:
                a2[r, col[v]] += 1.0
            else:
                b2[r] -= coords[v]
            for m in neigh:
                c = col.get(m)
                if c is None:
                    b2[r] += w * coords[m]
                else:
                    a2[r, c] -= w
        coords[unknown] = np.linalg.solve(a2.T @ a2, a2.T @ b2)
    if bulge:
        dome = np.linalg.solve(a, np.ones(n))
        dome /= dome.max()
        coords[unknown] += np.outer(dome * bulge, np.asarray(bulge_direction, dtype=np.float64))

    if blend_rings > 0:
        inside = region.copy()
        ring_in = np.zeros(len(coords), dtype=bool)
        ring_out = np.zeros(len(coords), dtype=bool)
        frontier_out = set(int(v) for v in unknown)
        frontier_in = set(int(v) for v in unknown if any(not inside[m] for m in adj[int(v)]))
        ring_in[list(frontier_in)] = True
        for _ in range(blend_rings):
            nxt = set()
            for v in frontier_out:
                for m in adj[v]:
                    if not inside[m] and not ring_out[m]:
                        ring_out[m] = True
                        nxt.add(m)
            frontier_out = nxt
        for _ in range(blend_rings - 1):
            nxt = set()
            for v in frontier_in:
                for m in adj[v]:
                    if inside[m] and not ring_in[m]:
                        ring_in[m] = True
                        nxt.add(m)
            frontier_in = nxt
        band = np.flatnonzero(ring_in | ring_out)
        for _ in range(10 * blend_rings):
            avg = np.array([coords[adj[int(v)]].mean(axis=0) for v in band])
            coords[band] += 0.5 * (avg - coords[band])

    moved = float(np.linalg.norm(coords - original, axis=1).max())
    bl_util.set_mesh_coords(mesh, coords)
    return moved


def make_faceless(body: bpy.types.Object, cfg: dict, facts: dict) -> dict:
    """Removes eyes, nose and mouth. Ears, skull, jaw line and chin stay, so
    the head still reads as a head from every camera.

    The eye sockets, nostrils and mouth of the base mesh are deep pockets with
    hundreds of vertices each; smoothing them in place leaves pinches. So the
    frontal face (pockets included) is cut out and the hole is closed with a
    new, evenly spaced patch that is then relaxed into a shallow dome."""
    from mathutils.geometry import delaunay_2d_cdt

    mesh = body.data
    coords = bl_util.mesh_coords(mesh)
    head = bl_util.group_weights(body, ["head"])[:, 0] > 0.5
    ears = bl_util.group_members(body, "ears")
    f = cfg["faceless"]

    eye_z = 0.5 * (facts["eye_l"][2] + facts["eye_r"][2])
    eye_x = 0.5 * (abs(facts["eye_l"][0]) + abs(facts["eye_r"][0]))
    y_back = coords[ears, 1].min() - f["behind_ear_front"]
    midline = head & (np.abs(coords[:, 0]) < 0.012) & (coords[:, 1] < coords[ears, 1].min() - 0.06)
    menton_z = coords[midline, 2].min()
    z_lo = menton_z + f["above_chin"]
    z_hi = eye_z + f["above_eye"]

    frontal = head & (coords[:, 1] <= y_back)

    def half_width(z: float) -> float:
        band = frontal & (np.abs(coords[:, 2] - z) < 0.008)
        return float(np.abs(coords[band, 0]).max()) if band.any() else 0.0

    zs = np.linspace(z_lo, z_hi, 40)
    widths = np.array([min(eye_x + f["beyond_eye_lateral"], half_width(z) - f["cheek_margin"]) for z in zs])
    x_limit = np.interp(coords[:, 2], zs, widths)
    window = frontal & (coords[:, 2] >= z_lo) & (coords[:, 2] <= z_hi) & (np.abs(coords[:, 0]) <= x_limit)

    lips = bl_util.group_members(body, "lips")
    field = _smoothed_front(mesh, coords, f, z_lo, z_hi, chin_top=float(coords[lips, 2].min()) - 0.004)

    head_group = body.vertex_groups["head"].index
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[fc for fc in bm.faces if all(window[v.index] for v in fc.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")

    # Pocket remnants that reached outside the window are now loose shells.
    seen: set = set()
    components = []
    for v in bm.verts:
        if v in seen:
            continue
        stack, comp = [v], []
        seen.add(v)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o not in seen:
                    seen.add(o)
                    stack.append(o)
        components.append(comp)
    components.sort(key=len, reverse=True)
    for comp in components[1:]:
        bmesh.ops.delete(bm, geom=comp, context="VERTS")

    boundary_edges = [e for e in bm.edges if len(e.link_faces) == 1]
    loop = _ordered_loop(boundary_edges)
    uv_layer = bm.loops.layers.uv.verify()
    deform = bm.verts.layers.deform.verify()
    reference_uv = loop[0].link_loops[0][uv_layer].uv.copy()

    # New points on an even grid inside the hole, seen from the front (x, z).
    spacing = f["patch_spacing"]
    poly = np.array([(v.co.x, v.co.z) for v in loop])
    grid = []
    nx = int(np.ceil(poly[:, 0].max() / spacing))
    for iz in range(int(np.ceil((poly[:, 1].max() - poly[:, 1].min()) / spacing)) + 1):
        z = poly[:, 1].min() + iz * spacing
        for ix in range(-nx, nx + 1):
            pt = (ix * spacing, z)
            if _inside(pt, poly) and _distance_to_polygon(pt, poly) > 0.7 * spacing:
                grid.append(pt)
    pts = [Vector(p) for p in poly] + [Vector(p) for p in grid]
    n_loop = len(loop)
    out_pts, _edges, tris, orig_verts, _oe, _of = delaunay_2d_cdt(pts, [], [list(range(n_loop))], 1, 1e-7)

    new_verts = {}
    def vert_for(i_out: int):
        src = orig_verts[i_out][0]
        if src < n_loop:
            return loop[src]
        if src not in new_verts:
            p = pts[src]
            # Featureless surface in the middle, original surface at the rim.
            rim = min(1.0, _distance_to_polygon((p.x, p.y), poly) / f["rim_blend"])
            w = rim * rim * (3.0 - 2.0 * rim)
            y = w * field.smooth(p.x, p.y) + (1.0 - w) * field.original(p.x, p.y)
            nv = bm.verts.new((p.x, y, p.y))
            nv[deform][head_group] = 1.0
            new_verts[src] = nv
        return new_verts[src]

    new_faces = []
    for tri in tris:
        vs = [vert_for(i) for i in tri]
        if len(set(vs)) < 3:
            continue
        try:
            new_faces.append(bm.faces.new(vs))
        except ValueError:
            pass
    for fc in new_faces:
        fc.smooth = True
        for lp in fc.loops:
            lp[uv_layer].uv = reference_uv
    bmesh.ops.join_triangles(bm, faces=new_faces, angle_face_threshold=3.2, angle_shape_threshold=3.2)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.verts.index_update()
    patch_indices = [v.index for v in new_verts.values()]
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    bl_util.set_smooth(mesh)
    moved = field.largest_change
    return {
        "faceless_removed_vertices": int(window.sum()),
        "faceless_patch_vertices": len(patch_indices),
        "faceless_boundary_vertices": n_loop,
        "faceless_window": {"z_low": round(float(z_lo), 4), "z_high": round(float(z_hi), 4), "max_half_width": round(float(widths.max()), 4)},
        "faceless_max_displacement_m": round(moved, 4),
    }


class _FrontField:
    """The front of the head as a height field y(x, z), before and after the
    features are filtered out."""

    def __init__(self, xs: np.ndarray, zs: np.ndarray, original: np.ndarray, smooth: np.ndarray):
        self.xs, self.zs, self._original, self._smooth = xs, zs, original, smooth
        self.largest_change = float(np.abs(smooth - original).max())

    def _sample(self, grid: np.ndarray, x: float, z: float) -> float:
        fx = np.clip((x - self.xs[0]) / (self.xs[1] - self.xs[0]), 0, len(self.xs) - 1.001)
        fz = np.clip((z - self.zs[0]) / (self.zs[1] - self.zs[0]), 0, len(self.zs) - 1.001)
        ix, iz = int(fx), int(fz)
        tx, tz = fx - ix, fz - iz
        return float((grid[iz, ix] * (1 - tx) + grid[iz, ix + 1] * tx) * (1 - tz)
                     + (grid[iz + 1, ix] * (1 - tx) + grid[iz + 1, ix + 1] * tx) * tz)

    def original(self, x: float, z: float) -> float:
        return self._sample(self._original, x, z)

    def smooth(self, x: float, z: float) -> float:
        return self._sample(self._smooth, x, z)


def _disc_filter(grid: np.ndarray, radius_px: int, op) -> np.ndarray:
    padded = np.pad(grid, radius_px, mode="edge")
    out = grid.copy()
    h, w = grid.shape
    for dz in range(-radius_px, radius_px + 1):
        for dx in range(-radius_px, radius_px + 1):
            if dx * dx + dz * dz <= radius_px * radius_px:
                out = op(out, padded[radius_px + dz : radius_px + dz + h, radius_px + dx : radius_px + dx + w])
    return out


def _blur(grid: np.ndarray, sigma_px: float) -> np.ndarray:
    r = int(np.ceil(3 * sigma_px))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma_px) ** 2)
    k /= k.sum()
    padded = np.pad(grid, r, mode="edge")
    tmp = sum(k[i] * padded[:, i : i + grid.shape[1]] for i in range(2 * r + 1))
    return sum(k[i] * tmp[i : i + grid.shape[0], :] for i in range(2 * r + 1))


def _smoothed_front(mesh: bpy.types.Mesh, coords: np.ndarray, f: dict, z_lo: float, z_hi: float, chin_top: float) -> _FrontField:
    """Looks at the head from the front, so inner pockets never show, then
    fills hollows narrower than ``fill_radius`` (eye sockets, the line of the
    mouth), removes bumps narrower than ``remove_radius`` (nose, lips, brow)
    and blurs the result. Wide shapes such as the forehead, the cheeks and
    the chin survive."""
    step = f["field_step"]
    pad = f["remove_radius"] + f["fill_radius"] + 0.01
    xs = np.arange(-0.095, 0.095 + step, step)
    zs = np.arange(z_lo - pad, z_hi + pad + step, step)
    bvh = BVHTree.FromPolygons([tuple(c) for c in coords], [tuple(p.vertices) for p in mesh.polygons])
    forward = np.full((len(zs), len(xs)), np.nan)
    into_head = Vector((0.0, 1.0, 0.0))
    for iz, z in enumerate(zs):
        for ix, x in enumerate(xs):
            hit = bvh.ray_cast(Vector((x, -1.0, z)), into_head)
            if hit[0] is not None:
                forward[iz, ix] = -hit[0].y  # larger = further forward
    far_back = np.nanmin(forward) - 0.02
    forward = np.where(np.isnan(forward), far_back, forward)
    filled = _disc_filter(_disc_filter(forward, int(round(f["fill_radius"] / step)), np.maximum), int(round(f["fill_radius"] / step)), np.minimum)
    opened = _disc_filter(_disc_filter(filled, int(round(f["remove_radius"] / step)), np.minimum), int(round(f["remove_radius"] / step)), np.maximum)
    # Below the mouth only hollows are filled, so the chin keeps its shape.
    t = np.clip((zs - chin_top) / 0.012, 0.0, 1.0)
    t = (t * t * (3.0 - 2.0 * t))[:, None]
    smooth = _blur(t * opened + (1.0 - t) * filled, f["blur_sigma"] / step)
    return _FrontField(xs, zs, -forward, -smooth)


def _ordered_loop(edges) -> list:
    """Vertices of a single closed edge loop, in order."""
    link: dict = {}
    for e in edges:
        a, b = e.verts
        link.setdefault(a, []).append(b)
        link.setdefault(b, []).append(a)
    if any(len(n) != 2 for n in link.values()):
        raise RuntimeError("the face window did not leave a single clean hole")
    start = next(iter(link))
    loop = [start]
    prev, cur = None, start
    while True:
        nxt = [n for n in link[cur] if n is not prev][0] if prev is not None else link[cur][0]
        if nxt is start:
            break
        loop.append(nxt)
        prev, cur = cur, nxt
    if len(loop) != len(link):
        raise RuntimeError("the face window left more than one hole")
    return loop


def _inside(pt, poly: np.ndarray) -> bool:
    x, y = pt
    x0, y0 = poly[:, 0], poly[:, 1]
    x1, y1 = np.roll(x0, -1), np.roll(y0, -1)
    cross = ((y0 > y) != (y1 > y)) & (x < (x1 - x0) * (y - y0) / (y1 - y0 + 1e-30) + x0)
    return bool(cross.sum() % 2)


def _distance_to_polygon(pt, poly: np.ndarray) -> float:
    p = np.asarray(pt)
    a = poly
    b = np.roll(poly, -1, axis=0)
    ab = b - a
    t = np.clip(((p - a) * ab).sum(axis=1) / ((ab * ab).sum(axis=1) + 1e-30), 0.0, 1.0)
    return float(np.linalg.norm(a + ab * t[:, None] - p, axis=1).min())


def remove_nipples(body: bpy.types.Object) -> int:
    region = bl_util.group_members(body, "nipple") | bl_util.group_members(body, "nippleTip")
    if not region.any():
        return 0
    adj = bl_util.vertex_adjacency(body.data)
    grown = region.copy()
    for v in np.flatnonzero(region):
        grown[adj[int(v)]] = True
    fair_region(body.data, grown, blend_rings=1)
    return int(grown.sum())


def drop_landmark_groups(body: bpy.types.Object) -> None:
    for name in ("nippleTip", "nipple", "lips", "fingernails", "toenails", "ears", "scalp", "genitals"):
        g = body.vertex_groups.get(name)
        if g is not None:
            body.vertex_groups.remove(g)


# --------------------------------------------------------------------------
# Shorts
# --------------------------------------------------------------------------

def build_shorts(body: bpy.types.Object, rig: bpy.types.Object, cfg: dict) -> bpy.types.Object:
    """Fitted shorts cut out of a copy of the body surface, so they carry the
    same UVs (muscle highlights show through) and the same skin weights (they
    follow every pose without simulation)."""
    s = cfg["shorts"]
    hip_l = bl_util.bone_world(rig, "thigh_l")
    hip_r = bl_util.bone_world(rig, "thigh_r")
    knee_l = bl_util.bone_world(rig, "calf_l")
    knee_r = bl_util.bone_world(rig, "calf_r")

    mesh = body.data.copy()
    mesh.name = cfg["names"]["shorts_object"]
    shorts = bpy.data.objects.new(cfg["names"]["shorts_object"], mesh)
    for coll in body.users_collection:
        coll.objects.link(shorts)
    shorts.parent = body.parent
    shorts.matrix_world = body.matrix_world.copy()
    for g in body.vertex_groups:
        if shorts.vertex_groups.get(g.name) is None:
            shorts.vertex_groups.new(name=g.name)

    lower = bl_util.group_weights(body, ["pelvis", "thigh_l", "thigh_r", "spine_01", "spine_02"]).sum(axis=1) > 0.2
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not lower[v.index]], context="VERTS")

    def cut(plane_co: Vector, plane_no: Vector, side: float = 0.0) -> None:
        if side:
            geom = [f for f in bm.faces if f.calc_center_median().x * side > -0.002]
            geom = list({e for f in geom for e in f.edges}) + list({v for f in geom for v in f.verts}) + geom
        else:
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=plane_co, plane_no=plane_no, clear_outer=True, clear_inner=False)

    waist_z = 0.5 * (hip_l.z + hip_r.z) + s["waist_above_hip_joint"]
    tilt = math.radians(s["waist_front_drop_deg"])
    # The character faces -Y, so the plane normal leans forward to drop the front.
    cut(Vector((0.0, 0.0, waist_z)), Vector((0.0, -math.sin(tilt), math.cos(tilt))))
    for hip, knee, side in ((hip_l, knee_l, 1.0), (hip_r, knee_r, -1.0)):
        axis = (knee - hip).normalized()
        cut(hip + (knee - hip) * s["leg_fraction_of_thigh"], axis, side)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * s["offset"]
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    bl_util.set_smooth(mesh)

    arm = shorts.modifiers.new("Armature", "ARMATURE")
    arm.object = rig
    sub = shorts.modifiers.new("Subdivision", "SUBSURF")
    sub.levels = cfg["rig"]["subdivision_viewport_levels"]
    sub.render_levels = cfg["rig"]["subdivision_render_levels"]
    solid = shorts.modifiers.new("Thickness", "SOLIDIFY")
    solid.thickness = s["thickness"]
    solid.offset = 1.0
    solid.use_rim = True
    return shorts


# --------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------

def finish_body(body: bpy.types.Object, rig: bpy.types.Object, cfg: dict) -> None:
    for mod in list(body.modifiers):
        if mod.type == "SUBSURF":
            body.modifiers.remove(mod)
    sub = body.modifiers.new("Subdivision", "SUBSURF")
    sub.levels = cfg["rig"]["subdivision_viewport_levels"]
    sub.render_levels = cfg["rig"]["subdivision_render_levels"]
    body["evs_master_character_id"] = cfg["master_character_id"]
    body["evs_master_character_version"] = cfg["version"]
    rig["evs_master_character_id"] = cfg["master_character_id"]
    rig["evs_master_character_version"] = cfg["version"]
    rig.show_in_front = False
    rig.data.display_type = "STICK"


def measure(body: bpy.types.Object, rig: bpy.types.Object) -> dict:
    """Facts used by the docs, the QA report and the consistency check."""
    co = bl_util.mesh_coords(body.data)
    bones = {}
    for b in rig.data.bones:
        if b.use_deform:
            bones[b.name] = {
                "parent": b.parent.name if b.parent else None,
                "length_m": round(b.length, 5),
                "head_rest_m": [round(c, 5) for c in (rig.matrix_world @ b.head_local)],
            }
    shoulder_l = bl_util.bone_world(rig, "upperarm_l")
    shoulder_r = bl_util.bone_world(rig, "upperarm_r")
    return {
        "height_m": round(float(co[:, 2].max() - co[:, 2].min()), 4),
        "vertices": len(body.data.vertices),
        "faces": len(body.data.polygons),
        "triangles_after_triangulation": int(sum(len(p.vertices) - 2 for p in body.data.polygons)),
        "shoulder_joint_distance_m": round((shoulder_l - shoulder_r).length, 4),
        "upper_arm_length_m": round(rig.data.bones["upperarm_l"].length, 4),
        "forearm_length_m": round(rig.data.bones["lowerarm_l"].length, 4),
        "thigh_length_m": round(rig.data.bones["thigh_l"].length, 4),
        "shank_length_m": round(rig.data.bones["calf_l"].length, 4),
        "max_left_right_asymmetry_m": _asymmetry(co),
        "deform_bone_count": len(bones),
        "bones": bones,
    }


def _asymmetry(co: np.ndarray) -> float:
    """Largest distance between a vertex mirrored across x = 0 and the
    nearest real vertex; 0 means the mesh is exactly left-right symmetric."""
    from mathutils.kdtree import KDTree

    tree = KDTree(len(co))
    for i, c in enumerate(co):
        tree.insert(c, i)
    tree.balance()
    worst = 0.0
    for c in co[co[:, 0] > 1e-6]:
        worst = max(worst, tree.find((-c[0], c[1], c[2]))[2])
    return round(float(worst), 6)
