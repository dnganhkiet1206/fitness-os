"""Trapezius volume for the master character (Kiệt chose level E, 15/11/2026).

MakeHuman/MPFB has no trapezius target and the muscle sculpt
(sculpt_muscles.py) only cuts 4 mm grooves, so the neck-to-shoulder line of
character 003 was almost flat ("charactor không có cơ trap"). Kiệt asked for
tall, prominent upper traps, as on trained American and European lifters,
so the guide reads right when the shoulders shrug, press or carry a bar.

Two ASCND-owned layers, both moved along the skin (see the functions):
* ``mask_weights``: the whole baked trapezius mask, full above the scapular
  spine, a quarter at mid-back, strongest between neck and acromion;
* ``tall_weights``: a band up each side of the back of the neck, from part
  way up the neck down to the acromion, lifting the slope.

Anatomy: Gray (1918), trapezius origin occiput, nuchal ligament, C7-T12;
insertion lateral third of the clavicle, acromion and scapular spine.
Options sheet: docs/exercise-visual-system/trapezius_options.jpg
(pipeline/mock_trapezius.py).
"""

from __future__ import annotations

import numpy as np

from . import config


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mask_weights(body, rig) -> np.ndarray:
    cfg = config.character_config()
    atlas = config.character_dir(cfg["master_character_id"]) / "muscle_atlas" / "masks.npz"
    mask = np.load(atlas)["trapezius"].astype(np.float32) / 255.0
    res = mask.shape[0]
    mesh = body.data
    n = len(mesh.vertices)
    co = np.array([v.co[:] for v in mesh.vertices])
    nor = np.array([v.normal[:] for v in mesh.vertices])
    uv = mesh.uv_layers.active.data
    w = np.zeros(n)
    for poly in mesh.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            u, v = uv[li].uv
            c, r = min(int(u * res), res - 1), min(int(v * res), res - 1)
            w[vi] = max(w[vi], mask[r, c])

    bones = {b.name: (rig.matrix_world @ b.head_local) for b in rig.data.bones}
    neck = np.array(bones["neck_01"][:])
    head = np.array(bones["head"][:])
    acr = {s: np.array(bones[f"upperarm_{s}"][:]) for s in "lr"}
    spine3 = np.array(bones["spine_03"][:])
    shoulder_z = 0.5 * (acr["l"][2] + acr["r"][2])

    # Upper fibres carry the mass; middle/lower fibres are thin.
    vert = 0.25 + 0.75 * smoothstep(spine3[2], shoulder_z - 0.02, co[:, 2])
    # Along the neck-to-acromion line: strongest midway, fading at the
    # acromion (shoulder joint) and high on the neck (no traps to the ears).
    ridge = np.ones(n)
    for s, sign in (("l", 1.0), ("r", -1.0)):
        side = (co[:, 0] * sign) > 0
        a, b = neck + np.array([0, 0.02, 0.01]), acr[s]
        ab = b - a
        t = np.clip(((co - a) @ ab) / (ab @ ab), 0.0, 1.0)
        prof = np.sin(np.pi * np.clip(0.15 + 0.85 * t, 0, 1)) ** 0.8
        ridge[side] = np.where(co[side, 2] > shoulder_z - 0.04, 0.35 + 0.65 * prof[side], 1.0)
    neck_cap = 1.0 - smoothstep(neck[2] + 0.04, 0.5 * (neck[2] + head[2]) + 0.03, co[:, 2])
    # Throat / front of the neck: never.
    front = (nor[:, 1] < -0.35) & (co[:, 2] > neck[2] - 0.05) & (np.abs(co[:, 0]) < 0.09)
    w = w * vert * ridge * neck_cap
    w[front] = 0.0

    # Smooth over the mesh so the mask edge leaves no step.
    edges = np.array([e.vertices[:] for e in mesh.edges])
    deg = np.bincount(edges.ravel(), minlength=n).astype(float)
    for _ in range(25):
        acc = np.zeros(n)
        np.add.at(acc, edges[:, 0], w[edges[:, 1]])
        np.add.at(acc, edges[:, 1], w[edges[:, 0]])
        w = 0.5 * w + 0.5 * acc / np.maximum(deg, 1)
    w[front] = 0.0
    return w / max(w.max(), 1e-6)


def tall_weights(body, rig, reach: float) -> np.ndarray:
    """Upper trapezius as a tall slope (Kiệt 15/11: "khối cơ cầu vai cao
    lên", as on trained American and European lifters). A band along each
    side of the back of the neck, from ``reach`` of the way up the neck down
    to the top of the acromion: thickest where the neck meets the shoulder
    line, fading at both ends. The baked mask stops at the base of the neck,
    so this band is placed from the bones, not the mask. Front of the neck
    and the face stay untouched."""
    mesh = body.data
    co = np.array([v.co[:] for v in mesh.vertices])
    nor = np.array([v.normal[:] for v in mesh.vertices])
    bones = {b.name: (rig.matrix_world @ b.head_local) for b in rig.data.bones}
    neck = np.array(bones["neck_01"][:])
    head = np.array(bones["head"][:])
    w = np.zeros(len(co))
    for s, sign in (("l", 1.0), ("r", -1.0)):
        acr = np.array(bones[f"upperarm_{s}"][:])
        top = np.array([sign * 0.045, neck[1] + 0.02, neck[2] + reach * (head[2] - neck[2])])
        end = acr + np.array([-sign * 0.01, 0.01, 0.035])
        ab = end - top
        t = np.clip(((co - top) @ ab) / (ab @ ab), 0.0, 1.0)
        d = np.linalg.norm(co - (top + t[:, None] * ab), axis=1)
        prof = np.sin(np.pi * np.clip(0.1 + 0.9 * t, 0, 1)) ** 0.6
        side = (co[:, 0] * sign) > -0.01
        w = np.maximum(w, np.where(side, np.exp(-(d / 0.055) ** 2) * prof, 0.0))
    front = (nor[:, 1] < -0.25) & (co[:, 2] > neck[2] - 0.06) & (np.abs(co[:, 0]) < 0.10)
    # Fade out below the skull (a hard cut left a seam at the back of the
    # head, 15/11), then smooth over the mesh like the mask weights.
    w = w * (1.0 - smoothstep(head[2] - 0.07, head[2] - 0.01, co[:, 2]))
    w[front] = 0.0
    edges = np.array([e.vertices[:] for e in mesh.edges])
    deg = np.bincount(edges.ravel(), minlength=len(co)).astype(float)
    for _ in range(12):
        acc = np.zeros(len(co))
        np.add.at(acc, edges[:, 0], w[edges[:, 1]])
        np.add.at(acc, edges[:, 1], w[edges[:, 0]])
        w = 0.5 * w + 0.5 * acc / np.maximum(deg, 1)
    w[front] = 0.0
    return w / max(w.max(), 1e-6)




def displacement(body, rig, cfg: dict) -> np.ndarray:
    """Per-vertex offset (n, 3) in the body's rest space for the trapezius
    settings ``cfg`` (master_character.json ``trapezius_volume``)."""
    mesh = body.data
    nor = np.array([v.normal[:] for v in mesh.vertices])
    up = np.array([0.0, 0.0, 1.0])
    dirs = nor + up * np.clip(nor[:, 2:3], 0, 1) * 0.3
    dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    lift = nor * 0.5 + up * 0.8
    lift /= np.linalg.norm(lift, axis=1, keepdims=True)
    out = dirs * (cfg["mask_amplitude_m"] * mask_weights(body, rig))[:, None]
    if cfg.get("tall_amplitude_m"):
        out += lift * (cfg["tall_amplitude_m"] * tall_weights(body, rig, cfg["neck_reach"]))[:, None]
    return out
