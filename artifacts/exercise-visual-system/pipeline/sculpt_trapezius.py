"""Adds the trapezius volume (evs/trapezius_volume.py) to the master
character's rest mesh, using the settings in master_character.json
``trapezius_volume`` (Kiệt chose level E on 15/11/2026).

    Blender -b --factory-startup --python pipeline/sculpt_trapezius.py

Runs in the character chain after bake_muscle_atlas.py (it reads the
trapezius mask) and before the fibre bakes, so fibres follow the new shape.
Refuses to run twice on the same mesh (the body carries a marker).
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from evs import config, trapezius_volume  # noqa: E402

MARKER = "evs_trapezius_volume"


def main() -> None:
    cfg = config.character_config()
    settings = cfg["body_shape"].get("trapezius_volume")
    blend = config.character_blend(cfg["master_character_id"])
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    body = bpy.data.objects[cfg["names"]["body_object"]]
    if not settings:
        print("[evs] trapezius: no settings, skipped")
        return
    if body.get(MARKER):
        raise SystemExit(f"[evs] trapezius already applied ({body[MARKER]}); rebuild the character first")
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    mesh = body.data
    offset = trapezius_volume.displacement(body, rig, settings)
    co = np.array([v.co[:] for v in mesh.vertices]) + offset
    mesh.vertices.foreach_set("co", co.ravel())
    mesh.update()
    body[MARKER] = settings["level"]
    moved = np.linalg.norm(offset, axis=1)
    facts_path = config.character_dir(cfg["master_character_id"]) / "character_facts.json"
    facts = config.load_json(facts_path) if facts_path.exists() else {}
    facts["trapezius_volume"] = {"level": settings["level"], "vertices_moved_over_1mm": int((moved > 0.001).sum()),
                                 "max_offset_m": round(float(moved.max()), 4)}
    config.save_json(facts_path, facts)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    print(f"[evs] trapezius level {settings['level']}: {int((moved > 0.001).sum())} vertices, max {moved.max() * 100:.1f} cm")


if __name__ == "__main__":
    main()
