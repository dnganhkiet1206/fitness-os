"""ASCND Motion Lab factory: one command per exercise, or the whole catalogue.

    python3 pipeline/factory.py status
    python3 pipeline/factory.py build dumbbell-curl back-squat [--no-export] [--force]
    python3 pipeline/factory.py batch [--no-export]
    python3 pipeline/factory.py sheet back-squat
    python3 pipeline/factory.py character

character = the whole character chain in order (build, muscle atlas, fibre
phase, fibre directions, layered muscle sculpt, preview). Every step is
required by export_usdz; running them by hand once missed the phase atlas
(14/11, MOTION_KIT_LESSONS.md). After a new character, rebuild every
exercise: equipment that depends on the body (rack height, bar on the back)
is re-checked by the generators.

build = build_scene -> generate_exercise -> validate_motion -> review sheet
-> export_usdz (+ tempo.json and the poster next to the USDZ), with the time
of each step. Exercises without a Motion Lab
template (movement.template) keep their own animate script and validator.
An exercise with an approval_date is approved: it is never rebuilt unless
--force is given, so regeneration cannot silently replace approved assets.
Each build appends to <exercise>/factory_log.json (version, timings, QA).

sheet renders the review sheet with measured-angle overlays and
flagged-frame marks, and writes <exercise>/flagged_frames.json listing
every frame the gates flagged.

Blender is taken from $EVS_BLENDER when set, else the macOS install path,
so the factory also runs on Linux/CI without editing this file.
"""

from __future__ import annotations

import argparse
import datetime
import json
import re
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLENDER = os.environ.get(
    "EVS_BLENDER", "/Applications/Blender.app/Contents/MacOS/Blender"
)
# Whole-body review (Kiệt 14/11): orbit the character every 60 degrees at
# the start, middle and end of the first repetition, plus two high views, so
# arms, back, head, legs and the implement are checked from every side.
ORBIT = (0, 60, 120, 180, 240, 300)
HIGH = ("az30e55", "az210e55")


def blender(script: str, *args: str) -> tuple[bool, str, float]:
    t = time.time()
    p = subprocess.run([BLENDER, "-b", "--factory-startup", "--python-exit-code", "1", "--python", script, "--", *args],
                       cwd=ROOT, capture_output=True, text=True)
    out = p.stdout + p.stderr
    return p.returncode == 0 and "Traceback" not in out, out, round(time.time() - t, 1)


CHARACTER_CHAIN = ("pipeline/build_character.py --no-preview", "pipeline/bake_muscle_atlas.py",
                   "pipeline/refit_muscle_masks.py --debug", "pipeline/sculpt_trapezius.py",
                   "pipeline/bake_fiber_fields.py",
                   "pipeline/bake_fiber_directions.py", "pipeline/sculpt_muscles.py", "pipeline/build_character.py --preview-only")


def character(_args) -> None:
    t = time.time()
    for step in CHARACTER_CHAIN:
        script, *extra = step.split()
        ok, out, sec = blender(script, *extra)
        print(f"[factory] character: {step:45s} {'ok' if ok else 'FAILED'} in {sec}s")
        if not ok:
            print("\n".join(out.splitlines()[-12:]))
            raise SystemExit(1)
    print(f"[factory] character chain done in {round(time.time() - t, 1)}s")


def exercises() -> list[Path]:
    return sorted(p.parent for p in ROOT.glob("*/exercise.json"))


def load(ex: Path) -> dict:
    return json.loads((ex / "exercise.json").read_text(encoding="utf-8"))


def qa_summary(ex: Path) -> str:
    f = ex / "qa_report.json"
    if not f.exists():
        return "-"
    r = json.loads(f.read_text(encoding="utf-8"))
    counts = r.get("summary", {}).get("counts") or r.get("summary", {}).get("status_counts") or r.get("summary")
    return json.dumps(counts, ensure_ascii=False) if counts else "?"


def status(_args) -> None:
    print(f"{'exercise':18s} {'template':10s} {'pattern':18s} {'usdz':5s} {'prov':4s} QA")
    for ex in exercises():
        spec = load(ex)
        mv = spec.get("movement", {})
        usdz = any((ex / "usdz").glob("*.usdz")) if (ex / "usdz").exists() else False
        print(f"{ex.name:18s} {mv.get('template', '(script)'):10s} {mv.get('pattern', '-'):18s} {'yes' if usdz else 'no':5s} "
              f"{len(spec.get('motion_provenance', [])):<4d} {qa_summary(ex)}")


# A sheet still within this many frames of a flagged frame is marked NEAR
# (amber): same pose region, not the flagged frame itself.
FLAG_WINDOW_FRAMES = 12


def flagged_frames_from_report(report: dict) -> tuple[dict[int, list[dict]], list[dict]]:
    """Frames flagged by FAIL / REQUIRES_MANUAL_REVIEW checks, from a
    qa_report.json of either validator. Returns (frames -> checks, failing
    checks with no frame). The template validator records where.frame; the
    bench validator's report carries no structured per-frame data, so its
    failing checks land in the second list. PASS / NOT_TESTED / UNVERIFIED
    checks never flag a frame, and approval-category sign-offs (expert
    approval, mapping review) are lifecycle states, not gate measurements,
    so they are excluded too."""
    frames: dict[int, list[dict]] = {}
    without: list[dict] = []
    for c in report.get("checks", []):
        if c.get("status") not in ("FAIL", "REQUIRES_MANUAL_REVIEW"):
            continue
        if c.get("category") == "approval":
            continue
        where = c.get("where") or {}
        f = where.get("frame") if isinstance(where, dict) else None
        if isinstance(f, float) and f.is_integer():
            f = int(f)
        hit = {f} if isinstance(f, int) and not isinstance(f, bool) else set()
        # Mọi khung vượt ngưỡng, không chỉ khung cực trị (Devin #890: squat f0/f56/f112/f168).
        hit |= _frames_over_limit(c)
        if hit:
            for fr in sorted(hit):
                frames.setdefault(fr, []).append({"id": c["id"], "status": c["status"]})
        else:
            without.append({"id": c["id"], "status": c["status"]})
    return frames, without


_FRAME_VALUE = re.compile(r"\bf(\d+)\s+(?:p999\s+)?(-?\d+(?:\.\d+)?)")


def _frames_over_limit(c: dict) -> set[int]:
    """Khung có số đo vượt ngưỡng: ``per_frame`` (+ ``per_frame_limit`` hoặc ``limit`` số) nếu
    báo cáo có; báo cáo cũ thì đọc ``detail`` dạng "f56 3.818" / "f56 p999 3.818"."""
    limit = c.get("per_frame_limit", c.get("limit"))
    if isinstance(limit, bool) or not isinstance(limit, (int, float)):
        return set()
    values = c.get("per_frame")
    if isinstance(values, dict) and values:
        pairs = [(int(k), v) for k, v in values.items() if isinstance(v, (int, float))]
    else:
        pairs = [(int(m.group(1)), float(m.group(2))) for m in _FRAME_VALUE.finditer(c.get("detail") or "")]
    return {fr for fr, v in pairs if v > limit}


def frame_mark(frame: int, flagged: dict, window: int = FLAG_WINDOW_FRAMES) -> tuple[str, int] | None:
    """('flag', frame) if the frame itself was flagged, ('near', nearest
    flagged frame) if within the window, else None."""
    if frame in flagged:
        return ("flag", frame)
    near = [f for f in flagged if abs(f - frame) <= window]
    if near:
        return ("near", min(near, key=lambda f: abs(f - frame)))
    return None


def _ri(x: float) -> int:
    return int(x + 0.5)


def caption_lines(frame: int, label: str, metrics: dict | None) -> tuple[str, str, str]:
    """Three overlay caption lines for one sheet still: frame + row label,
    elbow/knee interior angles, trunk lean / hip flexion / arm elevation."""
    head = f"f{frame} · {label}"
    if not metrics:
        return head, "angles unavailable", ""

    def one(lo: float, hi: float) -> str:
        a, b = _ri(lo), _ri(hi)
        return f"{a}°" if a == b else f"{a}-{b}°"

    line2 = f"elbow {one(metrics['elbow_min_deg'], metrics['elbow_max_deg'])} · knee {one(metrics['knee_min_deg'], metrics['knee_max_deg'])}"
    line3 = (f"trunk {_ri(metrics['torso_lean_max_deg'])}° · hip {_ri(metrics['hip_flex_max_deg'])}° · "
             f"arm {_ri(metrics['arm_elev_max_deg'])}°")
    return head, line2, line3


def footer_text(flagged: dict, without: list[dict]) -> str:
    if flagged:
        parts = []
        for f in sorted(flagged):
            ids = ", ".join(f"{c['id']} {c['status']}" for c in flagged[f])
            parts.append(f"f{f} ({ids})")
        return "Flagged frames: " + "; ".join(parts) + ". See flagged_frames.json — review these closely + a random sample."
    if without:
        ids = ", ".join(f"{c['id']} {c['status']}" for c in without)
        return f"No frame-level flags in this QA report. Failing checks needing review: {ids}."
    return "No flagged frames: no FAIL / REQUIRES_MANUAL_REVIEW check with a frame. Review a random sample."


_FONT_CACHE: dict = {}


def _load_font(size: int, bold: bool = False):
    from PIL import ImageFont
    key = (size, bold)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]
    names = ["DejaVuSans-Bold.ttf", "DejaVuSans.ttf"] if bold else ["DejaVuSans.ttf"]
    bases = ["/usr/share/fonts/truetype/dejavu", "/usr/local/share/fonts",
             "/System/Library/Fonts/Supplemental", str(Path.home() / "Library" / "Fonts")]
    for base in bases:
        for name in names:
            p = Path(base) / name
            if p.exists():
                try:
                    font = ImageFont.truetype(str(p), size)
                    _FONT_CACHE[key] = font
                    return font
                except OSError:
                    pass
    font = ImageFont.load_default()
    _FONT_CACHE[key] = font
    return font


def _overlay_still(path: Path, lines: tuple[str, str, str], mark) -> None:
    """Caption bar under the still (the render itself is never covered) plus
    a red FLAGGED / amber NEAR border and tag when the frame is marked."""
    from PIL import Image, ImageDraw
    im = Image.open(path).convert("RGB")
    w, h = im.size
    bar_h = 56
    out = Image.new("RGB", (w, h + bar_h), "black")
    out.paste(im, (0, 0))
    d = ImageDraw.Draw(out)
    d.text((8, h + 4), lines[0], fill="white", font=_load_font(14, bold=True))
    d.text((8, h + 21), lines[1], fill="white", font=_load_font(13))
    if lines[2]:
        d.text((8, h + 37), lines[2], fill="white", font=_load_font(13))
    if mark:
        kind, ref = mark
        color = (220, 30, 30) if kind == "flag" else (240, 170, 0)
        for i in range(5):
            d.rectangle([i, i, w - 1 - i, h - 1 - i], outline=color)
        tag = "FLAGGED" if kind == "flag" else f"NEAR f{ref}"
        tf = _load_font(13, bold=True)
        tw = d.textlength(tag, font=tf)
        d.rectangle([0, 0, tw + 16, 22], fill=color)
        d.text((8, 3), tag, fill="white", font=tf)
    out.save(path)


def _add_footer(sheet_path: Path, text: str) -> None:
    from PIL import Image, ImageDraw
    im = Image.open(sheet_path).convert("RGB")
    footer_h = 30
    out = Image.new("RGB", (im.width, im.height + footer_h), "black")
    out.paste(im, (0, 0))
    d = ImageDraw.Draw(out)
    d.text((10, im.height + 7), text[:320], fill="white", font=_load_font(14))
    out.save(sheet_path)


def sheet(ex: Path, spec: dict) -> tuple[bool, float]:
    """Whole-body review sheet: rows = start / middle / end of the first
    repetition, columns = 6 orbit angles + 2 high views. Each still gets a
    caption with the measured joint angles at its frame (pipeline/
    sheet_data.py), a red border when the frame itself was flagged by the
    gates, and an amber border when it is near a flagged frame; the sheet
    footer names the flagged frames, and <exercise>/flagged_frames.json
    lists them all for targeted review."""
    phases = {p["id"]: p for p in spec.get("exercise_phases", [])}
    fps = int(spec["frame_rate"])
    mid = next((p for k, p in phases.items() if k in ("concentric", "eccentric")), None)
    a = 0
    b = int(round(mid["start_s"] * fps + 0.5 * (mid["end_s"] - mid["start_s"]) * fps)) if mid else 30
    c = int(round(mid["end_s"] * fps)) if mid else 60
    frames = {"a": a, "b": b, "c": c}
    labels = {"a": "start", "b": f"mid {mid['id']}" if mid else "mid", "c": f"end {mid['id']}" if mid else "end"}
    out_dir = ex / "_sheet"
    keys = [f"az{d}" for d in ORBIT] + list(HIGH)
    shots = " ".join(f"{k}:{a}:a,{b}:b,{c}:c" for k in keys)
    ok, _o, t = blender("pipeline/render_stills.py", "--exercise", ex.name, "--out-dir", str(out_dir),
                        "--shots", shots, "--width", "300", "--height", "460")
    angles: dict[int, dict] = {}
    if ok:
        aok, _o2, _t2 = blender("pipeline/sheet_data.py", "--exercise", ex.name, "--frames", f"{a},{b},{c}",
                                "--out", str(out_dir / "angles.json"))
        angles_path = out_dir / "angles.json"
        if aok and angles_path.exists():
            angles = {f["frame"]: f["metrics"] for f in json.loads(angles_path.read_text(encoding="utf-8"))["frames"]}
        else:
            print(f"[factory] sheet: angle sampling failed for {ex.name}, captions will show frames only")
    flagged, without = {}, []
    report_path = ex / "qa_report.json"
    if report_path.exists():
        flagged, without = flagged_frames_from_report(json.loads(report_path.read_text(encoding="utf-8")))
    note = ("Frames flagged by FAIL / REQUIRES_MANUAL_REVIEW checks in qa_report.json. The template validator records "
            "where.frame; the bench validator's report carries no structured per-frame data, so its failing checks are "
            "listed without frames. Review flagged frames closely plus a random sample. A sheet still whose own frame "
            f"is flagged gets a red border; a still within {FLAG_WINDOW_FRAMES} frames of a flagged frame gets an amber NEAR border.")
    if not report_path.exists():
        note = "No qa_report.json found; run validation first. " + note
    flagged_doc = {"exercise": ex.name, "source": "qa_report.json", "sheet_frames": frames,
                   "flagged_frames": [{"frame": f, "checks": flagged[f]} for f in sorted(flagged)],
                   "failing_checks_without_frames": without, "mark_window_frames": FLAG_WINDOW_FRAMES, "note": note}
    (ex / "flagged_frames.json").write_text(json.dumps(flagged_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if ok:
        try:
            import PIL  # noqa: F401  (the overlay needs Pillow; the sheet itself does not)
        except ImportError:
            print("[factory] sheet: Pillow (PIL) not installed, overlay skipped (pip install pillow)")
            have_pil = False
        else:
            have_pil = True
            for label, frame in frames.items():
                mark = frame_mark(frame, flagged)
                lines = caption_lines(frame, labels[label], angles.get(frame))
                for k in keys:
                    still = out_dir / f"still_{k}_{label}.png"
                    if still.exists():
                        _overlay_still(still, lines, mark)
        rows = []
        for label in ("a", "b", "c"):
            files = [out_dir / f"still_{k}_{label}.png" for k in keys]
            files = [f for f in files if f.exists()]
            row = out_dir / f"_row_{label}.png"
            cmd = ["ffmpeg", "-loglevel", "error", "-y"]
            for f in files:
                cmd += ["-i", str(f)]
            cmd += ["-filter_complex", f"hstack=inputs={len(files)}", str(row)]
            ok = ok and subprocess.run(cmd).returncode == 0
            rows.append(row)
        cmd = ["ffmpeg", "-loglevel", "error", "-y"]
        for r in rows:
            cmd += ["-i", str(r)]
        cmd += ["-filter_complex", "vstack=inputs=3", str(ex / "review_sheet.png")]
        ok = ok and subprocess.run(cmd).returncode == 0
        if ok and have_pil:
            _add_footer(ex / "review_sheet.png", footer_text(flagged, without))
    return ok, t


EYE = (0, 45, 90, 135, 180)


def eye_sheet(ex: Path, spec: dict) -> tuple[bool, float]:
    """What a person standing and watching sees (Kiệt 14/11): camera at eye
    height (1.6 m) from the front, three-quarter, side, rear three-quarter
    and back, at the start, middle and end of the first moving phase.
    Writes <exercise>/observer_sheet.png. Check the technique here: joint
    angles, bar/dumbbell path, trunk, head, feet, as a coach would."""
    phases = {p["id"]: p for p in spec.get("exercise_phases", [])}
    fps = int(spec["frame_rate"])
    mid = next((p for k, p in phases.items() if k in ("concentric", "eccentric")), None)
    a = int(round(mid["start_s"] * fps)) if mid else 0
    b = int(round((mid["start_s"] + 0.5 * (mid["end_s"] - mid["start_s"])) * fps)) if mid else 30
    c = int(round(mid["end_s"] * fps)) if mid else 60
    out_dir = ex / "_eye"
    keys = [f"eye{d}" for d in EYE]
    shots = " ".join(f"{k}:{a}:a,{b}:b,{c}:c" for k in keys)
    ok, _o, t = blender("pipeline/render_stills.py", "--exercise", ex.name, "--out-dir", str(out_dir),
                        "--shots", shots, "--width", "360", "--height", "540")
    if ok:
        rows = []
        for label in ("a", "b", "c"):
            files = [out_dir / f"still_{k}_{label}.png" for k in keys]
            row = out_dir / f"_row_{label}.png"
            cmd = ["ffmpeg", "-loglevel", "error", "-y"]
            for f in files:
                cmd += ["-i", str(f)]
            cmd += ["-filter_complex", f"hstack=inputs={len(files)}", str(row)]
            ok = ok and subprocess.run(cmd).returncode == 0
            rows.append(row)
        cmd = ["ffmpeg", "-loglevel", "error", "-y"]
        for r in rows:
            cmd += ["-i", str(r)]
        cmd += ["-filter_complex", "vstack=inputs=3", str(ex / "observer_sheet.png")]
        ok = ok and subprocess.run(cmd).returncode == 0
    return ok, t


def poster(ex: Path, spec: dict) -> tuple[bool, float]:
    """The card image the app shows before the 3D viewer opens: the
    three-quarter view (the viewer's default angle) halfway through the
    first moving phase, 960x540 JPEG, next to the USDZ."""
    phases = {p["id"]: p for p in spec.get("exercise_phases", [])}
    mid = next((p for k, p in phases.items() if k in ("concentric", "eccentric")), None)
    f = int(round((mid["start_s"] + 0.5 * (mid["end_s"] - mid["start_s"])) * int(spec["frame_rate"]))) if mid else 0
    tmp = ex / "_poster"
    ok, _o, t = blender("pipeline/render_stills.py", "--exercise", ex.name, "--out-dir", str(tmp),
                        "--shots", f"three_quarter:{f}:poster", "--width", "960", "--height", "540")
    out = ex / "usdz" / f"{ex.name.replace('-', '_')}_poster.jpg"
    ok = ok and subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(tmp / "still_3q_poster.png"), "-q:v", "4", str(out)]).returncode == 0
    return ok, t


def build(names: list[str], export: bool, force: bool) -> list[dict]:
    results = []
    for name in names:
        ex = ROOT / name
        spec = load(ex)
        if spec.get("approval_date") and not force:
            print(f"[factory] {name}: approved on {spec['approval_date']}, skipped (use --force)")
            continue
        steps, t0 = {}, time.time()
        template = spec.get("movement", {}).get("template")
        plan = [("scene", "pipeline/build_scene.py", ["--exercise", name])]
        if template:
            plan += [("generate", "pipeline/generate_exercise.py", ["--exercise", name]),
                     ("validate", "pipeline/validate_motion.py", ["--exercise", name])]
        else:
            script = next(ex.glob("animate_*.py"))
            plan += [("generate", str(script.relative_to(ROOT)), []),
                     ("validate", "pipeline/validate_animation.py", ["--exercise", name])]
        ok = True
        for step, script, args in plan:
            ok, out, t = blender(script, *args)
            steps[step] = {"ok": ok, "seconds": t}
            print(f"[factory] {name}: {step:9s} {'ok' if ok else 'FAILED'} in {t}s")
            if not ok:
                print("\n".join(out.splitlines()[-12:]))
                break
        if ok:
            spec = load(ex)  # phases written by the generator
            sok, t = sheet(ex, spec)
            steps["sheet"] = {"ok": sok, "seconds": t}
            print(f"[factory] {name}: sheet     {'ok' if sok else 'FAILED'} in {t}s -> {ex / 'review_sheet.png'}")
            if export:
                (ex / "usdz").mkdir(exist_ok=True)
                eok, _o, t = blender("pipeline/export_usdz.py", "--exercise", name, "--out-dir", str(ex / "usdz"))
                tempo_file = ex / "tempo.json"
                if eok and tempo_file.exists():  # P5: the app reads it next to the USDZ
                    (ex / "usdz" / f"{name.replace('-', '_')}_tempo.json").write_text(tempo_file.read_text(encoding="utf-8"), encoding="utf-8")
                steps["export"] = {"ok": eok, "seconds": t}
                print(f"[factory] {name}: export    {'ok' if eok else 'FAILED'} in {t}s")
                if eok:
                    pok, t = poster(ex, spec)
                    steps["poster"] = {"ok": pok, "seconds": t}
                    print(f"[factory] {name}: poster    {'ok' if pok else 'FAILED'} in {t}s")
        log_path = ex / "factory_log.json"
        log = json.loads(log_path.read_text(encoding="utf-8")) if log_path.exists() else []
        entry = {"version": len(log) + 1, "when": datetime.datetime.now().isoformat(timespec="seconds"), "template": template,
                 "steps": steps, "total_seconds": round(time.time() - t0, 1), "qa": qa_summary(ex)}
        log.append(entry)
        log_path.write_text(json.dumps(log, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        results.append({"exercise": name, **entry})
        print(f"[factory] {name}: v{entry['version']} done in {entry['total_seconds']}s, QA {entry['qa']}")
    return results


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    b = sub.add_parser("build"); b.add_argument("names", nargs="+"); b.add_argument("--no-export", action="store_true"); b.add_argument("--force", action="store_true")
    bt = sub.add_parser("batch"); bt.add_argument("--no-export", action="store_true"); bt.add_argument("--force", action="store_true")
    s = sub.add_parser("sheet"); s.add_argument("name")
    e = sub.add_parser("eye"); e.add_argument("names", nargs="+")
    sub.add_parser("character")
    args = ap.parse_args()
    if args.cmd == "status":
        status(args)
    elif args.cmd == "build":
        build(args.names, not args.no_export, args.force)
    elif args.cmd == "batch":
        names = [ex.name for ex in exercises() if load(ex).get("movement", {}).get("template")]
        t = time.time()
        res = build(names, not args.no_export, args.force)
        print(f"[factory] batch: {len(res)} exercises in {round(time.time() - t, 1)}s")
    elif args.cmd == "eye":
        for n in args.names:
            ok, t = eye_sheet(ROOT / n, load(ROOT / n))
            print(f"[factory] {n}: observer sheet {'ok' if ok else 'FAILED'} in {t}s -> {ROOT / n / 'observer_sheet.png'}")
    elif args.cmd == "character":
        character(args)
    elif args.cmd == "sheet":
        ex = ROOT / args.name
        ok, t = sheet(ex, load(ex))
        print(f"[factory] sheet {'ok' if ok else 'FAILED'} in {t}s -> {ex / 'review_sheet.png'}")


if __name__ == "__main__":
    main()
