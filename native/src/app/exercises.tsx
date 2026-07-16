import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useExercises } from '@/hooks/use-library';

export default function ExercisesScreen() {
  const { data: exercises } = useExercises();
  const i18n = useI18n();
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (exercises ?? []).filter((e) => !q || e.name.toLowerCase().includes(q));
    const map = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const g = e.muscle_group ?? '—';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(e);
    }
    return [...map.entries()];
  }, [exercises, search]);

  return (
    <Screen title={i18n.nExercises}>
      <TextInput
        style={styles.search}
        placeholder={i18n.nSearchExercises}
        placeholderTextColor={colors.mutedForeground}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
      />
      {grouped.length > 0 ? (
        grouped.map(([group, list]) => (
          <View key={group} style={styles.group}>
            <Text style={styles.groupTitle}>{group}</Text>
            <GlassCard style={styles.groupCard}>
              {list.map((e, i) => (
                <View key={e.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
                  {e.equipment ? <Text style={styles.equipment}>{e.equipment}</Text> : null}
                </View>
              ))}
            </GlassCard>
          </View>
        ))
      ) : (
        <GlassCard>
          <Text style={styles.name}>{i18n.nNoExercises}</Text>
          <Text style={styles.equipment}>{i18n.nNoExercisesHint}</Text>
        </GlassCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 16,
  },
  group: { gap: spacing.sm },
  groupTitle: {
    ...type.footnote,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  groupCard: { paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  name: { ...type.body, color: colors.foreground, flex: 1 },
  equipment: { ...type.caption, color: colors.mutedForeground },
});
