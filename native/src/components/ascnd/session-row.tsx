import { Trash2 } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { colors, effortTint, radius, spacing } from '@/constants/ascnd';
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
 * where the effort badge sits, and whether the delete is a red glyph or a muted
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
  compactDate = false,
  volumeRatio,
}: {
  session: SessionSummary;
  wUnit: WeightUnit;
  lang: AppLang;
  i18n: ReturnType<typeof useI18n>;
  onDelete: (id: string, date_time: string, label: string) => void;
  /**
   * Drop the month from the date.
   *
   * Set by lists that are already grouped by month, where "Th 5, 6 thg 8" under
   * a heading reading THÁNG 8 spends a third of the line restating the heading.
   */
  compactDate?: boolean;
  /**
   * This session's volume as a fraction of the heaviest one on screen.
   *
   * Draws a short meter under the date line. Every row was the same shape and
   * the same weight of grey, so a fortnight of training was a wall of text you
   * had to read number by number to find the big day in. Omitted where there is
   * nothing to compare against — one row, or a list with no volumes.
   */
  volumeRatio?: number;
}) {
  const vi = lang === 'vi';
  const name = session.template_name || (vi ? 'Buổi tập' : 'Workout');
  const at = new Date(session.date_time);
  const day = at.toLocaleDateString(
    getLocale(lang),
    compactDate
      ? { weekday: 'short', day: 'numeric' }
      : { weekday: 'short', day: 'numeric', month: 'short' },
  );
  const wl = weightLabel(wUnit);
  const rpe = session.session_rpe;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.meta}>
            {day}
            {session.volume_load != null
              ? `  ·  ${Math.round(displayWeight(Number(session.volume_load), wUnit)).toLocaleString()} ${wl}`
              : ''}
          </Text>
          {/*
            The meter, inside the text column and 96pt wide.

            It was full-bleed across the row, under everything, and at that
            width a 2pt rule is a *separator* — which is what it looked like
            beside the real hairline between rows, on a screen whose whole job
            is to be scannable. Short and left-aligned under the line it
            measures, it can only be read as belonging to that line.
          */}
          {volumeRatio != null ? (
            <View style={styles.barTrack}>
              <View
                style={[styles.barFill, { width: `${Math.max(3, Math.min(volumeRatio, 1) * 100)}%` }]}
              />
            </View>
          ) : null}
        </View>
        {rpe != null && (
          /* Tinted by value, from the app's one effort ramp. A badge that is
             the same orange at 6 as at 10 is decoration — it takes up the
             position of a signal and carries none. */
          <View style={[styles.rpeBadge, { backgroundColor: `${effortTint(rpe)}1f` }]}>
            <Text style={[styles.rpeText, { color: effortTint(rpe) }]}>
              {vi ? 'gắng sức' : 'effort'} {rpe}
            </Text>
          </View>
        )}
        {/* Muted, like the template rows — a red glyph on every line would make
            deleting the loudest thing in a list that exists to show the training
            happened. */}
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yDelete}
          hitSlop={10}
          onPress={() => onDelete(session.id, session.date_time, `${name} · ${day}`)}
          style={styles.del}>
          <Icon icon={Trash2} size={15} color={colors.mutedForeground} />
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  info: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 14, fontWeight: '500', color: colors.foreground },
  meta: {
    fontSize: 11,
    color: colors.mutedForeground,
    fontVariant: ['tabular-nums'],
    textTransform: 'capitalize',
  },
  rpeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  rpeText: { fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },
  // 28pt of ink with hitSlop 10 on top — 48pt of target, past the 44pt minimum
  del: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  /* 96pt, not the row's width. See the comment at the call site: a 2pt rule
     spanning the whole row is a separator, whatever it was drawn to mean. */
  barTrack: { width: 96, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.09)', marginTop: 1 },
  barFill: { height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.32)' },
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
