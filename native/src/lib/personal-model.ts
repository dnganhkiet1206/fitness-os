import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { credit, newArm, noteAsk, rankArms, settle, type Arm } from '@/lib/bandit';
import { emptyHours, habit, observeHour, type HourStat } from '@/lib/user-rhythm';
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
});

const STORE_KEY = 'ascnd_personal_model_v1';

let model: PersonalModel = fresh();
let loaded = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

/** Persist, fire-and-forget: losing one observation to a crash costs nothing. */
function save() {
  AsyncStorage.setItem(STORE_KEY, JSON.stringify(model)).catch(() => {});
}

/**
 * Read the stored model once per launch.
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
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<PersonalModel> & {
      pending?: { quest: QuestKey; date: string } | null;
    };
    const base = fresh();
    /* The v1 shape had a single `pending`; carrying it across as one entry
       keeps the learned hours and beliefs, which are the expensive part, rather
       than making everybody start again for a field that changed shape. */
    const asked = parsed.asked ?? (parsed.pending ? { [parsed.pending.quest]: parsed.pending.date } : {});
    model = {
      arms: { ...base.arms, ...(parsed.arms ?? {}) },
      hours: { ...base.hours, ...(parsed.hours ?? {}) },
      asked,
    };
    emit();
  } catch {
    /* keep the fresh model */
  }
}

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
 * They did it. Records the hour either way, and settles the ask if this was it.
 *
 * The hour is recorded for **every** completion, asked about or not — the clock
 * model is about when this person lives, which has nothing to do with what Koa
 * said. Only the bandit cares about attribution.
 */
export function noteDone(quest: QuestKey, hour: number, date: string) {
  const hours = { ...model.hours, [quest]: observeHour(model.hours[quest] ?? emptyHours(), hour) };
  const led = credit({ arms: model.arms, asked: model.asked }, quest, date);
  model = { ...led, hours };
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

/** Testing and "forget me" — see the privacy screen. */
export function resetPersonalModel() {
  model = fresh();
  save();
  emit();
}
