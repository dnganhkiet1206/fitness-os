import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/ascnd/screen';
import { WeekPlan } from '@/components/ascnd/week-plan';
import { PAGE_TINT } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { weekDayParam } from '@/lib/week-day';

/**
 * Plan — a page of its own, inside the training tab.
 *
 * ── the path is the design ──
 *
 * `/workouts/plan`, not `/plan`. A root-level route is pushed over the whole
 * `UITabBarController`, so it would take the tab bar with it and Plan would
 * stop being *in* Tập luyện in the only sense a person can see. Nested under
 * the tab's own stack, the bar stays and the tab stays lit — see
 * `(tabs)/workouts/_layout.tsx`, which exists for this one route.
 *
 * ── why it is not a section of the tab ──
 *
 * It was, for one commit. Plan carries a week strip, a state pill, a music row,
 * a day panel with a weight box and a rep box on every set, and a sheet — and
 * the tab already carried a row of buttons, a muscle grid, a workout list and a
 * session list. One scroll holding both is a page with two subjects, where
 * everything below the fold belongs to whichever one you were not looking for.
 *
 * ── `keyboardAware` ──
 *
 * Every set in the day panel carries two number boxes and a twelve-set day runs
 * them well past the fold — the one condition `screen.tsx` names for turning
 * this on. `plan-actuals.mjs` checks for it by name on whichever scaffold
 * mounts the panel, so it moves with the panel rather than being remembered.
 */
export default function PlanScreen() {
  const i18n = useI18n();
  /*
    The day the card on the tab was tapped on.

    Validated rather than coerced — the reason is written out in
    `lib/week-day.ts`. Nothing bad happens on this screen with a junk value; it
    is the same parser the builder uses to decide what gets written to
    `routine_days.day_of_week`, and one parser for one column is what keeps the
    strict side from being the odd one out.
  */
  const day = weekDayParam(useLocalSearchParams().day);

  return (
    <Screen refreshable back keyboardAware title={i18n.nPlan} aura={PAGE_TINT.activity}>
      <WeekPlan initialDay={day} />
    </Screen>
  );
}
