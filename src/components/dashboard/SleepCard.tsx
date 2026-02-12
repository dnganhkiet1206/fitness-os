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
    <div className="metric-card space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Giấc Ngủ</h3>

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-mono font-bold">{hours}h {mins}m</span>
        <span className="text-xs text-muted-foreground">/ mục tiêu {targetHours}h</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className="h-full bg-metric-purple rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>

      {/* Sleep stages */}
      {stages.length > 0 && (
        <>
          <div className="flex h-3 rounded-full overflow-hidden">
            {stages.map(s => (
              <div key={s.label} className={`${s.color} transition-all duration-700`} style={{ width: `${s.pct}%` }} />
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
      <div className="flex items-center justify-between pt-1 border-t border-border">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Moon className="w-3 h-3" />
          <span>{bedtime}</span>
        </div>
        <div className="text-xs font-mono text-muted-foreground">
          Chất lượng: {sleep.quality_1_10}/10
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Sunrise className="w-3 h-3" />
          <span>{waketime}</span>
        </div>
      </div>
    </div>
  );
};

export default SleepCard;
