import { Flame, Trash2 } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import { getLocale, type AppLang } from '@/lib/i18n';
import { displayWeight, weightLabel, type WeightUnit } from '@/lib/units';

export interface SessionSummary {
  id: string;
  date_time: string;
  template_name: string | null;
  session_rpe: number | null;
  volume_load: number | null;
}

/**
 * One logged workout, as a row.
 *
 * Lifted out of the Workouts tab when the tab started showing only the newest
 * three and a second screen took the rest. Two lists of the same thing drawn
 * by two pieces of code is how they end up disagreeing about the date format,
 * where the RPE badge sits, and whether the delete is a red glyph or a muted
 * one — differences nobody decides on and everybody notices.
 *
 * The group and the hairlines belong to whoever lays these out; a row draws
 * neither. Same arrangement as the food rows, and for the same reason: a
 * `marginLeft` to inset a border moves the whole row and the trailing column
 * stops lining up.
 */
export function SessionRow({
  session,
  wUnit,
  lang,
  i18n,
  onDelete,
}: {
  session: SessionSummary;
  wUnit: WeightUnit;
  lang: AppLang;
  i18n: ReturnType<typeof useI18n>;
  onDelete: (id: string, date_time: string, label: string) => void;
}) {
  const name = session.template_name || 'Workout';
  const day = new Date(session.date_time).toLocaleDateString(getLocale(lang), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const wl = weightLabel(wUnit);

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.meta}>
          {day}
          {session.volume_load != null
            ? `  ·  ${Math.round(displayWeight(Number(session.volume_load), wUnit)).toLocaleString()} ${wl}`
            : ''}
        </Text>
      </View>
      {session.session_rpe != null && (
        <View style={styles.rpeBadge}>
          <Icon icon={Flame} size={11} />
          <Text style={styles.rpeText}>RPE {session.session_rpe}</Text>
        </View>
      )}
      {/* Muted, like the template rows — a red glyph on every line would make
          deleting the loudest thing in a list that exists to show the training
          happened. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.a11yDelete}
        hitSlop={10}
        onPress={() => onDelete(session.id, session.date_time, `${name} · ${day}`)}
        style={({ pressed }) => [styles.del, pressed && styles.pressed]}>
        <Icon icon={Trash2} size={15} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  info: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 14, fontWeight: '500', color: colors.foreground },
  meta: {
    fontSize: 11,
    color: colors.mutedForeground,
    fontVariant: ['tabular-nums'],
    textTransform: 'capitalize',
  },
  rpeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,145,48,0.12)',
  },
  rpeText: { fontSize: 10, fontWeight: '600', color: colors.metricOrange, fontVariant: ['tabular-nums'] },
  // 28pt of ink with hitSlop 10 on top — 48pt of target, past the 44pt minimum
  del: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});

/** The group these rows sit in, and the hairline between two of them. */
export const sessionListStyles = StyleSheet.create({
  group: {
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md, backgroundColor: colors.border },
});
