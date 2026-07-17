import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Dumbbell, Plus, Trash2 } from 'lucide-react-native';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useDeleteWorkoutTemplate, useWorkoutTemplates } from '@/hooks/use-library';

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

export default function TemplatesScreen() {
  const i18n = useI18n();
  const { data: templates } = useWorkoutTemplates();
  const del = useDeleteWorkoutTemplate();

  const confirmDelete = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(i18n.nDeleteTemplate, '', [
      { text: i18n.nCancel, style: 'cancel' },
      { text: i18n.nDeleteTemplate, style: 'destructive', onPress: () => del.mutate(id) },
    ]);
  };

  return (
    <Screen back
      title={i18n.nTemplates}
      headerRight={
        <Pressable
          hitSlop={8}
          style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
          onPress={() => {
            Haptics.selectionAsync();
            router.push('/workout-builder');
          }}>
          <Icon icon={Plus} size={22} color={colors.primary} />
        </Pressable>
      }>
      {!templates || templates.length === 0 ? (
        <GlassCard>
          <View style={styles.empty}>
            <Icon icon={Dumbbell} size={40} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>{i18n.workoutsNoTemplates}</Text>
            <Pressable
              style={({ pressed }) => [styles.emptyBtn, pressed && styles.pressed]}
              onPress={() => router.push('/workout-builder')}>
              <Text style={styles.emptyBtnText}>{i18n.workoutsCreateNew}</Text>
            </Pressable>
          </View>
        </GlassCard>
      ) : (
        templates.map((t) => {
          const raw = (t as { exercises?: unknown }).exercises;
          const exs: TplExercise[] = Array.isArray(raw) ? (raw as TplExercise[]) : [];
          return (
            <GlassCard key={t.id} style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.cardInfo}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{t.name}</Text>
                    {t.type ? (
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeText}>{t.type}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardHint}>
                    {exs.length} {i18n.workoutsExercises} · {volume(exs).toLocaleString()} kg
                  </Text>
                </View>
                <Pressable hitSlop={8} onPress={() => confirmDelete(t.id)}>
                  <Icon icon={Trash2} size={18} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </GlassCard>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontSize: 22, color: colors.primary, lineHeight: 26 },
  empty: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  emptyIcon: { fontSize: 40 },
  emptyText: { ...type.body, color: colors.mutedForeground },
  emptyBtn: { marginTop: spacing.sm, height: 44, paddingHorizontal: spacing.xl, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { ...type.headline, color: colors.primaryForeground },
  card: { paddingVertical: spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  cardInfo: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { ...type.headline, color: colors.foreground, flexShrink: 1 },
  typeBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.secondary },
  typeText: { ...type.caption, color: colors.mutedForeground, textTransform: 'capitalize' },
  cardHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 4, fontVariant: ['tabular-nums'] },
  deleteIcon: { fontSize: 18, padding: 4 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
});
