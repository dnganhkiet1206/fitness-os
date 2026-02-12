import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Flame, Beef, Moon, Dumbbell, Activity, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Area, AreaChart, ComposedChart, ReferenceLine } from 'recharts';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { useAppSettings, t } from '@/hooks/useAppSettings';
import { getLocale } from '@/lib/i18n';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { ...spring, duration: 0.6 } },
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateRange(start: Date, locale: string): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString(locale, opts)} — ${end.toLocaleDateString(locale, opts)}`;
}

const DAYS_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeeklyReview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const locale = getLocale(lang);
  const DAYS = lang === 'vi' ? DAYS_VI : DAYS_EN;
  const [weekOffset, setWeekOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const weekStart = useMemo(() => {
    const ws = getWeekStart(new Date());
    ws.setDate(ws.getDate() + weekOffset * 7);
    return ws;
  }, [weekOffset]);

  const weekEnd = useMemo(() => {
    const we = new Date(weekStart);
    we.setDate(we.getDate() + 6);
    return we;
  }, [weekStart]);

  const startStr = weekStart.toISOString().split('T')[0];
  const endStr = weekEnd.toISOString().split('T')[0];

  // Fetch daily logs for the week
  const { data: dailyLogs } = useQuery({
    queryKey: ['weekly_daily_logs', user?.id, startStr],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date', startStr)
        .lte('date', endStr)
        .order('date');
      return data ?? [];
    },
  });

  // Fetch workout sessions for the week
  const { data: workouts } = useQuery({
    queryKey: ['weekly_workouts', user?.id, startStr],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date_time', `${startStr}T00:00:00`)
        .lte('date_time', `${endStr}T23:59:59`)
        .order('date_time');
      return data ?? [];
    },
  });

  // Fetch sleep logs for the week
  const { data: sleepLogs } = useQuery({
    queryKey: ['weekly_sleep', user?.id, startStr],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('sleep_logs')
        .select('*')
        .eq('user_id', user!.id)
        .gte('waketime', `${startStr}T00:00:00`)
        .lte('waketime', `${endStr}T23:59:59`)
        .order('waketime');
      return data ?? [];
    },
  });

  // Fetch previous week for comparison
  const prevStart = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  }, [weekStart]);

  const { data: prevLogs } = useQuery({
    queryKey: ['weekly_daily_logs_prev', user?.id, prevStart],
    enabled: !!user,
    queryFn: async () => {
      const prevEnd = new Date(weekStart);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const { data } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date', prevStart)
        .lte('date', prevEnd.toISOString().split('T')[0])
        .order('date');
      return data ?? [];
    },
  });

  // Fetch 28-day volume for ACWR
  const { data: monthLogs } = useQuery({
    queryKey: ['monthly_logs', user?.id, startStr],
    enabled: !!user,
    queryFn: async () => {
      const d = new Date(weekEnd);
      d.setDate(d.getDate() - 28);
      const { data } = await supabase
        .from('daily_logs')
        .select('date, volume_load, readiness_score, readiness_status')
        .eq('user_id', user!.id)
        .gte('date', d.toISOString().split('T')[0])
        .lte('date', endStr)
        .order('date');
      return data ?? [];
    },
  });

  // Compute stats
  const targets = {
    kcal: profile?.tdee_target_kcal ?? 2200,
    protein: profile?.macro_protein_g ?? 150,
    sleepH: Number(profile?.sleep_target_hours) || 8,
  };

  const logs = dailyLogs ?? [];
  const daysWithData = logs.length;

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  const avgKcal = avg(logs.map(l => Number(l.kcal) || 0));
  const avgProtein = avg(logs.map(l => Number(l.protein_g) || 0));
  const avgSleepMin = avg((sleepLogs ?? []).map(s => (s.deep_min ?? 0) + (s.rem_min ?? 0) + (s.light_min ?? 0)));
  const avgSleepH = avgSleepMin / 60;
  const totalVolume = sum(logs.map(l => Number(l.volume_load) || 0));
  const workoutCount = (workouts ?? []).length;
  const avgReadiness = avg(logs.filter(l => l.readiness_score).map(l => Number(l.readiness_score)));

  // Previous week stats for comparison
  const pLogs = prevLogs ?? [];
  const prevAvgKcal = avg(pLogs.map(l => Number(l.kcal) || 0));
  const prevAvgProtein = avg(pLogs.map(l => Number(l.protein_g) || 0));
  const prevTotalVolume = sum(pLogs.map(l => Number(l.volume_load) || 0));

  // Chart data - 7 days
  const chartData = DAYS.map((day, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const log = logs.find(l => l.date === dateStr);
    const sleep = (sleepLogs ?? []).find(s => new Date(s.waketime).toISOString().split('T')[0] === dateStr);
    const sleepMin = sleep ? (sleep.deep_min ?? 0) + (sleep.rem_min ?? 0) + (sleep.light_min ?? 0) : 0;
    return {
      day,
      kcal: Number(log?.kcal) || 0,
      protein: Number(log?.protein_g) || 0,
      sleep_h: +(sleepMin / 60).toFixed(1),
      volume: Number(log?.volume_load) || 0,
      readiness: Number(log?.readiness_score) || 0,
    };
  });

  // ACWR calculation
  const mLogs = monthLogs ?? [];
  const load7d = sum(logs.map(l => Number(l.volume_load) || 0));
  const load28d = sum(mLogs.map(l => Number(l.volume_load) || 0));
  const acuteAvg = load7d / 7;
  const chronicAvg = load28d / 28;
  const acwr = chronicAvg > 0 ? +(acuteAvg / chronicAvg).toFixed(2) : 0;

  // Pain flags from workouts
  const painFlags = (workouts ?? []).flatMap(w => {
    const flags = Array.isArray(w.pain_flags) ? w.pain_flags as { bodyPart: string; pain_0_10: number }[] : [];
    return flags.filter(f => f.pain_0_10 >= 5);
  });

  // Adaptive training recommendations
  const recommendations: { type: 'success' | 'warning' | 'info'; text: string }[] = [];

  if (acwr > 1.5) {
    recommendations.push({ type: 'warning', text: `ACWR cao (${acwr}). Giảm 15-20% volume tuần tới để tránh chấn thương.` });
  } else if (acwr > 1.3) {
    recommendations.push({ type: 'warning', text: `ACWR hơi cao (${acwr}). Giảm 5-10% volume hoặc bớt 1-2 sets/bài tập.` });
  } else if (acwr < 0.6 && load7d > 0) {
    recommendations.push({ type: 'info', text: `ACWR thấp (${acwr}). Có thể tăng 10-15% volume dần dần.` });
  } else if (acwr >= 0.8 && acwr <= 1.3) {
    recommendations.push({ type: 'success', text: `ACWR tối ưu (${acwr}). Giữ nguyên hoặc tăng nhẹ 5% volume.` });
  }

  if (avgReadiness < 50 && daysWithData >= 3) {
    recommendations.push({ type: 'warning', text: 'Readiness trung bình thấp. Cân nhắc tuần deload: giảm 40-50% volume, giữ cường độ.' });
  } else if (avgReadiness >= 75) {
    recommendations.push({ type: 'success', text: 'Phục hồi tốt! Có thể đẩy progressive overload: +2.5kg hoặc +1 rep mỗi bài chính.' });
  }

  if (avgSleepH < targets.sleepH - 1) {
    recommendations.push({ type: 'warning', text: `Thiếu ngủ (${avgSleepH.toFixed(1)}h vs ${targets.sleepH}h). Ưu tiên ngủ trước khi tăng volume.` });
  }

  if (avgProtein < targets.protein * 0.8 && daysWithData >= 3) {
    recommendations.push({ type: 'info', text: `Protein thấp (${Math.round(avgProtein)}g vs ${targets.protein}g). Tăng protein để hỗ trợ phục hồi.` });
  }

  if (painFlags.length > 0) {
    const parts = [...new Set(painFlags.map(f => f.bodyPart))].join(', ');
    recommendations.push({ type: 'warning', text: `Có cảnh báo đau: ${parts}. Tránh bài tập trực tiếp vùng này hoặc giảm tải.` });
  }

  if (totalVolume > prevTotalVolume * 1.15 && prevTotalVolume > 0) {
    recommendations.push({ type: 'info', text: `Volume tăng ${Math.round((totalVolume / prevTotalVolume - 1) * 100)}% so với tuần trước. Theo dõi phục hồi.` });
  }

  const delta = (curr: number, prev: number) => {
    if (!prev) return null;
    return ((curr - prev) / prev * 100).toFixed(0);
  };

  const DeltaBadge = ({ curr, prev, invert = false }: { curr: number; prev: number; invert?: boolean }) => {
    const d = delta(curr, prev);
    if (!d || d === '0') return <Minus className="w-3 h-3 text-muted-foreground" />;
    const isUp = Number(d) > 0;
    const isGood = invert ? !isUp : isUp;
    return (
      <span className={`text-[10px] font-mono flex items-center gap-0.5 ${isGood ? 'text-primary' : 'text-destructive'}`}>
        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {Math.abs(Number(d))}%
      </span>
    );
  };

  const chartConfig = {
    kcal: { label: 'Calories', color: 'hsl(25 95% 58%)' },
    protein: { label: 'Protein (g)', color: 'hsl(160 84% 39%)' },
    sleep_h: { label: i18n.weeklyReviewSleepChart + ' (h)', color: 'hsl(265 90% 66%)' },
    volume: { label: 'Volume Load', color: 'hsl(217 91% 60%)' },
    readiness: { label: 'Readiness', color: 'hsl(43 96% 56%)' },
  };

  const exportReport = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(reportRef.current, {
        backgroundColor: '#0a0b0f',
        pixelRatio: 2,
        style: { padding: '24px' },
      });
      const link = document.createElement('a');
      link.download = `weekly-review-${startStr}.png`;
      link.href = dataUrl;
      link.click();
      toast.success(i18n.weeklyReviewExported);
    } catch (e) {
      console.error(e);
      toast.error(i18n.error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 border-b border-border/50"
        style={{ background: 'hsl(225 15% 6% / 0.7)', backdropFilter: 'blur(24px) saturate(1.5)' }}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="rounded-xl">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-lg font-bold">{i18n.weeklyReviewTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setWeekOffset(o => o - 1)} className="rounded-xl w-8 h-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground font-medium min-w-[140px] text-center">
              {formatDateRange(weekStart, locale)}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setWeekOffset(o => Math.min(o + 1, 0))} disabled={weekOffset >= 0} className="rounded-xl w-8 h-8">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-xs ml-2"
              onClick={exportReport}
              disabled={exporting || daysWithData === 0}
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
              {i18n.weeklyReviewExport}
            </Button>
          </div>
        </div>
      </motion.header>

      <motion.main
        ref={reportRef}
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        className="max-w-4xl mx-auto px-4 py-8 space-y-6"
      >
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { icon: Flame, label: i18n.weeklyReviewAvgCalories, value: `${Math.round(avgKcal)}`, sub: `/${targets.kcal}`, prev: prevAvgKcal, curr: avgKcal },
            { icon: Beef, label: i18n.weeklyReviewAvgProtein, value: `${Math.round(avgProtein)}g`, sub: `/${targets.protein}g`, prev: prevAvgProtein, curr: avgProtein },
            { icon: Moon, label: i18n.weeklyReviewAvgSleep, value: `${avgSleepH.toFixed(1)}h`, sub: `/${targets.sleepH}h`, prev: 0, curr: 0 },
            { icon: Dumbbell, label: i18n.weeklyReviewVolume, value: `${Math.round(totalVolume / 1000)}k`, sub: `${workoutCount} ${i18n.weeklyReviewSessions}`, prev: prevTotalVolume, curr: totalVolume },
            { icon: Activity, label: i18n.weeklyReviewReadiness, value: `${Math.round(avgReadiness)}`, sub: acwr ? `ACWR ${acwr}` : '—', prev: 0, curr: 0 },
          ].map((c, i) => (
            <motion.div key={i} variants={fadeUp} className="metric-card space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <c.icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{c.label}</span>
                </div>
                {c.prev > 0 && <DeltaBadge curr={c.curr} prev={c.prev} />}
              </div>
              <p className="text-xl font-mono font-bold">{c.value}</p>
              <p className="text-[10px] text-muted-foreground">{c.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Calories + Protein chart */}
        {daysWithData > 0 && (
          <motion.div variants={fadeUp} className="metric-card space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{i18n.weeklyReviewDailyNutrition}</h3>
            <ChartContainer config={chartConfig} className="h-[220px]">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 10% 14%)" />
                <XAxis dataKey="day" tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="kcal" tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="protein" orientation="right" tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ReferenceLine yAxisId="kcal" y={targets.kcal} stroke="hsl(25 95% 58% / 0.3)" strokeDasharray="4 4" />
                <Bar yAxisId="kcal" dataKey="kcal" fill="hsl(25 95% 58%)" radius={[4, 4, 0, 0]} opacity={0.8} />
                <Line yAxisId="protein" type="monotone" dataKey="protein" stroke="hsl(160 84% 39%)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(160 84% 39%)' }} />
              </ComposedChart>
            </ChartContainer>
            <div className="flex gap-4 justify-center text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-metric-orange" /> Calories</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary" /> Protein</span>
            </div>
          </motion.div>
        )}

        {/* Sleep + Readiness chart */}
        {daysWithData > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <motion.div variants={fadeUp} className="metric-card space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{i18n.weeklyReviewSleepChart}</h3>
              <ChartContainer config={chartConfig} className="h-[180px]">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 10% 14%)" />
                  <XAxis dataKey="day" tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} unit="h" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ReferenceLine y={targets.sleepH} stroke="hsl(265 90% 66% / 0.3)" strokeDasharray="4 4" />
                  <Bar dataKey="sleep_h" fill="hsl(265 90% 66%)" radius={[4, 4, 0, 0]} opacity={0.8} />
                </BarChart>
              </ChartContainer>
            </motion.div>

            <motion.div variants={fadeUp} className="metric-card space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Volume Load</h3>
              <ChartContainer config={chartConfig} className="h-[180px]">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 10% 14%)" />
                  <XAxis dataKey="day" tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="volume" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} opacity={0.8} />
                </BarChart>
              </ChartContainer>
            </motion.div>
          </div>
        )}

        {/* Readiness trend */}
        {daysWithData > 0 && (
          <motion.div variants={fadeUp} className="metric-card space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{i18n.weeklyReviewReadinessChart} Trend</h3>
            <ChartContainer config={chartConfig} className="h-[160px]">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="readGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(43 96% 56%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(43 96% 56%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 10% 14%)" />
                <XAxis dataKey="day" tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ReferenceLine y={75} stroke="hsl(160 84% 39% / 0.3)" strokeDasharray="4 4" />
                <ReferenceLine y={50} stroke="hsl(0 84% 60% / 0.3)" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="readiness" stroke="hsl(43 96% 56%)" strokeWidth={2} fill="url(#readGrad)" dot={{ r: 4, fill: 'hsl(43 96% 56%)' }} />
              </AreaChart>
            </ChartContainer>
          </motion.div>
        )}

        {/* Adaptive Training Recommendations */}
        {recommendations.length > 0 && (
          <motion.div variants={fadeUp} className="metric-card space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{i18n.weeklyReviewRecommendations}</h3>
            <div className="space-y-3">
              {recommendations.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-xl text-sm ${
                    r.type === 'warning' ? 'bg-destructive/10 border border-destructive/20' :
                    r.type === 'success' ? 'bg-primary/10 border border-primary/20' :
                    'bg-metric-blue/10 border border-metric-blue/20'
                  }`}
                >
                  {r.type === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  ) : r.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  ) : (
                    <Activity className="w-4 h-4 text-metric-blue shrink-0 mt-0.5" />
                  )}
                  <p className="text-secondary-foreground">{r.text}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {daysWithData === 0 && (
          <motion.div variants={fadeUp} className="metric-card text-center py-16">
            <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">{i18n.noData}</p>
          </motion.div>
        )}

        <div className="h-8" />
      </motion.main>
    </div>
  );
}
