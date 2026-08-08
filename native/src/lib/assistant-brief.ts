import { acwrZone } from './training-card';
import type { AssistantSignal, Bilingual } from './assistant-suggestions';

/**
 * What the assistant says about you when you open it.
 *
 * ── the hero was a greeting and a paragraph everybody shared ──
 *
 * *"Chào buổi tối!"* over *"Tôi ở đây để giúp bạn hiểu dữ liệu sức khoẻ, trả lời
 * câu hỏi và đưa ra lời khuyên riêng cho bạn."* — identical for every person on
 * every day, sitting directly above four tiles reading that person's real
 * numbers. It read as an assistant *waiting* rather than one that had looked.
 *
 * This says what it can see instead: your name, how you slept, how recovered
 * you are, how long since you trained, what is left of today's food.
 *
 * ── the rule that shapes every line ──
 *
 * **Never state a value that is not there.** Every branch below is gated on the
 * datum it quotes, and the day where nothing is known does not get a cheerful
 * placeholder — it gets an honest line about what is missing and what to log.
 * A briefing that invents "bạn đã ngủ 0 giờ" is worse than no briefing, because
 * it is confidently wrong about the person reading it.
 *
 * That extends to the name. A profile without one produces "Chào buổi tối." and
 * not "Chào bạn ơi" — a stand-in for a name is the exact opposite of the
 * impression this is for.
 *
 * ── two or three lines, not a report ──
 *
 * The shape is: last night, then today's state, then the one open thing. Past,
 * present, next. More than three and it stops being a greeting and becomes a
 * dashboard nobody asked for, sitting above the dashboard they did.
 */

/** A sentence and the datum it came from — the key is what the check tool asserts on. */
export interface BriefLine {
  key: string;
  text: Bilingual;
}

export interface Brief {
  /** "Chào buổi tối, Kiệt" — the name only when there is one */
  greeting: Bilingual;
  lines: BriefLine[];
}

/** At most this many sentences under the greeting. */
export const BRIEF_LINES = 3;

/** Below this, a night is short. Seven hours, the app's own threshold. */
const SHORT_SLEEP = 420;
/** Above this, a night is a good one worth remarking on. */
const GOOD_SLEEP = 450;

/**
 * The name to greet someone by.
 *
 * Vietnamese puts the given name last — *Đặng Anh Kiệt* is greeted as *Kiệt* —
 * and English puts it first. The app's language is the only signal available
 * for which convention a name follows, and for an app whose users write their
 * names the Vietnamese way it is the right one. A stored name that is a single
 * word works under either.
 *
 * Trimmed and capped: a profile can hold anything, and a greeting is not the
 * place to discover that someone pasted their full legal name twice.
 */
export function givenName(full: string, vi: boolean): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const one = vi ? parts[parts.length - 1] : parts[0];
  return one.length > 18 ? '' : one;
}

const hours = (min: number, vi: boolean) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (vi) return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

const group = (n: number, vi: boolean) => n.toLocaleString(vi ? 'vi-VN' : 'en-US');

/**
 * The greeting: time of day, and the person's own name when there is one.
 *
 * `hour` is passed rather than read, so the same input always produces the same
 * output — which is what lets this be checked at every hour of the day rather
 * than at whatever o'clock the test happened to run.
 */
function greetingFor(name: string, hour: number): Bilingual {
  const part =
    hour < 11
      ? { vi: 'Chào buổi sáng', en: 'Good morning' }
      : hour < 18
        ? { vi: 'Chào buổi chiều', en: 'Good afternoon' }
        : { vi: 'Chào buổi tối', en: 'Good evening' };
  const vi = name ? `${part.vi}, ${givenName(name, true)}` : part.vi;
  const en = name ? `${part.en}, ${givenName(name, false)}` : part.en;
  return { vi: `${vi}.`, en: `${en}.` };
}

/**
 * Everything true about today, grouped by the part of the day it belongs to.
 *
 * ── one from each group, not the first three overall ──
 *
 * The first version returned a flat list in priority order and the caller took
 * the top three. `tools/brief.mjs` caught what that produces: sleep, recovery
 * and training always filled the three slots, so **the food line could never
 * appear** — a day where you had logged nothing to eat read word for word the
 * same as a day you had hit your target. Two people with genuinely different
 * days, told the same thing.
 *
 * So the shape is fixed instead: *last night*, *today's state*, *the open
 * thing*, and each group contributes at most one line. Past, present, next.
 * Within `next` the ordering is still priority — a two-day gap outranks a
 * calorie count, which outranks a step count — but it can no longer be
 * crowded out by the two groups above it.
 */
function facts(s: AssistantSignal, vi: boolean): BriefLine[] {
  const night: BriefLine[] = [];
  const state: BriefLine[] = [];
  const next: BriefLine[] = [];
  const zone = s.acwr != null ? acwrZone(s.acwr) : null;

  // ── last night ──
  if (s.sleepMin > 0) {
    const h = hours(s.sleepMin, true);
    const he = hours(s.sleepMin, false);
    night.push({
      key: 'sleep',
      text:
        s.sleepMin < SHORT_SLEEP
          ? { vi: `Đêm qua bạn ngủ ${h} — ngắn hơn bình thường.`, en: `You slept ${he} last night — shorter than usual.` }
          : s.sleepMin >= GOOD_SLEEP
            ? { vi: `Đêm qua bạn ngủ ${h}, một đêm tốt.`, en: `You slept ${he} last night, a good one.` }
            : { vi: `Đêm qua bạn ngủ ${h}.`, en: `You slept ${he} last night.` },
    });
  }

  // ── today's state ──
  if (s.status) {
    state.push({
      key: 'readiness',
      text:
        s.status === 'green'
          ? { vi: 'Hôm nay cơ thể bạn phục hồi tốt.', en: 'Your recovery looks good today.' }
          : s.status === 'yellow'
            ? { vi: 'Hôm nay bạn phục hồi ở mức vừa phải.', en: 'Your recovery is middling today.' }
            : { vi: 'Hôm nay cơ thể bạn chưa phục hồi hẳn.', en: 'Your body has not fully recovered today.' },
    });
  }

  // ── training ──
  /* Someone with no logged session at all is not "0 days since training" and
     not "2 days" either — they are a person the app has never seen train, and
     saying so is more use to them than a calorie count. Caught by the check as
     a day that read identically to one where you had just trained. */
  if (s.daysSinceWorkout == null) {
    next.push({
      key: 'no-workouts',
      text: {
        vi: 'Bạn chưa ghi buổi tập nào — ghi một buổi để tôi theo dõi được tải tập.',
        en: 'You haven’t logged a session yet — log one and I can track your load.',
      },
    });
  } else if (s.daysSinceWorkout >= 2) {
    next.push({
      key: 'rest-gap',
      text: {
        vi: `Bạn đã nghỉ tập ${s.daysSinceWorkout} ngày.`,
        en: `You haven’t trained for ${s.daysSinceWorkout} days.`,
      },
    });
  } else if (zone === 'spike' || zone === 'elevated') {
    /* The percentage is the same reading the training card prints, so the two
       never disagree about how hard a week has been. */
    const pct = Math.round((s.acwr! - 1) * 100);
    next.push({
      key: 'load-high',
      text: {
        vi: `Tải tập tuần này cao hơn thói quen khoảng ${pct}%.`,
        en: `This week’s load is about ${pct}% above your baseline.`,
      },
    });
  }

  /* ── what is left of the day ──

     `next` is ordered by what it is worth hearing, and these are pushed after
     the training lines on purpose: a two-day gap in training matters more than
     a calorie count, and both matter more than a step total. */
  if (s.kcal > 0 && s.kcalTarget > 0) {
    const left = s.kcalTarget - s.kcal;
    next.push(
      left > 0
        ? {
            key: 'kcal-left',
            text: {
              vi: `Bạn còn khoảng ${group(left, true)} kcal cho hôm nay.`,
              en: `You have about ${group(left, false)} kcal left today.`,
            },
          }
        : {
            key: 'kcal-over',
            text: {
              vi: `Bạn đã vượt mục tiêu calo hôm nay khoảng ${group(-left, true)} kcal.`,
              en: `You’re about ${group(-left, false)} kcal over today’s target.`,
            },
          },
    );
  } else if (s.kcalTarget > 0) {
    next.push({
      key: 'kcal-none',
      text: {
        vi: `Hôm nay bạn chưa ghi bữa nào — mục tiêu là ${group(s.kcalTarget, true)} kcal.`,
        en: `You haven’t logged a meal today — the target is ${group(s.kcalTarget, false)} kcal.`,
      },
    });
  }

  /* Last resort. A step count is the least interesting thing the app knows —
     it only earns a slot on a day with nothing else open. */
  if (s.steps > 0) {
    next.push({
      key: 'steps',
      text: {
        vi: `Bạn đã đi ${group(s.steps, true)} bước.`,
        en: `You’ve walked ${group(s.steps, false)} steps.`,
      },
    });
  }

  return [night[0], state[0], next[0]].filter((l): l is BriefLine => l != null);
}

/**
 * The hero's text for this person, today.
 *
 * @param hour  0–23, passed in so the result is a function of its inputs alone
 */
export function briefFor(s: AssistantSignal, hour: number, vi = true): Brief {
  const lines = facts(s, vi).slice(0, BRIEF_LINES);

  /*
    The floor: never return nothing.

    ── and this is deliberately unreachable through the app ──

    `calorieTargetFor` falls back to 2200, so `kcalTarget` is never 0 for a real
    person, so the `kcal-none` line always fires, so `lines` is never empty. A
    brand-new account with nothing logged still reads
    "Bạn chưa ghi buổi tập nào…" and "Hôm nay bạn chưa ghi bữa nào…", which is
    the honest briefing this is for.

    It stays anyway, as the guarantee that the hero can never render an empty
    block under the greeting — and it is written down as unreachable so nobody
    spends an afternoon working out why they cannot make it appear.
  */
  if (lines.length === 0) {
    lines.push({
      key: 'no-data',
      text: {
        vi: 'Hôm nay chưa có dữ liệu nào. Ghi giấc ngủ hoặc một bữa ăn để tôi hiểu bạn hơn.',
        en: 'Nothing logged today yet. Add your sleep or a meal and I’ll have something to go on.',
      },
    });
  }

  return { greeting: greetingFor(s.name, hour), lines };
}
