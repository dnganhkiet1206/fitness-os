import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Moon, Sunrise, Coffee, Smartphone, TrendingUp, TrendingDown } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useSleepHistory } from '@/hooks/useProgressData';
import { useProfile } from '@/hooks/useTodayData';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, ResponsiveContainer } from 'recharts';
import { useAppSettings, t } from '@/hooks/useAppSettings';
import { getLocale } from '@/lib/i18n';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { ...spring, duration: 0.6 } },
};

export default function SleepInsights() {
  const navigate = useNavigate();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const locale = getLocale(lang);
  const { data: sleepLogs } = useSleepHistory(7);
  const { data: profile } = useProfile();
  const targetHours = Number(profile?.sleep_target_hours) || 8;

  const chartData = (sleepLogs ?? []).map(s => {
    const deep = s.deep_min ?? 0;
    const rem = s.rem_min ?? 0;
    const light = s.light_min ?? 0;
    const total = deep + rem + light;
    const wakeDate = new Date(s.waketime);
    return {
      day: wakeDate.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' }),
      total_h: +(total / 60).toFixed(1),
      deep_h: +(deep / 60).toFixed(1),
      rem_h: +(rem / 60).toFixed(1),
      light_h: +(light / 60).toFixed(1),
      quality: s.quality ?? 0,
      bedtime: new Date(s.bedtime).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false }),
      waketime: wakeDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false }),
      caffeine: s.caffeine_cutoff_time ? new Date(s.caffeine_cutoff_time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false }) : null,
      screen: s.screen_off_time ? new Date(s.screen_off_time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false }) : null,
    };
  });

  const avgTotal = chartData.length > 0 ? chartData.reduce((s, d) => s + d.total_h, 0) / chartData.length : 0;
  const avgQuality = chartData.length > 0 ? chartData.reduce((s, d) => s + d.quality, 0) / chartData.length : 0;
  const avgDeep = chartData.length > 0 ? chartData.reduce((s, d) => s + d.deep_h, 0) / chartData.length : 0;
  const avgRem = chartData.length > 0 ? chartData.reduce((s, d) => s + d.rem_h, 0) / chartData.length : 0;
  const sleepDebt = Math.max(0, targetHours * 7 - chartData.reduce((s, d) => s + d.total_h, 0));

  const insights: string[] = [];
  if (avgTotal < targetHours - 0.5) insights.push(`${lang === 'vi' ? 'Bạn ngủ trung bình' : 'You sleep on average'} ${avgTotal.toFixed(1)}h, ${lang === 'vi' ? 'thiếu' : 'short by'} ${(targetHours - avgTotal).toFixed(1)}h ${lang === 'vi' ? 'so với mục tiêu' : 'vs target'}.`);
  if (avgDeep < 1) insights.push(lang === 'vi' ? 'Deep sleep thấp (<1h). Hãy tránh rượu và caffeine trước giờ ngủ.' : 'Deep sleep is low (<1h). Avoid alcohol and caffeine before bed.');
  if (avgRem < 1.2) insights.push(lang === 'vi' ? 'REM sleep thấp. Cải thiện thời gian đi ngủ đều đặn.' : 'REM sleep is low. Try to maintain a consistent bedtime.');
  if (sleepDebt > 5) insights.push(`${lang === 'vi' ? 'Nợ giấc ngủ tuần' : 'Weekly sleep debt'}: ${sleepDebt.toFixed(1)}h. ${lang === 'vi' ? 'Cân nhắc ngủ bù cuối tuần.' : 'Consider catching up on weekends.'}`);
  if (avgQuality >= 7) insights.push(lang === 'vi' ? 'Chất lượng giấc ngủ tốt! Giữ vững thói quen.' : 'Sleep quality is good! Keep it up.');

  const chartConfig = {
    deep_h: { label: i18n.sleepDeep, color: 'hsl(265 90% 66%)' },
    rem_h: { label: 'REM', color: 'hsl(190 95% 50%)' },
    light_h: { label: 'Light', color: 'hsl(220 10% 40%)' },
    quality: { label: i18n.sleepAvgQuality, color: 'hsl(160 84% 39%)' },
  };

  return (
    <div className="bg-background">
      <PageHeader title={i18n.sleepTitle} />

      <motion.main
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
        className="max-w-4xl mx-auto px-4 py-5 space-y-5"
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: i18n.sleepAvg, value: `${avgTotal.toFixed(1)}h`, sub: `${i18n.target} ${targetHours}h`, icon: Moon, good: avgTotal >= targetHours - 0.5 },
            { label: i18n.sleepAvgQuality, value: `${avgQuality.toFixed(1)}/10`, sub: avgQuality >= 7 ? i18n.sleepGood : i18n.sleepNeedsImprovement, icon: TrendingUp, good: avgQuality >= 7 },
            { label: i18n.sleepAvgDeep, value: `${avgDeep.toFixed(1)}h`, sub: avgDeep >= 1.5 ? i18n.sleepGood : i18n.sleepLow, icon: Moon, good: avgDeep >= 1.5 },
            { label: i18n.sleepDebt, value: `${sleepDebt.toFixed(1)}h`, sub: sleepDebt < 3 ? i18n.sleepOk : i18n.sleepNeedCatchUp, icon: TrendingDown, good: sleepDebt < 3 },
          ].map((c, i) => (
            <motion.div key={i} variants={fadeUp} className="metric-card space-y-2">
              <div className="flex items-center gap-1.5">
                <c.icon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{c.label}</span>
              </div>
              <p className={`text-xl font-mono font-bold ${c.good ? 'text-foreground' : 'text-destructive'}`}>{c.value}</p>
              <p className="text-[10px] text-muted-foreground">{c.sub}</p>
            </motion.div>
          ))}
        </div>

        {chartData.length > 0 && (
          <motion.div variants={fadeUp} className="metric-card space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{i18n.sleepStages}</h3>
            <ChartContainer config={chartConfig} className="h-[200px] sm:h-[250px]">
              <BarChart data={chartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 10% 14%)" />
                <XAxis dataKey="day" tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} unit="h" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="deep_h" stackId="sleep" fill="hsl(265 90% 66%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="rem_h" stackId="sleep" fill="hsl(190 95% 50%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="light_h" stackId="sleep" fill="hsl(220 10% 30%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
            <div className="flex gap-4 justify-center text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-metric-purple" /> {i18n.sleepDeep}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-metric-cyan" /> REM</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: 'hsl(220 10% 30%)' }} /> Light</span>
            </div>
          </motion.div>
        )}

        {chartData.length > 0 && (
          <motion.div variants={fadeUp} className="metric-card space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{i18n.sleepQualityTrend}</h3>
            <ChartContainer config={chartConfig} className="h-[150px] sm:h-[180px]">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 10% 14%)" />
                <XAxis dataKey="day" tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 10]} tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="quality" stroke="hsl(160 84% 39%)" strokeWidth={2} dot={{ r: 4, fill: 'hsl(160 84% 39%)' }} />
              </LineChart>
            </ChartContainer>
          </motion.div>
        )}

        {chartData.some(d => d.caffeine || d.screen) && (
          <motion.div variants={fadeUp} className="metric-card space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{i18n.sleepHabits}</h3>
            <div className="space-y-2">
              {chartData.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs border-b border-border/30 pb-2">
                  <span className="text-muted-foreground w-16">{d.day}</span>
                  {d.caffeine && (
                    <span className="flex items-center gap-1 text-metric-orange">
                      <Coffee className="w-3 h-3" /> Caffeine cutoff: {d.caffeine}
                    </span>
                  )}
                  {d.screen && (
                    <span className="flex items-center gap-1 text-metric-blue">
                      <Smartphone className="w-3 h-3" /> Screen off: {d.screen}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Moon className="w-3 h-3" /> {d.bedtime}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Sunrise className="w-3 h-3" /> {d.waketime}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {insights.length > 0 && (
          <motion.div variants={fadeUp} className="metric-card space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{i18n.sleepInsights}</h3>
            <ul className="space-y-2">
              {insights.map((ins, i) => (
                <li key={i} className="text-sm text-secondary-foreground flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  {ins}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {chartData.length === 0 && (
          <motion.div variants={fadeUp} className="metric-card text-center py-12">
            <Moon className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{i18n.sleepNoDataMsg}</p>
          </motion.div>
        )}

        <div className="h-8" />
      </motion.main>
    </div>
  );
}
