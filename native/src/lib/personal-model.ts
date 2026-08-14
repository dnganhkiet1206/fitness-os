import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { credit, newArm, noteAsk, rankArms, settle, type Arm } from '@/lib/bandit';
import { allowPeek, allowPraise, freshBudget, type PeekBudget } from '@/lib/mascot-budget';
import { emptyHours, habit, observeHour, type HourStat } from '@/lib/user-rhythm';
import { localDateStr } from '@/lib/local-date';
import type { QuestKey } from '@/lib/mascot-room';

/**
 * What the app has learned about this person, kept on their phone.
 *
 * ── the whole model is two numbers per habit ──
 *
 * A Beta posterior — did mentioning this ever lead anywhere — and a pair of
 * circular sums — when do they actually do it. Five habits, four numbers each.
 * The entire thing serialises to a couple of hundred bytes.
 *
 * That is not a limitation to apologise for. The large recommenders run on
 * millions of people because they are ranking a catalogue of millions of items;
 * this ranks **four sentences** and one clock, for one person, and the honest
 * amount of machinery for that is small. Anything larger would be inventing
 * confidence it has no data for.
 *
 * ── and it stays here ──
 *
 * No table, no request, no id. The observations are `AsyncStorage`, which means
 * they are on the device, which means the personalisation survives having no
 * network and never becomes a thing anyone can be profiled by. This is also the
 * only reason it could be built at all right now: the backend has a queue of
 * undeployed migrations, and this needed none.
 *
 * ── it forgets ──
 *
 * `reward()` halves both counts past `CAP`, so the model always describes
 * roughly the last few weeks. Somebody who ignored every training nudge last
 * winter and trains four times a week now is treated as the person they are.
 */
export interface PersonalModel {
  /** does mentioning this go anywhere, per habit */
  arms: Record<QuestKey, Arm>;
  /** when they actually do it, per habit */
  hours: Record<QuestKey, HourStat>;
  /**
   * The day each habit was last brought up, waiting to find out if it worked.
   *
   * ── why this is not a single pending slot ──
   *
   * It was, and the attribution was wrong in the ordinary case. Koa asks about
   * meals in the morning and, once meals are logged, about training in the
   * evening — one slot means the evening ask *overwrites* the morning one, so
   * the meal that was actually logged is never credited, and training collects
   * a loss for a day it was only mentioned an hour ago. The model learned the
   * opposite of what happened, quietly, in the most common shape of a day.
   *
   * One date per habit: everything asked gets its own answer.
   */
  asked: Partial<Record<QuestKey, string>>;
  /** how much of today's appearance budget Koa has spent — `mascot-budget.ts` */
  budget: PeekBudget;
  /** the day the "everything done" line was last said */
  praisedOn: string | null;
  /**
   * Koa event ids already reacted to, newest last.
   *
   * ── why this had to survive a restart ──
   *
   * The stage's own set is session-lived, which is right for most events —
   * medals are deduped by the database, a finished day only fires on a
   * transition nobody sees twice. The comeback is the exception: it fires from
   * a query result on every launch during an absence, so closing the app and
   * opening it again welcomed the same person back a second time.
   *
   * Capped, because this is a ring buffer of recent moments and not a history.
   */
  koaSeen: string[];
  /**
   * The buddy's level at the last reading, or `null` before the first one.
   *
   * `null` is load-bearing. The level is derived from lifetime XP, so a fresh
   * install reads straight in at whatever level the account already is — and
   * treating that first reading as a *crossing* would congratulate somebody on
   * reaching level 6 the moment they reinstalled. The first reading sets the
   * baseline and says nothing, exactly as the quest watcher does.
   */
  level: number | null;
}

/**
 * The starting belief, and it is the editorial order rather than a blank slate.
 *
 * A flat prior would mean the very first thing Koa says is chosen by a coin
 * toss, and the first few coin tosses would then bias everything after them.
 * These numbers are the old hard-coded order — training first, then food, then
 * sleep and water — expressed as evidence, so the app opens saying what matters
 * and moves from there. The `beta: 2` keeps them soft enough to be moved.
 */
const PRIOR: Record<QuestKey, [number, number]> = {
  workout: [4, 2],
  meal: [3, 2],
  sleep: [2, 2],
  water: [2, 2],
  steps: [2, 2],
};

const KEYS = Object.keys(PRIOR) as QuestKey[];

const fresh = (): PersonalModel => ({
  arms: Object.fromEntries(KEYS.map((k) => [k, newArm(...PRIOR[k])])) as Record<QuestKey, Arm>,
  hours: Object.fromEntries(KEYS.map((k) => [k, emptyHours()])) as Record<QuestKey, HourStat>,
  asked: {},
  budget: freshBudget(''),
  praisedOn: null,
  koaSeen: [],
  level: null,
});

const STORE_KEY = 'ascnd_personal_model_v1';

let model: PersonalModel = fresh();
let loaded = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

/**
 * Persist, fire-and-forget and coalesced.
 *
 * Finishing a quest touches the model three times in the same tick — the hour
 * is recorded, the ask is credited, the appearance budget is spent — and each
 * one used to be its own serialise-and-write. They are three views of one
 * event, so they are written once, on the next tick.
 *
 * Fire-and-forget because losing the last write to a crash costs one
 * observation out of weeks of them, and blocking anything on a preferences
 * write would be the worse trade.
 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(model)).catch(() => {});
  }, 0);
}

/**
 * Read the stored model once per launch, and merge rather than replace.
 *
 * ── the two bugs this shape exists for ──
 *
 * **Hydration used to clobber.** It assigned the stored blob over `model`
 * wholesale, so anything written between launch and the read landing was
 * simply gone. Losing one observation would be tolerable; losing the *budget*
 * is not — an already-spent peek coming back un-spent is a cap that leaks, and
 * the whole point of the cap is that it does not.
 *
 * **And nothing settled yesterday's asks.** `settleStale` ran from an effect at
 * mount, which is *before* this resolves, so it settled an empty model and was
 * never asked again. Every unanswered ask from the day before stayed unanswered
 * for ever, which meant the bandit recorded **only wins** — the exact failure
 * that function was written to prevent, hidden by the order two things happened
 * in. So the settle happens here, after the data it is supposed to settle
 * actually exists.
 *
 * ── what wins on merge ──
 *
 * The rationing state (`asked`, `budget`, `praisedOn`) prefers what is already
 * in memory: those are decisions this session has taken, and re-taking them
 * means a second performance or a second ask. The learned state (`arms`,
 * `hours`) prefers storage, because in-memory is at most one observation old
 * while storage is weeks of them — losing one is the right way round, and it is
 * unlikely to happen at all now the read starts at import rather than from a
 * mount effect.
 *
 * Anything missing or malformed falls back to the fresh model rather than
 * throwing — a corrupted preferences blob must never be able to stop the app
 * from starting, and the cost of the fallback is that the app forgets.
 */
export async function loadPersonalModel() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersonalModel> & {
        pending?: { quest: QuestKey; date: string } | null;
      };
      const base = fresh();
      const live = model;
      /* The v1 shape had a single `pending`; carrying it across as one entry
         keeps the learned hours and beliefs, which are the expensive part,
         rather than making everybody start again for a field that changed. */
      const storedAsked =
        parsed.asked ?? (parsed.pending ? { [parsed.pending.quest]: parsed.pending.date } : {});
      const storedBudget = parsed.budget ?? base.budget;

      model = {
        arms: { ...base.arms, ...(parsed.arms ?? {}) },
        hours: { ...base.hours, ...(parsed.hours ?? {}) },
        asked: { ...storedAsked, ...live.asked },
        /* Whichever has spent more of today is the truthful one; on different
           days the stored budget is stale and the live one is today's. */
        budget:
          live.budget.day === storedBudget.day && live.budget.count > storedBudget.count
            ? live.budget
            : storedBudget,
        praisedOn: live.praisedOn ?? parsed.praisedOn ?? null,
        /* Union, newest last: an id recorded before the read landed is a
           reaction that already happened, and forgetting it would replay it. */
        koaSeen: [...new Set([...(parsed.koaSeen ?? []), ...live.koaSeen])].slice(-KOA_SEEN_CAP),
        level: live.level ?? parsed.level ?? null,
      };
      emit();
    }
  } catch {
    /* keep the fresh model */
  }
  // Now that yesterday exists, settle it.
  settleStale(localDateStr());
}

/* Started here rather than from a mount effect, so the window in which anything
   can write to an unhydrated model is as close to zero as a promise allows.
   Every writer below depends on a Supabase query having resolved, and a local
   key-value read beats a network round trip; the merge above is the belt to
   this bracer. */
void loadPersonalModel();

/**
 * Koa just brought this up, **on screen**. Remember it, so the outcome can be
 * attributed.
 *
 * The "on screen" matters and was got wrong once: this used to be called from
 * the hook that *composes* the sentence, and that hook runs wherever the mascot
 * is used at all — including behind an error card that shows no bubble. The
 * model was recording asks nobody had read, and then marking them failures.
 * It is called from the widget that actually draws the bubble.
 */
export function noteAsked(quest: QuestKey, date: string) {
  const next = noteAsk({ arms: model.arms, asked: model.asked }, quest, date);
  if (next.asked === model.asked) return;
  model = { ...model, ...next };
  save();
  emit();
}

/**
 * Quests whose completion time is a fact about the **person**.
 *
 * ── the one that is not ──
 *
 * `steps` is never logged by hand. The app finds out the goal was crossed when
 * Apple Health is next synced, which happens on a fifteen-minute timer while the
 * app is open — so the hour recorded is *when the phone synced*, which is a fact
 * about the app, not about when anybody walked. Feeding that into a model whose
 * whole job is "when is this person around" would teach it, with perfect
 * confidence, the shape of its own polling schedule.
 *
 * The others are recorded, and the label the room shows says "log" rather than
 * "do" for a reason: a sleep entry is written in the morning about the night
 * before. "When you usually log sleep" is a true sentence and a useful one; it
 * is just not the same sentence as "when you sleep", and the copy does not
 * claim it is.
 */
const CLOCK_TRUSTED: QuestKey[] = ['meal', 'water', 'workout', 'sleep'];

/**
 * They did it. Records the hour where the hour means something, and settles the
 * ask if this was it.
 *
 * The hour is recorded whether or not Koa asked — the clock model is about when
 * this person lives, which has nothing to do with what Koa said. Only the bandit
 * cares about attribution.
 */
export function noteDone(quest: QuestKey, hour: number, date: string) {
  const hours = CLOCK_TRUSTED.includes(quest)
    ? { ...model.hours, [quest]: observeHour(model.hours[quest] ?? emptyHours(), hour) }
    : model.hours;
  const led = credit({ arms: model.arms, asked: model.asked }, quest, date);
  model = { ...model, ...led, hours };
  save();
  emit();
}

/**
 * A new day has started and yesterday's ask never landed — that is a miss.
 *
 * Without this the model only ever learns from successes, which is the classic
 * way a learner convinces itself everything works: the failures simply never get
 * written down.
 */
export function settleStale(today: string) {
  const next = settle({ arms: model.arms, asked: model.asked }, today);
  if (next.asked === model.asked) return;
  model = { ...model, ...next };
  save();
  emit();
}

/** Best first, by one Thompson draw each — see `bandit.ts`. */
export function rankQuests(rnd?: () => number): QuestKey[] {
  return rankArms(model.arms, rnd);
}

/** When this person usually does it, or `null` when they have no pattern. */
export const habitFor = (quest: QuestKey) => habit(model.hours[quest] ?? emptyHours());

const snapshot = () => model;
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePersonalModel(): PersonalModel {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Ask for a performance, and spend the budget either way.
 *
 * The rules are `mascot-budget.ts`; this is only the part that remembers. It
 * writes the returned budget whatever the answer, because a cooldown that is
 * only recorded on success is a cooldown that never starts.
 */
export function askPeek(today: string, finishesSet: boolean, now = Date.now()): boolean {
  const { allow, next } = allowPeek(model.budget, { now, today, finishesSet });
  if (next !== model.budget) {
    model = { ...model, budget: next };
    save();
    emit();
  }
  return allow;
}

/* Sticky for the life of the process, so the sentence cannot vanish out from
   under somebody mid-read — see `allowPraise`. */
let praisedThisSession = false;

export function mayPraise(today: string): boolean {
  return allowPraise(model.praisedOn, today, praisedThisSession);
}

export function notePraised(today: string) {
  praisedThisSession = true;
  if (model.praisedOn === today) return;
  model = { ...model, praisedOn: today };
  save();
  emit();
}

/** How many recent Koa moments are remembered across launches. */
const KOA_SEEN_CAP = 40;

/**
 * Has Koa already reacted to this exact moment — and, separately, record that
 * it has.
 *
 * ── why these are two calls and not one ──
 *
 * They were one, and it threw away real moments. Checking and recording in the
 * same breath meant an event was marked handled **before anyone knew whether it
 * would be acted on**, so a personal record that arrived while the character
 * was off screen was filed as done and never played — not on returning to the
 * dashboard, not ever, because the record is persisted.
 *
 * Split, the caller records only once it has actually decided to perform. The
 * risk the single call was guarding against — checking and then forgetting to
 * record — is covered by `tools/koa-decide.mjs` instead.
 */
export const koaSeenHas = (id: string): boolean => model.koaSeen.includes(id);

export function koaSeenAdd(id: string) {
  if (model.koaSeen.includes(id)) return;
  model = { ...model, koaSeen: [...model.koaSeen, id].slice(-KOA_SEEN_CAP) };
  save();
}

/**
 * The level last seen, and the new one recorded.
 *
 * Returns `null` on the very first reading — see the field's note: a first
 * reading is a baseline, never a crossing.
 */
export function levelStep(next: number): { from: number | null; crossed: boolean } {
  const from = model.level;
  if (from === next) return { from, crossed: false };
  model = { ...model, level: next };
  save();
  emit();
  return { from, crossed: from != null && next > from };
}

/** Testing and "forget me" — see the privacy screen. */
export function resetPersonalModel() {
  model = fresh();
  save();
  emit();
}
