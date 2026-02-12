import { motion } from 'framer-motion';
import { CalendarCheck, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { useAppSettings, t } from '@/hooks/useAppSettings';

interface Props {
  planned: number;
  done: number;
  todayWorkoutNames: string[];
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 25 };

export default function WorkoutStatus({ planned, done, todayWorkoutNames }: Props) {
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const allDone = planned > 0 && done >= planned;
  const pct = planned > 0 ? Math.min((done / planned) * 100, 100) : 0;

  return (
    <div className="metric-card card-shimmer space-y-3 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at center, hsl(120 100% 45%), transparent 60%)' }} />

      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 relative">
        <CalendarCheck className="w-3.5 h-3.5" /> {i18n.workoutStatusTitle}
      </h3>

      <div className="flex items-center gap-4 relative">
        <div className="flex items-baseline gap-1.5">
          <motion.span
            className="text-3xl font-mono font-bold"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring}
          >
            {done}
          </motion.span>
          <span className="text-sm text-muted-foreground">/ {planned || '–'}</span>
        </div>

        {allDone ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="flex items-center gap-1.5 text-xs text-readiness-green font-semibold px-2.5 py-1 rounded-full bg-readiness-green/10 border border-readiness-green/20"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <Sparkles className="w-3 h-3" />
            {i18n.workoutStatusDone}
          </motion.div>
        ) : done === 0 && planned > 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" /> {i18n.workoutStatusNotYet}
          </div>
        ) : null}
      </div>

      {planned > 0 && (
        <div className="h-1.5 rounded-full bg-secondary/30 overflow-hidden relative">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-[hsl(120,100%,45%)]"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      )}

      {todayWorkoutNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5 relative">
          {todayWorkoutNames.map((name, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...spring, delay: i * 0.05 }}
              className="text-[10px] px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium"
            >
              {name}
            </motion.span>
          ))}
        </div>
      )}
    </div>
  );
}
