"""Paths and JSON configuration. Plain Python: no bpy import here."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # artifacts/exercise-visual-system
CONFIG_DIR = ROOT / "config"
CHARACTERS_DIR = ROOT / "characters"


def load_json(path: os.PathLike | str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def save_json(path: os.PathLike | str, data) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def sha256_file(path: os.PathLike | str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def character_config() -> dict:
    """EVS_CHARACTER_CONFIG points at another file, for trying body variants
    without touching the master character."""
    return load_json(os.environ.get("EVS_CHARACTER_CONFIG") or (CONFIG_DIR / "master_character.json"))


def character_dir(character_id: str) -> Path:
    return CHARACTERS_DIR / character_id


def character_blend(character_id: str) -> Path:
    return character_dir(character_id) / "master_character.blend"


def muscle_map() -> dict:
    return load_json(CONFIG_DIR / "muscle_map.json")


def equipment_config() -> dict:
    return load_json(CONFIG_DIR / "equipment.json")


def camera_presets() -> dict:
    return load_json(CONFIG_DIR / "camera_presets.json")


def render_presets() -> dict:
    return load_json(CONFIG_DIR / "render_presets.json")


def brand_config(profile_path: os.PathLike | str | None = None) -> dict:
    """The brand profile. EVS_BRAND_CONFIG overrides the default file so a
    rebrand never touches the character, the rig or any animation."""
    path = profile_path or os.environ.get("EVS_BRAND_CONFIG") or (CONFIG_DIR / "brand.config.json")
    return load_json(path)


def exercise_dir(exercise: str) -> Path:
    """Accepts an exercise folder name (bench-press) or a path to one."""
    p = Path(exercise)
    if p.is_dir() and (p / "exercise.json").exists():
        return p.resolve()
    return ROOT / exercise


def exercise_config(exercise: str) -> dict:
    return load_json(exercise_dir(exercise) / "exercise.json")


def hex_to_linear_rgb(value: str) -> tuple[float, float, float]:
    """#RRGGBB (sRGB) to scene-linear floats, as Blender shader inputs expect."""
    value = value.lstrip("#")
    if len(value) != 6:
        raise ValueError(f"expected #RRGGBB, got {value!r}")

    def chan(i: int) -> float:
        c = int(value[i : i + 2], 16) / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return chan(0), chan(2), chan(4)
