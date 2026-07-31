import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Apple,
  Check,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Heart,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
import {
  BiometricsCard,
  NudgesCard,
  RecentAwardsCard,
  TrainingCard,
  WorkoutStatusCard,
} from '@/components/ascnd/today-widgets-2';
import { useCheckAwards } from '@/hooks/use-extras';
import { BottomTabInset } from '@/constants/expo-template-theme';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useHealthSync } from '@/hooks/use-health-sync';
import { useDailyLog, useProfile, useTodaySleep } from '@/hooks/useTodayData';
import { useTodayWater } from '@/hooks/use-water';
import { useStepsGoal } from '@/hooks/use-steps-goal';
import { useWidgetConfig, WIDGET_META, type WidgetKey } from '@/hooks/use-widget-config';
import { getLocale } from '@/lib/i18n';
import { calorieTargetFor, macroTargetsFor } from '@/lib/macro-targets';
import { handleTabScroll } from '@/lib/tab-bar-visibility';

/**
 * Stored group icons are emoji strings (persisted configs) — map them to
 * code-drawn lucide icons with a neon accent, Apple-Settings style.
 */
const GROUP_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  '❤️': { icon: Heart, color: '#ff4d6d' },
  '🍎': { icon: Apple, color: colors.readinessGreen },
  '💪': { icon: Dumbbell, color: colors.metricOrange },
  '✨': { icon: Sparkles, color: colors.metricPurple },
  '📌': { icon: Pin, color: colors.metricBlue },
};

/** Neon-tinted icon chip for a widget group */
function GroupIconBadge({ iconKey }: { iconKey: string }) {
  const meta = GROUP_ICONS[iconKey] ?? GROUP_ICONS['📌'];
  return (
    <View style={[styles.groupIconBadge, { backgroundColor: `${meta.color}1f` }]}>
      <Icon icon={meta.icon} size={13} color={meta.color} />
    </View>
  );
}

/** Section header — web WidgetGroupSection: icon chip + semibold title */
function GroupHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.groupHeader}>
      <GroupIconBadge iconKey={icon} />
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
  const queryClient = useQueryClient();
  const { config, editMode, setEditMode, moveWidget, moveGroup, removeGroup, addGroup, resetConfig } =
    useWidgetConfig();
  const { goal: stepsGoal } = useStepsGoal();
  const [newGroupName, setNewGroupName] = useState('');

  // Pull-to-refresh (web PullToRefresh: invalidate everything)
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setRefreshing(false);
  }, [queryClient]);

  // Auto-grant awards once per session (web Index does this on mount)
  const { checkAndGrant, ready: awardsReady } = useCheckAwards();
  // Re-check awards every time Today regains focus (e.g. after closing a
  // log sheet), not just on first mount — Today stays mounted across the
  // log flow, so a milestone earned mid-session would otherwise not fire
  // its celebration until a remount. The grant engine is duplicate-safe
  // and only celebrates fresh grants, so re-running on focus is safe.
  const awardCheckInFlight = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!awardsReady || awardCheckInFlight.current) return;
      awardCheckInFlight.current = true;
      checkAndGrant().finally(() => {
        awardCheckInFlight.current = false;
      });
    }, [awardsReady, checkAndGrant]),
  );

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
  // Shared with the Nutrition tab, which draws the same card — see
  // `lib/macro-targets.ts`.
  const calorieTarget = calorieTargetFor(profile);
  const macroTargets = macroTargetsFor(profile);

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

  // Web Index renderWidget — one place mapping WidgetKey → card
  const renderWidget = (key: WidgetKey): React.ReactNode => {
    switch (key) {
      case 'readiness':
        return readinessScore != null ? (
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
        );
      case 'activity':
        return (
          <ActivityRingsCard
            move={{ current: Math.round(activeKcal), target: 600 }}
            exercise={{ current: activeMin, target: 30 }}
            stand={{ current: steps, target: stepsGoal }}
          />
        );
      case 'biometrics':
        return <BiometricsCard />;
      case 'sleep':
        return sleepTotalMin > 0 ? (
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
        );
      case 'steps':
        return <StepsWidget steps={steps} target={stepsGoal} labels={{ title: lang === 'vi' ? 'Bước đi' : 'Steps' }} />;
      case 'nutrition':
        // Both states open the Nutrition tab, whose first segment is the day's
        // diary — the numbers on this card, and under them the meals they came
        // from. The card used to be inert when it had something to say and a
        // shortcut to `/log-meal` only when it was empty, which is backwards:
        // the moment you want more detail is the moment there *is* detail.
        return (
          <Pressable onPress={() => { Haptics.selectionAsync(); router.push('/nutrition'); }}>
            {kcal > 0 ? (
              <NutritionCard
                kcal={kcal}
                calorieTarget={calorieTarget}
                protein={{ current: Number(dailyLog?.protein_g) || 0, target: macroTargets.protein }}
                carbs={{ current: Number(dailyLog?.carbs_g) || 0, target: macroTargets.carbs }}
                fat={{ current: Number(dailyLog?.fat_g) || 0, target: macroTargets.fat }}
              />
            ) : (
              <GlassCard style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>{i18n.dashNutrition}</Text>
                <Text style={styles.emptyMsg}>{i18n.dashNutritionMsg}</Text>
              </GlassCard>
            )}
          </Pressable>
        );
      case 'water':
        return <WaterWidget ml={waterMl ?? 0} targetMl={waterTarget} labels={{ title: lang === 'vi' ? 'Nước uống' : 'Water' }} />;
      case 'supplements':
        return <SupplementChecklistCard />;
      case 'training':
        return <TrainingCard acwr={dailyLog?.acwr != null ? Number(dailyLog.acwr) : null} />;
      case 'workout-status':
        return <WorkoutStatusCard planned={dailyLog?.workout_count ?? 0} />;
      case 'weight':
        return <WeightCheckinCard profileWeight={profile?.weight_kg != null ? Number(profile.weight_kg) : null} />;
      case 'readiness-trend':
        return <ReadinessTrendCard />;
      case 'ai-tips':
        return <SmartTipsCard />;
      case 'awards':
        return <RecentAwardsCard />;
      case 'nudges':
        return <NudgesCard />;
      default:
        return null;
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: BottomTabInset + insets.bottom + spacing.lg },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mutedForeground} />
      }
      onScroll={(e) => handleTabScroll(e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
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
            style={({ pressed }) => [styles.squareBtn, editMode && styles.squareBtnActive, pressed && styles.pressed]}
            onPress={() => {
              Haptics.selectionAsync();
              setEditMode(!editMode);
              setNewGroupName('');
            }}>
            <Icon
              icon={editMode ? Check : Pencil}
              size={editMode ? 20 : 17}
              color={editMode ? colors.primary : 'rgba(237,237,237,0.7)'}
            />
          </Pressable>
          {!editMode && (
            <>
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
            </>
          )}
        </View>
      </View>

      {!editMode && (
        <>
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

          {/* Hero widgets (web heroWidgets: readiness, activity) — cards
              cascade in with a light spring on mount (iOS feel) */}
          {config.heroWidgets.map((key, i) => (
            <Animated.View
              key={key}
              entering={FadeInDown.springify().damping(26).stiffness(180).delay(i * 70)}>
              {renderWidget(key)}
            </Animated.View>
          ))}

          {/* Grouped widgets, user-configurable order */}
          {config.groups.map((group, gi) => (
            <View key={group.id} style={styles.group}>
              <GroupHeader icon={group.icon} title={group.title[lang] ?? group.title.en} />
              {group.widgets.map((key, wi) => (
                <Animated.View
                  key={key}
                  entering={FadeInDown.springify()
                    .damping(26)
                    .stiffness(180)
                    .delay((config.heroWidgets.length + gi + wi) * 70)}>
                  {renderWidget(key)}
                </Animated.View>
              ))}
            </View>
          ))}
        </>
      )}

      {/* Edit mode — reorder widgets/groups, add/remove groups (web edit mode) */}
      {editMode && (
        <>
          <Text style={styles.editHint}>
            {lang === 'vi'
              ? 'Sắp xếp lại widget và nhóm theo ý bạn'
              : 'Rearrange widgets and groups to your liking'}
          </Text>
          {config.groups.map((group, gi) => (
            <GlassCard key={group.id} style={styles.editGroup}>
              <View style={styles.editGroupHeader}>
                <GroupIconBadge iconKey={group.icon} />
                <Text style={styles.editGroupTitle}>{group.title[lang] ?? group.title.en}</Text>
                <ArrowBtn
                  icon={ChevronUp}
                  disabled={gi === 0}
                  onPress={() => moveGroup(gi, -1)}
                />
                <ArrowBtn
                  icon={ChevronDown}
                  disabled={gi === config.groups.length - 1}
                  onPress={() => moveGroup(gi, 1)}
                />
                <ArrowBtn
                  icon={Trash2}
                  disabled={config.groups.length <= 1}
                  onPress={() => removeGroup(group.id)}
                />
              </View>
              {group.widgets.length === 0 ? (
                <Text style={styles.editEmpty}>
                  {lang === 'vi' ? 'Nhóm trống' : 'Empty group'}
                </Text>
              ) : (
                group.widgets.map((key, wi) => (
                  <View key={key} style={styles.editRow}>
                    <Text style={styles.editRowLabel}>
                      {WIDGET_META[key]?.label[lang] ?? key}
                    </Text>
                    <ArrowBtn
                      icon={ChevronUp}
                      disabled={wi === 0}
                      onPress={() => moveWidget(group.id, wi, -1)}
                    />
                    <ArrowBtn
                      icon={ChevronDown}
                      disabled={wi === group.widgets.length - 1}
                      onPress={() => moveWidget(group.id, wi, 1)}
                    />
                  </View>
                ))
              )}
            </GlassCard>
          ))}

          {/* Add group (web AddGroupInline) */}
          <View style={styles.addGroupRow}>
            <TextInput
              style={styles.addGroupInput}
              placeholder={lang === 'vi' ? 'Tên nhóm mới…' : 'New group name…'}
              placeholderTextColor={colors.mutedForeground}
              value={newGroupName}
              onChangeText={setNewGroupName}
              onSubmitEditing={() => {
                addGroup(newGroupName);
                setNewGroupName('');
              }}
            />
            <Pressable
              style={({ pressed }) => [
                styles.addGroupBtn,
                !newGroupName.trim() && styles.editDisabled,
                pressed && styles.pressed,
              ]}
              disabled={!newGroupName.trim()}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                addGroup(newGroupName);
                setNewGroupName('');
              }}>
              <Icon icon={Plus} size={18} color={colors.primaryForeground} />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [styles.resetBtn, pressed && styles.pressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              resetConfig();
            }}>
            <Icon icon={RotateCcw} size={14} color={colors.mutedForeground} />
            <Text style={styles.resetText}>
              {lang === 'vi' ? 'Khôi phục mặc định' : 'Reset to default'}
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function ArrowBtn({
  icon,
  disabled,
  onPress,
}: {
  icon: typeof ChevronUp;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      hitSlop={4}
      disabled={disabled}
      style={({ pressed }) => [styles.arrowBtn, disabled && styles.editDisabled, pressed && styles.pressed]}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}>
      <Icon icon={icon} size={15} color={colors.mutedForeground} />
    </Pressable>
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
  squareBtnActive: { backgroundColor: 'rgba(168,175,189,0.2)', borderColor: 'rgba(168,175,189,0.4)' },

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
  groupIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: { fontSize: 14, fontWeight: '600', color: 'rgba(237,237,237,0.8)' },

  // Empty states (web EmptyState)
  emptyCard: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.7, color: colors.mutedForeground },
  emptyMsg: { fontSize: 13, color: 'rgba(107,107,107,0.8)', textAlign: 'center', maxWidth: 220, lineHeight: 19 },

  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },

  // Edit mode (web widget-group edit)
  editHint: { fontSize: 13, color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.xs },
  editGroup: { gap: spacing.sm },
  editGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editGroupTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.foreground },
  editEmpty: { fontSize: 12, color: colors.mutedForeground, fontStyle: 'italic', paddingVertical: 4 },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(24,24,27,0.4)',
  },
  editRowLabel: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.foreground },
  arrowBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  editDisabled: { opacity: 0.3 },
  addGroupRow: { flexDirection: 'row', gap: spacing.sm },
  addGroupInput: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(7,7,8,0.5)',
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 15,
  },
  addGroupBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.md,
  },
  resetText: { fontSize: 13, fontWeight: '500', color: colors.mutedForeground },
});
