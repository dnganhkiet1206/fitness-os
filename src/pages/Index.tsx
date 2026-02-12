import { Camera, Settings, Plus, LogOut } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReadinessGauge from '@/components/dashboard/ReadinessGauge';
import BiometricsCard from '@/components/dashboard/BiometricsCard';
import NutritionCard from '@/components/dashboard/NutritionCard';
import SleepCard from '@/components/dashboard/SleepCard';
import TrainingCard from '@/components/dashboard/TrainingCard';
import NudgesCard from '@/components/dashboard/NudgesCard';
import ReadinessTrend from '@/components/dashboard/ReadinessTrend';
import ActivityCard from '@/components/dashboard/ActivityCard';
import EmptyState from '@/components/dashboard/EmptyState';
import LogMealDialog from '@/components/logging/LogMealDialog';
import LogWorkoutDialog from '@/components/logging/LogWorkoutDialog';
import LogSleepDialog from '@/components/logging/LogSleepDialog';
import LogBiometricsDialog from '@/components/logging/LogBiometricsDialog';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, useDailyLog, useTodaySleep, useRecentWorkouts, useTodayBiometrics, useReadinessTrend, useNudges, useWearables } from '@/hooks/useTodayData';
import { Button } from '@/components/ui/button';
import type { ReadinessResult } from '@/lib/types';

const Index = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: dailyLog } = useDailyLog();
  const { data: todaySleep } = useTodaySleep();
  const { data: recentWorkouts } = useRecentWorkouts();
  const { data: todayBio } = useTodayBiometrics();
  const { data: readinessTrend } = useReadinessTrend();
  const { data: nudges } = useNudges();
  const { data: wearables } = useWearables();

  if (authLoading || profileLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Đang tải...</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Chào buổi sáng' : now.getHours() < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const dateStr = now.toLocaleDateString('vi-VN', { weekday: 'long', month: 'long', day: 'numeric' });
  const userName = profile?.name || user.email?.split('@')[0] || 'bạn';

  const readinessResult: ReadinessResult | null = dailyLog?.readiness_score != null ? {
    score: Number(dailyLog.readiness_score),
    status: (dailyLog.readiness_status as 'green' | 'yellow' | 'red') || 'yellow',
    explain: dailyLog.readiness_explain || '',
    recommendation: dailyLog.readiness_recommendation || '',
    subscores: { rhr: 50, sleep: 50, load: 50 },
    acwr: Number(dailyLog.acwr) || 0,
  } : null;

  const dailyLogForCards = dailyLog ? {
    id: dailyLog.id,
    userId: dailyLog.user_id,
    date: dailyLog.date,
    nutritionSummary: {
      kcal: Number(dailyLog.kcal),
      protein_g: Number(dailyLog.protein_g),
      carbs_g: Number(dailyLog.carbs_g),
      fat_g: Number(dailyLog.fat_g),
      fiber_g: Number(dailyLog.fiber_g),
    },
    activitySummary: {
      steps: dailyLog.steps ?? 0,
      active_minutes: dailyLog.active_minutes ?? 0,
      active_kcal: Number(dailyLog.active_kcal) || 0,
    },
    sleepSummary: {
      duration_min: dailyLog.sleep_duration_min ?? 0,
      quality_1_10: Number(dailyLog.sleep_quality) || 0,
    },
    readiness: {
      score_0_100: Number(dailyLog.readiness_score) || 0,
      status: (dailyLog.readiness_status as 'green' | 'yellow' | 'red') || 'yellow',
      explain: dailyLog.readiness_explain || '',
    },
  } : null;

  const biometricSample = todayBio ? {
    id: todayBio.id,
    userId: todayBio.user_id,
    dateTime: todayBio.date_time,
    source: todayBio.source as 'wearable' | 'camera_rppg' | 'manual',
    metrics: {
      hr_bpm: todayBio.hr_bpm ? Number(todayBio.hr_bpm) : undefined,
      hrv_rmssd_ms: todayBio.hrv_rmssd_ms ? Number(todayBio.hrv_rmssd_ms) : undefined,
      spo2_pct: todayBio.spo2_pct ? Number(todayBio.spo2_pct) : undefined,
      vo2max_mlkgmin: todayBio.vo2max_mlkgmin ? Number(todayBio.vo2max_mlkgmin) : undefined,
      resp_rate_rpm: todayBio.resp_rate_rpm ? Number(todayBio.resp_rate_rpm) : undefined,
    },
    confidence_0_1: Number(todayBio.confidence) || 0.7,
  } : null;

  const sleepForCard = todaySleep ? {
    id: todaySleep.id,
    userId: todaySleep.user_id,
    bedtime: todaySleep.bedtime,
    waketime: todaySleep.waketime,
    quality_1_10: todaySleep.quality ?? 5,
    sleepStages: {
      light_min: todaySleep.light_min ?? 0,
      deep_min: todaySleep.deep_min ?? 0,
      rem_min: todaySleep.rem_min ?? 0,
    },
  } : null;

  const workoutsForCard = (recentWorkouts ?? []).map(w => ({
    id: w.id,
    userId: w.user_id,
    dateTime: w.date_time,
    templateName: w.template_name || undefined,
    sessionRPE_1_10: w.session_rpe ?? 5,
    painFlags: Array.isArray(w.pain_flags) ? (w.pain_flags as any[]) : [],
    sets: Array.isArray(w.sets) ? (w.sets as any[]) : [],
    computed: { volumeLoad: Number(w.volume_load), prDetected: w.pr_detected ?? false },
  }));

  const wearablesForCard = (wearables ?? []).map(w => ({
    id: w.id,
    userId: w.user_id,
    provider: w.provider as any,
    connected: w.connected ?? false,
    lastSync: w.last_sync || undefined,
  }));

  const nudgesForCard = (nudges ?? []).map(n => ({
    id: n.id,
    userId: n.user_id,
    type: n.type as any,
    message: n.message,
    priority: n.priority as any,
    enabled: n.enabled ?? true,
    frequencyCapPerDay: n.frequency_cap ?? 3,
  }));

  const macroTargets = {
    protein_g: profile?.macro_protein_g ?? 150,
    carbs_g: profile?.macro_carbs_g ?? 250,
    fat_g: profile?.macro_fat_g ?? 70,
  };
  const calorieTarget = profile?.tdee_target_kcal ?? 2200;
  const sleepTargetHours = Number(profile?.sleep_target_hours) || 8;

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } },
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
  };

  const scaleIn = {
    hidden: { opacity: 0, scale: 0.92 },
    show: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: 'easeOut' as const } },
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border"
      >
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              <span className="text-gradient-green">Fitness</span>
              <span className="text-foreground"> OS</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <LogBiometricsDialog>
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <Camera className="w-4 h-4" />
              </motion.button>
            </LogBiometricsDialog>
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <Settings className="w-4 h-4" />
            </motion.button>
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={signOut} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </motion.header>

      <motion.main
        variants={stagger}
        initial="hidden"
        animate="show"
        className="max-w-5xl mx-auto px-4 py-6 space-y-6"
      >
        {/* Greeting */}
        <motion.div variants={fadeUp}>
          <p className="text-sm text-muted-foreground">{dateStr}</p>
          <h2 className="text-2xl font-bold">{greeting}, {userName}</h2>
        </motion.div>

        {/* Quick log actions */}
        <motion.div variants={fadeUp} className="flex gap-2 flex-wrap">
          <LogMealDialog>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Button variant="outline" size="sm"><Plus className="w-3 h-3 mr-1" />Ghi bữa ăn</Button>
            </motion.div>
          </LogMealDialog>
          <LogWorkoutDialog>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Button variant="outline" size="sm"><Plus className="w-3 h-3 mr-1" />Ghi buổi tập</Button>
            </motion.div>
          </LogWorkoutDialog>
          <LogSleepDialog>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Button variant="outline" size="sm"><Plus className="w-3 h-3 mr-1" />Ghi giấc ngủ</Button>
            </motion.div>
          </LogSleepDialog>
          <LogBiometricsDialog>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Button variant="outline" size="sm"><Plus className="w-3 h-3 mr-1" />Nhập sinh trắc</Button>
            </motion.div>
          </LogBiometricsDialog>
        </motion.div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <motion.div variants={scaleIn} className="lg:col-span-2">
            {readinessResult ? (
              <ReadinessGauge result={readinessResult} />
            ) : (
              <EmptyState title="Sẵn Sàng" message="Cần 3+ ngày dữ liệu để tính điểm sẵn sàng. Hãy ghi log giấc ngủ, sinh trắc và buổi tập." />
            )}
          </motion.div>

          <div className="lg:col-span-2 space-y-4">
            <motion.div variants={fadeUp}>
              {readinessTrend && readinessTrend.length > 0 ? (
                <ReadinessTrend trend={readinessTrend} />
              ) : (
                <EmptyState title="Xu Hướng" message="Chưa có dữ liệu xu hướng sẵn sàng." />
              )}
            </motion.div>
            <motion.div variants={fadeUp}>
              {dailyLogForCards ? (
                <ActivityCard log={dailyLogForCards} />
              ) : (
                <EmptyState title="Hoạt Động" message="Chưa có dữ liệu hoạt động hôm nay." />
              )}
            </motion.div>
          </div>
        </div>

        {/* Second row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <motion.div variants={fadeUp} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
            {biometricSample ? (
              <BiometricsCard sample={biometricSample} wearables={wearablesForCard} />
            ) : (
              <LogBiometricsDialog>
                <div className="cursor-pointer">
                  <EmptyState title="Sinh Trắc Học" message="Chưa có dữ liệu. Nhấn để nhập." actionLabel="Nhập sinh trắc" />
                </div>
              </LogBiometricsDialog>
            )}
          </motion.div>
          <motion.div variants={fadeUp} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
            {workoutsForCard.length > 0 ? (
              <TrainingCard workouts={workoutsForCard} acwr={readinessResult?.acwr ?? 0} />
            ) : (
              <LogWorkoutDialog>
                <div className="cursor-pointer">
                  <EmptyState title="Tập Luyện" message="Chưa có buổi tập nào. Nhấn để ghi." actionLabel="Ghi buổi tập" />
                </div>
              </LogWorkoutDialog>
            )}
          </motion.div>
        </div>

        {/* Third row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <motion.div variants={fadeUp} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
            {dailyLogForCards && dailyLogForCards.nutritionSummary.kcal > 0 ? (
              <NutritionCard log={dailyLogForCards} targets={macroTargets} calorieTarget={calorieTarget} />
            ) : (
              <LogMealDialog>
                <div className="cursor-pointer">
                  <EmptyState title="Dinh Dưỡng" message="Chưa ghi bữa ăn hôm nay. Nhấn để ghi." actionLabel="Ghi bữa ăn" />
                </div>
              </LogMealDialog>
            )}
          </motion.div>
          <motion.div variants={fadeUp} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
            {sleepForCard ? (
              <SleepCard sleep={sleepForCard} targetHours={sleepTargetHours} />
            ) : (
              <LogSleepDialog>
                <div className="cursor-pointer">
                  <EmptyState title="Giấc Ngủ" message="Chưa ghi giấc ngủ. Nhấn để ghi." actionLabel="Ghi giấc ngủ" />
                </div>
              </LogSleepDialog>
            )}
          </motion.div>
        </div>

        {/* Nudges */}
        <AnimatePresence>
          {nudgesForCard.length > 0 && (
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: 10 }}
            >
              <NudgesCard nudges={nudgesForCard} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="h-8" />
      </motion.main>
    </div>
  );
};

export default Index;
