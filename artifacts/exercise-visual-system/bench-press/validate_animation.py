"""Bench Press entry point for the shared step pipeline/validate_animation.py.

    Blender -b --factory-startup --python bench-press/validate_animation.py [-- extra options]

Runs the shared step with --exercise bench-press. The logic lives in
pipeline/validate_animation.py so every exercise uses the same code."""

import os
import runpy
import sys

if "--exercise" not in sys.argv:
    if "--" not in sys.argv:
        sys.argv.insert(1, "--")  # plain python: options after the script name
    sys.argv += ["--exercise", "bench-press"]
runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pipeline", "validate_animation.py"), run_name="__main__")
