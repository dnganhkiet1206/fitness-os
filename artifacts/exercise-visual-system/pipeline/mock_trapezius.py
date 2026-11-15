"""Mock: give the master character a trapezius volume, at several levels,
for Kiệt to choose (15/11: "charactor không có cơ trap").

    Blender -b --factory-startup --python pipeline/mock_trapezius.py -- <out_dir> [amp_m ...]

The sheet Kiệt reviewed (15/11): docs/exercise-visual-system/trapezius_options.jpg,
rows top to bottom = current 003, A 1.5 cm, B 2.5 cm, C 3.5 cm; columns =
front, 3/4 front, side, 3/4 back, back.

MakeHuman/MPFB has no trapezius target (only pectoral, dorsi and deltoid),
and the existing sculpt (sculpt_muscles.py) only cuts 4 mm grooves, so the
neck-to-shoulder line of character 003 is almost flat. This adds an
ASCND-owned volume: every vertex inside the baked trapezius mask
(muscle_atlas/masks.npz) moves out along its normal by ``amp * w``.

* w comes from the mask, smoothed over the mesh (no step at the mask edge);
* anatomy (Gray 1918; trapezius origin occiput / nuchal ligament / C7-T12,
  insertion lateral third of the clavicle, acromion, scapular spine): the
  upper fibres carry the mass, so w is full above the scapular spine and
  falls to a quarter at mid-back (middle/lower fibres are thin sheets);
* the ridge is strongest half way between the neck and the acromion and
  fades at both ends, so the neck does not thicken up to the ears (the
  rejected character 002) and the shoulder joint keeps its shape;
* the throat and the face are never moved (front-facing vertices above the
  clavicles keep w = 0).

Nothing is saved to the character; the script only renders a sheet.
"""

from __future__ import annotations

import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

from evs import config, studio  # noqa: E402


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def trapezius_weights(body, rig) -> np.ndarray:
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


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = argv[0]
    amps = [float(a) for a in argv[1:]] or [0.0, 0.015, 0.025, 0.035]
    os.makedirs(out_dir, exist_ok=True)
    cfg = config.character_config()
    brand = config.brand_config()
    bpy.ops.wm.open_mainfile(filepath=str(config.character_blend(cfg["master_character_id"])))
    body = bpy.data.objects[cfg["names"]["body_object"]]
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    w = trapezius_weights(body, rig)
    mesh = body.data
    rest = np.array([v.co[:] for v in mesh.vertices])
    nor = np.array([v.normal[:] for v in mesh.vertices])
    up = np.array([0.0, 0.0, 1.0])
    # Push mostly along the normal, a little upward on top-facing skin.
    dirs = nor + up * np.clip(nor[:, 2:3], 0, 1) * 0.3
    dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    print("[mock] weighted vertices", int((w > 0.05).sum()))

    scene = bpy.context.scene
    presets = config.render_presets()
    preset = dict(presets["render_presets"][brand["render_preset"]])
    preset["resolution"] = [520, 760]
    preset["taa_render_samples"] = 32
    lighting = presets["lighting_presets"][brand["lighting_preset"]]
    studio.apply_render_preset(scene, preset)
    studio.build_world(scene, brand, lighting)
    studio.build_floor(brand, lighting)
    focus = Vector((0.0, 0.0, 1.40))
    studio.build_light_rig(lighting, focus)
    studio.calibrate_floor(scene)
    views = (("front", 0), ("three_quarter", 35), ("side", 90), ("back_three_quarter", 145), ("back", 180))
    cams = {name: studio.add_camera(f"Mock_{name}", focus, az, 6.0, 2.0, focal_length=105.0) for name, az in views}
    rows = []
    for k, amp in enumerate(amps):
        new = rest + dirs * (amp * w)[:, None]
        mesh.vertices.foreach_set("co", new.ravel())
        mesh.update()
        tiles = []
        for name, _az in views:
            path = os.path.join(out_dir, f"_t{k}_{name}.png")
            studio.render_still(scene, cams[name], path, focus)
            tiles.append(path)
        row = os.path.join(out_dir, f"_row{k}.png")
        cmd = ["ffmpeg", "-loglevel", "error", "-y"]
        for t in tiles:
            cmd += ["-i", t]
        # Rows top to bottom: current 003, then A, B, C (this ffmpeg has no
        # drawtext; the order is given with the sheet).
        subprocess.run(cmd + ["-filter_complex", f"hstack=inputs={len(tiles)}", row], check=True)
        for t in tiles:
            os.remove(t)
        rows.append(row)
    mesh.vertices.foreach_set("co", rest.ravel())
    sheet = os.path.join(out_dir, "trapezius_options.jpg")
    cmd = ["ffmpeg", "-loglevel", "error", "-y"]
    for r in rows:
        cmd += ["-i", r]
    subprocess.run(cmd + ["-filter_complex", f"vstack=inputs={len(rows)}", sheet], check=True)
    print("[mock] sheet", sheet)


if __name__ == "__main__":
    main()
