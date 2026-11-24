"""Character 005 body = the sculpt itself below the neck + MakeHuman's head and neck
(Kiệt 23/11: "cứ theo bạn đề xuất"; the fitted MakeHuman surface lost the abdominal
rows and folded under the chest).

The fitted MakeHuman body (sculpt_fit) is the DONOR: posed in the sculpt's
T-pose it lies on the sculpt, so it can hand over, by proximity, everything the
pipeline keys on (vertex groups = rig weights and MakeHuman's named groups, and
MakeHuman's UV layout for the muscle atlas, fibre maps and normal maps):

1. pose the rig like the sculpt and take the donor's posed surface;
2. graft mesh: the sculpt below the base of its neck + the donor's head and neck
   above the base of its neck, bridged and relaxed (the graft Kiệt saw on 23/11);
3. transfer vertex groups and UVs from the donor (nearest face, interpolated);
4. take the graft back to the rest (A) pose by inverting each vertex's
   linear-blend skinning matrix, then it replaces the body mesh.
"""
from __future__ import annotations

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

from . import bl_util, config, sculpt_fit


def _coords(o) -> np.ndarray:
    return np.array([tuple(o.matrix_world @ v.co) for v in o.data.vertices])


def _cut(o, z: float, keep_above: bool) -> None:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1),
                           clear_outer=not keep_above, clear_inner=keep_above)
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()


def unskin(points: np.ndarray, obj: bpy.types.Object, rig: bpy.types.Object, mask: np.ndarray | None = None) -> np.ndarray:
    """Rest positions for posed ``points`` of ``obj``'s vertices (linear blend skinning inverse)."""
    deform = {b.name: b for b in rig.data.bones if b.use_deform}
    skin = {n: np.array(rig.matrix_world @ rig.pose.bones[n].matrix @ b.matrix_local.inverted() @ rig.matrix_world.inverted())
            for n, b in deform.items()}
    gname = {g.index: g.name for g in obj.vertex_groups}
    out = points.copy()
    for i, v in enumerate(obj.data.vertices):
        if mask is not None and not mask[i]:
            continue
        m = np.zeros((4, 4))
        tot = 0.0
        for g in v.groups:
            n = gname.get(g.group)
            if n in skin and g.weight > 0:
                m += g.weight * skin[n]
                tot += g.weight
        if tot > 1e-6:
            out[i] = np.linalg.solve(m / tot, np.append(points[i], 1.0))[:3]
    return out


def _edit_mode(rig: bpy.types.Object) -> None:
    """Edit mode on the armature (a temp_override alone did not switch it, 23/11)."""
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    rig.hide_set(False)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")


def _neck_centre(co: np.ndarray, z: float) -> np.ndarray:
    s_ = co[np.abs(co[:, 2] - z) < 0.004]
    s_ = s_[np.abs(s_[:, 0]) < 0.15]
    c = s_.mean(axis=0)
    c[2] = z
    return c


def _align_head(body: bpy.types.Object, rig: bpy.types.Object, tco: np.ndarray, gc: dict) -> list:
    """Moves MakeHuman's head and neck (mesh AND neck/head bones) so its narrowest neck sits on the
    sculpt's (Kiệt 23/11: side view showed a long neck with a kink; the sculpt's neck is ~3 cm lower
    and further back). The mesh shift fades out down the neck; the neck bone's base moves half."""
    co = bl_util.mesh_coords(body.data).astype(float)
    top_b, top_t = float(co[:, 2].max()), float(tco[:, 2].max())
    zb = sculpt_fit._neck_z(co, top_b - 0.32, top_b - 0.16)
    zt = sculpt_fit._neck_z(tco, top_t - 0.32, top_t - 0.15)
    d = _neck_centre(tco, zt) - _neck_centre(co, zb)
    d[0] = 0.0
    d[2] *= gc.get("align_vertical_fraction", 1.0)   # 23/11: the full 3 cm left almost no neck
    lo = zb - gc.get("align_fade_m", 0.08)
    w = np.clip((co[:, 2] - lo) / (zb - lo), 0.0, 1.0)
    w = w * w * (3 - 2 * w)
    bl_util.set_mesh_coords(body.data, (co + w[:, None] * d).astype(np.float32))
    body.data.update()
    dv = Vector(d)
    neck = gc.get("neck_bone", "neck_01")
    _edit_mode(rig)
    if True:
        eb = rig.data.edit_bones
        if neck in eb:
            moved = {neck}
            stack = [neck]
            while stack:
                for ch in eb[stack.pop()].children:
                    moved.add(ch.name)
                    stack.append(ch.name)
            for n in moved:
                b = eb[n]
                b.head = b.head + (dv * 0.5 if n == neck else dv)
                b.tail = b.tail + dv
        bpy.ops.object.mode_set(mode="OBJECT")
    return [round(float(x), 4) for x in d]


def _smooth_weights(obj: bpy.types.Object, rig: bpy.types.Object, head_cut: float, passes: int) -> None:
    deform = [b.name for b in rig.data.bones if b.use_deform]
    names = [n for n in deform if n in obj.vertex_groups]
    if not names or passes <= 0:
        return
    me = obj.data
    n = len(me.vertices)
    col = {obj.vertex_groups[nm].index: j for j, nm in enumerate(names)}
    W = np.zeros((n, len(names)))
    for v in me.vertices:
        for g in v.groups:
            j = col.get(g.group)
            if j is not None:
                W[v.index, j] = g.weight
    ev = np.array([e.vertices[:] for e in me.edges])
    z = np.array([v.co.z for v in me.vertices])
    free = z < head_cut - 0.01
    deg = np.bincount(ev.ravel(), minlength=n).astype(float)
    for _ in range(passes):
        acc = np.zeros_like(W)
        np.add.at(acc, ev[:, 0], W[ev[:, 1]])
        np.add.at(acc, ev[:, 1], W[ev[:, 0]])
        avg = acc / np.maximum(deg, 1)[:, None]
        W[free] = 0.5 * W[free] + 0.5 * avg[free]
    W /= np.maximum(W.sum(axis=1, keepdims=True), 1e-9)
    for j, nm in enumerate(names):
        g = obj.vertex_groups[nm]
        idx = np.flatnonzero(W[:, j] > 1e-4)
        g.remove(list(range(n)))
        for i in idx:
            g.add([int(i)], float(W[i, j]), "REPLACE")


def _uv_array(me) -> np.ndarray:
    a = np.zeros(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get("uv", a)
    return a.reshape(-1, 2)


def _pack_head_uv(body_part: bpy.types.Object, head: bpy.types.Object, res: int = 256, margin: float = 0.01) -> None:
    """UVs: the sculpt keeps its own layout (23/11: UVs transferred from MakeHuman by proximity broke
    across islands and scrambled the muscle atlas); MakeHuman's head islands are scaled into the largest
    empty square of the sculpt's layout (the sculpt's own head island was cut away). Both layers get
    the same name so ``join`` merges them."""
    bme, hme = body_part.data, head.data
    name = "UVMap"
    bme.uv_layers.active.name = name
    for extra in list(hme.uv_layers)[1:]:
        hme.uv_layers.remove(extra)
    hme.uv_layers[0].name = name
    buv = _uv_array(bme)
    size, r, c = _largest_empty_square(_uv_occupancy(buv, bme.polygons, res))
    side = size / res - 2 * margin
    origin = np.array([(c - size + 1) / res + margin, (r - size + 1) / res + margin])
    huv = _uv_array(hme)
    lo, hi = huv.min(0), huv.max(0)
    k = side / max(float((hi - lo).max()), 1e-6)
    new = (huv - lo) * k + origin
    hme.uv_layers.active.data.foreach_set("uv", new.ravel())


def _uv_occupancy(uv: np.ndarray, polys, res: int) -> np.ndarray:
    occ = np.zeros((res, res), bool)
    for poly in polys:
        u = uv[list(poly.loop_indices)]
        c0, r0 = np.floor(u.min(0) * res).astype(int)
        c1, r1 = np.ceil(u.max(0) * res).astype(int)
        occ[max(r0, 0):min(r1 + 1, res), max(c0, 0):min(c1 + 1, res)] = True
    return occ


def _largest_empty_square(occ: np.ndarray) -> tuple[int, int, int]:
    res = occ.shape[0]
    dp = np.zeros((res + 1, res + 1), int)
    best = (0, 0, 0)
    for r in range(res):
        for c in range(res):
            if not occ[r, c]:
                dp[r + 1, c + 1] = 1 + min(dp[r, c + 1], dp[r + 1, c], dp[r, c])
                if dp[r + 1, c + 1] > best[0]:
                    best = (dp[r + 1, c + 1], r, c)
    return best


def _strip_uv_for_bridge(me, body_cut: float, head_cut: float, verts_before: int, res: int = 256, margin: float = 0.01) -> int:
    """24/11: ``bridge_edge_loops`` interpolates UVs between the sculpt's neck loop and the packed head
    island, so the bridge faces spanned half the atlas and the muscle bake painted neck labels over the
    back. The bridge faces get their own strip instead (angle around the neck x height) in the largest
    empty square left in the layout. With ``number_cuts`` > 0 every bridge face touches one of the
    vertices the bridge added (indices from ``verts_before``); face attributes do not work for this,
    the bridge copies them from the neighbouring faces."""
    is_new = [any(v >= verts_before for v in p.vertices) for p in me.polygons]
    new = [p for p in me.polygons if is_new[p.index]]
    if not new:
        return 0
    uv = _uv_array(me)
    size, r, c = _largest_empty_square(_uv_occupancy(uv, [p for p in me.polygons if not is_new[p.index]], res))
    side = size / res - 2 * margin
    origin = np.array([(c - size + 1) / res + margin, (r - size + 1) / res + margin])
    co = np.array([tuple(v.co) for v in me.vertices])
    ids = sorted({i for p in new for i in p.vertices})
    centre = co[ids, :2].mean(0)
    span = max(head_cut - body_cut, 1e-6)
    for p in new:
        loops = list(p.loop_indices)
        vs = [me.loops[li].vertex_index for li in loops]
        a = (np.arctan2(co[vs, 1] - centre[1], co[vs, 0] - centre[0]) + np.pi) / (2 * np.pi)
        if np.ptp(a) > 0.5:
            a = np.where(a < 0.5, a + 1.0, a)
        h = np.clip((co[vs, 2] - body_cut) / span, -0.2, 1.2)
        for li, au, hv in zip(loops, a, h):
            uv[li] = origin + np.array([au / 1.1, 0.05 + 0.3 * hv]) * side
    me.uv_layers.active.data.foreach_set("uv", uv.ravel())
    return len(new)


def replace_with_graft(body: bpy.types.Object, rig: bpy.types.Object, cfg: dict) -> dict:
    gc = cfg.get("graft") or {}
    if not gc.get("enabled"):
        return {}
    sf = cfg["sculpt_fit"]
    scene = bpy.context.scene
    rest = bl_util.mesh_coords(body.data).astype(float)
    target = sculpt_fit._load(config.ROOT / sf["source_blend"], sf["object"])
    tco = _coords(target)
    k = float(np.ptp(rest[:, 2])) * sf.get("height_ratio", 1.0) / float(np.ptp(tco[:, 2]))
    target.data.transform(Matrix.Scale(k, 4))
    tco = np.array([tuple(v.co) for v in target.data.vertices])
    target.data.transform(Matrix.Translation(sculpt_fit.align_offset(rest, tco)))
    target.matrix_world = Matrix.Identity(4)
    shift = _align_head(body, rig, np.array([tuple(v.co) for v in target.data.vertices]), gc)
    rest = bl_util.mesh_coords(body.data).astype(float)
    sculpt_fit._pose_like_sculpt(rig, np.array([tuple(v.co) for v in target.data.vertices]), sf["bones"])

    # 1. donor: the posed fitted body, with its groups and UVs
    dg = bpy.context.evaluated_depsgraph_get()
    donor_mesh = bpy.data.meshes.new_from_object(body.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    donor = bpy.data.objects.new("GraftDonor", donor_mesh)
    scene.collection.objects.link(donor)
    for g in body.vertex_groups:
        if g.name not in donor.vertex_groups:
            donor.vertex_groups.new(name=g.name)
    dco = _coords(donor)

    # 2. graft: sculpt below its neck base + donor head/neck above the donor's neck base
    t_all = np.array([tuple(v.co) for v in target.data.vertices])
    top = float(t_all[:, 2].max())
    s_neck = sculpt_fit._neck_z(t_all, top - 0.32, top - 0.15)
    d_neck = sculpt_fit._neck_z(dco, float(dco[:, 2].max()) - 0.32, float(dco[:, 2].max()) - 0.16)
    body_cut = s_neck - gc.get("sculpt_cut_below_neck_m", 0.065)
    head_cut = d_neck - gc.get("head_cut_below_neck_m", 0.035)
    head = bpy.data.objects.new("GraftHead", donor_mesh.copy())
    scene.collection.objects.link(head)
    _cut(target, body_cut, keep_above=False)
    _cut(head, head_cut, keep_above=True)
    for o in (target, head):
        o.data.materials.clear()
    _pack_head_uv(target, head)
    bpy.ops.object.select_all(action="DESELECT")
    head.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    graft = target
    me = graft.data
    bm = bmesh.new()
    bm.from_mesh(me)
    sel = set()
    for e in bm.edges:
        if e.is_boundary:
            zc = 0.5 * (e.verts[0].co.z + e.verts[1].co.z)
            if abs(zc - body_cut) < 0.004 or abs(zc - head_cut) < 0.004:
                sel.update(v.index for v in e.verts)
    bm.free()
    for v in me.vertices:
        v.select = v.index in sel
    for e in me.edges:
        e.select = all(i in sel for i in e.vertices)
    for f in me.polygons:
        f.select = False
    verts_before = len(me.vertices)
    with bpy.context.temp_override(object=graft, active_object=graft):
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_mode(type="EDGE")
        bpy.ops.mesh.bridge_edge_loops(type="SINGLE", use_merge=False, number_cuts=4, interpolation="SURFACE", smoothness=1.0)
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    bm = bmesh.new()
    bm.from_mesh(me)
    inner = [v for v in bm.verts if body_cut - 0.004 < v.co.z < head_cut + 0.012]
    outer = [v for v in bm.verts if body_cut - 0.03 < v.co.z <= body_cut - 0.004]
    for it in range(60):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        if it % 3 == 0:
            bmesh.ops.smooth_vert(bm, verts=outer, factor=0.2, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.update()
    boundary = sum(1 for e in bmesh_edges_boundary(me))
    bridge_faces = _strip_uv_for_bridge(me, body_cut, head_cut, verts_before)

    # 3. vertex groups and UVs from the donor
    for g in donor.vertex_groups:
        if g.name not in graft.vertex_groups:
            graft.vertex_groups.new(name=g.name)
    mod = graft.modifiers.new("transfer", "DATA_TRANSFER")
    mod.object = donor
    mod.use_vert_data = True
    mod.data_types_verts = {"VGROUP_WEIGHTS"}
    mod.vert_mapping = "POLYINTERP_NEAREST"
    mod.layers_vgroup_select_src = "ALL"
    mod.layers_vgroup_select_dst = "NAME"
    with bpy.context.temp_override(object=graft, active_object=graft):
        bpy.ops.object.modifier_apply(modifier=mod.name)

    # 3b. smooth the transferred bone weights (23/11: they change abruptly where MakeHuman's elbow sits
    # off the sculpt's, which left a ring on the forearm once unposed); the head keeps its own.
    _smooth_weights(graft, rig, head_cut, gc.get("weight_smooth_passes", 8))

    # 4. back to rest, then replace the body mesh
    posed = np.array([tuple(v.co) for v in me.vertices])
    rest_g = unskin(posed, graft, rig)
    bl_util.set_mesh_coords(me, rest_g.astype(np.float32))
    me.update()
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    old = body.data
    mats = list(old.materials)
    graft_mesh = graft.data
    for m in mats:
        graft_mesh.materials.append(m)
    body.data = graft_mesh
    graft_mesh.name = old.name
    for o in (graft, donor):
        bpy.data.objects.remove(o)
    bpy.data.meshes.remove(old)
    bpy.data.meshes.remove(donor_mesh)
    return {"graft": {"vertices": len(graft_mesh.vertices), "head_shift_m": shift, "sculpt_neck_z": round(s_neck, 4), "head_neck_z": round(d_neck, 4),
                      "body_cut_z": round(body_cut, 4), "head_cut_z": round(head_cut, 4), "boundary_edges": boundary,
                      "bridge_faces": bridge_faces}}


def bmesh_edges_boundary(me):
    bm = bmesh.new()
    bm.from_mesh(me)
    out = [e.index for e in bm.edges if e.is_boundary]
    bm.free()
    return out


def _centreline(co: np.ndarray, w: np.ndarray, a: np.ndarray, b: np.ndarray, s_lo=0.2, s_hi=0.8, n=9):
    """Line through the centroids of cross-sections of the limb segment a->b (vertices with weight
    w > 0.5 on the segment's bones): (point, unit direction)."""
    ax = (b - a) / np.linalg.norm(b - a)
    L = float(np.linalg.norm(b - a))
    sel = co[w > 0.5]
    t = (sel - a) @ ax / L
    cents = []
    for s in np.linspace(s_lo, s_hi, n):
        m = np.abs(t - s) < 0.04
        if m.sum() > 12:
            cents.append(sel[m].mean(0))
    c = np.array(cents)
    mid = c.mean(0)
    d = np.linalg.svd(c - mid)[2][0]
    if d @ ax < 0:
        d = -d
    return mid, d


def _closest_on_line(p: np.ndarray, line) -> np.ndarray:
    o, d = line
    return o + d * float((p - o) @ d)


def _closest_between(l1, l2) -> np.ndarray:
    (o1, d1), (o2, d2) = l1, l2
    w0 = o1 - o2
    a, b, c, dd, e = d1 @ d1, d1 @ d2, d2 @ d2, d1 @ w0, d2 @ w0
    den = a * c - b * b
    if abs(den) < 1e-9:
        return 0.5 * (o1 + o2)
    s = (b * e - c * dd) / den
    t = (a * e - b * dd) / den
    return 0.5 * ((o1 + d1 * s) + (o2 + d2 * t))


def recentre_limb_joints(body: bpy.types.Object, rig: bpy.types.Object, cfg: dict) -> dict:
    """Moves the limb joints onto the centre lines of the graft's limbs (23/11: aiming MakeHuman's
    bones along the sculpt's limbs rotated them about MakeHuman's shoulders, so the bodybuilder's
    arms sat 5-9 cm off their bones; the muscle charts and the skinning both need the bone inside the
    limb). The mesh does not move; bones in each segment shift with their segment."""
    gc = cfg.get("graft") or {}
    if not gc.get("enabled"):
        return {}
    co = bl_util.mesh_coords(body.data).astype(float)
    def gw(names):
        return bl_util.group_weights(body, [n for n in names if n in body.vertex_groups]).sum(axis=1)
    out = {}
    chains = [("arm", ["upperarm", "lowerarm", "hand"], ["upperarm", "upperarm_twist"], ["lowerarm", "lowerarm_twist"]),
              ("leg", ["thigh", "calf", "foot"], ["thigh", "thigh_twist"], ["calf"])]
    _edit_mode(rig)
    if True:
        eb = rig.data.edit_bones
        for side in ("l", "r"):
            for kind, (b0, b1, b2), seg1, seg2 in chains:
                n0, n1, n2 = (f"{x}_{side}" for x in (b0, b1, b2))
                if not all(n in eb for n in (n0, n1, n2)):
                    continue
                J0, J1, J2 = (np.array(eb[n].head) for n in (n0, n1, n2))
                l1 = _centreline(co, gw([f"{x}_{side}" for x in seg1]), J0, J1)
                l2 = _centreline(co, gw([f"{x}_{side}" for x in seg2]), J1, J2)
                N0 = _closest_on_line(J0, l1)
                # the old joint projected onto both segment lines (their intersection slides along
                # the limb when it is nearly straight: 23/11 it moved the knee up 12 cm)
                N1 = 0.5 * (_closest_on_line(J1, l1) + _closest_on_line(J1, l2))
                N2 = _closest_on_line(J2, l2)
                d0, d1, d2 = N0 - J0, N1 - J1, N2 - J2
                # every bone under the chain root moves with the segment it sits in
                root = eb[n0]
                for b in [root] + list(root.children_recursive):
                    for end in ("head", "tail"):
                        p = np.array(getattr(b, end))
                        def seg_delta(p):
                            for (A, B, dA, dB) in ((J0, J1, d0, d1), (J1, J2, d1, d2)):
                                ab = B - A
                                t = float((p - A) @ ab / (ab @ ab))
                                if -0.05 <= t <= 1.05:
                                    t = min(max(t, 0.0), 1.0)
                                    return dA + (dB - dA) * t
                            return d2  # hand / foot and fingers / toes
                        setattr(b, end, Vector(p + seg_delta(p)))
                out[f"{kind}_{side}_shift_cm"] = [round(float(np.linalg.norm(x)) * 100, 1) for x in (d0, d1, d2)]
        bpy.ops.object.mode_set(mode="OBJECT")
    return {"recentre_joints": out}
