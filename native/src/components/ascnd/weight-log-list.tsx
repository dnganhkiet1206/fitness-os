import * as Haptics from 'expo-haptics';
import { ChevronDown, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { colors, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import { useDeleteWeight } from '@/hooks/use-fitness-data';
import { getLocale } from '@/lib/i18n';
import { toast } from '@/lib/toast';

/** Same duration and curve as the diary's meal cards — see `today-meals.tsx`. */
const OPEN_MS = 260;
const OPEN_EASE = Easing.out(Easing.cubic);

/**
 * The weights behind the chart, and the only way to remove one.
 *
 * ── why it exists ──
 *
 * Weight was visible as a line and a set of tiles and nowhere as a list of
 * numbers. That is fine until one of them is wrong. `useLogWeight` upserts on
 * `(user_id, date)`, so today's entry can be fixed by logging it again; no
 * earlier day can be, because nothing in the app enters a weight for a past
 * date. A slip of 75 → 175 sets the chart's scale, the change stat and the BMI
 * band, so one bad number makes every number near it unreadable, permanently.
 *
 * Reading the values is worth something on its own, but correcting them is what
 * this is for.
 *
 * ── closed by default ──
 *
 * The chart is the answer to "how is it going"; this is the answer to "that one
 * is wrong". Ninety days of entries above the rest of the tab would bury the
 * part people came for, so it opens the way the diary's meals do, with the same
 * timing — one behaviour to learn, not two.
 *
 * ── newest first ──
 *
 * The chart runs oldest → newest because time does. A list of entries is read
 * to find one, and the one being looked for is nearly always recent.
 */
export function WeightLogList({
  points,
  unit,
  i18n,
  lang,
}: {
  /**
   * Oldest first, already in the display unit — the Progress tab converts once
   * for the chart and the tiles, and converting a second time here is how two
   * places on one screen end up disagreeing by a rounding step.
   *
   * `date` stays the canonical ISO day, because that is what identifies the row
   * to delete.
   */
  points: { date: string; value: number }[];
  /** the display unit's suffix, resolved by the caller for the same reason */
  unit: string;
  i18n: ReturnType<typeof useI18n>;
  lang: 'vi' | 'en';
}) {
  const [open, setOpen] = useState(false);
  const del = useDeleteWeight();

  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withTiming(open ? 1 : 0, { duration: OPEN_MS, easing: OPEN_EASE });
  }, [open, turn]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));

  if (points.length === 0) return null;

  const rows = [...points].reverse();

  /**
   * Ask before removing, and name the day.
   *
   * "Are you sure?" cannot be answered — it does not say what goes. Naming the
   * date and the value means a mistap on the wrong row is caught by reading the
   * alert rather than by noticing the chart change afterwards.
   */
  const confirm = (date: string, shown: string) => {
    Alert.alert(
      i18n.nDeleteWeight,
      i18n.nDeleteWeightMsg.replace('{x}', shown),
      [
        { text: i18n.cancel, style: 'cancel' },
        {
          text: i18n.delete,
          style: 'destructive',
          onPress: () =>
            del.mutate(date, {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                toast.success(i18n.deleted);
              },
              onError: (e: Error) => toast.error(e.message),
            }),
        },
      ],
    );
  };

  return (
    <GlassCard style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          Haptics.selectionAsync();
          setOpen((v) => !v);
        }}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}>
        <Text style={styles.title}>{i18n.nWeightHistory}</Text>
        {/* The count stays readable while folded, so the header says how much
            is behind it rather than only that something is. */}
        <Text style={styles.count}>
          {rows.length === 1
            ? i18n.nWeightEntriesOne
            : i18n.nWeightEntries.replace('{n}', String(rows.length))}
        </Text>
        <Animated.View style={chevron}>
          <Icon icon={ChevronDown} size={18} color={colors.mutedForeground} />
        </Animated.View>
      </Pressable>

      {open
        ? rows.map((p) => {
            // one decimal: the scale reads to 0.1, and 74.8 → "74.8kg"
            const shown = `${p.value.toFixed(1)}${unit}`;
            return (
              <View key={p.date} style={styles.row}>
                <Text style={styles.date}>
                  {new Date(`${p.date}T00:00:00`).toLocaleDateString(getLocale(lang), {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
                <Text style={styles.value}>{shown}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={i18n.a11yDelete}
                  hitSlop={10}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    confirm(p.date, shown);
                  }}
                  style={({ pressed }) => [styles.del, pressed && styles.pressed]}>
                  {/* Muted, not red — a destructive glyph on every row makes
                      deletion the loudest thing in a list that is not about
                      deleting. The red belongs on the confirm button. */}
                  <Icon icon={Trash2} size={15} color={colors.mutedForeground} />
                </Pressable>
              </View>
            );
          })
        : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 2, paddingVertical: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...type.headline, color: colors.foreground },
  count: { ...type.footnote, color: colors.mutedForeground, flex: 1, textAlign: 'right' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  date: { ...type.footnote, color: colors.mutedForeground, flex: 1 },
  value: {
    ...type.body,
    fontWeight: '600',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  del: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.9 },
});
