"""Looks at the rendered videos themselves (decoded with ffmpeg at thumbnail
size): blank frames, flicker, and whether two cameras show the same motion at
the same time. Plain Python + numpy; needs the ffmpeg executable."""

from __future__ import annotations

import subprocess

import numpy as np

WIDTH, HEIGHT = 96, 54


def decode_gray(path, width: int = WIDTH, height: int = HEIGHT) -> np.ndarray:
    """All frames of a video as a (frames, height, width) uint8 array."""
    raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-vf", f"scale={width}:{height}:flags=area,format=gray",
         "-f", "rawvideo", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, height, width)


def frame_statistics(frames: np.ndarray) -> dict:
    f = frames.astype(np.float32)
    mean = f.mean(axis=(1, 2))
    spread = f.std(axis=(1, 2))
    motion = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2)) if len(f) > 1 else np.zeros(0)
    # Flicker is a change of overall brightness that the motion does not
    # explain: compare the brightness of the part of the picture that does
    # not move (pixels whose value barely changes over the whole clip).
    static = f.std(axis=0) < 1.0
    still_mean = f[:, static].mean(axis=1) if static.any() else mean
    return {
        "frames": int(len(f)),
        "blank_frames": [int(i) for i in np.flatnonzero(spread < 2.0)],
        "mean_brightness": [round(float(mean.min()), 2), round(float(mean.max()), 2)],
        "largest_brightness_step": round(float(np.abs(np.diff(mean)).max()), 3) if len(f) > 1 else 0.0,
        "static_area_fraction": round(float(static.mean()), 3),
        "static_area_brightness_step": round(float(np.abs(np.diff(still_mean)).max()), 4) if len(f) > 1 else 0.0,
        "motion": motion,
    }


def sync_score(motion_a: np.ndarray, motion_b: np.ndarray, max_lag: int = 6) -> dict:
    """How well two cameras agree on WHEN things move. Both series are the
    per-frame amount of change; if the cameras show the same timeline, they
    rise and fall together and the best alignment is at lag 0."""
    n = min(len(motion_a), len(motion_b))
    a = motion_a[:n] - motion_a[:n].mean()
    b = motion_b[:n] - motion_b[:n].mean()

    def corr(lag: int) -> float:
        x, y = (a[lag:], b[: n - lag]) if lag >= 0 else (a[: n + lag], b[-lag:])
        denom = float(np.linalg.norm(x) * np.linalg.norm(y))
        return float((x * y).sum() / denom) if denom > 0 else 0.0

    scores = {lag: corr(lag) for lag in range(-max_lag, max_lag + 1)}
    best = max(scores, key=scores.get)
    still_a = motion_a[:n] < 0.02
    still_b = motion_b[:n] < 0.02
    return {"best_lag_frames": int(best), "correlation_at_lag_0": round(scores[0], 4), "correlation_at_best_lag": round(scores[best], 4),
            "still_frames_agreement": round(float((still_a == still_b).mean()), 4)}
