import { useEffect, useRef } from 'react';

import { useI18n } from '@/hooks/use-app-settings';

import { refreshKoaContext, useKoaContext } from '@/hooks/use-koa-context';
import { useDailyStreak, useSpendFreeze } from '@/hooks/use-mascot-room';
import { comebackMagnitude, streakMagnitude } from '@/lib/koa-event';
import { emitKoa } from '@/lib/koa-stage';
import { toast } from '@/lib/toast';

/**
 * Spend a streak freeze on a day that would otherwise have broken the run.
 *
 * ── when it fires ──
 *
 * On any launch where the days between the last logged day and today are not
 * covered by anything. Not at midnight — the app is not running at midnight, and
 * a rescue that requires the phone to be awake is not a rescue. Applying it when
 * the app next opens is the same outcome, computed later.
 *
 * ── the rule that is not Duolingo's ──
 *
 * **It only spends when spending works.** Two days missed and one freeze held
 * means the run is already gone; burning the freeze anyway would cost 150 coins
 * to change nothing, and the person would open the app to a streak of zero *and*
 * an empty drawer. Duolingo consumes on each missed day regardless. Here the
 * gap has to fit in the drawer, or the drawer stays shut.
 *
 * That also makes the item honest to sell: it does exactly what its name says
 * and never quietly evaporates.
 *
 * ── and it cannot rescue the distant past ──
 *
 * `use_streak_freeze` refuses a date more than three days old, so a streak that
 * died last month stays dead however many freezes are bought afterwards. A
 * safety net you can buy after falling is not a safety net, it is a purchase
 * that undoes a consequence, and the streak stops meaning anything the moment
 * that is possible.
 *
 * ── idempotence ──
 *
 * `tried` stops a re-render from re-issuing while the first call is in flight;
 * the unique index on (user, day) is what actually guarantees one freeze per
 * day, because two devices can launch at the same moment and this ref is not
 * shared between them.
 */
export function useStreakGuard() {
  const i18n = useI18n();
  const { data } = useDailyStreak();
  const spend = useSpendFreeze();
  const ctx = useKoaContext();
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (!data) return;
    const { missed, held } = data;

    /* ── the comeback, told to Koa rather than detected by it ──

       `missed` is already the gap between the last logged day and today, and
       it is computed by the streak — the one system that owns day arithmetic.
       Koa is handed the answer. Nothing here recounts days, and nothing polls:
       this runs when the streak query resolves, which is exactly when the fact
       became known. */
    if (missed.length >= 3) {
      emitKoa(
        {
          /* Keyed on the day the absence **started**, so one absence is one
             comeback however many times the app is opened during it.

             Two earlier versions were wrong in the same direction. The first
             folded the freeze count in, so spending a freeze changed the id and
             re-fired it. The second keyed on yesterday — which moves every
             night, so somebody who opens the app daily without logging would be
             welcomed back every single morning. A warm moment said daily is a
             nag, and that is the same failure as any other repetition nobody
             bounded. */
          id: `comeback:${missed[0]}`,
          kind: 'comeback',
          magnitude: comebackMagnitude(missed.length),
          days: missed.length,
        },
        refreshKoaContext(ctx),
      );
    }

    // Nothing to cover, or more days lost than the drawer can pay for.
    if (missed.length === 0 || missed.length > held) return;

    for (const date of missed) {
      if (tried.current.has(date)) continue;
      /*
        ── marked before the attempt, and never unmarked ──

        `tried` exists so a re-render does not fire the same rescue twice, and
        marking *before* the call is the only ordering that achieves that — the
        mutation is asynchronous, so marking after leaves a window in which
        every render starts another one.

        What was missing is the other half. There was no `onError`, so a refused
        RPC left the day permanently in `tried`: no second attempt for the rest
        of the session, the streak broken anyway, and not one word about it. And
        this is the only place in the app that spends 150 coins.

        So a failure puts the day back. The next launch — or the next time the
        streak query settles — tries again, which is exactly what somebody who
        bought insurance is entitled to. And it says so: silence here is a
        person discovering on their own that a thing they paid for did not
        happen.
      */
      tried.current.add(date);
      spend.mutate(date, {
        onSuccess: (used) => {
          if (!used) return;
          emitKoa(
            {
              id: `freeze:${date}`,
              kind: 'streak_saved',
              magnitude: streakMagnitude(data.count),
              days: data.count,
            },
            refreshKoaContext(ctx),
          );
        },
        onError: (e: Error) => {
          tried.current.delete(date);
          toast.fail(e);
        },
      });
    }
    // `spend` is a stable mutation object; listing it would re-run this on every
    // state change of the mutation it just started. `i18n` is read only inside
    // the error path and changes only when the app language does, which is a
    // remount anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}
