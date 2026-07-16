import { StyleSheet, Text } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, type } from '@/constants/ascnd';

export default function WorkoutsScreen() {
  return (
    <Screen title="Workouts">
      <GlassCard>
        <Text style={styles.cardTitle}>This week</Text>
        <Text style={styles.cardHint}>Workout builder and routine planner port here next</Text>
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.headline, color: colors.foreground },
  cardHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
});
