import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useSupplementChecklist, useToggleSupplement } from '@/hooks/use-library';

export default function SupplementsScreen() {
  const { data: supplements } = useSupplementChecklist();
  const toggle = useToggleSupplement();
  const i18n = useI18n();

  const takenCount = (supplements ?? []).filter((s) => s.taken).length;

  return (
    <Screen back title={i18n.nSupplements}>
      {supplements && supplements.length > 0 ? (
        <>
          <GlassCard>
            <Text style={styles.title}>{i18n.nToday}</Text>
            <Text style={styles.big}>
              {takenCount} / {supplements.length}
            </Text>
            <Text style={styles.hint}>{i18n.nTakenToday}</Text>
          </GlassCard>
          {supplements.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => toggle.mutate({ supplementId: s.id, taken: !s.taken })}>
              <GlassCard style={styles.itemCard}>
                <View style={styles.row}>
                  <View style={[styles.checkbox, s.taken && styles.checkboxOn]}>
                    {s.taken && <Icon icon={Check} size={15} color="#fff" strokeWidth={3} />}
                  </View>
                  <View style={styles.info}>
                    <Text style={[styles.title, s.taken && styles.muted]}>{s.name}</Text>
                    <Text style={styles.hint}>
                      {[s.dose_text, s.timing].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            </Pressable>
          ))}
        </>
      ) : (
        <GlassCard>
          <Text style={styles.title}>{i18n.nNoSupplements}</Text>
          <Text style={styles.hint}>{i18n.nNoSupplementsHint}</Text>
        </GlassCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.headline, color: colors.foreground },
  hint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
  big: { ...type.largeTitle, color: colors.foreground, marginTop: spacing.sm },
  muted: { color: colors.mutedForeground },
  itemCard: { paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  info: { flex: 1, minWidth: 0 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.readinessGreen, borderColor: colors.readinessGreen },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
