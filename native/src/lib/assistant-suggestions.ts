import { acwrZone } from './training-card';

/**
 * What the Health Assistant should offer to ask about today.
 *
 * ── the section was called "for you" and was a constant ──
 *
 * Four chips — improve sleep, reduce stress, increase energy, build habits —
 * under a heading that says *Gợi ý cho bạn*. Everybody saw the same four,
 * every day, whatever their data said, and pressing any of them opened an
 * empty chat. The tiles beside them were reading real numbers the whole time,
 * which made the contrast worse rather than better: the page knew you had slept
 * four hours and was suggesting you ask about building habits.
 *
 * This picks from the same day's log the tiles are drawn from, and each
 * suggestion carries the **question** as well as the label — so pressing one
 * does not open a blank coach, it asks the thing.
 *
 * ── the questions carry the number ──
 *
 * "Làm sao ngủ ngon hơn?" is a search query. "Đêm qua tôi ngủ 5h20, làm sao bù
 * lại?" is a question about a person. The coach has no access to the day's log,
 * so anything the question does not say is something the answer cannot use.
 *
 * The rule the rest of this app follows applies here too: **never state a
 * number that is not there**. Every branch that quotes a value is gated on
 * having it, and the ones that fire on missing data ask about the gap instead
 * of inventing a value for it.
 *
 * ── one per topic ──
 *
 * Several rules can fire at once and some of them are about the same thing:
 * a red readiness score and a spiking load usually arrive together, and two
 * chips that both mean "you are overreaching" is one suggestion taking two of
 * the four slots. So each candidate declares a `topic` and only the
 * highest-priority one from each survives.
 *
 * ── ordering is the whole design ──
 *
 * The list below is in priority order and that order is the product decision:
 * what is *wrong today* outranks what is merely *absent today*, and both
 * outrank the evergreen prompts. The evergreens are still there, at the
 * bottom, because a day where nothing is wrong should not produce an empty
 * section.
 */

export type SuggestionGlyph = 'gauge' | 'pulse' | 'moon' | 'flame' | 'leaf' | 'bolt' | 'heart';

/** Broad subject, used to stop two chips saying the same thing. */
export type SuggestionTopic = 'readiness' | 'load' | 'sleep' | 'nutrition' | 'movement' | 'general';

export interface Bilingual {
  vi: string;
  en: string;
}

export interface Suggestion {
  key: string;
  topic: SuggestionTopic;
  glyph: SuggestionGlyph;
  /** what the chip reads — short enough to sit in a pill */
  label: Bilingual;
  /** what is actually sent to the coach */
  question: Bilingual;
}

/** Everything the assistant knows about today, already unwrapped. */
export interface AssistantSignal {
  readiness: number | null;
  status: 'green' | 'yellow' | 'red' | null;
  acwr: number | null;
  /** minutes; 0 means nothing was logged, which is not the same as no sleep */
  sleepMin: number;
  kcal: number;
  kcalTarget: number;
  proteinG: number;
  proteinTarget: number;
  steps: number;
}

/** How many chips the section shows. */
export const SUGGESTION_SLOTS = 4;

/** Below this, a night is short. Seven hours, the app's own threshold. */
export const SHORT_SLEEP_MIN = 420;

/** Eating well under target by this fraction is worth a prompt, not a nag. */
const PROTEIN_SHORTFALL = 0.7;

/** A day with fewer steps than this had no walking in it worth the name. */
const LOW_STEPS = 4000;

const hhmm = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;

/**
 * Candidates in priority order.
 *
 * Returns every rule that fires, including several from one topic — the
 * de-duplication happens after, so that the *reason* a chip won its slot stays
 * readable here rather than being tangled into the conditions.
 */
function candidates(s: AssistantSignal): Suggestion[] {
  const out: Suggestion[] = [];
  const zone = s.acwr != null ? acwrZone(s.acwr) : null;
  const acwr = s.acwr != null ? s.acwr.toFixed(2) : '';

  // ── what is wrong today ──
  if (s.status === 'red') {
    out.push({
      key: 'readiness-low',
      topic: 'readiness',
      glyph: 'gauge',
      label: { vi: 'Vì sao tôi mệt?', en: 'Why am I flat?' },
      question: s.readiness != null
        ? {
            vi: `Điểm sẵn sàng của tôi hôm nay là ${s.readiness}/100. Vì sao lại thấp và hôm nay tôi nên làm gì?`,
            en: `My readiness today is ${s.readiness}/100. Why is it low and what should I do today?`,
          }
        : {
            vi: 'Hôm nay tôi thấy chưa sẵn sàng tập. Tôi nên điều chỉnh thế nào?',
            en: 'I’m not feeling ready to train today. How should I adjust?',
          },
    });
  }

  if (zone === 'spike') {
    out.push({
      key: 'load-spike',
      topic: 'load',
      glyph: 'pulse',
      label: { vi: 'Tôi tập quá nặng?', en: 'Training too hard?' },
      question: {
        vi: `Tỉ lệ tải cấp tính/mạn tính của tôi đang ở ${acwr}, cao hơn nhiều so với thói quen. Tôi có nên giảm tải không, và giảm thế nào?`,
        en: `My acute:chronic workload ratio is ${acwr}, well above my baseline. Should I back off, and how?`,
      },
    });
  } else if (zone === 'elevated') {
    out.push({
      key: 'load-elevated',
      topic: 'load',
      glyph: 'pulse',
      label: { vi: 'Tải đang hơi cao', en: 'Load running high' },
      question: {
        vi: `Tỉ lệ tải của tôi là ${acwr}, hơi cao hơn thói quen. Tuần này tôi nên tập thế nào cho hợp lý?`,
        en: `My load ratio is ${acwr}, a little above my baseline. How should I plan this week?`,
      },
    });
  }

  if (s.sleepMin > 0 && s.sleepMin < SHORT_SLEEP_MIN) {
    out.push({
      key: 'sleep-short',
      topic: 'sleep',
      glyph: 'moon',
      label: { vi: 'Tôi ngủ chưa đủ', en: 'I slept short' },
      question: {
        vi: `Đêm qua tôi chỉ ngủ ${hhmm(s.sleepMin)}. Điều đó ảnh hưởng thế nào tới buổi tập hôm nay và tôi nên bù lại ra sao?`,
        en: `I only slept ${hhmm(s.sleepMin)} last night. How does that affect today’s training, and how should I recover?`,
      },
    });
  }

  if (s.status === 'yellow') {
    out.push({
      key: 'readiness-moderate',
      topic: 'readiness',
      glyph: 'gauge',
      label: { vi: 'Hôm nay tập gì?', en: 'What to train?' },
      question: s.readiness != null
        ? {
            vi: `Điểm sẵn sàng của tôi hôm nay là ${s.readiness}/100. Hôm nay tôi nên tập nặng hay tập nhẹ?`,
            en: `My readiness today is ${s.readiness}/100. Should I train hard or take it easy?`,
          }
        : {
            vi: 'Hôm nay tôi nên tập nặng hay tập nhẹ?',
            en: 'Should I train hard or take it easy today?',
          },
    });
  }

  if (zone === 'detraining') {
    out.push({
      key: 'load-detraining',
      topic: 'load',
      glyph: 'pulse',
      label: { vi: 'Tập lại thế nào?', en: 'Getting back in' },
      question: {
        vi: `Tôi đang tập ít hơn hẳn thói quen (tỉ lệ tải ${acwr}). Làm sao để tăng lại mà không bị chấn thương?`,
        en: `I’ve been training well below my baseline (load ratio ${acwr}). How do I build back up without getting hurt?`,
      },
    });
  }

  if (s.kcal > 0 && s.proteinTarget > 0 && s.proteinG < s.proteinTarget * PROTEIN_SHORTFALL) {
    out.push({
      key: 'protein-low',
      topic: 'nutrition',
      glyph: 'flame',
      label: { vi: 'Thiếu đạm hôm nay', en: 'Short on protein' },
      question: {
        vi: `Hôm nay tôi mới ăn ${Math.round(s.proteinG)}g đạm trên mục tiêu ${Math.round(s.proteinTarget)}g. Gợi ý vài món giúp tôi bù phần còn lại?`,
        en: `I’ve had ${Math.round(s.proteinG)}g of protein today against a ${Math.round(s.proteinTarget)}g target. What could I eat to close the gap?`,
      },
    });
  }

  // ── what is missing today ──
  if (s.kcal === 0) {
    out.push({
      key: 'meal-idea',
      topic: 'nutrition',
      glyph: 'flame',
      label: { vi: 'Hôm nay ăn gì?', en: 'What to eat?' },
      question: {
        vi: `Mục tiêu của tôi là khoảng ${s.kcalTarget} kcal và ${Math.round(s.proteinTarget)}g đạm mỗi ngày. Gợi ý thực đơn cho hôm nay?`,
        en: `My daily targets are about ${s.kcalTarget} kcal and ${Math.round(s.proteinTarget)}g of protein. What could I eat today?`,
      },
    });
  }

  if (s.steps > 0 && s.steps < LOW_STEPS) {
    out.push({
      key: 'steps-low',
      topic: 'movement',
      glyph: 'bolt',
      label: { vi: 'Vận động ít', en: 'Barely moved' },
      question: {
        vi: `Hôm nay tôi mới đi ${s.steps.toLocaleString()} bước. Có cách nào dễ để vận động thêm trong ngày không?`,
        en: `I’ve only walked ${s.steps.toLocaleString()} steps today. What are some easy ways to move more?`,
      },
    });
  }

  if (s.sleepMin === 0) {
    out.push({
      key: 'sleep-quality',
      topic: 'sleep',
      glyph: 'moon',
      label: { vi: 'Ngủ ngon hơn', en: 'Sleep better' },
      question: {
        vi: 'Tôi muốn ngủ sâu hơn và dậy đỡ mệt. Có những thay đổi nào đáng làm trước khi đi ngủ?',
        en: 'I want deeper sleep and to wake up less tired. What’s worth changing in my evening routine?',
      },
    });
  }

  // ── evergreen, so the section is never empty ──
  out.push(
    {
      key: 'recovery',
      topic: 'general',
      glyph: 'leaf',
      label: { vi: 'Phục hồi tốt hơn', en: 'Recover better' },
      question: {
        vi: 'Tôi nên làm gì giữa các buổi tập để phục hồi tốt hơn?',
        en: 'What should I be doing between sessions to recover better?',
      },
    },
    {
      key: 'energy',
      topic: 'general',
      glyph: 'bolt',
      label: { vi: 'Tăng năng lượng', en: 'More energy' },
      question: {
        vi: 'Buổi chiều tôi hay tụt năng lượng. Nguyên nhân thường là gì và sửa thế nào?',
        en: 'My energy dips in the afternoon. What usually causes that and how do I fix it?',
      },
    },
    {
      key: 'habit',
      topic: 'general',
      glyph: 'heart',
      label: { vi: 'Xây thói quen', en: 'Build habits' },
      question: {
        vi: 'Làm sao để tôi duy trì đều đặn việc tập và ăn uống trong nhiều tháng?',
        en: 'How do I stay consistent with training and food over months rather than weeks?',
      },
    },
    /* The fourth, and it exists because of arithmetic rather than taste: with
       three evergreens a day where nothing is wrong produced three chips and a
       gap. `tools/suggestions.mjs` caught it on the plainest day in its set —
       the one nobody thinks to look at, because nothing is happening on it. */
    {
      key: 'weekly-plan',
      topic: 'general',
      glyph: 'pulse',
      label: { vi: 'Kế hoạch tuần', en: 'Plan my week' },
      question: {
        vi: 'Tuần này tôi nên tập mấy buổi, vào những ngày nào, và nghỉ ngày nào?',
        en: 'How many sessions should I train this week, on which days, and when should I rest?',
      },
    },
  );

  return out;
}

/**
 * The chips to show, at most `SUGGESTION_SLOTS`, one per topic.
 *
 * `general` is exempt from the one-per-topic rule — the evergreens are the
 * padding that keeps the section full, and collapsing them to a single chip
 * would leave a day with nothing wrong showing one suggestion and three gaps.
 */
export function suggestionsFor(s: AssistantSignal): Suggestion[] {
  const seen = new Set<SuggestionTopic>();
  const out: Suggestion[] = [];
  for (const c of candidates(s)) {
    if (c.topic !== 'general') {
      if (seen.has(c.topic)) continue;
      seen.add(c.topic);
    }
    out.push(c);
    if (out.length === SUGGESTION_SLOTS) break;
  }
  return out;
}
