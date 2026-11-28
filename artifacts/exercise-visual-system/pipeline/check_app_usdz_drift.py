"""Kiểm bản USDZ trong app có đúng là bản kit hiện tại đã thu gọn (Master Audit 28/11, P1-08 / W5 §5).

    Blender -b --factory-startup --python-exit-code 1 --python pipeline/check_app_usdz_drift.py

Bản trong ``apps/ios/ASCND/Resources/ExerciseDemos`` không trùng byte với bản trong kit: sau mỗi lần
xuất, ``slim_app_usdz.py`` thay ảnh da cũ bằng ảnh 4×4 (A1) và lọc khung chuyển động (A4). Nên so
trùng byte là sai — báo lệch giả cho mọi tệp. Script này làm lại đúng các bước đó trên một bản sao
của tệp kit trong thư mục tạm, rồi so **nội dung USD** (lớp gốc xuất ra dạng text ``.usda``, bỏ dòng
``doc``/thời điểm) với bản trong app. Khác nhau = app chưa xuất lại sau khi kit đổi, hoặc app bị sửa
tay không qua kit. Thoát 1 khi có lệch.

Ánh xạ app → kit:
* ``character_<n>.usdz`` / ``apparel_shorts[_<n>].usdz`` ← ``characters/master_character_<n>/usdz/``
* ``<bài>_motion.usdz`` ← ``<thư mục bài>/usdz_split/`` (hoặc ``usdz/``)
* ``equipment_*.usdz`` ← ``equipment/`` (không thu gọn: phải trùng nội dung)
Không kiểm: phòng gym (A2/A3 ghép phòng sáng/tối), ``bench_press_animation.usdz`` (bản cũ, có cổng
riêng). Tệp app không tìm thấy nguồn trong kit thì báo, không chặn (ghi rõ để người sau thêm nguồn).
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pxr import Sdf  # noqa: E402

import slim_app_usdz as slim  # noqa: E402
from evs import bl_util  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT.parent.parent / "apps" / "ios" / "ASCND" / "Resources" / "ExerciseDemos"
SKIP = ("gym_room_", "bench_press_animation")


def kit_source(name: str) -> Path | None:
    m = re.fullmatch(r"character_(\d+)\.usdz", name) or re.fullmatch(r"apparel_shorts(?:_(\d+))?\.usdz", name)
    if m:
        num = m.group(1) or "003"
        p = ROOT / "characters" / f"master_character_{num}" / "usdz" / name
        return p if p.exists() else None
    if name.endswith("_motion.usdz"):
        hits = sorted(ROOT.glob(f"*/usdz_split/{name}")) or sorted(ROOT.glob(f"*/usdz/{name}"))
        return hits[0] if hits else None
    if name.startswith("equipment_"):
        p = ROOT / "equipment" / name
        return p if p.exists() else None
    return None


def signature(usdz: Path) -> str:
    """Hash nội dung: lớp gốc dạng text + từng tệp phụ (ảnh) trong gói."""
    h = hashlib.sha256()
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(usdz) as z:
            z.extractall(tmp)
            names = sorted(z.namelist())
        root = next(n for n in names if n.endswith((".usdc", ".usda")))
        text = Sdf.Layer.FindOrOpen(str(Path(tmp) / root)).ExportToString()
        text = "\n".join(line for line in text.splitlines() if not line.strip().startswith(("doc =", "\"Blender")))
        h.update(text.encode())
        for n in names:
            if n != root and not n.endswith("/"):
                h.update(n.encode())
                h.update((Path(tmp) / n).read_bytes())
    return h.hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", default=str(APP))
    ap.add_argument("--tolerance-deg", type=float, default=0.25)
    args = bl_util.script_args(ap)
    app = Path(args.app)
    drift, missing, ok = [], [], 0
    with tempfile.TemporaryDirectory() as work:
        work = Path(work)
        pairs = []
        for f in sorted(app.glob("*.usdz")):
            if f.name.startswith(SKIP):
                continue
            src = kit_source(f.name)
            if src is None:
                missing.append(f.name)
                continue
            shutil.copy(src, work / f.name)
            pairs.append(f)
        # đúng các bước slim_app_usdz làm sau mỗi lần xuất (A1 tên cố định 003; A1 cho bản số khác
        # dùng cùng quy tắc nên gọi lại với tên đã đổi)
        slim.a1_placeholder_textures(work)
        for f in pairs:
            m = re.fullmatch(r"(character|apparel_shorts)_(\d+)\.usdz", f.name)
            if m and m.group(2) != "003":
                alias = "character_003.usdz" if m.group(1) == "character" else "apparel_shorts.usdz"
                if (work / alias).exists():
                    continue
                (work / f.name).rename(work / alias)
                slim.a1_placeholder_textures(work)
                (work / alias).rename(work / f.name)
        slim.a4_motion(work, args.tolerance_deg)
        for f in pairs:
            if signature(f) == signature(work / f.name):
                ok += 1
            else:
                drift.append(f.name)
    print(f"[drift] {ok} tệp khớp kit")
    for n in missing:
        print(f"[drift] KHÔNG CÓ NGUỒN trong kit (không chặn): {n}")
    for n in drift:
        print(f"[drift] LỆCH: {n} — app chưa xuất lại sau khi kit đổi (chạy export rồi slim_app_usdz.py)")
    if drift:
        sys.exit(1)


if __name__ == "__main__":
    main()
