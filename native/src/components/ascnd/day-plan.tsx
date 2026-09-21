import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check, ChevronDown, Info, Minus, Moon, Pencil, Plus, Timer, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Crypto from 'expo-crypto';

import { ExerciseProgress } from '@/components/ascnd/exercise-progress';
import { Expander } from '@/components/ascnd/expander';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { PressScale } from '@/components/ascnd/press-scale';
import { nav } from '@/lib/nav';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { RestTimer } from '@/components/ascnd/rest-timer';
import { Retract } from '@/components/ascnd/retract';
import { SEGMENT_SWAP } from '@/components/ascnd/segmented';
import type { TplExercise } from '@/components/ascnd/template-list';
import { summarizeSets } from '@/lib/set-summary';
import { duration, press } from '@/constants/motion';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles, type Palette, type PaletteKey } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';
import { useExerciseInsights } from '@/hooks/use-exercise-insights';
import type { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useAppendToSession, useLogWorkoutSession, useRemoveSetFromSession, useRestoreSession } from '@/hooks/use-fitness-data';
import { useUnits } from '@/hooks/use-units';
import { exerciseKey } from '@/lib/personal-record';
import { mergeProgress, sessionTicks, type SessionSet } from '@/lib/day-progress';
import { dayProgressKey, localDateStr, staleDayProgress } from '@/lib/local-date';
import { offlineNow } from '@/lib/offline';
import { OFFLINE_WRITE_KEY, type OfflineWrite } from '@/lib/offline-write';
import { DEFAULT_REST, DEFAULT_RPE, restLabel } from '@/lib/prescription';
import { toast } from '@/lib/toast';
import { parseRepEntry } from '@/lib/rep-entry';
import { displayWeight, weightLabel, weightToKg } from '@/lib/units';
import { decText, intText } from '@/lib/number-input';

/**
 * One day of the week, as the thing you do rather than the thing you planned.
 *
 * ── a set is the unit ──
 *
 * The plan stores `3 × 10 at 60 kg` as one exercise. That is how it is written
 * and it is not how it is done: three sets happen at three different times,
 * separated by rest, and the third one is the one that comes in two reps light.
 * So the plan is expanded — one row per set — and each row is ticked on its own.
 *
 * Effort and rest are per set for the same reason. Effort is already stored per
 * set on the session; there was simply never anywhere to enter it. Rest is the
 * one you change mid-workout — the plan says ninety seconds and the fourth set
 * says otherwise — so it is adjustable in the row and on the clock while it is
 * running.
 *
 * ── rest is a countdown, not a label ──
 *
 * Ticking a set starts its rest running. A number sitting in a row cannot tell
 * you when to go again; a clock can, and it is the only thing here that has to
 * be readable while you are not holding the phone.
 *
 * ── it lives in the week, not on a screen of its own ──
 *
 * It was a pushed screen for one commit. That put the day one navigation away
 * from the week and made the strip of dates at the top of the week decorative,
 * which is the same as broken: a row of dates you cannot tap is not a calendar.
 * Picking a day up there and reading it down here is one screen doing one job.
 */

/**
 * How a day arrives when you tap another one.
 *
 * It was `rise(i)` — the app's standard card entrance, a spring from below on
 * a 60ms per-row delay. That is right for a page you have just navigated to,
 * where the cascade is the screen introducing itself. It is wrong here, and
 * wrong in a way you feel rather than see: the strip at the top is a *segmented
 * control*, and this panel is keyed by it, so every tap replayed up to half a
 * second of staggered springing for what should be an immediate swap. Tapping
 * T2, T3, T4 in sequence left three cascades overlapping each other.
 *
 * A short uniform fade instead. The panel is being *replaced*, not arriving,
 * and it only has to be long enough to stop being a hard cut without becoming
 * a movement anybody has to wait through — `duration.appear`, not the half
 * second this replaced.
 *
 * That finding now lives in `segmented.tsx` as `SEGMENT_SWAP`, because it was
 * never about this screen — it is what a segmented panel swap should be
 * anywhere. Five other segmented controls in the app never got it. Keeping a
 * second `FadeIn.duration(140)` here would be the same shape of bug this
 * repository keeps finding: one rule, N copies, and the copies drift.
 */
const SWAP = SEGMENT_SWAP;

/** The scale the builder offers, so the two screens ask for the same thing. */
const RPE_CHOICES = [6, 7, 8, 9, 10] as const;

/**
 * What the top of the scale costs you, in colour.
 *
 * Six and seven are work — they carry no colour, because a set you had four
 * reps left in is not news and colouring it would spend the reader's attention
 * on the ordinary case.
 *
 * The last three are the ones with consequences, and they are the app's own
 * warning ramp rather than three colours picked to look different:
 *
 *   8   two reps left, the edge of productive work        yellow
 *   9   one rep left, close enough to miss the next one   orange
 *   10  nothing left, the set ended because you could not   red
 *
 * That is the same yellow, orange and red the readiness score uses for the same
 * meaning — approaching a limit, at it, past it — so somebody who has read one
 * of them has read both. It is deliberately *not* a green-to-red scale: green
 * would say a light set is good and a hard one is bad, and effort is a
 * prescription, not a grade. Nothing here is green.
 */
/*
  Khoá của bảng màu, không phải mã màu: một mã màu ở phạm vi module bị ĐÓNG BĂNG
  lúc import và sẽ giữ màu của theme tối kể cả khi người dùng bật theme sáng.
  Bảng vẫn là hằng thật; chỗ vẽ — nơi luôn có `c` — mới đổi khoá thành màu.
*/
const EFFORT_TINT: Record<number, PaletteKey> = {
  8: 'readinessYellow',
  9: 'metricOrange',
  10: 'readinessRed',
};
/* Nhận bảng màu qua THAM SỐ, không gọi hook: nó được gọi bên trong một `.map()`
   của hàng bài tập, và một hook ở đó là một lỗi lúc chạy mà kiểu không thấy. */
const tintFor = (c: Palette, rpe: number) => c[EFFORT_TINT[rpe] ?? 'foreground'];

/** Rest moves in fifteens, which is how a gym clock is read. */
const REST_STEP = 15;
const REST_MAX = 600;

/**
 * Cụm điều khiển của một set đang mở thụt vào bằng đúng bề ngang của ô tick.
 *
 * Hai con số đã có sẵn, cộng lại ở đây thay vì gõ 36 vào style — nếu có ngày ô
 * tick rộng ra thì cụm điều khiển đi theo, chứ không lệch một mình. Đó là lý do
 * nó là một phép cộng chứ không phải một hằng số.
 */
const CHECK_SIZE = 28;
const SET_INDENT = CHECK_SIZE + spacing.sm;

/** One row: a set of one exercise, and what you did with it. */
interface SetRow {
  key: string;
  /**
   * Danh tính bài tập, khi kế hoạch có nó.
   *
   * `exerciseName` ở ngay dưới là thứ để HIỂN THỊ và vẫn là khoá duy nhất mà
   * lịch sử luyện tập có — xem `exerciseKey`. Trường này là thứ để TRA CỨU
   * định nghĩa: một khoá ngoại về `exercises.id`.
   *
   * Tuỳ chọn vĩnh viễn, không phải tạm thời. Ba nguồn hợp lệ không có nó:
   * template cũ tạo trước khi builder ghi trường này, bài thêm tay giữa buổi
   * (người dùng gõ một cái tên chưa có trong thư viện), và bất kỳ dòng JSONB
   * nào viết bằng tay — `workout_templates.exercises` không có ràng buộc khoá
   * ngoại nào ở tầng cơ sở dữ liệu.
   */
  exerciseId?: string;
  exerciseName: string;
  ordinal: number;
  of: number;
  /** kilograms, as stored */
  weight: number;
  reps: number;
  plannedRest: number;
  plannedRpe: number;
  /** true when this row is the first of its exercise, so the name is printed */
  heads: boolean;
  /** set when the row is a movement added today rather than one the plan asked
      for — carries the id so the card can rename, extend and remove it */
  adHoc?: string;
}

/** A movement added on the day: a name, and how many sets of it happened. */
interface AdHoc {
  id: string;
  name: string;
  sets: number;
}

/**
 * The rows for movements that were not in the plan.
 *
 * ── why these are rows and not a second list ──
 *
 * They arrive on exactly the same `SetRow` shape as planned work, so the
 * ticking, the resume point, the effort chips, the progress bar and the two
 * submit paths all pick them up without knowing they exist. The alternative —
 * a parallel "extras" list carried beside `rows` — is the same feature written
 * twice, and the second copy is the one that would forget to be counted.
 *
 * Their planned load and rep count are ZERO, which is not a placeholder: it is
 * what "the plan did not ask for this" means, and it is what makes the boxes
 * open blank and light up the moment anything is typed. The rest and effort
 * defaults are the app's, because a set you decided to do still has a sensible
 * rest and still deserves an effort chip.
 */
function adHocRows(list: AdHoc[]): SetRow[] {
  const rows: SetRow[] = [];
  for (const e of list) {
    /* Same clamp and same reason as `expand`: this number reaches storage, and
       storage is a place a value can come back wrong from. */
    const count = Math.max(1, Math.min(20, Math.round(e.sets)));
    for (let n = 0; n < count; n++) {
      rows.push({
        key: `x${e.id}-${n}`,
        exerciseName: e.name,
        ordinal: n + 1,
        of: count,
        weight: 0,
        reps: 0,
        plannedRest: DEFAULT_REST,
        plannedRpe: DEFAULT_RPE,
        /*
          Chỉ hàng ĐẦU của mỗi bài thêm vào mới mở thẻ mới.

          Dòng này từng là `heads: true` cho MỌI hàng, với lý do đúng nhưng
          quá tay: cần tách hai bài thêm vào chưa đặt tên khỏi nhau, vì chúng
          cùng mang tên rỗng và `blocks` gom theo tên. Đặt cờ cho mọi hàng thì
          tách được điều đó — và tách luôn cả các HIỆP của cùng một bài, nên
          bấm "thêm hiệp" đẻ ra một thẻ rời thứ hai thay vì thêm một dòng vào
          thẻ đang có.

          `n === 0` tách đúng thứ cần tách: bài mới mở thẻ mới, hiệp mới nối
          vào thẻ của chính bài nó — kể cả khi hai bài thêm vào trùng tên, vì
          hàng đầu của bài thứ hai vẫn mang cờ.
        */
        heads: n === 0,
        adHoc: e.id,
      });
    }
  }
  return rows;
}

function expand(exercises: TplExercise[]): SetRow[] {
  const rows: SetRow[] = [];
  exercises.forEach((ex, i) => {
    /*
      Clamped. `exercises` is free JSON on the template row — a number written
      by an older version of the app, or by hand, can be anything, and a set
      count of 4000 would build 4000 views before anything here looked wrong.
    */
    const count = Math.max(1, Math.min(20, Math.round(ex.sets ?? 1)));
    for (let n = 0; n < count; n++) {
      rows.push({
        key: `${i}-${n}`,
        /* Mang khoá ngoại qua, không đánh rơi nó ở đây. `?? undefined` chứ
           KHÔNG `?? ''`: chuỗi rỗng là một id trông như có mà tra không ra, còn
           `undefined` nói đúng điều đang đúng — kế hoạch này không nói bài ấy
           là dòng nào trong thư viện, nên hãy tra theo tên. */
        exerciseId: ex.exerciseId || undefined,
        exerciseName: ex.exerciseName ?? '',
        ordinal: n + 1,
        of: count,
        weight: ex.weight ?? 0,
        reps: ex.reps ?? 0,
        plannedRest: ex.restSeconds ?? DEFAULT_REST,
        plannedRpe: ex.rpe ?? DEFAULT_RPE,
        heads: n === 0,
      });
    }
  });
  return rows;
}

/**
 * Throw away the resume points that can no longer be resumed.
 *
 * Runs once when the panel first mounts, not on every day you flick through:
 * it reads every key in storage, and doing that seven times while somebody
 * scrubs across the week is seven reads to delete nothing.
 *
 * Failures are swallowed on purpose. This is housekeeping — a workout must not
 * fail to open because a cleanup could not run.
 */
/**
 * Whether the effort/rest editor has demonstrated itself yet, this app run.
 *
 * See the effect that reads it: a per-component ref reset on every day switch,
 * which turned a one-off hint into a panel that opened under your thumb every
 * time you tapped a different day.
 */
let introduced = false;

let pruned = false;
async function pruneOldProgress() {
  if (pruned) return;
  pruned = true;
  try {
    const stale = staleDayProgress(await AsyncStorage.getAllKeys());
    // `removeMany`, not `multiMove`/`multiRemove` — this version of
    // `@react-native-async-storage/async-storage` renamed the batch methods
    // (`getMany`/`setMany`/`removeMany`) and the old names do not exist.
    if (stale.length) await AsyncStorage.removeMany(stale);
  } catch {
    // nothing here is worth interrupting a workout for
  }
}

/**
 * Mũi tên của một hàng disclosure, QUAY chứ không đổi glyph.
 *
 * ── vì sao không phải `ChevronDown` đổi sang `ChevronUp` ──
 *
 * Thân thẻ mất `duration.move` để co lại. Một mũi tên đổi glyph thì xong trong
 * một khung hình, nên mắt thấy hai sự kiện: mũi tên lật, rồi thẻ đóng. Cùng
 * một con số, cùng một đường cong, thì đó là một sự kiện — và đó đúng là thứ
 * `craft-floor` gọi là "one authored moment".
 *
 * `rotate` là một transform, nên nó không rơi vào điều `tools/motion.mjs` cấm:
 * luật ấy cấm thuộc tính LAYOUT bên trong `useAnimatedStyle` (thứ bắt chạy lại
 * layout mỗi khung hình trên luồng JS). Một phép quay chạy thẳng trên luồng UI.
 *
 * `useReducedMotion` vì `expander.tsx` ngay bên cạnh cũng đọc nó: nếu thân thẻ
 * mở tức thì mà mũi tên vẫn quay 240ms thì phần bị tắt lại là phần duy nhất
 * người dùng còn thấy chuyển động.
 */
function Chevron({ open, color }: { open: boolean; color: string }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    const to = open ? 1 : 0;
    t.value = reduceMotion
      ? to
      : withTiming(to, { duration: duration.move, easing: Easing.out(Easing.cubic) });
  }, [open, reduceMotion, t]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value * 180}deg` }] }));
  return (
    <Animated.View style={spin}>
      <Icon icon={ChevronDown} size={15} color={color} />
    </Animated.View>
  );
}

export function DayPlan({
  dateStr,
  template,
  isRest,
  sessions,
  i18n,
  onEdit,
}: {
  /** the calendar day being shown, `YYYY-MM-DD` — what a finished session is filed under */
  dateStr: string;
  template: { id: string; name: string; exercises?: unknown } | null;
  isRest: boolean;
  /**
   * What is already recorded against this day.
   *
   * The week has always known this — it is what turns a day green — and this
   * panel did not, which left the two halves of one screen disagreeing: the
   * pill above said "Hoàn thành" while the button below was still live and
   * would happily write a second session for the same workout.
   *
   * A session can also arrive from the free-form log sheet, or from yesterday's
   * app run, so "did I just save it" is not the same question as "is this day
   * done" and cannot be answered from local state.
   */
  sessions: {
    id: string;
    date_time: string;
    template_name: string | null;
    session_rpe: number | null;
    volume_load: number | null;
    /** free JSONB on the row — read defensively, it can be anything */
    sets?: unknown;
  }[];
  i18n: ReturnType<typeof useI18n>;
  onEdit: () => void;
}) {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  const { weight: wUnit } = useUnits();
  const log = useLogWorkoutSession();
  const append = useAppendToSession();
  const cutSet = useRemoveSetFromSession();
  const restore = useRestoreSession();
  const { user } = useAuth();
  /*
    ── the durable twin, which this screen did not have ──

    `useLogWorkoutSession`'s own header says two screens finish a workout: the
    free-form log sheet and this one. Only the sheet was given an offline path.

    What that left here is the failure `log-workout.tsx` describes and then
    fixes for itself: the write needs the network twice — once to read history
    for records, once to insert — so offline React Query pauses it, `isPending`
    stays true for ever, `canFinish` goes false, and the button greys out with
    no toast and no explanation. Worse than stuck: the paused mutation *is*
    persisted, but it carries no `mutationKey`, so on the next launch it comes
    back with no `mutationFn` to hand its variables to and is dropped. The sets
    are gone, and the local resume point under `dayProgressKey` was the only
    other copy.

    This is the screen you tick sets on **while training** — a basement, a
    stairwell, a gym with one bar of signal — which makes it the more likely of
    the two to be used without a connection, not the less.

    No `mutationFn` here on purpose: what comes back from storage is the default
    registered in `offline-write`, not this closure.
  */
  const queue = useMutation<void, Error, OfflineWrite>({ mutationKey: [...OFFLINE_WRITE_KEY] });
  const wl = weightLabel(wUnit);

  const exercises: TplExercise[] = Array.isArray(template?.exercises)
    ? (template.exercises as TplExercise[])
    : [];
  /**
   * What you did that the plan did not ask for.
   *
   * The complaint this answers was about STEPS: the plan is on this screen, so
   * an extra movement had to be recorded on a different one, which meant
   * leaving a half-ticked workout to go and type somewhere else. There is no
   * version of that which is not worse than a button at the bottom of the list
   * you are already looking at.
   *
   * Today's session only. This does not touch the template — next week's
   * Monday is still what the plan says, because "I also did some curls" is a
   * fact about today and editing the programme is a decision, not a side
   * effect of logging.
   */
  const [extra, setExtra] = useState<AdHoc[]>([]);

  const planned = useMemo(() => expand(exercises), [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* One list from here down. Everything that reads `rows` — the tick state, the
     resume point, the progress bar, both submit paths — treats an added
     movement exactly like a planned one, which is the point. */
  const rows = useMemo(() => [...planned, ...adHocRows(extra)], [planned, extra]);

  /*
    The sets of one movement, in one card.

    Every set used to be its own `GlassCard`: three sets of a bench press drew
    three separate cards, each repeating "55 kg × 10", the rest chip and the
    effort chip — and a nine-set day drew nine cards of it. Measured on the
    routine screenshot: four cards visible, three of them identical.

    Apple calls the alternative an inset grouped list, and describes exactly the
    thing that was missing: a continuous background "that extends from the
    section header, around both sides of list items in the section, and down to
    the section footer", which "visually groups the items to a greater degree"
    than separate boxes. The exercise is the group and its sets are the rows.
  */
  const blocks = useMemo(() => {
    const out: { name: string; rows: SetRow[] }[] = [];
    for (const r of rows) {
      const tail = out[out.length - 1];
      if (tail && tail.name === r.exerciseName && !r.heads) tail.rows.push(r);
      else out.push({ name: r.exerciseName, rows: [r] });
    }
    return out;
  }, [rows]);

  /*
    How each movement in this plan is going.

    One extra query on this screen — the engine reads ninety days of sessions
    and the routine already reads fourteen — and it buys the difference between
    a plan row that says what to do and a plan row that says what happened last
    time you did it. `useExerciseInsights` adds nothing else: the weigh-ins and
    the exercise library are queries other screens already hold.

    Keyed by `exerciseKey`, because a template row carries a typed name and
    usually no id — the same rule `personal-record.ts` matches on.
  */
  const { insights, performances } = useExerciseInsights();
  const byKey = useMemo(() => {
    const m = new Map<string, (typeof insights)[number]>();
    for (const i of insights) m.set(i.exerciseKey, i);
    return m;
  }, [insights]);
  const insightFor = (name: string) => byKey.get(exerciseKey(name)) ?? null;

  /* The most recent session of a movement — what the strip leads with, because
     the number you are about to try to beat is the useful fact on this row. */
  const lastByKey = useMemo(() => {
    const m = new Map<string, (typeof performances)[number]>();
    for (const p of performances) m.set(p.exerciseKey, p);
    return m;
  }, [performances]);
  const lastFor = (name: string) => lastByKey.get(exerciseKey(name)) ?? null;

  /** what was done, and at what effort and rest */
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [rpe, setRpe] = useState<Record<string, number>>({});
  const [rest, setRest] = useState<Record<string, number>>({});
  /**
   * What actually went on the bar, and what actually came back up.
   *
   * ── why this had to exist ──
   *
   * Until now this panel ticked boxes and then submitted the TEMPLATE's
   * numbers as though they had been performed. Load six sets at 55 kg, do the
   * last two at 60 because it felt light, and the record said 55 six times.
   * Every number downstream inherited that: volume load, the trend chart, the
   * "last time" line on the card above, personal records. The screen was
   * quietly authoring a training history nobody had lifted.
   *
   * `log-workout.tsx` already knew: "the third set of a five-set squat is the
   * one that came in two reps light, and a form that cannot say so is a form
   * people stop trusting". This panel was that form. The fix is not another
   * screen to switch to — it is these two boxes, on the row, where the tick is.
   *
   * ── text, not numbers ──
   *
   * The same reason the sheet gives for its own boxes: a half-typed "6" on the
   * way to 60 is not the number six, and a cleared box is not zero kilograms.
   *
   * ── and absent, not seeded ──
   *
   * A key here means "this set differed". Nothing is written when the day
   * loads, so the common case stores nothing, the row stays quiet, and a plan
   * edited between sessions still reaches an untouched row as the new plan
   * rather than as a stale copy of the old one.
   */
  const [weightText, setWeightText] = useState<Record<string, string>>({});
  const [repsText, setRepsText] = useState<Record<string, string>>({});
  /** the one row showing its editors — at most one, so the list stays short */
  const [editing, setEditing] = useState<string | null>(null);
  /**
   * The rest that is running: how long is left and what it began at.
   *
   * The ring needs both. `left` alone would have nothing to be a fraction of,
   * and taking the fraction from the *set's* planned rest would break the
   * moment somebody adds thirty seconds mid-rest — the ring would sit past
   * full and then jump.
   */
  /**
   * Nghỉ đang chạy — và SET KẾ TIẾP mà nó đang chờ.
   *
   * `next` không phải trang trí. Một đồng hồ đếm ngược không nói nó đếm để làm
   * gì thì nó chỉ là một con số: bạn nhìn 1:27 rồi vẫn phải nhớ trong đầu mình
   * vừa xong set mấy và sắp làm gì. Mang theo tên bài và set thứ mấy biến chỗ
   * chờ thành chỗ chuẩn bị.
   */
  const [resting, setResting] = useState<
    { left: number; total: number; next: { name: string; ordinal: number; of: number } | null } | null
  >(null);

  /*
    Read back once, and only once.

    `loaded` guards the write-back below as much as the read: without it the
    first render would persist an empty object over whatever was stored, before
    the read had a chance to return.
  */
  const storeKey = template ? dayProgressKey(dateStr, template.id) : null;
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!storeKey) return;
    void pruneOldProgress();
    setLoaded(false);
    AsyncStorage.getItem(storeKey)
      .then((raw) => {
        if (!alive) return;
        if (raw) {
          try {
            const saved = JSON.parse(raw) as {
              done?: Record<string, boolean>;
              rpe?: Record<string, number>;
              rest?: Record<string, number>;
              weightText?: Record<string, string>;
              repsText?: Record<string, string>;
              extra?: AdHoc[];
            };
            setDone(saved.done ?? {});
            setRpe(saved.rpe ?? {});
            setRest(saved.rest ?? {});
            /* Absent in a blob written before these existed, which is exactly
               what "as planned" already means — no migration needed. */
            setWeightText(saved.weightText ?? {});
            setRepsText(saved.repsText ?? {});
            /* Filtered rather than trusted: this came off the disk, where a
               half-written blob or an older shape can leave an entry with no
               id, and an id is what every row key here is built from. */
            setExtra(
              Array.isArray(saved.extra)
                ? saved.extra.filter((e) => e && typeof e.id === 'string' && e.id.length > 0)
                : [],
            );
          } catch {
            // a corrupt entry is not worth a crash — start the workout fresh
          }
        }
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [storeKey]);

  /*
    One panel opens by itself, on the first set that is not done yet.

    Two chips reading `1:30` and `RPE 8` look like a readout, and a readout is
    not something anybody tries to press. The rest and the effort were both
    adjustable from the day this screen existed and neither was findable, which
    is the same as neither existing.

    So the first one is already open. It shows the stepper and the scale, it
    closes the moment a choice is made, and every other row behaves normally
    from then on — the demonstration costs one tap to dismiss and is never
    repeated within a day.

    Module scope, not a ref — and that is the whole fix.

    A ref lives as long as the component, and this component is remounted by
    its key every time you tap a different day. So the "demonstration" fired on
    *every* day switch: flick across the week and a panel springs open under
    your thumb seven times, each one needing a tap to close. What was meant to
    teach an affordance once became the most annoying thing on the screen.

    The affordance needs showing once per app run. That is a lifetime longer
    than any component here has, so it is held outside all of them.
  */
  useEffect(() => {
    if (!loaded || introduced || rows.length === 0) return;
    introduced = true;
    const next = rows.find((r) => !shown[r.key]);
    // Nothing left undone means the day is already recorded — there is no
    // "next set" to demonstrate the editors on, and opening one on a set that
    // has happened invites editing a record rather than making one.
    if (!next) return;
    setEditing(next.key);
    // `done` is read once, at the moment the resume point lands; depending on
    // it would re-run this every time a set is ticked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, rows]);

  useEffect(() => {
    if (!storeKey || !loaded) return;
    AsyncStorage.setItem(
      storeKey,
      JSON.stringify({ done, rpe, rest, weightText, repsText, extra }),
    ).catch(
      () => {
        // losing the resume point is survivable; interrupting the workout is not
      },
    );
  }, [storeKey, loaded, done, rpe, rest, weightText, repsText, extra]);

  /*
    The rest clock.

    One interval, started when a rest begins and cleared when it ends, rather
    than a timer that runs for the whole session and checks whether it has
    anything to do.
  */
  const running = resting !== null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setResting((s) => {
        if (s === null) return null;
        if (s.left <= 1) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return null;
        }
        return { ...s, left: s.left - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const restOf = useCallback((row: SetRow) => rest[row.key] ?? row.plannedRest, [rest]);

  const addExercise = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExtra((prev) => [...prev, { id: Crypto.randomUUID(), name: '', sets: 1 }]);
  };
  const renameExtra = (id: string, name: string) =>
    setExtra((prev) => prev.map((e) => (e.id === id ? { ...e, name } : e)));
  const addSet = (id: string) => {
    Haptics.selectionAsync();
    /* Same ceiling as every other set count in this file. */
    setExtra((prev) => prev.map((e) => (e.id === id ? { ...e, sets: Math.min(20, e.sets + 1) } : e)));
  };
  const removeExtra = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExtra((prev) => prev.filter((e) => e.id !== id));
  };

  /*
    The plan, written the way the boxes below write it: in the unit on screen,
    to one decimal, and blank when there is no load to carry.

    Blank rather than "0" for the reason `log-workout.tsx` gives — a zero in a
    numeric field reads as a value somebody entered, and would be saved as a
    real zero-kilo set. Bodyweight work has nothing to prefill.
  */
  const plannedLoad = useCallback(
    (row: SetRow) =>
      row.weight > 0 ? String(Math.round(displayWeight(row.weight, wUnit) * 10) / 10) : '',
    [wUnit],
  );
  const plannedReps = (row: SetRow) => (row.reps > 0 ? String(row.reps) : '');
  const loadOf = (row: SetRow) => weightText[row.key] ?? plannedLoad(row);
  const repsOf = (row: SetRow) => repsText[row.key] ?? plannedReps(row);

  /**
   * One set, as performed — the single place the panel turns what is on screen
   * into what gets written down.
   *
   * Both submit paths and the volume total read it, so an offline session and
   * an online one cannot disagree about what happened, and the number under the
   * bar cannot disagree with either.
   *
   * ── the two fallbacks, and why they are not the same shape ──
   *
   * A load that will not parse falls back to **nothing**, because a blank
   * weight box is what bodyweight work looks like and `0 × reps` is the honest
   * volume for it.
   *
   * A rep entry that will not parse falls back to **the plan**, because ticking
   * a row is itself a statement that the planned set happened. Writing zero
   * reps there would delete a set the person just said they did.
   */
  const performed = useCallback(
    (row: SetRow) => {
      const typed = Number(loadOf(row));
      const entry = parseRepEntry(repsOf(row));
      const said = entry.reps > 0 || (entry.durationSec ?? 0) > 0;
      return {
        weight: Number.isFinite(typed) && typed > 0 ? weightToKg(typed, wUnit) : 0,
        reps: said ? entry.reps : row.reps,
        durationSec: entry.durationSec ?? undefined,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weightText, repsText, wUnit, plannedLoad],
  );

  /*
    What is ticked: what you ticked, filled in by what the day's sessions prove.

    Only the checkbox ever wrote a tick, so a workout recorded from the
    free-form sheet left this panel reading "0/12 set" under an empty bar —
    beside a session card saying it was done at 18:40, a green day on the strip
    above, and a finish button reading "đã ghi". Three claims that it happened
    and three that it had not started, on one screen.

    `mergeProgress` reads the session's sets back onto the planned rows. See
    `lib/day-progress.ts` for why it matches on exercise name and count, why it
    refuses to match on weight, and why stored ticks win over evidence.

    Derived at render and never stored. The sessions are the record; a copy in
    `AsyncStorage` could outlive the session it came from, and a tick that
    outlives its evidence is indistinguishable from one you made.
  */
  const shown = useMemo(() => {
    const sets = sessions.flatMap((sn) => (Array.isArray(sn.sets) ? (sn.sets as SessionSet[]) : []));
    return mergeProgress(done, rows, sets);
  }, [done, rows, sessions]);

  /*
    ── BỎ tích thì hỏi lại; TÍCH thì không ──

    Hai chiều không đối xứng. Tích là ghi lại một việc vừa làm, và hỏi lại ở đó
    là chen một hộp thoại vào giữa hiệp tập — đúng lúc người ta đang thở.

    Bỏ tích là nói "việc ấy KHÔNG xảy ra", và nó xoá một set khỏi thứ sắp được
    ghi. Ở một bài phát sinh, bỏ tích set cuối làm nút nối tắt hẳn mà không có
    dòng nào nói vì sao. Một chạm nhầm vào ô vuông 28 điểm không nên làm được
    chuyện đó lặng lẽ.
  */
  /*
    ── một hàng "đủ" là hàng có TÊN và có REP (hoặc số giây) ──

    Dùng ở hai chỗ và vì thế nằm trên cả hai: ô tích không cho tích một bài
    thêm vào còn trống, và nút nối thêm không sống nếu còn một hàng như thế.
    Hai luật ấy phải hỏi CÙNG một câu — nếu không thì tích được mà không ghi
    được, và người dùng không có cách nào biết vì sao.
  */
  /*
    ── hàng nào buổi ĐÃ GHI đã chứng minh, và hàng nào chưa ──

    `shown` trộn ô người dùng tích với thứ buổi tập chứng minh, nên sau khi ghi
    xong thì cả hai loại trông giống hệt nhau. Để nối thêm được, phải tách ra:
    `sessionTicks` là đúng hàm ấy — nó đã sống ở `day-progress.ts` cho việc
    trộn, và đây là cùng một câu hỏi hỏi riêng.

    Bài PHÁT SINH thêm sau khi đã ghi nằm đúng ở phần chênh: nó không có trong
    buổi cũ, nên nó là thứ được nối vào.
  */
  const proven = useMemo(() => {
    const sets = sessions.flatMap((sn) => (Array.isArray(sn.sets) ? (sn.sets as SessionSet[]) : []));
    return sessionTicks(rows, sets);
  }, [rows, sessions]);
  const rowReady = useCallback(
    (r: SetRow) => {
      if (r.exerciseName.trim() === '') return false;
      const p = performed(r);
      return p.reps > 0 || (p.durationSec ?? 0) > 0;
    },
    [performed],
  );

  const doToggle = useCallback(
    (row: SetRow) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const secs = rest[row.key] ?? row.plannedRest;
      // `shown`, not `prev` — a row ticked by a logged session is absent from
      // `prev`, so `!prev[key]` would write `true` over a box already drawn
      // ticked and the tap would do visibly nothing.
      const next = !shown[row.key];
      setDone((prev) => ({ ...prev, [row.key]: next }));
      /* Hàng NGAY SAU trong danh sách đã dựng, chứ không phải `ordinal + 1`:
         set cuối của một bài thì set kế tiếp thuộc bài khác, và chỉ danh sách
         mới biết bài nào. Hết danh sách thì không có gì kế tiếp — đồng hồ vẫn
         chạy, nó chỉ không hứa hẹn gì. */
      const after = rows[rows.findIndex((r) => r.key === row.key) + 1];
      // Rest belongs to finishing a set, not to changing your mind about one.
      setResting(
        next && secs > 0
          ? {
              left: secs,
              total: secs,
              next: after
                ? { name: after.exerciseName, ordinal: after.ordinal, of: after.of }
                : null,
            }
          : null,
      );
    },
    [rest, rows, shown],
  );

  const toggle = useCallback(
    (row: SetRow) => {
      if (!shown[row.key]) {
        /*
          ── chưa đủ thì KHÔNG tích được ──

          Chỉ áp cho bài THÊM VÀO. Một hàng theo kế hoạch luôn có tên và có số
          rep từ template, nên nó không bao giờ rơi vào đây; còn thẻ thêm vào
          sinh ra rỗng, và tích một hàng rỗng là nói "xong" về một bài chưa có
          tên lẫn số lần.

          Nói ra lý do chứ không lặng lẽ bỏ qua: một ô tích bấm mà không nhúc
          nhích là thứ người ta bấm lại ba lần rồi kết luận app hỏng.
        */
        if (row.adHoc && !rowReady(row)) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          toast.error(i18n.nRdNeedInfo);
          return;
        }
        doToggle(row);
        return;
      }
      Alert.alert(i18n.nRdUntickTitle, i18n.nRdUntickMsg, [
        { text: i18n.cancel, style: 'cancel' },
        {
          text: i18n.nRdUntickConfirm,
          style: 'destructive',
          onPress: () => {
            doToggle(row);
            /*
              ── và bản GHI phải nghe thấy ──

              Chỉ khi buổi tập đã CHỨNG MINH hàng ấy. Bỏ tích một hàng chỉ mới
              tích trong máy thì không có gì ngoài kia để gỡ — và gọi lệnh xoá
              cho nó sẽ cắt nhầm một set của bài trùng tên mà buổi tập đang
              giữ thật.

              Không có chuyện này thì ô vuông nói "chưa làm" trong khi
              `workout_sessions` vẫn giữ set ấy, và khối lượng, ACWR lẫn kỷ
              lục vẫn đọc nó — hai câu trái nhau trên cùng một màn.
            */
            const sessionId = sessions[0]?.id;
            if (!proven[row.key] || !sessionId) return;
            if (offlineNow()) {
              toast.error(i18n.nRdAppendOffline);
              return;
            }
            cutSet.mutate(
              { sessionId, exerciseName: row.exerciseName, date: dateStr },
              {
                onSuccess: (snapshot) => {
                  /* Cửa sổ hoàn tác là `ACTION_HIDE_MS` của chính app — 8
                     giây, trong khoảng 4–10 Material đặt cho thanh có nút, và
                     KHÔNG tự tắt khi trình đọc màn hình đang bật. Không chọn
                     một con số thứ hai cho cùng một câu hỏi. */
                  toast.undo(i18n.nRdSetRemoved, i18n.nUndo, () => {
                    restore.mutate({ row: snapshot as Record<string, unknown>, date: dateStr });
                  });
                },
                onError: (e: Error) => toast.fail(e),
              },
            );
          },
        },
      ]);
    },
    [cutSet, dateStr, doToggle, i18n, proven, restore, rowReady, sessions, shown],
  );

  const bumpRest = (row: SetRow, by: number) => {
    Haptics.selectionAsync();
    setRest((prev) => ({
      ...prev,
      [row.key]: Math.max(0, Math.min(REST_MAX, (prev[row.key] ?? row.plannedRest) + by)),
    }));
  };

  const doneRows = rows.filter((r) => shown[r.key]);
  const pendingRows = doneRows.filter((r) => !proven[r.key]);
  /*
    ── một bài phát sinh chỉ được ghi khi nó ĐỦ ──

    Thẻ thêm vào sinh ra rỗng: chưa có tên, chưa có rep. Ghi một hàng như thế
    là ghi một set tên "Exercise" với 0 rep vào buổi tập — một dòng rác trong
    chính cái bảng mà khối lượng, ACWR và mọi kỷ lục đọc từ đó.

    Nên "đủ" ở đây là hai thứ người dùng phải tự cấp: TÊN và SỐ REP (hoặc số
    giây, với bài giữ tư thế — `performed` đã trả `durationSec` cho đúng ca ấy,
    và một plank 45 giây không có rep nào).

    Thiếu thì nút KHÔNG sống: nó ở nguyên trạng thái "đã ghi", đúng như chủ dự
    án yêu cầu — một nút bấm được rồi không làm gì là tệ hơn một nút tắt.
  */
  const pendingReady = pendingRows.length > 0 && pendingRows.every(rowReady);
  /*
    One save per visit to this day. `isSuccess` never goes back to false on its
    own, and this panel is remounted whenever the selected day changes, so the
    lifetime of the guard is exactly the lifetime of the workout being logged.
  */
  /*
    Already recorded counts, whoever recorded it.

    Two-a-day training exists and this rules it out from here; the free-form
    log sheet still takes a second session without argument. That is the right
    way round — the common mistake is logging the same workout twice by coming
    back to a day that already has it, and the rare case has somewhere to go.
  */
  /*
    `queue.isPending` counts as recorded, and that is not a shortcut.

    A paused write stays pending until there is signal, which can be hours. From
    where the person is standing the workout *is* logged — it is in durable
    storage and the toast said so — and a button that stayed live for those
    hours is a button that writes the session a second time when it lands.
  */
  const logged = sessions.length > 0 || log.isSuccess || queue.isPending || queue.isSuccess;
  /*
    A session is something that happened.

    `finish` writes `date_time` at local noon of the day being looked at, which
    is right for yesterday and is a fabrication for next Thursday. It was
    unreachable while the week strip could only show the week you are in — the
    furthest ahead you could get was Sunday — and it stopped being unreachable
    the moment Plan grew arrows: four weeks forward is a session dated a month
    out, sitting in `workout_sessions` as a real row.

    Nothing would have errored. Readiness, ACWR and the training-load windows
    all read that table by date, so the damage is a load figure that includes
    work nobody has done yet, on a screen that gives no hint where it came
    from.

    Ticking stays live on a future day — reading Thursday's plan and marking off
    what you intend to do is the panel working — it is only the write that
    waits until the day arrives.
  */
  const future = dateStr > localDateStr();
  /*
    ── ghi MỚI, hay ghi THÊM ──

    Trước đây tấm chỉ biết một việc: chưa ghi thì ghi, ghi rồi thì tắt. Nay có
    hai, và chúng loại trừ nhau: ngày chưa có buổi thì nút ghi cả buổi; ngày đã
    có buổi mà xuất hiện hàng chưa được chứng minh — tức bài phát sinh vừa thêm
    — thì nút NỐI chúng vào chính buổi ấy.

    Luật chặn ghi trùng không hề nới ra: mở lại một ngày đã ghi mà không thêm gì
    thì `pendingRows` rỗng và nút vẫn tắt, đúng như cũ.
  */
  const appending = logged && pendingReady && !future;
  const canFinish = appending
    ? !append.isPending
    : doneRows.length > 0 && !log.isPending && !logged && !future;
  /* What was lifted, not what was written down for you to lift. */
  const volume = doneRows.reduce((s, r) => {
    const p = performed(r);
    return s + p.weight * p.reps;
  }, 0);

  /**
   * Một bài đã xong thì THU LẠI.
   *
   * ── vì sao ──
   *
   * Tấm này chỉ có một hình dạng: hình của việc ĐANG TẬP. Mỗi bài mở sẵn với
   * đủ ô nhập tạ, ô nhập reps, ô tick, hai chip và một hàng "thêm hiệp". Đó
   * đúng thứ bạn cần khi đang giữa buổi.
   *
   * Khi buổi đã xong thì không còn việc gì để làm với chúng, mà chúng vẫn
   * chiếm chỗ y hệt: ảnh chủ dự án gửi có bốn thẻ, hai mươi ô nhập và sáu ô
   * tick, tất cả đã tick, trải dài hơn hai màn hình. Thứ người ta mở lên để
   * xem — hôm ấy đã tập gì — phải cuộn mới đọc hết.
   *
   * Nên mặc định theo TRẠNG THÁI chứ không theo một cú bấm: chưa xong thì mở,
   * xong thì thu. `opened[key]` chỉ ghi đè khi có người tự bấm, và khi ấy nó
   * thắng — kể cả mở lại một bài đã xong để sửa một con số.
   *
   * Chú ý một điều KHÔNG làm: ô nhập vẫn nằm trong cây (xem `Expander` — thân
   * bị cắt bởi một hộp cao 0 chứ không bị gỡ), nên chữ đang gõ dở không mất khi
   * thẻ thu lại, và mọi giá trị vẫn sửa được sau khi mở ra. Yêu cầu là "gọn",
   * không phải "bớt tính năng".
   */
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  /* Khoá theo hàng ĐẦU, y như `key` của React ở chỗ vẽ — tên bài đổi theo từng
     ký tự khi người ta đang gõ tên một bài phát sinh, và một khoá chứa tên thì
     trạng thái thu/mở nhảy mất sau mỗi chữ cái. */
  const blockKey = (b: { rows: SetRow[] }) => b.rows[0].key;
  const blockDone = (b: { rows: SetRow[] }) => b.rows.every((r) => shown[r.key]);
  /* CHƯA xong thì luôn mở, bấm gì cũng thế. Cho thu một bài dở nghe tiện hơn
     cho tới khi hỏi dòng tóm tắt sẽ viết gì: nó không có một bộ số nào để nói,
     và một hàng mang dấu tick xanh cho ba hiệp còn trống là một lời nói dối.
     Thu lại là việc của thứ đã XONG, đúng như yêu cầu đặt ra. */
  const blockOpen = (b: { rows: SetRow[] }) => !blockDone(b) || (opened[blockKey(b)] ?? false);
  const toggleBlock = (b: { rows: SetRow[] }) => {
    Haptics.selectionAsync();
    setOpened((prev) => ({ ...prev, [blockKey(b)]: !blockOpen(b) }));
  };

  /**
   * Bài ấy hoá ra đã thành cái gì — dòng thay cho cả thẻ khi nó thu lại.
   *
   * Nó nói việc ĐÃ LÀM, không nói kế hoạch. Tấm này vốn phân vai rõ: dòng
   * tiêu đề là thứ được giao, các hàng dưới là thứ đã xảy ra, và hai bên im
   * lặng khi chúng khớp nhau. Thu thẻ lại thì các hàng biến mất, nên dòng tiêu
   * đề phải gánh nốt vế kia — nếu nó vẫn đọc kế hoạch thì ảnh chủ dự án gửi sẽ
   * tóm tắt Bench Press thành "7,5 kg" trong khi ba hiệp đều ghi 10 kg.
   *
   * Hai hình dạng, và ranh giới giữa chúng là một phép đo chứ không phải một
   * lựa chọn: các hiệp GIỐNG nhau thì một dòng "3 × 8 · 10 kg" là đủ và đúng;
   * khác nhau thì không có một bộ số nào đại diện được, nên nó lùi về thứ vẫn
   * đúng — số hiệp và tổng tạ. Một hiệp tính bằng THỜI GIAN cũng rơi vào nhánh
   * sau, vì "× 0" là một lời nói dối gọn gàng.
   */
  const blockSummary = (b: { rows: SetRow[] }) => {
    /* `performed`, không phải `row.weight`: cái sau là thứ kế hoạch GIAO. Xem
       `set-summary.ts` — quyết định nằm ở đó và được chạy thật trong
       `tools/plan-collapse.mjs`; ở đây chỉ còn đơn vị và chữ. */
    const s = summarizeSets(b.rows.filter((r) => shown[r.key]).map(performed));
    if (!s) return '';
    if (s.kind === 'uniform') {
      const load = s.weightKg > 0
        ? `${Math.round(displayWeight(s.weightKg, wUnit) * 10) / 10} ${wl}`
        : i18n.nRdBodyweight;
      /* Cùng lối với đơn thuốc ở tiêu đề: nhãn ở con số đuôi. */
      return `${s.sets} × ${s.reps} ${i18n.nReps}  ·  ${load}`;
    }
    const sets = i18n.nRdSetsN.replace('{n}', String(s.sets));
    return s.volumeKg > 0
      ? `${sets}  ·  ${Math.round(displayWeight(s.volumeKg, wUnit)).toLocaleString()} ${wl}`
      : sets;
  };

  const finish = () => {
    if (!canFinish) return;

    /*
      ── nhánh NỐI THÊM ──

      Chỉ gửi `pendingRows`, không gửi `doneRows`: buổi cũ đã giữ phần của nó,
      và gửi lại cả nắm là nhân đôi mọi set đã ghi — đúng cái lỗi mà luật chặn
      ghi trùng sinh ra để tránh, chỉ là ở trong một hàng thay vì hai.

      Offline thì KHÔNG đi đường này. Hàng đợi bền chỉ biết CHÈN một buổi mới,
      và một lệnh nối cần đọc hàng hiện tại trước khi ghi — thứ không làm được
      khi không có sóng. Nên khi mất mạng, nút nối tắt và người dùng vẫn còn sổ
      ghi tự do; hứa một lệnh nối rồi phát lại thành một buổi thứ hai thì tệ
      hơn hẳn là nói thẳng bây giờ chưa nối được.
    */
    if (appending) {
      /* Chú thích trên nói đường này không chạy khi mất mạng — và câu ấy phải
         được THỰC THI chứ không chỉ được viết. Không có dòng này thì lệnh nối
         bị React Query treo ở trạng thái chờ vô hạn, đúng cái lỗi mà
         `log-biometrics.tsx` đã ghi lại: "A paused mutation never calls
         `onSuccess`", nên nút quay lại như chưa bấm và không ai biết vì sao. */
      if (offlineNow()) {
        toast.error(i18n.nRdAppendOffline);
        return;
      }
      const sessionId = sessions[0]?.id;
      if (!sessionId) return;
      const extra = pendingRows.map((r) => ({
        /* Danh tính đi cùng buổi tập, không chỉ cái tên.
           `?? ''` vì `LoggedSet.exerciseId` là `string` bắt buộc ở tầng lưu —
           chuỗi rỗng đã là cách nó nói "không biết" từ trước, và 100% các dòng
           màn này từng ghi đều mang đúng giá trị ấy. Cái đổi là nay nó chỉ rỗng
           khi THẬT SỰ không có gì để ghi. */
        exerciseId: r.exerciseId ?? '',
        exerciseName: r.exerciseName,
        ...performed(r),
        rpe: rpe[r.key] ?? r.plannedRpe,
      }));
      append.mutate(
        {
          sessionId,
          sets: extra,
          sessionRpe: Math.max(...extra.map((x) => x.rpe)),
          date: dateStr,
        },
        {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (storeKey) AsyncStorage.removeItem(storeKey).catch(() => {});
            toast.success(i18n.nRdAppended);
          },
          onError: (e: Error) => toast.fail(e),
        },
      );
      return;
    }

    const sets = doneRows.map((r) => ({
      /* Cùng lý do với nhánh nối thêm ở trên. */
      exerciseId: r.exerciseId ?? '',
      exerciseName: r.exerciseName,
      ...performed(r),
      rpe: rpe[r.key] ?? r.plannedRpe,
    }));
    // A session is remembered by its hardest part, and every set that happened
    // has a number of its own now, so this is read rather than asked for a
    // second time. Read once here because both paths below need it.
    const sessionRpe = Math.max(...sets.map((s) => s.rpe));

    if (offlineNow() && user) {
      /*
        The same session, down the durable pipe.

        `dateTime` follows the rule `useLogWorkoutSession` states for the online
        path: the day being *looked at*, stamped at local noon when that is not
        today. Midnight is the boundary this app has been bitten by twice; noon
        is the furthest point from it in both directions, so no offset or DST
        hour can push the session into a neighbouring day on the device that
        eventually replays it. For today it is the actual moment, because that
        is known and is what the online insert would have recorded.

        No record is claimed, exactly as on the sheet's offline path: a personal
        record is a comparison against history, and there is no history to read
        without a connection. Inventing one would be the app celebrating
        something it cannot know.
      */
      const today = localDateStr();
      queue.mutate({
        kind: 'workout',
        userId: user.id,
        rowId: Crypto.randomUUID(),
        dateTime:
          dateStr === today ? new Date().toISOString() : new Date(`${dateStr}T12:00:00`).toISOString(),
        /* The same shape the online insert writes, so a session that arrives
           through the queue is indistinguishable from one that did not — the
           week's day panel reads `sets` back to work out which planned rows a
           session accounts for (`lib/day-progress.ts`). */
        /*
          No warm-up flag here, and that is a decision rather than an omission.

          A planned row IS work: the template says three sets of five at a
          hundred, and those three are the session. A warm-up is the ramp you do
          before the plan starts, which is why it belongs on the free-form sheet
          where you write down what you actually did — `log-workout.tsx` has the
          toggle. Absent means working set, so every row from here is counted,
          which is correct.

          It would also cost another control on every row of this panel, and
          the row is fuller than it was: the tick, the load, the reps, the rest
          chip and the effort chip is already five. The note beside the effort
          chips below is the standing argument — nine controls per set on a
          six-set workout is fifty-four, "all the same shape and none of them
          the one you want" — and the two boxes earned their place by being the
          record itself rather than a setting on it.
        */
        sets: sets.map((s, i) => ({
          exerciseId: s.exerciseId,
          exerciseName: s.exerciseName.trim() || 'Exercise',
          setIndex: i + 1,
          weight: Math.round(s.weight * 100) / 100,
          reps: s.reps,
          rpe: s.rpe >= 1 && s.rpe <= 10 ? s.rpe : null,
          /* Carried, not dropped. A plank entered as `45s` has no reps to
             record, and a queued session that lost the hold would replay as an
             empty set — `exercise-kind.ts` reads `durationSec` to know the
             movement is timed at all. */
          ...(s.durationSec ? { durationSec: s.durationSec } : {}),
        })),
        volumeLoad: Math.round(sets.reduce((sum, s) => sum + s.weight * s.reps, 0)),
        templateId: template?.id ?? null,
        templateName: template?.name?.trim() || 'Workout',
        sessionRpe,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      /* Cleared after the intention is queued, never before: the resume point
         is the only other copy of these sets until the write is in the cache. */
      if (storeKey) AsyncStorage.removeItem(storeKey).catch(() => {});
      toast.success(i18n.logMealQueued);
      return;
    }

    log.mutate(
      {
        templateName: template?.name ?? '',
        sessionRpe,
        sets,
        // The day being looked at, not the day it is — you can tick Monday's
        // last set on Tuesday morning and it still belongs to Monday.
        date: dateStr,
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (storeKey) AsyncStorage.removeItem(storeKey).catch(() => {});
          toast.success(i18n.nRdSaved);
        },
        onError: (e: Error) => toast.fail(e),
      },
    );
  };

  if (!template) {
    return (
      <GlassCard style={styles.empty}>
        <Icon icon={Moon} size={22} color={c.mutedForeground} />
        <Text style={styles.emptyText}>{isRest ? i18n.nRoutineRestDay : i18n.nRdEmptyPlan}</Text>
        <Text style={styles.emptyHint}>{i18n.nRoutineRestHint}</Text>
        <PressScale
          accessibilityRole="button"
          onPress={onEdit}
          style={styles.emptyBtn}>
          <Icon icon={Pencil} size={13} color={c.foreground} />
          <Text style={styles.emptyBtnText}>{i18n.nChooseWorkout}</Text>
        </PressScale>
      </GlassCard>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.tplName} numberOfLines={1}>{template.name}</Text>
          <Text style={styles.progress}>
            {i18n.nRdProgress
              .replace('{done}', String(doneRows.length))
              .replace('{total}', String(rows.length))}
            {volume > 0 ? `  ·  ${Math.round(displayWeight(volume, wUnit)).toLocaleString()} ${wl}` : ''}
          </Text>
        </View>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.nChooseWorkout}
          hitSlop={12}
          onPress={onEdit}
          style={styles.editBtn}>
          <Icon icon={Pencil} size={14} color={c.mutedForeground} />
        </PressScale>
      </View>

      {/*
        Buổi đã ghi: MỘT DÒNG, không phải một thẻ.

        ── cái gì được gộp, và vì sao ──

        Nó từng là một `GlassCard` in tên template làm tiêu đề — ngay dưới một
        tiêu đề đã in đúng cái tên ấy. Ảnh chủ dự án gửi có "Tập Ngực" hai lần,
        cách nhau ba dòng, cái thứ hai trong một thẻ lồng vào tấm. Tên chỉ được
        in khi nó KHÁC tên ở trên: buổi ghi cho ngày này có thể là một template
        khác, và lúc ấy cái tên là thông tin thật chứ không phải tiếng vọng.

        ── và vì sao cái nhãn "Đã ghi" phải có ──

        Dòng này mang một số kg, và dòng tiêu đề ngay trên cũng mang một số kg.
        Trong ảnh ấy là 720 và 220 — hai con số khác nhau, cùng đơn vị, không
        cái nào nói mình là cái gì. Chúng KHÔNG mâu thuẫn: một cái là tổng của
        những hiệp đang tick trên màn, cái kia là thứ đã được ghi vào lúc 18:36.
        Nhưng không đọc ra được điều đó, nên lời giải không phải bỏ đi một cái —
        mỗi cái có việc của nó — mà là để mỗi cái tự xưng tên. "6/6 set" gọi tên
        cái thứ nhất; "Đã ghi lúc 18:36" gọi tên cái thứ hai.
      */}
      {sessions.map((sn) => {
        const at = new Date(sn.date_time);
        const otherName = sn.template_name && sn.template_name !== template.name
          ? sn.template_name
          : null;
        return (
          <View key={sn.id} style={styles.loggedLine}>
            <Icon icon={Check} size={14} color={c.readinessGreen} strokeWidth={2.5} />
            <Text style={styles.loggedMeta} numberOfLines={1}>
              {otherName ? `${otherName}  ·  ` : ''}
              {i18n.nRdLoggedAt.replace(
                '{t}',
                `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`,
              )}
              {sn.volume_load
                ? `  ·  ${Math.round(displayWeight(Number(sn.volume_load), wUnit)).toLocaleString()} ${wl}`
                : ''}
              {sn.session_rpe ? `  ·  RPE ${sn.session_rpe}` : ''}
            </Text>
          </View>
        );
      })}

      {/* A bar rather than a percentage: what you want mid-workout is "how much
          is left", which is a length, not a number to read.

          Và nó đi khi không còn gì còn lại. Chú thích ngay trên là lý do: câu
          hỏi nó trả lời chỉ tồn tại GIỮA buổi. Đầy kín thì nó không nói thêm gì
          so với "6/6 set" ba mươi điểm phía trên — mà nó lại hét: đo trên giấy,
          ruột thanh là `primary` #1a1917, tức 17,57:1 so với mặt thẻ, chạy hết
          bề ngang. Đó là vệt đậm nhất màn hình, đậm hơn cả tiêu đề, và trong
          ảnh chủ dự án gửi nó đọc ra như một thanh kẻ đen chắn ngang chứ không
          phải một lời chúc mừng. (Bản tối là #a8afbd — 8,21:1 — nên lần nữa,
          mức độ chỉ nặng ở một diện mạo.) */}
      {doneRows.length < rows.length ? (
        <ProgressBar
          pct={rows.length ? (doneRows.length / rows.length) * 100 : 0}
          height={4}
          radius={2}
          trackColor={m.inset.bg}
          color={c.primary}
          delay={0}
          duration={duration.move}
        />
      ) : null}

      {blocks.map((block) => {
        /* Keyed by the first row, never by the name.

           An added movement's name changes on every keystroke, and a key that
           contains it makes React throw the card away and build a new one for
           each letter — the field loses focus after the first character and
           the keyboard shuts. The row key is stable for the life of the
           movement, which is exactly what a key is supposed to be. */
        const added = block.rows[0].adHoc;
        const done = blockDone(block);
        const expanded = blockOpen(block);
        return (
        <Animated.View key={block.rows[0].key} entering={SWAP}>
          <GlassCard elevation="inset" style={styles.exCard}>
            {/*
              MỘT tiêu đề, cho cả hai trạng thái.

              ── vì sao không phải hai ──

              Bản đầu dựng hai hàng rời và đổi qua lại: một hàng tóm tắt khi
              thu, hàng tiêu đề cũ khi mở. Nó sai về CHUYỂN ĐỘNG. Tiêu đề cũ
              mang theo `ExerciseProgress` bên trong, nên lúc đóng nó bị gỡ
              trong một khung hình trong khi thân thẻ co dần suốt 240ms — thẻ
              giật tụt một đoạn rồi mới đóng. Một cú đóng, hai nhịp.

              Ở đây tiêu đề KHÔNG BAO GIỜ bị gỡ. Nó đứng yên, các ô của nó đổi
              nội dung, và toàn bộ chuyển động nằm ở một chỗ duy nhất là thân
              thẻ — đúng hình dạng của một hàng disclosure trên iOS.

              ── các ô, và ô nào nói gì khi nào ──

              The header states THE PLAN: what you came here to do — nhưng chỉ
              khi thẻ đang MỞ, vì lúc ấy các hàng bên dưới nói vế còn lại. Tấm
              này vốn phân vai như vậy: dòng này là thứ được giao, các hàng là
              thứ đã xảy ra, và hai bên im lặng khi chúng khớp. Thu thẻ lại thì
              các hàng biến mất, nên chính ô ấy phải gánh nốt vế kia và đổi sang
              nói KẾT QUẢ. Nếu không, ảnh chủ dự án gửi sẽ tóm tắt Bench Press
              thành "7,5 kg" trong khi ba hiệp đều ghi 10 kg.

              Nút xoá của một bài phát sinh chỉ có khi mở: thu lại là chế độ
              ĐỌC. Ô nhập tên thì ở lại — nó là ô duy nhất chứa dữ liệu người
              dùng gõ, và gỡ nó đi để "gọn" là đổi gọn lấy mất.
            */}
            <View style={[styles.exHead, !expanded && styles.exHeadShut]}>
              <View style={styles.exTitleRow}>
                {/* Hàng này căn theo BASELINE để tên và đơn thuốc thẳng chân
                    chữ; một dấu tick không có chân chữ, nên nó tự căn giữa. */}
                {done ? (
                  <View style={styles.exTick}>
                    <Icon icon={Check} size={14} color={c.readinessGreen} strokeWidth={2.5} />
                  </View>
                ) : null}
                {added ? (
                  /* An added movement has no plan to state, so the header holds
                     the one thing only you can supply — its name — and the way
                     back out if you tapped the button by accident. */
                  <TextInput
                    accessibilityLabel={i18n.nRdExtraName}
                    style={[styles.exName, styles.exNameInput]}
                    placeholder={i18n.nRdExtraName}
                    placeholderTextColor={alpha(m.ink, 0.3)}
                    value={block.name}
                    autoCapitalize="words"
                    onChangeText={(v) => renameExtra(added, v)}
                  />
                ) : (
                  /*
                    ── LỐI VÀO HƯỚNG DẪN: chính cái TÊN ──

                    Không thêm một nút nào. Đặt hàng nói rõ *"Do not add multiple
                    redundant Guide buttons"*, và thẻ này đã có hai lối chạm rồi:
                    cụm kết quả + mũi tên (thu/mở thẻ) và hàng "Lần trước" (sang
                    tiến bộ của bài). Một nút thứ ba là ba thứ để chọn giữa lúc
                    đang thở dốc.

                    Nên lối vào là thứ vốn đã ở đó và vốn đã đúng nghĩa: cái tên
                    bài tập. Chạm vào tên một vật để biết về vật ấy là cử chỉ
                    không phải học.

                    Cái glyph `Info` 13 điểm phía sau là thứ DUY NHẤT thêm vào,
                    và nó phải có: một dòng chữ trơn không nói được rằng nó bấm
                    được. Nó nằm TRONG cùng một `PressScale` với cái tên, nên
                    vẫn là một control chứ không phải hai.

                    Bài THÊM TAY không có lối này: nhánh trên vẽ một `TextInput`
                    vì tên là thứ người dùng đang gõ, và một cái tên chưa có
                    trong thư viện thì không có hướng dẫn nào để mở.

                    `block.rows[0].exerciseId` — khoá CHÍNH TẮC, lấy từ hàng đầu
                    của khối. Mọi hàng trong một khối đến từ cùng một mục của
                    template nên chúng mang cùng một id. Thiếu id (template cũ)
                    thì truyền `undefined` và để `useExerciseGuide` lùi về tên.
                  */
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel={`${block.name} — ${i18n.nEgOpen}`}
                    hitSlop={{ top: 10, bottom: 10 }}
                    onPress={() => {
                      Haptics.selectionAsync();
                      nav.push({
                        pathname: '/exercise-guide',
                        params: { ex: block.rows[0].exerciseId ?? '', name: block.name },
                      });
                    }}
                    style={styles.exNameBtn}>
                    <Text style={styles.exName} numberOfLines={1}>{block.name}</Text>
                    <Icon icon={Info} size={13} color={c.mutedForeground} />
                  </PressScale>
                )}
                {added && expanded ? (
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel={i18n.a11yRemove}
                    hitSlop={12}
                    /* Under a finger's width, so the shallow press is invisible
                       on it — `motion.ts` names the six controls that found
                       this out separately before there was a token for it. */
                    to={press.deep}
                    onPress={() => removeExtra(added)}
                    style={styles.exRemove}>
                    <Icon icon={X} size={14} color={c.mutedForeground} />
                  </PressScale>
                ) : null}

                {/* Kế hoạch chỉ nói khi thẻ đang MỞ. Lúc thu, ô bên phải đã do
                    kết quả chiếm, và in cả hai thì hàng mang hai con số tạ khác
                    nhau cho cùng một bài — "7,5" đã giao và "10" đã nâng. */}
                {!added && expanded ? (
                  <Text style={styles.exPrescription} numberOfLines={1}>
                    {/* "3 × 10 reps", không phải "3 × 10". Gắn nhãn cho con số
                        ĐUÔI là đủ: khi đuôi đã nói "reps" thì "3 ×" ở đầu chỉ
                        còn một nghĩa — ba lượt mười cái. Rẻ hơn một chữ so với
                        gắn nhãn cả hai, và hết mơ hồ như nhau. */}
                    {block.rows.length} × {block.rows[0].reps} {i18n.nReps}
                    {'  ·  '}
                    {block.rows[0].weight > 0
                      ? `${Math.round(displayWeight(block.rows[0].weight, wUnit) * 10) / 10} ${wl}`
                      : i18n.nRdBodyweight}
                  </Text>
                ) : null}

                {/*
                  Kết quả + mũi tên là MỘT cái nút, không phải chữ cạnh một nút.

                  Mũi tên một mình rộng 24 điểm; cả cụm thì rộng bằng dòng chữ
                  cộng nó, nên ngón tay có chỗ đặt mà không phải nhắm. Cả HÀNG
                  thì không được: hàng ấy chứa ô nhập tên của bài phát sinh, và
                  một vùng bấm trùm lên một ô nhập là hai ý nghĩa cho một cú
                  chạm.
                */}
                {done ? (
                  <PressScale
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${block.name || i18n.nRdExtraName}  ${blockSummary(block)}`}
                    hitSlop={{ top: 10, bottom: 10, right: 8 }}
                    onPress={() => toggleBlock(block)}
                    style={styles.exFold}>
                    {!expanded ? (
                      <Text style={styles.exDoneMeta} numberOfLines={1}>
                        {blockSummary(block)}
                      </Text>
                    ) : null}
                    <Chevron open={expanded} color={c.mutedForeground} />
                  </PressScale>
                ) : null}
              </View>
            </View>

            {/*
              Thân thẻ mở và đóng bằng CHIỀU CAO THẬT, không phải bằng mount.

              `Expander` giữ thân nằm trong cây, bị cắt bởi một hộp cao 0 —
              chính vì thế mọi ô nhập giữ nguyên chữ đang gõ dở khi thẻ thu lại,
              và thứ sửa được trước khi thu vẫn sửa được sau khi mở. Đây là chỗ
              "gọn" không được đổi thành "mất tính năng".

              Và chiều cao là thứ KÉO THEO hàng xóm: thẻ bên dưới đi lên đúng
              bằng lượng thẻ này co lại, từng khung hình — `today-meals.tsx` đã
              đo cái thay thế và ghi lại rằng một `LinearTransition` để lại một
              lỗ 94px vì nó chỉ động cái view nó đứng trên.

              `reveal="clip"` chứ không phải `"fade"`: một `opacity` đặt trên
              view NHIỀU CON buộc iOS gộp cả nhóm ra một bề mặt riêng mỗi khung
              hình, và nhóm ở đây là hai mươi ô nhập chứ không phải vài cái chấm.
            */}
            <Expander open={expanded} reveal="clip">
            {/* Gợi ý "lần trước bao nhiêu" nằm TRONG phần co được, không ở tiêu
                đề. Nó là thứ đọc TRƯỚC khi làm một hiệp; thẻ đã thu nghĩa là
                bài ấy xong rồi, và lúc đó nó chỉ còn là một dòng chữ nữa. */}
            <View style={styles.exSub}>
              <ExerciseProgress
                insight={insightFor(block.name)}
                last={lastFor(block.name)}
                name={block.name}
                u={wUnit}
                i18n={i18n}
              />
            </View>
            {block.rows.map((row, ri) => {
              const isDone = !!shown[row.key];
              const effort = rpe[row.key] ?? row.plannedRpe;
              const secs = restOf(row);
              const open = editing === row.key;
              /* Lit only when it stopped agreeing with the plan — the same rule
                 the two chips below follow, so one glance down the card finds
                 every set that went differently. */
              const loadOn = loadOf(row) !== plannedLoad(row);
              const repsOn = repsOf(row) !== plannedReps(row);
              return (
                <View key={row.key}>
                  {ri > 0 ? <View style={styles.hair} /> : null}
                  <View style={[styles.setBlock, isDone && styles.setCardDone]}>
              <View style={styles.setRow}>
                {/*
                  The tick.

                  It was a 26pt box outlined in `colors.border` — #2b2b31 on a
                  #0e0e11 card, which is a 1.3:1 edge. It was there and it could
                  not be seen, which is the same as not being there: the first
                  report on this screen was that there was no way to complete a
                  set. A control has to look like one before it can be one.
                */}
                <PressScale
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isDone }}
                  accessibilityLabel={`${row.exerciseName} ${i18n.nRdSet.replace('{n}', String(row.ordinal))}`}
                  hitSlop={12}
                  onPress={() => toggle(row)}
                  /* Mờ đi khi chưa đủ: "không bấm được" phải NHÌN THẤY được
                     trước khi người ta bấm, chứ không chỉ được nói sau đó. */
                  style={[
                    styles.check,
                    isDone && styles.checkOn,
                    row.adHoc && !isDone && !rowReady(row) && styles.checkNotReady,
                  ]}>
                  {/*
                    Ô CHƯA tick thì không vẽ dấu tick.

                    Bản trước vẽ nó ở `alpha(m.ink, 0.22)` — 1,60:1, một vết
                    nhoè. Và vấn đề nặng hơn khả năng đọc: một dấu tick mờ
                    trong một ô chưa tick đọc ra là "tick một nửa". Ảnh chủ dự
                    án gửi có ba ô như thế nằm cạnh hai ô đã tick đặc, và ba ô
                    kia trông như đang ở một trạng thái thứ ba không tồn tại.

                    Tô đậm lên là sai hướng — càng giống ô ĐÃ tick. Trạng thái
                    chưa tick vốn đã có hình của nó: cái ô rỗng cùng đường
                    viền. Thêm một glyph vào đó là nói hai lần và nói ngược.
                  */}
                  {isDone ? <Icon icon={Check} size={16} color={c.primaryForeground} strokeWidth={3} /> : null}
                </PressScale>

                {/*
                  What this set actually was — editable, here, on the row.

                  ── why the numbers came back after being removed ──

                  They were taken off these rows a version ago as repetition:
                  "55 kg × 10" three times under a header that could say it
                  once. That was right while they were a READOUT of the plan.
                  It stops being right the moment they are the place you record
                  what you did, because then they are not three copies of one
                  fact — they are three separate facts that happen to agree
                  today.

                  The header still states the plan. These start prefilled from
                  it and stay quiet while they match, so a workout that went
                  exactly as written still reads as one line of grey per set.

                  ── the ordinal shrank to a numeral ──

                  "Set 1 / 3" spent forty points saying what the header's
                  "3 ×" and the row's own position already say. The label is
                  intact for VoiceOver, where position is not available.

                  ── selectTextOnFocus ──

                  Tap the 55 and type 60: the prefill is selected, so the
                  common edit is a tap and two digits rather than a tap, four
                  backspaces and two digits. The whole complaint that started
                  this was step count.
                */}
                <View style={styles.setText}>
                  <Text style={[styles.setNo, isDone && styles.setNoDone]}>{row.ordinal}</Text>
                  <TextInput
                    accessibilityLabel={`${row.exerciseName} ${i18n.nRdSet.replace('{n}', String(row.ordinal))} ${i18n.nWeight}`}
                    style={[styles.field, styles.fieldLoad, !loadOn && styles.fieldPlan]}
                    placeholder="—"
                    placeholderTextColor={alpha(m.ink, 0.25)}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    selectTextOnFocus
                    value={loadOf(row)}
                    onChangeText={(v) => setWeightText((prev) => ({ ...prev, [row.key]: decText(v) }))}
                  />
                  {/* No unit beside an empty box. A pull-up row read "— kg × 8",
                      which offers a unit for a number that is not there — and the
                      card header already says Bodyweight. It comes back the moment
                      anything is typed, which is when weighted pull-ups need it. */}
                  {loadOf(row) ? (
                    <Text style={[styles.unit, !loadOn && styles.unitPlan]}>{wl}</Text>
                  ) : null}
                  <Text style={styles.times}>×</Text>
                  <TextInput
                    accessibilityLabel={`${row.exerciseName} ${i18n.nRdSet.replace('{n}', String(row.ordinal))} ${i18n.nReps}`}
                    style={[styles.field, styles.fieldReps, !repsOn && styles.fieldPlan]}
                    placeholder="—"
                    placeholderTextColor={alpha(m.ink, 0.25)}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    selectTextOnFocus
                    value={repsOf(row)}
                    onChangeText={(v) => setRepsText((prev) => ({ ...prev, [row.key]: intText(v) }))}
                  />
                  {/*
                    Con số sau dấu × cũng phải nói nó là gì.

                    Chủ dự án khoanh đúng cột này: "dãy số này là gì phải ghi
                    rõ". Hàng đọc ra "25 kg × 10" — vế trái có đơn vị, vế phải
                    không có gì, và hai con số trông giống hệt nhau.

                    Nhãn KHÔNG phải chữ mới: `i18n.nReps` đã tồn tại ở cả hai
                    ngôn ngữ và đã là thứ VoiceOver đọc cho chính ô này ở dòng
                    `accessibilityLabel` ngay trên. Tức người dùng trình đọc màn
                    hình vẫn luôn nghe "reps"; chỉ người nhìn bằng mắt là không
                    được cho biết. Dùng lại đúng cái tên ấy thì hai bên nghe và
                    thấy cùng một từ, và không có bản thứ hai để lệch.

                    ── vì sao nó CÓ ĐIỀU KIỆN ──

                    Ô này giữ HAI thứ khác nhau (`lib/rep-entry.ts`): một số
                    lần, hoặc một lần giữ tính bằng giây khi gõ "60s". Bản thứ
                    hai đã tự mang đơn vị trong chính chữ của nó, nên dán thêm
                    "reps" vào sẽ ra "60s reps". Và ô trống thì không có gì để
                    đặt đơn vị lên — đúng cùng một lý lẽ đã ghi vài dòng trên
                    cho `kg`: "No unit beside an empty box."
                  */}
                  {parseRepEntry(repsOf(row)).reps > 0 ? (
                    <Text style={styles.unit}>{i18n.nReps}</Text>
                  ) : null}
                </View>

                {/*
                  Two chips, collapsed to their values and opened by tapping.

                  Five effort chips and a rest stepper on every row is nine
                  controls per set — on a six-set workout that is fifty-four,
                  all the same shape and none of them the one you want. The
                  value you already have is the answer nine times out of ten.
                */}
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`${i18n.nWbRest} ${restLabel(secs)}`}
                  hitSlop={12}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEditing(open ? null : row.key);
                  }}
                  style={[
                    styles.chip,
                    /*
                      Quiet while it still says what the plan said.

                      Three sets of the same movement showed the same "2:00" and
                      the same "RPE 8", three times, at full contrast — the row
                      spending its emphasis on the part that never changes. Now
                      the default is a plain value and a CHANGED one is a chip,
                      so the eye catches the set you adjusted rather than the two
                      you did not. The tap target is identical either way; this
                      is contrast, not affordance.
                    */
                    secs === row.plannedRest ? styles.chipDefault : null,
                    open && styles.chipOpen,
                  ]}>
                  {/* Một màu cho cả hai nhánh: nhánh "chưa đổi" từng là
                      `alpha(m.ink, 0.30)` — 1,94:1, dưới cả sàn 3,0 của một
                      vật thể đồ hoạ. Cái phân biệt đã-đổi với chưa-đổi là CHIP
                      (nền + viền), không phải icon; xem chú thích ở
                      `chipTextDefault`. */}
                  <Icon icon={Timer} size={11} color={c.mutedForeground} />
                  <Text style={[styles.chipText, secs === row.plannedRest && styles.chipTextDefault]}>
                    {restLabel(secs)}
                  </Text>
                </PressScale>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`${i18n.nWbEffort} ${effort}`}
                  hitSlop={12}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEditing(open ? null : row.key);
                  }}
                  style={[
                    styles.chip,
                    effort === row.plannedRpe ? styles.chipDefault : null,
                    open && styles.chipOpen,
                    effort !== row.plannedRpe && EFFORT_TINT[effort]
                      ? { borderColor: alpha(c[EFFORT_TINT[effort]], 0.4) }
                      : null,
                  ]}>
                  <Text
                    style={[
                      styles.chipText,
                      effort === row.plannedRpe
                        ? styles.chipTextDefault
                        : { color: tintFor(c, effort) },
                    ]}>
                    RPE {effort}
                  </Text>
                </PressScale>
              </View>

              {open ? (
                <Retract style={styles.editors}>
                  <View style={styles.editorRow}>
                    <Text style={styles.editorLabel}>{i18n.nWbRest}</Text>
                    <View style={styles.stepper}>
                      <PressScale
                        accessibilityRole="button"
                        accessibilityLabel={`${i18n.nWbRest} −${REST_STEP}`}
                        hitSlop={{ top: 8, bottom: 8 }}
                        onPress={() => bumpRest(row, -REST_STEP)}
                        style={styles.stepBtn}>
                        <Icon icon={Minus} size={14} color={c.foreground} strokeWidth={2.5} />
                      </PressScale>
                      <Text style={styles.stepValue}>{restLabel(secs)}</Text>
                      <PressScale
                        accessibilityRole="button"
                        accessibilityLabel={`${i18n.nWbRest} +${REST_STEP}`}
                        hitSlop={{ top: 8, bottom: 8 }}
                        onPress={() => bumpRest(row, REST_STEP)}
                        style={styles.stepBtn}>
                        <Icon icon={Plus} size={14} color={c.foreground} strokeWidth={2.5} />
                      </PressScale>
                    </View>
                  </View>

                  <View style={styles.editorRow}>
                    <Text style={styles.editorLabel}>{i18n.nWbEffort}</Text>
                    <View style={styles.rpeRow}>
                      {RPE_CHOICES.map((v) => (
                        <PressScale
                          key={v}
                          accessibilityRole="button"
                          accessibilityState={{ selected: v === effort }}
                          hitSlop={{ top: 8, bottom: 8 }}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setRpe((prev) => ({ ...prev, [row.key]: v }));
                            // Choosing is the end of the errand — it closes, the
                            // same way it opened itself, so the list goes back
                            // to being a list.
                            setEditing(null);
                          }}
                          style={[styles.rpeOption, // Unselected still carries its colour, faintly — the
                            // ramp has to be readable *before* you choose, or it
                            // is a label on a decision already made.
                            EFFORT_TINT[v] ? { borderColor: alpha(c[EFFORT_TINT[v]], 0.35) } : null, v === effort && styles.rpeOptionOn, v === effort && EFFORT_TINT[v] ? { backgroundColor: c[EFFORT_TINT[v]], borderColor: c[EFFORT_TINT[v]] } : null]}>
                          <Text
                            style={[
                              styles.rpeOptionText,
                              { color: tintFor(c, v) },
                              v === effort && styles.rpeOptionTextOn,
                            ]}>
                            {v}
                          </Text>
                        </PressScale>
                      ))}
                    </View>
                  </View>
                </Retract>
              ) : null}
                  </View>
                </View>
              );
            })}
            {added ? (
              /* Only on movements you added. A planned exercise says how many
                 sets it is, and a fourth set of it is a change to the plan
                 rather than a note about today — a different decision, made
                 somewhere the plan can actually be edited. */
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={i18n.nRdAddSet}
                hitSlop={8}
                onPress={() => addSet(added)}
                style={styles.addSet}>
                <Icon icon={Plus} size={13} color={c.mutedForeground} strokeWidth={2.5} />
                <Text style={styles.addSetText}>{i18n.nRdAddSet}</Text>
              </PressScale>
            ) : null}
            </Expander>
          </GlassCard>
        </Animated.View>
        );
      })}

      {/*
        The way to record something the plan did not ask for, at the bottom of
        the plan it did.

        Visible rather than tucked behind a menu, and for the reason this screen
        has been corrected on twice already: a control nobody notices is a
        control nobody has. It is outlined rather than filled because it is not
        the action of this screen — finishing is — but it is a full-width row
        with a label, because "I also did some curls" has to be answerable
        without leaving a half-ticked workout.
      */}
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={i18n.nRdAddExercise}
        onPress={addExercise}
        style={styles.addEx}>
        <Icon icon={Plus} size={15} color={c.mutedForeground} strokeWidth={2.5} />
        <Text style={styles.addExText}>{i18n.nRdAddExercise}</Text>
      </PressScale>

      {/*
        Off for good once it has saved.

        `isPending` alone is not enough and the gap it leaves is the expensive
        kind: the mutation settles, the button comes back, and this panel does
        not navigate anywhere — it stays exactly where it was, with every set
        still ticked and a live button under your thumb. A second press writes
        a second session for the same workout, and nothing about that looks
        wrong until the volume for the week is double.

        Adding `isSuccess` closes it, and the button then says what happened
        rather than sitting there greyed: a disabled control with the same
        label as before reads as a failure, not as a finished job.
      */}
      <PressScale
        accessibilityRole="button"
        accessibilityState={{ disabled: !canFinish }}
        disabled={!canFinish}
        onPress={finish}
        style={[
          styles.finish,
          !canFinish && styles.finishOff,
          logged && styles.finishDone,
          /* Nút NỐI THÊM phải đọc ra là một việc KHÁC, không phải "ghi buổi
             tập" lần nữa: bài này không có trong kế hoạch, và người bấm cần
             biết mình đang thêm chứ không đang lặp lại. Nên nó lấy viền và mực
             của `primary` thay vì mảng xanh "đã xong", và mang dấu `Plus` thay
             vì dấu `Check` — một dấu tích ở đây nói sai, vì chưa có gì xong. */
          appending && styles.finishAppend,
        ]}>
        <Icon
          icon={appending ? Plus : Check}
          size={17}
          /* Dấu đi theo chữ ở cả bốn nhánh. Trước đây nhánh TẮT không có ở đây
             — dấu vẫn là `primaryForeground` (trắng) và chỉ mờ đi cùng cả nút,
             nên nó biến mất hẳn. Một dấu tích vô hình trên một nút xám là lý do
             người ta không biết nút ấy làm gì. */
          color={
            appending
              ? c.primary
              : logged
                ? c.readinessGreen
                : canFinish
                  ? c.primaryForeground
                  : c.secondaryForeground
          }
          strokeWidth={2.5}
        />
        {/* A dimmed button with the same words on it is a button that looks
            broken. On a day that has not happened the label says which of the
            three things is true, the same way it already does for one that has
            been logged. */}
        <Text
          style={[
            styles.finishText,
            !canFinish && styles.finishTextOff,
            logged && styles.finishTextDone,
            appending && styles.finishTextAppend,
          ]}>
          {appending
            ? i18n.nRdAppend
            : logged
              ? i18n.nRdAlready
              : future
                ? i18n.nRdFuture
                : i18n.nRdFinish}
        </Text>
      </PressScale>

      {/*
        ── đường ra cho bài PHÁT SINH, và vì sao nó phải hiện ra ở đây ──

        Chú thích của luật một-lần-lưu ngay trên có một câu: "the rare case has
        somewhere to go" — ý là sổ ghi tự do vẫn nhận buổi thứ hai. Câu ấy đúng
        về mã, và SAI về màn hình: sau khi ghi xong, tấm này chỉ đổi nút thành
        "Đã ghi buổi tập" rồi tắt, và không có một chữ nào nói sổ ấy ở đâu.

        Chủ dự án báo đúng hậu quả: tập hết template, hệ thống ghi xong, rồi
        phát sinh thêm một bài — và từ chỗ đang đứng thì app trông như đã đóng
        cửa. Cả màn Plan KHÔNG có một liên kết nào tới `/log-workout`.

        Nên luật một-lần-lưu GIỮ NGUYÊN — nó chặn cái lỗi thường gặp là ghi hai
        lần cùng một buổi khi quay lại một ngày đã có — còn cái được thêm là
        chỗ đi tiếp. Hai việc khác nhau, và trước đây chỉ có việc thứ nhất.
      */}
      {logged && !appending ? (
        <PressScale
          accessibilityRole="button"
          onPress={() => nav.push('/log-workout')}
          style={styles.extraLink}>
          <Text style={styles.extraLinkText}>{i18n.nRdExtra}</Text>
        </PressScale>
      ) : null}

      {/*
        The rest clock is a screen of its own — see `rest-timer`.

        It was a bar pinned above this list, and a bar is the polite version of
        the wrong idea: rest is not a status line, it is the ninety seconds
        where the app has exactly one job. It also could not be pinned, only
        absolutely positioned inside a scroll view, so it left with the content
        whenever the list moved.
      */}
      <RestTimer
        left={resting?.left ?? null}
        total={resting?.total ?? 0}
        next={resting?.next ?? null}
        i18n={i18n}
        onSkip={() => {
          Haptics.selectionAsync();
          setResting(null);
        }}
        onAdjust={(delta) =>
          setResting((s) => {
            if (s === null) return null;
            const left = Math.max(1, Math.min(REST_MAX, s.left + delta));
            // Adding time grows what it is counting from as well, so the ring
            // stays a fraction of something rather than trying to be more than
            // whole. Taking time off leaves the total alone: the rest really
            // was cut short, and the ring showing that is the honest reading.
            return { ...s, left, total: Math.max(s.total, left) };
          })
        }
      />

    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  wrap: { gap: spacing.sm },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { ...type.body, color: c.foreground },
  emptyHint: { ...type.footnote, color: c.mutedForeground },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    backgroundColor: m.inset.bg,
    borderWidth: m.inset.borderWidth,
    borderColor: m.inset.border,
  },
  emptyBtnText: { ...type.footnote, color: c.foreground, fontWeight: '600' },

  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  /*
    Tên buổi tập lên `title` (22), và đó là HỆ QUẢ BẮT BUỘC của việc tên bài tập
    lên 17 — không phải một lượt làm đẹp đi kèm.

    Trước: buổi tập 18 (`title2`), bài tập 13. Một bậc 5 điểm, đọc được.
    Nếu chỉ nâng bài tập lên 17 mà để buổi tập ở 18 thì hai vai cách nhau ĐÚNG
    MỘT ĐIỂM — mắt không đọc ra thứ bậc, nó đọc ra một lỗi.

    22 / 17 / 13 / 11 là bốn bậc đã có sẵn trong thang, mỗi bậc cách nhau đủ để
    thấy. Không token mới nào được tạo.

    Ghi chú cho lượt sau: `dayName` ("Thứ 6") vẫn là `headline` 17, nay bằng tên
    bài tập. Hai thứ ấy không bao giờ đứng cạnh nhau — một cái ở đầu trang, một
    cái trong thẻ — và sửa nó là đụng vào dải ngày, tức việc của Pass 2.

    ── lượt 2: ĐỘ ĐẬM xuống 600, CỠ giữ 22 ──

    Chủ dự án xem bản thật và thấy 22 *"slightly too visually aggressive"*, đề
    nghị thử ~20/600.

    Thang chữ của app KHÔNG CÓ bậc 20. Nó nhảy `title2` 18 → `title` 22, và 18
    thì đụng lại đúng cái va chạm 1 điểm với tên bài tập 17 mà lượt 1 vừa gỡ.
    Tạo một token 20 là tạo một design primitive mới, thứ đặt hàng cấm.

    Nên đo lại xem cái "aggressive" ấy đến từ đâu, và nó không đến từ cỡ: iOS
    Title2 cũng là 22, nhưng ở độ đậm **400**. `type.title` của app là 22/**700**
    — nặng hơn ba bậc so với chính vai nó đang đóng. Ở 22 điểm, 700 thôi là nhấn
    mạnh và thành ồn; cỡ đã nói "đây là tiêu đề" rồi.

    600 là bậc có sẵn trong app (chính `headline` dùng nó), nên tiêu đề buổi tập
    và tên bài tập nay cùng một độ đậm và chỉ khác CỠ — 22 so với 17. Thứ bậc do
    cỡ gánh, đúng cách iOS phân bậc.

    Đây là ghi đè MỘT thuộc tính lên một token có sẵn, không phải một token mới.
    Và nó đi ngược hướng với cái đã gỡ ở `exName`: chỗ kia là bơm đậm một cỡ chữ
    PHỤ để giả làm tiêu đề; chỗ này là hạ đậm một tiêu đề đang gào.
  */
  tplName: { ...type.title, fontWeight: '600', color: c.foreground },
  progress: { ...type.footnote, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  editBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  /* Một dòng, không thụt vào, không có mặt của riêng nó — nó thuộc về khối
     tiêu đề ngay trên chứ không phải một mục thứ hai của trang. */
  loggedLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing.xs },
  loggedMeta: {
    ...type.caption,
    color: c.mutedForeground,
    fontVariant: ['tabular-nums'],
    flex: 1,
    minWidth: 0,
  },

  /* The exercise name is a heading over its sets, not a row of its own — the
     rows below it are the thing, and giving the name a card would make four
     sets of one movement look like five separate items. */
  /* One card per movement, its sets as rows inside — the inset grouped shape
     Apple describes, where a continuous background does the grouping that four
     separate boxes were failing to do. */
  exCard: { padding: 0, overflow: 'hidden', gap: 0 },
  exHead: { gap: 6, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  /*
    Khi thẻ thu lại, tiêu đề LÀ cả cái thẻ — nên đệm của nó phải cân.

    Bản mở nặng đầu có lý do: 16 ở đỉnh cộng `marginTop` 8 của chính cái tên
    là 24 phía trên, còn phía dưới chỉ 10 vì còn cả thân thẻ nối tiếp. Bỏ
    nguyên con số ấy cho một hàng đứng một mình thì hàng ấy dính lên nóc thẻ
    và hở một khoảng dưới chân. 4 ở đỉnh đưa nó về 12 trên / 10 dưới.
  */
  exHeadShut: { paddingTop: spacing.xs },
  /* Kết quả của bài đã xong, khi thẻ thu lại. */
  exDoneMeta: { ...type.caption, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  exTick: { alignSelf: 'center' },
  /*
    Cụm "kết quả + mũi tên", cuối hàng tiêu đề.

    `marginLeft: 'auto'` để nó tự ra mép phải — tên bài không co giãn, nên nếu
    không đẩy thì cụm này bám sát cái tên và đọc ra như một phần của tên.
    `alignSelf: 'center'` vì hàng ấy căn theo BASELINE (cho tên và đơn thuốc
    thẳng chân chữ), mà một mũi tên không có chân chữ để mà thẳng.

    Cao 32 chứ không phải chiều cao tự nhiên của một glyph 15 điểm: cộng với
    `hitSlop` 10 trên dưới thì vùng chạm qua sàn 44 của Apple mà hàng không
    phải cao thêm điểm nào.
  */
  exFold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
    alignSelf: 'center',
    minHeight: 32,
  },
  /* Chỉ đệm NGANG, không đệm dọc. `ExerciseProgress` trả `null` khi bài này
     chưa có gì để kể, và một hộp có đệm dọc quanh một đứa con vô hình là một
     khoảng trống không ai giải thích được. Khoảng thở đã có sẵn: đệm đáy của
     tiêu đề ở trên và đệm đỉnh của hàng set đầu tiên ở dưới. */
  exSub: { paddingHorizontal: spacing.md },
  exTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  /* What every set of this movement shares, said once — the rows below spend
     their width on what varies instead. */
  exPrescription: { ...type.caption, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  /* A hairline, not a gap: the rows belong to one thing. */
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: spacing.md },
  setBlock: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  /* Untouched: still the same size and still tappable, just not shouting a
     number the header already gave. */
  chipDefault: { borderColor: 'transparent', backgroundColor: 'transparent' },
  /*
    ── "im tiếng" KHÔNG được mua bằng độ tương phản ──

    Năm style dưới đây từng tô chữ bằng `alpha(m.ink, 0.28–0.40)`. Chủ ý ghi ở
    các chú thích quanh chúng là đúng và giữ nguyên: một giá trị VẪN ĐÚNG như
    kế hoạch thì không cần hét, để mắt bắt được cái set bạn đã sửa. Cách thực
    hiện thì sai — nó trả cho chủ ý ấy bằng khả năng đọc:

        chipTextDefault  α=0,35   2,20:1 sáng · 3,17:1 tối
        setNoDone        α=0,28   1,84    · 2,44
        fieldPlan        α=0,40   2,52    · 3,79   ← CON SỐ kg và reps
        unitPlan         α=0,30   1,94    · 2,63
        times            α=0,30   1,94    · 2,63

    Sàn WCAG cho chữ thường là 4,5:1. Cả năm trượt ở cả hai diện mạo, bốn trong
    năm trượt dưới cả 3,0 — tức dưới sàn của một VẬT THỂ ĐỒ HOẠ, chứ đừng nói
    chữ. Và cái tệ thứ hai là `fieldPlan`: con số kg và số lần, dữ liệu chính
    của hàng, ở 2,52:1.

    Chủ dự án nhìn trên máy thật và nói "tự nhiên các chữ bị mờ mà không có một
    lý do và không thể hiện đúng chủ đích". Vế sau là chẩn đoán chính xác: chủ
    đích có thật, nhưng thứ hiện ra là chữ hỏng chứ không phải chữ khiêm tốn.

    Chủ đích ấy đã có một người mang: giá trị ĐÃ ĐỔI đội một cái chip — nền
    cộng viền. Đó là một khác biệt về HÌNH, mạnh hơn hẳn một khoảng chênh
    tương phản, và nó không tốn gì của bên còn lại. Nên bên còn lại thôi phải
    trả: `mutedForeground`, token chữ hạng hai của app, 5,78:1 sáng và 5,02
    tối. Vẫn lùi một bậc so với `foreground`, nhưng lùi trong vùng đọc được.
  */
  chipTextDefault: { color: c.mutedForeground },
  /*
    Tên bài tập là NỘI DUNG CHÍNH của khối, nên nó thôi được vẽ bằng cỡ chú thích.

    Bản trước là `type.footnote` (13) cộng `fontWeight: '600'` viết tại chỗ —
    tức một tiêu đề dựng bằng cách BƠM ĐẬM một cỡ chữ phụ. Đó đúng là mẫu hình
    làm cả màn đọc ra "generic mobile": nhỏ hơn iOS một bậc rồi bù lại bằng độ
    đậm. `type.headline` (17/600) là đúng vai ấy trong thang chữ đã có, và nó
    khớp Headline 17/600 của iOS từng chữ số.

    Độ đậm không còn viết tại chỗ nữa: 600 nay đến từ chính token.
  */
  /* Tên + glyph info là MỘT control. `baseline` cho chữ thẳng chân với đơn
     thuốc bên cạnh; glyph không có chân chữ nên nó tự căn giữa. */
  exNameBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, minWidth: 0 },
  exName: {
    ...type.headline,
    color: c.foreground,
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  setCardDone: { opacity: 0.6 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    /*
      Visible at rest, not only once ticked: a 2pt rim against the card, plus a
      faint fill, and the ghosted tick inside says what it is for.

      ── cái ý định ấy đúng, con số thì chưa đỡ nổi nó ──

      Đo lại chính hai dòng dưới: viền 0,3 ra **1,94:1** ở bản sáng và 2,63 ở
      bản tối — dưới sàn 3:1 của WCAG 1.4.11 cho một thành phần giao diện. Và
      cái "faint fill so it reads as an empty box" đo **1,10:1** · 1,11: nó
      không làm gì cả, cái viền đang gánh một mình, mà viền cũng chưa đủ.

      Đây là ô người ta bấm nhiều nhất màn này, bằng tay ướt, giữa hai set,
      trong lúc mệt. Nên viền lên **0,5** — 3,36:1 ở sáng · 5,37 ở tối.

      Bề dày giữ 2 và mặt nền giữ 0,05: nền không qua nổi sàn bằng cách nào mà
      vẫn còn là "faint", nên nó thôi được tính là người gánh việc — nó ở lại
      đúng vai một lớp mờ nhẹ, còn cái viền mới là thứ nói đây là một cái hộp.
    */
    borderWidth: 2,
    borderColor: alpha(m.ink, 0.5),
    backgroundColor: alpha(m.ink, 0.05),
  },
  checkOn: { backgroundColor: c.primary, borderColor: c.primary },
  setText: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 3 },
  /*
    Số thứ tự set tách khỏi cụm `tạ × lần`, bằng KHOẢNG TRẮNG chứ không bằng nét.

    `setText` có `gap: 3` cho mọi con của nó, nên hàng ra tám vật cách đều: số
    thứ tự, ô tạ, "kg", "×", ô lần, "reps". Cách đều thì không có cụm nào cả —
    mắt phải đọc từng vật một thay vì đọc ba khối.

    Thêm 4 điểm sau con số ấy (tổng 7 so với 3 bên trong cụm số) là đủ để hàng
    đọc ra:

        [tick]  [số]   [tạ × lần]            [nghỉ] [RPE]

    Không nét mới, không nền mới, không hộp mới — chỉ một khoảng trống to gấp
    hơn hai lần khoảng bên trong cụm, và mắt gom cụm theo tỉ lệ ấy.
  */
  setNo: {
    ...type.caption,
    color: c.mutedForeground,
    fontVariant: ['tabular-nums'],
    width: 12,
    textAlign: 'center',
    marginRight: spacing.xs,
  },
  setNoDone: { color: c.mutedForeground },
  /*
    A box that looks like a box.

    The first draft was bare text with no background, on the theory that a
    quiet row is a calm row. It read as a label — the same mistake the effort
    chips made before they were given an edge, and the same one the tick made
    before that: "a control has to look like one before it can be one".
  */
  field: {
    ...type.footnote,
    color: c.foreground,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    height: 28,
    paddingHorizontal: 4,
    /* A TextInput carries its own vertical padding on Android and it fights a
       fixed height — the text sits low and the box looks wrong on one platform
       only, which is the kind of thing nobody sees until somebody reports it. */
    paddingVertical: 0,
    borderRadius: radius.sm,
    backgroundColor: alpha(m.ink, 0.07),
    /*
      ── viền 0,14 ở nét tóc là một cái hộp KHÔNG CÓ Ở ĐÓ ──

      Đo trên mặt thẻ: `alpha(m.ink, 0.14)` ra **1,33:1** ở bản sáng và 1,46 ở
      bản tối. Sàn của WCAG 1.4.11 cho một *thành phần giao diện* là 3:1, và cái
      viền này là thứ DUY NHẤT nói "đây là ô nhập được": mặt nền 0,07 chỉ đo
      1,15:1, tức cũng không thấy.

      `tools/ink-alpha.mjs` không bắt được vì nó MIỄN TRỪ tường minh
      `alpha(m.ink, x)` khi dùng làm nền hoặc viền — *"một mặt nền mờ là đúng
      việc của nó"*. Với một mặt nền thì đúng. Với viền của một control thì
      không, và đó là khe hở giữa các luật màu chứ không phải một quyết định.

      Đổi ĐỘ MỜ, giữ nguyên BỀ DÀY: 0,14 → 0,50, ra 3,36:1 ở sáng · 5,37 ở tối.

      ── và tôi đã sửa sai bề dày một lượt, nên ghi lại ──

      Lượt đầu tôi nâng luôn `borderWidth` từ nét tóc lên 1, lập luận rằng
      "0,33pt là dưới một điểm ảnh logic nên ở độ mờ nào cũng chỉ là gợi ý".
      Lập luận ấy lẫn BỀ DÀY với ĐỘ NHÌN THẤY. Nét tóc trên màn 3× là đúng MỘT
      điểm ảnh thiết bị, và một điểm ảnh ở 3,36:1 thì nhìn rõ — đó chính là cách
      iOS vẽ mọi đường phân cách bảng và mép ô nhập.

      Ảnh dựng nói ra chỗ sai: 1pt × 18 cái ô trên một trang đọc thành một biểu
      mẫu có viền, tức đúng thứ "outlined Material UI" mà đặt hàng cấm. Khuyết
      tật gốc nằm ở ĐỘ MỜ 1,33:1, không nằm ở bề dày — nên chỉ độ mờ được đổi.
    */
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(m.ink, 0.5),
  },
  /*
    Căn phải, và không phải vì thẩm mỹ.

    Ô rộng 44pt với chữ căn giữa đẩy "55" ra giữa hộp, nên nó ở XA đơn vị của
    chính nó hơn là đơn vị ở xa dấu nhân — mắt gom "kg ×" thành một cụm và tách
    số ra khỏi nhãn của nó. Căn phải thì "55 kg" dính lại thành một thứ, và dấu
    nhân tách đúng hai con số nó đứng giữa.

    Kèm theo một thứ đắt hơn: các mức tạ xuống thành một CỘT thẳng hàng, nên
    55 / 60 / 60 đọc được bằng một cái liếc dọc thay vì phải đọc từng hàng.
  */
  fieldLoad: { minWidth: 44, textAlign: 'right' },
  fieldReps: { minWidth: 34 },
  /* Still a box, just not shouting: it holds what the plan said, and the plan
     is already stated in full one line above. */
  /*
    ── `borderColor: 'transparent'` đã bị BỎ, và đó là nửa còn lại của lỗi trên ──

    Nâng viền của `field` lên 0,5 chỉ sửa được những ô ĐÃ SỬA giá trị. Ở trạng
    thái thường gặp nhất — mọi set còn nguyên số của kế hoạch — dòng này ghi đè
    viền về trong suốt, nên ô nhập KHÔNG CÓ mép nào cả. Ảnh dựng xác nhận: ở đó
    "55" và "10" là hai con số trôi nổi, không phải hai ô.

    Ý định gốc vẫn đúng và vẫn giữ: một giá trị chưa đụng tới thì im tiếng.
    Nhưng thứ mang ý định ấy phải là MẶT NỀN, không phải cái viền — một ô nhập
    không có mép thì không đọc ra là ô nhập được ở bất kỳ trạng thái nào, và đó
    là cùng một lỗi mà `check` và `field` vừa được sửa.

        đã sửa      nền 0,07 + viền 0,5    ← một ô đặc
        chưa sửa    nền trong suốt + viền 0,5  ← một ô rỗng

    Hai trạng thái vẫn phân biệt được bằng HÌNH (có nền / không nền), đúng lập
    luận đã ghi ở khối chú thích lớn phía trên — *"một khác biệt về HÌNH, mạnh
    hơn hẳn một khoảng chênh tương phản"*. Chỉ là nay cả hai đều còn là cái hộp.
  */
  fieldPlan: { color: c.mutedForeground, backgroundColor: 'transparent' },
  unit: { ...type.caption, color: c.mutedForeground },
  unitPlan: { color: c.mutedForeground },
  /* Room on both sides. At the row gap alone it sat against the unit and read
     as one clump, "kg ×", instead of separating the two numbers it is between. */
  times: { ...type.caption, color: c.mutedForeground, paddingHorizontal: 3 },
  exNameInput: { flex: 1, minWidth: 0, padding: 0 },
  exRemove: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  addSet: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 34,
    marginTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  addSetText: { ...type.caption, color: c.mutedForeground },
  addEx: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radius.md,
    /* Solid, not dashed — `tools/training-card.mjs` caught the first draft and
       says why: iOS refuses a dashed border whose four sides differ and then
       draws NOTHING rather than falling back, so the button would have been an
       invisible tap target on the platform this ships to. A quiet fill carries
       the same "this is available, it is not the main event" without betting on
       a border style. */
    borderWidth: 1,
    borderColor: alpha(m.ink, 0.16),
    backgroundColor: alpha(m.ink, 0.04),
  },
  addExText: { ...type.footnote, color: c.mutedForeground },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: m.inset.bg,
    borderWidth: m.inset.borderWidth,
    borderColor: m.inset.border,
  },
  chipOpen: { borderColor: c.primary },
  chipText: { ...type.caption, color: c.foreground, fontWeight: '600', fontVariant: ['tabular-nums'] },

  /*
    ── vì sao cụm điều khiển trông như KHÔNG thuộc về set nào ──

    Về cấu trúc nó đã thuộc về set 1 rồi: `<Retract>` này nằm TRONG chính
    `setBlock` của hàng ấy. Vấn đề thuần thị giác, và nó nằm ở đúng một dòng.

    `borderTopWidth: hairlineWidth, borderTopColor: c.border` vẽ một đường tóc
    ngay trên cụm — mà `styles.hair` giữa hai hàng set cũng là một đường tóc
    `c.border`. Cùng một nét, cùng một màu. Nên mắt đọc dọc xuống và thấy:

        [set 1]  ─── [nghỉ · gắng sức]  ─── [set 2]

    ba phần ngang hàng nhau, chứ không phải một set đang mở kèm đồ của nó. Cái
    viền được thêm vào để "tách" lại chính là thứ cắt cụm ra khỏi chủ của nó.

    Nên BỎ nó đi — không thay bằng một mặt nền hay một hộp khác, vì thêm một
    ranh giới nữa là đi ngược đúng cái đang cần chữa. Còn lại hai người nói:

      · **khoảng trắng** — không còn nét nào giữa hàng set và cụm của nó, nên
        chúng dính liền thành một khối, trong khi hai đường tóc ở trên và dưới
        vẫn cắt đúng chỗ cần cắt: giữa các set.
      · **thụt vào** — cụm lùi vào bằng đúng bề ngang ô tick cộng khe của hàng
        (28 + 8), nên nhãn của nó bắt đầu thẳng cột với dữ liệu của set 1 thay
        vì thẳng với mép thẻ. Một khối thụt vào dưới một dòng là cách cũ nhất
        để nói "cái này thuộc dòng trên".

    Không token mới: 28 là bề ngang ô tick đã có, `spacing.sm` là khe của
    `setRow` đã có. Xem `SET_INDENT`.
  */
  editors: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingLeft: SET_INDENT,
  },
  editorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  editorLabel: { ...type.footnote, color: c.mutedForeground, flexShrink: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepBtn: {
    width: 44,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: m.inset.bg,
    borderWidth: m.inset.borderWidth,
    borderColor: m.inset.border,
  },
  stepValue: {
    ...type.footnote,
    color: c.foreground,
    fontVariant: ['tabular-nums'],
    minWidth: 54,
    textAlign: 'center',
  },
  rpeRow: { flexDirection: 'row', gap: 4 },
  rpeOption: {
    minWidth: 36,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: m.inset.bg,
    borderWidth: m.inset.borderWidth,
    borderColor: m.inset.border,
  },
  rpeOptionOn: { backgroundColor: c.primary, borderColor: c.primary },
  rpeOptionText: { ...type.footnote, color: c.foreground, fontVariant: ['tabular-nums'] },
  rpeOptionTextOn: { color: c.primaryForeground, fontWeight: '700' },

  finish: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: c.primary,
    marginTop: spacing.sm,
  },
  /*
    KHÔNG dùng `opacity` cho trạng thái tắt, và đây là lý do đo được.

    Bản trước là `{ opacity: 0.4 }`. `opacity` của RN nhân lên CẢ cây con, nên
    nền và chữ cùng mờ đi — và kết quả là thứ tệ nhất trong hai đường:

        nền   #1a1917 → #9f9c99   2,49:1 so với trang   ← vẫn TO TIẾNG
        chữ   #ffffff → #c5c4c2   1,57:1 so với nền     ← KHÔNG ĐỌC ĐƯỢC

    Tức một mảng xám lớn, rõ ràng trên trang, mang một dòng chữ không đọc nổi.
    Hình thì hét, chữ thì câm, nên nút không gắn vào đâu cả. Bản tối cùng bệnh:
    2,27:1 và 1,51:1.

    Cái bẫy này app ĐÃ biết — `week-plan.tsx` có chú thích đúng về nó ở tấm nền
    sau sheet: *"Nếu để `backgroundColor` trên chính `Pressable` rồi cho nó
    `opacity`, cả cây con mờ theo, vì `opacity` áp cho cả nhóm"*. Nút này mắc
    đúng lỗi ấy.

    Nên trạng thái tắt mượn ĐÚNG công thức của `finishDone` ngay dưới — nền
    nhạt, viền cùng màu, chữ cùng màu — chỉ đổi màu. Ba vai tách ra, mỗi vai
    tự chịu trách nhiệm về độ tương phản của mình:

        nền   alpha(mutedForeground, 0.12)   1,17:1 /trang · 1,11 ở tối
        viền  alpha(mutedForeground, 0.35)   1,62:1 /trang · 1,57 ở tối
        chữ   secondaryForeground            6,05:1 /nền  · 6,35 ở tối

    Nền TỤT từ 2,49 xuống 1,17 — nó thôi tranh phần với dữ liệu — trong khi chữ
    LÊN từ 1,57 tới 6,05. "Không dùng được" nay nói bằng việc nút lùi khỏi
    trang, không bằng việc chữ mờ đi.
  */
  finishOff: {
    backgroundColor: alpha(c.mutedForeground, 0.12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(c.mutedForeground, 0.35),
  },
  finishTextOff: { color: c.secondaryForeground },
  /* Saved is not the same as unavailable. It keeps its full opacity and turns
     into a statement — green tick, green text, no fill — so the row reads as a
     finished job rather than as a button that stopped working. */
  finishDone: {
    opacity: 1,
    backgroundColor: alpha(c.readinessGreen, 0.12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(c.readinessGreen, 0.35),
  },
  checkNotReady: { opacity: 0.35 },
  finishTextDone: { color: c.readinessGreen },
  /* Viền chứ không mảng đặc: đây là việc PHỤ của tấm, và một nút đặc thứ hai
     cạnh nút chính làm người đọc phải chọn giữa hai thứ trông ngang nhau. */
  finishAppend: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: c.primary,
  },
  finishTextAppend: { color: c.primary },
  finishText: { ...type.body, color: c.primaryForeground, fontWeight: '600' },
  /* Nhẹ hơn nút chính một bậc: đây là lối ra cho trường hợp HIẾM, không phải
     việc chính của tấm này. Đặt ngang nút để nó đọc ra là phần tiếp theo của
     cùng một câu, chứ không phải một hành động rời. */
  extraLink: { alignItems: 'center', paddingVertical: spacing.sm },
  extraLinkText: { ...type.footnote, color: c.mutedForeground, textDecorationLine: 'underline' },

}));
