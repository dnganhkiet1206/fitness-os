"""Per-repetition tempo timeline for the app (P5, MARKET_REVERSE_ANALYSIS.md).

The generator already knows every phase boundary of the animation
(motionlab/timing.py). This turns them into ``tempo.json``, shipped next to
the USDZ, so the app can pace a set from the same timeline the 3D demo
plays: a haptic at each turn, a rep counter that ticks when the demo
finishes a repetition, breathing hints and coaching cues at the right
moment.

Schema ``ascnd.tempo/1`` (all times in integer milliseconds from the start
of the animation):

    {
      "schema": "ascnd.tempo/1",
      "exercise_id": "...", "frame_rate": 30, "duration_ms": 9000,
      "starts_at": "bottom" | "top",       # where a repetition starts
      "notation": "2-0.3-1.6-0.5",         # eccentric-bottom-concentric-top, seconds
      "reps": [
        {"index": 1, "start_ms": ..., "end_ms": ...,
         "phases": [{"kind": "eccentric", "start_ms": ..., "end_ms": ...,
                     "from": 1.0, "to": 0.0, "breath": "inhale"}, ...]}
      ],
      "marks": [{"at_ms": ..., "type": "turn" | "rep_complete", "rep": 1}],
      "cues": [{"at_ms": ..., "rep": 1, "phase": "concentric", "text": "..."}]
    }

``from``/``to`` are the family's progress values (0 = start of the
concentric, 1 = its end), so the app can scrub or loop one repetition.

Breathing follows the usual coaching rule for resistance training: breathe
out during the effort (concentric), in during the lowering (eccentric),
hold briefly at the turns (NSCA, Essentials of Strength Training and
Conditioning, 4th ed., ch. 15). Bracing for heavy lifts is a coach's call
and is not encoded.
"""

from __future__ import annotations

from .timing import Phase

SCHEMA = "ascnd.tempo/1"
BREATH = {"concentric": "exhale", "eccentric": "inhale"}


def _kind(pid: str) -> str:
    """'eccentric_2' -> 'eccentric'."""
    head, _, tail = pid.rpartition("_")
    return head if tail.isdigit() and head else pid


def _ms(s: float) -> int:
    return int(round(s * 1000.0))


def notation(tempo: dict) -> str:
    """Tempo notation eccentric-bottom-concentric-top in seconds (the
    common 4-number form, e.g. 3-1-2-0)."""
    def f(x: float) -> str:
        return f"{float(x):g}"
    return "-".join(f(tempo.get(k, 0.0)) for k in ("eccentric", "bottom_hold", "concentric", "top_hold"))


def timeline(phases: list[Phase], tempo: dict, exercise_id: str, frame_rate: int, cues: dict | None = None) -> dict:
    """phases from timing.build(tempo). A repetition starts with its first
    moving phase and ends where the next repetition's first moving phase
    starts (the last one ends at the start of the finish hold)."""
    cues = cues or {}
    moving = {"concentric", "eccentric"}
    start_at = float(tempo.get("start_at", 0.0))
    first_kind = "concentric" if start_at == 0.0 else "eccentric"
    reps: list[dict] = []
    for ph in phases:
        k = _kind(ph.id)
        if k == "start_position" or k == "finish":
            continue
        if k == first_kind:
            reps.append({"index": len(reps) + 1, "phases": []})
        if not reps:
            continue
        reps[-1]["phases"].append({"kind": k, "start_ms": _ms(ph.start_s), "end_ms": _ms(ph.end_s),
                                   "from": round(ph.p0, 4), "to": round(ph.p1, 4), "breath": BREATH.get(k, "hold")})
    marks, cue_list = [], []
    for r in reps:
        r["start_ms"] = r["phases"][0]["start_ms"]
        r["end_ms"] = r["phases"][-1]["end_ms"]
        moves = [p for p in r["phases"] if p["kind"] in moving]
        for p in moves[:-1]:
            marks.append({"at_ms": p["end_ms"], "type": "turn", "rep": r["index"]})
        if moves:
            marks.append({"at_ms": moves[-1]["end_ms"], "type": "rep_complete", "rep": r["index"]})
        for p in r["phases"]:
            for text in cues.get(p["kind"], []):
                cue_list.append({"at_ms": p["start_ms"], "rep": r["index"], "phase": p["kind"], "text": text})
    setup = [{"at_ms": 0, "rep": 0, "phase": "start_position", "text": t} for t in cues.get("start_position", [])]
    return {"schema": SCHEMA, "exercise_id": exercise_id, "frame_rate": int(frame_rate),
            "duration_ms": _ms(phases[-1].end_s), "starts_at": "bottom" if start_at == 0.0 else "top",
            "notation": notation(tempo), "reps": reps, "marks": marks, "cues": setup + cue_list}


def moving_windows(tl: dict) -> list[tuple[str, int, int]]:
    """(kind, start_ms, end_ms) of every moving phase, for the QA sync check."""
    return [(p["kind"], p["start_ms"], p["end_ms"]) for r in tl["reps"] for p in r["phases"] if p["kind"] in ("concentric", "eccentric")]


def progress_curve(tl: dict, n_frames: int) -> list[float]:
    """The family progress at every frame, rebuilt from tempo.json alone
    (what the app will see), with the same minimum-jerk shape as timing."""
    from .timing import min_jerk
    fps = tl["frame_rate"]
    phases = [p for r in tl["reps"] for p in r["phases"]]
    first = phases[0]["from"] if phases else 0.0
    out = []
    for f in range(n_frames):
        ms = f * 1000.0 / fps
        val = first
        for p in phases:
            if ms < p["start_ms"]:
                break
            if ms <= p["end_ms"]:
                span = max(p["end_ms"] - p["start_ms"], 1)
                val = p["from"] + (p["to"] - p["from"]) * min_jerk((ms - p["start_ms"]) / span)
                break
            val = p["to"]
        out.append(val)
    return out
