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

import json

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


def _smooth_weights(obj: bpy.types.Object, rig: bpy.types.Object, head_cut: float, passes: int,
                    fixed: np.ndarray | None = None) -> None:
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
    if fixed is not None:
        free &= ~fixed
    deg =np.bincount(ev.ravel(), minlength=n).astype(float)
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


def fair_neck(co: np.ndarray, edges: np.ndarray, z_lo: float, z_hi: float, fade: float = 0.02, iters: int = 3000,
              alpha: float = 0.1, max_r: float = 0.13) -> np.ndarray:
    """24/11 (Kiệt: "phần nối chỗ cổ bị lỗi nhiều", then "còn khấc ở cổ trông không liền mạch"): the
    bridge joined MakeHuman's slim neck to the sculpt's heavy trapezius with a ring and a step.
    Bi-Laplacian fairing of the band between the cuts (free weight fades out over ``fade`` above and
    below and beyond ``max_r`` from the neck axis): the band becomes the smoothest surface that meets
    the fixed parts with the same position AND slope, so the step goes, not only the ripples (Taubin
    smoothing removed the ring but left the step). Rest-pose coordinates."""
    co = co.copy()
    n = len(co)
    band = (co[:, 2] > z_lo) & (co[:, 2] < z_hi)
    axis = co[band][:, :2].mean(0)
    r = np.hypot(co[:, 0] - axis[0], co[:, 1] - axis[1])
    w = np.clip(np.minimum((co[:, 2] - (z_lo - fade)) / fade, ((z_hi + fade) - co[:, 2]) / fade), 0.0, 1.0)
    w *= np.clip((max_r - r) / 0.02, 0.0, 1.0)
    keep = w > 0
    for _ in range(3):  # the fixed rings the fairing leans on
        m = keep[edges[:, 0]] | keep[edges[:, 1]]
        keep[edges[m].ravel()] = True
    ids = np.flatnonzero(keep)
    loc = -np.ones(n, int)
    loc[ids] = np.arange(len(ids))
    e = loc[edges[keep[edges[:, 0]] & keep[edges[:, 1]]]]
    k = len(ids)
    a = np.concatenate([e[:, 0], e[:, 1]])
    b = np.concatenate([e[:, 1], e[:, 0]])
    deg = np.maximum(np.bincount(a, minlength=k), 1).astype(float)[:, None]

    def lap(x):
        return np.stack([np.bincount(a, weights=x[b, c], minlength=k) for c in range(3)], 1) / deg - x
    x = co[ids]
    wf = w[ids][:, None]
    for _ in range(iters):
        x -= alpha * wf * lap(lap(x))
    co[ids] = x
    return co


def fair_band(co: np.ndarray, edges: np.ndarray, w: np.ndarray, iters: int = 2000, alpha: float = 0.1) -> np.ndarray:
    """Bi-Laplacian fairing of vertices with free weight ``w`` (0..1), the rest held fixed (see
    ``fair_neck``); used for the wrist and ankle bridges."""
    co = co.copy()
    n = len(co)
    keep = w > 0
    for _ in range(3):
        m = keep[edges[:, 0]] | keep[edges[:, 1]]
        keep[edges[m].ravel()] = True
    ids = np.flatnonzero(keep)
    if not len(ids):
        return co
    loc = -np.ones(n, int)
    loc[ids] = np.arange(len(ids))
    e = loc[edges[keep[edges[:, 0]] & keep[edges[:, 1]]]]
    k = len(ids)
    a = np.concatenate([e[:, 0], e[:, 1]])
    b = np.concatenate([e[:, 1], e[:, 0]])
    deg = np.maximum(np.bincount(a, minlength=k), 1).astype(float)[:, None]

    def lap(x):
        return np.stack([np.bincount(a, weights=x[b, c], minlength=k) for c in range(3)], 1) / deg - x
    x = co[ids]
    wf = w[ids][:, None]
    for _ in range(iters):
        x -= alpha * wf * lap(lap(x))
    co[ids] = x
    return co


def smooth_joint_weights(body: bpy.types.Object, rig: bpy.types.Object, cfg: dict) -> dict:
    """24/11: in the sculpt's dense armpit and shoulder folds, neighbours 1-2 mm apart carried
    weights that differ by 0.4 (scapula vs spine_03, plus the helper bones), so with the arms
    overhead those edges stretched 25x (shoulder press QA skin_stretch p99.9 6.05 > 2.6). Edge
    (Laplacian) smoothing barely moves weights on such a dense mesh; this averages every deform
    weight over a sphere (Gaussian, ``radius_m``) inside a box around both shoulders, after the
    helper bones exist."""
    sc = (cfg.get("graft") or {}).get("joint_weight_smooth") or {}
    if not (cfg.get("graft") or {}).get("enabled") or not sc.get("enabled"):
        return {}
    from mathutils import kdtree
    me = body.data
    n = len(me.vertices)
    co = bl_util.mesh_coords(me).astype(float)
    names = [b.name for b in rig.data.bones if b.use_deform and b.name in body.vertex_groups]
    col = {body.vertex_groups[nm].index: j for j, nm in enumerate(names)}
    W = np.zeros((n, len(names)))
    for v in me.vertices:
        for g in v.groups:
            j = col.get(g.group)
            if j is not None:
                W[v.index, j] = g.weight
    z0, z1 = sc.get("z_range_m", [1.10, 1.57])
    x1 = sc.get("max_abs_x_m", 0.34)
    fade = sc.get("fade_m", 0.05)
    ax, z = np.abs(co[:, 0]), co[:, 2]
    r = np.clip(np.minimum.reduce([(z - z0) / fade, (z1 - z) / fade, (x1 - ax) / fade]), 0.0, 1.0)
    # 24/11 (Kiệt: "dáng chân hơi kì"): seated, the groin bulged into lumps beside the shorts and the
    # knees went knobby; same smoothing in spheres round the hip and knee joints (rest pose).
    for jr in sc.get("joint_regions", []):
        for side in ("l", "r"):
            b = rig.data.bones.get(f"{jr['bone']}_{side}")
            if b is None:
                continue
            c = np.array(rig.matrix_world @ b.head_local)
            d = np.linalg.norm(co - c, axis=1)
            r = np.maximum(r, np.clip((jr["radius_m"] - d) / fade, 0.0, 1.0))
    rad = float(sc.get("radius_m", 0.04))
    out = W.copy()
    sel = np.flatnonzero(r > 0.0)
    if sc.get("geodesic", True):
        # 24/11 (Kiệt: "tay kì vậy", "cơ liên sườn còn dính vào cơ ngực"): a straight-line radius
        # reached across the armpit gap (the inner upper arm lies 3-5 cm from the ribs in the rest
        # A-pose), so a third of the upper arm's weight became spine / scapula / clavicle: raised, the
        # upper arm lost 20-30 % of its radius and the side of the ribs was dragged into one web
        # with the pectoral. Neighbours are now found ALONG THE SKIN (bounded Dijkstra on the edge
        # graph), which never jumps a gap between two surfaces.
        import heapq
        edges = np.array([e.vertices[:] for e in me.edges])
        elen = np.linalg.norm(co[edges[:, 0]] - co[edges[:, 1]], axis=1)
        adj = [[] for _ in range(n)]
        for (a_, b_), l_ in zip(edges.tolist(), elen.tolist()):
            adj[a_].append((b_, l_))
            adj[b_].append((a_, l_))
        for i in sel:
            dist = {int(i): 0.0}
            heap = [(0.0, int(i))]
            while heap:
                d0, u = heapq.heappop(heap)
                if d0 > dist.get(u, 1e9):
                    continue
                for v_, l_ in adj[u]:
                    nd = d0 + l_
                    if nd <= rad and nd < dist.get(v_, 1e9):
                        dist[v_] = nd
                        heapq.heappush(heap, (nd, v_))
            idx = np.fromiter(dist.keys(), int)
            d = np.fromiter(dist.values(), float)
            g = np.exp(-(d / (0.5 * rad)) ** 2)
            out[i] = (1.0 - r[i]) * W[i] + r[i] * (g[:, None] * W[idx]).sum(0) / g.sum()
    else:
        kd = kdtree.KDTree(n)
        for i, c in enumerate(co):
            kd.insert(c, i)
        kd.balance()
        for i in sel:
            hits = kd.find_range(co[i], rad)
            idx = np.fromiter((h[1] for h in hits), int)
            d = np.fromiter((h[2] for h in hits), float)
            # never across the midline (inner thighs lie 2-3 cm apart at the crotch)
            same = (co[idx, 0] * co[i, 0] >= 0.0) | (np.abs(co[idx, 0]) < 0.01) | (abs(co[i, 0]) < 0.01)
            idx, d = idx[same], d[same]
            g = np.exp(-(d / (0.5 * rad)) ** 2)
            out[i] = (1.0 - r[i]) * W[i] + r[i] * (g[:, None] * W[idx]).sum(0) / g.sum()
    out /= np.maximum(out.sum(axis=1, keepdims=True), 1e-9)
    for j, nm in enumerate(names):
        g = body.vertex_groups[nm]
        g.remove(list(range(n)))
        for i in np.flatnonzero(out[:, j] > 1e-4):
            g.add([int(i)], float(out[i, j]), "REPLACE")
    return {"joint_weight_smooth": {"vertices": int(len(sel)), "radius_m": rad}}


def torso_arm_falloff(body: bpy.types.Object, rig: bpy.types.Object, cfg: dict) -> dict:
    """24/11 (Kiệt, đẩy tạ vai: "gì giãn ghê vậy", "cơ liên sườn bị dính vào ngực"): skin of
    the flank down to the waist (z 1.05-1.25, 20-30 cm below the armpit) carried 15-47 %
    upper-arm / lat_fold weight, so with the arms overhead the whole flank was dragged up the
    arm: the torso flared into "wings", the upper arm looked half as long again with a seam
    across it. On a real body only the skin within ~10-15 cm of the armpit follows the arm.

    For vertices that belong to the TORSO (soft-classified: farther than ``arm_radius_m`` from
    the upper-arm bone, medial to the shoulder, below the armpit), the summed arm weight is
    capped by a cosine falloff from 1 at the armpit to 0 at ``depth_m`` below it; the removed
    weight goes to spine_03 / spine_02 by height. The classification is a smoothstep
    (``soft_m``), never a hard cut, then the weights in a sphere round each shoulder get
    ``laplace_iters`` of edge averaging: a hard boundary tore the posterior armpit into a
    jagged flap. Measured on the shoulder press (frame 53): skin stretch p99.9 3.13 -> 2.73,
    max 6.25 -> 5.03."""
    fc = (cfg.get("graft") or {}).get("torso_arm_falloff") or {}
    if not (cfg.get("graft") or {}).get("enabled") or not fc.get("enabled"):
        return {}
    me = body.data
    n = len(me.vertices)
    co = bl_util.mesh_coords(me).astype(float)
    mw = np.array(body.matrix_world)
    co = co @ mw[:3, :3].T + mw[:3, 3]
    names = [b.name for b in rig.data.bones if b.use_deform and b.name in body.vertex_groups]
    col = {body.vertex_groups[nm].index: j for j, nm in enumerate(names)}
    jx = {nm: j for j, nm in enumerate(names)}
    W = np.zeros((n, len(names)))
    for v in me.vertices:
        for g in v.groups:
            j = col.get(g.group)
            if j is not None:
                W[v.index, j] = g.weight
    depth = float(fc.get("depth_m", 0.12))
    r_arm = float(fc.get("arm_radius_m", 0.065))
    soft = float(fc.get("soft_m", 0.04))
    below_head = float(fc.get("armpit_below_shoulder_m", 0.10))

    def smooth01(x):
        x = np.clip(x, 0.0, 1.0)
        return x * x * (3.0 - 2.0 * x)

    changed = 0
    region = np.zeros(n, bool)
    for side, sign in (("l", 1.0), ("r", -1.0)):
        ua = rig.data.bones.get(f"upperarm_{side}")
        if ua is None:
            continue
        a = np.array(rig.matrix_world @ ua.head_local)
        b = np.array(rig.matrix_world @ ua.tail_local)
        ab = b - a
        t = np.clip(((co - a) @ ab) / (ab @ ab), 0.0, 1.0)
        d = np.linalg.norm(co - (a + t[:, None] * ab), axis=1)
        region |= np.linalg.norm(co - a, axis=1) < float(fc.get("smooth_radius_m", 0.20))
        arm_cols = [j for nm, j in jx.items() if nm.startswith(("upperarm", "lat_fold"))
                    and (nm.endswith(f"_{side}") or any(nm.endswith(f"_{side}_{k}") for k in "123"))]
        z_ax = a[2] - below_head
        torso_w = (smooth01((d - (r_arm - soft)) / (2.0 * soft))
                   * smooth01(((a[0] * sign + 0.02) - co[:, 0] * sign) / soft + 0.5)
                   * smooth01(((z_ax + 0.02) - co[:, 2]) / soft + 0.5)
                   * ((co[:, 0] * sign) > 0.02))
        below = np.clip((z_ax - co[:, 2]) / depth, 0.0, 1.0)
        allow = 1.0 - torso_w * (1.0 - 0.5 * (1.0 + np.cos(np.pi * below)))
        armw = W[:, arm_cols].sum(1)
        cap = allow * armw
        sel = np.flatnonzero((armw > 1e-4) & (cap < armw - 1e-4))
        for i in sel:
            removed = armw[i] - cap[i]
            W[i, arm_cols] *= cap[i] / armw[i]
            k3 = float(np.clip((co[i, 2] - 1.13) / 0.12, 0.0, 1.0))
            W[i, jx["spine_03"]] += removed * k3
            W[i, jx["spine_02"]] += removed * (1.0 - k3)
        changed += len(sel)
        # The converse (24/11, Kiệt: "tay kì vậy"): the sculpt's inner upper arm got a third of its
        # weight from MakeHuman's TORSO in the nearest-surface transfer (spine_03, scapula, clavicle,
        # chest/lat folds), so raised the upper arm lost 20-30 % of its radius. Inside the arm tube,
        # torso weight is allowed near the shoulder (deltoid rides the girdle) and fades to 0 down
        # the arm; it goes to the upper-arm chain in proportion to what is already there.
        if fc.get("arm_clean", True):
            tube = float(fc.get("arm_tube_m", 0.09))
            t0, t1 = fc.get("arm_clean_t", [0.12, 0.38])
            # soft in both directions: along the arm (t) and across the tube wall (d), so the
            # cleaned arm skin blends into the ribs instead of meeting them at a ridge
            tube_soft = float(fc.get("arm_tube_soft_m", 0.03))
            inside = 1.0 - smooth01((d - (tube - tube_soft)) / (2.0 * tube_soft))
            keep_torso = 1.0 - inside * smooth01((t - t0) / max(t1 - t0, 1e-6))
            in_tube = (inside > 1e-3) & (t > 0.0) & (t < 1.0) & ((co[:, 0] * sign) > 0.02)
            torso_cols = [j for nm, j in jx.items() if not nm.startswith(("upperarm", "lowerarm", "hand", "thumb", "index",
                                                                         "middle", "ring", "pinky", "elbow_fold"))]
            chain_cols = [j for nm, j in jx.items() if nm.startswith(("upperarm", "lowerarm", "elbow_fold"))
                          and (nm.endswith(f"_{side}") or any(nm.endswith(f"_{side}_{k}") for k in "123"))]
            for i in np.flatnonzero(in_tube & (keep_torso < 0.999)):
                tw = W[i, torso_cols].sum()
                if tw < 1e-4:
                    continue
                moved = tw * (1.0 - keep_torso[i])
                W[i, torso_cols] *= keep_torso[i]
                cw = W[i, chain_cols].sum()
                if cw > 1e-6:
                    W[i, chain_cols] += moved * W[i, chain_cols] / cw
                else:
                    W[i, jx[f"upperarm_{side}"]] += moved
    edges = np.array([e.vertices[:] for e in me.edges])
    deg = np.bincount(edges.ravel(), minlength=n).astype(float)
    for _ in range(int(fc.get("laplace_iters", 15))):
        acc = np.zeros_like(W)
        np.add.at(acc, edges[:, 0], W[edges[:, 1]])
        np.add.at(acc, edges[:, 1], W[edges[:, 0]])
        W[region] = 0.5 * W[region] + 0.5 * (acc[region] / np.maximum(deg[region], 1.0)[:, None])
    W /= np.maximum(W.sum(axis=1, keepdims=True), 1e-9)
    for j, nm in enumerate(names):
        g = body.vertex_groups[nm]
        g.remove(list(range(n)))
        for i in np.flatnonzero(W[:, j] > 1e-4):
            g.add([int(i)], float(W[i, j]), "REPLACE")
    return {"torso_arm_falloff": {"vertices": int(changed), "depth_m": depth, "arm_radius_m": r_arm, "soft_m": soft}}


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
    ext = _graft_extremities(graft, donor_mesh, rig, gc, donor=donor)
    planes = ext.pop("_planes", [])
    me = graft.data

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
    if "_graft_part" in graft.vertex_groups:
        # the grafted hands / feet keep the weights they were copied with (they were slid off the
        # donor's surface, so a nearest-surface transfer would read the wrong part of it)
        mod.vertex_group = "_graft_part"
        mod.invert_vertex_group = True
    with bpy.context.temp_override(object=graft, active_object=graft):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if "_graft_part" in graft.vertex_groups:
        graft.vertex_groups.remove(graft.vertex_groups["_graft_part"])
    # the slide of each hand / foot, in the rest frame of its bone, for recentre_limb_joints
    shifts = {}
    for p in planes:
        pb = rig.pose.bones.get(f"{p['kind']}_{p['side']}")
        if pb is None:
            continue
        r = (pb.matrix.to_3x3() @ pb.bone.matrix_local.to_3x3().inverted())
        shifts[f"{p['kind']}_{p['side']}"] = list(r.inverted() @ Vector(p["shift"].tolist()))
    rig["extremity_shift"] = json.dumps(shifts)

    # 3b. smooth the transferred bone weights (23/11: they change abruptly where MakeHuman's elbow sits
    # off the sculpt's, which left a ring on the forearm once unposed); the head keeps its own.
    # MakeHuman's hands and feet keep their own finger / toe weights (an edge Laplace would blur
    # each knuckle's weight along the finger).
    gco = np.array([tuple(v.co) for v in me.vertices])
    keep = np.zeros(len(gco), bool)
    for p in planes:
        keep |= _side_mask(gco, p) & (((gco - p["donor"]) @ p["n"]) > 0.01)
    _smooth_weights(graft, rig, head_cut, gc.get("weight_smooth_passes", 8), fixed=keep)

    # 4. back to rest, then replace the body mesh
    posed = np.array([tuple(v.co) for v in me.vertices])
    rest_g = unskin(posed, graft, rig)
    nf = gc.get("neck_fair") or {}
    if nf.get("enabled", True):
        rest_g = fair_neck(rest_g, np.array([e.vertices[:] for e in me.edges]), body_cut - nf.get("below_m", 0.05),
                           head_cut + nf.get("above_m", 0.05), iters=nf.get("iterations", 3000))
    # wrist / ankle bridges: fair the band in rest pose (masks from the posed positions; same indices)
    ec = gc.get("extremities") or {}
    if planes:
        ew = np.zeros(len(posed))
        reach = float(ec.get("fair_reach_m", 0.03))
        for p in planes:
            h_s = (posed - p["sculpt"]) @ p["n"]
            h_d = (posed - p["donor"]) @ p["n"]
            band = np.clip(np.minimum((h_s + reach) / reach, (reach - h_d) / reach), 0.0, 1.0)
            ew = np.maximum(ew, band * _side_mask(posed, p))
        rest_g = fair_band(rest_g, np.array([e.vertices[:] for e in me.edges]), ew, iters=int(ec.get("fair_iterations", 2000)))
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
                      "bridge_faces": bridge_faces, **ext}}


EXTREMITIES = (("hand", "lowerarm", "hand"), ("foot", "calf", "foot"))


def _extremity_planes(rig: bpy.types.Object, ec: dict) -> list[dict]:
    """Cut planes at the wrists and ankles of the POSED rig (sculpt pose). ``n`` points away from
    the body (forearm / shin direction); the donor keeps what lies beyond ``donor`` along ``n``,
    the sculpt keeps what lies before ``sculpt`` (a ``gap_m`` band between them is bridged)."""
    out = []
    mw = rig.matrix_world
    for kind, parent, child in EXTREMITIES:
        c = ec.get(kind) or {}
        if not c.get("enabled", True):
            continue
        for side in ("l", "r"):
            pp, pc = rig.pose.bones.get(f"{parent}_{side}"), rig.pose.bones.get(f"{child}_{side}")
            if pp is None or pc is None:
                continue
            j = np.array(mw @ pc.head)
            n = j - np.array(mw @ pp.head)
            n /= np.linalg.norm(n)
            donor = j - n * float(c.get("donor_above_joint_m", 0.01))
            sculpt = donor - n * float(c.get("gap_m", 0.025))
            out.append({"kind": kind, "side": side, "n": n, "donor": donor, "sculpt": sculpt, "sign": 1.0 if j[0] > 0 else -1.0})
    return out


def _side_mask(co: np.ndarray, p: dict) -> np.ndarray:
    return co[:, 0] * p["sign"] > 0.0


def _bisect_keep(o, p: dict, at: str, keep_beyond: bool) -> None:
    """Split ``o`` at plane ``p[at]`` and delete one side, but only on the extremity's own side
    of the body (a horizontal ankle plane would otherwise take both feet)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    co, no = Vector(p[at].tolist()), Vector(p["n"].tolist())
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
    kill = []
    for v in bm.verts:
        d = (v.co - co).dot(no)
        same = v.co.x * p["sign"] > 0.0
        beyond = d > 1e-6
        if keep_beyond:
            if not (same and d > -1e-6):
                kill.append(v)
        elif same and beyond:
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()


def _loop_centre(o, p: dict, at: str) -> np.ndarray | None:
    """Centre of the open boundary loop of ``o`` lying on plane ``p[at]`` (own side only)."""
    me = o.data
    co = np.array([tuple(v.co) for v in me.vertices])
    if not len(co):
        return None
    h = (co - p[at]) @ p["n"]
    bm = bmesh.new()
    bm.from_mesh(me)
    ids = {v.index for e in bm.edges if e.is_boundary for v in e.verts
           if abs(h[v.index]) < 0.003 and v.co.x * p["sign"] > 0}
    bm.free()
    return co[list(ids)].mean(0) if ids else None


def _graft_extremities(graft: bpy.types.Object, donor_mesh, rig: bpy.types.Object, gc: dict,
                       donor: bpy.types.Object | None = None) -> dict:
    """24/11 (Kiệt: "ngón tay bị cái gì vậy", "bàn chân nhìn cũng kì"): the CC-BY sculpt's hands
    and feet are blocky (sausage fingers, flat feet with no arch, no knuckles), and its fingers
    have no joints to grip with. Replace them with MakeHuman's from the posed, fitted donor, the
    way the head is grafted: cut both at the wrist / ankle, keep the donor beyond, bridge the
    two loops, fair the band, give the bridge its own UV strip."""
    ec = gc.get("extremities") or {}
    if not ec.get("enabled"):
        return {}
    scene = bpy.context.scene
    planes = _extremity_planes(rig, ec)
    report = []
    for p in planes:
        part = bpy.data.objects.new(f"Graft_{p['kind']}_{p['side']}", donor_mesh.copy())
        scene.collection.objects.link(part)
        _bisect_keep(part, p, "donor", keep_beyond=True)
        _bisect_keep(graft, p, "sculpt", keep_beyond=False)
        # 24/11 (Kiệt: "cổ tay bị gì vậy"): in the sculpt pose MakeHuman's hand sat 6 cm to the side
        # of the sculpt's forearm end (ankle 3.6 cm), and the 2.5 cm bridge bent sideways into an S.
        # Slide the part across the limb axis so its cut loop is centred on the sculpt's; it keeps
        # its own skin weights (copied from the donor mesh), and the hand / foot bones follow the
        # same slide in ``recentre_limb_joints`` (``rig["extremity_shift"]``).
        shift = np.zeros(3)
        if ec.get("align", True):
            cs, cd = _loop_centre(graft, p, "sculpt"), _loop_centre(part, p, "donor")
            if cs is not None and cd is not None:
                shift = cs - cd
                shift -= p["n"] * float(shift @ p["n"])
                part.data.transform(Matrix.Translation(Vector(shift.tolist())))
                p["donor"] = p["donor"] + shift
        p["shift"] = shift
        if donor is not None:
            for g in donor.vertex_groups:
                part.vertex_groups.new(name=g.name)
        mark = part.vertex_groups.new(name="_graft_part")
        mark.add(list(range(len(part.data.vertices))), 1.0, "REPLACE")
        part.data.materials.clear()
        _pack_head_uv(graft, part)
        bpy.ops.object.select_all(action="DESELECT")
        part.select_set(True)
        graft.select_set(True)
        bpy.context.view_layer.objects.active = graft
        bpy.ops.object.join()
        me = graft.data
        co = np.array([tuple(v.co) for v in me.vertices])
        dist_s = (co - p["sculpt"]) @ p["n"]
        dist_d = (co - p["donor"]) @ p["n"]
        side = _side_mask(co, p)
        bm = bmesh.new()
        bm.from_mesh(me)
        sel = set()
        for e in bm.edges:
            if e.is_boundary:
                a, b = (v.index for v in e.verts)
                if side[a] and side[b] and ((abs(dist_s[a]) < 0.003 and abs(dist_s[b]) < 0.003)
                                            or (abs(dist_d[a]) < 0.003 and abs(dist_d[b]) < 0.003)):
                    sel.update((a, b))
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
            bpy.ops.mesh.bridge_edge_loops(type="SINGLE", use_merge=False, number_cuts=3, interpolation="SURFACE", smoothness=1.0)
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.mesh.normals_make_consistent(inside=False)
            bpy.ops.object.mode_set(mode="OBJECT")
        # fair the band (and a little of both sides) so the two cross-sections blend
        bm = bmesh.new()
        bm.from_mesh(me)
        n = Vector(p["n"].tolist())
        s0, d0 = Vector(p["sculpt"].tolist()), Vector(p["donor"].tolist())
        inner = [v for v in bm.verts if v.co.x * p["sign"] > 0 and (v.co - s0).dot(n) > -0.002 and (v.co - d0).dot(n) < 0.006]
        outer = [v for v in bm.verts if v.co.x * p["sign"] > 0 and -0.025 < (v.co - s0).dot(n) <= -0.002]
        for it in range(40):
            bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
            if it % 3 == 0:
                bmesh.ops.smooth_vert(bm, verts=outer, factor=0.2, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        for f in bm.faces:
            f.smooth = True
        bm.to_mesh(me)
        bm.free()
        me.update()
        report.append({"part": f"{p['kind']}_{p['side']}", "loop_verts": len(sel),
                       "align_shift_cm": round(float(np.linalg.norm(p["shift"])) * 100, 1),
                       "bridge_faces": _strip_uv_axis(me, verts_before, p)})
    return {"extremities": report, "_planes": planes}


def _strip_uv_axis(me, verts_before: int, p: dict, res: int = 256, margin: float = 0.01) -> int:
    """Like ``_strip_uv_for_bridge`` for a bridge across an arbitrary axis (wrist, ankle)."""
    is_new = [any(v >= verts_before for v in poly.vertices) for poly in me.polygons]
    new = [poly for poly in me.polygons if is_new[poly.index]]
    if not new:
        return 0
    uv = _uv_array(me)
    size, r, c = _largest_empty_square(_uv_occupancy(uv, [poly for poly in me.polygons if not is_new[poly.index]], res))
    side = size / res - 2 * margin
    origin = np.array([(c - size + 1) / res + margin, (r - size + 1) / res + margin])
    co = np.array([tuple(v.co) for v in me.vertices])
    n = p["n"]
    u = np.cross(n, [0.0, 0.0, 1.0] if abs(n[2]) < 0.9 else [1.0, 0.0, 0.0])
    u /= np.linalg.norm(u)
    w = np.cross(n, u)
    span = float(np.dot(p["donor"] - p["sculpt"], n)) or 1e-6
    for poly in new:
        loops = list(poly.loop_indices)
        vs = [me.loops[li].vertex_index for li in loops]
        rel = co[vs] - p["sculpt"]
        a = (np.arctan2(rel @ w, rel @ u) + np.pi) / (2 * np.pi)
        if np.ptp(a) > 0.5:
            a = np.where(a < 0.5, a + 1.0, a)
        h = np.clip((rel @ n) / span, -0.2, 1.2)
        for li, au, hv in zip(loops, a, h):
            uv[li] = origin + np.array([au / 1.1, 0.05 + 0.3 * hv]) * side
    me.uv_layers.active.data.foreach_set("uv", uv.ravel())
    return len(new)


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
    eb = rig.data.edit_bones
    # 1. targets per side
    targets = {}
    for side in ("l", "r"):
        for kind, (b0, b1, b2), seg1, seg2 in chains:
            names = tuple(f"{x}_{side}" for x in (b0, b1, b2))
            if not all(n in eb for n in names):
                continue
            J = [np.array(eb[n].head) for n in names]
            l1 = _centreline(co, gw([f"{x}_{side}" for x in seg1]), J[0], J[1])
            l2 = _centreline(co, gw([f"{x}_{side}" for x in seg2]), J[1], J[2])
            # the old joint projected onto both segment lines (their intersection slides along
            # the limb when it is nearly straight: 23/11 it moved the knee up 12 cm)
            N = [_closest_on_line(J[0], l1), 0.5 * (_closest_on_line(J[1], l1) + _closest_on_line(J[1], l2)),
                 _closest_on_line(J[2], l2)]
            # 24/11: with MakeHuman's hands / feet grafted on, the wrist / ankle and every bone
            # beyond already sit inside their own mesh; projecting them onto the sculpt's forearm
            # line moved the hand bones 6.4 cm off the hand (fingers could not close on a bar).
            if (gc.get("extremities") or {}).get("enabled"):
                N[2] = J[2].copy()
                try:
                    sh = json.loads(rig.get("extremity_shift", "{}")).get(names[2])
                except (TypeError, ValueError):
                    sh = None
                if sh:
                    N[2] = J[2] + np.array(sh)
            targets[(kind, side)] = (names, J, N)
    # 2. mirror-average left and right (24/11: the sculpt is not exactly symmetric and the elbows ended
    # 6 mm apart, which QA's left_right_symmetry caught as 2.2 cm at the top of a press)
    mirror = np.array([-1.0, 1.0, 1.0])
    for kind in ("arm", "leg"):
        if (kind, "l") in targets and (kind, "r") in targets:
            nl, Jl, Nl = targets[(kind, "l")]
            nr, Jr, Nr = targets[(kind, "r")]
            avg = [0.5 * (a + b * mirror) for a, b in zip(Nl, Nr)]
            targets[(kind, "l")] = (nl, Jl, avg)
            targets[(kind, "r")] = (nr, Jr, [a * mirror for a in avg])
    # 3. every bone under the chain root moves with the segment it sits in
    for (kind, side), (names, J, N) in targets.items():
        J0, J1, J2 = J
        d0, d1, d2 = (n - j for n, j in zip(N, J))
        root = eb[names[0]]
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
