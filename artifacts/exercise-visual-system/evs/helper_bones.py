"""Corrective helper bones for the master character (Kiệt 15/11: "thêm xương
vào cơ cầu vai để di chuyển chuẩn hơn ... không bị biến dạng khi di chuyển
hoặc di chuyển bởi một nhóm cơ khác").

Linear blend skinning collapses the skin where two bones meet and the joint
bends far: the vertices half way between them follow the average of two
transforms and fall inside the body. The audit of 15/11 (every exercise, 7
frames each) found:

* hip front fold (pelvis / thigh) stretched 6-9x in squat, row, deadlift,
  seated press; the shorts, a copy of that skin 3.5 mm out, then fall under
  the thigh skin (the "torn crotch" Kiệt saw);
* knee fold (thigh / calf) squashed 5-7x in squat and seated press;
* elbow fold squashed 12x in curls;
* upper back near the shoulder weighted 0.39 to the upper arm, so the traps
  were dragged by the arm in the press (moved by another muscle group).

Each *fold helper* is a deform bone at the joint, parented to the joint's
parent, with the child's rest orientation, turning half as far as the child
(Copy Rotation, local space, influence 0.5): the transition skin follows a
half-way rotation instead of an average of two. The *trapezius helper* sits
at the clavicle head, parented to the upper spine, and follows the clavicle
part of the way, so the traps rise with the shoulder girdle and are no
longer pulled by the upper arm. Both are constraint driven, so the USD
export bakes them per frame like the forearm twist bones.

Weights are moved, never added: in each fold region the helper takes
``share`` of the weight where the two sides meet (2 * min(parent, child)),
from both sides in proportion; the trapezius helper takes ``share`` of the
upper trapezius field (evs/trapezius_volume.tall_weights). Every vertex keeps
its total weight.
"""

from __future__ import annotations

import bpy
import numpy as np
from mathutils import Vector

from .trapezius_volume import smoothstep, tall_weights


def _weights(body: bpy.types.Object) -> tuple[np.ndarray, list[str]]:
    names = [g.name for g in body.vertex_groups]
    w = np.zeros((len(body.data.vertices), len(names)))
    for v in body.data.vertices:
        for g in v.groups:
            w[v.index, g.group] = g.weight
    return w, names


def _write(body: bpy.types.Object, w: np.ndarray, names: list[str], touched: np.ndarray) -> None:
    for j, name in enumerate(names):
        vg = body.vertex_groups[name]
        col = w[:, j]
        for i in np.where(touched)[0]:
            if col[i] > 1e-5:
                vg.add([int(i)], float(col[i]), "REPLACE")
            else:
                vg.remove([int(i)])


def _add_bone(rig, name: str, like: str, parent: str, head_at: str | None = None, length: float = 0.06) -> None:
    """New deform bone with ``like``'s rest orientation, head at ``head_at``'s
    head (default: ``like``'s head), parented to ``parent``."""
    bpy.context.view_layer.objects.active = rig
    for o in bpy.context.selected_objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = rig.data.edit_bones
    ref = eb[like]
    b = eb.new(name)
    head = eb[head_at].head.copy() if head_at else ref.head.copy()
    b.head = head
    b.tail = head + (ref.tail - ref.head).normalized() * length
    b.roll = ref.roll
    b.parent = eb[parent]
    b.use_connect = False
    b.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")


def _follow(rig, name: str, target: str, influence: float) -> None:
    c = rig.pose.bones[name].constraints.new("COPY_ROTATION")
    c.target, c.subtarget = rig, target
    c.owner_space = c.target_space = "LOCAL"
    c.mix_mode = "REPLACE"
    c.influence = influence


def add_helpers(body: bpy.types.Object, rig: bpy.types.Object, cfg: dict) -> dict:
    """Adds every helper in ``cfg`` (master_character.json rig.helper_bones)
    and moves skin weight onto it. Returns facts (vertices per helper)."""
    facts = {}
    co = np.array([(body.matrix_world @ v.co)[:] for v in body.data.vertices])
    for spec in cfg.get("folds", []):
        for side in ("l", "r"):
            def s(n):
                return n.replace("{s}", side)
            name, child, parent = s(spec["name"]), s(spec["child"]), s(spec["parent_bone"])
            _add_bone(rig, name, like=child, parent=parent, length=spec.get("length_m", 0.06))
            _follow(rig, name, child, spec.get("influence", 0.5))
            body.vertex_groups.new(name=name)
            w, names = _weights(body)
            idx = {n: i for i, n in enumerate(names)}
            P = [idx[s(n)] for n in spec["parent_groups"] if s(n) in idx]
            C = [idx[s(n)] for n in spec["child_groups"] if s(n) in idx]
            joint = np.array((rig.matrix_world @ rig.data.bones[child].head_local)[:])
            d = np.linalg.norm(co - joint, axis=1)
            fall = 1.0 - smoothstep(spec["radius_m"] * 0.5, spec["radius_m"], d)
            wp, wc = w[:, P].sum(1), w[:, C].sum(1)
            h = spec["share"] * 2.0 * np.minimum(wp, wc) * fall
            tot = np.maximum(wp + wc, 1e-9)
            for cols, side_w in ((P, wp), (C, wc)):
                take = h * side_w / tot
                frac = np.where(side_w > 1e-9, take / np.maximum(side_w, 1e-9), 0.0)
                w[:, cols] *= (1.0 - frac)[:, None]
            w[:, idx[name]] = h
            touched = h > 1e-4
            _write(body, w, names, touched)
            facts[name] = int(touched.sum())
    tr = cfg.get("trapezius")
    _trapezius(body, rig, tr, co, facts) if tr else None
    for spec in cfg.get("smooth", []):
        facts[spec["name"]] = _smooth_region(body, rig, spec, co)
    bpy.context.view_layer.update()
    return facts


def _smooth_region(body, rig, spec: dict, co: np.ndarray) -> int:
    """Spreads a fold over a wider band of skin (Laplacian smoothing of the
    weights of ``groups`` inside the region; each vertex keeps its total).
    Skin stretch along a fold is roughly arc length over band width, so a
    band ten times wider stretches ten times less (crotch, 15/11)."""
    hip = np.array((rig.matrix_world @ rig.data.bones[spec["hip_bone"]].head_local)[:])
    lo, hi = spec["z_from_hip_m"]
    region = (np.abs(co[:, 0]) < spec["half_width_m"]) & (co[:, 2] > hip[2] + lo) & (co[:, 2] < hip[2] + hi)
    w, names = _weights(body)
    cols = [names.index(g) for g in spec["groups"] if g in names]
    region &= w[:, cols].sum(1) > 0.5
    edges = np.array([e.vertices[:] for e in body.data.edges])
    deg = np.bincount(edges.ravel(), minlength=len(co)).astype(float)
    sub = w[:, cols]
    for _ in range(spec["iterations"]):
        acc = np.zeros_like(sub)
        np.add.at(acc, edges[:, 0], sub[edges[:, 1]])
        np.add.at(acc, edges[:, 1], sub[edges[:, 0]])
        new = 0.5 * sub + 0.5 * acc / np.maximum(deg, 1)[:, None]
        sub[region] = new[region]
    w[:, cols] = sub
    _write(body, w, names, region)
    return int(region.sum())


def _trapezius(body, rig, tr: dict, co: np.ndarray, facts: dict) -> None:
    if tr:
        for side, sign in (("l", 1.0), ("r", -1.0)):
            name = tr["name"].replace("{s}", side)
            clav = f"clavicle_{side}"
            _add_bone(rig, name, like=clav, parent=tr["parent_bone"], length=0.08)
            _follow(rig, name, clav, tr.get("influence", 0.6))
            body.vertex_groups.new(name=name)
        field = tall_weights(body, rig, tr.get("neck_reach", 0.5))
        w, names = _weights(body)
        idx = {n: i for i, n in enumerate(names)}
        keep = [idx[n] for n in names if n.startswith(("head", "neck"))]
        for side, sign in (("l", 1.0), ("r", -1.0)):
            name = tr["name"].replace("{s}", side)
            on_side = (co[:, 0] * sign) > 0
            h = tr["share"] * field * on_side
            others = [j for j in range(len(names)) if j not in keep and j != idx[name]]
            tot = w[:, others].sum(1)
            frac = np.where(tot > 1e-9, np.minimum(h, tot) / np.maximum(tot, 1e-9), 0.0)
            moved = w[:, others].sum(1) * frac
            w[:, others] *= (1.0 - frac)[:, None]
            w[:, idx[name]] += moved
            touched = moved > 1e-4
            _write(body, w, names, touched)
            facts[name] = int(touched.sum())
