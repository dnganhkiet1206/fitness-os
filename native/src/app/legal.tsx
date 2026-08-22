import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Segmented } from '@/components/ascnd/segmented';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings } from '@/hooks/use-app-settings';
import { rise } from '@/lib/entrance';
import { getLegal, type LegalDoc } from '@/lib/legal-content';

type Tab = 'terms' | 'privacy' | 'health' | 'data';

export default function LegalScreen() {
  const { lang } = useAppSettings();
  const legal = getLegal(lang);
  const [tab, setTab] = useState<Tab>('terms');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'terms', label: legal.tabTerms },
    { key: 'privacy', label: legal.tabPrivacy },
    { key: 'health', label: legal.tabHealth },
    { key: 'data', label: legal.tabData },
  ];
  const doc: LegalDoc = legal[tab];

  return (
    <Screen back title={legal.pageTitle}>
      <Segmented value={tab} onChange={setTab} options={tabs} />

      <Text style={styles.docTitle}>{doc.title}</Text>

      {doc.blocks.map((b, i) => (
        <Animated.View key={i} entering={rise(i)}>
          <GlassCard style={tab === 'health' && i === 0 ? styles.warnCard : undefined}>
            <Text style={styles.blockTitle}>{b.title}</Text>
            {b.body ? <Text style={styles.blockBody}>{b.body}</Text> : null}
            {b.intro ? <Text style={[styles.blockBody, styles.intro]}>{b.intro}</Text> : null}
            {b.bullets?.map((line, j) => (
              <View key={j} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))}
          </GlassCard>
        </Animated.View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  docTitle: { ...type.title, color: colors.foreground, marginTop: spacing.xs },
  warnCard: { borderColor: colors.readinessRed, borderWidth: 1 },
  blockTitle: { ...type.headline, color: colors.foreground, marginBottom: 4 },
  blockBody: { ...type.footnote, color: colors.mutedForeground, lineHeight: 20 },
  intro: { color: colors.foreground, marginBottom: spacing.xs },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 6 },
  bulletDot: { ...type.footnote, color: colors.primary },
  bulletText: { ...type.footnote, color: colors.mutedForeground, flex: 1, lineHeight: 20 },
});
