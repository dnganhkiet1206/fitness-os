"""Cổng chặn hồi quy cho báo cáo QA của Motion Lab (validate_motion).

    python3 pipeline/check_qa_gate.py [--root DIR]
        [--exercise back-squat] [--exercise dumbbell-curl]

``validate_motion.py`` chỉ đo và ghi ``qa_report.json`` — nó không tự chặn
khi có FAIL, và ``factory.py`` cũng coi thoát 0 là xong. Script này là chỗ
chặn: đọc báo cáo MỚI CHẠY XONG và thoát 1 nếu có FAIL ngoài danh sách lỗi
đã biết dưới đây. Chạy trong CI ngay sau ``validate_motion``; chạy tay cũng
được, với báo cáo vừa chạy xong trong cây làm việc.

Lỗi đã biết (``KNOWN_FAILURES``) là lỗi đang tồn tại trên cây hiện tại, đã
đo và ghi rõ số đo. Cổng giữ nguyên chúng — không bắt sửa ngay trong PR
này, không nới ngưỡng — nhưng không cho lỗi MỚI nào lọt qua. Mục nào trong
danh sách mà nay đã PASS thì in cảnh báo lớn để người sửa xóa mục đó:
danh sách phải luôn đúng sự thật.

Trạng thái khác FAIL (``REQUIRES_MANUAL_REVIEW``, ``NOT_TESTED``) chỉ in ra,
không chặn: cổng giải phẫu cố tình trả REVIEW thay vì FAIL khi ngưỡng còn
tạm (``evs/movement_gate.py``).

Bench press KHÔNG qua cổng này: nó có validator sâu riêng
(``validate_animation.py``) và 3 FAIL đã biết (``skin_deformation``,
``elbow_tracking``, ``bench_contact``) — chặn nó ở đây sẽ đỏ mọi PR cho
tới khi 3 lỗi đó được sửa. Bench vẫn kiểm bằng tay theo quy trình cũ.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Bài template mà cổng kiểm theo mặc định (validate_motion chạy được cho cả hai).
DEFAULT_EXERCISES = ("back-squat", "dumbbell-curl")

# (bài, id kiểm tra) -> lý do. Số đo lấy từ lần chạy 14/11/2026, Blender 5.2.0.
KNOWN_FAILURES = {
    ("back-squat", "skin_stretch"): (
        "p99.9 edge stretch 3.284 so với giới hạn 2.6 ở khung 56: da giãn khi "
        "hông gập sâu, cùng loại với skin_deformation của bench press. Sửa "
        "bằng việc nhân vật/rig, không nới ngưỡng."
    ),
}


def check_report(report_path: Path, exercise: str) -> tuple[list[str], list[str]]:
    """Kiểm tra một báo cáo. Trả về (vi phạm, cảnh báo)."""
    if not report_path.is_file():
        return [f"{exercise}: thiếu {report_path} (validate_motion chưa chạy?)"], []
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"{exercise}: không đọc được {report_path}: {exc}"], []
    checks = report.get("checks")
    if not isinstance(checks, list):
        return [f"{exercise}: {report_path} không có danh sách checks (sai định dạng?)"], []
    violations, warnings = [], []
    status_by_id = {}
    for check in checks:
        if not isinstance(check, dict):
            continue
        check_id = check.get("id")
        status = check.get("status")
        status_by_id[check_id] = status
        if status == "FAIL" and (exercise, check_id) not in KNOWN_FAILURES:
            violations.append(
                f"{exercise}: FAIL {check_id} (đo {check.get('measured')}, "
                f"giới hạn {check.get('limit')})")
        elif status == "FAIL":
            print(f"[qa-gate] KNOWN-FAIL {exercise}/{check_id}: "
                  f"{KNOWN_FAILURES[(exercise, check_id)]}")
    for (known_exercise, known_id), reason in KNOWN_FAILURES.items():
        if known_exercise != exercise:
            continue
        if known_id not in status_by_id:
            warnings.append(
                f"{exercise}: lỗi đã biết {known_id} không còn trong báo cáo "
                f"— kiểm tra đã đổi tên hay bị xóa? ({reason})")
        elif status_by_id[known_id] != "FAIL":
            warnings.append(
                f"{exercise}: lỗi đã biết {known_id} nay đã hết FAIL — "
                f"xóa mục này khỏi KNOWN_FAILURES ({reason})")
    return violations, warnings


def check(root: Path, exercises: tuple[str, ...] = DEFAULT_EXERCISES) -> tuple[list[str], list[str]]:
    """Chạy cổng cho các bài đã cho. Trả về (vi phạm, cảnh báo)."""
    violations, warnings = [], []
    for exercise in exercises:
        report_path = root / exercise / "qa_report.json"
        exercise_violations, exercise_warnings = check_report(report_path, exercise)
        violations.extend(exercise_violations)
        warnings.extend(exercise_warnings)
    return violations, warnings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cổng chặn hồi quy cho báo cáo QA Motion Lab.")
    parser.add_argument("--root", type=Path,
                        default=Path(__file__).resolve().parent.parent,
                        help="gốc cây kit (mặc định: thư mục chứa pipeline/)")
    parser.add_argument("--exercise", action="append", dest="exercises", default=[],
                        help="bài cần chặn (lặp lại được; mặc định: bài template)")
    args = parser.parse_args(argv)
    exercises = tuple(args.exercises) if args.exercises else DEFAULT_EXERCISES
    violations, warnings = check(args.root, exercises)
    for warning in warnings:
        print(f"WARNING {warning}")
    for violation in violations:
        print(f"FAIL {violation}")
    if violations:
        print(f"[qa-gate] FAIL: {len(violations)} kiểm tra FAIL mới")
        return 1
    print(f"[qa-gate] PASS: {', '.join(exercises)} không có FAIL mới")
    return 0


if __name__ == "__main__":
    sys.exit(main())
