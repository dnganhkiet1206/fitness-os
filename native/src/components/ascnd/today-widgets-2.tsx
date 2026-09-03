import { nav } from '@/lib/nav';
import * as Haptics from 'expo-haptics';
import {
  Activity,
  AlertTriangle,
  Beef,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Heart,
  Moon,
  Target,
  Trophy,
  Wifi,
  WifiOff,
  Wind,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { HelpButton, HelpNudge, useHelpTopic } from '@/components/ascnd/help-button';
import { Icon } from '@/components/ascnd/icon';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { TrainingExplainer } from '@/components/ascnd/training-explainer';
import { ACWR_TINT } from '@/components/ascnd/acwr-tint';
import { colors, glass, radius, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useProfile, useRecentWorkouts, useTodayBiometrics } from '@/hooks/useTodayData';
import { useRecentAwards } from '@/hooks/use-extras';
import { useUnits } from '@/hooks/use-units';
import { connectedSourceLabel } from '@/lib/biometric-source';
import { goalTraining } from '@/lib/goal-training';
import { strengthDaysIn } from '@/lib/training-week';
import { loadWindow, type LoadSession } from '@/lib/session-load';
import { awardText } from '@/lib/gamification-i18n';
import { localDateStr } from '@/lib/local-date';
import {
  acwrZone,
  chronicDays,
  averageWeek,
  daysSince,
  loadComparison,
  STALE_AFTER_DAYS,
  TREND_WEEKS,
  weeklyVolumes,
  type AcwrZoneKey,
} from '@/lib/training-card';
import { displayWeight, weightLabel } from '@/lib/units';

/**
 * A dashed rule, drawn rather than bordered.
 *
 * ── this replaced `borderStyle: 'dashed'`, which drew nothing at all ──
 *
 * The habit line and its legend key were a `View` with `borderTopWidth: 1`,
 * `borderStyle: 'dashed'` and `borderTopColor`. On a device that produced four
 * `Unsupported dashed / dotted border style` warnings and **no line**.
 *
 * `RCTBorderDrawing.m:496` is the whole story: a dashed border is refused
 * unless all four `borderColor`s are equal, and it does not fall back to a
 * solid line — it `return nil`s, so nothing is painted. Setting only
 * `borderTopColor` leaves the other three at their default, so the colours are
 * unequal by construction and the branch can never be taken. The one styling
 * shorthand that reads as "colour just the edge I gave a width to" is the one
 * that guarantees the edge is not drawn.
 *
 * What made this expensive is that it fails *quietly and plausibly*. A missing
 * reference line on a volume chart looks like a week with no baseline yet, and
 * `tools/training-card.mjs` was checking that the line is written after the
 * bars so the bars cannot cover it — which was true, and irrelevant, because
 * there was no line to cover. Source order was the previous bug in the same
 * six lines, and checking for it again told me nothing about this one.
 *
 * So: SVG, which is how `line-chart.tsx` and `water-chart.tsx` have drawn their
 * dashed gridlines all along. `strokeDasharray` has no equal-colours precondition
 * and no silent nil.
 *
 * ── the width is a number, never "100%" ──
 *
 * A percentage inside `<Svg>` resolves against the frame the SVG was *last laid
 * out at*, which `glass-card.tsx` and `liquid-glass.tsx` both document at
 * length after it cost a visible seam on both. Callers pass real pixels: the
 * legend key knows its own 14, and the habit line takes the chart's measured
 * width.
 */
/**
 * The habit line's colour, shared by the rule and its legend key.
 *
 * 55% white, not 35% — it crosses the bars rather than hiding behind them, and
 * 35% over a lit bar is fainter than the same 35% over the card. One constant
 * because the key is a promise about the line: two literals drifting apart
 * would make the legend describe something the chart is not drawing.
 */
const HABIT_COLOUR = 'rgba(255,255,255,0.55)';

function DashedRule({ width, colour }: { width: number; colour: string }) {
  if (width <= 0) return null;
  return (
    <Svg width={width} height={1}>
      <Line
        x1={0}
        y1={0.5}
        x2={width}
        y2={0.5}
        stroke={colour}
        strokeWidth={1}
        strokeDasharray={[3, 4]}
      />
    </Svg>
  );
}

function MicroTitle({ icon, children, color }: { icon?: LucideIcon; children: React.ReactNode; color?: string }) {
  return (
    <View style={styles.microRow}>
      {icon ? <Icon icon={icon} size={13} color={color ?? colors.mutedForeground} /> : null}
      <Text style={styles.microTitle}>{children}</Text>
    </View>
  );
}

// ─── BiometricsCard (web dashboard/BiometricsCard) ─────────────────────

export function BiometricsCard() {
  const i18n = useI18n();
  const { data: bio } = useTodayBiometrics();

  if (!bio) return null;
  /*
    ── the card showed Apple Health data and said "not connected" beside it ──

    This read `wearable_sources`, and **nothing in the app has ever written to
    that table**. So `connected` was always `undefined` and the header drew a
    red WifiOff with *"chưa kết nối"* — for everybody, including somebody
    syncing Apple Health whose HRV and resting heart rate are printed two lines
    below, in this same card. One card, two contradictory claims about the same
    reading.

    The answer was already in hand: these rows carry the `source` that wrote
    them (`use-health-sync.ts` stamps `APPLE_SOURCE`), and the query selects
    `*`. So the indicator now reports what actually produced today's numbers,
    which is the question it was always pretending to answer — and it costs one
    query fewer.

    The rule itself lives in `lib/biometric-source.ts` so `tools/dead-schema.mjs`
    can run its edges — `manual` is a real source and still not a connection.
  */
  const connectedSource = connectedSourceLabel(bio.source);

  const metrics = [
    /*
      ── it is not heart rate, it is resting heart rate ──

      `hr_bpm` is filled from HealthKit's `RestingHeartRate`, is labelled
      "Nhịp tim nghỉ" on the sheet people type it into, and is scored as RHR by
      the readiness engine. Calling it "Heart Rate" here — in English, on a
      Vietnamese app — invited somebody to compare it against the live number
      on their watch and conclude the app was wrong, or to log a live reading
      into the column the readiness score treats as resting.
    */
    { label: i18n.biometricsHeartRate, value: bio.hr_bpm, unit: 'bpm', icon: Heart, color: colors.destructive },
    /*
      ── the HRV tile went blind for every Apple Health user ──

      This read `hrv_rmssd_ms` only. Apple publishes SDNN and the sync writes it
      to its own column, so for anybody syncing a watch the value was null, the
      `.filter` below dropped the row, and the card simply had no HRV on it —
      no gap, no explanation, just one fewer tile than yesterday.

      `ai-coach` had the identical bug and the comment there says why it
      matters. The two families are never mixed: whichever one this person's
      source produces is the one shown, with its name attached, exactly as the
      Biometrics screen already does it.
    */
    bio.hrv_sdnn_ms != null
      ? { label: 'HRV · SDNN', value: bio.hrv_sdnn_ms, unit: 'ms', icon: Activity, color: colors.primary }
      : { label: 'HRV', value: bio.hrv_rmssd_ms, unit: 'ms', icon: Activity, color: colors.primary },
    { label: 'SpO₂', value: bio.spo2_pct, unit: '%', icon: Droplets, color: colors.metricBlue },
    // ml/kg is a mass fraction; VO₂max is a rate — ml/kg/min.
    { label: 'VO₂max', value: bio.vo2max_mlkgmin, unit: 'ml/kg/min', icon: Wind, color: colors.metricCyan },
    { label: i18n.biometricsBreathRate, value: bio.resp_rate_rpm, unit: 'rpm', icon: Wind, color: colors.metricPurple },
  ].filter((m) => m.value != null);

  if (metrics.length === 0) return null;

  return (
    <PressScale onPress={() => { Haptics.selectionAsync(); nav.push('/biometrics'); }}>
      <GlassCard style={styles.stackCard}>
        <View style={styles.headRow}>
          <MicroTitle>{i18n.dcBioTitle}</MicroTitle>
          <View style={styles.connRow}>
            <Icon
              icon={connectedSource ? Wifi : WifiOff}
              size={12}
              color={connectedSource ? colors.readinessGreen : colors.readinessRed}
            />
            <Text style={styles.connText}>
              {connectedSource ?? i18n.dcBioNotConnected}
            </Text>
          </View>
        </View>
        <View style={styles.bioGrid}>
          {metrics.map((m) => (
            <View key={m.label} style={styles.bioTile}>
              <Icon icon={m.icon} size={15} color={m.color} />
              <View style={styles.bioTileInfo}>
                <View style={styles.bioValueRow}>
                  <Text style={styles.bioValue}>{Math.round(Number(m.value) * 10) / 10}</Text>
                  <Text style={styles.bioUnit}>{m.unit}</Text>
                </View>
                {/* The tile is a fixed share of a wrapping grid and the labels
                    are identifiers, not sentences — "Nhịp tim nghỉ" and
                    "ml/kg/min" are both longer than what used to be here.
                    Truncating one keeps the row of tiles level; letting it wrap
                    makes one tile taller than the three beside it. */}
                <Text style={styles.bioLabel} numberOfLines={1}>{m.label}</Text>
              </View>
            </View>
          ))}
        </View>
      </GlassCard>
</PressScale>
  );
}

// ─── TrainingCard (web dashboard/TrainingCard) ─────────────────────────

interface PainFlag {
  bodyPart?: string;
  pain_0_10?: number;
}

/**
 * How tall the eight-week chart is — named so the bars and the habit line
 * measure from the same number.
 *
 * 72 rather than the 44 it started at. At 44 a week of 9,000 and a week of
 * 13,000 were 21 and 30 points apart, a difference you have to go looking for;
 * the chart exists to make the shape of a build obvious at a glance, and height
 * is the only thing that buys that. It is the tallest single element on the
 * card now, which is right — it is the only one that shows a shape.
 */
const TREND_H = 72;

/*
  Bảng màu vùng giờ nằm CẠNH luật, ở `lib/training-card.ts`.

  Nó từng là một bản cục bộ ở đây, và chú thích của chính nó nói "keyed by the
  one table in lib/training-card.ts" — nhưng nó KHÔNG đọc bảng nào cả, nó là
  một bảng thứ hai gõ tay tình cờ đúng. Bản thứ ba, trong readiness-gauge.tsx,
  không đúng: nó vẫn giữ luật ba nhánh mà chú thích đầu training-card.ts liệt
  kê là lỗi đã gỡ.
*/
const ZONE_TINT = ACWR_TINT;

/**
 * What each band means, as a thing to do rather than a thing to know.
 *
 * The card used to stop at a one-word verdict — "Nhảy vọt" — which names the
 * situation and says nothing about it. A person reading a dashboard at seven in
 * the morning is deciding whether to train today; a label they then have to
 * interpret has handed the work back to them.
 */
const zoneAdvice = (key: AcwrZoneKey, vi: boolean) =>
  ({
    detraining: vi
      ? 'Nghỉ lâu làm mất nền thể lực. Quay lại từ từ — đừng tập bù cho những tuần đã nghỉ.'
      : 'A long gap costs you your base. Come back gradually — do not try to make up the missed weeks.',
    low: vi
      ? 'Nhẹ hơn thường lệ. Một tuần giảm tải là bình thường và có ích.'
      : 'Lighter than usual. One easier week is normal, and useful.',
    optimal: vi
      ? 'Đang tăng ở mức hợp lý. Cứ giữ nhịp này.'
      : 'Progressing at a sensible rate. Keep this up.',
    elevated: vi
      ? 'Tăng hơi nhanh. Tuần tới nên giữ nguyên khối lượng thay vì tăng tiếp.'
      : 'Ramping up quickly. Hold this volume next week rather than adding more.',
    spike: vi
      ? 'Tăng vọt là lúc dễ chấn thương nhất. Tuần tới nên giảm tải.'
      : 'A sharp jump is when injuries happen. Ease off next week.',
  })[key];

/** "Hôm nay" / "Hôm qua" / "5 ngày trước" — the fact the card was missing. */
const whenLabel = (days: number, vi: boolean) => {
  if (days === 0) return vi ? 'Hôm nay' : 'Today';
  if (days === 1) return vi ? 'Hôm qua' : 'Yesterday';
  return vi ? `${days} ngày trước` : `${days} days ago`;
};

/**
 * Training — what you did, and whether this week is a jump.
 *
 * ── the second rewrite, and what it was for ──
 *
 * The first one made the card *correct*: one band table instead of three
 * disagreeing ones, a date on the latest session, a seven-day figure computed
 * over seven days. It was still reported as hard to understand, and it was,
 * because none of that addressed what the card actually asks of a reader.
 *
 * It led with **`1.7`**. That is not a fact about somebody's week — it is a
 * fact about the quotient of two rolling averages, and reading it means
 * knowing that 1 is neutral, that the top is seven days, that the bottom is
 * twenty-eight, and that both are per-day. Under it sat a scale marked
 * `0 · 0.8 · 1.3 · 2.0`, four more numbers that only mean something once you
 * already understand the first one. The card was a correct readout of a
 * quantity nobody thinks in.
 *
 * So the order is inverted. The sentence is the headline — *this week is 70%
 * heavier than your habit* — with what to do about it underneath. Then the two
 * volumes it compares, in the same unit, so the claim is checkable rather than
 * believed: 18,900 against an average week of 11,100 is visibly 1.7. The bar
 * stays, labelled in words instead of numbers, because "where am I" is a
 * genuinely visual question. The raw ratio sits at the end of that row in
 * small mono type, for the people it means something to.
 *
 * Everything on the card is now either a sentence, a weight, or a date.
 */
export function TrainingCard({ acwr }: { acwr: number | null }) {
  /* The habit line spans the chart, and `DashedRule` needs that span in pixels
     rather than a percentage — see the note on it. Set once from `onLayout`;
     the line is absolutely positioned, so nothing it draws can change the box
     being measured and this cannot loop. */
  const [chartW, setChartW] = useState(0);
  const measureChart = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setChartW((p) => (p === width ? p : width));
  };
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const { weight: wUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const { data: workouts } = useRecentWorkouts();
  /* Already mounted by Today, so this shares the cached row rather than adding
     a query — it is here for `goal`, which decides the strength-day target. */
  const { data: profile } = useProfile();
  /*
    Both sides of the ratio, over the windows the ratio is actually computed
    over. `daysAgoISO(n)` here and `setDate(getDate() - n)` in
    `daily-log-service.ts:29-32` are the same instant, so these two sums are the
    engine's own `training_load_7d` and `training_load_28d` — which is what lets
    the card show them beside the verdict and have the division come out.

    `latest` still comes from `useRecentWorkouts`: the top row needs
    `pain_flags`, which the sessions query does not select, and "the most recent
    session" is genuinely not a windowed question — that is the whole reason it
    has to say how long ago it was.
  */
  const { data: week } = useWorkoutSessions(7);
  const { data: month } = useWorkoutSessions(28);
  /* Eight weeks for the chart. The windows all come from `daysAgoISO`, so the
     newest bar is by construction the same set of sessions as the 7-day total
     printed above it. */
  const { data: history } = useWorkoutSessions(TREND_WEEKS * 7);
  const help = useHelpTopic('training');

  const latest = (workouts ?? [])[0];

  /*
    ── "not enough history" is not "you have stopped training" ──

    `acwr` is `null` for anybody the engine cannot place yet — no 28-day load,
    or not enough of the day to compute one. `?? 0` turned that absence into the
    number zero, and zero is not a neutral value on this scale: `acwrZone(0)`
    is **detraining**, the red band that means somebody has dropped off.

    The verdict sentence below is already gated on `a > 0`, so the *words* were
    right — it says four weeks of history are needed. The **colour** was not:
    `zoneTint` painted the newest bar of the trend chart red, so the card told
    the reader in one place that it could not judge their week and in another,
    in the strongest signal a chart has, that their week was a collapse. On the
    same card, about the same week.

    So the tint is only a verdict when there is a verdict. Without one the newest
    bar draws like every other bar — which is the honest picture: volume that
    happened, not yet compared to anything.
  */
  const judged = acwr != null && acwr > 0;
  const a = acwr ?? 0;
  const zone = acwrZone(a);
  const zoneTint = judged ? ZONE_TINT[zone] : 'rgba(255,255,255,0.20)';
  const cmp = loadComparison(a);

  const weekSessions = week ?? [];
  const weekVolume = weekSessions.reduce((s, w) => s + Number(w.volume_load || 0), 0);
  const monthVolume = (month ?? []).reduce((s, w) => s + Number(w.volume_load || 0), 0);
  /* Divided by the span the engine used, not a flat four weeks — otherwise the
     two figures printed on this card do not divide to the percentage printed
     beside them, which is the one thing the card exists to make checkable. */
  const habitVolume = averageWeek(monthVolume, chronicDays(month ?? []));

  /*
    ── the pair the verdict is actually a claim about ──

    The sentence above ("this week is 18% heavier than your habit") is derived
    from `acwr`, and `acwr` is now the **internal** load ratio — RPE × reps, the
    session-RPE method — because tonnage was zero for everybody who trains
    without a barbell.

    The two figures printed under it were tonnage, and this card's whole stated
    purpose is that the pair divides to the percentage beside it. After the unit
    changed they no longer did: a bodyweight trainee would read *"18% heavier
    than your habit"* directly above **0 kg / 0 kg**. Exactly the fault this
    card was fixed for once before, when the percentage came from
    `chronicDays` and the numbers came from a flat `v28/4`.

    So the pair is the load pair, and tonnage keeps its place as a separate,
    labelled line — it is a real quantity and a readable one, it is simply not
    what the sentence is about. Two named things beat one number pretending to
    be both, which is also what the training/cardio split requires.
  */
  const weekLoad = loadWindow(weekSessions as LoadSession[]);
  const monthLoad = loadWindow((month ?? []) as LoadSession[]);
  const habitLoad = averageWeek(monthLoad, chronicDays(month ?? []));
  const hasPR = weekSessions.some((w) => w.pr_detected);

  /*
    ── the half of the goal that reached nothing ──

    `goalTraining` returns three things and, until now, one of them was read:
    `rpeBand`, through `goalRpeTarget` in the load engine. `strengthDays` — the
    WHO floor of muscle-strengthening work on two or more days a week, which
    applies to every adult whatever they are training for — was computed and
    consumed by nobody. The commit that added it said the goal now reached the
    training half of the app. Only its effort band did.

    Both sides are already on this screen: `useProfile` is mounted by Today, and
    `week` is the query this card's own comparison runs on, so nothing new is
    fetched.

    `week == null` is left as null rather than counted as zero. An unloaded
    query rendering "0/2 days" is the shape this repository keeps finding — the
    absent value given a numeral, and the numeral then read as a verdict — and
    the verdict here would be "you have not done the minimum", said to somebody
    whose sessions simply have not arrived yet.
  */
  /*
    `profile === undefined` is React Query still fetching (or having failed),
    not "this person has no goal" — a profile row with `goal: null` is a real
    answer and lands on the WHO floor by design.

    The difference matters because the target is the denominator of a verdict.
    Rendering the floor while the row is in flight shows somebody with a
    `strength` goal and two strength days a filled `2/2`, which flips to `2/3`
    the moment the row lands: met, then not met, about a health minimum. So the
    line waits for both halves rather than showing one of them early.
  */
  const strengthTarget = profile === undefined ? null : goalTraining(profile?.goal).strengthDays;
  const strengthDone = week == null ? null : strengthDaysIn(week, localDateStr());
  const trend = weeklyVolumes(history ?? [], TREND_WEEKS);
  const trendMax = Math.max(...trend.map((w) => w.volume), habitVolume);

  const sets = Array.isArray(latest?.sets) ? latest.sets : [];
  const painFlags = (Array.isArray(latest?.pain_flags) ? (latest.pain_flags as PainFlag[]) : []).filter(
    (p) => (p.pain_0_10 ?? 0) > 0,
  );
  const age = latest ? daysSince(latest.date_time) : null;
  const stale = age != null && age >= STALE_AFTER_DAYS;
  const kg = (v: number) => `${Math.round(displayWeight(v, wUnit)).toLocaleString()} ${wl}`;

  const headAccessories = (
    <View style={styles.headAccessories}>
      {hasPR && (
        <View style={styles.prBadge}>
          <Icon icon={Trophy} size={13} />
          {/* "PR!" alone is a noise a card makes. What it is actually saying is
              that a record fell inside the window the rest of the card covers,
              so it says that. */}
          <Text style={styles.prText}>{vi ? 'Kỷ lục mới' : 'New PR'}</Text>
        </View>
      )}
      <HelpButton
        label={vi ? 'Giải thích thẻ tập luyện' : 'Explain the training card'}
        onPress={help.openHelp}
      />
    </View>
  );

  /*
    Nothing logged is a state, not an absence.

    This returned `null`, so a widget somebody had deliberately added to Today
    simply was not there — indistinguishable from having removed it, or from the
    app being broken.
  */
  if (!latest) {
    return (
      <GlassCard style={styles.stackCard}>
        <View style={styles.headRow}>
          <MicroTitle>{i18n.dcTrainingTitle}</MicroTitle>
          {headAccessories}
        </View>
        <Text style={styles.emptyLine}>
          {vi
            ? 'Chưa có buổi tập nào được ghi. Ghi một buổi để thấy khối lượng và so sánh theo tuần.'
            : 'No workouts logged yet. Record one to see volume and the weekly comparison.'}
        </Text>
        <TrainingExplainer visible={help.open} onClose={help.close} />
      </GlassCard>
    );
  }

  return (
    <GlassCard style={styles.stackCard}>
      <View style={styles.headRow}>
        <MicroTitle>{i18n.dcTrainingTitle}</MicroTitle>
        {headAccessories}
      </View>

      {help.nudge ? (
        <HelpNudge
          text={vi ? 'Chưa rõ "khối lượng" hay cách so sánh này? Bấm vào đây.' : 'Not sure what volume load or this comparison mean? Tap here.'}
          onPress={help.openHelp}
          onDismiss={help.dismissNudge}
        />
      ) : null}

      {/*
        The verdict, as a sentence, first.

        This is the whole point of the rewrite: the reader should not have to
        derive the meaning of the card from a number. The number is still here,
        further down, for whoever wants it.
      */}
      {a > 0 ? (
        <View style={[styles.verdict, { borderColor: `${zoneTint}44`, backgroundColor: `${zoneTint}14` }]}>
          <Text style={[styles.verdictLine, { color: zoneTint }]}>
            {cmp.percent === 0
              ? vi ? 'Tuần này đúng bằng thói quen của bạn' : 'This week matches your habit exactly'
              : vi
                ? `Tuần này ${cmp.heavier ? 'nặng' : 'nhẹ'} hơn ${cmp.percent}% so với thói quen`
                : `This week is ${cmp.percent}% ${cmp.heavier ? 'heavier' : 'lighter'} than your habit`}
          </Text>
          <Text style={styles.verdictWhy}>{zoneAdvice(zone, vi)}</Text>
        </View>
      ) : (
        /* The comparison needs a habit to compare against, and a habit is four
           weeks of history. Saying so beats drawing an empty bar. */
        <Text style={styles.emptyLine}>
          {vi
            ? 'Cần khoảng 4 tuần ghi chép để so được tuần này với thói quen của bạn.'
            : 'About four weeks of history are needed before this week can be compared to your habit.'}
        </Text>
      )}

      {/* The two quantities the sentence above is a claim about, in one unit,
          so it can be checked rather than believed — and tonnage underneath
          each, which is a different quantity and is labelled as one. */}
      <View style={styles.compareRow}>
        <View style={styles.compareCell}>
          <Text style={styles.compareLabel}>{vi ? '7 ngày qua' : 'Last 7 days'}</Text>
          <Text style={styles.compareValue}>{Math.round(weekLoad).toLocaleString()}</Text>
          <Text style={styles.compareSub}>
            {weekSessions.length} {vi ? 'buổi' : weekSessions.length === 1 ? 'session' : 'sessions'}
            {weekVolume > 0 ? ` · ${kg(weekVolume)}` : ''}
          </Text>
        </View>
        <View style={styles.compareDivider} />
        <View style={styles.compareCell}>
          <Text style={styles.compareLabel}>{vi ? 'Thói quen · 4 tuần' : 'Habit · 4 weeks'}</Text>
          <Text style={[styles.compareValue, styles.compareValueMuted]}>
            {habitLoad > 0 ? Math.round(habitLoad).toLocaleString() : '—'}
          </Text>
          <Text style={styles.compareSub}>
            {vi ? 'trung bình mỗi tuần' : 'per week on average'}
            {habitVolume > 0 ? ` · ${kg(habitVolume)}` : ''}
          </Text>
        </View>
      </View>

      {/*
        Muscle-strengthening days against what this person's goal aims at.

        One line, on a card they are already reading, rather than a screen to go
        and find — and it says "last 7 days" because that is the window `week`
        covers. A rolling window called "this week" would be a claim about a
        calendar the query does not use.

        The pips are the target, filled by what was done. Past the target they
        stop filling and the count carries the surplus: a row of pips that grows
        would turn a floor into a scoreboard, and this floor is a minimum for
        health, not a score to beat.
      */}
      {strengthDone != null && strengthTarget != null ? (
        <View style={styles.strengthRow}>
          <Text style={styles.strengthLabel}>
            {vi ? 'Ngày tập cơ · 7 ngày qua' : 'Strength days · last 7'}
          </Text>
          <View style={styles.pips}>
            {Array.from({ length: strengthTarget }, (_, i) => (
              <View
                key={i}
                style={[styles.pip, i < strengthDone && styles.pipOn]}
              />
            ))}
          </View>
          <Text
            style={[
              styles.strengthCount,
              strengthDone >= strengthTarget && styles.strengthCountOn,
            ]}
          >
            {strengthDone}/{strengthTarget}
          </Text>
        </View>
      ) : null}

      {stale ? (
        <Text style={styles.staleNote}>
          {vi
            ? `Buổi gần nhất đã ${age} ngày — vì thế 7 ngày qua bằng 0.`
            : `Last session was ${age} days ago — that is why the last 7 days is zero.`}
        </Text>
      ) : null}

      {/*
        Eight weeks, and the habit drawn across them.

        This replaced a bar showing where the ratio sat on a 0–2 scale marked
        `0 · 0.8 · 1.3 · 2.0`. That bar answered "where am I" using four numbers
        you can only read once you already understand the ratio — the picture
        meant to make the number easy needed the number explained first.

        The chart answers the same question and one the card could not answer at
        all: **which way**. Seventy percent heavier is the fourth week of a
        deliberate build or one wild Saturday after a fortnight off, and the card
        drew those identically. The dashed line is the four-week average — the
        same "thói quen" the sentence at the top compares against — so the claim
        and its evidence are one picture.
      */}
      {trend.some((w) => w.volume > 0) && (
        <View style={styles.trend}>
          {/*
            The chart has a name, and the dashed line has a value.

            It shipped with neither: it appeared after two numbers with nothing
            saying what it measured, and the reference line was a rule at an
            arbitrary height captioned "thói quen" with no number on it. So the
            picture was eight unlabelled shapes and a line — the reader had to
            reconstruct what it was about from the paragraph above.

            The value goes up here rather than on the line itself for the same
            reason the caption did: the right-hand end of the line is exactly
            where the newest bar is, and any week near the baseline puts the two
            on top of each other.
          */}
          <View style={styles.trendHead}>
            <Text style={styles.trendTitle}>
              {vi ? 'Khối lượng mỗi tuần' : 'Volume per week'}
            </Text>
            {habitVolume > 0 ? (
              <View style={styles.trendKey}>
                <DashedRule width={14} colour={HABIT_COLOUR} />
                <Text style={styles.trendKeyText}>
                  {vi ? 'thói quen' : 'habit'} {kg(habitVolume)}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.trendChart} onLayout={measureChart}>
            {trend.map((w, i) => {
              const last = i === trend.length - 1;
              /*
                A week with nothing in it gets a deliberate stub rather than a
                one-pixel sliver. At 1pt the zero weeks read as the chart having
                failed to draw something; at 2pt and a fainter fill they read as
                what they are — a week nobody trained — which on this card is
                information, not an absence of it.
              */
              const empty = w.volume === 0;
              return (
                <View key={i} style={styles.trendSlot}>
                  <View
                    style={[
                      styles.trendBar,
                      {
                        height: empty ? 2 : Math.max(3, (w.volume / (trendMax || 1)) * TREND_H),
                        backgroundColor: empty
                          ? 'rgba(255,255,255,0.10)'
                          : last
                            ? zoneTint
                            : 'rgba(255,255,255,0.20)',
                      },
                    ]}
                  />
                </View>
              );
            })}
            {/*
              Drawn *after* the bars, on purpose.

              React Native stacks siblings in source order, and this line was
              written first — so every bar painted over it and the reference was
              visible only in the gaps between them. On a steady month, where
              every bar sits near the line, that is precisely when it vanished:
              the one case the line exists to explain. Same rule that puts
              `StatusScrim` last in `screen.tsx`; `zIndex` would not have helped,
              since it only reorders within a parent.
            */}
            {habitVolume > 0 && trendMax > 0 ? (
              <View
                style={[styles.habitLine, { bottom: (habitVolume / trendMax) * TREND_H }]}
                pointerEvents="none">
                <DashedRule width={chartW} colour={HABIT_COLOUR} />
              </View>
            ) : null}
          </View>
          <View style={styles.trendLabels}>
            <Text style={styles.trendEnd}>{vi ? '8 tuần trước' : '8 weeks ago'}</Text>
            <Text style={[styles.trendEnd, styles.trendNow]}>{vi ? 'tuần này' : 'this week'}</Text>
          </View>
        </View>
      )}

      {/*
        The session itself — a fact, under the interpretation of it, and a way
        through to the rest of them.

        The card was inert: every other widget on Today leads somewhere and this
        one ended in a full stop, even though `/sessions` now holds the whole log
        grouped by month. The chart above raises the obvious next question —
        *what were those weeks* — and this is the answer to it.
      */}
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={vi ? 'Xem tất cả buổi tập đã ghi' : 'See all logged workouts'}
        onPress={() => {
          Haptics.selectionAsync();
          nav.push('/sessions');
        }}
        style={styles.latestRow}>
        <View style={styles.latestIcon}>
          <Icon icon={Dumbbell} size={20} />
        </View>
        <View style={styles.latestInfo}>
          <View style={styles.latestTop}>
            <Text style={styles.latestName} numberOfLines={1}>
              {latest.template_name || (vi ? 'Buổi tập' : 'Workout')}
            </Text>
            <Text style={[styles.latestWhen, stale && styles.latestWhenStale]}>
              {whenLabel(age ?? 0, vi)}
            </Text>
          </View>
          <Text style={styles.latestMeta}>
            {sets.length} {vi ? 'set' : 'sets'}
            {` · ${kg(Number(latest.volume_load || 0))}`}
            {/* "RPE 8" is a term of art; "gắng sức 8/10" is the same number
                said in words the rest of the app already uses. */}
            {latest.session_rpe != null
              ? ` · ${vi ? 'gắng sức' : 'effort'} ${Number(latest.session_rpe)}/10`
              : ''}
          </Text>
        </View>
        <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
      </PressScale>

      {painFlags.length > 0 && (
        <View style={styles.painRow}>
          <Icon icon={AlertTriangle} size={13} color={colors.readinessYellow} />
          <Text style={styles.painText}>
            {i18n.dcTrainingPain}: {painFlags.map((p) => `${p.bodyPart} (${p.pain_0_10}/10)`).join(', ')}
          </Text>
        </View>
      )}

      <TrainingExplainer visible={help.open} onClose={help.close} />
    </GlassCard>
  );
}

// ─── WorkoutStatus (web dashboard/WorkoutStatus) ───────────────────────

export function WorkoutStatusCard({ planned }: { planned: number }) {
  const i18n = useI18n();
  const { data: workouts } = useRecentWorkouts();

  const todayStr = localDateStr();
  const todays = (workouts ?? []).filter(
    (w) => localDateStr(new Date(w.date_time)) === todayStr,
  );
  const done = todays.length;
  const allDone = planned > 0 && done >= planned;
  const pct = planned > 0 ? Math.min((done / planned) * 100, 100) : 0;

  return (
    <GlassCard style={styles.stackCard}>
      <MicroTitle icon={CalendarCheck}>{i18n.workoutStatusTitle}</MicroTitle>

      <View style={styles.statusRow}>
        <View style={styles.statusValueRow}>
          <Text style={styles.statusDone}>{done}</Text>
          <Text style={styles.statusPlanned}>/ {planned || '–'}</Text>
        </View>
        {allDone ? (
          <View style={styles.doneBadge}>
            <Icon icon={CheckCircle2} size={13} color={colors.readinessGreen} />
            <Text style={styles.doneText}>{i18n.workoutStatusDone}</Text>
          </View>
        ) : done === 0 && planned > 0 ? (
          <View style={styles.notYetRow}>
            <Icon icon={Clock} size={13} color={colors.mutedForeground} />
            <Text style={styles.notYetText}>{i18n.workoutStatusNotYet}</Text>
          </View>
        ) : null}
      </View>

      {planned > 0 && (
        <ProgressBar pct={pct} color={colors.primary} height={6} radius={3} trackColor="rgba(24,24,27,0.3)" style={styles.statusTrack} />
      )}

      {todays.length > 0 && (
        <View style={styles.chipRow}>
          {todays.map((w, i) => (
            <View key={i} style={styles.nameChip}>
              <Text style={styles.nameChipText}>{w.template_name || 'Workout'}</Text>
            </View>
          ))}
        </View>
      )}
    </GlassCard>
  );
}

// ─── RecentAwards (web dashboard/RecentAwards) ─────────────────────────

const AWARD_ICON: Record<string, LucideIcon> = {
  flame: Flame,
  dumbbell: Dumbbell,
  trophy: Trophy,
  calendar: CalendarCheck,
  target: Target,
  moon: Moon,
  footprints: Footprints,
  beef: Beef,
};

const TIER_COLOR: Record<string, string> = {
  bronze: '#c47b3d',
  silver: '#c7cad1',
  gold: '#ffd93d',
  platinum: '#b45cff',
};

export function RecentAwardsCard() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { data: awards } = useRecentAwards(3);

  if (!awards || awards.length === 0) return null;

  return (
    <GlassCard style={styles.stackCard}>
      <View style={styles.headRow}>
        <MicroTitle icon={Trophy}>{i18n.dcRecentAwards}</MicroTitle>
        <Pressable
          hitSlop={8}
          style={styles.viewAll}
          onPress={() => { Haptics.selectionAsync(); nav.push('/awards'); }}>
          <Text style={styles.viewAllText}>{i18n.dcViewAll}</Text>
          <Icon icon={ChevronRight} size={12} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.awardList}>
        {awards.map((a) => {
          const AIcon = AWARD_ICON[a.icon ?? ''] ?? Trophy;
          const tint = TIER_COLOR[a.tier ?? ''] ?? colors.mutedForeground;
          const { title, desc } = awardText(a.award_key, lang, { title: a.title, desc: a.description });
          return (
            <View key={a.id} style={styles.awardRow}>
              <View style={[styles.awardIcon, { borderColor: `${tint}55`, backgroundColor: `${tint}14` }]}>
                <Icon icon={AIcon} size={17} color={tint} />
              </View>
              <View style={styles.awardInfo}>
                <Text style={styles.awardTitle} numberOfLines={1}>{title}</Text>
                {desc ? <Text style={styles.awardDesc} numberOfLines={1}>{desc}</Text> : null}
              </View>
              <Text style={[styles.awardTier, { color: tint }]}>{a.tier}</Text>
            </View>
          );
        })}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  stackCard: { gap: spacing.md },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headAccessories: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  microRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  microTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.mutedForeground,
  },
  countText: { fontSize: 11, fontFamily: 'Menlo', color: colors.mutedForeground },

  // Biometrics
  connRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  connText: { fontSize: 11, color: colors.mutedForeground, textTransform: 'capitalize' },
  bioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 4 },
  bioTile: {
    width: '47.5%',
    flexDirection: 'row',
    gap: spacing.sm + 2,
    /*
      Cùng cặp token với ô macro bên Dinh dưỡng, và cùng lý do đã đo ở đó.

      Hai giá trị cũ — nền `rgba(24,24,27,0.2)`, viền `rgba(43,43,49,0.2)` —
      là bản chép của đúng cặp đã làm ô macro tan vào thẻ. Đo trên mặt thẻ
      #0e0e11: nền ra 1.015 và không cách nào cứu được (ngay cả alpha 0.9 chỉ
      lên 1.077, đổi sang nền tối hơn cũng chỉ 1.045) — thẻ và mọi nền ứng
      viên đều gần như đen. Viền thì lên 1.46 ở trắng 14%.

      Nên thứ vẽ ra cái ô là VIỀN, không phải nền. `glass.bg`/`glass.border`
      là cặp app đã dùng cho mọi khối nổi trên nền tối.
    */
    backgroundColor: glass.bg,
    borderRadius: radius.sm,
    padding: spacing.sm + 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: glass.border,
  },
  bioTileInfo: { flex: 1, minWidth: 0, gap: 2 },
  bioValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  bioValue: { fontSize: 19, fontFamily: 'Menlo', fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  bioUnit: { fontSize: 11, color: colors.mutedForeground },
  bioLabel: { fontSize: 11, color: colors.mutedForeground },

  // Training
  prBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,217,61,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,217,61,0.2)',
  },
  prText: { fontSize: 12, fontWeight: '700', color: colors.readinessYellow },
  latestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  latestIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,175,189,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168,175,189,0.2)',
  },
  latestInfo: { flex: 1, minWidth: 0, gap: 2 },
  latestTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  latestName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.foreground },
  /* The fact the card was missing entirely. Muted while it is recent, amber
     once it is outside the window the numbers above are computed over — the
     colour is the difference between "trained Tuesday" and "has not trained". */
  latestWhen: { fontSize: 11, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  latestWhenStale: { color: colors.readinessYellow, fontWeight: '600' },
  latestMeta: { fontSize: 12, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  emptyLine: { fontSize: 13, lineHeight: 19, color: colors.mutedForeground },
  /* The sentence, and what to do about it. Tinted by zone and outlined rather
     than filled: it is the loudest thing on the card and it is still text, so
     it should read as a highlighted paragraph and not as an alert. */
  verdict: {
    gap: 4,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  verdictLine: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  verdictWhy: { fontSize: 12, lineHeight: 17, color: colors.mutedForeground },
  /* The two quantities the sentence compares, in one unit so the division is
     visible. Same shape as the old week row; what changed is that the right
     cell is now the thing the left cell is being measured against, rather than
     a second unrelated fact. */
  compareRow: { flexDirection: 'row', alignItems: 'flex-start' },
  compareCell: { flex: 1, gap: 1 },
  compareDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: spacing.md,
    backgroundColor: colors.border,
  },
  compareLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: colors.mutedForeground },
  compareValue: {
    fontSize: 17,
    fontFamily: 'Menlo',
    fontWeight: '700',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  /* The baseline is context, not a score — it should not compete with the
     number being judged against it. */
  compareValueMuted: { color: colors.mutedForeground },
  compareSub: { fontSize: 11, color: colors.mutedForeground },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  strengthLabel: { flex: 1, fontSize: 12, color: colors.mutedForeground },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)' },
  pipOn: { backgroundColor: colors.metricBeige },
  strengthCount: { fontSize: 12, fontWeight: '600', color: colors.mutedForeground, minWidth: 26, textAlign: 'right' },
  strengthCountOn: { color: colors.metricBeige },
  staleNote: { fontSize: 12, lineHeight: 17, color: colors.readinessYellow },
  trend: { gap: 6 },
  trendHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  trendTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: colors.mutedForeground },
  /* Bars grow from the baseline, so they are bottom-aligned and the habit line
     is positioned from the bottom too — one origin for both, or the line and
     the bars would be measuring from different places. */
  /* 6pt between bars, not 4. Eight bars across a 350pt card at a 4pt gap are
     40pt wide each, which reads as a grid of blocks rather than a chart. */
  trendChart: { height: TREND_H, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  trendSlot: { flex: 1, justifyContent: 'flex-end' },
  trendBar: { borderRadius: 3, minHeight: 1 },
  /* The box the rule is drawn into. It carries no border of its own — the line
     is an `<Svg>` child, because a dashed *border* silently draws nothing on
     iOS (see `DashedRule`). */
  habitLine: { position: 'absolute', left: 0, right: 0, height: 1 },
  trendLabels: { flexDirection: 'row', alignItems: 'center' },
  trendEnd: { flex: 1, fontSize: 11, color: colors.mutedForeground },
  trendNow: { textAlign: 'right', fontWeight: '600', color: colors.foreground },
  trendKey: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendKeyText: { fontSize: 11, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  painRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,217,61,0.1)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,217,61,0.2)',
  },
  painText: { flex: 1, fontSize: 12, color: colors.readinessYellow },

  // Workout status
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  statusDone: { fontSize: 30, fontFamily: 'Menlo', fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  statusPlanned: { fontSize: 14, color: colors.mutedForeground },
  doneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(43,245,168,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,245,168,0.2)',
  },
  doneText: { fontSize: 12, fontWeight: '600', color: colors.readinessGreen },
  notYetRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  notYetText: { fontSize: 12, color: colors.mutedForeground },
  statusTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(24,24,27,0.3)', overflow: 'hidden' },
  statusFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nameChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(168,175,189,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168,175,189,0.2)',
  },
  nameChipText: { fontSize: 11, fontWeight: '500', color: colors.primary },

  // Nudges
  nudgeList: { gap: spacing.sm + 2 },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    backgroundColor: 'rgba(24,24,27,0.15)',
    borderRadius: radius.sm,
    padding: spacing.sm + 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.2)',
    overflow: 'hidden',
  },
  nudgeAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2 },
  nudgeInfo: { flex: 1, minWidth: 0, gap: 3 },
  nudgeMsg: { fontSize: 14, color: colors.foreground, lineHeight: 19 },
  nudgeMeta: { fontSize: 11, color: colors.mutedForeground },

  // Awards
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontSize: 12, color: colors.primary },
  awardList: { gap: spacing.sm + 2 },
  awardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  awardIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  awardInfo: { flex: 1, minWidth: 0, gap: 1 },
  awardTitle: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  awardDesc: { fontSize: 11, color: colors.mutedForeground },
  awardTier: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
});
