import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import type { KoaContext } from '@/lib/koa-decide';
import { koaOnScreen } from '@/lib/koa-presence';
import { RISK_HOUR } from '@/lib/mascot-emotion';
import { habitFor } from '@/lib/personal-model';
import { useUserState } from '@/hooks/use-user-state';
import { localDateStr } from '@/lib/local-date';
import type { Streak } from '@/lib/streak';
import { lateHour } from '@/lib/user-rhythm';

/**
 * What Koa knows right now — read from what the app already fetched, never
 * fetched for Koa's sake.
 *
 * ── the regression this shape exists for ──
 *
 * The first version called `useDailyStreak()` and `useDailyQuests()`. On Today
 * that is free, because the dashboard reads both anyway. But the medal engine
 * that needs this context also runs on the **Awards screen**, which reads
 * neither — so opening Awards started firing six queries (daily log, profile,
 * water, sleep, wallet, streak) that the screen has no use for, purely so a
 * koala could know the streak in case a medal happened to land.
 *
 * A companion's awareness must not cost the app requests. So this reads the
 * React Query **cache** and subscribes to nothing: if the data is there it is
 * used, and if it is not, Koa reacts with what it has. The only decision that
 * even reads the streak is `streak_at_risk`, which is reached from the
 * dashboard where the data is always warm.
 */
export function useKoaContext(): KoaContext {
  const qc = useQueryClient();
  const { user } = useAuth();
  const today = localDateStr();
  const state = useUserState();

  const streak = qc.getQueryData<Streak>(['mascot_streak', user?.id, today]);
  const log = qc.getQueryData<{ kcal?: number; workout_count?: number; steps?: number }>([
    'daily_log',
    user?.id,
    today,
  ]);

  return {
    hour: new Date().getHours(),
    streak: streak?.count ?? 0,
    /* What kind of stretch this person is in. Read from the same cache and on
       the same terms as everything else here — `useUserState` mounts no
       observer either, and returns `settling_in`/`none` when there is nothing
       to read, which is the value every branch downstream already handles. */
    state,
    /* `false` when the day is unread — never a worried face over an unknown. */
    emptyToday: log
      ? (Number(log.kcal) || 0) === 0 &&
        (log.workout_count ?? 0) === 0 &&
        (log.steps ?? 0) === 0
      : false,
    /*
      ── their evening, not the app's ──

      `streakInDanger` takes `riskHour` and falls back to `RISK_HOUR` when it is
      absent, and this hook never set it — so the *held face* ran on the hour
      this person actually logs (`use-mascot-emotion` passes exactly the line
      below) while the *spoken event* ran on a stranger's six o'clock. `decide`
      even read it as `{ ...ctx, riskHour: ctx.riskHour }`, a spread that
      assigns a field to itself, which is what is left when the line that was
      meant to supply it went missing.

      `mascot-emotion.ts` records that these two had already drifted once — the
      event version skipped the hour entirely — and the repair was to make both
      call one function. They still disagreed, because one of them was called
      with nothing. Measured, for somebody who logs at one in the morning:

          khuôn mặt lo (giờ của họ)  : 00:00–06:00
          sự kiện có lời (mặc định)  : 18:00–00:00

      Not one hour in common. At three in the morning the face worries and
      nothing is ever said; at seven in the evening the sentence arrives about a
      day they have not finished yet.

      This costs no request, which is the rule this whole hook is built on:
      `habitFor` reads module state that `resetPersonalModel` clears on
      sign-out, and `lateHour` is arithmetic. A person with no habit yet gets
      `RISK_HOUR` back, so nothing changes for them.
    */
    riskHour: lateHour(habitFor('meal'), RISK_HOUR),
    /* Asked, not assumed. `true` here used to be a shrug that cost real
       moments: a record earned on another tab was declared handled and never
       played. See `lib/koa-presence.ts`. */
    visible: koaOnScreen(),
  };
}

/**
 * The same context with the two fields that describe *this instant* re-read.
 *
 * ── why a captured context is not a current one ──
 *
 * Every emitter holds this object across time. It has to: `useKoaContext`
 * returns a fresh object on every render, so listing it as an effect dependency
 * would run the effect on every render, and each emitter therefore reads it
 * through a ref or a closure. That is right for the fields it snapshots — the
 * streak and the day's totals come out of the query cache and do not change
 * between the render and the event.
 *
 * Two fields are not like that, and both were wrong in ways that only showed up
 * at the moments they mattered:
 *
 *   · **`hour`.** `quest_done` and `streak_at_risk` are decided on the clock,
 *     and the app is left open. Somebody logging at ten past midnight was being
 *     judged on the hour of whenever the dashboard last re-rendered — which on
 *     a screen nobody has touched is the hour they opened it.
 *   · **`visible`.** The record celebration is the case that forced this: the
 *     figure is mounted *by the same state change* that fires the event, so at
 *     the render the context was built from there was no Koa on screen, and the
 *     biggest moment in the app decided nobody was looking and said nothing.
 *
 * So a context is refreshed at the point of use rather than at the point of
 * capture. `tools/koa-decide.mjs` keeps every emitter doing it — the debug
 * screen excepted, which builds contexts by hand precisely so it can ask what
 * happens when nobody is watching.
 */
export function refreshKoaContext(ctx: KoaContext): KoaContext {
  return { ...ctx, hour: new Date().getHours(), visible: koaOnScreen() };
}
