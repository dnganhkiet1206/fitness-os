import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Moon, Sunrise, Coffee, Smartphone, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSleepHistory } from '@/hooks/useProgressData';
import { useProfile } from '@/hooks/useTodayData';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, ResponsiveContainer } from 'recharts';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { ...spring, duration: 0.6 } },
};

export default function SleepInsights() {
  const navigate = useNavigate();
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
      day: wakeDate.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric' }),
      total_h: +(total / 60).toFixed(1),
      deep_h: +(deep / 60).toFixed(1),
      rem_h: +(rem / 60).toFixed(1),
      light_h: +(light / 60).toFixed(1),
      quality: s.quality ?? 0,
      bedtime: new Date(s.bedtime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      waketime: wakeDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      caffeine: s.caffeine_cutoff_time ? new Date(s.caffeine_cutoff_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }) : null,
      screen: s.screen_off_time ? new Date(s.screen_off_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }) : null,
    };
  });

  const avgTotal = chartData.length > 0 ? chartData.reduce((s, d) => s + d.total_h, 0) / chartData.length : 0;
  const avgQuality = chartData.length > 0 ? chartData.reduce((s, d) => s + d.quality, 0) / chartData.length : 0;
  const avgDeep = chartData.length > 0 ? chartData.reduce((s, d) => s + d.deep_h, 0) / chartData.length : 0;
  const avgRem = chartData.length > 0 ? chartData.reduce((s, d) => s + d.rem_h, 0) / chartData.length : 0;
  const sleepDebt = Math.max(0, targetHours * 7 - chartData.reduce((s, d) => s + d.total_h, 0));

  const insights: string[] = [];
  if (avgTotal < targetHours - 0.5) insights.push(`Bạn ngủ trung bình ${avgTotal.toFixed(1)}h, thiếu ${(targetHours - avgTotal).toFixed(1)}h so với mục tiêu.`);
  if (avgDeep < 1) insights.push('Deep sleep thấp (<1h). Hãy tránh rượu và caffeine trước giờ ngủ.');
  if (avgRem < 1.2) insights.push('REM sleep thấp. Cải thiện thời gian đi ngủ đều đặn.');
  if (sleepDebt > 5) insights.push(`Nợ giấc ngủ tuần: ${sleepDebt.toFixed(1)}h. Cân nhắc ngủ bù cuối tuần.`);
  if (avgQuality >= 7) insights.push('Chất lượng giấc ngủ tốt! Giữ vững thói quen.');

  const chartConfig = {
    deep_h: { label: 'Deep', color: 'hsl(265 90% 66%)' },
    rem_h: { label: 'REM', color: 'hsl(190 95% 50%)' },
    light_h: { label: 'Light', color: 'hsl(220 10% 40%)' },
    quality: { label: 'Chất lượng', color: 'hsl(160 84% 39%)' },
  };

  return (
    <div className="min-h-screen bg-background">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 border-b border-border/50"
        style={{ background: 'hsl(225 15% 6% / 0.7)', backdropFilter: 'blur(24px) saturate(1.5)' }}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="rounded-xl">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-lg font-bold">Giấc Ngủ — 7 Ngày</h1>
        </div>
      </motion.header>

      <motion.main
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
        className="max-w-4xl mx-auto px-4 py-8 space-y-6"
      >
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'TB Giấc ngủ', value: `${avgTotal.toFixed(1)}h`, sub: `Mục tiêu ${targetHours}h`, icon: Moon, good: avgTotal >= targetHours - 0.5 },
            { label: 'TB Chất lượng', value: `${avgQuality.toFixed(1)}/10`, sub: avgQuality >= 7 ? 'Tốt' : 'Cần cải thiện', icon: TrendingUp, good: avgQuality >= 7 },
            { label: 'TB Deep', value: `${avgDeep.toFixed(1)}h`, sub: avgDeep >= 1.5 ? 'Tốt' : 'Thấp', icon: Moon, good: avgDeep >= 1.5 },
            { label: 'Nợ ngủ tuần', value: `${sleepDebt.toFixed(1)}h`, sub: sleepDebt < 3 ? 'Ổn' : 'Cần bù', icon: TrendingDown, good: sleepDebt < 3 },
          ].map((c, i) => (
            <motion.div key={i} variants={fadeUp} className="metric-card space-y-2">
              <div className="flex items-center gap-1.5">
                <c.icon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{c.label}</span>
              </div>
              <p className={`text-2xl font-mono font-bold ${c.good ? 'text-foreground' : 'text-destructive'}`}>{c.value}</p>
              <p className="text-[10px] text-muted-foreground">{c.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Sleep stages chart */}
        {chartData.length > 0 && (
          <motion.div variants={fadeUp} className="metric-card space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Giai Đoạn Giấc Ngủ</h3>
            <ChartContainer config={chartConfig} className="h-[250px]">
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
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-metric-purple" /> Deep</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-metric-cyan" /> REM</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: 'hsl(220 10% 30%)' }} /> Light</span>
            </div>
          </motion.div>
        )}

        {/* Quality trend */}
        {chartData.length > 0 && (
          <motion.div variants={fadeUp} className="metric-card space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Xu Hướng Chất Lượng</h3>
            <ChartContainer config={chartConfig} className="h-[180px]">
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

        {/* Caffeine & Screen habits */}
        {chartData.some(d => d.caffeine || d.screen) && (
          <motion.div variants={fadeUp} className="metric-card space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Thói Quen</h3>
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

        {/* Insights */}
        {insights.length > 0 && (
          <motion.div variants={fadeUp} className="metric-card space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">💡 Nhận Xét</h3>
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
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu giấc ngủ. Hãy ghi log giấc ngủ từ dashboard.</p>
          </motion.div>
        )}

        <div className="h-8" />
      </motion.main>
    </div>
  );
}
