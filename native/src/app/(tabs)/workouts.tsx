import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronRight, Dumbbell, Flame, Plus, Trash2 } from 'lucide-react-native';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useDeleteWorkoutTemplate, useWorkoutTemplates } from '@/hooks/use-library';
import { getLocale } from '@/lib/i18n';

interface TplExercise {
  sets?: number;
  reps?: number;
  weight?: number;
}

function volume(exercises: unknown): number {
  if (!Array.isArray(exercises)) return 0;
  return (exercises as TplExercise[]).reduce(
    (s, e) => s + (e.sets || 0) * (e.reps || 0) * (e.weight || 0),
    0,
  );
}

/**
 * Workouts tab — faithful port of the web /workouts page
 * (WorkoutBuilder): template manager with Exercises + Create actions
 * and the Weekly Plan link at the bottom.
 */
export default function WorkoutsScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const { data: templates } = useWorkoutTemplates();
  const { data: sessions } = useWorkoutSessions(14);
  const del = useDeleteWorkoutTemplate();

  const confirmDelete = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(i18n.nDeleteTemplate, '', [
      { text: i18n.nCancel, style: 'cancel' },
      { text: i18n.nDeleteTemplate, style: 'destructive', onPress: () => del.mutate(id) },
    ]);
  };

  return (
    <Screen title={i18n.workoutsTitle}>
      {/* "Templates (N)" + actions row (web) */}
      <View style={styles.actionsRow}>
        <Text style={styles.sectionLabel}>
          {i18n.workoutsTemplates} ({templates?.length ?? 0})
        </Text>
        <View style={styles.actionButtons}>
          <Pressable
            style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/exercises');
            }}>
            <Icon icon={Dumbbell} size={14} color={colors.foreground} />
            <Text style={styles.outlineBtnText}>{i18n.workoutsExercises}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/workout-builder');
            }}>
            <Icon icon={Plus} size={14} color={colors.primaryForeground} strokeWidth={2.5} />
            <Text style={styles.primaryBtnText}>{i18n.workoutsCreateNew}</Text>
          </Pressable>
        </View>
      </View>

      {/* Log workout — native carries this next to templates for daily use */}
      <Pressable
        style={({ pressed }) => [styles.logChip, pressed && styles.pressed]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/log-workout');
        }}>
        <Icon icon={Plus} size={12} color="rgba(237,237,237,0.6)" strokeWidth={2.5} />
        <Text style={styles.logChipText}>{i18n.nLogWorkoutBtn}</Text>
      </Pressable>

      {/* Template cards (web glass-card rows) */}
      {templates && templates.length > 0 ? (
        templates.map((t) => {
          const raw = (t as { exercises?: unknown }).exercises;
          const exs: TplExercise[] = Array.isArray(raw) ? (raw as TplExercise[]) : [];
          return (
            <GlassCard key={t.id} style={styles.tplCard}>
              <View style={styles.tplRow}>
                <View style={styles.tplInfo}>
                  <View style={styles.tplTitleRow}>
                    <Icon icon={Dumbbell} size={16} color={colors.primary} />
                    <Text style={styles.tplName} numberOfLines={1}>{t.name}</Text>
                    {t.type ? (
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeText}>{t.type}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.tplMeta}>
                    {exs.length} {i18n.workoutsExercises} · {i18n.workoutsVolume}: {volume(exs).toLocaleString()} kg
                  </Text>
                </View>
                <View style={styles.tplActions}>
                  <Pressable hitSlop={8} onPress={() => confirmDelete(t.id)}>
                    <Icon icon={Trash2} size={15} color={colors.mutedForeground} />
                  </Pressable>
                  <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
                </View>
              </View>
            </GlassCard>
          );
        })
      ) : (
        <View style={styles.empty}>
          <Icon icon={Dumbbell} size={48} color="rgba(107,107,107,0.35)" />
          <Text style={styles.emptyTitle}>{i18n.workoutsNoTemplates}</Text>
          <Text style={styles.emptyHint}>Tap + to create your first template</Text>
        </View>
      )}

      {/* Logged sessions (last 14 days) — proof that saved logs landed */}
      {sessions && sessions.length > 0 && (
        <View style={styles.sessionsWrap}>
          <Text style={styles.sectionLabel}>
            {vi ? 'Buổi tập gần đây' : 'Recent sessions'} ({sessions.length})
          </Text>
          <GlassCard style={styles.sessionsCard}>
            {sessions.map((s, i) => (
              <View key={s.id} style={[styles.sessionRow, i > 0 && styles.sessionBorder]}>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionName} numberOfLines={1}>{s.template_name || 'Workout'}</Text>
                  <Text style={styles.sessionMeta}>
                    {new Date(s.date_time).toLocaleDateString(getLocale(lang), {
                      weekday: 'short', day: 'numeric', month: 'short',
                    })}
                    {s.volume_load != null ? `  ·  ${Math.round(Number(s.volume_load)).toLocaleString()} kg` : ''}
                  </Text>
                </View>
                {s.session_rpe != null && (
                  <View style={styles.rpeBadge}>
                    <Icon icon={Flame} size={11} color={colors.metricOrange} />
                    <Text style={styles.rpeText}>RPE {s.session_rpe}</Text>
                  </View>
                )}
              </View>
            ))}
          </GlassCard>
        </View>
      )}

      {/* Weekly plan link (web bottom button) */}
      <Pressable
        style={({ pressed }) => [styles.weeklyBtn, pressed && styles.pressed]}
        onPress={() => {
          Haptics.selectionAsync();
          router.push('/routine');
        }}>
        <Text style={styles.weeklyBtnText}>{i18n.workoutsWeeklyPlan}</Text>
        <Icon icon={ChevronRight} size={16} color={colors.foreground} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  actionButtons: { flexDirection: 'row', gap: spacing.sm },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.2)',
  },
  outlineBtnText: { fontSize: 13, fontWeight: '500', color: colors.foreground },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  primaryBtnText: { fontSize: 13, fontWeight: '600', color: colors.primaryForeground },
  logChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.3)',
    backgroundColor: 'rgba(24,24,27,0.2)',
  },
  logChipText: { fontSize: 13, fontWeight: '500', color: colors.foreground },
  tplCard: { padding: spacing.md },
  tplRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
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
  empty: { alignItems: 'center', paddingVertical: spacing.xl * 2, gap: spacing.sm },
  emptyTitle: { ...type.body, fontWeight: '500', color: colors.mutedForeground },
  emptyHint: { fontSize: 12, color: 'rgba(107,107,107,0.6)' },
  sessionsWrap: { gap: spacing.sm },
  sessionsCard: { paddingVertical: 4 },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  sessionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sessionInfo: { flex: 1, minWidth: 0, gap: 2 },
  sessionName: { fontSize: 14, fontWeight: '500', color: colors.foreground },
  sessionMeta: { fontSize: 11, color: colors.mutedForeground, fontVariant: ['tabular-nums'], textTransform: 'capitalize' },
  rpeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(241,123,39,0.12)',
  },
  rpeText: { fontSize: 10, fontWeight: '600', color: colors.metricOrange, fontVariant: ['tabular-nums'] },
  weeklyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.2)',
  },
  weeklyBtnText: { fontSize: 14, fontWeight: '500', color: colors.foreground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
