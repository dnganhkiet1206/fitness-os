import { motion } from 'framer-motion';
import type { SleepLog } from '@/lib/types';
import { Moon, Sunrise } from 'lucide-react';

interface SleepCardProps {
  sleep: SleepLog;
  targetHours: number;
}

const SleepCard = ({ sleep, targetHours }: SleepCardProps) => {
  const totalMin = sleep.sleepStages
    ? sleep.sleepStages.light_min + sleep.sleepStages.deep_min + sleep.sleepStages.rem_min
    : 0;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const pct = Math.min((totalMin / (targetHours * 60)) * 100, 100);

  const stages = sleep.sleepStages ? [
    { label: 'Deep', min: sleep.sleepStages.deep_min, color: 'bg-metric-purple', pct: (sleep.sleepStages.deep_min / totalMin) * 100 },
    { label: 'REM', min: sleep.sleepStages.rem_min, color: 'bg-metric-cyan', pct: (sleep.sleepStages.rem_min / totalMin) * 100 },
    { label: 'Light', min: sleep.sleepStages.light_min, color: 'bg-secondary-foreground/30', pct: (sleep.sleepStages.light_min / totalMin) * 100 },
  ] : [];

  const bedtime = new Date(sleep.bedtime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const waketime = new Date(sleep.waketime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="metric-card space-y-5 relative">
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Giấc Ngủ</h3>

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-mono font-bold">{hours}h {mins}m</span>
        <span className="text-xs text-muted-foreground">/ mục tiêu {targetHours}h</span>
      </div>

      {/* Progress bar */}
      <div className="progress-bar">
        <motion.div
          className="progress-fill bg-metric-purple"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        />
      </div>

      {/* Sleep stages */}
      {stages.length > 0 && (
        <>
          <div className="flex h-3 rounded-full overflow-hidden bg-secondary/30">
            {stages.map((s, i) => (
              <motion.div
                key={s.label}
                className={s.color}
                initial={{ width: 0 }}
                animate={{ width: `${s.pct}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.3 + i * 0.1 }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            {stages.map(s => (
              <span key={s.label}>{s.label} · {Math.floor(s.min / 60)}h{s.min % 60}m</span>
            ))}
          </div>
        </>
      )}

      {/* Times + quality */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Moon className="w-3.5 h-3.5" />
          <span>{bedtime}</span>
        </div>
        <div className="text-xs font-mono text-muted-foreground">
          Chất lượng: <span className="text-foreground font-semibold">{sleep.quality_1_10}/10</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sunrise className="w-3.5 h-3.5" />
          <span>{waketime}</span>
        </div>
      </div>
    </div>
  );
};

export default SleepCard;
