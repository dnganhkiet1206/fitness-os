import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useAwards } from '@/hooks/use-extras';

const TIER_COLOR: Record<string, string> = {
  gold: '#e6b93d',
  silver: '#a8b2c4',
  bronze: '#c47b3d',
};

export default function AwardsScreen() {
  const { data: awards } = useAwards();
  const i18n = useI18n();

  return (
    <Screen title={i18n.nAwards}>
      {awards && awards.length > 0 ? (
        awards.map((a) => (
          <GlassCard key={a.id} style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.iconWrap, { borderColor: TIER_COLOR[a.tier ?? ''] ?? colors.border }]}>
                <Text style={styles.icon}>{a.icon ?? '🏆'}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.title}>{a.title}</Text>
                {a.description ? <Text style={styles.hint}>{a.description}</Text> : null}
                <Text style={styles.date}>
                  {new Date(a.earned_at).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
            </View>
          </GlassCard>
        ))
      ) : (
        <GlassCard>
          <Text style={styles.title}>{i18n.nNoAwards}</Text>
          <Text style={styles.hint}>{i18n.nNoAwardsHint}</Text>
        </GlassCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  icon: { fontSize: 24 },
  info: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...type.headline, color: colors.foreground },
  hint: { ...type.footnote, color: colors.mutedForeground },
  date: { ...type.caption, color: colors.mutedForeground },
});
