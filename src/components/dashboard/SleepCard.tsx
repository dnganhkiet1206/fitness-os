import { motion } from 'framer-motion';
import type { SleepLog } from '@/lib/types';
import { Moon, Sunrise, Star } from 'lucide-react';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';

interface SleepCardProps {
  sleep: SleepLog;
  targetHours: number;
}

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };

const SleepCard = ({ sleep, targetHours }: SleepCardProps) => {
  const { lang } = useAppSettings();
  const T = t(lang);

  const totalMin = sleep.sleepStages
    ? sleep.sleepStages.light_min + sleep.sleepStages.deep_min + sleep.sleepStages.rem_min
    : 0;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const pct = Math.min((totalMin / (targetHours * 60)) * 100, 100);

  const stages = sleep.sleepStages ? [
    { label: 'Deep', min: sleep.sleepStages.deep_min, color: 'hsl(265, 90%, 66%)', pct: (sleep.sleepStages.deep_min / totalMin) * 100 },
    { label: 'REM', min: sleep.sleepStages.rem_min, color: 'hsl(190, 95%, 50%)', pct: (sleep.sleepStages.rem_min / totalMin) * 100 },
    { label: 'Light', min: sleep.sleepStages.light_min, color: 'hsl(220, 10%, 35%)', pct: (sleep.sleepStages.light_min / totalMin) * 100 },
  ] : [];

  const bedtime = new Date(sleep.bedtime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const waketime = new Date(sleep.waketime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const sleepOffset = circumference - (pct / 100) * circumference;

  return (
    <div className="metric-card card-shimmer space-y-5 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ background: 'radial-gradient(ellipse at top right, hsl(265 90% 66%), transparent 60%)' }} />

      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground relative">{T.dcSleepTitle}</h3>

      <div className="relative flex items-center gap-6">
        <div className="relative shrink-0">
          <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(225 10% 12%)" strokeWidth="6" />
            <defs>
              <linearGradient id="sleep-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(265, 90%, 66%)" />
                <stop offset="100%" stopColor="hsl(190, 95%, 50%)" />
              </linearGradient>
              <filter id="sleep-glow">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feFlood floodColor="hsl(265 90% 66% / 0.35)" result="color" />
                <feComposite in2="blur" operator="in" />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <motion.circle
              cx="50" cy="50" r={radius}
              fill="none"
              stroke="url(#sleep-grad)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              filter="url(#sleep-glow)"
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: sleepOffset }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Moon className="w-4 h-4 text-metric-purple mb-0.5" />
            <motion.span
              className="text-lg font-mono font-bold"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...spring, delay: 0.4 }}
            >
              {hours}h{mins}m
            </motion.span>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-xs text-muted-foreground">{T.dcSleepTarget}: <span className="font-mono text-foreground">{targetHours}h</span></p>
          <div className="flex items-center gap-1.5">
            <Star className="w-3 h-3 text-readiness-yellow" />
            <span className="text-xs text-muted-foreground">{T.dcSleepQuality}:</span>
            <span className="text-sm font-mono font-bold text-foreground">{sleep.quality_1_10}/10</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            <div className="flex items-center gap-1">
              <Moon className="w-3 h-3" />
              <span className="font-mono">{bedtime}</span>
            </div>
            <span>→</span>
            <div className="flex items-center gap-1">
              <Sunrise className="w-3 h-3" />
              <span className="font-mono">{waketime}</span>
            </div>
          </div>
        </div>
      </div>

      {stages.length > 0 && (
        <div className="space-y-3">
          <div className="flex h-3 rounded-full overflow-hidden bg-secondary/30">
            {stages.map((s, i) => (
              <motion.div
                key={s.label}
                style={{ backgroundColor: s.color }}
                initial={{ width: 0 }}
                animate={{ width: `${s.pct}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.4 + i * 0.1 }}
              />
            ))}
          </div>
          <div className="flex justify-between">
            {stages.map(s => (
              <div key={s.label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-[10px] text-muted-foreground">{s.label} · {Math.floor(s.min / 60)}h{s.min % 60}m</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SleepCard;
