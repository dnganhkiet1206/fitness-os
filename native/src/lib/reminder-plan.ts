/**
 * Which reminders are worth firing, and when.
 *
 * ── why a plan, and not five daily alarms ──
 *
 * The reminders were five repeating calendar triggers: water every N hours,
 * supplements at 09:00, bedtime at 22:30, weigh-in at 07:00, workout at 17:00 —
 * every single day, unconditionally.
 *
 * So the workout nudge arrived at 17:00 on a rest day, and again on a day you
 * had already trained at seven in the morning. The weigh-in arrived the morning
 * after you weighed in. Water kept going after you had drunk the target. Each
 * one is a notification that is wrong about you, and the third wrong one in a
 * week is when a person turns the whole category off — which costs the app the
 * ones that would have been right.
 *
 * ── the shape of the fix ──
 *
 * iOS fires a scheduled notification without running any of our code, so a
 * reminder cannot decide at the last moment whether it still applies. What it
 * can do is be scheduled only if it applies: one-shot dates for the next few
 * days, rebuilt from real data every time the app has fresh data.
 *
 * The cost of that is stated plainly: an app left unopened for longer than the
 * horizon stops reminding. A repeating trigger would not, and would be wrong
 * every day instead. Seven days is the trade — long enough that a normal week
 * of use never notices, short enough that the schedule is never far from the
 * truth.
 *
 * ── what it will not skip ──
 *
 * Bedtime. It is the one reminder that is not about a task you might already
 * have done; there is no state that makes "wind down" redundant, and guessing
 * at one from a sleep log would be inferring an intention from a record.
 *
 * Nothing here talks to the OS, React or the network, so `tools/reminders.mjs`
 * runs the real rules against real dates.
 */

export type ReminderKey = 'water' | 'supplements' | 'bedtime' | 'weighIn' | 'workout';

export interface ReminderPrefs {
  water: { enabled: boolean; everyHours: number };
  supplements: { enabled: boolean; hour: number; minute: number };
  bedtime: { enabled: boolean; hour: number; minute: number };
  weighIn: { enabled: boolean; hour: number; minute: number };
  workout: { enabled: boolean; hour: number; minute: number };
}

/** What is already true today, and what the week says about training. */
export interface ReminderContext {
  /** already trained today */
  workedOutToday: boolean;
  /** already weighed in today */
  weighedToday: boolean;
  /** every supplement on the stack is ticked, or there are none to take */
  supplementsDone: boolean;
  /** today's water has reached the target */
  waterDone: boolean;
  /**
   * Weekday indices (Monday = 0) that have a workout planned.
   *
   * `null` means the routine has not been read — not that every day is a rest
   * day. An unread routine must not silence the workout reminder, so the rule
   * below treats it as "no information" and schedules as before.
   */
  trainingDays: number[] | null;
}

export interface PlannedReminder {
  key: ReminderKey;
  /** the exact local moment to fire */
  at: Date;
}

/** Water fires through the waking day, on the hour. */
export const WATER_START_HOUR = 8;
export const WATER_END_HOUR = 20;

/** How far ahead one-shot reminders are laid down. See the note above. */
export const HORIZON_DAYS = 7;

/**
 * The most pending notification requests iOS will hold for one app.
 *
 * ── the horizon wrote cheques the OS does not cash ──
 *
 * `UNUserNotificationCenter` keeps 64 pending requests per app and refuses the
 * rest. Seven days of one-shots goes past that on the app's **own default
 * settings**, measured on the real planner:
 *
 *     water every 1h → 119 planned   (55 over)
 *     water every 2h →  77 planned   (13 over)   ← the default
 *     water every 3h →  63 planned        fits
 *
 * Driven through the real `scheduleReminderPlan` against a centre that enforces
 * the cap: 77 requested, **64 pending**, and the last one that survives is on
 * day 5 while the plan asked through day 7. Worse than the arithmetic, the
 * rejection is thrown from `scheduleNotificationAsync`, the loop is inside one
 * `try`, and the `catch` is empty — so the first refusal ends the loop and
 * everything after it is never even attempted.
 *
 * Trimming here rather than letting the OS do it is what makes the outcome
 * knowable: the plan is already sorted by time, so keeping the first `MAX` is
 * "schedule as far ahead as the OS will hold" — every kind of reminder, in
 * order, over a shorter horizon. It also makes `planSignature` describe what is
 * actually pending, which is what the caller's early-exit compares against.
 *
 * Which reminders to *thin* instead — dropping every other water ping to keep
 * day 6 and day 7's bedtime, say — is a product decision and is not made here.
 */
export const MAX_PENDING = 64;

/** Monday-first weekday index, matching `routine_days.day_of_week`. */
export function routineIndexOf(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** A local date at a given time, `dayOffset` days from `from`. */
function at(from: Date, dayOffset: number, hour: number, minute: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + dayOffset, hour, minute, 0, 0);
  return d;
}

/**
 * Every reminder worth firing between `now` and the horizon.
 *
 * Ordered by time. A moment that has already passed is never included: a
 * one-shot trigger in the past either fires immediately or is dropped, and both
 * are worse than nothing — the first is a notification about a morning that is
 * over, the second is a silence you cannot tell from a bug.
 */
export function planReminders(
  prefs: ReminderPrefs,
  ctx: ReminderContext,
  now: Date = new Date(),
): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const push = (key: ReminderKey, when: Date) => {
    if (when.getTime() > now.getTime()) out.push({ key, at: when });
  };

  for (let day = 0; day < HORIZON_DAYS; day++) {
    const isToday = day === 0;
    const weekday = routineIndexOf(at(now, day, 12, 0));

    if (prefs.water.enabled && !(isToday && ctx.waterDone)) {
      const step = Math.max(1, Math.round(prefs.water.everyHours));
      for (let h = WATER_START_HOUR; h <= WATER_END_HOUR; h += step) {
        push('water', at(now, day, h, 0));
      }
    }

    if (prefs.supplements.enabled && !(isToday && ctx.supplementsDone)) {
      push('supplements', at(now, day, prefs.supplements.hour, prefs.supplements.minute));
    }

    // Never skipped — there is no state that makes winding down redundant
    if (prefs.bedtime.enabled) {
      push('bedtime', at(now, day, prefs.bedtime.hour, prefs.bedtime.minute));
    }

    if (prefs.weighIn.enabled && !(isToday && ctx.weighedToday)) {
      push('weighIn', at(now, day, prefs.weighIn.hour, prefs.weighIn.minute));
    }

    /*
      The workout reminder is the one the routine can answer for.

      A day with no workout planned gets no nudge to train — that is the whole
      point of having written the week down. `trainingDays === null` is not the
      same as an empty week: it means the routine has not been read, and an
      unread routine must not be allowed to silence the reminder.
    */
    const trainsToday = ctx.trainingDays === null || ctx.trainingDays.includes(weekday);
    if (prefs.workout.enabled && trainsToday && !(isToday && ctx.workedOutToday)) {
      push('workout', at(now, day, prefs.workout.hour, prefs.workout.minute));
    }
  }

  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  /* Sorted first, so the survivors are the soonest ones — see `MAX_PENDING`. */
  return out.slice(0, MAX_PENDING);
}

/**
 * A short string that changes exactly when the plan does.
 *
 * Rescheduling means cancelling every pending notification and laying them all
 * down again, so it must not happen on every render that touches a query. The
 * caller stores this and only reschedules when it differs — the plan is the
 * only thing that matters, so the plan is what is compared.
 */
export function planSignature(plan: PlannedReminder[]): string {
  return plan.map((p) => `${p.key}@${p.at.getTime()}`).join('|');
}
