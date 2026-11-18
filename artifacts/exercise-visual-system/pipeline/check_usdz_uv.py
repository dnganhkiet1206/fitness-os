"""Đếm mặt có UV suy biến trong các file USDZ đã xuất (bài học mặt phẳng).

    Blender -b --factory-startup --python-exit-code 1 \\
        --python pipeline/check_usdz_uv.py -- <file.usdz>...

14/11/2026 (MOTION_KIT_LESSONS.md): miếng vá mặt của nhân vật được dựng
không có UV — cả 469 mặt dồn về một điểm UV — nên RealityKit không có
tiếp tuyến và đổ bóng phẳng, trong khi bản dựng Blender trông bình
thường. Cách phát hiện: đọc lại USDZ đã xuất, đếm mặt có diện tích UV
bằng 0. Mặt có diện tích UV 0 không lấy được tiếp tuyến.

Ngưỡng: diện tích UV < 1e-12. Đo 14/11 trên 6 file USDZ bài tập: mặt suy
biến cho đúng 0.0, mặt nhỏ nhất còn lại là 1.3e-07 — khoảng cách ba bậc,
ngưỡng nào trong khoảng cũng cho cùng kết quả.

Lưới không có lớp UV nào (dụng cụ: tạ, thanh đòn) được bỏ qua và in ra:
không có UV để suy biến, không phải lỗi. Chỉ lớp UV đang hoạt động được
kiểm — đó là lớp trình xem dùng.

Cổng: file không có trong ``KNOWN_DEGENERATE`` phải có đúng 0 mặt suy
biến. File trong danh sách phải giữ đúng số mặt đã ghi: số đổi (tăng hay
giảm mà vẫn > 0) là file đã đổi mà tài liệu chưa theo kịp → FAIL để người
sửa cập nhật danh sách một cách có chủ ý. File trong danh sách mà nay về
0 thì in cảnh báo và cho qua — xóa mục đó khỏi danh sách.

Thoát 0 khi đạt, 1 khi có vi phạm (cần ``--python-exit-code 1`` để Blender
trả mã thoát này ra ngoài).
"""

from __future__ import annotations

import sys
from pathlib import Path

import bpy

# Diện tích UV dưới ngưỡng này coi như suy biến (xem docstring).
DEGENERATE_AREA_EPS = 1e-12

# Tên file -> (số mặt suy biến đã đo, lý do). Phải luôn đúng sự thật.
KNOWN_DEGENERATE = {
    # 469 mặt của miếng vá mặt dồn về một điểm UV. Lỗi đã sửa ở
    # pipeline/sculpt_muscles.py (cấp ô UV riêng cho miếng vá) nhưng file
    # USDZ của bench press xuất trước bản sửa và chưa xuất lại. Xuất lại
    # bench press từ pipeline hiện tại sẽ đưa số này về 0.
    "bench_press_animation.usdz": (
        469,
        "miếng vá mặt không có UV (bản xuất cũ, trước bản sửa sculpt_muscles.py); xuất lại bench press để xóa mục này",
    ),
}


def polygon_uv_area(uvs) -> float:
    """Diện tích 2D của một đa giác UV (quạt tam giác từ đỉnh đầu)."""
    area = 0.0
    for i in range(1, len(uvs) - 1):
        x1, y1 = uvs[0]
        x2, y2 = uvs[i]
        x3, y3 = uvs[i + 1]
        area += abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)) / 2.0
    return area


def count_degenerate(path: Path) -> tuple[dict[str, tuple[int, int]], list[str]]:
    """Nhập một USDZ, đếm mặt suy biến theo từng lưới.

    Trả về ({tên lưới: (số mặt suy biến, tổng số mặt)}, [lưới bỏ qua]).
    """
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.usd_import(filepath=str(path))
    counts: dict[str, tuple[int, int]] = {}
    skipped: list[str] = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        if not mesh.uv_layers:
            skipped.append(obj.name)
            continue
        uv_data = mesh.uv_layers.active.data
        degenerate = 0
        for polygon in mesh.polygons:
            uvs = [uv_data[loop].uv for loop in polygon.loop_indices]
            if polygon_uv_area(uvs) < DEGENERATE_AREA_EPS:
                degenerate += 1
        counts[obj.name] = (degenerate, len(mesh.polygons))
    return counts, skipped


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not argv:
        print("[uv] FAIL: không có file USDZ nào được truyền")
        raise SystemExit(1)
    failures: list[str] = []
    for arg in argv:
        path = Path(arg)
        if not path.is_file():
            failures.append(f"{arg}: không tìm thấy file")
            continue
        try:
            counts, skipped = count_degenerate(path)
        except Exception as exc:  # nhập lỗi là lỗi cổng: in rõ ra, không nuốt
            failures.append(f"{arg}: nhập USDZ lỗi: {exc}")
            continue
        total = sum(n for n, _ in counts.values())
        detail = ", ".join(f"{name} {n}/{total_polys}" for name, (n, total_polys) in counts.items())
        for name in skipped:
            print(f"[uv] {path}: lưới {name} không có lớp UV, bỏ qua")
        print(f"[uv] {path}: {total} mặt suy biến ({detail})")
        expected, reason = KNOWN_DEGENERATE.get(path.name, (0, ""))
        if total == 0 and expected > 0:
            print(f"[uv] WARNING {path}: số mặt suy biến nay đã về 0 — "
                  f"xóa mục này khỏi KNOWN_DEGENERATE ({reason})")
        elif total != expected:
            failures.append(
                f"{path}: {total} mặt suy biến, kỳ vọng {expected}"
                + (f" ({reason})" if reason else ""))
    if failures:
        for failure in failures:
            print(f"[uv] FAIL: {failure}")
        raise SystemExit(1)
    print(f"[uv] PASS: {len(argv)} file USDZ, không có mặt suy biến mới")
    raise SystemExit(0)


if __name__ == "__main__":
    main()
