import { Navigate, useNavigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import { motion } from 'framer-motion';
import { Footprints, Watch, Loader2, TrendingUp, TrendingDown, Minus, Target } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useStepsHistory, useTodaySteps } from '@/hooks/useStepsData';
import { useHealthSync } from '@/hooks/useHealthSync';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from 'recharts';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };
const DAILY_GOAL = 10000;

export default function Steps() {
  const { user, loading } = useAuth();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const locale = getLocale(lang);
  const { data: history, isLoading } = useStepsHistory(14);
  const { data: todaySteps } = useTodaySteps();
  const { available: healthAvailable, checking: healthChecking, syncing, sync } = useHealthSync();

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const steps = todaySteps ?? 0;
  const pct = Math.min(100, Math.round((steps / DAILY_GOAL) * 100));

  // 7-day average
  const last7 = (history ?? []).slice(-7);
  const avg7d = last7.length > 0
    ? Math.round(last7.reduce((s, d) => s + (d.steps ?? 0), 0) / last7.length)
    : 0;

  // Trend
  const recent3 = (history ?? []).slice(-3).map(d => d.steps ?? 0);
  const older3 = (history ?? []).slice(-6, -3).map(d => d.steps ?? 0);
  const avgRecent = recent3.length ? recent3.reduce((a, b) => a + b, 0) / recent3.length : 0;
  const avgOlder = older3.length ? older3.reduce((a, b) => a + b, 0) / older3.length : 0;
  const trendDiff = avgRecent - avgOlder;

  const chartData = (history ?? []).map(d => ({
    date: new Date(d.date).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
    steps: d.steps ?? 0,
  }));

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={i18n.stepsTitle} />
      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">

      {/* Sync button */}
      {!healthChecking && healthAvailable && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-border/40 bg-secondary/20 hover:bg-secondary/50 backdrop-blur-xl haptic-press"
            onClick={sync}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Watch className="w-3.5 h-3.5 mr-1.5" />}
            {syncing ? i18n.stepsSyncing : i18n.stepsSyncApple}
          </Button>
        </motion.div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-card/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-3">
            {/* Today */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }}
              className="metric-card card-shimmer text-center space-y-2"
            >
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">{i18n.stepsToday}</p>
              <p className="text-2xl font-bold font-mono text-primary">{steps.toLocaleString()}</p>
              <div className="w-full bg-secondary/30 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground">{pct}% {i18n.stepsGoal}</p>
            </motion.div>

            {/* Goal */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}
              className="metric-card card-shimmer text-center space-y-2"
            >
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">{i18n.stepsGoal}</p>
              <div className="flex items-center justify-center gap-1">
                <Target className="w-4 h-4 text-muted-foreground" />
                <p className="text-2xl font-bold font-mono">{DAILY_GOAL.toLocaleString()}</p>
              </div>
            </motion.div>

            {/* 7d avg */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.15 }}
              className="metric-card card-shimmer text-center space-y-2"
            >
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">{i18n.stepsAvg7d}</p>
              <p className="text-2xl font-bold font-mono">{avg7d.toLocaleString()}</p>
              <div className="flex items-center justify-center gap-1">
                {Math.abs(trendDiff) < 100 ? (
                  <Minus className="w-3 h-3 text-muted-foreground" />
                ) : trendDiff > 0 ? (
                  <TrendingUp className="w-3 h-3 text-readiness-green" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-readiness-red" />
                )}
                <span className="text-[9px] text-muted-foreground">{i18n.stepsTrend}</span>
              </div>
            </motion.div>
          </div>

          {/* Bar chart */}
          {chartData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }}
              className="metric-card card-shimmer space-y-3"
            >
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{i18n.stepsDaily}</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.15)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <RechartsTooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border) / 0.2)', borderRadius: '12px', fontSize: 12 }}
                    />
                    <Bar dataKey="steps" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {/* Trend area chart */}
          {chartData.length > 2 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.25 }}
              className="metric-card card-shimmer space-y-3"
            >
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{i18n.stepsTrend}</h3>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="grad-steps" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="steps" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#grad-steps)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {/* Empty state */}
          {chartData.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 space-y-3">
              <Footprints className="w-12 h-12 mx-auto text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">{i18n.stepsNoData}</p>
              <p className="text-xs text-muted-foreground/60">{i18n.stepsNoDataMsg}</p>
            </motion.div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
