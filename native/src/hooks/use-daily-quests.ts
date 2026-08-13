import { useMemo } from 'react';

import { useDailyStreak, useMascotWallet } from '@/hooks/use-mascot-room';
import { useTodayWater } from '@/hooks/use-water';
import { useDailyLog, useProfile, useTodaySleep } from '@/hooks/useTodayData';
import { DAILY_QUESTS, questRefKey, type QuestKey } from '@/lib/mascot-room';
import { localDateStr } from '@/lib/local-date';

/**
 * Today's five quests, in one place, for every screen that needs them.
 *
 * ── why this exists ──
 *
 * The quests were never missing. `DAILY_QUESTS` has had five entries with coins
 * and XP since the room shipped, the streak bonus pays out, the weekly
 * challenges pay out, and the shop has thirty-nine things to spend it on. What
 * was missing is that **none of it could be seen from anywhere except Koa's
 * room** — the definition of "done" was a `questDone` object written inline in
 * `mascot-room.tsx`, so no other screen could have shown progress even if it
 * wanted to.
 *
 * That is the gap against how Duolingo runs the same machinery. Their daily goal
 * is on the home screen and in the widget, and one action feeds the streak, the
 * league and the achievements at the same visible moment. Ours paid out in a
 * room you had to remember to walk into.
 *
 * So the computation moves here, the room reads it from here, and Today can read
 * it too. One definition of "done", which is the same reason `asleepMinutes` and
 * `macroTargetsFor` were pulled out of their screens.
 *
 * ── it is deliberately not a new system ──
 *
 * Nothing about the quests, their rewards, or the claim keys changes. A new
 * quest system would mean new `ref_key` shapes, and those are already written
 * into `mascot_transactions` for real users — see the note on `questRefKey`.
 */
export interface DailyQuests {
  /** which of the five are finished today */
  done: Record<QuestKey, boolean>;
  doneCount: number;
  total: number;
  /** finished but not yet collected — this is what a badge should count */
  unclaimed: QuestKey[];
  /** coins sitting there waiting, quests only */
  unclaimedCoins: number;
  /**
   * `false` until the day has actually been read.
   *
   * Every source here can be `undefined` while loading or after a failed
   * query, and an unread day would otherwise compute as five unfinished
   * quests — a `0/5` shown to somebody who has logged all morning. The app has
   * met that mistake enough times to make the flag explicit rather than
   * leaving each caller to remember it.
   */
  ready: boolean;
  /** today's local date, the same string the claim keys are built from */
  today: string;
}

export function useDailyQuests(): DailyQuests {
  const { data: dailyLog, isSuccess: logOk } = useDailyLog();
  const { data: profile } = useProfile();
  const { data: waterMl, isSuccess: waterOk } = useTodayWater();
  const { data: sleep, isSuccess: sleepOk } = useTodaySleep();
  const { data: wallet } = useMascotWallet();
  useDailyStreak();

  const today = localDateStr();

  return useMemo(() => {
    const done: Record<QuestKey, boolean> = {
      meal: (Number(dailyLog?.kcal) || 0) > 0,
      workout: (dailyLog?.workout_count ?? 0) > 0,
      water: (waterMl ?? 0) >= (Number(profile?.water_target_ml) || 2500),
      sleep: sleep != null || (Number(dailyLog?.sleep_duration_min) || 0) > 0,
      steps: (dailyLog?.steps ?? 0) >= 5000,
    };

    const claimed = wallet?.claimed ?? new Set<string>();
    const unclaimed = DAILY_QUESTS.filter(
      (q) => done[q.key] && !claimed.has(questRefKey(today, q.key)),
    );

    return {
      done,
      doneCount: DAILY_QUESTS.filter((q) => done[q.key]).length,
      total: DAILY_QUESTS.length,
      unclaimed: unclaimed.map((q) => q.key),
      unclaimedCoins: unclaimed.reduce((sum, q) => sum + q.coins, 0),
      ready: logOk && waterOk && sleepOk,
      today,
    };
  }, [dailyLog, profile, waterMl, sleep, wallet, today, logOk, waterOk, sleepOk]);
}
