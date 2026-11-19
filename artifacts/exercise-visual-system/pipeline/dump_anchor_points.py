"""Print bone and mesh positions of an exercise master scene at one frame,
in Blender Z-up and in the app's Y-up (x, z, -y), to place 3D tip anchors
(`ExerciseDemoTips.swift`).

    Blender -b <dir>/<id>_master.blend -P pipeline/dump_anchor_points.py -- [frame]

Pick anchors on parts that do not move during the rep (trunk, head, bench),
push them out from the bone to the skin surface, and keep them off the
lower third of the screen (the muscle panel covers it).
"""

import json
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
frame = int(argv[0]) if argv else 0
scene = bpy.context.scene
scene.frame_set(frame)
depsgraph = bpy.context.evaluated_depsgraph_get()


def y_up(p):
    return [round(p.x, 3), round(p.z, 3), round(-p.y, 3)]


arm = next(o for o in scene.objects if o.type == "ARMATURE")
bones = {}
for b in arm.pose.bones:
    p = arm.matrix_world @ b.head
    bones[b.name] = {"z_up": [round(p.x, 3), round(p.y, 3), round(p.z, 3)], "y_up": y_up(p)}
print("BONES", json.dumps(bones))
for o in scene.objects:
    if o.type == "MESH":
        e = o.evaluated_get(depsgraph)
        box = [e.matrix_world @ Vector(c) for c in e.bound_box]
        lo = Vector([min(v[i] for v in box) for i in range(3)])
        hi = Vector([max(v[i] for v in box) for i in range(3)])
        print("MESH", o.name, "z_up", [round(v, 3) for v in lo], [round(v, 3) for v in hi])
