"""Shrinks the 3D files the app ships without changing what is drawn (MODULAR_3D_PLAN.md,
review 17/11, A1-A4). Run after any export that writes into the app folder:

    Blender -b --factory-startup --python pipeline/slim_app_usdz.py [-- --only a1,a2,a4] [--tolerance-deg 0.25]

Blender is only used for its bundled OpenUSD (``pxr``). Every step is idempotent.

A1  ``character_003.usdz`` / ``apparel_shorts.usdz`` carry the old skin textures (albedo,
    emission, normal: ~3.6 MB) that the runtime muscle shader replaces. They become 4x4
    images with the same names (body / shorts base colour, black emission, flat normal), so
    the app still finds the materials the same way and, if the shader ever fails, the body is
    plain grey instead of a stale baked skin.
A2  The light and dark room parts have identical geometry (only the baked-light texture
    differs). One shared ``gym_room_<part>.usdz`` per part (light texture inside); the dark look
    lists ``texture: gym_room_dark_<part>`` in its manifest and the app swaps the texture.
    Parts whose geometry differs are left as they are.
A3  The room is drawn unlit (``makeUnlit``), so mesh normals are dead weight: removed from
    every room mesh. (Instancing the 333 slats would share their baked light too, which
    changes the look, so it is not done.)
A4  ``<ex>_motion.usdz``: drop skeleton time samples that the kept neighbours reproduce by
    slerp to within ``--tolerance-deg`` on every joint (USD allows uneven samples; timing is
    unchanged). Prints the worst error so the bound is a measurement, not a hope.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np  # noqa: E402
from pxr import Sdf, Usd, UsdGeom, UsdSkel, UsdUtils  # noqa: E402

from evs import bl_util, pngio  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT.parent.parent / "apps" / "ios" / "ASCND" / "Resources" / "ExerciseDemos"

BODY_HEX = "#C9CDD3"
APPAREL_HEX = "#26282C"


def _unpack(usdz: Path, into: Path) -> Path:
    """Extracts a usdz; returns the root layer (first .usdc / .usda entry)."""
    with zipfile.ZipFile(usdz) as z:
        z.extractall(into)
        names = z.namelist()
    root = next(n for n in names if n.endswith((".usdc", ".usda")))
    return into / root


def _save_compact(stage: Usd.Stage, layer: Path) -> None:
    """Writes the edited layer as a fresh file: saving a .usdc in place appends the new data
    and keeps the old, so the file never shrinks (17/11, measured)."""
    fresh = layer.with_name("fresh_" + layer.name)
    stage.GetRootLayer().Export(str(fresh))
    fresh.replace(layer)


def _pack(root_layer: Path, out: Path) -> None:
    tmp = out.with_suffix(".tmp.usdz")
    if not UsdUtils.CreateNewUsdzPackage(Sdf.AssetPath(str(root_layer)), str(tmp)):
        raise RuntimeError(f"usdz packaging failed for {root_layer}")
    tmp.replace(out)


def _hex_rgb(h: str) -> tuple[int, int, int]:
    v = int(h.lstrip("#"), 16)
    return (v >> 16) & 255, (v >> 8) & 255, v & 255


# ── A1 ──────────────────────────────────────────────────────────────────────────

def a1_placeholder_textures(app: Path) -> None:
    for name, base in (("character_003.usdz", BODY_HEX), ("apparel_shorts.usdz", APPAREL_HEX)):
        usdz = app / name
        if not usdz.exists():
            continue
        before = usdz.stat().st_size
        with tempfile.TemporaryDirectory() as tmp:
            layer = _unpack(usdz, Path(tmp))
            textures = sorted((Path(tmp) / "textures").glob("*.png")) if (Path(tmp) / "textures").is_dir() else []
            if not textures:
                continue
            changed = False
            for tex in textures:
                if tex.stat().st_size < 200:
                    continue  # already a placeholder
                stem = tex.stem.lower()
                if "normal" in stem:
                    rgb = (128, 128, 255)
                elif "emission" in stem:
                    rgb = (0, 0, 0)
                else:
                    rgb = _hex_rgb(base)
                pngio.write_png(tex, np.tile(np.array(rgb, dtype=np.uint8), (4, 4, 1)))
                changed = True
            if changed:
                _pack(layer, usdz)
        print(f"[slim] A1 {name}: {before / 1e6:.2f} -> {usdz.stat().st_size / 1e6:.2f} MB")


# ── A2 + A3 ─────────────────────────────────────────────────────────────────────

def _strip_normals(layer: Path) -> int:
    stage = Usd.Stage.Open(str(layer))
    removed = 0
    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh):
            continue
        for prop in ("normals", "primvars:normals", "primvars:normals:indices"):
            if prim.HasProperty(prop):
                prim.RemoveProperty(prop)
                removed += 1
    _save_compact(stage, layer)
    return removed


def _mesh_signature(layer: Path) -> str:
    """Hash of every mesh's points, topology and UVs (names and textures ignored)."""
    stage = Usd.Stage.Open(str(layer))
    h = hashlib.sha256()
    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh):
            continue
        mesh = UsdGeom.Mesh(prim)
        for attr in (mesh.GetPointsAttr(), mesh.GetFaceVertexCountsAttr(), mesh.GetFaceVertexIndicesAttr()):
            h.update(np.asarray(attr.Get(), dtype=np.float64).round(6).tobytes())
        st = UsdGeom.PrimvarsAPI(prim).GetPrimvar("st")
        if st:
            h.update(np.asarray(st.ComputeFlattened(), dtype=np.float64).round(6).tobytes())
        h.update(np.asarray(UsdGeom.Xformable(prim).ComputeLocalToWorldTransform(Usd.TimeCode.Default()),
                            dtype=np.float64).round(6).tobytes())
    return h.hexdigest()


def a2_a3_room(app: Path) -> None:
    light_path, dark_path = app / "room_manifest_light.json", app / "room_manifest_dark.json"
    if not (light_path.exists() and dark_path.exists()):
        return
    light, dark = json.loads(light_path.read_text()), json.loads(dark_path.read_text())
    dark_by_part = {p["part"]: p for p in dark["parts"]}
    for lp in light["parts"]:
        dp = dark_by_part.get(lp["part"])
        if dp is None:
            continue
        shared = f"gym_room_{lp['part']}"
        if lp["file"] == shared and dp["file"] == shared:
            continue  # already shared
        lf, df = app / f"{lp['file']}.usdz", app / f"{dp['file']}.usdz"
        before = lf.stat().st_size + df.stat().st_size
        with tempfile.TemporaryDirectory() as tmp:
            l_layer = _unpack(lf, Path(tmp) / "l")
            d_layer = _unpack(df, Path(tmp) / "d")
            n_l, n_d = _strip_normals(l_layer), _strip_normals(d_layer)
            if _mesh_signature(l_layer) != _mesh_signature(d_layer):
                # Different geometry: keep two files, still without normals (A3).
                _pack(l_layer, lf)
                _pack(d_layer, df)
                print(f"[slim] A3 {lp['part']}: geometry differs, kept separate, normals removed ({n_l}+{n_d})")
                continue
            l_tex = sorted((l_layer.parent / "textures").glob("*"))
            d_tex = sorted((d_layer.parent / "textures").glob("*"))
            if len(l_tex) != 1 or len(d_tex) != 1:
                raise RuntimeError(f"{lp['part']}: expected one texture per look, got {l_tex} / {d_tex}")
            # A look still on the shared file shows the texture its manifest names, not the one
            # packed inside (that one is the light texture): after re-exporting only the light
            # look, the dark look must keep its own baked texture (review #942).
            for look, layer_tex in ((lp, l_tex), (dp, d_tex)):
                if look["file"] == shared and look.get("texture"):
                    own = next((app / f"{look['texture']}{ext}" for ext in (".jpg", ".png")
                                if (app / f"{look['texture']}{ext}").exists()), None)
                    if own is None:
                        raise RuntimeError(f"{lp['part']}: manifest texture {look['texture']} is missing")
                    layer_tex[0] = own
            # Pack to a temporary name first: after a first run one of the inputs IS the shared
            # file (one look re-exported alone with --looks), so deleting inputs must never
            # touch the output (review #939).
            out = app / f"{shared}.usdz"
            staged = app / f"{shared}.staged.usdz"
            _pack(l_layer, staged)
            lp["file"] = shared
            dp["file"] = shared
            dp.pop("texture", None)
            if l_tex[0].read_bytes() != d_tex[0].read_bytes():
                out_tex = app / f"gym_room_dark_{lp['part']}{d_tex[0].suffix}"
                if d_tex[0].resolve() != out_tex.resolve():
                    shutil.copyfile(d_tex[0], out_tex)
                dp["texture"] = out_tex.stem
            for old_input in {lf, df}:
                if old_input.resolve() != out.resolve() and old_input.exists():
                    old_input.unlink()
            staged.replace(out)
        after = (app / f"{shared}.usdz").stat().st_size + (
            (app / f"{dp['texture']}{d_tex[0].suffix}").stat().st_size if "texture" in dp else 0)
        print(f"[slim] A2+A3 {lp['part']}: {before / 1e6:.2f} -> {after / 1e6:.2f} MB")
    light_path.write_text(json.dumps(light, ensure_ascii=False, indent=2) + "\n")
    dark_path.write_text(json.dumps(dark, ensure_ascii=False, indent=2) + "\n")


# ── A4 ──────────────────────────────────────────────────────────────────────────

def _slerp(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
    """Per-joint slerp of unit quaternions (J, 4); component order does not matter."""
    dot = np.sum(a * b, axis=1, keepdims=True)
    b = np.where(dot < 0, -b, b)
    dot = np.abs(dot).clip(-1.0, 1.0)
    theta = np.arccos(dot)
    s = np.sin(theta)
    small = s < 1e-6
    wa = np.where(small, 1.0 - t, np.sin((1.0 - t) * theta) / np.where(small, 1.0, s))
    wb = np.where(small, t, np.sin(t * theta) / np.where(small, 1.0, s))
    return wa * a + wb * b


def _angle_deg(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    d = np.abs(np.sum(a * b, axis=1)).clip(0.0, 1.0)
    return np.degrees(2.0 * np.arccos(d))


def decimate(times: list[float], quats: np.ndarray, tol_deg: float) -> tuple[list[int], float]:
    """Greedy: from each kept frame, reach as far as slerp stays within tol on every joint."""
    keep = [0]
    worst = 0.0
    a = 0
    n = len(times)
    while a < n - 1:
        b = a + 1
        best_err = 0.0
        while b + 1 < n:
            cand = b + 1
            err = 0.0
            for k in range(a + 1, cand):
                t = (times[k] - times[a]) / (times[cand] - times[a])
                err = max(err, float(_angle_deg(_slerp(quats[a], quats[cand], t), quats[k]).max()))
                if err > tol_deg:
                    break
            if err > tol_deg:
                break
            b, best_err = cand, err
        keep.append(b)
        worst = max(worst, best_err)
        a = b
    return keep, worst


def a4_motion(app: Path, tol_deg: float) -> None:
    for usdz in sorted(app.glob("*_motion.usdz")):
        before = usdz.stat().st_size
        with tempfile.TemporaryDirectory() as tmp:
            layer = _unpack(usdz, Path(tmp))
            stage = Usd.Stage.Open(str(layer))
            # Once only: decimating already-decimated samples would add a second error on top
            # of the first, past the tolerance.
            if "ascnd:a4_tolerance_deg" in stage.GetRootLayer().customLayerData:
                print(f"[slim] A4 {usdz.name}: already decimated, skipped")
                continue
            done = False
            for prim in stage.Traverse():
                if not prim.IsA(UsdSkel.Animation):
                    continue
                attr = UsdSkel.Animation(prim).GetRotationsAttr()
                times = attr.GetTimeSamples()
                if len(times) < 3:
                    continue
                quats = np.stack([np.array([[q.GetReal(), *q.GetImaginary()] for q in attr.Get(t)], dtype=np.float64)
                                  for t in times])
                quats /= np.linalg.norm(quats, axis=2, keepdims=True)
                keep, worst = decimate(list(times), quats, tol_deg)
                if len(keep) == len(times):
                    continue
                drop = set(range(len(times))) - set(keep)
                for i in sorted(drop):
                    attr.ClearAtTime(times[i])
                print(f"[slim] A4 {usdz.name}: {len(times)} -> {len(keep)} samples, worst {worst:.3f} deg")
                done = True
            if done:
                data = dict(stage.GetRootLayer().customLayerData)
                data["ascnd:a4_tolerance_deg"] = tol_deg
                stage.GetRootLayer().customLayerData = data
                _save_compact(stage, layer)
                _pack(layer, usdz)
        print(f"[slim] A4 {usdz.name}: {before / 1e6:.3f} -> {usdz.stat().st_size / 1e6:.3f} MB")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", default=str(APP))
    parser.add_argument("--only", default="a1,a2,a4", help="comma list of a1, a2 (includes a3), a4")
    parser.add_argument("--tolerance-deg", type=float, default=0.25)
    args = bl_util.script_args(parser)
    app = Path(args.app)
    steps = {s.strip() for s in args.only.split(",")}
    if "a1" in steps:
        a1_placeholder_textures(app)
    if "a2" in steps:
        a2_a3_room(app)
    if "a4" in steps:
        a4_motion(app, args.tolerance_deg)


if __name__ == "__main__":
    main()
