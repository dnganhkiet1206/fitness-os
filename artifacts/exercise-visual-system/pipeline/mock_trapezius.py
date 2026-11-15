"""Mock: give the master character a trapezius volume, at several levels,
for Kiệt to choose (15/11: "charactor không có cơ trap").

    Blender -b --factory-startup --python pipeline/mock_trapezius.py -- <out_dir> [amp_m ...]

The sheet for Kiệt: docs/exercise-visual-system/trapezius_options.jpg.
Round 1 (15/11) had A/B/C = 1.5/2.5/3.5 cm on the mask only; Kiệt asked for
taller traps ("khối cơ cầu vai cao lên", as on American/European lifters).
Round 2 rows, top to bottom: current 003, B (mask 2.5 cm), D, E, F (mask
plus a tall band up the back of the neck: 2.2/3.2/4.2 cm, reaching 40/50/60 %
of the neck). Columns: front, 3/4 front, side, 3/4 back, back.

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
from evs.trapezius_volume import mask_weights as trapezius_weights, tall_weights  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = argv[0]
    # (label, base amplitude on the mask, tall-band amplitude, neck reach)
    options = [("003", 0.0, 0.0, 0.0), ("B", 0.025, 0.0, 0.0),
               ("D", 0.025, 0.022, 0.40), ("E", 0.030, 0.032, 0.50), ("F", 0.035, 0.042, 0.60)]
    os.makedirs(out_dir, exist_ok=True)
    cfg = config.character_config()
    brand = config.brand_config()
    bpy.ops.wm.open_mainfile(filepath=str(config.character_blend(cfg["master_character_id"])))
    body = bpy.data.objects[cfg["names"]["body_object"]]
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    w = trapezius_weights(body, rig)
    tall = {reach: tall_weights(body, rig, reach) for _l, _a, _b, reach in options if reach}
    mesh = body.data
    rest = np.array([v.co[:] for v in mesh.vertices])
    nor = np.array([v.normal[:] for v in mesh.vertices])
    up = np.array([0.0, 0.0, 1.0])
    # Push mostly along the normal, a little upward on top-facing skin.
    dirs = nor + up * np.clip(nor[:, 2:3], 0, 1) * 0.3
    dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    # The tall band lifts the slope: mostly upward, a little outward.
    lift = nor * 0.5 + up * 0.8
    lift /= np.linalg.norm(lift, axis=1, keepdims=True)
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
    for k, (label, amp, tall_amp, reach) in enumerate(options):
        new = rest + dirs * (amp * w)[:, None]
        if reach:
            new = new + lift * (tall_amp * tall[reach])[:, None]
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
