// #198 — production wiring: mirrors the in-app rest clock onto the
// display-only Live Activity (spike #195 proved the native side).
//
// TypeScript owns ALL rest state; this module only forwards display state to
// Swift on the moments a human does something: a rest starts, the user
// adjusts ±15s, or the rest ends (timer up / skipped / unticked). The
// per-second tick never crosses the bridge — Swift derives the countdown
// natively from the absolute endDate.
//
// Everything here is fire-and-forget and null-safe: on web, Android, or
// where Live Activities are disabled, the facade resolves null and these
// become no-ops. The workout never depends on the outcome.
import {
  endRestActivity,
  startRestActivity,
  updateRestActivity,
} from './ASCNDLiveActivity';

interface RestDisplay {
  exerciseName: string;
  setNumber: number;
  totalSets: number;
}

let activeId: string | null = null;
let lastDisplay: RestDisplay | null = null;
/*
  Guards the async gap in start: the native id arrives in a .then, so an
  end() landing between the call and the resolution must not leave a leaked
  activity behind. Each start/end bumps the generation; a stale resolution
  is dropped.
*/
let generation = 0;

/**
 * A rest began (or replaced the running one). Shows the upcoming set when
 * there is one — the rest is preparation for it — otherwise the set just
 * finished.
 */
export function restLiveActivityStarted(
  display: RestDisplay,
  totalSeconds: number,
  remainingSeconds: number,
): void {
  const g = ++generation;
  if (activeId !== null) {
    void endRestActivity(activeId);
    activeId = null;
  }
  lastDisplay = display;
  void startRestActivity({
    exerciseName: display.exerciseName,
    setNumber: display.setNumber,
    totalSets: display.totalSets,
    totalSeconds,
    remainingSeconds,
  }).then((id) => {
    if (id !== null && g === generation) activeId = id;
  });
}

/**
 * The user adjusted the rest (±15s). Pushes the new absolute end so the
 * native countdown stays exact. Never called per tick.
 */
export function restLiveActivityAdjusted(totalSeconds: number, remainingSeconds: number): void {
  if (activeId === null || lastDisplay === null) return;
  void updateRestActivity(activeId, {
    exerciseName: lastDisplay.exerciseName,
    setNumber: lastDisplay.setNumber,
    totalSets: lastDisplay.totalSets,
    totalSeconds,
    remainingSeconds,
  });
}

/** The rest ended for any reason. Safe to call with none active. */
export function restLiveActivityEnded(): void {
  generation += 1;
  lastDisplay = null;
  if (activeId === null) return;
  const id = activeId;
  activeId = null;
  void endRestActivity(id);
}
