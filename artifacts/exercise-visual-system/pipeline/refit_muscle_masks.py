"""Snaps the muscle-group borders of the baked atlas onto the sculpt's real
grooves (evs/mask_refit.py). Runs after bake_muscle_atlas.py when the
character config has ``muscle_refit`` (character 005: CC-BY sculpt textures).

    python3 pipeline/refit_muscle_masks.py [--band 28] [--debug]

Rewrites masks.npz (leaf groups, aggregates as their union, _side_left
untouched), the per-group PNGs and atlas_facts.json; ``--debug`` also writes
``_refit_borders.png`` (old borders red, new borders green, over the AO)."""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np  # noqa: E402

from evs import config, mask_refit, pngio  # noqa: E402


def _args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--band", type=int, default=None, help="max border shift in atlas texels (default: config)")
    parser.add_argument("--debug", action="store_true")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def _borders(labels: np.ndarray) -> np.ndarray:
    e = np.zeros(labels.shape, bool)
    e[1:] |= labels[1:] != labels[:-1]
    e[:, 1:] |= labels[:, 1:] != labels[:, :-1]
    return e


def main() -> None:
    args = _args()
    cfg = config.character_config()
    rc = cfg.get("muscle_refit") or {}
    if not rc.get("enabled"):
        print("[evs] refit: muscle_refit not enabled for this character, nothing to do")
        return
    band = int(args.band or rc.get("band_px", 28))
    muscle_map = config.muscle_map()
    leaves = list(muscle_map["groups"])
    atlas_dir = config.character_dir(cfg["master_character_id"]) / "muscle_atlas"
    with np.load(atlas_dir / "masks.npz") as data:
        packed = {k: data[k] for k in data.files}
    res = packed[leaves[0]].shape[0]
    src = config.ROOT / rc["source_dir"]

    def tex(name: str) -> np.ndarray:
        img = pngio.read_png(src / name)
        if img.shape[0] != res:
            f = img.shape[0] // res
            img = img.reshape(res, f, res, f, -1).mean(axis=(1, 3))
        return np.flipud(img).astype(np.float32) / 255.0  # rows along +v, like the atlas

    ao = tex(rc["occlusion"])[..., 0]
    normal = tex(rc["normal"])[..., :3] * 2.0 - 1.0
    if rc.get("normal_green_down"):
        normal[..., 1] *= -1.0
    region = ao > float(rc.get("min_occlusion", 0.03))
    height = mask_refit.groove_height(ao, normal, region, int(rc.get("ao_radius_px", 10)))
    height = np.where(region, mask_refit.box_blur(height, int(rc.get("height_blur_px", 4))), 1.0)  # texture noise

    stack = np.stack([packed[n] for n in leaves])
    labels = stack.argmax(0).astype(np.int32) + 1
    labels[stack.max(0) < 128] = 0
    del stack
    new, facts = mask_refit.watershed(labels, region, height, band, float(rc.get("seed_fraction", 0.6)),
                                      float(rc.get("stray_cost", 0.1)))
    new = mask_refit.majority_smooth(new, region, int(rc.get("smooth_px", 4)))

    blur = int(rc.get("edge_blur_px", 2))
    facts_path = atlas_dir / "atlas_facts.json"
    atlas_facts = config.load_json(facts_path) if facts_path.exists() else {"groups": {}}
    for i, n in enumerate(leaves, start=1):
        soft = mask_refit.box_blur((new == i).astype(np.float32), blur) * 255.0
        m = np.where(region, soft, packed[n].astype(np.float32))
        packed[n] = np.clip(m + 0.5, 0, 255).astype(np.uint8)
        pngio.write_png(atlas_dir / f"{n}.png", np.flipud(packed[n])[::2, ::2])
        atlas_facts["groups"].setdefault(n, {})["texels"] = int((packed[n] > 127).sum())
    for agg, parts in muscle_map.get("aggregates", {}).items():
        packed[agg] = np.maximum.reduce([packed[p] for p in parts])
        atlas_facts["groups"].setdefault(agg, {})["texels"] = int((packed[agg] > 127).sum())
    np.savez_compressed(atlas_dir / "masks.npz", **packed)
    facts["sources"] = {"occlusion": rc["occlusion"], "normal": rc["normal"]}
    atlas_facts["refit"] = facts
    config.save_json(facts_path, atlas_facts)
    print(f"[evs] refit: {facts}")

    if args.debug:
        g = (np.clip(ao, 0, 1) * 255).astype(np.uint8)
        rgb = np.stack([g, g, g], -1)
        hv = (np.clip(height, 0, 1) * 255).astype(np.uint8)
        rgb[..., 2] = np.maximum(rgb[..., 2] // 2, hv) * region + rgb[..., 2] * ~region
        rgb[_borders(labels) & region] = (230, 40, 40)
        rgb[_borders(new) & region] = (40, 200, 60)
        pngio.write_png(atlas_dir / "_refit_borders.png", np.flipud(rgb))


if __name__ == "__main__":
    main()
