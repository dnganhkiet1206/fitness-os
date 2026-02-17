import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ReadinessTrendProps {
  trend: { day: string; score: number; status: 'green' | 'yellow' | 'red' }[];
}

const spring = { type: 'spring' as const, stiffness: 200, damping: 24 };

const statusColor = {
  green: 'hsl(160, 70%, 42%)',
  yellow: 'hsl(38, 92%, 50%)',
  red: 'hsl(0, 72%, 51%)',
};

const statusBg = {
  green: 'hsl(160 70% 42% / 0.12)',
  yellow: 'hsl(38 92% 50% / 0.12)',
  red: 'hsl(0 72% 51% / 0.12)',
};

const ReadinessTrend = ({ trend }: ReadinessTrendProps) => {
  const { lang } = useAppSettings();
  const T = t(lang);
  const maxHeight = 56;

  const stats = useMemo(() => {
    if (trend.length === 0) return null;
    const scores = trend.map(d => d.score);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const best = Math.max(...scores);
    const worst = Math.min(...scores);
    // trend direction: compare last 3 vs first 3
    const recent = scores.slice(-3);
    const earlier = scores.slice(0, 3);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
    const diff = recentAvg - earlierAvg;
    const direction = diff > 3 ? 'up' : diff < -3 ? 'down' : 'stable';
    return { avg, best, worst, direction, diff: Math.round(Math.abs(diff)) };
  }, [trend]);

  const avgStatus = stats ? (stats.avg >= 75 ? 'green' : stats.avg >= 50 ? 'yellow' : 'red') : 'yellow';

  return (
    <div className="metric-card card-shimmer space-y-5 relative overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between relative">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {T.dcReadinessTrend}
          </h3>
          <p className="text-[10px] text-muted-foreground/60 mt-1 leading-relaxed max-w-[200px]">
            {T.dcReadinessTrendDesc}
          </p>
        </div>
        {stats && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
            style={{ background: statusBg[avgStatus] }}
          >
            {stats.direction === 'up' ? (
              <TrendingUp size={13} style={{ color: statusColor.green }} />
            ) : stats.direction === 'down' ? (
              <TrendingDown size={13} style={{ color: statusColor.red }} />
            ) : (
              <Minus size={13} style={{ color: statusColor.yellow }} />
            )}
            <span className="text-xs font-semibold font-mono" style={{ color: statusColor[avgStatus] }}>
              {stats.avg}
            </span>
          </motion.div>
        )}
      </div>

      {/* Bar chart */}
      <div className="flex items-end justify-between gap-1.5 h-20 relative">
        {trend.map((d, i) => {
          const h = Math.max(4, (d.score / 100) * maxHeight);
          const isToday = i === trend.length - 1;
          const color = statusColor[d.status];

          return (
            <motion.div
              key={d.day}
              className="flex flex-col items-center gap-1 flex-1"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05, ...spring }}
            >
              {/* Score label */}
              <span className={`text-[10px] font-mono tabular-nums ${isToday ? 'font-bold text-foreground' : 'text-muted-foreground/70'}`}>
                {d.score}
              </span>

              {/* Bar */}
              <div className="relative w-full flex justify-center">
                <motion.div
                  className="rounded-lg relative overflow-hidden"
                  style={{
                    width: isToday ? '100%' : '80%',
                    opacity: isToday ? 1 : 0.55,
                  }}
                  initial={{ height: 0 }}
                  animate={{ height: h }}
                  transition={{ ...spring, delay: 0.15 + i * 0.05 }}
                >
                  <div className="absolute inset-0 rounded-lg" style={{ background: color }} />
                  {isToday && (
                    <div className="absolute inset-0 rounded-lg" style={{ boxShadow: `0 0 10px ${color.replace(')', ' / 0.35)')}` }} />
                  )}
                </motion.div>
              </div>

              {/* Day label */}
              <span className={`text-[9px] tracking-wide ${isToday ? 'text-foreground font-bold' : 'text-muted-foreground/60'}`}>
                {d.day}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Stats row */}
      {stats && (
        <motion.div
          className="grid grid-cols-3 gap-2 relative"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          {[
            { label: T.dcReadinessAvg, value: stats.avg, status: avgStatus },
            { label: T.dcReadinessBest, value: stats.best, status: 'green' as const },
            { label: T.dcReadinessWorst, value: stats.worst, status: stats.worst >= 50 ? 'yellow' as const : 'red' as const },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-1 py-2 rounded-xl bg-secondary/15 border border-border/10">
              <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60">{item.label}</span>
              <span className="text-base font-mono font-semibold" style={{ color: statusColor[item.status] }}>
                {item.value}
              </span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Legend */}
      <motion.div
        className="flex items-center justify-center gap-3 relative"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.4 }}
      >
        {[
          { color: statusColor.green, label: `75+ ${T.dcReadinessTrain}` },
          { color: statusColor.yellow, label: `50–74 ${T.dcReadinessModerate}` },
          { color: statusColor.red, label: `<50 ${T.dcReadinessRecover}` },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: l.color }} />
            <span className="text-[8px] text-muted-foreground/50">{l.label}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
};

export default ReadinessTrend;
