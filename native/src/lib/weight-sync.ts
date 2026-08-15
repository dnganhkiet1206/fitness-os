import { supabase } from '@/integrations/supabase/client';
import { localDateStr } from '@/lib/local-date';

/**
 * A weigh-in updates the profile's current weight.
 *
 * ── the bug this exists for ──
 *
 * `useLogWeight` wrote `weight_logs` and nothing else. But every target the app
 * gives back is computed from `profiles.weight_kg`, and that column was only
 * ever written in two places: onboarding, and the *Edit profile* sheet.
 *
 * So somebody who weighed themselves every morning for six months was still
 * being fed calorie, protein and water targets derived from the weight they
 * started at — along with a BMI band and a protein reference weight computed
 * from the same stale number. The app had six months of evidence and was
 * ignoring all of it. The only cure was to know, unprompted, to open a settings
 * sheet and press *Recalculate*.
 *
 * That is the "the app has the wrong idea about me" failure, and it is worse
 * than a missing feature because the app looks like it is paying attention.
 *
 * ── what this deliberately does not do ──
 *
 * It does **not** recompute the calorie target. Silently moving somebody's
 * daily calories because they stepped on a scale is a decision the app should
 * not take on its own — a single high-sodium morning would nudge it — and the
 * app already has a considered mechanism for that: `adaptiveTDEE` regresses
 * fourteen days of weight against intake and *offers* a new target on
 * `/smart-goals`, where it can be seen and accepted.
 *
 * Keeping the stored weight current is what makes that offer, the BMI band, the
 * protein ceiling and the *Recalculate* button all work from the truth. The
 * decision stays with the person; the facts stop being six months old.
 *
 * ── only forwards ──
 *
 * `date` is checked because the same weight pipeline replays offline writes,
 * possibly days later, and a queued Tuesday weight arriving on Friday must not
 * overwrite Friday's. The profile follows the most recent measurement, not the
 * most recently delivered one.
 */
export async function syncProfileWeight(
  userId: string,
  weightKg: number,
  date: string = localDateStr(),
): Promise<void> {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return;

  /* A later weigh-in already exists, so this one is history. */
  const { data: newer, error: readError } = await supabase
    .from('weight_logs')
    .select('date')
    .eq('user_id', userId)
    .gt('date', date)
    .limit(1);

  /* A failed read is not licence to guess. Leaving the profile alone keeps the
     previous value, which is wrong by at most one weigh-in; overwriting on a
     failed check could move it backwards by weeks. */
  if (readError) return;
  if (newer && newer.length > 0) return;

  await supabase
    .from('profiles')
    .update({ weight_kg: weightKg })
    .eq('user_id', userId);
}
