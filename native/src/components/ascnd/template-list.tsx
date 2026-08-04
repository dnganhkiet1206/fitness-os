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

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import { rise } from '@/lib/entrance';
import { displayWeight, type WeightUnit } from '@/lib/units';

/**
 * The saved workouts, as one list.
 *
 * ── why it lives here and not in the tab ──
 *
 * Two screens show these rows: the Workouts tab, which shows the first few,
 * and `/templates`, which shows every one. Written twice they would drift —
 * one would gain the expand-in-place and the other would keep a chevron that
 * does nothing, which is the exact bug this row was built to fix.
 */

export interface TplExercise {
  exerciseName?: string;
  sets?: number;
  reps?: number;
  weight?: number;
  rpe?: number;
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
 * ── one list, not a card each ──
 *
 * Every template used to be its own `GlassCard`, so three saved routines were
 * three floating panels with a gap of page between them. Two things went wrong
 * with that. The gaps read as *separations* — as though each card were a
 * different kind of thing — when the whole point is that these are peers, one
 * list of the workouts you have written. And a card is a heavy container for
 * two lines of text: rounded corners, a border and a fill, repeated per row,
 * spent on saying "this row ends and the next begins", which a hairline says
 * for a fraction of the ink.
 *
 * So the templates share one card and are divided by rules, exactly like the
 * recent-sessions block on the same tab — which is what makes the two read as
 * one screen rather than two designs.
 *
 * The press feedback changed with it. A row that scales on touch inside a
 * shared card detaches from its neighbours and looks broken; alone in its own
 * card it looked fine, which is why it was there. Rows dim instead.
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
  /** position in the list — drives the entrance stagger and the divider */
  index: number;
  wUnit: WeightUnit;
  wl: string;
  i18n: ReturnType<typeof useI18n>;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const raw = tpl.exercises;
  const exs: TplExercise[] = Array.isArray(raw) ? (raw as TplExercise[]) : [];

  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withTiming(open ? 1 : 0, { duration: OPEN_MS, easing: OPEN_EASE });
  }, [open, turn]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));

  return (
    <Animated.View
      entering={rise(index)}
      // The rule goes above every row but the first, so the list is divided
      // rather than boxed — the top and bottom edges belong to the card
      style={[styles.tplBlock, index > 0 && styles.tplDivider]}>
      <Pressable
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
        style={({ pressed }) => [styles.tplRow, pressed && styles.rowPressed]}>
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
          <Text style={styles.tplMeta}>
            {exs.length} {i18n.workoutsExercises} · {i18n.workoutsVolume}: {Math.round(displayWeight(volume(exs), wUnit)).toLocaleString()} {wl}
          </Text>
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
      </Pressable>

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
              style={styles.exRow}>
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
            </Animated.View>
          ))
        : null}
    </Animated.View>
  );
}

/** The card the rows live in — one container, however many workouts. */
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
    <GlassCard style={styles.tplList}>
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
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  /* The card keeps its 20pt of side padding and gives up its vertical, so the
     first and last rows sit 4pt from the edge instead of 20 — the same trim the
     sessions card uses. */
  tplList: { paddingVertical: 4 },
  tplBlock: { paddingBottom: 2 },
  tplDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tplRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
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
  typeText: { fontSize: 10, color: colors.mutedForeground, textTransform: 'capitalize' },
  tplMeta: { fontSize: 12, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  tplActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  /* Indented to start under the template's name rather than under its icon, so
     the exercises read as belonging to the row above them. No rule of their
     own: the dividers between templates already say where each block ends, and
     a second weight of line inside them would compete with that. */
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 5,
    paddingLeft: spacing.lg,
  },
  exName: { fontSize: 13, color: colors.foreground, flex: 1, minWidth: 0 },
  exSets: { fontSize: 12, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  /* No scale. A row inside a shared card that shrinks on touch pulls away from
     the rules above and below it; dimming stays inside its own bounds. */
  rowPressed: { opacity: 0.6 },
});
