"""Shared muscle maps for runtime colouring (MODULAR_3D_PLAN.md, Kiệt 16/11,
step 1): the app colours the muscles of an exercise itself, from its roles,
instead of loading baked skin textures per exercise.

    python3 pipeline/export_muscle_shader_maps.py [--character master_character_003] [--out <app folder>]

Writes, once per character (same UVs as the body):

* ``muscle_ids.png`` (RGB, 2048²): R = part index + 1 (0 = skin, nearest
  sampled), G = crisp coverage of that part (soft edge), B = rim band just
  inside each muscle outline (the glow that makes groups read at a glance);
* ``muscle_shade.jpg``: fibre shading for every part (multiplies the role
  colour; 1 = no change);
* ``muscle_normal.jpg``: the layered muscle sculpt (no fibres), used on skin and on parts that
  have no role in the exercise;
* ``muscle_fiber_normal.jpg``: the same sculpt WITH the fibre relief of every part (as
  painted_textures does for one exercise). The app takes it only on parts that have a role
  (17/11: fibres on every part made the whole body look like an anatomy chart);
* ``muscle_parts.json``: part order (index -> id) and the aggregates (a
  whole muscle = its parts), which the app uses to turn exercise roles into
  a 64-entry colour table.

Same fibre and rim maths as the per-exercise painted export
(evs/fiber_lic.painted_maps), applied to all parts at once.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from evs import config, fiber_lic, pngio  # noqa: E402

APP = ROOT.parent.parent / "apps" / "ios" / "ASCND" / "Resources" / "ExerciseDemos"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--character", default="master_character_003")
    ap.add_argument("--out", default=str(APP))
    args = ap.parse_args()
    atlas = config.character_dir(args.character) / "muscle_atlas"
    mm = config.muscle_map()
    parts = list(mm["groups"])
    if len(parts) >= 64:
        raise ValueError("the app colour table has 64 entries (index 0 = skin)")
    masks = dict(np.load(atlas / "masks.npz"))
    masks.pop("_side_left", None)
    phase = dict(np.load(atlas / "fiber_phase.npz"))
    angles = dict(np.load(atlas / "fiber_dir.npz")) if (atlas / "fiber_dir.npz").exists() else None
    present = [p for p in parts if p in masks and p in phase]
    crisp = np.stack([fiber_lic.crisp_mask(masks[p]) for p in present])
    best = crisp.argmax(0)
    cover = crisp.max(0)
    ids = np.where(cover > 0.5, best + 1, 0).astype(np.uint8)
    # Index into the full part list (stable across characters), not `present`.
    lookup = np.array([parts.index(p) + 1 for p in present], dtype=np.uint8)
    ids = np.where(ids > 0, lookup[np.maximum(ids.astype(int) - 1, 0)], 0).astype(np.uint8)
    sculpt_path = atlas / "sculpt_height.npz"
    base = base_relief = None
    if sculpt_path.exists():
        with np.load(sculpt_path) as d:
            base, base_relief = d["height"], float(d["relief"])
    shade, normal, rim = fiber_lic.painted_maps(masks, phase, present, angles=angles, base_height=base,
                                                base_relief=base_relief or 0.0)
    facts_path = atlas.parent / "character_facts.json"
    if facts_path.exists():
        normal = fiber_lic.flatten_points(normal, config.load_json(facts_path).get("uv_flat_points"))
    rgba = np.stack([ids, (np.clip(cover, 0, 1) * 255 + 0.5).astype(np.uint8),
                     (np.clip(rim, 0, 1) * 255 + 0.5).astype(np.uint8)], -1)
    out = Path(args.out)
    # PNG-ordered like the other skin textures (top row = v 1).
    pngio.write_png(out / "muscle_ids.png", np.flipud(rgba))
    shade_png = out / "_muscle_shade.png"
    pngio.write_png(shade_png, np.flipud(np.repeat((np.clip(shade, 0, 1) * 255 + 0.5).astype(np.uint8)[..., None], 3, -1)))
    normal_src = out / "_muscle_normal.png"
    pngio.write_png(normal_src, np.flipud((np.clip(normal, 0, 1) * 255 + 0.5).astype(np.uint8)))
    magick = shutil.which("magick")
    if magick:
        subprocess.run([magick, str(shade_png), "-quality", "92", str(out / "muscle_shade.jpg")], check=True)
        subprocess.run([magick, str(normal_src), "-quality", "92", str(out / "muscle_fiber_normal.jpg")], check=True)
        subprocess.run([magick, str(atlas / "sculpt_normal.png"), "-quality", "92", str(out / "muscle_normal.jpg")],
                       check=True)
        shade_png.unlink()
        normal_src.unlink()
    else:
        shade_png.rename(out / "muscle_shade.png")
        normal_src.rename(out / "muscle_fiber_normal.png")
        shutil.copy(atlas / "sculpt_normal.png", out / "muscle_normal.png")
    (out / "muscle_parts.json").write_text(json.dumps(
        {"parts": parts, "aggregates": mm.get("aggregates", {})}, indent=2) + "\n")
    print(f"[evs] muscle shader maps: {len(present)}/{len(parts)} parts -> {out}")


if __name__ == "__main__":
    main()
