import { useDailyQuests } from '@/hooks/use-daily-quests';
import { useDailyStreak } from '@/hooks/use-mascot-room';
import type { KoaContext } from '@/lib/koa-decide';

/**
 * What Koa knows about right now, assembled from queries the app already makes.
 *
 * No new request and no new table: the streak is the one `StreakChip` reads and
 * the quest counts are the ones the dashboard reads, so this costs a `useMemo`
 * and nothing else.
 *
 * `visible` is `true` because every caller of this is reacting to something the
 * person just did in a foregrounded app, and the reaction lands on the held
 * emotion — which is wherever Koa is drawn, not on one particular card. The
 * card peek has its own, stricter visibility test (`useIsFocused`), because
 * that one really does play in one place.
 */
export function useKoaContext(): KoaContext {
  const { data: streak } = useDailyStreak();
  const quests = useDailyQuests();

  return {
    hour: new Date().getHours(),
    streak: streak?.count ?? 0,
    doneToday: quests.doneCount,
    emptyToday: quests.ready ? quests.doneCount === 0 : false,
    visible: true,
  };
}
