import { useDailyLog, useProfile } from '@/hooks/useTodayData';
import type { AssistantSignal } from '@/lib/assistant-suggestions';
import { calorieTargetFor, macroTargetsFor } from '@/lib/macro-targets';

/**
 * Today, in the shape `suggestionsFor` reads.
 *
 * ── why this is a hook and not four lines at each call site ──
 *
 * Two screens ask for the same suggestions now: the Health Assistant's coach
 * card offers them as entry points, and the coach itself offers them as
 * openers on an empty chat. Those have to be the *same* four. A card that
 * says "Tôi ngủ chưa đủ" opening a chat that suggests something else is the
 * bridge visibly not connecting to the thing it bridges to.
 *
 * Built by hand in one screen and copied to the other, they would agree until
 * the first time somebody adjusted a threshold in one of them — and nothing
 * would fail, because both halves would still be perfectly valid code
 * producing perfectly plausible chips.
 *
 * `useDailyLog` and `useProfile` are React Query reads that both screens make
 * anyway, so this costs a cache hit rather than a request.
 */
export function useAssistantSignal(): AssistantSignal {
  const { data: dailyLog } = useDailyLog();
  const { data: profile } = useProfile();
  const macros = macroTargetsFor(profile);

  return {
    readiness: dailyLog?.readiness_score != null ? Math.round(Number(dailyLog.readiness_score)) : null,
    status: (dailyLog?.readiness_status as 'green' | 'yellow' | 'red' | null) ?? null,
    acwr: dailyLog?.acwr != null ? Number(dailyLog.acwr) : null,
    sleepMin: Number(dailyLog?.sleep_duration_min) || 0,
    kcal: Math.round(Number(dailyLog?.kcal) || 0),
    kcalTarget: calorieTargetFor(profile),
    proteinG: Number(dailyLog?.protein_g) || 0,
    proteinTarget: macros.protein,
    steps: Number(dailyLog?.steps) || 0,
  };
}
