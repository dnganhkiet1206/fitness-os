/**
 * What somebody's goal means for their training — as opposed to their dinner.
 *
 * ── the gap this fills ──
 *
 * `profiles.goal` reached exactly two things: `calcTargetCalories` and
 * `calcMacros`. Grep it across `training-card.ts`, `prescription.ts`,
 * `load-progression.ts`, `user-state.ts`, `readiness-engine.ts` and
 * `koa-decide.ts` and there is not one hit. So a person could set "build
 * strength", watch their calorie target move, and find that nothing about the
 * training half of the app had heard of it. A goal that only changes a number
 * on the nutrition screen is a label, not a goal.
 *
 * ── the floor is the WHO guideline, and it is a floor for everybody ──
 *
 * The 2020 WHO guidance for adults is at least 150–300 minutes of
 * moderate-intensity aerobic activity a week, **plus** muscle-strengthening
 * work involving all major muscle groups on two or more days a week. The
 * strengthening half applies to every adult regardless of what they are
 * training for, which is why it is a floor here rather than something the
 * "endurance" goal opts out of.
 *
 * ── and above the floor, only where there is a reason ──
 *
 * This is the rule that keeps the file honest, and `tools/goal-training.mjs`
 * enforces it: a goal is raised above the floor **only** where something
 * defensible says so, and every other goal stays exactly at the floor.
 *
 *   · `strength` and `bulk` get a third strength day. More frequent
 *     resistance work is the point of both, and three is still inside what the
 *     guideline calls beneficial rather than a number invented for this app.
 *   · `endurance` gets 300 aerobic minutes — the top of WHO's own range, which
 *     it names as the level for *additional* benefit. Not a new number: the
 *     other end of a published one.
 *   · `cut`, `maintain` and `recomp` stay at the floor, because nothing about
 *     wanting to lose fat or hold steady changes what a body needs weekly, and
 *     inventing a difference would be this app making up exercise science.
 *
 * An unrecognised goal — an older row, a value from a build that offered
 * something else — also lands on the floor. That is the honest default: a
 * stranger gets the public-health recommendation, not zero and not a guess.
 *
 * ── the RPE band is a default, never an override ──
 *
 * `rpeBand` is what `suggestLoad` aims at **when the workout itself says
 * nothing**. A template that specifies its own effort keeps it: the person who
 * wrote the workout knows more about it than a goal label does.
 */

/** Two or more days a week of muscle-strengthening work — WHO 2020, all adults. */
export const WHO_STRENGTH_DAYS = 2;

/** 150 minutes of moderate aerobic activity a week — the lower WHO bound. */
export const WHO_AEROBIC_MIN = 150;

/** …and 300, which WHO names as the level for additional benefit. */
export const WHO_AEROBIC_MIN_EXTRA = 300;

export interface GoalTraining {
  /** strength sessions a week this goal aims at — never below the WHO floor */
  strengthDays: number;
  /** minutes of moderate aerobic activity a week — never below the WHO floor */
  aerobicMin: number;
  /**
   * The effort a working set should feel like, when the workout does not say.
   *
   * Expressed as a band rather than a number because the RPE scale is
   * self-reported in integers and nobody is consistent to a half point — the
   * same reason `load-progression.ts` will not act on a gap under one point.
   */
  rpeBand: [number, number];
}

/** What every adult gets, and what an unrecognised goal falls back to. */
const FLOOR: GoalTraining = {
  strengthDays: WHO_STRENGTH_DAYS,
  aerobicMin: WHO_AEROBIC_MIN,
  rpeBand: [7, 8],
};

/**
 * Only the goals that differ from the floor, and only in the ways above.
 *
 * Written as overrides rather than as full rows so that a goal cannot
 * accidentally be given *less* than the floor by a typo — `goalTraining` folds
 * these onto `FLOOR` and takes the larger of each.
 */
const ABOVE_FLOOR: Record<string, Partial<GoalTraining>> = {
  /* Heavier work, and the band the load engine should aim at for it. */
  strength: { strengthDays: 3, rpeBand: [8, 9] },
  bulk: { strengthDays: 3 },
  /* The upper end of WHO's own aerobic range. */
  endurance: { aerobicMin: WHO_AEROBIC_MIN_EXTRA },
};

export function goalTraining(goal: string | null | undefined): GoalTraining {
  const over = ABOVE_FLOOR[String(goal ?? '').trim().toLowerCase()] ?? {};
  return {
    /* `Math.max` and not the override alone: the floor is a floor, and this is
       what makes a mistyped override unable to drop somebody below the
       public-health recommendation. */
    strengthDays: Math.max(FLOOR.strengthDays, over.strengthDays ?? 0),
    aerobicMin: Math.max(FLOOR.aerobicMin, over.aerobicMin ?? 0),
    rpeBand: over.rpeBand ?? FLOOR.rpeBand,
  };
}

/** The single number `suggestLoad` aims at when a workout states no effort. */
export const goalRpeTarget = (goal: string | null | undefined): number => {
  const [lo, hi] = goalTraining(goal).rpeBand;
  return (lo + hi) / 2;
};
