import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Target, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Flame } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useAppSettings, t } from '@/hooks/useAppSettings';
import { getLocale } from '@/lib/i18n';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

function getWeekAvg(logs: { date: string; weight_kg: number }[], weekStart: string, weekEnd: string) {
  const week = logs.filter(l => l.date >= weekStart && l.date <= weekEnd);
  if (week.length === 0) return null;
  return week.reduce((s, l) => s + l.weight_kg, 0) / week.length;
}

function getWeekDates(weeksAgo: number) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - start.getDay() + 1 - weeksAgo * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

export default function SmartGoals() {
  const { user, loading } = useAuth();
  const { data: profile } = useProfile();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const locale = getLocale(lang);

  const { data: weightLogs } = useQuery({
    queryKey: ['weight-logs-28d', user?.id],
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 35);
      const { data } = await supabase
        .from('weight_logs')
        .select('date, weight_kg')
        .eq('user_id', user!.id)
        .gte('date', from.toISOString().split('T')[0])
        .order('date', { ascending: true });
      return (data ?? []).map(d => ({ ...d, weight_kg: Number(d.weight_kg) }));
    },
    enabled: !!user,
  });

  const { data: dailyLogs } = useQuery({
    queryKey: ['daily-logs-14d', user?.id],
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 14);
      const { data } = await supabase
        .from('daily_logs')
        .select('date, kcal, protein_g')
        .eq('user_id', user!.id)
        .gte('date', from.toISOString().split('T')[0])
        .order('date', { ascending: true });
      return data ?? [];
    },
    enabled: !!user,
  });

  const analysis = useMemo(() => {
    if (!weightLogs || weightLogs.length < 3 || !profile) return null;

    const goal = profile.goal || 'maintain';
    const currentCal = profile.tdee_target_kcal ?? 2200;

    const weekAvgs: { week: string; avg: number | null }[] = [];
    for (let i = 3; i >= 0; i--) {
      const { start, end } = getWeekDates(i);
      weekAvgs.push({ week: `W${4 - i}`, avg: getWeekAvg(weightLogs, start, end) });
    }

    const validWeeks = weekAvgs.filter(w => w.avg !== null) as { week: string; avg: number }[];
    if (validWeeks.length < 2) return null;

    const last2 = validWeeks.slice(-2);
    const weeklyChange = last2[1].avg - last2[0].avg;

    const targetMin = goal === 'bulk' ? 0.25 : goal === 'cut' ? -0.75 : -0.1;
    const targetMax = goal === 'bulk' ? 0.5 : goal === 'cut' ? -0.25 : 0.1;

    const onTrack = weeklyChange >= targetMin && weeklyChange <= targetMax;

    let twoWeekDeviation = false;
    let calorieAdjustment = 0;
    if (validWeeks.length >= 3) {
      const prev2 = validWeeks.slice(-3, -1);
      const prevChange = prev2[1].avg - prev2[0].avg;
      const bothOff = (goal === 'bulk' && weeklyChange < targetMin && prevChange < targetMin) ||
                      (goal === 'cut' && weeklyChange > targetMax && prevChange > targetMax);
      if (bothOff) {
        twoWeekDeviation = true;
        if (goal === 'bulk') calorieAdjustment = weeklyChange < 0 ? 250 : 150;
        if (goal === 'cut') calorieAdjustment = weeklyChange > 0 ? -250 : -150;
      }
    }

    return { weekAvgs: validWeeks, weeklyChange, onTrack, twoWeekDeviation, calorieAdjustment, currentCal, goal, targetMin, targetMax };
  }, [weightLogs, profile]);

  const proteinAnalysis = useMemo(() => {
    if (!dailyLogs || dailyLogs.length === 0 || !profile) return null;
    const target = profile.macro_protein_g ?? 150;
    const mealsPerDay = 4;
    const perMeal = Math.round(target / mealsPerDay);
    const lowDays = dailyLogs.filter(d => Number(d.protein_g) < target * 0.7);
    return { target, perMeal, mealsPerDay, lowDays, totalDays: dailyLogs.length };
  }, [dailyLogs, profile]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const goalLabel: Record<string, string> = {
    bulk: i18n.goalBulk, cut: i18n.goalCut, maintain: i18n.goalMaintain,
    recomp: i18n.goalRecomp, strength: i18n.goalStrength, endurance: i18n.goalEndurance,
  };

  const mealLabels = [i18n.mealBreakfast, i18n.mealLunch, i18n.mealSnack, i18n.mealDinner];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Target className="w-6 h-6 text-primary" /> {i18n.smartGoalsTitle}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{i18n.smartGoalsSubtitle}</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}>
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>{i18n.smartGoalsWeightTrend}</span>
              <span className="text-xs font-normal px-2 py-1 rounded-full bg-primary/10 text-primary">{goalLabel[profile?.goal || 'maintain']}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analysis ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={analysis.weekAvgs}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 10% 14%)" vertical={false} />
                    <XAxis dataKey="week" tick={{ fill: 'hsl(220 8% 46%)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'hsl(220 8% 46%)', fontSize: 12 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} unit="kg" />
                    <Area type="monotone" dataKey="avg" stroke="hsl(160 84% 39%)" fill="hsl(160 84% 39% / 0.15)" strokeWidth={2} dot={{ r: 4, fill: 'hsl(160 84% 39%)' }} />
                  </AreaChart>
                </ResponsiveContainer>

                <div className={`mt-4 rounded-xl p-4 flex items-start gap-3 ${analysis.onTrack ? 'bg-primary/10' : 'bg-destructive/10'}`}>
                  {analysis.onTrack ? (
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm font-semibold">
                      {analysis.weeklyChange > 0 ? '+' : ''}{analysis.weeklyChange.toFixed(2)} kg/{lang === 'vi' ? 'tuần' : 'week'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {i18n.target}: {analysis.targetMin > 0 ? '+' : ''}{analysis.targetMin} — {analysis.targetMax > 0 ? '+' : ''}{analysis.targetMax} kg/{lang === 'vi' ? 'tuần' : 'week'}
                    </p>
                    {analysis.onTrack ? (
                      <p className="text-xs text-primary mt-1">{i18n.smartGoalsOnTrack}</p>
                    ) : (
                      <p className="text-xs text-destructive mt-1">{i18n.smartGoalsOffTrack}</p>
                    )}
                  </div>
                </div>

                {analysis.twoWeekDeviation && analysis.calorieAdjustment !== 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 rounded-xl p-4 bg-[hsl(var(--readiness-yellow))]/10 border border-[hsl(var(--readiness-yellow))]/20"
                  >
                    <div className="flex items-start gap-3">
                      <Flame className="w-5 h-5 text-[hsl(var(--readiness-yellow))] mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold">{i18n.smartGoalsCalorieSuggestion}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          <strong className="text-foreground">{analysis.calorieAdjustment > 0 ? '+' : ''}{analysis.calorieAdjustment} kcal/{lang === 'vi' ? 'ngày' : 'day'}</strong>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {lang === 'vi' ? 'Hiện tại' : 'Current'}: {analysis.currentCal} kcal → {lang === 'vi' ? 'Mới' : 'New'}: {analysis.currentCal + analysis.calorieAdjustment} kcal
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </>
            ) : (
              <div className="text-center py-12 space-y-2">
                <Target className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">{i18n.smartGoalsNeedData}</p>
                <p className="text-xs text-muted-foreground">{i18n.smartGoalsNeedDataMsg}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }}>
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{i18n.smartGoalsProteinCoach}</CardTitle>
          </CardHeader>
          <CardContent>
            {proteinAnalysis ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-secondary/30 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{proteinAnalysis.target}g</p>
                    <p className="text-xs text-muted-foreground">{i18n.smartGoalsPerDay}</p>
                  </div>
                  <div className="bg-secondary/30 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-[hsl(var(--metric-blue))]">{proteinAnalysis.perMeal}g</p>
                    <p className="text-xs text-muted-foreground">{i18n.smartGoalsPerMeal} ({proteinAnalysis.mealsPerDay})</p>
                  </div>
                  <div className="bg-secondary/30 rounded-xl p-3 text-center">
                    <p className={`text-2xl font-bold ${proteinAnalysis.lowDays.length > 0 ? 'text-destructive' : 'text-primary'}`}>
                      {proteinAnalysis.lowDays.length}
                    </p>
                    <p className="text-xs text-muted-foreground">{i18n.smartGoalsLowDays}</p>
                  </div>
                </div>

                {proteinAnalysis.lowDays.length > 0 && (
                  <div className="rounded-xl p-3 bg-destructive/10 border border-destructive/20">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                      {proteinAnalysis.lowDays.length} {i18n.smartGoalsLowDays}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {proteinAnalysis.lowDays.map(d => new Date(d.date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })).join(', ')}
                    </p>
                  </div>
                )}

                <div className="bg-secondary/20 rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{i18n.smartGoalsProteinSplit}</p>
                  <div className="space-y-1.5">
                    {mealLabels.map((meal, i) => (
                      <div key={meal} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{meal}</span>
                        <span className="font-mono font-semibold">{proteinAnalysis.perMeal}g</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 space-y-2">
                <p className="text-sm text-muted-foreground">{i18n.smartGoalsNoNutritionData}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
