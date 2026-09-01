import * as Haptics from 'expo-haptics';
import { ChevronDown, Dumbbell, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import { useRise } from '@/lib/entrance';
import { DEFAULT_REST, DEFAULT_RPE, restLabel, uniformValue } from '@/lib/prescription';
import { displayWeight, type WeightUnit } from '@/lib/units';

/**
 * The saved workouts.
 *
 * ── why they live here and not in the tab ──
 *
 * Two screens show these cards: the Workouts tab, which shows the newest few,
 * and `/templates`, which shows every one. Written twice they would drift —
 * one would gain the expand-in-place and the other would keep a chevron that
 * does nothing, which is the exact bug this card was built to fix.
 */

export interface TplExercise {
  exerciseName?: string;
  sets?: number;
  reps?: number;
  weight?: number;
  rpe?: number;
  restSeconds?: number;
}

/**
 * Rest and effort, spelled out.
 *
 * ── they were being thrown away at the door ──
 *
 * The builder asks for both — a rest row and an effort row on every exercise —
 * and stores both. The card then showed sets, reps and load and nothing else,
 * so the two values you had to stop and think about were the two that never
 * came back. Setting them was, in effect, filling in a form that is filed
 * somewhere you cannot read.
 *
 * ── labelled, and nothing more than labelled ──
 *
 * `1:30` is not obviously a duration until it is called rest, and `8` on its
 * own is not a quantity of anything, so both carry their word. That is the
 * whole job.
 *
 * It briefly carried a gloss as well — "còn 2 rep", the reps you should have
 * left at that effort. It reads as a figure this card worked out, and the card
 * works nothing out: it reads back two numbers somebody typed into the builder.
 * A line that reports what was stored and a line that draws a conclusion from
 * it look identical once they sit next to each other, and only one of them is
 * something this component can stand behind.
 */
export function prescriptionLine(
  i18n: ReturnType<typeof useI18n>,
  rest: number,
  rpe: number,
): string {
  const restText = rest <= 0 ? i18n.nTplNoRest : i18n.nTplRest.replace('{x}', restLabel(rest));
  return `${restText}  ·  ${i18n.nTplEffort.replace('{x}', String(rpe))}`;
}

export interface Template {
  id: string;
  name: string;
  type?: string | null;
  exercises?: unknown;
  created_at?: string;
}

/**
 * Newest first.
 *
 * The query behind these is ordered by name, because the routine planner's
 * picker reads the same one and a picker is scanned by name. A list of what you
 * have built is not: the workout you saved a minute ago is the one you are
 * looking for, and alphabetical order hides it behind whatever starts with A.
 *
 * A copy, not a sort in place — the array belongs to react-query's cache, and
 * sorting it would reorder every other reader of that cache as a side effect.
 *
 * `created_at` missing sorts last rather than throwing the comparison off: an
 * empty string is below every real timestamp, which puts unknown-age rows at
 * the bottom where they cannot displace anything real.
 */
export function newestFirst<T extends Template>(templates: T[]): T[] {
  return [...templates].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

export function volume(exercises: unknown): number {
  if (!Array.isArray(exercises)) return 0;
  return (exercises as TplExercise[]).reduce(
    (s, e) => s + (e.sets || 0) * (e.reps || 0) * (e.weight || 0),
    0,
  );
}

/** Same duration and curve as the diary's meal cards — one behaviour to learn. */
const OPEN_MS = 260;
const OPEN_EASE = Easing.out(Easing.cubic);

/**
 * A saved template, and what is actually in it.
 *
 * ── the chevron was a promise nothing kept ──
 *
 * The card showed a name, a count of exercises and a volume figure, with a
 * `ChevronRight` at the end of the row. That glyph says "there is more, tap
 * here" — and it was not a button, and nothing happened. The only way to see
 * what a template contained was to remember, or to build it again.
 *
 * A count is the one thing about a routine that does not help: "6 exercises"
 * is true of every push day anybody has ever written. What you need to know
 * before starting one is which six.
 *
 * ── opening in place, not navigating ──
 *
 * The exercises are four short rows. Pushing a screen to show four rows costs a
 * transition each way and a place in the back stack, and lands somewhere you
 * then have to leave to compare against the next template. So the row grows,
 * the way the diary's meals do, with the same timing and the same rotating
 * chevron — `ChevronDown` now, since it no longer claims to go anywhere.
 *
 * ── a card each, separated ──
 *
 * These spent a version merged into one card divided by hairlines, on the
 * argument that a card is heavy furniture for two lines of text and that the
 * gaps between them read as separations. The heading and "See all" that came
 * out of that work stayed; the merge did not — it was the user's call and it is
 * the right one for what these are.
 *
 * A row in a divided list is an *entry*. A template is a thing you keep: it has
 * a name, a badge, a size, and it opens to show what is inside it. Giving each
 * one its own surface says that, and the gap between two of them is what makes
 * an opened one legible as a card that grew rather than as a list that got
 * longer in an unclear place.
 *
 * The recent-sessions block further down stays a divided list, and that is not
 * an inconsistency — a logged session is a line in a history, which is exactly
 * the thing a row in a list is for.
 *
 * Its own component because hooks cannot live inside a `.map`.
 */
export function TemplateRow({
  tpl,
  index,
  wUnit,
  wl,
  i18n,
  onDelete,
}: {
  tpl: Template;
  /** position in the list — the entrance staggers off it */
  index: number;
  wUnit: WeightUnit;
  wl: string;
  i18n: ReturnType<typeof useI18n>;
  onDelete: (id: string) => void;
}) {
  /* Lần vẽ đầu hiện NGAY — xem `useRise`. Hàng này nằm trong một danh sách có
     thể dài, nên `rise(index)` hoãn tới 600ms; chạy quãng hoãn ấy ở lần vẽ đầu
     là để lại một danh sách đã chiếm chỗ mà chưa nhìn thấy. */
  const rise = useRise();
  const [open, setOpen] = useState(false);
  const raw = tpl.exercises;
  const exs: TplExercise[] = Array.isArray(raw) ? (raw as TplExercise[]) : [];

  /*
    Said once for the workout, or once per exercise — never both.

    A workout built and saved without touching either row has the same 90
    seconds and the same effort 7 on all six exercises, and printing that six
    times is six lines that say nothing and one line that would have. Stated at
    the top it is a property of the workout, which is what it is; and the
    template where they genuinely differ is then the one that reads differently,
    which is the whole point of showing them.

    Rest and effort are judged separately, because a workout can easily hold
    one rest throughout and a heavier effort on the compound at the front.
  */
  const setCount = exs.reduce((n, e) => n + (e.sets ?? 0), 0);

  const oneRest = uniformValue(exs, (e) => e.restSeconds, DEFAULT_REST);
  const oneRpe = uniformValue(exs, (e) => e.rpe, DEFAULT_RPE);
  const sharedLine = oneRest !== null && oneRpe !== null ? prescriptionLine(i18n, oneRest, oneRpe) : null;

  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withTiming(open ? 1 : 0, { duration: OPEN_MS, easing: OPEN_EASE });
  }, [open, turn]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));

  return (
    <Animated.View entering={rise(index)}>
      <GlassCard style={styles.tplCard}>
        <PressScale
          accessibilityRole="button"
          accessibilityState={{ expanded: open, disabled: exs.length === 0 }}
          /*
            Guarded here rather than with `disabled`.

            The delete button is a `Pressable` inside this one, and whether RN's
            `disabled` blocks a nested pressable is a detail I could not verify
            without a device. Returning early cannot: an empty template does
            nothing when tapped, and its delete button keeps working either way.
          */
          onPress={() => {
            if (exs.length === 0) return;
            Haptics.selectionAsync();
            setOpen((v) => !v);
          }}
          style={styles.tplRow}>
          <View style={styles.tplInfo}>
            <View style={styles.tplTitleRow}>
              <Icon icon={Dumbbell} size={16} />
              <Text style={styles.tplName} numberOfLines={1}>{tpl.name}</Text>
              {tpl.type ? (
                <View style={styles.typeBadge}>
                  <Text style={styles.typeText}>{tpl.type}</Text>
                </View>
              ) : null}
            </View>
            {/*
              Số HIỆP, không phải số KG.

              Mặt thẻ trước đây in "Khối lượng: 0 kg". Hai thứ sai cùng lúc.

              Thứ nhất, khối lượng là KẾT QUẢ của một buổi đã tập — tổng
              tạ × lần × hiệp của việc đã xảy ra. Mẫu tập thì chưa xảy ra: nó
              là thứ bạn gán cho hôm nay. In một tổng thành tích lên mặt một
              bản kế hoạch làm nó đọc ra như một dòng trong lịch sử tập, đúng
              thứ nó không phải.

              Thứ hai, với mẫu chưa điền tạ thì tổng ấy bằng 0, và "Khối lượng:
              0 kg" là một tuyên bố rỗng. Chính tệp `workouts/index.tsx` đã
              viết ra luật này cho cái đếm ngay bên trên: nó không bao giờ in
              "(0)", "một tuyên bố về danh sách chưa hề tới".

              Số hiệp thì là thứ có thật trong bản kế hoạch, và là con số bạn
              cần khi cân xem hôm nay có kham nổi buổi này không. Tạ vẫn còn —
              ở trong nếp gấp, theo từng bài, nơi nó là lời dặn chứ không phải
              thành tích.
            */}
            <Text style={styles.tplMeta}>
              {exs.length} {i18n.workoutsExercises} · {setCount} {i18n.nSetsShort}
            </Text>
            {/*
              On the face of the card, not inside the fold.

              This is the line the whole change is for: it has to be readable
              without tapping anything, or it is in the same place it was
              before — stored, and invisible.
            */}
            {sharedLine ? <Text style={styles.tplRx}>{sharedLine}</Text> : null}
          </View>
          <View style={styles.tplActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={i18n.a11yDelete}
              hitSlop={8}
              onPress={() => onDelete(tpl.id)}>
              <Icon icon={Trash2} size={15} color={colors.mutedForeground} />
            </Pressable>
            {/* No chevron on an empty template: there is nothing to open, and a
                control that does nothing is what this row had before. */}
            {exs.length > 0 ? (
              <Animated.View style={chevron}>
                <Icon icon={ChevronDown} size={16} color={colors.mutedForeground} />
              </Animated.View>
            ) : null}
          </View>
        </PressScale>

        {/*
          Mounted only when open, rather than kept in a clipped box.

          The first version animated a measured height, the way the diary's meal
          cards do. It did not show anything, and I could not find out why from
          reading the two — they are structurally the same. Rather than keep
          guessing at a measurement I cannot observe without a device, this drops
          the measurement: rows that are mounted are laid out, and there is no
          box that can be zero high while holding them.

          The rows below still get pushed down, because adding rows is a real
          layout change. A `LinearTransition` would have been the tidier-looking
          answer and is the wrong one — it animates the moving view and leaves its
          siblings where they were, which was measured on this project at a 94px
          hole.

          The movement is per row instead: each slides in on a short stagger, so
          opening reads as the list arriving rather than as the row snapping to a
          new size.
        */}
        {open
          ? exs.map((e, i) => (
              <Animated.View
                key={`${e.exerciseName ?? 'x'}-${i}`}
                entering={FadeInDown.duration(OPEN_MS).delay(Math.min(i, 8) * 35)}
                style={styles.exBlock}>
                <View style={styles.exRow}>
                  <Text style={styles.exName} numberOfLines={1}>
                    {e.exerciseName || i18n.workoutsExercises}
                  </Text>
                  {/* "3 × 10" and then the load, because sets and reps are the
                      shape of the work and the weight is how hard it is. A
                      bodyweight movement carries no number rather than a zero. */}
                  <Text style={styles.exSets}>
                    {e.sets ?? 0} × {e.reps ?? 0}
                    {e.weight ? `  ·  ${Math.round(displayWeight(e.weight, wUnit))} ${wl}` : ''}
                  </Text>
                </View>
                {/*
                  Only when the workout does not have one answer for both — the
                  card already said it in that case, and saying it again under
                  every exercise is how a detail that matters becomes wallpaper.
                */}
                {sharedLine ? null : (
                  <Text style={styles.exRx}>
                    {prescriptionLine(i18n, e.restSeconds ?? DEFAULT_REST, e.rpe ?? DEFAULT_RPE)}
                  </Text>
                )}
              </Animated.View>
            ))
          : null}
      </GlassCard>
    </Animated.View>
  );
}

/**
 * The stack of cards.
 *
 * The gap is 12, not the page's 20.
 *
 * `spacing.stack` is the distance between *sections* — the library grid and the
 * workout list and the recent sessions, each a different subject. These cards
 * are not that: they are siblings under one heading, and spacing them as far
 * apart as the things they sit between makes the heading stop looking like it
 * covers all three.
 *
 * Closer than the page, further than a divided list. That is the whole job of
 * this number: enough air that an opened card is obviously one card, little
 * enough that three of them read as a group.
 */
export function TemplateList({
  templates,
  wUnit,
  wl,
  i18n,
  onDelete,
}: {
  templates: Template[];
  wUnit: WeightUnit;
  wl: string;
  i18n: ReturnType<typeof useI18n>;
  onDelete: (id: string) => void;
}) {
  return (
    <View style={styles.tplStack}>
      {templates.map((t, i) => (
        <TemplateRow
          key={t.id}
          tpl={t}
          index={i}
          wUnit={wUnit}
          wl={wl}
          i18n={i18n}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tplStack: { gap: spacing.sm + 4 },
  /* Tighter than the card default (20), because the card holds two lines of
     text and a chevron — 20 all round would leave it mostly empty. */
  tplCard: { padding: spacing.md },
  tplRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  tplInfo: { flex: 1, minWidth: 0, gap: 4 },
  tplTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tplName: { fontSize: 14, fontWeight: '500', color: colors.foreground, flexShrink: 1 },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  typeText: { fontSize: 11, color: colors.mutedForeground, textTransform: 'capitalize' },
  tplMeta: { fontSize: 12, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  tplActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  /* The prescription on the face of the card, under the count and volume.
     Same size and colour as the line above it because it is the same kind of
     fact — what this workout is — and a brighter one would make rest and
     effort look more important than the exercises they belong to. */
  tplRx: {
    fontSize: 12,
    color: colors.mutedForeground,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  /* A rule above each exercise, because they are inside the card with the
     header and need something to separate them from it. This is a line
     *within* one card, not between two, so it cannot be mistaken for a card
     boundary.

     It sits on the block rather than on the name row: the block is one
     exercise — its name, its sets, and its rest and effort when those differ
     from exercise to exercise — and a rule between an exercise and its own
     second line would cut it in half. */
  exBlock: {
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  exName: { fontSize: 13, color: colors.foreground, flex: 1, minWidth: 0 },
  exSets: { fontSize: 12, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  /* Dimmer than the sets line and indented by nothing: it is a note about the
     row above it, not a second row. */
  exRx: {
    fontSize: 11,
    color: colors.mutedForeground,
    opacity: 0.75,
    fontVariant: ['tabular-nums'],
    marginTop: 3,
  },
});
