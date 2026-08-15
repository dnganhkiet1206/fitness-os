"use strict";
/**
 * What Koa says, and the reason it is not a list of things you failed to do.
 *
 * ── what this replaced ──
 *
 * A ladder of four reproaches and one compliment:
 *
 *     morning and no sleep logged  → "log it"
 *     after 11 and no meals        → "fuel up and log it"
 *     after 14 and under half water→ "hydration check"
 *     16–21 and no workout         → "great window for a workout"
 *     otherwise, if you did things → "you're crushing it today"
 *
 * Four of the six outcomes are a reminder that you have not done something, the
 * fifth is one generic sentence that is the same whatever you actually did, and
 * the character saying it is the app's companion. A companion that mostly
 * notices absences is a nag, and a nag is the one thing a mascot must not be —
 * the whole mechanism, as Duolingo's own designers describe it, is that you do
 * not want to *disappoint* the character, and that only works if the character
 * is visibly pleased when there is something to be pleased about.
 *
 * ── the shape now ──
 *
 * Koa names what you did before naming what is left, and names it specifically.
 * Three outcomes:
 *
 *   - nothing done yet, something worth asking for → ask, as before. There is
 *     nothing to acknowledge and pretending otherwise is worse than asking.
 *   - something done and something left → **both, in that order**: "Tập xong
 *     rồi 💪 — ghi bữa ăn nữa nhé". This is the case the old ladder could not
 *     express at all, and it is the common one.
 *   - nothing left → praise.
 *
 * ── and it goes quiet rather than guessing ──
 *
 * `null` for every field means today could not be read — a failed query, a
 * cold start before the first fetch. The old version could not tell that from a
 * day with nothing on it, so a dropped request made Koa tell you to log the
 * meal you had already logged. Absence of data is not absence of behaviour, and
 * the fix is the app's standing one: say nothing rather than say something
 * false.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GAP_SPAN = exports.GAP_FROM = void 0;
exports.mascotLine = mascotLine;
/**
 * Water counts as done at half the target, not at the whole thing.
 *
 * The old rule nagged below 50% and said nothing above it, so 50% was already
 * the line this app drew between "behind" and "fine". Keeping the same number
 * means the change of voice is not also a quiet change of standard.
 */
const WATER_DONE_PCT = 50;
/**
 * The hour each gap becomes worth raising — for somebody the app knows nothing
 * about yet.
 *
 * These four numbers were chosen once, for everybody, and that is the whole
 * problem with them: they describe an imagined day. Somebody on nights trains
 * at ten in the evening and gets asked about a workout at four in the
 * afternoon; somebody who eats at one gets asked at eleven. Being asked for a
 * thing before you would ever have done it is the specific way a companion
 * turns into a nag, because every one of those asks is wrong.
 *
 * So they are now a **floor**, not the answer. `mascotLine` takes `dueFrom`,
 * and the app fills it from the hour this person is actually observed doing
 * each thing — `lib/user-rhythm.ts`, which refuses to claim a habit under six
 * observations or below 0.6 agreement, so an unknown person keeps exactly these
 * numbers and nothing changes until there is something real to change it to.
 */
exports.GAP_FROM = {
    sleep: 6,
    meal: 11,
    water: 14,
    workout: 16,
};
/**
 * How long each gap stays worth raising, in hours — `null` for the rest of the
 * day.
 *
 * Sleep and workout close: a sleep question at nine at night is about a night
 * that has not happened, and "still time to train" stops being true. Meals and
 * water do not close, because somebody who has not eaten by seven should still
 * be asked — narrowing those to a window would silence the ask exactly when it
 * matters most.
 *
 * The span **travels with the floor** rather than being a fixed clock range.
 * Move a night worker's training hour to ten in the evening and their window
 * moves with it; a fixed 16–21 would simply never contain them.
 */
exports.GAP_SPAN = {
    sleep: 5,
    meal: null,
    water: null,
    workout: 5,
};
/** Circular, so a window that opens at 22:00 still contains 01:00. */
function withinWindow(hour, from, span) {
    if (span === null)
        return hour >= from;
    return hour >= from && hour < from + span;
}
/** Priority when several things are open or several are done. */
/**
 * The order to mention things in, when nobody has said otherwise.
 *
 * It is still here and it is still the right default — it is what a coach would
 * say to somebody they have just met. What changed is that it is now a
 * *default*: `mascotLine` takes an order, and the app hands it one learned from
 * whether bringing each thing up has ever led anywhere for this person
 * (`lib/personal-model.ts`). This list is the prior that ranking starts from.
 */
const ORDER = ['workout', 'meal', 'sleep', 'water'];
/**
 * @param order most-worth-mentioning first; anything missing keeps its default
 *   place after the ones listed, so a caller cannot silence a thing by
 *   forgetting it
 * @param dueFrom the hour each thing becomes worth raising *for this person*,
 *   from their own logging clock. Anything missing falls back to `GAP_FROM`,
 *   which is what a stranger gets.
 */
function mascotLine(day, order = ORDER, dueFrom = {}) {
    const rank = [...order.filter((t) => ORDER.includes(t)), ...ORDER.filter((t) => !order.includes(t))];
    const known = day.sleepMin != null && day.meals != null && day.waterPct != null && day.workouts != null;
    if (!known)
        return { kind: 'silent' };
    const done = {
        sleep: (day.sleepMin ?? 0) > 0,
        meal: (day.meals ?? 0) > 0,
        water: (day.waterPct ?? 0) >= WATER_DONE_PCT,
        workout: (day.workouts ?? 0) > 0,
    };
    const wins = rank.filter((t) => done[t]);
    const gaps = rank.filter((t) => !done[t] && withinWindow(day.hour, dueFrom[t] ?? exports.GAP_FROM[t], exports.GAP_SPAN[t]));
    if (gaps.length === 0)
        return wins.length > 0 ? { kind: 'praise' } : { kind: 'silent' };
    if (wins.length === 0)
        return { kind: 'ask', gap: gaps[0] };
    return { kind: 'notice', win: wins[0], gap: gaps[0] };
}
