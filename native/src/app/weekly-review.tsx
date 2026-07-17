import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Sparkles } from 'lucide-react-native';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';

interface AIInsight {
  category: string;
  icon: string;
  title: string;
  detail: string;
  trend: 'up' | 'down' | 'stable';
}
interface AIRecommendation {
  priority: 'high' | 'medium' | 'low';
  action: string;
  reason: string;
}
interface AIAnalysis {
  summary: string;
  score: number;
  insights: AIInsight[];
  recommendations: AIRecommendation[];
}

function weekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.setDate(diff)).toISOString().split('T')[0];
}

const TREND = { up: '↑', down: '↓', stable: '→' } as const;
const PRIORITY_COLOR = {
  high: '#dc2f2f',
  medium: '#ef7c26',
  low: '#a8b2c4',
} as const;

export default function WeeklyReviewScreen() {
  const { session } = useAuth();
  const i18n = useI18n();

  const analyze = useMutation({
    mutationFn: async () => {
      const resp = await supabase.functions.invoke('ai-weekly-review', {
        body: { week_start: weekStart() },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (resp.error) throw new Error(resp.error.message ?? 'Analysis failed');
      return resp.data as AIAnalysis;
    },
    onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    onError: (e: Error) => Alert.alert('ASCND', e.message),
  });

  const a = analyze.data;

  return (
    <Screen back title={i18n.nWeeklyReview}>
      {!a ? (
        <GlassCard>
          <View style={styles.titleRow}>
            <Icon icon={Sparkles} size={17} color={colors.primary} />
            <Text style={styles.title}>{i18n.nAiAnalysis}</Text>
          </View>
          <Text style={styles.hint}>{i18n.nWeeklyReviewHint}</Text>
          <Pressable
            style={({ pressed }) => [styles.cta, analyze.isPending && styles.disabled, pressed && styles.pressed]}
            disabled={analyze.isPending}
            onPress={() => analyze.mutate()}>
            {analyze.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.ctaText}>{i18n.nAnalyzeWeek}</Text>
            )}
          </Pressable>
        </GlassCard>
      ) : (
        <>
          <GlassCard>
            <Text style={styles.title}>{i18n.nWeekScore}</Text>
            <Text style={styles.score}>{a.score}</Text>
            <Text style={styles.summary}>{a.summary}</Text>
          </GlassCard>

          {a.insights?.map((ins, i) => (
            <GlassCard key={i} style={styles.itemCard}>
              <View style={styles.row}>
                <Text style={styles.icon}>{ins.icon}</Text>
                <View style={styles.info}>
                  <Text style={styles.itemTitle}>
                    {ins.title} <Text style={styles.trend}>{TREND[ins.trend] ?? ''}</Text>
                  </Text>
                  <Text style={styles.hint}>{ins.detail}</Text>
                </View>
              </View>
            </GlassCard>
          ))}

          {a.recommendations?.map((rec, i) => (
            <GlassCard key={`r${i}`} style={styles.itemCard}>
              <View style={styles.row}>
                <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[rec.priority] ?? colors.border }]} />
                <View style={styles.info}>
                  <Text style={styles.itemTitle}>{rec.action}</Text>
                  <Text style={styles.hint}>{rec.reason}</Text>
                </View>
              </View>
            </GlassCard>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.headline, color: colors.foreground },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hint: { ...type.footnote, color: colors.mutedForeground, marginTop: 4, lineHeight: 18 },
  cta: {
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  ctaText: { ...type.headline, color: colors.primaryForeground },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  score: { fontSize: 44, fontWeight: '700', color: colors.foreground, marginTop: spacing.sm },
  summary: { ...type.body, color: colors.secondaryForeground, marginTop: spacing.sm, lineHeight: 21 },
  itemCard: { paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { fontSize: 22 },
  info: { flex: 1, minWidth: 0 },
  itemTitle: { ...type.body, fontWeight: '600', color: colors.foreground },
  trend: { color: colors.mutedForeground },
  priorityDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
});
