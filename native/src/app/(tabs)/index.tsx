import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Plus, Settings, Sparkles, Heart } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityRingsCard } from '@/components/ascnd/activity-rings';
import {
  NutritionCard,
  SleepCard,
  StepsWidget,
  WaterWidget,
} from '@/components/ascnd/dashboard-cards';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Mascot } from '@/components/ascnd/mascot';
import { ReadinessGauge } from '@/components/ascnd/readiness-gauge';
import {
  ReadinessTrendCard,
  SmartTipsCard,
  SupplementChecklistCard,
  WeightCheckinCard,
} from '@/components/ascnd/today-widgets';
import { BottomTabInset } from '@/constants/expo-template-theme';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useHealthSync } from '@/hooks/use-health-sync';
import { useDailyLog, useProfile, useTodaySleep } from '@/hooks/useTodayData';
import { useTodayWater } from '@/hooks/use-water';
import { getLocale } from '@/lib/i18n';

/** Section header — web WidgetGroupSection: emoji icon + semibold title */
function GroupHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.groupHeader}>
      <Text style={styles.groupIcon}>{icon}</Text>
      <Text style={styles.groupTitle}>{title}</Text>
    </View>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  const { data: dailyLog } = useDailyLog();
  const { data: sleep } = useTodaySleep();
  const { data: waterMl } = useTodayWater();
  const { available: healthAvailable, sync: healthSync } = useHealthSync();
  const { lang } = useAppSettings();
  const i18n = useI18n();

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? i18n.goodMorning : now.getHours() < 18 ? i18n.goodAfternoon : i18n.goodEvening;
  const dateStr = now.toLocaleDateString(getLocale(lang), { weekday: 'long', month: 'long', day: 'numeric' });
  const userName = profile?.name || i18n.authYourName;

  // Readiness (same mapping as web Index)
  const readinessScore = dailyLog?.readiness_score != null ? Math.round(Number(dailyLog.readiness_score)) : null;
  const readinessStatus = (dailyLog?.readiness_status as 'green' | 'yellow' | 'red') || 'yellow';

  // Activity rings (web ActivityCard: move kcal/600, exercise min/30, steps/10000)
  const activeKcal = Number(dailyLog?.active_kcal) || 0;
  const activeMin = dailyLog?.active_minutes ?? 0;
  const steps = dailyLog?.steps ?? 0;

  // Nutrition
  const kcal = Math.round(Number(dailyLog?.kcal) || 0);
  const calorieTarget = Math.round(Number(profile?.tdee_target_kcal) || 2200);
  const macroTargets = {
    protein: Number(profile?.macro_protein_g) || 150,
    carbs: Number(profile?.macro_carbs_g) || 250,
    fat: Number(profile?.macro_fat_g) || 70,
  };

  // Sleep
  const stages = sleep
    ? { deep: sleep.deep_min ?? 0, rem: sleep.rem_min ?? 0, light: sleep.light_min ?? 0 }
    : null;
  const stageSum = stages ? stages.deep + stages.rem + stages.light : 0;
  const sleepTotalMin = stageSum > 0 ? stageSum : Number(dailyLog?.sleep_duration_min) || 0;
  const sleepTargetHours = Number(profile?.sleep_target_hours) || 8;

  const waterTarget = Number(profile?.water_target_ml) || 2500;

  const quickActions = [
    { label: i18n.dashLogMealAction, route: '/log-meal' as const },
    { label: i18n.dashLogWorkoutAction, route: '/log-workout' as const },
    { label: i18n.dashLogSleepAction, route: '/log-sleep' as const },
    { label: i18n.dashEnterBiometrics, route: '/log-biometrics' as const },
  ];

  const groupTitles = {
    health: lang === 'vi' ? 'Sức khỏe' : 'Health',
    nutrition: lang === 'vi' ? 'Dinh dưỡng' : 'Nutrition',
    fitness: lang === 'vi' ? 'Tập luyện' : 'Fitness',
    insights: lang === 'vi' ? 'Phân tích' : 'Insights',
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: BottomTabInset + insets.bottom + spacing.lg },
      ]}
      contentInsetAdjustmentBehavior="never">
      {/* Greeting + actions (web Index header) */}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.dateLine}>{dateStr}</Text>
          <Text style={styles.greeting}>
            {greeting}, <Text style={styles.greetingName}>{userName}</Text>
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <Pressable
            style={({ pressed }) => [styles.squareBtn, pressed && styles.pressed]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/ai-coach');
            }}>
            <Icon icon={Sparkles} size={20} color="rgba(237,237,237,0.7)" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.squareBtn, pressed && styles.pressed]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/settings');
            }}>
            <Icon icon={Settings} size={20} color="rgba(237,237,237,0.7)" />
          </Pressable>
        </View>
      </View>

      <Mascot />

      {/* Quick log actions (web chips row) */}
      <View style={styles.quickRow}>
        {quickActions.map((a) => (
          <Pressable
            key={a.route}
            style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(a.route);
            }}>
            <Icon icon={Plus} size={12} color="rgba(237,237,237,0.6)" strokeWidth={2.5} />
            <Text style={styles.quickChipText}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* HealthKit sync (native-only necessity, styled as a quick chip row) */}
      {healthAvailable && (
        <Pressable
          style={({ pressed }) => [styles.syncButton, pressed && styles.pressed]}
          disabled={healthSync.isPending}
          onPress={() => healthSync.mutate()}>
          {healthSync.isPending ? (
            <ActivityIndicator color={colors.foreground} size="small" />
          ) : (
            <>
              <Icon icon={Heart} size={14} color={colors.readinessRed} />
              <Text style={styles.syncText}>{i18n.nSyncHealth}</Text>
            </>
          )}
        </Pressable>
      )}

      {/* Hero widgets: Readiness + Activity (web heroWidgets) */}
      {readinessScore != null ? (
        <Pressable onPress={() => { Haptics.selectionAsync(); router.push('/biometrics'); }}>
          <ReadinessGauge
            score={readinessScore}
            status={readinessStatus}
            explain={dailyLog?.readiness_explain}
            recommendation={dailyLog?.readiness_recommendation}
            acwr={dailyLog?.acwr != null ? Number(dailyLog.acwr) : null}
          />
        </Pressable>
      ) : (
        <GlassCard style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{i18n.dashReadiness}</Text>
          <Text style={styles.emptyMsg}>{i18n.dashReadinessMsg}</Text>
        </GlassCard>
      )}

      <ActivityRingsCard
        move={{ current: Math.round(activeKcal), target: 600 }}
        exercise={{ current: activeMin, target: 30 }}
        stand={{ current: steps, target: 10000 }}
      />

      {/* ❤️ Health */}
      <View style={styles.group}>
        <GroupHeader icon="❤️" title={groupTitles.health} />
        {sleepTotalMin > 0 ? (
          <Pressable onPress={() => { Haptics.selectionAsync(); router.push('/sleep-insights'); }}>
            <SleepCard
              totalMin={sleepTotalMin}
              targetHours={sleepTargetHours}
              quality={sleep?.quality != null ? Number(sleep.quality) : null}
              bedtime={sleep?.bedtime}
              waketime={sleep?.waketime}
              stages={stages}
            />
          </Pressable>
        ) : (
          <Pressable onPress={() => router.push('/log-sleep')}>
            <GlassCard style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{i18n.dashSleep}</Text>
              <Text style={styles.emptyMsg}>{i18n.dashSleepMsg}</Text>
            </GlassCard>
          </Pressable>
        )}
        <StepsWidget steps={steps} target={10000} labels={{ title: lang === 'vi' ? 'Bước đi' : 'Steps' }} />
      </View>

      {/* 🍎 Nutrition */}
      <View style={styles.group}>
        <GroupHeader icon="🍎" title={groupTitles.nutrition} />
        {kcal > 0 ? (
          <NutritionCard
            kcal={kcal}
            calorieTarget={calorieTarget}
            protein={{ current: Number(dailyLog?.protein_g) || 0, target: macroTargets.protein }}
            carbs={{ current: Number(dailyLog?.carbs_g) || 0, target: macroTargets.carbs }}
            fat={{ current: Number(dailyLog?.fat_g) || 0, target: macroTargets.fat }}
          />
        ) : (
          <Pressable onPress={() => router.push('/log-meal')}>
            <GlassCard style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{i18n.dashNutrition}</Text>
              <Text style={styles.emptyMsg}>{i18n.dashNutritionMsg}</Text>
            </GlassCard>
          </Pressable>
        )}
        <WaterWidget ml={waterMl ?? 0} targetMl={waterTarget} labels={{ title: lang === 'vi' ? 'Nước uống' : 'Water' }} />
        <SupplementChecklistCard />
      </View>

      {/* 💪 Fitness */}
      <View style={styles.group}>
        <GroupHeader icon="💪" title={groupTitles.fitness} />
        <WeightCheckinCard profileWeight={profile?.weight_kg != null ? Number(profile.weight_kg) : null} />
      </View>

      {/* ✨ Insights */}
      <View style={styles.group}>
        <GroupHeader icon="✨" title={groupTitles.insights} />
        <ReadinessTrendCard />
        <SmartTipsCard />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, gap: spacing.md },

  // Header (web: date 13px muted / greeting 22px bold, name silver)
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  headerText: { flex: 1, minWidth: 0 },
  dateLine: { fontSize: 13, fontWeight: '500', color: colors.mutedForeground, textTransform: 'capitalize' },
  greeting: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: colors.foreground, marginTop: 2 },
  greetingName: { color: colors.primary },
  headerButtons: { flexDirection: 'row', gap: spacing.sm },
  squareBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.3)',
    backgroundColor: 'rgba(24,24,27,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Quick chips (web: rounded-xl bordered secondary/20)
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.3)',
    backgroundColor: 'rgba(24,24,27,0.2)',
  },
  quickChipText: { fontSize: 13, fontWeight: '500', color: colors.foreground },

  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.3)',
    backgroundColor: 'rgba(24,24,27,0.2)',
  },
  syncText: { fontSize: 13, fontWeight: '500', color: colors.foreground },

  // Groups (web WidgetGroupSection)
  group: { gap: spacing.sm + 4, marginTop: spacing.xs },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 4 },
  groupIcon: { fontSize: 16 },
  groupTitle: { fontSize: 14, fontWeight: '600', color: 'rgba(237,237,237,0.8)' },

  // Empty states (web EmptyState)
  emptyCard: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.7, color: colors.mutedForeground },
  emptyMsg: { fontSize: 13, color: 'rgba(107,107,107,0.8)', textAlign: 'center', maxWidth: 220, lineHeight: 19 },

  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
