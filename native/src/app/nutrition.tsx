import { StyleSheet, Text } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, type } from '@/constants/ascnd';

export default function NutritionScreen() {
  return (
    <Screen title="Nutrition">
      <GlassCard>
        <Text style={styles.cardTitle}>Today's meals</Text>
        <Text style={styles.cardHint}>Meal logging ports here next — Supabase hooks are shared with the web app</Text>
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.headline, color: colors.foreground },
  cardHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
});
