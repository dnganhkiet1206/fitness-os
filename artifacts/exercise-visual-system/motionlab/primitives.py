"""Reusable joint-level building blocks (numpy). World frame: metres, Z up,
the character faces -Y, its left side is +X."""

from __future__ import annotations

import math

import numpy as np

FORWARD = np.array([0.0, -1.0, 0.0])
UP = np.array([0.0, 0.0, 1.0])
LEFT = np.array([1.0, 0.0, 0.0])


def unit(v) -> np.ndarray:
    v = np.asarray(v, dtype=float)
    return v / max(float(np.linalg.norm(v)), 1e-12)


def rotation(axis, degrees: float) -> np.ndarray:
    """3x3 rotation about an axis (Rodrigues), right-handed."""
    a = unit(axis)
    t = math.radians(degrees)
    k = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(t) * k + (1 - math.cos(t)) * (k @ k)


def matrix(rot3: np.ndarray, translation) -> np.ndarray:
    m = np.eye(4)
    m[:3, :3] = rot3
    m[:3, 3] = translation
    return m


def arm_directions(side: str, shoulder_flexion: float, abduction: float, elbow_flexion: float) -> tuple[np.ndarray, np.ndarray]:
    """Upper-arm and forearm unit directions for an arm hanging from the
    shoulder: shoulder flexion swings the arm forward (sagittal), abduction
    out to the side (frontal), then the elbow flexes the forearm forward
    and up in the plane of the upper arm and the forward direction.
    Degrees; 0/0/0 = arm straight down."""
    s = 1.0 if side == "l" else -1.0
    down = -UP
    upper = rotation(LEFT, -shoulder_flexion) @ down       # +flexion: down -> forward (-Y)
    upper = rotation(FORWARD, s * abduction) @ upper       # +abduction: away from the body
    # Elbow flexion about the body's left-right axis, made perpendicular to
    # the upper arm: the forearm stays in a parasagittal plane and the hand
    # rises in front of the shoulder (a curl), it does not cross the chest
    # when the upper arm is slightly abducted.
    axis = LEFT - upper * np.dot(LEFT, upper)
    axis = unit(axis) if np.linalg.norm(axis) > 1e-6 else LEFT
    fore = rotation(axis, -elbow_flexion) @ upper
    if np.dot(fore, FORWARD) < -1e-6 and elbow_flexion > 1:
        fore = rotation(axis, elbow_flexion) @ upper
    return unit(upper), unit(fore)


def two_bone_knee(hip, ankle, thigh_len: float, shin_len: float, forward=FORWARD) -> np.ndarray:
    """Knee position of a two-bone leg, bending forward (law of cosines)."""
    hip, ankle = np.asarray(hip, float), np.asarray(ankle, float)
    d = min(float(np.linalg.norm(ankle - hip)), thigh_len + shin_len - 1e-6)
    n = unit(ankle - hip)
    a = (d * d + thigh_len ** 2 - shin_len ** 2) / (2 * d)
    h = math.sqrt(max(thigh_len ** 2 - a * a, 0.0))
    bend = unit(np.asarray(forward, float) - n * np.dot(forward, n))
    return hip + n * a + bend * h
