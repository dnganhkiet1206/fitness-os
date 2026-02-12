import { motion } from 'framer-motion';
import { CalendarCheck, CheckCircle2, Clock } from 'lucide-react';

interface Props {
  planned: number;
  done: number;
  todayWorkoutNames: string[];
}

export default function WorkoutStatus({ planned, done, todayWorkoutNames }: Props) {
  const allDone = planned > 0 && done >= planned;

  return (
    <div className="metric-card space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
        <CalendarCheck className="w-3.5 h-3.5" /> Buổi Tập Hôm Nay
      </h3>

      <div className="flex items-center gap-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-mono font-bold">{done}</span>
          <span className="text-sm text-muted-foreground">/ {planned || '–'}</span>
        </div>

        {allDone ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="flex items-center gap-1.5 text-xs text-readiness-green"
          >
            <CheckCircle2 className="w-4 h-4" /> Hoàn thành!
          </motion.div>
        ) : done === 0 && planned > 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" /> Chưa tập
          </div>
        ) : null}
      </div>

      {todayWorkoutNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {todayWorkoutNames.map((name, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
