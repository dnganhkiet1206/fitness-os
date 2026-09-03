import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Segmented, SegmentPanel } from '@/components/ascnd/segmented';
import { Screen } from '@/components/ascnd/screen';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings } from '@/hooks/use-app-settings';
import { getLegal, type LegalDoc } from '@/lib/legal-content';

type Tab = 'terms' | 'privacy' | 'health' | 'data';

export default function LegalScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
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

      <SegmentPanel segment={tab}>
      <Text style={styles.docTitle}>{doc.title}</Text>

      {/*
        No stagger here any more.

        `day-plan.tsx` found what a cascade does under a segmented control:
        "every tap replayed up to half a second of staggered springing for what
        should be an immediate swap. Tapping T2, T3, T4 in sequence left three
        cascades overlapping each other." These blocks are that panel's content,
        so the one uniform fade on `SegmentPanel` is the whole transition.
      */}
      {doc.blocks.map((b, i) => (
        <View key={i}>
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
        </View>
      ))}
      </SegmentPanel>
    </Screen>
  );
}

const stylesFor = makeStyles((c) => ({
  docTitle: { ...type.title, color: c.foreground, marginTop: spacing.xs },
  warnCard: { borderColor: c.readinessRed, borderWidth: 1 },
  blockTitle: { ...type.headline, color: c.foreground, marginBottom: 4 },
  blockBody: { ...type.footnote, color: c.mutedForeground, lineHeight: 20 },
  intro: { color: c.foreground, marginBottom: spacing.xs },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 6 },
  bulletDot: { ...type.footnote, color: c.primary },
  bulletText: { ...type.footnote, color: c.mutedForeground, flex: 1, lineHeight: 20 },
}));
