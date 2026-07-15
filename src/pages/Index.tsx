import { useEffect, useState, useCallback } from 'react';
import { Plus, Camera, Settings, Pencil, X, RotateCcw, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import PullToRefresh from '@/components/PullToRefresh';
import ScanFoodDialog from '@/components/logging/ScanFoodDialog';
import type { ScannedFoodItem } from '@/components/logging/ScanFoodDialog';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import ReadinessGauge from '@/components/dashboard/ReadinessGauge';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import { Skeleton } from '@/components/ui/skeleton';
import BiometricsCard from '@/components/dashboard/BiometricsCard';
import NutritionCard from '@/components/dashboard/NutritionCard';
import SleepCard from '@/components/dashboard/SleepCard';
import TrainingCard from '@/components/dashboard/TrainingCard';
import NudgesCard from '@/components/dashboard/NudgesCard';
import AiTipsCard from '@/components/dashboard/AiTipsCard';
import ReadinessTrend from '@/components/dashboard/ReadinessTrend';
import ActivityCard from '@/components/dashboard/ActivityCard';
import EmptyState from '@/components/dashboard/EmptyState';
import SupplementChecklist from '@/components/dashboard/SupplementChecklist';
import RecentAwards from '@/components/dashboard/RecentAwards';
import WeightCheckin from '@/components/dashboard/WeightCheckin';
import WorkoutStatus from '@/components/dashboard/WorkoutStatus';
import WaterWidget from '@/components/dashboard/WaterWidget';
import StepsWidget from '@/components/dashboard/StepsWidget';
import LogMealDialog from '@/components/logging/LogMealDialog';
import LogWorkoutDialog from '@/components/logging/LogWorkoutDialog';
import LogSleepDialog from '@/components/logging/LogSleepDialog';
import LogBiometricsDialog from '@/components/logging/LogBiometricsDialog';
import { WidgetGroupSection, AddGroupInline } from '@/components/dashboard/WidgetGroupSection';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, useDailyLog, useTodaySleep, useRecentWorkouts, useTodayBiometrics, useReadinessTrend, useNudges, useWearables } from '@/hooks/useTodayData';
import { useTodaySupplementChecklist, useToggleSupplement, useTodayWeight, useLogWeight } from '@/hooks/useDashboardData';
import { useCheckAwards } from '@/hooks/useAwards';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useWidgetConfig, type WidgetKey } from '@/hooks/useWidgetConfig';
import { t, getLocale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import type { ReadinessResult } from '@/lib/types';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { ...spring, duration: 0.6 } },
};
const scaleReveal = {
  hidden: { opacity: 0, scale: 0.88, filter: 'blur(12px)' },
  show: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { ...spring, duration: 0.7 } },
};

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: dailyLog, isLoading: dailyLogLoading } = useDailyLog();
  const { data: todaySleep, isLoading: sleepLoading } = useTodaySleep();
  const { data: recentWorkouts, isLoading: workoutsLoading } = useRecentWorkouts();
  const { data: todayBio, isLoading: bioLoading } = useTodayBiometrics();
  const { data: readinessTrend, isLoading: trendLoading } = useReadinessTrend();
  const { data: nudges } = useNudges();
  const { data: wearables } = useWearables();
  const { data: supplementChecklist } = useTodaySupplementChecklist();
  const toggleSupplement = useToggleSupplement();
  const { data: todayWeight } = useTodayWeight();
  const logWeight = useLogWeight();
  const { checkAndGrant } = useCheckAwards();
  const [awardsChecked, setAwardsChecked] = useState(false);
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const [lastScan, setLastScan] = useState<ScannedFoodItem[] | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [addingGroup, setAddingGroup] = useState(false);

  const {
    config, editMode, setEditMode,
    reorderGroupWidgets, addGroup, removeGroup, renameGroup, reorderGroups, resetConfig,
  } = useWidgetConfig();

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(() => {
    if (user && !awardsChecked) { checkAndGrant(); setAwardsChecked(true); }
  }, [user, awardsChecked]);

  if (authLoading || profileLoading) return <DashboardSkeleton />;
  if (!user) return <Navigate to="/auth" replace />;
  if (profile && !profile.onboarding_completed) return <Navigate to="/onboarding" replace />;

  const dataLoading = dailyLogLoading || sleepLoading || workoutsLoading || bioLoading || trendLoading;

  const now = new Date();
  const greeting = now.getHours() < 12 ? i18n.goodMorning : now.getHours() < 18 ? i18n.goodAfternoon : i18n.goodEvening;
  const dateStr = now.toLocaleDateString(getLocale(lang), { weekday: 'long', month: 'long', day: 'numeric' });
  const userName = profile?.name || user.email?.split('@')[0] || i18n.authYourName;

  const readinessResult: ReadinessResult | null = dailyLog?.readiness_score != null ? {
    score: Number(dailyLog.readiness_score),
    status: (dailyLog.readiness_status as 'green' | 'yellow' | 'red') || 'yellow',
    explain: dailyLog.readiness_explain || '',
    recommendation: dailyLog.readiness_recommendation || '',
    subscores: { rhr: 50, sleep: 50, load: 50 },
    acwr: Number(dailyLog.acwr) || 0,
  } : null;

  const dailyLogForCards = dailyLog ? {
    id: dailyLog.id, userId: dailyLog.user_id, date: dailyLog.date,
    nutritionSummary: { kcal: Number(dailyLog.kcal), protein_g: Number(dailyLog.protein_g), carbs_g: Number(dailyLog.carbs_g), fat_g: Number(dailyLog.fat_g), fiber_g: Number(dailyLog.fiber_g) },
    activitySummary: { steps: dailyLog.steps ?? 0, active_minutes: dailyLog.active_minutes ?? 0, active_kcal: Number(dailyLog.active_kcal) || 0 },
    sleepSummary: { duration_min: dailyLog.sleep_duration_min ?? 0, quality_1_10: Number(dailyLog.sleep_quality) || 0 },
    readiness: { score_0_100: Number(dailyLog.readiness_score) || 0, status: (dailyLog.readiness_status as 'green' | 'yellow' | 'red') || 'yellow', explain: dailyLog.readiness_explain || '' },
  } : null;

  const biometricSample = todayBio ? {
    id: todayBio.id, userId: todayBio.user_id, dateTime: todayBio.date_time,
    source: todayBio.source as 'wearable' | 'camera_rppg' | 'manual',
    metrics: { hr_bpm: todayBio.hr_bpm ? Number(todayBio.hr_bpm) : undefined, hrv_rmssd_ms: todayBio.hrv_rmssd_ms ? Number(todayBio.hrv_rmssd_ms) : undefined, spo2_pct: todayBio.spo2_pct ? Number(todayBio.spo2_pct) : undefined, vo2max_mlkgmin: todayBio.vo2max_mlkgmin ? Number(todayBio.vo2max_mlkgmin) : undefined, resp_rate_rpm: todayBio.resp_rate_rpm ? Number(todayBio.resp_rate_rpm) : undefined },
    confidence_0_1: Number(todayBio.confidence) || 0.7,
  } : null;

  const sleepForCard = todaySleep ? {
    id: todaySleep.id, userId: todaySleep.user_id, bedtime: todaySleep.bedtime, waketime: todaySleep.waketime,
    quality_1_10: todaySleep.quality ?? 5,
    sleepStages: { light_min: todaySleep.light_min ?? 0, deep_min: todaySleep.deep_min ?? 0, rem_min: todaySleep.rem_min ?? 0 },
  } : null;

  const workoutsForCard = (recentWorkouts ?? []).map(w => ({
    id: w.id, userId: w.user_id, dateTime: w.date_time, templateName: w.template_name || undefined,
    sessionRPE_1_10: w.session_rpe ?? 5, painFlags: Array.isArray(w.pain_flags) ? (w.pain_flags as any[]) : [],
    sets: Array.isArray(w.sets) ? (w.sets as any[]) : [],
    computed: { volumeLoad: Number(w.volume_load), prDetected: w.pr_detected ?? false },
  }));

  const wearablesForCard = (wearables ?? []).map(w => ({ id: w.id, userId: w.user_id, provider: w.provider as any, connected: w.connected ?? false, lastSync: w.last_sync || undefined }));
  const nudgesForCard = (nudges ?? []).map(n => ({ id: n.id, userId: n.user_id, type: n.type as any, message: n.message, priority: n.priority as any, enabled: n.enabled ?? true, frequencyCapPerDay: n.frequency_cap ?? 3 }));

  const macroTargets = { protein_g: profile?.macro_protein_g ?? 150, carbs_g: profile?.macro_carbs_g ?? 250, fat_g: profile?.macro_fat_g ?? 70 };
  const calorieTarget = profile?.tdee_target_kcal ?? 2200;
  const sleepTargetHours = Number(profile?.sleep_target_hours) || 8;

  // Widget renderer
  const renderWidget = (key: WidgetKey): React.ReactNode => {
    switch (key) {
      case 'readiness':
        return readinessResult ? <ReadinessGauge result={readinessResult} /> : <EmptyState title={i18n.dashReadiness} message={i18n.dashReadinessMsg} />;
      case 'activity':
        return dailyLogForCards ? <ActivityCard log={dailyLogForCards} /> : <EmptyState title={i18n.dashActivity} message={i18n.dashActivityMsg} />;
      case 'readiness-trend':
        return readinessTrend && readinessTrend.length > 0 ? <ReadinessTrend trend={readinessTrend} /> : <EmptyState title={i18n.dashTrend} message={i18n.dashTrendMsg} />;
      case 'biometrics':
        return biometricSample ? <BiometricsCard sample={biometricSample} wearables={wearablesForCard} /> : (
          <LogBiometricsDialog><div className="cursor-pointer"><EmptyState title={i18n.dashBiometrics} message={i18n.dashBiometricsMsg} actionLabel={i18n.dashEnterBiometrics} /></div></LogBiometricsDialog>
        );
      case 'training':
        return workoutsForCard.length > 0 ? <TrainingCard workouts={workoutsForCard} acwr={readinessResult?.acwr ?? 0} /> : (
          <LogWorkoutDialog><div className="cursor-pointer"><EmptyState title={i18n.dashTraining} message={i18n.dashTrainingMsg} actionLabel={i18n.dashLogWorkoutAction} /></div></LogWorkoutDialog>
        );
      case 'nutrition':
        return dailyLogForCards && dailyLogForCards.nutritionSummary.kcal > 0 ? <NutritionCard log={dailyLogForCards} targets={macroTargets} calorieTarget={calorieTarget} /> : (
          <LogMealDialog><div className="cursor-pointer"><EmptyState title={i18n.dashNutrition} message={i18n.dashNutritionMsg} actionLabel={i18n.dashLogMealAction} /></div></LogMealDialog>
        );
      case 'sleep':
        return sleepForCard ? <SleepCard sleep={sleepForCard} targetHours={sleepTargetHours} /> : (
          <LogSleepDialog><div className="cursor-pointer"><EmptyState title={i18n.dashSleep} message={i18n.dashSleepMsg} actionLabel={i18n.dashLogSleepAction} /></div></LogSleepDialog>
        );
      case 'weight':
        return <WeightCheckin todayWeight={todayWeight?.weight_kg ? Number(todayWeight.weight_kg) : null} profileWeight={profile?.weight_kg ? Number(profile.weight_kg) : null} onLog={(w) => logWeight.mutate({ weight_kg: w })} saving={logWeight.isPending} />;
      case 'workout-status':
        return <WorkoutStatus planned={dailyLog?.workout_count ?? 0} done={(recentWorkouts ?? []).filter(w => new Date(w.date_time).toISOString().split('T')[0] === new Date().toISOString().split('T')[0]).length} todayWorkoutNames={(recentWorkouts ?? []).filter(w => new Date(w.date_time).toISOString().split('T')[0] === new Date().toISOString().split('T')[0]).map(w => w.template_name || 'Workout')} />;
      case 'supplements':
        return supplementChecklist && supplementChecklist.length > 0 ? <SupplementChecklist items={supplementChecklist} onToggle={(id, taken) => toggleSupplement.mutate({ supplementId: id, taken })} /> : <EmptyState title={i18n.dashSupplements} message={i18n.dashSupplementsMsg} />;
      case 'ai-tips':
        return <AiTipsCard />;
      case 'awards':
        return <RecentAwards />;
      case 'nudges':
        return nudgesForCard.length > 0 ? <NudgesCard nudges={nudgesForCard} /> : null;
      case 'water':
        return <WaterWidget />;
      case 'steps':
        return <StepsWidget />;
      default:
        return null;
    }
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} className="bg-background">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.02]" style={{ background: 'radial-gradient(circle, hsl(var(--muted)), transparent 70%)' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.015]" style={{ background: 'radial-gradient(circle, hsl(var(--muted)), transparent 70%)' }} />
      </div>

      <motion.main
        variants={container}
        initial="hidden"
        animate="show"
        className="relative max-w-5xl mx-auto px-4 pb-4 space-y-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        {/* Greeting + Edit */}
        <motion.div variants={fadeUp} className="flex items-start justify-between">
          <div>
            <p className="text-[13px] text-muted-foreground font-medium capitalize">{dateStr}</p>
            <h2 className="text-[22px] font-bold tracking-tight mt-0.5">{greeting}, <span className="text-gradient-gold">{userName}</span></h2>
          </div>
          <div className="flex gap-2">
            <motion.div whileTap={{ scale: 0.9 }} transition={spring}>
              <Button
                variant="outline"
                size="icon"
                className={`rounded-2xl w-11 h-11 border-border/30 backdrop-blur-xl shadow-[0_2px_12px_hsl(0_0%_0%_/_0.4)] ${editMode ? 'bg-primary/20 text-primary' : 'bg-secondary/20 hover:bg-secondary/50'}`}
                onClick={() => { setEditMode(!editMode); setAddingGroup(false); }}
              >
                {editMode ? <Check className="w-5 h-5" /> : <Pencil className="w-4 h-4 text-foreground/70" />}
              </Button>
            </motion.div>
            <motion.div whileTap={{ scale: 0.9 }} transition={spring}>
              <Button variant="outline" size="icon" className="rounded-2xl w-11 h-11 border-border/30 bg-secondary/20 hover:bg-secondary/50 backdrop-blur-xl shadow-[0_2px_12px_hsl(0_0%_0%_/_0.4)]" onClick={() => navigate('/settings')}>
                <Settings className="w-5 h-5 text-foreground/70" />
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Edit mode toolbar */}
        <AnimatePresence>
          {editMode && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setAddingGroup(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" />{lang === 'vi' ? 'Thêm nhóm' : 'Add Group'}
              </Button>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={resetConfig}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" />{lang === 'vi' ? 'Đặt lại' : 'Reset'}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick log actions */}
        {!editMode && (
          <motion.div variants={fadeUp} className="flex gap-2.5 flex-wrap">
            {[
              { label: i18n.dashLogMealAction, Dialog: LogMealDialog },
              { label: i18n.dashLogWorkoutAction, Dialog: LogWorkoutDialog },
              { label: i18n.dashLogSleepAction, Dialog: LogSleepDialog },
              { label: i18n.dashEnterBiometrics, Dialog: LogBiometricsDialog },
            ].map(({ label, Dialog }) => (
              <Dialog key={label}>
                <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.94 }} transition={spring}>
                  <Button variant="outline" size="sm" className="rounded-xl border-border/30 bg-secondary/20 hover:bg-secondary/40 backdrop-blur-xl haptic-press shadow-[0_2px_12px_hsl(0_0%_0%_/_0.3)]">
                    <Plus className="w-3 h-3 mr-1.5 text-foreground/60" />{label}
                  </Button>
                </motion.div>
              </Dialog>
            ))}
          </motion.div>
        )}

        {/* Scan results */}
        <AnimatePresence>
          {lastScan && lastScan.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }} transition={spring} className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Camera className="w-4 h-4 text-primary" />{i18n.scanFoodTitle}</h3>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setLastScan(null)}>{i18n.close}</Button>
              </div>
              {lastScan.map((item, idx) => (
                <div key={idx} className="bg-secondary/30 rounded-xl p-3 flex items-center justify-between">
                  <div><p className="text-sm font-medium">{item.food_name}</p><p className="text-xs text-muted-foreground">{item.serving_g}g</p></div>
                  <div className="flex gap-3 text-xs font-mono">
                    <span className="font-bold">{Math.round(item.kcal)} kcal</span>
                    <span className="text-muted-foreground">P{Math.round(item.protein_g)}</span>
                    <span className="text-muted-foreground">C{Math.round(item.carbs_g)}</span>
                    <span className="text-muted-foreground">F{Math.round(item.fat_g)}</span>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hero Widgets (top) */}
        {dataLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {config.heroWidgets.map(key => (
              <motion.div key={key} variants={scaleReveal}>
                {renderWidget(key)}
              </motion.div>
            ))}
          </div>
        )}

        {/* Add group inline */}
        <AnimatePresence>
          {addingGroup && (
            <AddGroupInline onAdd={addGroup} onClose={() => setAddingGroup(false)} />
          )}
        </AnimatePresence>

        {/* Grouped Widgets */}
        {!dataLoading && (
          editMode ? (
            <Reorder.Group
              axis="y"
              values={config.groups}
              onReorder={reorderGroups}
              className="space-y-5"
            >
              {config.groups.map(group => (
                <Reorder.Item key={group.id} value={group} className="list-none">
                  <WidgetGroupSection
                    group={group}
                    editMode={editMode}
                    renderWidget={renderWidget}
                    onReorder={reorderGroupWidgets}
                    onRename={renameGroup}
                    onRemove={removeGroup}
                  />
                </Reorder.Item>
              ))}
            </Reorder.Group>
          ) : (
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
              {config.groups.map(group => (
                <motion.div key={group.id} variants={fadeUp}>
                  <WidgetGroupSection
                    group={group}
                    editMode={editMode}
                    renderWidget={renderWidget}
                    onReorder={reorderGroupWidgets}
                    onRename={renameGroup}
                    onRemove={removeGroup}
                  />
                </motion.div>
              ))}
            </motion.div>
          )
        )}

        <div className="h-8" />
      </motion.main>
    </PullToRefresh>
  );
};

export default Index;
