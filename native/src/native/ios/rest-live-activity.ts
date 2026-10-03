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
  addIslandRestIntentListener,
  endRestActivity,
  getIslandRestState,
  startRestActivity,
  updateRestActivity,
  type IslandRestIntent,
} from './ASCNDLiveActivity';

interface RestDisplay {
  exerciseName: string;
  setNumber: number;
  totalSets: number;
  /** App language ('vi' | 'en' | 'es') — Swift looks up localized Island strings. */
  languageCode: string;
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
  addIslandRestIntentListener: typeof addIslandRestIntentListener;
  getIslandRestState: typeof getIslandRestState;
}

/** Re-exported for the app layer (day-plan subscribes via the manager). */
export { addIslandRestIntentListener, getIslandRestState };
export type { IslandRestIntent };

/** Handler the app registers to follow island taps (pause/resume/±15s). */
export type IslandIntentHandler = (intent: IslandRestIntent) => void;

let intentHandler: IslandIntentHandler | null = null;
let lastIntentSeq = 0;
let detachIntentListener: (() => void) | null = null;
let intentFacade: Pick<
  RestLiveActivityFacade,
  'addIslandRestIntentListener' | 'getIslandRestState'
> | null = null;

function dispatchIntent(intent: IslandRestIntent): void {
  if (intent.seq !== undefined) {
    // Replay/duplicate guard (Darwin pings are not queued; the foreground
    // reconcile may re-read the same payload).
    if (intent.seq <= lastIntentSeq) return;
    lastIntentSeq = intent.seq;
  }
  intentHandler?.(intent);
}

/**
 * Registers the app-side follower for island taps. The native listener is
 * attached once; setting null detaches. Safe to call with the test stub —
 * the facade is injected, never imported directly here.
 */
export function setIslandIntentHandler(
  facade: Pick<
    RestLiveActivityFacade,
    'addIslandRestIntentListener' | 'getIslandRestState'
  >,
  handler: IslandIntentHandler | null,
): void {
  intentFacade = facade;
  intentHandler = handler;
  if (handler !== null && detachIntentListener === null) {
    detachIntentListener = facade.addIslandRestIntentListener(dispatchIntent);
  } else if (handler === null && detachIntentListener !== null) {
    detachIntentListener();
    detachIntentListener = null;
  }
}

/**
 * Foreground reconcile: re-reads the last island intent payload. Covers
 * intents that fired while JS was suspended (the Darwin ping is not
 * queued). No-op when no handler is registered or nothing is pending.
 */
export async function reconcileIslandIntent(): Promise<void> {
  if (!intentFacade || !intentHandler) return;
  const intent = await intentFacade.getIslandRestState();
  if (!intent) return;
  dispatchIntent(intent);
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
    void facade
      .startRestActivity({
        activityState: 'resting',
        exerciseName: display.exerciseName,
        setNumber: display.setNumber,
        totalSets: display.totalSets,
        totalSeconds,
        remainingSeconds,
        languageCode: display.languageCode,
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
            languageCode: lastDisplay.languageCode,
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
        languageCode: lastDisplay.languageCode,
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
  addIslandRestIntentListener,
  getIslandRestState,
});
export const {
  restLiveActivityStarted,
  restLiveActivityAdjusted,
  restLiveActivityEnded,
} = singleton;
