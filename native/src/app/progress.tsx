import { StyleSheet, Text } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, type } from '@/constants/ascnd';

export default function ProgressScreen() {
  return (
    <Screen title="Progress">
      <GlassCard>
        <Text style={styles.cardTitle}>Trends</Text>
        <Text style={styles.cardHint}>Charts move to native (victory-native / Skia) in the next phase</Text>
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.headline, color: colors.foreground },
  cardHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
});
