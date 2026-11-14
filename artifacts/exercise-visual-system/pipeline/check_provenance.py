"""Kiểm tra nguồn gốc dữ liệu chuyển động (chính sách nguồn của ASCND).

    python3 pipeline/check_provenance.py [--root DIR]

Chính sách (docs/exercise-visual-system/OPENGYM3D_LESSONS.md, Kiệt 14/11):
dữ liệu chuyển động xuất xưởng phải thuộc về ASCND — CMU mocap và Mixamo
bị cấm (cấm bán lại dữ liệu kể cả đã chuyển đổi; cấm phát lại file, không
dùng kể cả làm mẫu để tránh phái sinh). Mỗi bài ghi nguồn gốc trong
``exercise.json`` (``motion_provenance``) để chứng minh quyền sở hữu.

Kiểm tra, trên cây kit (mặc định: thư mục cha của ``pipeline/``):

1. Mọi ``exercise.json`` có ``motion_provenance`` là danh sách không rỗng,
   mỗi mục có ``what`` / ``source`` / ``license`` không rỗng; và
   ``motion_source_id`` / ``motion_source_type`` /
   ``motion_source_license`` không rỗng.
2. Quét file văn bản trong kit tìm dấu vết nguồn cấm (Mixamo, CMU, Carnegie
   Mellon, mocap) và quét tên file tìm định dạng dữ liệu mocap của bên thứ
   ba (``.bvh``, ``.c3d``, ``.fbx``, ``.trc``). Ngoại lệ duy nhất là
   ``ALLOWLIST`` dưới đây: file muốn nhắc nguồn cấm phải vào đây một cách
   có chủ ý, kèm lý do — không có chuyện tự nhiên lọt qua.
3. Giới hạn đã biết: nội dung file nhị phân (``.blend``, ``.usdz``, ``.glb``,
   ảnh, ``.npz``) không quét chuỗi được một cách đáng tin (dữ liệu nén che
   chuỗi; chuỗi 3 byte xuất hiện ngẫu nhiên trong dữ liệu nhị phân gây
   dương tính giả). Với file nhị phân chỉ quét tên file và định dạng.
   Dữ liệu nhị phân vào kit phải qua pipeline của repo và có provenance
   ở mục 1.

Thoát 0 khi đạt, 1 khi có vi phạm. Không sửa file nào.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# (mẫu, tên): mẫu quét trên nội dung file văn bản (không phân biệt hoa thường)
# và trên tên file. "cmu" và "mocap" bắt theo ranh giới từ để không khớp giữa
# chừng một từ khác; "mixamo" và "carnegie mellon" không nằm trong từ nào khác.
BANNED_PATTERNS = (
    (re.compile(r"mixamo", re.IGNORECASE), "mixamo"),
    (re.compile(r"\bcmu\b", re.IGNORECASE), "cmu"),
    (re.compile(r"carnegie mellon", re.IGNORECASE), "carnegie-mellon"),
    (re.compile(r"\bmocap\b", re.IGNORECASE), "mocap"),
)

# Định dạng file mang dữ liệu chuyển động của bên thứ ba: cấm xuất hiện trong
# kit trừ khi có mục allowlist ghi rõ lý do.
BANNED_EXTENSIONS = {".bvh", ".c3d", ".fbx", ".trc"}

# Chỉ quét nội dung các file văn bản (xem giới hạn ở docstring).
TEXT_EXTENSIONS = {".py", ".json", ".md", ".txt", ".csv", ".yml", ".yaml", ".usda"}

# (đường dẫn tương đối tính từ gốc kit, tên mẫu, lý do). Danh sách này phải
# luôn đúng sự thật: mục nào không còn khớp gì nữa thì xóa đi.
ALLOWLIST = {
    # README nhắc "mocap" trong hai câu phủ nhận/giả thuyết, không phải nguồn
    # dữ liệu: "không phải mocap" (chuyển động key tay) và "mocap bằng mô hình
    # học sâu (nếu tìm được giấy phép thương mại)" (ước tính GPU tương lai).
    ("README.md", "mocap"): "câu phủ nhận + giả thuyết tương lai, không phải nguồn dữ liệu",
    # Script này tự định nghĩa blocklist nên buộc phải nhắc tên các nguồn cấm.
    ("pipeline/check_provenance.py", "mixamo"): "định nghĩa blocklist",
    ("pipeline/check_provenance.py", "cmu"): "định nghĩa blocklist",
    ("pipeline/check_provenance.py", "carnegie-mellon"): "định nghĩa blocklist",
    ("pipeline/check_provenance.py", "mocap"): "định nghĩa blocklist",
    # Fixture của test_provenance.py cố tình chứa tên nguồn cấm để kiểm tra
    # blocklist bắt được thật.
    ("tests/test_provenance.py", "mixamo"): "fixture kiểm tra blocklist",
    ("tests/test_provenance.py", "cmu"): "fixture kiểm tra blocklist",
    ("tests/test_provenance.py", "carnegie-mellon"): "fixture kiểm tra blocklist",
    ("tests/test_provenance.py", "mocap"): "fixture kiểm tra blocklist",
}

REQUIRED_SOURCE_FIELDS = ("motion_source_id", "motion_source_type", "motion_source_license")
PROVENANCE_FIELDS = ("what", "source", "license")


def _is_nonempty_str(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def check_exercise(exercise_json: Path, root: Path) -> list[str]:
    """Kiểm tra provenance của một file exercise.json. Trả về danh sách vi phạm."""
    rel = exercise_json.relative_to(root).as_posix()
    try:
        data = json.loads(exercise_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"{rel}: không đọc được JSON: {exc}"]
    if not isinstance(data, dict):
        return [f"{rel}: exercise.json phải là một object JSON"]
    violations = []
    provenance = data.get("motion_provenance")
    if not isinstance(provenance, list) or not provenance:
        violations.append(f"{rel}: thiếu motion_provenance (danh sách không rỗng)")
    else:
        for i, entry in enumerate(provenance):
            if not isinstance(entry, dict):
                violations.append(f"{rel}: motion_provenance[{i}] phải là một object")
                continue
            for field in PROVENANCE_FIELDS:
                if not _is_nonempty_str(entry.get(field)):
                    violations.append(f"{rel}: motion_provenance[{i}] thiếu {field} không rỗng")
    for field in REQUIRED_SOURCE_FIELDS:
        if not _is_nonempty_str(data.get(field)):
            violations.append(f"{rel}: thiếu {field} không rỗng")
    return violations


def check_blocklist(root: Path) -> list[str]:
    """Quét dấu vết nguồn cấm trong kit. Trả về danh sách vi phạm."""
    violations = []
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        rel = path.relative_to(root).as_posix()
        for pattern, name in BANNED_PATTERNS:
            if pattern.search(rel) and (rel, name) not in ALLOWLIST:
                violations.append(f"{rel}: tên file nhắc nguồn cấm ({name})")
        if path.suffix.lower() in BANNED_EXTENSIONS and (rel, path.suffix.lower()) not in ALLOWLIST:
            violations.append(f"{rel}: định dạng dữ liệu mocap của bên thứ ba ({path.suffix})")
        if path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            for pattern, name in BANNED_PATTERNS:
                if pattern.search(line) and (rel, name) not in ALLOWLIST:
                    violations.append(f"{rel}:{lineno}: nhắc nguồn cấm ({name})")
    return violations


def check(root: Path) -> list[str]:
    """Chạy toàn bộ kiểm tra trên cây kit. Trả về danh sách vi phạm (rỗng = đạt)."""
    violations = []
    exercise_files = sorted(root.rglob("exercise.json"))
    if not exercise_files:
        return [f"{root}: không tìm thấy exercise.json nào (sai --root?)"]
    for exercise_json in exercise_files:
        violations.extend(check_exercise(exercise_json, root))
    violations.extend(check_blocklist(root))
    return violations


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Kiểm tra nguồn gốc dữ liệu Motion Kit.")
    parser.add_argument("--root", type=Path,
                        default=Path(__file__).resolve().parent.parent,
                        help="gốc cây kit (mặc định: thư mục chứa pipeline/)")
    args = parser.parse_args(argv)
    violations = check(args.root)
    for violation in violations:
        print(f"FAIL {violation}")
    count = len(list(args.root.rglob("exercise.json")))
    if violations:
        print(f"[provenance] FAIL: {len(violations)} vi phạm trong {count} bài")
        return 1
    print(f"[provenance] PASS: {count} bài có provenance đầy đủ, không dấu vết nguồn cấm")
    return 0


if __name__ == "__main__":
    sys.exit(main())
