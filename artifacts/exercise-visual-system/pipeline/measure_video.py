"""Measures an exercise in a licensed video and writes reference numbers for
an exercise spec. Part of the motion kit (docs/exercise-visual-system/MOTION_KIT.md).

    <venv>/bin/python pipeline/measure_video.py VIDEO.mp4 MODEL.task OUT.json \
        --source "Pexels 20672105" --license "Pexels License" [--joint wrist]

Runs MediaPipe Pose Landmarker (Apache 2.0, on-device CPU) on every frame
and keeps NUMBERS only: no footage, no per-frame skeleton is stored, so the
result is a measurement of the video, not a copy of it. What it reports:

* steady segments: stretches without camera cuts (a cut = the hip centre
  jumps more than 4 % of the frame between frames), at least 3 s long;
* repetitions inside each segment, from the main moving joint's distance
  to the shoulder/hip (default: the wrist for presses and pulls, the hip
  for squats and hinges), with the time of each top and bottom;
* per repetition: down / up durations and, at top and bottom, the joint
  angles measured two ways: from the 3D world landmarks and from the 2D
  image (side views keep 2D honest; 3D depth from one camera is biased,
  especially lying down — keep both and trust the one the camera angle
  supports);
* the main joint's path relative to the trunk, in trunk lengths.

The venv needs `mediapipe` and `opencv-python-headless`; Blender's Python
does not have them. Numbers go into exercise.json -> movement / technique
by hand or by the spec tooling, with the source recorded in
motion_provenance.
"""

from __future__ import annotations

import argparse
import datetime
import json

import numpy as np

SHO, ELB, WRI, HIP, KNE, ANK = (11, 12), (13, 14), (15, 16), (23, 24), (25, 26), (27, 28)
CUT_JUMP = 0.04
MIN_SEGMENT_S = 3.0


def detect(video: str, model: str):
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision

    opts = vision.PoseLandmarkerOptions(base_options=mpt.BaseOptions(model_asset_path=model),
                                        running_mode=vision.RunningMode.VIDEO, num_poses=1)
    cap = cv2.VideoCapture(video)
    fps = cap.get(cv2.CAP_PROP_FPS)
    w, h = cap.get(cv2.CAP_PROP_FRAME_WIDTH), cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
    img, world = [], []
    with vision.PoseLandmarker.create_from_options(opts) as lm:
        i = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)),
                                      int(i * 1000 / fps))
            if res.pose_landmarks:
                img.append([[p.x * w, p.y * h, p.visibility] for p in res.pose_landmarks[0]])
                world.append([[p.x, p.y, p.z] for p in res.pose_world_landmarks[0]])
            else:
                img.append(np.full((33, 3), np.nan))
                world.append(np.full((33, 3), np.nan))
            i += 1
    return fps, (w, h), np.array(img, dtype=float), np.array(world, dtype=float)


def angle(a, b, c):
    u, v = a - b, c - b
    cos = (u * v).sum(-1) / np.maximum(np.linalg.norm(u, axis=-1) * np.linalg.norm(v, axis=-1), 1e-12)
    return np.degrees(np.arccos(np.clip(cos, -1, 1)))


def fill_smooth(x: np.ndarray, k: int = 5) -> np.ndarray:
    x = x.copy()
    flat = x.reshape(len(x), -1)
    for c in range(flat.shape[1]):
        v = flat[:, c]
        bad = np.isnan(v)
        if bad.all():
            continue
        if bad.any():
            v[bad] = np.interp(np.nonzero(bad)[0], np.nonzero(~bad)[0], v[~bad])
        flat[:, c] = np.convolve(np.pad(v, (k // 2, k // 2), mode="edge"), np.ones(k) / k, mode="valid")
    return flat.reshape(x.shape)


def segments(img: np.ndarray, frame_wh, fps: float) -> list[tuple[int, int]]:
    hip = np.nanmean(img[:, HIP, :2], axis=1) / np.array(frame_wh)
    jump = np.linalg.norm(np.diff(hip, axis=0), axis=1)
    cuts = [0] + [i + 1 for i in np.nonzero(np.nan_to_num(jump, nan=1.0) > CUT_JUMP)[0]] + [len(img)]
    out = [(a, b) for a, b in zip(cuts, cuts[1:]) if (b - a) / fps >= MIN_SEGMENT_S]
    return out


def side_visible(img: np.ndarray, sl: slice) -> int:
    """0 = left, 1 = right: the side the camera sees better."""
    vis = [np.nanmean(img[sl, [SHO[s], ELB[s], WRI[s], HIP[s], KNE[s]], 2]) for s in (0, 1)]
    return int(np.argmax(vis))


def measure_segment(img, world, fps, a, b, joint: str) -> dict:
    sl = slice(a, b)
    s = side_visible(img, sl)
    i2, w3 = fill_smooth(img[sl, :, :2]), fill_smooth(world[sl])
    sho, elb, wri, hip, kne, ank = (i2[:, j[s]] for j in (SHO, ELB, WRI, HIP, KNE, ANK))
    trunk = sho - hip
    L = np.linalg.norm(trunk, axis=1, keepdims=True)
    ax = trunk / L
    perp = np.stack([ax[:, 1], -ax[:, 0]], 1)
    moving = wri if joint == "wrist" else hip
    origin = sho if joint == "wrist" else ank
    rel = moving - origin
    along, across = (rel * ax).sum(1) / L[:, 0], (rel * perp).sum(1) / L[:, 0]
    sig = across if np.ptp(across) >= np.ptp(along) else along
    if np.nanmean(sig) < 0:
        sig = -sig
    h = (sig - sig.min()) / max(np.ptp(sig), 1e-9)
    win = max(3, int(0.25 * fps))
    tops = [i for i in range(win, len(h) - win) if h[i] == h[i - win:i + win + 1].max() and h[i] > 0.7]
    bots = [i for i in range(win, len(h) - win) if h[i] == h[i - win:i + win + 1].min() and h[i] < 0.3]
    ang2 = {"elbow": angle(sho, elb, wri), "knee": angle(hip, kne, ank), "hip": angle(sho, hip, kne)}
    w3s = {k: w3[:, j[s]] for k, j in zip(("sho", "elb", "wri", "hip", "kne", "ank"), (SHO, ELB, WRI, HIP, KNE, ANK))}
    ang3 = {"elbow": angle(w3s["sho"], w3s["elb"], w3s["wri"]), "knee": angle(w3s["hip"], w3s["kne"], w3s["ank"]),
            "hip": angle(w3s["sho"], w3s["hip"], w3s["kne"])}
    events = sorted([(i, "top") for i in tops] + [(i, "bottom") for i in bots])
    reps = []
    for (i0, e0), (i1, e1), (i2_, e2) in zip(events, events[1:], events[2:]):
        if (e0, e1, e2) == ("top", "bottom", "top"):
            reps.append({
                "top_s": round((a + i0) / fps, 2), "bottom_s": round((a + i1) / fps, 2), "end_s": round((a + i2_) / fps, 2),
                "down_s": round((i1 - i0) / fps, 2), "up_s": round((i2_ - i1) / fps, 2),
                "angles_2d_top": {k: round(float(v[i0]), 1) for k, v in ang2.items()},
                "angles_2d_bottom": {k: round(float(v[i1]), 1) for k, v in ang2.items()},
                "angles_3d_top": {k: round(float(v[i0]), 1) for k, v in ang3.items()},
                "angles_3d_bottom": {k: round(float(v[i1]), 1) for k, v in ang3.items()},
                "path_trunk_lengths": {"along_top": round(float(along[i0]), 3), "along_bottom": round(float(along[i1]), 3),
                                       "across_top": round(float(across[i0]), 3), "across_bottom": round(float(across[i1]), 3)},
            })
    return {"start_s": round(a / fps, 2), "end_s": round(b / fps, 2), "side": "left" if s == 0 else "right",
            "visibility": round(float(np.nanmean(img[sl, [SHO[s], ELB[s], WRI[s], HIP[s]], 2])), 2), "reps": reps}


def summarise(segs: list[dict]) -> dict:
    reps = [r for sg in segs for r in sg["reps"]]
    if not reps:
        return {"reps": 0}
    def med(key, sub, j):
        return round(float(np.median([r[key][j] for r in reps])), 1)
    return {"reps": len(reps), "down_s_median": round(float(np.median([r["down_s"] for r in reps])), 2),
            "up_s_median": round(float(np.median([r["up_s"] for r in reps])), 2),
            **{f"{j}_{w}_{d}_median": med(f"angles_{d}_{w}", None, j) for j in ("elbow", "knee", "hip")
               for w in ("top", "bottom") for d in ("2d", "3d")}}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("model"); ap.add_argument("out")
    ap.add_argument("--source", required=True); ap.add_argument("--license", required=True)
    ap.add_argument("--joint", choices=("wrist", "hip"), default="wrist")
    args = ap.parse_args()
    fps, wh, img, world = detect(args.video, args.model)
    segs = [measure_segment(img, world, fps, a, b, args.joint) for a, b in segments(img, wh, fps)]
    result = {"tool": "pipeline/measure_video.py", "pose_model": "MediaPipe Pose Landmarker heavy (Apache 2.0)",
              "measured": datetime.date.today().isoformat(), "source": args.source, "license": args.license,
              "note": "Numbers measured from the video; no footage or per-frame skeleton is stored.",
              "frames": int(len(img)), "detected": int(np.isfinite(img[:, 0, 0]).sum()), "fps": round(fps, 3),
              "segments": segs, "summary": summarise(segs)}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(json.dumps(result["summary"], indent=1))


if __name__ == "__main__":
    main()
