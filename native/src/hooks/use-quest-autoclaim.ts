import { useEffect, useRef } from 'react';

import { useEntitlement, type Tier } from '@/hooks/use-entitlement';
import { useDailyQuests } from '@/hooks/use-daily-quests';
import { useKoaContext } from '@/hooks/use-koa-context';
import { useClaimReward, useMascotWallet } from '@/hooks/use-mascot-room';
import { emitKoa } from '@/lib/koa-stage';
import { askPeek, levelStep, noteDone } from '@/lib/personal-model';
import { peekAt } from '@/lib/quest-peek';
import { DAILY_QUESTS, levelFromXp, questRefKey, type QuestKey } from '@/lib/mascot-room';

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
 * yet (there is no IAP, no paywall, and no webhook writing `entitlements`), so
 * a tier test today only means "off for every single account", which is not a
 * business model, it is a feature nobody has seen. It goes back to `'max'` the
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
      koaCtx,
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
    }

    const before = seen.current;
    seen.current = { ...quests.done };

    for (const key of quests.unclaimed) {
      const def = DAILY_QUESTS.find((q) => q.key === key);
      if (!def) continue;

      const refKey = questRefKey(quests.today, key);
      if (!sent.current.has(refKey)) {
        sent.current.add(refKey);
        claim.mutate({ refKey, amount: def.coins, reason: key });
      }

      /* A change seen while watching is also the app's only chance to learn
         *when* this person does things — the hour is now, and there is no
         history query anywhere that could recover it later. It is recorded for
         every observed completion, celebrated or not. */
      if (before && !before[key]) {
        noteDone(key, new Date().getHours(), quests.today);

        /* ── the one daily moment that is genuinely rare ──

           Finishing all five is the only thing on this screen that does not
           happen most days, and it was the one event with a written line and
           nothing able to fire it. The individual boxes stay with the card peek
           — they already have a reaction there, and sending them here as well
           would give one glass of water two performances. */
        if (quests.doneCount >= quests.total) {
          emitKoa(
            { id: `day:${quests.today}`, kind: 'day_complete', magnitude: 0.6 },
            koaCtx,
          );
        }
        /* And even then, not always. `askPeek` is the rationing — a cooldown so
           a catch-up burst is one performance rather than four, and a daily cap
           so the character stays worth looking at. The all-five moment is the
           one thing allowed past the cap. See `lib/mascot-budget.ts`. */
        if (mayPeek && askPeek(quests.today, quests.doneCount >= quests.total)) {
          peekAt(key, def.coins);
        }
      }
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
