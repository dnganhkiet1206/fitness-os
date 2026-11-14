"""Tempo -> timeline.

A repetition is a sequence of phases (start hold, concentric, top hold,
eccentric, bottom hold). Inside a moving phase the progress follows the
minimum-jerk profile 10u^3 - 15u^4 + 6u^5 (Flash and Hogan 1985), the
standard model of smooth human point-to-point movement: zero velocity and
acceleration at both ends, bell-shaped speed in between. Holds keep the
progress constant.

`progress` is 0 at the start position and 1 at the end of the concentric
phase (top of a curl, lockout of a press, standing of a squat is 0...); a
family template decides what 0 and 1 mean for its joints.
"""

from __future__ import annotations

from dataclasses import dataclass


def min_jerk(u: float) -> float:
    u = min(max(u, 0.0), 1.0)
    return u * u * u * (10.0 + u * (-15.0 + 6.0 * u))


@dataclass
class Phase:
    id: str
    start_s: float
    end_s: float
    p0: float
    p1: float

    def progress(self, t: float) -> float:
        if self.end_s <= self.start_s:
            return self.p1
        return self.p0 + (self.p1 - self.p0) * min_jerk((t - self.start_s) / (self.end_s - self.start_s))


def build(tempo: dict) -> list[Phase]:
    """tempo: {"start_hold": s, "concentric": s, "top_hold": s, "eccentric": s,
    "bottom_hold": s, "reps": n, "end_hold": s}. `start_at` (0 or 1) says
    whether a repetition starts at progress 0 (curl, row, pulldown: the
    concentric comes first) or at 1 (press, squat: lowering first)."""
    start_at = float(tempo.get("start_at", 0.0))
    t = 0.0
    phases = [Phase("start_position", 0.0, tempo.get("start_hold", 0.5), start_at, start_at)]
    t = phases[-1].end_s
    first, second = (("concentric", 1.0), ("eccentric", 0.0)) if start_at == 0.0 else (("eccentric", 0.0), ("concentric", 1.0))
    hold_after_first = "top_hold" if start_at == 0.0 else "bottom_hold"
    hold_after_second = "bottom_hold" if start_at == 0.0 else "top_hold"
    p = start_at
    for r in range(int(tempo.get("reps", 1))):
        for pid, target, hold in ((first[0], first[1], hold_after_first), (second[0], second[1], hold_after_second)):
            d = float(tempo[pid])
            phases.append(Phase(pid if r == 0 else f"{pid}_{r + 1}", t, t + d, p, target))
            t, p = t + d, target
            h = float(tempo.get(hold, 0.0))
            if h > 0 and not (hold == hold_after_second and r == int(tempo.get("reps", 1)) - 1):
                phases.append(Phase(hold if r == 0 else f"{hold}_{r + 1}", t, t + h, p, p))
                t += h
    end = float(tempo.get("end_hold", 0.5))
    phases.append(Phase("finish", t, t + end, p, p))
    return phases


def progress_at(phases: list[Phase], t: float) -> float:
    for ph in phases:
        if t <= ph.end_s:
            return ph.progress(t)
    return phases[-1].p1


def duration(phases: list[Phase]) -> float:
    return phases[-1].end_s


def exercise_phases(phases: list[Phase], cues: dict | None = None) -> list[dict]:
    """exercise.json -> exercise_phases records (validation and the viewer use them)."""
    cues = cues or {}
    return [{"id": p.id, "name": p.id.replace("_", " ").capitalize(), "start_s": round(p.start_s, 3), "end_s": round(p.end_s, 3),
             "cues": cues.get(p.id.split("_2")[0], []), "checks": []} for p in phases]
