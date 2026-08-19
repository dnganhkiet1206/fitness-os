import { useEffect, useRef } from 'react';

import { useEntitlement, type Tier } from '@/hooks/use-entitlement';
import { useDailyQuests } from '@/hooks/use-daily-quests';
import { refreshKoaContext, useKoaContext } from '@/hooks/use-koa-context';
import { useClaimReward, useMascotWallet } from '@/hooks/use-mascot-room';
import { emitKoa } from '@/lib/koa-stage';
import { askPeek, creditQuest, levelStep, noteDone } from '@/lib/personal-model';
import { peekAt } from '@/lib/quest-peek';
import { DAILY_QUESTS, levelFromXp, questRefKey, type QuestKey } from '@/lib/mascot-room';
import { dayGap } from '@/lib/local-date';

/**
 * Rewards land by themselves, and Koa says so.
 *
 * ── why the button had to go ──
 *
 * A finished quest used to sit there until you walked into Koa's room and
 * pressed *Nhận*. Everything about that was a tax: the coins were already
 * earned, the app already knew, and the only thing standing between the two was
 * remembering that a room existed. Somebody who logs faithfully for a month and
 * never taps the buddy earns nothing at all — which is not a reward system, it
 * is a reward system with a secret.
 *
 * Duolingo does not send you anywhere to collect. The XP is yours the moment the
 * lesson ends, and the ceremony happens *where you were*. That is the shape
 * here now: the claim fires on the transition, and the ceremony is Koa coming up
 * from behind the card you just moved.
 *
 * ── claiming and celebrating are not the same event ──
 *
 * The first draft tied both to a transition this hook watched, and that quietly
 * lost people money. Walk five thousand steps with the app closed, open it, and
 * the very first reading already says the quest is done — no transition, no
 * claim, ever. Most of a day's quests are finished while nobody is looking at
 * the dashboard.
 *
 * So the two are split:
 *
 *   - **claiming** happens on every reading, for anything done and not yet
 *     collected. `earn_mascot_coins` keys on `ref_key` and a duplicate is a
 *     no-op, so the worst a repeat costs is one wasted request, and the coins
 *     are never left behind.
 *   - **the peek** only plays for a change this hook actually saw. Opening the
 *     app on a day with four quests already done must not stage four
 *     celebrations of things you did last night.
 *
 * `sent` stops a re-render from re-issuing a claim in the same session; `seen`
 * is the baseline that separates "already true when I arrived" from "just
 * happened".
 *
 * ── and the peek is the one that will be paid for ──
 *
 * The coins are not gated: the economy is the app's, and paywalling a reward
 * somebody earned by logging their food would be a different kind of app. What
 * is gated is the performance — Koa appearing over your cards to react — which
 * is a flourish rather than a function, and is the only kind of thing worth
 * putting behind a tier.
 *
 * `PEEK_TIER` is that gate, and it is `null` for now: nobody can buy anything
 * yet. There is no IAP and no paywall, and while `store-webhook` and
 * `verify-purchase` exist in `supabase/functions/`, neither has been deployed
 * to any project — so nothing writes `entitlements`, and a tier test today only
 * means "off for every single account", which is not a business model, it is a
 * feature nobody has seen. It goes back to `'max'` the
 * day there is something to sell — one word, and the check below already reads
 * it — see LAUNCH.md.
 *
 * ── what is still a tap ──
 *
 * The weekly-challenge bonus. Its list is a query the dashboard has no other
 * reason to make, and a once-a-week payout is the one place where pressing for
 * it is ceremony rather than chore. The daily five and the streak land by
 * themselves because they happen every day, and a chore you do every day is the
 * definition of a tax.
 */
/** Tier the peek needs, or `null` while it is on for everybody. */
const PEEK_TIER: Tier | null = null;

/**
 * How long a refused claim keeps being retried.
 *
 * Matched to the window `claim_quest_reward` accepts, because a key the server
 * has started refusing on principle is not worth asking about again — and a set
 * that only ever grows is a leak. See 20260819120000.
 */
const CLAIM_RETRY_DAYS = 2;

export function useQuestAutoClaim() {
  const quests = useDailyQuests();
  const claim = useClaimReward();
  const koaCtx = useKoaContext();
  const { data: wallet } = useMascotWallet();
  const { has } = useEntitlement();
  const mayPeek = PEEK_TIER === null || has(PEEK_TIER);

  /** what the last reading said, so a *celebration* only follows a change */
  const seen = useRef<Record<QuestKey, boolean> | null>(null);
  /** the day the baseline belongs to — a new day starts a new baseline */
  const seenDay = useRef<string | null>(null);
  /** ref keys already sent this session, so a re-render cannot re-send */
  const sent = useRef(new Set<string>());
  /**
   * Claims that were refused and are still owed.
   *
   * Kept across the day boundary, which `sent` is not: the whole point is the
   * coins somebody earned before midnight and the network refused. See the
   * retry pass at the end of the effect.
   */
  const owed = useRef(new Set<string>());

  /*
    ── the level, which nothing could see before ──

    A level is not an event anywhere in this app: it is `levelFromXp(wallet.xp)`,
    derived fresh on every read, so there is no moment at which the app knows a
    crossing just happened. The only way to notice one is to remember the last
    level — which is what `levelStep` does, persisted, and why its first reading
    deliberately reports no crossing. Without that, reinstalling the app would
    congratulate somebody on reaching the level they were already at.
  */
  useEffect(() => {
    if (wallet?.xp == null) return;
    const level = levelFromXp(wallet.xp);
    const { from, crossed } = levelStep(level);
    if (!crossed) return;
    emitKoa(
      {
        id: `level:${level}`,
        kind: 'level_up',
        /* Levels get harder as they go, so a later one is a bigger moment —
           but bounded, or level 20 would outshine a year-long streak. */
        magnitude: Math.min(0.5 + (level - (from ?? level)) * 0.1 + level * 0.02, 0.9),
        label: String(level),
      },
      refreshKoaContext(koaCtx),
    );
    // `koaCtx` is a fresh object each render and must not be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.xp]);

  useEffect(() => {
    if (!quests.ready) return;

    if (seenDay.current !== quests.today) {
      seenDay.current = quests.today;
      seen.current = null;
      sent.current = new Set();
      /* `owed` deliberately survives this. See the retry pass at the bottom. */
    }

    const before = seen.current;
    seen.current = { ...quests.done };
    /* Whether anything went from undone to done on THIS pass. The all-five
       event is one event about the day, so it is decided once after the loop
       rather than once per quest — see below. */
    let sawTransition = false;

    for (const key of quests.unclaimed) {
      const def = DAILY_QUESTS.find((q) => q.key === key);
      if (!def) continue;

      const refKey = questRefKey(quests.today, key);
      if (!sent.current.has(refKey)) {
        sent.current.add(refKey);
        /*
          ── marked before the call, and put back when the call fails ──

          Marking first is the only ordering that stops a re-render firing the
          same claim twice, because `mutate` is asynchronous. What was missing
          is the other half: with no `onError`, a refused claim left the key in
          `sent` for the rest of the session, so the coins were not retried —
          not on the next render, not when the wallet refetched, not when
          another quest completed.

          `earn_mascot_coins` is idempotent on `ref_key` and the key is
          `d:<today>:<quest>`, fixed for the day, so retrying costs nothing and
          can never pay twice. Which makes not retrying pure loss.

          And it is not only a session's worth. `unclaimed` is built from
          **today's** quests, so a claim that fails at half past eleven and is
          still blocked at midnight is never offered again: tomorrow's list is
          a different day's keys, and nothing in the app goes back for
          yesterday's.

          Exactly the shape `useStreakGuard` was corrected for — *"there was no
          `onError`, so a refused RPC left the day permanently in `tried`"* —
          left standing here.

          Silent on purpose, unlike the streak guard: that one spends 150 coins
          and a person is entitled to know it failed, while this is the
          "rewards land by themselves" path and a red toast for a blip on a
          ten-coin quest is the tax this whole hook exists to remove. The next
          render tries again; nothing is lost.

          `owed` is the half that survives midnight — see the retry pass below.
        */
        claim.mutate(
          { refKey, amount: def.coins, reason: key },
          {
            onError: () => {
              sent.current.delete(refKey);
              owed.current.add(refKey);
            },
            onSuccess: () => owed.current.delete(refKey),
          },
        );
      }

      /*
        ── the belief is credited whether or not anybody saw it happen ──

        This whole block used to sit behind the transition test below, and that
        made the learning depend on the app having been open at the right
        moment. It was not merely a gap: the ask stays outstanding, so the next
        day `settleStale` charges the arm a **loss** for a quest that was
        finished and paid for. Sleep and workout can both be satisfied by a
        HealthKit sync while the app is closed, so this is an ordinary shape of
        day rather than an edge.

        Safe to run on every reading: `creditQuest` is idempotent on the ask
        ledger — it fires only while an ask for this quest is outstanding today
        and consumes it — so a re-render, a refetch and a second session all
        land on the same single observation. See `creditQuest`.
      */
      creditQuest(key, quests.today);

      /* A change seen while watching is also the app's only chance to learn
         *when* this person does things — the hour is now, and there is no
         history query anywhere that could recover it later. That half stays
         behind the transition, because the hour on a first reading is the hour
         the app was opened and not the hour anybody ate. */
      if (before && !before[key]) {
        noteDone(key, new Date().getHours(), quests.today);
        sawTransition = true;

        /* And even then, not always. `askPeek` is the rationing — a cooldown so
           a catch-up burst is one performance rather than four, and a daily cap
           so the character stays worth looking at. The all-five moment is the
           one thing allowed past the cap. See `lib/mascot-budget.ts`. */
        if (mayPeek && askPeek(quests.today, quests.doneCount >= quests.total)) {
          peekAt(key, def.coins);
        }
      }
    }

    /*
      ── the one daily moment that is genuinely rare ──

      Finishing all five is the only thing on this screen that does not happen
      most days, and it was the one event with a written line and nothing able
      to fire it. The individual boxes stay with the card peek — they already
      have a reaction there, and sending them here as well would give one glass
      of water two performances.

      It sat inside the loop above, so the last quest of the day emitted
      `day:<date>` once per unclaimed quest — measured at **five** calls for one
      day. `emitKoa` dedupes on the event id, so four were absorbed and the
      outcome was already correct; this only stops the app asking the same
      question five times. The condition is unchanged: all five done, and at
      least one of them seen going done on this pass.
    */
    if (sawTransition && quests.doneCount >= quests.total) {
      emitKoa(
        { id: `day:${quests.today}`, kind: 'day_complete', magnitude: 0.6 },
        refreshKoaContext(koaCtx),
      );
    }

    /*
      ── coins somebody earned yesterday and the network ate ──

      `quests.unclaimed` is built from **today**, so the loop above can only
      ever offer today's keys. Measured: a claim refused at 23:59 and a day
      rollover before the next reading left `claims: 1, coins: 0`, and nothing
      in the app ever went back for it. The `onError` retry above fixed the
      within-the-day case and stopped exactly at midnight.

      So a refused key is remembered by identity and re-offered until it lands.
      Nothing here decides *whether* it is owed — that was decided when the
      quest was completed and claimed — and nothing here can pay twice:
      `UNIQUE(user_id, ref_key)` makes a repeat a no-op, and
      `claim_quest_reward` prices the key itself, so a stale key cannot be worth
      more than it was.

      The server's two-day window is the other half of this and exists for it:
      see 20260819120000. Past that, the key is dropped rather than retried for
      ever — a claim that has failed for two days is not a blip, and a set that
      only grows is a leak.

      **This is session-scoped**, and deliberately not more. Making it survive
      an app kill means persisting a claim intention, and this app's offline
      queue is explicitly for *logging* — writes where the person already knows
      what happened and the app is only the paper. A reward is not that. The
      residue is recorded in the ledger rather than papered over: kill the app
      between the failure and midnight and those coins are still lost.
    */
    for (const refKey of owed.current) {
      if (sent.current.has(refKey)) continue;
      const day = refKey.split(':')[1];
      if (day && dayGap(day, quests.today) > CLAIM_RETRY_DAYS) {
        owed.current.delete(refKey);
        continue;
      }
      sent.current.add(refKey);
      /* `amount` is not sent to the server any more — `claim_quest_reward`
         prices the key itself. It is still filled in from the catalogue rather
         than left at zero, because it is what a caller's `onSuccess` draws, and
         a "+0" burst would be a lie about a claim that paid. */
      const quest = refKey.split(':')[2] as QuestKey;
      claim.mutate(
        { refKey, amount: DAILY_QUESTS.find((q) => q.key === quest)?.coins ?? 0, reason: 'retry' },
        {
          onError: () => sent.current.delete(refKey),
          onSuccess: () => owed.current.delete(refKey),
        },
      );
    }
    /* `claim` is a stable mutation object; listing it would re-run this on every
       mutation state change, which is exactly when it must not re-run.

       `koaCtx` is deliberately absent too, and for a sharper reason: it is a
       fresh object on every render, so listing it would make this effect run on
       every render — the claim loop, the observation, the lot. It is read
       through the closure, where being one render stale costs nothing: the only
       field any of this uses is the hour. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quests.ready, quests.today, quests.done, quests.unclaimed, mayPeek]);
}
