// #198 — production wiring: mirrors the in-app rest clock onto the
// display-only Live Activity (spike #195 proved the native side).
//
// TypeScript owns ALL rest state; this module only forwards display state to
// Swift on the moments a human does something: a rest starts, the user
// adjusts ±15s, or the rest ends (timer up / skipped / unticked / screen
// unmounted). The per-second tick never crosses the bridge — Swift derives
// the countdown natively from the absolute endDate.
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
  /** Localized "Rest" (i18n.nRdResting) — the Island follows the app language. */
  restingText: string;
  /** Localized "Set {n}/{t}" (i18n.nRestSetOf, pre-formatted). */
  setText: string;
  /** Localized "Up next" (i18n.nRestNext) — the Island shows the NEXT set. */
  nextText: string;
}

interface Adjust {
  totalSeconds: number;
  remainingSeconds: number;
}

/** The three native calls, injectable so the race logic is unit-testable. */
export interface RestLiveActivityFacade {
  startRestActivity: typeof startRestActivity;
  updateRestActivity: typeof updateRestActivity;
  endRestActivity: typeof endRestActivity;
}

/*
  Guards the async gap in start: the native id arrives in a .then, so an
  end() or a second start() landing between the call and the resolution must
  not leave a leaked activity behind. Each start/end bumps the generation.

  A stale resolution is never adopted AND never just dropped — the activity
  already exists natively, so it is ENDED. Dropping the id is what left
  orphaned activities counting down on the island (#198 follow-up: the old
  "generation guard" only stopped the adoption, not the leak).
*/
export function createRestLiveActivity(facade: RestLiveActivityFacade) {
  let activeId: string | null = null;
  /** A start() was issued and its promise has not resolved yet. */
  let startPending = false;
  let lastDisplay: RestDisplay | null = null;
  /** When the current rest began (ms) — the stable lower bound of the
      native timerInterval range. Never Date.now at render time. */
  let startTimestamp: number | null = null;
  /** A ±15s that landed while the start promise was in flight. */
  let pendingAdjust: Adjust | null = null;
  let generation = 0;

  /**
   * A rest began (or replaced the running one). Shows the upcoming set when
   * there is one — the rest is preparation for it — otherwise the set just
   * finished.
   */
  function restLiveActivityStarted(
    display: RestDisplay,
    totalSeconds: number,
    remainingSeconds: number,
  ): void {
    const g = ++generation;
    if (activeId !== null) {
      void facade.endRestActivity(activeId);
      activeId = null;
    }
    // A previous start may still be in flight — its late id is ended on
    // arrival by the stale guard below.
    startPending = true;
    pendingAdjust = null;
    lastDisplay = display;
    startTimestamp = Date.now();
    void facade
      .startRestActivity({
        activityState: 'resting',
        exerciseName: display.exerciseName,
        setNumber: display.setNumber,
        totalSets: display.totalSets,
        totalSeconds,
        remainingSeconds,
        startTimestamp,
        restingText: display.restingText,
        setText: display.setText,
        nextText: display.nextText,
      })
      .then((id) => {
        if (g !== generation) {
          // Stale: a newer start or an end() landed while this was in
          // flight. The activity exists natively — end it so it cannot
          // linger orphaned on the island.
          if (id !== null) void facade.endRestActivity(id);
          return;
        }
        startPending = false;
        if (id === null || lastDisplay === null) return;
        activeId = id;
        // A ±15s that landed before the id arrived was stashed — replay it
        // so the island opens on the true end, not the pre-adjust one.
        const adj = pendingAdjust;
        pendingAdjust = null;
        if (adj !== null) {
          void facade.updateRestActivity(id, {
            activityState: 'resting',
            exerciseName: lastDisplay.exerciseName,
            setNumber: lastDisplay.setNumber,
            totalSets: lastDisplay.totalSets,
            totalSeconds: adj.totalSeconds,
            remainingSeconds: adj.remainingSeconds,
            startTimestamp: startTimestamp ?? Date.now(),
            restingText: lastDisplay.restingText,
            setText: lastDisplay.setText,
            nextText: lastDisplay.nextText,
          });
        }
      });
  }

  /**
   * The user adjusted the rest (±15s). Pushes the new absolute end so the
   * native countdown stays exact. Never called per tick.
   */
  function restLiveActivityAdjusted(totalSeconds: number, remainingSeconds: number): void {
    if (activeId !== null && lastDisplay !== null) {
      void facade.updateRestActivity(activeId, {
        activityState: 'resting',
        exerciseName: lastDisplay.exerciseName,
        setNumber: lastDisplay.setNumber,
        totalSets: lastDisplay.totalSets,
        totalSeconds,
        remainingSeconds,
        startTimestamp: startTimestamp ?? Date.now(),
        restingText: lastDisplay.restingText,
        setText: lastDisplay.setText,
        nextText: lastDisplay.nextText,
      });
      return;
    }
    if (startPending) {
      // The start promise has not resolved yet — stash the latest
      // adjustment; it replays when the id arrives. Only the latest one
      // matters: two quick taps collapse into the true end.
      pendingAdjust = { totalSeconds, remainingSeconds };
    }
    // Otherwise no activity exists at all — a genuine no-op.
  }

  /** The rest ended for any reason. Safe to call with none active. */
  function restLiveActivityEnded(): void {
    generation += 1;
    startPending = false;
    pendingAdjust = null;
    lastDisplay = null;
    startTimestamp = null;
    if (activeId === null) return;
    const id = activeId;
    activeId = null;
    void facade.endRestActivity(id);
  }

  return { restLiveActivityStarted, restLiveActivityAdjusted, restLiveActivityEnded };
}

const singleton = createRestLiveActivity({
  startRestActivity,
  updateRestActivity,
  endRestActivity,
});
export const {
  restLiveActivityStarted,
  restLiveActivityAdjusted,
  restLiveActivityEnded,
} = singleton;
