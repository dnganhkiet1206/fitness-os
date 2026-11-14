"""ASCND Motion Lab: parameter-driven exercise motion from reusable parts.

Plain numpy (no bpy) so every part is unit-tested outside Blender:

* timing      tempo -> phase timeline; minimum-jerk progress inside a phase
* primitives  reusable joint-level building blocks (elbow flexion arc, two-bone IK, ...)
* families    one template per movement family; a template turns an exercise
              spec plus the character's rest skeleton into per-frame targets
              (implement transforms, effector targets, pole hints, root and
              spine), never Blender calls

pipeline/generate_exercise.py applies those targets to the rig in Blender.
See docs/exercise-visual-system/MOTION_KIT.md.
"""

FAMILIES = {}


def register(name):
    def deco(cls):
        FAMILIES[name] = cls
        return cls
    return deco
